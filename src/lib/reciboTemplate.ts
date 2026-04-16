// src/lib/reciboTemplate.ts
//
// Geração de Recibo de Reembolso a partir de um template .xlsx por empresa.
// O template fica em /public/<reciboTemplatePath> e usa placeholders:
//   {{var}}                          → substituição simples
//   {{#cond}} ... {{/cond}}          → bloco; linhas entre as tags são removidas
//                                      se cond for falsa (ou se cond for verdadeira,
//                                      as próprias linhas das tags são apagadas).
//
// O preenchimento é feito client-side via exceljs, preservando a formatação do
// arquivo original (a usuária pode editar o .xlsx fora do sistema). A conversão
// para PDF é delegada ao endpoint /api/recibo/pdf (LibreOffice headless).

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import type { OrdemDeServico, Cliente, Veiculo } from '../types';
import type { EmpresaParceira } from '../types/empresa';
import type { FinanceCharge } from '../types/finance';

export interface ReciboContext {
    numeroOS: string;
    dataEmissao: string;          // dd/mm/aaaa
    numeroRecibo: string;
    clienteNome: string;
    clienteCpfCnpj: string;
    placa: string;
    chassi: string;
    modelo: string;
    empresaNome: string;
    valorPlaca: number;
    valorVistoria: number;
    valorTotal: number;
    valorPlacaFmt: string;        // BRL "R$ 1.234,56"
    valorVistoriaFmt: string;
    valorTotalFmt: string;
    valorPorExtenso: string;      // "Mil duzentos e trinta e quatro reais e cinquenta e seis centavos"
    vistoriaLocal: string;
    temPlaca: boolean;
    temVistoria: boolean;
    observacao: string;
}

// ── Formatadores ─────────────────────────────────────────────────────────────

function formatBRL(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso?: string): string {
    if (!iso) return new Date().toLocaleDateString('pt-BR');
    const d = new Date(iso);
    return isNaN(d.getTime()) ? new Date().toLocaleDateString('pt-BR') : d.toLocaleDateString('pt-BR');
}

// Conversor simples de valor para extenso em PT-BR (até bilhões), com centavos.
const UNI = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function porExtensoSub1000(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100);
    const r = n % 100;
    const partes: string[] = [];
    if (c) partes.push(CENTENAS[c]!);
    if (r) {
        if (r < 10) partes.push(UNI[r]!);
        else if (r < 20) partes.push(DEZ_A_DEZENOVE[r - 10]!);
        else {
            const d = Math.floor(r / 10);
            const u = r % 10;
            partes.push(u ? `${DEZENAS[d]} e ${UNI[u]}` : DEZENAS[d]!);
        }
    }
    return partes.join(' e ');
}

export function porExtenso(valor: number): string {
    const reais = Math.floor(valor);
    const centavos = Math.round((valor - reais) * 100);

    const grupos = [
        { v: Math.floor(reais / 1_000_000_000) % 1000, sing: 'bilhão', plur: 'bilhões' },
        { v: Math.floor(reais / 1_000_000) % 1000, sing: 'milhão', plur: 'milhões' },
        { v: Math.floor(reais / 1000) % 1000, sing: 'mil', plur: 'mil' },
        { v: reais % 1000, sing: '', plur: '' },
    ];

    let txt = '';
    for (let i = 0; i < grupos.length; i++) {
        const g = grupos[i]!;
        if (g.v === 0) continue;
        const sub = g.v === 1 && g.sing === 'mil' ? 'mil' : porExtensoSub1000(g.v) + (g.sing ? ' ' + (g.v === 1 ? g.sing : g.plur) : '');
        if (txt) txt += g.v < 100 || g.v % 100 === 0 ? ' e ' : ', ';
        txt += sub;
    }

    if (!txt) txt = 'zero';
    txt += reais === 1 ? ' real' : ' reais';

    if (centavos > 0) {
        const cTxt = porExtensoSub1000(centavos);
        txt += ` e ${cTxt} ${centavos === 1 ? 'centavo' : 'centavos'}`;
    }

    return txt.charAt(0).toUpperCase() + txt.slice(1);
}

// ── Builder de contexto ──────────────────────────────────────────────────────

export function buildReciboContext(
    os: OrdemDeServico,
    veiculo: Veiculo | null,
    cliente: Cliente | null,
    empresa: EmpresaParceira,
    charges: FinanceCharge[] = [],
    overrides?: { temPlaca?: boolean; temVistoria?: boolean },
): ReciboContext {
    // Soma cobranças ativas por categoria (ignora canceladas).
    const sumByCategoria = (cat: 'placa' | 'vistoria') =>
        charges
            .filter(c => c.categoria === cat && c.status !== 'cancelado')
            .reduce((acc, c) => acc + (c.valor_pago || c.valor_previsto || 0), 0);

    const chargeVistoria = sumByCategoria('vistoria');
    const chargePlaca = sumByCategoria('placa');

    // Vistoria: primeiro das cobranças, senão campo em vistoria.taxaValor.
    const valorVistoriaBase = chargeVistoria > 0 ? chargeVistoria : (os.vistoria?.taxaValor ?? 0);
    // Placa: primeiro das cobranças, senão vistoria.placaValor, senão empresa.valorPlaca.
    const valorPlacaBase = chargePlaca > 0
        ? chargePlaca
        : (os.vistoria?.placaValor && os.vistoria.placaValor > 0)
            ? os.vistoria.placaValor
            : (os.trocaPlaca ? (empresa.valorPlaca ?? 0) : 0);

    // "Tem X" padrão = há valor > 0 OU há indicação no cadastro.
    // Usuário pode sobrescrever via checkbox no modal.
    const temPlacaDefault = valorPlacaBase > 0 || os.trocaPlaca;
    const temVistoriaDefault = valorVistoriaBase > 0 || !!os.vistoria?.local;
    const temPlaca = overrides?.temPlaca ?? temPlacaDefault;
    const temVistoria = overrides?.temVistoria ?? temVistoriaDefault;

    // Zera o valor se a categoria foi desmarcada.
    const valorPlaca = temPlaca ? valorPlacaBase : 0;
    const valorVistoria = temVistoria ? valorVistoriaBase : 0;
    const valorTotal = valorPlaca + valorVistoria;

    return {
        numeroOS: String(os.numero ?? ''),
        dataEmissao: new Date().toLocaleDateString('pt-BR'),
        numeroRecibo: String(os.numero ?? ''),
        clienteNome: cliente?.nome ?? '',
        clienteCpfCnpj: cliente?.cpfCnpj ?? '',
        placa: veiculo?.placa ?? '',
        chassi: veiculo?.chassi ?? '',
        modelo: veiculo?.marcaModelo ?? '',
        empresaNome: empresa.nome,
        valorPlaca,
        valorVistoria,
        valorTotal,
        valorPlacaFmt: formatBRL(valorPlaca),
        valorVistoriaFmt: formatBRL(valorVistoria),
        valorTotalFmt: formatBRL(valorTotal),
        valorPorExtenso: porExtenso(valorTotal),
        vistoriaLocal: os.vistoria?.local ?? '',
        temPlaca,
        temVistoria,
        observacao: '',
    };
}

// ── Renderização do .xlsx ────────────────────────────────────────────────────

function isTrue(v: unknown): boolean {
    return v === true || v === 1 || (typeof v === 'string' && v.length > 0) || (typeof v === 'number' && v !== 0);
}

function replaceVars(text: string, ctx: Record<string, unknown>): string {
    return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
        const v = ctx[key];
        if (v === undefined || v === null) return '';
        return String(v);
    });
}

/**
 * Processa as linhas de uma worksheet aplicando blocos {{#cond}}...{{/cond}}
 * e substituindo {{var}} em todas as células.
 *
 * Em vez de DELETAR linhas (o que quebra células mescladas em `spliceRows`
 * do exceljs), marcamos as linhas escondidas com `row.hidden = true`.
 * O Excel e o LibreOffice ignoram linhas ocultas na renderização/PDF.
 * Os marcadores `{{#cond}}` e `{{/cond}}` ficam sempre escondidos; as
 * linhas de conteúdo entre eles ficam escondidas somente se cond for falsa.
 */
function processWorksheet(ws: ExcelJS.Worksheet, ctx: Record<string, unknown>): void {
    type BlockState = { startRow: number; cond: string; condValue: boolean };
    const stack: BlockState[] = [];
    const rowsToHide = new Set<number>();

    const lastRow = ws.actualRowCount;

    for (let r = 1; r <= lastRow; r++) {
        const row = ws.getRow(r);
        let rowText = '';
        row.eachCell({ includeEmpty: false }, (cell) => {
            const v = cell.value;
            if (typeof v === 'string') rowText += v + ' ';
            else if (v && typeof v === 'object' && 'richText' in v) {
                rowText += (v as ExcelJS.CellRichTextValue).richText.map(p => p.text).join(' ') + ' ';
            }
        });

        const openMatch = rowText.match(/\{\{#\s*([\w.]+)\s*\}\}/);
        const closeMatch = rowText.match(/\{\{\/\s*([\w.]+)\s*\}\}/);

        if (openMatch) {
            const cond = openMatch[1]!;
            const condValue = isTrue(ctx[cond]);
            stack.push({ startRow: r, cond, condValue });
            rowsToHide.add(r);
            // Limpa as células do marker pra não aparecer "{{#temPlaca}}" se o
            // Excel renderizar linhas ocultas em algum contexto.
            row.eachCell({ includeEmpty: false }, (cell) => {
                if (typeof cell.value === 'string' && cell.value.includes('{{')) cell.value = '';
            });
            continue;
        }

        if (closeMatch) {
            const block = stack.pop();
            if (block) {
                rowsToHide.add(r);
                row.eachCell({ includeEmpty: false }, (cell) => {
                    if (typeof cell.value === 'string' && cell.value.includes('{{')) cell.value = '';
                });
                if (!block.condValue) {
                    for (let i = block.startRow + 1; i < r; i++) rowsToHide.add(i);
                }
            }
            continue;
        }

        // Substituições normais nas células.
        row.eachCell({ includeEmpty: false }, (cell) => {
            const v = cell.value;
            if (typeof v === 'string') {
                if (v.includes('{{')) {
                    const replaced = replaceVars(v, ctx);
                    // Se a string inteira é um placeholder numérico, coloca como número
                    // (mantém a formatação R$ da célula funcionando).
                    const isSingleNum = /^\s*\{\{\s*[\w.]+\s*\}\}\s*$/.test(v);
                    const asNum = Number(replaced);
                    cell.value = isSingleNum && !isNaN(asNum) && replaced !== '' ? asNum : replaced;
                }
            } else if (v && typeof v === 'object' && 'richText' in v) {
                const rich = v as ExcelJS.CellRichTextValue;
                const replaced = rich.richText.map(p => ({ ...p, text: replaceVars(p.text, ctx) }));
                cell.value = { ...rich, richText: replaced };
            }
        });
    }

    // Marca linhas como ocultas (preserva merges / layout).
    for (const r of rowsToHide) {
        ws.getRow(r).hidden = true;
    }
}

export async function fillExcelTemplate(templateUrl: string, ctx: ReciboContext): Promise<Blob> {
    const res = await fetch(templateUrl);
    if (!res.ok) throw new Error(`Falha ao carregar template (${res.status}): ${templateUrl}`);
    const buf = await res.arrayBuffer();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const ctxRecord = ctx as unknown as Record<string, unknown>;
    wb.eachSheet((ws) => processWorksheet(ws, ctxRecord));

    const out = await wb.xlsx.writeBuffer();
    return new Blob([out], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

// ── Download / conversão para PDF ────────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
    saveAs(blob, filename);
}

/**
 * Abre uma nova janela com o .xlsx renderizado em HTML (via SheetJS) e dispara
 * o diálogo de impressão do navegador. O usuário escolhe "Salvar como PDF" —
 * nenhum servidor é necessário, funciona em qualquer deploy estático.
 */
export async function printFilledExcel(xlsx: Blob, title = 'Recibo'): Promise<void> {
    const buf = await xlsx.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellStyles: true });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) throw new Error('A planilha não tem nenhuma aba.');
    const ws = wb.Sheets[firstSheetName];
    if (!ws) throw new Error('Aba não encontrada no arquivo.');

    // Gera <table> HTML preservando merges, valores e estilos básicos.
    const tableHtml = XLSX.utils.sheet_to_html(ws, { editable: false });

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  table { border-collapse: collapse; width: 100%; }
  td, th { padding: 4px 8px; vertical-align: middle; }
  /* SheetJS marca linhas escondidas — respeita isso no HTML */
  tr[hidden], td[hidden], th[hidden] { display: none !important; }
  .no-print { position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 999; }
  .no-print button {
    background: #0075de; color: #fff; border: none; padding: 10px 18px;
    border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .no-print button.secondary { background: #666; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
    <button class="secondary" onclick="window.close()">Fechar</button>
  </div>
  ${tableHtml}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 400));</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) throw new Error('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
    win.document.open();
    win.document.write(html);
    win.document.close();
}

export function templateUrlFromPath(path: string): string {
    // URLs absolutas (Supabase Storage público etc.) voltam como estão.
    if (/^https?:\/\//i.test(path)) return path;
    // Caminhos relativos em /public são servidos a partir da raiz.
    return path.startsWith('/') ? path : `/${path}`;
}

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
import type { OrdemDeServico, Cliente, Veiculo } from '../types';
import type { EmpresaParceira } from '../types/empresa';

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

function porExtenso(valor: number): string {
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
): ReciboContext {
    const valorPlaca = (os.vistoria?.placaValor && os.vistoria.placaValor > 0)
        ? os.vistoria.placaValor
        : (os.trocaPlaca ? (empresa.valorPlaca ?? 0) : 0);
    const valorVistoria = os.vistoria?.taxaValor ?? 0;
    const valorTotal = valorPlaca + valorVistoria;

    const temPlaca = valorPlaca > 0;
    const temVistoria = valorVistoria > 0 || !!os.vistoria?.local;

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
 * (deletando linhas entre as tags se cond for falsa) e substituindo {{var}}
 * em todas as células de texto.
 */
function processWorksheet(ws: ExcelJS.Worksheet, ctx: Record<string, unknown>): void {
    type BlockState = { startRow: number; cond: string; condValue: boolean };
    const stack: BlockState[] = [];
    const rowsToDelete = new Set<number>();

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
            rowsToDelete.add(r);
            continue;
        }

        if (closeMatch) {
            const block = stack.pop();
            if (block) rowsToDelete.add(r);
            if (block && !block.condValue) {
                for (let i = block.startRow + 1; i < r; i++) rowsToDelete.add(i);
            }
            continue;
        }

        // Substituições normais
        row.eachCell({ includeEmpty: false }, (cell) => {
            const v = cell.value;
            if (typeof v === 'string') {
                if (v.includes('{{')) cell.value = replaceVars(v, ctx);
            } else if (v && typeof v === 'object' && 'richText' in v) {
                const rich = v as ExcelJS.CellRichTextValue;
                const replaced = rich.richText.map(p => ({ ...p, text: replaceVars(p.text, ctx) }));
                cell.value = { ...rich, richText: replaced };
            }
        });
    }

    // Deletar de baixo para cima para preservar índices
    const ordered = Array.from(rowsToDelete).sort((a, b) => b - a);
    for (const r of ordered) ws.spliceRows(r, 1);
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

export async function convertExcelToPdf(xlsx: Blob): Promise<Blob> {
    const fd = new FormData();
    fd.append('file', xlsx, 'recibo.xlsx');
    const res = await fetch('/api/recibo/pdf', { method: 'POST', body: fd });
    if (!res.ok) {
        let detail = '';
        try { detail = (await res.json()).error || ''; } catch {}
        throw new Error(`Conversão para PDF falhou (${res.status}). ${detail}`);
    }
    return await res.blob();
}

export function templateUrlFromPath(path: string): string {
    // Caminhos em /public são servidos a partir da raiz.
    return path.startsWith('/') ? path : `/${path}`;
}

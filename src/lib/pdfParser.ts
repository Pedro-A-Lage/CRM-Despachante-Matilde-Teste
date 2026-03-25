// ============================================
// PDF PARSER - Extrai dados de veículo e cliente de PDFs
// Usa pdfjs-dist para extrair texto do PDF
// ============================================

// @ts-ignore - pdfjs-dist v3 doesn't have mjs build
import * as pdfjsLib from 'pdfjs-dist/build/pdf.js';

// Use the CDN worker for v3
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface DadosExtraidos {
    placa?: string;
    renavam?: string;
    chassi?: string;
    marcaModelo?: string;
    anoFabricacao?: string;
    anoModelo?: string;
    cor?: string;
    cpfCnpj?: string;
    nomeProprietario?: string;
    combustivel?: string;
    categoria?: string;
    especie?: string;
    tipo?: string;
    motivoPreenchimento?: string;  // Ex: "TRANSFERÊNCIA DE PROPRIEDADE"
    tipoServicoDetectado?: string; // Mapeado para o enum TipoServico
    dataEmissao?: string;          // Data da emissão da folha
    dataAquisicao?: string;        // DATA DA AQUISIÇÃO do CRV
    cpfCnpjAdquirente?: string;
    nomeAdquirente?: string;
    cpfCnpjVendedor?: string;
    nomeVendedor?: string;
    resultadoVistoria?: string;    // Extraído do laudo (APROVADO, REPROVADO, etc)
    textoCompleto: string;
}

/**
 * Extract text from all pages of a PDF file
 */
async function extractTextFromPDF(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
        fullText += pageText + '\n';
    }

    return fullText;
}

/**
 * Parse vehicle plate from text
 * Supports old format (ABC-1234) and Mercosul (ABC1D23)
 */
function parsePlaca(text: string): string | undefined {
    // Hidden inputs from extension (e.g. PLACA: ABC1234)
    const hiddenInputMatch = text.match(/PLACA\s*:\s*([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2})/i);
    if (hiddenInputMatch) return hiddenInputMatch[1]!.replace(/[\s-]/g, '').toUpperCase();

    // Look for label + value pattern first
    const labelMatch = text.match(/(?:placa|placa\s*:)\s*([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2})/i);
    if (labelMatch) return labelMatch[1]!.replace(/[\s-]/g, '').toUpperCase();

    // Generic plate pattern
    const genericMatch = text.match(/\b([A-Z]{3}\s?-?\s?\d[A-Z0-9]\d{2})\b/i);
    if (genericMatch) return genericMatch[1]!.replace(/[\s-]/g, '').toUpperCase();

    return undefined;
}

/**
 * Parse Renavam (11 digits)
 */
function parseRenavam(text: string): string | undefined {
    // Hidden inputs from extension (e.g. RENAVAM: 12345678901)
    const hiddenInputMatch = text.match(/RENAVAM\s*:\s*(\d{9,11})/i);
    if (hiddenInputMatch) return hiddenInputMatch[1]!.padStart(11, '0');

    const match = text.match(/(?:renavam|cód\.\s*renavam|cod\s*renavam)\s*:?\s*(\d{9,11})/i);
    if (match) return match[1]!.padStart(11, '0');

    // Standalone 11-digit number near "renavam" keyword
    const lines = text.split('\n');
    for (const line of lines) {
        if (/renavam/i.test(line)) {
            const numMatch = line.match(/(\d{9,11})/);
            if (numMatch) return numMatch[1]!.padStart(11, '0');
        }
    }
    return undefined;
}

/**
 * Parse Chassis (17 alphanumeric characters, no I, O, Q)
 */
function parseChassi(text: string): string | undefined {
    // Hidden inputs from extension (e.g. CHASSI: 9BWZZZ55ZET123456)
    const hiddenInputMatch = text.match(/CHASSI\s*:\s*([A-HJ-NPR-Z0-9]{17})/i);
    if (hiddenInputMatch) return hiddenInputMatch[1]!.toUpperCase();

    const match = text.match(/(?:chassi|chassis|n[uú]mero\s*do\s*chassi)\s*:?\s*([A-HJ-NPR-Z0-9]{17})/i);
    if (match) return match[1]!.toUpperCase();

    // Generic 17-char pattern
    const genericMatch = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
    if (genericMatch) return genericMatch[1]!.toUpperCase();

    return undefined;
}

interface DadosProprietario {
    nome?: string;
    cpfCnpj?: string;
}

/**
 * Extrai nome e CPF/CNPJ diretamente do bloco "DADOS DO PROPRIETÁRIO".
 * Captura em um único passo: NOME DO PROPRIETÁRIO: <nome> CPF/CNPJ: <cpf>
 * Funciona com CPF formatado (000.000.000-00) ou cru (00000000000).
 */
function parseDadosProprietario(secao: string): DadosProprietario {
    const result: DadosProprietario = {};

    // Tenta capturar nome e CPF/CNPJ juntos na mesma linha/bloco
    const conjuntoMatch = secao.match(
        /NOME\s+DO\s+PROPRIET[AÁ]RIO\s*:\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇa-záéíóúãõâêîôûç\s.\-]{2,80}?)\s+CPF\/CNPJ\s*:\s*([\d.\-\/]{11,19}|\d{11}|\d{14})/i
    );
    if (conjuntoMatch) {
        result.nome = conjuntoMatch[1]!.trim();
        const cpfRaw = conjuntoMatch[2]!.replace(/\D/g, '');
        if (cpfRaw.length === 11 || cpfRaw.length === 14) result.cpfCnpj = formatCpfCnpj(cpfRaw);
    } else {
        // Fallback: extrai nome separadamente
        const nomeMatch = secao.match(/NOME\s+DO\s+PROPRIET[AÁ]RIO\s*:\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇa-záéíóúãõâêîôûç\s.\-]{2,80}?)(?=\s+(?:CPF|CNPJ|RG|DATA|ENDERE|$))/i);
        if (nomeMatch) result.nome = nomeMatch[1]!.trim();
        // Fallback: extrai CPF separadamente
        result.cpfCnpj = parseCpfCnpj(secao);
    }

    return result;
}

/**
 * Extrai dados do proprietário atual e anterior separando as seções do PDF.
 */
function parseProprietarios(text: string): { adquirente: DadosProprietario, vendedor: DadosProprietario } {
    const adquirente: DadosProprietario = {};
    const vendedor: DadosProprietario = {};

    // Seção do Proprietário Anterior (Vendedor)
    const vendSection = text.match(/DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR[\s\S]{1,800}?(?=CARACTER[IÍ]STICAS\s+DO\s+VE[IÍ]CULO|DADOS\s+DO\s+PROPRIET[AÁ]RIO(?!\s+ANTERIOR)|DADOS\s+DO\s+ADQUIRENTE|$)/i);
    if (vendSection) {
        const d = parseDadosProprietario(vendSection[0]);
        vendedor.nome = d.nome;
        vendedor.cpfCnpj = d.cpfCnpj;
    }

    // Seção do Proprietário Atual / Adquirente
    const adqSection = text.match(/(?:DADOS\s+DO\s+PROPRIET[AÁ]RIO(?!\s+ANTERIOR)|DADOS\s+DO\s+ADQUIRENTE)[\s\S]{1,800}?(?=ENDERE[ÇC]O\s+DO\s+PROPRIET[AÁ]RIO|DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR|DADOS\s+DO\s+VE[IÍ]CULO|$)/i);
    if (adqSection) {
        const d = parseDadosProprietario(adqSection[0]);
        adquirente.nome = d.nome;
        adquirente.cpfCnpj = d.cpfCnpj;
    }

    return { adquirente, vendedor };
}

// Mantidos para compatibilidade com extractVehicleDataFromText
function parseSpecificCpfCnpj(text: string): { adquirente?: string, vendedor?: string } {
    const { adquirente, vendedor } = parseProprietarios(text);
    return { adquirente: adquirente.cpfCnpj, vendedor: vendedor.cpfCnpj };
}

function parseSpecificNomes(text: string): { adquirente?: string, vendedor?: string } {
    const { adquirente, vendedor } = parseProprietarios(text);
    return { adquirente: adquirente.nome, vendedor: vendedor.nome };
}

/**
 * Parse marca/modelo
 */
function parseMarcaModelo(text: string): string | undefined {
    const patterns = [
        /(?:marca\s*\/?\s*modelo|marca\s*modelo|desc(?:rição)?\.?\s*(?:do\s*)?ve[ií]culo)\s*:?\s*([A-ZÁÉÍÓÚÃÕa-záéíóúãõ0-9\s\/\.\-]{3,60})/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1]!.trim();
        }
    }
    return undefined;
}

/**
 * Parse year (fabricação/modelo)
 */
function parseAno(text: string): { fabricacao?: string; modelo?: string } {
    // Pattern: "ano fab" / "ano modelo" or "YYYY/YYYY"
    const anoFabMatch = text.match(/(?:ano\s*(?:de\s*)?(?:fab(?:ricação|ricacao)?|fabr?))\s*:?\s*(\d{4})/i);
    const anoModMatch = text.match(/(?:ano\s*(?:de\s*)?modelo)\s*:?\s*(\d{4})/i);

    // Combined: "2020/2021"
    const combinedMatch = text.match(/(?:ano|ano\s*fab\s*[\/\-]\s*mod)\s*:?\s*(\d{4})\s*[\/\-]\s*(\d{4})/i);
    if (combinedMatch) {
        return { fabricacao: combinedMatch[1], modelo: combinedMatch[2] };
    }

    return {
        fabricacao: anoFabMatch?.[1],
        modelo: anoModMatch?.[1],
    };
}

/**
 * Parse cor (color)
 */
function parseCor(text: string): string | undefined {
    const match = text.match(/(?:cor\s*(?:predominante)?)\s*:?\s*([A-ZÁÉÍÓÚÃÕa-záéíóúãõ]{3,20})/i);
    if (match) return match[1]!.trim();
    return undefined;
}

/**
 * Parse motivo do preenchimento / tipo de serviço
 * Ex: "IDENTIFICAÇÃO DO VEÍCULO E MOTIVO DO PREENCHIMENTO: TRANSFERÊNCIA DE PROPRIEDADE"
 */
function parseMotivoPreenchimento(text: string): string | undefined {
    // Hidden inputs from extension (e.g. SERVICO_DETRAN: Primeiro emplacamento)
    const hiddenServicoMatch = text.match(/SERVICO_DETRAN\s*:\s*(.+)$/im);
    if (hiddenServicoMatch) return hiddenServicoMatch[1]!.trim();

    const patterns = [
        /MOTIVO\s*(?:DO)?\s*PREENCHIMENTO\s*:?\s*([A-ZÀ-Ú\s]+?)(?:\n|Emiss|PLACA|$)/i,
        /MOTIVO\s*:?\s*([A-ZÀ-Ú\s]+?)(?:\n|Emiss|PLACA|$)/i,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1]!.trim();
    }
    return undefined;
}

/**
 * Mapeia o texto do motivo para o TipoServico do sistema
 */
function mapMotivoToTipoServico(motivo: string): string | undefined {
    const m = motivo.toUpperCase();
    if (m.includes('TRANSFERÊNCIA') || m.includes('TRANSFERENCIA')) return 'transferencia';
    if (m.includes('PRIMEIRO EMPLACAMENTO') || m.includes('1º EMPLACAMENTO')) return 'primeiro_emplacamento';
    if (m.includes('ALTERAÇÃO') || m.includes('ALTERACAO')) return 'alteracao_dados';
    if (m.includes('SEGUNDA VIA') || m.includes('2ª VIA')) return 'segunda_via';
    if (m.includes('MUDANÇA DE CARACTERÍSTICA') || m.includes('MUDANCA DE CARACTERISTICA')) return 'mudanca_caracteristica';
    if (m.includes('MUDANÇA DE CATEGORIA') || m.includes('MUDANCA DE CATEGORIA')) return 'mudanca_categoria';
    if (m.includes('BAIXA')) return 'baixa';
    if (m.includes('VISTORIA LACRADA') || m.includes('LAUDO')) return 'vistoria_lacrada';
    return undefined;
}

/**
 * Parse data de emissão da folha de cadastro
 * Ex: "Emissão em: 14/01/2026 - 11:54"
 */
function parseDataEmissao(text: string): string | undefined {
    const match = text.match(/Emiss[aã]o\s*(?:em)?\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (match) return match[1];
    return undefined;
}

/**
 * Parse data de aquisição do CRV
 * Ex: "DATA DA AQUISIÇÃO: 29/12/2025"
 */
function parseDataAquisicao(text: string): string | undefined {
    // 1. Regex mais robusto para capturar variações do selo e espaços
    const match = text.match(/DATA\s*(?:DA)?\s*AQUISI[CÇ][AÃ]O\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (match) return match[1];

    // 2. Fallback: buscar data próximo à palavra AQUISIÇÃO se não bater no regex principal
    const fallbackLines = text.split('\n');
    for (const line of fallbackLines) {
        if (/AQUISI[CÇ][AÃ]O/i.test(line)) {
            const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
            if (dateMatch) return dateMatch[1];
        }
    }

    return undefined;
}

/**
 * Parse Resultado da Vistoria
 * Ex: "RESULTADO DA VISTORIA: APROVADO" ou "Resultado: REPROVADO"
 */
function parseResultadoVistoria(text: string): string | undefined {
    const match = text.match(/(?:resultado(?:\s*da\s*vistoria)?)\s*:?\s*(APROVADO(?:\s*COM\s*APONTAMENTO)?|REPROVADO|APROVADA|REPROVADA)/i);
    if (match) return match[1]!.trim().toUpperCase();
    return undefined;
}

/**
 * Extract data directly from text (e.g. from the Confirmar Dados page)
 */
export function extractVehicleDataFromText(text: string): DadosExtraidos {
    const anos = parseAno(text);
    const motivo = parseMotivoPreenchimento(text);
    const nomes = parseSpecificNomes(text);
    const cpfs = parseSpecificCpfCnpj(text);

    return {
        placa: parsePlaca(text),
        renavam: parseRenavam(text),
        chassi: parseChassi(text),
        marcaModelo: parseMarcaModelo(text),
        anoFabricacao: anos.fabricacao,
        anoModelo: anos.modelo,
        cor: parseCor(text),

        // Dados do Adquirente (Principal)
        nomeAdquirente: nomes.adquirente,
        cpfCnpjAdquirente: cpfs.adquirente,

        // Dados do Vendedor (Secundário)
        nomeVendedor: nomes.vendedor,
        cpfCnpjVendedor: cpfs.vendedor,

        // Fallbacks para compatibilidade - PRIORIDADE TOTAL AO ADQUIRENTE
        cpfCnpj: cpfs.adquirente || (cpfs.vendedor ? cpfs.vendedor : parseCpfCnpj(text)),
        nomeProprietario: nomes.adquirente || (nomes.vendedor ? nomes.vendedor : parseNomeProprietario(text)),

        motivoPreenchimento: motivo,
        tipoServicoDetectado: motivo ? mapMotivoToTipoServico(motivo) : undefined,
        dataEmissao: parseDataEmissao(text),
        dataAquisicao: parseDataAquisicao(text),
        resultadoVistoria: parseResultadoVistoria(text),
        textoCompleto: text,
    };
}

/**
 * Helper to format CPF or CNPJ
 */
function formatCpfCnpj(v: string): string {
    const clean = v.replace(/\D/g, '');
    if (clean.length === 11) {
        return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    } else if (clean.length === 14) {
        return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
    return v;
}

// Re-implement basic functions as fallbacks for the composite extraction
function parseCpfCnpj(text: string): string | undefined {
    // 1. CPF/CNPJ sem formatação após label explícito (ex: "CPF/CNPJ: 01410391671")
    const rawLabelMatch = text.match(/(?:cpf\/cnpj|cpf\s*\/\s*cnpj|cpf|cnpj)\s*:\s*(\d{11}|\d{14})\b/i);
    if (rawLabelMatch && rawLabelMatch[1]) return formatCpfCnpj(rawLabelMatch[1]);

    // 2. Labels com separadores variados (pode incluir dígitos formatados)
    const labelPattern = /(?:cpf|cnpj|cpf\/cnpj|cpf\s*\/\s*cnpj|doc|documento)\s*[:\s]+\s*([\d.\-/]{11,20})/i;
    const labelMatch = text.match(labelPattern);
    if (labelMatch && labelMatch[1]) {
        const clean = labelMatch[1].replace(/\D/g, '');
        if (clean.length === 11 || clean.length === 14) return formatCpfCnpj(clean);
    }

    // 3. Padrão formatado explícito (com pontos e traço)
    const cnpjMatch = text.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
    if (cnpjMatch) return cnpjMatch[1];

    const cpfMatch = text.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/);
    if (cpfMatch) return cpfMatch[1];

    return undefined;
}

function parseNomeProprietario(text: string): string | undefined {
    const patterns = [
        /(?:nome\s*(?:do\s*)?propriet[aá]rio)\s*:?\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇa-záéíóúãõâêîôûç\s]+?)(?:CPF|CNPJ|\d|$)/i,
        /(?:adquirente|comprador)\s*:?\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇa-záéíóúãõâêîôûç\s]+?)(?:\d|CPF|CNPJ|$)/i,
        /(?:nome|proprietário|propriet[aá]rio)\s*:?\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇa-záéíóúãõâêîôûç\s]{3,60}?)(?:CPF|CNPJ|N\.|DOC|Endereço|$)/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1]!.trim();
        }
    }
    return undefined;
}

/**
 * Main extraction function: takes a PDF file and returns parsed data
 */
export async function extractVehicleData(file: File): Promise<DadosExtraidos> {
    const text = await extractTextFromPDF(file);
    return extractVehicleDataFromText(text);
}

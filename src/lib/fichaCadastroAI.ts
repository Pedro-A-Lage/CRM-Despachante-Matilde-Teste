// ============================================
// Ficha de Cadastro AI - Extração via Google Gemini
// Analisa o PDF da Ficha de Cadastro/DAE que volta do Detran
// ============================================

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { maxOutputTokens: 4096, responseMimeType: 'application/json' },
});

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
}

/**
 * Detecta o mimeType correto a partir do File.
 * Aceita PDF (application/pdf) ou imagens (image/png, image/jpeg, image/webp).
 */
function detectarMimeType(file: File): string {
    if (file.type) return file.type;
    const nome = file.name.toLowerCase();
    if (nome.endsWith('.pdf')) return 'application/pdf';
    if (nome.endsWith('.png')) return 'image/png';
    if (nome.endsWith('.jpg') || nome.endsWith('.jpeg')) return 'image/jpeg';
    if (nome.endsWith('.webp')) return 'image/webp';
    return 'application/pdf';
}

export interface DadosFichaCadastro {
    tipoServico: string;
    placa: string;
    chassi: string;
    renavam: string;
    marcaModelo: string;
    anoFabricacao: string;
    anoModelo: string;
    cor: string;
    categoria: string;
    combustivel: string;
    tipoVeiculo: string;
    municipioEmplacamento: string;
    valorRecibo: string;
    dataAquisicao: string;
    proprietario: {
        nome: string;
        cpfCnpj: string;
        tipoCpfCnpj: 'CPF' | 'CNPJ';
        docIdentidade: string;
        orgaoExpedidor: string;
        ufOrgaoExpedidor: string;
        endereco: string;
        numero: string;
        bairro: string;
        municipio: string;
        uf: string;
        cep: string;
    };
    proprietarioAnterior: {
        nome: string;
        cpfCnpj: string;
        municipio: string;
        uf: string;
    };
}

const PROMPT_FICHA_CADASTRO = `Você é um especialista em documentos do Detran/MG. Analise este "DECALQUE CHASSI" / "DOCUMENTO DE CADASTRO" / FICHA DE CADASTRO emitido pelo Detran/MG (pode vir junto com o DAE — ignore o DAE) e extraia EXATAMENTE os campos abaixo.

CONTEXTO IMPORTANTE
═══════════════════
O documento tem sempre o mesmo layout, dividido em blocos:
1. Cabeçalho — título "DECALQUE CHASSI" e a linha "IDENTIFICAÇÃO DO VEÍCULO E MOTIVO DO PREENCHIMENTO: <MOTIVO>" (este motivo é o serviço).
2. Bloco "DADOS DO PROPRIETÁRIO" (proprietário ATUAL).
3. Bloco "ENDEREÇO DO PROPRIETÁRIO".
4. Bloco "ENDEREÇO DE CORRESPONDÊNCIA" — IGNORE, é só correspondência. Use sempre o "ENDEREÇO DO PROPRIETÁRIO".
5. Bloco "DADOS DO PROPRIETÁRIO ANTERIOR" (vendedor — pode estar em branco se não houver).
6. Blocos "CARACTERÍSTICAS DO VEÍCULO" e "CARACTERÍSTICAS DO VEÍCULO DE CARGA".
7. Bloco "RESTRIÇÕES À VENDA".

Algumas folhas trazem MENOS campos preenchidos que outras (ex.: baixa não tem comprador, primeiro emplacamento não tem proprietário anterior, alteração de características pode não ter valor de recibo). Se um campo não existir ou estiver em branco, retorne string vazia "" — NUNCA invente, NUNCA chute, NUNCA copie de outro bloco.

DETECÇÃO DO TIPO DE SERVIÇO
═══════════════════════════
Leia a linha "MOTIVO DO PREENCHIMENTO" no topo e mapeie para EXATAMENTE um destes valores em "tipoServico":
- "TRANSFERÊNCIA DE PROPRIEDADE" / "TRANSFERENCIA" → "transferencia"
- "ALTERAÇÃO DE DADOS" / "INCLUSÃO DE GRAVAME" / "RETIRADA DE GRAVAME" / "INCLUSÃO DE RESTRIÇÃO" → "alteracao_dados"
- "ALTERAÇÃO DE CARACTERÍSTICA" / "MUDANÇA DE CARACTERÍSTICA" → "mudanca_caracteristica"
- "BAIXA" / "BAIXA DE VEÍCULO" → "baixa"
- "PRIMEIRO EMPLACAMENTO" / "EMPLACAMENTO INICIAL" → "primeiro_emplacamento"
- "SEGUNDA VIA" / "2ª VIA DO CRV" / "EMISSÃO DA 2ª VIA" → "segunda_via"
- Qualquer outro caso ou ambíguo → ""

FORMATO DE SAÍDA
════════════════
Retorne APENAS um objeto JSON válido, sem markdown, sem comentários, sem texto antes/depois:
{
  "tipoServico": "",
  "placa": "",
  "chassi": "",
  "renavam": "",
  "marcaModelo": "",
  "anoFabricacao": "",
  "anoModelo": "",
  "cor": "",
  "categoria": "",
  "combustivel": "",
  "tipoVeiculo": "",
  "municipioEmplacamento": "",
  "valorRecibo": "",
  "dataAquisicao": "",
  "proprietario": {
    "nome": "",
    "cpfCnpj": "",
    "tipoCpfCnpj": "",
    "docIdentidade": "",
    "orgaoExpedidor": "",
    "ufOrgaoExpedidor": "",
    "endereco": "",
    "numero": "",
    "bairro": "",
    "municipio": "",
    "uf": "",
    "cep": ""
  },
  "proprietarioAnterior": {
    "nome": "",
    "cpfCnpj": "",
    "municipio": "",
    "uf": ""
  }
}

REGRAS DE NORMALIZAÇÃO
══════════════════════
- "placa": maiúsculas, SEM espaços nem hífen. Pode estar vazia em primeiro emplacamento.
- "chassi": exatamente como aparece, maiúsculas, sem espaços (17 caracteres no padrão).
- "renavam": apenas dígitos.
- "marcaModelo": exatamente como aparece (ex.: "I/LR R.R SPT 3.0 TD HSE").
- "anoFabricacao" / "anoModelo": 4 dígitos.
- "cor": SOMENTE o nome da cor, SEM o código (ex.: "11 - PRETA" → "PRETA"). Se "-" ou vazio, "".
- "categoria": SOMENTE o nome (ex.: "1 - PARTIC" → "PARTIC", "PARTICULAR", "OFICIAL", "ALUGUEL").
- "combustivel": ex.: "DIESEL", "GASOLINA", "FLEX", "ALCOOL".
- "tipoVeiculo": SOMENTE o nome (ex.: "025 - UTILITARIO" → "UTILITARIO", "AUTOMOVEL", "MOTOCICLETA", "CAMINHONETE").
- "municipioEmplacamento": exatamente como aparece (ex.: "ITAMBE DO MATO DENTRO").
- "valorRecibo": número em reais com PONTO decimal e SEM separador de milhar nem "R$". Ex.: "R$ 140.000,00" → "140000.00". Se em branco, "".
- "dataAquisicao": procure o campo com label exato "DATA DA AQUISIÇÃO" (ou "DATA DA AQUISICAO") na linha de identificação do veículo, ao lado de "VALOR DO RECIBO". Devolva no formato "DD/MM/YYYY". NUNCA confundir com a "DATA DE RECEBIMENTO" do cabeçalho (que vem depois de "CÓDIGO DO MUNICIPIO" e fica em branco para preencher à mão).

DADOS DO PROPRIETÁRIO
═════════════════════
Use o bloco "DADOS DO PROPRIETÁRIO" + "ENDEREÇO DO PROPRIETÁRIO" (NÃO use "ENDEREÇO DE CORRESPONDÊNCIA").
- "proprietario.nome": nome completo, exatamente como impresso.
- "proprietario.cpfCnpj": apenas dígitos (sem pontos, traços ou barras).
- "proprietario.tipoCpfCnpj": "CPF" se 11 dígitos, "CNPJ" se 14.
- "proprietario.docIdentidade": "N. DOC.IDENTIDADE" — apenas dígitos/letras como aparece.
- "proprietario.orgaoExpedidor": ex.: "SSP", "PC", "DETRAN".
- "proprietario.ufOrgaoExpedidor": "SIGLA UF" do órgão expedidor (2 letras).
- "proprietario.endereco": logradouro SEM número e SEM bairro (ex.: "RUA ITABIRA").
- "proprietario.numero": apenas o número do imóvel (ex.: "43"). Se "S/N", devolva "S/N".
- "proprietario.bairro": nome do bairro.
- "proprietario.municipio": nome do município (ex.: "ITAMBE DO MATO DENTRO").
- "proprietario.uf": UF do município do proprietário (2 letras). Se a folha não trouxer, deduza pelo município se for óbvio (ex.: "ITAMBE DO MATO DENTRO" é MG); caso contrário, "".
- "proprietario.cep": apenas dígitos (8 dígitos), sem hífen.

PROPRIETÁRIO ANTERIOR (VENDEDOR)
════════════════════════════════
Use o bloco "DADOS DO PROPRIETÁRIO ANTERIOR". Pode estar inteiramente em branco — nesse caso devolva todas as strings vazias.
- "proprietarioAnterior.nome": nome do vendedor.
- "proprietarioAnterior.cpfCnpj": apenas dígitos.
- "proprietarioAnterior.municipio": município do vendedor (pode estar vazio).
- "proprietarioAnterior.uf": UF do vendedor (2 letras, pode estar vazio).

REGRAS GERAIS
═════════════
- Se um campo não existir OU estiver em branco, devolva "" — NUNCA chute, NUNCA copie de outro bloco.
- NÃO confunda "ENDEREÇO DO PROPRIETÁRIO" com "ENDEREÇO DE CORRESPONDÊNCIA".
- NÃO confunda "DATA DA AQUISIÇÃO" (campo preenchido, ex.: "04/04/2026") com "DATA DE RECEBIMENTO" (campo em branco no cabeçalho, destinado ao órgão de trânsito).
- NÃO inclua R$, pontos de milhar nem vírgula no valorRecibo.
- Devolva APENAS o JSON, nada mais.`;

async function chamarGeminiComRetry(dataBase64: string, mimeType: string, prompt: string, maxTentativas = 3): Promise<string> {
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
        try {
            const result = await model.generateContent([
                { inlineData: { data: dataBase64, mimeType } },
                { text: prompt },
            ]);
            return result.response.text();
        } catch (err: any) {
            const msg = err?.message || '';
            if ((msg.includes('429') || msg.includes('503')) && tentativa < maxTentativas) {
                const delayMatch = msg.match(/retry in (\d+)/i);
                const delaySec = delayMatch ? Math.min(parseInt(delayMatch[1], 10) + 2, 60) : 20;
                console.log(`[Matilde] Gemini rate limit, tentativa ${tentativa}/${maxTentativas}. Aguardando ${delaySec}s...`);
                await new Promise(r => setTimeout(r, delaySec * 1000));
                continue;
            }
            throw err;
        }
    }
    throw new Error('Gemini: máximo de tentativas excedido');
}

export async function extrairDadosFichaCadastro(file: File): Promise<DadosFichaCadastro> {
    const arrayBuffer = await file.arrayBuffer();
    const dataBase64 = arrayBufferToBase64(arrayBuffer);
    const mimeType = detectarMimeType(file);

    const textoResposta = await chamarGeminiComRetry(dataBase64, mimeType, PROMPT_FICHA_CADASTRO);

    let parsed: any;
    try {
        const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textoResposta);
    } catch {
        throw new Error(`Gemini retornou resposta inválida: ${textoResposta.slice(0, 200)}`);
    }

    const limpar = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

    const tipoCpfCnpj: 'CPF' | 'CNPJ' =
        parsed.proprietario?.tipoCpfCnpj === 'CNPJ' ? 'CNPJ' :
        (limpar(parsed.proprietario?.cpfCnpj).replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF');

    // Normalizar tipoVeiculo para "carro" ou "moto"
    const tipoVeiculoRaw = limpar(parsed.tipoVeiculo).toLowerCase();
    const tipoVeiculo = (tipoVeiculoRaw.includes('moto') || tipoVeiculoRaw.includes('ciclomot')) ? 'moto' : 'carro';

    return {
        // IA pode devolver "" quando o motivo for ambíguo. Não force fallback —
        // o chamador (App.tsx) decide o tipo via servicoAtivo do storage.
        tipoServico: limpar(parsed.tipoServico),
        placa: limpar(parsed.placa),
        chassi: limpar(parsed.chassi),
        renavam: limpar(parsed.renavam),
        marcaModelo: limpar(parsed.marcaModelo),
        anoFabricacao: limpar(parsed.anoFabricacao),
        anoModelo: limpar(parsed.anoModelo),
        cor: limpar(parsed.cor) === '-' ? '' : limpar(parsed.cor),
        categoria: limpar(parsed.categoria),
        combustivel: limpar(parsed.combustivel),
        tipoVeiculo,
        municipioEmplacamento: limpar(parsed.municipioEmplacamento),
        valorRecibo: limpar(parsed.valorRecibo),
        dataAquisicao: limpar(parsed.dataAquisicao),
        proprietario: {
            nome: limpar(parsed.proprietario?.nome),
            cpfCnpj: limpar(parsed.proprietario?.cpfCnpj),
            tipoCpfCnpj,
            docIdentidade: limpar(parsed.proprietario?.docIdentidade),
            orgaoExpedidor: limpar(parsed.proprietario?.orgaoExpedidor),
            ufOrgaoExpedidor: limpar(parsed.proprietario?.ufOrgaoExpedidor),
            endereco: limpar(parsed.proprietario?.endereco),
            numero: limpar(parsed.proprietario?.numero),
            bairro: limpar(parsed.proprietario?.bairro),
            municipio: limpar(parsed.proprietario?.municipio),
            uf: limpar(parsed.proprietario?.uf),
            cep: limpar(parsed.proprietario?.cep),
        },
        proprietarioAnterior: {
            nome: limpar(parsed.proprietarioAnterior?.nome),
            cpfCnpj: limpar(parsed.proprietarioAnterior?.cpfCnpj),
            municipio: limpar(parsed.proprietarioAnterior?.municipio),
            uf: limpar(parsed.proprietarioAnterior?.uf),
        },
    };
}

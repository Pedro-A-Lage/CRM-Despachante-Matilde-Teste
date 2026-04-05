// ============================================
// Ficha de Cadastro AI - Extração via Google Gemini
// Analisa o PDF da Ficha de Cadastro/DAE que volta do Detran
// ============================================

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
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

const PROMPT_FICHA_CADASTRO = `Você é um especialista em documentos veiculares brasileiros. Analise esta FICHA DE CADASTRO / DAE (Documento de Arrecadação Estadual) emitida pelo Detran MG e extraia os dados.

Retorne APENAS um objeto JSON válido, sem markdown, sem explicações:
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

═══════════════════════════════════════════════════════
TIPO DE SERVIÇO
═══════════════════════════════════════════════════════

Identifique o tipo de serviço pela descrição da taxa:
- "SEGUNDA VIA DO REGISTRO DE VEICULO" → "segunda_via"
- "TRANSFERÊNCIA" ou "TAXA DE TRANSFERÊNCIA" → "transferencia"
- "PRIMEIRO EMPLACAMENTO" → "primeiro_emplacamento"
- "ALTERAÇÃO DE DADOS" → "alteracao_dados"
- Outro → descreva brevemente

═══════════════════════════════════════════════════════
DADOS DO VEÍCULO
═══════════════════════════════════════════════════════

- "placa": maiúsculo, sem espaços (pode estar vazio em primeiro emplacamento)
- "chassi": 17 caracteres alfanuméricos
- "renavam": apenas dígitos
- "marcaModelo": marca/modelo/versão
- "anoFabricacao": 4 dígitos
- "anoModelo": 4 dígitos
- "cor": cor predominante (se "-" ou vazio, deixe "")
- "categoria": PARTICULAR, OFICIAL, etc.
- "combustivel": tipo de combustível
- "tipoVeiculo": AUTOMOVEL, MOTOCICLETA, CAMINHONETE, etc.
- "municipioEmplacamento": município onde será emplacado
- "valorRecibo": valor do recibo/venda (ex: "114.000,00")
- "dataAquisicao": data de aquisição no formato DD/MM/AAAA

═══════════════════════════════════════════════════════
DADOS DO PROPRIETÁRIO
═══════════════════════════════════════════════════════

- "proprietario.nome": nome completo
- "proprietario.cpfCnpj": CPF ou CNPJ com pontuação
- "proprietario.tipoCpfCnpj": "CPF" se 11 dígitos, "CNPJ" se 14
- "proprietario.docIdentidade": número do RG / documento de identidade
- "proprietario.orgaoExpedidor": órgão expedidor (SSP, PC, etc.)
- "proprietario.ufOrgaoExpedidor": UF do órgão expedidor (2 letras)
- "proprietario.endereco": logradouro SEM número
- "proprietario.numero": número do imóvel
- "proprietario.bairro": bairro
- "proprietario.municipio": município
- "proprietario.uf": UF (2 letras)
- "proprietario.cep": CEP

═══════════════════════════════════════════════════════
PROPRIETÁRIO ANTERIOR (VENDEDOR)
═══════════════════════════════════════════════════════

- "proprietarioAnterior.nome": nome do vendedor/revendedor
- "proprietarioAnterior.cpfCnpj": CPF ou CNPJ do vendedor
- "proprietarioAnterior.municipio": município do vendedor
- "proprietarioAnterior.uf": UF do vendedor

Se um campo não existir no documento, deixe a string vazia "". Não invente dados.`;

async function chamarGeminiComRetry(pdfBase64: string, prompt: string, maxTentativas = 3): Promise<string> {
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
        try {
            const result = await model.generateContent([
                { inlineData: { data: pdfBase64, mimeType: 'application/pdf' } },
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
    const pdfBase64 = arrayBufferToBase64(arrayBuffer);

    const textoResposta = await chamarGeminiComRetry(pdfBase64, PROMPT_FICHA_CADASTRO);

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
        tipoServico: limpar(parsed.tipoServico) || 'segunda_via',
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

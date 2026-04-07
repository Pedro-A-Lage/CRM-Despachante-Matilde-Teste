// ============================================
// CRLV-e AI - Extração via Google Gemini
// Envia o PDF do CRLV-e para Gemini extrair dados do proprietário e veículo
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

/** Detecta mimeType — aceita PDF e imagens (PNG, JPEG, WebP). */
function detectarMimeType(file: File): string {
    if (file.type) return file.type;
    const nome = file.name.toLowerCase();
    if (nome.endsWith('.pdf')) return 'application/pdf';
    if (nome.endsWith('.png')) return 'image/png';
    if (nome.endsWith('.jpg') || nome.endsWith('.jpeg')) return 'image/jpeg';
    if (nome.endsWith('.webp')) return 'image/webp';
    return 'application/pdf';
}

export interface DadosCRLVe {
    tipoDocumento: string;
    placa: string;
    chassi: string;
    renavam: string;
    marcaModelo: string;
    anoFabricacao: string;
    anoModelo: string;
    cor: string;
    categoria: string;
    combustivel: string;
    proprietario: {
        nome: string;
        cpfCnpj: string;
        tipoCpfCnpj: 'CPF' | 'CNPJ';
        endereco: string;
        numero: string;
        bairro: string;
        municipio: string;
        uf: string;
        cep: string;
    };
}

const PROMPT_CRLVE = `Você é um especialista em documentos veiculares brasileiros. Analise este CRLV-e (Certificado de Registro e Licenciamento de Veículo Eletrônico) e extraia os dados.

Retorne APENAS um objeto JSON válido, sem markdown, sem explicações:
{
  "tipoDocumento": "",
  "placa": "",
  "chassi": "",
  "renavam": "",
  "marcaModelo": "",
  "anoFabricacao": "",
  "anoModelo": "",
  "cor": "",
  "categoria": "",
  "combustivel": "",
  "proprietario": {
    "nome": "",
    "cpfCnpj": "",
    "tipoCpfCnpj": "",
    "endereco": "",
    "numero": "",
    "bairro": "",
    "municipio": "",
    "uf": "",
    "cep": ""
  }
}

═══════════════════════════════════════════════════════
IDENTIFICAÇÃO DO DOCUMENTO
═══════════════════════════════════════════════════════

- Se o título contém "CERTIFICADO DE REGISTRO E LICENCIAMENTO" → "crlve"
- Se contém "AUTORIZAÇÃO PARA TRANSFERÊNCIA" → "atpve"
- Senão → "outro"
- Se NÃO for CRLV-e, retorne apenas tipoDocumento e todos os outros campos vazios.

═══════════════════════════════════════════════════════
CAMPOS DO VEÍCULO
═══════════════════════════════════════════════════════

- "placa": maiúsculo, sem espaços (ex: "ABC1D23" ou "ABC1234")
- "chassi": 17 caracteres alfanuméricos
- "renavam": apenas dígitos (ex: "00490915965")
- "marcaModelo": marca/modelo/versão (ex: "FIAT/MOBI LIKE")
- "anoFabricacao": 4 dígitos
- "anoModelo": 4 dígitos
- "cor": cor predominante (ex: "BRANCA", "PRATA")
- "categoria": categoria do veículo (ex: "PARTICULAR", "OFICIAL")
- "combustivel": tipo de combustível (ex: "ÁLCOOL/GASOLINA", "FLEX")

═══════════════════════════════════════════════════════
DADOS DO PROPRIETÁRIO
═══════════════════════════════════════════════════════

- "proprietario.nome": nome completo do proprietário
- "proprietario.cpfCnpj": CPF ou CNPJ com pontuação
- "proprietario.tipoCpfCnpj": "CPF" se 11 dígitos, "CNPJ" se 14
- "proprietario.endereco": logradouro SEM número
- "proprietario.numero": número do imóvel
- "proprietario.bairro": bairro
- "proprietario.municipio": município
- "proprietario.uf": UF (2 letras)
- "proprietario.cep": CEP com ou sem hífen

═══════════════════════════════════════════════════════
ERROS COMUNS — NÃO COMETA
═══════════════════════════════════════════════════════

❌ ERRADO: Colocar nome de cidade no campo "nome" do proprietário
✅ CERTO: "nome" é SEMPRE nome de pessoa

❌ ERRADO: Incluir número e complemento no campo endereco
✅ CERTO: endereco="RUA DIAMANTE", numero="245" (separados)

Se um campo não existir no documento, deixe a string vazia "". Não invente dados.`;

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

export async function extrairDadosCRLVeComIA(file: File): Promise<DadosCRLVe> {
    const arrayBuffer = await file.arrayBuffer();
    const dataBase64 = arrayBufferToBase64(arrayBuffer);
    const mimeType = detectarMimeType(file);

    const textoResposta = await chamarGeminiComRetry(dataBase64, mimeType, PROMPT_CRLVE);

    let parsed: any;
    try {
        const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textoResposta);
    } catch {
        throw new Error(`Gemini retornou resposta inválida: ${textoResposta.slice(0, 200)}`);
    }

    const tipoDetectado = (parsed.tipoDocumento || '').toLowerCase().trim();
    if (tipoDetectado && tipoDetectado !== 'crlve') {
        const nomes: Record<string, string> = { atpve: 'ATPV-e', outro: 'documento desconhecido' };
        throw new Error(`Documento inválido: este é um ${nomes[tipoDetectado] || tipoDetectado}, não um CRLV-e. Anexe um CRLV-e para 2ª Via.`);
    }

    const limpar = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

    const tipoCpfCnpj: 'CPF' | 'CNPJ' =
        parsed.proprietario?.tipoCpfCnpj === 'CNPJ' ? 'CNPJ' :
        (limpar(parsed.proprietario?.cpfCnpj).replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF');

    return {
        tipoDocumento: 'crlve',
        placa: limpar(parsed.placa),
        chassi: limpar(parsed.chassi),
        renavam: limpar(parsed.renavam),
        marcaModelo: limpar(parsed.marcaModelo),
        anoFabricacao: limpar(parsed.anoFabricacao),
        anoModelo: limpar(parsed.anoModelo),
        cor: limpar(parsed.cor),
        categoria: limpar(parsed.categoria),
        combustivel: limpar(parsed.combustivel),
        proprietario: {
            nome: limpar(parsed.proprietario?.nome),
            cpfCnpj: limpar(parsed.proprietario?.cpfCnpj),
            tipoCpfCnpj: tipoCpfCnpj,
            endereco: limpar(parsed.proprietario?.endereco),
            numero: limpar(parsed.proprietario?.numero),
            bairro: limpar(parsed.proprietario?.bairro),
            municipio: limpar(parsed.proprietario?.municipio),
            uf: limpar(parsed.proprietario?.uf),
            cep: limpar(parsed.proprietario?.cep),
        },
    };
}

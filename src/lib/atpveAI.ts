// ============================================
// ATPVE AI - Extração via Google Gemini
// Envia o PDF diretamente para Gemini (sem renderização de imagens)
// ============================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DadosExtraidos, DadosPessoa } from './pdfParser';

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

const PROMPT_ATPVE = `Você é um especialista em documentos veiculares brasileiros. Analise este ATPV-e (Autorização para Transferência de Propriedade de Veículo Eletrônico) e extraia os dados.

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
  "numeroCRV": "",
  "codigoSegurancaCRV": "",
  "numeroATPVe": "",
  "hodometro": "",
  "valorRecibo": "",
  "dataAquisicao": "",
  "comprador": {
    "tipoCpfCnpj": "",
    "cpfCnpj": "",
    "nome": "",
    "municipio": "",
    "uf": "",
    "cep": "",
    "endereco": "",
    "numero": "",
    "bairro": ""
  },
  "vendedor": {
    "tipoCpfCnpj": "",
    "cpfCnpj": "",
    "nome": "",
    "municipio": "",
    "uf": ""
  }
}

═══════════════════════════════════════════════════════
LAYOUT REAL DO ATPV-e (versão 2.1) — DUAS COLUNAS
═══════════════════════════════════════════════════════

O documento tem layout de DUAS COLUNAS. NÃO é linear de cima para baixo.
Leia com atenção — cada campo tem uma posição fixa:

┌─────────────────────────────────┬────────────────────────────────┐
│ CABEÇALHO                       │                                │
│ "AUTORIZAÇÃO PARA TRANSFERÊNCIA │  IDENTIFICAÇÃO DO VENDEDOR     │
│  DE PROPRIEDADE DE VEÍCULO      │  ┌──────────────────────────┐  │
│  - DIGITAL"                     │  │ NOME                     │  │
│ DETRAN - XX                     │  │ MARIA DA PENHA DE ...    │  │
│                                 │  │ CPF/CNPJ    │ E-MAIL     │  │
│ ┌────────────────────────┐      │  │ 912.448...  │ email@...  │  │
│ │ CÓDIGO RENAVAM         │ [QR] │  │ MUNICÍPIO   │ UF         │  │
│ │ 00490915965            │      │  │ ITABIRA     │ MG         │  │
│ │ PLACA                  │      │  └──────────────────────────┘  │
│ │ OOX9649                │      │                                │
│ │ ANO FABRICAÇÃO │ ANO MODELO │  │  Valor declarado na venda:    │
│ │ 2012           │ 2013       │  │  R$ 50.000,00                 │
│ └────────────────────────┘      │                                │
│                                 │  LOCAL _______________          │
│ MARCA / MODELO / VERSÃO         │                                │
│ FORD/ECOSPORT TIT 2.0           │  DATA DECLARADA DA VENDA ___   │
│                                 │                                │
│ CAT: ***                        │                                │
│                                 │                                │
│ COR PREDOMINANTE │ CHASSI       │                                │
│ PRATA            │ 9BFZB55H...  │                                │
│                                 │                                │
│ NÚMERO CRV       │ CÓD SEG CRV │                                │
│ 223614924343     │ 08517468392  │                                │
│                                 │                                │
│ NÚMERO ATPVe     │ DATA EMISSÃO │                                │
│ 253221027915965  │ 22/12/2022   │                                │
│                                 │                                │
│ HODÔMETRO                       │                                │
│ 120                             │                                │
├─────────────────────────────────┴────────────────────────────────┤
│                                                                  │
│ IDENTIFICAÇÃO DO COMPRADOR                                       │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ NOME                                                        │ │
│ │ JUNIOR ANTONIO MEIRELES E SILVA                             │ │
│ │ CPF/CNPJ           │ E-MAIL                                 │ │
│ │ 046.935.206-08     │ PRIMEAUTOMOVEIS2@GMAIL.COM             │ │
│ │ MUNICÍPIO DE DOMICÍLIO OU RESIDÊNCIA          │ UF          │ │
│ │ IPATINGA                                      │ MG          │ │
│ │ ENDEREÇO DE DOMICÍLIO OU RESIDÊNCIA                         │ │
│ │ DIAMANTE 245 AP501                                          │ │
│ │ IGUACU CEP: 35162-057                                       │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════
ONDE ESTÁ CADA CAMPO — LEIA COM CUIDADO
═══════════════════════════════════════════════════════

TIPO DO DOCUMENTO:
- Se o título contém "AUTORIZAÇÃO PARA TRANSFERÊNCIA DE PROPRIEDADE DE VEÍCULO" → "atpve"
- Se contém "CERTIFICADO DE REGISTRO E LICENCIAMENTO" → "crlv"
- Senão → "outro"
- Se NÃO for ATPV-e, retorne apenas tipoDocumento e todos os outros campos vazios.

COLUNA ESQUERDA SUPERIOR — DADOS DO VEÍCULO:
- "renavam": label "CÓDIGO RENAVAM", valor abaixo (ex: "00490915965"), apenas dígitos
- "placa": label "PLACA", valor abaixo (ex: "OOX9649"), maiúsculo sem espaços
- "anoFabricacao": label "ANO FABRICAÇÃO", 4 dígitos
- "anoModelo": label "ANO MODELO", 4 dígitos, célula ao lado do ano fabricação
- "marcaModelo": label "MARCA / MODELO / VERSÃO", valor abaixo (ex: "FORD/ECOSPORT TIT 2.0")
- "cor": label "COR PREDOMINANTE", valor abaixo (ex: "PRATA")
- "chassi": label "CHASSI", valor ao lado da cor (ex: "9BFZB55H0D8773108"), 17 caracteres
- "numeroCRV": label "NÚMERO CRV", valor abaixo (ex: "223614924343")
- "codigoSegurancaCRV": label "CÓDIGO DE SEGURANÇA CRV", valor ao lado do número CRV
- "numeroATPVe": label "NÚMERO ATPVe", valor abaixo (ex: "253221027915965")
- "hodometro": label "HODÔMETRO", valor abaixo (ex: "120")

COLUNA DIREITA SUPERIOR — IDENTIFICAÇÃO DO VENDEDOR:
  A seção "IDENTIFICAÇÃO DO VENDEDOR" fica no CANTO SUPERIOR DIREITO do documento.
  Cada campo tem um label em cima e o valor embaixo:
- "vendedor.nome": label "NOME", valor na linha abaixo (ex: "MARIA DA PENHA DE ALMEIDA")
  ⚠️ O NOME é um nome de PESSOA (ex: "MARIA DA PENHA DE ALMEIDA"), NUNCA é nome de cidade.
- "vendedor.cpfCnpj": label "CPF/CNPJ", valor abaixo (ex: "912.448.896-87")
- "vendedor.tipoCpfCnpj": "CPF" se tem 11 dígitos, "CNPJ" se tem 14
- "vendedor.municipio": label "MUNICÍPIO DE DOMICÍLIO OU RESIDÊNCIA", valor abaixo
- "vendedor.uf": label "UF", valor ao lado do município (ex: "MG")

COLUNA DIREITA — VALOR E DATA DA VENDA:
- "valorRecibo": texto "Valor declarado na venda: R$" seguido do valor (ex: "50.000,00"). Extraia SEM o "R$".
- "dataAquisicao": label "DATA DECLARADA DA VENDA", valor ao lado ou abaixo.
  ⚠️ CRITICAL: Se este campo estiver em branco/vazio no documento, retorne "".
  NUNCA use "DATA EMISSÃO DO CRV" (que fica na coluna esquerda) nem nenhuma outra data.

PARTE INFERIOR — IDENTIFICAÇÃO DO COMPRADOR:
  A seção "IDENTIFICAÇÃO DO COMPRADOR" ocupa toda a largura na PARTE DE BAIXO do documento.
  Cada campo tem um label em cima e o valor embaixo:
- "comprador.nome": label "NOME", valor na linha abaixo (ex: "JUNIOR ANTONIO MEIRELES E SILVA")
  ⚠️ O NOME é um nome de PESSOA COMPLETO. NUNCA é nome de cidade ou município.
  Se você leu "IPATINGA" como nome, ESTÁ ERRADO — isso é o município.
- "comprador.cpfCnpj": label "CPF/CNPJ", valor abaixo (ex: "046.935.206-08")
- "comprador.tipoCpfCnpj": "CPF" se 11 dígitos, "CNPJ" se 14
- "comprador.municipio": label "MUNICÍPIO DE DOMICÍLIO OU RESIDÊNCIA", valor abaixo (ex: "IPATINGA")
  ⚠️ Município é nome de CIDADE, não nome de pessoa.
- "comprador.uf": label "UF", valor ao lado do município (ex: "MG"), 2 letras

ENDEREÇO DO COMPRADOR (campo mais complexo):
  O endereço vem numa única caixa com label "ENDEREÇO DE DOMICÍLIO OU RESIDÊNCIA".
  O conteúdo pode ter TUDO junto em 1-2 linhas, exemplo:
    "DIAMANTE 245 AP501"
    "IGUACU CEP: 35162-057"
  Você precisa SEPARAR assim:
  - "comprador.endereco": SOMENTE o nome da rua/logradouro, SEM número (ex: "DIAMANTE")
  - "comprador.numero": SOMENTE o número do imóvel, primeiro número após o nome da rua (ex: "245")
    Ignore complemento como "AP501", "BLOCO B", "SALA 3" etc.
  - "comprador.bairro": nome do bairro, que geralmente aparece na SEGUNDA LINHA antes do CEP (ex: "IGUACU")
  - "comprador.cep": 8 dígitos, com ou sem hífen (ex: "35162-057" ou "35162057")

═══════════════════════════════════════════════════════
ERROS COMUNS — NÃO COMETA ESTES ERROS
═══════════════════════════════════════════════════════

❌ ERRADO: Colocar nome de cidade (IPATINGA, ITABIRA) no campo "nome" do comprador ou vendedor
✅ CERTO: "nome" é SEMPRE nome de pessoa (ex: "JUNIOR ANTONIO MEIRELES E SILVA")

❌ ERRADO: Confundir comprador com vendedor (são seções diferentes do documento)
✅ CERTO: VENDEDOR fica no CANTO SUPERIOR DIREITO, COMPRADOR fica na PARTE INFERIOR

❌ ERRADO: Usar "DATA EMISSÃO DO CRV" (22/12/2022) como dataAquisicao
✅ CERTO: dataAquisicao é SOMENTE "DATA DECLARADA DA VENDA" — se vazio, retornar ""

❌ ERRADO: Incluir número e complemento no campo endereco
✅ CERTO: endereco="DIAMANTE", numero="245" (separados)

❌ ERRADO: Incluir "R$" no valorRecibo
✅ CERTO: valorRecibo="50.000,00" (só o número)

Se um campo não existir no documento, deixe a string vazia "". Não invente dados.`;

export interface DadosDecalque {
  /** Tipo de serviço identificado pelo cabeçalho da folha (string vazia se IA não conseguiu detectar). */
  tipoServicoFolha?: string;
  placa: string;
  chassi: string;
  renavam: string;
  valorRecibo: string;
  dataAquisicao: string;
  municipioEmplacamento: string;
  comprador: {
    nome: string;
    cpfCnpj: string;
    tipoCpfCnpj: 'CPF' | 'CNPJ';
    rg: string;
    orgaoExpedidor: string;
    uf: string;
    endereco: string;
    numero: string;
    cep: string;
    bairro: string;
    municipio: string;
  };
  vendedor: {
    nome: string;
    cpfCnpj: string;
    tipoCpfCnpj: 'CPF' | 'CNPJ';
  };
  veiculo: {
    tipo: string;
    marcaModelo: string;
    anoFabricacao: string;
    anoModelo: string;
    cor: string;
    combustivel: string;
  };
}

const PROMPT_DECALQUE = `Você é um especialista em documentos do Detran/MG. Analise este "DECALQUE CHASSI" / "DOCUMENTO DE CADASTRO" (Folha de Cadastro do Detran/MG) e extraia EXATAMENTE os campos abaixo.

CONTEXTO IMPORTANTE
═══════════════════
O documento tem sempre o mesmo layout, dividido em blocos:
1. Cabeçalho — com o título "DECALQUE CHASSI" e a linha "IDENTIFICAÇÃO DO VEÍCULO E MOTIVO DO PREENCHIMENTO: <MOTIVO>" (este motivo é o serviço).
2. Bloco "DADOS DO PROPRIETÁRIO" (proprietário ATUAL = comprador na transferência).
3. Bloco "ENDEREÇO DO PROPRIETÁRIO".
4. Bloco "ENDEREÇO DE CORRESPONDÊNCIA" — IGNORE, é só correspondência. Use sempre o "ENDEREÇO DO PROPRIETÁRIO" para o comprador.
5. Bloco "DADOS DO PROPRIETÁRIO ANTERIOR" (vendedor — pode estar em branco se não houver).
6. Blocos "CARACTERÍSTICAS DO VEÍCULO" e "CARACTERÍSTICAS DO VEÍCULO DE CARGA".
7. Bloco "RESTRIÇÕES À VENDA".

Algumas folhas trazem MENOS campos preenchidos que outras (ex.: baixa não tem comprador, primeiro emplacamento não tem proprietário anterior, alteração de características pode não ter valor de recibo). Se um campo não existir ou estiver em branco, retorne string vazia "" — NUNCA invente.

DETECÇÃO DO TIPO DE SERVIÇO
═══════════════════════════
Leia a linha "MOTIVO DO PREENCHIMENTO" no topo e mapeie para EXATAMENTE um destes valores em "tipoServicoFolha":
- "TRANSFERÊNCIA DE PROPRIEDADE" / "TRANSFERENCIA" → "transferencia"
- "ALTERAÇÃO DE DADOS" / "INCLUSÃO DE GRAVAME" / "RETIRADA DE GRAVAME" / "INCLUSÃO DE RESTRIÇÃO" → "alteracao_dados"
- "ALTERAÇÃO DE CARACTERÍSTICA" / "MUDANÇA DE CARACTERÍSTICA" → "mudanca_caracteristica"
- "BAIXA" / "BAIXA DE VEÍCULO" → "baixa"
- "PRIMEIRO EMPLACAMENTO" / "EMPLACAMENTO INICIAL" → "primeiro_emplacamento"
- Qualquer outro caso ou ambíguo → ""

FORMATO DE SAÍDA
════════════════
Retorne APENAS um objeto JSON válido, sem markdown, sem comentários, sem texto antes/depois:
{
  "tipoServicoFolha": "",
  "placa": "",
  "chassi": "",
  "renavam": "",
  "valorRecibo": "",
  "dataAquisicao": "",
  "municipioEmplacamento": "",
  "comprador": {
    "nome": "",
    "cpfCnpj": "",
    "tipoCpfCnpj": "",
    "rg": "",
    "orgaoExpedidor": "",
    "uf": "",
    "endereco": "",
    "numero": "",
    "cep": "",
    "bairro": "",
    "municipio": ""
  },
  "vendedor": {
    "nome": "",
    "cpfCnpj": "",
    "tipoCpfCnpj": ""
  },
  "veiculo": {
    "tipo": "",
    "marcaModelo": "",
    "anoFabricacao": "",
    "anoModelo": "",
    "cor": "",
    "combustivel": ""
  }
}

REGRAS DE NORMALIZAÇÃO
══════════════════════
- "placa": maiúsculas, SEM espaços nem hífen (ex.: "BML0109").
- "chassi": exatamente como aparece, maiúsculas, sem espaços (17 caracteres no padrão).
- "renavam": apenas dígitos.
- "valorRecibo": número em reais com PONTO decimal e SEM separador de milhar nem "R$". Ex.: "R$ 140.000,00" → "140000.00". Se em branco, "".
- "dataAquisicao": formato "DD/MM/YYYY". Se em branco, "".
- "municipioEmplacamento": exatamente como aparece (ex.: "ITAMBE DO MATO DENTRO").
- "comprador" = bloco DADOS DO PROPRIETÁRIO + ENDEREÇO DO PROPRIETÁRIO (NÃO o de correspondência).
- "comprador.nome": nome completo, exatamente como impresso.
- "comprador.cpfCnpj": apenas dígitos (sem pontos, traços ou barras).
- "comprador.tipoCpfCnpj": "CPF" se tiver 11 dígitos, "CNPJ" se 14.
- "comprador.rg": número do "N. DOC.IDENTIDADE" — apenas dígitos/letras como aparece, sem prefixo.
- "comprador.orgaoExpedidor": ex.: "SSP", "PC", "DETRAN".
- "comprador.uf": SIGLA UF do órgão expedidor (2 letras). Se não houver, "".
- "comprador.endereco": logradouro SEM número e SEM bairro (ex.: "RUA ITABIRA").
- "comprador.numero": apenas o número do imóvel (ex.: "43"). Se "S/N", devolva "S/N".
- "comprador.cep": apenas dígitos (8 dígitos), sem hífen.
- "comprador.bairro": nome do bairro.
- "comprador.municipio": nome do município (ex.: "ITAMBE DO MATO DENTRO").
- "vendedor" = bloco DADOS DO PROPRIETÁRIO ANTERIOR. Pode estar inteiramente em branco — nesse caso devolva todas as strings vazias.
- "vendedor.cpfCnpj": apenas dígitos.
- "vendedor.tipoCpfCnpj": "CPF" se 11 dígitos, "CNPJ" se 14, "" se vazio.
- "veiculo.tipo": texto após o código (ex.: "025 - UTILITARIO" → "UTILITARIO"). Sem o código numérico.
- "veiculo.marcaModelo": exatamente como aparece (ex.: "I/LR R.R SPT 3.0 TD HSE").
- "veiculo.anoFabricacao": 4 dígitos.
- "veiculo.anoModelo": 4 dígitos.
- "veiculo.cor": SOMENTE o nome da cor, sem o código (ex.: "11 - PRETA" → "PRETA"). Se for "-" ou vazio, devolva "".
- "veiculo.combustivel": ex.: "DIESEL", "GASOLINA", "FLEX", "ALCOOL".

REGRAS GERAIS
═════════════
- Se um campo não existir no documento OU estiver em branco, devolva "" — NUNCA chute, NUNCA copie de outro bloco.
- NÃO confunda "ENDEREÇO DO PROPRIETÁRIO" com "ENDEREÇO DE CORRESPONDÊNCIA".
- NÃO confunda "DATA DA AQUISIÇÃO" (que vai em dataAquisicao) com "DATA DE RECEBIMENTO" do cabeçalho.
- NÃO inclua R$, pontos de milhar nem vírgula no valorRecibo.
- Devolva APENAS o JSON, nada mais.
`;

export async function extrairDecalqueChassi(file: File): Promise<DadosDecalque> {
    const arrayBuffer = await file.arrayBuffer();
    const dataBase64 = arrayBufferToBase64(arrayBuffer);
    const mimeType = detectarMimeType(file);

    const result = await model.generateContent([
        { inlineData: { data: dataBase64, mimeType } },
        { text: PROMPT_DECALQUE },
    ]);

    const texto = result.response.text();

    try {
        const jsonMatch = texto.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : texto);
        const limpar = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
        return {
            tipoServicoFolha: limpar(parsed.tipoServicoFolha),
            placa: limpar(parsed.placa),
            chassi: limpar(parsed.chassi),
            renavam: limpar(parsed.renavam),
            valorRecibo: limpar(parsed.valorRecibo),
            dataAquisicao: limpar(parsed.dataAquisicao),
            municipioEmplacamento: limpar(parsed.municipioEmplacamento),
            comprador: {
                nome: limpar(parsed.comprador?.nome),
                cpfCnpj: limpar(parsed.comprador?.cpfCnpj),
                tipoCpfCnpj: (parsed.comprador?.tipoCpfCnpj === 'CNPJ' ? 'CNPJ' : 'CPF') as 'CPF' | 'CNPJ',
                rg: limpar(parsed.comprador?.rg),
                orgaoExpedidor: limpar(parsed.comprador?.orgaoExpedidor),
                uf: limpar(parsed.comprador?.uf),
                endereco: limpar(parsed.comprador?.endereco),
                numero: limpar(parsed.comprador?.numero),
                cep: limpar(parsed.comprador?.cep),
                bairro: limpar(parsed.comprador?.bairro),
                municipio: limpar(parsed.comprador?.municipio),
            },
            vendedor: {
                nome: limpar(parsed.vendedor?.nome),
                cpfCnpj: limpar(parsed.vendedor?.cpfCnpj),
                tipoCpfCnpj: (parsed.vendedor?.tipoCpfCnpj === 'CNPJ' ? 'CNPJ' : 'CPF') as 'CPF' | 'CNPJ',
            },
            veiculo: {
                tipo: limpar(parsed.veiculo?.tipo),
                marcaModelo: limpar(parsed.veiculo?.marcaModelo),
                anoFabricacao: limpar(parsed.veiculo?.anoFabricacao),
                anoModelo: limpar(parsed.veiculo?.anoModelo),
                cor: limpar(parsed.veiculo?.cor),
                combustivel: limpar(parsed.veiculo?.combustivel),
            },
        } satisfies DadosDecalque;
    } catch {
        throw new Error(`IA retornou resposta inválida para Decalque: ${texto.slice(0, 200)}`);
    }
}

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
            // Retry em caso de 429 (rate limit) ou 503 (overloaded)
            if ((msg.includes('429') || msg.includes('503')) && tentativa < maxTentativas) {
                // Extrai delay sugerido ou usa 20s
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

export async function extrairDadosATPVeComIA(file: File): Promise<DadosExtraidos> {
    const arrayBuffer = await file.arrayBuffer();
    const dataBase64 = arrayBufferToBase64(arrayBuffer);
    const mimeType = detectarMimeType(file);

    const textoResposta = await chamarGeminiComRetry(dataBase64, mimeType, PROMPT_ATPVE);

    // Parse do JSON retornado
    let parsed: any;
    try {
        const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textoResposta);
    } catch {
        throw new Error(`Gemini retornou resposta inválida: ${textoResposta.slice(0, 200)}`);
    }

    // Valida tipo de documento antes de processar
    const tipoDetectado = (parsed.tipoDocumento || '').toLowerCase().trim();
    if (tipoDetectado && tipoDetectado !== 'atpve') {
        const nomes: Record<string, string> = { crlv: 'CRLV', outro: 'documento desconhecido' };
        throw new Error(`Documento inválido: este é um ${nomes[tipoDetectado] || tipoDetectado}, não um ATPV-e. Anexe um ATPV-e para transferência.`);
    }

    const limpar = (val: any) => (val && val !== '') ? val : undefined;

    // Monta comprador
    const comprador: DadosPessoa = {
        nome: limpar(parsed.comprador?.nome),
        cpfCnpj: limpar(parsed.comprador?.cpfCnpj),
        municipio: limpar(parsed.comprador?.municipio),
        uf: limpar(parsed.comprador?.uf),
        cep: limpar(parsed.comprador?.cep),
        endereco: limpar(parsed.comprador?.endereco),
        numero: limpar(parsed.comprador?.numero),
        bairro: limpar(parsed.comprador?.bairro),
    };

    // Monta vendedor
    const vendedor: DadosPessoa = {
        nome: limpar(parsed.vendedor?.nome),
        cpfCnpj: limpar(parsed.vendedor?.cpfCnpj),
        municipio: limpar(parsed.vendedor?.municipio),
        uf: limpar(parsed.vendedor?.uf),
    };

    // tipoCpfCnpj — prefer o que a IA retornou; fallback por contagem de dígitos
    const tipoCpfCnpjComprador: string =
        limpar(parsed.comprador?.tipoCpfCnpj) ||
        ((comprador.cpfCnpj?.replace(/\D/g, '').length ?? 0) <= 11 ? 'CPF' : 'CNPJ');

    const tipoCpfCnpjVendedor: string =
        limpar(parsed.vendedor?.tipoCpfCnpj) ||
        ((vendedor.cpfCnpj?.replace(/\D/g, '').length ?? 0) <= 11 ? 'CPF' : 'CNPJ');

    const resultado: DadosExtraidos = {
        tipoDocumento: 'atpve',
        placa: limpar(parsed.placa),
        renavam: limpar(parsed.renavam),
        chassi: limpar(parsed.chassi),
        marcaModelo: limpar(parsed.marcaModelo),
        anoFabricacao: limpar(parsed.anoFabricacao),
        anoModelo: limpar(parsed.anoModelo),
        cor: limpar(parsed.cor),
        numeroCRV: limpar(parsed.numeroCRV),
        codigoSegurancaCRV: limpar(parsed.codigoSegurancaCRV),
        numeroATPVe: limpar(parsed.numeroATPVe),
        hodometro: limpar(parsed.hodometro),
        // DATA: SOMENTE "DATA DECLARADA DA VENDA" — nunca fallback para outra data
        dataAquisicao: limpar(parsed.dataAquisicao),
        valorRecibo: limpar(parsed.valorRecibo),
        comprador,
        vendedor,
        // Campos extras usados pelo Detran
        cpfCnpj: comprador.cpfCnpj,
        nomeAdquirente: comprador.nome,
        cpfCnpjAdquirente: comprador.cpfCnpj,
        nomeVendedor: vendedor.nome,
        cpfCnpjVendedor: vendedor.cpfCnpj,
        // ufOrigem = UF do vendedor
        ufOrigem: vendedor.uf,
        tipoCpfCnpjComprador,
        tipoCpfCnpjVendedor,
        tipoServicoDetectado: 'transferencia',
        textoCompleto: textoResposta,
    } as any;

    return resultado;
}

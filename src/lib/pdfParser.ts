// ============================================
// PDF PARSER v2 - Parser unificado para documentos veiculares
// Detecta e extrai dados de: ATPV-e, Folha de Cadastro, Laudo de Vistoria, CRLV
// ============================================

// @ts-ignore - pdfjs-dist v3 doesn't have mjs build
import * as pdfjsLib from 'pdfjs-dist/build/pdf.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// ============================================
// TIPOS
// ============================================

export type TipoDocumento = 'atpve' | 'folha_cadastro' | 'laudo_vistoria' | 'crlv' | 'desconhecido';

export interface DadosPessoa {
    nome?: string;
    cpfCnpj?: string;
    tipoCpfCnpj?: 'CPF' | 'CNPJ';
    email?: string;
    municipio?: string;
    uf?: string;
    endereco?: string;
    numero?: string;
    bairro?: string;
    cep?: string;
    telefone?: string;
}

export interface DadosExtraidos {
    // Identificação do documento
    tipoDocumento: TipoDocumento;

    // Dados do veículo
    placa?: string;
    renavam?: string;
    chassi?: string;
    marcaModelo?: string;
    anoFabricacao?: string;
    anoModelo?: string;
    cor?: string;
    combustivel?: string;
    categoria?: string;
    especie?: string;
    tipo?: string;
    potencia?: string;
    capacidadePassageiros?: string;

    // Dados do documento
    numeroCRV?: string;
    codigoSegurancaCRV?: string;
    numeroATPVe?: string;
    dataEmissao?: string;
    dataAquisicao?: string;
    valorRecibo?: string;
    hodometro?: string;

    // Proprietário / Comprador
    nomeProprietario?: string;
    cpfCnpj?: string;
    comprador?: DadosPessoa;

    // Vendedor / Proprietário Anterior
    vendedor?: DadosPessoa;

    // Mapeamento de serviço
    motivoPreenchimento?: string;
    tipoServicoDetectado?: string;
    localVenda?: string;

    // Vistoria
    resultadoVistoria?: string;
    dataVistoria?: string;
    dataValidadeVistoria?: string;
    observacoesVistoria?: string;
    vistoriador?: string;

    // DAE (boleto) - da Folha de Cadastro
    daeValor?: string;
    daeLinhaDigitavel?: string;
    daeDataEmissao?: string;

    // Compatibilidade com código existente
    nomeAdquirente?: string;
    cpfCnpjAdquirente?: string;
    nomeVendedor?: string;
    cpfCnpjVendedor?: string;

    // Texto bruto para debug
    textoCompleto: string;
}

// ============================================
// EXTRAÇÃO DE TEXTO DO PDF
// ============================================

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

    console.log('[Matilde][Parser] Texto bruto extraído do PDF (primeiros 3000 chars):\n', fullText.substring(0, 3000));
    console.log('[Matilde][Parser] Texto bruto (3000-6000):\n', fullText.substring(3000, 6000));
    return fullText;
}

// ============================================
// DETECÇÃO DO TIPO DE DOCUMENTO
// ============================================

export function detectarTipoDocumento(text: string): TipoDocumento {
    const t = text.toUpperCase();

    if (t.includes('AUTORIZAÇÃO PARA TRANSFERÊNCIA DE PROPRIEDADE DE VEÍCULO') ||
        t.includes('AUTORIZA') && t.includes('TRANSFER') && t.includes('PROPRIEDADE') && t.includes('DIGITAL')) {
        return 'atpve';
    }

    if (t.includes('DECALQUE CHASSI') || t.includes('DOCUMENTO DE CADASTRO')) {
        return 'folha_cadastro';
    }

    if (t.includes('LAUDO DE VISTORIA') || t.includes('VISTORIA ELETRÔNICA') || t.includes('VISTORIA ELETRONICA')) {
        return 'laudo_vistoria';
    }

    if (t.includes('CERTIFICADO DE REGISTRO E LICENCIAMENTO') || t.includes('CRLV')) {
        return 'crlv';
    }

    return 'desconhecido';
}

// ============================================
// FUNÇÕES UTILITÁRIAS
// ============================================

function formatCpfCnpj(v: string): string {
    const clean = v.replace(/\D/g, '');
    if (clean.length === 11) {
        return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (clean.length === 14) {
        return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return v;
}

function limparTexto(str: string | undefined): string | undefined {
    if (!str) return undefined;
    return str.replace(/\s+/g, ' ').trim() || undefined;
}

function extrairCpfCnpj(text: string): string | undefined {
    // CNPJ formatado: 00.000.000/0000-00
    const cnpj = text.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
    if (cnpj) return cnpj[1];

    // CPF formatado: 000.000.000-00
    const cpf = text.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/);
    if (cpf) return cpf[1];

    // CPF/CNPJ cru após label
    const raw = text.match(/(?:CPF\/CNPJ|CPF|CNPJ)\s*:?\s*(\d{11}|\d{14})\b/i);
    if (raw) return formatCpfCnpj(raw[1]!);

    return undefined;
}

function extrairPlaca(text: string): string | undefined {
    // Label + placa
    const label = text.match(/PLACA\s*:?\s*([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2})/i);
    if (label) return label[1]!.replace(/[\s-]/g, '').toUpperCase();

    // Placa genérica
    const gen = text.match(/\b([A-Z]{3}\s?-?\s?\d[A-Z0-9]\d{2})\b/i);
    if (gen) return gen[1]!.replace(/[\s-]/g, '').toUpperCase();

    return undefined;
}

function extrairRenavam(text: string): string | undefined {
    const label = text.match(/(?:RENAVAM|C[OÓ]D(?:IGO)?\s*RENAVAM)\s*:?\s*(\d{9,11})/i);
    if (label) return label[1]!.padStart(11, '0');

    // Busca por linha que contenha "renavam"
    const lines = text.split('\n');
    for (const line of lines) {
        if (/renavam/i.test(line)) {
            const num = line.match(/(\d{9,11})/);
            if (num) return num[1]!.padStart(11, '0');
        }
    }
    return undefined;
}

function extrairChassi(text: string): string | undefined {
    // Com label
    const label = text.match(/CHASSI\s*:?\s*([A-HJ-NPR-Z0-9]{17})/i);
    if (label) return label[1]!.toUpperCase();

    // Genérico 17 chars
    const gen = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
    if (gen) return gen[1]!.toUpperCase();

    return undefined;
}

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

// ============================================
// CONSTANTES COMPARTILHADAS PELOS PARSERS
// ============================================

const UFS_BR = 'MG|SP|RJ|ES|BA|GO|PR|SC|RS|MT|MS|DF|TO|PA|AM|MA|PI|CE|RN|PB|PE|AL|SE|RO|AC|AP|RR';
const RE_LOCAL_DATA_UF = new RegExp(`([A-Z][A-Z\\s]+?)\\s+(\\d{2}\\/\\d{2}\\/\\d{4})\\s+(${UFS_BR})`, 'i');
const RE_LOCAL_DATA_UF_EOL = new RegExp(`([A-Z][A-Z\\s]+?)\\s+(\\d{2}\\/\\d{2}\\/\\d{4})\\s+(${UFS_BR})\\s*$`, 'm');

// Extrai valor monetário BR (ex: "198.000,00") de uma string que pode ter lixo antes (ex: "091198.000,00")
function extrairMonetario(raw: string): string | undefined {
    const s = raw.replace(/\s/g, '');
    const m = s.match(/(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})/);
    return m?.[1];
}

// ============================================
// PARSER: ATPV-e
// ============================================

function parseATPVe(text: string): Partial<DadosExtraidos> {
    const dados: Partial<DadosExtraidos> = {};

    // =================================================================
    // O pdfjs extrai o ATPV-e com os LABELS primeiro e os VALORES depois.
    // Exemplo real do texto bruto:
    //   "...NÚMERO ATPVe DATA EMISSÃO DO CRV COR PREDOMINANTE CAT MARCA / MODELO / VERSÃO
    //    AUTORIZAÇÃO PARA TRANSFERÊNCIA...CÓDIGO DE SEGURANÇA CRV CHASSI HODÔMETRO NÚMERO CRV
    //    PLACA ANO FABRICAÇÃO ANO MODELO CÓDIGO RENAVAM...
    //    01397696637 SYY5E98 2024 2025 I/GWM HAVAL H6 PREM PHEV *** BRANCA
    //    LGWFFUA50SH907000 264642660739 81382716636 260651731696637 02/03/2026 21402
    //    ROGERIA MARCIA... 841.328.096-68 email ITABIRA MG
    //    BRUNO LAGE... 014.103.916-71 email ITABIRA MG
    //    Endereco... 198.000,00 LOCAL DATA MG"
    // =================================================================

    // Extrai dados básicos com funções genéricas
    dados.placa = extrairPlaca(text);
    dados.renavam = extrairRenavam(text);
    dados.chassi = extrairChassi(text);

    const valorLabel = text.match(/Valor\s*declarado\s*na\s*venda\s*:?\s*R\s*\$\s*([\d][\d\s.,]*[\d])/i);
    if (valorLabel) dados.valorRecibo = extrairMonetario(valorLabel[1]!);

    // Motivo
    dados.motivoPreenchimento = 'TRANSFERÊNCIA DE PROPRIEDADE';
    dados.tipoServicoDetectado = 'transferencia';

    // =================================================================
    // ESTRATÉGIA: Extrair o bloco de dados que vem APÓS os headers.
    // O bloco começa com o renavam (número grande) seguido da placa.
    // =================================================================
    const placa = dados.placa || '';
    const chassi = dados.chassi || '';
    const renavam = dados.renavam || '';

    // Encontra o bloco de dados: começa no renavam e vai até o final
    const renavamPos = renavam ? text.indexOf(renavam) : -1;
    if (renavamPos === -1) return dados;

    const blocoValores = text.substring(renavamPos);

    // Padrão do bloco (baseado em PDFs reais):
    // RENAVAM PLACA ANOFAB ANOMODELO MARCA/MODELO *** COR CHASSI ATPVE CODSEGCRV NUMCRV DATA HODOMETRO
    // NOME_VENDEDOR CPF_VENDEDOR EMAIL_VENDEDOR MUNICIPIO_VENDEDOR UF_VENDEDOR
    // NOME_COMPRADOR CPF_COMPRADOR EMAIL_COMPRADOR MUNICIPIO_COMPRADOR UF_COMPRADOR
    // ENDERECO CEP VALOR LOCAL DATA_VENDA UF

    // --- ANOS: dois números de 4 dígitos logo após a placa ---
    const anosMatch = blocoValores.match(new RegExp(
        placa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(\\d{4})\\s+(\\d{4})'
    ));
    if (anosMatch) {
        dados.anoFabricacao = anosMatch[1];
        dados.anoModelo = anosMatch[2];
    }

    // --- MARCA/MODELO: texto entre anoModelo e "***" ou a cor ---
    if (dados.anoModelo) {
        const posAnoModelo = blocoValores.indexOf(dados.anoModelo, placa.length);
        if (posAnoModelo > -1) {
            const aposAno = blocoValores.substring(posAnoModelo + 4).trim();
            // Captura tudo até "***" ou até uma cor conhecida seguida do chassi
            const marcaMatch = aposAno.match(/^([A-Z0-9\/][A-Z0-9\/\s\.\-]+?)(?:\s+\*{2,}|\s+(?:BRANCA|PRETA|PRATA|CINZA|VERMELHA|AZUL|VERDE|AMARELA|MARROM|BEGE|DOURADA|BRANCO|PRETO|VERMELHO|FANTASIA))/i);
            if (marcaMatch) {
                dados.marcaModelo = limparTexto(marcaMatch[1]);
            }
        }
    }

    // --- COR: palavra de cor antes do chassi ---
    const cores = ['BRANCA', 'PRETA', 'PRATA', 'CINZA', 'VERMELHA', 'AZUL', 'VERDE', 'AMARELA',
        'MARROM', 'BEGE', 'DOURADA', 'BRANCO', 'PRETO', 'VERMELHO', 'FANTASIA', 'LARANJA', 'ROSA'];
    for (const c of cores) {
        if (blocoValores.toUpperCase().includes(c)) {
            // Verifica se a cor está antes do chassi
            const posC = blocoValores.toUpperCase().indexOf(c);
            const posChassi = chassi ? blocoValores.toUpperCase().indexOf(chassi) : -1;
            if (posChassi === -1 || posC < posChassi) {
                dados.cor = c;
                break;
            }
        }
    }

    // --- CATEGORIA (CAT): aparece entre marcaModelo e a cor ---
    // Formato real: "I/GWM HAVAL H6 PREM PHEV *** BRANCA LGWFFUA50SH907000..."
    // "***" indica que a categoria está oculta no documento
    if (dados.anoModelo) {
        const posAnoModelo = blocoValores.indexOf(dados.anoModelo, placa.length);
        if (posAnoModelo > -1) {
            const aposAno = blocoValores.substring(posAnoModelo + 4).trim();
            const catMatch = aposAno.match(/\*{2,}|(?<=\s)(OFI|PAR|ESP|APO)\b/i);
            if (catMatch) dados.categoria = catMatch[0].startsWith('*') ? '***' : catMatch[0].toUpperCase();
        }
    }

    // --- Números após o chassi: ATPVe, CodSegCRV, NumCRV, DataEmissão, Hodômetro ---
    if (chassi) {
        const posChassi = blocoValores.indexOf(chassi);
        if (posChassi > -1) {
            const aposChassi = blocoValores.substring(posChassi + chassi.length).trim();
            // Esperamos: numATPVe(12-18 digs) codSegCRV(9-15 digs) numCRV(12-18 digs) data(dd/mm/yyyy) hodometro(digits)
            const numeros = aposChassi.match(/^(\d{9,18})\s+(\d{9,15})\s+(\d{9,18})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d+)/);
            if (numeros) {
                // Ordem real no PDF: NumCRV, CodSegCRV, NumATPVe, DataEmissao, Hodometro
                dados.numeroCRV = numeros[1];
                dados.codigoSegurancaCRV = numeros[2];
                dados.numeroATPVe = numeros[3];
                dados.dataEmissao = numeros[4];
                dados.hodometro = numeros[5];
            }
        }
    }

    // --- VENDEDOR E COMPRADOR ---
    // Extraímos de forma SEQUENCIAL usando CPFs como âncoras.
    // Texto real: "...21402 ROGERIA MARCIA 841.328.096-68 email@x.com ITABIRA MG BRUNO LAGE 014.103.916-71 email@y.com. br ITABIRA MG Av Emílio..."
    //
    // Abordagem: encontrar cada CPF, pegar NOME antes, depois EMAIL MUNICÍPIO UF após.
    // Para o comprador: o nome começa APÓS a UF do vendedor (2 letras maiúsculas).

    const cpfCnpjRegex = /\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
    const cpfs: { valor: string; pos: number }[] = [];
    let cpfMatch;
    while ((cpfMatch = cpfCnpjRegex.exec(blocoValores)) !== null) {
        cpfs.push({ valor: cpfMatch[0], pos: cpfMatch.index });
    }

    /**
     * Extrai dados de uma pessoa a partir da posição do CPF no blocoValores.
     * @param inicioNome - posição onde começa a busca pelo nome (antes do CPF)
     * @param cpfInfo - posição e valor do CPF
     * @returns objeto com dados da pessoa e posição final (após UF)
     */
    function extrairPessoa(inicioNome: number, cpfInfo: { valor: string; pos: number }, proximoCpfPos?: number) {
        // NOME: texto entre inicioNome e o CPF
        const trechoNome = blocoValores.substring(inicioNome, cpfInfo.pos).trim();
        // Filtra apenas palavras que sejam letras puras (sem @, sem ., sem números).
        const palavras = trechoNome.split(/\s+/).filter(p => /^[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ]+$/i.test(p));
        const nome = palavras.join(' ');

        // Após CPF: email, município, UF
        // IMPORTANTE: limitar busca até o PRÓXIMO CPF para não invadir dados da próxima pessoa
        const fimBusca = proximoCpfPos !== undefined ? proximoCpfPos : blocoValores.length;
        const restante = blocoValores.substring(cpfInfo.pos + cpfInfo.valor.length, fimBusca).trim();

        // Email: tenta padrão normal primeiro; fallback cobre domínio quebrado pelo pdfjs
        let emailMatch = restante.match(/^([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,4}(?:\s*\.\s*[a-zA-Z]{2,3})?)/i);
        if (!emailMatch) {
            emailMatch = restante.match(/^([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9\-]+(?:\s+[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,4})/i);
        }
        const email = emailMatch?.[1]?.replace(/\s+/g, '').toLowerCase() || '';
        const posAposEmail = emailMatch ? emailMatch.index! + emailMatch[0].length : 0;

        // Após email: MUNICÍPIO e UF — pega o PRIMEIRO match (não o último!)
        const restoAposEmail = restante.substring(posAposEmail).trim();
        const ufsBr = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
        const munUfRegex = new RegExp(`([A-ZÁÉÍÓÚÃÕ][A-ZÁÉÍÓÚÃÕ\\s]*?)\\s+(${ufsBr})\\b`);
        const munUfMatch = restoAposEmail.match(munUfRegex);
        const municipio = limparTexto(munUfMatch?.[1]) || '';
        const uf = munUfMatch?.[2] || '';

        // Posição final no blocoValores
        let posFinal = cpfInfo.pos + cpfInfo.valor.length;
        if (municipio && uf) {
            const escaped = municipio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const munUfPosRegex = new RegExp(escaped + '\\s+' + uf + '\\b');
            const blocoAfterCpf = blocoValores.substring(cpfInfo.pos, fimBusca);
            const match = munUfPosRegex.exec(blocoAfterCpf);
            if (match) {
                posFinal = cpfInfo.pos + match.index + match[0].length;
            }
        }

        return { nome, cpfCnpj: cpfInfo.valor, email, municipio, uf, posFinal };
    }

    // Vendedor = primeiro CPF. O nome começa após o hodômetro (último número antes do primeiro nome).
    let fimDadosVeiculo = 0;
    if (dados.hodometro) {
        const posHodo = blocoValores.indexOf(dados.hodometro);
        if (posHodo > -1) {
            fimDadosVeiculo = posHodo + dados.hodometro.length;
        }
    }

    if (cpfs.length >= 1) {
        const vendedorDados = extrairPessoa(fimDadosVeiculo, cpfs[0]!, cpfs[1]?.pos);
        console.log('[Matilde][Parser] Vendedor extraído:', JSON.stringify(vendedorDados));
        console.log('[Matilde][Parser] Trecho após vendedor:', JSON.stringify(blocoValores.substring(vendedorDados.posFinal, vendedorDados.posFinal + 100)));
        dados.vendedor = {
            nome: vendedorDados.nome || undefined,
            cpfCnpj: vendedorDados.cpfCnpj,
            email: vendedorDados.email || undefined,
            municipio: vendedorDados.municipio || undefined,
            uf: vendedorDados.uf || undefined,
        };

        // Comprador = segundo CPF. O nome começa APÓS a UF do vendedor.
        if (cpfs.length >= 2) {
            console.log('[Matilde][Parser] Trecho nome comprador (inicioNome→CPF):', JSON.stringify(blocoValores.substring(vendedorDados.posFinal, cpfs[1]!.pos)));
            const compradorDados = extrairPessoa(vendedorDados.posFinal, cpfs[1]!);

            // Endereço, bairro e CEP: vem após UF do comprador
            // Formato real: "Av Emílio Z da Silva 185 Bela Vista CEP: 35900-091"
            const restoComprador = blocoValores.substring(compradorDados.posFinal).trim();
            const cepMatch = restoComprador.match(/CEP\s*:?\s*(\d{5}-?\d{3})/i);

            // Extrai tudo antes do CEP como bloco de endereço
            // Formato real: "DIAMANTE 245 AP501 IGUACU CEP: 35162-057"
            // Ou: "Av Emílio Z da Silva 185 Bela Vista CEP: 35900-091"
            const enderecoMatch = restoComprador.match(/^(.+?)(?:\s*CEP\s*:?\s*\d{5})/i);
            let enderecoLimpo: string | undefined;
            let numeroEnd: string | undefined;
            let bairro: string | undefined;
            if (enderecoMatch?.[1]) {
                const endFull = enderecoMatch[1].trim();
                // Divide em tokens para extrair: LOGRADOURO NÚMERO [COMPLEMENTO] BAIRRO
                // Último token alfabético = bairro (ex: "IGUACU", "BELA VISTA")
                // Primeiro número = número do imóvel
                // Tudo antes do número = logradouro
                // Tokens entre número e bairro = complemento (ignorado)

                // Encontra o bairro: última sequência de palavras puramente alfabéticas no final
                const bairroMatch = endFull.match(/\s+([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-Za-záéíóúãõâêîôûç]+(?:\s+[A-Za-záéíóúãõâêîôûç]+)*)$/);
                let semBairro = endFull;
                if (bairroMatch) {
                    // Verifica se não é o próprio nome da rua (só aceita como bairro se tem número antes)
                    const antesDoSupostoBairro = endFull.substring(0, endFull.length - bairroMatch[0].length);
                    if (/\d/.test(antesDoSupostoBairro)) {
                        bairro = limparTexto(bairroMatch[1]);
                        semBairro = antesDoSupostoBairro.trim();
                    }
                }

                // Remove complemento (AP501, BLOCO B, etc.) — tokens alfanuméricos após o número
                // Padrão: "DIAMANTE 245 AP501" → logradouro="DIAMANTE", numero="245"
                const partes = semBairro.match(/^(.*?)\s+(\d+)\s*(.*)$/);
                if (partes) {
                    enderecoLimpo = limparTexto(partes[1]); // "DIAMANTE"
                    numeroEnd = partes[2];                    // "245"
                    // partes[3] = complemento (AP501), ignorado
                } else {
                    enderecoLimpo = limparTexto(semBairro);
                }
            }

            dados.comprador = {
                nome: compradorDados.nome || undefined,
                cpfCnpj: compradorDados.cpfCnpj,
                email: compradorDados.email || undefined,
                municipio: compradorDados.municipio || undefined,
                uf: compradorDados.uf || undefined,
                endereco: enderecoLimpo,
                numero: numeroEnd,
                bairro,
                cep: cepMatch?.[1],
            };

            // --- VALOR, LOCAL E DATA — extraídos do trecho após o CEP ---
            // Formato real: "...CEP: 35900-091 198.000,00 ITABIRA 06/03/2026 MG"
            const cepValor = cepMatch?.[1];
            if (cepValor) {
                const cepPos = restoComprador.indexOf(cepValor);
                if (cepPos > -1) {
                    const aposCep = restoComprador.substring(cepPos + cepValor.length).trim();

                    // Valor monetário — pdfjs pode emitir "198 .000,00" (espaço antes do ponto).
                    // Âncora no início do trecho após CEP e usa extrairMonetario que descarta espaços.
                    if (!dados.valorRecibo) {
                        const first = aposCep.trimStart().match(/^([\d\s.,]+)/);
                        if (first) dados.valorRecibo = extrairMonetario(first[1]!);
                    }

                    // Local e data: "ITABIRA 06/03/2026 MG"
                    const ldMatch = aposCep.match(RE_LOCAL_DATA_UF);
                    if (ldMatch) {
                        if (!dados.localVenda) dados.localVenda = limparTexto(ldMatch[1]);
                        if (!dados.dataAquisicao) dados.dataAquisicao = ldMatch[2];
                    }
                }
            }
        }
    }

    // --- FALLBACK: local e data de aquisição pelo padrão no texto completo ---
    if (!dados.localVenda || !dados.dataAquisicao) {
        const ufsBr = 'MG|SP|RJ|ES|BA|GO|PR|SC|RS|MT|MS|DF|TO|PA|AM|MA|PI|CE|RN|PB|PE|AL|SE|RO|AC|AP|RR';
        const localDataUfMatch = text.match(
            new RegExp(`([A-Z][A-Z\\s]+?)\\s+(\\d{2}\\/\\d{2}\\/\\d{4})\\s+(${ufsBr})\\s*$`, 'm')
        );
        if (localDataUfMatch) {
            if (!dados.localVenda) dados.localVenda = limparTexto(localDataUfMatch[1]);
            if (!dados.dataAquisicao) dados.dataAquisicao = localDataUfMatch[2];
        }
    }

    // Fallback dataAquisicao: última data do texto
    if (!dados.dataAquisicao) {
        const datas = [...text.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map(m => m[1]);
        if (datas.length >= 2) dados.dataAquisicao = datas[datas.length - 1];
    }

    return dados;
}

// ============================================
// PARSER: FOLHA DE CADASTRO (DECALQUE CHASSI)
// ============================================

function parseFolhaCadastro(text: string): Partial<DadosExtraidos> {
    const dados: Partial<DadosExtraidos> = {};

    // Veículo — na folha vem inline: "PLACA: GTN8E00 CHASSI: 9BWK..."
    dados.placa = extrairPlaca(text);
    dados.chassi = extrairChassi(text);
    dados.renavam = extrairRenavam(text);

    // Valor do Recibo
    const valor = text.match(/VALOR\s*DO\s*RECIBO\s*:?\s*R\$\s*([\d.,]+)/i);
    if (valor) dados.valorRecibo = valor[1];

    // Data de Aquisição
    const dtAq = text.match(/DATA\s*(?:DA)?\s*AQUISI[CÇ][AÃ]O\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dtAq) dados.dataAquisicao = dtAq[1];

    // Data de Emissão
    const dtEm = text.match(/Emiss[aã]o\s*em\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dtEm) dados.dataEmissao = dtEm[1];

    // Motivo do preenchimento
    const motivo = text.match(/MOTIVO\s*DO\s*PREENCHIMENTO\s*:?\s*([A-ZÀ-Ú\s]+?)(?:\s*Emiss|$)/i);
    if (motivo) {
        dados.motivoPreenchimento = limparTexto(motivo[1]);
        dados.tipoServicoDetectado = dados.motivoPreenchimento
            ? mapMotivoToTipoServico(dados.motivoPreenchimento)
            : undefined;
    }

    // Proprietário atual (comprador na transferência)
    const propSection = text.match(/DADOS\s*DO\s*PROPRIET[AÁ]RIO\s*(?!\s*ANTERIOR)[\s\S]*?(?=DADOS\s*DO\s*PROPRIET[AÁ]RIO\s*ANTERIOR|ENDERE[CÇ]O\s*DE\s*CORRESPOND|CARACTER[IÍ]STICAS)/i);
    if (propSection) {
        const secao = propSection[0];
        const nome = secao.match(/NOME\s*DO\s*PROPRIET[AÁ]RIO\s*:?\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ\s\.\-]+?)(?:\s+CPF)/i);
        const cpf = extrairCpfCnpj(secao);

        dados.comprador = { nome: limparTexto(nome?.[1]), cpfCnpj: cpf };
    }

    // Endereço do proprietário
    const endSection = text.match(/ENDERE[CÇ]O\s*DO\s*PROPRIET[AÁ]RIO[\s\S]*?(?=ENDERE[CÇ]O\s*DE\s*CORRESPOND|DADOS\s*DO\s*PROPRIET[AÁ]RIO\s*ANTERIOR|CARACTER[IÍ]STICAS)/i);
    if (endSection && dados.comprador) {
        const secao = endSection[0];
        const end = secao.match(/ENDERE[CÇ]O\s*:?\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ\s\.\-,]+?)(?:\s+N[UÚ]MERO)/i);
        const num = secao.match(/N[UÚ]MERO\s*:?\s*(\S+)/i);
        const bairro = secao.match(/BAIRRO\s*:?\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ\s\.\-]+?)(?:\s+MUNIC[IÍ]PIO)/i);
        const cep = secao.match(/CEP\s*:?\s*(\d{5,8})/i);
        const mun = secao.match(/MUNIC[IÍ]PIO\s*:?\s*([A-ZÁÉÍÓÚÃÕ\s]+)/i);

        const endCompleto = [end?.[1], num?.[1]].filter(Boolean).join(', ');
        dados.comprador.endereco = limparTexto(endCompleto) || undefined;
        dados.comprador.bairro = limparTexto(bairro?.[1]);
        dados.comprador.cep = cep?.[1];
        dados.comprador.municipio = limparTexto(mun?.[1]);
        dados.comprador.uf = 'MG'; // Folha de cadastro é sempre Detran MG
    }

    // Proprietário anterior (vendedor)
    const vendSection = text.match(/DADOS\s*DO\s*PROPRIET[AÁ]RIO\s*ANTERIOR[\s\S]*?(?=CARACTER[IÍ]STICAS|$)/i);
    if (vendSection) {
        const secao = vendSection[0];
        const nome = secao.match(/NOME\s*DO\s*PROPRIET[AÁ]RIO\s*:?\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ\s\.\-]+?)(?:\s+CPF)/i);
        const cpf = extrairCpfCnpj(secao);

        dados.vendedor = { nome: limparTexto(nome?.[1]), cpfCnpj: cpf };
    }

    // Características do veículo
    const caracSection = text.match(/CARACTER[IÍ]STICAS\s*DO\s*VE[IÍ]CULO[\s\S]*?(?=CARACTER[IÍ]STICAS\s*DO\s*VE[IÍ]CULO\s*DE\s*CARGA|RESTRI[CÇ][OÕ]ES|DECLARO|$)/i);
    if (caracSection) {
        const secao = caracSection[0];
        const marca = secao.match(/MARCA\/MODELO\s*:?\s*([A-Z0-9\/\s\.\-]+?)(?:\s+ESP[EÉ]CIE|\s+ANO)/i);
        const anoFab = secao.match(/ANO\s*FAB\s*:?\s*(\d{4})/i);
        const anoMod = secao.match(/ANO\s*MODELO\s*:?\s*(\d{4})/i);
        const cor = secao.match(/COR\s*:?\s*(?:\d+\s*-\s*)?([A-ZÁÉÍÓÚÃÕ]+)/i);
        const comb = secao.match(/COMBUST[IÍ]VEL\s*:?\s*([A-Z\/\s]+?)(?:\s+FABRICA[CÇ]|$)/i);
        const tipo = secao.match(/TIPO\s*:?\s*(?:\d+\s*-\s*)?([A-ZÁÉÍÓÚÃÕ]+)/i);
        const especie = secao.match(/ESP[EÉ]CIE\s*:?\s*(?:\d+\s*-\s*)?([A-ZÁÉÍÓÚÃÕ]+)/i);
        const categoria = secao.match(/CATEGORIA\s*:?\s*(?:\d+\s*-\s*)?([A-ZÁÉÍÓÚÃÕ]+)/i);
        const potencia = secao.match(/POT[EÊ]NCIA.?CV\s*:?\s*(\d+)/i);
        const capPass = secao.match(/CAP\.\s*PASSAGEIROS\s*:?\s*(\d+)/i);

        dados.marcaModelo = limparTexto(marca?.[1]);
        dados.anoFabricacao = anoFab?.[1];
        dados.anoModelo = anoMod?.[1];
        dados.cor = limparTexto(cor?.[1]);
        dados.combustivel = limparTexto(comb?.[1]);
        dados.tipo = limparTexto(tipo?.[1]);
        dados.especie = limparTexto(especie?.[1]);
        dados.categoria = limparTexto(categoria?.[1]);
        dados.potencia = potencia?.[1];
        dados.capacidadePassageiros = capPass?.[1];
    }

    // DAE (boleto) - página 2
    const daeValor = text.match(/TOTAL\s*R\$\s*([\d.,]+)/i);
    if (daeValor) dados.daeValor = daeValor[1]!;

    const daeLinha = text.match(/Linha\s*Digit[aá]vel\s*:?\s*([\d\s]+)/i);
    if (daeLinha) dados.daeLinhaDigitavel = daeLinha[1]!.trim();

    const daeEmissao = text.match(/Data\s*Emissao\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (daeEmissao) dados.daeDataEmissao = daeEmissao[1]!;

    return dados;
}

// ============================================
// PARSER: LAUDO DE VISTORIA
// ============================================

function parseLaudoVistoria(text: string): Partial<DadosExtraidos> {
    const dados: Partial<DadosExtraidos> = {};

    // Veículo
    dados.placa = extrairPlaca(text);
    dados.chassi = extrairChassi(text);

    // Marca/Modelo — "MARCA/MODELO/VERSÃO" seguido pelo valor na mesma linha ou próxima
    const marca = text.match(/MARCA\/MODELO\/VERS[AÃ]O\s*[\n\r]*\s*([A-Z0-9\/\s\.\-]+?)(?:\s+PLACA|\s+RTX|\s+[A-Z]{3}\d)/i);
    if (marca) dados.marcaModelo = limparTexto(marca[1]);
    // Fallback: busca "ESP.*MARCA/MODELO" pattern
    if (!dados.marcaModelo) {
        const marcaFb = text.match(/(?:PASSAGEIRO|CARGA)\/\w+\s+([A-Z]+\/[A-Z0-9\s]+?)(?:\s+[A-Z]{3}\d)/i);
        if (marcaFb) dados.marcaModelo = limparTexto(marcaFb[1]);
    }

    // Cor
    const cor = text.match(/\bCOR\b\s+(?:COMBUST[IÍ]VEL)?\s*(?:CAP)?\s*[\n\r]*\s*([A-ZÁÉÍÓÚÃÕ]+)\s/i);
    if (cor) dados.cor = cor[1];

    // Combustível
    const comb = text.match(/COMBUST[IÍ]VEL\s*(?:CAP)?\s*[\n\r]*\s*(?:[A-Z]+\s+)?([A-Z\/]+SOL[A-Z]*)/i);
    if (comb) dados.combustivel = comb[1];

    // Proprietário
    const propSection = text.match(/DADOS\s*DO\s*PROPRIET[AÁ]RIO[\s\S]*?(?=DADOS\s*DO\s*VE[IÍ]CULO|$)/i);
    if (propSection) {
        const secao = propSection[0];
        const nome = secao.match(/PROPRIET[AÁ]RIO\s*DO\s*VE[IÍ]CULO\s*(?:CPF\/CNPJ)?\s*(?:Aprovado|Reprovado)?[\s\S]*?\n\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ\s\.\-]+)/i);
        const cpf = extrairCpfCnpj(secao);
        const end = secao.match(/ENDERE[CÇ]O\s*[\n\r]+\s*(.+)/i);
        const mun = secao.match(/MUNIC[IÍ]PIO\s+UF\s+CEP\s+TELEFONE\s*[\n\r]+\s*([A-ZÁÉÍÓÚÃÕ]+)\s+([A-Z]{2})\s+(\d+)\s+([\d\(\)\s\-]+)/i);

        dados.comprador = {
            nome: limparTexto(nome?.[1]),
            cpfCnpj: cpf,
            endereco: limparTexto(end?.[1]),
            municipio: limparTexto(mun?.[1]),
            uf: mun?.[2],
            cep: mun?.[3],
            telefone: limparTexto(mun?.[4]),
        };
    }

    // Resultado da vistoria — busca "Aprovado com Apontamento" PRIMEIRO (mais específico),
    // depois "Aprovado" ou "Reprovado" isolados
    const resultadoApontamento = text.match(/\b(Aprovado\s+com\s+Apontamento)\b/i);
    if (resultadoApontamento) {
        dados.resultadoVistoria = resultadoApontamento[1]!.toUpperCase();
    } else {
        const resultado = text.match(/\b(Aprovado|Reprovado|Aprovada|Reprovada)\b/i);
        if (resultado) dados.resultadoVistoria = resultado[1]!.toUpperCase();
    }

    // Data da vistoria
    const dtVist = text.match(/DATA\/HORA\s*VISTORIA\s*.*?[\n\r]+\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dtVist) dados.dataVistoria = dtVist[1];

    // Data validade
    const dtVal = text.match(/DATA\s*VALIDADE\s*VISTORIA\s*.*?[\n\r]*\s*.*?(\d{2}\/\d{2}\/\d{4})/i);
    if (dtVal) dados.dataValidadeVistoria = dtVal[1];

    // Observações
    const obs = text.match(/Obs\.?\s*:?\s*(.+?)(?:\s*RESPONS[AÁ]VEIS|$)/is);
    if (obs) dados.observacoesVistoria = limparTexto(obs[1]);

    // Vistoriador
    const vistoriador = text.match(/VISTORIADOR\s*RESPONS[AÁ]VEL\s*CPF\s*[\n\r]+\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ\s\.\-]+)/i);
    if (vistoriador) dados.vistoriador = limparTexto(vistoriador[1]);

    // Motivo (tipo de serviço)
    const motivo = text.match(/Laudo\s*de\s*Vistoria.*?N[º°].*?\n\s*([A-ZÀ-Ú][a-zà-ú\s]+)/i);
    if (motivo) {
        dados.motivoPreenchimento = limparTexto(motivo[1])?.toUpperCase();
        if (dados.motivoPreenchimento) {
            dados.tipoServicoDetectado = mapMotivoToTipoServico(dados.motivoPreenchimento);
        }
    }

    return dados;
}

// ============================================
// PARSER: CRLV
// ============================================

function parseCRLV(text: string): Partial<DadosExtraidos> {
    const dados: Partial<DadosExtraidos> = {};

    // Veículo
    dados.placa = extrairPlaca(text);
    dados.chassi = extrairChassi(text);
    dados.renavam = extrairRenavam(text);

    // Marca/Modelo — no CRLV: "MARCA / MODELO / VERSÃO" ou após "ASSINADO DIGITALMENTE"
    const marca = text.match(/MARCA\s*\/\s*MODELO\s*\/\s*VERS[AÃ]O\s*(?:ASSINADO)?[\s\S]*?\n?\s*([A-Z0-9\/\s\.\-]+?)(?:\s+(?:ESP[EÉ]CIE|DADOS|ASSINADO))/i);
    if (marca) dados.marcaModelo = limparTexto(marca[1]);
    // Fallback mais simples
    if (!dados.marcaModelo) {
        const marcaFb = text.match(/MARCA\s*\/\s*MODELO\s*\/\s*VERS[AÃ]O\s*[\n\r]+\s*([A-Z0-9\/\s\.\-]+)/i);
        if (marcaFb) dados.marcaModelo = limparTexto(marcaFb[1]);
    }

    // Anos
    const anos = text.match(/ANO\s*FABRICA[CÇ][AÃ]O\s+ANO\s*MODELO\s*[\n\r]+\s*(\d{4})\s+(\d{4})/i);
    if (anos) {
        dados.anoFabricacao = anos[1];
        dados.anoModelo = anos[2];
    }

    // Cor
    const cor = text.match(/COR\s*PREDOMINANTE\s+COMBUST[IÍ]VEL[\s\S]*?\n\s*([A-ZÁÉÍÓÚÃÕ]+)\s+([A-Z\/]+)/i);
    if (cor) {
        dados.cor = cor[1];
        dados.combustivel = cor[2];
    }

    // Número CRV
    const crv = text.match(/N[UÚ]MERO\s*DO\s*CRV\s*[\n\r]+\s*(\d{9,15})/i);
    if (crv) dados.numeroCRV = crv[1];

    // Código de Segurança
    const seg = text.match(/C[OÓ]DIGO\s*DE\s*SEGURAN[CÇ]A\s*(?:DO)?\s*CL?A?\s*(?:CAT)?\s*(?:LOCAL)?\s*(?:DATA)?\s*[\n\r]+\s*(\d{9,15})/i);
    if (seg) dados.codigoSegurancaCRV = seg[1];

    // Proprietário — captura nome até encontrar quebra de linha seguida de CPF/CNPJ
    const nome = text.match(/\bNOME\b\s*[\n\r]+\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ\s\.\-]+?)(?=\s*[\n\r])/i);
    if (nome) {
        const cpf = extrairCpfCnpj(text);
        dados.comprador = {
            nome: limparTexto(nome[1]),
            cpfCnpj: cpf,
        };
    }

    // Data de emissão — "Documento emitido por DETRAN MG ... em DD/MM/YYYY"
    const dtEm = text.match(/(?:Documento\s*emitido|emitido)\s*.*?em\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dtEm) dados.dataEmissao = dtEm[1];

    // Exercício
    const exercicio = text.match(/EXERC[IÍ]CIO\s*[\n\r]+\s*.*?(\d{4})/i);
    if (!dados.anoModelo && exercicio) dados.anoModelo = exercicio[1];

    return dados;
}

// ============================================
// FUNÇÃO PRINCIPAL: EXTRAÇÃO UNIFICADA
// ============================================

function montarDadosExtraidos(parcial: Partial<DadosExtraidos>, tipo: TipoDocumento, text: string): DadosExtraidos {
    // Preenche campos de compatibilidade
    const comprador = parcial.comprador;
    const vendedor = parcial.vendedor;

    return {
        tipoDocumento: tipo,

        // Veículo
        placa: parcial.placa,
        renavam: parcial.renavam,
        chassi: parcial.chassi,
        marcaModelo: parcial.marcaModelo,
        anoFabricacao: parcial.anoFabricacao,
        anoModelo: parcial.anoModelo,
        cor: parcial.cor,
        combustivel: parcial.combustivel,
        categoria: parcial.categoria,
        especie: parcial.especie,
        tipo: parcial.tipo,
        potencia: parcial.potencia,
        capacidadePassageiros: parcial.capacidadePassageiros,

        // Documento
        numeroCRV: parcial.numeroCRV,
        codigoSegurancaCRV: parcial.codigoSegurancaCRV,
        numeroATPVe: parcial.numeroATPVe,
        dataEmissao: parcial.dataEmissao,
        dataAquisicao: parcial.dataAquisicao,
        valorRecibo: parcial.valorRecibo,
        hodometro: parcial.hodometro,

        // Pessoas
        comprador,
        vendedor,

        // Compatibilidade com código existente (campos flat)
        nomeProprietario: comprador?.nome || vendedor?.nome,
        cpfCnpj: comprador?.cpfCnpj || vendedor?.cpfCnpj,
        nomeAdquirente: comprador?.nome,
        cpfCnpjAdquirente: comprador?.cpfCnpj,
        nomeVendedor: vendedor?.nome,
        cpfCnpjVendedor: vendedor?.cpfCnpj,

        // Serviço
        motivoPreenchimento: parcial.motivoPreenchimento,
        tipoServicoDetectado: parcial.tipoServicoDetectado,

        // Vistoria
        resultadoVistoria: parcial.resultadoVistoria,
        dataVistoria: parcial.dataVistoria,
        dataValidadeVistoria: parcial.dataValidadeVistoria,
        observacoesVistoria: parcial.observacoesVistoria,
        vistoriador: parcial.vistoriador,

        // DAE
        daeValor: parcial.daeValor,
        daeLinhaDigitavel: parcial.daeLinhaDigitavel,
        daeDataEmissao: parcial.daeDataEmissao,

        textoCompleto: text,
    };
}

/**
 * Extrai dados de qualquer documento veicular (ATPV-e, Folha, Laudo, CRLV).
 * Detecta automaticamente o tipo e usa o parser correto.
 */
export function extractVehicleDataFromText(text: string): DadosExtraidos {
    const tipo = detectarTipoDocumento(text);
    let parcial: Partial<DadosExtraidos>;

    switch (tipo) {
        case 'atpve':
            parcial = parseATPVe(text);
            break;
        case 'folha_cadastro':
            parcial = parseFolhaCadastro(text);
            break;
        case 'laudo_vistoria':
            parcial = parseLaudoVistoria(text);
            break;
        case 'crlv':
            parcial = parseCRLV(text);
            break;
        default:
            // Fallback: tenta extrair o máximo possível com funções genéricas
            parcial = {
                placa: extrairPlaca(text),
                renavam: extrairRenavam(text),
                chassi: extrairChassi(text),
                cpfCnpj: extrairCpfCnpj(text),
            };
            break;
    }

    return montarDadosExtraidos(parcial, tipo, text);
}

/**
 * Função principal: recebe um File PDF e retorna os dados extraídos.
 * Mantém compatibilidade com o código existente.
 */
export async function extractVehicleData(file: File): Promise<DadosExtraidos> {
    const text = await extractTextFromPDF(file);
    return extractVehicleDataFromText(text);
}

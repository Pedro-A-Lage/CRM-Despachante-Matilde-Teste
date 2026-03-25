// Validador de documentos CRLV contra dados da OS
// Compara dados extraídos do CRLV com os dados do cliente/veículo da OS

export interface DadosCrlv {
    placa?: string;
    nome?: string;
    cpfCnpj?: string;
    data?: string;
    renavam?: string;
}

export interface ValidacaoItem {
    campo: string;
    esperado: string;
    recebido: string;
    ok: boolean;
    detalhe?: string;
}

export interface ResultadoValidacao {
    itens: ValidacaoItem[];
    aprovado: boolean;
    dataValidacao: string;
}

/**
 * Normaliza CPF/CNPJ removendo pontuação
 */
function normalizeCpfCnpj(v: string): string {
    return (v || '').replace(/\D/g, '');
}

/**
 * Normaliza nome para comparação
 * Remove acentos, converte para uppercase, remove espaços extras
 */
function normalizarNome(nome: string): string {
    return (nome || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Compara nomes com tolerância a abreviações
 * "MARIA REGINA SILVA OLIV. CAMILO" deve ser igual a "MARIA REGINA SILVA OLIVEIRA CAMILO"
 */
function nomesCompativeis(nomeOS: string, nomeCrlv: string): boolean {
    const a = normalizarNome(nomeOS);
    const b = normalizarNome(nomeCrlv);

    if (a === b) return true;

    // Comparar palavra por palavra com tolerância a abreviações
    const palavrasA = a.split(' ').filter(p => p.length > 0);
    const palavrasB = b.split(' ').filter(p => p.length > 0);

    // Tolerância: até 2 palavras a mais/menos (CRLV pode abreviar ou omitir sobrenomes)
    if (Math.abs(palavrasA.length - palavrasB.length) > 2) return false;

    // Usa o menor array como referência e tenta casar cada palavra
    const [menor, maior] = palavrasA.length <= palavrasB.length
        ? [palavrasA, palavrasB] : [palavrasB, palavrasA];

    let matchCount = 0;
    let maiorIdx = 0;

    for (let i = 0; i < menor.length && maiorIdx < maior.length; i++) {
        const pa = menor[i] || '';
        const cleanA = pa.replace(/\./g, '');

        // Tenta casar com a palavra atual ou a próxima do maior
        for (let j = maiorIdx; j < maior.length && j <= maiorIdx + 1; j++) {
            const pb = maior[j] || '';
            const cleanB = pb.replace(/\./g, '');

            if (pa === pb || cleanA === cleanB) {
                matchCount++;
                maiorIdx = j + 1;
                break;
            }
            // Abreviação: "ALM" casa com "ALMEIDA", "OLIV" com "OLIVEIRA" — mínimo 2 chars
            if (cleanA.length >= 2 && cleanB.startsWith(cleanA)) {
                matchCount++;
                maiorIdx = j + 1;
                break;
            }
            if (cleanB.length >= 2 && cleanA.startsWith(cleanB)) {
                matchCount++;
                maiorIdx = j + 1;
                break;
            }
        }
    }

    // Precisa ter pelo menos 70% das palavras do menor compatíveis
    return matchCount >= menor.length * 0.7;
}

/**
 * Normaliza placa removendo traços e espaços
 */
function normalizarPlaca(placa: string): string {
    return (placa || '').replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Valida dados do CRLV contra dados da OS
 */
export function validarCrlv(
    dadosCrlv: DadosCrlv,
    osData: {
        clienteNome: string;
        clienteCpfCnpj: string;
        veiculoPlaca: string;
        dataInicioProcesso?: string; // ISO date string
    }
): ResultadoValidacao {
    const itens: ValidacaoItem[] = [];

    // 1. Validar Placa
    if (dadosCrlv.placa) {
        const placaCrlv = normalizarPlaca(dadosCrlv.placa);
        const placaOS = normalizarPlaca(osData.veiculoPlaca);
        itens.push({
            campo: 'Placa',
            esperado: placaOS,
            recebido: placaCrlv,
            ok: placaCrlv === placaOS,
            detalhe: placaCrlv !== placaOS ? 'Placa diferente — pode ter sido trocada' : undefined,
        });
    }

    // 2. Validar Nome
    if (dadosCrlv.nome) {
        // Limpar lixo: remover labels que o extrator pode ter capturado por engano
        let nomeLimpo = dadosCrlv.nome
            .replace(/\b(LOCAL|DATA|CPF|CNPJ|PLACA|RENAVAM|CHASSI|ASSINADO)\b/gi, '')
            .replace(/\d{2}\/\d{2}\/\d{4}/g, '') // Remove datas
            .replace(/\s+/g, ' ')
            .trim();

        // Se após limpar ficou muito curto, provavelmente o extrator falhou — não validar
        if (nomeLimpo.length > 3) {
            const ok = nomesCompativeis(osData.clienteNome, nomeLimpo);
            itens.push({
                campo: 'Nome',
                esperado: osData.clienteNome,
                recebido: nomeLimpo,
                ok,
                detalhe: ok ? 'Nomes compatíveis' : 'Nome diferente do cadastrado',
            });
        }
    }

    // 3. Validar CPF/CNPJ
    if (dadosCrlv.cpfCnpj) {
        const cpfCrlv = normalizeCpfCnpj(dadosCrlv.cpfCnpj);
        const cpfOS = normalizeCpfCnpj(osData.clienteCpfCnpj);
        itens.push({
            campo: 'CPF/CNPJ',
            esperado: osData.clienteCpfCnpj,
            recebido: dadosCrlv.cpfCnpj,
            ok: cpfCrlv === cpfOS,
        });
    }

    // 4. Validar Data (deve ser >= data início do processo)
    if (dadosCrlv.data && osData.dataInicioProcesso) {
        const [dia, mes, ano] = dadosCrlv.data.split('/');
        const dataCrlv = new Date(`${ano}-${mes}-${dia}`);
        const dataInicio = new Date(osData.dataInicioProcesso);
        // Comparar apenas datas, sem horários
        dataCrlv.setHours(0, 0, 0, 0);
        dataInicio.setHours(0, 0, 0, 0);
        const ok = dataCrlv >= dataInicio;
        itens.push({
            campo: 'Data',
            esperado: `Após ${dataInicio.toLocaleDateString('pt-BR')}`,
            recebido: dadosCrlv.data,
            ok,
            detalhe: ok ? undefined : 'Data do documento anterior ao início do processo',
        });
    }

    const aprovado = itens.length > 0 && itens.every(i => i.ok);

    return {
        itens,
        aprovado,
        dataValidacao: new Date().toISOString(),
    };
}


// MOCK PARSER LOGIC FROM src/lib/pdfParser.ts (LATEST)

function parseCpfCnpj(text: string): string | undefined {
    const labelPattern = /(?:cpf|cnpj|cpf\/cnpj|cpf\s*\/\s*cnpj|doc|documento)\s*:?\s*([\d.\-/]{11,20})/i;
    const labelMatch = text.match(labelPattern);
    if (labelMatch && labelMatch[1]) {
        return labelMatch[1].replace(/\D/g, '');
    }
    return undefined;
}

function parseSpecificCpfCnpj(text: string): { adquirente?: string, vendedor?: string } {
    const results: { adquirente?: string, vendedor?: string } = {};
    const vendSection = text.match(/DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR[\s\S]{1,500}?(?=CARACTER[IÍ]STICAS\s+DO\s+VE[IÍ]CULO|DADOS\s+DO\s+PROPRIET[AÁ]RIO|DADOS\s+DO\s+ADQUIRENTE|$)/i);
    if (vendSection) {
        results.vendedor = parseCpfCnpj(vendSection[0]);
    }
    const adqSection = text.match(/(?:DADOS\s+DO\s+PROPRIET[AÁ]RIO(?![\s\S]{1,20}ANTERIOR)|DADOS\s+DO\s+ADQUIRENTE)[\s\S]{1,500}?(?=ENDERE[ÇC]O\s+DO\s+PROPRIET[AÁ]RIO|DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR|DADOS\s+DO\s+VE[IÍ]CULO|$)/i);
    if (adqSection) {
        results.adquirente = parseCpfCnpj(adqSection[0]);
    }
    return results;
}

function parseSpecificNomes(text: string): { adquirente?: string, vendedor?: string } {
    const results: { adquirente?: string, vendedor?: string } = {};
    const nameRegex = /(?:NOME|PROPRIETÁRIO|ADQUIRENTE|RAZÃO\s*SOCIAL)\s*[:\s]+\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇa-záéíóúãõâêîôûç\s.\-]{3,80}?)(?=\s*(?:CPF|CNPJ|N\.|DOC|RG|Endereço|DATA|$))/i;

    const vendSection = text.match(/DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR[\s\S]{1,500}?(?=CARACTER[IÍ]STICAS|DADOS\s+DO\s+PROPRIET[AÁ]RIO|DADOS\s+DO\s+ADQUIRENTE|$)/i);
    if (vendSection) {
        const nameMatch = vendSection[0].match(nameRegex);
        if (nameMatch) results.vendedor = nameMatch[1].trim();
    }

    const adqSection = text.match(/(?:DADOS\s+DO\s+PROPRIET[AÁ]RIO(?![\s\S]{1,20}ANTERIOR)|DADOS\s+DO\s+ADQUIRENTE)[\s\S]{1,500}?(?=ENDERE[ÇC]O\s+DO\s+PROPRIET[AÁ]RIO|DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR|DADOS\s+DO\s+VE[IÍ]CULO|$)/i);
    if (adqSection) {
        // console.log("--- ADQ SECTION FOUND ---");
        // console.log(adqSection[0]);
        const nameMatch = adqSection[0].match(nameRegex);
        if (nameMatch) {
            results.adquirente = nameMatch[1].trim();
        } else {
            console.log("--- ADQ NAME NOT FOUND IN SECTION ---");
        }
    }
    return results;
}

const realPdfText = \`ETIQUETA MICROFILMAGEM  DECALQUE CHASSI  Coordenadoria Estadual de Gestão de Trânsito (CET-MG)   DOCUMENTO DE CADASTRO  CÓDIGO DO MUNICIPIO  4633  DATA DE RECEBIMENTO  ____ / ____ / ____ (DIA MÊS ANO)  IDENTIFICAÇÃO DO VEÍCULO E MOTIVO DO PREENCHIMENTO:   TRANSFERÊNCIA DE PROPRIEDADE  Emissão em:   09/03/2026 - 16:48  PLACA:   SHM5H62   CHASSI:   9BGEY48H0PG285902   RENAVAM:   01344883440   CHASSI REMARCADO:   NÃO  MUNICÍPIO DE EMPLACAMENTO:   ITABIRA   VALOR DO RECIBO:   R$ 70.800,00   DATA DA AQUISIÇÃO:   20/02/2026  DADOS DO PROPRIETÁRIO  NOME DO PROPRIETÁRIO:   KURUMA VEICULOS S.A.   CPF/CNPJ:   00827783002206  N. DOC.IDENTIDADE:   ÓRGÃO EXPEDIDOR:   SIGLA UF:  ENDEREÇO DO PROPRIETÁRIO  ENDEREÇO:   RUA JUCA MACHADO   NÚMERO:   45   COMPLEMENTO:  CEP:   35900239   BAIRRO:   14 DE FEVEREIRO   MUNICÍPIO:   ITABIRA  ENDEREÇO DE CORRESPONDÊNCIA  ENDEREÇO:   RUA JUCA MACHADO   NÚMERO:   45   COMPLEMENTO:  CEP:   35900239   BAIRRO:   14 DE FEVEREIRO   MUNICÍPIO:   ITABIRA  DADOS DO PROPRIETÁRIO ANTERIOR  NOME DO PROPRIETÁRIO:   NELIA MARIA TONELLI CARVALHO   CPF/CNPJ:   76416992604  MUNICÍPIO:   SIGLA UF:  CARACTERÍSTICAS DO VEÍCULO  TIPO:   006 - AUTOMOVEL   MARCA/MODELO:   CHEV/ONIX 10TAT PR2  ESPÉCIE:   01 - PASSAGEIRO   ANO FAB:   2023   ANO MODELO:   2023   COR:   04 - BRANCA  POTÊNCIA-CV:   116   N. CILINDROS:   04   CILINDRADA:   CAP. PASSAGEIROS:   05  COMBUSTÍVEL:   ALC/GASOL   FABRICAÇÃO:   1 - NACIONAL   CATEGORIA:   1 - PARTIC  CARACTERÍSTICAS DO VEÍCULO DE CARGA  CARROCERIA:   NENHUMA   CAP. CARGA TON.:   000,00  CMT. TON.:   001,40   N. EIXOS:   00  RESTRIÇÕES À VENDA  MODALIDADE DAS RESTRIÇÕES:   SEM FINANCIAMENTO   ISENTO/IMUNE IPVA:   Não \`;

console.log("--- TESTE COM TEXTO REAL ---");
const nomes = parseSpecificNomes(realPdfText);
const cpfs = parseSpecificCpfCnpj(realPdfText);

console.log("ADQUIRENTE:", nomes.adquirente, "(CPF:", cpfs.adquirente, ")");
console.log("VENDEDOR:", nomes.vendedor, "(CPF:", cpfs.vendedor, ")");

const nomeFinal = nomes.adquirente || (nomes.vendedor ? nomes.vendedor : "NÃO ACHOU");
console.log("NOME FINAL (PRIORIDADE ADQ):", nomeFinal);

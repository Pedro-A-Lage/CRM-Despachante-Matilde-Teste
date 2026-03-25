
// MOCK PARSER LOGIC FROM src/lib/pdfParser.ts (DEBUG VERSION)

function parseCpfCnpj(text: string): string | undefined {
    // console.log("DEBUG parseCpfCnpj em:", text);
    const labelPattern = /(?:cpf|cnpj|cpf\/cnpj|cpf\s*\/\s*cnpj|doc|documento)\s*:?\s*([\d.\-/]{11,20})/i;
    const labelMatch = text.match(labelPattern);
    if (labelMatch && labelMatch[1]) {
        return labelMatch[1];
    }
    return undefined;
}

function parseSpecificCpfCnpj(text: string): { adquirente?: string, vendedor?: string } {
    const results: { adquirente?: string, vendedor?: string } = {};
    const vendSection = text.match(/DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR[\s\S]{1,500}?(?=CARACTER[IÍ]STICAS\s+DO\s+VE[IÍ]CULO|DADOS\s+DO\s+PROPRIET[AÁ]RIO|DADOS\s+DO\s+ADQUIRENTE|$)/i);
    if (vendSection) {
        // console.log("DEBUG vendSection:", vendSection[0]);
        results.vendedor = parseCpfCnpj(vendSection[0]);
    }
    const adqSection = text.match(/(?:DADOS\s+DO\s+PROPRIET[AÁ]RIO(?![\s\S]{1,20}ANTERIOR)|DADOS\s+DO\s+ADQUIRENTE)[\s\S]{1,500}?(?=ENDERE[ÇC]O\s+DO\s+PROPRIET[AÁ]RIO|DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR|DADOS\s+DO\s+VE[IÍ]CULO|$)/i);
    if (adqSection) {
        // console.log("DEBUG adqSection:", adqSection[0]);
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
        if (nameMatch) {
            results.vendedor = nameMatch[1].trim();
        } else {
            console.log("DEBUG: nameRegex falhou na vendSection");
        }
    }
    const adqSection = text.match(/(?:DADOS\s+DO\s+PROPRIET[AÁ]RIO(?![\s\S]{1,20}ANTERIOR)|DADOS\s+DO\s+ADQUIRENTE)[\s\S]{1,500}?(?=ENDERE[ÇC]O\s+DO\s+PROPRIET[AÁ]RIO|DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR|DADOS\s+DO\s+VE[IÍ]CULO|$)/i);
    if (adqSection) {
        // console.log("DEBUG adqSection text:", adqSection[0]);
        const nameMatch = adqSection[0].match(nameRegex);
        if (nameMatch) {
            results.adquirente = nameMatch[1].trim();
        } else {
            console.log("DEBUG: nameRegex falhou na adqSection");
        }
    }
    return results;
}

const mockTextDetranMG = `
FOLHA DE CADASTRO PARA SOLICITAÇÃO DE PLACA
DADOS DO PROPRIETÁRIO
NOME: ADQUIRENTE TESTE SILVA
CPF/CNPJ: 111.111.111-11
ENDEREÇO DO PROPRIETÁRIO: RUA TESTE, 123

DADOS DO VEÍCULO
PLACA: SHM5H62
RENAVAM: 01344883440
CHASSI: 9BGEY48HOPG285902
MARCA/MODELO: HONDA/CG 160 TITAN

DADOS DO PROPRIETÁRIO ANTERIOR
NOME: NELIA MARIA TONELLI CARVALHO
CPF/CNPJ: 008.277.830-02
`;

const nomes = parseSpecificNomes(mockTextDetranMG);
console.log("RESULTADO NOMES:", nomes);

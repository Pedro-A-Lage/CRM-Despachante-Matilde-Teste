
// MOCK PARSER LOGIC FROM src/lib/pdfParser.ts (UPDATED)

function parseCpfCnpj(text: string): string | undefined {
    const labelPattern = /(?:cpf|cnpj|cpf\/cnpj|cpf\s*\/\s*cnpj|doc|documento)\s*:?\s*([\d.\-/]{11,20})/i;
    const labelMatch = text.match(labelPattern);
    if (labelMatch && labelMatch[1]) {
        const clean = labelMatch[1].replace(/\D/g, '');
        if (clean.length === 11 || clean.length === 14) return labelMatch[1];
    }
    const cnpjMatch = text.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
    if (cnpjMatch) return cnpjMatch[1];
    const cpfMatch = text.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/);
    if (cpfMatch) return cpfMatch[1];
    const lines = text.split('\n');
    for (const line of lines) {
        const rawMatch = line.match(/\b(\d{11}|\d{14})\b/);
        if (rawMatch) return rawMatch[1];
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
        if (nameMatch && nameMatch[1]) results.vendedor = nameMatch[1].trim();
    }
    const adqSection = text.match(/(?:DADOS\s+DO\s+PROPRIET[AÁ]RIO(?![\s\S]{1,20}ANTERIOR)|DADOS\s+DO\s+ADQUIRENTE)[\s\S]{1,500}?(?=ENDERE[ÇC]O|DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR|DADOS\s+DO\s+VE[IÍ]CULO|$)/i);
    if (adqSection) {
        const nameMatch = adqSection[0].match(nameRegex);
        if (nameMatch && nameMatch[1]) results.adquirente = nameMatch[1].trim();
    }
    return results;
}

function testExtract(text: string) {
    const nomes = parseSpecificNomes(text);
    const cpfs = parseSpecificCpfCnpj(text);

    return {
        nomeAdquirente: nomes.adquirente,
        cpfCnpjAdquirente: cpfs.adquirente,
        nomeVendedor: nomes.vendedor,
        cpfCnpjVendedor: cpfs.vendedor,
        nomeProprietario: nomes.adquirente || (nomes.vendedor ? nomes.vendedor : "FALLBACK"),
        cpfCnpj: cpfs.adquirente || (cpfs.vendedor ? cpfs.vendedor : "FALLBACK")
    };
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

console.log("--- DIAGNÓSTICO PARSER PDF (PÓS-FIX) ---");
const result = testExtract(mockTextDetranMG);

console.log("NOME EXTRAÍDO:", result.nomeProprietario);
console.log("CPF EXTRAÍDO:", result.cpfCnpj);
console.log("ADQUIRENTE NOME:", result.nomeAdquirente);
console.log("VENDEDOR NOME:", result.nomeVendedor);

if (result.nomeProprietario === "NELIA MARIA TONELLI CARVALHO") {
    console.log("❌ RESULTADO: O parser AINDA está pegando o VENDEDOR!");
} else if (result.nomeProprietario === "ADQUIRENTE TESTE SILVA") {
    console.log("✅ RESULTADO: O parser pegou o ADQUIRENTE corretamente!");
} else {
    console.warn("⚠️ AVISO: Resultado inesperado:", result.nomeProprietario);
}

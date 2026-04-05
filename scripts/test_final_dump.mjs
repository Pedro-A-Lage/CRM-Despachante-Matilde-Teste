
import fs from 'fs';

function parseCpfCnpj(text) {
    const labelPattern = /(?:cpf|cnpj|cpf\/cnpj|cpf\s*\/\s*cnpj|doc|documento)\s*[:\s]+\s*([\d.\-/]{11,20})/i;
    const labelMatch = text.match(labelPattern);
    if (labelMatch && labelMatch[1]) {
        return labelMatch[1].replace(/\D/g, '');
    }
    return undefined;
}

function parseSpecificCpfCnpj(text) {
    const results = {};
    const vendSection = text.match(/DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR[\s\S]{1,800}?(?=CARACTER[IÍ]STICAS\s+DO\s+VE[IÍ]CULO|DADOS\s+DO\s+PROPRIET[AÁ]RIO|DADOS\s+DO\s+ADQUIRENTE|$)/i);
    if (vendSection) {
        // console.log("VEND SECTION:", vendSection[0]);
        results.vendedor = parseCpfCnpj(vendSection[0]);
    }
    const adqSection = text.match(/(?:DADOS\s+DO\s+PROPRIET[AÁ]RIO(?![\s\S]{1,20}ANTERIOR)|DADOS\s+DO\s+ADQUIRENTE)[\s\S]{1,800}?(?=ENDERE[ÇC]O\s+DO\s+PROPRIET[AÁ]RIO|DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR|DADOS\s+DO\s+VE[IÍ]CULO|$)/i);
    if (adqSection) {
        // console.log("ADQ SECTION:", adqSection[0]);
        results.adquirente = parseCpfCnpj(adqSection[0]);
    }
    return results;
}

function parseSpecificNomes(text) {
    const results = {};
    // Regex revised for multiple spaces and specific PDF layout
    const nameRegex = /(?:NOME|PROPRIETÁRIO|ADQUIRENTE|RAZÃO\s*SOCIAL)(?:\s+DO\s+PROPRIET[AÁ]RIO)?\s*[:\s]+\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇa-záéíóúãõâêîôûç\s.\-]{3,80}?)(?=\s+(?:CPF|CNPJ|N\.|DOC|RG|Endereço|DATA|$))/i;

    const vendSection = text.match(/DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR[\s\S]{1,800}?(?=CARACTER[IÍ]STICAS|DADOS\s+DO\s+PROPRIET[AÁ]RIO|DADOS\s+DO\s+ADQUIRENTE|$)/i);
    if (vendSection) {
        const nameMatch = vendSection[0].match(nameRegex);
        if (nameMatch) {
            results.vendedor = nameMatch[1].trim();
        } else {
            console.log("DEBUG: Falha ao encontrar nome na seção Vendedor");
        }
    }

    const adqSection = text.match(/(?:DADOS\s+DO\s+PROPRIET[AÁ]RIO(?![\s\S]{1,20}ANTERIOR)|DADOS\s+DO\s+ADQUIRENTE)[\s\S]{1,800}?(?=ENDERE[ÇC]O\s+DO\s+PROPRIET[AÁ]RIO|DADOS\s+DO\s+PROPRIET[AÁ]RIO\s+ANTERIOR|DADOS\s+DO\s+VE[IÍ]CULO|$)/i);
    if (adqSection) {
        const nameMatch = adqSection[0].match(nameRegex);
        if (nameMatch) {
            results.adquirente = nameMatch[1].trim();
        } else {
            console.log("DEBUG: Falha ao encontrar nome na seção Adquirente");
        }
    }
    return results;
}

const text = fs.readFileSync('pdf_dump.txt', 'utf8');

console.log("--- TESTE COM DUMP REAL ---");
const nomes = parseSpecificNomes(text);
const cpfs = parseSpecificCpfCnpj(text);

console.log("ADQUIRENTE:", nomes.adquirente, "(CPF:", cpfs.adquirente, ")");
console.log("VENDEDOR:", nomes.vendedor, "(CPF:", cpfs.vendedor, ")");

const finalName = nomes.adquirente || (nomes.vendedor ? nomes.vendedor : "NADA");
console.log("VEREDITO (NOME DO CLIENTE):", finalName);

if (finalName === "NELIA MARIA TONELLI CARVALHO") {
    console.log("❌ ERRO: Continua pegando o vendedor!");
} else if (finalName === "KURUMA VEICULOS S.A.") {
    console.log("✅ SUCESSO: Agora pegou o comprador!");
}

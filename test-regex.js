const text1 = "DADOS DO PROPRIETÁRIO NOME DO PROPRIETÁRIO: FERNANDA LAGE MARTINS ROSA CPF/CNPJ: 11093791616 N. DOC.IDENTIDADE: 11840513 ÓRGÃO EXPEDIDOR: SSP SIGLA UF: MG";

function parseNomeProprietario(text) {
    const patterns = [
        /(?:nome\s*(?:do\s*)?propriet[aá]rio)\s*:?\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇa-záéíóúãõâêîôûç\s]+?)(?:CPF|CNPJ|\d|$)/i,
        /(?:adquirente|comprador)\s*:?\s*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇa-záéíóúãõâêîôûç\s]+?)(?:\d|CPF|CNPJ|$)/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }
    return undefined;
}

console.log("Name:", parseNomeProprietario(text1));

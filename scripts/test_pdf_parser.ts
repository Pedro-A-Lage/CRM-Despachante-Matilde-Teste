import { extractVehicleDataFromText } from '../src/lib/pdfParser';

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

console.log("--- TESTE PARSER PDF ---");
const extracted = extractVehicleDataFromText(mockTextDetranMG);

console.log("NOME EXTRAÍDO:", extracted.nomeProprietario);
console.log("CPF EXTRAÍDO:", extracted.cpfCnpj);
console.log("ADQUIRENTE NOME:", extracted.nomeAdquirente);
console.log("VENDEDOR NOME:", extracted.nomeVendedor);

if (extracted.nomeProprietario === "NELIA MARIA TONELLI CARVALHO") {
    console.error("❌ FALHA: O parser pegou o vendedor em vez do adquirente!");
} else if (extracted.nomeProprietario === "ADQUIRENTE TESTE SILVA") {
    console.log("✅ SUCESSO: O parser pegou o adquirente corretamente!");
} else {
    console.warn("⚠️ AVISO: O nome extraído não bate com nenhum dos dois:", extracted.nomeProprietario);
}

// Gera /public/recibos/kuruma.xlsx como template inicial.
// Roda uma única vez: `node scripts/gerar_template_kuruma.mjs`.
// Quando a usuária enviar o modelo real, basta substituir o arquivo.

import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'recibos');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'kuruma.xlsx');

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Recibo', {
    pageSetup: { paperSize: 9, orientation: 'portrait', margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
});

ws.columns = [
    { width: 30 },
    { width: 45 },
];

const title = ws.getRow(1);
title.getCell(1).value = 'RECIBO DE REEMBOLSO';
ws.mergeCells('A1:B1');
title.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
title.getCell(1).font = { name: 'Arial', size: 16, bold: true };
title.height = 28;

const sub = ws.getRow(2);
sub.getCell(1).value = 'Recibo nº {{numeroRecibo}}     Data: {{dataEmissao}}';
ws.mergeCells('A2:B2');
sub.getCell(1).alignment = { horizontal: 'center' };
sub.getCell(1).font = { name: 'Arial', size: 10, italic: true };

ws.addRow([]);

ws.addRow(['Empresa:', '{{empresaNome}}']);
ws.addRow(['Cliente:', '{{clienteNome}}']);
ws.addRow(['CPF/CNPJ:', '{{clienteCpfCnpj}}']);
ws.addRow(['Veículo:', '{{modelo}}']);
ws.addRow(['Placa:', '{{placa}}']);
ws.addRow(['Chassi:', '{{chassi}}']);
ws.addRow(['OS nº:', '{{numeroOS}}']);

ws.addRow([]);

ws.addRow(['Descrição', 'Valor (R$)']);
const headerRow = ws.lastRow;
headerRow.font = { bold: true };
headerRow.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    c.border = { bottom: { style: 'thin' } };
});

ws.addRow(['{{#temPlaca}}', '']);
ws.addRow(['Reembolso da placa', '{{valorPlacaFmt}}']);
ws.addRow(['{{/temPlaca}}', '']);
ws.addRow(['{{#temVistoria}}', '']);
ws.addRow(['Reembolso da vistoria ({{vistoriaLocal}})', '{{valorVistoriaFmt}}']);
ws.addRow(['{{/temVistoria}}', '']);

ws.addRow(['Total', '{{valorTotalFmt}}']);
const totalRow = ws.lastRow;
totalRow.font = { bold: true, size: 12 };
totalRow.eachCell((c) => {
    c.border = { top: { style: 'thin' } };
});

ws.addRow([]);
ws.addRow(['Valor por extenso:', '{{valorPorExtenso}}']);
ws.addRow(['Observação:', '{{observacao}}']);

ws.addRow([]);
ws.addRow([]);
ws.addRow(['______________________________', '']);
ws.addRow(['Assinatura', '']);

ws.eachRow((row) => {
    row.eachCell((c) => {
        if (!c.font) c.font = {};
        c.font = { name: c.font.name || 'Arial', size: c.font.size || 10, bold: c.font.bold, italic: c.font.italic };
    });
});

await wb.xlsx.writeFile(outPath);
console.log('✓ Template criado em', outPath);

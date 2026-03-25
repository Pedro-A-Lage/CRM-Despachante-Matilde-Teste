// Inspeção temporária do CSV
const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'dist', 'Cadastro Cliente.csv');
const content = fs.readFileSync(csvPath, 'latin1');
const lines = content.split('\n');

console.log('=== CABEÇALHO (colunas) ===');
const header = lines[0];
const cols = header.split(';');
cols.forEach((c, i) => console.log(`[${i}] "${c.trim()}"`));

console.log('\n=== LINHA 1 (amostra) ===');
if (lines[1]) {
  const vals = lines[1].split(';');
  cols.forEach((c, i) => console.log(`  ${c.trim()}: "${(vals[i] || '').trim()}"`));
}

console.log('\n=== LINHA 2 (amostra) ===');
if (lines[2]) {
  const vals = lines[2].split(';');
  cols.forEach((c, i) => console.log(`  ${c.trim()}: "${(vals[i] || '').trim()}"`));
}

console.log('\n=== Total de linhas ===', lines.filter(l => l.trim()).length - 1, 'registros (excluindo cabeçalho)');

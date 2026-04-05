
const pdfjsLib = require('pdfjs-dist/build/pdf.js');
const fs = require('fs');
const path = require('path');

async function dumpPdfText(filePath) {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }
    return fullText;
}

const pdfPath = path.join('C:', 'Users', 'pedro', 'Downloads', 'Despachante Matilde', 'dist', 'Folha Cadastro - 01344883440.pdf');

dumpPdfText(pdfPath).then(text => {
    fs.writeFileSync('pdf_dump.txt', text);
    console.log('--- TEXTO EXTRAÍDO ---');
    console.log(text);
}).catch(err => {
    console.error('Erro ao ler PDF:', err);
});

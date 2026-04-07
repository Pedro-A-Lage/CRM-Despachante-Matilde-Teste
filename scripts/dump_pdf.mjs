
import * as pdfjsLib from 'pdfjs-dist/build/pdf.js';
import fs from 'fs';
import path from 'path';

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

const pdfPath = 'C:/Users/pedro/Downloads/Despachante Matilde/dist/Folha Cadastro - 01344883440.pdf';

dumpPdfText(pdfPath).then(text => {
    fs.writeFileSync('C:/Users/pedro/Downloads/Despachante Matilde/pdf_dump.txt', text);
    console.log('--- TEXTO EXTRAÍDO ---');
    console.log(text);
}).catch(err => {
    console.error('Erro ao ler PDF:', err);
});

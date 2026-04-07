
import * as pdfjsLib from 'pdfjs-dist/build/pdf.js';
import fs from 'fs';

// Force node compatibility
const data = new Uint8Array(fs.readFileSync('C:/Users/pedro/Downloads/Despachante Matilde/dist/Folha Cadastro - 01344883440.pdf'));

async function run() {
    // In some versions of pdfjs-dist, it's under .default
    const getDocument = pdfjsLib.getDocument || (pdfjsLib.default && pdfjsLib.default.getDocument);
    
    if (!getDocument) {
        console.error('Could not find getDocument in', Object.keys(pdfjsLib));
        return;
    }

    const loadingTask = getDocument({ data });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }
    fs.writeFileSync('C:/Users/pedro/Downloads/Despachante Matilde/pdf_dump.txt', fullText);
    console.log('EXTRACTED_OK');
}

run().catch(console.error);

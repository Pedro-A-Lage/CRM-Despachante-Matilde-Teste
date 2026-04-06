// ============================================================
//  MATILDE CRM — Playwright PDF Analyzer (CDP)
//  Conecta ao Chrome em execução e intercepta toda atividade
//  de rede para descobrir como os PDFs do Detran são gerados.
// ============================================================

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CDP_URL = 'http://localhost:9222';
const OUTPUT_FILE = path.join(__dirname, 'analyze-result.json');

// Domínios de interesse (Detran/Cidadão MG)
const DOMINIOS_ALVO = [
    'detran.mg.gov.br',
    'transito.mg.gov.br',
    'cidadao.mg.gov.br',
];

// Extensions de assets estáticos para ignorar
const ASSETS_IGNORAR = ['.css', '.js', '.woff', '.woff2', '.ttf', '.png', '.jpg', '.svg', '.ico', '.gif'];

const eventos = [];
let pdfDetectado = false;

function timestamp() {
    return new Date().toISOString();
}

function isDominioAlvo(url) {
    return DOMINIOS_ALVO.some(d => url.includes(d));
}

function isAsset(url) {
    return ASSETS_IGNORAR.some(ext => url.split('?')[0].endsWith(ext));
}

function isTipoPDF(contentType) {
    return contentType && (
        contentType.includes('application/pdf') ||
        contentType.includes('application/octet-stream')
    );
}

function log(tipo, msg, dados = null) {
    const cor = {
        'INFO':     '\x1b[36m',   // ciano
        'REQUEST':  '\x1b[33m',   // amarelo
        'RESPONSE': '\x1b[32m',   // verde
        'PDF':      '\x1b[35m',   // magenta
        'ABA':      '\x1b[34m',   // azul
        'NAV':      '\x1b[37m',   // branco
        'ERRO':     '\x1b[31m',   // vermelho
    };
    const reset = '\x1b[0m';
    const c = cor[tipo] || reset;

    if (dados) {
        console.log(`${c}[${tipo}]${reset} ${msg}`);
        Object.entries(dados).forEach(([k, v]) => {
            console.log(`       ${k}: ${v}`);
        });
    } else {
        console.log(`${c}[${tipo}]${reset} ${msg}`);
    }
}

function registrar(tipo, dados) {
    const evento = { timestamp: timestamp(), tipo, ...dados };
    eventos.push(evento);
    return evento;
}

function salvarResultados() {
    const resultado = {
        geradoEm: new Date().toISOString(),
        totalEventos: eventos.length,
        pdfDetectado,
        eventos,
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(resultado, null, 2), 'utf8');
    log('INFO', `Resultados salvos em: ${OUTPUT_FILE}`);
}

function monitorarPagina(page, label) {
    // Interceptar requests
    page.on('request', (request) => {
        const url = request.url();
        if (!isDominioAlvo(url) || isAsset(url)) return;

        const dados = {
            method: request.method(),
            url,
        };

        const postData = request.postData();
        if (postData) {
            dados.postBody = postData.length > 500
                ? postData.substring(0, 500) + '... [truncado]'
                : postData;
        }

        log('REQUEST', `${request.method()} ${url}`, dados);
        registrar('REQUEST', dados);
    });

    // Interceptar respostas
    page.on('response', async (response) => {
        const url = response.url();
        if (!isDominioAlvo(url) || isAsset(url)) return;

        const status = response.status();
        const headers = response.headers();
        const contentType = headers['content-type'] || '';
        const contentDisp = headers['content-disposition'] || '';
        const contentLen = headers['content-length'] || '';

        const dados = {
            status,
            contentType,
            url,
        };
        if (contentDisp) dados.contentDisposition = contentDisp;
        if (contentLen) dados.contentLength = contentLen + ' bytes';

        const ehPDF = isTipoPDF(contentType) || contentDisp.includes('.pdf') || url.endsWith('.pdf');

        if (ehPDF) {
            pdfDetectado = true;
            dados.headersCompletos = JSON.stringify(headers);
            log('PDF', `🔴 PDF DETECTADO! ${url}`, dados);
            registrar('PDF_DETECTADO', dados);
        } else {
            log('RESPONSE', `${status} ${url}`, dados);
            registrar('RESPONSE', dados);
        }

        // Detectar redirects relevantes (30x)
        if (status >= 300 && status < 400) {
            const location = headers['location'] || '';
            log('NAV', `Redirect ${status} → ${location}`);
            registrar('REDIRECT', { de: url, para: location, status });
        }
    });

    // Monitorar navegação de frame
    page.on('framenavigated', (frame) => {
        if (frame !== page.mainFrame()) return;
        const url = frame.url();
        if (!isDominioAlvo(url)) return;
        log('NAV', `Navegação: ${url}`);
        registrar('NAVEGACAO', { url, aba: label });
    });

    log('INFO', `Monitorando aba [${label}]`);
}

async function main() {
    console.log('\n============================================================');
    console.log(' MATILDE CRM — Playwright PDF Analyzer');
    console.log('============================================================\n');

    log('INFO', `Conectando ao Chrome em ${CDP_URL}...`);

    let browser;
    try {
        browser = await chromium.connectOverCDP(CDP_URL);
    } catch (err) {
        log('ERRO', 'Não foi possível conectar ao Chrome!');
        log('ERRO', 'Certifique-se de ter aberto o Chrome com chrome.bat primeiro.');
        log('ERRO', `Detalhe: ${err.message}`);
        process.exit(1);
    }

    const contexts = browser.contexts();
    if (contexts.length === 0) {
        log('ERRO', 'Nenhum contexto encontrado no Chrome.');
        process.exit(1);
    }

    const context = contexts[0];
    const pages = context.pages();

    log('INFO', `Conectado! Abas abertas: ${pages.length}`);

    // Monitorar todas as abas existentes
    for (const page of pages) {
        const url = page.url();
        monitorarPagina(page, url);

        // Focar na aba do Detran se encontrada
        if (isDominioAlvo(url)) {
            log('INFO', `Aba do Detran encontrada: ${url}`);
        }
    }

    // Monitorar novas abas/popups que abrirem
    context.on('page', (newPage) => {
        const url = newPage.url();
        log('ABA', `Nova aba aberta: ${url || '(carregando...)'}`);
        registrar('NOVA_ABA', { url });

        // Aplicar listeners assim que a aba carregar
        newPage.on('load', () => {
            const loadedUrl = newPage.url();
            log('ABA', `Aba carregada: ${loadedUrl}`);
            monitorarPagina(newPage, loadedUrl);

            if (loadedUrl.endsWith('.pdf') || isDominioAlvo(loadedUrl)) {
                log('PDF', `Nova aba pode ser um PDF: ${loadedUrl}`);
                pdfDetectado = true;
                registrar('PDF_NOVA_ABA', { url: loadedUrl });
            }
        });

        // Monitorar requests da nova aba imediatamente
        monitorarPagina(newPage, 'nova-aba');
    });

    console.log('\n============================================================');
    console.log(' MONITORANDO — Clique OK no modal do Detran agora!');
    console.log(' Pressione Ctrl+C para encerrar e salvar os resultados.');
    console.log('============================================================\n');

    // Aguardar Ctrl+C
    process.on('SIGINT', () => {
        console.log('\n');
        log('INFO', 'Encerrando...');
        salvarResultados();
        log('INFO', `Total de eventos capturados: ${eventos.length}`);
        if (pdfDetectado) {
            log('PDF', '✅ PDF foi detectado! Verifique analyze-result.json para os detalhes.');
        } else {
            log('INFO', 'Nenhum PDF detectado ainda. Verifique se o fluxo foi executado.');
        }
        browser.close().then(() => process.exit(0)).catch(() => process.exit(0));
    });

    // Manter rodando
    await new Promise(() => {});
}

main().catch((err) => {
    log('ERRO', `Erro fatal: ${err.message}`);
    process.exit(1);
});

// ============================================================
//  MATILDE CRM - EXTENSÃO DETRAN MG
//  background.js — Service Worker
//
//  Responsabilidades:
//   1. Localizar a aba do CRM aberta no navegador
//   2. Retransmitir mensagens do content.js → CRM (crm-content.js)
//   3. Capturar PDFs em páginas que o Chrome abre direto (sem content script)
//   4. Responder a pedidos de proxy CORS do CRM (PROXY_FETCH)
// ============================================================

console.log('[Matilde][Background] Service Worker iniciado.');

let crmTabId = null;

// Páginas do Detran que retornam PDF puro (Chrome abre no próprio visualizador,
// NÃO executa content scripts — por isso precisamos capturar aqui no background)
const PDF_PAGE_PATTERNS = [
    'emitir-ficha-de-cadastro-e-dae',
    'emitir-dae',
    'gerar-dae',
    // 'consulta-de-laudo-da-vistoria' — REMOVIDO: o content.js (modConsultaLaudo) já trata esta página.
    // O background capturava o PDF duplicado, causando download duplo.
];

// ── Todas as actions que o background sabe retransmitir ao CRM ───────────────
const ACOES_VALIDAS = [
    'CAPTURED_DETRAN_PDF',
    'CAPTURED_VISTORIA_ECV',
    'CAPTURED_LAUDO_PDF',
    'CAPTURED_CONFIRMAR_DADOS',
    'UPDATE_PLACA',           // ← Nova: atualiza placa quando muda no documento final
    'CRLV_CONSULTA_RESULTADO', // ← Nova: resultado da consulta CRLV Digital
];

// ════════════════════════════════════════════════════════════
// DETECTOR DE ABA DO CRM + PÁGINAS DE PDF PURO
// ════════════════════════════════════════════════════════════

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab.url) return;

    // Registra a aba do CRM sempre que ela atualizar
    if (isCRMTab(tab.url)) {
        crmTabId = tabId;
        console.log('[Matilde][Background] Aba do CRM detectada:', crmTabId);
    }

    // Detecta páginas do Detran que entregam PDF puro (sem content script)
    if (changeInfo.status === 'complete' && (tab.url.includes('transito.mg.gov.br') || tab.url.includes('detran.mg.gov.br'))) {
        const isPdfPage = PDF_PAGE_PATTERNS.some(p => tab.url.includes(p));
        if (isPdfPage) {
            console.log('[Matilde][Background] Página de PDF puro detectada:', tab.url);
            // Força download do PDF (o detector de downloads vai capturar e enviar ao CRM)
            forcarDownloadPDF(tab.url, tabId);
        }
    }
});

function isCRMTab(url) {
    return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('matildecrm.com') || url.includes('despachantematilde.com');
}

// ════════════════════════════════════════════════════════════
// FORÇAR DOWNLOAD DO PDF
// Quando o Chrome abre PDF no viewer interno, forçamos o download.
// O detector de downloads (mais abaixo) vai capturar e enviar ao CRM.
// ════════════════════════════════════════════════════════════

async function forcarDownloadPDF(pdfUrl, sourceTabId) {
    try {
        console.log('[Matilde][Background] PDF detectado, capturando via cookies:', pdfUrl);

        // Estratégia: usar chrome.cookies API para obter cookies da sessão do Detran
        // e fazer fetch direto no service worker com o header Cookie
        let base64 = null;

        // 1. Obter cookies do domínio Detran
        const urlObj = new URL(pdfUrl);
        const cookies = await chrome.cookies.getAll({ url: pdfUrl });
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        console.log('[Matilde][Background] Cookies obtidos:', cookies.length);

        // 2. Fetch com cookies no header
        if (cookieStr) {
            try {
                const res = await fetch(pdfUrl, {
                    headers: { 'Cookie': cookieStr },
                    credentials: 'include',
                });
                const contentType = res.headers.get('content-type') || '';
                console.log('[Matilde][Background] Response content-type:', contentType, 'status:', res.status);

                if (contentType.includes('pdf') || contentType.includes('octet-stream')) {
                    const blob = await res.blob();
                    if (blob.size > 500) {
                        const reader = new FileReader();
                        base64 = await new Promise((resolve, reject) => {
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                        console.log('[Matilde][Background] PDF capturado via cookies! Tamanho:', blob.size);
                    }
                } else {
                    console.warn('[Matilde][Background] Resposta não é PDF:', contentType);
                }
            } catch (fetchErr) {
                console.warn('[Matilde][Background] Fetch com cookies falhou:', fetchErr.message);
            }
        }

        // 3. Fallback: tentar injetar fetch na aba (pode funcionar se não for PDF viewer puro)
        if (!base64) {
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: sourceTabId },
                    func: async (url) => {
                        try {
                            const res = await fetch(url, { credentials: 'include', cache: 'force-cache' });
                            const ct = res.headers.get('content-type') || '';
                            if (!ct.includes('pdf') && !ct.includes('octet-stream')) return { error: 'Not PDF: ' + ct };
                            const blob = await res.blob();
                            if (blob.size < 500) return { error: 'Too small: ' + blob.size };
                            const b64 = await new Promise((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result);
                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            });
                            return { success: true, base64: b64, size: blob.size };
                        } catch (e) { return { error: e.message }; }
                    },
                    args: [pdfUrl],
                });
                const result = results?.[0]?.result;
                if (result?.success && result?.base64) {
                    base64 = result.base64;
                    console.log('[Matilde][Background] PDF capturado via inject! Tamanho:', result.size);
                } else {
                    console.warn('[Matilde][Background] Inject falhou:', result?.error);
                }
            } catch (injectErr) {
                console.warn('[Matilde][Background] Script inject falhou:', injectErr.message);
            }
        }

        // 4. Fallback final: download para disco e notificar
        if (!base64) {
            console.warn('[Matilde][Background] Nenhuma estratégia conseguiu capturar o PDF. Fazendo download local...');
            chrome.downloads.download({ url: pdfUrl, filename: 'ficha_cadastro_detran.pdf' });
            return;
        }

        // 5. Sucesso — enviar ao CRM
        const ctx = await chrome.storage.local.get([
            'matilde_servico_ativo', 'matilde_placa', 'matilde_chassi',
            'matilde_cpfCnpj', 'matilde_confirmar_dados_text', 'matilde_osId'
        ]);

        await garantirCRMTab();
        if (crmTabId) {
            chrome.tabs.sendMessage(crmTabId, {
                source: 'MATILDE_EXTENSION',
                type: 'PROCESS_DETRAN_PDF',
                payload: {
                    fileUrl: base64,
                    fileName: `ficha_cadastro_${ctx.matilde_placa || 'detran'}.pdf`,
                    placa: ctx.matilde_placa || '',
                    chassi: ctx.matilde_chassi || '',
                    crmServico: ctx.matilde_servico_ativo || 'primeiro_emplacamento',
                    osId: ctx.matilde_osId || null,
                    confirmarDadosText: ctx.matilde_confirmar_dados_text || null,
                }
            }, (resp) => {
                if (chrome.runtime.lastError) {
                    console.error('[Matilde][Background] Erro ao enviar PDF:', chrome.runtime.lastError.message);
                } else {
                    console.log('[Matilde][Background] PDF enviado ao CRM!', resp);
                    chrome.storage.local.remove([
                        'matilde_servico_ativo', 'matilde_placa', 'matilde_chassi',
                        'matilde_cpfCnpj', 'matilde_confirmar_dados_text'
                    ]);
                }
            });
        }
    } catch (err) {
        console.error('[Matilde][Background] Erro ao capturar PDF:', err.message);
        // Último recurso: download local
        try { chrome.downloads.download({ url: pdfUrl, filename: 'ficha_cadastro_detran.pdf' }); } catch(_) {}
    }
}

// ════════════════════════════════════════════════════════════
// CAPTURA DE PDF PURO (páginas sem content script) - FALLBACK
//
// PASSO 1 — Faz fetch do PDF com as credenciais do navegador
// PASSO 2 — Verifica se a resposta é realmente um PDF
// PASSO 3 — Converte para Base64
// PASSO 4 — Recupera contexto salvo (placa, chassi, serviço)
// PASSO 5 — Envia ao CRM via transmitirParaCRM()
// ════════════════════════════════════════════════════════════

async function capturarPDFDaPagina(pdfUrl, sourceTabId) {
    try {
        console.log('[Matilde][Background][Passo1] Capturando PDF da aba:', pdfUrl, 'tabId:', sourceTabId);

        // Estratégia 1: Injetar fetch na aba que tem o PDF (tem os cookies da sessão)
        let base64 = null;
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: sourceTabId },
                func: async (url) => {
                    try {
                        const res = await fetch(url, { credentials: 'include' });
                        const blob = await res.blob();
                        if (blob.size < 500 || (!blob.type.includes('pdf') && !blob.type.includes('octet-stream'))) {
                            return null;
                        }
                        return await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    } catch (e) {
                        return null;
                    }
                },
                args: [pdfUrl],
            });
            if (results && results[0] && results[0].result) {
                base64 = results[0].result;
                console.log('[Matilde][Background][Passo2] PDF capturado via inject na aba!');
            }
        } catch (injectErr) {
            console.log('[Matilde][Background] Inject falhou (PDF viewer?):', injectErr.message);
        }

        // Estratégia 2: Fallback — fetch com cookies API no background
        if (!base64) {
            try {
                const cookies = await chrome.cookies.getAll({ url: pdfUrl });
                const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
                const response = await fetch(pdfUrl, {
                    headers: cookieStr ? { 'Cookie': cookieStr } : {},
                    credentials: 'include',
                });
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('pdf') || contentType.includes('octet-stream')) {
                    const blob = await response.blob();
                    if (blob.size > 500) {
                        base64 = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                        console.log('[Matilde][Background][Passo2] PDF capturado via fetch com cookies.');
                    }
                }
            } catch (fetchErr) {
                console.log('[Matilde][Background] Fetch com cookies falhou:', fetchErr.message);
            }
        }

        if (!base64) {
            console.log('[Matilde][Background] Não foi possível capturar o PDF por nenhuma estratégia.');
            return;
        }

        // PASSO 3 — Recupera contexto
        const ctx = await chrome.storage.local.get([
            'matilde_servico_ativo', 'matilde_placa', 'matilde_chassi',
            'matilde_cpfCnpj', 'matilde_confirmar_dados_text', 'matilde_osId'
        ]);

        const payload = {
            fileUrl: base64,
            fileName: `documento_detran_${ctx.matilde_placa || Date.now()}.pdf`,
            placa: ctx.matilde_placa || '',
            chassi: ctx.matilde_chassi || '',
            crmServico: ctx.matilde_servico_ativo || 'primeiro_emplacamento',
            osId: ctx.matilde_osId || null,
            confirmarDadosText: ctx.matilde_confirmar_dados_text || null,
        };

        // PASSO 4 — Envia ao CRM
        console.log('[Matilde][Background][Passo4] Enviando PDF para o CRM...', { placa: payload.placa, fileName: payload.fileName });
        await garantirCRMTab();
        if (crmTabId) {
            chrome.tabs.sendMessage(crmTabId, {
                source: 'MATILDE_EXTENSION',
                type: 'PROCESS_DETRAN_PDF',
                payload,
            }, (resp) => {
                if (chrome.runtime.lastError) {
                    console.error('[Matilde][Background] Erro ao enviar para CRM:', chrome.runtime.lastError.message);
                } else {
                    console.log('[Matilde][Background] PDF enviado ao CRM com sucesso!', resp);
                    chrome.storage.local.remove([
                        'matilde_servico_ativo', 'matilde_placa', 'matilde_chassi',
                        'matilde_cpfCnpj', 'matilde_confirmar_dados_text'
                    ]);
                }
            });
        }
    } catch (err) {
        console.error('[Matilde][Background] Erro ao capturar PDF da página:', err);
    }
}

// ════════════════════════════════════════════════════════════
// RECEPTOR DE MENSAGENS DO CONTENT.JS
// Retransmite qualquer ação válida para a aba do CRM
// ════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Matilde][Background] Mensagem recebida do content.js:', message.action);

    if (!ACOES_VALIDAS.includes(message.action)) return;

    // Garante que temos a aba do CRM antes de transmitir
    garantirCRMTab().then(found => {
        if (found) {
            transmitirParaCRM(message, sendResponse);
        } else {
            console.error('[Matilde][Background] Nenhuma aba do CRM encontrada.');
            sendResponse({ success: false, error: 'CRM não está aberto' });
        }
    });

    return true; // mantém a porta de resposta aberta (async)
});

// ════════════════════════════════════════════════════════════
// TRANSMISSÃO PARA O CRM
// Mapeia action do content.js → type que o crm-content.js espera
// ════════════════════════════════════════════════════════════

function transmitirParaCRM(message, sendResponse, isRetry = false) {
    // Mapeamento action → type
    const TYPE_MAP = {
        'CAPTURED_DETRAN_PDF': 'PROCESS_DETRAN_PDF',
        'CAPTURED_VISTORIA_ECV': 'CAPTURED_VISTORIA_ECV',
        'CAPTURED_LAUDO_PDF': 'CAPTURED_LAUDO_PDF',
        'CAPTURED_CONFIRMAR_DADOS': 'CAPTURED_CONFIRMAR_DADOS',
        'UPDATE_PLACA': 'UPDATE_PLACA',
        'CRLV_CONSULTA_RESULTADO': 'CRLV_CONSULTA_RESULTADO',
    };

    const targetType = TYPE_MAP[message.action] || message.action;

    chrome.tabs.sendMessage(crmTabId, {
        source: 'MATILDE_EXTENSION',
        type: targetType,
        payload: message.payload,
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[Matilde][Background] Erro ao enviar para CRM:', chrome.runtime.lastError.message);

            // Se é a primeira tentativa, reinjetar crm-content.js e tentar novamente
            if (!isRetry) {
                console.log('[Matilde][Background] Tentando reinjetar crm-content.js e reenviar...');
                crmTabId = null;
                garantirCRMTab().then(found => {
                    if (found) {
                        // Aguarda 300ms para o content script inicializar
                        setTimeout(() => {
                            transmitirParaCRM(message, sendResponse, true);
                        }, 300);
                    } else {
                        sendResponse({ success: false, error: 'CRM não está aberto' });
                    }
                });
            } else {
                crmTabId = null;
                sendResponse({ success: false, error: 'Content script do CRM não respondeu após retry' });
            }
        } else {
            console.log('[Matilde][Background] Transmitido ao CRM com sucesso:', targetType, response);
            sendResponse(response);
        }
    });
}

// ════════════════════════════════════════════════════════════
// GARANTIR ABA DO CRM
// Busca manualmente entre todas as abas se crmTabId for nulo
// ════════════════════════════════════════════════════════════

async function garantirCRMTab() {
    if (crmTabId) {
        // Verifica se a aba ainda existe
        try {
            await chrome.tabs.get(crmTabId);
        } catch {
            crmTabId = null;
        }
    }

    if (!crmTabId) {
        const tabs = await chrome.tabs.query({});
        const crmTab = tabs.find(t => t.url && isCRMTab(t.url));
        if (crmTab) {
            crmTabId = crmTab.id;
        }
    }

    if (!crmTabId) return false;

    // Tenta injetar o content script caso não esteja carregado (aba recarregada)
    try {
        await chrome.scripting.executeScript({
            target: { tabId: crmTabId },
            files: ['crm-content.js']
        });
    } catch (e) {
        // Já injetado ou sem permissão — OK
        console.log('[Matilde][Background] Content script já injetado ou erro:', e.message);
    }

    return true;
}

// ════════════════════════════════════════════════════════════
// PROXY FETCH — Burla CORS quando o CRM precisa buscar algo do Detran
// Uso: chrome.runtime.sendMessage({ action: "PROXY_FETCH", url: "https://..." })
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// DETECTOR DE DOWNLOAD DE CRLV
// Monitora downloads do cidadao.mg.gov.br e notifica o CRM
// para abrir automaticamente o seletor de arquivo
// ════════════════════════════════════════════════════════════

chrome.downloads.onChanged.addListener(async (delta) => {
    if (!delta.state || delta.state.current !== 'complete') return;

    try {
        const [item] = await chrome.downloads.search({ id: delta.id });
        if (!item) return;

        const url = (item.url || '').toLowerCase();
        const filename = (item.filename || '').toLowerCase();

        // Verifica se é PDF dos portais do governo
        const isDetran = url.includes('detran.mg.gov.br') || url.includes('transito.mg.gov.br');
        const isCidadao = url.includes('cidadao.mg.gov.br');
        const isPdfLike = filename.includes('.pdf') || url.includes('pdf') ||
                          filename.includes('ficha') || filename.includes('dae') ||
                          filename.includes('crlv') || filename.includes('cadastro');

        if (!isPdfLike && !isDetran && !isCidadao) return;

        console.log('[Matilde][Background] Download de PDF detectado:', item.filename, '| URL:', url.substring(0, 80));

        // Recupera contexto completo
        const ctx = await chrome.storage.local.get([
            'matilde_servico_ativo', 'matilde_placa', 'matilde_chassi',
            'matilde_cpfCnpj', 'matilde_confirmar_dados_text', 'matilde_osId',
            'matilde_crlv_osId'
        ]);

        const osId = ctx.matilde_osId || ctx.matilde_crlv_osId || null;
        const nomeArquivo = item.filename.split(/[/\\]/).pop() || 'documento.pdf';

        // Tenta ler o PDF baixado via URL original (com cookies da sessão)
        let base64 = null;
        try {
            const cookies = await chrome.cookies.getAll({ url: item.url });
            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            console.log('[Matilde][Background] Download fetch com', cookies.length, 'cookies');
            const response = await fetch(item.url, {
                headers: cookieStr ? { 'Cookie': cookieStr } : {},
                credentials: 'include',
            });
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('pdf') || contentType.includes('octet-stream')) {
                const blob = await response.blob();
                if (blob.size > 500) {
                    base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                    console.log('[Matilde][Background] PDF lido via cookies! Tamanho:', blob.size);
                }
            } else {
                console.warn('[Matilde][Background] Download fetch retornou:', contentType);
            }
        } catch (fetchErr) {
            console.log('[Matilde][Background] Fetch da URL com cookies falhou:', fetchErr.message);
        }

        const found = await garantirCRMTab();
        if (!found || !crmTabId) {
            console.log('[Matilde][Background] CRM não encontrado para enviar PDF.');
            return;
        }

        if (base64) {
            // Determina o tipo de mensagem baseado na origem
            if (isDetran) {
                // Ficha de cadastro / DAE do Detran → PROCESS_DETRAN_PDF
                console.log('[Matilde][Background] Enviando PDF do Detran ao CRM...');
                chrome.tabs.sendMessage(crmTabId, {
                    source: 'MATILDE_EXTENSION',
                    type: 'PROCESS_DETRAN_PDF',
                    payload: {
                        fileUrl: base64,
                        fileName: nomeArquivo,
                        placa: ctx.matilde_placa || '',
                        chassi: ctx.matilde_chassi || '',
                        crmServico: ctx.matilde_servico_ativo || 'primeiro_emplacamento',
                        osId: osId,
                        confirmarDadosText: ctx.matilde_confirmar_dados_text || null,
                    }
                });
            } else {
                // CRLV do Cidadão → CRLV_CONSULTA_RESULTADO
                console.log('[Matilde][Background] Enviando CRLV ao CRM...');
                chrome.tabs.sendMessage(crmTabId, {
                    source: 'MATILDE_EXTENSION',
                    type: 'CRLV_CONSULTA_RESULTADO',
                    payload: {
                        osId: osId,
                        resultado: '✅ PDF baixado e capturado automaticamente',
                        pdfBase64: base64,
                        pdfNome: nomeArquivo,
                    }
                });
            }
            // Limpa contexto após envio
            chrome.storage.local.remove(['matilde_crlv_osId']);
        } else {
            // Não conseguiu ler — notifica CRM para abrir seletor de arquivo
            console.log('[Matilde][Background] PDF não pôde ser lido, notificando CRM...');
            chrome.tabs.sendMessage(crmTabId, {
                source: 'MATILDE_EXTENSION',
                type: 'CRLV_DOWNLOAD_COMPLETE',
                payload: {
                    osId: osId,
                    filename: nomeArquivo,
                    fullPath: item.filename,
                }
            });
        }
    } catch (err) {
        console.error('[Matilde][Background] Erro no detector de download:', err);
    }
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message.action !== 'PROXY_FETCH') return;

    console.log('[Matilde][Background] PROXY_FETCH para:', message.url);
    fetch(message.url)
        .then(res => res.blob())
        .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => sendResponse({ success: true, base64: reader.result, type: blob.type });
            reader.readAsDataURL(blob);
        })
        .catch(err => {
            console.error('[Matilde][Background] Erro no PROXY_FETCH:', err);
            sendResponse({ success: false, error: err.toString() });
        });

    return true; // mantém porta aberta para resposta async
});

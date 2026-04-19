// ============================================================
//  MATILDE CRM - EXTENSÃO DETRAN/CIDADÃO MG
//  background.js — Service Worker
// ============================================================

console.log('[Matilde][Background] Service Worker iniciado.');

// Chaves de contexto usadas para vincular PDFs/dados capturados à OS correta.
// Usada em todos os pontos de cleanup para garantir consistência.
const CONTEXT_STORAGE_KEYS = [
    'matilde_osId', 'matilde_placa', 'matilde_chassi',
    'matilde_cpfCnpj', 'matilde_nome', 'matilde_servico_ativo',
    'matilde_confirmar_dados_text'
];

let crmTabId = null;

// BUG-06 FIX: After a SW restart crmTabId resets to null. Proactively scan all open
// tabs on startup/install so we can find the CRM tab before any message is sent.
function inicializarCrmTabId() {
    chrome.tabs.query({}, (tabs) => {
        const crmTab = tabs.find(t => t.url && isCRMTab(t.url));
        if (crmTab) {
            crmTabId = crmTab.id;
            console.log('[Matilde][Background] Aba do CRM encontrada na inicialização:', crmTabId);
        }
    });
}
chrome.runtime.onStartup.addListener(inicializarCrmTabId);
chrome.runtime.onInstalled.addListener(inicializarCrmTabId);

// 1. MONITORAR ABA DO CRM
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url && isCRMTab(tab.url)) {
        crmTabId = tabId;
        console.log('[Matilde][Background] Aba do CRM detectada:', crmTabId);
    }

});

// Interceptar navegação para Detran vistoria e salvar osId ANTES do redirect
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) return; // apenas frame principal
    try {
        const urlObj = new URL(details.url);
        const isDetranVistoria = (
            urlObj.hostname.includes('transito.mg.gov.br') ||
            urlObj.hostname.includes('detran.mg.gov.br')
        ) && urlObj.pathname.toLowerCase().includes('vistoria');

        if (!isDetranVistoria) return;

        const osIdUrl = urlObj.searchParams.get('osId');
        const placa = urlObj.searchParams.get('placa');

        if (osIdUrl) {
            // osId está na URL — salvar direto
            const dados = { matilde_osId: osIdUrl, matilde_servico_ativo: 'vistoria' };
            if (placa) dados.matilde_placa = placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            chrome.storage.local.set(dados, () => {
                console.log('[Matilde][Background] osId vistoria salvo via URL:', dados);
            });
        } else if (crmTabId) {
            // osId não está na URL — tentar extrair da aba do CRM (/ordens/{osId})
            chrome.tabs.get(crmTabId, (tab) => {
                if (chrome.runtime.lastError || !tab?.url) return;
                const match = tab.url.match(/\/ordens\/([a-zA-Z0-9\-]+)/);
                if (match && match[1]) {
                    const osIdCrm = match[1];
                    const dados = { matilde_osId: osIdCrm, matilde_servico_ativo: 'vistoria' };
                    if (placa) dados.matilde_placa = placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                    chrome.storage.local.set(dados, () => {
                        console.log('[Matilde][Background] osId vistoria extraído da aba CRM:', dados);
                    });
                }
            });
        }
    } catch (_) {}
});

// BUG-05 FIX: Match only specific CRM ports on localhost to avoid capturing unrelated
// local dev servers (Webpack, Vite from other projects, test runners, etc.).
const CRM_LOCALHOST_PORTS = ['3000', '5173'];
const CRM_PATH_PATTERNS = ['/ordens', '/clientes', '/financeiro'];

function isCRMTab(url) {
    if (url.includes('matildecrm.com') ||
        url.includes('despachantematilde.com') ||
        url.includes('despachantematilde.com.br')) {
        return true;
    }
    if (url.includes('localhost')) {
        try {
            const parsed = new URL(url);
            if (CRM_LOCALHOST_PORTS.includes(parsed.port)) return true;
            if (CRM_PATH_PATTERNS.some(p => parsed.pathname.startsWith(p))) return true;
        } catch (_) {}
        console.warn('[Matilde][Background] localhost tab detectada mas porta/caminho não reconhecido como CRM:', url);
        return false;
    }
    return false;
}

// ════════════════════════════════════════════════════════════
// CAPTURA DE PDF PURO (páginas sem content script)
//
// PASSO 1 — Faz fetch do PDF com as credenciais do navegador
// PASSO 2 — Verifica se a resposta é realmente um PDF
// PASSO 3 — Converte para Base64
// PASSO 4 — Recupera contexto salvo (placa, chassi, serviço)
// PASSO 5 — Envia ao CRM via transmitirParaCRM()
// ════════════════════════════════════════════════════════════

async function capturarPDFDaPagina(pdfUrl, sourceTabId) {
    try {
        // PASSO 1
        console.log('[Matilde][Background][Passo1] Baixando PDF:', pdfUrl);
        const response = await fetch(pdfUrl, { credentials: 'include' });

        // PASSO 2
        const contentType = response.headers.get('content-type') || '';
        console.log('[Matilde][Background][Passo2] Content-Type:', contentType);
        if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
            console.log('[Matilde][Background][Passo2] Não é PDF — deixando o content.js tratar.');
            return;
        }

        // PASSO 3
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        const base64 = 'data:application/pdf;base64,' + btoa(binary);
        console.log('[Matilde][Background][Passo3] PDF convertido para Base64.');

        // PASSO 4
        const ctx = await chrome.storage.local.get([
            'matilde_servico_ativo', 'matilde_placa', 'matilde_chassi',
            'matilde_cpfCnpj', 'matilde_confirmar_dados_text', 'matilde_osId'
        ]);

        const payload = {
            fileUrl: base64,
            fileName: `documento_detran_${ctx.matilde_placa || Date.now()}.pdf`,
            placa: ctx.matilde_placa || '',
            chassi: ctx.matilde_chassi || '',
            crmServico: ctx.matilde_servico_ativo || 'generico',
            osId: ctx.matilde_osId || null,
            confirmarDadosText: ctx.matilde_confirmar_dados_text || null,
        };

        // PASSO 5
        console.log('[Matilde][Background][Passo5] Enviando PDF para o CRM...', { placa: payload.placa });
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
                    chrome.storage.local.remove(CONTEXT_STORAGE_KEYS);
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
    // Só aceitamos mensagens dos nossos próprios content scripts.
    // Mensagens externas (chrome.runtime.sendMessage de outra extensão) trariam sender.id diferente.
    if (!sender || sender.id !== chrome.runtime.id) {
        console.warn('[Matilde][Background] Mensagem recusada — sender.id inválido:', sender?.id);
        return false;
    }
    console.log('[Matilde][Background] Mensagem recebida do content.js:', message.action);

    if (message.action === 'SAVE_DATA') {
        if (message.payload && message.payload.type === 'SITE_ERROR') {
            console.warn('[Matilde][Background] Erro do site detectado:', message.payload.data.message);
            enviarParaCRM({ type: 'SITE_ERROR', payload: message.payload.data });
        } else if (message.payload) {
            enviarParaCRM(message.payload);
        }
        return true;
    }

    if (message.action === 'CAPTURE_DAE_PDF') {
        (async () => {
            try {
                const ctx = await new Promise(resolve =>
                    chrome.storage.local.get(['matilde_osId', 'matilde_placa', 'matilde_chassi', 'matilde_servico_ativo'], resolve)
                );

                const servicoAtivo = message.payload.servicoAtivo || ctx.matilde_servico_ativo || '';
                const isPrimeiroEmplacamento = servicoAtivo === 'primeiro_emplacamento';

                const payload = {
                    fileBase64: message.payload.base64,
                    fileName: message.payload.fileName || (isPrimeiroEmplacamento
                        ? `ficha_cadastro_dae_${Date.now()}.pdf`
                        : `decalque_${message.payload.placa || ctx.matilde_placa || Date.now()}.pdf`),
                    osId: message.payload.osId || ctx.matilde_osId || null,
                    placa: message.payload.placa || ctx.matilde_placa || '',
                    chassi: message.payload.chassi || ctx.matilde_chassi || '',
                    servicoAtivo,
                };

                const tipo = isPrimeiroEmplacamento ? 'CAPTURED_PRIMEIRO_EMPLACAMENTO_PDF' : 'CAPTURED_DAE_PDF';

                await garantirCRMTab();
                if (crmTabId) {
                    chrome.tabs.sendMessage(crmTabId, {
                        source: 'MATILDE_EXTENSION',
                        type: tipo,
                        payload,
                    }, (resp) => {
                        if (chrome.runtime.lastError) {
                            console.error(`[Matilde][Background] Erro ao enviar ${tipo}:`, chrome.runtime.lastError.message);
                        } else {
                            console.log(`[Matilde][Background] ${tipo} enviado ao CRM:`, resp);
                        }
                    });
                } else {
                    console.warn('[Matilde][Background] Aba do CRM não encontrada para enviar Decalque.');
                }

                sendResponse({ success: true });
            } catch (err) {
                console.error('[Matilde][Background] Erro ao processar CAPTURE_DAE_PDF:', err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true; // async sendResponse
    }

    if (message.action === 'CAPTURE_VISTORIA') {
        console.log('[Matilde][Background] CAPTURE_VISTORIA recebido, payload:', JSON.stringify(message.payload));
        (async () => {
            try {
                await garantirCRMTab();
                console.log('[Matilde][Background] crmTabId:', crmTabId);
                if (crmTabId) {
                    chrome.tabs.sendMessage(crmTabId, {
                        source: 'MATILDE_EXTENSION',
                        type: 'CAPTURED_VISTORIA_ECV',
                        payload: message.payload,
                    }, (resp) => {
                        if (chrome.runtime.lastError) {
                            console.error('[Matilde][Background] Erro ao enviar CAPTURED_VISTORIA:', chrome.runtime.lastError.message);
                        } else {
                            console.log('[Matilde][Background] CAPTURED_VISTORIA enviado ao CRM:', resp);
                        }
                    });
                }
                sendResponse({ success: true });
            } catch (err) {
                console.error('[Matilde][Background] Erro CAPTURE_VISTORIA:', err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (message.action === 'CAPTURE_SEGUNDA_VIA') {
        (async () => {
            try {
                await garantirCRMTab();
                if (crmTabId) {
                    chrome.tabs.sendMessage(crmTabId, {
                        source: 'MATILDE_EXTENSION',
                        type: 'CAPTURED_SEGUNDA_VIA',
                        payload: message.payload,
                    }, (resp) => {
                        if (chrome.runtime.lastError) {
                            console.error('[Matilde][Background] Erro ao enviar CAPTURED_SEGUNDA_VIA:', chrome.runtime.lastError.message);
                        } else {
                            console.log('[Matilde][Background] CAPTURED_SEGUNDA_VIA enviado ao CRM:', resp);
                        }
                    });
                }
                sendResponse({ success: true });
            } catch (err) {
                console.error('[Matilde][Background] Erro CAPTURE_SEGUNDA_VIA:', err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (message.action === 'CAPTURE_PRIMEIRO_EMPLACAMENTO') {
        (async () => {
            try {
                const dados = message.payload.dados;
                // Salva para eventual re-POST da pág 4
                await chrome.storage.session.set({ matilde_primeiro_emplacamento_dados: dados });

                // Envia imediatamente ao CRM sem esperar PDF
                await garantirCRMTab();
                if (crmTabId) {
                    chrome.tabs.sendMessage(crmTabId, {
                        source: 'MATILDE_EXTENSION',
                        type: 'CAPTURED_PRIMEIRO_EMPLACAMENTO',
                        payload: { dados, fileBase64: null, fileName: null },
                    }, (resp) => {
                        if (chrome.runtime.lastError) {
                            console.error('[Matilde][Background] Erro ao enviar CAPTURED_PRIMEIRO_EMPLACAMENTO:', chrome.runtime.lastError.message);
                        } else {
                            console.log('[Matilde][Background] CAPTURED_PRIMEIRO_EMPLACAMENTO enviado ao CRM (sem PDF).');
                        }
                    });
                } else {
                    console.warn('[Matilde][Background] CRM não encontrado ao enviar pág 3.');
                }

                sendResponse({ success: true });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (message.action === 'CLEANUP_VISTORIA') {
        chrome.storage.local.remove([
            'matilde_osId',
            'matilde_servico_ativo',
        ], () => {
            console.log('[Matilde][Background] Storage limpo por CLEANUP_VISTORIA.');
            sendResponse({ success: true });
        });
        return true;
    }

    if (message.action === 'CLEANUP_PRIMEIRO_EMPLACAMENTO') {
        chrome.storage.session.remove([
            'matilde_primeiro_emplacamento_dados',
        ], () => {
            console.log('[Matilde][Background] Session storage limpo por CLEANUP_PRIMEIRO_EMPLACAMENTO.');
            sendResponse({ success: true });
        });
        return true;
    }

    // Ação genérica: limpa TUDO do fluxo de captura (osId, servico_ativo, dados pendentes).
    // Usada após anexar PDF à OS em QUALQUER serviço (transferência, primeiro emplacamento, etc.)
    if (message.action === 'CLEANUP_CAPTURA') {
        chrome.storage.local.remove([
            'matilde_osId',
            'matilde_servico_ativo',
            'matilde_placa',
            'matilde_chassi',
        ], () => {
            chrome.storage.session.remove([
                'matilde_primeiro_emplacamento_dados',
                'matilde_primeiro_emplacamento_osId',
            ], () => {
                console.log('[Matilde][Background] Storage limpo por CLEANUP_CAPTURA.');
                sendResponse({ success: true });
            });
        });
        return true;
    }

    if (message.action === 'DEFINIR_OS_PRIMEIRO_EMPLACAMENTO') {
        const osId = message.payload?.osId || null;
        if (osId) {
            // Salva no session (para dados do primeiro emplacamento) E no local (para captura de PDF)
            chrome.storage.session.set({ matilde_primeiro_emplacamento_osId: osId });
            chrome.storage.local.set({ matilde_osId: osId }, () => {
                console.log('[Matilde][Background] osId salvo (local + session):', osId);
                sendResponse({ success: true });
            });
        } else {
            sendResponse({ success: false });
        }
        return true;
    }

    if (message.action === 'DEFINIR_SERVICO') {
        const servico = message.payload?.servico || null;
        if (servico) {
            chrome.storage.local.set({ matilde_servico_ativo: servico }, () => {
                console.log('[Matilde][Background] matilde_servico_ativo definido como:', servico);
                sendResponse({ success: true });
            });
        } else {
            chrome.storage.local.remove('matilde_servico_ativo', () => {
                console.log('[Matilde][Background] matilde_servico_ativo removido.');
                sendResponse({ success: true });
            });
        }
        return true;
    }

    // Ações que devem ser retransmitidas ao CRM via transmitirParaCRM()
    const RETRANSMITIR_ACTIONS = [
        'CAPTURED_CONFIRMAR_DADOS', 'CAPTURED_DETRAN_PDF', 'CAPTURED_LAUDO_PDF',
        'UPDATE_PLACA', 'CRLV_CONSULTA_RESULTADO', 'CAPTURED_VISTORIA_ECV'
    ];
    if (RETRANSMITIR_ACTIONS.includes(message.action)) {
        (async () => {
            await garantirCRMTab();
            if (crmTabId) {
                transmitirParaCRM(message, sendResponse);
            } else {
                console.error('[Matilde][Background] CRM não aberto para ação:', message.action);
                sendResponse({ success: false, error: 'CRM não aberto' });
            }
        })();
        return true; // Mantém canal aberto para sendResponse assíncrono
    }

    // Ação não reconhecida — logar para debug
    console.warn('[Matilde][Background] Ação não tratada:', message.action);
    return false;
});

// ════════════════════════════════════════════════════════════
// TRANSMISSÃO PARA O CRM
// Mapeia action do content.js → type que o crm-content.js espera
// ════════════════════════════════════════════════════════════

function transmitirParaCRM(message, sendResponse, isRetry = false) {
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

            if (!isRetry) {
                console.log('[Matilde][Background] Tentando reinjetar crm-content.js e reenviar...');
                crmTabId = null;
                garantirCRMTab().then(found => {
                    if (found) {
                        setTimeout(() => transmitirParaCRM(message, sendResponse, true), 300);
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
// ════════════════════════════════════════════════════════════

async function garantirCRMTab() {
    if (crmTabId) {
        try { await chrome.tabs.get(crmTabId); } catch { crmTabId = null; }
    }

    if (!crmTabId) {
        const tabs = await chrome.tabs.query({});
        const crmTab = tabs.find(t => t.url && isCRMTab(t.url));
        if (crmTab) crmTabId = crmTab.id;
    }

    if (!crmTabId) return false;

    try {
        await chrome.scripting.executeScript({ target: { tabId: crmTabId }, files: ['crm-content.js'] });
    } catch (e) {
        console.log('[Matilde][Background] Content script já injetado ou erro:', e.message);
    }

    return true;
}

// 2. INTERCEPTAR DOWNLOADS (Cidadão-MG e Detran-MG)
chrome.downloads.onCreated.addListener(async (downloadItem) => {
    const url = downloadItem.url.toLowerCase();
    const isTargetPortal = url.includes('cidadao.mg.gov.br') ||
                           url.includes('detran.mg.gov.br') ||
                           url.includes('transito.mg.gov.br');

    if (isTargetPortal && (url.includes('pdf') || downloadItem.mime === 'application/pdf')) {
        console.log('[Matilde][Background] Download de PDF detectado:', downloadItem.url);
        capturarPDFViaFetch(downloadItem.url, downloadItem.filename);
    }
});

// 3. CAPTURAR PDF EM MEMÓRIA (BLOB -> BASE64)
// BUG-02 FIX: Blob URLs (blob:https://...) created by other page contexts are NOT
// accessible from the Service Worker — fetch() will throw a network error.
// BUG-03 FIX: HTTPS PDFs from government portals fail due to CORS when fetched
// from the SW origin. Error is now surfaced to the CRM UI via storage flag.
async function capturarPDFViaFetch(pdfUrl, originalFilename) {
    // Blob URLs are scoped to the creating page context and cannot be fetched
    // cross-context from the Service Worker. Log clearly and bail out.
    if (pdfUrl.startsWith('blob:')) {
        console.warn(
            '[Matilde][Background] PDF em blob URL não pode ser capturado pelo Service Worker ' +
            '(blob URLs são restritas ao contexto da aba que as criou). URL:', pdfUrl
        );
        await chrome.storage.local.set({
            matilde_pdf_error: 'BLOB_URL_NOT_ACCESSIBLE',
            matilde_pdf_error_url: pdfUrl
        });
        return;
    }

    try {
        const response = await fetch(pdfUrl, { credentials: 'include' });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        const base64 = await blobToBase64(blob);

        const ctx = await chrome.storage.local.get(['matilde_osId', 'matilde_placa']);

        const payload = {
            fileBase64: base64,
            fileName: originalFilename || `documento_${ctx.matilde_placa || Date.now()}.pdf`,
            osId: ctx.matilde_osId || null,
            placa: ctx.matilde_placa || '',
            source: 'MATILDE_INTERCEPTOR'
        };

        enviarParaCRM(payload);
    } catch (error) {
        console.error('[Matilde][Background] Erro ao capturar PDF (possível CORS ou rede):', error);
        // Surface failure to the CRM UI so the user can be notified
        await chrome.storage.local.set({
            matilde_pdf_error: error.message || 'FETCH_ERROR',
            matilde_pdf_error_url: pdfUrl
        });
        // Attempt to notify the CRM tab of the failure
        enviarParaCRM({
            type: 'PDF_CAPTURE_ERROR',
            error: error.message || 'FETCH_ERROR',
            url: pdfUrl,
            source: 'MATILDE_INTERCEPTOR'
        });
    }
}

// BUG-01 FIX: FileReader is NOT available in Service Workers.
// Use arrayBuffer() + btoa() instead, which are available in all Worker contexts.
async function blobToBase64(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    // Process in chunks to avoid stack overflow on large PDFs
    const CHUNK = 8192;
    for (let i = 0; i < uint8.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + CHUNK));
    }
    return 'data:' + blob.type + ';base64,' + btoa(binary);
}

// 4. RECEPTOR DE MENSAGENS DOS CONTENT SCRIPTS
// REMOVIDO: listener duplicado — SAVE_DATA/SITE_ERROR já tratados no listener principal (linha 137)

// 5. ENVIAR PARA O CRM (REACT)
async function enviarParaCRM(payload) {
    if (!crmTabId) {
        const tabs = await chrome.tabs.query({});
        const crmTab = tabs.find(t => t.url && isCRMTab(t.url));
        if (crmTab) crmTabId = crmTab.id;
    }

    if (crmTabId) {
        chrome.tabs.sendMessage(crmTabId, {
            source: 'MATILDE_EXTENSION',
            type: 'PROCESS_DATA',
            payload: payload
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[Matilde][Background] Erro ao enviar para CRM:', chrome.runtime.lastError.message);
            } else {
                console.log('[Matilde][Background] Dados enviados com sucesso ao CRM!');
            }
            // Limpar contexto apenas para payloads de dados/PDF, não para mensagens
            // informativas (SITE_ERROR, PDF_CAPTURE_ERROR) que não consomem o contexto.
            const tiposSemLimpeza = ['SITE_ERROR', 'PDF_CAPTURE_ERROR'];
            if (!tiposSemLimpeza.includes(payload.type)) {
                chrome.storage.local.remove(CONTEXT_STORAGE_KEYS, () => {
                    console.log('[Matilde][Background] Contexto de consulta limpo.');
                });
            }
        });
    }
}

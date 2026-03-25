// ============================================================
//  MATILDE CRM - EXTENSÃO DETRAN/CIDADÃO MG
//  content_detran.js — Captura de Erros Brutos (v2.4)
// ============================================================

console.log('[Matilde][Content] Script de captura de erros brutos carregado.');

// BUG-09 FIX: Track last sent error text + timestamp to suppress duplicate SITE_ERROR
// messages that fire on every DOM mutation when a stale error element stays visible.
let _ultimoErroEnviado = null;
let _ultimoErroTimestamp = 0;

function capturarTextoErroBruto() {
    const seletoresErro = [
        '.alert-danger',
        '.msg-erro',
        '.error-message',
        '.ui-messages-error',
        '.v-messages__message',
        '.v-alert--error',
        '#messages',
        '.error-text',
        '.invalid-feedback'
    ];

    for (const seletor of seletoresErro) {
        const elemento = document.querySelector(seletor);
        if (elemento && elemento.offsetParent !== null && elemento.innerText.trim().length > 0) {
            const erroTexto = elemento.innerText.trim();
            console.warn('[Matilde][Content] Erro bruto detectado no site:', erroTexto);
            return erroTexto;
        }
    }

    return null;
}

function extrairDadosVeiculo() {
    const dados = {
        placa: document.querySelector("#placa")?.value || document.querySelector(".placa-resultado")?.innerText.trim(),
        chassi: document.querySelector("#chassi")?.value || document.querySelector(".chassi-resultado")?.innerText.trim(),
        proprietario: document.querySelector(".nome-proprietario")?.innerText.trim(),
        situacao: document.querySelector(".situacao-veiculo")?.innerText.trim(),
        data_consulta: new Date().toISOString()
    };

    if (dados.placa || dados.chassi) return dados;
    return null;
}

function enviarParaBackground(tipo, payload) {
    // BUG-07 FIX: If the extension is reloaded or updated while this page is open,
    // chrome.runtime becomes invalid and sendMessage throws "Extension context invalidated".
    // Without try/catch this unhandled exception crashes the MutationObserver callback,
    // disabling all further capture on the page until it is reloaded.
    try {
        chrome.runtime.sendMessage({
            action: 'SAVE_DATA',
            payload: {
                type: tipo,
                data: payload
            }
        });
    } catch (e) {
        console.warn('[Matilde][Content] Extensão desconectada. Recarregue a aba para reconectar.', e.message);
    }
}

function processarPagina() {
    const erroBruto = capturarTextoErroBruto();
    if (erroBruto) {
        // BUG-09 FIX: Deduplicate SITE_ERROR messages. If the same error text was sent
        // less than 5 seconds ago, skip — avoids spam when a stale error element remains
        // in the DOM and triggers on every MutationObserver callback.
        const agora = Date.now();
        if (erroBruto === _ultimoErroEnviado && (agora - _ultimoErroTimestamp) < 5000) {
            return;
        }
        _ultimoErroEnviado = erroBruto;
        _ultimoErroTimestamp = agora;
        enviarParaBackground('SITE_ERROR', { message: erroBruto });
        return;
    }

    const dados = extrairDadosVeiculo();
    if (dados) {
        enviarParaBackground('VEHICLE_DATA', dados);
    } else {
        // BUG-11 FIX: Log when all selectors miss so failures are visible during debugging.
        console.log('[Matilde][Content] Nenhum dado de veículo encontrado na página.');
    }
}

// BUG-08 FIX: Guard against injection after page already loaded — `load` event would
// never fire in that case (e.g. SPA navigation or document_idle injection timing).
if (document.readyState === 'loading') {
    window.addEventListener("load", () => setTimeout(processarPagina, 1500));
} else {
    setTimeout(processarPagina, 1500);
}

// BUG-10 FIX: Use a module-scoped variable instead of window.matildeTimeout to
// avoid colliding with globals on the host page.
let matildeDebounceTimer = null;

const observer = new MutationObserver(() => {
    clearTimeout(matildeDebounceTimer);
    matildeDebounceTimer = setTimeout(processarPagina, 1000);
});

observer.observe(document.body, { childList: true, subtree: true });

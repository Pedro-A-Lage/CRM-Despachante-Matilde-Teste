// ============================================================
//  MATILDE CRM - EXTENSÃO DETRAN/CIDADÃO MG
//  crm_bridge.js — Ponte entre Extensão e React CRM
// ============================================================

console.log('[Matilde][Bridge] Ponte entre Extensão e CRM carregada.');

// BUG-13 FIX: If the extension is invalidated (reloaded/updated while this page is open),
// chrome.runtime.id becomes undefined and any chrome.* call will throw. Guard against
// adding a dead listener and dispatch a page event so the React app can warn the user.
if (!chrome.runtime?.id) {
    console.warn('[Matilde][Bridge] Extensão inválida ou desconectada. Recarregue a página.');
    window.dispatchEvent(new CustomEvent('MATILDE_EXTENSION_DISCONNECTED'));
} else {

// 1. RECEPTOR DE MENSAGENS DA EXTENSÃO
try {
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.source === 'MATILDE_EXTENSION') {
        console.log('[Matilde][Bridge] Mensagem recebida da extensão:', message.type);

        const event = new CustomEvent('MATILDE_DATA_RECEIVED', {
            detail: {
                type: message.type,
                payload: message.payload
            }
        });
        window.dispatchEvent(event);

        sendResponse({ success: true, message: 'Dados recebidos pelo CRM' });
    }
    return true;
});
} catch (e) {
    console.warn('[Matilde][Bridge] Falha ao registrar listener — extensão possivelmente inválida:', e.message);
    window.dispatchEvent(new CustomEvent('MATILDE_EXTENSION_DISCONNECTED'));
}

// 2. ENVIAR CONTEXTO DO CRM PARA A EXTENSÃO
// BUG-12 FIX: Any script on the page (third-party, injected, or malicious) can dispatch
// a fake MATILDE_SEND_CONTEXT event. Without validation, arbitrary osId/placa values
// are saved to chrome.storage and subsequently used to tag captured PDFs.
// Validate format before accepting.
window.addEventListener('MATILDE_SEND_CONTEXT', (event) => {
    const { osId, placa } = (event.detail && typeof event.detail === 'object') ? event.detail : {};

    // osId: non-empty string, max 100 chars (UUID or numeric ID)
    const osIdValido = typeof osId === 'string' && osId.trim().length > 0 && osId.trim().length <= 100;
    // placa: Brazilian plate — old format ABC1234 or Mercosul ABC1D23
    const placaValida = typeof placa === 'string' &&
        /^[A-Za-z]{3}[\dA-Za-z][\dA-Za-z]{2}\d$|^[A-Za-z]{3}\d{4}$/.test(placa.trim());

    if (!osIdValido || !placaValida) {
        console.warn('[Matilde][Bridge] Contexto rejeitado — dados inválidos ou malformados:', { osId, placa });
        return;
    }

    const osIdSanitizado = osId.trim();
    const placaSanitizada = placa.trim().toUpperCase();

    chrome.storage.local.set({
        matilde_osId: osIdSanitizado,
        matilde_placa: placaSanitizada
    }, () => {
        console.log('[Matilde][Bridge] Contexto salvo na extensão:', { osId: osIdSanitizado, placa: placaSanitizada });
    });
});

} // end else (chrome.runtime?.id valid)

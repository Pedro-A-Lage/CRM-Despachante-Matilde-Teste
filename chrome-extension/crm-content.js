// crm-content.js - Injetado no Matilde CRM (localhost / producao) para fazer a ponte
// entre a extensão do Chrome e o código React da aplicação.

// BUG-NEW-04 FIX: Evita duplicação com crm_bridge.js (injetado via manifest)
if (window.__matildeBridgeLoaded) {
    console.log("Matilde CRM: Bridge já carregado (crm_bridge.js), ignorando crm-content.js");
    // Ainda mantém o listener de DEFINIR_SERVICO abaixo, pois crm_bridge.js pode não ter
} else {
    console.log("Matilde CRM: Ponte de conexão com a extensão ativada!");
}

// Ouve mensagens vindo do background.js da extensão
// BUG-NEW-04 FIX: Só registra listener se crm_bridge.js não estiver ativo
if (!window.__matildeBridgeLoaded) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("CRM App (Ponte) recebeu mensagem do Background:", message);

        if (message.source === "MATILDE_EXTENSION") {
            console.log("CRM App (Ponte): Encaminhando mensagem para o React:", message.type);
            window.postMessage({
                source: "MATILDE_EXTENSION",
                type: message.type,
                payload: message.payload
            }, "*");

            sendResponse({ success: true, deliveredToWindow: true });
        }
    });
    window.__matildeBridgeLoaded = true;
}

// Ouve mensagens vindas do React (App.tsx) querendo responder para a extensão
window.addEventListener("message", (event) => {
    // Processa quando ServicosDetran.tsx abre um serviço Detran
    if (event.data && event.data.source === 'MATILDE_CRM_PAGE' && event.data.action === 'DEFINIR_SERVICO') {
        chrome.runtime.sendMessage({
            action: 'DEFINIR_SERVICO',
            payload: { servico: event.data.servico },
        }, (resp) => {
            if (chrome.runtime.lastError) {
                console.error('[Matilde][CRM] Erro ao definir serviço:', chrome.runtime.lastError.message);
            } else {
                console.log('[Matilde][CRM] Serviço definido:', event.data.servico, resp);
            }
        });
        return;
    }

    // Nós só queremos ouvir as respostas do sucesso
    if (event.data && event.data.source === 'MATILDE_CRM' && event.data.status === 'SUCCESS') {
        console.log("CRM App (Ponte): O React processou o arquivo com sucesso!");
    }
});

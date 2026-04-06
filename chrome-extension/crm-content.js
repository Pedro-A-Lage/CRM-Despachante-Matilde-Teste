// crm-content.js - Injetado no Matilde CRM (localhost / producao) para fazer a ponte
// entre a extensão do Chrome e o código React da aplicação.

console.log("Matilde CRM: Ponte de conexão com a extensão ativada!");

// Ouve mensagens vindo do background.js da extensão
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("CRM App (Ponte) recebeu mensagem do Background:", message);

    if (message.source === "MATILDE_EXTENSION") {
        console.log("CRM App (Ponte): Encaminhando mensagem para o React:", message.type);
        // Encaminha a mensagem para o contexto da página React (App.tsx)
        window.postMessage({
            source: "MATILDE_EXTENSION",
            type: message.type,
            payload: message.payload
        }, "*");

        sendResponse({ success: true, deliveredToWindow: true });
    }
});

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

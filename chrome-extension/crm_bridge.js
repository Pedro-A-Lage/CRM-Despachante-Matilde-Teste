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

        window.postMessage({
            source: 'MATILDE_EXTENSION',
            type: message.type,
            payload: message.payload
        }, '*');

        sendResponse({ success: true, message: 'Dados recebidos pelo CRM' });
    }
    return true;
});
} catch (e) {
    console.warn('[Matilde][Bridge] Falha ao registrar listener — extensão possivelmente inválida:', e.message);
    window.dispatchEvent(new CustomEvent('MATILDE_EXTENSION_DISCONNECTED'));
}

// 2. RECEPTOR DE DADOS PARA PREENCHIMENTO DO DETRAN
// Quando o usuário clica "Ir ao Detran e Preencher" no modal do CRM,
// o React dispara MATILDE_PREENCHER_DETRAN com todos os dados do formulário.
// Salvamos no chrome.storage.local para que o content_detran.js leia ao carregar o site.
// UNIFICADO: um único listener roteia por servico (transferencia vs segunda_via).
window.addEventListener('MATILDE_PREENCHER_DETRAN', (event) => {
    const dados = (event.detail && typeof event.detail === 'object') ? event.detail : {};
    const sanitizar = (val) => (typeof val === 'string' ? val.trim() : '');

    if (dados.servico === 'segunda_via') {
        // ── 2ª Via do CRV ──
        const dadosSegundaVia = {
            servico: 'segunda_via',
            placa: sanitizar(dados.placa).toUpperCase(),
            chassi: sanitizar(dados.chassi).toUpperCase(),
            renavam: sanitizar(dados.renavam),
            nomeProprietario: sanitizar(dados.nomeProprietario).toUpperCase(),
            cpfCnpjProprietario: sanitizar(dados.cpfCnpjProprietario),
            tipoCpfCnpj: sanitizar(dados.tipoCpfCnpj),
            cep: sanitizar(dados.cep),
            endereco: sanitizar(dados.endereco),
            numero: sanitizar(dados.numero),
            bairro: sanitizar(dados.bairro),
            municipio: sanitizar(dados.municipio).toUpperCase(),
            uf: sanitizar(dados.uf).toUpperCase(),
            timestamp: Date.now(),
        };
        try {
            chrome.storage.local.set({ matilde_dados_segunda_via: dadosSegundaVia }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('[Matilde][Bridge] Erro ao salvar dados 2ª Via:', chrome.runtime.lastError.message);
                    return;
                }
                console.log('[Matilde][Bridge] Dados para 2ª Via do CRV salvos:', dadosSegundaVia);
            });
        } catch (e) {
            console.warn('[Matilde][Bridge] chrome.storage indisponível:', e.message);
        }
    } else {
        // ── Transferência / outros serviços ──
        const placaValida = typeof dados.placa === 'string' && dados.placa.trim().length >= 7;
        const chassiValido = typeof dados.chassi === 'string' && dados.chassi.trim().length >= 5;
        if (!placaValida || !chassiValido) {
            console.warn('[Matilde][Bridge] Dados para preenchimento rejeitados — placa ou chassi inválidos:', dados);
            return;
        }

        const dadosFormulario = {
            placa: sanitizar(dados.placa).toUpperCase(),
            chassi: sanitizar(dados.chassi).toUpperCase(),
            renavam: sanitizar(dados.renavam),
            cpfCnpj: sanitizar(dados.cpfCnpj),
            tipoCpfCnpj: sanitizar(dados.tipoCpfCnpj),
            nomeAdquirente: sanitizar(dados.nomeAdquirente).toUpperCase(),
            docIdentidade: sanitizar(dados.docIdentidade),
            orgaoExpedidor: sanitizar(dados.orgaoExpedidor).toUpperCase(),
            ufExpedidor: sanitizar(dados.ufExpedidor).toUpperCase(),
            valorRecibo: sanitizar(dados.valorRecibo),
            dataAquisicao: sanitizar(dados.dataAquisicao),
            numeroCRV: sanitizar(dados.numeroCRV),
            codigoSegurancaCRV: sanitizar(dados.codigoSegurancaCRV),
            marcaModelo: sanitizar(dados.marcaModelo),
            cor: sanitizar(dados.cor),
            anoFabricacao: sanitizar(dados.anoFabricacao),
            anoModelo: sanitizar(dados.anoModelo),
            cep: sanitizar(dados.cep),
            endereco: sanitizar(dados.endereco),
            numero: sanitizar(dados.numero),
            bairro: sanitizar(dados.bairro),
            municipioAdquirente: sanitizar(dados.municipioAdquirente).toUpperCase(),
            nomeVendedor: sanitizar(dados.nomeVendedor).toUpperCase(),
            cpfCnpjVendedor: sanitizar(dados.cpfCnpjVendedor),
            tipoCpfCnpjVendedor: sanitizar(dados.tipoCpfCnpjVendedor),
            ufOrigem: sanitizar(dados.ufOrigem).toUpperCase(),
            timestamp: Date.now()
        };

        try {
            chrome.storage.local.set({ matilde_dados_detran: dadosFormulario }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('[Matilde][Bridge] Erro ao salvar no storage:', chrome.runtime.lastError.message);
                    return;
                }
                console.log('[Matilde][Bridge] Dados para preenchimento do Detran salvos:', dadosFormulario);
            });
        } catch (e) {
            console.warn('[Matilde][Bridge] chrome.storage indisponível:', e.message);
        }
    }
});

// 3. ENVIAR CONTEXTO DO CRM PARA A EXTENSÃO
// BUG-12 FIX: Any script on the page (third-party, injected, or malicious) can dispatch
// a fake MATILDE_SEND_CONTEXT event. Without validation, arbitrary osId/placa values
// are saved to chrome.storage and subsequently used to tag captured PDFs.
// Validate format before accepting.
console.log('[Matilde][Bridge] Listener MATILDE_SEND_CONTEXT registrado.');
window.addEventListener('MATILDE_SEND_CONTEXT', (event) => {
    console.log('[Matilde][Bridge] MATILDE_SEND_CONTEXT recebido!', event.detail);
    const { osId, placa } = (event.detail && typeof event.detail === 'object') ? event.detail : {};

    // osId: non-empty string, max 100 chars (UUID or numeric ID)
    const osIdValido = typeof osId === 'string' && osId.trim().length > 0 && osId.trim().length <= 100;
    // placa: Brazilian plate — old format ABC1234 or Mercosul ABC1D23
    const placaValida = typeof placa === 'string' &&
        /^[A-Za-z]{3}[\dA-Za-z][\dA-Za-z]{2}\d$|^[A-Za-z]{3}\d{4}$/.test(placa.trim());

    if (!osIdValido) {
        console.warn('[Matilde][Bridge] Contexto rejeitado — osId inválido:', { osId, placa });
        return;
    }

    const dados = { matilde_osId: osId.trim() };

    if (placaValida) {
        dados.matilde_placa = placa.trim().toUpperCase();
    } else {
        console.warn('[Matilde][Bridge] Placa inválida ignorada, osId salvo mesmo assim:', { placa });
    }

    chrome.storage.local.set(dados, () => {
        if (chrome.runtime.lastError) {
            console.error('[Matilde][Bridge] ERRO ao salvar no storage:', chrome.runtime.lastError.message);
        } else {
            console.log('[Matilde][Bridge] Contexto salvo com sucesso:', dados);
        }
    });
});

// 3b. ENVIAR CONTEXTO EXTRA (chassi, cpfCnpj, nome, servico)
// BUG-12 aplicado: validar tamanho máximo para evitar injeção via eventos falsos.
window.addEventListener('MATILDE_SEND_CONTEXT_EXTRA', (event) => {
    const dados = (event.detail && typeof event.detail === 'object') ? event.detail : {};
    const sanitizar = (val) => (typeof val === 'string' ? val.trim().slice(0, 200) : '');

    const extra = {};
    if (dados.chassi) extra.matilde_chassi = sanitizar(dados.chassi).toUpperCase();
    if (dados.cpfCnpj) extra.matilde_cpfCnpj = sanitizar(dados.cpfCnpj);
    if (dados.nome) extra.matilde_nome = sanitizar(dados.nome).toUpperCase();
    if (dados.servico) extra.matilde_servico_ativo = sanitizar(dados.servico);

    if (Object.keys(extra).length > 0) {
        chrome.storage.local.set(extra, () => {
            console.log('[Matilde][Bridge] Contexto extra salvo:', extra);
        });
    }
});

// 4. RECEPTOR DE MENSAGENS DO CRM (window.postMessage → background)
// App.tsx envia mensagens de controle (ex: CLEANUP_PRIMEIRO_EMPLACAMENTO) via postMessage.
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.source !== 'MATILDE_CRM') return;

    const action = typeof data.action === 'string' ? data.action : '';
    if (!action) return;

    if (!chrome.runtime?.id) {
        console.warn('[Matilde][Bridge] Contexto da extensão inválido — recarregue a página do CRM.');
        window.postMessage({ source: 'MATILDE_EXTENSION', type: 'EXTENSION_DISCONNECTED', payload: {} }, '*');
        return;
    }
    try {
        chrome.runtime.sendMessage({ action, payload: data.payload || {} }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[Matilde][Bridge] Erro ao encaminhar ação CRM ao background:', chrome.runtime.lastError.message);
            } else {
                console.log('[Matilde][Bridge] Ação CRM encaminhada ao background:', action, response);
            }
        });
    } catch (e) {
        console.warn('[Matilde][Bridge] Falha ao encaminhar ação CRM:', e.message);
        window.postMessage({ source: 'MATILDE_EXTENSION', type: 'EXTENSION_DISCONNECTED', payload: {} }, '*');
    }
});

} // end else (chrome.runtime?.id valid)

// ============================================================
//  MATILDE CRM - EXTENSÃO DETRAN/CIDADÃO MG
//  content_detran.js — Captura de Erros Brutos (v2.4)
// ============================================================

console.log('[Matilde][Content] Script de captura de erros brutos + preenchimento automático carregado.');

// ════════════════════════════════════════════════════════════
// BADGE DE CONEXÃO — aparece em todas as páginas do Detran
// ════════════════════════════════════════════════════════════
(async () => {
    const SERVICO_LABELS = {
        'primeiro_emplacamento': '1º Emplacamento',
        'transferencia': 'Transferência',
        'alteracao_dados': 'Alteração de Dados',
    };

    const ctx = await new Promise(resolve =>
        chrome.storage.local.get(['matilde_servico_ativo'], resolve)
    );
    const servico = ctx.matilde_servico_ativo;
    const label = SERVICO_LABELS[servico] || null;

    const badge = document.createElement('div');
    badge.id = 'matilde-conexao-badge';
    badge.style.cssText = `
        position: fixed; top: 12px; right: 12px; z-index: 999999;
        display: flex; align-items: center; gap: 8px;
        padding: 8px 14px; border-radius: 999px;
        background: ${label ? '#7c3aed' : '#1e293b'};
        color: #fff; font-size: 12px; font-weight: 700;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        pointer-events: none; user-select: none;
        transition: background 0.3s;
    `;
    badge.innerHTML = `
        <span style="width:8px;height:8px;border-radius:50%;background:${label ? '#a78bfa' : '#94a3b8'};display:inline-block;flex-shrink:0;"></span>
        <span>Matilde conectada${label ? ` · ${label}` : ''}</span>
    `;

    // Só mostra o badge na primeira página do fluxo (não em confirmar-dados, emitir-ficha, etc.)
    const url = window.location.href;
    const isPaginaInicial = !url.includes('confirmar-dados') && !url.includes('emitir-ficha') && !url.includes('completar-dados');
    if (!isPaginaInicial) return;

    const inject = () => {
        if (!document.getElementById('matilde-conexao-badge')) {
            document.body.appendChild(badge);
            // Remove automaticamente após 5 segundos
            setTimeout(() => badge.remove(), 5000);
        }
    };

    if (document.body) inject();
    else window.addEventListener('DOMContentLoaded', inject);
})();

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
    // Não processar erros em páginas de primeiro emplacamento — falsos positivos
    if (window.location.href.includes('emplacamento')) return;

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

// Controle para não enviar o mesmo PDF duas vezes
let _daeCapturado = false;

async function tentarCapturarDecalque() {
    // Só atua em transferência e alteração de dados
    const ctx = await new Promise(resolve =>
        chrome.storage.local.get(['matilde_servico_ativo', 'matilde_placa', 'matilde_chassi'], resolve)
    );

    const servicosElegiveis = ['transferencia', 'alteracao_dados', 'mudanca_caracteristica', 'baixa'];
    if (!servicosElegiveis.includes(ctx.matilde_servico_ativo)) return;

    const linkPdf = document.getElementById('link-pdf-dae');
    if (!linkPdf) {
        // Diagnóstico: ajuda a descobrir se 'mudanca_caracteristica' / 'baixa' usam outro elemento
        if (ctx.matilde_servico_ativo === 'mudanca_caracteristica' || ctx.matilde_servico_ativo === 'baixa') {
            const candidatos = document.querySelectorAll('a[href^="data:application/pdf;base64,"]');
            if (candidatos.length > 0) {
                console.warn(
                    '[Matilde][Content] #link-pdf-dae não encontrado para',
                    ctx.matilde_servico_ativo,
                    '— porém existem',
                    candidatos.length,
                    'link(s) PDF base64 nesta página. IDs:',
                    Array.from(candidatos).map(a => a.id || '(sem id)').join(', ')
                );
            }
        }
        return;
    }

    const href = linkPdf.getAttribute('href') || '';
    if (!href.startsWith('data:application/pdf;base64,')) return;

    if (_daeCapturado) {
        console.log('[Matilde][Content] Decalque já capturado, ignorando.');
        return;
    }

    _daeCapturado = true;
    console.log('[Matilde][Content] Modal Decalque/DAE detectado. Capturando PDF...');

    chrome.runtime.sendMessage({
        action: 'CAPTURE_DAE_PDF',
        payload: {
            base64: href,
            placa: ctx.matilde_placa || '',
            chassi: ctx.matilde_chassi || '',
            servicoAtivo: ctx.matilde_servico_ativo,
        }
    }, (resp) => {
        if (chrome.runtime.lastError) {
            console.error('[Matilde][Content] Erro ao enviar Decalque:', chrome.runtime.lastError.message);
            _daeCapturado = false; // permite retry
        } else {
            console.log('[Matilde][Content] Decalque enviado ao background:', resp);
        }
    });
}

// Reset quando o modal do DAE fechar (botão .fechar-modal-atual)
document.addEventListener('click', (e) => {
    const target = e.target;
    if (target && (target.closest?.('.fechar-modal-atual') || target.closest?.('.modal-backdrop'))) {
        _daeCapturado = false;
        console.log('[Matilde][Content] Modal fechado, reset _daeCapturado.');
    }
});

const observer = new MutationObserver(() => {
    clearTimeout(matildeDebounceTimer);
    matildeDebounceTimer = setTimeout(processarPagina, 1000);
    // Detecta modal de Decalque/DAE
    tentarCapturarDecalque();
});

observer.observe(document.body, { childList: true, subtree: true });

// ============================================================
//  PREENCHIMENTO AUTOMÁTICO DO FORMULÁRIO DE TRANSFERÊNCIA
//  Lê dados salvos no chrome.storage.local pelo crm_bridge.js
// ============================================================

/**
 * Preenche um campo de input simulando digitação real.
 * Dispara eventos input/change para frameworks reativos (Angular/Vue/React).
 */
function preencherCampo(campo, valor) {
    if (!campo || !valor) return false;

    // Foca no campo
    campo.focus();
    campo.click();

    // Limpa o valor atual
    campo.value = '';

    // Define o novo valor
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
    )?.set;

    if (nativeInputValueSetter) {
        nativeInputValueSetter.call(campo, valor);
    } else {
        campo.value = valor;
    }

    // Dispara eventos para que o framework detecte a mudança
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    campo.dispatchEvent(new Event('blur', { bubbles: true }));

    console.log(`[Matilde][AutoFill] Campo preenchido: ${campo.name || campo.id || campo.placeholder || '?'} = ${valor}`);
    return true;
}

/**
 * Seleciona uma opção em um <select> pelo valor.
 */
function selecionarOpcao(select, valor) {
    if (!select || !valor) return false;

    select.focus();
    select.value = valor;
    select.dispatchEvent(new Event('change', { bubbles: true }));

    console.log(`[Matilde][AutoFill] Select alterado: ${select.name || select.id || '?'} = ${valor}`);
    return true;
}

/**
 * Busca campo por múltiplas estratégias: name, id, placeholder, label text.
 */
function buscarCampo(seletores) {
    for (const seletor of seletores) {
        const el = document.querySelector(seletor);
        if (el) return el;
    }
    return null;
}

/**
 * Seleciona uma opção em um <select> buscando pelo TEXTO visível (case-insensitive, sem acentos).
 * Útil para selects com valores numéricos como #codigo-municipio-emplacamento.
 */
function selecionarOpcaoPorTexto(select, texto) {
    if (!select || !texto) return false;
    const norm = t => t.toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const alvo = norm(texto);
    for (const opt of select.options) {
        if (norm(opt.text) === alvo) {
            select.focus();
            select.value = opt.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`[Matilde][AutoFill] Select por texto: ${select.id || select.name} = "${opt.text}" (${opt.value})`);
            return true;
        }
    }
    // Fallback: busca parcial (começa com)
    for (const opt of select.options) {
        if (norm(opt.text).startsWith(alvo)) {
            select.focus();
            select.value = opt.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`[Matilde][AutoFill] Select parcial: ${select.id || select.name} = "${opt.text}" (${opt.value})`);
            return true;
        }
    }
    return false;
}

/**
 * Detecta se estamos na Página 1 ou Página 2 do formulário de transferência.
 * Página 1 (URL /index/2): Placa, Chassi, Tipo Doc, CPF/CNPJ (4 campos)
 * Página 2 (URL /completar-dados/2): Renavam, Valor, Data, CRV, Nome, CPF, RG etc.
 */
function detectarPaginaTransferencia() {
    const url = window.location.href.toLowerCase();

    // Só atua em páginas de transferência
    if (!url.includes('transferencia') && !url.includes('transferir-propriedade')) {
        return null;
    }

    // Página 2: URL contém "completar-dados" OU tem campo Renavam
    if (url.includes('completar-dados') || document.getElementById('renavam')) {
        return 2;
    }

    // Página 1: URL contém "index/2" OU tem campo Placa sem Renavam
    if (url.includes('index/2') || document.getElementById('placa')) {
        return 1;
    }

    return null;
}

/**
 * Preenche os campos da Página 1 do formulário de transferência.
 * IDs reais mapeados do site do Detran MG:
 *   input#placa, input#chassi,
 *   select#tipo-documento-proprietario (1=CPF, 2=CNPJ),
 *   input#cpf-cnpj-proprietario
 */
function preencherPagina1(dados) {
    console.log('[Matilde][AutoFill] Preenchendo Página 1 da transferência...');
    let preenchidos = 0;

    // Placa
    const campoPlaca = document.getElementById('placa');
    if (preencherCampo(campoPlaca, dados.placa)) preenchidos++;

    // Chassi
    const campoChassi = document.getElementById('chassi');
    if (preencherCampo(campoChassi, dados.chassi)) preenchidos++;

    // Tipo Documento (select): CPF = "1", CNPJ = "2"
    const selectTipoDoc = document.getElementById('tipo-documento-proprietario');
    if (selectTipoDoc) {
        const valorTipo = (dados.tipoCpfCnpj || '').toLowerCase() === 'cnpj' ? '2' : '1';
        if (selecionarOpcao(selectTipoDoc, valorTipo)) preenchidos++;
    }

    // CPF/CNPJ
    const campoCpfCnpj = document.getElementById('cpf-cnpj-proprietario');
    if (preencherCampo(campoCpfCnpj, dados.cpfCnpj)) preenchidos++;

    console.log(`[Matilde][AutoFill] Página 1: ${preenchidos} campos preenchidos.`);
    return preenchidos;
}

/**
 * Preenche os campos da Página 2 — completar-dados/2 — do formulário de transferência.
 * IDs mapeados do HTML real do Detran MG.
 */
async function preencherPagina2(dados) {
    console.log('[Matilde][AutoFill] Preenchendo Página 2 da transferência...');
    let preenchidos = 0;
    const naoPreenchidos = [];

    const tentar = (nomeCampo, seletores, valor) => {
        if (!valor) return;
        const el = buscarCampo(seletores);
        if (el && !el.readOnly && !el.disabled) {
            if (preencherCampo(el, valor)) { preenchidos++; return; }
        }
        naoPreenchidos.push(nomeCampo);
    };

    const tentarSelect = (nomeCampo, seletores, valor) => {
        if (!valor) return;
        const el = buscarCampo(seletores);
        if (el) {
            if (selecionarOpcao(el, valor)) { preenchidos++; return; }
        }
        naoPreenchidos.push(nomeCampo);
    };

    const tentarSelectTexto = (nomeCampo, seletores, texto) => {
        if (!texto) return;
        const el = buscarCampo(seletores);
        if (el) {
            if (selecionarOpcaoPorTexto(el, texto)) { preenchidos++; return; }
        }
        naoPreenchidos.push(nomeCampo);
    };

    // ── DADOS DO VEÍCULO ─────────────────────────────────────────────
    // placa e chassi já vêm readonly da pág 1 — não tentar preencher
    // Converter data YYYY-MM-DD → DD/MM/YYYY se necessário
    const dataFormatada = (() => {
        const d = dados.dataAquisicao || '';
        const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
    })();

    tentar('Renavam',          ['#renavam'],       dados.renavam);
    tentar('Valor do Recibo',  ['#valor-recibo'],  dados.valorRecibo);
    tentar('Data de Aquisição',['#data-aquisicao'],dataFormatada);
    tentar('Nº CRV',           ['#numero-crv'],    dados.numeroCRV);

    // UF de Origem: select com value = sigla (MG, SP, etc.)
    tentarSelect('UF de Origem', ['#sigla-uf-origem'], dados.ufOrigem);

    // ── DADOS DO ADQUIRENTE ──────────────────────────────────────────
    // tipo-documento-proprietario e cpf-cnpj-proprietario já vêm readonly da pág 1
    tentar('Nome do Adquirente', ['#nome-proprietario'], dados.nomeAdquirente);

    // RG e órgão expedidor — preenchidos manualmente pelo usuário no CRM
    tentar('Nº Identidade',   ['#numero-documento-identificacao'], dados.docIdentidade);
    tentar('Órgão Expedidor', ['#orgao-expedidor-identificacao'],  dados.orgaoExpedidor);
    tentarSelect('UF Órgão Expedidor', ['#sigla-uf-orgao-expedidor'], dados.ufExpedidor);

    // Município de emplacamento: select com value numérico — busca por texto
    tentarSelectTexto('Município de Emplacamento', ['#codigo-municipio-emplacamento'], dados.municipioAdquirente);

    // ── ENDEREÇO DO ADQUIRENTE ────────────────────────────────────────
    const campoCep = document.getElementById('ResidencialCep');
    if (campoCep && dados.cep) {
        const cepLimpo = dados.cep.replace(/\D/g, '').slice(0, 8);
        preencherCampo(campoCep, cepLimpo);
        preenchidos++;
        // Clica "Consultar" para o Detran buscar logradouro via CEP
        const btnConsultar = document.getElementById('BtnConsultarResidencial');
        if (btnConsultar) {
            btnConsultar.click();
            console.log('[Matilde][AutoFill] CEP consultado. Aguardando resposta...');
            await new Promise(r => setTimeout(r, 2500));
        }
        // Número e bairro: Detran não preenche via CEP
        tentar('Número', ['#ResidencialNumero'], dados.numero);
        tentar('Bairro', ['#ResidencialBairro'], dados.bairro);
        // Logradouro: só sobrescreve se o Detran não preencheu
        const campoEnd = document.getElementById('ResidencialEndereco');
        if (campoEnd && !campoEnd.value && dados.endereco) {
            if (preencherCampo(campoEnd, dados.endereco)) preenchidos++;
        }
    } else if (dados.cep) {
        naoPreenchidos.push('CEP');
    }

    // Endereço de correspondência = Sim (igual ao residencial)
    tentarSelect('End. Correspondência', ['#endereco-igual-residencia'], '1');

    // ── PROPRIETÁRIO ANTERIOR (VENDEDOR) ─────────────────────────────
    const tipoVend = (dados.tipoCpfCnpjVendedor || '').toLowerCase() === 'cnpj' ? '2' : '1';
    tentarSelect('Tipo Doc Vendedor', ['#tipo-documento-proprietario-anterior'], tipoVend);
    // Campo id="cpf-cnpj" com name="cpf_cnpj_proprietario_anterior"
    tentar('CPF/CNPJ Vendedor', ['#cpf-cnpj'], dados.cpfCnpjVendedor);

    // ── MOTIVO JUDICIAL E FINANCIAMENTO (defaults) ────────────────────
    tentarSelect('Motivo Judicial',    ['#codigo-motivo-judicial'],     '000');
    tentarSelect('Modalidade Financ.', ['#codigo-restricao-financeira'], '00');

    if (naoPreenchidos.length > 0) {
        console.warn('[Matilde][AutoFill] Campos não encontrados na pág 2:', naoPreenchidos.join(', '));
    }
    console.log(`[Matilde][AutoFill] Página 2: ${preenchidos} campos preenchidos.`);
    return { preenchidos, naoPreenchidos };
}

/**
 * Função principal: verifica se há dados pendentes e preenche o formulário.
 */
let _preenchimentoEmAndamento = false;
let _pag1Preenchida = false; // evita loop: página 1 só preenche uma vez

async function tentarPreenchimentoAutomatico() {
    if (_preenchimentoEmAndamento) return;
    _preenchimentoEmAndamento = true;
    try {
        // Converte callback para Promise para poder usar await dentro
        const result = await new Promise(resolve =>
            chrome.storage.local.get('matilde_dados_detran', resolve)
        );

        const dados = result?.matilde_dados_detran;
        if (!dados) {
            console.log('[Matilde][AutoFill] Nenhum dado de preenchimento encontrado.');
            return;
        }

        // Verifica se os dados não são muito antigos (máx 30 min)
        const idadeMs = Date.now() - (dados.timestamp || 0);
        if (idadeMs > 30 * 60 * 1000) {
            console.log('[Matilde][AutoFill] Dados expirados (>30min). Ignorando.');
            chrome.storage.local.remove('matilde_dados_detran');
            return;
        }

        const pagina = detectarPaginaTransferencia();
        if (!pagina) {
            console.log('[Matilde][AutoFill] Não é uma página de transferência. Ignorando preenchimento.');
            return;
        }

        console.log(`[Matilde][AutoFill] Página ${pagina} detectada. Iniciando preenchimento...`);

        let preenchidos = 0;
        let naoPreenchidos = [];

        if (pagina === 1) {
            if (_pag1Preenchida) return; // já preencheu, não repetir
            preenchidos = preencherPagina1(dados);
            if (preenchidos > 0) _pag1Preenchida = true;
        } else if (pagina === 2) {
            _pag1Preenchida = false; // reset para próxima vez
            const resultado = await preencherPagina2(dados);
            preenchidos = resultado.preenchidos;
            naoPreenchidos = resultado.naoPreenchidos;
        }

        if (preenchidos > 0) {
            mostrarNotificacaoPreenchimento(preenchidos, pagina, naoPreenchidos);
        }

        // NÃO remove após pág 1 — precisa dos dados na pág 2 também
        if (pagina === 2) {
            // Remove dados do storage e para o observer — página 2 concluída
            chrome.storage.local.remove('matilde_dados_detran', () => {
                console.log('[Matilde][AutoFill] Dados consumidos e removidos do storage.');
            });
            // Para o MutationObserver para não tentar preencher novamente
            observerAutoFill.disconnect();
            console.log('[Matilde][AutoFill] Observer desconectado após preencher pág 2.');
        }
    } catch (e) {
        console.warn('[Matilde][AutoFill] Erro ao tentar preenchimento:', e.message);
    } finally {
        _preenchimentoEmAndamento = false;
    }
}

/**
 * Mostra uma notificação visual indicando quantos campos foram preenchidos
 * e quais ficaram pendentes (não encontrados na página).
 */
function mostrarNotificacaoPreenchimento(qtd, pagina, naoPreenchidos = []) {
    const existente = document.getElementById('matilde-autofill-toast');
    if (existente) existente.remove();

    const temPendentes = naoPreenchidos.length > 0;
    const cor = temPendentes
        ? 'linear-gradient(135deg, #f59e0b, #d97706)'   // amarelo se há pendentes
        : 'linear-gradient(135deg, #10b981, #059669)';  // verde se tudo ok

    const div = document.createElement('div');
    div.id = 'matilde-autofill-toast';
    div.style.cssText = `
        position: fixed; top: 16px; right: 16px; z-index: 99999;
        background: ${cor};
        color: white; padding: 14px 20px; border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px; font-weight: 600; max-width: 340px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        display: flex; flex-direction: column; gap: 6px;
        animation: matilde-slide-in 0.4s ease-out;
        cursor: pointer;
    `;

    const pendentesHtml = temPendentes
        ? `<div style="font-size:12px;font-weight:400;opacity:0.92;margin-top:2px">
               ⚠️ Preencha manualmente: ${naoPreenchidos.join(', ')}
           </div>`
        : '';

    div.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:20px">${temPendentes ? '⚠️' : '✅'}</span>
            <span>Matilde preencheu ${qtd} campo${qtd > 1 ? 's' : ''} (Pág. ${pagina})</span>
        </div>
        ${pendentesHtml}
    `;
    div.onclick = () => div.remove();

    const style = document.createElement('style');
    style.textContent = `
        @keyframes matilde-slide-in {
            from { transform: translateX(120px); opacity: 0; }
            to   { transform: translateX(0);     opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(div);

    // Remove após 8 segundos (mais tempo se há pendentes)
    setTimeout(() => div?.remove(), temPendentes ? 10000 : 6000);
}

// ════════════════════════════════════════════════════════════
// 2ª VIA DO CRV — Preenchimento automático (placa, chassi, renavam)
// ════════════════════════════════════════════════════════════

function detectarPaginaSegundaVia() {
    const url = window.location.href.toLowerCase();
    if (!url.includes('emitir-a-2-via-do-crv') && !url.includes('2-via-do-crv')) return 0;
    // Página 2: completar-dados
    if (url.includes('completar-dados')) return 2;
    // Página 1: formulário inicial (placa, chassi, renavam)
    if (document.querySelector('#placa') && document.querySelector('#chassi')) return 1;
    return 0;
}

function preencherSegundaViaPag1(dados) {
    let preenchidos = 0;
    const campos = [
        { id: '#placa', valor: dados.placa },
        { id: '#chassi', valor: dados.chassi },
        { id: '#renavam', valor: dados.renavam },
    ];
    for (const { id, valor } of campos) {
        if (!valor) continue;
        const el = document.querySelector(id);
        if (el) {
            preencherCampo(el, valor);
            preenchidos++;
        }
    }
    return preenchidos;
}

async function preencherSegundaViaPag2(dados) {
    let preenchidos = 0;
    const naoPreenchidos = [];

    // Nome do Proprietário
    const nomeProprietario = buscarCampo(['#nome-proprietario']);
    if (nomeProprietario && dados.nomeProprietario) {
        preencherCampo(nomeProprietario, dados.nomeProprietario);
        preenchidos++;
    } else if (dados.nomeProprietario) { naoPreenchidos.push('Nome'); }

    // CPF/CNPJ do Proprietário
    const cpfProprietario = buscarCampo(['#cpf-cnpj-proprietario']);
    if (cpfProprietario && dados.cpfCnpjProprietario) {
        preencherCampo(cpfProprietario, dados.cpfCnpjProprietario);
        preenchidos++;
    } else if (dados.cpfCnpjProprietario) { naoPreenchidos.push('CPF/CNPJ'); }

    // CEP + Consultar
    const cepField = buscarCampo(['#ResidencialCep']);
    if (cepField && dados.cep) {
        preencherCampo(cepField, dados.cep.replace(/\D/g, ''));
        preenchidos++;

        // Clica no botão Consultar CEP e espera
        const btnCep = document.querySelector('#BtnConsultarResidencial');
        if (btnCep) {
            btnCep.click();
            console.log('[Matilde][AutoFill] CEP consultado, aguardando resposta...');
            await new Promise(r => setTimeout(r, 2500));
        }
    }

    // Endereço (só preenche se Detran não preencheu via CEP)
    const enderecoField = buscarCampo(['#ResidencialEndereco']);
    if (enderecoField && dados.endereco && !enderecoField.value.trim()) {
        preencherCampo(enderecoField, dados.endereco);
        preenchidos++;
    }

    // Número
    const numeroField = buscarCampo(['#ResidencialNumero']);
    if (numeroField && dados.numero) {
        preencherCampo(numeroField, dados.numero);
        preenchidos++;
    } else if (dados.numero) { naoPreenchidos.push('Número'); }

    // Bairro (só preenche se Detran não preencheu via CEP)
    const bairroField = buscarCampo(['#ResidencialBairro']);
    if (bairroField && dados.bairro && !bairroField.value.trim()) {
        preencherCampo(bairroField, dados.bairro);
        preenchidos++;
    }

    // Município (select com códigos)
    const municipioSelect = buscarCampo(['#ResidencialMunicipio']);
    if (municipioSelect && dados.municipio) {
        selecionarOpcaoPorTexto(municipioSelect, dados.municipio);
        if (municipioSelect.value) preenchidos++;
        else naoPreenchidos.push('Município');
    }

    return { preenchidos, naoPreenchidos };
}

let _segundaViaEmAndamento = false;

async function tentarPreenchimentoSegundaVia() {
    if (_segundaViaEmAndamento) return;
    const pagina = detectarPaginaSegundaVia();
    if (!pagina) return;
    _segundaViaEmAndamento = true;
    try {
        const result = await new Promise(resolve =>
            chrome.storage.local.get('matilde_dados_segunda_via', resolve)
        );
        const dados = result?.matilde_dados_segunda_via;
        if (!dados) return;

        const idadeMs = Date.now() - (dados.timestamp || 0);
        if (idadeMs > 30 * 60 * 1000) {
            chrome.storage.local.remove('matilde_dados_segunda_via');
            return;
        }

        console.log(`[Matilde][AutoFill] 2ª Via — Página ${pagina} detectada. Preenchendo...`);

        let preenchidos = 0;
        let naoPreenchidos = [];

        if (pagina === 1) {
            preenchidos = preencherSegundaViaPag1(dados);
        } else if (pagina === 2) {
            const resultado = await preencherSegundaViaPag2(dados);
            preenchidos = resultado.preenchidos;
            naoPreenchidos = resultado.naoPreenchidos;
        }

        if (preenchidos > 0) {
            mostrarNotificacaoPreenchimento(preenchidos, `2ª Via (pág ${pagina})`, naoPreenchidos);
        }

        // Remove dados após página 2 (na pág 1, mantém para a pág 2)
        if (pagina === 2) {
            chrome.storage.local.remove('matilde_dados_segunda_via');
        }
    } catch (e) {
        console.warn('[Matilde][AutoFill] Erro ao preencher 2ª Via:', e.message);
    } finally {
        _segundaViaEmAndamento = false;
    }
}

// Tenta preencher quando a página carrega (com delay para campos renderizarem)
if (document.readyState === 'loading') {
    window.addEventListener('load', () => {
        setTimeout(tentarPreenchimentoAutomatico, 2000);
        setTimeout(tentarPreenchimentoSegundaVia, 2000);
    });
} else {
    setTimeout(tentarPreenchimentoAutomatico, 2000);
    setTimeout(tentarPreenchimentoSegundaVia, 2000);
}

// Também tenta quando detecta mudanças no DOM (navegação SPA)
let matildeAutoFillTimer = null;
const observerAutoFill = new MutationObserver(() => {
    clearTimeout(matildeAutoFillTimer);
    matildeAutoFillTimer = setTimeout(() => {
        const pagina = detectarPaginaTransferencia();
        if (pagina) {
            tentarPreenchimentoAutomatico();
        }
        if (detectarPaginaSegundaVia()) tentarPreenchimentoSegundaVia();
    }, 1500);
});

observerAutoFill.observe(document.body, { childList: true, subtree: true });

// ════════════════════════════════════════════════════════════
// PRIMEIRO EMPLACAMENTO — Página 3 (/confirmar-dados)
// ════════════════════════════════════════════════════════════

let _primeiroEmplacamentoCapturado = false;

function lerDdAposDt(dtTexto) {
    const alvo = dtTexto.toLowerCase().trim();
    const dts = document.querySelectorAll('dt');
    for (const dt of dts) {
        const texto = dt.textContent.toLowerCase().trim().replace(/:$/, '');
        if (texto === alvo) {
            const dd = dt.nextElementSibling;
            return dd ? dd.textContent.trim() : '';
        }
    }
    // Fallback: busca parcial (contém o texto)
    for (const dt of dts) {
        const texto = dt.textContent.toLowerCase().trim();
        if (texto.includes(alvo)) {
            const dd = dt.nextElementSibling;
            return dd ? dd.textContent.trim() : '';
        }
    }
    return '';
}

function logDtsDaPagina() {
    const dts = document.querySelectorAll('dt');
    console.log('[Matilde][Content] DTs encontrados na página:',
        Array.from(dts).map(dt => `"${dt.textContent.trim()}"`)
    );
}

function capturarDadosPag3() {
    return {
        chassi: lerDdAposDt('Chassi'),
        renavam: document.querySelector('input[name="renavam"]')?.value || '',
        marcaModelo: lerDdAposDt('Marca/Modelo'),
        anoFabricacao: lerDdAposDt('Ano de Fabricação'),
        anoModelo: lerDdAposDt('Ano do Modelo'),
        tipoVeiculo: lerDdAposDt('Tipo do Veículo'),
        nomeAdquirente: lerDdAposDt('Nome'),
        tipoDocAdquirente: lerDdAposDt('Tipo de Documento'),
        cpfCnpjAdquirente: lerDdAposDt('CPF ou CNPJ'),
        rgAdquirente: lerDdAposDt('Número do Documento de Identificação'),
        orgaoExpedidor: lerDdAposDt('Órgão Expedidor'),
        ufOrgaoExpedidor: lerDdAposDt('UF do Órgão Expedidor'),
        cepAdquirente: lerDdAposDt('CEP'),
        logradouroAdquirente: lerDdAposDt('Logradouro'),
        numeroAdquirente: lerDdAposDt('Número'),
        bairroAdquirente: lerDdAposDt('Bairro'),
        nomeRevendedor: lerDdAposDt('Nome do Revendedor/Importador'),
        cnpjRevendedor: lerDdAposDt('CPF/CNPJ'),
        municipioEmplacamento: lerDdAposDt('Município de Emplacamento'),
    };
}

let _formInterceptorAdded = false;

async function tentarCapturarPrimeirEmplacamentoPag3() {
    if (_primeiroEmplacamentoCapturado) return;

    const ctx = await new Promise(resolve =>
        chrome.storage.local.get(['matilde_servico_ativo'], resolve)
    );
    if (ctx.matilde_servico_ativo !== 'primeiro_emplacamento') return;
    if (!window.location.href.includes('confirmar-dados')) return;

    logDtsDaPagina();
    const dados = capturarDadosPag3();
    console.log('[Matilde][Content] Dados capturados pág 3:', dados);
    if (!dados.chassi && !dados.renavam) {
        console.log('[Matilde][Content] Pág 3: chassi e renavam vazios, aguardando...');
        return;
    }

    _primeiroEmplacamentoCapturado = true;
    console.log('[Matilde][Content] Pág 3 capturada:', dados);

    // Toast de confirmação visual
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 999999;
        display: flex; align-items: center; gap: 10px;
        padding: 14px 20px; border-radius: 14px;
        background: #7c3aed; color: #fff;
        font-size: 14px; font-weight: 700;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 8px 24px rgba(124,58,237,0.4);
        animation: matilde-fadein 0.3s ease-out;
    `;
    toast.innerHTML = `<span style="font-size:20px">✅</span><span>Matilde capturou os dados — abrindo no CRM...</span>`;
    const style = document.createElement('style');
    style.textContent = `@keyframes matilde-fadein { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`;
    document.head.appendChild(style);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);

    if (!_formInterceptorAdded) {
        _formInterceptorAdded = true;
        const form = document.querySelector('#form-emitir-ficha-de-cadastro-e-dae') ||
                     document.querySelector('form[method="post"]');
        const btnOk = document.querySelector('.btn-ok-modal-2');
        if (form && btnOk) {
            btnOk.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Matilde][Content] Pág 3: clique OK interceptado, capturando PDF...');
                _mostrarToastPag4('carregando');

                try {
                    const formData = new FormData(form);
                    const response = await fetch(form.action || window.location.href, {
                        method: 'POST',
                        body: new URLSearchParams(formData),
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        credentials: 'include',
                    });

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const contentType = response.headers.get('content-type') || '';
                    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
                        // Não é PDF — deixa o form submeter normalmente
                        console.warn('[Matilde][Content] Resposta não é PDF:', contentType, '— submetendo normalmente.');
                        _mostrarToastPag4('erro', 'Resposta não é PDF');
                        form.submit();
                        return;
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    const uint8 = new Uint8Array(arrayBuffer);
                    let binary = '';
                    const CHUNK = 8192;
                    for (let i = 0; i < uint8.length; i += CHUNK) {
                        binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK));
                    }
                    const fileBase64 = 'data:application/pdf;base64,' + btoa(binary);

                    console.log('[Matilde][Content] Pág 3: PDF capturado com sucesso!');
                    _mostrarToastPag4('sucesso');

                    const ctxOs = await new Promise(resolve =>
                        chrome.storage.local.get(['matilde_osId'], resolve)
                    );

                    chrome.runtime.sendMessage({
                        action: 'CAPTURE_DAE_PDF',
                        payload: {
                            base64: fileBase64,
                            placa: '',
                            chassi: dados.chassi || '',
                            servicoAtivo: 'primeiro_emplacamento',
                            osId: ctxOs.matilde_osId || null,
                            fileName: 'ficha_cadastro_dae.pdf',
                        },
                    }, (resp) => {
                        if (chrome.runtime.lastError) {
                            console.error('[Matilde][Content] Erro ao enviar PDF:', chrome.runtime.lastError.message);
                        } else {
                            console.log('[Matilde][Content] PDF enviado ao CRM.', resp);
                        }
                    });

                    // Limpa serviço ativo e navega normalmente
                    chrome.storage.local.remove(['matilde_servico_ativo']);
                    HTMLFormElement.prototype.submit.call(form);

                } catch (err) {
                    console.error('[Matilde][Content] Falha ao capturar PDF:', err.message);
                    _mostrarToastPag4('erro', err.message);
                    // Fallback: submete o form normalmente
                    HTMLFormElement.prototype.submit.call(form);
                }
            }, { capture: true });
            console.log('[Matilde][Content] Pág 3: listener de clique OK para PDF registrado.');
        }
    }

    chrome.runtime.sendMessage({
        action: 'CAPTURE_PRIMEIRO_EMPLACAMENTO',
        payload: { dados },
    }, (_resp) => {
        if (chrome.runtime.lastError) {
            console.error('[Matilde][Content] Erro CAPTURE_PRIMEIRO_EMPLACAMENTO:', chrome.runtime.lastError.message);
            _primeiroEmplacamentoCapturado = false;
        }
    });
}

let _pag4Capturada = false;

async function tentarCapturarPrimeirEmplacamentoPag4() {
    const ctx = await new Promise(resolve =>
        chrome.storage.local.get(['matilde_servico_ativo', 'matilde_osId', 'matilde_placa'], resolve)
    );
    if (ctx.matilde_servico_ativo !== 'primeiro_emplacamento') return;
    if (!window.location.href.includes('emitir-ficha-de-cadastro-e-dae')) return;
    if (_pag4Capturada) return;

    console.log('[Matilde][Content] Pág 4 detectada — interceptando form para capturar PDF.');

    const form = document.querySelector('form');
    if (!form) {
        console.warn('[Matilde][Content] Pág 4: formulário não encontrado.');
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (_pag4Capturada) return;
        _pag4Capturada = true;

        console.log('[Matilde][Content] Pág 4: submit interceptado, capturando PDF...');
        _mostrarToastPag4('carregando');

        try {
            const formData = new FormData(form);

            const response = await fetch(form.action || window.location.href, {
                method: 'POST',
                body: new URLSearchParams(formData),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
                throw new Error(`Resposta não é PDF: ${contentType}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);
            let binary = '';
            const CHUNK = 8192;
            for (let i = 0; i < uint8.length; i += CHUNK) {
                binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK));
            }
            const fileBase64 = 'data:application/pdf;base64,' + btoa(binary);

            console.log('[Matilde][Content] Pág 4: PDF capturado com sucesso!');
            _mostrarToastPag4('sucesso');

            chrome.runtime.sendMessage({
                action: 'CAPTURE_DAE_PDF',
                payload: {
                    base64: fileBase64,
                    placa: ctx.matilde_placa || '',
                    chassi: '',
                    servicoAtivo: ctx.matilde_servico_ativo,
                    osId: ctx.matilde_osId || null,
                    fileName: 'ficha_cadastro_dae.pdf',
                },
            }, (resp) => {
                if (chrome.runtime.lastError) {
                    console.error('[Matilde][Content] Pág 4: erro ao enviar PDF:', chrome.runtime.lastError.message);
                } else {
                    console.log('[Matilde][Content] Pág 4: PDF enviado ao CRM.', resp);
                    chrome.storage.local.remove(['matilde_servico_ativo']);
                }
            });

        } catch (err) {
            console.error('[Matilde][Content] Pág 4: falha ao capturar PDF:', err.message);
            _mostrarToastPag4('erro', err.message);
            _pag4Capturada = false;
            form.submit();
        }
    }, { once: false });

    console.log('[Matilde][Content] Pág 4: listener de submit registrado.');
}

function _mostrarToastPag4(estado, detalhe) {
    const existente = document.getElementById('matilde-pag4-toast');
    if (existente) existente.remove();

    const configs = {
        carregando: { bg: '#7c3aed', icone: '⏳', msg: 'Matilde capturando PDF...' },
        sucesso:    { bg: '#059669', icone: '✅', msg: 'PDF capturado e enviado ao CRM!' },
        erro:       { bg: '#dc2626', icone: '❌', msg: `Erro ao capturar PDF: ${detalhe || ''}` },
    };
    const cfg = configs[estado] || configs.erro;

    const div = document.createElement('div');
    div.id = 'matilde-pag4-toast';
    div.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 999999;
        display: flex; align-items: center; gap: 10px;
        padding: 14px 20px; border-radius: 14px;
        background: ${cfg.bg}; color: #fff;
        font-size: 14px; font-weight: 700;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        max-width: 360px;
    `;
    div.innerHTML = `<span style="font-size:20px">${cfg.icone}</span><span>${cfg.msg}</span>`;
    document.body.appendChild(div);

    if (estado !== 'carregando') {
        setTimeout(() => div?.remove(), estado === 'erro' ? 8000 : 5000);
    }
}

// ════════════════════════════════════════════════════════════
// 2ª VIA DO CRV — Captura de dados da pág 2 + PDF da pág 3
// ════════════════════════════════════════════════════════════

let _segundaViaCapturada = false;
let _segundaViaFormInterceptorAdded = false;

function capturarDadosSegundaViaPag2() {
    // Campos editáveis
    const val = (sel) => {
        const el = document.querySelector(sel);
        return el ? (el.value || el.textContent || '').trim() : '';
    };
    const dd = (label) => lerDdAposDt(label);

    return {
        // Veículo (readonly, vindo do Detran)
        placa: val('input[name="placa"]') || dd('Placa'),
        chassi: val('input[name="chassi"]') || dd('Chassi'),
        renavam: val('input[name="renavam"]') || dd('Renavam'),
        marcaModelo: val('#descricao-marca-modelo'),
        anoFabricacao: val('#ano-fabricacao'),
        anoModelo: val('#ano-modelo'),
        cor: document.querySelector('#codigo-cor option[selected]')?.textContent?.trim() || '',
        categoria: document.querySelector('#codigo-categoria option[selected]')?.textContent?.trim() || '',
        combustivel: document.querySelector('#codigo-combustivel option[selected]')?.textContent?.trim() || '',
        // Proprietário (editáveis)
        nomeProprietario: val('#nome-proprietario'),
        cpfCnpjProprietario: val('#cpf-cnpj-proprietario'),
        // Endereço
        cep: val('#ResidencialCep'),
        endereco: val('#ResidencialEndereco'),
        numero: val('#ResidencialNumero'),
        bairro: val('#ResidencialBairro'),
        municipio: document.querySelector('#ResidencialMunicipio option:checked')?.textContent?.trim() || '',
    };
}

async function tentarCapturarSegundaViaPag2() {
    if (_segundaViaCapturada) return;

    const ctx = await new Promise(resolve =>
        chrome.storage.local.get(['matilde_servico_ativo'], resolve)
    );
    if (ctx.matilde_servico_ativo !== 'segunda_via') return;

    const url = window.location.href.toLowerCase();
    if (!url.includes('emitir-a-2-via-do-crv/completar-dados') && !url.includes('2-via-do-crv/completar-dados')) return;

    const dados = capturarDadosSegundaViaPag2();
    if (!dados.placa && !dados.chassi) return;

    _segundaViaCapturada = true;
    console.log('[Matilde][Content] 2ª Via pág 2 capturada:', dados);

    // Toast
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 999999;
        display: flex; align-items: center; gap: 10px;
        padding: 14px 20px; border-radius: 14px;
        background: #0891b2; color: #fff;
        font-size: 14px; font-weight: 700;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 8px 24px rgba(8,145,178,0.4);
        animation: matilde-fadein 0.3s ease-out;
    `;
    toast.innerHTML = `<span style="font-size:20px">✅</span><span>Matilde capturou os dados da 2ª Via</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);

    // Interceptar clique no botão Ok do modal de confirmação → capturar PDF
    if (!_segundaViaFormInterceptorAdded) {
        _segundaViaFormInterceptorAdded = true;
        const form = document.querySelector('#form-emitir-ficha-de-cadastro-e-dae') ||
                     document.querySelector('form[method="post"]');
        const btnOk = document.querySelector('.btn-ok-modal-2');

        if (form && btnOk) {
            btnOk.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Matilde][Content] 2ª Via: clique OK interceptado, capturando PDF...');
                _mostrarToastPag4('carregando');

                try {
                    const formData = new FormData(form);
                    const response = await fetch(form.action || window.location.href, {
                        method: 'POST',
                        body: new URLSearchParams(formData),
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        credentials: 'include',
                    });

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const contentType = response.headers.get('content-type') || '';
                    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
                        console.warn('[Matilde][Content] 2ª Via: resposta não é PDF:', contentType);
                        _mostrarToastPag4('erro', 'Resposta não é PDF');
                        form.submit();
                        return;
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    const uint8 = new Uint8Array(arrayBuffer);
                    let binary = '';
                    const CHUNK = 8192;
                    for (let i = 0; i < uint8.length; i += CHUNK) {
                        binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK));
                    }
                    const fileBase64 = 'data:application/pdf;base64,' + btoa(binary);

                    console.log('[Matilde][Content] 2ª Via: PDF capturado com sucesso!');
                    _mostrarToastPag4('sucesso');

                    // Recaptura dados do form (usuário pode ter editado)
                    const dadosAtualizados = capturarDadosSegundaViaPag2();

                    chrome.runtime.sendMessage({
                        action: 'CAPTURE_SEGUNDA_VIA',
                        payload: {
                            dados: dadosAtualizados,
                            fileBase64,
                            fileName: `ficha_cadastro_2via_${dadosAtualizados.placa || Date.now()}.pdf`,
                        },
                    }, (resp) => {
                        if (chrome.runtime.lastError) {
                            console.error('[Matilde][Content] 2ª Via: erro ao enviar:', chrome.runtime.lastError.message);
                        } else {
                            console.log('[Matilde][Content] 2ª Via: dados + PDF enviados ao CRM.', resp);
                        }
                    });

                    chrome.storage.local.remove(['matilde_servico_ativo']);
                    HTMLFormElement.prototype.submit.call(form);
                } catch (err) {
                    console.error('[Matilde][Content] 2ª Via: falha ao capturar PDF:', err.message);
                    _mostrarToastPag4('erro', err.message);
                    HTMLFormElement.prototype.submit.call(form);
                }
            }, { capture: true });
            console.log('[Matilde][Content] 2ª Via: listener OK registrado.');
        }
    }

    // Envia dados iniciais (sem PDF) — CRM ignora, só processa quando vier o PDF
    chrome.runtime.sendMessage({
        action: 'CAPTURE_SEGUNDA_VIA',
        payload: { dados },
    }, (_resp) => {
        if (chrome.runtime.lastError) {
            console.error('[Matilde][Content] Erro CAPTURE_SEGUNDA_VIA:', chrome.runtime.lastError.message);
            _segundaViaCapturada = false;
        }
    });
}

// ════════════════════════════════════════════════════════════
// INICIALIZAÇÃO — Primeiro Emplacamento + 2ª Via
// ════════════════════════════════════════════════════════════

(async () => {
    await tentarCapturarPrimeirEmplacamentoPag3();
    await tentarCapturarPrimeirEmplacamentoPag4();
    await tentarCapturarSegundaViaPag2();
})();

const observerPrimEmplacamento = new MutationObserver(() => {
    tentarCapturarPrimeirEmplacamentoPag3();
    tentarCapturarPrimeirEmplacamentoPag4();
    tentarCapturarSegundaViaPag2();
});
observerPrimEmplacamento.observe(document.body, { childList: true, subtree: true });

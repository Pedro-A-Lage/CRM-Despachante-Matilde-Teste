# Captura PDF emitir-ficha-de-cadastro-e-dae — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar o PDF gerado pela página `/emitir-ficha-de-cadastro-e-dae` do Detran MG interceptando o form submit no content script e fazendo fetch do PDF com as credenciais da sessão do navegador.

**Architecture:** O `content_detran.js` intercepta o submit do formulário nessa página, faz um `fetch` com `credentials: 'include'` para a mesma URL com os mesmos dados do form, recebe o PDF como blob, converte para base64 e envia ao `background.js` via `CAPTURE_DAE_PDF`. O `background.js` já sabe repassar esse tipo de mensagem ao CRM. O re-POST existente (`REPOST_FICHA_CADASTRO_PDF`) será mantido como fallback mas a nova captura tem prioridade.

**Tech Stack:** JavaScript (MV3 Chrome Extension), content script, fetch API, FormData, FileReader-free base64 (arrayBuffer + btoa)

---

### Contexto do problema

O Playwright revelou que:
- O browser faz **POST** para `https://detran.mg.gov.br/veiculos/emplacamento/primeiro-emplacamento-veiculo-zero-km/emitir-ficha-de-cadastro-e-dae`
- A resposta é **200 application/pdf** diretamente no body (sem redirect)
- `content-disposition: inline; filename="servicos-detran.pdf"`
- O Service Worker (`background.js`) não consegue fazer esse fetch com cookies porque os cookies de sessão são HttpOnly e não ficam acessíveis via `chrome.cookies` em contextos de Service Worker de forma confiável

**Solução:** O fetch deve ser feito **no content script** (que roda no contexto da página e tem acesso aos cookies automaticamente via `credentials: 'include'`), não no background.

---

### Arquivos modificados

- Modify: `chrome-extension/content_detran.js` — adicionar interceptação de form submit na página `/emitir-ficha-de-cadastro-e-dae`
- Modify: `chrome-extension/background.js` — remover lógica de re-POST (`REPOST_FICHA_CADASTRO_PDF`) que era o workaround anterior, já que a nova abordagem substitui

---

### Task 1: Interceptar form submit e capturar PDF no content script

**Files:**
- Modify: `chrome-extension/content_detran.js`

- [ ] **Step 1: Localizar onde adicionar o código**

Abrir `chrome-extension/content_detran.js`. A função `tentarCapturarPrimeirEmplacamentoPag4()` (linha ~755) já detecta essa página mas apenas pede um re-POST ao background. Vamos substituir essa lógica.

- [ ] **Step 2: Substituir a função `tentarCapturarPrimeirEmplacamentoPag4`**

Localizar a função atual:
```javascript
async function tentarCapturarPrimeirEmplacamentoPag4() {
    const ctx = await new Promise(resolve =>
        chrome.storage.local.get(['matilde_servico_ativo'], resolve)
    );
    if (ctx.matilde_servico_ativo !== 'primeiro_emplacamento') return;
    if (!window.location.href.includes('emitir-ficha-de-cadastro-e-dae')) return;

    console.log('[Matilde][Content] Pág 4 detectada — solicitando re-POST para capturar PDF.');
    chrome.runtime.sendMessage({ action: 'REPOST_FICHA_CADASTRO_PDF', payload: {} });
}
```

Substituir por:
```javascript
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

    // Intercepta o submit do form antes do browser processar
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (_pag4Capturada) return;
        _pag4Capturada = true;

        console.log('[Matilde][Content] Pág 4: submit interceptado, capturando PDF...');

        // Mostra toast de carregamento
        _mostrarToastPag4('carregando');

        try {
            // Coleta os dados do form
            const formData = new FormData(form);

            // Faz fetch com credenciais da sessão (cookies incluídos automaticamente)
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

            // Converte para base64 sem FileReader (não disponível em alguns contextos)
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

            // Envia ao background para repassar ao CRM
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
            _pag4Capturada = false; // permite retry
            // Submete o form normalmente como fallback
            form.removeEventListener('submit', arguments.callee);
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
```

- [ ] **Step 3: Verificar que o IIFE no final do arquivo chama a nova função**

Localizar no final do arquivo o bloco:
```javascript
(async () => {
    await tentarCapturarPrimeirEmplacamentoPag3();
    await tentarCapturarPrimeirEmplacamentoPag4();
})();
```
Confirmar que já chama `tentarCapturarPrimeirEmplacamentoPag4()` — se sim, nenhuma alteração necessária.

- [ ] **Step 4: Verificar que o MutationObserver também dispara a pág 4**

Localizar `observerPrimEmplacamento` (final do arquivo):
```javascript
const observerPrimEmplacamento = new MutationObserver(() => {
    tentarCapturarPrimeirEmplacamentoPag3();
});
```
Atualizar para também tentar pág 4 (caso seja SPA):
```javascript
const observerPrimEmplacamento = new MutationObserver(() => {
    tentarCapturarPrimeirEmplacamentoPag3();
    tentarCapturarPrimeirEmplacamentoPag4();
});
```

---

### Task 2: Remover lógica de re-POST do background.js

**Files:**
- Modify: `chrome-extension/background.js`

O handler `REPOST_FICHA_CADASTRO_PDF` no `background.js` era o workaround anterior. Com a nova captura no content script, ele não é mais necessário. Mantemos apenas o handler `CAPTURE_DAE_PDF` (que já existe e funciona).

- [ ] **Step 1: Localizar o handler REPOST_FICHA_CADASTRO_PDF**

Em `background.js`, localizar:
```javascript
if (message.action === 'REPOST_FICHA_CADASTRO_PDF') {
```
Esse bloco vai até o `return true;` correspondente (~linha 316).

- [ ] **Step 2: Remover o handler**

Apagar o bloco inteiro do `if (message.action === 'REPOST_FICHA_CADASTRO_PDF')` incluindo o `return true;` final.

Também remover o handler de salvar o form:
```javascript
if (message.action === 'SALVAR_FORM_PRIMEIRO_EMPLACAMENTO') {
```
Esse bloco também pode ser removido pois salvava os dados do form para o re-POST.

- [ ] **Step 3: Remover limpeza de session storage relacionada**

No handler `CLEANUP_PRIMEIRO_EMPLACAMENTO`, remover referências a:
- `matilde_primeiro_emplacamento_form`
- `matilde_primeiro_emplacamento_osId`

Se o handler ficar vazio após a remoção, remover o handler inteiro também.

---

### Task 3: Testar o fluxo completo

- [ ] **Step 1: Recarregar a extensão**

No Chrome: `chrome://extensions` → botão "Recarregar" na extensão Matilde CRM

- [ ] **Step 2: Executar o fluxo de Primeiro Emplacamento**

1. Abrir `https://detran.mg.gov.br/veiculos/emplacamento/primeiro-emplacamento-veiculo-zero-km`
2. Preencher e avançar até `/confirmar-dados`
3. Confirmar — deve ir para `/emitir-ficha-de-cadastro-e-dae`
4. Clicar no botão de emitir

- [ ] **Step 3: Verificar toast de carregamento**

Deve aparecer o toast roxo "Matilde capturando PDF..." na tela

- [ ] **Step 4: Verificar toast de sucesso**

Deve aparecer o toast verde "PDF capturado e enviado ao CRM!"

- [ ] **Step 5: Verificar no CRM**

Abrir o CRM → OS correspondente → verificar se o PDF `ficha_cadastro_dae.pdf` foi anexado

- [ ] **Step 6: Verificar console do DevTools**

Abrir F12 na aba do Detran → Console → verificar logs:
```
[Matilde][Content] Pág 4 detectada — interceptando form para capturar PDF.
[Matilde][Content] Pág 4: listener de submit registrado.
[Matilde][Content] Pág 4: submit interceptado, capturando PDF...
[Matilde][Content] Pág 4: PDF capturado com sucesso!
[Matilde][Content] Pág 4: PDF enviado ao CRM.
```

# Análise Técnica: Extensão Chrome × CRM Matilde

**Data:** 2026-03-25
**Versão da Extensão Analisada:** 2.1
**Arquivos:** `chrome-extension/background.js`, `content_detran.js`, `crm_bridge.js`, `src/App.tsx`

---

## 1. COMUNICAÇÃO — MISMATCH CRÍTICO (QUEBRADO)

### Problema Principal

O enunciado original dizia que o CRM ouve `window.addEventListener('message', ...)` enquanto a ponte dispara `CustomEvent('MATILDE_DATA_RECEIVED')`. Após leitura do código real, a situação é mais complexa e tem um mismatch diferente do descrito:

**O CRM (`App.tsx`, linha 271) usa:**
```js
window.addEventListener('message', async (event: MessageEvent) => {
    if (event.data.source === 'MATILDE_EXTENSION' && event.data.type === 'PROCESS_DETRAN_PDF')
```

**A ponte (`crm_bridge.js`, linhas 22–28) usa:**
```js
window.dispatchEvent(new CustomEvent('MATILDE_DATA_RECEIVED', {
    detail: { type: message.type, payload: message.payload }
}));
```

Estes são **dois mecanismos completamente diferentes**:

| Canal | Emissor | Receptor | Compatível? |
|-------|---------|----------|-------------|
| `window.postMessage` | — | `App.tsx` (escuta `'message'`) | — |
| `CustomEvent('MATILDE_DATA_RECEIVED')` | `crm_bridge.js` | Ninguém no App.tsx | **NÃO** |

**O `App.tsx` nunca chama `window.addEventListener('MATILDE_DATA_RECEIVED', ...)`**. O evento customizado disparado pela ponte cai no vazio. O CRM escuta `'message'` (postMessage), mas a ponte nunca chama `window.postMessage`.

### Por Que Ainda Pode Funcionar Parcialmente

O `background.js` usa `chrome.tabs.sendMessage()` para enviar diretamente ao content script `crm_bridge.js`. O `crm_bridge.js` recebe via `chrome.runtime.onMessage` e faz `window.dispatchEvent(CustomEvent)`. Mas o App.tsx não ouve esse `CustomEvent` — ouve `window.addEventListener('message')`.

**Conclusão:** Nenhum dado de veículo/PDF chega ao componente `ExtensionListener` via o fluxo atual. O canal está quebrado na última milha.

### Correção Necessária

**Opção A — Corrigir a ponte** (mudança em `crm_bridge.js`): trocar `window.dispatchEvent(new CustomEvent(...))` por `window.postMessage({ source: 'MATILDE_EXTENSION', type: ..., payload: ... }, '*')`.

**Opção B — Corrigir o CRM** (mudança em `App.tsx`): adicionar `window.addEventListener('MATILDE_DATA_RECEIVED', handler)` em paralelo ao listener de `'message'` já existente.

A Opção A é preferível — o App.tsx já tem toda a lógica de tratamento construída em torno de `event.data.source/type`, e postMessage é mais seguro (permite validar `event.origin`).

---

## 2. FLUXO DE PDF — PROBLEMAS REAIS

### 2a. CORS no Service Worker (alto risco)

`background.js` linha 271:
```js
const response = await fetch(pdfUrl, { credentials: 'include' });
```

O `credentials: 'include'` num Service Worker **não carrega os cookies do navegador do usuário**. O Service Worker tem um contexto de credenciais isolado dos cookies da aba. Para portais governamentais que usam sessão por cookie (como Detran-MG), o fetch retornará 401/403 ou uma página de login em HTML — não o PDF.

O código já trata o caso de blob URL (linha 258) e erros HTTP (linha 273), mas não detecta o cenário silencioso onde o servidor retorna 200 com HTML de redirecionamento de login em vez do PDF. O `contentType` check em `capturarPDFDaPagina` (linha 74) protege contra isso, mas `capturarPDFViaFetch` (chamado pelo download interceptor) não faz essa verificação de content-type.

**Risco:** PDF interceptado via `downloads.onCreated` pode entregar base64 de uma página de login HTML ao CRM, que tentará parsear como PDF e falhará silenciosamente.

**Correção:** Adicionar verificação de content-type em `capturarPDFViaFetch` igual à que existe em `capturarPDFDaPagina`:
```js
const contentType = response.headers.get('content-type') || '';
if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
    enviarParaCRM({ type: 'PDF_CAPTURE_ERROR', error: 'CONTENT_NOT_PDF', contentType });
    return;
}
```

### 2b. Inconsistência de Campo: `fileUrl` vs `fileBase64`

`capturarPDFDaPagina` (linha 98) envia o payload com campo `fileUrl`.
`capturarPDFViaFetch` (linha 283) envia com campo `fileBase64`.

O `App.tsx` (linha 274) espera `event.data.payload.fileUrl`:
```js
const { fileUrl, fileName, placa, chassi, ... } = event.data.payload;
```

PDFs capturados via `downloads.onCreated` → `capturarPDFViaFetch` chegam com `fileBase64` — o CRM vai receber `fileUrl === undefined` e falhar ao tentar criar o `File`.

**Correção:** Padronizar para um único campo (ex: `fileBase64`) em ambas as funções, e atualizar o destructuring no App.tsx.

### 2c. Duplo Registro de `onMessage` no `background.js`

O `background.js` registra `chrome.runtime.onMessage.addListener` **duas vezes**: nas linhas 137 e 323. Ambas tratam `message.action === 'SAVE_DATA'`. O segundo listener (linha 323) vai executar em paralelo com o primeiro, podendo enviar a mesma mensagem duas vezes ao CRM.

---

## 3. SEGURANÇA

### 3a. Validação de Origem no App.tsx Ausente

O `App.tsx` ouve `window.addEventListener('message', ...)` mas **não valida `event.origin`**. Qualquer iframe ou aba pode enviar uma mensagem com `source: 'MATILDE_EXTENSION'` e acionar o fluxo de criação de OS, upload de arquivo e navegação.

```js
// Ausente no App.tsx — deveria existir:
if (!['https://matildecrm.com', 'http://localhost:5173'].includes(event.origin)
    && event.origin !== 'null') return;
```

A ponte `crm_bridge.js` usa `window.postMessage` sem especificar origem alvo, e o App.tsx não filtra origem. Combinados, isso permite injeção por qualquer script da página.

### 3b. Validação de `MATILDE_SEND_CONTEXT` (já corrigida)

O `crm_bridge.js` já tem validação de formato de placa e osId (linhas 48–56). Isso está correto.

### 3c. Base64 de PDF Não Validado

O CRM aceita qualquer string base64 como PDF. Um payload malicioso poderia enviar um base64 de arquivo não-PDF. Recomenda-se verificar a assinatura `%PDF` nos primeiros bytes antes de processar.

---

## 4. ROBUSTEZ — SELETORES CSS FRÁGEIS

O `content_detran.js` usa seletores genéricos que **vão quebrar** com qualquer redesign do portal:

```js
document.querySelector("#placa")?.value            // ID genérico, pode existir em qualquer form
document.querySelector(".placa-resultado")          // classe CSS sem namespace
document.querySelector(".nome-proprietario")        // idem
document.querySelector(".situacao-veiculo")         // idem
```

**Problemas específicos:**

1. `#placa` é um ID extremamente comum — pode capturar o campo errado em páginas com múltiplos formulários.
2. Não há nenhuma âncora contextual (ex: buscar dentro de `#resultado-consulta .placa-resultado`) — qualquer elemento com essa classe na página inteira é capturado.
3. O Detran-MG usa JSF (JavaServer Faces) que gera IDs dinâmicos como `j_idt45:placa` — o seletor `#placa` provavelmente **nunca funcionou** em produção.
4. O portal Cidadão-MG usa Angular/Vue com classes geradas em tempo de execução — as classes `.placa-resultado`, `.situacao-veiculo` são presumidas, não verificadas.

**Consequência prática:** `extrairDadosVeiculo()` retorna `null` na grande maioria das consultas reais. O fluxo cai no path de erro sem dados de veículo.

**O que funciona de fato:** A captura de erros via `capturarTextoErroBruto()` é mais robusta porque usa múltiplos seletores alternativos e verifica visibilidade (`offsetParent !== null`).

---

## 5. O QUE ESTÁ QUEBRADO OU VAI QUEBRAR

| # | Problema | Severidade | Status |
|---|----------|-----------|--------|
| 1 | Mismatch CustomEvent vs postMessage — dados nunca chegam ao App.tsx | **CRÍTICO** | Quebrado agora |
| 2 | `fileUrl` vs `fileBase64` — PDFs do download interceptor chegam com campo errado | **ALTO** | Quebrado agora |
| 3 | `credentials: 'include'` no SW não usa cookies da aba — PDF fetch retorna HTML de login | **ALTO** | Quebrado em produção |
| 4 | Duplo listener `onMessage` no background.js — mensagens duplicadas ao CRM | **MÉDIO** | Quebrado agora |
| 5 | Sem validação de `event.origin` no App.tsx — injeção externa possível | **MÉDIO** | Vulnerabilidade ativa |
| 6 | Seletores CSS sem contexto — `extrairDadosVeiculo()` retorna null em produção | **MÉDIO** | Provavelmente sempre falhou |
| 7 | `capturarPDFViaFetch` não verifica content-type — aceita HTML como PDF | **MÉDIO** | Quebrado em produção |
| 8 | `crm_bridge.js` dispara `CustomEvent` que ninguém ouve | **CRÍTICO** | Consequência do item 1 |

---

## 6. RESUMO EXECUTIVO

A extensão tem uma arquitetura bem pensada com boas correções de bugs documentadas (BUG-01 a BUG-13). Porém, o canal de comunicação final entre a ponte e o React está quebrado: a ponte dispara `CustomEvent('MATILDE_DATA_RECEIVED')` e o App.tsx ouve `window.addEventListener('message')` — os dois nunca se encontram.

O fluxo de PDF tem dois problemas independentes que também o quebram em produção: `credentials: 'include'` não funciona como esperado no Service Worker, e há inconsistência no nome do campo base64 entre as duas funções de captura.

A prioridade de correção deve ser:
1. Corrigir a ponte (`crm_bridge.js`) para usar `window.postMessage` em vez de `CustomEvent`
2. Padronizar o campo de PDF para `fileBase64` em todo o background.js
3. Adicionar verificação de content-type em `capturarPDFViaFetch`
4. Remover o listener duplicado no `background.js`
5. Adicionar validação de `event.origin` no `App.tsx`

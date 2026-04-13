# Relatório de Testes — Chrome Extension Matilde CRM
**Data:** 2026-04-13
**Versão:** 2.2
**Arquivos analisados:** manifest.json, background.js, content.js, content_detran.js, content_vistoria.js, crm_bridge.js, crm-content.js, inject-error-interceptor.js, inject-pdf-interceptor.js

---

## Resumo Executivo

| Categoria | Resultado |
|-----------|-----------|
| Testes unitários | **105/106 passaram** (99%) |
| Bugs CRITICAL encontrados | **2** |
| Bugs HIGH encontrados | **3** |
| Bugs MEDIUM encontrados | **3** |
| Avisos (warnings) | **4** |

---

## 1. Bugs Encontrados

### 🔴 [CRITICAL] BUG-NEW-01 — `transmitirParaCRM()` nunca é chamada (6 ações órfãs)

**Arquivo:** `background.js`, linhas 414–453
**Impacto:** Dados capturados pelo content.js são PERDIDOS

**Descrição:**
O `onMessage` listener no background.js trata 10 ações específicas (SAVE_DATA, CAPTURE_DAE_PDF, CAPTURE_VISTORIA, etc.), mas **6 ações enviadas pelo content.js não têm handler**:

- `CAPTURED_CONFIRMAR_DADOS` — dados da tela de confirmação (CRM precisa disso para criar OS)
- `CAPTURED_DETRAN_PDF` — PDF genérico capturado (CRM precisa para salvar no Drive)
- `CAPTURED_LAUDO_PDF` — resultado do laudo de vistoria
- `UPDATE_PLACA` — atualização de placa (antiga → Mercosul)
- `CRLV_CONSULTA_RESULTADO` — resultado da consulta CRLV Digital
- `CAPTURED_VISTORIA_ECV` — dados de vistoria do content.js (distinto de CAPTURE_VISTORIA do content_vistoria.js)

A função `transmitirParaCRM()` existe e tem o `TYPE_MAP` correto para todas essas ações, mas **nunca é invocada** pelo listener. Resultado: essas mensagens caem no `console.warn('Ação não tratada')` e são descartadas.

**Fix recomendado:**
Adicionar um bloco genérico ANTES do `return false` final no onMessage listener:

```js
// Ações que devem ser retransmitidas ao CRM
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
            sendResponse({ success: false, error: 'CRM não aberto' });
        }
    })();
    return true;
}
```

---

### 🔴 [CRITICAL] BUG-NEW-02 — `web_accessible_resources` ausente no manifest.json

**Arquivo:** `manifest.json`
**Impacto:** inject-error-interceptor.js e inject-pdf-interceptor.js falham silenciosamente

**Descrição:**
O content.js usa `chrome.runtime.getURL('inject-error-interceptor.js')` e `chrome.runtime.getURL('inject-pdf-interceptor.js')` para injetar scripts no contexto da página. No Manifest V3, isso exige que os arquivos estejam listados em `web_accessible_resources`. Sem isso, o Chrome bloqueia o acesso e a injeção falha silenciosamente.

**Fix recomendado:**
Adicionar ao manifest.json:

```json
"web_accessible_resources": [{
    "resources": ["inject-error-interceptor.js", "inject-pdf-interceptor.js"],
    "matches": ["*://detran.mg.gov.br/*", "*://*.detran.mg.gov.br/*",
                 "*://transito.mg.gov.br/*", "*://*.transito.mg.gov.br/*",
                 "*://*.cidadao.mg.gov.br/*"]
}]
```

---

### 🟠 [HIGH] BUG-NEW-03 — cidadao.mg.gov.br ausente nos content_scripts matches

**Arquivo:** `manifest.json`, content_scripts[0]
**Impacto:** `modCrlvDigital()` do content.js não é injetado automaticamente no Cidadão MG

**Descrição:**
O content.js tem o módulo `modCrlvDigital()` que deve rodar em `cidadao.mg.gov.br`, mas este domínio **não está nos matches** do content_scripts. O content.js é injetado apenas em `detran.mg.gov.br` e `transito.mg.gov.br`.

**Fix recomendado:**
Adicionar `"*://*.cidadao.mg.gov.br/*"` ao primeiro content_scripts:

```json
"content_scripts": [{
    "matches": [
        "*://detran.mg.gov.br/*",
        "*://*.detran.mg.gov.br/*",
        "*://transito.mg.gov.br/*",
        "*://*.transito.mg.gov.br/*",
        "*://*.cidadao.mg.gov.br/*"
    ],
    "js": ["content_detran.js", "content_vistoria.js", "content.js"]
}]
```

⚠️ **Nota:** `content.js` também não está na lista de JS! Apenas `content_detran.js` e `content_vistoria.js`. Se `content.js` deve ser injetado, precisa ser adicionado.

---

### 🟠 [HIGH] BUG-NEW-04 — Mensagens duplicadas no CRM (crm_bridge.js + crm-content.js)

**Arquivos:** `crm_bridge.js` (injetado via manifest) + `crm-content.js` (injetado via `garantirCRMTab()`)
**Impacto:** CRM React recebe cada mensagem da extensão 2x

**Descrição:**
Ambos os scripts escutam `chrome.runtime.onMessage` e fazem `window.postMessage`. Quando o background.js envia uma mensagem para a aba do CRM, os dois listeners recebem e ambos postam no window — causando processamento duplicado.

**Fix recomendado:**
Remover `crm-content.js` e usar apenas `crm_bridge.js` (que é mais completo e já tem validação). Remover a injeção dinâmica em `garantirCRMTab()`. Ou adicionar um dedup flag: `if (window.__matildeBridgeLoaded) return; window.__matildeBridgeLoaded = true;`

---

### 🟠 [HIGH] BUG-NEW-05 — Regex de placa aceita entradas inválidas

**Arquivo:** `crm_bridge.js`, linha 142
**Impacto:** Placas inválidas como "ABCD123" passam na validação

**Descrição:**
O regex `/^[A-Za-z]{3}[\dA-Za-z][\dA-Za-z]{2}\d$|^[A-Za-z]{3}\d{4}$/` é muito permissivo. Aceita "ABCD123" (4 letras + 3 dígitos = 7 chars) porque o padrão Mercosul `[A-Za-z]{3}[\dA-Za-z][\dA-Za-z]{2}\d` interpreta o 4º "D" como `[\dA-Za-z]`.

**Fix recomendado:**
Se quiser ser mais restritivo, usar:
```js
/^[A-Za-z]{3}\d[A-Za-z]\d{2}$|^[A-Za-z]{3}\d{4}$/
```
Formato Mercosul real: ABC1D23 (letra-letra-letra-dígito-letra-dígito-dígito)

---

### 🟡 [MEDIUM] BUG-NEW-06 — content.js NÃO está no manifest content_scripts

**Arquivo:** `manifest.json`
**Impacto:** Todo o content.js (10 módulos) nunca é injetado

**Descrição:**
O `content_scripts[0].js` lista apenas `["content_detran.js", "content_vistoria.js"]`. O arquivo `content.js` — que contém os módulos ConfirmarDados, CapturaPDF, VistoriaECV, ConsultaLaudo, DocFinal, AutoPreenchimento, CrlvDigital, SegundaViaCRV — **não está listado no manifest** e portanto nunca é injetado automaticamente.

Há funcionalidade duplicada entre content.js e content_detran.js (ambos tratam confirmar-dados, por exemplo), sugerindo que content.js pode ser uma versão nova que deveria substituir parte do content_detran.js mas não foi ativada.

**Fix recomendado:**
Se content.js deve ser ativo, adicioná-lo ao manifest. Se é uma versão futura, considerar remover da pasta de produção para evitar confusão.

---

### 🟡 [MEDIUM] BUG-NEW-07 — `document.createElement` sobrescrito globalmente

**Arquivo:** `content.js`, linha 1220
**Impacto:** Pode quebrar outros scripts no cidadao.mg.gov.br

**Descrição:**
O `modCrlvDigital()` sobrescreve `document.createElement` para interceptar `<a download>` criados pelo Angular. Isso afeta TODOS os scripts na página, incluindo o próprio Angular e qualquer lib de terceiros.

**Fix recomendado:**
Usar MutationObserver para detectar novos `<a>` em vez de monkey-patching:
```js
new MutationObserver(mutations => {
    for (const m of mutations) {
        for (const node of m.addedNodes) {
            if (node.tagName === 'A' && node.download) { /* interceptar */ }
        }
    }
}).observe(document.body, { childList: true, subtree: true });
```

---

### 🟡 [MEDIUM] BUG-NEW-08 — watchDOM com timeout infinito (maxMs=0)

**Arquivo:** `content.js`, linha 488
**Impacto:** MutationObserver roda indefinidamente consumindo CPU

**Descrição:**
`watchDOM(tentarCapturar, 0)` na `modCapturaPDF()` cria um observer que nunca é desconectado. Se a extensão rodar em uma página longa (SPA), esse observer continua processando todas as mutações do DOM indefinidamente.

---

## 2. Resultados dos Testes Unitários

### test-background.js — 66/67 passaram

| Categoria | Resultado |
|-----------|-----------|
| isCRMTab() | 13/13 ✅ |
| blobToBase64() | 5/5 ✅ |
| Storage cleanup | 4/4 ✅ |
| Validação de placa | 8/9 (1 falha: "ABCD123" aceita indevidamente) |
| extractVehicleInfo() | 7/7 ✅ |
| _detectarServicoPorTitulo() | 9/9 ✅ |
| Funções utilitárias | 12/12 ✅ |
| Roteamento de mensagens | 7/7 ✅ (detectou bug de ações órfãs) |
| Duplicação de listeners | 1/1 ✅ (aviso) |

### test-manifest.js — 39/39 passaram + 4 avisos

| Categoria | Resultado |
|-----------|-----------|
| manifest.json válido | 8/8 ✅ |
| Arquivos existem | 7/7 ✅ |
| Compatibilidade MV3 | 3/3 ✅ + 1 aviso |
| Host permissions | 6/6 ✅ |
| Content script matches | 4/4 ✅ + 1 aviso |
| Tamanho dos arquivos | 6/6 ✅ |
| Padrões de código | 6/6 ✅ + 2 avisos |

---

## 3. Validação de Fluxos Funcionais

### Fluxo 1: Transferência de Propriedade
```
CRM → crm_bridge.js (MATILDE_PREENCHER_DETRAN)
  → chrome.storage.local (matilde_dados_detran)
  → content_detran.js detecta página de transferência
  → Preenche Pág 1 (placa, chassi, CPF)
  → Preenche Pág 2 (renavam, dados adquirente, endereço)
  → Confirmar dados → content_detran.js/content.js captura
  → ⚠️ CAPTURED_CONFIRMAR_DADOS → background.js NÃO trata (BUG-NEW-01)
```
**Status:** ⚠️ Parcialmente funcional. Preenchimento OK, mas a captura de dados não chega ao CRM.

### Fluxo 2: Captura de PDF
```
Detran gera PDF → content.js modCapturaPDF() detecta embed/iframe/link
  → fetchBase64() baixa o PDF
  → CAPTURED_DETRAN_PDF → background.js
  → ⚠️ Ação NÃO tratada (BUG-NEW-01)
```
**Status:** ⚠️ PDF é capturado mas nunca chega ao CRM.

### Fluxo 3: Vistoria ECV (via content_vistoria.js)
```
CRM envia URL com parâmetros → content_vistoria.js preenche formulário
  → Página confirmação → captura dados (protocolo, data, hora)
  → CAPTURE_VISTORIA → background.js ✅ TRATA → envia ao CRM
```
**Status:** ✅ Funcional (usa CAPTURE_VISTORIA, não CAPTURED_VISTORIA_ECV)

### Fluxo 4: CRLV Digital (cidadao.mg.gov.br)
```
CRM abre URL com parâmetros matilde_*
  → content.js modCrlvDigital()
  → ⚠️ content.js NÃO é injetado (BUG-NEW-06)
  → Mesmo se fosse, CRLV_CONSULTA_RESULTADO não é tratado (BUG-NEW-01)
```
**Status:** ❌ Não funcional

### Fluxo 5: Primeiro Emplacamento
```
CRM → crm_bridge.js define serviço → content_detran.js detecta pág 3
  → Captura dados → CAPTURE_PRIMEIRO_EMPLACAMENTO → background.js ✅
  → Captura PDF pág 3/4 → CAPTURE_DAE_PDF → background.js ✅
```
**Status:** ✅ Funcional

### Fluxo 6: 2ª Via do CRV
```
CRM → crm_bridge.js salva dados → content_detran.js preenche formulário
  → Captura dados pág 2 + PDF → CAPTURE_SEGUNDA_VIA → background.js ✅
```
**Status:** ✅ Funcional

---

## 4. Prioridades de Correção

| Prioridade | Bug | Esforço | Impacto |
|------------|-----|---------|---------|
| 🔴 P0 | BUG-NEW-01: transmitirParaCRM desconectada | ~30 min | 6 fluxos quebrados |
| 🔴 P0 | BUG-NEW-02: web_accessible_resources | ~5 min | Interceptors não funcionam |
| 🟠 P1 | BUG-NEW-06: content.js fora do manifest | ~5 min | 10 módulos inativos |
| 🟠 P1 | BUG-NEW-03: cidadao.mg.gov.br matches | ~5 min | CRLV Digital quebrado |
| 🟠 P1 | BUG-NEW-04: Mensagens duplicadas | ~20 min | CRM processa 2x |
| 🟡 P2 | BUG-NEW-05: Regex de placa | ~10 min | Validação fraca |
| 🟡 P2 | BUG-NEW-07: createElement override | ~30 min | Possível quebra de libs |
| 🟡 P2 | BUG-NEW-08: watchDOM infinito | ~10 min | Performance |

---

## 5. Observações Gerais

1. **Código bem organizado:** O content.js tem uma arquitetura modular clara com seções numeradas e documentação inline.

2. **Bug Report anterior atendido:** Os 13 bugs do BUG_REPORT.md de 2026-03-25 foram todos corrigidos no código (FileReader removido, blob URL tratado, cleanup unificado, etc.).

3. **Testes embutidos:** O `MatildeTest` no content.js é um excelente recurso para depuração no console do navegador.

4. **Duplicação de lógica:** content.js e content_detran.js ambos tratam `/confirmar-dados` e captura de PDF. Recomendo consolidar em um único arquivo.

5. **Playwright Analyzer:** O script analyze.js está configurado para CDP na porta 9222 — funcional para debug local, não para CI/CD.

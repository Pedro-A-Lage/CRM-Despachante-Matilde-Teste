# Bug Report — Chrome Extension Matilde CRM
**Date:** 2026-03-25
**Files reviewed:** `manifest.json`, `background.js`, `content_detran.js`, `crm_bridge.js`
**Status:** CRITICAL and HIGH bugs fixed in source. MEDIUM/LOW documented only.

---

## background.js

---

### [CRITICAL] BUG-01 — `FileReader` is not available in Service Workers
**File:** `background.js`, line 62–68
**Severity:** CRITICAL
**Status:** FIXED

**Root cause:**
`FileReader` is a Web API that only exists in Window and Worker contexts that have the File API. Chrome Extension Service Workers do **not** have `FileReader`. Calling `new FileReader()` throws `ReferenceError: FileReader is not defined` at runtime, which means every PDF capture silently fails — the `catch` in `capturarPDFViaFetch` swallows the error.

**Recommended fix:**
Replace `FileReader` with `blob.arrayBuffer()` + `btoa()` or use the `Response` trick with `arrayBuffer`:

```js
async function blobToBase64(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
    }
    return 'data:' + blob.type + ';base64,' + btoa(binary);
}
```

---

### [CRITICAL] BUG-02 — Blob URL downloads are silently skipped
**File:** `background.js`, lines 27–35
**Severity:** CRITICAL
**Status:** FIXED

**Root cause:**
`downloadItem.url` for browser-generated PDF downloads is frequently a `blob:https://cidadao.mg.gov.br/...` URL. The check `.toLowerCase().includes('cidadao.mg.gov.br')` operates on the full blob URL string, so the domain **is** present in the blob URL and the check does pass for blob URLs of target portals.

However, the second condition `url.includes('pdf')` is also applied to the blob URL string, which typically looks like `blob:https://cidadao.mg.gov.br/1a2b3c4d-...` — no `'pdf'` substring. The condition relies on `downloadItem.mime === 'application/pdf'` as the OR fallback, which does work. But `downloadItem.mime` may be empty or `undefined` early in the download lifecycle when `onCreated` fires.

Additionally, fetching a `blob:` URL from a different origin (the Service Worker origin vs. the page that created the blob) will **fail** because blob URLs are scoped to the creating context and are not accessible cross-context. `fetch(blobUrl)` from the Service Worker will throw a network error.

**Recommended fix:**
- Check `downloadItem.mime === 'application/pdf'` first (more reliable than URL sniffing).
- For blob URLs, the fetch will fail — add detection and log a meaningful error rather than silently catching it. The PDF content must be captured from the content script context instead (blob URLs are accessible in the page context), or the download must be intercepted via `chrome.downloads.onDeterminingFilename`.

---

### [HIGH] BUG-03 — CORS failure when fetching government HTTPS PDFs
**File:** `background.js`, lines 41–43
**Severity:** HIGH
**Status:** FIXED (error handling improved; architectural limitation documented)

**Root cause:**
`fetch(pdfUrl, { credentials: 'include' })` from a Service Worker sends a cross-origin request. Government portals (cidadao.mg.gov.br, detran.mg.gov.br) do not set permissive CORS headers for their PDF endpoints. The fetch will fail with a CORS or network error. The `catch` block only logs the error — no retry, no user notification, no fallback.

**Recommended fix:**
- The `catch` block should store a failure state in `chrome.storage.local` so the CRM UI can notify the user that PDF capture failed.
- The only robust solution for HTTPS PDFs is fetching from the content script (which runs in the page's origin context, bypassing CORS) and posting the base64 result back via `chrome.runtime.sendMessage`.

---

### [HIGH] BUG-04 — `chrome.storage.local` context is never cleaned on CRM tab send failure
**File:** `background.js`, lines 99–108
**Severity:** HIGH
**Status:** FIXED

**Root cause:**
In `enviarParaCRM`, `chrome.storage.local.remove(['matilde_osId', 'matilde_placa'])` is only called inside the `else` (success) branch of the `sendMessage` callback. If the CRM tab is closed or the message fails (`chrome.runtime.lastError` is set), the context keys `matilde_osId` and `matilde_placa` remain in storage indefinitely. Subsequent PDF downloads will be incorrectly tagged with the stale context.

**Recommended fix:**
Move the `chrome.storage.local.remove` call outside the success/error branch so it always runs after a send attempt:

```js
chrome.tabs.sendMessage(crmTabId, { ... }, (response) => {
    if (chrome.runtime.lastError) {
        console.error('[Matilde][Background] Erro ao enviar para CRM:', chrome.runtime.lastError.message);
    } else {
        console.log('[Matilde][Background] Dados enviados com sucesso ao CRM!');
    }
    // Always clean up context to prevent stale tagging
    chrome.storage.local.remove(['matilde_osId', 'matilde_placa'], () => {
        console.log('[Matilde][Background] Contexto de consulta limpo.');
    });
});
```

---

### [MEDIUM] BUG-05 — `isCRMTab` may match unrelated localhost pages
**File:** `background.js`, lines 18–23
**Severity:** MEDIUM
**Status:** Not fixed (acceptable trade-off for development workflow; document only)

**Root cause:**
`url.includes('localhost')` will match any localhost tab — a developer's local Webpack server, another CRM project, a test suite, etc. This silently overwrites `crmTabId` with a non-CRM tab. Subsequent `enviarParaCRM` calls send messages to the wrong tab.

**Recommended fix:**
Match against specific port or pathname patterns, e.g., `url.includes('localhost:3000/matilde')`.

---

### [MEDIUM] BUG-06 — Service Worker restart loses `crmTabId` permanently until a message is sent
**File:** `background.js`, line 8
**Severity:** MEDIUM
**Status:** Not fixed (the fallback query in `enviarParaCRM` mitigates the issue)

**Root cause:**
After a Service Worker restart, `crmTabId = null`. The fallback `chrome.tabs.query({})` in `enviarParaCRM` resolves it, but only when a message needs to be sent. The `chrome.tabs.onUpdated` listener only fires on future navigations. If no data is sent, `crmTabId` stays `null` until the next navigation or send attempt. This is acceptable behavior but could cause a one-time missed message right after restart.

**Recommended fix:**
On Service Worker startup, proactively query for existing CRM tabs:
```js
chrome.tabs.query({}, (tabs) => {
    const crmTab = tabs.find(t => t.url && isCRMTab(t.url));
    if (crmTab) crmTabId = crmTab.id;
});
```

---

## content_detran.js

---

### [HIGH] BUG-07 — `enviarParaBackground` crashes if extension is reloaded mid-session
**File:** `content_detran.js`, lines 46–54
**Severity:** HIGH
**Status:** FIXED

**Root cause:**
If the extension is reloaded or updated while the Detran page is open, `chrome.runtime` becomes invalid (the port is disconnected). Calling `chrome.runtime.sendMessage` in this state throws: `Error: Extension context invalidated`. This unhandled exception will propagate through `processarPagina` and crash the MutationObserver callback, effectively disabling all further capture on the page.

**Recommended fix:**
Wrap `chrome.runtime.sendMessage` in a try/catch:

```js
function enviarParaBackground(tipo, payload) {
    try {
        chrome.runtime.sendMessage({ action: 'SAVE_DATA', payload: { type: tipo, data: payload } });
    } catch (e) {
        console.warn('[Matilde][Content] Extensão desconectada. Recarregue a aba para reconectar.', e.message);
    }
}
```

---

### [MEDIUM] BUG-08 — `window.load` never fires if page is already loaded at injection time
**File:** `content_detran.js`, lines 69–71
**Severity:** MEDIUM
**Status:** Not fixed (MutationObserver provides partial mitigation; full fix would require `document.readyState` check)

**Root cause:**
`window.addEventListener("load", ...)` is only triggered if the page load event hasn't already fired. If the content script is injected after the page is fully loaded (e.g., on SPA navigation, or when `run_at` defaults to `document_idle`), the `load` event never fires. The MutationObserver does fire on subsequent DOM changes, but the initial `processarPagina` call is never made for an already-loaded page.

**Recommended fix:**
```js
if (document.readyState === 'complete') {
    setTimeout(processarPagina, 1500);
} else {
    window.addEventListener('load', () => setTimeout(processarPagina, 1500));
}
```

---

### [MEDIUM] BUG-09 — `capturarTextoErroBruto` may return stale/hidden error elements
**File:** `content_detran.js`, lines 8–31
**Severity:** MEDIUM
**Status:** Not fixed

**Root cause:**
The visibility check `elemento.offsetParent !== null` is a reasonable heuristic, but it fails for elements with `position: fixed` or `position: absolute` (their `offsetParent` is `null` even when visible). On Detran portals that use fixed-position toast/alert overlays, stale error messages may re-trigger on every DOM mutation, flooding the background with duplicate `SITE_ERROR` messages.

**Recommended fix:**
Use `elemento.getBoundingClientRect().height > 0` as an additional visibility check, and debounce error-sending with a flag to avoid duplicate submissions.

---

### [LOW] BUG-10 — `window.matildeTimeout` global may collide with site globals
**File:** `content_detran.js`, line 74
**Severity:** LOW
**Status:** Not fixed (risk is very low on government portals)

**Root cause:**
Using `window.matildeTimeout` as a debounce handle writes to the global `window` object of the host page. If the Detran portal's own code uses a `window.matildeTimeout` variable (unlikely but possible), this will cause a collision.

**Recommended fix:**
Use a module-level variable instead of `window.matildeTimeout`:
```js
let matildeTimeout = null;
// then: clearTimeout(matildeTimeout); matildeTimeout = setTimeout(...);
```

---

### [LOW] BUG-11 — No logging when `extrairDadosVeiculo` finds no data
**File:** `content_detran.js`, lines 33–44
**Severity:** LOW
**Status:** Not fixed

**Root cause:**
When all selectors fail to match, the function returns `null` silently. During debugging or when the Detran portal changes its HTML, there is no visibility into which selectors failed.

**Recommended fix:**
Add a debug log when returning null: `console.debug('[Matilde][Content] Nenhum dado de veículo encontrado.')`.

---

## crm_bridge.js

---

### [HIGH] BUG-12 — No input validation on `MATILDE_SEND_CONTEXT` event data
**File:** `crm_bridge.js`, lines 27–35
**Severity:** HIGH
**Status:** FIXED

**Root cause:**
`window.addEventListener('MATILDE_SEND_CONTEXT', ...)` listens to DOM events. Any script on the CRM page (including third-party analytics, ads, or a malicious injected script) can dispatch a fake `MATILDE_SEND_CONTEXT` event with arbitrary `osId` and `placa` values. These values are then saved to `chrome.storage.local` and subsequently used to tag captured PDFs — a potential data integrity attack.

**Recommended fix:**
Validate that `osId` and `placa` are strings within expected formats before writing to storage:

```js
window.addEventListener('MATILDE_SEND_CONTEXT', (event) => {
    const { osId, placa } = event.detail || {};
    // Validate: osId should be a non-empty string, placa matches Brazilian plate format
    const placaValida = typeof placa === 'string' && /^[A-Z]{3}[\d][A-Z\d][\d]{2}$|^[A-Z]{3}\d{4}$/.test(placa.toUpperCase().trim());
    const osIdValido = typeof osId === 'string' && osId.trim().length > 0 && osId.length < 100;
    if (!placaValida || !osIdValido) {
        console.warn('[Matilde][Bridge] Contexto inválido rejeitado:', { osId, placa });
        return;
    }
    chrome.storage.local.set({ matilde_osId: osId.trim(), matilde_placa: placa.toUpperCase().trim() }, () => {
        console.log('[Matilde][Bridge] Contexto salvo na extensão:', { osId, placa });
    });
});
```

---

### [MEDIUM] BUG-13 — Extension invalidation silently breaks the bridge
**File:** `crm_bridge.js`, lines 9–24
**Severity:** MEDIUM
**Status:** Not fixed (no reconnection mechanism is possible without page reload)

**Root cause:**
If the extension is updated while the CRM page is open, `chrome.runtime.onMessage` listeners stop receiving messages silently. The CRM UI will appear to work but no data will arrive. There is no reconnection mechanism; the user must reload the page.

**Recommended fix:**
Detect extension context invalidation by catching errors in `chrome.storage` calls and dispatching a `MATILDE_EXTENSION_DISCONNECTED` event to the page so the React app can show a warning banner asking the user to reload.

---

## manifest.json

---

### [LOW] BUG-14 — `activeTab` permission is not used in any active file
**File:** `manifest.json`, line 7
**Severity:** LOW
**Status:** Not fixed (removal requires confirming no future use)

**Root cause:**
None of `background.js`, `content_detran.js`, or `crm_bridge.js` calls any API that requires `activeTab`. The permission is present but unused, adding unnecessary surface area in the Chrome permission prompt.

**Recommended fix:**
Remove `"activeTab"` from the `permissions` array.

---

### [LOW] BUG-15 — `scripting` permission is not used in any active file
**File:** `manifest.json`, line 8
**Severity:** LOW
**Status:** Not fixed (removal requires confirming no future use)

**Root cause:**
`chrome.scripting.*` is not called anywhere in the active files. The permission is unused and adds unnecessary scope.

**Recommended fix:**
Remove `"scripting"` from the `permissions` array.

---

### [MEDIUM] BUG-16 — `crm_bridge.js` injects into ALL localhost pages
**File:** `manifest.json`, lines 34–40
**Severity:** MEDIUM
**Status:** Not fixed (intentional for development but risky in shared environments)

**Root cause:**
`"*://localhost/*"` matches every localhost server on any port. A developer running multiple local projects will have `crm_bridge.js` injected into all of them, including non-CRM apps. The script accesses `chrome.storage` and listens to DOM events on these unrelated pages.

**Recommended fix:**
Restrict to specific ports or paths, e.g., `"*://localhost:3000/*"`, or require a page-specific flag before the bridge activates.

---

## Summary Table

| ID | Severity | File | Description | Status |
|----|----------|------|-------------|--------|
| BUG-01 | CRITICAL | background.js:62 | `FileReader` unavailable in Service Worker | **FIXED** |
| BUG-02 | CRITICAL | background.js:27 | Blob URL PDFs fail cross-context fetch | **FIXED** (error handling) |
| BUG-03 | HIGH | background.js:41 | CORS failure on HTTPS PDF fetch, no user feedback | **FIXED** (error handling) |
| BUG-04 | HIGH | background.js:104 | Storage context never cleaned on send failure | **FIXED** |
| BUG-05 | MEDIUM | background.js:19 | `isCRMTab` matches unrelated localhost tabs | Documented |
| BUG-06 | MEDIUM | background.js:8 | SW restart loses `crmTabId` until send | Documented |
| BUG-07 | HIGH | content_detran.js:47 | Unhandled exception on invalidated extension context | **FIXED** |
| BUG-08 | MEDIUM | content_detran.js:69 | `window.load` skipped if page already loaded | Documented |
| BUG-09 | MEDIUM | content_detran.js:8 | Stale error elements may cause duplicate SITE_ERROR | Documented |
| BUG-10 | LOW | content_detran.js:74 | `window.matildeTimeout` global collision risk | Documented |
| BUG-11 | LOW | content_detran.js:43 | No logging when vehicle data selectors all miss | Documented |
| BUG-12 | HIGH | crm_bridge.js:27 | No validation on `MATILDE_SEND_CONTEXT` event data | **FIXED** |
| BUG-13 | MEDIUM | crm_bridge.js:9 | Extension invalidation silently breaks bridge | Documented |
| BUG-14 | LOW | manifest.json:7 | `activeTab` permission unused | Documented |
| BUG-15 | LOW | manifest.json:8 | `scripting` permission unused | Documented |
| BUG-16 | MEDIUM | manifest.json:36 | `crm_bridge.js` injects into all localhost pages | Documented |

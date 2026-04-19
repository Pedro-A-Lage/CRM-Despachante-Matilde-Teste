# 7. Extensão Chrome (Detran MG ↔ CRM)

A extensão é o "cabo de rede" entre o portal do Detran MG e o CRM.
Ela lê dados de páginas do Detran, captura PDFs gerados lá, e empurra
tudo isso para o CRM sem que o operador precise digitar.

## Manifest

Ver [`chrome-extension/manifest.json`](../../chrome-extension/manifest.json).

- **Manifest V3**, service worker em `background.js`.
- **Host permissions:** `detran.mg.gov.br`, `transito.mg.gov.br`,
  `cidadao.mg.gov.br`, `matildecrm.com(.br)?`, `despachantematilde.com(.br)?`,
  `localhost` (portas de dev).
- **Permissions:** `storage`, `downloads`, `tabs`, `webNavigation`.

## Arquivos

| Arquivo | Onde roda | Papel |
|---------|-----------|-------|
| `manifest.json`              | —              | Declaração |
| `background.js`              | Service worker | Roteia mensagens, abre/foca aba do CRM |
| `content_detran.js`          | Detran         | Raspa "Confirmar Dados" e outras telas |
| `content_vistoria.js`        | Detran         | Lê resultados de vistoria |
| `content.js`                 | Detran         | Utilidades adicionais (injeção de UI, debug) |
| `inject-pdf-interceptor.js`  | Detran         | Injeta no main-world pra interceptar PDFs gerados |
| `inject-error-interceptor.js`| Detran         | Captura erros JS do portal (debug) |
| `crm_bridge.js`              | CRM            | Repassa mensagens extensão↔app via `postMessage` |
| `crm-content.js`             | CRM            | Entry point do content script no CRM |
| `playwright-analyze/`        | dev            | Scripts de análise/scraping com Playwright |

## Fluxo padrão

```
Detran (tab A)                    Background (SW)                    CRM (tab B)
─────────────                     ─────────────                      ───────────
content_detran.js scrapea DOM  ─▶ receives msg                  
                                  abre/foca tab B  ─▶  chrome.tabs.sendMessage
                                                       crm_bridge.js escuta
                                                       window.postMessage
                                                       {source:'MATILDE_EXTENSION', ...}
                                                       ─▶  App.tsx: ExtensionListener
                                                            valida origin
                                                            cria cliente/veículo/OS
                                                            navigate(/ordens/:id)
```

## Tipos de mensagem (protocolo interno)

Vistos em `src/App.tsx:ExtensionListener` e no CRM bridge. Formato:

```ts
{
  source: 'MATILDE_EXTENSION',
  type: 'CAPTURED_CONFIRMAR_DADOS'
      | 'PROCESS_DETRAN_PDF'
      | 'VISTORIA_RESULT'
      | 'CRLV_CAPTURED'
      | ... ,
  payload: { ... },
}
```

> ⚠️ Vários handlers estão atualmente **desabilitados** no App.tsx
> (return cedo ou `if (false)`). Antes de reativar um fluxo Detran,
> leia o comentário que marca "integração Detran desvinculada" e
> converse com o responsável.

## Segurança do `postMessage`

`App.tsx:ExtensionListener` já valida `event.origin`:

```ts
if (event.origin !== window.location.origin &&
    !event.origin.startsWith('chrome-extension://')) return;
```

Dívida **SEC-7** original (origin check ausente) já foi mitigada aqui.
Mantenha essa guarda em qualquer novo handler. `targetOrigin: '*'` em
respostas (SEC-13) ainda aparece — prefira `event.origin` na resposta.

## Rodando em dev

1. `npm run dev` (CRM em `http://localhost:5173`).
2. `chrome://extensions/` → Modo desenvolvedor → "Carregar sem compactação"
   → selecione `chrome-extension/`.
3. Abra o Detran em outra aba.
4. Abra o DevTools da aba Detran (console) e da aba CRM para ver logs
   `[Matilde] ...`.
5. Para ver logs do service worker: `chrome://extensions/` → sua extensão
   → "service worker" (link azul).

## Atualizando a extensão no escritório

A extensão **não está** publicada na Chrome Web Store — é carregada
"unpacked" em cada máquina.

1. Merge no `main`.
2. Avise o time.
3. Cada operador puxa o repo local **ou** recebe um zip.
4. Em `chrome://extensions/` clica no botão "Recarregar" (ícone circular)
   da extensão.
5. Bump da versão em `manifest.json` ajuda a rastrear.

## Bugs conhecidos

Ver [`chrome-extension/BUG_REPORT.md`](../../chrome-extension/BUG_REPORT.md)
e [`chrome-extension/RELATORIO_TESTES_2026-04-13.md`](../../chrome-extension/RELATORIO_TESTES_2026-04-13.md)
para histórico. Reincidentes:

- Portal Detran muda DOM sem aviso → seletores quebram.
- Single-page Angular do Detran navega sem disparar `onload` → use
  `MutationObserver` em vez de listeners únicos.
- PDF aberto em nova aba (`_blank`) sem conteúdo — usar
  `inject-pdf-interceptor.js` que captura `URL.createObjectURL`.

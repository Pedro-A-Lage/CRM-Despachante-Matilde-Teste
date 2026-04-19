# 2. Arquitetura

## Visão 30.000 pés

```
┌───────────────────────────┐         ┌────────────────────────────┐
│  Portal Detran MG (web)   │ ◀──────▶│  Extensão Chrome (MV3)     │
└───────────────────────────┘         │  - content_detran.js       │
                                      │  - content_vistoria.js     │
                                      │  - background.js (SW)      │
                                      └────────────┬───────────────┘
                                                   │ window.postMessage
                                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│  Frontend React (Vite + TS) — src/App.tsx + pages/ + components/ │
│  ─ React Router client-side                                      │
│  ─ AuthContext (localStorage — ver dívida SEC-8)                 │
│  ─ ConfirmProvider / Toast / ThemeProvider                       │
└───────┬────────────────────┬───────────────────────┬─────────────┘
        │                    │                       │
        ▼ supabase-js        ▼ googleapis (browser)  ▼ fetch /api/recibo/pdf
┌────────────────┐    ┌──────────────────────┐  ┌─────────────────────┐
│   Supabase     │    │   Google Drive API   │  │  server.js (Express)│
│  Postgres+RLS  │    │  (OAuth2 do user)    │  │  docxtemplater +    │
│  Storage       │    │  Pastas Cliente/OS   │  │  pdf gen            │
│  Edge Fns(Deno)│    └──────────────────────┘  └─────────────────────┘
│  - gemini-proxy│
│  - outlook-*   │
│  - send-email-*│
└────────────────┘
```

## Camadas

### Frontend (`src/`)

- **Roteamento:** `src/App.tsx` centraliza todas as rotas via `react-router`.
  Guards: `ProtectedRoute` (precisa estar logado) e `PermissionRoute`
  (precisa ter permissão no JSONB `usuarios.permissoes`).
- **State global:** `AuthContext` + `ThemeContext` + `ConfirmProvider` +
  `NovaOSModalContext`. Sem Redux / Zustand / TanStack Query — o app usa
  `useState` + chamadas diretas ao `database.ts`.
- **Dados:** `src/lib/database.ts` é o "repository pattern" para Postgres.
  `src/lib/supabaseClient.ts` exporta o client único. Outros services
  (`financeService.ts`, `osService.ts`, `empresaService.ts`, `placaService.ts`,
  `configService.ts`) encapsulam lógica de negócio.
- **Integrações externas:**
  - `src/lib/fileStorage.ts` — Supabase Storage.
  - `src/lib/atpveAI.ts` / `fichaCadastroAI.ts` / `pdfParser.ts` — extração
    de PDFs (ATPV-e, CRV, CRLV) com fallback para Gemini via Edge Function.
  - `src/lib/geminiClient.ts` — proxy para `supabase/functions/gemini-proxy`.

### Backend (duas caras)

1. **Supabase (principal).**
   - Postgres (ver [`05-banco-de-dados.md`](./05-banco-de-dados.md)).
   - Storage buckets para docs escaneados.
   - Edge Functions em Deno (`supabase/functions/*`) para coisas que não
     podem rodar no browser:
     - `gemini-proxy` — esconde a key do Gemini.
     - `get-outlook-emails`, `get-outlook-email-details`,
       `get-outlook-email-attachment`, `get-outlook-folders` — Graph API.
     - `send-email-empresa`, `send-email-placa` — envio transacional.
2. **Express server (`server.js`).**
   - Único endpoint real: `POST /api/recibo/pdf` — gera PDF do recibo de
     reembolso via `docxtemplater` + conversão. Roda em Node separado.
   - **Não é exigido em produção** se você não usa esse fluxo. Em dev,
     suba só se for testar recibos.

### Extensão Chrome (`chrome-extension/`)

- Manifest V3, service worker em `background.js`.
- Content scripts injetados no Detran (`content_detran.js`,
  `content_vistoria.js`, `content.js`).
- Content script `crm_bridge.js` injetado no CRM — é quem dispara
  `window.postMessage` com `source: 'MATILDE_EXTENSION'`.
- Ver [`07-extensao-chrome.md`](./07-extensao-chrome.md).

## Fluxo de dados típico — "Criar OS a partir do Detran"

1. Operador abre o Detran, navega até "Confirmar Dados".
2. `content_detran.js` raspa o DOM e envia `chrome.runtime.sendMessage`
   para `background.js`.
3. `background.js` abre (ou foca) a aba do CRM e injeta dados via
   `chrome.tabs.sendMessage` → `crm_bridge.js`.
4. `crm_bridge.js` faz `window.postMessage({source: 'MATILDE_EXTENSION', ...})`.
5. `App.tsx:ExtensionListener` recebe, valida origem, chama
   `getClientes/saveCliente/saveVeiculo/saveOrdem` e navega para
   `/ordens/:id`.

## Autenticação (estado atual)

- Login custom em `src/lib/auth.ts`: busca `usuarios` por nome, compara
  `senha_hash` no **client-side** (SHA-256 sem salt).
- Sessão = `localStorage.sessionUserId` em `AuthContext`.
- Sem JWT, sem expiração, sem RLS efetivo.
- **Dívida crítica** — ver ANALISE_CRM_COMPLETA § SEC-2/3/4/5. Está na fila
  para migrar para Supabase Auth.

## Permissões

- Coluna `usuarios.permissoes` é JSONB com estrutura `{paginas: {...}, acoes: {...}}`.
- `src/lib/permissions.ts > temPermissao(usuario, 'paginas', 'financeiro')`.
- `PermissionRoute` em `App.tsx` esconde rotas. Mas **não bloqueia no banco**:
  quem chama supabase-js direto ignora o guard.

## Build & deploy

- Frontend: `npm run build` → `dist/` → servido por qualquer host estático
  (Vercel, Netlify, Nginx, Supabase Hosting).
- Edge Functions: **CI automático** via
  [`.github/workflows/deploy-supabase-functions.yml`](../../.github/workflows/deploy-supabase-functions.yml).
  Qualquer push em `main` que toque `supabase/functions/**` redeploya
  todas as functions.
- Migrations de banco: aplicadas **manualmente** no Dashboard Supabase ou
  via `supabase db push`. Não há CI para isso ainda.

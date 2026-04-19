# 1. Setup do Ambiente

## Pré-requisitos

| Ferramenta | Versão mínima | Por quê |
|------------|---------------|---------|
| Node.js    | **22.x** (ver `package.json > engines`) | Vite 6 + ESM |
| npm        | **10.x** | Lockfile v3 |
| Git        | qualquer recente | Controle de versão |
| Google Chrome | recente | Testar a extensão |
| Conta Supabase | — | Banco + Storage + Edge Functions |
| Conta Google Cloud | opcional | OAuth2 para Google Drive |

macOS/Linux: use `nvm` para travar a versão do Node.
Windows: WSL2 é recomendado (scripts shell esperam bash).

## Clonar e instalar

```bash
git clone <url-do-repo> crm-despachante-matilde
cd crm-despachante-matilde
npm install
```

## Variáveis de ambiente

Copie o template e preencha:

```bash
cp .env.example .env
```

Variáveis lidas em build (inlined no bundle — **não coloque segredos de
verdade aqui**, pois viram texto plano no JS público):

```env
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
# opcional, só se rodar server.js em paralelo
VITE_API_TARGET=http://localhost:3000
```

> ⚠️ Consulte [`/ANALISE_CRM_COMPLETA.md`](../../ANALISE_CRM_COMPLETA.md) §
> SEC-1/SEC-9. A chave anon atualmente concede acesso total. Peça ao
> responsável técnico um projeto Supabase **de dev** — nunca use produção
> para rodar local.

Segredos que vivem **fora** do `.env` (GitHub Actions / painel Supabase):

- `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF` — deploy das Edge Functions.
- `GEMINI_API_KEY` — usado por `supabase/functions/gemini-proxy` (AI
  extração de PDF).
- Credenciais Outlook/Gmail OAuth — módulo de e-mails
  (`scripts/get-outlook-refresh-token.mjs`, `get-gmail-token.mjs`).

## Rodar o app

```bash
npm run dev          # Vite dev server em http://localhost:5173
npm run build        # tsc -b && vite build (gera dist/)
npm run preview      # serve o dist localmente
npm start            # node server.js — endpoint /api/recibo/pdf (Express)
```

O `server.js` só é necessário para gerar o PDF do recibo de reembolso
(`/api/recibo/pdf`). Para o resto do CRM, `npm run dev` basta.

## Banco de dados local

O app **não roda com Postgres local**: depende direto do Supabase. Ou você:

1. Usa um projeto Supabase de dev compartilhado (recomendado para começar), **ou**
2. Cria um projeto Supabase próprio → executa `supabase-schema.sql` e todas
   as `migrations/*.sql` em ordem → aplica as `supabase/functions/**` via CLI.

> `supabase-schema.sql` está **desatualizado** (ver ANALISE_CRM_COMPLETA §
> DB-1). Use-o como base e aplique todas as migrations depois.

### Reset rápido (banco de dev)

```bash
node reset-db.js     # zera clientes/veiculos/ordens
node reset-os.js     # zera só ordens
```

**Nunca rode esses scripts apontando para o banco de produção.** Eles leem
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` do `.env`.

## Extensão Chrome

1. Abra `chrome://extensions/`.
2. Ative "Modo do desenvolvedor".
3. "Carregar sem compactação" → aponte para `chrome-extension/`.
4. Abra o CRM em `http://localhost:5173` — o `crm_bridge.js` é injetado
   automaticamente nas origens listadas em `manifest.json`.

Ver [`07-extensao-chrome.md`](./07-extensao-chrome.md) para detalhes.

## Checklist "rodou a primeira vez"

- [ ] `npm run dev` abre sem erro e renderiza `/login`.
- [ ] Login com usuário de teste do banco dev funciona.
- [ ] Lista de OS carrega sem erros no console.
- [ ] Dark mode alterna (botão no topo direito).
- [ ] Build `npm run build` termina sem erros TS.

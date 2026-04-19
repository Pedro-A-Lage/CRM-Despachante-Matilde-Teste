# Deployment

> Como o código sai da sua máquina e vai pro escritório usar.

---

## Visão geral — 3 componentes deployáveis

```
┌────────────────────────────┐   ┌──────────────────────────┐
│  Front (Vite SPA)          │   │  Edge Functions (Deno)   │
│  dist/ → hosting estático   │   │  Supabase → deploy GH    │
│  (manual)                  │   │  Action automatizada     │
└────────────────────────────┘   └──────────────────────────┘
┌────────────────────────────┐   ┌──────────────────────────┐
│  server.js (Express)       │   │  Chrome Extension        │
│  Node runtime (onde houver) │   │  chrome-extension.zip    │
│  opcional                  │   │  upload manual Web Store  │
└────────────────────────────┘   └──────────────────────────┘
```

---

## 1. Front — SPA

### Build

```bash
npm run build
```

Output em `dist/`. É estático puro (HTML + JS + CSS + assets). Pode ser
servido por qualquer hosting — Netlify, Vercel, Cloudflare Pages, nginx
próprio.

Configuração necessária no hosting:

- **SPA fallback** — toda rota 404 deve servir `index.html`. Sem isso, F5
  numa rota interna (`/os/123`) retorna 404.
- **Variáveis VITE_*** já embutidas no build (não configure no runtime).

### Variáveis de ambiente no build

Preenchidas em `.env` **antes** do `npm run build`:

```env
VITE_SUPABASE_URL=https://<projeto-prod>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-prod>
```

⚠️ Valores embutidos no JS final. Para dev/staging/prod, **rode builds
separados** com `.env` diferente.

### Versionamento

Cada build deveria carimbar a versão do `package.json` em algum lugar visível
(footer, about) — hoje não faz. TODO.

---

## 2. Edge Functions — Supabase

### Automação já existente

GitHub Action em
[`.github/workflows/deploy-supabase-functions.yml`](../../.github/workflows/deploy-supabase-functions.yml)
dispara automaticamente quando:

- Push em `main` tocando `supabase/functions/**`.
- Workflow manual via GitHub UI (`workflow_dispatch`).

O que ele faz:

```yaml
for dir in supabase/functions/*/; do
  supabase functions deploy "$name" --project-ref "$SUPABASE_PROJECT_REF"
done
```

### Secrets necessários no repo

Configurados em **Settings → Secrets and variables → Actions**:

| Secret                    | Valor                                         |
| ------------------------- | --------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`   | Token pessoal (ou de service account) da CLI  |
| `SUPABASE_PROJECT_REF`    | Ref do projeto (`xyzabc123`)                  |

### Secrets dentro das functions

Cada function pode ter seus próprios secrets (chave da Gemini, OAuth do
Outlook). Defina via CLI:

```bash
npx supabase secrets set GEMINI_API_KEY=... --project-ref <ref>
npx supabase secrets set OUTLOOK_CLIENT_ID=... --project-ref <ref>
```

Ou pelo Dashboard do Supabase → Edge Functions → Secrets.

---

## 3. Migrations do banco

**Não automatizadas** hoje. Processo manual:

### Em staging

```bash
npx supabase db push --db-url "postgresql://postgres:...@db.<staging>.supabase.co:5432/postgres"
```

Ou aplique uma migration específica via SQL Editor do Supabase Dashboard.

### Em produção

Mesma coisa, com cuidado extra:

1. Staging tem que estar green.
2. Agende janela.
3. Backup antes (`pg_dump` via Dashboard).
4. Aplica.
5. Smoke test de 5 minutos.

Ver [`05-architecture/02-database-schema.md`](../05-architecture/02-database-schema.md).

---

## 4. Express server (server.js)

Opcional. Só necessário se for gerar recibo PDF fora do browser.

```bash
node server.js
# ouve em PORT ou 3000
```

Hosting: Fly.io, Render, Railway — qualquer runtime Node. Precisa de Node 22+.

Variáveis de ambiente: a mesma anon key do Supabase se for fazer upload
direto. Hoje o endpoint `/api/recibo/pdf` é stateless — não precisa DB.

⚠️ Se não tem Node hospedado, a geração de recibo cai pro modo in-browser
(docxtemplater roda no client). Hoje o default é o modo client.

---

## 5. Chrome Extension

### Build

Não tem build. É JS puro em `chrome-extension/`.

### Distribuição

Duas opções:

**A) Modo desenvolvedor** (dev e produção interna)
- Dev abre `chrome://extensions/`, modo dev, carrega sem compactação.
- Simples, sem burocracia.
- Não recomendado pra escritório grande (cada máquina precisa reinstalar a
  cada versão).

**B) Chrome Web Store privado**
- Zipar `chrome-extension/`, subir no Web Store, publicar como "privado"
  (só o domínio do escritório).
- Requer conta de dev (US$ 5 one-time).
- Update automático.

Hoje usamos **A**. Futuro próximo: migrar pra B.

### Versionamento

`chrome-extension/manifest.json` tem campo `version`. Bump em cada release.
Padrão semver simplificado (`1.2.3`).

---

## Ambientes

| Ambiente    | URL front                    | Supabase project      |
| ----------- | ---------------------------- | --------------------- |
| Dev local   | http://localhost:5173/       | dev-project           |
| Staging     | (configurar)                 | staging-project       |
| Produção    | (configurar)                 | prod-project          |

Staging usa **dados anonimizados** copiados da produção periodicamente.
Jamais teste em produção.

---

## Ordem de release

Se tem mudança em todos:

1. **Migration do banco** (staging → prod).
2. **Edge Functions** (via GH Action).
3. **Front** (build + deploy estático).
4. **Extensão Chrome** (bump versão, redistribuir).

Se misturar, o front pode chamar function antiga / nova função chamar tabela
que não existe. Ordem importa.

---

## Rollback

- **Front** — redeploy do build anterior (guarde os `dist/` carimbados com
  versão).
- **Edge Functions** — `supabase functions deploy` com tag antiga ou `git
  revert` + push (action re-deploya).
- **Banco** — tem que ter migration de "undo" preparada. Se não tem,
  restaure backup.
- **Extensão** — reinstale versão anterior.

---

## Checklist de release

- [ ] `npm run build` passa local.
- [ ] Migration testada em staging.
- [ ] Smoke test manual em staging completo.
- [ ] PRs da release todos aprovados e mergeados.
- [ ] Tag no Git (`v1.2.3`).
- [ ] Bump version em `package.json` e `chrome-extension/manifest.json`.
- [ ] Anúncio no canal `#deploys`.

---

## Para onde queremos ir

- CI no GitHub Actions rodando em **todo PR** (type-check + futuros testes).
- Deploy automático do front via GitHub Action + Cloudflare Pages.
- Migrations automatizadas com `supabase db push` no mesmo workflow.
- Carimbo de versão visível no CRM ("v1.2.3 · build abc123").

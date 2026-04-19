# 8. Troubleshooting, FAQ e Pegadinhas

## Erros comuns rodando `npm run dev`

### `Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY`
Você não copiou o `.env.example` para `.env`, ou o Vite não recarregou.
Pare o dev server, ajuste o `.env`, rode de novo.

### Tela branca, console mostra `fetch` para Supabase falhando com CORS
Sua URL em `VITE_SUPABASE_URL` está errada ou aponta para um projeto que
não existe. Confira no Dashboard Supabase → Settings → API.

### `Cannot find module '../lib/database'` ou erros TS aleatórios
- Rode `rm -rf node_modules package-lock.json && npm install`.
- Certifique Node **22.x** (`.nvmrc`/`engines`). Versões mais antigas
  quebram Vite 6.

## Login / Auth

### "Usuário ou senha inválidos" mas está certo
- Confira a tabela `usuarios` do projeto Supabase **apontado no .env**.
  Dev e prod são banco diferentes.
- O hash é SHA-256 simples (dívida SEC-3). Se precisar criar um usuário
  de teste por SQL:
  ```sql
  -- senha "teste" → hash abaixo é só exemplo; calcule com o hashSenha() do app
  ```
  Prefira criar o usuário pela UI (`/usuarios`) em um ambiente onde já
  há um admin.

### Fiquei deslogado sem aviso
Sessão é `localStorage.sessionUserId` sem expiração (SEC-8). Alguém limpou
localStorage ou usou aba anônima.

## Supabase

### "RLS policy violation"
Quase nunca acontece porque as policies estão abertas (`USING (true)`).
Se **acontecer**, alguém finalmente fechou RLS em uma tabela. Veja
policies no Dashboard ou na migration recente.

### Migration nova não "pegou" em produção
Deploy de Edge Function é automatizado, **deploy de SQL não é**. Rode
manual: `supabase db push` ou cole no SQL Editor.

### Edge Function retorna 500
Logs: Dashboard → Edge Functions → `<nome>` → Logs. Causa típica:
secret faltando (`GEMINI_API_KEY`, tokens Outlook). Configure em
Project Settings → Edge Functions → Secrets.

## Extensão Chrome

### Extensão "não faz nada"
1. `chrome://extensions/` → sua extensão ativa?
2. Service worker tá rodando? Se mostra "inactive", clique em "service
   worker" para abrir console e acordar.
3. A URL do CRM está em `host_permissions` do manifest?
4. O `crm_bridge.js` está sendo injetado? Confira via
   DevTools → Sources → Content Scripts.

### Mensagens da extensão não chegam no CRM
- Abra console na aba do CRM, procure `[Matilde]` logs.
- A origem da mensagem é validada em `App.tsx`. Se o `event.origin` não
  bater com `window.location.origin` **nem** começar com
  `chrome-extension://`, a mensagem é descartada silenciosamente.

### PDF do Detran não é capturado
O Detran gera PDFs via `Blob` + `URL.createObjectURL`. O
`inject-pdf-interceptor.js` precisa estar listado em
`web_accessible_resources` — confira se você não removeu a entrada.

## Financeiro

### Pagamento aparece em OS deletada
Bug conhecido FIN-1. A deleção filtra pagamentos por `charge_id IN (...)`
mas `charge_id` pode ser `NULL`. Corrija por `os_id`.

### `total_pago` diferente da soma dos pagamentos
Floating-point (FIN-5). Evite somar em JS — deixe Postgres somar
(`SUM(valor)::NUMERIC`). Ou use `Decimal.js` no app (ainda não
adicionado — seria uma boa introdução).

### Cards mostram honorário negativo
`financeService.ts:calcularResumo` não aplica `Math.max(0, ...)`
(FIN-4). OK visualmente em alguns casos, mas atrapalha filtro.

## Workflow / UI

### Consigo pular de "aguardando_documentacao" direto para "entregue"
Bug conhecido WF-1. Transições não são validadas. Se você está fixando:
adicione validação em `osService.ts` **e** no componente Kanban
(`OSKanban.tsx`).

### CSS de algumas páginas parece "furado", fundo transparente
Bug UI-1: CSS inválido com parêntese duplo `var(--notion-surface))` em
`Financeiro.tsx`, `OSDetail.tsx`, `RecebimentoModal.tsx`. Conserto: apagar
o parêntese extra.

### `alert()` em vez de toast
Dívida ERR-4. Troque por `useToast().showToast()`.

## Import / Backup

### Backup importado mas metade dos dados sumiu
Bug FIN-3 + DATA-4: `exportAllData` **não inclui** finance, e erros de
upsert no import são engolidos silenciosamente. Antes de "restaurar",
exporte um SQL dump direto do Supabase como segurança.

### Import de CSV do Notion gerando clientes duplicados
Bug DATA-2/DATA-3. `import-notion.js` tem parser CSV ingênuo (quebra com
vírgulas dentro de aspas) e sobrescreve `cliente_id` na upsert por placa.
Reescreva com `csv-parse` antes de usar em volume.

## "Isso é bug ou é feature?"

Quando em dúvida, consulte nesta ordem:

1. [`/ANALISE_CRM_COMPLETA.md`](../../ANALISE_CRM_COMPLETA.md) — catálogo
   de 68 falhas com severidade.
2. [`/ANALISE_BANCO.md`](../../ANALISE_BANCO.md) — análise de banco.
3. [`/REVIEW_FINANCEIRO.md`](../../REVIEW_FINANCEIRO.md) — revisão
   específica do módulo financeiro.
4. [`/docs/analise-modulo-financeiro.md`](../analise-modulo-financeiro.md)
   — análise mais detalhada do financeiro.
5. `git log --grep="<palavra-chave>"` — por que foi feito assim.
6. O dono do produto.

## Logs úteis

```bash
# listar migrations aplicadas (via CLI supabase)
supabase migration list

# rodar Edge Function local
supabase functions serve gemini-proxy --env-file .env.local

# ver erros TS sem rodar o build inteiro
npx tsc --noEmit
```

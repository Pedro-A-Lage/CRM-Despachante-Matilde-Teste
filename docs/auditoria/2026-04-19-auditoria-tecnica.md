# Auditoria Técnica Avançada — 2026-04-19

> Consolidação de 6 auditorias paralelas (segurança, integridade de dados,
> financeiro, arquitetura React, extensão Chrome, PDF/AI + Edge Functions).
> Achados novos + confirmação de regressões do catálogo em
> [`/ANALISE_CRM_COMPLETA.md`](../../ANALISE_CRM_COMPLETA.md).
>
> **Método:** 6 subagentes Explore independentes, cada um com escopo
> delimitado e instrução de referenciar `arquivo:linha`.

---

## Resumo executivo

| Categoria | Novos | Regressões confirmadas | Bloqueador pra prod? |
|-----------|-------|------------------------|----------------------|
| Segurança                 | 10 | SEC-2, SEC-3, SEC-8, SEC-13 persistem | **SIM** |
| Integridade de dados      | 4  | WF-3 (race numero OS) persiste | **SIM** |
| Financeiro                | 5  | FIN-6 persiste; FIN-1..FIN-5 corrigidos | Sim (relatório mente) |
| Arquitetura React         | 10 | CODE-5, CODE-6 persistem | Não, mas trava dev |
| Extensão Chrome           | 5  | postMessage parcialmente mitigado | Sim (forjável) |
| PDF/AI + Edge Functions   | 11 | PDF-1..PDF-5 persistem | **SIM** |

**Total:** ~45 achados novos + regressões prioritárias confirmadas.

**4 blockers absolutos para qualquer ambiente com dados reais:**

1. **Edge Functions Outlook/Gmail sem autenticação** (CORS `*` + sem JWT
   check) — **qualquer pessoa na internet lê e envia e-mails** em nome do
   escritório. Ver [P0-1](#p0-1-edge-functions-outlookgmail-sem-auth).
2. **`send-email-placa` com SSRF** via `pdfUrl` sem validação — lê
   `file:///etc/passwd`, metadados AWS/GCP, recursos de LAN. Ver
   [P0-2](#p0-2-ssrf-em-send-email-placa).
3. **RLS aberto** em todas as tabelas + hash SHA-256 sem salt + sessão
   naked em localStorage — um clone do bundle é um admin. Ver
   [P0-3](#p0-3-rls-aberto-auth-custom-quebrada).
4. **Credenciais OAuth hardcoded** em `scripts/get-outlook-refresh-token.mjs`
   (client_id + client_secret). Ver [P0-4](#p0-4-oauth-client-secret-hardcoded).

---

## P0 — Críticos (bloqueador de produção)

### P0-1. Edge Functions Outlook/Gmail sem auth

**Arquivos:** `supabase/functions/get-outlook-*/index.ts`,
`send-email-empresa/index.ts`, `send-email-placa/index.ts`,
`gemini-proxy/index.ts`.

- `Access-Control-Allow-Origin: '*'` em todas.
- Nenhuma valida `Authorization` header / Supabase JWT.
- Secrets (refresh token, Gemini key) estão corretos server-side, mas o
  **endpoint público expõe o recurso**: qualquer chamada anônima lê
  inbox, envia e-mail, consome quota Gemini.

**Impacto:** Vazamento total de correspondência empresarial; uso da
identidade do escritório para phishing; fatura Gemini incontrolável.

**Fix (≤ 4h):**
```ts
const authHeader = req.headers.get('authorization');
const { data: { user } } = await supabase.auth.getUser(authHeader?.replace('Bearer ', ''));
if (!user) return new Response('Unauthorized', { status: 401 });
```
CORS: trocar `*` por origem específica (`https://matildecrm.com` /
`http://localhost:5173`).

### P0-2. SSRF em `send-email-placa`

**Arquivo:** `supabase/functions/send-email-placa/index.ts:54-66`.

```ts
const { pdfUrl } = await req.json();
await fetch(pdfUrl); // ← sem validação
```

Atacante envia `pdfUrl: "http://169.254.169.254/latest/meta-data/"` ou
`file:///etc/passwd` → conteúdo vai parar no e-mail saindo pela conta
corporativa.

**Fix:** parsear URL, exigir `https:`, bloquear loopback/private ranges
e aceitar apenas domínios whitelisted (Supabase Storage do projeto).

### P0-3. RLS aberto + auth custom quebrada

Catálogo SEC-2/3/4/5/8 — **todos ainda ativos** (confirmado no audit de
segurança). Resumo:

- `RLS ... USING (true) WITH CHECK (true)` em todas as tabelas,
  incluindo `usuarios`.
- `senha_hash = SHA-256(senha)` sem salt — vulnerável a rainbow tables.
- Hash do usuário **baixa para o browser** pra comparar — basta abrir
  DevTools e ler.
- `sessionUserId` em `localStorage` sem expiração nem assinatura.

**Fix de fundo (1–2 sprints):** migrar para Supabase Auth. Paliativo
imediato: rotacionar anon key, criar policies por `auth.uid()` nas
tabelas mais sensíveis (`usuarios`, `finance_charges`, `payments`).

### P0-4. OAuth client_secret hardcoded

**Arquivo:** `scripts/get-outlook-refresh-token.mjs:25-27`.

`CLIENT_ID` + `CLIENT_SECRET` Azure AD em texto plano no repo.

**Fix:** remover do arquivo, ler de env, rotacionar o secret no Azure,
`git filter-repo` se o repo for público/mirrorado.

---

## P1 — Alta prioridade

### P1-1. Race em `numero` da OS (WF-3 persiste, agora PIOR)

**Arquivo:** `src/lib/database.ts` (cálculo `MAX+1`) +
`migrations/20260405000004_renumerar_os.sql:13` (dropou o `SERIAL`).

O catálogo apontava inconsistência entre SERIAL e cálculo manual. A
migration recente **removeu o SERIAL** sem criar trigger atômica, então
hoje **apenas** o cálculo manual existe. Duas criações simultâneas
geram OSs com mesmo número.

**Fix (migration + 1 linha de código):**
```sql
CREATE SEQUENCE IF NOT EXISTS ordens_de_servico_numero_seq
    START WITH (SELECT COALESCE(MAX(numero), 0) + 1 FROM ordens_de_servico);
ALTER TABLE ordens_de_servico
    ALTER COLUMN numero SET DEFAULT nextval('ordens_de_servico_numero_seq');
```
E apagar o `MAX+1` do `database.ts`.

### P1-2. Fresh install do banco está quebrado (DB-1 agravado)

`supabase-schema.sql` cobre apenas 5 das ~14 tabelas usadas. Faltam:
`usuarios`, `finance_charges`, `payments`, `service_config`,
`service_prices`, `price_table`, `empresas_parceiras`, `fabricas_placas`,
`pedidos_placa` + várias colunas de `veiculos` (ano_fabricacao, cor,
combustivel…).

**Fix:** regenerar `supabase-schema.sql` a partir do estado atual do
banco (`pg_dump --schema-only`) OU adotar só migrations e apagar o
schema base.

### P1-3. Relatório financeiro ignora filtro de datas

**Arquivo:** `src/lib/financeService.ts:508-558` (`getRelatorio`).

Ordens são filtradas por `criado_em`, mas a query de `finance_charges`
não aplica filtro de data — retorna **histórico inteiro**, inflando
margem/lucro exibidos.

**Impacto:** relatórios enviados a decisões já estão errados.

**Fix:** `.gte('criado_em', inicio).lte('criado_em', fim)` na query de
charges.

### P1-4. `confirmarTodosDaOS` sem atomicidade

**Arquivo:** `src/lib/financeService.ts:707-734`.

Loop sequencial de UPDATEs; se o 3º falha, os dois primeiros já estão
"pagos". Estado misto permanente.

**Fix:** batch `UPDATE ... WHERE id IN (...)` em um comando, ou stored
procedure. Adicionar retry idempotente.

### P1-5. Duplo-clique = payment duplicado

**Arquivo:** `src/components/finance/RecebimentoModal.tsx:88-123`
+ `financeService.ts:397-423`.

`loading` é setado após primeiro clique, mas sem `useTransition` / guard
de UUID. Sob latência de rede → dois `addPayment` idênticos.

**Fix:** gerar UUID no cliente + constraint `UNIQUE(idempotency_key)` na
tabela `payments`.

### P1-6. Extension — `postMessage` / `onMessage` sem validar sender

**Arquivos:**
- `chrome-extension/crm_bridge.js:190` — `window.addEventListener('message', …)` sem `event.origin` check.
- `chrome-extension/background.js:183` — `chrome.runtime.onMessage` não
  valida `sender.id` / `sender.origin`, só confere a string
  `message.source === 'MATILDE_EXTENSION'` (forjável por qualquer content
  script).

**Impacto:** qualquer aba aberta dispara comandos no SW da extensão.

**Fix:** whitelist de origins no bridge; `sender.id === chrome.runtime.id`
no background.

### P1-7. CSV parser ingênuo em `import-notion.js`

**Arquivo:** `import-notion.js:40-52`. `split('\n')` + `split(',')`
quebra com campos entre aspas (DATA-2/DATA-3 persistem).

**Fix:** adotar `papaparse` ou `csv-parse`.

### P1-8. Upload sem validação MIME server-side

**Arquivo:** `src/lib/fileStorage.ts`.

Extensão do filename / `file.type` são **dicas do cliente**. Um PNG com
payload `<script>` pode ser renderizado pelo viewer.

**Fix:** validar "magic bytes" server-side (Edge Function de upload) +
whitelist de MIME real. Limite de tamanho.

### P1-9. OS: race de carregamento entre OSs

**Arquivo:** `src/pages/OSDetail.tsx:2674` e similares.

`useEffect` com deps incompletas e sem `AbortController`. Navegar rápido
entre OSs sobrescreve estado da nova com resposta antiga.

**Fix:** `AbortController` ou cancel-flag validando `order.id` atual.

### P1-10. Canvas assertion crashável no parser AI

**Arquivo:** `src/lib/fichaCadastroAI.ts:57` — `canvas.getContext('2d')!`.
Em memory-pressure retorna `null` → crash. Sem limite de tamanho antes do
Gemini.

**Fix:** branch explícita; rejeitar `file.size > 20MB`.

---

## P2 — Média prioridade

| # | Área | Arquivo:linha | Resumo |
|---|------|---------------|--------|
| P2-1  | Segurança | `server.js` | Sem CSP, sem Helmet, Express 5 alpha (downgrade para 4.18 LTS). |
| P2-2  | Segurança | `supabase/functions/send-email-empresa/index.ts:91` | Fetch de `anexo.url` sem whitelist — SSRF. |
| P2-3  | Segurança | `supabase/functions/send-email-empresa/index.ts:71-76` | `destinatarioEmails` sem whitelist — **open relay** para phishing. |
| P2-4  | Segurança | `src/App.tsx:238,322,330,489`, `pdfParser.ts:114-115` | `console.log` com CPF, placa, chassi em prod. |
| P2-5  | Extensão | `chrome-extension/background.js:157`, `crm_bridge.js:123,164` | Logs com PII também. |
| P2-6  | Extensão | `content_detran.js:374-388` | IDs hard-coded (`getElementById('placa')`, …) — qualquer redesign do Detran quebra a integração. |
| P2-7  | Extensão | `content.js` vs `content_detran.js` | ~50% de duplicação de lógica; consolidar. |
| P2-8  | Dados | `src/lib/database.ts:831-847` (`importAllData`) | Upsert de finance_charges sem Zod/schema — backup corrompido entra silenciosamente. |
| P2-9  | Dados | `migrations/20260405000002_fabricas_placas.sql:24-25` | FK `os_id` com `ON DELETE SET NULL` sem código que trate `null`. |
| P2-10 | Finance | `src/components/finance/FinancePainel.tsx:195-202` | `dataPrevista` só em `localStorage` (FIN-6 persiste). |
| P2-11 | Finance | `src/lib/financeService.ts:369-381` | `getPaymentsTotalByOSIds` usa `.in(...)` sem batching — 414 URI Too Long em dataset grande. |
| P2-12 | React | `src/pages/ProtocoloDiario.tsx:62` | `Promise.all` sem `.catch` — falha silenciosa de uma promise trava a UI. |
| P2-13 | React | `src/pages/OSList.tsx:195-202` | `setInterval` recriado a cada render → memory leak + requests concorrentes. |
| P2-14 | React | `src/components/NovaOSModal.tsx:35` | Estado residual entre aberturas (dados do cliente anterior). |
| P2-15 | PDF/AI | `pdfParser.ts:199,206` (regex renavam `\d{9,11}`) | Falso positivo em CPF/processo. |
| P2-16 | PDF/AI | `pdfParser.ts:186-189` (regex placa) | Não separa padrão antigo vs. Mercosul; aceita sequências fora do padrão. |
| P2-17 | PDF/AI | `supabase/functions/gemini-proxy/index.ts:70,100` | Logs com prompt → PII enviada a observability. |
| P2-18 | PDF/AI | `supabase/functions/gemini-proxy/index.ts:24-79` | Retry automático até 5x sem rate limit global. Risco de custo. |

---

## P3 — Baixa prioridade / limpeza

- **CODE-6** (216 `any`): prioritizar os que manipulam dinheiro/IDs
  primeiro.
- **UI-1** (CSS `var(--notion-surface))` com parêntese duplo) — trivial.
- **ERR-4** (25+ `alert()` misturados com Toast) — troca mecânica.
- **Dead code:** confirmar se `src/lib/storage.ts`, `supabaseStorage.ts`,
  `ds.ts` têm 0 imports e deletar.
- Extensão: definir `content_security_policy` explícita no manifest.
- Edge Functions: escopos Graph (`Mail.Read` vs. `Mail.ReadWrite`) —
  least privilege.

---

## Plano de correção sugerido (4 sprints)

### Sprint 1 — "Apagar o incêndio" (1 semana)
- P0-1: auth nas Edge Functions + CORS fechado.
- P0-2: whitelist de URL no `send-email-placa`.
- P0-4: rotacionar e remover OAuth client_secret do repo.
- P1-7: downgrade Express 4 LTS; adicionar Helmet.
- Triagem: adicionar `if (!import.meta.env.DEV)` em todos `console.log`
  com PII.

### Sprint 2 — Dados & Finanças (1 semana)
- P1-1: sequence/trigger para `numero` OS.
- P1-2: regenerar `supabase-schema.sql`.
- P1-3: filtro de data em `getRelatorio`.
- P1-4: batch UPDATE em `confirmarTodosDaOS`.
- P1-5: idempotência em `addPayment`.
- P2-8: Zod para `importAllData`.

### Sprint 3 — Auth real (1–2 semanas)
- P0-3: migração para Supabase Auth (login/sessão), políticas RLS por
  `auth.uid()` nas tabelas críticas (`usuarios`, `finance_*`,
  `ordens_de_servico`).
- Remover `src/lib/auth.ts` SHA-256 local.

### Sprint 4 — Qualidade e extensão (1 semana)
- P1-6: origin check em `crm_bridge.js` e `sender.id` check no SW.
- P1-9: `AbortController` em OSDetail.
- P1-10: limites de tamanho + branch sem `!` no canvas.
- P2-6/P2-7: consolidar content scripts + adotar seletores resilientes.
- Adicionar `npm run build` como GitHub Action.

---

## Metodologia

6 subagentes Explore executados em paralelo, cada um com:
- Escopo delimitado (segurança, integridade de dados, financeiro,
  arquitetura React, extensão, PDF+AI+functions).
- Instrução de citar `arquivo:linha`.
- Limite de 400–600 palavras no retorno para não floodar contexto.
- Acesso às ferramentas `ctx_*` para ler arquivos grandes sem custo.

Transcrições completas disponíveis nos logs de sessão. Este documento
consolida, deduplica e prioriza. Última revisão: 2026-04-19.

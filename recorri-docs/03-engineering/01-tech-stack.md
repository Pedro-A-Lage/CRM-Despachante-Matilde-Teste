# Stack técnica

> O "porquê" de cada escolha. Versões em [`package.json`](../../package.json).

---

## Front — React + Vite + TypeScript

### React 18

Por quê: ecossistema maduro, mão-de-obra disponível no mercado, suspense e
concurrent mode úteis para UI pesada (OSDetail tem >5000 linhas).

Não usamos: Next.js. Este CRM é uma **SPA pura** — não tem SEO, não tem fluxo
de page-routing tradicional, não compensa a complexidade do framework. Vite +
React Router resolve.

### Vite 6

Por quê: dev server instantâneo (HMR em ms), build Rollup-based, config
mínima. `vite.config.ts` tem apenas alias `@` → `src` e proxy `/api` para o
Express.

### TypeScript 5.6

Por quê: tipagem estática é essencial em domínio regulatório (OS tem 30+
campos, errar um quebra o processo real de um cliente). `tsconfig.app.json`
tem `strict: true` + `noUncheckedIndexedAccess: true` — acesso a array é
sempre `T | undefined`, força o dev a pensar.

Tipos compartilhados em [`src/types.ts`](../../src/types.ts) + extras em
[`src/types/`](../../src/types/) (empresa, finance, placa).

### React Router 6

Por quê: padrão de facto. Navegação 100% client-side. Ver `App.tsx` para as
rotas.

### Tailwind CSS 3 + shadcn/ui + CSS custom

Abordagem híbrida:

- **Tailwind** pra utilitários (padding, flex, grid, responsive).
- **CSS custom** (em `src/index.css`) pra design system (variáveis, componentes
  complexos — kanban, sidebar, modal).
- **shadcn/ui** pra primitivos acessíveis (Dialog, Select, Switch, Tabs) — ele
  copia o código pro projeto em vez de virar dependência opaca.

Tokens do design system vivem em `index.css` (CSS vars) **e** no
`tailwind.config.js`. As duas fontes precisam estar em sincronia.

### Radix UI

Base do shadcn — acessibilidade pronta (focus trap, keyboard nav). Usado em:
alert-dialog, dialog, label, select, slot, switch, tabs.

### Lucide React

Biblioteca única de ícones. Ver [`../02-design-system/06-icons.md`](../02-design-system/06-icons.md).

### date-fns 4

Formatação e manipulação de datas. Escolhido sobre moment (morto) e dayjs
(menos tree-shakable). Usar sempre via `import { format, parseISO } from
'date-fns'`.

### recharts 3

Gráficos do Dashboard. Leve, baseado em D3, API de componentes React.

### lib extras

- **docxtemplater + pizzip + docx** — gera recibos de reembolso em DOCX a
  partir de template com placeholders (ver `src/lib/reciboTemplate.ts`).
- **exceljs** — export de dados para Excel.
- **pdfjs-dist** — lê PDFs no client (checklist, laudo de vistoria).
- **file-saver** — dispara download do arquivo gerado.
- **@google/generative-ai** — cliente do Gemini pra extração de ATPV-e e
  ficha de cadastro (ver `atpveAI.ts`, `fichaCadastroAI.ts`).

---

## Back — Supabase + Express auxiliar

### Supabase (Postgres + Storage + Edge Functions + Auth)

Por quê: zero ops. Substituiria 4 serviços (Postgres, S3, serverless, OAuth).
Para um CRM pequeno-médio como este, o custo-benefício é imbatível.

Usamos:

- **Postgres** — todas as tabelas (clientes, veículos, OS, protocolos,
  usuarios, finanças, empresas).
- **Storage** — upload de PDFs (laudo, doc final, foto de protocolo assinado).
- **Edge Functions** (Deno) — integrações que precisam de secret (Gmail/Outlook
  OAuth, Gemini proxy). Ver `supabase/functions/*`.
- **RLS** — habilitado mas com policy `USING (true)` (acesso full com anon key).
  A autenticação real é feita no front via tabela `usuarios` custom. Ver
  [`05-architecture/04-security.md`](../05-architecture/04-security.md).

Não usamos: Supabase Auth (usuários reais). Temos nossa lógica em
`src/lib/auth.ts` + tabela `usuarios`. Motivo: queremos controlar roles e
permissões granulares (`admin`, `gerente`, `funcionario` + permissões por
página e ações na OS), e o Supabase Auth obrigaria cadastrar emails reais.

### Express 5 (server.js)

Por quê: precisamos de um endpoint Node com acesso ao file system (`multer`)
pra gerar recibo PDF a partir do template DOCX. Edge Function não serviria
(Deno não tem as libs nativas). Roda em `node server.js`, Vite faz proxy
`/api/*`.

Hoje tem 1 endpoint: `/api/recibo/pdf`.

---

## Integrações externas

### Google Drive (v3 REST)

OAuth2 direto no browser. Pastas `Clientes / Nome - CPF/CNPJ` e `OS #Número
- Serviço` criadas automaticamente. Wrapper: **não existe mais** como lib
separada (o arquivo `src/lib/googleDrive.ts` que aparece no README antigo
foi removido/refatorado — verificar antes de mexer).

### Chrome Extension (`chrome-extension/`)

Manifest V3. Lê o portal do Detran MG (página "Confirmar Dados" e "Resultados
de Vistoria"), intercepta PDFs de DAE gerados, envia tudo ao CRM via
`window.postMessage` → `crm_bridge.js` → `background.js` → API.

### Google Gemini

Via `@google/generative-ai`, com **proxy** em `supabase/functions/gemini-proxy`
(mantém a chave fora do front). Usado para:

- Extrair campos do ATPV-e (`atpveAI.ts`).
- Extrair campos da ficha de cadastro do Detran (`fichaCadastroAI.ts`).

### Microsoft Outlook

Integração via Edge Functions (`get-outlook-*`) pra ler a caixa do escritório
(ATPV-e chega por e-mail). Refresh token obtido via
`scripts/get-outlook-refresh-token.mjs`.

---

## Quando um novo pacote entra

Critérios para adicionar ao `package.json`:

1. **Faz algo que dependência nativa não faz.** `lodash`? Não, temos spread.
2. **Mantido.** Último commit no repo fonte em <6 meses.
3. **Tree-shakable.** Importar 1 função não leva 200kb.
4. **Tipagem TypeScript** (nativa ou `@types/*` bom).
5. **Licença permissiva** (MIT, Apache-2.0, ISC). Copyleft forte (GPL) não.

Se bateu todos, adicione e justifique no PR. Se quebrou algum, discuta antes.

---

## Versões que não vamos atualizar sem cuidado

- **React 18** — subir pra 19 quebra APIs de concurrent. Planejar sprint.
- **Vite 6** — vem com breaking na config a cada major.
- **Tailwind 3** — Tailwind 4 virou CSS-first com sintaxe nova. Migração é
  projeto dedicado.
- **Supabase JS 2** — mudança na 3 seria semver-major, nunca "só rodar npm
  update".

# 4. Tour do Codebase

## Árvore resumida

```
/
├─ .github/workflows/         CI (deploy Edge Functions)
├─ chrome-extension/          Extensão Chrome MV3 (ver cap. 7)
├─ design/                    Design system (tokens, princípios, checklist)
├─ docs/                      Esta documentação + análises de módulo
├─ migrations/                SQL versionado por data (aplicado manual)
├─ public/                    Assets estáticos do Vite
├─ scripts/                   Scripts one-off: import CSV, gen PDF, OAuth
├─ src/                       Frontend React (ver abaixo)
├─ supabase/
│  ├─ functions/              Edge Functions Deno
│  ├─ migrations/             Mirror das migrations (CLI supabase)
│  └─ config.toml
├─ server.js                  Express: /api/recibo/pdf
├─ supabase-schema.sql        Schema base (desatualizado — ver DB-1)
└─ package.json
```

## `src/` em detalhe

### `src/App.tsx`  (~1700 linhas)

Monstrão. Contém:

- **Todas as rotas** do React Router (linha ~1630+).
- **`ExtensionListener`** — componente que escuta `postMessage` da
  extensão e orquestra criação de cliente/veículo/OS.
- **Providers aninhados:** `AuthProvider` → `ConfirmProvider` →
  `NovaOSModalProvider` → `ThemeProvider`.
- **Handlers gigantes** que misturam UI + business (ex:
  `handleConfirmarDadosDetran`). Dívida CODE-7 — muitos `as any` aqui.

> **Ao mexer em App.tsx:** extraia lógica para `src/lib/*Service.ts`.
> Não adicione mais 300 linhas dentro.

### `src/components/`

Componentes compartilhados. Convenção: PascalCase, um arquivo por componente.

| Arquivo | Responsabilidade |
|---------|------------------|
| `Layout.tsx`            | Shell da app: sidebar + header + outlet |
| `OSKanban.tsx`          | Board arrastável de OSs |
| `NovaOSModal.tsx`       | Wizard de criação de OS |
| `ClienteEditFullModal`, `VeiculoEditFullModal` | Edição inline de fichas |
| `EmpresaEditModal`, `EmpresaEnviosSection` | Painel empresas |
| `DocumentViewer.tsx`    | Preview de PDF/imagem (parcialmente dead — UI-5) |
| `DocListEditor.tsx`     | Editor de checklists dinâmicos |
| `ModalBase`, `PageHeader`, `Toast`, `ConfirmProvider` | UI base |
| `ProgressDisclosure`, `HelpTooltip`, `EmptyState` | UX helpers |
| `finance/`              | Componentes financeiros (Painel, Modais, Resumos) |
| `ui/`                   | shadcn/ui primitives (Button, Select, Dialog…) |

### `src/pages/`

Uma página por rota. Regra de ouro: página compõe componentes, chama
services. **Não acessa `supabase` direto.**

| Página | Rota | O que faz |
|--------|------|-----------|
| `Login` | `/login` | Auth (custom, SHA-256 — ver dívida) |
| `ClientesList` / `ClienteForm` / `ClienteDetail` | `/clientes*` | CRUD cliente |
| `VeiculosList` / `VeiculoForm` | `/veiculos*` | CRUD veículo |
| `OSList` / `OSDetail` | `/ordens*` | Kanban + listagem + detalhe gigante (~3000 linhas) |
| `ServicosDetran` | `/servicos` | Catálogo de serviços e preços |
| `VistoriaCalendar` | `/calendario-vistorias` | Agenda |
| `ProtocoloDiario` | `/protocolos` | Geração de protocolo diário |
| `Emails` | `/emails` | Inbox Outlook/Gmail |
| `PainelEmpresas` | `/painel-empresas` | Relatório por empresa parceira |
| `ControlePlacas` | `/controle-placas` | Pedidos de placa |
| `ControlePagamentos` | `/controle-pagamentos` | 💰 (com permissão) |
| `Financeiro` | `/financeiro` | 💰 Dashboard |
| `Configuracoes` | `/configuracoes` | Config geral |
| `UsuariosList` | `/usuarios` | Gestão de usuários |
| `Backup` | `/backup` | Export/Import JSON (falha SEC-10/FIN-3) |
| `Dashboard`, `ConsultaProcessos` | auxiliares | Busca rápida por placa |

### `src/lib/`  — camada de serviços

| Arquivo | Papel |
|---------|-------|
| `supabaseClient.ts`     | `createClient(URL, ANON_KEY)` — singleton |
| `database.ts`           | **CRUD principal** de clientes/veículos/ordens + mappers DB↔app |
| `osService.ts`          | Regras de negócio de OS |
| `financeService.ts`     | Cobranças + pagamentos |
| `empresaService.ts`     | Empresas parceiras |
| `placaService.ts`       | Pedidos de placa |
| `configService.ts`      | Service config, checklist dinâmico |
| `auth.ts`               | Login/logout custom, hash SHA-256 |
| `permissions.ts`        | `temPermissao()` |
| `fileStorage.ts`        | Supabase Storage |
| `pdfParser.ts`          | Parser texto bruto de CRV/CRLV |
| `fichaCadastroAI.ts`    | Converte PDF → imagem → Gemini → ficha |
| `atpveAI.ts`            | Extração ATPV-e via Gemini |
| `geminiClient.ts`       | Wrapper do Edge Function `gemini-proxy` |
| `documentValidator.ts`  | Validações de CPF/CNPJ, placa, renavam |
| `reciboTemplate.ts` / `gerarDocumentos2Via.ts` | Geração docx/pdf |
| `utils.ts`              | Helpers (formatCPF, formatBRL, etc.) |
| `storage.ts`            | ⚠️ DEAD CODE (CODE-1). Não usar. |
| `checklistTemplates.ts` | Templates de checklist por serviço |

### `src/contexts/`

- `AuthContext.tsx` — usuário logado + `localStorage`.
- `ThemeContext.tsx` — dark/light toggle.

### `src/hooks/`

- `useNovaOSModal.ts` — abrir modal de nova OS de qualquer lugar.
- `useServiceLabels.ts` — labels amigáveis para status/serviços.
- `useUnsavedChanges.ts` — warning ao sair de form com mudanças.

### `src/types.ts` + `src/types/*.ts`

Interfaces compartilhadas: `Cliente`, `Veiculo`, `OrdemServico`, `StatusOS`,
`TipoServico`, `Empresa`, `Placa`, `FinanceCharge`, `Payment`.

### `src/index.css`

40KB de CSS. Contém:

- Variáveis do design system (`:root`, `.dark`).
- Utilities `.btn-primary`, `.card`, `.badge-*`.
- Overrides de componentes shadcn/ui.

Não mexa sem ler `design/tokens.md` e rodar `design/checklist.md`.

## `chrome-extension/`

Ver [`07-extensao-chrome.md`](./07-extensao-chrome.md).

## `scripts/`

One-off utilities (rodam com `tsx` ou `node`):

- `import_csv.ts` — importa dump do Notion.
- `debug_real_pdf.ts`, `debug_regex.ts`, `diag_parser.ts` — diagnosticar
  parser de PDF.
- `fix_sifap.ts` — migração de dados SIFAP.
- `get-outlook-refresh-token.mjs`, `get-gmail-token.mjs` — OAuth setup.
- `gerar_template_kuruma.mjs` — geração de template docx específico.

Roda tipicamente com `npx tsx scripts/<arquivo>.ts`. Scripts leem `.env`.

## `supabase/functions/`

Edge Functions Deno. Cada pasta = uma função. Deploy automático no push
para `main`. Testar local:

```bash
supabase functions serve <nome> --env-file .env.local
```

## Onde está o quê (cheat sheet)

> "Preciso mexer em…"

| Área | Comece por |
|------|-----------|
| Layout / tema         | `design/`, `src/index.css`, `src/components/Layout.tsx` |
| Rotas novas           | `src/App.tsx` (rotas) + `src/pages/Nova.tsx` |
| CRUD de entidade      | `src/lib/database.ts` + página correspondente |
| Regra de negócio OS   | `src/lib/osService.ts` + `OSDetail.tsx` |
| Financeiro            | `src/lib/financeService.ts` + `src/pages/Financeiro.tsx` |
| Parser de PDF         | `src/lib/pdfParser.ts`, `fichaCadastroAI.ts`, `atpveAI.ts` |
| Extensão              | `chrome-extension/content_*.js` |
| E-mail                | `supabase/functions/send-email-*` + `src/pages/Emails.tsx` |
| Schema do banco       | `migrations/<data>_nome.sql` (nova migration, nunca edite passada) |

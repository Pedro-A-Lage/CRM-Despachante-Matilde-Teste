# Mapa completo das pastas

> Onde mora cada coisa. Se bateu dúvida "onde coloco isso?", a resposta
> provavelmente está aqui.

---

## Raiz

```
CRM-Despachante-Matilde-Teste/
├── src/                          ← código React + TS (o CRM)
├── chrome-extension/             ← extensão do Detran MG
├── supabase/                     ← functions + config do Supabase
├── migrations/                   ← SQL de migração do banco
├── scripts/                      ← utilitários de dev / ETL pontual
├── public/                       ← assets estáticos servidos pelo Vite
├── design/                       ← design system canônico (tokens, componentes)
├── recorri-docs/                 ← esta documentação
├── docs/                         ← análises históricas (não é referência viva)
├── .github/                      ← workflows, templates de PR/issue
├── server.js                     ← Express para endpoint /api/recibo/pdf
├── index.html                    ← entry do Vite
├── vite.config.ts                ← config do bundler
├── tailwind.config.js            ← tokens do Tailwind
├── supabase-schema.sql           ← schema-base (legacy — hoje use migrations/)
└── package.json
```

---

## `src/`

```
src/
├── App.tsx                       ← Rotas + Providers (Auth, Theme, Confirm)
├── main.tsx                      ← ReactDOM.render
├── index.css                     ← ⚠️ TOKENS do design system + globais
├── types.ts                      ← interfaces compartilhadas (Cliente, Veiculo, OS…)
│
├── pages/                        ← telas "page-level" (uma por rota)
├── components/                   ← componentes reutilizáveis
│   ├── ui/                       ← shadcn/ui (Button, Dialog, Switch…)
│   └── finance/                  ← componentes específicos do financeiro
├── lib/                          ← integrações e regras de negócio
├── contexts/                     ← Auth, Theme
├── hooks/                        ← hooks reutilizáveis
└── types/                        ← tipos extras (empresa, finance, placa)
```

### `src/pages/` — quem é quem

Essas são as rotas principais. **Arquivos grandes** (>50k) são sinalizados.

| Arquivo                      | Rota                     | Propósito                                      |
| ---------------------------- | ------------------------ | ---------------------------------------------- |
| `Login.tsx`                  | `/login`                 | Autenticação                                   |
| `Dashboard.tsx` ⚠️           | `/`                      | Visão executiva (stats, gráficos)              |
| `OSList.tsx` ⚠️              | `/os`                    | Lista/kanban de Ordens de Serviço              |
| `OSDetail.tsx` ⚠️⚠️          | `/os/:id`                | O mega-componente — tudo da OS                 |
| `ClientesList.tsx`           | `/clientes`              | Lista de clientes                              |
| `ClienteDetail.tsx`          | `/clientes/:id`          | Detalhe do cliente                             |
| `ClienteForm.tsx`            | `/clientes/novo`         | Formulário de novo cliente                     |
| `VeiculosList.tsx`           | `/veiculos`              | Lista de veículos                              |
| `VeiculoForm.tsx`            | `/veiculos/novo`         | Formulário de veículo                          |
| `ConsultaProcessos.tsx`      | `/consulta`              | Busca rápida por placa                         |
| `ProtocoloDiario.tsx` ⚠️     | `/protocolo`             | Relatório de protocolo (impressão)             |
| `VistoriaCalendar.tsx`       | `/vistoria`              | Calendário de vistorias agendadas              |
| `ControlePlacas.tsx` ⚠️      | `/placas`                | Controle de envio de placas                    |
| `ControlePagamentos.tsx`     | `/pagamentos`            | Pagamentos de DAE / taxas                      |
| `Financeiro.tsx`             | `/financeiro`            | Entradas, saídas, saldo                        |
| `PainelEmpresas.tsx` ⚠️      | `/empresas`              | Empresas parceiras (envios, cobranças)         |
| `Emails.tsx`                 | `/emails`                | Integração Outlook                             |
| `ServicosDetran.tsx`         | `/servicos`              | Catálogo de serviços Detran                    |
| `UsuariosList.tsx` ⚠️        | `/usuarios`              | CRUD de usuários e permissões                  |
| `Configuracoes.tsx` ⚠️       | `/config`                | Configurações gerais                           |
| `Backup.tsx`                 | `/backup`                | Exportação de dados                            |

> ⚠️ significa arquivo > 500 linhas. ⚠️⚠️ em `OSDetail.tsx` significa
> >5000 linhas — qualquer mudança aí exige cuidado redobrado.

### `src/components/` — reutilizáveis

Modais "full edit" (`*EditFullModal.tsx`), kanban, toasts, layout, etc. Veja
catálogo em [`02-design-system/05-components.md`](../02-design-system/05-components.md).

### `src/lib/` — lógica de negócio e integrações

| Arquivo                   | Responsabilidade                                          |
| ------------------------- | --------------------------------------------------------- |
| `supabaseClient.ts`       | Instancia o client do Supabase (única fonte)              |
| `database.ts`             | CRUD de clientes, veículos, OS (wrapper do Supabase)      |
| `auth.ts`                 | Login, hash de senha, troca de senha                      |
| `permissions.ts`          | Checagem de `permissoes` por role                         |
| `financeService.ts`       | Regras financeiras (entradas, saídas, saldos)             |
| `empresaService.ts`       | Empresas parceiras (envios, cobranças)                    |
| `placaService.ts`         | Controle de placas e fábricas                             |
| `osService.ts`            | Helpers de OS (numeração, status)                         |
| `configService.ts`        | Leitura de config persistida (labels de serviço, etc)     |
| `pdfParser.ts`            | Parser de PDFs do Detran (CRV, DAE, vistoria)             |
| `atpveAI.ts`              | Extração via Gemini de ATPV-e                             |
| `fichaCadastroAI.ts`      | Extração via Gemini da ficha de cadastro do Detran        |
| `reciboTemplate.ts`       | Geração de recibo PDF a partir de template DOCX           |
| `gerarDocumentos2Via.ts`  | Gerar documentos de segunda via                           |
| `documentValidator.ts`    | Validação de CPF/CNPJ, RENAVAM, chassi                    |
| `checklistTemplates.ts`   | Templates de checklist por tipo de serviço                |
| `fileStorage.ts`          | Upload para o Supabase Storage                            |
| `geminiClient.ts`         | Wrapper da API do Gemini                                  |
| `utils.ts`                | `cn` (tailwind-merge) e outros utilitários pequenos       |

### `src/contexts/`

- `AuthContext.tsx` — usuário logado, login, logout, permissões.
- `ThemeContext.tsx` — light/dark, persistido em `localStorage`.

### `src/hooks/`

- `useNovaOSModal.ts` — controle do modal de nova OS.
- `useServiceLabels.ts` — labels de serviço (dinâmicos, configuráveis).
- `useUnsavedChanges.ts` — prompt antes de sair com alterações.

### `src/types/`

Tipos que crescerem além de `types.ts`:

- `empresa.ts` — empresas parceiras (overrides, envios).
- `finance.ts` — `TipoVeiculo`, lançamentos financeiros.
- `placa.ts` — fábricas de placa, status de envio.

---

## `chrome-extension/`

Extensão Chrome Manifest V3 que conversa com o portal Detran MG.

| Arquivo                       | Papel                                                      |
| ----------------------------- | ---------------------------------------------------------- |
| `manifest.json`               | Metadados + permissions + content_scripts                  |
| `background.js`               | Service worker (mensageria, storage, Drive upload)         |
| `content.js`                  | Ponte genérica entre páginas e background                  |
| `content_detran.js`           | Lê "Confirmar Dados" do Detran e envia pro CRM             |
| `content_vistoria.js`         | Lê "Resultados de Vistoria"                                |
| `crm-content.js`              | Content script injetado no CRM                             |
| `crm_bridge.js`               | Bridge que conecta `window.postMessage` ↔ extension        |
| `inject-error-interceptor.js` | Captura erros da página do Detran                          |
| `inject-pdf-interceptor.js`   | Intercepta PDFs gerados pelo Detran                        |

Bug reports e testes: `BUG_REPORT.md` e `RELATORIO_TESTES_*.md` dentro da pasta.

---

## `supabase/`

```
supabase/
├── config.toml                   ← config da CLI local
├── migrations/                   ← (não usar — usar /migrations da raiz)
└── functions/                    ← Edge Functions (Deno)
    ├── gemini-proxy/             ← proxy p/ chaves do Gemini
    ├── get-outlook-emails/       ← lista e-mails do Outlook
    ├── get-outlook-email-details/
    ├── get-outlook-email-attachment/
    ├── get-outlook-folders/
    ├── send-email-empresa/       ← envio de cobrança pra empresa parceira
    └── send-email-placa/         ← envio de e-mail de placa pronta
```

Deploy é automatizado pelo GitHub Action em
[`.github/workflows/deploy-supabase-functions.yml`](../../.github/workflows/deploy-supabase-functions.yml)
(dispara em push em `main` quando muda algo em `supabase/functions/**`).

---

## `migrations/`

SQL de migração do banco. **Ordem cronológica pelo prefixo** (`YYYYMMDD_hhmmss`).

⚠️ O arquivo `supabase-schema.sql` da raiz é o snapshot inicial. Para mudanças
novas, **sempre adicione uma migration** aqui, nunca edite o schema inicial.

Ver convenção em [`05-architecture/02-database-schema.md`](../05-architecture/02-database-schema.md).

---

## `scripts/`

Scripts utilitários de ETL e diagnóstico pontual:

- Imports (`import_csv.ts`, `clean_import.ts`).
- Debug de parser de PDF (`debug_real_pdf.ts`, `dump_pdf*.mjs`).
- OAuth helpers (`get-gmail-token.mjs`, `get-outlook-refresh-token.mjs`).
- Gerador de template de recibo (`gerar_template_kuruma.mjs`).

Rode com `npx tsx scripts/<nome>.ts` ou `node scripts/<nome>.mjs`.

---

## `design/`

**Design system canônico.** Leitura obrigatória antes de mexer em UI. Ver
[`../02-design-system/`](../02-design-system/) para a versão amigável.

---

## Regras rápidas

| Quero adicionar…                 | Onde?                                              |
| -------------------------------- | -------------------------------------------------- |
| Nova rota / tela                 | `src/pages/NomeTela.tsx` + rota em `App.tsx`       |
| Componente compartilhado         | `src/components/NomeComponent.tsx`                 |
| Componente só do financeiro      | `src/components/finance/`                          |
| Integração com API externa       | `src/lib/<servico>Service.ts`                      |
| Token de cor/radius/shadow       | `src/index.css` + `tailwind.config.js`             |
| Migration de banco               | `migrations/YYYYMMDD_hhmmss_nome.sql`              |
| Edge Function nova               | `supabase/functions/<nome>/index.ts`               |
| Script utilitário one-shot       | `scripts/<nome>.ts`                                |

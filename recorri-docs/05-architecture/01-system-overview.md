# Visão geral do sistema

> Como as peças se conectam. Leitura recomendada antes de qualquer mudança
> cross-cutting.

---

## Diagrama de alto nível

```
                        ┌──────────────────────────┐
                        │   Despachante (usuário)  │
                        └─────────┬────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
          ┌──────────────────┐        ┌────────────────────────┐
          │  Chrome Browser  │        │  Portal Detran MG      │
          │  + Extensão      │◀──────▶│  (confirmar dados,     │
          │  (chrome-ext/)   │        │   vistoria, DAE PDF)    │
          └────────┬─────────┘        └────────────────────────┘
                   │ postMessage / bridge
                   ▼
          ┌──────────────────────┐
          │  CRM SPA (React)     │
          │  localhost:5173      │
          │  src/ (Vite build)   │
          └────────┬─────────────┘
                   │ HTTPS
                   ▼
          ┌────────────────────────────────────────┐
          │   Supabase                             │
          │  ├─ PostgreSQL (tabelas do CRM)        │
          │  ├─ Storage (PDFs)                     │
          │  ├─ Edge Functions (OAuth, Gemini)     │
          │  └─ RLS desabilitado (anon key full)   │
          └────────────────────────────────────────┘
                   ▲                ▲               ▲
                   │                │               │
        ┌──────────┘     ┌──────────┘     ┌─────────┘
        ▼                ▼                ▼
  ┌──────────┐   ┌──────────────┐   ┌──────────────┐
  │  Google  │   │   Microsoft  │   │   Gemini     │
  │  Drive   │   │   Outlook    │   │   (IA extração) │
  └──────────┘   └──────────────┘   └──────────────┘
```

---

## Componentes

### 1. CRM SPA (React + Vite)

**Onde:** [`src/`](../../src/)

Single-page application. Servida como estático. Toda lógica roda no browser.

- **Rotas** configuradas em [`src/App.tsx`](../../src/App.tsx) com React Router 6.
- **Autenticação** via tabela `usuarios` custom (senha SHA-256, rate-limit 5
  tentativas / 5 min). Ver `src/lib/auth.ts`.
- **Autorização** por role (`admin`, `gerente`, `funcionario`) + permissões
  granulares. Ver `src/lib/permissions.ts`.
- **Estado**: `useState` + contexts (`AuthContext`, `ThemeContext`).
- **Acesso ao banco** sempre via `src/lib/*Service.ts` (nunca direto do
  componente).

### 2. Supabase

**Onde:** [`supabase/`](../../supabase/) + Dashboard externo.

- **Postgres** com schema base em `supabase-schema.sql` + migrations em
  [`migrations/`](../../migrations/).
- **Storage** com buckets organizados por OS / cliente.
- **Edge Functions** (Deno) em [`supabase/functions/`](../../supabase/functions/).
  Ver [`03-api-conventions.md`](./03-api-conventions.md).
- **RLS** habilitado mas com policy `USING (true)` — o acesso é full via anon
  key. Segurança é feita no **client** (permissões do usuário logado).
  Decisão de trade-off em [`04-security.md`](./04-security.md).

### 3. Chrome Extension

**Onde:** [`chrome-extension/`](../../chrome-extension/)

Manifest V3. Injeta content scripts no portal do Detran MG e no próprio CRM.

- **`content_detran.js`** — lê a página "Confirmar Dados" e "Resultados de
  Vistoria", extrai campos, envia via `window.postMessage` com
  `source: 'MATILDE_EXTENSION'`.
- **`inject-pdf-interceptor.js`** — intercepta PDFs gerados pelo Detran (DAE,
  laudo).
- **`background.js`** — service worker que coordena, faz upload no Drive
  quando autenticado.
- **`crm-content.js` + `crm_bridge.js`** — bridge no lado do CRM (ouvinte de
  postMessage → chamada de lib).

Recebedor no CRM em `App.tsx` → `ExtensionListener` (ver linhas 45+).

### 4. Integrações externas

| Serviço              | Propósito                                         |
| -------------------- | ------------------------------------------------- |
| **Google Drive**     | Pastas de cliente e OS + upload de docs/fotos     |
| **Microsoft Outlook**| Ler inbox (ATPV-e chega por email)                |
| **Google Gemini**    | Extração de campos de PDFs (ATPV-e, ficha cadastro)|
| **Portal Detran MG** | Fonte canônica de dados e PDFs (via extensão)     |

Todas as integrações que precisam de **chave secreta** passam por Edge Function
(nunca ficam no client):

- `supabase/functions/gemini-proxy` — chave do Gemini fica em env var da
  function.
- `supabase/functions/get-outlook-*` — OAuth tokens via function.
- `supabase/functions/send-email-*` — envio de email (placa, empresa).

---

## Fluxo crítico — criação de OS via extensão

Exemplo do fluxo ponta-a-ponta, o mais representativo do CRM:

```
1. Despachante navega até Detran MG → serviço → "Confirmar Dados".
2. Ele revisa os dados do cliente/veículo na tela.
3. Extensão content_detran.js extrai CPF, placa, chassi, renavam, nome,
   endereço, tipo de serviço.
4. Extensão envia postMessage pro CRM aberto em outra tab.
5. CRM (ExtensionListener em App.tsx) recebe.
   5a. Busca cliente pelo CPF em clientes.
   5b. Se não existe, cria.
   5c. Busca veículo por placa/chassi em veiculos.
   5d. Se não existe, cria.
   5e. Cria nova OS com status "aguardando_documentacao".
   5f. Gera checklist dinâmico pelo tipo de serviço.
6. CRM navega para /os/:id.
7. Despachante completa o resto na UI.
```

Depois disso, o fluxo continua:

```
Aguardando Docs → Vistoria → Delegacia → Doc Pronto → Entregue
```

Ver diagrama de estados em [`02-database-schema.md`](./02-database-schema.md).

---

## Onde cada dado vive

| Dado                            | Onde                                       |
| ------------------------------- | ------------------------------------------ |
| Cliente, Veículo, OS            | Postgres (Supabase)                        |
| PDFs (laudo, doc final, foto)   | Supabase Storage                           |
| PDFs de cliente/OS (Drive)      | Google Drive da conta corporativa          |
| Sessão do usuário logado        | `localStorage` do browser (ID + nome)      |
| Preferência de tema (light/dark)| `localStorage`                             |
| Estado temporário de UI         | React state (desaparece no reload)         |
| Secrets (API keys)              | Env vars de Edge Function (não no client)  |

---

## Quem é o "source of truth"?

| Dado                    | Master          | Espelho          |
| ----------------------- | --------------- | ---------------- |
| Cliente, veículo, OS    | Postgres        | —                |
| PDF do DAE / laudo      | Supabase Storage| Google Drive     |
| Estrutura de pastas     | Google Drive    | campos em Postgres `pasta_drive_id` |
| Usuários e permissões   | Postgres        | —                |
| Templates de recibo     | Postgres (config) | —             |

**O Drive é espelho, não master.** Se um arquivo some no Drive, o CRM não
quebra — só o link fica quebrado. Nunca o oposto.

---

## Pontos de falha conhecidos

| Falha                             | Impacto                              | Mitigação                       |
| --------------------------------- | ------------------------------------ | ------------------------------- |
| Supabase fora                     | CRM totalmente offline               | Incidente SEV-1                 |
| Anon key exposta em build         | Alguém de fora pode ler todo dado    | Migrar pra RLS próprio (futuro) |
| Portal Detran muda HTML           | Extensão para de funcionar           | Testar quinzenal + parser adaptativo |
| Google Drive quota exceeded       | Novos uploads falham                 | Monitorar quota                 |
| Edge Function cold start          | 1ª chamada demora 2-5s               | Aceitável (evento raro)         |

---

## Não-objetivos

- **Multi-tenant.** Um escritório, um banco, um build. Se virar SaaS, vira
  outro projeto.
- **Offline-first.** Precisa de internet. Sem worker, sem cache de dados.
- **Mobile nativo.** Responsive-web só. O design cobre mobile, mas não é
  PWA instalável.
- **Real-time entre usuários.** Duas pessoas editando a mesma OS simultâneo
  não foi pensado. Last-write-wins.

---

## Próximos passos de arquitetura (aspiracional)

1. **RLS real** com auth do Supabase custom (JWT) em vez de anon key full.
2. **Sincronização real-time** pelo menos pro kanban (Supabase Realtime).
3. **Cache do React Query** nas services (hoje cada componente busca direto).
4. **Observabilidade** (Sentry ou similar) nos erros de front.

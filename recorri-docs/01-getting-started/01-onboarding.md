# Onboarding — Como começar em 1 hora

> Você acabou de entrar no time. Siga este roteiro e no fim da primeira hora
> o CRM tem que estar rodando no seu navegador, o banco conectado, e você
> tem que saber abrir um ticket de OS de ponta a ponta.

---

## 0. Antes de tudo (5 min)

Requisitos na sua máquina:

- **Node.js ≥ 22** (ver [`package.json`](../../package.json) — campo `engines`).
- **npm ≥ 10**.
- **Git** configurado com seu email corporativo.
- **Google Chrome** (para a extensão do Detran).
- Acesso ao projeto no **Supabase** (peça chave anon pro tech lead).
- Conta no **Google Cloud** com acesso ao OAuth do Google Drive corporativo
  (opcional para o primeiro dia — só necessário pra mexer em upload de PDF).

---

## 1. Clone + install (10 min)

```bash
git clone git@github.com:pedro-a-lage/crm-despachante-matilde-teste.git
cd crm-despachante-matilde-teste
npm install
```

Se `npm install` reclamar de versão do Node, use `nvm use 22`.

---

## 2. Variáveis de ambiente (5 min)

```bash
cp .env.example .env
```

Abra `.env` e preencha:

```env
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave-anon-do-supabase>
```

⚠️ Estas chaves são **embutidas no build**. Nunca commite o `.env` de verdade
(o `.gitignore` já protege, mas confira). Detalhes em
[`03-environment-setup.md`](./03-environment-setup.md).

---

## 3. Subir o front (2 min)

```bash
npm run dev
```

Abra http://localhost:5173/. Você deve cair na tela de login (`src/pages/Login.tsx`).

Credencial de teste padrão do ambiente de dev: peça ao tech lead — a senha é
resetada pela rotina em [`reset-db.js`](../../reset-db.js).

---

## 4. Faça um tour guiado (20 min)

Na ordem, clique em cada página e observe:

| Página                 | Arquivo                                    | O que olhar                          |
| ---------------------- | ------------------------------------------ | ------------------------------------ |
| Dashboard              | `src/pages/Dashboard.tsx`                  | Stats, gráficos, atalhos             |
| Ordens de Serviço      | `src/pages/OSList.tsx` + `OSKanban.tsx`    | Kanban + lista com filtros           |
| Detalhe da OS          | `src/pages/OSDetail.tsx`                   | O mega-componente do produto         |
| Clientes / Veículos    | `src/pages/ClientesList.tsx`               | CRUD com modal full-edit             |
| Protocolo Diário       | `src/pages/ProtocoloDiario.tsx`            | Relatório de impressão               |
| Financeiro             | `src/pages/Financeiro.tsx`                 | Entradas, saídas, pagamentos         |
| Configurações          | `src/pages/Configuracoes.tsx`              | Usuários, serviços, templates        |

Entendeu a UI? Agora abra um cliente, um veículo e crie uma OS fake (use
placa tipo `TST-0A01`). O workflow é:

```
Aguard. Docs → Vistoria → Delegacia → Doc. Pronto → Entregue
```

---

## 5. Instale a extensão Chrome (15 min)

A extensão é o que deixa o CRM único — ela lê direto do portal do **Detran MG**
e injeta dados no CRM em tempo real. Ela vive em
[`chrome-extension/`](../../chrome-extension/).

1. `chrome://extensions/`
2. Modo desenvolvedor ON (canto superior direito).
3. **Carregar sem compactação** → selecione `chrome-extension/` na raiz do
   repo.
4. Fixe a extensão na barra.

Navegue até o portal do Detran MG (homologação) para ver o botão da extensão
ligar. Não precisa ter credenciais de produção no primeiro dia.

---

## 6. Leituras obrigatórias do primeiro dia (10 min)

- [`CLAUDE.md`](../../CLAUDE.md) — regras de operação (vale pra você também, não só IA).
- [`design/principles.md`](../../design/principles.md) — **antes de tocar em UI**.
- [`02-folder-structure.md`](./02-folder-structure.md) — para não se perder.
- [`../05-architecture/01-system-overview.md`](../05-architecture/01-system-overview.md).

---

## 7. Seu primeiro PR (amanhã)

Pegue uma issue marcada como `good-first-issue`. Siga o
[`git-workflow`](../03-engineering/03-git-workflow.md) e abra PR usando o
template `.github/PULL_REQUEST_TEMPLATE.md`.

Antes de abrir PR, rode:

```bash
npm run build   # tsc + vite build — precisa passar
```

---

## Problemas comuns no primeiro dia

| Sintoma                                      | Causa provável / solução                         |
| -------------------------------------------- | ------------------------------------------------ |
| `npm install` falha com `engine`             | Node < 22. `nvm install 22 && nvm use 22`         |
| Tela branca depois do login                  | `.env` não preenchido ou Supabase fora do ar     |
| Extensão não aparece na página do Detran     | URL do portal mudou — ver `chrome-extension/manifest.json` |
| "Cannot find module 'supabase-js'"           | Rodou `npm ci` e esqueceu `npm install`           |
| Upload de PDF trava em 0%                    | Credenciais do Google Drive não configuradas ainda |

Se travou em algo fora dessa lista, chame no canal `#dev-crm` do Slack.

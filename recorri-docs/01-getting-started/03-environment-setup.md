# Setup do ambiente local

> Do zero até o CRM rodando na sua máquina. Já seguiu o
> [`onboarding`](./01-onboarding.md)? Isto aqui é o manual de referência — com
> detalhes e troubleshooting.

---

## Requisitos mínimos

| Ferramenta   | Versão       | Verificar                    |
| ------------ | ------------ | ---------------------------- |
| Node.js      | ≥ **22.0.0** | `node -v` (ver `package.json` `engines`) |
| npm          | ≥ **10.0.0** | `npm -v`                     |
| Git          | 2.30+        | `git --version`              |
| Chrome       | Recente      | Para a extensão do Detran     |
| Supabase CLI | 2.x          | `npx supabase --version`      |

Recomendado: [nvm](https://github.com/nvm-sh/nvm) para gerenciar versões do Node.

```bash
nvm install 22
nvm use 22
```

---

## 1. Clone

```bash
git clone git@github.com:pedro-a-lage/crm-despachante-matilde-teste.git
cd crm-despachante-matilde-teste
```

> Se você está sem SSH configurado, use HTTPS e configure o cache de credenciais
> do Git.

---

## 2. Dependências

```bash
npm install
```

Este projeto **não usa** `package-lock.json` bloqueado em CI — `npm install`
é a fonte de verdade. Nunca rode `npm ci` (quebra por incompatibilidade de
versões).

---

## 3. Variáveis de ambiente

Copie o template:

```bash
cp .env.example .env
```

### Variáveis obrigatórias

```env
# Supabase (PostgreSQL + Storage + Edge Functions)
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave-anon>
```

### Variáveis opcionais

```env
# Para rodar o server.js (endpoint de recibo PDF) em paralelo
VITE_API_TARGET=http://localhost:3000
```

### ⚠️ Como o Vite trata `.env`

- Só variáveis com prefixo **`VITE_`** ficam disponíveis no front.
- Os valores são **embutidos no build** (substituídos em tempo de `vite build`).
  Isso significa que `VITE_SUPABASE_ANON_KEY` estará visível em `dist/*.js` —
  **não coloque segredos reais aí**. A anon key do Supabase é público por design
  (RLS protege os dados no servidor).
- Segredos **nunca** vão pro `.env` do front: ficam em Supabase secrets ou no
  `.env` do servidor (`server.js`), que não é exposto.

O `.gitignore` protege: `.env*` bloqueado, só `.env.example` é commitado.

---

## 4. Banco de dados

### Opção A — usar o Supabase compartilhado (recomendado)

Peça ao tech lead o nome do projeto de dev. Coloque URL e anon key no `.env`
e pronto. As migrations já foram aplicadas lá.

### Opção B — Supabase local (Docker)

```bash
npx supabase start
```

Aplica o `supabase-schema.sql` e todas as migrations de `migrations/`. Vai
abrir as URLs locais no terminal (geralmente `http://localhost:54321`).

Aplicar só as migrations novas num banco existente:

```bash
npx supabase db push
```

### Resetar o banco local

```bash
node reset-db.js   # limpa dados mas preserva schema
node reset-os.js   # reseta só tabela de OS
```

---

## 5. Rodar o front

```bash
npm run dev
```

Acessa em http://localhost:5173/.

Hot reload ativo. Mudanças em `.tsx`/`.css` recarregam na hora.

---

## 6. Rodar o servidor Express (opcional)

Só necessário se você vai mexer no endpoint `/api/recibo/pdf` (geração de
recibo PDF). Ver [`server.js`](../../server.js).

```bash
node server.js
# ouve em http://localhost:3000
```

O Vite já está configurado para fazer proxy de `/api/*` pro target definido
em `VITE_API_TARGET` (ver [`vite.config.ts`](../../vite.config.ts)).

---

## 7. Build de produção

```bash
npm run build
# output em dist/
```

Isso roda `tsc -b` (type-check completo) + `vite build` (bundle).

Teste o build localmente:

```bash
npm run preview
# ouve em http://localhost:4173/
```

---

## 8. Edge Functions do Supabase

Para mexer nas Edge Functions (`supabase/functions/*`), você precisa da CLI
autenticada:

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
```

Rodar function localmente (exige Docker):

```bash
npx supabase functions serve send-email-placa --env-file .env.local
```

Deploy é automatizado pelo GitHub Action quando tem push em `main` mexendo em
`supabase/functions/**`.

---

## 9. Extensão Chrome

```bash
# nenhum build — é JS puro
```

1. `chrome://extensions/`
2. Modo desenvolvedor ON.
3. **Carregar sem compactação** → `chrome-extension/`.

Se mudar código da extensão, volte em `chrome://extensions/` e clique no
botão de reload do card dela.

---

## Troubleshooting

### `npm install` falha com `EBADENGINE`

Node < 22. Use `nvm install 22 && nvm use 22`.

### "Failed to fetch" no front logo após login

`VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY` errado ou não preenchido.
Confira no Network → a URL de `supabase.co` deve bater com seu `.env`.

### Vite porta 5173 ocupada

Provavelmente outro dev server está rodando. `lsof -i :5173` e `kill <pid>`,
ou `npm run dev -- --port 5174`.

### "Cannot find module '@/…'"

O alias `@` → `src` é configurado em `vite.config.ts` e `tsconfig.app.json`.
Se seu editor não reconhece, reinicie o TS server do editor.

### Build quebra com erro de tipo em arquivo enorme (`OSDetail.tsx`)

`noUncheckedIndexedAccess: true` está ativo no `tsconfig.app.json`. Acessos
a array/objeto podem ser `undefined`. Use optional chaining (`?.`) ou
guardas antes do acesso.

### Upload de PDF para o Drive não funciona

Precisa do OAuth do Google Cloud configurado no back (segredos do projeto).
Peça acesso ao tech lead ou só ignore no primeiro dia.

### Extensão Chrome não aparece na página do Detran

Manifest filtra por host. Se o portal mudou a URL, atualize `matches` em
`chrome-extension/manifest.json` e recarregue a extensão.

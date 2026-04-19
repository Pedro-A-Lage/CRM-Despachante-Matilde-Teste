# 6. Workflow de Desenvolvimento

## Branch model

- `main` — sempre deployável. Push em `main` dispara CI de Edge Functions.
- Feature branches: `feature/<tópico-curto>`, `fix/<bug>`, `refactor/<área>`.
- Branches do Claude Code: `claude/<descrição>-<hash>`.
- **Nunca push force em `main`.** Para corrigir algo já pushado, novo commit.

## Commits

- 1 commit = 1 unidade lógica. Subject curto em português, presente do
  indicativo. Corpo opcional quando a mudança precisa justificativa.
- Exemplo bom:
  ```
  Corrige race em numero da OS com lock advisory

  A coluna SERIAL era sobrescrita por cálculo MAX+1 no app, o que gerava
  duplicatas sob concorrência. Agora usa pg_advisory_xact_lock.
  ```
- Sem convenção semântica rígida (não usamos Conventional Commits —
  conferir histórico com `git log --oneline`).

## Pull Requests

- Abra PR contra `main` assim que houver algo minimamente revisável
  (rascunho é OK).
- Descrição cobre: **o que**, **por que** e **como testar**.
- Inclua screenshots se mexer em UI.
- Linke a issue ou seção do `ANALISE_CRM_COMPLETA.md` que a PR endereça.
- Rode `design/checklist.md` para mudanças de UI.

> **Política deste agente:** só crie PR se o usuário pedir. Commit + push
> no branch designado é o default.

## Ciclo local

```bash
# 1. sincronize
git checkout main && git pull origin main

# 2. branch
git checkout -b feature/minha-coisa

# 3. rode em paralelo
npm run dev           # vite
# (opcional) npm start — se precisar do endpoint /api/recibo/pdf

# 4. antes de commitar
npm run build         # tsc -b deve passar sem erro
# rode manual a feature no navegador (golden path + 1 edge case)

# 5. commit
git add -p
git commit -m "Adiciona coluna X em veículo"

# 6. push
git push -u origin feature/minha-coisa
```

## Sem CI de frontend (hoje)

- **Não há** GitHub Actions para rodar `npm run build` ou testes no PR.
  Logo: se você quebrar TypeScript e push, só descobre quando alguém
  tentar buildar.
- **Não há** linter configurado (sem ESLint). Confie em TS strict.
- **Não há** testes automatizados. Período. Qualquer bug fix deve ser
  validado manualmente com um cenário reproduzível descrito no PR.

> Expandir CI está no backlog. Se você puder adicionar `npm run build`
> como workflow, faça — é ganho barato.

## Deploy

- **Frontend**: `npm run build` → upload de `dist/` para o host escolhido
  (Vercel/Netlify/estático). Não automatizado no repo.
- **Edge Functions**: automático em push `main` que toque
  `supabase/functions/**`. Ver `.github/workflows/deploy-supabase-functions.yml`.
- **Migrations SQL**: **manual**. Depois de merge, aplicar no Supabase
  Dashboard ou `supabase db push`. Comunique no canal do time quando o
  SQL for aplicado em prod.
- **Extensão Chrome**: não publicada na Chrome Web Store — é carregada
  "unpacked" em cada máquina do escritório. Atualizar = reload
  manual em `chrome://extensions/`.

## Convenções de código

- **TypeScript strict.** Evite `any`. Quando precisar, comente o porquê.
  (Atualmente há 216 `any`, dívida CODE-6 — não piore.)
- **Componentes:** um por arquivo, nome = arquivo, default export.
- **Pages não chamam `supabase` direto.** Passem por `src/lib/*Service.ts`
  ou `database.ts`.
- **Não hardcode cores, radius, sombras.** Use tokens (ver
  `design/tokens.md`).
- **Não use `alert()`**. Use `useToast()` ou `useConfirm()` (dívida ERR-4
  — não propague).
- **Empty catch é bug.** Se não souber tratar, relança ou loga com
  contexto. Dívida ERR-1 — `try { await finalizarOS(...) } catch {}`
  é exatamente o padrão que NÃO copiar.
- **PII no console.** Não logue CPF, chassi, placa em produção. Use
  guard por `import.meta.env.DEV`.

## Design system (TL;DR)

Leia `design/README.md`, `design/principles.md`, `design/tokens.md`.
Regras de ouro:

1. Warm neutral (creme) + âmbar `#c26a12`.
2. Fraunces (display), Inter (UI), IBM Plex Mono (placa/ID/R$).
3. Border radius ∈ {4, 8, 12, 16, 9999}px.
4. Light + Dark **obrigatórios**. Use tokens, temas trocam sozinhos.
5. Mobile-first, breakpoints `≤768px` e `≤380px` já mapeados.
6. `design/checklist.md` antes do commit que toque UI.

## Integração com o Claude Code / agentes AI

- `CLAUDE.md` define roteamento obrigatório para ferramentas MCP
  (context-mode). Respeite — não rode `curl`, `wget`, `fetch('http` etc.
  em Bash; use as ferramentas `ctx_*`.
- Ao delegar para subagente, explique escopo, arquivos-alvo e formato de
  saída. Veja exemplos em [`09-primeira-tarefa.md`](./09-primeira-tarefa.md).

## Fluxo de refactor seguro

1. Encontre o código no `ANALISE_CRM_COMPLETA.md` e confirme a severidade.
2. Escreva um **repro** manual (passos no browser ou script).
3. Corrija **só** o escopo do bug. Não "aproveite" para limpar o resto.
4. Rode o repro — deve passar.
5. Rode um cenário adjacente para checar regressão.
6. Commit pequeno. PR pequena.

# Git workflow

> Trunk-based pragmático. Branches curtas, PRs pequenos, review rápido.

---

## Branches

### `main`

- Única branch protegida.
- Só recebe merge de PR aprovado.
- Sempre deployable — se `main` está quebrada, paramos tudo até consertar.
- Deploys automáticos:
  - **Edge Functions do Supabase** — GitHub Action em
    [`.github/workflows/deploy-supabase-functions.yml`](../../.github/workflows/deploy-supabase-functions.yml)
    dispara em push/merge quando muda `supabase/functions/**`.
  - **Front** — deploy manual por enquanto (ver [`05-deployment.md`](./05-deployment.md)).

### Feature branches

Nome no formato:

```
<tipo>/<descritivo-em-kebab>
```

Tipos:

| Prefixo    | Uso                                |
| ---------- | ---------------------------------- |
| `feat/`    | Nova funcionalidade                |
| `fix/`     | Bug fix                            |
| `refactor/`| Mudança interna sem mudança de comportamento |
| `docs/`    | Só documentação                    |
| `chore/`   | Build, deps, config                |
| `hotfix/`  | Fix urgente em produção            |
| `claude/`  | Branches abertas pela IA (Claude Code) |

Exemplos:

```
feat/os-detail-pdf-viewer
fix/checklist-item-sem-id
refactor/finance-service-split
docs/onboarding
chore/bump-supabase-client
hotfix/login-quebrado-em-safari
claude/build-crm-docs-vXM2T
```

### Vida curta

Objetivo: **PR aberto e mergeado em ≤ 2 dias úteis**. Branch com >1 semana
gera conflitos pesados com o `main`. Se não vai conseguir terminar, abra
draft e discuta split.

---

## Commits

Formato simples:

```
<tipo>: <descrição curta no imperativo>

<corpo opcional explicando o porquê>
```

Exemplos:

```
feat: adiciona upload direto de laudo de vistoria
fix: corrige validação de CPF em clientes PJ
refactor: extrai aba financeiro do OSDetail pra componente próprio
docs: atualiza guia de onboarding com extensão Chrome
chore: atualiza dependências do supabase
```

Regras:

- Imperativo ("adiciona", não "adicionado" / "adicionando").
- 1ª linha ≤ 72 caracteres.
- Sem emoji, sem gitmoji.
- Português.
- Corpo separado por linha em branco, com quebras a cada 72 col.

### Commits atômicos

Um commit = uma ideia. Refator + feature = 2 commits. Se se pegou escrevendo
"e" ou "também" na mensagem, provavelmente é 2 commits.

---

## PR — Pull Request

Template automático em [`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md).

### Título

Mesmo formato do commit:

```
feat: adiciona upload direto de laudo de vistoria
```

### Corpo (mínimo)

1. **Contexto** — por quê.
2. **O que muda** — o quê (lista curta).
3. **Como testar** — passos pro reviewer reproduzir.
4. **Screenshots** — se mexeu em UI.
5. **Checklist** — do template.

### Tamanho

Alvo: **≤ 400 linhas diff**. PR >800 linhas precisa justificativa. PR >2000
linhas **recuse e peça split**.

### Draft

Abra draft assim que tiver algo rodando. Permite CI rodar cedo e feedback
contínuo.

---

## Review

Ver [`../04-processes/03-code-review.md`](../04-processes/03-code-review.md).
Resumo:

- **Pelo menos 1 aprovação** antes de merge.
- Reviewer olha em ≤ 1 dia útil.
- Autor responde comentários em ≤ 1 dia.

---

## Merge

Estratégias aceitas (preferência na ordem):

1. **Squash and merge** (padrão) — mantém `main` linear.
2. **Rebase and merge** — se o histórico do feature branch é muito bom (raro).
3. **Merge commit** — só em casos especiais combinados antes.

Depois do merge:

- Delete a feature branch.
- Puxe `main` localmente (`git pull origin main`).

---

## Conflitos

Rebase é preferível a merge:

```bash
git fetch origin
git rebase origin/main
# resolva, git add, git rebase --continue
git push --force-with-lease  # nunca --force puro
```

⚠️ Force push **só em branches próprias** (nunca em `main`). Use
`--force-with-lease` para evitar atropelar trabalho de outro.

---

## Hotfix em produção

1. Branch a partir de `main`: `hotfix/<descricao>`.
2. Commit pequeno, claro.
3. PR com **2 aprovações** (não 1).
4. Merge em `main`.
5. Post-mortem rápido no canal: o que aconteceu, o que fizemos.

---

## O que nunca fazer

- ❌ Commit direto em `main`.
- ❌ `git push --force` em `main`.
- ❌ Esquecer `.env` ou `chrome-extension.zip` no commit (`.gitignore` protege).
- ❌ Commit de `package-lock.json` em PR só de docs (gera ruído).
- ❌ Misturar refatoração grande com feature no mesmo PR.
- ❌ Mergear sem CI verde (o de linting do TS — `npm run build`).
- ❌ Mergear com comentários pendentes ainda em discussão.

---

## Branches do Claude Code / AI

Quando uma IA (Claude Code, agente) abre branch, o prefixo é `claude/`.
Convenções adicionais:

- PR deve deixar explícito no corpo que foi gerado por IA.
- Revisão humana é obrigatória — nada de auto-merge.
- Se o PR ficar órfão por >7 dias, pode ser fechado.

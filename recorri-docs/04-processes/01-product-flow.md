# Fluxo de produto

> Como uma ideia vira funcionalidade rodando no CRM. Do "que tal adicionar X?"
> até "está em produção e funcionando pra cliente real".

---

## Visão — quem participa

| Papel              | Quem faz                                             |
| ------------------ | ---------------------------------------------------- |
| **Product owner**  | Pedro / tech lead — define prioridade                |
| **Desenvolvedor**  | Time dev — implementa                                |
| **Designer**       | Quem assina design system (pode ser PO ou externo)   |
| **Usuário**        | Despachante da Matilde — fonte de todas as ideias    |
| **Revisor**        | Outro dev do time                                    |

---

## Estágios

```
ideia → triage → spec → dev → review → QA → deploy → monitor
```

### 1. Ideia

De onde vem:

- **Usuário reporta** via chat do escritório ("seria bom se o CRM...").
- **Dev observa** no código ("esse trecho tá um tecido velho, dá pra melhorar").
- **Incidente** pede fix ou melhoria pra não repetir.

Onde vai: **Issue no GitHub** com template `feature_request` ou `bug_report`
(ver `.github/ISSUE_TEMPLATE`).

### 2. Triage

Toda segunda-feira (ou ad hoc), o PO olha as issues novas:

- **Aceita** — vira item do backlog com prioridade (`priority:alta|média|baixa`)
  e estimativa grosseira (XS, S, M, L).
- **Precisa de mais info** — pede detalhes no próprio issue.
- **Rejeita** — fecha com justificativa (fora de escopo, conflita com visão,
  já existe).

Labels iniciais:

- `type:feature` | `type:bug` | `type:chore` | `type:docs`
- `priority:alta` | `priority:média` | `priority:baixa`
- `size:XS` | `size:S` | `size:M` | `size:L`
- `good-first-issue` (pra onboarding).

### 3. Spec — só pra M e L

Features XS/S vão direto pra dev com o que está no issue. Features médias e
grandes precisam de uma **spec curta**:

- **Problema** em 2 parágrafos.
- **Solução proposta** (mockup, fluxo, campos do banco).
- **Impacto** (páginas que mudam, migrations, riscos).
- **Fora de escopo** explícito.

Comente direto no issue. Se crescer muito, vira PR de docs em
[`recorri-docs/`](../).

### 4. Dev

Processo em [`02-sprint-workflow.md`](./02-sprint-workflow.md). Resumo:

- Branch `feat/<nome>` a partir de `main`.
- Commits pequenos e descritivos.
- Build rodando local.
- **PR draft cedo** pra CI rodar e feedback contínuo.

### 5. Review

Ver [`03-code-review.md`](./03-code-review.md). Resumo:

- ≥ 1 aprovação de outro dev.
- Checklist de design preenchido (se mexeu em UI).
- Todas as conversations resolvidas.

### 6. QA — teste manual

Hoje não temos automação. O autor:

1. Testa o fluxo feliz.
2. Testa 1-2 edge cases.
3. Documenta no PR o passo-a-passo de como o reviewer reproduz.
4. Se tocou em design, prints em light **e** dark.

O reviewer:

1. Puxa a branch local.
2. `npm install` se `package.json` mudou.
3. Reproduz os passos.
4. Tenta quebrar (entrar espaço em campo obrigatório, passar CPF inválido,
   etc).

### 7. Deploy

Ver [`../03-engineering/05-deployment.md`](../03-engineering/05-deployment.md).

- **Edge Functions** — automático via GH Action ao mergear em `main`.
- **Front** — manual (`npm run build` + upload).
- **Migration** — manual, planejada.

### 8. Monitor — pós-deploy

Nas primeiras 24h:

- Dev responsável acompanha o canal `#bugs` do escritório.
- Qualquer regressão vira **hotfix** (ver
  [`../03-engineering/03-git-workflow.md`](../03-engineering/03-git-workflow.md)).

---

## Fluxo especial — bugs urgentes (produção quebrada)

1. Abra issue `type:bug` + `priority:urgente`.
2. Branch `hotfix/<descricao>`.
3. Fix minimalista — não refatore nada extra.
4. PR com **2 aprovações** (não 1).
5. Merge + deploy.
6. **Post-mortem** no canal em até 24h:
   - O que aconteceu?
   - Como descobrimos?
   - O que fizemos?
   - O que evita repetir?

Ver [`04-incidents.md`](./04-incidents.md).

---

## Fluxo especial — mudança de design system

Alterações em tokens (cores, tipografia, radius, sombras) ou componentes
base (`.btn`, `.card`, `.badge`):

1. Issue com proposta — **sempre passa por PO** antes.
2. Abra spec no [`design/`](../../design/) atualizando os arquivos canônicos.
3. Branch `chore/design-<descricao>`.
4. PR extra grande, revisão cuidadosa — **toca em 2000+ lugares**.
5. Atualize [`02-design-system/`](../02-design-system/) pra refletir.

---

## Quando NÃO seguir todo o fluxo

- Typo em doc → PR direto sem issue.
- Fix óbvio (< 10 linhas, comportamento claramente errado) → PR direto,
  referencia o problema no corpo.
- Refatoração interna (sem mudança de comportamento visível) → PR direto
  com justificativa.

Use bom senso. Se fazer metade das pessoas ficar surpresa, o fluxo era necessário.

---

## KPIs do fluxo (aspiracional)

- Time médio issue aberta → mergeada: **≤ 5 dias**.
- Time médio PR aberto → mergeado: **≤ 2 dias**.
- % de PRs que passam revisão na 1ª rodada: **≥ 70%**.
- Incidentes por sprint: **≤ 1**.

Hoje não medimos. Medir é o primeiro passo pra melhorar.

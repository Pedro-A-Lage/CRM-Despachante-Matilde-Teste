<!--
  Template de PR do CRM Despachante Matilde.
  Ver fluxo completo em recorri-docs/04-processes/03-code-review.md
-->

## Contexto

<!-- Por que este PR existe? Qual problema resolve? Link pro issue se houver. -->

Fixes #

## O que muda

<!-- Lista curta do que foi feito. Imperativo em PT. -->

-
-
-

## Como testar

<!-- Passo-a-passo para o reviewer reproduzir o fluxo feliz + pelo menos 1 edge case -->

1.
2.
3.

**Edge case:**

-

## Screenshots (se mexeu em UI)

<!-- Prints em light E dark se alterou visual. Desktop e mobile se mudou layout. -->

| Antes | Depois |
| ----- | ------ |
|       |        |

## Migration de banco?

- [ ] **Sim** — arquivo adicionado em `migrations/` + testado em staging.
- [ ] Não.

Se sim, descreva como rodar e como reverter:

```sql
-- rodar
-- reverter
```

## Checklist

### Geral

- [ ] `npm run build` passa local (tsc + vite).
- [ ] Testei fluxo feliz + edge case.
- [ ] Sem `console.log`, `any`, `@ts-ignore` deixados pra trás.
- [ ] Commits claros, imperativo em PT (ver `recorri-docs/03-engineering/03-git-workflow.md`).

### Design (se mexeu em UI)

- [ ] Light + Dark testados.
- [ ] Mobile ≤ 768px testado.
- [ ] Nenhuma cor, radius, font-size, shadow hardcoded — só tokens.
- [ ] Botão só-ícone tem `aria-label`.
- [ ] Rode o checklist em `design/checklist.md`.

### Backend / Banco

- [ ] Acesso ao Supabase passa só por `src/lib/*Service.ts`.
- [ ] Mapping `dbToX` mantém contrato camelCase pro front.
- [ ] Validação de input feita antes de persistir.
- [ ] Permissão (`temPermissao`) checada em ação destrutiva.

### Segurança

- [ ] Nenhuma chave/secret commitada.
- [ ] Log não expõe dado sensível (CPF completo, token).
- [ ] Se novo `postMessage` da extensão: `event.origin` validado.

### Documentação

- [ ] Se o fluxo mudou, atualizei `recorri-docs/` no mesmo PR.
- [ ] Se adicionei componente/token novo, documentei em `design/` e em
      `recorri-docs/02-design-system/`.

## Riscos conhecidos

<!-- O que pode dar ruim? O que ficou fora? O que é "trade-off aceitável"? -->

-

## Para o reviewer

<!-- Qualquer contexto que ajude a revisão ser mais rápida. -->

-

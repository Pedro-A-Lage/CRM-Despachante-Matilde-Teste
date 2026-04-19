# Sprint workflow — como trabalhamos

> Ciclos curtos. Planejamento leve. Entrega contínua. Nada de Jira de 14 campos.

---

## Ritmo

- **Sprint = 1 semana.** Segunda a sexta.
- **Segunda 10h** — planning (15 min).
- **Sexta 16h** — demo + retro rápida (30 min).
- Dailies: **assíncronas** no canal `#dev-crm` do Slack (o que fez ontem, o
  que vai fazer hoje, onde travou).

---

## Planning (segunda)

Agenda:

1. **Revisão do backlog** (5 min).
2. **Escolha do sprint** (10 min).

Regras:

- Escolha o que cabe numa semana, não o que "seria bom" fazer.
- Cada item tem um **responsável** (uma pessoa, não um time).
- Cada item tem uma **definition of done** curta.

Exemplo:

```
Sprint 2026-W16
─────────────────────────────────────────────────────────────
#142 Upload de laudo de vistoria no Drive      — @maria  (M)
     DoD: clicar anexar → arquivo no Drive → badge "anexado"
          na aba Vistoria da OS.
#148 Fix: busca de placa ignora hífen          — @joao   (S)
     DoD: "FAX2K44" e "FAX-2K44" retornam a mesma OS.
#151 Doc: onboarding atualizado c/ extensão    — @pedro  (XS)
     DoD: onboarding.md inclui passo da extensão.
```

Tamanhos:

- **XS** — ≤ 1h.
- **S** — ≤ 0.5 dia.
- **M** — 1-2 dias.
- **L** — 3+ dias. **Evitar.** Se aparecer, split.

Capacidade típica por dev/semana:

- 1 L ou 2 Ms ou 4 Ss. Ajuste ao seu ritmo.

---

## Durante a semana

### Daily (assíncrono)

Ao começar o dia, poste no `#dev-crm`:

```
🔄 Daily - Maria - Ter 16/Abr
- Ontem: terminei parser de laudo, subi PR #203
- Hoje: resolver comentários do review + fix #148
- Travado em: upload tá cinza se veio do Drive (investigando)
```

Não precisa reunião síncrona. Se bater travamento, **pare e chame** no canal
(ou DM tech lead).

### PRs

- Abra **draft** assim que tiver código rodando.
- Marque como **ready for review** quando:
  - `npm run build` passa.
  - Teste manual feito.
  - Corpo do PR preenchido.
- Acompanhe — review em ≤ 1 dia útil, se não saiu, cutuca.

### Quando um item empaca

Se após 1 dia você **não avançou**, poste no canal. Opções:

- Pair programming.
- Split do item.
- Spike (timebox de 2h pra investigar, depois decide).

---

## Demo + retro (sexta)

### Demo (15 min)

Cada um mostra o que **mergeou** esta semana. 30s-2min por pessoa. Screen
share, click real no CRM. Não é "eu trabalhei em X", é "veja isso funcionando".

### Retro (15 min)

Três perguntas, 3 min cada:

1. **Parar** — o que tá nos atrasando?
2. **Começar** — que experimento vale tentar semana que vem?
3. **Continuar** — o que tá funcionando e queremos manter?

Registre num arquivo `retros/YYYY-Www.md` (criar pasta quando começar).

---

## O que NÃO fazemos

- ❌ **Story points em Fibonacci.** Tamanhos grossos (XS/S/M/L) chegam.
- ❌ **Estimativa no planning.** O responsável avalia no momento.
- ❌ **Reunião de "refinamento" separada.** Triage é contínuo (ver
  [`01-product-flow.md`](./01-product-flow.md)).
- ❌ **Daily síncrono de 30 min.** Mata produtividade.
- ❌ **Sprint review cerimonial com PO e stakeholders.** A demo cumpre isso.

---

## Onde o backlog vive

**GitHub Issues.** Labels como filtros:

- `priority:alta` → candidatos prioritários pro próximo sprint.
- `good-first-issue` → onboarding.
- `blocked` → esperando info / outra feature.

Views úteis:

- `is:issue is:open label:priority:alta sort:created-desc`
- `is:pr author:@me` — minhas PRs abertas.

---

## Sinal de alerta

Se você se pegar:

- Fazendo mais de **3 Ms por sprint** — provavelmente são Ls disfarçados.
- Trabalhando em **>1 item em paralelo** — termine um antes.
- Abrindo **PR de >1000 linhas toda semana** — está empilhando mudanças.
- **Nunca** rodando `npm run build` antes de PR — vai quebrar build em main.

Recua, respira, pergunta se tá seguindo o fluxo.

---

## Quando tudo dá certo

Fim de sexta:

- 3-5 PRs mergeados.
- `main` verde.
- Demo curta e satisfatória.
- Ninguém trabalhou no fim de semana.

Essa é a meta — sustentável, previsível, sem heroísmo.

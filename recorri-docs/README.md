# Recorri Docs — CRM Despachante Matilde

> Fonte única de verdade para **pessoas novas no time** e para **AIs** que
> vão mexer neste projeto. Se está aqui, leia em ordem — cada seção pressupõe
> a anterior.

Este CRM automatiza o fluxo completo do despachante documentalista: cadastro
de clientes e veículos, Ordens de Serviço (OS) com workflow próprio, checklist
de documentos, integração direta com o portal do **Detran MG** via extensão
Chrome, vistoria, delegacia, SIFAP, protocolo diário, financeiro e painel de
empresas parceiras.

---

## Como navegar

| Pasta                                               | Para quem                                               |
| --------------------------------------------------- | ------------------------------------------------------- |
| [`01-getting-started/`](./01-getting-started/)      | Dev novo no time — rode isto no primeiro dia            |
| [`02-design-system/`](./02-design-system/)          | Qualquer mudança visual (humana ou AI)                  |
| [`03-engineering/`](./03-engineering/)              | Como o código é organizado, testado e entregue          |
| [`04-processes/`](./04-processes/)                  | Como o time trabalha (sprints, reviews, incidentes)     |
| [`05-architecture/`](./05-architecture/)            | Sistema, banco, APIs e segurança                        |

---

## Índice completo

### 01 · Getting started
- [01 · Onboarding (1h)](./01-getting-started/01-onboarding.md)
- [02 · Mapa de pastas](./01-getting-started/02-folder-structure.md)
- [03 · Setup do ambiente local](./01-getting-started/03-environment-setup.md)

### 02 · Design System
- [01 · Princípios de design](./02-design-system/01-design-principles.md)
- [02 · Cores (paleta completa)](./02-design-system/02-colors.md)
- [03 · Tipografia e escala](./02-design-system/03-typography.md)
- [04 · Espaçamento e grid](./02-design-system/04-spacing-grid.md)
- [05 · Componentes (botões, inputs, cards, modais)](./02-design-system/05-components.md)
- [06 · Sistema de ícones](./02-design-system/06-icons.md)
- [07 · Animações e transições](./02-design-system/07-animations.md)
- [08 · Acessibilidade](./02-design-system/08-accessibility.md)

### 03 · Engenharia
- [01 · Stack técnica (o porquê de cada escolha)](./03-engineering/01-tech-stack.md)
- [02 · Convenções de código](./03-engineering/02-code-conventions.md)
- [03 · Git workflow (branches, commits, PRs)](./03-engineering/03-git-workflow.md)
- [04 · Estratégia de testes](./03-engineering/04-testing-strategy.md)
- [05 · Deployment](./03-engineering/05-deployment.md)

### 04 · Processos
- [01 · Fluxo de produto](./04-processes/01-product-flow.md)
- [02 · Sprint workflow](./04-processes/02-sprint-workflow.md)
- [03 · Code review](./04-processes/03-code-review.md)
- [04 · Incidentes](./04-processes/04-incidents.md)

### 05 · Arquitetura
- [01 · Visão geral do sistema](./05-architecture/01-system-overview.md)
- [02 · Schema do banco](./05-architecture/02-database-schema.md)
- [03 · Convenções de API](./05-architecture/03-api-conventions.md)
- [04 · Segurança e LGPD](./05-architecture/04-security.md)

---

## Relação com outros docs do repo

- [`../README.md`](../README.md) — visão executiva do produto (para fora do time).
- [`../CLAUDE.md`](../CLAUDE.md) — regras de operação para Claude Code / AIs.
- [`../design/`](../design/) — **design system canônico** (tokens, componentes,
  layouts). `recorri-docs/02-design-system/` é o guia amigável; `design/` é a
  referência técnica. Em caso de conflito, `design/` vence.
- [`../docs/`](../docs/) — análises pontuais (financeiro, reestruturação de
  Configurações). Histórico, não referência viva.
- [`../ANALISE_*.md`](../) — relatórios de diagnóstico do banco e do CRM.

---

## Convenções destes docs

1. **Português.** O produto é 100% Brasil, a equipe também.
2. **Mostre código real.** Exemplos tirados de arquivos do repo (com caminho
   `file:linha`), não pseudo-código.
3. **Nada de teoria pura.** Se não fala sobre este CRM especificamente, não
   entra aqui.
4. **Viva com o código.** Quem mudar um fluxo atualiza o doc no mesmo PR.

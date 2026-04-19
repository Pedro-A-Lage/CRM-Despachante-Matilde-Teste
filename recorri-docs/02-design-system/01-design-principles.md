# Princípios de design

> Este doc é a versão amigável. A fonte canônica é
> [`design/principles.md`](../../design/principles.md). Em caso de conflito,
> o canônico vence.

---

## O jeito Matilde

O CRM deve parecer um caderno de despachante bem cuidado: sério como cartório,
moderno como Linear. Chamamos isso de **Claude Design v1.0** — warm neutrals
(creme, não branco puro) + accent âmbar `#c26a12` + três famílias tipográficas
com papel claro.

- **Fraunces** — display (hero, títulos especiais).
- **Inter** — body (UI, formulários, tabelas).
- **IBM Plex Mono** — dados (placas, IDs, valores R$).

Referência visual em [`design/assets/claude-design/design-system.html`](../../design/assets/claude-design/design-system.html).

---

## Os 8 princípios

### 1. Warm neutral minimalismo

- ✅ Fundos creme (`var(--notion-bg)` = `#fbf9f6`).
- ✅ Bordas finas 1px (`var(--notion-border)` = `#e8e3da`).
- ✅ Sombras sutis marrom-warm (`rgba(40,30,14,…)`).
- ❌ Gradientes.
- ❌ Glassmorphism / `backdrop-filter` (exceto modal overlay).
- ❌ Azul de CRM genérico.
- ❌ Branco puro (`#ffffff`) como fundo de app.

### 2. Conteúdo > cromo

Hierarquia vem de **tipografia e espaçamento**, não de cor. Cor serve pra:

- Estado (sucesso / erro / aviso).
- Ação primária (âmbar).
- Marca (badges, links).

Texto usa só 3 níveis: `--notion-text`, `--notion-text-secondary`, `--notion-text-muted`.

### 3. Tokens são lei

Hardcoded é bug. Ver [`02-colors.md`](./02-colors.md) e [`04-spacing-grid.md`](./04-spacing-grid.md).

| Em vez de…                    | Use…                                 |
| ----------------------------- | ------------------------------------ |
| `color: #c26a12`              | `var(--notion-blue)` ou `text-amber` |
| `background: #ef4444`         | `var(--status-danger)`               |
| `padding: 16px`               | `var(--space-4)` ou `p-4`            |
| `border-radius: 10px`         | **não existe** — use 4/8/12/16       |
| `font-family: 'Fraunces'`     | `var(--font-display)` / `.font-display` |
| `box-shadow: 0 2px 4px ...`   | `var(--shadow-card)`                 |

### 4. Light + Dark são iguais em prioridade

Os tokens trocam automaticamente com a classe `.dark` no `<html>`. Se você usa
tokens, vem de graça. Hardcode quebra dark. **Teste alternando o tema antes do
commit.**

### 5. Mobile não é "depois"

Breakpoints já estão em [`src/index.css`](../../src/index.css):

- `≤ 1080px` — quebra layouts 2-col de OS.
- `≤ 768px` — sidebar vira drawer, modal vira bottom-sheet.
- `≤ 380px` — iPhone SE, tudo 1-col.

Use `.hide-mobile`, `.full-mobile`. **Não invente breakpoint novo.**

### 6. Acessibilidade não é opcional

- `:focus-visible` estilizado globalmente — não remova outline sem substituir.
- Contraste AA no mínimo.
- `aria-label` em botão só-ícone.
- Área tocável ≥ 40×40px (já forçado em mobile).
- Input no mobile com `font-size: 16px` (impede zoom no iOS).

### 7. Performance visual

- Transições ≤ 200ms.
- Animações infinitas só na `.spin` (loading).
- `page-fade-in 0.22s` já aplicado na entrada de página.

### 8. Não reinvente

Antes de criar componente novo, procure em [`05-components.md`](./05-components.md).
90% já existe. Se precisar de variação, use modificador (`.btn-variant-x`), não
componente paralelo.

---

## O que mata o design (checklist rápido)

1. Sombra colorida (`box-shadow: 0 4px 12px rgba(0,117,222,0.3)`).
2. Border-radius fora do sistema (`border-radius: 6px`).
3. Cor de texto fora dos 3 níveis (cinza qualquer).
4. Margin/padding não-múltiplo de 4 (`padding: 13px`).
5. `!important` pra sobrescrever token (sinal de que o token está errado).
6. Componente shadcn sem mapear `--background`/`--foreground`.
7. Testar só claro, esquecer dark.

Veja [`design/checklist.md`](../../design/checklist.md) para o checklist completo.

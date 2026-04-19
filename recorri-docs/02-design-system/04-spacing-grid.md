# Espaçamento e grid

> Múltiplos de **4**. Sempre. Variáveis CSS + Tailwind já alinhados em
> [`src/index.css`](../../src/index.css) e [`tailwind.config.js`](../../tailwind.config.js).

---

## Escala

| Variável     | Valor   | Tailwind | Uso típico                    |
| ------------ | ------- | -------- | ----------------------------- |
| `--space-1`  | `4px`   | `p-1`    | Gap mínimo                    |
| `--space-2`  | `8px`   | `p-2`    | Padding interno mínimo        |
| `--space-3`  | `12px`  | `p-3`    | Gap padrão em linhas          |
| `--space-4`  | `16px`  | `p-4`    | Padding de card               |
| `--space-5`  | `20px`  | `p-5`    | Padding maior                 |
| `--space-6`  | `24px`  | `p-6`    | Padding de página (main-body) |
| `--space-8`  | `32px`  | `p-8`    | Separação de seção            |

⚠️ **Não existe** `padding: 13px`, `margin: 18px`, etc. Se "parece melhor"
com um valor fora da escala, o token novo está faltando — adicione em
`index.css` antes.

---

## Onde cada espaçamento entra

| Contexto                         | Espaçamento padrão         |
| -------------------------------- | -------------------------- |
| Padding interno de card          | `p-4` / `var(--space-4)`   |
| Padding de página (`main-body`)  | `p-6` / `var(--space-6)`   |
| Gap entre cards em grid          | `gap-4`                    |
| Gap em form-row (inputs lado a lado) | `gap-4`                |
| Espaço entre label e input       | `gap-2`                    |
| Espaço entre `page-header` e conteúdo | `mb-6`                |
| Separação de seções dentro de OSDetail | `mt-8` / `var(--space-8)` |
| Padding de botão (já no `.btn`)  | 8px 16px (vem do token)    |

---

## Border radius (sistema)

Só existem 6 valores:

| Valor    | Tailwind              | Quando                          |
| -------- | --------------------- | ------------------------------- |
| `4px`    | `rounded-micro`       | Inputs, badges retangulares     |
| `5px`    | `rounded-subtle`      | Sidebar links                   |
| `8px`    | `rounded-standard`    | Alerts, popovers                |
| `12px`   | `rounded-comfortable` | Cards, kanban                   |
| `16px`   | `rounded-large`       | Modais                          |
| `9999px` | `rounded-pill`        | Badges pill, avatares           |

⚠️ `border-radius: 6px` ou `10px` é **bug**.

---

## Sombras (warm-toned)

| Token             | Uso                         |
| ----------------- | --------------------------- |
| `--shadow-card`   | Card em repouso             |
| `--shadow-deep`   | Hover, modal, popover       |
| `--shadow-sm`     | Sombra mínima (legacy)      |

Classes Tailwind: `shadow-card`, `shadow-deep`.

Warm-toned significa `rgba(40, 30, 14, alpha)` (marrom escuro) em vez de preto
puro — combina com a paleta warm cream.

---

## Grid — layouts prontos

### App shell

```
┌──────────┬──────────────────────────────┐
│          │ .main-header (12px 24px)     │
│ .sidebar ├──────────────────────────────┤
│  220px   │                              │
│          │ .main-body (padding 24px,    │
│          │   children max-width 1600)   │
└──────────┴──────────────────────────────┘
```

Ver [`design/layouts.md`](../../design/layouts.md).

### Dashboard grid

- `.dashboard-stat-grid` — `auto-fit minmax(180px, 1fr)`, gap 16px.
- `.dashboard-grid` — `auto-fit minmax(300px, 1fr)`, gap 24px.

### Info grid (pares label/valor)

- `.info-grid` — 2 colunas, gap 12px.

### Kanban board

- `.kanban-board` — flex horizontal, gap 16px, scroll-x.
- Cada coluna com largura fixa ~280px.

---

## Breakpoints

Os únicos permitidos:

| Breakpoint | Comportamento                                        |
| ---------- | ---------------------------------------------------- |
| `≤ 1080px` | `os-main-row` quebra em coluna, sidebar OS full      |
| `≤ 900px`  | `oslist-statusbar` vira scroll-x                     |
| `≤ 768px`  | Sidebar vira drawer; modal → bottom-sheet; tabelas scroll-x |
| `≤ 380px`  | Stat-grid 1-col; padding mínimo em `main-body`       |

⚠️ **Não invente breakpoints.** Adicione regras dentro dos ranges existentes.

Classes utilitárias:

- `.hide-mobile` — esconde em ≤768px.
- `.full-mobile` — vira `width: 100%` em ≤768px.

---

## Regras de ouro

1. **Múltiplo de 4** em tudo que for espaço.
2. **Radius só da lista de 6 valores.**
3. **Sombra só de token** (`--shadow-card` / `--shadow-deep`).
4. **`max-width: 1600px`** em `.main-body > *` — não envolva o conteúdo em
   outro wrapper que quebre isso.
5. **Padding de página = 24px** em desktop, reduz automático em mobile.

---

## Z-index (já padronizado)

| Valor   | Uso                                                |
| ------- | -------------------------------------------------- |
| `30`    | Modal overlay                                      |
| `40`    | Sidebar                                            |
| `100`   | Sidebar mobile drawer, popovers locais             |
| `9999`  | Toast, Radix Popper (Select, Popover)              |

Não invente z-index novo. Se precisa de camada acima, revise se o conteúdo
não deveria ser modal.

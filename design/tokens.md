# Design Tokens — CRM Despachante Matilde

> Tokens são definidos em [`src/index.css`](../src/index.css) (variáveis CSS) e
> expostos para Tailwind em [`tailwind.config.js`](../tailwind.config.js).
> **Nunca hardcode valores** — sempre referencie o token.

---

## Cores

### Brand & Superfícies

| Token CSS                  | Light       | Dark        | Tailwind          | Uso                                       |
| -------------------------- | ----------- | ----------- | ----------------- | ----------------------------------------- |
| `--notion-bg`              | `#ffffff`   | `#1a1a19`   | `bg-bg`           | Fundo principal da app                    |
| `--notion-bg-alt`          | `#f6f5f4`   | `#252522`   | `bg-bg-alt`       | Fundo da sidebar, áreas secundárias       |
| `--notion-surface`         | `#ffffff`   | `#2a2927`   | `bg-surface`      | Cards, modais, popovers                   |
| `--notion-border`          | `rgba(0,0,0,0.1)` | `rgba(255,255,255,0.1)` | `border-border`   | Todas as bordas finas    |

### Texto

| Token CSS                       | Light     | Dark       | Tailwind            | Uso                              |
| ------------------------------- | --------- | ---------- | ------------------- | -------------------------------- |
| `--notion-text`                 | `rgba(0,0,0,0.95)` | `rgba(255,255,255,0.95)` | `text-text`         | Texto principal                  |
| `--notion-text-secondary`       | `#615d59` | `#a39e98`  | `text-text-secondary` | Labels, texto auxiliar           |
| `--notion-text-muted`           | `#a39e98` | `#615d59`  | `text-text-muted`     | Placeholders, captions, ícones discretos |

### Acentos / Brand

| Token CSS                  | Light       | Dark        | Tailwind          | Uso                                |
| -------------------------- | ----------- | ----------- | ----------------- | ---------------------------------- |
| `--notion-blue`            | `#0075de`   | `#2b8fe8`   | `bg-blue` / `text-blue` | Ação primária, link, foco     |
| `--notion-blue-hover`      | `#005bab`   | `#0075de`   | `bg-blue-hover`   | Hover do botão primário            |
| `--notion-blue-focus`      | `#097fe8`   | `#62aef0`   | `bg-blue-focus`   | Anel de foco                       |
| `--notion-badge-bg`        | `#f2f9ff`   | `rgba(43,143,232,.15)` | `bg-badge-bg`     | Fundo de badge default             |
| `--notion-badge-text`      | `#097fe8`   | `#62aef0`   | `text-badge-text` | Texto de badge default             |

### Semânticos

| Token CSS              | Cor           | Uso                             |
| ---------------------- | ------------- | ------------------------------- |
| `--notion-green`       | `#1aae39`     | Sucesso, aprovado, pago         |
| `--notion-orange`      | `#dd5b00`     | Aviso, atenção, pendente        |
| `--notion-teal`        | `#2a9d99`     | Info, neutro                    |
| `--notion-pink`        | `#ff64c8`     | Tag/categoria especial          |
| `--notion-purple`      | `#391c57`     | Tag/categoria especial          |
| `--notion-brown`       | `#523410`     | Tag/categoria especial          |
| `#ef4444`              | (vermelho)    | Erro, deletar (`.btn-danger`)   |

### Aliases legacy (compat shadcn/ui)

`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`,
`--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`.

Todos definidos em HSL; usados por componentes shadcn. **Não mexer sem
sincronizar com `--notion-*`.**

---

## Tipografia

### Família

```css
font-family: 'Inter', -apple-system, system-ui, 'Segoe UI', sans-serif;
```

Carregada via Google Fonts (peso 400/500/600/700) em `index.css:1`.

### Escala (Tailwind)

| Classe Tailwind     | Tamanho   | Line-height | Weight | Uso                              |
| ------------------- | --------- | ----------- | ------ | -------------------------------- |
| `text-display-hero` | `4.00rem` | 1.00        | 700    | Hero de landing                  |
| `text-display-2`    | `3.38rem` | 1.04        | 700    | Display secundário               |
| `text-section`      | `3.00rem` | 1.00        | 700    | Título de seção grande           |
| `text-sub-lg`       | `2.50rem` | 1.50        | 700    | Subtítulo grande                 |
| `text-sub`          | `1.63rem` | 1.23        | 700    | Subtítulo                        |
| `text-card-title`   | `1.38rem` | 1.27        | 700    | Título de card / page header     |
| `text-body-lg`      | `1.25rem` | 1.40        | 600    | Body grande                      |
| `text-nav`          | `0.94rem` | 1.33        | 600    | Links de nav, sidebar            |
| `text-caption`      | `0.88rem` | 1.43        | 500    | Legendas                         |
| `text-badge-text`   | `0.75rem` | 1.33        | 600    | Texto de badge                   |

### Pesos

- `400` — corpo normal
- `500` — labels, captions
- `600` — semibold (badges, botões, nav)
- `700` — bold (títulos)

⚠️ **Nada de `font-weight: 800` ou `300`.** Não temos esses pesos carregados.

---

## Espaçamento

Múltiplos de 4. Disponíveis como variável CSS:

| Variável     | Valor   | Uso típico                         |
| ------------ | ------- | ---------------------------------- |
| `--space-1`  | `4px`   | gap mínimo entre ícone/texto       |
| `--space-2`  | `8px`   | padding interno mínimo             |
| `--space-3`  | `12px`  | gap padrão                         |
| `--space-4`  | `16px`  | padding de card                    |
| `--space-5`  | `20px`  | padding maior                      |
| `--space-6`  | `24px`  | padding de página                  |
| `--space-8`  | `32px`  | seção                              |

**No Tailwind**, use a escala default (`p-1`, `p-2`, `p-3`, `p-4`, `p-5`, `p-6`,
`p-8`) que segue a mesma cadência (4 / 8 / 12 / 16 / 20 / 24 / 32 px).

⚠️ **Nada de valores quebrados** como `p-[13px]` ou `gap-[7px]`.

---

## Border radius

| Valor    | Tailwind        | Variável     | Uso                                     |
| -------- | --------------- | ------------ | --------------------------------------- |
| `4px`    | `rounded-micro` | `--radius-sm` | Inputs, badges retangulares, botões     |
| `5px`    | `rounded-subtle` | —           | Sidebar links                           |
| `8px`    | `rounded-standard` | `--radius-md` | Alerts, popovers, ícones               |
| `12px`   | `rounded-comfortable` | `--radius-lg` | Cards, kanban-column                  |
| `16px`   | `rounded-large` | —           | Modais                                  |
| `9999px` | `rounded-pill`  | `--radius-full` | Badges arredondadas, status         |

⚠️ **Não invente valores** (`rounded-[10px]`). Se precisar de outro, justifique
e adicione como token novo.

---

## Sombras

| Token CSS         | Uso                                       |
| ----------------- | ----------------------------------------- |
| `--shadow-card`   | Card padrão (sutil, multi-layer)          |
| `--shadow-deep`   | Hover de card, modal, popover, dropdown   |
| `--shadow-sm`     | Sombra mínima (legacy, evitar)            |
| `0 0 0 2px var(--notion-blue-focus)` | Anel de foco (já em `:focus-visible` global) |

⚠️ **Sombra colorida é proibida.** Apenas preto com alpha baixo.

---

## Transições

| Variável            | Valor          | Uso                            |
| ------------------- | -------------- | ------------------------------ |
| `--transition-fast` | `150ms ease`   | Hover, foco, mudança de cor    |
| (custom)            | `200ms ease`   | Mudança de layout, transform   |
| (custom)            | `220ms ease-out` | Entrada de página              |

```css
transition: background 150ms, color 150ms;
transition: box-shadow 200ms ease, transform 200ms ease;
```

---

## Z-index

| Valor   | Uso                                                |
| ------- | -------------------------------------------------- |
| `30`    | Modal overlay                                      |
| `40`    | Sidebar                                            |
| `100`   | Sidebar mobile (drawer aberto), popovers locais    |
| `9999`  | Toast, Radix Popper (Select / Popover dropdowns)   |

**Não use valores fora desta escala** sem justificar.

---

## Como adicionar um token novo

1. Defina a variável CSS em `src/index.css` (no `:root` E no `.dark`).
2. Se for cor/font/radius/shadow, adicione no `tailwind.config.js`.
3. Documente aqui em `tokens.md`.
4. Use o token, não o valor literal.

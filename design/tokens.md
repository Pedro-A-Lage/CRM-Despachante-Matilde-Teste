# Design Tokens — CRM Despachante Matilde

> Tokens do **Claude Design v1.0** (warm neutrals + âmbar + Fraunces/Inter/Plex Mono).
> Referência visual completa em [`assets/claude-design/design-system.html`](./assets/claude-design/design-system.html).
> Definidos em [`src/index.css`](../src/index.css) e expostos pro Tailwind em
> [`tailwind.config.js`](../tailwind.config.js). **Nunca hardcode valores.**

⚠️ **Compat:** os nomes `--notion-*` foram mantidos por serem usados em 2190
lugares no código, mas os **valores foram trocados** pela paleta Claude Design.

---

## Cores

### Accent — Âmbar (ação primária)

| Token CSS          | Hex       | Tailwind        | Uso                              |
| ------------------ | --------- | --------------- | -------------------------------- |
| `--accent-softer`  | `#fdf4e4` | `bg-amber-softer` | Fundo muito sutil, hover suave |
| `--accent-soft`    | `#fde9c9` | `bg-amber-soft` | Badge bg, fundo hover, sidebar ativa |
| `--notion-blue` (!) | `#c26a12` | `bg-blue` / `bg-amber` | **Base** — ação primária, link  |
| `--accent-hover`   | `#a9580a` | `bg-amber-hover` | Hover do botão primário         |
| `--accent-strong`  | `#8a4606` | `bg-amber-strong` | Badge text, accent escuro       |
| `--accent-ink`     | `#3a1d03` | `bg-amber-ink`  | Hero escuro                      |

⚠️ `--notion-blue` hoje **não é azul** — é âmbar `#c26a12`. O nome permaneceu
por compatibilidade com o código existente. Para escrever código novo, prefira
a classe Tailwind `bg-amber` / `text-amber` ou `bg-blue` / `text-blue`
(ambas apontam pro mesmo token).

### Neutros — Warm

| Token CSS              | Light     | Dark      | Tailwind           | Uso                              |
| ---------------------- | --------- | --------- | ------------------ | -------------------------------- |
| `--notion-bg`          | `#fbf9f6` | `#1b1a17` | `bg-bg` / `bg-warm-bg` | Fundo principal warm cream  |
| `--notion-bg-alt`      | `#f4f1ec` | `#25231f` | `bg-bg-alt` / `bg-warm-bg-2` | Sidebar, áreas 2ª    |
| `--warm-bg-3`          | `#ece7df` | `#2f2c28` | `bg-warm-bg-3`     | Badge neutro, chip              |
| `--notion-surface`     | `#ffffff` | `#2a2724` | `bg-surface`       | Cards, modais, popovers          |
| `--notion-border`      | `#e8e3da` | `rgba(253,244,228,.12)` | `border-border` | Todas as bordas         |
| `--warm-border-strong` | `#d4ccbe` | `rgba(253,244,228,.2)` | `border-warm-border-strong` | Bordas de input |

### Texto

| Token CSS                | Light     | Dark      | Tailwind              | Uso                              |
| ------------------------ | --------- | --------- | --------------------- | -------------------------------- |
| `--notion-text`          | `#1b1a17` | `#fdf4e4` | `text-text`           | Texto principal (warm black)     |
| `--notion-text-secondary`| `#4a4640` | `#c8beaf` | `text-text-secondary` | Labels, texto auxiliar           |
| `--notion-text-muted`    | `#7a7368` | `#8a8275` | `text-text-muted`     | Placeholders, captions           |
| `--text-muted-warm`      | `#a39b8e` | `#6b6357` | —                     | Muted extra (ícones discretos)   |

### Status semânticos

| Token CSS                  | Light     | Dark      | Tailwind              | Uso                          |
| -------------------------- | --------- | --------- | --------------------- | ---------------------------- |
| `--status-success`         | `#2f7a3d` | `#6fc77f` | `text-status-success` | Sucesso, aprovado, pago      |
| `--status-success-soft`    | `#e2f1db` | rgba      | `bg-status-success-soft` | Badge success bg          |
| `--status-warn`            | `#a66a00` | `#e0a040` | `text-status-warn`    | Aviso, pendente              |
| `--status-warn-soft`       | `#fbecc8` | rgba      | `bg-status-warn-soft` | Badge warn bg                |
| `--status-danger`          | `#b1361d` | `#e27560` | `text-status-danger`  | Erro, excluir                |
| `--status-danger-soft`     | `#fbdbce` | rgba      | `bg-status-danger-soft` | Badge danger bg           |
| `--status-info`            | `#1f5a8a` | `#5aa3d8` | `text-status-info`    | Informativo, DETRAN          |
| `--status-info-soft`       | `#dce9f3` | rgba      | `bg-status-info-soft` | Badge info bg                |

### Aliases legacy

- `--notion-green` → aponta pra `--status-success` (mesmo valor)
- `--notion-orange` → aponta pra `--status-warn`
- `--notion-teal` → aponta pra `--status-info`
- `--notion-pink`, `--notion-purple`, `--notion-brown` → preservados (tags especiais)

### Aliases shadcn/ui (HSL)

`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`,
`--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring` — todos
definidos em HSL e remapeados pra warm + âmbar. Não mexer sem sincronizar.

---

## Tipografia

### Famílias

| Variável          | Valor                                            | Uso                          |
| ----------------- | ------------------------------------------------ | ---------------------------- |
| `--font-display`  | `'Fraunces', 'Inter', Georgia, serif`            | Hero, display, títulos especiais |
| `--font-body`     | `'Inter', -apple-system, system-ui, sans-serif`  | Corpo, h1/h2/h3, UI          |
| `--font-mono`     | `'IBM Plex Mono', ui-monospace, Menlo, monospace` | Placas, IDs, valores R$     |

### Classes utilitárias

```html
<h1 class="font-display">Despachante Matilde</h1>
<span class="font-mono">OS-2615 · FAX-2K44 · R$ 1.671,20</span>
<p class="font-body">Corpo normal.</p>
```

Via Tailwind: `font-display`, `font-mono`, `font-sans` (Inter default).

### Escala (Tailwind, peso recomendado ao lado)

| Role        | Classe Tailwind     | Tamanho   | Peso | Família  | Uso                            |
| ----------- | ------------------- | --------- | ---- | -------- | ------------------------------ |
| Display     | `text-display-hero` | `4.00rem` | 500  | Fraunces | Hero de landing                |
| H1          | `text-card-title` (1.38rem+) ou custom 32px | —  | 600  | Inter    | Módulo principal       |
| H2          | 22px                | —         | 600  | Inter    | Página padrão                  |
| H3          | `text-body-lg` ou 15px | —      | 600  | Inter    | Dentro de card                 |
| Body        | `text-sm` / 14px    | `0.875rem`| 400  | Inter    | Corpo                          |
| Caption     | `text-caption`      | `0.88rem` | 500  | Inter    | Metadados, timestamps          |
| Eyebrow     | `text-badge-text`   | `0.75rem` | 600  | Inter    | UPPERCASE, section labels      |
| Mono        | `font-mono text-[13px]` | —    | 500  | Plex Mono | Placas, IDs, valores R$       |

---

## Espaçamento

Múltiplos de 4. Variáveis CSS e escala Tailwind alinhadas.

| Variável     | Valor   | Tailwind | Uso típico                         |
| ------------ | ------- | -------- | ---------------------------------- |
| `--space-1`  | `4px`   | `p-1`    | Gap mínimo                         |
| `--space-2`  | `8px`   | `p-2`    | Padding interno mínimo             |
| `--space-3`  | `12px`  | `p-3`    | Gap padrão                         |
| `--space-4`  | `16px`  | `p-4`    | Padding de card                    |
| `--space-5`  | `20px`  | `p-5`    | Padding maior                      |
| `--space-6`  | `24px`  | `p-6`    | Padding de página                  |
| `--space-8`  | `32px`  | `p-8`    | Seção                              |

---

## Border radius

| Valor    | Tailwind              | Uso                                 |
| -------- | --------------------- | ----------------------------------- |
| `4px`    | `rounded-micro`       | Inputs, badges retangulares         |
| `5px`    | `rounded-subtle`      | Sidebar links                       |
| `8px`    | `rounded-standard`    | Alerts, popovers                    |
| `12px`   | `rounded-comfortable` | Cards, kanban                       |
| `16px`   | `rounded-large`       | Modais                              |
| `9999px` | `rounded-pill`        | Badges arredondadas                 |

---

## Sombras (warm-toned)

| Token CSS         | Uso                                       |
| ----------------- | ----------------------------------------- |
| `--shadow-card`   | Card padrão (rgba(40,30,14, low alpha))  |
| `--shadow-deep`   | Hover, modal, popover                     |
| `--shadow-sm`     | Sombra mínima (legacy)                    |

⚠️ Sombras agora usam **rgba(40,30,14,..)** (marrom) em vez de preto puro —
combina com a paleta warm.

---

## Focus ring

```css
*:focus-visible {
  outline: 2px solid var(--notion-blue-focus);  /* âmbar */
  outline-offset: 2px;
}
```

Para inputs com `box-shadow`:

```css
box-shadow: 0 0 0 2px var(--accent-soft);   /* anel âmbar suave */
```

---

## Z-index (inalterado)

| Valor   | Uso                                                |
| ------- | -------------------------------------------------- |
| `30`    | Modal overlay                                      |
| `40`    | Sidebar                                            |
| `100`   | Sidebar mobile drawer, popovers locais             |
| `9999`  | Toast, Radix Popper (Select / Popover)             |

---

## Placa (plate) — componente da marca

Identidade visual exclusiva: placas de veículo em Plex Mono sobre fundo
escuro warm. Não existe no Tailwind — adicione como classe `.plate` quando
necessário:

```css
.plate {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--accent-ink);      /* #3a1d03 */
  color: #fff8e8;
  font-family: var(--font-mono);
  font-weight: 600;
  letter-spacing: 0.04em;
}
```

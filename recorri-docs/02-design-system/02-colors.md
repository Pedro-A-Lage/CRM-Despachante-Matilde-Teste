# Cores — paleta completa

> Canônico em [`design/tokens.md`](../../design/tokens.md) e
> [`src/index.css`](../../src/index.css). Nunca hardcode hex.

---

## Accent — Âmbar (ação primária)

⚠️ **Nome histórico:** `--notion-blue` hoje **não é azul** — é âmbar `#c26a12`.
Foi mantido por estar usado em 2190 lugares. Código novo deve preferir
`text-amber` / `bg-amber` (alias Tailwind) ou `var(--notion-blue)`.

| Token CSS          | Hex       | Tailwind           | Uso                              |
| ------------------ | --------- | ------------------ | -------------------------------- |
| `--accent-softer`  | `#fdf4e4` | `bg-amber-softer`  | Fundo muito sutil, hover suave   |
| `--accent-soft`    | `#fde9c9` | `bg-amber-soft`    | Badge bg, fundo hover, sidebar ativa |
| `--notion-blue`    | `#c26a12` | `bg-blue` / `bg-amber` | **Base** — ação primária, link |
| `--accent-hover`   | `#a9580a` | `bg-amber-hover`   | Hover do botão primário          |
| `--accent-strong`  | `#8a4606` | `bg-amber-strong`  | Badge text, accent escuro        |
| `--accent-ink`     | `#3a1d03` | `bg-amber-ink`     | Hero escuro, placa               |

---

## Neutros — Warm

| Token CSS              | Light     | Dark      | Tailwind                      | Uso                     |
| ---------------------- | --------- | --------- | ----------------------------- | ----------------------- |
| `--notion-bg`          | `#fbf9f6` | `#1b1a17` | `bg-bg` / `bg-warm-bg`        | Fundo principal         |
| `--notion-bg-alt`      | `#f4f1ec` | `#25231f` | `bg-bg-alt` / `bg-warm-bg-2`  | Sidebar, áreas 2ª       |
| `--warm-bg-3`          | `#ece7df` | `#2f2c28` | `bg-warm-bg-3`                | Badge neutro, chip      |
| `--notion-surface`     | `#ffffff` | `#2a2724` | `bg-surface`                  | Cards, modais, popovers |
| `--notion-border`      | `#e8e3da` | rgba      | `border-border`               | Todas as bordas         |
| `--warm-border-strong` | `#d4ccbe` | rgba      | `border-warm-border-strong`   | Bordas de input         |

---

## Texto (3 níveis — use só estes)

| Token CSS                 | Light     | Dark      | Tailwind              | Quando                     |
| ------------------------- | --------- | --------- | --------------------- | -------------------------- |
| `--notion-text`           | `#1b1a17` | `#fdf4e4` | `text-text`           | Texto principal            |
| `--notion-text-secondary` | `#4a4640` | `#c8beaf` | `text-text-secondary` | Labels, auxiliar           |
| `--notion-text-muted`     | `#7a7368` | `#8a8275` | `text-text-muted`     | Placeholder, caption       |

⚠️ Texto em cor fora desses 3 níveis é bug (exceto status/ação primária).

---

## Status (semânticos)

Sucesso, aviso, erro, informativo. Use `-soft` para fundo de badge/banner.

| Token CSS                  | Light     | Tailwind                  | Uso                      |
| -------------------------- | --------- | ------------------------- | ------------------------ |
| `--status-success`         | `#2f7a3d` | `text-status-success`     | Sucesso, pago, aprovado  |
| `--status-success-soft`    | `#e2f1db` | `bg-status-success-soft`  | Badge/banner success     |
| `--status-warn`            | `#a66a00` | `text-status-warn`        | Aviso, pendente          |
| `--status-warn-soft`       | `#fbecc8` | `bg-status-warn-soft`     | Badge/banner warn        |
| `--status-danger`          | `#b1361d` | `text-status-danger`      | Erro, excluir            |
| `--status-danger-soft`     | `#fbdbce` | `bg-status-danger-soft`   | Badge/banner danger      |
| `--status-info`            | `#1f5a8a` | `text-status-info`        | Informativo, DETRAN      |
| `--status-info-soft`       | `#dce9f3` | `bg-status-info-soft`     | Badge/banner info        |

---

## Mapa: status da OS → cor

Conveção de UI na OS para cada status (ver `STATUS_OS_LABELS` em `src/types.ts`):

| Status                    | Token                     |
| ------------------------- | ------------------------- |
| `aguardando_documentacao` | `--status-warn` (warn)    |
| `vistoria`                | `--status-info` (info)    |
| `delegacia`               | `--notion-purple`         |
| `doc_pronto`              | `--status-success` (success) |
| `entregue`                | `--notion-text-muted` (muted) |

---

## Aliases legacy (mantidos — podem aparecer no código)

- `--notion-green` → `--status-success`
- `--notion-orange` → `--status-warn`
- `--notion-teal` → `--status-info`
- `--notion-pink`, `--notion-purple`, `--notion-brown` — tags especiais.

---

## shadcn/ui (HSL)

Definidos em `:root` do [`src/index.css`](../../src/index.css):

`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`,
`--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`.

Remapeados para warm + âmbar. Ao adicionar componente shadcn com
`npx shadcn@latest add <nome>`, revise se está usando essas variáveis.

---

## Placa (plate) — identidade da marca

Placa de veículo em Plex Mono sobre fundo escuro warm (`--accent-ink`). Use
a classe `.plate` (definida em `index.css`):

```html
<span class="plate">FAX-2K44</span>
```

---

## Como escolher

| Caso                                | Use…                                      |
| ----------------------------------- | ----------------------------------------- |
| Texto normal                        | `text-text`                               |
| Label ou auxiliar                   | `text-text-secondary`                     |
| Placeholder ou timestamp            | `text-text-muted`                         |
| Botão primário                      | `.btn .btn-primary` (já aplica amber)     |
| Link                                | `text-amber` (+ `hover:text-amber-hover`) |
| Status de OS / badge                | `.badge badge-<tipo>`                     |
| Banner com aviso                    | `.alert alert-warning`                    |
| Card / modal                        | `bg-surface` + `border-border`            |
| Sidebar / área secundária           | `bg-bg-alt`                               |
| Placa de carro                      | `.plate` + `font-mono`                    |

Se nenhum encaixa, **pare e pergunte** antes de hardcodar.

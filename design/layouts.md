# Layouts — CRM Despachante Matilde

> Estruturas de página padrão. Toda página nova deve seguir uma destas.

---

## App shell — `.app-layout`

```
┌──────────┬──────────────────────────────┐
│          │ .main-header                 │
│ .sidebar ├──────────────────────────────┤
│  220px   │                              │
│          │ .main-body  (max-width 1600) │
│          │                              │
└──────────┴──────────────────────────────┘
```

```html
<div class="app-layout">
  <aside class="sidebar">…</aside>
  <main class="main-content">
    <header class="main-header">
      <h1>Título da Página</h1>
      <div class="actions">…</div>
    </header>
    <div class="main-body">
      <!-- conteúdo da página -->
    </div>
  </main>
</div>
```

- `sidebar` é **220px** fixos (vira drawer ≤768px).
- `main-body` tem padding `24px` e centraliza filhos com `max-width: 1600px`.
- Animação de entrada (`page-fade-in 0.22s`) já aplicada.

---

## Sidebar — `.sidebar` / `.sidebar-nav` / `.sidebar-link`

```html
<aside class="sidebar">
  <div class="sidebar-logo">
    <img src="/logo.svg" />
    <span class="sidebar-logo-name">Matilde</span>
  </div>

  <nav class="sidebar-nav">
    <div class="sidebar-section">
      <span class="sidebar-section-title">Operacional</span>
    </div>

    <div class="sidebar-group">
      <a class="sidebar-link active">
        <DashboardIcon /> Dashboard
      </a>
      <a class="sidebar-link">
        <OSIcon /> Ordens de Serviço
      </a>
    </div>
  </nav>
</aside>
```

- `.sidebar-section-title` — uppercase pequeno (`0.688rem`).
- `.sidebar-link.active` — fundo azul claro, texto azul, peso 600.
- Ícones são 16×16 e usam cor `--notion-text-muted` (azul quando ativo).

### Drawer mobile

≤768px:
- Sidebar fica `position: fixed`, `transform: translateX(-100%)`.
- Adicione classe `.open` para mostrar (slide-in).
- Largura no mobile: 260px.

---

## Header de página — `.main-header`

```html
<header class="main-header">
  <h1>Título</h1>
  <div class="header-actions">
    <button class="btn btn-primary">Nova OS</button>
  </div>
</header>
```

- Padding `12px 24px`, border-bottom `1px solid border`.
- `h1` é `1.375rem`, weight 700.
- Mobile: padding reduz para `10px 14px`, h1 para `1.1rem`.

---

## Page header (dentro do `main-body`) — `.page-header`

```html
<div class="page-header">
  <h1>Clientes</h1>
  <p class="page-header-subtitle">Gerencie todos os clientes</p>
</div>
```

Margin-bottom 24px. Use quando precisar de subtítulo descritivo.

---

## Dashboard — `.dashboard-grid` + `.dashboard-stat-grid`

```html
<div class="page-header">…</div>

<!-- linha de stats no topo -->
<div class="dashboard-stat-grid">
  <div class="stat-card">…</div>
  <div class="stat-card">…</div>
</div>

<!-- grid de cards de conteúdo (responsivo) -->
<div class="dashboard-grid">
  <div class="card">…</div>
  <div class="card">…</div>
</div>
```

- `dashboard-stat-grid` — auto-fit, mínimo 180px.
- `dashboard-grid` — auto-fit, mínimo 300px.
- Mobile: dashboard-grid colapsa para 1 coluna.

---

## Lista de OS — `.oslist-topbar` + `.oslist-statusbar`

```html
<div class="oslist-topbar">
  <div class="search-bar">…</div>
  <div class="actions">
    <button class="btn btn-primary">Nova OS</button>
  </div>
</div>

<div class="oslist-statusbar">
  <button>Todas (124)</button>
  <button>Abertas (23)</button>
  <!-- … -->
</div>

<div class="card">
  <table class="table">…</table>
</div>
```

---

## Detalhe da OS — `.os-detail-container` + `.os-main-row`

```html
<div class="os-detail-container">
  <div class="os-header-grid">
    <div>
      <h1>OS #1234</h1>
      <span class="badge badge-success">Ativa</span>
    </div>
    <div class="os-header-aside">
      <button class="btn btn-secondary">Imprimir</button>
      <button class="btn btn-primary">Concluir</button>
    </div>
  </div>

  <div class="os-main-row">
    <div class="card" style="flex: 1;">
      <!-- conteúdo principal -->
    </div>
    <aside class="os-vehicle-sticky" style="width: 320px;">
      <!-- card lateral fixo -->
    </aside>
  </div>
</div>
```

- `os-vehicle-sticky` é `position: sticky` em desktop, vira `static` ≤1080px.
- `os-main-row` quebra em coluna em mobile.

---

## Modal padrão

```html
<div class="modal-overlay">
  <div class="modal" style="max-width: 600px;">
    <div class="modal-header">
      <h2 class="modal-title">Editar Cliente</h2>
      <button class="modal-close">×</button>
    </div>
    <div class="modal-body">
      <div class="form-row">…</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost">Cancelar</button>
      <button class="btn btn-primary">Salvar</button>
    </div>
  </div>
</div>
```

⚠️ Largura: defina `max-width` em px no inline (até `800px`). Modal ocupa
100vw em ≤768px (vira bottom-sheet).

---

## Responsividade — breakpoints

| Breakpoint | Quem é afetado                                       |
| ---------- | ---------------------------------------------------- |
| `≤1080px`  | `os-main-row` quebra em coluna, sidebar OS vira full |
| `≤900px`   | `oslist-statusbar` ganha scroll horizontal           |
| `≤768px`   | Sidebar vira drawer; modal vira bottom-sheet; stat-grid 2 cols; tabelas 600px min com scroll-x |
| `≤380px`   | Stat-grid 1 col; padding mínimo em main-body         |

⚠️ Não invente breakpoints novos. Adicione regras dentro destes ranges.

---

## Padrões anti-pattern (não fazer)

- ❌ Usar `position: absolute` para "centralizar" — use flex/grid.
- ❌ Largura fixa em pixel para conteúdo principal — use `flex: 1`.
- ❌ Ignorar `.main-body > * { max-width: 1600px; … }` — não envolva o
  conteúdo da página em mais um wrapper que quebre essa regra.
- ❌ Header próprio dentro do `.main-body` quando o `.main-header` já existe.
- ❌ Sidebar redesenhada por página — sidebar é uma só.

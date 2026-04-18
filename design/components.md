# Componentes — CRM Despachante Matilde

> Catálogo dos componentes disponíveis. Todos definidos em
> [`src/index.css`](../src/index.css) e prontos para usar via classes utilitárias.
> Antes de criar componente novo, **procure aqui** se já existe.

---

## Botões — `.btn`

```html
<button class="btn btn-primary">Salvar</button>
<button class="btn btn-secondary">Cancelar</button>
<button class="btn btn-ghost">Voltar</button>
<button class="btn btn-danger">Excluir</button>
<button class="btn btn-outline-warning">Atenção</button>
<button class="btn btn-outline-danger">Cuidado</button>
```

Tamanhos: `.btn-sm`, `.btn-lg` (modificadores).

Agrupar: `<div class="btn-group">…</div>` (gap 6px, inline-flex).

⚠️ Use `disabled` real — `.btn:disabled` já estiliza opacity 0.5.

---

## Cards — `.card`

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Título</h3>
  </div>
  <div class="card-body">
    Conteúdo
  </div>
</div>
```

Hover eleva sombra automaticamente (`--shadow-card` → `--shadow-deep`).

### Stat cards — `.stat-card` dentro de `.stat-grid`

```html
<div class="stat-grid">
  <div class="stat-card">
    <div class="stat-card-icon primary">📊</div>
    <div class="stat-card-value">128</div>
    <div class="stat-card-label">OS Abertas</div>
  </div>
</div>
```

Variações de ícone: `.primary` `.success` `.warning` `.danger` `.info`.

---

## Forms

```html
<div class="form-row">
  <div class="form-group">
    <label class="form-label">Nome</label>
    <input class="form-input" type="text" />
    <span class="form-hint">Nome completo do cliente</span>
  </div>
  <div class="form-group">
    <label class="form-label">Tipo</label>
    <select class="form-select">…</select>
  </div>
</div>

<div class="form-actions">
  <button class="btn btn-primary">Salvar</button>
  <button class="btn btn-ghost">Cancelar</button>
</div>
```

Inputs nativos (`input`, `select`, `textarea`) já são estilizados globalmente —
não precisa de classe. Use `.form-input`/`.form-select`/`.form-textarea` para
garantir consistência em situações específicas (ex: inputs sem `type`).

⚠️ **Mobile:** font-size é forçado a 16px para evitar zoom no iOS — não
sobrescreva.

---

## Badges — `.badge`

```html
<span class="badge">Default</span>
<span class="badge badge-success">Ativo</span>
<span class="badge badge-warning">Pendente</span>
<span class="badge badge-danger">Erro</span>
<span class="badge badge-muted">Arquivado</span>
```

### Status badge (com dot)

```html
<span class="status-badge badge-success">
  <span class="dot" /> Aprovado
</span>
```

---

## Alerts — `.alert`

```html
<div class="alert alert-info">Mensagem informativa</div>
<div class="alert alert-warning">Atenção</div>
<div class="alert alert-danger">Erro crítico</div>
```

---

## Toasts — `.toast` / `.toast-container`

```html
<div class="toast-container">
  <div class="toast toast-success">
    <span class="toast-icon">✓</span>
    <span>Salvo com sucesso</span>
    <button class="toast-close">×</button>
  </div>
</div>
```

Variações: `.toast-success` `.toast-warning` `.toast-error` `.toast-info`.

---

## Tabelas — `.table` dentro de `.table-container`

```html
<div class="table-container">
  <table class="table">
    <thead>
      <tr><th>Cliente</th><th>Status</th></tr>
    </thead>
    <tbody>
      <tr class="table-row"><td>João</td><td>Ativo</td></tr>
    </tbody>
  </table>
</div>
```

Linha vazia: `<tr><td colspan="N" class="table-empty">Nenhum resultado</td></tr>`.

---

## Tabs — `.tabs` / `.tab`

```html
<div class="tabs">
  <button class="tab active">Geral</button>
  <button class="tab">Veículo</button>
  <button class="tab">Documentos</button>
</div>
```

Estado ativo: classe `.active` (sublinhado azul + cor azul).

---

## Modal — `.modal-overlay` / `.modal`

```html
<div class="modal-overlay">
  <div class="modal">
    <div class="modal-header">
      <h2 class="modal-title">Nova OS</h2>
      <button class="modal-close">×</button>
    </div>
    <div class="modal-body">
      …
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost">Cancelar</button>
      <button class="btn btn-primary">Salvar</button>
    </div>
  </div>
</div>
```

⚠️ **Mobile:** modal vira bottom-sheet automaticamente (≤768px). Não força.

---

## Toggle group — `.toggle-group`

```html
<div class="toggle-group">
  <button class="active">Todos</button>
  <button>Abertos</button>
  <button>Fechados</button>
</div>
```

Visual: pill segmentado, ativo em azul.

### Toggle button avulso — `.toggle-btn`

```html
<button class="toggle-btn active">Mensal</button>
<button class="toggle-btn">Anual</button>
```

---

## Search bar — `.search-bar`

```html
<div class="search-bar">
  <SearchIcon />
  <input placeholder="Buscar…" />
</div>
```

---

## Kanban — `.kanban-board` / `.kanban-column`

```html
<div class="kanban-board">
  <div class="kanban-column">
    <div class="kanban-column-header">
      <span class="kanban-column-title">Em andamento</span>
      <span class="kanban-column-count">5</span>
    </div>
    <div class="kanban-column-content">
      <div class="kanban-card">
        <div class="kanban-card-header">
          <span class="kanban-card-number">#1234</span>
          <span class="kanban-card-date">12/04</span>
        </div>
        <div class="kanban-card-body">
          <div class="kanban-card-row">
            <UserIcon class="kanban-card-icon" /> João
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## Info grid — `.info-grid` / `.info-item`

Para exibir pares "label: valor" em layout grid 2-col.

```html
<div class="info-grid">
  <div class="info-item">
    <span class="info-item-label">CPF</span>
    <span class="info-item-value">123.456.789-00</span>
  </div>
</div>
```

---

## Page header — `.page-header`

```html
<div class="page-header">
  <h1>Ordens de Serviço</h1>
  <p class="page-header-subtitle">Gerencie todas as OS do despachante</p>
</div>
```

---

## Empty state — `.empty-state`

```html
<div class="empty-state">
  <EmptyIcon />
  <p>Nenhum resultado encontrado</p>
</div>
```

---

## Loading — `.loading-spinner` + `.spin`

```html
<div class="loading-spinner">
  <Loader class="spin" />
</div>
```

---

## Lista de clientes/veículos

- Grid de cards: `.clientes-card-grid` ou `.veiculos-card-grid`
- Lista vertical: `.clientes-list-grid` ou `.veiculos-list-grid`

---

## Componentes shadcn/ui

Configuração em [`components.json`](../components.json). Componentes ficam em
`src/components/ui/`. Use o CLI quando precisar adicionar um novo:

```bash
npx shadcn@latest add dialog
```

⚠️ Sempre revise se o componente shadcn está usando `--background`,
`--foreground`, etc — se não, adapte para os tokens Notion.

---

## Quando criar um componente novo

1. **Verifique aqui primeiro.** 90% das vezes já existe.
2. Se for variação, adicione como modificador (`.btn-variant-x`).
3. Se for novo, defina em `src/index.css` com prefixo claro
   (`.kanban-card-icon`, não `.icon`).
4. Documente neste arquivo.
5. Use os tokens — nunca hardcode.

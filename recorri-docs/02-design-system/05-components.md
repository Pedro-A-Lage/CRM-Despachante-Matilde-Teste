# Componentes

> Catálogo dos componentes disponíveis. **Antes de criar um novo, procure
> aqui.** Canônico em [`design/components.md`](../../design/components.md).

Os componentes são definidos em [`src/index.css`](../../src/index.css) como
classes utilitárias. Os React components ficam em
[`src/components/`](../../src/components/).

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

Tamanhos: `.btn-sm`, `.btn-lg`. Agrupar: `<div class="btn-group">…</div>`.

⚠️ Use `disabled` real — `.btn:disabled` já estiliza opacidade 0.5.

---

## Cards — `.card`

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Título</h3>
  </div>
  <div class="card-body">Conteúdo</div>
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
    <span class="form-hint">Nome completo</span>
  </div>
</div>

<div class="form-actions">
  <button class="btn btn-primary">Salvar</button>
  <button class="btn btn-ghost">Cancelar</button>
</div>
```

Inputs nativos (`input`, `select`, `textarea`) já estão estilizados
globalmente — não precisa classe para o caso padrão.

⚠️ **Mobile:** `font-size: 16px` forçado (iOS zoom). Não sobrescreva.

---

## Badges — `.badge`

```html
<span class="badge">Default</span>
<span class="badge badge-success">Ativo</span>
<span class="badge badge-warning">Pendente</span>
<span class="badge badge-danger">Erro</span>
<span class="badge badge-muted">Arquivado</span>
```

Status com dot:

```html
<span class="status-badge badge-success">
  <span class="dot" /> Aprovado
</span>
```

---

## Alerts

```html
<div class="alert alert-info">Mensagem informativa</div>
<div class="alert alert-warning">Atenção</div>
<div class="alert alert-danger">Erro crítico</div>
```

---

## Toasts

React component em [`src/components/Toast.tsx`](../../src/components/Toast.tsx).
Use via `useToast()` do ConfirmProvider.

```html
<div class="toast-container">
  <div class="toast toast-success">
    <span class="toast-icon">✓</span>
    <span>Salvo com sucesso</span>
    <button class="toast-close">×</button>
  </div>
</div>
```

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

Linha vazia:

```html
<tr><td colspan="N" class="table-empty">Nenhum resultado</td></tr>
```

Em mobile (≤768px), tabelas ganham `min-width: 600px` e scroll-x automático.

---

## Tabs

```html
<div class="tabs">
  <button class="tab active">Geral</button>
  <button class="tab">Veículo</button>
  <button class="tab">Documentos</button>
</div>
```

Estado ativo: `.active` (sublinhado âmbar + cor âmbar).

---

## Modais — `.modal-overlay` / `.modal`

Base reutilizável em [`src/components/ModalBase.tsx`](../../src/components/ModalBase.tsx).

```html
<div class="modal-overlay">
  <div class="modal" style="max-width: 600px;">
    <div class="modal-header">
      <h2 class="modal-title">Nova OS</h2>
      <button class="modal-close">×</button>
    </div>
    <div class="modal-body">…</div>
    <div class="modal-footer">
      <button class="btn btn-ghost">Cancelar</button>
      <button class="btn btn-primary">Salvar</button>
    </div>
  </div>
</div>
```

⚠️ Em ≤768px vira bottom-sheet automaticamente. Não force.

Modais específicos do domínio (grandes):

- `NovaOSModal.tsx` — nova OS com wizard.
- `ClienteEditFullModal.tsx` — edição completa do cliente.
- `VeiculoEditFullModal.tsx` — edição completa do veículo.
- `EmpresaEditModal.tsx` — editar empresa parceira.
- `ServiceEditModal.tsx` — editar serviço Detran.
- `ReciboReembolsoModal.tsx` — emitir recibo.
- `TrocarSenhaModal.tsx` — obrigatório no primeiro login.

---

## Confirm / AlertDialog

Use `useConfirm()` do [`ConfirmProvider`](../../src/components/ConfirmProvider.tsx)
(já provido em `App.tsx`):

```tsx
const confirm = useConfirm();
const ok = await confirm({
  title: 'Excluir OS?',
  description: 'Essa ação é irreversível.',
  confirmText: 'Excluir',
  variant: 'danger',
});
if (ok) await deleteOS(id);
```

---

## Toggle group — `.toggle-group`

```html
<div class="toggle-group">
  <button class="active">Todos</button>
  <button>Abertos</button>
  <button>Fechados</button>
</div>
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

React component em [`src/components/OSKanban.tsx`](../../src/components/OSKanban.tsx).

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

## Info grid — pares "label: valor"

```html
<div class="info-grid">
  <div class="info-item">
    <span class="info-item-label">CPF</span>
    <span class="info-item-value">123.456.789-00</span>
  </div>
</div>
```

---

## Page header

```html
<div class="page-header">
  <h1>Clientes</h1>
  <p class="page-header-subtitle">Gerencie todos os clientes</p>
</div>
```

React: [`src/components/PageHeader.tsx`](../../src/components/PageHeader.tsx).

---

## Empty state

```html
<div class="empty-state">
  <EmptyIcon />
  <p>Nenhum resultado encontrado</p>
</div>
```

React: [`src/components/EmptyState.tsx`](../../src/components/EmptyState.tsx).

---

## Loading

```html
<div class="loading-spinner">
  <Loader class="spin" />
</div>
```

React: [`src/components/LoadingSpinner.tsx`](../../src/components/LoadingSpinner.tsx).

---

## Help tooltip

Tooltip padronizado com ponto-de-interrogação:

```tsx
import { HelpTooltip } from '@/components/HelpTooltip';
<HelpTooltip content="Texto que explica o campo" />
```

---

## Progress disclosure

Collapse/expand de seção pesada (usada em `OSDetail.tsx`):

```tsx
<ProgressDisclosure title="Transferência" defaultOpen={false}>
  …
</ProgressDisclosure>
```

---

## shadcn/ui

Config em [`components.json`](../../components.json). Componentes em
`src/components/ui/`. Adicionar novo:

```bash
npx shadcn@latest add dialog
```

⚠️ Revise se está usando `--background`, `--foreground`, etc — se não,
adapte pros tokens do design system.

Instalados: `alert-dialog`, `dialog`, `label`, `select`, `slot`, `switch`,
`tabs`.

---

## Quando criar componente novo

1. **Olhou aqui?** Provavelmente já existe.
2. Se for variação: adicione como modificador (`.btn-variant-x`), não novo
   componente.
3. Se é mesmo novo:
   - Defina em `src/index.css` com prefixo claro (`.kanban-card-icon`, não
     `.icon`).
   - Documente aqui e em `design/components.md`.
   - Use tokens — não hardcode.
4. Atualize o checklist de PR.

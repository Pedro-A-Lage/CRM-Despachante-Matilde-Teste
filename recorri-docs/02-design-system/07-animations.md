# Animações e transições

> Minimalismo também vale para movimento. Animação é pra informar mudança de
> estado, não pra decorar.

---

## Regras de ouro

1. **≤ 220ms.** Nenhuma transição pode demorar mais.
2. **Infinita só em loading** (`.spin`). Nada mais.
3. **Ease out** como default (não `linear`).
4. **`prefers-reduced-motion`** respeitado — se o SO desativou animações,
   respeitamos.

---

## Transição padrão

Definida no CSS global ([`src/index.css`](../../src/index.css)):

```css
transition: background-color 150ms ease, color 150ms ease,
            box-shadow 150ms ease, border-color 150ms ease,
            transform 150ms ease;
```

Aplica em botões, links, cards, inputs. **Não use duração custom** — use
os presets do Tailwind:

- `duration-100` — 100ms (micro)
- `duration-150` — 150ms (padrão de UI)
- `duration-200` — 200ms (hover de card, revela menu)

---

## Animações nomeadas (prontas)

### `page-fade-in` — entrada de página

```css
@keyframes page-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Aplicada automaticamente em `.main-body` (0.22s, ease-out). Você não precisa
chamar manualmente — ela dispara toda vez que o React renderiza uma página
nova.

### `spin` — loading

```css
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }
```

Único caso de animação infinita. Use em ícones de loading:

```tsx
<Loader2 className="spin" size={16} />
```

### `slide-up` — modal / drawer

Modal (desktop) e bottom-sheet (mobile) aparecem com `translate-y` rápido.
Já embutido nas classes `.modal-overlay` / `.modal` — não precisa reimplementar.

---

## Hover e focus

### Card

Sobe sombra:

```css
.card { box-shadow: var(--shadow-card); transition: box-shadow 150ms ease; }
.card:hover { box-shadow: var(--shadow-deep); }
```

### Botão

Escurece a cor:

```css
.btn-primary { background: var(--notion-blue); }
.btn-primary:hover { background: var(--accent-hover); }
```

### Link

```css
a { color: var(--notion-blue); }
a:hover { color: var(--accent-hover); }
```

### Focus

```css
*:focus-visible {
  outline: 2px solid var(--notion-blue-focus);
  outline-offset: 2px;
}
```

Nunca remova sem substituir.

---

## Drag, reorder, swipe

**Não usamos** bibliotecas de drag-and-drop (dnd-kit, react-beautiful-dnd, etc).
O kanban é navegação por clique/menu, não drag. Se aparecer necessidade real,
discuta antes de adicionar.

---

## `prefers-reduced-motion`

O usuário pode desativar animação no SO (macOS: Acessibilidade → Exibir;
Windows: Facilidade de Acesso). Respeitamos:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Já está em `index.css`. Não sobrescreva.

---

## Anti-patterns

❌ `transition: all 300ms` — específico demais (`all`), lento demais (300ms).
❌ Animações com easing custom (`cubic-bezier`) — use os presets.
❌ Ícones "pulsando" decorativos.
❌ Toasts entrando com bounce.
❌ Scroll com `scroll-behavior: smooth` em listas longas (vira lento).
❌ Transição em `display: none ↔ block` (não funciona, use `visibility` +
   `opacity`).

---

## Quando você quer animar algo novo

1. Pergunte: **informa estado** ou **decora**?
2. Se decora, não faça.
3. Se informa, use a transição padrão (150ms ease) e um keyframe nomeado em
   `index.css`. Documente aqui.
4. Duração máxima **220ms**. Exceção: loading spinner e `page-fade-in`.

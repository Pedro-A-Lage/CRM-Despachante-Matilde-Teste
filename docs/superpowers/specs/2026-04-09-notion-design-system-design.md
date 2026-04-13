# Design System Notion no CRM Despachante Matilde

**Data:** 2026-04-09
**Status:** Draft — aguardando aprovação
**Escopo:** Aplicar o design system "awesome-design-md / Notion" em todo o CRM (light + dark derivado)

---

## 1. Objetivo

Migrar a linguagem visual do CRM Despachante para o design system inspirado na Notion (warm neutrals, whisper borders, multi-layer shadows, Inter typography com letter-spacing negativo em display sizes), mantendo funcionalidade intacta.

**Critérios de sucesso:**
- Todos os primitivos compartilhados (`Button`, `Card`, `Input`, `Dialog`, `Badge`) consomem exclusivamente tokens Notion (nada hardcoded).
- Light e dark mode funcionando com toggle no header, persistência em `localStorage`, respeitando `prefers-color-scheme` no primeiro load.
- `npm run build` passa sem erros TS em todas as etapas.
- Visual das telas principais (Dashboard, Lista OS, Detalhe OS, NovaOSModal, Financeiro, Clientes) coerente com o spec Notion após a passada fina.

**Fora de escopo:**
- Extensão Chrome (`chrome-extension/`) — CSS inline próprio, fica como está.
- Backend, schema Supabase, lógica de negócio.
- Refatorações não relacionadas a visual.

---

## 2. Decisões (do brainstorming)

| # | Decisão |
|---|---|
| 1 | **Escopo:** app inteiro (tokens globais + primitivos + passada fina por tela) |
| 2 | **Fonte:** Inter via Google Fonts (substituta segura pra NotionInter proprietária) |
| 3 | **Dark mode:** light + dark derivado (Notion spec só cobre light; dark é interpretação) |
| 4 | **Toggle dark:** manual no header + localStorage + respeita `prefers-color-scheme` no 1º load |
| 5 | **Abordagem:** tokens + reescrita de primitivos (cascata automática nas telas) |

---

## 3. Tokens (single source of truth)

### 3.1 `src/index.css` — CSS variables

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  /* Backgrounds */
  --notion-bg: #ffffff;
  --notion-bg-alt: #f6f5f4;        /* warm white */
  --notion-surface: #ffffff;

  /* Text */
  --notion-text: rgba(0, 0, 0, 0.95);
  --notion-text-secondary: #615d59;  /* warm gray 500 */
  --notion-text-muted: #a39e98;      /* warm gray 300 */

  /* Border (whisper) */
  --notion-border: rgba(0, 0, 0, 0.1);

  /* Brand blue */
  --notion-blue: #0075de;
  --notion-blue-hover: #005bab;
  --notion-blue-focus: #097fe8;

  /* Badge */
  --notion-badge-bg: #f2f9ff;
  --notion-badge-text: #097fe8;

  /* Semantic accents */
  --notion-teal: #2a9d99;
  --notion-green: #1aae39;
  --notion-orange: #dd5b00;
  --notion-pink: #ff64c8;
  --notion-purple: #391c57;
  --notion-brown: #523410;

  /* Shadows */
  --shadow-card:
    rgba(0,0,0,0.04) 0px 4px 18px,
    rgba(0,0,0,0.027) 0px 2.025px 7.84688px,
    rgba(0,0,0,0.02) 0px 0.8px 2.925px,
    rgba(0,0,0,0.01) 0px 0.175px 1.04062px;

  --shadow-deep:
    rgba(0,0,0,0.01) 0px 1px 3px,
    rgba(0,0,0,0.02) 0px 3px 7px,
    rgba(0,0,0,0.02) 0px 7px 15px,
    rgba(0,0,0,0.04) 0px 14px 28px,
    rgba(0,0,0,0.05) 0px 23px 52px;
}

.dark {
  --notion-bg: #1a1a19;            /* warm near-black */
  --notion-bg-alt: #252522;        /* warm surface */
  --notion-surface: #2a2927;

  --notion-text: rgba(255, 255, 255, 0.95);
  --notion-text-secondary: #a39e98;
  --notion-text-muted: #615d59;

  --notion-border: rgba(255, 255, 255, 0.1);

  --notion-blue: #2b8fe8;          /* lighter for contrast on dark */
  --notion-blue-hover: #0075de;
  --notion-blue-focus: #62aef0;

  --notion-badge-bg: rgba(43, 143, 232, 0.15);
  --notion-badge-text: #62aef0;

  /* Sombras mais fortes em dark para visibilidade */
  --shadow-card:
    rgba(0,0,0,0.3) 0px 4px 18px,
    rgba(0,0,0,0.2) 0px 2px 8px,
    rgba(0,0,0,0.15) 0px 1px 3px;

  --shadow-deep:
    rgba(0,0,0,0.5) 0px 23px 52px,
    rgba(0,0,0,0.4) 0px 14px 28px,
    rgba(0,0,0,0.3) 0px 7px 15px,
    rgba(0,0,0,0.2) 0px 3px 7px;
}

html {
  font-family: 'Inter', -apple-system, system-ui, 'Segoe UI', sans-serif;
  font-feature-settings: "lnum", "locl";
  -webkit-font-smoothing: antialiased;
}

body {
  background-color: var(--notion-bg);
  color: var(--notion-text);
}
```

### 3.2 `tailwind.config.js` — mapeamento

```js
module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--notion-bg)',
        'bg-alt': 'var(--notion-bg-alt)',
        surface: 'var(--notion-surface)',
        text: 'var(--notion-text)',
        'text-secondary': 'var(--notion-text-secondary)',
        'text-muted': 'var(--notion-text-muted)',
        border: 'var(--notion-border)',
        blue: {
          DEFAULT: 'var(--notion-blue)',
          hover: 'var(--notion-blue-hover)',
          focus: 'var(--notion-blue-focus)',
        },
        badge: {
          bg: 'var(--notion-badge-bg)',
          text: 'var(--notion-badge-text)',
        },
        teal: 'var(--notion-teal)',
        green: 'var(--notion-green)',
        orange: 'var(--notion-orange)',
        pink: 'var(--notion-pink)',
        purple: 'var(--notion-purple)',
        brown: 'var(--notion-brown)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        'display-hero':    ['4.00rem', { lineHeight: '1.00', letterSpacing: '-2.125px', fontWeight: '700' }],
        'display-2':       ['3.38rem', { lineHeight: '1.04', letterSpacing: '-1.875px', fontWeight: '700' }],
        'section':         ['3.00rem', { lineHeight: '1.00', letterSpacing: '-1.5px',   fontWeight: '700' }],
        'sub-lg':          ['2.50rem', { lineHeight: '1.50', letterSpacing: 'normal',   fontWeight: '700' }],
        'sub':             ['1.63rem', { lineHeight: '1.23', letterSpacing: '-0.625px', fontWeight: '700' }],
        'card-title':      ['1.38rem', { lineHeight: '1.27', letterSpacing: '-0.25px',  fontWeight: '700' }],
        'body-lg':         ['1.25rem', { lineHeight: '1.40', letterSpacing: '-0.125px', fontWeight: '600' }],
        'body':            ['1.00rem', { lineHeight: '1.50', letterSpacing: 'normal',   fontWeight: '400' }],
        'nav':             ['0.94rem', { lineHeight: '1.33', letterSpacing: 'normal',   fontWeight: '600' }],
        'caption':         ['0.88rem', { lineHeight: '1.43', letterSpacing: 'normal',   fontWeight: '500' }],
        'badge':           ['0.75rem', { lineHeight: '1.33', letterSpacing: '0.125px',  fontWeight: '600' }],
      },
      borderRadius: {
        micro: '4px',
        subtle: '5px',
        standard: '8px',
        comfortable: '12px',
        large: '16px',
        pill: '9999px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        deep: 'var(--shadow-deep)',
        focus: '0 0 0 2px var(--notion-blue-focus)',
      },
    },
  },
};
```

---

## 4. Arquitetura

### 4.1 Novos arquivos

- **`src/contexts/ThemeContext.tsx`**
  - Exporta `ThemeProvider` e hook `useTheme()`
  - Estado: `'light' | 'dark'`
  - Init: lê `localStorage['theme']`; se ausente, usa `window.matchMedia('(prefers-color-scheme: dark)')`
  - Aplica classe `.dark` em `document.documentElement` via `useEffect`
  - Persiste em `localStorage` a cada mudança

- **`src/components/ThemeToggle.tsx`**
  - Botão ghost com ícone `Sun`/`Moon` de `lucide-react`
  - Usa `useTheme()` para toggle
  - Posicionado no header/sidebar (decidido na implementação, default: topo da sidebar)

### 4.2 Arquivos modificados (primitivos — cascata)

- `src/index.css` — substituído pelos tokens acima (backup do original como comentário ou git history)
- `tailwind.config.js` — substituído pelo mapeamento acima
- `src/main.tsx` — envolve `<App />` com `<ThemeProvider>`
- `src/components/ui/button.tsx` — `cva` variants: primary, secondary, ghost, pill + sizes sm/md/lg
- `src/components/ui/card.tsx` — bg surface, border whisper, radius comfortable, shadow card
- `src/components/ui/input.tsx` + `textarea.tsx` + `select.tsx` — bg surface, border, radius micro, focus ring
- `src/components/ui/dialog.tsx` — radius large, shadow deep, overlay `rgba(0,0,0,0.4)` + backdrop-blur
- `src/components/Badge.tsx` — pill (radius full), 12px/600, variants semânticas
- `src/components/ModalBase.tsx` — herda de dialog.tsx, aplica padding/spacing Notion
- `src/components/Layout.tsx` — wrapper usando tokens, sidebar bg `bg-alt`, border whisper
- `src/components/PageHeader.tsx` — title 26px/700 tracking -0.625px, description warm gray

### 4.3 Variants `cva` (exemplo: Button)

```ts
const buttonVariants = cva(
  "inline-flex items-center justify-center font-semibold transition-all focus-visible:outline-2 focus-visible:outline-blue-focus active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-blue text-white hover:bg-blue-hover rounded-micro",
        secondary: "bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.08)] text-text hover:bg-[rgba(0,0,0,0.08)] rounded-micro",
        ghost: "bg-transparent text-text hover:underline rounded-micro",
        pill: "bg-badge-bg text-badge-text rounded-pill text-badge tracking-[0.125px]",
      },
      size: {
        sm: "px-3 py-1.5 text-nav",
        md: "px-4 py-2 text-nav",
        lg: "px-5 py-3 text-body",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);
```

---

## 5. Plano de Migração (ordem de execução)

### PR 1 — Fundação
- Adicionar tokens em `index.css` (light + dark)
- Atualizar `tailwind.config.js`
- Criar `ThemeContext` + `ThemeToggle`
- Envolver `main.tsx` com `ThemeProvider`
- Adicionar toggle em local temporário do `Layout.tsx`
- **Verificação:** `npm run build` OK; toggle funciona (html muda `.dark`); app ainda visualmente igual (primitivos antigos)

### PR 2 — Primitivos
- Reescrever `ui/button.tsx`, `ui/card.tsx`, `ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx`, `ui/dialog.tsx`
- Reescrever `components/Badge.tsx`, `components/ModalBase.tsx`
- **Verificação:** `npm run build` OK; smoke test abrindo Dashboard, Lista OS, NovaOSModal em ambos os modos; nenhum texto invisível

### PR 3 — Shell
- Reescrever `Layout.tsx` (sidebar com `bg-alt`, border whisper)
- Reescrever `PageHeader.tsx` (tipografia Notion)
- Posicionar `ThemeToggle` definitivamente
- **Verificação:** chrome do app coerente com Notion; navegação funcional

### PR 4 — Passada fina (telas)
Ordem de revisão:
1. `pages/Dashboard.tsx`
2. `pages/OSList.tsx` + `OSKanban.tsx`
3. `pages/OSDetail.tsx`
4. `NovaOSModal.tsx` (já herda de modal base, mas pode ter classes inline)
5. `pages/Financeiro*` + `components/finance/*`
6. `pages/Clientes.tsx`
7. Demais páginas

Para cada tela:
- Grep por cores hardcoded (`text-gray-`, `bg-white`, `bg-gray-`, `text-black`, `border-gray-`)
- Substituir por tokens (`text-text-secondary`, `bg-surface`, `border-border` etc.)
- Aplicar tipografia Notion em títulos/headings
- Revisar sombras customizadas → `shadow-card` / `shadow-deep`
- Conferir dark mode na tela

### PR 5 — Polimento
- Focus rings consistentes
- Spacing rhythm (32-64px entre blocos principais)
- Screenshots finais before/after

---

## 6. Verificação & Testes

**Gates obrigatórios por PR:**
- `npm run build` passa (tsc strict + vite build)
- Smoke test manual: Dashboard, Lista OS, Detalhe OS, NovaOSModal em light e dark
- Nenhum texto invisível (contraste mínimo verificado visualmente)

**Não há testes automatizados de UI no projeto** — testes continuam manuais via browser (`npm run dev`).

**Screenshots sugeridos para review humano:**
- Dashboard (light + dark)
- Lista OS com Kanban (light + dark)
- NovaOSModal aberto (light + dark)

---

## 7. Riscos & Mitigações

| Risco | Mitigação |
|---|---|
| Cores hardcoded espalhadas em `pages/*.tsx` quebrando o visual em dark | Passada fina PR 4, grep sistemático |
| `OSKanban.tsx` com estilos inline complexos | Review manual dedicado |
| Contraste insuficiente em dark (ex: blue focus sobre surface escuro) | Ajuste dos tokens dark durante smoke test do PR 1 |
| Conflito com Radix (`@radix-ui/react-*`) CSS | Radix usa data-attributes, não cores — baixo risco; testar Dialog e Select especificamente |
| Fonte Inter carregando tarde (FOUT) | `display=swap` no `@import`; aceitar FOUT como padrão |

---

## 8. Referências

- Spec original: `DESIGN.md` do `awesome-design-md / notion` (https://getdesign.md/notion/design-md)
- Projeto atual: `src/components/ui/`, `src/index.css`, `tailwind.config.js`
- Stack: Vite 6 + React 18 + Tailwind 3 + shadcn/ui + Radix + cva + clsx + tailwind-merge

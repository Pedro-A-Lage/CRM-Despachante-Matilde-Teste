# Notion Design System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o CRM Despachante para o design system Notion (warm neutrals, whisper borders, multi-layer shadows, Inter + letter-spacing negativo) com light + dark mode, aplicando via tokens CSS + reescrita de primitivos para que as telas herdem o visual em cascata.

**Architecture:** CSS variables em `src/index.css` como single source of truth (light em `:root`, dark em `.dark`). `tailwind.config.js` mapeia os vars pra utilities Tailwind. Primitivos em `src/components/ui/` e componentes compartilhados consomem apenas tokens (zero cor hardcoded). `ThemeContext` controla a classe `.dark` no `<html>`. Passada fina posterior limpa cores hardcoded espalhadas nas telas.

**Tech Stack:** Vite 6 + React 18 + TypeScript (strict) + Tailwind 3 + shadcn/ui + Radix + `class-variance-authority` (cva) + clsx + tailwind-merge + lucide-react. Sem testes automatizados (gate = `npm run build` + smoke manual).

**Spec:** `docs/superpowers/specs/2026-04-09-notion-design-system-design.md`

**Out of scope:** extensão Chrome (`chrome-extension/`), backend/Supabase, lógica de negócio.

**Branching:** criar branch `feat/notion-design-system` a partir de `main` antes do Task 1 (não misturar com `feat/documentos-2via-crv`).

---

## File Structure

### Novos arquivos
| Path | Responsabilidade |
|---|---|
| `src/contexts/ThemeContext.tsx` | Estado `'light' \| 'dark'`, persistência em localStorage, respeita `prefers-color-scheme`, aplica `.dark` em `<html>` |
| `src/components/ThemeToggle.tsx` | Botão ghost Sun/Moon que chama `useTheme()` |

### Modificados (fundação + primitivos — cascata automática nas telas)
| Path | Mudança |
|---|---|
| `src/index.css` | Tokens CSS vars (light/dark), import Inter, base typography |
| `tailwind.config.js` | Mapeamento dos tokens → utilities |
| `src/main.tsx` | Wrap `<App />` com `<ThemeProvider>` |
| `src/components/ui/button.tsx` | Variants cva Notion (primary/secondary/ghost/pill) |
| `src/components/ui/card.tsx` | Tokens: surface, border whisper, shadow-card |
| `src/components/ui/input.tsx` | Tokens + focus ring |
| `src/components/ui/textarea.tsx` | Tokens + focus ring |
| `src/components/ui/select.tsx` | Tokens + focus ring |
| `src/components/ui/dialog.tsx` | Shadow-deep, radius large, overlay blur |
| `src/components/Badge.tsx` | Pill (radius full), 12px/600, variants semânticas |
| `src/components/ModalBase.tsx` | Herda novo dialog, spacing Notion |
| `src/components/Layout.tsx` | Sidebar bg-alt + border whisper + ThemeToggle |
| `src/components/PageHeader.tsx` | Tipografia `text-sub` (26px/700 -0.625) |

### Passada fina (tela-a-tela)
Revisão de `src/pages/*.tsx` + `src/components/finance/*` + `OSKanban.tsx` + `NovaOSModal.tsx` procurando cores hardcoded.

---

## Task 1: Branch + Tokens CSS

**Files:**
- Modify: `src/index.css` (substituição completa do bloco de variáveis)

- [ ] **Step 1: Criar branch**

```bash
cd c:/Users/pedro/Downloads/CRM-Despachante-Matilde-Teste-main
git checkout main
git pull
git checkout -b feat/notion-design-system
```

- [ ] **Step 2: Substituir topo de `src/index.css`**

Ler o arquivo atual primeiro. Substituir `@tailwind base; @tailwind components; @tailwind utilities;` para que os tokens sejam definidos ANTES das layers. Inserir o bloco abaixo logo no início (antes dos `@tailwind`):

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --notion-bg: #ffffff;
    --notion-bg-alt: #f6f5f4;
    --notion-surface: #ffffff;
    --notion-text: rgba(0, 0, 0, 0.95);
    --notion-text-secondary: #615d59;
    --notion-text-muted: #a39e98;
    --notion-border: rgba(0, 0, 0, 0.1);
    --notion-blue: #0075de;
    --notion-blue-hover: #005bab;
    --notion-blue-focus: #097fe8;
    --notion-badge-bg: #f2f9ff;
    --notion-badge-text: #097fe8;
    --notion-teal: #2a9d99;
    --notion-green: #1aae39;
    --notion-orange: #dd5b00;
    --notion-pink: #ff64c8;
    --notion-purple: #391c57;
    --notion-brown: #523410;
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
    --notion-bg: #1a1a19;
    --notion-bg-alt: #252522;
    --notion-surface: #2a2927;
    --notion-text: rgba(255, 255, 255, 0.95);
    --notion-text-secondary: #a39e98;
    --notion-text-muted: #615d59;
    --notion-border: rgba(255, 255, 255, 0.1);
    --notion-blue: #2b8fe8;
    --notion-blue-hover: #0075de;
    --notion-blue-focus: #62aef0;
    --notion-badge-bg: rgba(43, 143, 232, 0.15);
    --notion-badge-text: #62aef0;
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
}
```

**Observação:** se `index.css` atual já tem outras regras (reset, utilities customizadas), preservar no final do arquivo — não apagar. Apenas prepender o bloco acima no topo e remover os `@tailwind` duplicados.

- [ ] **Step 3: `npm run build` (verificação)**

```bash
npm run build
```

Esperado: build passa. Se falhar por `@import` fora do topo, mover o `@import url(...)` para a primeira linha absoluta.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat(design): adiciona tokens Notion (light+dark) e Inter font"
```

---

## Task 2: Tailwind Config — Mapeamento dos Tokens

**Files:**
- Modify: `tailwind.config.js` (substituição completa)

- [ ] **Step 1: Ler `tailwind.config.js` atual**

Importante preservar: `darkMode: ['class']` (já existe), `content` paths, quaisquer plugins.

- [ ] **Step 2: Substituir `theme.extend`**

O arquivo final deve ter este formato (adapte `content` e plugins se diferente):

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--notion-bg)',
        'bg-alt': 'var(--notion-bg-alt)',
        surface: 'var(--notion-surface)',
        text: {
          DEFAULT: 'var(--notion-text)',
          secondary: 'var(--notion-text-secondary)',
          muted: 'var(--notion-text-muted)',
        },
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
        'display-hero': ['4.00rem', { lineHeight: '1.00', letterSpacing: '-2.125px', fontWeight: '700' }],
        'display-2':    ['3.38rem', { lineHeight: '1.04', letterSpacing: '-1.875px', fontWeight: '700' }],
        'section':      ['3.00rem', { lineHeight: '1.00', letterSpacing: '-1.5px',   fontWeight: '700' }],
        'sub-lg':       ['2.50rem', { lineHeight: '1.50', letterSpacing: 'normal',   fontWeight: '700' }],
        'sub':          ['1.63rem', { lineHeight: '1.23', letterSpacing: '-0.625px', fontWeight: '700' }],
        'card-title':   ['1.38rem', { lineHeight: '1.27', letterSpacing: '-0.25px',  fontWeight: '700' }],
        'body-lg':      ['1.25rem', { lineHeight: '1.40', letterSpacing: '-0.125px', fontWeight: '600' }],
        'nav':          ['0.94rem', { lineHeight: '1.33', letterSpacing: 'normal',   fontWeight: '600' }],
        'caption':      ['0.88rem', { lineHeight: '1.43', letterSpacing: 'normal',   fontWeight: '500' }],
        'badge':        ['0.75rem', { lineHeight: '1.33', letterSpacing: '0.125px',  fontWeight: '600' }],
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
  plugins: [],
};
```

**Nota:** se `tailwind.config.js` for CommonJS (`module.exports`), manter esse formato e só trocar o `export default` por `module.exports =`.

- [ ] **Step 3: `npm run build`**

```bash
npm run build
```

Esperado: passa. O app pode ficar visualmente estranho porque os primitivos antigos usam classes antigas — é esperado. Ainda não tocamos em `ui/*`.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js
git commit -m "feat(design): mapeia tokens Notion em tailwind.config"
```

---

## Task 3: ThemeContext

**Files:**
- Create: `src/contexts/ThemeContext.tsx`

- [ ] **Step 1: Criar arquivo**

```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggle = () => setThemeState((t) => (t === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>');
  return ctx;
}
```

- [ ] **Step 2: `npm run build`**

```bash
npm run build
```

Esperado: passa (arquivo isolado, ainda não conectado).

- [ ] **Step 3: Commit**

```bash
git add src/contexts/ThemeContext.tsx
git commit -m "feat(theme): cria ThemeContext (light/dark, localStorage, media query)"
```

---

## Task 4: ThemeToggle component

**Files:**
- Create: `src/components/ThemeToggle.tsx`

- [ ] **Step 1: Criar arquivo**

```tsx
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const Icon = theme === 'light' ? Moon : Sun;
  const label = theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center h-9 w-9 rounded-micro text-text hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-focus transition-colors"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
```

**Nota:** confirme que o alias `@/` está configurado em `tsconfig.json` e `vite.config.ts`. Se não estiver, use path relativo `../contexts/ThemeContext`.

- [ ] **Step 2: `npm run build`**

- [ ] **Step 3: Commit**

```bash
git add src/components/ThemeToggle.tsx
git commit -m "feat(theme): cria ThemeToggle (ícone Sun/Moon)"
```

---

## Task 5: Wire ThemeProvider em main.tsx

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Ler `src/main.tsx` atual**

- [ ] **Step 2: Envolver `<App />` com `<ThemeProvider>`**

Exemplo (adaptar à estrutura real):

```tsx
import { ThemeProvider } from './contexts/ThemeContext';

// ...
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
```

- [ ] **Step 3: `npm run build`**

- [ ] **Step 4: Smoke test manual**

```bash
npm run dev
```

Abrir no browser. No DevTools console:
```js
document.documentElement.classList.add('dark')
```
Esperado: o `<body>` muda de cor (fundo escuro). Remover a classe volta pro light.

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx
git commit -m "feat(theme): aplica ThemeProvider no root da aplicação"
```

---

## Task 6: Button primitive (Notion variants)

**Files:**
- Modify: `src/components/ui/button.tsx`

- [ ] **Step 1: Ler `ui/button.tsx` atual** para entender a API exportada (provavelmente `Button` + `buttonVariants`).

- [ ] **Step 2: Substituir variants mantendo a mesma API**

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-focus active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-blue text-white hover:bg-blue-hover rounded-micro',
        secondary:
          'bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.08)] text-text hover:bg-[rgba(0,0,0,0.08)] dark:hover:bg-[rgba(255,255,255,0.12)] rounded-micro',
        ghost: 'bg-transparent text-text hover:underline rounded-micro',
        pill: 'bg-badge-bg text-badge-text rounded-pill',
        destructive: 'bg-orange text-white hover:opacity-90 rounded-micro',
        outline:
          'bg-transparent border border-border text-text hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)] rounded-micro',
      },
      size: {
        sm: 'px-3 py-1.5 text-nav',
        md: 'px-4 py-2 text-nav',
        lg: 'px-5 py-3 text-[1rem]',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

**Atenção à compatibilidade:** se o código existente usa `variant="default"` ou `variant="destructive"`, manter esses nomes ou criar alias. Se necessário, adicionar `default: [...]` apontando para o mesmo estilo de `primary`. **Antes de finalizar: grep `variant=` no projeto** para listar todas as variants em uso e garantir cobertura.

```bash
# No bash:
grep -rn "Button.*variant=" src/ --include="*.tsx" | head -30
```

Ajustar a lista de variants do `cva` para cobrir 100% dos nomes encontrados (adicionar aliases se preciso).

- [ ] **Step 3: `npm run build`**

Esperado: passa. Se houver erro TS em telas que usam variants inexistentes, criar alias nesse mesmo passo.

- [ ] **Step 4: Smoke test**

`npm run dev` → abrir Dashboard → confirmar que botões estão azuis (`#0075de`), com radius 4px, font semibold.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat(ui): Button com variants Notion (primary/secondary/ghost/pill)"
```

---

## Task 7: Card primitive

**Files:**
- Modify: `src/components/ui/card.tsx`

- [ ] **Step 1: Ler arquivo atual** (provavelmente exporta `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`).

- [ ] **Step 2: Substituir preservando API**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('bg-surface border border-border rounded-comfortable shadow-card', className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-card-title text-text', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-[1rem] text-text-secondary leading-[1.5]', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
```

- [ ] **Step 3: `npm run build`**

- [ ] **Step 4: Smoke test** — Dashboard deve mostrar cards com sombra multi-layer suave e border whisper.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "feat(ui): Card com tokens Notion (surface, border whisper, shadow-card)"
```

---

## Task 8: Input / Textarea / Select primitives

**Files:**
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/textarea.tsx`
- Modify: `src/components/ui/select.tsx`

- [ ] **Step 1: Ler os 3 arquivos atuais**

- [ ] **Step 2: Input** — classes alvo:

```
bg-surface text-text border border-border rounded-micro px-3 py-2
placeholder:text-text-muted
focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-focus
disabled:opacity-50 disabled:cursor-not-allowed
w-full text-[1rem]
```

Manter a API `<Input />` existente; só trocar o `className` interno.

- [ ] **Step 3: Textarea** — mesmas classes + `min-h-[80px]`.

- [ ] **Step 4: Select** — Select usa Radix. Para o trigger, aplicar as mesmas classes do Input. Para o conteúdo (`SelectContent`):

```
bg-surface border border-border rounded-standard shadow-card text-text
```

Para `SelectItem` hover/focus:

```
focus:bg-[rgba(0,0,0,0.05)] dark:focus:bg-[rgba(255,255,255,0.08)] rounded-subtle
```

- [ ] **Step 5: `npm run build`**

- [ ] **Step 6: Smoke test** — abrir NovaOSModal, conferir inputs, textarea, e os selects (abrir dropdown).

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/input.tsx src/components/ui/textarea.tsx src/components/ui/select.tsx
git commit -m "feat(ui): Input/Textarea/Select com tokens Notion"
```

---

## Task 9: Dialog primitive

**Files:**
- Modify: `src/components/ui/dialog.tsx`

- [ ] **Step 1: Ler arquivo atual** (Radix Dialog wrapper)

- [ ] **Step 2: Atualizar DialogOverlay**

Classes alvo:
```
fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
```

- [ ] **Step 3: Atualizar DialogContent**

```
fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%]
bg-surface border border-border rounded-large shadow-deep
gap-4 p-6
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
```

- [ ] **Step 4: DialogTitle** — classes `text-card-title text-text`

- [ ] **Step 5: DialogDescription** — classes `text-[1rem] text-text-secondary`

- [ ] **Step 6: `npm run build`**

- [ ] **Step 7: Smoke test** — abrir NovaOSModal e qualquer AlertDialog para confirmar overlay com blur e shadow profunda.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/dialog.tsx
git commit -m "feat(ui): Dialog com overlay blur + shadow-deep + radius large"
```

---

## Task 10: Badge component

**Files:**
- Modify: `src/components/Badge.tsx`

- [ ] **Step 1: Ler arquivo atual** para identificar variants em uso.

- [ ] **Step 2: Reescrever com cva**

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill px-2 py-1 text-badge whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-badge-bg text-badge-text',
        success: 'bg-[rgba(26,174,57,0.12)] text-green',
        warning: 'bg-[rgba(221,91,0,0.12)] text-orange',
        info: 'bg-[rgba(0,117,222,0.12)] text-blue',
        neutral: 'bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.08)] text-text-secondary',
        teal: 'bg-[rgba(42,157,153,0.12)] text-teal',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
```

**Antes de finalizar:** grep `<Badge` no projeto para listar variants em uso. Adicionar/aliasear as que faltarem.

- [ ] **Step 3: `npm run build`**

- [ ] **Step 4: Smoke test** — abrir Lista OS para ver badges de status.

- [ ] **Step 5: Commit**

```bash
git add src/components/Badge.tsx
git commit -m "feat(ui): Badge pill com variants semânticas Notion"
```

---

## Task 11: ModalBase

**Files:**
- Modify: `src/components/ModalBase.tsx`

- [ ] **Step 1: Ler arquivo atual**

- [ ] **Step 2: Atualizar classes**

Substituir quaisquer cores hardcoded pelos tokens:
- Container → `bg-surface border border-border rounded-large shadow-deep`
- Header → `border-b border-border px-6 py-4`
- Title → `text-card-title text-text`
- Body → `p-6`
- Footer → `border-t border-border px-6 py-4 flex justify-end gap-2`

Não mudar a estrutura de props/API — só substituir classes.

- [ ] **Step 3: `npm run build` + smoke test**

- [ ] **Step 4: Commit**

```bash
git add src/components/ModalBase.tsx
git commit -m "feat(ui): ModalBase com tokens Notion (surface, border whisper, shadow-deep)"
```

---

## Task 12: Layout.tsx + Sidebar + ThemeToggle integration

**Files:**
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Ler arquivo atual**

- [ ] **Step 2: Aplicar tokens**

Sidebar:
```
bg-bg-alt border-r border-border min-h-screen
```

Nav links:
```
text-nav text-text hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)]
rounded-subtle px-3 py-2 transition-colors
```

Nav link ativo:
```
bg-[rgba(0,117,222,0.08)] text-blue
```

Área de conteúdo:
```
bg-bg text-text min-h-screen
```

- [ ] **Step 3: Adicionar ThemeToggle**

Importar `ThemeToggle` e inserir na sidebar (topo ou rodapé) ou header principal, o que for mais natural:

```tsx
import { ThemeToggle } from './ThemeToggle';
// ... em algum lugar do chrome:
<ThemeToggle />
```

- [ ] **Step 4: `npm run build`**

- [ ] **Step 5: Smoke test full**

`npm run dev`:
1. Sidebar com warm white em light, warm dark em dark
2. Clicar no ThemeToggle → troca instantânea
3. Recarregar página → tema persiste
4. Links da sidebar com tipografia Notion (15px/600)

- [ ] **Step 6: Commit**

```bash
git add src/components/Layout.tsx
git commit -m "feat(layout): Layout+sidebar com tokens Notion e ThemeToggle integrado"
```

---

## Task 13: PageHeader

**Files:**
- Modify: `src/components/PageHeader.tsx`

- [ ] **Step 1: Ler arquivo atual**

- [ ] **Step 2: Aplicar tipografia Notion**

- Container: `py-8 border-b border-border mb-6` (ou similar ao padrão atual)
- Title: `text-sub text-text` (26px/700 tracking -0.625)
- Description: `text-[1rem] text-text-secondary mt-1`

- [ ] **Step 3: `npm run build` + smoke test**

- [ ] **Step 4: Commit**

```bash
git add src/components/PageHeader.tsx
git commit -m "feat(ui): PageHeader com tipografia sub Notion"
```

---

## Task 14: Passada fina — Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx` (ou nome equivalente — confirmar via `ls src/pages/`)

- [ ] **Step 1: Identificar o arquivo** e ler

```bash
ls src/pages/
```

- [ ] **Step 2: Grep de cores hardcoded**

```bash
grep -n -E "text-(gray|black|white|slate|zinc)-|bg-(white|gray|slate|zinc|black)|border-(gray|slate|zinc)" src/pages/Dashboard.tsx
```

- [ ] **Step 3: Substituir cada match** pelos tokens:

| Hardcoded | Token |
|---|---|
| `text-gray-500` / `text-gray-600` | `text-text-secondary` |
| `text-gray-400` | `text-text-muted` |
| `text-gray-900` / `text-black` | `text-text` |
| `bg-white` | `bg-surface` |
| `bg-gray-50` / `bg-gray-100` | `bg-bg-alt` |
| `border-gray-200` / `border-gray-300` | `border-border` |

Títulos de seção:
- H1/hero → `text-sub-lg` ou `text-sub`
- H2 → `text-card-title`
- H3 → `text-body-lg`

Cards de métrica: número grande em `text-sub-lg text-text`, label em `text-[0.88rem] text-text-secondary`.

- [ ] **Step 4: `npm run build`**

- [ ] **Step 5: Smoke test** — Dashboard em light + dark. Checar:
- Nenhum texto invisível
- Cards com shadow-card suave
- Números de métrica destacados
- Sidebar ainda coerente

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "style(dashboard): aplica tokens Notion (cores + tipografia)"
```

---

## Task 15: Passada fina — Lista OS + Kanban

**Files:**
- Modify: `src/pages/OSList.tsx` (ou nome equivalente)
- Modify: `src/components/OSKanban.tsx`

- [ ] **Step 1: Identificar e ler ambos os arquivos**

- [ ] **Step 2: Grep de cores hardcoded em ambos**

```bash
grep -n -E "text-(gray|black|white|slate|zinc)-|bg-(white|gray|slate|zinc|black)|border-(gray|slate|zinc)" src/pages/OSList.tsx src/components/OSKanban.tsx
```

- [ ] **Step 3: Aplicar tabela de substituição do Task 14**

Kanban específicos:
- Colunas: `bg-bg-alt border border-border rounded-comfortable p-4`
- Header de coluna: `text-card-title text-text mb-3`
- Cards de OS dentro das colunas: `bg-surface border border-border rounded-standard shadow-card p-3`
- Mapas de cor por status → usar `bg-badge-bg`, `bg-[rgba(26,174,57,0.12)]`, etc. (variants semânticas do Badge)

- [ ] **Step 4: Se houver estilos inline (`style={{...}}`)** — converter pra classes Tailwind com tokens.

- [ ] **Step 5: `npm run build` + smoke test**

Testar drag-and-drop se existir.

- [ ] **Step 6: Commit**

```bash
git add src/pages/OSList.tsx src/components/OSKanban.tsx
git commit -m "style(os-list): aplica tokens Notion em Lista OS + Kanban"
```

---

## Task 16: Passada fina — Detalhe OS + NovaOSModal

**Files:**
- Modify: `src/pages/OSDetail.tsx` (ou equivalente)
- Modify: `src/components/NovaOSModal.tsx`

- [ ] **Step 1: Identificar e ler**

- [ ] **Step 2: Grep cores hardcoded** (mesmo comando do Task 14 adaptado)

- [ ] **Step 3: Substituir**

`NovaOSModal` já herda do ModalBase/Dialog atualizado — a maior parte já vem. Focar em:
- Labels de formulário: `text-[0.88rem] text-text-secondary font-medium`
- Seções/abas: `text-card-title text-text`
- Divisores: `border-border`

OS Detail:
- Header com `text-sub-lg text-text`
- Metadata: `text-[0.88rem] text-text-secondary`
- Cards de seção: usar `<Card>`

- [ ] **Step 4: `npm run build` + smoke test**

Testar criação de nova OS, edição, abrir detalhes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/OSDetail.tsx src/components/NovaOSModal.tsx
git commit -m "style(os): aplica tokens Notion em Detalhe OS + NovaOSModal"
```

---

## Task 17: Passada fina — Financeiro

**Files:**
- Modify: `src/pages/Financeiro*.tsx`
- Modify: `src/components/finance/*.tsx`

- [ ] **Step 1: Listar arquivos**

```bash
ls src/pages/ | grep -i finan
ls src/components/finance/
```

- [ ] **Step 2: Grep cores hardcoded** em todos

- [ ] **Step 3: Substituir** (mesma tabela)

Atenção a:
- Valores monetários positivos → `text-green` (receita) ou `text-teal`
- Valores negativos → `text-orange`
- Tabelas: `border-border`, header `text-text-secondary`, rows `hover:bg-bg-alt`
- Charts (recharts): passar tokens via `style` ou CSS vars. Para cores de linhas/barras, usar `var(--notion-blue)` no `stroke`/`fill`.

- [ ] **Step 4: `npm run build` + smoke test**

- [ ] **Step 5: Commit**

```bash
git add src/pages/Financeiro*.tsx src/components/finance/
git commit -m "style(financeiro): aplica tokens Notion em Financeiro"
```

---

## Task 18: Passada fina — Clientes + telas restantes

**Files:**
- Modify: `src/pages/Clientes.tsx`
- Modify: outras páginas remanescentes em `src/pages/`

- [ ] **Step 1: Listar páginas restantes**

```bash
ls src/pages/
```

- [ ] **Step 2: Para cada página não tocada ainda** — aplicar o mesmo processo:
1. Ler arquivo
2. Grep cores hardcoded
3. Substituir por tokens
4. `npm run build`
5. Smoke test

- [ ] **Step 3: Commit** (pode ser um commit por arquivo ou um por grupo)

```bash
git add src/pages/Clientes.tsx
git commit -m "style(clientes): aplica tokens Notion em Clientes"
```

Repetir para cada página remanescente (`EmpresaEditModal`, `ServiceEditModal`, `DocumentViewer`, `DocListEditor`, etc. se tiverem cores hardcoded).

---

## Task 19: Polimento final + verificação global

**Files:**
- Verificação cruzada em todo `src/`

- [ ] **Step 1: Grep global de cores hardcoded remanescentes**

```bash
grep -rn -E "text-(gray|slate|zinc|neutral|stone)-[0-9]|bg-(gray|slate|zinc|neutral|stone)-[0-9]|border-(gray|slate|zinc|neutral|stone)-[0-9]" src/components/ src/pages/ --include="*.tsx" | grep -v "// notion-ok"
```

Esperado: zero matches ou apenas matches intencionais marcados com `// notion-ok`.

- [ ] **Step 2: Corrigir matches remanescentes**

- [ ] **Step 3: Grep por `#hex`** hardcoded

```bash
grep -rn -E "#[0-9a-fA-F]{3,6}" src/components/ src/pages/ --include="*.tsx"
```

Substituir por tokens onde fizer sentido (exceto em casos justificados — ex: cores de charts mapeadas, ícones de marcas).

- [ ] **Step 4: Verificar focus rings**

Testar navegação por Tab em cada tela principal. Todo elemento interativo deve ter ring azul visível ao receber foco.

- [ ] **Step 5: Smoke test final — light + dark em todas as telas principais**

Checklist manual:
- [ ] Dashboard light
- [ ] Dashboard dark
- [ ] Lista OS light
- [ ] Lista OS dark
- [ ] Kanban light
- [ ] Kanban dark
- [ ] Detalhe OS light
- [ ] Detalhe OS dark
- [ ] NovaOSModal light
- [ ] NovaOSModal dark
- [ ] Financeiro light
- [ ] Financeiro dark
- [ ] Clientes light
- [ ] Clientes dark

Para cada: nenhum texto invisível, sombras visíveis, borders whisper (não pretas grossas), botões azuis corretos, cards com shadow suave.

- [ ] **Step 6: `npm run build` final**

```bash
npm run build
```

- [ ] **Step 7: Commit final + PR**

```bash
git add -A
git commit -m "style: polimento final do design system Notion"
git push -u origin feat/notion-design-system
gh pr create --title "feat: Design System Notion (light + dark)" --body "$(cat <<'EOF'
## Summary
- Adiciona tokens CSS Notion (light + dark derivado) em src/index.css
- Mapeia tokens em tailwind.config.js (cores, tipografia, radius, shadows)
- ThemeContext + ThemeToggle com localStorage e prefers-color-scheme
- Reescreve primitivos (Button, Card, Input, Dialog, Badge, ModalBase) consumindo apenas tokens
- Atualiza Layout/Sidebar/PageHeader
- Passada fina aplicando tokens em todas as páginas principais

## Test plan
- [ ] npm run build passa sem erros
- [ ] Dashboard (light + dark): cards com shadow suave, sem texto invisível
- [ ] Lista OS + Kanban (light + dark)
- [ ] NovaOSModal abre corretamente em ambos os modos
- [ ] Toggle dark persiste após reload
- [ ] Focus rings visíveis via Tab

Spec: docs/superpowers/specs/2026-04-09-notion-design-system-design.md
Plan: docs/superpowers/plans/2026-04-09-notion-design-system.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notas de Execução

- **Cada task é um commit isolado.** Se algo quebra, `git revert` do último commit restaura o estado anterior.
- **Gate universal:** `npm run build` passa sem erros TS + smoke manual. Sem isso, não commit.
- **Zero testes automatizados:** projeto não tem suite de UI. Não forçar TDD aqui; o gate é build + manual.
- **Se uma task ficar muito grande** (ex: Task 15 Kanban revelar estilos inline complexos), subdividir em sub-commits menores mas manter dentro da mesma task.
- **Em caso de conflito com Radix:** Radix usa data-attributes (`data-[state=open]`), não cores — baixo risco. Se algo quebrar, isolar e debugar.
- **Fonte Inter FOUT:** aceitar flash de fonte não-estilizada no primeiro load; `display=swap` mitiga.

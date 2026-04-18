# Design System — CRM Despachante Matilde

Esta pasta é a **fonte única da verdade** para tudo que envolve aparência e
comportamento visual do CRM. Toda mudança de UI (humana ou via AI) deve seguir
estas referências antes de ser feita.

> **Claude Design v1.0** — warm neutrals (creme) + accent âmbar `#c26a12` +
> Fraunces (display) / Inter (body) / IBM Plex Mono (dados). Sério como
> cartório, moderno como Linear. Referência visual completa em
> [`assets/claude-design/design-system.html`](./assets/claude-design/design-system.html).

---

## Estrutura da pasta

| Arquivo                                           | Para quê                                        |
| ------------------------------------------------- | ----------------------------------------------- |
| [`principles.md`](./principles.md)                | Filosofia e regras invioláveis do design        |
| [`tokens.md`](./tokens.md)                        | Cores, tipografia, espaçamento, radius, sombras |
| [`components.md`](./components.md)                | Catálogo de componentes UI (HTML/JSX prontos)   |
| [`layouts.md`](./layouts.md)                      | Estruturas de página, sidebar, responsividade   |
| [`checklist.md`](./checklist.md)                  | Checklist antes de fazer merge de mudança de UI |
| [`assets/`](./assets/README.md)                   | Logos, mockups, screenshots e imagens do designer |

---

## Onde os tokens vivem no código

| Tipo            | Arquivo                                         |
| --------------- | ----------------------------------------------- |
| Variáveis CSS   | [`src/index.css`](../src/index.css) (`:root` e `.dark`) |
| Tailwind tokens | [`tailwind.config.js`](../tailwind.config.js)   |
| shadcn/ui setup | [`components.json`](../components.json)         |

⚠️ **Nunca hardcode cores ou tamanhos.** Sempre use:

- Variável CSS (`var(--notion-blue)`)
- Classe Tailwind do tema (`bg-blue`, `text-text-secondary`)
- Classe utilitária do design system (`.btn-primary`, `.card`, `.badge-success`)

---

## Regras de ouro (resumo)

1. **Warm neutral minimalismo.** Sem gradientes, sem glass, sem sombras
   pesadas fora dos tokens `--shadow-card` / `--shadow-deep`.
2. **Cores semânticas, não literais.** Use `var(--notion-blue)` (âmbar),
   `var(--status-danger)`, etc. — nunca `#c26a12` ou `#ef4444` no código.
3. **3 famílias tipográficas, cada uma com papel claro.**
   - **Inter** (body) — toda UI, h1/h2/h3, formulários, tabelas.
   - **Fraunces** (display) — hero, capas, títulos especiais. Via
     `var(--font-display)` ou classe `.font-display`.
   - **IBM Plex Mono** (mono) — placas, IDs de OS, valores R$. Via
     `var(--font-mono)` ou classe `.font-mono`.
4. **Border radius do design system.** `4px`, `8px`, `12px`, `16px` ou `9999px`.
   Nada de `border-radius: 10px` solto.
5. **Light + Dark obrigatórios.** Toda nova UI tem que funcionar nos dois temas
   (basta usar tokens — eles já trocam).
6. **Mobile-first.** Quebra em ≤768px e ≤380px já está mapeada em `index.css`.
7. **Foco visível sempre.** Não remova `outline` sem substituir.

---

## Para o Designer

Coloque na pasta [`assets/`](./assets/) tudo que servir de referência visual:

- Logo (SVG e PNG, fundo claro e escuro)
- Mockups de telas (Figma exports em PNG)
- Brand assets (cores oficiais, tipografia)
- Screenshots de inspiração (Notion, Linear, etc)
- Ícones customizados

Use nomes descritivos: `logo-matilde-light.svg`, `mockup-dashboard-v2.png`,
`brand-colors-2026.png`.

---

## Para o desenvolvedor (e para o Claude)

Antes de implementar qualquer mudança de UI:

1. Leia [`principles.md`](./principles.md) — entenda a filosofia.
2. Procure em [`components.md`](./components.md) se já existe o componente.
3. Use os tokens de [`tokens.md`](./tokens.md) — nunca hardcode.
4. Rode o [`checklist.md`](./checklist.md) antes de commitar.

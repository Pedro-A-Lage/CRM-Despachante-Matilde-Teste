# Princípios do Design — CRM Despachante Matilde

> Estes princípios definem o "porquê" do nosso design. Antes de qualquer mudança
> de UI, leia esta página. Quando estiver em dúvida, volte aqui.

---

## 1. Notion-style minimalismo

O CRM deve sentir como o Notion: superfície limpa, foco no conteúdo, decoração
zero. Isso significa:

- ✅ Fundos sólidos (`--notion-bg`, `--notion-surface`)
- ✅ Bordas finas (`1px solid var(--notion-border)`)
- ✅ Sombras sutis (`var(--shadow-card)`, `var(--shadow-deep)`)
- ❌ Gradientes
- ❌ Glassmorphism / `backdrop-filter` (exceto modal overlay)
- ❌ Sombras coloridas ou neon
- ❌ Ícones decorativos sem função

## 2. Conteúdo > Cromo

Hierarquia visual vem de tipografia e espaçamento, **não** de cor.
Use cor só para:

- Estado (sucesso/erro/aviso)
- Ação primária (`--notion-blue`)
- Marca (badges, links)

Texto secundário usa `var(--notion-text-secondary)`. Texto terciário usa
`var(--notion-text-muted)`. Quase nunca há razão para texto colorido fora
desses três níveis.

## 3. Tokens são lei

**Hardcoded color, font-size ou border-radius é bug.** Sempre use:

| Em vez de…              | Use…                                  |
| ----------------------- | ------------------------------------- |
| `color: #0075de`        | `color: var(--notion-blue)`           |
| `padding: 16px`         | `padding: var(--space-4)`             |
| `border-radius: 8px`    | `border-radius: 8px` (token oficial) ou classe `.rounded-standard` |
| `font-size: 14px`       | `font-size: 0.875rem` ou Tailwind `text-sm` |
| `box-shadow: 0 2px 4px…`| `box-shadow: var(--shadow-card)`      |

Se um token não existe para o que você precisa, **pare** e adicione um novo
token em `index.css` antes de continuar.

## 4. Light + Dark são iguais em prioridade

Todo componente novo tem que funcionar nos dois temas. Como os tokens
(`--notion-bg`, `--notion-text`, etc) já trocam quando `.dark` é ativo,
isso vem de graça **se você usar tokens**. Hardcode quebra dark mode.

Teste sempre alternando o tema antes de commitar.

## 5. Mobile não é "depois"

Quebras já estão definidas em `src/index.css`:

- `≤ 768px` — tablet/mobile (sidebar vira drawer, stacks single-column)
- `≤ 380px` — telefones pequenos (iPhone SE)

Use as classes `.hide-mobile`, `.full-mobile` quando precisar adaptar.
**Não** invente novas breakpoints.

## 6. Acessibilidade não é opcional

- Foco visível (`:focus-visible` já estilizado globalmente — não remova).
- Contraste AA mínimo (texto sobre fundo).
- `aria-label` em botões só com ícone.
- Área tocável mínima 40×40px em mobile (já forçado em CSS).
- `<input>` em mobile com `font-size: 16px` para evitar zoom no iOS.

## 7. Performance visual

- Animações suaves, ≤200ms (`transition: ... 150ms ease`).
- Sem animações infinitas (exceto `.spin` para loading).
- `animation: page-fade-in 0.22s` já aplica em entrada de página.

## 8. Não reinvente

Antes de criar um componente novo, **procure em `components.md`**. Quase
todos os padrões já existem (botão, card, badge, modal, kanban, etc).

Se precisa de variação nova, adicione como modificador (`.btn-variant-x`),
não como componente paralelo.

---

## O que mata o design

Estes são os erros recorrentes que devem ser evitados:

1. **Sombra colorida** (`box-shadow: 0 4px 12px rgba(0,117,222,0.3)`).
2. **Border-radius aleatório** (`border-radius: 6px` quando o sistema usa 4/8/12).
3. **Cor de texto fora dos 3 níveis** (cinza qualquer em vez de
   `--notion-text-secondary`).
4. **Margin/padding não-múltiplo de 4** (`padding: 13px`).
5. **`!important` para sobrescrever token** (sintoma de que o token está errado).
6. **Componente shadcn sem tema** (esqueceu de mapear `--background`/`--foreground`).
7. **Ignorar dark mode** (testou só claro, dark fica ilegível).

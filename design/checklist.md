# Checklist de Design — CRM Despachante Matilde

> Rode este checklist **antes de commitar** qualquer mudança visual.
> Se algum item não passou, conserte antes do PR.

---

## Tokens

- [ ] Nenhuma cor hardcoded (`#xxx`, `rgb(...)`, `hsl(...)` literal).
- [ ] Nenhuma `font-size` em px solta — usei Tailwind ou variável.
- [ ] Nenhuma `border-radius` fora de `4 / 5 / 8 / 12 / 16 / 9999`.
- [ ] Nenhuma `box-shadow` literal — usei `--shadow-card` ou `--shadow-deep`.
- [ ] Espaçamento múltiplo de 4 (`p-1`, `p-2`, …, `p-8`, etc).

## Light + Dark

- [ ] Testei alternando o tema (`class="dark"` no `<html>`).
- [ ] Texto legível nos dois (contraste AA ou superior).
- [ ] Bordas e sombras aparecem nos dois (não somem em dark).
- [ ] Inputs/selects com cor de texto correta no dark.

## Mobile

- [ ] Testei viewport ≤768px (drawer da sidebar funciona).
- [ ] Testei viewport ≤380px (iPhone SE — nada explode).
- [ ] Sem scroll-x indesejado.
- [ ] Modal vira bottom-sheet automaticamente.
- [ ] Inputs com `font-size: 16px` (forçado em mobile).
- [ ] Botões com altura ≥40px (área tocável).

## Acessibilidade

- [ ] Foco visível em todo elemento interativo (`*:focus-visible` global).
- [ ] Botão com só ícone tem `aria-label`.
- [ ] Cores não são a única forma de transmitir informação
      (ex: erro tem ícone + texto, não só vermelho).
- [ ] `<label>` associado a cada `<input>` (via `htmlFor` ou wrapping).

## Componentes

- [ ] Não dupliquei componente que já existe em `components.md`.
- [ ] Botão primário usa `.btn .btn-primary` (não `bg-blue` solto).
- [ ] Card usa `.card` (não div com border-radius custom).
- [ ] Badge usa `.badge .badge-*` (não span colorido).
- [ ] Modal usa `.modal-overlay` + `.modal` (não wrapper próprio).

## Layout

- [ ] Página segue um dos padrões em `layouts.md`.
- [ ] Não inventei header próprio — usei `.main-header`.
- [ ] Conteúdo respeitando `max-width: 1600px` do `.main-body > *`.

## Performance

- [ ] Sem animação infinita fora de `.spin`.
- [ ] Transições ≤220ms.
- [ ] Sem `backdrop-filter` fora de `.modal-overlay`.

## Limpeza

- [ ] Sem `!important` (a não ser que estivesse antes em CSS legacy).
- [ ] Sem CSS comentado / morto.
- [ ] Sem classes não usadas.

---

## Quando algo "não cabe" no design system

1. **Pare.** Não force.
2. Pergunte: é realmente necessário ou é gosto pessoal?
3. Se for necessário:
   - Adicione token novo em `index.css` (light + dark).
   - Atualize `tailwind.config.js` se for cor/radius/shadow.
   - Documente em `tokens.md` ou `components.md`.
   - Justifique no commit por que precisou.
4. Nunca faça override silencioso com `!important` ou cor hardcoded.

# Acessibilidade

> A11y não é "extra". Quem usa o CRM passa 8h por dia nele — precisa funcionar
> com teclado, leitor de tela, contraste ruim, e em dispositivos reais.

---

## Contraste

**Mínimo AA (4.5:1)** em qualquer texto sobre qualquer fundo. Os tokens de
texto já garantem:

| Combinação                                     | Ratio (light) |
| ---------------------------------------------- | ------------- |
| `--notion-text` sobre `--notion-bg`            | ~14:1         |
| `--notion-text-secondary` sobre `--notion-bg`  | ~8:1          |
| `--notion-text-muted` sobre `--notion-bg`      | ~4.8:1        |
| `#ffffff` sobre `--notion-blue` (âmbar)        | ~4.6:1        |

⚠️ **Nunca use `--notion-text-muted` em texto pequeno importante** (um label
de `text-caption` sobre fundo alternativo pode baixar pra 3.9:1). Teste.

---

## Teclado

### Foco visível — não remova

CSS global já cuida:

```css
*:focus-visible {
  outline: 2px solid var(--notion-blue-focus);
  outline-offset: 2px;
}
```

Se uma mudança sua some com o foco, **reverta**. Se precisa customizar
(ex: botão redondo), substitua por `box-shadow: 0 0 0 2px var(--accent-soft)`,
nunca `outline: none` puro.

### Tab order

- Ordem DOM = ordem de tab. Se precisar mudar a ordem visual, use CSS grid
  (sem `tabindex` reverso).
- **Não use `tabindex` positivo** (1, 2, …). Quebra fluxo em telas grandes.
- `tabindex={-1}` é OK pra remover algo do fluxo (ex: container decorativo).

### Atalhos

Atalhos de teclado devem ser **opt-in** e documentados. Hoje o CRM tem
poucos — se adicionar, documente aqui.

### Modais

- Foco vai pro primeiro input ao abrir.
- `Esc` fecha (já tratado em `ModalBase.tsx`).
- Clique fora do modal fecha.
- Ao fechar, foco volta pro elemento que abriu.

---

## Leitor de tela

### Labels

Todo `<input>` precisa de `<label>` associado (ou `aria-label`):

```tsx
<label className="form-label" htmlFor="nome">Nome</label>
<input id="nome" className="form-input" />
```

Alternativas aceitas:

- Wrapping: `<label>Nome <input /></label>`.
- `aria-label`: só quando não dá pra ter label visível (ex: busca).

### Botão só-ícone → `aria-label`

```tsx
<button aria-label="Excluir OS"><Trash2 size={16} /></button>
```

### Status dinâmico

Quando algo muda na tela sem o usuário interagir (ex: "Salvo com sucesso"),
use `role="status"` ou `aria-live="polite"`:

```tsx
<div role="status" aria-live="polite">
  Alterações salvas
</div>
```

Toasts já fazem isso internamente.

### Imagens

- `<img alt="">` quando é decorativa.
- `<img alt="Descrição">` quando transmite informação.
- SVG decorativo: `aria-hidden="true"`.

---

## Formulários

- Sempre `<label>` visível (exceto busca).
- Hint via `.form-hint` (abaixo do input).
- Erro via `aria-invalid="true"` + `aria-describedby` apontando pra mensagem.
- Botão `type="submit"` explícito (evita ativação acidental por Enter no form).
- Campos obrigatórios: `required` + asterisco visual + `aria-required`.

```tsx
<label htmlFor="cpf" className="form-label">
  CPF <span aria-hidden="true">*</span>
</label>
<input
  id="cpf"
  className="form-input"
  required
  aria-required="true"
  aria-invalid={!!error}
  aria-describedby={error ? 'cpf-error' : undefined}
/>
{error && <span id="cpf-error" className="text-status-danger">{error}</span>}
```

---

## Áreas tocáveis

- Mínimo **40×40px** em qualquer alvo clicável em mobile (ícones, checkboxes,
  links). Já forçado em CSS global.
- Espaçamento entre alvos mínimo 8px.

---

## Cor não pode ser a única forma

Nunca transmita informação só por cor. Sempre combine cor + ícone/texto:

- Status bom: `<CheckCircle />` + "Aprovado" + cor verde.
- Status ruim: `<XCircle />` + "Reprovado" + cor vermelha.

Daltonismo (8% dos homens) depende disso. Impressão preto-e-branco também.

---

## Mobile

- `font-size: 16px` em inputs (forçado) — evita zoom no iOS.
- Área tocável mínima 40×40px (forçado).
- Modal vira bottom-sheet ≤768px — mais fácil com polegar.
- Conteúdo não usa `overflow: hidden` em containers rolavéis do nível root.

---

## Tabelas

- `<th scope="col">` em headers.
- Em tabelas complexas, `<caption>` descritivo.
- Mobile: tabela com `min-width: 600px` + scroll-x (já padrão em `.table`).

---

## Modo escuro

Todo conteúdo novo tem que funcionar em dark. Use **tokens** (eles trocam
automaticamente). Teste alternando `class="dark"` no `<html>` antes de
commitar.

---

## Checklist rápido (pré-PR)

- [ ] Teclado: consegui navegar com Tab em todos os controles novos.
- [ ] Foco: outline visível em todo lugar.
- [ ] Label: todo input tem `<label>` ou `aria-label`.
- [ ] Ícone-botão: `aria-label`.
- [ ] Cor + texto/ícone: nenhum estado passa só por cor.
- [ ] Contraste: testei com DevTools (Lighthouse → Accessibility).
- [ ] Leitor de tela: se a mudança é crítica, testei no VoiceOver / NVDA.
- [ ] Mobile: testei viewport 380px e 768px.
- [ ] Reduced motion: animações caem pra 0.01ms se usuário desativa.

---

## Ferramentas

- **DevTools → Lighthouse → Accessibility** — rode antes de PR.
- **axe DevTools** (extensão) — complementa Lighthouse.
- **VoiceOver** (macOS `⌘+F5`) — teste sério em fluxos críticos.
- **Teclado só** — desconecte mouse, navegue o CRM. É o melhor teste rápido.

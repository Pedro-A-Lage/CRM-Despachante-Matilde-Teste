# Convenções de código

> Regras pra deixar o código **lido por qualquer pessoa no time** (e por AI)
> sem surpresa. Curtas. Se discordar, abra PR alterando este doc antes de
> começar a fazer diferente.

---

## Linguagem

- **TypeScript** em tudo (`.ts`/`.tsx`). Nada de `.js` no `src/` (exceto
  config se estritamente necessário).
- **Português** em labels de UI, mensagens, nomes de tipo de domínio
  (`OrdemDeServico`, `Cliente`, `Veiculo`, `Vistoria`).
- **Inglês** em código técnico (variáveis de controle de loop, helpers
  genéricos, internals): `isLoading`, `hasError`, `onSubmit`.

```tsx
// OK — domínio em PT, técnico em EN
const [cliente, setCliente] = useState<Cliente | null>(null);
const isLoading = useRef(false);
```

---

## Nomes

### Arquivos

- **Componentes React** — PascalCase: `OSKanban.tsx`, `NovaOSModal.tsx`.
- **Páginas** — PascalCase: `OSDetail.tsx`.
- **Libs / services** — camelCase: `financeService.ts`, `pdfParser.ts`.
- **Hooks** — `useNomeCoisa.ts`.
- **Tipos só** — `types.ts` ou `types/<dominio>.ts`.
- **Migrations SQL** — `YYYYMMDDHHMMSS_descritivo_snake.sql`.

### Identificadores

- **Componente React** — `PascalCase`.
- **Hook** — `useThing`.
- **Função / variável** — `camelCase`.
- **Constante** — `SCREAMING_SNAKE_CASE` só quando literal imutável. Se
  calculada, use `camelCase`.
- **Type / Interface** — `PascalCase`. Sem prefixo `I` (`IUser`).
- **Enum** — evitar; prefira union literal (`'PF' | 'PJ'`).

---

## Estrutura de componente

Ordem dentro do arquivo:

1. Imports (externos → internos → tipos).
2. Tipos locais.
3. Constantes do módulo.
4. Component principal.
5. Subcomponentes locais (se pequenos e só usados aqui).
6. Helpers puros no fim.

```tsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { osService } from '@/lib/osService';
import type { OrdemDeServico } from '@/types';

type Props = {
  osId: string;
};

const MAX_TENTATIVAS = 3;

export function OSActions({ osId }: Props) {
  const [loading, setLoading] = useState(false);
  // …
}

function PequenoSubComponente() { /* … */ }

function formatOSNumber(n: number) { return `#${String(n).padStart(4, '0')}`; }
```

### Tamanho

Arquivo > 800 linhas é candidato a split. Se for tela complexa (`OSDetail`,
`Dashboard`), evite explodir em muitos arquivos pequenos — **split por
seção de domínio** (ex: "aba de financeiro da OS" → `OSFinanceTab.tsx`).

---

## Estado

### Local primeiro

`useState` > context > store global.

### Context só pra cross-cutting

`AuthContext`, `ThemeContext`, `ConfirmProvider`. Se a informação não é usada
por >=3 componentes distantes, não merece context.

### Efeitos

- `useEffect` com **deps corretas** (lint ajuda).
- **Evite `useEffect` pra derivação** — use `useMemo` ou calcular direto no
  render.
- Limpe subscriptions / listeners no return.

### Async em render

Não chame `await` dentro do componente. Dispare via `useEffect` ou event
handler:

```tsx
useEffect(() => {
  let cancelled = false;
  (async () => {
    const data = await osService.getOS(id);
    if (!cancelled) setOS(data);
  })();
  return () => { cancelled = true; };
}, [id]);
```

---

## Formatação

### Indentação e quebras

- **2 espaços** (não tab).
- Linha ≤ **100 colunas** quando possível.
- Semi-colon sim (TS default).
- Strings single-quote (`'`) em TS/JS, double (`"`) em JSX attr.
- Trailing comma em arrays/objetos multi-linha.

Sem Prettier rodando em CI — mantenha manual. Futuro: integrar Prettier (ver
[`04-testing-strategy.md`](./04-testing-strategy.md)).

### Imports

Ordem:

1. React / libs externas.
2. Libs internas via alias `@/`.
3. Tipos (`import type { ... }`).
4. CSS/assets.

Sem `import * as` (exceto quando a lib exige).

---

## Tailwind

- Use classes utilitárias pra espaçamento, layout, cor básica.
- **Classes customizadas do design system** (`.btn`, `.card`, `.badge`) pra
  componentes tematizados.
- Tokens: `bg-amber`, `text-text-secondary`, **não** `bg-[#c26a12]`.
- Evite `className` gigante (>10 classes) — se precisa, provavelmente merece
  uma classe CSS em `index.css` ou um componente React próprio.
- Use `cn()` de `@/lib/utils` pra condicionais:
  ```tsx
  <div className={cn('card', isActive && 'border-amber')} />
  ```

---

## Supabase / banco

- **Todo acesso ao banco passa por `src/lib/*Service.ts`**, não direto do
  componente. Exceção: `supabaseClient` na própria lib.
- Retorne **tipos de domínio** (`Cliente`, `OrdemDeServico`) das services,
  não o formato bruto do Supabase. Faça o mapping no service.
- Erros: lance `Error` com mensagem em PT, pegue em UI com try/catch e
  mostre toast.

---

## Nunca

- ❌ `any` (use `unknown` + narrow).
- ❌ `// @ts-ignore` / `@ts-nocheck`.
- ❌ `console.log` commitado (use `// eslint-disable-next-line` se for
  temporário + remova no PR).
- ❌ Hardcoded color/size/radius (ver [`02-design-system/`](../02-design-system/)).
- ❌ `!important` em CSS (a não ser sobrescrevendo legacy, e com comentário).
- ❌ Chamar Supabase fora de `src/lib/*`.
- ❌ Commentar código morto — apague. Git guarda o histórico.
- ❌ `TODO:` sem issue linkada (`TODO(#123):`).

---

## Comentários

- Padrão: **não comente**. Código claro + nome bom dispensa.
- Comentar só **o porquê não-óbvio**:
  - Workaround de bug de lib.
  - Regra de negócio estranha ("prazo é 30 dias _úteis_, não corridos").
  - Limitação técnica conhecida.
- JSDoc apenas em funções públicas de `lib/` com comportamento não-trivial.
- Evite **narração** (`// fetch data` acima de `const data = await ...`).

---

## Testes

Veja [`04-testing-strategy.md`](./04-testing-strategy.md). Resumo: hoje não
temos suite automatizada. Rodamos `npm run build` (tsc + vite) como smoke
test mínimo. Mudança crítica tem que ter teste manual documentado no PR.

---

## Aprovação de mudanças grandes

Para qualquer mudança que:

- Altere schema do banco (migration nova).
- Adicione dependência em `package.json`.
- Mude design system (tokens, componentes base).
- Refatore arquivo > 1000 linhas.

Abra PR **draft** primeiro, peça review de arquitetura antes de implementar
tudo.

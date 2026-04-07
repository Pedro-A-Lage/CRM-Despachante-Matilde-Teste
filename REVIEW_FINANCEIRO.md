# Revisao Completa - Modulo Financeiro Redesenhado

Data: 2026-03-20 | Revisor: Claude Opus 4.6

---

## CRITICAL - Impede uso

### BUG 1: NUMERIC do Supabase retornado como string nao convertido

**Arquivo:** `src/lib/financeService.ts`

O Supabase retorna colunas NUMERIC(10,2) como **string** no JSON. A funcao `getServicePrice` (linha 72) faz `Number(...)` corretamente, mas as seguintes funcoes NAO convertem:

- `getPriceTable()` (linha 24) - retorna `data as PriceTableItem[]` sem converter `valor`
- `getChargesByOS()` (linha 92) - retorna `data as FinanceCharge[]` sem converter `valor_previsto` e `valor_pago`
- `getPaymentsByOS()` (linha 217) - retorna `data as Payment[]` sem converter `valor`
- `getPriceByCodigo()` (linha 43) - retorna `.valor` sem `Number()`
- `getServicePrices()` (linha 55) - retorna sem converter `valor`

**Impacto:** `calcularResumo` faz `c.valor_previsto + ...` que vira concatenacao de strings em vez de soma. Exemplo: `"150.54" + "133.17"` = `"150.54133.17"` em vez de `283.71`. Quebra TODOS os calculos do painel e relatorio. O `fmt()` tambem falha porque `toLocaleString` em string nao formata como moeda.

**Correcao em `getPriceByCodigo`** (linha 43):
```ts
// ANTES:
return (data as { valor: number }).valor;
// DEPOIS:
return Number((data as { valor: number }).valor);
```

**Correcao em `getPriceTable`** (linha 24):
```ts
// ANTES:
return data as PriceTableItem[];
// DEPOIS:
return (data ?? []).map(d => ({ ...d, valor: Number(d.valor) })) as PriceTableItem[];
```

**Correcao em `getServicePrices`** (linha 55):
```ts
// ANTES:
return data as ServicePrice[];
// DEPOIS:
return (data ?? []).map(d => ({ ...d, valor: Number(d.valor) })) as ServicePrice[];
```

**Correcao em `getChargesByOS`** (linha 92):
```ts
// ANTES:
return data as FinanceCharge[];
// DEPOIS:
return (data ?? []).map(d => ({
  ...d,
  valor_previsto: Number(d.valor_previsto),
  valor_pago: Number(d.valor_pago),
})) as FinanceCharge[];
```

**Correcao em `getPaymentsByOS`** (linha 217):
```ts
// ANTES:
return data as Payment[];
// DEPOIS:
return (data ?? []).map(d => ({ ...d, valor: Number(d.valor) })) as Payment[];
```

---

### BUG 2: Migration 000000 define charge_id NOT NULL - confirmar que fix foi aplicado

**Arquivo:** `supabase/migrations/20260320000000_financeiro_module.sql` (linha 76)

A migration original define `charge_id TEXT NOT NULL`. A migration 000004 corrige com `DROP NOT NULL`. O codigo `addPayment` passa `charge_id: null` corretamente. Se a migration 000004 NAO foi aplicada no Supabase remoto, inserts falham.

**Verificacao necessaria no Supabase SQL Editor:**
```sql
SELECT is_nullable FROM information_schema.columns
WHERE table_name = 'payments' AND column_name = 'charge_id';
-- Deve retornar 'YES'
```

---

### BUG 3: Migration 000003 afirma falsamente que charge_id ja e nullable

**Arquivo:** `supabase/migrations/20260320000003_financeiro_redesign.sql` (linha 64)

Comentario: "payments.charge_id ja e nullable por padrao, nenhuma mudanca necessaria." Isso e **FALSO** - a migration 000000 define `NOT NULL`. Essa falsa premissa pode ter causado o bug original reportado pelo usuario.

---

### BUG 4: marcarCustoPago nao converte NUMERIC de valor_previsto

**Arquivo:** `src/lib/financeService.ts` (linha 262)

```ts
valor_pago: (data as { valor_previsto: number }).valor_previsto,
```

O `valor_previsto` vindo do `.select()` e string (NUMERIC). O update vai gravar a string "150.54" em vez do numero 150.54 no campo valor_pago.

**Correcao:**
```ts
valor_pago: Number((data as { valor_previsto: number }).valor_previsto),
```

---

## IMPORTANT - Funcionalidade afetada

### BUG 5: FinancePainel - status 'cancelado' tratado como 'Pendente'

**Arquivo:** `src/components/finance/FinancePainel.tsx` (linhas 282-303)

O badge mostra "Pago" ou "Pendente", mas o tipo inclui `'cancelado'`. Custos cancelados aparecem com badge amarelo "Pendente" e sem botao - confuso para o usuario.

**Correcao (linha 286):**
```tsx
// ANTES:
{c.status === 'pago' ? 'Pago' : 'Pendente'}
// DEPOIS:
{c.status === 'pago' ? 'Pago' : c.status === 'cancelado' ? 'Cancelado' : 'Pendente'}
```
Adicionar estilo cinza para cancelado:
```tsx
background: c.status === 'pago' ? 'rgba(22,163,74,0.12)'
  : c.status === 'cancelado' ? 'rgba(128,128,128,0.12)'
  : 'rgba(234,179,8,0.12)',
color: c.status === 'pago' ? 'var(--color-success)'
  : c.status === 'cancelado' ? 'var(--color-text-secondary)'
  : 'var(--color-warning)',
```

---

### BUG 6: Financeiro.tsx - erro usa Tailwind hardcoded (dark mode quebrado)

**Arquivo:** `src/pages/Financeiro.tsx` (linha 106)

```tsx
<div className="bg-red-50 border border-red-200 text-red-700 ...">
```

`bg-red-50` fica quase branco no dark mode. Inconsistente com RecebimentoModal/CustoAdicionalModal que usam CSS variables.

**Correcao:**
```tsx
<div style={{
  borderRadius: 8, padding: '10px 14px', fontSize: 13,
  background: 'rgba(220,38,38,0.08)',
  color: 'var(--color-danger)',
  border: '1px solid var(--color-danger)',
}}>{erro}</div>
```

---

### BUG 7: Financeiro.tsx - cards de resumo com cores hardcoded

**Arquivo:** `src/pages/Financeiro.tsx` (linhas 130-191)

Misturas: CSS variables para `background: 'var(--bg-surface)'` + Tailwind classes `text-blue-600` + hex inline `border: '1px solid #3b82f6'`. No dark mode, as cores Tailwind/hex nao se adaptam.

**Correcao:** Usar CSS variables para todas as cores, ou ao menos `dark:` variants do Tailwind.

---

### BUG 8: Financeiro.tsx - botao Filtrar com Tailwind hardcoded

**Arquivo:** `src/pages/Financeiro.tsx` (linha 122-124)

```tsx
className="px-5 py-2 bg-blue-600 text-white rounded-lg ..."
```

Deveria usar `var(--color-primary)` como os outros botoes do modulo financeiro.

---

## MINOR - Cosmetico

### BUG 9: Modais nao fecham ao clicar no overlay

**Arquivos:** `src/components/finance/RecebimentoModal.tsx` (linha 59), `CustoAdicionalModal.tsx` (linha 46)

O overlay nao tem `onClick={onClose}`. UX padrao e fechar ao clicar fora do modal.

**Correcao:** No div overlay: `onClick={onClose}`. No div do conteudo: `onClick={e => e.stopPropagation()}`.

---

### BUG 10: Acentos ausentes em textos

**Arquivo:** `src/pages/Financeiro.tsx` - "Precos", "Servico", "Acoes", "Descricao", "Nao", "periodo"
**Arquivo:** `src/components/finance/FinancePainel.tsx` - "Servico" (linhas 136, 247), "Honorario" (linha 361)

---

### BUG 11: Tabelas podem aparecer vazias se migrations nao aplicadas

**Arquivo:** `src/pages/Financeiro.tsx` (linhas 202, 269)

Se `service_prices` ou `price_table` estiverem vazias no banco, o usuario ve "Nenhum preco cadastrado". As migrations 000003 e 000004 inserem seeds com `ON CONFLICT DO NOTHING`. Confirmar que foram aplicadas.

---

## Resumo

| Severidade | Qtd | Principal |
|------------|-----|-----------|
| CRITICAL   | 4   | NUMERIC como string (BUG 1,4), charge_id NOT NULL (BUG 2-3) |
| IMPORTANT  | 4   | Dark mode hardcoded (BUG 6-8), status cancelado (BUG 5) |
| MINOR      | 3   | Overlay click (BUG 9), acentos (BUG 10), seeds (BUG 11) |

## O que foi feito bem

- Arquitetura limpa: separacao financeService / types / componentes
- CSS variables consistente nos 3 componentes finance/ (FinancePainel, RecebimentoModal, CustoAdicionalModal)
- calcularResumo e funcao pura, facil de testar
- gerarCobrancasIniciais com CUSTO_MATRIX bem estruturada por TipoServico
- Tratamento de erros com try/catch e feedback visual ao usuario
- charge_id = null corretamente passado em addPayment
- Modais com loading state e disabled
- storage.ts converte valor_servico com Number() corretamente (linha 127)
- getRelatorio usa Number() nos reduces (linhas 319, 330, 336)

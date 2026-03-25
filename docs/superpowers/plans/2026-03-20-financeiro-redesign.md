# Redesign UX Módulo Financeiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar o módulo financeiro para refletir o fluxo real do despachante: cliente paga valor único → despachante paga custos (taxas) → o que sobra é honorário.

**Architecture:** O modelo atual trata cobranças individuais como a unidade central. O redesign inverte isso: a OS passa a ter `valor_servico` (valor cobrado ao cliente) e `tipo_veiculo` (carro/moto). Recebimentos do cliente ficam em `payments` sem vínculo a charge específica. `finance_charges` passa a representar apenas custos (DAE, vistoria, placa). O honorário é calculado: `valor_servico - total_custos`.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase (PostgreSQL), CSS variables for dark mode.

**Spec:** `docs/superpowers/specs/2026-03-20-financeiro-redesign.md`

---

## File Structure

### Create
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260320000003_financeiro_redesign.sql` | New table `service_prices`, new columns on `ordens_de_servico` |
| `src/components/finance/RecebimentoModal.tsx` | Modal to register client payment (replaces PaymentModal) |
| `src/components/finance/CustoAdicionalModal.tsx` | Simple modal for rare extra costs (replaces AddChargeModal) |

### Rewrite
| File | Responsibility |
|------|---------------|
| `src/components/finance/FinancePainel.tsx` | Complete rewrite — 4 sections: resumo, custos, honorário, histórico |
| `src/lib/financeService.ts` | Add service_prices CRUD, rewrite gerarCobrancasIniciais, new calcularResumo |

### Modify
| File | What Changes |
|------|-------------|
| `src/types/finance.ts` | Add `TipoVeiculo`, `ServicePrice`, rewrite `FinanceResumo` |
| `src/types.ts` | Add `tipoVeiculo` and `valorServico` to `OrdemDeServico` |
| `src/lib/storage.ts:117-189` | Add mappings for `tipo_veiculo` ↔ `tipoVeiculo`, `valor_servico` ↔ `valorServico` |
| `src/pages/OSForm.tsx` | Add tipo veículo field + auto-fill valor_servico from service_prices |
| `src/pages/OSDetail.tsx` | Pass `valorServico` to FinancePainel, handle onValorServicoChange |
| `src/pages/Financeiro.tsx` | Rewrite report to show receita/custos/honorários/recebimentos |

### Delete
| File | Reason |
|------|--------|
| `src/components/finance/AddChargeModal.tsx` | Replaced by CustoAdicionalModal |
| `src/components/finance/PaymentModal.tsx` | Replaced by RecebimentoModal |

---

## Task 1: Supabase Migration — service_prices + OS columns

**Files:**
- Create: `supabase/migrations/20260320000003_financeiro_redesign.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- ============================================================
-- Migration: Financeiro Redesign
-- Cria tabela service_prices e adiciona colunas na OS
-- ============================================================

-- 1. Tabela de preços dos serviços (valor cobrado ao cliente)
CREATE TABLE IF NOT EXISTS service_prices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tipo_servico TEXT NOT NULL,
  tipo_veiculo TEXT NOT NULL CHECK (tipo_veiculo IN ('carro', 'moto')),
  com_placa BOOLEAN NOT NULL DEFAULT false,
  valor NUMERIC(10,2) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tipo_servico, tipo_veiculo, com_placa)
);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_service_prices
  BEFORE UPDATE ON service_prices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE service_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_prices_select" ON service_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_prices_all" ON service_prices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Dados iniciais — CARRO
INSERT INTO service_prices (tipo_servico, tipo_veiculo, com_placa, valor) VALUES
  ('transferencia',          'carro', false, 450.00),
  ('transferencia',          'carro', true,  780.00),
  ('segunda_via',            'carro', false, 450.00),
  ('baixa',                  'carro', false, 450.00),
  ('alteracao_dados',        'carro', true,  580.00),
  ('alteracao_dados',        'carro', false, 380.00),
  ('primeiro_emplacamento',  'carro', true,  780.00),
  ('mudanca_caracteristica', 'carro', false, 450.00),
  ('mudanca_categoria',      'carro', false, 450.00),
  ('vistoria_lacrada',       'carro', false, 450.00),
  ('baixa_impedimento',      'carro', false, 380.00)
ON CONFLICT (tipo_servico, tipo_veiculo, com_placa) DO NOTHING;

-- Dados iniciais — MOTO
INSERT INTO service_prices (tipo_servico, tipo_veiculo, com_placa, valor) VALUES
  ('transferencia',          'moto', false, 450.00),
  ('transferencia',          'moto', true,  680.00),
  ('segunda_via',            'moto', false, 450.00),
  ('alteracao_dados',        'moto', true,  480.00),
  ('alteracao_dados',        'moto', false, 380.00),
  ('primeiro_emplacamento',  'moto', true,  680.00),
  ('mudanca_caracteristica', 'moto', false, 450.00),
  ('mudanca_categoria',      'moto', false, 450.00),
  ('vistoria_lacrada',       'moto', false, 450.00),
  ('baixa_impedimento',      'moto', false, 380.00)
ON CONFLICT (tipo_servico, tipo_veiculo, com_placa) DO NOTHING;

-- 3. Novas colunas na tabela ordens_de_servico
ALTER TABLE ordens_de_servico
  ADD COLUMN IF NOT EXISTS tipo_veiculo TEXT CHECK (tipo_veiculo IN ('carro', 'moto')),
  ADD COLUMN IF NOT EXISTS valor_servico NUMERIC(10,2);

-- 4. Tornar charge_id em payments realmente opcional (já é nullable, mas confirmar)
-- payments.charge_id já é nullable por padrão, nenhuma mudança necessária.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260320000003_financeiro_redesign.sql
git commit -m "feat: migration para service_prices e colunas tipo_veiculo/valor_servico na OS"
```

- [ ] **Step 3: User runs migration in Supabase SQL Editor**

Tell the user: "Run the SQL in `supabase/migrations/20260320000003_financeiro_redesign.sql` in the Supabase SQL Editor."

---

## Task 2: TypeScript Types — TipoVeiculo, ServicePrice, new FinanceResumo

**Files:**
- Modify: `src/types/finance.ts`
- Modify: `src/types.ts:198-238` (OrdemDeServico interface)

- [ ] **Step 1: Update `src/types/finance.ts` — add new types**

Add at top of file, before existing types:

```typescript
// --- TIPO DE VEÍCULO ---
export type TipoVeiculo = 'carro' | 'moto';

export const TIPO_VEICULO_LABELS: Record<TipoVeiculo, string> = {
  carro: 'Carro',
  moto: 'Moto',
};

// --- PREÇOS DOS SERVIÇOS ---
export interface ServicePrice {
  id: string;
  tipo_servico: string;
  tipo_veiculo: TipoVeiculo;
  com_placa: boolean;
  valor: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}
```

Replace the existing `FinanceResumo` interface with the new model:

```typescript
export interface FinanceResumo {
  valorServico: number;
  totalRecebido: number;
  faltaReceber: number;
  totalCustos: number;
  honorario: number;
  statusRecebimento: 'pago' | 'parcial' | 'pendente';
}
```

- [ ] **Step 2: Update `src/types.ts` — add fields to OrdemDeServico**

Add these two fields to the `OrdemDeServico` interface (after `trocaPlaca: boolean;` at line 205):

```typescript
    tipoVeiculo?: TipoVeiculo;
    valorServico?: number;
```

Also add the import at the top — since `TipoVeiculo` is already exported from `./types/finance` which is re-exported via `export * from './types/finance'`, no new import needed. The type is already available.

- [ ] **Step 3: Commit**

```bash
git add src/types/finance.ts src/types.ts
git commit -m "feat: tipos TipoVeiculo, ServicePrice, FinanceResumo redesenhado"
```

---

## Task 3: Storage Mapping — tipo_veiculo + valor_servico

**Files:**
- Modify: `src/lib/storage.ts:117-189`

- [ ] **Step 1: Add mappings to `dbToOrdem` (line 117-151)**

After `trocaPlaca: row.troca_placa,` (line 125), add:

```typescript
        tipoVeiculo: row.tipo_veiculo ?? undefined,
        valorServico: row.valor_servico != null ? Number(row.valor_servico) : undefined,
```

- [ ] **Step 2: Add mappings to `ordemToDb` (line 154-189)**

After `if (o.trocaPlaca !== undefined) map.troca_placa = o.trocaPlaca;` (line 162), add:

```typescript
    if (o.tipoVeiculo !== undefined) map.tipo_veiculo = o.tipoVeiculo;
    if (o.valorServico !== undefined) map.valor_servico = o.valorServico;
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: mapeamento tipo_veiculo e valor_servico no storage"
```

---

## Task 4: Finance Service — service_prices CRUD + rewrite gerarCobrancasIniciais

**Files:**
- Modify: `src/lib/financeService.ts`

- [ ] **Step 1: Add service_prices functions**

Add after the existing price table section (after line 42):

```typescript
// ── SERVICE PRICES (preço cobrado ao cliente) ────────────────

import type { ServicePrice, TipoVeiculo } from '../types/finance';

export async function getServicePrices(): Promise<ServicePrice[]> {
  const { data, error } = await supabase
    .from('service_prices')
    .select('*')
    .eq('ativo', true)
    .order('tipo_servico');
  if (error) throw error;
  return data as ServicePrice[];
}

export async function getServicePrice(
  tipoServico: string,
  tipoVeiculo: TipoVeiculo,
  comPlaca: boolean,
): Promise<number> {
  const { data, error } = await supabase
    .from('service_prices')
    .select('valor')
    .eq('tipo_servico', tipoServico)
    .eq('tipo_veiculo', tipoVeiculo)
    .eq('com_placa', comPlaca)
    .eq('ativo', true)
    .single();
  if (error) return 0;
  return Number((data as { valor: number }).valor);
}

export async function updateServicePrice(id: string, valor: number): Promise<void> {
  const { error } = await supabase
    .from('service_prices')
    .update({ valor })
    .eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Rewrite the cost matrix and gerarCobrancasIniciais**

Replace lines 99-154 (the SERVICOS_COM_DAE constant and gerarCobrancasIniciais function) with:

```typescript
// ── MATRIZ DE CUSTOS POR TIPO DE SERVIÇO ─────────────────────
// Define quais custos são gerados automaticamente para cada tipo de serviço.

const CUSTO_MATRIX: Record<TipoServico, { dae: boolean; vistoria: boolean | 'se_troca'; placa: 'sempre' | 'se_troca' | 'nunca' }> = {
  transferencia:          { dae: true,  vistoria: true,       placa: 'se_troca' },
  primeiro_emplacamento:  { dae: true,  vistoria: true,       placa: 'sempre' },
  segunda_via:            { dae: true,  vistoria: true,       placa: 'nunca' },
  alteracao_dados:        { dae: true,  vistoria: 'se_troca', placa: 'se_troca' },
  baixa:                  { dae: true,  vistoria: true,       placa: 'nunca' },
  mudanca_caracteristica: { dae: true,  vistoria: true,       placa: 'nunca' },
  mudanca_categoria:      { dae: true,  vistoria: true,       placa: 'nunca' },
  vistoria_lacrada:       { dae: true,  vistoria: true,       placa: 'nunca' },
  baixa_impedimento:      { dae: true,  vistoria: false,      placa: 'nunca' },
};

export async function gerarCobrancasIniciais(
  osId: string,
  tipoServico: TipoServico,
  tipoVeiculo: TipoVeiculo,
  trocaPlaca: boolean,
): Promise<void> {
  const regra = CUSTO_MATRIX[tipoServico];
  if (!regra) return;

  const inserts: {
    os_id: string;
    descricao: string;
    categoria: FinanceChargeCategoria;
    valor_previsto: number;
  }[] = [];

  if (regra.dae) {
    const valor = await getPriceByCodigo('dae_principal');
    inserts.push({
      os_id: osId,
      descricao: 'DAE Principal',
      categoria: 'dae_principal',
      valor_previsto: valor,
    });
  }

  const geraVistoria = regra.vistoria === true || (regra.vistoria === 'se_troca' && trocaPlaca);
  if (geraVistoria) {
    const valor = await getPriceByCodigo('vistoria');
    inserts.push({
      os_id: osId,
      descricao: 'Vistoria ECV',
      categoria: 'vistoria',
      valor_previsto: valor,
    });
  }

  const geraPlaca = regra.placa === 'sempre' || (regra.placa === 'se_troca' && trocaPlaca);
  if (geraPlaca) {
    const codigo = tipoVeiculo === 'moto' ? 'placa_moto_comum' : 'placa_carro_mercosul';
    const descricao = tipoVeiculo === 'moto' ? 'Placa Moto' : 'Placa Mercosul (par)';
    const valor = await getPriceByCodigo(codigo);
    inserts.push({
      os_id: osId,
      descricao,
      categoria: 'placa',
      valor_previsto: valor,
    });
  }

  if (inserts.length === 0) return;
  const { error } = await supabase.from('finance_charges').insert(inserts);
  if (error) throw error;
}
```

- [ ] **Step 3: Rewrite calcularResumo to match new FinanceResumo**

Replace lines 253-267 (the calcularResumo function) with:

```typescript
export function calcularResumo(
  valorServico: number,
  charges: FinanceCharge[],
  payments: Payment[],
): FinanceResumo {
  const custosAtivos = charges.filter(c => c.status !== 'cancelado');
  const totalCustos = custosAtivos.reduce((s, c) => s + c.valor_previsto, 0);
  const totalRecebido = payments.reduce((s, p) => s + p.valor, 0);
  const faltaReceber = Math.max(0, valorServico - totalRecebido);
  const honorario = valorServico - totalCustos;

  const statusRecebimento: FinanceResumo['statusRecebimento'] =
    valorServico === 0
      ? 'pendente'
      : totalRecebido >= valorServico
      ? 'pago'
      : totalRecebido > 0
      ? 'parcial'
      : 'pendente';

  return { valorServico, totalRecebido, faltaReceber, totalCustos, honorario, statusRecebimento };
}
```

- [ ] **Step 4: Update addPayment — charge_id no longer required**

Replace the addPayment function (lines 202-234) — remove the mandatory chargeId logic:

```typescript
export async function addPayment(
  osId: string,
  dataPagamento: string,
  valor: number,
  metodo: PaymentMetodo,
  instituicao?: string,
  observacao?: string,
): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      os_id: osId,
      charge_id: null,
      data_pagamento: dataPagamento,
      valor,
      metodo,
      instituicao: instituicao ?? null,
      comprovante_url: null,
      observacao: observacao ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Payment;
}
```

- [ ] **Step 4b: Simplify deletePayment — remove charge-linked logic**

Replace the `deletePayment` function with a simpler version (no more atomic RPC reversal):

```typescript
export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 5: Add marcarCustoPago — one-click pay for costs**

Add after addPayment:

```typescript
export async function marcarCustoPago(chargeId: string): Promise<void> {
  const { data, error: fetchErr } = await supabase
    .from('finance_charges')
    .select('valor_previsto')
    .eq('id', chargeId)
    .single();
  if (fetchErr || !data) throw fetchErr || new Error('Custo não encontrado');

  const { error } = await supabase
    .from('finance_charges')
    .update({
      valor_pago: (data as { valor_previsto: number }).valor_previsto,
      status: 'pago',
    })
    .eq('id', chargeId);
  if (error) throw error;
}
```

- [ ] **Step 6: Rewrite getRelatorio for new model**

Replace the getRelatorio function (lines 279-317) with:

```typescript
export interface FinanceRelatorio {
  periodo: { inicio: string; fim: string };
  receita: number;
  totalCustos: number;
  honorarios: number;
  totalRecebido: number;
  aReceber: number;
  osCount: number;
}

export async function getRelatorio(
  inicio: string,
  fim: string,
): Promise<FinanceRelatorio> {
  // Buscar OS do período com valor_servico
  const { data: osList, error: osErr } = await supabase
    .from('ordens_de_servico')
    .select('id, valor_servico')
    .gte('criado_em', `${inicio}T00:00:00`)
    .lte('criado_em', `${fim}T23:59:59`);
  if (osErr) throw osErr;

  const ordens = (osList ?? []) as { id: string; valor_servico: number | null }[];
  const osIds = ordens.map(o => o.id);
  const receita = ordens.reduce((s, o) => s + (Number(o.valor_servico) || 0), 0);

  if (osIds.length === 0) {
    return { periodo: { inicio, fim }, receita: 0, totalCustos: 0, honorarios: 0, totalRecebido: 0, aReceber: 0, osCount: 0 };
  }

  // Buscar custos dessas OS
  const { data: chargesData } = await supabase
    .from('finance_charges')
    .select('valor_previsto')
    .in('os_id', osIds)
    .neq('status', 'cancelado');
  const totalCustos = (chargesData ?? []).reduce((s, c: any) => s + Number(c.valor_previsto), 0);

  // Buscar recebimentos dessas OS
  const { data: paymentsData } = await supabase
    .from('payments')
    .select('valor')
    .in('os_id', osIds);
  const totalRecebido = (paymentsData ?? []).reduce((s, p: any) => s + Number(p.valor), 0);

  return {
    periodo: { inicio, fim },
    receita,
    totalCustos,
    honorarios: receita - totalCustos,
    totalRecebido,
    aReceber: Math.max(0, receita - totalRecebido),
    osCount: ordens.length,
  };
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/financeService.ts
git commit -m "feat: service_prices CRUD, nova matriz custos, calcularResumo redesenhado"
```

---

## Task 5: OSForm.tsx — Campo tipo veículo + auto-fill valor_servico

**Files:**
- Modify: `src/pages/OSForm.tsx`

- [ ] **Step 1: Add state for tipoVeiculo**

In the component's state declarations, add:

```typescript
const [tipoVeiculo, setTipoVeiculo] = useState<TipoVeiculo>('carro');
```

Import `TipoVeiculo` from `'../types/finance'` and `getServicePrice` from `'../lib/financeService'`.

- [ ] **Step 2: Add tipo veículo radio buttons in the form**

Add after the `trocaPlaca` toggle in the form JSX (find the checkbox/toggle for troca de placa and add below it):

```tsx
{/* Tipo de Veículo */}
<div style={{ marginBottom: 16 }}>
  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: 'var(--color-text-primary)' }}>
    Tipo de Veículo
  </label>
  <div style={{ display: 'flex', gap: 16 }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
      <input
        type="radio"
        name="tipoVeiculo"
        value="carro"
        checked={tipoVeiculo === 'carro'}
        onChange={() => setTipoVeiculo('carro')}
      />
      Carro
    </label>
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
      <input
        type="radio"
        name="tipoVeiculo"
        value="moto"
        checked={tipoVeiculo === 'moto'}
        onChange={() => setTipoVeiculo('moto')}
      />
      Moto
    </label>
  </div>
</div>
```

- [ ] **Step 3: Update handleSubmit to save tipoVeiculo + valorServico and pass tipoVeiculo to gerarCobrancasIniciais**

In `handleSubmit`, before calling `saveOrdem(...)`, fetch the service price:

```typescript
const valorServico = await getServicePrice(tipoServico, tipoVeiculo, trocaPlaca);
```

Add `tipoVeiculo` and `valorServico` to the `saveOrdem()` payload.

Update `gerarCobrancasIniciais` call to pass `tipoVeiculo`:

```typescript
// OLD: gerarCobrancasIniciais(os.id, tipoServico, trocaPlaca, temVistoria)
// NEW:
gerarCobrancasIniciais(os.id, tipoServico, tipoVeiculo, trocaPlaca)
```

Note: The `temVistoria` parameter is removed — the cost matrix now determines vistoria automatically.

- [ ] **Step 4: Commit**

```bash
git add src/pages/OSForm.tsx
git commit -m "feat: campo tipo veículo no formulário OS + auto-fill valor_servico"
```

---

## Task 6: FinancePainel.tsx — Complete Rewrite

**Files:**
- Rewrite: `src/components/finance/FinancePainel.tsx`

- [ ] **Step 1: Write the new FinancePainel component**

Complete rewrite with 4 sections. New props:

```typescript
interface Props {
  osId: string;
  valorServico: number;
  onValorServicoChange?: (novoValor: number) => void;
  readOnly?: boolean;
}
```

**Section 1 — Resumo do Serviço:**
- Card with valor do serviço (editable inline — click to edit, blur/enter to save)
- Progress bar: `(totalRecebido / valorServico) * 100`%
- Display: "Recebido: R$X" | "Falta: R$Y"
- Big button: "Registrar Recebimento" → opens RecebimentoModal

**Section 2 — Custos do Serviço:**
- Simple list of finance_charges for this OS
- Each row: description | valor | status badge | "Pagar" button (if status === 'a_pagar')
- "Pagar" button calls `marcarCustoPago(chargeId)` directly — no modal
- Footer: "Total Custos: R$X" + small link "+ Custo adicional" → opens CustoAdicionalModal

**Section 3 — Resultado:**
- Card: "Honorário = R$valorServico − R$totalCustos = R$honorario"
- Color: green if positive, red if negative

**Section 4 — Histórico de Recebimentos (collapsible):**
- Header: "Recebimentos (N)" — click to expand/collapse
- Table rows: data | valor | método | instituição | [Remover]
- "Remover" calls `deletePayment(id)` with window.confirm

**State management:**

```typescript
const [charges, setCharges] = useState<FinanceCharge[]>([]);
const [payments, setPayments] = useState<Payment[]>([]);
const [resumo, setResumo] = useState<FinanceResumo | null>(null);
const [loading, setLoading] = useState(true);
const [showRecebimento, setShowRecebimento] = useState(false);
const [showCustoExtra, setShowCustoExtra] = useState(false);
const [editandoValor, setEditandoValor] = useState(false);
const [valorTemp, setValorTemp] = useState('');
const [mensagem, setMensagem] = useState<{tipo: 'sucesso'|'erro'; texto: string}|null>(null);
const [historicoAberto, setHistoricoAberto] = useState(false);
```

**Data loading:**

```typescript
const carregar = useCallback(async () => {
  setLoading(true);
  try {
    const [c, p] = await Promise.all([
      getChargesByOS(osId),
      getPaymentsByOS(osId),
    ]);
    setCharges(c);
    setPayments(p);
    setResumo(calcularResumo(valorServico, c, p));
  } finally {
    setLoading(false);
  }
}, [osId, valorServico]);
```

**Styling:** Use CSS variables (`var(--bg-surface)`, `var(--color-text-primary)`, `var(--border-color)`, `var(--color-primary)`) for dark mode support.

- [ ] **Step 2: Commit**

```bash
git add src/components/finance/FinancePainel.tsx
git commit -m "feat: FinancePainel redesenhado — resumo, custos, honorário, recebimentos"
```

---

## Task 7: RecebimentoModal.tsx — Simple Payment Registration

**Files:**
- Create: `src/components/finance/RecebimentoModal.tsx`

- [ ] **Step 1: Write RecebimentoModal**

```typescript
interface Props {
  osId: string;
  saldoRestante: number;
  onClose: () => void;
  onSaved: () => void;
}
```

**Form fields:**
- `valor` — number input, pre-filled with `saldoRestante`, required
- `data` — date input, default: today (`new Date().toISOString().slice(0, 10)`), required
- `metodo` — select: PIX | Dinheiro | Cartão | TED | Boleto | Outro, default: 'pix', required
- `instituicao` — text input, optional (placeholder: "Ex: Nubank, Bradesco...")
- `observacao` — textarea, optional

**Submit:** calls `addPayment(osId, data, valor, metodo, instituicao, observacao)`

**Styling:** Same modal pattern as existing modals, using CSS variables. Overlay + centered card.

- [ ] **Step 2: Commit**

```bash
git add src/components/finance/RecebimentoModal.tsx
git commit -m "feat: RecebimentoModal — registro simplificado de pagamento do cliente"
```

---

## Task 8: CustoAdicionalModal.tsx — Rare Extra Costs

**Files:**
- Create: `src/components/finance/CustoAdicionalModal.tsx`

- [ ] **Step 1: Write CustoAdicionalModal**

```typescript
interface Props {
  osId: string;
  onClose: () => void;
  onSaved: () => void;
}
```

**Form fields:**
- `descricao` — text input, required (placeholder: "Ex: Taxa extra, Correio, etc.")
- `valor` — number input, required, step="0.01", min="0"

**Submit:** calls `addCharge(osId, descricao, 'outro', valor)`

**Minimal design** — this is for rare cases. Just description + value.

- [ ] **Step 2: Commit**

```bash
git add src/components/finance/CustoAdicionalModal.tsx
git commit -m "feat: CustoAdicionalModal para custos extras raros"
```

---

## Task 9: OSDetail.tsx — Pass valorServico to FinancePainel

**Files:**
- Modify: `src/pages/OSDetail.tsx`

- [ ] **Step 1: Update FinancePainel usage**

Find where `<FinancePainel osId={os.id} />` is rendered and update to:

```tsx
<FinancePainel
  osId={os.id}
  valorServico={os.valorServico ?? 0}
  onValorServicoChange={async (novoValor) => {
    await saveOrdem({ id: os.id, valorServico: novoValor });
    setOs({ ...os, valorServico: novoValor });
  }}
/>
```

Import `saveOrdem` from `'../lib/storage'` if not already imported.

- [ ] **Step 2: Commit**

```bash
git add src/pages/OSDetail.tsx
git commit -m "feat: OSDetail passa valorServico ao FinancePainel"
```

---

## Task 10: Financeiro.tsx — Rewrite Global Report

**Files:**
- Modify: `src/pages/Financeiro.tsx`

- [ ] **Step 1: Rewrite the report page**

The page keeps the same structure (date filter + summary cards) but shows the new metrics:

**Summary cards (top row):**
1. **Receita** — sum of `valor_servico` from all OS in period (blue)
2. **Custos** — sum of `finance_charges` (red/orange)
3. **Honorários** — receita − custos (green)
4. **Recebido** — sum of `payments` (green)
5. **A Receber** — receita − recebido (yellow)

**Price table section — split into two subsections:**

1. **Preços dos Serviços** — editable table from `service_prices`:
   - Columns: Serviço | Tipo Veículo | Com Placa | Valor | [Editar]
   - Uses `getServicePrices()` and `updateServicePrice(id, valor)`

2. **Custos Fixos (Taxas)** — existing `price_table`:
   - Columns: Descrição | Valor | [Editar]
   - Uses `getPriceTable()` and `updatePriceItem(id, valor)`

Remove the old "por categoria" and "por status" breakdown tables.

- [ ] **Step 2: Commit**

```bash
git add src/pages/Financeiro.tsx
git commit -m "feat: relatório financeiro global redesenhado — receita/custos/honorários"
```

---

## Task 11: Cleanup — Delete Old Modals

**Files:**
- Delete: `src/components/finance/AddChargeModal.tsx`
- Delete: `src/components/finance/PaymentModal.tsx`

- [ ] **Step 1: Verify no remaining imports**

Search the codebase for any imports of `AddChargeModal` or `PaymentModal`. They should only be imported by the old FinancePainel (which was rewritten in Task 6).

Run: `grep -r "AddChargeModal\|PaymentModal" src/`

If no remaining imports, proceed to delete.

- [ ] **Step 2: Delete the files**

```bash
rm src/components/finance/AddChargeModal.tsx
rm src/components/finance/PaymentModal.tsx
```

- [ ] **Step 3: Commit**

```bash
git add -u src/components/finance/AddChargeModal.tsx src/components/finance/PaymentModal.tsx
git commit -m "chore: remove AddChargeModal e PaymentModal antigos"
```

---

## Task 12: Build Verification + Final Commit

- [ ] **Step 1: Run TypeScript compiler check**

```bash
npx tsc --noEmit
```

Fix any type errors that arise (common issues: old `calcularResumo` call sites, old `gerarCobrancasIniciais` signature, old `addPayment` signature).

- [ ] **Step 2: Run dev server and verify**

```bash
npx vite --port 5173
```

Check:
1. Create new OS → tipo veículo field exists, valor_servico auto-fills
2. Open existing OS → Financeiro tab shows new layout
3. Register a recebimento → appears in history, progress bar updates
4. Click "Pagar" on a cost → marks as paid
5. Check honorário calculation is correct
6. Dark mode works (all CSS vars)
7. `/financeiro` page shows new report format + dual price tables

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: ajustes finais do redesign financeiro"
```

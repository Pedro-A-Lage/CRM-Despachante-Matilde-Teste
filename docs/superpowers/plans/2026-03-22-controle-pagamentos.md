# Controle de Pagamentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a centralized payment control page where admin/gerente can confirm tax payments across all service orders with 1-click simplicity.

**Architecture:** New page `ControlePagamentos.tsx` queries `finance_charges` joined with OS/cliente/veículo data. Confirmation updates the same `finance_charges` table that `FinancePainel` reads, so changes sync automatically. New service functions in `financeService.ts` handle grouped queries and batch confirmations.

**Tech Stack:** React 18 + TypeScript, Supabase (PostgreSQL), Vite, existing CSS variables for theming.

**Spec:** `docs/superpowers/specs/2026-03-22-controle-pagamentos-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/types/finance.ts` | Add `confirmado_por`, `confirmado_em` to `FinanceCharge` + new grouped type |
| Modify | `src/lib/financeService.ts` | Add 5 new functions for payment control queries |
| Create | `src/pages/ControlePagamentos.tsx` | Main page with cards, filters, grouped list |
| Modify | `src/App.tsx` | Add route `/controle-pagamentos` |
| Modify | `src/components/Layout.tsx` | Add menu item + role filter (admin/gerente) |
| Create | `supabase/migrations/20260322000000_add_confirmado_fields.sql` | DB migration |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260322000000_add_confirmado_fields.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add confirmation tracking fields to finance_charges
ALTER TABLE finance_charges
  ADD COLUMN IF NOT EXISTS confirmado_por TEXT,
  ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ;

-- Backfill existing paid charges so they appear in summary cards
UPDATE finance_charges
  SET confirmado_em = atualizado_em
  WHERE status = 'pago' AND confirmado_em IS NULL;
```

- [ ] **Step 2: Apply migration**

Run via Supabase dashboard SQL editor or:
```bash
# If using Supabase CLI:
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260322000000_add_confirmado_fields.sql
git commit -m "feat: add confirmado_por/confirmado_em to finance_charges"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/finance.ts`

- [ ] **Step 1: Add new fields to FinanceCharge interface**

Add these two optional fields at the end of the `FinanceCharge` interface:

```typescript
  confirmado_por?: string;
  confirmado_em?: string;
```

- [ ] **Step 2: Add grouped charge type for the control page**

Add after the existing interfaces:

```typescript
// --- CONTROLE DE PAGAMENTOS ---
export interface ChargeWithOS extends FinanceCharge {
  os_numero: number;
  tipo_servico: string;
  cliente_nome: string;
  placa: string;
  modelo: string;
}

export interface OSChargeGroup {
  osId: string;
  osNumero: number;
  tipoServico: string;
  clienteNome: string;
  placa: string;
  modelo: string;
  charges: ChargeWithOS[];
  totalPendente: number;
  totalPago: number;
}

export interface ControleResumo {
  totalPendente: number;
  pagoHoje: number;
  pagoSemana: number;
  pagoMes: number;
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/finance.ts
git commit -m "feat: add ChargeWithOS, OSChargeGroup, ControleResumo types"
```

---

## Task 3: Finance Service Functions

**Files:**
- Modify: `src/lib/financeService.ts`

- [ ] **Step 1: Add `getAllChargesWithOS` function**

This is the main query that joins charges with OS/cliente/veículo data. Add at the end of the file:

```typescript
import type { ChargeWithOS, OSChargeGroup, ControleResumo } from '../types/finance';

// ---------- CONTROLE DE PAGAMENTOS ----------

export async function getAllChargesWithOS(): Promise<ChargeWithOS[]> {
  const { data, error } = await supabase
    .from('finance_charges')
    .select(`
      *,
      ordens_de_servico!inner (
        numero,
        tipo_servico,
        clientes!inner ( nome ),
        veiculos!inner ( placa, modelo )
      )
    `)
    .neq('status', 'cancelado')
    .order('status', { ascending: true })
    .order('criado_em', { ascending: false });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    os_id: row.os_id,
    descricao: row.descricao,
    categoria: row.categoria,
    valor_previsto: Number(row.valor_previsto),
    valor_pago: Number(row.valor_pago),
    due_date: row.due_date,
    status: row.status,
    comprovante_url: row.comprovante_url,
    observacao: row.observacao,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    confirmado_por: row.confirmado_por,
    confirmado_em: row.confirmado_em,
    os_numero: row.ordens_de_servico.numero,
    tipo_servico: row.ordens_de_servico.tipo_servico,
    cliente_nome: row.ordens_de_servico.clientes.nome,
    placa: row.ordens_de_servico.veiculos.placa,
    modelo: row.ordens_de_servico.veiculos.modelo,
  }));
}
```

- [ ] **Step 2: Add `groupChargesByOS` helper**

```typescript
export function groupChargesByOS(charges: ChargeWithOS[]): OSChargeGroup[] {
  const map = new Map<string, OSChargeGroup>();

  for (const c of charges) {
    if (!map.has(c.os_id)) {
      map.set(c.os_id, {
        osId: c.os_id,
        osNumero: c.os_numero,
        tipoServico: c.tipo_servico,
        clienteNome: c.cliente_nome,
        placa: c.placa,
        modelo: c.modelo,
        charges: [],
        totalPendente: 0,
        totalPago: 0,
      });
    }
    const group = map.get(c.os_id)!;
    group.charges.push(c);
    if (c.status === 'a_pagar') {
      group.totalPendente += c.valor_previsto;
    } else if (c.status === 'pago') {
      group.totalPago += c.valor_pago;
    }
  }

  // Sort: OS with more pending charges first
  return Array.from(map.values()).sort((a, b) => {
    const aPending = a.charges.filter(c => c.status === 'a_pagar').length;
    const bPending = b.charges.filter(c => c.status === 'a_pagar').length;
    return bPending - aPending;
  });
}
```

- [ ] **Step 3: Add `confirmarPagamento` function**

```typescript
export async function confirmarPagamento(
  chargeId: string,
  valor: number,
  data: string,
  usuario: string,
): Promise<void> {
  const confirmadoEm = new Date(data + 'T12:00:00').toISOString();
  const { error } = await supabase
    .from('finance_charges')
    .update({
      status: 'pago',
      valor_pago: valor,
      confirmado_por: usuario,
      confirmado_em: confirmadoEm,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', chargeId);
  if (error) throw error;
}
```

- [ ] **Step 4: Add `reverterPagamento` function**

```typescript
export async function reverterPagamento(chargeId: string): Promise<void> {
  const { error } = await supabase
    .from('finance_charges')
    .update({
      status: 'a_pagar',
      valor_pago: 0,
      confirmado_por: null,
      confirmado_em: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', chargeId);
  if (error) throw error;
}
```

- [ ] **Step 5: Add `confirmarTodosDaOS` function**

```typescript
export async function confirmarTodosDaOS(osId: string, usuario: string): Promise<void> {
  // Get all pending charges for this OS
  const { data, error: fetchError } = await supabase
    .from('finance_charges')
    .select('id, valor_previsto')
    .eq('os_id', osId)
    .eq('status', 'a_pagar');

  if (fetchError) throw fetchError;
  if (!data || data.length === 0) return;

  // Update each charge individually (atomic per charge, avoids race condition)
  const now = new Date().toISOString();
  for (const charge of data) {
    const { error } = await supabase
      .from('finance_charges')
      .update({
        status: 'pago',
        valor_pago: Number(charge.valor_previsto),
        confirmado_por: usuario,
        confirmado_em: now,
        atualizado_em: now,
      })
      .eq('id', charge.id)
      .eq('status', 'a_pagar'); // Guard: only update if still pending
    if (error) throw error;
  }
}
```

- [ ] **Step 6: Add `getResumoControle` function**

```typescript
export async function getResumoControle(): Promise<ControleResumo> {
  const now = new Date();
  const hoje = now.toISOString().split('T')[0];
  const inicioSemana = new Date(now);
  inicioSemana.setDate(now.getDate() - now.getDay());
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data, error } = await supabase
    .from('finance_charges')
    .select('valor_previsto, valor_pago, status, confirmado_em')
    .neq('status', 'cancelado');

  if (error) throw error;

  let totalPendente = 0;
  let pagoHoje = 0;
  let pagoSemana = 0;
  let pagoMes = 0;

  for (const row of data || []) {
    if (row.status === 'a_pagar') {
      totalPendente += Number(row.valor_previsto);
    }
    if (row.status === 'pago' && row.confirmado_em) {
      const dt = row.confirmado_em.split('T')[0];
      const dtDate = new Date(row.confirmado_em);
      const valor = Number(row.valor_pago);
      if (dt === hoje) pagoHoje += valor;
      if (dtDate >= inicioSemana) pagoSemana += valor;
      if (dtDate >= inicioMes) pagoMes += valor;
    }
  }

  return { totalPendente, pagoHoje, pagoSemana, pagoMes };
}
```

- [ ] **Step 7: Verify compilation**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/financeService.ts
git commit -m "feat: add payment control service functions"
```

---

## Task 4: Create ControlePagamentos Page

**Files:**
- Create: `src/pages/ControlePagamentos.tsx`

This is the main page component. It contains all sub-components inline (ResumoCards, FiltrosBar, OSChargeGroup, ChargeRow, ConfirmPopover) since they are tightly coupled and only used here.

- [ ] **Step 1: Create the page file**

Create `src/pages/ControlePagamentos.tsx` with the following structure:

```typescript
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../components/ConfirmProvider';
import { useNavigate } from 'react-router-dom';
import {
  getAllChargesWithOS,
  groupChargesByOS,
  confirmarPagamento,
  reverterPagamento,
  confirmarTodosDaOS,
  getResumoControle,
} from '../lib/financeService';
import type { OSChargeGroup, ControleResumo, ChargeWithOS, FinanceChargeCategoria } from '../types/finance';
import { CheckSquare, Search, Filter, ChevronDown, ChevronUp, Check, Undo2, AlertTriangle, Clock, DollarSign } from 'lucide-react';
```

**State and data loading:**
```typescript
export default function ControlePagamentos() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isAdmin = usuario?.role === 'admin';

  // Guard: only admin/gerente
  useEffect(() => {
    if (usuario && usuario.role !== 'admin' && usuario.role !== 'gerente') {
      navigate('/');
    }
  }, [usuario, navigate]);

  const [groups, setGroups] = useState<OSChargeGroup[]>([]);
  const [resumo, setResumo] = useState<ControleResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Filters
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'pendente' | 'pago' | 'todos'>('pendente');
  const [filtroCategoria, setFiltroCategoria] = useState<FinanceChargeCategoria | 'todos'>('todos');
  // Date range filter (default: current month)
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split('T')[0]);

  // Popover
  const [popover, setPopover] = useState<{
    chargeId: string;
    tipo: 'confirmar' | 'reverter' | 'confirmar_todos';
    osId?: string;
    valorInicial: number;
  } | null>(null);
  const [popoverValor, setPopoverValor] = useState('');
  const [popoverData, setPopoverData] = useState('');

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      setErro(null);
      const [charges, res] = await Promise.all([
        getAllChargesWithOS(),
        getResumoControle(),
      ]);
      setGroups(groupChargesByOS(charges));
      setResumo(res);
    } catch (err) {
      console.error(err);
      setErro('Erro ao carregar dados. Tentar novamente?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
```

**Filtering logic (useMemo):**
```typescript
  // Helper: check if charge is overdue
  const isOverdue = (c: ChargeWithOS) =>
    c.status === 'a_pagar' && c.due_date && new Date(c.due_date + 'T23:59:59') < new Date();

  const filteredGroups = useMemo(() => {
    let result = groups;

    // Date range filter (filters by charge criado_em)
    if (dataInicio || dataFim) {
      result = result
        .map(g => ({
          ...g,
          charges: g.charges.filter(c => {
            const dt = c.criado_em.split('T')[0];
            if (dataInicio && dt < dataInicio) return false;
            if (dataFim && dt > dataFim) return false;
            return true;
          }),
        }))
        .filter(g => g.charges.length > 0);
    }

    // Text search
    if (busca.trim()) {
      const q = busca.toLowerCase();
      result = result.filter(g =>
        g.clienteNome.toLowerCase().includes(q) ||
        g.placa.toLowerCase().includes(q) ||
        `#${g.osNumero}`.includes(q)
      );
    }

    // Status filter on charges within groups
    if (filtroStatus !== 'todos') {
      result = result
        .map(g => ({
          ...g,
          charges: g.charges.filter(c =>
            filtroStatus === 'pendente' ? c.status === 'a_pagar' : c.status === 'pago'
          ),
        }))
        .filter(g => g.charges.length > 0);
    }

    // Category filter
    if (filtroCategoria !== 'todos') {
      result = result
        .map(g => ({
          ...g,
          charges: g.charges.filter(c => c.categoria === filtroCategoria),
        }))
        .filter(g => g.charges.length > 0);
    }

    return result;
  }, [groups, busca, filtroStatus, filtroCategoria, dataInicio, dataFim]);
```

**Action handlers:**
```typescript
  const handleConfirmar = async () => {
    if (!popover || !usuario) return;
    try {
      const valor = parseFloat(popoverValor.replace(/\./g, '').replace(',', '.')) || 0;
      if (popover.tipo === 'confirmar_todos' && popover.osId) {
        await confirmarTodosDaOS(popover.osId, usuario.nome);
      } else {
        await confirmarPagamento(popover.chargeId, valor, popoverData, usuario.nome);
      }
      setPopover(null);
      await carregar();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReverter = async (chargeId: string) => {
    const ok = await confirm({ message: 'Reverter este pagamento para pendente?', danger: true, confirmText: 'Reverter' });
    if (!ok) return;
    try {
      await reverterPagamento(chargeId);
      await carregar();
    } catch (err) {
      console.error(err);
    }
  };

  const openConfirmPopover = (chargeId: string, valorPrevisto: number) => {
    setPopover({ chargeId, tipo: 'confirmar', valorInicial: valorPrevisto });
    setPopoverValor(valorPrevisto.toFixed(2).replace('.', ','));
    setPopoverData(new Date().toISOString().split('T')[0]);
  };

  const openConfirmAllPopover = (osId: string, totalPendente: number) => {
    setPopover({ chargeId: '', tipo: 'confirmar_todos', osId, valorInicial: totalPendente });
    setPopoverValor(totalPendente.toFixed(2).replace('.', ','));
    setPopoverData(new Date().toISOString().split('T')[0]);
  };

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
```

**JSX — implement the full page with:**
- Summary cards (4 cards at top using `resumo`)
- Filter bar (search input, status toggles, category dropdown, **date range inputs** for `dataInicio`/`dataFim`)
- Grouped OS list iterating `filteredGroups`
- Each `OSChargeGroup` renders a card with header (OS#, client, plate) and charge rows
- Each charge row has:
  - Status dot: **yellow** = pendente, **green** = pago, **red** = atrasado (use `isOverdue(charge)` helper)
  - Confirm button or paid info
  - Overdue charges show `⚠ Atrasado` badge in red next to the status dot
- Confirm popover (absolute positioned, appears on click)
- Loading skeleton, error state, empty state
- Use existing CSS variables: `--bg-card`, `--bg-surface`, `--color-primary`, `--border-color`, `--color-success`, `--color-warning`, `--color-danger`, `--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`
- Follow the card-based layout pattern from FinancePainel (inline styles with CSS vars)
- **Note:** Uses inline `useEffect` redirect instead of `<AdminRoute>` wrapper because this page allows both admin AND gerente (existing `AdminRoute` only checks for admin)

> **Implementation note:** The full JSX is ~400 lines. The subagent should build it following the existing patterns in `Financeiro.tsx` and `FinancePainel.tsx`. Key visual elements:
> - Cards resumo: 4 flex cards with icon, label, value
> - Filter bar: flex row with input + toggle buttons
> - OS groups: cards with colored left border (yellow=has pending, green=all paid)
> - Charge rows: flex rows with status dot, description, value, action button
> - Confirm popover: absolute positioned div with value input, date input, confirm button
> - Paid info: green text showing "Pago · Pedro · 21/03"

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/ControlePagamentos.tsx
git commit -m "feat: create ControlePagamentos page"
```

---

## Task 5: Routing and Navigation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Add route in App.tsx**

Import the page:
```typescript
import ControlePagamentos from './pages/ControlePagamentos';
```

Add route (inside `<Routes>`, near the `/financeiro` route):
```typescript
<Route path="/controle-pagamentos" element={<ControlePagamentos />} />
```

- [ ] **Step 2: Add sidebar menu item in Layout.tsx**

In the OPERAÇÕES section items array, add before "Financeiro":
```typescript
{ to: '/controle-pagamentos', icon: CheckSquare, label: 'Controle Pagamentos' },
```

Import `CheckSquare` from lucide-react if not already imported.

- [ ] **Step 3: Add role filter in Layout.tsx**

In the menu filtering logic, add:
```typescript
if (item.to === '/controle-pagamentos' && usuario?.role !== 'admin' && usuario?.role !== 'gerente') return false;
```

- [ ] **Step 4: Verify compilation and test navigation**

```bash
npx tsc --noEmit
```

Open browser, verify:
- Admin sees "Controle Pagamentos" in sidebar
- Clicking opens the page
- Funcionário does NOT see the menu item

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Layout.tsx
git commit -m "feat: add route and sidebar for Controle Pagamentos"
```

---

## Task 6: Visual Polish and Testing

**Files:**
- Modify: `src/pages/ControlePagamentos.tsx` (if needed)

- [ ] **Step 1: Test confirm flow**

1. Open Controle Pagamentos page
2. Find an OS with pending charges
3. Click "✓ Confirmar" on a charge
4. Verify popover appears with correct value
5. Click "Confirmar Pagamento"
6. Verify charge changes to "Pago" with user name and date
7. Verify summary cards update

- [ ] **Step 2: Test integration with FinancePainel**

1. After confirming a charge in Controle Pagamentos
2. Navigate to that OS detail → Financeiro tab
3. Verify the charge shows as "Pago" in FinancePainel

- [ ] **Step 3: Test "Confirmar Todos" flow**

1. Find an OS with multiple pending charges
2. Click "✓ Confirmar Todos"
3. Verify all charges change to Pago

- [ ] **Step 4: Test revert flow (admin only)**

1. As admin, click on a "Pago" badge
2. Confirm revert
3. Verify charge goes back to "Pendente"

- [ ] **Step 5: Test filters**

1. Search by client name → only matching OS appear
2. Search by plate → only matching OS appear
3. Toggle "Pago" → only paid charges show
4. Toggle "Pendente" → only pending charges show

- [ ] **Step 6: Test role access**

1. Login as funcionário → menu item hidden, direct URL redirects
2. Login as gerente → page accessible, revert button hidden
3. Login as admin → full access

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: controle de pagamentos - visual polish and testing"
```

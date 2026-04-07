# Módulo Financeiro das OS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar módulo financeiro completo às Ordens de Serviço, com cobranças automáticas, registro de pagamentos, tabela de preços e relatório financeiro.

**Architecture:** Três novas tabelas Supabase (`finance_charges`, `payments`, `price_table`) com serviço TypeScript de acesso; painel financeiro embutido na tela OSDetail como nova seção colapsável; nova página `/financeiro` com dashboard e relatórios.

**Tech Stack:** React 18, TypeScript, Supabase (PostgreSQL + RLS), Vite, Tailwind CSS, date-fns

---

## Mapa de Arquivos

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Create | `src/types/finance.ts` | Tipos FinanceCharge, Payment, PriceTableItem, enums |
| Create | `src/lib/financeService.ts` | CRUD cobranças, pagamentos, tabela de preços |
| Create | `src/components/finance/FinancePainel.tsx` | Painel resumo (total previsto/pago/saldo) dentro da OS |
| Create | `src/components/finance/ChargeTable.tsx` | Tabela de cobranças com status colorido e ações |
| Create | `src/components/finance/PaymentModal.tsx` | Modal para registrar pagamento |
| Create | `src/components/finance/AddChargeModal.tsx` | Modal para adicionar cobrança manual |
| Create | `src/pages/Financeiro.tsx` | Página de relatório financeiro global |
| Modify | `src/types.ts` | Re-export de `src/types/finance.ts` |
| Modify | `src/pages/OSDetail.tsx` | Adicionar seção financeiro (FinancePainel) |
| Modify | `src/components/Layout.tsx` | Adicionar link "Financeiro" no menu |
| Modify | `src/App.tsx` | Adicionar rota `/financeiro` |
| Create | `supabase/migrations/YYYYMMDD_financeiro.sql` | Migration completa das 3 tabelas + RLS |

---

## Task 1: Migração do Banco de Dados

**Files:**
- Create: `supabase/migrations/20260320000001_financeiro.sql`

- [ ] **1.1 — Criar arquivo de migration**

```sql
-- supabase/migrations/20260320000001_financeiro.sql

-- ============================================================
-- TABELA DE PREÇOS
-- ============================================================
CREATE TABLE IF NOT EXISTS price_table (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       TEXT NOT NULL UNIQUE,   -- ex: 'dae_principal', 'vistoria', 'placa_carro_mercosul'
  descricao    TEXT NOT NULL,
  valor        NUMERIC(10,2) NOT NULL,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Valores iniciais
INSERT INTO price_table (codigo, descricao, valor) VALUES
  ('dae_principal',          'Taxa de Serviço DAE (Transferência / 1º Emplacamento / 2ª Via)', 150.54),
  ('vistoria',               'Taxa de Vistoria Veicular', 133.17),
  ('placa_carro_mercosul',   'Placa Carro Mercosul (par)', 200.00),
  ('placa_moto_mercosul',    'Placa Moto Mercosul',        150.00),
  ('placa_carro_comum',      'Placa Carro Comum (par)',    180.00),
  ('placa_moto_comum',       'Placa Moto Comum',           130.00)
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- COBRANÇAS POR OS
-- ============================================================
CREATE TYPE finance_charge_categoria AS ENUM
  ('dae_principal', 'dae_adicional', 'vistoria', 'placa', 'outro');

CREATE TYPE finance_charge_status AS ENUM
  ('a_pagar', 'pago', 'cancelado');

CREATE TABLE IF NOT EXISTS finance_charges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id           UUID NOT NULL REFERENCES ordens_de_servico(id) ON DELETE CASCADE,
  descricao       TEXT NOT NULL,
  categoria       finance_charge_categoria NOT NULL,
  valor_previsto  NUMERIC(10,2) NOT NULL,
  valor_pago      NUMERIC(10,2) NOT NULL DEFAULT 0,
  due_date        DATE,
  status          finance_charge_status NOT NULL DEFAULT 'a_pagar',
  comprovante_url TEXT,
  observacao      TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_finance_charges_os_id ON finance_charges(os_id);

-- ============================================================
-- PAGAMENTOS
-- ============================================================
CREATE TYPE payment_metodo AS ENUM ('pix', 'boleto', 'cartao', 'dinheiro', 'ted', 'outro');

CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id            UUID NOT NULL REFERENCES ordens_de_servico(id) ON DELETE CASCADE,
  charge_id        UUID REFERENCES finance_charges(id) ON DELETE SET NULL,
  data_pagamento   DATE NOT NULL,
  valor            NUMERIC(10,2) NOT NULL,
  metodo           payment_metodo NOT NULL DEFAULT 'pix',
  instituicao      TEXT,
  comprovante_url  TEXT,
  observacao       TEXT,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_os_id ON payments(os_id);
CREATE INDEX idx_payments_charge_id ON payments(charge_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE price_table      ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_charges  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados têm acesso total (mesma política do resto do sistema)
CREATE POLICY "auth_all_price_table"     ON price_table     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_finance_charges" ON finance_charges FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_payments"        ON payments        FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_price_table_updated_at     BEFORE UPDATE ON price_table     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_finance_charges_updated_at BEFORE UPDATE ON finance_charges FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated_at        BEFORE UPDATE ON payments        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **1.2 — Aplicar migration via Supabase MCP**

Use a ferramenta `mcp__supabase__apply_migration` com project_id `mrcclxbzdwarfhgygikc` e o conteúdo SQL acima.

- [ ] **1.3 — Verificar tabelas criadas**

Use `mcp__supabase__list_tables` e confirme que `price_table`, `finance_charges`, `payments` aparecem.

- [ ] **1.4 — Commit**
```bash
git add supabase/migrations/
git commit -m "feat: migration módulo financeiro (finance_charges, payments, price_table)"
```

---

## Task 2: Tipos TypeScript

**Files:**
- Create: `src/types/finance.ts`
- Modify: `src/types.ts` (adicionar re-export)

- [ ] **2.1 — Criar `src/types/finance.ts`**

```typescript
// src/types/finance.ts

export type FinanceChargeCategoria =
  | 'dae_principal'
  | 'dae_adicional'
  | 'vistoria'
  | 'placa'
  | 'outro';

export type FinanceChargeStatus = 'a_pagar' | 'pago' | 'cancelado';

export type PaymentMetodo = 'pix' | 'boleto' | 'cartao' | 'dinheiro' | 'ted' | 'outro';

export interface FinanceCharge {
  id: string;
  os_id: string;
  descricao: string;
  categoria: FinanceChargeCategoria;
  valor_previsto: number;
  valor_pago: number;
  due_date?: string;        // ISO date 'YYYY-MM-DD'
  status: FinanceChargeStatus;
  comprovante_url?: string;
  observacao?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface Payment {
  id: string;
  os_id: string;
  charge_id?: string;
  data_pagamento: string;   // ISO date 'YYYY-MM-DD'
  valor: number;
  metodo: PaymentMetodo;
  instituicao?: string;
  comprovante_url?: string;
  observacao?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface PriceTableItem {
  id: string;
  codigo: string;
  descricao: string;
  valor: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

// Labels para UI
export const FINANCE_CATEGORIA_LABELS: Record<FinanceChargeCategoria, string> = {
  dae_principal: 'DAE Principal',
  dae_adicional: 'DAE Adicional',
  vistoria:      'Vistoria',
  placa:         'Placa',
  outro:         'Outro',
};

export const FINANCE_STATUS_LABELS: Record<FinanceChargeStatus, string> = {
  a_pagar:   'A Pagar',
  pago:      'Pago',
  cancelado: 'Cancelado',
};

export const PAYMENT_METODO_LABELS: Record<PaymentMetodo, string> = {
  pix:      'PIX',
  boleto:   'Boleto',
  cartao:   'Cartão',
  dinheiro: 'Dinheiro',
  ted:      'TED',
  outro:    'Outro',
};

// Resumo financeiro calculado (derivado, não armazenado)
export interface FinanceResumo {
  totalPrevisto: number;
  totalPago: number;
  saldoPendente: number;
  statusGeral: 'pago' | 'parcial' | 'pendente';
}
```

- [ ] **2.2 — Adicionar re-export em `src/types.ts`**

No final do arquivo, adicionar:
```typescript
// --- FINANCEIRO ---
export * from './types/finance';
```

- [ ] **2.3 — Commit**
```bash
git add src/types/finance.ts src/types.ts
git commit -m "feat: tipos TypeScript do módulo financeiro"
```

---

## Task 3: Finance Service

**Files:**
- Create: `src/lib/financeService.ts`

- [ ] **3.1 — Criar `src/lib/financeService.ts`**

```typescript
// src/lib/financeService.ts
import { supabase } from './supabaseClient';
import type {
  FinanceCharge,
  FinanceChargeCategoria,
  Payment,
  PaymentMetodo,
  PriceTableItem,
  FinanceResumo,
} from '../types/finance';
import type { TipoServico } from '../types';

// ── PRICE TABLE ──────────────────────────────────────────────

export async function getPriceTable(): Promise<PriceTableItem[]> {
  const { data, error } = await supabase
    .from('price_table')
    .select('*')
    .eq('ativo', true)
    .order('descricao');
  if (error) throw error;
  return data as PriceTableItem[];
}

export async function updatePriceItem(id: string, valor: number): Promise<void> {
  const { error } = await supabase
    .from('price_table')
    .update({ valor })
    .eq('id', id);
  if (error) throw error;
}

export async function getPriceByCodigo(codigo: string): Promise<number> {
  const { data, error } = await supabase
    .from('price_table')
    .select('valor')
    .eq('codigo', codigo)
    .eq('ativo', true)
    .single();
  if (error) return 0;
  return (data as { valor: number }).valor;
}

// ── COBRANÇAS ─────────────────────────────────────────────────

export async function getChargesByOS(osId: string): Promise<FinanceCharge[]> {
  const { data, error } = await supabase
    .from('finance_charges')
    .select('*')
    .eq('os_id', osId)
    .order('criado_em');
  if (error) throw error;
  return data as FinanceCharge[];
}

export async function addCharge(
  osId: string,
  descricao: string,
  categoria: FinanceChargeCategoria,
  valorPrevisto: number,
  dueDate?: string,
  observacao?: string,
): Promise<FinanceCharge> {
  const { data, error } = await supabase
    .from('finance_charges')
    .insert({
      os_id: osId,
      descricao,
      categoria,
      valor_previsto: valorPrevisto,
      due_date: dueDate ?? null,
      observacao: observacao ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as FinanceCharge;
}

export async function updateCharge(
  id: string,
  updates: Partial<Pick<FinanceCharge, 'descricao' | 'valor_previsto' | 'due_date' | 'status' | 'observacao' | 'comprovante_url'>>,
): Promise<void> {
  const { error } = await supabase
    .from('finance_charges')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCharge(id: string): Promise<void> {
  const { error } = await supabase
    .from('finance_charges')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── COBRANÇAS AUTOMÁTICAS AO CRIAR OS ─────────────────────────

/** Serviços que geram DAE principal automaticamente */
const SERVICOS_COM_DAE: TipoServico[] = [
  'transferencia',
  'primeiro_emplacamento',
  'segunda_via',
];

/**
 * Gera as cobranças padrão para uma OS recém-criada.
 * Chamar após criar a OS no banco.
 */
export async function gerarCobrancasIniciais(
  osId: string,
  tipoServico: TipoServico,
  trocaPlaca: boolean,
  temVistoria: boolean,
): Promise<void> {
  const charges: Omit<FinanceCharge, 'id' | 'criado_em' | 'atualizado_em' | 'valor_pago' | 'status'>[] = [];

  if (SERVICOS_COM_DAE.includes(tipoServico)) {
    const valorDae = await getPriceByCodigo('dae_principal');
    charges.push({
      os_id: osId,
      descricao: 'Taxa de Serviço DAE',
      categoria: 'dae_principal',
      valor_previsto: valorDae,
      comprovante_url: undefined,
      observacao: undefined,
      due_date: undefined,
    });
  }

  if (temVistoria) {
    const valorVistoria = await getPriceByCodigo('vistoria');
    charges.push({
      os_id: osId,
      descricao: 'Taxa de Vistoria Veicular',
      categoria: 'vistoria',
      valor_previsto: valorVistoria,
      comprovante_url: undefined,
      observacao: undefined,
      due_date: undefined,
    });
  }

  if (trocaPlaca) {
    const valorPlaca = await getPriceByCodigo('placa_carro_mercosul');
    charges.push({
      os_id: osId,
      descricao: 'Placa Mercosul (par)',
      categoria: 'placa',
      valor_previsto: valorPlaca,
      comprovante_url: undefined,
      observacao: undefined,
      due_date: undefined,
    });
  }

  if (charges.length === 0) return;

  const { error } = await supabase.from('finance_charges').insert(
    charges.map(c => ({
      os_id: c.os_id,
      descricao: c.descricao,
      categoria: c.categoria,
      valor_previsto: c.valor_previsto,
    })),
  );
  if (error) throw error;
}

// ── PAGAMENTOS ────────────────────────────────────────────────

export async function getPaymentsByOS(osId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('os_id', osId)
    .order('data_pagamento');
  if (error) throw error;
  return data as Payment[];
}

export async function addPayment(
  osId: string,
  chargeId: string | undefined,
  dataPagamento: string,
  valor: number,
  metodo: PaymentMetodo,
  instituicao?: string,
  comprovanteUrl?: string,
  observacao?: string,
): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      os_id: osId,
      charge_id: chargeId ?? null,
      data_pagamento: dataPagamento,
      valor,
      metodo,
      instituicao: instituicao ?? null,
      comprovante_url: comprovanteUrl ?? null,
      observacao: observacao ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  // Atualizar valor_pago na cobrança vinculada
  if (chargeId) {
    const charges = await getChargesByOS(osId);
    const charge = charges.find(c => c.id === chargeId);
    if (charge) {
      const novoPago = charge.valor_pago + valor;
      const novoStatus = novoPago >= charge.valor_previsto ? 'pago' : 'a_pagar';
      await updateCharge(chargeId, { valor_pago: novoPago, status: novoStatus });
    }
  }

  return data as Payment;
}

export async function deletePayment(id: string, chargeId?: string, valor?: number, osId?: string): Promise<void> {
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw error;

  // Reverter valor_pago da cobrança
  if (chargeId && valor !== undefined && osId) {
    const charges = await getChargesByOS(osId);
    const charge = charges.find(c => c.id === chargeId);
    if (charge) {
      const novoPago = Math.max(0, charge.valor_pago - valor);
      const novoStatus = novoPago >= charge.valor_previsto ? 'pago' : 'a_pagar';
      await updateCharge(chargeId, { valor_pago: novoPago, status: novoStatus });
    }
  }
}

// ── RESUMO ────────────────────────────────────────────────────

export function calcularResumo(charges: FinanceCharge[]): FinanceResumo {
  const totalPrevisto = charges
    .filter(c => c.status !== 'cancelado')
    .reduce((s, c) => s + c.valor_previsto, 0);

  const totalPago = charges
    .filter(c => c.status !== 'cancelado')
    .reduce((s, c) => s + c.valor_pago, 0);

  const saldoPendente = totalPrevisto - totalPago;

  const statusGeral =
    totalPrevisto === 0
      ? 'pago'
      : totalPago >= totalPrevisto
      ? 'pago'
      : totalPago > 0
      ? 'parcial'
      : 'pendente';

  return { totalPrevisto, totalPago, saldoPendente, statusGeral };
}

// ── RELATÓRIO GLOBAL ──────────────────────────────────────────

export interface FinanceRelatorio {
  periodo: { inicio: string; fim: string };
  totalPrevisto: number;
  totalRecebido: number;
  porCategoria: Record<string, { previsto: number; recebido: number }>;
  osComSaldoPendente: number;
}

export async function getRelatorio(inicio: string, fim: string): Promise<FinanceRelatorio> {
  const { data: charges, error } = await supabase
    .from('finance_charges')
    .select('*, ordens_de_servico!inner(data_abertura)')
    .gte('ordens_de_servico.data_abertura', inicio)
    .lte('ordens_de_servico.data_abertura', fim)
    .neq('status', 'cancelado');
  if (error) throw error;

  const list = charges as (FinanceCharge & { ordens_de_servico: { data_abertura: string } })[];

  const totalPrevisto = list.reduce((s, c) => s + c.valor_previsto, 0);
  const totalRecebido = list.reduce((s, c) => s + c.valor_pago, 0);

  const porCategoria: Record<string, { previsto: number; recebido: number }> = {};
  for (const c of list) {
    if (!porCategoria[c.categoria]) porCategoria[c.categoria] = { previsto: 0, recebido: 0 };
    porCategoria[c.categoria].previsto += c.valor_previsto;
    porCategoria[c.categoria].recebido += c.valor_pago;
  }

  const osComSaldoPendente = new Set(
    list.filter(c => c.status === 'a_pagar').map(c => c.os_id),
  ).size;

  return { periodo: { inicio, fim }, totalPrevisto, totalRecebido, porCategoria, osComSaldoPendente };
}
```

- [ ] **3.2 — Commit**
```bash
git add src/lib/financeService.ts
git commit -m "feat: financeService com CRUD cobranças, pagamentos e relatório"
```

---

## Task 4: Componente FinancePainel (resumo inline na OS)

**Files:**
- Create: `src/components/finance/FinancePainel.tsx`

- [ ] **4.1 — Criar diretório e componente**

```typescript
// src/components/finance/FinancePainel.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  getChargesByOS,
  calcularResumo,
  addCharge,
  updateCharge,
  deleteCharge,
  addPayment,
  deletePayment,
  getPaymentsByOS,
} from '../../lib/financeService';
import type { FinanceCharge, Payment, FinanceResumo } from '../../types/finance';
import {
  FINANCE_CATEGORIA_LABELS,
  FINANCE_STATUS_LABELS,
  PAYMENT_METODO_LABELS,
} from '../../types/finance';
import AddChargeModal from './AddChargeModal';
import PaymentModal from './PaymentModal';

interface Props {
  osId: string;
  readOnly?: boolean;
}

export default function FinancePainel({ osId, readOnly = false }: Props) {
  const [charges, setCharges] = useState<FinanceCharge[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [resumo, setResumo] = useState<FinanceResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [showPayment, setShowPayment] = useState<FinanceCharge | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        getChargesByOS(osId),
        getPaymentsByOS(osId),
      ]);
      setCharges(c);
      setPayments(p);
      setResumo(calcularResumo(c));
    } finally {
      setLoading(false);
    }
  }, [osId]);

  useEffect(() => { carregar(); }, [carregar]);

  const statusColor = resumo
    ? resumo.statusGeral === 'pago'
      ? 'text-green-600 bg-green-50 border-green-200'
      : resumo.statusGeral === 'parcial'
      ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
      : 'text-red-600 bg-red-50 border-red-200'
    : '';

  const chargeStatusBadge = (status: FinanceCharge['status']) => {
    const map = {
      a_pagar: 'bg-red-100 text-red-700',
      pago: 'bg-green-100 text-green-700',
      cancelado: 'bg-gray-100 text-gray-500',
    };
    return map[status];
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-gray-400 text-sm">
        Carregando financeiro…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Resumo ─────────────────────────────────────────── */}
      {resumo && (
        <div className={`rounded-lg border p-4 flex flex-wrap gap-6 items-center ${statusColor}`}>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">Previsto</p>
            <p className="text-lg font-bold">
              {resumo.totalPrevisto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">Recebido</p>
            <p className="text-lg font-bold">
              {resumo.totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">Saldo Pendente</p>
            <p className="text-lg font-bold">
              {resumo.saldoPendente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <div className="ml-auto">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${statusColor}`}>
              {resumo.statusGeral === 'pago' ? '✓ Pago' : resumo.statusGeral === 'parcial' ? '◑ Parcial' : '✗ Pendente'}
            </span>
          </div>
        </div>
      )}

      {/* ── Tabela de Cobranças ─────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700">Cobranças</h4>
          {!readOnly && (
            <button
              onClick={() => setShowAddCharge(true)}
              className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
            >
              + Adicionar
            </button>
          )}
        </div>

        {charges.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Nenhuma cobrança registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="px-3 py-2 text-left">Categoria</th>
                  <th className="px-3 py-2 text-right">Previsto</th>
                  <th className="px-3 py-2 text-right">Pago</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  {!readOnly && <th className="px-3 py-2 text-center">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {charges.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{c.descricao}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {FINANCE_CATEGORIA_LABELS[c.categoria]}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {c.valor_previsto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {c.valor_pago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${chargeStatusBadge(c.status)}`}>
                        {FINANCE_STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    {!readOnly && (
                      <td className="px-3 py-2 text-center space-x-2">
                        {c.status === 'a_pagar' && (
                          <button
                            onClick={() => setShowPayment(c)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Pagar
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (confirm('Cancelar esta cobrança?')) {
                              await updateCharge(c.id, { status: 'cancelado' });
                              carregar();
                            }
                          }}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Cancelar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Histórico de Pagamentos ─────────────────────────── */}
      {payments.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Pagamentos Registrados</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-center">Método</th>
                  <th className="px-3 py-2 text-left">Instituição</th>
                  {!readOnly && <th className="px-3 py-2 text-center">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      {new Date(p.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-green-700">
                      {p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-3 py-2 text-center">{PAYMENT_METODO_LABELS[p.metodo]}</td>
                    <td className="px-3 py-2 text-gray-500">{p.instituicao ?? '—'}</td>
                    {!readOnly && (
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={async () => {
                            if (confirm('Remover este pagamento?')) {
                              await deletePayment(p.id, p.charge_id, p.valor, p.os_id);
                              carregar();
                            }
                          }}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remover
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modais ─────────────────────────────────────────── */}
      {showAddCharge && (
        <AddChargeModal
          osId={osId}
          onClose={() => setShowAddCharge(false)}
          onSaved={carregar}
        />
      )}
      {showPayment && (
        <PaymentModal
          osId={osId}
          charge={showPayment}
          onClose={() => setShowPayment(null)}
          onSaved={carregar}
        />
      )}
    </div>
  );
}
```

- [ ] **4.2 — Commit**
```bash
git add src/components/finance/FinancePainel.tsx
git commit -m "feat: FinancePainel com resumo, tabela de cobranças e histórico de pagamentos"
```

---

## Task 5: Modal AddCharge

**Files:**
- Create: `src/components/finance/AddChargeModal.tsx`

- [ ] **5.1 — Criar componente**

```typescript
// src/components/finance/AddChargeModal.tsx
import React, { useState, useEffect } from 'react';
import { addCharge, getPriceTable } from '../../lib/financeService';
import type { FinanceChargeCategoria, PriceTableItem } from '../../types/finance';
import { FINANCE_CATEGORIA_LABELS } from '../../types/finance';

interface Props {
  osId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddChargeModal({ osId, onClose, onSaved }: Props) {
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState<FinanceChargeCategoria>('dae_adicional');
  const [valor, setValor] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [observacao, setObservacao] = useState('');
  const [priceTable, setPriceTable] = useState<PriceTableItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getPriceTable().then(setPriceTable);
  }, []);

  const preencherPreco = (codigo: string) => {
    const item = priceTable.find(p => p.codigo === codigo);
    if (item) {
      setValor(item.valor.toFixed(2));
      setDescricao(item.descricao);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addCharge(
        osId,
        descricao,
        categoria,
        parseFloat(valor),
        dueDate || undefined,
        observacao || undefined,
      );
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Nova Cobrança</h3>

        {/* Atalho tabela de preços */}
        {priceTable.length > 0 && (
          <div className="mb-4">
            <label className="text-xs text-gray-500 font-medium">Preencher da tabela de preços</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              defaultValue=""
              onChange={e => preencherPreco(e.target.value)}
            >
              <option value="">— Selecione —</option>
              {priceTable.map(p => (
                <option key={p.id} value={p.codigo}>
                  {p.descricao} — R$ {p.valor.toFixed(2)}
                </option>
              ))}
            </select>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-medium">Descrição *</label>
            <input
              required
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Categoria *</label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value as FinanceChargeCategoria)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {(Object.keys(FINANCE_CATEGORIA_LABELS) as FinanceChargeCategoria[]).map(k => (
                <option key={k} value={k}>{FINANCE_CATEGORIA_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Valor (R$) *</label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={e => setValor(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Vencimento</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Observação</label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={2}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Salvando…' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **5.2 — Commit**
```bash
git add src/components/finance/AddChargeModal.tsx
git commit -m "feat: AddChargeModal para cobranças manuais"
```

---

## Task 6: Modal PaymentModal

**Files:**
- Create: `src/components/finance/PaymentModal.tsx`

- [ ] **6.1 — Criar componente**

```typescript
// src/components/finance/PaymentModal.tsx
import React, { useState } from 'react';
import { addPayment } from '../../lib/financeService';
import type { FinanceCharge, PaymentMetodo } from '../../types/finance';
import { PAYMENT_METODO_LABELS } from '../../types/finance';

interface Props {
  osId: string;
  charge: FinanceCharge;
  onClose: () => void;
  onSaved: () => void;
}

const hoje = () => new Date().toISOString().slice(0, 10);

export default function PaymentModal({ osId, charge, onClose, onSaved }: Props) {
  const saldo = charge.valor_previsto - charge.valor_pago;
  const [data, setData] = useState(hoje());
  const [valor, setValor] = useState(saldo.toFixed(2));
  const [metodo, setMetodo] = useState<PaymentMetodo>('pix');
  const [instituicao, setInstituicao] = useState('');
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addPayment(
        osId,
        charge.id,
        data,
        parseFloat(valor),
        metodo,
        instituicao || undefined,
        undefined,
        observacao || undefined,
      );
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-1">Registrar Pagamento</h3>
        <p className="text-sm text-gray-500 mb-4">
          {charge.descricao} — Saldo:{' '}
          <span className="font-semibold text-red-600">
            {saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-medium">Data do Pagamento *</label>
            <input
              required
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Valor (R$) *</label>
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              value={valor}
              onChange={e => setValor(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Método *</label>
            <select
              value={metodo}
              onChange={e => setMetodo(e.target.value as PaymentMetodo)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {(Object.keys(PAYMENT_METODO_LABELS) as PaymentMetodo[]).map(k => (
                <option key={k} value={k}>{PAYMENT_METODO_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Instituição / Banco</label>
            <input
              value={instituicao}
              onChange={e => setInstituicao(e.target.value)}
              placeholder="Ex: Nubank, Inter, Caixa…"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Observação</label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={2}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Salvando…' : 'Confirmar Pagamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **6.2 — Commit**
```bash
git add src/components/finance/PaymentModal.tsx
git commit -m "feat: PaymentModal para registro de pagamentos"
```

---

## Task 7: Integrar FinancePainel na OSDetail

**Files:**
- Modify: `src/pages/OSDetail.tsx`

- [ ] **7.1 — Ler OSDetail.tsx** para identificar onde ficam as seções (checklist, vistoria, delegacia etc.)

- [ ] **7.2 — Adicionar import no topo**
```typescript
import FinancePainel from '../components/finance/FinancePainel';
```

- [ ] **7.3 — Adicionar seção financeiro**

Localizar o bloco de seções/tabs da OS e adicionar após a seção "Detran/DAE" (ou como última seção):

```tsx
{/* ── FINANCEIRO ─────────────────────────────────────────── */}
<section className="bg-white rounded-xl border border-gray-200 shadow-sm">
  <button
    className="w-full flex items-center justify-between px-6 py-4 text-left"
    onClick={() => setFinanceiroAberto(prev => !prev)}
  >
    <div className="flex items-center gap-2">
      <span className="text-lg">💰</span>
      <h2 className="text-base font-semibold text-gray-800">Financeiro</h2>
    </div>
    <span className="text-gray-400">{financeiroAberto ? '▲' : '▼'}</span>
  </button>
  {financeiroAberto && (
    <div className="px-6 pb-6">
      <FinancePainel osId={os.id} />
    </div>
  )}
</section>
```

- [ ] **7.4 — Adicionar estado `financeiroAberto`**
```typescript
const [financeiroAberto, setFinanceiroAberto] = useState(false);
```

- [ ] **7.5 — Verificar build**
```bash
npx tsc -b --noEmit
```
Esperado: sem erros TypeScript.

- [ ] **7.6 — Commit**
```bash
git add src/pages/OSDetail.tsx
git commit -m "feat: integrar FinancePainel na tela de detalhes da OS"
```

---

## Task 8: Geração Automática de Cobranças ao Criar OS

**Files:**
- Modify: `src/pages/OSForm.tsx`

- [ ] **8.1 — Localizar** o `handleSubmit` em `src/pages/OSForm.tsx` onde a OS é salva no Supabase.

- [ ] **8.2 — Adicionar chamada após criar OS**

```typescript
import { gerarCobrancasIniciais } from '../lib/financeService';

// ... dentro do handleSubmit, após inserir a OS com sucesso:
const osIdNova = savedOS.id; // ou data.id dependendo da implementação atual
const temVistoria = tipoServico === 'transferencia'
  || tipoServico === 'primeiro_emplacamento'
  || tipoServico === 'vistoria_lacrada';

try {
  await gerarCobrancasIniciais(osIdNova, tipoServico, trocaPlaca, temVistoria);
} catch (err) {
  console.error('Aviso: cobranças automáticas não puderam ser geradas', err);
  // Não bloqueia a criação da OS
}
```

- [ ] **8.3 — Verificar build**
```bash
npx tsc -b --noEmit
```

- [ ] **8.4 — Commit**
```bash
git add src/pages/OSForm.tsx
git commit -m "feat: gerar cobranças automáticas ao criar OS"
```

---

## Task 9: Página Financeiro (Relatório Global)

**Files:**
- Create: `src/pages/Financeiro.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/App.tsx`

- [ ] **9.1 — Criar `src/pages/Financeiro.tsx`**

```typescript
// src/pages/Financeiro.tsx
import React, { useEffect, useState } from 'react';
import { getRelatorio, getPriceTable, updatePriceItem } from '../lib/financeService';
import type { FinanceRelatorio, PriceTableItem } from '../types/finance';
import { FINANCE_CATEGORIA_LABELS } from '../types/finance';

const mesAtual = () => {
  const d = new Date();
  return {
    inicio: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
    fim: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
};

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Financeiro() {
  const [inicio, setInicio] = useState(mesAtual().inicio);
  const [fim, setFim] = useState(mesAtual().fim);
  const [relatorio, setRelatorio] = useState<FinanceRelatorio | null>(null);
  const [priceTable, setPriceTable] = useState<PriceTableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editPreco, setEditPreco] = useState<{ id: string; valor: string } | null>(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        getRelatorio(inicio, fim),
        getPriceTable(),
      ]);
      setRelatorio(r);
      setPriceTable(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const salvarPreco = async (id: string) => {
    if (!editPreco) return;
    await updatePriceItem(id, parseFloat(editPreco.valor));
    setEditPreco(null);
    carregar();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">💰 Relatório Financeiro</h1>

      {/* Filtro de período */}
      <div className="flex flex-wrap gap-4 items-end bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div>
          <label className="text-xs text-gray-500 font-medium">De</label>
          <input
            type="date"
            value={inicio}
            onChange={e => setInicio(e.target.value)}
            className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium">Até</label>
          <input
            type="date"
            value={fim}
            onChange={e => setFim(e.target.value)}
            className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Carregando…' : 'Filtrar'}
        </button>
      </div>

      {/* Cards de resumo */}
      {relatorio && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Previsto</p>
              <p className="text-xl font-bold text-gray-800">{fmt(relatorio.totalPrevisto)}</p>
            </div>
            <div className="bg-white rounded-xl border border-green-200 p-4 shadow-sm text-center">
              <p className="text-xs text-green-600 uppercase tracking-wide">Recebido</p>
              <p className="text-xl font-bold text-green-700">{fmt(relatorio.totalRecebido)}</p>
            </div>
            <div className="bg-white rounded-xl border border-red-200 p-4 shadow-sm text-center">
              <p className="text-xs text-red-500 uppercase tracking-wide">Pendente</p>
              <p className="text-xl font-bold text-red-600">
                {fmt(relatorio.totalPrevisto - relatorio.totalRecebido)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-yellow-200 p-4 shadow-sm text-center">
              <p className="text-xs text-yellow-600 uppercase tracking-wide">OS c/ Pendência</p>
              <p className="text-xl font-bold text-yellow-700">{relatorio.osComSaldoPendente}</p>
            </div>
          </div>

          {/* Por categoria */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Por Categoria</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left pb-2">Categoria</th>
                  <th className="text-right pb-2">Previsto</th>
                  <th className="text-right pb-2">Recebido</th>
                  <th className="text-right pb-2">Pendente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.entries(relatorio.porCategoria).map(([cat, vals]) => (
                  <tr key={cat}>
                    <td className="py-2 text-gray-700">
                      {FINANCE_CATEGORIA_LABELS[cat as keyof typeof FINANCE_CATEGORIA_LABELS] ?? cat}
                    </td>
                    <td className="py-2 text-right font-mono">{fmt(vals.previsto)}</td>
                    <td className="py-2 text-right font-mono text-green-700">{fmt(vals.recebido)}</td>
                    <td className="py-2 text-right font-mono text-red-600">{fmt(vals.previsto - vals.recebido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Tabela de Preços */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">⚙️ Tabela de Preços</h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left pb-2">Serviço</th>
              <th className="text-right pb-2">Valor</th>
              <th className="text-center pb-2">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {priceTable.map(item => (
              <tr key={item.id}>
                <td className="py-2 text-gray-700">{item.descricao}</td>
                <td className="py-2 text-right font-mono">
                  {editPreco?.id === item.id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editPreco.valor}
                      onChange={e => setEditPreco({ id: item.id, valor: e.target.value })}
                      className="w-28 border border-gray-300 rounded px-2 py-1 text-right text-sm"
                      autoFocus
                    />
                  ) : (
                    fmt(item.valor)
                  )}
                </td>
                <td className="py-2 text-center space-x-2">
                  {editPreco?.id === item.id ? (
                    <>
                      <button
                        onClick={() => salvarPreco(item.id)}
                        className="text-xs text-green-600 hover:underline"
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditPreco(null)}
                        className="text-xs text-gray-400 hover:underline"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditPreco({ id: item.id, valor: item.valor.toFixed(2) })}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **9.2 — Adicionar rota em `src/App.tsx`**

Localizar as rotas existentes e adicionar:
```tsx
import Financeiro from './pages/Financeiro';
// ...
<Route path="/financeiro" element={<Financeiro />} />
```

- [ ] **9.3 — Adicionar link no menu `src/components/Layout.tsx`**

Localizar os itens de navegação e adicionar:
```tsx
{ to: '/financeiro', label: '💰 Financeiro' }
// ou o padrão de link que o Layout usa (NavLink, Link etc.)
```

- [ ] **9.4 — Verificar build**
```bash
npx tsc -b --noEmit
```

- [ ] **9.5 — Commit**
```bash
git add src/pages/Financeiro.tsx src/App.tsx src/components/Layout.tsx
git commit -m "feat: página de relatório financeiro e tabela de preços"
```

---

## Task 10: Fix pdfParser CPF — Priorizar Seção DADOS DO PROPRIETÁRIO

**Files:**
- Modify: `src/lib/pdfParser.ts`

> **Contexto:** CPF extraído de PDFs do Detran vinha incorreto porque `parseCpfCnpj` usava fallback agressivo (qualquer 11 dígitos). Solução: adicionar padrão prioritário que detecta CPF/CNPJ diretamente após o label `CPF/CNPJ:` (com ou sem pontuação).

- [ ] **10.1 — Ler `src/lib/pdfParser.ts`** (leitura para edição)

- [ ] **10.2 — Adicionar padrão de alta prioridade no `parseCpfCnpj`**

Logo no início da função `parseCpfCnpj`, **antes** de qualquer outro padrão, adicionar:

```typescript
// Prioridade 1: label explícito "CPF/CNPJ:" seguido de dígitos (com ou sem formatação)
// Ex: "CPF/CNPJ: 01410391671"  ou  "CPF/CNPJ: 014.103.916-71"
const directLabelMatch = text.match(
  /cpf\s*\/\s*cnpj\s*:\s*([\d]{3}[\.\s]?[\d]{3}[\.\s]?[\d]{3}[\-\s]?[\d]{2}|[\d]{11}|[\d]{14})/i
);
if (directLabelMatch?.[1]) {
  return formatCpfCnpj(directLabelMatch[1].replace(/\D/g, ''));
}
```

- [ ] **10.3 — Remover (ou restringir) o fallback raw de 11 dígitos**

Localizar o trecho:
```typescript
const rawMatch = line.match(/\b(\d{11}|\d{14})\b/);
if (rawMatch && rawMatch[1]) return formatCpfCnpj(rawMatch[1]);
```

Remover ou substituir por um fallback que só aceita números com **prefixo contextualizador** (CPF geralmente começa com 0-9 nos primeiros 3 dígitos normais; RENAVAM tem 11 dígitos mas padrão diferente — não é suficiente para filtrar). A abordagem mais segura: **remover o fallback raw completamente**, para que apenas padrões explícitos (formatado ou com label) sejam aceitos.

- [ ] **10.4 — Testar com o PDF do ALTINO**

Verificar se agora retorna o CPF correto (que está no label `CPF/CNPJ:` da seção `DADOS DO PROPRIETÁRIO`).

- [ ] **10.5 — Commit**
```bash
git add src/lib/pdfParser.ts
git commit -m "fix: pdfParser prioriza label CPF/CNPJ: e remove fallback raw de 11 dígitos"
```

---

## Task 11: Merge e Deploy

- [ ] **11.1 — Build final**
```bash
npm run build
```
Esperado: sem erros.

- [ ] **11.2 — Push para GitHub**
```bash
git push origin claude/keen-curie
```

- [ ] **11.3 — Abrir PR para main**

Título: `feat: módulo financeiro completo + fix CPF extração PDF`

Body resumido:
- Tabelas `finance_charges`, `payments`, `price_table` no Supabase
- Cobranças automáticas ao criar OS
- FinancePainel integrado na tela de OS
- Página `/financeiro` com relatório e tabela de preços
- Fix: pdfParser não extrai mais CPFs falsos de PDFs do Detran

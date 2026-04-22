// src/pages/ControleDiario.tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  DollarSign,
  TrendingUp,
  CheckCircle,
  RefreshCw,
  Users,
  Wallet,
  FileText,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getAllChargesWithOS,
  getAllPayments,
} from '../lib/financeService';
import { getOrdens, getClientes, getVeiculos } from '../lib/database';
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
import type { ChargeWithOS, Payment } from '../types/finance';
import type { OrdemDeServico, Cliente, Veiculo } from '../types';
import { PAYMENT_METODO_LABELS, FINANCE_CATEGORIA_LABELS } from '../types/finance';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!;
}

function ymd(dateStr?: string | null): string {
  if (!dateStr) return '';
  return dateStr.split('T')[0] ?? '';
}

type RangePreset = 'hoje' | 'ontem' | 'semana' | 'mes' | 'custom';

function computeRange(preset: RangePreset, custom: { de: string; ate: string }): { de: string; ate: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().split('T')[0]!;
  if (preset === 'hoje') return { de: iso(today), ate: iso(today) };
  if (preset === 'ontem') {
    const y = new Date(today); y.setDate(today.getDate() - 1);
    return { de: iso(y), ate: iso(y) };
  }
  if (preset === 'semana') {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay());
    return { de: iso(start), ate: iso(today) };
  }
  if (preset === 'mes') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { de: iso(start), ate: iso(today) };
  }
  return custom;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ControleDiario() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const serviceLabels = useServiceLabels();

  const [preset, setPreset] = useState<RangePreset>('hoje');
  const [customRange, setCustomRange] = useState({ de: todayStr(), ate: todayStr() });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [ordens, setOrdens] = useState<OrdemDeServico[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [charges, setCharges] = useState<ChargeWithOS[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Route guard
  useEffect(() => {
    if (usuario && usuario.role !== 'admin' && usuario.role !== 'gerente') {
      navigate('/');
    }
  }, [usuario, navigate]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [o, c, v, ch, p] = await Promise.all([
        getOrdens(),
        getClientes(),
        getVeiculos(),
        getAllChargesWithOS(),
        getAllPayments(),
      ]);
      setOrdens(o);
      setClientes(c);
      setVeiculos(v);
      setCharges(ch);
      setPayments(p);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const range = useMemo(() => computeRange(preset, customRange), [preset, customRange]);
  const { de, ate } = range;

  // --- OS abertas no período ---
  const ordensDoPeriodo = useMemo(() => {
    return ordens.filter(o => {
      const d = ymd(o.dataAbertura);
      return d >= de && d <= ate;
    }).sort((a, b) => new Date(b.dataAbertura).getTime() - new Date(a.dataAbertura).getTime());
  }, [ordens, de, ate]);

  // --- Recebimentos do período ---
  const recebimentosDoPeriodo = useMemo(() => {
    return payments.filter(p => {
      const d = ymd(p.data_pagamento);
      return d >= de && d <= ate;
    });
  }, [payments, de, ate]);

  // --- Taxas pagas no período ---
  const taxasPagasDoPeriodo = useMemo(() => {
    return charges.filter(c => {
      if (c.status !== 'pago') return false;
      const d = ymd(c.confirmado_em);
      return d >= de && d <= ate;
    });
  }, [charges, de, ate]);

  // --- Stats ---
  const totalRecebido = recebimentosDoPeriodo.reduce((s, p) => s + (p.valor || 0), 0);
  const totalDinheiroPeriodo = recebimentosDoPeriodo
    .filter(p => p.metodo === 'dinheiro')
    .reduce((s, p) => s + (p.valor || 0), 0);
  const caixaDinheiroAcumulado = payments
    .filter(p => p.metodo === 'dinheiro')
    .reduce((s, p) => s + (p.valor || 0), 0);

  const totalTaxasPagas = taxasPagasDoPeriodo.reduce((s, c) => s + (c.valor_pago || 0), 0);
  const daeTransferenciaPagas = taxasPagasDoPeriodo.filter(
    c => c.categoria === 'dae_principal' && c.tipo_servico === 'transferencia'
  );
  const placaPagas = taxasPagasDoPeriodo.filter(c => c.categoria === 'placa');
  const totalDaeTransfPlaca = [...daeTransferenciaPagas, ...placaPagas].reduce((s, c) => s + (c.valor_pago || 0), 0);

  // --- Resumos por pessoa ---
  const resumoPorPagador = useMemo(() => {
    const map = new Map<string, { nome: string; qtd: number; total: number; dae: number; placa: number }>();
    for (const c of taxasPagasDoPeriodo) {
      const nome = c.pago_por || '— sem pagador —';
      const entry = map.get(nome) ?? { nome, qtd: 0, total: 0, dae: 0, placa: 0 };
      entry.qtd += 1;
      entry.total += c.valor_pago || 0;
      if (c.categoria === 'dae_principal') entry.dae += c.valor_pago || 0;
      if (c.categoria === 'placa') entry.placa += c.valor_pago || 0;
      map.set(nome, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [taxasPagasDoPeriodo]);

  const resumoPorRecebedor = useMemo(() => {
    const map = new Map<string, { nome: string; qtd: number; total: number; dinheiro: number }>();
    for (const p of recebimentosDoPeriodo) {
      const nome = p.recebido_por || '— não informado —';
      const entry = map.get(nome) ?? { nome, qtd: 0, total: 0, dinheiro: 0 };
      entry.qtd += 1;
      entry.total += p.valor || 0;
      if (p.metodo === 'dinheiro') entry.dinheiro += p.valor || 0;
      map.set(nome, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [recebimentosDoPeriodo]);

  const clienteMap = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);
  const veiculoMap = useMemo(() => new Map(veiculos.map(v => [v.id, v])), [veiculos]);
  const ordemMap = useMemo(() => new Map(ordens.map(o => [o.id, o])), [ordens]);

  if (!usuario || (usuario.role !== 'admin' && usuario.role !== 'gerente')) return null;

  const rangeLabel = de === ate
    ? new Date(de + 'T12:00:00').toLocaleDateString('pt-BR')
    : `${new Date(de + 'T12:00:00').toLocaleDateString('pt-BR')} → ${new Date(ate + 'T12:00:00').toLocaleDateString('pt-BR')}`;

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--notion-text)' }}>
            Controle Diário
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--notion-text-secondary)' }}>
            OS abertas, recebimentos e taxas pagas · {rangeLabel}
          </p>
        </div>
        <button onClick={carregar} disabled={loading} className="btn btn-secondary btn-sm">
          <RefreshCw size={13} style={{ animation: loading ? 'ctrlsp 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* Range selector */}
      <div
        style={{
          background: 'var(--notion-surface)',
          border: '1px solid var(--notion-border)',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 20,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Calendar size={14} style={{ color: 'var(--notion-text-secondary)' }} />
        {(['hoje', 'ontem', 'semana', 'mes'] as RangePreset[]).map(p => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`btn btn-sm ${preset === p ? 'btn-primary' : 'btn-secondary'}`}
          >
            {p === 'hoje' ? 'Hoje' : p === 'ontem' ? 'Ontem' : p === 'semana' ? 'Semana' : 'Mês'}
          </button>
        ))}
        <button
          onClick={() => setPreset('custom')}
          className={`btn btn-sm ${preset === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Personalizado
        </button>
        {preset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="date"
              value={customRange.de}
              onChange={e => setCustomRange(r => ({ ...r, de: e.target.value }))}
              className="form-input"
              style={{ height: 32 }}
            />
            <span style={{ color: 'var(--notion-text-secondary)' }}>até</span>
            <input
              type="date"
              value={customRange.ate}
              onChange={e => setCustomRange(r => ({ ...r, ate: e.target.value }))}
              className="form-input"
              style={{ height: 32 }}
            />
          </div>
        )}
      </div>

      {erro && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>{erro}</div>
      )}

      {/* Stats cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          icon={<FileText size={18} />}
          label="OS abertas no período"
          value={ordensDoPeriodo.length.toString()}
          hint={`de ${ordens.length} no total`}
        />
        <StatCard
          icon={<DollarSign size={18} />}
          label="Recebido dos clientes"
          value={fmt(totalRecebido)}
          hint={`${recebimentosDoPeriodo.length} recebimento(s)`}
          accent="success"
        />
        <StatCard
          icon={<Wallet size={18} />}
          label="Entrou em dinheiro"
          value={fmt(totalDinheiroPeriodo)}
          hint={`no período selecionado`}
          accent="warn"
        />
        <StatCard
          icon={<Wallet size={18} />}
          label="Caixa em dinheiro (acumulado)"
          value={fmt(caixaDinheiroAcumulado)}
          hint="total histórico"
          accent="warn"
        />
        <StatCard
          icon={<CheckCircle size={18} />}
          label="Taxas pagas"
          value={fmt(totalTaxasPagas)}
          hint={`${taxasPagasDoPeriodo.length} taxa(s)`}
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="DAE Transferência + Placa"
          value={fmt(totalDaeTransfPlaca)}
          hint={`${daeTransferenciaPagas.length} DAE · ${placaPagas.length} placa`}
          accent="info"
        />
      </div>

      {/* === Section 1: OS abertas no período === */}
      <Section title={`OS abertas no período (${ordensDoPeriodo.length})`} icon={<FileText size={16} />}>
        {ordensDoPeriodo.length === 0 ? (
          <EmptyRow>Nenhuma OS aberta nesse período.</EmptyRow>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>OS</th>
                  <th>Cliente</th>
                  <th>Placa</th>
                  <th>Serviço</th>
                  <th>Valor</th>
                  <th>Recebido</th>
                  <th>Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {ordensDoPeriodo.map(os => {
                  const cli = clienteMap.get(os.clienteId);
                  const v = veiculoMap.get(os.veiculoId);
                  const osPayments = payments.filter(p => p.os_id === os.id);
                  const recebido = osPayments.reduce((s, p) => s + (p.valor || 0), 0);
                  const total = Number(os.valorServico) || 0;
                  const desconto = Number(os.desconto) || 0;
                  const efetivo = Math.max(0, total - desconto);
                  const falta = Math.max(0, efetivo - recebido);
                  const statusPg = falta <= 0.009 && efetivo > 0 ? 'pago' : recebido > 0 ? 'parcial' : 'pendente';
                  const metodosDistintos = Array.from(new Set(osPayments.map(p => p.metodo)));
                  return (
                    <tr
                      key={os.id}
                      className="clickable"
                      onClick={() => navigate(`/ordens/${os.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td><span className="font-mono" style={{ fontWeight: 600 }}>#{os.numero}</span></td>
                      <td>{cli?.nome || '—'}</td>
                      <td><span className="font-mono">{v?.placa || '—'}</span></td>
                      <td>{getServicoLabel(serviceLabels, os.tipoServico)}</td>
                      <td>{fmt(efetivo)}</td>
                      <td style={{ color: recebido > 0 ? 'var(--status-success)' : 'var(--notion-text-muted)', fontWeight: 500 }}>
                        {fmt(recebido)}
                      </td>
                      <td>
                        <span className={`badge ${statusPg === 'pago' ? 'badge-success' : statusPg === 'parcial' ? 'badge-warning' : 'badge-neutral'}`}>
                          {statusPg === 'pago' ? 'Pago' : statusPg === 'parcial' ? 'Parcial' : 'Pendente'}
                        </span>
                        {metodosDistintos.length > 0 && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--notion-text-muted)' }}>
                            {metodosDistintos.map(m => PAYMENT_METODO_LABELS[m]).join(', ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* === Section 2: Recebimentos do período === */}
      <Section title={`Recebimentos no período (${recebimentosDoPeriodo.length})`} icon={<DollarSign size={16} />}>
        {recebimentosDoPeriodo.length === 0 ? (
          <EmptyRow>Nenhum recebimento nesse período.</EmptyRow>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>OS</th>
                  <th>Cliente</th>
                  <th>Método</th>
                  <th>Valor</th>
                  <th>Recebido por</th>
                </tr>
              </thead>
              <tbody>
                {recebimentosDoPeriodo
                  .slice()
                  .sort((a, b) => (b.data_pagamento || '').localeCompare(a.data_pagamento || ''))
                  .map(p => {
                    const os = ordemMap.get(p.os_id);
                    const cli = os ? clienteMap.get(os.clienteId) : null;
                    const isDinheiro = p.metodo === 'dinheiro';
                    return (
                      <tr
                        key={p.id}
                        className="clickable"
                        onClick={() => os && navigate(`/ordens/${os.id}`)}
                        style={{ cursor: os ? 'pointer' : 'default' }}
                      >
                        <td>{new Date((p.data_pagamento || '') + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td>{os ? <span className="font-mono">#{os.numero}</span> : '—'}</td>
                        <td>{cli?.nome || '—'}</td>
                        <td>
                          <span className="badge" style={isDinheiro ? { background: 'var(--status-warn-soft)', color: 'var(--status-warn)', border: '1px solid var(--status-warn)' } : undefined}>
                            {PAYMENT_METODO_LABELS[p.metodo]}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{fmt(p.valor || 0)}</td>
                        <td>{p.recebido_por || <span style={{ color: 'var(--notion-text-muted)', fontStyle: 'italic' }}>— não informado —</span>}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* === Section 3: Taxas pagas no período (DAE + Placa em destaque) === */}
      <Section
        title={`Taxas pagas no período (${taxasPagasDoPeriodo.length})`}
        icon={<CheckCircle size={16} />}
        subtitle="DAE Transferência e Placa em destaque"
      >
        {taxasPagasDoPeriodo.length === 0 ? (
          <EmptyRow>Nenhuma taxa paga nesse período.</EmptyRow>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>OS</th>
                  <th>Cliente</th>
                  <th>Categoria</th>
                  <th>Valor</th>
                  <th>Pago por</th>
                  <th>Conf. por</th>
                </tr>
              </thead>
              <tbody>
                {taxasPagasDoPeriodo
                  .slice()
                  .sort((a, b) => (b.confirmado_em || '').localeCompare(a.confirmado_em || ''))
                  .map(c => {
                    const destaque = c.categoria === 'placa' || (c.categoria === 'dae_principal' && c.tipo_servico === 'transferencia');
                    const isTransf = c.categoria === 'dae_principal' && c.tipo_servico === 'transferencia';
                    const os = ordemMap.get(c.os_id);
                    return (
                      <tr
                        key={c.id}
                        className="clickable"
                        onClick={() => os && navigate(`/ordens/${os.id}`)}
                        style={{
                          cursor: os ? 'pointer' : 'default',
                          background: destaque ? 'var(--status-info-soft)' : undefined,
                        }}
                      >
                        <td>{c.confirmado_em ? new Date(c.confirmado_em).toLocaleDateString('pt-BR') : '—'}</td>
                        <td><span className="font-mono">#{c.os_numero}</span></td>
                        <td>{c.cliente_nome}</td>
                        <td>
                          <span className="badge">
                            {isTransf ? 'DAE Transferência' : (FINANCE_CATEGORIA_LABELS[c.categoria] ?? c.categoria)}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{fmt(c.valor_pago || 0)}</td>
                        <td>
                          {c.pago_por
                            ? <strong>{c.pago_por}</strong>
                            : <span style={{ color: 'var(--notion-text-muted)', fontStyle: 'italic' }}>— sem pagador —</span>}
                        </td>
                        <td style={{ color: 'var(--notion-text-muted)' }}>{c.confirmado_por || '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* === Section 4: Resumo por pagador === */}
      <Section title="Resumo por pagador" icon={<Users size={16} />}>
        {resumoPorPagador.length === 0 ? (
          <EmptyRow>Nenhuma taxa paga com pagador identificado no período.</EmptyRow>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Pagador</th>
                  <th>Taxas</th>
                  <th>Total</th>
                  <th>DAE</th>
                  <th>Placa</th>
                </tr>
              </thead>
              <tbody>
                {resumoPorPagador.map(r => (
                  <tr key={r.nome}>
                    <td style={{ fontWeight: 600 }}>{r.nome}</td>
                    <td>{r.qtd}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(r.total)}</td>
                    <td style={{ color: 'var(--notion-text-muted)' }}>{fmt(r.dae)}</td>
                    <td style={{ color: 'var(--notion-text-muted)' }}>{fmt(r.placa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* === Section 5: Resumo por recebedor === */}
      <Section title="Resumo por recebedor" icon={<Users size={16} />}>
        {resumoPorRecebedor.length === 0 ? (
          <EmptyRow>Nenhum recebimento com recebedor identificado no período.</EmptyRow>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Recebedor</th>
                  <th>Recebimentos</th>
                  <th>Total</th>
                  <th>Em dinheiro</th>
                </tr>
              </thead>
              <tbody>
                {resumoPorRecebedor.map(r => (
                  <tr key={r.nome}>
                    <td style={{ fontWeight: 600 }}>{r.nome}</td>
                    <td>{r.qtd}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(r.total)}</td>
                    <td style={{ color: 'var(--status-warn)', fontWeight: 500 }}>{fmt(r.dinheiro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <style>{`@keyframes ctrlsp { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Small components ─────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, hint, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: 'success' | 'warn' | 'info';
}) {
  const color =
    accent === 'success' ? 'var(--status-success)'
    : accent === 'warn' ? 'var(--status-warn)'
    : accent === 'info' ? 'var(--status-info)'
    : 'var(--notion-blue)';
  return (
    <div
      style={{
        background: 'var(--notion-surface)',
        border: '1px solid var(--notion-border)',
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color }}>
        {icon}
        <span className="info-item-label" style={{ color: 'var(--notion-text-secondary)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--notion-text)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
      {hint && <div className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{hint}</div>}
    </div>
  );
}

function Section({
  title, icon, subtitle, children,
}: {
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}
          <span>{title}</span>
        </h3>
        {subtitle && <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-body">
      <p className="text-sm" style={{ color: 'var(--notion-text-muted)', margin: 0, textAlign: 'center', padding: 'var(--space-4) 0' }}>
        {children}
      </p>
    </div>
  );
}


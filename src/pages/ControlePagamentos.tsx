// src/pages/ControlePagamentos.tsx
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  DollarSign,
  Calendar,
  TrendingUp,
  Search,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../components/ConfirmProvider';
import {
  getAllChargesWithOS,
  groupChargesByOS,
  confirmarPagamento,
  reverterPagamento,
  confirmarTodosDaOS,
} from '../lib/financeService';
import type { OSChargeGroup, ChargeWithOS, ControleResumo } from '../types/finance';
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
import { getEmpresas } from '../lib/empresaService';
import type { EmpresaParceira } from '../types/empresa';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function maskMoney(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '') || '0';
  const padded = digits.padStart(3, '0');
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted},${decPart}`;
}

function parseBRL(value: string | number | undefined | null): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const s = String(value).trim();
  if (s.includes(',')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(s) || 0;
}

function unmaskMoney(masked: string | number | undefined | null): number {
  return parseBRL(masked);
}

const CATEGORIA_LABELS: Record<string, string> = {
  dae_principal: 'DAE Principal',
  dae_adicional: 'DAE Adicional',
  vistoria: 'Vistoria',
  placa: 'Placa',
  outro: 'Outro',
};

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!;
}

function oneWeekAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0]!;
}

function isOverdue(charge: ChargeWithOS): boolean {
  if (charge.status !== 'a_pagar') return false;
  if (!charge.due_date) return false;
  return charge.due_date < todayStr();
}

// ── Confirm Popover ───────────────────────────────────────────────────────────

interface ConfirmPopoverProps {
  charge: ChargeWithOS;
  onClose: () => void;
  onConfirm: (chargeId: string, valor: number, data: string) => Promise<void>;
}

function ConfirmPopover({ charge, onClose, onConfirm }: ConfirmPopoverProps) {
  const [valor, setValor] = useState<string>(
    maskMoney(String(Math.round((isNaN(charge.valor_previsto) ? 0 : charge.valor_previsto) * 100))),
  );
  const [data, setData] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await onConfirm(charge.id, unmaskMoney(valor), data);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={ref} className="finance-popover">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--notion-text)', marginBottom: 2 }}>
          Confirmar Pagamento
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="label">Valor (R$)</label>
          <input
            type="text"
            value={valor}
            onChange={e => setValor(maskMoney(e.target.value))}
            className="input"
            style={{ textAlign: 'right' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="label">Data</label>
          <input
            type="date"
            value={data}
            onChange={e => setData(e.target.value)}
            className="input"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn btn-success btn-sm"
          style={{ marginTop: 4 }}
        >
          {loading ? 'Salvando...' : 'Confirmar Pagamento'}
        </button>
      </form>
    </div>
  );
}

// ── Charge Row ────────────────────────────────────────────────────────────────

interface ChargeRowProps {
  charge: ChargeWithOS;
  isAdmin: boolean;
  onConfirm: (chargeId: string, valor: number, data: string) => Promise<void>;
  onRevert: (chargeId: string) => Promise<void>;
  loadingConfirm: string | null;
}

function ChargeRow({ charge, isAdmin, onConfirm, onRevert, loadingConfirm }: ChargeRowProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const overdue = isOverdue(charge);
  const paid = charge.status === 'pago';

  let dotColor = 'var(--notion-orange)';
  if (paid) dotColor = 'var(--notion-green)';
  else if (overdue) dotColor = 'var(--notion-orange)';

  const formattedDate = charge.confirmado_em
    ? new Date(charge.confirmado_em).toLocaleDateString('pt-BR')
    : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderTop: '1px solid var(--notion-border)',
        flexWrap: 'wrap',
      }}
    >
      {/* Status dot */}
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
          border: paid ? 'none' : `2px solid ${dotColor}`,
          boxSizing: 'border-box',
          display: 'inline-block',
        }}
      />

      {/* Description + category + vistoria local */}
      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: 'var(--notion-text)', fontWeight: 500 }}>
            {charge.descricao}
          </span>
          <span className="finance-metodo-badge">
            {CATEGORIA_LABELS[charge.categoria] ?? charge.categoria}
          </span>
        </div>
        {charge.categoria === 'vistoria' && charge.vistoria_local && (
          <div style={{ fontSize: 11, color: 'var(--notion-text-muted)', marginTop: 2 }}>
            📍 {charge.vistoria_local}
          </div>
        )}
      </div>

      {/* Value */}
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--notion-text)', minWidth: 90, textAlign: 'right' }}>
        {fmt(charge.valor_previsto)}
      </span>

      {/* Action area */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
        {paid ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--notion-green)', fontWeight: 500 }}>
              Pago &middot; {charge.confirmado_por} &middot; {formattedDate}
            </span>
            {isAdmin && (
              <button
                onClick={() => onRevert(charge.id)}
                disabled={!!loadingConfirm}
                title="Reverter pagamento"
                className="btn btn-secondary btn-sm"
              >
                <RotateCcw size={11} />
                Reverter
              </button>
            )}
          </>
        ) : overdue ? (
          <>
            <span className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={12} />
              Atrasado
            </span>
            <button
              onClick={() => setPopoverOpen(o => !o)}
              disabled={loadingConfirm === charge.id}
              className="btn btn-sm"
              style={{ background: 'var(--notion-orange)', color: 'var(--notion-text)', border: 'none' }}
            >
              <CheckCircle size={13} />
              {loadingConfirm === charge.id ? 'Salvando...' : 'Confirmar'}
            </button>
          </>
        ) : (
          <button
            onClick={() => setPopoverOpen(o => !o)}
            disabled={loadingConfirm === charge.id}
            className="btn btn-success btn-sm"
          >
            <CheckCircle size={13} />
            {loadingConfirm === charge.id ? 'Salvando...' : 'Confirmar'}
          </button>
        )}
        {popoverOpen && (
          <ConfirmPopover
            charge={charge}
            onClose={() => setPopoverOpen(false)}
            onConfirm={onConfirm}
          />
        )}
      </div>
    </div>
  );
}

// ── OS Card ───────────────────────────────────────────────────────────────────

interface OSCardProps {
  group: OSChargeGroup;
  isAdmin: boolean;
  usuario: string;
  onConfirm: (chargeId: string, valor: number, data: string) => Promise<void>;
  onRevert: (chargeId: string) => Promise<void>;
  onConfirmAll: (osId: string) => Promise<void>;
  loadingConfirm: string | null;
}

function OSCard({ group, isAdmin, onConfirm, onRevert, onConfirmAll, loadingConfirm }: OSCardProps) {
  const navigate = useNavigate();
  const serviceLabels = useServiceLabels();
  const hasPending = group.charges.some(c => c.status === 'a_pagar');
  const allPaid = group.charges.every(c => c.status === 'pago');
  const tipoLabel = getServicoLabel(serviceLabels, group.tipoServico);

  return (
    <div
      style={{
        background: 'var(--notion-surface)',
        border: '1px solid var(--notion-border)',
        borderLeft: `4px solid ${allPaid ? 'var(--notion-green)' : 'var(--notion-orange)'}`,
        borderRadius: 10,
        overflow: 'visible',
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--notion-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{ cursor: 'pointer', textDecoration: 'none', borderBottom: '1px dashed var(--notion-blue)', color: 'var(--notion-blue)' }}
              onClick={(e) => { e.stopPropagation(); navigate(`/ordens/${group.osId}`); }}
              title="Abrir Ordem de Serviço"
            >
              OS #{group.osNumero}
            </span>
            <span style={{ color: 'var(--notion-text)' }}>&middot; {group.clienteNome}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--notion-text-secondary)', marginTop: 2 }}>
            {group.placa} &middot; {group.modelo} &middot; {tipoLabel}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {group.totalPago > 0 && (
            <span style={{ fontSize: 13, color: 'var(--notion-green)', fontWeight: 500 }}>
              Pago: {fmt(group.totalPago)}
            </span>
          )}
          {group.totalPendente > 0 && (
            <span style={{ fontSize: 13, color: 'var(--notion-orange)', fontWeight: 500 }}>
              Pendente: {fmt(group.totalPendente)}
            </span>
          )}
          {hasPending && (
            <button
              onClick={() => onConfirmAll(group.osId)}
              className="btn btn-success btn-sm"
            >
              <CheckCircle size={14} />
              Confirmar Todos
            </button>
          )}
        </div>
      </div>

      {/* Charges */}
      {group.charges.map(charge => (
        <ChargeRow
          key={charge.id}
          charge={charge}
          isAdmin={isAdmin}
          onConfirm={onConfirm}
          onRevert={onRevert}
          loadingConfirm={loadingConfirm}
        />
      ))}
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

function SummaryCard({ label, value, icon, color }: SummaryCardProps) {
  return (
    <div
      style={{
        flex: '1 1 180px',
        background: 'var(--notion-surface)',
        border: '1px solid var(--notion-border)',
        borderRadius: 10,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          opacity: 0.9,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--notion-text-secondary)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--notion-text)' }}>
          {fmt(value)}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type StatusFilter = 'pendente' | 'pago' | 'todos';

export default function ControlePagamentos() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [groups, setGroups] = useState<OSChargeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const loadingConfirmRef = useRef<string | null>(null);
  const [loadingConfirm, setLoadingConfirm] = useState<string | null>(null);

  // Filters
  const [busca, setBusca] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pendente');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('todos');
  const [dataInicio, setDataInicio] = useState(oneWeekAgo());
  const [dataFim, setDataFim] = useState(todayStr());
  const [empresas, setEmpresas] = useState<EmpresaParceira[]>([]);
  const [empresaFilter, setEmpresaFilter] = useState<string>('');

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
      const charges = await getAllChargesWithOS();
      setGroups(groupChargesByOS(charges));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => { getEmpresas().then(setEmpresas); }, []);

  const handleConfirmar = useCallback(
    async (chargeId: string, valor: number, data: string) => {
      if (!usuario) return;
      if (loadingConfirmRef.current) return;
      loadingConfirmRef.current = chargeId;
      setLoadingConfirm(chargeId);
      try {
        await confirmarPagamento(chargeId, valor, data, usuario.nome);
        await carregar();
      } finally {
        loadingConfirmRef.current = null;
        setLoadingConfirm(null);
      }
    },
    [usuario, carregar],
  );

  const handleReverter = useCallback(
    async (chargeId: string) => {
      if (loadingConfirmRef.current) return;
      const ok = await confirm({
        title: 'Reverter pagamento',
        message: 'Tem certeza que deseja reverter este pagamento?',
        confirmText: 'Reverter',
        danger: true,
      });
      if (!ok) return;
      loadingConfirmRef.current = chargeId;
      setLoadingConfirm(chargeId);
      try {
        await reverterPagamento(chargeId);
        await carregar();
      } finally {
        loadingConfirmRef.current = null;
        setLoadingConfirm(null);
      }
    },
    [confirm, carregar],
  );

  const handleConfirmarTodos = useCallback(
    async (osId: string) => {
      if (!usuario) return;
      const ok = await confirm({
        title: 'Confirmar todos',
        message: 'Confirmar todas as taxas pendentes desta OS?',
        confirmText: 'Confirmar Todos',
      });
      if (!ok) return;
      await confirmarTodosDaOS(osId, usuario.nome);
      await carregar();
    },
    [usuario, confirm, carregar],
  );

  const handleConfirmarTodosGlobal = useCallback(
    async () => {
      if (!usuario) return;
      const pendentes = groups.filter(g => g.charges.some(c => c.status === 'a_pagar'));
      if (pendentes.length === 0) return;
      const ok = await confirm({
        title: 'Confirmar TODOS os pagamentos',
        message: `Confirmar todas as taxas pendentes de ${pendentes.length} OS?`,
        confirmText: 'Confirmar Todos',
      });
      if (!ok) return;
      for (const g of pendentes) {
        await confirmarTodosDaOS(g.osId, usuario.nome);
      }
      await carregar();
    },
    [usuario, confirm, groups, carregar],
  );

  // Filtering logic
  const filteredGroups = groups
    .filter(group => {
      if (empresaFilter === 'particular') return !group.empresaParceiraId;
      if (empresaFilter) return group.empresaParceiraId === empresaFilter;
      return true;
    })
    .map(group => {
      let charges = group.charges;

      // Status filter
      if (statusFilter === 'pendente') {
        charges = charges.filter(c => c.status === 'a_pagar');
      } else if (statusFilter === 'pago') {
        charges = charges.filter(c => c.status === 'pago');
      }

      // Category filter
      if (categoriaFilter !== 'todos') {
        charges = charges.filter(c => c.categoria === categoriaFilter);
      }

      // Date filter (on confirmado_em for paid, criado_em for pending)
      charges = charges.filter(c => {
        if (c.status === 'pago' && c.confirmado_em) {
          const d = c.confirmado_em.split('T')[0] ?? '';
          return d >= dataInicio && d <= dataFim;
        }
        if (c.status === 'a_pagar') {
          const d = c.criado_em.split('T')[0] ?? '';
          return d >= dataInicio && d <= dataFim;
        }
        return true;
      });

      return { ...group, charges };
    })
    .filter(group => {
      if (group.charges.length === 0) return false;

      // Text search
      if (busca.trim()) {
        const q = busca.toLowerCase();
        return (
          group.clienteNome.toLowerCase().includes(q) ||
          group.placa.toLowerCase().includes(q) ||
          String(group.osNumero).includes(q)
        );
      }
      return true;
    });

  // Resumo calculado a partir dos dados FILTRADOS (não global)
  const resumo = useMemo(() => {
    // Pegar TODAS as charges de TODOS os groups (sem filtro de data/status/categoria)
    // para calcular os totais corretamente baseados nas OS visíveis
    const allFilteredCharges = filteredGroups.flatMap(g => g.charges);

    let totalPendente = 0;
    let pagoHoje = 0;
    let pagoSemana = 0;
    let pagoMes = 0;

    const now = new Date();
    const hoje = now.toISOString().split('T')[0];
    const inicioSemana = new Date(now);
    inicioSemana.setDate(now.getDate() - now.getDay());
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);

    // Buscar TODAS as charges das OS que aparecem nos filteredGroups
    // (incluindo as pagas e pendentes, independente do filtro de status)
    const osIds = new Set(filteredGroups.map(g => g.osId));
    const allChargesFromVisibleOS = groups
      .filter(g => osIds.has(g.osId))
      .flatMap(g => g.charges);

    for (const c of allChargesFromVisibleOS) {
      if (c.status === 'a_pagar') {
        totalPendente += c.valor_previsto;
      }
      if (c.status === 'pago' && c.confirmado_em) {
        const dt = c.confirmado_em.split('T')[0];
        const dtDate = new Date(c.confirmado_em);
        const valor = c.valor_pago;
        if (dt === hoje) pagoHoje += valor;
        if (dtDate >= inicioSemana) pagoSemana += valor;
        if (dtDate >= inicioMes) pagoMes += valor;
      }
    }

    return { totalPendente, pagoHoje, pagoSemana, pagoMes } as ControleResumo;
  }, [filteredGroups, groups]);

  const isAdmin = usuario?.role === 'admin';

  // ── Render ──

  if (!usuario || (usuario.role !== 'admin' && usuario.role !== 'gerente')) {
    return null;
  }

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--notion-border)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 14,
    background: 'var(--bg-surface)',
    color: 'var(--notion-text)',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: active ? 700 : 400,
    borderRadius: 7,
    border: active ? 'none' : '1px solid var(--notion-border)',
    background: active ? 'var(--notion-blue)' : 'var(--bg-surface)',
    color: active ? 'var(--notion-bg)' : 'var(--notion-text-secondary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  });

  return (
    <div style={{ padding: '24px 20px', maxWidth: 960, margin: '0 auto' }}>
      {/* Page title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--notion-text)' }}>
            Controle de Pagamentos
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--notion-text-secondary)' }}>
            Confirme o pagamento de taxas das ordens de serviço
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {groups.some(g => g.charges.some(c => c.status === 'a_pagar')) && (
            <button
              onClick={handleConfirmarTodosGlobal}
              disabled={loading}
              style={{
                background: 'var(--notion-green)',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--notion-text)',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'inherit',
              }}
            >
              <CheckCircle size={14} />
              Confirmar Todos
            </button>
          )}
          <button
            onClick={carregar}
            disabled={loading}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--notion-border)',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 13,
              color: 'var(--notion-text-secondary)',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {resumo && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <SummaryCard
            label="Total Pendente"
            value={resumo.totalPendente}
            icon={<Clock size={20} color="var(--notion-text)" />}
            color="var(--notion-orange)"
          />
          <SummaryCard
            label="Pago Hoje"
            value={resumo.pagoHoje}
            icon={<CheckCircle size={20} color="var(--notion-text)" />}
            color="var(--notion-green)"
          />
          <SummaryCard
            label="Pago na Semana"
            value={resumo.pagoSemana}
            icon={<TrendingUp size={20} color="var(--notion-text)" />}
            color="var(--notion-blue)"
          />
          <SummaryCard
            label="Pago no Mes"
            value={resumo.pagoMes}
            icon={<DollarSign size={20} color="var(--notion-text)" />}
            color="var(--notion-green)"
          />
        </div>
      )}

      {/* Filter bar */}
      <div
        style={{
          background: 'var(--notion-surface)',
          border: '1px solid var(--notion-border)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--notion-text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Cliente, placa ou OS..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 32, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* Status toggles */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['pendente', 'pago', 'todos'] as StatusFilter[]).map(s => (
            <button key={s} style={toggleBtnStyle(statusFilter === s)} onClick={() => setStatusFilter(s)}>
              {s === 'pendente' ? 'Pendente' : s === 'pago' ? 'Pago' : 'Todos'}
            </button>
          ))}
        </div>

        {/* Category dropdown */}
        <select
          value={categoriaFilter}
          onChange={e => setCategoriaFilter(e.target.value)}
          style={{ ...inputStyle, minWidth: 150 }}
        >
          <option value="todos">Todas as categorias</option>
          <option value="dae_principal">DAE Principal</option>
          <option value="dae_adicional">DAE Adicional</option>
          <option value="vistoria">Vistoria</option>
          <option value="placa">Placa</option>
          <option value="outro">Outro</option>
        </select>

        {/* Date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={14} style={{ color: 'var(--notion-text-muted)', flexShrink: 0 }} />
          <input
            type="date"
            value={dataInicio}
            onChange={e => setDataInicio(e.target.value)}
            style={{ ...inputStyle, width: 140 }}
          />
          <span style={{ color: 'var(--notion-text-muted)', fontSize: 13 }}>ate</span>
          <input
            type="date"
            value={dataFim}
            onChange={e => setDataFim(e.target.value)}
            style={{ ...inputStyle, width: 140 }}
          />
        </div>

        {/* Empresa filter */}
        {empresas.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
            <button
              onClick={() => setEmpresaFilter('')}
              style={toggleBtnStyle(empresaFilter === '')}
            >
              Todas
            </button>
            {empresas.map(emp => (
              <button
                key={emp.id}
                onClick={() => setEmpresaFilter(emp.id)}
                style={{
                  ...toggleBtnStyle(empresaFilter === emp.id),
                  ...(empresaFilter === emp.id ? { background: emp.cor, border: 'none' } : {}),
                }}
              >
                {emp.nome}
              </button>
            ))}
            <button
              onClick={() => setEmpresaFilter('particular')}
              style={{
                ...toggleBtnStyle(empresaFilter === 'particular'),
                ...(empresaFilter === 'particular' ? { background: '#374151', border: 'none' } : {}),
              }}
            >
              Particulares
            </button>
          </div>
        )}
      </div>

      {/* States */}
      {loading && groups.length === 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '48px 0',
            color: 'var(--notion-text-secondary)',
            fontSize: 15,
          }}
        >
          <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
          Carregando...
        </div>
      )}

      {!loading && erro && (
        <div
          style={{
            background: 'var(--notion-surface)',
            border: '1px solid var(--notion-orange)',
            borderRadius: 10,
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <AlertTriangle size={20} color="var(--notion-orange)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--notion-orange)', marginBottom: 4 }}>
              Erro ao carregar
            </div>
            <div style={{ fontSize: 14, color: 'var(--notion-text-secondary)' }}>{erro}</div>
          </div>
          <button
            onClick={carregar}
            style={{
              background: 'var(--notion-orange)',
              color: 'var(--notion-text)',
              border: 'none',
              borderRadius: 7,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !erro && filteredGroups.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '56px 24px',
            color: 'var(--notion-text-secondary)',
          }}
        >
          <CheckCircle size={40} style={{ opacity: 0.3, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
            Nenhuma taxa encontrada com esses filtros
          </div>
          <div style={{ fontSize: 14 }}>
            Tente ajustar os filtros ou o intervalo de datas.
          </div>
        </div>
      )}

      {!erro && filteredGroups.length > 0 && (
        <div style={{ opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
          {filteredGroups.map(group => (
            <OSCard
              key={group.osId}
              group={group}
              isAdmin={isAdmin}
              usuario={usuario?.nome ?? ''}
              onConfirm={handleConfirmar}
              onRevert={handleReverter}
              onConfirmAll={handleConfirmarTodos}
              loadingConfirm={loadingConfirm}
            />
          ))}
        </div>
      )}

      {/* Spin keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

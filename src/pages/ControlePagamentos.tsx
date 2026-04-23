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
  Users,
  Plus,
  X,
  Trash2,
  Filter,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../components/ConfirmProvider';
import { usePagadorPrompt } from '../components/PagadorPromptProvider';
import {
  getAllChargesWithOS,
  groupChargesByOS,
  confirmarPagamento,
  reverterPagamento,
  confirmarTodosDaOS,
  getPagadores,
  createPagador,
  updatePagador,
  deletePagador,
} from '../lib/financeService';
import type { OSChargeGroup, ChargeWithOS, ControleResumo, Pagador } from '../types/finance';
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
  onConfirm: (chargeId: string, valor: number, data: string, pagoPor: string | null) => Promise<void>;
  pagadores: Pagador[];
  onCreatePagador: (nome: string) => Promise<Pagador>;
}

function ConfirmPopover({ charge, onClose, onConfirm, pagadores, onCreatePagador }: ConfirmPopoverProps) {
  const [valor, setValor] = useState<string>(
    maskMoney(String(Math.round((isNaN(charge.valor_previsto) ? 0 : charge.valor_previsto) * 100))),
  );
  const [data, setData] = useState(todayStr());
  const [pagoPor, setPagoPor] = useState<string>(charge.pago_por || '');
  const [novoNome, setNovoNome] = useState('');
  const [adicionando, setAdicionando] = useState(false);
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
      await onConfirm(charge.id, unmaskMoney(valor), data, pagoPor || null);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPagador() {
    const nome = novoNome.trim();
    if (!nome) return;
    try {
      await onCreatePagador(nome);
    } catch (err) {
      // Se o cadastro falhar, ainda selecionamos o nome digitado
      console.error('Erro ao criar pagador (prossegue com o nome mesmo assim):', err);
    }
    setPagoPor(nome);
    setNovoNome('');
    setAdicionando(false);
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="label">Pago por</label>
          {adicionando ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="text"
                autoFocus
                placeholder="Nome do pagador"
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddPagador(); } }}
                className="input"
                style={{ flex: 1 }}
              />
              <button type="button" onClick={handleAddPagador} className="btn btn-primary btn-sm">
                <Plus size={12} />
              </button>
              <button type="button" onClick={() => { setAdicionando(false); setNovoNome(''); }} className="btn btn-ghost btn-sm" aria-label="Cancelar">
                <X size={12} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 4 }}>
              <select
                value={pagoPor}
                onChange={e => setPagoPor(e.target.value)}
                className="input"
                style={{ flex: 1 }}
              >
                <option value="">— selecionar —</option>
                {pagadores.filter(p => p.ativo).map(p => (
                  <option key={p.id} value={p.nome}>{p.nome}</option>
                ))}
                {pagoPor && !pagadores.some(p => p.nome === pagoPor) && (
                  <option value={pagoPor}>{pagoPor} (antigo)</option>
                )}
              </select>
              <button
                type="button"
                onClick={() => setAdicionando(true)}
                className="btn btn-ghost btn-sm"
                title="Adicionar novo pagador"
                aria-label="Adicionar novo pagador"
              >
                <Plus size={12} />
              </button>
            </div>
          )}
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

// ── Gerenciador de Pagadores ─────────────────────────────────────────────────

interface GerenciarPagadoresModalProps {
  pagadores: Pagador[];
  onClose: () => void;
  onCreate: (nome: string) => Promise<void>;
  onUpdate: (id: string, patch: { nome?: string; ativo?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function GerenciarPagadoresModal({ pagadores, onClose, onCreate, onUpdate, onDelete }: GerenciarPagadoresModalProps) {
  const [novoNome, setNovoNome] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');

  async function handleAdd() {
    const nome = novoNome.trim();
    if (!nome) return;
    try {
      await onCreate(nome);
      setNovoNome('');
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSaveEdit(id: string) {
    const nome = editNome.trim();
    if (!nome) return;
    await onUpdate(id, { nome });
    setEditingId(null);
    setEditNome('');
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Gerenciar Pagadores</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="Novo pagador..."
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
              className="form-input"
              style={{ flex: 1 }}
            />
            <button onClick={handleAdd} className="btn btn-primary btn-sm" disabled={!novoNome.trim()}>
              <Plus size={14} /> Adicionar
            </button>
          </div>
          {pagadores.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--notion-text-muted)', margin: 0, textAlign: 'center', padding: 'var(--space-4) 0' }}>
              Nenhum pagador cadastrado.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pagadores.map(p => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px',
                    background: 'var(--notion-bg-alt)',
                    border: '1px solid var(--notion-border)',
                    borderRadius: 8,
                    opacity: p.ativo ? 1 : 0.5,
                  }}
                >
                  {editingId === p.id ? (
                    <>
                      <input
                        autoFocus
                        type="text"
                        value={editNome}
                        onChange={e => setEditNome(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(p.id); } if (e.key === 'Escape') { setEditingId(null); } }}
                        className="form-input"
                        style={{ flex: 1 }}
                      />
                      <button onClick={() => handleSaveEdit(p.id)} className="btn btn-primary btn-sm">Salvar</button>
                      <button onClick={() => setEditingId(null)} className="btn btn-ghost btn-sm"><X size={12} /></button>
                    </>
                  ) : (
                    <>
                      <span
                        className="text-sm"
                        style={{ flex: 1, fontWeight: 500, color: 'var(--notion-text)', textDecoration: p.ativo ? 'none' : 'line-through' }}
                        onDoubleClick={() => { setEditingId(p.id); setEditNome(p.nome); }}
                        title="Clique duplo para renomear"
                      >
                        {p.nome}
                      </span>
                      <button
                        onClick={() => onUpdate(p.id, { ativo: !p.ativo })}
                        className="btn btn-ghost btn-sm"
                        title={p.ativo ? 'Desativar' : 'Ativar'}
                      >
                        {p.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => { setEditingId(p.id); setEditNome(p.nome); }}
                        className="btn btn-ghost btn-sm"
                        title="Renomear"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => onDelete(p.id)}
                        className="btn btn-ghost btn-sm"
                        title="Remover"
                        aria-label={`Remover ${p.nome}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Charge Row ────────────────────────────────────────────────────────────────

interface ChargeRowProps {
  charge: ChargeWithOS;
  isAdmin: boolean;
  onConfirm: (chargeId: string, valor: number, data: string, pagoPor: string | null) => Promise<void>;
  onRevert: (chargeId: string) => Promise<void>;
  loadingConfirm: string | null;
  pagadores: Pagador[];
  onCreatePagador: (nome: string) => Promise<Pagador>;
}

function ChargeRow({ charge, isAdmin, onConfirm, onRevert, loadingConfirm, pagadores, onCreatePagador }: ChargeRowProps) {
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
          <div style={{ fontSize: 11, color: 'var(--notion-text-secondary)', marginTop: 2 }}>
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
              {charge.pago_por ? <>Pago por <strong>{charge.pago_por}</strong></> : 'Pago'}
              {' · '}{formattedDate}
              {charge.confirmado_por && (
                <span style={{ color: 'var(--notion-text-muted)', fontWeight: 400 }}>
                  {' · conf. '}{charge.confirmado_por}
                </span>
              )}
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
            pagadores={pagadores}
            onCreatePagador={onCreatePagador}
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
  onConfirm: (chargeId: string, valor: number, data: string, pagoPor: string | null) => Promise<void>;
  onRevert: (chargeId: string) => Promise<void>;
  onConfirmAll: (osId: string) => Promise<void>;
  loadingConfirm: string | null;
  pagadores: Pagador[];
  onCreatePagador: (nome: string) => Promise<Pagador>;
}

function OSCard({ group, isAdmin, onConfirm, onRevert, onConfirmAll, loadingConfirm, pagadores, onCreatePagador }: OSCardProps) {
  const navigate = useNavigate();
  const serviceLabels = useServiceLabels();
  const pendingCount = group.charges.filter(c => c.status === 'a_pagar').length;
  const hasPending = pendingCount > 0;
  const allPaid = !hasPending && group.charges.length > 0;
  const tipoLabel = getServicoLabel(serviceLabels, group.tipoServico);
  const [expandQuitado, setExpandQuitado] = useState(false);

  // ── OS QUITADA: 1 linha compacta ───────────────────────────────────────────
  if (allPaid && !expandQuitado) {
    // último pagador da OS (última charge confirmada)
    const ultima = group.charges
      .slice()
      .sort((a, b) => (b.confirmado_em || '').localeCompare(a.confirmado_em || ''))[0];
    const quitadoEm = ultima?.confirmado_em
      ? new Date(ultima.confirmado_em).toLocaleDateString('pt-BR')
      : '';
    const porQuem = ultima?.pago_por || ultima?.confirmado_por || '';

    return (
      <div
        style={{
          background: 'var(--notion-surface)',
          border: '1px solid var(--notion-border)',
          borderLeft: '3px solid var(--status-success)',
          borderRadius: 8,
          marginBottom: 8,
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          cursor: 'pointer',
        }}
        onClick={() => setExpandQuitado(true)}
        title="Clique pra ver detalhes das taxas"
      >
        <CheckCircle size={14} style={{ color: 'var(--status-success)', flexShrink: 0 }} />
        <span className="font-mono" style={{ fontWeight: 700, color: 'var(--notion-blue)' }}>
          #{group.osNumero}
        </span>
        <span style={{ fontWeight: 600, color: 'var(--notion-text)' }}>{group.clienteNome}</span>
        <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
          {group.placa} · {tipoLabel}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="badge badge-success" style={{ fontSize: 10 }}>
            Quitado{quitadoEm && ` em ${quitadoEm}`}{porQuem && ` por ${porQuem}`}
          </span>
          <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--status-success)' }}>
            {fmt(group.totalPago)}
          </span>
        </span>
      </div>
    );
  }

  // ── OS COM PENDENTES (ou quitada expandida) ────────────────────────────────
  return (
    <div
      style={{
        background: 'var(--notion-surface)',
        border: '1px solid var(--notion-border)',
        borderLeft: `4px solid ${allPaid ? 'var(--status-success)' : 'var(--notion-orange)'}`,
        borderRadius: 10,
        overflow: 'visible',
        marginBottom: 10,
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', flexWrap: 'wrap', gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              className="font-mono"
              style={{
                cursor: 'pointer',
                fontWeight: 700,
                color: 'var(--notion-blue)',
                borderBottom: '1px dashed var(--notion-blue)',
              }}
              onClick={e => { e.stopPropagation(); navigate(`/ordens/${group.osId}`); }}
              title="Abrir Ordem de Serviço"
            >
              #{group.osNumero}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--notion-text)' }}>
              {group.clienteNome}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--notion-text-muted)', marginTop: 2 }}>
            <span className="font-mono">{group.placa}</span>
            {group.modelo && <> · {group.modelo}</>}
            <> · {tipoLabel}</>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {hasPending ? (
            <>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--notion-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Pendente
                </div>
                <div className="font-mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--status-warn)' }}>
                  {fmt(group.totalPendente)}
                </div>
              </div>
              <button
                onClick={() => onConfirmAll(group.osId)}
                className="btn btn-primary btn-sm"
                title="Confirmar todas as taxas pendentes desta OS"
              >
                <CheckCircle size={14} />
                Confirmar todas ({pendingCount})
              </button>
            </>
          ) : (
            <button
              onClick={() => setExpandQuitado(false)}
              className="btn btn-ghost btn-sm"
              title="Colapsar"
            >
              <CheckCircle size={13} style={{ color: 'var(--status-success)' }} />
              Recolher
            </button>
          )}
        </div>
      </div>

      {group.charges.map(charge => (
        <ChargeRow
          key={charge.id}
          charge={charge}
          isAdmin={isAdmin}
          onConfirm={onConfirm}
          onRevert={onRevert}
          loadingConfirm={loadingConfirm}
          pagadores={pagadores}
          onCreatePagador={onCreatePagador}
        />
      ))}
    </div>
  );
}

// ── KPI Cell (faixa compacta no topo) ────────────────────────────────────────

interface KpiCellProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: 'warn' | 'success' | 'info' | 'danger';
}

function KpiCell({ icon, label, value, accent }: KpiCellProps) {
  const color =
    accent === 'success' ? 'var(--status-success)'
    : accent === 'warn' ? 'var(--status-warn)'
    : accent === 'danger' ? 'var(--status-danger)'
    : 'var(--status-info)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--notion-text-secondary)' }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
      </div>
      <div className="font-mono" style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1.1 }}>
        {fmt(value)}
      </div>
    </div>
  );
}

// ── Summary Card (legado — mantido por compatibilidade, não usado na UI nova) ─

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
  const askPagador = usePagadorPrompt();

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
  const [pagadores, setPagadores] = useState<Pagador[]>([]);
  const [pagadorFilter, setPagadorFilter] = useState<string>('todos'); // 'todos' | 'sem' | nome
  const [gerenciarOpen, setGerenciarOpen] = useState(false);
  const [maisFiltrosOpen, setMaisFiltrosOpen] = useState(false);

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

  const recarregarPagadores = useCallback(async () => {
    try {
      const lista = await getPagadores();
      setPagadores(lista);
    } catch (err) {
      console.error('Erro ao carregar pagadores:', err);
    }
  }, []);

  useEffect(() => { recarregarPagadores(); }, [recarregarPagadores]);

  const handleCreatePagador = useCallback(async (nome: string): Promise<Pagador> => {
    const novo = await createPagador(nome);
    await recarregarPagadores();
    return novo;
  }, [recarregarPagadores]);

  const handleUpdatePagador = useCallback(async (id: string, patch: { nome?: string; ativo?: boolean }) => {
    await updatePagador(id, patch);
    await recarregarPagadores();
  }, [recarregarPagadores]);

  const handleDeletePagador = useCallback(async (id: string) => {
    const ok = await confirm({
      title: 'Remover pagador',
      message: 'Remover este pagador da lista? Cobranças já registradas continuam com o nome antigo.',
      confirmText: 'Remover',
      danger: true,
    });
    if (!ok) return;
    await deletePagador(id);
    await recarregarPagadores();
  }, [confirm, recarregarPagadores]);

  const handleConfirmar = useCallback(
    async (chargeId: string, valor: number, data: string, pagoPor: string | null) => {
      if (!usuario) return;
      if (loadingConfirmRef.current) return;
      loadingConfirmRef.current = chargeId;
      setLoadingConfirm(chargeId);
      try {
        await confirmarPagamento(chargeId, valor, data, usuario.nome, pagoPor);
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
      const pagoPor = await askPagador({
        title: 'Quem pagou estas taxas?',
        message: 'Selecione quem fisicamente pagou as taxas no banco/Detran.',
        allowSkip: true,
      });
      if (pagoPor === null) return;
      await confirmarTodosDaOS(osId, usuario.nome, pagoPor || null);
      await carregar();
    },
    [usuario, confirm, askPagador, carregar],
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
      const pagoPor = await askPagador({
        title: 'Quem pagou estas taxas?',
        message: `Selecione quem fisicamente pagou as ${pendentes.length} OS.`,
        allowSkip: true,
      });
      if (pagoPor === null) return;
      for (const g of pendentes) {
        await confirmarTodosDaOS(g.osId, usuario.nome, pagoPor || null);
      }
      await carregar();
    },
    [usuario, confirm, askPagador, groups, carregar],
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

      // Pagador filter
      if (pagadorFilter === 'sem') {
        charges = charges.filter(c => c.status === 'pago' && !c.pago_por);
      } else if (pagadorFilter !== 'todos') {
        charges = charges.filter(c => c.pago_por === pagadorFilter);
      }

      // Date filter (on confirmado_em for paid, criado_em for pending)
      charges = charges.filter(c => {
        if (c.status === 'pago' && c.confirmado_em) {
          const d = (c.confirmado_em ?? '').split('T')[0] ?? '';
          return d >= dataInicio && d <= dataFim;
        }
        if (c.status === 'a_pagar') {
          const d = (c.criado_em ?? '').split('T')[0] ?? '';
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
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--notion-text)' }}>
            Controle de Pagamentos
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--notion-text-secondary)' }}>
            Confirme o pagamento de taxas das ordens de serviço
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(() => {
            const totalPendingCharges = groups.reduce(
              (s, g) => s + g.charges.filter(c => c.status === 'a_pagar').length, 0
            );
            if (totalPendingCharges === 0) return null;
            return (
              <button
                onClick={handleConfirmarTodosGlobal}
                disabled={loading}
                className="btn btn-primary btn-sm"
                title="Confirmar TODAS as taxas pendentes visíveis"
              >
                <CheckCircle size={14} />
                Confirmar lote ({totalPendingCharges})
              </button>
            );
          })()}
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

      {/* KPI strip — faixa compacta no lugar dos 4 cards grandes */}
      {resumo && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            padding: '10px 14px',
            background: 'var(--notion-surface)',
            border: '1px solid var(--notion-border)',
            borderRadius: 10,
            marginBottom: 16,
          }}
          className="cp-kpi-strip"
        >
          <KpiCell icon={<Clock size={13} />} label="Pendente" value={resumo.totalPendente} accent="warn" />
          <KpiCell icon={<CheckCircle size={13} />} label="Pago hoje" value={resumo.pagoHoje} accent="success" />
          <KpiCell icon={<TrendingUp size={13} />} label="Semana" value={resumo.pagoSemana} accent="info" />
          <KpiCell icon={<DollarSign size={13} />} label="Mês" value={resumo.pagoMes} accent="success" />
        </div>
      )}

      {/* Filter bar — 2 níveis: linha 1 essencial, "Mais filtros" para secundários */}
      {(() => {
        const filtrosSecundariosAtivos =
          (categoriaFilter !== 'todos' ? 1 : 0) +
          (pagadorFilter !== 'todos' ? 1 : 0) +
          ((dataInicio !== oneWeekAgo() || dataFim !== todayStr()) ? 1 : 0);
        const chips: { label: string; onClear: () => void }[] = [];
        if (categoriaFilter !== 'todos') {
          const lbl = CATEGORIA_LABELS[categoriaFilter] ?? categoriaFilter;
          chips.push({ label: `Categoria: ${lbl}`, onClear: () => setCategoriaFilter('todos') });
        }
        if (pagadorFilter !== 'todos') {
          chips.push({ label: `Pago por: ${pagadorFilter === 'sem' ? 'sem pagador' : pagadorFilter}`, onClear: () => setPagadorFilter('todos') });
        }
        if (dataInicio !== oneWeekAgo() || dataFim !== todayStr()) {
          const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
          chips.push({ label: `${f(dataInicio)} → ${f(dataFim)}`, onClear: () => { setDataInicio(oneWeekAgo()); setDataFim(todayStr()); } });
        }
        return (
          <div
            style={{
              background: 'var(--notion-surface)',
              border: '1px solid var(--notion-border)',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {/* Linha 1: busca + status + mais filtros */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
                <Search
                  size={15}
                  style={{
                    position: 'absolute', left: 10, top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--notion-text-secondary)', pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Buscar cliente, placa ou nº OS…"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  style={{ ...inputStyle, paddingLeft: 32, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['pendente', 'pago', 'todos'] as StatusFilter[]).map(s => (
                  <button key={s} style={toggleBtnStyle(statusFilter === s)} onClick={() => setStatusFilter(s)}>
                    {s === 'pendente' ? 'Pendente' : s === 'pago' ? 'Pago' : 'Todos'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setMaisFiltrosOpen(o => !o)}
                style={{
                  ...toggleBtnStyle(maisFiltrosOpen || filtrosSecundariosAtivos > 0),
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <Filter size={13} />
                Mais filtros
                {filtrosSecundariosAtivos > 0 && (
                  <span style={{
                    background: 'var(--notion-blue)', color: '#fff',
                    fontSize: 10, fontWeight: 700,
                    padding: '1px 6px', borderRadius: 99, marginLeft: 2,
                  }}>
                    {filtrosSecundariosAtivos}
                  </span>
                )}
              </button>
            </div>

            {/* Linha 2: Empresa (toggle-group único) */}
            {empresas.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="info-item-label" style={{ color: 'var(--notion-text-muted)', marginRight: 4 }}>
                  Empresa:
                </span>
                <button onClick={() => setEmpresaFilter('')} style={toggleBtnStyle(empresaFilter === '')}>
                  Todas
                </button>
                {empresas.map(emp => {
                  const ativo = empresaFilter === emp.id;
                  return (
                    <button
                      key={emp.id}
                      onClick={() => setEmpresaFilter(emp.id)}
                      style={{
                        padding: '6px 12px',
                        fontSize: 12, fontWeight: ativo ? 700 : 500,
                        borderRadius: 6,
                        border: `1.5px solid ${ativo ? emp.cor : 'var(--notion-border)'}`,
                        background: ativo ? emp.cor : 'transparent',
                        color: ativo ? '#fff' : 'var(--notion-text-secondary)',
                        cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: ativo ? '#fff' : emp.cor }} />
                      {emp.nome}
                    </button>
                  );
                })}
                <button onClick={() => setEmpresaFilter('particular')} style={toggleBtnStyle(empresaFilter === 'particular')}>
                  Particulares
                </button>
              </div>
            )}

            {/* Linha 3: chips de filtros ativos */}
            {chips.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {chips.map((c, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 4px 3px 10px', fontSize: 11, fontWeight: 600,
                      background: 'rgba(0,117,222,0.08)', color: 'var(--notion-blue)',
                      border: '1px solid rgba(0,117,222,0.25)', borderRadius: 99,
                    }}
                  >
                    {c.label}
                    <button
                      onClick={c.onClear}
                      title="Remover filtro"
                      aria-label={`Remover filtro ${c.label}`}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--notion-blue)', display: 'flex', alignItems: 'center',
                        padding: 2, borderRadius: 99,
                      }}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Drawer inline: filtros secundários */}
            {maisFiltrosOpen && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: 10,
                padding: 12,
                background: 'var(--notion-bg-alt)',
                border: '1px solid var(--notion-border)',
                borderRadius: 8,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span className="info-item-label" style={{ color: 'var(--notion-text-secondary)' }}>Categoria</span>
                  <select
                    value={categoriaFilter}
                    onChange={e => setCategoriaFilter(e.target.value)}
                    style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                  >
                    <option value="todos">Todas as categorias</option>
                    <option value="dae_principal">DAE Principal</option>
                    <option value="dae_adicional">DAE Adicional</option>
                    <option value="vistoria">Vistoria</option>
                    <option value="placa">Placa</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span className="info-item-label" style={{ color: 'var(--notion-text-secondary)' }}>Pago por</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select
                      value={pagadorFilter}
                      onChange={e => setPagadorFilter(e.target.value)}
                      style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                    >
                      <option value="todos">Todos</option>
                      <option value="sem">Sem pagador</option>
                      {pagadores.filter(p => p.ativo).map(p => (
                        <option key={p.id} value={p.nome}>{p.nome}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setGerenciarOpen(true)}
                      title="Gerenciar lista de pagadores"
                      aria-label="Gerenciar lista de pagadores"
                      style={{ ...inputStyle, padding: '0 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <Users size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span className="info-item-label" style={{ color: 'var(--notion-text-secondary)' }}>De</span>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={e => setDataInicio(e.target.value)}
                    style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span className="info-item-label" style={{ color: 'var(--notion-text-secondary)' }}>Até</span>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={e => setDataFim(e.target.value)}
                    style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })()}

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
              pagadores={pagadores}
              onCreatePagador={handleCreatePagador}
            />
          ))}
        </div>
      )}

      {/* Modal de gerenciamento de pagadores */}
      {gerenciarOpen && (
        <GerenciarPagadoresModal
          pagadores={pagadores}
          onClose={() => setGerenciarOpen(false)}
          onCreate={async (nome) => { await handleCreatePagador(nome); }}
          onUpdate={handleUpdatePagador}
          onDelete={handleDeletePagador}
        />
      )}

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 680px) {
          .cp-kpi-strip { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

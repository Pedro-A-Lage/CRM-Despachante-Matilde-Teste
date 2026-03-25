import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getChargesByOS,
  getPaymentsByOS,
  calcularResumo,
  marcarCustoPago,
  deletePayment,
  updateCharge,
  deleteCharge,
  addCharge,
  desmarcarCustoPago,
  getPriceByCodigo,
  getServicePrice,
  getDescontoOS,
  saveDescontoOS,
} from '../../lib/financeService';
import { supabase } from '../../lib/supabaseClient';
import type { FinanceCharge, Payment, FinanceResumo, TipoVeiculo } from '../../types/finance';
import { PAYMENT_METODO_LABELS } from '../../types/finance';
import RecebimentoModal from './RecebimentoModal';
import CustoAdicionalModal from './CustoAdicionalModal';
import { useConfirm } from '../ConfirmProvider';

interface Props {
  osId: string;
  valorServico: number;
  trocaPlaca?: boolean;
  tipoVeiculo?: TipoVeiculo;
  tipoServico?: string;
  userRole?: string;
  onValorServicoChange?: (novoValor: number) => void | Promise<void>;
  onPaymentChange?: () => void;
  readOnly?: boolean;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

// ---------- icon primitives ----------
const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconUndo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7v6h6" />
    <path d="M3 13C5.33 7.67 10.33 4 16 4a9 9 0 0 1 9 9" />
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconSave = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

const IconCalendar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

// ---------- small reusable button ----------
type BtnVariant = 'primary' | 'success' | 'warning' | 'danger' | 'ghost' | 'outline';

const variantClassMap: Record<BtnVariant, string> = {
  primary: 'btn-primary',
  success: 'btn-success',
  warning: 'btn-outline-warning',
  danger: 'btn-ghost text-danger',
  ghost: 'btn-ghost',
  outline: 'btn-secondary',
};

function Btn({
  onClick, variant = 'outline', children, title, small = false,
}: {
  onClick: () => void;
  variant?: BtnVariant;
  children: React.ReactNode;
  title?: string;
  small?: boolean;
}) {
  const sizeClass = small ? 'btn-sm' : '';
  const variantClass = variantClassMap[variant];
  return (
    <button
      onClick={onClick}
      title={title}
      className={`btn ${variantClass} ${sizeClass}`.trim()}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="finance-divider" />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="finance-section-label">{children}</span>;
}

function StatusBadge({ status }: { status: FinanceCharge['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    pago:      { label: 'Pago',      cls: 'finance-status-pago' },
    a_pagar:   { label: 'Pendente',  cls: 'finance-status-pendente' },
    cancelado: { label: 'Cancelado', cls: 'finance-status-cancelado' },
  };
  const s = map[status] ?? map['a_pagar']!;
  return <span className={`finance-status-badge ${s.cls}`}>{s.label}</span>;
}

// Recebimento status badge (for payments section)
function RecebimentoBadge({ totalRecebido, valorServico, numPagamentos }: {
  totalRecebido: number;
  valorServico: number;
  numPagamentos: number;
}) {
  if (totalRecebido >= valorServico && valorServico > 0) {
    const label = numPagamentos === 1 ? 'Pago a Vista' : 'Quitado';
    return <span className="finance-recebimento-quitado">{label}</span>;
  }
  if (totalRecebido > 0) {
    return <span className="finance-recebimento-parcial">Parcial ({numPagamentos} receb.)</span>;
  }
  return <span className="finance-recebimento-pendente">Pendente</span>;
}

// Metodo payment badge
function MetodoBadge({ metodo }: { metodo: string }) {
  return (
    <span className="finance-metodo-badge">
      {PAYMENT_METODO_LABELS[metodo as keyof typeof PAYMENT_METODO_LABELS] ?? metodo}
    </span>
  );
}

// ---------- column card ----------
function ColCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="finance-col-card" style={style}>
      {children}
    </div>
  );
}

function ColHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="finance-col-header">
      <SectionLabel>{label}</SectionLabel>
      {right}
    </div>
  );
}

// ---------- main component ----------
export default function FinancePainel({
  osId,
  valorServico,
  trocaPlaca = false,
  tipoVeiculo = 'carro',
  tipoServico,
  userRole,
  onValorServicoChange,
  onPaymentChange,
  readOnly = false,
}: Props) {
  const confirm = useConfirm();
  const { usuario } = useAuth();
  const isAdmin = userRole === 'admin' || usuario?.role === 'admin';
  const [charges, setCharges] = useState<FinanceCharge[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [resumo, setResumo] = useState<FinanceResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRecebimento, setShowRecebimento] = useState(false);
  const [showCustoExtra, setShowCustoExtra] = useState(false);
  const [editandoValor, setEditandoValor] = useState(false);
  const [valorTemp, setValorTemp] = useState('');
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [editandoCusto, setEditandoCusto] = useState<string | null>(null);
  const [custoDescTemp, setCustoDescTemp] = useState('');
  const [custoValorTemp, setCustoValorTemp] = useState('');
  const [editandoPagamento, setEditandoPagamento] = useState<Payment | null>(null);
  const syncingPlaca = useRef(false);

  // Data prevista de pagamento (localStorage)
  const dataPrevistaKey = `finance_data_prevista_${osId}`;
  const [dataPrevista, setDataPrevista] = useState<string>(() => {
    try { return localStorage.getItem(dataPrevistaKey) ?? ''; } catch { return ''; }
  });

  const salvarDataPrevista = (val: string) => {
    setDataPrevista(val);
    try { localStorage.setItem(dataPrevistaKey, val); } catch { /* noop */ }
  };

  // Desconto — persisted in DB (ordens_de_servico.desconto)
  const [desconto, setDesconto] = useState<string>('');
  const [editandoDesconto, setEditandoDesconto] = useState(false);
  const [descontoTemp, setDescontoTemp] = useState('');

  const descontoValor = unmaskMoney(desconto);

  // Load desconto from DB on mount
  useEffect(() => {
    getDescontoOS(osId).then(val => {
      if (val > 0) setDesconto(maskMoney((isNaN(val) ? 0 : val).toFixed(2).replace('.', '')));
    }).catch(() => { /* ignore */ });
  }, [osId]);

  const salvarDesconto = async () => {
    const val = unmaskMoney(descontoTemp);
    const masked = val > 0 ? maskMoney((isNaN(val) ? 0 : val).toFixed(2).replace('.', '')) : '';
    setDesconto(masked);
    setEditandoDesconto(false);
    try {
      await saveDescontoOS(osId, val);
    } catch (err) {
      console.error('Erro ao salvar desconto:', err);
    }
  };

  const hasLoadedOnce = useRef(false);
  const carregarRef = useRef<(silently?: boolean) => Promise<void>>(async () => {});

  const carregar = useCallback(async (silently = false) => {
    const isFirstLoad = !hasLoadedOnce.current;
    if (!silently && isFirstLoad) setLoading(true);
    try {
      const [c, p] = await Promise.all([getChargesByOS(osId), getPaymentsByOS(osId)]);
      setCharges(c);
      setPayments(p);
      setResumo(calcularResumo(Math.max(0, valorServico - descontoValor), c, p));
      hasLoadedOnce.current = true;
    } finally {
      if (!silently && isFirstLoad) setLoading(false);
    }
  }, [osId, valorServico, descontoValor]);

  useEffect(() => { carregarRef.current = carregar; }); // no deps — always latest

  useEffect(() => { carregar(); }, [carregar]);

  // Realtime subscriptions — keep data fresh when other users make changes
  useEffect(() => {
    const channel = supabase
      .channel(`finance-${osId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_charges', filter: `os_id=eq.${osId}` }, () => carregarRef.current(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `os_id=eq.${osId}` }, () => carregarRef.current(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [osId]);

  // Auto-sync custo de placa com trocaPlaca + atualizar valor do serviço
  useEffect(() => {
    if (loading || (charges.length === 0 && !trocaPlaca)) return;
    if (syncingPlaca.current) return;
    const placaCharge = charges.find(c => c.categoria === 'placa' && c.status !== 'cancelado');

    if (trocaPlaca && !placaCharge) {
      // Tem troca de placa mas não tem custo — adicionar e atualizar valor
      syncingPlaca.current = true;
      (async () => {
        try {
          const codigo = tipoVeiculo === 'moto' ? 'placa_moto_mercosul' : 'placa_carro_mercosul';
          const descricao = tipoVeiculo === 'moto' ? 'Placa Moto' : 'Placa Mercosul (par)';
          const valor = await getPriceByCodigo(codigo);
          await addCharge(osId, descricao, 'placa', valor);
          // Atualizar valor do serviço
          if (tipoServico && onValorServicoChange) {
            const novoValor = await getServicePrice(tipoServico, tipoVeiculo, true);
            if (novoValor > 0) onValorServicoChange(novoValor);
          }
          await carregar(true);
        } finally {
          syncingPlaca.current = false;
        }
      })();
    } else if (!trocaPlaca && placaCharge && placaCharge.status === 'a_pagar') {
      // Não tem troca de placa mas tem custo não pago — remover e atualizar valor
      syncingPlaca.current = true;
      (async () => {
        try {
          await deleteCharge(placaCharge.id);
          // Atualizar valor do serviço
          if (tipoServico && onValorServicoChange) {
            const novoValor = await getServicePrice(tipoServico, tipoVeiculo, false);
            if (novoValor > 0) onValorServicoChange(novoValor);
          }
          await carregar(true);
        } finally {
          syncingPlaca.current = false;
        }
      })();
    }
  }, [charges, trocaPlaca, tipoVeiculo, tipoServico, osId, loading]);

  useEffect(() => {
    if (mensagem) {
      const t = setTimeout(() => setMensagem(null), 3500);
      return () => clearTimeout(t);
    }
  }, [mensagem]);

  const salvarValorServico = async () => {
    const novo = unmaskMoney(valorTemp);
    setEditandoValor(false);
    if (novo > 0 && onValorServicoChange) {
      try {
        await onValorServicoChange(novo);
      } catch (err) {
        console.error('Erro ao salvar valor do servico:', err);
        setMensagem({ tipo: 'erro', texto: 'Nao foi possivel salvar o valor do servico. Tente novamente.' });
      }
    }
  };

  const handlePagarCusto = async (chargeId: string) => {
    // Optimistic update: flip the badge immediately so the user sees the change
    setCharges(prev =>
      prev.map(c =>
        c.id === chargeId
          ? { ...c, status: 'pago' as FinanceCharge['status'], valor_pago: c.valor_previsto }
          : c,
      ),
    );
    try {
      await marcarCustoPago(chargeId);
      await carregar(true);
      setMensagem({ tipo: 'sucesso', texto: 'Custo marcado como pago.' });
    } catch (err) {
      console.error(err);
      // Roll back optimistic update on failure
      await carregar(true);
      setMensagem({ tipo: 'erro', texto: 'Nao foi possivel marcar como pago. Tente novamente.' });
    }
  };

  const iniciarEdicaoCusto = (c: FinanceCharge) => {
    setEditandoCusto(c.id);
    setCustoDescTemp(c.descricao);
    setCustoValorTemp(maskMoney((isNaN(c.valor_previsto) ? 0 : c.valor_previsto).toFixed(2).replace('.', '')));
  };

  const salvarEdicaoCusto = async () => {
    if (!editandoCusto) return;
    const novoValor = unmaskMoney(custoValorTemp);
    if (!custoDescTemp.trim() || novoValor <= 0) return;
    try {
      await updateCharge(editandoCusto, { descricao: custoDescTemp.trim(), valor_previsto: novoValor });
      setEditandoCusto(null);
      await carregar(true);
      setMensagem({ tipo: 'sucesso', texto: 'Custo atualizado.' });
    } catch (err) {
      console.error(err);
      setMensagem({ tipo: 'erro', texto: 'Nao foi possivel atualizar o custo.' });
    }
  };

  const handleDesfazerPagoCusto = async (chargeId: string) => {
    const ok = await confirm({ message: 'Deseja desfazer o pagamento deste custo?', confirmText: 'Desfazer', danger: true });
    if (!ok) return;
    try {
      await desmarcarCustoPago(chargeId);
      await carregar(true);
      setMensagem({ tipo: 'sucesso', texto: 'Pagamento do custo desfeito.' });
    } catch (err) {
      console.error(err);
      setMensagem({ tipo: 'erro', texto: 'Nao foi possivel desfazer. Tente novamente.' });
    }
  };

  const handleRemoverCusto = async (id: string) => {
    const ok = await confirm({ message: 'Deseja remover este custo?', confirmText: 'Remover', danger: true });
    if (!ok) return;
    try {
      await deleteCharge(id);
      await carregar(true);
      setMensagem({ tipo: 'sucesso', texto: 'Custo removido.' });
    } catch (err) {
      console.error(err);
      setMensagem({ tipo: 'erro', texto: 'Nao foi possivel remover o custo.' });
    }
  };

  const handleRemoverPagamento = async (id: string) => {
    const pagamento = payments.find(p => p.id === id);
    const canDelete = isAdmin || (pagamento?.recebido_por && pagamento.recebido_por === usuario?.nome);
    if (!canDelete) {
      setMensagem({ tipo: 'erro', texto: 'Você só pode apagar recebimentos que você mesmo registrou.' });
      return;
    }
    const ok = await confirm({ message: 'Deseja remover este recebimento?', confirmText: 'Remover', danger: true });
    if (!ok) return;
    try {
      await deletePayment(id);
      await carregar(true);
      setMensagem({ tipo: 'sucesso', texto: 'Recebimento removido com sucesso.' });
    } catch (err) {
      console.error(err);
      setMensagem({ tipo: 'erro', texto: 'Nao foi possivel remover o recebimento. Tente novamente.' });
    }
  };

  // ---------- loading ----------
  if (loading && !hasLoadedOnce.current) {
    return (
      <div className="loading-spinner">
        <span className="text-sm text-gray">Carregando financeiro...</span>
      </div>
    );
  }

  const valorServicoEfetivo = Math.max(0, valorServico - descontoValor);
  const progressoPct = resumo && valorServicoEfetivo > 0
    ? Math.min(100, (resumo.totalRecebido / valorServicoEfetivo) * 100)
    : 0;

  const honorario = resumo?.honorario ?? 0;
  const totalRecebido = resumo?.totalRecebido ?? 0;
  const faltaReceber = resumo?.faltaReceber ?? valorServicoEfetivo;
  const totalCustos = resumo?.totalCustos ?? 0;
  const isQuitado = totalRecebido >= valorServicoEfetivo && valorServicoEfetivo > 0;

  // Unique payment methods used
  const metodosUsados = Array.from(new Set(payments.map(p => p.metodo)));

  const inputStyle: React.CSSProperties = {
    fontSize: 13,
    padding: '6px 10px',
    borderRadius: 7,
    border: '1.5px solid var(--color-primary)',
    background: 'var(--bg-surface)',
    color: 'var(--color-text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  };

  // === VISÃO PARA FUNCIONÁRIOS (sem composição/custos, com recebimentos completo) ===
  if (!isAdmin) {
    const valorComDesconto = descontoValor > 0 ? valorServico - descontoValor : valorServico;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>

          {/* COLUNA 1 — Valor resumido + desconto */}
          <ColCard style={{ flex: '1 1 220px', minWidth: 200 }}>
            <ColHeader label="Valor do Serviço" />
            <div style={{ padding: '18px 18px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Valor */}
              {descontoValor > 0 && (
                <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)', textDecoration: 'line-through' }}>
                  {fmt(valorServico)}
                </span>
              )}
              <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                {fmt(valorComDesconto)}
              </span>

              {/* Badge de desconto */}
              {descontoValor > 0 && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
                  padding: '3px 10px', borderRadius: 6,
                  background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-success)' }}>
                    Desconto: -{fmt(descontoValor)}
                  </span>
                </div>
              )}

              {/* Botão desconto */}
              {!readOnly && (
                <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                  {editandoDesconto ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>R$</span>
                      <input
                        value={descontoTemp}
                        onChange={e => setDescontoTemp(maskMoney(e.target.value))}
                        style={{ ...inputStyle, flex: 1, maxWidth: 120 }}
                        autoFocus
                      />
                      <Btn variant="primary" small onClick={salvarDesconto}>Salvar</Btn>
                      <Btn variant="ghost" small onClick={() => setEditandoDesconto(false)}>✕</Btn>
                    </div>
                  ) : (
                    <Btn variant="ghost" small onClick={() => {
                      setDescontoTemp(desconto);
                      setEditandoDesconto(true);
                    }}>
                      {descontoValor > 0 ? `Desconto: ${fmt(descontoValor)}` : '+ Adicionar desconto'}
                    </Btn>
                  )}
                </div>
              )}
            </div>
          </ColCard>

          {/* COLUNA 2 — Recebimentos (completo, igual admin) */}
          <ColCard style={{ flex: '1 1 260px', minWidth: 240 }}>
            <ColHeader label="Recebimentos" right={
              !readOnly ? (
                <button
                  onClick={() => setShowRecebimento(true)}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.82'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 12, fontWeight: 600,
                    background: 'var(--color-primary)',
                    color: 'var(--color-text-on-primary, #fff)',
                    border: 'none', borderRadius: 7,
                    padding: '5px 11px', cursor: 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                >
                  <IconPlus /> Registrar
                </button>
              ) : undefined
            } />

            <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Status badge + metodos */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <RecebimentoBadge
                  totalRecebido={totalRecebido}
                  valorServico={resumo?.valorServico ?? valorServicoEfetivo}
                  numPagamentos={payments.length}
                />
                {metodosUsados.map(m => (
                  <MetodoBadge key={m} metodo={m} />
                ))}
              </div>

              {/* Barra de progresso */}
              <div>
                <div style={{ height: 7, borderRadius: 99, background: 'var(--border-color)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${progressoPct}%`, borderRadius: 99,
                    transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    background: progressoPct >= 100
                      ? 'var(--color-success)'
                      : progressoPct > 50
                        ? 'linear-gradient(90deg, var(--color-primary), var(--color-success))'
                        : 'var(--color-primary)',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)' }}>
                    Recebido: {fmt(totalRecebido)}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: faltaReceber > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    {faltaReceber > 0 ? `Falta: ${fmt(faltaReceber)}` : 'Quitado'}
                  </span>
                </div>
              </div>

              {/* Data prevista */}
              {!isQuitado && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  padding: '9px 12px', borderRadius: 8,
                  background: 'rgba(128,128,128,0.04)',
                  border: '1px solid var(--border-color)',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    <IconCalendar /> Previsao:
                  </span>
                  {!readOnly ? (
                    <input
                      type="date"
                      value={dataPrevista}
                      onChange={e => salvarDataPrevista(e.target.value)}
                      style={{
                        fontSize: 12, fontWeight: 600,
                        border: '1.5px solid var(--border-color)',
                        borderRadius: 6, padding: '3px 8px',
                        background: 'var(--bg-surface)',
                        color: 'var(--color-text-primary)',
                        outline: 'none', cursor: 'pointer',
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {dataPrevista
                        ? new Date(dataPrevista + 'T00:00:00').toLocaleDateString('pt-BR')
                        : 'Nao definida'}
                    </span>
                  )}
                </div>
              )}

              <Divider />

              {/* Lista de pagamentos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {payments.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                    Nenhum recebimento registrado.
                  </p>
                ) : (
                  payments.map((p, i) => (
                    <div key={p.id}>
                      {i > 0 && <Divider />}
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0',
                      }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                        }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)',
                            background: 'rgba(128,128,128,0.07)', border: '1px solid var(--border-color)',
                            borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap',
                          }}>
                            {new Date(p.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-success)', whiteSpace: 'nowrap' }}>
                            {fmt(p.valor)}
                          </span>
                          <MetodoBadge metodo={p.metodo} />
                          {p.instituicao && (
                            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{p.instituicao}</span>
                          )}
                          <div style={{ flex: 1 }} />
                          {!readOnly && (
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <Btn variant="ghost" small onClick={() => setEditandoPagamento(p)} title="Editar recebimento">
                                <IconEdit />
                              </Btn>
                              <Btn variant="danger" small onClick={() => handleRemoverPagamento(p.id)} title="Remover recebimento">
                                <IconTrash />
                              </Btn>
                            </div>
                          )}
                        </div>

                        {(p.recebido_por || p.observacao) && (
                          <div style={{
                            display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, paddingLeft: 8, borderLeft: '2px solid var(--color-text-tertiary)',
                          }}>
                            {p.recebido_por && (
                              <div>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Recebido por:</span>
                                <span style={{ marginLeft: 6, color: 'var(--color-text-primary)' }}>{p.recebido_por}</span>
                              </div>
                            )}
                            {p.observacao && (
                              <div>
                                <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Obs:</span>
                                <span style={{ marginLeft: 6, color: 'var(--color-text-primary)', fontStyle: 'italic' }}>{p.observacao}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </ColCard>
        </div>

        {/* Modais */}
        {(showRecebimento || editandoPagamento) && resumo && (
          <RecebimentoModal
            osId={osId}
            saldoRestante={resumo.faltaReceber}
            editPayment={editandoPagamento ?? undefined}
            onClose={() => { setShowRecebimento(false); setEditandoPagamento(null); }}
            onSaved={async () => { await carregar(true); onPaymentChange?.(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ---- toast feedback ---- */}
      {mensagem && (
        <div className={`finance-feedback ${mensagem.tipo === 'sucesso' ? 'finance-feedback-success' : 'finance-feedback-error'}`}>
          <span style={{ fontSize: 15 }}>{mensagem.tipo === 'sucesso' ? '✓' : '!'}</span>
          {mensagem.texto}
        </div>
      )}

      {/* ======================================================
          3-COLUMN LAYOUT (wraps on small screens)
      ====================================================== */}
      <div style={{
        display: 'flex',
        gap: 12,
        alignItems: 'stretch',
        flexWrap: 'wrap',
      }}>

        {/* ================================================
            COLUNA 1 — Valor e Composicao
        ================================================ */}
        <ColCard style={{ flex: '1 1 240px', minWidth: 220 }}>
          <ColHeader label="Valor do Servico" right={
            !readOnly && !editandoValor && onValorServicoChange ? (
              <Btn variant="ghost" small onClick={() => {
                setValorTemp(maskMoney((isNaN(valorServico) ? 0 : valorServico).toFixed(2).replace('.', '')));
                setEditandoValor(true);
              }}>
                <IconEdit /> Editar
              </Btn>
            ) : undefined
          } />

          <div style={{ padding: '18px 18px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Valor principal */}
            {editandoValor ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-secondary)' }}>R$</span>
                  <input
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    value={valorTemp}
                    onChange={e => setValorTemp(maskMoney(e.target.value))}
                    onBlur={salvarValorServico}
                    onKeyDown={e => { if (e.key === 'Enter') salvarValorServico(); if (e.key === 'Escape') setEditandoValor(false); }}
                    style={{ ...inputStyle, fontSize: 22, fontWeight: 700, width: '100%', textAlign: 'right' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn variant="success" onClick={salvarValorServico}><IconSave /> Salvar</Btn>
                  <Btn variant="ghost" onClick={() => setEditandoValor(false)}>Cancelar</Btn>
                </div>
              </div>
            ) : (
              <div>
                {descontoValor > 0 && (
                  <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', textDecoration: 'line-through', marginBottom: 2 }}>
                    {fmt(valorServico)}
                  </p>
                )}
                <p style={{ fontSize: 30, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
                  {fmt(descontoValor > 0 ? valorServico - descontoValor : valorServico)}
                </p>
                {descontoValor > 0 && (
                  <span style={{
                    display: 'inline-block', marginTop: 4,
                    fontSize: 11, fontWeight: 700, color: 'var(--color-success-bright)',
                    background: 'var(--color-success-bg)', padding: '2px 8px', borderRadius: 6,
                  }}>
                    Desconto: -{fmt(descontoValor)}
                  </span>
                )}
              </div>
            )}

            {/* Desconto */}
            {!readOnly && (
              <div>
                {editandoDesconto ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Desconto R$</span>
                    <input
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      value={descontoTemp}
                      onChange={e => setDescontoTemp(maskMoney(e.target.value))}
                      onBlur={salvarDesconto}
                      onKeyDown={e => { if (e.key === 'Enter') salvarDesconto(); if (e.key === 'Escape') setEditandoDesconto(false); }}
                      style={{ ...inputStyle, fontSize: 14, fontWeight: 700, width: 100, textAlign: 'right' }}
                    />
                    <Btn variant="success" small onClick={salvarDesconto}><IconSave /></Btn>
                    <Btn variant="ghost" small onClick={() => setEditandoDesconto(false)}>×</Btn>
                  </div>
                ) : (
                  <Btn variant="ghost" small onClick={() => {
                    setDescontoTemp(desconto || '0,00');
                    setEditandoDesconto(true);
                  }}>
                    {descontoValor > 0 ? `Desconto: ${fmt(descontoValor)}` : '+ Adicionar desconto'}
                  </Btn>
                )}
              </div>
            )}

            <Divider />

            {/* Composicao: Custos + Honorario = Total — só admin */}
            {isAdmin && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SectionLabel>Composicao</SectionLabel>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {/* Custos */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 10px', borderRadius: 8,
                  background: 'rgba(220,38,38,0.05)',
                  border: '1px solid rgba(220,38,38,0.15)',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                    Custos
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-danger)' }}>
                    {fmt(totalCustos)}
                  </span>
                </div>

                {/* Honorario */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 10px', borderRadius: 8,
                  background: honorario >= 0 ? 'rgba(22,163,74,0.05)' : 'rgba(220,38,38,0.05)',
                  border: `1px solid ${honorario >= 0 ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)'}`,
                }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                    Honorario
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: honorario >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                  }}>
                    {fmt(honorario)}
                  </span>
                </div>

                {/* Separador e total */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 10px', borderRadius: 8,
                  background: 'rgba(128,128,128,0.06)',
                  border: '1px solid var(--border-color)',
                  marginTop: 2,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                    {fmt(descontoValor > 0 ? valorServico - descontoValor : valorServico)}
                  </span>
                </div>
              </div>
            </div>}
          </div>
        </ColCard>

        {/* ================================================
            COLUNA 2 — Recebimentos
        ================================================ */}
        <ColCard style={{ flex: '1 1 260px', minWidth: 240 }}>
          <ColHeader label="Recebimentos" right={
            !readOnly ? (
              <button
                onClick={() => setShowRecebimento(true)}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.82'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 12, fontWeight: 600,
                  background: 'var(--color-primary)',
                  color: 'var(--color-text-on-primary, #fff)',
                  border: 'none', borderRadius: 7,
                  padding: '5px 11px', cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
              >
                <IconPlus /> Registrar
              </button>
            ) : undefined
          } />

          <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Status badge + metodos usados */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <RecebimentoBadge
                totalRecebido={totalRecebido}
                valorServico={resumo?.valorServico ?? valorServicoEfetivo}
                numPagamentos={payments.length}
              />
              {metodosUsados.map(m => (
                <MetodoBadge key={m} metodo={m} />
              ))}
            </div>

            {/* Barra de progresso */}
            <div>
              <div style={{ height: 7, borderRadius: 99, background: 'var(--border-color)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${progressoPct}%`, borderRadius: 99,
                  transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  background: progressoPct >= 100
                    ? 'var(--color-success)'
                    : progressoPct > 50
                      ? 'linear-gradient(90deg, var(--color-primary), var(--color-success))'
                      : 'var(--color-primary)',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)' }}>
                  Recebido: {fmt(totalRecebido)}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: faltaReceber > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {faltaReceber > 0 ? `Falta: ${fmt(faltaReceber)}` : 'Quitado'}
                </span>
              </div>
            </div>

            {/* Data prevista (somente se nao quitado) */}
            {!isQuitado && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                padding: '9px 12px', borderRadius: 8,
                background: 'rgba(128,128,128,0.04)',
                border: '1px solid var(--border-color)',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  <IconCalendar /> Previsao:
                </span>
                {!readOnly ? (
                  <input
                    type="date"
                    value={dataPrevista}
                    onChange={e => salvarDataPrevista(e.target.value)}
                    style={{
                      fontSize: 12, fontWeight: 600,
                      border: '1.5px solid var(--border-color)',
                      borderRadius: 6, padding: '3px 8px',
                      background: 'var(--bg-surface)',
                      color: 'var(--color-text-primary)',
                      outline: 'none', cursor: 'pointer',
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {dataPrevista
                      ? new Date(dataPrevista + 'T00:00:00').toLocaleDateString('pt-BR')
                      : 'Nao definida'}
                  </span>
                )}
              </div>
            )}

            <Divider />

            {/* Lista de pagamentos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {payments.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                  Nenhum recebimento registrado.
                </p>
              ) : (
                payments.map((p, i) => (
                  <div key={p.id}>
                    {i > 0 && <Divider />}
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0',
                    }}>
                      {/* Primeira linha: data, valor, metodo, delete */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                      }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)',
                          background: 'rgba(128,128,128,0.07)', border: '1px solid var(--border-color)',
                          borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap',
                        }}>
                          {new Date(p.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-success)', whiteSpace: 'nowrap' }}>
                          {fmt(p.valor)}
                        </span>
                        <MetodoBadge metodo={p.metodo} />
                        {p.instituicao && (
                          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{p.instituicao}</span>
                        )}
                        <div style={{ flex: 1 }} />
                        {!readOnly && (
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <Btn variant="ghost" small onClick={() => setEditandoPagamento(p)} title="Editar recebimento">
                              <IconEdit />
                            </Btn>
                            <Btn variant="danger" small onClick={() => handleRemoverPagamento(p.id)} title="Remover recebimento">
                              <IconTrash />
                            </Btn>
                          </div>
                        )}
                      </div>

                      {/* Recebido por e Observação */}
                      {(p.recebido_por || p.observacao) && (
                        <div style={{
                          display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, paddingLeft: 8, borderLeft: '2px solid var(--color-text-tertiary)',
                        }}>
                          {p.recebido_por && (
                            <div>
                              <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Recebido por:</span>
                              <span style={{ marginLeft: 6, color: 'var(--color-text-primary)' }}>{p.recebido_por}</span>
                            </div>
                          )}
                          {p.observacao && (
                            <div>
                              <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Obs:</span>
                              <span style={{ marginLeft: 6, color: 'var(--color-text-primary)', fontStyle: 'italic' }}>{p.observacao}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </ColCard>

        {/* ================================================
            COLUNA 3 — Custos (só admin)
        ================================================ */}
        {isAdmin && <ColCard style={{ flex: '1 1 260px', minWidth: 240 }}>
          <ColHeader label="Custos do Servico" right={
            !readOnly ? (
              <button
                onClick={() => setShowCustoExtra(true)}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 12, fontWeight: 600,
                  color: 'var(--color-primary)',
                  background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0,
                  transition: 'opacity 0.15s',
                }}
              >
                <IconPlus /> Custo extra
              </button>
            ) : undefined
          } />

          <div style={{ padding: '10px 18px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {charges.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontStyle: 'italic', padding: '10px 0' }}>
                Nenhum custo registrado.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {charges.map((c, i) => (
                  <div key={c.id}>
                    {i > 0 && <Divider />}

                    {editandoCusto === c.id ? (
                      <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input
                            value={custoDescTemp}
                            onChange={e => setCustoDescTemp(e.target.value)}
                            placeholder="Descricao"
                            style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>R$</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={custoValorTemp}
                              onChange={e => setCustoValorTemp(maskMoney(e.target.value))}
                              placeholder="0,00"
                              style={{ ...inputStyle, width: 90, textAlign: 'right' }}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 7 }}>
                          <Btn variant="success" onClick={salvarEdicaoCusto}><IconSave /> Salvar</Btn>
                          <Btn variant="ghost" onClick={() => setEditandoCusto(null)}>Cancelar</Btn>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        padding: '11px 0', display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2,
                          }}>
                            {c.descricao}
                          </p>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            {fmt(c.valor_previsto)}
                          </span>
                        </div>

                        <StatusBadge status={c.status} />

                        {!readOnly && (
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {c.status === 'a_pagar' && (
                              <Btn variant="success" small onClick={() => handlePagarCusto(c.id)} title="Marcar como pago">
                                <IconCheck /> Pagar
                              </Btn>
                            )}
                            {c.status === 'pago' && (
                              <Btn variant="warning" small onClick={() => handleDesfazerPagoCusto(c.id)} title="Desfazer pagamento">
                                <IconUndo /> Desfazer
                              </Btn>
                            )}
                            <Btn variant="ghost" small onClick={() => iniciarEdicaoCusto(c)} title="Editar custo">
                              <IconEdit />
                            </Btn>
                            <Btn variant="danger" small onClick={() => handleRemoverCusto(c.id)} title="Remover custo">
                              <IconTrash />
                            </Btn>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Total custos */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '11px 0', marginTop: 'auto',
              borderTop: '1.5px solid var(--border-color)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Custos
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                {fmt(totalCustos)}
              </span>
            </div>
          </div>
        </ColCard>}
      </div>

      {/* ---- modais ---- */}
      {(showRecebimento || editandoPagamento) && resumo && (
        <RecebimentoModal
          osId={osId}
          saldoRestante={resumo.faltaReceber}
          editPayment={editandoPagamento ?? undefined}
          onClose={() => { setShowRecebimento(false); setEditandoPagamento(null); }}
          onSaved={async () => { await carregar(); onPaymentChange?.(); }}
        />
      )}
      {showCustoExtra && (
        <CustoAdicionalModal
          osId={osId}
          onClose={() => setShowCustoExtra(false)}
          onSaved={() => carregar(true)}
        />
      )}
    </div>
  );
}

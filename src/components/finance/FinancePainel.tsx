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
import type { FinanceCharge, Payment, FinanceResumo, TipoVeiculo, PaymentMetodo } from '../../types/finance';
import { PAYMENT_METODO_LABELS } from '../../types/finance';
import RecebimentoModal from './RecebimentoModal';
import CustoAdicionalModal from './CustoAdicionalModal';
import { useConfirm } from '../ConfirmProvider';
import { usePagadorPrompt } from '../PagadorPromptProvider';

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
  ocultarCustos?: boolean;
  ocultarHonorarios?: boolean;
  /** Forma de pagamento padrão pré-selecionada ao registrar recebimento (vinda da empresa parceira). */
  formaPagamentoPadraoEmpresa?: PaymentMetodo;
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

const IconDollar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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
  ocultarCustos = false,
  ocultarHonorarios = false,
  formaPagamentoPadraoEmpresa,
}: Props) {
  const confirm = useConfirm();
  const askPagador = usePagadorPrompt();
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

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`finance-${osId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_charges', filter: `os_id=eq.${osId}` }, () => carregarRef.current(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `os_id=eq.${osId}` }, () => carregarRef.current(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [osId]);

  // Auto-sync custo de placa
  useEffect(() => {
    if (loading || (charges.length === 0 && !trocaPlaca)) return;
    if (syncingPlaca.current) return;
    const placaCharge = charges.find(c => c.categoria === 'placa' && c.status !== 'cancelado');

    if (trocaPlaca && !placaCharge) {
      syncingPlaca.current = true;
      (async () => {
        try {
          const codigo = tipoVeiculo === 'moto' ? 'placa_moto_mercosul' : 'placa_carro_mercosul';
          const descricao = tipoVeiculo === 'moto' ? 'Placa Moto' : 'Placa Mercosul (par)';
          const valor = await getPriceByCodigo(codigo);
          await addCharge(osId, descricao, 'placa', valor);
          if (tipoServico && onValorServicoChange) {
            const novoValor = await getServicePrice(tipoServico, tipoVeiculo, true);
            if (novoValor > 0) onValorServicoChange(novoValor);
          }
          await carregar(true);
        } catch (err) {
          console.error('Erro ao sincronizar cobrança de placa:', err);
        } finally {
          syncingPlaca.current = false;
        }
      })();
    } else if (!trocaPlaca && placaCharge && placaCharge.status === 'a_pagar') {
      syncingPlaca.current = true;
      (async () => {
        try {
          await deleteCharge(placaCharge.id);
          if (tipoServico && onValorServicoChange) {
            const novoValor = await getServicePrice(tipoServico, tipoVeiculo, false);
            if (novoValor > 0) onValorServicoChange(novoValor);
          }
          await carregar(true);
        } catch (err) {
          console.error('Erro ao remover cobrança de placa:', err);
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
    const pagoPor = await askPagador({
      title: 'Quem pagou esta taxa?',
      message: 'Selecione quem fisicamente pagou no banco/Detran.',
      allowSkip: true,
    });
    if (pagoPor === null) return; // cancelado
    setCharges(prev =>
      prev.map(c =>
        c.id === chargeId
          ? { ...c, status: 'pago' as FinanceCharge['status'], valor_pago: c.valor_previsto, pago_por: pagoPor || undefined }
          : c,
      ),
    );
    try {
      await marcarCustoPago(chargeId, { confirmadoPor: usuario?.nome ?? null, pagoPor: pagoPor || null });
      await carregar(true);
      setMensagem({ tipo: 'sucesso', texto: pagoPor ? `Custo pago por ${pagoPor}.` : 'Custo marcado como pago.' });
    } catch (err) {
      console.error(err);
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
      setMensagem({ tipo: 'erro', texto: 'Voce so pode apagar recebimentos que voce mesmo registrou.' });
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
  const custosPagos = charges.filter(c => c.status === 'pago').length;
  const custosPendentes = charges.filter(c => c.status === 'a_pagar').length;

  const inputStyle: React.CSSProperties = {
    fontSize: 13,
    padding: '6px 10px',
    borderRadius: 7,
    border: '1.5px solid var(--notion-blue)',
    background: 'var(--bg-surface)',
    color: 'var(--notion-text)',
    outline: 'none',
    boxSizing: 'border-box',
  };

  // =====================================================
  // RENDER — Checklist-style layout
  // =====================================================
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>

      {/* ---- toast feedback ---- */}
      {mensagem && (
        <div className={`finance-feedback ${mensagem.tipo === 'sucesso' ? 'finance-feedback-success' : 'finance-feedback-error'}`}>
          <span style={{ fontSize: 15 }}>{mensagem.tipo === 'sucesso' ? '\u2713' : '!'}</span>
          {mensagem.texto}
        </div>
      )}

      {/* ===== BANNER HEADER UNIFICADO ===== */}
      {(() => {
        const FLBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--notion-text-secondary)', marginBottom: 2 };
        const bannerColor = isQuitado ? 'var(--notion-green)' : faltaReceber > 0 ? '#ef4444' : 'var(--notion-orange)';
        const bannerBg = isQuitado ? 'rgba(16,185,129,0.06)' : faltaReceber > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.04)';
        const bannerBorder = isQuitado ? 'rgba(16,185,129,0.18)' : faltaReceber > 0 ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.18)';
        const statusLabel = isQuitado ? 'QUITADO' : faltaReceber > 0 ? 'DEVENDO' : 'EM DIA';
        return (
          <div style={{
            borderRadius: 10,
            background: bannerBg, border: `1px solid ${bannerBorder}`,
            overflow: 'hidden',
          }}>
            {/* Row 1: Status + Métricas + Ações */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', flexWrap: 'wrap', gap: 12,
            }}>
              {/* Left: icon + title + status + progress */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: bannerColor + '18',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: bannerColor,
                }}>
                  <IconDollar />
                </div>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--notion-text)' }}>
                    Financeiro
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: bannerColor }}>
                      {statusLabel}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--notion-text-secondary)', fontWeight: 500 }}>
                      · {Math.round(progressoPct)}% recebido
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ width: 100, height: 5, borderRadius: 3, background: 'rgba(128,128,128,0.12)', overflow: 'hidden', marginLeft: 6 }}>
                  <div style={{
                    height: '100%', borderRadius: 3, width: `${progressoPct}%`,
                    background: bannerColor, transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>

              {/* Right: key numbers + action */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
                {/* Serviço — clicável para editar */}
                <div style={{ textAlign: 'center' }}>
                  <span style={FLBL}>Servico</span>
                  {editandoValor ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--notion-text-secondary)' }}>R$</span>
                      <input
                        autoFocus type="text" inputMode="numeric"
                        value={valorTemp}
                        onChange={e => setValorTemp(maskMoney(e.target.value))}
                        onBlur={salvarValorServico}
                        onKeyDown={e => { if (e.key === 'Enter') salvarValorServico(); if (e.key === 'Escape') setEditandoValor(false); }}
                        style={{ ...inputStyle, fontSize: 13, fontWeight: 700, width: 90, textAlign: 'right', padding: '2px 6px' }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{ fontSize: 16, fontWeight: 800, color: 'var(--notion-blue)', cursor: !readOnly && onValorServicoChange ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                      onClick={() => {
                        if (!readOnly && onValorServicoChange) {
                          setValorTemp(maskMoney((isNaN(valorServico) ? 0 : valorServico).toFixed(2).replace('.', '')));
                          setEditandoValor(true);
                        }
                      }}
                      title={!readOnly && onValorServicoChange ? 'Clique para editar' : undefined}
                    >
                      {descontoValor > 0 && <span style={{ textDecoration: 'line-through', opacity: 0.4, fontSize: 12, marginRight: 4 }}>{fmt(valorServico)}</span>}
                      {fmt(valorServicoEfetivo)}
                      {!readOnly && onValorServicoChange && <span style={{ fontSize: 10, opacity: 0.4, marginLeft: 3 }}>✎</span>}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={FLBL}>Recebido</span>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--notion-green)' }}>{fmt(totalRecebido)}</div>
                </div>
                {faltaReceber > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <span style={FLBL}>Falta</span>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444' }}>{fmt(faltaReceber)}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Desconto destacado + Previsão */}
            {(!isQuitado || descontoValor > 0) && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                padding: '10px 16px',
                borderTop: `1px solid ${bannerBorder}`,
              }}>
                {/* Desconto — grande e clicável */}
                {editandoDesconto ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--notion-text-secondary)' }}>Desconto R$</span>
                    <input
                      autoFocus type="text" inputMode="numeric"
                      value={descontoTemp}
                      onChange={e => setDescontoTemp(maskMoney(e.target.value))}
                      onBlur={salvarDesconto}
                      onKeyDown={e => { if (e.key === 'Enter') salvarDesconto(); if (e.key === 'Escape') setEditandoDesconto(false); }}
                      style={{ ...inputStyle, fontSize: 14, fontWeight: 700, width: 110, textAlign: 'right', padding: '5px 10px' }}
                    />
                    <Btn variant="success" small onClick={salvarDesconto}><IconSave /></Btn>
                  </div>
                ) : (
                  !readOnly && (
                    <span
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
                        fontSize: 14, fontWeight: 700,
                        background: descontoValor > 0 ? 'rgba(22,163,74,0.1)' : 'rgba(128,128,128,0.06)',
                        border: descontoValor > 0 ? '1.5px solid rgba(22,163,74,0.25)' : '1.5px dashed var(--notion-border)',
                        color: descontoValor > 0 ? 'var(--notion-green)' : 'var(--notion-text-secondary)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onClick={() => { setDescontoTemp(desconto || '0,00'); setEditandoDesconto(true); }}
                    >
                      {descontoValor > 0 ? `Desconto: -${fmt(descontoValor)}` : '+ Adicionar desconto'}
                    </span>
                  )
                )}

                {/* Data prevista */}
                {!isQuitado && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <IconCalendar />
                    <span style={{ fontSize: 13, color: 'var(--notion-text-secondary)', fontWeight: 600 }}>Previsao:</span>
                    {!readOnly ? (
                      <input
                        type="date" value={dataPrevista}
                        onChange={e => salvarDataPrevista(e.target.value)}
                        style={{
                          fontSize: 13, fontWeight: 600, border: '1.5px solid var(--notion-border)',
                          borderRadius: 8, padding: '5px 10px', background: 'var(--bg-surface)',
                          color: 'var(--notion-text)', outline: 'none', cursor: 'pointer',
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--notion-text)' }}>
                        {dataPrevista ? new Date(dataPrevista + 'T00:00:00').toLocaleDateString('pt-BR') : 'Nao definida'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ===== RECEBIMENTOS ===== */}
      <div style={{ borderRadius: 10, border: '1px solid var(--notion-border)', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
          borderBottom: payments.length > 0 ? '1px solid var(--notion-border)' : 'none',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--notion-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Recebimentos
          </span>
          {payments.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              padding: '2px 8px', borderRadius: 20,
              background: 'var(--notion-bg-alt)', color: 'var(--notion-text-secondary)',
            }}>
              {payments.length}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {!readOnly && (
            <button
              onClick={() => setShowRecebimento(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
                padding: '7px 14px', borderRadius: 8,
                background: 'var(--notion-green)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                letterSpacing: '0.01em',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit',
                boxShadow: '0 1px 3px rgba(16,185,129,0.3)',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              <IconPlus /> Registrar Pagamento
            </button>
          )}
        </div>

        {payments.length === 0 ? (
          <div style={{ padding: '16px 12px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--notion-text-secondary)', fontStyle: 'italic' }}>
              Nenhum recebimento registrado.
            </p>
          </div>
        ) : (
          payments.map((p, idx) => (
            <div key={p.id} style={{ borderBottom: idx < payments.length - 1 ? '1px solid var(--notion-border)' : 'none' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(128,128,128,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Status dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--notion-green)',
                }} />

                {/* Date */}
                <span style={{
                  fontSize: 13, fontWeight: 600, color: 'var(--notion-text-secondary)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {new Date(p.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>

                {/* Value */}
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--notion-green)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {fmt(p.valor)}
                </span>

                {/* Method badge */}
                <span className="finance-metodo-badge">
                  {PAYMENT_METODO_LABELS[p.metodo as keyof typeof PAYMENT_METODO_LABELS] ?? p.metodo}
                </span>

                {/* Recebido por */}
                {p.recebido_por && (
                  <span style={{ fontSize: 12, color: 'var(--notion-text-secondary)', whiteSpace: 'nowrap' }}>
                    por {p.recebido_por}
                  </span>
                )}

                <div style={{ flex: 1 }} />

                {/* Actions */}
                {!readOnly && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, opacity: 0.6, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                  >
                    <button
                      onClick={() => setEditandoPagamento(p)} title="Editar recebimento"
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--notion-blue)', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <IconEdit />
                    </button>
                    <button
                      onClick={() => handleRemoverPagamento(p.id)} title="Remover recebimento"
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--notion-text-secondary)', transition: 'background 0.15s, color 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = 'var(--notion-orange)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-secondary)'; }}
                    >
                      <IconTrash />
                    </button>
                  </div>
                )}
              </div>

              {/* Observacao sub-row */}
              {p.observacao && (
                <div style={{ padding: '0 16px 8px 32px' }}>
                  <span style={{ fontSize: 12, color: 'var(--notion-text-secondary)', fontStyle: 'italic' }}>
                    {p.observacao}
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Barra VALOR removida — info absorvida pelo banner e footer de custos */}

      {/* ===== CUSTOS LIST (admin only, checklist-style rows) ===== */}
      {isAdmin && !ocultarCustos && (
        <div style={{ borderRadius: 10, border: '1px solid var(--notion-border)', overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', padding: '10px 16px',
            borderBottom: charges.length > 0 ? '1px solid var(--notion-border)' : 'none',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--notion-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
              Custos
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {charges.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--notion-text-secondary)', opacity: 0.6 }}>
                  {custosPagos}/{charges.length} pagos
                </span>
              )}
              {!readOnly && (
                <button
                  onClick={() => setShowCustoExtra(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 12, fontWeight: 600,
                    color: 'var(--notion-blue)', background: 'none', border: 'none',
                    cursor: 'pointer', padding: 0, opacity: 0.7, transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
                >
                  <IconPlus /> Custo extra
                </button>
              )}
            </div>
          </div>

          {charges.length === 0 ? (
            <div style={{ padding: '16px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--notion-text-secondary)', fontStyle: 'italic' }}>
                Nenhum custo registrado.
              </p>
            </div>
          ) : (
            charges.map((c, idx) => {
              const statusInfo = {
                pago: { color: 'var(--notion-green)', bg: 'rgba(22,163,74,0.12)', label: 'Pago' },
                a_pagar: { color: 'var(--notion-orange)', bg: 'rgba(245,158,11,0.12)', label: 'Pendente' },
                cancelado: { color: 'var(--notion-text-secondary)', bg: 'rgba(107,114,128,0.12)', label: 'Cancelado' },
              }[c.status] ?? { color: 'var(--notion-orange)', bg: 'rgba(245,158,11,0.12)', label: 'Pendente' };

              return (
                <div key={c.id} style={{ borderBottom: idx < charges.length - 1 ? '1px solid var(--notion-border)' : 'none' }}>
                  {editandoCusto === c.id ? (
                    <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        value={custoDescTemp} onChange={e => setCustoDescTemp(e.target.value)}
                        placeholder="Descricao"
                        style={{ ...inputStyle, flex: 1, minWidth: 120, fontSize: 12, padding: '4px 8px' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 13, color: 'var(--notion-text-secondary)' }}>R$</span>
                        <input
                          type="text" inputMode="numeric"
                          value={custoValorTemp} onChange={e => setCustoValorTemp(maskMoney(e.target.value))}
                          placeholder="0,00"
                          style={{ ...inputStyle, width: 80, textAlign: 'right', fontSize: 12, padding: '4px 8px' }}
                        />
                      </div>
                      <Btn variant="success" small onClick={salvarEdicaoCusto}><IconSave /></Btn>
                      <Btn variant="ghost" small onClick={() => setEditandoCusto(null)}>&times;</Btn>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(128,128,128,0.03)'; const a = e.currentTarget.querySelector('.finance-row-actions') as HTMLElement; if (a) a.style.opacity = '1'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; const a = e.currentTarget.querySelector('.finance-row-actions') as HTMLElement; if (a) a.style.opacity = '0'; }}
                    >
                      {/* Status dot */}
                      <div style={{
                        width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                        background: statusInfo.color,
                        boxShadow: `0 0 4px ${statusInfo.color}44`,
                      }} />

                      {/* Name */}
                      <span style={{
                        flex: 1, fontSize: 12.5, fontWeight: 600, minWidth: 0,
                        color: c.status === 'cancelado' ? 'var(--notion-text-secondary)' : 'var(--notion-text)',
                        textDecoration: c.status === 'cancelado' ? 'line-through' : 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {c.descricao}
                      </span>

                      {/* Value */}
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--notion-text)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {fmt(c.valor_previsto)}
                      </span>

                      {/* Status badge */}
                      <span style={{
                        fontSize: 12, fontWeight: 800, color: statusInfo.color,
                        background: statusInfo.bg, padding: '2px 6px', borderRadius: 99,
                        textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
                        border: `1px solid ${statusInfo.color}22`, minWidth: 44, textAlign: 'center',
                      }}>
                        {statusInfo.label}
                      </span>

                      {/* Actions — visíveis no hover da linha */}
                      {!readOnly && (
                        <div className="finance-row-actions" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, opacity: 0, transition: 'opacity 0.15s' }}>
                          {c.status === 'a_pagar' && (
                            <button
                              onClick={() => handlePagarCusto(c.id)} title="Marcar como pago"
                              style={{
                                height: 26, padding: '0 8px', borderRadius: 6,
                                background: 'rgba(22,163,74,0.1)', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 4,
                                fontSize: 12, fontWeight: 700, color: 'var(--notion-green)',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(22,163,74,0.2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(22,163,74,0.1)'}
                            >
                              <IconCheck /> Pagar
                            </button>
                          )}
                          {c.status === 'pago' && (
                            <button
                              onClick={() => handleDesfazerPagoCusto(c.id)} title="Desfazer pagamento"
                              style={{
                                width: 28, height: 28, borderRadius: 6,
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--notion-orange)', transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <IconUndo />
                            </button>
                          )}
                          <button
                            onClick={() => iniciarEdicaoCusto(c)} title="Editar custo"
                            style={{
                              width: 28, height: 28, borderRadius: 6,
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'var(--notion-blue)', transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <IconEdit />
                          </button>
                          <button
                            onClick={() => handleRemoverCusto(c.id)} title="Remover custo"
                            style={{
                              width: 28, height: 28, borderRadius: 6,
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'var(--notion-text-secondary)', transition: 'background 0.15s, color 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = 'var(--notion-orange)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-secondary)'; }}
                          >
                            <IconTrash />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Footer */}
          {charges.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
              borderTop: '1px solid var(--notion-border)',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--notion-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--notion-text)' }}>
                {fmt(totalCustos)}
              </span>
              <div style={{ flex: 1 }} />
              {!ocultarHonorarios && (
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: honorario >= 0 ? 'var(--notion-green)' : 'var(--notion-orange)',
                }}>
                  Honorario: {fmt(honorario)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- modais ---- */}
      {(showRecebimento || editandoPagamento) && resumo && (
        <RecebimentoModal
          osId={osId}
          saldoRestante={resumo.faltaReceber}
          editPayment={editandoPagamento ?? undefined}
          formaPagamentoPadrao={formaPagamentoPadraoEmpresa}
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

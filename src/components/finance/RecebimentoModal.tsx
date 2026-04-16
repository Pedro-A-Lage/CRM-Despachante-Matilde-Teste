import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { addPayment, updatePayment } from '../../lib/financeService';
import type { Payment, PaymentMetodo } from '../../types/finance';
import { PAYMENT_METODO_LABELS } from '../../types/finance';
import { useAuth } from '../../contexts/AuthContext';

function maskMoney(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '') || '0';
  const padded = digits.padStart(3, '0');
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted},${decPart}`;
}
function unmaskMoney(masked: string): number {
  return parseFloat(masked.replace(/\./g, '').replace(',', '.')) || 0;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  osId: string;
  saldoRestante: number;
  onClose: () => void;
  onSaved: () => void;
  editPayment?: Payment;
  /** Método pré-selecionado em novos recebimentos (ex.: forma padrão da empresa parceira). */
  formaPagamentoPadrao?: PaymentMetodo;
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--notion-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
  display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1.5px solid var(--notion-border)',
  borderRadius: 10,
  padding: '10px 14px',
  fontSize: 15,
  background: 'var(--bg-surface)',
  color: 'var(--notion-text)',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
};

const METODOS_ICONS: Record<PaymentMetodo, string> = {
  pix: '⚡',
  boleto: '📄',
  cartao: '💳',
  dinheiro: '💵',
  ted: '🏦',
  outro: '📋',
};

export default function RecebimentoModal({ osId, saldoRestante, onClose, onSaved, editPayment, formaPagamentoPadrao }: Props) {
  const { usuario } = useAuth();
  const isEdit = !!editPayment;

  const [valor, setValor] = useState(
    isEdit
      ? maskMoney(String(Math.round(editPayment.valor * 100)))
      : maskMoney(String(Math.round(saldoRestante * 100)))
  );
  const [data, setData] = useState(
    isEdit ? editPayment.data_pagamento : new Date().toISOString().slice(0, 10)
  );
  const [metodo, setMetodo] = useState<PaymentMetodo>(
    isEdit ? editPayment.metodo : (formaPagamentoPadrao ?? 'pix')
  );
  const [observacao, setObservacao] = useState(
    isEdit ? (editPayment.observacao ?? '') : ''
  );
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const nomeUsuario = usuario?.nome ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      if (isEdit) {
        await updatePayment(editPayment.id, {
          data_pagamento: data,
          valor: unmaskMoney(valor),
          metodo,
          observacao: observacao || undefined,
        });
      } else {
        const payment = await addPayment(
          osId,
          data,
          unmaskMoney(valor),
          metodo,
          undefined,
          observacao || undefined,
          nomeUsuario || undefined,
        );
        if (!payment) throw new Error('Falha ao salvar pagamento');
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setErro(isEdit
        ? 'Não foi possível atualizar o recebimento. Tente novamente.'
        : 'Não foi possível registrar o recebimento. Tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--notion-surface)',
          color: 'var(--notion-text)',
          borderRadius: 16,
          boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
          width: '100%',
          maxWidth: 480,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--notion-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--notion-text)', margin: 0 }}>
              {isEdit ? 'Editar Recebimento' : 'Registrar Recebimento'}
            </h3>
            {!isEdit && (
              <p style={{ fontSize: 12, color: 'var(--notion-text-secondary)', marginTop: 4 }}>
                Saldo restante: <span style={{ fontWeight: 700, color: 'var(--notion-blue)' }}>{fmt(saldoRestante)}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: 'none', background: 'rgba(128,128,128,0.1)',
              color: 'var(--notion-text-secondary)', cursor: 'pointer',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px' }}>
          {/* Valor e Data lado a lado */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Valor (R$) *</label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 14, fontWeight: 600, color: 'var(--notion-text-secondary)',
                }}>
                  R$
                </span>
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  value={valor}
                  onChange={e => setValor(maskMoney(e.target.value))}
                  style={{ ...inputStyle, paddingLeft: 40, fontSize: 18, fontWeight: 700, textAlign: 'right' }}
                />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Data *</label>
              <input
                required
                type="date"
                value={data}
                onChange={e => setData(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Recebido por — automático, somente leitura */}
          {!isEdit && nomeUsuario && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Recebido por</label>
              <div style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(128,128,128,0.06)',
                border: '1.5px solid var(--notion-border)',
                fontSize: 15,
                color: 'var(--notion-text)',
                fontWeight: 500,
              }}>
                {nomeUsuario}
              </div>
            </div>
          )}

          {/* Método de pagamento - botões visuais */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Método de Pagamento *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {(Object.keys(PAYMENT_METODO_LABELS) as PaymentMetodo[]).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMetodo(k)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    border: metodo === k ? '2px solid var(--notion-blue)' : '1.5px solid var(--notion-border)',
                    background: metodo === k ? 'rgba(59,130,246,0.08)' : 'var(--bg-surface)',
                    color: metodo === k ? 'var(--notion-blue)' : 'var(--notion-text-secondary)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: metodo === k ? 700 : 500,
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 15 }}>{METODOS_ICONS[k]}</span>
                  {PAYMENT_METODO_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Observação</label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Observação opcional..."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Erro */}
          {erro && (
            <div style={{
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 13,
              background: 'rgba(220,38,38,0.08)',
              color: 'var(--notion-orange)',
              border: '1px solid rgba(220,38,38,0.3)',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>!</span>
              {erro}
            </div>
          )}

          {/* Botões */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px 16px',
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 10,
                border: '1.5px solid var(--notion-border)',
                background: 'transparent',
                color: 'var(--notion-text-secondary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 2,
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 10,
                border: 'none',
                background: 'var(--notion-blue)',
                color: 'var(--notion-bg)',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontFamily: 'inherit',
                transition: 'opacity 0.15s',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {loading ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Confirmar Recebimento'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    portalTarget,
  );
}

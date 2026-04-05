import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { addCharge } from '../../lib/financeService';

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

interface Props {
  osId: string;
  onClose: () => void;
  onSaved: () => void;
}

const inputStyle: React.CSSProperties = {
  marginTop: 4,
  width: '100%',
  border: '1px solid var(--border-color)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
  background: 'var(--bg-surface)',
  color: 'var(--color-text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
};

export default function CustoAdicionalModal({ osId, onClose, onSaved }: Props) {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      await addCharge(osId, descricao, 'outro', unmaskMoney(valor));
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setErro('Não foi possível adicionar o custo. Tente novamente.');
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
        background: 'rgba(0,0,0,0.5)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          color: 'var(--color-text-primary)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
          width: '100%',
          maxWidth: 400,
          padding: 24,
        }}
      >
        <h3
          style={{
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 16,
            color: 'var(--color-text-primary)',
          }}
        >
          Adicionar Custo Extra
        </h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
              Descrição *
            </label>
            <input
              required
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Taxa extra, Correio, etc."
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
              Valor (R$) *
            </label>
            <input
              required
              type="text"
              inputMode="numeric"
              placeholder="0,00"
              value={valor}
              onChange={e => setValor(maskMoney(e.target.value))}
              style={inputStyle}
            />
          </div>

          {erro && (
            <div
              style={{
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                background: 'rgba(220,38,38,0.08)',
                color: 'var(--color-danger)',
                border: '1px solid var(--color-danger)',
              }}
            >
              {erro}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 20px',
                fontSize: 14,
                borderRadius: 8,
                border: 'none',
                background: 'var(--color-primary)',
                color: 'var(--color-text-on-primary, #fff)',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontWeight: 600,
              }}
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    portalTarget,
  );
}

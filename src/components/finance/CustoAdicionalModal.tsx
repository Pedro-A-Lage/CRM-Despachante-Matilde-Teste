import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { addCharge } from '../../lib/financeService';
import { supabase } from '../../lib/supabaseClient';
import type { FinanceChargeCategoria } from '../../types/finance';

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
function formatBRL(valor: number): string {
  return valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

interface Props {
  osId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface DaeOption {
  codigo: string;
  descricao: string;
  valor: number;
}

const DAES_ADICIONAIS = new Set([
  'dae_alteracao',
  'dae_alteracao_dados',
  'dae_baixa',
  'dae_baixa_impedimento',
]);

const inputStyle: React.CSSProperties = {
  marginTop: 4,
  width: '100%',
  border: '1px solid var(--notion-border)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
  background: 'var(--bg-surface)',
  color: 'var(--notion-text)',
  outline: 'none',
  fontFamily: 'inherit',
};

export default function CustoAdicionalModal({ osId, onClose, onSaved }: Props) {
  // 'outro' = custo livre. Outros valores = código da DAE escolhida na price_table.
  const [tipoCusto, setTipoCusto] = useState<string>('outro');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [daeOptions, setDaeOptions] = useState<DaeOption[]>([]);

  // Carrega DAEs disponíveis da price_table
  useEffect(() => {
    let cancelled = false;
    async function loadDaes() {
      const { data } = await supabase
        .from('price_table')
        .select('codigo, descricao, valor')
        .like('codigo', 'dae_%')
        .eq('ativo', true)
        .order('descricao');
      if (cancelled) return;
      const opts = (data ?? []).map((r: any) => ({
        codigo: r.codigo,
        descricao: r.descricao,
        valor: Number(r.valor),
      }));
      setDaeOptions(opts);
    }
    loadDaes();
    return () => { cancelled = true; };
  }, []);

  // Quando o usuário escolhe uma DAE, preenche descrição e valor automaticamente
  // (mas continua editável).
  const handleTipoChange = (codigo: string) => {
    setTipoCusto(codigo);
    if (codigo === 'outro') {
      setDescricao('');
      setValor('');
      return;
    }
    const dae = daeOptions.find(d => d.codigo === codigo);
    if (dae) {
      setDescricao(dae.descricao);
      setValor(formatBRL(dae.valor));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      let categoria: FinanceChargeCategoria = 'outro';
      if (tipoCusto !== 'outro') {
        categoria = DAES_ADICIONAIS.has(tipoCusto) ? 'dae_adicional' : 'dae_principal';
      }
      await addCharge(osId, descricao, categoria, unmaskMoney(valor));
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
          color: 'var(--notion-text)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
          width: '100%',
          maxWidth: 420,
          padding: 24,
        }}
      >
        <h3
          style={{
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 16,
            color: 'var(--notion-text)',
          }}
        >
          Adicionar Custo
        </h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--notion-text-secondary)' }}>
              Tipo *
            </label>
            <select
              value={tipoCusto}
              onChange={e => handleTipoChange(e.target.value)}
              style={inputStyle}
            >
              <option value="outro">Outro (custo livre)</option>
              {daeOptions.length > 0 && (
                <optgroup label="DAEs">
                  {daeOptions.map(d => (
                    <option key={d.codigo} value={d.codigo}>
                      {d.descricao} — R$ {formatBRL(d.valor)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {tipoCusto !== 'outro' && (
              <p style={{ fontSize: 11, color: 'var(--notion-text-secondary)', marginTop: 4 }}>
                Descrição e valor já vieram da tabela de preços — pode editar antes de salvar.
              </p>
            )}
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--notion-text-secondary)' }}>
              Descrição *
            </label>
            <input
              required
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder={tipoCusto === 'outro' ? 'Ex: Taxa extra, Correio, etc.' : ''}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--notion-text-secondary)' }}>
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
                color: 'var(--notion-orange)',
                border: '1px solid var(--notion-orange)',
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
                border: '1px solid var(--notion-border)',
                background: 'transparent',
                color: 'var(--notion-text-secondary)',
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
                background: 'var(--notion-blue)',
                color: 'var(--notion-bg)',
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

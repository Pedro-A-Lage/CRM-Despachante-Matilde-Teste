// src/pages/ControlePlacas.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Car,
  Bike,
  Plus,
  Edit2,
  Trash2,
  Settings,
  X,
  Check,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { useConfirm } from '../components/ConfirmProvider';
import {
  getFabricas,
  getFabricasAtivas,
  getPedidosByFabrica,
  getSaldoFabrica,
  savePedido,
  updatePedido,
  deletePedido,
  saveFabrica,
  updateFabrica,
} from '../lib/placaService';
import type { FabricaPlacas, PedidoPlaca } from '../types/placa';
import { getEmpresasAtivas } from '../lib/empresaService';
import type { EmpresaParceira } from '../types/empresa';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!;
}

function maskMoney(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '') || '0';
  const padded = digits.padStart(3, '0');
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted},${decPart}`;
}

function parseBRL(value: string): number {
  if (!value) return 0;
  return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
}

// ── FabricaConfigModal ────────────────────────────────────────────────────────

interface FabricaConfigModalProps {
  fabricas: FabricaPlacas[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

interface FabricaEditState {
  nome: string;
  custoCarro: string;
  custoMoto: string;
  valorBoletoEmpresa: string;
  ativo: boolean;
}

function FabricaConfigModal({ fabricas, onClose, onSaved }: FabricaConfigModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<FabricaEditState>({
    nome: '',
    custoCarro: '',
    custoMoto: '',
    valorBoletoEmpresa: '',
    ativo: true,
  });
  const [addingNew, setAddingNew] = useState(false);
  const [newState, setNewState] = useState<FabricaEditState>({
    nome: '',
    custoCarro: '',
    custoMoto: '',
    valorBoletoEmpresa: '',
    ativo: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(f: FabricaPlacas) {
    setEditingId(f.id);
    setEditState({
      nome: f.nome,
      custoCarro: maskMoney(String(Math.round(f.custoCarro * 100))),
      custoMoto: maskMoney(String(Math.round(f.custoMoto * 100))),
      valorBoletoEmpresa: maskMoney(String(Math.round(f.valorBoletoEmpresa * 100))),
      ativo: f.ativo,
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function saveEdit(f: FabricaPlacas) {
    setSaving(true);
    setError(null);
    try {
      await updateFabrica(f.id, {
        nome: editState.nome.trim(),
        custoCarro: parseBRL(editState.custoCarro),
        custoMoto: parseBRL(editState.custoMoto),
        valorBoletoEmpresa: parseBRL(editState.valorBoletoEmpresa),
        ativo: editState.ativo,
      });
      await onSaved();
      setEditingId(null);
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function saveNew() {
    if (!newState.nome.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    setError(null);
    try {
      await saveFabrica({
        nome: newState.nome.trim(),
        custoCarro: parseBRL(newState.custoCarro),
        custoMoto: parseBRL(newState.custoMoto),
        valorBoletoEmpresa: parseBRL(newState.valorBoletoEmpresa),
        ativo: newState.ativo,
      });
      await onSaved();
      setAddingNew(false);
      setNewState({ nome: '', custoCarro: '', custoMoto: '', valorBoletoEmpresa: '', ativo: true });
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    padding: '4px 8px',
    color: 'var(--color-text-primary)',
    fontSize: 13,
    width: '100%',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          width: '100%',
          maxWidth: 700,
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--color-text-primary)' }}>Configurar Fábricas</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#DC2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 130px 70px 80px', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border-color)', fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
          <span>Nome</span>
          <span>Custo Carro</span>
          <span>Custo Moto</span>
          <span>Boleto Empresa</span>
          <span>Ativo</span>
          <span></span>
        </div>

        {/* Rows */}
        {fabricas.map((f) => (
          <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 130px 70px 80px', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
            {editingId === f.id ? (
              <>
                <input value={editState.nome} onChange={(e) => setEditState({ ...editState, nome: e.target.value })} style={inputStyle} placeholder="Nome" />
                <input value={editState.custoCarro} onChange={(e) => setEditState({ ...editState, custoCarro: maskMoney(e.target.value) })} style={inputStyle} placeholder="0,00" />
                <input value={editState.custoMoto} onChange={(e) => setEditState({ ...editState, custoMoto: maskMoney(e.target.value) })} style={inputStyle} placeholder="0,00" />
                <input value={editState.valorBoletoEmpresa} onChange={(e) => setEditState({ ...editState, valorBoletoEmpresa: maskMoney(e.target.value) })} style={inputStyle} placeholder="0,00" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13, color: 'var(--color-text-primary)' }}>
                  <input type="checkbox" checked={editState.ativo} onChange={(e) => setEditState({ ...editState, ativo: e.target.checked })} />
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => saveEdit(f)} disabled={saving} style={{ background: '#10B981', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#fff' }}>
                    <Check size={14} />
                  </button>
                  <button onClick={cancelEdit} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                    <X size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <span style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>{f.nome}</span>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{fmt(f.custoCarro)}</span>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{fmt(f.custoMoto)}</span>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{fmt(f.valorBoletoEmpresa)}</span>
                <span style={{ fontSize: 13, color: f.ativo ? '#10B981' : '#6B7280' }}>{f.ativo ? 'Sim' : 'Não'}</span>
                <button onClick={() => startEdit(f)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <Edit2 size={13} /> Editar
                </button>
              </>
            )}
          </div>
        ))}

        {/* New fabrica row */}
        {addingNew ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 130px 70px 80px', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
            <input value={newState.nome} onChange={(e) => setNewState({ ...newState, nome: e.target.value })} style={inputStyle} placeholder="Nome da fábrica" autoFocus />
            <input value={newState.custoCarro} onChange={(e) => setNewState({ ...newState, custoCarro: maskMoney(e.target.value) })} style={inputStyle} placeholder="0,00" />
            <input value={newState.custoMoto} onChange={(e) => setNewState({ ...newState, custoMoto: maskMoney(e.target.value) })} style={inputStyle} placeholder="0,00" />
            <input value={newState.valorBoletoEmpresa} onChange={(e) => setNewState({ ...newState, valorBoletoEmpresa: maskMoney(e.target.value) })} style={inputStyle} placeholder="0,00" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13, color: 'var(--color-text-primary)' }}>
              <input type="checkbox" checked={newState.ativo} onChange={(e) => setNewState({ ...newState, ativo: e.target.checked })} />
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={saveNew} disabled={saving} style={{ background: '#10B981', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#fff' }}>
                <Check size={14} />
              </button>
              <button onClick={() => { setAddingNew(false); setError(null); }} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setAddingNew(true); setError(null); }}
            style={{ marginTop: 12, background: 'none', border: '1px dashed var(--border-color)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} /> Nova Fábrica
          </button>
        )}
      </div>
    </div>
  );
}

// ── PedidoModal ───────────────────────────────────────────────────────────────

interface PedidoModalProps {
  pedido: PedidoPlaca | null;
  fabrica: FabricaPlacas;
  saldo: number;
  empresas: EmpresaParceira[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

interface PedidoForm {
  tipoVeiculo: 'carro' | 'moto';
  empresaParceiraId: string; // '' = particular
  custoReal: string;
  valorBoleto: string;
  saldoUsado: string;
  dataPedido: string;
  observacao: string;
}

function calcularValoresParcicular(custoReal: number, saldo: number): { valorBoleto: number; saldoUsado: number } {
  if (saldo >= custoReal) {
    return { valorBoleto: 0, saldoUsado: custoReal };
  } else if (saldo > 0) {
    return { valorBoleto: custoReal - saldo, saldoUsado: saldo };
  } else {
    return { valorBoleto: custoReal, saldoUsado: 0 };
  }
}

function PedidoModal({ pedido, fabrica, saldo, empresas, onClose, onSaved }: PedidoModalProps) {
  const isEdit = pedido !== null;

  const initForm = (): PedidoForm => {
    if (isEdit && pedido) {
      return {
        tipoVeiculo: pedido.tipoVeiculo,
        empresaParceiraId: pedido.empresaParceiraId ?? '',
        custoReal: maskMoney(String(Math.round(pedido.custoReal * 100))),
        valorBoleto: maskMoney(String(Math.round(pedido.valorBoleto * 100))),
        saldoUsado: maskMoney(String(Math.round(pedido.saldoUsado * 100))),
        dataPedido: pedido.dataPedido,
        observacao: pedido.observacao ?? '',
      };
    }
    const custoReal = fabrica.custoCarro;
    const { valorBoleto, saldoUsado } = calcularValoresParcicular(custoReal, saldo);
    return {
      tipoVeiculo: 'carro',
      empresaParceiraId: '',
      custoReal: maskMoney(String(Math.round(custoReal * 100))),
      valorBoleto: maskMoney(String(Math.round(valorBoleto * 100))),
      saldoUsado: maskMoney(String(Math.round(saldoUsado * 100))),
      dataPedido: todayStr(),
      observacao: '',
    };
  };

  const [form, setForm] = useState<PedidoForm>(initForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function autoFillValues(tipo: 'carro' | 'moto', empresaId: string, custoOverride?: string) {
    const custoReal = custoOverride !== undefined ? parseBRL(custoOverride) : (tipo === 'carro' ? fabrica.custoCarro : fabrica.custoMoto);
    let valorBoleto: number;
    let saldoUsado: number;

    if (empresaId) {
      valorBoleto = fabrica.valorBoletoEmpresa;
      saldoUsado = 0;
    } else {
      const r = calcularValoresParcicular(custoReal, saldo);
      valorBoleto = r.valorBoleto;
      saldoUsado = r.saldoUsado;
    }

    return {
      custoReal: maskMoney(String(Math.round(custoReal * 100))),
      valorBoleto: maskMoney(String(Math.round(valorBoleto * 100))),
      saldoUsado: maskMoney(String(Math.round(saldoUsado * 100))),
    };
  }

  function handleTipoChange(tipo: 'carro' | 'moto') {
    if (isEdit) { setForm(f => ({ ...f, tipoVeiculo: tipo })); return; }
    const updated = autoFillValues(tipo, form.empresaParceiraId);
    setForm(f => ({ ...f, tipoVeiculo: tipo, ...updated }));
  }

  function handleEmpresaChange(empresaId: string) {
    if (isEdit) { setForm(f => ({ ...f, empresaParceiraId: empresaId })); return; }
    const updated = autoFillValues(form.tipoVeiculo, empresaId);
    setForm(f => ({ ...f, empresaParceiraId: empresaId, ...updated }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        fabricaId: fabrica.id,
        tipoVeiculo: form.tipoVeiculo,
        empresaParceiraId: form.empresaParceiraId || undefined,
        custoReal: parseBRL(form.custoReal),
        valorBoleto: parseBRL(form.valorBoleto),
        saldoUsado: parseBRL(form.saldoUsado),
        dataPedido: form.dataPedido,
        observacao: form.observacao.trim() || undefined,
      };
      if (isEdit && pedido) {
        await updatePedido(pedido.id, payload);
      } else {
        await savePedido(payload as Parameters<typeof savePedido>[0]);
      }
      await onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--color-text-primary)',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    marginBottom: 4,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const custoRealNum = parseBRL(form.custoReal);
  const showSaldoInfo = !isEdit && !form.empresaParceiraId && saldo > 0;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-primary)', borderRadius: 12, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--color-text-primary)' }}>
            {isEdit ? 'Editar Pedido' : 'Novo Pedido'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#DC2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Tipo veiculo toggle */}
        <div style={{ marginBottom: 16 }}>
          <span style={labelStyle}>Tipo de Veículo</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['carro', 'moto'] as const).map((tipo) => (
              <button
                key={tipo}
                onClick={() => handleTipoChange(tipo)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: `2px solid ${form.tipoVeiculo === tipo ? 'var(--color-primary)' : 'var(--border-color)'}`,
                  borderRadius: 8,
                  background: form.tipoVeiculo === tipo ? 'var(--color-primary)' : 'var(--bg-secondary)',
                  color: form.tipoVeiculo === tipo ? '#fff' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  transition: 'all 0.15s',
                }}
              >
                {tipo === 'carro' ? <Car size={16} /> : <Bike size={16} />}
                {tipo === 'carro' ? 'Carro' : 'Moto'}
              </button>
            ))}
          </div>
        </div>

        {/* Empresa */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Empresa Parceira</label>
          <select value={form.empresaParceiraId} onChange={(e) => handleEmpresaChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">Particular</option>
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.nome}</option>
            ))}
          </select>
        </div>

        {/* Saldo info */}
        {showSaldoInfo && (
          <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#065F46', fontSize: 13 }}>
            Saldo disponível: <strong>{fmt(saldo)}</strong>
            {saldo >= custoRealNum
              ? ' — Boleto será zerado.'
              : ` — Cobre parte do custo (boleto: ${fmt(custoRealNum - saldo)}).`}
          </div>
        )}

        {/* Valores grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Custo Real</label>
            <input
              value={form.custoReal}
              onChange={(e) => setForm(f => ({ ...f, custoReal: maskMoney(e.target.value) }))}
              style={inputStyle}
              placeholder="0,00"
            />
          </div>
          <div>
            <label style={labelStyle}>Saldo Usado</label>
            <input
              value={form.saldoUsado}
              onChange={(e) => setForm(f => ({ ...f, saldoUsado: maskMoney(e.target.value) }))}
              style={inputStyle}
              placeholder="0,00"
            />
          </div>
          <div>
            <label style={labelStyle}>Boleto</label>
            <input
              value={form.valorBoleto}
              onChange={(e) => setForm(f => ({ ...f, valorBoleto: maskMoney(e.target.value) }))}
              style={inputStyle}
              placeholder="0,00"
            />
          </div>
        </div>

        {/* Data */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Data do Pedido</label>
          <input type="date" value={form.dataPedido} onChange={(e) => setForm(f => ({ ...f, dataPedido: e.target.value }))} style={inputStyle} />
        </div>

        {/* Observacao */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Observação</label>
          <textarea
            value={form.observacao}
            onChange={(e) => setForm(f => ({ ...f, observacao: e.target.value }))}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
            placeholder="Opcional..."
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: 14 }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', border: 'none', borderRadius: 8, background: 'var(--color-primary)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ControlePlacas (main) ─────────────────────────────────────────────────────

export default function ControlePlacas() {
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [fabricas, setFabricas] = useState<FabricaPlacas[]>([]);
  const [fabricasAtivas, setFabricasAtivas] = useState<FabricaPlacas[]>([]);
  const [selectedFabricaId, setSelectedFabricaId] = useState<string>('');
  const [pedidos, setPedidos] = useState<PedidoPlaca[]>([]);
  const [saldo, setSaldo] = useState<number>(0);
  const [empresas, setEmpresas] = useState<EmpresaParceira[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showFabricaModal, setShowFabricaModal] = useState(false);
  const [showPedidoModal, setShowPedidoModal] = useState(false);
  const [editingPedido, setEditingPedido] = useState<PedidoPlaca | null>(null);

  // Filters
  const [filterEmpresa, setFilterEmpresa] = useState<string>('todas'); // 'todas' | 'particular' | empresaId
  const [filterTipo, setFilterTipo] = useState<string>('todos'); // 'todos' | 'carro' | 'moto'

  const selectedFabrica = fabricasAtivas.find(f => f.id === selectedFabricaId) ?? null;

  // Load initial data
  const loadFabricas = useCallback(async () => {
    const [all, ativas] = await Promise.all([getFabricas(), getFabricasAtivas()]);
    setFabricas(all);
    setFabricasAtivas(ativas);
    return ativas;
  }, []);

  const loadPedidos = useCallback(async (fabricaId: string) => {
    if (!fabricaId) { setPedidos([]); setSaldo(0); return; }
    const [ps, s] = await Promise.all([getPedidosByFabrica(fabricaId), getSaldoFabrica(fabricaId)]);
    setPedidos(ps);
    setSaldo(s);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [ativas, emps] = await Promise.all([
          loadFabricas().then(a => a),
          getEmpresasAtivas(),
        ]);
        setEmpresas(emps);
        if (ativas.length > 0) {
          const firstId = ativas[0].id;
          setSelectedFabricaId(firstId);
          await loadPedidos(firstId);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedFabricaId) {
      loadPedidos(selectedFabricaId);
    }
  }, [selectedFabricaId, loadPedidos]);

  async function refreshAll() {
    await loadFabricas();
    if (selectedFabricaId) await loadPedidos(selectedFabricaId);
  }

  async function handleFabricaSaved() {
    await loadFabricas();
  }

  async function handlePedidoSaved() {
    if (selectedFabricaId) await loadPedidos(selectedFabricaId);
  }

  async function handleDelete(pedido: PedidoPlaca) {
    const ok = await confirm(`Excluir pedido de ${pedido.dataPedido}? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    try {
      await deletePedido(pedido.id);
      await loadPedidos(selectedFabricaId);
    } catch (e: any) {
      alert('Erro ao excluir: ' + e.message);
    }
  }

  // Filtered pedidos (newest first from getPedidosByFabrica)
  const filteredPedidos = pedidos.filter(p => {
    if (filterEmpresa !== 'todas') {
      if (filterEmpresa === 'particular' && p.empresaParceiraId) return false;
      if (filterEmpresa !== 'particular' && p.empresaParceiraId !== filterEmpresa) return false;
    }
    if (filterTipo !== 'todos' && p.tipoVeiculo !== filterTipo) return false;
    return true;
  });

  // Calculate "saldo após" for each pedido
  // Pedidos from service come newest-first; we need to compute running total oldest→newest
  const pedidosWithSaldoApos = (() => {
    const sorted = [...filteredPedidos].reverse(); // oldest first
    let running = 0;
    const map = new Map<string, number>();
    for (const p of sorted) {
      running += p.valorBoleto - p.custoReal;
      map.set(p.id, running);
    }
    return filteredPedidos.map(p => ({ ...p, saldoApos: map.get(p.id) ?? 0 }));
  })();

  // Saldo color
  const saldoColor = saldo > 0 ? '#10B981' : saldo < 0 ? '#EF4444' : 'var(--color-text-secondary)';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-secondary)' }}>
        Carregando...
      </div>
    );
  }

  const thStyle: React.CSSProperties = {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: '1px solid var(--border-color)',
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 13,
    color: 'var(--color-text-primary)',
    borderBottom: '1px solid var(--border-color)',
    verticalAlign: 'middle',
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Controle de Placas
        </h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowFabricaModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: 14 }}
          >
            <Settings size={15} /> Fábricas
          </button>
          <button
            onClick={() => { setEditingPedido(null); setShowPedidoModal(true); }}
            disabled={!selectedFabrica}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: 'none', borderRadius: 8, background: 'var(--color-primary)', color: '#fff', cursor: selectedFabrica ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 500, opacity: selectedFabrica ? 1 : 0.6 }}
          >
            <Plus size={15} /> Novo Pedido
          </button>
        </div>
      </div>

      {/* Saldo card */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600 }}>Fábrica:</span>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedFabricaId}
              onChange={(e) => setSelectedFabricaId(e.target.value)}
              style={{ appearance: 'none', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '6px 32px 6px 12px', color: 'var(--color-text-primary)', fontSize: 14, cursor: 'pointer', minWidth: 160 }}
            >
              {fabricasAtivas.length === 0 && <option value="">Nenhuma fábrica</option>}
              {fabricasAtivas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-secondary)' }} />
          </div>
        </div>
        {selectedFabrica && (
          <>
            <div style={{ width: 1, height: 32, background: 'var(--border-color)' }} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>Saldo Atual</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: saldoColor }}>{fmt(saldo)}</div>
            </div>
            <div style={{ width: 1, height: 32, background: 'var(--border-color)' }} />
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2 }}>Custo Carro</div>
                <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{fmt(selectedFabrica.custoCarro)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2 }}>Custo Moto</div>
                <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{fmt(selectedFabrica.custoMoto)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2 }}>Boleto Empresa</div>
                <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{fmt(selectedFabrica.valorBoletoEmpresa)}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <select
            value={filterEmpresa}
            onChange={(e) => setFilterEmpresa(e.target.value)}
            style={{ appearance: 'none', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 32px 7px 12px', color: 'var(--color-text-primary)', fontSize: 13, cursor: 'pointer' }}
          >
            <option value="todas">Todas as Empresas</option>
            <option value="particular">Particular</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-secondary)' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            style={{ appearance: 'none', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 32px 7px 12px', color: 'var(--color-text-primary)', fontSize: 13, cursor: 'pointer' }}
          >
            <option value="todos">Todos os Tipos</option>
            <option value="carro">Carro</option>
            <option value="moto">Moto</option>
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-secondary)' }} />
        </div>
      </div>

      {/* Table */}
      {fabricasAtivas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-secondary)', fontSize: 14 }}>
          Nenhuma fábrica cadastrada. Clique em "Fábricas" para adicionar.
        </div>
      ) : pedidosWithSaldoApos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-secondary)', fontSize: 14 }}>
          Nenhum pedido encontrado.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={thStyle}>Data</th>
                  <th style={thStyle}>OS</th>
                  <th style={thStyle}>Empresa</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Custo Real</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Saldo Usado</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Boleto</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Saldo Após</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {pedidosWithSaldoApos.map((p) => {
                  const saldoAposColor = p.saldoApos > 0 ? '#10B981' : p.saldoApos < 0 ? '#EF4444' : 'var(--color-text-secondary)';
                  return (
                    <tr key={p.id} style={{ transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Data */}
                      <td style={tdStyle}>
                        {new Date(p.dataPedido + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </td>
                      {/* OS */}
                      <td style={tdStyle}>
                        {p.osId ? (
                          <button
                            onClick={() => navigate(`/ordens/${p.osId}`)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}
                          >
                            {p.osNumero ?? p.osId.slice(0, 6)}
                            {p.osPlaca && <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>({p.osPlaca})</span>}
                            <ExternalLink size={11} />
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      {/* Empresa */}
                      <td style={tdStyle}>
                        {p.empresaParceiraId ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 10px',
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 600,
                            background: '#EFF6FF',
                            color: '#1D4ED8',
                          }}>
                            {p.empresaNome ?? p.empresaParceiraId.slice(0, 6)}
                          </span>
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Particular</span>
                        )}
                      </td>
                      {/* Tipo */}
                      <td style={tdStyle}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                          {p.tipoVeiculo === 'carro' ? <Car size={14} /> : <Bike size={14} />}
                          {p.tipoVeiculo === 'carro' ? 'Carro' : 'Moto'}
                        </span>
                      </td>
                      {/* Custo Real */}
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(p.custoReal)}</td>
                      {/* Saldo Usado */}
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', color: p.saldoUsado > 0 ? '#10B981' : 'var(--color-text-secondary)' }}>
                        {p.saldoUsado > 0 ? fmt(p.saldoUsado) : '—'}
                      </td>
                      {/* Boleto */}
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', color: p.valorBoleto > 0 ? '#3B82F6' : 'var(--color-text-secondary)' }}>
                        {p.valorBoleto > 0 ? fmt(p.valorBoleto) : '—'}
                      </td>
                      {/* Saldo Após */}
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: saldoAposColor }}>
                        {fmt(p.saldoApos)}
                      </td>
                      {/* Ações */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            onClick={() => { setEditingPedido(p); setShowPedidoModal(true); }}
                            title="Editar"
                            style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center' }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            title="Excluir"
                            style={{ background: 'none', border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#EF4444', display: 'flex', alignItems: 'center' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FabricaConfigModal */}
      {showFabricaModal && (
        <FabricaConfigModal
          fabricas={fabricas}
          onClose={() => { setShowFabricaModal(false); refreshAll(); }}
          onSaved={handleFabricaSaved}
        />
      )}

      {/* PedidoModal */}
      {showPedidoModal && selectedFabrica && (
        <PedidoModal
          pedido={editingPedido}
          fabrica={selectedFabrica}
          saldo={saldo}
          empresas={empresas}
          onClose={() => setShowPedidoModal(false)}
          onSaved={handlePedidoSaved}
        />
      )}
    </div>
  );
}

import React, { useEffect, useState, useCallback } from 'react';
import {
  Settings, Plus, Trash2, Save, ChevronDown, ChevronUp, FileText, Edit2, X, DollarSign,
} from 'lucide-react';
import {
  getAllServiceConfigs,
  updateServiceConfig,
  createServiceConfig,
  deleteServiceConfig,
  invalidateConfigCache,
} from '../lib/configService';
import type { ServiceConfig } from '../lib/configService';
import { getServicePrices, updateServicePrice, getPriceTable, updatePriceItem } from '../lib/financeService';
import type { ServicePrice, PriceTableItem } from '../types/finance';
import { supabase } from '../lib/supabaseClient';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DraftConfig {
  nome_exibicao: string;
  documentos_pf: string[];
  documentos_pj: string[];
  dae_tipo: string | null;
  gera_vistoria: string;
  gera_placa: string;
}

interface NewServiceForm {
  tipo_servico: string;
  nome_exibicao: string;
  documentos_pf: string[];
  documentos_pj: string[];
  dae_tipo: string | null;
  gera_vistoria: string;
  gera_placa: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'Sem DAE', value: null },
  { label: 'Principal', value: 'principal' },
  { label: 'Alteração', value: 'alteracao' },
];

const VISTORIA_PLACA_OPTIONS: { label: string; value: string }[] = [
  { label: 'Nunca', value: 'nunca' },
  { label: 'Sempre', value: 'sempre' },
  { label: 'Se troca de placa', value: 'se_troca' },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  borderRadius: 12,
  padding: 24,
  marginBottom: 16,
};

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
  background: 'var(--bg-surface)',
  color: 'var(--color-text-primary)',
  width: '100%',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 8,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

const docRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface DocListEditorProps {
  label: string;
  docs: string[];
  onChange: (docs: string[]) => void;
}

function DocListEditor({ label, docs, onChange }: DocListEditorProps) {
  const handleChange = (idx: number, value: string) => {
    const next = [...docs];
    next[idx] = value;
    onChange(next);
  };

  const handleRemove = (idx: number) => {
    onChange(docs.filter((_, i) => i !== idx));
  };

  const handleAdd = () => {
    onChange([...docs, '']);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={sectionHeaderStyle}>{label}</div>
      {docs.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
          Nenhum documento configurado.
        </div>
      )}
      {docs.map((doc, idx) => (
        <div key={idx} style={docRowStyle}>
          <input
            style={inputStyle}
            value={doc}
            onChange={e => handleChange(idx, e.target.value)}
            placeholder="Nome do documento"
          />
          <button
            className="btn btn-ghost"
            style={{ padding: '6px 8px', color: 'var(--color-danger)', flexShrink: 0 }}
            onClick={() => handleRemove(idx)}
            title="Remover documento"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        className="btn btn-ghost"
        style={{ fontSize: 13, color: 'var(--color-primary)', padding: '4px 0', marginTop: 2 }}
        onClick={handleAdd}
      >
        <Plus size={14} style={{ marginRight: 4 }} />
        Adicionar documento
      </button>
    </div>
  );
}

// ── Service Card ──────────────────────────────────────────────────────────────

// ── Price helpers ─────────────────────────────────────────────────────────────

function maskMoney(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '') || '0';
  const padded = digits.padStart(3, '0');
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted},${decPart}`;
}

function unmaskMoney(masked: string): number {
  if (!masked) return 0;
  return parseFloat(masked.replace(/\./g, '').replace(',', '.')) || 0;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const moneyInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: 120,
  textAlign: 'right',
  fontFamily: 'monospace',
};

// ── Service Card ──────────────────────────────────────────────────────────────

interface ServiceCardProps {
  config: ServiceConfig;
  prices: ServicePrice[];
  onSaved: () => void;
  onDeleted: () => void;
  onDataChanged: () => void;
}

function ServiceCard({ config, prices, onSaved, onDeleted, onDataChanged }: ServiceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<DraftConfig>({
    nome_exibicao: config.nome_exibicao,
    documentos_pf: [...config.documentos_pf],
    documentos_pj: [...config.documentos_pj],
    dae_tipo: config.dae_tipo,
    gera_vistoria: config.gera_vistoria,
    gera_placa: config.gera_placa,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Preço editando
  const [editingPrice, setEditingPrice] = useState<{ id: string; valor: string } | null>(null);

  // Preços deste serviço
  const myPrices = prices.filter(p => p.tipo_servico === config.tipo_servico);
  const temPlaca = draft.gera_placa !== 'nunca';

  // Reset draft if config changes from outside (realtime)
  useEffect(() => {
    setDraft({
      nome_exibicao: config.nome_exibicao,
      documentos_pf: [...config.documentos_pf],
      documentos_pj: [...config.documentos_pj],
      dae_tipo: config.dae_tipo,
      gera_vistoria: config.gera_vistoria,
      gera_placa: config.gera_placa,
    });
  }, [config]);

  const salvarPreco = async (priceId: string) => {
    if (!editingPrice) return;
    try {
      await updateServicePrice(priceId, unmaskMoney(editingPrice.valor));
      setEditingPrice(null);
      onDataChanged();
    } catch {
      setError('Erro ao salvar preço.');
    }
  };


  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateServiceConfig(config.id, {
        nome_exibicao: draft.nome_exibicao.trim() || config.nome_exibicao,
        documentos_pf: draft.documentos_pf.map(d => d.trim()).filter(Boolean),
        documentos_pj: draft.documentos_pj.map(d => d.trim()).filter(Boolean),
        dae_tipo: draft.dae_tipo,
        gera_vistoria: draft.gera_vistoria,
        gera_placa: draft.gera_placa,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteServiceConfig(config.id);
      onDeleted();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao excluir');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const daeLabel = DAE_OPTIONS.find(o => o.value === draft.dae_tipo)?.label ?? 'Sem DAE';

  return (
    <div style={cardStyle}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
        onClick={() => { setExpanded(e => !e); setConfirmDelete(false); }}>
        <FileText size={18} color="var(--color-primary)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)' }}>
            {draft.nome_exibicao || config.nome_exibicao}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            {config.tipo_servico}
            {' · '}DAE: {daeLabel}
            {' · '}PF: {draft.documentos_pf.filter(Boolean).length} doc(s)
            {' · '}PJ: {draft.documentos_pj.filter(Boolean).length} doc(s)
          </div>
        </div>
        <div style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ marginTop: 20 }}>
          {error && (
            <div style={{
              background: 'var(--color-danger)',
              color: '#fff',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              marginBottom: 12,
            }}>
              {error}
            </div>
          )}

          {/* Nome de exibição */}
          <div style={{ marginBottom: 16 }}>
            <label style={sectionHeaderStyle}>Nome de Exibição</label>
            <input
              style={inputStyle}
              value={draft.nome_exibicao}
              onChange={e => setDraft(d => ({ ...d, nome_exibicao: e.target.value }))}
              placeholder="Nome de exibição do serviço"
            />
          </div>

          {/* Config de custos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={sectionHeaderStyle}>DAE</label>
              <select
                style={selectStyle}
                value={draft.dae_tipo ?? ''}
                onChange={e => setDraft(d => ({ ...d, dae_tipo: e.target.value === '' ? null : e.target.value }))}
              >
                {DAE_OPTIONS.map(opt => (
                  <option key={String(opt.value)} value={opt.value ?? ''}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={sectionHeaderStyle}>Vistoria</label>
              <select
                style={selectStyle}
                value={draft.gera_vistoria}
                onChange={e => setDraft(d => ({ ...d, gera_vistoria: e.target.value }))}
              >
                {VISTORIA_PLACA_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={sectionHeaderStyle}>Placa</label>
              <select
                style={selectStyle}
                value={draft.gera_placa}
                onChange={e => setDraft(d => ({ ...d, gera_placa: e.target.value }))}
              >
                {VISTORIA_PLACA_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Preços dos Serviços */}
          {myPrices.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, marginBottom: 16 }}>
              <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <DollarSign size={14} /> Preços do Serviço
              </div>
              <table style={{ width: '100%', fontSize: 14, color: 'var(--color-text-primary)', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--color-text-secondary)', fontSize: 11, textTransform: 'uppercase' }}>
                    <th style={{ textAlign: 'left', paddingBottom: 6 }}>Veículo</th>
                    {temPlaca && <th style={{ textAlign: 'center', paddingBottom: 6 }}>Com Placa</th>}
                    <th style={{ textAlign: 'right', paddingBottom: 6 }}>Valor</th>
                    <th style={{ textAlign: 'center', paddingBottom: 6, width: 80 }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {myPrices
                    .filter(p => temPlaca || !p.com_placa)
                    .sort((a, b) => {
                      if (a.tipo_veiculo !== b.tipo_veiculo) return a.tipo_veiculo === 'carro' ? -1 : 1;
                      return a.com_placa === b.com_placa ? 0 : a.com_placa ? 1 : -1;
                    })
                    .map(price => (
                      <tr key={price.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px 8px 8px 0', color: 'var(--color-text-secondary)' }}>
                          {price.tipo_veiculo === 'carro' ? '🚗 Carro' : '🏍️ Moto'}
                        </td>
                        {temPlaca && (
                          <td style={{ padding: '8px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                            {price.com_placa ? '✅ Sim' : '—'}
                          </td>
                        )}
                        <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: 'monospace' }}>
                          {editingPrice?.id === price.id ? (
                            <input
                              type="text"
                              inputMode="numeric"
                              value={editingPrice.valor}
                              onChange={e => setEditingPrice({ id: price.id, valor: maskMoney(e.target.value) })}
                              onBlur={() => salvarPreco(price.id)}
                              onKeyDown={e => { if (e.key === 'Enter') salvarPreco(price.id); }}
                              style={moneyInputStyle}
                              autoFocus
                            />
                          ) : (
                            <span style={{ fontWeight: 500 }}>{fmt(price.valor)}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 0', textAlign: 'center' }}>
                          {editingPrice?.id === price.id ? (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                              <button
                                className="btn btn-ghost"
                                style={{ fontSize: 12, color: 'var(--color-success)', padding: '2px 6px' }}
                                onClick={() => salvarPreco(price.id)}
                              >
                                Salvar
                              </button>
                              <button
                                className="btn btn-ghost"
                                style={{ fontSize: 12, padding: '2px 6px' }}
                                onClick={() => setEditingPrice(null)}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: 12, color: 'var(--color-primary)', padding: '2px 8px' }}
                              onClick={() => setEditingPrice({ id: price.id, valor: maskMoney((isNaN(price.valor) ? 0 : price.valor).toFixed(2).replace('.', '')) })}
                            >
                              <Edit2 size={12} style={{ marginRight: 3 }} /> Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {myPrices.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                  Nenhum preço cadastrado para este serviço.
                </p>
              )}
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, marginBottom: 4 }}>
            <DocListEditor
              label="Documentos PF (Pessoa Física)"
              docs={draft.documentos_pf}
              onChange={docs => setDraft(d => ({ ...d, documentos_pf: docs }))}
            />
            <DocListEditor
              label="Documentos PJ (Pessoa Jurídica)"
              docs={draft.documentos_pj}
              onChange={docs => setDraft(d => ({ ...d, documentos_pj: docs }))}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Save size={15} />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>

            {saved && (
              <span style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 500 }}>
                Salvo com sucesso!
              </span>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {confirmDelete ? (
                <>
                  <span style={{ fontSize: 13, color: 'var(--color-danger)', alignSelf: 'center' }}>
                    Confirmar exclusão?
                  </span>
                  <button
                    className="btn btn-ghost"
                    style={{ color: 'var(--color-danger)', fontSize: 13 }}
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? 'Excluindo...' : 'Sim, excluir'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 13 }}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-ghost"
                  style={{ color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: 5 }}
                  onClick={handleDelete}
                >
                  <Trash2 size={14} />
                  Excluir
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── New Service Form ──────────────────────────────────────────────────────────

interface NewServicePanelProps {
  onCreated: () => void;
  onCancel: () => void;
}

function NewServicePanel({ onCreated, onCancel }: NewServicePanelProps) {
  const [form, setForm] = useState<NewServiceForm>({
    tipo_servico: '',
    nome_exibicao: '',
    documentos_pf: [],
    documentos_pj: [],
    dae_tipo: null,
    gera_vistoria: 'nunca',
    gera_placa: 'nunca',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!form.tipo_servico.trim()) { setError('O identificador do serviço é obrigatório.'); return; }
    if (!form.nome_exibicao.trim()) { setError('O nome de exibição é obrigatório.'); return; }
    setSaving(true);
    setError(null);
    try {
      await createServiceConfig({
        tipo_servico: form.tipo_servico.trim().toLowerCase().replace(/\s+/g, '_'),
        nome_exibicao: form.nome_exibicao.trim(),
        documentos_pf: form.documentos_pf.map(d => d.trim()).filter(Boolean),
        documentos_pj: form.documentos_pj.map(d => d.trim()).filter(Boolean),
        dae_tipo: form.dae_tipo,
        gera_vistoria: form.gera_vistoria,
        gera_placa: form.gera_placa,
      });
      onCreated();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao criar serviço');
      setSaving(false);
    }
  };

  return (
    <div style={{ ...cardStyle, border: '1px solid var(--color-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Plus size={18} color="var(--color-primary)" />
        <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)' }}>
          Novo Tipo de Serviço
        </span>
        <button
          className="btn btn-ghost"
          style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)' }}
          onClick={onCancel}
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div style={{
          background: 'var(--color-danger)',
          color: '#fff',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 13,
          marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={sectionHeaderStyle}>Identificador (tipo_servico)</label>
          <input
            style={inputStyle}
            value={form.tipo_servico}
            onChange={e => setForm(f => ({ ...f, tipo_servico: e.target.value }))}
            placeholder="ex: transferencia, licenciamento"
          />
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            Usado internamente. Será convertido para minúsculas com underscores.
          </div>
        </div>
        <div>
          <label style={sectionHeaderStyle}>Nome de Exibição</label>
          <input
            style={inputStyle}
            value={form.nome_exibicao}
            onChange={e => setForm(f => ({ ...f, nome_exibicao: e.target.value }))}
            placeholder="ex: Transferência de Veículo"
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div>
          <label style={sectionHeaderStyle}>DAE</label>
          <select
            style={selectStyle}
            value={form.dae_tipo ?? ''}
            onChange={e => setForm(f => ({ ...f, dae_tipo: e.target.value === '' ? null : e.target.value }))}
          >
            {DAE_OPTIONS.map(opt => (
              <option key={String(opt.value)} value={opt.value ?? ''}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={sectionHeaderStyle}>Vistoria</label>
          <select
            style={selectStyle}
            value={form.gera_vistoria}
            onChange={e => setForm(f => ({ ...f, gera_vistoria: e.target.value }))}
          >
            {VISTORIA_PLACA_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={sectionHeaderStyle}>Placa</label>
          <select
            style={selectStyle}
            value={form.gera_placa}
            onChange={e => setForm(f => ({ ...f, gera_placa: e.target.value }))}
          >
            {VISTORIA_PLACA_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
        <DocListEditor
          label="Documentos PF (Pessoa Física)"
          docs={form.documentos_pf}
          onChange={docs => setForm(f => ({ ...f, documentos_pf: docs }))}
        />
        <DocListEditor
          label="Documentos PJ (Pessoa Jurídica)"
          docs={form.documentos_pj}
          onChange={docs => setForm(f => ({ ...f, documentos_pj: docs }))}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={15} />
          {saving ? 'Criando...' : 'Criar Serviço'}
        </button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Configuracoes() {
  const [configs, setConfigs] = useState<ServiceConfig[]>([]);
  const [prices, setPrices] = useState<ServicePrice[]>([]);
  const [custos, setCustos] = useState<PriceTableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const [data, priceData, custoData] = await Promise.all([
        getAllServiceConfigs(),
        getServicePrices(),
        getPriceTable(),
      ]);
      setConfigs(data);
      setPrices(priceData);
      setCustos(custoData);
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('config-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_config' }, () => {
        invalidateConfigCache();
        carregar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_prices' }, () => {
        carregar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'price_table' }, () => {
        carregar();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [carregar]);

  const handleCreated = () => {
    setShowNewForm(false);
    invalidateConfigCache();
    carregar();
  };

  const handleSaved = () => {
    invalidateConfigCache();
    carregar();
  };

  const handleDeleted = () => {
    invalidateConfigCache();
    carregar();
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <Settings size={24} color="var(--color-primary)" />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            Configurações de Serviços
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
            Gerencie os tipos de serviço, documentos exigidos e configurações de custo.
          </p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          {!showNewForm && (
            <button
              className="btn btn-primary"
              onClick={() => setShowNewForm(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={16} />
              Novo Serviço
            </button>
          )}
        </div>
      </div>

      {/* Global error */}
      {error && (
        <div style={{
          background: 'var(--color-danger)',
          color: '#fff',
          borderRadius: 10,
          padding: '12px 16px',
          fontSize: 14,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>{error}</span>
          <button
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
            onClick={() => setError(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* New service form */}
      {showNewForm && (
        <NewServicePanel
          onCreated={handleCreated}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 48 }}>
          Carregando configurações...
        </div>
      )}

      {/* Empty state */}
      {!loading && configs.length === 0 && !showNewForm && (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 48 }}>
          <Settings size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
            Nenhum tipo de serviço cadastrado
          </div>
          <div style={{ fontSize: 13 }}>
            Clique em "Novo Serviço" para começar.
          </div>
        </div>
      )}

      {/* Service cards */}
      {!loading && configs.map(config => (
        <ServiceCard
          key={config.id}
          config={config}
          prices={prices}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onDataChanged={carregar}
        />
      ))}

      {/* ══ Custos Fixos (Taxas) ══ */}
      {!loading && (
        <CustosFixosSection custos={custos} onDataChanged={carregar} />
      )}

      {/* Footer info */}
      {!loading && configs.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 8, textAlign: 'center' }}>
          {configs.length} tipo(s) de serviço cadastrado(s).
        </div>
      )}
    </div>
  );
}

// ── Custos Fixos Section (separada) ──────────────────────────────────────────

function CustosFixosSection({ custos, onDataChanged }: { custos: PriceTableItem[]; onDataChanged: () => void }) {
  const [editingCost, setEditingCost] = useState<{ id: string; valor: string } | null>(null);
  const [newCost, setNewCost] = useState<{ descricao: string; codigo: string; valor: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const salvarCusto = async (costId: string) => {
    if (!editingCost) return;
    try {
      await updatePriceItem(costId, unmaskMoney(editingCost.valor));
      setEditingCost(null);
      onDataChanged();
    } catch {
      setError('Erro ao salvar custo.');
    }
  };

  const adicionarCusto = async () => {
    if (!newCost || !newCost.descricao.trim() || !newCost.codigo.trim()) {
      setError('Preencha descrição e código do custo.');
      return;
    }
    try {
      const { error: insertErr } = await supabase.from('price_table').insert({
        codigo: newCost.codigo.trim().toLowerCase().replace(/\s+/g, '_'),
        descricao: newCost.descricao.trim(),
        valor: unmaskMoney(newCost.valor),
        ativo: true,
      });
      if (insertErr) throw insertErr;
      setNewCost(null);
      setError(null);
      onDataChanged();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao adicionar custo.');
    }
  };

  const removerCusto = async (costId: string) => {
    try {
      const { error: delErr } = await supabase.from('price_table').update({ ativo: false }).eq('id', costId);
      if (delErr) throw delErr;
      onDataChanged();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao remover custo.');
    }
  };

  return (
    <div style={{
      ...cardStyle,
      marginTop: 32,
      border: '1px solid var(--color-warning, #f59e0b)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <DollarSign size={20} color="var(--color-warning, #f59e0b)" />
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            Custos Fixos (Taxas)
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
            Valores cobrados pelos órgãos (DAE, vistoria, placas). Adicionados automaticamente nas OS.
          </p>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'var(--color-danger)', color: '#fff', borderRadius: 8,
          padding: '8px 12px', fontSize: 13, marginBottom: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{error}</span>
          <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {custos.length > 0 && (
        <table style={{ width: '100%', fontSize: 14, color: 'var(--color-text-primary)', borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr style={{ color: 'var(--color-text-secondary)', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ textAlign: 'left', paddingBottom: 8 }}>Descrição</th>
              <th style={{ textAlign: 'left', paddingBottom: 8, fontSize: 10 }}>Código</th>
              <th style={{ textAlign: 'right', paddingBottom: 8 }}>Valor</th>
              <th style={{ textAlign: 'center', paddingBottom: 8, width: 110 }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {custos.map(cost => (
              <tr key={cost.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                <td style={{ padding: '10px 8px 10px 0', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {cost.descricao}
                </td>
                <td style={{ padding: '10px 4px', color: 'var(--color-text-tertiary)', fontSize: 12, fontFamily: 'monospace' }}>
                  {cost.codigo}
                </td>
                <td style={{ padding: '10px 0', textAlign: 'right', fontFamily: 'monospace' }}>
                  {editingCost?.id === cost.id ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editingCost.valor}
                      onChange={e => setEditingCost({ id: cost.id, valor: maskMoney(e.target.value) })}
                      onBlur={() => salvarCusto(cost.id)}
                      onKeyDown={e => { if (e.key === 'Enter') salvarCusto(cost.id); }}
                      style={moneyInputStyle}
                      autoFocus
                    />
                  ) : (
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{fmt(cost.valor)}</span>
                  )}
                </td>
                <td style={{ padding: '10px 0', textAlign: 'center' }}>
                  {editingCost?.id === cost.id ? (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                      <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--color-success)', padding: '2px 8px' }} onClick={() => salvarCusto(cost.id)}>Salvar</button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => setEditingCost(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                      <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--color-primary)', padding: '2px 8px' }} onClick={() => setEditingCost({ id: cost.id, valor: maskMoney((isNaN(cost.valor) ? 0 : cost.valor).toFixed(2).replace('.', '')) })}>
                        <Edit2 size={12} style={{ marginRight: 3 }} /> Editar
                      </button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--color-danger)', padding: '2px 8px' }} onClick={() => removerCusto(cost.id)} title="Desativar custo">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {custos.length === 0 && !newCost && (
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontStyle: 'italic', marginBottom: 8 }}>
          Nenhum custo fixo cadastrado.
        </p>
      )}

      {newCost ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 3 }}>Descrição</label>
            <input style={inputStyle} value={newCost.descricao} onChange={e => setNewCost(c => c ? { ...c, descricao: e.target.value } : c)} placeholder="Ex: DAE Principal" />
          </div>
          <div style={{ flex: '0 0 140px' }}>
            <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 3 }}>Código</label>
            <input style={inputStyle} value={newCost.codigo} onChange={e => setNewCost(c => c ? { ...c, codigo: e.target.value } : c)} placeholder="dae_principal" />
          </div>
          <div style={{ flex: '0 0 110px' }}>
            <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 3 }}>Valor</label>
            <input style={{ ...moneyInputStyle, width: '100%' }} inputMode="numeric" value={newCost.valor} onChange={e => setNewCost(c => c ? { ...c, valor: maskMoney(e.target.value) } : c)} placeholder="0,00" />
          </div>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={adicionarCusto}>
            <Plus size={14} /> Adicionar
          </button>
          <button className="btn btn-ghost" onClick={() => { setNewCost(null); setError(null); }}>
            Cancelar
          </button>
        </div>
      ) : (
        <button
          className="btn btn-ghost"
          style={{ fontSize: 13, color: 'var(--color-primary)', padding: '6px 0', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={() => setNewCost({ descricao: '', codigo: '', valor: '0,00' })}
        >
          <Plus size={14} />
          Adicionar novo custo fixo
        </button>
      )}
    </div>
  );
}

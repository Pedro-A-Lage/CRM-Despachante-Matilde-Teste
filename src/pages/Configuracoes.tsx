// src/pages/Configuracoes.tsx
import { useEffect, useState, useCallback } from 'react';
import { Settings, Edit2, DollarSign, Plus, Trash2, Save, Building2, X, Wrench } from 'lucide-react';
import {
  getAllServiceConfigs, invalidateConfigCache,
} from '../lib/configService';
import type { ServiceConfig } from '../lib/configService';
import { getPriceTable, updatePriceItem, addPriceItem, deactivatePriceItem } from '../lib/financeService';
import type { PriceTableItem } from '../types/finance';
import { supabase } from '../lib/supabaseClient';
import { ServiceEditModal } from '../components/ServiceEditModal';
import { getEmpresas, saveEmpresa } from '../lib/empresaService';
import type { EmpresaParceira } from '../types/empresa';
import { EmpresaEditModal } from '../components/EmpresaEditModal';

// ── Label helpers ─────────────────────────────────────────────────────────────
const daeLabel = (v: string | null) =>
  ({ principal: 'Principal', alteracao: 'Alteração' }[v ?? ''] ?? '—');

const opcaoLabel = (v: string) =>
  ({ sempre: 'Sempre', se_troca: 'Se troca', nunca: 'Nunca' }[v] ?? v);

// ── Money helpers ─────────────────────────────────────────────────────────────
function maskMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function unmaskMoney(str: string): number {
  const digits = str.replace(/\D/g, '');
  return parseInt(digits || '0', 10) / 100;
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const sectionCard: React.CSSProperties = {
  background: 'var(--notion-surface)',
  border: '1px solid var(--notion-border)',
  borderRadius: 12,
  overflow: 'hidden',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  fontSize: '0.72rem',
  fontWeight: 700,
  color: 'var(--notion-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--notion-border)',
  background: 'var(--notion-bg-alt)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: '0.875rem',
  color: 'var(--notion-text)',
  borderBottom: '1px solid var(--notion-border)',
  verticalAlign: 'middle',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 10px',
  borderRadius: 20,
  fontSize: '0.72rem',
  fontWeight: 700,
  background: 'var(--notion-bg-alt)',
  color: 'var(--notion-text-secondary)',
};

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  background: 'var(--notion-blue)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.85rem',
  fontFamily: 'inherit',
};

const btnGhost: React.CSSProperties = {
  width: 30,
  height: 30,
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--notion-text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s',
};

type TabKey = 'servicos' | 'custos' | 'empresas';

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Configuracoes() {
  const [configs, setConfigs] = useState<ServiceConfig[]>([]);
  const [custos, setCustos] = useState<PriceTableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<ServiceConfig | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaParceira[]>([]);
  const [editingEmpresa, setEditingEmpresa] = useState<Partial<EmpresaParceira> | null>(null);
  const [tab, setTab] = useState<TabKey>('servicos');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgs, priceItems, emps] = await Promise.all([
        getAllServiceConfigs(),
        getPriceTable(),
        getEmpresas(),
      ]);
      setConfigs(cfgs);
      setCustos(priceItems);
      setEmpresas(emps);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Realtime
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

  const handleSaved = () => {
    setModalOpen(false);
    invalidateConfigCache();
    carregar();
  };

  const handleDeleted = () => {
    setModalOpen(false);
    invalidateConfigCache();
    carregar();
  };

  const openNew = () => { setModalConfig(null); setModalOpen(true); };
  const openEdit = (cfg: ServiceConfig) => { setModalConfig(cfg); setModalOpen(true); };

  const tabs: { key: TabKey; label: string; icon: React.ElementType; count: number }[] = [
    { key: 'servicos', label: 'Serviços DETRAN', icon: Wrench, count: configs.length },
    { key: 'custos', label: 'Custos Fixos', icon: DollarSign, count: custos.length },
    { key: 'empresas', label: 'Empresas', icon: Building2, count: empresas.length },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 4px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: '1px solid var(--notion-border)',
      }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: 'rgba(0,117,222,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--notion-blue)',
          flexShrink: 0,
        }}>
          <Settings size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            margin: 0,
            fontSize: '1.4rem',
            fontWeight: 800,
            color: 'var(--notion-text)',
            letterSpacing: '-0.02em',
          }}>
            Configurações
          </h1>
          <p style={{
            margin: '2px 0 0',
            fontSize: '0.85rem',
            color: 'var(--notion-text-secondary)',
          }}>
            Gerencie serviços DETRAN, custos fixos e empresas parceiras
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 20,
        background: 'var(--notion-surface)',
        padding: 4,
        borderRadius: 10,
        border: '1px solid var(--notion-border)',
        overflowX: 'auto',
      }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              background: tab === t.key ? 'var(--notion-blue)' : 'transparent',
              color: tab === t.key ? '#fff' : 'var(--notion-text-secondary)',
              border: 'none',
              borderRadius: 7,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <t.icon size={14} />
            {t.label}
            <span style={{
              background: tab === t.key ? 'rgba(255,255,255,0.25)' : 'var(--notion-bg-alt)',
              color: tab === t.key ? '#fff' : 'var(--notion-text-secondary)',
              padding: '1px 8px',
              borderRadius: 20,
              fontSize: '0.7rem',
              fontWeight: 700,
              minWidth: 20,
              textAlign: 'center',
            }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Aba Serviços DETRAN ── */}
      {tab === 'servicos' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--notion-text)' }}>
              Serviços cadastrados
            </h2>
            <button onClick={openNew} style={btnPrimary}>
              <Plus size={14} />
              Novo Serviço
            </button>
          </div>

          {loading ? (
            <div style={{ ...sectionCard, padding: 48, textAlign: 'center', color: 'var(--notion-text-secondary)' }}>
              Carregando configurações...
            </div>
          ) : configs.length === 0 ? (
            <div style={{ ...sectionCard, padding: 48, textAlign: 'center' }}>
              <Wrench size={32} style={{ color: 'var(--notion-text-muted)', margin: '0 auto 8px' }} />
              <p style={{ color: 'var(--notion-text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                Nenhum serviço cadastrado. Clique em "Novo Serviço" para começar.
              </p>
            </div>
          ) : (
            <div style={sectionCard}>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Nome</th>
                      <th style={thStyle}>Docs PF</th>
                      <th style={thStyle}>Docs PJ</th>
                      <th style={thStyle}>DAE</th>
                      <th style={thStyle}>Vistoria</th>
                      <th style={thStyle}>Placa</th>
                      <th style={thStyle}>Status</th>
                      <th style={{ ...thStyle, width: 50 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((cfg, i) => (
                      <tr
                        key={cfg.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => openEdit(cfg)}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-bg-alt)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ ...tdStyle, fontWeight: 600, borderBottom: i === configs.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          {cfg.nome_exibicao}
                        </td>
                        <td style={{ ...tdStyle, borderBottom: i === configs.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          <span style={chipStyle}>{cfg.documentos_pf.length}</span>
                        </td>
                        <td style={{ ...tdStyle, borderBottom: i === configs.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          <span style={chipStyle}>{cfg.documentos_pj.length}</span>
                        </td>
                        <td style={{ ...tdStyle, borderBottom: i === configs.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          {daeLabel(cfg.dae_tipo)}
                        </td>
                        <td style={{ ...tdStyle, borderBottom: i === configs.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          {opcaoLabel(cfg.gera_vistoria)}
                        </td>
                        <td style={{ ...tdStyle, borderBottom: i === configs.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          {opcaoLabel(cfg.gera_placa)}
                        </td>
                        <td style={{ ...tdStyle, borderBottom: i === configs.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          <span style={{
                            ...chipStyle,
                            background: cfg.ativo ? 'rgba(5,150,105,0.1)' : 'var(--notion-bg-alt)',
                            color: cfg.ativo ? '#059669' : 'var(--notion-text-secondary)',
                          }}>
                            {cfg.ativo ? '● Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, borderBottom: i === configs.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          <button
                            style={btnGhost}
                            onClick={(e) => { e.stopPropagation(); openEdit(cfg); }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-bg-alt)'; e.currentTarget.style.color = 'var(--notion-blue)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-secondary)'; }}
                          >
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Aba Custos Fixos ── */}
      {tab === 'custos' && (
        <CustosFixosSection custos={custos} onDataChanged={carregar} />
      )}

      {/* ── Aba Empresas ── */}
      {tab === 'empresas' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--notion-text)' }}>
              Empresas parceiras
            </h2>
            <button
              onClick={() => setEditingEmpresa({ nome: '', cor: '#3B82F6', ativo: true, etapasEnvio: [] })}
              style={btnPrimary}
            >
              <Plus size={14} />
              Nova Empresa
            </button>
          </div>

          {empresas.length === 0 ? (
            <div style={{ ...sectionCard, padding: 48, textAlign: 'center' }}>
              <Building2 size={32} style={{ color: 'var(--notion-text-muted)', margin: '0 auto 8px' }} />
              <p style={{ color: 'var(--notion-text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                Nenhuma empresa cadastrada. Clique em "Nova Empresa" para começar.
              </p>
            </div>
          ) : (
            <div style={sectionCard}>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Nome</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Valor Serviço</th>
                      <th style={thStyle}>Valor Placa</th>
                      <th style={thStyle}>Etapas</th>
                      <th style={thStyle}>Status</th>
                      <th style={{ ...thStyle, width: 50 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {empresas.map((emp, i) => (
                      <tr
                        key={emp.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setEditingEmpresa(emp)}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-bg-alt)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ ...tdStyle, fontWeight: 600, borderBottom: i === empresas.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              display: 'inline-block',
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: emp.cor,
                              boxShadow: `0 0 6px ${emp.cor}40`,
                              flexShrink: 0,
                            }} />
                            {emp.nome}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--notion-text-secondary)', borderBottom: i === empresas.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          {emp.email || '—'}
                        </td>
                        <td style={{ ...tdStyle, borderBottom: i === empresas.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          {emp.valorServico != null ? maskMoney(emp.valorServico) : '—'}
                        </td>
                        <td style={{ ...tdStyle, borderBottom: i === empresas.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          {emp.valorPlaca != null ? maskMoney(emp.valorPlaca) : '—'}
                        </td>
                        <td style={{ ...tdStyle, borderBottom: i === empresas.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          <span style={chipStyle}>{emp.etapasEnvio.length}</span>
                        </td>
                        <td style={{ ...tdStyle, borderBottom: i === empresas.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          <span style={{
                            ...chipStyle,
                            background: emp.ativo ? 'rgba(5,150,105,0.1)' : 'var(--notion-bg-alt)',
                            color: emp.ativo ? '#059669' : 'var(--notion-text-secondary)',
                          }}>
                            {emp.ativo ? '● Ativa' : 'Inativa'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, borderBottom: i === empresas.length - 1 ? 'none' : tdStyle.borderBottom }}>
                          <button
                            style={btnGhost}
                            onClick={(e) => { e.stopPropagation(); setEditingEmpresa(emp); }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-bg-alt)'; e.currentTarget.style.color = 'var(--notion-blue)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-secondary)'; }}
                          >
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <EmpresaEditModal
        open={!!editingEmpresa}
        empresa={editingEmpresa || {}}
        onSave={async (emp) => {
          await saveEmpresa(emp);
          setEditingEmpresa(null);
          carregar();
        }}
        onClose={() => setEditingEmpresa(null)}
      />

      <ServiceEditModal
        open={modalOpen}
        config={modalConfig}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  );
}

// ── Custos Fixos Section ──────────────────────────────────────────────────────
function CustosFixosSection({ custos, onDataChanged }: { custos: PriceTableItem[]; onDataChanged: () => void }) {
  const [editingCost, setEditingCost] = useState<{ id: string; valor: string } | null>(null);
  const [newCost, setNewCost] = useState<{ descricao: string; codigo: string; valor: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const salvarCusto = async (costId: string, valorStr: string) => {
    try {
      await updatePriceItem(costId, unmaskMoney(valorStr));
      setEditingCost(null);
      setError(null);
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
      await addPriceItem({
        codigo: newCost.codigo.trim().toLowerCase().replace(/\s+/g, '_'),
        descricao: newCost.descricao.trim(),
        valor: unmaskMoney(newCost.valor),
      });
      setNewCost(null);
      setError(null);
      onDataChanged();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao adicionar custo.');
    }
  };

  const removerCusto = async (costId: string) => {
    try {
      await deactivatePriceItem(costId);
      onDataChanged();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao remover custo.');
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    background: 'var(--notion-bg)',
    color: 'var(--notion-text)',
    border: '1px solid var(--notion-border)',
    borderRadius: 6,
    fontSize: '0.85rem',
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--notion-text)' }}>
          Custos fixos
        </h2>
        {!newCost && (
          <button
            onClick={() => setNewCost({ descricao: '', codigo: '', valor: '' })}
            style={btnPrimary}
          >
            <Plus size={14} />
            Adicionar
          </button>
        )}
      </div>

      {error && (
        <div style={{
          padding: '8px 12px',
          marginBottom: 12,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: '#EF4444',
          borderRadius: 8,
          fontSize: '0.85rem',
          fontWeight: 600,
        }}>
          {error}
        </div>
      )}

      {custos.length === 0 && !newCost ? (
        <div style={{ ...sectionCard, padding: 48, textAlign: 'center' }}>
          <DollarSign size={32} style={{ color: 'var(--notion-text-muted)', margin: '0 auto 8px' }} />
          <p style={{ color: 'var(--notion-text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            Nenhum custo fixo cadastrado. Clique em "Adicionar" para começar.
          </p>
        </div>
      ) : (
        <div style={sectionCard}>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Descrição</th>
                  <th style={thStyle}>Código</th>
                  <th style={thStyle}>Valor</th>
                  <th style={{ ...thStyle, width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {custos.map((cost, i) => {
                  const isLast = i === custos.length - 1 && !newCost;
                  return (
                    <tr
                      key={cost.id}
                      onMouseEnter={e => { if (editingCost?.id !== cost.id) e.currentTarget.style.background = 'var(--notion-bg-alt)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 500, borderBottom: isLast ? 'none' : tdStyle.borderBottom }}>
                        {cost.descricao}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--notion-text-secondary)', borderBottom: isLast ? 'none' : tdStyle.borderBottom }}>
                        {cost.codigo}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600, borderBottom: isLast ? 'none' : tdStyle.borderBottom }}>
                        {editingCost?.id === cost.id ? (
                          <input
                            style={{ ...inputStyle, width: 140 }}
                            value={editingCost.valor}
                            onChange={e => setEditingCost({ id: cost.id, valor: e.target.value })}
                            placeholder="R$ 0,00"
                            autoFocus
                          />
                        ) : (
                          maskMoney(cost.valor)
                        )}
                      </td>
                      <td style={{ ...tdStyle, borderBottom: isLast ? 'none' : tdStyle.borderBottom }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {editingCost?.id === cost.id ? (
                            <>
                              <button
                                style={{ ...btnGhost, color: '#059669' }}
                                onClick={() => salvarCusto(cost.id, editingCost.valor)}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(5,150,105,0.1)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <Save size={14} />
                              </button>
                              <button
                                style={btnGhost}
                                onClick={() => { setEditingCost(null); setError(null); }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-bg-alt)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                style={btnGhost}
                                onClick={() => setEditingCost({ id: cost.id, valor: maskMoney(cost.valor) })}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-bg-alt)'; e.currentTarget.style.color = 'var(--notion-blue)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-secondary)'; }}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                style={btnGhost}
                                onClick={() => removerCusto(cost.id)}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#EF4444'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-secondary)'; }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {newCost && (
                  <tr style={{ background: 'rgba(0,117,222,0.04)' }}>
                    <td style={{ ...tdStyle, borderBottom: 'none' }}>
                      <input
                        style={inputStyle}
                        value={newCost.descricao}
                        onChange={e => setNewCost({ ...newCost, descricao: e.target.value })}
                        placeholder="Ex: Taxa Detran"
                        autoFocus
                      />
                    </td>
                    <td style={{ ...tdStyle, borderBottom: 'none' }}>
                      <input
                        style={{ ...inputStyle, fontFamily: 'monospace' }}
                        value={newCost.codigo}
                        onChange={e => setNewCost({ ...newCost, codigo: e.target.value })}
                        placeholder="codigo_custo"
                      />
                    </td>
                    <td style={{ ...tdStyle, borderBottom: 'none' }}>
                      <input
                        style={{ ...inputStyle, width: 140 }}
                        value={newCost.valor}
                        onChange={e => setNewCost({ ...newCost, valor: e.target.value })}
                        placeholder="R$ 0,00"
                      />
                    </td>
                    <td style={{ ...tdStyle, borderBottom: 'none' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          style={{ ...btnGhost, color: '#059669' }}
                          onClick={adicionarCusto}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(5,150,105,0.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <Save size={14} />
                        </button>
                        <button
                          style={btnGhost}
                          onClick={() => { setNewCost(null); setError(null); }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--notion-bg-alt)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

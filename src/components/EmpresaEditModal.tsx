// src/components/EmpresaEditModal.tsx
import { useState, useEffect } from 'react';
import { Plus, Trash2, FileText, Building2, Mail, DollarSign, Palette, Layers, Info, ExternalLink, CreditCard } from 'lucide-react';
import type { EmpresaParceira, EtapaEnvioConfig, MetodoEnvioEmpresa } from '../types/empresa';
import type { PaymentMetodo } from '../types/finance';
import { PAYMENT_METODO_LABELS } from '../types/finance';
import {
  Dialog, DialogContent, DialogTitle,
} from './ui/dialog';
import { Switch } from './ui/switch';

// ── Styles ───────────────────────────────────────────────────────────────────
const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 600,
  color: 'var(--notion-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
};

const fieldInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--notion-bg)',
  color: 'var(--notion-text)',
  border: '1px solid var(--notion-border)',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  boxSizing: 'border-box',
};

const sectionCard: React.CSSProperties = {
  background: 'var(--notion-bg-alt)',
  border: '1px solid var(--notion-border)',
  borderRadius: 10,
  padding: 16,
};

const sectionHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 14,
  paddingBottom: 10,
  borderBottom: '1px solid var(--notion-border)',
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  fontWeight: 700,
  color: 'var(--notion-text)',
  letterSpacing: '-0.01em',
};

// ── Doc label helper ─────────────────────────────────────────────────────────
function docLabel(tipo: string): string {
  const labels: Record<string, string> = {
    tx_estado: 'Tx do Estado',
    comprovante_pagamento: 'Comprovante Pgto',
    taxa_vistoria: 'Taxa Vistoria',
    boleto_placa: 'Boleto Placa',
    comprovante_placa: 'Comprovante Placa',
    nota_fiscal: 'Nota Fiscal',
    dae: 'DAE',
    vistoria_paga: 'Vistoria Paga',
    doc_pronto: 'Doc. Pronto',
  };
  return labels[tipo] || tipo.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  empresa: Partial<EmpresaParceira>;
  open: boolean;
  onSave: (empresa: Partial<EmpresaParceira> & { nome: string }) => void;
  onClose: () => void;
}

export function EmpresaEditModal({ empresa, open, onSave, onClose }: Props) {
  const [nome, setNome] = useState(empresa.nome || '');
  const [email, setEmail] = useState(empresa.email || '');
  const [cor, setCor] = useState(empresa.cor || '#3B82F6');
  const [ativo, setAtivo] = useState(empresa.ativo ?? true);
  const [valorServico, setValorServico] = useState(empresa.valorServico?.toString() || '');
  const [valorPlaca, setValorPlaca] = useState(empresa.valorPlaca?.toString() || '');
  const [etapas, setEtapas] = useState<EtapaEnvioConfig[]>(empresa.etapasEnvio || []);
  const [emailAssunto, setEmailAssunto] = useState(empresa.emailAssuntoTemplate || '');
  const [emailCorpo, setEmailCorpo] = useState(empresa.emailCorpoTemplate || '');
  const [novoDocInputs, setNovoDocInputs] = useState<Record<number, string>>({});
  const [docLabels, setDocLabels] = useState<Record<string, string>>(empresa.documentosLabels || {});
  const [expandedEtapa, setExpandedEtapa] = useState<number | null>(0);
  const [metodoEnvio, setMetodoEnvio] = useState<MetodoEnvioEmpresa>(empresa.metodoEnvio || 'email');
  const [portalUrl, setPortalUrl] = useState(empresa.portalUrl || '');
  const [portalLabel, setPortalLabel] = useState(empresa.portalLabel || '');
  const [formaPagamentoPadrao, setFormaPagamentoPadrao] = useState<PaymentMetodo | ''>(empresa.formaPagamentoPadrao || '');

  // Reset form ONLY when modal opens
  useEffect(() => {
    if (!open) return;
    setNome(empresa.nome || '');
    setEmail(empresa.email || '');
    setCor(empresa.cor || '#3B82F6');
    setAtivo(empresa.ativo ?? true);
    setValorServico(empresa.valorServico?.toString() || '');
    setValorPlaca(empresa.valorPlaca?.toString() || '');
    setEtapas(empresa.etapasEnvio || []);
    setEmailAssunto(empresa.emailAssuntoTemplate || '');
    setEmailCorpo(empresa.emailCorpoTemplate || '');
    setNovoDocInputs({});
    setDocLabels(empresa.documentosLabels || {});
    setExpandedEtapa(0);
    setMetodoEnvio(empresa.metodoEnvio || 'email');
    setPortalUrl(empresa.portalUrl || '');
    setPortalLabel(empresa.portalLabel || '');
    setFormaPagamentoPadrao(empresa.formaPagamentoPadrao || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleAddEtapa = () => {
    const novaOrdem = etapas.length + 1;
    setEtapas([...etapas, { ordem: novaOrdem, nome: '', documentos: [] }]);
    setExpandedEtapa(etapas.length);
  };

  const handleRemoveEtapa = (idx: number) => {
    setEtapas(etapas.filter((_, i) => i !== idx).map((e, i) => ({ ...e, ordem: i + 1 })));
  };

  const handleEtapaNome = (idx: number, val: string) => {
    setEtapas(etapas.map((e, i) => (i === idx ? { ...e, nome: val } : e)));
  };

  const handleAddDoc = (etapaIdx: number) => {
    const docName = novoDocInputs[etapaIdx]?.trim();
    if (!docName) return;
    const tipoDoc = docName.toLowerCase().replace(/\s+/g, '_');
    setEtapas(etapas.map((e, i) =>
      i === etapaIdx ? { ...e, documentos: [...e.documentos, tipoDoc] } : e
    ));
    setNovoDocInputs({ ...novoDocInputs, [etapaIdx]: '' });
  };

  const handleRemoveDoc = (etapaIdx: number, docIdx: number) => {
    setEtapas(etapas.map((e, i) =>
      i === etapaIdx ? { ...e, documentos: e.documentos.filter((_, di) => di !== docIdx) } : e
    ));
  };

  const handleSave = () => {
    if (!nome.trim()) return;
    onSave({
      ...empresa,
      nome: nome.trim(),
      email: email.trim() || undefined,
      cor,
      ativo,
      valorServico: valorServico ? parseFloat(valorServico) : undefined,
      valorPlaca: valorPlaca ? parseFloat(valorPlaca) : undefined,
      etapasEnvio: etapas,
      documentosLabels: docLabels,
      emailAssuntoTemplate: emailAssunto.trim() || undefined,
      emailCorpoTemplate: emailCorpo.trim() || undefined,
      metodoEnvio,
      portalUrl: metodoEnvio === 'portal' ? (portalUrl.trim() || undefined) : undefined,
      portalLabel: metodoEnvio === 'portal' ? (portalLabel.trim() || undefined) : undefined,
      formaPagamentoPadrao: formaPagamentoPadrao || undefined,
    });
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = 'var(--notion-blue)';
    e.target.style.boxShadow = '0 0 0 3px rgba(0,117,222,0.12)';
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = 'var(--notion-border)';
    e.target.style.boxShadow = 'none';
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-3xl max-h-[92vh] flex flex-col p-0 [&>button]:rounded-full [&>button]:w-8 [&>button]:h-8 [&>button]:bg-surface/5 [&>button]:border [&>button]:border-white/10 [&>button]:top-5 [&>button]:right-5 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:opacity-100 [&>button>svg]:h-3.5 [&>button>svg]:w-3.5"
        style={{
          background: 'var(--notion-surface)',
          border: '1px solid var(--notion-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          borderRadius: 16,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '20px 24px',
          borderBottom: '1px solid var(--notion-border)',
          paddingRight: 56,
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: `${cor}22`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: cor,
            flexShrink: 0,
            border: `1px solid ${cor}55`,
          }}>
            <Building2 size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <DialogTitle style={{
              margin: 0,
              fontSize: '1.2rem',
              fontWeight: 800,
              color: 'var(--notion-text)',
              letterSpacing: '-0.02em',
            }}>
              {empresa.id ? 'Editar Empresa' : 'Nova Empresa'}
            </DialogTitle>
            <p style={{
              margin: '2px 0 0',
              fontSize: '0.82rem',
              color: 'var(--notion-text-secondary)',
            }}>
              {empresa.id ? (empresa.nome || '—') : 'Configure os dados da empresa parceira'}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 min-h-0" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Informações Básicas ── */}
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <Info size={16} style={{ color: 'var(--notion-blue)' }} />
                <h3 style={sectionTitle}>Informações básicas</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={fieldLabel}>
                    Nome da empresa <span style={{ color: 'var(--notion-orange)' }}>*</span>
                  </label>
                  <input
                    style={fieldInput}
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="Ex: Guiauto"
                    autoFocus
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={fieldLabel}>
                    <Mail size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                    Email para envio
                  </label>
                  <input
                    style={fieldInput}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="empresa@email.com (use vírgula p/ vários)"
                    type="email"
                  />
                </div>
              </div>
            </div>

            {/* ── Valores + Visual ── */}
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <DollarSign size={16} style={{ color: 'var(--notion-blue)' }} />
                <h3 style={sectionTitle}>Valores e aparência</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <div>
                  <label style={fieldLabel}>Valor Serviço (R$)</label>
                  <input
                    style={fieldInput}
                    value={valorServico}
                    onChange={e => setValorServico(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="0,00"
                    type="number"
                    step="0.01"
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Valor Placa (R$)</label>
                  <input
                    style={fieldInput}
                    value={valorPlaca}
                    onChange={e => setValorPlaca(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="Padrão"
                    type="number"
                    step="0.01"
                  />
                </div>
                <div>
                  <label style={fieldLabel}>
                    <Palette size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                    Cor
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}>
                    <input
                      type="color"
                      value={cor}
                      onChange={e => setCor(e.target.value)}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 8,
                        border: '1px solid var(--notion-border)',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: 2,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{
                      fontSize: '0.82rem',
                      color: 'var(--notion-text-secondary)',
                      fontFamily: 'monospace',
                    }}>
                      {cor}
                    </span>
                  </div>
                </div>
                <div>
                  <label style={fieldLabel}>Status</label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    height: 38,
                    padding: '0 12px',
                    background: 'var(--notion-bg)',
                    border: '1px solid var(--notion-border)',
                    borderRadius: 8,
                  }}>
                    <Switch checked={ativo} onCheckedChange={setAtivo} />
                    <span style={{
                      fontSize: '0.82rem',
                      color: ativo ? '#22c55e' : 'var(--notion-text-secondary)',
                      fontWeight: 600,
                    }}>
                      {ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Envio & Pagamento ── */}
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <ExternalLink size={16} style={{ color: 'var(--notion-blue)' }} />
                <h3 style={sectionTitle}>Envio & Pagamento</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={fieldLabel}>Como enviar os documentos</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setMetodoEnvio('email')}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        border: '1px solid var(--notion-border)',
                        background: metodoEnvio === 'email' ? 'var(--notion-blue)' : 'var(--notion-bg)',
                        color: metodoEnvio === 'email' ? '#fff' : 'var(--notion-text)',
                        fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <Mail size={14} /> Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoEnvio('portal')}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        border: '1px solid var(--notion-border)',
                        background: metodoEnvio === 'portal' ? 'var(--notion-blue)' : 'var(--notion-bg)',
                        color: metodoEnvio === 'portal' ? '#fff' : 'var(--notion-text)',
                        fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <ExternalLink size={14} /> Portal externo
                    </button>
                  </div>
                  <p style={{
                    margin: '6px 0 0', fontSize: '0.75rem',
                    color: 'var(--notion-text-secondary)',
                  }}>
                    {metodoEnvio === 'email'
                      ? 'A etapa abre o cliente de email com os anexos (comportamento padrão).'
                      : 'A etapa mostra um botão para abrir o portal externo da empresa em nova aba; o envio é marcado manualmente.'}
                  </p>
                </div>

                {metodoEnvio === 'portal' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={fieldLabel}>
                        URL do portal <span style={{ color: 'var(--notion-orange)' }}>*</span>
                      </label>
                      <input
                        style={fieldInput}
                        value={portalUrl}
                        onChange={e => setPortalUrl(e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        placeholder="https://portal.empresa.com.br"
                        type="url"
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={fieldLabel}>Nome do portal (legenda do botão)</label>
                      <input
                        style={fieldInput}
                        value={portalLabel}
                        onChange={e => setPortalLabel(e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        placeholder="Ex: Portal Kuruma"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label style={fieldLabel}>
                    <CreditCard size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                    Forma de pagamento padrão (recebimento da empresa)
                  </label>
                  <select
                    style={{ ...fieldInput, cursor: 'pointer' }}
                    value={formaPagamentoPadrao}
                    onChange={e => setFormaPagamentoPadrao(e.target.value as PaymentMetodo | '')}
                  >
                    <option value="">— Sem padrão —</option>
                    {(Object.keys(PAYMENT_METODO_LABELS) as PaymentMetodo[]).map((m) => (
                      <option key={m} value={m}>{PAYMENT_METODO_LABELS[m]}</option>
                    ))}
                  </select>
                  <p style={{
                    margin: '6px 0 0', fontSize: '0.75rem',
                    color: 'var(--notion-text-secondary)',
                  }}>
                    Pré-seleciona este método ao registrar recebimento das OS dessa empresa.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Etapas de Envio ── */}
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <Layers size={16} style={{ color: 'var(--notion-blue)' }} />
                <h3 style={sectionTitle}>Etapas de envio</h3>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 20,
                  background: 'var(--notion-bg)',
                  color: 'var(--notion-text-secondary)',
                }}>
                  {etapas.length}
                </span>
                <button
                  onClick={handleAddEtapa}
                  style={{
                    marginLeft: 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 10px',
                    background: 'rgba(0,117,222,0.1)',
                    color: 'var(--notion-blue)',
                    border: '1px solid rgba(0,117,222,0.3)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    fontFamily: 'inherit',
                  }}
                >
                  <Plus size={12} />
                  Adicionar etapa
                </button>
              </div>

              {etapas.length === 0 ? (
                <div style={{
                  padding: 32,
                  textAlign: 'center',
                  background: 'var(--notion-bg)',
                  border: '1px dashed var(--notion-border)',
                  borderRadius: 8,
                }}>
                  <Layers size={28} style={{ color: 'var(--notion-text-muted)', margin: '0 auto 8px' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--notion-text-secondary)' }}>
                    Nenhuma etapa cadastrada.
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--notion-text-muted)' }}>
                    Clique em "Adicionar etapa" para começar.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {etapas.map((etapa, eIdx) => {
                    const isExpanded = expandedEtapa === eIdx;
                    return (
                      <div
                        key={eIdx}
                        style={{
                          background: 'var(--notion-bg)',
                          border: `1px solid ${isExpanded ? 'rgba(0,117,222,0.3)' : 'var(--notion-border)'}`,
                          borderRadius: 10,
                          overflow: 'hidden',
                          transition: 'border-color 150ms',
                        }}
                      >
                        {/* Etapa header */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          cursor: 'pointer',
                          background: isExpanded ? 'rgba(0,117,222,0.04)' : 'transparent',
                        }}
                          onClick={() => setExpandedEtapa(isExpanded ? null : eIdx)}
                        >
                          <div style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            background: 'rgba(0,117,222,0.15)',
                            color: 'var(--notion-blue)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            flexShrink: 0,
                          }}>
                            {etapa.ordem}
                          </div>
                          <input
                            value={etapa.nome}
                            onChange={e => handleEtapaNome(eIdx, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            onFocus={(e) => { e.target.style.borderColor = 'var(--notion-blue)'; e.target.style.boxShadow = '0 0 0 2px rgba(0,117,222,0.15)'; }}
                            onBlur={(e) => { e.target.style.borderColor = 'transparent'; e.target.style.boxShadow = 'none'; }}
                            placeholder="Nome da etapa"
                            style={{
                              flex: 1,
                              padding: '6px 10px',
                              background: 'transparent',
                              color: 'var(--notion-text)',
                              border: '1px solid transparent',
                              borderRadius: 6,
                              fontSize: '0.88rem',
                              fontWeight: 600,
                              fontFamily: 'inherit',
                              outline: 'none',
                            }}
                          />
                          <span style={{
                            fontSize: '0.7rem',
                            color: 'var(--notion-text-secondary)',
                            padding: '2px 8px',
                            borderRadius: 20,
                            background: 'var(--notion-bg-alt)',
                            flexShrink: 0,
                          }}>
                            {etapa.documentos.length} docs
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveEtapa(eIdx); }}
                            style={{
                              width: 26,
                              height: 26,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: 6,
                              color: 'var(--notion-text-secondary)',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.1)'; e.currentTarget.style.color = '#dc2626'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-secondary)'; }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Documentos (expandido) */}
                        {isExpanded && (
                          <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {etapa.documentos.map((doc, dIdx) => (
                              <div
                                key={dIdx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '6px 10px',
                                  background: 'var(--notion-bg-alt)',
                                  borderRadius: 6,
                                }}
                              >
                                <FileText size={13} style={{ color: 'var(--notion-text-secondary)', flexShrink: 0 }} />
                                <input
                                  value={docLabels[doc] ?? docLabel(doc)}
                                  onChange={(e) => setDocLabels({ ...docLabels, [doc]: e.target.value })}
                                  onFocus={(e) => e.target.style.borderColor = 'var(--notion-blue)'}
                                  onBlur={(e) => e.target.style.borderColor = 'var(--notion-border)'}
                                  placeholder="Nome do documento"
                                  style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    background: 'var(--notion-bg)',
                                    color: 'var(--notion-text)',
                                    border: '1px solid var(--notion-border)',
                                    borderRadius: 5,
                                    fontSize: '0.82rem',
                                    fontFamily: 'inherit',
                                    outline: 'none',
                                  }}
                                />
                                <span
                                  title={`Código: ${doc}`}
                                  style={{
                                    fontSize: '0.7rem',
                                    color: 'var(--notion-text-muted)',
                                    fontFamily: 'monospace',
                                    padding: '2px 6px',
                                    background: 'var(--notion-surface)',
                                    borderRadius: 4,
                                    flexShrink: 0,
                                  }}
                                >
                                  {doc}
                                </span>
                                <button
                                  onClick={() => handleRemoveDoc(eIdx, dIdx)}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: 5,
                                    color: 'var(--notion-text-secondary)',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.1)'; e.currentTarget.style.color = '#dc2626'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--notion-text-secondary)'; }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}

                            {/* Add doc */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '4px 0',
                            }}>
                              <input
                                value={novoDocInputs[eIdx] || ''}
                                onChange={e => setNovoDocInputs({ ...novoDocInputs, [eIdx]: e.target.value })}
                                onKeyDown={e => e.key === 'Enter' && handleAddDoc(eIdx)}
                                placeholder="Adicionar documento…"
                                style={{
                                  flex: 1,
                                  padding: '6px 10px',
                                  background: 'var(--notion-surface)',
                                  color: 'var(--notion-text)',
                                  border: '1px dashed var(--notion-border)',
                                  borderRadius: 6,
                                  fontSize: '0.82rem',
                                  fontFamily: 'inherit',
                                  outline: 'none',
                                }}
                              />
                              <button
                                onClick={() => handleAddDoc(eIdx)}
                                disabled={!novoDocInputs[eIdx]?.trim()}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '6px 12px',
                                  background: novoDocInputs[eIdx]?.trim() ? 'var(--notion-blue)' : 'var(--notion-bg-alt)',
                                  color: novoDocInputs[eIdx]?.trim() ? '#fff' : 'var(--notion-text-muted)',
                                  border: 'none',
                                  borderRadius: 6,
                                  cursor: novoDocInputs[eIdx]?.trim() ? 'pointer' : 'not-allowed',
                                  fontWeight: 600,
                                  fontSize: '0.78rem',
                                  fontFamily: 'inherit',
                                  flexShrink: 0,
                                }}
                              >
                                <Plus size={12} />
                                Adicionar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Template de Email ── */}
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <Mail size={16} style={{ color: 'var(--notion-blue)' }} />
                <h3 style={sectionTitle}>Template de email</h3>
              </div>
              <div style={{
                padding: '8px 12px',
                marginBottom: 12,
                background: 'rgba(0,117,222,0.06)',
                border: '1px solid rgba(0,117,222,0.2)',
                borderRadius: 8,
                fontSize: '0.78rem',
                color: 'var(--notion-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <Info size={14} style={{ color: 'var(--notion-blue)', flexShrink: 0 }} />
                <span>
                  Use <code style={{ background: 'var(--notion-bg)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', color: 'var(--notion-blue)' }}>{'{numero}'}</code> e <code style={{ background: 'var(--notion-bg)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', color: 'var(--notion-blue)' }}>{'{placa}'}</code> para substituir automaticamente.
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={fieldLabel}>Assunto</label>
                  <input
                    style={fieldInput}
                    value={emailAssunto}
                    onChange={e => setEmailAssunto(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="OS #{numero} - {placa} - Documentação"
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Corpo do email</label>
                  <textarea
                    value={emailCorpo}
                    onChange={e => setEmailCorpo(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    rows={4}
                    placeholder="Segue documentação referente à OS #{numero}..."
                    style={{ ...fieldInput, minHeight: 96, resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          padding: '14px 24px',
          borderTop: '1px solid var(--notion-border)',
          background: 'var(--notion-bg-alt)',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px',
              background: 'var(--notion-surface)',
              border: '1px solid var(--notion-border)',
              borderRadius: 8,
              color: 'var(--notion-text)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!nome.trim()}
            style={{
              padding: '9px 22px',
              background: nome.trim() ? 'var(--notion-blue)' : 'var(--notion-bg)',
              border: 'none',
              borderRadius: 8,
              color: nome.trim() ? '#fff' : 'var(--notion-text-muted)',
              cursor: nome.trim() ? 'pointer' : 'not-allowed',
              fontWeight: 700,
              fontSize: '0.85rem',
              fontFamily: 'inherit',
              minWidth: 100,
            }}
          >
            Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// src/components/EmpresaEditModal.tsx
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, FileText } from 'lucide-react';
import type { EmpresaParceira, EtapaEnvioConfig } from '../types/empresa';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';

// ── Styles (matching ServiceEditModal) ───────────────────────────────────────
const LABEL_STYLE: React.CSSProperties = {
  textTransform: 'none',
  fontSize: '11px',
  color: 'var(--notion-text-secondary)',
  fontWeight: 500,
};

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--notion-bg-alt)',
  border: '1px solid var(--notion-border)',
  color: 'var(--notion-text)',
  fontSize: '12px',
};

const INPUT_HIGHLIGHT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  border: '1px solid rgba(0,117,222,0.35)',
};

const SECTION_STYLE: React.CSSProperties = {
  background: 'var(--notion-bg-alt)',
  border: '1px solid var(--notion-border)',
  borderRadius: '10px',
  padding: '12px',
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

  // Reset form ONLY when modal opens (not on every empresa prop change)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleAddEtapa = () => {
    setEtapas([...etapas, { ordem: etapas.length + 1, nome: '', documentos: [] }]);
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
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col p-0 [&>button]:rounded-full [&>button]:w-7 [&>button]:h-7 [&>button]:bg-surface/5 [&>button]:border [&>button]:border-white/10 [&>button]:top-4 [&>button]:right-4"
        style={{
          background: 'var(--notion-surface)',
          border: '1px solid var(--notion-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}
      >
        <div className="overflow-y-auto flex-1 min-h-0" style={{ padding: '20px 20px 0 20px' }}>
          {/* Header */}
          <div style={{ marginBottom: '14px', paddingRight: '32px' }}>
            <DialogTitle style={{ fontSize: '15px', fontWeight: 700, color: 'var(--notion-text)', lineHeight: 1.2 }}>
              {empresa.id ? 'Editar Empresa' : 'Nova Empresa'}
            </DialogTitle>
            {empresa.id && (
              <p style={{ fontSize: '11px', color: 'var(--notion-text-secondary)', marginTop: '3px', fontWeight: 500 }}>
                {empresa.nome}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {/* Row 1: Nome + Email */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label style={LABEL_STYLE}>Nome da empresa *</Label>
                <Input
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Ex: Guiauto"
                  style={INPUT_HIGHLIGHT_STYLE}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label style={LABEL_STYLE}>Email para envio</Label>
                <Input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="empresa@email.com"
                  type="email"
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            {/* Row 2: Valores + Cor + Ativo */}
            <div className="grid grid-cols-4 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label style={LABEL_STYLE}>Valor Serviço (R$)</Label>
                <Input
                  value={valorServico}
                  onChange={e => setValorServico(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                  style={INPUT_STYLE}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label style={LABEL_STYLE}>Valor Placa (R$)</Label>
                <Input
                  value={valorPlaca}
                  onChange={e => setValorPlaca(e.target.value)}
                  placeholder="Padrão"
                  type="number"
                  step="0.01"
                  style={INPUT_STYLE}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label style={LABEL_STYLE}>Cor do badge</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={cor}
                    onChange={e => setCor(e.target.value)}
                    style={{
                      width: '36px',
                      height: '32px',
                      borderRadius: '6px',
                      border: '1px solid var(--notion-border)',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--notion-text-secondary)' }}>{cor}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label style={LABEL_STYLE}>Status</Label>
                <div className="flex items-center gap-2 pt-1">
                  <Switch checked={ativo} onCheckedChange={setAtivo} />
                  <span style={{ fontSize: '11px', color: ativo ? '#28A06A' : 'var(--notion-text-secondary)', fontWeight: 500 }}>
                    {ativo ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
              </div>
            </div>

            {/* Etapas de Envio */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label style={{ ...LABEL_STYLE, fontSize: '12px' }}>Etapas de Envio</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleAddEtapa}
                  style={{ fontSize: '11px', color: 'var(--notion-blue)', height: '28px', padding: '0 8px' }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Etapa
                </Button>
              </div>

              {etapas.length === 0 ? (
                <div style={{ ...SECTION_STYLE, textAlign: 'center', padding: '24px' }}>
                  <p style={{ fontSize: '12px', color: '#5A5D70' }}>
                    Nenhuma etapa cadastrada. Clique em "+ Etapa" para adicionar.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {etapas.map((etapa, eIdx) => (
                    <div key={eIdx} style={SECTION_STYLE}>
                      {/* Etapa header */}
                      <div className="flex items-center gap-2 mb-2">
                        <span style={{
                          fontSize: '10px',
                          color: 'var(--notion-blue)',
                          fontWeight: 700,
                          background: 'rgba(0,117,222,0.12)',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          minWidth: '20px',
                          textAlign: 'center',
                        }}>
                          {etapa.ordem}
                        </span>
                        <Input
                          value={etapa.nome}
                          onChange={e => handleEtapaNome(eIdx, e.target.value)}
                          placeholder="Nome da etapa"
                          style={{ ...INPUT_STYLE, flex: 1, height: '30px' }}
                        />
                        <button
                          onClick={() => handleRemoveEtapa(eIdx)}
                          style={{ color: '#C84040', opacity: 0.7, padding: '4px' }}
                          className="hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Documentos */}
                      <div className="pl-7 flex flex-col gap-1">
                        {etapa.documentos.map((doc, dIdx) => (
                          <div key={dIdx} className="flex items-center gap-2 group">
                            <FileText className="w-3 h-3" style={{ color: '#5A5D70', flexShrink: 0 }} />
                            <Input
                              value={docLabels[doc] ?? docLabel(doc)}
                              onChange={(e) => setDocLabels({ ...docLabels, [doc]: e.target.value })}
                              placeholder={docLabel(doc)}
                              style={{ ...INPUT_STYLE, flex: 1, height: '24px', fontSize: '11px' }}
                            />
                            <span style={{ fontSize: '9px', color: '#5A5D70', fontFamily: 'monospace', flexShrink: 0 }}>
                              {doc}
                            </span>
                            <button
                              onClick={() => handleRemoveDoc(eIdx, dIdx)}
                              style={{ color: '#C84040', opacity: 0, padding: '2px', flexShrink: 0 }}
                              className="group-hover:opacity-70 hover:!opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}

                        {/* Add doc input */}
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            value={novoDocInputs[eIdx] || ''}
                            onChange={e => setNovoDocInputs({ ...novoDocInputs, [eIdx]: e.target.value })}
                            placeholder="Novo documento..."
                            style={{ ...INPUT_STYLE, height: '26px', fontSize: '11px', flex: 1 }}
                            onKeyDown={e => e.key === 'Enter' && handleAddDoc(eIdx)}
                          />
                          <button
                            onClick={() => handleAddDoc(eIdx)}
                            style={{ color: 'var(--notion-blue)', padding: '2px' }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Templates de Email */}
            <div>
              <Label style={{ ...LABEL_STYLE, fontSize: '12px', marginBottom: '8px', display: 'block' }}>
                Templates de Email
              </Label>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label style={LABEL_STYLE}>Assunto (use {'{numero}'} e {'{placa}'})</Label>
                  <Input
                    value={emailAssunto}
                    onChange={e => setEmailAssunto(e.target.value)}
                    placeholder="OS #{numero} - {placa} - Documentação"
                    style={INPUT_STYLE}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label style={LABEL_STYLE}>Corpo do email</Label>
                  <textarea
                    value={emailCorpo}
                    onChange={e => setEmailCorpo(e.target.value)}
                    rows={3}
                    placeholder="Segue documentação referente à OS #{numero}..."
                    style={{
                      ...INPUT_STYLE,
                      borderRadius: '6px',
                      padding: '8px 12px',
                      resize: 'vertical',
                      minHeight: '60px',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter
          className="flex items-center justify-end gap-2"
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--notion-border)',
            background: 'var(--notion-bg-alt)',
          }}
        >
          <Button variant="ghost" onClick={onClose} style={{ fontSize: '12px', color: 'var(--notion-text-secondary)' }}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!nome.trim()}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              background: nome.trim() ? 'var(--notion-blue)' : 'var(--notion-border)',
              color: nome.trim() ? '#fff' : 'var(--notion-text-secondary)',
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

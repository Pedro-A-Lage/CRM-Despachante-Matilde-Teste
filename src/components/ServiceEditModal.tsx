// src/components/ServiceEditModal.tsx
import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { DocListEditor } from './DocListEditor';
import {
  ServiceConfig, DocumentoExtra,
  updateServiceConfig, createServiceConfig, deleteServiceConfig,
} from '../lib/configService';
import { getPriceTable, getServicePrices, updateServicePrice } from '../lib/financeService';
import type { PriceTableItem, ServicePrice } from '../types/finance';

// Codes already managed by DAE/Vistoria/Placa toggles — exclude from custos extras list
const MANAGED_CODES = new Set([
  'dae_principal', 'dae_alteracao', 'vistoria',
  'placa_carro_mercosul', 'placa_moto_mercosul',
  'placa_carro_comum', 'placa_moto_comum',
]);

const CONDICAO_OPTIONS = [
  { label: 'Sempre', value: 'sempre' as const },
  { label: 'Se troca de placa', value: 'se_troca' as const },
];

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

const DAE_OPTIONS = [
  { label: 'Sem DAE', value: '__none__' },
  { label: 'Principal', value: 'principal' },
  { label: 'Alteração', value: 'alteracao' },
];

const VISTORIA_PLACA_OPTIONS = [
  { label: 'Nunca', value: 'nunca' },
  { label: 'Sempre', value: 'sempre' },
  { label: 'Se troca', value: 'se_troca' },
];

interface ServiceEditModalProps {
  open: boolean;
  config: ServiceConfig | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function ServiceEditModal({ open, config, onClose, onSaved, onDeleted }: ServiceEditModalProps) {
  const [activeTab, setActiveTab] = useState<'config' | 'docs'>('config');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form state
  const [tipoServico, setTipoServico] = useState('');
  const [nomeExibicao, setNomeExibicao] = useState('');
  const [daeTipo, setDaeTipo] = useState<string>('__none__');
  const [geraVistoria, setGeraVistoria] = useState('nunca');
  const [geraPlaca, setGeraPlaca] = useState('nunca');
  const [ativo, setAtivo] = useState(true);
  const [docsPf, setDocsPf] = useState<string[]>([]);
  const [docsPj, setDocsPj] = useState<string[]>([]);
  const [extrasCondicoes, setExtrasCondicoes] = useState<DocumentoExtra[]>([]);
  const [custosExtras, setCustosExtras] = useState<Array<{ codigo: string; condicao: 'sempre' | 'se_troca' }>>([]);
  const [priceItems, setPriceItems] = useState<PriceTableItem[]>([]);
  const [servicePrices, setServicePrices] = useState<ServicePrice[]>([]);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceVal, setEditingPriceVal] = useState('');
  const [priceSaved, setPriceSaved] = useState<string | null>(null);

  // Load price table items and service prices when modal opens
  useEffect(() => {
    if (!open) return;
    getPriceTable()
      .then(items => setPriceItems(items.filter(i => !MANAGED_CODES.has(i.codigo))))
      .catch(() => setPriceItems([]));
    getServicePrices()
      .then(setServicePrices)
      .catch(() => setServicePrices([]));
  }, [open]);

  // Reset/populate form when modal opens
  useEffect(() => {
    if (!open) return;
    setActiveTab('config');
    setError(null);
    setSaving(false);
    if (config) {
      setTipoServico(config.tipo_servico);
      setNomeExibicao(config.nome_exibicao);
      setDaeTipo(config.dae_tipo ?? '__none__');
      setGeraVistoria(config.gera_vistoria);
      setGeraPlaca(config.gera_placa);
      setAtivo(config.ativo);
      setDocsPf([...config.documentos_pf]);
      setDocsPj([...config.documentos_pj]);
      setExtrasCondicoes(config.documentos_extras ? config.documentos_extras.map(e => ({ ...e, docs: [...e.docs] })) : []);
      setCustosExtras(config.custosExtras ? config.custosExtras.map(c => ({ ...c })) : []);
    } else {
      setTipoServico('');
      setNomeExibicao('');
      setDaeTipo('__none__');
      setGeraVistoria('nunca');
      setGeraPlaca('nunca');
      setAtivo(true);
      setDocsPf([]);
      setDocsPj([]);
      setExtrasCondicoes([]);
      setCustosExtras([]);
    }
  }, [open, config]);

  const handleSave = async () => {
    if (!nomeExibicao.trim()) { setError('Nome é obrigatório.'); return; }
    if (!config) {
      if (!tipoServico.trim()) { setError('Identificador é obrigatório.'); return; }
      if (!/^[a-z0-9_]+$/.test(tipoServico)) { setError('Identificador: apenas letras minúsculas, números e _.'); return; }
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        nome_exibicao: nomeExibicao.trim(),
        dae_tipo: daeTipo === '__none__' ? null : daeTipo,
        gera_vistoria: geraVistoria,
        gera_placa: geraPlaca,
        ativo,
        documentos_pf: docsPf,
        documentos_pj: docsPj,
        documentos_extras: extrasCondicoes,
        custosExtras,
      };

      if (config) {
        await updateServiceConfig(config.id, payload);
      } else {
        await createServiceConfig({ tipo_servico: tipoServico.trim(), ...payload });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      await deleteServiceConfig(config.id);
      onDeleted();
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao excluir.');
      setSaving(false);
    }
  };

  const updateExtraCondicao = (idx: number, condicao: string) => {
    setExtrasCondicoes(prev => prev.map((e, i) => i === idx ? { ...e, condicao } : e));
  };

  const updateExtraDocs = (idx: number, docs: string[]) => {
    setExtrasCondicoes(prev => prev.map((e, i) => i === idx ? { ...e, docs } : e));
  };

  const removeExtra = (idx: number) => {
    setExtrasCondicoes(prev => prev.filter((_, i) => i !== idx));
  };

  const addExtra = () => {
    setExtrasCondicoes(prev => [...prev, { condicao: '', docs: [] }]);
  };

  return (
    <>
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
            <div style={{ marginBottom: '14px', paddingRight: '32px' }}>
              <DialogTitle style={{ fontSize: '15px', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                {config ? 'Editar Serviço' : 'Novo Serviço'}
              </DialogTitle>
              {config && (
                <p style={{ fontSize: '11px', color: '#d4a843', marginTop: '3px', fontWeight: 500 }}>
                  {config.nome_exibicao}
                </p>
              )}
            </div>

          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'config' | 'docs')}>
            <TabsList
              className="w-full mb-4"
              style={{ background: 'var(--notion-bg-alt)', padding: '3px', borderRadius: '8px', height: 'auto', border: '1px solid var(--notion-border)' }}
            >
              <TabsTrigger
                value="config"
                className="flex-1 data-[state=active]:bg-[#0075de] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-[var(--notion-text-secondary)] data-[state=inactive]:bg-transparent"
                style={{ borderRadius: '6px', fontSize: '11px', fontWeight: 600, padding: '6px 8px' }}
              >
                ⚙ Configurações
              </TabsTrigger>
              <TabsTrigger
                value="docs"
                className="flex-1 data-[state=active]:bg-[#0075de] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-[var(--notion-text-secondary)] data-[state=inactive]:bg-transparent"
                style={{ borderRadius: '6px', fontSize: '11px', fontWeight: 600, padding: '6px 8px' }}
              >
                📄 Documentos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="flex flex-col gap-4 pt-2">
              {/* Identificador — só na criação */}
              {!config && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tipo_servico" style={LABEL_STYLE}>Identificador</Label>
                  <Input
                    id="tipo_servico"
                    value={tipoServico}
                    onChange={e => setTipoServico(e.target.value)}
                    placeholder="ex: meu_servico_novo"
                    style={INPUT_STYLE}
                  />
                  <p className="text-xs text-muted-foreground">Apenas letras minúsculas, números e _. Não pode ser alterado depois.</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nome_exibicao" style={LABEL_STYLE}>Nome de Exibição</Label>
                <Input
                  id="nome_exibicao"
                  value={nomeExibicao}
                  onChange={e => setNomeExibicao(e.target.value)}
                  placeholder="ex: Transferência de Propriedade"
                  style={INPUT_HIGHLIGHT_STYLE}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label style={LABEL_STYLE}>DAE</Label>
                  <Select value={daeTipo} onValueChange={setDaeTipo}>
                    <SelectTrigger style={INPUT_STYLE}><SelectValue /></SelectTrigger>
                    <SelectContent >
                      {DAE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label style={LABEL_STYLE}>Gera Vistoria</Label>
                  <Select value={geraVistoria} onValueChange={setGeraVistoria}>
                    <SelectTrigger style={INPUT_STYLE}><SelectValue /></SelectTrigger>
                    <SelectContent >
                      {VISTORIA_PLACA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label style={LABEL_STYLE}>Gera Placa</Label>
                  <Select value={geraPlaca} onValueChange={setGeraPlaca}>
                    <SelectTrigger style={INPUT_STYLE}><SelectValue /></SelectTrigger>
                    <SelectContent >
                      {VISTORIA_PLACA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                <Switch
                  id="ativo"
                  checked={ativo}
                  onCheckedChange={setAtivo}
                  className="data-[state=checked]:bg-[#0075de] [&>span]:bg-surface"
                />
                <Label htmlFor="ativo" style={{ ...LABEL_STYLE, color: 'var(--notion-text)', fontSize: '12px', cursor: 'pointer' }}>
                  Serviço ativo
                </Label>
              </div>

              {/* Custos Extras Automáticos */}
              {priceItems.length > 0 && (
                <div className="flex flex-col gap-2" style={{ marginTop: '8px' }}>
                  <Label style={{ ...LABEL_STYLE, fontSize: '12px', color: 'var(--notion-text-secondary)' }}>
                    Custos Extras Automáticos
                  </Label>
                  <p style={{ fontSize: '11px', color: '#6b7a99', marginTop: '-4px' }}>
                    Selecione os custos cobrados automaticamente ao criar uma OS deste serviço.
                  </p>
                  <div
                    className="flex flex-col gap-1"
                    style={{
                      background: 'var(--notion-bg-alt)',
                      border: '1px solid var(--notion-border)',
                      borderRadius: '8px',
                      padding: '10px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                    }}
                  >
                    {priceItems.map(item => {
                      const selected = custosExtras.find(c => c.codigo === item.codigo);
                      return (
                        <div
                          key={item.codigo}
                          className="flex items-center gap-3"
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            background: selected ? 'rgba(0,117,222,0.08)' : 'transparent',
                          }}
                        >
                          <input
                            type="checkbox"
                            id={`custo-${item.codigo}`}
                            checked={!!selected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCustosExtras(prev => [...prev, { codigo: item.codigo, condicao: 'sempre' }]);
                              } else {
                                setCustosExtras(prev => prev.filter(c => c.codigo !== item.codigo));
                              }
                            }}
                            style={{ accentColor: '#0075de', width: '14px', height: '14px', cursor: 'pointer' }}
                          />
                          <label
                            htmlFor={`custo-${item.codigo}`}
                            style={{ flex: 1, fontSize: '12px', color: 'var(--notion-text)', cursor: 'pointer' }}
                          >
                            {item.descricao}
                            <span style={{ color: '#6b7a99', marginLeft: '6px', fontSize: '11px' }}>
                              R$ {item.valor.toFixed(2)}
                            </span>
                          </label>
                          {selected && (
                            <Select
                              value={selected.condicao}
                              onValueChange={(val: 'sempre' | 'se_troca') => {
                                setCustosExtras(prev =>
                                  prev.map(c => c.codigo === item.codigo ? { ...c, condicao: val } : c)
                                );
                              }}
                            >
                              <SelectTrigger style={{ ...INPUT_STYLE, width: '150px', height: '28px', fontSize: '11px' }}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CONDICAO_OPTIONS.map(o => (
                                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preços do Serviço — só na edição */}
              {config && (() => {
                const myPrices = servicePrices
                  .filter(p => p.tipo_servico === config.tipo_servico)
                  .sort((a, b) => {
                    // Com placa primeiro, depois sem placa. Dentro de cada grupo: carro antes de moto
                    if (a.com_placa !== b.com_placa) return a.com_placa ? -1 : 1;
                    return a.tipo_veiculo === 'carro' ? -1 : 1;
                  });
                if (myPrices.length === 0) return null;
                return (
                  <div className="flex flex-col gap-2" style={{ marginTop: '8px' }}>
                    <Label style={{ ...LABEL_STYLE, fontSize: '12px', color: 'var(--notion-text-secondary)' }}>
                      Preços do Serviço
                    </Label>
                    <p style={{ fontSize: '11px', color: '#6b7a99', marginTop: '-4px' }}>
                      Valores cobrados do cliente ao criar uma OS. Alterações valem apenas para novas OS.
                    </p>
                    <div
                      style={{
                        background: 'var(--notion-bg-alt)',
                        border: '1px solid var(--notion-border)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                      }}
                    >
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--notion-border)' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7a99', fontWeight: 600, fontSize: '11px' }}>Placa</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7a99', fontWeight: 600, fontSize: '11px' }}>Veículo</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7a99', fontWeight: 600, fontSize: '11px' }}>Valor</th>
                            <th style={{ padding: '8px 4px', width: '36px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {myPrices.map(sp => (
                            <tr key={sp.id} style={{ borderBottom: '1px solid var(--notion-border)' }}>
                              <td style={{ padding: '8px 10px', color: 'var(--notion-text)' }}>
                                {sp.com_placa ? 'Com placa' : 'Sem placa'}
                              </td>
                              <td style={{ padding: '8px 10px', color: 'var(--notion-text)' }}>
                                {sp.tipo_veiculo === 'carro' ? 'Carro' : 'Moto'}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                {editingPriceId === sp.id ? (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                    <span style={{ color: '#6b7a99', fontSize: '11px' }}>R$</span>
                                    <input
                                      value={editingPriceVal}
                                      onChange={e => setEditingPriceVal(e.target.value)}
                                      autoFocus
                                      style={{
                                        ...INPUT_STYLE,
                                        width: '90px',
                                        textAlign: 'right',
                                        padding: '4px 6px',
                                        borderRadius: '4px',
                                      }}
                                      onKeyDown={async e => {
                                        if (e.key === 'Enter') {
                                          const val = parseFloat(editingPriceVal.replace(',', '.'));
                                          if (!isNaN(val) && val >= 0) {
                                            await updateServicePrice(sp.id, val);
                                            setServicePrices(prev => prev.map(p => p.id === sp.id ? { ...p, valor: val } : p));
                                            setEditingPriceId(null);
                                            setPriceSaved(sp.id);
                                            setTimeout(() => setPriceSaved(null), 2000);
                                          }
                                        } else if (e.key === 'Escape') {
                                          setEditingPriceId(null);
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={async () => {
                                        const val = parseFloat(editingPriceVal.replace(',', '.'));
                                        if (!isNaN(val) && val >= 0) {
                                          await updateServicePrice(sp.id, val);
                                          setServicePrices(prev => prev.map(p => p.id === sp.id ? { ...p, valor: val } : p));
                                          setEditingPriceId(null);
                                          setPriceSaved(sp.id);
                                          setTimeout(() => setPriceSaved(null), 2000);
                                        }
                                      }}
                                      style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: '14px', padding: '2px' }}
                                    >✓</button>
                                  </div>
                                ) : (
                                  <span style={{ color: priceSaved === sp.id ? '#22c55e' : 'var(--notion-text)', fontWeight: 600, transition: 'color 0.3s' }}>
                                    {priceSaved === sp.id ? '✓ ' : ''}R$ {sp.valor.toFixed(2).replace('.', ',')}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                                {editingPriceId !== sp.id && (
                                  <button
                                    onClick={() => { setEditingPriceId(sp.id); setEditingPriceVal(sp.valor.toFixed(2).replace('.', ',')); }}
                                    style={{ background: 'none', border: 'none', color: '#6b7a99', cursor: 'pointer', fontSize: '13px', padding: '2px' }}
                                  >✏️</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="docs" className="flex flex-col gap-6 pt-2">
              <DocListEditor label="Documentos PF" docs={docsPf} onChange={setDocsPf} />
              <DocListEditor label="Documentos PJ" docs={docsPj} onChange={setDocsPj} />

              <div className="flex flex-col gap-3">
                <Label>Documentos Extras (condicionais)</Label>
                {extrasCondicoes.map((extra, idx) => (
                  <div key={idx} className="rounded-md border p-3 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={extra.condicao}
                        onChange={e => updateExtraCondicao(idx, e.target.value)}
                        placeholder="Condição (ex: vendedor_pj)"
                        className="flex-1"
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeExtra(idx)}>
                        <span className="sr-only">Remover condição</span>
                        ✕
                      </Button>
                    </div>
                    <DocListEditor
                      label={`Docs se: ${extra.condicao || '(condição)'}`}
                      docs={extra.docs}
                      onChange={docs => updateExtraDocs(idx, docs)}
                    />
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addExtra} className="self-start">
                  + Nova Condição
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </div>

        <div style={{ height: '1px', background: 'var(--notion-border)' }} />

        <div style={{ padding: '14px 20px 20px 20px' }}>
          <DialogFooter className="flex-row justify-between items-center">
            <div>
              {config && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#e05454',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.5 : 1,
                    padding: '4px 0',
                  }}
                >
                  Excluir serviço
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={saving}
                style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-secondary)', fontSize: '12px' }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  background: saving ? 'var(--notion-blue-hover)' : 'var(--notion-blue)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '12px',
                  border: 'none',
                  boxShadow: saving ? 'none' : '0 2px 8px rgba(0,117,222,0.3)',
                }}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </DialogFooter>
        </div>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de confirmação para exclusão */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O serviço "{config?.nome_exibicao}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// src/pages/Configuracoes.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Settings, Edit2, DollarSign, Plus, Trash2, Save, Building2 } from 'lucide-react';
import {
  getAllServiceConfigs, invalidateConfigCache,
} from '../lib/configService';
import type { ServiceConfig } from '../lib/configService';
import { getPriceTable, updatePriceItem, addPriceItem, deactivatePriceItem, getServicePrices, updateServicePrice } from '../lib/financeService';
import type { PriceTableItem, ServicePrice } from '../types/finance';
import { supabase } from '../lib/supabaseClient';
import { ServiceEditModal } from '../components/ServiceEditModal';
import { getEmpresas, saveEmpresa, deleteEmpresa } from '../lib/empresaService';
import type { EmpresaParceira } from '../types/empresa';
import { EmpresaEditModal } from '../components/EmpresaEditModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Configuracoes() {
  const [configs, setConfigs] = useState<ServiceConfig[]>([]);
  const [custos, setCustos] = useState<PriceTableItem[]>([]);
  const [precos, setPrecos] = useState<ServicePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<ServiceConfig | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaParceira[]>([]);
  const [editingEmpresa, setEditingEmpresa] = useState<Partial<EmpresaParceira> | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgs, priceItems, servicePrices, emps] = await Promise.all([
        getAllServiceConfigs(),
        getPriceTable(),
        getServicePrices(),
        getEmpresas(),
      ]);
      setConfigs(cfgs);
      setCustos(priceItems);
      setPrecos(servicePrices);
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

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <Settings size={24} color="var(--notion-blue)" />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--notion-text)', margin: 0 }}>
            Configurações de Serviços
          </h1>
          <p style={{ fontSize: 14, color: 'var(--notion-text-secondary)', margin: '4px 0 0' }}>
            Gerencie os tipos de serviço, documentos exigidos e configurações de custo.
          </p>
        </div>
      </div>

      <Tabs defaultValue="servicos">
        <TabsList className="mb-4">
          <TabsTrigger value="servicos">⚙ Serviços DETRAN</TabsTrigger>
          <TabsTrigger value="custos">💰 Custos Fixos</TabsTrigger>
          <TabsTrigger value="empresas" className="flex items-center gap-1">
            <Building2 className="w-4 h-4" />
            Empresas
          </TabsTrigger>
          {/* Preços agora ficam dentro do modal de cada serviço */}
        </TabsList>

        {/* ── Aba Serviços DETRAN ── */}
        <TabsContent value="servicos">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--notion-text)', margin: 0 }}>
              Serviços cadastrados
            </h2>
            <Button onClick={openNew} size="sm">
              <Plus className="mr-1 size-4" />
              Novo Serviço
            </Button>
          </div>

          {loading ? (
            <p style={{ color: 'var(--notion-text-secondary)', textAlign: 'center', padding: 48 }}>
              Carregando configurações...
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Docs PF</TableHead>
                    <TableHead>Docs PJ</TableHead>
                    <TableHead>DAE</TableHead>
                    <TableHead>Vistoria</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                        Nenhum serviço cadastrado. Clique em "Novo Serviço" para começar.
                      </TableCell>
                    </TableRow>
                  ) : configs.map(cfg => (
                    <TableRow key={cfg.id}>
                      <TableCell className="font-medium">{cfg.nome_exibicao}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{cfg.documentos_pf.length} doc{cfg.documentos_pf.length !== 1 ? 's' : ''}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{cfg.documentos_pj.length} doc{cfg.documentos_pj.length !== 1 ? 's' : ''}</Badge>
                      </TableCell>
                      <TableCell>{daeLabel(cfg.dae_tipo)}</TableCell>
                      <TableCell>{opcaoLabel(cfg.gera_vistoria)}</TableCell>
                      <TableCell>{opcaoLabel(cfg.gera_placa)}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.ativo ? 'default' : 'secondary'}>
                          {cfg.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(cfg)}>
                          <Edit2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Aba Custos Fixos ── */}
        <TabsContent value="custos">
          <CustosFixosSection custos={custos} onDataChanged={carregar} />
        </TabsContent>

        {/* Preços por serviço agora ficam dentro do ServiceEditModal */}

        {/* ── Aba Empresas Parceiras ── */}
        <TabsContent value="empresas">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 size={18} color="var(--notion-blue)" />
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--notion-text)', margin: 0 }}>
                Empresas Parceiras
              </h2>
            </div>
            <Button
              size="sm"
              onClick={() => setEditingEmpresa({ nome: '', cor: '#3B82F6', ativo: true, etapasEnvio: [] })}
            >
              <Plus className="mr-1 size-4" />
              Nova Empresa
            </Button>
          </div>

          {empresas.length === 0 ? (
            <div className="rounded-md border" style={{ padding: 48, textAlign: 'center' }}>
              <p style={{ color: 'var(--notion-text-secondary)' }}>
                Nenhuma empresa parceira cadastrada. Clique em "Nova Empresa" para começar.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Valor Serviço</TableHead>
                    <TableHead>Valor Placa</TableHead>
                    <TableHead>Etapas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empresas.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block rounded-full"
                            style={{
                              width: 10,
                              height: 10,
                              backgroundColor: emp.cor,
                              boxShadow: `0 0 6px ${emp.cor}40`,
                            }}
                          />
                          {emp.nome}
                        </div>
                      </TableCell>
                      <TableCell style={{ color: emp.email ? 'var(--notion-text-secondary)' : 'var(--notion-text-secondary)' }}>
                        {emp.email || '—'}
                      </TableCell>
                      <TableCell>{emp.valorServico != null ? maskMoney(emp.valorServico) : '—'}</TableCell>
                      <TableCell>{emp.valorPlaca != null ? maskMoney(emp.valorPlaca) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{emp.etapasEnvio.length} etapa{emp.etapasEnvio.length !== 1 ? 's' : ''}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={emp.ativo ? 'default' : 'secondary'}>
                          {emp.ativo ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setEditingEmpresa(emp)}>
                          <Edit2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

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

// ── Preços por Serviço Section ────────────────────────────────────────────────
function PrecosServicoSection({
  precos, configs, onDataChanged,
}: {
  precos: ServicePrice[];
  configs: ServiceConfig[];
  onDataChanged: () => void;
}) {
  const [editingPrice, setEditingPrice] = useState<{ id: string; valor: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  // Build a map from tipo_servico → display name
  const labelMap: Record<string, string> = {};
  for (const c of configs) {
    labelMap[c.tipo_servico] = c.nome_exibicao;
  }

  // Group prices by tipo_servico
  const grouped: Record<string, ServicePrice[]> = {};
  for (const p of precos) {
    if (!grouped[p.tipo_servico]) grouped[p.tipo_servico] = [];
    grouped[p.tipo_servico]!.push(p);
  }

  const salvarPreco = async (priceId: string, valorStr: string) => {
    try {
      await updateServicePrice(priceId, unmaskMoney(valorStr));
      setEditingPrice(null);
      setError(null);
      setSuccessId(priceId);
      setTimeout(() => setSuccessId(null), 2000);
      onDataChanged();
    } catch {
      setError('Erro ao salvar preço.');
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <DollarSign size={18} color="var(--notion-blue)" />
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--notion-text)', margin: 0 }}>
          Preços por Serviço
        </h2>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-3">{error}</p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead>Tipo Veículo</TableHead>
              <TableHead>Com Placa</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {precos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum preço de serviço cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              Object.entries(grouped).map(([tipoServico, items]) => (
                <React.Fragment key={tipoServico}>
                  {items.map((price, idx) => (
                    <TableRow key={price.id}>
                      {idx === 0 && (
                        <TableCell rowSpan={items.length} className="font-medium align-middle border-r">
                          {labelMap[tipoServico] ?? tipoServico}
                        </TableCell>
                      )}
                      <TableCell>{price.tipo_veiculo === 'carro' ? 'Carro' : 'Moto'}</TableCell>
                      <TableCell>{price.com_placa ? 'Sim' : 'Não'}</TableCell>
                      <TableCell>
                        {editingPrice?.id === price.id ? (
                          <Input
                            className="w-32"
                            value={editingPrice.valor}
                            onChange={e => setEditingPrice({ id: price.id, valor: e.target.value })}
                            placeholder="R$ 0,00"
                            autoFocus
                          />
                        ) : (
                          <span className={successId === price.id ? 'text-green-600 font-semibold' : ''}>
                            {maskMoney(price.valor)}
                            {successId === price.id && ' ✓'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingPrice?.id === price.id ? (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => salvarPreco(price.id, editingPrice.valor)}>
                              <Save className="size-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => { setEditingPrice(null); setError(null); }}>
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="icon" variant="ghost" onClick={() => setEditingPrice({ id: price.id, valor: maskMoney(price.valor) })}>
                            <Edit2 className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign size={18} color="var(--notion-blue)" />
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--notion-text)', margin: 0 }}>
            Custos Fixos
          </h2>
        </div>
        {!newCost && (
          <Button size="sm" variant="outline" onClick={() => setNewCost({ descricao: '', codigo: '', valor: '' })}>
            <Plus className="mr-1 size-4" />
            Adicionar
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive mb-3">{error}</p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {custos.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Nenhum custo fixo cadastrado.
                </TableCell>
              </TableRow>
            )}
            {custos.map(cost => (
              <TableRow key={cost.id}>
                <TableCell>{cost.descricao}</TableCell>
                <TableCell className="font-mono text-sm">{cost.codigo}</TableCell>
                <TableCell>
                  {editingCost?.id === cost.id ? (
                    <Input
                      className="w-32"
                      value={editingCost.valor}
                      onChange={e => setEditingCost({ id: cost.id, valor: e.target.value })}
                      placeholder="R$ 0,00"
                      autoFocus
                    />
                  ) : (
                    maskMoney(cost.valor)
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {editingCost?.id === cost.id ? (
                      <Button size="icon" variant="ghost" onClick={() => salvarCusto(cost.id, editingCost.valor)}>
                        <Save className="size-4" />
                      </Button>
                    ) : (
                      <Button size="icon" variant="ghost" onClick={() => setEditingCost({ id: cost.id, valor: maskMoney(cost.valor) })}>
                        <Edit2 className="size-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => removerCusto(cost.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {newCost && (
              <TableRow>
                <TableCell>
                  <Input
                    value={newCost.descricao}
                    onChange={e => setNewCost({ ...newCost, descricao: e.target.value })}
                    placeholder="Descrição"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newCost.codigo}
                    onChange={e => setNewCost({ ...newCost, codigo: e.target.value })}
                    placeholder="codigo_custo"
                    className="font-mono"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newCost.valor}
                    onChange={e => setNewCost({ ...newCost, valor: e.target.value })}
                    placeholder="R$ 0,00"
                    className="w-32"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={adicionarCusto}>
                      <Save className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => { setNewCost(null); setError(null); }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

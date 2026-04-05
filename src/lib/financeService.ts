// src/lib/financeService.ts
import { supabase } from './supabaseClient';
import type {
  FinanceCharge,
  FinanceChargeCategoria,
  Payment,
  PaymentMetodo,
  PriceTableItem,
  FinanceResumo,
  ServicePrice,
  TipoVeiculo,
  ChargeWithOS,
  OSChargeGroup,
  ControleResumo,
} from '../types/finance';

import { getServiceConfig } from './configService';

// ── PRICE TABLE ──────────────────────────────────────────────

export async function getPriceTable(): Promise<PriceTableItem[]> {
  const { data, error } = await supabase
    .from('price_table')
    .select('*')
    .eq('ativo', true)
    .order('descricao');
  if (error) throw error;
  return (data as PriceTableItem[]).map(item => ({ ...item, valor: Number(item.valor) }));
}

export async function updatePriceItem(id: string, valor: number): Promise<void> {
  const { error } = await supabase
    .from('price_table')
    .update({ valor })
    .eq('id', id);
  if (error) throw error;
}

export async function getPriceByCodigo(codigo: string): Promise<number> {
  const { data, error } = await supabase
    .from('price_table')
    .select('valor')
    .eq('codigo', codigo)
    .eq('ativo', true)
    .single();
  if (error) return 0;
  return Number((data as { valor: number }).valor);
}

export async function addPriceItem(item: { codigo: string; descricao: string; valor: number }): Promise<void> {
  const { error } = await supabase.from('price_table').insert({
    codigo: item.codigo,
    descricao: item.descricao,
    valor: item.valor,
    ativo: true,
  });
  if (error) throw error;
}

export async function deactivatePriceItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('price_table')
    .update({ ativo: false })
    .eq('id', id);
  if (error) throw error;
}

export async function cancelarCobrancasDaOS(osId: string): Promise<number> {
  const { data: charges, error: fetchErr } = await supabase
    .from('finance_charges')
    .select('id')
    .eq('os_id', osId)
    .neq('status', 'cancelado');
  if (fetchErr) throw fetchErr;
  if (!charges || charges.length === 0) return 0;

  const ids = charges.map(c => c.id);
  const { error: updateErr } = await supabase
    .from('finance_charges')
    .update({ status: 'cancelado', atualizado_em: new Date().toISOString() })
    .in('id', ids);
  if (updateErr) throw updateErr;
  return charges.length;
}

// ── BATCH HELPER ────────────────────────────────────────────────
const BATCH_SIZE = 15;

export async function batchIn<T>(table: string, cols: string, ids: string[]): Promise<T[]> {
  if (ids.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from(table).select(cols).in('id', chunk);
    if (error) throw error;
    if (data) results.push(...(data as T[]));
  }
  return results;
}

// ── SERVICE PRICES (preço cobrado ao cliente) ────────────────

export async function getServicePrices(): Promise<ServicePrice[]> {
  const { data, error } = await supabase
    .from('service_prices')
    .select('*')
    .eq('ativo', true)
    .order('tipo_servico');
  if (error) throw error;
  return (data as ServicePrice[]).map(item => ({ ...item, valor: Number(item.valor) }));
}

export async function getServicePrice(
  tipoServico: string,
  tipoVeiculo: TipoVeiculo,
  comPlaca: boolean,
): Promise<number> {
  const config = await getServiceConfig(tipoServico);
  if (!config || !config.ativo) {
    throw new Error(`Serviço não configurado ou inativo: ${tipoServico}`);
  }

  const { data, error } = await supabase
    .from('service_prices')
    .select('valor')
    .eq('tipo_servico', tipoServico)
    .eq('tipo_veiculo', tipoVeiculo)
    .eq('com_placa', comPlaca)
    .eq('ativo', true)
    .single();

  if (error || !data) {
    throw new Error(`Preço não encontrado para serviço ${tipoServico} / veículo ${tipoVeiculo} / comPlaca=${comPlaca}`);
  }
  return Number((data as { valor: number }).valor);
}

export async function updateServicePrice(id: string, valor: number): Promise<void> {
  const { error } = await supabase
    .from('service_prices')
    .update({ valor })
    .eq('id', id);
  if (error) throw error;
}

// ── DESCONTO ──────────────────────────────────────────────────

export async function getDescontoOS(osId: string): Promise<number> {
  const { data, error } = await supabase
    .from('ordens_de_servico')
    .select('desconto')
    .eq('id', osId)
    .single();
  if (error) return 0;
  return Number((data as { desconto: number | null }).desconto) || 0;
}

export async function saveDescontoOS(osId: string, desconto: number): Promise<void> {
  const { error } = await supabase
    .from('ordens_de_servico')
    .update({ desconto })
    .eq('id', osId);
  if (error) throw error;
}

// ── COBRANÇAS ─────────────────────────────────────────────────

export async function getChargesByOS(osId: string): Promise<FinanceCharge[]> {
  const { data, error } = await supabase
    .from('finance_charges')
    .select('*')
    .eq('os_id', osId)
    .order('criado_em');
  if (error) throw error;
  return (data as FinanceCharge[]).map(c => ({
    ...c,
    valor_previsto: Number(c.valor_previsto),
    valor_pago: Number(c.valor_pago),
    status: (String(c.status).trim().toLowerCase() as FinanceCharge['status']),
  }));
}

export async function addCharge(
  osId: string,
  descricao: string,
  categoria: FinanceChargeCategoria,
  valorPrevisto: number,
  dueDate?: string,
  observacao?: string,
): Promise<FinanceCharge> {
  const { data, error } = await supabase
    .from('finance_charges')
    .insert({
      os_id: osId,
      descricao,
      categoria,
      valor_previsto: valorPrevisto,
      due_date: dueDate ?? null,
      observacao: observacao ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as FinanceCharge;
}

export async function updateCharge(
  id: string,
  updates: Partial<Pick<FinanceCharge, 'descricao' | 'valor_previsto' | 'due_date' | 'status' | 'observacao' | 'comprovante_url' | 'valor_pago'>>,
): Promise<void> {
  const { error } = await supabase
    .from('finance_charges')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCharge(id: string): Promise<void> {
  const { error } = await supabase
    .from('finance_charges')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function gerarCobrancasIniciais(
  osId: string,
  tipoServico: string,
  tipoVeiculo: TipoVeiculo,
  trocaPlaca: boolean,
  forceRegenerate = false,
  empresaValorPlaca?: number,
): Promise<void> {
  let regra: { dae: 'principal' | 'alteracao' | false; vistoria: boolean | 'se_troca'; placa: 'sempre' | 'se_troca' | 'nunca' } | undefined;

  const config = await getServiceConfig(tipoServico);
  if (!config || !config.ativo) {
    throw new Error(`Serviço não configurado ou inativo para geração de cobranças: ${tipoServico}`);
  }

  const dae: 'principal' | 'alteracao' | false =
    config.dae_tipo === 'principal' ? 'principal' :
    config.dae_tipo === 'alteracao' ? 'alteracao' :
    false;

  const vistoria: boolean | 'se_troca' =
    config.gera_vistoria === 'sempre' ? true :
    config.gera_vistoria === 'se_troca' ? 'se_troca' :
    false;

  const placa: 'sempre' | 'se_troca' | 'nunca' =
    config.gera_placa === 'sempre' ? 'sempre' :
    config.gera_placa === 'se_troca' ? 'se_troca' :
    'nunca';

  regra = { dae, vistoria, placa };
  if (!regra) return;

  if (forceRegenerate) {
    // Delete existing a_pagar charges for dae_principal, dae_adicional, and vistoria
    // before regenerating to prevent duplicates when tipoServico changes
    const { error: delError } = await supabase
      .from('finance_charges')
      .delete()
      .eq('os_id', osId)
      .eq('status', 'a_pagar')
      .in('categoria', ['dae_principal', 'dae_adicional', 'vistoria', 'outro']);
    if (delError) throw delError;
  } else {
    // If not forceRegenerate, check if charges already exist to avoid duplicates
    const { data: existing } = await supabase
      .from('finance_charges')
      .select('id')
      .eq('os_id', osId)
      .in('categoria', ['dae_principal', 'dae_adicional', 'vistoria'])
      .neq('status', 'cancelado');
    if (existing && existing.length > 0) return;
  }

  const inserts: {
    os_id: string;
    descricao: string;
    categoria: FinanceChargeCategoria;
    valor_previsto: number;
  }[] = [];

  if (regra.dae) {
    const codigo = regra.dae === 'alteracao' ? 'dae_alteracao' : 'dae_principal';
    const descricao = regra.dae === 'alteracao' ? 'DAE Alteração' : 'DAE Principal';
    const categoria: FinanceChargeCategoria = regra.dae === 'alteracao' ? 'dae_adicional' : 'dae_principal';
    const valor = await getPriceByCodigo(codigo);
    inserts.push({
      os_id: osId,
      descricao,
      categoria,
      valor_previsto: valor,
    });
  }

  const geraVistoria = regra.vistoria === true || (regra.vistoria === 'se_troca' && trocaPlaca);
  if (geraVistoria) {
    const valor = await getPriceByCodigo('vistoria');
    inserts.push({
      os_id: osId,
      descricao: 'Vistoria ECV',
      categoria: 'vistoria',
      valor_previsto: valor,
    });
  }

  const geraPlaca = regra.placa === 'sempre' || (regra.placa === 'se_troca' && trocaPlaca);
  if (geraPlaca) {
    const codigo = tipoVeiculo === 'moto' ? 'placa_moto_mercosul' : 'placa_carro_mercosul';
    const descricao = tipoVeiculo === 'moto' ? 'Placa Moto' : 'Placa Mercosul (par)';
    // Buscar valor da empresa parceira automaticamente se não passado
    let valorPlacaFinal = empresaValorPlaca;
    if (valorPlacaFinal == null) {
      const { data: osData } = await supabase.from('ordens_de_servico').select('empresa_parceira_id').eq('id', osId).single();
      if (osData?.empresa_parceira_id) {
        const { data: empData } = await supabase.from('empresas_parceiras').select('valor_placa').eq('id', osData.empresa_parceira_id).single();
        if (empData?.valor_placa != null) valorPlacaFinal = Number(empData.valor_placa);
      }
    }
    const valor = valorPlacaFinal != null ? valorPlacaFinal : await getPriceByCodigo(codigo);
    inserts.push({
      os_id: osId,
      descricao,
      categoria: 'placa',
      valor_previsto: valor,
    });
  }

  // ── Custos Extras dinâmicos ──
  if (config.custosExtras && config.custosExtras.length > 0) {
    // Check existing 'outro' charges for this OS to avoid duplicates
    const { data: existingOutro } = await supabase
      .from('finance_charges')
      .select('descricao')
      .eq('os_id', osId)
      .eq('categoria', 'outro')
      .neq('status', 'cancelado');
    const existingDescricoes = new Set((existingOutro ?? []).map((c: any) => c.descricao));

    for (const custo of config.custosExtras) {
      if (custo.condicao === 'se_troca' && !trocaPlaca) continue;

      const valor = await getPriceByCodigo(custo.codigo);
      const descricao = custo.codigo; // fallback to codigo as description

      if (existingDescricoes.has(descricao)) continue;

      inserts.push({
        os_id: osId,
        descricao,
        categoria: 'outro' as FinanceChargeCategoria,
        valor_previsto: valor,
      });
      existingDescricoes.add(descricao);
    }
  }

  if (inserts.length === 0) return;
  const { error } = await supabase.from('finance_charges').insert(inserts);
  if (error) throw error;
}

// ── PAGAMENTOS ────────────────────────────────────────────────

export async function getPaymentsTotalByOSIds(osIds: string[]): Promise<Record<string, number>> {
  if (osIds.length === 0) return {};
  const { data, error } = await supabase
    .from('payments')
    .select('os_id, valor')
    .in('os_id', osIds);
  if (error) throw error;
  const totals: Record<string, number> = {};
  for (const p of (data ?? []) as { os_id: string; valor: number }[]) {
    totals[p.os_id] = (totals[p.os_id] || 0) + Number(p.valor);
  }
  return totals;
}

export async function getPaymentsByOS(osId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('os_id', osId)
    .order('data_pagamento');
  if (error) throw error;
  return (data as Payment[]).map(p => ({ ...p, valor: Number(p.valor) }));
}

export async function addPayment(
  osId: string,
  dataPagamento: string,
  valor: number,
  metodo: PaymentMetodo,
  instituicao?: string,
  observacao?: string,
  recebidoPor?: string,
): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      os_id: osId,
      charge_id: null,
      data_pagamento: dataPagamento,
      valor,
      metodo,
      instituicao: instituicao ?? null,
      comprovante_url: null,
      observacao: observacao ?? null,
      recebido_por: recebidoPor ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Payment;
}

export async function updatePayment(
  id: string,
  updates: Partial<Pick<Payment, 'data_pagamento' | 'valor' | 'metodo' | 'observacao' | 'recebido_por'>>,
): Promise<void> {
  const { error } = await supabase
    .from('payments')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw error;
}

export async function marcarCustoPago(chargeId: string): Promise<void> {
  const { data, error: fetchErr } = await supabase
    .from('finance_charges')
    .select('valor_previsto')
    .eq('id', chargeId)
    .single();
  if (fetchErr || !data) throw fetchErr || new Error('Custo não encontrado');

  const valorPrevisto = Number((data as { valor_previsto: number }).valor_previsto);
  const { error } = await supabase
    .from('finance_charges')
    .update({
      valor_pago: valorPrevisto,
      status: 'pago',
    })
    .eq('id', chargeId);
  if (error) throw error;
}

export async function desmarcarCustoPago(chargeId: string): Promise<void> {
  const { error } = await supabase
    .from('finance_charges')
    .update({
      valor_pago: 0,
      status: 'a_pagar',
    })
    .eq('id', chargeId);
  if (error) throw error;
}

// ── RESUMO ────────────────────────────────────────────────────

export function calcularResumo(
  valorServico: number,
  charges: FinanceCharge[],
  payments: Payment[],
): FinanceResumo {
  const custosAtivos = charges.filter(c => c.status !== 'cancelado');
  const totalCustos = custosAtivos.reduce((s, c) => s + c.valor_previsto, 0);
  const totalRecebido = payments.reduce((s, p) => s + p.valor, 0);
  const faltaReceber = Math.max(0, valorServico - totalRecebido);
  const honorario = valorServico - totalCustos;

  const statusRecebimento: FinanceResumo['statusRecebimento'] =
    valorServico === 0
      ? 'pendente'
      : totalRecebido >= valorServico
      ? 'pago'
      : totalRecebido > 0
      ? 'parcial'
      : 'pendente';

  return { valorServico, totalRecebido, faltaReceber, totalCustos, honorario, statusRecebimento };
}

// ── RELATÓRIO GLOBAL ──────────────────────────────────────────

export interface FinanceRelatorio {
  periodo: { inicio: string; fim: string };
  receita: number;
  totalCustos: number;
  honorarios: number;
  totalRecebido: number;
  aReceber: number;
  osCount: number;
}

export async function getRelatorio(
  inicio: string,
  fim: string,
  empresaId?: string,
): Promise<FinanceRelatorio> {
  let osQuery = supabase
    .from('ordens_de_servico')
    .select('id, valor_servico')
    .gte('criado_em', `${inicio}T00:00:00`)
    .lte('criado_em', `${fim}T23:59:59`);
  if (empresaId === 'particular') {
    osQuery = osQuery.is('empresa_parceira_id', null);
  } else if (empresaId) {
    osQuery = osQuery.eq('empresa_parceira_id', empresaId);
  }
  const { data: osList, error: osErr } = await osQuery;
  if (osErr) throw osErr;

  const ordens = (osList ?? []) as { id: string; valor_servico: number | null }[];
  const osIds = ordens.map(o => o.id);
  const receita = ordens.reduce((s, o) => s + (Number(o.valor_servico) || 0), 0);

  if (osIds.length === 0) {
    return { periodo: { inicio, fim }, receita: 0, totalCustos: 0, honorarios: 0, totalRecebido: 0, aReceber: 0, osCount: 0 };
  }

  const { data: chargesData } = await supabase
    .from('finance_charges')
    .select('valor_previsto, valor_pago, status')
    .in('os_id', osIds)
    .neq('status', 'cancelado');
  const totalCustos = (chargesData ?? []).reduce((s, c: any) => s + Number(c.valor_previsto), 0);

  const { data: paymentsData } = await supabase
    .from('payments')
    .select('valor')
    .in('os_id', osIds)
    .gte('data_pagamento', inicio)
    .lte('data_pagamento', fim);
  const totalRecebido = (paymentsData ?? []).reduce((s, p: any) => s + Number(p.valor), 0);

  return {
    periodo: { inicio, fim },
    receita,
    totalCustos,
    honorarios: receita - totalCustos,
    totalRecebido,
    aReceber: Math.max(0, receita - totalRecebido),
    osCount: ordens.length,
  };
}

// ── CONTROLE DE PAGAMENTOS ────────────────────────────────────

export async function getAllChargesWithOS(): Promise<ChargeWithOS[]> {
  // 1. Buscar todas as charges (exceto canceladas)
  const { data: charges, error: chargesErr } = await supabase
    .from('finance_charges')
    .select('*')
    .neq('status', 'cancelado')
    .order('status', { ascending: true })
    .order('criado_em', { ascending: false });

  if (chargesErr) throw chargesErr;
  if (!charges || charges.length === 0) return [];

  // 2. Buscar OS únicas referenciadas (em batch para evitar URL longa)
  const osIds = [...new Set(charges.map((c: any) => c.os_id))];
  const BATCH_OS = 15;
  const ordens: any[] = [];
  for (let i = 0; i < osIds.length; i += BATCH_OS) {
    const chunk = osIds.slice(i, i + BATCH_OS);
    const { data, error } = await supabase
      .from('ordens_de_servico')
      .select('id, numero, tipo_servico, cliente_id, veiculo_id, troca_placa, vistoria, empresa_parceira_id')
      .in('id', chunk);
    if (error) throw error;
    if (data) ordens.push(...data);
  }

  // 3. Buscar clientes e veículos
  const clienteIds = [...new Set((ordens || []).map((o: any) => o.cliente_id).filter(Boolean))];
  const veiculoIds = [...new Set((ordens || []).map((o: any) => o.veiculo_id).filter(Boolean))];

  const [clientes, veiculos] = await Promise.all([
    batchIn<{ id: string; nome: string }>('clientes', 'id, nome', clienteIds),
    batchIn<{ id: string; placa: string; marca_modelo: string }>('veiculos', 'id, placa, marca_modelo', veiculoIds),
  ]);

  // 4. Mapear para lookup
  const osMap = new Map((ordens || []).map((o: any) => [o.id, o]));
  const clienteMap = new Map(clientes.map((c: any) => [c.id, c]));
  const veiculoMap = new Map(veiculos.map((v: any) => [v.id, v]));

  // 5. Montar resultado (filtra cobranças de placa se OS não tem troca_placa)
  return charges
    .map((row: any) => {
      const os = osMap.get(row.os_id);
      if (!os) return null;
      // Esconder cobrança de placa se a OS não tem troca de placa
      if (row.categoria === 'placa' && !os.troca_placa) return null;
      const cliente = clienteMap.get(os.cliente_id);
      const veiculo = veiculoMap.get(os.veiculo_id);
      return {
        id: row.id,
        os_id: row.os_id,
        descricao: row.descricao,
        categoria: row.categoria,
        valor_previsto: Number(row.valor_previsto),
        valor_pago: Number(row.valor_pago),
        due_date: row.due_date,
        status: String(row.status ?? '').trim().toLowerCase() as FinanceCharge['status'],
        comprovante_url: row.comprovante_url,
        observacao: row.observacao,
        criado_em: row.criado_em,
        atualizado_em: row.atualizado_em,
        confirmado_por: row.confirmado_por,
        confirmado_em: row.confirmado_em,
        os_numero: os.numero,
        tipo_servico: os.tipo_servico,
        cliente_nome: cliente?.nome || 'Cliente não encontrado',
        placa: veiculo?.placa || '',
        modelo: veiculo?.marca_modelo || '',
        vistoria_local: os.vistoria?.local || '',
        empresa_parceira_id: os.empresa_parceira_id ?? null,
      } as ChargeWithOS;
    })
    .filter(Boolean) as ChargeWithOS[];
}

export function groupChargesByOS(charges: ChargeWithOS[]): OSChargeGroup[] {
  const map = new Map<string, OSChargeGroup>();

  for (const c of charges) {
    if (!map.has(c.os_id)) {
      map.set(c.os_id, {
        osId: c.os_id,
        osNumero: c.os_numero,
        tipoServico: c.tipo_servico,
        clienteNome: c.cliente_nome,
        placa: c.placa,
        modelo: c.modelo,
        vistoriaLocal: c.vistoria_local,
        empresaParceiraId: c.empresa_parceira_id ?? null,
        charges: [],
        totalPendente: 0,
        totalPago: 0,
      });
    }
    const group = map.get(c.os_id)!;
    group.charges.push(c);
    if (c.status === 'a_pagar') {
      group.totalPendente += c.valor_previsto;
    } else if (c.status === 'pago') {
      group.totalPago += c.valor_pago;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const aPending = a.charges.filter(c => c.status === 'a_pagar').length;
    const bPending = b.charges.filter(c => c.status === 'a_pagar').length;
    return bPending - aPending;
  });
}

export async function confirmarPagamento(
  chargeId: string,
  valor: number,
  data: string,
  usuario: string,
): Promise<void> {
  const confirmadoEm = new Date(data + 'T12:00:00').toISOString();
  const { error } = await supabase
    .from('finance_charges')
    .update({
      status: 'pago',
      valor_pago: valor,
      confirmado_por: usuario,
      confirmado_em: confirmadoEm,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', chargeId);
  if (error) throw error;
}

export async function reverterPagamento(chargeId: string): Promise<void> {
  const { error } = await supabase
    .from('finance_charges')
    .update({
      status: 'a_pagar',
      valor_pago: 0,
      confirmado_por: null,
      confirmado_em: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', chargeId);
  if (error) throw error;
}

export async function confirmarTodosDaOS(osId: string, usuario: string): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from('finance_charges')
    .select('id, valor_previsto')
    .eq('os_id', osId)
    .eq('status', 'a_pagar');

  if (fetchError) throw fetchError;
  if (!data || data.length === 0) return;

  const now = new Date().toISOString();
  for (const charge of data) {
    const { error } = await supabase
      .from('finance_charges')
      .update({
        status: 'pago',
        valor_pago: Number(charge.valor_previsto),
        confirmado_por: usuario,
        confirmado_em: now,
        atualizado_em: now,
      })
      .eq('id', charge.id)
      .eq('status', 'a_pagar');
    if (error) throw error;
  }
}

export async function getResumoControle(): Promise<ControleResumo> {
  const now = new Date();
  const hoje = now.toISOString().split('T')[0];
  const inicioSemana = new Date(now);
  inicioSemana.setDate(now.getDate() - now.getDay());
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data, error } = await supabase
    .from('finance_charges')
    .select('valor_previsto, valor_pago, status, confirmado_em')
    .neq('status', 'cancelado');

  if (error) throw error;

  let totalPendente = 0;
  let pagoHoje = 0;
  let pagoSemana = 0;
  let pagoMes = 0;

  for (const row of data || []) {
    if (row.status === 'a_pagar') {
      totalPendente += Number(row.valor_previsto);
    }
    if (row.status === 'pago' && row.confirmado_em) {
      const dt = row.confirmado_em.split('T')[0];
      const dtDate = new Date(row.confirmado_em);
      const valor = Number(row.valor_pago);
      if (dt === hoje) pagoHoje += valor;
      if (dtDate >= inicioSemana) pagoSemana += valor;
      if (dtDate >= inicioMes) pagoMes += valor;
    }
  }

  return { totalPendente, pagoHoje, pagoSemana, pagoMes };
}

// ── DASHBOARD GLOBAL ──────────────────────────────────────────

export interface DashboardMensalItem {
  mes: string;    // e.g. "Jan/25"
  total: number;
}

export interface DashboardResumo {
  recebidoMes: number;
  pendenteTotal: number;
  custosMes: number;
  margemLiquida: number;
  receitaPorMes: DashboardMensalItem[];
  recebidoBarMes: number;
  pendenteBarMes: number;
  totalCustosGlobal: number;
  totalHonorarios: number;
}

export async function getDashboardResumo(): Promise<DashboardResumo> {
  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Últimos 6 meses
  const seis: { label: string; inicio: string; fim: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    const inicio = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
    seis.push({ label, inicio, fim });
  }

  // All paid charges
  const { data: paidCharges } = await supabase
    .from('finance_charges')
    .select('valor_pago, confirmado_em')
    .eq('status', 'pago');

  // All pending charges
  const { data: pendingCharges } = await supabase
    .from('finance_charges')
    .select('valor_previsto')
    .eq('status', 'a_pagar');

  // All charges for custos
  const { data: allCharges } = await supabase
    .from('finance_charges')
    .select('valor_previsto, confirmado_em, status, categoria')
    .neq('status', 'cancelado');

  const paid = (paidCharges ?? []) as { valor_pago: number; confirmado_em: string | null }[];
  const pending = (pendingCharges ?? []) as { valor_previsto: number }[];
  const all = (allCharges ?? []) as { valor_previsto: number; confirmado_em: string | null; status: string; categoria: string }[];

  // Receita por mês (last 6)
  const receitaPorMes: DashboardMensalItem[] = seis.map(({ label, inicio, fim }) => {
    const total = paid
      .filter(c => c.confirmado_em && c.confirmado_em >= inicio && c.confirmado_em <= fim)
      .reduce((s, c) => s + Number(c.valor_pago), 0);
    return { mes: label, total };
  });

  // Recebido e Pendente neste mês
  const recebidoBarMes = paid
    .filter(c => c.confirmado_em && c.confirmado_em >= inicioMes && c.confirmado_em <= fimMes)
    .reduce((s, c) => s + Number(c.valor_pago), 0);
  const pendenteBarMes = pending.reduce((s, c) => s + Number(c.valor_previsto), 0);

  // Custos do mês (charges pagas este mês — categorias de custo)
  const custosMes = all
    .filter(c => c.status === 'pago' && c.confirmado_em && c.confirmado_em >= inicioMes && c.confirmado_em <= fimMes
      && ['dae_principal', 'dae_adicional', 'vistoria', 'placa'].includes(c.categoria))
    .reduce((s, c) => s + Number(c.valor_previsto), 0);

  const recebidoMes = recebidoBarMes;
  const margemLiquida = recebidoMes - custosMes;

  // Totais globais para donut
  const totalCustosGlobal = all
    .filter(c => ['dae_principal', 'dae_adicional', 'vistoria', 'placa'].includes(c.categoria))
    .reduce((s, c) => s + Number(c.valor_previsto), 0);
  const totalPaidGlobal = paid.reduce((s, c) => s + Number(c.valor_pago), 0);
  const totalHonorarios = Math.max(0, totalPaidGlobal - totalCustosGlobal);

  return {
    recebidoMes,
    pendenteTotal: pendenteBarMes,
    custosMes,
    margemLiquida,
    receitaPorMes,
    recebidoBarMes,
    pendenteBarMes,
    totalCustosGlobal,
    totalHonorarios,
  };
}

// ── RELATÓRIO POR CLIENTE/SERVIÇO ─────────────────────────────

export interface RelatorioOSRow {
  osId: string;
  osNumero: number;
  clienteNome: string;
  placa: string;
  tipoServico: string;
  valorServico: number;
  totalRecebido: number;
  statusRecebimento: string;
  dataAbertura: string;
}

export async function getRelatorioOS(
  dataInicio: string,
  dataFim: string,
  clienteId?: string,
  tipoServico?: string,
): Promise<RelatorioOSRow[]> {
  let query = supabase
    .from('ordens_de_servico')
    .select('id, numero, tipo_servico, cliente_id, veiculo_id, valor_servico, criado_em')
    .gte('criado_em', `${dataInicio}T00:00:00`)
    .lte('criado_em', `${dataFim}T23:59:59`);

  if (tipoServico) query = query.eq('tipo_servico', tipoServico);
  if (clienteId) query = query.eq('cliente_id', clienteId);

  const { data: ordens, error } = await query.order('criado_em', { ascending: false });
  if (error) throw error;
  if (!ordens || ordens.length === 0) return [];

  const osIds = ordens.map((o: any) => o.id);
  const clienteIds = [...new Set(ordens.map((o: any) => o.cliente_id).filter(Boolean))];
  const veiculoIds = [...new Set(ordens.map((o: any) => o.veiculo_id).filter(Boolean))];

  const [clientes, veiculos, pagamentos] = await Promise.all([
    batchIn<{ id: string; nome: string }>('clientes', 'id, nome', clienteIds),
    batchIn<{ id: string; placa: string }>('veiculos', 'id, placa', veiculoIds),
    batchIn<{ os_id: string; valor: number }>('payments', 'os_id, valor', osIds),
  ]);

  const clienteMap = new Map(clientes.map((c: any) => [c.id, c.nome]));
  const veiculoMap = new Map(veiculos.map((v: any) => [v.id, v.placa]));
  const pagamentosByOS: Record<string, number> = {};
  for (const p of pagamentos) {
    pagamentosByOS[p.os_id] = (pagamentosByOS[p.os_id] ?? 0) + Number(p.valor);
  }

  return ordens.map((o: any) => {
    const valorServico = Number(o.valor_servico) || 0;
    const totalRecebido = pagamentosByOS[o.id] ?? 0;
    const statusRecebimento =
      valorServico === 0 ? 'Pendente'
      : totalRecebido >= valorServico ? 'Quitado'
      : totalRecebido > 0 ? 'Parcial'
      : 'Pendente';
    return {
      osId: o.id,
      osNumero: o.numero,
      clienteNome: clienteMap.get(o.cliente_id) ?? '',
      placa: veiculoMap.get(o.veiculo_id) ?? '',
      tipoServico: o.tipo_servico,
      valorServico,
      totalRecebido,
      statusRecebimento,
      dataAbertura: o.criado_em?.split('T')[0] ?? '',
    };
  });
}

export async function getClientesSimples(): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome')
    .order('nome');
  if (error) throw error;
  return (data ?? []) as { id: string; nome: string }[];
}

// ── RELATÓRIO MENSAL (últimos 6 meses) ────────────────────────

export interface RelatorioMensalItem {
  key: string;    // e.g. "2025-01"
  label: string;  // e.g. "jan"
  receita: number;
  custos: number;
  honorarios: number;
  recebido: number;
  pendente: number;
}

export async function getRelatorioMensal(): Promise<RelatorioMensalItem[]> {
  const now = new Date();
  const meses: { key: string; label: string; inicio: string; fim: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('pt-BR', { month: 'short' });
    const inicio = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
    meses.push({ key, label, inicio, fim });
  }

  const inicioTotal = meses[0]!.inicio;
  const fimTotal = meses[meses.length - 1]!.fim;

  // Fetch all ordens in range
  const { data: ordensData } = await supabase
    .from('ordens_de_servico')
    .select('id, valor_servico, criado_em')
    .gte('criado_em', inicioTotal)
    .lte('criado_em', fimTotal);
  const ordens = (ordensData ?? []) as { id: string; valor_servico: number | null; criado_em: string }[];
  const osIds = ordens.map(o => o.id);

  // Fetch charges for these OS
  const chargesData: { os_id: string; valor_previsto: number }[] = [];
  const BATCH = 20;
  for (let i = 0; i < osIds.length; i += BATCH) {
    const chunk = osIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('finance_charges')
      .select('os_id, valor_previsto')
      .in('os_id', chunk)
      .neq('status', 'cancelado');
    if (data) chargesData.push(...(data as { os_id: string; valor_previsto: number }[]));
  }

  // Fetch payments (use confirmado_em from charges for "recebido" by month)
  const paidChargesData: { os_id: string; valor_pago: number; confirmado_em: string | null }[] = [];
  for (let i = 0; i < osIds.length; i += BATCH) {
    const chunk = osIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('finance_charges')
      .select('os_id, valor_pago, confirmado_em')
      .in('os_id', chunk)
      .eq('status', 'pago');
    if (data) paidChargesData.push(...(data as { os_id: string; valor_pago: number; confirmado_em: string | null }[]));
  }

  // Also fetch payments table for "recebido"
  const paymentsData: { os_id: string; valor: number; data_pagamento: string }[] = [];
  for (let i = 0; i < osIds.length; i += BATCH) {
    const chunk = osIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('payments')
      .select('os_id, valor, data_pagamento')
      .in('os_id', chunk);
    if (data) paymentsData.push(...(data as { os_id: string; valor: number; data_pagamento: string }[]));
  }

  // Group ordens by month key
  const ordensByMonth = new Map<string, string[]>();
  for (const mes of meses) ordensByMonth.set(mes.key, []);
  for (const o of ordens) {
    const mk = o.criado_em.slice(0, 7);
    if (ordensByMonth.has(mk)) ordensByMonth.get(mk)!.push(o.id);
  }

  // Build charges lookup by os_id
  const chargesByOS = new Map<string, number>();
  for (const c of chargesData) {
    chargesByOS.set(c.os_id, (chargesByOS.get(c.os_id) ?? 0) + Number(c.valor_previsto));
  }

  return meses.map(({ key, label, inicio, fim }) => {
    const mesOsIds = ordensByMonth.get(key) ?? [];
    const mesOrdens = ordens.filter(o => mesOsIds.includes(o.id));

    const receita = mesOrdens.reduce((s, o) => s + (Number(o.valor_servico) || 0), 0);
    const custos = mesOrdens.reduce((s, o) => s + (chargesByOS.get(o.id) ?? 0), 0);
    const honorarios = Math.max(0, receita - custos);

    // Recebido: payments in this month by data_pagamento
    const recebido = paymentsData
      .filter(p => p.data_pagamento >= inicio.slice(0, 10) && p.data_pagamento <= fim.slice(0, 10))
      .reduce((s, p) => s + Number(p.valor), 0);

    // Pendente: charges a_pagar for OS opened this month
    const pendente = mesOrdens.reduce((s, o) => {
      // totalPrevisto - totalPaid for this OS
      const totalPrevisto = chargesByOS.get(o.id) ?? 0;
      const totalPaid = paidChargesData
        .filter(c => c.os_id === o.id)
        .reduce((ps, c) => ps + Number(c.valor_pago), 0);
      return s + Math.max(0, totalPrevisto - totalPaid);
    }, 0);

    return { key, label, receita, custos, honorarios, recebido, pendente };
  });
}

// ── TOP SERVIÇOS (ranking por receita) ────────────────────────

export interface TopServicoItem {
  tipoServico: string;
  qtdOS: number;
  receitaTotal: number;
  percentual: number;
}

export async function getTopServicos(
  dataInicio: string,
  dataFim: string,
  empresaId?: string,
): Promise<TopServicoItem[]> {
  let osQuery = supabase
    .from('ordens_de_servico')
    .select('tipo_servico, valor_servico')
    .gte('criado_em', `${dataInicio}T00:00:00`)
    .lte('criado_em', `${dataFim}T23:59:59`);
  if (empresaId === 'particular') {
    osQuery = osQuery.is('empresa_parceira_id', null);
  } else if (empresaId) {
    osQuery = osQuery.eq('empresa_parceira_id', empresaId);
  }
  const { data: ordensData, error } = await osQuery;

  if (error) throw error;

  const ordens = (ordensData ?? []) as { tipo_servico: string; valor_servico: number | null }[];
  const map = new Map<string, { qtd: number; receita: number }>();

  for (const o of ordens) {
    const ts = o.tipo_servico || 'desconhecido';
    const cur = map.get(ts) ?? { qtd: 0, receita: 0 };
    map.set(ts, { qtd: cur.qtd + 1, receita: cur.receita + (Number(o.valor_servico) || 0) });
  }

  const totalReceita = Array.from(map.values()).reduce((s, v) => s + v.receita, 0);

  return Array.from(map.entries())
    .map(([tipoServico, { qtd, receita }]) => ({
      tipoServico,
      qtdOS: qtd,
      receitaTotal: receita,
      percentual: totalReceita > 0 ? (receita / totalReceita) * 100 : 0,
    }))
    .sort((a, b) => b.receitaTotal - a.receitaTotal)
    .slice(0, 8);
}

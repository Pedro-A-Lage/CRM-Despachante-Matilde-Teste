// src/lib/placaService.ts
import { supabase } from './supabaseClient';
import type { FabricaPlacas, PedidoPlaca } from '../types/placa';

// ── Mappers ───────────────────────────────────────────────────────────────────

function dbToFabrica(row: any): FabricaPlacas {
    return {
        id: row.id,
        nome: row.nome,
        ativo: row.ativo,
        custoCarro: Number(row.custo_carro),
        custoMoto: Number(row.custo_moto),
        valorBoletoEmpresa: Number(row.valor_boleto_empresa),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function fabricaToDb(f: Partial<FabricaPlacas>): Record<string, any> {
    const map: Record<string, any> = {};
    if (f.nome !== undefined) map.nome = f.nome;
    if (f.ativo !== undefined) map.ativo = f.ativo;
    if (f.custoCarro !== undefined) map.custo_carro = f.custoCarro;
    if (f.custoMoto !== undefined) map.custo_moto = f.custoMoto;
    if (f.valorBoletoEmpresa !== undefined) map.valor_boleto_empresa = f.valorBoletoEmpresa;
    map.updated_at = new Date().toISOString();
    return map;
}

function dbToPedido(row: any): PedidoPlaca {
    return {
        id: row.id,
        fabricaId: row.fabrica_id,
        osId: row.os_id ?? undefined,
        empresaParceiraId: row.empresa_parceira_id ?? undefined,
        tipoVeiculo: row.tipo_veiculo,
        custoReal: Number(row.custo_real),
        valorBoleto: Number(row.valor_boleto),
        saldoUsado: Number(row.saldo_usado),
        dataPedido: row.data_pedido,
        observacao: row.observacao ?? undefined,
        createdAt: row.created_at,
        osNumero: row.ordens_de_servico?.numero ?? undefined,
        osPlaca: row.ordens_de_servico?.veiculos?.placa ?? undefined,
        empresaNome: row.empresas_parceiras?.nome ?? undefined,
    };
}

function pedidoToDb(p: Partial<PedidoPlaca>): Record<string, any> {
    const map: Record<string, any> = {};
    if (p.fabricaId !== undefined) map.fabrica_id = p.fabricaId;
    if (p.osId !== undefined) map.os_id = p.osId || null;
    if (p.empresaParceiraId !== undefined) map.empresa_parceira_id = p.empresaParceiraId || null;
    if (p.tipoVeiculo !== undefined) map.tipo_veiculo = p.tipoVeiculo;
    if (p.custoReal !== undefined) map.custo_real = p.custoReal;
    if (p.valorBoleto !== undefined) map.valor_boleto = p.valorBoleto;
    if (p.saldoUsado !== undefined) map.saldo_usado = p.saldoUsado;
    if (p.dataPedido !== undefined) map.data_pedido = p.dataPedido;
    if (p.observacao !== undefined) map.observacao = p.observacao || null;
    return map;
}

// ── Fábricas CRUD ─────────────────────────────────────────────────────────────

export async function getFabricas(): Promise<FabricaPlacas[]> {
    const { data, error } = await supabase
        .from('fabricas_placas')
        .select('*')
        .order('nome');
    if (error) throw error;
    return (data || []).map(dbToFabrica);
}

export async function getFabricasAtivas(): Promise<FabricaPlacas[]> {
    const { data, error } = await supabase
        .from('fabricas_placas')
        .select('*')
        .eq('ativo', true)
        .order('nome');
    if (error) throw error;
    return (data || []).map(dbToFabrica);
}

export async function saveFabrica(f: Partial<FabricaPlacas> & { nome: string }): Promise<FabricaPlacas> {
    const { data, error } = await supabase
        .from('fabricas_placas')
        .insert(fabricaToDb(f))
        .select()
        .single();
    if (error) throw error;
    return dbToFabrica(data);
}

export async function updateFabrica(id: string, f: Partial<FabricaPlacas>): Promise<FabricaPlacas> {
    const { data, error } = await supabase
        .from('fabricas_placas')
        .update(fabricaToDb(f))
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return dbToFabrica(data);
}

// ── Pedidos CRUD ──────────────────────────────────────────────────────────────

export async function getPedidosByFabrica(fabricaId: string): Promise<PedidoPlaca[]> {
    const { data, error } = await supabase
        .from('pedidos_placa')
        .select('*, ordens_de_servico(numero, veiculo_id, veiculos:veiculo_id(placa)), empresas_parceiras(nome)')
        .eq('fabrica_id', fabricaId)
        .order('data_pedido', { ascending: false })
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(dbToPedido);
}

export async function savePedido(p: Partial<PedidoPlaca> & { fabricaId: string; tipoVeiculo: 'carro' | 'moto' }): Promise<PedidoPlaca> {
    const { data, error } = await supabase
        .from('pedidos_placa')
        .insert(pedidoToDb(p))
        .select('*, ordens_de_servico(numero, veiculo_id, veiculos:veiculo_id(placa)), empresas_parceiras(nome)')
        .single();
    if (error) throw error;
    return dbToPedido(data);
}

export async function updatePedido(id: string, p: Partial<PedidoPlaca>): Promise<PedidoPlaca> {
    const { data, error } = await supabase
        .from('pedidos_placa')
        .update(pedidoToDb(p))
        .eq('id', id)
        .select('*, ordens_de_servico(numero, veiculo_id, veiculos:veiculo_id(placa)), empresas_parceiras(nome)')
        .single();
    if (error) throw error;
    return dbToPedido(data);
}

export async function deletePedido(id: string): Promise<void> {
    const { error } = await supabase
        .from('pedidos_placa')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// ── Saldo ─────────────────────────────────────────────────────────────────────

export async function getSaldoFabrica(fabricaId: string): Promise<number> {
    const { data, error } = await supabase
        .from('pedidos_placa')
        .select('valor_boleto, custo_real')
        .eq('fabrica_id', fabricaId);
    if (error) throw error;
    const rows = data || [];
    const totalBoleto = rows.reduce((sum, r) => sum + Number(r.valor_boleto), 0);
    const totalCusto = rows.reduce((sum, r) => sum + Number(r.custo_real), 0);
    return totalBoleto - totalCusto;
}

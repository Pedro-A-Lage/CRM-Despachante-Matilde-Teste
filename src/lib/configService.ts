// src/lib/configService.ts
// Service para gerenciar configurações de serviços (service_config)
import { supabase } from './supabaseClient';

export interface DocumentoExtra {
  condicao: string; // ex: 'vendedor_pj'
  docs: string[];
}

export interface ServiceConfig {
  id: string;
  tipo_servico: string;
  nome_exibicao: string;
  ativo: boolean;
  documentos_pf: string[];
  documentos_pj: string[];
  documentos_extras: DocumentoExtra[];
  dae_tipo: string | null; // 'principal' | 'alteracao' | null
  gera_vistoria: string;   // 'sempre' | 'se_troca' | 'nunca'
  gera_placa: string;      // 'sempre' | 'se_troca' | 'nunca'
  criado_em: string;
  atualizado_em: string;
}

// Cache local para evitar queries repetidas
let configCache: ServiceConfig[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30_000; // 30 seconds

export function invalidateConfigCache(): void {
  configCache = null;
  cacheTimestamp = 0;
}

export async function getAllServiceConfigs(): Promise<ServiceConfig[]> {
  // Return cache if fresh
  if (configCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return configCache;
  }

  const { data, error } = await supabase
    .from('service_config')
    .select('*')
    .order('nome_exibicao');

  if (error) throw error;

  const configs = (data ?? []).map((row: any) => ({
    ...row,
    documentos_pf: Array.isArray(row.documentos_pf) ? row.documentos_pf : JSON.parse(row.documentos_pf || '[]'),
    documentos_pj: Array.isArray(row.documentos_pj) ? row.documentos_pj : JSON.parse(row.documentos_pj || '[]'),
    documentos_extras: Array.isArray(row.documentos_extras) ? row.documentos_extras : JSON.parse(row.documentos_extras || '[]'),
  })) as ServiceConfig[];

  configCache = configs;
  cacheTimestamp = Date.now();
  return configs;
}

export async function getServiceConfig(tipoServico: string): Promise<ServiceConfig | null> {
  const all = await getAllServiceConfigs();
  return all.find(c => c.tipo_servico === tipoServico) ?? null;
}

export async function updateServiceConfig(
  id: string,
  updates: Partial<Pick<ServiceConfig,
    'nome_exibicao' | 'ativo' | 'documentos_pf' | 'documentos_pj' |
    'documentos_extras' | 'dae_tipo' | 'gera_vistoria' | 'gera_placa'
  >>,
): Promise<void> {
  const { error } = await supabase
    .from('service_config')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
  invalidateConfigCache();
}

export async function createServiceConfig(config: {
  tipo_servico: string;
  nome_exibicao: string;
  documentos_pf: string[];
  documentos_pj: string[];
  documentos_extras?: DocumentoExtra[];
  dae_tipo?: string | null;
  gera_vistoria?: string;
  gera_placa?: string;
}): Promise<ServiceConfig> {
  const { data, error } = await supabase
    .from('service_config')
    .insert({
      tipo_servico: config.tipo_servico,
      nome_exibicao: config.nome_exibicao,
      documentos_pf: config.documentos_pf,
      documentos_pj: config.documentos_pj,
      documentos_extras: config.documentos_extras ?? [],
      dae_tipo: config.dae_tipo ?? null,
      gera_vistoria: config.gera_vistoria ?? 'nunca',
      gera_placa: config.gera_placa ?? 'nunca',
    })
    .select()
    .single();
  if (error) throw error;
  invalidateConfigCache();
  return data as ServiceConfig;
}

export async function deleteServiceConfig(id: string): Promise<void> {
  const { error } = await supabase
    .from('service_config')
    .delete()
    .eq('id', id);
  if (error) throw error;
  invalidateConfigCache();
}

// ── Labels dinâmicos a partir do service_config ──
export async function getServiceLabels(): Promise<Record<string, string>> {
  const configs = await getAllServiceConfigs();
  const labels: Record<string, string> = {};
  for (const c of configs) {
    if (c.ativo) {
      labels[c.tipo_servico] = c.nome_exibicao;
    }
  }
  return labels;
}

// ── Gerar checklist dinâmico a partir do service_config ──
export async function gerarChecklistDinamico(
  tipoServico: string,
  tipoCliente: 'PF' | 'PJ',
  cpfVendedor?: string,
): Promise<{ id: string; nome: string; status: 'pendente'; observacao?: string }[]> {
  const config = await getServiceConfig(tipoServico);

  if (!config) {
    // Fallback: retorna checklist básico
    const docs = tipoCliente === 'PF' ? ['CNH'] : ['CNPJ', 'Contrato Social', 'CNH Responsável pela Empresa'];
    return docs.map(nome => ({
      id: generateId(),
      nome,
      status: 'pendente' as const,
    }));
  }

  const docs: string[] = [];

  // Documentos base por tipo de cliente
  if (tipoCliente === 'PF') {
    docs.push(...config.documentos_pf);
  } else {
    docs.push(...config.documentos_pj);
  }

  // Documentos extras condicionais
  if (config.documentos_extras && config.documentos_extras.length > 0) {
    for (const extra of config.documentos_extras) {
      if (extra.condicao === 'vendedor_pj') {
        // Adiciona docs de vendedor PJ se o CPF/CNPJ do vendedor tem 14 dígitos
        const isVendedorPJ = cpfVendedor && cpfVendedor.replace(/[^\d]/g, '').length === 14;
        if (isVendedorPJ) {
          docs.push(...extra.docs);
        }
      }
      // Pode adicionar mais condições no futuro
    }
  }

  // Para transferência, sempre adiciona RECIBO (CRV) Assinado no início
  if (tipoServico === 'transferencia' && !docs.includes('RECIBO (CRV) Assinado')) {
    docs.unshift('RECIBO (CRV) Assinado');
  }

  return docs.map(nome => ({
    id: generateId(),
    nome,
    status: 'pendente' as const,
  }));
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// src/lib/osService.ts
// Lógica compartilhada de pós-criação de OS
// Chamada por OSForm, ATPVeModal e PrimeiroEmplacamentoModal

import { getServicePrice, gerarCobrancasIniciais, getChargesByOS, getPriceByCodigo } from './financeService';
import { updateOrdem, getOrdem } from './database';
import { getEmpresa } from './empresaService';
import { supabase } from './supabaseClient';
import type { TipoVeiculo } from '../types/finance';
import type { OrdemDeServico } from '../types';

// Status de OS considerados "resolvidos" — não mexer em charges delas
const OS_STATUS_RESOLVIDOS = ['doc_pronto', 'entregue', 'cancelada'];

/**
 * Calcula o valor esperado da charge de placa para uma OS, considerando
 * empresa parceira (se vinculada) e tipo de veículo (carro/moto).
 *
 * Precedência:
 *   1. empresa.valor_placa (se OS tem empresa E valor_placa preenchido)
 *   2. price_table.placa_carro_mercosul ou placa_moto_mercosul
 */
export async function getExpectedPlacaPrice(osId: string): Promise<number | null> {
  const os = await getOrdem(osId);
  if (!os) return null;
  if (os.empresaParceiraId) {
    const emp = await getEmpresa(os.empresaParceiraId);
    if (emp?.valorPlaca != null) return Number(emp.valorPlaca);
  }
  const codigo = (os.tipoVeiculo ?? 'carro') === 'moto' ? 'placa_moto_mercosul' : 'placa_carro_mercosul';
  try {
    return await getPriceByCodigo(codigo);
  } catch {
    return null;
  }
}

/**
 * Recalcula o valor da charge de placa ativa (status=a_pagar) de uma OS
 * pra refletir o estado atual (empresa parceira atual + preço atual).
 *
 * Regras:
 *   · No-op se OS está resolvida (doc_pronto, entregue, cancelada)
 *   · No-op se não tem charge de placa a_pagar
 *   · No-op se valor atual já bate com o esperado (idempotente)
 *   · Se altera, grava linha em charge_price_history
 *
 * Não toca em charges `pago` ou `cancelado` — valor histórico é imutável.
 */
export async function recalcPlacaDaOS(
  osId: string,
  opts: { motivo: string; usuario?: string | null },
): Promise<{ atualizada: boolean; valorAntigo?: number; valorNovo?: number }> {
  const os = await getOrdem(osId);
  if (!os) return { atualizada: false };
  if (os.status && OS_STATUS_RESOLVIDOS.includes(os.status)) return { atualizada: false };

  const charges = await getChargesByOS(osId);
  const placaCharge = charges.find(c => c.categoria === 'placa' && c.status === 'a_pagar');
  if (!placaCharge) return { atualizada: false };

  const esperado = await getExpectedPlacaPrice(osId);
  if (esperado == null) return { atualizada: false };

  const atual = Number(placaCharge.valor_previsto);
  if (Math.abs(atual - esperado) < 0.01) return { atualizada: false };

  // Grava audit trail ANTES do UPDATE
  const { error: historyErr } = await supabase.from('charge_price_history').insert({
    charge_id: placaCharge.id,
    valor_antigo: atual,
    valor_novo: esperado,
    motivo: opts.motivo,
    usuario: opts.usuario ?? null,
  });
  if (historyErr) {
    console.warn('[osService] falha ao gravar charge_price_history (prossegue):', historyErr);
  }

  const { error: updateErr } = await supabase
    .from('finance_charges')
    .update({ valor_previsto: esperado, atualizado_em: new Date().toISOString() })
    .eq('id', placaCharge.id);
  if (updateErr) throw updateErr;

  return { atualizada: true, valorAntigo: atual, valorNovo: esperado };
}

/**
 * Wrapper sobre updateOrdem que dispara recálculo da placa automaticamente
 * se o patch muda campos relevantes (empresa_parceira_id, troca_placa,
 * tipo_veiculo).
 *
 * Use este helper em qualquer lugar que muda esses campos de uma OS
 * existente (UI, scripts, webhooks) — a consistência da charge de placa
 * fica garantida numa camada só.
 */
export async function updateOrdemWithRecalc(
  osId: string,
  patch: Partial<OrdemDeServico>,
  opts?: { motivo?: string; usuario?: string | null },
): Promise<{ placaRecalculada: boolean; valorAntigo?: number; valorNovo?: number }> {
  const deveRecalcular =
    'empresaParceiraId' in patch
    || 'trocaPlaca' in patch
    || 'tipoVeiculo' in patch;

  await updateOrdem(osId, patch);

  if (!deveRecalcular) return { placaRecalculada: false };

  const motivo = opts?.motivo ?? (
    'empresaParceiraId' in patch
      ? (patch.empresaParceiraId ? 'vinculo_empresa' : 'desvinculo_empresa')
      : 'mudanca_os'
  );

  const r = await recalcPlacaDaOS(osId, { motivo, usuario: opts?.usuario });
  return { placaRecalculada: r.atualizada, valorAntigo: r.valorAntigo, valorNovo: r.valorNovo };
}

/**
 * Finaliza uma OS recém-criada:
 * 1. Gera cobranças automáticas (DAE, vistoria, placa — com valor da empresa se vinculada)
 * 2. Calcula valorServico:
 *    - OS de empresa: custos + honorário da empresa (ex: 283,71 + 300 = 583,71)
 *    - OS particular: valor da tabela service_prices
 * 3. Atualiza a OS com valorServico e tipoVeiculo
 */
export async function finalizarOS(
  osId: string,
  tipoServico: string,
  tipoVeiculo: TipoVeiculo,
  trocaPlaca: boolean,
): Promise<{ valorServico: number }> {
  // 1. Gerar cobranças automáticas primeiro (placa da empresa é buscada automaticamente)
  await gerarCobrancasIniciais(osId, tipoServico, tipoVeiculo, trocaPlaca);

  // 2. Verificar se tem empresa parceira
  let valorServico = 0;
  const os = await getOrdem(osId);
  if (os?.empresaParceiraId) {
    // OS de empresa: valorServico = soma dos custos + honorário da empresa
    const emp = await getEmpresa(os.empresaParceiraId);
    const charges = await getChargesByOS(osId);
    const totalCustos = charges
      .filter((c) => c.status !== 'cancelado')
      .reduce((sum, c) => sum + Number(c.valor_previsto), 0);
    valorServico = totalCustos + (emp?.valorServico ?? 0);
  } else {
    // OS particular: valor da tabela de preços
    try {
      valorServico = await getServicePrice(tipoServico, tipoVeiculo, trocaPlaca);
    } catch (err) {
      console.warn(`Preço não encontrado para ${tipoServico}/${tipoVeiculo}/placa=${trocaPlaca}:`, err);
    }
  }

  // 3. Atualizar OS
  await updateOrdem(osId, {
    valorServico,
    tipoVeiculo,
  });

  return { valorServico };
}

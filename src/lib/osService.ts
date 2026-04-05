// src/lib/osService.ts
// Lógica compartilhada de pós-criação de OS
// Chamada por OSForm, ATPVeModal e PrimeiroEmplacamentoModal

import { getServicePrice, gerarCobrancasIniciais, getChargesByOS } from './financeService';
import { updateOrdem, getOrdem } from './database';
import { getEmpresa } from './empresaService';
import type { TipoVeiculo } from '../types/finance';

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

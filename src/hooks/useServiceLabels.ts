import { useState, useEffect } from 'react';
import { getServiceLabels } from '../lib/configService';

// Cache global em memória para evitar flash de labels vazios entre navegações
let cachedLabels: Record<string, string> | null = null;

/**
 * Hook que retorna os labels de serviço do service_config.
 * Carrega assíncronamente, retorna cache enquanto atualiza.
 */
export function useServiceLabels(): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>(cachedLabels ?? {});

  useEffect(() => {
    let cancelled = false;
    getServiceLabels()
      .then(result => {
        if (!cancelled) {
          cachedLabels = result;
          setLabels(result);
        }
      })
      .catch(err => console.error('Erro ao carregar labels de serviço:', err));
    return () => { cancelled = true; };
  }, []);

  return labels;
}

// Tipos hardcoded fora do service_config (ex.: protocolo avulso) — preserva a
// caixa correta de acrônimos quando não existe registro no banco.
const HARDCODED_LABELS: Record<string, string> = {
  sifap: 'SIFAP',
  requerimento: 'Requerimento',
};

/**
 * Traduz tipo_servico para nome de exibição.
 * Fallback: usa HARDCODED_LABELS se conhecido, senão formata o próprio tipo_servico.
 */
export function getServicoLabel(labels: Record<string, string>, tipo: string): string {
  return labels[tipo] ?? HARDCODED_LABELS[tipo] ?? tipo.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

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

/**
 * Traduz tipo_servico para nome de exibição.
 * Fallback: retorna o próprio tipo_servico formatado.
 */
export function getServicoLabel(labels: Record<string, string>, tipo: string): string {
  return labels[tipo] ?? tipo.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

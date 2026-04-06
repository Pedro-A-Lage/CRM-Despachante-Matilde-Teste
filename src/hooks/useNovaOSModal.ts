// src/hooks/useNovaOSModal.ts
import { useState, useCallback, createContext, useContext } from 'react';

export interface DadosIniciaisOS {
  tipoServico?: string;
  // Cliente
  nomeCliente?: string;
  cpfCnpj?: string;
  tipoCpfCnpj?: 'CPF' | 'CNPJ';
  rg?: string;
  orgaoExpedidor?: string;
  ufDocumento?: string;
  telefone?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  cep?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  // Veículo
  placa?: string;
  chassi?: string;
  renavam?: string;
  marcaModelo?: string;
  anoFabricacao?: string;
  anoModelo?: string;
  cor?: string;
  combustivel?: string;
  categoria?: string;
  dataAquisicao?: string;
  tipoVeiculo?: 'carro' | 'moto';
  // PDF anexado (base64) — quando vem da extensão
  fileBase64?: string;
  fileName?: string;
}

interface NovaOSModalContextValue {
  isOpen: boolean;
  dadosIniciais: DadosIniciaisOS | undefined;
  open: (dados?: DadosIniciaisOS) => void;
  close: () => void;
}

export const NovaOSModalContext = createContext<NovaOSModalContextValue | null>(null);

/** Usado APENAS em App.tsx para criar o estado compartilhado */
export function useNovaOSModalState() {
  const [isOpen, setIsOpen] = useState(false);
  const [dadosIniciais, setDadosIniciais] = useState<DadosIniciaisOS | undefined>();

  const open = useCallback((dados?: DadosIniciaisOS) => {
    setDadosIniciais(dados);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setDadosIniciais(undefined);
  }, []);

  return { isOpen, dadosIniciais, open, close };
}

/** Usado em qualquer página/componente para abrir o modal */
export function useNovaOSModal() {
  const ctx = useContext(NovaOSModalContext);
  if (!ctx) throw new Error('useNovaOSModal deve ser usado dentro do NovaOSModalContext.Provider');
  return ctx;
}

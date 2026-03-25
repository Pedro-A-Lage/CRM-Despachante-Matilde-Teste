// src/types/finance.ts

// --- TIPO DE VEÍCULO ---
export type TipoVeiculo = 'carro' | 'moto';

export const TIPO_VEICULO_LABELS: Record<TipoVeiculo, string> = {
  carro: 'Carro',
  moto: 'Moto',
};

// --- PREÇOS DOS SERVIÇOS ---
export interface ServicePrice {
  id: string;
  tipo_servico: string;
  tipo_veiculo: TipoVeiculo;
  com_placa: boolean;
  valor: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export type FinanceChargeCategoria =
  | 'dae_principal'
  | 'dae_adicional'
  | 'vistoria'
  | 'placa'
  | 'outro';

export type FinanceChargeStatus = 'a_pagar' | 'pago' | 'cancelado';

export type PaymentMetodo = 'pix' | 'cartao_debito' | 'cartao_credito' | 'dinheiro';

export interface FinanceCharge {
  id: string;
  os_id: string;
  descricao: string;
  categoria: FinanceChargeCategoria;
  valor_previsto: number;
  valor_pago: number;
  due_date?: string;
  status: FinanceChargeStatus;
  comprovante_url?: string;
  observacao?: string;
  criado_em: string;
  atualizado_em: string;
  confirmado_por?: string;
  confirmado_em?: string;
}

export interface Payment {
  id: string;
  os_id: string;
  charge_id?: string;
  data_pagamento: string;
  valor: number;
  metodo: PaymentMetodo;
  instituicao?: string;
  recebido_por?: string;
  comprovante_url?: string;
  observacao?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface PriceTableItem {
  id: string;
  codigo: string;
  descricao: string;
  valor: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export const FINANCE_CATEGORIA_LABELS: Record<FinanceChargeCategoria, string> = {
  dae_principal: 'DAE Principal',
  dae_adicional: 'DAE Adicional',
  vistoria:      'Vistoria',
  placa:         'Placa',
  outro:         'Outro',
};

export const FINANCE_STATUS_LABELS: Record<FinanceChargeStatus, string> = {
  a_pagar:   'A Pagar',
  pago:      'Pago',
  cancelado: 'Cancelado',
};

export const PAYMENT_METODO_LABELS: Record<PaymentMetodo, string> = {
  pix:             'PIX',
  cartao_debito:   'Débito',
  cartao_credito:  'Crédito',
  dinheiro:        'Dinheiro',
};

export interface FinanceResumo {
  valorServico: number;
  totalRecebido: number;
  faltaReceber: number;
  totalCustos: number;
  honorario: number;
  statusRecebimento: 'pago' | 'parcial' | 'pendente';
}

// --- CONTROLE DE PAGAMENTOS ---
export interface ChargeWithOS extends FinanceCharge {
  os_numero: number;
  tipo_servico: string;
  cliente_nome: string;
  placa: string;
  modelo: string;
  vistoria_local?: string;
}

export interface OSChargeGroup {
  osId: string;
  osNumero: number;
  tipoServico: string;
  clienteNome: string;
  placa: string;
  modelo: string;
  vistoriaLocal?: string;
  charges: ChargeWithOS[];
  totalPendente: number;
  totalPago: number;
}

export interface ControleResumo {
  totalPendente: number;
  pagoHoje: number;
  pagoSemana: number;
  pagoMes: number;
}

// src/types/empresa.ts

import type { PaymentMetodo } from './finance';

export type MetodoEnvioEmpresa = 'email' | 'portal';

export interface EtapaDocumento {
    tipo: string;
    pronto: boolean;
    arquivo_id?: string | null;
    arquivo_url?: string | null;
    arquivo_nome?: string | null;
}

export interface EtapaEnvioConfig {
    ordem: number;
    nome: string;
    documentos: string[];
}

export interface EtapaEnvioStatus {
    etapa: number;
    nome: string;
    documentos: EtapaDocumento[];
    enviado: boolean;
    enviado_em: string | null;
    /** Canal usado quando a etapa foi marcada como enviada. */
    enviado_via?: MetodoEnvioEmpresa;
    /** Link de referência (webLink do email enviado OU URL do portal acessado). */
    envio_link?: string | null;
}

export interface EmpresaParceira {
    id: string;
    nome: string;
    email?: string;
    cor: string;
    ativo: boolean;
    valorServico?: number;
    valorPlaca?: number;
    etapasEnvio: EtapaEnvioConfig[];
    /** Mapa { tipoDoc → label customizado }. Sobrescreve os labels padrão. */
    documentosLabels?: Record<string, string>;
    emailAssuntoTemplate?: string;
    emailCorpoTemplate?: string;
    /** Canal usado para envio dos documentos. Default = 'email'. */
    metodoEnvio?: MetodoEnvioEmpresa;
    /** URL do portal externo (usado quando metodoEnvio === 'portal'). */
    portalUrl?: string;
    /** Legenda do botão de portal externo. Ex.: "Portal Kuruma". */
    portalLabel?: string;
    /** Forma de pagamento padrão pré-selecionada ao registrar recebimento dessa empresa. */
    formaPagamentoPadrao?: PaymentMetodo;
    createdAt: string;
    updatedAt: string;
}

export interface EmpresaValoresOverride {
    valor_servico?: number;
    valor_placa?: number;
}

export interface EmpresaFinanceiro {
    /** Valor que você adiantou (ex: DAE na Kuruma) */
    valor_adiantado?: number;
    /** Valor total que a empresa deve pagar */
    valor_total_empresa?: number;
    /** Se já recebeu o pagamento da empresa */
    recebido: boolean;
    /** Data do recebimento */
    recebido_em?: string | null;
    /** Número da nota fiscal emitida */
    numero_nf?: string;
    /** Observação (ex: "Pix recebido", "Transferência") */
    observacao?: string;
}

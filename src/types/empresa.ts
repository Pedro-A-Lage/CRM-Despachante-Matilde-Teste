// src/types/empresa.ts

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

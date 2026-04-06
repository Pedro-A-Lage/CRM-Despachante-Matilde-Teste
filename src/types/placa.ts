// src/types/placa.ts

export interface FabricaPlacas {
    id: string;
    nome: string;
    ativo: boolean;
    custoCarro: number;
    custoMoto: number;
    valorBoletoEmpresa: number;
    createdAt: string;
    updatedAt: string;
}

export interface PedidoPlaca {
    id: string;
    fabricaId: string;
    osId?: string;
    empresaParceiraId?: string;
    tipoVeiculo: 'carro' | 'moto';
    custoReal: number;
    valorBoleto: number;
    saldoUsado: number;
    dataPedido: string;
    observacao?: string;
    createdAt: string;
    // Campos joined (opcionais, vindos de queries com join)
    osNumero?: string;
    osPlaca?: string;
    empresaNome?: string;
}

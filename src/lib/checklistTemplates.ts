// ============================================
// CHECKLIST TEMPLATES
// Gera checklists automáticos por tipo de serviço + tipo de cliente
// ============================================
import type { ChecklistItem, TipoServico, TipoCliente } from '../types';

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function item(nome: string): ChecklistItem {
    return {
        id: generateId(),
        nome,
        status: 'pendente',
    };
}

/** Documentos de identificação padrão para PF — sempre CNH no início */
function docsIdentificacaoPF(): ChecklistItem[] {
    return [
        item('CNH'),
    ];
}

function docsAdquirente(tipoCliente: TipoCliente): ChecklistItem[] {
    if (tipoCliente === 'PF') {
        return docsIdentificacaoPF();
    }
    return [
        item('CNPJ'),
        item('Contrato Social'),
        item('CNH Responsável pela Empresa'),
    ];
}

export function gerarChecklist(
    tipoServico: TipoServico,
    tipoCliente: TipoCliente,
    cpfVendedor?: string
): ChecklistItem[] {
    switch (tipoServico) {
        case 'primeiro_emplacamento':
            return [
                item('Nota Fiscal do veículo'),
                ...docsAdquirente(tipoCliente),
            ];

        case 'transferencia':
            const isVendedorCnpj = cpfVendedor && cpfVendedor.replace(/[^\d]/g, '').length === 14;
            let docsVendedor: ChecklistItem[] = [];

            if (isVendedorCnpj) {
                docsVendedor = [
                    item('CNPJ (Vendedor)'),
                    item('Contrato Social (Vendedor)'),
                    item('CNH Responsável pela Empresa (Vendedor)')
                ];
            }

            return [
                item('RECIBO (CRV) Assinado'),
                ...docsVendedor,
                ...docsAdquirente(tipoCliente),
            ];

        case 'segunda_via':
            return [
                item('Documento do veículo'),
                item('Declaração de perda do recibo (assinada e reconhecida)'),
                item('Solicitação de 2ª via (assinada e reconhecida)'),
                ...docsAdquirente(tipoCliente),
            ];

        case 'baixa':
            return [
                item('CRV (Certificado de Registro de Veículo)'),
                item('Requerimento de Baixa (assinado)'),
                item('Comprovante de quitação de débitos (IPVA, multas, DPVAT)'),
                ...docsAdquirente(tipoCliente),
            ];

        case 'alteracao_dados':
            return [
                item('CRV Original'),
                ...docsAdquirente(tipoCliente),
            ];

        default:
            return [
                ...docsAdquirente(tipoCliente),
            ];
    }
}

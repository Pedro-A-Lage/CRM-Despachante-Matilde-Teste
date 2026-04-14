// ============================================
// TIPOS DO SISTEMA - DESPACHANTE MATILDE
// ============================================
import type { TipoVeiculo } from './types/finance';

// --- CLIENTE ---
export type TipoCliente = 'PF' | 'PJ';

export interface DocumentoCliente {
    id: string;
    tipo: string; // 'RG' | 'CPF' | 'CNH' | 'CNPJ' | 'Contrato Social' | 'Doc Responsável'
    nome: string;
    arquivo?: string; // base64 ou URL
    dataUpload: string;
    observacao?: string;
}

export interface Cliente {
    id: string;
    tipo: TipoCliente;
    nome: string;
    cpfCnpj: string;
    telefones: string[];
    email?: string;
    observacoes?: string;
    documentos: DocumentoCliente[];
    pastaDriveId?: string;
    pastaDriveUrl?: string;
    pastaSupabasePath?: string;
    // Documento
    rg?: string;
    orgaoExpedidor?: string;
    ufDocumento?: string;
    // Endereço
    endereco?: string;
    numero?: string;
    complemento?: string;
    cep?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    criadoEm: string;
    atualizadoEm: string;
}

// --- VEÍCULO ---
export interface Veiculo {
    id: string;
    placa: string;
    renavam: string;
    chassi: string;
    marcaModelo: string;
    clienteId: string;
    observacoes?: string;
    dataAquisicao?: string;    // DATA DA AQUISIÇÃO extraída do CRV
    dataEmissaoCRV?: string;   // Data de emissão da folha de cadastro
    pastaDriveId?: string;
    cadastroDriveId?: string;
    pastaSupabasePath?: string;
    criadoEm: string;
    atualizadoEm: string;
    categoria?: string;
    numeroCRV?: string;
    codigoSegurancaCRV?: string;
    numeroATPVe?: string;
    hodometro?: string;
    anoFabricacao?: string;
    anoModelo?: string;
    cor?: string;
    combustivel?: string;
}

// --- ORDEM DE SERVIÇO ---
export type TipoServico = string;

export type StatusOS =
    | 'aguardando_documentacao'
    | 'vistoria'
    | 'delegacia'
    | 'doc_pronto'
    | 'entregue';

export type StatusChecklist = 'pendente' | 'recebido' | 'invalido' | 'nao_se_aplica';

export interface ChecklistItem {
    id: string;
    nome: string;
    status: StatusChecklist;
    observacao?: string;
    arquivo?: string;
    dataUpload?: string;
}

// --- DETRAN / DAE ---
export type StatusPagamento = 'aguardando_pagamento' | 'pago';

export interface DetranEtapa {
    folhaCadastro?: string; // arquivo
    daeArquivo?: string;
    daeValor?: number;
    statusPagamento: StatusPagamento;
    dataPagamento?: string;
    dataCadastro?: string;
}

// --- VISTORIA ---
export type StatusVistoria = 'agendar' | 'agendada' | 'reagendar' | 'reprovada' | 'aprovada_apontamento' | 'aprovada';

export interface Vistoria {
    local: string;
    dataAgendamento?: string;
    horaAgendamento?: string;
    status: StatusVistoria;
    motivoReprovacao?: string;
    descricaoApontamento?: string;
    protocolo?: string;
    prazoReagendamento?: string; // 30 dias após reprovação
    // Taxa de vistoria
    taxaValor?: number;
    taxaStatus?: StatusPagamento;
    taxaDataPagamento?: string;
    // Pagamento da placa (quando há troca)
    placaValor?: number;
    placaStatus?: StatusPagamento;
    placaDataPagamento?: string;
    // Anexo de PDF da Vistoria
    vistoriaAnexadaEm?: string;
    vistoriaNomeArquivo?: string;
    vistoriaUrl?: string;
}

export interface VistoriaHistorico {
    id: string;
    local: string;
    data: string;
    status: StatusVistoria;
    motivo?: string;
    apontamento?: string;
    registradoEm: string;
    usuario?: string;
}

// --- DELEGACIA ---
export type TipoEntradaDelegacia = 'entrada' | 'reentrada' | 'sifap' | 'requerimento';

export interface EntradaDelegacia {
    id: string;
    tipo: TipoEntradaDelegacia;
    data: string;
    responsavel: string;
    conferido: boolean;
    motivoDevolucao?: string;
    protocoloDiarioId?: string;
    observacao?: string;
    registradoEm: string;
}

export interface Delegacia {
    entradas: EntradaDelegacia[];
}

// --- SIFAP ---
export interface Sifap {
    necessario: boolean;
    documento?: string; // arquivo
    dataRegistro?: string;
    protocolo?: string;
    protocoloDelegaciaId?: string;
    novaPlaca?: string; // placa nova atribuída no SIFAP
}

// --- COMUNICAÇÃO ---
export interface Comunicacao {
    id: string;
    data: string;
    canal: string; // 'WhatsApp' | 'Telefone' | 'E-mail' | 'Presencial'
    mensagem: string;
    observacao?: string;
    usuario?: string;
}

// --- AUDIT LOG ---
export interface AuditEntry {
    id: string;
    acao: string;
    detalhes: string;
    usuario: string;
    dataHora: string;
}

// --- PROTOCOLO DIÁRIO ---
export interface ProtocoloDiario {
    id: string;
    data: string;
    processos: ProtocoloProcesso[];
    criadoEm: string;
    fotoAssinadaUrl?: string;
    fotoAssinadaNome?: string;
    fotoAnexadaEm?: string;
}

// Dados desnormalizados intencionalmente - registro histórico do protocolo
export interface ProtocoloProcesso {
    osId?: string;
    osNumero?: number;
    clienteNome: string;
    veiculoPlaca: string;
    veiculoChassi: string;
    veiculoRenavam: string;
    tipoServico: TipoServico | string;
    tipoEntrada: TipoEntradaDelegacia | string;
    local?: string;
    sifap?: boolean;
    manual?: boolean; // true se adicionado manualmente sem OS
    concluido?: boolean; // marca manual de processo avulso como concluído
}

// --- ORDEM DE SERVIÇO (PROCESSO COMPLETO) ---
export interface OrdemDeServico {
    id: string;
    numero: number;
    dataAbertura: string;
    clienteId: string;
    veiculoId: string;
    tipoServico: TipoServico;
    trocaPlaca: boolean;
    tipoVeiculo?: TipoVeiculo;
    valorServico?: number;
    status: StatusOS;
    statusDelegacia?: TipoEntradaDelegacia;
    checklist: ChecklistItem[];
    checklistObservacoes?: string;
    detran?: DetranEtapa;
    vistoria?: Vistoria;
    vistoriaHistory: VistoriaHistorico[];
    delegacia?: Delegacia;
    sifap?: Sifap;
    comunicacoes: Comunicacao[];
    auditLog: AuditEntry[];
    // Documento pronto e Entrega
    docProntoEm?: string;         // Data/hora que marcou doc como pronto
    docFinalAnexadoEm?: string;   // Data/hora do upload do doc final
    docFinalNome?: string;        // Nome do arquivo enviado ao Drive
    docFinalUrl?: string;         // URL do arquivo no Google Drive
    entregueEm?: string;          // Data/hora da entrega
    entregueParaNome?: string;    // Nome de quem pegou o documento
    pdfDetranUrl?: string;        // URL do PDF importado do Detran
    pdfDetranName?: string;       // Nome original/identificador do arquivo PDF
    // Gestão / Observações
    observacaoGeral?: string;     // Observação geral da OS
    prioridade?: 'normal' | 'urgente' | 'critica';
    pendencia?: string;           // Pendência específica em destaque
    crlvConsulta?: {
        data: string;
        resultado: string;
    };
    desconto?: number;            // Desconto aplicado ao valor do serviço
    transferencia?: {
        vendedorCpfCnpj?: string;
        vendedorEmail?: string;
        vendedorMunicipio?: string;
        vendedorUf?: string;
        localVenda?: string;
        valorDeclarado?: string;
        dataVenda?: string;
        tipoCpfCnpjComprador?: string;
        tipoCpfCnpjVendedor?: string;
    };
    primeiroEmplacamento?: {
        chassi?: string;
        renavam?: string;
        marcaModelo?: string;
        anoFabricacao?: string;
        anoModelo?: string;
        tipoVeiculo?: string;
        nomeAdquirente?: string;
        tipoCpfCnpjAdquirente?: 'CPF' | 'CNPJ';
        cpfCnpjAdquirente?: string;
        rgAdquirente?: string;
        orgaoExpedidor?: string;
        ufOrgaoExpedidor?: string;
        logradouroAdquirente?: string;
        numeroAdquirente?: string;
        bairroAdquirente?: string;
        cepAdquirente?: string;
        nomeRevendedor?: string;
        cnpjRevendedor?: string;
        municipioEmplacamento?: string;
        modalidadeFinanciamento?: string;
        pdfFichaCadastroUrl?: string;
    };
    criadoPor?: string;
    responsavel?: string;
    // Empresa parceira
    empresaParceiraId?: string;
    empresaValoresOverride?: import('./types/empresa').EmpresaValoresOverride;
    enviosStatus?: import('./types/empresa').EtapaEnvioStatus[];
    empresaFinanceiro?: import('./types/empresa').EmpresaFinanceiro;
    criadoEm: string;
    atualizadoEm: string;
}



// TIPO_SERVICO_LABELS removido — usar useServiceLabels() ou getServiceLabels() de configService.ts

export const STATUS_OS_LABELS: Record<StatusOS, string> = {
    aguardando_documentacao: 'Aguard. Docs',
    vistoria: 'Vistoria',
    delegacia: 'Delegacia',
    doc_pronto: 'Doc. Pronto',
    entregue: 'Entregue',
};

export const STATUS_VISTORIA_LABELS: Record<StatusVistoria, string> = {
    agendar: 'Agendar',
    agendada: 'Agendada',
    reagendar: 'Reagendar',
    reprovada: 'Reprovada',
    aprovada_apontamento: 'Aprovada c/ Apontamento',
    aprovada: 'Aprovada',
};

export const STATUS_CHECKLIST_LABELS: Record<StatusChecklist, string> = {
    pendente: 'Pendente',
    recebido: 'Recebido',
    invalido: 'Inválido',
    nao_se_aplica: 'Não Se Aplica',
};

export const CANAIS_COMUNICACAO = [
    'WhatsApp',
    'Telefone',
    'E-mail',
    'Presencial',
] as const;

export const MENSAGENS_PADRAO = [
    'Processo em andamento',
    'Vistoria agendada',
    'Processo aprovado',
    'Documento pronto',
    'Placa pronta para troca',
] as const;

export * from './types/finance';

// --- USUARIO / AUTH ---
export type RoleUsuario = 'admin' | 'gerente' | 'funcionario';

export interface PermissoesUsuario {
    // Páginas que o usuário pode acessar
    paginas?: {
        financeiro?: boolean;
        controle_pagamentos?: boolean;
        configuracoes?: boolean;
        usuarios?: boolean;
        backup?: boolean;
        emails?: boolean;
        servicos_detran?: boolean;
        protocolo_diario?: boolean;
        calendario_vistorias?: boolean;
    };
    // Permissões dentro da OS
    os?: {
        ver_custos?: boolean;           // Ver aba de custos/cobranças
        ver_honorarios?: boolean;       // Ver valores de honorários
        ver_valor_servico?: boolean;    // Ver valor do serviço
        receber_pagamento?: boolean;    // Registrar recebimentos
        editar_status?: boolean;        // Mudar status da OS
        editar_checklist?: boolean;     // Editar checklist
        editar_vistoria?: boolean;      // Editar vistoria
        editar_delegacia?: boolean;     // Editar delegacia
        excluir_os?: boolean;           // Deletar OS
    };
    // Dados pessoais
    dados?: {
        editar_perfil?: boolean;        // Editar próprio perfil
    };
}

export interface Usuario {
    id: string;
    nome: string;
    role: RoleUsuario;
    permissoes?: PermissoesUsuario;
    primeiroLogin: boolean;
    criadoEm: string;
    atualizadoEm: string;
}

// (duplicate re-export removed — already exported on line 340)

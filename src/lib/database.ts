// ============================================
// STORAGE LAYER - Supabase CRUD
// ============================================
import { supabase } from './supabaseClient';
import { getCurrentUser } from './auth';
import type {
    Cliente,
    Veiculo,
    OrdemDeServico,
    ProtocoloDiario,
    AuditEntry,
    StatusOS,
} from '../types';

// Transições de status permitidas
const VALID_STATUS_TRANSITIONS: Record<StatusOS, StatusOS[]> = {
    aguardando_documentacao: ['vistoria', 'delegacia'],
    vistoria: ['delegacia', 'aguardando_documentacao'],
    delegacia: ['doc_pronto', 'vistoria', 'aguardando_documentacao'],
    doc_pronto: ['entregue', 'delegacia'],
    entregue: [], // estado final — não permite transição a partir daqui
};

export function isValidStatusTransition(from: StatusOS, to: StatusOS): boolean {
    if (from === to) return true; // Nenhuma mudança
    return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function generateId(): string {
    return crypto.randomUUID();
}

function now(): string {
    return new Date().toISOString();
}

// Uppercase all string values in an object (shallow, skips IDs and dates)
function upperStrings<T extends Record<string, any>>(obj: T): T {
    const result = { ...obj };
    const skipKeys = ['id', 'clienteId', 'veiculoId', 'criadoEm', 'atualizadoEm', 'dataUpload', 'arquivo', 'email',
        'registradoEm', 'dataHora', 'dataAgendamento', 'dataPagamento', 'prazoReagendamento',
        'taxaDataPagamento', 'placaDataPagamento', 'dataRegistro', 'pastaDriveId', 'pastaDriveUrl',
        'dataAbertura', 'dataConclusao', 'cadastroDriveId', 'docProntoEm', 'entregueEm', 'entregueParaNome',
        'dataAquisicao', 'dataEmissaoCRV', 'docFinalAnexadoEm', 'docFinalNome', 'docFinalUrl',
        'vistoriaAnexadaEm', 'vistoriaNomeArquivo', 'pdfDetranUrl', 'pdfDetranName'];
    for (const key of Object.keys(result)) {
        if (skipKeys.includes(key)) continue;
        if (typeof result[key] === 'string') {
            (result as any)[key] = (result[key] as string).toUpperCase();
        }
    }
    return result;
}

// ============================================
// MAPPERS: DB (snake_case) <-> App (camelCase)
// ============================================

function dbToCliente(row: any): Cliente {
    return {
        id: row.id,
        tipo: row.tipo,
        nome: row.nome,
        cpfCnpj: row.cpf_cnpj,
        telefones: row.telefones || [],
        email: row.email,
        observacoes: row.observacoes,
        documentos: row.documentos || [],
        pastaDriveId: row.pasta_drive_id,
        pastaDriveUrl: row.pasta_drive_url,
        pastaSupabasePath: row.pasta_supabase_path,
        rg: row.rg ?? undefined,
        orgaoExpedidor: row.orgao_expedidor ?? undefined,
        ufDocumento: row.uf_documento ?? undefined,
        endereco: row.endereco ?? undefined,
        numero: row.numero ?? undefined,
        complemento: row.complemento ?? undefined,
        cep: row.cep ?? undefined,
        bairro: row.bairro ?? undefined,
        municipio: row.municipio ?? undefined,
        uf: row.uf ?? undefined,
        criadoEm: row.criado_em,
        atualizadoEm: row.atualizado_em,
    };
}

function clienteToDb(c: Partial<Cliente>): Record<string, any> {
    const map: Record<string, any> = {};
    if (c.id !== undefined) map.id = c.id;
    if (c.tipo !== undefined) map.tipo = c.tipo;
    if (c.nome !== undefined) map.nome = c.nome;
    if (c.cpfCnpj !== undefined) map.cpf_cnpj = c.cpfCnpj.replace(/\D/g, '');
    if (c.telefones !== undefined) map.telefones = c.telefones;
    if (c.email !== undefined) map.email = c.email;
    if (c.observacoes !== undefined) map.observacoes = c.observacoes;
    if (c.documentos !== undefined) map.documentos = c.documentos;
    if (c.pastaDriveId !== undefined) map.pasta_drive_id = c.pastaDriveId;
    if (c.pastaDriveUrl !== undefined) map.pasta_drive_url = c.pastaDriveUrl;
    if (c.pastaSupabasePath !== undefined) map.pasta_supabase_path = c.pastaSupabasePath;
    if (c.rg !== undefined) map.rg = c.rg ?? null;
    if (c.orgaoExpedidor !== undefined) map.orgao_expedidor = c.orgaoExpedidor ?? null;
    if (c.ufDocumento !== undefined) map.uf_documento = c.ufDocumento ?? null;
    if (c.endereco !== undefined) map.endereco = c.endereco ?? null;
    if (c.numero !== undefined) map.numero = c.numero ?? null;
    if (c.complemento !== undefined) map.complemento = c.complemento ?? null;
    if (c.cep !== undefined) map.cep = c.cep ?? null;
    if (c.bairro !== undefined) map.bairro = c.bairro ?? null;
    if (c.municipio !== undefined) map.municipio = c.municipio ?? null;
    if (c.uf !== undefined) map.uf = c.uf ?? null;
    if (c.criadoEm !== undefined) map.criado_em = c.criadoEm;
    if (c.atualizadoEm !== undefined) map.atualizado_em = c.atualizadoEm;
    return map;
}

function dbToVeiculo(row: any): Veiculo {
    return {
        id: row.id,
        placa: row.placa,
        renavam: row.renavam,
        chassi: row.chassi,
        marcaModelo: row.marca_modelo,
        clienteId: row.cliente_id,
        observacoes: row.observacoes,
        dataAquisicao: row.data_aquisicao,
        dataEmissaoCRV: row.data_emissao_crv,
        pastaDriveId: row.pasta_drive_id,
        cadastroDriveId: row.cadastro_drive_id,
        pastaSupabasePath: row.pasta_supabase_path,
        criadoEm: row.criado_em,
        atualizadoEm: row.atualizado_em,
        categoria: row.categoria ?? undefined,
        numeroCRV: row.numero_crv ?? undefined,
        codigoSegurancaCRV: row.codigo_seguranca_crv ?? undefined,
        numeroATPVe: row.numero_atpve ?? undefined,
        hodometro: row.hodometro ?? undefined,
        anoFabricacao: row.ano_fabricacao ?? undefined,
        anoModelo: row.ano_modelo ?? undefined,
        cor: row.cor ?? undefined,
        combustivel: row.combustivel ?? undefined,
    };
}

function veiculoToDb(v: Partial<Veiculo>): Record<string, any> {
    const map: Record<string, any> = {};
    if (v.id !== undefined) map.id = v.id;
    if (v.placa !== undefined) map.placa = v.placa;
    if (v.renavam !== undefined) map.renavam = v.renavam;
    if (v.chassi !== undefined) map.chassi = v.chassi;
    if (v.marcaModelo !== undefined) map.marca_modelo = v.marcaModelo;
    if (v.clienteId !== undefined) map.cliente_id = v.clienteId;
    if (v.observacoes !== undefined) map.observacoes = v.observacoes;
    if (v.dataAquisicao !== undefined) map.data_aquisicao = v.dataAquisicao;
    if (v.dataEmissaoCRV !== undefined) map.data_emissao_crv = v.dataEmissaoCRV;
    if (v.pastaDriveId !== undefined) map.pasta_drive_id = v.pastaDriveId;
    if (v.cadastroDriveId !== undefined) map.cadastro_drive_id = v.cadastroDriveId;
    if (v.pastaSupabasePath !== undefined) map.pasta_supabase_path = v.pastaSupabasePath;
    if (v.criadoEm !== undefined) map.criado_em = v.criadoEm;
    if (v.atualizadoEm !== undefined) map.atualizado_em = v.atualizadoEm;
    if (v.categoria !== undefined) map.categoria = v.categoria;
    if (v.numeroCRV !== undefined) map.numero_crv = v.numeroCRV;
    if (v.codigoSegurancaCRV !== undefined) map.codigo_seguranca_crv = v.codigoSegurancaCRV;
    if (v.numeroATPVe !== undefined) map.numero_atpve = v.numeroATPVe;
    if (v.hodometro !== undefined) map.hodometro = v.hodometro;
    if (v.anoFabricacao !== undefined) map.ano_fabricacao = v.anoFabricacao ?? null;
    if (v.anoModelo !== undefined) map.ano_modelo = v.anoModelo ?? null;
    if (v.cor !== undefined) map.cor = v.cor ?? null;
    if (v.combustivel !== undefined) map.combustivel = v.combustivel ?? null;
    return map;
}

function dbToOrdem(row: any): OrdemDeServico {
    return {
        id: row.id,
        numero: row.numero,
        dataAbertura: row.data_abertura,
        clienteId: row.cliente_id,
        veiculoId: row.veiculo_id,
        tipoServico: row.tipo_servico,
        trocaPlaca: row.troca_placa,
        tipoVeiculo: row.tipo_veiculo ?? undefined,
        valorServico: row.valor_servico != null ? Number(row.valor_servico) : undefined,
        status: row.status,
        checklist: row.checklist || [],
        checklistObservacoes: row.checklist_observacoes,
        detran: row.detran,
        vistoria: row.vistoria,
        vistoriaHistory: row.vistoria_history || [],
        delegacia: row.delegacia,
        sifap: row.sifap,
        comunicacoes: row.comunicacoes || [],
        auditLog: row.audit_log || [],
        docProntoEm: row.doc_pronto_em,
        docFinalAnexadoEm: row.doc_final_anexado_em,
        docFinalNome: row.doc_final_nome,
        docFinalUrl: row.doc_final_url,
        entregueEm: row.entregue_em,
        entregueParaNome: row.entregue_para_nome,
        pdfDetranUrl: row.pdf_detran_url,
        pdfDetranName: row.pdf_detran_name,
        observacaoGeral: row.observacao_geral,
        prioridade: row.prioridade,
        pendencia: row.pendencia,
        desconto: row.desconto != null ? Number(row.desconto) : undefined,
        criadoEm: row.criado_em,
        atualizadoEm: row.atualizado_em,
        transferencia: row.transferencia ?? undefined,
        primeiroEmplacamento: row.primeiro_emplacamento || undefined,
        statusDelegacia: row.status_delegacia ?? undefined,
        crlvConsulta: row.crlv_consulta ?? undefined,
        criadoPor: row.criado_por ?? undefined,
        responsavel: row.responsavel ?? undefined,
        empresaParceiraId: row.empresa_parceira_id ?? undefined,
        empresaValoresOverride: row.empresa_valores_override ?? undefined,
        enviosStatus: row.envios_status ?? undefined,
        empresaFinanceiro: row.empresa_financeiro ?? undefined,
    };
}

function ordemToDb(o: Partial<OrdemDeServico>): Record<string, any> {
    const map: Record<string, any> = {};
    if (o.id !== undefined) map.id = o.id;
    if (o.numero !== undefined) map.numero = o.numero;
    if (o.dataAbertura !== undefined) map.data_abertura = o.dataAbertura;
    if (o.clienteId !== undefined) map.cliente_id = o.clienteId;
    if (o.veiculoId !== undefined) map.veiculo_id = o.veiculoId;
    if (o.tipoServico !== undefined) map.tipo_servico = o.tipoServico;
    if (o.trocaPlaca !== undefined) map.troca_placa = o.trocaPlaca;
    if (o.tipoVeiculo !== undefined) map.tipo_veiculo = o.tipoVeiculo;
    if (o.valorServico !== undefined) map.valor_servico = o.valorServico;
    if (o.status !== undefined) map.status = o.status;
    if (o.checklist !== undefined) map.checklist = o.checklist;
    if (o.checklistObservacoes !== undefined) map.checklist_observacoes = o.checklistObservacoes;
    if (o.detran !== undefined) map.detran = o.detran;
    if (o.vistoria !== undefined) {
        map.vistoria = o.vistoria;
        map.vistoria_anexada_em = o.vistoria?.vistoriaAnexadaEm || null;
        map.vistoria_nome_arquivo = o.vistoria?.vistoriaNomeArquivo || null;
    }
    if (o.vistoriaHistory !== undefined) map.vistoria_history = o.vistoriaHistory;
    if (o.delegacia !== undefined) map.delegacia = o.delegacia;
    if (o.sifap !== undefined) map.sifap = o.sifap;
    if (o.comunicacoes !== undefined) map.comunicacoes = o.comunicacoes;
    if (o.auditLog !== undefined) map.audit_log = o.auditLog;
    if (o.docProntoEm !== undefined) map.doc_pronto_em = o.docProntoEm;
    if (o.docFinalAnexadoEm !== undefined) map.doc_final_anexado_em = o.docFinalAnexadoEm;
    if (o.docFinalNome !== undefined) map.doc_final_nome = o.docFinalNome;
    if (o.docFinalUrl !== undefined) map.doc_final_url = o.docFinalUrl;
    if (o.entregueEm !== undefined) map.entregue_em = o.entregueEm;
    if (o.entregueParaNome !== undefined) map.entregue_para_nome = o.entregueParaNome;
    if (o.pdfDetranUrl !== undefined) map.pdf_detran_url = o.pdfDetranUrl;
    if (o.pdfDetranName !== undefined) map.pdf_detran_name = o.pdfDetranName;
    if (o.observacaoGeral !== undefined) map.observacao_geral = o.observacaoGeral;
    if (o.prioridade !== undefined) map.prioridade = o.prioridade;
    if (o.pendencia !== undefined) map.pendencia = o.pendencia;
    if (o.desconto !== undefined) map.desconto = o.desconto;
    if (o.criadoEm !== undefined) map.criado_em = o.criadoEm;
    if (o.atualizadoEm !== undefined) map.atualizado_em = o.atualizadoEm;
    if (o.transferencia !== undefined) map.transferencia = o.transferencia ? o.transferencia : null;
    if (o.primeiroEmplacamento !== undefined) map.primeiro_emplacamento = o.primeiroEmplacamento ? o.primeiroEmplacamento : null;
    if (o.statusDelegacia !== undefined) map.status_delegacia = o.statusDelegacia;
    if (o.crlvConsulta !== undefined) map.crlv_consulta = o.crlvConsulta;
    if (o.criadoPor !== undefined) map.criado_por = o.criadoPor;
    if (o.responsavel !== undefined) map.responsavel = o.responsavel;
    if (o.empresaParceiraId !== undefined) map.empresa_parceira_id = o.empresaParceiraId || null;
    if (o.empresaValoresOverride !== undefined) map.empresa_valores_override = o.empresaValoresOverride || null;
    if (o.enviosStatus !== undefined) map.envios_status = o.enviosStatus || null;
    if (o.empresaFinanceiro !== undefined) map.empresa_financeiro = o.empresaFinanceiro || null;
    return map;
}

function dbToProtocolo(row: any): ProtocoloDiario {
    return {
        id: row.id,
        data: row.data,
        processos: row.processos || [],
        criadoEm: row.criado_em,
        fotoAssinadaUrl: row.foto_assinada_url ?? undefined,
        fotoAssinadaNome: row.foto_assinada_nome ?? undefined,
        fotoAnexadaEm: row.foto_anexada_em ?? undefined,
    };
}

function protocoloToDb(p: Partial<ProtocoloDiario>): Record<string, any> {
    const map: Record<string, any> = {};
    if (p.id !== undefined) map.id = p.id;
    if (p.data !== undefined) map.data = p.data;
    if (p.processos !== undefined) map.processos = p.processos;
    if (p.criadoEm !== undefined) map.criado_em = p.criadoEm;
    if (p.fotoAssinadaUrl !== undefined) map.foto_assinada_url = p.fotoAssinadaUrl || null;
    if (p.fotoAssinadaNome !== undefined) map.foto_assinada_nome = p.fotoAssinadaNome || null;
    if (p.fotoAnexadaEm !== undefined) map.foto_anexada_em = p.fotoAnexadaEm || null;
    return map;
}

// --- CLIENTES ---
export async function getClientes(): Promise<Cliente[]> {
    const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('criado_em', { ascending: false });
    if (error) { console.error('Erro getClientes:', error); return []; }
    return (data || []).map(dbToCliente);
}

export async function getCliente(id: string): Promise<Cliente | undefined> {
    const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', id)
        .single();
    if (error || !data) return undefined;
    return dbToCliente(data);
}

export async function getClienteByCpfCnpj(cpfCnpj: string): Promise<Cliente | undefined> {
    const cpfLimpo = cpfCnpj.replace(/\D/g, '');
    const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('cpf_cnpj', cpfLimpo)
        .maybeSingle();
    if (error) { console.error('Erro getClienteByCpfCnpj:', error); return undefined; }
    if (!data) return undefined;
    return dbToCliente(data);
}

export async function saveCliente(cliente: Omit<Cliente, 'id' | 'criadoEm' | 'atualizadoEm' | 'documentos'> & { id?: string; documentos?: Cliente['documentos'] }): Promise<Cliente> {
    const timestamp = now();
    const upper = upperStrings(cliente);

    if (upper.id) {
        // Update
        const dbData = clienteToDb({
            ...upper,
            documentos: upper.documentos ?? [],
            atualizadoEm: timestamp,
        });
        delete dbData.id;
        const { data, error } = await supabase
            .from('clientes')
            .update(dbData)
            .eq('id', upper.id)
            .select()
            .single();
        if (error) { console.error('Erro saveCliente update:', error); throw error; }
        return dbToCliente(data);
    }

    // Create
    const newId = generateId();
    const dbData = clienteToDb({
        ...upper,
        id: newId,
        documentos: upper.documentos ?? [],
        criadoEm: timestamp,
        atualizadoEm: timestamp,
    });
    const { data, error } = await supabase
        .from('clientes')
        .insert(dbData)
        .select()
        .single();
    if (error) { console.error('Erro saveCliente insert:', error); throw error; }
    return dbToCliente(data);
}

export async function deleteCliente(id: string): Promise<void> {
    // Check for related OS
    const { data: osData } = await supabase
        .from('ordens_de_servico')
        .select('id')
        .eq('cliente_id', id)
        .limit(1);
    if (osData && osData.length > 0) {
        throw new Error('Não é possível excluir cliente com ordens de serviço vinculadas');
    }

    // Check for veiculos with related OS (batch query em vez de N+1)
    const { data: veiculos } = await supabase
        .from('veiculos')
        .select('id')
        .eq('cliente_id', id);
    if (veiculos && veiculos.length > 0) {
        const veiculoIds = veiculos.map(v => v.id);
        const { data: vOs } = await supabase
            .from('ordens_de_servico')
            .select('id')
            .in('veiculo_id', veiculoIds)
            .limit(1);
        if (vOs && vOs.length > 0) {
            throw new Error('Não é possível excluir cliente pois possui veículos com ordens de serviço vinculadas');
        }
        // Delete all veiculos in one query
        await supabase.from('veiculos').delete().in('id', veiculoIds);
    }

    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) { console.error('Erro deleteCliente:', error); throw error; }
}

export async function updateCliente(id: string, updates: Partial<Cliente>): Promise<Cliente | undefined> {
    const dbData = clienteToDb({ ...updates, atualizadoEm: now() });
    const { data, error } = await supabase
        .from('clientes')
        .update(dbData)
        .eq('id', id)
        .select()
        .single();
    if (error || !data) { console.error('Erro updateCliente:', error); return undefined; }
    return dbToCliente(data);
}

// --- VEÍCULOS ---
export async function getVeiculos(): Promise<Veiculo[]> {
    const { data, error } = await supabase
        .from('veiculos')
        .select('*')
        .order('criado_em', { ascending: false });
    if (error) { console.error('Erro getVeiculos:', error); return []; }
    return (data || []).map(dbToVeiculo);
}

export async function getVeiculo(id: string): Promise<Veiculo | undefined> {
    const { data, error } = await supabase
        .from('veiculos')
        .select('*')
        .eq('id', id)
        .single();
    if (error || !data) return undefined;
    return dbToVeiculo(data);
}

export async function getVeiculoByPlacaOuChassi(placa: string, chassi: string): Promise<Veiculo | undefined> {
    const placaLimpa = (placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const chassiLimpo = (chassi || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!placaLimpa && !chassiLimpo) return undefined;

    let query = supabase.from('veiculos').select('*');
    if (placaLimpa && chassiLimpo) {
        query = query.or(`placa.eq.${placaLimpa},chassi.eq.${chassiLimpo}`);
    } else if (placaLimpa) {
        query = query.eq('placa', placaLimpa);
    } else {
        query = query.eq('chassi', chassiLimpo);
    }
    const { data } = await query.limit(1);
    return data && data.length > 0 ? dbToVeiculo(data[0]) : undefined;
}

export async function getVeiculosByCliente(clienteId: string): Promise<Veiculo[]> {
    const { data, error } = await supabase
        .from('veiculos')
        .select('*')
        .eq('cliente_id', clienteId);
    if (error) { console.error('Erro getVeiculosByCliente:', error); return []; }
    return (data || []).map(dbToVeiculo);
}

export async function saveVeiculo(veiculo: Omit<Veiculo, 'id' | 'criadoEm' | 'atualizadoEm'> & { id?: string }): Promise<Veiculo> {
    const timestamp = now();
    const upper = upperStrings(veiculo);

    if (upper.id) {
        const dbData = veiculoToDb({ ...upper, atualizadoEm: timestamp });
        delete dbData.id;
        const { data, error } = await supabase
            .from('veiculos')
            .update(dbData)
            .eq('id', upper.id)
            .select()
            .single();
        if (error) { console.error('Erro saveVeiculo update:', error); throw error; }
        return dbToVeiculo(data);
    }

    const newId = generateId();
    const dbData = veiculoToDb({ ...upper, id: newId, criadoEm: timestamp, atualizadoEm: timestamp });
    const { data, error } = await supabase
        .from('veiculos')
        .insert(dbData)
        .select()
        .single();
    if (error) { console.error('Erro saveVeiculo insert:', error); throw error; }
    return dbToVeiculo(data);
}

export async function deleteVeiculo(id: string): Promise<void> {
    // Check for related OS
    const { data: osData } = await supabase
        .from('ordens_de_servico')
        .select('id')
        .eq('veiculo_id', id)
        .limit(1);
    if (osData && osData.length > 0) {
        throw new Error('Não é possível excluir veículo com ordens de serviço vinculadas');
    }

    const { error } = await supabase.from('veiculos').delete().eq('id', id);
    if (error) { console.error('Erro deleteVeiculo:', error); throw error; }
}

// --- ORDENS DE SERVIÇO ---
export async function getOrdens(): Promise<OrdemDeServico[]> {
    const { data, error } = await supabase
        .from('ordens_de_servico')
        .select('*')
        .order('criado_em', { ascending: false });
    if (error) { console.error('Erro getOrdens:', error); return []; }
    return (data || []).map(dbToOrdem);
}

export async function getOrdem(id: string): Promise<OrdemDeServico | undefined> {
    const { data, error } = await supabase
        .from('ordens_de_servico')
        .select('*')
        .eq('id', id)
        .single();
    if (error || !data) return undefined;
    return dbToOrdem(data);
}

export async function getOrdensByVeiculo(veiculoId: string): Promise<OrdemDeServico[]> {
    const { data, error } = await supabase
        .from('ordens_de_servico')
        .select('*')
        .eq('veiculo_id', veiculoId);
    if (error) { console.error('Erro getOrdensByVeiculo:', error); return []; }
    return (data || []).map(dbToOrdem);
}

export async function getOrdensByCliente(clienteId: string): Promise<OrdemDeServico[]> {
    const { data, error } = await supabase
        .from('ordens_de_servico')
        .select('*')
        .eq('cliente_id', clienteId);
    if (error) { console.error('Erro getOrdensByCliente:', error); return []; }
    return (data || []).map(dbToOrdem);
}

export async function saveOrdem(ordem: Partial<OrdemDeServico> & { clienteId: string; veiculoId: string; tipoServico: OrdemDeServico['tipoServico'] }): Promise<OrdemDeServico> {
    const timestamp = now();

    if (ordem.id) {
        const dbData = ordemToDb({ ...ordem, atualizadoEm: timestamp });
        delete dbData.id;
        const { data, error } = await supabase
            .from('ordens_de_servico')
            .update(dbData)
            .eq('id', ordem.id)
            .select()
            .single();
        if (error) { console.error('Erro saveOrdem update:', error); throw error; }
        return dbToOrdem(data);
    }

    const newId = generateId();
    const nova: Partial<OrdemDeServico> = {
        ...ordem,
        id: newId,
        dataAbertura: ordem.dataAbertura || timestamp,
        trocaPlaca: ordem.trocaPlaca ?? false,
        status: ordem.status ?? 'aguardando_documentacao',
        checklist: ordem.checklist ?? [],
        vistoriaHistory: ordem.vistoriaHistory ?? [],
        comunicacoes: ordem.comunicacoes ?? [],
        auditLog: ordem.auditLog ?? [],
        criadoPor: ordem.criadoPor || getCurrentUser(),
        criadoEm: timestamp,
        atualizadoEm: timestamp,
    };
    const dbData = ordemToDb(nova);
    // Calcular próximo numero = MAX(numero) + 1
    // Usa maybeSingle() pra não quebrar em tabela vazia
    const { data: maxRow } = await supabase
        .from('ordens_de_servico')
        .select('numero')
        .order('numero', { ascending: false })
        .limit(1)
        .maybeSingle();
    dbData.numero = (maxRow?.numero ?? 0) + 1;
    const { data, error } = await supabase
        .from('ordens_de_servico')
        .insert(dbData)
        .select()
        .single();
    if (error) { console.error('Erro saveOrdem insert:', error); throw error; }
    return dbToOrdem(data);
}

export async function updateOrdem(id: string, updates: Partial<OrdemDeServico>): Promise<OrdemDeServico | undefined> {
    const dbData = ordemToDb({ ...updates, atualizadoEm: now() });
    const { data, error } = await supabase
        .from('ordens_de_servico')
        .update(dbData)
        .eq('id', id)
        .select()
        .single();
    if (error || !data) { console.error('Erro updateOrdem:', error); return undefined; }
    return dbToOrdem(data);
}

export async function deleteOrdem(id: string): Promise<void> {
    // Delete related payments (by os_id to catch payments with charge_id=null)
    await supabase.from('payments').delete().eq('os_id', id);
    // Delete related finance charges
    await supabase.from('finance_charges').delete().eq('os_id', id);

    const { error } = await supabase.from('ordens_de_servico').delete().eq('id', id);
    if (error) { console.error('Erro deleteOrdem:', error); throw error; }
}

export async function addAuditEntry(osId: string, acao: string, detalhes: string): Promise<void> {
    const ordem = await getOrdem(osId);
    if (!ordem) return;

    const { getCurrentUser } = await import('./auth');
    const nomeUsuario = getCurrentUser() || 'Sistema';

    const entry: AuditEntry = {
        id: generateId(),
        acao,
        detalhes,
        usuario: nomeUsuario,
        dataHora: now(),
    };

    await updateOrdem(osId, {
        auditLog: [...ordem.auditLog, entry],
    });
}

// --- PROTOCOLOS DIÁRIOS ---
export async function getProtocolos(): Promise<ProtocoloDiario[]> {
    const { data, error } = await supabase
        .from('protocolos_diarios')
        .select('*')
        .order('criado_em', { ascending: false });
    if (error) { console.error('Erro getProtocolos:', error); return []; }
    return (data || []).map(dbToProtocolo);
}

export async function getProtocolo(id: string): Promise<ProtocoloDiario | undefined> {
    const { data, error } = await supabase
        .from('protocolos_diarios')
        .select('*')
        .eq('id', id)
        .single();
    if (error || !data) return undefined;
    return dbToProtocolo(data);
}

export async function saveProtocolo(protocolo: Omit<ProtocoloDiario, 'id' | 'criadoEm'> & { id?: string }): Promise<ProtocoloDiario> {
    const timestamp = now();

    if (protocolo.id) {
        const dbData = protocoloToDb(protocolo);
        delete dbData.id;
        const { data, error } = await supabase
            .from('protocolos_diarios')
            .update(dbData)
            .eq('id', protocolo.id)
            .select()
            .single();
        if (error) { console.error('Erro saveProtocolo update:', error); throw error; }
        return dbToProtocolo(data);
    }

    const newId = generateId();
    const dbData = protocoloToDb({ ...protocolo, id: newId, criadoEm: timestamp });
    const { data, error } = await supabase
        .from('protocolos_diarios')
        .insert(dbData)
        .select()
        .single();
    if (error) { console.error('Erro saveProtocolo insert:', error); throw error; }
    return dbToProtocolo(data);
}

// --- BACKUP / EXPORT ---
export async function exportAllData(): Promise<string> {
    const [clientes, veiculos, ordens, protocolos] = await Promise.all([
        getClientes(),
        getVeiculos(),
        getOrdens(),
        getProtocolos(),
    ]);
    // Incluir dados financeiros no backup
    const { data: financeCharges } = await supabase.from('finance_charges').select('*');
    const { data: payments } = await supabase.from('payments').select('*');
    return JSON.stringify({
        clientes,
        veiculos,
        ordens,
        protocolos,
        financeCharges: financeCharges || [],
        payments: payments || [],
        exportedAt: now(),
    }, null, 2);
}

export async function importAllData(jsonString: string): Promise<void> {
    const data = JSON.parse(jsonString);
    const errors: string[] = [];

    if (data.clientes && data.clientes.length > 0) {
        const rows = data.clientes.map((c: Cliente) => clienteToDb(c));
        const { error } = await supabase.from('clientes').upsert(rows, { onConflict: 'id' });
        if (error) errors.push(`Clientes: ${error.message}`);
    }
    if (data.veiculos && data.veiculos.length > 0) {
        const rows = data.veiculos.map((v: Veiculo) => veiculoToDb(v));
        const { error } = await supabase.from('veiculos').upsert(rows, { onConflict: 'id' });
        if (error) errors.push(`Veículos: ${error.message}`);
    }
    if (data.ordens && data.ordens.length > 0) {
        const rows = data.ordens.map((o: OrdemDeServico) => ordemToDb(o));
        const { error } = await supabase.from('ordens_de_servico').upsert(rows, { onConflict: 'id' });
        if (error) errors.push(`Ordens: ${error.message}`);
    }
    if (data.protocolos && data.protocolos.length > 0) {
        const rows = data.protocolos.map((p: ProtocoloDiario) => protocoloToDb(p));
        const { error } = await supabase.from('protocolos_diarios').upsert(rows, { onConflict: 'id' });
        if (error) errors.push(`Protocolos: ${error.message}`);
    }
    // Restaurar dados financeiros se presentes
    if (data.financeCharges && data.financeCharges.length > 0) {
        const { error } = await supabase.from('finance_charges').upsert(data.financeCharges, { onConflict: 'id' });
        if (error) errors.push(`Finance Charges: ${error.message}`);
    }
    if (data.payments && data.payments.length > 0) {
        const { error } = await supabase.from('payments').upsert(data.payments, { onConflict: 'id' });
        if (error) errors.push(`Payments: ${error.message}`);
    }

    if (errors.length > 0) {
        throw new Error(`Erros na importação:\n${errors.join('\n')}`);
    }
}

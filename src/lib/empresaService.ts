// src/lib/empresaService.ts
import { supabase } from './supabaseClient';
import type { EmpresaParceira, EtapaEnvioConfig, EtapaEnvioStatus } from '../types/empresa';

// ── Mapper ────────────────────────────────────────────────────────────────────

function dbToEmpresa(row: any): EmpresaParceira {
    return {
        id: row.id,
        nome: row.nome,
        email: row.email ?? undefined,
        cor: row.cor ?? '#3B82F6',
        ativo: row.ativo,
        valorServico: row.valor_servico != null ? Number(row.valor_servico) : undefined,
        valorPlaca: row.valor_placa != null ? Number(row.valor_placa) : undefined,
        etapasEnvio: row.etapas_envio || [],
        documentosLabels: row.documentos_labels ?? undefined,
        emailAssuntoTemplate: row.email_assunto_template ?? undefined,
        emailCorpoTemplate: row.email_corpo_template ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function empresaToDb(e: Partial<EmpresaParceira>): Record<string, any> {
    const map: Record<string, any> = {};
    if (e.nome !== undefined) map.nome = e.nome;
    if (e.email !== undefined) map.email = e.email || null;
    if (e.cor !== undefined) map.cor = e.cor;
    if (e.ativo !== undefined) map.ativo = e.ativo;
    if (e.valorServico !== undefined) map.valor_servico = e.valorServico;
    if (e.valorPlaca !== undefined) map.valor_placa = e.valorPlaca;
    if (e.etapasEnvio !== undefined) map.etapas_envio = e.etapasEnvio;
    if (e.documentosLabels !== undefined) map.documentos_labels = e.documentosLabels;
    if (e.emailAssuntoTemplate !== undefined) map.email_assunto_template = e.emailAssuntoTemplate;
    if (e.emailCorpoTemplate !== undefined) map.email_corpo_template = e.emailCorpoTemplate;
    map.updated_at = new Date().toISOString();
    return map;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getEmpresas(): Promise<EmpresaParceira[]> {
    const { data, error } = await supabase
        .from('empresas_parceiras')
        .select('*')
        .order('nome');
    if (error) throw error;
    return (data || []).map(dbToEmpresa);
}

export async function getEmpresasAtivas(): Promise<EmpresaParceira[]> {
    const { data, error } = await supabase
        .from('empresas_parceiras')
        .select('*')
        .eq('ativo', true)
        .order('nome');
    if (error) throw error;
    return (data || []).map(dbToEmpresa);
}

export async function getEmpresa(id: string): Promise<EmpresaParceira | null> {
    const { data, error } = await supabase
        .from('empresas_parceiras')
        .select('*')
        .eq('id', id)
        .single();
    if (error) return null;
    return dbToEmpresa(data);
}

export async function saveEmpresa(empresa: Partial<EmpresaParceira> & { nome: string }): Promise<EmpresaParceira> {
    if (empresa.id) {
        const { data, error } = await supabase
            .from('empresas_parceiras')
            .update(empresaToDb(empresa))
            .eq('id', empresa.id)
            .select()
            .single();
        if (error) throw error;
        return dbToEmpresa(data);
    } else {
        const { data, error } = await supabase
            .from('empresas_parceiras')
            .insert(empresaToDb(empresa))
            .select()
            .single();
        if (error) throw error;
        return dbToEmpresa(data);
    }
}

export async function deleteEmpresa(id: string): Promise<void> {
    const { error } = await supabase
        .from('empresas_parceiras')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// ── Helpers para Envios ──────────────────────────────────────────────────────

const DOCS_PLACA = new Set(['boleto_placa', 'comprovante_placa']);

export function criarEnviosStatusFromEtapas(etapas: EtapaEnvioConfig[], trocaPlaca = true): EtapaEnvioStatus[] {
    return etapas.map((etapa) => ({
        etapa: etapa.ordem,
        nome: etapa.nome,
        documentos: etapa.documentos
            .filter((tipo) => trocaPlaca || !DOCS_PLACA.has(tipo))
            .map((tipo) => ({
                tipo,
                pronto: false,
                arquivo_id: null,
            })),
        enviado: false,
        enviado_em: null,
    }));
}

export function marcarDocumentoPronto(
    envios: EtapaEnvioStatus[],
    etapaIndex: number,
    tipoDocumento: string,
    pronto: boolean,
    arquivoId?: string
): EtapaEnvioStatus[] {
    return envios.map((etapa, i) => {
        if (i !== etapaIndex) return etapa;
        return {
            ...etapa,
            documentos: etapa.documentos.map((doc) => {
                if (doc.tipo !== tipoDocumento) return doc;
                return { ...doc, pronto, arquivo_id: arquivoId ?? doc.arquivo_id };
            }),
        };
    });
}

export function marcarEtapaEnviada(envios: EtapaEnvioStatus[], etapaIndex: number): EtapaEnvioStatus[] {
    return envios.map((etapa, i) => {
        if (i !== etapaIndex) return etapa;
        return { ...etapa, enviado: true, enviado_em: new Date().toISOString() };
    });
}

export function etapaCompleta(etapa: EtapaEnvioStatus): boolean {
    return etapa.documentos.every((doc) => doc.pronto);
}

export function adicionarDocumentoNaEtapa(
    envios: EtapaEnvioStatus[],
    etapaIndex: number,
    tipoDocumento: string
): EtapaEnvioStatus[] {
    return envios.map((etapa, i) => {
        if (i !== etapaIndex) return etapa;
        return {
            ...etapa,
            documentos: [...etapa.documentos, { tipo: tipoDocumento, pronto: false, arquivo_id: null }],
        };
    });
}

export function removerDocumentoDaEtapa(
    envios: EtapaEnvioStatus[],
    etapaIndex: number,
    tipoDocumento: string
): EtapaEnvioStatus[] {
    return envios.map((etapa, i) => {
        if (i !== etapaIndex) return etapa;
        return {
            ...etapa,
            documentos: etapa.documentos.filter((doc) => doc.tipo !== tipoDocumento),
        };
    });
}

export function adicionarEtapa(
    envios: EtapaEnvioStatus[],
    nome: string,
    documentos: string[]
): EtapaEnvioStatus[] {
    const novaEtapa: EtapaEnvioStatus = {
        etapa: envios.length + 1,
        nome,
        documentos: documentos.map((tipo) => ({ tipo, pronto: false, arquivo_id: null })),
        enviado: false,
        enviado_em: null,
    };
    return [...envios, novaEtapa];
}

export function removerEtapa(envios: EtapaEnvioStatus[], etapaIndex: number): EtapaEnvioStatus[] {
    return envios
        .filter((_, i) => i !== etapaIndex)
        .map((etapa, i) => ({ ...etapa, etapa: i + 1 }));
}

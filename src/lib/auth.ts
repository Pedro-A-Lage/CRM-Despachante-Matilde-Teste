import { supabase } from './supabaseClient';
import type { Usuario, RoleUsuario, PermissoesUsuario } from '../types';

// Hash senha com SHA-256
async function hashSenha(senha: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(senha);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function dbToUsuario(row: any): Usuario {
    return {
        id: row.id,
        nome: row.nome,
        role: row.role as RoleUsuario,
        permissoes: row.permissoes || {},
        primeiroLogin: row.primeiro_login,
        criadoEm: row.criado_em,
        atualizadoEm: row.atualizado_em,
    };
}

// Rate limiting para login — máximo de tentativas por janela de tempo
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

export async function login(nome: string, senha: string): Promise<Usuario | null> {
    // Verificar rate limit
    const key = nome.toLowerCase();
    const now = Date.now();
    const record = loginAttempts.get(key);
    if (record) {
        if (now - record.firstAttempt > LOGIN_WINDOW_MS) {
            // Janela expirou, resetar
            loginAttempts.delete(key);
        } else if (record.count >= LOGIN_MAX_ATTEMPTS) {
            throw new Error(`Muitas tentativas de login. Aguarde ${Math.ceil((LOGIN_WINDOW_MS - (now - record.firstAttempt)) / 60000)} minuto(s).`);
        }
    }

    const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('nome', nome)
        .single();

    if (error || !data) {
        // Registrar tentativa falha
        const existing = loginAttempts.get(key);
        if (existing) { existing.count++; }
        else { loginAttempts.set(key, { count: 1, firstAttempt: now }); }
        return null;
    }

    const hash = await hashSenha(senha);
    if (hash !== data.senha_hash) {
        // Registrar tentativa falha
        const existing = loginAttempts.get(key);
        if (existing) { existing.count++; }
        else { loginAttempts.set(key, { count: 1, firstAttempt: now }); }
        return null;
    }

    // Login bem sucedido — limpar tentativas
    loginAttempts.delete(key);
    return dbToUsuario(data);
}

export async function buscarUsuarioPorId(id: string): Promise<Usuario | null> {
    const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, role, permissoes, primeiro_login, criado_em, atualizado_em')
        .eq('id', id)
        .single();

    if (error || !data) return null;
    return dbToUsuario(data);
}

export async function trocarSenha(userId: string, senhaAtual: string, senhaNova: string): Promise<boolean> {
    // Verifica senha atual
    const { data, error } = await supabase
        .from('usuarios')
        .select('senha_hash')
        .eq('id', userId)
        .single();

    if (error || !data) return false;

    const hashAtual = await hashSenha(senhaAtual);
    if (hashAtual !== data.senha_hash) return false;

    // Atualiza senha e marca primeiro_login como false
    const hashNova = await hashSenha(senhaNova);
    const { error: updateError } = await supabase
        .from('usuarios')
        .update({
            senha_hash: hashNova,
            primeiro_login: false,
            atualizado_em: new Date().toISOString(),
        })
        .eq('id', userId);

    return !updateError;
}

// Guarda nome do usuário logado para uso em storage.ts (audit log)
let _currentUserName = 'Sistema';
export function setCurrentUser(nome: string) { _currentUserName = nome; }
export function getCurrentUser(): string { return _currentUserName; }

export async function listarUsuarios(): Promise<Usuario[]> {
    const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, role, permissoes, primeiro_login, criado_em, atualizado_em')
        .order('criado_em', { ascending: true });

    if (error || !data) return [];
    return data.map(dbToUsuario);
}

export async function criarUsuario(nome: string, senha: string, role: RoleUsuario): Promise<Usuario | null> {
    const senhaHash = await hashSenha(senha);
    const { data, error } = await supabase
        .from('usuarios')
        .insert({
            nome,
            senha_hash: senhaHash,
            role,
            primeiro_login: true,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
        })
        .select('id, nome, role, permissoes, primeiro_login, criado_em, atualizado_em')
        .single();

    if (error || !data) return null;
    return dbToUsuario(data);
}

export async function atualizarRoleUsuario(id: string, role: RoleUsuario): Promise<boolean> {
    const { error } = await supabase
        .from('usuarios')
        .update({ role, atualizado_em: new Date().toISOString() })
        .eq('id', id);

    return !error;
}

export async function resetarSenhaUsuario(id: string, novaSenha: string): Promise<boolean> {
    const senhaHash = await hashSenha(novaSenha);
    const { error } = await supabase
        .from('usuarios')
        .update({
            senha_hash: senhaHash,
            primeiro_login: true,
            atualizado_em: new Date().toISOString(),
        })
        .eq('id', id);

    return !error;
}

export async function atualizarPermissoes(userId: string, permissoes: PermissoesUsuario): Promise<boolean> {
    const { error } = await supabase
        .from('usuarios')
        .update({ permissoes, atualizado_em: new Date().toISOString() })
        .eq('id', userId);

    return !error;
}

export async function excluirUsuario(id: string): Promise<boolean> {
    const { error } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', id);

    return !error;
}

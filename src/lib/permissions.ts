import type { Usuario, PermissoesUsuario } from '../types';

// Default permissions per role
const DEFAULTS: Record<string, PermissoesUsuario> = {
    admin: {
        paginas: { financeiro: true, controle_pagamentos: true, configuracoes: true, usuarios: true, backup: true, emails: true, servicos_detran: true, protocolo_diario: true, calendario_vistorias: true },
        os: { ver_custos: true, ver_honorarios: true, ver_valor_servico: true, receber_pagamento: true, editar_status: true, editar_checklist: true, editar_vistoria: true, editar_delegacia: true, excluir_os: true },
        dados: { editar_perfil: true },
    },
    gerente: {
        paginas: { financeiro: true, controle_pagamentos: true, configuracoes: false, usuarios: false, backup: false, emails: true, servicos_detran: true, protocolo_diario: true, calendario_vistorias: true },
        os: { ver_custos: true, ver_honorarios: true, ver_valor_servico: true, receber_pagamento: true, editar_status: true, editar_checklist: true, editar_vistoria: true, editar_delegacia: true, excluir_os: false },
        dados: { editar_perfil: true },
    },
    funcionario: {
        paginas: { financeiro: false, controle_pagamentos: false, configuracoes: false, usuarios: false, backup: false, emails: false, servicos_detran: false, protocolo_diario: true, calendario_vistorias: true },
        os: { ver_custos: false, ver_honorarios: false, ver_valor_servico: true, receber_pagamento: true, editar_status: true, editar_checklist: true, editar_vistoria: true, editar_delegacia: true, excluir_os: false },
        dados: { editar_perfil: true },
    },
};

// Get effective permission - user override > role default
export function temPermissao(usuario: Usuario | null, categoria: keyof PermissoesUsuario, chave: string): boolean {
    if (!usuario) return false;
    if (usuario.role === 'admin') return true; // Admin always has full access

    // Check user-specific override first
    const userPerms = usuario.permissoes?.[categoria] as Record<string, boolean> | undefined;
    if (userPerms && typeof userPerms[chave] === 'boolean') {
        return userPerms[chave];
    }

    // Fall back to role defaults
    const roleDefaults = DEFAULTS[usuario.role]?.[categoria] as Record<string, boolean> | undefined;
    return roleDefaults?.[chave] ?? false;
}

// Get all effective permissions for a user (merged: role defaults + user overrides)
export function getPermissoesEfetivas(usuario: Usuario): PermissoesUsuario {
    if (usuario.role === 'admin') return DEFAULTS.admin!;

    const roleDefaults = DEFAULTS[usuario.role] || DEFAULTS.funcionario;
    const userOverrides = usuario.permissoes || {};

    return {
        paginas: { ...roleDefaults!.paginas, ...userOverrides.paginas },
        os: { ...roleDefaults!.os, ...userOverrides.os },
        dados: { ...roleDefaults!.dados, ...userOverrides.dados },
    };
}

export function getDefaultPermissoes(role: string): PermissoesUsuario {
    return (DEFAULTS[role] || DEFAULTS.funcionario)!;
}

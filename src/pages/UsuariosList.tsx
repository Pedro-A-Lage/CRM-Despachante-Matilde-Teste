import { useEffect, useState } from 'react';
import { UserPlus, Pencil, KeyRound, Trash2, X, Check, Shield, Users, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    listarUsuarios,
    criarUsuario,
    atualizarRoleUsuario,
    atualizarPermissoes,
    resetarSenhaUsuario,
    excluirUsuario,
} from '../lib/auth';
import { getDefaultPermissoes } from '../lib/permissions';
import type { Usuario, RoleUsuario, PermissoesUsuario } from '../types';
import { useConfirm } from '../components/ConfirmProvider';

const ROLES: { value: RoleUsuario; label: string }[] = [
    { value: 'admin', label: 'Administrador' },
    { value: 'gerente', label: 'Gerente' },
    { value: 'funcionario', label: 'Funcionário' },
];

function roleBadge(role: RoleUsuario) {
    const styles: Record<RoleUsuario, { bg: string; color: string }> = {
        admin: { bg: 'rgba(0,117,222,0.1)', color: 'var(--notion-blue)' },
        gerente: { bg: 'rgba(221,91,0,0.1)', color: 'var(--notion-orange)' },
        funcionario: { bg: 'var(--bg-surface, #334155)', color: 'var(--notion-text)' },
    };
    const label = ROLES.find(r => r.value === role)?.label ?? role;
    const s = styles[role];
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 10px',
            borderRadius: 20,
            fontSize: '0.72rem',
            fontWeight: 700,
            background: s.bg,
            color: s.color,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
        }}>
            <Shield size={11} />
            {label}
        </span>
    );
}

function formatDate(iso: string) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
}

// ---------- Modal Novo Usuário ----------
interface ModalNovoProps {
    onClose: () => void;
    onSalvar: (nome: string, senha: string, role: RoleUsuario) => Promise<void>;
}
function ModalNovoUsuario({ onClose, onSalvar }: ModalNovoProps) {
    const [nome, setNome] = useState('');
    const [senha, setSenha] = useState('');
    const [role, setRole] = useState<RoleUsuario>('funcionario');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!nome.trim() || !senha.trim()) { setErro('Preencha todos os campos.'); return; }
        if (senha.length < 8) { setErro('Senha deve ter ao menos 8 caracteres.'); return; }
        setSalvando(true);
        setErro('');
        try {
            await onSalvar(nome.trim(), senha, role);
            onClose();
        } catch {
            setErro('Erro ao criar usuário. Tente novamente.');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
            <div className="modal" style={{ maxWidth: 420 }}>
                <div className="modal-header">
                    <h3 className="modal-title">Novo Usuário</h3>
                    <button className="btn btn-ghost" onClick={onClose}><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {erro && (
                            <div style={{ background: 'var(--notion-orange)20', border: '1px solid var(--notion-orange)', borderRadius: 8, padding: '8px 12px', color: 'var(--notion-orange)', fontSize: '0.85rem' }}>
                                {erro}
                            </div>
                        )}
                        <div className="form-group">
                            <label className="form-label">Nome</label>
                            <input
                                className="form-input"
                                type="text"
                                value={nome}
                                onChange={e => setNome(e.target.value)}
                                autoFocus
                                placeholder="Nome completo"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Senha</label>
                            <input
                                className="form-input"
                                type="password"
                                value={senha}
                                onChange={e => setSenha(e.target.value)}
                                placeholder="Senha inicial"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Perfil</label>
                            <select className="form-input" value={role} onChange={e => setRole(e.target.value as RoleUsuario)}>
                                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
                        <button type="submit" className="btn btn-primary" disabled={salvando}>
                            {salvando ? 'Salvando...' : 'Criar Usuário'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ---------- Modal Resetar Senha ----------
interface ModalSenhaProps {
    usuario: Usuario;
    onClose: () => void;
    onSalvar: (novaSenha: string) => Promise<void>;
}
function ModalResetarSenha({ usuario, onClose, onSalvar }: ModalSenhaProps) {
    const [senha, setSenha] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (senha.length < 8) { setErro('Senha deve ter ao menos 8 caracteres.'); return; }
        setSalvando(true);
        setErro('');
        try {
            await onSalvar(senha);
            onClose();
        } catch {
            setErro('Erro ao resetar senha. Tente novamente.');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
            <div className="modal" style={{ maxWidth: 380 }}>
                <div className="modal-header">
                    <h3 className="modal-title">Resetar Senha</h3>
                    <button className="btn btn-ghost" onClick={onClose}><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <p style={{ fontSize: '0.875rem', color: 'var(--notion-text-secondary)' }}>
                            Definir nova senha para <strong>{usuario.nome}</strong>. O usuário precisará trocar a senha no próximo login.
                        </p>
                        {erro && (
                            <div style={{ background: 'var(--notion-orange)20', border: '1px solid var(--notion-orange)', borderRadius: 8, padding: '8px 12px', color: 'var(--notion-orange)', fontSize: '0.85rem' }}>
                                {erro}
                            </div>
                        )}
                        <div className="form-group">
                            <label className="form-label">Nova Senha</label>
                            <input
                                className="form-input"
                                type="password"
                                value={senha}
                                onChange={e => setSenha(e.target.value)}
                                autoFocus
                                placeholder="Nova senha"
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
                        <button type="submit" className="btn btn-primary" disabled={salvando}>
                            {salvando ? 'Salvando...' : 'Resetar Senha'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ---------- Modal Permissões ----------
interface PermissaoItem {
    categoria: keyof PermissoesUsuario;
    chave: string;
    label: string;
}

const SECOES: { titulo: string; items: PermissaoItem[] }[] = [
    {
        titulo: 'Páginas',
        items: [
            { categoria: 'paginas', chave: 'financeiro', label: 'Financeiro' },
            { categoria: 'paginas', chave: 'controle_pagamentos', label: 'Controle de Pagamentos' },
            { categoria: 'paginas', chave: 'configuracoes', label: 'Configurações' },
            { categoria: 'paginas', chave: 'usuarios', label: 'Usuários' },
            { categoria: 'paginas', chave: 'backup', label: 'Backup' },
            { categoria: 'paginas', chave: 'emails', label: 'E-mails' },
            { categoria: 'paginas', chave: 'servicos_detran', label: 'Serviços DETRAN' },
            { categoria: 'paginas', chave: 'protocolo_diario', label: 'Protocolo Diário' },
            { categoria: 'paginas', chave: 'calendario_vistorias', label: 'Agendamentos (Calendário Vistorias)' },
        ],
    },
    {
        titulo: 'Ordem de Serviço',
        items: [
            { categoria: 'os', chave: 'ver_custos', label: 'Ver custos/cobranças' },
            { categoria: 'os', chave: 'ver_honorarios', label: 'Ver honorários' },
            { categoria: 'os', chave: 'ver_valor_servico', label: 'Ver valor do serviço' },
            { categoria: 'os', chave: 'receber_pagamento', label: 'Registrar recebimentos' },
            { categoria: 'os', chave: 'editar_status', label: 'Editar status' },
            { categoria: 'os', chave: 'editar_checklist', label: 'Editar checklist' },
            { categoria: 'os', chave: 'editar_vistoria', label: 'Editar vistoria' },
            { categoria: 'os', chave: 'editar_delegacia', label: 'Editar delegacia' },
            { categoria: 'os', chave: 'excluir_os', label: 'Excluir OS' },
        ],
    },
    {
        titulo: 'Dados Pessoais',
        items: [
            { categoria: 'dados', chave: 'editar_perfil', label: 'Editar próprio perfil' },
        ],
    },
];

interface ModalPermissoesProps {
    usuario: Usuario;
    onClose: () => void;
    onSalvar: (permissoes: PermissoesUsuario) => Promise<void>;
}

function ModalPermissoes({ usuario, onClose, onSalvar }: ModalPermissoesProps) {
    const defaults = getDefaultPermissoes(usuario.role);
    // overrides: only keys the user has explicitly set (not undefined)
    const [overrides, setOverrides] = useState<PermissoesUsuario>(usuario.permissoes || {});
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    function getDefault(cat: keyof PermissoesUsuario, chave: string): boolean {
        const section = defaults[cat] as Record<string, boolean> | undefined;
        return section?.[chave] ?? false;
    }

    function getOverride(cat: keyof PermissoesUsuario, chave: string): boolean | undefined {
        const section = overrides[cat] as Record<string, boolean> | undefined;
        if (!section || typeof section[chave] !== 'boolean') return undefined;
        return section[chave];
    }

    function isOverridden(cat: keyof PermissoesUsuario, chave: string): boolean {
        return getOverride(cat, chave) !== undefined;
    }

    function toggleOverride(cat: keyof PermissoesUsuario, chave: string) {
        setOverrides(prev => {
            const section = { ...(prev[cat] as Record<string, boolean> || {}) };
            if (typeof section[chave] === 'boolean') {
                // Remove override - go back to default
                delete section[chave];
            } else {
                // Set override to opposite of default
                section[chave] = !getDefault(cat, chave);
            }
            return { ...prev, [cat]: Object.keys(section).length > 0 ? section : undefined };
        });
    }

    function setOverrideValue(cat: keyof PermissoesUsuario, chave: string, value: boolean) {
        setOverrides(prev => {
            const section = { ...(prev[cat] as Record<string, boolean> || {}) };
            section[chave] = value;
            return { ...prev, [cat]: section };
        });
    }

    function getEffective(cat: keyof PermissoesUsuario, chave: string): boolean {
        const ov = getOverride(cat, chave);
        return ov !== undefined ? ov : getDefault(cat, chave);
    }

    async function handleSalvar() {
        setSalvando(true);
        setErro('');
        try {
            // Clean up: remove categories that are empty or undefined
            const cleaned: PermissoesUsuario = {};
            for (const cat of ['paginas', 'os', 'dados'] as (keyof PermissoesUsuario)[]) {
                const section = overrides[cat] as Record<string, boolean> | undefined;
                if (section && Object.keys(section).length > 0) {
                    (cleaned as any)[cat] = section;
                }
            }
            await onSalvar(cleaned);
            onClose();
        } catch {
            setErro('Erro ao salvar permissões.');
        } finally {
            setSalvando(false);
        }
    }

    const roleLabel = ROLES.find(r => r.value === usuario.role)?.label ?? usuario.role;

    return (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
            <div className="modal" style={{ maxWidth: 560 }}>
                <div className="modal-header">
                    <h3 className="modal-title">Permissões — {usuario.nome}</h3>
                    <button className="btn btn-ghost" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '70vh', overflowY: 'auto' }}>
                    <p style={{ fontSize: '0.82rem', color: 'var(--notion-text-secondary)', margin: 0 }}>
                        Perfil: <strong>{roleLabel}</strong>. Permissões marcadas como "Padrão" seguem o perfil. Ative a personalização para sobrescrever.
                    </p>
                    {erro && (
                        <div style={{ background: 'var(--notion-orange)20', border: '1px solid var(--notion-orange)', borderRadius: 8, padding: '8px 12px', color: 'var(--notion-orange)', fontSize: '0.85rem' }}>
                            {erro}
                        </div>
                    )}
                    {SECOES.map(secao => (
                        <div key={secao.titulo}>
                            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                                {secao.titulo}
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {secao.items.map(item => {
                                    const overridden = isOverridden(item.categoria, item.chave);
                                    const effective = getEffective(item.categoria, item.chave);
                                    const defaultVal = getDefault(item.categoria, item.chave);
                                    return (
                                        <div
                                            key={`${item.categoria}.${item.chave}`}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                                padding: '6px 10px',
                                                borderRadius: 6,
                                                background: overridden ? 'var(--bg-surface, #1e293b)' : 'transparent',
                                                border: overridden ? '1px solid var(--notion-blue)' : '1px solid transparent',
                                            }}
                                        >
                                            {/* Override toggle */}
                                            <button
                                                type="button"
                                                onClick={() => toggleOverride(item.categoria, item.chave)}
                                                title={overridden ? 'Voltar ao padrão do perfil' : 'Personalizar esta permissão'}
                                                style={{
                                                    width: 18,
                                                    height: 18,
                                                    borderRadius: 4,
                                                    border: overridden ? '2px solid var(--notion-blue)' : '2px solid var(--notion-text-secondary)',
                                                    background: overridden ? 'var(--notion-blue)' : 'transparent',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                    padding: 0,
                                                    color: '#fff',
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {overridden ? '✎' : ''}
                                            </button>

                                            {/* Permission value checkbox */}
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: overridden ? 'pointer' : 'default' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={effective}
                                                    disabled={!overridden}
                                                    onChange={e => overridden && setOverrideValue(item.categoria, item.chave, e.target.checked)}
                                                    style={{ accentColor: 'var(--notion-blue)' }}
                                                />
                                                <span style={{ fontSize: '0.85rem', color: 'var(--notion-text)' }}>
                                                    {item.label}
                                                </span>
                                            </label>

                                            {/* Default indicator */}
                                            <span style={{ fontSize: '0.72rem', color: 'var(--notion-text-secondary)', whiteSpace: 'nowrap' }}>
                                                Padrão: {defaultVal ? 'Sim' : 'Não'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
                    <button type="button" className="btn btn-primary" onClick={handleSalvar} disabled={salvando}>
                        {salvando ? 'Salvando...' : 'Salvar Permissões'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ---------- Página principal ----------
export default function UsuariosList() {
    const { usuario: usuarioLogado } = useAuth();
    const confirm = useConfirm();
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');

    // Modais
    const [showNovo, setShowNovo] = useState(false);
    const [editandoRole, setEditandoRole] = useState<{ id: string; role: RoleUsuario } | null>(null);
    const [modalSenha, setModalSenha] = useState<Usuario | null>(null);
    const [modalPermissoes, setModalPermissoes] = useState<Usuario | null>(null);

    async function carregar() {
        setCarregando(true);
        setErro('');
        try {
            const lista = await listarUsuarios();
            setUsuarios(lista);
        } catch {
            setErro('Erro ao carregar usuários.');
        } finally {
            setCarregando(false);
        }
    }

    useEffect(() => { carregar(); }, []);

    async function handleCriar(nome: string, senha: string, role: RoleUsuario) {
        const novo = await criarUsuario(nome, senha, role);
        if (!novo) throw new Error('Falha ao criar');
        await carregar();
    }

    async function handleSalvarRole(id: string, role: RoleUsuario) {
        await atualizarRoleUsuario(id, role);
        setEditandoRole(null);
        await carregar();
    }

    async function handleResetarSenha(id: string, novaSenha: string) {
        const ok = await resetarSenhaUsuario(id, novaSenha);
        if (!ok) throw new Error('Falha ao resetar');
    }

    async function handleSalvarPermissoes(userId: string, permissoes: PermissoesUsuario) {
        const ok = await atualizarPermissoes(userId, permissoes);
        if (!ok) throw new Error('Falha ao salvar permissões');
        await carregar();
    }

    async function handleExcluirComConfirmacao(u: Usuario) {
        const ok = await confirm({
            title: 'Confirmar Exclusão',
            message: `Tem certeza que deseja excluir o usuário ${u.nome}? Esta ação não pode ser desfeita.`,
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            danger: true,
        });
        if (!ok) return;
        await excluirUsuario(u.id);
        await carregar();
    }

    return (
        <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
            {/* Cabeçalho */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Users size={22} style={{ color: 'var(--notion-blue)' }} />
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Usuários do Sistema</h2>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--notion-text-secondary)' }}>
                            {usuarios.length} usuário{usuarios.length !== 1 ? 's' : ''} cadastrado{usuarios.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setShowNovo(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <UserPlus size={16} />
                    Novo Usuário
                </button>
            </div>

            {/* Erro */}
            {erro && (
                <div style={{ background: 'var(--notion-orange)20', border: '1px solid var(--notion-orange)', borderRadius: 8, padding: '10px 14px', color: 'var(--notion-orange)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                    {erro}
                </div>
            )}

            {/* Lista */}
            {carregando ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--notion-text-secondary)' }}>Carregando...</div>
            ) : usuarios.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--notion-text-secondary)', fontSize: '0.9rem' }}>
                    Nenhum usuário cadastrado.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {usuarios.map(u => {
                        const ehProprio = u.id === usuarioLogado?.id;
                        const roleEditando = editandoRole?.id === u.id;

                        return (
                            <div
                                key={u.id}
                                style={{
                                    background: 'var(--notion-surface)',
                                    border: ehProprio ? '1px solid var(--notion-blue)' : '1px solid var(--notion-border)',
                                    borderRadius: 10,
                                    padding: '1rem 1.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    flexWrap: 'wrap',
                                }}
                            >
                                {/* Info principal */}
                                <div style={{ flex: 1, minWidth: 160 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{u.nome}</span>
                                        {ehProprio && (
                                            <span style={{ fontSize: '0.7rem', background: 'var(--notion-blue)', color: '#fff', borderRadius: 20, padding: '1px 8px', fontWeight: 600 }}>
                                                Você
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--notion-text-secondary)', marginTop: 2 }}>
                                        Criado em {formatDate(u.criadoEm)}
                                        {u.primeiroLogin && (
                                            <span style={{ marginLeft: 8, color: 'var(--notion-orange)', fontWeight: 600 }}>
                                                · Aguardando troca de senha
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Role */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {roleEditando ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <select
                                                className="form-input"
                                                style={{ padding: '4px 8px', fontSize: '0.82rem', height: 'auto' }}
                                                value={editandoRole.role}
                                                onChange={e => setEditandoRole({ id: u.id, role: e.target.value as RoleUsuario })}
                                            >
                                                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                            </select>
                                            <button
                                                className="btn btn-primary"
                                                style={{ padding: '4px 8px' }}
                                                onClick={() => handleSalvarRole(u.id, editandoRole.role)}
                                                title="Confirmar"
                                            >
                                                <Check size={14} />
                                            </button>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '4px 8px' }}
                                                onClick={() => setEditandoRole(null)}
                                                title="Cancelar"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        roleBadge(u.role)
                                    )}
                                </div>

                                {/* Ações */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {/* Editar role */}
                                    <button
                                        className="btn btn-ghost"
                                        style={{ padding: '6px 8px' }}
                                        title="Alterar perfil"
                                        disabled={ehProprio}
                                        onClick={() => setEditandoRole({ id: u.id, role: u.role })}
                                    >
                                        <Pencil size={15} />
                                    </button>

                                    {/* Permissões (não mostrar para admin) */}
                                    {u.role !== 'admin' && (
                                        <button
                                            className="btn btn-ghost"
                                            style={{ padding: '6px 8px' }}
                                            title="Permissões"
                                            onClick={() => setModalPermissoes(u)}
                                        >
                                            <Lock size={15} />
                                        </button>
                                    )}

                                    {/* Resetar senha */}
                                    <button
                                        className="btn btn-ghost"
                                        style={{ padding: '6px 8px' }}
                                        title="Resetar senha"
                                        onClick={() => setModalSenha(u)}
                                    >
                                        <KeyRound size={15} />
                                    </button>

                                    {/* Excluir */}
                                    <button
                                        className="btn btn-ghost"
                                        style={{ padding: '6px 8px', color: ehProprio ? 'var(--notion-text-secondary)' : 'var(--notion-orange)' }}
                                        title={ehProprio ? 'Não é possível excluir sua própria conta' : 'Excluir usuário'}
                                        disabled={ehProprio}
                                        onClick={() => !ehProprio && handleExcluirComConfirmacao(u)}
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal Novo Usuário */}
            {showNovo && (
                <ModalNovoUsuario
                    onClose={() => setShowNovo(false)}
                    onSalvar={handleCriar}
                />
            )}

            {/* Modal Resetar Senha */}
            {modalSenha && (
                <ModalResetarSenha
                    usuario={modalSenha}
                    onClose={() => setModalSenha(null)}
                    onSalvar={(novaSenha) => handleResetarSenha(modalSenha.id, novaSenha)}
                />
            )}

            {/* Modal Permissões */}
            {modalPermissoes && (
                <ModalPermissoes
                    usuario={modalPermissoes}
                    onClose={() => setModalPermissoes(null)}
                    onSalvar={(permissoes) => handleSalvarPermissoes(modalPermissoes.id, permissoes)}
                />
            )}

        </div>
    );
}

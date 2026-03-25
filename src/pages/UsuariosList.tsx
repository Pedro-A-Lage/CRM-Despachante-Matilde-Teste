import { useEffect, useState } from 'react';
import { UserPlus, Pencil, KeyRound, Trash2, X, Check, Shield, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    listarUsuarios,
    criarUsuario,
    atualizarRoleUsuario,
    resetarSenhaUsuario,
    excluirUsuario,
} from '../lib/auth';
import type { Usuario, RoleUsuario } from '../types';
import { useConfirm } from '../components/ConfirmProvider';

const ROLES: { value: RoleUsuario; label: string }[] = [
    { value: 'admin', label: 'Administrador' },
    { value: 'gerente', label: 'Gerente' },
    { value: 'funcionario', label: 'Funcionário' },
];

function roleBadge(role: RoleUsuario) {
    const styles: Record<RoleUsuario, { bg: string; color: string }> = {
        admin: { bg: 'var(--color-primary)', color: '#fff' },
        gerente: { bg: 'var(--color-warning, #f59e0b)', color: '#fff' },
        funcionario: { bg: 'var(--bg-surface, #334155)', color: 'var(--color-text-primary)' },
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
        if (senha.length < 4) { setErro('Senha deve ter ao menos 4 caracteres.'); return; }
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
                            <div style={{ background: 'var(--color-danger, #ef4444)20', border: '1px solid var(--color-danger, #ef4444)', borderRadius: 8, padding: '8px 12px', color: 'var(--color-danger, #ef4444)', fontSize: '0.85rem' }}>
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
        if (senha.length < 4) { setErro('Senha deve ter ao menos 4 caracteres.'); return; }
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
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                            Definir nova senha para <strong>{usuario.nome}</strong>. O usuário precisará trocar a senha no próximo login.
                        </p>
                        {erro && (
                            <div style={{ background: 'var(--color-danger, #ef4444)20', border: '1px solid var(--color-danger, #ef4444)', borderRadius: 8, padding: '8px 12px', color: 'var(--color-danger, #ef4444)', fontSize: '0.85rem' }}>
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
                    <Users size={22} style={{ color: 'var(--color-primary)' }} />
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Usuários do Sistema</h2>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
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
                <div style={{ background: 'var(--color-danger, #ef4444)20', border: '1px solid var(--color-danger, #ef4444)', borderRadius: 8, padding: '10px 14px', color: 'var(--color-danger, #ef4444)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                    {erro}
                </div>
            )}

            {/* Lista */}
            {carregando ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>Carregando...</div>
            ) : usuarios.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-tertiary)', fontSize: '0.9rem' }}>
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
                                    background: 'var(--bg-card)',
                                    border: ehProprio ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
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
                                            <span style={{ fontSize: '0.7rem', background: 'var(--color-primary)', color: '#fff', borderRadius: 20, padding: '1px 8px', fontWeight: 600 }}>
                                                Você
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                                        Criado em {formatDate(u.criadoEm)}
                                        {u.primeiroLogin && (
                                            <span style={{ marginLeft: 8, color: 'var(--color-warning, #f59e0b)', fontWeight: 600 }}>
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
                                        style={{ padding: '6px 8px', color: ehProprio ? 'var(--color-text-tertiary)' : 'var(--color-danger, #ef4444)' }}
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

        </div>
    );
}

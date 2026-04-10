import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Eye, EyeOff, KeyRound, CheckCircle2 } from 'lucide-react';

export default function TrocarSenhaModal() {
    const { precisaTrocarSenha, trocarSenha, usuario } = useAuth();
    const [senhaAtual, setSenhaAtual] = useState('');
    const [senhaNova, setSenhaNova] = useState('');
    const [confirmar, setConfirmar] = useState('');
    const [erro, setErro] = useState('');
    const [sucesso, setSucesso] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [mostrar, setMostrar] = useState(false);

    if (!precisaTrocarSenha || sucesso) return null;

    const senhaValida = senhaNova.length >= 6;
    const senhasIguais = senhaNova === confirmar && confirmar.length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErro('');

        if (!senhaAtual || !senhaNova || !confirmar) {
            setErro('Preencha todos os campos');
            return;
        }
        if (!senhaValida) {
            setErro('A nova senha deve ter pelo menos 6 caracteres');
            return;
        }
        if (!senhasIguais) {
            setErro('As senhas não coincidem');
            return;
        }
        if (senhaAtual === senhaNova) {
            setErro('A nova senha deve ser diferente da atual');
            return;
        }

        setEnviando(true);
        try {
            const ok = await trocarSenha(senhaAtual, senhaNova);
            if (ok) {
                setSucesso(true);
            } else {
                setErro('Senha atual incorreta');
            }
        } catch {
            setErro('Erro ao trocar senha. Tente novamente.');
        } finally {
            setEnviando(false);
        }
    };

    const inputStyle = (hasValue: boolean): React.CSSProperties => ({
        width: '100%',
        padding: '12px 44px 12px 16px',
        borderRadius: 12,
        border: `2px solid ${hasValue ? 'var(--notion-blue)' : 'var(--notion-border)'}`,
        background: 'var(--notion-surface)',
        color: 'var(--notion-text)',
        fontSize: '0.95rem',
        outline: 'none',
        boxSizing: 'border-box' as const,
        transition: 'border-color 0.2s',
    });

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '0.75rem',
        fontWeight: 700,
        color: 'var(--notion-text-secondary)',
        marginBottom: 8,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
    };

    const eyeBtn: React.CSSProperties = {
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--notion-text-secondary)',
        padding: 4,
        display: 'flex',
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.85) 0%, rgba(30,41,59,0.9) 100%)',
            backdropFilter: 'blur(12px)',
        }}>
            <div style={{
                width: '100%',
                maxWidth: 440,
                background: 'var(--notion-surface)',
                borderRadius: 24,
                border: '1px solid var(--notion-border)',
                overflow: 'hidden',
                boxShadow: '0 24px 64px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)',
                margin: 20,
            }}>
                {/* Header com gradiente */}
                <div style={{
                    background: 'linear-gradient(135deg, var(--notion-blue) 0%, var(--notion-blue-hover) 100%)',
                    padding: '32px 32px 28px',
                    textAlign: 'center',
                }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 16,
                        background: 'rgba(255,255,255,0.2)',
                        backdropFilter: 'blur(8px)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 14,
                    }}>
                        <Shield size={28} style={{ color: 'var(--notion-text)' }} />
                    </div>
                    <h2 style={{
                        margin: '0 0 6px',
                        fontSize: '1.35rem',
                        fontWeight: 800,
                        color: 'var(--notion-text)',
                    }}>
                        Crie sua nova senha
                    </h2>
                    <p style={{
                        margin: 0,
                        fontSize: '0.9rem',
                        color: 'rgba(255,255,255,0.8)',
                        fontWeight: 500,
                    }}>
                        Olá, {usuario?.nome}! Defina uma senha pessoal para continuar.
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: '28px 32px 32px' }}>
                    {/* Senha Atual */}
                    <div style={{ marginBottom: 18 }}>
                        <label style={labelStyle}>Senha Atual</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={mostrar ? 'text' : 'password'}
                                value={senhaAtual}
                                onChange={e => setSenhaAtual(e.target.value)}
                                placeholder="Digite a senha fornecida"
                                autoComplete="current-password"
                                autoFocus
                                style={inputStyle(senhaAtual.length > 0)}
                            />
                            <button type="button" onClick={() => setMostrar(!mostrar)} style={eyeBtn}>
                                {mostrar ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* Divider */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        margin: '20px 0',
                    }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--notion-border)' }} />
                        <KeyRound size={14} style={{ color: 'var(--notion-text-secondary)' }} />
                        <div style={{ flex: 1, height: 1, background: 'var(--notion-border)' }} />
                    </div>

                    {/* Nova Senha */}
                    <div style={{ marginBottom: 18 }}>
                        <label style={labelStyle}>
                            Nova Senha
                            {senhaValida && (
                                <CheckCircle2 size={12} style={{ color: 'var(--notion-green)', marginLeft: 6, verticalAlign: 'middle' }} />
                            )}
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={mostrar ? 'text' : 'password'}
                                value={senhaNova}
                                onChange={e => setSenhaNova(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                                autoComplete="new-password"
                                style={inputStyle(senhaValida)}
                            />
                            <button type="button" onClick={() => setMostrar(!mostrar)} style={eyeBtn}>
                                {mostrar ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {senhaNova.length > 0 && !senhaValida && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--notion-orange)', marginTop: 4, fontWeight: 500 }}>
                                Faltam {6 - senhaNova.length} caractere{6 - senhaNova.length > 1 ? 's' : ''}
                            </div>
                        )}
                    </div>

                    {/* Confirmar */}
                    <div style={{ marginBottom: 24 }}>
                        <label style={labelStyle}>
                            Confirmar Nova Senha
                            {senhasIguais && (
                                <CheckCircle2 size={12} style={{ color: 'var(--notion-green)', marginLeft: 6, verticalAlign: 'middle' }} />
                            )}
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={mostrar ? 'text' : 'password'}
                                value={confirmar}
                                onChange={e => setConfirmar(e.target.value)}
                                placeholder="Repita a nova senha"
                                autoComplete="new-password"
                                style={inputStyle(senhasIguais)}
                            />
                            <button type="button" onClick={() => setMostrar(!mostrar)} style={eyeBtn}>
                                {mostrar ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {confirmar.length > 0 && !senhasIguais && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--notion-orange)', marginTop: 4, fontWeight: 500 }}>
                                As senhas não coincidem
                            </div>
                        )}
                    </div>

                    {/* Erro */}
                    {erro && (
                        <div style={{
                            padding: '12px 16px',
                            borderRadius: 12,
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            color: 'var(--notion-orange)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            marginBottom: 18,
                            textAlign: 'center',
                        }}>
                            {erro}
                        </div>
                    )}

                    {/* Botão */}
                    <button
                        type="submit"
                        disabled={enviando || !senhaValida || !senhasIguais || !senhaAtual}
                        style={{
                            width: '100%',
                            padding: '14px',
                            borderRadius: 14,
                            border: 'none',
                            background: (senhaValida && senhasIguais && senhaAtual)
                                ? 'linear-gradient(135deg, var(--notion-blue) 0%, var(--notion-blue-hover) 100%)'
                                : 'var(--notion-bg-alt)',
                            color: (senhaValida && senhasIguais && senhaAtual) ? 'white' : 'var(--notion-text-secondary)',
                            fontSize: '1rem',
                            fontWeight: 700,
                            cursor: (enviando || !senhaValida || !senhasIguais || !senhaAtual) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: (senhaValida && senhasIguais && senhaAtual)
                                ? '0 4px 12px rgba(245,158,11,0.3)'
                                : 'none',
                        }}
                    >
                        {enviando ? 'Salvando...' : 'Confirmar Nova Senha'}
                    </button>
                </form>
            </div>
        </div>
    );
}

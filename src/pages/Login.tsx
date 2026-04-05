import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, Eye, EyeOff } from 'lucide-react';

export default function Login() {
    const { usuario, login, carregando } = useAuth();
    const [nome, setNome] = useState('');
    const [senha, setSenha] = useState('');
    const [erro, setErro] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [mostrarSenha, setMostrarSenha] = useState(false);

    if (carregando) return null;
    if (usuario) return <Navigate to="/" replace />;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErro('');

        if (!nome.trim() || !senha) {
            setErro('Preencha todos os campos');
            return;
        }

        setEnviando(true);
        try {
            const ok = await login(nome.trim(), senha);
            if (!ok) {
                setErro('Usuário ou senha incorretos');
            }
        } catch {
            setErro('Erro ao conectar. Tente novamente.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-body)',
            padding: 20,
        }}>
            <div style={{
                width: '100%',
                maxWidth: 400,
                background: 'var(--bg-card)',
                borderRadius: 16,
                border: '1px solid var(--border-color)',
                padding: '40px 32px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <img
                        src="/Matilde.png"
                        alt="Despachante Matilde"
                        style={{ height: 120, marginBottom: 16, display: 'block', margin: '0 auto 16px' }}
                    />
                    <p style={{
                        margin: 0,
                        fontSize: '0.85rem',
                        color: 'var(--color-text-tertiary)',
                        fontWeight: 500,
                    }}>
                        Faça login para continuar
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Nome */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--color-text-secondary)',
                            marginBottom: 6,
                        }}>
                            Usuário
                        </label>
                        <input
                            type="text"
                            value={nome}
                            onChange={e => setNome(e.target.value)}
                            placeholder="Digite seu nome"
                            autoFocus
                            autoComplete="username"
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: 10,
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-body)',
                                color: 'var(--color-text-primary)',
                                fontSize: '0.95rem',
                                outline: 'none',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>

                    {/* Senha */}
                    <div style={{ marginBottom: 24 }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--color-text-secondary)',
                            marginBottom: 6,
                        }}>
                            Senha
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={mostrarSenha ? 'text' : 'password'}
                                value={senha}
                                onChange={e => setSenha(e.target.value)}
                                placeholder="Digite sua senha"
                                autoComplete="current-password"
                                style={{
                                    width: '100%',
                                    padding: '10px 42px 10px 14px',
                                    borderRadius: 10,
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-body)',
                                    color: 'var(--color-text-primary)',
                                    fontSize: '0.95rem',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setMostrarSenha(!mostrarSenha)}
                                style={{
                                    position: 'absolute',
                                    right: 10,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--color-text-tertiary)',
                                    padding: 4,
                                }}
                            >
                                {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* Erro */}
                    {erro && (
                        <div style={{
                            padding: '10px 14px',
                            borderRadius: 10,
                            background: 'var(--color-danger-bg)',
                            color: 'var(--color-danger)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            marginBottom: 16,
                            textAlign: 'center',
                        }}>
                            {erro}
                        </div>
                    )}

                    {/* Botão */}
                    <button
                        type="submit"
                        disabled={enviando}
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: 10,
                            border: 'none',
                            background: 'var(--color-primary)',
                            color: 'var(--color-text-on-primary)',
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            cursor: enviando ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            opacity: enviando ? 0.7 : 1,
                        }}
                    >
                        <LogIn size={18} />
                        {enviando ? 'Entrando...' : 'Entrar'}
                    </button>
                </form>
            </div>
        </div>
    );
}

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Usuario } from '../types';
import { login as authLogin, buscarUsuarioPorId, trocarSenha as authTrocarSenha, setCurrentUser } from '../lib/auth';

interface AuthContextType {
    usuario: Usuario | null;
    carregando: boolean;
    login: (nome: string, senha: string) => Promise<boolean>;
    logout: () => void;
    trocarSenha: (senhaAtual: string, senhaNova: string) => Promise<boolean>;
    precisaTrocarSenha: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = 'matilde_session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [usuario, setUsuario] = useState<Usuario | null>(null);
    const [carregando, setCarregando] = useState(true);

    // Restaura sessão do localStorage
    useEffect(() => {
        const restaurar = async () => {
            try {
                const saved = localStorage.getItem(SESSION_KEY);
                if (saved) {
                    const { userId } = JSON.parse(saved);
                    const user = await buscarUsuarioPorId(userId);
                    if (user) {
                        setUsuario(user);
                        setCurrentUser(user.nome);
                    } else {
                        localStorage.removeItem(SESSION_KEY);
                    }
                }
            } catch {
                localStorage.removeItem(SESSION_KEY);
            } finally {
                setCarregando(false);
            }
        };
        restaurar();
    }, []);

    const login = useCallback(async (nome: string, senha: string): Promise<boolean> => {
        const user = await authLogin(nome, senha);
        if (!user) return false;
        setUsuario(user);
        setCurrentUser(user.nome);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
        return true;
    }, []);

    const logout = useCallback(() => {
        setUsuario(null);
        setCurrentUser('Sistema');
        localStorage.removeItem(SESSION_KEY);
    }, []);

    const trocarSenha = useCallback(async (senhaAtual: string, senhaNova: string): Promise<boolean> => {
        if (!usuario) return false;
        const ok = await authTrocarSenha(usuario.id, senhaAtual, senhaNova);
        if (ok) {
            setUsuario(prev => prev ? { ...prev, primeiroLogin: false } : null);
        }
        return ok;
    }, [usuario]);

    const precisaTrocarSenha = usuario?.primeiroLogin === true;

    return (
        <AuthContext.Provider value={{ usuario, carregando, login, logout, trocarSenha, precisaTrocarSenha }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
    return ctx;
}

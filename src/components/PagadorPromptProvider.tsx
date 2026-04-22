import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { DollarSign } from 'lucide-react';
import { getPagadores } from '../lib/financeService';
import type { Pagador } from '../types/finance';

interface PagadorPromptOptions {
    title?: string;
    message?: string;
    confirmText?: string;
    allowSkip?: boolean; // permite confirmar sem selecionar
}

// Retorna:
// - string: nome do pagador selecionado
// - '' (string vazia): usuário confirmou sem definir pagador (só se allowSkip)
// - null: usuário cancelou
type AskPagadorFn = (options?: PagadorPromptOptions) => Promise<string | null>;

const PagadorPromptContext = createContext<AskPagadorFn>(() => Promise.resolve(null));

export const usePagadorPrompt = () => useContext(PagadorPromptContext);

export const PagadorPromptProvider = ({ children }: { children: ReactNode }) => {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<PagadorPromptOptions>({});
    const [pagadores, setPagadores] = useState<Pagador[]>([]);
    const [selecionado, setSelecionado] = useState('');
    const [resolver, setResolver] = useState<{ resolve: (value: string | null) => void } | null>(null);

    // Recarrega pagadores sempre que o modal abre
    useEffect(() => {
        if (!open) return;
        getPagadores(true).then(setPagadores).catch(err => {
            console.warn('[PagadorPrompt] falha ao carregar pagadores:', err);
            setPagadores([]);
        });
    }, [open]);

    const askPagador: AskPagadorFn = useCallback((opts) => {
        return new Promise<string | null>((resolve) => {
            setOptions(opts ?? {});
            setSelecionado('');
            setResolver({ resolve });
            setOpen(true);
        });
    }, []);

    const handleConfirm = () => {
        if (!selecionado && !options.allowSkip) return;
        resolver?.resolve(selecionado);
        setOpen(false);
    };

    const handleCancel = () => {
        resolver?.resolve(null);
        setOpen(false);
    };

    return (
        <PagadorPromptContext.Provider value={askPagador}>
            {children}
            {open && (
                <div
                    className="modal-overlay"
                    style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: 400, width: '90%',
                            background: 'var(--notion-surface)',
                            borderRadius: 16,
                            border: '1px solid var(--notion-border)',
                            boxShadow: 'var(--shadow-deep)',
                            overflow: 'hidden',
                            animation: 'fadeInUp 0.2s ease-out',
                        }}
                    >
                        <div style={{ padding: '24px 24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <div style={{
                                background: 'rgba(0,117,222,0.1)',
                                borderRadius: '50%',
                                padding: '12px',
                                marginBottom: '12px',
                                color: 'var(--notion-blue)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <DollarSign size={26} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                                {options.title || 'Quem pagou a taxa?'}
                            </h3>
                            {options.message && (
                                <div style={{ marginTop: 8, color: 'var(--notion-text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                    {options.message}
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '0 24px 20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {pagadores.length === 0 && (
                                    <div style={{ fontSize: 13, color: 'var(--notion-text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
                                        Nenhum pagador cadastrado. Cadastre em Controle de Pagamentos → Gerenciar.
                                    </div>
                                )}
                                {pagadores.map(p => {
                                    const isSel = selecionado === p.nome;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setSelecionado(p.nome)}
                                            style={{
                                                padding: '10px 14px',
                                                borderRadius: 8,
                                                border: `1.5px solid ${isSel ? 'var(--notion-blue)' : 'var(--notion-border)'}`,
                                                background: isSel ? 'rgba(0,117,222,0.08)' : 'var(--notion-bg-alt)',
                                                color: 'var(--notion-text)',
                                                fontSize: 14,
                                                fontWeight: isSel ? 700 : 500,
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {p.nome}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{
                            padding: '14px 24px', background: 'var(--notion-bg-alt)',
                            display: 'flex', gap: 10, justifyContent: 'flex-end',
                            borderTop: '1px solid var(--notion-border)',
                        }}>
                            <button
                                onClick={handleCancel}
                                style={{
                                    padding: '8px 16px', fontWeight: 600, fontSize: '0.9rem',
                                    background: 'transparent', color: 'var(--notion-text-secondary)',
                                    border: '1px solid var(--notion-border)', borderRadius: 6, cursor: 'pointer',
                                }}
                            >
                                Cancelar
                            </button>
                            {options.allowSkip && (
                                <button
                                    onClick={() => { resolver?.resolve(''); setOpen(false); }}
                                    style={{
                                        padding: '8px 16px', fontWeight: 600, fontSize: '0.9rem',
                                        background: 'transparent', color: 'var(--notion-text-secondary)',
                                        border: '1px solid var(--notion-border)', borderRadius: 6, cursor: 'pointer',
                                    }}
                                >
                                    Pular
                                </button>
                            )}
                            <button
                                onClick={handleConfirm}
                                disabled={!selecionado && !options.allowSkip}
                                style={{
                                    padding: '8px 16px', fontWeight: 600, fontSize: '0.9rem',
                                    background: (!selecionado && !options.allowSkip) ? 'var(--notion-bg-alt)' : 'var(--notion-blue)',
                                    color: (!selecionado && !options.allowSkip) ? 'var(--notion-text-muted)' : '#fff',
                                    border: 'none', borderRadius: 6,
                                    cursor: (!selecionado && !options.allowSkip) ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {options.confirmText || 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </PagadorPromptContext.Provider>
    );
};

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export const useConfirm = () => useContext(ConfirmContext);

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions>({ message: '' });
    const [resolver, setResolver] = useState<{ resolve: (value: boolean) => void } | null>(null);

    const confirm: ConfirmFn = (opts) => {
        return new Promise<boolean>((resolve) => {
            const parsedOpts = typeof opts === 'string' ? { message: opts, danger: true } : opts;
            setOptions({ danger: true, ...parsedOpts });
            setResolver({ resolve });
            setOpen(true);
        });
    };

    const handleConfirm = () => {
        if (resolver) resolver.resolve(true);
        setOpen(false);
    };

    const handleCancel = () => {
        if (resolver) resolver.resolve(false);
        setOpen(false);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {open && (
                <div
                    className="modal-overlay"
                    style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: 420,
                            width: '90%',
                            padding: 0,
                            overflow: 'hidden',
                            animation: 'fadeInUp 0.2s ease-out',
                            background: 'var(--notion-surface)',
                            borderRadius: 16,
                            border: '1px solid var(--notion-border)',
                            boxShadow: 'var(--shadow-deep)',
                        }}
                    >
                        <div style={{ padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <div style={{
                                background: options.danger ? 'rgba(220,38,38,0.1)' : 'rgba(221,91,0,0.1)',
                                borderRadius: '50%',
                                padding: '12px',
                                marginBottom: '16px',
                                color: options.danger ? '#dc2626' : 'var(--notion-orange)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <AlertTriangle size={28} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                                {options.title || 'Atenção'}
                            </h3>
                            <div style={{ marginTop: '12px', color: 'var(--notion-text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                {options.message}
                            </div>
                        </div>
                        <div style={{
                            padding: '16px 24px',
                            background: 'var(--notion-bg-alt)',
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'center',
                            borderTop: '1px solid var(--notion-border)',
                        }}>
                            <button
                                onClick={handleCancel}
                                autoFocus
                                style={{
                                    flex: 1,
                                    padding: '8px 16px',
                                    fontWeight: 600,
                                    fontSize: '0.9rem',
                                    background: 'rgba(255,255,255,0.08)',
                                    color: 'var(--notion-text)',
                                    border: '1px solid var(--notion-border)',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                }}
                            >
                                {options.cancelText || 'Cancelar'}
                            </button>
                            <button
                                onClick={handleConfirm}
                                style={{
                                    flex: 1,
                                    padding: '8px 16px',
                                    fontWeight: 600,
                                    fontSize: '0.9rem',
                                    background: options.danger ? '#dc2626' : 'var(--notion-blue)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                }}
                            >
                                {options.confirmText || 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
};

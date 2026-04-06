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
                    style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: 420,
                            padding: 0,
                            overflow: 'hidden',
                            animation: 'fadeInUp 0.2s ease-out',
                            background: 'var(--bg-primary)',
                            borderRadius: 'var(--radius-lg)',
                            border: '1px solid var(--border-color)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        }}
                    >
                        <div style={{ padding: '32px 32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <div style={{
                                background: options.danger ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
                                borderRadius: '50%',
                                padding: '16px',
                                marginBottom: '16px',
                                color: options.danger ? 'var(--color-danger)' : 'var(--color-warning)',
                                border: `2px solid ${options.danger ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 193, 7, 0.3)'}`,
                            }}>
                                <AlertTriangle size={32} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                {options.title || 'Atenção'}
                            </h3>
                            <div style={{ marginTop: '12px', color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                {options.message}
                            </div>
                        </div>
                        <div style={{
                            padding: '16px 32px',
                            background: 'var(--bg-secondary)',
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'center',
                            borderTop: '1px solid var(--border-color)',
                        }}>
                            <button
                                className="btn btn-secondary"
                                onClick={handleCancel}
                                autoFocus
                                style={{ flex: 1, justifyContent: 'center', fontWeight: 600 }}
                            >
                                {options.cancelText || 'Cancelar'}
                            </button>
                            <button
                                className={`btn ${options.danger ? 'btn-danger' : 'btn-primary'}`}
                                onClick={handleConfirm}
                                style={{
                                    flex: 1,
                                    justifyContent: 'center',
                                    fontWeight: 600,
                                    ...(options.danger ? { background: 'var(--color-danger)', borderColor: 'var(--color-danger)', color: 'var(--color-white)' } : {}),
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

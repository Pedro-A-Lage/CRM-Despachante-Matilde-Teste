import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import OSForm from '../pages/OSForm';

interface OSCreateDrawerProps {
    open: boolean;
    onClose: () => void;
    onCreated?: (osId: string) => void;
    /** When set, pre-fills the form with extension data (client/vehicle/service) */
    initialExtensionData?: any;
}

export default function OSCreateDrawer({ open, onClose, onCreated, initialExtensionData }: OSCreateDrawerProps) {
    const overlayRef = useRef<HTMLDivElement>(null);

    // Close on Escape key
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, onClose]);

    // Prevent body scroll when open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    if (!open) return null;

    return (
        <div
            ref={overlayRef}
            onClick={(e) => {
                if (e.target === overlayRef.current) onClose();
            }}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.55)',
                zIndex: 1200,
                display: 'flex',
                justifyContent: 'flex-end',
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: 820,
                    height: '100%',
                    background: 'var(--bg-body)',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
                    animation: 'slideInRight 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drawer Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 24px',
                    borderBottom: '1px solid var(--border-color)',
                    background: 'var(--bg-card)',
                    flexShrink: 0,
                }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        Nova Ordem de Serviço
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-text-secondary)',
                            padding: '6px',
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'var(--bg-body)';
                            e.currentTarget.style.color = 'var(--color-text-primary)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'none';
                            e.currentTarget.style.color = 'var(--color-text-secondary)';
                        }}
                        title="Fechar"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Drawer Body — scrollable */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                    <OSForm
                        drawerMode
                        onCreated={(osId) => {
                            onClose();
                            onCreated?.(osId);
                        }}
                        onCancel={onClose}
                        initialExtensionData={initialExtensionData}
                    />
                </div>
            </div>

            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}

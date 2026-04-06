interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '48px 24px', textAlign: 'center',
        }}>
            <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16, opacity: 0.5,
            }}>
                {icon}
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 6px' }}>
                {title}
            </p>
            {description && (
                <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 16px', maxWidth: 280 }}>
                    {description}
                </p>
            )}
            {action && (
                <button
                    onClick={action.onClick}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '8px 18px', borderRadius: 8, border: 'none',
                        background: 'var(--color-primary)', color: 'var(--color-gray-900)',
                        fontWeight: 700, fontSize: 12, cursor: 'pointer',
                        fontFamily: 'var(--font-family)',
                        boxShadow: '0 2px 8px rgba(245,158,11,0.25)',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(245,158,11,0.35)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(245,158,11,0.25)'; }}
                >
                    {action.label}
                </button>
            )}
        </div>
    );
}

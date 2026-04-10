interface LoadingSpinnerProps {
    size?: number;
    color?: string;
    label?: string;
    fullPage?: boolean;
}

export function LoadingSpinner({ size = 32, color = 'var(--notion-blue)', label, fullPage = false }: LoadingSpinnerProps) {
    const spinner = (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div
                role="status"
                aria-label={label ?? 'Carregando...'}
                style={{
                    width: size,
                    height: size,
                    border: `3px solid var(--notion-border)`,
                    borderTopColor: color,
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                }}
            />
            {label && (
                <span style={{ fontSize: 12, color: 'var(--notion-text-muted)', fontWeight: 500 }}>
                    {label}
                </span>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    if (fullPage) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 320, width: '100%',
            }}>
                {spinner}
            </div>
        );
    }

    return spinner;
}

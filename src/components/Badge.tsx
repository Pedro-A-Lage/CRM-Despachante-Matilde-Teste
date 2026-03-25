type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
    variant?: BadgeVariant;
    size?: BadgeSize;
    children: React.ReactNode;
    dot?: boolean;
}

const VARIANT_MAP: Record<BadgeVariant, { color: string; bg: string; dot: string }> = {
    success:  { color: 'var(--color-success)', bg: 'var(--color-success-bg, rgba(16,185,129,0.12))',  dot: 'var(--color-success)' },
    warning:  { color: 'var(--color-warning)', bg: 'var(--color-warning-bg, rgba(245,158,11,0.12))', dot: 'var(--color-warning)' },
    danger:   { color: 'var(--color-danger)',  bg: 'var(--color-danger-bg, rgba(239,68,68,0.12))',   dot: 'var(--color-danger)' },
    info:     { color: 'var(--color-info)',    bg: 'var(--color-info-bg, rgba(59,130,246,0.12))',    dot: 'var(--color-info)' },
    neutral:  { color: 'var(--color-neutral)', bg: 'var(--color-neutral-bg, rgba(107,114,128,0.12))',dot: 'var(--color-neutral)' },
    primary:  { color: 'var(--color-primary)', bg: 'var(--color-primary-50, rgba(245,158,11,0.12))', dot: 'var(--color-primary)' },
};

export function Badge({ variant = 'neutral', size = 'md', children, dot = false }: BadgeProps) {
    const v = VARIANT_MAP[variant];
    const isSmall = size === 'sm';
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: dot ? 5 : 0,
            fontSize: isSmall ? 9 : 11, fontWeight: 700,
            color: v.color, background: v.bg,
            padding: isSmall ? '2px 6px' : '3px 9px',
            borderRadius: isSmall ? 4 : 6,
            textTransform: 'uppercase', letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
        }}>
            {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: v.dot, flexShrink: 0 }} />}
            {children}
        </span>
    );
}

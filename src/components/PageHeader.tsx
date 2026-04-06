import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface Breadcrumb {
    label: string;
    to?: string;
}

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    breadcrumbs?: Breadcrumb[];
    actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, breadcrumbs, actions }: PageHeaderProps) {
    return (
        <div style={{ marginBottom: 20 }}>
            {breadcrumbs && breadcrumbs.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                    {breadcrumbs.map((bc, i) => (
                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {i > 0 && <ChevronRight size={11} style={{ color: 'var(--color-text-tertiary)', opacity: 0.5 }} />}
                            {bc.to ? (
                                <Link to={bc.to} style={{
                                    fontSize: 11, color: 'var(--color-text-tertiary)',
                                    textDecoration: 'none', fontWeight: 500,
                                    transition: 'color 0.15s',
                                }}
                                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-primary)')}
                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                                >
                                    {bc.label}
                                </Link>
                            ) : (
                                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                                    {bc.label}
                                </span>
                            )}
                        </span>
                    ))}
                </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                        {title}
                    </h1>
                    {subtitle && (
                        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '3px 0 0', fontWeight: 400 }}>
                            {subtitle}
                        </p>
                    )}
                </div>
                {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
            </div>
        </div>
    );
}

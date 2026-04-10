import React from 'react';
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
        <div className="py-8 border-b border-border mb-6">
            {breadcrumbs && breadcrumbs.length > 0 && (
                <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                    {breadcrumbs.map((bc, i) => (
                        <span key={i} className="flex items-center gap-1">
                            {i > 0 && <ChevronRight size={11} className="text-text-secondary opacity-50" />}
                            {bc.to ? (
                                <Link
                                    to={bc.to}
                                    className="text-[11px] text-text-secondary font-medium no-underline transition-colors hover:text-[var(--notion-blue)]"
                                >
                                    {bc.label}
                                </Link>
                            ) : (
                                <span className="text-[11px] text-text font-semibold">
                                    {bc.label}
                                </span>
                            )}
                        </span>
                    ))}
                </div>
            )}
            <div className="flex items-end justify-between gap-3">
                <div>
                    <h1 className="text-sub text-text m-0">
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="text-[1rem] text-text-secondary mt-1 mb-0 font-normal">
                            {subtitle}
                        </p>
                    )}
                </div>
                {actions && <div className="flex gap-2 items-center">{actions}</div>}
            </div>
        </div>
    );
}

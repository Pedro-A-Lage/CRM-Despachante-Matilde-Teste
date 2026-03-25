import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ProgressDisclosureProps {
    label?: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

export default function ProgressDisclosure({
    label = 'Mais opções',
    children,
    defaultOpen = false,
}: ProgressDisclosureProps) {
    const [open, setOpen] = useState(defaultOpen);
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentHeight, setContentHeight] = useState<number>(0);

    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [children, open]);

    // Recalcula a altura ao abrir para garantir que reflete o conteúdo atual
    useEffect(() => {
        if (open && contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [open]);

    return (
        <div
            style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                overflow: 'hidden',
            }}
        >
            {/* Header clicável */}
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.01em',
                    transition: 'color 140ms ease',
                    userSelect: 'none',
                }}
                aria-expanded={open}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {open
                        ? <ChevronUp size={15} style={{ flexShrink: 0, opacity: 0.7 }} />
                        : <ChevronDown size={15} style={{ flexShrink: 0, opacity: 0.7 }} />
                    }
                    {label}
                </span>
            </button>

            {/* Conteúdo animado via max-height */}
            <div
                style={{
                    maxHeight: open ? `${Math.max(contentHeight, 500)}px` : '0px',
                    overflow: 'hidden',
                    transition: 'max-height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                <div
                    ref={contentRef}
                    style={{
                        padding: '0 14px 14px',
                        borderTop: '1px solid var(--border-color)',
                    }}
                >
                    <div style={{ paddingTop: 12 }}>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

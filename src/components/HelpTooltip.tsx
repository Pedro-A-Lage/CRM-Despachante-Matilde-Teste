import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

type TooltipPosition = 'top' | 'right' | 'bottom' | 'left';

interface HelpTooltipProps {
    text: string;
    position?: TooltipPosition;
}

function resolveTooltipStyle(position: TooltipPosition, visible: boolean): React.CSSProperties {
    const base: React.CSSProperties = {
        position: 'absolute',
        background: 'rgba(15,15,15,0.92)',
        color: '#ffffff',
        fontSize: 11,
        borderRadius: 6,
        padding: '6px 10px',
        maxWidth: 220,
        width: 'max-content',
        zIndex: 9999,
        pointerEvents: 'none',
        lineHeight: 1.45,
        fontWeight: 400,
        whiteSpace: 'normal',
        opacity: visible ? 1 : 0,
        transition: 'opacity 160ms ease',
        boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
    };

    switch (position) {
        case 'top':
            return {
                ...base,
                bottom: 'calc(100% + 7px)',
                left: '50%',
                transform: 'translateX(-50%)',
            };
        case 'bottom':
            return {
                ...base,
                top: 'calc(100% + 7px)',
                left: '50%',
                transform: 'translateX(-50%)',
            };
        case 'left':
            return {
                ...base,
                right: 'calc(100% + 7px)',
                top: '50%',
                transform: 'translateY(-50%)',
            };
        case 'right':
            return {
                ...base,
                left: 'calc(100% + 7px)',
                top: '50%',
                transform: 'translateY(-50%)',
            };
    }
}

export default function HelpTooltip({ text, position = 'top' }: HelpTooltipProps) {
    const [visible, setVisible] = useState(false);

    return (
        <span
            style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                verticalAlign: 'middle',
                cursor: 'default',
            }}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
            onFocus={() => setVisible(true)}
            onBlur={() => setVisible(false)}
            tabIndex={0}
            role="button"
            aria-label={`Ajuda: ${text}`}
        >
            <HelpCircle
                size={12}
                style={{
                    opacity: 0.6,
                    color: 'var(--notion-text-secondary)',
                    display: 'block',
                    flexShrink: 0,
                }}
            />
            <span style={resolveTooltipStyle(position, visible)}>
                {text}
            </span>
        </span>
    );
}

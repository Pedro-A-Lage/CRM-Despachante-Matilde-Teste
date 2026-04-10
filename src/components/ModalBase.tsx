// src/components/ModalBase.tsx
// ============================================
// ModalBase - Shared Modal Structure & Styles
// Eliminates duplicate code between ATPVeModal and PrimeiroEmplacamentoModal
// ============================================

import React from 'react';

// ============================================
// SHARED STYLES (CSS-in-JS)
// ============================================

export const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
};

export const modalStyle: React.CSSProperties = {
    background: 'var(--notion-surface)',
    borderRadius: 16,
    border: '1px solid var(--notion-border)',
    width: '100%', maxWidth: 700,
    maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-deep)',
};

export const headerStyle: React.CSSProperties = {
    padding: '18px 24px',
    borderBottom: '1px solid var(--notion-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--notion-surface)',
    flexShrink: 0,
};

export const bodyStyle: React.CSSProperties = {
    flex: 1, overflowY: 'auto', padding: '16px 24px',
    background: 'var(--notion-bg)',
};

export const footerStyle: React.CSSProperties = {
    padding: '14px 24px',
    borderTop: '1px solid var(--notion-border)',
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    background: 'var(--notion-surface)',
    flexShrink: 0,
};

export const secaoStyle: React.CSSProperties = {
    border: '1px solid var(--notion-border)',
    borderRadius: 12,
    marginBottom: 14,
    overflow: 'hidden',
};

export const secaoHeaderStyle: React.CSSProperties = {
    padding: '10px 16px',
    background: 'var(--notion-bg-alt)',
    fontWeight: 700,
    fontSize: '0.88rem',
    color: 'var(--notion-blue)',
    borderBottom: '1px solid var(--notion-border)',
    display: 'flex', alignItems: 'center', gap: 7,
    textTransform: 'uppercase', letterSpacing: '0.05em',
};

export const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    padding: '14px 16px',
    background: 'var(--notion-surface)',
};

export const fieldWrapStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 4,
};

export const labelStyle: React.CSSProperties = {
    fontSize: '0.78rem', fontWeight: 600,
    color: 'var(--notion-text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.03em',
};

export const inputStyle: React.CSSProperties = {
    padding: '7px 10px',
    border: '1px solid var(--notion-border)',
    borderRadius: 8,
    background: 'var(--notion-surface)',
    color: 'var(--notion-text)',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.15s',
    width: '100%',
};

export const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
};

export const btnPrimary: React.CSSProperties = {
    padding: '8px 16px',
    background: 'var(--notion-green)',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
    display: 'flex', alignItems: 'center', gap: 6,
};

export const btnSecondary: React.CSSProperties = {
    padding: '8px 16px',
    background: 'var(--notion-bg-alt)',
    color: 'var(--notion-text)',
    border: '1px solid var(--notion-border)',
    borderRadius: 8,
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
    display: 'flex', alignItems: 'center', gap: 6,
};

// ============================================
// SHARED COMPONENTS
// ============================================

export interface FieldProps {
    label: string;
    children?: React.ReactNode;
    required?: boolean;
    obrigatorio?: boolean;
    value?: string;
    onChange?: (v: string) => void;
    placeholder?: string;
    span?: boolean;
}

export const Field: React.FC<FieldProps> = ({ label, children, required, obrigatorio, value, onChange, placeholder, span }) => (
    <div style={{ ...fieldWrapStyle, ...(span ? { gridColumn: '1 / -1' } : {}) }}>
        <label style={labelStyle}>
            {label}{(required || obrigatorio) && <span style={{ color: 'var(--notion-orange)' }}> *</span>}
        </label>
        {children ?? (
            <input
                style={inputStyle}
                value={value ?? ''}
                onChange={e => onChange?.(e.target.value)}
                placeholder={placeholder}
            />
        )}
    </div>
);

// FieldGrid — editable field with label, path-based updates
export interface FieldGridProps {
    label: string;
    path: string;
    value: string | undefined;
    onUpdate: (path: string, value: string) => void;
    span?: boolean;
    children?: React.ReactNode;
}

export const FieldGrid: React.FC<FieldGridProps> = ({ label, path, value, onUpdate, span }) => (
    <div style={{ ...fieldWrapStyle, ...(span ? { gridColumn: '1 / -1' } : {}) }}>
        <label style={labelStyle}>{label}</label>
        <input
            style={inputStyle}
            value={value ?? ''}
            onChange={e => onUpdate(path, e.target.value)}
        />
    </div>
);

// FieldGridDate — date field with type="date", stores as YYYY-MM-DD, displays as DD/MM/AAAA
export const FieldGridDate: React.FC<{
    label: string;
    path: string;
    value: string | undefined;
    onUpdate: (path: string, value: string) => void;
    span?: boolean;
    obrigatorio?: boolean;
    vazio?: boolean; // highlight laranja quando vazio em modo revisar
}> = ({ label, path, value, onUpdate, span, obrigatorio, vazio }) => {
    // Normaliza para YYYY-MM-DD (aceita DD/MM/AAAA ou YYYY-MM-DD)
    const toInputValue = (v: string | undefined): string => {
        if (!v) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return '';
    };
    return (
        <div style={{ ...fieldWrapStyle, ...(span ? { gridColumn: '1 / -1' } : {}) }}>
            <label style={{ ...labelStyle, ...(vazio ? { color: 'var(--notion-orange)' } : {}) }}>
                {label}{obrigatorio && <span style={{ color: 'var(--notion-orange)' }}> *</span>}
            </label>
            <input
                type="date"
                style={{
                    ...inputStyle,
                    ...(vazio ? { borderColor: 'var(--notion-orange)', background: '#fffbeb' } : {}),
                }}
                value={toInputValue(value)}
                onChange={e => onUpdate(path, e.target.value)}
            />
        </div>
    );
};

// FieldGridMasked — FieldGrid with input mask support
export interface FieldGridMaskedProps {
    label: string;
    path: string;
    value: string;
    onUpdate: (path: string, value: string) => void;
    mascara?: string;
    span?: boolean;
    obrigatorio?: boolean;
    onAfterUpdate?: (value: string) => void | Promise<void>;
    disabled?: boolean;
    placeholder?: string;
}

export const FieldGridMasked: React.FC<FieldGridMaskedProps> = ({ label, path, value, onUpdate, span, obrigatorio, onAfterUpdate, disabled, placeholder }) => (
    <div style={{ ...fieldWrapStyle, ...(span ? { gridColumn: '1 / -1' } : {}) }}>
        <label style={labelStyle}>
            {label}{obrigatorio && <span style={{ color: 'var(--notion-orange)' }}> *</span>}
        </label>
        <input
            style={inputStyle}
            value={value ?? ''}
            disabled={disabled}
            placeholder={placeholder}
            onChange={e => {
                const v = e.target.value.toUpperCase();
                onUpdate(path, v);
                onAfterUpdate?.(v);
            }}
        />
    </div>
);

// Error/success styles
export const errorBoxStyle: React.CSSProperties = {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid var(--notion-orange)',
    color: 'var(--notion-orange)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: '0.85rem',
    marginBottom: 12,
};

export const successMsgStyle: React.CSSProperties = {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid var(--notion-green)',
    color: 'var(--notion-green)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: '0.85rem',
    marginBottom: 12,
};

// Alias components for PrimeiroEmplacamentoModal compatibility
export const ModalOverlay: React.FC<{ children: React.ReactNode; onClick?: () => void }> = ({ children, onClick }) => (
    <div style={overlayStyle} onClick={onClick}>{children}</div>
);

export const ModalContainer: React.FC<{ children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }> = ({ children, onClick }) => (
    <div style={modalStyle} onClick={onClick}>{children}</div>
);

export const ModalHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={headerStyle}>{children}</div>
);

export const ModalBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={bodyStyle}>{children}</div>
);

export const ModalFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={footerStyle}>{children}</div>
);

export const Section: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={secaoStyle}>{children}</div>
);

export const SectionGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={gridStyle}>{children}</div>
);

export interface SecaoProps {
    titulo: string;
    icone?: React.ReactNode;
    children: React.ReactNode;
}

export const Secao: React.FC<SecaoProps> = ({ titulo, icone, children }) => (
    <div style={secaoStyle}>
        <div style={secaoHeaderStyle}>
            {icone}
            {titulo}
        </div>
        {children}
    </div>
);

// ============================================
// BASE MODAL COMPONENT
// ============================================

export interface BaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: number;
}

export const BaseModal: React.FC<BaseModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    maxWidth = 700,
}) => {
    if (!isOpen) return null;

    const modalStyleWithWidth = { ...modalStyle, maxWidth };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div
                style={modalStyleWithWidth}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={headerStyle}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--notion-text-secondary)',
                            cursor: 'pointer',
                            fontSize: '1.5rem',
                            padding: 0,
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 4,
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--notion-bg-alt)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                        ×
                    </button>
                </div>
                <div style={bodyStyle}>
                    {children}
                </div>
                {footer && (
                    <div style={footerStyle}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};
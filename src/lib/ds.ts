/**
 * Design System — Despachante Matilde CRM
 * Tokens e helpers para consistência visual em toda a aplicação.
 * Usa CSS variables para suporte automático a dark/light mode.
 */
import type { CSSProperties } from 'react';

// ─── Status da OS ────────────────────────────────────────────────────────────
export const OS_STATUS_TOKENS = {
    aguardando_documentacao: { color: 'var(--color-neutral)', bg: 'var(--color-neutral-bg)', label: 'Aguardando Doc.' },
    vistoria:                { color: 'var(--color-info)',    bg: 'var(--color-info-bg)',    label: 'Vistoria'        },
    delegacia:               { color: 'var(--color-purple)', bg: 'var(--color-purple-bg)',  label: 'Delegacia'       },
    doc_pronto:              { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', label: 'Doc. Pronto'    },
    entregue:                { color: 'var(--color-success)', bg: 'var(--color-success-bg)', label: 'Entregue'       },
} as const;

// ─── Status da Vistoria ──────────────────────────────────────────────────────
export const VISTORIA_STATUS_TOKENS = {
    agendar:             { color: 'var(--color-purple)',  bg: 'var(--color-purple-bg)',  label: 'A Agendar'            },
    agendada:            { color: 'var(--color-info)',    bg: 'var(--color-info-bg)',    label: 'Agendada'             },
    reprovada:           { color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)',  label: 'Reprovada'            },
    aprovada_apontamento:{ color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', label: 'Aprovada c/ Apontam.' },
    aprovada:            { color: 'var(--color-success)', bg: 'var(--color-success-bg)', label: 'Aprovada'             },
} as const;

// ─── Prioridade da OS ────────────────────────────────────────────────────────
export const PRIORITY_TOKENS = {
    normal:  { color: 'var(--color-neutral)', bg: 'var(--color-neutral-bg)', label: 'Normal'  },
    urgente: { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', label: 'Urgente' },
    critica: { color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)',  label: 'Crítica' },
} as const;

// ─── Cards ───────────────────────────────────────────────────────────────────
export const CARD: Record<string, CSSProperties> = {
    base: {
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: '16px 20px',
    },
    elevated: {
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 14,
        padding: '20px 24px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    },
    success: {
        background: 'color-mix(in srgb, var(--color-success) 6%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
        borderRadius: 10,
        padding: '12px 16px',
    },
    danger: {
        background: 'color-mix(in srgb, var(--color-danger) 6%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)',
        borderRadius: 10,
        padding: '12px 16px',
    },
    warning: {
        background: 'color-mix(in srgb, var(--color-warning) 6%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)',
        borderRadius: 10,
        padding: '12px 16px',
    },
};

// ─── Botões ──────────────────────────────────────────────────────────────────
export const BTN: Record<string, CSSProperties> = {
    primary: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 18px', borderRadius: 10, border: 'none',
        background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
        color: 'var(--color-gray-900)', fontWeight: 700, fontSize: 13,
        cursor: 'pointer', fontFamily: 'var(--font-family)',
        boxShadow: '0 2px 8px rgba(245,158,11,0.25)',
        transition: 'all 0.2s ease',
    },
    secondary: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 10,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-body)', color: 'var(--color-text-primary)',
        fontWeight: 600, fontSize: 12, cursor: 'pointer',
        fontFamily: 'var(--font-family)', transition: 'border-color 0.15s',
    },
    danger: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 10, border: 'none',
        background: 'var(--color-danger-bg)', color: 'var(--color-danger)',
        fontWeight: 700, fontSize: 12, cursor: 'pointer',
        fontFamily: 'var(--font-family)', transition: 'background 0.15s',
    },
    ghost: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 8, border: 'none',
        background: 'transparent', color: 'var(--color-text-secondary)',
        fontWeight: 600, fontSize: 12, cursor: 'pointer',
        fontFamily: 'var(--font-family)', transition: 'background 0.15s',
    },
};

// ─── Inputs ──────────────────────────────────────────────────────────────────
export const INPUT: CSSProperties = {
    width: '100%', fontSize: 13, padding: '8px 12px', borderRadius: 8,
    background: 'var(--bg-body)', border: '1px solid var(--border-color)',
    color: 'var(--color-text-primary)', outline: 'none',
    fontFamily: 'var(--font-family)', transition: 'border-color 0.15s',
};

export const LABEL: CSSProperties = {
    display: 'block', fontSize: '0.6rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.5,
    color: 'var(--color-gray-400)', marginBottom: 4,
};

// ─── Timeline ────────────────────────────────────────────────────────────────
export const TIMELINE = {
    container: { position: 'relative', paddingLeft: 28 } as CSSProperties,
    line: {
        position: 'absolute', left: 10, top: 8, bottom: 8,
        width: 2, background: 'var(--border-color)', borderRadius: 1,
    } as CSSProperties,
    node: (color: string): CSSProperties => ({
        position: 'absolute', left: -22, top: 10,
        width: 18, height: 18, borderRadius: '50%',
        background: `${color}20`, border: `2px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
    }),
    card: {
        padding: '10px 13px', borderRadius: 9,
        background: 'var(--bg-body)', border: '1px solid var(--border-color)',
    } as CSSProperties,
};

// ─── Wizard/Stepper ──────────────────────────────────────────────────────────
export type WizardStepState = 'concluida' | 'ativa' | 'bloqueada';

export const WIZARD_STEP = (state: WizardStepState) => ({
    circle: {
        concluida: { background: 'var(--color-success)', border: '2px solid var(--color-success)' },
        ativa:     { background: 'var(--color-primary)', border: '2px solid var(--color-primary)', boxShadow: '0 0 0 3px rgba(245,158,11,0.25)' },
        bloqueada: { background: 'var(--border-color)', border: '2px solid var(--border-color)' },
    }[state],
    label: {
        concluida: { color: 'var(--color-success)', fontWeight: 600 },
        ativa:     { color: 'var(--color-text-primary)', fontWeight: 700 },
        bloqueada: { color: 'var(--color-neutral)', fontWeight: 400 },
    }[state],
    connector: (done: boolean): CSSProperties => ({
        flex: 1, height: 2, margin: '0 8px', marginBottom: 20,
        background: done ? 'var(--color-success)' : 'var(--border-color)',
        borderRadius: 1, transition: 'background 0.3s ease',
    }),
});

// ─── Helper: combinar estilos inline ─────────────────────────────────────────
export const sx = (...styles: (CSSProperties | undefined | null | false)[]): CSSProperties =>
    Object.assign({}, ...styles.filter(Boolean));

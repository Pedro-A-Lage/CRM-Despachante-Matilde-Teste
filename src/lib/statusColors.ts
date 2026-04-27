// Cores oficiais por status de OS — fonte única de verdade.
//
// Não usar tokens --notion-* aqui: nesse projeto o "--notion-blue" é
// na verdade o accent laranja, então status que precisam de azul/roxo
// real ficam apagados. Hex direto evita o conflito.
import type React from 'react';
import type { StatusOS } from '../types';

export interface StatusColor {
  /** Cor sólida (texto, ícone, borda esquerda da linha de tabela). */
  color: string;
  /** Fundo translúcido (chips, cards). */
  bg: string;
  /** Borda translúcida (cards de resumo). */
  border: string;
}

export const STATUS_COLORS: Record<StatusOS, StatusColor> = {
  aguardando_documentacao: {
    color: '#C88010',
    bg: 'rgba(200,128,16,0.08)',
    border: 'rgba(200,128,16,0.25)',
  },
  vistoria: {
    color: '#3D70C0',
    bg: 'rgba(61,112,192,0.08)',
    border: 'rgba(61,112,192,0.25)',
  },
  delegacia: {
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.08)',
    border: 'rgba(139,92,246,0.25)',
  },
  doc_pronto: {
    color: '#28A06A',
    bg: 'rgba(40,160,106,0.08)',
    border: 'rgba(40,160,106,0.25)',
  },
  entregue: {
    color: '#6B7280',
    bg: 'rgba(107,114,128,0.08)',
    border: 'rgba(107,114,128,0.25)',
  },
};

export function getStatusColor(status: StatusOS): StatusColor {
  return STATUS_COLORS[status] ?? STATUS_COLORS.entregue;
}

/** Estilo inline pra "pílula" de status (substitui as classes badge-* legadas). */
export function statusBadgeStyle(status: StatusOS): React.CSSProperties {
  const c = getStatusColor(status);
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: 8,
    fontSize: '0.72rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    color: c.color,
    background: c.bg,
    border: `1px solid ${c.border}`,
  };
}

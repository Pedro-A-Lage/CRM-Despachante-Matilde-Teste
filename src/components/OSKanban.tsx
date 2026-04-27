import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText, User, Car, AlertTriangle, Flame, Clock, ChevronDown, ChevronUp,
    Search, X, Settings, Eye, EyeOff
} from 'lucide-react';
import { STATUS_OS_LABELS, type StatusOS, type OrdemDeServico, type Cliente, type Veiculo } from '../types';
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
import { getEmpresas } from '../lib/empresaService';
import type { EmpresaParceira } from '../types/empresa';
import { isValidStatusTransition } from '../lib/database';
import { STATUS_COLORS } from '../lib/statusColors';

interface OSKanbanProps {
    ordens: OrdemDeServico[];
    clientes: Cliente[];
    veiculos: Veiculo[];
    onStatusChange: (id: string, newStatus: StatusOS) => void;
}

const KANBAN_COLUMNS: { id: StatusOS; label: string; color: string }[] = [
    { id: 'aguardando_documentacao', label: 'Aguard. Documentação', color: STATUS_COLORS.aguardando_documentacao.color },
    { id: 'vistoria', label: 'Vistoria', color: STATUS_COLORS.vistoria.color },
    { id: 'delegacia', label: 'Delegacia', color: STATUS_COLORS.delegacia.color },
    { id: 'doc_pronto', label: 'Doc. Pronto', color: STATUS_COLORS.doc_pronto.color },
    { id: 'entregue', label: 'Entregue', color: STATUS_COLORS.entregue.color },
];

const PRIORIDADE_CONFIG = {
    critica: { color: 'var(--notion-orange)', bg: 'rgba(221,91,0,0.1)', label: 'CRÍTICA', icon: Flame },
    urgente: { color: 'var(--notion-orange)', bg: 'rgba(221,91,0,0.1)', label: 'URGENTE', icon: AlertTriangle },
    normal: { color: '', bg: '', label: '', icon: null },
};

function formatBRL(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STORAGE_KEY = 'kanban_visible_columns';

function getVisibleColumns(): Record<StatusOS, boolean> {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    const defaults: Record<StatusOS, boolean> = {} as Record<StatusOS, boolean>;
    KANBAN_COLUMNS.forEach(c => { defaults[c.id] = true; });
    return defaults;
}

export default function OSKanban({ ordens, clientes, veiculos, onStatusChange }: OSKanbanProps) {
    const navigate = useNavigate();
    const serviceLabels = useServiceLabels();
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<StatusOS | null>(null);

    // Empresas parceiras
    const [empresas, setEmpresas] = useState<EmpresaParceira[]>([]);
    const [empresaFilter, setEmpresaFilter] = useState<string>('');
    useEffect(() => { getEmpresas().then(setEmpresas); }, []);

    // Filter state
    const [filterPrioridade, setFilterPrioridade] = useState<'todas' | 'critica' | 'urgente' | 'normal'>('todas');
    const [filterResponsavel, setFilterResponsavel] = useState<string>('');
    const [filterPendencia, setFilterPendencia] = useState(false);
    const [filterSearch, setFilterSearch] = useState('');

    // Expanded cards state
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

    // Column visibility
    const [visibleColumns, setVisibleColumns] = useState<Record<StatusOS, boolean>>(getVisibleColumns);
    const [showColumnMenu, setShowColumnMenu] = useState(false);

    const toggleCard = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleColumn = (id: StatusOS) => {
        const next = { ...visibleColumns, [id]: !visibleColumns[id] };
        setVisibleColumns(next);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedId(id);
        e.dataTransfer.setData('os_id', id);
        setTimeout(() => {
            const el = document.getElementById(`kanban-card-${id}`);
            if (el) el.style.opacity = '0.4';
        }, 0);
    };

    const handleDragEnd = (_e: React.DragEvent, id: string) => {
        setDraggedId(null);
        setDragOverColumn(null);
        const el = document.getElementById(`kanban-card-${id}`);
        if (el) el.style.opacity = '1';
    };

    // Status da OS sendo arrastada, para validar destino em tempo real.
    const draggedStatus = useMemo<StatusOS | null>(() => {
        if (!draggedId) return null;
        return ordens.find(o => o.id === draggedId)?.status ?? null;
    }, [draggedId, ordens]);

    const canDropOn = (columnId: StatusOS): boolean => {
        if (!draggedStatus) return true;
        return isValidStatusTransition(draggedStatus, columnId);
    };

    const handleDragOver = (e: React.DragEvent, columnId: StatusOS) => {
        e.preventDefault();
        const allowed = canDropOn(columnId);
        e.dataTransfer.dropEffect = allowed ? 'move' : 'none';
        setDragOverColumn(columnId);
    };

    const handleDragLeave = () => {
        setDragOverColumn(null);
    };

    const handleDrop = (e: React.DragEvent, columnId: StatusOS) => {
        e.preventDefault();
        const osId = e.dataTransfer.getData('os_id');
        setDraggedId(null);
        setDragOverColumn(null);
        if (!osId) return;
        // Delegamos a validação para onStatusChange (OSList), que dispara toast
        // em caso de transição inválida. Aqui só evitamos round-trip quando já
        // sabemos que é no-op (mesma coluna) ou quando a UI sinalizou bloqueado.
        onStatusChange(osId, columnId);
    };

    // Unique responsáveis (exclui "Legado (CSV)")
    const uniqueResponsaveis = useMemo(() => {
        const set = new Set<string>();
        ordens.forEach(o => {
            if (o.delegacia?.entradas) {
                o.delegacia.entradas.forEach(e => {
                    if (e.responsavel && e.responsavel !== 'Legado (CSV)') set.add(e.responsavel);
                });
            }
            if (o.entregueParaNome && o.entregueParaNome !== 'Legado (CSV)') set.add(o.entregueParaNome);
        });
        return Array.from(set).sort();
    }, [ordens]);

    // Check if any filter is active
    const anyFilterActive = filterPrioridade !== 'todas' || filterResponsavel !== '' || filterPendencia || filterSearch.trim() !== '' || empresaFilter !== '';

    const clearFilters = () => {
        setFilterPrioridade('todas');
        setFilterResponsavel('');
        setFilterPendencia(false);
        setFilterSearch('');
        setEmpresaFilter('');
    };

    // Apply filters
    const filteredOrdens = useMemo(() => {
        let result = ordens;

        if (filterPrioridade !== 'todas') {
            result = result.filter(o => (o.prioridade || 'normal') === filterPrioridade);
        }
        if (filterPendencia) {
            result = result.filter(o => !!o.pendencia);
        }
        if (filterResponsavel) {
            result = result.filter(o => {
                const hasInDelegacia = o.delegacia?.entradas?.some(e => e.responsavel === filterResponsavel);
                const hasDelivered = o.entregueParaNome === filterResponsavel;
                return hasInDelegacia || hasDelivered;
            });
        }
        if (filterSearch.trim()) {
            const term = filterSearch.toLowerCase().trim();
            result = result.filter(o => {
                const veiculo = veiculos.find(v => v.id === o.veiculoId);
                const cliente = clientes.find(c => c.id === o.clienteId);
                return (
                    veiculo?.placa?.toLowerCase().includes(term) ||
                    cliente?.nome?.toLowerCase().includes(term) ||
                    String(o.numero ?? '').includes(term)
                );
            });
        }
        if (empresaFilter === 'particular') {
            result = result.filter((os) => !os.empresaParceiraId);
        } else if (empresaFilter) {
            result = result.filter((os) => os.empresaParceiraId === empresaFilter);
        }

        return result;
    }, [ordens, filterPrioridade, filterPendencia, filterResponsavel, filterSearch, veiculos, clientes, empresaFilter]);

    // Sort by priority
    const sortByPriority = (a: OrdemDeServico, b: OrdemDeServico) => {
        const order = { critica: 0, urgente: 1, normal: 2 };
        const pa = order[a.prioridade || 'normal'] ?? 2;
        const pb = order[b.prioridade || 'normal'] ?? 2;
        return pa - pb;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {/* Filter Bar */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--notion-border)',
            }}>
                {/* Prioridade pills */}
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['todas', 'critica', 'urgente', 'normal'] as const).map(p => (
                        <button
                            key={p}
                            onClick={() => setFilterPrioridade(p)}
                            style={{
                                padding: '4px 12px',
                                borderRadius: 'var(--radius-full)',
                                fontSize: 'var(--text-xs)',
                                fontWeight: 'var(--fw-semibold)',
                                cursor: 'pointer',
                                border: filterPrioridade === p
                                    ? '1.5px solid var(--notion-blue)'
                                    : '1.5px solid var(--notion-border)',
                                background: filterPrioridade === p
                                    ? 'var(--notion-blue)'
                                    : 'transparent',
                                color: filterPrioridade === p
                                    ? 'var(--notion-bg)'
                                    : 'var(--notion-text-secondary)',
                                transition: 'all 0.15s',
                            }}
                        >
                            {p === 'todas' ? 'Todas' : p === 'critica' ? 'Crítica' : p === 'urgente' ? 'Urgente' : 'Normal'}
                        </button>
                    ))}
                </div>

                {/* Separator */}
                <div style={{ width: 1, height: 24, background: 'var(--notion-border)' }} />

                {/* Responsável dropdown */}
                <select
                    value={filterResponsavel}
                    onChange={e => setFilterResponsavel(e.target.value)}
                    style={{
                        padding: '5px 10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 'var(--text-xs)',
                        background: 'var(--notion-bg-alt)',
                        border: '1px solid var(--notion-border)',
                        color: 'var(--notion-text)',
                        cursor: 'pointer',
                        minWidth: 120,
                    }}
                >
                    <option value="">Todos responsáveis</option>
                    {uniqueResponsaveis.map(r => (
                        <option key={r} value={r}>{r}</option>
                    ))}
                </select>

                {/* Com pendência toggle */}
                <button
                    onClick={() => setFilterPendencia(p => !p)}
                    style={{
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 'var(--fw-semibold)',
                        cursor: 'pointer',
                        border: filterPendencia
                            ? '1.5px solid var(--notion-orange)'
                            : '1.5px solid var(--notion-border)',
                        background: filterPendencia ? 'rgba(221,91,0,0.1)' : 'transparent',
                        color: filterPendencia ? 'var(--notion-orange)' : 'var(--notion-text-secondary)',
                        display: 'flex', alignItems: 'center', gap: 4,
                        transition: 'all 0.15s',
                    }}
                >
                    <AlertTriangle size={11} />
                    Com pendência
                </button>

                {/* Search input */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={12} style={{
                        position: 'absolute', left: 8,
                        color: 'var(--notion-text-secondary)', pointerEvents: 'none',
                    }} />
                    <input
                        type="text"
                        placeholder="Placa ou cliente..."
                        value={filterSearch}
                        onChange={e => setFilterSearch(e.target.value)}
                        style={{
                            paddingLeft: 26, paddingRight: 8, paddingTop: 5, paddingBottom: 5,
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 'var(--text-xs)',
                            background: 'var(--notion-bg-alt)',
                            border: '1px solid var(--notion-border)',
                            color: 'var(--notion-text)',
                            width: 160,
                            outline: 'none',
                        }}
                    />
                </div>

                {/* Filtro por empresa */}
                {empresas.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                            onClick={() => setEmpresaFilter('')}
                            style={{
                                padding: '4px 12px',
                                borderRadius: 'var(--radius-full)',
                                fontSize: 'var(--text-xs)',
                                fontWeight: 'var(--fw-semibold)',
                                cursor: 'pointer',
                                border: empresaFilter === ''
                                    ? '1.5px solid var(--notion-blue)'
                                    : '1.5px solid var(--notion-border)',
                                background: empresaFilter === '' ? 'var(--notion-blue)' : 'transparent',
                                color: empresaFilter === '' ? 'var(--notion-bg)' : 'var(--notion-text-secondary)',
                                transition: 'all 0.15s',
                            }}
                        >
                            Todas
                        </button>
                        {empresas.map((emp) => (
                            <button
                                key={emp.id}
                                onClick={() => setEmpresaFilter(emp.id)}
                                style={{
                                    padding: '4px 12px',
                                    borderRadius: 'var(--radius-full)',
                                    fontSize: 'var(--text-xs)',
                                    fontWeight: 'var(--fw-semibold)',
                                    cursor: 'pointer',
                                    border: `1.5px solid ${empresaFilter === emp.id ? emp.cor : 'var(--notion-border)'}`,
                                    background: empresaFilter === emp.id ? emp.cor : 'transparent',
                                    color: empresaFilter === emp.id ? '#fff' : 'var(--notion-text-secondary)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {emp.nome}
                            </button>
                        ))}
                        <button
                            onClick={() => setEmpresaFilter('particular')}
                            style={{
                                padding: '4px 12px',
                                borderRadius: 'var(--radius-full)',
                                fontSize: 'var(--text-xs)',
                                fontWeight: 'var(--fw-semibold)',
                                cursor: 'pointer',
                                border: empresaFilter === 'particular'
                                    ? '1.5px solid var(--notion-blue)'
                                    : '1.5px solid var(--notion-border)',
                                background: empresaFilter === 'particular' ? 'var(--notion-blue)' : 'transparent',
                                color: empresaFilter === 'particular' ? 'var(--notion-bg)' : 'var(--notion-text-secondary)',
                                transition: 'all 0.15s',
                            }}
                        >
                            Particulares
                        </button>
                    </div>
                )}

                {/* Clear filters */}
                {anyFilterActive && (
                    <button
                        onClick={clearFilters}
                        style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            fontSize: 'var(--text-sm)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: '1px solid rgba(220,38,38,0.3)',
                            background: 'rgba(220,38,38,0.08)',
                            color: '#dc2626',
                            display: 'flex', alignItems: 'center', gap: 6,
                            transition: 'all 150ms',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; }}
                    >
                        <X size={14} />
                        Limpar filtros
                    </button>
                )}

                {/* Gear icon for column visibility — right-aligned */}
                <div style={{ marginLeft: 'auto', position: 'relative' }}>
                    <button
                        onClick={() => setShowColumnMenu(v => !v)}
                        title="Configurar colunas visíveis"
                        style={{
                            padding: '5px 8px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--notion-border)',
                            background: showColumnMenu ? 'var(--notion-bg-alt)' : 'transparent',
                            color: 'var(--notion-text-secondary)',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center',
                        }}
                    >
                        <Settings size={14} />
                    </button>
                    {showColumnMenu && (
                        <div style={{
                            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50,
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--notion-border)',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-lg)',
                            padding: 'var(--space-2)',
                            minWidth: 200,
                        }}>
                            <div style={{
                                fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-semibold)',
                                color: 'var(--notion-text-secondary)', marginBottom: 6,
                                padding: '0 4px',
                            }}>
                                Colunas visíveis
                            </div>
                            {KANBAN_COLUMNS.map(col => (
                                <label
                                    key={col.id}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '5px 6px', cursor: 'pointer', borderRadius: 6,
                                        fontSize: 'var(--text-xs)',
                                        color: 'var(--notion-text)',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={visibleColumns[col.id] !== false}
                                        onChange={() => toggleColumn(col.id)}
                                        style={{ accentColor: col.color, cursor: 'pointer' }}
                                    />
                                    <span style={{
                                        display: 'inline-block', width: 8, height: 8,
                                        borderRadius: '50%', background: col.color, flexShrink: 0,
                                    }} />
                                    {col.label}
                                    {visibleColumns[col.id] === false
                                        ? <EyeOff size={10} style={{ marginLeft: 'auto', color: 'var(--notion-text-secondary)' }} />
                                        : <Eye size={10} style={{ marginLeft: 'auto', color: 'var(--notion-text-secondary)' }} />
                                    }
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Status + Priority Legend */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-4)',
                fontSize: 'var(--text-xs)',
                color: 'var(--notion-text-secondary)',
            }}>
                <span style={{ fontWeight: 'var(--fw-semibold)', color: 'var(--notion-text-secondary)' }}>Status:</span>
                {KANBAN_COLUMNS.map(col => (
                    <span key={col.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{
                            display: 'inline-block', width: 8, height: 8,
                            borderRadius: '50%', background: col.color,
                        }} />
                        {col.label}
                    </span>
                ))}
                <span style={{ width: 1, height: 14, background: 'var(--notion-border)', display: 'inline-block' }} />
                <span style={{ fontWeight: 'var(--fw-semibold)', color: 'var(--notion-text-secondary)' }}>Prioridade:</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10 }}>🔴</span> Crítica
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10 }}>🟡</span> Urgente
                </span>
            </div>

            {/* Kanban Board */}
            <div className="kanban-board" onClick={() => showColumnMenu && setShowColumnMenu(false)}>
                {KANBAN_COLUMNS.filter(col => visibleColumns[col.id] !== false).map((column) => {
                    const columnOrdens = filteredOrdens.filter(o => o.status === column.id).sort(sortByPriority);
                    const isDragTarget = dragOverColumn === column.id;
                    const isInvalidTarget = isDragTarget && draggedStatus !== null && draggedStatus !== column.id && !canDropOn(column.id);
                    const outlineColor = isInvalidTarget ? 'var(--notion-orange, #dd5b00)' : column.color;
                    const totalValue = columnOrdens.reduce((sum, o) => sum + (o.valorServico ?? 0), 0);

                    return (
                        <div
                            key={column.id}
                            className="kanban-column"
                            style={{
                                minWidth: window.innerWidth <= 768 ? '85vw' : '290px',
                                outline: isDragTarget ? `2px solid ${outlineColor}` : undefined,
                                outlineOffset: isDragTarget ? '-2px' : undefined,
                                background: isDragTarget ? `color-mix(in srgb, ${outlineColor} 5%, var(--bg-surface))` : undefined,
                                cursor: isInvalidTarget ? 'not-allowed' : undefined,
                                transition: 'outline 0.1s, background 0.1s',
                            }}
                            onDragOver={(e) => handleDragOver(e, column.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, column.id)}
                        >
                            {/* Column header with left border */}
                            <div
                                className="kanban-column-header"
                                style={{
                                    borderTopColor: column.color,
                                    borderLeft: `3px solid ${column.color}`,
                                    paddingLeft: 10,
                                }}
                            >
                                <div>
                                    <h3 className="kanban-column-title" style={{ fontWeight: 'var(--fw-bold)' }}>
                                        {column.label}
                                        <span className="kanban-column-count"
                                            style={{
                                                marginLeft: 6, fontSize: 'var(--text-xs)',
                                                background: `color-mix(in srgb, ${column.color} 20%, transparent)`,
                                                color: column.color,
                                                padding: '1px 7px', borderRadius: 'var(--radius-full)',
                                                fontWeight: 'var(--fw-bold)',
                                            }}
                                        >
                                            {columnOrdens.length}
                                        </span>
                                    </h3>
                                    {totalValue > 0 && (
                                        <div className="font-mono" style={{
                                            fontSize: 10, color: 'var(--notion-text-secondary)',
                                            marginTop: 2,
                                        }}>
                                            {formatBRL(totalValue)}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="kanban-column-content">
                                {columnOrdens.map((os) => {
                                    const cliente = clientes.find(c => c.id === os.clienteId);
                                    const veiculo = veiculos.find(v => v.id === os.veiculoId);
                                    const isDragging = draggedId === os.id;
                                    const prio = PRIORIDADE_CONFIG[os.prioridade || 'normal'];
                                    const hasPrio = os.prioridade && os.prioridade !== 'normal';
                                    const hasPendencia = !!os.pendencia;
                                    const isExpanded = expandedCards.has(os.id);
                                    const prazoReagendamento = os.vistoria?.prazoReagendamento;

                                    return (
                                        <div
                                            key={os.id}
                                            id={`kanban-card-${os.id}`}
                                            className={`kanban-card ${isDragging ? 'dragging' : ''}`}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, os.id)}
                                            onDragEnd={(e) => handleDragEnd(e, os.id)}
                                            onClick={() => navigate(`/ordens/${os.id}`)}
                                            style={{
                                                borderLeft: hasPrio ? `4px solid ${prio.color}` : undefined,
                                                boxShadow: hasPrio
                                                    ? `0 0 0 1px ${prio.color}22, var(--shadow-sm)`
                                                    : 'var(--shadow-sm)',
                                                borderRadius: 'var(--radius-md)',
                                                transition: 'box-shadow 0.15s, transform 0.15s',
                                                cursor: 'pointer',
                                            }}
                                            onMouseEnter={e => {
                                                (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)';
                                                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
                                            }}
                                            onMouseLeave={e => {
                                                (e.currentTarget as HTMLDivElement).style.boxShadow = hasPrio
                                                    ? `0 0 0 1px ${prio.color}22, var(--shadow-sm)`
                                                    : 'var(--shadow-sm)';
                                                (e.currentTarget as HTMLDivElement).style.transform = '';
                                            }}
                                        >
                                            {/* Card header */}
                                            <div className="kanban-card-header">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span className="kanban-card-number">OS #{os.numero ?? '—'}</span>
                                                    {hasPrio && (
                                                        <span style={{
                                                            fontSize: 9, fontWeight: 800, padding: '1px 6px',
                                                            borderRadius: 4, background: prio.bg, color: prio.color,
                                                            display: 'inline-flex', alignItems: 'center', gap: 3,
                                                            letterSpacing: '0.04em',
                                                        }}>
                                                            {prio.icon && <prio.icon size={8} />}
                                                            {prio.label}
                                                        </span>
                                                    )}
                                                    {hasPendencia && (
                                                        <span title={os.pendencia} style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                            <AlertTriangle
                                                                size={11}
                                                                style={{ color: '#dc2626' }}
                                                            />
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <span className="kanban-card-date">
                                                        {new Date(os.dataAbertura).toLocaleDateString('pt-BR', {
                                                            timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit'
                                                        })}
                                                    </span>
                                                    <button
                                                        onClick={(e) => toggleCard(os.id, e)}
                                                        style={{
                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                            padding: '0 2px', color: 'var(--notion-text-secondary)',
                                                            display: 'flex', alignItems: 'center',
                                                        }}
                                                        title={isExpanded ? 'Recolher' : 'Expandir'}
                                                    >
                                                        {isExpanded
                                                            ? <ChevronUp size={12} />
                                                            : <ChevronDown size={12} />
                                                        }
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Card body — compact view */}
                                            <div className="kanban-card-body">
                                                {/* Placa — prominent */}
                                                {(veiculo?.placa || veiculo?.chassi) && (
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: 5,
                                                        marginBottom: 4,
                                                    }}>
                                                        <Car size={12} className="kanban-card-icon" />
                                                        <span className="plate">
                                                            {veiculo?.placa || veiculo?.chassi || '—'}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Cliente */}
                                                <div className="kanban-card-row">
                                                    <User size={12} className="kanban-card-icon" />
                                                    <span className="kanban-card-text font-semibold truncate" title={cliente?.nome}>
                                                        {cliente?.nome || '—'}
                                                    </span>
                                                </div>

                                                {/* Tipo serviço badge */}
                                                <div style={{ marginTop: 6 }}>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        fontSize: 9,
                                                        fontWeight: 'var(--fw-semibold)',
                                                        padding: '2px 7px',
                                                        borderRadius: 'var(--radius-full)',
                                                        background: 'rgba(0,117,222,0.08)',
                                                        color: 'var(--notion-blue)',
                                                        border: '1px solid rgba(0,117,222,0.2)',
                                                        letterSpacing: '0.02em',
                                                    }}>
                                                        {getServicoLabel(serviceLabels, os.tipoServico)}
                                                    </span>
                                                    {os.empresaParceiraId && (() => {
                                                        const emp = empresas.find((e) => e.id === os.empresaParceiraId);
                                                        return emp ? (
                                                            <span
                                                                style={{
                                                                    display: 'inline-block',
                                                                    padding: '1px 6px',
                                                                    borderRadius: 4,
                                                                    fontSize: 10,
                                                                    fontWeight: 600,
                                                                    color: '#fff',
                                                                    marginLeft: 4,
                                                                    backgroundColor: emp.cor,
                                                                }}
                                                            >
                                                                {emp.nome}
                                                            </span>
                                                        ) : null;
                                                    })()}
                                                </div>

                                                {/* Checklist summary */}
                                                {os.checklist && os.checklist.length > 0 && (
                                                    <div className="kanban-card-row mt-1" style={{ color: 'var(--notion-text-secondary)' }}>
                                                        <FileText size={12} className="kanban-card-icon" />
                                                        <span className="kanban-card-text text-xs">
                                                            Docs: {os.checklist.filter(i => i.status === 'recebido').length}/{os.checklist.length}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Pendência indicator */}
                                                {hasPendencia && (
                                                    <div style={{
                                                        marginTop: 6, padding: '4px 8px', borderRadius: 6,
                                                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
                                                        display: 'flex', alignItems: 'flex-start', gap: 5,
                                                    }}>
                                                        <AlertTriangle size={10} style={{ color: 'var(--notion-orange)', flexShrink: 0, marginTop: 1 }} />
                                                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--notion-orange)', lineHeight: 1.3 }}>
                                                            {os.pendencia}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Observação (compact, no pendência) */}
                                                {os.observacaoGeral && !hasPendencia && !isExpanded && (
                                                    <div style={{
                                                        marginTop: 4, fontSize: 10, color: 'var(--notion-text-secondary)',
                                                        fontStyle: 'italic', lineHeight: 1.3,
                                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                                                    }}>
                                                        {os.observacaoGeral}
                                                    </div>
                                                )}

                                                {/* Expanded details */}
                                                {isExpanded && (
                                                    <div style={{
                                                        marginTop: 8,
                                                        borderTop: '1px solid var(--notion-border)',
                                                        paddingTop: 8,
                                                        display: 'flex', flexDirection: 'column', gap: 4,
                                                    }}>
                                                        {/* Responsável */}
                                                        {(() => {
                                                            const lastEntrada = os.delegacia?.entradas?.slice(-1)[0];
                                                            return lastEntrada ? (
                                                                <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
                                                                    <User size={11} style={{ color: 'var(--notion-text-secondary)', flexShrink: 0 }} />
                                                                    <span style={{ color: 'var(--notion-text-secondary)' }}>Resp.:</span>
                                                                    <span style={{ color: 'var(--notion-text-secondary)' }}>
                                                                        {lastEntrada.responsavel}
                                                                    </span>
                                                                </div>
                                                            ) : null;
                                                        })()}
                                                        {/* Valor */}
                                                        {(os.valorServico ?? 0) > 0 && (
                                                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
                                                                <FileText size={11} style={{ color: 'var(--notion-text-secondary)', flexShrink: 0 }} />
                                                                <span style={{ color: 'var(--notion-text-secondary)' }}>Valor:</span>
                                                                <span className="font-mono" style={{ color: 'var(--notion-green)', fontWeight: 'var(--fw-semibold)' }}>
                                                                    {formatBRL(os.valorServico!)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {/* Data criação */}
                                                        <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
                                                            <Clock size={11} style={{ color: 'var(--notion-text-secondary)', flexShrink: 0 }} />
                                                            <span style={{ color: 'var(--notion-text-secondary)' }}>Abertura:</span>
                                                            <span style={{ color: 'var(--notion-text-secondary)' }}>
                                                                {new Date(os.dataAbertura).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                                            </span>
                                                        </div>
                                                        {/* Prazo reagendamento */}
                                                        {prazoReagendamento && (
                                                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
                                                                <Clock size={11} style={{ color: 'var(--notion-orange)', flexShrink: 0 }} />
                                                                <span style={{ color: 'var(--notion-text-secondary)' }}>Prazo reagend.:</span>
                                                                <span style={{ color: 'var(--notion-orange)', fontWeight: 'var(--fw-semibold)' }}>
                                                                    {new Date(prazoReagendamento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {/* Observação geral */}
                                                        {os.observacaoGeral && (
                                                            <div style={{
                                                                marginTop: 2, fontSize: 10, color: 'var(--notion-text-secondary)',
                                                                fontStyle: 'italic', lineHeight: 1.3,
                                                            }}>
                                                                {os.observacaoGeral}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Empty state */}
                                {columnOrdens.length === 0 && (
                                    <div style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                                        justifyContent: 'center', padding: 'var(--space-8)',
                                        color: 'var(--notion-text-secondary)',
                                        gap: 'var(--space-2)',
                                    }}>
                                        <FileText size={24} style={{ opacity: 0.3 }} />
                                        <span style={{ fontSize: 'var(--text-xs)' }}>Nenhuma OS</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

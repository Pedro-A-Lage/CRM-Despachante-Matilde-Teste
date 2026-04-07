import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Plus, Search, FileText, Eye, LayoutGrid, List, AlertTriangle, Flame, X, ExternalLink, Filter, Inbox, Building2, CheckCircle } from 'lucide-react';
import { getOrdens, getClientes, getVeiculos, updateOrdem, addAuditEntry } from '../lib/database';
import { getPaymentsTotalByOSIds } from '../lib/financeService';
import { getEmpresas } from '../lib/empresaService';
import type { EmpresaParceira } from '../types/empresa';
import { STATUS_OS_LABELS, type StatusOS, type TipoServico } from '../types';
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
import type { OrdemDeServico, Cliente, Veiculo } from '../types';
import OSKanban from '../components/OSKanban';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useNovaOSModal } from '../hooks/useNovaOSModal';

function getStatusBadge(status: string) {
    const map: Record<string, string> = {
        aguardando_documentacao: 'badge-warning',
        vistoria: 'badge-info',
        delegacia: 'badge-primary',
        doc_pronto: 'badge-success',
        entregue: 'badge-neutral',
    };
    return map[status] || 'badge-neutral';
}

// Barra de progresso por status: largura e cor
const STATUS_PROGRESS: Record<string, { pct: number; color: string }> = {
    aguardando_documentacao: { pct: 20, color: 'var(--color-warning)' },
    vistoria:                { pct: 40, color: 'var(--color-info)' },
    delegacia:               { pct: 60, color: 'var(--color-purple)' },
    doc_pronto:              { pct: 80, color: 'var(--color-success)' },
    entregue:                { pct: 100, color: 'var(--color-success-bright)' },
};

// Cor de fundo dos chips de filtro rápido
const STATUS_CHIP_COLOR: Record<string, string> = {
    aguardando_documentacao: 'var(--color-warning)',
    vistoria:                'var(--color-info)',
    delegacia:               'var(--color-purple)',
    doc_pronto:              'var(--color-success)',
    entregue:                'var(--color-neutral)',
};

// Left border colors for table rows by status
const STATUS_BORDER_COLOR: Record<string, string> = {
    aguardando_documentacao: '#C88010',
    vistoria:                '#3D70C0',
    delegacia:               '#8B5CF6',
    doc_pronto:              '#28A06A',
    entregue:                '#6B7280',
};

// Persistência de filtros no localStorage
const FILTROS_KEY = 'oslist_filtros';
function loadFiltros() {
    try {
        const raw = localStorage.getItem(FILTROS_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
}
function saveFiltros(filtros: Record<string, any>) {
    try { localStorage.setItem(FILTROS_KEY, JSON.stringify(filtros)); } catch { /* ignore */ }
}

// Inject keyframe animations once
const ANIM_STYLE_ID = 'oslist-animations';
function ensureAnimations() {
    if (document.getElementById(ANIM_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = ANIM_STYLE_ID;
    style.textContent = `
        @keyframes oslist-fadeSlideIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes oslist-progressGrow {
            from { width: 0%; }
        }
        @keyframes oslist-pulseGlow {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
            50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
        @keyframes oslist-shimmer {
            0%   { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
    `;
    document.head.appendChild(style);
}

export default function OSList() {
    const navigate = useNavigate();
    const location = useLocation();
    const serviceLabels = useServiceLabels();
    const saved = loadFiltros();
    const [search, setSearch] = useState(saved.search || '');
    const [statusFilter, setStatusFilter] = useState<StatusOS | ''>(saved.statusFilter || '');
    const [tipoFilter, setTipoFilter] = useState<TipoServico | ''>(saved.tipoFilter || '');
    const [urgentFilter, setUrgentFilter] = useState(saved.urgentFilter || false);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(saved.sortConfig || null);
    const [view, setView] = useState<'kanban' | 'list'>(saved.view || 'list');
    const [empresas, setEmpresas] = useState<EmpresaParceira[]>([]);
    const [empresaFilter, setEmpresaFilter] = useState<string>('');
    const [ordens, setOrdens] = useState<OrdemDeServico[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredRow, setHoveredRow] = useState<string | null>(null);
    const [paymentTotals, setPaymentTotals] = useState<Record<string, number>>({});
    useEffect(() => { ensureAnimations(); }, []);
    useEffect(() => { getEmpresas().then(setEmpresas); }, []);
    const { open: openNovaOSModal } = useNovaOSModal();

    // Salvar filtros no localStorage sempre que mudarem
    useEffect(() => {
        saveFiltros({ search, statusFilter, tipoFilter, urgentFilter, sortConfig, view });
    }, [search, statusFilter, tipoFilter, urgentFilter, sortConfig, view]);

    const resetFilters = useCallback(() => {
        setSearch('');
        setStatusFilter('');
        setTipoFilter('');
        setUrgentFilter(false);
        setSortConfig(null);
    }, []);

    const loadData = useCallback(async (silently = false) => {
        if (!silently) setLoading(true);
        const [o, c, v] = await Promise.all([getOrdens(), getClientes(), getVeiculos()]);
        setOrdens(o);
        setClientes(c);
        setVeiculos(v);
        // Buscar totais de pagamento para pendência financeira
        const osIds = o.filter(os => os.status !== 'entregue' && (os.valorServico ?? 0) > 0).map(os => os.id);
        if (osIds.length > 0) {
            try {
                const totals = await getPaymentsTotalByOSIds(osIds);
                setPaymentTotals(totals);
            } catch { /* silently ignore */ }
        }
        if (!silently) setLoading(false);
    }, []);

    const getReceiptStatus = (dataAquisicao?: string) => {
        if (!dataAquisicao) return null;
        const dt = new Date(dataAquisicao + 'T12:00:00');
        const now = new Date();
        const diffTime = now.getTime() - dt.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 30) return { status: 'expired', days: diffDays };
        return null;
    };

    useEffect(() => {
        loadData();
        // Auto-refresh silencioso a cada 30s — sem piscar tela
        const interval = setInterval(() => loadData(true), 30_000);
        const onFocus = () => loadData(true);
        window.addEventListener('focus', onFocus);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', onFocus);
        };
    }, [loadData]);

    // Extension data from navigation state is now handled by NovaOSModal in App.tsx

    const filtered = useMemo(() => {
        let result = ordens;

        // Ocultar entregues por padrão (só aparecem se filtro 'entregue' estiver ativo)
        if (statusFilter !== 'entregue') {
            result = result.filter((o) => o.status !== 'entregue');
        }

        if (urgentFilter) {
            result = result.filter((o) => !!o.pendencia);
        }
        if (statusFilter) {
            result = result.filter((o) => o.status === statusFilter);
        }
        if (tipoFilter) {
            result = result.filter((o) => o.tipoServico === tipoFilter);
        }
        if (search.trim()) {
            const term = search.toLowerCase();
            result = result.filter((o) => {
                const cliente = clientes.find((c) => c.id === o.clienteId);
                const veiculo = veiculos.find((v) => v.id === o.veiculoId);
                return (
                    o.numero.toString().includes(term) ||
                    cliente?.nome.toLowerCase().includes(term) ||
                    veiculo?.placa.toLowerCase().includes(term)
                );
            });
        }
        if (empresaFilter === 'particular') {
            result = result.filter((os) => !os.empresaParceiraId);
        } else if (empresaFilter) {
            result = result.filter((os) => os.empresaParceiraId === empresaFilter);
        }

        // Ordenação Global
        if (sortConfig) {
            return result.sort((a, b) => {
                const modifier = sortConfig.direction === 'asc' ? 1 : -1;
                switch (sortConfig.key) {
                    case 'os': return (a.numero - b.numero) * modifier;
                    case 'cliente': {
                        const ca = clientes.find(c => c.id === a.clienteId)?.nome || '';
                        const cb = clientes.find(c => c.id === b.clienteId)?.nome || '';
                        return ca.localeCompare(cb) * modifier;
                    }
                    case 'placa': {
                        const va = veiculos.find(v => v.id === a.veiculoId)?.placa || '';
                        const vb = veiculos.find(v => v.id === b.veiculoId)?.placa || '';
                        return va.localeCompare(vb) * modifier;
                    }
                    case 'servico': {
                        const sa = getServicoLabel(serviceLabels, a.tipoServico) || a.tipoServico;
                        const sb = getServicoLabel(serviceLabels, b.tipoServico) || b.tipoServico;
                        return sa.localeCompare(sb) * modifier;
                    }
                    case 'status': {
                        // Ordena por data de entrada na delegacia; se não tiver, por label de status
                        const getD = (o: OrdemDeServico) => {
                            const entradas = o.delegacia?.entradas;
                            if (entradas?.length) {
                                const last = entradas[entradas.length - 1];
                                if (last?.data) return new Date(last.data + 'T12:00:00').getTime();
                            }
                            return 0;
                        };
                        const da = getD(a);
                        const db = getD(b);
                        if (da || db) return (da - db) * modifier;
                        const sta = STATUS_OS_LABELS[a.status] || a.status;
                        const stb = STATUS_OS_LABELS[b.status] || b.status;
                        return sta.localeCompare(stb) * modifier;
                    }
                    case 'pendencia': {
                        const pa = a.pendencia || a.observacaoGeral || '';
                        const pb = b.pendencia || b.observacaoGeral || '';
                        return pa.localeCompare(pb) * modifier;
                    }
                    case 'abertura': {
                        const getLastAudit = (o: OrdemDeServico) => {
                            const last = o.auditLog?.[o.auditLog.length - 1];
                            return last ? new Date(last.dataHora).getTime() : new Date(o.atualizadoEm).getTime();
                        };
                        return (getLastAudit(a) - getLastAudit(b)) * modifier;
                    }
                    default: return 0;
                }
            });
        }

        // Ordena por: prioridade → última alteração (mais recente primeiro) → número OS
        const getUltimaAlteracao = (o: OrdemDeServico): number => {
            const last = o.auditLog?.[o.auditLog.length - 1];
            return last ? new Date(last.dataHora).getTime() : new Date(o.atualizadoEm).getTime();
        };

        const prioOrder: Record<string, number> = { critica: 0, urgente: 1, normal: 2 };
        return result.sort((a, b) => {
            const pa = prioOrder[a.prioridade || 'normal'] ?? 2;
            const pb = prioOrder[b.prioridade || 'normal'] ?? 2;
            if (pa !== pb) return pa - pb;
            return getUltimaAlteracao(b) - getUltimaAlteracao(a); // mais recente primeiro
        });
    }, [ordens, clientes, veiculos, search, statusFilter, tipoFilter, urgentFilter, sortConfig, empresaFilter]);

    // Total visível sem o filtro de status (usado para contar os chips)
    const visibleBase = useMemo(() => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return ordens.filter((o) => {
            if (o.status === 'entregue') {
                const dataEntrega = o.entregueEm ? new Date(o.entregueEm) : new Date(o.atualizadoEm);
                if (dataEntrega < sevenDaysAgo) return false;
            }
            return true;
        });
    }, [ordens]);

    // Contagem por status para os chips (pendentes = OS com pendência)
    const statusCounts = useMemo(() => {
        const counts = {
            pendentes: 0,
            aguardando_documentacao: 0,
            vistoria: 0,
            delegacia: 0,
            doc_pronto: 0,
            entregue: 0,
        };
        visibleBase.forEach((o) => {
            if (o.pendencia) {
                counts.pendentes++;
            }
            if (o.status && o.status in counts) {
                (counts as any)[o.status]++;
            }
        });
        return counts;
    }, [visibleBase]);

    const hasActiveFilters = search.trim() !== '' || statusFilter !== '' || tipoFilter !== '' || urgentFilter;

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        } else if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            setSortConfig(null);
            return;
        }
        setSortConfig({ key, direction });
    };

    const SortableHeader = ({ label, sortKey, width }: { label: string, sortKey: string, width?: number }) => (
        <th
            style={{
                cursor: 'pointer',
                userSelect: 'none',
                width,
                padding: '14px 16px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: sortConfig?.key === sortKey ? 'var(--color-yellow-primary)' : 'var(--color-text-tertiary)',
                borderBottom: '1px solid var(--border-color)',
                transition: 'color 0.2s',
                whiteSpace: 'nowrap' as const,
            }}
            onClick={() => handleSort(sortKey)}
            onMouseEnter={e => { if (sortConfig?.key !== sortKey) e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
            onMouseLeave={e => { if (sortConfig?.key !== sortKey) e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {label}
                {sortConfig?.key === sortKey && sortConfig.direction === 'asc' && <span style={{ fontSize: 9, opacity: 0.9 }}>▲</span>}
                {sortConfig?.key === sortKey && sortConfig.direction === 'desc' && <span style={{ fontSize: 9, opacity: 0.9 }}>▼</span>}
                {sortConfig?.key !== sortKey && <span style={{ fontSize: 9, opacity: 0.2 }}>↕</span>}
            </div>
        </th>
    );

    const handleStatusChange = async (osId: string, newStatus: StatusOS) => {
        const os = ordens.find(o => o.id === osId);
        if (os && os.status !== newStatus) {
            // Atualização otimista local para evitar delay visual (opcional, mas recomendado)
            setOrdens(prev => prev.map(o => o.id === osId ? { ...o, status: newStatus } : o));

            await updateOrdem(osId, { status: newStatus });
            await addAuditEntry(osId, 'Status alterado', `Status → ${STATUS_OS_LABELS[newStatus]} (via Kanban)`);
            loadData(true); // Chamada silenciosa para não piscar a tela
        }
    };

    if (loading) return <LoadingSpinner fullPage label="Carregando ordens de serviço..." />;

    // --- Status card data for the top summary ---
    const statusCards = [
        { key: 'pendentes', label: 'Pendentes', icon: AlertTriangle, color: '#EF4444', bgColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' },
        { key: 'aguardando_documentacao', label: 'Aguardando Doc', icon: FileText, color: '#C88010', bgColor: 'rgba(200,128,16,0.08)', borderColor: 'rgba(200,128,16,0.25)' },
        { key: 'vistoria', label: 'Vistoria', icon: Eye, color: '#3D70C0', bgColor: 'rgba(61,112,192,0.08)', borderColor: 'rgba(61,112,192,0.25)' },
        { key: 'delegacia', label: 'Delegacia', icon: Building2, color: '#8B5CF6', bgColor: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.25)' },
        { key: 'doc_pronto', label: 'Prontas', icon: CheckCircle, color: '#28A06A', bgColor: 'rgba(40,160,106,0.08)', borderColor: 'rgba(40,160,106,0.25)' },
    ];

    return (
        <div style={{ animation: 'oslist-fadeSlideIn 0.3s ease-out' }}>
            {/* Compact status bar + Nova OS button */}
            <style>{`
                @media (max-width: 720px) {
                    .oslist-topbar { flex-wrap: wrap !important; }
                    .oslist-statusbar { order: 2; flex: 1 1 100% !important; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
                    .oslist-statusbar > button { flex: 0 0 92px !important; }
                    .oslist-nova-btn { order: 1; flex: 1 1 100% !important; justify-content: center; padding: 12px !important; font-size: 0.9rem !important; }
                }
            `}</style>
            <div className="oslist-topbar" style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
            }}>
                <div className="oslist-statusbar" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                {statusCards.map((card) => {
                    const isPendentes = card.key === 'pendentes';
                    const count = statusCounts[card.key as keyof typeof statusCounts] ?? 0;
                    const isActive = isPendentes ? urgentFilter : statusFilter === card.key;
                    return (
                        <button
                            key={card.key}
                            onClick={() => {
                                if (isPendentes) {
                                    setUrgentFilter(!urgentFilter);
                                    setStatusFilter('');
                                } else {
                                    setUrgentFilter(false);
                                    setStatusFilter(isActive ? '' : card.key as StatusOS | '');
                                }
                            }}
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                padding: '6px 8px',
                                borderRadius: 8,
                                border: `1px solid ${isActive ? card.color : card.borderColor}`,
                                background: isActive
                                    ? `linear-gradient(135deg, ${card.bgColor}, ${card.bgColor.replace('0.08', '0.16')})`
                                    : card.bgColor,
                                cursor: 'pointer',
                                transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
                                boxShadow: isActive ? `0 2px 10px ${card.color}33` : 'none',
                            }}
                            onMouseEnter={e => {
                                if (!isActive) {
                                    e.currentTarget.style.borderColor = card.color;
                                    e.currentTarget.style.boxShadow = `0 2px 10px ${card.color}22`;
                                }
                            }}
                            onMouseLeave={e => {
                                if (!isActive) {
                                    e.currentTarget.style.borderColor = card.borderColor;
                                    e.currentTarget.style.boxShadow = 'none';
                                }
                            }}
                        >
                            <span style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: card.color,
                                textTransform: 'uppercase' as const,
                                letterSpacing: '0.05em',
                                lineHeight: 1.2,
                            }}>
                                {card.label}
                            </span>
                            <span style={{
                                fontSize: 18,
                                fontWeight: 800,
                                color: isActive ? card.color : 'var(--color-text-primary)',
                                lineHeight: 1.2,
                            }}>
                                {count}
                            </span>
                        </button>
                    );
                })}
                {/* Filtro ativo indicator */}
                {hasActiveFilters && (
                    <button
                        onClick={resetFilters}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: '0.72rem', color: 'var(--color-purple)',
                            background: 'var(--color-purple-bg)', border: '1px solid rgba(139,92,246,0.2)',
                            cursor: 'pointer', padding: '4px 10px', borderRadius: 6,
                            fontWeight: 600, transition: 'all 0.2s', whiteSpace: 'nowrap' as const,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,92,246,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--color-purple-bg)'}
                    >
                        <X size={11} /> Limpar
                    </button>
                )}
                </div>
                {/* Nova OS button */}
                <button
                    onClick={() => openNovaOSModal()}
                    className="btn btn-primary oslist-nova-btn"
                    style={{
                        padding: '8px 18px',
                        borderRadius: 8,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'linear-gradient(135deg, var(--color-yellow-primary) 0%, var(--color-yellow-dark) 100%)',
                        color: '#fff',
                        boxShadow: '0 2px 12px rgba(232,150,10,0.3)',
                        transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                        whiteSpace: 'nowrap' as const,
                        flexShrink: 0,
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(232,150,10,0.4)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 12px rgba(232,150,10,0.3)';
                    }}
                >
                    <Plus size={16} strokeWidth={2.5} /> Nova OS
                </button>
            </div>

            {/* Toolbar */}
            <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 10,
                padding: '8px 12px',
                marginBottom: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0px',
                boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
            }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Search bar */}
                    <div style={{
                        flex: 1,
                        minWidth: 220,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                    }}>
                        <Search size={15} style={{
                            position: 'absolute',
                            left: 10,
                            color: 'var(--color-text-tertiary)',
                            pointerEvents: 'none',
                            transition: 'color 0.2s',
                        }} />
                        <input
                            type="text"
                            placeholder="Buscar por numero, cliente ou placa..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 12px 8px 36px',
                                background: 'var(--bg-body)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                color: 'var(--color-text-primary)',
                                fontSize: '0.82rem',
                                outline: 'none',
                                transition: 'all 0.25s cubic-bezier(.4,0,.2,1)',
                                fontFamily: 'inherit',
                            }}
                            onFocus={e => {
                                e.target.style.borderColor = 'var(--color-yellow-primary)';
                                e.target.style.boxShadow = '0 0 0 3px rgba(232,150,10,0.12)';
                            }}
                            onBlur={e => {
                                e.target.style.borderColor = 'var(--border-color)';
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                style={{
                                    position: 'absolute',
                                    right: 12,
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--color-text-tertiary)',
                                    padding: 4,
                                    borderRadius: 6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'color 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-primary)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* View toggle */}
                    <div style={{
                        display: 'flex',
                        background: 'var(--bg-body)',
                        padding: 3,
                        borderRadius: 11,
                        border: '1px solid var(--border-color)',
                    }}>
                        {(['kanban', 'list'] as const).map((v) => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 7,
                                    border: 'none',
                                    background: view === v ? 'var(--color-yellow-primary)' : 'transparent',
                                    color: view === v ? '#fff' : 'var(--color-text-tertiary)',
                                    fontWeight: 700,
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
                                    fontFamily: 'inherit',
                                }}
                                onMouseEnter={e => { if (view !== v) e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                                onMouseLeave={e => { if (view !== v) e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                            >
                                {v === 'kanban' ? <LayoutGrid size={15} /> : <List size={15} />}
                                {v === 'kanban' ? 'Kanban' : 'Lista'}
                            </button>
                        ))}
                    </div>

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Filter size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                        <select
                            className="form-select"
                            style={{
                                width: 180,
                                height: 34,
                                borderRadius: 8,
                                background: 'var(--bg-body)',
                                border: '1px solid var(--border-color)',
                                padding: '0 12px',
                                fontSize: '0.84rem',
                                fontWeight: 600,
                                color: statusFilter ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                                cursor: 'pointer',
                                transition: 'border-color 0.2s',
                                fontFamily: 'inherit',
                                outline: 'none',
                                appearance: 'auto' as any,
                            }}
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as StatusOS | '')}
                            onFocus={e => e.currentTarget.style.borderColor = 'var(--color-yellow-primary)'}
                            onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                        >
                            <option value="">Status: Todos</option>
                            {Object.entries(STATUS_OS_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                        <select
                            className="form-select"
                            style={{
                                width: 180,
                                height: 34,
                                borderRadius: 8,
                                background: 'var(--bg-body)',
                                border: '1px solid var(--border-color)',
                                padding: '0 12px',
                                fontSize: '0.84rem',
                                fontWeight: 600,
                                color: tipoFilter ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                                cursor: 'pointer',
                                transition: 'border-color 0.2s',
                                fontFamily: 'inherit',
                                outline: 'none',
                                appearance: 'auto' as any,
                            }}
                            value={tipoFilter}
                            onChange={(e) => setTipoFilter(e.target.value as TipoServico | '')}
                            onFocus={e => e.currentTarget.style.borderColor = 'var(--color-yellow-primary)'}
                            onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                        >
                            <option value="">Servico: Todos</option>
                            {Object.entries(serviceLabels).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Filtro por empresa */}
                {empresas.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 8, alignItems: 'center' }}>
                        <button
                            onClick={() => setEmpresaFilter('')}
                            style={{
                                padding: '5px 12px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                border: `1px solid ${empresaFilter === '' ? 'var(--color-primary)' : 'var(--color-gray-700)'}`,
                                backgroundColor: empresaFilter === '' ? 'rgba(212,168,67,0.15)' : 'transparent',
                                color: empresaFilter === '' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            Todas
                        </button>
                        {empresas.map((emp) => (
                            <button
                                key={emp.id}
                                onClick={() => setEmpresaFilter(emp.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '5px 12px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    border: `1px solid ${empresaFilter === emp.id ? emp.cor : 'var(--color-gray-700)'}`,
                                    backgroundColor: empresaFilter === emp.id ? `${emp.cor}20` : 'transparent',
                                    color: empresaFilter === emp.id ? emp.cor : 'var(--color-text-secondary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <span
                                    style={{
                                        display: 'inline-block',
                                        width: 7,
                                        height: 7,
                                        borderRadius: '50%',
                                        backgroundColor: emp.cor,
                                    }}
                                />
                                {emp.nome}
                            </button>
                        ))}
                        <button
                            onClick={() => setEmpresaFilter('particular')}
                            style={{
                                padding: '5px 12px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                border: `1px solid ${empresaFilter === 'particular' ? 'var(--color-primary)' : 'var(--color-gray-700)'}`,
                                backgroundColor: empresaFilter === 'particular' ? 'rgba(212,168,67,0.15)' : 'transparent',
                                color: empresaFilter === 'particular' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            Particulares
                        </button>
                    </div>
                )}

                {/* Filter count indicator */}
                {hasActiveFilters && (
                    <div style={{ paddingTop: 6, fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                        Mostrando <strong style={{ color: 'var(--color-text-secondary)' }}>{filtered.length}</strong> de {visibleBase.length}
                    </div>
                )}
            </div>

            {filtered.length === 0 ? (
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 20,
                    padding: '64px 32px',
                    textAlign: 'center' as const,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 16,
                    animation: 'oslist-fadeSlideIn 0.4s ease-out',
                }}>
                    <div style={{
                        width: 72,
                        height: 72,
                        borderRadius: 20,
                        background: 'rgba(255,255,255,0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 8,
                    }}>
                        <Inbox size={36} style={{ color: 'var(--color-text-tertiary)' }} />
                    </div>
                    {visibleBase.length === 0 ? (
                        <>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                Nenhuma OS cadastrada
                            </h3>
                            <p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: '0.9rem', maxWidth: 360 }}>
                                Comece criando a primeira Ordem de Servico para acompanhar seus processos.
                            </p>
                            <button
                                onClick={() => openNovaOSModal()}
                                style={{
                                    marginTop: 8,
                                    padding: '12px 28px',
                                    borderRadius: 12,
                                    border: 'none',
                                    background: 'linear-gradient(135deg, var(--color-yellow-primary), var(--color-yellow-dark))',
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: '0.92rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    boxShadow: '0 4px 16px rgba(232,150,10,0.3)',
                                    transition: 'all 0.2s',
                                    fontFamily: 'inherit',
                                }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <Plus size={18} /> Criar primeira OS
                            </button>
                        </>
                    ) : (
                        <>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                Nenhuma OS encontrada
                            </h3>
                            <p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: '0.9rem', maxWidth: 360 }}>
                                Tente remover ou ajustar os filtros aplicados.
                            </p>
                            <button
                                onClick={resetFilters}
                                style={{
                                    marginTop: 8,
                                    padding: '10px 22px',
                                    borderRadius: 10,
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--color-text-secondary)',
                                    fontWeight: 600,
                                    fontSize: '0.88rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    transition: 'all 0.2s',
                                    fontFamily: 'inherit',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                    e.currentTarget.style.color = 'var(--color-text-primary)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                                }}
                            >
                                <X size={14} /> Limpar filtros
                            </button>
                        </>
                    )}
                </div>
            ) : view === 'kanban' ? (
                <OSKanban
                    ordens={filtered}
                    clientes={clientes}
                    veiculos={veiculos}
                    onStatusChange={handleStatusChange}
                />
            ) : (
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                <th style={{ width: 4, padding: 0 }} /> {/* Status border column */}
                                <SortableHeader label="OS" sortKey="os" width={80} />
                                <SortableHeader label="Cliente" sortKey="cliente" />
                                <SortableHeader label="Placa" sortKey="placa" />
                                <SortableHeader label="Servico" sortKey="servico" />
                                <SortableHeader label="Status" sortKey="status" />
                                <SortableHeader label="Pendencia" sortKey="pendencia" />
                                <SortableHeader label="Ult. Alteracao" sortKey="abertura" />
                                <th style={{
                                    width: 100,
                                    padding: '14px 16px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    color: 'var(--color-text-tertiary)',
                                    borderBottom: '1px solid var(--border-color)',
                                }}>Acoes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((os, idx) => {
                                const cliente = clientes.find((c) => c.id === os.clienteId);
                                const veiculo = veiculos.find((v) => v.id === os.veiculoId);
                                const hasPrio = os.prioridade && os.prioridade !== 'normal';
                                const prioColor = os.prioridade === 'critica' ? 'var(--color-danger)' : os.prioridade === 'urgente' ? 'var(--color-warning)' : '';
                                const valorServico = os.valorServico ?? 0;
                                const totalPago = paymentTotals[os.id] ?? 0;
                                const temPendenciaFinanceira = os.status !== 'entregue' && valorServico > 0 && totalPago === 0;
                                const progress = STATUS_PROGRESS[os.status];
                                const isHovered = hoveredRow === os.id;
                                const statusBorderColor = hasPrio ? prioColor : STATUS_BORDER_COLOR[os.status] || 'transparent';

                                return (
                                    <tr
                                        key={os.id}
                                        className="clickable"
                                        onClick={() => navigate(`/ordens/${os.id}`)}
                                        onMouseEnter={() => setHoveredRow(os.id)}
                                        onMouseLeave={() => setHoveredRow(null)}
                                        style={{
                                            background: isHovered
                                                ? 'rgba(255,255,255,0.04)'
                                                : temPendenciaFinanceira
                                                    ? 'rgba(239,68,68,0.04)'
                                                    : os.pendencia
                                                        ? 'rgba(239,68,68,0.02)'
                                                        : 'transparent',
                                            transition: 'background 0.15s ease',
                                            cursor: 'pointer',
                                            animation: `oslist-fadeSlideIn 0.3s ease-out ${idx * 0.02}s both`,
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        }}
                                    >
                                        {/* Status color bar */}
                                        <td style={{
                                            width: 4,
                                            padding: 0,
                                            position: 'relative',
                                        }}>
                                            <div style={{
                                                position: 'absolute',
                                                top: 4,
                                                bottom: 4,
                                                left: 0,
                                                width: 4,
                                                borderRadius: '0 4px 4px 0',
                                                background: statusBorderColor,
                                                transition: 'all 0.2s',
                                                opacity: isHovered ? 1 : 0.7,
                                            }} />
                                        </td>
                                        <td data-label="OS" style={{ padding: '14px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <strong style={{
                                                    fontSize: '0.92rem',
                                                    color: 'var(--color-text-primary)',
                                                    fontWeight: 800,
                                                    letterSpacing: '-0.01em',
                                                }}>
                                                    #{os.numero}
                                                </strong>
                                                {hasPrio && (
                                                    <span
                                                        title={os.prioridade === 'critica' ? 'Critica' : 'Urgente'}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 3,
                                                            padding: '2px 7px',
                                                            borderRadius: 6,
                                                            fontSize: '0.62rem',
                                                            fontWeight: 800,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.04em',
                                                            background: os.prioridade === 'critica' ? 'rgba(239,68,68,0.15)' : 'rgba(200,128,16,0.15)',
                                                            color: prioColor,
                                                            border: `1px solid ${os.prioridade === 'critica' ? 'rgba(239,68,68,0.3)' : 'rgba(200,128,16,0.3)'}`,
                                                        }}
                                                    >
                                                        {os.prioridade === 'critica'
                                                            ? <Flame size={10} />
                                                            : <AlertTriangle size={10} />}
                                                        {os.prioridade === 'critica' ? 'Critica' : 'Urgente'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td data-label="Cliente" style={{
                                            padding: '14px 16px',
                                            fontWeight: 600,
                                            fontSize: '0.88rem',
                                            color: 'var(--color-text-primary)',
                                        }}>
                                            {cliente?.nome || '—'}
                                            {os.empresaParceiraId && (() => {
                                                const emp = empresas.find((e) => e.id === os.empresaParceiraId);
                                                if (!emp) return null;
                                                const tudoEnviado = !!os.enviosStatus
                                                    && os.enviosStatus.length > 0
                                                    && os.enviosStatus.every((e: any) => e.enviado);
                                                return (
                                                    <span
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                                                        style={{
                                                            backgroundColor: tudoEnviado ? '#28A06A' : emp.cor,
                                                            marginLeft: 6,
                                                            boxShadow: tudoEnviado ? '0 0 6px rgba(40,160,106,0.5)' : 'none',
                                                        }}
                                                        title={tudoEnviado ? 'Todos os documentos enviados' : 'Envios pendentes'}
                                                    >
                                                        {emp.nome}
                                                        {tudoEnviado && <span style={{ marginLeft: 2 }}>✓</span>}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td data-label="Placa" style={{
                                            padding: '14px 16px',
                                            fontFamily: 'monospace',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            color: 'var(--color-text-secondary)',
                                            letterSpacing: '0.03em',
                                        }}>
                                            {veiculo?.placa || '—'}
                                        </td>
                                        <td data-label="Servico" style={{
                                            padding: '14px 16px',
                                            fontSize: '0.84rem',
                                            color: 'var(--color-text-secondary)',
                                        }}>
                                            {getServicoLabel(serviceLabels, os.tipoServico)}
                                        </td>
                                        <td data-label="Status" style={{ padding: '14px 16px' }}>
                                            <div>
                                                <span className={`badge ${getStatusBadge(os.status)}`} style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    padding: '4px 10px',
                                                    borderRadius: 8,
                                                }}>
                                                    {STATUS_OS_LABELS[os.status]}
                                                </span>
                                                {/* Progress bar under status */}
                                                {progress && (
                                                    <div style={{
                                                        marginTop: 8,
                                                        height: 3,
                                                        borderRadius: 3,
                                                        background: 'rgba(255,255,255,0.06)',
                                                        overflow: 'hidden',
                                                        width: 80,
                                                    }}>
                                                        <div style={{
                                                            height: '100%',
                                                            width: `${progress.pct}%`,
                                                            borderRadius: 3,
                                                            background: `linear-gradient(90deg, ${progress.color}, ${progress.color}cc)`,
                                                            animation: 'oslist-progressGrow 0.6s ease-out',
                                                            transition: 'width 0.3s ease',
                                                        }} />
                                                    </div>
                                                )}
                                                {/* Mostra data de entrada/reentrada/sifap apenas na delegacia */}
                                                {os.status === 'delegacia' && (() => {
                                                    if (os.sifap?.dataRegistro || os.statusDelegacia?.toLowerCase() === 'sifap') {
                                                        const dateStr = os.sifap?.dataRegistro || (os.delegacia?.entradas?.length ? os.delegacia.entradas[os.delegacia.entradas.length - 1]?.data : null);
                                                        return dateStr ? (
                                                            <span style={{ fontSize: 10, color: 'var(--color-success-bright)', display: 'block', marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>
                                                                SIFAP: {new Date(dateStr).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                                                            </span>
                                                        ) : null;
                                                    }

                                                    if ((os.delegacia?.entradas?.length ?? 0) > 0) {
                                                        const entradas = os.delegacia!.entradas;
                                                        const last = entradas[entradas.length - 1];
                                                        if (!last?.data) return null;

                                                        let label = 'Entrada';
                                                        if (last.tipo === 'reentrada') label = 'Reentrada';
                                                        if (last.tipo === 'sifap') label = 'SIFAP';

                                                        const color = last.tipo === 'sifap' ? 'var(--color-success-bright)' : last.tipo === 'reentrada' ? 'var(--color-warning)' : 'var(--color-info)';

                                                        return (
                                                            <span style={{ fontSize: 10, color, display: 'block', marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>
                                                                {label}: {new Date(last.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                                                            </span>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                        </td>
                                        <td data-label="Pendencia" style={{ padding: '14px 16px' }}>
                                            {(() => {
                                                let pendenciasStr = os.pendencia ? [os.pendencia] : [];
                                                if (temPendenciaFinanceira) pendenciasStr.push('Sem pagamento');

                                                const hasPendencias = pendenciasStr.length > 0;

                                                return hasPendencias ? (
                                                    <div style={{
                                                        display: 'flex', flexDirection: 'column', gap: 3,
                                                        maxWidth: 200,
                                                    }}>
                                                        {pendenciasStr.map((p, i) => (
                                                            <span key={i} style={{
                                                                fontSize: '0.75rem',
                                                                fontWeight: 700,
                                                                color: 'var(--color-danger)',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: 5,
                                                                background: 'rgba(239,68,68,0.08)',
                                                                padding: '3px 8px',
                                                                borderRadius: 6,
                                                                border: '1px solid rgba(239,68,68,0.15)',
                                                                width: 'fit-content',
                                                            }}>
                                                                <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                                                                {p}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : os.observacaoGeral ? (
                                                    <span style={{
                                                        fontSize: '0.78rem', color: 'var(--color-text-tertiary)', fontStyle: 'italic',
                                                        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        display: 'block',
                                                    }} title={os.observacaoGeral}>
                                                        {os.observacaoGeral}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>—</span>
                                                );
                                            })()}
                                        </td>
                                        <td data-label="Ult. Alteracao" style={{ padding: '14px 16px' }}>{(() => {
                                            const last = os.auditLog?.[os.auditLog.length - 1];
                                            if (!last) return <span style={{ color: 'var(--color-text-tertiary)', fontSize: '0.78rem' }}>—</span>;
                                            const dt = new Date(last.dataHora);
                                            const dateStr = dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
                                            const timeStr = dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
                                            return (
                                                <div>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>{last.acao}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>{dateStr} {timeStr}</div>
                                                </div>
                                            );
                                        })()}</td>
                                        <td data-label="Acoes" style={{ padding: '14px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Link
                                                    to={`/ordens/${os.id}`}
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={(e) => e.stopPropagation()}
                                                    title="Ver OS"
                                                    style={{
                                                        opacity: isHovered ? 1 : 0.25,
                                                        transition: 'all 0.2s ease',
                                                        padding: '6px 8px',
                                                        borderRadius: 8,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                    }}
                                                >
                                                    <Eye size={16} />
                                                </Link>
                                                {(os.status === 'delegacia' || os.status === 'doc_pronto') && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const cpfCnpj = cliente?.cpfCnpj?.replace(/\D/g, '') || '';
                                                            const placa = veiculo?.placa || '';
                                                            const renavam = veiculo?.renavam?.replace(/\D/g, '') || '';
                                                            const crv = renavam ? renavam.padStart(13, '0') : '';
                                                            const params = new URLSearchParams();
                                                            if (cpfCnpj) params.set('matilde_cpfCnpj', cpfCnpj);
                                                            if (placa) params.set('matilde_placa', placa);
                                                            if (renavam) params.set('matilde_renavam', renavam);
                                                            if (crv) params.set('matilde_crv', crv);
                                                            if (os.id) params.set('matilde_osId', os.id);
                                                            const query = params.toString();
                                                            window.open(`https://cidadao.mg.gov.br/#/egov/servicos/veiculo-condutor/crlv-digital${query ? '?' + query : ''}`, '_blank');
                                                        }}
                                                        title="Consultar CRLV Digital"
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 4,
                                                            padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                                                            background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                                                            color: '#fff', fontWeight: 700, fontSize: '0.68rem',
                                                            fontFamily: 'var(--font-family)',
                                                            boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
                                                            opacity: isHovered ? 1 : 0.4,
                                                            transition: 'all 0.2s ease',
                                                            whiteSpace: 'nowrap',
                                                            letterSpacing: '0.02em',
                                                        }}
                                                        onMouseEnter={e => {
                                                            e.currentTarget.style.boxShadow = '0 4px 14px rgba(59,130,246,0.4)';
                                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                                        }}
                                                        onMouseLeave={e => {
                                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,130,246,0.25)';
                                                            e.currentTarget.style.transform = 'translateY(0)';
                                                        }}
                                                    >
                                                        <ExternalLink size={11} /> CRLV
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

        </div>
    );
}

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
    aguardando_documentacao: { pct: 20, color: 'var(--notion-orange)' },
    vistoria:                { pct: 40, color: 'var(--notion-blue)' },
    delegacia:               { pct: 60, color: 'var(--notion-purple, #9065B0)' },
    doc_pronto:              { pct: 80, color: 'var(--notion-green)' },
    entregue:                { pct: 100, color: 'var(--notion-green)' },
};

// Cor de fundo dos chips de filtro rápido
const STATUS_CHIP_COLOR: Record<string, string> = {
    aguardando_documentacao: 'var(--notion-orange)',
    vistoria:                'var(--notion-blue)',
    delegacia:               'var(--notion-purple, #9065B0)',
    doc_pronto:              'var(--notion-green)',
    entregue:                'var(--notion-text-secondary)',
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
                const nomeCliente = (cliente?.nome ?? '').toLowerCase();
                const placaVeiculo = (veiculo?.placa ?? '').toLowerCase();
                const chassiVeiculo = (veiculo?.chassi ?? '').toLowerCase();
                const cpfCliente = (cliente?.cpfCnpj ?? '').replace(/\D/g, '');
                const numOS = String(o.numero ?? '');
                const tipoServ = (o.tipoServico ?? '').toLowerCase();
                return (
                    numOS.includes(term) ||
                    nomeCliente.includes(term) ||
                    placaVeiculo.includes(term) ||
                    chassiVeiculo.includes(term) ||
                    tipoServ.includes(term) ||
                    cpfCliente.includes(term.replace(/\D/g, ''))
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
                    case 'os': return ((a.numero ?? 0) - (b.numero ?? 0)) * modifier;
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
            entregue: ordens.filter(o => o.status === 'entregue').length,
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
                color: sortConfig?.key === sortKey ? 'var(--notion-blue)' : 'var(--notion-text-secondary)',
                borderBottom: '1px solid var(--notion-border)',
                transition: 'color 0.2s',
                whiteSpace: 'nowrap' as const,
            }}
            onClick={() => handleSort(sortKey)}
            onMouseEnter={e => { if (sortConfig?.key !== sortKey) e.currentTarget.style.color = 'var(--notion-text-secondary)'; }}
            onMouseLeave={e => { if (sortConfig?.key !== sortKey) e.currentTarget.style.color = 'var(--notion-text-secondary)'; }}
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
        { key: 'aguardando_documentacao', label: 'Aguard. Doc', icon: FileText, color: '#C88010', bgColor: 'rgba(200,128,16,0.08)', borderColor: 'rgba(200,128,16,0.25)' },
        { key: 'vistoria', label: 'Vistoria', icon: Eye, color: '#3D70C0', bgColor: 'rgba(61,112,192,0.08)', borderColor: 'rgba(61,112,192,0.25)' },
        { key: 'delegacia', label: 'Delegacia', icon: Building2, color: '#8B5CF6', bgColor: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.25)' },
        { key: 'doc_pronto', label: 'Doc. Pronto', icon: CheckCircle, color: '#28A06A', bgColor: 'rgba(40,160,106,0.08)', borderColor: 'rgba(40,160,106,0.25)' },
        { key: 'entregue', label: 'Entregues', icon: CheckCircle, color: '#6B7280', bgColor: 'rgba(107,114,128,0.08)', borderColor: 'rgba(107,114,128,0.25)' },
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
                                gap: 2,
                                padding: '10px 12px',
                                borderRadius: 10,
                                border: isActive ? `1.5px solid ${card.color}` : '1.5px solid var(--notion-border)',
                                background: isActive ? card.bgColor : 'transparent',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => {
                                if (!isActive) {
                                    e.currentTarget.style.borderColor = card.color;
                                    e.currentTarget.style.background = card.bgColor;
                                }
                            }}
                            onMouseLeave={e => {
                                if (!isActive) {
                                    e.currentTarget.style.borderColor = 'var(--notion-border)';
                                    e.currentTarget.style.background = 'transparent';
                                }
                            }}
                        >
                            <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: isActive ? card.color : 'var(--notion-text-secondary)',
                                textTransform: 'uppercase' as const,
                                letterSpacing: '0.04em',
                            }}>
                                {card.label}
                            </span>
                            <span style={{
                                fontSize: 22,
                                fontWeight: 800,
                                color: isActive ? card.color : 'var(--notion-text)',
                                lineHeight: 1.1,
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
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: '0.82rem', color: '#dc2626',
                            background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
                            cursor: 'pointer', padding: '6px 14px', borderRadius: 8,
                            fontWeight: 600, transition: 'all 150ms', whiteSpace: 'nowrap' as const,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,38,38,0.15)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(220,38,38,0.08)'}
                    >
                        <X size={14} /> Limpar filtros
                    </button>
                )}
                </div>
                {/* Nova OS button */}
                <button
                    onClick={() => openNovaOSModal()}
                    className="btn btn-primary oslist-nova-btn"
                    style={{
                        padding: '10px 20px',
                        borderRadius: 10,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'var(--notion-blue)',
                        color: '#fff',
                        transition: 'all 0.15s ease',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        whiteSpace: 'nowrap' as const,
                        flexShrink: 0,
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                    <Plus size={16} strokeWidth={2.5} /> Nova OS
                </button>
            </div>

            {/* Toolbar */}
            <div style={{
                border: '1px solid var(--notion-border)',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0px',
            }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Search bar */}
                    <div style={{
                        flex: 1,
                        minWidth: 0,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                    }}>
                        <Search size={15} style={{
                            position: 'absolute',
                            left: 10,
                            color: 'var(--notion-text-secondary)',
                            pointerEvents: 'none',
                            transition: 'color 0.2s',
                        }} />
                        <input
                            type="search"
                            inputMode="search"
                            autoComplete="off"
                            placeholder="Buscar por nome, placa, chassi, nº OS..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 12px 8px 36px',
                                background: 'var(--notion-bg)',
                                border: '1px solid var(--notion-border)',
                                borderRadius: 8,
                                color: 'var(--notion-text)',
                                fontSize: 16,
                                outline: 'none',
                                transition: 'all 0.25s cubic-bezier(.4,0,.2,1)',
                                fontFamily: 'inherit',
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
                                    color: 'var(--notion-text-secondary)',
                                    padding: 4,
                                    borderRadius: 6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'color 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--notion-text)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--notion-text-secondary)'}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* View toggle */}
                    <div style={{
                        display: 'flex',
                        background: 'var(--notion-bg)',
                        padding: 3,
                        borderRadius: 11,
                        border: '1px solid var(--notion-border)',
                    }}>
                        {(['kanban', 'list'] as const).map((v) => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 7,
                                    border: 'none',
                                    background: view === v ? 'var(--notion-blue)' : 'transparent',
                                    color: view === v ? '#fff' : 'var(--notion-text-secondary)',
                                    fontWeight: 700,
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
                                    fontFamily: 'inherit',
                                }}
                                onMouseEnter={e => { if (view !== v) e.currentTarget.style.color = 'var(--notion-text)'; }}
                                onMouseLeave={e => { if (view !== v) e.currentTarget.style.color = 'var(--notion-text-secondary)'; }}
                            >
                                {v === 'kanban' ? <LayoutGrid size={15} /> : <List size={15} />}
                                {v === 'kanban' ? 'Kanban' : 'Lista'}
                            </button>
                        ))}
                    </div>

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', flex: '0 0 auto' }}>
                        <select
                            className="form-select"
                            style={{
                                minWidth: 130,
                                maxWidth: 180,
                                flex: 1,
                                height: 36,
                                borderRadius: 8,
                                border: '1px solid var(--notion-border)',
                                padding: '0 10px',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                color: statusFilter ? 'var(--notion-text)' : 'var(--notion-text-secondary)',
                                cursor: 'pointer',
                                transition: 'border-color 0.15s',
                                fontFamily: 'inherit',
                                outline: 'none',
                                appearance: 'auto' as any,
                                WebkitAppearance: 'menulist' as any,
                            }}
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as StatusOS | '')}
                        >
                            <option value="">Status: Todos</option>
                            {Object.entries(STATUS_OS_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                        <select
                            className="form-select"
                            style={{
                                minWidth: 130,
                                maxWidth: 180,
                                flex: 1,
                                height: 36,
                                borderRadius: 8,
                                border: '1px solid var(--notion-border)',
                                padding: '0 10px',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                color: tipoFilter ? 'var(--notion-text)' : 'var(--notion-text-secondary)',
                                cursor: 'pointer',
                                transition: 'border-color 0.15s',
                                fontFamily: 'inherit',
                                outline: 'none',
                                appearance: 'auto' as any,
                                WebkitAppearance: 'menulist' as any,
                            }}
                            value={tipoFilter}
                            onChange={(e) => setTipoFilter(e.target.value as TipoServico | '')}
                        >
                            <option value="">Serviço: Todos</option>
                            {Object.entries(serviceLabels).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Filtro por empresa */}
                {empresas.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--notion-border)', marginTop: 10, alignItems: 'center' }}>
                        <button
                            onClick={() => setEmpresaFilter('')}
                            style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                border: empresaFilter === '' ? '1.5px solid var(--notion-blue)' : '1.5px solid transparent',
                                backgroundColor: empresaFilter === '' ? 'rgba(0,117,222,0.08)' : 'transparent',
                                color: empresaFilter === '' ? 'var(--notion-blue)' : 'var(--notion-text-secondary)',
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
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    border: empresaFilter === emp.id ? `1.5px solid ${emp.cor}` : '1.5px solid transparent',
                                    backgroundColor: empresaFilter === emp.id ? `${emp.cor}15` : 'transparent',
                                    color: empresaFilter === emp.id ? emp.cor : 'var(--notion-text-secondary)',
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
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                border: empresaFilter === 'particular' ? '1.5px solid var(--notion-blue)' : '1.5px solid transparent',
                                backgroundColor: empresaFilter === 'particular' ? 'rgba(0,117,222,0.08)' : 'transparent',
                                color: empresaFilter === 'particular' ? 'var(--notion-blue)' : 'var(--notion-text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            Particulares
                        </button>
                    </div>
                )}

                {/* Filter count indicator */}
                {hasActiveFilters && (
                    <div style={{ paddingTop: 6, fontSize: '0.75rem', color: 'var(--notion-text-secondary)' }}>
                        Mostrando <strong style={{ color: 'var(--notion-text-secondary)' }}>{filtered.length}</strong> de {visibleBase.length}
                    </div>
                )}
            </div>

            {filtered.length === 0 ? (
                <div style={{
                    background: 'var(--notion-surface)',
                    border: '1px solid var(--notion-border)',
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
                        background: 'var(--notion-bg-alt)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 8,
                    }}>
                        <Inbox size={36} style={{ color: 'var(--notion-text-secondary)' }} />
                    </div>
                    {visibleBase.length === 0 ? (
                        <>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                                Nenhuma OS cadastrada
                            </h3>
                            <p style={{ margin: 0, color: 'var(--notion-text-secondary)', fontSize: '0.9rem', maxWidth: 360 }}>
                                Comece criando a primeira Ordem de Serviço para acompanhar seus processos.
                            </p>
                            <button
                                onClick={() => openNovaOSModal()}
                                style={{
                                    marginTop: 8,
                                    padding: '12px 28px',
                                    borderRadius: 12,
                                    border: 'none',
                                    background: 'linear-gradient(135deg, var(--notion-blue), var(--notion-blue-hover))',
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: '0.92rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    boxShadow: '0 4px 16px rgba(0,117,222,0.3)',
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
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                                Nenhuma OS encontrada
                            </h3>
                            <p style={{ margin: 0, color: 'var(--notion-text-secondary)', fontSize: '0.9rem', maxWidth: 360 }}>
                                Tente remover ou ajustar os filtros aplicados.
                            </p>
                            <button
                                onClick={resetFilters}
                                style={{
                                    marginTop: 8,
                                    padding: '10px 22px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(220,38,38,0.3)',
                                    background: 'rgba(220,38,38,0.08)',
                                    color: '#dc2626',
                                    fontWeight: 600,
                                    fontSize: '0.88rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    transition: 'all 150ms',
                                    fontFamily: 'inherit',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,38,38,0.15)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(220,38,38,0.08)'}
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
                    background: 'var(--notion-surface)',
                    border: '1px solid var(--notion-border)',
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--notion-bg-alt)' }}>
                                <th style={{ width: 4, padding: 0 }} /> {/* Status border column */}
                            <SortableHeader label="OS" sortKey="os" width={80} />
                                <SortableHeader label="Cliente" sortKey="cliente" />
                                <SortableHeader label="Placa" sortKey="placa" />
                                <SortableHeader label="Serviço" sortKey="servico" />
                                <SortableHeader label="Status" sortKey="status" />
                                <SortableHeader label="Pendência" sortKey="pendencia" />
                                <SortableHeader label="Últ. Alteração" sortKey="abertura" />
                                <th style={{
                                    width: 100,
                                    padding: '14px 16px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    color: 'var(--notion-text-secondary)',
                                    borderBottom: '1px solid var(--notion-border)',
                                }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((os, idx) => {
                                const cliente = clientes.find((c) => c.id === os.clienteId);
                                const veiculo = veiculos.find((v) => v.id === os.veiculoId);
                                const hasPrio = os.prioridade && os.prioridade !== 'normal';
                                const prioColor = os.prioridade === 'critica' ? 'var(--notion-orange)' : os.prioridade === 'urgente' ? 'var(--notion-orange)' : '';
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
                                                ? 'var(--notion-bg-alt)'
                                                : temPendenciaFinanceira
                                                    ? 'rgba(239,68,68,0.04)'
                                                    : os.pendencia
                                                        ? 'rgba(239,68,68,0.02)'
                                                        : 'transparent',
                                            transition: 'background 0.15s ease',
                                            cursor: 'pointer',
                                            animation: `oslist-fadeSlideIn 0.3s ease-out ${idx * 0.02}s both`,
                                            borderBottom: '1px solid var(--notion-border)',
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
                                                    color: 'var(--notion-text)',
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
                                            color: 'var(--notion-text)',
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
                                            color: 'var(--notion-text-secondary)',
                                            letterSpacing: '0.03em',
                                        }}>
                                            {veiculo?.placa || '—'}
                                        </td>
                                        <td data-label="Servico" style={{
                                            padding: '14px 16px',
                                            fontSize: '0.84rem',
                                            color: 'var(--notion-text-secondary)',
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
                                                        background: 'var(--notion-border)',
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
                                                            <span style={{ fontSize: 10, color: 'var(--notion-green)', display: 'block', marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>
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

                                                        const color = last.tipo === 'sifap' ? 'var(--notion-green)' : last.tipo === 'reentrada' ? 'var(--notion-orange)' : 'var(--notion-blue)';

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
                                                                color: 'var(--notion-orange)',
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
                                                        fontSize: '0.78rem', color: 'var(--notion-text-secondary)', fontStyle: 'italic',
                                                        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        display: 'block',
                                                    }} title={os.observacaoGeral}>
                                                        {os.observacaoGeral}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--notion-text-secondary)' }}>—</span>
                                                );
                                            })()}
                                        </td>
                                        <td data-label="Ult. Alteracao" style={{ padding: '14px 16px' }}>{(() => {
                                            const last = os.auditLog?.[os.auditLog.length - 1];
                                            if (!last) return <span style={{ color: 'var(--notion-text-secondary)', fontSize: '0.78rem' }}>—</span>;
                                            const dt = new Date(last.dataHora);
                                            const dateStr = dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
                                            const timeStr = dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
                                            return (
                                                <div>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--notion-text)', whiteSpace: 'nowrap' }}>{last.acao}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--notion-text-secondary)', marginTop: 2 }}>{dateStr} {timeStr}</div>
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

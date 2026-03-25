import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Plus, Search, FileText, Eye, LayoutGrid, List, AlertTriangle, Flame, X, ExternalLink } from 'lucide-react';
import { getOrdens, getClientes, getVeiculos, updateOrdem, addAuditEntry } from '../lib/storage';
import { getPaymentsTotalByOSIds } from '../lib/financeService';
import { TIPO_SERVICO_LABELS, STATUS_OS_LABELS, type StatusOS, type TipoServico } from '../types';
import type { OrdemDeServico, Cliente, Veiculo } from '../types';
import OSKanban from '../components/OSKanban';
import { LoadingSpinner } from '../components/LoadingSpinner';
import OSCreateDrawer from '../components/OSCreateDrawer';

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
    aguardando_documentacao: { pct: 20, color: 'var(--color-neutral)' },
    vistoria:                { pct: 40, color: 'var(--color-info)' },
    delegacia:               { pct: 60, color: 'var(--color-purple)' },
    doc_pronto:              { pct: 80, color: 'var(--color-warning)' },
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

export default function OSList() {
    const navigate = useNavigate();
    const location = useLocation();
    const saved = loadFiltros();
    const [search, setSearch] = useState(saved.search || '');
    const [statusFilter, setStatusFilter] = useState<StatusOS | ''>(saved.statusFilter || '');
    const [tipoFilter, setTipoFilter] = useState<TipoServico | ''>(saved.tipoFilter || '');
    const [urgentFilter, setUrgentFilter] = useState(saved.urgentFilter || false);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(saved.sortConfig || null);
    const [view, setView] = useState<'kanban' | 'list'>(saved.view || 'list');
    const [ordens, setOrdens] = useState<OrdemDeServico[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredRow, setHoveredRow] = useState<string | null>(null);
    const [paymentTotals, setPaymentTotals] = useState<Record<string, number>>({});
    const [showDrawer, setShowDrawer] = useState(false);
    const [drawerExtensionData, setDrawerExtensionData] = useState<any>(null);

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

    // Open drawer with pre-filled data when extension navigates to /ordens with extensionData
    useEffect(() => {
        const extData = (location.state as any)?.extensionData;
        if (extData) {
            setDrawerExtensionData(extData);
            setShowDrawer(true);
            // Clear the state so a refresh doesn't reopen it
            window.history.replaceState({}, '', window.location.pathname);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                        const sa = TIPO_SERVICO_LABELS[a.tipoServico] || a.tipoServico;
                        const sb = TIPO_SERVICO_LABELS[b.tipoServico] || b.tipoServico;
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
    }, [ordens, clientes, veiculos, search, statusFilter, tipoFilter, urgentFilter, sortConfig]);

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
            style={{ cursor: 'pointer', userSelect: 'none', width }} 
            onClick={() => handleSort(sortKey)}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {label}
                {sortConfig?.key === sortKey && sortConfig.direction === 'asc' && <span style={{ fontSize: 10 }}>▲</span>}
                {sortConfig?.key === sortKey && sortConfig.direction === 'desc' && <span style={{ fontSize: 10 }}>▼</span>}
                {sortConfig?.key !== sortKey && <span style={{ fontSize: 10, opacity: 0.3 }}>↕</span>}
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

    return (
        <div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '28px',
            }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.8px' }}>
                        Ordens de Serviço
                    </h1>
                    <p style={{ margin: '8px 0 0', color: 'var(--color-text-secondary)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                        {hasActiveFilters ? (
                            <>
                                <span>Mostrando <strong>{filtered.length}</strong> de <strong>{visibleBase.length}</strong> ordens</span>
                                <button
                                    onClick={resetFilters}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        fontSize: '0.8rem', color: 'var(--color-purple)',
                                        background: 'var(--color-purple-bg)', border: '1px solid rgba(139,92,246,0.2)',
                                        cursor: 'pointer', padding: '2px 8px', borderRadius: 6,
                                        fontWeight: 600, transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,92,246,0.2)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'var(--color-purple-bg)'}
                                >
                                    <X size={12} /> Limpar filtros
                                </button>
                            </>
                        ) : (
                            <span>{visibleBase.length} OS cadastrada{visibleBase.length !== 1 ? 's' : ''}</span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => setShowDrawer(true)}
                    className="btn btn-primary"
                    style={{
                        padding: '12px 24px',
                        borderRadius: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        boxShadow: '0 4px 15px rgba(255,193,7,0.3)',
                        transition: 'all 0.2s transform',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    <Plus size={20} /> Nova OS
                </button>
            </div>

            {/* Toolbar */}
            <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 16,
                padding: '16px',
                marginBottom: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ 
                        flex: 1, 
                        minWidth: 280,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                    }}>
                        <Search size={18} style={{ position: 'absolute', left: 14, color: 'var(--color-text-tertiary)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por nº, cliente ou placa..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px 12px 12px 42px',
                                background: 'var(--bg-body)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 12,
                                color: 'var(--color-text-primary)',
                                fontSize: '0.95rem',
                                outline: 'none',
                                transition: 'all 0.2s',
                            }}
                            onFocus={e => {
                                e.target.style.borderColor = 'var(--color-purple)';
                                e.target.style.boxShadow = '0 0 0 4px rgba(139,92,246,0.1)';
                            }}
                            onBlur={e => {
                                e.target.style.borderColor = 'var(--border-color)';
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', background: 'var(--bg-body)', padding: 4, borderRadius: 12, border: '1px solid var(--border-color)' }}>
                        <button
                            onClick={() => setView('kanban')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 10,
                                border: 'none',
                                background: view === 'kanban' ? 'var(--color-purple)' : 'transparent',
                                color: view === 'kanban' ? 'var(--color-white)' : 'var(--color-text-secondary)',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transition: 'all 0.2s',
                            }}
                        >
                            <LayoutGrid size={16} /> Kanban
                        </button>
                        <button
                            onClick={() => setView('list')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 10,
                                border: 'none',
                                background: view === 'list' ? 'var(--color-purple)' : 'transparent',
                                color: view === 'list' ? 'var(--color-white)' : 'var(--color-text-secondary)',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transition: 'all 0.2s',
                            }}
                        >
                            <List size={16} /> Lista
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <select
                            className="form-select"
                            style={{ 
                                width: 180, 
                                height: 44, 
                                borderRadius: 12, 
                                background: 'var(--bg-body)', 
                                border: '1px solid var(--border-color)',
                                padding: '0 12px',
                                fontSize: '0.85rem',
                                fontWeight: 600
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
                                width: 180, 
                                height: 44, 
                                borderRadius: 12, 
                                background: 'var(--bg-body)', 
                                border: '1px solid var(--border-color)',
                                padding: '0 12px',
                                fontSize: '0.85rem',
                                fontWeight: 600
                            }}
                            value={tipoFilter}
                            onChange={(e) => setTipoFilter(e.target.value as TipoServico | '')}
                        >
                            <option value="">Serviço: Todos</option>
                            {Object.entries(TIPO_SERVICO_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Status Chips Row */}
                <div style={{ 
                    display: 'flex', 
                    gap: '8px', 
                    flexWrap: 'wrap', 
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: '16px',
                    alignItems: 'center'
                }}>
                    {([
                        { key: '', label: 'Todas', count: visibleBase.length, color: 'var(--color-purple)' },
                        { key: '__urgentes__', label: 'Pendentes', count: statusCounts['pendentes'], color: 'var(--color-danger)' },
                        { key: 'aguardando_documentacao', label: 'Aguardando Doc', count: statusCounts['aguardando_documentacao'], color: STATUS_CHIP_COLOR['aguardando_documentacao'] },
                        { key: 'vistoria', label: 'Vistoria', count: statusCounts['vistoria'], color: STATUS_CHIP_COLOR['vistoria'] },
                        { key: 'delegacia', label: 'Delegacia', count: statusCounts['delegacia'], color: STATUS_CHIP_COLOR['delegacia'] },
                        { key: 'doc_pronto', label: 'Prontas', count: statusCounts['doc_pronto'], color: STATUS_CHIP_COLOR['doc_pronto'] },
                        { key: 'entregue', label: 'Entregues', count: statusCounts['entregue'], color: STATUS_CHIP_COLOR['entregue'] },
                    ] as { key: string; label: string; count: number; color: string }[]).map((chip) => {
                        const isUrgentChip = chip.key === '__urgentes__';
                        const isActive = isUrgentChip ? urgentFilter : statusFilter === chip.key;
                        const handleChipClick = () => {
                            if (isUrgentChip) {
                                setUrgentFilter(!urgentFilter);
                                setStatusFilter('');
                            } else {
                                setUrgentFilter(false);
                                setStatusFilter(isActive ? '' : chip.key as StatusOS | '');
                            }
                        };
                        
                        return (
                            <button
                                key={chip.key}
                                onClick={handleChipClick}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 8,
                                    padding: '6px 14px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 700,
                                    cursor: chip.count === 0 ? 'default' : 'pointer',
                                    border: 'none',
                                    background: isActive ? chip.color : 'rgba(255,255,255,0.03)',
                                    color: isActive ? '#fff' : chip.count === 0 ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                                    opacity: chip.count === 0 ? 0.4 : 1,
                                    transition: 'all 0.2s',
                                    boxShadow: isActive ? `0 4px 12px ${chip.color}44` : 'none',
                                }}
                                onMouseEnter={e => {
                                    if (!isActive && chip.count > 0) {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                        e.currentTarget.style.color = 'var(--color-text-primary)';
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!isActive && chip.count > 0) {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                        e.currentTarget.style.color = 'var(--color-text-secondary)';
                                    }
                                }}
                            >
                                {isUrgentChip && <div style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? 'var(--color-white)' : 'var(--color-danger)' }} />}
                                {chip.label}
                                <span style={{
                                    background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                                    borderRadius: 6, padding: '1px 6px', fontSize: '0.75rem',
                                    color: isActive ? 'var(--color-white)' : 'inherit'
                                }}>
                                    {chip.count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <FileText />
                        {visibleBase.length === 0 ? (
                            <>
                                <h3>Nenhuma OS cadastrada</h3>
                                <p>Comece criando a primeira Ordem de Serviço.</p>
                                <Link to="/ordens/nova" className="btn btn-primary">
                                    <Plus size={16} /> Criar primeira OS
                                </Link>
                            </>
                        ) : (
                            <>
                                <h3>Nenhuma OS encontrada para este filtro</h3>
                                <p>Tente remover ou ajustar os filtros aplicados.</p>
                                <button className="btn btn-secondary" onClick={resetFilters}>
                                    <X size={16} /> Limpar filtros
                                </button>
                            </>
                        )}
                    </div>
                </div>
            ) : view === 'kanban' ? (
                <OSKanban
                    ordens={filtered}
                    clientes={clientes}
                    veiculos={veiculos}
                    onStatusChange={handleStatusChange}
                />
            ) : (
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <SortableHeader label="OS" sortKey="os" width={80} />
                                <SortableHeader label="Cliente" sortKey="cliente" />
                                <SortableHeader label="Placa" sortKey="placa" />
                                <SortableHeader label="Serviço" sortKey="servico" />
                                <SortableHeader label="Status" sortKey="status" />
                                <SortableHeader label="Pendência" sortKey="pendencia" />
                                <SortableHeader label="Últ. Alteração" sortKey="abertura" />
                                <th style={{ width: 100 }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((os) => {
                                const cliente = clientes.find((c) => c.id === os.clienteId);
                                const veiculo = veiculos.find((v) => v.id === os.veiculoId);
                                const hasPrio = os.prioridade && os.prioridade !== 'normal';
                                const prioColor = os.prioridade === 'critica' ? 'var(--color-danger)' : os.prioridade === 'urgente' ? 'var(--color-warning)' : '';
                                const valorServico = os.valorServico ?? 0;
                                const totalPago = paymentTotals[os.id] ?? 0;
                                const temPendenciaFinanceira = os.status !== 'entregue' && valorServico > 0 && totalPago === 0;
                                const progress = STATUS_PROGRESS[os.status];
                                const isHovered = hoveredRow === os.id;
                                return (
                                    <tr
                                        key={os.id}
                                        className="clickable"
                                        onClick={() => navigate(`/ordens/${os.id}`)}
                                        onMouseEnter={() => setHoveredRow(os.id)}
                                        onMouseLeave={() => setHoveredRow(null)}
                                        style={{
                                            borderLeft: hasPrio ? `4px solid ${prioColor}` : temPendenciaFinanceira ? '4px solid var(--color-danger)' : undefined,
                                            background: temPendenciaFinanceira ? 'rgba(239,68,68,0.06)' : os.pendencia ? 'rgba(239,68,68,0.03)' : undefined,
                                            position: 'relative',
                                        }}
                                    >
                                        <td data-label="OS">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <strong>#{os.numero}</strong>
                                                {hasPrio && (
                                                    <span title={os.prioridade === 'critica' ? 'Crítica' : 'Urgente'}>
                                                        {os.prioridade === 'critica'
                                                            ? <Flame size={12} style={{ color: 'var(--color-danger)' }} />
                                                            : <AlertTriangle size={12} style={{ color: 'var(--color-warning)' }} />}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td data-label="Cliente">{cliente?.nome || '—'}</td>
                                        <td data-label="Placa">{veiculo?.placa || '—'}</td>
                                        <td data-label="Serviço">{TIPO_SERVICO_LABELS[os.tipoServico]}</td>
                                        <td data-label="Status">
                                            <span className={`badge ${getStatusBadge(os.status)}`}>
                                                {STATUS_OS_LABELS[os.status]}
                                            </span>
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
                                        </td>
                                        <td data-label="Pendência">
                                            {(() => {
                                                let pendenciasStr = os.pendencia ? [os.pendencia] : [];
                                                if (temPendenciaFinanceira) pendenciasStr.push('Sem pagamento');

                                                // Recibo vencido é exibido apenas dentro da OS (card Recibo)

                                                const hasPendencias = pendenciasStr.length > 0;

                                                return hasPendencias ? (
                                                    <div style={{
                                                        display: 'flex', flexDirection: 'column', gap: 2,
                                                        maxWidth: 180,
                                                    }}>
                                                        {pendenciasStr.map((p, i) => (
                                                            <span key={i} style={{
                                                                fontSize: 11, fontWeight: 700, color: 'var(--color-danger)',
                                                                display: 'flex', alignItems: 'center', gap: 4,
                                                            }}>
                                                                <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                                                                {p}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : os.observacaoGeral ? (
                                                    <span style={{
                                                        fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic',
                                                        maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        display: 'block',
                                                    }} title={os.observacaoGeral}>
                                                        {os.observacaoGeral}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>—</span>
                                                );
                                            })()}
                                        </td>
                                        <td data-label="Últ. Alteração">{(() => {
                                            const last = os.auditLog?.[os.auditLog.length - 1];
                                            if (!last) return <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>—</span>;
                                            const dt = new Date(last.dataHora);
                                            const dateStr = dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
                                            const timeStr = dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
                                            return (
                                                <div>
                                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>{last.acao}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{dateStr} {timeStr}</div>
                                                </div>
                                            );
                                        })()}</td>
                                        <td data-label="Ações">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Link
                                                    to={`/ordens/${os.id}`}
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={(e) => e.stopPropagation()}
                                                    title="Ver OS"
                                                    style={{
                                                        opacity: isHovered ? 1 : 0.3,
                                                        transition: 'opacity 0.2s ease',
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
                                                            display: 'flex', alignItems: 'center', gap: 3,
                                                            padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                                            background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                                                            color: '#fff', fontWeight: 700, fontSize: 10,
                                                            fontFamily: 'var(--font-family)',
                                                            boxShadow: '0 1px 4px rgba(59,130,246,0.3)',
                                                            opacity: isHovered ? 1 : 0.5,
                                                            transition: 'opacity 0.2s ease',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        <ExternalLink size={10} /> CRLV
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

            <OSCreateDrawer
                open={showDrawer}
                onClose={() => { setShowDrawer(false); setDrawerExtensionData(null); }}
                onCreated={(osId) => {
                    setShowDrawer(false);
                    setDrawerExtensionData(null);
                    loadData(true);
                    navigate(`/ordens/${osId}`);
                }}
                initialExtensionData={drawerExtensionData}
            />
        </div>
    );
}

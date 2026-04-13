import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Users,
    Car,
    FileText,
    CheckCircle,
    AlertCircle,
    Plus,
    ArrowRight,
    TrendingUp,
    Calendar,
    Activity,
    AlertTriangle,
    X,
    MapPin,
    Building2,
    Settings,
    Clock,
    Bell,
} from 'lucide-react';
import {
    PieChart,
    Pie,
    Cell,
    Tooltip as RechartsTooltip,
    Legend,
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    BarChart,
    Bar,
} from 'recharts';
import { getClientes, getVeiculos, getOrdens } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { STATUS_OS_LABELS } from '../types';
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
import type { Cliente, Veiculo, OrdemDeServico } from '../types';

// ── Alert config persisted to localStorage ──────────────────
const ALERTS_CONFIG_KEY = 'dashboard_alerts_config';
interface AlertsConfig {
    prazoVencido: boolean;
    criticaComPendencia: boolean;
    vistoriasProximas: boolean;
}
function loadAlertsConfig(): AlertsConfig {
    try {
        const raw = localStorage.getItem(ALERTS_CONFIG_KEY);
        if (raw) return { prazoVencido: true, criticaComPendencia: true, vistoriasProximas: true, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { prazoVencido: true, criticaComPendencia: true, vistoriasProximas: true };
}

const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
    aguardando_documentacao: { color: 'var(--notion-orange)', bg: 'rgba(221,91,0,0.1)' },
    vistoria: { color: 'var(--notion-blue)', bg: 'rgba(55,114,255,0.1)' },
    delegacia: { color: 'var(--notion-purple, #9065B0)', bg: 'rgba(139,92,246,0.1)' },
    doc_pronto: { color: 'var(--notion-green)', bg: 'rgba(5,150,105,0.1)' },
    entregue: { color: 'var(--notion-text-secondary)', bg: 'rgba(107,114,128,0.1)' },
};

export default function Dashboard() {
    const navigate = useNavigate();
    const { usuario } = useAuth();
    const serviceLabels = useServiceLabels();
    const isAdmin = usuario?.role === 'admin' || usuario?.role === 'gerente';
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
    const [ordens, setOrdens] = useState<OrdemDeServico[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredCard, setHoveredCard] = useState<string | null>(null);
    const [hoveredOS, setHoveredOS] = useState<string | null>(null);
    const [hoveredQuickAction, setHoveredQuickAction] = useState<string | null>(null);
    const [bannerDismissed, setBannerDismissed] = useState(false);
    const [criticalFilterActive, setCriticalFilterActive] = useState(false);
    const [alertsConfig, setAlertsConfig] = useState<AlertsConfig>(loadAlertsConfig);
    const [alertsMenuOpen, setAlertsMenuOpen] = useState(false);
    const alertsMenuRef = useRef<HTMLDivElement>(null);

    const loadData = async (silently = false) => {
        if (!silently) setLoading(true);
        try {
            const [c, v, o] = await Promise.all([
                getClientes(),
                getVeiculos(),
                getOrdens(),
            ]);
            setClientes(c);
            setVeiculos(v);
            setOrdens(o);
        } catch (err) {
            console.error('Erro ao carregar dados do dashboard:', err);
        } finally {
            if (!silently) setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const onFocus = () => loadData(true);
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    const concluidos = ordens.filter((o) => o.status === 'entregue').length;
    const aguardandoDocs = ordens.filter((o) => o.status === 'aguardando_documentacao').length;
    const emVistoria = ordens.filter((o) => o.vistoria?.status === 'agendada').length;
    const emDelegacia = ordens.filter((o) => o.status === 'delegacia').length;

    // OS críticas: prioridade === 'critica' ou com pendência registrada
    const ordensCriticas = ordens.filter(
        (o) => o.prioridade === 'critica' || (o.pendencia && o.pendencia.trim() !== '')
    );
    const showCriticalBanner = !bannerDismissed && ordensCriticas.length > 0;

    // Próximas vistorias: agendadas nos próximos 7 dias
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const em7Dias = new Date(hoje);
    em7Dias.setDate(hoje.getDate() + 7);

    const proximasVistorias = ordens
        .filter((o) => {
            if (o.vistoria?.status !== 'agendada') return false;
            if (!o.vistoria.dataAgendamento) return false;
            const d = new Date(o.vistoria.dataAgendamento + 'T12:00:00');
            d.setHours(0, 0, 0, 0);
            return d >= hoje && d <= em7Dias;
        })
        .sort((a, b) => {
            const da = new Date(a.vistoria!.dataAgendamento!).getTime();
            const db = new Date(b.vistoria!.dataAgendamento!).getTime();
            return da - db;
        })
        .slice(0, 5);

    function urgenciaBadge(dataAgendamento: string): { label: string; color: string; bg: string } {
        const d = new Date(dataAgendamento + 'T12:00:00');
        d.setHours(0, 0, 0, 0);
        const diffDays = Math.round((d.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return { label: 'Hoje', color: 'var(--notion-orange)', bg: 'rgba(221,91,0,0.1)' };
        if (diffDays === 1) return { label: 'Amanhã', color: 'var(--notion-orange)', bg: 'rgba(235,87,87,0.1)' };
        return { label: `em ${diffDays}d`, color: 'var(--notion-blue)', bg: 'rgba(55,114,255,0.1)' };
    }

    // Agenda do dia: todas as vistorias para hoje, qualquer status
    const agendaHoje = ordens
        .filter((o) => {
            if (!o.vistoria?.dataAgendamento) return false;
            const d = new Date(o.vistoria.dataAgendamento + 'T12:00:00');
            d.setHours(0, 0, 0, 0);
            return d.getTime() === hoje.getTime();
        })
        .sort((a, b) => {
            const ha = a.vistoria!.horaAgendamento || '99:99';
            const hb = b.vistoria!.horaAgendamento || '99:99';
            return ha.localeCompare(hb);
        });

    const recentOrdens = [...ordens]
        .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
        .slice(0, 8);

    // Aplica filtro crítico quando ativado pelo banner
    const displayedOrdens = criticalFilterActive
        ? recentOrdens.filter((o) => ordensCriticas.some((c) => c.id === o.id))
        : recentOrdens;

    // Contagem por status para mini gráfico
    const statusCounts = ordens.reduce((acc, os) => {
        acc[os.status] = (acc[os.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    // ── KPI Financeiro ──────────────────────────────────────────
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const receitaMes = ordens
        .filter((o) => {
            if (o.status !== 'entregue') return false;
            const d = new Date(o.entregueEm || o.atualizadoEm || o.criadoEm);
            return d >= inicioMes;
        })
        .reduce((s, o) => s + (o.valorServico || 0), 0);

    const pendenteMes = ordens
        .filter((o) => o.status !== 'entregue')
        .reduce((s, o) => s + (o.valorServico || 0), 0);

    const osAtivas = ordens.filter((o) => o.status !== 'entregue').length;
    const osCriticas = ordens.filter(
        (o) => o.prioridade === 'critica' || (o.pendencia && o.pendencia.trim() !== '')
    ).length;

    // ── Pie Chart: OS por Status ─────────────────────────────────
    const PIE_COLORS: Record<string, string> = {
        aguardando_documentacao: 'var(--notion-blue)',
        vistoria: '#06b6d4',
        delegacia: '#6366f1',
        doc_pronto: '#22c55e',
        entregue: '#6b7280',
    };
    const pieData = Object.entries(statusCounts)
        .filter(([, v]) => v > 0)
        .map(([status, count]) => ({
            name: STATUS_OS_LABELS[status as keyof typeof STATUS_OS_LABELS] || status,
            value: count,
            fill: PIE_COLORS[status] || '#8b8e9e',
        }));

    // ── Area Chart: Receita últimos 6 meses ──────────────────────
    const areaData = (() => {
        const months: { label: string; key: string; value: number }[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('pt-BR', { month: 'short' });
            months.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1).replace('.', ''), value: 0 });
        }
        for (const o of ordens) {
            if (o.status !== 'entregue') continue;
            const ref = o.entregueEm || o.atualizadoEm || o.criadoEm;
            const d = new Date(ref);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const month = months.find((m) => m.key === key);
            if (month) month.value += o.valorServico || 0;
        }
        return months.map(({ label, value }) => ({ mes: label, receita: value }));
    })();

    // ── Bar Chart: OS por tipo de serviço (top 7) ────────────────
    const barData = (() => {
        const counts: Record<string, number> = {};
        for (const o of ordens) {
            if (o.status === 'entregue') continue; // só ativas
            const label = serviceLabels[o.tipoServico]
                ?? o.tipoServico.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            counts[label] = (counts[label] || 0) + 1;
        }
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 7)
            .map(([name, value]) => ({ name, value }));
    })();

    // ── Alertas ──────────────────────────────────────────────────
    const em3Dias = new Date(hoje);
    em3Dias.setDate(hoje.getDate() + 3);

    const alertasPrazoVencido = ordens.filter((o) => {
        const prazo = o.vistoria?.prazoReagendamento;
        if (!prazo) return false;
        return new Date(prazo) < hoje;
    });
    const alertasCriticasPendencia = ordens.filter(
        (o) => o.prioridade === 'critica' && o.pendencia && o.pendencia.trim() !== ''
    );
    const alertasVistoriasProximas = ordens.filter((o) => {
        if (o.vistoria?.status !== 'agendada') return false;
        const dataStr = o.vistoria.dataAgendamento;
        if (!dataStr) return false;
        const d = new Date(dataStr + 'T12:00:00');
        d.setHours(0, 0, 0, 0);
        return d >= hoje && d <= em3Dias;
    });

    function toggleAlertConfig(key: keyof AlertsConfig) {
        setAlertsConfig((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            localStorage.setItem(ALERTS_CONFIG_KEY, JSON.stringify(next));
            return next;
        });
    }

    // Close alerts menu on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (alertsMenuRef.current && !alertsMenuRef.current.contains(e.target as Node)) {
                setAlertsMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center' }}>
                    <Activity size={32} style={{ color: 'var(--notion-blue)', marginBottom: 12, animation: 'pulse 1.5s infinite' }} />
                    <p style={{ color: 'var(--notion-text-secondary)' }}>Carregando dashboard...</p>
                </div>
            </div>
        );
    }

    const statCards = [
        { key: 'clientes', icon: Users, value: clientes.length, label: 'Clientes', color: 'var(--notion-blue)', bg: 'rgba(55,114,255,0.1)', link: '/clientes' },
        { key: 'veiculos', icon: Car, value: veiculos.length, label: 'Veículos', color: 'var(--notion-purple, #9065B0)', bg: 'rgba(139,92,246,0.1)', link: '/veiculos' },
        { key: 'vistoria', icon: Calendar, value: emVistoria, label: 'Em Vistoria', color: 'var(--notion-green)', bg: 'rgba(6,182,212,0.1)', link: '/calendario-vistorias' },
        { key: 'delegacia', icon: MapPin, value: emDelegacia, label: 'Delegacia', color: 'var(--notion-purple, #9065B0)', bg: 'rgba(139,92,246,0.1)', link: '/ordens' },
        { key: 'concluidos', icon: CheckCircle, value: concluidos, label: 'Concluídos', color: 'var(--notion-green)', bg: 'rgba(5,150,105,0.1)', link: '/ordens' },
        { key: 'docs', icon: AlertCircle, value: aguardandoDocs, label: 'Aguardando Docs', color: 'var(--notion-orange)', bg: 'rgba(221,91,0,0.1)', link: '/ordens' },
    ];

    // Botões compactos do topo (ações rápidas visíveis sem scroll)
    const topQuickActions = [
        { key: 'nova-os', label: 'Nova OS', icon: FileText, path: '/ordens', color: 'var(--notion-orange)', bg: 'rgba(221,91,0,0.1)' },
        { key: 'novo-cliente', label: 'Novo Cliente', icon: Users, path: '/clientes/novo', color: 'var(--notion-blue)', bg: 'rgba(55,114,255,0.1)' },
        { key: 'novo-veiculo', label: 'Novo Veículo', icon: Car, path: '/veiculos/novo', color: 'var(--notion-purple, #9065B0)', bg: 'rgba(139,92,246,0.1)' },
        { key: 'ver-agenda', label: 'Ver Agenda', icon: Calendar, path: '/calendario-vistorias', color: 'var(--notion-green)', bg: 'rgba(5,150,105,0.1)' },
    ];

    return (
        <div style={{ paddingBottom: 'var(--space-8)' }}>
            {/* Header */}
            <div style={{ marginBottom: 'var(--space-8)' }}>
                <p style={{ margin: 0, color: 'var(--notion-text-secondary)', fontSize: '0.95rem' }}>
                    {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })}
                </p>
            </div>

            {/* Ações Rápidas — grid compacto no topo */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: 12,
                marginBottom: 'var(--space-8)',
            }}>
                {topQuickActions.map((action) => {
                    const isHoveredAction = hoveredQuickAction === action.key;
                    return (
                        <button
                            key={action.key}
                            onClick={() => navigate(action.path)}
                            onMouseEnter={() => setHoveredQuickAction(action.key)}
                            onMouseLeave={() => setHoveredQuickAction(null)}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                padding: '12px',
                                background: action.bg,
                                border: `1px solid ${action.color}33`,
                                borderRadius: 12,
                                cursor: 'pointer',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                transform: isHoveredAction ? 'translateY(-2px)' : 'translateY(0)',
                                boxShadow: isHoveredAction
                                    ? `0 8px 20px ${action.color}22`
                                    : '0 2px 6px rgba(0,0,0,0.06)',
                                outline: 'none',
                            }}
                        >
                            <action.icon size={18} style={{ color: action.color, flexShrink: 0 }} />
                            <span style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--notion-text)',
                                whiteSpace: 'nowrap',
                                lineHeight: 1,
                            }}>
                                {action.label}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Banner de alertas — OS críticas */}
            {showCriticalBanner && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    marginBottom: 'var(--space-8)',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 12,
                }}>
                    <AlertTriangle size={18} style={{ color: 'var(--notion-orange)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: 'var(--notion-orange)' }}>
                        {ordensCriticas.length} OS com prioridade crítica ou pendência registrada
                    </span>
                    <button
                        onClick={() => {
                            setCriticalFilterActive((prev) => !prev);
                        }}
                        style={{
                            padding: '5px 12px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: 'var(--notion-orange)',
                            background: 'rgba(221,91,0,0.08)',
                            border: '1px solid rgba(221,91,0,0.2)',
                            borderRadius: 8,
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {criticalFilterActive ? 'Ver todas' : 'Ver'}
                    </button>
                    <button
                        onClick={() => setBannerDismissed(true)}
                        aria-label="Dispensar alerta"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 4,
                            display: 'flex',
                            alignItems: 'center',
                            color: 'var(--notion-orange)',
                            opacity: 0.7,
                            flexShrink: 0,
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* ── KPI Financeiro ── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 16,
                marginBottom: 'var(--space-8)',
            }}>
                {[
                    ...(isAdmin ? [
                        {
                            key: 'receita',
                            label: 'Receita do mês',
                            value: receitaMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                            color: '#22c55e',
                            bg: 'rgba(34,197,94,0.1)',
                        },
                        {
                            key: 'pendente',
                            label: 'Pendente a receber',
                            value: pendenteMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                            color: 'var(--notion-blue)',
                            bg: 'rgba(245,158,11,0.1)',
                        },
                    ] : []),
                    {
                        key: 'ativas',
                        label: 'OS ativas',
                        value: String(osAtivas),
                        color: '#06b6d4',
                        bg: 'rgba(6,182,212,0.1)',
                    },
                    {
                        key: 'criticas',
                        label: 'OS críticas',
                        value: String(osCriticas),
                        color: '#ef4444',
                        bg: 'rgba(239,68,68,0.1)',
                    },
                ].map((kpi) => (
                    <div key={kpi.key} style={{
                        background: 'var(--notion-surface)',
                        border: `1px solid var(--notion-border)`,
                        borderLeft: `4px solid ${kpi.color}`,
                        borderRadius: 12,
                        padding: '18px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--notion-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {kpi.label}
                            </span>
                            <TrendingUp size={14} style={{ color: kpi.color, opacity: 0.7 }} />
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: kpi.color, lineHeight: 1, letterSpacing: '-0.5px' }}>
                            {kpi.value}
                        </div>
                    </div>
                ))}
            </div>

            {/* Stat Cards - Enhanced */}
            <div className="dashboard-stat-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: 'var(--space-8)',
            }}>
                {statCards.map((s) => (
                    <div
                        key={s.key}
                        role="button"
                        tabIndex={0}
                        aria-label={`Ver ${s.label}: ${s.value}`}
                        onClick={() => navigate(s.link)}
                        onKeyDown={(e) => e.key === 'Enter' && navigate(s.link)}
                        onMouseEnter={() => setHoveredCard(s.key)}
                        onMouseLeave={() => setHoveredCard(null)}
                        style={{
                            background: `linear-gradient(135deg, ${s.bg}, ${s.bg.replace('0.1)', '0.05)')})`,
                            borderRadius: 16,
                            padding: '24px 20px',
                            cursor: 'pointer',
                            border: `2px solid ${s.color}33`,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            transform: hoveredCard === s.key ? 'translateY(-8px) scale(1.02)' : 'translateY(0)',
                            boxShadow: hoveredCard === s.key ? `0 20px 40px ${s.bg}` : `0 4px 12px ${s.bg}33`,
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Background accent */}
                        <div style={{
                            position: 'absolute',
                            top: -20,
                            right: -20,
                            width: 100,
                            height: 100,
                            borderRadius: '50%',
                            background: s.color,
                            opacity: 0.05,
                        }} />

                        {/* Ícone contextual decorativo no canto superior direito */}
                        <div style={{
                            position: 'absolute',
                            top: 14,
                            right: 14,
                            zIndex: 1,
                            opacity: 0.2,
                            pointerEvents: 'none',
                        }}>
                            <s.icon size={24} style={{ color: s.color }} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, position: 'relative', zIndex: 1 }}>
                            <div style={{
                                width: 48,
                                height: 48,
                                borderRadius: 12,
                                background: s.bg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: `2px solid ${s.color}44`,
                            }}>
                                <s.icon size={24} style={{ color: s.color, fontWeight: 700 }} />
                            </div>
                            <span style={{ fontSize: '0.85rem', color: 'var(--notion-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {s.label}
                            </span>
                        </div>
                        <div style={{ fontSize: '2.2rem', fontWeight: 800, color: s.color, lineHeight: 1, position: 'relative', zIndex: 1, letterSpacing: '-1px' }}>
                            {s.value}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Gráficos ── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 20,
                marginBottom: 'var(--space-8)',
            }}>
                {/* Pie Chart: OS por Status */}
                <div style={{
                    background: 'var(--notion-surface)',
                    border: '1px solid var(--notion-border)',
                    borderRadius: 16,
                    padding: '20px 16px',
                    boxShadow: 'var(--shadow-card)',
                }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                        OS por Status
                    </h3>
                    {pieData.length === 0 ? (
                        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--notion-text-secondary)', fontSize: '0.85rem' }}>
                            Nenhuma OS cadastrada
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={46}
                                    outerRadius={74}
                                    dataKey="value"
                                    paddingAngle={3}
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <RechartsTooltip
                                    contentStyle={{
                                        background: 'var(--notion-surface)',
                                        border: '1px solid var(--notion-border)',
                                        borderRadius: 8,
                                        color: 'var(--notion-text)',
                                        fontSize: '0.8rem',
                                    }}
                                />
                                <Legend
                                    iconSize={9}
                                    iconType="circle"
                                    formatter={(value) => (
                                        <span style={{ color: 'var(--notion-text-secondary)', fontSize: '0.72rem' }}>{value}</span>
                                    )}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Bar Chart: OS Ativas por Serviço */}
                <div style={{
                    background: 'var(--notion-surface)',
                    border: '1px solid var(--notion-border)',
                    borderRadius: 16,
                    padding: '20px 16px',
                    boxShadow: 'var(--shadow-card)',
                }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                        OS Ativas por Serviço
                    </h3>
                    {barData.length === 0 ? (
                        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--notion-text-secondary)', fontSize: '0.85rem' }}>
                            Nenhuma OS ativa
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={barData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barSize={18}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--notion-border)" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fill: 'var(--notion-text-secondary)', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                    tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + '…' : v}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fill: 'var(--notion-text-secondary)', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <RechartsTooltip
                                    contentStyle={{
                                        background: 'var(--notion-surface)',
                                        border: '1px solid var(--notion-border)',
                                        borderRadius: 8,
                                        color: 'var(--notion-text)',
                                        fontSize: '0.8rem',
                                    }}
                                    formatter={(value) => [value, 'OS ativas']}
                                />
                                <Bar
                                    dataKey="value"
                                    fill="var(--notion-blue)"
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Area Chart: Receita por Período — visível só para admin/gerente */}
                {isAdmin && (
                    <div style={{
                        background: 'var(--notion-surface)',
                        border: '1px solid var(--notion-border)',
                        borderRadius: 16,
                        padding: '20px 16px',
                        boxShadow: 'var(--shadow-card)',
                    }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                            Receita por Período
                        </h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <AreaChart data={areaData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="receitaGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--notion-border)" />
                                <XAxis
                                    dataKey="mes"
                                    tick={{ fill: 'var(--notion-text-secondary)', fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fill: 'var(--notion-text-secondary)', fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v) => v === 0 ? '0' : `R$${(v / 1000).toFixed(0)}k`}
                                />
                                <RechartsTooltip
                                    contentStyle={{
                                        background: 'var(--notion-surface)',
                                        border: '1px solid var(--notion-border)',
                                        borderRadius: 8,
                                        color: 'var(--notion-text)',
                                        fontSize: '0.8rem',
                                    }}
                                    formatter={(value) => [typeof value === 'number' ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : value, 'Receita']}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="receita"
                                    stroke="#22c55e"
                                    strokeWidth={2}
                                    fill="url(#receitaGradient)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Main Content Grid */}
            <div className="dashboard-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 320px',
                gap: '24px',
                alignItems: 'start',
            }}>
                {/* Recent OS - Modern Card Grid */}
                <div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 20,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 40,
                                height: 40,
                                borderRadius: 10,
                                background: 'rgba(255,193,7,0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <TrendingUp size={20} style={{ color: 'var(--notion-blue)' }} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                                    Processos Recentes
                                </h3>
                                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--notion-text-secondary)' }}>
                                    {criticalFilterActive
                                        ? `${displayedOrdens.length} OS crítica${displayedOrdens.length !== 1 ? 's' : ''}`
                                        : `${displayedOrdens.length} ordem${displayedOrdens.length !== 1 ? 's' : ''} de serviço`
                                    }
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/ordens"
                            style={{
                                color: 'var(--notion-blue)',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '8px 12px',
                                borderRadius: 8,
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(255,193,7,0.1)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            Ver todos <ArrowRight size={16} />
                        </Link>
                    </div>

                    {displayedOrdens.length === 0 ? (
                        <div style={{
                            background: 'var(--notion-surface)',
                            border: '2px dashed var(--notion-border)',
                            borderRadius: 16,
                            padding: '60px 20px',
                            textAlign: 'center',
                        }}>
                            <FileText
                                size={56}
                                style={{ color: 'var(--notion-text-secondary)', opacity: 0.4, marginBottom: 16, display: 'block', margin: '0 auto 16px' }}
                            />
                            <h3 style={{ margin: '0 0 8px', color: 'var(--notion-text)', fontSize: '1.1rem', fontWeight: 700 }}>
                                Nenhuma OS cadastrada ainda
                            </h3>
                            <p style={{ color: 'var(--notion-text-secondary)', fontSize: '0.9rem', margin: '0 0 20px' }}>
                                Crie a primeira OS para começar
                            </p>
                            <Link
                                to="/ordens"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '10px 20px',
                                    background: 'linear-gradient(135deg, var(--notion-blue), var(--notion-blue))',
                                    color: 'var(--notion-bg)',
                                    borderRadius: 10,
                                    textDecoration: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    boxShadow: '0 4px 12px rgba(255,193,7,0.3)',
                                }}
                            >
                                <Plus size={18} /> Criar OS
                            </Link>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                            {displayedOrdens.map((os) => {
                                const cliente = clientes.find((c) => c.id === os.clienteId);
                                const sc = STATUS_CONFIG[os.status] || { color: 'var(--notion-text-secondary)', bg: 'rgba(107,114,128,0.1)' };
                                const isHovered = hoveredOS === os.id;

                                return (
                                    <div
                                        key={os.id}
                                        onClick={() => navigate(`/ordens/${os.id}`)}
                                        onMouseEnter={() => setHoveredOS(os.id)}
                                        onMouseLeave={() => setHoveredOS(null)}
                                        style={{
                                            background: 'var(--notion-surface)',
                                            border: `2px solid ${isHovered ? sc.color : 'var(--notion-border)'}`,
                                            borderLeft: `5px solid ${sc.color}`,
                                            borderRadius: 14,
                                            padding: '18px 16px',
                                            cursor: 'pointer',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            transform: isHovered ? 'translateY(-6px)' : 'translateY(0)',
                                            boxShadow: isHovered ? `0 16px 32px ${sc.bg}` : '0 2px 8px rgba(0,0,0,0.08)',
                                            position: 'relative',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        {/* Background accent */}
                                        <div style={{
                                            position: 'absolute',
                                            top: -10,
                                            right: -10,
                                            width: 80,
                                            height: 80,
                                            borderRadius: '50%',
                                            background: sc.color,
                                            opacity: 0.04,
                                        }} />

                                        {/* OS Number Badge */}
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            minWidth: 60,
                                            height: 32,
                                            borderRadius: 10,
                                            background: sc.bg,
                                            padding: '4px 10px',
                                            fontWeight: 800,
                                            fontSize: '0.85rem',
                                            color: sc.color,
                                            marginBottom: 12,
                                            position: 'relative',
                                            zIndex: 1,
                                        }}>
                                            <FileText size={14} /> #{os.numero}
                                        </div>

                                        {/* Info */}
                                        <div style={{ position: 'relative', zIndex: 1 }}>
                                            <div style={{
                                                fontSize: '1rem',
                                                fontWeight: 700,
                                                color: 'var(--notion-text)',
                                                marginBottom: 6,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}>
                                                {cliente?.nome || '—'}
                                            </div>
                                            <div style={{
                                                fontSize: '0.8rem',
                                                color: 'var(--notion-text-secondary)',
                                                marginBottom: 12,
                                            }}>
                                                {getServicoLabel(serviceLabels, os.tipoServico)}
                                            </div>
                                        </div>

                                        {/* Status Badge */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            position: 'relative',
                                            zIndex: 1,
                                        }}>
                                            <span style={{
                                                padding: '5px 11px',
                                                borderRadius: 8,
                                                background: sc.bg,
                                                color: sc.color,
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.03em',
                                            }}>
                                                {STATUS_OS_LABELS[os.status]}
                                            </span>

                                            {/* Date */}
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--notion-text-secondary)',
                                                fontWeight: 500,
                                            }}>
                                                {new Date(os.dataAbertura).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right Sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 20 }}>
                    {/* Proximas Vistorias — exibe apenas se houver agendamentos nos próximos 7 dias */}
                    {proximasVistorias.length > 0 && (
                        <div style={{
                            background: 'var(--notion-surface)',
                            borderRadius: 16,
                            border: '1px solid var(--notion-border)',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                padding: '18px 20px',
                                borderBottom: '1px solid var(--notion-border)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                            }}>
                                <div style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    background: 'rgba(6,182,212,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    <Calendar size={18} style={{ color: 'var(--notion-green)' }} />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--notion-text)', flex: 1 }}>
                                    Próximas Vistorias
                                </h3>
                                <span style={{ fontSize: '0.75rem', color: 'var(--notion-text-secondary)', fontWeight: 600 }}>
                                    {proximasVistorias.length}
                                </span>
                            </div>
                            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {proximasVistorias.map((os) => {
                                    const veiculo = veiculos.find((v) => v.id === os.veiculoId);
                                    const urg = urgenciaBadge(os.vistoria!.dataAgendamento!);
                                    const dataFormatada = new Date(os.vistoria!.dataAgendamento! + 'T12:00:00').toLocaleDateString('pt-BR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        timeZone: 'America/Sao_Paulo',
                                    });
                                    return (
                                        <div
                                            key={os.id}
                                            onClick={() => navigate(`/ordens/${os.id}`)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                                padding: '10px 12px',
                                                borderRadius: 10,
                                                background: 'var(--notion-bg-alt)',
                                                border: '1px solid var(--notion-border)',
                                                cursor: 'pointer',
                                                transition: 'border-color 0.15s',
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.borderColor = urg.color;
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.borderColor = 'var(--notion-border)';
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: '0.82rem',
                                                    fontWeight: 700,
                                                    color: 'var(--notion-text)',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}>
                                                    {veiculo?.placa ?? '—'}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.72rem',
                                                    color: 'var(--notion-text-secondary)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 4,
                                                    marginTop: 2,
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}>
                                                    <MapPin size={10} style={{ flexShrink: 0 }} />
                                                    {os.vistoria!.local || 'Local não informado'} · {dataFormatada}
                                                </div>
                                            </div>
                                            <span style={{
                                                padding: '3px 8px',
                                                borderRadius: 6,
                                                fontSize: '0.7rem',
                                                fontWeight: 700,
                                                color: urg.color,
                                                background: urg.bg,
                                                flexShrink: 0,
                                            }}>
                                                {urg.label}
                                            </span>
                                        </div>
                                    );
                                })}
                                <Link
                                    to="/calendario-vistorias"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6,
                                        padding: '9px',
                                        marginTop: 4,
                                        borderRadius: 10,
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        color: 'var(--notion-green)',
                                        textDecoration: 'none',
                                        background: 'rgba(6,182,212,0.1)',
                                        border: '1px solid rgba(6,182,212,0.2)',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'rgba(6,182,212,0.12)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(6,182,212,0.06)';
                                    }}
                                >
                                    Ver agenda completa <ArrowRight size={14} />
                                </Link>
                            </div>
                        </div>
                    )}

                    {/* Agenda do Dia */}
                    <div style={{
                        background: 'var(--notion-surface)',
                        borderRadius: 16,
                        border: '1px solid var(--notion-border)',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            padding: '18px 20px',
                            borderBottom: '1px solid var(--notion-border)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                        }}>
                            <div style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: 'rgba(245,158,11,0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <Calendar size={18} style={{ color: 'var(--notion-blue)' }} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--notion-text)', flex: 1 }}>
                                Agenda do Dia
                            </h3>
                            {agendaHoje.length > 0 && (
                                <span style={{
                                    fontSize: '0.72rem', fontWeight: 700,
                                    padding: '2px 9px', borderRadius: 20,
                                    background: 'rgba(245,158,11,0.12)',
                                    color: 'var(--notion-blue)',
                                    border: '1px solid rgba(245,158,11,0.25)',
                                }}>
                                    {agendaHoje.length}
                                </span>
                            )}
                        </div>

                        {agendaHoje.length === 0 ? (
                            <div style={{
                                padding: '32px 20px',
                                textAlign: 'center',
                            }}>
                                <Calendar size={28} style={{ color: 'var(--notion-text-secondary)', opacity: 0.4, display: 'block', margin: '0 auto 10px' }} />
                                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--notion-text-secondary)', fontWeight: 500 }}>
                                    Nenhuma vistoria hoje
                                </p>
                            </div>
                        ) : (
                            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {agendaHoje.map((os) => {
                                    const cliente = clientes.find((c) => c.id === os.clienteId);
                                    const veiculo = veiculos.find((v) => v.id === os.veiculoId);
                                    const vInfo = os.vistoria!;
                                    const statusVistoria: Record<string, { color: string; label: string }> = {
                                        agendar: { color: 'var(--notion-text-secondary)', label: 'A Agendar' },
                                        agendada: { color: 'var(--notion-blue)', label: 'Agendada' },
                                        reprovada: { color: 'var(--notion-orange)', label: 'Reprovada' },
                                        aprovada_apontamento: { color: 'var(--notion-orange)', label: 'Aprovada c/ Apt.' },
                                        aprovada: { color: 'var(--notion-green)', label: 'Aprovada' },
                                    };
                                    const sv = statusVistoria[vInfo.status] || { color: 'var(--notion-text-secondary)', label: vInfo.status };
                                    return (
                                        <div
                                            key={os.id}
                                            onClick={() => navigate(`/ordens/${os.id}`)}
                                            style={{
                                                display: 'flex',
                                                gap: 10,
                                                padding: '10px 12px',
                                                borderRadius: 10,
                                                background: 'var(--notion-bg)',
                                                border: '1px solid var(--notion-border)',
                                                cursor: 'pointer',
                                                transition: 'border-color 0.15s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--notion-blue)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--notion-border)'; }}
                                        >
                                            {/* Hora */}
                                            <div style={{
                                                flexShrink: 0,
                                                width: 40,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderRight: '1px solid var(--notion-border)',
                                                paddingRight: 10,
                                                gap: 2,
                                            }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--notion-blue)', lineHeight: 1 }}>
                                                    {vInfo.horaAgendamento || '--:--'}
                                                </span>
                                            </div>
                                            {/* Info */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: '0.82rem', fontWeight: 700,
                                                    color: 'var(--notion-text)',
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                }}>
                                                    {veiculo?.placa ?? '—'} · {cliente?.nome ?? '—'}
                                                </div>
                                                {vInfo.local && (
                                                    <div style={{
                                                        fontSize: '0.72rem', color: 'var(--notion-text-secondary)',
                                                        display: 'flex', alignItems: 'center', gap: 3, marginTop: 2,
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    }}>
                                                        <Building2 size={10} style={{ flexShrink: 0 }} />
                                                        {vInfo.local}
                                                    </div>
                                                )}
                                            </div>
                                            {/* Status */}
                                            <span style={{
                                                flexShrink: 0,
                                                fontSize: '0.68rem', fontWeight: 700,
                                                padding: '3px 7px', borderRadius: 6,
                                                color: sv.color,
                                                background: `${sv.color}18`,
                                                alignSelf: 'center',
                                            }}>
                                                {sv.label}
                                            </span>
                                        </div>
                                    );
                                })}
                                <Link
                                    to="/calendario-vistorias"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6,
                                        padding: '9px',
                                        marginTop: 4,
                                        borderRadius: 10,
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        color: 'var(--notion-blue)',
                                        textDecoration: 'none',
                                        background: 'rgba(245,158,11,0.06)',
                                        border: '1px solid rgba(245,158,11,0.2)',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.12)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.06)'; }}
                                >
                                    Ver agenda completa <ArrowRight size={14} />
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Painel de Alertas ── */}
            <div style={{
                marginTop: 'var(--space-8)',
                background: 'var(--notion-surface)',
                border: '1px solid var(--notion-border)',
                borderRadius: 16,
                overflow: 'visible',
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--notion-border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'rgba(239,68,68,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Bell size={18} style={{ color: '#ef4444' }} />
                    </div>
                    <h3 style={{ margin: 0, flex: 1, fontSize: '1rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                        Alertas
                    </h3>
                    {/* Gear menu */}
                    <div ref={alertsMenuRef} style={{ position: 'relative' }}>
                        <button
                            onClick={() => setAlertsMenuOpen((p) => !p)}
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--notion-border)',
                                borderRadius: 8,
                                padding: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: 'var(--notion-text-secondary)',
                            }}
                            title="Configurar alertas"
                        >
                            <Settings size={15} />
                        </button>
                        {alertsMenuOpen && (
                            <div style={{
                                position: 'absolute',
                                right: 0,
                                top: '110%',
                                background: 'var(--notion-surface)',
                                border: '1px solid var(--notion-border)',
                                borderRadius: 10,
                                padding: '8px 0',
                                zIndex: 50,
                                minWidth: 230,
                                boxShadow: 'var(--shadow-lg)',
                            }}>
                                {([
                                    { key: 'prazoVencido', label: 'Prazo de vistoria vencido' },
                                    { key: 'criticaComPendencia', label: 'OS crítica com pendência' },
                                    { key: 'vistoriasProximas', label: 'Vistorias nos próximos 3 dias' },
                                ] as { key: keyof AlertsConfig; label: string }[]).map((item) => (
                                    <button
                                        key={item.key}
                                        onClick={() => toggleAlertConfig(item.key)}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '9px 16px',
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            color: alertsConfig[item.key] ? 'var(--notion-text)' : 'var(--notion-text-secondary)',
                                            fontSize: '0.82rem',
                                            fontWeight: alertsConfig[item.key] ? 600 : 400,
                                            transition: 'background 0.1s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--notion-bg-alt)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div style={{
                                            width: 16, height: 16, borderRadius: 4,
                                            border: `2px solid ${alertsConfig[item.key] ? '#22c55e' : 'var(--notion-text-secondary)'}`,
                                            background: alertsConfig[item.key] ? '#22c55e' : 'transparent',
                                            flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {alertsConfig[item.key] && (
                                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                                    <path d="M1.5 5L4 7.5L8.5 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            )}
                                        </div>
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Alert rows */}
                <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {alertsConfig.prazoVencido && alertasPrazoVencido.map((os) => (
                        <div key={os.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px',
                            borderRadius: 10,
                            background: 'rgba(239,68,68,0.06)',
                            borderLeft: '3px solid #ef4444',
                            border: '1px solid rgba(239,68,68,0.15)',
                            borderLeftWidth: 3,
                        }}>
                            <Clock size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: '0.85rem', color: 'var(--notion-text)', fontWeight: 500 }}>
                                OS #{os.numero} — prazo de reagendamento de vistoria vencido
                                {os.vistoria?.prazoReagendamento && (
                                    <span style={{ color: 'var(--notion-text-secondary)', marginLeft: 6, fontSize: '0.78rem' }}>
                                        (venceu em {new Date(os.vistoria.prazoReagendamento).toLocaleDateString('pt-BR')})
                                    </span>
                                )}
                            </div>
                            <Link
                                to={`/ordens/${os.id}`}
                                style={{
                                    fontSize: '0.75rem', fontWeight: 700,
                                    color: '#ef4444', textDecoration: 'none',
                                    padding: '4px 10px', borderRadius: 6,
                                    background: 'rgba(239,68,68,0.1)',
                                    border: '1px solid rgba(239,68,68,0.2)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                Ver OS
                            </Link>
                        </div>
                    ))}

                    {alertsConfig.criticaComPendencia && alertasCriticasPendencia.map((os) => (
                        <div key={os.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px',
                            borderRadius: 10,
                            background: 'rgba(239,68,68,0.06)',
                            border: '1px solid rgba(239,68,68,0.15)',
                            borderLeftWidth: 3,
                            borderLeftColor: '#ef4444',
                            borderLeftStyle: 'solid',
                        }}>
                            <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: '0.85rem', color: 'var(--notion-text)', fontWeight: 500 }}>
                                OS #{os.numero} — crítica com pendência: <span style={{ color: '#ef4444' }}>{os.pendencia}</span>
                            </div>
                            <Link
                                to={`/ordens/${os.id}`}
                                style={{
                                    fontSize: '0.75rem', fontWeight: 700,
                                    color: '#ef4444', textDecoration: 'none',
                                    padding: '4px 10px', borderRadius: 6,
                                    background: 'rgba(239,68,68,0.1)',
                                    border: '1px solid rgba(239,68,68,0.2)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                Ver OS
                            </Link>
                        </div>
                    ))}

                    {alertsConfig.vistoriasProximas && alertasVistoriasProximas.map((os) => (
                        <div key={os.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px',
                            borderRadius: 10,
                            background: 'rgba(6,182,212,0.06)',
                            border: '1px solid rgba(6,182,212,0.15)',
                            borderLeftWidth: 3,
                            borderLeftColor: '#06b6d4',
                            borderLeftStyle: 'solid',
                        }}>
                            <Calendar size={16} style={{ color: '#06b6d4', flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: '0.85rem', color: 'var(--notion-text)', fontWeight: 500 }}>
                                OS #{os.numero} — vistoria agendada para{' '}
                                {os.vistoria?.dataAgendamento
                                    ? new Date(os.vistoria.dataAgendamento + 'T12:00:00').toLocaleDateString('pt-BR')
                                    : '—'}
                                {os.vistoria?.local && (
                                    <span style={{ color: 'var(--notion-text-secondary)', marginLeft: 6, fontSize: '0.78rem' }}>
                                        em {os.vistoria.local}
                                    </span>
                                )}
                            </div>
                            <Link
                                to={`/ordens/${os.id}`}
                                style={{
                                    fontSize: '0.75rem', fontWeight: 700,
                                    color: '#06b6d4', textDecoration: 'none',
                                    padding: '4px 10px', borderRadius: 6,
                                    background: 'rgba(6,182,212,0.1)',
                                    border: '1px solid rgba(6,182,212,0.2)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                Ver OS
                            </Link>
                        </div>
                    ))}

                    {/* Empty state */}
                    {(
                        (!alertsConfig.prazoVencido || alertasPrazoVencido.length === 0) &&
                        (!alertsConfig.criticaComPendencia || alertasCriticasPendencia.length === 0) &&
                        (!alertsConfig.vistoriasProximas || alertasVistoriasProximas.length === 0)
                    ) && (
                        <div style={{
                            padding: '28px 20px',
                            textAlign: 'center',
                            color: 'var(--notion-text-secondary)',
                            fontSize: '0.9rem',
                        }}>
                            Nenhum alerta no momento 🎉
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

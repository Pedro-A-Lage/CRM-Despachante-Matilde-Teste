import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    isSameMonth,
    isSameDay,
    addDays,
    parseISO,
    isToday as isDateToday,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon,
    Clock,
    MapPin,
    Car,
    Eye,
    CheckCircle,
    AlertTriangle,
    XCircle,
    CalendarDays,
    Loader2,
} from 'lucide-react';
import { getOrdens, getClientes, getVeiculos } from '../lib/storage';
import type { OrdemDeServico, Cliente, Veiculo, StatusVistoria } from '../types';

// ============================================
// CONFIGURAÇÃO DE STATUS
// ============================================
const STATUS_CONFIG: Record<StatusVistoria, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    agendar:              { label: 'A Agendar',     color: 'var(--color-warning)', bg: 'var(--color-warning-bg)',  icon: <CalendarDays size={12} /> },
    agendada:             { label: 'Agendada',      color: 'var(--color-info)',    bg: 'var(--color-info-bg)',    icon: <CalendarIcon size={12} /> },
    reagendar:            { label: 'Reagendar',     color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)',  icon: <CalendarDays size={12} /> },
    aprovada:             { label: 'Aprovada',      color: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: <CheckCircle size={12} /> },
    aprovada_apontamento: { label: 'Apontamento',   color: 'var(--color-orange)',  bg: 'var(--color-orange-bg)',  icon: <AlertTriangle size={12} /> },
    reprovada:            { label: 'Reprovada',     color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)',  icon: <XCircle size={12} /> },
};

function getStatusConfig(status: StatusVistoria) {
    return STATUS_CONFIG[status] || STATUS_CONFIG.agendar;
}

/** Abrevia nome: "Carlos Ferreira de Araujo" → "Carlos F." */
function shortName(name: string | undefined): string {
    if (!name) return '—';
    const parts = name.trim().split(/\s+/).filter(p => !['de', 'da', 'do', 'dos', 'das', 'e'].includes(p.toLowerCase()));
    if (parts.length <= 1) return parts[0] || '—';
    return `${parts[0]} ${parts[1]![0]}.`;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
export default function VistoriaCalendar() {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [ordens, setOrdens] = useState<OrdemDeServico[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);
    const [view, setView] = useState<'calendar' | 'list'>('list');
    const [period, setPeriod] = useState<'hoje' | 'semana' | 'mes'>('hoje');

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            const [o, c, v] = await Promise.all([
                getOrdens(),
                getClientes(),
                getVeiculos(),
            ]);
            // Bug #5 fix: include vistorias with data de agendamento, excluding
            // 'agendar' status without a confirmed date (stale data from cancelled schedules)
            setOrdens(o.filter(os => os.vistoria && os.vistoria.dataAgendamento && os.vistoria.status !== 'agendar'));
            setClientes(c);
            setVeiculos(v);
            setLoading(false);
        };
        loadData();
    }, []);

    // Contadores conforme período selecionado
    const monthStats = useMemo(() => {
        const today = new Date();
        const weekStart = startOfWeek(today, { weekStartsOn: 0 });
        const weekEnd   = endOfWeek(today,   { weekStartsOn: 0 });
        const monthStart = startOfMonth(currentMonth);
        const monthEnd   = endOfMonth(currentMonth);
        const filtered = ordens.filter(os => {
            if (!os.vistoria?.dataAgendamento) return false;
            const d = parseISO(os.vistoria.dataAgendamento);
            if (period === 'hoje')   return isDateToday(d);
            if (period === 'semana') return d >= weekStart && d <= weekEnd;
            return d >= monthStart && d <= monthEnd;
        });
        // Bug #6 fix: include 'reagendar' in pendentes count so total = sum of all categories
        return {
            total:       filtered.length,
            aprovadas:   filtered.filter(o => o.vistoria?.status === 'aprovada').length,
            agendadas:   filtered.filter(o => o.vistoria?.status === 'agendada').length,
            pendentes:   filtered.filter(o => o.vistoria?.status === 'agendar' || o.vistoria?.status === 'reagendar').length,
            reprovadas:  filtered.filter(o => o.vistoria?.status === 'reprovada').length,
            apontamento: filtered.filter(o => o.vistoria?.status === 'aprovada_apontamento').length,
        };
    }, [ordens, currentMonth, period]);

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const goToday = () => { setCurrentMonth(new Date()); setSelectedDay(new Date()); setPeriod('mes'); };

    const getVistoriasForDay = (day: Date) => {
        return ordens.filter(os => {
            if (!os.vistoria?.dataAgendamento) return false;
            return isSameDay(day, parseISO(os.vistoria.dataAgendamento));
        }).sort((a, b) => {
            const timeA = a.vistoria?.horaAgendamento || '23:59';
            const timeB = b.vistoria?.horaAgendamento || '23:59';
            return timeA.localeCompare(timeB);
        });
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
                <Loader2 size={24} className="spin" style={{ color: 'var(--color-primary)' }} />
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>Carregando agenda...</span>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
            <style>{`
                .vc-hide-scrollbar::-webkit-scrollbar { display: none; }
                .vc-hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                @media (max-width: 768px) {
                    .vc-desktop { display: none !important; }
                    .vc-mobile { display: block !important; }
                }
                @media (min-width: 769px) {
                    .vc-desktop { display: block !important; }
                    .vc-mobile { display: none !important; }
                }
                .vc-day-cell:hover { background: var(--color-primary-50) !important; }
                .vc-event:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
            `}</style>

            {/* ===== HEADER ===== */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 24,
                flexWrap: 'wrap',
                gap: 12,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={prevMonth} style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 8,
                            padding: '8px 10px',
                            cursor: 'pointer',
                            color: 'var(--color-text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                        }}>
                            <ChevronLeft size={18} />
                        </button>
                        <button onClick={goToday} style={{
                            background: 'var(--color-primary)',
                            color: 'var(--color-text-inverse)',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 16px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: 'var(--text-sm)',
                        }}>
                            Hoje
                        </button>
                        <button onClick={nextMonth} style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 8,
                            padding: '8px 10px',
                            cursor: 'pointer',
                            color: 'var(--color-text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                        }}>
                            <ChevronRight size={18} />
                        </button>
                    </div>
                    <h2 style={{
                        fontSize: 'var(--text-2xl)',
                        fontWeight: 700,
                        color: 'var(--color-text-primary)',
                        textTransform: 'capitalize',
                        margin: 0,
                    }}>
                        {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                    </h2>
                </div>

                {/* View toggle (desktop only) */}
                <div className="vc-desktop" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 10,
                    overflow: 'hidden',
                    minWidth: 140,
                }}>
                    <button onClick={() => setView('list')} style={{
                        padding: '10px 16px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 'var(--text-sm)',
                        fontWeight: 600,
                        background: view === 'list' ? 'var(--color-primary)' : 'transparent',
                        color: view === 'list' ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                    }}>
                        <Eye size={14} /> Lista
                    </button>
                    <button onClick={() => setView('calendar')} style={{
                        padding: '10px 16px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 'var(--text-sm)',
                        fontWeight: 600,
                        background: view === 'calendar' ? 'var(--color-primary)' : 'transparent',
                        color: view === 'calendar' ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        borderTop: '1px solid var(--border-color)',
                    }}>
                        <CalendarIcon size={14} /> Calendário
                    </button>
                </div>
            </div>

            {/* ===== FILTROS DE PERÍODO ===== */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                {([
                    { key: 'hoje',   label: 'Hoje' },
                    { key: 'semana', label: 'Esta Semana' },
                    { key: 'mes',    label: 'Este Mês' },
                ] as const).map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => {
                            setPeriod(key);
                            if (key !== 'mes') setCurrentMonth(new Date());
                        }}
                        style={{
                            padding: '7px 22px',
                            border: period === key ? 'none' : '1px solid var(--border-color)',
                            borderRadius: 20,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: 'var(--text-sm)',
                            fontWeight: 600,
                            background: period === key ? 'var(--color-primary)' : 'var(--bg-card)',
                            color: period === key ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                            transition: 'all 0.15s',
                            boxShadow: period === key ? '0 2px 8px rgba(0,0,0,0.25)' : 'none',
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* ===== STATS CARDS ===== */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
                marginBottom: 24,
            }}>
                {[
                    { label: 'Total', value: monthStats.total, color: 'var(--color-primary)', bg: 'var(--color-primary-50)' },
                    { label: 'Aprovadas', value: monthStats.aprovadas, color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
                    { label: 'Agendadas', value: monthStats.agendadas, color: 'var(--color-info)', bg: 'var(--color-info-bg)' },
                    { label: 'Apontamento', value: monthStats.apontamento, color: 'var(--color-orange)', bg: 'var(--color-orange-bg)' },
                    { label: 'Reprovadas', value: monthStats.reprovadas, color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
                ].map(stat => (
                    <div key={stat.label} style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                    }}>
                        <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: stat.bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 'var(--text-lg)',
                            fontWeight: 800,
                            color: stat.color,
                        }}>
                            {stat.value}
                        </div>
                        <span style={{
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            color: 'var(--color-text-tertiary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>{stat.label}</span>
                    </div>
                ))}
            </div>

            {/* ===== DESKTOP CALENDAR VIEW ===== */}
            <div className="vc-desktop">
                {view === 'calendar' ? (
                    <CalendarGrid
                        currentMonth={currentMonth}
                        ordens={ordens}
                        clientes={clientes}
                        veiculos={veiculos}
                        selectedDay={selectedDay}
                        onSelectDay={setSelectedDay}
                        getVistoriasForDay={getVistoriasForDay}
                    />
                ) : (
                    <ListView
                        currentMonth={currentMonth}
                        ordens={ordens}
                        clientes={clientes}
                        veiculos={veiculos}
                        period={period}
                    />
                )}
            </div>

            {/* ===== MOBILE LIST VIEW ===== */}
            <div className="vc-mobile" style={{ display: 'none' }}>
                <ListView
                    currentMonth={currentMonth}
                    ordens={ordens}
                    clientes={clientes}
                    veiculos={veiculos}
                    period={period}
                />
            </div>

            {/* ===== DETAIL PANEL (quando clica num dia) ===== */}
            {selectedDay && (
                <DayDetailPanel
                    day={selectedDay}
                    vistorias={getVistoriasForDay(selectedDay)}
                    clientes={clientes}
                    veiculos={veiculos}
                    onClose={() => setSelectedDay(null)}
                />
            )}
        </div>
    );
}

// ============================================
// CALENDAR GRID
// ============================================
function CalendarGrid({
    currentMonth, ordens, clientes, veiculos, selectedDay, onSelectDay, getVistoriasForDay,
}: {
    currentMonth: Date;
    ordens: OrdemDeServico[];
    clientes: Cliente[];
    veiculos: Veiculo[];
    selectedDay: Date | null;
    onSelectDay: (d: Date) => void;
    getVistoriasForDay: (d: Date) => OrdemDeServico[];
}) {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    // Gerar todas as semanas
    const weeks: Date[][] = [];
    let day = calStart;
    while (day <= calEnd) {
        const week: Date[] = [];
        for (let i = 0; i < 7; i++) {
            week.push(day);
            day = addDays(day, 1);
        }
        weeks.push(week);
    }

    return (
        <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            overflow: 'hidden',
        }}>
            {/* Header dias da semana */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                borderBottom: '1px solid var(--border-color)',
            }}>
                {dayNames.map(name => (
                    <div key={name} style={{
                        padding: '12px 0',
                        textAlign: 'center',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'var(--color-text-tertiary)',
                    }}>
                        {name}
                    </div>
                ))}
            </div>

            {/* Semanas */}
            {weeks.map((week, wi) => (
                <div key={wi} style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    borderBottom: wi < weeks.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}>
                    {week.map((d, di) => {
                        const vistorias = getVistoriasForDay(d);
                        const isToday = isDateToday(d);
                        const isCurrentMonth = isSameMonth(d, monthStart);
                        const isSelected = selectedDay ? isSameDay(d, selectedDay) : false;

                        return (
                            <div
                                key={di}
                                className="vc-day-cell"
                                onClick={() => onSelectDay(d)}
                                style={{
                                    minHeight: 110,
                                    padding: 8,
                                    borderRight: di < 6 ? '1px solid var(--border-color)' : 'none',
                                    cursor: 'pointer',
                                    opacity: isCurrentMonth ? 1 : 0.35,
                                    background: isSelected
                                        ? 'var(--color-primary-50)'
                                        : isToday
                                            ? 'rgba(255,193,7,0.04)'
                                            : 'transparent',
                                    transition: 'background 0.15s ease',
                                    position: 'relative',
                                }}
                            >
                                {/* Número do dia */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: 6,
                                }}>
                                    <span style={{
                                        width: 28,
                                        height: 28,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '50%',
                                        fontSize: 'var(--text-sm)',
                                        fontWeight: isToday ? 800 : 600,
                                        background: isToday ? 'var(--color-primary)' : 'transparent',
                                        color: isToday ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                                    }}>
                                        {format(d, 'd')}
                                    </span>
                                    {vistorias.length > 0 && (
                                        <span style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            color: 'var(--color-primary)',
                                            background: 'var(--color-primary-50)',
                                            padding: '2px 6px',
                                            borderRadius: 8,
                                        }}>
                                            {vistorias.length}
                                        </span>
                                    )}
                                </div>

                                {/* Eventos */}
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 3,
                                }}>
                                    {vistorias.map(os => {
                                        const cfg = getStatusConfig(os.vistoria!.status);
                                        const veiculo = veiculos.find(v => v.id === os.veiculoId);
                                        const cliente = clientes.find(c => c.id === os.clienteId);
                                        return (
                                            <Link
                                                key={os.id}
                                                to={`/ordens/${os.id}`}
                                                className="vc-event"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{
                                                    padding: '3px 6px',
                                                    borderRadius: 6,
                                                    background: cfg.bg,
                                                    borderLeft: `3px solid ${cfg.color}`,
                                                    fontSize: 10,
                                                    lineHeight: 1.3,
                                                    transition: 'transform 0.15s, box-shadow 0.15s',
                                                    textDecoration: 'none',
                                                    color: 'inherit',
                                                    display: 'block',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <div style={{
                                                    fontWeight: 700,
                                                    color: cfg.color,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 3,
                                                }}>
                                                    <Clock size={9} />
                                                    {os.vistoria?.horaAgendamento || '—'}
                                                </div>
                                                <div style={{
                                                    fontWeight: 600,
                                                    color: 'var(--color-text-primary)',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    fontSize: 9,
                                                }}>
                                                    {shortName(cliente?.nome)}
                                                </div>
                                            </Link>
                                        );
                                    })}

                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

// ============================================
// LIST VIEW
// ============================================
function ListView({
    currentMonth, ordens, clientes, veiculos, period,
}: {
    currentMonth: Date;
    ordens: OrdemDeServico[];
    clientes: Cliente[];
    veiculos: Veiculo[];
    period: 'hoje' | 'semana' | 'mes';
}) {
    const today     = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 0 });
    const weekEnd   = endOfWeek(today,   { weekStartsOn: 0 });
    const monthStart = startOfMonth(currentMonth);
    const monthEnd   = endOfMonth(currentMonth);

    const vistoriasMes = ordens
        .filter(os => {
            if (!os.vistoria?.dataAgendamento) return false;
            const d = parseISO(os.vistoria.dataAgendamento);
            if (period === 'hoje')   return isDateToday(d);
            if (period === 'semana') return d >= weekStart && d <= weekEnd;
            return d >= monthStart && d <= monthEnd;
        })
        .sort((a, b) => {
            const dA = a.vistoria?.dataAgendamento || '';
            const dB = b.vistoria?.dataAgendamento || '';
            if (dA !== dB) return dA.localeCompare(dB);
            return (a.vistoria?.horaAgendamento || '').localeCompare(b.vistoria?.horaAgendamento || '');
        });

    if (vistoriasMes.length === 0) {
        return (
            <div style={{
                background: 'var(--bg-card)',
                border: '2px dashed var(--border-color)',
                borderRadius: 16,
                padding: 48,
                textAlign: 'center',
            }}>
                <CalendarIcon size={48} style={{ color: 'var(--color-text-tertiary)', margin: '0 auto 16px', opacity: 0.3 }} />
                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                    Nenhuma vistoria neste mês
                </h3>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                    As vistorias agendadas aparecerão aqui automaticamente.
                </p>
            </div>
        );
    }

    // Agrupar por dia
    const grouped: Record<string, OrdemDeServico[]> = {};
    vistoriasMes.forEach(os => {
        const key = os.vistoria?.dataAgendamento || '';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(os);
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {Object.keys(grouped).sort().reverse().map(dateStr => {
                const dateObj = parseISO(dateStr);
                const isToday = isDateToday(dateObj);
                return (
                    <div key={dateStr}>
                        {/* Header do dia */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            marginBottom: 12,
                            paddingBottom: 8,
                            borderBottom: '2px solid var(--border-color)',
                        }}>
                            <div style={{
                                width: 48,
                                height: 48,
                                borderRadius: 12,
                                background: isToday ? 'var(--color-primary)' : 'var(--bg-card)',
                                border: isToday ? 'none' : '1px solid var(--border-color)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <span style={{
                                    fontSize: 'var(--text-lg)',
                                    fontWeight: 800,
                                    color: isToday ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',
                                    lineHeight: 1,
                                }}>
                                    {format(dateObj, 'd')}
                                </span>
                                <span style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    color: isToday ? 'rgba(0,0,0,0.6)' : 'var(--color-text-tertiary)',
                                    lineHeight: 1,
                                    marginTop: 2,
                                }}>
                                    {format(dateObj, 'EEE', { locale: ptBR })}
                                </span>
                            </div>
                            <div>
                                <h3 style={{
                                    fontSize: 'var(--text-base)',
                                    fontWeight: 700,
                                    color: 'var(--color-text-primary)',
                                    margin: 0,
                                    textTransform: 'capitalize',
                                }}>
                                    {format(dateObj, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                                </h3>
                                <span style={{
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--color-text-tertiary)',
                                }}>
                                    {grouped[dateStr]!.length} vistoria{grouped[dateStr]!.length > 1 ? 's' : ''}
                                </span>
                            </div>
                            {isToday && (
                                <span style={{
                                    marginLeft: 'auto',
                                    fontSize: 'var(--text-xs)',
                                    fontWeight: 700,
                                    color: 'var(--color-primary)',
                                    background: 'var(--color-primary-50)',
                                    padding: '4px 10px',
                                    borderRadius: 8,
                                }}>HOJE</span>
                            )}
                        </div>

                        {/* Cards do dia */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {grouped[dateStr]!.map(os => (
                                <VistoriaCard
                                    key={os.id}
                                    os={os}
                                    cliente={clientes.find(c => c.id === os.clienteId)}
                                    veiculo={veiculos.find(v => v.id === os.veiculoId)}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ============================================
// VISTORIA CARD
// ============================================
function VistoriaCard({ os, cliente, veiculo }: {
    os: OrdemDeServico;
    cliente?: Cliente;
    veiculo?: Veiculo;
}) {
    const cfg = getStatusConfig(os.vistoria!.status);

    return (
        <Link
            to={`/ordens/${os.id}`}
            style={{
                display: 'flex',
                alignItems: 'stretch',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 12,
                overflow: 'hidden',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = cfg.color;
                (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px rgba(0,0,0,0.2)`;
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
        >
            {/* Barra lateral colorida */}
            <div style={{
                width: 5,
                background: cfg.color,
                flexShrink: 0,
            }} />

            {/* Horário */}
            <div style={{
                width: 72,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 0',
                borderRight: '1px solid var(--border-color)',
                flexShrink: 0,
            }}>
                <Clock size={14} style={{ color: cfg.color, marginBottom: 4 }} />
                <span style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 800,
                    color: 'var(--color-text-primary)',
                }}>
                    {os.vistoria?.horaAgendamento || '—'}
                </span>
            </div>

            {/* Conteúdo */}
            <div style={{
                flex: 1,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 0,
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                }}>
                    <span style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 700,
                        color: 'var(--color-text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        {cliente?.nome || 'Cliente não encontrado'}
                    </span>
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        color: cfg.color,
                        background: cfg.bg,
                        padding: '3px 8px',
                        borderRadius: 6,
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                    }}>
                        {cfg.icon} {cfg.label}
                    </span>
                </div>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-tertiary)',
                }}>
                    {veiculo && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                            <Car size={12} /> {veiculo.placa} • {veiculo.marcaModelo}
                        </span>
                    )}
                    <span style={{ fontWeight: 500 }}>OS #{os.numero}</span>
                </div>

                {os.vistoria?.local && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        color: 'var(--color-text-tertiary)',
                        marginTop: 2,
                    }}>
                        <MapPin size={11} style={{ flexShrink: 0 }} />
                        <span style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}>
                            {os.vistoria.local}
                        </span>
                    </div>
                )}
            </div>
        </Link>
    );
}

// ============================================
// DAY DETAIL PANEL (ao clicar no dia)
// ============================================
function DayDetailPanel({ day, vistorias, clientes, veiculos, onClose }: {
    day: Date;
    vistorias: OrdemDeServico[];
    clientes: Cliente[];
    veiculos: Veiculo[];
    onClose: () => void;
}) {
    if (vistorias.length === 0) return null;

    return (
        <div style={{
            marginTop: 24,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--color-primary-50)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CalendarIcon size={18} style={{ color: 'var(--color-primary)' }} />
                    <span style={{
                        fontSize: 'var(--text-base)',
                        fontWeight: 700,
                        color: 'var(--color-text-primary)',
                        textTransform: 'capitalize',
                    }}>
                        {format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </span>
                    <span style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        color: 'var(--color-primary)',
                        background: 'var(--color-primary-100)',
                        padding: '2px 8px',
                        borderRadius: 6,
                    }}>
                        {vistorias.length} vistoria{vistorias.length > 1 ? 's' : ''}
                    </span>
                </div>
                <button onClick={onClose} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-tertiary)',
                    fontSize: 'var(--text-lg)',
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: 6,
                }}>✕</button>
            </div>

            {/* Lista */}
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {vistorias.map(os => (
                    <VistoriaCard
                        key={os.id}
                        os={os}
                        cliente={clientes.find(c => c.id === os.clienteId)}
                        veiculo={veiculos.find(v => v.id === os.veiculoId)}
                    />
                ))}
            </div>
        </div>
    );
}

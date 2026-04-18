// src/pages/PainelEmpresas.tsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Building2, Mail, CheckCircle2, Circle, Clock, ExternalLink, ChevronDown, ChevronRight, DollarSign, Check, X, Calendar, Filter } from 'lucide-react';
import { getEmpresas } from '../lib/empresaService';
import { getOrdens, updateOrdem } from '../lib/database';
import { getChargesByOS } from '../lib/financeService';
import type { EmpresaParceira } from '../types/empresa';
import type { EtapaEnvioStatus, EmpresaFinanceiro } from '../types/empresa';
import type { OrdemDeServico } from '../types';
import { useNavigate } from 'react-router-dom';

// ── Helpers ──────────────────────────────────────────────────────────────────

function etapaCompleta(etapa: EtapaEnvioStatus): boolean {
    return etapa.documentos.every((d) => d.pronto);
}

function docLabel(tipo: string): string {
    const labels: Record<string, string> = {
        tx_estado: 'Tx do Estado', comprovante_pagamento: 'Comprovante Pgto',
        taxa_vistoria: 'Taxa Vistoria', boleto_placa: 'Boleto Placa',
        comprovante_placa: 'Comprovante Placa', nota_fiscal: 'Nota Fiscal',
        dae: 'DAE', vistoria_paga: 'Vistoria Paga', doc_pronto: 'Doc. Pronto',
    };
    return labels[tipo] || tipo.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMoney(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PainelEmpresas() {
    const [empresas, setEmpresas] = useState<EmpresaParceira[]>([]);
    const [ordens, setOrdens] = useState<OrdemDeServico[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
    const [expandedOs, setExpandedOs] = useState<Set<string>>(new Set());
    const [osCharges, setOsCharges] = useState<Record<string, any[]>>({});
    const navigate = useNavigate();

    // Filtros
    const [filtroPeriodo, setFiltroPeriodo] = useState<string>('todos');
    const [filtroPeriodoInicio, setFiltroPeriodoInicio] = useState('');
    const [filtroPeriodoFim, setFiltroPeriodoFim] = useState('');
    const [filtroPagamento, setFiltroPagamento] = useState<string>('todos');
    const [filtroStatus, setFiltroStatus] = useState<string>('todos');
    const [filtroServico, setFiltroServico] = useState<string>('todos');

    const loadData = useCallback(async () => {
        setLoading(true);
        const [emps, ords] = await Promise.all([getEmpresas(), getOrdens()]);
        const ativas = emps.filter((e) => e.ativo);
        setEmpresas(ativas);
        setOrdens(ords);
        if (ativas.length > 0 && !selectedEmpresa) setSelectedEmpresa(ativas[0]!.id);

        // Load charges for OS with empresa
        const empresaOrdens = ords.filter((o) => o.empresaParceiraId);
        const chargesMap: Record<string, any[]> = {};
        await Promise.all(empresaOrdens.map(async (o) => {
            try {
                chargesMap[o.id] = await getChargesByOS(o.id);
            } catch { chargesMap[o.id] = []; }
        }));
        setOsCharges(chargesMap);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const empresa = empresas.find((e) => e.id === selectedEmpresa);

    const osEmpresa = useMemo(() => {
        const now = new Date();
        return ordens
            .filter((os) => os.empresaParceiraId === selectedEmpresa)
            .filter((os) => {
                // Filtro período
                if (filtroPeriodo !== 'todos' && os.criadoEm) {
                    const criado = new Date(os.criadoEm);
                    if (filtroPeriodo === 'este_mes') {
                        if (criado.getMonth() !== now.getMonth() || criado.getFullYear() !== now.getFullYear()) return false;
                    } else if (filtroPeriodo === 'mes_passado') {
                        const mp = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        if (criado.getMonth() !== mp.getMonth() || criado.getFullYear() !== mp.getFullYear()) return false;
                    } else if (filtroPeriodo === '3_meses') {
                        const tresMeses = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                        if (criado < tresMeses) return false;
                    } else if (filtroPeriodo === 'personalizado') {
                        if (filtroPeriodoInicio && criado < new Date(filtroPeriodoInicio + 'T00:00:00')) return false;
                        if (filtroPeriodoFim && criado > new Date(filtroPeriodoFim + 'T23:59:59')) return false;
                    }
                }
                // Filtro pagamento
                if (filtroPagamento !== 'todos') {
                    const fin = os.empresaFinanceiro;
                    if (filtroPagamento === 'pendente' && fin?.recebido) return false;
                    if (filtroPagamento === 'recebido' && !fin?.recebido) return false;
                    if (filtroPagamento === 'adiantado' && !(fin?.valor_adiantado && fin.valor_adiantado > 0)) return false;
                }
                // Filtro status
                if (filtroStatus !== 'todos' && os.status !== filtroStatus) return false;
                // Filtro serviço
                if (filtroServico !== 'todos' && os.tipoServico !== filtroServico) return false;
                return true;
            })
            .sort((a, b) => b.numero - a.numero);
    }, [ordens, selectedEmpresa, filtroPeriodo, filtroPeriodoInicio, filtroPeriodoFim, filtroPagamento, filtroStatus, filtroServico]);

    // Calculate total for an OS based on charges + empresa values
    // custos = soma das cobranças (DAE + vistoria + placa)
    // honorario = valor do serviço/mão de obra da empresa (ex: R$300 Guiauto)
    // total = custos + honorario (o que a empresa paga no total)
    const calcularTotalOS = useCallback((os: OrdemDeServico): { custos: number; honorario: number; total: number; adiantado: number } => {
        const charges = osCharges[os.id] || [];
        const custos = charges
            .filter((c: any) => c.status !== 'cancelado')
            .reduce((sum: number, c: any) => sum + (Number(c.valor_previsto) || 0), 0);
        const honorario = empresa?.valorServico ?? 0;
        const adiantado = os.empresaFinanceiro?.valor_adiantado || 0;
        const total = os.empresaFinanceiro?.valor_total_empresa ?? (custos + honorario);
        return { custos, honorario, total, adiantado };
    }, [osCharges, empresa]);

    // Financial stats
    const stats = useMemo(() => {
        let totalOs = osEmpresa.length;
        let enviosPendentes = 0;
        let enviosConcluidos = 0;
        let totalDevido = 0;
        let totalRecebido = 0;
        let totalAdiantado = 0;

        for (const os of osEmpresa) {
            for (const etapa of (os.enviosStatus || [])) {
                if (etapa.enviado) enviosConcluidos++;
                else enviosPendentes++;
            }
            const fin = os.empresaFinanceiro;
            const { total } = calcularTotalOS(os);
            if (fin?.recebido) {
                totalRecebido += total;
            } else {
                totalDevido += total;
            }
            if (fin?.valor_adiantado) totalAdiantado += fin.valor_adiantado;
        }
        return { totalOs, enviosPendentes, enviosConcluidos, totalDevido, totalRecebido, totalAdiantado };
    }, [osEmpresa, osCharges, empresa]);

    const toggleExpand = (osId: string) => {
        setExpandedOs((prev) => {
            const next = new Set(prev);
            next.has(osId) ? next.delete(osId) : next.add(osId);
            return next;
        });
    };

    const handleMarcarRecebido = async (os: OrdemDeServico) => {
        const fin: EmpresaFinanceiro = {
            ...(os.empresaFinanceiro || { recebido: false }),
            recebido: true,
            recebido_em: new Date().toISOString(),
        };
        await updateOrdem(os.id, { empresaFinanceiro: fin });
        await loadData();
    };

    const handleDesmarcarRecebido = async (os: OrdemDeServico) => {
        const fin: EmpresaFinanceiro = {
            ...(os.empresaFinanceiro || { recebido: false }),
            recebido: false,
            recebido_em: null,
        };
        await updateOrdem(os.id, { empresaFinanceiro: fin });
        await loadData();
    };

    const handleSetAdiantado = async (os: OrdemDeServico, valor: number) => {
        const fin: EmpresaFinanceiro = {
            ...(os.empresaFinanceiro || { recebido: false }),
            valor_adiantado: valor,
        };
        await updateOrdem(os.id, { empresaFinanceiro: fin });
        await loadData();
    };

    const handleSetValorTotal = async (os: OrdemDeServico, valor: number) => {
        const fin: EmpresaFinanceiro = {
            ...(os.empresaFinanceiro || { recebido: false }),
            valor_total_empresa: valor,
        };
        await updateOrdem(os.id, { empresaFinanceiro: fin });
        await loadData();
    };


    if (loading) {
        return (
            <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
                <p style={{ color: 'var(--notion-text-secondary)', textAlign: 'center', padding: 48 }}>Carregando...</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <Building2 size={24} style={{ color: 'var(--notion-blue)' }} />
                <div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--notion-text)', margin: 0 }}>
                        Painel de Empresas
                    </h1>
                    <p style={{ fontSize: 14, color: 'var(--notion-text-secondary)', margin: '4px 0 0' }}>
                        Controle de envios, documentação e recebimentos
                    </p>
                </div>
            </div>

            {/* Empresa selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {empresas.map((emp) => (
                    <button
                        key={emp.id}
                        onClick={() => setSelectedEmpresa(emp.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
                            border: `1px solid ${selectedEmpresa === emp.id ? emp.cor : 'var(--notion-border)'}`,
                            background: selectedEmpresa === emp.id ? `${emp.cor}18` : 'transparent',
                            color: selectedEmpresa === emp.id ? emp.cor : 'var(--notion-text-secondary)',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: emp.cor }} />
                        {emp.nome}
                    </button>
                ))}
            </div>

            {empresa && (
                <>
                    {/* Filtros */}
                    {(() => {
                        const selectStyle: React.CSSProperties = {
                            height: 36, borderRadius: 8, background: 'var(--notion-surface)',
                            border: '1px solid var(--notion-border)', padding: '0 12px',
                            fontSize: 13, fontWeight: 600, color: 'var(--notion-text-secondary)',
                            cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                            appearance: 'auto' as any, transition: 'border-color 0.15s',
                            minWidth: 160, flex: '1 1 160px',
                        };
                        const tiposServico = Array.from(new Set(ordens.filter(o => o.empresaParceiraId === selectedEmpresa && o.tipoServico).map(o => o.tipoServico!)));
                        const hasFilters = filtroPeriodo !== 'todos' || filtroPagamento !== 'todos' || filtroStatus !== 'todos' || filtroServico !== 'todos';
                        const totalSemFiltro = ordens.filter(o => o.empresaParceiraId === selectedEmpresa).length;
                        return (
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
                                border: '1px solid var(--notion-border)', borderRadius: 10,
                                padding: '12px 14px', marginBottom: 16,
                                background: 'var(--notion-bg-alt)',
                            }}>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                    {/* Período */}
                                    <select
                                        style={{ ...selectStyle, color: filtroPeriodo !== 'todos' ? 'var(--notion-text)' : undefined }}
                                        value={filtroPeriodo}
                                        onChange={e => setFiltroPeriodo(e.target.value)}
                                    >
                                        <option value="todos">Periodo: Todos</option>
                                        <option value="este_mes">Este mes</option>
                                        <option value="mes_passado">Mes passado</option>
                                        <option value="3_meses">Ultimos 3 meses</option>
                                        <option value="personalizado">Personalizado...</option>
                                    </select>

                                    {/* Date range para personalizado */}
                                    {filtroPeriodo === 'personalizado' && (
                                        <>
                                            <input
                                                type="date" value={filtroPeriodoInicio}
                                                onChange={e => setFiltroPeriodoInicio(e.target.value)}
                                                style={{ ...selectStyle, width: 140, padding: '0 8px' }}
                                            />
                                            <span style={{ fontSize: 12, color: 'var(--notion-text-secondary)' }}>ate</span>
                                            <input
                                                type="date" value={filtroPeriodoFim}
                                                onChange={e => setFiltroPeriodoFim(e.target.value)}
                                                style={{ ...selectStyle, width: 140, padding: '0 8px' }}
                                            />
                                        </>
                                    )}

                                    {/* Pagamento */}
                                    <select
                                        style={{ ...selectStyle, color: filtroPagamento !== 'todos' ? 'var(--notion-text)' : undefined }}
                                        value={filtroPagamento}
                                        onChange={e => setFiltroPagamento(e.target.value)}
                                    >
                                        <option value="todos">Pagamento: Todos</option>
                                        <option value="pendente">Pendentes</option>
                                        <option value="recebido">Recebidos</option>
                                        <option value="adiantado">Com adiantamento</option>
                                    </select>

                                    {/* Status */}
                                    <select
                                        style={{ ...selectStyle, color: filtroStatus !== 'todos' ? 'var(--notion-text)' : undefined }}
                                        value={filtroStatus}
                                        onChange={e => setFiltroStatus(e.target.value)}
                                    >
                                        <option value="todos">Status: Todos</option>
                                        <option value="aguardando_documentacao">Aguardando Doc</option>
                                        <option value="vistoria">Vistoria</option>
                                        <option value="delegacia">Delegacia</option>
                                        <option value="doc_pronto">Doc Pronto</option>
                                        <option value="entregue">Entregue</option>
                                    </select>

                                    {/* Serviço */}
                                    {tiposServico.length > 1 && (
                                        <select
                                            style={{ ...selectStyle, color: filtroServico !== 'todos' ? 'var(--notion-text)' : undefined }}
                                            value={filtroServico}
                                            onChange={e => setFiltroServico(e.target.value)}
                                        >
                                            <option value="todos">Servico: Todos</option>
                                            {tiposServico.map(t => (
                                                <option key={t} value={t}>
                                                    {t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                                </option>
                                            ))}
                                        </select>
                                    )}

                                    {/* Limpar filtros */}
                                    {hasFilters && (
                                        <button
                                            onClick={() => { setFiltroPeriodo('todos'); setFiltroPagamento('todos'); setFiltroStatus('todos'); setFiltroServico('todos'); setFiltroPeriodoInicio(''); setFiltroPeriodoFim(''); }}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                fontSize: 12, fontWeight: 600, color: 'var(--notion-orange)',
                                                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                                            }}
                                        >
                                            <X size={12} /> Limpar
                                        </button>
                                    )}
                                </div>
                                {hasFilters && (
                                    <span style={{ fontSize: 12, color: 'var(--notion-text-secondary)' }}>
                                        Mostrando <strong>{osEmpresa.length}</strong> de {totalSemFiltro} OS
                                    </span>
                                )}
                            </div>
                        );
                    })()}

                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
                        {[
                            { label: 'OS Ativas', value: stats.totalOs, display: String(stats.totalOs), color: empresa.cor },
                            { label: 'A Receber', value: stats.totalDevido, display: formatMoney(stats.totalDevido), color: '#C88010' },
                            { label: 'Recebido', value: stats.totalRecebido, display: formatMoney(stats.totalRecebido), color: '#28A06A' },
                            { label: 'Adiantado', value: stats.totalAdiantado, display: formatMoney(stats.totalAdiantado), color: '#C84040' },
                            { label: 'Envios Pendentes', value: stats.enviosPendentes, display: String(stats.enviosPendentes), color: 'var(--notion-text)' },
                        ].map((stat) => (
                            <div key={stat.label} style={{
                                background: 'var(--notion-bg)', border: '1px solid var(--notion-border)',
                                borderRadius: 10, padding: '12px 14px',
                            }}>
                                <div style={{ fontSize: 10, color: 'var(--notion-text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                                    {stat.label}
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>
                                    {stat.display}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* OS List */}
                    {osEmpresa.length === 0 ? (
                        <div style={{ background: 'var(--notion-bg)', border: '1px solid var(--notion-border)', borderRadius: 10, padding: 48, textAlign: 'center' }}>
                            <p style={{ color: 'var(--notion-text-secondary)', fontSize: 14 }}>Nenhuma OS vinculada a {empresa.nome}.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {osEmpresa.map((os) => {
                                const envios = os.enviosStatus || [];
                                const expanded = expandedOs.has(os.id);
                                const totalEtapas = envios.length;
                                const etapasEnviadas = envios.filter((e) => e.enviado).length;
                                const todasEnviadas = totalEtapas > 0 && etapasEnviadas === totalEtapas;
                                const fin = os.empresaFinanceiro;
                                const recebido = fin?.recebido === true;
                                const { custos, honorario, total, adiantado } = calcularTotalOS(os);

                                return (
                                    <div key={os.id} style={{
                                        background: 'var(--notion-bg)',
                                        border: `1px solid ${recebido ? 'rgba(40,160,106,0.3)' : 'var(--notion-border)'}`,
                                        borderRadius: 10, overflow: 'hidden',
                                    }}>
                                        {/* OS Header */}
                                        <div
                                            onClick={() => toggleExpand(os.id)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                                            className="hover:bg-surface/[0.02] transition-colors"
                                        >
                                            {expanded
                                                ? <ChevronDown size={14} style={{ color: 'var(--notion-text-secondary)', flexShrink: 0 }} />
                                                : <ChevronRight size={14} style={{ color: 'var(--notion-text-secondary)', flexShrink: 0 }} />
                                            }

                                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--notion-blue)', minWidth: 55 }}>
                                                OS #{os.numero}
                                            </span>

                                            <span style={{ fontSize: 12, color: 'var(--notion-text-secondary)' }}>
                                                {os.tipoServico?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                            </span>

                                            {/* NF inline */}
                                            <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                <span style={{ fontSize: 10, color: 'var(--notion-text-secondary)' }}>NF:</span>
                                                <input
                                                    type="text"
                                                    value={fin?.numero_nf || ''}
                                                    placeholder="—"
                                                    onChange={async (e) => {
                                                        const nf = e.target.value;
                                                        const newFin: EmpresaFinanceiro = {
                                                            ...(fin || { recebido: false }),
                                                            numero_nf: nf,
                                                        };
                                                        await updateOrdem(os.id, { empresaFinanceiro: newFin });
                                                        setOrdens(prev => prev.map(o => o.id === os.id ? { ...o, empresaFinanceiro: newFin } : o));
                                                    }}
                                                    style={{
                                                        background: 'var(--notion-bg-alt)',
                                                        border: '1px solid var(--notion-border)',
                                                        borderRadius: 4, padding: '2px 6px',
                                                        fontSize: 11, color: 'var(--notion-text)', fontWeight: 600,
                                                        width: 70, outline: 'none', textAlign: 'center',
                                                    }}
                                                />
                                            </div>

                                            <div style={{ flex: 1 }} />

                                            {/* Envios progress */}
                                            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                                {envios.map((etapa, i) => (
                                                    <div key={i} title={etapa.nome} style={{
                                                        width: 7, height: 7, borderRadius: '50%',
                                                        backgroundColor: etapa.enviado ? '#28A06A' : etapaCompleta(etapa) ? '#0075de' : 'var(--notion-text-secondary)',
                                                    }} />
                                                ))}
                                            </div>

                                            {/* Financial status */}
                                            <span style={{ fontSize: 12, fontWeight: 600, color: recebido ? '#28A06A' : '#C88010', minWidth: 90, textAlign: 'right' }}>
                                                {formatMoney(total)}
                                            </span>

                                            {/* Payment badge */}
                                            <span style={{
                                                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                                                color: recebido ? '#28A06A' : '#C88010',
                                                background: recebido ? 'rgba(40,160,106,0.12)' : 'rgba(200,128,16,0.12)',
                                                border: `1px solid ${recebido ? 'rgba(40,160,106,0.25)' : 'rgba(200,128,16,0.25)'}`,
                                            }}>
                                                {recebido ? 'RECEBIDO' : 'PENDENTE'}
                                            </span>

                                            <button
                                                onClick={(e) => { e.stopPropagation(); navigate(`/ordens/${os.id}`); }}
                                                style={{ color: 'var(--notion-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                                                title="Abrir OS"
                                            >
                                                <ExternalLink size={13} />
                                            </button>
                                        </div>

                                        {/* Expanded */}
                                        {expanded && (
                                            <div style={{ padding: '0 14px 14px 40px' }}>
                                                {/* Financial section */}
                                                <div style={{
                                                    background: 'var(--notion-bg-alt)', border: '1px solid var(--notion-border)',
                                                    borderRadius: 8, padding: '10px 12px', marginBottom: 10,
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                                        <DollarSign size={12} style={{ color: 'var(--notion-blue)' }} />
                                                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--notion-text-secondary)' }}>
                                                            Financeiro
                                                        </span>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
                                                        <div>
                                                            <div style={{ fontSize: 10, color: 'var(--notion-text-secondary)' }}>Custos</div>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--notion-text)' }}>{formatMoney(custos)}</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 10, color: 'var(--notion-text-secondary)' }}>Honorário</div>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--notion-text)' }}>{formatMoney(honorario)}</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 10, color: 'var(--notion-text-secondary)' }}>Adiantado</div>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: adiantado > 0 ? '#C84040' : 'var(--notion-text-secondary)' }}>
                                                                {adiantado > 0 ? formatMoney(adiantado) : '—'}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 10, color: 'var(--notion-text-secondary)' }}>Total empresa</div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: recebido ? '#28A06A' : '#C88010' }}>
                                                                {formatMoney(total)}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* NF + Actions */}
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                                        {/* Nota Fiscal */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <span style={{ fontSize: 10, color: 'var(--notion-text-secondary)' }}>NF:</span>
                                                            <input
                                                                type="text"
                                                                value={fin?.numero_nf || ''}
                                                                placeholder="Nº da nota"
                                                                onChange={async (e) => {
                                                                    const nf = e.target.value;
                                                                    const newFin: EmpresaFinanceiro = {
                                                                        ...(fin || { recebido: false }),
                                                                        numero_nf: nf,
                                                                    };
                                                                    await updateOrdem(os.id, { empresaFinanceiro: newFin });
                                                                    // Update local state
                                                                    setOrdens(prev => prev.map(o => o.id === os.id ? { ...o, empresaFinanceiro: newFin } : o));
                                                                }}
                                                                style={{
                                                                    background: 'var(--notion-bg-alt)',
                                                                    border: '1px solid var(--notion-border)',
                                                                    borderRadius: 4, padding: '3px 6px',
                                                                    fontSize: 11, color: 'var(--notion-text)',
                                                                    width: 90, outline: 'none',
                                                                }}
                                                            />
                                                        </div>

                                                        <div style={{ width: 1, height: 16, background: 'var(--notion-border)' }} />

                                                        {!recebido ? (
                                                            <button
                                                                onClick={() => handleMarcarRecebido(os)}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                                    fontSize: 11, fontWeight: 600, color: '#28A06A',
                                                                    background: 'rgba(40,160,106,0.12)', border: '1px solid rgba(40,160,106,0.25)',
                                                                    borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                                                                }}
                                                            >
                                                                <Check size={12} /> Marcar recebido
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleDesmarcarRecebido(os)}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                                    fontSize: 11, fontWeight: 500, color: 'var(--notion-text-secondary)',
                                                                    background: 'var(--notion-bg-alt)', border: '1px solid var(--notion-border)',
                                                                    borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                                                                }}
                                                            >
                                                                <X size={12} /> Desmarcar
                                                            </button>
                                                        )}
                                                        {recebido && fin?.recebido_em && (
                                                            <span style={{ fontSize: 10, color: '#28A06A' }}>
                                                                em {new Date(fin.recebido_em).toLocaleDateString('pt-BR')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Envios */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {envios.map((etapa, eIdx) => {
                                                        const completa = etapaCompleta(etapa);
                                                        return (
                                                            <div key={eIdx} style={{
                                                                border: `1px solid ${etapa.enviado ? 'rgba(40,160,106,0.2)' : completa ? 'rgba(0,117,222,0.2)' : 'var(--notion-border)'}`,
                                                                borderRadius: 8, padding: '8px 10px',
                                                                background: etapa.enviado ? 'rgba(40,160,106,0.04)' : completa ? 'rgba(0,117,222,0.04)' : 'var(--notion-bg-alt)',
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                        <span style={{
                                                                            fontSize: 9, fontWeight: 700,
                                                                            color: etapa.enviado ? '#28A06A' : completa ? '#0075de' : 'var(--notion-text-secondary)',
                                                                            background: etapa.enviado ? 'rgba(40,160,106,0.15)' : completa ? 'rgba(0,117,222,0.15)' : 'var(--notion-border)',
                                                                            borderRadius: 3, padding: '1px 5px',
                                                                        }}>{etapa.etapa}</span>
                                                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--notion-text)' }}>{etapa.nome}</span>
                                                                    </div>
                                                                    {etapa.enviado ? (
                                                                        <span style={{ fontSize: 10, color: '#28A06A', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                            <Mail size={10} /> Enviado {new Date(etapa.enviado_em!).toLocaleDateString('pt-BR')}
                                                                        </span>
                                                                    ) : completa ? (
                                                                        <span style={{ fontSize: 10, color: '#0075de', fontWeight: 500 }}>Pronto p/ enviar</span>
                                                                    ) : (
                                                                        <span style={{ fontSize: 10, color: 'var(--notion-text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                            <Clock size={10} /> Aguardando docs
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                                    {etapa.documentos.map((doc) => (
                                                                        <div key={doc.tipo} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                            {doc.pronto
                                                                                ? <CheckCircle2 size={11} style={{ color: '#28A06A' }} />
                                                                                : <Circle size={11} style={{ color: 'var(--notion-text-secondary)' }} />
                                                                            }
                                                                            <span style={{ fontSize: 11, color: doc.pronto ? 'var(--notion-text-secondary)' : 'var(--notion-text-secondary)' }}>
                                                                                {docLabel(doc.tipo)}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

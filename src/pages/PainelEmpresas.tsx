// src/pages/PainelEmpresas.tsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Building2, Mail, CheckCircle2, Circle, Clock, ExternalLink, ChevronDown, ChevronRight, DollarSign, Check, X } from 'lucide-react';
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
        return ordens
            .filter((os) => os.empresaParceiraId === selectedEmpresa)
            .sort((a, b) => b.numero - a.numero);
    }, [ordens, selectedEmpresa]);

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
                <p style={{ color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 48 }}>Carregando...</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <Building2 size={24} style={{ color: 'var(--color-primary)' }} />
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                        Painel de Empresas
                    </h1>
                    <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
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
                            border: `1px solid ${selectedEmpresa === emp.id ? emp.cor : 'var(--color-gray-700)'}`,
                            background: selectedEmpresa === emp.id ? `${emp.cor}18` : 'transparent',
                            color: selectedEmpresa === emp.id ? emp.cor : 'var(--color-text-secondary)',
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
                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
                        {[
                            { label: 'OS Ativas', value: stats.totalOs, display: String(stats.totalOs), color: empresa.cor },
                            { label: 'A Receber', value: stats.totalDevido, display: formatMoney(stats.totalDevido), color: '#C88010' },
                            { label: 'Recebido', value: stats.totalRecebido, display: formatMoney(stats.totalRecebido), color: '#28A06A' },
                            { label: 'Adiantado', value: stats.totalAdiantado, display: formatMoney(stats.totalAdiantado), color: '#C84040' },
                            { label: 'Envios Pendentes', value: stats.enviosPendentes, display: String(stats.enviosPendentes), color: 'var(--color-text-primary)' },
                        ].map((stat) => (
                            <div key={stat.label} style={{
                                background: 'var(--color-gray-900)', border: '1px solid var(--color-gray-700)',
                                borderRadius: 10, padding: '12px 14px',
                            }}>
                                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
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
                        <div style={{ background: 'var(--color-gray-900)', border: '1px solid var(--color-gray-700)', borderRadius: 10, padding: 48, textAlign: 'center' }}>
                            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>Nenhuma OS vinculada a {empresa.nome}.</p>
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
                                        background: 'var(--color-gray-900)',
                                        border: `1px solid ${recebido ? 'rgba(40,160,106,0.3)' : 'var(--color-gray-700)'}`,
                                        borderRadius: 10, overflow: 'hidden',
                                    }}>
                                        {/* OS Header */}
                                        <div
                                            onClick={() => toggleExpand(os.id)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                                            className="hover:bg-white/[0.02] transition-colors"
                                        >
                                            {expanded
                                                ? <ChevronDown size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                                                : <ChevronRight size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                                            }

                                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)', minWidth: 55 }}>
                                                OS #{os.numero}
                                            </span>

                                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                                {os.tipoServico?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                            </span>

                                            {/* NF inline */}
                                            <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>NF:</span>
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
                                                        background: 'rgba(255,255,255,0.06)',
                                                        border: '1px solid rgba(255,255,255,0.08)',
                                                        borderRadius: 4, padding: '2px 6px',
                                                        fontSize: 11, color: '#d4a843', fontWeight: 600,
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
                                                        backgroundColor: etapa.enviado ? '#28A06A' : etapaCompleta(etapa) ? '#d4a843' : 'var(--color-gray-600)',
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
                                                style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
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
                                                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                                                    borderRadius: 8, padding: '10px 12px', marginBottom: 10,
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                                        <DollarSign size={12} style={{ color: 'var(--color-primary)' }} />
                                                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-tertiary)' }}>
                                                            Financeiro
                                                        </span>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
                                                        <div>
                                                            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Custos</div>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{formatMoney(custos)}</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Honorário</div>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{formatMoney(honorario)}</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Adiantado</div>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: adiantado > 0 ? '#C84040' : 'var(--color-text-tertiary)' }}>
                                                                {adiantado > 0 ? formatMoney(adiantado) : '—'}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Total empresa</div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: recebido ? '#28A06A' : '#C88010' }}>
                                                                {formatMoney(total)}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* NF + Actions */}
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                                        {/* Nota Fiscal */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>NF:</span>
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
                                                                    background: 'rgba(255,255,255,0.06)',
                                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                                    borderRadius: 4, padding: '3px 6px',
                                                                    fontSize: 11, color: '#e2e8f0',
                                                                    width: 90, outline: 'none',
                                                                }}
                                                            />
                                                        </div>

                                                        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />

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
                                                                    fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)',
                                                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
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
                                                                border: `1px solid ${etapa.enviado ? 'rgba(40,160,106,0.2)' : completa ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.06)'}`,
                                                                borderRadius: 8, padding: '8px 10px',
                                                                background: etapa.enviado ? 'rgba(40,160,106,0.04)' : completa ? 'rgba(212,168,67,0.04)' : 'rgba(255,255,255,0.01)',
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                        <span style={{
                                                                            fontSize: 9, fontWeight: 700,
                                                                            color: etapa.enviado ? '#28A06A' : completa ? '#d4a843' : 'var(--color-text-tertiary)',
                                                                            background: etapa.enviado ? 'rgba(40,160,106,0.15)' : completa ? 'rgba(212,168,67,0.15)' : 'rgba(255,255,255,0.06)',
                                                                            borderRadius: 3, padding: '1px 5px',
                                                                        }}>{etapa.etapa}</span>
                                                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{etapa.nome}</span>
                                                                    </div>
                                                                    {etapa.enviado ? (
                                                                        <span style={{ fontSize: 10, color: '#28A06A', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                            <Mail size={10} /> Enviado {new Date(etapa.enviado_em!).toLocaleDateString('pt-BR')}
                                                                        </span>
                                                                    ) : completa ? (
                                                                        <span style={{ fontSize: 10, color: '#d4a843', fontWeight: 500 }}>Pronto p/ enviar</span>
                                                                    ) : (
                                                                        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                            <Clock size={10} /> Aguardando docs
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                                    {etapa.documentos.map((doc) => (
                                                                        <div key={doc.tipo} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                            {doc.pronto
                                                                                ? <CheckCircle2 size={11} style={{ color: '#28A06A' }} />
                                                                                : <Circle size={11} style={{ color: 'var(--color-gray-600)' }} />
                                                                            }
                                                                            <span style={{ fontSize: 11, color: doc.pronto ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)' }}>
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

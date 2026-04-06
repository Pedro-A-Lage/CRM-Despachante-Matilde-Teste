import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrdens, getClientes, getVeiculos, saveProtocolo, getProtocolos } from '../lib/database';
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
import type { ProtocoloProcesso, TipoServico } from '../types';
import {
    FileText, Printer, Plus, Calendar, Trash2, UserPlus,
    ChevronDown, ChevronUp, Edit2, Clock, Hash, Car, User,
    CheckCircle, RotateCcw, Shield, Loader2, ClipboardList
} from 'lucide-react';

const TIPO_BADGE: Record<string, { color: string; bg: string; label: string; icon: any }> = {
    entrada: { color: 'var(--color-info)', bg: 'var(--color-info-bg)', label: 'Entrada', icon: ClipboardList },
    reentrada: { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', label: 'Reentrada', icon: RotateCcw },
    sifap: { color: 'var(--color-success)', bg: 'var(--color-success-bg)', label: 'SIFAP', icon: Shield },
};

export default function ProtocoloDiario() {
    const navigate = useNavigate();
    const serviceLabels = useServiceLabels();
    const [data, setData] = useState(new Date().toISOString().split('T')[0]!);
    const [refreshKey, setRefreshKey] = useState(0);

    const [manualProcessos, setManualProcessos] = useState<ProtocoloProcesso[]>([]);
    const [mNome, setMNome] = useState('');
    const [mPlaca, setMPlaca] = useState('');
    const [mChassi, setMChassi] = useState('');
    const [mRenavam, setMRenavam] = useState('');
    const [mServico, setMServico] = useState<TipoServico>('transferencia');
    const [mTipoEntrada, setMTipoEntrada] = useState<string>('entrada');
    const [showAvulso, setShowAvulso] = useState(false);

    const [protocolos, setProtocolos] = useState<any[]>([]);
    const [ordens, setOrdens] = useState<any[]>([]);
    const [clientes, setClientes] = useState<any[]>([]);
    const [veiculos, setVeiculos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            getProtocolos(), getOrdens(), getClientes(), getVeiculos()
        ]).then(([p, o, c, v]) => {
            setProtocolos(p);
            setOrdens(o);
            setClientes(c);
            setVeiculos(v);
            setLoading(false);
        });
    }, [refreshKey]);

    const protocoloHoje = useMemo(
        () => protocolos.find((p) => p.data === data),
        [protocolos, data]
    );

    const osComEntrada = useMemo(() => {
        return ordens.filter((os) => {
            const entradas = os.delegacia?.entradas || [];
            return entradas.some((e: any) => e.data === data);
        });
    }, [ordens, data]);

    const osComSifap = useMemo(() => {
        return ordens.filter((os) => {
            return os.sifap?.dataRegistro === data;
        });
    }, [ordens, data]);

    const osParaProtocolo = useMemo(() => {
        const idsEntrada = new Set(osComEntrada.map((o: any) => o.id));
        const sifapExtras = osComSifap.filter((o: any) => !idsEntrada.has(o.id));
        return [...osComEntrada, ...sifapExtras];
    }, [osComEntrada, osComSifap]);

    useMemo(() => {
        if (protocoloHoje) {
            const manuais = protocoloHoje.processos.filter((p: any) => p.manual);
            setManualProcessos(manuais);
        } else {
            setManualProcessos([]);
        }
    }, [protocoloHoje?.id, data]);

    const addManualProcesso = () => {
        if (!mNome.trim()) return;
        const novo: ProtocoloProcesso = {
            clienteNome: mNome.trim().toUpperCase(),
            veiculoPlaca: mPlaca.trim().toUpperCase(),
            veiculoChassi: mChassi.trim().toUpperCase(),
            veiculoRenavam: mRenavam.trim(),
            tipoServico: mServico,
            tipoEntrada: mTipoEntrada,
            manual: true,
        };
        setManualProcessos(prev => [...prev, novo]);
        setMNome(''); setMPlaca(''); setMChassi(''); setMRenavam('');
    };

    const removeManualProcesso = (index: number) => {
        setManualProcessos(prev => prev.filter((_, i) => i !== index));
    };

    const gerarProtocolo = async () => {
        const processosOS: ProtocoloProcesso[] = osParaProtocolo.map((os) => {
            const cliente = clientes.find((c) => c.id === os.clienteId);
            const veiculo = veiculos.find((v) => v.id === os.veiculoId);
            const entradasDoDia = (os.delegacia?.entradas || []).filter((e: any) => e.data === data);
            const entrada = entradasDoDia.length > 0 ? entradasDoDia[entradasDoDia.length - 1] : null;
            const temSifapHoje = os.sifap?.dataRegistro === data;

            return {
                osId: os.id,
                osNumero: os.numero,
                clienteNome: cliente?.nome || '—',
                veiculoPlaca: veiculo?.placa || '—',
                veiculoChassi: veiculo?.chassi || '—',
                veiculoRenavam: veiculo?.renavam || '—',
                tipoServico: os.tipoServico,
                tipoEntrada: entrada?.tipo || (temSifapHoje ? 'sifap' : 'entrada'),
                sifap: temSifapHoje || (os.sifap?.necessario && !!os.sifap?.dataRegistro),
            };
        });

        const todosProcessos = [...processosOS, ...manualProcessos];

        await saveProtocolo({
            data,
            processos: todosProcessos,
            id: protocoloHoje?.id,
        });

        setRefreshKey((k) => k + 1);
    };

    const imprimirProtocolo = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        const protocolo = protocoloHoje;
        if (!protocolo) return;

        printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Protocolo Diário - ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #E8A317; padding-bottom: 10px; }
          .header-text { text-align: right; }
          .header h1 { font-size: 18px; color: #1A1A1A; }
          .header h2 { font-size: 14px; color: #E8A317; margin-top: 2px; }
          .header p { font-size: 12px; color: #666; margin-top: 6px; }
          .info { margin-bottom: 15px; }
          .info strong { color: #E8A317; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #E8A317; color: white; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
          td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 10px; }
          tr:nth-child(even) { background: #f9f9f9; }
          .signatures { display: flex; justify-content: space-around; margin-top: 50px; page-break-inside: avoid; }
          .sig-box { width: 300px; text-align: center; font-size: 10px; }
          .sig-line { border-bottom: 1px solid #000; margin-bottom: 5px; height: 30px; }
          @media print { @page { size: landscape; margin: 10mm; } body { padding: 10mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${window.location.origin}/logo.png" alt="Logo" style="height: 100px; object-fit: contain;" />
          <div class="header-text">
            <h1>DESPACHANTE MATILDE</h1>
            <h2>Protocolo Diário</h2>
            <p>Delegacia de Itabira — ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>
        <div class="info">
          <strong>Data:</strong> ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')} &nbsp;&nbsp;|&nbsp;&nbsp;
          <strong>Total de Processos:</strong> ${protocolo.processos.length}
        </div>
        <table>
          <thead><tr><th>Nome Cliente</th><th>Placa</th><th>Chassi</th><th>Renavam</th><th>Serviço</th><th>Tipo</th></tr></thead>
          <tbody>
            ${[...protocolo.processos].sort((a: any, b: any) => {
              const ordem: Record<string, number> = { entrada: 0, reentrada: 1, sifap: 2, requerimento: 3 };
              return (ordem[a.tipoEntrada] ?? 4) - (ordem[b.tipoEntrada] ?? 4);
            }).map((p: any) => `
              <tr>
                <td>${p.clienteNome}</td>
                <td>${p.veiculoPlaca || ''}</td>
                <td style="font-size:9px">${p.veiculoChassi || ''}</td>
                <td>${p.veiculoRenavam || ''}</td>
                <td>${getServicoLabel(serviceLabels, p.tipoServico)}</td>
                <td>${p.tipoEntrada === 'sifap' ? 'SIFAP' : p.tipoEntrada === 'entrada' ? 'Entrada' : 'Reentrada'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="signatures">
          <div class="sig-box"><div class="sig-line"></div><strong>DESPACHANTE MATILDE</strong><br>Entregue por</div>
          <div class="sig-box"><div class="sig-line"></div><strong>DELEGACIA DE TRÂNSITO</strong><br>Recebido por (Nome / Matrícula / Data)</div>
        </div>
      </body></html>
    `);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    };

    const dataFormatada = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
                <Loader2 size={24} className="spin" style={{ color: 'var(--color-primary)' }} />
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Carregando protocolo...</span>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 48 }}>

            {/* ===== HEADER ===== */}
            <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: 14, padding: '20px 24px', marginBottom: 20,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 42, height: 42, borderRadius: 12,
                            background: 'rgba(245,158,11,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <FileText size={20} style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                                Protocolo Diário
                            </h2>
                            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>
                                {dataFormatada}
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Date picker */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                            borderRadius: 8, padding: '6px 12px',
                        }}>
                            <Calendar size={14} style={{ color: 'var(--color-primary)' }} />
                            <input
                                type="date"
                                value={data}
                                onChange={(e) => setData(e.target.value)}
                                style={{
                                    background: 'transparent', border: 'none', outline: 'none',
                                    fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)',
                                    fontFamily: 'var(--font-family)', cursor: 'pointer',
                                }}
                            />
                        </div>

                        <button onClick={gerarProtocolo}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                                background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                                color: 'var(--color-gray-900)', fontWeight: 700, fontSize: 12,
                                fontFamily: 'var(--font-family)',
                                boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
                            }}>
                            {protocoloHoje ? <CheckCircle size={14} /> : <Plus size={14} />}
                            {protocoloHoje ? 'Atualizar' : 'Gerar'} Protocolo
                        </button>

                        {protocoloHoje && (
                            <button onClick={imprimirProtocolo}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '8px 14px', borderRadius: 10,
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-body)', cursor: 'pointer',
                                    color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: 12,
                                    fontFamily: 'var(--font-family)',
                                }}>
                                <Printer size={14} /> Imprimir
                            </button>
                        )}
                    </div>
                </div>

                {/* Info: processos disponíveis */}
                {osParaProtocolo.length > 0 && !protocoloHoje && (
                    <div style={{
                        marginTop: 14, padding: '10px 14px', borderRadius: 8,
                        background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <ClipboardList size={14} style={{ color: 'var(--color-primary)' }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>
                            {osParaProtocolo.length} processo(s) com entrada na delegacia{osComSifap.length > 0 ? ' e/ou SIFAP' : ''} nesta data.
                        </span>
                    </div>
                )}
            </div>

            {/* ===== STATS CARDS (quando tem protocolo) ===== */}
            {protocoloHoje && (
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 12, marginBottom: 20,
                }}>
                    {[
                        {
                            label: 'Total',
                            value: protocoloHoje.processos.length,
                            color: 'var(--color-primary)',
                            bg: 'rgba(245,158,11,0.1)',
                        },
                        {
                            label: 'Entradas',
                            value: protocoloHoje.processos.filter((p: any) => p.tipoEntrada === 'entrada').length,
                            color: 'var(--color-info)',
                            bg: 'var(--color-info-bg)',
                        },
                        {
                            label: 'Reentradas',
                            value: protocoloHoje.processos.filter((p: any) => p.tipoEntrada === 'reentrada').length,
                            color: 'var(--color-warning)',
                            bg: 'var(--color-warning-bg)',
                        },
                        {
                            label: 'SIFAP',
                            value: protocoloHoje.processos.filter((p: any) => p.tipoEntrada === 'sifap' || p.sifap).length,
                            color: 'var(--color-success)',
                            bg: 'var(--color-success-bg)',
                        },
                        {
                            label: 'Avulsos',
                            value: protocoloHoje.processos.filter((p: any) => p.manual).length,
                            color: 'var(--color-purple)',
                            bg: 'var(--color-purple-bg)',
                        },
                    ].map(stat => (
                        <div key={stat.label} style={{
                            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                            borderRadius: 12, padding: '14px 18px',
                            display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 9,
                                background: stat.bg,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 16, fontWeight: 800, color: stat.color,
                            }}>
                                {stat.value}
                            </div>
                            <span style={{
                                fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)',
                                textTransform: 'uppercase', letterSpacing: '0.04em',
                            }}>{stat.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* ===== PROTOCOLO - CARDS DOS PROCESSOS ===== */}
            {protocoloHoje ? (
                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderRadius: 14, overflow: 'hidden', marginBottom: 20,
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '14px 20px',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: 'rgba(245,158,11,0.04)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FileText size={16} style={{ color: 'var(--color-primary)' }} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                Protocolo — {new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </span>
                        </div>
                        <span style={{
                            fontSize: 11, fontWeight: 700, color: 'var(--color-primary)',
                            background: 'rgba(245,158,11,0.12)', padding: '4px 10px', borderRadius: 6,
                        }}>
                            {protocoloHoje.processos.length} processo{protocoloHoje.processos.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Lista de processos como cards */}
                    {protocoloHoje.processos.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center' }}>
                            <FileText size={32} style={{ color: 'var(--color-text-tertiary)', margin: '0 auto 12px', opacity: 0.3 }} />
                            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Nenhum processo neste protocolo.</p>
                        </div>
                    ) : (
                        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[...protocoloHoje.processos].sort((a: any, b: any) => {
                                const ordem: Record<string, number> = { entrada: 0, reentrada: 1, sifap: 2, requerimento: 3 };
                                const oa = ordem[a.tipoEntrada] ?? 4;
                                const ob = ordem[b.tipoEntrada] ?? 4;
                                return oa - ob;
                            }).map((p: any, idx: number) => {
                                const tipoCfg = (TIPO_BADGE[p.tipoEntrada] || TIPO_BADGE.entrada)!;
                                const TipoIcon = tipoCfg!.icon;
                                return (
                                    <div key={p.osId || `manual-${idx}`}
                                        onClick={() => { if (p.osId) navigate(`/ordens/${p.osId}`); }}
                                        style={{
                                        display: 'flex', alignItems: 'center',
                                        background: 'var(--bg-body)', borderRadius: 10,
                                        border: '1px solid var(--border-color)',
                                        borderLeft: `4px solid ${tipoCfg.color}`,
                                        padding: '10px 14px', gap: 14,
                                        transition: 'border-color 0.15s, background 0.15s',
                                        cursor: p.osId ? 'pointer' : 'default',
                                    }}
                                        onMouseEnter={e => { if (p.osId) (e.currentTarget as HTMLElement).style.borderColor = tipoCfg.color; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; }}
                                    >
                                        {/* Número */}
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                                            background: p.manual ? 'rgba(139,92,246,0.1)' : 'rgba(59,130,246,0.08)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {p.manual ? (
                                                <UserPlus size={14} style={{ color: 'var(--color-purple)' }} />
                                            ) : (
                                                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-info)' }}>
                                                    #{p.osNumero}
                                                </span>
                                            )}
                                        </div>

                                        {/* Dados */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                                <span style={{
                                                    fontSize: 13, fontWeight: 700,
                                                    color: 'var(--color-text-primary)',
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                }}>
                                                    {p.clienteNome}
                                                </span>
                                                {p.manual && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 700, padding: '1px 6px',
                                                        borderRadius: 4, background: 'var(--color-purple-bg)',
                                                        color: 'var(--color-purple)',
                                                    }}>AVULSO</span>
                                                )}
                                            </div>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                fontSize: 11, color: 'var(--color-text-tertiary)',
                                            }}>
                                                {p.veiculoPlaca && p.veiculoPlaca !== '—' && (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                                                        <Car size={10} /> {p.veiculoPlaca}
                                                    </span>
                                                )}
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <FileText size={10} /> {getServicoLabel(serviceLabels, p.tipoServico)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Badge tipo */}
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            fontSize: 10, fontWeight: 700,
                                            padding: '4px 10px', borderRadius: 6,
                                            background: tipoCfg.bg, color: tipoCfg.color,
                                            flexShrink: 0,
                                        }}>
                                            <TipoIcon size={10} />
                                            {tipoCfg.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                <div style={{
                    background: 'var(--bg-card)', border: '2px dashed var(--border-color)',
                    borderRadius: 14, padding: 48, textAlign: 'center', marginBottom: 20,
                }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 14,
                        background: 'var(--bg-body)', margin: '0 auto 16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <FileText size={24} style={{ color: 'var(--color-text-tertiary)', opacity: 0.4 }} />
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
                        Nenhum protocolo para esta data
                    </h3>
                    <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
                        {osParaProtocolo.length > 0
                            ? `${osParaProtocolo.length} processo(s) disponíveis. Clique em "Gerar Protocolo" acima.`
                            : 'Registre entradas na delegacia nas OS para gerar o protocolo.'}
                    </p>
                </div>
            )}

            {/* ===== ADICIONAR AVULSO (collapsible) ===== */}
            <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: 14, overflow: 'hidden', marginBottom: 20,
            }}>
                <div
                    onClick={() => setShowAvulso(!showAvulso)}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                        transition: 'background 0.15s',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: 'var(--color-purple-bg)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <UserPlus size={14} style={{ color: 'var(--color-purple)' }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            Processo Avulso (sem OS)
                        </span>
                        {manualProcessos.length > 0 && (
                            <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                                background: 'var(--color-purple-bg)', color: 'var(--color-purple)',
                            }}>{manualProcessos.length}</span>
                        )}
                    </div>
                    {showAvulso ? <ChevronUp size={18} style={{ color: 'var(--color-text-tertiary)' }} /> : <ChevronDown size={18} style={{ color: 'var(--color-text-tertiary)' }} />}
                </div>

                {showAvulso && (
                    <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border-color)' }}>
                        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '14px 0 12px' }}>
                            Para protocolar processos que não possuem Ordem de Serviço no sistema.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                            {[
                                { label: 'Nome Cliente *', value: mNome, set: setMNome, placeholder: 'Nome do cliente', icon: User },
                                { label: 'Placa', value: mPlaca, set: setMPlaca, placeholder: 'ABC1D23', icon: Car },
                                { label: 'Chassi', value: mChassi, set: setMChassi, placeholder: 'Chassi', icon: Hash },
                                { label: 'Renavam', value: mRenavam, set: setMRenavam, placeholder: 'Renavam', icon: Hash },
                            ].map(field => (
                                <div key={field.label}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-gray-400)', marginBottom: 4 }}>
                                        <field.icon size={10} /> {field.label}
                                    </label>
                                    <input type="text" className="form-input" value={field.value}
                                        onChange={(e) => field.set(e.target.value)} placeholder={field.placeholder}
                                        style={{ fontSize: 12, padding: '7px 10px', borderRadius: 8 }} />
                                </div>
                            ))}
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-gray-400)', marginBottom: 4 }}>
                                    <FileText size={10} /> Serviço
                                </label>
                                <select className="form-select" value={mServico} onChange={(e) => setMServico(e.target.value as TipoServico)}
                                    style={{ fontSize: 12, padding: '7px 10px', borderRadius: 8 }}>
                                    {Object.entries(serviceLabels).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                    <option value="requerimento">Requerimento</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-gray-400)', marginBottom: 4 }}>
                                    <ClipboardList size={10} /> Tipo
                                </label>
                                <select className="form-select" value={mTipoEntrada} onChange={(e) => setMTipoEntrada(e.target.value)}
                                    style={{ fontSize: 12, padding: '7px 10px', borderRadius: 8 }}>
                                    <option value="entrada">Entrada</option>
                                    <option value="reentrada">Reentrada</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button onClick={addManualProcesso} disabled={!mNome.trim()}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '8px 16px', borderRadius: 8, border: 'none',
                                    cursor: mNome.trim() ? 'pointer' : 'not-allowed',
                                    background: mNome.trim() ? '#8B5CF6' : 'var(--border-color)',
                                    color: mNome.trim() ? '#fff' : 'var(--color-text-tertiary)',
                                    fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-family)',
                                }}>
                                <Plus size={14} /> Adicionar
                            </button>
                        </div>

                        {/* Lista de avulsos pendentes */}
                        {manualProcessos.length > 0 && (
                            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {manualProcessos.map((p, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 12px', borderRadius: 8,
                                        background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                                        borderLeft: '3px solid var(--color-purple)',
                                    }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', flex: 1 }}>
                                            {p.clienteNome}
                                        </span>
                                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                                            {p.veiculoPlaca || '—'}
                                        </span>
                                        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                                            {getServicoLabel(serviceLabels, p.tipoServico)}
                                        </span>
                                        <div style={{ display: 'flex', gap: 2 }}>
                                            <button onClick={() => {
                                                setMNome(p.clienteNome); setMPlaca(p.veiculoPlaca);
                                                setMChassi(p.veiculoChassi); setMRenavam(p.veiculoRenavam);
                                                setMServico(p.tipoServico as TipoServico); setMTipoEntrada(p.tipoEntrada);
                                                removeManualProcesso(i);
                                            }} title="Editar"
                                                style={{
                                                    padding: 4, borderRadius: 5, border: 'none', cursor: 'pointer',
                                                    background: 'transparent', color: 'var(--color-gray-500)',
                                                    display: 'flex', fontFamily: 'var(--font-family)',
                                                }}>
                                                <Edit2 size={12} />
                                            </button>
                                            <button onClick={() => removeManualProcesso(i)} title="Remover"
                                                style={{
                                                    padding: 4, borderRadius: 5, border: 'none', cursor: 'pointer',
                                                    background: 'transparent', color: 'var(--color-danger)',
                                                    display: 'flex', fontFamily: 'var(--font-family)',
                                                }}>
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ===== PROTOCOLOS ANTERIORES ===== */}
            {protocolos.length > 1 && (
                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderRadius: 14, overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '14px 20px',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <Clock size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            Protocolos Anteriores
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {[...protocolos]
                            .sort((a, b) => b.data.localeCompare(a.data))
                            .filter((p: any) => p.data !== data)
                            .slice(0, 10)
                            .map((p: any, idx: number, arr: any[]) => (
                                <div
                                    key={p.id}
                                    onClick={() => setData(p.data)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        padding: '12px 20px', cursor: 'pointer',
                                        borderBottom: idx < arr.length - 1 ? '1px solid var(--border-color)' : 'none',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.04)'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                >
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 10,
                                        background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>
                                            {new Date(p.data + 'T12:00:00').getDate()}
                                        </span>
                                        <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-tertiary)', lineHeight: 1, marginTop: 1 }}>
                                            {new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                                        </span>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>
                                            {new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                                        </span>
                                    </div>
                                    <span style={{
                                        fontSize: 11, fontWeight: 700, color: 'var(--color-primary)',
                                        background: 'rgba(245,158,11,0.1)', padding: '3px 10px', borderRadius: 6,
                                    }}>
                                        {p.processos.length} processo{p.processos.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
}

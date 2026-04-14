import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrdens, getClientes, getVeiculos, saveProtocolo, getProtocolos, mesclarProtocolosDuplicados } from '../lib/database';
import { uploadFileToSupabase } from '../lib/fileStorage';
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
import type { ProtocoloProcesso, TipoServico, ProtocoloDiario as ProtocoloDiarioType } from '../types';
import { useToast } from '../components/Toast';
import {
    FileText, Printer, Plus, Calendar, Trash2, UserPlus,
    ChevronDown, ChevronUp, Edit2, Clock, Hash, Car, User,
    CheckCircle, RotateCcw, Shield, Loader2, ClipboardList,
    Camera, Image as ImageIcon, ExternalLink, Check, X, Search
} from 'lucide-react';

const TIPO_BADGE: Record<string, { color: string; bg: string; border: string; label: string; icon: any }> = {
    entrada: { color: 'var(--notion-blue)', bg: 'rgba(0,117,222,0.12)', border: 'rgba(0,117,222,0.35)', label: 'Entrada', icon: ClipboardList },
    reentrada: { color: 'var(--notion-orange)', bg: 'rgba(221,91,0,0.12)', border: 'rgba(221,91,0,0.35)', label: 'Reentrada', icon: RotateCcw },
    sifap: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', label: 'SIFAP', icon: Shield },
};

export default function ProtocoloDiario() {
    const navigate = useNavigate();
    const serviceLabels = useServiceLabels();
    const { showToast } = useToast();
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

    // Filtro de datas para protocolos anteriores
    const [filtroDataInicio, setFiltroDataInicio] = useState('');
    const [filtroDataFim, setFiltroDataFim] = useState('');
    const [filtroBusca, setFiltroBusca] = useState('');
    const [mostrarCompletos, setMostrarCompletos] = useState(false);

    // Upload de foto assinada
    const [uploadingFoto, setUploadingFoto] = useState(false);
    const fotoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        Promise.all([
            getProtocolos(), getOrdens(), getClientes(), getVeiculos()
        ]).then(([p, o, c, v]) => {
            // Deduplica protocolos com a mesma data (mantém o com mais processos)
            const porData = new Map<string, any>();
            for (const proto of p) {
                const existing = porData.get(proto.data);
                if (!existing) {
                    porData.set(proto.data, proto);
                } else {
                    const currLen = proto.processos?.length || 0;
                    const existingLen = existing.processos?.length || 0;
                    if (currLen > existingLen) porData.set(proto.data, proto);
                }
            }
            const uniquos = Array.from(porData.values());
            setProtocolos(uniquos);
            setOrdens(o);
            setClientes(c);
            setVeiculos(v);
            setLoading(false);
        });
    }, [refreshKey]);

    const handleMesclarDuplicadas = async () => {
        try {
            const { mesclados, removidos } = await mesclarProtocolosDuplicados();
            if (mesclados === 0) {
                showToast('Nenhum protocolo duplicado encontrado', 'info');
            } else {
                showToast(`${mesclados} data(s) com duplicatas mesclada(s). ${removidos} registro(s) removido(s).`, 'success');
                setRefreshKey(k => k + 1);
            }
        } catch (err: any) {
            showToast('Erro ao mesclar duplicatas: ' + (err?.message || err), 'error');
        }
    };

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

    useEffect(() => {
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

    // Verifica se um processo está pronto (doc_pronto/entregue se tem OS, ou marcado concluído se avulso)
    const isProcessoOk = (p: any): boolean => {
        if (p.manual) return !!p.concluido;
        if (!p.osId) return false;
        const os = ordens.find(o => o.id === p.osId);
        if (!os) return false;
        return os.status === 'doc_pronto' || os.status === 'entregue';
    };

    // Conta quantos processos de um protocolo estão prontos
    const contarOk = (protocolo: any): { ok: number; total: number } => {
        const total = protocolo.processos.length;
        const ok = protocolo.processos.filter(isProcessoOk).length;
        return { ok, total };
    };

    // Toggle manual de concluído em processo avulso
    const toggleManualConcluido = async (protocolo: any, idx: number) => {
        const novosProcessos = protocolo.processos.map((p: any, i: number) =>
            i === idx ? { ...p, concluido: !p.concluido } : p
        );
        await saveProtocolo({ ...protocolo, processos: novosProcessos });
        setRefreshKey(k => k + 1);
    };

    // Upload de foto do protocolo assinado
    const handleUploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !protocoloHoje) return;
        setUploadingFoto(true);
        try {
            const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
            const path = `protocolos/${data}/assinado_${Date.now()}.${ext}`;
            const url = await uploadFileToSupabase(file, path);
            await saveProtocolo({
                ...protocoloHoje,
                fotoAssinadaUrl: url,
                fotoAssinadaNome: file.name,
                fotoAnexadaEm: new Date().toISOString(),
            });
            showToast('Foto do protocolo anexada com sucesso!', 'success');
            setRefreshKey(k => k + 1);
        } catch (err: any) {
            showToast('Erro ao anexar foto: ' + (err?.message || err), 'error');
        } finally {
            setUploadingFoto(false);
            if (fotoInputRef.current) fotoInputRef.current.value = '';
        }
    };

    const removerFoto = async () => {
        if (!protocoloHoje) return;
        await saveProtocolo({
            ...protocoloHoje,
            fotoAssinadaUrl: '',
            fotoAssinadaNome: '',
            fotoAnexadaEm: '',
        });
        showToast('Foto removida', 'info');
        setRefreshKey(k => k + 1);
    };

    // Filtrar protocolos anteriores por data, busca e status
    const buscaNorm = filtroBusca.trim().toLowerCase().replace(/[^\w]/g, '');
    const temFiltroAtivo = !!(filtroDataInicio || filtroDataFim || filtroBusca.trim());

    const protocolosAnterioresFiltrados = useMemo(() => {
        let list = [...protocolos]
            .sort((a, b) => b.data.localeCompare(a.data))
            .filter((p: any) => p.data !== data);

        // Filtro de datas
        if (filtroDataInicio) list = list.filter((p: any) => p.data >= filtroDataInicio);
        if (filtroDataFim) list = list.filter((p: any) => p.data <= filtroDataFim);

        // Filtro de busca por nome/placa/chassi nos processos
        if (buscaNorm) {
            list = list.filter((p: any) =>
                (p.processos || []).some((proc: any) => {
                    const nome = (proc.clienteNome || '').toLowerCase();
                    const placa = (proc.veiculoPlaca || '').toLowerCase().replace(/[^\w]/g, '');
                    const chassi = (proc.veiculoChassi || '').toLowerCase().replace(/[^\w]/g, '');
                    const renavam = (proc.veiculoRenavam || '').replace(/\D/g, '');
                    return nome.includes(filtroBusca.trim().toLowerCase()) ||
                        placa.includes(buscaNorm) ||
                        chassi.includes(buscaNorm) ||
                        renavam.includes(buscaNorm);
                })
            );
        }

        // Filtro: esconder completos (padrão) a menos que mostrarCompletos = true
        if (!mostrarCompletos) {
            list = list.filter((p: any) => {
                const { ok, total } = contarOk(p);
                return total === 0 || ok < total;
            });
        }

        // Se não há nenhum filtro ativo, limita aos últimos 9
        if (!temFiltroAtivo) list = list.slice(0, 9);

        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [protocolos, data, filtroDataInicio, filtroDataFim, buscaNorm, mostrarCompletos, ordens]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
                <Loader2 size={24} className="spin" style={{ color: 'var(--notion-blue)' }} />
                <span style={{ color: 'var(--notion-text-secondary)', fontSize: 13 }}>Carregando protocolo...</span>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 4px 48px' }}>

            {/* ===== HEADER ===== */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginBottom: 20,
                paddingBottom: 16,
                borderBottom: '1px solid var(--notion-border)',
                flexWrap: 'wrap',
            }}>
                <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: 'rgba(0,117,222,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--notion-blue)',
                    flexShrink: 0,
                }}>
                    <FileText size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                    <h1 style={{
                        margin: 0,
                        fontSize: '1.4rem',
                        fontWeight: 800,
                        color: 'var(--notion-text)',
                        letterSpacing: '-0.02em',
                    }}>
                        Protocolo Diário
                    </h1>
                    <p style={{
                        margin: '2px 0 0',
                        fontSize: '0.85rem',
                        color: 'var(--notion-text-secondary)',
                        textTransform: 'capitalize',
                    }}>
                        {dataFormatada}
                    </p>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'var(--notion-surface)', border: '1px solid var(--notion-border)',
                        borderRadius: 8, padding: '7px 12px', height: 38, boxSizing: 'border-box',
                    }}>
                        <Calendar size={14} style={{ color: 'var(--notion-blue)' }} />
                        <input
                            type="date"
                            value={data}
                            onChange={(e) => setData(e.target.value)}
                            style={{
                                background: 'transparent', border: 'none', outline: 'none',
                                fontSize: 13, fontWeight: 600, color: 'var(--notion-text)',
                                fontFamily: 'inherit', cursor: 'pointer',
                            }}
                        />
                    </div>

                    {/* Botão Hoje — só aparece se não estamos em hoje */}
                    {data !== new Date().toISOString().split('T')[0] && (
                        <button
                            onClick={() => setData(new Date().toISOString().split('T')[0]!)}
                            title="Ir para hoje"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '0 14px', height: 38, borderRadius: 8,
                                border: '1px solid rgba(0,117,222,0.35)',
                                background: 'rgba(0,117,222,0.08)',
                                color: 'var(--notion-blue)',
                                fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
                                cursor: 'pointer',
                            }}
                        >
                            <Clock size={13} /> Hoje
                        </button>
                    )}

                    <button onClick={gerarProtocolo}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '0 18px', height: 38, borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: 'var(--notion-blue)', color: '#fff',
                            fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
                        }}>
                        {protocoloHoje ? <CheckCircle size={14} /> : <Plus size={14} />}
                        {protocoloHoje ? 'Atualizar' : 'Gerar'} Protocolo
                    </button>

                    {protocoloHoje && (
                        <button onClick={imprimirProtocolo}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '0 14px', height: 38, borderRadius: 8,
                                border: '1px solid var(--notion-border)',
                                background: 'var(--notion-surface)', cursor: 'pointer',
                                color: 'var(--notion-text)', fontWeight: 600, fontSize: 13,
                                fontFamily: 'inherit',
                            }}>
                            <Printer size={14} /> Imprimir
                        </button>
                    )}
                </div>
            </div>

            {/* Info: processos disponíveis */}
            {osParaProtocolo.length > 0 && !protocoloHoje && (
                <div style={{
                    marginBottom: 16, padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(0,117,222,0.06)', border: '1px solid rgba(0,117,222,0.2)',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <ClipboardList size={16} style={{ color: 'var(--notion-blue)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--notion-text)' }}>
                        <strong style={{ color: 'var(--notion-blue)' }}>{osParaProtocolo.length}</strong> processo(s) com entrada na delegacia{osComSifap.length > 0 ? ' e/ou SIFAP' : ''} nesta data
                    </span>
                </div>
            )}

            {/* ===== STATS CARDS (quando tem protocolo — escondido em mobile) ===== */}
            {protocoloHoje && (
                <div className="hide-mobile" style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 10, marginBottom: 20,
                }}>
                    {[
                        {
                            label: 'Total',
                            value: protocoloHoje.processos.length,
                            color: 'var(--notion-text)',
                            bg: 'var(--notion-bg-alt)',
                            border: 'var(--notion-border)',
                        },
                        {
                            label: 'Entradas',
                            value: protocoloHoje.processos.filter((p: any) => p.tipoEntrada === 'entrada').length,
                            color: 'var(--notion-blue)',
                            bg: 'rgba(0,117,222,0.1)',
                            border: 'rgba(0,117,222,0.3)',
                        },
                        {
                            label: 'Reentradas',
                            value: protocoloHoje.processos.filter((p: any) => p.tipoEntrada === 'reentrada').length,
                            color: 'var(--notion-orange)',
                            bg: 'rgba(221,91,0,0.1)',
                            border: 'rgba(221,91,0,0.3)',
                        },
                        {
                            label: 'SIFAP',
                            value: protocoloHoje.processos.filter((p: any) => p.tipoEntrada === 'sifap' || p.sifap).length,
                            color: '#22c55e',
                            bg: 'rgba(34,197,94,0.1)',
                            border: 'rgba(34,197,94,0.3)',
                        },
                        {
                            label: 'Avulsos',
                            value: protocoloHoje.processos.filter((p: any) => p.manual).length,
                            color: '#8b5cf6',
                            bg: 'rgba(139,92,246,0.1)',
                            border: 'rgba(139,92,246,0.3)',
                        },
                    ].map(stat => (
                        <div key={stat.label} style={{
                            background: 'var(--notion-surface)',
                            border: '1px solid var(--notion-border)',
                            borderRadius: 12, padding: '14px 16px',
                            display: 'flex', alignItems: 'center', gap: 12,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        }}>
                            <div style={{
                                minWidth: 40, height: 40, borderRadius: 10, padding: '0 10px',
                                background: stat.bg,
                                border: `1px solid ${stat.border}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 16, fontWeight: 800, color: stat.color,
                            }}>
                                {stat.value}
                            </div>
                            <span style={{
                                fontSize: 11, fontWeight: 700, color: 'var(--notion-text-secondary)',
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                            }}>{stat.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* ===== FOTO DO PROTOCOLO ASSINADO ===== */}
            {protocoloHoje && (
                <div className="proto-foto-card" style={{
                    background: 'var(--notion-surface)', border: '1px solid var(--notion-border)',
                    borderRadius: 12, padding: '14px 18px', marginBottom: 16,
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: protocoloHoje.fotoAssinadaUrl ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.12)',
                        color: protocoloHoje.fotoAssinadaUrl ? '#22c55e' : '#8b5cf6',
                        border: protocoloHoje.fotoAssinadaUrl ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(139,92,246,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        {protocoloHoje.fotoAssinadaUrl ? <Check size={16} strokeWidth={3} /> : <ImageIcon size={16} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 120 }}>
                        <div className="proto-foto-title" style={{ fontSize: 13, fontWeight: 700, color: 'var(--notion-text)' }}>
                            {protocoloHoje.fotoAssinadaUrl ? 'Protocolo assinado anexado' : 'Foto do protocolo assinado'}
                        </div>
                        <div className="proto-foto-subtitle" style={{ fontSize: 11, color: 'var(--notion-text-secondary)', marginTop: 2 }}>
                            {protocoloHoje.fotoAssinadaUrl
                                ? `${protocoloHoje.fotoAssinadaNome || 'foto.jpg'} · anexada em ${protocoloHoje.fotoAnexadaEm ? new Date(protocoloHoje.fotoAnexadaEm).toLocaleString('pt-BR') : ''}`
                                : 'Tire uma foto do protocolo depois de receber da delegacia com a assinatura'}
                        </div>
                    </div>
                    <input
                        ref={fotoInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleUploadFoto}
                        style={{ display: 'none' }}
                    />
                    {protocoloHoje.fotoAssinadaUrl ? (
                        <>
                            <a
                                href={protocoloHoje.fotoAssinadaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '7px 14px', height: 34, boxSizing: 'border-box',
                                    background: 'var(--notion-blue)', color: '#fff',
                                    borderRadius: 8, fontSize: 12, fontWeight: 600,
                                    textDecoration: 'none',
                                }}
                            >
                                <ExternalLink size={13} /> Ver foto
                            </a>
                            <button
                                onClick={() => fotoInputRef.current?.click()}
                                disabled={uploadingFoto}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '7px 14px', height: 34,
                                    background: 'var(--notion-surface)', color: 'var(--notion-text)',
                                    border: '1px solid var(--notion-border)',
                                    borderRadius: 8, fontSize: 12, fontWeight: 600,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}
                            >
                                <Camera size={13} /> Trocar
                            </button>
                            <button
                                onClick={removerFoto}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '7px 12px', height: 34,
                                    background: 'transparent', color: '#dc2626',
                                    border: '1px solid rgba(220,38,38,0.3)',
                                    borderRadius: 8, fontSize: 12, fontWeight: 600,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}
                            >
                                <Trash2 size={13} />
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => fotoInputRef.current?.click()}
                            disabled={uploadingFoto}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '7px 14px', height: 34,
                                background: '#8b5cf6', color: '#fff',
                                border: 'none', borderRadius: 8,
                                fontSize: 12, fontWeight: 600,
                                cursor: uploadingFoto ? 'not-allowed' : 'pointer',
                                fontFamily: 'inherit',
                                opacity: uploadingFoto ? 0.6 : 1,
                            }}
                        >
                            {uploadingFoto ? <Loader2 size={13} className="spin" /> : <Camera size={13} />}
                            {uploadingFoto ? 'Enviando...' : 'Anexar foto'}
                        </button>
                    )}
                </div>
            )}

            {/* ===== PROTOCOLO - CARDS DOS PROCESSOS ===== */}
            {protocoloHoje ? (
                <div style={{
                    background: 'var(--notion-surface)', border: '1px solid var(--notion-border)',
                    borderRadius: 14, overflow: 'hidden', marginBottom: 20,
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '14px 20px',
                        borderBottom: '1px solid var(--notion-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: 'rgba(245,158,11,0.04)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FileText size={16} style={{ color: 'var(--notion-blue)' }} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--notion-text)' }}>
                                Protocolo — {new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </span>
                        </div>
                        <span style={{
                            fontSize: 11, fontWeight: 700, color: 'var(--notion-blue)',
                            background: 'rgba(245,158,11,0.12)', padding: '4px 10px', borderRadius: 6,
                        }}>
                            {protocoloHoje.processos.length} processo{protocoloHoje.processos.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Lista de processos como cards */}
                    {protocoloHoje.processos.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center' }}>
                            <FileText size={32} style={{ color: 'var(--notion-text-secondary)', margin: '0 auto 12px', opacity: 0.3 }} />
                            <p style={{ fontSize: 13, color: 'var(--notion-text-secondary)' }}>Nenhum processo neste protocolo.</p>
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
                                        className="proto-processo-card"
                                        onClick={() => { if (p.osId) navigate(`/ordens/${p.osId}`); }}
                                        style={{
                                        display: 'flex', alignItems: 'center',
                                        background: 'var(--notion-bg)', borderRadius: 10,
                                        border: '1px solid var(--notion-border)',
                                        borderLeft: `4px solid ${tipoCfg.color}`,
                                        padding: '10px 14px', gap: 14,
                                        transition: 'border-color 0.15s, background 0.15s',
                                        cursor: p.osId ? 'pointer' : 'default',
                                        flexWrap: 'wrap',
                                    }}
                                        onMouseEnter={e => { if (p.osId) (e.currentTarget as HTMLElement).style.borderColor = tipoCfg.color; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--notion-border)'; }}
                                    >
                                        {/* Número */}
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                                            background: p.manual ? 'rgba(139,92,246,0.1)' : 'rgba(59,130,246,0.08)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {p.manual ? (
                                                <UserPlus size={14} style={{ color: 'var(--notion-purple, #9065B0)' }} />
                                            ) : (
                                                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--notion-blue)' }}>
                                                    #{p.osNumero}
                                                </span>
                                            )}
                                        </div>

                                        {/* Dados */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                                <span className="proto-processo-nome" style={{
                                                    fontSize: 13, fontWeight: 700,
                                                    color: 'var(--notion-text)',
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                }}>
                                                    {p.clienteNome}
                                                </span>
                                                {p.manual && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 700, padding: '1px 6px',
                                                        borderRadius: 4, background: 'rgba(139,92,246,0.1)',
                                                        color: 'var(--notion-purple, #9065B0)',
                                                    }}>AVULSO</span>
                                                )}
                                            </div>
                                            <div className="proto-processo-dados" style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                fontSize: 11, color: 'var(--notion-text-secondary)',
                                            }}>
                                                {p.veiculoPlaca && p.veiculoPlaca !== '—' && (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                                                        <Car size={10} /> {p.veiculoPlaca}
                                                    </span>
                                                )}
                                                <span className="proto-processo-servico" style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
                                                    <FileText size={10} /> {getServicoLabel(serviceLabels, p.tipoServico)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Indicador OK */}
                                        {isProcessoOk(p) && (
                                            <span
                                                title={p.manual ? 'Marcado como concluído' : 'Documento pronto'}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    fontSize: 10, fontWeight: 700,
                                                    padding: '4px 10px', borderRadius: 20,
                                                    background: 'rgba(34,197,94,0.15)',
                                                    color: '#22c55e',
                                                    border: '1px solid rgba(34,197,94,0.4)',
                                                    flexShrink: 0,
                                                }}>
                                                <Check size={11} strokeWidth={3} />
                                                PRONTO
                                            </span>
                                        )}

                                        {/* Toggle manual de OK pra avulsos */}
                                        {p.manual && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleManualConcluido(protocoloHoje, idx);
                                                }}
                                                title={p.concluido ? 'Desmarcar como concluído' : 'Marcar como concluído'}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    fontSize: 10, fontWeight: 700,
                                                    padding: '4px 10px', borderRadius: 20,
                                                    background: p.concluido ? 'rgba(34,197,94,0.15)' : 'transparent',
                                                    color: p.concluido ? '#22c55e' : 'var(--notion-text-secondary)',
                                                    border: `1px solid ${p.concluido ? 'rgba(34,197,94,0.4)' : 'var(--notion-border)'}`,
                                                    cursor: 'pointer',
                                                    fontFamily: 'inherit',
                                                    flexShrink: 0,
                                                }}
                                            >
                                                <Check size={11} strokeWidth={3} />
                                                {p.concluido ? 'OK' : 'Marcar OK'}
                                            </button>
                                        )}

                                        {/* Badge tipo */}
                                        <span className="proto-badge-tipo" style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                            fontSize: 10, fontWeight: 700,
                                            padding: '4px 12px', borderRadius: 20,
                                            background: tipoCfg.bg, color: tipoCfg.color,
                                            border: `1px solid ${tipoCfg.border}`,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em',
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
                    background: 'var(--notion-surface)', border: '2px dashed var(--notion-border)',
                    borderRadius: 14, padding: 48, textAlign: 'center', marginBottom: 20,
                }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 14,
                        background: 'var(--notion-bg)', margin: '0 auto 16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <FileText size={24} style={{ color: 'var(--notion-text-secondary)', opacity: 0.4 }} />
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--notion-text)', marginBottom: 6 }}>
                        Nenhum protocolo para esta data
                    </h3>
                    <p style={{ fontSize: 12, color: 'var(--notion-text-secondary)', marginBottom: 16 }}>
                        {osParaProtocolo.length > 0
                            ? `${osParaProtocolo.length} processo(s) disponíveis. Clique em "Gerar Protocolo" acima.`
                            : 'Registre entradas na delegacia nas OS para gerar o protocolo.'}
                    </p>
                </div>
            )}

            {/* ===== ADICIONAR AVULSO (collapsible) ===== */}
            <div style={{
                background: 'var(--notion-surface)', border: '1px solid var(--notion-border)',
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
                            background: 'rgba(139,92,246,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <UserPlus size={14} style={{ color: 'var(--notion-purple, #9065B0)' }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--notion-text)' }}>
                            Processo Avulso (sem OS)
                        </span>
                        {manualProcessos.length > 0 && (
                            <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                                background: 'rgba(139,92,246,0.1)', color: 'var(--notion-purple, #9065B0)',
                            }}>{manualProcessos.length}</span>
                        )}
                    </div>
                    {showAvulso ? <ChevronUp size={18} style={{ color: 'var(--notion-text-secondary)' }} /> : <ChevronDown size={18} style={{ color: 'var(--notion-text-secondary)' }} />}
                </div>

                {showAvulso && (
                    <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--notion-border)' }}>
                        <p style={{ fontSize: 11, color: 'var(--notion-text-secondary)', margin: '14px 0 12px' }}>
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
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--notion-text-secondary)', marginBottom: 4 }}>
                                        <field.icon size={10} /> {field.label}
                                    </label>
                                    <input type="text" className="form-input" value={field.value}
                                        onChange={(e) => field.set(e.target.value)} placeholder={field.placeholder}
                                        style={{ fontSize: 12, padding: '7px 10px', borderRadius: 8 }} />
                                </div>
                            ))}
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--notion-text-secondary)', marginBottom: 4 }}>
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
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--notion-text-secondary)', marginBottom: 4 }}>
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
                                    background: mNome.trim() ? '#8B5CF6' : 'var(--notion-border)',
                                    color: mNome.trim() ? '#fff' : 'var(--notion-text-secondary)',
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
                                        background: 'var(--notion-bg)', border: '1px solid var(--notion-border)',
                                        borderLeft: '3px solid var(--notion-purple, #9065B0)',
                                    }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--notion-text)', flex: 1 }}>
                                            {p.clienteNome}
                                        </span>
                                        <span style={{ fontSize: 11, color: 'var(--notion-text-secondary)' }}>
                                            {p.veiculoPlaca || '—'}
                                        </span>
                                        <span style={{ fontSize: 10, color: 'var(--notion-text-secondary)' }}>
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
                                                    background: 'transparent', color: 'var(--notion-text-secondary)',
                                                    display: 'flex', fontFamily: 'var(--font-family)',
                                                }}>
                                                <Edit2 size={12} />
                                            </button>
                                            <button onClick={() => removeManualProcesso(i)} title="Remover"
                                                style={{
                                                    padding: 4, borderRadius: 5, border: 'none', cursor: 'pointer',
                                                    background: 'transparent', color: 'var(--notion-orange)',
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
                    background: 'var(--notion-surface)', border: '1px solid var(--notion-border)',
                    borderRadius: 14, overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '14px 20px',
                        borderBottom: '1px solid var(--notion-border)',
                        display: 'flex', flexDirection: 'column', gap: 12,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <Clock size={14} style={{ color: 'var(--notion-text-secondary)' }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--notion-text)' }}>
                                Protocolos Anteriores
                            </span>
                            <span style={{
                                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                background: 'var(--notion-bg-alt)', color: 'var(--notion-text-secondary)',
                            }}>
                                {protocolosAnterioresFiltrados.length}
                            </span>
                            <span style={{
                                fontSize: 10, fontWeight: 600, color: 'var(--notion-text-muted)',
                                fontStyle: 'italic',
                            }}>
                                {!mostrarCompletos ? '(só pendentes)' : '(todos)'}
                            </span>

                            <button
                                onClick={handleMesclarDuplicadas}
                                title="Mesclar protocolos duplicados (mesma data)"
                                style={{
                                    marginLeft: 'auto',
                                    padding: '5px 12px', fontSize: 11, fontWeight: 600,
                                    background: 'transparent', color: 'var(--notion-text-secondary)',
                                    border: '1px solid var(--notion-border)', borderRadius: 6,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                }}
                            >
                                Mesclar duplicados
                            </button>
                            {temFiltroAtivo && (
                                <button
                                    onClick={() => { setFiltroDataInicio(''); setFiltroDataFim(''); setFiltroBusca(''); }}
                                    style={{
                                        padding: '5px 12px', fontSize: 11, fontWeight: 600,
                                        background: 'transparent', color: 'var(--notion-text-secondary)',
                                        border: '1px solid var(--notion-border)', borderRadius: 6,
                                        cursor: 'pointer', fontFamily: 'inherit',
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                    }}
                                >
                                    <X size={12} /> Limpar filtros
                                </button>
                            )}
                        </div>

                        {/* Busca por nome/placa */}
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{
                                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                                color: 'var(--notion-text-secondary)', pointerEvents: 'none',
                            }} />
                            <input
                                type="search"
                                value={filtroBusca}
                                onChange={(e) => setFiltroBusca(e.target.value)}
                                placeholder="Buscar por nome do cliente, placa, chassi ou renavam…"
                                style={{
                                    width: '100%', padding: '9px 12px 9px 36px', fontSize: 13,
                                    background: 'var(--notion-bg)', color: 'var(--notion-text)',
                                    border: '1px solid var(--notion-border)', borderRadius: 8,
                                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                                }}
                            />
                            {filtroBusca && (
                                <button
                                    onClick={() => setFiltroBusca('')}
                                    style={{
                                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                        color: 'var(--notion-text-secondary)', padding: 4,
                                        display: 'flex', alignItems: 'center',
                                    }}
                                    title="Limpar busca"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Filtro de datas + toggle completos */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr auto',
                            gap: 10,
                            alignItems: 'end',
                        }}>
                            <div>
                                <label style={{
                                    display: 'block', fontSize: 11, fontWeight: 700,
                                    color: 'var(--notion-text-secondary)',
                                    textTransform: 'uppercase', letterSpacing: '0.05em',
                                    marginBottom: 4,
                                }}>
                                    De
                                </label>
                                <input
                                    type="date"
                                    value={filtroDataInicio}
                                    onChange={(e) => setFiltroDataInicio(e.target.value)}
                                    style={{
                                        width: '100%', padding: '8px 10px', fontSize: 13,
                                        background: 'var(--notion-bg)', color: 'var(--notion-text)',
                                        border: '1px solid var(--notion-border)', borderRadius: 8,
                                        outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{
                                    display: 'block', fontSize: 11, fontWeight: 700,
                                    color: 'var(--notion-text-secondary)',
                                    textTransform: 'uppercase', letterSpacing: '0.05em',
                                    marginBottom: 4,
                                }}>
                                    Até
                                </label>
                                <input
                                    type="date"
                                    value={filtroDataFim}
                                    onChange={(e) => setFiltroDataFim(e.target.value)}
                                    style={{
                                        width: '100%', padding: '8px 10px', fontSize: 13,
                                        background: 'var(--notion-bg)', color: 'var(--notion-text)',
                                        border: '1px solid var(--notion-border)', borderRadius: 8,
                                        outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setMostrarCompletos(v => !v)}
                                title={mostrarCompletos ? 'Esconder os que já estão todos OK' : 'Mostrar também os que já estão todos OK'}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '8px 14px', height: 38, borderRadius: 8,
                                    border: mostrarCompletos ? '1px solid rgba(0,117,222,0.4)' : '1px solid var(--notion-border)',
                                    background: mostrarCompletos ? 'rgba(0,117,222,0.08)' : 'var(--notion-bg)',
                                    color: mostrarCompletos ? 'var(--notion-blue)' : 'var(--notion-text-secondary)',
                                    cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                    fontFamily: 'inherit', whiteSpace: 'nowrap',
                                }}
                            >
                                {mostrarCompletos ? <Check size={13} /> : null}
                                Ver concluídos
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {protocolosAnterioresFiltrados.length === 0 ? (
                            <div style={{ padding: 32, textAlign: 'center', color: 'var(--notion-text-secondary)', fontSize: 13 }}>
                                Nenhum protocolo no período selecionado.
                            </div>
                        ) : protocolosAnterioresFiltrados.map((p: any, idx: number, arr: any[]) => {
                            const { ok, total } = contarOk(p);
                            const allDone = total > 0 && ok === total;
                            const hasSigned = !!p.fotoAssinadaUrl;
                            // Destaca processos que bateram na busca
                            const processosBatendo = buscaNorm
                                ? (p.processos || []).filter((proc: any) => {
                                    const nome = (proc.clienteNome || '').toLowerCase();
                                    const placa = (proc.veiculoPlaca || '').toLowerCase().replace(/[^\w]/g, '');
                                    const chassi = (proc.veiculoChassi || '').toLowerCase().replace(/[^\w]/g, '');
                                    const renavam = (proc.veiculoRenavam || '').replace(/\D/g, '');
                                    return nome.includes(filtroBusca.trim().toLowerCase()) ||
                                        placa.includes(buscaNorm) ||
                                        chassi.includes(buscaNorm) ||
                                        renavam.includes(buscaNorm);
                                })
                                : [];
                            return (
                                <div
                                    key={p.id}
                                    onClick={() => setData(p.data)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        padding: '12px 20px', cursor: 'pointer',
                                        borderBottom: idx < arr.length - 1 ? '1px solid var(--notion-border)' : 'none',
                                        transition: 'background 0.15s',
                                        flexWrap: 'wrap',
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,117,222,0.04)'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                >
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 10,
                                        background: 'var(--notion-bg)', border: '1px solid var(--notion-border)',
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--notion-text)', lineHeight: 1 }}>
                                            {new Date(p.data + 'T12:00:00').getDate()}
                                        </span>
                                        <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: 'var(--notion-text-secondary)', lineHeight: 1, marginTop: 1 }}>
                                            {new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                                        </span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 160 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--notion-text)', textTransform: 'capitalize' }}>
                                            {new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                                        </span>
                                    </div>

                                    {/* Progresso OK */}
                                    <span
                                        title={`${ok} de ${total} processos prontos`}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                            fontSize: 11, fontWeight: 700,
                                            padding: '3px 10px', borderRadius: 20,
                                            background: allDone ? 'rgba(34,197,94,0.15)' : 'rgba(0,117,222,0.1)',
                                            color: allDone ? '#22c55e' : 'var(--notion-blue)',
                                            border: `1px solid ${allDone ? 'rgba(34,197,94,0.4)' : 'rgba(0,117,222,0.3)'}`,
                                        }}>
                                        {allDone && <Check size={11} strokeWidth={3} />}
                                        {ok}/{total} OK
                                    </span>

                                    {/* Folha de entrada anexada */}
                                    {hasSigned && (
                                        <span
                                            title={`Folha de entrada anexada em ${p.fotoAnexadaEm ? new Date(p.fotoAnexadaEm).toLocaleDateString('pt-BR') : ''}`}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                                fontSize: 11, fontWeight: 700,
                                                padding: '4px 12px', borderRadius: 20,
                                                background: 'rgba(139,92,246,0.15)', color: '#8b5cf6',
                                                border: '1px solid rgba(139,92,246,0.45)',
                                                letterSpacing: '0.02em',
                                            }}>
                                            <ImageIcon size={12} />
                                            FOLHA ANEXADA
                                        </span>
                                    )}

                                    <span style={{
                                        fontSize: 11, fontWeight: 700, color: 'var(--notion-text-secondary)',
                                        background: 'var(--notion-bg-alt)', padding: '3px 10px', borderRadius: 6,
                                    }}>
                                        {total} proc.
                                    </span>

                                    {/* Preview dos processos que bateram na busca */}
                                    {processosBatendo.length > 0 && (
                                        <div style={{
                                            flexBasis: '100%', marginTop: 8, paddingTop: 10,
                                            borderTop: '1px dashed var(--notion-border)',
                                            display: 'flex', flexDirection: 'column', gap: 6,
                                        }}>
                                            <span style={{
                                                fontSize: 10, fontWeight: 700,
                                                color: 'var(--notion-blue)',
                                                textTransform: 'uppercase', letterSpacing: '0.04em',
                                            }}>
                                                {processosBatendo.length} processo(s) encontrado(s):
                                            </span>
                                            {processosBatendo.slice(0, 3).map((proc: any, i: number) => (
                                                <div key={i} style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    fontSize: 12, color: 'var(--notion-text)',
                                                    background: 'rgba(0,117,222,0.06)',
                                                    padding: '6px 10px', borderRadius: 6,
                                                }}>
                                                    {proc.osNumero && (
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 800, color: 'var(--notion-blue)',
                                                            background: 'rgba(0,117,222,0.15)', padding: '1px 6px', borderRadius: 4,
                                                        }}>
                                                            #{proc.osNumero}
                                                        </span>
                                                    )}
                                                    <span style={{ fontWeight: 600 }}>{proc.clienteNome}</span>
                                                    {proc.veiculoPlaca && proc.veiculoPlaca !== '—' && (
                                                        <span style={{ color: 'var(--notion-text-secondary)' }}>
                                                            · {proc.veiculoPlaca}
                                                        </span>
                                                    )}
                                                    {isProcessoOk(proc) && (
                                                        <Check size={11} strokeWidth={3} style={{ color: '#22c55e', marginLeft: 'auto' }} />
                                                    )}
                                                </div>
                                            ))}
                                            {processosBatendo.length > 3 && (
                                                <span style={{ fontSize: 11, color: 'var(--notion-text-muted)', fontStyle: 'italic' }}>
                                                    ... e mais {processosBatendo.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

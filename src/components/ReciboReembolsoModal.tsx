// src/components/ReciboReembolsoModal.tsx
import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Receipt, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import type { OrdemDeServico, Cliente, Veiculo } from '../types';
import type { EmpresaParceira } from '../types/empresa';
import {
    buildReciboContext,
    convertExcelToPdf,
    downloadBlob,
    fillExcelTemplate,
    templateUrlFromPath,
    type ReciboContext,
} from '../lib/reciboTemplate';

const fieldLabel: React.CSSProperties = {
    display: 'block',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'var(--notion-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
};

const fieldInput: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--notion-bg)',
    color: 'var(--notion-text)',
    border: '1px solid var(--notion-border)',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
};

interface Props {
    open: boolean;
    onClose: () => void;
    os: OrdemDeServico;
    cliente: Cliente | null;
    veiculo: Veiculo | null;
    empresa: EmpresaParceira;
}

export function ReciboReembolsoModal({ open, onClose, os, cliente, veiculo, empresa }: Props) {
    const initialCtx = useMemo(
        () => buildReciboContext(os, veiculo, cliente, empresa),
        [os, veiculo, cliente, empresa],
    );
    const [ctx, setCtx] = useState<ReciboContext>(initialCtx);
    const [busy, setBusy] = useState<null | 'xlsx' | 'pdf'>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setCtx(initialCtx);
            setError(null);
        }
    }, [open, initialCtx]);

    const update = <K extends keyof ReciboContext>(key: K, value: ReciboContext[K]) => {
        setCtx((prev) => {
            const next = { ...prev, [key]: value };
            if (key === 'valorPlaca' || key === 'valorVistoria') {
                const total = (next.valorPlaca || 0) + (next.valorVistoria || 0);
                next.valorTotal = total;
            }
            // Recalcular formatadas
            const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            next.valorPlacaFmt = fmt(next.valorPlaca || 0);
            next.valorVistoriaFmt = fmt(next.valorVistoria || 0);
            next.valorTotalFmt = fmt(next.valorTotal || 0);
            next.temPlaca = (next.valorPlaca || 0) > 0;
            next.temVistoria = (next.valorVistoria || 0) > 0 || !!next.vistoriaLocal;
            return next;
        });
    };

    const handleAction = async (action: 'xlsx' | 'pdf') => {
        if (!empresa.reciboTemplatePath) {
            setError('Template de recibo não configurado para esta empresa.');
            return;
        }
        setBusy(action);
        setError(null);
        try {
            const url = templateUrlFromPath(empresa.reciboTemplatePath);
            const xlsx = await fillExcelTemplate(url, ctx);
            const baseName = `recibo-${empresa.nome.toLowerCase().replace(/\s+/g, '-')}-os${ctx.numeroOS}`;
            if (action === 'xlsx') {
                downloadBlob(xlsx, `${baseName}.xlsx`);
            } else {
                const pdf = await convertExcelToPdf(xlsx);
                downloadBlob(pdf, `${baseName}.pdf`);
            }
        } catch (err: any) {
            setError(err?.message || String(err));
        } finally {
            setBusy(null);
        }
    };

    const sectionCard: React.CSSProperties = {
        background: 'var(--notion-bg-alt)',
        border: '1px solid var(--notion-border)',
        borderRadius: 10,
        padding: 16,
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent
                className="max-w-2xl max-h-[92vh] flex flex-col p-0 [&>button]:rounded-full [&>button]:w-8 [&>button]:h-8 [&>button]:bg-surface/5 [&>button]:border [&>button]:border-white/10 [&>button]:top-5 [&>button]:right-5 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:opacity-100 [&>button>svg]:h-3.5 [&>button>svg]:w-3.5"
                style={{
                    background: 'var(--notion-surface)',
                    border: '1px solid var(--notion-border)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                    borderRadius: 16,
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '20px 24px', borderBottom: '1px solid var(--notion-border)', paddingRight: 56,
                }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: 10,
                        background: `${empresa.cor}22`, color: empresa.cor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, border: `1px solid ${empresa.cor}55`,
                    }}>
                        <Receipt size={22} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <DialogTitle style={{
                            margin: 0, fontSize: '1.2rem', fontWeight: 800,
                            color: 'var(--notion-text)', letterSpacing: '-0.02em',
                        }}>
                            Recibo de Reembolso
                        </DialogTitle>
                        <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--notion-text-secondary)' }}>
                            {empresa.nome} • OS #{ctx.numeroOS}
                        </p>
                    </div>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 min-h-0" style={{ padding: '20px 24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                        <div style={sectionCard}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={fieldLabel}>Nº recibo</label>
                                    <input
                                        style={fieldInput}
                                        value={ctx.numeroRecibo}
                                        onChange={(e) => update('numeroRecibo', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={fieldLabel}>Data emissão</label>
                                    <input
                                        style={fieldInput}
                                        value={ctx.dataEmissao}
                                        onChange={(e) => update('dataEmissao', e.target.value)}
                                        placeholder="dd/mm/aaaa"
                                    />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={fieldLabel}>Cliente</label>
                                    <input
                                        style={fieldInput}
                                        value={ctx.clienteNome}
                                        onChange={(e) => update('clienteNome', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={fieldLabel}>CPF/CNPJ</label>
                                    <input
                                        style={fieldInput}
                                        value={ctx.clienteCpfCnpj}
                                        onChange={(e) => update('clienteCpfCnpj', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={fieldLabel}>Placa</label>
                                    <input
                                        style={fieldInput}
                                        value={ctx.placa}
                                        onChange={(e) => update('placa', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={fieldLabel}>Modelo</label>
                                    <input
                                        style={fieldInput}
                                        value={ctx.modelo}
                                        onChange={(e) => update('modelo', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={fieldLabel}>Chassi</label>
                                    <input
                                        style={fieldInput}
                                        value={ctx.chassi}
                                        onChange={(e) => update('chassi', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div style={sectionCard}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={fieldLabel}>Valor Placa (R$)</label>
                                    <input
                                        style={fieldInput}
                                        type="number"
                                        step="0.01"
                                        value={ctx.valorPlaca || ''}
                                        onChange={(e) => update('valorPlaca', parseFloat(e.target.value) || 0)}
                                        placeholder="0,00"
                                    />
                                </div>
                                <div>
                                    <label style={fieldLabel}>Valor Vistoria (R$)</label>
                                    <input
                                        style={fieldInput}
                                        type="number"
                                        step="0.01"
                                        value={ctx.valorVistoria || ''}
                                        onChange={(e) => update('valorVistoria', parseFloat(e.target.value) || 0)}
                                        placeholder="0,00"
                                    />
                                </div>
                                <div>
                                    <label style={fieldLabel}>Total</label>
                                    <input
                                        style={{ ...fieldInput, background: 'var(--notion-bg-alt)', fontWeight: 700, color: '#0075de' }}
                                        readOnly
                                        value={ctx.valorTotalFmt}
                                    />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={fieldLabel}>Local da vistoria</label>
                                    <input
                                        style={fieldInput}
                                        value={ctx.vistoriaLocal}
                                        onChange={(e) => update('vistoriaLocal', e.target.value)}
                                    />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={fieldLabel}>Observação</label>
                                    <input
                                        style={fieldInput}
                                        value={ctx.observacao}
                                        onChange={(e) => update('observacao', e.target.value)}
                                        placeholder="Opcional"
                                    />
                                </div>
                            </div>
                            <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: 'var(--notion-text-secondary)' }}>
                                Total por extenso: <em>{ctx.valorPorExtenso || '—'}</em>
                            </p>
                        </div>

                        {error && (
                            <div style={{
                                padding: '10px 12px',
                                background: 'rgba(220,38,38,0.08)',
                                border: '1px solid rgba(220,38,38,0.25)',
                                borderRadius: 8,
                                color: '#dc2626',
                                fontSize: '0.85rem',
                            }}>
                                {error}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
                    padding: '14px 24px', borderTop: '1px solid var(--notion-border)',
                    background: 'var(--notion-bg-alt)',
                }}>
                    <button
                        onClick={onClose}
                        disabled={busy !== null}
                        style={{
                            padding: '9px 18px',
                            background: 'var(--notion-surface)', border: '1px solid var(--notion-border)',
                            borderRadius: 8, color: 'var(--notion-text)', cursor: 'pointer',
                            fontWeight: 600, fontSize: '0.85rem', fontFamily: 'inherit',
                        }}
                    >
                        Fechar
                    </button>
                    <button
                        onClick={() => handleAction('xlsx')}
                        disabled={busy !== null}
                        style={{
                            padding: '9px 16px',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: 'var(--notion-surface)', border: '1px solid var(--notion-border)',
                            borderRadius: 8, color: 'var(--notion-text)',
                            cursor: busy ? 'not-allowed' : 'pointer',
                            fontWeight: 600, fontSize: '0.85rem', fontFamily: 'inherit',
                            opacity: busy && busy !== 'xlsx' ? 0.5 : 1,
                        }}
                    >
                        {busy === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                        Baixar Excel
                    </button>
                    <button
                        onClick={() => handleAction('pdf')}
                        disabled={busy !== null}
                        style={{
                            padding: '9px 22px',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: '#0075de', border: 'none',
                            borderRadius: 8, color: '#fff',
                            cursor: busy ? 'not-allowed' : 'pointer',
                            fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit',
                            opacity: busy && busy !== 'pdf' ? 0.5 : 1,
                        }}
                    >
                        {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        Baixar PDF
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

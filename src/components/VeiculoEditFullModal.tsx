// src/components/VeiculoEditFullModal.tsx
// ============================================
// Modal de edição completa de veículo, com o mesmo layout/design
// do passo "Veículo" do NovaOSModal (padronização visual).
// ============================================

import { useEffect, useState, useMemo } from 'react';
import { Save, X } from 'lucide-react';
import {
    overlayStyle, modalStyle, headerStyle, bodyStyle, footerStyle,
    btnPrimary, btnSecondary,
    inputStyle, labelStyle, fieldWrapStyle, secaoStyle, secaoHeaderStyle,
} from './ModalBase';
import type { Veiculo } from '../types';
import { saveVeiculo } from '../lib/database';
import { useConfirm } from './ConfirmProvider';

interface Props {
    isOpen: boolean;
    veiculo: Veiculo;
    onClose: () => void;
    onSaved: () => void;
}

export default function VeiculoEditFullModal({ isOpen, veiculo, onClose, onSaved }: Props) {
    const confirmDialog = useConfirm();
    const [form, setForm] = useState<Partial<Veiculo>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) setForm({ ...veiculo });
    }, [isOpen, veiculo]);

    const isDirty = useMemo(() => {
        if (!isOpen || !form) return false;
        const keys: (keyof Veiculo)[] = [
            'placa', 'chassi', 'renavam', 'categoria', 'marcaModelo',
            'anoFabricacao', 'anoModelo', 'cor', 'combustivel', 'dataAquisicao',
            'hodometro', 'observacoes',
        ];
        return keys.some((k) => (form[k] ?? '') !== (veiculo[k] ?? ''));
    }, [isOpen, form, veiculo]);

    const attemptClose = async () => {
        if (isDirty) {
            const ok = await confirmDialog({
                title: 'Descartar alterações?',
                message: 'Você fez alterações que ainda não foram salvas. Se sair agora, elas serão perdidas.',
                confirmText: 'Descartar e sair',
                cancelText: 'Continuar editando',
                danger: true,
            });
            if (!ok) return;
        }
        onClose();
    };

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') attemptClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, isDirty]);

    // Trava o scroll da página de fundo enquanto o modal está aberto
    useEffect(() => {
        if (!isOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [isOpen]);

    if (!isOpen) return null;

    const set = <K extends keyof Veiculo>(key: K, value: Veiculo[K]) =>
        setForm((f) => ({ ...f, [key]: value }));

    const handleSave = async () => {
        if (!veiculo.id) return;
        setSaving(true);
        try {
            await saveVeiculo({ ...veiculo, ...form });
            onSaved();
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            style={{ ...overlayStyle, zIndex: 1100 }}
            onClick={() => { /* clique no fundo não fecha — evita perda de edição */ }}
        >
            <div style={{ ...modalStyle, maxWidth: 960, maxHeight: '95vh' }} onClick={(e) => e.stopPropagation()}>
                <div style={headerStyle}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                        Editar Veículo {isDirty && <span style={{ color: 'var(--notion-orange)', fontWeight: 500, fontSize: '0.8rem', marginLeft: 6 }}>• alterações não salvas</span>}
                    </h2>
                    <button
                        onClick={attemptClose}
                        style={{ background: 'none', border: 'none', color: 'var(--notion-text-secondary)', cursor: 'pointer', padding: 4 }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div style={bodyStyle}>
                    <div style={secaoStyle}>
                        <div style={secaoHeaderStyle}>Veículo</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '14px 16px' }}>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Placa</label>
                                <input
                                    style={inputStyle}
                                    value={form.placa || ''}
                                    onChange={(e) => set('placa', e.target.value.toUpperCase())}
                                    placeholder="Vazio p/ primeiro emplacamento"
                                />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Chassi *</label>
                                <input
                                    style={inputStyle}
                                    value={form.chassi || ''}
                                    onChange={(e) => set('chassi', e.target.value.toUpperCase())}
                                />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Renavam</label>
                                <input style={inputStyle} value={form.renavam || ''} onChange={(e) => set('renavam', e.target.value)} />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Categoria</label>
                                <input style={inputStyle} value={form.categoria || ''} onChange={(e) => set('categoria', e.target.value)} />
                            </div>
                            <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Marca / Modelo</label>
                                <input style={inputStyle} value={form.marcaModelo || ''} onChange={(e) => set('marcaModelo', e.target.value)} />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Ano Fabricação</label>
                                <input style={inputStyle} value={form.anoFabricacao || ''} onChange={(e) => set('anoFabricacao', e.target.value)} />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Ano Modelo</label>
                                <input style={inputStyle} value={form.anoModelo || ''} onChange={(e) => set('anoModelo', e.target.value)} />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Cor</label>
                                <input style={inputStyle} value={form.cor || ''} onChange={(e) => set('cor', e.target.value)} />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Combustível</label>
                                <input style={inputStyle} value={form.combustivel || ''} onChange={(e) => set('combustivel', e.target.value)} />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Data de Aquisição (Recibo)</label>
                                <input
                                    type="date"
                                    style={inputStyle}
                                    value={form.dataAquisicao ? (form.dataAquisicao.includes('T') ? form.dataAquisicao.split('T')[0] : form.dataAquisicao) : ''}
                                    onChange={(e) => set('dataAquisicao', e.target.value)}
                                />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Hodômetro</label>
                                <input style={inputStyle} value={form.hodometro || ''} onChange={(e) => set('hodometro', e.target.value)} />
                            </div>
                            <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Observações</label>
                                <textarea
                                    style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit', resize: 'vertical' }}
                                    value={form.observacoes || ''}
                                    onChange={(e) => set('observacoes', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div style={footerStyle}>
                    <button style={btnSecondary} onClick={attemptClose}>Cancelar</button>
                    <button
                        style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}
                        disabled={saving}
                        onClick={handleSave}
                    >
                        <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Veículo'}
                    </button>
                </div>
            </div>
        </div>
    );
}

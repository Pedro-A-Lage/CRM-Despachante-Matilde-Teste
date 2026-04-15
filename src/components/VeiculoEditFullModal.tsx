// src/components/VeiculoEditFullModal.tsx
// ============================================
// Modal de edição completa de veículo, com o mesmo layout/design
// do passo "Veículo" do NovaOSModal (padronização visual).
// ============================================

import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import {
    overlayStyle, modalStyle, headerStyle, bodyStyle, footerStyle,
    btnPrimary, btnSecondary,
    inputStyle, labelStyle, fieldWrapStyle, secaoStyle, secaoHeaderStyle,
} from './ModalBase';
import type { Veiculo } from '../types';
import { saveVeiculo } from '../lib/database';

interface Props {
    isOpen: boolean;
    veiculo: Veiculo;
    onClose: () => void;
    onSaved: () => void;
}

export default function VeiculoEditFullModal({ isOpen, veiculo, onClose, onSaved }: Props) {
    const [form, setForm] = useState<Partial<Veiculo>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) setForm({ ...veiculo });
    }, [isOpen, veiculo]);

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
        <div style={{ ...overlayStyle, zIndex: 1100 }} onClick={onClose}>
            <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
                <div style={headerStyle}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                        Editar Veículo
                    </h2>
                    <button
                        onClick={onClose}
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
                    <button style={btnSecondary} onClick={onClose}>Cancelar</button>
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

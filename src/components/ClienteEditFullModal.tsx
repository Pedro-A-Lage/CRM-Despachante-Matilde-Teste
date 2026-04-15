// src/components/ClienteEditFullModal.tsx
// ============================================
// Modal de edição completa de cliente, com o mesmo layout/design
// do passo "Cliente" do NovaOSModal (padronização visual).
// ============================================

import { useEffect, useState, useMemo } from 'react';
import { Loader, Save, X, Plus } from 'lucide-react';
import {
    overlayStyle, modalStyle, headerStyle, bodyStyle, footerStyle,
    btnPrimary, btnSecondary,
    inputStyle, labelStyle, fieldWrapStyle, secaoStyle, secaoHeaderStyle,
} from './ModalBase';
import type { Cliente } from '../types';
import { updateCliente } from '../lib/database';
import { useConfirm } from './ConfirmProvider';

function formatCPF(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
function formatCNPJ(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}
function formatPhone(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits.length ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

interface Props {
    isOpen: boolean;
    cliente: Cliente;
    onClose: () => void;
    onSaved: () => void;
}

export default function ClienteEditFullModal({ isOpen, cliente, onClose, onSaved }: Props) {
    const confirmDialog = useConfirm();
    const [form, setForm] = useState<Partial<Cliente>>({});
    const [saving, setSaving] = useState(false);
    const [buscandoCep, setBuscandoCep] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setForm({
                ...cliente,
                telefones: cliente.telefones?.length ? cliente.telefones : [''],
            });
        }
    }, [isOpen, cliente]);

    // Detecta se há alterações não salvas (compara form com cliente original)
    const isDirty = useMemo(() => {
        if (!isOpen || !form) return false;
        const originalTels = (cliente.telefones?.length ? cliente.telefones : ['']).filter(Boolean);
        const formTels = (form.telefones || []).filter(Boolean);
        if (originalTels.length !== formTels.length) return true;
        if (originalTels.some((t, i) => t !== formTels[i])) return true;
        const keys: (keyof Cliente)[] = [
            'tipo', 'cpfCnpj', 'nome', 'rg', 'orgaoExpedidor', 'ufDocumento', 'email',
            'cep', 'numero', 'endereco', 'complemento', 'bairro', 'municipio', 'uf', 'observacoes',
        ];
        return keys.some((k) => (form[k] ?? '') !== (cliente[k] ?? ''));
    }, [isOpen, form, cliente]);

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

    // Fechar com ESC (respeitando a checagem de dirty)
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

    const set = <K extends keyof Cliente>(key: K, value: Cliente[K]) =>
        setForm((f) => ({ ...f, [key]: value }));

    const buscarCep = async () => {
        const cepLimpo = (form.cep || '').replace(/\D/g, '');
        if (cepLimpo.length !== 8) return;
        setBuscandoCep(true);
        try {
            const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
            const json = await resp.json();
            if (!json.erro) {
                setForm((f) => ({
                    ...f,
                    endereco: json.logradouro || f.endereco || '',
                    bairro: json.bairro || f.bairro || '',
                    municipio: json.localidade || f.municipio || '',
                    uf: json.uf || f.uf || '',
                }));
            }
        } catch (err) {
            console.warn('Erro ao buscar CEP:', err);
        } finally {
            setBuscandoCep(false);
        }
    };

    const handleSave = async () => {
        if (!cliente.id) return;
        setSaving(true);
        try {
            await updateCliente(cliente.id, {
                ...form,
                telefones: (form.telefones || []).filter((t) => t.trim() !== ''),
            });
            onSaved();
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const tipo = form.tipo || 'PF';
    const telefones = form.telefones || [''];

    return (
        <div
            style={{ ...overlayStyle, zIndex: 1100 }}
            onClick={() => { /* clique no fundo não fecha — evita perda de edição */ }}
        >
            <div style={{ ...modalStyle, maxWidth: 960, maxHeight: '95vh' }} onClick={(e) => e.stopPropagation()}>
                <div style={headerStyle}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--notion-text)' }}>
                        Editar Cliente {isDirty && <span style={{ color: 'var(--notion-orange)', fontWeight: 500, fontSize: '0.8rem', marginLeft: 6 }}>• alterações não salvas</span>}
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
                        <div style={secaoHeaderStyle}>Cliente</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '14px 16px' }}>
                            <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Tipo de Cliente</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        type="button"
                                        onClick={() => set('tipo', 'PF')}
                                        style={{
                                            flex: 1, padding: '8px 12px', borderRadius: 8,
                                            border: '1px solid var(--notion-border)',
                                            background: tipo === 'PF' ? 'var(--notion-blue)' : 'var(--notion-surface)',
                                            color: tipo === 'PF' ? '#fff' : 'var(--notion-text)',
                                            fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                                        }}
                                    >
                                        Pessoa Física
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => set('tipo', 'PJ')}
                                        style={{
                                            flex: 1, padding: '8px 12px', borderRadius: 8,
                                            border: '1px solid var(--notion-border)',
                                            background: tipo === 'PJ' ? 'var(--notion-blue)' : 'var(--notion-surface)',
                                            color: tipo === 'PJ' ? '#fff' : 'var(--notion-text)',
                                            fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                                        }}
                                    >
                                        Pessoa Jurídica
                                    </button>
                                </div>
                            </div>

                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>{tipo === 'PF' ? 'CPF' : 'CNPJ'} *</label>
                                <input
                                    style={inputStyle}
                                    value={form.cpfCnpj || ''}
                                    onChange={(e) => {
                                        const raw = e.target.value;
                                        const digits = raw.replace(/\D/g, '');
                                        const detectedTipo = digits.length > 11 ? 'PJ' : 'PF';
                                        const formatted = detectedTipo === 'PF' ? formatCPF(raw) : formatCNPJ(raw);
                                        setForm((f) => ({ ...f, cpfCnpj: formatted, tipo: detectedTipo }));
                                    }}
                                    maxLength={tipo === 'PF' ? 14 : 18}
                                />
                            </div>

                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>{tipo === 'PF' ? 'RG' : 'Inscrição Estadual'}</label>
                                <input style={inputStyle} value={form.rg || ''} onChange={(e) => set('rg', e.target.value)} />
                            </div>

                            <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>{tipo === 'PF' ? 'Nome Completo' : 'Razão Social'} *</label>
                                <input style={inputStyle} value={form.nome || ''} onChange={(e) => set('nome', e.target.value)} />
                            </div>

                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Órgão Expedidor</label>
                                <input style={inputStyle} value={form.orgaoExpedidor || ''} onChange={(e) => set('orgaoExpedidor', e.target.value)} />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>UF do Documento</label>
                                <input style={inputStyle} value={form.ufDocumento || ''} onChange={(e) => set('ufDocumento', e.target.value.toUpperCase())} maxLength={2} />
                            </div>

                            <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Telefone(s)</label>
                                {telefones.map((tel, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                        <input
                                            style={inputStyle}
                                            value={tel}
                                            onChange={(e) => {
                                                const updated = [...telefones];
                                                updated[idx] = formatPhone(e.target.value);
                                                set('telefones', updated);
                                            }}
                                            maxLength={15}
                                        />
                                        {telefones.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => set('telefones', telefones.filter((_, i) => i !== idx))}
                                                style={{ background: 'none', border: '1px solid var(--notion-border)', borderRadius: 8, padding: '0 10px', cursor: 'pointer', color: 'var(--notion-text-secondary)' }}
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => set('telefones', [...telefones, ''])}
                                    style={{
                                        alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4,
                                        padding: '4px 10px', borderRadius: 6, border: '1px solid var(--notion-border)',
                                        background: 'var(--notion-bg-alt)', fontSize: '0.78rem', cursor: 'pointer',
                                        color: 'var(--notion-text-secondary)',
                                    }}
                                >
                                    <Plus size={12} /> Adicionar telefone
                                </button>
                            </div>

                            <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>E-mail</label>
                                <input type="email" style={inputStyle} value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
                            </div>

                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>
                                    CEP {buscandoCep && <Loader size={12} style={{ animation: 'spin 1s linear infinite', marginLeft: 4 }} />}
                                </label>
                                <input
                                    style={inputStyle}
                                    value={form.cep || ''}
                                    onChange={(e) => set('cep', e.target.value)}
                                    onBlur={buscarCep}
                                    placeholder="Digite e saia do campo"
                                />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Número</label>
                                <input style={inputStyle} value={form.numero || ''} onChange={(e) => set('numero', e.target.value)} />
                            </div>
                            <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Endereço</label>
                                <input style={inputStyle} value={form.endereco || ''} onChange={(e) => set('endereco', e.target.value)} />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Complemento</label>
                                <input style={inputStyle} value={form.complemento || ''} onChange={(e) => set('complemento', e.target.value)} />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Bairro</label>
                                <input style={inputStyle} value={form.bairro || ''} onChange={(e) => set('bairro', e.target.value)} />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Município</label>
                                <input style={inputStyle} value={form.municipio || ''} onChange={(e) => set('municipio', e.target.value)} />
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>UF</label>
                                <input style={inputStyle} value={form.uf || ''} onChange={(e) => set('uf', e.target.value.toUpperCase())} maxLength={2} />
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
                        <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Cliente'}
                    </button>
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Plus, X, Loader2, User, Building2, Phone, Mail, FileText, IdCard } from 'lucide-react';
import { getCliente, saveCliente } from '../lib/database';

import type { TipoCliente } from '../types';

// ===== FORMATADORES =====
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

function detectTipo(cpfCnpj: string): TipoCliente {
    const digits = cpfCnpj.replace(/\D/g, '');
    return digits.length > 11 ? 'PJ' : 'PF';
}

// ===== STYLE HELPERS =====
const sectionCard: React.CSSProperties = {
    background: 'var(--notion-surface)',
    border: '1px solid var(--notion-border)',
    borderRadius: 12,
    padding: '20px 24px',
    marginBottom: 16,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};

const sectionHeader: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
    paddingBottom: 12,
    borderBottom: '1px solid var(--notion-border)',
};

const sectionTitle: React.CSSProperties = {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--notion-text)',
    letterSpacing: '-0.01em',
};

const fieldLabel: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--notion-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
};

const fieldInput: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--notion-bg)',
    color: 'var(--notion-text)',
    border: '1px solid var(--notion-border)',
    borderRadius: 8,
    fontSize: 16,
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 150ms, box-shadow 150ms',
    boxSizing: 'border-box',
};

export default function ClienteForm() {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditing = Boolean(id);

    const [tipo, setTipo] = useState<TipoCliente>('PF');
    const [nome, setNome] = useState('');
    const [cpfCnpj, setCpfCnpj] = useState('');
    const [telefones, setTelefones] = useState<string[]>(['']);
    const [email, setEmail] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (id) {
            (async () => {
                const cliente = await getCliente(id);
                if (cliente) {
                    setTipo(cliente.tipo);
                    setNome(cliente.nome);
                    setCpfCnpj(cliente.cpfCnpj);
                    setTelefones(cliente.telefones.length > 0 ? cliente.telefones : ['']);
                    setEmail(cliente.email || '');
                    setObservacoes(cliente.observacoes || '');
                }
            })();
        }
    }, [id]);

    const addTelefone = () => setTelefones([...telefones, '']);
    const removeTelefone = (idx: number) => {
        if (telefones.length > 1) {
            setTelefones(telefones.filter((_, i) => i !== idx));
        }
    };
    const updateTelefone = (idx: number, val: string) => {
        const updated = [...telefones];
        updated[idx] = val;
        setTelefones(updated);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!nome.trim() || !cpfCnpj.trim()) {
            alert('Preencha os campos obrigatórios: Nome e CPF/CNPJ');
            return;
        }

        setSaving(true);
        try {
            await saveCliente({
                id: id || undefined,
                tipo,
                nome: nome.trim(),
                cpfCnpj: cpfCnpj.trim(),
                telefones: telefones.filter((t) => t.trim() !== ''),
                email: email.trim() || undefined,
                observacoes: observacoes.trim() || undefined,
            });

            navigate(id ? `/clientes/${id}` : '/clientes');
        } catch (err) {
            alert('Erro ao salvar cliente. Tente novamente.');
            console.error('Erro saveCliente:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        e.target.style.borderColor = 'var(--notion-blue)';
        e.target.style.boxShadow = '0 0 0 3px rgba(0,117,222,0.12)';
    };
    const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        e.target.style.borderColor = 'var(--notion-border)';
        e.target.style.boxShadow = 'none';
    };

    return (
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 4px' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginBottom: 24,
                paddingBottom: 16,
                borderBottom: '1px solid var(--notion-border)',
            }}>
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        border: '1px solid var(--notion-border)',
                        background: 'var(--notion-surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--notion-text)',
                        flexShrink: 0,
                    }}
                    aria-label="Voltar"
                >
                    <ArrowLeft size={18} />
                </button>
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
                    {tipo === 'PJ' ? <Building2 size={22} /> : <User size={22} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{
                        margin: 0,
                        fontSize: '1.4rem',
                        fontWeight: 800,
                        color: 'var(--notion-text)',
                        letterSpacing: '-0.02em',
                    }}>
                        {isEditing ? 'Editar Cliente' : 'Novo Cliente'}
                    </h1>
                    <p style={{
                        margin: '2px 0 0',
                        fontSize: '0.85rem',
                        color: 'var(--notion-text-secondary)',
                    }}>
                        {isEditing ? 'Atualize os dados cadastrais do cliente' : 'Preencha os dados para cadastrar um novo cliente'}
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                {/* ───── Tipo de Cliente ───── */}
                <div style={sectionCard}>
                    <div style={sectionHeader}>
                        <IdCard size={18} style={{ color: 'var(--notion-blue)' }} />
                        <h2 style={sectionTitle}>Tipo de Cliente</h2>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 10,
                    }}>
                        {(['PF', 'PJ'] as TipoCliente[]).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTipo(t)}
                                style={{
                                    padding: '14px 16px',
                                    borderRadius: 10,
                                    border: tipo === t ? '2px solid var(--notion-blue)' : '1px solid var(--notion-border)',
                                    background: tipo === t ? 'rgba(0,117,222,0.08)' : 'var(--notion-bg)',
                                    color: tipo === t ? 'var(--notion-blue)' : 'var(--notion-text)',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '0.9rem',
                                    fontFamily: 'inherit',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    transition: 'all 0.15s',
                                }}
                            >
                                {t === 'PF' ? <User size={16} /> : <Building2 size={16} />}
                                {t === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ───── Identificação ───── */}
                <div style={sectionCard}>
                    <div style={sectionHeader}>
                        <FileText size={18} style={{ color: 'var(--notion-blue)' }} />
                        <h2 style={sectionTitle}>Identificação</h2>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                        <div>
                            <label style={fieldLabel}>
                                {tipo === 'PF' ? 'Nome Completo' : 'Razão Social'} <span style={{ color: 'var(--notion-orange)' }}>*</span>
                            </label>
                            <input
                                type="text"
                                value={nome}
                                onChange={(e) => setNome(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                placeholder={tipo === 'PF' ? 'Nome do cliente' : 'Razão social da empresa'}
                                required
                                style={fieldInput}
                            />
                        </div>
                        <div>
                            <label style={fieldLabel}>
                                {tipo === 'PF' ? 'CPF' : 'CNPJ'} <span style={{ color: 'var(--notion-orange)' }}>*</span>
                            </label>
                            <input
                                type="text"
                                value={cpfCnpj}
                                onChange={(e) => {
                                    const raw = e.target.value;
                                    const detectedTipo = detectTipo(raw);
                                    if (detectedTipo !== tipo) setTipo(detectedTipo);
                                    const formatted = detectedTipo === 'PF' ? formatCPF(raw) : formatCNPJ(raw);
                                    setCpfCnpj(formatted);
                                }}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                                maxLength={tipo === 'PF' ? 14 : 18}
                                required
                                style={fieldInput}
                            />
                        </div>
                    </div>
                </div>

                {/* ───── Contato ───── */}
                <div style={sectionCard}>
                    <div style={sectionHeader}>
                        <Phone size={18} style={{ color: 'var(--notion-blue)' }} />
                        <h2 style={sectionTitle}>Contato</h2>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={fieldLabel}>Telefone(s)</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {telefones.map((tel, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        type="text"
                                        value={tel}
                                        onChange={(e) => updateTelefone(idx, formatPhone(e.target.value))}
                                        onFocus={handleFocus}
                                        onBlur={handleBlur}
                                        placeholder="(00) 00000-0000"
                                        maxLength={15}
                                        style={{ ...fieldInput, flex: 1 }}
                                    />
                                    {telefones.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeTelefone(idx)}
                                            style={{
                                                width: 40,
                                                height: 40,
                                                borderRadius: 8,
                                                border: '1px solid var(--notion-border)',
                                                background: 'var(--notion-bg)',
                                                color: 'var(--notion-text-secondary)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                            }}
                                            aria-label="Remover telefone"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={addTelefone}
                            style={{
                                marginTop: 8,
                                padding: '7px 12px',
                                background: 'transparent',
                                border: '1px dashed var(--notion-border)',
                                borderRadius: 8,
                                color: 'var(--notion-text-secondary)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                fontFamily: 'inherit',
                            }}
                        >
                            <Plus size={14} /> Adicionar telefone
                        </button>
                    </div>

                    <div>
                        <label style={fieldLabel}>
                            <Mail size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                            E-mail (opcional)
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                            placeholder="email@exemplo.com"
                            style={fieldInput}
                        />
                    </div>
                </div>

                {/* ───── Observações ───── */}
                <div style={sectionCard}>
                    <div style={sectionHeader}>
                        <FileText size={18} style={{ color: 'var(--notion-blue)' }} />
                        <h2 style={sectionTitle}>Observações</h2>
                    </div>
                    <textarea
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        placeholder="Anotações gerais sobre o cliente (opcional)…"
                        rows={4}
                        style={{ ...fieldInput, minHeight: 96, resize: 'vertical' }}
                    />
                </div>

                {/* ───── Ações ───── */}
                <div style={{
                    position: 'sticky',
                    bottom: 0,
                    background: 'var(--notion-bg)',
                    paddingTop: 16,
                    marginTop: 8,
                    display: 'flex',
                    gap: 10,
                    justifyContent: 'flex-end',
                    flexWrap: 'wrap',
                }}>
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        disabled={saving}
                        style={{
                            padding: '10px 20px',
                            background: 'var(--notion-surface)',
                            border: '1px solid var(--notion-border)',
                            borderRadius: 8,
                            color: 'var(--notion-text)',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            fontFamily: 'inherit',
                            opacity: saving ? 0.6 : 1,
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        style={{
                            padding: '10px 24px',
                            background: saving ? 'var(--notion-text-muted)' : 'var(--notion-blue)',
                            border: 'none',
                            borderRadius: 8,
                            color: '#fff',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            fontFamily: 'inherit',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            minWidth: 180,
                            justifyContent: 'center',
                        }}
                    >
                        {saving ? (
                            <>
                                <Loader2 size={16} className="spin" /> Salvando...
                            </>
                        ) : (
                            <>
                                <Save size={16} /> {isEditing ? 'Salvar Alterações' : 'Cadastrar Cliente'}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}

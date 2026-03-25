import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Plus, X, FolderOpen, Loader2 } from 'lucide-react';
import { getCliente, saveCliente, updateCliente } from '../lib/storage';

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
    // Drive status removed
    // const [driveStatus, setDriveStatus] = useState<'idle' | 'creating' | 'done' | 'error'>('idle');

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

        // Save client first
        const cliente = await saveCliente({
            id: id || undefined,
            tipo,
            nome: nome.trim(),
            cpfCnpj: cpfCnpj.trim(),
            telefones: telefones.filter((t) => t.trim() !== ''),
            email: email.trim() || undefined,
            observacoes: observacoes.trim() || undefined,
        });

        // Removed Google Drive folder creation since Supabase handles virtual paths

        setSaving(false);
        navigate(id ? `/clientes/${id}` : '/clientes');
    };

    return (
        <div>
            <div className="page-header">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="btn btn-ghost">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h2>{isEditing ? 'Editar Cliente' : 'Novo Cliente'}</h2>
                        <p className="page-header-subtitle">
                            {isEditing ? 'Atualize os dados do cliente' : 'Cadastre um novo cliente no sistema'}
                        </p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 700 }}>
                {/* Tipo */}
                <div className="form-group">
                    <label className="form-label">Tipo de Cliente *</label>
                    <div className="toggle-group">
                        <button
                            type="button"
                            className={`toggle-btn ${tipo === 'PF' ? 'active' : ''}`}
                            onClick={() => setTipo('PF')}
                        >
                            Pessoa Física
                        </button>
                        <button
                            type="button"
                            className={`toggle-btn ${tipo === 'PJ' ? 'active' : ''}`}
                            onClick={() => setTipo('PJ')}
                        >
                            Pessoa Jurídica
                        </button>
                    </div>
                </div>

                {/* Nome */}
                <div className="form-group">
                    <label className="form-label">
                        {tipo === 'PF' ? 'Nome Completo' : 'Razão Social'} *
                    </label>
                    <input
                        type="text"
                        className="form-input"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder={tipo === 'PF' ? 'Nome do cliente' : 'Razão social da empresa'}
                        required
                    />
                </div>

                {/* CPF / CNPJ */}
                <div className="form-group">
                    <label className="form-label">{tipo === 'PF' ? 'CPF' : 'CNPJ'} *</label>
                    <input
                        type="text"
                        className="form-input"
                        value={cpfCnpj}
                        onChange={(e) => {
                            const raw = e.target.value;
                            const digits = raw.replace(/\D/g, '');
                            // Auto-detecta tipo pelo tamanho
                            const detectedTipo = detectTipo(raw);
                            if (detectedTipo !== tipo) setTipo(detectedTipo);
                            const formatted = detectedTipo === 'PF' ? formatCPF(raw) : formatCNPJ(raw);
                            setCpfCnpj(formatted);
                            void digits; // suppress unused warning
                        }}
                        placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                        maxLength={tipo === 'PF' ? 14 : 18}
                        required
                    />
                </div>

                {/* Telefones */}
                <div className="form-group">
                    <label className="form-label">Telefone(s)</label>
                    {telefones.map((tel, idx) => (
                        <div key={idx} className="flex gap-2 mb-2" style={{ marginBottom: '8px' }}>
                            <input
                                type="text"
                                className="form-input"
                                value={tel}
                                onChange={(e) => updateTelefone(idx, formatPhone(e.target.value))}
                                placeholder="(00) 00000-0000"
                                maxLength={15}
                            />
                            {telefones.length > 1 && (
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => removeTelefone(idx)}
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    ))}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addTelefone}>
                        <Plus size={14} /> Adicionar telefone
                    </button>
                </div>

                {/* Email */}
                <div className="form-group">
                    <label className="form-label">E-mail (opcional)</label>
                    <input
                        type="email"
                        className="form-input"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="email@exemplo.com"
                    />
                </div>

                {/* Observações */}
                <div className="form-group">
                    <label className="form-label">Observações</label>
                    <textarea
                        className="form-textarea"
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        placeholder="Observações gerais sobre o cliente..."
                    />
                </div>

                {/* Info about Supabase */}
                {!isEditing && (
                    <p className="text-sm text-gray mb-4" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FolderOpen size={14} />
                        Documentos anexados no futuro serão salvos de forma organizada no sistema.
                    </p>
                )}

                {/* Actions */}
                <div className="form-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
                        Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
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

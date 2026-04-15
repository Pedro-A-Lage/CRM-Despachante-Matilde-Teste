import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Plus, X, Loader2, Loader, User, Building2 } from 'lucide-react';
import { getCliente, saveCliente } from '../lib/database';
import { useToast } from '../components/Toast';
import {
    inputStyle, labelStyle, fieldWrapStyle, secaoStyle, secaoHeaderStyle,
} from '../components/ModalBase';

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
    const { showToast } = useToast();
    const { id } = useParams();
    const isEditing = Boolean(id);

    const [tipo, setTipo] = useState<TipoCliente>('PF');
    const [nome, setNome] = useState('');
    const [cpfCnpj, setCpfCnpj] = useState('');
    const [rg, setRg] = useState('');
    const [orgaoExpedidor, setOrgaoExpedidor] = useState('');
    const [ufDocumento, setUfDocumento] = useState('');
    const [telefones, setTelefones] = useState<string[]>(['']);
    const [email, setEmail] = useState('');
    const [cep, setCep] = useState('');
    const [numero, setNumero] = useState('');
    const [endereco, setEndereco] = useState('');
    const [complemento, setComplemento] = useState('');
    const [bairro, setBairro] = useState('');
    const [municipio, setMunicipio] = useState('');
    const [uf, setUf] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [saving, setSaving] = useState(false);
    const [buscandoCep, setBuscandoCep] = useState(false);

    useEffect(() => {
        if (id) {
            (async () => {
                const cliente = await getCliente(id);
                if (cliente) {
                    setTipo(cliente.tipo);
                    setNome(cliente.nome);
                    setCpfCnpj(cliente.cpfCnpj);
                    setRg(cliente.rg || '');
                    setOrgaoExpedidor(cliente.orgaoExpedidor || '');
                    setUfDocumento(cliente.ufDocumento || '');
                    setTelefones(cliente.telefones.length > 0 ? cliente.telefones : ['']);
                    setEmail(cliente.email || '');
                    setCep(cliente.cep || '');
                    setNumero(cliente.numero || '');
                    setEndereco(cliente.endereco || '');
                    setComplemento(cliente.complemento || '');
                    setBairro(cliente.bairro || '');
                    setMunicipio(cliente.municipio || '');
                    setUf(cliente.uf || '');
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

    const buscarCep = async () => {
        const cepLimpo = (cep || '').replace(/\D/g, '');
        if (cepLimpo.length !== 8) return;
        setBuscandoCep(true);
        try {
            const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
            const json = await resp.json();
            if (!json.erro) {
                if (json.logradouro && !endereco) setEndereco(json.logradouro);
                if (json.bairro && !bairro) setBairro(json.bairro);
                if (json.localidade && !municipio) setMunicipio(json.localidade);
                if (json.uf && !uf) setUf(json.uf);
            }
        } catch (err) {
            console.warn('Erro ao buscar CEP:', err);
        } finally {
            setBuscandoCep(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!nome.trim() || !cpfCnpj.trim()) {
            showToast('Preencha os campos obrigatórios: Nome e CPF/CNPJ', 'error');
            return;
        }

        setSaving(true);
        try {
            await saveCliente({
                id: id || undefined,
                tipo,
                nome: nome.trim(),
                cpfCnpj: cpfCnpj.trim(),
                rg: rg.trim() || undefined,
                orgaoExpedidor: orgaoExpedidor.trim() || undefined,
                ufDocumento: ufDocumento.trim() || undefined,
                telefones: telefones.filter((t) => t.trim() !== ''),
                email: email.trim() || undefined,
                cep: cep.trim() || undefined,
                numero: numero.trim() || undefined,
                endereco: endereco.trim() || undefined,
                complemento: complemento.trim() || undefined,
                bairro: bairro.trim() || undefined,
                municipio: municipio.trim() || undefined,
                uf: uf.trim() || undefined,
                observacoes: observacoes.trim() || undefined,
            });

            navigate(id ? `/clientes/${id}` : '/clientes');
        } catch (err) {
            showToast('Erro ao salvar cliente. Tente novamente.', 'error');
            console.error('Erro saveCliente:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 4px' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginBottom: 20,
                paddingBottom: 14,
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
                <div style={secaoStyle}>
                    <div style={secaoHeaderStyle}>Cliente</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '14px 16px' }}>
                        <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                            <label style={labelStyle}>Tipo de Cliente</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    type="button"
                                    onClick={() => setTipo('PF')}
                                    style={{
                                        flex: 1, padding: '8px 12px', borderRadius: 8,
                                        border: '1px solid var(--notion-border)',
                                        background: tipo === 'PF' ? 'var(--notion-blue)' : 'var(--notion-surface)',
                                        color: tipo === 'PF' ? '#fff' : 'var(--notion-text)',
                                        fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    Pessoa Física
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTipo('PJ')}
                                    style={{
                                        flex: 1, padding: '8px 12px', borderRadius: 8,
                                        border: '1px solid var(--notion-border)',
                                        background: tipo === 'PJ' ? 'var(--notion-blue)' : 'var(--notion-surface)',
                                        color: tipo === 'PJ' ? '#fff' : 'var(--notion-text)',
                                        fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                                        fontFamily: 'inherit',
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
                                value={cpfCnpj}
                                onChange={(e) => {
                                    const raw = e.target.value;
                                    const detectedTipo = detectTipo(raw);
                                    if (detectedTipo !== tipo) setTipo(detectedTipo);
                                    const formatted = detectedTipo === 'PF' ? formatCPF(raw) : formatCNPJ(raw);
                                    setCpfCnpj(formatted);
                                }}
                                placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                                maxLength={tipo === 'PF' ? 14 : 18}
                                required
                            />
                        </div>

                        <div style={fieldWrapStyle}>
                            <label style={labelStyle}>{tipo === 'PF' ? 'RG' : 'Inscrição Estadual'}</label>
                            <input style={inputStyle} value={rg} onChange={(e) => setRg(e.target.value)} />
                        </div>

                        <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                            <label style={labelStyle}>{tipo === 'PF' ? 'Nome Completo' : 'Razão Social'} *</label>
                            <input
                                style={inputStyle}
                                value={nome}
                                onChange={(e) => setNome(e.target.value)}
                                placeholder={tipo === 'PF' ? 'Nome do cliente' : 'Razão social da empresa'}
                                required
                            />
                        </div>

                        <div style={fieldWrapStyle}>
                            <label style={labelStyle}>Órgão Expedidor</label>
                            <input style={inputStyle} value={orgaoExpedidor} onChange={(e) => setOrgaoExpedidor(e.target.value)} />
                        </div>
                        <div style={fieldWrapStyle}>
                            <label style={labelStyle}>UF do Documento</label>
                            <input
                                style={inputStyle}
                                value={ufDocumento}
                                onChange={(e) => setUfDocumento(e.target.value.toUpperCase())}
                                maxLength={2}
                            />
                        </div>

                        <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                            <label style={labelStyle}>Telefone(s)</label>
                            {telefones.map((tel, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                    <input
                                        style={inputStyle}
                                        value={tel}
                                        onChange={(e) => updateTelefone(idx, formatPhone(e.target.value))}
                                        placeholder="(00) 00000-0000"
                                        maxLength={15}
                                    />
                                    {telefones.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeTelefone(idx)}
                                            style={{
                                                background: 'none',
                                                border: '1px solid var(--notion-border)',
                                                borderRadius: 8,
                                                padding: '0 10px',
                                                cursor: 'pointer',
                                                color: 'var(--notion-text-secondary)',
                                            }}
                                            aria-label="Remover telefone"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={addTelefone}
                                style={{
                                    alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '4px 10px', borderRadius: 6, border: '1px solid var(--notion-border)',
                                    background: 'var(--notion-bg-alt)', fontSize: '0.78rem', cursor: 'pointer',
                                    color: 'var(--notion-text-secondary)',
                                    fontFamily: 'inherit',
                                }}
                            >
                                <Plus size={12} /> Adicionar telefone
                            </button>
                        </div>

                        <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                            <label style={labelStyle}>E-mail</label>
                            <input
                                type="email"
                                style={inputStyle}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="email@exemplo.com"
                            />
                        </div>

                        <div style={fieldWrapStyle}>
                            <label style={labelStyle}>
                                CEP {buscandoCep && <Loader size={12} style={{ animation: 'spin 1s linear infinite', marginLeft: 4 }} />}
                            </label>
                            <input
                                style={inputStyle}
                                value={cep}
                                onChange={(e) => setCep(e.target.value)}
                                onBlur={buscarCep}
                                placeholder="Digite e saia do campo"
                            />
                        </div>
                        <div style={fieldWrapStyle}>
                            <label style={labelStyle}>Número</label>
                            <input style={inputStyle} value={numero} onChange={(e) => setNumero(e.target.value)} />
                        </div>
                        <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                            <label style={labelStyle}>Endereço</label>
                            <input style={inputStyle} value={endereco} onChange={(e) => setEndereco(e.target.value)} />
                        </div>
                        <div style={fieldWrapStyle}>
                            <label style={labelStyle}>Complemento</label>
                            <input style={inputStyle} value={complemento} onChange={(e) => setComplemento(e.target.value)} />
                        </div>
                        <div style={fieldWrapStyle}>
                            <label style={labelStyle}>Bairro</label>
                            <input style={inputStyle} value={bairro} onChange={(e) => setBairro(e.target.value)} />
                        </div>
                        <div style={fieldWrapStyle}>
                            <label style={labelStyle}>Município</label>
                            <input style={inputStyle} value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
                        </div>
                        <div style={fieldWrapStyle}>
                            <label style={labelStyle}>UF</label>
                            <input
                                style={inputStyle}
                                value={uf}
                                onChange={(e) => setUf(e.target.value.toUpperCase())}
                                maxLength={2}
                            />
                        </div>

                        <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
                            <label style={labelStyle}>Observações</label>
                            <textarea
                                style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit', resize: 'vertical' }}
                                value={observacoes}
                                onChange={(e) => setObservacoes(e.target.value)}
                                placeholder="Anotações gerais sobre o cliente (opcional)…"
                            />
                        </div>
                    </div>
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
                            background: saving ? 'var(--notion-text-muted)' : 'var(--notion-green)',
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

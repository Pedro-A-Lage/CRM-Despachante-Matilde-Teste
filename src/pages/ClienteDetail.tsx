import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useConfirm } from '../components/ConfirmProvider';
import {
    ArrowLeft,
    Pencil,
    Car,
    FileText,
    Plus,
    Phone,
    Mail,
    User,
    FolderOpen,
    Upload,
    File,
    CheckCircle,
    Loader2,
    ExternalLink,
    Trash2,
    MapPin,
    Hash,
    Calendar,
} from 'lucide-react';
import { getCliente, getVeiculosByCliente, getOrdensByCliente, updateCliente, generateId } from '../lib/database';
import { uploadFileToSupabase } from '../lib/fileStorage';
import { STATUS_OS_LABELS, type StatusOS } from '../types';
import { statusBadgeStyle } from '../lib/statusColors';
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
import type { DocumentoCliente } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import ClienteEditFullModal from '../components/ClienteEditFullModal';
import VeiculoEditFullModal from '../components/VeiculoEditFullModal';

function getStatusBadge(status: string) {
    const map: Record<string, string> = {
        aguardando_documentacao: 'badge-warning',
        vistoria: 'badge-info',
        delegacia: 'badge-primary',
        doc_pronto: 'badge-success',
        entregue: 'badge-neutral',
    };
    return map[status] || 'badge-neutral';
}

// Document types per client type
const DOCS_PF = [
    { tipo: 'CNH', label: 'CNH' },
    { tipo: 'RG', label: 'Identidade (RG)' },
    { tipo: 'CPF', label: 'CPF' },
];

const DOCS_PJ = [
    { tipo: 'Contrato Social', label: 'Contrato Social' },
    { tipo: 'Doc Responsável', label: 'Documento do Representante' },
];


export default function ClienteDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const serviceLabels = useServiceLabels();
    const [cliente, setCliente] = useState<import('../types').Cliente | null>(null);
    const [veiculos, setVeiculos] = useState<import('../types').Veiculo[]>([]);
    const [ordens, setOrdens] = useState<import('../types').OrdemDeServico[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditClienteOpen, setIsEditClienteOpen] = useState(false);
    const [editingVeiculo, setEditingVeiculo] = useState<import('../types').Veiculo | null>(null);

    const loadData = async () => {
        if (!id) return;
        setLoading(true);
        try {
            const [c, v, o] = await Promise.all([
                getCliente(id),
                getVeiculosByCliente(id),
                getOrdensByCliente(id),
            ]);
            setCliente(c ?? null);
            setVeiculos(v);
            setOrdens(o);
        } catch (err) {
            console.error('Erro ao carregar dados do cliente:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [id]);

    if (loading) return <LoadingSpinner fullPage label="Carregando cliente..." />;

    if (!cliente) {
        return (
            <div className="card">
                <div className="empty-state">
                    <User />
                    <h3>Cliente não encontrado</h3>
                    <Link to="/clientes" className="btn btn-primary">
                        Voltar para Clientes
                    </Link>
                </div>
            </div>
        );
    }

    const docTypes = cliente.tipo === 'PF' ? DOCS_PF : DOCS_PJ;

    return (
        <div>
            <div
                className="page-header"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-4)',
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                    <button onClick={() => navigate(-1)} className="btn btn-ghost" aria-label="Voltar">
                        <ArrowLeft size={18} />
                    </button>
                    <div style={{ minWidth: 0 }}>
                        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cliente.nome}</span>
                            <span className={`badge ${cliente.tipo === 'PF' ? 'badge-info' : 'badge-primary'}`}>
                                {cliente.tipo === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                            </span>
                        </h2>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                    {cliente.pastaDriveUrl && (
                        <a
                            href={cliente.pastaDriveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                        >
                            <FolderOpen size={16} /> Google Drive
                        </a>
                    )}
                    <button
                        onClick={() => setIsEditClienteOpen(true)}
                        className="btn btn-secondary"
                    >
                        <Pencil size={16} /> Editar
                    </button>
                </div>
            </div>

            {/* Info Grid */}
            <div className="card mb-6">
                <div className="card-header">
                    <h3 className="card-title">Dados do Cliente</h3>
                </div>
                <div className="card-body">
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: 'var(--space-4) var(--space-5)',
                        }}
                    >
                        <InfoCell label={cliente.tipo === 'PF' ? 'CPF' : 'CNPJ'} value={cliente.cpfCnpj} icon={<Hash size={11} />} mono />
                        {cliente.tipo === 'PF' && (
                            <InfoCell label="RG" value={cliente.rg} icon={<Hash size={11} />} mono />
                        )}
                        {cliente.tipo === 'PF' && (cliente.orgaoExpedidor || cliente.ufDocumento) && (
                            <InfoCell
                                label="Órgão Expedidor"
                                value={[cliente.orgaoExpedidor, cliente.ufDocumento].filter(Boolean).join(' / ')}
                            />
                        )}
                        {cliente.telefones.filter(Boolean).map((tel, i) => (
                            <InfoCell
                                key={i}
                                label={`Telefone${cliente.telefones.filter(Boolean).length > 1 ? ' ' + (i + 1) : ''}`}
                                value={tel}
                                icon={<Phone size={11} />}
                                mono
                            />
                        ))}
                        {cliente.email && (
                            <InfoCell label="E-mail" value={cliente.email} icon={<Mail size={11} />} />
                        )}
                        {cliente.cep && (
                            <InfoCell label="CEP" value={cliente.cep} icon={<MapPin size={11} />} mono />
                        )}
                        {(cliente.endereco || cliente.numero) && (
                            <InfoCell
                                label="Endereço"
                                value={[cliente.endereco, cliente.numero].filter(Boolean).join(', ')}
                                span={2}
                                icon={<MapPin size={11} />}
                            />
                        )}
                        {cliente.complemento && (
                            <InfoCell label="Complemento" value={cliente.complemento} />
                        )}
                        {cliente.bairro && (
                            <InfoCell label="Bairro" value={cliente.bairro} />
                        )}
                        {(cliente.municipio || cliente.uf) && (
                            <InfoCell
                                label="Município / UF"
                                value={[cliente.municipio, cliente.uf].filter(Boolean).join(' / ')}
                            />
                        )}
                        <InfoCell
                            label="Cadastro"
                            value={new Date(cliente.criadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                            icon={<Calendar size={11} />}
                        />
                    </div>
                    {cliente.observacoes && (
                        <div style={{
                            marginTop: 'var(--space-5)',
                            paddingTop: 'var(--space-4)',
                            borderTop: '1px solid var(--notion-border)',
                        }}>
                            <span className="info-item-label" style={{ display: 'block', marginBottom: 6 }}>Observações</span>
                            <p className="text-sm" style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--notion-text)' }}>
                                {cliente.observacoes}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Documentos */}
            <div className="card mb-6">
                <div className="card-header">
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={18} />
                        Documentos
                    </h3>
                </div>

                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {docTypes.map((docType) => {
                        const uploaded = cliente.documentos.find((d) => d.tipo === docType.tipo);
                        return (
                            <DocumentSlot
                                key={docType.tipo}
                                tipo={docType.tipo}
                                label={docType.label}
                                uploaded={uploaded}
                                clienteId={cliente.id}
                                pastaDriveId={cliente.pastaDriveId}
                                pastaDriveUrl={cliente.pastaDriveUrl}
                                clienteNome={cliente.nome}
                                clienteCpfCnpj={cliente.cpfCnpj}
                                onRefresh={() => loadData()}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Veículos */}
            <div className="card mb-6">
                <div className="card-header">
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Car size={18} />
                        Veículos ({veiculos.length})
                    </h3>
                    <Link to={`/veiculos/novo?clienteId=${id}`} className="btn btn-secondary btn-sm">
                        <Plus size={14} /> Adicionar
                    </Link>
                </div>
                <div className="card-body">
                    {veiculos.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--notion-text-muted)', margin: 0 }}>
                            Nenhum veículo vinculado a este cliente.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            {veiculos.map((v) => {
                                const veiculoOrdens = ordens.filter((o) => o.veiculoId === v.id);
                                return (
                                    <div
                                        key={v.id}
                                        style={{
                                            padding: 'var(--space-4)',
                                            background: 'var(--notion-bg-alt)',
                                            borderRadius: 8,
                                            border: '1px solid var(--notion-border)',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                                            <div style={{ minWidth: 0 }}>
                                                <p style={{ margin: 0, fontWeight: 600, color: 'var(--notion-text)' }}>
                                                    <span className="font-mono">{v.placa || 'SEM PLACA'}</span>
                                                    {' — '}
                                                    {v.marcaModelo || 'Modelo não informado'}
                                                </p>
                                                <p className="text-xs" style={{ margin: '2px 0 0', color: 'var(--notion-text-muted)' }}>
                                                    Chassi: <span className="font-mono">{v.chassi}</span>
                                                    {v.renavam && <> {' | '} Renavam: <span className="font-mono">{v.renavam}</span></>}
                                                </p>
                                            </div>
                                            <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                                                {v.pastaDriveId && (
                                                    <a
                                                        href={`https://drive.google.com/drive/folders/${v.pastaDriveId}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn btn-secondary btn-sm"
                                                        title="Abrir pasta do veículo no Drive"
                                                    >
                                                        <FolderOpen size={14} /> Drive
                                                    </a>
                                                )}
                                                <button
                                                    onClick={() => setEditingVeiculo(v)}
                                                    className="btn btn-ghost btn-sm"
                                                    title="Editar veículo"
                                                    aria-label="Editar veículo"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Related OS */}
                                        {veiculoOrdens.length > 0 && (
                                            <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                                                {veiculoOrdens.map((os) => (
                                                    <div
                                                        key={os.id}
                                                        className="clickable"
                                                        onClick={() => navigate(`/ordens/${os.id}`)}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: 'var(--space-2) var(--space-3)',
                                                            background: 'var(--notion-surface)',
                                                            borderRadius: 4,
                                                            cursor: 'pointer',
                                                            border: '1px solid var(--notion-border)',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                                            <FileText size={14} style={{ color: 'var(--notion-blue)' }} />
                                                            <span className="text-sm font-mono" style={{ fontWeight: 600 }}>OS #{os.numero}</span>
                                                            <span className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>— {getServicoLabel(serviceLabels, os.tipoServico)}</span>
                                                        </div>
                                                        <span style={statusBadgeStyle(os.status as StatusOS)}>
                                                            {STATUS_OS_LABELS[os.status]}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Ordens de Serviço */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={18} />
                        Ordens de Serviço ({ordens.length})
                    </h3>
                    <Link to="/ordens" className="btn btn-secondary btn-sm">
                        <Plus size={14} /> Nova OS
                    </Link>
                </div>
                {ordens.length === 0 ? (
                    <div className="card-body">
                        <p className="text-sm" style={{ color: 'var(--notion-text-muted)', margin: 0 }}>
                            Nenhuma ordem de serviço para este cliente.
                        </p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>OS</th>
                                    <th>Serviço</th>
                                    <th>Status</th>
                                    <th>Data</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ordens.map((os) => (
                                    <tr
                                        key={os.id}
                                        className="clickable"
                                        onClick={() => navigate(`/ordens/${os.id}`)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <td><span className="font-mono" style={{ fontWeight: 600 }}>#{os.numero}</span></td>
                                        <td>{getServicoLabel(serviceLabels, os.tipoServico)}</td>
                                        <td>
                                            <span style={statusBadgeStyle(os.status as StatusOS)}>
                                                {STATUS_OS_LABELS[os.status]}
                                            </span>
                                        </td>
                                        <td>{new Date(os.dataAbertura).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ===== MODAIS DE EDIÇÃO ===== */}
            <ClienteEditFullModal
                isOpen={isEditClienteOpen}
                cliente={cliente}
                onClose={() => setIsEditClienteOpen(false)}
                onSaved={() => { setIsEditClienteOpen(false); loadData(); }}
            />

            {editingVeiculo && (
                <VeiculoEditFullModal
                    isOpen={!!editingVeiculo}
                    veiculo={editingVeiculo}
                    onClose={() => setEditingVeiculo(null)}
                    onSaved={() => { setEditingVeiculo(null); loadData(); }}
                />
            )}
        </div>
    );
}

// ===== DOCUMENT SLOT COMPONENT =====
function DocumentSlot({
    tipo,
    label,
    uploaded,
    clienteId,
    pastaDriveId,
    pastaDriveUrl,
    clienteNome,
    clienteCpfCnpj,
    onRefresh,
}: {
    tipo: string;
    label: string;
    uploaded?: DocumentoCliente;
    clienteId: string;
    pastaDriveId?: string;
    pastaDriveUrl?: string;
    clienteNome: string;
    clienteCpfCnpj: string;
    onRefresh: () => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const confirmDialog = useConfirm();

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (file.type !== 'application/pdf') {
            setError('Apenas arquivos PDF são aceitos');
            return;
        }

        setUploading(true);
        setError('');

        try {
            // Upload to Supabase
            const fileName = `${tipo}_${clienteNome}.pdf`;
            const path = `clientes/${clienteId}/${fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
            const publicUrl = await uploadFileToSupabase(file, path);

            // Save document record in cliente
            const cliente = await getCliente(clienteId);
            if (!cliente) throw new Error('Cliente não encontrado');

            // Replace existing doc of same type or add new
            const docs = cliente.documentos.filter((d) => d.tipo !== tipo);
            docs.push({
                id: generateId(),
                tipo,
                nome: fileName,
                arquivo: publicUrl,
                dataUpload: new Date().toISOString(),
            });

            await updateCliente(clienteId, { documentos: docs });
            onRefresh();
        } catch (err) {
            console.error('Erro ao enviar documento:', err);
            setError(err instanceof Error ? err.message : 'Erro ao enviar documento');
        } finally {
            setUploading(false);
            // Reset input
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleRemove = async () => {
        const ok = await confirmDialog({
            title: 'Remover documento',
            message: `Remover ${label} do cadastro?`,
            confirmText: 'Remover',
            danger: true,
        });
        if (!ok) return;

        const cliente = await getCliente(clienteId);
        if (!cliente) return;

        const docs = cliente.documentos.filter((d) => d.tipo !== tipo);
        await updateCliente(clienteId, { documentos: docs });
        onRefresh();
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                background: uploaded ? 'var(--status-success-soft)' : 'var(--notion-bg-alt)',
                borderRadius: 8,
                border: '1px solid var(--notion-border)',
                borderLeft: `3px solid ${uploaded ? 'var(--status-success)' : 'var(--notion-border)'}`,
                transition: 'border-color 150ms ease, background 150ms ease',
                flexWrap: 'wrap',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                {uploaded ? (
                    <CheckCircle size={18} style={{ color: 'var(--status-success)', flexShrink: 0 }} />
                ) : (
                    <File size={18} style={{ color: 'var(--notion-text-muted)', flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 0 }}>
                    <p className="text-sm" style={{ margin: 0, fontWeight: 600, color: 'var(--notion-text)' }}>{label}</p>
                    {uploaded ? (
                        <p className="text-xs" style={{ margin: 0, color: 'var(--status-success)', fontWeight: 500 }}>
                            Enviado em {new Date(uploaded.dataUpload!).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </p>
                    ) : (
                        <p className="text-xs" style={{ margin: 0, color: 'var(--notion-text-muted)' }}>Nenhum arquivo enviado</p>
                    )}
                    {error && <p className="text-xs" style={{ color: 'var(--status-danger)', margin: 0 }}>{error}</p>}
                </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                {uploaded?.arquivo && (
                    <a
                        href={uploaded.arquivo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                    >
                        <ExternalLink size={14} /> Ver
                    </a>
                )}

                {uploaded && (
                    <button className="btn btn-ghost btn-sm" onClick={handleRemove} title="Remover documento" aria-label="Remover documento">
                        <Trash2 size={14} />
                    </button>
                )}

                <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                />
                <button
                    className={`btn ${uploaded ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                >
                    {uploading ? (
                        <>
                            <Loader2 size={14} className="spin" /> Enviando...
                        </>
                    ) : (
                        <>
                            <Upload size={14} /> {uploaded ? 'Substituir' : 'Enviar PDF'}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

// ===== INFO CELL =====
function InfoCell({
    label,
    value,
    icon,
    span,
    mono = false,
}: {
    label: string;
    value?: string | null;
    icon?: React.ReactNode;
    span?: number;
    mono?: boolean;
}) {
    const display = value && value.trim() ? value : '—';
    const isEmpty = display === '—';
    return (
        <div
            className="info-item"
            style={{
                minWidth: 0,
                ...(span ? { gridColumn: `span ${span}` } : {}),
            }}
        >
            <span
                className="info-item-label"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
                {icon} {label}
            </span>
            <span
                className={`info-item-value${mono && !isEmpty ? ' font-mono' : ''}`}
                style={{
                    color: isEmpty ? 'var(--notion-text-muted)' : 'var(--notion-text)',
                    fontStyle: isEmpty ? 'italic' : 'normal',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
                title={display}
            >
                {display}
            </span>
        </div>
    );
}

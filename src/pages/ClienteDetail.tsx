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
} from 'lucide-react';
import { getCliente, getVeiculosByCliente, getOrdensByCliente, updateCliente, generateId } from '../lib/database';
import { uploadFileToSupabase } from '../lib/fileStorage';
import { STATUS_OS_LABELS } from '../types';
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
import type { DocumentoCliente } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';

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
            <div className="page-header">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="btn btn-ghost">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h2>{cliente.nome}</h2>
                        <p className="page-header-subtitle">
                            <span className={`badge ${cliente.tipo === 'PF' ? 'badge-info' : 'badge-primary'}`}>
                                {cliente.tipo === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                            </span>
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
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
                    <Link to={`/clientes/${id}/editar`} className="btn btn-secondary">
                        <Pencil size={16} /> Editar
                    </Link>
                </div>
            </div>

            {/* Info Grid */}
            <div className="card mb-6">
                <div className="card-header">
                    <h3 className="card-title">Dados do Cliente</h3>
                </div>
                <div className="info-grid">
                    <div className="info-item">
                        <span className="info-item-label">{cliente.tipo === 'PF' ? 'CPF' : 'CNPJ'}</span>
                        <span className="info-item-value">{cliente.cpfCnpj}</span>
                    </div>
                    {cliente.telefones.map((tel, i) => (
                        <div className="info-item" key={i}>
                            <span className="info-item-label">
                                <Phone size={12} style={{ display: 'inline', marginRight: 4 }} />
                                Telefone {cliente.telefones.length > 1 ? i + 1 : ''}
                            </span>
                            <span className="info-item-value">{tel}</span>
                        </div>
                    ))}
                    {cliente.email && (
                        <div className="info-item">
                            <span className="info-item-label">
                                <Mail size={12} style={{ display: 'inline', marginRight: 4 }} />
                                E-mail
                            </span>
                            <span className="info-item-value">{cliente.email}</span>
                        </div>
                    )}
                    <div className="info-item">
                        <span className="info-item-label">Cadastro</span>
                        <span className="info-item-value">
                            {new Date(cliente.criadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </span>
                    </div>
                </div>
                {cliente.observacoes && (
                    <div style={{ marginTop: 'var(--space-4)' }}>
                        <span className="info-item-label">Observações</span>
                        <p className="text-sm" style={{ marginTop: 4 }}>
                            {cliente.observacoes}
                        </p>
                    </div>
                )}
            </div>

            {/* Documentos */}
            <div className="card mb-6">
                <div className="card-header">
                    <h3 className="card-title">
                        <FileText size={20} style={{ display: 'inline', marginRight: 8 }} />
                        Documentos
                    </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
                    <h3 className="card-title">
                        <Car size={20} style={{ display: 'inline', marginRight: 8 }} />
                        Veículos ({veiculos.length})
                    </h3>
                    <Link to={`/veiculos/novo?clienteId=${id}`} className="btn btn-secondary btn-sm">
                        <Plus size={14} /> Adicionar
                    </Link>
                </div>
                {veiculos.length === 0 ? (
                    <p className="text-sm text-gray">Nenhum veículo vinculado a este cliente.</p>
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
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--notion-border)',
                                    }}
                                >
                                    <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-2)' }}>
                                        <div>
                                            <p className="font-bold">{v.placa || 'SEM PLACA'} — {v.marcaModelo || 'Modelo não informado'}</p>
                                            <p className="text-xs text-gray">
                                                Chassi: {v.chassi} {v.renavam && `| Renavam: ${v.renavam}`}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
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
                                            <Link to={`/veiculos/${v.id}/editar`} className="btn btn-ghost btn-sm" title="Editar veículo">
                                                <Pencil size={14} />
                                            </Link>
                                        </div>
                                    </div>

                                    {/* Related OS */}
                                    {veiculoOrdens.length > 0 && (
                                        <div style={{ marginTop: 'var(--space-2)' }}>
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
                                                        background: 'var(--bg-surface)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        marginTop: 'var(--space-1)',
                                                        cursor: 'pointer',
                                                        border: '1px solid var(--notion-border)',
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <FileText size={14} style={{ color: 'var(--notion-blue)' }} />
                                                        <span className="text-sm font-semibold">OS #{os.numero}</span>
                                                        <span className="text-xs text-gray">— {getServicoLabel(serviceLabels, os.tipoServico)}</span>
                                                    </div>
                                                    <span className={`badge ${getStatusBadge(os.status)}`} style={{ fontSize: 'var(--font-size-xs)' }}>
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

            {/* Ordens de Serviço */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">
                        <FileText size={20} style={{ display: 'inline', marginRight: 8 }} />
                        Ordens de Serviço ({ordens.length})
                    </h3>
                    <Link to="/ordens" className="btn btn-secondary btn-sm">
                        <Plus size={14} /> Nova OS
                    </Link>
                </div>
                {ordens.length === 0 ? (
                    <p className="text-sm text-gray">Nenhuma ordem de serviço para este cliente.</p>
                ) : (
                    <div className="table-container">
                        <table>
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
                                    >
                                        <td><strong>#{os.numero}</strong></td>
                                        <td>{getServicoLabel(serviceLabels, os.tipoServico)}</td>
                                        <td>
                                            <span className={`badge ${getStatusBadge(os.status)}`}>
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
                padding: 'var(--space-4)',
                background: uploaded ? 'var(--notion-green)' : 'var(--notion-bg-alt)',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${uploaded ? 'var(--notion-green)' : 'var(--notion-border)'}`,
                transition: 'all var(--transition-fast)',
            }}
        >
            <div className="flex items-center gap-3">
                {uploaded ? (
                    <CheckCircle size={20} style={{ color: 'var(--notion-green)', flexShrink: 0 }} />
                ) : (
                    <File size={20} style={{ color: 'var(--notion-text-secondary)', flexShrink: 0 }} />
                )}
                <div>
                    <p className="font-semibold text-sm">{label}</p>
                    {uploaded ? (
                        <p className="text-xs text-gray">
                            Enviado em {new Date(uploaded.dataUpload!).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </p>
                    ) : (
                        <p className="text-xs text-gray">Nenhum arquivo enviado</p>
                    )}
                    {error && <p className="text-xs" style={{ color: 'var(--notion-orange)' }}>{error}</p>}
                </div>
            </div>

            <div className="flex gap-2">
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
                    <button className="btn btn-ghost btn-sm" onClick={handleRemove} title="Remover documento">
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

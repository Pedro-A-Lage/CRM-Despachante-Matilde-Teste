import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Mail, RefreshCw, AlertTriangle, X, Paperclip, Download, ArrowDownLeft, ArrowUpRight, FolderOpen } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getEmpresasAtivas } from '../lib/empresaService';
import type { EmpresaParceira } from '../types/empresa';
import { useToast } from '../components/Toast';

interface OutlookFolder {
    id: string;
    displayName: string;
    parentFolderId?: string;
    childFolderCount?: number;
    unreadItemCount?: number;
    totalItemCount?: number;
}

interface Email {
    id: string;
    threadId: string;
    subject: string;
    from: string;
    date: string;
    snippet: string;
    direction: 'in' | 'out';
    isRead: boolean;
    hasAttachments: boolean;
}

interface Attachment {
    filename: string;
    mimeType: string;
    partId: string;
    attachmentId: string;
    size: number;
}

interface EmailDetails {
    id: string;
    subject: string;
    from: string;
    date: string;
    body: string;
    attachments: Attachment[];
}

// System folders sempre exibidas, mesmo sem empresa parceira associada.
// "Placas" é o destino dos comprovantes de emplacamento.
const SYSTEM_FOLDERS = ['placas', 'placa'];

const DEFAULT_FOLDER = '';

export default function Emails() {
    const { showToast } = useToast();
    const [folders, setFolders] = useState<OutlookFolder[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string>(DEFAULT_FOLDER);
    const [empresas, setEmpresas] = useState<EmpresaParceira[]>([]);
    const [selectedEmpresaEmail, setSelectedEmpresaEmail] = useState<string>('');

    const [emails, setEmails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingFolders, setLoadingFolders] = useState(true);
    const [error, setError] = useState('');

    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [emailDetails, setEmailDetails] = useState<EmailDetails | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

    // Empresa cuja pasta coincide (case-insensitive) com a pasta selecionada.
    // Prioriza o campo configurável `pastaOutlook`; se vazio, cai para `nome`.
    const empresaDaPasta = useMemo(() => {
        const key = selectedFolder.trim().toLowerCase();
        return empresas.find(e => {
            const pasta = (e.pastaOutlook || e.nome).trim().toLowerCase();
            return pasta === key;
        }) || null;
    }, [empresas, selectedFolder]);

    const loadFolders = async () => {
        setLoadingFolders(true);
        try {
            const { data, error: invokeError } = await supabase.functions.invoke('get-outlook-folders');
            if (invokeError) throw invokeError;
            if (data?.error) throw new Error(data.error);
            setFolders(data?.folders || []);
        } catch (err: any) {
            console.error('Erro ao carregar pastas:', err);
            setError(err.message || 'Falha ao listar pastas Outlook');
        } finally {
            setLoadingFolders(false);
        }
    };

    const loadEmpresas = async () => {
        try {
            const list = await getEmpresasAtivas();
            setEmpresas(list);
        } catch (err) {
            console.error('Erro ao carregar empresas:', err);
        }
    };

    const loadEmails = async (folderName: string, empresaEmail?: string) => {
        setLoading(true);
        setError('');
        try {
            const { data, error: invokeError } = await supabase.functions.invoke('get-outlook-emails', {
                body: { folderName, empresaEmail: empresaEmail || undefined, limit: 50 },
            });
            if (invokeError) throw invokeError;
            if (data?.error) throw new Error(data.error);
            setEmails(data?.emails || []);
        } catch (err: any) {
            console.error('Erro ao carregar e-mails:', err);
            setError(err.message || 'Falha ao buscar e-mails');
            setEmails([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFolders();
        loadEmpresas();
    }, []);

    useEffect(() => {
        // Quando pasta muda, tenta pre-selecionar o email da empresa correspondente
        const emailSugerido = empresaDaPasta?.email || '';
        setSelectedEmpresaEmail(emailSugerido);
        loadEmails(selectedFolder, emailSugerido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFolder, empresaDaPasta]);

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return format(date, "d 'de' MMM 'às' HH:mm", { locale: ptBR });
        } catch {
            return dateString;
        }
    };

    const handleOpenEmail = async (email: Email) => {
        setSelectedEmail(email);
        setLoadingDetails(true);
        setEmailDetails(null);
        setError('');

        try {
            const { data, error } = await supabase.functions.invoke('get-outlook-email-details', {
                body: { id: email.id },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            setEmailDetails(data);
        } catch (err: any) {
            console.error('Erro ao carregar detalhes do e-mail:', err);
            setError('Falha ao abrir e-mail: ' + err.message);
            setSelectedEmail(null);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleDownloadAttachment = async (messageId: string, attachment: Attachment) => {
        setDownloadingUrl(attachment.attachmentId);
        try {
            const { data, error } = await supabase.functions.invoke('get-outlook-email-attachment', {
                body: { messageId, attachmentId: attachment.attachmentId },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            const b64 = (data.data || '').replace(/-/g, '+').replace(/_/g, '/');
            const byteCharacters = atob(b64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: attachment.mimeType });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = attachment.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            console.error('Erro ao baixar anexo:', err);
            showToast('Falha ao baixar anexo: ' + err.message, 'error');
        } finally {
            setDownloadingUrl(null);
        }
    };

    const orderedFolders = useMemo(() => {
        // Só exibe pastas vinculadas a uma empresa parceira (via pastaOutlook
        // ou nome) + as system folders (Placas, usada pelo robô). Esconde
        // tudo mais (Inbox, Drafts, Sent Items, etc).
        const empresaNames = empresas.map(e =>
            (e.pastaOutlook || e.nome).trim().toLowerCase()
        );
        const allowed = new Set<string>([...SYSTEM_FOLDERS, ...empresaNames]);

        const priority: Record<string, number> = {
            'placa': 1, 'placas': 1,
        };
        return folders
            .filter(f => allowed.has((f.displayName || '').trim().toLowerCase()))
            .sort((a, b) => {
                const pa = priority[a.displayName.toLowerCase()] ?? 50;
                const pb = priority[b.displayName.toLowerCase()] ?? 50;
                if (pa !== pb) return pa - pb;
                return a.displayName.localeCompare(b.displayName, 'pt-BR');
            });
    }, [folders, empresas]);

    // Auto-seleciona a primeira pasta visível quando ainda não há seleção
    // (ou quando a seleção atual foi filtrada pra fora, ex.: 'Inbox').
    useEffect(() => {
        if (orderedFolders.length === 0) return;
        const current = selectedFolder.trim().toLowerCase();
        const visible = orderedFolders.some(f =>
            f.displayName.trim().toLowerCase() === current
        );
        if (!visible) setSelectedFolder(orderedFolders[0].displayName);
    }, [orderedFolders, selectedFolder]);

    const empresaEmailAtiva = selectedEmpresaEmail || empresaDaPasta?.email || '';

    return (
        <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Mail size={20} />
                    Caixa de E-mails {empresaDaPasta ? `— ${empresaDaPasta.nome}` : `(Outlook)`}
                </h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        onClick={() => loadEmails(selectedFolder, empresaEmailAtiva)}
                        className="btn btn-secondary"
                        disabled={loading}
                    >
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Filtros: pasta + empresa */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--notion-border)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', background: 'var(--notion-bg-alt)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FolderOpen size={16} style={{ color: 'var(--notion-text-secondary)' }} />
                    <label style={{ fontSize: '0.85rem', color: 'var(--notion-text-secondary)', fontWeight: 500 }}>Pasta:</label>
                    <select
                        value={selectedFolder}
                        onChange={(e) => setSelectedFolder(e.target.value)}
                        disabled={loadingFolders}
                        className="input"
                        style={{ minWidth: 200 }}
                    >
                        {loadingFolders && <option>Carregando...</option>}
                        {!loadingFolders && orderedFolders.map((f) => (
                            <option key={f.id} value={f.displayName}>
                                {f.displayName}{f.unreadItemCount ? ` (${f.unreadItemCount})` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {empresaDaPasta ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--notion-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: empresaDaPasta.cor || '#3B82F6', display: 'inline-block',
                        }} />
                        Pasta vinculada à empresa <strong style={{ color: 'var(--text-color)' }}>{empresaDaPasta.nome}</strong>
                        {empresaEmailAtiva && <> — mostrando recebidos + enviados para <code style={{ fontSize: '0.8rem' }}>{empresaEmailAtiva}</code></>}
                    </div>
                ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--notion-text-secondary)' }}>
                        Nenhuma empresa vinculada. Crie uma pasta no Outlook com o mesmo nome de uma empresa parceira para agrupar automaticamente.
                    </div>
                )}
            </div>

            <div className="card-body" style={{ padding: 0 }}>
                {error && (
                    <div style={{ margin: '16px', padding: '12px', background: 'rgba(221,91,0,0.08)', color: 'var(--notion-text)', border: '1px solid rgba(221,91,0,0.2)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={16} style={{ color: 'var(--notion-orange)', flexShrink: 0 }} />
                        {error}
                    </div>
                )}

                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--notion-text-secondary)' }}>
                        <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
                        <p>Sincronizando com Outlook (pasta: {selectedFolder})...</p>
                    </div>
                ) : emails.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--notion-text-secondary)' }}>
                        <Mail size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                        <p>Nenhuma mensagem encontrada nesta pasta.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                        {emails.map((email) => (
                            <div
                                key={`${email.direction}-${email.id}`}
                                onClick={() => handleOpenEmail(email)}
                                style={{
                                    padding: '16px',
                                    borderBottom: '1px solid var(--notion-border)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s',
                                    background: 'var(--notion-bg-alt)',
                                    borderLeft: email.direction === 'out'
                                        ? '3px solid var(--notion-green, #15803d)'
                                        : '3px solid transparent',
                                    opacity: email.isRead ? 0.85 : 1,
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--notion-bg)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--notion-bg-alt)'}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        {email.direction === 'in'
                                            ? <ArrowDownLeft size={14} style={{ color: 'var(--notion-blue)' }} aria-label="Recebido" />
                                            : <ArrowUpRight size={14} style={{ color: 'var(--notion-green, #15803d)' }} aria-label="Enviado" />}
                                        <div style={{ fontWeight: 600, color: email.direction === 'in' ? 'var(--notion-blue)' : 'var(--notion-green, #15803d)', fontSize: '0.95rem' }}>
                                            {email.from.replace(/<.*>/, '').trim()}
                                        </div>
                                        {email.hasAttachments && <Paperclip size={12} style={{ color: 'var(--notion-text-secondary)' }} />}
                                        {!email.isRead && email.direction === 'in' && (
                                            <span style={{
                                                fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: 8,
                                                background: 'var(--notion-blue)', color: '#fff', textTransform: 'uppercase',
                                            }}>NOVO</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--notion-text-secondary)' }}>
                                        {formatDate(email.date)}
                                    </div>
                                </div>
                                <div style={{ fontWeight: 500, color: 'var(--text-color)', fontSize: '0.9rem' }}>
                                    {email.subject}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--notion-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {email.snippet}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Email View Modal */}
            {selectedEmail && (
                <div className="modal-overlay" style={{ zIndex: 9999 }}>
                    <div className="modal" style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {selectedEmail.subject}
                            </h3>
                            <button className="btn btn-ghost" onClick={() => setSelectedEmail(null)}><X size={20} /></button>
                        </div>

                        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--notion-border)' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {selectedEmail.direction === 'in'
                                            ? <ArrowDownLeft size={16} style={{ color: 'var(--notion-blue)' }} />
                                            : <ArrowUpRight size={16} style={{ color: 'var(--notion-green, #15803d)' }} />}
                                        {selectedEmail.from.replace(/<.*>/, '').trim()}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--notion-text-secondary)', marginTop: '4px' }}>
                                        {selectedEmail.from.match(/<([^>]+)>/)?.[1] || selectedEmail.from}
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--notion-text-secondary)' }}>
                                    {formatDate(selectedEmail.date)}
                                </div>
                            </div>

                            {loadingDetails ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--notion-text-secondary)' }}>
                                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
                                    <p>Baixando mensagem do Outlook...</p>
                                </div>
                            ) : emailDetails ? (
                                <>
                                    <div style={{
                                        color: 'var(--text-color)',
                                        whiteSpace: 'pre-wrap',
                                        fontFamily: 'inherit',
                                        fontSize: '0.95rem',
                                        lineHeight: '1.6',
                                        marginBottom: '32px',
                                    }}>
                                        {emailDetails.body}
                                    </div>

                                    {emailDetails.attachments && emailDetails.attachments.length > 0 && (
                                        <div style={{ marginTop: '24px' }}>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--notion-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Paperclip size={16} /> Anexos ({emailDetails.attachments.length})
                                            </h4>

                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                                {emailDetails.attachments.map((att) => (
                                                    <div key={att.attachmentId} style={{
                                                        display: 'flex', alignItems: 'center', gap: '12px',
                                                        padding: '12px 16px',
                                                        background: 'var(--notion-bg-alt)',
                                                        border: '1px solid var(--notion-border)',
                                                        borderRadius: '8px',
                                                        minWidth: '250px',
                                                        flex: '1 1 auto',
                                                    }}>
                                                        <div style={{
                                                            width: '40px', height: '40px',
                                                            background: 'rgba(56, 189, 248, 0.1)',
                                                            color: 'var(--notion-blue)',
                                                            borderRadius: '8px',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            <FileIcon mimeType={att.mimeType} />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={att.filename}>{att.filename}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--notion-text-secondary)' }}>{(att.size / 1024).toFixed(1)} KB</div>
                                                        </div>
                                                        <button
                                                            className="btn btn-primary"
                                                            style={{ padding: '8px 12px' }}
                                                            onClick={() => handleDownloadAttachment(selectedEmail.id, att)}
                                                            disabled={downloadingUrl === att.attachmentId}
                                                        >
                                                            {downloadingUrl === att.attachmentId ? <RefreshCw size={16} className="spin" /> : <Download size={16} />}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ padding: '20px', color: 'var(--notion-orange)', textAlign: 'center' }}>
                                    Não foi possível carregar os detalhes desta mensagem.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .spin { animation: spin 1s linear infinite; }
                .pulse { animation: pulse 1.5s ease-in-out infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
            `}</style>
        </div>
    );
}

function FileIcon({ mimeType }: { mimeType: string }) {
    if (mimeType.includes('pdf')) return <span style={{ fontWeight: 800, fontSize: '0.7rem' }}>PDF</span>;
    if (mimeType.includes('image')) return <span style={{ fontWeight: 800, fontSize: '0.7rem' }}>IMG</span>;
    if (mimeType.includes('word')) return <span style={{ fontWeight: 800, fontSize: '0.7rem' }}>DOC</span>;
    return <Paperclip size={20} />;
}

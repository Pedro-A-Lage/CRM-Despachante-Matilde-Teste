import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Mail, RefreshCw, AlertTriangle, X, Paperclip, Download, Bot, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Email {
    id: string;
    threadId: string;
    subject: string;
    from: string;
    date: string;
    snippet: string;
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

export default function Emails() {
    const [emails, setEmails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [emailDetails, setEmailDetails] = useState<EmailDetails | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

    const loadEmails = async () => {
        setLoading(true);
        setError('');
        try {
            const { data, error: invokeError } = await supabase.functions.invoke('get-emails');
            
            if (invokeError) throw invokeError;
            if (data?.error) throw new Error(data.error);

            if (data?.emails) {
                setEmails(data.emails);
            }
        } catch (err: any) {
            console.error('Erro ao carregar e-mails:', err);
            setError(err.message || 'Falha ao buscar e-mails');
        } finally {
            setLoading(false);
        }
    };

    const [syncingBot, setSyncingBot] = useState(false);
    const [botMessage, setBotMessage] = useState<string | null>(null);

    const handleBotSync = async () => {
        setSyncingBot(true);
        setBotMessage(null);
        setError('');
        try {
            const { data, error: invokeError } = await supabase.functions.invoke('parse-stamper-emails');
            if (invokeError) throw invokeError;
            if (data?.error) throw new Error(data.error);

            setBotMessage(`Robô sincronizou ${data?.processed || 0} e-mails não lidos.`);
            // Recarrega a lista
            loadEmails();
        } catch (err: any) {
            console.error('Erro ao sincronizar robô:', err);
            setError('Falha ao rodar automação: ' + err.message);
        } finally {
            setSyncingBot(false);
        }
    };

    useEffect(() => {
        loadEmails();
    }, []);

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
            const { data, error } = await supabase.functions.invoke('get-email-details', {
                body: { id: email.id }
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
            const { data, error } = await supabase.functions.invoke('get-email-attachment', {
                body: { messageId, attachmentId: attachment.attachmentId }
            });
            
            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            const b64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
            const byteCharacters = atob(b64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
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
            alert('Falha ao baixar anexo: ' + err.message);
        } finally {
            setDownloadingUrl(null);
        }
    };

    return (
        <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Mail size={20} />
                    Caixa de E-mails da Estampadora
                </h2>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                        onClick={handleBotSync} 
                        className="btn btn-primary"
                        disabled={syncingBot}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, var(--notion-purple, #9065B0), var(--notion-blue-hover))', border: 'none', boxShadow: '0 2px 8px rgba(139,92,246,0.3)' }}
                        title="Extrair PDFs não lidos e associar às Ordens de Serviço"
                    >
                        <Bot size={16} className={syncingBot ? 'pulse' : ''} />
                        {syncingBot ? 'Processando...' : 'Robô Alocador de PDFs'}
                    </button>
                    <button 
                        onClick={loadEmails} 
                        className="btn btn-secondary"
                        disabled={loading}
                    >
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                        Atualizar Caixa
                    </button>
                </div>
            </div>
            
            <div className="card-body" style={{ padding: 0 }}>
                {botMessage && (
                    <div style={{ margin: '16px', padding: '12px', background: 'var(--notion-green)', color: 'var(--notion-green)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                        <CheckCircle size={18} />
                        {botMessage}
                    </div>
                )}
                {error && (
                    <div style={{ margin: '16px', padding: '12px', background: 'var(--notion-orange)', color: 'var(--notion-orange)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={16} />
                        {error}
                    </div>
                )}

                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--notion-text-muted)' }}>
                        <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
                        <p>Sincronizando com o Gmail (Marcador: Estampadora)...</p>
                    </div>
                ) : emails.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--notion-text-muted)' }}>
                        <Mail size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                        <p>Nenhuma mensagem encontrada neste marcador.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                        {emails.map((email) => (
                            <div 
                                key={email.id} 
                                onClick={() => handleOpenEmail(email)}
                                style={{ 
                                    padding: '16px', 
                                    borderBottom: '1px solid var(--notion-border)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s',
                                    background: 'var(--bg-secondary)',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--notion-blue)', fontSize: '0.95rem' }}>
                                        {email.from.replace(/<.*>/, '').trim()}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--notion-text-muted)' }}>
                                        {formatDate(email.date)}
                                    </div>
                                </div>
                                <div style={{ fontWeight: 500, color: 'var(--text-color)', fontSize: '0.9rem' }}>
                                    {email.subject}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--notion-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                                    <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-color)' }}>{selectedEmail.from.replace(/<.*>/, '').trim()}</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--notion-text-muted)', marginTop: '4px' }}>{selectedEmail.from.match(/<([^>]+)>/)?.[1] || selectedEmail.from}</div>
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--notion-text-muted)' }}>
                                    {formatDate(selectedEmail.date)}
                                </div>
                            </div>

                            {loadingDetails ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--notion-text-muted)' }}>
                                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
                                    <p>Baixando mensagem do Google...</p>
                                </div>
                            ) : emailDetails ? (
                                <>
                                    <div style={{ 
                                        color: 'var(--text-color)',
                                        whiteSpace: 'pre-wrap', 
                                        fontFamily: 'inherit',
                                        fontSize: '0.95rem',
                                        lineHeight: '1.6',
                                        marginBottom: '32px'
                                    }}>
                                        {emailDetails.body}
                                    </div>

                                    {emailDetails.attachments && emailDetails.attachments.length > 0 && (
                                        <div style={{ marginTop: '24px' }}>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--notion-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Paperclip size={16} /> Anexos ({emailDetails.attachments.length})
                                            </h4>
                                            
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                                {emailDetails.attachments.map((att) => (
                                                    <div key={att.attachmentId} style={{ 
                                                        display: 'flex', alignItems: 'center', gap: '12px', 
                                                        padding: '12px 16px', 
                                                        background: 'var(--bg-secondary)', 
                                                        border: '1px solid var(--notion-border)',
                                                        borderRadius: '8px',
                                                        minWidth: '250px',
                                                        flex: '1 1 auto'
                                                    }}>
                                                        <div style={{ 
                                                            width: '40px', height: '40px', 
                                                            background: 'rgba(56, 189, 248, 0.1)', 
                                                            color: 'var(--notion-blue)',
                                                            borderRadius: '8px',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                        }}>
                                                            <FileIcon mimeType={att.mimeType} />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={att.filename}>{att.filename}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--notion-text-muted)' }}>{(att.size / 1024).toFixed(1)} KB</div>
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

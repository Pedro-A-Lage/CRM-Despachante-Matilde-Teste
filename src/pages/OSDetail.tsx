import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useAuth } from '../contexts/AuthContext';
import {
    ArrowLeft,
    ClipboardCheck,
    Building2,
    Eye,
    Shield,
    FileCheck,
    MessageSquare,
    Send,
    History,
    CheckCircle,
    CreditCard,
    Circle,
    XCircle,
    AlertTriangle,
    Save,
    Plus,
    Calendar,
    Trash2,
    Upload,
    Package,
    UserCheck,
    Edit2,
    X,
    ExternalLink,
    Search,
    FileText,
    Clock,
    RotateCcw,
    User,
    MapPin,
    Copy,
    ChevronDown,
    ChevronUp,
    Car,
    FileSearch
} from 'lucide-react';
import { validarCrlv, ResultadoValidacao, DadosCrlv } from '../lib/documentValidator';
import {
    getOrdem,
    updateOrdem,
    deleteOrdem,
    addAuditEntry,
    getCliente,
    getVeiculo,
    getClientes,
    getVeiculos,
    saveOrdem,
    updateCliente,
    saveVeiculo,
} from '../lib/storage';
import { getCurrentUser } from '../lib/auth';
import { useConfirm } from '../components/ConfirmProvider';
import { DocumentViewer } from '../components/DocumentViewer';
import {
    TIPO_SERVICO_LABELS,
    STATUS_OS_LABELS,
    STATUS_VISTORIA_LABELS,
    CANAIS_COMUNICACAO,
    MENSAGENS_PADRAO,
} from '../types';
import type {
    ChecklistItem,
    StatusChecklist,
    StatusOS,
    StatusVistoria,
    VistoriaHistorico,
    EntradaDelegacia,
    TipoEntradaDelegacia,
    Comunicacao,
    OrdemDeServico,
    StatusPagamento,
    Cliente,
    DocumentoCliente,
    TipoServico,
    TipoCliente,
    Veiculo
} from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import FinancePainel from '../components/finance/FinancePainel';
import { getChargesByOS, getPaymentsByOS } from '../lib/financeService';

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

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

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

function getReceiptStatus(dataAquisicao?: string) {
    if (!dataAquisicao) return null;
    let acquisitionDate: Date;

    // Check if it's in ISO format (from DB)
    if (dataAquisicao.includes('T')) {
        acquisitionDate = new Date(dataAquisicao);
    } else {
        const parts = dataAquisicao.split('/');
        if (parts.length !== 3) return null;
        // Format DD/MM/YYYY
        acquisitionDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - acquisitionDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 30) return { status: 'expired', days: diffDays, label: 'Recibo Vencido!' };
    if (diffDays >= 25) return { status: 'warning', days: diffDays, label: `Atenção: Recibo vence em ${30 - diffDays} dias` };
    return { status: 'ok', days: diffDays, label: `${diffDays} dias decorridos` };
}

const checklistStatusIcon = (status: StatusChecklist) => {
    switch (status) {
        case 'recebido':
            return <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />;
        case 'invalido':
            return <XCircle size={16} style={{ color: 'var(--color-danger)' }} />;
        default:
            return <Circle size={16} style={{ color: 'var(--color-gray-400)' }} />;
    }
};

type TabId = 'checklist' | 'vistoria' | 'delegacia' | 'doc_pronto' | 'entrega' | 'comunicacao' | 'historico' | 'placa' | 'financeiro';

function statusToTab(status?: string): TabId {
    switch (status) {
        case 'vistoria': return 'vistoria';
        case 'delegacia': return 'delegacia';
        case 'doc_pronto':
        case 'entregue': return 'entrega';
        default: return 'checklist';
    }
}

function PlacaTab({ os, veiculo, onRefresh }: { os: OrdemDeServico; veiculo: any; onRefresh: () => void }) {
    const [estampariaEmail, setEstampariaEmail] = useState('itabira@natalplacasgv.com.br');
    const [mensagemCustomizada, setMensagemCustomizada] = useState(
        `Ola,\n\nSegue em anexo a folha do DETRAN para solicitacao do boleto da placa do veiculo:\n\nPlaca: ${veiculo?.placa || '—'}\nChassi: ${veiculo?.chassi || '—'}\nOS: ${os.numero}\n\nPor favor, me envie o boleto para pagamento.\n\nAtenciosamente,\nDespachante Matilde`
    );
    const [sending, setSending] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const handleEmailPlaca = async () => {
        if (!estampariaEmail) {
            setErrorMsg('Por favor, informe o e-mail da estampadora de placa.');
            return;
        }
        if (!os.pdfDetranUrl) {
            setErrorMsg('A OS não possui um PDF do Detran capturado. Capture-o primeiro.');
            return;
        }
        
        localStorage.setItem('matilde_estampariaEmail', estampariaEmail);
        setSending(true);
        setErrorMsg('');
        setSuccessMsg('');

        try {
            const { supabase } = await import('../lib/supabaseClient');
            const { data, error } = await supabase.functions.invoke('send-email-placa', {
                body: {
                    osId: os.id,
                    osNumero: os.numero,
                    pdfUrl: os.pdfDetranUrl,
                    destinatarioEmail: estampariaEmail,
                    veiculoPlaca: veiculo?.placa,
                    veiculoChassi: veiculo?.chassi,
                    mensagemCustomizada
                }
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            setSuccessMsg('E-mail enviado com sucesso para a estamparia!');
            
            // Registra no audit
            const { addAuditEntry } = await import('../lib/storage');
            await addAuditEntry(os.id, 'Placa', `E-mail com PDF da placa enviado para ${estampariaEmail}`);
            onRefresh();
            
        } catch (err: any) {
            console.error('Erro ao enviar e-mail:', err);
            setErrorMsg(err.message || 'Ocorreu um erro desconhecido ao tentar enviar o e-mail.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div style={{ padding: 'var(--space-2)' }}>
            <div className="flex justify-between items-center mb-4">
                <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Troca de Placa</h3>
                {!os.trocaPlaca && (
                    <span className="badge badge-neutral">Esta OS não possui troca de placa</span>
                )}
            </div>

            <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: 'var(--space-5)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-primary)', marginBottom: 8 }}>Solicitar Boleto da Placa</h4>
                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)', marginBottom: 'var(--space-4)' }}>
                            Envie a folha do DETRAN diretamente para o e-mail da estampadora de placa com 1 clique (o sistema salva o e-mail para as próximas vezes).
                        </p>

                        <div className="flex flex-col gap-3">
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--color-gray-400)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                    E-mail da Estampadora de Placa
                                </label>
                                <input 
                                    type="email" 
                                    className="form-input" 
                                    placeholder="estamparia@exemplo.com"
                                    value={estampariaEmail}
                                    onChange={(e) => setEstampariaEmail(e.target.value)}
                                    style={{ fontSize: 13, borderRadius: 8, padding: '8px 12px', maxWidth: 300 }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--color-gray-400)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                    Texto do E-mail (Mensagem)
                                </label>
                                <textarea 
                                    className="form-input" 
                                    value={mensagemCustomizada}
                                    onChange={(e) => setMensagemCustomizada(e.target.value)}
                                    style={{ fontSize: 13, borderRadius: 8, padding: '8px 12px', minHeight: 120, resize: 'vertical' }}
                                />
                                <p style={{ fontSize: 11, color: 'var(--color-gray-500)', marginTop: 4 }}>
                                    O arquivo PDF (.pdf) processado do Detran já vai anexado automaticamente neste envio!
                                </p>
                            </div>

                            <button
                                className="btn btn-primary"
                                style={{ width: 'fit-content', padding: '10px 20px', opacity: sending ? 0.7 : 1, cursor: sending ? 'not-allowed' : 'pointer' }}
                                onClick={handleEmailPlaca}
                                disabled={sending || !os.pdfDetranUrl}
                            >
                                <Send size={16} style={{ marginRight: 8 }} /> 
                                {sending ? 'Enviando...' : 'Enviar Email'}
                            </button>
                            
                            {(() => {
                                const ultimoEnvio = (os.auditLog || [])
                                    .filter(log => log.acao === 'Placa')
                                    .sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime())[0];
                                
                                if (!ultimoEnvio) return null;
                                
                                return (
                                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--color-gray-500)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                                        <span>
                                            Último envio arquivado no histórico: <strong>{new Date(ultimoEnvio.dataHora).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} às {new Date(ultimoEnvio.dataHora).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</strong> por {ultimoEnvio.usuario}
                                        </span>
                                    </div>
                                );
                            })()}

                            {errorMsg && (
                                <div style={{ color: 'var(--color-danger)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                                    <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                                    {errorMsg}
                                </div>
                            )}
                            
                            {successMsg && (
                                <div style={{ color: 'var(--color-success)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                                    <CheckCircle size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                                    {successMsg}
                                </div>
                            )}

                            {!os.pdfDetranUrl && (
                                <div style={{
                                    backgroundColor: 'rgba(239,68,68,0.1)',
                                    borderLeft: '4px solid var(--color-danger)',
                                    padding: '10px',
                                    borderRadius: '4px',
                                    marginTop: 'var(--space-2)'
                                }}>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--color-error-hover)', margin: 0, fontWeight: 600 }}>
                                        ⚠️ <b>Atenção:</b> Você precisa capturar o PDF do DETRAN na delegacia antes de pedir a placa!
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ width: 250, borderLeft: '1px solid var(--border-color)', paddingLeft: 'var(--space-5)' }}>
                        <h5 style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-gray-400)', marginBottom: 12 }}>Documento Necessário</h5>
                        {os.pdfDetranUrl ? (
                            <div style={{ background: 'var(--bg-tertiary)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <FileText size={20} color="var(--color-primary)" />
                                    <div style={{ overflow: 'hidden' }}>
                                        <p style={{ fontSize: '0.7rem', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Folha do Detran</p>
                                        <p style={{ fontSize: '0.6rem', color: 'var(--color-text-tertiary)', margin: 0 }}>PDF Próxima Etapa</p>
                                    </div>
                                </div>
                                <button
                                    className="btn btn-secondary btn-sm w-full"
                                    onClick={() => window.open(os.pdfDetranUrl, '_blank')}
                                >
                                    <Eye size={14} style={{ marginRight: 4 }} /> Ver Arquivo
                                </button>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center' }}>
                                <input
                                    type="file"
                                    accept=".pdf"
                                    id="upload-pdf-detran-deleg"
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        try {
                                            const { uploadFileToSupabase } = await import('../lib/supabaseStorage');
                                            const path = `ordens/${os.id}/pdf_detran_${Date.now()}.pdf`;
                                            const publicUrl = await uploadFileToSupabase(file, path);
                                            await updateOrdem(os.id, { pdfDetranUrl: publicUrl });
                                            await addAuditEntry(os.id, 'PDF Detran Anexado', 'Folha de cadastro do Detran anexada manualmente.');
                                            onRefresh();
                                        } catch (err) {
                                            console.error('Erro ao anexar PDF:', err);
                                            alert('Erro ao anexar PDF. Tente novamente.');
                                        }
                                        e.target.value = '';
                                    }}
                                />
                                <label htmlFor="upload-pdf-detran-deleg" style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                                    padding: 'var(--space-3)', cursor: 'pointer',
                                    border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-tertiary)', transition: 'border-color 0.2s',
                                }}>
                                    <Upload size={20} color="var(--color-primary)" />
                                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Anexar Folha do Detran</span>
                                    <span style={{ fontSize: '0.55rem', color: 'var(--color-gray-500)' }}>Clique para selecionar PDF</span>
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function OSDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [os, setOs] = useState<OrdemDeServico | null>(null);
    const [cliente, setCliente] = useState<any>(null);
    const [veiculo, setVeiculo] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>('checklist');
    const [pageDirty, setPageDirty] = useState(false);
    const { usuario } = useAuth();
    const confirm = useConfirm();

    // ── Estado do visualizador de documentos
    const [viewerUrl, setViewerUrl] = useState<string>('');
    const [viewerTitle, setViewerTitle] = useState<string>('');
    const [viewerOpen, setViewerOpen] = useState(false);

    const openDocumentViewer = (url: string, _title?: string) => {
        window.open(url, '_blank');
    };

    // Avisa o usuário se tentar sair com alterações não salvas
    useUnsavedChanges(pageDirty);

    const handleTabSwitch = async (tab: TabId) => {
        if (pageDirty) {
            const confirmed = await confirm('Você tem alterações não salvas. Deseja trocar de aba sem salvar?');
            if (!confirmed) return;
            setPageDirty(false);
        }
        setActiveTab(tab);
    };

    // ── Estado do modal de Edição da OS
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editClienteId, setEditClienteId] = useState('');
    const [editVeiculoId, setEditVeiculoId] = useState('');
    const [editTipoServico, setEditTipoServico] = useState<TipoServico>('primeiro_emplacamento');
    const [editClientes, setEditClientes] = useState<any[]>([]);
    const [editVeiculos, setEditVeiculos] = useState<any[]>([]);
    const [editSaving, setEditSaving] = useState(false);

    // ── Estado do modal de Edição Completa de Cliente
    const [isFullEditClienteOpen, setIsFullEditClienteOpen] = useState(false);
    const [fullEditCliente, setFullEditCliente] = useState<Partial<Cliente>>({ telefones: [''] });

    // ── Estado do modal de Edição Completa de Veículo
    const [isFullEditVeiculoOpen, setIsFullEditVeiculoOpen] = useState(false);
    const [fullEditVeiculo, setFullEditVeiculo] = useState<Partial<Veiculo>>({});

    const hasLoadedRef = useRef(false);
    const [temDebitosPendentes, setTemDebitosPendentes] = useState(false);
    const [valorPendente, setValorPendente] = useState(0);
    const [refreshKey, setRefreshKey] = useState(0);

    const loadData = useCallback(async () => {
        if (!id) return;
        if (!hasLoadedRef.current) setLoading(true);
        const ordem = await getOrdem(id);
        if (ordem) {
            setOs(ordem);
            const [c, v, payments] = await Promise.all([
                getCliente(ordem.clienteId),
                getVeiculo(ordem.veiculoId),
                getPaymentsByOS(ordem.id),
            ]);
            setCliente(c);
            setVeiculo(v);
            // Bloqueio baseado em recebimentos do cliente (não custos)
            const valorServicoBruto = Number(ordem.valorServico) || 0;
            const desconto = Number(ordem.desconto) || 0;
            const valorServico = Math.max(0, valorServicoBruto - desconto);
            const totalRecebido = payments.reduce((s, p) => s + (p.valor || 0), 0);
            const faltaReceber = Math.max(0, valorServico - totalRecebido);
            setTemDebitosPendentes(faltaReceber > 0 && valorServico > 0);
            setValorPendente(faltaReceber);
            if (!hasLoadedRef.current) {
                setActiveTab(statusToTab(ordem.status));
                hasLoadedRef.current = true;
            }
        }
        setLoading(false);
    }, [id, refreshKey]);

    useEffect(() => { loadData(); }, [loadData]);

    // Realtime: atualiza automaticamente quando pagamentos ou OS mudam (sem F5)
    useEffect(() => {
        if (!id) return;
        const channel = supabase
            .channel(`os-detail-${id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `os_id=eq.${id}` }, () => {
                setRefreshKey(k => k + 1);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_de_servico', filter: `id=eq.${id}` }, () => {
                setRefreshKey(k => k + 1);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_charges', filter: `os_id=eq.${id}` }, () => {
                setRefreshKey(k => k + 1);
            })
            .subscribe();

        // Escuta refresh forçado da extensão (vistoria, confirmar dados, etc.)
        const handleExtensionRefresh = () => setRefreshKey(k => k + 1);
        window.addEventListener('matilde-os-refresh', handleExtensionRefresh);

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('matilde-os-refresh', handleExtensionRefresh);
        };
    }, [id]);

    const refresh = useCallback(() => {
        setRefreshKey(k => k + 1);
    }, []);

    if (loading) return <LoadingSpinner fullPage label="Carregando ordem de serviço..." />;

    if (!os) {
        return (
            <div className="card">
                <div className="empty-state">
                    <AlertTriangle />
                    <h3>Ordem de Serviço não encontrada</h3>
                    <Link to="/ordens" className="btn btn-primary">Voltar</Link>
                </div>
            </div>
        );
    }

    const checklistComplete = os.checklist.every((item) => item.status === 'recebido');
    const needsSifap = os.tipoServico === 'primeiro_emplacamento' || os.trocaPlaca;

    const updateStatus = async (status: StatusOS) => {
        await updateOrdem(os.id, { status });
        await addAuditEntry(os.id, 'Status alterado', `Status → ${STATUS_OS_LABELS[status]}`);
        refresh();
    };

    const addEntradaDelegacia = async (entrada: EntradaDelegacia) => {
        const delegacia = os.delegacia || { entradas: [] };
        delegacia.entradas.push(entrada);
        const newStatus = (os.status === 'doc_pronto' || os.status === 'entregue') ? os.status : 'delegacia';

        await updateOrdem(os.id, {
            delegacia,
            statusDelegacia: entrada.tipo,
            status: newStatus
        });
        await addAuditEntry(os.id, 'Delegacia', `${entrada.tipo === 'entrada' ? 'Entrada' : 'Reentrada'} registrada`);
        refresh();
    };

    const editEntradaDelegacia = async (id: string, updated: Partial<EntradaDelegacia>) => {
        const entradas = (os.delegacia?.entradas || []).map(item =>
            item.id === id ? { ...item, ...updated } : item
        );
        await updateOrdem(os.id, {
            delegacia: os.delegacia ? { ...os.delegacia, entradas } : { entradas },
        });
        await addAuditEntry(os.id, 'Entrada Editada', `Uma entrada da delegacia foi editada`);
        refresh();
    };

    const removeEntradaDelegacia = async (id: string) => {
        const entrada = (os.delegacia?.entradas || []).find(e => e.id === id);
        const canDelete = usuario?.role === 'admin' || (entrada?.responsavel && entrada.responsavel === usuario?.nome);
        if (!canDelete) {
            alert('Você só pode apagar registros que você mesmo criou.');
            return;
        }
        const confirmed = await confirm('Tem certeza que deseja remover esta entrada?');
        if (!confirmed) return;
        const entradas = (os.delegacia?.entradas || []).filter(item => item.id !== id);
        const ultimaEntrada = entradas.length > 0 ? entradas[entradas.length - 1] : undefined;
        const ultimoTipo = ultimaEntrada?.tipo;
        await updateOrdem(os.id, {
            delegacia: os.delegacia ? { ...os.delegacia, entradas } : { entradas },
            statusDelegacia: ultimoTipo
        });
        await addAuditEntry(os.id, 'Entrada Removida', `Uma entrada foi removida da delegacia`);
        refresh();
    };

    const addComunicacao = async (com: Comunicacao) => {
        await updateOrdem(os.id, { comunicacoes: [...os.comunicacoes, com] });
        await addAuditEntry(os.id, 'Comunicação', `Mensagem enviada via ${com.canal}`);
        refresh();
    };

    const handleDelete = async () => {
        const confirmed = await confirm({ title: 'Excluir Ordem de Serviço', message: 'Tem certeza que deseja apagar esta Ordem de Serviço? Esta ação não pode ser desfeita.', danger: true, confirmText: 'Apagar' });
        if (confirmed) {
            await deleteOrdem(os.id);
            navigate('/ordens');
        }
    };


    const handleOpenEditModal = async () => {
        const [cs, vs] = await Promise.all([getClientes(), getVeiculos()]);
        setEditClientes(cs);
        setEditVeiculos(vs);
        setEditClienteId(os.clienteId);
        setEditVeiculoId(os.veiculoId);
        setEditTipoServico(os.tipoServico);
        setEditModalOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editClienteId || !editVeiculoId) {
            alert('Selecione cliente e veículo.');
            return;
        }
        setEditSaving(true);
        try {
            const tipoMudou = editTipoServico !== os.tipoServico;

            // Se tipo de serviço mudou, verificar cobranças existentes
            if (tipoMudou) {
                const { supabase } = await import('../lib/supabaseClient');
                const { data: charges } = await supabase
                    .from('finance_charges')
                    .select('id, status')
                    .eq('os_id', os.id)
                    .neq('status', 'cancelado');

                const temPago = charges?.some(c => c.status === 'pago');

                if (temPago) {
                    const confirmaMudanca = await confirm({
                        title: 'Alterar Tipo de Serviço',
                        message: 'Existem cobranças já PAGAS nesta OS. Ao mudar o tipo de serviço, todas as cobranças serão canceladas e novas serão geradas. Deseja continuar?',
                        danger: true,
                        confirmText: 'Sim, alterar'
                    });
                    if (!confirmaMudanca) {
                        setEditSaving(false);
                        return;
                    }
                }

                // Cancela todas as cobranças existentes
                if (charges && charges.length > 0) {
                    const ids = charges.map(c => c.id);
                    await supabase
                        .from('finance_charges')
                        .update({ status: 'cancelado', atualizado_em: new Date().toISOString() })
                        .in('id', ids);
                }
            }

            await updateOrdem(os.id, {
                clienteId: editClienteId,
                veiculoId: editVeiculoId,
                tipoServico: editTipoServico,
            });

            // Se tipo mudou, gera novas cobranças
            if (tipoMudou) {
                const { gerarCobrancasIniciais } = await import('../lib/financeService');
                await gerarCobrancasIniciais(os.id, editTipoServico, os.tipoVeiculo ?? 'carro', os.trocaPlaca ?? false);
                await addAuditEntry(os.id, 'Tipo de Serviço Alterado', `Serviço alterado de ${os.tipoServico} para ${editTipoServico}. Cobranças recalculadas.`);
            } else {
                await addAuditEntry(os.id, 'OS Editada', `Cliente, Veículo e/ou Tipo de Serviço alterados.`);
            }

            setEditModalOpen(false);
            refresh();
        } finally {
            setEditSaving(false);
        }
    };

    const handleOpenFullEditCliente = () => {
        if (!cliente) return;
        setFullEditCliente({
            ...cliente,
            telefones: cliente.telefones?.length ? cliente.telefones : ['']
        });
        setIsFullEditClienteOpen(true);
    };

    const handleSaveFullEditCliente = async () => {
        if (!cliente?.id) return;
        setEditSaving(true);
        try {
            await updateCliente(cliente.id, {
                ...fullEditCliente,
                telefones: fullEditCliente.telefones?.filter((t: string) => t.trim() !== '') || []
            });
            setIsFullEditClienteOpen(false);
            refresh();
        } finally {
            setEditSaving(false);
        }
    };

    const handleOpenFullEditVeiculo = () => {
        if (!veiculo) return;
        setFullEditVeiculo({ ...veiculo });
        setIsFullEditVeiculoOpen(true);
    };

    const handleSaveFullEditVeiculo = async () => {
        if (!veiculo?.id) return;
        setEditSaving(true);
        try {
            await saveVeiculo({
                ...veiculo,
                ...fullEditVeiculo
            });
            setIsFullEditVeiculoOpen(false);
            refresh();
        } finally {
            setEditSaving(false);
        }
    };

    const tabs = [
        { id: 'checklist' as TabId, label: 'Checklist', icon: <ClipboardCheck size={16} /> },
        { id: 'financeiro' as TabId, label: 'Financeiro', icon: <CreditCard size={16} /> },
        { id: 'vistoria' as TabId, label: 'Vistoria', icon: <Eye size={16} /> },
        { id: 'placa' as TabId, label: 'Placa', icon: <CreditCard size={16} /> },
        { id: 'delegacia' as TabId, label: 'Delegacia', icon: <Shield size={16} /> },
        { id: 'doc_pronto' as TabId, label: 'Doc. Pronto', icon: <FileCheck size={16} /> },
        { id: 'entrega' as TabId, label: 'Entrega', icon: <Package size={16} /> },
        { id: 'comunicacao' as TabId, label: 'Comunicação', icon: <MessageSquare size={16} /> },
        { id: 'historico' as TabId, label: 'Histórico', icon: <History size={16} /> },
    ].filter(t => t.id !== 'placa' || os.trocaPlaca)
;

    return (
        <div>
            {/* Modal de Edição da OS */}
            {editModalOpen && (
                <div className="modal-overlay" style={{ zIndex: 200 }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Editar Ordem de Serviço</h3>
                            <button className="btn btn-ghost" onClick={() => setEditModalOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Cliente</label>
                                <select className="form-select" value={editClienteId} onChange={e => setEditClienteId(e.target.value)}>
                                    <option value="">Selecione...</option>
                                    {editClientes.map(c => (
                                        <option key={c.id} value={c.id}>{c.nome} — {c.cpfCnpj}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Veículo</label>
                                <select className="form-select" value={editVeiculoId} onChange={e => setEditVeiculoId(e.target.value)}>
                                    <option value="">Selecione...</option>
                                    {editVeiculos
                                        .filter(v => !editClienteId || v.clienteId === editClienteId)
                                        .map(v => (
                                            <option key={v.id} value={v.id}>{v.placa || v.chassi} — {v.marcaModelo}</option>
                                        ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Tipo de Serviço</label>
                                <select className="form-select" value={editTipoServico} onChange={e => setEditTipoServico(e.target.value as TipoServico)}>
                                    {Object.entries(TIPO_SERVICO_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setEditModalOpen(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSaveEdit} disabled={editSaving}>
                                <Save size={16} /> {editSaving ? 'Salvando...' : 'Salvar Alterações'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Edição Completa de Cliente */}
            {isFullEditClienteOpen && (
                <div className="modal-overlay" style={{ zIndex: 200 }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Editar Cliente Completo</h3>
                            <button className="btn btn-ghost" onClick={() => setIsFullEditClienteOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                            <div className="form-group">
                                <label className="form-label">Tipo de Cliente</label>
                                <div className="toggle-group">
                                    <button
                                        type="button"
                                        className={`toggle-btn ${fullEditCliente.tipo === 'PF' ? 'active' : ''}`}
                                        onClick={() => setFullEditCliente({ ...fullEditCliente, tipo: 'PF' })}
                                    >Pessoa Física</button>
                                    <button
                                        type="button"
                                        className={`toggle-btn ${fullEditCliente.tipo === 'PJ' ? 'active' : ''}`}
                                        onClick={() => setFullEditCliente({ ...fullEditCliente, tipo: 'PJ' })}
                                    >Pessoa Jurídica</button>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">{fullEditCliente.tipo === 'PF' ? 'Nome Completo' : 'Razão Social'} *</label>
                                <input type="text" className="form-input" value={fullEditCliente.nome || ''} onChange={e => setFullEditCliente({ ...fullEditCliente, nome: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{fullEditCliente.tipo === 'PF' ? 'CPF' : 'CNPJ'} *</label>
                                <input type="text" className="form-input" value={fullEditCliente.cpfCnpj || ''} onChange={(e) => {
                                    const raw = e.target.value;
                                    const detectedTipo = detectTipo(raw);
                                    const formatted = detectedTipo === 'PF' ? formatCPF(raw) : formatCNPJ(raw);
                                    setFullEditCliente({ ...fullEditCliente, cpfCnpj: formatted, tipo: detectedTipo });
                                }} required maxLength={fullEditCliente.tipo === 'PF' ? 14 : 18} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Telefone(s)</label>
                                {fullEditCliente.telefones?.map((tel, idx) => (
                                    <div key={idx} className="flex gap-2 mb-2">
                                        <input type="text" className="form-input" value={tel} onChange={(e) => {
                                            const updated = [...(fullEditCliente.telefones || [])];
                                            updated[idx] = formatPhone(e.target.value);
                                            setFullEditCliente({ ...fullEditCliente, telefones: updated });
                                        }} maxLength={15} />
                                        {(fullEditCliente.telefones?.length || 0) > 1 && (
                                            <button type="button" className="btn btn-ghost" onClick={() => {
                                                const updated = fullEditCliente.telefones?.filter((_, i) => i !== idx);
                                                setFullEditCliente({ ...fullEditCliente, telefones: updated });
                                            }}><X size={16} /></button>
                                        )}
                                    </div>
                                ))}
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                                    setFullEditCliente({ ...fullEditCliente, telefones: [...(fullEditCliente.telefones || []), ''] });
                                }}><Plus size={14} /> Adicionar telefone</button>
                            </div>
                            <div className="form-group">
                                <label className="form-label">E-mail</label>
                                <input type="email" className="form-input" value={fullEditCliente.email || ''} onChange={e => setFullEditCliente({ ...fullEditCliente, email: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Observações</label>
                                <textarea className="form-textarea" value={fullEditCliente.observacoes || ''} onChange={e => setFullEditCliente({ ...fullEditCliente, observacoes: e.target.value })} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setIsFullEditClienteOpen(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSaveFullEditCliente} disabled={editSaving}>
                                <Save size={16} /> {editSaving ? 'Salvando...' : 'Salvar Cliente'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Edição Completa de Veículo */}
            {isFullEditVeiculoOpen && (
                <div className="modal-overlay" style={{ zIndex: 200 }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Editar Veículo Completo</h3>
                            <button className="btn btn-ghost" onClick={() => setIsFullEditVeiculoOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Placa</label>
                                    <input type="text" className="form-input" value={fullEditVeiculo.placa || ''} onChange={e => setFullEditVeiculo({ ...fullEditVeiculo, placa: e.target.value.toUpperCase() })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Renavam</label>
                                    <input type="text" className="form-input" value={fullEditVeiculo.renavam || ''} onChange={e => setFullEditVeiculo({ ...fullEditVeiculo, renavam: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Chassi *</label>
                                <input type="text" className="form-input" value={fullEditVeiculo.chassi || ''} onChange={e => setFullEditVeiculo({ ...fullEditVeiculo, chassi: e.target.value.toUpperCase() })} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Marca / Modelo</label>
                                <input type="text" className="form-input" value={fullEditVeiculo.marcaModelo || ''} onChange={e => setFullEditVeiculo({ ...fullEditVeiculo, marcaModelo: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Data do Recibo (Aquisição)</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={fullEditVeiculo.dataAquisicao ? (fullEditVeiculo.dataAquisicao.includes('T') ? fullEditVeiculo.dataAquisicao.split('T')[0] : fullEditVeiculo.dataAquisicao) : ''}
                                    onChange={e => setFullEditVeiculo({ ...fullEditVeiculo, dataAquisicao: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Observações</label>
                                <textarea className="form-textarea" value={fullEditVeiculo.observacoes || ''} onChange={e => setFullEditVeiculo({ ...fullEditVeiculo, observacoes: e.target.value })} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setIsFullEditVeiculoOpen(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSaveFullEditVeiculo} disabled={editSaving}>
                                <Save size={16} /> {editSaving ? 'Salvando...' : 'Salvar Veículo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== HEADER REDESENHADO ===== */}
            <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: 14, padding: '20px 24px', marginBottom: 16,
                borderLeft: os.prioridade === 'critica' ? '5px solid #EF4444' : os.prioridade === 'urgente' ? '5px solid #F59E0B' : '5px solid var(--border-color)',
            }}>
                {/* Linha 1: Voltar + OS + Prioridade + Ações */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <button onClick={() => navigate(-1)} style={{
                            background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                            borderRadius: 10, padding: 8, cursor: 'pointer', color: 'var(--color-text-secondary)',
                            display: 'flex', alignItems: 'center', transition: 'all 0.2s',
                        }}>
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 850, color: 'var(--color-primary)', letterSpacing: '-0.5px' }}>
                                    OS #{os.numero}
                                </h1>
                                <select
                                    value={os.prioridade || 'normal'}
                                    onChange={async (e) => {
                                        const val = e.target.value as 'normal' | 'urgente' | 'critica';
                                        await updateOrdem(os.id, { prioridade: val });
                                        await addAuditEntry(os.id, 'Prioridade', `Prioridade alterada para: ${val}`);
                                        refresh();
                                    }}
                                    style={{
                                        padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800,
                                        border: 'none', cursor: 'pointer', fontFamily: 'var(--font-family)',
                                        textTransform: 'uppercase', letterSpacing: '0.5px',
                                        background: os.prioridade === 'critica' ? 'rgba(239,68,68,0.15)' : os.prioridade === 'urgente' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.1)',
                                        color: os.prioridade === 'critica' ? 'var(--color-danger)' : os.prioridade === 'urgente' ? 'var(--color-warning)' : 'var(--color-info)',
                                    }}
                                >
                                    <option value="normal">Baixa Prioridade</option>
                                    <option value="urgente">Urgente</option>
                                    <option value="critica">Crítica</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.02em' }}>
                                    {TIPO_SERVICO_LABELS[os.tipoServico]}
                                </span>
                                {veiculo && (
                                    <>
                                        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>·</span>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)' }}>
                                            {veiculo.placa || 'Sem placa'}
                                        </span>
                                        <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
                                            {veiculo.marcaModelo}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ position: 'relative' }}>
                            <select
                                className="form-select"
                                style={{
                                    width: 190, fontSize: 13, padding: '8px 12px', borderRadius: 10,
                                    fontWeight: 750, fontFamily: 'var(--font-family)', textTransform: 'uppercase',
                                    background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                                    appearance: 'none', cursor: 'pointer', transition: 'all 0.2s',
                                }}
                                value={os.status}
                                onChange={(e) => updateStatus(e.target.value as StatusOS)}
                            >
                                {Object.entries(STATUS_OS_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-tertiary)' }} />
                        </div>

                        <div style={{ height: 24, width: 1, background: 'var(--border-color)', margin: '0 4px' }} />

                        <button onClick={handleOpenEditModal} title="Editar OS"
                            style={{
                                width: 38, height: 38, borderRadius: 10, border: '1px solid var(--border-color)',
                                background: 'var(--bg-body)', cursor: 'pointer', color: 'var(--color-text-secondary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                            }}>
                            <Edit2 size={16} />
                        </button>
                        <button onClick={handleDelete} title="Apagar OS"
                            style={{
                                width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)',
                                background: 'rgba(239,68,68,0.06)', cursor: 'pointer', color: 'var(--color-danger)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                            }}>
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>

                {/* Linha 2: Grid de Cartões de Informação */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                    {/* CLIENTE CARD */}
                    <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <User size={12} style={{ color: 'var(--color-primary)' }} />
                                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-tertiary)' }}>
                                    Cliente
                                </span>
                            </div>
                            <button onClick={handleOpenFullEditCliente} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', opacity: 0.7 }}>
                                <Edit2 size={12} />
                            </button>
                        </div>
                        {cliente ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Link to={`/clientes/${cliente.id}`} style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-text-primary)', textDecoration: 'none' }}>
                                    {cliente.nome}
                                </Link>
                                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{cliente.cpfCnpj}</span>
                                {cliente.telefones && cliente.telefones.length > 0 && cliente.telefones[0] ? (
                                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {cliente.telefones.filter((t: string) => t.trim()).join(' | ')}
                                    </span>
                                ) : (
                                    <span style={{ fontSize: 10, color: 'var(--color-warning)', fontWeight: 600, fontStyle: 'italic' }}>
                                        Telefone não cadastrado
                                    </span>
                                )}
                            </div>
                        ) : (
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-tertiary)' }}>—</span>
                        )}
                    </div>

                    {/* VEÍCULO CARD */}
                    <div style={{ 
                        background: 'var(--bg-body)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '14px 16px',
                        borderBottom: os.trocaPlaca ? '3px solid var(--color-primary)' : '1px solid var(--border-color)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Car size={12} style={{ color: 'var(--color-primary)' }} />
                                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-tertiary)' }}>
                                    Veículo
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: os.tipoServico === 'primeiro_emplacamento' ? 'default' : 'pointer', opacity: os.tipoServico === 'primeiro_emplacamento' ? 0.7 : 1 }}
                                    onClick={async () => {
                                        if (os.tipoServico === 'primeiro_emplacamento') return; // Sempre troca placa
                                        const newVal = !os.trocaPlaca;
                                        await updateOrdem(os.id, { trocaPlaca: newVal });
                                        if (!newVal && activeTab === 'placa') setActiveTab('checklist');
                                        refresh();
                                    }}
                                    title={os.tipoServico === 'primeiro_emplacamento' ? "Primeiro emplacamento sempre requer placa" : os.trocaPlaca ? "Clique para manter placa" : "Clique para trocar placa"}
                                >
                                    <span style={{ fontSize: 9, fontWeight: 800, color: os.trocaPlaca ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}>
                                        {os.trocaPlaca ? 'TROCA' : 'MANTER'}
                                    </span>
                                    <div style={{ width: 22, height: 11, borderRadius: 6, backgroundColor: os.trocaPlaca ? 'var(--color-primary)' : '#444', position: 'relative' }}>
                                        <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--color-white)', position: 'absolute', top: 2, left: os.trocaPlaca ? 13 : 2, transition: 'left 0.2s' }} />
                                    </div>
                                </div>
                                <button onClick={handleOpenFullEditVeiculo} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', opacity: 0.7 }}>
                                    <Edit2 size={12} />
                                </button>
                            </div>
                        </div>
                        {veiculo ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Link to={`/veiculos/${veiculo.id}/editar`} style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-primary)', textDecoration: 'none' }}>
                                    {veiculo.placa || 'Sem placa'}
                                </Link>
                                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{veiculo.marcaModelo}</span>
                            </div>
                        ) : (
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-tertiary)' }}>Sem Veículo</span>
                        )}
                    </div>

                    {/* RECIBO CARD */}
                    <div style={{ 
                        background: 'var(--bg-body)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '14px 16px',
                        cursor: 'pointer'
                    }} onClick={handleOpenFullEditVeiculo}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <FileText size={12} style={{ color: 'var(--color-primary)' }} />
                            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-tertiary)' }}>
                                Recibo
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-text-primary)' }}>
                                {veiculo?.dataAquisicao
                                    ? (veiculo.dataAquisicao.includes('T')
                                        ? new Date(veiculo.dataAquisicao).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                                        : veiculo.dataAquisicao.split('-').reverse().join('/'))
                                    : '—'}
                            </span>
                            {(() => {
                                const recStatus = getReceiptStatus(veiculo?.dataAquisicao);
                                if (!recStatus) return null;
                                return (
                                    <span style={{
                                        fontSize: 10, fontWeight: 800,
                                        color: recStatus.status === 'expired' ? 'var(--color-danger)' : recStatus.status === 'warning' ? 'var(--color-warning)' : 'var(--color-success)',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                        {recStatus.status !== 'ok' && <AlertTriangle size={10} />}
                                        {recStatus.label}
                                    </span>
                                );
                            })()}
                        </div>
                    </div>

                    {/* DATAS CARD */}
                    <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <Calendar size={12} style={{ color: 'var(--color-primary)' }} />
                            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-tertiary)' }}>
                                Cronograma
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>Abertura:</span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                                    {new Date(os.dataAbertura).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                </span>
                            </div>
                            {os.docProntoEm && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 600 }}>Pronto:</span>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-success)' }}>
                                        {new Date(os.docProntoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                    </span>
                                </div>
                            )}
                            {os.entregueEm ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, color: 'var(--color-info)', fontWeight: 600 }}>Entrega:</span>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-info)' }}>
                                        {new Date(os.entregueEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                    </span>
                                </div>
                            ) : (
                                os.pdfDetranUrl || veiculo?.pastaSupabasePath || veiculo?.cadastroDriveId ? (
                                    <button
                                        onClick={() => window.open(os.pdfDetranUrl || veiculo?.pastaSupabasePath || veiculo?.cadastroDriveId || '', '_blank')}
                                        style={{
                                            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)',
                                            borderRadius: 6, padding: '2px 8px', marginTop: 4, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%'
                                        }}
                                    >
                                        <FileText size={10} style={{ color: 'var(--color-primary)' }} />
                                        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase' }}>Detran PDF</span>
                                    </button>
                                ) : (
                                    <>
                                        <input
                                            type="file"
                                            accept=".pdf"
                                            id="upload-pdf-detran-crono"
                                            style={{ display: 'none' }}
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                try {
                                                    const { uploadFileToSupabase } = await import('../lib/supabaseStorage');
                                                    const path = `ordens/${os.id}/pdf_detran_${Date.now()}.pdf`;
                                                    const publicUrl = await uploadFileToSupabase(file, path);
                                                    await updateOrdem(os.id, { pdfDetranUrl: publicUrl });
                                                    await addAuditEntry(os.id, 'PDF Detran Anexado', 'Folha de cadastro do Detran anexada manualmente.');
                                                    refresh();
                                                } catch (err) {
                                                    console.error('Erro ao anexar PDF:', err);
                                                }
                                                e.target.value = '';
                                            }}
                                        />
                                        <label htmlFor="upload-pdf-detran-crono" style={{
                                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
                                            borderRadius: 6, padding: '2px 8px', marginTop: 4, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%'
                                        }}>
                                            <Upload size={10} style={{ color: 'var(--color-danger)' }} />
                                            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--color-danger)', textTransform: 'uppercase' }}>Anexar PDF</span>
                                        </label>
                                    </>
                                )
                            )}
                        </div>
                    </div>
                </div>
            </div>



            {/* ===== CONFERÊNCIA DE DADOS ===== */}
            <ConferenciaDados os={os} cliente={cliente} veiculo={veiculo} />

            {/* Alerta de débitos removido — indicação sutil via tab Financeiro em vermelho */}

            {/* ===== BARRA DE OBSERVAÇÃO / PENDÊNCIA ===== */}
            <ObservacaoPendenciaBar os={os} onRefresh={refresh} />


            {/* Tabs */}
            <div className="tabs">
                {tabs.map((tab) => {
                    const isFinanceiroComDebito = tab.id === 'financeiro' && temDebitosPendentes;
                    return (
                        <button
                            key={tab.id}
                            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => handleTabSwitch(tab.id)}
                            style={isFinanceiroComDebito ? { color: '#EF4444', fontWeight: 700 } : undefined}
                        >
                            {tab.icon}
                            {tab.label}
                            {isFinanceiroComDebito && (
                                <span style={{ fontSize: 9, marginLeft: 4, background: 'rgba(239,68,68,0.15)', color: '#EF4444', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>
                                    Pendente
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="card">
                {activeTab === 'checklist' && (
                    <ChecklistTab os={os} cliente={cliente} onRefresh={refresh} checklistComplete={checklistComplete} onDirtyChange={setPageDirty} onOpenViewer={openDocumentViewer} />
                )}
                {activeTab === 'vistoria' && (
                    <VistoriaTab os={os} onRefresh={refresh} daePaga={checklistComplete} veiculo={veiculo} cliente={cliente} onDirtyChange={setPageDirty} onOpenViewer={openDocumentViewer} />
                )}
                {activeTab === 'delegacia' && (
                    <DelegaciaTab os={os} veiculo={veiculo} onAdd={addEntradaDelegacia} onEdit={editEntradaDelegacia} onRemove={removeEntradaDelegacia} needsSifap={needsSifap} onRefresh={refresh} />
                )}
                {activeTab === 'doc_pronto' && (
                    <DocProntoTab os={os} onRefresh={refresh} onOpenViewer={openDocumentViewer} bloqueadoPorDebito={temDebitosPendentes} valorPendente={valorPendente} />
                )}
                {activeTab === 'entrega' && (
                    <EntregaTab os={os} onRefresh={refresh} onOpenViewer={openDocumentViewer} bloqueadoPorDebito={temDebitosPendentes} valorPendente={valorPendente} />
                )}
                {activeTab === 'comunicacao' && (
                    <ComunicacaoTab os={os} onAdd={addComunicacao} onRemove={async (id) => {
                        const comm = os.comunicacoes.find(c => c.id === id);
                        const canDelete = usuario?.role === 'admin' || (comm?.usuario && comm.usuario === usuario?.nome);
                        if (!canDelete) {
                            alert('Você só pode apagar registros que você mesmo criou.');
                            return;
                        }
                        const confirmed = await confirm('Apagar este registro de comunicação?');
                        if (confirmed) {
                            const filtrado = os.comunicacoes.filter((c) => c.id !== id);
                            await updateOrdem(os.id, { comunicacoes: filtrado });
                            await addAuditEntry(os.id, 'Comunicação Removida', 'Um registro de comunicação foi apagado');
                            refresh();
                        }
                    }} />
                )}
                {activeTab === 'placa' && (
                    <PlacaTab os={os} veiculo={veiculo} onRefresh={refresh} />
                )}
                {activeTab === 'historico' && (
                    <HistoricoTab os={os} />
                )}
                {activeTab === 'financeiro' && (
                    <FinancePainel
                        osId={os.id}
                        valorServico={os.valorServico ?? 0}
                        trocaPlaca={os.trocaPlaca ?? false}
                        tipoVeiculo={os.tipoVeiculo ?? 'carro'}
                        tipoServico={os.tipoServico}
                        userRole={usuario?.role ?? 'funcionario'}
                        onValorServicoChange={async (novoValor) => {
                            await saveOrdem({ id: os.id, clienteId: os.clienteId, veiculoId: os.veiculoId, tipoServico: os.tipoServico, valorServico: novoValor });
                            setOs({ ...os, valorServico: novoValor });
                        }}
                        onPaymentChange={() => refresh()}
                    />
                )}
                {/* Document Viewer Modal */}
                <DocumentViewer
                    url={viewerUrl}
                    fileName={viewerTitle}
                    isOpen={viewerOpen}
                    onClose={() => setViewerOpen(false)}
                />
            </div>
        </div>
    );
}


// ===== CONFERÊNCIA DE DADOS =====
function ConferenciaDados({ os, cliente, veiculo }: { os: OrdemDeServico; cliente: Cliente | null; veiculo: Veiculo | null }) {
    const problemas: { tipo: 'erro' | 'aviso'; campo: string; msg: string }[] = [];

    if (!cliente) {
        problemas.push({ tipo: 'erro', campo: 'Cliente', msg: 'Cliente não encontrado' });
    } else {
        if (!cliente.nome || cliente.nome.trim().length < 3) {
            problemas.push({ tipo: 'erro', campo: 'Cliente', msg: 'Nome do cliente incompleto' });
        }
        if (!cliente.cpfCnpj || cliente.cpfCnpj.replace(/\D/g, '').length < 11) {
            problemas.push({ tipo: 'erro', campo: 'Cliente', msg: 'CPF/CNPJ do cliente inválido ou ausente' });
        }
        // Telefone é exibido diretamente no card do Cliente (não é mais validação)
    }

    if (!veiculo) {
        problemas.push({ tipo: 'erro', campo: 'Veículo', msg: 'Veículo não encontrado' });
    } else {
        if (!veiculo.placa || veiculo.placa.trim() === '') {
            if (os.tipoServico !== 'primeiro_emplacamento') {
                problemas.push({ tipo: 'aviso', campo: 'Veículo', msg: 'Placa não informada' });
            }
        }
        if (!veiculo.renavam || veiculo.renavam.trim() === '') {
            if (os.tipoServico !== 'primeiro_emplacamento') {
                problemas.push({ tipo: 'erro', campo: 'Veículo', msg: 'Renavam não informado' });
            }
        }
        if (!veiculo.chassi || veiculo.chassi.trim() === '') {
            problemas.push({ tipo: 'erro', campo: 'Veículo', msg: 'Chassi não informado' });
        }
        if (!veiculo.marcaModelo || veiculo.marcaModelo.trim() === '') {
            problemas.push({ tipo: 'aviso', campo: 'Veículo', msg: 'Marca/Modelo não informado' });
        }
        if (os.tipoServico === 'transferencia') {
            if (!veiculo.dataAquisicao) {
                problemas.push({ tipo: 'erro', campo: 'Recibo', msg: 'Data do recibo de compra/venda não informada' });
            } else {
                // Recibo vencido é exibido apenas no card de Recibo (não como pendência)
            }
        }
    }

    if (!os.tipoServico) {
        problemas.push({ tipo: 'erro', campo: 'Serviço', msg: 'Tipo de serviço não definido' });
    }

    if (problemas.length === 0) return null;

    const erros = problemas.filter(p => p.tipo === 'erro');
    const avisos = problemas.filter(p => p.tipo === 'aviso');
    const isError = erros.length > 0;

    return (
        <div style={{
            background: isError ? 'rgba(239, 68, 68, 0.04)' : 'rgba(245, 158, 11, 0.04)',
            border: '1px solid var(--border-color)',
            borderLeft: `4px solid ${isError ? 'var(--color-danger)' : 'var(--color-warning)'}`,
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: isError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <AlertTriangle size={18} style={{ color: isError ? 'var(--color-danger)' : 'var(--color-warning)' }} />
                </div>
                <div>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                        Conferência de Dados
                    </h4>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: isError ? 'var(--color-danger)' : 'var(--color-warning)', opacity: 0.9 }}>
                        {erros.length > 0 && `${erros.length} problema${erros.length > 1 ? 's' : ''} crítico${erros.length > 1 ? 's' : ''}`}
                        {erros.length > 0 && avisos.length > 0 && ' • '}
                        {avisos.length > 0 && `${avisos.length} aviso${avisos.length > 1 ? 's' : ''} de atenção`}
                    </p>
                </div>
            </div>

            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
                gap: '8px 24px',
                paddingTop: '4px'
            }}>
                {problemas.map((p, i) => (
                    <div key={i} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 10,
                        padding: '6px 0'
                    }}>
                        <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: p.tipo === 'erro' ? 'var(--color-danger)' : 'var(--color-warning)',
                            boxShadow: `0 0 6px ${p.tipo === 'erro' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`
                        }} />
                        <span style={{ 
                            fontSize: 10, fontWeight: 800, color: 'var(--color-text-tertiary)',
                            textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '60px'
                        }}>
                            {p.campo}
                        </span>
                        <span style={{ 
                            fontSize: 12, fontWeight: 600, 
                            color: p.tipo === 'erro' ? 'var(--color-danger)' : 'var(--color-warning)',
                            lineHeight: 1.2
                        }}>
                            {p.msg}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}


// ===== OBSERVAÇÃO + PENDÊNCIA BAR =====
function ObservacaoPendenciaBar({ os, onRefresh }: { os: OrdemDeServico; onRefresh: () => void }) {
    const [obs, setObs] = useState(os.observacaoGeral || '');
    const [pend, setPend] = useState(os.pendencia || '');
    const [obsSaving, setObsSaving] = useState(false);
    const [pendSaving, setPendSaving] = useState(false);
    const [pendEditing, setPendEditing] = useState(false);
    const [confirmingResolve, setConfirmingResolve] = useState(false);
    const pendInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setObs(os.observacaoGeral || ''); }, [os.observacaoGeral]);
    useEffect(() => { setPend(os.pendencia || ''); setPendEditing(false); setConfirmingResolve(false); }, [os.pendencia]);

    const saveObs = async () => {
        if (obs === (os.observacaoGeral || '')) return;
        setObsSaving(true);
        await updateOrdem(os.id, { observacaoGeral: obs.trim() || null as any });
        await addAuditEntry(os.id, 'Observação', obs.trim() ? `Observação: ${obs.trim()}` : 'Observação removida');
        setObsSaving(false);
        onRefresh();
    };

    const savePend = async () => {
        if (pend === (os.pendencia || '')) return;
        setPendSaving(true);
        await updateOrdem(os.id, { pendencia: pend.trim() || null as any });
        await addAuditEntry(os.id, 'Pendência', pend.trim() ? `Pendência: ${pend.trim()}` : 'Pendência resolvida');
        setPendSaving(false);
        setPendEditing(false);
        onRefresh();
    };

    const resolvePend = async () => {
        setPendSaving(true);
        setPend('');
        await updateOrdem(os.id, { pendencia: null as any });
        await addAuditEntry(os.id, 'Pendência', 'Pendência resolvida');
        setPendSaving(false);
        setConfirmingResolve(false);
        setPendEditing(false);
        onRefresh();
    };

    const startEditing = () => {
        setPendEditing(true);
        setConfirmingResolve(false);
        setTimeout(() => pendInputRef.current?.focus(), 50);
    };

    const cancelEditing = () => {
        setPend(os.pendencia || '');
        setPendEditing(false);
    };

    const obsChanged = obs !== (os.observacaoGeral || '');
    const pendChanged = pend !== (os.pendencia || '');
    const hasPend = !!(os.pendencia);

    const cardStyle = (baseColor: string, isChanged: boolean): React.CSSProperties => ({
        background: 'var(--bg-card)',
        borderRadius: '12px',
        border: `1px solid ${isChanged ? baseColor : 'var(--border-color)'}`,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        transition: 'all 0.2s ease',
        boxShadow: isChanged ? `0 0 0 2px ${baseColor}22` : 'none',
    });

    const iconBoxStyle = (bgColor: string, iconColor: string): React.CSSProperties => ({
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: bgColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    });

    const btnStyle = (bg: string, color: string, border?: string): React.CSSProperties => ({
        padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
        background: bg, color: color,
        border: border || 'none',
        fontSize: 11, fontWeight: 800,
        display: 'flex', alignItems: 'center', gap: 5,
        whiteSpace: 'nowrap',
    });

    return (
        <div className="os-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Observação Geral */}
            <div style={cardStyle('var(--color-primary)', obsChanged)}>
                <div style={iconBoxStyle('rgba(59,130,246,0.1)', 'var(--color-info)')}>
                    <Edit2 size={16} color="var(--color-info)" strokeWidth={2.5} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <label style={{
                        fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: 'var(--color-text-tertiary)'
                    }}>
                        Observação Geral
                    </label>
                    <input
                        type="text"
                        value={obs}
                        placeholder="Adicionar nota interna..."
                        onChange={(e) => setObs(e.target.value)}
                        onBlur={saveObs}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        style={{
                            background: 'transparent', border: 'none', outline: 'none',
                            fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)',
                            padding: 0, width: '100%',
                        }}
                    />
                </div>
                {obsChanged && (
                    <button onClick={saveObs} disabled={obsSaving}
                        style={btnStyle('var(--color-primary)', '#000')}>
                        {obsSaving ? '...' : 'Salvar'}
                    </button>
                )}
            </div>

            {/* Pendência / Impedimento */}
            <div style={cardStyle('#EF4444', pendEditing || confirmingResolve)}>
                <div style={iconBoxStyle(hasPend ? 'rgba(239,68,68,0.12)' : 'rgba(107,114,128,0.1)', hasPend ? '#EF4444' : '#6B7280')}>
                    <AlertTriangle size={16} color={hasPend ? '#EF4444' : '#6B7280'} strokeWidth={2.5} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <label style={{
                        fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: hasPend ? '#EF4444' : 'var(--color-text-tertiary)'
                    }}>
                        Pendência / Impedimento
                    </label>

                    {/* Modo leitura: mostra texto + botões Editar / Resolvida */}
                    {hasPend && !pendEditing && !confirmingResolve && (
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#EF4444' }}>
                            {os.pendencia}
                        </span>
                    )}

                    {/* Modo edição: input editável */}
                    {(pendEditing || !hasPend) && (
                        <input
                            ref={pendInputRef}
                            type="text"
                            value={pend}
                            placeholder="Ex: falta documento, aguardando cliente..."
                            onChange={(e) => setPend(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') savePend();
                                if (e.key === 'Escape') cancelEditing();
                            }}
                            style={{
                                background: 'transparent', border: 'none', outline: 'none',
                                fontSize: 14, fontWeight: 700,
                                color: pend ? '#EF4444' : 'var(--color-text-primary)',
                                padding: 0, width: '100%',
                            }}
                        />
                    )}

                    {/* Confirmação de resolução */}
                    {confirmingResolve && (
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                            Confirmar que a pendência foi resolvida?
                        </span>
                    )}
                </div>

                {/* Botões modo leitura: Editar + Resolvida */}
                {hasPend && !pendEditing && !confirmingResolve && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={startEditing} title="Editar pendência"
                            style={btnStyle('rgba(59,130,246,0.1)', '#3B82F6', '1px solid rgba(59,130,246,0.3)')}>
                            <Edit2 size={12} /> Editar
                        </button>
                        <button onClick={() => setConfirmingResolve(true)} title="Resolver pendência"
                            style={btnStyle('rgba(16,185,129,0.1)', '#10B981', '1px solid rgba(16,185,129,0.3)')}>
                            <CheckCircle size={12} /> Resolvida
                        </button>
                    </div>
                )}

                {/* Botões modo edição: Salvar + Cancelar */}
                {pendEditing && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={savePend} disabled={pendSaving || !pendChanged}
                            style={btnStyle(pendChanged ? '#EF4444' : '#555', '#fff')}>
                            {pendSaving ? '...' : 'Salvar'}
                        </button>
                        <button onClick={cancelEditing}
                            style={btnStyle('transparent', 'var(--color-text-secondary)', '1px solid var(--border-color)')}>
                            Cancelar
                        </button>
                    </div>
                )}

                {/* Botões confirmação resolução: Confirmar + Cancelar */}
                {confirmingResolve && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={resolvePend} disabled={pendSaving}
                            style={btnStyle('#10B981', '#fff')}>
                            <CheckCircle size={12} /> {pendSaving ? '...' : 'Confirmar'}
                        </button>
                        <button onClick={() => setConfirmingResolve(false)}
                            style={btnStyle('transparent', 'var(--color-text-secondary)', '1px solid var(--border-color)')}>
                            Cancelar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ===== CHECKLIST TAB (with Save button) =====
// ---- Checklist inline primitives (outside component to avoid re-mount) ----
const CKColCard = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={{
        background: 'var(--bg-card, var(--bg-surface))',
        border: '1px solid var(--border-color)',
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...style,
    }}>
        {children}
    </div>
);

const CKColHeader = ({ label, right }: { label: string; right?: React.ReactNode }) => (
    <div style={{
        padding: '13px 18px 11px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        background: 'rgba(128,128,128,0.03)',
    }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.09em', opacity: 0.85 }}>
            {label}
        </span>
        {right}
    </div>
);

function ChecklistTab({ os, cliente: clienteProp, onRefresh, checklistComplete, onDirtyChange, onOpenViewer }: {
    os: OrdemDeServico;
    cliente: Cliente | null;
    onRefresh: () => void;
    checklistComplete: boolean;
    onDirtyChange?: (dirty: boolean) => void;
    onOpenViewer: (url: string, title: string) => void;
}) {
    const confirm = useConfirm();
    const [localChecklist, setLocalChecklist] = useState<ChecklistItem[]>(() => [...(os.checklist || [])]);
    const [observacoesGlobais, setObservacoesGlobais] = useState(os.checklistObservacoes || '');
    const [novoDocNome, setNovoDocNome] = useState('');
    const [dirty, setDirty] = useState(false);
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const cliente = clienteProp;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeUploadItemId, setActiveUploadItemId] = useState<string | null>(null);

    // Documentos pessoais do cliente (filtra docs de veículo como RECIBO, Nota Fiscal, etc.)
    const DOCS_PESSOAIS_FILTER = ['CNH', 'RG', 'CPF', 'CNPJ', 'IDENTIDADE', 'CONTRATO SOCIAL', 'PROCURA', 'COMPROVANTE'];
    const docsCliente = (cliente?.documentos || []).filter(d => {
        const tipoUpper = (d.tipo || d.nome || '').toUpperCase();
        return DOCS_PESSOAIS_FILTER.some(dp => tipoUpper.includes(dp));
    });

    // Repassa dirty state pro pai
    const markDirty = (val: boolean) => {
        setDirty(val);
        onDirtyChange?.(val);
    };

    // Encontra doc do cliente que bate com item do checklist (declarado antes do useEffect)
    // "Doc Responsável" do cliente equivale a "CNH Responsável pela Empresa" do checklist
    const matchDocCliente = (itemNome: string) => {
        const nome = itemNome.toUpperCase();
        return docsCliente.find(d => {
            const tipo = d.tipo.toUpperCase();
            const dNome = d.nome.toUpperCase();
            // CNH genérica
            if (nome.includes('CNH') && !nome.includes('RESPONS') && (tipo.includes('CNH') || dNome.includes('CNH')) && !tipo.includes('RESPONS') && !dNome.includes('RESPONS')) return true;
            // CNH Responsável pela Empresa ↔ Doc Responsável
            if ((nome.includes('CNH') && nome.includes('RESPONS')) || nome.includes('DOC RESPONS')) {
                if (tipo.includes('RESPONS') || dNome.includes('RESPONS') || tipo.includes('DOC RESP') || dNome.includes('DOC RESP')) return true;
                if ((tipo.includes('CNH') && tipo.includes('RESPONS')) || (dNome.includes('CNH') && dNome.includes('RESPONS'))) return true;
            }
            if ((nome === 'RG' || nome.includes('IDENTIDADE')) && (tipo.includes('RG') || dNome.includes('RG') || tipo.includes('IDENTIDADE'))) return true;
            if (nome === 'CPF' && (tipo.includes('CPF') || dNome.includes('CPF'))) return true;
            if (nome.includes('CNPJ') && (tipo.includes('CNPJ') || dNome.includes('CNPJ'))) return true;
            if (nome.includes('CONTRATO') && (tipo.includes('CONTRATO') || dNome.includes('CONTRATO'))) return true;
            if (nome.includes('COMPROVANTE') && (tipo.includes('COMPROVANTE') || dNome.includes('COMPROVANTE'))) return true;
            if (nome.includes('PROCURA') && (tipo.includes('PROCURA') || dNome.includes('PROCURA'))) return true;
            return false;
        });
    };

    // Auto-vincular documentos do cliente ao checklist na primeira carga
    const autoLinkedRef = useRef(false);
    useEffect(() => {
        if (autoLinkedRef.current || !cliente || docsCliente.length === 0) return;
        autoLinkedRef.current = true;

        let changed = false;
        const updated = localChecklist.map(item => {
            // Só auto-vincular se o item ainda não tem arquivo e está pendente
            if (item.arquivo || item.status === 'nao_se_aplica') return item;
            const match = matchDocCliente(item.nome);
            if (match?.arquivo) {
                changed = true;
                return { ...item, arquivo: match.arquivo, status: 'recebido' as StatusChecklist };
            }
            return item;
        });

        if (changed) {
            setLocalChecklist(updated);
            // Salva automaticamente
            updateOrdem(os.id, { checklist: updated, checklistObservacoes: observacoesGlobais }).then(() => {
                onRefresh();
            });
        }
    }, [cliente, docsCliente.length]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeUploadItemId) return;

        setUploadingId(activeUploadItemId);
        try {
            const item = localChecklist.find(i => i.id === activeUploadItemId);
            const itemName = item ? item.nome.replace(/[^a-zA-Z0-9]/g, '_') : 'documento';
            const osNumberString = os.numero.toString().padStart(4, '0');
            const fileName = `OS${osNumberString}_${itemName}_${file.name}`;

            const { uploadFileToSupabase } = await import('../lib/supabaseStorage');

            // Determinar path no bucket
            const path = `os_${osNumberString}/checklist/${fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;

            const publicUrl = await uploadFileToSupabase(file, path);

            updateItem(activeUploadItemId, {
                arquivo: publicUrl,
                status: 'recebido'
            });

            // Auto-salva o checklist para persistir o documento recebido
            const updatedChecklist = localChecklist.map(item =>
                item.id === activeUploadItemId ? { ...item, arquivo: publicUrl, status: 'recebido' as StatusChecklist } : item
            );
            await updateOrdem(os.id, { checklist: updatedChecklist, checklistObservacoes: observacoesGlobais });
            setLocalChecklist(updatedChecklist);
            markDirty(false);

            // Também salva no cadastro do cliente se for documento pessoal (não de veículo)
            if (cliente && item) {
                const DOCS_PESSOAIS = ['CNH', 'RG', 'CPF', 'CNPJ', 'IDENTIDADE', 'CONTRATO SOCIAL', 'PROCURA', 'COMPROVANTE'];
                const nomeUpper = item.nome.toUpperCase();
                const isDocPessoal = DOCS_PESSOAIS.some(dp => nomeUpper.includes(dp));
                if (isDocPessoal) {
                    const jaTemNoCliente = matchDocCliente(item.nome);
                    if (!jaTemNoCliente) {
                        const novoDoc: DocumentoCliente = {
                            id: generateId(),
                            tipo: item.nome,
                            nome: `${item.nome}_${cliente.nome.replace(/[^a-zA-Z0-9]/g, '_')}`,
                            arquivo: publicUrl,
                            dataUpload: new Date().toISOString(),
                        };
                        await updateCliente(cliente.id, {
                            documentos: [...(cliente.documentos || []), novoDoc],
                        });
                    }
                }
            }

            onRefresh();

        } catch (error) {
            console.error('Erro ao fazer upload:', error);
            alert('Falha ao enviar arquivo');
        } finally {
            setUploadingId(null);
            setActiveUploadItemId(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const updateItem = (itemId: string, updates: Partial<ChecklistItem>) => {
        setLocalChecklist((prev) =>
            prev.map((item) => (item.id === itemId ? { ...item, ...updates } : item))
        );
        markDirty(true);
    };

    const handleAddDocumento = () => {
        if (!novoDocNome.trim()) return;
        const newItem: ChecklistItem = {
            id: generateId(),
            nome: novoDocNome.trim(),
            status: 'pendente'
        };
        setLocalChecklist([...localChecklist, newItem]);
        setNovoDocNome('');
        markDirty(true);
    };

    const handleNaoPossuiCNH = (itemId: string) => {
        const hasIdentidade = localChecklist.some(i => i.nome.toUpperCase() === 'IDENTIDADE' || i.nome.toUpperCase() === 'RG');
        const hasCPF = localChecklist.some(i => i.nome.toUpperCase() === 'CPF');

        let additions: ChecklistItem[] = [];
        if (!hasIdentidade) additions.push({ id: generateId(), nome: 'Identidade (RG)', status: 'pendente' as StatusChecklist });
        if (!hasCPF) additions.push({ id: generateId(), nome: 'CPF', status: 'pendente' as StatusChecklist });

        setLocalChecklist(prev => [
            ...prev.map(i => i.id === itemId ? { ...i, status: 'nao_se_aplica' as StatusChecklist, observacao: 'Cliente não possui CNH' } : i),
            ...additions
        ]);
        markDirty(true);
    };

    const handleSave = async () => {
        await updateOrdem(os.id, { checklist: localChecklist, checklistObservacoes: observacoesGlobais });
        await addAuditEntry(os.id, 'Checklist atualizado', 'Checklist de documentos atualizado');
        markDirty(false);
        onRefresh();
    };

    const recebidos = localChecklist.filter((i) => i.status === 'recebido').length;
    const invalidos = localChecklist.filter((i) => i.status === 'invalido').length;
    const pendentes = localChecklist.filter((i) => i.status === 'pendente').length;
    const naoAplica = localChecklist.filter((i) => i.status === 'nao_se_aplica').length;
    const total = localChecklist.length;
    const progressPercent = total > 0 ? Math.round(((recebidos + naoAplica) / total) * 100) : 0;

    const statusColor = (s: StatusChecklist) => {
        switch (s) {
            case 'recebido': return { color: 'var(--color-success)', bg: 'rgba(16,185,129,0.12)', label: 'Recebido' };
            case 'invalido': return { color: 'var(--color-danger)', bg: 'rgba(239,68,68,0.12)', label: 'Inválido' };
            case 'nao_se_aplica': return { color: 'var(--color-neutral)', bg: 'rgba(107,114,128,0.12)', label: 'N/A' };
            default: return { color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.12)', label: 'Pendente' };
        }
    };

    // (matchDocCliente já está declarado acima do useEffect)

    return (
        <div style={{ display: 'flex', gap: 20, alignItems: 'start', flexWrap: 'wrap' }}>

            {/* ===== COLUNA 1: RESUMO ===== */}
            <div style={{ flex: '1 1 220px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 16 }}>
                <CKColCard>
                    <CKColHeader label="Resumo do Checklist" />
                    <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Percentagem grande */}
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, lineHeight: 1 }}>
                                <span style={{ fontSize: 52, fontWeight: 900, color: checklistComplete ? 'var(--color-success)' : 'var(--color-primary)', lineHeight: 1 }}>
                                    {progressPercent}
                                </span>
                                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-secondary)' }}>%</span>
                            </div>
                            {checklistComplete && (
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
                                    fontSize: 10, fontWeight: 800, color: 'var(--color-success)',
                                    background: 'rgba(16,185,129,0.1)', padding: '4px 12px', borderRadius: 20,
                                    border: '1px solid rgba(16,185,129,0.25)',
                                }}>
                                    <CheckCircle size={11} strokeWidth={3} /> COMPLETO
                                </div>
                            )}
                        </div>

                        {/* Barra de progresso */}
                        <div style={{ height: 7, borderRadius: 4, background: 'var(--bg-secondary, rgba(128,128,128,0.1))', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', borderRadius: 4,
                                width: `${progressPercent}%`,
                                background: checklistComplete
                                    ? 'linear-gradient(90deg, var(--color-success), var(--color-success-bright))'
                                    : 'linear-gradient(90deg, var(--color-primary), var(--color-primary))',
                                transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
                            }} />
                        </div>

                        {/* Stats com bolinhas */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[
                                { label: 'Recebidos', value: recebidos, color: 'var(--color-success)' },
                                { label: 'Pendentes', value: pendentes, color: 'var(--color-warning)' },
                                { label: 'Inválidos', value: invalidos, color: 'var(--color-danger)' },
                                { label: 'N/A',       value: naoAplica, color: 'var(--color-neutral)' },
                            ].map(s => (
                                <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{s.label}</span>
                                    </div>
                                    <span style={{
                                        fontSize: 12, fontWeight: 700,
                                        color: s.value > 0 ? s.color : 'var(--color-text-secondary)',
                                        background: s.value > 0 ? `${s.color}18` : 'transparent',
                                        padding: '1px 8px', borderRadius: 99,
                                        minWidth: 24, textAlign: 'center',
                                    }}>{s.value}</span>
                                </div>
                            ))}
                        </div>

                        {/* Info do cliente */}
                        {cliente && (
                            <>
                                <div style={{ height: 1, background: 'var(--border-color)', opacity: 0.7 }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <User size={16} style={{ color: 'var(--color-info)' }} />
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cliente.nome}</div>
                                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{cliente.cpfCnpj}</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <FileText size={12} style={{ color: 'var(--color-info)', flexShrink: 0 }} />
                                    {docsCliente.length} docs no cadastro
                                    {docsCliente.filter(d => d.arquivo).length > 0 && (
                                        <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>
                                            ({docsCliente.filter(d => d.arquivo).length} prontos)
                                        </span>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </CKColCard>
            </div>

            {/* ===== COLUNA 2: DOCUMENTOS ===== */}
            <div style={{ flex: '2 1 300px', minWidth: 300, display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Documentos do Cliente (se houver) */}
                {docsCliente.length > 0 && (
                    <CKColCard>
                        <CKColHeader
                            label="Documentos do Cliente"
                            right={
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: 'rgba(59,130,246,0.1)', color: 'var(--color-info)' }}>
                                    {docsCliente.length}
                                </span>
                            }
                        />
                        <div style={{ padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {docsCliente.map(doc => (
                                <div key={doc.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 12px', borderRadius: 10,
                                    background: 'var(--bg-body, var(--bg-surface))', border: '1px solid var(--border-color)',
                                    transition: 'border-color 0.2s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-info)')}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                                >
                                    {doc.arquivo
                                        ? <CheckCircle size={13} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                                        : <FileText size={13} style={{ color: 'var(--color-neutral)', flexShrink: 0 }} />
                                    }
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{doc.tipo || doc.nome}</span>
                                    {doc.arquivo && (
                                        <button onClick={() => onOpenViewer(doc.arquivo!, doc.nome || doc.tipo)}
                                            style={{ background: '#3b82f61a', border: 'none', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--color-info)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Eye size={11} /> Ver
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CKColCard>
                )}

                {/* Documentos do Processo (Checklist principal) */}
                <CKColCard>
                    <CKColHeader
                        label="Documentos do Processo"
                        right={
                            <span style={{
                                fontSize: 11, fontWeight: 700,
                                padding: '2px 10px', borderRadius: 99,
                                background: 'rgba(245,158,11,0.1)', color: 'var(--color-primary)',
                            }}>{total} total</span>
                        }
                    />
                    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {localChecklist.map((item) => {
                            const sc = statusColor(item.status);
                            return (
                                <div key={item.id} style={{
                                    background: 'var(--bg-body, var(--bg-surface))',
                                    border: '1px solid var(--border-color)',
                                    borderLeft: `3px solid ${sc.color}`,
                                    borderRadius: 10,
                                    padding: '10px 12px',
                                    transition: 'box-shadow 0.2s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
                                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                                >
                                    {/* Linha principal */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        {/* Ícone status */}
                                        <div style={{ width: 26, height: 26, borderRadius: 7, background: sc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            {item.status === 'recebido' ? <CheckCircle size={14} style={{ color: sc.color }} />
                                                : item.status === 'invalido' ? <XCircle size={14} style={{ color: sc.color }} />
                                                : item.status === 'nao_se_aplica' ? <X size={14} style={{ color: sc.color }} strokeWidth={3} />
                                                : <Clock size={14} style={{ color: sc.color }} />}
                                        </div>

                                        {/* Nome */}
                                        <span style={{
                                            flex: 1, fontSize: 13, fontWeight: 600, minWidth: 0,
                                            color: item.status === 'nao_se_aplica' ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                                            textDecoration: item.status === 'nao_se_aplica' ? 'line-through' : 'none',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {item.nome}
                                        </span>

                                        {/* Badge status */}
                                        <span style={{
                                            fontSize: 9, fontWeight: 800, color: sc.color,
                                            background: sc.bg, padding: '2px 7px', borderRadius: 99,
                                            textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
                                            border: `1px solid ${sc.color}33`,
                                        }}>
                                            {sc.label}
                                        </span>

                                        {/* Botões de ação arquivo */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                            {item.arquivo ? (
                                                <>
                                                    <button onClick={() => onOpenViewer(item.arquivo!, item.nome)}
                                                        title="Ver documento"
                                                        style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(59,130,246,0.1)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-info)', transition: 'background 0.15s' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.2)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}>
                                                        <Eye size={13} />
                                                    </button>
                                                    <button
                                                        title="Remover anexo"
                                                        style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(239,68,68,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-danger)', transition: 'background 0.15s' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.18)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                                                        onClick={async () => {
                                                            const confirmed = await confirm('Deseja remover este anexo?');
                                                            if (confirmed) { updateItem(item.id, { arquivo: undefined, status: 'pendente' }); setDirty(true); }
                                                        }}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    title="Anexar arquivo"
                                                    disabled={uploadingId === item.id}
                                                    style={{ height: 28, padding: '0 10px', borderRadius: 7, background: uploadingId === item.id ? 'var(--bg-secondary)' : 'var(--color-primary)', color: uploadingId === item.id ? 'var(--color-text-secondary)' : 'var(--color-text-on-primary, #fff)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, transition: 'opacity 0.15s' }}
                                                    onClick={() => { setActiveUploadItemId(item.id); fileInputRef.current?.click(); }}>
                                                    {uploadingId === item.id ? <Clock size={12} className="animate-spin" /> : <Upload size={12} />}
                                                    {uploadingId === item.id ? '...' : 'Anexar'}
                                                </button>
                                            )}
                                            {/* Excluir item */}
                                            <button
                                                title="Excluir item"
                                                style={{ width: 24, height: 24, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', opacity: 0.3, transition: 'opacity 0.15s, color 0.15s' }}
                                                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--color-danger)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                                                onClick={async () => {
                                                    const confirmed = await confirm(`Deseja mesmo remover o item "${item.nome}"?`);
                                                    if (confirmed) { setLocalChecklist(prev => prev.filter(i => i.id !== item.id)); setDirty(true); }
                                                }}>
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Controles de status + obs + Sem CNH */}
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, paddingLeft: 36 }}>
                                        <div style={{ display: 'flex', gap: 3, padding: '2px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(128,128,128,0.04)', alignItems: 'center' }}>
                                            {[
                                                { id: 'pendente',      icon: Clock,          color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.15)',   label: 'Pendente' },
                                                { id: 'recebido',      icon: CheckCircle,    color: 'var(--color-success)', bg: 'rgba(16,185,129,0.15)',   label: 'Recebido' },
                                                { id: 'invalido',      icon: AlertTriangle,  color: 'var(--color-danger)', bg: 'rgba(239,68,68,0.15)',    label: 'Inválido' },
                                                { id: 'nao_se_aplica', icon: X,              color: 'var(--color-neutral)', bg: 'rgba(107,114,128,0.15)', label: 'N/A' },
                                            ].map(opt => {
                                                const isSelected = item.status === opt.id;
                                                return (
                                                    <button key={opt.id}
                                                        onClick={() => updateItem(item.id, { status: opt.id as StatusChecklist })}
                                                        title={opt.label}
                                                        style={{
                                                            height: 24, padding: isSelected ? '0 8px' : '0 5px', borderRadius: 6,
                                                            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            cursor: 'pointer', transition: 'all 0.2s',
                                                            background: isSelected ? opt.bg : 'transparent',
                                                            color: isSelected ? opt.color : 'var(--color-text-secondary)',
                                                            opacity: isSelected ? 1 : 0.45,
                                                        }}
                                                        onMouseEnter={e => !isSelected && (e.currentTarget.style.opacity = '0.8')}
                                                        onMouseLeave={e => !isSelected && (e.currentTarget.style.opacity = '0.45')}
                                                    >
                                                        <opt.icon size={12} strokeWidth={isSelected ? 3 : 2} />
                                                        {isSelected && <span style={{ fontSize: 9, fontWeight: 800, marginLeft: 5, whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>{opt.label.toUpperCase()}</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <input type="text" placeholder="Observação..."
                                            value={item.observacao || ''}
                                            onChange={(e) => updateItem(item.id, { observacao: e.target.value })}
                                            style={{
                                                flex: 1, fontSize: 11, padding: '4px 9px',
                                                background: 'var(--bg-secondary, rgba(128,128,128,0.06))',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: 7, color: 'var(--color-text-primary)', outline: 'none', transition: 'border-color 0.2s',
                                            }}
                                            onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                                            onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                        />

                                        {(item.nome === 'CNH' || item.nome.includes('CNH')) && item.status !== 'nao_se_aplica' && (
                                            <button
                                                style={{ background: 'transparent', border: '1px solid #F59E0B55', borderRadius: 7, padding: '3px 9px', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--color-warning)', whiteSpace: 'nowrap', transition: 'background 0.15s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.08)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                onClick={() => handleNaoPossuiCNH(item.id)}>
                                                Sem CNH?
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} />
                </CKColCard>
            </div>

            {/* ===== COLUNA 3: ACOES ===== */}
            <div style={{ flex: '1 1 200px', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 16 }}>

                {/* Novo Documento */}
                <CKColCard>
                    <CKColHeader label="Novo Documento" right={<Plus size={13} style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }} />} />
                    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <input type="text" placeholder="Nome do documento..."
                            value={novoDocNome}
                            onChange={(e) => setNovoDocNome(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddDocumento()}
                            style={{
                                fontSize: 13, padding: '9px 12px',
                                background: 'var(--bg-body, var(--bg-surface))', border: '1px solid var(--border-color)',
                                borderRadius: 8, color: 'var(--color-text-primary)', outline: 'none', transition: 'border-color 0.2s',
                            }}
                            onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                            onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                        />
                        <button onClick={handleAddDocumento} disabled={!novoDocNome.trim()}
                            style={{
                                background: novoDocNome.trim() ? 'var(--color-primary)' : 'var(--bg-secondary, rgba(128,128,128,0.1))',
                                color: novoDocNome.trim() ? 'var(--color-text-on-primary, #fff)' : 'var(--color-text-secondary)',
                                border: 'none', borderRadius: 8, padding: '10px',
                                cursor: novoDocNome.trim() ? 'pointer' : 'default',
                                fontWeight: 700, fontSize: 13,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                                transition: 'all 0.2s',
                            }}>
                            <Plus size={15} /> Adicionar
                        </button>
                    </div>
                </CKColCard>

                {/* Observações Gerais */}
                <CKColCard>
                    <CKColHeader label="Observacoes Gerais" right={<MessageSquare size={13} style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }} />} />
                    <div style={{ padding: '14px 16px' }}>
                        <textarea rows={4} placeholder="Notas sobre o checklist..."
                            value={observacoesGlobais}
                            onChange={(e) => { setObservacoesGlobais(e.target.value); markDirty(true); }}
                            style={{
                                width: '100%', fontSize: 12, padding: '10px 12px',
                                background: 'var(--bg-body, var(--bg-surface))', border: '1px solid var(--border-color)',
                                borderRadius: 8, color: 'var(--color-text-primary)', outline: 'none',
                                resize: 'vertical', minHeight: 90, fontFamily: 'inherit', transition: 'border-color 0.2s',
                                boxSizing: 'border-box',
                            }}
                            onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                            onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                        />
                    </div>
                </CKColCard>

                {/* Botao Salvar */}
                <button onClick={handleSave} disabled={!dirty}
                    style={{
                        width: '100%',
                        background: dirty ? 'linear-gradient(135deg, #10B981, #059669)' : 'var(--bg-secondary, rgba(128,128,128,0.1))',
                        color: dirty ? '#fff' : 'var(--color-text-secondary)',
                        border: 'none', borderRadius: 10, padding: '13px',
                        cursor: dirty ? 'pointer' : 'default',
                        fontWeight: 800, fontSize: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
                        boxShadow: dirty ? '0 4px 16px rgba(16,185,129,0.28)' : 'none',
                        transform: dirty ? 'scale(1.02)' : 'scale(1)',
                    }}>
                    {dirty ? <Save size={17} /> : <CheckCircle size={17} />}
                    {dirty ? 'SALVAR ALTERACOES' : 'CHECKLIST SALVO'}
                </button>
                {dirty && (
                    <p style={{ margin: 0, textAlign: 'center', fontSize: 11, color: 'var(--color-warning)', fontWeight: 700 }}>
                        Voce possui alteracoes nao salvas!
                    </p>
                )}
            </div>
        </div>
    );
}

// ===== DETRAN TAB (with Save button) =====
function DetranTab({ os, onRefresh, checklistComplete, veiculo, cliente }: {
    os: OrdemDeServico;
    onRefresh: () => void;
    checklistComplete: boolean;
    veiculo: any;
    cliente: any;
}) {
    const [dataCadastro, setDataCadastro] = useState(os.detran?.dataCadastro || '');
    const [daeValor, setDaeValor] = useState(os.detran?.daeValor?.toString() || '');
    const [statusPagamento, setStatusPagamento] = useState<StatusPagamento>(os.detran?.statusPagamento || 'aguardando_pagamento');
    const [dirty, setDirty] = useState(false);

    if (!checklistComplete) {
        return (
            <div className="empty-state">
                <AlertTriangle />
                <h3>Checklist incompleto</h3>
                <p>Complete todos os documentos do checklist antes de avançar para o Detran.</p>
            </div>
        );
    }

    const handleSave = async () => {
        const detran = {
            ...os.detran,
            dataCadastro,
            daeValor: parseFloat(daeValor) || 0,
            statusPagamento,
            dataPagamento: statusPagamento === 'pago' ? (os.detran?.dataPagamento || new Date().toISOString().split('T')[0]) : undefined,
        };
        await updateOrdem(os.id, { detran });
        await addAuditEntry(os.id, 'Detran / DAE', `Dados do Detran atualizados — Status: ${statusPagamento === 'pago' ? 'Pago' : 'Aguardando'}`);
        setDirty(false);
        onRefresh();
    };

    const getDetranUrl = () => {
        const servicosMap: Record<string, string> = {
            'transferencia': 'https://transito.mg.gov.br/veiculos/transferencias/taxa-para-transferir-propriedade-de-veiculo-comprador/index/2',
            'alteracao_dados': 'https://transito.mg.gov.br/veiculos/alteracoes/solicitar-inclusao-ou-retirada-de-restricao-financeira-1',
            'mudanca_categoria': 'https://transito.mg.gov.br/veiculos/alteracoes/solicitar-mudanca-de-categoria-de-seu-veiculo-1',
            'baixa': 'https://transito.mg.gov.br/veiculos/veiculo-sinistrado-e-baixa-de-veiculo/taxa-de-baixa-de-veiculo',
            'primeiro_emplacamento': 'https://transito.mg.gov.br/veiculos/emplacamento/primeiro-emplacamento-veiculo-zero-km/complementar-dados-do-veiculo',
            'segunda_via': 'https://transito.mg.gov.br/veiculos/documentos-de-veiculos/emitir-a-2-via-do-crv'
        };

        const baseUrl = (servicosMap[os.tipoServico as string] || servicosMap['transferencia']) as string;
        let url = new URL(baseUrl);


        url.searchParams.append('crm_servico', os.tipoServico);

        if (veiculo) {
            if (veiculo.placa) url.searchParams.append('placa', veiculo.placa);
            if (veiculo.chassi) url.searchParams.append('chassi', veiculo.chassi);
        }
        if (cliente) {
            if (cliente.cpfCnpj) url.searchParams.append('cpfCnpj', cliente.cpfCnpj);
            if (cliente.nome) url.searchParams.append('nome', cliente.nome);
        }

        return url.toString();
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Cadastro Detran-MG e DAE</h3>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={() => window.open(getDetranUrl(), '_blank')}
                    title="Acessar o serviço referente a esta OS no site do Detran"
                >
                    <ExternalLink size={14} /> Ir para o Detran
                </button>
            </div>


            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div>
                    <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Data do Cadastro</label>
                    <input
                        type="date"
                        className="form-input"
                        style={{ width: 200 }}
                        value={dataCadastro}
                        onChange={(e) => { setDataCadastro(e.target.value); setDirty(true); }}
                    />
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!dirty}>
                    <Save size={14} /> Salvar
                </button>
                {dirty && <span className="text-xs text-gray">Não salvo</span>}
            </div>
        </div>
    );
}

// ===== VISTORIA TAB (with Save + payment fields) =====
function VistoriaTab({ os, onRefresh, daePaga, veiculo, cliente, onDirtyChange, onOpenViewer }: {
    os: OrdemDeServico;
    onRefresh: () => void;
    daePaga: boolean;
    veiculo: any;
    cliente: any;
    onDirtyChange?: (dirty: boolean) => void;
    onOpenViewer: (url: string, title: string) => void;
}) {
    const { usuario: authUser } = useAuth();
    const isAdmin = authUser?.role === 'admin';
    const vistoria = os.vistoria || { status: 'agendar' as const, local: '' };

    const [local, setLocal] = useState(vistoria.local);
    const [dataAgendamento, setDataAgendamento] = useState(vistoria.dataAgendamento || '');
    const [horaAgendamento, setHoraAgendamento] = useState(vistoria.horaAgendamento || '');
    const [protocolo, setProtocolo] = useState(vistoria.protocolo || '');
    const [status, setStatus] = useState<StatusVistoria>(vistoria.status);
    const [trocaPlaca, setTrocaPlaca] = useState(os.trocaPlaca);
    // Payment: taxa de vistoria
    const [taxaValor, setTaxaValor] = useState(vistoria.taxaValor?.toString() || '');
    const [taxaStatus, setTaxaStatus] = useState<StatusPagamento>(vistoria.taxaStatus || 'aguardando_pagamento');
    // Payment: placa
    const [placaValor, setPlacaValor] = useState(vistoria.placaValor?.toString() || '');
    const [placaStatus, setPlacaStatus] = useState<StatusPagamento>(vistoria.placaStatus || 'aguardando_pagamento');

    // Vistoria PDF upload
    const [vistUploading, setVistUploading] = useState(false);
    const [vistUploadMsg, setVistUploadMsg] = useState<string | null>(null);
    const vistFileRef = useRef<HTMLInputElement>(null);

    const [motivo, setMotivo] = useState(vistoria.motivoReprovacao || '');
    const [apontamento, setApontamento] = useState(vistoria.descricaoApontamento || '');
    const [dirty, setDirtyLocal] = useState(false);
    // Guard against double-submit
    const [saving, setSaving] = useState(false);

    // Bug #1 fix: re-sync local state when the OS is refreshed from the server
    // Only sync when not dirty (user has no pending changes)
    useEffect(() => {
        if (dirty) return;
        const v = os.vistoria || { status: 'agendar' as const, local: '' };
        setLocal(v.local || '');
        setDataAgendamento(v.dataAgendamento || '');
        setHoraAgendamento(v.horaAgendamento || '');
        setProtocolo(v.protocolo || '');
        setStatus(v.status);
        setTrocaPlaca(os.trocaPlaca);
        setTaxaValor(v.taxaValor?.toString() || '');
        setTaxaStatus(v.taxaStatus || 'aguardando_pagamento');
        setPlacaValor(v.placaValor?.toString() || '');
        setPlacaStatus(v.placaStatus || 'aguardando_pagamento');
        setMotivo(v.motivoReprovacao || '');
        setApontamento(v.descricaoApontamento || '');
    }, [os.atualizadoEm]); // eslint-disable-line react-hooks/exhaustive-deps

    // Detecta se a vistoria agendada já passou do prazo
    const prazoVencido = vistoria.status === 'agendada' && vistoria.dataAgendamento
        && new Date(vistoria.dataAgendamento + 'T23:59:59') < new Date();

    const setDirty = (val: boolean) => {
        setDirtyLocal(val);
        onDirtyChange?.(val);
    };

    const handleVistoriaUpload = async (file: File) => {
        setVistUploading(true);
        setVistUploadMsg(null);
        try {
            const { uploadFileToSupabase } = await import('../lib/supabaseStorage');
            const label = veiculo?.placa || veiculo?.chassi || veiculo?.id;
            const fileName = `VISTORIA_OS_${os.numero}_${label}.pdf`;
            const path = `os_${os.numero}/vistoria/${fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;

            const publicUrl = await uploadFileToSupabase(file, path);

            const updatedVistoria = {
                ...(os.vistoria || {} as any),
                vistoriaAnexadaEm: new Date().toISOString(),
                vistoriaNomeArquivo: fileName,
                vistoriaUrl: publicUrl,
            };

            await updateOrdem(os.id, {
                vistoria: updatedVistoria,
            });
            await addAuditEntry(os.id, 'Vistoria Upload', `PDF da vistoria enviado e salvo no Supabase.`);
            setVistUploadMsg(`✅ Vistoria enviada com sucesso!`);
            onRefresh();
        } catch (err: any) {
            setVistUploadMsg(`❌ Erro ao enviar: ${err.message}`);
        } finally {
            setVistUploading(false);
        }
    };



    const handleSave = async () => {
        if (saving) return; // Bug #3 fix: guard against double-submit

        const effectiveStatus: StatusVistoria = status;

        if (effectiveStatus === 'reprovada' && !motivo.trim() && vistoria.status !== 'reprovada') {
            alert('Informe o motivo da reprovação');
            return;
        }
        if (effectiveStatus === 'aprovada_apontamento' && !apontamento.trim() && vistoria.status !== 'aprovada_apontamento') {
            alert('Descreva o apontamento');
            return;
        }

        // Bug #4 fix: prevent scheduling in the past when status is 'agendada'
        if (effectiveStatus === 'agendada' && dataAgendamento) {
            const today = new Date().toISOString().substring(0, 10);
            if (dataAgendamento < today) {
                alert('A data de agendamento não pode ser no passado.');
                return;
            }
        }

        setSaving(true);
        try {
        const updatedVistoria = {
            ...os.vistoria,
            local,
            dataAgendamento: dataAgendamento || undefined,
            horaAgendamento: horaAgendamento || undefined,
            protocolo: protocolo || undefined,
            status: effectiveStatus,
            taxaValor: parseFloat(taxaValor) || undefined,
            taxaStatus,
            taxaDataPagamento: taxaStatus === 'pago' ? (vistoria.taxaDataPagamento || new Date().toISOString().split('T')[0]) : undefined,
            placaValor: trocaPlaca ? (parseFloat(placaValor) || undefined) : undefined,
            placaStatus: trocaPlaca ? placaStatus : undefined,
            placaDataPagamento: trocaPlaca && placaStatus === 'pago' ? (vistoria.placaDataPagamento || new Date().toISOString().split('T')[0]) : undefined,
        };

        const updateData: any = { vistoria: updatedVistoria, trocaPlaca };

        // Atualiza status da OS automaticamente conforme status da vistoria
        // Fluxo: aguardando_documentacao → vistoria → delegacia → doc_pronto → entregue
        const osStatusAtual = os.status;
        if (effectiveStatus === 'agendada' && (osStatusAtual === 'aguardando_documentacao' || osStatusAtual === 'vistoria')) {
            updateData.status = 'vistoria';
        } else if ((effectiveStatus === 'aprovada' || effectiveStatus === 'aprovada_apontamento') &&
                   (osStatusAtual === 'vistoria' || osStatusAtual === 'aguardando_documentacao')) {
            updateData.status = 'delegacia';
        } else if (effectiveStatus === 'reprovada' && osStatusAtual !== 'aguardando_documentacao') {
            // Reprovada: volta para vistoria (precisa reagendar)
            updateData.status = 'vistoria';
        }

        // Se reagendando (voltou de agendada para agendar), registrar pendência
        if (effectiveStatus === 'agendar' && vistoria.status === 'agendada') {
            const dataAnterior = vistoria.dataAgendamento
                ? new Date(vistoria.dataAgendamento + 'T12:00:00').toLocaleDateString('pt-BR')
                : '';
            updateData.pendencia = `Vistoria precisa reagendar (anterior: ${dataAnterior} - ${vistoria.local || 'sem local'})`;
        }

        // Bug #8 fix: simplified redundant sifap branches
        if (trocaPlaca) {
            updateData.sifap = {
                ...(os.sifap || { necessario: true }),
                necessario: true
            };
        }

        const history = [...os.vistoriaHistory];
        if (effectiveStatus !== vistoria.status) {
            if (effectiveStatus === 'reprovada') {
                const prazo = new Date();
                prazo.setDate(prazo.getDate() + 30);
                updatedVistoria.motivoReprovacao = motivo;
                updatedVistoria.prazoReagendamento = prazo.toISOString();
                history.push({ id: generateId(), local, data: dataAgendamento || new Date().toISOString(), status: 'reprovada', motivo, registradoEm: new Date().toISOString(), usuario: authUser?.nome });
                updatedVistoria.status = 'agendar';
                updatedVistoria.dataAgendamento = undefined;
                setStatus('agendar');
                setDataAgendamento('');
                setMotivo('');
            } else if (effectiveStatus === 'aprovada_apontamento') {
                updatedVistoria.descricaoApontamento = apontamento;
                history.push({ id: generateId(), local, data: dataAgendamento || new Date().toISOString(), status: 'aprovada_apontamento', apontamento, registradoEm: new Date().toISOString(), usuario: authUser?.nome });
                setApontamento('');
            } else if (effectiveStatus === 'aprovada') {
                history.push({ id: generateId(), local, data: dataAgendamento || new Date().toISOString(), status: 'aprovada', registradoEm: new Date().toISOString(), usuario: authUser?.nome });
            }
        }

        await updateOrdem(os.id, { ...updateData, vistoriaHistory: history });
        await addAuditEntry(os.id, 'Vistoria', `Vistoria atualizada — Status: ${STATUS_VISTORIA_LABELS[effectiveStatus]}`);

        // Se vistoria agendada, marca DAE como pago automaticamente
        if (effectiveStatus === 'agendada' && vistoria.status !== 'agendada') {
            try {
                const { supabase } = await import('../lib/supabaseClient');
                const { data: daeCharges } = await supabase
                    .from('finance_charges')
                    .select('id, valor_previsto')
                    .eq('os_id', os.id)
                    .in('categoria', ['dae_principal', 'dae_adicional'])
                    .eq('status', 'a_pagar');
                if (daeCharges && daeCharges.length > 0) {
                    for (const dae of daeCharges) {
                        await supabase.from('finance_charges').update({
                            status: 'pago',
                            valor_pago: Number(dae.valor_previsto),
                            confirmado_por: authUser?.nome || 'Sistema',
                            confirmado_em: new Date().toISOString(),
                            atualizado_em: new Date().toISOString(),
                        }).eq('id', dae.id);
                    }
                    await addAuditEntry(os.id, 'Financeiro', 'DAE marcado como pago automaticamente (vistoria agendada).');
                }
            } catch (err) {
                console.warn('Aviso: não foi possível marcar DAE como pago:', err);
            }
        }

        setDirty(false);
        onRefresh();
        } finally {
            setSaving(false);
        }
    };


    const linkUrl = new URL("https://transito.mg.gov.br/veiculos/vistorias/agendamento-ou-reagendamento-de-vistoria-na-ecv");
    if (veiculo?.placa) linkUrl.searchParams.append("placa", veiculo.placa);
    if (veiculo?.chassi) linkUrl.searchParams.append("chassi", veiculo.chassi);

    if (cliente?.cpfCnpj) {
        linkUrl.searchParams.append("cpfCnpj", cliente.cpfCnpj.replace(/[^\w]/g, ''));
        linkUrl.searchParams.append("tipoDoc", cliente.cpfCnpj.replace(/[^\w]/g, '').length > 11 ? 'CNPJ' : 'CPF');
    }
    if (cliente?.nome) linkUrl.searchParams.append("nome", cliente.nome);

    // Controles fixos do Despachante Matilde
    linkUrl.searchParams.append("telefone", "3138314648");
    linkUrl.searchParams.append("email", "despachantematilde@hotmail.com");

    // Serviço / Motivo da vistoria
    if (os.tipoServico) {
        linkUrl.searchParams.append("servico", TIPO_SERVICO_LABELS[os.tipoServico]);
    }

    // Passamos o ID da OS pra não ter erro na volta
    linkUrl.searchParams.append("osId", os.id);

    // === Cores por status ===
    const statusInfo = (s: StatusVistoria) => {
        switch (s) {
            case 'aprovada': return { color: 'var(--color-success)', bg: 'rgba(16,185,129,0.12)', icon: <CheckCircle size={16} />, label: 'Aprovada' };
            case 'reprovada': return { color: 'var(--color-danger)', bg: 'rgba(239,68,68,0.12)', icon: <XCircle size={16} />, label: 'Reprovada' };
            case 'agendada': return prazoVencido
                ? { color: 'var(--color-danger)', bg: 'rgba(239,68,68,0.12)', icon: <AlertTriangle size={16} />, label: '⚠ Reagendar' }
                : { color: 'var(--color-info)', bg: 'rgba(59,130,246,0.12)', icon: <Calendar size={16} />, label: 'Agendada' };
            case 'reagendar': return { color: 'var(--color-danger)', bg: 'rgba(239,68,68,0.12)', icon: <RotateCcw size={16} />, label: 'Reagendar' };
            case 'aprovada_apontamento': return { color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.12)', icon: <AlertTriangle size={16} />, label: 'Aprovada c/ Apontamento' };
            default: return { color: 'var(--color-purple)', bg: 'rgba(139,92,246,0.12)', icon: <Circle size={16} />, label: 'A Agendar' };
        }
    };

    const si = statusInfo(status);

    const laudoUrl = (() => {
        const u = new URL('https://transito.mg.gov.br/veiculos/vistorias/consulta-de-laudo-da-vistoria');
        if (veiculo?.chassi) u.searchParams.append('chassi', veiculo.chassi);
        if (cliente?.cpfCnpj) u.searchParams.append('cpfCnpj', cliente.cpfCnpj.replace(/[^\w]/g, ''));
        u.searchParams.append('osNumero', os.numero.toString());
        if (veiculo?.placa) u.searchParams.append('placa', veiculo.placa);
        return u.toString();
    })();

    // === JSX: layout responsivo ===
    return (
        <div>
            {/* ===== TOPO: Status + Ações Rápidas ===== */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 20, flexWrap: 'wrap', gap: 12,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: si.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: si.color,
                        }}>
                            {si.icon}
                        </div>
                        <div>
                            <span style={{ fontSize: 'var(--text-base, 1rem)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                Vistoria Veicular
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                <span style={{
                                    fontSize: 11, fontWeight: 700, color: si.color,
                                    background: si.bg, padding: '3px 10px', borderRadius: 6,
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                }}>
                                    {si.icon} {si.label}
                                </span>
                                {protocolo && (
                                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
                                        Protocolo: {protocolo}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                {/* Ações rápidas */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <a href={linkUrl.toString()} target="_blank" rel="noopener noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', borderRadius: 10,
                            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                            color: 'var(--color-text-primary)', fontWeight: 700, fontSize: 12,
                            textDecoration: 'none', cursor: 'pointer',
                            transition: 'border-color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = 'rgba(245,158,11,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
                    >
                        <Calendar size={14} /> Agendar ECV
                    </a>
                    <a href={laudoUrl} target="_blank" rel="noopener noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', borderRadius: 10,
                            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                            color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 12,
                            textDecoration: 'none', cursor: 'pointer',
                            transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                    >
                        <Search size={14} /> Consultar Laudo
                    </a>
                </div>
            </div>

            {/* Prazo de reagendamento */}
            {vistoria.prazoReagendamento && (
                <div style={{
                    marginBottom: 16, padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 12, fontWeight: 600, color: 'var(--color-danger)',
                }}>
                    <AlertTriangle size={14} />
                    Prazo para reagendamento: {new Date(vistoria.prazoReagendamento).toLocaleDateString('pt-BR')}
                </div>
            )}

            {/* ===== COLUNAS CKColCard ===== */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>

                {/* Coluna 1: Dados do Agendamento */}
                <CKColCard style={{ flex: '1 1 260px', minWidth: 240 }}>
                    <CKColHeader label="Dados do Agendamento" right={
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: si.color }}>
                            {si.icon}
                        </span>
                    } />
                    <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="os-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={LBL}>Local da Vistoria</label>
                                <input type="text" className="form-input" placeholder="Ex: ECV Central..."
                                    value={local} onChange={(e) => { setLocal(e.target.value); setDirty(true); }}
                                    style={{ fontSize: 13 }} />
                            </div>
                            <div>
                                <label style={LBL}>Protocolo</label>
                                <input type="text" className="form-input" placeholder="Ex: ZI012388"
                                    value={protocolo} onChange={(e) => { setProtocolo(e.target.value); setDirty(true); }}
                                    style={{ fontSize: 13 }} />
                            </div>
                            <div>
                                <label style={LBL}>Data</label>
                                <input type="date" className="form-input" value={dataAgendamento}
                                    min={(['agendada', 'agendar', 'reagendar'] as StatusVistoria[]).includes(status) ? new Date().toISOString().split('T')[0] : undefined}
                                    onChange={(e) => { setDataAgendamento(e.target.value); if (e.target.value && status === 'agendar') setStatus('agendada'); setDirty(true); }}
                                    style={{ fontSize: 13 }} />
                            </div>
                            <div>
                                <label style={LBL}>Hora</label>
                                <input type="time" className="form-input" value={horaAgendamento}
                                    onChange={(e) => { setHoraAgendamento(e.target.value); setDirty(true); }}
                                    style={{ fontSize: 13 }} />
                            </div>
                        </div>

                        {/* Resumo inline se preenchido */}
                        {(dataAgendamento || local) && (
                            <div style={{
                                display: 'flex', gap: 16, flexWrap: 'wrap',
                                padding: '10px 12px', borderRadius: 8,
                                background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                            }}>
                                {dataAgendamento && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <Calendar size={12} style={{ color: 'var(--color-primary)' }} />
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                            {(() => { const d = new Date(dataAgendamento + 'T12:00:00'); return isNaN(d.getTime()) ? dataAgendamento : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); })()}
                                        </span>
                                        {horaAgendamento && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>às {horaAgendamento}</span>}
                                    </div>
                                )}
                                {local && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <Building2 size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                                        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{local}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </CKColCard>

                {/* Coluna 2: Status + Troca de Placa */}
                <CKColCard style={{ flex: '1 1 260px', minWidth: 240 }}>
                    <CKColHeader label="Status da Vistoria" right={
                        <span style={{ fontSize: 10, fontWeight: 700, color: si.color, background: si.bg, padding: '2px 8px', borderRadius: 5 }}>
                            {si.label}
                        </span>
                    } />
                    <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Alerta prazo vencido */}
                        {prazoVencido && (
                            <div style={{
                                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                                borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                                <AlertTriangle size={16} color="var(--color-danger)" />
                                <div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-danger)' }}>Prazo vencido!</span>
                                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginLeft: 6 }}>
                                        Agendamento era {new Date(vistoria.dataAgendamento + 'T12:00:00').toLocaleDateString('pt-BR')} e não teve retorno. Reagende ou atualize o status.
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Status chips */}
                        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                            {(['agendar', 'agendada', 'reagendar', 'reprovada', 'aprovada_apontamento', 'aprovada'] as StatusVistoria[]).map((s) => {
                                const info = statusInfo(s);
                                const isActive = status === s || (s === 'reagendar' && prazoVencido && status === 'agendada');
                                return (
                                    <button key={s} onClick={() => {
                                        if (s === 'reagendar') {
                                            setStatus('reagendar');
                                            setDirty(true);
                                            return;
                                        } else {
                                            setStatus(s);
                                        }
                                        setDirty(true);
                                    }}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                            padding: '7px 12px', borderRadius: 9, border: 'none',
                                            fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                            background: isActive ? info.bg : 'var(--bg-body)',
                                            color: isActive ? info.color : 'var(--color-text-tertiary)',
                                            outline: isActive ? `2px solid ${info.color}` : '1px solid var(--border-color)',
                                            transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = info.bg; e.currentTarget.style.color = info.color; }}}
                                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-body)'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}}
                                    >
                                        {info.icon} {info.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Condicionais: motivo/apontamento */}
                        {status === 'reprovada' && vistoria.status !== 'reprovada' && (
                            <div style={{ padding: '12px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                <label style={{ ...LBL, color: 'var(--color-danger)' }}>Motivo da Reprovação *</label>
                                <textarea className="form-textarea" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                                    placeholder="Descreva de forma detalhada o motivo..."
                                    style={{ minHeight: 72, fontSize: 13, borderColor: 'rgba(239,68,68,0.3)' }} />
                            </div>
                        )}
                        {status === 'aprovada_apontamento' && vistoria.status !== 'aprovada_apontamento' && (
                            <div style={{ padding: '12px 14px', borderRadius: 9, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                                <label style={{ ...LBL, color: 'var(--color-warning)' }}>Descrição do Apontamento *</label>
                                <textarea className="form-textarea" value={apontamento} onChange={(e) => setApontamento(e.target.value)}
                                    placeholder="Descreva os apontamentos encontrados..."
                                    style={{ minHeight: 72, fontSize: 13, borderColor: 'rgba(245,158,11,0.3)' }} />
                            </div>
                        )}

                        {/* Troca de Placa toggle */}
                        <div style={{
                            padding: '12px 14px', borderRadius: 9,
                            background: trocaPlaca ? 'rgba(245,158,11,0.05)' : 'var(--bg-body)',
                            border: `1px solid ${trocaPlaca ? 'rgba(245,158,11,0.25)' : 'var(--border-color)'}`,
                            cursor: 'pointer', transition: 'all 0.15s',
                        }} onClick={() => { setTrocaPlaca(!trocaPlaca); setDirty(true); }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input type="checkbox" checked={trocaPlaca} readOnly
                                    style={{ width: 16, height: 16, borderRadius: 4, accentColor: 'var(--color-primary)', cursor: 'pointer', flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                        Necessidade de Troca de Placa
                                    </span>
                                    <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', margin: '2px 0 0' }}>
                                        Marque se o veículo necessita de troca de placa
                                    </p>
                                </div>
                                {trocaPlaca && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 5 }}>
                                        SIM
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Botão Salvar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
                            <button onClick={handleSave} disabled={!dirty || saving}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 7,
                                    padding: '9px 20px', borderRadius: 9, border: 'none',
                                    fontSize: 12, fontWeight: 700, cursor: (dirty && !saving) ? 'pointer' : 'not-allowed',
                                    background: (dirty && !saving) ? 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light, var(--color-primary)))' : 'var(--bg-body)',
                                    color: (dirty && !saving) ? '#fff' : 'var(--color-text-tertiary)',
                                    boxShadow: (dirty && !saving) ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                                    transition: 'all 0.2s', opacity: (dirty && !saving) ? 1 : 0.6,
                                }}>
                                <Save size={14} /> {saving ? 'Salvando...' : 'Salvar Vistoria'}
                            </button>
                            {dirty && !saving && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--color-warning)' }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-warning)', animation: 'pulse 1.5s infinite' }} />
                                    Não salvo
                                </span>
                            )}
                        </div>
                    </div>
                </CKColCard>

                {/* Coluna 3: Laudo da Vistoria */}
                <CKColCard style={{ flex: '1 1 240px', minWidth: 220 }}>
                    <CKColHeader label="Laudo da Vistoria" right={
                        os.vistoria?.vistoriaAnexadaEm
                            ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-success)', background: 'rgba(16,185,129,0.12)', padding: '2px 8px', borderRadius: 5 }}>Anexado</span>
                            : null
                    } />
                    <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {os.vistoria?.vistoriaAnexadaEm ? (
                            <div style={{
                                padding: '12px 14px', borderRadius: 10,
                                background: 'rgba(16, 185, 129, 0.08)',
                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                marginBottom: 14,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-success)' }}>
                                        Anexada em {new Date(os.vistoria!.vistoriaAnexadaEm!).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <FileText size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                                    <span style={{ 
                                        fontSize: 11, 
                                        fontWeight: 500, 
                                        color: 'var(--color-text-secondary)', 
                                        flex: 1,
                                        minWidth: 0,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {os.vistoria!.vistoriaNomeArquivo}
                                    </span>
                                    {os.vistoria!.vistoriaUrl && (
                                        <button onClick={() => onOpenViewer(os.vistoria!.vistoriaUrl!, os.vistoria!.vistoriaNomeArquivo || 'Laudo de Vistoria')}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '4px 10px', borderRadius: 6, border: 'none',
                                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                background: 'rgba(16,185,129,0.15)', color: 'var(--color-success)',
                                                flexShrink: 0,
                                            }}>
                                            <Eye size={12} /> Ver PDF
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 14px' }}>
                                Nenhum laudo anexado. Envie o PDF abaixo.
                            </p>
                        )}



                        {/* Drag & Drop zone */}
                        <div onClick={() => { if (!vistUploading) vistFileRef.current?.click(); }}
                            style={{
                                border: '2px dashed var(--border-color)',
                                borderRadius: 10, padding: '20px 16px',
                                textAlign: 'center', cursor: vistUploading ? 'wait' : 'pointer',
                                background: 'var(--bg-body)',
                                transition: 'border-color 0.15s, background 0.15s',
                            }}
                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = 'var(--color-primary-50, rgba(245,158,11,0.06))'; }}
                            onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-body)'; }}
                            onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-body)'; const f = e.dataTransfer.files[0]; if (f) handleVistoriaUpload(f); }}>
                            {vistUploading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        border: '3px solid var(--border-color)', borderTopColor: 'var(--color-primary)',
                                        animation: 'spin 0.8s linear infinite',
                                    }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>Enviando...</span>
                                </div>
                            ) : (
                                <div>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 10,
                                        background: 'var(--color-primary-50, rgba(245,158,11,0.12))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        margin: '0 auto 8px',
                                    }}>
                                        <Upload size={18} style={{ color: 'var(--color-primary)' }} />
                                    </div>
                                    <p style={{ margin: 0, fontWeight: 700, fontSize: 12, color: 'var(--color-text-primary)' }}>
                                        Clique ou arraste o PDF
                                    </p>
                                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                                        OS #{os.numero} · {veiculo?.placa || 'Sem placa'}
                                    </p>
                                </div>
                            )}
                        </div>

                        <input type="file" ref={vistFileRef} accept=".pdf" style={{ display: 'none' }}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVistoriaUpload(f); e.target.value = ''; }} />

                        {vistUploadMsg && (
                            <div style={{
                                marginTop: 10, padding: '9px 12px', borderRadius: 8,
                                background: vistUploadMsg.includes('❌') ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                                border: `1px solid ${vistUploadMsg.includes('❌') ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                                fontSize: 12, fontWeight: 600,
                                color: vistUploadMsg.includes('❌') ? 'var(--color-danger)' : 'var(--color-success)',
                            }}>
                                {vistUploadMsg}
                            </div>
                        )}
                    </div>
                </CKColCard>

                {/* Coluna 4 (opcional): Histórico de Vistorias */}
                {os.vistoriaHistory.length > 0 && (
                    <CKColCard style={{ flex: '1 1 240px', minWidth: 220 }}>
                        <CKColHeader label="Histórico de Vistorias" right={
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-body)', color: 'var(--color-text-tertiary)', border: '1px solid var(--border-color)' }}>
                                {os.vistoriaHistory.length} tentativa{os.vistoriaHistory.length !== 1 ? 's' : ''}
                            </span>
                        } />
                        <div style={{ padding: '14px 18px 16px' }}>
                            <div style={{ position: 'relative', paddingLeft: 26 }}>
                                <div style={{ position: 'absolute', left: 9, top: 8, bottom: 8, width: 2, background: 'var(--border-color)', borderRadius: 1 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {os.vistoriaHistory.map((h, idx) => {
                                        const hInfo = statusInfo(h.status);
                                        const isLast = idx === os.vistoriaHistory.length - 1;
                                        return (
                                            <div key={h.id} style={{ position: 'relative' }}>
                                                <div style={{
                                                    position: 'absolute', left: -20, top: 9,
                                                    width: 16, height: 16, borderRadius: '50%',
                                                    background: hInfo.bg, border: `2px solid ${hInfo.color}`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                                                }}>
                                                    <span style={{ color: hInfo.color, display: 'flex', alignItems: 'center' }}>
                                                        {h.status === 'reprovada' ? <XCircle size={9} /> : h.status === 'aprovada_apontamento' ? <AlertTriangle size={9} /> : <CheckCircle size={9} />}
                                                    </span>
                                                </div>
                                                <div style={{ padding: '9px 11px', borderRadius: 8, background: isLast ? hInfo.bg : 'var(--bg-body)', border: `1px solid ${isLast ? hInfo.color + '44' : 'var(--border-color)'}` }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                                                        <span style={{ fontSize: 11, fontWeight: 700, color: hInfo.color, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                            {hInfo.label}
                                                        </span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                                                                #{os.vistoriaHistory.length - idx}ª
                                                            </span>
                                                            {(isAdmin || h.usuario === authUser?.nome) && (
                                                            <button
                                                                title="Excluir esta entrada"
                                                                onClick={async () => {
                                                                    const ok = await confirm('Excluir esta entrada do histórico?');
                                                                    if (!ok) return;
                                                                    const novoHistorico = os.vistoriaHistory.filter(x => x.id !== h.id);
                                                                    await updateOrdem(os.id, { vistoriaHistory: novoHistorico });
                                                                    onRefresh();
                                                                }}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', borderRadius: 4, opacity: 0.6 }}
                                                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-error)'; }}
                                                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-tertiary)'; }}
                                                            >
                                                                <Trash2 size={11} />
                                                            </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                                                        <Clock size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
                                                        {new Date(h.registradoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                                        {h.local && <> · <Building2 size={10} style={{ verticalAlign: -1, marginRight: 2 }} />{h.local}</>}
                                                    </div>
                                                    {h.motivo && (
                                                        <p style={{ fontSize: 11, color: 'var(--color-danger)', margin: '5px 0 0', padding: '4px 8px', borderRadius: 5, background: 'rgba(239,68,68,0.07)' }}>
                                                            <strong>Motivo:</strong> {h.motivo}
                                                        </p>
                                                    )}
                                                    {h.apontamento && (
                                                        <p style={{ fontSize: 11, color: 'var(--color-warning)', margin: '5px 0 0', padding: '4px 8px', borderRadius: 5, background: 'rgba(245,158,11,0.07)' }}>
                                                            <strong>Apontamento:</strong> {h.apontamento}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </CKColCard>
                )}
            </div>
        </div>
    );
}

// label style helper (inline to avoid repetition)
const LBL: React.CSSProperties = { display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-gray-400)', marginBottom: 3 };


// ===== DELEGACIA TAB (with SIFAP integrated) =====
function DelegaciaTab({ os, veiculo, onAdd, onEdit, onRemove, needsSifap, onRefresh }: {
    os: OrdemDeServico;
    veiculo?: Veiculo | null;
    onAdd: (e: EntradaDelegacia) => void;
    onEdit: (id: string, updated: Partial<EntradaDelegacia>) => void;
    onRemove: (id: string) => void;
    needsSifap: boolean;
    onRefresh: () => void;
}) {
    const confirm = useConfirm();
    const [showForm, setShowForm] = useState(false);
    const [tipo, setTipo] = useState<TipoEntradaDelegacia>('entrada');
    const [data, setData] = useState(new Date().toISOString().split('T')[0]!);
    const [motivoDevolucao, setMotivoDevolucao] = useState('');
    const [observacao, setObservacao] = useState('');

    // Estado de edição inline
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState('');
    const [editObs, setEditObs] = useState('');
    const [editMotivo, setEditMotivo] = useState('');

    // Responsável será sempre o usuário logado
    const responsavelLogado = getCurrentUser() || 'Sistema';

    // SIFAP state
    const [sifapData, setSifapData] = useState(os.sifap?.dataRegistro || '');
    const [sifapPlaca, setSifapPlaca] = useState(os.sifap?.novaPlaca || '');
    const [sifapDirty, setSifapDirty] = useState(false);

    // Accordion state
    const [accordionEntradas, setAccordionEntradas] = useState(true);
    const [accordionReentradas, setAccordionReentradas] = useState(true);

    const entradas = os.delegacia?.entradas || [];
    const totalEntradas = entradas.filter(e => e.tipo === 'entrada').length;
    const totalReentradas = entradas.filter(e => e.tipo === 'reentrada').length;

    const formatDateLocal = (dateStr: string) => {
        if (!dateStr || !dateStr.includes('-')) return dateStr || '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
    };

    const handleAdd = () => {
        if (tipo === 'reentrada' && !motivoDevolucao.trim()) {
            alert('Informe o motivo da devolução');
            return;
        }

        onAdd({
            id: generateId(),
            tipo,
            data,
            responsavel: responsavelLogado,
            conferido: true,
            motivoDevolucao: tipo === 'reentrada' ? motivoDevolucao.trim() : undefined,
            observacao: observacao.trim() || undefined,
            registradoEm: new Date().toISOString(),
        });

        setShowForm(false);
        setMotivoDevolucao('');
        setObservacao('');
    };

    const handleSaveSifap = async () => {
        const placaFormatada = sifapPlaca.trim().toUpperCase();
        updateOrdem(os.id, { sifap: { ...os.sifap, necessario: true, dataRegistro: sifapData, novaPlaca: placaFormatada || undefined } });

        // Se informou nova placa e tem veículo, atualizar a placa do veículo
        if (placaFormatada && veiculo) {
            const placaAnterior = veiculo.placa;
            await saveVeiculo({ ...veiculo, placa: placaFormatada });
            addAuditEntry(os.id, 'SIFAP', `SIFAP registrado em ${new Date(sifapData).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Placa alterada: ${placaAnterior || 'N/A'} → ${placaFormatada}`);
        } else {
            addAuditEntry(os.id, 'SIFAP', `SIFAP registrado em ${new Date(sifapData).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
        }

        setSifapDirty(false);
        onRefresh();
    };

    const handleCancelarSifap = async () => {
        const confirmed = await confirm('Tem certeza que deseja cancelar o registro do SIFAP?');
        if (!confirmed) return;

        await updateOrdem(os.id, { sifap: { ...os.sifap, necessario: true, dataRegistro: undefined } as any });
        await addAuditEntry(os.id, 'Cancelamento', 'Registro SIFAP cancelado');
        setSifapData('');
        setSifapDirty(false);
        onRefresh();
    };

    return (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'start' }}>

            {/* Coluna 1: Resumo */}
            <CKColCard style={{ flex: '0 0 200px', minWidth: 180 }}>
                <CKColHeader label="Resumo" />
                <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Mini-card Entradas */}
                    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <MapPin size={12} style={{ color: 'var(--color-info)' }} />
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-info)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Entradas</span>
                        </div>
                        <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text-primary)' }}>{totalEntradas}</span>
                    </div>
                    {/* Mini-card Reentradas */}
                    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <RotateCcw size={12} style={{ color: 'var(--color-warning)' }} />
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-warning)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Reentradas</span>
                        </div>
                        <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text-primary)' }}>{totalReentradas}</span>
                    </div>
                    {/* Mini-card SIFAP */}
                    <div style={{
                        padding: '12px 14px', borderRadius: 10,
                        background: needsSifap
                            ? os.sifap?.dataRegistro ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)'
                            : 'var(--bg-body)',
                        border: needsSifap && !os.sifap?.dataRegistro ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--border-color)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <div style={{
                                width: 24, height: 24, borderRadius: 6,
                                background: needsSifap ? os.sifap?.dataRegistro ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' : 'rgba(107,114,128,0.08)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <FileCheck size={12} style={{ color: needsSifap ? (os.sifap?.dataRegistro ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-text-tertiary)' }} />
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: needsSifap ? (os.sifap?.dataRegistro ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>SIFAP</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: needsSifap ? (os.sifap?.dataRegistro ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-text-tertiary)' }}>
                            {!needsSifap ? 'N/A' : os.sifap?.dataRegistro ? 'Registrado' : 'Pendente'}
                        </span>
                    </div>
                </div>
            </CKColCard>

            {/* Coluna 2: Registrar Entrada */}
            <CKColCard style={{ flex: '1 1 280px', minWidth: 240 }}>
                <CKColHeader label={`Registrar ${entradas.length > 0 ? 'Reentrada' : 'Entrada'}`} right={
                    <button
                        onClick={() => { setShowForm(!showForm); if (entradas.length > 0) setTipo('reentrada'); else setTipo('entrada'); }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '5px 12px', borderRadius: 7,
                            background: showForm ? 'var(--bg-body)' : 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                            color: showForm ? 'var(--color-text-secondary)' : 'var(--color-gray-900)',
                            border: showForm ? '1px solid var(--border-color)' : 'none',
                            cursor: 'pointer', fontWeight: 700, fontSize: 11,
                            fontFamily: 'var(--font-family)',
                        }}
                    >
                        {showForm ? <X size={12} /> : <Plus size={12} />}
                        {showForm ? 'Cancelar' : entradas.length > 0 ? 'Reentrada' : 'Entrada'}
                    </button>
                } />
                <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
                        Responsável: <strong style={{ color: 'var(--color-primary)' }}>{responsavelLogado}</strong>
                    </p>

                    {/* Formulário de nova entrada */}
                    {showForm && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeIn 0.2s ease' }}>
                            {/* Tipo toggle */}
                            <div>
                                <label style={LBL}>Tipo</label>
                                <div style={{ display: 'flex', borderRadius: 9, overflow: 'hidden', border: '1.5px solid var(--border-color)', background: 'var(--bg-body)' }}>
                                    {(['entrada', 'reentrada', 'sifap', 'requerimento'] as const).map(t => {
                                        const label = t === 'entrada' ? 'Entrada' : t === 'sifap' ? 'SIFAP' : t === 'requerimento' ? 'Requerimento' : 'Reentrada';
                                        const activeColor = t === 'entrada' ? 'var(--color-info)' : t === 'sifap' ? 'var(--color-success-bright)' : t === 'requerimento' ? 'var(--color-purple)' : 'var(--color-warning)';
                                        const activeBg = t === 'entrada' ? 'rgba(59,130,246,0.15)' : t === 'sifap' ? 'rgba(34,197,94,0.15)' : t === 'requerimento' ? 'rgba(139,92,246,0.15)' : 'rgba(245,158,11,0.15)';
                                        return (
                                        <button key={t} type="button" onClick={() => setTipo(t)}
                                            style={{
                                                flex: 1, padding: '7px 8px', fontSize: 11, fontWeight: tipo === t ? 700 : 500,
                                                border: 'none', cursor: 'pointer', fontFamily: 'var(--font-family)',
                                                background: tipo === t ? activeBg : 'transparent',
                                                color: tipo === t ? activeColor : 'var(--color-text-tertiary)',
                                                transition: 'all 0.15s ease',
                                            }}
                                        >
                                            {label}
                                        </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <label style={LBL}><Calendar size={10} style={{ verticalAlign: -1, marginRight: 3 }} />Data da {tipo === 'entrada' ? 'Entrada' : tipo === 'sifap' ? 'SIFAP' : tipo === 'requerimento' ? 'Requerimento' : 'Reentrada'}</label>
                                <input type="date" className="form-input" value={data} onChange={(e) => setData(e.target.value)} style={{ fontSize: 13 }} />
                            </div>

                            {tipo === 'reentrada' && (
                                <div>
                                    <label style={{ ...LBL, color: 'var(--color-warning)' }}><AlertTriangle size={10} style={{ verticalAlign: -1, marginRight: 3 }} />Motivo da Devolução *</label>
                                    <textarea className="form-textarea" value={motivoDevolucao} onChange={(e) => setMotivoDevolucao(e.target.value)}
                                        placeholder="Descreva o motivo da devolução..."
                                        style={{ minHeight: 56, fontSize: 13, resize: 'vertical' }} />
                                </div>
                            )}

                            <div>
                                <label style={LBL}>Observação</label>
                                <textarea className="form-textarea" value={observacao} onChange={(e) => setObservacao(e.target.value)}
                                    placeholder="Anotação opcional..."
                                    style={{ minHeight: 44, fontSize: 13, resize: 'vertical' }} />
                            </div>

                            <button type="button" onClick={handleAdd}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                                    padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                                    background: tipo === 'entrada' ? 'linear-gradient(135deg, var(--color-info), var(--color-info-hover))'
                                        : tipo === 'sifap' ? 'linear-gradient(135deg, var(--color-success-bright), var(--color-success-dark))' : 'linear-gradient(135deg, var(--color-warning), var(--color-yellow-alt))',
                                    color: 'var(--color-white)', fontWeight: 700, fontSize: 13,
                                    fontFamily: 'var(--font-family)',
                                    boxShadow: tipo === 'entrada' ? '0 3px 10px rgba(59,130,246,0.3)'
                                        : tipo === 'sifap' ? '0 3px 10px rgba(34,197,94,0.3)' : '0 3px 10px rgba(245,158,11,0.3)',
                                }}
                            >
                                <Save size={13} /> Confirmar {tipo === 'entrada' ? 'Entrada' : tipo === 'sifap' ? 'SIFAP' : tipo === 'requerimento' ? 'Requerimento' : 'Reentrada'}
                            </button>
                        </div>
                    )}

                    {/* SIFAP inline */}
                    {needsSifap && entradas.length > 0 && (
                        <div style={{
                            padding: '14px 16px', borderRadius: 10,
                            background: os.sifap?.dataRegistro ? 'rgba(34,197,94,0.05)' : 'rgba(245,158,11,0.05)',
                            border: os.sifap?.dataRegistro ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(245,158,11,0.2)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <FileCheck size={13} style={{ color: os.sifap?.dataRegistro ? 'var(--color-success-bright)' : 'var(--color-warning)' }} /> SIFAP
                                </span>
                                {os.sifap?.dataRegistro && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 15, background: 'rgba(34,197,94,0.12)', color: 'var(--color-success-bright)', fontSize: 10, fontWeight: 700 }}>
                                        <CheckCircle size={11} /> Registrado
                                    </span>
                                )}
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 10px' }}>
                                Obrigatório para {os.tipoServico === 'primeiro_emplacamento' ? 'primeiro emplacamento' : 'troca de placa'}.
                            </p>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 140px' }}>
                                    <label style={LBL}>Data do Registro</label>
                                    <input type="date" className="form-input" value={sifapData}
                                        onChange={(e) => { setSifapData(e.target.value); setSifapDirty(true); }}
                                        style={{ fontSize: 13 }} />
                                </div>
                                <div style={{ flex: '1 1 140px' }}>
                                    <label style={LBL}>Nova Placa do Veículo</label>
                                    <input type="text" className="form-input" value={sifapPlaca}
                                        onChange={(e) => { setSifapPlaca(e.target.value.toUpperCase()); setSifapDirty(true); }}
                                        placeholder={veiculo?.placa || 'ABC1D23'}
                                        maxLength={7}
                                        style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }} />
                                </div>
                                <button className="btn btn-primary btn-sm" onClick={handleSaveSifap} disabled={!sifapDirty} style={{ borderRadius: 8, padding: '8px 14px' }}>
                                    <Save size={12} /> Salvar
                                </button>
                            </div>
                            {os.sifap?.dataRegistro && !sifapDirty && (
                                <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 11, color: 'var(--color-success-bright)', fontWeight: 600 }}>
                                        Registrado em {formatDateLocal(os.sifap.dataRegistro)}
                                    </span>
                                    <button onClick={handleCancelarSifap}
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: 'var(--color-danger)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)' }}>
                                        <XCircle size={11} /> Cancelar
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {needsSifap && entradas.length === 0 && (
                        <div style={{ padding: '12px 14px', borderRadius: 9, background: 'var(--bg-body)', border: '1px dashed var(--border-color)', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FileCheck size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>SIFAP disponível após registrar a primeira entrada.</p>
                        </div>
                    )}
                </div>
            </CKColCard>

            {/* Coluna 3: Histórico de Entradas */}
            <CKColCard style={{ flex: '1 1 280px', minWidth: 240 }}>
                <CKColHeader label="Histórico" right={
                    entradas.length > 0 ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(245,158,11,0.12)', color: 'var(--color-primary)' }}>{entradas.length}</span>
                    ) : null
                } />
                <div style={{ padding: '14px 18px 16px', maxHeight: 480, overflowY: 'auto' }}>

                {entradas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: 12,
                            background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 12px',
                        }}>
                            <MapPin size={20} style={{ color: 'var(--color-gray-500)' }} />
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-gray-400)', margin: '0 0 4px' }}>Nenhuma entrada</p>
                        <p style={{ fontSize: 11, color: 'var(--color-gray-500)', margin: 0 }}>Registre a primeira entrada na delegacia.</p>
                    </div>
                ) : (() => {
                    const entradasFiltradas = entradas.filter(e => e.tipo === 'entrada');
                    const reentradas = entradas.filter(e => e.tipo === 'reentrada' || e.tipo === 'sifap' || e.tipo === 'requerimento');
                    const renderEntry = (e: EntradaDelegacia, idx: number) => {
                            const isEntrada = e.tipo === 'entrada';
                            const isSifap = e.tipo === 'sifap';
                            const isRequerimento = e.tipo === 'requerimento';
                            const accentColor = isEntrada ? 'var(--color-info)' : isSifap ? 'var(--color-success-bright)' : isRequerimento ? 'var(--color-purple)' : 'var(--color-warning)';
                            const isEditing = editingId === e.id;

                            return (
                                <div key={e.id} style={{
                                    background: isEditing ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                                    borderRadius: 10, padding: '12px 14px',
                                    borderLeft: `4px solid ${accentColor}`,
                                    border: `1px solid ${isEditing ? accentColor : 'var(--border-color)'}`,
                                    borderLeftWidth: 4, borderLeftColor: accentColor,
                                    position: 'relative',
                                    transition: 'all 0.15s ease',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                            padding: '3px 10px', borderRadius: 6,
                                            background: isEntrada ? 'rgba(59,130,246,0.1)' : isSifap ? 'rgba(34,197,94,0.1)' : isRequerimento ? 'rgba(139,92,246,0.1)' : 'rgba(245,158,11,0.1)',
                                            color: accentColor, fontSize: 11, fontWeight: 700,
                                        }}>
                                            {isEntrada ? <MapPin size={11} /> : isSifap ? <FileCheck size={11} /> : isRequerimento ? <FileText size={11} /> : <RotateCcw size={11} />}
                                            {isEntrada ? 'Entrada' : isSifap ? 'SIFAP' : isRequerimento ? 'Requerimento' : 'Reentrada'}
                                        </span>
                                        <div style={{ display: 'flex', gap: 2 }}>
                                            {!isEditing && (
                                                <button onClick={() => {
                                                    setEditingId(e.id);
                                                    setEditData(e.data);
                                                    setEditObs(e.observacao || '');
                                                    setEditMotivo(e.motivoDevolucao || '');
                                                }} title="Editar"
                                                    style={{
                                                        padding: 4, borderRadius: 6, border: 'none', cursor: 'pointer',
                                                        background: 'transparent', color: 'var(--color-gray-500)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        transition: 'all 0.15s ease',
                                                        fontFamily: 'var(--font-family)',
                                                    }}
                                                    onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(59,130,246,0.1)'; ev.currentTarget.style.color = 'var(--color-info)'; }}
                                                    onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = 'var(--color-gray-500)'; }}
                                                >
                                                    <Edit2 size={12} />
                                                </button>
                                            )}
                                            <button onClick={() => onRemove(e.id)} title="Remover"
                                                style={{
                                                    padding: 4, borderRadius: 6, border: 'none', cursor: 'pointer',
                                                    background: 'transparent', color: 'var(--color-gray-500)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    transition: 'all 0.15s ease',
                                                    fontFamily: 'var(--font-family)',
                                                }}
                                                onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(239,68,68,0.1)'; ev.currentTarget.style.color = 'var(--color-danger)'; }}
                                                onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = 'var(--color-gray-500)'; }}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {isEditing ? (
                                        /* ===== Modo edição ===== */
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--color-gray-400)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Data</label>
                                                <input type="date" className="form-input" value={editData}
                                                    onChange={(ev) => setEditData(ev.target.value)}
                                                    style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6 }} />
                                            </div>
                                            {e.tipo === 'reentrada' && (
                                                <div>
                                                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--color-warning)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Motivo da Devolução</label>
                                                    <textarea className="form-textarea" value={editMotivo}
                                                        onChange={(ev) => setEditMotivo(ev.target.value)}
                                                        style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, minHeight: 40, resize: 'vertical' }} />
                                                </div>
                                            )}
                                            <div>
                                                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--color-gray-400)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Observação</label>
                                                <textarea className="form-textarea" value={editObs}
                                                    onChange={(ev) => setEditObs(ev.target.value)}
                                                    placeholder="Anotação opcional..."
                                                    style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, minHeight: 36, resize: 'vertical' }} />
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                                                <button onClick={() => {
                                                    onEdit(e.id, {
                                                        data: editData,
                                                        observacao: editObs.trim() || undefined,
                                                        motivoDevolucao: e.tipo === 'reentrada' ? editMotivo.trim() || undefined : undefined,
                                                    });
                                                    setEditingId(null);
                                                }}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 4,
                                                        padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                                        background: accentColor, color: 'var(--color-white)',
                                                        fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-family)',
                                                    }}>
                                                    <Save size={11} /> Salvar
                                                </button>
                                                <button onClick={() => setEditingId(null)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 4,
                                                        padding: '5px 12px', borderRadius: 6,
                                                        border: '1px solid var(--border-color)', background: 'transparent',
                                                        color: 'var(--color-gray-500)', cursor: 'pointer',
                                                        fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-family)',
                                                    }}>
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* ===== Modo visualização ===== */
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--color-gray-500)', marginBottom: e.motivoDevolucao || e.observacao ? 8 : 0 }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Calendar size={11} /> {formatDateLocal(e.data)}
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <User size={11} /> {e.responsavel}
                                                </span>
                                            </div>

                                            {e.motivoDevolucao && (
                                                <div style={{
                                                    marginTop: 6, padding: '6px 10px', borderRadius: 6,
                                                    background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.1)',
                                                    fontSize: 11, color: 'var(--color-warning)',
                                                }}>
                                                    <strong>Motivo:</strong> {e.motivoDevolucao}
                                                </div>
                                            )}
                                            {e.observacao && (
                                                <p style={{ fontSize: 11, color: 'var(--color-gray-500)', margin: '6px 0 0', fontStyle: 'italic' }}>
                                                    {e.observacao}
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                    };
                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {/* Seção Entradas */}
                            {entradasFiltradas.length > 0 && (
                                <div>
                                    <button onClick={() => setAccordionEntradas(v => !v)} style={{
                                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '8px 10px', borderRadius: 8,
                                        background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                                        cursor: 'pointer', marginBottom: accordionEntradas ? 8 : 0,
                                        fontFamily: 'var(--font-family)',
                                    }}>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <MapPin size={12} style={{ color: 'var(--color-info)' }} /> Entradas
                                            <span style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--color-info)', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{entradasFiltradas.length}</span>
                                        </span>
                                        {accordionEntradas ? <ChevronUp size={14} style={{ color: 'var(--color-text-tertiary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--color-text-tertiary)' }} />}
                                    </button>
                                    {accordionEntradas && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {entradasFiltradas.map((e, idx) => renderEntry(e, idx))}
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* Seção Reentradas / SIFAP */}
                            {reentradas.length > 0 && (
                                <div>
                                    <button onClick={() => setAccordionReentradas(v => !v)} style={{
                                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '8px 10px', borderRadius: 8,
                                        background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                                        cursor: 'pointer', marginBottom: accordionReentradas ? 8 : 0,
                                        fontFamily: 'var(--font-family)',
                                    }}>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <RotateCcw size={12} style={{ color: 'var(--color-warning)' }} /> Reentradas / SIFAP / Requerimento
                                            <span style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--color-warning)', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{reentradas.length}</span>
                                        </span>
                                        {accordionReentradas ? <ChevronUp size={14} style={{ color: 'var(--color-text-tertiary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--color-text-tertiary)' }} />}
                                    </button>
                                    {accordionReentradas && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {reentradas.map((e, idx) => renderEntry(e, idx))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })()}
                </div>
            </CKColCard>
        </div>
    );
}





// ===== ENTREGA TAB (Doc Pronto + Upload Doc Final + Entrega) =====
// ===== CONSULTA CRLV DIGITAL =====
function CrlvDigitalPanel({ cliente, veiculo, os }: { cliente: any; veiculo: any; os: any }) {
    const cpfCnpj = cliente?.cpfCnpj?.replace(/\D/g, '') || '';
    const placa = veiculo?.placa || '';
    const renavam = veiculo?.renavam?.replace(/\D/g, '') || '';
    // CRV = renavam com zeros à esquerda até 13 dígitos
    const crv = renavam ? renavam.padStart(13, '0') : '';

    return (
        <CKColCard>
            <CKColHeader label="Consultar CRLV Digital" right={
                <button
                    onClick={() => {
                        const params = new URLSearchParams();
                        if (cpfCnpj) params.set('matilde_cpfCnpj', cpfCnpj);
                        if (placa) params.set('matilde_placa', placa);
                        if (renavam) params.set('matilde_renavam', renavam);
                        if (crv) params.set('matilde_crv', crv);
                        if (os.id) params.set('matilde_osId', os.id);
                        const query = params.toString();
                        window.open(`https://cidadao.mg.gov.br/#/egov/servicos/veiculo-condutor/crlv-digital${query ? '?' + query : ''}`, '_blank');
                    }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(135deg, var(--color-info), var(--color-info-hover))',
                        color: 'var(--color-white)', fontWeight: 700, fontSize: 11,
                        fontFamily: 'var(--font-family)',
                        boxShadow: '0 2px 6px rgba(59,130,246,0.3)',
                    }}
                >
                    <ExternalLink size={12} /> Consultar CRLV
                </button>
            } />
            <div style={{ padding: '12px 18px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                Verifique se a documentação do veículo está OK no portal MG antes de realizar a entrega.
            </div>
        </CKColCard>
    );
}

// ===== DOC PRONTO TAB =====
function DocProntoTab({ os, onRefresh, onOpenViewer, bloqueadoPorDebito = false, valorPendente = 0 }: {
    os: OrdemDeServico;
    onRefresh: () => void;
    onOpenViewer: (url: string, title: string) => void;
    bloqueadoPorDebito?: boolean;
    valorPendente?: number;
}) {
    const confirm = useConfirm();
    const [uploading, setUploading] = useState(false);
    const [uploadMsg, setUploadMsg] = useState<string | null>(null);
    const docFileRef = useRef<HTMLInputElement>(null);

    const [veiculo, setVeiculo] = useState<any>(null);
    const [cliente, setCliente] = useState<any>(null);
    const [validacaoCrlv, setValidacaoCrlv] = useState<ResultadoValidacao | null>(null);
    const [validando, setValidando] = useState(false);
    const validarFileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        getVeiculo(os.veiculoId).then(setVeiculo);
        getCliente(os.clienteId).then(setCliente);
    }, [os.veiculoId, os.clienteId]);

    const isDocPronto = (!!os.docProntoEm || os.status === 'doc_pronto' || os.status === 'entregue') && os.status !== 'delegacia';
    const isEntregue = !!os.entregueEm && !!os.entregueParaNome;

    // Listener para mensagens da extensão Chrome
    const crlvFileInputRef = useRef<HTMLInputElement>(null);
    const [crlvAutoAttach, setCrlvAutoAttach] = useState(false);

    useEffect(() => {
        const handleExtensionMessage = async (event: MessageEvent) => {
            if (event.data?.source !== 'MATILDE_EXTENSION') return;

            if (event.data?.type === 'CRLV_DOWNLOAD_COMPLETE') {
                const payload = event.data.payload;
                if (payload?.osId && payload.osId !== os.id) return;
                setCrlvAutoAttach(true);
                setUploadMsg(`📥 CRLV baixado: ${payload?.filename || 'documento'}. Selecione o arquivo para anexar.`);
                setTimeout(() => {
                    crlvFileInputRef.current?.click();
                }, 500);
                return;
            }

            if (event.data?.type !== 'CRLV_CONSULTA_RESULTADO') return;

            const payload = event.data.payload;
            if (payload?.osId && payload.osId !== os.id) return;

            setValidando(true);
            try {
                if (payload?.dadosCrlv && Object.keys(payload.dadosCrlv).length > 0) {
                    const resultado = validarCrlv(payload.dadosCrlv, {
                        clienteNome: cliente?.nome || '',
                        clienteCpfCnpj: cliente?.cpfCnpj || '',
                        veiculoPlaca: veiculo?.placa || '',
                        dataInicioProcesso: os.criadoEm,
                    });
                    const placaCrlv = (payload.dadosCrlv.placa || '').replace(/[\s-]/g, '').toUpperCase();
                    const placaAtual = (veiculo?.placa || '').replace(/[\s-]/g, '').toUpperCase();
                    if (placaCrlv && placaAtual && placaCrlv !== placaAtual) {
                        try {
                            const { saveVeiculo } = await import('../lib/storage');
                            if (veiculo) {
                                await saveVeiculo({ ...veiculo, placa: placaCrlv });
                                await addAuditEntry(os.id, 'Placa Atualizada', `Placa alterada de ${placaAtual} para ${placaCrlv} (Mercosul) conforme CRLV.`);
                                resultado.itens = resultado.itens.map(item =>
                                    item.campo === 'Placa' ? { ...item, ok: true, recebido: placaCrlv, detalhe: `Placa atualizada: ${placaAtual} → ${placaCrlv}` } : item
                                );
                                resultado.aprovado = resultado.itens.every(i => i.ok);
                            }
                        } catch (e) {
                            console.error('Erro ao atualizar placa:', e);
                        }
                    }

                    setValidacaoCrlv(resultado);

                    if (resultado.aprovado && !isDocPronto) {
                        const now = new Date().toISOString();
                        await updateOrdem(os.id, { docProntoEm: now, status: 'doc_pronto' });
                        await addAuditEntry(os.id, 'Validação CRLV', 'Documento validado automaticamente pela extensão — marcado como PRONTO');
                    }
                }

                if (payload?.pdfBase64 && !os.docFinalUrl) {
                    try {
                        const res = await fetch(payload.pdfBase64);
                        const blob = await res.blob();
                        const relVeiculo = veiculo?.placa || veiculo?.chassi || veiculo?.id;
                        const docName = payload.pdfNome || `DOC_FINAL_OS_${os.numero}_${relVeiculo}.pdf`;
                        const file = new File([blob], docName, { type: 'application/pdf' });

                        const { uploadFileToSupabase } = await import('../lib/supabaseStorage');
                        const path = `os_${os.numero}/docFinal/${docName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
                        const publicUrl = await uploadFileToSupabase(file, path);

                        await updateOrdem(os.id, {
                            docFinalAnexadoEm: new Date().toISOString(),
                            docFinalNome: docName,
                            docFinalUrl: publicUrl,
                        });
                        await addAuditEntry(os.id, 'Doc. Pronto', `Documento final auto-anexado pela extensão: ${docName}`);
                        setUploadMsg('✅ PDF do CRLV capturado e anexado automaticamente!');
                    } catch (upErr: any) {
                        console.error('Erro ao auto-anexar PDF:', upErr);
                        setUploadMsg(`⚠️ PDF baixado mas erro ao anexar: ${upErr?.message}`);
                    }
                }

                onRefresh();
            } finally {
                setValidando(false);
            }
        };

        window.addEventListener('message', handleExtensionMessage);
        return () => window.removeEventListener('message', handleExtensionMessage);
    }, [os.id, os.criadoEm, cliente, veiculo, isDocPronto]);

    const handleValidarManual = async (file: File) => {
        setValidando(true);
        try {
            const { extractVehicleData } = await import('../lib/pdfParser');
            const dados = await extractVehicleData(file);

            const dadosCrlv: DadosCrlv = {
                placa: dados.placa,
                nome: dados.nomeProprietario || dados.nomeAdquirente,
                cpfCnpj: dados.cpfCnpj || dados.cpfCnpjAdquirente,
                data: dados.dataEmissao,
                renavam: dados.renavam,
            };

            const resultado = validarCrlv(dadosCrlv, {
                clienteNome: cliente?.nome || '',
                clienteCpfCnpj: cliente?.cpfCnpj || '',
                veiculoPlaca: veiculo?.placa || '',
                dataInicioProcesso: os.criadoEm,
            });

            const placaCrlv = (dadosCrlv.placa || '').replace(/[\s-]/g, '').toUpperCase();
            const placaAtual = (veiculo?.placa || '').replace(/[\s-]/g, '').toUpperCase();
            if (placaCrlv && placaAtual && placaCrlv !== placaAtual) {
                try {
                    const { saveVeiculo } = await import('../lib/storage');
                    if (veiculo) {
                        await saveVeiculo({ ...veiculo, placa: placaCrlv });
                        await addAuditEntry(os.id, 'Placa Atualizada', `Placa alterada de ${placaAtual} para ${placaCrlv} (Mercosul) conforme CRLV.`);
                        resultado.itens = resultado.itens.map(item =>
                            item.campo === 'Placa' ? { ...item, ok: true, recebido: placaCrlv, detalhe: `Placa atualizada: ${placaAtual} → ${placaCrlv}` } : item
                        );
                        resultado.aprovado = resultado.itens.every(i => i.ok);
                    }
                } catch (e) {
                    console.error('Erro ao atualizar placa:', e);
                }
            }

            setValidacaoCrlv(resultado);

            if (resultado.aprovado && !isDocPronto) {
                const now = new Date().toISOString();
                await updateOrdem(os.id, { docProntoEm: now, status: 'doc_pronto' });
                await addAuditEntry(os.id, 'Validação CRLV', 'Documento validado manualmente — marcado como PRONTO');
                onRefresh();
            }
        } catch (e) {
            console.error('Erro ao validar PDF:', e);
        } finally {
            setValidando(false);
        }
    };

    const handleDocPronto = async () => {
        const now = new Date().toISOString();
        await updateOrdem(os.id, { docProntoEm: now, status: 'doc_pronto' });
        await addAuditEntry(os.id, 'Doc. Pronto', 'Documento marcado como PRONTO');
        onRefresh();
    };

    const handleCancelarDocPronto = async () => {
        const confirmed = await confirm('Tem certeza que deseja cancelar? O status voltará para a etapa anterior (ex: SIFAP/Delegacia).');
        if (!confirmed) return;
        await updateOrdem(os.id, {
            docProntoEm: null as any,
            status: 'delegacia',
        });
        await addAuditEntry(os.id, 'Cancelamento', 'Cancelou status de Documento Pronto');
        os.docProntoEm = undefined;
        os.status = 'delegacia';
        onRefresh();
    };

    const handleApagarDocFinal = async () => {
        const confirmed = await confirm('Tem certeza que deseja apagar o documento final? O arquivo será removido.');
        if (!confirmed) return;
        try {
            await updateOrdem(os.id, { docFinalAnexadoEm: null as any, docFinalNome: null as any, docFinalUrl: null as any });
            await addAuditEntry(os.id, 'Doc. Pronto', `Documento final removido: ${os.docFinalNome || 'sem nome'}`);
            setUploadMsg(null);
            setValidacaoCrlv(null);
            onRefresh();
        } catch (e: any) {
            console.error('Erro ao apagar doc final:', e);
        }
    };

    const handleValidarDocAnexado = async () => {
        if (!os.docFinalUrl) return;
        setValidando(true);
        try {
            const resp = await fetch(os.docFinalUrl);
            const blob = await resp.blob();
            const file = new File([blob], os.docFinalNome || 'doc.pdf', { type: 'application/pdf' });
            const { extractVehicleData } = await import('../lib/pdfParser');
            const dados = await extractVehicleData(file);
            const dadosCrlv = {
                placa: dados.placa,
                nome: dados.nomeProprietario || dados.nomeAdquirente,
                cpfCnpj: dados.cpfCnpj || dados.cpfCnpjAdquirente,
                data: dados.dataEmissao,
                renavam: dados.renavam,
            };
            const resultado = validarCrlv(dadosCrlv, {
                clienteNome: cliente?.nome || '',
                clienteCpfCnpj: cliente?.cpfCnpj || '',
                veiculoPlaca: veiculo?.placa || '',
                dataInicioProcesso: os.criadoEm,
            });
            setValidacaoCrlv(resultado);
            if (resultado.aprovado && !isDocPronto) {
                const now = new Date().toISOString();
                await updateOrdem(os.id, { docProntoEm: now, status: 'doc_pronto' });
                await addAuditEntry(os.id, 'Validação CRLV', 'Documento validado — marcado como PRONTO');
                onRefresh();
            }
        } catch (e: any) {
            console.error('Erro ao validar doc anexado:', e);
            setUploadMsg('❌ Erro ao validar: ' + (e?.message || 'Erro desconhecido'));
        } finally {
            setValidando(false);
        }
    };

    const handleUploadDocFinal = async (file: File) => {
        setUploading(true);
        setUploadMsg(null);
        try {
            const { uploadFileToSupabase } = await import('../lib/supabaseStorage');
            const relVeiculo = veiculo?.placa || veiculo?.chassi || veiculo?.id;
            const docName = `DOC_FINAL_OS_${os.numero}_${relVeiculo}.pdf`;
            const path = `os_${os.numero}/docFinal/${docName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;

            const publicUrl = await uploadFileToSupabase(file, path);
            await updateOrdem(os.id, { docFinalAnexadoEm: new Date().toISOString(), docFinalNome: docName, docFinalUrl: publicUrl });
            setUploadMsg(`✅ Documento salvo com sucesso no Supabase!`);
            await addAuditEntry(os.id, 'Doc. Pronto', `Documento final enviado: ${docName}`);

            if (crlvAutoAttach) {
                setCrlvAutoAttach(false);
                try {
                    const { extractVehicleData } = await import('../lib/pdfParser');
                    const dados = await extractVehicleData(file);
                    const dadosCrlv: DadosCrlv = {
                        placa: dados.placa,
                        nome: dados.nomeProprietario || dados.nomeAdquirente,
                        cpfCnpj: dados.cpfCnpj || dados.cpfCnpjAdquirente,
                        data: dados.dataEmissao,
                        renavam: dados.renavam,
                    };
                    const resultado = validarCrlv(dadosCrlv, {
                        clienteNome: cliente?.nome || '',
                        clienteCpfCnpj: cliente?.cpfCnpj || '',
                        veiculoPlaca: veiculo?.placa || '',
                        dataInicioProcesso: os.criadoEm,
                    });

                    const placaCrlv = (dadosCrlv.placa || '').replace(/[\s-]/g, '').toUpperCase();
                    const placaAtual = (veiculo?.placa || '').replace(/[\s-]/g, '').toUpperCase();
                    if (placaCrlv && placaAtual && placaCrlv !== placaAtual && veiculo) {
                        const { saveVeiculo } = await import('../lib/storage');
                        await saveVeiculo({ ...veiculo, placa: placaCrlv });
                        await addAuditEntry(os.id, 'Placa Atualizada', `Placa alterada de ${placaAtual} para ${placaCrlv} (Mercosul) conforme CRLV.`);
                        resultado.itens = resultado.itens.map(item =>
                            item.campo === 'Placa' ? { ...item, ok: true, recebido: placaCrlv, detalhe: `Placa atualizada: ${placaAtual} → ${placaCrlv}` } : item
                        );
                        resultado.aprovado = resultado.itens.every(i => i.ok);
                    }

                    setValidacaoCrlv(resultado);
                    if (resultado.aprovado && !isDocPronto) {
                        await updateOrdem(os.id, { docProntoEm: new Date().toISOString(), status: 'doc_pronto' });
                        await addAuditEntry(os.id, 'Validação CRLV', 'Documento validado e anexado automaticamente — marcado como PRONTO');
                    }
                } catch (valErr) {
                    console.error('Erro ao validar CRLV após upload:', valErr);
                }
            }

            onRefresh();
        } catch (e: any) {
            console.error('Erro ao enviar doc final:', e);
            setUploadMsg(`❌ Erro ao enviar: ${e?.message || 'Erro desconhecido'}`);
        } finally {
            setUploading(false);
        }
    };

    const isDocAnexado = !!os.docFinalAnexadoEm;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Colunas principais */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'start' }}>

                {/* Coluna 1: CRLV + Validação */}
                <div style={{ flex: '0 0 260px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <CrlvDigitalPanel cliente={cliente} veiculo={veiculo} os={os} />

                    <input
                        ref={validarFileRef}
                        type="file"
                        accept=".pdf"
                        hidden
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleValidarManual(f);
                            e.target.value = '';
                        }}
                    />
                    <button
                        onClick={() => validarFileRef.current?.click()}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)' }}
                    >
                        <FileSearch size={13} /> Validar CRLV (PDF)
                    </button>

                    {validando && (
                        <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-primary)', fontSize: 12, fontWeight: 600 }}>
                            Validando documento...
                        </div>
                    )}

                    {validacaoCrlv && (
                        <CKColCard>
                            <CKColHeader label="Validação do Documento" right={
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '3px 9px', borderRadius: 5,
                                    background: validacaoCrlv.aprovado ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                                    color: validacaoCrlv.aprovado ? 'var(--color-success)' : 'var(--color-danger)',
                                    fontSize: 10, fontWeight: 700,
                                }}>
                                    {validacaoCrlv.aprovado ? '✅ Aprovado' : '⚠️ Divergências'}
                                </span>
                            } />
                            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {validacaoCrlv.itens.map((item, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 12px', borderRadius: 8,
                                        background: item.ok ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                                        border: `1px solid ${item.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`,
                                    }}>
                                        <span style={{ fontSize: 16, flexShrink: 0 }}>{item.ok ? '✅' : '❌'}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)' }}>{item.campo}</div>
                                            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                                                {item.ok ? item.recebido : (
                                                    <>
                                                        <span style={{ color: 'var(--color-danger)' }}>Recebido: {item.recebido}</span>
                                                        <span style={{ margin: '0 4px' }}>•</span>
                                                        <span>Esperado: {item.esperado}</span>
                                                    </>
                                                )}
                                            </div>
                                            {item.detalhe && !item.ok && (
                                                <div style={{ fontSize: 10, color: 'var(--color-danger)', fontStyle: 'italic', marginTop: 2 }}>{item.detalhe}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {validacaoCrlv.aprovado && (
                                    <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 600, color: 'var(--color-success)', textAlign: 'center' }}>
                                        Documento validado e marcado como PRONTO automaticamente!
                                    </p>
                                )}
                            </div>
                        </CKColCard>
                    )}
                </div>

                {/* Coluna 2: Documento Pronto toggle */}
                <CKColCard style={{ flex: '1 1 280px', minWidth: 240 }}>
                    <CKColHeader label="Documento Pronto" right={
                        isDocPronto ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 5, background: 'rgba(16,185,129,0.12)', color: 'var(--color-success)', fontSize: 10, fontWeight: 700 }}>
                                <CheckCircle size={11} /> Pronto
                            </span>
                        ) : null
                    } />
                    <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
                                {isDocPronto
                                    ? `Marcado em ${new Date(os.docProntoEm || os.atualizadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
                                    : 'Marque quando o processo estiver concluído'}
                            </p>
                            {isDocPronto ? (
                                !isEntregue && (
                                    <button onClick={handleCancelarDocPronto} title="Desfazer"
                                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', background: 'rgba(239,68,68,0.06)', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-family)' }}>
                                        <XCircle size={12} /> Desfazer
                                    </button>
                                )
                            ) : (
                                <button onClick={handleDocPronto} disabled={bloqueadoPorDebito}
                                    title={bloqueadoPorDebito ? 'Pague os débitos pendentes antes de marcar como pronto' : ''}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 9, border: 'none', cursor: bloqueadoPorDebito ? 'not-allowed' : 'pointer', background: bloqueadoPorDebito ? '#555' : 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))', color: bloqueadoPorDebito ? '#999' : 'var(--color-gray-900)', fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-family)', boxShadow: bloqueadoPorDebito ? 'none' : '0 2px 8px rgba(245,158,11,0.3)', opacity: bloqueadoPorDebito ? 0.6 : 1 }}>
                                    {bloqueadoPorDebito ? <AlertTriangle size={13} /> : <CheckCircle size={13} />} {bloqueadoPorDebito ? 'Débitos Pendentes' : 'Marcar como Pronto'}
                                </button>
                            )}
                        </div>
                    </div>
                </CKColCard>

                {/* Coluna 3: Documento Final (upload) */}
                <CKColCard style={{ flex: '1 1 260px', minWidth: 240, opacity: isDocPronto ? 1 : 0.45, pointerEvents: isDocPronto ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
                    <CKColHeader label="Documento Final" right={
                        isDocAnexado ? (
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-success)', background: 'rgba(16,185,129,0.12)', padding: '2px 8px', borderRadius: 5 }}>Anexado</span>
                        ) : null
                    } />
                    <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
                            {isDocAnexado ? 'PDF do documento pronto anexado' : isDocPronto ? 'Envie o PDF do documento pronto' : 'Disponível após marcar como pronto'}
                        </p>

                    {isDocAnexado && (
                        <div style={{
                            padding: '10px 14px', borderRadius: 10,
                            background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
                            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
                        }}>
                            <FileText size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {os.docFinalNome}
                            </span>
                            {os.docFinalUrl && (
                                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                    <button onClick={() => onOpenViewer(os.docFinalUrl!, os.docFinalNome || 'Documento Final')}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            padding: '3px 8px', borderRadius: 6, border: 'none',
                                            background: 'rgba(16,185,129,0.15)', color: 'var(--color-success)',
                                            fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                            fontFamily: 'var(--font-family)',
                                        }}>
                                        <Eye size={11} /> Ver
                                    </button>
                                    <button onClick={handleValidarDocAnexado} disabled={validando}
                                        title="Validar dados do PDF"
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            padding: '3px 8px', borderRadius: 6, border: 'none',
                                            background: 'rgba(59,130,246,0.15)', color: 'var(--color-info)',
                                            fontSize: 10, fontWeight: 700, cursor: validando ? 'wait' : 'pointer',
                                            fontFamily: 'var(--font-family)',
                                            opacity: validando ? 0.6 : 1,
                                        }}>
                                        <FileSearch size={11} /> {validando ? '...' : 'Validar'}
                                    </button>
                                    <button onClick={handleApagarDocFinal}
                                        title="Apagar documento"
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            padding: '3px 8px', borderRadius: 6, border: 'none',
                                            background: 'rgba(239,68,68,0.12)', color: 'var(--color-danger)',
                                            fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                            fontFamily: 'var(--font-family)',
                                        }}>
                                        <Trash2 size={11} /> Apagar
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div onClick={() => { if (!uploading) docFileRef.current?.click(); }}
                        style={{
                            border: '2px dashed var(--border-color)',
                            borderRadius: 10, padding: '24px 16px',
                            textAlign: 'center', cursor: uploading ? 'wait' : 'pointer',
                            background: 'var(--bg-body)',
                            transition: 'border-color 0.15s, background 0.15s',
                        }}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-purple)'; e.currentTarget.style.background = 'rgba(139,92,246,0.04)'; }}
                        onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-body)'; }}
                        onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-body)'; const f = e.dataTransfer.files[0]; if (f) handleUploadDocFinal(f); }}
                    >
                        {uploading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    border: '3px solid var(--border-color)', borderTopColor: 'var(--color-purple)',
                                    animation: 'spin 0.8s linear infinite',
                                }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>Enviando...</span>
                            </div>
                        ) : (
                            <div>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 10,
                                    background: 'rgba(139,92,246,0.12)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 8px',
                                }}>
                                    <Upload size={18} style={{ color: 'var(--color-purple)' }} />
                                </div>
                                <p style={{ margin: 0, fontWeight: 700, fontSize: 12, color: 'var(--color-text-primary)' }}>
                                    {isDocAnexado ? 'Enviar novo PDF (substitui)' : 'Clique ou arraste o PDF'}
                                </p>
                                <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                                    {cliente?.nome || 'CLIENTE'} · {veiculo?.placa || veiculo?.chassi || ''}
                                </p>
                            </div>
                        )}
                    </div>

                    <input type="file" ref={docFileRef} accept=".pdf" style={{ display: 'none' }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadDocFinal(f); e.target.value = ''; }} />
                    <input type="file" ref={crlvFileInputRef} accept=".pdf" style={{ display: 'none' }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadDocFinal(f); e.target.value = ''; }} />

                    {uploadMsg && (
                        <div style={{
                            marginTop: 12, padding: '10px 14px', borderRadius: 8,
                            background: uploadMsg.includes('❌') ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                            border: `1px solid ${uploadMsg.includes('❌') ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                            fontSize: 12, fontWeight: 600,
                            color: uploadMsg.includes('❌') ? 'var(--color-danger)' : 'var(--color-success)',
                        }}>
                            {uploadMsg}
                        </div>
                    )}
                </div>

                {os.auditLog && os.auditLog.filter((log: any) => log.acao === 'Consulta CRLV').length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Consultas CRLV Realizadas</p>
                        {os.auditLog
                            .filter((log: any) => log.acao === 'Consulta CRLV')
                            .sort((a: any, b: any) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime())
                            .map((log: any) => {
                                const isOk = !log.detalhes.toLowerCase().includes('error');
                                return (
                                    <div key={log.id} style={{ padding: '9px 12px', borderRadius: 8, background: 'var(--bg-body)', border: `1px solid ${isOk ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, borderLeft: `3px solid ${isOk ? 'var(--color-success)' : 'var(--color-danger)'}` }}>
                                        <div style={{ fontSize: 10, color: 'var(--color-primary)', fontWeight: 600, marginBottom: 3 }}>
                                            {log.dataHora ? new Date(log.dataHora).toLocaleString('pt-BR') : '—'} — {log.usuario}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{log.detalhes}</div>
                                    </div>
                                );
                            })
                        }
                    </div>
                )}
            </CKColCard>
        </div>
        </div>
    );
}

// ===== ENTREGA TAB =====
function EntregaTab({ os, onRefresh, onOpenViewer: _onOpenViewer, bloqueadoPorDebito = false, valorPendente: _valorPendente = 0 }: {
    os: OrdemDeServico;
    onRefresh: () => void;
    onOpenViewer: (url: string, title: string) => void;
    bloqueadoPorDebito?: boolean;
    valorPendente?: number;
}) {
    const confirm = useConfirm();
    const [nomeRetirada, setNomeRetirada] = useState(os.entregueParaNome || '');
    const [placaTrocada, setPlacaTrocada] = useState(false);

    const isDocPronto = (!!os.docProntoEm || os.status === 'doc_pronto' || os.status === 'entregue') && os.status !== 'delegacia';
    const isEntregue = !!os.entregueEm && !!os.entregueParaNome;
    const checklistComplete = Array.isArray(os.checklist) && os.checklist.length > 0
        ? os.checklist.every((item: any) => item.status === 'recebido' || item.status === 'nao_se_aplica')
        : false;

    const handleEntrega = async () => {
        if (!nomeRetirada.trim()) {
            alert('Informe o nome de quem está retirando o documento.');
            return;
        }
        if (os.trocaPlaca && !placaTrocada) {
            alert('Confirme que a troca da placa foi realizada fisicamente na estamparia.');
            return;
        }
        const now = new Date().toISOString();
        await updateOrdem(os.id, {
            entregueEm: now,
            entregueParaNome: nomeRetirada.trim(),
            status: 'entregue',
        });
        await addAuditEntry(os.id, 'Entrega', `Documento entregue para: ${nomeRetirada.trim()}`);
        onRefresh();
    };

    const handleCancelarEntrega = async () => {
        const confirmed = await confirm('Tem certeza que deseja cancelar esta entrega? O status voltará para "Doc. Pronto".');
        if (!confirmed) return;
        await updateOrdem(os.id, {
            entregueEm: null as any,
            entregueParaNome: null as any,
            status: 'doc_pronto',
        });
        await addAuditEntry(os.id, 'Entrega Cancelada', `Entrega cancelada (era: ${os.entregueParaNome || '—'})`);
        setNomeRetirada('');
        os.entregueEm = undefined;
        os.entregueParaNome = undefined;
        os.status = 'doc_pronto';
        onRefresh();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Status header */}
            <CKColCard>
                <CKColHeader label="Entrega ao Cliente" right={
                    isEntregue ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#10B981', background: 'rgba(16,185,129,0.12)', padding: '3px 10px', borderRadius: 5 }}>
                            <CheckCircle size={11} /> Entregue
                        </span>
                    ) : isDocPronto ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', background: 'rgba(245,158,11,0.12)', padding: '3px 10px', borderRadius: 5 }}>
                            <CheckCircle size={11} /> Doc. Pronto
                        </span>
                    ) : null
                } />
                <div style={{ padding: '14px 18px 16px' }}>
                    <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
                        {isEntregue
                            ? `Entregue para ${os.entregueParaNome || '—'}`
                            : isDocPronto
                            ? 'Documento pronto — confirme a entrega ao cliente'
                            : 'Aguardando documento ser marcado como pronto na aba Doc. Pronto'}
                    </p>
                </div>
            </CKColCard>

            {/* Entrega ao Cliente */}
            <CKColCard style={{ opacity: isDocPronto ? 1 : 0.45, pointerEvents: isDocPronto ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
                <CKColHeader label="Confirmação de Entrega" right={
                    isEntregue ? (
                        <button onClick={handleCancelarEntrega} title="Cancelar entrega"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)' }}>
                            <XCircle size={11} /> Cancelar Entrega
                        </button>
                    ) : null
                } />
                <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {isEntregue ? (
                        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <UserCheck size={17} style={{ color: '#10B981' }} />
                            </div>
                            <div>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{os.entregueParaNome}</span>
                                <span style={{ fontSize: 11, color: '#10B981', display: 'block', fontWeight: 500 }}>
                                    Retirou em {new Date(os.entregueEm!).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {os.trocaPlaca && (
                                <div style={{ padding: '10px 14px', background: 'rgba(59,130,246,0.06)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <input type="checkbox" id="chk-placa" checked={placaTrocada} onChange={(e) => setPlacaTrocada(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#3b82f6' }} />
                                    <label htmlFor="chk-placa" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', cursor: 'pointer', margin: 0, userSelect: 'none' }}>
                                        Confirmo que a nova placa foi instalada fisicamente no veículo
                                    </label>
                                </div>
                            )}
                            {(() => {
                                const prereqs = [
                                    { label: 'Sem débitos pendentes', ok: !bloqueadoPorDebito },
                                    { label: 'Checklist completo', ok: checklistComplete },
                                    { label: 'PDF final anexado', ok: !!os.docFinalUrl },
                                    { label: 'Nome de retirada preenchido', ok: !!nomeRetirada.trim() },
                                    ...(os.trocaPlaca ? [{ label: 'Troca de placa confirmada', ok: placaTrocada }] : []),
                                ];
                                const allOk = prereqs.every(p => p.ok);
                                return (
                                    <div style={{ padding: '10px 12px', borderRadius: 9, background: allOk ? 'rgba(16,185,129,0.05)' : 'rgba(245,158,11,0.05)', border: `1px solid ${allOk ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
                                        <p style={{ margin: '0 0 7px', fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pré-requisitos</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {prereqs.map(p => (
                                                <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontSize: 12 }}>{p.ok ? '✅' : '⚠️'}</span>
                                                    <span style={{ fontSize: 11, fontWeight: p.ok ? 500 : 600, color: p.ok ? 'var(--color-text-secondary)' : 'var(--color-primary)' }}>{p.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={LBL}><User size={10} style={{ verticalAlign: -1, marginRight: 3 }} />Nome de quem retirou *</label>
                                    <input type="text" className="form-input" value={nomeRetirada} onChange={(e) => setNomeRetirada(e.target.value)} placeholder="Nome completo" style={{ fontSize: 13 }} />
                                </div>
                                <button onClick={handleEntrega} disabled={!nomeRetirada.trim() || (os.trocaPlaca && !placaTrocada)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: 'none',
                                        cursor: (nomeRetirada.trim() && (!os.trocaPlaca || placaTrocada)) ? 'pointer' : 'not-allowed',
                                        background: (nomeRetirada.trim() && (!os.trocaPlaca || placaTrocada)) ? 'linear-gradient(135deg, #10B981, #059669)' : 'var(--border-color)',
                                        color: (nomeRetirada.trim() && (!os.trocaPlaca || placaTrocada)) ? '#fff' : 'var(--color-text-tertiary)',
                                        fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-family)',
                                        boxShadow: (nomeRetirada.trim() && (!os.trocaPlaca || placaTrocada)) ? '0 2px 8px rgba(16,185,129,0.3)' : 'none',
                                        transition: 'all 0.2s',
                                    }}>
                                    <Package size={13} /> Confirmar Entrega
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </CKColCard>
        </div>
    );
}


// ===== COMUNICAÇÃO TAB =====
function ComunicacaoTab({ os, onAdd, onRemove }: {
    os: OrdemDeServico;
    onAdd: (c: Comunicacao) => void;
    onRemove: (id: string) => void;
}) {
    const { usuario: authUser } = useAuth();
    const [showForm, setShowForm] = useState(false);
    const [canal, setCanal] = useState('WhatsApp');
    const [mensagem, setMensagem] = useState('');
    const [observacao, setObservacao] = useState('');

    const handleAdd = () => {
        if (!mensagem.trim()) {
            alert('Selecione ou escreva a mensagem');
            return;
        }
        onAdd({
            id: generateId(),
            data: new Date().toISOString(),
            canal,
            mensagem: mensagem.trim(),
            observacao: observacao.trim() || undefined,
            usuario: authUser?.nome,
        });
        setShowForm(false);
        setMensagem('');
        setObservacao('');
    };

    return (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'start' }}>

            {/* Coluna 1: Lista de comunicações */}
            <CKColCard style={{ flex: '1 1 300px', minWidth: 260 }}>
                <CKColHeader label="Comunicações" right={
                    <button onClick={() => setShowForm(!showForm)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7,
                            background: showForm ? 'var(--bg-body)' : 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                            color: showForm ? 'var(--color-text-secondary)' : 'var(--color-gray-900)',
                            border: showForm ? '1px solid var(--border-color)' : 'none',
                            cursor: 'pointer', fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-family)',
                        }}>
                        {showForm ? <X size={12} /> : <Plus size={12} />}
                        {showForm ? 'Cancelar' : 'Nova Mensagem'}
                    </button>
                } />
                <div style={{ padding: '14px 18px 16px' }}>
                    {os.comunicacoes.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                            <MessageSquare size={32} style={{ color: 'var(--color-text-tertiary)', opacity: 0.25, marginBottom: 10 }} />
                            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>Nenhuma comunicação registrada.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[...os.comunicacoes].reverse().map((c) => (
                                <div key={c.id} style={{
                                    padding: '12px 14px', borderRadius: 10,
                                    background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 5 }}>
                                                {c.canal}
                                            </span>
                                            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                                                {new Date(c.data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <button onClick={() => onRemove(c.id)} title="Remover"
                                            style={{ padding: 4, borderRadius: 5, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', fontFamily: 'var(--font-family)' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{c.mensagem}</p>
                                    {c.observacao && <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '4px 0 0', fontStyle: 'italic' }}>{c.observacao}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </CKColCard>

            {/* Coluna 2: Formulário de nova mensagem */}
            {showForm && (
                <CKColCard style={{ flex: '1 1 280px', minWidth: 240 }}>
                    <CKColHeader label="Nova Mensagem" />
                    <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                            <label style={LBL}>Canal</label>
                            <select className="form-select" value={canal} onChange={(e) => setCanal(e.target.value)} style={{ fontSize: 13 }}>
                                {CANAIS_COMUNICACAO.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={LBL}>Mensagem Padrão</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {MENSAGENS_PADRAO.map((msg) => (
                                    <button key={msg} type="button" onClick={() => setMensagem(msg)}
                                        style={{
                                            padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                            background: mensagem === msg ? 'var(--color-primary)' : 'var(--bg-body)',
                                            color: mensagem === msg ? 'var(--color-gray-900)' : 'var(--color-text-secondary)',
                                            outline: mensagem === msg ? 'none' : '1px solid var(--border-color)',
                                            fontFamily: 'var(--font-family)', transition: 'all 0.15s',
                                        }}>
                                        {msg}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label style={LBL}>Ou escreva a mensagem</label>
                            <textarea className="form-textarea" value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Mensagem personalizada..." style={{ fontSize: 13, minHeight: 72 }} />
                        </div>

                        <div>
                            <label style={LBL}>Observação</label>
                            <input type="text" className="form-input" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex: cliente confirma recebimento" style={{ fontSize: 13 }} />
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" onClick={handleAdd}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))', color: 'var(--color-gray-900)', fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-family)', boxShadow: '0 2px 8px rgba(245,158,11,0.25)' }}>
                                <Save size={13} /> Confirmar Registro
                            </button>
                            <button type="button" onClick={() => setShowForm(false)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--border-color)', cursor: 'pointer', background: 'var(--bg-body)', color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: 12, fontFamily: 'var(--font-family)' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </CKColCard>
            )}
        </div>
    );
}

// ===== HISTÓRICO TAB =====
function historicoIconConfig(acao: string): { Icon: React.ElementType; color: string; bg: string } {
    const a = acao.toLowerCase();
    if (a.includes('checklist'))
        return { Icon: ClipboardCheck, color: 'var(--color-success)', bg: 'rgba(16,185,129,0.1)' };
    if (a.includes('vistoria'))
        return { Icon: Eye, color: 'var(--color-info)', bg: 'rgba(59,130,246,0.1)' };
    if (a.includes('delegacia'))
        return { Icon: Shield, color: 'var(--color-purple)', bg: 'rgba(139,92,246,0.1)' };
    if (a.includes('entrega') || a.includes('entregue') || a.includes('pronto'))
        return { Icon: Package, color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)' };
    if (a.includes('comunicação') || a.includes('comunicacao') || a.includes('mensagem'))
        return { Icon: MessageSquare, color: 'var(--color-cyan)', bg: 'rgba(6,182,212,0.1)' };
    if (a.includes('e-mail') || a.includes('email') || a.includes('boleto') || a.includes('placa'))
        return { Icon: Send, color: 'var(--color-pink)', bg: 'rgba(236,72,153,0.1)' };
    return { Icon: Clock, color: 'var(--color-neutral)', bg: 'rgba(107,114,128,0.1)' };
}

function HistoricoTab({ os }: { os: OrdemDeServico }) {
    const entries = [...(os.auditLog || [])].reverse();

    return (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'start' }}>
            <CKColCard style={{ flex: '1 1 420px' }}>
                <CKColHeader label="Linha do Tempo" right={
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-body)', color: 'var(--color-text-tertiary)', border: '1px solid var(--border-color)' }}>
                        {entries.length} evento{entries.length !== 1 ? 's' : ''}
                    </span>
                } />
                <div style={{ padding: '16px 20px' }}>
                    {entries.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-body)', borderRadius: 12, border: '1px dashed var(--border-color)' }}>
                            <History size={40} style={{ color: 'var(--color-text-tertiary)', opacity: 0.2, marginBottom: 12 }} />
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Nenhum registro de atividade encontrado.</p>
                        </div>
                    ) : (
                        <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', left: 17, top: 10, bottom: 10, width: 2, background: 'var(--border-color)', opacity: 0.5, borderRadius: 1 }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                                {entries.map((entry) => {
                                    const { Icon, color, bg } = historicoIconConfig(entry.acao);
                                    const date = new Date(entry.dataHora);
                                    return (
                                        <div key={entry.id} style={{ display: 'flex', gap: 16, position: 'relative' }}>
                                            <div style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: 'var(--bg-card)', border: `2px solid ${color}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                zIndex: 2, flexShrink: 0, boxShadow: `0 0 8px ${bg}`,
                                            }}>
                                                <Icon size={15} color={color} strokeWidth={2.5} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                                                    borderRadius: 11, padding: '13px 16px', transition: 'all 0.2s ease',
                                                }}
                                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = color; }}
                                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: entry.detalhes ? 8 : 0 }}>
                                                        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', flex: 1 }}>
                                                            {entry.acao}
                                                        </h4>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 15, fontSize: 10, fontWeight: 700, background: bg, color, border: `1px solid ${color}33` }}>
                                                            <User size={10} strokeWidth={3} /> {entry.usuario}
                                                        </span>
                                                    </div>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: entry.detalhes ? 8 : 0 }}>
                                                        <Clock size={10} />
                                                        {date.toLocaleDateString('pt-BR')} às {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {entry.detalhes && (
                                                        <div style={{ padding: '9px 12px', background: 'var(--bg-body)', borderRadius: 7, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, borderLeft: `3px solid ${color}` }}>
                                                            {entry.detalhes}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </CKColCard>
        </div>
    );
}

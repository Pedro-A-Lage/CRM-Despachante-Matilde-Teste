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
    FileSearch,
    Phone,
    Mail
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
    generateId,
} from '../lib/database';
import { getCurrentUser } from '../lib/auth';
import { temPermissao } from '../lib/permissions';
import { useConfirm } from '../components/ConfirmProvider';
import { DocumentViewer } from '../components/DocumentViewer';
import {
    STATUS_OS_LABELS,
    STATUS_VISTORIA_LABELS,
    CANAIS_COMUNICACAO,
    MENSAGENS_PADRAO,
} from '../types';
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
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
import { getChargesByOS, getPaymentsByOS, marcarCustoPago, cancelarCobrancasDaOS, getPriceByCodigo, updateCharge } from '../lib/financeService';
import { EmpresaEnviosSection } from '../components/EmpresaEnviosSection';
import { getEmpresa, getEmpresasAtivas, criarEnviosStatusFromEtapas } from '../lib/empresaService';
import type { EmpresaParceira } from '../types/empresa';

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

type TabId = 'checklist' | 'vistoria' | 'delegacia' | 'doc_pronto' | 'comunicacao' | 'historico' | 'placa' | 'financeiro' | 'empresa';

function statusToTab(status?: string): TabId {
    switch (status) {
        case 'vistoria': return 'vistoria';
        case 'delegacia': return 'delegacia';
        case 'doc_pronto':
        case 'entregue': return 'doc_pronto';
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
            const { addAuditEntry } = await import('../lib/database');
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
                <div className="os-header-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
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

                    <div className="os-header-aside" style={{ width: 250, borderLeft: '1px solid var(--border-color)', paddingLeft: 'var(--space-5)' }}>
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
                                            const { uploadFileToSupabase } = await import('../lib/fileStorage');
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
    const serviceLabels = useServiceLabels();
    const [os, setOs] = useState<OrdemDeServico | null>(null);
    const [cliente, setCliente] = useState<any>(null);
    const [veiculo, setVeiculo] = useState<any>(null);
    const [empresa, setEmpresa] = useState<EmpresaParceira | null>(null);
    const [empresasAtivas, setEmpresasAtivas] = useState<EmpresaParceira[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>('checklist');
    const [pageDirty, setPageDirty] = useState(false);
    const { usuario } = useAuth();
    const confirm = useConfirm();

    // ── Permissões do usuário
    const podeVerCustos = temPermissao(usuario, 'os', 'ver_custos');
    const podeVerHonorarios = temPermissao(usuario, 'os', 'ver_honorarios');
    const podeVerValorServico = temPermissao(usuario, 'os', 'ver_valor_servico');
    const podeReceberPagamento = temPermissao(usuario, 'os', 'receber_pagamento');
    const podeEditarStatus = temPermissao(usuario, 'os', 'editar_status');
    const podeEditarChecklist = temPermissao(usuario, 'os', 'editar_checklist');
    const podeEditarVistoria = temPermissao(usuario, 'os', 'editar_vistoria');
    const podeEditarDelegacia = temPermissao(usuario, 'os', 'editar_delegacia');
    const podeExcluirOs = temPermissao(usuario, 'os', 'excluir_os');

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
            if (ordem.empresaParceiraId) {
                getEmpresa(ordem.empresaParceiraId).then(setEmpresa);
            }
            getEmpresasAtivas().then(setEmpresasAtivas);
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
            // OS de empresa parceira: financeiro nunca bloqueia
            setTemDebitosPendentes(faltaReceber > 0 && valorServico > 0 && !ordem.empresaParceiraId);
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
                const charges = await getChargesByOS(os.id);
                const activeCharges = charges.filter(c => c.status !== 'cancelado');
                const temPago = activeCharges.some(c => c.status === 'pago');

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
                if (activeCharges.length > 0) {
                    await cancelarCobrancasDaOS(os.id);
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
                await gerarCobrancasIniciais(os.id, editTipoServico, os.tipoVeiculo ?? 'carro', os.trocaPlaca ?? false, false, empresa?.valorPlaca ?? undefined);
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
        { id: 'empresa' as TabId, label: empresa?.nome || 'Empresa', icon: <Building2 size={16} /> },
    ].filter(t => {
        if (t.id === 'placa' && !os.trocaPlaca) return false;
        if (t.id === 'empresa' && !os.empresaParceiraId) return false;
        // Ocultar financeiro de OS de empresa para funcionários
        if (t.id === 'financeiro' && os.empresaParceiraId && usuario?.role !== 'admin') return false;
        return true;
    })
;

    return (
        <div style={{ overflowX: 'hidden' }}>
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
                                    {Object.entries(serviceLabels).map(([k, v]) => (
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
                            <div className="grid os-form-row-2" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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

            {/* ===== TOP BAR (compact) ===== */}
            <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: 10, padding: '8px 14px', marginBottom: 8,
                borderLeft: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => navigate(-1)} style={{
                        background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                        borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--color-text-secondary)',
                        display: 'flex', alignItems: 'center', transition: 'all 0.2s',
                    }}>
                        <ArrowLeft size={16} />
                    </button>
                    <h1 style={{ margin: 0, fontSize: 18, fontWeight: 850, color: 'var(--color-primary)', letterSpacing: '-0.5px' }}>
                        OS #{os.numero}
                    </h1>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                        {getServicoLabel(serviceLabels, os.tipoServico)}
                    </span>
                    <div style={{ height: 16, width: 1, background: 'var(--border-color)', margin: '0 2px' }} />
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                        {new Date(os.dataAbertura).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </span>
                    {os.docProntoEm && (
                        <>
                            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>→</span>
                            <span style={{ fontSize: 10, color: 'var(--color-success)', fontWeight: 700 }}>
                                {new Date(os.docProntoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                            </span>
                        </>
                    )}
                    {os.entregueEm && (
                        <>
                            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>→</span>
                            <span style={{ fontSize: 10, color: 'var(--color-info)', fontWeight: 700 }}>
                                {new Date(os.entregueEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                            </span>
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="file" accept=".pdf" id="upload-pdf-detran-header" style={{ display: 'none' }}
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                                const { uploadFileToSupabase } = await import('../lib/fileStorage');
                                const path = `ordens/${os.id}/pdf_detran_${Date.now()}.pdf`;
                                const publicUrl = await uploadFileToSupabase(file, path);
                                await updateOrdem(os.id, { pdfDetranUrl: publicUrl });
                                await addAuditEntry(os.id, 'PDF Detran Anexado', 'Folha de cadastro do Detran anexada manualmente.');
                                refresh();
                            } catch (err) { console.error('Erro ao anexar PDF:', err); }
                            e.target.value = '';
                        }}
                    />
                    {!os.entregueEm && (
                        os.pdfDetranUrl ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button
                                    onClick={() => window.open(os.pdfDetranUrl, '_blank')}
                                    style={{
                                        padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                        background: 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: 10,
                                        display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase',
                                    }}
                                >
                                    <FileText size={11} /> PDF
                                </button>
                                <label htmlFor="upload-pdf-detran-header" style={{
                                    padding: '4px 8px', borderRadius: 8, cursor: 'pointer',
                                    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                                    color: 'var(--color-purple, #6366f1)', fontWeight: 800, fontSize: 10,
                                    display: 'flex', alignItems: 'center', gap: 3, textTransform: 'uppercase',
                                }}>
                                    <Upload size={9} /> Trocar
                                </label>
                            </div>
                        ) : (
                            <label htmlFor="upload-pdf-detran-header" style={{
                                padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
                                color: 'var(--color-danger)', fontWeight: 800, fontSize: 10,
                                display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase',
                            }}>
                                <Upload size={11} /> Anexar PDF
                            </label>
                        )
                    )}

                    <div style={{ position: 'relative' }}>
                        <select
                            className="form-select"
                            style={{
                                width: 170, maxWidth: '100%', fontSize: 11, padding: '6px 10px', borderRadius: 8,
                                fontWeight: 750, fontFamily: 'var(--font-family)', textTransform: 'uppercase',
                                background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                                appearance: 'none', cursor: 'pointer', transition: 'all 0.2s',
                            }}
                            value={os.status}
                            disabled={!podeEditarStatus}
                            onChange={(e) => updateStatus(e.target.value as StatusOS)}
                        >
                            {Object.entries(STATUS_OS_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-tertiary)' }} />
                    </div>

                    <div style={{ height: 20, width: 1, background: 'var(--border-color)', margin: '0 2px' }} />

                    <button onClick={handleOpenEditModal} title="Editar OS"
                        style={{
                            width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-color)',
                            background: 'var(--bg-body)', cursor: 'pointer', color: 'var(--color-text-secondary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                        }}>
                        <Edit2 size={14} />
                    </button>
                    {podeExcluirOs && (
                    <button onClick={handleDelete} title="Apagar OS"
                        style={{
                            width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
                            background: 'rgba(239,68,68,0.06)', cursor: 'pointer', color: 'var(--color-danger)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                        }}>
                        <Trash2 size={14} />
                    </button>
                    )}
                </div>
            </div>

            {/* ===== TWO COLUMN LAYOUT ===== */}
            <div className="os-main-row" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', width: '100%', flexWrap: 'wrap' }}>

                {/* ===== LEFT COLUMN (main content) ===== */}
                <div style={{ flex: 1, minWidth: 0 }}>

                    {/* ===== CONFERÊNCIA DE DADOS ===== */}
                    <ConferenciaDados os={os} cliente={cliente} veiculo={veiculo} />

                    {/* ===== BARRA DE OBSERVAÇÃO / PENDÊNCIA ===== */}
                    <ObservacaoPendenciaBar os={os} onRefresh={refresh} />

                    {/* Tabs */}
                    <div className="tabs" style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flex: 1, gap: 0, overflow: 'hidden' }}>
                            {tabs.map((tab) => {
                                const isFinanceiroComDebito = tab.id === 'financeiro' && temDebitosPendentes;
                                return (
                                    <button
                                        key={tab.id}
                                        className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                                        onClick={() => handleTabSwitch(tab.id)}
                                        style={isFinanceiroComDebito ? { color: 'var(--color-danger)', fontWeight: 700 } : undefined}
                                    >
                                        {tab.icon}
                                        {tab.label}
                                        {isFinanceiroComDebito && (
                                            <span style={{ fontSize: 9, marginLeft: 4, background: 'rgba(239,68,68,0.15)', color: 'var(--color-danger)', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>
                                                Pendente
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            className={`tab ${activeTab === 'historico' ? 'active' : ''}`}
                            onClick={() => handleTabSwitch('historico')}
                            title="Histórico"
                            style={{ flexShrink: 0, padding: '6px 8px' }}
                        >
                            <History size={16} />
                        </button>
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
                        {activeTab === 'comunicacao' && (
                            <ComunicacaoTab os={os} onAdd={addComunicacao} onRemove={async (id: string) => {
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
                        {activeTab === 'empresa' && empresa && os.enviosStatus && (
                            <div style={{ padding: '4px 0' }}>
                                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span
                                            style={{
                                                width: 10, height: 10, borderRadius: '50%',
                                                backgroundColor: empresa.cor, display: 'inline-block',
                                                boxShadow: `0 0 8px ${empresa.cor}50`,
                                            }}
                                        />
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                            {empresa.nome}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-text-secondary)', alignItems: 'center' }}>
                                        {usuario?.role === 'admin' && (
                                            <>
                                                <span>Serviço: <strong style={{ color: 'var(--color-primary)' }}>R$ {empresa.valorServico?.toFixed(2) || '—'}</strong></span>
                                                {empresa.valorPlaca != null && (
                                                    <span>Placa: <strong style={{ color: 'var(--color-primary)' }}>R$ {empresa.valorPlaca.toFixed(2)}</strong></span>
                                                )}
                                            </>
                                        )}
                                        {/* Nota Fiscal */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>NF:</span>
                                            <input
                                                type="text"
                                                value={os.empresaFinanceiro?.numero_nf || ''}
                                                placeholder="—"
                                                onChange={async (e) => {
                                                    const nf = e.target.value;
                                                    const newFin = { ...(os.empresaFinanceiro || { recebido: false }), numero_nf: nf };
                                                    await updateOrdem(os.id, { empresaFinanceiro: newFin });
                                                    setOs({ ...os, empresaFinanceiro: newFin });
                                                }}
                                                style={{
                                                    background: 'rgba(255,255,255,0.06)',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    borderRadius: 4, padding: '2px 8px',
                                                    fontSize: 12, color: '#d4a843', fontWeight: 600,
                                                    width: 80, outline: 'none',
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <EmpresaEnviosSection
                                    empresa={empresa}
                                    enviosStatus={os.enviosStatus}
                                    osNumero={os.numero}
                                    osId={os.id}
                                    placa={veiculo?.placa || ''}
                                    onUpdate={async (envios) => {
                                        await updateOrdem(os.id, { enviosStatus: envios });
                                        setOs({ ...os, enviosStatus: envios });
                                    }}
                                />
                            </div>
                        )}
                        {activeTab === 'financeiro' && (
                            <FinancePainel
                                osId={os.id}
                                valorServico={podeVerValorServico ? (os.valorServico ?? 0) : 0}
                                trocaPlaca={os.trocaPlaca ?? false}
                                tipoVeiculo={os.tipoVeiculo ?? 'carro'}
                                tipoServico={os.tipoServico}
                                userRole={usuario?.role ?? 'funcionario'}
                                readOnly={!podeReceberPagamento}
                                ocultarCustos={!podeVerCustos}
                                ocultarHonorarios={!podeVerHonorarios}
                                onValorServicoChange={podeVerValorServico ? async (novoValor) => {
                                    await saveOrdem({ id: os.id, clienteId: os.clienteId, veiculoId: os.veiculoId, tipoServico: os.tipoServico, valorServico: novoValor });
                                    setOs({ ...os, valorServico: novoValor });
                                } : undefined}
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

                {/* ===== RIGHT SIDEBAR ===== */}
                <div className="os-vehicle-sticky" style={{ width: 300, maxWidth: 300, flexShrink: 0, position: 'sticky', top: 80, alignSelf: 'flex-start', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10 }}>

                    {/* ══ RESUMO DO CLIENTE ══ */}
                    <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '14px', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--color-text-tertiary)' }}>
                                Resumo do Cliente
                            </span>
                            <button onClick={handleOpenFullEditCliente} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', opacity: 0.7 }}>
                                <Edit2 size={12} />
                            </button>
                        </div>
                        {cliente ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {/* Avatar + Nome */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                                        background: 'var(--color-primary)', color: '#fff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 800, fontSize: 14, letterSpacing: 0.5,
                                    }}>
                                        {cliente.nome.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
                                    </div>
                                    <Link to={`/clientes/${cliente.id}`} style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-primary)', textDecoration: 'none', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                                        {cliente.nome}
                                    </Link>
                                </div>
                                {/* Dados */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <User size={12} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                                        <span style={{ color: 'var(--color-text-tertiary)' }}>{cliente.cpfCnpj && cliente.cpfCnpj.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF'}</span>
                                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginLeft: 'auto' }}>{cliente.cpfCnpj || '—'}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Phone size={12} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                                        <span style={{ color: 'var(--color-text-tertiary)' }}>Telefone</span>
                                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginLeft: 'auto' }}>
                                            {cliente.telefones?.filter((t: string) => t.trim())[0] || '—'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Mail size={12} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                                        <span style={{ color: 'var(--color-text-tertiary)' }}>E-mail</span>
                                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                                            {cliente.email || '—'}
                                        </span>
                                    </div>
                                </div>
                                {/* Botões WhatsApp / Ligar */}
                                {cliente.telefones?.filter((t: string) => t.trim())[0] && (
                                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                        <a
                                            href={`https://wa.me/55${(cliente.telefones[0] || '').replace(/\D/g, '')}`}
                                            target="_blank" rel="noopener noreferrer"
                                            style={{
                                                flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                                                background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 11,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                                textDecoration: 'none',
                                            }}
                                        >
                                            <MessageSquare size={12} /> WhatsApp
                                        </a>
                                        <a
                                            href={`tel:${(cliente.telefones[0] || '').replace(/\D/g, '')}`}
                                            style={{
                                                flex: 1, padding: '6px 0', borderRadius: 8, cursor: 'pointer',
                                                background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
                                                color: 'var(--color-info)', fontWeight: 700, fontSize: 11,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                                textDecoration: 'none',
                                            }}
                                        >
                                            <Phone size={12} /> Ligar
                                        </a>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-tertiary)' }}>—</span>
                        )}
                    </div>

                    {/* ══ DADOS DO VEÍCULO ══ */}
                    <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '14px', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--color-text-tertiary)' }}>
                                Dados do Veículo
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div
                                    style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: os.tipoServico === 'primeiro_emplacamento' ? 'default' : 'pointer', opacity: os.tipoServico === 'primeiro_emplacamento' ? 0.5 : 1 }}
                                    onClick={async () => {
                                        if (os.tipoServico === 'primeiro_emplacamento') return;
                                        const newVal = !os.trocaPlaca;
                                        await updateOrdem(os.id, { trocaPlaca: newVal });
                                        // Regenerar checklist de envio da empresa se vinculada
                                        if (os.empresaParceiraId && empresa) {
                                            const novosEnvios = criarEnviosStatusFromEtapas(empresa.etapasEnvio, newVal);
                                            await updateOrdem(os.id, { enviosStatus: novosEnvios });
                                        }
                                        if (!newVal && activeTab === 'placa') setActiveTab('checklist');
                                        refresh();
                                    }}
                                    title={os.trocaPlaca ? 'Clique para manter placa' : 'Clique para trocar placa'}
                                >
                                    <span style={{ fontSize: 9, fontWeight: 800, color: os.trocaPlaca ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}>
                                        {os.trocaPlaca ? 'TROCA' : 'MANTER'}
                                    </span>
                                    <div style={{ width: 22, height: 11, borderRadius: 6, backgroundColor: os.trocaPlaca ? 'var(--color-primary)' : 'var(--color-text-tertiary)', position: 'relative' }}>
                                        <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: 2, left: os.trocaPlaca ? 13 : 2, transition: 'left 0.2s' }} />
                                    </div>
                                </div>
                                <button onClick={handleOpenFullEditVeiculo} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', opacity: 0.7 }}>
                                    <Edit2 size={12} />
                                </button>
                            </div>
                        </div>
                        {veiculo ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                                {/* Placa — detecta formato Mercosul vs Antiga */}
                                {(() => {
                                    const p = (veiculo.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
                                    // Antiga: 3 letras + 4 números (ex: ABC1234)
                                    const isAntiga = /^[A-Z]{3}\d{4}$/.test(p);
                                    const placaFormatada = veiculo.placa
                                        ? (isAntiga ? `${p.slice(0,3)}-${p.slice(3)}` : p)
                                        : 'SEM PLACA';

                                    return (
                                        <Link to={`/veiculos/${veiculo.id}/editar`} style={{ textDecoration: 'none', width: '100%', maxWidth: 200 }}>
                                            <div style={{
                                                background: isAntiga ? '#c0c0c0' : '#fff',
                                                borderRadius: 8, border: `3px solid ${isAntiga ? '#555' : '#1a1a2e'}`,
                                                textAlign: 'center', overflow: 'hidden',
                                            }}>
                                                <div style={{
                                                    background: isAntiga ? 'linear-gradient(135deg, #555, #777)' : 'linear-gradient(135deg, #003399, #0055aa)',
                                                    color: '#fff', fontSize: 8, fontWeight: 800, letterSpacing: 2,
                                                    padding: '3px 0', textTransform: 'uppercase',
                                                }}>
                                                    BRASIL
                                                </div>
                                                <div style={{
                                                    fontSize: 22, fontWeight: 900,
                                                    color: isAntiga ? '#333' : '#1a1a2e',
                                                    padding: '6px 0 4px', letterSpacing: 3, fontFamily: 'monospace',
                                                }}>
                                                    {placaFormatada}
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })()}
                                {/* Marca/Modelo */}
                                <div style={{
                                    background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
                                    borderRadius: 8, padding: '6px 12px', width: '100%', textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Marca/Modelo</div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{veiculo.marcaModelo || '—'}</div>
                                </div>
                                {/* Chassi e Renavam */}
                                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--color-text-tertiary)' }}>Chassi</span>
                                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: 10.5, fontFamily: 'monospace' }}>{veiculo.chassi || '—'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--color-text-tertiary)' }}>Renavam</span>
                                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{veiculo.renavam || '—'}</span>
                                    </div>
                                </div>
                                {/* Recibo — só transferência */}
                                {os.tipoServico === 'transferencia' && (
                                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, cursor: 'pointer' }} onClick={handleOpenFullEditVeiculo}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <FileText size={10} style={{ color: veiculo?.dataAquisicao ? 'var(--color-primary)' : 'var(--color-danger)' }} />
                                            <span style={{ color: veiculo?.dataAquisicao ? 'var(--color-text-tertiary)' : 'var(--color-danger)' }}>Recibo</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontWeight: 600, fontFamily: 'monospace', color: veiculo?.dataAquisicao ? 'var(--color-text-primary)' : 'var(--color-danger)' }}>
                                                {veiculo?.dataAquisicao
                                                    ? (veiculo.dataAquisicao.includes('T')
                                                        ? new Date(veiculo.dataAquisicao).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                                                        : veiculo.dataAquisicao.split('-').reverse().join('/'))
                                                    : 'Não informado'}
                                            </span>
                                            {(() => {
                                                const recStatus = getReceiptStatus(veiculo?.dataAquisicao);
                                                if (!recStatus || recStatus.status === 'ok') return null;
                                                return (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 2,
                                                        color: recStatus.status === 'expired' ? 'var(--color-danger)' : 'var(--color-warning)',
                                                    }}>
                                                        <AlertTriangle size={9} />
                                                        {recStatus.label}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-tertiary)' }}>Sem Veículo</span>
                        )}
                    </div>

                    {/* ══ EMPRESA PARCEIRA ══ */}
                    <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                            <Building2 size={12} style={{ color: 'var(--color-primary)' }} />
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--color-text-tertiary)' }}>
                                Empresa Parceira
                            </span>
                        </div>
                        <select
                            value={os.empresaParceiraId || ''}
                            onChange={async (e) => {
                                const newId = e.target.value || null;
                                const emp = newId ? empresasAtivas.find((e) => e.id === newId) : null;
                                const envios = emp ? criarEnviosStatusFromEtapas(emp.etapasEnvio, os.trocaPlaca ?? false) : null;

                                // Atualizar valor da placa nas cobranças + calcular valorServico
                                let novoValorServico = os.valorServico;
                                try {
                                    const charges = await getChargesByOS(os.id);
                                    const placaCharge = charges.find((c) => c.categoria === 'placa' && c.status !== 'cancelado');
                                    if (placaCharge) {
                                        if (emp?.valorPlaca != null) {
                                            await updateCharge(placaCharge.id, { valor_previsto: emp.valorPlaca });
                                        } else if (!newId) {
                                            const { getPriceByCodigo } = await import('../lib/financeService');
                                            const codigo = (os.tipoVeiculo ?? 'carro') === 'moto' ? 'placa_moto_mercosul' : 'placa_carro_mercosul';
                                            const valorOriginal = await getPriceByCodigo(codigo);
                                            await updateCharge(placaCharge.id, { valor_previsto: valorOriginal });
                                        }
                                    }

                                    if (emp) {
                                        // Vinculando: valorServico = custos + honorário da empresa
                                        // Recarregar charges após atualização da placa
                                        const updatedCharges = await getChargesByOS(os.id);
                                        const totalCustos = updatedCharges
                                            .filter((c) => c.status !== 'cancelado')
                                            .reduce((sum, c) => sum + Number(c.valor_previsto), 0);
                                        novoValorServico = totalCustos + (emp.valorServico ?? 0);
                                    } else {
                                        // Desvinculando: restaurar valor original da tabela
                                        try {
                                            const { getServicePrice } = await import('../lib/financeService');
                                            novoValorServico = await getServicePrice(os.tipoServico, os.tipoVeiculo ?? 'carro', os.trocaPlaca ?? false);
                                        } catch {}
                                    }
                                } catch (err) {
                                    console.warn('Erro ao atualizar valores:', err);
                                }

                                await updateOrdem(os.id, {
                                    empresaParceiraId: newId || undefined,
                                    enviosStatus: envios || undefined,
                                    empresaValoresOverride: undefined,
                                    empresaFinanceiro: newId ? os.empresaFinanceiro : undefined,
                                    valorServico: novoValorServico,
                                });

                                setOs({
                                    ...os,
                                    empresaParceiraId: newId || undefined,
                                    enviosStatus: envios || undefined,
                                    empresaValoresOverride: undefined,
                                    empresaFinanceiro: newId ? os.empresaFinanceiro : undefined,
                                    valorServico: novoValorServico,
                                });
                                setEmpresa(emp || null);
                            }}
                            style={{
                                width: '100%',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8,
                                padding: '8px 10px',
                                fontSize: 12,
                                color: '#e2e8f0',
                                outline: 'none',
                            }}
                        >
                            <option value="" style={{ background: '#1e2130' }}>Nenhuma (particular)</option>
                            {empresasAtivas.map((emp) => (
                                <option key={emp.id} value={emp.id} style={{ background: '#1e2130' }}>{emp.nome}</option>
                            ))}
                        </select>
                        {empresa && (
                            <div style={{ marginTop: 8 }}>
                                {usuario?.role === 'admin' && (
                                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', gap: 12, marginBottom: 6 }}>
                                        <span>Serviço: <strong style={{ color: 'var(--color-primary)' }}>R$ {empresa.valorServico?.toFixed(2) || '—'}</strong></span>
                                        {empresa.valorPlaca != null && (
                                            <span>Placa: <strong style={{ color: 'var(--color-primary)' }}>R$ {empresa.valorPlaca.toFixed(2)}</strong></span>
                                        )}
                                    </div>
                                )}
                                <button
                                    onClick={async () => {
                                        try {
                                            // Atualizar valor da placa nas cobranças
                                            if (empresa.valorPlaca != null) {
                                                const charges = await getChargesByOS(os.id);
                                                const placaCharge = charges.find((c) => c.categoria === 'placa' && c.status !== 'cancelado');
                                                if (placaCharge) {
                                                    await updateCharge(placaCharge.id, { valor_previsto: empresa.valorPlaca });
                                                }
                                            }
                                            // Recalcular valorServico = custos + honorário
                                            const updatedCharges = await getChargesByOS(os.id);
                                            const totalCustos = updatedCharges
                                                .filter((c) => c.status !== 'cancelado')
                                                .reduce((sum, c) => sum + Number(c.valor_previsto), 0);
                                            const novoValor = totalCustos + (empresa.valorServico ?? 0);
                                            await updateOrdem(os.id, { valorServico: novoValor });
                                            setOs({ ...os, valorServico: novoValor });
                                            refresh();
                                        } catch (err) {
                                            console.error('[Empresa] Erro ao aplicar valores:', err);
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: '#d4a843',
                                        background: 'rgba(212,168,67,0.1)',
                                        border: '1px solid rgba(212,168,67,0.25)',
                                        borderRadius: 6,
                                        padding: '5px 0',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Aplicar valor de placa da empresa
                                </button>
                            </div>
                        )}
                    </div>

                </div>{/* end sidebar */}
            </div>{/* end two-column layout */}
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
        // Recibo: validação exibida diretamente no card de Dados do Veículo
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
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '10px',
            boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                    width: 26, height: 26, borderRadius: 6,
                    background: isError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <AlertTriangle size={14} style={{ color: isError ? 'var(--color-danger)' : 'var(--color-warning)' }} />
                </div>
                <div>
                    <h4 style={{ margin: 0, fontSize: 11, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                        Conferência de Dados
                    </h4>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: isError ? 'var(--color-danger)' : 'var(--color-warning)', opacity: 0.9 }}>
                        {erros.length > 0 && `${erros.length} problema${erros.length > 1 ? 's' : ''} crítico${erros.length > 1 ? 's' : ''}`}
                        {erros.length > 0 && avisos.length > 0 && ' • '}
                        {avisos.length > 0 && `${avisos.length} aviso${avisos.length > 1 ? 's' : ''} de atenção`}
                    </p>
                </div>
            </div>

            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
                gap: '4px 16px',
                paddingTop: '2px'
            }}>
                {problemas.map((p, i) => (
                    <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '3px 0'
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
                            fontSize: 11, fontWeight: 600,
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
        borderRadius: '10px',
        border: `1px solid ${isChanged ? baseColor : 'var(--border-color)'}`,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s ease',
        boxShadow: isChanged ? `0 0 0 2px ${baseColor}22` : 'none',
    });

    const iconBoxStyle = (bgColor: string, iconColor: string): React.CSSProperties => ({
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
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
        <div style={{ marginBottom: 10 }}>
            {/* Pendência / Impedimento */}
            <div style={cardStyle('var(--color-danger)', pendEditing || confirmingResolve)}>
                <div style={iconBoxStyle(hasPend ? 'rgba(239,68,68,0.12)' : 'rgba(107,114,128,0.1)', hasPend ? 'var(--color-danger)' : 'var(--color-text-tertiary)')}>
                    <AlertTriangle size={13} color={hasPend ? 'var(--color-danger)' : 'var(--color-text-tertiary)'} strokeWidth={2.5} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <label style={{
                        fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: hasPend ? 'var(--color-danger)' : 'var(--color-text-tertiary)'
                    }}>
                        Pendência / Impedimento
                    </label>

                    {/* Modo leitura: mostra texto + botões Editar / Resolvida */}
                    {hasPend && !pendEditing && !confirmingResolve && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-danger)' }}>
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
                                fontSize: 12, fontWeight: 700,
                                color: pend ? 'var(--color-danger)' : 'var(--color-text-primary)',
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
                            style={btnStyle('rgba(16,185,129,0.1)', 'var(--color-success)', '1px solid rgba(16,185,129,0.3)')}>
                            <CheckCircle size={12} /> Resolvida
                        </button>
                    </div>
                )}

                {/* Botões modo edição: Salvar + Cancelar */}
                {pendEditing && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={savePend} disabled={pendSaving || !pendChanged}
                            style={btnStyle(pendChanged ? 'var(--color-danger)' : 'var(--color-text-tertiary)', '#fff')}>
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
                            style={btnStyle('var(--color-success)', '#fff')}>
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
        borderRadius: 10,
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
        padding: '9px 14px 8px',
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

            const { uploadFileToSupabase } = await import('../lib/fileStorage');

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 900 }}>

            {/* ===== SUMMARY BAR (top) ===== */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                background: 'var(--bg-body)', borderRadius: 10, padding: '10px 16px',
                border: '1px solid var(--border-color)',
            }}>
                <div style={{ width: 120, height: 5, borderRadius: 3, background: 'rgba(128,128,128,0.15)', overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${progressPercent}%`, background: checklistComplete ? 'var(--color-success)' : 'var(--color-primary)', transition: 'width 0.5s ease' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: checklistComplete ? 'var(--color-success)' : 'var(--color-primary)' }}>{progressPercent}%</span>
                {checklistComplete && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 3 }}><CheckCircle size={11} strokeWidth={3} /> COMPLETO</span>}
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 11, opacity: 0.4 }}>|</span>
                {[
                    { label: 'recebidos', value: recebidos, color: 'var(--color-success)' },
                    { label: 'pendentes', value: pendentes, color: 'var(--color-warning)' },
                    { label: 'invalidos', value: invalidos, color: 'var(--color-danger)' },
                    { label: 'n/a', value: naoAplica, color: 'var(--color-neutral)' },
                ].map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                            <span style={{ fontWeight: 700, color: s.value > 0 ? s.color : 'var(--color-text-secondary)' }}>{s.value}</span> {s.label}
                        </span>
                    </div>
                ))}
                {cliente && (
                    <>
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: 11, opacity: 0.4 }}>|</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <User size={12} style={{ color: 'var(--color-info)', opacity: 0.7 }} />
                            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{cliente.nome}</span>
                            {docsCliente.filter(d => d.arquivo).length > 0 && <span style={{ fontSize: 10, color: 'var(--color-success)', fontWeight: 700 }}>({docsCliente.filter(d => d.arquivo).length} docs)</span>}
                        </div>
                    </>
                )}
            </div>

            {/* ===== CLIENT DOCS (compact chips) ===== */}
            {docsCliente.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '6px 12px', background: 'rgba(59,130,246,0.04)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.1)' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-info)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>Docs Cliente:</span>
                    {docsCliente.map(doc => (
                        <span key={doc.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: 'rgba(128,128,128,0.06)', border: '1px solid var(--border-color)', color: 'var(--color-text-primary)', cursor: doc.arquivo ? 'pointer' : 'default' }}
                            onClick={() => doc.arquivo && onOpenViewer(doc.arquivo, doc.nome || doc.tipo)}>
                            {doc.arquivo ? <CheckCircle size={10} style={{ color: 'var(--color-success)' }} /> : <FileText size={10} style={{ color: 'var(--color-neutral)' }} />}
                            {doc.tipo || doc.nome}
                            {doc.arquivo && <Eye size={9} style={{ color: 'var(--color-info)', opacity: 0.7 }} />}
                        </span>
                    ))}
                </div>
            )}

            {/* ===== DOCUMENT LIST (full width, compact rows) ===== */}
            <div style={{ background: 'var(--bg-body)', borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-body)' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>Documentos do Processo</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', opacity: 0.7 }}>{total} itens</span>
                </div>
                {localChecklist.map((item, idx) => {
                    const sc = statusColor(item.status);
                    const isNa = item.status === 'nao_se_aplica';
                    return (
                        <div key={item.id} style={{ borderBottom: idx < localChecklist.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', minHeight: 42, transition: 'background 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-body)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div style={{ width: 9, height: 9, borderRadius: '50%', background: sc.color, flexShrink: 0, boxShadow: `0 0 4px ${sc.color}44` }} />
                                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, minWidth: 0, color: isNa ? 'var(--color-text-secondary)' : 'var(--color-text-primary)', textDecoration: isNa ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</span>
                                <div style={{ display: 'flex', gap: 1, padding: '1px', borderRadius: 6, background: 'rgba(128,128,128,0.06)', alignItems: 'center', flexShrink: 0 }}>
                                    {[
                                        { id: 'pendente', icon: Clock, color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.15)', label: 'Pendente' },
                                        { id: 'recebido', icon: CheckCircle, color: 'var(--color-success)', bg: 'rgba(16,185,129,0.15)', label: 'Recebido' },
                                        { id: 'invalido', icon: AlertTriangle, color: 'var(--color-danger)', bg: 'rgba(239,68,68,0.15)', label: 'Invalido' },
                                        { id: 'nao_se_aplica', icon: X, color: 'var(--color-neutral)', bg: 'rgba(107,114,128,0.15)', label: 'N/A' },
                                    ].map(opt => {
                                        const isSelected = item.status === opt.id;
                                        return (
                                            <button key={opt.id} onClick={() => updateItem(item.id, { status: opt.id as StatusChecklist })} title={opt.label}
                                                style={{ width: 22, height: 22, borderRadius: 5, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s', background: isSelected ? opt.bg : 'transparent', color: isSelected ? opt.color : 'var(--color-text-secondary)', opacity: isSelected ? 1 : 0.35 }}
                                                onMouseEnter={e => !isSelected && (e.currentTarget.style.opacity = '0.75')}
                                                onMouseLeave={e => !isSelected && (e.currentTarget.style.opacity = '0.35')}>
                                                <opt.icon size={11} strokeWidth={isSelected ? 3 : 2} />
                                            </button>
                                        );
                                    })}
                                </div>
                                <span style={{ fontSize: 9, fontWeight: 800, color: sc.color, background: sc.bg, padding: '2px 6px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, border: `1px solid ${sc.color}22`, minWidth: 44, textAlign: 'center' }}>{sc.label}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                                    {item.arquivo ? (
                                        <>
                                            <button onClick={() => onOpenViewer(item.arquivo!, item.nome)} title="Ver documento"
                                                style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(59,130,246,0.1)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-info)', transition: 'background 0.15s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.2)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}>
                                                <Eye size={12} />
                                            </button>
                                            <button title="Remover anexo"
                                                style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-danger)', transition: 'background 0.15s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.18)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                                                onClick={async () => { const confirmed = await confirm('Deseja remover este anexo?'); if (confirmed) { updateItem(item.id, { arquivo: undefined, status: 'pendente' }); setDirty(true); } }}>
                                                <Trash2 size={11} />
                                            </button>
                                        </>
                                    ) : (
                                        <button title="Anexar arquivo" disabled={uploadingId === item.id}
                                            style={{ height: 26, padding: '0 8px', borderRadius: 6, background: uploadingId === item.id ? 'var(--bg-secondary)' : 'var(--color-primary)', color: uploadingId === item.id ? 'var(--color-text-secondary)' : 'var(--bg-body)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, transition: 'opacity 0.15s' }}
                                            onClick={() => { setActiveUploadItemId(item.id); fileInputRef.current?.click(); }}>
                                            {uploadingId === item.id ? <Clock size={11} className="animate-spin" /> : <Upload size={11} />}
                                            {uploadingId === item.id ? '...' : 'Anexar'}
                                        </button>
                                    )}
                                    <button title="Excluir item"
                                        style={{ width: 22, height: 22, borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', opacity: 0.2, transition: 'opacity 0.15s, color 0.15s' }}
                                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--color-danger)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.2'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                                        onClick={async () => { const confirmed = await confirm(`Deseja mesmo remover o item "${item.nome}"?`); if (confirmed) { setLocalChecklist(prev => prev.filter(i => i.id !== item.id)); setDirty(true); } }}>
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                                {(item.nome === 'CNH' || item.nome.includes('CNH')) && item.status !== 'nao_se_aplica' && item.status !== 'recebido' && (
                                    <button style={{ background: 'transparent', border: '1px solid #F59E0B44', borderRadius: 5, padding: '2px 7px', cursor: 'pointer', fontSize: 9, fontWeight: 700, color: 'var(--color-warning)', whiteSpace: 'nowrap', transition: 'background 0.15s', flexShrink: 0 }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.08)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        onClick={() => handleNaoPossuiCNH(item.id)}>Sem CNH?</button>
                                )}
                            </div>
                            {(item.observacao) && (
                                <div style={{ padding: '0 12px 6px 29px' }}>
                                    <input type="text" placeholder="Observacao..."
                                        value={item.observacao || ''} onChange={(e) => updateItem(item.id, { observacao: e.target.value })}
                                        style={{ width: '100%', fontSize: 10, padding: '3px 8px', background: 'transparent', border: '1px solid transparent', borderRadius: 5, color: 'var(--color-text-secondary)', outline: 'none', transition: 'border-color 0.2s, background 0.2s', fontStyle: 'italic', boxSizing: 'border-box' }}
                                        onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'rgba(128,128,128,0.06)'; }}
                                        onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }} />
                                </div>
                            )}
                        </div>
                    );
                })}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-body)' }}>
                    <Plus size={13} style={{ color: 'var(--color-primary)', opacity: 0.5, flexShrink: 0 }} />
                    <input type="text" placeholder="Adicionar documento..."
                        value={novoDocNome} onChange={(e) => setNovoDocNome(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddDocumento()}
                        style={{ flex: 1, fontSize: 12, padding: '6px 8px', background: 'transparent', border: '1px solid transparent', borderRadius: 6, color: 'var(--color-text-primary)', outline: 'none', transition: 'border-color 0.2s, background 0.2s' }}
                        onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = 'rgba(212,168,67,0.04)'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }} />
                    {novoDocNome.trim() && (
                        <button onClick={handleAddDocumento}
                            style={{ height: 26, padding: '0 10px', borderRadius: 6, background: 'var(--color-primary)', color: 'var(--bg-body)', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, transition: 'opacity 0.15s' }}>
                            <Plus size={12} /> Adicionar
                        </button>
                    )}
                </div>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} />
            </div>

            {/* ===== BOTTOM ROW: Observacoes + Save ===== */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                <div style={{ flex: 1 }}>
                    <textarea rows={2} placeholder="Observacoes gerais do checklist..."
                        value={observacoesGlobais} onChange={(e) => { setObservacoesGlobais(e.target.value); markDirty(true); }}
                        style={{ width: '100%', fontSize: 11, padding: '8px 12px', background: 'var(--bg-body)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--color-text-primary)', outline: 'none', resize: 'vertical', minHeight: 50, fontFamily: 'inherit', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                        onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                        onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                    <button onClick={handleSave} disabled={!dirty}
                        style={{ height: 40, padding: '0 24px', background: dirty ? 'linear-gradient(135deg, #10B981, #059669)' : 'rgba(128,128,128,0.1)', color: dirty ? '#fff' : 'var(--color-text-secondary)', border: 'none', borderRadius: 8, cursor: dirty ? 'pointer' : 'default', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s', boxShadow: dirty ? '0 2px 10px rgba(16,185,129,0.25)' : 'none', whiteSpace: 'nowrap' }}>
                        {dirty ? <Save size={14} /> : <CheckCircle size={14} />}
                        {dirty ? 'SALVAR' : 'SALVO'}
                    </button>
                    {dirty && <span style={{ fontSize: 9, color: 'var(--color-warning)', fontWeight: 700, textAlign: 'center' }}>Alteracoes pendentes</span>}
                </div>
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

        return (servicosMap[os.tipoServico as string] || servicosMap['transferencia']) as string;
    };

    const abrirDetranComContexto = () => {
        // Salvar contexto no chrome.storage via bridge antes de abrir
        window.postMessage({
            source: 'MATILDE_CRM',
            action: 'DEFINIR_SERVICO',
            payload: { servico: os.tipoServico }
        }, '*');
        if (veiculo?.placa && os.id) {
            window.dispatchEvent(new CustomEvent('MATILDE_SEND_CONTEXT', {
                detail: { osId: os.id, placa: veiculo.placa }
            }));
        }
        // Salvar dados adicionais para content_detran.js
        if (veiculo?.chassi) {
            window.dispatchEvent(new CustomEvent('MATILDE_SEND_CONTEXT_EXTRA', {
                detail: {
                    chassi: veiculo.chassi,
                    cpfCnpj: cliente?.cpfCnpj || '',
                    nome: cliente?.nome || '',
                    servico: os.tipoServico,
                }
            }));
        }
        window.open(getDetranUrl(), '_blank');
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Cadastro Detran-MG e DAE</h3>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={abrirDetranComContexto}
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
    const serviceLabels = useServiceLabels();
    const vistoria = os.vistoria || { status: 'agendar' as const, local: '' };

    const [local, setLocal] = useState(vistoria.local);
    const [dataAgendamento, setDataAgendamento] = useState(vistoria.dataAgendamento || '');
    const [horaAgendamento, setHoraAgendamento] = useState(vistoria.horaAgendamento || '');
    const [protocolo, setProtocolo] = useState(vistoria.protocolo || '');
    const [status, setStatus] = useState<StatusVistoria>(vistoria.status);
    const [trocaPlaca, setTrocaPlaca] = useState(os.trocaPlaca);
    // Payment: taxa de vistoria
    const [taxaValor, setTaxaValor] = useState(() => { const v = vistoria.taxaValor; return v ? Number(v).toFixed(2).replace('.', ',') : ''; });
    const [taxaStatus, setTaxaStatus] = useState<StatusPagamento>(vistoria.taxaStatus || 'aguardando_pagamento');
    // Payment: placa
    const [placaValor, setPlacaValor] = useState(() => { const v = vistoria.placaValor; return v ? Number(v).toFixed(2).replace('.', ',') : ''; });
    const [placaStatus, setPlacaStatus] = useState<StatusPagamento>(vistoria.placaStatus || 'aguardando_pagamento');

    // Puxar valores da price_table (read-only)
    const [precoVistoria, setPrecoVistoria] = useState(0);
    const [precoPlaca, setPrecoPlaca] = useState(0);
    useEffect(() => {
        let cancelled = false;
        async function loadPrices() {
            const vVal = await getPriceByCodigo('vistoria');
            if (!cancelled) setPrecoVistoria(vVal);
            const tipoV = os.tipoVeiculo === 'moto' ? 'placa_moto_mercosul' : 'placa_carro_mercosul';
            const pVal = await getPriceByCodigo(tipoV);
            if (!cancelled) setPrecoPlaca(pVal);
        }
        loadPrices();
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        setTaxaValor(v.taxaValor ? Number(v.taxaValor).toFixed(2).replace('.', ',') : '');
        setTaxaStatus(v.taxaStatus || 'aguardando_pagamento');
        setPlacaValor(v.placaValor ? Number(v.placaValor).toFixed(2).replace('.', ',') : '');
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
            const { uploadFileToSupabase } = await import('../lib/fileStorage');
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
                const { getChargesByOS: fetchCharges } = await import('../lib/financeService');
                const allCharges = await fetchCharges(os.id);
                const daeCharges = allCharges.filter(
                    (c) => ['dae_principal', 'dae_adicional'].includes(c.categoria) && c.status === 'a_pagar'
                );
                if (daeCharges.length > 0) {
                    for (const dae of daeCharges) {
                        await marcarCustoPago(dae.id);
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

    // Dados fixos do Despachante Matilde
    linkUrl.searchParams.append("telefone", "3138314648");
    linkUrl.searchParams.append("email", "despachantematilde@hotmail.com");

    // Serviço / Motivo da vistoria
    if (os.tipoServico) {
        linkUrl.searchParams.append("servico", getServicoLabel(serviceLabels, os.tipoServico));
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

    // === JSX: compact redesign ===
    const VLBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-tertiary)', marginBottom: 2 };
    const VVAL: React.CSSProperties = { fontSize: 13 };
    const [historyOpen, setHistoryOpen] = useState(false);

    return (
        <div>
            {/* ===== TOPO: Banner Vistoria Veicular ===== */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 10, flexWrap: 'wrap', gap: 8,
                padding: '10px 14px', borderRadius: 10,
                background: si.bg, border: `1px solid ${si.color}33`,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 30, height: 30, borderRadius: 8,
                        background: si.color + '22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: si.color,
                    }}>
                        {si.icon}
                    </div>
                    <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            Vistoria Veicular
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: si.color }}>
                                {si.label}
                            </span>
                            {protocolo && (
                                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
                                    · Prot: {protocolo}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <a href={linkUrl.toString()} target="_blank" rel="noopener noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', borderRadius: 7,
                            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                            color: 'var(--color-text-primary)', fontWeight: 700, fontSize: 11,
                            textDecoration: 'none', cursor: 'pointer',
                            transition: 'border-color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = 'rgba(212,168,67,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
                    >
                        <Calendar size={12} /> Agendar ECV
                    </a>
                    <a href={laudoUrl} target="_blank" rel="noopener noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', borderRadius: 7,
                            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                            color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 11,
                            textDecoration: 'none', cursor: 'pointer',
                            transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                    >
                        <Search size={12} /> Consultar Laudo
                    </a>
                </div>
            </div>

            {/* Prazo de reagendamento */}
            {vistoria.prazoReagendamento && (
                <div style={{
                    marginBottom: 8, padding: '6px 10px', borderRadius: 7,
                    background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 11, fontWeight: 600, color: 'var(--color-danger)',
                }}>
                    <AlertTriangle size={12} />
                    Prazo para reagendamento: {new Date(vistoria.prazoReagendamento).toLocaleDateString('pt-BR')}
                </div>
            )}

            {/* ===== STATUS LINE ===== */}
            <div style={{ marginBottom: 10, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                {(['agendar', 'agendada', 'reagendar', 'reprovada', 'aprovada_apontamento', 'aprovada'] as StatusVistoria[]).filter(s => !(s === 'agendada' && prazoVencido && status === 'agendada')).map((s) => {
                    const info = statusInfo(s);
                    const isActive = status === s || (s === 'reagendar' && prazoVencido && status === 'agendada');
                    return (
                        <button key={s} onClick={() => {
                            if (s === 'reagendar') { setStatus('reagendar'); } else { setStatus(s); }
                            setDirty(true);
                        }}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '5px 10px', borderRadius: 6, border: 'none',
                                fontSize: 10, fontWeight: 700, cursor: 'pointer',
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
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={handleSave} disabled={!dirty || saving}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '6px 14px', borderRadius: 7, border: 'none',
                            fontSize: 11, fontWeight: 700, cursor: (dirty && !saving) ? 'pointer' : 'not-allowed',
                            background: (dirty && !saving) ? 'linear-gradient(135deg, #d4a843, #c49a3a)' : 'var(--bg-body)',
                            color: (dirty && !saving) ? '#fff' : 'var(--color-text-tertiary)',
                            boxShadow: (dirty && !saving) ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                            transition: 'all 0.2s', opacity: (dirty && !saving) ? 1 : 0.6,
                        }}>
                        <Save size={12} /> {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                    {dirty && !saving && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: 'var(--color-warning)' }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-warning)', animation: 'pulse 1.5s infinite' }} />
                            Não salvo
                        </span>
                    )}
                </div>
            </div>

            {/* Motivo reprovação / apontamento */}
            {status === 'reprovada' && vistoria.status !== 'reprovada' && (
                <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <label style={{ ...VLBL, color: 'var(--color-danger)' }}>Motivo da Reprovação *</label>
                    <textarea className="form-textarea" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Descreva o motivo..." style={{ minHeight: 56, fontSize: 13, borderColor: 'rgba(239,68,68,0.3)' }} />
                </div>
            )}
            {status === 'aprovada_apontamento' && vistoria.status !== 'aprovada_apontamento' && (
                <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <label style={{ ...VLBL, color: 'var(--color-warning)' }}>Apontamento *</label>
                    <textarea className="form-textarea" value={apontamento} onChange={(e) => setApontamento(e.target.value)}
                        placeholder="Descreva os apontamentos..." style={{ minHeight: 56, fontSize: 13, borderColor: 'rgba(245,158,11,0.3)' }} />
                </div>
            )}

            {/* ===== 2-COLUMN LAYOUT ===== */}
            <div className="os-info-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                {/* COLUNA ESQUERDA: Agendamento + Pagamentos */}
                <CKColCard style={{ minWidth: 0 }}>
                    <CKColHeader label="Agendamento" />
                    <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div>
                            <label style={VLBL}>Local</label>
                            <input type="text" className="form-input" placeholder="ECV Central..."
                                value={local} onChange={(e) => { setLocal(e.target.value); setDirty(true); }}
                                style={VVAL} />
                        </div>
                        <div className="os-form-row-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div>
                                <label style={VLBL}>Data</label>
                                <input type="date" className="form-input" value={dataAgendamento}
                                    min={(['agendada', 'agendar', 'reagendar'] as StatusVistoria[]).includes(status) ? new Date().toISOString().split('T')[0] : undefined}
                                    onChange={(e) => { setDataAgendamento(e.target.value); if (e.target.value && status === 'agendar') setStatus('agendada'); setDirty(true); }}
                                    style={VVAL} />
                            </div>
                            <div>
                                <label style={VLBL}>Hora</label>
                                <input type="time" className="form-input" value={horaAgendamento}
                                    onChange={(e) => { setHoraAgendamento(e.target.value); setDirty(true); }}
                                    style={VVAL} />
                            </div>
                        </div>

                        {(dataAgendamento || local) && (
                            <div style={{
                                display: 'flex', gap: 10, flexWrap: 'wrap',
                                padding: '5px 10px', borderRadius: 6,
                                background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                            }}>
                                {dataAgendamento && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Calendar size={10} style={{ color: 'var(--color-primary)' }} />
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                            {(() => { const d = new Date(dataAgendamento + 'T12:00:00'); return isNaN(d.getTime()) ? dataAgendamento : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); })()}
                                        </span>
                                        {horaAgendamento && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>às {horaAgendamento}</span>}
                                    </div>
                                )}
                                {local && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Building2 size={10} style={{ color: 'var(--color-text-tertiary)' }} />
                                        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{local}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Pagamentos */}
                        <div style={{ borderTop: '1px solid var(--border-color)', margin: '2px 0', paddingTop: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-primary)', marginBottom: 4, display: 'block' }}>Pagamentos</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {/* Taxa Vistoria */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 10px', borderRadius: 7,
                                    background: taxaStatus === 'pago' ? 'rgba(16,185,129,0.06)' : 'var(--bg-body)',
                                    border: `1px solid ${taxaStatus === 'pago' ? 'rgba(16,185,129,0.2)' : 'var(--border-color)'}`,
                                }}>
                                    <div>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)' }}>Taxa Vistoria</span>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-primary)', marginLeft: 8 }}>
                                            R$ {precoVistoria.toFixed(2).replace('.', ',')}
                                        </span>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            const novoStatus: StatusPagamento = taxaStatus === 'pago' ? 'aguardando_pagamento' : 'pago';
                                            setTaxaStatus(novoStatus);
                                            setTaxaValor(precoVistoria.toFixed(2).replace('.', ','));
                                            setDirty(true);
                                            // Sincronizar com finance_charges
                                            try {
                                                const charges = await getChargesByOS(os.id);
                                                const vistCharge = charges.find(c => c.categoria === 'vistoria' && c.status !== 'cancelado');
                                                if (vistCharge) {
                                                    if (novoStatus === 'pago') {
                                                        await marcarCustoPago(vistCharge.id);
                                                    }
                                                }
                                            } catch (err) { console.warn('Erro ao sincronizar pagamento vistoria:', err); }
                                        }}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '4px 10px', borderRadius: 6, border: 'none',
                                            fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                            background: taxaStatus === 'pago' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.12)',
                                            color: taxaStatus === 'pago' ? 'var(--color-success)' : 'var(--color-warning)',
                                        }}
                                    >
                                        {taxaStatus === 'pago' ? <><CheckCircle size={11} /> Pago</> : <><Clock size={11} /> Aguardando</>}
                                    </button>
                                </div>

                            </div>
                        </div>
                    </div>
                </CKColCard>

                {/* COLUNA DIREITA: Laudo + Troca de Placa + Histórico */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Laudo */}
                <CKColCard style={{ minWidth: 0 }}>
                    <CKColHeader label="Laudo da Vistoria" right={
                        os.vistoria?.vistoriaAnexadaEm
                            ? <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-success)', background: 'rgba(16,185,129,0.12)', padding: '1px 6px', borderRadius: 4 }}>Anexado</span>
                            : null
                    } />
                    <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {os.vistoria?.vistoriaAnexadaEm ? (
                            <div style={{
                                padding: '8px 10px', borderRadius: 7,
                                background: 'rgba(16, 185, 129, 0.08)',
                                border: '1px solid rgba(16, 185, 129, 0.2)',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                    <CheckCircle size={12} style={{ color: 'var(--color-success)' }} />
                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-success)' }}>
                                        Anexada em {new Date(os.vistoria!.vistoriaAnexadaEm!).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <FileText size={10} style={{ color: 'var(--color-text-tertiary)' }} />
                                    <span style={{
                                        fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)',
                                        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                    }}>
                                        {os.vistoria!.vistoriaNomeArquivo}
                                    </span>
                                    {os.vistoria!.vistoriaUrl && (
                                        <button onClick={() => onOpenViewer(os.vistoria!.vistoriaUrl!, os.vistoria!.vistoriaNomeArquivo || 'Laudo de Vistoria')}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                                padding: '3px 8px', borderRadius: 5, border: 'none',
                                                fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                                background: 'rgba(16,185,129,0.15)', color: 'var(--color-success)',
                                                flexShrink: 0,
                                            }}>
                                            <Eye size={10} /> Ver PDF
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
                                Nenhum laudo anexado.
                            </p>
                        )}

                        <div onClick={() => { if (!vistUploading) vistFileRef.current?.click(); }}
                            style={{
                                border: '2px dashed var(--border-color)',
                                borderRadius: 8, padding: '12px 10px',
                                textAlign: 'center', cursor: vistUploading ? 'wait' : 'pointer',
                                background: 'var(--bg-body)',
                                transition: 'border-color 0.15s, background 0.15s',
                            }}
                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = 'rgba(212,168,67,0.06)'; }}
                            onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-body)'; }}
                            onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-body)'; const f = e.dataTransfer.files[0]; if (f) handleVistoriaUpload(f); }}>
                            {vistUploading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <div style={{
                                        width: 22, height: 22, borderRadius: '50%',
                                        border: '2px solid var(--border-color)', borderTopColor: 'var(--color-primary)',
                                        animation: 'spin 0.8s linear infinite',
                                    }} />
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>Enviando...</span>
                                </div>
                            ) : (
                                <div>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: 8,
                                        background: 'rgba(212,168,67,0.12)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        margin: '0 auto 6px',
                                    }}>
                                        <Upload size={14} style={{ color: 'var(--color-primary)' }} />
                                    </div>
                                    <p style={{ margin: 0, fontWeight: 700, fontSize: 11, color: 'var(--color-text-primary)' }}>
                                        Clique ou arraste o PDF
                                    </p>
                                    <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                                        OS #{os.numero} · {veiculo?.placa || 'Sem placa'}
                                    </p>
                                </div>
                            )}
                        </div>

                        <input type="file" ref={vistFileRef} accept=".pdf" style={{ display: 'none' }}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVistoriaUpload(f); e.target.value = ''; }} />

                        {vistUploadMsg && (
                            <div style={{
                                padding: '6px 10px', borderRadius: 6,
                                background: vistUploadMsg.includes('❌') ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                                border: `1px solid ${vistUploadMsg.includes('❌') ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                                fontSize: 11, fontWeight: 600,
                                color: vistUploadMsg.includes('❌') ? 'var(--color-danger)' : 'var(--color-success)',
                            }}>
                                {vistUploadMsg}
                            </div>
                        )}
                    </div>
                </CKColCard>

                {/* Troca de Placa */}
                <div style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: trocaPlaca ? 'rgba(212,168,67,0.05)' : 'var(--bg-body)',
                    border: `1px solid ${trocaPlaca ? 'rgba(212,168,67,0.25)' : 'var(--border-color)'}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                }} onClick={() => { setTrocaPlaca(!trocaPlaca); setDirty(true); }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={trocaPlaca} readOnly
                            style={{ width: 14, height: 14, borderRadius: 3, accentColor: 'var(--color-primary)', cursor: 'pointer', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', flex: 1 }}>
                            Troca de Placa
                        </span>
                        {trocaPlaca && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-primary)', background: 'rgba(212,168,67,0.12)', padding: '1px 6px', borderRadius: 4 }}>
                                SIM
                            </span>
                        )}
                    </div>
                </div>

                {/* Histórico - collapsible */}
                {os.vistoriaHistory.length > 0 && (
                    <CKColCard style={{ minWidth: 0 }}>
                        <div
                            onClick={() => setHistoryOpen(!historyOpen)}
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: historyOpen ? '1px solid var(--border-color)' : 'none' }}
                        >
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Clock size={12} style={{ color: 'var(--color-primary)' }} />
                                Histórico ({os.vistoriaHistory.length})
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', transform: historyOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>&#9660;</span>
                        </div>
                        {historyOpen && (
                        <div style={{ padding: '8px 14px 10px' }}>
                            <div style={{ position: 'relative', paddingLeft: 20 }}>
                                <div style={{ position: 'absolute', left: 7, top: 6, bottom: 6, width: 2, background: 'var(--border-color)', borderRadius: 1 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {os.vistoriaHistory.map((h, idx) => {
                                        const hInfo = statusInfo(h.status);
                                        const isLast = idx === os.vistoriaHistory.length - 1;
                                        return (
                                            <div key={h.id} style={{ position: 'relative' }}>
                                                <div style={{
                                                    position: 'absolute', left: -16, top: 7,
                                                    width: 12, height: 12, borderRadius: '50%',
                                                    background: hInfo.bg, border: `2px solid ${hInfo.color}`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                                                }}>
                                                    <span style={{ color: hInfo.color, display: 'flex', alignItems: 'center' }}>
                                                        {h.status === 'reprovada' ? <XCircle size={7} /> : h.status === 'aprovada_apontamento' ? <AlertTriangle size={7} /> : <CheckCircle size={7} />}
                                                    </span>
                                                </div>
                                                <div style={{ padding: '6px 8px', borderRadius: 6, background: isLast ? hInfo.bg : 'var(--bg-body)', border: `1px solid ${isLast ? hInfo.color + '44' : 'var(--border-color)'}` }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                                                        <span style={{ fontSize: 10, fontWeight: 700, color: hInfo.color, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                                            {hInfo.label}
                                                        </span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
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
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', borderRadius: 3, opacity: 0.6 }}
                                                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-error)'; }}
                                                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-tertiary)'; }}
                                                            >
                                                                <Trash2 size={10} />
                                                            </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                                                        <Clock size={9} style={{ verticalAlign: -1, marginRight: 2 }} />
                                                        {new Date(h.registradoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                                        {h.local && <> · <Building2 size={9} style={{ verticalAlign: -1, marginRight: 1 }} />{h.local}</>}
                                                    </div>
                                                    {h.motivo && (
                                                        <p style={{ fontSize: 10, color: 'var(--color-danger)', margin: '3px 0 0', padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.07)' }}>
                                                            <strong>Motivo:</strong> {h.motivo}
                                                        </p>
                                                    )}
                                                    {h.apontamento && (
                                                        <p style={{ fontSize: 10, color: 'var(--color-warning)', margin: '3px 0 0', padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.07)' }}>
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
                        )}
                    </CKColCard>
                )}

                </div>{/* fim coluna direita */}
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

        if (placaFormatada && veiculo) {
            const placaAnterior = veiculo.placa;
            await saveVeiculo({ ...veiculo, placa: placaFormatada });
            addAuditEntry(os.id, 'SIFAP', `SIFAP registrado em ${new Date(sifapData).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Placa alterada: ${placaAnterior || 'N/A'} \u2192 ${placaFormatada}`);
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Top bar: Summary counters + Add button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-body)', borderRadius: 8, border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={12} style={{ color: 'var(--color-info)' }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Entradas</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', minWidth: 18, textAlign: 'center' }}>{totalEntradas}</span>
                </div>
                <div style={{ width: 1, height: 20, background: 'var(--border-color)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RotateCcw size={12} style={{ color: '#f59e0b' }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Reentradas</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', minWidth: 18, textAlign: 'center' }}>{totalReentradas}</span>
                </div>
                <div style={{ width: 1, height: 20, background: 'var(--border-color)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileCheck size={12} style={{ color: needsSifap ? (os.sifap?.dataRegistro ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-text-tertiary)' }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>SIFAP</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: needsSifap ? (os.sifap?.dataRegistro ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-text-tertiary)' }}>
                        {!needsSifap ? 'N/A' : os.sifap?.dataRegistro ? 'OK' : 'Pend.'}
                    </span>
                </div>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Resp: <strong style={{ color: 'var(--color-primary)' }}>{responsavelLogado}</strong></span>
                <button
                    onClick={() => { setShowForm(!showForm); if (entradas.length > 0) setTipo('reentrada'); else setTipo('entrada'); }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 12px', borderRadius: 6,
                        background: showForm ? 'transparent' : 'var(--color-primary)',
                        color: showForm ? 'var(--color-text-tertiary)' : 'var(--bg-body)',
                        border: showForm ? '1px solid var(--border-color)' : 'none',
                        cursor: 'pointer', fontWeight: 700, fontSize: 11,
                        fontFamily: 'var(--font-family)',
                    }}
                >
                    {showForm ? <X size={11} /> : <Plus size={11} />}
                    {showForm ? 'Fechar' : 'Nova entrada'}
                </button>
            </div>

            {/* Inline compact form */}
            {showForm && (
                <div style={{ padding: '10px 14px', background: 'var(--bg-body)', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: '0 0 auto' }}>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>Tipo</label>
                            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--bg-body)' }}>
                                {(['entrada', 'reentrada', 'sifap', 'requerimento'] as const).map(t => {
                                    const label = t === 'entrada' ? 'Entrada' : t === 'sifap' ? 'SIFAP' : t === 'requerimento' ? 'Req.' : 'Reentrada';
                                    const activeColor = t === 'entrada' ? 'var(--color-info)' : t === 'sifap' ? 'var(--color-success)' : t === 'requerimento' ? '#8b5cf6' : '#f59e0b';
                                    return (
                                    <button key={t} type="button" onClick={() => setTipo(t)}
                                        style={{
                                            padding: '5px 10px', fontSize: 11, fontWeight: tipo === t ? 700 : 500,
                                            border: 'none', cursor: 'pointer', fontFamily: 'var(--font-family)',
                                            background: tipo === t ? `${activeColor}22` : 'transparent',
                                            color: tipo === t ? activeColor : 'var(--color-text-tertiary)',
                                        }}
                                    >
                                        {label}
                                    </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div style={{ flex: '0 0 150px' }}>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>Data</label>
                            <input type="date" className="form-input" value={data} onChange={(e) => setData(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} />
                        </div>
                        <div style={{ flex: '1 1 150px' }}>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>Obs.</label>
                            <input type="text" className="form-input" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional..." style={{ fontSize: 12, padding: '5px 8px' }} />
                        </div>
                        <button type="button" onClick={handleAdd}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5, height: 32,
                                padding: '0 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                background: 'var(--color-primary)', color: 'var(--bg-body)', fontWeight: 700, fontSize: 11,
                                fontFamily: 'var(--font-family)', whiteSpace: 'nowrap',
                            }}
                        >
                            <Save size={11} /> Confirmar
                        </button>
                    </div>
                    {tipo === 'reentrada' && (
                        <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#f59e0b', marginBottom: 3 }}><AlertTriangle size={10} style={{ verticalAlign: -1, marginRight: 3 }} />Motivo da Devolução *</label>
                            <textarea className="form-textarea" value={motivoDevolucao} onChange={(e) => setMotivoDevolucao(e.target.value)}
                                placeholder="Descreva o motivo..."
                                style={{ minHeight: 40, fontSize: 12, resize: 'vertical', padding: '5px 8px' }} />
                        </div>
                    )}
                </div>
            )}

            {/* SIFAP compact section */}
            {needsSifap && entradas.length > 0 && (
                <div style={{
                    padding: '8px 14px', borderRadius: 8,
                    background: os.sifap?.dataRegistro ? 'rgba(16,185,129,0.04)' : 'rgba(245,158,11,0.04)',
                    border: os.sifap?.dataRegistro ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(245,158,11,0.15)',
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                    <FileCheck size={13} style={{ color: os.sifap?.dataRegistro ? 'var(--color-success)' : '#f59e0b', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)' }}>SIFAP</span>
                    {os.sifap?.dataRegistro && !sifapDirty && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-success)', padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.1)' }}>
                            Registrado {formatDateLocal(os.sifap.dataRegistro)}
                        </span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Data</label>
                            <input type="date" className="form-input" value={sifapData}
                                onChange={(e) => { setSifapData(e.target.value); setSifapDirty(true); }}
                                style={{ fontSize: 12, padding: '4px 6px' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Nova Placa</label>
                            <input type="text" className="form-input" value={sifapPlaca}
                                onChange={(e) => { setSifapPlaca(e.target.value.toUpperCase()); setSifapDirty(true); }}
                                placeholder={veiculo?.placa || 'ABC1D23'} maxLength={7}
                                style={{ fontSize: 12, padding: '4px 6px', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, width: 90 }} />
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={handleSaveSifap} disabled={!sifapDirty} style={{ borderRadius: 6, padding: '5px 10px', fontSize: 11, alignSelf: 'flex-end' }}>
                            <Save size={12} /> Salvar
                        </button>
                        {os.sifap?.dataRegistro && !sifapDirty && (
                            <button onClick={handleCancelarSifap}
                                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 5, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.12)', color: 'var(--color-danger)', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)', alignSelf: 'flex-end' }}>
                                <XCircle size={10} /> Cancelar
                            </button>
                        )}
                    </div>
                </div>
            )}

            {needsSifap && entradas.length === 0 && (
                <div style={{ padding: '8px 14px', borderRadius: 6, background: 'var(--bg-body)', border: '1px dashed var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileCheck size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>SIFAP disponível após a primeira entrada.</span>
                </div>
            )}

            {/* History table */}
            <div style={{ background: 'var(--bg-body)', borderRadius: 8, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', background: 'var(--bg-body)', borderBottom: '1px solid var(--border-color)', gap: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Histórico</span>
                    {entradas.length > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 8, background: 'rgba(212,168,67,0.12)', color: 'var(--color-primary)' }}>{entradas.length}</span>
                    )}
                </div>

                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {entradas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 14px' }}>
                        <MapPin size={16} style={{ color: 'var(--color-text-tertiary)', marginBottom: 6 }} />
                        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>Nenhuma entrada registrada</p>
                    </div>
                ) : (() => {
                    const entradasFiltradas = entradas.filter(e => e.tipo === 'entrada');
                    const reentradas = entradas.filter(e => e.tipo === 'reentrada' || e.tipo === 'sifap' || e.tipo === 'requerimento');
                    const renderEntry = (e: EntradaDelegacia, idx: number) => {
                            const isEntrada = e.tipo === 'entrada';
                            const isSifap = e.tipo === 'sifap';
                            const isRequerimento = e.tipo === 'requerimento';
                            const accentColor = isEntrada ? 'var(--color-info)' : isSifap ? 'var(--color-success)' : isRequerimento ? '#8b5cf6' : '#f59e0b';
                            const accentBg = isEntrada ? 'rgba(59,130,246,0.1)' : isSifap ? 'rgba(16,185,129,0.1)' : isRequerimento ? 'rgba(139,92,246,0.1)' : 'rgba(245,158,11,0.1)';
                            const isEditing = editingId === e.id;
                            const tipoLabel = isEntrada ? 'Entrada' : isSifap ? 'SIFAP' : isRequerimento ? 'Req.' : 'Reentrada';

                            if (isEditing) {
                                return (
                                    <div key={e.id} style={{ padding: '10px 14px', borderLeft: `3px solid ${accentColor}`, background: 'var(--bg-body)', borderBottom: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: e.tipo === 'reentrada' ? 8 : 0 }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Data</label>
                                                <input type="date" className="form-input" value={editData}
                                                    onChange={(ev) => setEditData(ev.target.value)}
                                                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 5 }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Obs.</label>
                                                <input type="text" className="form-input" value={editObs}
                                                    onChange={(ev) => setEditObs(ev.target.value)}
                                                    placeholder="Opcional..."
                                                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 5 }} />
                                            </div>
                                            <button onClick={() => {
                                                onEdit(e.id, {
                                                    data: editData,
                                                    observacao: editObs.trim() || undefined,
                                                    motivoDevolucao: e.tipo === 'reentrada' ? editMotivo.trim() || undefined : undefined,
                                                });
                                                setEditingId(null);
                                            }}
                                                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', background: accentColor, color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-family)' }}>
                                                <Save size={10} /> Salvar
                                            </button>
                                            <button onClick={() => setEditingId(null)}
                                                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-family)' }}>
                                                Cancelar
                                            </button>
                                        </div>
                                        {e.tipo === 'reentrada' && (
                                            <div>
                                                <label style={{ display: 'block', fontSize: 11, color: '#f59e0b', marginBottom: 2 }}>Motivo</label>
                                                <textarea className="form-textarea" value={editMotivo}
                                                    onChange={(ev) => setEditMotivo(ev.target.value)}
                                                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 5, minHeight: 36, resize: 'vertical' }} />
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            return (
                                <div key={e.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px',
                                    borderLeft: `3px solid ${accentColor}`, borderBottom: '1px solid var(--border-color)',
                                    minHeight: 40, transition: 'background 0.1s',
                                }}
                                onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--bg-body)'; }}
                                onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
                                >
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: accentBg, color: accentColor, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', minWidth: 68, justifyContent: 'center' }}>
                                        {isEntrada ? <MapPin size={10} /> : isSifap ? <FileCheck size={10} /> : isRequerimento ? <FileText size={10} /> : <RotateCcw size={10} />}
                                        {tipoLabel}
                                    </span>
                                    <span style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 600, whiteSpace: 'nowrap', minWidth: 70 }}>{formatDateLocal(e.data)}</span>
                                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <User size={10} /> {e.responsavel}
                                    </span>
                                    <span style={{ fontSize: 10, color: e.conferido ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
                                        {e.conferido ? <CheckCircle size={12} /> : null}
                                    </span>
                                    <span style={{ flex: 1, fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {e.motivoDevolucao ? <span style={{ color: '#f59e0b' }}>Motivo: {e.motivoDevolucao}</span> : e.observacao ? <span style={{ fontStyle: 'italic' }}>{e.observacao}</span> : ''}
                                    </span>
                                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                        <button onClick={() => {
                                            setEditingId(e.id);
                                            setEditData(e.data);
                                            setEditObs(e.observacao || '');
                                            setEditMotivo(e.motivoDevolucao || '');
                                        }} title="Editar"
                                            style={{ padding: 3, borderRadius: 4, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', fontFamily: 'var(--font-family)' }}
                                            onMouseEnter={(ev) => { ev.currentTarget.style.color = 'var(--color-info)'; }}
                                            onMouseLeave={(ev) => { ev.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                                        >
                                            <Edit2 size={11} />
                                        </button>
                                        <button onClick={() => onRemove(e.id)} title="Remover"
                                            style={{ padding: 3, borderRadius: 4, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', fontFamily: 'var(--font-family)' }}
                                            onMouseEnter={(ev) => { ev.currentTarget.style.color = 'var(--color-danger)'; }}
                                            onMouseLeave={(ev) => { ev.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    </div>
                                </div>
                            );
                    };
                    return (
                        <div>
                            {entradasFiltradas.length > 0 && (
                                <div>
                                    <button onClick={() => setAccordionEntradas(v => !v)} style={{
                                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '6px 14px', background: 'var(--bg-body)', border: 'none', borderBottom: '1px solid var(--border-color)',
                                        cursor: 'pointer', fontFamily: 'var(--font-family)',
                                    }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <MapPin size={11} style={{ color: 'var(--color-info)' }} /> Entradas
                                            <span style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--color-info)', borderRadius: 8, padding: '0px 6px', fontSize: 10, fontWeight: 700 }}>{entradasFiltradas.length}</span>
                                        </span>
                                        {accordionEntradas ? <ChevronUp size={12} style={{ color: 'var(--color-text-tertiary)' }} /> : <ChevronDown size={12} style={{ color: 'var(--color-text-tertiary)' }} />}
                                    </button>
                                    {accordionEntradas && entradasFiltradas.map((e, idx) => renderEntry(e, idx))}
                                </div>
                            )}
                            {reentradas.length > 0 && (
                                <div>
                                    <button onClick={() => setAccordionReentradas(v => !v)} style={{
                                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '6px 14px', background: 'var(--bg-body)', border: 'none', borderBottom: '1px solid var(--border-color)',
                                        cursor: 'pointer', fontFamily: 'var(--font-family)',
                                    }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <RotateCcw size={11} style={{ color: '#f59e0b' }} /> Reentradas / SIFAP / Req.
                                            <span style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', borderRadius: 8, padding: '0px 6px', fontSize: 10, fontWeight: 700 }}>{reentradas.length}</span>
                                        </span>
                                        {accordionReentradas ? <ChevronUp size={12} style={{ color: 'var(--color-text-tertiary)' }} /> : <ChevronDown size={12} style={{ color: 'var(--color-text-tertiary)' }} />}
                                    </button>
                                    {accordionReentradas && reentradas.map((e, idx) => renderEntry(e, idx))}
                                </div>
                            )}
                        </div>
                    );
                })()}
                </div>
            </div>
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

    // Entrega state
    const [nomeRetirada, setNomeRetirada] = useState(os.entregueParaNome || '');
    const [placaTrocada, setPlacaTrocada] = useState(false);

    useEffect(() => {
        getVeiculo(os.veiculoId).then(setVeiculo);
        getCliente(os.clienteId).then(setCliente);
    }, [os.veiculoId, os.clienteId]);

    const isDocPronto = (!!os.docProntoEm || os.status === 'doc_pronto' || os.status === 'entregue') && os.status !== 'delegacia';
    const isEntregue = !!os.entregueEm && !!os.entregueParaNome;
    const checklistComplete = Array.isArray(os.checklist) && os.checklist.length > 0
        ? os.checklist.every((item: any) => item.status === 'recebido' || item.status === 'nao_se_aplica')
        : false;

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
                            const { saveVeiculo } = await import('../lib/database');
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

                        const { uploadFileToSupabase } = await import('../lib/fileStorage');
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
                    const { saveVeiculo } = await import('../lib/database');
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
            const { uploadFileToSupabase } = await import('../lib/fileStorage');
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
                        const { saveVeiculo } = await import('../lib/database');
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

    const steps = [
        { label: 'Doc. Pronto', done: isDocPronto },
        { label: 'PDF Anexado', done: isDocAnexado },
        { label: 'Entregue', done: isEntregue },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Compact progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '8px 14px', background: 'var(--bg-body)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                {steps.map((step, i) => (
                    <div key={step.label} style={{ display: 'contents' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{
                                width: 22, height: 22, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: step.done ? 'var(--color-success)' : 'var(--border-color)',
                                color: step.done ? '#fff' : 'var(--color-text-tertiary)',
                                fontSize: 10, fontWeight: 700,
                            }}>
                                {step.done ? <CheckCircle size={12} /> : i + 1}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: step.done ? 700 : 500, color: step.done ? 'var(--color-success)' : 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                                {step.label}
                            </span>
                        </div>
                        {i < steps.length - 1 && (
                            <div style={{ flex: 1, height: 2, margin: '0 10px', borderRadius: 1, background: steps[i + 1]!.done || step.done ? 'var(--color-success)' : 'var(--border-color)', opacity: steps[i + 1]!.done ? 1 : 0.4 }} />
                        )}
                    </div>
                ))}
            </div>

            {/* Two-column compact grid */}
            <div className="os-info-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(280px, 2fr)', gap: 10, alignItems: 'start' }}>

                {/* Left: CRLV + Validation */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <CrlvDigitalPanel cliente={cliente} veiculo={veiculo} os={os} />

                    <input ref={validarFileRef} type="file" accept=".pdf" hidden
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleValidarManual(f); e.target.value = ''; }} />
                    <button onClick={() => validarFileRef.current?.click()}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)' }}>
                        <FileSearch size={12} /> Validar CRLV (PDF)
                    </button>

                    {validando && (
                        <div style={{ padding: 10, textAlign: 'center', color: 'var(--color-primary)', fontSize: 11, fontWeight: 600 }}>
                            Validando documento...
                        </div>
                    )}

                    {validacaoCrlv && (
                        <div style={{ background: 'var(--bg-body)', borderRadius: 8, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--bg-body)', borderBottom: '1px solid var(--border-color)' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Validação CRLV</span>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 4,
                                    background: validacaoCrlv.aprovado ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                                    color: validacaoCrlv.aprovado ? 'var(--color-success)' : 'var(--color-danger)',
                                    fontSize: 10, fontWeight: 700,
                                }}>
                                    {validacaoCrlv.aprovado ? '✅ Aprovado' : '⚠️ Divergências'}
                                </span>
                            </div>
                            <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {validacaoCrlv.itens.map((item, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 5,
                                        background: item.ok ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)',
                                        border: `1px solid ${item.ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'}`,
                                    }}>
                                        <span style={{ fontSize: 12, flexShrink: 0 }}>{item.ok ? '✅' : '❌'}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)' }}>{item.campo}</span>
                                            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>
                                                {item.ok ? item.recebido : (<><span style={{ color: 'var(--color-danger)' }}>{item.recebido}</span> <span>| Esp: {item.esperado}</span></>)}
                                            </span>
                                            {item.detalhe && !item.ok && (
                                                <div style={{ fontSize: 10, color: 'var(--color-danger)', fontStyle: 'italic' }}>{item.detalhe}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {validacaoCrlv.aprovado && (
                                    <p style={{ margin: '2px 0 0', fontSize: 11, fontWeight: 600, color: 'var(--color-success)', textAlign: 'center' }}>
                                        Documento validado — marcado como PRONTO
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Consultas CRLV */}
                    {os.auditLog && os.auditLog.filter((log: any) => log.acao === 'Consulta CRLV').length > 0 && (
                        <div style={{ background: 'var(--bg-body)', borderRadius: 8, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                            <div style={{ padding: '6px 12px', background: 'var(--bg-body)', borderBottom: '1px solid var(--border-color)' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Consultas CRLV</span>
                            </div>
                            <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                                {os.auditLog
                                    .filter((log: any) => log.acao === 'Consulta CRLV')
                                    .sort((a: any, b: any) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime())
                                    .map((log: any) => {
                                        const isOk = !log.detalhes.toLowerCase().includes('error');
                                        return (
                                            <div key={log.id} style={{ padding: '4px 8px', borderRadius: 5, background: 'var(--bg-body)', borderLeft: `3px solid ${isOk ? 'var(--color-success)' : 'var(--color-danger)'}` }}>
                                                <div style={{ fontSize: 10, color: 'var(--color-primary)', fontWeight: 600 }}>
                                                    {log.dataHora ? new Date(log.dataHora).toLocaleString('pt-BR') : '—'} — {log.usuario}
                                                </div>
                                                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{log.detalhes}</div>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Status + Upload + Delivery */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                    {/* Status compact row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'var(--bg-body)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</span>
                            {isDocPronto && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: 'var(--color-success)', fontSize: 10, fontWeight: 700 }}>
                                    <CheckCircle size={10} /> Pronto
                                </span>
                            )}
                            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                                {isDocPronto
                                    ? `em ${new Date(os.docProntoEm || os.atualizadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
                                    : 'Marque quando concluído'}
                            </span>
                        </div>
                        {isDocPronto ? (
                            !isEntregue && (
                                <button onClick={handleCancelarDocPronto} title="Desfazer"
                                    style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid rgba(239,68,68,0.15)', cursor: 'pointer', background: 'rgba(239,68,68,0.06)', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-family)' }}>
                                    <XCircle size={10} /> Desfazer
                                </button>
                            )
                        ) : (
                            <button onClick={handleDocPronto} disabled={bloqueadoPorDebito}
                                title={bloqueadoPorDebito ? 'Pague os débitos pendentes' : ''}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6, border: 'none', cursor: bloqueadoPorDebito ? 'not-allowed' : 'pointer', background: bloqueadoPorDebito ? 'var(--color-text-tertiary)' : 'var(--color-primary)', color: bloqueadoPorDebito ? 'var(--color-text-tertiary)' : 'var(--bg-body)', fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-family)', opacity: bloqueadoPorDebito ? 0.6 : 1 }}>
                                {bloqueadoPorDebito ? <AlertTriangle size={11} /> : <CheckCircle size={11} />} {bloqueadoPorDebito ? 'Débitos Pend.' : 'Marcar Pronto'}
                            </button>
                        )}
                    </div>

                    {/* Upload PDF compact */}
                    <div style={{ opacity: isDocPronto ? 1 : 0.4, pointerEvents: isDocPronto ? 'auto' : 'none', background: 'var(--bg-body)', borderRadius: 8, border: '1px solid var(--border-color)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>PDF Final</span>
                            {isDocAnexado && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-success)', background: 'rgba(16,185,129,0.12)', padding: '1px 7px', borderRadius: 4 }}>Anexado</span>
                            )}
                        </div>
                        {isDocAnexado && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)' }}>
                                <FileText size={12} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {os.docFinalNome}
                                </span>
                                {os.docFinalUrl && (
                                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                        <button onClick={() => onOpenViewer(os.docFinalUrl!, os.docFinalNome || 'Documento Final')}
                                            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, border: 'none', background: 'rgba(16,185,129,0.15)', color: 'var(--color-success)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-family)' }}>
                                            <Eye size={10} /> Ver
                                        </button>
                                        <button onClick={handleValidarDocAnexado} disabled={validando}
                                            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, border: 'none', background: 'rgba(59,130,246,0.15)', color: 'var(--color-info)', fontSize: 10, fontWeight: 700, cursor: validando ? 'wait' : 'pointer', fontFamily: 'var(--font-family)', opacity: validando ? 0.6 : 1 }}>
                                            <FileSearch size={10} /> {validando ? '...' : 'Validar'}
                                        </button>
                                        <button onClick={handleApagarDocFinal}
                                            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, border: 'none', background: 'rgba(239,68,68,0.12)', color: 'var(--color-danger)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-family)' }}>
                                            <Trash2 size={10} /> Apagar
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <div onClick={() => { if (!uploading) docFileRef.current?.click(); }}
                            style={{ border: '1px dashed var(--border-color)', borderRadius: 6, padding: '12px 14px', textAlign: 'center', cursor: uploading ? 'wait' : 'pointer', background: 'var(--bg-body)' }}
                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#8b5cf6'; }}
                            onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                            onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-color)'; const f = e.dataTransfer.files[0]; if (f) handleUploadDocFinal(f); }}
                        >
                            {uploading ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border-color)', borderTopColor: '#8b5cf6', animation: 'spin 0.8s linear infinite' }} />
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>Enviando...</span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                                    <Upload size={14} style={{ color: '#8b5cf6' }} />
                                    <div style={{ textAlign: 'left' }}>
                                        <p style={{ margin: 0, fontWeight: 700, fontSize: 11, color: 'var(--color-text-primary)' }}>
                                            {isDocAnexado ? 'Enviar novo PDF (substitui)' : 'Clique ou arraste o PDF'}
                                        </p>
                                        <p style={{ margin: 0, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                                            {cliente?.nome || 'CLIENTE'} · {veiculo?.placa || veiculo?.chassi || ''}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <input type="file" ref={docFileRef} accept=".pdf" style={{ display: 'none' }}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadDocFinal(f); e.target.value = ''; }} />
                        <input type="file" ref={crlvFileInputRef} accept=".pdf" style={{ display: 'none' }}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadDocFinal(f); e.target.value = ''; }} />

                        {uploadMsg && (
                            <div style={{
                                padding: '6px 10px', borderRadius: 6,
                                background: uploadMsg.includes('❌') ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)',
                                border: `1px solid ${uploadMsg.includes('❌') ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}`,
                                fontSize: 11, fontWeight: 600,
                                color: uploadMsg.includes('❌') ? 'var(--color-danger)' : 'var(--color-success)',
                            }}>
                                {uploadMsg}
                            </div>
                        )}
                    </div>

                    {/* Delivery compact */}
                    <div style={{ opacity: isDocPronto ? 1 : 0.4, pointerEvents: isDocPronto ? 'auto' : 'none', background: 'var(--bg-body)', borderRadius: 8, border: '1px solid var(--border-color)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Entrega</span>
                            {isEntregue ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--color-success)', background: 'rgba(16,185,129,0.12)', padding: '2px 8px', borderRadius: 4 }}>
                                    <CheckCircle size={10} /> Entregue
                                </span>
                            ) : isDocPronto ? (
                                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', background: 'rgba(212,168,67,0.12)', padding: '2px 8px', borderRadius: 4 }}>
                                    Aguardando
                                </span>
                            ) : null}
                        </div>
                        {isEntregue ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <UserCheck size={14} style={{ color: 'var(--color-success)' }} />
                                    <div>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>{os.entregueParaNome}</span>
                                        <span style={{ fontSize: 10, color: 'var(--color-success)', display: 'block' }}>
                                            {new Date(os.entregueEm!).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                                <button onClick={handleCancelarEntrega} title="Cancelar entrega"
                                    style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 5, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', color: 'var(--color-danger)', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)', flexShrink: 0 }}>
                                    <XCircle size={10} /> Cancelar
                                </button>
                            </div>
                        ) : (
                            <>
                                {os.trocaPlaca && (
                                    <div style={{ padding: '6px 10px', background: 'rgba(59,130,246,0.04)', borderRadius: 6, border: '1px solid rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <input type="checkbox" id="chk-placa-doc" checked={placaTrocada} onChange={(e) => setPlacaTrocada(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--color-info)' }} />
                                        <label htmlFor="chk-placa-doc" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', cursor: 'pointer', margin: 0, userSelect: 'none' }}>
                                            Nova placa instalada no veículo
                                        </label>
                                    </div>
                                )}
                                {(() => {
                                    const prereqs = [
                                        { label: 'Sem débitos', ok: !bloqueadoPorDebito },
                                        { label: 'Checklist OK', ok: checklistComplete },
                                        { label: 'PDF anexado', ok: !!os.docFinalUrl },
                                        { label: 'Nome preenchido', ok: !!nomeRetirada.trim() },
                                        ...(os.trocaPlaca ? [{ label: 'Placa trocada', ok: placaTrocada }] : []),
                                    ];
                                    const allOk = prereqs.every(p => p.ok);
                                    return (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px', padding: '6px 10px', borderRadius: 6, background: allOk ? 'rgba(16,185,129,0.04)' : 'rgba(212,168,67,0.04)', border: `1px solid ${allOk ? 'rgba(16,185,129,0.12)' : 'rgba(212,168,67,0.12)'}` }}>
                                            {prereqs.map(p => (
                                                <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <span style={{ fontSize: 11 }}>{p.ok ? '✅' : '⚠️'}</span>
                                                    <span style={{ fontSize: 10, fontWeight: p.ok ? 500 : 600, color: p.ok ? 'var(--color-text-tertiary)' : 'var(--color-primary)' }}>{p.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}><User size={10} style={{ verticalAlign: -1, marginRight: 3 }} />Nome de quem retirou *</label>
                                        <input type="text" className="form-input" value={nomeRetirada} onChange={(e) => setNomeRetirada(e.target.value)} placeholder="Nome completo" style={{ fontSize: 12, padding: '5px 8px' }} />
                                    </div>
                                    <button onClick={handleEntrega} disabled={!nomeRetirada.trim() || (os.trocaPlaca && !placaTrocada)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6, border: 'none',
                                            cursor: (nomeRetirada.trim() && (!os.trocaPlaca || placaTrocada)) ? 'pointer' : 'not-allowed',
                                            background: (nomeRetirada.trim() && (!os.trocaPlaca || placaTrocada)) ? 'var(--color-success)' : 'var(--border-color)',
                                            color: (nomeRetirada.trim() && (!os.trocaPlaca || placaTrocada)) ? '#fff' : 'var(--color-text-tertiary)',
                                            fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-family)',
                                        }}>
                                        <Package size={11} /> Confirmar Entrega
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ComunicacaoTab({ os, onAdd, onRemove }: {
    os: OrdemDeServico;
    onAdd: (com: Comunicacao) => Promise<void>;
    onRemove: (id: string) => Promise<void>;
}) {
    const [canal, setCanal] = useState('WhatsApp');
    const [mensagem, setMensagem] = useState('');
    const [saving, setSaving] = useState(false);

    const handleAdd = async () => {
        if (!mensagem.trim()) return;
        setSaving(true);
        try {
            const com: Comunicacao = {
                id: crypto.randomUUID(),
                data: new Date().toISOString(),
                canal,
                mensagem: mensagem.trim(),
            };
            await onAdd(com);
            setMensagem('');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: '16px 0' }}>
            <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select value={canal} onChange={e => setCanal(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', fontSize: 13 }}>
                    {['WhatsApp', 'Telefone', 'E-mail', 'Presencial'].map(c => <option key={c}>{c}</option>)}
                </select>
                <input value={mensagem} onChange={e => setMensagem(e.target.value)} placeholder="Registrar comunicação..." style={{ flex: 1, minWidth: 200, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', fontSize: 13 }} />
                <button onClick={handleAdd} disabled={saving || !mensagem.trim()} style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                    {saving ? 'Salvando...' : 'Adicionar'}
                </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...(os.comunicacoes || [])].reverse().map(com => (
                    <div key={com.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div>
                            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginRight: 8 }}>{com.canal}</span>
                            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{new Date(com.data).toLocaleString('pt-BR')}</span>
                            {com.usuario && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>— {com.usuario}</span>}
                            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-primary)' }}>{com.mensagem}</p>
                        </div>
                        <button onClick={() => onRemove(com.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger, #ef4444)', fontSize: 18, lineHeight: 1, padding: 0 }} title="Apagar">×</button>
                    </div>
                ))}
                {(os.comunicacoes || []).length === 0 && <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>Nenhuma comunicação registrada.</p>}
            </div>
        </div>
    );
}

function historicoIconConfig(acao: string): { color: string } {
    const a = (acao || '').toLowerCase();
    if (a.includes('cria')) return { color: 'var(--color-success, #16a34a)' };
    if (a.includes('upload') || a.includes('anex')) return { color: 'var(--color-info, #3b82f6)' };
    if (a.includes('remov') || a.includes('exclui') || a.includes('apag')) return { color: 'var(--color-danger, #ef4444)' };
    if (a.includes('status') || a.includes('alter')) return { color: 'var(--color-warning, #f59e0b)' };
    if (a.includes('pagamento') || a.includes('financ')) return { color: 'var(--color-purple, #8b5cf6)' };
    return { color: 'var(--color-text-tertiary)' };
}

function HistoricoTab({ os }: { os: OrdemDeServico }) {
    const entries = [...(os.auditLog || [])].reverse();

    return (
        <div>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', background: 'var(--bg-card)', borderRadius: '12px 12px 0 0',
                border: '1px solid var(--border-color)', borderBottom: '2px solid var(--color-primary)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <History size={16} style={{ color: 'var(--color-primary)' }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>Linha do Tempo</span>
                </div>
                <span style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)',
                    background: 'var(--bg-body)', padding: '3px 10px', borderRadius: 8,
                    border: '1px solid var(--border-color)',
                }}>
                    {entries.length} evento{entries.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Log entries */}
            <div style={{
                background: 'var(--bg-card)', borderRadius: '0 0 12px 12px', border: '1px solid var(--border-color)',
                borderTop: 'none',
                padding: entries.length === 0 ? '40px 20px' : '8px 0',
                maxHeight: 600, overflowY: 'auto',
            }}>
                {entries.length === 0 ? (
                    <div style={{ textAlign: 'center' }}>
                        <History size={32} style={{ color: 'var(--color-text-tertiary)', marginBottom: 8 }} />
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-tertiary)' }}>Nenhum registro de atividade encontrado.</p>
                    </div>
                ) : (
                    entries.map((entry, idx) => {
                        const { color } = historicoIconConfig(entry.acao);
                        const date = new Date(entry.dataHora);
                        return (
                            <div key={entry.id} style={{
                                display: 'flex', alignItems: 'flex-start', gap: 12,
                                padding: '12px 16px',
                                borderBottom: idx < entries.length - 1 ? '1px solid var(--border-color)' : 'none',
                                transition: 'background 0.1s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-body)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                {/* Colored dot + line */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, flexShrink: 0 }}>
                                    <div style={{
                                        width: 10, height: 10, borderRadius: '50%', background: color,
                                        boxShadow: `0 0 8px ${color}55`,
                                    }} />
                                </div>
                                {/* Content */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                            {entry.acao}
                                        </span>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', flexShrink: 0 }}>
                                            {entry.usuario}
                                        </span>
                                    </div>
                                    {entry.detalhes && (
                                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                                            {entry.detalhes}
                                        </p>
                                    )}
                                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500, marginTop: 4, display: 'inline-block' }}>
                                        {date.toLocaleDateString('pt-BR')} {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

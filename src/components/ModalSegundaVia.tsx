// ============================================
// ModalSegundaVia - Modal de upload e preview do CRLV-e
// Fluxo: Upload PDF → Extrai dados → Preview → Confirma → Cria Cliente + Veículo + OS
// Baseado no ATPVeModal, sem seção de vendedor/transferência
// ============================================

import { useState, useRef, useEffect } from 'react';
import { Upload, FileText, User, Car, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { extrairDadosCRLVeComIA, type DadosCRLVe } from '../lib/crlveAI';
import { saveCliente, saveVeiculo, saveOrdem, getClientes } from '../lib/database';
import { uploadFileToSupabase } from '../lib/fileStorage';
import { gerarChecklistDinamico } from '../lib/configService';
import { finalizarOS } from '../lib/osService';
import {
    overlayStyle, modalStyle, headerStyle, bodyStyle, footerStyle,
    secaoStyle, secaoHeaderStyle, gridStyle, fieldWrapStyle, labelStyle,
    inputStyle, selectStyle, btnPrimary, btnSecondary, errorBoxStyle,
    FieldGrid, FieldGridMasked,
} from './ModalBase';

export interface DadosIniciaisSegundaVia {
    placa?: string;
    chassi?: string;
    renavam?: string;
    marcaModelo?: string;
    anoFabricacao?: string;
    anoModelo?: string;
    cor?: string;
    categoria?: string;
    combustivel?: string;
    nomeProprietario?: string;
    cpfCnpjProprietario?: string;
    telefone?: string;
    cep?: string;
    endereco?: string;
    numero?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    fileBase64?: string;
    fileName?: string;
    // IDs da OS já criada (modo revisar)
    osId?: string;
    clienteId?: string;
    veiculoId?: string;
}

interface ModalSegundaViaProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (osId: string) => void;
    dadosIniciais?: DadosIniciaisSegundaVia;
    /**
     * 'coletar' = coleta CRLV-e para preencher Detran (padrão)
     * 'revisar' = OS já criada, modal para conferência/edição
     */
    modo?: 'coletar' | 'revisar';
}

type Etapa = 'upload' | 'analisando' | 'preview' | 'salvando' | 'sucesso' | 'erro';

interface DadosFormulario {
    placa: string;
    chassi: string;
    renavam: string;
    marcaModelo: string;
    anoFabricacao: string;
    anoModelo: string;
    cor: string;
    categoria: string;
    combustivel: string;
    proprietario: {
        nome: string;
        cpfCnpj: string;
        tipoCpfCnpj: 'CPF' | 'CNPJ';
        endereco: string;
        numero: string;
        bairro: string;
        municipio: string;
        uf: string;
        cep: string;
    };
}

const DADOS_VAZIOS: DadosFormulario = {
    placa: '', chassi: '', renavam: '', marcaModelo: '',
    anoFabricacao: '', anoModelo: '', cor: '', categoria: '', combustivel: '',
    proprietario: {
        nome: '', cpfCnpj: '', tipoCpfCnpj: 'CPF',
        endereco: '', numero: '', bairro: '', municipio: '', uf: '', cep: '',
    },
};

export default function ModalSegundaVia({ isOpen, onClose, onSuccess, dadosIniciais, modo = 'coletar' }: ModalSegundaViaProps) {
    const [etapa, setEtapa] = useState<Etapa>('upload');
    const [dados, setDados] = useState<DadosFormulario | null>(null);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [erro, setErro] = useState('');
    const [osId, setOsId] = useState('');
    const [clienteIdState, setClienteIdState] = useState('');
    const [veiculoIdState, setVeiculoIdState] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const [identidade, setIdentidade] = useState({ numero: '', orgaoExpedidor: '', uf: '' });

    // Pré-preenche quando dadosIniciais é fornecido
    useEffect(() => {
        if (dadosIniciais && isOpen) {
            const cpfDigits = (dadosIniciais.cpfCnpjProprietario || '').replace(/\D/g, '');
            setDados({
                placa: dadosIniciais.placa || '',
                chassi: dadosIniciais.chassi || '',
                renavam: dadosIniciais.renavam || '',
                marcaModelo: dadosIniciais.marcaModelo || '',
                anoFabricacao: dadosIniciais.anoFabricacao || '',
                anoModelo: dadosIniciais.anoModelo || '',
                cor: dadosIniciais.cor || '',
                categoria: dadosIniciais.categoria || '',
                combustivel: dadosIniciais.combustivel || '',
                proprietario: {
                    nome: dadosIniciais.nomeProprietario || '',
                    cpfCnpj: dadosIniciais.cpfCnpjProprietario || '',
                    tipoCpfCnpj: cpfDigits.length > 11 ? 'CNPJ' : 'CPF',
                    endereco: dadosIniciais.endereco || '',
                    numero: dadosIniciais.numero || '',
                    bairro: dadosIniciais.bairro || '',
                    municipio: dadosIniciais.municipio || '',
                    uf: dadosIniciais.uf || '',
                    cep: dadosIniciais.cep || '',
                },
            });
            setModoManual(true);
            setEtapa('preview');

            // IDs da OS já criada (modo revisar)
            if (dadosIniciais.osId) setOsId(dadosIniciais.osId);
            if (dadosIniciais.clienteId) setClienteIdState(dadosIniciais.clienteId);
            if (dadosIniciais.veiculoId) setVeiculoIdState(dadosIniciais.veiculoId);
            if (dadosIniciais.telefone) setTelefoneProprietario(dadosIniciais.telefone);

            // Se veio com PDF em base64, converter para File
            if (dadosIniciais.fileBase64) {
                try {
                    const arr = dadosIniciais.fileBase64.split(',');
                    const bstr = atob(arr.pop() || '');
                    const u8 = new Uint8Array(bstr.length);
                    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
                    const file = new File([u8], dadosIniciais.fileName || 'ficha_2via.pdf', { type: 'application/pdf' });
                    setPdfFile(file);
                } catch (e) {
                    console.warn('[Matilde] Erro ao converter PDF base64:', e);
                }
            }

            // Busca cliente existente (modo coletar apenas — em revisar o clienteId já está definido)
            if (dadosIniciais.cpfCnpjProprietario && !dadosIniciais.clienteId) {
                buscarProprietario(dadosIniciais.cpfCnpjProprietario);
            } else if (dadosIniciais.clienteId) {
                setClienteExistente({ id: dadosIniciais.clienteId, nome: dadosIniciais.nomeProprietario || '' });
            }
        }
    }, [dadosIniciais, isOpen]);

    const [clienteExistente, setClienteExistente] = useState<{ id: string; nome: string } | null>(null);
    const [telefoneProprietario, setTelefoneProprietario] = useState('');
    const [modoManual, setModoManual] = useState(false);
    const [buscandoCep, setBuscandoCep] = useState(false);
    const [erroCep, setErroCep] = useState('');
    const [buscandoProprietario, setBuscandoProprietario] = useState(false);

    const updateDados = (path: string, value: string) => {
        setDados(prev => {
            if (!prev) return prev;
            const parts = path.split('.');
            if (parts.length === 1) return { ...prev, [parts[0]!]: value };
            const section = parts[0]! as keyof DadosFormulario;
            const field = parts[1]!;
            return { ...prev, [section]: { ...(prev[section] as any), [field]: value } };
        });
    };

    // ---- BUSCA DE CEP ----
    const buscarCep = async () => {
        const cepLimpo = (dados?.proprietario?.cep || '').replace(/\D/g, '');
        if (cepLimpo.length !== 8) return;
        setBuscandoCep(true);
        setErroCep('');
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
            const json = await res.json();
            if (json.erro) { setErroCep('CEP não encontrado.'); setTimeout(() => setErroCep(''), 4000); return; }
            if (!dados?.proprietario?.endereco?.trim()) updateDados('proprietario.endereco', json.logradouro || '');
            if (!dados?.proprietario?.bairro?.trim())    updateDados('proprietario.bairro',   json.bairro     || '');
            if (!dados?.proprietario?.municipio?.trim()) updateDados('proprietario.municipio', json.localidade || '');
            if (!dados?.proprietario?.uf?.trim())        updateDados('proprietario.uf',        json.uf         || '');
        } catch {
            setErroCep('Erro ao buscar CEP. Verifique sua conexão.');
            setTimeout(() => setErroCep(''), 4000);
        } finally {
            setBuscandoCep(false);
        }
    };

    // ---- BUSCA DE PROPRIETÁRIO POR CPF/CNPJ ----
    const buscarProprietario = async (cpfRaw: string) => {
        const digits = cpfRaw.replace(/\D/g, '');
        if (digits.length !== 11 && digits.length !== 14) return;
        setBuscandoProprietario(true);
        try {
            const clientes = await getClientes();
            const encontrado = clientes.find(c => c.cpfCnpj.replace(/\D/g, '') === digits);
            if (encontrado) {
                setClienteExistente({ id: encontrado.id, nome: encontrado.nome });
                setTelefoneProprietario((encontrado.telefones || [])[0] || '');
                updateDados('proprietario.nome', encontrado.nome || '');
            } else {
                setClienteExistente(null);
            }
        } catch { /* ignora */ } finally {
            setBuscandoProprietario(false);
        }
    };

    // ---- UPLOAD E EXTRAÇÃO ----
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
            setErro('Selecione um arquivo PDF válido.');
            return;
        }
        try {
            setErro('');
            setPdfFile(file);
            setEtapa('analisando');

            const temChaveAI = !!import.meta.env.VITE_GEMINI_API_KEY;
            if (!temChaveAI) {
                throw new Error('Chave Gemini não configurada. Use o modo manual.');
            }

            const extraido: DadosCRLVe = await extrairDadosCRLVeComIA(file);
            console.log('[Matilde] CRLV-e extraído:', JSON.stringify(extraido, null, 2));

            if (!extraido.placa && !extraido.chassi) {
                setErro('Não foi possível extrair dados do PDF. Verifique se é um CRLV-e válido.');
                setEtapa('upload');
                return;
            }

            setDados({
                placa: extraido.placa,
                chassi: extraido.chassi,
                renavam: extraido.renavam,
                marcaModelo: extraido.marcaModelo,
                anoFabricacao: extraido.anoFabricacao,
                anoModelo: extraido.anoModelo,
                cor: extraido.cor,
                categoria: extraido.categoria,
                combustivel: extraido.combustivel,
                proprietario: extraido.proprietario,
            });

            // Busca cliente existente
            const cpfBusca = extraido.proprietario?.cpfCnpj;
            if (cpfBusca) {
                try {
                    const clientes = await getClientes();
                    const encontrado = clientes.find(c => c.cpfCnpj.replace(/\D/g, '') === cpfBusca.replace(/\D/g, ''));
                    if (encontrado) {
                        setClienteExistente({ id: encontrado.id, nome: encontrado.nome });
                        setTelefoneProprietario((encontrado.telefones || [])[0] || '');
                    }
                } catch { /* ignora */ }
            }

            setEtapa('preview');
        } catch (err: any) {
            setErro(`Erro ao ler PDF: ${err.message}`);
            setEtapa('upload');
        }
    };

    // ---- CAMPOS FALTANDO (modo revisar) ----
    const camposFaltando = (): string[] => {
        if (!dados) return [];
        const f: string[] = [];
        if (!dados.placa?.trim() && !dados.chassi?.trim()) f.push('Placa ou Chassi');
        if (!dados.renavam?.trim()) f.push('RENAVAM');
        if (!dados.proprietario?.nome?.trim()) f.push('Nome do proprietário');
        if (!dados.proprietario?.cpfCnpj?.trim()) f.push('CPF/CNPJ');
        if (!telefoneProprietario?.trim()) f.push('Telefone');
        if (dados.proprietario?.cpfCnpj && dados.proprietario.cpfCnpj.replace(/\D/g, '').length <= 11 && !identidade.numero?.trim()) f.push('Nº Identidade (RG)');
        return f;
    };

    // ---- SALVAR ALTERAÇÕES (modo revisar — OS já existe) ----
    const handleSalvarAlteracoes = async () => {
        if (!dados || !osId) return;
        setErro('');
        const faltando = camposFaltando();
        if (faltando.length > 0) {
            setErro(`Preencha os campos obrigatórios: ${faltando.join(', ')}.`);
            return;
        }
        setEtapa('salvando');
        try {
            const cpfProprietario = dados.proprietario?.cpfCnpj || '';
            const nomeProprietario = dados.proprietario?.nome || '';

            // Atualizar cliente
            if (clienteIdState) {
                const clientes = await getClientes();
                const cli = clientes.find(c => c.id === clienteIdState);
                if (cli) {
                    const enderecoCompleto = [
                        dados.proprietario?.endereco,
                        dados.proprietario?.numero,
                        dados.proprietario?.bairro,
                        dados.proprietario?.cep ? `CEP: ${dados.proprietario.cep}` : '',
                        dados.proprietario?.municipio,
                        dados.proprietario?.uf,
                    ].filter(Boolean).join(', ');

                    await saveCliente({
                        ...cli,
                        nome: nomeProprietario || cli.nome,
                        cpfCnpj: cpfProprietario || cli.cpfCnpj,
                        telefones: telefoneProprietario.trim()
                            ? [...new Set([telefoneProprietario.trim(), ...(cli.telefones || [])])]
                            : cli.telefones || [],
                        observacoes: [
                            cli.observacoes || '',
                            enderecoCompleto ? `Endereço: ${enderecoCompleto}` : '',
                            identidade.numero ? `RG: ${identidade.numero}${identidade.orgaoExpedidor ? ` ${identidade.orgaoExpedidor}` : ''}${identidade.uf ? `/${identidade.uf}` : ''}` : '',
                        ].filter(Boolean).join(' | '),
                    });
                }
            }

            // Atualizar veículo
            if (veiculoIdState) {
                await saveVeiculo({
                    id: veiculoIdState,
                    placa: dados.placa || '',
                    renavam: dados.renavam || '',
                    chassi: dados.chassi || '',
                    marcaModelo: dados.marcaModelo || '',
                    clienteId: clienteIdState,
                    categoria: dados.categoria || undefined,
                    observacoes: [
                        dados.cor ? `Cor: ${dados.cor}` : '',
                        dados.anoFabricacao ? `Ano: ${dados.anoFabricacao}/${dados.anoModelo}` : '',
                        dados.combustivel ? `Combustível: ${dados.combustivel}` : '',
                    ].filter(Boolean).join(' | '),
                });
            }

            setEtapa('sucesso');
        } catch (err: any) {
            setErro(`Erro ao salvar alterações: ${err.message}`);
            setEtapa('erro');
        }
    };

    // ---- RESET ----
    const resetModal = () => {
        setEtapa('upload');
        setDados(null);
        setPdfFile(null);
        setErro('');
        setOsId('');
        setClienteIdState('');
        setVeiculoIdState('');
        setClienteExistente(null);
        setTelefoneProprietario('');
        setIdentidade({ numero: '', orgaoExpedidor: '', uf: '' });
        setModoManual(false);
        setBuscandoCep(false);
        setErroCep('');
        setBuscandoProprietario(false);
    };

    if (!isOpen) return null;

    const tituloHeader =
        etapa === 'upload'     ? 'Processar CRLV-e — 2ª Via' :
        etapa === 'analisando' ? 'Analisando CRLV-e...' :
        etapa === 'preview'    ? (modo === 'revisar' ? 'Conferir OS — 2ª Via' : modoManual ? 'Preencher Dados — 2ª Via' : 'Conferir Dados Extraídos') :
        etapa === 'salvando'   ? 'Salvando...' :
        etapa === 'sucesso'    ? 'Tudo Pronto!' :
                                 'Erro';

    return (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) { resetModal(); onClose(); } }}>
            <div style={modalStyle}>

                {/* ── HEADER ── */}
                <div style={headerStyle}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-text-primary, #111)' }}>
                            {tituloHeader}
                        </div>
                        {etapa === 'preview' && (
                            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary, #6b7280)', marginTop: 2 }}>
                                {modoManual ? 'Preenchimento manual' : `CRLV-e — ${pdfFile?.name}`}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => { resetModal(); onClose(); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--color-text-secondary, #6b7280)', lineHeight: 1 }}
                        aria-label="Fechar"
                    >✕</button>
                </div>

                {/* ── BODY ── */}
                <div style={bodyStyle}>

                    {/* ETAPA 1: UPLOAD */}
                    {etapa === 'upload' && (
                        <>
                            <p style={{ margin: '0 0 16px', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                                {modo === 'criar'
                                    ? <>Anexe o CRLV-e (PDF) para criar automaticamente o <strong>cliente</strong>, <strong>veículo</strong> e <strong>ordem de serviço</strong>.</>
                                    : <>Anexe o CRLV-e (PDF) para preencher automaticamente o site do Detran.</>
                                }
                            </p>

                            <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} style={{ display: 'none' }} />

                            <div
                                onClick={() => fileRef.current?.click()}
                                style={{
                                    border: '2px dashed var(--border-color, #d1d5db)',
                                    borderRadius: 12, padding: '40px 24px',
                                    textAlign: 'center', cursor: 'pointer',
                                    transition: 'border-color 0.2s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-cyan, #06b6d4)')}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color, #d1d5db)')}
                            >
                                <Upload size={40} style={{ color: 'var(--color-cyan, #06b6d4)', marginBottom: 12 }} />
                                <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Clique para selecionar o CRLV-e</p>
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>Apenas arquivos PDF</p>
                            </div>

                            {erro && (
                                <div style={{
                                    marginTop: 16, padding: '12px 16px', borderRadius: 8,
                                    background: 'var(--color-danger-bg, #fef2f2)',
                                    color: 'var(--color-danger, #dc2626)',
                                    display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem',
                                }}>
                                    <AlertCircle size={18} />
                                    {erro}
                                </div>
                            )}

                            <div style={{
                                marginTop: 20, textAlign: 'center',
                                borderTop: '1px solid var(--border-color, #e5e7eb)', paddingTop: 16,
                            }}>
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
                                    Não tem o CRLV-e agora?
                                </p>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => { setModoManual(true); setDados({ ...DADOS_VAZIOS }); setEtapa('preview'); }}
                                        style={{
                                            padding: '10px 20px', borderRadius: 10,
                                            border: '1px solid var(--color-cyan, #06b6d4)',
                                            background: 'var(--color-cyan-bg, #ecfeff)',
                                            cursor: 'pointer', fontWeight: 600,
                                            fontFamily: 'inherit', fontSize: '0.88rem',
                                            color: 'var(--color-cyan, #0891b2)',
                                        }}
                                    >
                                        Preencher manualmente
                                    </button>
                                    <button
                                        onClick={() => {
                                            // Ativar captura automática na extensão
                                            window.postMessage({
                                                source: 'MATILDE_CRM',
                                                action: 'DEFINIR_SERVICO',
                                                payload: { servico: 'segunda_via' },
                                            }, '*');
                                            window.open('https://detran.mg.gov.br/veiculos/documentos-de-veiculos/emitir-a-2-via-do-crv', '_blank');
                                            resetModal(); onClose();
                                        }}
                                        style={{
                                            padding: '10px 20px', borderRadius: 10,
                                            border: '1px solid var(--border-color, #d1d5db)',
                                            background: 'var(--bg-secondary, #f9fafb)',
                                            cursor: 'pointer', fontWeight: 600,
                                            fontFamily: 'inherit', fontSize: '0.88rem',
                                            color: 'var(--color-text-secondary)',
                                            display: 'inline-flex', alignItems: 'center', gap: 8,
                                        }}
                                    >
                                        Ir ao Detran sem preencher
                                        <ExternalLink size={15} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ETAPA ANALISANDO */}
                    {etapa === 'analisando' && (
                        <div style={{ textAlign: 'center', padding: '48px 0' }}>
                            <style>{`
                                @keyframes matilde-spin { to { transform: rotate(360deg) } }
                                @keyframes matilde-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
                            `}</style>
                            <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 20px' }}>
                                <div style={{
                                    width: 64, height: 64, border: '4px solid var(--border-color, #e5e7eb)',
                                    borderTopColor: 'var(--color-cyan, #06b6d4)', borderRadius: '50%',
                                    animation: 'matilde-spin 1s linear infinite',
                                }} />
                                <div style={{
                                    position: 'absolute', top: '50%', left: '50%',
                                    transform: 'translate(-50%, -50%)', fontSize: 22,
                                    animation: 'matilde-pulse 1.5s ease-in-out infinite',
                                }}>🤖</div>
                            </div>
                            <p style={{ fontWeight: 700, fontSize: '1rem', margin: '0 0 6px' }}>IA analisando o CRLV-e...</p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>{pdfFile?.name}</p>
                        </div>
                    )}

                    {/* ETAPA 2: PREVIEW */}
                    {etapa === 'preview' && dados && (
                        <>
                            {erro && (
                                <div style={errorBoxStyle}><strong>Atenção:</strong> {erro}</div>
                            )}

                            {/* Banner CRLV-e */}
                            {!modoManual && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: 8, marginBottom: 14,
                                    background: 'var(--color-cyan-bg, #ecfeff)', color: 'var(--color-cyan, #0891b2)',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8,
                                }}>
                                    <FileText size={16} />
                                    <span>Documento: <strong>CRLV-e</strong> — {pdfFile?.name}</span>
                                </div>
                            )}

                            {/* Banner cliente */}
                            {clienteExistente ? (
                                <div style={{
                                    padding: '10px 14px', borderRadius: 8, marginBottom: 14,
                                    background: '#f0fdf4', color: '#16a34a',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8,
                                    border: '1px solid #bbf7d0',
                                }}>
                                    <User size={16} />
                                    <span>
                                        Cliente encontrado: <strong>{clienteExistente.nome}</strong>
                                        {telefoneProprietario
                                            ? <> — <strong>{telefoneProprietario}</strong></>
                                            : <span style={{ color: '#d97706' }}> — sem telefone cadastrado, preencha abaixo</span>
                                        }
                                    </span>
                                </div>
                            ) : dados.proprietario?.cpfCnpj ? (
                                <div style={{
                                    padding: '10px 14px', borderRadius: 8, marginBottom: 14,
                                    background: '#fffbeb', color: '#92400e',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8,
                                    border: '1px solid #fde68a',
                                }}>
                                    <User size={16} />
                                    <span>Proprietário não encontrado na base — será cadastrado como novo cliente.</span>
                                </div>
                            ) : null}

                            {/* Banner campos obrigatórios faltando (modo revisar) */}
                            {modo === 'revisar' && camposFaltando().length > 0 && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: 8, marginBottom: 14,
                                    background: '#fffbeb', color: '#92400e',
                                    fontSize: '0.85rem', border: '1px solid #fde68a',
                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                }}>
                                    <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                                    <div>
                                        <strong>Campos obrigatórios faltando:</strong>{' '}
                                        {camposFaltando().join(', ')}
                                    </div>
                                </div>
                            )}

                            {/* ── SEÇÃO: VEÍCULO ── */}
                            <div style={secaoStyle}>
                                <div style={secaoHeaderStyle}><Car size={14} /> Veículo</div>
                                <div style={gridStyle}>
                                    <FieldGrid label="Placa" path="placa" value={dados.placa} onUpdate={updateDados} />
                                    <FieldGridMasked label="Chassi" path="chassi" value={dados.chassi || ''} onUpdate={updateDados} mascara="chassi" />
                                    <FieldGridMasked label="RENAVAM" path="renavam" value={dados.renavam || ''} onUpdate={updateDados} mascara="renavam" />
                                    <FieldGrid label="Marca / Modelo" path="marcaModelo" value={dados.marcaModelo} onUpdate={updateDados} span />
                                    <FieldGrid label="Cor" path="cor" value={dados.cor} onUpdate={updateDados} />
                                    <FieldGrid label="Ano Fabricação" path="anoFabricacao" value={dados.anoFabricacao} onUpdate={updateDados} />
                                    <FieldGrid label="Ano Modelo" path="anoModelo" value={dados.anoModelo} onUpdate={updateDados} />
                                    <FieldGrid label="Categoria" path="categoria" value={dados.categoria} onUpdate={updateDados} />
                                    <FieldGrid label="Combustível" path="combustivel" value={dados.combustivel} onUpdate={updateDados} />
                                </div>
                            </div>

                            {/* ── SEÇÃO: PROPRIETÁRIO ── */}
                            <div style={secaoStyle}>
                                <div style={secaoHeaderStyle}><User size={14} /> Proprietário</div>
                                <div style={gridStyle}>
                                    {/* Tipo de Documento */}
                                    <div style={fieldWrapStyle}>
                                        <label style={labelStyle}>Tipo de Documento</label>
                                        <select
                                            style={selectStyle}
                                            value={dados.proprietario?.tipoCpfCnpj || 'CPF'}
                                            onChange={e => updateDados('proprietario.tipoCpfCnpj', e.target.value)}
                                        >
                                            <option value="CPF">CPF (Pessoa Física)</option>
                                            <option value="CNPJ">CNPJ (Pessoa Jurídica)</option>
                                        </select>
                                    </div>
                                    {/* CPF/CNPJ */}
                                    <FieldGridMasked
                                        label="CPF/CNPJ"
                                        path="proprietario.cpfCnpj"
                                        value={dados.proprietario?.cpfCnpj || ''}
                                        onUpdate={updateDados}
                                        mascara="cpfcnpj"
                                        onAfterUpdate={buscarProprietario}
                                        disabled={buscandoProprietario}
                                        placeholder={dados.proprietario?.tipoCpfCnpj === 'CNPJ' ? '00.000.000/0001-00' : '000.000.000-00'}
                                    />
                                    {/* Nome */}
                                    <FieldGrid label="Nome completo" path="proprietario.nome" value={dados.proprietario?.nome} onUpdate={updateDados} span />
                                    {/* Telefone */}
                                    <div style={fieldWrapStyle}>
                                        <label style={{ ...labelStyle, ...(!telefoneProprietario ? { color: 'var(--color-warning, #d97706)' } : {}) }}>
                                            Telefone *
                                        </label>
                                        <input
                                            style={{
                                                ...inputStyle,
                                                ...(!telefoneProprietario ? { borderColor: 'var(--color-warning, #d97706)', background: 'var(--color-warning-bg, #fffbeb)' } : {}),
                                            }}
                                            value={telefoneProprietario}
                                            onChange={e => setTelefoneProprietario(e.target.value)}
                                            placeholder="(31) 99999-9999 — obrigatório"
                                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)')}
                                            onBlurCapture={e => (e.currentTarget.style.borderColor = !telefoneProprietario ? 'var(--color-warning, #d97706)' : 'var(--border-color, #d1d5db)')}
                                        />
                                    </div>
                                    {/* CEP com busca */}
                                    <div style={fieldWrapStyle}>
                                        <label style={labelStyle}>CEP</label>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <input
                                                style={{ ...inputStyle, flex: 1 }}
                                                value={dados.proprietario?.cep || ''}
                                                onChange={e => {
                                                    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                                                    const masked = digits.length > 5 ? `${digits.slice(0,5)}-${digits.slice(5)}` : digits;
                                                    updateDados('proprietario.cep', masked);
                                                }}
                                                placeholder="00000-000"
                                                maxLength={9}
                                                onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)')}
                                                onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border-color, #d1d5db)')}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && !buscandoCep && (dados.proprietario?.cep || '').replace(/\D/g, '').length === 8)
                                                        buscarCep();
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={buscarCep}
                                                disabled={buscandoCep || (dados.proprietario?.cep || '').replace(/\D/g, '').length !== 8}
                                                style={{
                                                    padding: '7px 12px', borderRadius: 8, border: 'none',
                                                    background: 'var(--color-info, #3b82f6)', color: '#fff',
                                                    cursor: buscandoCep || (dados.proprietario?.cep || '').replace(/\D/g, '').length !== 8 ? 'not-allowed' : 'pointer',
                                                    opacity: buscandoCep || (dados.proprietario?.cep || '').replace(/\D/g, '').length !== 8 ? 0.5 : 1,
                                                    fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, flexShrink: 0,
                                                }}
                                            >
                                                {buscandoCep ? '...' : 'Buscar'}
                                            </button>
                                        </div>
                                        {erroCep && (
                                            <span style={{ fontSize: '0.78rem', color: 'var(--color-danger, #dc2626)', marginTop: 2 }}>
                                                {erroCep}
                                            </span>
                                        )}
                                    </div>
                                    <FieldGrid label="Endereço" path="proprietario.endereco" value={dados.proprietario?.endereco} onUpdate={updateDados} span />
                                    <FieldGrid label="Número" path="proprietario.numero" value={dados.proprietario?.numero} onUpdate={updateDados} />
                                    <FieldGrid label="Bairro" path="proprietario.bairro" value={dados.proprietario?.bairro} onUpdate={updateDados} />
                                    <FieldGrid label="Município" path="proprietario.municipio" value={dados.proprietario?.municipio} onUpdate={updateDados} />
                                    <FieldGrid label="UF" path="proprietario.uf" value={dados.proprietario?.uf} onUpdate={updateDados} />

                                    {/* Identidade — só para CPF */}
                                    {dados.proprietario?.cpfCnpj && dados.proprietario.cpfCnpj.replace(/\D/g, '').length <= 11 && (
                                        <div style={{
                                            gridColumn: '1 / -1',
                                            background: 'var(--color-success-bg, #f0fdf4)',
                                            borderRadius: 8, padding: '12px 14px',
                                            border: '1px solid #bbf7d0',
                                        }}>
                                            <p style={{
                                                margin: '0 0 10px', fontSize: '0.8rem', fontWeight: 700,
                                                color: 'var(--color-success, #16a34a)',
                                                textTransform: 'uppercase', letterSpacing: '0.5px',
                                            }}>
                                                Documento de Identidade (obrigatório para CPF)
                                            </p>
                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                                                <div style={fieldWrapStyle}>
                                                    <label style={labelStyle}>Nº Identidade (RG)</label>
                                                    <input type="text" style={inputStyle}
                                                        value={identidade.numero}
                                                        onChange={e => setIdentidade(prev => ({ ...prev, numero: e.target.value }))}
                                                        placeholder="MG-12.345.678"
                                                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)')}
                                                        onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border-color, #d1d5db)')}
                                                    />
                                                </div>
                                                <div style={fieldWrapStyle}>
                                                    <label style={labelStyle}>Órgão Expedidor</label>
                                                    <input type="text" style={inputStyle}
                                                        value={identidade.orgaoExpedidor}
                                                        onChange={e => setIdentidade(prev => ({ ...prev, orgaoExpedidor: e.target.value.toUpperCase() }))}
                                                        placeholder="SSP"
                                                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)')}
                                                        onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border-color, #d1d5db)')}
                                                    />
                                                </div>
                                                <div style={fieldWrapStyle}>
                                                    <label style={labelStyle}>UF</label>
                                                    <select style={selectStyle}
                                                        value={identidade.uf}
                                                        onChange={e => setIdentidade(prev => ({ ...prev, uf: e.target.value }))}
                                                    >
                                                        <option value="">UF</option>
                                                        {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                                                            <option key={uf} value={uf}>{uf}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ETAPA 3: SALVANDO */}
                    {etapa === 'salvando' && (
                        <div style={{ textAlign: 'center', padding: '40px 0' }}>
                            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                            <div style={{
                                width: 48, height: 48, border: '4px solid var(--border-color)',
                                borderTopColor: 'var(--color-cyan)', borderRadius: '50%',
                                animation: 'spin 1s linear infinite', margin: '0 auto 16px',
                            }} />
                            <p style={{ fontWeight: 600 }}>
                                {modo === 'revisar' ? 'Salvando alterações...' : 'Criando cliente, veículo e OS...'}
                            </p>
                        </div>
                    )}

                    {/* ETAPA 4: SUCESSO */}
                    {etapa === 'sucesso' && dados && (
                        <div style={{ textAlign: 'center', padding: '30px 0' }}>
                            <CheckCircle size={56} style={{ color: 'var(--color-success, #16a34a)', marginBottom: 16 }} />
                            <h3 style={{ margin: '0 0 8px' }}>
                                {modo === 'revisar' ? 'Alterações salvas!' : 'Tudo criado com sucesso!'}
                            </h3>
                            <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 24px', fontSize: '0.9rem' }}>
                                {modo === 'revisar'
                                    ? 'Os dados da OS foram atualizados.'
                                    : 'Cliente, veículo e OS foram cadastrados automaticamente.'}
                            </p>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => { resetModal(); onClose(); onSuccess(osId); }}
                                    style={{
                                        padding: '12px 24px', borderRadius: 10, border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)', cursor: 'pointer', fontWeight: 600,
                                        fontFamily: 'inherit', fontSize: '0.9rem',
                                    }}
                                >
                                    Abrir OS
                                </button>
                                <button
                                    onClick={() => {
                                        // Ativar captura automática na extensão com osId
                                        window.postMessage({
                                            source: 'MATILDE_CRM',
                                            action: 'DEFINIR_SERVICO',
                                            payload: { servico: 'segunda_via' },
                                        }, '*');
                                        // Salvar contexto da OS para a extensão vincular o PDF
                                        window.dispatchEvent(new CustomEvent('MATILDE_SEND_CONTEXT', {
                                            detail: { osId, placa: dados.placa || '' },
                                        }));
                                        window.dispatchEvent(new CustomEvent('MATILDE_PREENCHER_DETRAN', {
                                            detail: {
                                                servico: 'segunda_via',
                                                placa: dados.placa || '',
                                                chassi: dados.chassi || '',
                                                renavam: dados.renavam || '',
                                                nomeProprietario: dados.proprietario?.nome || '',
                                                cpfCnpjProprietario: dados.proprietario?.cpfCnpj || '',
                                                tipoCpfCnpj: dados.proprietario?.tipoCpfCnpj || 'CPF',
                                                cep: dados.proprietario?.cep || '',
                                                endereco: dados.proprietario?.endereco || '',
                                                numero: dados.proprietario?.numero || '',
                                                bairro: dados.proprietario?.bairro || '',
                                                municipio: dados.proprietario?.municipio || '',
                                                uf: dados.proprietario?.uf || '',
                                            },
                                        }));
                                        window.open('https://detran.mg.gov.br/veiculos/documentos-de-veiculos/emitir-a-2-via-do-crv', '_blank');
                                        resetModal(); onClose(); onSuccess(osId);
                                    }}
                                    style={{
                                        padding: '12px 24px', borderRadius: 10, border: 'none',
                                        background: 'var(--color-cyan, #06b6d4)', color: '#fff',
                                        cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', fontSize: '0.9rem',
                                        display: 'inline-flex', alignItems: 'center', gap: 8,
                                    }}
                                >
                                    Ir ao Detran
                                    <ExternalLink size={15} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ETAPA 5: ERRO */}
                    {etapa === 'erro' && (
                        <div style={{ textAlign: 'center', padding: '30px 0' }}>
                            <AlertCircle size={48} style={{ color: 'var(--color-danger, #dc2626)', marginBottom: 16 }} />
                            <h3 style={{ margin: '0 0 8px', color: 'var(--color-danger)' }}>Erro ao salvar</h3>
                            <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 24px', fontSize: '0.9rem' }}>
                                {erro}
                            </p>
                            <button
                                onClick={() => setEtapa('preview')}
                                style={{
                                    padding: '12px 32px', borderRadius: 10, border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)', cursor: 'pointer', fontWeight: 600,
                                    fontFamily: 'inherit',
                                }}
                            >
                                Tentar novamente
                            </button>
                        </div>
                    )}
                </div>

                {/* ── FOOTER (só na etapa preview) ── */}
                {etapa === 'preview' && (
                    <div style={footerStyle}>
                        {modo === 'revisar' ? (
                            <button style={btnSecondary} onClick={() => { resetModal(); onClose(); }}>
                                Fechar
                            </button>
                        ) : (
                            <button style={btnSecondary} onClick={() => resetModal()}>
                                Voltar
                            </button>
                        )}
                        {modo === 'revisar' ? (
                            <button style={btnPrimary} onClick={handleSalvarAlteracoes}>
                                Salvar Alterações
                            </button>
                        ) : (
                            <button
                                style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                                onClick={() => {
                                    // Ativar captura na extensão
                                    window.postMessage({
                                        source: 'MATILDE_CRM',
                                        action: 'DEFINIR_SERVICO',
                                        payload: { servico: 'segunda_via' },
                                    }, '*');
                                    // Enviar dados para preenchimento automático
                                    if (dados) {
                                        window.dispatchEvent(new CustomEvent('MATILDE_PREENCHER_DETRAN', {
                                            detail: {
                                                servico: 'segunda_via',
                                                placa: dados.placa || '',
                                                chassi: dados.chassi || '',
                                                renavam: dados.renavam || '',
                                                nomeProprietario: dados.proprietario?.nome || '',
                                                cpfCnpjProprietario: dados.proprietario?.cpfCnpj || '',
                                                tipoCpfCnpj: dados.proprietario?.tipoCpfCnpj || 'CPF',
                                                cep: dados.proprietario?.cep || '',
                                                endereco: dados.proprietario?.endereco || '',
                                                numero: dados.proprietario?.numero || '',
                                                bairro: dados.proprietario?.bairro || '',
                                                municipio: dados.proprietario?.municipio || '',
                                                uf: dados.proprietario?.uf || '',
                                            },
                                        }));
                                    }
                                    window.open('https://detran.mg.gov.br/veiculos/documentos-de-veiculos/emitir-a-2-via-do-crv', '_blank');
                                    resetModal(); onClose();
                                }}
                            >
                                Ir ao Detran <ExternalLink size={15} />
                            </button>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}

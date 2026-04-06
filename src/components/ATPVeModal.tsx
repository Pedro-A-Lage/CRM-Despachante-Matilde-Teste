// ============================================
// ATPVeModal - Modal de upload e preview do ATPV-e
// Fluxo: Upload PDF → Extrai dados → Preview → Confirma → Cria Cliente + Veículo + OS
// Visual: baseado em PrimeiroEmplacamentoModal (grid, seções fixas, header/body/footer)
// ============================================

import { useState, useRef, useEffect } from 'react';
import { Upload, FileText, User, Car, ClipboardList, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { extractVehicleData, type DadosExtraidos } from '../lib/pdfParser';
import { extrairDadosATPVeComIA } from '../lib/atpveAI';
import { saveCliente, saveVeiculo, saveOrdem, getClientes } from '../lib/database';
import { uploadFileToSupabase } from '../lib/fileStorage';
import { gerarChecklistDinamico } from '../lib/configService';
import { finalizarOS } from '../lib/osService';
import type { TipoServico } from '../types';
import {
    overlayStyle, modalStyle, headerStyle, bodyStyle, footerStyle,
    secaoStyle, secaoHeaderStyle, gridStyle, fieldWrapStyle, labelStyle,
    inputStyle, selectStyle, btnPrimary, btnSecondary, errorBoxStyle,
    FieldGrid, FieldGridMasked, FieldGridDate,
    ModalOverlay, ModalContainer, ModalHeader, ModalBody, ModalFooter, Section, SectionGrid,
} from './ModalBase';

export interface DadosIniciaisModal {
  placa?: string;
  chassi?: string;
  renavam?: string;
  valorRecibo?: string;
  dataAquisicao?: string;
  tipoCpfCnpjComprador?: 'CPF' | 'CNPJ';
  cpfCnpjComprador?: string;
  nomeComprador?: string;
  telefoneComprador?: string;
  telefone?: string;
  enderecoComprador?: string;
  numeroComprador?: string;
  cepComprador?: string;
  bairroComprador?: string;
  municipioComprador?: string;
  ufComprador?: string;
  tipoCpfCnpjVendedor?: 'CPF' | 'CNPJ';
  cpfCnpjVendedor?: string;
  marcaModelo?: string;
  anoFabricacao?: string;
  anoModelo?: string;
  cor?: string;
  // IDs da OS já criada (modo revisar)
  osId?: string;
  clienteId?: string;
  veiculoId?: string;
}

interface ATPVeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (osId: string) => void;
    dadosIniciais?: DadosIniciaisModal;
    /**
     * 'coletar' = coleta ATPV-e para criar OS (padrão)
     * 'revisar' = OS já criada, modal para conferência/edição
     */
    modo?: 'coletar' | 'revisar';
    /** Força o tipo de serviço da OS criada (sobrescreve detecção). */
    tipoServicoOverride?: TipoServico;
    /** Título exibido no header do modal (sobrescreve o padrão). */
    tituloOverride?: string;
}

type Etapa = 'upload' | 'analisando' | 'preview' | 'salvando' | 'sucesso' | 'erro';

export default function ATPVeModal({ isOpen, onClose, onSuccess, dadosIniciais, modo = 'coletar', tipoServicoOverride, tituloOverride }: ATPVeModalProps) {
    const [etapa, setEtapa] = useState<Etapa>('upload');
    const [dados, setDados] = useState<DadosExtraidos | null>(null);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [erro, setErro] = useState<string>('');
    const [osId, setOsId] = useState<string>('');
    const [clienteIdState, setClienteIdState] = useState('');
    const [veiculoIdState, setVeiculoIdState] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const [identidade, setIdentidade] = useState({ numero: '', orgaoExpedidor: '', uf: '' });
    const [clienteExistente, setClienteExistente] = useState<{ id: string; nome: string } | null>(null);
    const [telefoneComprador, setTelefoneComprador] = useState('');
    const [modoManual, setModoManual] = useState(false);
    const [buscandoCep, setBuscandoCep] = useState(false);
    const [erroCep, setErroCep] = useState('');
    const [buscandoComprador, setBuscandoComprador] = useState(false);

    // Pré-preenche campos quando dadosIniciais é fornecido
    useEffect(() => {
        if (dadosIniciais && isOpen) {
            setModoManual(true);
            setDados(prev => ({
                ...prev,
                placa: dadosIniciais.placa ?? prev?.placa,
                chassi: dadosIniciais.chassi ?? prev?.chassi,
                renavam: dadosIniciais.renavam ?? prev?.renavam,
                valorRecibo: dadosIniciais.valorRecibo ?? prev?.valorRecibo,
                dataAquisicao: dadosIniciais.dataAquisicao ?? prev?.dataAquisicao,
                tipoCpfCnpjComprador: dadosIniciais.tipoCpfCnpjComprador,
                cpfCnpjComprador: dadosIniciais.cpfCnpjComprador,
                nomeComprador: dadosIniciais.nomeComprador,
                telefoneComprador: dadosIniciais.telefoneComprador,
                enderecoComprador: dadosIniciais.enderecoComprador,
                numeroComprador: dadosIniciais.numeroComprador,
                cepComprador: dadosIniciais.cepComprador,
                bairroComprador: dadosIniciais.bairroComprador,
                municipioComprador: dadosIniciais.municipioComprador,
                ufComprador: dadosIniciais.ufComprador,
                tipoCpfCnpjVendedor: dadosIniciais.tipoCpfCnpjVendedor,
                cpfCnpjVendedor: dadosIniciais.cpfCnpjVendedor,
                marcaModelo: dadosIniciais.marcaModelo ?? prev?.marcaModelo,
                anoFabricacao: dadosIniciais.anoFabricacao ?? prev?.anoFabricacao,
                anoModelo: dadosIniciais.anoModelo ?? prev?.anoModelo,
                cor: dadosIniciais.cor ?? prev?.cor,
            } as DadosExtraidos));

            // IDs da OS já criada (modo revisar)
            if (dadosIniciais.osId) { setOsId(dadosIniciais.osId); setEtapa('preview'); }
            if (dadosIniciais.clienteId) {
                setClienteIdState(dadosIniciais.clienteId);
                setClienteExistente({ id: dadosIniciais.clienteId, nome: dadosIniciais.nomeComprador || '' });
            }
            if (dadosIniciais.veiculoId) setVeiculoIdState(dadosIniciais.veiculoId);
            if (dadosIniciais.telefone || dadosIniciais.telefoneComprador)
                setTelefoneComprador(dadosIniciais.telefone || dadosIniciais.telefoneComprador || '');
        }
    }, [dadosIniciais, isOpen]);

    const dadosVazios: DadosExtraidos = {
        tipoDocumento: 'atpve',
        textoCompleto: '',
        placa: '',
        chassi: '',
        renavam: '',
        marcaModelo: '',
        anoFabricacao: '',
        anoModelo: '',
        cor: '',
        dataAquisicao: '',
        valorRecibo: '',
        numeroCRV: '',
        comprador: {
            nome: '',
            cpfCnpj: '',
            endereco: '',
            numero: '',
            bairro: '',
            municipio: '',
            uf: '',
            cep: '',
        },
        vendedor: {
            cpfCnpj: '',
            uf: '',
        },
    };

    const updateDados = (path: string, value: string) => {
        setDados(prev => {
            if (!prev) return prev;
            const parts = path.split('.');
            if (parts.length === 1) return { ...prev, [parts[0]!]: value };
            const section = parts[0]!;
            const field = parts[1]!;
            return { ...prev, [section]: { ...(prev as any)[section], [field]: value } };
        });
    };

    // ---- BUSCA DE CEP ----
    const buscarCep = async () => {
        const cepLimpo = (dados?.comprador?.cep || '').replace(/\D/g, '');
        if (cepLimpo.length !== 8) return;
        setBuscandoCep(true);
        setErroCep('');
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
            const json = await res.json();
            if (json.erro) {
                setErroCep('CEP não encontrado.');
                setTimeout(() => setErroCep(''), 4000);
                return;
            }
            if (!dados?.comprador?.endereco?.trim()) updateDados('comprador.endereco', json.logradouro || '');
            if (!dados?.comprador?.bairro?.trim())    updateDados('comprador.bairro',   json.bairro     || '');
            if (!dados?.comprador?.municipio?.trim()) updateDados('comprador.municipio', json.localidade || '');
            if (!dados?.comprador?.uf?.trim())        updateDados('comprador.uf',        json.uf         || '');
        } catch {
            setErroCep('Erro ao buscar CEP. Verifique sua conexão.');
            setTimeout(() => setErroCep(''), 4000);
        } finally {
            setBuscandoCep(false);
        }
    };

    // ---- BUSCA DE COMPRADOR POR CPF/CNPJ ----
    const buscarComprador = async (cpfRaw: string) => {
        const digits = cpfRaw.replace(/\D/g, '');
        if (digits.length !== 11 && digits.length !== 14) return;
        setBuscandoComprador(true);
        try {
            const clientes = await getClientes();
            const encontrado = clientes.find(c => c.cpfCnpj.replace(/\D/g, '') === digits);
            if (encontrado) {
                setClienteExistente({ id: encontrado.id, nome: encontrado.nome });
                setTelefoneComprador((encontrado.telefones || [])[0] || '');
                updateDados('comprador.nome', encontrado.nome || '');
            } else {
                setClienteExistente(null);
            }
        } catch { /* ignora erro na busca */ } finally {
            setBuscandoComprador(false);
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

            let extraido: DadosExtraidos;
            const temChaveAI = !!import.meta.env.VITE_GEMINI_API_KEY;
            console.log('[Matilde] Chave Gemini presente?', temChaveAI);
            if (temChaveAI) {
                try {
                    console.log('[Matilde] Chamando Gemini AI...');
                    extraido = await extrairDadosATPVeComIA(file);
                    console.log('[Matilde] Gemini retornou:', JSON.stringify(extraido, null, 2));
                } catch (aiErr: any) {
                    console.warn('[Matilde] IA falhou, usando parser regex:', aiErr.message);
                    extraido = await extractVehicleData(file);
                    console.log('[Matilde] Regex retornou:', JSON.stringify(extraido, null, 2));
                }
            } else {
                console.log('[Matilde] Sem chave AI, usando regex...');
                extraido = await extractVehicleData(file);
            }

            if (extraido.tipoDocumento !== 'atpve') {
                setErro(`Este PDF é um "${extraido.tipoDocumento}", não um ATPV-e. Anexe um ATPV-e para transferência.`);
                return;
            }
            if (!extraido.placa && !extraido.chassi) {
                setErro('Não foi possível extrair dados do PDF. Verifique se é um ATPV-e válido.');
                return;
            }

            if (extraido.comprador) extraido.comprador.email = undefined;
            if (extraido.vendedor)  extraido.vendedor.email  = undefined;
            extraido.localVenda = undefined;

            setDados(extraido);

            const cpfBusca = extraido.comprador?.cpfCnpj;
            if (cpfBusca) {
                try {
                    const clientes = await getClientes();
                    const encontrado = clientes.find(c => c.cpfCnpj.replace(/\D/g, '') === cpfBusca.replace(/\D/g, ''));
                    if (encontrado) {
                        setClienteExistente({ id: encontrado.id, nome: encontrado.nome });
                        setTelefoneComprador((encontrado.telefones || [])[0] || '');
                    } else {
                        setClienteExistente(null);
                    }
                } catch { /* ignora */ }
            }

            setEtapa('preview');
        } catch (err: any) {
            setErro(`Erro ao ler PDF: ${err.message}`);
        }
    };

    // ---- SALVAR TUDO ----
    const handleConfirmar = async () => {
        if (!dados) return;
        setErro('');

        if (modoManual) {
            const faltando: string[] = [];
            if (!dados.placa?.trim() && !dados.chassi?.trim()) faltando.push('Placa ou Chassi');
            if (!dados.renavam?.trim()) faltando.push('RENAVAM');
            if (!dados.marcaModelo?.trim()) faltando.push('Marca/Modelo');
            if (!dados.comprador?.nome?.trim()) faltando.push('Nome do comprador');
            if (!dados.comprador?.cpfCnpj?.trim()) faltando.push('CPF/CNPJ do comprador');
            if (!telefoneComprador.trim()) faltando.push('Telefone do comprador');
            if (!dados.comprador?.endereco?.trim()) faltando.push('Endereço do comprador');
            if (!dados.comprador?.municipio?.trim()) faltando.push('Município do comprador');
            if (!dados.comprador?.uf?.trim()) faltando.push('UF do comprador');
            if (!dados.comprador?.cep?.trim()) faltando.push('CEP do comprador');
            if (!dados.valorRecibo?.trim()) faltando.push('Valor da Venda');
            if (!dados.dataAquisicao?.trim()) faltando.push('Data Declarada da Venda');
            if (faltando.length > 0) {
                setErro(`Preencha os campos obrigatórios: ${faltando.join(', ')}.`);
                return;
            }
        } else {
            if (!telefoneComprador.trim()) {
                setErro('Preencha o telefone do comprador antes de confirmar.');
                return;
            }
            if (!dados.dataAquisicao?.trim()) {
                setErro('Preencha a Data Declarada da Venda antes de confirmar.');
                return;
            }
        }

        setEtapa('salvando');
        try {
            let clienteId = '';
            const cpfComprador = dados.comprador?.cpfCnpj || dados.cpfCnpj;
            const nomeComprador = dados.comprador?.nome || dados.nomeProprietario || '';

            if (cpfComprador) {
                if (clienteExistente) {
                    clienteId = clienteExistente.id;
                    if (telefoneComprador.trim()) {
                        const clientes = await getClientes();
                        const cli = clientes.find(c => c.id === clienteExistente.id);
                        if (cli && !(cli.telefones || []).length) {
                            await saveCliente({ ...cli, telefones: [telefoneComprador.trim()] });
                        }
                    }
                } else {
                    const cpfLimpo = cpfComprador.replace(/\D/g, '');
                    const enderecoCompleto = [
                        dados.comprador?.endereco,
                        dados.comprador?.numero,
                        dados.comprador?.bairro,
                        dados.comprador?.cep ? `CEP: ${dados.comprador.cep}` : '',
                        dados.comprador?.municipio,
                        dados.comprador?.uf,
                    ].filter(Boolean).join(', ');

                    const novoCliente = await saveCliente({
                        tipo: cpfLimpo.length <= 11 ? 'PF' : 'PJ',
                        nome: nomeComprador,
                        cpfCnpj: cpfComprador,
                        telefones: telefoneComprador.trim() ? [telefoneComprador.trim()] : [],
                        email: dados.comprador?.email || '',
                        observacoes: `Cadastrado automaticamente via ATPV-e${enderecoCompleto ? ` | Endereço: ${enderecoCompleto}` : ''}`,
                        documentos: [],
                    });
                    clienteId = novoCliente.id;
                }
            }

            const veiculo = await saveVeiculo({
                placa: dados.placa || '',
                renavam: dados.renavam || '',
                chassi: dados.chassi || '',
                marcaModelo: dados.marcaModelo || '',
                clienteId,
                categoria: dados.categoria,
                numeroCRV: dados.numeroCRV,
                codigoSegurancaCRV: dados.codigoSegurancaCRV,
                numeroATPVe: dados.numeroATPVe,
                hodometro: dados.hodometro,
                observacoes: [
                    dados.cor ? `Cor: ${dados.cor}` : '',
                    dados.anoFabricacao ? `Ano: ${dados.anoFabricacao}/${dados.anoModelo}` : '',
                ].filter(Boolean).join(' | '),
                dataAquisicao: dados.dataAquisicao || '',
                dataEmissaoCRV: dados.dataEmissao || '',
            });

            let pdfUrl: string | undefined;
            if (pdfFile) {
                const pdfPath = `veiculos/${veiculo.id}/ATPVe_${dados.placa || 'doc'}.pdf`;
                pdfUrl = await uploadFileToSupabase(pdfFile, pdfPath);
            }

            const tipoServico: TipoServico = tipoServicoOverride || (dados.tipoServicoDetectado as TipoServico) || 'transferencia';
            const checklistBase = await gerarChecklistDinamico(tipoServico, 'PF');
            const checklist = pdfUrl
                ? checklistBase.map(item =>
                    item.nome === 'RECIBO (CRV) Assinado'
                        ? { ...item, arquivo: pdfUrl, status: 'recebido' as const, dataUpload: new Date().toISOString() }
                        : item
                  )
                : checklistBase;

            const novaOrdem = await saveOrdem({
                clienteId,
                veiculoId: veiculo.id,
                tipoServico,
                trocaPlaca: false,
                status: 'aguardando_documentacao',
                checklist,
                transferencia: {
                    vendedorCpfCnpj: dados.vendedor?.cpfCnpj,
                    vendedorEmail: dados.vendedor?.email,
                    vendedorMunicipio: dados.vendedor?.municipio,
                    vendedorUf: dados.vendedor?.uf,
                    localVenda: dados.localVenda,
                    valorDeclarado: dados.valorRecibo,
                    dataVenda: dados.dataAquisicao,
                    tipoCpfCnpjComprador: (dados as any).tipoCpfCnpjComprador,
                    tipoCpfCnpjVendedor: (dados as any).tipoCpfCnpjVendedor,
                },
                auditLog: [{
                    id: crypto.randomUUID(),
                    dataHora: new Date().toISOString(),
                    usuario: 'Sistema',
                    acao: modoManual ? 'OS criada manualmente (sem ATPV-e)' : 'OS criada automaticamente via ATPV-e',
                    detalhes: `Placa: ${dados.placa} | Comprador: ${nomeComprador}`,
                }],
            });

            // Gerar preço e cobranças automáticas
            try {
                await finalizarOS(novaOrdem.id, tipoServico, 'carro', false);
            } catch (err) {
                console.warn('Cobranças automáticas não geradas:', err);
            }

            setOsId(novaOrdem.id);
            setEtapa('sucesso');
        } catch (err: any) {
            setErro(`Erro ao salvar: ${err.message}`);
            setEtapa('erro');
        }
    };

    // ---- CAMPOS FALTANDO (modo revisar) ----
    const camposFaltando = (): string[] => {
        if (!dados) return [];
        const f: string[] = [];
        if (!dados.placa?.trim() && !dados.chassi?.trim()) f.push('Placa ou Chassi');
        if (!dados.renavam?.trim()) f.push('RENAVAM');
        if (!dados.comprador?.nome?.trim()) f.push('Nome do comprador');
        if (!dados.comprador?.cpfCnpj?.trim()) f.push('CPF/CNPJ');
        if (!telefoneComprador?.trim()) f.push('Telefone');
        if (!dados.valorRecibo?.trim()) f.push('Valor da Venda');
        if (!dados.comprador?.municipio?.trim()) f.push('Município');
        if (!dados.comprador?.uf?.trim()) f.push('UF');
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
            const cpfComprador = dados.comprador?.cpfCnpj || dados.cpfCnpj || '';
            const nomeComprador = dados.comprador?.nome || dados.nomeProprietario || '';

            // Atualizar cliente
            if (clienteIdState) {
                const clientes = await getClientes();
                const cli = clientes.find(c => c.id === clienteIdState);
                if (cli) {
                    const enderecoCompleto = [
                        dados.comprador?.endereco,
                        dados.comprador?.numero,
                        dados.comprador?.bairro,
                        dados.comprador?.cep ? `CEP: ${dados.comprador.cep}` : '',
                        dados.comprador?.municipio,
                        dados.comprador?.uf,
                    ].filter(Boolean).join(', ');

                    await saveCliente({
                        ...cli,
                        nome: nomeComprador || cli.nome,
                        cpfCnpj: cpfComprador || cli.cpfCnpj,
                        telefones: telefoneComprador.trim()
                            ? [...new Set([telefoneComprador.trim(), ...(cli.telefones || [])])]
                            : cli.telefones || [],
                        observacoes: [
                            cli.observacoes || '',
                            enderecoCompleto ? `Endereço: ${enderecoCompleto}` : '',
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
                    numeroCRV: dados.numeroCRV,
                    codigoSegurancaCRV: dados.codigoSegurancaCRV,
                    numeroATPVe: dados.numeroATPVe,
                    hodometro: dados.hodometro,
                    observacoes: [
                        dados.cor ? `Cor: ${dados.cor}` : '',
                        dados.anoFabricacao ? `Ano: ${dados.anoFabricacao}/${dados.anoModelo}` : '',
                    ].filter(Boolean).join(' | '),
                    dataAquisicao: dados.dataAquisicao || '',
                });
            }

            // Atualizar OS com dados de transferência
            const ordens = await (await import('../lib/database')).getOrdens();
            const os = ordens.find((o: any) => o.id === osId);
            if (os) {
                await saveOrdem({
                    ...os,
                    transferencia: {
                        ...(os.transferencia || {}),
                        vendedorCpfCnpj: dados.vendedor?.cpfCnpj,
                        vendedorUf: dados.vendedor?.uf,
                        valorDeclarado: dados.valorRecibo,
                        dataVenda: dados.dataAquisicao,
                        tipoCpfCnpjComprador: (dados as any).tipoCpfCnpjComprador,
                        tipoCpfCnpjVendedor: (dados as any).tipoCpfCnpjVendedor,
                    },
                } as any);
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
        setIdentidade({ numero: '', orgaoExpedidor: '', uf: '' });
        setClienteExistente(null);
        setTelefoneComprador('');
        setModoManual(false);
        setBuscandoCep(false);
        setErroCep('');
        setBuscandoComprador(false);
    };

    if (!isOpen) return null;

    const tituloHeader =
        etapa === 'upload'    ? 'Processar ATPV-e' :
        etapa === 'analisando'? 'Analisando ATPV-e...' :
        etapa === 'preview'   ? (modo === 'revisar' ? 'Conferir OS — Transferência (ATPVe)' : modoManual ? 'Preencher Dados da Transferência' : 'Conferir Dados Extraídos') :
        etapa === 'salvando'  ? 'Salvando...' :
        etapa === 'sucesso'   ? 'Tudo Pronto!' :
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
                                {modoManual ? 'Preenchimento manual' : `ATPV-e — ${pdfFile?.name}`}
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
                                Anexe o ATPV-e (PDF) para criar automaticamente o <strong>cliente</strong>, <strong>veículo</strong> e <strong>ordem de serviço</strong>.
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
                                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)')}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color, #d1d5db)')}
                            >
                                <Upload size={40} style={{ color: 'var(--color-info, #3b82f6)', marginBottom: 12 }} />
                                <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Clique para selecionar o ATPV-e</p>
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
                                    Não tem o ATPV-e? Vá direto ao Detran e a OS será criada quando o PDF voltar.
                                </p>
                                <button
                                    onClick={() => {
                                        window.postMessage({
                                            source: 'MATILDE_CRM',
                                            action: 'DEFINIR_SERVICO',
                                            payload: { servico: 'transferencia' },
                                        }, '*');
                                        window.open('https://www.detran.mg.gov.br/veiculos/transferencias/taxa-para-transferir-propriedade-de-veiculo-comprador/index/2', '_blank');
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
                                    borderTopColor: 'var(--color-info, #3b82f6)', borderRadius: '50%',
                                    animation: 'matilde-spin 1s linear infinite',
                                }} />
                                <div style={{
                                    position: 'absolute', top: '50%', left: '50%',
                                    transform: 'translate(-50%, -50%)', fontSize: 22,
                                    animation: 'matilde-pulse 1.5s ease-in-out infinite',
                                }}>🤖</div>
                            </div>
                            <p style={{ fontWeight: 700, fontSize: '1rem', margin: '0 0 6px' }}>IA analisando o documento...</p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>{pdfFile?.name}</p>
                        </div>
                    )}

                    {/* ETAPA 2: PREVIEW */}
                    {etapa === 'preview' && dados && (
                        <>
                            {erro && (
                                <div style={errorBoxStyle}><strong>Atenção:</strong> {erro}</div>
                            )}

                            {/* Banner ATPV-e (só modo não-manual) */}
                            {!modoManual && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: 8, marginBottom: 14,
                                    background: 'var(--color-info-bg, #eff6ff)', color: 'var(--color-info, #2563eb)',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8,
                                }}>
                                    <FileText size={16} />
                                    <span>Documento: <strong>ATPV-e</strong> — {pdfFile?.name}</span>
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
                                        {telefoneComprador
                                            ? <> — <strong>{telefoneComprador}</strong></>
                                            : <span style={{ color: '#d97706' }}> — sem telefone cadastrado, preencha abaixo</span>
                                        }
                                    </span>
                                </div>
                            ) : dados.comprador?.cpfCnpj ? (
                                <div style={{
                                    padding: '10px 14px', borderRadius: 8, marginBottom: 14,
                                    background: '#fffbeb', color: '#92400e',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8,
                                    border: '1px solid #fde68a',
                                }}>
                                    <User size={16} />
                                    <span>Comprador não encontrado na base — será cadastrado como novo cliente.</span>
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
                                    <FieldGrid label="Hodômetro (km)" path="hodometro" value={dados.hodometro} onUpdate={updateDados} />
                                    <FieldGrid label="Nº CRV" path="numeroCRV" value={dados.numeroCRV} onUpdate={updateDados} />
                                    <FieldGrid label="Cód. Segurança CRV" path="codigoSegurancaCRV" value={dados.codigoSegurancaCRV} onUpdate={updateDados} />
                                    <FieldGrid label="Nº ATPVe" path="numeroATPVe" value={dados.numeroATPVe} onUpdate={updateDados} />
                                </div>
                            </div>

                            {/* ── SEÇÃO: COMPRADOR ── */}
                            <div style={secaoStyle}>
                                <div style={secaoHeaderStyle}><User size={14} /> Comprador (Novo Proprietário)</div>
                                <div style={gridStyle}>
                                    {/* Tipo de Documento */}
                                    <div style={fieldWrapStyle}>
                                        <label style={labelStyle}>Tipo de Documento</label>
                                        <select
                                            style={selectStyle}
                                            value={(dados as any).tipoCpfCnpjComprador || 'CPF'}
                                            onChange={e => updateDados('tipoCpfCnpjComprador', e.target.value)}
                                        >
                                            <option value="CPF">CPF (Pessoa Física)</option>
                                            <option value="CNPJ">CNPJ (Pessoa Jurídica)</option>
                                        </select>
                                    </div>
                                    {/* CPF/CNPJ */}
                                    <FieldGridMasked
                                        label="CPF/CNPJ"
                                        path="comprador.cpfCnpj"
                                        value={dados.comprador?.cpfCnpj || ''}
                                        onUpdate={updateDados}
                                        mascara="cpfcnpj"
                                        onAfterUpdate={buscarComprador}
                                        disabled={buscandoComprador}
                                        placeholder={(dados as any).tipoCpfCnpjComprador === 'CNPJ' ? '00.000.000/0001-00' : '000.000.000-00'}
                                    />
                                    {/* Nome */}
                                    <FieldGrid label="Nome completo" path="comprador.nome" value={dados.comprador?.nome} onUpdate={updateDados} span />
                                    {/* Telefone */}
                                    <div style={fieldWrapStyle}>
                                        <label style={{ ...labelStyle, ...(!telefoneComprador ? { color: 'var(--color-warning, #d97706)' } : {}) }}>
                                            Telefone *
                                        </label>
                                        <input
                                            style={{
                                                ...inputStyle,
                                                ...(!telefoneComprador ? { borderColor: 'var(--color-warning, #d97706)', background: 'var(--color-warning-bg, #fffbeb)' } : {}),
                                            }}
                                            value={telefoneComprador}
                                            onChange={e => setTelefoneComprador(e.target.value)}
                                            placeholder="(31) 99999-9999 — obrigatório"
                                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)')}
                                            onBlurCapture={e => (e.currentTarget.style.borderColor = !telefoneComprador ? 'var(--color-warning, #d97706)' : 'var(--border-color, #d1d5db)')}
                                        />
                                    </div>
                                    {/* CEP com busca */}
                                    <div style={fieldWrapStyle}>
                                        <label style={labelStyle}>CEP</label>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <input
                                                style={{ ...inputStyle, flex: 1 }}
                                                value={dados.comprador?.cep || ''}
                                                onChange={e => {
                                                    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                                                    const masked = digits.length > 5 ? `${digits.slice(0,5)}-${digits.slice(5)}` : digits;
                                                    updateDados('comprador.cep', masked);
                                                }}
                                                placeholder="00000-000"
                                                maxLength={9}
                                                onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)')}
                                                onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border-color, #d1d5db)')}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && !buscandoCep && (dados.comprador?.cep || '').replace(/\D/g, '').length === 8)
                                                        buscarCep();
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={buscarCep}
                                                disabled={buscandoCep || (dados.comprador?.cep || '').replace(/\D/g, '').length !== 8}
                                                style={{
                                                    padding: '7px 12px', borderRadius: 8, border: 'none',
                                                    background: 'var(--color-info, #3b82f6)', color: '#fff',
                                                    cursor: buscandoCep || (dados.comprador?.cep || '').replace(/\D/g, '').length !== 8 ? 'not-allowed' : 'pointer',
                                                    opacity: buscandoCep || (dados.comprador?.cep || '').replace(/\D/g, '').length !== 8 ? 0.5 : 1,
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
                                    <FieldGrid label="Endereço" path="comprador.endereco" value={dados.comprador?.endereco} onUpdate={updateDados} span />
                                    <FieldGrid label="Número" path="comprador.numero" value={dados.comprador?.numero} onUpdate={updateDados} />
                                    <FieldGrid label="Bairro" path="comprador.bairro" value={dados.comprador?.bairro} onUpdate={updateDados} />
                                    <FieldGrid label="Município" path="comprador.municipio" value={dados.comprador?.municipio} onUpdate={updateDados} />
                                    <FieldGrid label="UF" path="comprador.uf" value={dados.comprador?.uf} onUpdate={updateDados} />

                                    {/* Identidade — só para CPF */}
                                    {dados.comprador?.cpfCnpj && dados.comprador.cpfCnpj.replace(/\D/g, '').length <= 11 && (
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
                                                    <input
                                                        key="id-numero" type="text" style={inputStyle}
                                                        value={identidade.numero}
                                                        onChange={e => setIdentidade(prev => ({ ...prev, numero: e.target.value }))}
                                                        placeholder="MG-12.345.678"
                                                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)')}
                                                        onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border-color, #d1d5db)')}
                                                    />
                                                </div>
                                                <div style={fieldWrapStyle}>
                                                    <label style={labelStyle}>Órgão Expedidor</label>
                                                    <input
                                                        key="id-orgao" type="text" style={inputStyle}
                                                        value={identidade.orgaoExpedidor}
                                                        onChange={e => setIdentidade(prev => ({ ...prev, orgaoExpedidor: e.target.value.toUpperCase() }))}
                                                        placeholder="SSP"
                                                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)')}
                                                        onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border-color, #d1d5db)')}
                                                    />
                                                </div>
                                                <div style={fieldWrapStyle}>
                                                    <label style={labelStyle}>UF</label>
                                                    <select
                                                        key="id-uf" style={selectStyle}
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

                            {/* ── SEÇÃO: VENDEDOR ── */}
                            <div style={secaoStyle}>
                                <div style={secaoHeaderStyle}><User size={14} /> Vendedor (Proprietário Anterior)</div>
                                <div style={gridStyle}>
                                    <div style={fieldWrapStyle}>
                                        <label style={labelStyle}>Tipo de Documento</label>
                                        <select
                                            style={selectStyle}
                                            value={(dados as any).tipoCpfCnpjVendedor || 'CPF'}
                                            onChange={e => updateDados('tipoCpfCnpjVendedor', e.target.value)}
                                        >
                                            <option value="CPF">CPF (Pessoa Física)</option>
                                            <option value="CNPJ">CNPJ (Pessoa Jurídica)</option>
                                        </select>
                                    </div>
                                    <FieldGrid label="CPF/CNPJ" path="vendedor.cpfCnpj" value={dados.vendedor?.cpfCnpj} onUpdate={updateDados} />
                                    <FieldGrid label="UF de Origem" path="vendedor.uf" value={dados.vendedor?.uf} onUpdate={updateDados} />
                                </div>
                            </div>

                            {/* ── SEÇÃO: TRANSFERÊNCIA ── */}
                            <div style={secaoStyle}>
                                <div style={secaoHeaderStyle}><ClipboardList size={14} /> Dados da Transferência</div>
                                <div style={gridStyle}>
                                    <FieldGridMasked
                                        label="Valor da Venda (R$)"
                                        path="valorRecibo"
                                        value={dados.valorRecibo ?? ''}
                                        onUpdate={updateDados}
                                        mascara="moeda"
                                    />
                                    <FieldGridDate
                                        label="Data Declarada da Venda"
                                        path="dataAquisicao"
                                        value={dados.dataAquisicao || ''}
                                        onUpdate={updateDados}
                                        obrigatorio
                                        vazio={modo === 'revisar' && !dados.dataAquisicao?.trim()}
                                    />
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
                                borderTopColor: 'var(--color-info)', borderRadius: '50%',
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
                                        const dadosDetran = {
                                            placa: dados.placa || '',
                                            chassi: dados.chassi || '',
                                            renavam: dados.renavam || '',
                                            cpfCnpj: dados.comprador?.cpfCnpj || '',
                                            tipoCpfCnpj: (dados as any).tipoCpfCnpjComprador || ((dados.comprador?.cpfCnpj?.replace(/\D/g, '').length || 0) <= 11 ? 'CPF' : 'CNPJ'),
                                            nomeAdquirente: dados.comprador?.nome || '',
                                            docIdentidade: identidade.numero,
                                            orgaoExpedidor: identidade.orgaoExpedidor,
                                            ufExpedidor: identidade.uf,
                                            valorRecibo: dados.valorRecibo || '',
                                            dataAquisicao: dados.dataAquisicao || '',
                                            numeroCRV: dados.numeroCRV || '',
                                            codigoSegurancaCRV: dados.codigoSegurancaCRV || '',
                                            marcaModelo: dados.marcaModelo || '',
                                            cor: dados.cor || '',
                                            anoFabricacao: dados.anoFabricacao || '',
                                            anoModelo: dados.anoModelo || '',
                                            cep: dados.comprador?.cep || '',
                                            endereco: dados.comprador?.endereco || '',
                                            numero: dados.comprador?.numero || '',
                                            bairro: dados.comprador?.bairro || '',
                                            municipioAdquirente: dados.comprador?.municipio || '',
                                            nomeVendedor: dados.vendedor?.nome || '',
                                            cpfCnpjVendedor: dados.vendedor?.cpfCnpj || '',
                                            tipoCpfCnpjVendedor: (dados as any).tipoCpfCnpjVendedor || ((dados.vendedor?.cpfCnpj?.replace(/\D/g, '').length || 0) <= 11 ? 'CPF' : 'CNPJ'),
                                            ufOrigem: (dados as any).ufOrigem || dados.vendedor?.uf || '',
                                        };
                                        window.dispatchEvent(new CustomEvent('MATILDE_PREENCHER_DETRAN', { detail: dadosDetran }));
                                        window.open('https://www.detran.mg.gov.br/veiculos/transferencias/taxa-para-transferir-propriedade-de-veiculo-comprador/index/2', '_blank');
                                        resetModal(); onClose(); onSuccess(osId);
                                    }}
                                    style={{
                                        padding: '12px 24px', borderRadius: 10, border: 'none',
                                        background: 'var(--color-info, #3b82f6)', color: '#fff',
                                        cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', fontSize: '0.9rem',
                                    }}
                                >
                                    Ir ao Detran e Preencher
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
                            <button
                                style={{ ...btnPrimary, opacity: (etapa as Etapa) === 'salvando' ? 0.6 : 1, cursor: (etapa as Etapa) === 'salvando' ? 'not-allowed' : 'pointer' }}
                                onClick={handleSalvarAlteracoes}
                                disabled={(etapa as Etapa) === 'salvando'}
                            >
                                {(etapa as Etapa) === 'salvando' ? 'Salvando...' : 'Salvar Alterações'}
                            </button>
                        ) : (
                            <button
                                style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 8, opacity: (etapa as Etapa) === 'salvando' ? 0.6 : 1, cursor: (etapa as Etapa) === 'salvando' ? 'not-allowed' : 'pointer' }}
                                onClick={handleConfirmar}
                                disabled={(etapa as Etapa) === 'salvando'}
                            >
                                {(etapa as Etapa) === 'salvando' ? 'Criando...' : 'Criar OS'}
                            </button>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}

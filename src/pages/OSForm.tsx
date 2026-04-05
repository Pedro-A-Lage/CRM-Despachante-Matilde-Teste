import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Save, ArrowLeft, Edit2, X, Upload, FileText, Loader, Plus } from 'lucide-react';
import { useConfirm } from '../components/ConfirmProvider';
import { getClientes, getVeiculosByCliente, getVeiculos, saveOrdem, updateCliente, saveVeiculo, saveCliente, generateId } from '../lib/database';
import { gerarChecklistDinamico } from '../lib/configService';
import { finalizarOS } from '../lib/osService';
import { uploadFileToSupabase } from '../lib/fileStorage';
import { extractVehicleData } from '../lib/pdfParser';
import type { TipoServico, TipoCliente, TipoVeiculo, Cliente, Veiculo, ChecklistItem } from '../types';
import { useServiceLabels } from '../hooks/useServiceLabels';
import { getEmpresasAtivas, criarEnviosStatusFromEtapas } from '../lib/empresaService';
import type { EmpresaParceira } from '../types/empresa';

interface PendingPdfData {
    clienteNome: string;
    clienteCpfCnpj: string;
    placa: string;
    chassi: string;
    renavam: string;
    marcaModelo: string;
    dataAquisicao: string;
    dataEmissao: string;
    tipoServico: string;
    motivoOriginal: string;
    telefone: string;
    pdfUrl?: string;
    pdfName?: string;
}

// Converte data BR (dd/mm/yyyy) para ISO (yyyy-mm-dd)
function convertDateBrToIso(dateBr?: string): string | undefined {
    if (!dateBr) return undefined;
    const parts = dateBr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!parts) return undefined;
    return `${parts[3]}-${parts[2]}-${parts[1]}`;
}

interface OSFormProps {
    /** When true, hides the page header and replaces navigation with callbacks */
    drawerMode?: boolean;
    /** Called after the OS is successfully created (only in drawerMode) */
    onCreated?: (osId: string) => void;
    /** Called when the user clicks Cancel (only in drawerMode) */
    onCancel?: () => void;
    /** Extension data passed directly (bypasses location.state — used when drawer is opened programmatically) */
    initialExtensionData?: any;
}

export default function OSForm({ drawerMode = false, onCreated, onCancel, initialExtensionData }: OSFormProps = {}) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const confirm = useConfirm();

    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [allVeiculos, setAllVeiculos] = useState<Veiculo[]>([]);
    const serviceLabels = useServiceLabels();
    const [empresas, setEmpresas] = useState<EmpresaParceira[]>([]);
    const [empresaParceiraId, setEmpresaParceiraId] = useState<string>('');

    const loadData = async () => {
        const [c, v] = await Promise.all([getClientes(), getVeiculos()]);
        setClientes(c);
        setAllVeiculos(v);
    };

    useEffect(() => {
        loadData();
        getEmpresasAtivas().then(setEmpresas);
    }, []);


    const [clienteId, setClienteId] = useState(searchParams.get('clienteId') || '');
    const [veiculoId, setVeiculoId] = useState(searchParams.get('veiculoId') || '');
    const urlServico = searchParams.get('servico') as TipoServico | null;
    const [tipoServico, setTipoServico] = useState<TipoServico>(urlServico || 'primeiro_emplacamento');
    const [trocaPlaca, setTrocaPlaca] = useState(true);
    const [tipoVeiculo, setTipoVeiculo] = useState<TipoVeiculo>('carro');
    // CPF/CNPJ do vendedor para transferências com vendedor PJ (gera checklist com docs extras)
    const [cpfVendedor, setCpfVendedor] = useState('');
    const [checklistPreview, setChecklistPreview] = useState<ChecklistItem[]>([]);
    const [checklistError, setChecklistError] = useState('');

    // Modal de cadastro rápido (cliente + veículo juntos)
    const [showNovoCadastro, setShowNovoCadastro] = useState(false);
    const [showNovoVeiculo, setShowNovoVeiculo] = useState(false);
    const [novoClNome, setNovoClNome] = useState('');
    const [novoClCpfCnpj, setNovoClCpfCnpj] = useState('');
    const [novoClTipo, setNovoClTipo] = useState<TipoCliente>('PF');
    const [novoClTelefone, setNovoClTelefone] = useState('');
    const [novoClEmail, setNovoClEmail] = useState('');
    const [novoVcPlaca, setNovoVcPlaca] = useState('');
    const [novoVcRenavam, setNovoVcRenavam] = useState('');
    const [novoVcChassi, setNovoVcChassi] = useState('');
    const [novoVcMarcaModelo, setNovoVcMarcaModelo] = useState('');
    const [novoVcAnoFab, setNovoVcAnoFab] = useState('');
    const [novoVcAnoMod, setNovoVcAnoMod] = useState('');
    const [salvandoNovo, setSalvandoNovo] = useState(false);
    const [erroNovoCadastro, setErroNovoCadastro] = useState('');

    const resetNovoForm = () => {
        setNovoClNome(''); setNovoClCpfCnpj(''); setNovoClTelefone(''); setNovoClEmail(''); setNovoClTipo('PF');
        setNovoVcPlaca(''); setNovoVcRenavam(''); setNovoVcChassi(''); setNovoVcMarcaModelo('');
        setNovoVcAnoFab(''); setNovoVcAnoMod(''); setErroNovoCadastro('');
    };

    const handleSalvarNovoCadastro = async () => {
        if (!novoClNome.trim() || !novoClCpfCnpj.trim()) return;
        if (!novoVcPlaca.trim() || !novoVcMarcaModelo.trim()) return;
        // Avisa se telefone não foi informado, mas não bloqueia
        if (!novoClTelefone.trim()) {
            const prosseguir = await confirm({
                message: 'Deseja cadastrar o cliente sem telefone de contato?',
                title: 'Telefone não informado',
                confirmText: 'Continuar sem telefone',
                cancelText: 'Cancelar',
                danger: false,
            });
            if (!prosseguir) return;
        }
        setSalvandoNovo(true);
        setErroNovoCadastro('');
        try {
            // Não passar id/criadoEm/atualizadoEm — storage.ts gera automaticamente no INSERT
            const clienteSalvo = await saveCliente({
                tipo: novoClTipo,
                nome: novoClNome.trim().toUpperCase(),
                cpfCnpj: novoClCpfCnpj.trim(),
                telefones: novoClTelefone.trim() ? [novoClTelefone.trim()] : [],
                email: novoClEmail.trim() || undefined,
                documentos: [],
            });

            const marcaModeloCompleto = [novoVcMarcaModelo.trim(), novoVcAnoFab.trim(), novoVcAnoMod.trim()]
                .filter(Boolean).join(' ');

            const veiculoSalvo = await saveVeiculo({
                placa: novoVcPlaca.trim().toUpperCase(),
                renavam: novoVcRenavam.trim(),
                chassi: novoVcChassi.trim().toUpperCase(),
                marcaModelo: marcaModeloCompleto.toUpperCase(),
                clienteId: clienteSalvo.id,
            });

            await loadData();
            setClienteId(clienteSalvo.id);
            setVeiculoId(veiculoSalvo.id);
            setShowNovoCadastro(false);
            resetNovoForm();
        } catch (err: any) {
            setErroNovoCadastro(err?.message || 'Erro ao salvar. Verifique os dados e tente novamente.');
        } finally { setSalvandoNovo(false); }
    };

    const handleSalvarNovoVeiculo = async () => {
        if (!novoVcPlaca.trim() || !novoVcMarcaModelo.trim() || !clienteId) return;
        setSalvandoNovo(true);
        try {
            const novo: Veiculo = {
                id: generateId(),
                placa: novoVcPlaca.trim().toUpperCase(),
                renavam: novoVcRenavam.trim(),
                chassi: novoVcChassi.trim().toUpperCase(),
                marcaModelo: novoVcMarcaModelo.trim().toUpperCase(),
                clienteId,
                criadoEm: new Date().toISOString(),
                atualizadoEm: new Date().toISOString(),
            };
            await saveVeiculo(novo);
            await loadData();
            setVeiculoId(novo.id);
            setShowNovoVeiculo(false);
            setNovoVcPlaca(''); setNovoVcRenavam(''); setNovoVcChassi(''); setNovoVcMarcaModelo('');
        } finally { setSalvandoNovo(false); }
    };

    // --- PDF UPLOAD ---
    const [pdfProcessing, setPdfProcessing] = useState(false);
    const [pdfResult, setPdfResult] = useState<string | null>(null);
    const pdfInputRef = useRef<HTMLInputElement>(null);
    const [pdfFile, setPdfFile] = useState<File | null>(null);

    // Estado para o Modal de Revisão
    const [isReviewPdfModalOpen, setIsReviewPdfModalOpen] = useState(false);
    const [pendingPdfData, setPendingPdfData] = useState<PendingPdfData | null>(null);

    const handlePdfUpload = async (file: File) => {
        if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
            alert('Por favor, selecione um arquivo PDF.');
            return;
        }

        setPdfProcessing(true);
        setPdfResult(null);

        try {
            const extracted = await extractVehicleData(file);
            console.log('Dados extraídos do PDF:', extracted);

            setPdfFile(file);
            setPendingPdfData({
                clienteNome: extracted.nomeAdquirente || extracted.nomeProprietario || '',
                clienteCpfCnpj: extracted.cpfCnpjAdquirente || extracted.cpfCnpj || '',
                placa: extracted.placa || '',
                chassi: extracted.chassi || '',
                renavam: extracted.renavam || '',
                marcaModelo: extracted.marcaModelo || '',
                dataAquisicao: extracted.dataAquisicao || '',
                dataEmissao: extracted.dataEmissao || '',
                tipoServico: extracted.tipoServicoDetectado || 'transferencia',
                motivoOriginal: extracted.motivoPreenchimento || '',
                telefone: ''
            });

            setIsReviewPdfModalOpen(true);
        } catch (error: any) {
            console.error('Erro ao processar PDF:', error);
            setPdfResult(`❌ Erro ao ler o PDF: ${error?.message || 'Formato não suportado'}`);
        } finally {
            setPdfProcessing(false);
        }
    };

    const handleConfirmPdfReview = async () => {
        if (!pendingPdfData || !pdfFile) return;

        // Validação de Telefone com Confirmação
        if (!pendingPdfData.telefone.trim()) {
            const prosseguir = await confirm('Deseja prosseguir sem adicionar um telefone de contato para o cliente?');
            if (!prosseguir) return;
        }

        setPdfProcessing(true);
        setIsReviewPdfModalOpen(false);

        try {
            const resultParts: string[] = [];
            const { getClientes, saveCliente, getVeiculos, saveVeiculo } = await import('../lib/database');

            // 1. Busca ou Cria Cliente
            const todosClientes = await getClientes();
            const cleanCpf = pendingPdfData.clienteCpfCnpj.replace(/\D/g, '');

            // CPF bate só vale se o primeiro nome também bater — evita puxar cliente errado
            // quando outro cliente foi cadastrado com o mesmo CPF por engano
            const primeiroNome = (nome: string) => nome.toUpperCase().trim().split(/\s+/)[0];
            const nomeNoPdf = primeiroNome(pendingPdfData.clienteNome || '');

            let cliente = todosClientes.find(c => {
                const cCpf = c.cpfCnpj?.replace(/\D/g, '');
                const nomeExato = pendingPdfData.clienteNome && c.nome.toUpperCase() === pendingPdfData.clienteNome.toUpperCase();
                const cpfComNome = cleanCpf && cCpf === cleanCpf && nomeNoPdf && primeiroNome(c.nome) === nomeNoPdf;
                return nomeExato || cpfComNome;
            });

            if (!cliente) {
                const isPj = cleanCpf && cleanCpf.length > 11;
                cliente = await saveCliente({
                    nome: pendingPdfData.clienteNome,
                    cpfCnpj: pendingPdfData.clienteCpfCnpj,
                    tipo: isPj ? 'PJ' : 'PF',
                    telefones: pendingPdfData.telefone ? [pendingPdfData.telefone] : [],
                    email: ''
                });
                resultParts.push(`✅ Cliente criado: ${cliente.nome}`);
            } else {
                resultParts.push(`👤 Cliente encontrado: ${cliente.nome}`);
            }
            setClienteId(cliente.id!);

            // 2. Busca ou Cria Veículo
            const todosVeiculos = await getVeiculos();
            let veiculo = todosVeiculos.find(v =>
                (pendingPdfData.placa && v.placa === pendingPdfData.placa) ||
                (pendingPdfData.chassi && v.chassi === pendingPdfData.chassi)
            );

            if (!veiculo) {
                veiculo = await saveVeiculo({
                    clienteId: cliente.id!,
                    placa: pendingPdfData.placa,
                    chassi: pendingPdfData.chassi,
                    renavam: pendingPdfData.renavam,
                    marcaModelo: pendingPdfData.marcaModelo,
                    dataAquisicao: convertDateBrToIso(pendingPdfData.dataAquisicao),
                    dataEmissaoCRV: convertDateBrToIso(pendingPdfData.dataEmissao),
                });
                resultParts.push(`✅ Veículo criado: ${veiculo.placa || veiculo.chassi}`);
            } else {
                const updates: any = {};
                if (pendingPdfData.dataAquisicao) updates.dataAquisicao = convertDateBrToIso(pendingPdfData.dataAquisicao);
                if (pendingPdfData.dataEmissao) updates.dataEmissaoCRV = convertDateBrToIso(pendingPdfData.dataEmissao);
                if (Object.keys(updates).length > 0) {
                    veiculo = await saveVeiculo({ ...veiculo, ...updates });
                }
                resultParts.push(`🚗 Veículo encontrado: ${veiculo.placa || veiculo.chassi}`);
            }
            setVeiculoId(veiculo.id!);

            // 3. Upload do PDF
            try {
                const pdfName = `${pendingPdfData.motivoOriginal || 'DOCUMENTO'}_${veiculo.placa || veiculo.chassi || 'PDF'}.pdf`;
                const path = `veiculos/${veiculo.id}/${pdfName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
                const publicUrl = await uploadFileToSupabase(pdfFile, path);

                // Salva no veículo e mantém o URL pendente para a OS
                await saveVeiculo({ ...veiculo, cadastroDriveId: publicUrl, pastaSupabasePath: publicUrl });
                setPdfResult(prev => (prev || '') + `\n⬆️ PDF enviado para o Supabase`);

                // Guardar URL para quando a OS for criada no handleSubmit
                setPendingPdfData(prev => prev ? ({ ...prev, pdfUrl: publicUrl, pdfName }) : null);
            } catch (e) {
                console.error('Erro ao enviar PDF:', e);
                setPdfResult(prev => (prev || '') + `\n❌ Erro ao enviar PDF`);
            }

            setTipoServico(pendingPdfData.tipoServico as TipoServico);
            setPdfResult(prev => (prev || '') + `\n📄 Dados processados! Agora clique em Salvar Ordem abaixo.`);
            await loadData();
        } catch (error: any) {
            console.error('Erro ao finalizar revisão:', error);
            setPdfResult(`❌ Erro ao salvar dados: ${error.message}`);
        } finally {
            setPdfProcessing(false);
        }
    };


    // --- MODAIS DE EDICAO RAPIDA ---
    const [isEditClienteOpen, setIsEditClienteOpen] = useState(false);
    const [editClienteForm, setEditClienteForm] = useState<Partial<Cliente>>({});

    const [isEditVeiculoOpen, setIsEditVeiculoOpen] = useState(false);
    const [editVeiculoForm, setEditVeiculoForm] = useState<Partial<Veiculo>>({});

    const [veiculos, setVeiculos] = useState<Veiculo[]>([]);

    useEffect(() => {
        if (clienteId) {
            getVeiculosByCliente(clienteId).then(setVeiculos);
        } else {
            setVeiculos(allVeiculos);
        }
    }, [clienteId, allVeiculos]);

    const selectedCliente = useMemo(
        () => clientes.find((c) => c.id === clienteId),
        [clientes, clienteId]
    );

    const selectedVeiculo = useMemo(
        () => veiculos.find((v) => v.id === veiculoId),
        [veiculos, veiculoId]
    );

    // Handlers Modal Cliente
    const handleOpenEditCliente = () => {
        if (!selectedCliente) return;
        setEditClienteForm({
            nome: selectedCliente.nome,
            cpfCnpj: selectedCliente.cpfCnpj,
            email: selectedCliente.email,
            // garantindo que tenha ao menos um telefone p input
            telefones: selectedCliente.telefones?.length ? selectedCliente.telefones : ['']
        });
        setIsEditClienteOpen(true);
    };

    const handleSaveCliente = async () => {
        if (!clienteId) return;
        await updateCliente(clienteId, {
            ...editClienteForm,
            telefones: (editClienteForm.telefones || []).filter(t => t.trim() !== '')
        });
        setIsEditClienteOpen(false);
        await loadData();
    };

    // Handlers Modal Veiculo
    const handleOpenEditVeiculo = () => {
        if (!selectedVeiculo) return;
        setEditVeiculoForm({
            id: selectedVeiculo.id,
            clienteId: selectedVeiculo.clienteId,
            placa: selectedVeiculo.placa,
            renavam: selectedVeiculo.renavam,
            chassi: selectedVeiculo.chassi,
            marcaModelo: selectedVeiculo.marcaModelo,
        });
        setIsEditVeiculoOpen(true);
    };

    const handleSaveVeiculo = async () => {
        if (!veiculoId) return;
        const current = veiculos.find(v => v.id === veiculoId);
        if (current) {
            await saveVeiculo({
                ...current,
                ...editVeiculoForm,
                clienteId: editVeiculoForm.clienteId || current.clienteId,
                placa: editVeiculoForm.placa || "",
                chassi: editVeiculoForm.chassi || "",
                renavam: editVeiculoForm.renavam || "",
                marcaModelo: editVeiculoForm.marcaModelo || ""
            } as any);
            setIsEditVeiculoOpen(false);
            await loadData();
        }
    };
    const [saving, setSaving] = useState(false);

    // Extension data pre-fill — runs once when navigated from ExtensionListener
    const [extensionPdfFile, setExtensionPdfFile] = useState<File | null>(null);
    const [extensionOrigin, setExtensionOrigin] = useState<string | null>(null);

    useEffect(() => {
        const extData = initialExtensionData ?? (location.state as any)?.extensionData;
        if (!extData) return;

        // Pre-fill service/vehicle type
        if (extData.tipoServico) setTipoServico(extData.tipoServico as TipoServico);
        if (extData.tipoVeiculo) setTipoVeiculo(extData.tipoVeiculo as TipoVeiculo);
        if (typeof extData.trocaPlaca === 'boolean') setTrocaPlaca(extData.trocaPlaca);
        if (extData.extensionOrigin) setExtensionOrigin(extData.extensionOrigin);

        // Reconstruct File from base64 if present (PROCESS_DETRAN_PDF)
        if (extData.fileBase64) {
            const arr = extData.fileBase64.split(',');
            const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) u8arr[n] = bstr.charCodeAt(n);
            const file = new File([u8arr], extData.fileName || 'documento.pdf', { type: mime });
            setExtensionPdfFile(file);
            setPdfFile(file);
        }

        // Pre-fill vehicle fields into the "novo cadastro" quick form
        const v = extData.veiculo;
        const c = extData.cliente;
        if (v || c) {
            if (v?.placa) setNovoVcPlaca(v.placa);
            if (v?.chassi) setNovoVcChassi(v.chassi);
            if (v?.renavam) setNovoVcRenavam(v.renavam);
            if (v?.marcaModelo) setNovoVcMarcaModelo(v.marcaModelo);
            if (c?.nome) setNovoClNome(c.nome);
            if (c?.cpfCnpj) setNovoClCpfCnpj(c.cpfCnpj);
            if (c?.telefone) setNovoClTelefone(c.telefone);
        }

        // Try to match existing client/vehicle
        const tryPreSelect = async () => {
            const [allC, allV] = await Promise.all([getClientes(), getVeiculos()]);

            let matchedCliente = null;
            if (c?.cpfCnpj) {
                const cleanCpf = c.cpfCnpj.replace(/[^\w]/g, '');
                matchedCliente = allC.find(cl => cl.cpfCnpj?.replace(/[^\w]/g, '') === cleanCpf);
            }
            if (!matchedCliente && c?.nome) {
                matchedCliente = allC.find(cl => cl.nome.toUpperCase() === c.nome.toUpperCase());
            }
            if (matchedCliente) {
                setClienteId(matchedCliente.id!);
            }

            if (v?.placa || v?.chassi) {
                const matchedVeiculo = allV.find(vl =>
                    (v.placa && vl.placa === v.placa) ||
                    (v.chassi && vl.chassi === v.chassi)
                );
                if (matchedVeiculo) {
                    setVeiculoId(matchedVeiculo.id!);
                }
            }

            // If no existing client found, open the novo cadastro modal pre-filled
            if (!matchedCliente && (c?.nome || v?.placa)) {
                setShowNovoCadastro(true);
            }
        };

        tryPreSelect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (saving) return; // guard double-submit

        if (!clienteId || !veiculoId) {
            alert('Selecione o cliente e o veículo');
            return;
        }

        if (Object.keys(serviceLabels).length === 0) {
            alert('Não há serviços ativos configurados. Configure serviços em Configurações de Serviços antes de criar uma OS.');
            return;
        }

        setSaving(true);
        try {
            const tipoCliente: TipoCliente = selectedCliente?.tipo || 'PF';
            const extData = (location.state as any)?.extensionData;
            const checklist = await gerarChecklistDinamico(
                tipoServico, tipoCliente,
                cpfVendedor.trim() || extData?.payload?.cpfCnpjVendedor || undefined
            );

            // Upload extension PDF if present (PROCESS_DETRAN_PDF flow)
            let extensionPdfUrl: string | undefined;
            let extensionPdfName: string | undefined;
            if (extensionPdfFile) {
                try {
                    const veiculo = veiculos.find(v => v.id === veiculoId);
                    const vehicleIdentity = veiculo?.placa || veiculo?.chassi || veiculoId;
                    const safeFileName = extensionPdfFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                    const filePath = `${vehicleIdentity}/${safeFileName}`;
                    extensionPdfUrl = await uploadFileToSupabase(extensionPdfFile, filePath);
                    extensionPdfName = extensionPdfFile.name;
                    // Update vehicle with the PDF link
                    const veiculo2 = veiculos.find(v => v.id === veiculoId);
                    if (veiculo2) await saveVeiculo({ ...veiculo2, cadastroDriveId: extensionPdfUrl });
                } catch (uploadErr) {
                    console.warn('Aviso: falha ao enviar PDF da extensão:', uploadErr);
                }
            }

            const veiculo = veiculos.find(v => v.id === veiculoId);
            if (veiculo && (veiculo.cadastroDriveId || extensionPdfUrl)) {
                const hasDocument = (nome: string) =>
                    nome.toLowerCase().includes('cadastro') ||
                    nome.toLowerCase().includes('ficha de cadastro');

                const itemOriginal = checklist.find(i => hasDocument(i.nome));
                if (itemOriginal) {
                    (itemOriginal as ChecklistItem).status = 'recebido';
                    itemOriginal.observacao = 'Importado automaticamente do site do Detran';
                }
            }

            const os = await saveOrdem({
                clienteId,
                veiculoId,
                tipoServico,
                trocaPlaca,
                checklist,
                status: 'aguardando_documentacao',
                pdfDetranUrl: extensionPdfUrl || pendingPdfData?.pdfUrl,
                pdfDetranName: extensionPdfName || pendingPdfData?.pdfName,
                empresaParceiraId: empresaParceiraId || undefined,
                enviosStatus: empresaParceiraId
                    ? criarEnviosStatusFromEtapas(
                          empresas.find((e) => e.id === empresaParceiraId)?.etapasEnvio || [],
                          trocaPlaca
                      )
                    : undefined,
            });
            try {
                await finalizarOS(os.id, tipoServico, tipoVeiculo, trocaPlaca);
            } catch (err) {
                console.warn('Cobranças/preço não gerados:', err);
            }

            // Notify extension of success if this came from extension flow
            if (extData?.extensionOrigin) {
                try {
                    // Post back to opener window if available
                    if (window.opener) {
                        window.opener.postMessage(
                            { source: 'MATILDE_CRM', status: 'SUCCESS', osId: os.id },
                            extData.extensionOrigin
                        );
                    }
                } catch (_) { /* ignore cross-origin errors */ }
            }

            if (drawerMode && onCreated) {
                onCreated(os.id);
            } else {
                navigate(`/ordens/${os.id}`, { replace: true });
            }
        } catch (err: any) {
            console.error('Erro ao criar OS:', err);
            alert(`Erro ao salvar OS: ${err?.message || 'Verifique o console para detalhes.'}`);
            setSaving(false);
        }
    };

    useEffect(() => {
        const loadChecklist = async () => {
            if (!tipoServico || !selectedCliente) {
                setChecklistPreview([]);
                setChecklistError('');
                return;
            }

            try {
                const items = await gerarChecklistDinamico(
                    tipoServico,
                    selectedCliente.tipo,
                    cpfVendedor.trim() || undefined,
                );
                setChecklistPreview(items);
                setChecklistError('');
            } catch (err: any) {
                console.error('Erro ao gerar checklist dinâmico:', err);
                setChecklistPreview([]);
                setChecklistError(err?.message || 'Checklist do serviço não configurado.');
            }
        };

        loadChecklist();
    }, [tipoServico, selectedCliente, cpfVendedor]);

    return (
        <div>
            {/* Header — hidden in drawer mode (drawer provides its own header) */}
            {!drawerMode && (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-8)',
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <button
                            onClick={() => navigate(-1)}
                            style={{
                                padding: '8px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                color: 'var(--color-text-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'var(--color-text-primary)';
                                e.currentTarget.style.color = 'var(--bg-card)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'var(--bg-card)';
                                e.currentTarget.style.color = 'var(--color-text-primary)';
                            }}
                        >
                            <ArrowLeft size={20} />
                        </button>
                    </div>
                    <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.5px' }}>
                        Nova Ordem de Serviço
                    </h1>
                    <p style={{ margin: '8px 0 0', color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
                        Crie um novo processo veicular selecionando cliente, veículo e tipo de serviço
                    </p>
                </div>
            </div>
            )}

            {/* Banner: dados pré-preenchidos pela extensão */}
            {(location.state as any)?.extensionData && (
                <div style={{
                    background: 'rgba(255,193,7,0.08)',
                    borderLeft: '4px solid var(--color-primary)',
                    padding: '12px 16px',
                    borderRadius: 8,
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                }}>
                    <FileText size={18} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>
                        <strong style={{ color: 'var(--color-text-primary)' }}>Dados importados da extensão.</strong>{' '}
                        Verifique os campos pré-preenchidos abaixo, complete o telefone do cliente e clique em "Criar OS".
                    </p>
                </div>
            )}

            {/* Layout 2 colunas */}
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

            {/* === COLUNA ESQUERDA === */}
            <div style={{ flex: '1 1 400px', minWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* === Upload de PDF === */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 14,
                    padding: '24px',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    {/* Background accent */}
                    <div style={{
                        position: 'absolute',
                        top: -30,
                        right: -30,
                        width: 120,
                        height: 120,
                        borderRadius: '50%',
                        background: 'var(--color-cyan)',
                        opacity: 0.04,
                    }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, position: 'relative', zIndex: 1 }}>
                        <div style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            background: 'rgba(6,182,212,0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '2px solid rgba(6,182,212,0.2)',
                        }}>
                            <FileText size={22} style={{ color: 'var(--color-cyan)' }} />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            Importar PDF do Detran
                        </h3>
                    </div>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '16px', lineHeight: 1.6, position: 'relative', zIndex: 1 }}>
                        Envie um documento (ficha de cadastro, CRV, DAE, etc.) para preencher automaticamente os dados do cliente e veículo.
                    </p>

                    <div
                        onClick={() => !pdfProcessing && pdfInputRef.current?.click()}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.currentTarget.style.borderColor = 'var(--color-cyan)';
                            e.currentTarget.style.background = 'rgba(6,182,212,0.05)';
                        }}
                        onDragLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                            e.currentTarget.style.background = 'var(--bg-body)';
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                            e.currentTarget.style.background = 'var(--bg-body)';
                            const file = e.dataTransfer.files[0];
                            if (file) handlePdfUpload(file);
                        }}
                        style={{
                            border: '2px dashed var(--border-color)',
                            borderRadius: 12,
                            padding: '40px 20px',
                            textAlign: 'center',
                            cursor: pdfProcessing ? 'wait' : 'pointer',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            background: 'var(--bg-body)',
                            position: 'relative',
                            zIndex: 1,
                        }}
                    >
                        {pdfProcessing ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexDirection: 'column' }}>
                                <Loader size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-cyan)' }} />
                                <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>Analisando PDF...</span>
                            </div>
                        ) : (
                            <div>
                                <Upload size={40} style={{ margin: '0 auto 12px', color: 'var(--color-cyan)' }} />
                                <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)' }}>Clique ou arraste um PDF</p>
                                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Ficha de cadastro, CRV, DAE, etc.</p>
                            </div>
                        )}
                    </div>

                    <input
                        type="file"
                        ref={pdfInputRef}
                        accept=".pdf"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePdfUpload(file);
                            e.target.value = '';
                        }}
                    />

                    {pdfResult && (
                        <div style={{
                            marginTop: '16px',
                            padding: '12px',
                            borderRadius: 10,
                            background: pdfResult.includes('❌') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                            border: `1px solid ${pdfResult.includes('❌') ? 'var(--color-danger)' : 'var(--color-success-bright)'}`,
                            color: pdfResult.includes('❌') ? 'var(--color-danger)' : 'var(--color-success-bright)',
                            whiteSpace: 'pre-line',
                            fontSize: '0.85rem',
                            position: 'relative',
                            zIndex: 1,
                        }}>
                            {pdfResult}
                        </div>
                    )}
                </div>

                {/* === Card Cliente + Veículo === */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 14,
                    padding: '24px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'rgba(139,92,246,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '1.5px solid rgba(139,92,246,0.2)',
                        }}>
                            <Edit2 size={16} style={{ color: 'var(--color-purple)' }} />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            Cliente e Veículo
                        </h3>
                    </div>

                    {/* Cliente */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: 'var(--color-text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: '8px',
                        }}>Cliente *</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                                value={clienteId}
                                onChange={(e) => {
                                    setClienteId(e.target.value);
                                    setVeiculoId('');
                                }}
                                required
                                style={{
                                    flex: 1,
                                    padding: '10px 12px',
                                    fontSize: '0.95rem',
                                    borderRadius: 10,
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-body)',
                                    color: 'var(--color-text-primary)',
                                    transition: 'all 0.2s',
                                    outline: 'none',
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = 'var(--color-purple)';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'var(--border-color)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            >
                                <option value="">Selecione o cliente...</option>
                                {clientes.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome} — {c.cpfCnpj}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => setShowNovoCadastro(true)}
                                style={{
                                    padding: '10px 12px',
                                    background: 'rgba(22,163,74,0.12)',
                                    color: 'var(--color-success-dark)',
                                    border: 'none',
                                    borderRadius: 10,
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-success-dark)'; e.currentTarget.style.color = 'var(--color-white)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(22,163,74,0.12)'; e.currentTarget.style.color = 'var(--color-success-dark)'; }}
                                title="Novo Cliente"
                            >
                                <Plus size={16} />
                            </button>
                            {clienteId && (
                                <button
                                    type="button"
                                    onClick={handleOpenEditCliente}
                                    style={{
                                        padding: '10px 12px',
                                        background: 'rgba(139,92,246,0.12)',
                                        color: 'var(--color-purple)',
                                        border: 'none',
                                        borderRadius: 10,
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '0.8rem',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'var(--color-purple)';
                                        e.currentTarget.style.color = 'var(--color-white)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(139,92,246,0.12)';
                                        e.currentTarget.style.color = 'var(--color-purple)';
                                    }}
                                    title="Editar Cadastro Rápido"
                                >
                                    <Edit2 size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Veículo */}
                    <div style={{ marginBottom: 0 }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: 'var(--color-text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: '8px',
                        }}>Veículo *</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                                value={veiculoId}
                                onChange={(e) => setVeiculoId(e.target.value)}
                                required
                                style={{
                                    flex: 1,
                                    padding: '10px 12px',
                                    fontSize: '0.95rem',
                                    borderRadius: 10,
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-body)',
                                    color: 'var(--color-text-primary)',
                                    transition: 'all 0.2s',
                                    outline: 'none',
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = 'var(--color-purple)';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'var(--border-color)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            >
                                <option value="">Selecione o veículo...</option>
                                {veiculos.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.placa ? `${v.placa} — ` : ''}{v.marcaModelo || v.chassi}
                                    </option>
                                ))}
                            </select>
                            {clienteId && (
                                <button
                                    type="button"
                                    onClick={() => setShowNovoVeiculo(true)}
                                    style={{
                                        padding: '10px 12px',
                                        background: 'rgba(22,163,74,0.12)',
                                        color: 'var(--color-success-dark)',
                                        border: 'none',
                                        borderRadius: 10,
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '0.8rem',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-success-dark)'; e.currentTarget.style.color = 'var(--color-white)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(22,163,74,0.12)'; e.currentTarget.style.color = 'var(--color-success-dark)'; }}
                                    title="Novo Veículo"
                                >
                                    <Plus size={16} />
                                </button>
                            )}
                            {veiculoId && (
                                <button
                                    type="button"
                                    onClick={handleOpenEditVeiculo}
                                    style={{
                                        padding: '10px 12px',
                                        background: 'rgba(139,92,246,0.12)',
                                        color: 'var(--color-purple)',
                                        border: 'none',
                                        borderRadius: 10,
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '0.8rem',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'var(--color-purple)';
                                        e.currentTarget.style.color = 'var(--color-white)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(139,92,246,0.12)';
                                        e.currentTarget.style.color = 'var(--color-purple)';
                                    }}
                                    title="Editar Cadastro Rápido"
                                >
                                    <Edit2 size={16} />
                                </button>
                            )}
                        </div>
                        {clienteId && veiculos.length === 0 && (
                            <p style={{
                                fontSize: '0.8rem',
                                color: 'var(--color-text-secondary)',
                                marginTop: '6px',
                            }}>
                                Nenhum veículo para este cliente. Use o botão <strong style={{ color: 'var(--color-success-dark)' }}>+</strong> para cadastrar.
                            </p>
                        )}
                    </div>
                </div>

            </div>{/* fim coluna esquerda */}

            {/* === COLUNA DIREITA === */}
            <div style={{ flex: '1 1 400px', minWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* === Card Tipo de Serviço / Opções === */}
                <form onSubmit={handleSubmit} style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 14,
                    padding: '24px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'rgba(255,193,7,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '1.5px solid rgba(255,193,7,0.25)',
                        }}>
                            <Save size={16} style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            Tipo de Serviço e Opções
                        </h3>
                    </div>

                    {/* Empresa Parceira */}
                    <div style={{ marginBottom: '20px' }}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Empresa Parceira
                        </label>
                        <select
                            value={empresaParceiraId}
                            onChange={(e) => {
                                const id = e.target.value;
                                setEmpresaParceiraId(id);
                            }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            style={{ width: '100%', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 12px', fontSize: '0.9rem', background: 'var(--bg-body)', color: 'var(--color-text-primary)' }}
                        >
                            <option value="">Nenhuma (particular)</option>
                            {empresas.map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                    {emp.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Tipo de Serviço */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: 'var(--color-text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: '12px',
                        }}>Tipo de Serviço *</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', flexWrap: 'wrap' }}>
                            {Object.keys(serviceLabels).length === 0 ? (
                                <div style={{ gridColumn: '1 / -1', color: 'var(--color-warning)', fontSize: '0.9rem' }}>
                                    Nenhum serviço ativo encontrado. Acesse Configurações de Serviços para cadastrar e ativar.
                                </div>
                            ) : (
                                Object.entries(serviceLabels).map(([key, label]) => (
                                    <button
                                        type="button"
                                        key={key}
                                        onClick={() => {
                                            setTipoServico(key as TipoServico);
                                            if (key === 'primeiro_emplacamento') setTrocaPlaca(true);
                                        }}
                                        style={{
                                            padding: '10px 14px',
                                            background: tipoServico === key ? 'rgba(139,92,246,0.12)' : 'var(--bg-body)',
                                            color: tipoServico === key ? 'var(--color-purple)' : 'var(--color-text-primary)',
                                            border: tipoServico === key ? '2px solid #8B5CF6' : '1px solid var(--border-color)',
                                            borderRadius: 10,
                                            fontWeight: tipoServico === key ? 700 : 500,
                                            fontSize: '0.82rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.18s ease',
                                            boxShadow: tipoServico === key ? '0 2px 8px rgba(139,92,246,0.15)' : 'none',
                                        }}
                                        onMouseEnter={e => {
                                            if (tipoServico !== key) {
                                                e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)';
                                                e.currentTarget.style.background = 'rgba(139,92,246,0.06)';
                                                e.currentTarget.style.color = 'var(--color-purple)';
                                            }
                                        }}
                                        onMouseLeave={e => {
                                            if (tipoServico !== key) {
                                                e.currentTarget.style.borderColor = 'var(--border-color)';
                                                e.currentTarget.style.background = 'var(--bg-body)';
                                                e.currentTarget.style.color = 'var(--color-text-primary)';
                                            }
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Troca de Placa */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: 'var(--color-text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: '10px',
                        }}>Há troca de placa?</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setTrocaPlaca(false)}
                                style={{
                                    padding: '12px',
                                    background: !trocaPlaca ? 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' : 'var(--bg-body)',
                                    color: !trocaPlaca ? '#000' : 'var(--color-text-primary)',
                                    border: !trocaPlaca ? 'none' : '1px solid var(--border-color)',
                                    borderRadius: 10,
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxShadow: !trocaPlaca ? '0 4px 12px rgba(255,193,7,0.3)' : 'none',
                                }}
                                onMouseEnter={e => {
                                    if (trocaPlaca) {
                                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                                        e.currentTarget.style.background = 'rgba(255,193,7,0.08)';
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (trocaPlaca) {
                                        e.currentTarget.style.borderColor = 'var(--border-color)';
                                        e.currentTarget.style.background = 'var(--bg-body)';
                                    }
                                }}
                            >
                                Não
                            </button>
                            <button
                                type="button"
                                onClick={() => setTrocaPlaca(true)}
                                style={{
                                    padding: '12px',
                                    background: trocaPlaca ? 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' : 'var(--bg-body)',
                                    color: trocaPlaca ? '#000' : 'var(--color-text-primary)',
                                    border: trocaPlaca ? 'none' : '1px solid var(--border-color)',
                                    borderRadius: 10,
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxShadow: trocaPlaca ? '0 4px 12px rgba(255,193,7,0.3)' : 'none',
                                }}
                                onMouseEnter={e => {
                                    if (!trocaPlaca) {
                                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                                        e.currentTarget.style.background = 'rgba(255,193,7,0.08)';
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!trocaPlaca) {
                                        e.currentTarget.style.borderColor = 'var(--border-color)';
                                        e.currentTarget.style.background = 'var(--bg-body)';
                                    }
                                }}
                            >
                                Sim
                            </button>
                        </div>
                    </div>

                    {/* Tipo de Veículo */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: 'var(--color-text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: '10px',
                        }}>
                            Tipo de Veículo
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxWidth: 320 }}>
                            {(['carro', 'moto'] as const).map((tipo) => (
                                <button
                                    key={tipo}
                                    type="button"
                                    onClick={() => setTipoVeiculo(tipo)}
                                    style={{
                                        padding: '10px 16px',
                                        background: tipoVeiculo === tipo ? 'rgba(6,182,212,0.12)' : 'var(--bg-body)',
                                        color: tipoVeiculo === tipo ? 'var(--color-cyan)' : 'var(--color-text-primary)',
                                        border: tipoVeiculo === tipo ? '2px solid #06B6D4' : '1px solid var(--border-color)',
                                        borderRadius: 10,
                                        fontWeight: tipoVeiculo === tipo ? 700 : 500,
                                        fontSize: '0.9rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.18s ease',
                                        textTransform: 'capitalize',
                                    }}
                                    onMouseEnter={e => {
                                        if (tipoVeiculo !== tipo) {
                                            e.currentTarget.style.borderColor = 'rgba(6,182,212,0.5)';
                                            e.currentTarget.style.background = 'rgba(6,182,212,0.06)';
                                            e.currentTarget.style.color = 'var(--color-cyan)';
                                        }
                                    }}
                                    onMouseLeave={e => {
                                        if (tipoVeiculo !== tipo) {
                                            e.currentTarget.style.borderColor = 'var(--border-color)';
                                            e.currentTarget.style.background = 'var(--bg-body)';
                                            e.currentTarget.style.color = 'var(--color-text-primary)';
                                        }
                                    }}
                                >
                                    {tipo === 'carro' ? 'Carro' : 'Moto'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* CPF/CNPJ do Vendedor (apenas para Transferência) */}
                    {tipoServico === 'transferencia' && (
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{
                                display: 'block',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                color: 'var(--color-text-secondary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                marginBottom: '8px',
                            }}>CPF/CNPJ do Vendedor (opcional)</label>
                            <input
                                type="text"
                                placeholder="Preencha se o vendedor for PJ"
                                value={cpfVendedor}
                                onChange={e => setCpfVendedor(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    fontSize: '0.95rem',
                                    borderRadius: 10,
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-body)',
                                    color: 'var(--color-text-primary)',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                                Se o vendedor for pessoa jurídica, adicione o CNPJ para incluir documentos extras no checklist.
                            </p>
                        </div>
                    )}

                    {/* Preview do checklist */}
                    {selectedCliente && (
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(255,193,7,0.08), rgba(255,193,7,0.04))',
                            border: '1px solid rgba(255,193,7,0.2)',
                            padding: '16px',
                            borderRadius: 12,
                            marginBottom: '20px',
                        }}>
                            <label style={{
                                display: 'block',
                                fontSize: '0.95rem',
                                fontWeight: 700,
                                color: 'var(--color-text-primary)',
                                marginBottom: '12px',
                            }}>
                                Checklist que será gerado automaticamente
                            </label>

                            {checklistError ? (
                                <p style={{ color: 'var(--color-error, #ef4444)', margin: 0 }}>
                                    {checklistError}
                                </p>
                            ) : (
                                <ul style={{ paddingLeft: '20px', margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                                    {checklistPreview.map((item) => (
                                        <li key={item.id} style={{ marginBottom: '6px' }}>
                                            {item.nome}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: '24px' }}>
                        <button
                            type="button"
                            onClick={() => drawerMode ? onCancel?.() : navigate(-1)}
                            style={{
                                padding: '12px 24px',
                                background: 'var(--bg-body)',
                                color: 'var(--color-text-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 10,
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'var(--color-text-primary)';
                                e.currentTarget.style.color = 'var(--bg-body)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'var(--bg-body)';
                                e.currentTarget.style.color = 'var(--color-text-primary)';
                            }}
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            disabled={saving}
                            style={{
                                flex: '1 1 auto',
                                minWidth: '200px',
                                padding: '12px 24px',
                                background: saving ? '#888' : 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                                color: 'var(--color-text-inverse)',
                                border: 'none',
                                borderRadius: 10,
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                cursor: saving ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: saving ? 'none' : '0 4px 12px rgba(255,193,7,0.3)',
                                opacity: saving ? 0.7 : 1,
                            }}
                            onMouseEnter={e => {
                                if (!saving) {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(255,193,7,0.4)';
                                }
                            }}
                            onMouseLeave={e => {
                                if (!saving) {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,193,7,0.3)';
                                }
                            }}
                        >
                            {saving ? <><Loader size={16} className="spin" /> Salvando...</> : <><Save size={16} /> Criar Ordem de Serviço</>}
                        </button>
                    </div>
                </form>

            </div>{/* fim coluna direita */}
            </div>{/* fim layout 2 colunas */}

            {/* Modal Editar Cliente */}
            {isEditClienteOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '20px',
                }} onClick={() => setIsEditClienteOpen(false)}>
                    <div style={{
                        background: 'var(--bg-card)',
                        borderRadius: 16,
                        maxWidth: 500,
                        width: '100%',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '20px',
                            borderBottom: '1px solid var(--border-color)',
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                Correção Rápida de Cliente
                            </h3>
                            <button
                                onClick={() => setIsEditClienteOpen(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--color-text-secondary)',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-primary)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
                            >
                                <X size={24} />
                            </button>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{
                                    display: 'block',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text-secondary)',
                                    marginBottom: '6px',
                                }}>Nome</label>
                                <input
                                    type="text"
                                    value={editClienteForm.nome || ''}
                                    onChange={e => setEditClienteForm({ ...editClienteForm, nome: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: 10,
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-body)',
                                        color: 'var(--color-text-primary)',
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{
                                    display: 'block',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text-secondary)',
                                    marginBottom: '6px',
                                }}>CPF/CNPJ</label>
                                <input
                                    type="text"
                                    value={editClienteForm.cpfCnpj || ''}
                                    onChange={e => setEditClienteForm({ ...editClienteForm, cpfCnpj: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: 10,
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-body)',
                                        color: 'var(--color-text-primary)',
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{
                                    display: 'block',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text-secondary)',
                                    marginBottom: '6px',
                                }}>Telefone (WhatsApp)</label>
                                <input
                                    type="text"
                                    placeholder="(31) 99999-9999"
                                    value={editClienteForm.telefones?.[0] || ''}
                                    onChange={e => {
                                        const t = [...(editClienteForm.telefones || [''])];
                                        t[0] = e.target.value;
                                        setEditClienteForm({ ...editClienteForm, telefones: t });
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: 10,
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-body)',
                                        color: 'var(--color-text-primary)',
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '6px 0 0' }}>
                                    Salvaremos apenas o 1º telefone aqui. Vá em editar completo para mais.
                                </p>
                            </div>
                            <div>
                                <label style={{
                                    display: 'block',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text-secondary)',
                                    marginBottom: '6px',
                                }}>E-mail</label>
                                <input
                                    type="email"
                                    value={editClienteForm.email || ''}
                                    onChange={e => setEditClienteForm({ ...editClienteForm, email: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: 10,
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-body)',
                                        color: 'var(--color-text-primary)',
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                        </div>
                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'flex-end',
                            padding: '16px 20px',
                            borderTop: '1px solid var(--border-color)',
                            background: 'var(--bg-body)',
                        }}>
                            <button
                                onClick={() => setIsEditClienteOpen(false)}
                                style={{
                                    padding: '10px 20px',
                                    background: 'transparent',
                                    color: 'var(--color-text-primary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 10,
                                    fontWeight: 600,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'var(--color-text-primary)';
                                    e.currentTarget.style.color = 'var(--bg-card)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--color-text-primary)';
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveCliente}
                                style={{
                                    padding: '10px 20px',
                                    background: 'var(--color-purple)',
                                    color: 'var(--color-white)',
                                    border: 'none',
                                    borderRadius: 10,
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(139,92,246,0.4)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(139,92,246,0.3)';
                                }}
                            >
                                Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Editar Veiculo */}
            {isEditVeiculoOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '20px',
                }} onClick={() => setIsEditVeiculoOpen(false)}>
                    <div style={{
                        background: 'var(--bg-card)',
                        borderRadius: 16,
                        maxWidth: 500,
                        width: '100%',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '20px',
                            borderBottom: '1px solid var(--border-color)',
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                Correção Rápida de Veículo
                            </h3>
                            <button
                                onClick={() => setIsEditVeiculoOpen(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--color-text-secondary)',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-primary)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
                            >
                                <X size={24} />
                            </button>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        color: 'var(--color-text-secondary)',
                                        marginBottom: '6px',
                                    }}>Placa</label>
                                    <input
                                        type="text"
                                        value={editVeiculoForm.placa || ''}
                                        onChange={e => setEditVeiculoForm({ ...editVeiculoForm, placa: e.target.value.toUpperCase() })}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 10,
                                            border: '1px solid var(--border-color)',
                                            background: 'var(--bg-body)',
                                            color: 'var(--color-text-primary)',
                                            fontSize: '0.95rem',
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        color: 'var(--color-text-secondary)',
                                        marginBottom: '6px',
                                    }}>Chassi</label>
                                    <input
                                        type="text"
                                        value={editVeiculoForm.chassi || ''}
                                        onChange={e => setEditVeiculoForm({ ...editVeiculoForm, chassi: e.target.value.toUpperCase() })}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 10,
                                            border: '1px solid var(--border-color)',
                                            background: 'var(--bg-body)',
                                            color: 'var(--color-text-primary)',
                                            fontSize: '0.95rem',
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{
                                    display: 'block',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text-secondary)',
                                    marginBottom: '6px',
                                }}>Renavam</label>
                                <input
                                    type="text"
                                    value={editVeiculoForm.renavam || ''}
                                    onChange={e => setEditVeiculoForm({ ...editVeiculoForm, renavam: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: 10,
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-body)',
                                        color: 'var(--color-text-primary)',
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{
                                    display: 'block',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text-secondary)',
                                    marginBottom: '6px',
                                }}>Marca/Modelo</label>
                                <input
                                    type="text"
                                    value={editVeiculoForm.marcaModelo || ''}
                                    onChange={e => setEditVeiculoForm({ ...editVeiculoForm, marcaModelo: e.target.value.toUpperCase() })}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: 10,
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-body)',
                                        color: 'var(--color-text-primary)',
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                        </div>
                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'flex-end',
                            padding: '16px 20px',
                            borderTop: '1px solid var(--border-color)',
                            background: 'var(--bg-body)',
                        }}>
                            <button
                                onClick={() => setIsEditVeiculoOpen(false)}
                                style={{
                                    padding: '10px 20px',
                                    background: 'transparent',
                                    color: 'var(--color-text-primary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 10,
                                    fontWeight: 600,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'var(--color-text-primary)';
                                    e.currentTarget.style.color = 'var(--bg-card)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--color-text-primary)';
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveVeiculo}
                                style={{
                                    padding: '10px 20px',
                                    background: 'var(--color-purple)',
                                    color: 'var(--color-white)',
                                    border: 'none',
                                    borderRadius: 10,
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(139,92,246,0.4)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(139,92,246,0.3)';
                                }}
                            >
                                Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal Novo Cadastro (cliente + veículo) */}
            {showNovoCadastro && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.55)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '20px',
                }} onClick={() => { setShowNovoCadastro(false); resetNovoForm(); }}>
                    <div style={{
                        background: 'var(--bg-card)', borderRadius: 16,
                        maxWidth: 560, width: '100%',
                        maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
                        border: '1px solid var(--border-color)',
                    }} onClick={e => e.stopPropagation()}>
                        {/* Cabeçalho */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '18px 20px', borderBottom: '1px solid var(--border-color)',
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                Novo Cadastro — Cliente e Veículo
                            </h3>
                            <button onClick={() => { setShowNovoCadastro(false); resetNovoForm(); }} style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--color-text-secondary)', padding: '4px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <X size={22} />
                            </button>
                        </div>

                        {/* Corpo com scroll */}
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* Seção Cliente */}
                            <div>
                                <p style={{ margin: '0 0 14px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    Dados do Cliente
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Nome *</label>
                                        <input
                                            type="text"
                                            value={novoClNome}
                                            onChange={e => setNovoClNome(e.target.value)}
                                            placeholder="Nome completo"
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>CPF/CNPJ *</label>
                                            <input
                                                type="text"
                                                value={novoClCpfCnpj}
                                                onChange={e => setNovoClCpfCnpj(e.target.value)}
                                                placeholder="000.000.000-00"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Telefone</label>
                                            <input
                                                type="text"
                                                value={novoClTelefone}
                                                onChange={e => setNovoClTelefone(e.target.value)}
                                                placeholder="(31) 99999-9999"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>E-mail</label>
                                        <input
                                            type="email"
                                            value={novoClEmail}
                                            onChange={e => setNovoClEmail(e.target.value)}
                                            placeholder="cliente@email.com"
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Tipo</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            {(['PF', 'PJ'] as const).map(t => (
                                                <button key={t} type="button" onClick={() => setNovoClTipo(t)} style={{
                                                    padding: '9px', borderRadius: 10, fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.15s',
                                                    background: novoClTipo === t ? 'rgba(139,92,246,0.12)' : 'var(--bg-body)',
                                                    color: novoClTipo === t ? 'var(--color-purple)' : 'var(--color-text-primary)',
                                                    border: novoClTipo === t ? '2px solid #8B5CF6' : '1px solid var(--border-color)',
                                                }}>{t === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Divisor */}
                            <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '4px' }}>
                                <p style={{ margin: '0 0 14px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    Dados do Veículo
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Placa *</label>
                                            <input
                                                type="text"
                                                value={novoVcPlaca}
                                                onChange={e => setNovoVcPlaca(e.target.value.toUpperCase())}
                                                placeholder="ABC1D23"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Renavam</label>
                                            <input
                                                type="text"
                                                value={novoVcRenavam}
                                                onChange={e => setNovoVcRenavam(e.target.value)}
                                                placeholder="00000000000"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Marca/Modelo *</label>
                                        <input
                                            type="text"
                                            value={novoVcMarcaModelo}
                                            onChange={e => setNovoVcMarcaModelo(e.target.value.toUpperCase())}
                                            placeholder="FIAT/PALIO"
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Ano Fabricação</label>
                                            <input
                                                type="text"
                                                value={novoVcAnoFab}
                                                onChange={e => setNovoVcAnoFab(e.target.value)}
                                                placeholder="2020"
                                                maxLength={4}
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Ano Modelo</label>
                                            <input
                                                type="text"
                                                value={novoVcAnoMod}
                                                onChange={e => setNovoVcAnoMod(e.target.value)}
                                                placeholder="2021"
                                                maxLength={4}
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Chassi</label>
                                        <input
                                            type="text"
                                            value={novoVcChassi}
                                            onChange={e => setNovoVcChassi(e.target.value.toUpperCase())}
                                            placeholder="9BWZZZ377VT004251"
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {erroNovoCadastro && (
                                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', fontSize: '0.875rem' }}>
                                    {erroNovoCadastro}
                                </div>
                            )}
                        </div>

                        {/* Rodapé */}
                        <div style={{
                            display: 'flex', gap: '10px', justifyContent: 'flex-end',
                            padding: '16px 20px', borderTop: '1px solid var(--border-color)',
                            background: 'var(--bg-body)', borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
                        }}>
                            <button onClick={() => { setShowNovoCadastro(false); resetNovoForm(); }} style={{
                                padding: '10px 20px', background: 'transparent', color: 'var(--color-text-primary)',
                                border: '1px solid var(--border-color)', borderRadius: 10, fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                            }}>Cancelar</button>
                            <button onClick={handleSalvarNovoCadastro} disabled={salvandoNovo} style={{
                                padding: '10px 20px', background: 'var(--color-success-dark)', color: 'var(--color-white)',
                                border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.9rem',
                                cursor: salvandoNovo ? 'not-allowed' : 'pointer', opacity: salvandoNovo ? 0.7 : 1,
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                {salvandoNovo ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                                Salvar Cliente + Veículo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Novo Veículo */}
            {showNovoVeiculo && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '20px',
                }} onClick={() => setShowNovoVeiculo(false)}>
                    <div style={{
                        background: 'var(--bg-card)', borderRadius: 16,
                        maxWidth: 480, width: '100%',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
                        border: '1px solid var(--border-color)',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '20px', borderBottom: '1px solid var(--border-color)',
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                Novo Veículo
                            </h3>
                            <button onClick={() => setShowNovoVeiculo(false)} style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--color-text-secondary)', padding: '4px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <X size={22} />
                            </button>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Placa *</label>
                                    <input
                                        type="text"
                                        value={novoVcPlaca}
                                        onChange={e => setNovoVcPlaca(e.target.value.toUpperCase())}
                                        placeholder="ABC1D23"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Renavam</label>
                                    <input
                                        type="text"
                                        value={novoVcRenavam}
                                        onChange={e => setNovoVcRenavam(e.target.value)}
                                        placeholder="00000000000"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Chassi</label>
                                <input
                                    type="text"
                                    value={novoVcChassi}
                                    onChange={e => setNovoVcChassi(e.target.value.toUpperCase())}
                                    placeholder="9BWZZZ377VT004251"
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Marca/Modelo *</label>
                                <input
                                    type="text"
                                    value={novoVcMarcaModelo}
                                    onChange={e => setNovoVcMarcaModelo(e.target.value.toUpperCase())}
                                    placeholder="FIAT/PALIO"
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>
                        <div style={{
                            display: 'flex', gap: '10px', justifyContent: 'flex-end',
                            padding: '16px 20px', borderTop: '1px solid var(--border-color)',
                            background: 'var(--bg-body)', borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
                        }}>
                            <button onClick={() => setShowNovoVeiculo(false)} style={{
                                padding: '10px 20px', background: 'transparent', color: 'var(--color-text-primary)',
                                border: '1px solid var(--border-color)', borderRadius: 10, fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                            }}>Cancelar</button>
                            <button onClick={handleSalvarNovoVeiculo} disabled={salvandoNovo} style={{
                                padding: '10px 20px', background: 'var(--color-success-dark)', color: 'var(--color-white)',
                                border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.9rem',
                                cursor: salvandoNovo ? 'not-allowed' : 'pointer', opacity: salvandoNovo ? 0.7 : 1,
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                {salvandoNovo ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                                Salvar Veículo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Revisão de PDF */}
            {isReviewPdfModalOpen && pendingPdfData && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '16px',
                }}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 16,
                        maxWidth: 600, width: '100%',
                        maxHeight: 'calc(100vh - 32px)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
                            background: 'var(--bg-surface)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FileText size={20} style={{ color: 'var(--color-cyan)' }} />
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Conferir Dados do PDF</h3>
                            </div>
                            <button onClick={() => setIsReviewPdfModalOpen(false)} style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--color-text-secondary)', padding: '4px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Corpo */}
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{
                                background: 'rgba(255,193,7,0.08)', borderLeft: '4px solid var(--color-primary)',
                                padding: '10px 14px', borderRadius: 8,
                            }}>
                                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                                    <strong style={{ color: 'var(--color-text-primary)' }}>Atenção:</strong> Verifique se o Cliente, Telefone e Veículo estão corretos antes de confirmar.
                                </p>
                            </div>

                            {/* Nome do Cliente */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Nome do Cliente</label>
                                <input type="text" value={pendingPdfData.clienteNome}
                                    onChange={e => setPendingPdfData({ ...pendingPdfData, clienteNome: e.target.value.toUpperCase() })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>CPF/CNPJ</label>
                                    <input type="text" value={pendingPdfData.clienteCpfCnpj}
                                        onChange={e => setPendingPdfData({ ...pendingPdfData, clienteCpfCnpj: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>WhatsApp / Telefone</label>
                                    <input type="text" placeholder="(31) 99999-9999" value={pendingPdfData.telefone}
                                        onChange={e => setPendingPdfData({ ...pendingPdfData, telefone: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,193,7,0.5)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Tipo de Serviço</label>
                                    <select value={pendingPdfData.tipoServico}
                                        onChange={e => setPendingPdfData({ ...pendingPdfData, tipoServico: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none' }}>
                                        {Object.entries(serviceLabels).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '14px' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dados do Veículo</span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Placa</label>
                                    <input type="text" value={pendingPdfData.placa}
                                        onChange={e => setPendingPdfData({ ...pendingPdfData, placa: e.target.value.toUpperCase() })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Renavam</label>
                                    <input type="text" value={pendingPdfData.renavam}
                                        onChange={e => setPendingPdfData({ ...pendingPdfData, renavam: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Chassi</label>
                                    <input type="text" value={pendingPdfData.chassi}
                                        onChange={e => setPendingPdfData({ ...pendingPdfData, chassi: e.target.value.toUpperCase() })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Marca/Modelo</label>
                                    <input type="text" value={pendingPdfData.marcaModelo}
                                        onChange={e => setPendingPdfData({ ...pendingPdfData, marcaModelo: e.target.value.toUpperCase() })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Data Aquisição</label>
                                    <input type="text" value={pendingPdfData.dataAquisicao}
                                        onChange={e => setPendingPdfData({ ...pendingPdfData, dataAquisicao: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Emissão CRV</label>
                                    <input type="text" value={pendingPdfData.dataEmissao}
                                        onChange={e => setPendingPdfData({ ...pendingPdfData, dataEmissao: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--color-text-primary)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '16px 20px', borderTop: '1px solid var(--border-color)',
                            background: 'var(--bg-surface)', display: 'flex', gap: '10px',
                        }}>
                            <button onClick={() => setIsReviewPdfModalOpen(false)} style={{
                                flex: 1, padding: '10px 20px', background: 'transparent',
                                color: 'var(--color-text-primary)', border: '1px solid var(--border-color)',
                                borderRadius: 10, fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                            }}>
                                Cancelar
                            </button>
                            <button onClick={handleConfirmPdfReview} style={{
                                flex: 2, padding: '10px 20px',
                                background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                                color: 'var(--color-text-inverse)', border: 'none', borderRadius: 10, fontWeight: 700,
                                fontSize: '0.9rem', cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(255,193,7,0.3)',
                            }}>
                                Confirmar e Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

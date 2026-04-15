import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Save, ArrowLeft, Upload, FileText, CheckCircle, Loader2, AlertCircle, FolderPlus, Car, User, Hash, Tag } from 'lucide-react';
import { getVeiculo, saveVeiculo, getClientes, saveOrdem } from '../lib/database';
import { gerarChecklistDinamico } from '../lib/configService';
import { useServiceLabels } from '../hooks/useServiceLabels';
import type { TipoServico, TipoCliente, Cliente, ChecklistItem } from '../types';
import { extractVehicleData, type DadosExtraidos } from '../lib/pdfParser';
import { uploadFileToSupabase } from '../lib/fileStorage';
import { useToast } from '../components/Toast';

// ===== STYLE HELPERS =====
const sectionCard: React.CSSProperties = {
    background: 'var(--notion-surface)',
    border: '1px solid var(--notion-border)',
    borderRadius: 12,
    padding: '20px 24px',
    marginBottom: 16,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};

const sectionHeader: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
    paddingBottom: 12,
    borderBottom: '1px solid var(--notion-border)',
};

const sectionTitle: React.CSSProperties = {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--notion-text)',
    letterSpacing: '-0.01em',
};

const fieldLabel: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--notion-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
};

const fieldInput: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--notion-bg)',
    color: 'var(--notion-text)',
    border: '1px solid var(--notion-border)',
    borderRadius: 8,
    fontSize: 16,
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 150ms, box-shadow 150ms',
    boxSizing: 'border-box',
};

const pdfBadge: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#059669',
    background: 'rgba(5,150,105,0.1)',
    padding: '2px 8px',
    borderRadius: 6,
    marginLeft: 6,
    textTransform: 'none',
    letterSpacing: 0,
};

export default function VeiculoForm() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const serviceLabels = useServiceLabels();
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const isEditing = Boolean(id);
    const fileRef = useRef<HTMLInputElement>(null);

    const [clientes, setClientes] = useState<Cliente[]>([]);

    const [placa, setPlaca] = useState('');
    const [renavam, setRenavam] = useState('');
    const [chassi, setChassi] = useState('');
    const [marcaModelo, setMarcaModelo] = useState('');
    const [clienteId, setClienteId] = useState(searchParams.get('clienteId') || '');
    const [observacoes, setObservacoes] = useState('');
    // Campos extras (mesmo conjunto do VeiculoEditFullModal)
    const [categoria, setCategoria] = useState('');
    const [anoFabricacao, setAnoFabricacao] = useState('');
    const [anoModelo, setAnoModelo] = useState('');
    const [cor, setCor] = useState('');
    const [combustivel, setCombustivel] = useState('');
    const [dataAquisicao, setDataAquisicao] = useState('');
    const [hodometro, setHodometro] = useState('');

    // PDF extraction state
    const [extracting, setExtracting] = useState(false);
    const [extractionResult, setExtractionResult] = useState<DadosExtraidos | null>(null);
    const [extractionError, setExtractionError] = useState('');
    const [fieldsFilledFromPdf, setFieldsFilledFromPdf] = useState<string[]>([]);
    const [pdfFile, setPdfFile] = useState<File | null>(null);

    // OS creation state (when PDF is used)
    const [criarOS, setCriarOS] = useState(true);
    const [tipoServico, setTipoServico] = useState<TipoServico>('primeiro_emplacamento');
    const [trocaPlaca, setTrocaPlaca] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveStep, setSaveStep] = useState('');
    const [checklistPreview, setChecklistPreview] = useState<ChecklistItem[]>([]);

    useEffect(() => {
        (async () => {
            const c = await getClientes();
            setClientes(c);
            if (id) {
                const veiculo = await getVeiculo(id);
                if (veiculo) {
                    setPlaca(veiculo.placa);
                    setRenavam(veiculo.renavam);
                    setChassi(veiculo.chassi);
                    setMarcaModelo(veiculo.marcaModelo);
                    setClienteId(veiculo.clienteId);
                    setObservacoes(veiculo.observacoes || '');
                    setCategoria(veiculo.categoria || '');
                    setAnoFabricacao(veiculo.anoFabricacao || '');
                    setAnoModelo(veiculo.anoModelo || '');
                    setCor(veiculo.cor || '');
                    setCombustivel(veiculo.combustivel || '');
                    setDataAquisicao(
                        veiculo.dataAquisicao
                            ? (veiculo.dataAquisicao.includes('T')
                                ? veiculo.dataAquisicao.split('T')[0]
                                : veiculo.dataAquisicao)
                            : ''
                    );
                    setHodometro(veiculo.hodometro || '');
                }
            }
        })();
    }, [id]);

    const selectedCliente = useMemo(
        () => clientes.find((c) => c.id === clienteId),
        [clientes, clienteId]
    );

    useEffect(() => {
        if (selectedCliente && tipoServico) {
            gerarChecklistDinamico(tipoServico, selectedCliente.tipo)
                .then(setChecklistPreview)
                .catch(() => setChecklistPreview([]));
        } else {
            setChecklistPreview([]);
        }
    }, [tipoServico, selectedCliente]);

    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            setExtractionError('Apenas arquivos PDF são aceitos');
            return;
        }

        setExtracting(true);
        setExtractionError('');
        setFieldsFilledFromPdf([]);
        setPdfFile(file);

        try {
            const data = await extractVehicleData(file);
            setExtractionResult(data);

            const filled: string[] = [];

            if (data.placa && !placa) {
                setPlaca(data.placa);
                filled.push('Placa');
            }
            if (data.renavam && !renavam) {
                setRenavam(data.renavam);
                filled.push('Renavam');
            }
            if (data.chassi && !chassi) {
                setChassi(data.chassi);
                filled.push('Chassi');
            }
            if (data.marcaModelo && !marcaModelo) {
                let modelo = data.marcaModelo;
                if (data.anoFabricacao || data.anoModelo) {
                    modelo += ` ${data.anoFabricacao || data.anoModelo}`;
                    if (data.anoModelo && data.anoFabricacao && data.anoModelo !== data.anoFabricacao) {
                        modelo += `/${data.anoModelo}`;
                    }
                }
                if (data.cor) {
                    modelo += ` - ${data.cor}`;
                }
                setMarcaModelo(modelo);
                filled.push('Marca/Modelo');
            }

            // Try to match client by CPF/CNPJ
            if (data.cpfCnpj && !clienteId) {
                const cleanCpf = data.cpfCnpj.replace(/[.\/-]/g, '');
                const matchingClient = clientes.find((c) => {
                    const clientClean = c.cpfCnpj.replace(/[.\/-]/g, '');
                    return clientClean === cleanCpf;
                });
                if (matchingClient) {
                    setClienteId(matchingClient.id);
                    filled.push('Cliente');
                }
            }

            setFieldsFilledFromPdf(filled);

            if (filled.length === 0) {
                setExtractionError('Nenhum campo foi identificado no PDF. Verifique se o documento está legível.');
            }
        } catch (err) {
            console.error('Erro ao extrair dados do PDF:', err);
            setExtractionError('Erro ao processar o PDF. Tente com outro arquivo.');
            setPdfFile(null);
        } finally {
            setExtracting(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!chassi.trim() || !clienteId) {
            showToast('Preencha os campos obrigatórios: Chassi e Cliente', 'error');
            return;
        }

        setSaving(true);

        try {
            setSaveStep('Salvando veículo...');
            const veiculo = await saveVeiculo({
                id: id || undefined,
                placa: placa.trim().toUpperCase(),
                renavam: renavam.trim(),
                chassi: chassi.trim().toUpperCase(),
                marcaModelo: marcaModelo.trim(),
                clienteId,
                observacoes: observacoes.trim() || undefined,
                categoria: categoria.trim() || undefined,
                anoFabricacao: anoFabricacao.trim() || undefined,
                anoModelo: anoModelo.trim() || undefined,
                cor: cor.trim() || undefined,
                combustivel: combustivel.trim() || undefined,
                dataAquisicao: dataAquisicao.trim() || undefined,
                hodometro: hodometro.trim() || undefined,
            });

            if (pdfFile && !isEditing) {
                setSaveStep('Enviando PDF...');
                try {
                    const fileName = `Cadastro_${placa.trim() || chassi.trim()}.pdf`;
                    const path = `veiculos/${veiculo.id}/${fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
                    const publicUrl = await uploadFileToSupabase(pdfFile, path);
                    await saveVeiculo({
                        ...veiculo,
                        pastaSupabasePath: publicUrl,
                        cadastroDriveId: publicUrl,
                    });
                } catch (err) {
                    console.error('Erro ao enviar PDF:', err);
                }
            }

            if (pdfFile && criarOS && !isEditing) {
                setSaveStep('Criando Ordem de Serviço...');
                const tipoCliente: TipoCliente = selectedCliente?.tipo || 'PF';
                const checklist = await gerarChecklistDinamico(tipoServico, tipoCliente);

                const os = await saveOrdem({
                    clienteId,
                    veiculoId: veiculo.id,
                    tipoServico,
                    trocaPlaca,
                    checklist,
                    status: 'aguardando_documentacao',
                });

                setSaving(false);
                navigate(`/ordens/${os.id}`);
                return;
            }

            setSaving(false);
            navigate('/veiculos');
        } catch (err) {
            console.error('Erro ao salvar:', err);
            setSaving(false);
            showToast('Ocorreu um erro ao salvar. O veículo pode ter sido salvo parcialmente.', 'error');
            navigate('/veiculos');
        }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        e.target.style.borderColor = 'var(--notion-blue)';
        e.target.style.boxShadow = '0 0 0 3px rgba(0,117,222,0.12)';
    };
    const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        e.target.style.borderColor = 'var(--notion-border)';
        e.target.style.boxShadow = 'none';
    };

    return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 4px' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginBottom: 24,
                paddingBottom: 16,
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
                    background: 'rgba(5,150,105,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#059669',
                    flexShrink: 0,
                }}>
                    <Car size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{
                        margin: 0,
                        fontSize: '1.4rem',
                        fontWeight: 800,
                        color: 'var(--notion-text)',
                        letterSpacing: '-0.02em',
                    }}>
                        {isEditing ? 'Editar Veículo' : 'Novo Veículo'}
                    </h1>
                    <p style={{
                        margin: '2px 0 0',
                        fontSize: '0.85rem',
                        color: 'var(--notion-text-secondary)',
                    }}>
                        {isEditing ? 'Atualize os dados cadastrais do veículo' : 'Preencha os dados para cadastrar um novo veículo'}
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                {/* ───── PDF Upload (só para novo) ───── */}
                {!isEditing && (
                    <div style={{
                        ...sectionCard,
                        background: pdfFile ? 'rgba(5,150,105,0.04)' : 'rgba(0,117,222,0.04)',
                        border: pdfFile ? '2px dashed #059669' : '2px dashed var(--notion-blue)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                            <div style={{
                                width: 52,
                                height: 52,
                                borderRadius: 12,
                                background: pdfFile ? 'rgba(5,150,105,0.15)' : 'rgba(0,117,222,0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: pdfFile ? '#059669' : 'var(--notion-blue)',
                                flexShrink: 0,
                            }}>
                                <FileText size={26} />
                            </div>
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <h3 style={{
                                    margin: 0,
                                    fontSize: '0.95rem',
                                    fontWeight: 700,
                                    color: pdfFile ? '#059669' : 'var(--notion-text)',
                                }}>
                                    {pdfFile ? pdfFile.name : 'Importar dados de PDF'}
                                </h3>
                                <p style={{
                                    margin: '2px 0 0',
                                    fontSize: '0.82rem',
                                    color: 'var(--notion-text-secondary)',
                                }}>
                                    {pdfFile
                                        ? 'PDF pronto — será enviado ao salvar e pode criar a OS automaticamente.'
                                        : 'Envie a folha de cadastro para preencher os campos automaticamente.'
                                    }
                                </p>
                            </div>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="application/pdf"
                                style={{ display: 'none' }}
                                onChange={handlePdfUpload}
                            />
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                disabled={extracting}
                                style={{
                                    padding: '10px 16px',
                                    background: pdfFile ? 'var(--notion-surface)' : 'var(--notion-blue)',
                                    color: pdfFile ? 'var(--notion-text)' : '#fff',
                                    border: pdfFile ? '1px solid var(--notion-border)' : 'none',
                                    borderRadius: 8,
                                    cursor: extracting ? 'not-allowed' : 'pointer',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    fontFamily: 'inherit',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    flexShrink: 0,
                                }}
                            >
                                {extracting ? (
                                    <><Loader2 size={14} className="spin" /> Analisando...</>
                                ) : (
                                    <><Upload size={14} /> {pdfFile ? 'Trocar' : 'Selecionar'}</>
                                )}
                            </button>
                        </div>

                        {fieldsFilledFromPdf.length > 0 && (
                            <div style={{
                                marginTop: 12,
                                padding: '8px 12px',
                                background: 'rgba(5,150,105,0.08)',
                                border: '1px solid rgba(5,150,105,0.2)',
                                borderRadius: 8,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.82rem',
                                color: '#059669',
                                fontWeight: 600,
                            }}>
                                <CheckCircle size={14} /> Campos preenchidos: {fieldsFilledFromPdf.join(', ')}
                            </div>
                        )}

                        {extractionError && (
                            <div style={{
                                marginTop: 12,
                                padding: '8px 12px',
                                background: 'rgba(221,91,0,0.08)',
                                border: '1px solid rgba(221,91,0,0.2)',
                                borderRadius: 8,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.82rem',
                                color: 'var(--notion-orange)',
                            }}>
                                <AlertCircle size={14} /> {extractionError}
                            </div>
                        )}

                        {extractionResult && fieldsFilledFromPdf.length > 0 && (
                            <details style={{ marginTop: 10 }}>
                                <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: 'var(--notion-text-secondary)' }}>
                                    Ver todos os dados extraídos
                                </summary>
                                <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--notion-text-secondary)', lineHeight: 1.6 }}>
                                    {extractionResult.placa && <div>Placa: {extractionResult.placa}</div>}
                                    {extractionResult.renavam && <div>Renavam: {extractionResult.renavam}</div>}
                                    {extractionResult.chassi && <div>Chassi: {extractionResult.chassi}</div>}
                                    {extractionResult.marcaModelo && <div>Marca/Modelo: {extractionResult.marcaModelo}</div>}
                                    {extractionResult.anoFabricacao && <div>Ano Fab: {extractionResult.anoFabricacao}</div>}
                                    {extractionResult.anoModelo && <div>Ano Mod: {extractionResult.anoModelo}</div>}
                                    {extractionResult.cor && <div>Cor: {extractionResult.cor}</div>}
                                    {extractionResult.cpfCnpj && <div>CPF/CNPJ: {extractionResult.cpfCnpj}</div>}
                                    {extractionResult.nomeProprietario && <div>Proprietário: {extractionResult.nomeProprietario}</div>}
                                </div>
                            </details>
                        )}
                    </div>
                )}

                {/* ───── Cliente ───── */}
                <div style={sectionCard}>
                    <div style={sectionHeader}>
                        <User size={18} style={{ color: 'var(--notion-blue)' }} />
                        <h2 style={sectionTitle}>Proprietário</h2>
                    </div>
                    <div>
                        <label style={fieldLabel}>
                            Cliente <span style={{ color: 'var(--notion-orange)' }}>*</span>
                            {fieldsFilledFromPdf.includes('Cliente') && <span style={pdfBadge}><CheckCircle size={10} /> do PDF</span>}
                        </label>
                        <select
                            value={clienteId}
                            onChange={(e) => setClienteId(e.target.value)}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                            required
                            style={{ ...fieldInput, appearance: 'auto' as any, WebkitAppearance: 'menulist' as any }}
                        >
                            <option value="">Selecione o cliente...</option>
                            {clientes.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome} ({c.cpfCnpj})
                                </option>
                            ))}
                        </select>
                        {clientes.length === 0 && (
                            <p style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--notion-text-secondary)' }}>
                                Nenhum cliente cadastrado.{' '}
                                <a href="/clientes/novo" style={{ color: 'var(--notion-blue)' }}>Cadastrar cliente primeiro</a>
                            </p>
                        )}
                    </div>
                </div>

                {/* ───── Identificação do Veículo ───── */}
                <div style={sectionCard}>
                    <div style={sectionHeader}>
                        <Hash size={18} style={{ color: 'var(--notion-blue)' }} />
                        <h2 style={sectionTitle}>Identificação</h2>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                            <label style={fieldLabel}>
                                Placa
                                {fieldsFilledFromPdf.includes('Placa') && <span style={pdfBadge}><CheckCircle size={10} /> do PDF</span>}
                            </label>
                            <input
                                type="text"
                                value={placa}
                                onChange={(e) => setPlaca(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                placeholder="Vazio p/ primeiro emplacamento"
                                style={{ ...fieldInput, textTransform: 'uppercase' }}
                            />
                        </div>
                        <div>
                            <label style={fieldLabel}>
                                Chassi <span style={{ color: 'var(--notion-orange)' }}>*</span>
                                {fieldsFilledFromPdf.includes('Chassi') && <span style={pdfBadge}><CheckCircle size={10} /> do PDF</span>}
                            </label>
                            <input
                                type="text"
                                value={chassi}
                                onChange={(e) => setChassi(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                placeholder="9BWHE21JX24060960"
                                required
                                style={{ ...fieldInput, textTransform: 'uppercase', fontFamily: 'monospace' }}
                            />
                        </div>
                        <div>
                            <label style={fieldLabel}>
                                Renavam
                                {fieldsFilledFromPdf.includes('Renavam') && <span style={pdfBadge}><CheckCircle size={10} /> do PDF</span>}
                            </label>
                            <input
                                type="text"
                                value={renavam}
                                onChange={(e) => setRenavam(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                placeholder="00000000000"
                                style={fieldInput}
                            />
                        </div>
                        <div>
                            <label style={fieldLabel}>Categoria</label>
                            <input
                                type="text"
                                value={categoria}
                                onChange={(e) => setCategoria(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                style={fieldInput}
                            />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={fieldLabel}>
                                <Tag size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                                Marca / Modelo
                                {fieldsFilledFromPdf.includes('Marca/Modelo') && <span style={pdfBadge}><CheckCircle size={10} /> do PDF</span>}
                            </label>
                            <input
                                type="text"
                                value={marcaModelo}
                                onChange={(e) => setMarcaModelo(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                placeholder="Ex: VW Gol 1.0"
                                style={fieldInput}
                            />
                        </div>
                        <div>
                            <label style={fieldLabel}>Ano Fabricação</label>
                            <input
                                type="text"
                                value={anoFabricacao}
                                onChange={(e) => setAnoFabricacao(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                style={fieldInput}
                            />
                        </div>
                        <div>
                            <label style={fieldLabel}>Ano Modelo</label>
                            <input
                                type="text"
                                value={anoModelo}
                                onChange={(e) => setAnoModelo(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                style={fieldInput}
                            />
                        </div>
                        <div>
                            <label style={fieldLabel}>Cor</label>
                            <input
                                type="text"
                                value={cor}
                                onChange={(e) => setCor(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                style={fieldInput}
                            />
                        </div>
                        <div>
                            <label style={fieldLabel}>Combustível</label>
                            <input
                                type="text"
                                value={combustivel}
                                onChange={(e) => setCombustivel(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                style={fieldInput}
                            />
                        </div>
                        <div>
                            <label style={fieldLabel}>Data de Aquisição (Recibo)</label>
                            <input
                                type="date"
                                value={dataAquisicao}
                                onChange={(e) => setDataAquisicao(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                style={fieldInput}
                            />
                        </div>
                        <div>
                            <label style={fieldLabel}>Hodômetro</label>
                            <input
                                type="text"
                                value={hodometro}
                                onChange={(e) => setHodometro(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                style={fieldInput}
                            />
                        </div>
                    </div>
                </div>

                {/* ───── Observações ───── */}
                <div style={sectionCard}>
                    <div style={sectionHeader}>
                        <FileText size={18} style={{ color: 'var(--notion-blue)' }} />
                        <h2 style={sectionTitle}>Observações</h2>
                    </div>
                    <textarea
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        placeholder="Anotações sobre o veículo (opcional)…"
                        rows={4}
                        style={{ ...fieldInput, minHeight: 96, resize: 'vertical' }}
                    />
                </div>

                {/* ───── Criação de OS (só com PDF carregado) ───── */}
                {pdfFile && !isEditing && (
                    <div style={{
                        ...sectionCard,
                        background: 'rgba(0,117,222,0.04)',
                        border: '1px solid var(--notion-blue)',
                    }}>
                        <div style={{ ...sectionHeader, borderBottomColor: 'rgba(0,117,222,0.2)' }}>
                            <FolderPlus size={18} style={{ color: 'var(--notion-blue)' }} />
                            <h2 style={{ ...sectionTitle, color: 'var(--notion-blue)' }}>Criar Ordem de Serviço automaticamente</h2>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <button
                                    type="button"
                                    onClick={() => setCriarOS(true)}
                                    style={{
                                        padding: '12px',
                                        borderRadius: 8,
                                        border: criarOS ? '2px solid var(--notion-blue)' : '1px solid var(--notion-border)',
                                        background: criarOS ? 'rgba(0,117,222,0.08)' : 'var(--notion-bg)',
                                        color: criarOS ? 'var(--notion-blue)' : 'var(--notion-text)',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    Sim, criar OS
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCriarOS(false)}
                                    style={{
                                        padding: '12px',
                                        borderRadius: 8,
                                        border: !criarOS ? '2px solid var(--notion-blue)' : '1px solid var(--notion-border)',
                                        background: !criarOS ? 'rgba(0,117,222,0.08)' : 'var(--notion-bg)',
                                        color: !criarOS ? 'var(--notion-blue)' : 'var(--notion-text)',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    Apenas cadastrar veículo
                                </button>
                            </div>
                        </div>

                        {criarOS && (
                            <>
                                <div style={{ marginBottom: 14 }}>
                                    <label style={fieldLabel}>Tipo de Serviço</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {(Object.entries(serviceLabels) as [TipoServico, string][]).map(([key, label]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => {
                                                    setTipoServico(key);
                                                    if (key === 'primeiro_emplacamento') setTrocaPlaca(true);
                                                }}
                                                style={{
                                                    padding: '7px 12px',
                                                    borderRadius: 20,
                                                    border: tipoServico === key ? '2px solid var(--notion-blue)' : '1px solid var(--notion-border)',
                                                    background: tipoServico === key ? 'var(--notion-blue)' : 'var(--notion-bg)',
                                                    color: tipoServico === key ? '#fff' : 'var(--notion-text)',
                                                    cursor: 'pointer',
                                                    fontWeight: 600,
                                                    fontSize: '0.78rem',
                                                    fontFamily: 'inherit',
                                                }}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ marginBottom: 14 }}>
                                    <label style={fieldLabel}>Há troca de placa?</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        <button
                                            type="button"
                                            onClick={() => setTrocaPlaca(false)}
                                            style={{
                                                padding: '10px',
                                                borderRadius: 8,
                                                border: !trocaPlaca ? '2px solid var(--notion-blue)' : '1px solid var(--notion-border)',
                                                background: !trocaPlaca ? 'rgba(0,117,222,0.08)' : 'var(--notion-bg)',
                                                color: !trocaPlaca ? 'var(--notion-blue)' : 'var(--notion-text)',
                                                cursor: 'pointer',
                                                fontWeight: 600,
                                                fontSize: '0.85rem',
                                                fontFamily: 'inherit',
                                            }}
                                        >
                                            Não
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTrocaPlaca(true)}
                                            style={{
                                                padding: '10px',
                                                borderRadius: 8,
                                                border: trocaPlaca ? '2px solid var(--notion-blue)' : '1px solid var(--notion-border)',
                                                background: trocaPlaca ? 'rgba(0,117,222,0.08)' : 'var(--notion-bg)',
                                                color: trocaPlaca ? 'var(--notion-blue)' : 'var(--notion-text)',
                                                cursor: 'pointer',
                                                fontWeight: 600,
                                                fontSize: '0.85rem',
                                                fontFamily: 'inherit',
                                            }}
                                        >
                                            Sim
                                        </button>
                                    </div>
                                </div>

                                {selectedCliente && checklistPreview.length > 0 && (
                                    <div style={{
                                        background: 'var(--notion-bg)',
                                        padding: '12px 14px',
                                        borderRadius: 8,
                                        border: '1px solid var(--notion-border)',
                                    }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--notion-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Checklist que será gerado
                                        </div>
                                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                                            {checklistPreview.map((item) => (
                                                <li key={item.id} style={{ fontSize: '0.82rem', color: 'var(--notion-text)', marginBottom: 2 }}>
                                                    {item.nome}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

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
                            background: saving ? 'var(--notion-text-muted)' : 'var(--notion-blue)',
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
                            minWidth: 200,
                            justifyContent: 'center',
                        }}
                    >
                        {saving ? (
                            <>
                                <Loader2 size={16} className="spin" /> {saveStep || 'Salvando...'}
                            </>
                        ) : (
                            <>
                                <Save size={16} /> {pdfFile && criarOS && !isEditing
                                    ? 'Cadastrar + Criar OS'
                                    : isEditing ? 'Salvar Alterações' : 'Cadastrar Veículo'
                                }
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}

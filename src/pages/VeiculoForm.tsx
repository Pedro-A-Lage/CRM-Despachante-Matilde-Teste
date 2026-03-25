import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Save, ArrowLeft, Upload, FileText, CheckCircle, Loader2, AlertCircle, FolderPlus, FolderOpen } from 'lucide-react';
import { getVeiculo, saveVeiculo, getClientes, getCliente, saveOrdem } from '../lib/storage';
import { gerarChecklist, gerarChecklistAsync } from '../lib/checklistTemplates';
import { TIPO_SERVICO_LABELS } from '../types';
import type { TipoServico, TipoCliente, Cliente } from '../types';
import { extractVehicleData, type DadosExtraidos } from '../lib/pdfParser';
import { uploadFileToSupabase } from '../lib/supabaseStorage';

export default function VeiculoForm() {
    const navigate = useNavigate();
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
    // veiculoDriveId was used for Drive folder link, we drop it or keep for legacy, but hide button

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
                    // veiculo.pastaDriveId left out as we don't show drive button anymore
                }
            }
        })();
    }, [id]);

    const selectedCliente = useMemo(
        () => clientes.find((c) => c.id === clienteId),
        [clientes, clienteId]
    );

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
            alert('Preencha os campos obrigatórios: Chassi e Cliente');
            return;
        }

        setSaving(true);

        try {
            // 1. Save vehicle
            setSaveStep('Salvando veículo...');
            const veiculo = await saveVeiculo({
                id: id || undefined,
                placa: placa.trim().toUpperCase(),
                renavam: renavam.trim(),
                chassi: chassi.trim().toUpperCase(),
                marcaModelo: marcaModelo.trim(),
                clienteId,
                observacoes: observacoes.trim() || undefined,
            });

            // 2a. NEW vehicle: Upload PDF to Supabase
            if (pdfFile && !isEditing) {
                setSaveStep('Enviando PDF para o Supabase...');
                try {
                    const fileName = `Cadastro_${placa.trim() || chassi.trim()}.pdf`;
                    const path = `veiculos/${veiculo.id}/${fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;

                    const publicUrl = await uploadFileToSupabase(pdfFile, path);

                    // Save Supabase URL to the vehicle record
                    await saveVeiculo({
                        ...veiculo,
                        pastaSupabasePath: publicUrl,
                        cadastroDriveId: publicUrl, // keeping for legacy fallback or if it's used elsewhere
                    });
                } catch (err) {
                    console.error('Erro ao enviar PDF para o Supabase:', err);
                }

                // 2b. EDITING vehicle: (No need to rename folder in Supabase as we use IDs in path)
            }

            // 3. Create OS automatically (if using PDF and option enabled)
            if (pdfFile && criarOS && !isEditing) {
                setSaveStep('Criando Ordem de Serviço...');
                const tipoCliente: TipoCliente = selectedCliente?.tipo || 'PF';
                const checklist = await gerarChecklistAsync(tipoServico, tipoCliente);

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
            alert('Ocorreu um erro ao salvar. O veículo pode ter sido salvo parcialmente.');
            navigate('/veiculos');
        }
    };

    return (
        <div>
            <div className="page-header">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="btn btn-ghost">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h2>{isEditing ? 'Editar Veículo' : 'Novo Veículo'}</h2>
                        <p className="page-header-subtitle">
                            {isEditing ? 'Atualize os dados do veículo' : 'Cadastre um novo veículo'}
                        </p>
                    </div>
                </div>
                {/* Drive button removed */}
            </div>

            <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 700 }}>
                {/* PDF Upload Area */}
                {!isEditing && (
                    <div style={{
                        marginBottom: 'var(--space-6)',
                        padding: 'var(--space-5)',
                        background: 'var(--color-primary-50)',
                        borderRadius: 'var(--radius-md)',
                        border: `2px dashed ${pdfFile ? 'var(--color-success)' : 'var(--color-primary-light)'}`,
                        textAlign: 'center',
                    }}>
                        <FileText size={32} style={{ color: pdfFile ? 'var(--color-success)' : 'var(--color-primary)', margin: '0 auto var(--space-3)' }} />
                        <h4 style={{ marginBottom: 'var(--space-2)', color: pdfFile ? 'var(--color-success)' : 'var(--color-primary-dark)' }}>
                            {pdfFile ? `📄 ${pdfFile.name}` : 'Importar dados de PDF'}
                        </h4>
                        <p className="text-sm text-gray" style={{ marginBottom: 'var(--space-4)' }}>
                            {pdfFile
                                ? 'PDF carregado! Será enviado para o sistema e uma OS será criada automaticamente.'
                                : 'Envie a folha de cadastro para preencher os campos e criar a OS automaticamente'
                            }
                        </p>

                        <input
                            ref={fileRef}
                            type="file"
                            accept="application/pdf"
                            style={{ display: 'none' }}
                            onChange={handlePdfUpload}
                        />

                        <button
                            type="button"
                            className={`btn ${pdfFile ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={() => fileRef.current?.click()}
                            disabled={extracting}
                        >
                            {extracting ? (
                                <>
                                    <Loader2 size={16} className="spin" /> Analisando PDF...
                                </>
                            ) : (
                                <>
                                    <Upload size={16} /> {pdfFile ? 'Trocar PDF' : 'Selecionar PDF'}
                                </>
                            )}
                        </button>

                        {/* Extraction result */}
                        {fieldsFilledFromPdf.length > 0 && (
                            <div style={{
                                marginTop: 'var(--space-4)',
                                padding: 'var(--space-3) var(--space-4)',
                                background: 'var(--color-success-light)',
                                borderRadius: 'var(--radius-sm)',
                                textAlign: 'left',
                            }}>
                                <p className="text-sm font-semibold" style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CheckCircle size={16} /> Campos preenchidos: {fieldsFilledFromPdf.join(', ')}
                                </p>
                            </div>
                        )}

                        {extractionError && (
                            <div style={{
                                marginTop: 'var(--space-4)',
                                padding: 'var(--space-3) var(--space-4)',
                                background: 'var(--color-warning-light)',
                                borderRadius: 'var(--radius-sm)',
                                textAlign: 'left',
                            }}>
                                <p className="text-sm" style={{ color: 'var(--color-error-hover)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertCircle size={16} /> {extractionError}
                                </p>
                            </div>
                        )}

                        {/* All extracted data */}
                        {extractionResult && fieldsFilledFromPdf.length > 0 && (
                            <details style={{ marginTop: 'var(--space-3)', textAlign: 'left' }}>
                                <summary className="text-xs text-gray" style={{ cursor: 'pointer' }}>
                                    Ver todos os dados extraídos
                                </summary>
                                <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-600)' }}>
                                    {extractionResult.placa && <p>Placa: {extractionResult.placa}</p>}
                                    {extractionResult.renavam && <p>Renavam: {extractionResult.renavam}</p>}
                                    {extractionResult.chassi && <p>Chassi: {extractionResult.chassi}</p>}
                                    {extractionResult.marcaModelo && <p>Marca/Modelo: {extractionResult.marcaModelo}</p>}
                                    {extractionResult.anoFabricacao && <p>Ano Fab: {extractionResult.anoFabricacao}</p>}
                                    {extractionResult.anoModelo && <p>Ano Mod: {extractionResult.anoModelo}</p>}
                                    {extractionResult.cor && <p>Cor: {extractionResult.cor}</p>}
                                    {extractionResult.cpfCnpj && <p>CPF/CNPJ: {extractionResult.cpfCnpj}</p>}
                                    {extractionResult.nomeProprietario && <p>Proprietário: {extractionResult.nomeProprietario}</p>}
                                </div>
                            </details>
                        )}
                    </div>
                )}

                {/* Cliente */}
                <div className="form-group">
                    <label className="form-label">
                        Cliente *
                        {fieldsFilledFromPdf.includes('Cliente') && (
                            <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-xs)', marginLeft: 8 }}>✓ do PDF</span>
                        )}
                    </label>
                    <select
                        className="form-select"
                        value={clienteId}
                        onChange={(e) => setClienteId(e.target.value)}
                        required
                    >
                        <option value="">Selecione o cliente...</option>
                        {clientes.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.nome} ({c.cpfCnpj})
                            </option>
                        ))}
                    </select>
                    {clientes.length === 0 && (
                        <p className="form-hint">
                            Nenhum cliente cadastrado.{' '}
                            <a href="/clientes/novo" style={{ color: 'var(--color-primary)' }}>Cadastrar cliente primeiro</a>
                        </p>
                    )}
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">
                            Placa
                            {fieldsFilledFromPdf.includes('Placa') && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-xs)', marginLeft: 8 }}>✓ do PDF</span>}
                        </label>
                        <input type="text" className="form-input" value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="ABC1D23" style={{ textTransform: 'uppercase' }} />
                        <p className="form-hint">Pode ficar vazio para primeiro emplacamento</p>
                    </div>
                    <div className="form-group">
                        <label className="form-label">
                            Renavam
                            {fieldsFilledFromPdf.includes('Renavam') && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-xs)', marginLeft: 8 }}>✓ do PDF</span>}
                        </label>
                        <input type="text" className="form-input" value={renavam} onChange={(e) => setRenavam(e.target.value)} placeholder="00000000000" />
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">
                        Chassi *
                        {fieldsFilledFromPdf.includes('Chassi') && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-xs)', marginLeft: 8 }}>✓ do PDF</span>}
                    </label>
                    <input type="text" className="form-input" value={chassi} onChange={(e) => setChassi(e.target.value)} placeholder="9BWHE21JX24060960" required style={{ textTransform: 'uppercase' }} />
                </div>

                <div className="form-group">
                    <label className="form-label">
                        Marca / Modelo
                        {fieldsFilledFromPdf.includes('Marca/Modelo') && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-xs)', marginLeft: 8 }}>✓ do PDF</span>}
                    </label>
                    <input type="text" className="form-input" value={marcaModelo} onChange={(e) => setMarcaModelo(e.target.value)} placeholder="Ex: VW Gol 1.0" />
                </div>

                <div className="form-group">
                    <label className="form-label">Observações</label>
                    <textarea className="form-textarea" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Observações sobre o veículo..." />
                </div>

                {/* ====== OS CREATION SECTION (appears when PDF is loaded) ====== */}
                {pdfFile && !isEditing && (
                    <div style={{
                        marginTop: 'var(--space-4)',
                        padding: 'var(--space-5)',
                        background: 'var(--color-info-light)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-info)',
                    }}>
                        <div className="flex items-center gap-2 mb-4">
                            <FolderPlus size={20} style={{ color: 'var(--color-info)' }} />
                            <h4 style={{ color: 'var(--color-info)' }}>Criar Ordem de Serviço automaticamente</h4>
                        </div>

                        <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
                            <div className="toggle-group">
                                <button type="button" className={`toggle-btn ${criarOS ? 'active' : ''}`} onClick={() => setCriarOS(true)}>
                                    Sim, criar OS
                                </button>
                                <button type="button" className={`toggle-btn ${!criarOS ? 'active' : ''}`} onClick={() => setCriarOS(false)}>
                                    Não, só cadastrar veículo
                                </button>
                            </div>
                        </div>

                        {criarOS && (
                            <>
                                <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
                                    <label className="form-label">Tipo de Serviço *</label>
                                    <div className="toggle-group" style={{ flexWrap: 'wrap' }}>
                                        {(Object.entries(TIPO_SERVICO_LABELS) as [TipoServico, string][]).map(
                                            ([key, label]) => (
                                                <button
                                                    type="button"
                                                    key={key}
                                                    className={`toggle-btn ${tipoServico === key ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setTipoServico(key);
                                                        if (key === 'primeiro_emplacamento') setTrocaPlaca(true);
                                                    }}
                                                >
                                                    {label}
                                                </button>
                                            )
                                        )}
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
                                    <label className="form-label">Há troca de placa?</label>
                                    <div className="toggle-group">
                                        <button type="button" className={`toggle-btn ${!trocaPlaca ? 'active' : ''}`} onClick={() => setTrocaPlaca(false)}>Não</button>
                                        <button type="button" className={`toggle-btn ${trocaPlaca ? 'active' : ''}`} onClick={() => setTrocaPlaca(true)}>Sim</button>
                                    </div>
                                </div>

                                {selectedCliente && (
                                    <div style={{
                                        background: 'rgba(255,255,255,0.7)',
                                        padding: 'var(--space-3)',
                                        borderRadius: 'var(--radius-sm)',
                                    }}>
                                        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>📋 Checklist gerado automaticamente</label>
                                        <ul style={{ paddingLeft: 20 }}>
                                            {gerarChecklist(tipoServico, selectedCliente.tipo).map((item) => (
                                                <li key={item.id} className="text-xs" style={{ marginBottom: 2 }}>{item.nome}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                <div className="form-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
                        Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
                        {saving ? (
                            <>
                                <Loader2 size={16} className="spin" /> {saveStep}
                            </>
                        ) : (
                            <>
                                <Save size={16} /> {pdfFile && criarOS && !isEditing
                                    ? 'Cadastrar Veículo + Criar OS'
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

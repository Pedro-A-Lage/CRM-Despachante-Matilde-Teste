// ============================================
// PrimeiroEmplacamentoModal
// Fluxo: Pré-preenche dados → Revisão → Confirma → Cria Cliente + Veículo + OS
// Veículo NÃO tem placa — primeiro emplacamento, placa sempre ''
// ============================================

import { useState, useEffect } from 'react';
import { Car, User, Building2, MapPin, AlertCircle } from 'lucide-react';
import { saveCliente, saveVeiculo, saveOrdem, addAuditEntry, getClienteByCpfCnpj } from '../lib/database';
import { uploadFileToSupabase } from '../lib/fileStorage';
import { gerarChecklistDinamico } from '../lib/configService';
import { finalizarOS } from '../lib/osService';
import {
    overlayStyle, modalStyle, headerStyle, bodyStyle, footerStyle,
    secaoStyle, secaoHeaderStyle, gridStyle, fieldWrapStyle, labelStyle,
    inputStyle, selectStyle, btnPrimary, btnSecondary, errorBoxStyle, successMsgStyle,
    Field, FieldProps,
    ModalOverlay, ModalContainer, ModalHeader, ModalBody, ModalFooter, Section, SectionGrid,
} from './ModalBase';

// ---- INTERFACE EXPORTADA ----
export interface DadosIniciaisPrimeiroEmplacamento {
    chassi?: string;
    renavam?: string;
    marcaModelo?: string;
    anoFabricacao?: string;
    anoModelo?: string;
    tipoVeiculo?: string;
    nomeAdquirente?: string;
    tipoDocAdquirente?: string;      // raw DOM text e.g. "CPF" or "CNPJ"
    tipoCpfCnpjAdquirente?: 'CPF' | 'CNPJ'; // normalized
    cpfCnpjAdquirente?: string;
    rgAdquirente?: string;
    orgaoExpedidor?: string;
    ufOrgaoExpedidor?: string;
    cepAdquirente?: string;
    logradouroAdquirente?: string;
    numeroAdquirente?: string;
    bairroAdquirente?: string;
    nomeRevendedor?: string;
    cnpjRevendedor?: string;
    municipioEmplacamento?: string;
    modalidadeFinanciamento?: string;
    telefone?: string;
    fileBase64?: string;
    fileName?: string;
    // IDs da OS já criada (modo revisar)
    osId?: string;
    clienteId?: string;
    veiculoId?: string;
}

interface PrimeiroEmplacamentoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (osId: string) => void;
    dadosIniciais?: DadosIniciaisPrimeiroEmplacamento;
    /**
     * 'coletar' = cria OS normalmente (padrão)
     * 'revisar' = OS já criada, modal para conferência/edição
     */
    modo?: 'coletar' | 'revisar';
}

// ---- HELPER: normaliza tipo de documento ----
function normalizeTipoDoc(raw?: string): 'CPF' | 'CNPJ' {
    if (raw && raw.toUpperCase().includes('CNPJ')) return 'CNPJ';
    return 'CPF';
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
export function PrimeiroEmplacamentoModal({
    isOpen, onClose, onSuccess, dadosIniciais, modo = 'coletar',
}: PrimeiroEmplacamentoModalProps) {
    const [etapa, setEtapa] = useState<'form' | 'salvando'>('form');
    const [erro, setErro] = useState('');
    const [osIdState, setOsIdState] = useState('');
    const [clienteIdState, setClienteIdState] = useState('');
    const [veiculoIdState, setVeiculoIdState] = useState('');

    // ---- Veículo ----
    const [chassi, setChassi] = useState('');
    const [renavam, setRenavam] = useState('');
    const [marcaModelo, setMarcaModelo] = useState('');
    const [tipoVeiculo, setTipoVeiculo] = useState('');
    const [anoFabricacao, setAnoFabricacao] = useState('');
    const [anoModelo, setAnoModelo] = useState('');

    // ---- Adquirente ----
    const [tipoCpfCnpj, setTipoCpfCnpj] = useState<'CPF' | 'CNPJ'>('CPF');
    const [cpfCnpj, setCpfCnpj] = useState('');
    const [nome, setNome] = useState('');
    const [telefone, setTelefone] = useState('');
    const [rg, setRg] = useState('');
    const [orgaoExpedidor, setOrgaoExpedidor] = useState('');
    const [ufOrgao, setUfOrgao] = useState('');
    const [cep, setCep] = useState('');
    const [logradouro, setLogradouro] = useState('');
    const [numero, setNumero] = useState('');
    const [bairro, setBairro] = useState('');
    const [clienteEncontradoMsg, setClienteEncontradoMsg] = useState('');

    // ---- Revendedor ----
    const [nomeRevendedor, setNomeRevendedor] = useState('');
    const [cnpjRevendedor, setCnpjRevendedor] = useState('');

    // ---- Emplacamento ----
    const [municipio, setMunicipio] = useState('');
    const [modalidadeFinanciamento, setModalidadeFinanciamento] = useState('');

    // ---- PRÉ-PREENCHIMENTO ----
    useEffect(() => {
        if (dadosIniciais && isOpen) {
            setChassi(dadosIniciais.chassi || '');
            setRenavam(dadosIniciais.renavam || '');
            setMarcaModelo(dadosIniciais.marcaModelo || '');
            setTipoVeiculo(dadosIniciais.tipoVeiculo || '');
            setAnoFabricacao(dadosIniciais.anoFabricacao || '');
            setAnoModelo(dadosIniciais.anoModelo || '');
            setTipoCpfCnpj(
                dadosIniciais.tipoCpfCnpjAdquirente ||
                normalizeTipoDoc(dadosIniciais.tipoDocAdquirente)
            );
            setCpfCnpj(dadosIniciais.cpfCnpjAdquirente || '');
            setNome(dadosIniciais.nomeAdquirente || '');
            setRg(dadosIniciais.rgAdquirente || '');
            setOrgaoExpedidor(dadosIniciais.orgaoExpedidor || '');
            setUfOrgao(dadosIniciais.ufOrgaoExpedidor || '');
            setCep(dadosIniciais.cepAdquirente || '');
            setLogradouro(dadosIniciais.logradouroAdquirente || '');
            setNumero(dadosIniciais.numeroAdquirente || '');
            setBairro(dadosIniciais.bairroAdquirente || '');
            setNomeRevendedor(dadosIniciais.nomeRevendedor || '');
            setCnpjRevendedor(dadosIniciais.cnpjRevendedor || '');
            setMunicipio(dadosIniciais.municipioEmplacamento || '');
            setModalidadeFinanciamento(dadosIniciais.modalidadeFinanciamento || '');
            setClienteEncontradoMsg('');
            setErro('');

            // IDs da OS já criada (modo revisar)
            if (dadosIniciais.osId) setOsIdState(dadosIniciais.osId);
            if (dadosIniciais.clienteId) setClienteIdState(dadosIniciais.clienteId);
            if (dadosIniciais.veiculoId) setVeiculoIdState(dadosIniciais.veiculoId);
            if (dadosIniciais.telefone) setTelefone(dadosIniciais.telefone);

            // Buscar cliente pelo CPF/CNPJ automaticamente (só no modo coletar sem clienteId)
            const cpf = dadosIniciais.cpfCnpjAdquirente?.trim();
            if (cpf && !dadosIniciais.clienteId) {
                getClienteByCpfCnpj(cpf).then(cliente => {
                    if (cliente) {
                        setNome(prev => cliente.nome || prev);
                        setTelefone(prev => prev || (cliente.telefones || [])[0] || '');
                        setClienteEncontradoMsg(`✅ Cliente encontrado: ${cliente.nome}`);
                    }
                }).catch(() => {});
            } else if (dadosIniciais.clienteId && dadosIniciais.nomeAdquirente) {
                setClienteEncontradoMsg(`✅ Cliente: ${dadosIniciais.nomeAdquirente}`);
            }
        }
    }, [dadosIniciais, isOpen]);

    // Limpa estado ao fechar
    useEffect(() => {
        if (!isOpen) {
            setEtapa('form');
            setErro('');
            setClienteEncontradoMsg('');
        }
    }, [isOpen]);

    // ---- LOOKUP DE CPF/CNPJ ----
    const handleCpfBlur = async () => {
        if (!cpfCnpj.trim()) return;
        try {
            const cliente = await getClienteByCpfCnpj(cpfCnpj);
            if (cliente) {
                setNome(cliente.nome || nome);
                setTelefone((cliente.telefones || [])[0] || telefone);
                setClienteEncontradoMsg(`✅ Cliente encontrado: ${cliente.nome}`);
            } else {
                setClienteEncontradoMsg('');
            }
        } catch {
            setClienteEncontradoMsg('');
        }
    };

    // ---- VALIDAÇÃO ----
    const validar = (): string[] => {
        const faltando: string[] = [];
        if (!chassi.trim()) faltando.push('Chassi');
        if (!renavam.trim()) faltando.push('RENAVAM');
        if (!cpfCnpj.trim()) faltando.push('CPF/CNPJ do adquirente');
        if (!telefone.trim()) faltando.push('Telefone do adquirente');
        if (!municipio.trim()) faltando.push('Município de emplacamento');
        return faltando;
    };

    // ---- CAMPOS FALTANDO (modo revisar) ----
    const camposFaltando = (): string[] => {
        const f: string[] = [];
        if (!chassi.trim()) f.push('Chassi');
        if (!renavam.trim()) f.push('RENAVAM');
        if (!cpfCnpj.trim()) f.push('CPF/CNPJ');
        if (!telefone.trim()) f.push('Telefone');
        if (!municipio.trim()) f.push('Município de emplacamento');
        return f;
    };

    // ---- SALVAR ALTERAÇÕES (modo revisar — OS já existe) ----
    const handleSalvarAlteracoes = async () => {
        if (!osIdState) return;
        setErro('');
        const faltando = camposFaltando();
        if (faltando.length > 0) {
            setErro(`Preencha os campos obrigatórios: ${faltando.join(', ')}.`);
            return;
        }
        setEtapa('salvando');
        try {
            // Atualizar cliente
            if (clienteIdState) {
                const cliente = await getClienteByCpfCnpj(cpfCnpj).catch(() => null);
                const { getClientes } = await import('../lib/database');
                const todos = await getClientes();
                const cli = todos.find((c: any) => c.id === clienteIdState);
                if (cli) {
                    const enderecoObs = [logradouro, numero, bairro, cep ? `CEP: ${cep}` : '', municipio]
                        .filter(Boolean).join(', ');
                    await saveCliente({
                        ...cli,
                        nome: nome || cli.nome,
                        cpfCnpj: cpfCnpj || cli.cpfCnpj,
                        telefones: telefone.trim()
                            ? [...new Set([telefone.trim(), ...(cli.telefones || [])])]
                            : cli.telefones || [],
                        observacoes: [
                            cli.observacoes || '',
                            enderecoObs ? `Endereço: ${enderecoObs}` : '',
                        ].filter(Boolean).join(' | '),
                    });
                }
            }

            // Atualizar veículo
            if (veiculoIdState) {
                await saveVeiculo({
                    id: veiculoIdState,
                    placa: '',
                    renavam,
                    chassi,
                    marcaModelo,
                    clienteId: clienteIdState,
                    observacoes: [
                        tipoVeiculo ? `Tipo: ${tipoVeiculo}` : '',
                        anoFabricacao ? `Ano: ${anoFabricacao}/${anoModelo}` : '',
                    ].filter(Boolean).join(' | '),
                });
            }

            // Atualizar OS com dados de primeiro emplacamento
            const { getOrdem } = await import('../lib/database');
            const os = await getOrdem(osIdState).catch(() => null);
            if (os) {
                await saveOrdem({
                    ...os,
                    primeiroEmplacamento: {
                        ...(os.primeiroEmplacamento || {}),
                        chassi,
                        renavam,
                        marcaModelo,
                        anoFabricacao,
                        anoModelo,
                        tipoVeiculo,
                        nomeAdquirente: nome,
                        cpfCnpjAdquirente: cpfCnpj,
                        rgAdquirente: rg,
                        orgaoExpedidor,
                        ufOrgaoExpedidor: ufOrgao,
                        cepAdquirente: cep,
                        logradouroAdquirente: logradouro,
                        numeroAdquirente: numero,
                        bairroAdquirente: bairro,
                        nomeRevendedor,
                        cnpjRevendedor,
                        municipioEmplacamento: municipio,
                        modalidadeFinanciamento,
                    },
                } as any);
            }

            onSuccess(osIdState);
        } catch (err: any) {
            setErro(`Erro ao salvar: ${err.message || 'Erro desconhecido'}`);
            setEtapa('form');
        }
    };

    // ---- CONFIRMAR ----
    const handleConfirmar = async () => {
        setErro('');
        const faltando = validar();
        if (faltando.length > 0) {
            setErro(`Preencha os campos obrigatórios: ${faltando.join(', ')}.`);
            return;
        }

        setEtapa('salvando');
        try {
            // 1. Buscar ou criar cliente
            let clienteId = '';
            const cpfLimpo = cpfCnpj.replace(/\D/g, '');
            const clienteExistente = await getClienteByCpfCnpj(cpfCnpj).catch(() => null);

            if (clienteExistente) {
                clienteId = clienteExistente.id;
            } else {
                const enderecoObs = [logradouro, numero, bairro, cep ? `CEP: ${cep}` : '', municipio]
                    .filter(Boolean).join(', ');
                const novoCliente = await saveCliente({
                    tipo: cpfLimpo.length <= 11 ? 'PF' : 'PJ',
                    nome,
                    cpfCnpj,
                    telefones: telefone.trim() ? [telefone.trim()] : [],
                    email: '',
                    observacoes: `Cadastrado via Primeiro Emplacamento${enderecoObs ? ` | Endereço: ${enderecoObs}` : ''}`,
                    documentos: [],
                });
                clienteId = novoCliente.id;
            }

            // 2. Criar veículo — SEM placa (primeiro emplacamento)
            const veiculo = await saveVeiculo({
                placa: '',
                renavam,
                chassi,
                marcaModelo,
                clienteId,
                observacoes: [
                    tipoVeiculo ? `Tipo: ${tipoVeiculo}` : '',
                    anoFabricacao ? `Ano: ${anoFabricacao}/${anoModelo}` : '',
                ].filter(Boolean).join(' | '),
                dataAquisicao: '',
                dataEmissaoCRV: '',
            });

            // 3. Gerar checklist
            const checklist = await gerarChecklistDinamico('primeiro_emplacamento', tipoCpfCnpj === 'CPF' ? 'PF' : 'PJ');

            // 4. Criar OS
            const dadosPE = {
                chassi,
                renavam,
                marcaModelo,
                anoFabricacao,
                anoModelo,
                tipoVeiculo,
                nomeAdquirente: nome,
                cpfCnpjAdquirente: cpfCnpj,
                rgAdquirente: rg,
                orgaoExpedidor,
                ufOrgaoExpedidor: ufOrgao,
                cepAdquirente: cep,
                logradouroAdquirente: logradouro,
                numeroAdquirente: numero,
                bairroAdquirente: bairro,
                nomeRevendedor,
                cnpjRevendedor,
                municipioEmplacamento: municipio,
                modalidadeFinanciamento,
            } as Record<string, string>;

            const novaOS = await saveOrdem({
                clienteId,
                veiculoId: veiculo.id,
                tipoServico: 'primeiro_emplacamento',
                trocaPlaca: true,
                status: 'aguardando_documentacao',
                checklist,
                primeiroEmplacamento: dadosPE,
            } as any);

            await addAuditEntry(novaOS.id, 'criou', 'OS de Primeiro Emplacamento criada');

            // Gerar preço e cobranças automáticas
            try {
                const tv = (tipoVeiculo === 'motocicleta' ? 'moto' : 'carro') as import('../types/finance').TipoVeiculo;
                await finalizarOS(novaOS.id, 'primeiro_emplacamento', tv, true);
            } catch (err) {
                console.warn('Cobranças automáticas não geradas:', err);
            }

            // 5. Notifica extensão com osId para que, quando o PDF da pág 4 chegar, saiba onde salvar
            window.postMessage({
                source: 'MATILDE_CRM',
                action: 'DEFINIR_OS_PRIMEIRO_EMPLACAMENTO',
                payload: { osId: novaOS.id },
            }, '*');

            onSuccess(novaOS.id);
        } catch (err: any) {
            setErro(`Erro ao salvar: ${err.message || 'Erro desconhecido'}`);
            setEtapa('form');
        }
    };

    if (!isOpen) return null;

    return (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={modalStyle}>
                {/* HEADER */}
                <div style={headerStyle}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-text-primary, #111)' }}>
                            🚗 Primeiro Emplacamento
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary, #6b7280)', marginTop: 2 }}>
                            Novo veículo — sem placa anterior
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={etapa === 'salvando'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--color-text-secondary, #6b7280)', lineHeight: 1 }}
                        aria-label="Fechar"
                    >
                        ✕
                    </button>
                </div>

                {/* BODY */}
                <div style={bodyStyle}>
                    {erro && (
                        <div style={errorBoxStyle}>
                            <strong>Atenção:</strong> {erro}
                        </div>
                    )}

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

                    {/* SEÇÃO: VEÍCULO */}
                    <div style={secaoStyle}>
                        <div style={secaoHeaderStyle}><Car size={14} /> Dados do Veículo</div>
                        <div style={gridStyle}>
                            <Field label="Chassi" obrigatorio>
                                <input
                                    style={{ ...inputStyle, ...(modo === 'revisar' && !chassi.trim() ? { borderColor: 'var(--color-warning, #d97706)', background: '#fffbeb' } : {}) }}
                                    value={chassi} onChange={e => setChassi(e.target.value)} placeholder="Ex: 9BWZZZ377VT004251"
                                />
                            </Field>
                            <Field label="RENAVAM" obrigatorio>
                                <input
                                    style={{ ...inputStyle, ...(modo === 'revisar' && !renavam.trim() ? { borderColor: 'var(--color-warning, #d97706)', background: '#fffbeb' } : {}) }}
                                    value={renavam} onChange={e => setRenavam(e.target.value)} placeholder="Ex: 01234567890"
                                />
                            </Field>
                            <Field label="Marca / Modelo" value={marcaModelo} onChange={setMarcaModelo} placeholder="Ex: Fiat Pulse" span />
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Tipo de Veículo</label>
                                <select
                                    style={selectStyle}
                                    value={tipoVeiculo}
                                    onChange={e => setTipoVeiculo(e.target.value)}
                                >
                                    <option value="">Selecione...</option>
                                    <option value="automovel">Automóvel</option>
                                    <option value="motocicleta">Motocicleta</option>
                                    <option value="camionete">Camionete</option>
                                    <option value="utilitario">Utilitário</option>
                                    <option value="caminhao">Caminhão</option>
                                    <option value="onibus">Ônibus</option>
                                    <option value="outro">Outro</option>
                                </select>
                            </div>
                            <Field label="Ano Fabricação" value={anoFabricacao} onChange={setAnoFabricacao} placeholder="Ex: 2024" />
                            <Field label="Ano Modelo" value={anoModelo} onChange={setAnoModelo} placeholder="Ex: 2025" />
                        </div>
                    </div>

                    {/* SEÇÃO: ADQUIRENTE */}
                    <div style={secaoStyle}>
                        <div style={secaoHeaderStyle}><User size={14} /> Adquirente</div>
                        <div style={gridStyle}>
                            {/* Tipo de documento */}
                            <div style={fieldWrapStyle}>
                                <label style={labelStyle}>Tipo de Documento</label>
                                <select
                                    style={selectStyle}
                                    value={tipoCpfCnpj}
                                    onChange={e => setTipoCpfCnpj(e.target.value as 'CPF' | 'CNPJ')}
                                >
                                    <option value="CPF">CPF (Pessoa Física)</option>
                                    <option value="CNPJ">CNPJ (Pessoa Jurídica)</option>
                                </select>
                            </div>
                            <div style={fieldWrapStyle}>
                                <label style={{ ...labelStyle, ...(modo === 'revisar' && !cpfCnpj.trim() ? { color: 'var(--color-warning, #d97706)' } : {}) }}>CPF/CNPJ *</label>
                                <input
                                    style={{ ...inputStyle, ...(modo === 'revisar' && !cpfCnpj.trim() ? { borderColor: 'var(--color-warning, #d97706)', background: '#fffbeb' } : {}) }}
                                    value={cpfCnpj}
                                    onChange={e => { setCpfCnpj(e.target.value); setClienteEncontradoMsg(''); }}
                                    onBlur={handleCpfBlur}
                                    placeholder={tipoCpfCnpj === 'CPF' ? '000.000.000-00' : '00.000.000/0001-00'}
                                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)')}
                                />
                                {clienteEncontradoMsg && (
                                    <span style={successMsgStyle}>{clienteEncontradoMsg}</span>
                                )}
                            </div>
                            <Field label="Nome completo" value={nome} onChange={setNome} placeholder="Nome do adquirente" span />
                            <Field label="Telefone" obrigatorio>
                                <input
                                    style={{ ...inputStyle, ...(!telefone.trim() ? { borderColor: 'var(--color-warning, #d97706)', background: '#fffbeb' } : {}) }}
                                    value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 00000-0000 — obrigatório"
                                />
                            </Field>
                            <Field label="RG" value={rg} onChange={setRg} placeholder="Número do RG" />
                            <Field label="Órgão Expedidor" value={orgaoExpedidor} onChange={setOrgaoExpedidor} placeholder="Ex: SSP" />
                            <Field label="UF Órgão" value={ufOrgao} onChange={setUfOrgao} placeholder="Ex: SP" />
                            <Field label="CEP" value={cep} onChange={setCep} placeholder="00000-000" />
                            <Field label="Logradouro" value={logradouro} onChange={setLogradouro} placeholder="Rua, Av..." span />
                            <Field label="Número" value={numero} onChange={setNumero} placeholder="Ex: 123" />
                            <Field label="Bairro" value={bairro} onChange={setBairro} placeholder="Bairro" />
                        </div>
                    </div>

                    {/* SEÇÃO: REVENDEDOR */}
                    <div style={secaoStyle}>
                        <div style={secaoHeaderStyle}><Building2 size={14} /> Revendedor</div>
                        <div style={gridStyle}>
                            <Field label="Nome / Razão Social" value={nomeRevendedor} onChange={setNomeRevendedor} placeholder="Nome da concessionária" span />
                            <Field label="CNPJ" value={cnpjRevendedor} onChange={setCnpjRevendedor} placeholder="00.000.000/0001-00" />
                        </div>
                    </div>

                    {/* SEÇÃO: EMPLACAMENTO */}
                    <div style={secaoStyle}>
                        <div style={secaoHeaderStyle}><MapPin size={14} /> Emplacamento</div>
                        <div style={gridStyle}>
                            <Field label="Município de Emplacamento" obrigatorio>
                                <input
                                    style={{ ...inputStyle, ...(modo === 'revisar' && !municipio.trim() ? { borderColor: 'var(--color-warning, #d97706)', background: '#fffbeb' } : {}) }}
                                    value={municipio} onChange={e => setMunicipio(e.target.value)} placeholder="Ex: São Paulo"
                                />
                            </Field>
                            <Field label="Modalidade de Financiamento" value={modalidadeFinanciamento} onChange={setModalidadeFinanciamento} placeholder="Ex: CDC, Leasing..." />
                        </div>
                    </div>
                </div>

                {/* FOOTER */}
                <div style={footerStyle}>
                    <button style={btnSecondary} onClick={onClose} disabled={etapa === 'salvando'}>
                        {modo === 'revisar' ? 'Fechar' : 'Cancelar'}
                    </button>
                    <button
                        style={etapa === 'salvando' ? { ...btnPrimary, opacity: 0.7, cursor: 'not-allowed' } : btnPrimary}
                        onClick={modo === 'revisar' ? handleSalvarAlteracoes : handleConfirmar}
                        disabled={etapa === 'salvando'}
                    >
                        {etapa === 'salvando'
                            ? (modo === 'revisar' ? '⏳ Salvando alterações...' : '⏳ Salvando...')
                            : (modo === 'revisar' ? 'Salvar Alterações' : '✅ Confirmar e Criar OS')}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default PrimeiroEmplacamentoModal;

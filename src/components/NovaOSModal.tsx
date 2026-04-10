// src/components/NovaOSModal.tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Camera, Edit3, Loader, CheckCircle } from 'lucide-react';
import {
  overlayStyle, modalStyle, headerStyle, bodyStyle, footerStyle,
  btnPrimary, btnSecondary,
  inputStyle, selectStyle, labelStyle, fieldWrapStyle, secaoStyle, secaoHeaderStyle,
} from './ModalBase';
import { useServiceLabels } from '../hooks/useServiceLabels';
import type { DadosIniciaisOS } from '../hooks/useNovaOSModal';
import { extrairDadosFichaCadastro, type DadosFichaCadastro } from '../lib/fichaCadastroAI';
import { getClientes, saveCliente, saveVeiculo, saveOrdem, updateOrdem, generateId } from '../lib/database';
import { gerarChecklistDinamico, getServiceConfig } from '../lib/configService';
import { finalizarOS } from '../lib/osService';
import { useNavigate } from 'react-router-dom';
import type { Cliente } from '../types';

type Etapa = 'upload' | 'analisando' | 'revisao' | 'salvando' | 'sucesso';

interface NovaOSModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (osId: string) => void;
  /** Quando fornecido, pula para etapa de revisão com dados pré-preenchidos */
  dadosIniciais?: DadosIniciaisOS;
}

export default function NovaOSModal({ isOpen, onClose, onCreated, dadosIniciais }: NovaOSModalProps) {
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState<Etapa>(() =>
    dadosIniciais ? 'revisao' : 'upload'
  );
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');
  const [dadosForm, setDadosForm] = useState<DadosIniciaisOS>(dadosIniciais ?? {});
  const [clienteExistente, setClienteExistente] = useState<Cliente | undefined>();
  const [osIdCriada, setOsIdCriada] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function salvarOS() {
    setEtapa('salvando');
    try {
      // 1. Resolver ou criar cliente
      let clienteId = clienteExistente?.id;
      if (!clienteId) {
        const novoCliente = {
          tipo: (dadosForm.tipoCpfCnpj === 'CNPJ' ? 'PJ' : 'PF') as 'PF' | 'PJ',
          nome: dadosForm.nomeCliente!,
          cpfCnpj: dadosForm.cpfCnpj!,
          telefones: dadosForm.telefone ? [dadosForm.telefone] : [],
          documentos: [] as Cliente['documentos'],
          rg: dadosForm.rg,
          orgaoExpedidor: dadosForm.orgaoExpedidor,
          ufDocumento: dadosForm.ufDocumento,
          endereco: dadosForm.endereco,
          numero: dadosForm.numero,
          complemento: dadosForm.complemento,
          cep: dadosForm.cep,
          bairro: dadosForm.bairro,
          municipio: dadosForm.municipio,
          uf: dadosForm.uf,
        };
        const clienteSalvo = await saveCliente(novoCliente);
        clienteId = clienteSalvo.id;
      } else {
        await saveCliente({
          ...clienteExistente!,
          nome: dadosForm.nomeCliente || clienteExistente!.nome,
          telefones: dadosForm.telefone
            ? [dadosForm.telefone, ...clienteExistente!.telefones.filter(t => t !== dadosForm.telefone)]
            : clienteExistente!.telefones,
          rg: dadosForm.rg || clienteExistente!.rg,
          orgaoExpedidor: dadosForm.orgaoExpedidor || clienteExistente!.orgaoExpedidor,
          ufDocumento: dadosForm.ufDocumento || clienteExistente!.ufDocumento,
          endereco: dadosForm.endereco || clienteExistente!.endereco,
          numero: dadosForm.numero || clienteExistente!.numero,
          cep: dadosForm.cep || clienteExistente!.cep,
          bairro: dadosForm.bairro || clienteExistente!.bairro,
          municipio: dadosForm.municipio || clienteExistente!.municipio,
          uf: dadosForm.uf || clienteExistente!.uf,
        });
      }

      // 2. Criar veículo
      const veiculo = await saveVeiculo({
        clienteId: clienteId,
        placa: dadosForm.placa || '',
        chassi: dadosForm.chassi || '',
        renavam: dadosForm.renavam || '',
        marcaModelo: dadosForm.marcaModelo || '',
        anoFabricacao: dadosForm.anoFabricacao,
        anoModelo: dadosForm.anoModelo,
        cor: dadosForm.cor,
        combustivel: dadosForm.combustivel,
        categoria: dadosForm.categoria,
        dataAquisicao: dadosForm.dataAquisicao,
      });

      // 3. Gerar checklist
      const tipoCliente = (dadosForm.tipoCpfCnpj === 'CNPJ' ? 'PJ' : 'PF') as 'PF' | 'PJ';
      const checklist = await gerarChecklistDinamico(dadosForm.tipoServico!, tipoCliente);

      // 4. Criar OS
      const ordem = await saveOrdem({
        clienteId: clienteId,
        veiculoId: veiculo.id,
        tipoServico: dadosForm.tipoServico!,
        tipoVeiculo: dadosForm.tipoVeiculo || 'carro',
        trocaPlaca: false,
        status: 'aguardando_documentacao',
        checklist,
      });

      // 5. Upload do PDF (arquivo local OU base64 vindo da extensão)
      let arquivoParaUpload: File | null = arquivo;
      if (!arquivoParaUpload && dadosForm.fileBase64) {
        try {
          const sepIdx = dadosForm.fileBase64.indexOf(',');
          const head = sepIdx >= 0 ? dadosForm.fileBase64.slice(0, sepIdx) : '';
          const b64 = sepIdx >= 0 ? dadosForm.fileBase64.slice(sepIdx + 1) : dadosForm.fileBase64;
          const mimeMatch = head.match(/:(.*?);/);
          const mime = mimeMatch && mimeMatch[1] ? mimeMatch[1] : 'application/pdf';
          const bstr = atob(b64);
          const u8arr = new Uint8Array(bstr.length);
          for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
          arquivoParaUpload = new File([u8arr], dadosForm.fileName || `ficha_${Date.now()}.pdf`, { type: mime });
        } catch (e) {
          console.warn('Erro ao converter fileBase64 para File:', e);
        }
      }
      if (arquivoParaUpload) {
        try {
          const { uploadFileToSupabase } = await import('../lib/fileStorage');
          const path = `ordens/${ordem.id}/pdf_detran_${Date.now()}.pdf`;
          const pdfDetranUrl = await uploadFileToSupabase(arquivoParaUpload, path);
          await updateOrdem(ordem.id, { pdfDetranUrl, pdfDetranName: arquivoParaUpload.name });
        } catch (uploadErr) {
          console.warn('Upload do PDF não bloqueante:', uploadErr);
        }
      }

      // 6. Finalizar OS (gerar cobranças e valorServico)
      // trocaPlaca é derivado do service_config (gera_placa='sempre' → true)
      try {
        const svcConfig = await getServiceConfig(dadosForm.tipoServico!);
        const trocaPlaca = svcConfig?.gera_placa === 'sempre';
        await finalizarOS(ordem.id, dadosForm.tipoServico!, dadosForm.tipoVeiculo as any || 'carro', trocaPlaca);
      } catch (finErr) {
        console.warn('finalizarOS falhou (não bloqueante):', finErr);
      }

      setOsIdCriada(ordem.id);
      onCreated?.(ordem.id);
      setEtapa('sucesso');
    } catch (err: any) {
      setErro(err?.message || 'Erro ao salvar OS');
      setEtapa('revisao');
    }
  }

  // Reset ao abrir
  const handleClose = useCallback(() => {
    setEtapa(dadosIniciais ? 'revisao' : 'upload');
    setArquivo(null);
    setErro('');
    onClose();
  }, [dadosIniciais, onClose]);

  if (!isOpen) return null;

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div style={{ ...modalStyle, maxWidth: 680, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Nova Ordem de Serviço</span>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--notion-text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ ...bodyStyle, flex: 1, overflowY: 'auto' }}>
          {etapa === 'upload' && (
            <EtapaUpload
              onArquivoSelecionado={(file) => { setArquivo(file); setEtapa('analisando'); }}
              onManual={() => setEtapa('revisao')}
              erro={erro}
              fileInputRef={fileInputRef}
              cameraInputRef={cameraInputRef}
            />
          )}
          {etapa === 'analisando' && (
            <EtapaAnalisando
              arquivo={arquivo}
              dadosIniciaisExtensao={dadosIniciais}
              onConcluido={(dados, cliente) => {
                setDadosForm(dados);
                setClienteExistente(cliente);
                setEtapa('revisao');
              }}
              onErro={(msg) => { setErro(msg); setEtapa('upload'); }}
            />
          )}
          {etapa === 'revisao' && (
            <EtapaRevisao
              dados={dadosForm}
              onChange={setDadosForm}
              clienteExistente={clienteExistente}
              onClienteEncontrado={setClienteExistente}
              onVoltar={() => setEtapa('upload')}
              onConfirmar={salvarOS}
            />
          )}
          {etapa === 'salvando' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '3rem' }}>
              <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: 'var(--notion-blue)' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>Criando OS...</p>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {etapa === 'sucesso' && (
            <EtapaSucesso
              osId={osIdCriada}
              onVerOS={() => { handleClose(); navigate(`/ordens/${osIdCriada}`); }}
              onFechar={handleClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Etapa 1: Upload / Câmera ───────────────────────────────
interface EtapaUploadProps {
  onArquivoSelecionado: (file: File) => void;
  onManual: () => void;
  erro: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  cameraInputRef: React.RefObject<HTMLInputElement>;
}

function EtapaUpload({ onArquivoSelecionado, onManual, erro, fileInputRef, cameraInputRef }: EtapaUploadProps) {
  const [arrastando, setArrastando] = useState(false);

  const handleFile = (file: File) => {
    if (!file) return;
    onArquivoSelecionado(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '1.5rem' }}>
      <p style={{ margin: 0, color: 'var(--notion-text-secondary)', textAlign: 'center' }}>
        Envie a folha de cadastro do Detran para preencher automaticamente
      </p>

      {/* Zona de drop */}
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        style={{
          border: `2px dashed ${arrastando ? 'var(--notion-blue)' : 'var(--notion-border)'}`,
          borderRadius: 12,
          padding: '2.5rem',
          textAlign: 'center',
          background: arrastando ? 'var(--notion-blue)' : 'transparent',
          transition: 'all 0.2s',
          cursor: 'pointer',
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={40} style={{ color: 'var(--notion-text-secondary)', marginBottom: 12 }} />
        <p style={{ margin: 0, fontWeight: 600 }}>Arraste o PDF ou clique para selecionar</p>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--notion-text-secondary)' }}>PDF ou imagem</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {/* Botão câmera */}
      <button
        style={{ ...btnSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        onClick={() => cameraInputRef.current?.click()}
      >
        <Camera size={18} /> Tirar foto da folha
      </button>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {/* Link preencher manualmente */}
      <button
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--notion-text-secondary)', fontSize: 14, textDecoration: 'underline' }}
        onClick={onManual}
      >
        <Edit3 size={14} style={{ marginRight: 4 }} />
        Preencher manualmente
      </button>

      {erro && (
        <div style={{ background: 'var(--notion-orange)', color: 'var(--notion-orange)', padding: '0.75rem 1rem', borderRadius: 8, fontSize: 14 }}>
          {erro}
        </div>
      )}
    </div>
  );
}

// ─── Etapa 2: Análise IA ────────────────────────────────────
interface EtapaAnalisandoProps {
  arquivo: File | null;
  dadosIniciaisExtensao?: DadosIniciaisOS;
  onConcluido: (dados: DadosIniciaisOS, clienteExistente?: Cliente) => void;
  onErro: (msg: string) => void;
}

function EtapaAnalisando({ arquivo, dadosIniciaisExtensao, onConcluido, onErro }: EtapaAnalisandoProps) {
  const [status, setStatus] = useState('Analisando folha de cadastro...');

  useEffect(() => {
    let cancelled = false;

    async function analisar() {
      try {
        let dadosExtraidos: DadosIniciaisOS = dadosIniciaisExtensao ?? {};

        if (arquivo) {
          setStatus('Lendo folha de cadastro...');
          const resultado: DadosFichaCadastro = await extrairDadosFichaCadastro(arquivo);
          dadosExtraidos = {
            tipoServico: resultado.tipoServico || undefined,
            placa: resultado.placa || undefined,
            chassi: resultado.chassi || undefined,
            renavam: resultado.renavam || undefined,
            marcaModelo: resultado.marcaModelo || undefined,
            anoFabricacao: resultado.anoFabricacao || undefined,
            anoModelo: resultado.anoModelo || undefined,
            cor: resultado.cor || undefined,
            combustivel: resultado.combustivel || undefined,
            categoria: resultado.categoria || undefined,
            dataAquisicao: resultado.dataAquisicao || undefined,
            tipoVeiculo: resultado.tipoVeiculo as 'carro' | 'moto' || undefined,
            nomeCliente: resultado.proprietario?.nome || undefined,
            cpfCnpj: resultado.proprietario?.cpfCnpj || undefined,
            tipoCpfCnpj: resultado.proprietario?.tipoCpfCnpj || 'CPF',
            rg: resultado.proprietario?.docIdentidade || undefined,
            orgaoExpedidor: resultado.proprietario?.orgaoExpedidor || undefined,
            ufDocumento: resultado.proprietario?.ufOrgaoExpedidor || undefined,
            endereco: resultado.proprietario?.endereco || undefined,
            numero: resultado.proprietario?.numero || undefined,
            bairro: resultado.proprietario?.bairro || undefined,
            municipio: resultado.proprietario?.municipio || undefined,
            uf: resultado.proprietario?.uf || undefined,
            cep: resultado.proprietario?.cep || undefined,
          };
        }

        // Busca CPF no banco
        let clienteExistente: Cliente | undefined;
        if (dadosExtraidos.cpfCnpj) {
          setStatus('Buscando cliente no banco...');
          const clientes = await getClientes();
          const cpfNorm = dadosExtraidos.cpfCnpj.replace(/\D/g, '');
          clienteExistente = clientes.find(c =>
            c.cpfCnpj.replace(/\D/g, '') === cpfNorm
          );
          // Mescla dados do banco com dados da IA (IA não é sobrescrita pelo banco)
          if (clienteExistente) {
            dadosExtraidos = {
              nomeCliente: dadosExtraidos.nomeCliente || clienteExistente.nome,
              telefone: dadosExtraidos.telefone || clienteExistente.telefones?.[0],
              endereco: dadosExtraidos.endereco || clienteExistente.endereco,
              cep: dadosExtraidos.cep || clienteExistente.cep,
              bairro: dadosExtraidos.bairro || clienteExistente.bairro,
              municipio: dadosExtraidos.municipio || clienteExistente.municipio,
              uf: dadosExtraidos.uf || clienteExistente.uf,
              ...dadosExtraidos,
            };
          }
        }

        if (!cancelled) onConcluido(dadosExtraidos, clienteExistente);
      } catch (err: any) {
        if (!cancelled) onErro(err?.message || 'Erro ao analisar o arquivo');
      }
    }

    analisar();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '3rem' }}>
      <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: 'var(--notion-blue)' }} />
      <p style={{ margin: 0, fontWeight: 600 }}>{status}</p>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Etapa 3: Revisão ───────────────────────────────────────
interface EtapaRevisaoProps {
  dados: DadosIniciaisOS;
  onChange: (dados: DadosIniciaisOS) => void;
  clienteExistente?: Cliente;
  onClienteEncontrado: (cliente: Cliente | undefined) => void;
  onVoltar: () => void;
  onConfirmar: () => void;
}

function EtapaRevisao({ dados, onChange, clienteExistente, onClienteEncontrado, onVoltar, onConfirmar }: EtapaRevisaoProps) {
  const serviceLabels = useServiceLabels();
  const set = (key: keyof DadosIniciaisOS) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...dados, [key]: e.target.value });

  // Busca cliente no banco quando CPF/CNPJ é editado (onBlur)
  const buscarClientePorCpfCnpj = async () => {
    const cpfNorm = (dados.cpfCnpj || '').replace(/\D/g, '');
    if (cpfNorm.length < 11) {
      onClienteEncontrado(undefined);
      return;
    }
    try {
      const clientes = await getClientes();
      const encontrado = clientes.find(c => c.cpfCnpj.replace(/\D/g, '') === cpfNorm);
      if (encontrado) {
        onClienteEncontrado(encontrado);
        // Auto-preenche apenas campos vazios (não sobrescreve o que o usuário digitou)
        onChange({
          ...dados,
          nomeCliente: dados.nomeCliente || encontrado.nome,
          tipoCpfCnpj: dados.tipoCpfCnpj || (cpfNorm.length > 11 ? 'CNPJ' : 'CPF'),
          rg: dados.rg || encontrado.rg,
          orgaoExpedidor: dados.orgaoExpedidor || encontrado.orgaoExpedidor,
          telefone: dados.telefone || encontrado.telefones?.[0],
          endereco: dados.endereco || encontrado.endereco,
          numero: dados.numero || encontrado.numero,
          bairro: dados.bairro || encontrado.bairro,
          municipio: dados.municipio || encontrado.municipio,
          uf: dados.uf || encontrado.uf,
          cep: dados.cep || encontrado.cep,
        });
      } else {
        onClienteEncontrado(undefined);
      }
    } catch (err) {
      console.warn('Erro ao buscar cliente:', err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '1.5rem' }}>

      {/* Seção Serviço */}
      <div style={secaoStyle}>
        <div style={secaoHeaderStyle}>Serviço</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '14px 16px' }}>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Tipo de Serviço *</label>
            <select style={selectStyle} value={dados.tipoServico || ''} onChange={set('tipoServico')}>
              <option value="">Selecione...</option>
              {Object.entries(serviceLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Tipo de Veículo</label>
            <select style={selectStyle} value={dados.tipoVeiculo || 'carro'} onChange={set('tipoVeiculo')}>
              <option value="carro">Carro</option>
              <option value="moto">Moto</option>
            </select>
          </div>
        </div>
      </div>

      {/* Seção Cliente */}
      <div style={secaoStyle}>
        <div style={secaoHeaderStyle}>
          Cliente
          {clienteExistente && (
            <span style={{ marginLeft: 8, fontSize: 12, background: 'rgba(55,114,255,0.1)', color: 'var(--notion-blue)', padding: '2px 8px', borderRadius: 20 }}>
              Cliente existente
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '14px 16px' }}>
          <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Nome *</label>
            <input style={inputStyle} value={dados.nomeCliente || ''} onChange={set('nomeCliente')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>CPF/CNPJ *</label>
            <input style={inputStyle} value={dados.cpfCnpj || ''} onChange={set('cpfCnpj')} onBlur={buscarClientePorCpfCnpj} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Tipo</label>
            <select style={selectStyle} value={dados.tipoCpfCnpj || 'CPF'} onChange={set('tipoCpfCnpj')}>
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
            </select>
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>RG</label>
            <input style={inputStyle} value={dados.rg || ''} onChange={set('rg')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Órgão Expedidor</label>
            <input style={inputStyle} value={dados.orgaoExpedidor || ''} onChange={set('orgaoExpedidor')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Telefone</label>
            <input style={inputStyle} value={dados.telefone || ''} onChange={set('telefone')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>CEP</label>
            <input style={inputStyle} value={dados.cep || ''} onChange={set('cep')} />
          </div>
          <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Endereço</label>
            <input style={inputStyle} value={dados.endereco || ''} onChange={set('endereco')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Número</label>
            <input style={inputStyle} value={dados.numero || ''} onChange={set('numero')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Bairro</label>
            <input style={inputStyle} value={dados.bairro || ''} onChange={set('bairro')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Município</label>
            <input style={inputStyle} value={dados.municipio || ''} onChange={set('municipio')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>UF</label>
            <input style={inputStyle} value={dados.uf || ''} onChange={set('uf')} />
          </div>
        </div>
      </div>

      {/* Seção Veículo */}
      <div style={secaoStyle}>
        <div style={secaoHeaderStyle}>Veículo</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '14px 16px' }}>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Placa</label>
            <input style={inputStyle} value={dados.placa || ''} onChange={set('placa')} placeholder="Deixe vazio p/ primeiro emplacamento" />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Chassi</label>
            <input style={inputStyle} value={dados.chassi || ''} onChange={set('chassi')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Renavam</label>
            <input style={inputStyle} value={dados.renavam || ''} onChange={set('renavam')} />
          </div>
          <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Marca/Modelo</label>
            <input style={inputStyle} value={dados.marcaModelo || ''} onChange={set('marcaModelo')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Ano Fabricação</label>
            <input style={inputStyle} value={dados.anoFabricacao || ''} onChange={set('anoFabricacao')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Ano Modelo</label>
            <input style={inputStyle} value={dados.anoModelo || ''} onChange={set('anoModelo')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Cor</label>
            <input style={inputStyle} value={dados.cor || ''} onChange={set('cor')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Combustível</label>
            <input style={inputStyle} value={dados.combustivel || ''} onChange={set('combustivel')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Data de Aquisição</label>
            <input style={inputStyle} type="date" value={dados.dataAquisicao || ''} onChange={set('dataAquisicao')} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 8 }}>
        <button style={btnSecondary} onClick={onVoltar}>Voltar</button>
        <button
          style={{ ...btnPrimary, opacity: (!dados.tipoServico || !dados.cpfCnpj || !dados.nomeCliente) ? 0.5 : 1 }}
          disabled={!dados.tipoServico || !dados.cpfCnpj || !dados.nomeCliente}
          onClick={onConfirmar}
        >
          Confirmar e Criar OS
        </button>
      </div>
    </div>
  );
}

// ─── Etapa 4: Sucesso ───────────────────────────────────────
function EtapaSucesso({ osId, onVerOS, onFechar }: { osId: string; onVerOS: () => void; onFechar: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '3rem' }}>
      <CheckCircle size={56} style={{ color: 'var(--notion-green)' }} />
      <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>OS criada com sucesso!</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button style={btnSecondary} onClick={onFechar}>Fechar</button>
        <button style={btnPrimary} onClick={onVerOS}>Ver OS</button>
      </div>
    </div>
  );
}

// Suppress unused import warning for footerStyle — used in later tasks
void footerStyle;

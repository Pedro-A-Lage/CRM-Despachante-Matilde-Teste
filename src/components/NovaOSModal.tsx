// src/components/NovaOSModal.tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Camera, Edit3, Loader } from 'lucide-react';
import {
  overlayStyle, modalStyle, headerStyle, bodyStyle, footerStyle,
  btnPrimary, btnSecondary,
} from './ModalBase';
import type { DadosIniciaisOS } from '../hooks/useNovaOSModal';
import { extrairDadosFichaCadastro, type DadosFichaCadastro } from '../lib/fichaCadastroAI';
import { getClientes } from '../lib/database';
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
  const [etapa, setEtapa] = useState<Etapa>(() =>
    dadosIniciais ? 'revisao' : 'upload'
  );
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');
  const [dadosForm, setDadosForm] = useState<DadosIniciaisOS>(dadosIniciais ?? {});
  const [clienteExistente, setClienteExistente] = useState<Cliente | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
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
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              Formulário de revisão — Task 5
            </div>
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
      <p style={{ margin: 0, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
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
          border: `2px dashed ${arrastando ? 'var(--color-primary)' : 'var(--color-border)'}`,
          borderRadius: 12,
          padding: '2.5rem',
          textAlign: 'center',
          background: arrastando ? 'var(--color-primary-bg)' : 'transparent',
          transition: 'all 0.2s',
          cursor: 'pointer',
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={40} style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }} />
        <p style={{ margin: 0, fontWeight: 600 }}>Arraste o PDF ou clique para selecionar</p>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>PDF ou imagem</p>
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
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 14, textDecoration: 'underline' }}
        onClick={onManual}
      >
        <Edit3 size={14} style={{ marginRight: 4 }} />
        Preencher manualmente
      </button>

      {erro && (
        <div style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.75rem 1rem', borderRadius: 8, fontSize: 14 }}>
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
          setStatus('IA lendo folha de cadastro...');
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
            // tipoVeiculo já é 'carro' | 'moto' normalizado por extrairDadosFichaCadastro
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
      <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
      <p style={{ margin: 0, fontWeight: 600 }}>{status}</p>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Suppress unused import warning for footerStyle, btnPrimary, dadosForm, clienteExistente — used in later tasks
void footerStyle;
void btnPrimary;

# Nova OS Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all OS creation modals with a single `NovaOSModal` that accepts PDF/photo of the Detran registration sheet, uses Gemini AI to extract data, and creates Cliente + Veículo + OS in one flow.

**Architecture:** Single `NovaOSModal.tsx` with 4 internal steps (upload → analyze → review → save). A `useNovaOSModal` hook exposes open/close globally. `App.tsx` routes all extension `CAPTURED_*` events to this modal. Old modals (`PrimeiroEmplacamentoModal`, `ModalSegundaVia`, `ATPVeModal`, `OSCreateDrawer`, `OSForm`) are deleted after migration.

**Tech Stack:** React 18 + TypeScript, Vite, Supabase, Gemini (`gemini-2.5-flash` via `@google/generative-ai`), Tailwind via CSS vars, `ModalBase.tsx` for styling, `fichaCadastroAI.ts` for PDF extraction (already exists).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `migrations/20260406000001_campos_cliente_veiculo.sql` | Already created | Adds new columns to `clientes` + `veiculos` |
| `src/types.ts` | Modify | Add new fields to `Cliente` and `Veiculo` interfaces |
| `src/lib/database.ts` | Modify | Persist new fields in `saveCliente` / `saveVeiculo` |
| `src/hooks/useNovaOSModal.ts` | Create | Global state hook to open/close `NovaOSModal` from anywhere |
| `src/components/NovaOSModal.tsx` | Create | 4-step unified OS creation modal |
| `src/App.tsx` | Modify | Route all `CAPTURED_*` events to `NovaOSModal`, remove old modal state |
| `src/pages/OSList.tsx` | Modify | "+ Nova OS" button uses `useNovaOSModal` |
| `src/pages/ServicosDetran.tsx` | Modify | "Acessar" button sends `DEFINIR_SERVICO` to extension before opening Detran |
| `chrome-extension/crm-content.js` | Modify | Forward `MATILDE_CRM_PAGE` → `DEFINIR_SERVICO` to background |
| `chrome-extension/content_detran.js` | Modify | Fix PDF capture for Primeiro Emplacamento (add debug + fix selectors) |
| `src/components/OSCreateDrawer.tsx` | Delete | Replaced by `NovaOSModal` |
| `src/components/PrimeiroEmplacamentoModal.tsx` | Delete | Replaced by `NovaOSModal` |
| `src/components/ModalSegundaVia.tsx` | Delete | Replaced by `NovaOSModal` |
| `src/components/ATPVeModal.tsx` | Delete | Replaced by `NovaOSModal` |
| `src/pages/OSForm.tsx` | Delete | Creation logic migrated to `NovaOSModal` |

---

## Task 1: Run Migration + Update Types + Database

**Files:**
- Execute: `migrations/20260406000001_campos_cliente_veiculo.sql` (in Supabase)
- Modify: `src/types.ts`
- Modify: `src/lib/database.ts`

- [ ] **Step 1: Run the migration in Supabase**

Open Supabase Dashboard → SQL Editor, paste and run the file at `migrations/20260406000001_campos_cliente_veiculo.sql`. Verify no errors.

- [ ] **Step 2: Update `Cliente` interface in `src/types.ts`**

Add after `pastaSupabasePath?: string;` in the `Cliente` interface:

```typescript
// Documento
rg?: string;
orgaoExpedidor?: string;
ufDocumento?: string;
// Endereço
endereco?: string;
numero?: string;
complemento?: string;
cep?: string;
bairro?: string;
municipio?: string;
uf?: string;
```

- [ ] **Step 3: Update `Veiculo` interface in `src/types.ts`**

Add after `hodometro?: string;` in the `Veiculo` interface:

```typescript
anoFabricacao?: string;
anoModelo?: string;
cor?: string;
combustivel?: string;
```

- [ ] **Step 4: Update `saveCliente` in `src/lib/database.ts`**

Find the object passed to Supabase `insert`/`update` for clientes and add the new fields:

```typescript
rg: cliente.rg ?? null,
orgao_expedidor: cliente.orgaoExpedidor ?? null,
uf_documento: cliente.ufDocumento ?? null,
endereco: cliente.endereco ?? null,
numero: cliente.numero ?? null,
complemento: cliente.complemento ?? null,
cep: cliente.cep ?? null,
bairro: cliente.bairro ?? null,
municipio: cliente.municipio ?? null,
uf: cliente.uf ?? null,
```

- [ ] **Step 5: Update `saveVeiculo` in `src/lib/database.ts`**

Add to the Supabase insert/update object:

```typescript
ano_fabricacao: veiculo.anoFabricacao ?? null,
ano_modelo: veiculo.anoModelo ?? null,
cor: veiculo.cor ?? null,
combustivel: veiculo.combustivel ?? null,
```

- [ ] **Step 6: Update the mapping from DB row → TypeScript object in `database.ts`**

In the function that maps a Supabase row to a `Cliente` object, add:

```typescript
rg: row.rg ?? undefined,
orgaoExpedidor: row.orgao_expedidor ?? undefined,
ufDocumento: row.uf_documento ?? undefined,
endereco: row.endereco ?? undefined,
numero: row.numero ?? undefined,
complemento: row.complemento ?? undefined,
cep: row.cep ?? undefined,
bairro: row.bairro ?? undefined,
municipio: row.municipio ?? undefined,
uf: row.uf ?? undefined,
```

In the `Veiculo` mapper, add:

```typescript
anoFabricacao: row.ano_fabricacao ?? undefined,
anoModelo: row.ano_modelo ?? undefined,
cor: row.cor ?? undefined,
combustivel: row.combustivel ?? undefined,
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd c:/Users/pedro/Downloads/CRM-Despachante-Matilde-Teste-main
npm run build
```

Expected: no TypeScript errors related to `Cliente` or `Veiculo`.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/lib/database.ts migrations/
git commit -m "feat: add address/doc fields to Cliente and vehicle characteristics to Veiculo"
```

---

## Task 2: Create `useNovaOSModal` Hook (Context-based)

**Files:**
- Create: `src/hooks/useNovaOSModal.ts`

**Important:** O hook deve usar React Context para que `App.tsx` e qualquer outra página compartilhem o mesmo estado do modal. Com `useState` local cada caller teria sua própria instância isolada — a extensão dispararia um modal invisível. A solução: criar um context provider, montar o `<NovaOSModal>` uma única vez em `App.tsx`, e consumir o context em qualquer página.

- [ ] **Step 1: Create `src/hooks/useNovaOSModal.ts`**

```typescript
// src/hooks/useNovaOSModal.ts
import { useState, useCallback, createContext, useContext } from 'react';

export interface DadosIniciaisOS {
  tipoServico?: string;
  // Cliente
  nomeCliente?: string;
  cpfCnpj?: string;
  tipoCpfCnpj?: 'CPF' | 'CNPJ';
  rg?: string;
  orgaoExpedidor?: string;
  ufDocumento?: string;
  telefone?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  cep?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  // Veículo
  placa?: string;
  chassi?: string;
  renavam?: string;
  marcaModelo?: string;
  anoFabricacao?: string;
  anoModelo?: string;
  cor?: string;
  combustivel?: string;
  categoria?: string;
  dataAquisicao?: string;
  tipoVeiculo?: 'carro' | 'moto';
  // PDF anexado (base64) — quando vem da extensão
  fileBase64?: string;
  fileName?: string;
}

interface NovaOSModalContextValue {
  isOpen: boolean;
  dadosIniciais: DadosIniciaisOS | undefined;
  open: (dados?: DadosIniciaisOS) => void;
  close: () => void;
}

export const NovaOSModalContext = createContext<NovaOSModalContextValue | null>(null);

/** Usado APENAS em App.tsx para criar o estado compartilhado */
export function useNovaOSModalState() {
  const [isOpen, setIsOpen] = useState(false);
  const [dadosIniciais, setDadosIniciais] = useState<DadosIniciaisOS | undefined>();

  const open = useCallback((dados?: DadosIniciaisOS) => {
    setDadosIniciais(dados);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setDadosIniciais(undefined);
  }, []);

  return { isOpen, dadosIniciais, open, close };
}

/** Usado em qualquer página/componente para abrir o modal */
export function useNovaOSModal() {
  const ctx = useContext(NovaOSModalContext);
  if (!ctx) throw new Error('useNovaOSModal deve ser usado dentro do NovaOSModalContext.Provider');
  return ctx;
}
```

- [ ] **Step 2: Prover o contexto em `App.tsx`**

Em `App.tsx`, no topo do componente `App`:

```tsx
import { NovaOSModalContext, useNovaOSModalState } from './hooks/useNovaOSModal';
import NovaOSModal from './components/NovaOSModal';

// dentro do App():
const novaOSModal = useNovaOSModalState();

// no JSX, envolver o Router (ou o conteúdo principal) com o Provider:
<NovaOSModalContext.Provider value={novaOSModal}>
  {/* ... todo o conteúdo existente do App ... */}
  <NovaOSModal
    isOpen={novaOSModal.isOpen}
    onClose={novaOSModal.close}
    onCreated={(osId) => { novaOSModal.close(); navigate(`/ordens/${osId}`); }}
    dadosIniciais={novaOSModal.dadosIniciais}
  />
</NovaOSModalContext.Provider>
```

- [ ] **Step 3: Em `OSList.tsx` e outras páginas, consumir o contexto**

```tsx
import { useNovaOSModal } from '../hooks/useNovaOSModal';

// no componente:
const { open } = useNovaOSModal();

// botão:
<button onClick={() => open()}>+ Nova OS</button>
```

Desta forma `App.tsx` renderiza o modal uma vez e qualquer página pode abri-lo.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNovaOSModal.ts
git commit -m "feat: add useNovaOSModal hook"
```

---

## Task 3: Create `NovaOSModal` — Skeleton + Etapa 1 (Upload / Câmera)

**Files:**
- Create: `src/components/NovaOSModal.tsx`

Use `overlayStyle`, `modalStyle`, `headerStyle`, `bodyStyle`, `footerStyle` from `src/components/ModalBase.tsx` to match existing modal look.

- [ ] **Step 1: Create the modal skeleton with Etapa 1**

```tsx
// src/components/NovaOSModal.tsx
import { useState, useRef, useCallback } from 'react';
import { X, Upload, Camera, Edit3, Loader } from 'lucide-react';
import {
  overlayStyle, modalStyle, headerStyle, bodyStyle, footerStyle,
  btnPrimary, btnSecondary,
} from './ModalBase';
import type { DadosIniciaisOS } from '../hooks/useNovaOSModal';

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
              onConcluido={(dados) => { /* Task 4 */ }}
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

// ─── Etapa 2: placeholder (Task 4) ─────────────────────────
function EtapaAnalisando(_props: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '3rem' }}>
      <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
      <p style={{ margin: 0, fontWeight: 600 }}>Analisando folha de cadastro...</p>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
```

- [ ] **Step 2: Render `NovaOSModal` in `App.tsx` para testar visualmente**

Em `App.tsx`, importe e adicione temporariamente:

```tsx
import NovaOSModal from './components/NovaOSModal';
// dentro do JSX do App, perto dos outros modais:
<NovaOSModal isOpen={true} onClose={() => {}} />
```

- [ ] **Step 3: Run dev server e verificar visualmente**

```bash
npm run dev
```

Abra o CRM no browser. Verifique:
- Modal abre com zona de drag-drop
- Botão câmera presente
- Link "Preencher manualmente" presente
- Fechar (X) funciona

- [ ] **Step 4: Remover o `isOpen={true}` temporário do App.tsx**

- [ ] **Step 5: Commit**

```bash
git add src/components/NovaOSModal.tsx
git commit -m "feat: NovaOSModal skeleton + etapa 1 upload/camera"
```

---

## Task 4: `NovaOSModal` — Etapa 2 (Análise com IA + Busca CPF)

**Files:**
- Modify: `src/components/NovaOSModal.tsx`

`fichaCadastroAI.ts` já existe em `src/lib/fichaCadastroAI.ts` com `extrairDadosFichaCadastro(file: File): Promise<DadosFichaCadastro>`. `getClientes` de `src/lib/database.ts` retorna todos os clientes — usar para busca por CPF.

- [ ] **Step 1: Implementar `EtapaAnalisando` real em `NovaOSModal.tsx`**

Substitua o placeholder `EtapaAnalisando` por:

```tsx
import { extrairDadosFichaCadastro, type DadosFichaCadastro } from '../lib/fichaCadastroAI';
import { getClientes } from '../lib/database';
import type { Cliente } from '../types';

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
            tipoVeiculo: resultado.tipoVeiculo?.toLowerCase().includes('moto') ? 'moto' : 'carro',
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
          // Mescla dados do banco com dados da IA (banco não sobrescreve IA)
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
```

- [ ] **Step 2: Conectar `onConcluido` no componente principal**

No `NovaOSModal`, adicione estado para armazenar dados e cliente existente:

```tsx
const [dadosForm, setDadosForm] = useState<DadosIniciaisOS>(dadosIniciais ?? {});
const [clienteExistente, setClienteExistente] = useState<Cliente | undefined>();
```

Atualize o `EtapaAnalisando` no JSX:

```tsx
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
```

- [ ] **Step 3: Verificar — faça upload do PDF de exemplo e veja se avança para revisão**

```bash
npm run dev
```

Abra o modal, arraste o PDF `servicos-detran (4).pdf`. Deve:
1. Avançar para "Analisando..."
2. Avançar para etapa de revisão (placeholder por ora)

- [ ] **Step 4: Commit**

```bash
git add src/components/NovaOSModal.tsx
git commit -m "feat: NovaOSModal etapa 2 - analise IA + busca CPF"
```

---

## Task 5: `NovaOSModal` — Etapa 3 (Formulário de Revisão)

**Files:**
- Modify: `src/components/NovaOSModal.tsx`

Use `useServiceLabels` de `src/hooks/useServiceLabels.ts` para labels dos serviços. Campos organizados em 3 seções: Serviço, Cliente, Veículo.

- [ ] **Step 1: Implementar `EtapaRevisao` em `NovaOSModal.tsx`**

```tsx
import { useServiceLabels } from '../hooks/useServiceLabels';
import { inputStyle, selectStyle, labelStyle, fieldWrapStyle, secaoStyle, secaoHeaderStyle } from './ModalBase';

interface EtapaRevisaoProps {
  dados: DadosIniciaisOS;
  onChange: (dados: DadosIniciaisOS) => void;
  clienteExistente?: Cliente;
  onVoltar: () => void;
  onConfirmar: () => void;
}

function EtapaRevisao({ dados, onChange, clienteExistente, onVoltar, onConfirmar }: EtapaRevisaoProps) {
  const serviceLabels = useServiceLabels();
  const set = (key: keyof DadosIniciaisOS) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...dados, [key]: e.target.value });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '1.5rem' }}>

      {/* Seção Serviço */}
      <div style={secaoStyle}>
        <div style={secaoHeaderStyle}>Serviço</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            <span style={{ marginLeft: 8, fontSize: 12, background: 'var(--color-info-bg)', color: 'var(--color-info)', padding: '2px 8px', borderRadius: 20 }}>
              Cliente existente
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ ...fieldWrapStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Nome *</label>
            <input style={inputStyle} value={dados.nomeCliente || ''} onChange={set('nomeCliente')} />
          </div>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>CPF/CNPJ *</label>
            <input style={inputStyle} value={dados.cpfCnpj || ''} onChange={set('cpfCnpj')} />
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
```

- [ ] **Step 2: Conectar `EtapaRevisao` no `NovaOSModal`**

Substitua o placeholder da etapa `revisao` no JSX por:

```tsx
{etapa === 'revisao' && (
  <EtapaRevisao
    dados={dadosForm}
    onChange={setDadosForm}
    clienteExistente={clienteExistente}
    onVoltar={() => setEtapa('upload')}
    onConfirmar={() => setEtapa('salvando')}
  />
)}
{(etapa === 'salvando' || etapa === 'sucesso') && (
  <div style={{ padding: '3rem', textAlign: 'center' }}>Salvando... (Task 6)</div>
)}
```

- [ ] **Step 3: Verificar — fazer upload do PDF e confirmar que form é preenchido**

```bash
npm run dev
```

- Upload PDF → IA preenche → formulário aparece com dados corretos do PDF de exemplo
- Badge "Cliente existente" aparece se CPF já está no banco
- Botão "Confirmar" fica habilitado quando Serviço + CPF + Nome estão preenchidos

- [ ] **Step 4: Commit**

```bash
git add src/components/NovaOSModal.tsx
git commit -m "feat: NovaOSModal etapa 3 - formulario de revisao completo"
```

---

## Task 6: `NovaOSModal` — Etapa 4 (Salvar + Sucesso)

**Files:**
- Modify: `src/components/NovaOSModal.tsx`

Reutiliza `saveCliente`, `saveVeiculo`, `saveOrdem`, `generateId` de `src/lib/database.ts`. Reutiliza `gerarChecklistDinamico` de `src/lib/configService.ts` para gerar o checklist correto pelo tipo de serviço. Reutiliza `finalizarOS` de `src/lib/osService.ts`.

- [ ] **Step 1: Adicionar imports no topo de `NovaOSModal.tsx`**

```tsx
import { saveCliente, saveVeiculo, saveOrdem, getClientes, generateId } from '../lib/database';
import { gerarChecklistDinamico } from '../lib/configService';
import { finalizarOS } from '../lib/osService';
import { CheckCircle } from 'lucide-react';
```

- [ ] **Step 2: Implementar `EtapaSalvando` e lógica de save**

Adicione a função `salvarOS` no componente principal `NovaOSModal`:

```tsx
const [osIdCriada, setOsIdCriada] = useState('');

async function salvarOS() {
  setEtapa('salvando');
  try {
    // 1. Resolver ou criar cliente
    let clienteId = clienteExistente?.id;
    if (!clienteId) {
      const novoCliente = {
        id: generateId(),
        tipo: (dadosForm.tipoCpfCnpj === 'CNPJ' ? 'PJ' : 'PF') as 'PF' | 'PJ',
        nome: dadosForm.nomeCliente!,
        cpfCnpj: dadosForm.cpfCnpj!,
        telefones: dadosForm.telefone ? [dadosForm.telefone] : [],
        documentos: [],
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
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };
      await saveCliente(novoCliente);
      clienteId = novoCliente.id;
    } else {
      // Atualiza dados do cliente existente com novos dados
      await saveCliente({
        ...clienteExistente!,
        nome: dadosForm.nomeCliente || clienteExistente!.nome,
        telefones: dadosForm.telefone ? [dadosForm.telefone, ...clienteExistente!.telefones.filter(t => t !== dadosForm.telefone)] : clienteExistente!.telefones,
        rg: dadosForm.rg || clienteExistente!.rg,
        orgaoExpedidor: dadosForm.orgaoExpedidor || clienteExistente!.orgaoExpedidor,
        ufDocumento: dadosForm.ufDocumento || clienteExistente!.ufDocumento,
        endereco: dadosForm.endereco || clienteExistente!.endereco,
        numero: dadosForm.numero || clienteExistente!.numero,
        cep: dadosForm.cep || clienteExistente!.cep,
        bairro: dadosForm.bairro || clienteExistente!.bairro,
        municipio: dadosForm.municipio || clienteExistente!.municipio,
        uf: dadosForm.uf || clienteExistente!.uf,
        atualizadoEm: new Date().toISOString(),
      });
    }

    // 2. Criar veículo
    const veiculoId = generateId();
    await saveVeiculo({
      id: veiculoId,
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
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    });

    // 3. Gerar checklist
    const checklist = await gerarChecklistDinamico(dadosForm.tipoServico!, {
      tipoVeiculo: dadosForm.tipoVeiculo || 'carro',
      trocaPlaca: false,
    });

    // 4. Criar OS
    const osId = generateId();
    await saveOrdem({
      id: osId,
      clienteId: clienteId,
      veiculoId,
      tipoServico: dadosForm.tipoServico!,
      tipoVeiculo: dadosForm.tipoVeiculo || 'carro',
      trocaPlaca: false,
      status: 'aguardando_documentacao',
      checklist,
      dataAbertura: new Date().toISOString(),
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    });

    setOsIdCriada(osId);
    setEtapa('sucesso');
  } catch (err: any) {
    setErro(err?.message || 'Erro ao salvar OS');
    setEtapa('revisao');
  }
}
```

- [ ] **Step 3: Chamar `salvarOS` ao confirmar**

Substitua `onConfirmar={() => setEtapa('salvando')}` por `onConfirmar={salvarOS}`.

- [ ] **Step 4: Implementar `EtapaSucesso`**

```tsx
function EtapaSucesso({ osId, onVerOS, onFechar }: { osId: string; onVerOS: () => void; onFechar: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '3rem' }}>
      <CheckCircle size={56} style={{ color: 'var(--color-success)' }} />
      <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>OS criada com sucesso!</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button style={btnSecondary} onClick={onFechar}>Fechar</button>
        <button style={btnPrimary} onClick={onVerOS}>Ver OS</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Adicionar `EtapaSucesso` e loading no JSX**

```tsx
import { useNavigate } from 'react-router-dom';
// dentro do NovaOSModal:
const navigate = useNavigate();

// no JSX:
{etapa === 'salvando' && (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '3rem' }}>
    <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
    <p style={{ margin: 0, fontWeight: 600 }}>Criando OS...</p>
  </div>
)}
{etapa === 'sucesso' && (
  <EtapaSucesso
    osId={osIdCriada}
    onVerOS={() => { handleClose(); navigate(`/ordens/${osIdCriada}`); }}
    onFechar={handleClose}
  />
)}
```

- [ ] **Step 6: Verificar fluxo completo**

```bash
npm run dev
```

Faça o fluxo completo:
1. Abrir modal → upload PDF → IA extrai → revisão → confirmar → OS criada
2. Clicar "Ver OS" → navega para detalhe da OS
3. Verificar no Supabase que cliente, veículo e OS foram criados com todos os novos campos

- [ ] **Step 7: Commit**

```bash
git add src/components/NovaOSModal.tsx
git commit -m "feat: NovaOSModal etapa 4 - salvar e sucesso"
```

---

## Task 7: Integrar `NovaOSModal` no `App.tsx` — Substituir handlers da Extensão

**Files:**
- Modify: `src/App.tsx`

O `App.tsx` tem ~1400 linhas com handlers separados para cada evento da extensão. Todos devem chamar `openNovaOS(dados)` ao invés de abrir modais específicos.

- [ ] **Step 1: Importar `NovaOSModal`, `NovaOSModalContext` e `useNovaOSModalState` em `App.tsx`**

`App.tsx` é o **dono** do estado — usa `useNovaOSModalState` (não `useNovaOSModal`, que é para páginas filhas).

```tsx
import NovaOSModal from './components/NovaOSModal';
import { NovaOSModalContext, useNovaOSModalState } from './hooks/useNovaOSModal';
```

No topo do componente `App`:
```tsx
const novaOSModal = useNovaOSModalState();
const { isOpen: novaOSOpen, dadosIniciais: novaOSDados, open: openNovaOS, close: closeNovaOS } = novaOSModal;
```

- [ ] **Step 2: Substituir `CAPTURED_PRIMEIRO_EMPLACAMENTO` handler**

Encontre o handler em `App.tsx` (linha ~701). Substitua toda a lógica de abrir `PrimeiroEmplacamentoModal` por:

```tsx
else if (event.data?.source === 'MATILDE_EXTENSION' && event.data?.type === 'CAPTURED_PRIMEIRO_EMPLACAMENTO') {
  const dados = event.data.payload?.dados || event.data.payload;
  openNovaOS({
    tipoServico: 'primeiro_emplacamento',
    chassi: dados?.chassi,
    renavam: dados?.renavam,
    marcaModelo: dados?.marcaModelo,
    anoFabricacao: dados?.anoFabricacao,
    anoModelo: dados?.anoModelo,
    nomeCliente: dados?.nomeAdquirente,
    cpfCnpj: dados?.cpfCnpjAdquirente,
    rg: dados?.rgAdquirente,
    orgaoExpedidor: dados?.orgaoExpedidor,
    ufDocumento: dados?.ufOrgaoExpedidor,
    tipoVeiculo: dados?.tipoVeiculo?.toLowerCase().includes('moto') ? 'moto' : 'carro',
  });
}
```

- [ ] **Step 3: Substituir `CAPTURED_SEGUNDA_VIA` handler (linha ~1033)**

```tsx
else if (event.data?.source === 'MATILDE_EXTENSION' && event.data?.type === 'CAPTURED_SEGUNDA_VIA') {
  const { dados, fileBase64, fileName } = event.data.payload;
  openNovaOS({
    tipoServico: 'segunda_via',
    placa: dados?.placa,
    chassi: dados?.chassi,
    renavam: dados?.renavam,
    marcaModelo: dados?.marcaModelo,
    nomeCliente: dados?.nomeProprietario,
    cpfCnpj: dados?.cpfCnpjProprietario,
    fileBase64,
    fileName,
  });
}
```

- [ ] **Step 4: Substituir `CAPTURED_DAE_PDF` e `CAPTURED_PRIMEIRO_EMPLACAMENTO_PDF` handlers**

```tsx
else if (event.data?.source === 'MATILDE_EXTENSION' &&
  (event.data?.type === 'CAPTURED_DAE_PDF' || event.data?.type === 'CAPTURED_PRIMEIRO_EMPLACAMENTO_PDF')) {
  const { base64, placa, chassi, servicoAtivo, fileBase64, fileName } = event.data.payload;
  openNovaOS({
    tipoServico: servicoAtivo,
    placa: placa || undefined,
    chassi: chassi || undefined,
    fileBase64: base64 || fileBase64,
    fileName,
  });
}
```

- [ ] **Step 5: Substituir handlers restantes**

Os handlers abaixo ainda abrem modais antigos ou navegam para `OSForm`. Substitua cada um por `openNovaOS({...})`:

**`PROCESS_DETRAN_PDF`** (linha ~74):
```tsx
else if (event.data?.type === 'PROCESS_DETRAN_PDF') {
  const { fileBase64, fileName, placa, servicoAtivo } = event.data.payload;
  openNovaOS({ tipoServico: servicoAtivo, placa, fileBase64, fileName });
}
```

**`CAPTURED_CONFIRMAR_DADOS`** (linha ~210):
```tsx
else if (event.data?.type === 'CAPTURED_CONFIRMAR_DADOS') {
  const dados = event.data.payload;
  openNovaOS({
    tipoServico: dados?.servicoAtivo,
    placa: dados?.placa,
    chassi: dados?.chassi,
    nomeCliente: dados?.nomeProprietario,
    cpfCnpj: dados?.cpfCnpj,
  });
}
```

**`CRLV_CONSULTA_RESULTADO`** (linha ~532): se abria modal, substituir por `openNovaOS({ ...dadosRelevantes })`.

Qualquer outro handler que chame `navigate('/ordens/nova', { state: ... })` ou abra um modal antigo: substituir por `openNovaOS({ ...dados })`.

Após substituir todos, faça uma busca para garantir que não sobrou nenhuma referência:
```bash
grep -n "PrimeiroEmplacamentoModal\|ModalSegundaVia\|ATPVeModal\|OSCreateDrawer\|navigate.*ordens.*nova" src/App.tsx
```
Esperado: sem resultados.

- [ ] **Step 6: Adicionar `NovaOSModal` no JSX do `App`**

No JSX, próximo ao final onde ficavam os outros modais:

```tsx
<NovaOSModal
  isOpen={novaOSOpen}
  onClose={closeNovaOS}
  onCreated={(osId) => { closeNovaOS(); navigate(`/ordens/${osId}`); }}
  dadosIniciais={novaOSDados}
/>
```

- [ ] **Step 7: Remover imports dos modais antigos de `App.tsx`**

Remova:
```tsx
import OSForm from './pages/OSForm';
import { PrimeiroEmplacamentoModal } ...
import { ModalSegundaVia } ...
import ATPVeModal ...
// etc.
```

- [ ] **Step 8: Build e verificar**

```bash
npm run build
```

Esperado: sem erros de TypeScript.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "feat: App.tsx - unifica handlers extensao no NovaOSModal"
```

---

## Task 8: Atualizar `OSList.tsx` e Outras Páginas

**Files:**
- Modify: `src/pages/OSList.tsx`

- [ ] **Step 1: Encontrar botão "+ Nova OS" em `OSList.tsx`**

```bash
grep -n "Nova OS\|novaOS\|OSCreate\|navigate.*ordens" src/pages/OSList.tsx | head -20
```

- [ ] **Step 2: Substituir por `useNovaOSModal`**

```tsx
import { useNovaOSModal } from '../hooks/useNovaOSModal';
import NovaOSModal from '../components/NovaOSModal';

// no componente:
const { isOpen, dadosIniciais, open, close } = useNovaOSModal();

// botão:
<button onClick={() => open()}>+ Nova OS</button>

// no JSX:
<NovaOSModal isOpen={isOpen} onClose={close} onCreated={(id) => { close(); navigate(`/ordens/${id}`); }} dadosIniciais={dadosIniciais} />
```

- [ ] **Step 3: Verificar que "+ Nova OS" abre o modal correto**

```bash
npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/OSList.tsx
git commit -m "feat: OSList usa NovaOSModal"
```

---

## Task 9: `ServicosDetran.tsx` — Definir Serviço Ativo na Extensão

**Files:**
- Modify: `src/pages/ServicosDetran.tsx`
- Modify: `chrome-extension/crm-content.js`

- [ ] **Step 1: Modificar `openDetran` em `ServicosDetran.tsx`**

Encontre a função `openDetran` (linha ~102) e substitua por:

```tsx
function openDetran(service: DetranService) {
  // Notifica extensão qual serviço está sendo iniciado
  window.postMessage({
    source: 'MATILDE_CRM_PAGE',
    action: 'DEFINIR_SERVICO',
    servico: service.id,
  }, '*');
  window.open(service.url, '_blank');
}
```

- [ ] **Step 2: Atualizar `crm-content.js` para repassar `DEFINIR_SERVICO`**

O arquivo já tem um `window.addEventListener("message", ...)`. **Adicione o bloco `if` abaixo DENTRO do listener existente** — não crie um segundo listener.

```javascript
// DENTRO do window.addEventListener("message", ...) já existente:
if (event.data && event.data.source === 'MATILDE_CRM_PAGE' && event.data.action === 'DEFINIR_SERVICO') {
  chrome.runtime.sendMessage({
    action: 'DEFINIR_SERVICO',
    payload: { servico: event.data.servico },
  }, (resp) => {
    if (chrome.runtime.lastError) {
      console.error('[Matilde][CRM] Erro ao definir serviço:', chrome.runtime.lastError.message);
    } else {
      console.log('[Matilde][CRM] Serviço definido:', event.data.servico, resp);
    }
  });
  return; // não processar como resposta de sucesso do React
}
```

O listener existente tem a condição `if (event.data && event.data.source === 'MATILDE_CRM' ...)`. Adicione o novo bloco `if` **antes** dessa condição.

- [ ] **Step 3: Verificar — recarregar extensão e testar**

1. `npm run build` (ou `npm run dev`)
2. Recarregar extensão no Chrome (`chrome://extensions` → recarregar)
3. Abrir CRM → Serviços Detran → clicar "Acessar" em Primeiro Emplacamento
4. Verificar no console da extensão: `[Matilde][CRM] Serviço definido: primeiro_emplacamento`
5. Verificar `chrome.storage.local` → `matilde_servico_ativo: 'primeiro_emplacamento'`

- [ ] **Step 4: Commit**

```bash
git add src/pages/ServicosDetran.tsx chrome-extension/crm-content.js
git commit -m "feat: ServicosDetran define servico ativo na extensao ao abrir Detran"
```

---

## Task 10: Fix `content_detran.js` — Captura de PDF no Primeiro Emplacamento

**Files:**
- Modify: `chrome-extension/content_detran.js`

O problema: nenhum toast, nenhuma reação quando o usuário chega na página de emissão de ficha/DAE. Causa mais provável: a função `tentarCapturarPrimeirEmplacamentoPag4` (ou `tentarCapturarPrimeiroEmplacamentoPag3`) não está sendo chamada na URL correta, ou os seletores de form/botão estão errados.

- [ ] **Step 1: Adicionar log de diagnóstico na entrada de cada função**

No início de `tentarCapturarDecalque`, `tentarCapturarPrimeirEmplacamentoPag4` e em `processarPagina`, adicione:

```javascript
console.log('[Matilde][Diagnóstico] URL atual:', window.location.href);
console.log('[Matilde][Diagnóstico] Serviço ativo:', /* await storage */ );
```

- [ ] **Step 2: Recarregar extensão e navegar pelo fluxo de Primeiro Emplacamento**

1. Chrome → `chrome://extensions` → recarregar a extensão
2. Acessar CRM → Serviços Detran → "Primeiro Emplacamento" → clicar Acessar
3. Navegar pelo fluxo no Detran até a página de emissão de ficha
4. Observar console da aba do Detran (F12 → Console) e identificar qual URL está sendo detectada e se `matilde_servico_ativo` está correto

- [ ] **Step 3: Corrigir a condição de URL se necessário**

Se os logs mostrarem que a URL não bate com `emitir-ficha-de-cadastro-e-dae`, ajuste o `if` em `tentarCapturarPrimeirEmplacamentoPag4`:

```javascript
// Antes:
if (!window.location.href.includes('emitir-ficha-de-cadastro-e-dae')) return;

// Depois (adicionar variantes):
const url = window.location.href.toLowerCase();
if (!url.includes('emitir-ficha') && !url.includes('dae') && !url.includes('emplacamento')) {
  console.log('[Matilde] URL não reconhecida para captura:', url);
  return;
}
```

- [ ] **Step 4: Corrigir seletor do formulário se necessário**

Se o log mostrar que o form não é encontrado, inspecione o HTML da página do Detran (F12 → Elements) e atualize o seletor:

```javascript
// Tente seletores mais amplos:
const form = document.querySelector('#form-emitir-ficha-de-cadastro-e-dae')
  || document.querySelector('form[action*="emitir"]')
  || document.querySelector('form[method="post"]')
  || document.querySelector('form');
```

- [ ] **Step 5: Garantir que toast apareça antes do fetch**

Em `tentarCapturarPrimeirEmplacamentoPag4`, mova `_mostrarToastPag4('carregando')` para **antes** de qualquer `await`:

```javascript
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (_pag4Capturada) return;
  _pag4Capturada = true;
  _mostrarToastPag4('carregando'); // ← MOVER PARA AQUI, antes do try/catch
  try {
    // ... fetch ...
```

- [ ] **Step 6: Testar fluxo completo de Primeiro Emplacamento**

1. Recarregar extensão
2. CRM → Serviços Detran → Primeiro Emplacamento → Acessar
3. Preencher dados no Detran → clicar no botão de emitir ficha
4. Verificar: toast "Matilde capturando PDF..." aparece
5. Verificar: CRM abre `NovaOSModal` com dados pré-preenchidos

- [ ] **Step 7: Commit**

```bash
git add chrome-extension/content_detran.js
git commit -m "fix: content_detran - corrige captura de PDF no Primeiro Emplacamento"
```

---

## Task 11: Deletar Modais Antigos + Cleanup

**Files:**
- Delete: `src/components/OSCreateDrawer.tsx`
- Delete: `src/components/PrimeiroEmplacamentoModal.tsx`
- Delete: `src/components/ModalSegundaVia.tsx`
- Delete: `src/components/ATPVeModal.tsx`
- Delete: `src/pages/OSForm.tsx`

- [ ] **Step 1: Verificar que nenhum arquivo ainda importa os modais antigos**

```bash
grep -rn "OSCreateDrawer\|PrimeiroEmplacamentoModal\|ModalSegundaVia\|ATPVeModal\|from.*OSForm" src/ --include="*.tsx" --include="*.ts"
```

Esperado: sem resultados (ou só em arquivos que serão deletados).

- [ ] **Step 2: Deletar os arquivos**

```bash
rm src/components/OSCreateDrawer.tsx
rm src/components/PrimeiroEmplacamentoModal.tsx
rm src/components/ModalSegundaVia.tsx
rm src/components/ATPVeModal.tsx
rm src/pages/OSForm.tsx
```

- [ ] **Step 3: Build final**

```bash
npm run build
```

Esperado: build completo sem erros.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "chore: remove modais antigos de OS (OSCreateDrawer, PrimeiroEmplacamentoModal, ModalSegundaVia, ATPVeModal, OSForm)"
```

---

## Task 12: Verificação End-to-End

- [ ] **Fluxo 1: Nova OS manual**
  - Abrir OSList → "+ Nova OS" → preencher manualmente → confirmar → OS criada ✅

- [ ] **Fluxo 2: Nova OS via PDF**
  - Abrir modal → fazer upload do PDF → IA preenche campos → confirmar → OS criada com todos os campos novos (RG, endereço, cor, ano) salvos no Supabase ✅

- [ ] **Fluxo 3: Nova OS via câmera**
  - Abrir modal → tirar foto → IA preenche → confirmar → OS criada ✅

- [ ] **Fluxo 4: CPF existente**
  - Fazer upload de PDF de cliente que já existe no banco → badge "Cliente existente" aparece → dados pré-preenchidos e editáveis ✅

- [ ] **Fluxo 5: Extensão → Primeiro Emplacamento**
  - CRM → Serviços Detran → Primeiro Emplacamento → Acessar → navegar no Detran → clicar emitir ficha → toast aparece → CRM abre NovaOSModal com dados ✅

- [ ] **Fluxo 6: Serviço ativo na extensão**
  - Clicar "Acessar" em qualquer serviço → verificar `matilde_servico_ativo` no `chrome.storage.local` ✅

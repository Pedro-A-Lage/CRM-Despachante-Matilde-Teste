# Decalque Chassi — Captura Automática Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o Detran MG exibir o modal com o PDF do Decalque de Chassi (transferência ou alteração de dados), a extensão captura automaticamente, a IA extrai os dados, valida ou pré-preenche o ATPVeModal, e salva o PDF no Supabase.

**Architecture:** A extensão detecta `#link-pdf-dae` via MutationObserver, extrai o base64 e envia ao CRM via `CAPTURED_DAE_PDF`. O CRM roda `extrairDecalqueChassi()` (novo, em `atpveAI.ts`), decide entre Cenário A (OS existe → upload direto) e Cenário B (sem OS → abre ATPVeModal pré-preenchido após busca de cliente por CPF).

**Tech Stack:** TypeScript, React, pdf.js, Anthropic SDK (Claude Haiku Vision), Supabase, Chrome Extension MV3

---

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/lib/atpveAI.ts` | + `PROMPT_DECALQUE` + `extrairDecalqueChassi(file)` |
| `src/lib/storage.ts` | + `getClienteByCpfCnpj(cpfCnpj)` |
| `src/components/ATPVeModal.tsx` | + prop `dadosIniciais` para pré-preenchimento externo |
| `chrome-extension/content_detran.js` | + detector de modal `#link-pdf-dae` |
| `chrome-extension/background.js` | + handler `CAPTURE_DAE_PDF` |
| `src/App.tsx` | + handler `CAPTURED_DAE_PDF` no `ExtensionListener` |

---

## Task 1: Função `extrairDecalqueChassi` em `atpveAI.ts`

**Files:**
- Modify: `src/lib/atpveAI.ts`

A função renderiza apenas a página 1 do PDF (Decalque Chassi), ignorando a página 2 (DAE).

- [ ] **Step 1: Adicionar `PROMPT_DECALQUE` e tipo de retorno**

Após a constante `PROMPT_ATPVE` existente, adicionar:

```typescript
export interface DadosDecalque {
  placa: string;
  chassi: string;
  renavam: string;
  valorRecibo: string;
  dataAquisicao: string;
  municipioEmplacamento: string;
  comprador: {
    nome: string;
    cpfCnpj: string;
    tipoCpfCnpj: 'CPF' | 'CNPJ';
    rg: string;
    orgaoExpedidor: string;
    uf: string;
    endereco: string;
    numero: string;
    cep: string;
    bairro: string;
    municipio: string;
  };
  vendedor: {
    nome: string;
    cpfCnpj: string;
    tipoCpfCnpj: 'CPF' | 'CNPJ';
  };
  veiculo: {
    tipo: string;
    marcaModelo: string;
    anoFabricacao: string;
    anoModelo: string;
    cor: string;
    combustivel: string;
  };
}

const PROMPT_DECALQUE = `Você é um especialista em documentos veiculares brasileiros. Analise este DECALQUE DE CHASSI (Documento de Cadastro do Detran/MG) e extraia SOMENTE os campos listados abaixo.

Esta é a PÁGINA 1 do documento. Ignore qualquer conteúdo de DAE ou boleto.

Retorne APENAS um objeto JSON válido, sem markdown, sem explicações:
{
  "placa": "",
  "chassi": "",
  "renavam": "",
  "valorRecibo": "",
  "dataAquisicao": "",
  "municipioEmplacamento": "",
  "comprador": {
    "nome": "",
    "cpfCnpj": "",
    "tipoCpfCnpj": "",
    "rg": "",
    "orgaoExpedidor": "",
    "uf": "",
    "endereco": "",
    "numero": "",
    "cep": "",
    "bairro": "",
    "municipio": ""
  },
  "vendedor": {
    "nome": "",
    "cpfCnpj": "",
    "tipoCpfCnpj": ""
  },
  "veiculo": {
    "tipo": "",
    "marcaModelo": "",
    "anoFabricacao": "",
    "anoModelo": "",
    "cor": "",
    "combustivel": ""
  }
}

REGRAS:
- "placa": maiúsculo, sem espaços (ex: "TYQ3C89")
- "chassi": exatamente como aparece no documento
- "renavam": apenas dígitos
- "valorRecibo": valor em reais (ex: "14500.00"), sem "R$" ou pontos de milhar
- "dataAquisicao": formato "DD/MM/YYYY"
- "tipoCpfCnpj": use "CPF" se 11 dígitos, "CNPJ" se 14 dígitos
- "cpfCnpj": apenas dígitos, sem pontuação
- "cep": apenas dígitos, sem hífen
- Campos não encontrados: retornar string vazia ""
`;
```

- [ ] **Step 2: Adicionar função `extrairDecalqueChassi`**

Após `extrairDadosATPVeComIA`, adicionar:

```typescript
export async function extrairDecalqueChassi(file: File): Promise<DadosDecalque> {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Somente página 1 — Decalque Chassi (página 2 é o DAE, ignorado)
    const imagem = await renderizarPaginaComoImagem(pdfDoc, 1, 2.0);

    const content: Anthropic.MessageParam['content'] = [
        {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imagem },
        },
        { type: 'text', text: PROMPT_DECALQUE },
    ];

    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content }],
    });

    const texto = (response.content[0] as any).text as string;

    try {
        const jsonMatch = texto.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : texto);
        return parsed as DadosDecalque;
    } catch {
        throw new Error(`IA retornou resposta inválida para Decalque: ${texto.slice(0, 200)}`);
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/atpveAI.ts
git commit -m "feat: add extrairDecalqueChassi with PROMPT_DECALQUE for page 1 only"
```

---

## Task 2: `getClienteByCpfCnpj` em `storage.ts`

**Files:**
- Modify: `src/lib/storage.ts`

Necessário para o Cenário B — verificar se o comprador já tem cadastro antes de abrir o modal.

- [ ] **Step 1: Adicionar função após `getCliente`**

Localizar `export async function getCliente(id: string)` e adicionar logo após:

```typescript
export async function getClienteByCpfCnpj(cpfCnpj: string): Promise<Cliente | undefined> {
    const cpfLimpo = cpfCnpj.replace(/\D/g, '');
    const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('cpf_cnpj', cpfLimpo)
        .maybeSingle();
    if (error) { console.error('Erro getClienteByCpfCnpj:', error); return undefined; }
    if (!data) return undefined;
    return dbToCliente(data);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: add getClienteByCpfCnpj to storage"
```

---

## Task 3: Prop `dadosIniciais` no `ATPVeModal`

**Files:**
- Modify: `src/components/ATPVeModal.tsx`

Permite que o CRM pré-preencha o modal com dados extraídos do Decalque.

- [ ] **Step 1: Adicionar tipo e prop à interface**

Localizar `interface ATPVeModalProps` (linha 15) e expandir:

```typescript
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
}

interface ATPVeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (osId: string) => void;
  dadosIniciais?: DadosIniciaisModal;  // novo
}
```

- [ ] **Step 2: Aplicar `dadosIniciais` no estado inicial**

Localizar a função `ATPVeModal({ isOpen, onClose, onSuccess })` (linha 161) e atualizar assinatura + inicialização do estado `dados`:

```typescript
export default function ATPVeModal({ isOpen, onClose, onSuccess, dadosIniciais }: ATPVeModalProps) {
```

Localizar onde `dadosVazios` é usado para inicializar o estado `dados` e adicionar `useEffect` logo após os `useState`:

```typescript
// Pré-preenche campos quando dadosIniciais é fornecido (vindo do Decalque Chassi)
useEffect(() => {
    if (dadosIniciais && isOpen) {
        setModoManual(true);
        setDados(prev => ({
            ...prev,
            placa: dadosIniciais.placa ?? prev.placa,
            chassi: dadosIniciais.chassi ?? prev.chassi,
            renavam: dadosIniciais.renavam ?? prev.renavam,
            valorRecibo: dadosIniciais.valorRecibo ?? prev.valorRecibo,
            dataAquisicao: dadosIniciais.dataAquisicao ?? prev.dataAquisicao,
            tipoCpfCnpjComprador: dadosIniciais.tipoCpfCnpjComprador ?? prev.tipoCpfCnpjComprador,
            cpfCnpjComprador: dadosIniciais.cpfCnpjComprador ?? prev.cpfCnpjComprador,
            nomeComprador: dadosIniciais.nomeComprador ?? prev.nomeComprador,
            telefoneComprador: dadosIniciais.telefoneComprador ?? prev.telefoneComprador,
            enderecoComprador: dadosIniciais.enderecoComprador ?? prev.enderecoComprador,
            numeroComprador: dadosIniciais.numeroComprador ?? prev.numeroComprador,
            cepComprador: dadosIniciais.cepComprador ?? prev.cepComprador,
            bairroComprador: dadosIniciais.bairroComprador ?? prev.bairroComprador,
            municipioComprador: dadosIniciais.municipioComprador ?? prev.municipioComprador,
            ufComprador: dadosIniciais.ufComprador ?? prev.ufComprador,
            tipoCpfCnpjVendedor: dadosIniciais.tipoCpfCnpjVendedor ?? prev.tipoCpfCnpjVendedor,
            cpfCnpjVendedor: dadosIniciais.cpfCnpjVendedor ?? prev.cpfCnpjVendedor,
            marcaModelo: dadosIniciais.marcaModelo ?? prev.marcaModelo,
            anoFabricacao: dadosIniciais.anoFabricacao ?? prev.anoFabricacao,
            anoModelo: dadosIniciais.anoModelo ?? prev.anoModelo,
            cor: dadosIniciais.cor ?? prev.cor,
        }));
    }
}, [dadosIniciais, isOpen]);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ATPVeModal.tsx
git commit -m "feat: add dadosIniciais prop to ATPVeModal for Decalque pre-fill"
```

---

## Task 4: Detector de modal em `content_detran.js`

**Files:**
- Modify: `chrome-extension/content_detran.js`

O MutationObserver já existe. Adicionar lógica para detectar o modal `#link-pdf-dae`.

- [ ] **Step 1: Adicionar variável de controle de debounce para o modal**

Antes da função `processarPagina`, adicionar:

```javascript
// Controle para não enviar o mesmo PDF duas vezes
let _daeCapturado = false;
```

- [ ] **Step 2: Adicionar função `tentarCapturarDecalque`**

Após a declaração de `_daeCapturado`:

```javascript
async function tentarCapturarDecalque() {
    // Só atua em transferência e alteração de dados
    const ctx = await new Promise(resolve =>
        chrome.storage.local.get(['matilde_servico_ativo', 'matilde_placa', 'matilde_chassi'], resolve)
    );

    const servicosElegiveis = ['transferencia', 'alteracao_dados'];
    if (!servicosElegiveis.includes(ctx.matilde_servico_ativo)) return;

    const linkPdf = document.getElementById('link-pdf-dae');
    if (!linkPdf) return;

    const href = linkPdf.getAttribute('href') || '';
    if (!href.startsWith('data:application/pdf;base64,')) return;

    if (_daeCapturado) {
        console.log('[Matilde][Content] Decalque já capturado, ignorando.');
        return;
    }

    _daeCapturado = true;
    console.log('[Matilde][Content] Modal Decalque/DAE detectado. Capturando PDF...');

    chrome.runtime.sendMessage({
        action: 'CAPTURE_DAE_PDF',
        payload: {
            base64: href,
            placa: ctx.matilde_placa || '',
            chassi: ctx.matilde_chassi || '',
            servicoAtivo: ctx.matilde_servico_ativo,
        }
    }, (resp) => {
        if (chrome.runtime.lastError) {
            console.error('[Matilde][Content] Erro ao enviar Decalque:', chrome.runtime.lastError.message);
            _daeCapturado = false; // permite retry
        } else {
            console.log('[Matilde][Content] Decalque enviado ao background:', resp);
        }
    });
}
```

- [ ] **Step 3: Chamar `tentarCapturarDecalque` no MutationObserver existente**

Localizar a callback do `MutationObserver` (onde `processarPagina` é chamada via debounce) e adicionar:

```javascript
// Detecta modal de Decalque/DAE
tentarCapturarDecalque();
```

Logo após a linha que chama `processarPagina` (dentro do `setTimeout` do debounce não é necessário — chamar direto pois a detecção é leve).

- [ ] **Step 4: Resetar `_daeCapturado` quando o modal fechar**

Após `tentarCapturarDecalque`, adicionar listener para reset:

```javascript
// Reset quando o modal do DAE fechar (botão .fechar-modal-atual)
document.addEventListener('click', (e) => {
    const target = e.target;
    if (target && (target.closest?.('.fechar-modal-atual') || target.closest?.('.modal-backdrop'))) {
        _daeCapturado = false;
        console.log('[Matilde][Content] Modal fechado, reset _daeCapturado.');
    }
});
```

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/content_detran.js
git commit -m "feat: detect #link-pdf-dae modal and capture Decalque base64"
```

---

## Task 5: Handler `CAPTURE_DAE_PDF` em `background.js`

**Files:**
- Modify: `chrome-extension/background.js`

- [ ] **Step 1: Adicionar handler no `chrome.runtime.onMessage.addListener` existente**

Localizar o bloco `chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {` existente e adicionar case para `CAPTURE_DAE_PDF`:

```javascript
if (message.action === 'CAPTURE_DAE_PDF') {
    (async () => {
        try {
            const ctx = await new Promise(resolve =>
                chrome.storage.local.get(['matilde_osId', 'matilde_placa', 'matilde_chassi', 'matilde_servico_ativo'], resolve)
            );

            const payload = {
                fileBase64: message.payload.base64,
                fileName: `decalque_${message.payload.placa || ctx.matilde_placa || Date.now()}.pdf`,
                osId: ctx.matilde_osId || null,
                placa: message.payload.placa || ctx.matilde_placa || '',
                chassi: message.payload.chassi || ctx.matilde_chassi || '',
                servicoAtivo: message.payload.servicoAtivo || ctx.matilde_servico_ativo || '',
            };

            await garantirCRMTab();
            if (crmTabId) {
                chrome.tabs.sendMessage(crmTabId, {
                    source: 'MATILDE_EXTENSION',
                    type: 'CAPTURED_DAE_PDF',
                    payload,
                }, (resp) => {
                    if (chrome.runtime.lastError) {
                        console.error('[Matilde][Background] Erro ao enviar CAPTURED_DAE_PDF:', chrome.runtime.lastError.message);
                    } else {
                        console.log('[Matilde][Background] CAPTURED_DAE_PDF enviado ao CRM:', resp);
                    }
                });
            } else {
                console.warn('[Matilde][Background] Aba do CRM não encontrada para enviar Decalque.');
            }

            sendResponse({ success: true });
        } catch (err) {
            console.error('[Matilde][Background] Erro ao processar CAPTURE_DAE_PDF:', err);
            sendResponse({ success: false, error: err.message });
        }
    })();
    return true; // async sendResponse
}
```

- [ ] **Step 2: Commit**

```bash
git add chrome-extension/background.js
git commit -m "feat: add CAPTURE_DAE_PDF handler in background.js"
```

---

## Task 6: Handler `CAPTURED_DAE_PDF` em `App.tsx`

**Files:**
- Modify: `src/App.tsx`

Este é o núcleo da lógica — decide Cenário A ou B e age.

- [ ] **Step 1: Adicionar import das novas funções**

No bloco de imports do `App.tsx`, garantir que estejam disponíveis (via import dinâmico dentro do handler, seguindo o padrão já existente no arquivo):

```typescript
// Imports dinâmicos já usados no padrão do arquivo — usar o mesmo padrão
// import('./lib/atpveAI') → extrairDecalqueChassi
// import('./lib/storage') → getOrdem, getClienteByCpfCnpj, updateOrdem, addAuditEntry, uploadFileToSupabase
```

- [ ] **Step 2: Adicionar estado para controle do ATPVeModal no App**

Localizar onde `ATPVeModal` é renderizado em `App.tsx` (buscar por `<ATPVeModal`) e adicionar estado:

```typescript
const [decalqueModalOpen, setDecalqueModalOpen] = useState(false);
const [decalqueDadosIniciais, setDecalqueDadosIniciais] = useState<DadosIniciaisModal | undefined>(undefined);
```

Importar `DadosIniciaisModal` de `./components/ATPVeModal`.

- [ ] **Step 3: Renderizar ATPVeModal com os novos props**

Onde `<ATPVeModal` é renderizado, adicionar instância adicional para o fluxo do Decalque:

```tsx
<ATPVeModal
  isOpen={decalqueModalOpen}
  onClose={() => { setDecalqueModalOpen(false); setDecalqueDadosIniciais(undefined); }}
  onSuccess={(osId) => { setDecalqueModalOpen(false); setDecalqueDadosIniciais(undefined); navigate(`/ordens/${osId}`); }}
  dadosIniciais={decalqueDadosIniciais}
/>
```

- [ ] **Step 4: Adicionar handler `CAPTURED_DAE_PDF` no `useEffect` do `ExtensionListener`**

Localizar o último `else if` antes do fechamento do `useEffect` (após `CRLV_CONSULTA_RESULTADO`) e adicionar:

```typescript
else if (event.data?.source === 'MATILDE_EXTENSION' && event.data?.type === 'CAPTURED_DAE_PDF') {
    const { fileBase64, fileName, osId, placa, chassi } = event.data.payload;
    console.log('[Matilde] CAPTURED_DAE_PDF recebido:', { osId, placa, chassi });

    try {
        // Converte base64 → File
        const arr = fileBase64.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        const file = new File([u8arr], fileName || `decalque_${placa || Date.now()}.pdf`, { type: mime });

        // IA extrai dados do Decalque (somente página 1)
        const { extrairDecalqueChassi } = await import('./lib/atpveAI');
        const decalque = await extrairDecalqueChassi(file);

        if (osId) {
            // ── CENÁRIO A: OS já existe → validar e fazer upload ──
            const { getOrdem, updateOrdem, addAuditEntry } = await import('./lib/storage');
            const { uploadFileToSupabase } = await import('./lib/supabaseStorage');
            const os = await getOrdem(osId);

            if (!os) {
                alert(`❌ OS ${osId} não encontrada no CRM.`);
                return;
            }

            // Validação: compara campos críticos
            const divergencias: string[] = [];
            const norm = (s?: string) => (s || '').replace(/\D/g, '').toUpperCase();

            if (norm(decalque.placa) !== norm(os.veiculo?.placa))
                divergencias.push(`Placa: PDF="${decalque.placa}" | OS="${os.veiculo?.placa}"`);
            if (norm(decalque.chassi) !== norm(os.veiculo?.chassi))
                divergencias.push(`Chassi: PDF="${decalque.chassi}" | OS="${os.veiculo?.chassi}"`);
            if (norm(decalque.comprador?.cpfCnpj) !== norm(os.transferencia?.cpfCnpjComprador))
                divergencias.push(`CPF/CNPJ comprador: PDF="${decalque.comprador?.cpfCnpj}" | OS="${os.transferencia?.cpfCnpjComprador}"`);

            if (divergencias.length > 0) {
                alert(`⚠️ Decalque não confere com a OS:\n\n${divergencias.join('\n')}\n\nO PDF não foi salvo. Verifique os dados.`);
                return;
            }

            // Upload para Supabase
            const path = `ordens/${osId}/pdf_detran_${Date.now()}.pdf`;
            const publicUrl = await uploadFileToSupabase(file, path);
            await updateOrdem(osId, { pdfDetranUrl: publicUrl });
            await addAuditEntry(osId, 'PDF Detran Anexado', 'Decalque de Chassi capturado automaticamente pela extensão.');

            // Toast de sucesso (dispara CustomEvent que o CRM já escuta)
            window.dispatchEvent(new CustomEvent('MATILDE_TOAST', {
                detail: { message: '✅ Decalque de Chassi salvo automaticamente!', type: 'success' }
            }));

        } else {
            // ── CENÁRIO B: Sem OS → buscar cliente e abrir modal ──
            const { getClienteByCpfCnpj } = await import('./lib/storage');
            const clienteExistente = await getClienteByCpfCnpj(decalque.comprador?.cpfCnpj || '');

            const dadosIniciais: DadosIniciaisModal = {
                placa: decalque.placa,
                chassi: decalque.chassi,
                renavam: decalque.renavam,
                valorRecibo: decalque.valorRecibo,
                dataAquisicao: decalque.dataAquisicao,
                tipoCpfCnpjComprador: decalque.comprador?.tipoCpfCnpj,
                cpfCnpjComprador: decalque.comprador?.cpfCnpj,
                nomeComprador: clienteExistente?.nome || decalque.comprador?.nome,
                telefoneComprador: clienteExistente?.telefone || '',
                enderecoComprador: clienteExistente?.endereco || decalque.comprador?.endereco,
                numeroComprador: decalque.comprador?.numero,
                cepComprador: clienteExistente?.cep || decalque.comprador?.cep,
                bairroComprador: decalque.comprador?.bairro,
                municipioComprador: decalque.comprador?.municipio,
                ufComprador: decalque.comprador?.uf,
                tipoCpfCnpjVendedor: decalque.vendedor?.tipoCpfCnpj,
                cpfCnpjVendedor: decalque.vendedor?.cpfCnpj,
                marcaModelo: decalque.veiculo?.marcaModelo,
                anoFabricacao: decalque.veiculo?.anoFabricacao,
                anoModelo: decalque.veiculo?.anoModelo,
                cor: decalque.veiculo?.cor,
            };

            setDecalqueDadosIniciais(dadosIniciais);
            setDecalqueModalOpen(true);
        }

    } catch (err: any) {
        console.error('[Matilde] Erro ao processar CAPTURED_DAE_PDF:', err);
        alert(`❌ Erro ao processar Decalque de Chassi.\n\n${err?.message || err}`);
    }
}
```

- [ ] **Step 5: Verificar que `DadosIniciaisModal` está importado**

No topo de `App.tsx` adicionar ao import de ATPVeModal:

```typescript
import ATPVeModal, { type DadosIniciaisModal } from './components/ATPVeModal';
```

- [ ] **Step 6: Build para verificar erros TypeScript**

```bash
cd "/c/Users/pedro/Downloads/CRM-Despachante-Matilde-Teste-main (1)/CRM-Despachante-Matilde-Teste-main"
npm run build 2>&1 | tail -30
```

Esperado: build sem erros de TypeScript.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/ATPVeModal.tsx
git commit -m "feat: CAPTURED_DAE_PDF handler — Cenário A (upload auto) e Cenário B (modal pré-preenchido)"
```

---

## Checklist final

- [ ] `npm run build` sem erros
- [ ] Extensão recarregada no Chrome (`chrome://extensions` → Reload)
- [ ] Teste Cenário A: abrir OS existente, ir ao Detran, finalizar transferência → modal aparece → PDF salvo automaticamente no CRM
- [ ] Teste Cenário B: ir ao Detran sem OS → modal aparece → ATPVeModal abre com dados pré-preenchidos → confirmar → OS criada
- [ ] Teste de divergência: forçar CPF diferente → alerta exibe campos que divergem
- [ ] Teste serviço não elegível: ir ao Detran com `matilde_servico_ativo = 'licenciamento'` → modal ignorado

# Design: Modal Unificado de Nova OS + Fix Extensão Detran

**Data:** 2026-04-06  
**Status:** Aprovado

---

## Contexto

O CRM Matilde possui múltiplos modais separados para criação de OS (`PrimeiroEmplacamentoModal`, `ModalSegundaVia`, `ATPVeModal`, `OSCreateDrawer`), cada um com seu próprio fluxo e lógica duplicada. A extensão Chrome captura dados do Detran e abre cada modal separadamente.

Além disso, a captura de PDF no serviço de Primeiro Emplacamento não funciona (sem toast, sem reação).

---

## Objetivo

1. Criar um único `NovaOSModal` que substitui todos os modais de criação de OS
2. O modal aceita PDF/foto da folha de cadastro → IA extrai os dados automaticamente
3. Preenchimento manual disponível caso não tenha folha
4. CPF é sempre buscado no banco — se existir, pré-preenche os dados do cliente (editável)
5. A extensão dispara o mesmo modal para todos os serviços
6. Corrigir o bug de captura de PDF do Primeiro Emplacamento na extensão
7. Adicionar campos faltantes no banco de dados

---

## Arquitetura

### Novos arquivos
| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/components/NovaOSModal.tsx` | Modal unificado com 4 etapas |
| `src/hooks/useNovaOSModal.ts` | Hook para abrir/fechar o modal de qualquer página |
| `src/lib/cadastroAI.ts` | Função que recebe PDF/imagem e extrai dados com Gemini |
| `migrations/20260406000001_campos_cliente_veiculo.sql` | Novos campos no banco |

### Arquivos deletados
| Arquivo | Motivo |
|---------|--------|
| `src/components/OSCreateDrawer.tsx` | Substituído pelo NovaOSModal |
| `src/components/PrimeiroEmplacamentoModal.tsx` | Substituído pelo NovaOSModal |
| `src/components/ModalSegundaVia.tsx` | Substituído pelo NovaOSModal |
| `src/components/ATPVeModal.tsx` | Substituído pelo NovaOSModal |
| `src/pages/OSForm.tsx` | Lógica de criação migrada para NovaOSModal |

### Arquivos modificados
| Arquivo | O que muda |
|---------|-----------|
| `src/App.tsx` | Todos os handlers `CAPTURED_*` abrem o `NovaOSModal` ao invés de modais separados |
| `src/pages/OSList.tsx` | Botão "+ Nova OS" usa `useNovaOSModal` |
| `src/pages/ServicosDetran.tsx` | Botão "Acessar" define serviço ativo na extensão antes de abrir o Detran |
| `src/types.ts` | Novos campos em `Cliente` e `Veiculo` |
| `src/lib/database.ts` | `saveCliente` e `saveVeiculo` persistem novos campos |
| `chrome-extension/content_detran.js` | Fix nos seletores de Primeiro Emplacamento |

---

## Fluxo do Modal

### Etapa 1 — Upload / Câmera
- Usuário abre "+ Nova OS" → modal abre na etapa de upload
- Opções: arrastar PDF, selecionar arquivo, tirar foto (câmera), ou "Preencher manualmente"
- "Preencher manualmente" pula para Etapa 3 com todos os campos vazios

### Etapa 2 — Analisando (loading)
- IA (Gemini `gemini-1.5-flash`) recebe o arquivo e extrai:
  - Tipo de serviço (Primeiro Emplacamento, Transferência, 2ª Via, etc.)
  - Dados do cliente (nome, CPF, RG, endereço completo)
  - Dados do veículo (chassi, renavam, marca/modelo, ano, cor, combustível)
- Em paralelo: busca CPF no banco de dados
- Se CPF encontrado: mescla dados do banco com os da IA (IA pode ter campos mais atualizados)

### Etapa 3 — Revisão e edição
Formulário completo e editável dividido em seções:

**Serviço:**
- Tipo de serviço (select)
- Tipo de veículo (carro/moto)
- Troca de placa (toggle)

**Cliente:**
- Nome, CPF/CNPJ, Tipo (PF/PJ)
- RG, Órgão Expedidor, UF Documento
- Telefone, Email
- Endereço: CEP, Rua, Número, Complemento, Bairro, Município, UF
- Badge `"Cliente existente"` se CPF já estava no banco

**Veículo:**
- Placa, Chassi, Renavam
- Marca/Modelo, Ano Fabricação, Ano Modelo
- Cor, Combustível, Categoria
- Data de Aquisição

### Etapa 4 — Salvando → Sucesso
- Salva Cliente (novo ou atualiza existente)
- Salva Veículo (novo ou atualiza existente)
- Cria OS com checklist dinâmico baseado no tipo de serviço
- Exibe OS #XXX criada com botão "Ver OS" e "Fechar"

---

## Integração com ServicosDetran

Quando o usuário clica em "Acessar" em qualquer serviço da página `ServicosDetran`:

1. CRM envia `postMessage` com `{ source: 'MATILDE_CRM_PAGE', action: 'DEFINIR_SERVICO', servico: service.id }`
2. `crm-content.js` repassa para o `background.js` via `chrome.runtime.sendMessage`
3. `background.js` salva `matilde_servico_ativo` no `chrome.storage.local`
4. CRM abre o URL do Detran em nova aba (`window.open`)
5. Extensão já sabe qual serviço está em andamento e captura os dados corretos

**Resultado:** quando o usuário termina no Detran e a extensão captura os dados, ela já sabe qual serviço era → envia para o CRM → `NovaOSModal` abre com campos pré-preenchidos.

---

## Integração com a Extensão

### Fluxo atual (fragmentado)
Cada evento da extensão abre um modal diferente:
- `CAPTURED_PRIMEIRO_EMPLACAMENTO` → `PrimeiroEmplacamentoModal`
- `CAPTURED_SEGUNDA_VIA` → `ModalSegundaVia`
- `CAPTURED_DAE_PDF` → lógica inline no App.tsx
- etc.

### Fluxo novo (unificado)
Todos os eventos `CAPTURED_*` no `App.tsx` chamam `openNovaOSModal(dadosIniciais)`.

Os dados da extensão chegam como `dadosIniciais` pré-preenchidos → modal abre direto na **Etapa 3** (pula upload/análise).

Se o evento incluir `fileBase64` (PDF capturado) → roda IA em background e atualiza campos que estiverem vazios.

---

## Migração do Banco de Dados

```sql
-- Novos campos em clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS rg TEXT,
  ADD COLUMN IF NOT EXISTS orgao_expedidor TEXT,
  ADD COLUMN IF NOT EXISTS uf_documento TEXT,
  ADD COLUMN IF NOT EXISTS endereco TEXT,
  ADD COLUMN IF NOT EXISTS numero TEXT,
  ADD COLUMN IF NOT EXISTS complemento TEXT,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS uf TEXT;

-- Novos campos em veiculos
ALTER TABLE veiculos
  ADD COLUMN IF NOT EXISTS ano_fabricacao TEXT,
  ADD COLUMN IF NOT EXISTS ano_modelo TEXT,
  ADD COLUMN IF NOT EXISTS cor TEXT,
  ADD COLUMN IF NOT EXISTS combustivel TEXT;
```

Todos os campos são `nullable` — sem impacto em registros existentes.

---

## Fix da Extensão — Primeiro Emplacamento

### Problema
Ao navegar pelas páginas do Primeiro Emplacamento no Detran, nenhum toast aparece e o CRM não é acionado. O listener de submit/click provavelmente não está encontrando o formulário/botão correto.

### Fix
1. Adicionar log imediato em cada função `tentarCapturar*` para confirmar qual URL está sendo detectada
2. Verificar se os seletores `#form-emitir-ficha-de-cadastro-e-dae` e `.btn-ok-modal-2` existem na página atual
3. Corrigir seletores se necessário com base no HTML real da página
4. Garantir que o toast de "carregando" apareça **antes** do fetch, não depois

---

## `cadastroAI.ts` — Interface

```typescript
export interface DadosFolhaCadastro {
  tipoServico: string;
  cliente: {
    nome: string;
    cpfCnpj: string;
    tipoCpfCnpj: 'CPF' | 'CNPJ';
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
  };
  veiculo: {
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
  };
}

export async function analisarFolhaCadastro(
  file: File | string // File ou base64
): Promise<DadosFolhaCadastro>
```

---

## Critérios de Sucesso

- [ ] Botão "+ Nova OS" abre `NovaOSModal` em todas as telas
- [ ] Upload de PDF + análise IA preenche todos os campos corretamente
- [ ] Câmera funciona em dispositivos com câmera disponível
- [ ] CPF existente no banco é detectado e campos pré-preenchidos (editáveis)
- [ ] Extensão dispara o modal para Primeiro Emplacamento com dados pré-preenchidos
- [ ] PDF de Primeiro Emplacamento é capturado (toast aparece no Detran)
- [ ] OS criada com sucesso — cliente, veículo e checklist corretos
- [ ] Campos novos (endereço, RG, ano, cor, combustível) são salvos no banco
- [ ] Botão "Acessar" em ServicosDetran define serviço ativo na extensão antes de abrir o Detran
- [ ] Modais antigos removidos sem erros de compilação

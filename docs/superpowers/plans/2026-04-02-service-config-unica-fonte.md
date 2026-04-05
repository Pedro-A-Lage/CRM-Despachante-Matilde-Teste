# service_config como Única Fonte de Verdade — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar todas as fontes hardcoded (TIPO_SERVICO_LABELS, CUSTO_MATRIX, gerarChecklist sync) e fazer com que service_config seja a ÚNICA fonte de verdade para tipos de serviço, nomes, documentos necessários e regras de cobrança. Garantir que TODOS os caminhos de criação de OS (OSForm, ATPVeModal, PrimeiroEmplacamentoModal) gerem cobranças e definam preços corretamente.

**Architecture:** O configService.ts já expõe `getAllServiceConfigs()` e `getServiceLabels()`. Vamos (1) mudar `TipoServico` de union type para `string`, (2) criar um hook `useServiceLabels()` que todos os componentes usarão, (3) remover toda lógica hardcoded, (4) criar `finalizarOS()` para unificar pós-criação, (5) corrigir bugs financeiros.

**Tech Stack:** React 18, TypeScript, Supabase, Vite

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/types.ts` | Mudar TipoServico para string, remover TIPO_SERVICO_LABELS |
| Create | `src/hooks/useServiceLabels.ts` | Hook React que carrega labels do service_config com cache |
| Modify | `src/lib/configService.ts` | Adicionar `getActiveServiceTypes()` |
| Create | `src/lib/osService.ts` | Função `finalizarOS()` compartilhada entre todos os modais |
| Modify | `src/lib/financeService.ts` | Remover CUSTO_MATRIX, corrigir getRelatorio datas |
| Modify | `src/lib/checklistTemplates.ts` | Remover gerarChecklist sync, simplificar para apenas async |
| Modify | `src/components/ATPVeModal.tsx` | Usar finalizarOS() |
| Modify | `src/components/PrimeiroEmplacamentoModal.tsx` | Usar finalizarOS() |
| Modify | `src/pages/OSForm.tsx` | Usar finalizarOS(), remover TIPO_SERVICO_LABELS |
| Modify | 10 arquivos de páginas/componentes | Substituir TIPO_SERVICO_LABELS por useServiceLabels() |

---

### Task 1: Mudar TipoServico para string e remover TIPO_SERVICO_LABELS

**Files:**
- Modify: `src/types.ts:58-67` (TipoServico union → string)
- Modify: `src/types.ts:289-299` (remover TIPO_SERVICO_LABELS)

- [ ] **Step 1: Alterar TipoServico de union para string**

Em `src/types.ts`, substituir linhas 58-67:

```typescript
// ANTES:
export type TipoServico =
    | 'transferencia'
    | 'alteracao_dados'
    | 'segunda_via'
    | 'mudanca_caracteristica'
    | 'mudanca_categoria'
    | 'baixa'
    | 'primeiro_emplacamento'
    | 'vistoria_lacrada'
    | 'baixa_impedimento';

// DEPOIS:
export type TipoServico = string;
```

- [ ] **Step 2: Remover TIPO_SERVICO_LABELS**

Em `src/types.ts`, substituir linhas 288-299:

```typescript
// ANTES:
// --- LABELS ---
export const TIPO_SERVICO_LABELS: Record<TipoServico, string> = {
    transferencia: 'Transferência de Propriedade',
    // ...9 entries
};

// DEPOIS:
// TIPO_SERVICO_LABELS removido — usar useServiceLabels() ou getServiceLabels() de configService.ts
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Erros de referência a TIPO_SERVICO_LABELS em ~11 arquivos (esperado, serão corrigidos nas Tasks seguintes)

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "refactor: change TipoServico to string, remove hardcoded TIPO_SERVICO_LABELS"
```

---

### Task 2: Criar hook useServiceLabels e helper getActiveServiceTypes

**Files:**
- Create: `src/hooks/useServiceLabels.ts`
- Modify: `src/lib/configService.ts`

- [ ] **Step 1: Adicionar getActiveServiceTypes ao configService**

Adicionar ao final de `src/lib/configService.ts`:

```typescript
/**
 * Retorna lista de tipo_servico ativos para dropdowns.
 * Cada item tem { value, label } pronto para uso em <select>.
 */
export async function getActiveServiceTypes(): Promise<{ value: string; label: string }[]> {
  const configs = await getAllServiceConfigs();
  return configs
    .filter(c => c.ativo)
    .map(c => ({ value: c.tipo_servico, label: c.nome_exibicao }));
}
```

- [ ] **Step 2: Criar src/hooks/useServiceLabels.ts**

```typescript
import { useState, useEffect } from 'react';
import { getServiceLabels } from '../lib/configService';

// Cache global em memória para evitar flash de labels vazios entre navegações
let cachedLabels: Record<string, string> | null = null;

/**
 * Hook que retorna os labels de serviço do service_config.
 * Carrega assíncronamente, retorna cache enquanto atualiza.
 */
export function useServiceLabels(): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>(cachedLabels ?? {});

  useEffect(() => {
    let cancelled = false;
    getServiceLabels()
      .then(result => {
        if (!cancelled) {
          cachedLabels = result;
          setLabels(result);
        }
      })
      .catch(err => console.error('Erro ao carregar labels de serviço:', err));
    return () => { cancelled = true; };
  }, []);

  return labels;
}

/**
 * Traduz tipo_servico para nome de exibição.
 * Fallback: retorna o próprio tipo_servico formatado.
 */
export function getServicoLabel(labels: Record<string, string>, tipo: string): string {
  return labels[tipo] ?? tipo.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useServiceLabels.ts src/lib/configService.ts
git commit -m "feat: add useServiceLabels hook and getActiveServiceTypes helper"
```

---

### Task 3: Substituir TIPO_SERVICO_LABELS em todos os componentes

**Files (todos modify):**
- `src/components/OSKanban.tsx`
- `src/pages/ConsultaProcessos.tsx`
- `src/pages/ClienteDetail.tsx`
- `src/pages/OSDetail.tsx`
- `src/pages/Financeiro.tsx`
- `src/pages/OSList.tsx`
- `src/pages/ProtocoloDiario.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/ControlePagamentos.tsx`
- `src/pages/VeiculoForm.tsx`
- `src/pages/OSForm.tsx`

Para CADA arquivo, aplicar o mesmo padrão:

- [ ] **Step 1: Padrão de substituição**

Em cada arquivo:

1. **Remover** o import de `TIPO_SERVICO_LABELS` de `'../types'` (ou `'../../types'`)
2. **Adicionar** import do hook:
   ```typescript
   import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
   ```
3. **Adicionar** dentro do componente funcional:
   ```typescript
   const serviceLabels = useServiceLabels();
   ```
4. **Substituir** cada uso de `TIPO_SERVICO_LABELS[x]` por `getServicoLabel(serviceLabels, x)`

Exemplo padrão — `src/components/OSKanban.tsx`:

```typescript
// ANTES (linha 7):
import { TIPO_SERVICO_LABELS, ... } from '../types';
// ... linha 588:
TIPO_SERVICO_LABELS[os.tipoServico as keyof typeof TIPO_SERVICO_LABELS]

// DEPOIS (linha 7):
import { ... } from '../types'; // removido TIPO_SERVICO_LABELS
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
// ... dentro do componente:
const serviceLabels = useServiceLabels();
// ... linha 588:
getServicoLabel(serviceLabels, os.tipoServico)
```

- [ ] **Step 2: Aplicar em OSKanban.tsx**
- [ ] **Step 3: Aplicar em ConsultaProcessos.tsx**
- [ ] **Step 4: Aplicar em ClienteDetail.tsx**
- [ ] **Step 5: Aplicar em OSDetail.tsx** (3 usos: linhas ~768, ~956, ~2635)
- [ ] **Step 6: Aplicar em Financeiro.tsx** (2 usos: linhas ~105, ~337)
- [ ] **Step 7: Aplicar em OSList.tsx** (4 usos: linhas ~184, ~185, ~496, ~659)
- [ ] **Step 8: Aplicar em ProtocoloDiario.tsx** (4 usos: linhas ~188, ~464, ~571, ~620)
- [ ] **Step 9: Aplicar em Dashboard.tsx** (1 uso: linha ~836)
- [ ] **Step 10: Aplicar em ControlePagamentos.tsx** (1 uso: linha ~298)
- [ ] **Step 11: Aplicar em VeiculoForm.tsx** (1 uso: linha ~429)
- [ ] **Step 12: Atualizar OSForm.tsx** — já usa `getServiceLabels()` inline (linhas 69-82). Remover import de TIPO_SERVICO_LABELS e usar o hook em vez do useEffect manual:

```typescript
// ANTES (OSForm.tsx linhas 11, 62, 68-83):
import { getServiceLabels } from '../lib/configService';
const [serviceLabels, setServiceLabels] = useState<Record<string, string>>({...TIPO_SERVICO_LABELS});
useEffect(() => { getServiceLabels().then(...) }, []);

// DEPOIS:
import { useServiceLabels } from '../hooks/useServiceLabels';
const serviceLabels = useServiceLabels();
// remover o useEffect de getServiceLabels() e o useState de serviceLabels
```

- [ ] **Step 13: Verificar compilação**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: Sem erros de TIPO_SERVICO_LABELS

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "refactor: replace all TIPO_SERVICO_LABELS with useServiceLabels hook"
```

---

### Task 4: Remover CUSTO_MATRIX e fallback hardcoded

**Files:**
- Modify: `src/lib/financeService.ts:175-188` (remover CUSTO_MATRIX)
- Modify: `src/lib/financeService.ts:190-192` (remover tipo TipoServico do param, usar string)

- [ ] **Step 1: Remover CUSTO_MATRIX**

Em `src/lib/financeService.ts`, deletar linhas 175-188 (o bloco inteiro de CUSTO_MATRIX):

```typescript
// DELETAR TUDO ISTO:
// ── MATRIZ DE CUSTOS POR TIPO DE SERVIÇO ─────────────────────
// Define quais custos são gerados automaticamente para cada tipo de serviço.

const CUSTO_MATRIX: Record<TipoServico, { ... }> = {
  transferencia: { ... },
  ...
};
```

- [ ] **Step 2: Simplificar gerarCobrancasIniciais — remover import de TipoServico**

Mudar a assinatura de `gerarCobrancasIniciais`:

```typescript
// ANTES:
export async function gerarCobrancasIniciais(
  osId: string,
  tipoServico: TipoServico,
  tipoVeiculo: TipoVeiculo,
  trocaPlaca: boolean,
  forceRegenerate = false,
): Promise<void> {

// DEPOIS:
export async function gerarCobrancasIniciais(
  osId: string,
  tipoServico: string,
  tipoVeiculo: TipoVeiculo,
  trocaPlaca: boolean,
  forceRegenerate = false,
): Promise<void> {
```

A lógica interna JÁ lê de service_config (linhas 200-220). Apenas remover o comentário "fall back to hardcoded matrix" na linha 197.

- [ ] **Step 3: Remover import de TipoServico se não usado em mais nada**

Verificar se `TipoServico` ainda é necessário em financeService.ts. Se não, remover da linha de import.

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: Sem erros

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeService.ts
git commit -m "refactor: remove hardcoded CUSTO_MATRIX, service_config is sole source"
```

---

### Task 5: Remover gerarChecklist hardcoded, simplificar checklistTemplates

**Files:**
- Modify: `src/lib/checklistTemplates.ts`

- [ ] **Step 1: Simplificar o arquivo inteiro**

Substituir TODO o conteúdo de `src/lib/checklistTemplates.ts` por:

```typescript
// ============================================
// CHECKLIST TEMPLATES
// Gera checklists a partir do service_config (Supabase)
// ============================================
import type { ChecklistItem, TipoCliente } from '../types';
import { gerarChecklistDinamico } from './configService';

/**
 * Gera checklist de documentos necessários para um tipo de serviço.
 * Busca configuração do service_config no Supabase.
 * Lança erro se o serviço não estiver configurado.
 */
export async function gerarChecklistAsync(
    tipoServico: string,
    tipoCliente: TipoCliente,
    cpfVendedor?: string
): Promise<ChecklistItem[]> {
    const items = await gerarChecklistDinamico(tipoServico, tipoCliente, cpfVendedor);
    return items as ChecklistItem[];
}
```

- [ ] **Step 2: Verificar se VeiculoForm.tsx usa gerarChecklist sync**

VeiculoForm.tsx:463 usa `gerarChecklist()` (sync). Mudar para `gerarChecklistAsync()`:

Em `src/pages/VeiculoForm.tsx`:
```typescript
// ANTES:
import { gerarChecklist, gerarChecklistAsync } from '../lib/checklistTemplates';
// ... linha 463:
{gerarChecklist(tipoServico, selectedCliente.tipo).map((item) => (

// DEPOIS:
import { gerarChecklistAsync } from '../lib/checklistTemplates';
// A chamada sync no render precisa ser movida para um useEffect/state.
// Adicionar state:
const [checklistPreview, setChecklistPreview] = useState<ChecklistItem[]>([]);
useEffect(() => {
    if (tipoServico && selectedCliente?.tipo) {
        gerarChecklistAsync(tipoServico, selectedCliente.tipo)
            .then(setChecklistPreview)
            .catch(() => setChecklistPreview([]));
    }
}, [tipoServico, selectedCliente?.tipo]);
// ... linha 463:
{checklistPreview.map((item) => (
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: Sem erros

- [ ] **Step 4: Commit**

```bash
git add src/lib/checklistTemplates.ts src/pages/VeiculoForm.tsx
git commit -m "refactor: remove hardcoded checklist, service_config is sole source"
```

---

### Task 6: Criar finalizarOS() — lógica pós-criação compartilhada

**Files:**
- Create: `src/lib/osService.ts`

- [ ] **Step 1: Criar src/lib/osService.ts**

```typescript
// src/lib/osService.ts
// Lógica compartilhada de pós-criação de OS
// Chamada por OSForm, ATPVeModal e PrimeiroEmplacamentoModal

import { getServicePrice, gerarCobrancasIniciais } from './financeService';
import { updateOrdem } from './database';
import type { TipoVeiculo } from '../types/finance';

/**
 * Finaliza uma OS recém-criada:
 * 1. Busca o preço do serviço na tabela service_prices
 * 2. Atualiza a OS com valorServico e tipoVeiculo
 * 3. Gera cobranças automáticas (DAE, vistoria, placa) baseado no service_config
 *
 * Deve ser chamada após saveOrdem() em TODOS os caminhos de criação de OS.
 */
export async function finalizarOS(
  osId: string,
  tipoServico: string,
  tipoVeiculo: TipoVeiculo,
  trocaPlaca: boolean,
): Promise<{ valorServico: number }> {
  // 1. Buscar preço do serviço
  let valorServico = 0;
  try {
    valorServico = await getServicePrice(tipoServico, tipoVeiculo, trocaPlaca);
  } catch (err) {
    console.warn(`Preço não encontrado para ${tipoServico}/${tipoVeiculo}/placa=${trocaPlaca}:`, err);
  }

  // 2. Atualizar OS com preço e tipo de veículo
  await updateOrdem(osId, {
    valorServico,
    tipoVeiculo,
  });

  // 3. Gerar cobranças automáticas
  await gerarCobrancasIniciais(osId, tipoServico, tipoVeiculo, trocaPlaca);

  return { valorServico };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/osService.ts
git commit -m "feat: create finalizarOS shared post-creation logic"
```

---

### Task 7: Integrar finalizarOS nos 3 caminhos de criação

**Files:**
- Modify: `src/components/ATPVeModal.tsx:363-388`
- Modify: `src/components/PrimeiroEmplacamentoModal.tsx:253-261`
- Modify: `src/pages/OSForm.tsx:557-577`

- [ ] **Step 1: ATPVeModal — adicionar finalizarOS após saveOrdem**

Em `src/components/ATPVeModal.tsx`, após a linha `const novaOrdem = await saveOrdem({...})` (linha ~388):

```typescript
// Adicionar import no topo:
import { finalizarOS } from '../lib/osService';

// Após saveOrdem (depois da linha ~388, antes de setOsId):
try {
    await finalizarOS(novaOrdem.id, tipoServico, 'carro', false);
} catch (err) {
    console.warn('Cobranças automáticas não geradas:', err);
}
```

- [ ] **Step 2: PrimeiroEmplacamentoModal — adicionar finalizarOS após saveOrdem**

Em `src/components/PrimeiroEmplacamentoModal.tsx`, após `const novaOS = await saveOrdem({...})` (linha ~261):

```typescript
// Adicionar import no topo:
import { finalizarOS } from '../lib/osService';

// Após saveOrdem (depois da linha ~263, antes de window.postMessage):
try {
    const tv = (tipoVeiculo === 'motocicleta' ? 'moto' : 'carro') as import('../types/finance').TipoVeiculo;
    await finalizarOS(novaOS.id, 'primeiro_emplacamento', tv, true);
} catch (err) {
    console.warn('Cobranças automáticas não geradas:', err);
}
```

- [ ] **Step 3: OSForm — substituir lógica inline por finalizarOS**

Em `src/pages/OSForm.tsx`, substituir linhas ~557-577:

```typescript
// ANTES:
const valorServico = await getServicePrice(tipoServico, tipoVeiculo, trocaPlaca);
const os = await saveOrdem({
    clienteId, veiculoId, tipoServico, trocaPlaca,
    tipoVeiculo, valorServico,
    checklist, status: 'aguardando_documentacao',
    pdfDetranUrl: ..., pdfDetranName: ...
});
try {
    await gerarCobrancasIniciais(os.id, tipoServico as TipoServico, tipoVeiculo, trocaPlaca);
} catch (err) { ... }

// DEPOIS:
import { finalizarOS } from '../lib/osService';
// ...
const os = await saveOrdem({
    clienteId, veiculoId, tipoServico, trocaPlaca,
    checklist, status: 'aguardando_documentacao',
    pdfDetranUrl: extensionPdfUrl || pendingPdfData?.pdfUrl,
    pdfDetranName: extensionPdfName || pendingPdfData?.pdfName,
});
try {
    await finalizarOS(os.id, tipoServico, tipoVeiculo, trocaPlaca);
} catch (err) {
    console.warn('Cobranças/preço não gerados:', err);
}
```

Remover imports não mais necessários: `getServicePrice`, `gerarCobrancasIniciais`.

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: Sem erros

- [ ] **Step 5: Commit**

```bash
git add src/components/ATPVeModal.tsx src/components/PrimeiroEmplacamentoModal.tsx src/pages/OSForm.tsx
git commit -m "feat: integrate finalizarOS in all OS creation paths"
```

---

### Task 8: Corrigir filtro de datas no relatório financeiro

**Files:**
- Modify: `src/lib/financeService.ts:449-464` (getRelatorio)

- [ ] **Step 1: Corrigir filtro de charges**

Em `src/lib/financeService.ts`, função `getRelatorio()`, substituir o bloco de charges (linhas ~449-456):

```typescript
// ANTES:
const { data: chargesData } = await supabase
    .from('finance_charges')
    .select('valor_previsto')
    .in('os_id', osIds)
    .gte('criado_em', `${inicio}T00:00:00`)
    .lte('criado_em', `${fim}T23:59:59`)
    .neq('status', 'cancelado');
const totalCustos = (chargesData ?? []).reduce((s, c: any) => s + Number(c.valor_previsto), 0);

// DEPOIS:
const { data: chargesData } = await supabase
    .from('finance_charges')
    .select('valor_previsto, valor_pago, status, confirmado_em')
    .in('os_id', osIds)
    .neq('status', 'cancelado');
// Custos = soma de valor_pago das charges confirmadas no período
const totalCustos = (chargesData ?? []).reduce((s, c: any) => {
    if (c.status === 'pago' && c.confirmado_em) {
        const dt = c.confirmado_em.split('T')[0];
        if (dt >= inicio && dt <= fim) return s + Number(c.valor_pago);
    }
    return s + Number(c.valor_previsto); // pendentes contam como previsto
}, 0);
```

- [ ] **Step 2: Corrigir filtro de payments**

Substituir o bloco de payments (linhas ~458-464):

```typescript
// ANTES:
const { data: paymentsData } = await supabase
    .from('payments')
    .select('valor')
    .in('os_id', osIds)
    .gte('criado_em', `${inicio}T00:00:00`)
    .lte('criado_em', `${fim}T23:59:59`);
const totalRecebido = (paymentsData ?? []).reduce((s, p: any) => s + Number(p.valor), 0);

// DEPOIS:
const { data: paymentsData } = await supabase
    .from('payments')
    .select('valor, data_pagamento')
    .in('os_id', osIds)
    .gte('data_pagamento', inicio)
    .lte('data_pagamento', fim);
const totalRecebido = (paymentsData ?? []).reduce((s, p: any) => s + Number(p.valor), 0);
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: Sem erros

- [ ] **Step 4: Commit**

```bash
git add src/lib/financeService.ts
git commit -m "fix: use data_pagamento and confirmado_em for financial report filtering"
```

---

### Task 9: Build final e verificação

**Files:** Nenhum novo — apenas verificação.

- [ ] **Step 1: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: Sem erros

- [ ] **Step 2: Verificar Build Vite**

Run: `npm run build 2>&1 | tail -10`
Expected: `✓ built in Xs` — sem erros, apenas warnings de chunk size

- [ ] **Step 3: Commit final se houver ajustes**

```bash
git add -A
git commit -m "chore: final build verification after service_config refactor"
```

---

## Resumo do que foi eliminado

| Antes | Depois |
|-------|--------|
| `TipoServico` = union de 9 strings fixas | `TipoServico` = `string` (dinâmico) |
| `TIPO_SERVICO_LABELS` hardcoded em types.ts | `useServiceLabels()` hook que lê de service_config |
| `CUSTO_MATRIX` hardcoded em financeService.ts | `service_config.dae_tipo/gera_vistoria/gera_placa` |
| `gerarChecklist()` sync hardcoded | Removido — `gerarChecklistAsync()` lê de service_config |
| ATPVeModal sem cobranças nem preço | `finalizarOS()` gera tudo |
| PrimeiroEmplacamento sem cobranças nem preço | `finalizarOS()` gera tudo |
| Relatório filtra por criado_em | Filtra por data_pagamento/confirmado_em |

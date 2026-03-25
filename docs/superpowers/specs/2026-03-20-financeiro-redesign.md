# Redesign UX Módulo Financeiro

## Problema

O módulo financeiro atual trata o despachante como se ele gerenciasse taxas individuais manualmente. Na realidade:

1. O cliente paga um **valor único pelo serviço** (ex: R$780 por transferência carro com placa)
2. O despachante paga os **custos** (DAE, vistoria, placa) com esse dinheiro
3. O que **sobra é o honorário** (lucro)

O "Adicionar Nova Taxa" é confuso porque taxas são pré-definidas. O fluxo de pagamento vinculado a cobranças individuais não reflete a realidade.

## Objetivo

Redesenhar o painel financeiro da OS para refletir o fluxo real: **valor cobrado → recebimentos do cliente → custos do serviço → honorário**.

## Dados de Negócio

### Tabela de Preços do Serviço (valor cobrado ao cliente)

| Serviço | Carro | Moto |
|---------|-------|------|
| Transferência sem placa | R$450 | R$450 |
| Transferência com placa/emplacamento | R$780 | R$680 |
| Segunda Via | R$450 | R$450 |
| Baixa de Veículo | R$450 | — |
| Alteração com placa | R$580 | R$480 |
| Alteração sem placa | R$380 | R$380 |
| Emissão de ATPV-e | R$50 | R$50 |

### Custos fixos (taxas que o despachante paga)

- DAE Principal: R$150,54
- Vistoria ECV: R$133,17
- Placa Mercosul (par carro): variável
- Placa Mercosul (moto): variável

### Matriz de Custos por Tipo de Serviço

Quais custos são gerados automaticamente ao criar a OS:

| Serviço | DAE | Vistoria | Placa (se trocaPlaca) |
|---------|-----|----------|-----------------------|
| transferencia | ✅ | ✅ | ✅ |
| primeiro_emplacamento | ✅ | ✅ | ✅ |
| segunda_via | ✅ | ✅ | ❌ |
| alteracao_dados | ✅ | ✅ (se trocaPlaca) | ✅ (se trocaPlaca) |
| baixa | ✅ | ✅ | ❌ |
| mudanca_caracteristica | ✅ | ✅ | ❌ |
| mudanca_categoria | ✅ | ✅ | ❌ |
| vistoria_lacrada | ✅ | ✅ | ❌ |
| baixa_impedimento | ✅ | ❌ | ❌ |

**Regra:** `trocaPlaca` na OS mapeia diretamente para `com_placa` na `service_prices`.

## Mudanças no Modelo de Dados

### 1. Novo campo na OS: `tipo_veiculo`

```typescript
export type TipoVeiculo = 'carro' | 'moto';

// Adicionar a OrdemDeServico:
tipoVeiculo: TipoVeiculo;
```

- Campo obrigatório no formulário de criação de OS
- Necessário para puxar preço correto da tabela

### 2. Nova tabela: `service_prices` (preço cobrado ao cliente)

```sql
CREATE TABLE service_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_servico TEXT NOT NULL,        -- 'transferencia', 'segunda_via', etc.
  tipo_veiculo TEXT NOT NULL,        -- 'carro' | 'moto'
  com_placa BOOLEAN NOT NULL DEFAULT false,
  valor NUMERIC(10,2) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tipo_servico, tipo_veiculo, com_placa)
);
```

Pré-populada com os valores da tabela do despachante.

### 3. Novo campo em `finance_charges`: `tipo` (custo vs recebimento)

Atualmente `finance_charges` guarda apenas custos. Vamos manter assim — recebimentos do cliente ficam na tabela `payments` (que já existe).

**Mudança:** `payments.charge_id` passa a ser **opcional** (já é). Pagamentos do cliente NÃO são vinculados a uma cobrança específica — são recebimentos gerais da OS.

### 4. Novo campo na OS: `valor_servico`

```typescript
// Adicionar a OrdemDeServico:
valorServico: number;  // valor cobrado ao cliente (editável, pré-preenchido da tabela)
```

Pré-preenchido da `service_prices` mas editável (para ajustes por cliente).

**Mapeamento camelCase ↔ snake_case:** O projeto usa camelCase nos tipos TypeScript e snake_case no banco. O `storage.ts` (ou equivalente) já faz esse mapeamento manual para `OrdemDeServico`. Os novos campos seguem o mesmo padrão: `tipoVeiculo` (TS) ↔ `tipo_veiculo` (DB), `valorServico` (TS) ↔ `valor_servico` (DB).

### 5. Tipo TypeScript `ServicePrice`

```typescript
export interface ServicePrice {
  id: string;
  tipo_servico: string;
  tipo_veiculo: TipoVeiculo;
  com_placa: boolean;
  valor: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}
```

### 6. Novo `FinanceResumo` (pós-redesign)

```typescript
export interface FinanceResumo {
  valorServico: number;       // valor cobrado ao cliente
  totalRecebido: number;      // soma dos payments
  faltaReceber: number;       // valorServico - totalRecebido
  totalCustos: number;        // soma dos finance_charges ativos
  honorario: number;          // valorServico - totalCustos
  statusRecebimento: 'pago' | 'parcial' | 'pendente';
}
```

### 7. Assinatura atualizada de `gerarCobrancasIniciais()`

```typescript
export async function gerarCobrancasIniciais(
  osId: string,
  tipoServico: TipoServico,
  tipoVeiculo: TipoVeiculo,  // NOVO
  trocaPlaca: boolean,
  temVistoria: boolean,
): Promise<void>
```

A lógica interna usa `tipoVeiculo` para buscar o preço correto da placa (carro vs moto).

### 8. Props atualizadas do `FinancePainel`

```typescript
interface Props {
  osId: string;
  valorServico: number;  // NOVO - vem da OS
  readOnly?: boolean;
  onValorServicoChange?: (novoValor: number) => void;  // NOVO - callback para edição inline
}
```

### 9. Botão "Pagar" nos custos

Clicar "Pagar" em um custo faz: `valor_pago = valor_previsto` e `status = 'pago'` atomicamente. Sem modal, sem valor parcial. Custos são pagos inteiros (o despachante paga a taxa completa ao Detran/ECV).

## Redesign dos Componentes

### FinancePainel.tsx (reescrita completa)

Layout em 3 seções verticais:

#### Seção 1: Resumo do Serviço (card destaque)

```
┌─────────────────────────────────────────────────────┐
│  Valor do Serviço: R$780,00          [Editar valor] │
│                                                     │
│  ██████████░░░░░░  64% recebido                     │
│                                                     │
│  Recebido: R$500,00    Falta: R$280,00              │
│                                                     │
│          [💰 Registrar Recebimento]                 │
└─────────────────────────────────────────────────────┘
```

- Barra de progresso visual (verde = recebido, cinza = falta)
- Botão principal grande para registrar recebimento
- Valor do serviço editável inline (clica, muda, salva)

#### Seção 2: Custos do Serviço (lista simples)

```
Custos do Serviço
┌──────────────────────────────────────────────────────┐
│  DAE Principal       R$150,54    ⏳ Pendente  [Pagar]│
│  Vistoria ECV        R$133,17    ✅ Pago             │
│  Placa Mercosul      R$130,00    ⏳ Pendente  [Pagar]│
├──────────────────────────────────────────────────────┤
│  Total Custos: R$413,71                              │
│                            + Custo adicional (link)  │
└──────────────────────────────────────────────────────┘
```

- Auto-gerados ao criar OS (baseado em tipo_servico + tipo_veiculo + trocaPlaca)
- Cada custo tem botão "Pagar" que só marca como pago (sem modal complexo)
- "+ Custo adicional" discreto no final (para casos raros)

#### Seção 3: Resultado

```
┌─────────────────────────────────────────────────────┐
│  Honorário Estimado                                 │
│  = R$780,00 (serviço) − R$413,71 (custos)          │
│  = R$366,29                                         │
└─────────────────────────────────────────────────────┘
```

#### Seção 4: Histórico de Recebimentos (colapsável)

```
▼ Recebimentos (3)
┌──────────────────────────────────────────────────────┐
│  15/03/2026   R$300,00   PIX   Nubank       [Remover]│
│  18/03/2026   R$200,00   Din.  —            [Remover]│
└──────────────────────────────────────────────────────┘
```

### RecebimentoModal.tsx (substitui PaymentModal)

Modal simplificado para registrar recebimento do cliente:

- **Valor** (pré-preenchido com saldo restante)
- **Data** (default: hoje)
- **Método** (PIX, Dinheiro, Cartão, TED, Boleto)
- **Instituição** (opcional)
- **Observação** (opcional)

NÃO pede vinculação a cobrança. É simplesmente: "o cliente me pagou X".

### AddChargeModal.tsx → CustoAdicionalModal.tsx

Renomeado e simplificado. Só aparece ao clicar "+ Custo adicional":
- Descrição
- Valor
- Sem campo de categoria complexo — categoria padrão "outro"

### OSForm.tsx

- Adicionar campo **Tipo Veículo** (Carro/Moto) — radio buttons
- Ao criar OS: puxar `valor_servico` da tabela `service_prices`
- `gerarCobrancasIniciais()` já gera custos automáticos (manter)

### Página /financeiro (relatório global)

Ajustar para o novo modelo:
- **Receita**: soma de `valor_servico` de todas as OS
- **Custos**: soma dos `finance_charges`
- **Honorários**: receita − custos
- **Recebimentos**: soma dos `payments`
- **A Receber**: receita − recebimentos

Query principal (pseudocode):
```sql
SELECT
  SUM(os.valor_servico) as receita,
  SUM(fc.valor_previsto) as custos,
  SUM(p.valor) as recebimentos
FROM ordens_servico os
LEFT JOIN finance_charges fc ON fc.os_id = os.id AND fc.status != 'cancelado'
LEFT JOIN payments p ON p.os_id = os.id
WHERE os.criado_em BETWEEN inicio AND fim
```

## Ordem de Implementação

1. **Migration SQL** — criar tabela `service_prices`, adicionar colunas na OS
2. **Tipos TypeScript** — `TipoVeiculo`, `ServicePrice`, novo `FinanceResumo`
3. **financeService.ts** — funções CRUD para service_prices, atualizar `gerarCobrancasIniciais`
4. **OSForm.tsx** — campo tipo veículo + pré-preencher valor_servico
5. **FinancePainel.tsx** — reescrita completa
6. **RecebimentoModal.tsx** + **CustoAdicionalModal.tsx** — novos modais
7. **Financeiro.tsx** — ajustar relatório global
8. **Limpeza** — remover AddChargeModal e PaymentModal antigos

### Tabela de Preços (/financeiro)

Dividir em duas seções:
1. **Preços dos Serviços** — valor cobrado ao cliente (editável)
2. **Custos Fixos** — taxas (DAE, vistoria, placa) (editável)

## Migração de Dados

### Nova migration SQL

1. Criar tabela `service_prices` com dados iniciais e **RLS policies** (SELECT para authenticated, UPDATE/INSERT/DELETE para admin)
2. Adicionar coluna `tipo_veiculo` em `ordens_servico` (nullable para OS existentes)
3. Adicionar coluna `valor_servico` em `ordens_servico` (nullable para OS existentes)

### Compatibilidade

- OS existentes sem `tipo_veiculo`: mostrar como "—" e permitir edição
- OS existentes sem `valor_servico`: calcular a partir dos charges existentes como fallback

## Arquivos Afetados

### Criar
- `src/components/finance/RecebimentoModal.tsx` — modal de recebimento simplificado
- `src/components/finance/CustoAdicionalModal.tsx` — modal discreto para custos extras
- `supabase/migrations/20260320000003_service_prices.sql` — nova tabela + campos

### Reescrever
- `src/components/finance/FinancePainel.tsx` — layout completamente novo
- `src/lib/financeService.ts` — novas funções para service_prices + ajustar lógica

### Modificar
- `src/types/finance.ts` — novos tipos (TipoVeiculo, ServicePrice)
- `src/types.ts` — adicionar tipoVeiculo e valorServico a OrdemDeServico
- `src/pages/OSForm.tsx` — campo tipo veículo + pré-preencher valor
- `src/pages/Financeiro.tsx` — ajustar relatório para novo modelo
- `src/pages/OSDetail.tsx` — nenhuma mudança significativa (já usa FinancePainel)

### Remover
- `src/components/finance/AddChargeModal.tsx` — substituído por CustoAdicionalModal
- `src/components/finance/PaymentModal.tsx` — substituído por RecebimentoModal

## Fora de Escopo

- Integração com bot Detran
- Upload de comprovantes
- Gráficos/charts no relatório
- CSV export
- Notificações de vencimento

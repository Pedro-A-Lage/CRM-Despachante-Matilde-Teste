# Controle de Pagamentos — Spec

## Objetivo
Criar uma tela centralizada onde Admin e Gerente confirmam o pagamento de taxas (DAE, vistoria, placa, etc.) de todas as Ordens de Serviço. A confirmação sincroniza automaticamente com o financeiro de cada OS.

## Público-alvo
Pessoa leiga em tecnologia. Interface deve ser intuitiva, com ações de 1 clique.

## Acesso
Somente usuários com role `admin` ou `gerente`.

---

## 1. Estrutura da Página

### 1.1 Cards Resumo (topo)
| Card | Cálculo |
|------|---------|
| Total Pendente | Soma de `valor_previsto` de charges com status `a_pagar` |
| Pago Hoje | Soma de `valor_pago` onde `confirmado_em` = hoje |
| Pago na Semana | Soma de `valor_pago` onde `confirmado_em` >= início da semana |
| Pago no Mês | Soma de `valor_pago` onde `confirmado_em` >= início do mês |

> **Nota:** A migração deve backfill `confirmado_em = atualizado_em` para charges existentes com `status = 'pago'`, para que apareçam corretamente nos cards.

### 1.2 Barra de Filtros
- **Busca**: por nome do cliente OU placa do veículo (texto livre, case-insensitive)
- **Status**: Pendente | Pago | Todos (toggle buttons) — charges com status `cancelado` são excluídas da lista
- **Tipo de taxa**: DAE Principal | Vistoria | Placa | Outro | Todos
- **Período**: filtro por data (padrão: mês atual) para limitar volume de dados

### 1.3 Lista Agrupada por OS
Cada grupo mostra:
- **Cabeçalho**: `OS #N · NOME DO CLIENTE` + `PLACA · MODELO · Tipo de Serviço`
- **Itens**: cada `finance_charge` da OS (excluindo `cancelado`), com:
  - Indicador visual: ○ pendente (amarelo) | ● pago (verde) | ⚠ atrasado (vermelho, se passou da `due_date`)
  - Descrição da taxa
  - Valor previsto
  - Ação: botão "✓ Confirmar" (se pendente) ou info "Pago · Quem · Quando" (se pago)

### 1.4 Ordenação
- OS com mais taxas pendentes aparecem primeiro
- Dentro de cada OS, pendentes primeiro

### 1.5 Estados de Loading/Erro
- **Loading**: skeleton cards animados enquanto carrega
- **Erro de rede**: toast vermelho "Erro ao carregar dados. Tentar novamente?" com botão retry
- **Lista vazia**: mensagem amigável "Nenhuma taxa encontrada com esses filtros"

---

## 2. Fluxo de Confirmação

### 2.1 Confirmar Pagamento
1. Usuário clica "✓ Confirmar" na taxa
2. Abre popover inline (não modal) com:
   - Valor (pré-preenchido com `valor_previsto`, editável)
   - Data (pré-preenchido com hoje, editável)
   - Botão "Confirmar Pagamento"
3. Ao confirmar:
   - `finance_charges.status` → `'pago'`
   - `finance_charges.valor_pago` → valor informado
   - `finance_charges.confirmado_por` → `usuario.nome`
   - `finance_charges.confirmado_em` → `now()`
4. UI atualiza instantaneamente (optimistic update)
5. Cards resumo recalculam

### 2.2 Desfazer (só Admin)
1. Clicar no badge "● Pago" de uma taxa já confirmada
2. Popover de confirmação: "Reverter pagamento?"
3. Ao confirmar:
   - `finance_charges.status` → `'a_pagar'`
   - `finance_charges.valor_pago` → `0` (alinhado com `desmarcarCustoPago` existente)
   - `finance_charges.confirmado_por` → `null`
   - `finance_charges.confirmado_em` → `null`

### 2.3 Confirmar Todos (atalho)
- Botão "✓ Confirmar Todos" no cabeçalho de cada OS
- Confirma todas as taxas pendentes daquela OS de uma vez
- Mesmo popover, mas mostra valor total
- Usa query com `WHERE status = 'a_pagar'` para evitar race conditions

---

## 3. Modelo de Dados

### 3.1 Alterações em `finance_charges` (SQL)
```sql
ALTER TABLE finance_charges
  ADD COLUMN confirmado_por TEXT,
  ADD COLUMN confirmado_em TIMESTAMPTZ;

-- Backfill para charges já pagas
UPDATE finance_charges
  SET confirmado_em = atualizado_em
  WHERE status = 'pago' AND confirmado_em IS NULL;
```

### 3.2 Alterações no TypeScript (`src/types/finance.ts`)
Adicionar ao `FinanceCharge`:
```typescript
export interface FinanceCharge {
  // ... campos existentes ...
  confirmado_por?: string;
  confirmado_em?: string;
}
```

### 3.3 Nova Query — `getAllChargesWithOS()`
```sql
SELECT
  fc.*,
  os.numero,
  os.tipo_servico,
  c.nome AS cliente_nome,
  v.placa,
  v.modelo
FROM finance_charges fc
JOIN ordens_de_servico os ON os.id = fc.os_id
JOIN clientes c ON c.id = os.cliente_id
JOIN veiculos v ON v.id = os.veiculo_id
WHERE fc.status != 'cancelado'
ORDER BY
  CASE WHEN fc.status = 'a_pagar' THEN 0 ELSE 1 END,
  os.criado_em DESC;
```

### 3.4 Novas Funções no `financeService.ts`
| Função | Descrição |
|--------|-----------|
| `getAllChargesGroupedByOS(filtros?)` | Busca charges com dados da OS/cliente/veículo, agrupa por OS |
| `confirmarPagamento(chargeId, valor, data, usuario)` | Marca charge como pago + registra quem/quando |
| `reverterPagamento(chargeId)` | Volta charge para a_pagar, limpa confirmado_por/em |
| `confirmarTodosDaOS(osId, usuario)` | Confirma todas as pendentes de uma OS (com WHERE status = 'a_pagar') |
| `getResumoControle()` | Calcula os 4 cards do topo |

---

## 4. Componentes React

### 4.1 Página `ControlePagamentos.tsx`
- Rota: `/controle-pagamentos`
- Menu lateral: "Controle Pagamentos" (ícone: CheckSquare) — seção OPERAÇÕES
- Usa `useAuth()` para verificar role (admin ou gerente)
- Guarda de rota: redireciona para dashboard se não autorizado

### 4.2 Componentes internos
| Componente | Responsabilidade |
|------------|-----------------|
| `ResumoCards` | 4 cards do topo com totais |
| `FiltrosBar` | Busca + toggles de filtro + período |
| `OSChargeGroup` | Card agrupado de uma OS com suas taxas |
| `ChargeRow` | Linha individual de taxa com botão confirmar |
| `ConfirmPopover` | Popover inline para confirmar valor/data |

---

## 5. Integração com FinancePainel

Quando uma charge é confirmada na tela de Controle:
- O campo `status` da charge muda para `'pago'` na tabela `finance_charges`
- O `FinancePainel` da OS já lê `finance_charges` via `getChargesByOS()` → reflete automaticamente
- Não precisa de evento extra — é a mesma tabela, mesma source of truth

---

## 6. Permissões

| Ação | Admin | Gerente | Funcionário |
|------|-------|---------|-------------|
| Ver página | ✅ | ✅ | ❌ |
| Confirmar pagamento | ✅ | ✅ | ❌ |
| Reverter pagamento | ✅ | ❌ | ❌ |
| Confirmar todos da OS | ✅ | ✅ | ❌ |

---

## 7. UX para Pessoa Leiga

- **Zero jargão**: "Confirmar Pagamento", não "Atualizar status da cobrança"
- **Cores claras**: verde = pago, amarelo = pendente, vermelho = atrasado (se passou da due_date)
- **1 clique**: confirmar abre popover pequeno, não página nova
- **Busca inteligente**: digitar "PUC" encontra pela placa, digitar "Hariel" encontra pelo nome
- **Feedback visual**: animação suave ao confirmar (taxa desliza de pendente para pago)
- **Mobile-friendly**: cards empilham verticalmente, botões grandes para toque
- **Skeleton loading**: feedback visual imediato enquanto dados carregam
- **Toast de erro**: mensagem clara com botão de retry em caso de falha de rede

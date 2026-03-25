# Análise do Schema do Banco de Dados — Despachante Matilde CRM
**Data da análise:** 2026-03-25
**Analista:** Database Administrator Agent
**Banco:** Supabase (PostgreSQL)

---

## Resumo Executivo

O schema possui 9 tabelas com 3 problemas críticos que causam falhas silenciosas em produção, 2 colunas no código TypeScript que não existem no banco, 3 foreign keys ausentes, e múltiplas oportunidades de otimização de performance por falta de índices.

---

## 1. Colunas Duplicadas ou Desnecessárias

### 1.1 `ordens_de_servico.financeiro` (JSONB) — OBSOLETA
**Severidade: Alta**

A coluna `financeiro jsonb` na tabela `ordens_de_servico` foi a abordagem original para armazenar dados financeiros, antes da criação das tabelas `finance_charges` e `payments`. Nenhum arquivo TypeScript lê ou escreve nessa coluna. Ela ocupa espaço e gera confusão arquitetural.

```sql
-- Verificar se há dados antes de remover:
SELECT COUNT(*) FROM ordens_de_servico WHERE financeiro IS NOT NULL;

-- Remover após confirmar que está vazia ou migrada:
ALTER TABLE public.ordens_de_servico DROP COLUMN financeiro;
```

### 1.2 `ordens_de_servico.vistoria_anexada_em` e `vistoria_nome_arquivo` — DUPLICADAS
**Severidade: Média**

Esses dados já existem dentro da coluna JSONB `vistoria` (campos `vistoriaAnexadaEm` e `vistoriaNomeArquivo` no tipo `Vistoria` em `src/types.ts`). Há duas fontes de verdade para o mesmo dado.

O código em `storage.ts` mapeia `row.vistoria_anexada_em` e `row.vistoria_nome_arquivo` como colunas independentes E também lê do JSONB `vistoria`. Isso cria risco de inconsistência.

**Recomendação:** Definir qual é a fonte canônica. Se o JSONB `vistoria` for o escolhido, remover as colunas escalares e ajustar queries.

### 1.3 `price_table.categoria` — COLUNA SEM TIPO TS CORRESPONDENTE
**Severidade: Baixa**

A tabela `price_table` tem uma coluna `categoria text`, mas a interface TypeScript `PriceTableItem` em `src/types/finance.ts` não a declara. A coluna existe no banco mas é invisível para o código.

```sql
-- Verificar valores existentes:
SELECT DISTINCT categoria FROM price_table WHERE categoria IS NOT NULL;
```

Adicionar à interface ou remover a coluna se não for utilizada.

---

## 2. Foreign Keys Ausentes

### 2.1 `finance_charges.os_id` — SEM FK
**Severidade: Crítica**

A coluna `finance_charges.os_id` referencia `ordens_de_servico.id`, mas não há constraint de foreign key declarada. Isso permite inserir cobranças com `os_id` inválido, orphaned records, e impede cascades automáticos.

```sql
ALTER TABLE public.finance_charges
  ADD CONSTRAINT finance_charges_os_id_fkey
  FOREIGN KEY (os_id) REFERENCES public.ordens_de_servico(id)
  ON DELETE CASCADE;
```

### 2.2 `payments.os_id` — SEM FK
**Severidade: Crítica**

Mesmo problema. A tabela `payments` não possui FK para `ordens_de_servico`.

```sql
ALTER TABLE public.payments
  ADD CONSTRAINT payments_os_id_fkey
  FOREIGN KEY (os_id) REFERENCES public.ordens_de_servico(id)
  ON DELETE CASCADE;
```

### 2.3 `payments.charge_id` — SEM FK
**Severidade: Alta**

A coluna `payments.charge_id` referencia `finance_charges.id` logicamente (mapeada no tipo `Payment`), mas não há FK. Pagamentos podem ficar vinculados a cobranças inexistentes.

```sql
ALTER TABLE public.payments
  ADD CONSTRAINT payments_charge_id_fkey
  FOREIGN KEY (charge_id) REFERENCES public.finance_charges(id)
  ON DELETE SET NULL;
```

### 2.4 `service_prices.tipo_servico` — SEM FK para `service_config`
**Severidade: Média**

`service_prices.tipo_servico` deveria referenciar `service_config.tipo_servico` para garantir que só existam preços para serviços configurados. Atualmente é possível cadastrar preços para tipos de serviço inexistentes.

```sql
ALTER TABLE public.service_prices
  ADD CONSTRAINT service_prices_tipo_servico_fkey
  FOREIGN KEY (tipo_servico) REFERENCES public.service_config(tipo_servico)
  ON UPDATE CASCADE;
```

---

## 3. Colunas no Código TypeScript que NÃO Existem no Schema

### 3.1 `ordens_de_servico.desconto` — CRÍTICO
**Severidade: Crítica — BUG EM PRODUÇÃO**

A coluna `desconto` é declarada na interface `OrdemDeServico` em `src/types.ts` (linha 242) e é ativamente usada por:
- `src/lib/financeService.ts`: funções `getDescontoOS()` e `saveDescontoOS()` fazem SELECT e UPDATE nessa coluna
- `src/lib/storage.ts`: lê `row.desconto` e persiste `map.desconto = o.desconto`

O schema NÃO possui essa coluna. Toda operação de desconto falha silenciosamente (Supabase retorna erro que o código trata como `return 0`).

```sql
-- CORREÇÃO URGENTE:
ALTER TABLE public.ordens_de_servico
  ADD COLUMN desconto numeric DEFAULT NULL;
```

### 3.2 `ordens_de_servico.pendencia_observacoes` — sem uso ativo confirmado
**Severidade: Baixa**

A coluna `pendencia_observacoes` existe no schema mas a interface `OrdemDeServico` não a declara. Verificar se foi intencionalmente omitida do tipo ou se é um campo legado.

---

## 4. Colunas no Schema Não Usadas pelo Código

| Tabela | Coluna | Observação |
|--------|--------|------------|
| `ordens_de_servico` | `financeiro` | Abordagem antiga, substituída por `finance_charges` e `payments`. Ver seção 1.1. |
| `ordens_de_servico` | `pendencia_observacoes` | Existe no schema, ausente no tipo TS e não mapeada em `storage.ts` |
| `price_table` | `categoria` | Ausente na interface `PriceTableItem`. Ver seção 1.3. |
| `veiculos` | `pasta_drive_id` (em veículos) | Mapeado mas raramente utilizado nas páginas |
| `clientes` | `pasta_drive_id` / `pasta_drive_url` | Mapeados, mas o código principal usa Supabase Storage, não Drive |

---

## 5. Índices Ausentes

O schema não declara nenhum índice além das primary keys. Dado o volume de queries por `os_id`, `cliente_id`, `veiculo_id`, e `status`, isso é um problema de performance sério.

```sql
-- finance_charges: consultas frequentes por os_id e status
CREATE INDEX idx_finance_charges_os_id ON public.finance_charges(os_id);
CREATE INDEX idx_finance_charges_status ON public.finance_charges(status);
CREATE INDEX idx_finance_charges_os_status ON public.finance_charges(os_id, status);

-- payments: consultas por os_id e data
CREATE INDEX idx_payments_os_id ON public.payments(os_id);
CREATE INDEX idx_payments_data_pagamento ON public.payments(data_pagamento);
CREATE INDEX idx_payments_charge_id ON public.payments(charge_id) WHERE charge_id IS NOT NULL;

-- ordens_de_servico: as queries mais comuns do sistema
CREATE INDEX idx_os_cliente_id ON public.ordens_de_servico(cliente_id);
CREATE INDEX idx_os_veiculo_id ON public.ordens_de_servico(veiculo_id);
CREATE INDEX idx_os_status ON public.ordens_de_servico(status);
CREATE INDEX idx_os_tipo_servico ON public.ordens_de_servico(tipo_servico);
CREATE INDEX idx_os_data_abertura ON public.ordens_de_servico(data_abertura DESC);
CREATE INDEX idx_os_numero ON public.ordens_de_servico(numero);

-- veiculos: busca por placa é muito comum
CREATE INDEX idx_veiculos_placa ON public.veiculos(placa);
CREATE INDEX idx_veiculos_cliente_id ON public.veiculos(cliente_id);
CREATE INDEX idx_veiculos_renavam ON public.veiculos(renavam) WHERE renavam <> '';

-- clientes: busca por CPF/CNPJ
CREATE INDEX idx_clientes_cpf_cnpj ON public.clientes(cpf_cnpj) WHERE cpf_cnpj <> '';
CREATE INDEX idx_clientes_nome ON public.clientes USING gin(to_tsvector('portuguese', nome));

-- service_prices: lookup por tipo_servico + tipo_veiculo + com_placa (query exata em getServicePrice)
CREATE UNIQUE INDEX idx_service_prices_lookup
  ON public.service_prices(tipo_servico, tipo_veiculo, com_placa)
  WHERE ativo = true;
```

---

## 6. Problemas de Integridade Referencial

### 6.1 Tipos USER-DEFINED sem documentação
As tabelas `finance_charges` e `payments` usam `USER-DEFINED` para colunas `categoria`, `status`, e `metodo`. Esses são enum types do PostgreSQL (`finance_charge_status`, `payment_metodo`, `finance_charge_categoria`). Os enums não estão documentados no schema fornecido.

**Verificar se os valores do enum correspondem exatamente aos tipos TypeScript:**
```sql
SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
WHERE pg_type.typname IN ('finance_charge_status', 'payment_metodo', 'finance_charge_categoria')
ORDER BY pg_type.typname, enumsortorder;
```

O tipo `FinanceChargeCategoria` no TS inclui `'dae_principal' | 'dae_adicional' | 'vistoria' | 'placa' | 'outro'`. Qualquer divergência com o enum PostgreSQL causará erros de inserção.

### 6.2 `ordens_de_servico.status` sem CHECK constraint
O campo `status` aceita qualquer texto. Os valores válidos estão definidos apenas no TypeScript (`StatusOS`). Adicionar constraint:

```sql
ALTER TABLE public.ordens_de_servico
  ADD CONSTRAINT os_status_check
  CHECK (status IN (
    'aguardando_documentacao', 'vistoria', 'delegacia', 'doc_pronto', 'entregue'
  ));
```

### 6.3 `ordens_de_servico.prioridade` sem CHECK constraint
```sql
ALTER TABLE public.ordens_de_servico
  ADD CONSTRAINT os_prioridade_check
  CHECK (prioridade IS NULL OR prioridade IN ('normal', 'urgente', 'critica'));
```

### 6.4 `ordens_de_servico.tipo_servico` sem CHECK constraint
O campo aceita texto livre. Os 9 tipos válidos estão apenas no TS:

```sql
ALTER TABLE public.ordens_de_servico
  ADD CONSTRAINT os_tipo_servico_check
  CHECK (tipo_servico IN (
    'transferencia', 'alteracao_dados', 'segunda_via', 'mudanca_caracteristica',
    'mudanca_categoria', 'baixa', 'primeiro_emplacamento', 'vistoria_lacrada', 'baixa_impedimento'
  ));
```

### 6.5 `clientes.tipo` sem CHECK constraint
```sql
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_tipo_check
  CHECK (tipo IN ('PF', 'PJ'));
```

### 6.6 Datas como `text` em `veiculos`
As colunas `data_aquisicao` e `data_emissao_crv` são declaradas como `text`, não `date`. Isso impede ordenação e comparação por data. Migrar para `date`:

```sql
-- Migração cuidadosa:
ALTER TABLE public.veiculos
  ALTER COLUMN data_aquisicao TYPE date USING
    CASE WHEN data_aquisicao ~ '^\d{4}-\d{2}-\d{2}$'
         THEN data_aquisicao::date ELSE NULL END;

ALTER TABLE public.veiculos
  ALTER COLUMN data_emissao_crv TYPE date USING
    CASE WHEN data_emissao_crv ~ '^\d{4}-\d{2}-\d{2}$'
         THEN data_emissao_crv::date ELSE NULL END;
```

### 6.7 `protocolos_diarios.data` como `text`
Mesmo problema: `data text` deveria ser `date`. Impossibilita queries como "protocolos desta semana" com filtros de data eficientes.

```sql
ALTER TABLE public.protocolos_diarios
  ALTER COLUMN data TYPE date USING data::date;
```

---

## 7. Sugestões de Melhoria

### 7.1 Migrar CUSTO_MATRIX do JavaScript para `service_config`
O arquivo `src/lib/financeService.ts` contém um objeto `CUSTO_MATRIX` hardcoded (linha 169) que define regras de geração de custos por tipo de serviço. A tabela `service_config` já possui as colunas `dae_tipo`, `gera_vistoria`, `gera_placa` para essa finalidade, mas a migração está incompleta — o código ainda usa o objeto JS.

**Ação:** Remover `CUSTO_MATRIX` do JS e fazer `autoGerarCustos()` buscar as regras do `service_config` via `configService.ts`. Isso elimina a necessidade de deploy para alterar regras de negócio.

### 7.2 Adicionar `updated_at` trigger automático
Todas as tabelas têm `atualizado_em`, mas não há trigger para atualizá-la automaticamente. Qualquer UPDATE direto no banco (via Supabase Studio, scripts de manutenção) não atualiza o timestamp.

```sql
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar em todas as tabelas com atualizado_em:
CREATE TRIGGER trg_clientes_atualizado_em
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER trg_veiculos_atualizado_em
  BEFORE UPDATE ON public.veiculos
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER trg_os_atualizado_em
  BEFORE UPDATE ON public.ordens_de_servico
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER trg_finance_charges_atualizado_em
  BEFORE UPDATE ON public.finance_charges
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER trg_payments_atualizado_em
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();
```

### 7.3 Separar `usuarios` da autenticação Supabase Auth
A tabela `usuarios` armazena `senha_hash` manualmente, mas o Supabase possui Auth nativo. O campo `senha_hash` na tabela pública é um risco de segurança (hashes acessíveis via RLS ou vazamentos de logs).

**Recomendação:** Migrar para Supabase Auth e usar a tabela `usuarios` apenas para dados de perfil (role, nome, primeiro_login), vinculada por `id` à tabela `auth.users`.

### 7.4 Adicionar RLS (Row Level Security)
Não há menção de políticas RLS no schema. Em uma aplicação com múltiplos usuários de roles diferentes (admin, gerente, funcionario), RLS é essencial para evitar que funcionários acessem dados que não deveriam.

```sql
-- Exemplo: funcionário só vê OS que ele está envolvido
ALTER TABLE public.ordens_de_servico ENABLE ROW LEVEL SECURITY;
```

### 7.5 `service_prices`: índice único previne duplicatas
Atualmente é possível inserir múltiplos registros com o mesmo `(tipo_servico, tipo_veiculo, com_placa, ativo=true)`. O índice único sugerido na seção 5 resolve isso.

### 7.6 Normalizar `documentos` JSONB em `clientes` e `checklist` JSONB em `ordens_de_servico`
Os arrays JSONB `documentos` (clientes) e `checklist` (OS) crescem indefinidamente dentro do registro. Isso dificulta buscas, auditoria e limita o tamanho máximo de registro. Para volumes maiores, considerar tabelas separadas `cliente_documentos` e `os_checklist_items`.

---

## Plano de Execução Recomendado

### Prioridade 1 — Crítico (executar imediatamente)
```sql
-- 1. Adicionar coluna desconto que o código já usa
ALTER TABLE public.ordens_de_servico ADD COLUMN desconto numeric DEFAULT NULL;

-- 2. Adicionar FK em finance_charges
ALTER TABLE public.finance_charges
  ADD CONSTRAINT finance_charges_os_id_fkey
  FOREIGN KEY (os_id) REFERENCES public.ordens_de_servico(id) ON DELETE CASCADE;

-- 3. Adicionar FK em payments
ALTER TABLE public.payments
  ADD CONSTRAINT payments_os_id_fkey
  FOREIGN KEY (os_id) REFERENCES public.ordens_de_servico(id) ON DELETE CASCADE;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_charge_id_fkey
  FOREIGN KEY (charge_id) REFERENCES public.finance_charges(id) ON DELETE SET NULL;
```

### Prioridade 2 — Alta (próximo sprint)
- Criar todos os índices da seção 5
- Adicionar CHECK constraints da seção 6.2 a 6.5
- Criar trigger `update_atualizado_em`

### Prioridade 3 — Média (próximas semanas)
- Migrar datas `text` para `date` (seções 6.6, 6.7)
- Completar migração do `CUSTO_MATRIX` para `service_config`
- Remover coluna `financeiro` após confirmar que está vazia

### Prioridade 4 — Melhoria (roadmap)
- Implementar RLS
- Migrar autenticação para Supabase Auth
- Avaliar normalização dos JSONB de documentos/checklist

---

## Resumo dos Problemas Encontrados

| # | Problema | Severidade | Tabela | Status |
|---|----------|-----------|--------|--------|
| 1 | `desconto` usado no código mas ausente no schema | **Crítico** | `ordens_de_servico` | Pendente |
| 2 | FK ausente em `finance_charges.os_id` | **Crítico** | `finance_charges` | Pendente |
| 3 | FK ausente em `payments.os_id` | **Crítico** | `payments` | Pendente |
| 4 | FK ausente em `payments.charge_id` | Alta | `payments` | Pendente |
| 5 | Coluna `financeiro` JSONB obsoleta | Alta | `ordens_de_servico` | Pendente |
| 6 | Dados duplicados: vistoria em JSONB e colunas escalares | Média | `ordens_de_servico` | Pendente |
| 7 | Nenhum índice secundário em nenhuma tabela | Alta | Todas | Pendente |
| 8 | Datas como `text` em `veiculos` e `protocolos_diarios` | Média | 2 tabelas | Pendente |
| 9 | Sem CHECK constraints em campos de status/tipo | Média | `ordens_de_servico`, `clientes` | Pendente |
| 10 | `CUSTO_MATRIX` hardcoded no JS, não migrado para DB | Média | `service_config` | Pendente |
| 11 | Sem trigger de `atualizado_em` | Baixa | Todas | Pendente |
| 12 | `senha_hash` em tabela pública | Alta | `usuarios` | Pendente |
| 13 | `price_table.categoria` ausente no tipo TS | Baixa | `price_table` | Pendente |
| 14 | `pendencia_observacoes` ausente no tipo TS | Baixa | `ordens_de_servico` | Pendente |

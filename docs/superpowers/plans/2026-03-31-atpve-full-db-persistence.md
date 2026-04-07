# ATPV-e Full DB Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir todos os campos extraídos do ATPV-e no banco de dados ao criar a OS de transferência de propriedade.

**Architecture:** Adicionar colunas específicas na tabela `veiculos` para dados intrínsecos do veículo, e uma coluna JSONB `transferencia` na tabela `ordens_de_servico` para dados da transação (vendedor, local, valor, data). Atualizar os tipos TypeScript, os mappers do storage e o `handleConfirmar` do ATPVeModal.

**Tech Stack:** Supabase (PostgreSQL), TypeScript, React, pdfjs-dist

---

## Contexto

### Campos extraídos pelo pdfParser que NÃO são salvos hoje

| Campo | Destino proposto |
|-------|-----------------|
| `categoria` | `veiculos.categoria` |
| `numeroCRV` | `veiculos.numero_crv` |
| `codigoSegurancaCRV` | `veiculos.codigo_seguranca_crv` |
| `numeroATPVe` | `veiculos.numero_atpve` |
| `hodometro` | `veiculos.hodometro` |
| `vendedor.nome` | `ordens_de_servico.transferencia` (JSONB) |
| `vendedor.cpfCnpj` | `ordens_de_servico.transferencia` (JSONB) |
| `vendedor.email` | `ordens_de_servico.transferencia` (JSONB) |
| `vendedor.municipio` | `ordens_de_servico.transferencia` (JSONB) |
| `vendedor.uf` | `ordens_de_servico.transferencia` (JSONB) |
| `localVenda` | `ordens_de_servico.transferencia` (JSONB) |
| `valorRecibo` | `ordens_de_servico.transferencia` (JSONB) |
| `dataAquisicao` | `ordens_de_servico.transferencia` (JSONB) |
| `comprador.bairro` | `clientes` já existe via `comprador.bairro` → salvar no endereço |

> Nota: `data_emissao_crv` já existe em `veiculos`. Não duplicar.

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `migrations/20260331000001_atpve_fields.sql` | CRIAR | Migration SQL com novos campos |
| `src/types.ts` | MODIFICAR | Adicionar campos em `Veiculo` e `OrdemDeServico` |
| `src/lib/storage.ts` | MODIFICAR | Atualizar mappers camelCase↔snake_case |
| `src/components/ATPVeModal.tsx` | MODIFICAR | Passar todos os campos em `handleConfirmar` |

---

## Task 1: Migration SQL — novos campos no banco

**Files:**
- Create: `migrations/20260331000001_atpve_fields.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- migrations/20260331000001_atpve_fields.sql
-- Campos intrínsecos do veículo extraídos do ATPV-e
ALTER TABLE veiculos
  ADD COLUMN IF NOT EXISTS categoria TEXT,
  ADD COLUMN IF NOT EXISTS numero_crv TEXT,
  ADD COLUMN IF NOT EXISTS codigo_seguranca_crv TEXT,
  ADD COLUMN IF NOT EXISTS numero_atpve TEXT,
  ADD COLUMN IF NOT EXISTS hodometro TEXT;

-- Dados da transação de transferência (vendedor, local, valor, data)
ALTER TABLE ordens_de_servico
  ADD COLUMN IF NOT EXISTS transferencia JSONB;

COMMENT ON COLUMN veiculos.categoria IS 'Categoria do veículo conforme ATPV-e (ex: OFI, PAR, ESP ou ***)';
COMMENT ON COLUMN veiculos.numero_crv IS 'Número do CRV';
COMMENT ON COLUMN veiculos.codigo_seguranca_crv IS 'Código de segurança do CRV';
COMMENT ON COLUMN veiculos.numero_atpve IS 'Número do documento ATPV-e';
COMMENT ON COLUMN veiculos.hodometro IS 'Hodômetro declarado na transferência';
COMMENT ON COLUMN ordens_de_servico.transferencia IS 'Dados da transação: vendedor, local, valor declarado, data da venda';
```

- [ ] **Step 2: Executar no Supabase SQL Editor**

Copiar o conteúdo do arquivo e executar no painel SQL do Supabase. Verificar que não há erros.

- [ ] **Step 3: Verificar colunas criadas**

No Supabase, rodar:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('veiculos', 'ordens_de_servico')
  AND column_name IN ('categoria','numero_crv','codigo_seguranca_crv','numero_atpve','hodometro','transferencia')
ORDER BY table_name, column_name;
```
Esperado: 6 linhas retornadas.

---

## Task 2: Atualizar tipos TypeScript

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Adicionar campos à interface `Veiculo`**

Localizar a interface `Veiculo` em `src/types.ts` e adicionar após os campos existentes:

```typescript
// Adicionar dentro da interface Veiculo:
categoria?: string;
numeroCRV?: string;
codigoSegurancaCRV?: string;
numeroATPVe?: string;
hodometro?: string;
```

- [ ] **Step 2: Adicionar campo `transferencia` à interface `OrdemDeServico`**

Localizar a interface `OrdemDeServico` em `src/types.ts` e adicionar:

```typescript
// Adicionar dentro da interface OrdemDeServico:
transferencia?: {
  vendedorNome?: string;
  vendedorCpfCnpj?: string;
  vendedorEmail?: string;
  vendedorMunicipio?: string;
  vendedorUf?: string;
  localVenda?: string;
  valorDeclarado?: string;
  dataVenda?: string;
};
```

- [ ] **Step 3: Verificar que o TypeScript compila sem erros**

```bash
cd "c:/Users/pedro/Downloads/CRM-Despachante-Matilde-Teste-main (1)/CRM-Despachante-Matilde-Teste-main"
npx tsc --noEmit
```
Esperado: sem erros de tipo.

---

## Task 3: Atualizar mappers no storage.ts

**Files:**
- Modify: `src/lib/storage.ts`

Os mappers fazem conversão camelCase → snake_case ao salvar e snake_case → camelCase ao ler.

- [ ] **Step 1: Atualizar mapper de `Veiculo` → DB row (função que constrói o objeto para insert/update)**

Localizar onde `saveVeiculo` monta o objeto para o Supabase (procurar por `placa`, `renavam`, `chassi` sendo atribuídos). Adicionar os novos campos:

```typescript
// Dentro do objeto enviado ao Supabase em saveVeiculo:
categoria: veiculo.categoria ?? null,
numero_crv: veiculo.numeroCRV ?? null,
codigo_seguranca_crv: veiculo.codigoSegurancaCRV ?? null,
numero_atpve: veiculo.numeroATPVe ?? null,
hodometro: veiculo.hodometro ?? null,
```

- [ ] **Step 2: Atualizar mapper DB row → `Veiculo` (função que converte resultado do Supabase)**

Localizar onde o resultado do Supabase é convertido para o tipo `Veiculo` (procurar por `marcaModelo` ou `clienteId` sendo atribuídos a partir de `row.`). Adicionar:

```typescript
// Dentro do mapper de row → Veiculo:
categoria: row.categoria ?? undefined,
numeroCRV: row.numero_crv ?? undefined,
codigoSegurancaCRV: row.codigo_seguranca_crv ?? undefined,
numeroATPVe: row.numero_atpve ?? undefined,
hodometro: row.hodometro ?? undefined,
```

- [ ] **Step 3: Atualizar mapper de `OrdemDeServico` → DB row em `saveOrdem`**

Localizar onde `saveOrdem` monta o objeto para insert. Adicionar:

```typescript
// Dentro do objeto enviado ao Supabase em saveOrdem:
transferencia: ordem.transferencia ? JSON.stringify(ordem.transferencia) : null,
```

- [ ] **Step 4: Atualizar mapper DB row → `OrdemDeServico`**

Localizar onde o resultado do Supabase é convertido para `OrdemDeServico`. Adicionar:

```typescript
// Dentro do mapper de row → OrdemDeServico:
transferencia: row.transferencia ?? undefined,
```

- [ ] **Step 5: Verificar compilação**

```bash
npx tsc --noEmit
```
Esperado: sem erros.

---

## Task 4: Atualizar ATPVeModal — passar todos os campos em handleConfirmar

**Files:**
- Modify: `src/components/ATPVeModal.tsx`

- [ ] **Step 1: Localizar `handleConfirmar` e o objeto passado para `saveVeiculo`**

Encontrar onde `saveVeiculo` é chamado (por volta da linha 100-120). O objeto atual tem: `placa`, `renavam`, `chassi`, `marcaModelo`, `clienteId`, `dataAquisicao`, `dataEmissaoCrv`, `observacoes`.

- [ ] **Step 2: Adicionar campos do veículo extraídos do ATPV-e**

```typescript
// Adicionar ao objeto passado para saveVeiculo:
categoria: dados.categoria,
numeroCRV: dados.numeroCRV,
codigoSegurancaCRV: dados.codigoSegurancaCRV,
numeroATPVe: dados.numeroATPVe,
hodometro: dados.hodometro,
```

- [ ] **Step 3: Localizar onde `saveOrdem` é chamado e adicionar `transferencia`**

```typescript
// Adicionar ao objeto passado para saveOrdem:
transferencia: {
  vendedorNome: dados.vendedor?.nome,
  vendedorCpfCnpj: dados.vendedor?.cpfCnpj,
  vendedorEmail: dados.vendedor?.email,
  vendedorMunicipio: dados.vendedor?.municipio,
  vendedorUf: dados.vendedor?.uf,
  localVenda: dados.localVenda,
  valorDeclarado: dados.valorRecibo,
  dataVenda: dados.dataAquisicao,
},
```

- [ ] **Step 4: Remover vendedor de `observacoes` (estava sendo salvo como texto)**

Localizar onde `observacoes` é montado. Se houver algo como `Vendedor: ${dados.vendedor?.nome}`, remover — agora está estruturado em `transferencia`.

- [ ] **Step 5: Verificar compilação e testar manualmente**

```bash
npx tsc --noEmit
npm run dev
```

Subir o app, fazer upload do ATPV-e de teste (ATPV-e_Bruno.pdf), confirmar a OS, e verificar no Supabase que:

- `veiculos` row tem: `categoria`, `numero_crv=264642660739`, `codigo_seguranca_crv=81382716636`, `numero_atpve=260651731696637`, `hodometro=21402`
- `ordens_de_servico` row tem coluna `transferencia` com JSON contendo `vendedorNome="ROGERIA MARCIA MARTINS L SOUZA"`, `localVenda="ITABIRA"`, `valorDeclarado="198.000,00"`, `dataVenda="06/03/2026"`

---

## Checklist de Validação Final

- [ ] Migration executada sem erros no Supabase
- [ ] `npx tsc --noEmit` sem erros
- [ ] Upload do ATPV-e_Bruno.pdf cria OS com todos os campos preenchidos
- [ ] `veiculos.numero_crv = 264642660739` (não confundir com ATPVe)
- [ ] `veiculos.numero_atpve = 260651731696637`
- [ ] `ordens_de_servico.transferencia.vendedorNome = "ROGERIA MARCIA MARTINS L SOUZA"`
- [ ] `ordens_de_servico.transferencia.localVenda = "ITABIRA"`
- [ ] Recarregar a OS no app e verificar que os dados aparecem na tela

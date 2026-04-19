# Schema do banco

> Postgres via Supabase. Schema base em
> [`supabase-schema.sql`](../../supabase-schema.sql); mudanças incrementais
> em [`migrations/`](../../migrations/).

---

## Tabelas principais

### `clientes`

Pessoa física ou jurídica dona de veículo(s).

```sql
clientes (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tipo                TEXT NOT NULL DEFAULT 'PF',   -- 'PF' | 'PJ'
  nome                TEXT NOT NULL,
  cpf_cnpj            TEXT NOT NULL UNIQUE,
  telefones           JSONB NOT NULL DEFAULT '[]',
  email               TEXT,
  observacoes         TEXT,
  documentos          JSONB NOT NULL DEFAULT '[]',   -- DocumentoCliente[]
  pasta_drive_id      TEXT,
  pasta_drive_url     TEXT,
  pasta_supabase_path TEXT,
  -- campos adicionados por migration
  rg, orgao_expedidor, uf_documento,
  endereco, numero, complemento, cep, bairro, municipio, uf,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

Chave natural de deduplicação: `cpf_cnpj`.

### `veiculos`

```sql
veiculos (
  id                    TEXT PK,
  placa                 TEXT NOT NULL UNIQUE,
  renavam               TEXT NOT NULL DEFAULT '',
  chassi                TEXT NOT NULL DEFAULT '',
  marca_modelo          TEXT NOT NULL DEFAULT '',
  cliente_id            TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  observacoes           TEXT,
  data_aquisicao        TEXT,
  data_emissao_crv      TEXT,
  pasta_drive_id        TEXT,
  cadastro_drive_id     TEXT,
  pasta_supabase_path   TEXT,
  categoria             TEXT,
  numero_crv            TEXT,
  codigo_seguranca_crv  TEXT,
  numero_atpve          TEXT,
  hodometro             TEXT,
  -- anos, cor, combustível (por migration)
  criado_em, atualizado_em
)
```

Chave natural de deduplicação: `placa` **ou** `chassi` (busca em `lib/database.ts`
→ `getVeiculoByPlacaOuChassi`).

### `ordens_de_servico`

⚠️ **A tabela mais rica.** Campos relacionais + JSONB agrupando subdomínios
(checklist, detran, vistoria, delegacia, sifap).

```sql
ordens_de_servico (
  id                  TEXT PK,
  numero              SERIAL,                 -- incremental humano (#1234)
  data_abertura       TIMESTAMPTZ DEFAULT now(),
  cliente_id          TEXT NOT NULL REFERENCES clientes(id),
  veiculo_id          TEXT NOT NULL REFERENCES veiculos(id),
  tipo_servico        TEXT NOT NULL,          -- configurável; ver `lib/configService.ts`
  troca_placa         BOOLEAN DEFAULT false,
  tipo_veiculo        TEXT CHECK (IN 'carro','moto'),
  valor_servico       NUMERIC(10,2),
  status              TEXT DEFAULT 'aguardando_documentacao',
  pasta_drive         TEXT,
  pasta_supabase      TEXT,

  -- Blocos JSONB
  checklist              JSONB DEFAULT '[]',   -- ChecklistItem[]
  checklist_observacoes  TEXT,
  detran                 JSONB,                -- DetranEtapa
  vistoria               JSONB,                -- Vistoria
  vistoria_history       JSONB DEFAULT '[]',   -- VistoriaHistorico[]
  delegacia              JSONB,                -- Delegacia (com entradas[])
  sifap                  JSONB,                -- Sifap
  comunicacoes           JSONB DEFAULT '[]',   -- Comunicacao[]
  audit_log              JSONB DEFAULT '[]',   -- AuditEntry[]

  -- Conclusão
  doc_pronto_em, doc_final_anexado_em, doc_final_nome, doc_final_url,
  entregue_em, entregue_para_nome,
  vistoria_anexada_em, vistoria_nome_arquivo,
  pdf_detran_url, pdf_detran_name,
  crlv_consulta        JSONB,

  -- Gestão
  observacao_geral, prioridade, pendencia, desconto,

  -- Financeiro
  total_previsto, total_pago, saldo_pendente,

  -- Transferência / 1º emplacamento
  transferencia        JSONB,
  primeiro_emplacamento JSONB,

  status_delegacia     TEXT,   -- 'entrada' | 'reentrada' | 'sifap' | 'requerimento'
  criado_em, atualizado_em
)
```

### `protocolos_diarios`

Snapshot dos processos enviados à delegacia/SIFAP em um dia.

```sql
protocolos_diarios (
  id, data TEXT NOT NULL,
  processos JSONB DEFAULT '[]',   -- ProtocoloProcesso[] (desnormalizado de propósito)
  criado_em
)
```

⚠️ **Desnormalizado de propósito** — registro histórico. Se a OS mudar,
o protocolo do dia mantém o dado como estava.

### `usuarios`

```sql
usuarios (
  id, nome TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,       -- SHA-256 (hoje; futuro: bcrypt server-side)
  role TEXT DEFAULT 'operador',   -- 'admin' | 'gerente' | 'funcionario'
  primeiro_login BOOLEAN DEFAULT true,
  permissoes JSONB DEFAULT '{}',  -- override granular por usuário
  criado_em, atualizado_em
)
```

### Tabelas extras (via migrations)

Vão sendo adicionadas em `migrations/*.sql`. Até Abr/2026:

- Configuração de serviço (labels, preço default) —
  `20260325000001_service_config.sql`.
- Campos de ATPV-e — `20260331000001_atpve_fields.sql`.
- Empresas parceiras + financeiro + envios + recibo template —
  `20260405_empresas*`, `20260416_empresa_*`.
- Fábricas de placa — `20260405000002_fabricas_placas.sql`.
- Protocolo com foto assinada — `20260414_protocolo_foto_assinada.sql`.
- Pasta Outlook por empresa — `20260418000001_empresas_pasta_outlook.sql`.

---

## Diagrama de estados — OS

```
         ┌────────────────────────┐
         │ aguardando_documentacao│
         └───────────┬────────────┘
                     │ (checklist completo)
                     ▼
              ┌─────────────┐
              │  vistoria   │────┐
              └──────┬──────┘    │ (reprovada → volta p/ reagendar)
                     │ aprovada  │
                     ▼           │
              ┌─────────────┐    │
              │  delegacia  │    │
              └──────┬──────┘    │
                     │           │
                     ▼           │
              ┌─────────────┐    │
              │ doc_pronto  │    │
              └──────┬──────┘    │
                     │ (recebido pelo cliente)
                     ▼           │
              ┌─────────────┐    │
              │  entregue   │    │
              └─────────────┘    │
                                 │
  ┌──────────────────────────────┘
  │ (ciclo de reprovação/reentrada)
  ▼
```

Enum em `src/types.ts`:

```ts
type StatusOS = 'aguardando_documentacao' | 'vistoria' | 'delegacia'
              | 'doc_pronto' | 'entregue';
```

---

## Indexes

Definidos em `supabase-schema.sql`:

- `idx_veiculos_cliente_id` — lookup reverso (cliente → veículos).
- `idx_ordens_cliente_id` — OS de um cliente.
- `idx_ordens_veiculo_id` — OS de um veículo.
- `idx_ordens_status` — filtros do kanban.
- `idx_protocolos_data` — busca por data.

Se um filtro novo vira padrão de uso, **crie index por migration**.

---

## RLS e policies

Todas as tabelas têm RLS habilitado, mas com policy permissiva:

```sql
CREATE POLICY "Allow all access to <tabela>" ON <tabela>
  FOR ALL USING (true) WITH CHECK (true);
```

⚠️ **Isso significa: qualquer um com a anon key tem acesso total.** A segurança
fica no client (login via `usuarios` + checagem de role). Ver
[`04-security.md`](./04-security.md) para discussão e roadmap.

---

## Convenções de migration

### Nome do arquivo

```
YYYYMMDDHHMMSS_descritivo_snake.sql
```

Exemplos:

```
20260325000001_service_config.sql
20260405000001_empresas_parceiras.sql
20260418000001_empresas_pasta_outlook.sql
```

### Conteúdo

```sql
-- Migration: adiciona coluna X em Y
-- Motivo: <por quê>
-- Reversão: ALTER TABLE Y DROP COLUMN X;

ALTER TABLE <tabela>
  ADD COLUMN IF NOT EXISTS <coluna> <tipo> <default/null>;
```

Regras:

1. Sempre `IF [NOT] EXISTS` em CREATE/DROP.
2. Coluna nova com `NULL` default — nunca `NOT NULL` sem default em tabela
   populada (quebra inserts existentes).
3. Comentário SQL com motivo e reversão.
4. Se alterar dados (UPDATE), teste em staging com snapshot de prod.
5. Migrations **nunca** se editam depois de aplicadas em prod. Crie nova.

### Ordem de aplicação

Hoje **manual** via CLI:

```bash
npx supabase db push --db-url "postgresql://..."
```

Migrations são aplicadas em ordem alfabética (prefixo timestamp garante).

---

## Mapeamento domínio ↔ banco

O código TS usa `camelCase` (`cpfCnpj`, `criadoEm`), o Postgres usa
`snake_case` (`cpf_cnpj`, `criado_em`).

**Conversão acontece nos services** (`src/lib/*Service.ts`):

```ts
function dbToCliente(row: any): Cliente {
  return {
    id: row.id,
    cpfCnpj: row.cpf_cnpj,
    criadoEm: row.criado_em,
    // ...
  };
}
```

Nunca retorne `snake_case` direto pros componentes. Os componentes só falam
`camelCase`.

---

## Checklist antes de PR de migration

- [ ] Nome do arquivo com timestamp correto.
- [ ] `IF [NOT] EXISTS` em tudo.
- [ ] Coluna nova com default compatível.
- [ ] Testei em staging (ou Supabase local).
- [ ] Documentei no PR como rodar e como reverter.
- [ ] Atualizei `src/types.ts` se mudou campo exposto.
- [ ] Atualizei o service responsável (mapping `dbToX`).

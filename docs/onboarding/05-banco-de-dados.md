# 5. Banco de Dados (Supabase / Postgres)

## Filosofia

- **Postgres como fonte única** da verdade operacional.
- **JSONB liberal** para campos semi-estruturados que evoluem rápido
  (`checklist`, `vistoria_history`, `comunicacoes`, `documentos`,
  `telefones`, `permissoes`).
- **IDs como `TEXT`** (não UUID nativo) — gerados no app com
  `Date.now() + Math.random()`. Dívida conhecida (SEC-6); migrar para
  `uuidv4` aos poucos.
- **RLS está habilitado mas aberto** (`USING (true) WITH CHECK (true)`) —
  dívida crítica SEC-2. Tratar como se **todo cliente tivesse admin**
  até implementarmos Supabase Auth + RLS real.

## Tabelas principais

> Verdade canônica: soma de `supabase-schema.sql` + todas as migrations em
> `migrations/`. O schema base está desatualizado (DB-1) — aplique as
> migrations em ordem cronológica.

### `clientes`

PF ou PJ (`tipo`), CPF/CNPJ único, telefones/documentos em JSONB.
Integrações: `pasta_drive_id`, `pasta_drive_url` (Google Drive),
`pasta_supabase_path` (Storage).

### `veiculos`

Placa única, FK para `clientes` (`ON DELETE CASCADE` — deleta cliente
apaga veículos). Campos do CRV/CRLV (categoria, renavam, chassi,
numeroATPVe, hodometro).

### `ordens_de_servico`

Coração do sistema. Um registro = um processo.

Campos-chave:

| Coluna | Tipo | Nota |
|--------|------|------|
| `numero`        | `SERIAL` | Mas o app **sobrescreve** com MAX+1 manual (WF-3 race). Sempre deixe o app calcular ou migre para usar o SERIAL direto. |
| `status`        | `TEXT` | Ver enum no cap. 3. Transições não validadas (WF-1). |
| `tipo_servico`  | `TEXT` | Chave do catálogo `service_config`. |
| `checklist`     | `JSONB` | Array de itens `{id, label, status: 'pendente'|'recebido'|'na'}`. |
| `vistoria`      | `JSONB` | Estado atual da vistoria. |
| `vistoria_history` | `JSONB[]` | Apontamentos/reprovações (append-only). |
| `detran`, `delegacia`, `sifap` | `JSONB` | Subestados por fase. |
| `comunicacoes`  | `JSONB` | Log de WhatsApp/e-mail enviados. |
| `audit_log`     | `JSONB` | Log de mudanças. **Race condition** WF-4 (read-modify-write). |
| `total_previsto`, `total_pago`, `saldo_pendente` | `NUMERIC(10,2)` | Floating-point — tenha cuidado (FIN-5). |

FK: `cliente_id`, `veiculo_id`, ambos `ON DELETE CASCADE`.

### `usuarios`

Login custom. `senha_hash` = SHA-256 hex (dívida SEC-3). `permissoes` é
JSONB: `{paginas: {financeiro: true, ...}, acoes: {...}}`.

### `protocolos_diarios`

Um registro por data. `processos` é JSONB array de snapshots das OSs.

## Tabelas adicionadas via migrations

Em `migrations/`:

| Migration | Tabelas/colunas introduzidas |
|-----------|------------------------------|
| `20260325000001_service_config.sql`   | `service_config`, `service_prices`, `price_table` |
| `20260325000002_fix_finance_issues.sql` | `finance_charges`, `payments` |
| `20260331000001_atpve_fields.sql`     | Campos ATPV-e em `veiculos` |
| `20260405000001_empresas_parceiras.sql` | `empresas_parceiras` |
| `20260405000002_fabricas_placas.sql`  | `fabricas_placas`, `pedidos_placas` |
| `20260405000003_empresa_financeiro.sql` | Colunas financeiras em empresa |
| `20260405000004_renumerar_os.sql`     | Reset/sync do SERIAL `numero` |
| `20260406000001_campos_cliente_veiculo.sql` | Campos endereço em `clientes` |
| `20260407000001_empresas_documentos_labels.sql` | Labels de docs de empresa |
| `20260414_protocolo_foto_assinada.sql`| Foto do protocolo assinado |
| `20260416000001_empresa_envio_pagamento.sql` | Envio/pagamento empresa |
| `20260416000002_empresa_metodo_envio_whatsapp.sql` | Método envio WhatsApp |
| `20260416000003_empresa_recibo_template.sql` | Template recibo por empresa |
| `20260418000001_empresas_pasta_outlook.sql` | Pasta Outlook por empresa |

### Criar nova migration

```bash
# nomeação: YYYYMMDDHHMMSS_descricao_curta.sql
touch migrations/20260501120000_minha_mudanca.sql
# escreva SQL idempotente (IF NOT EXISTS, IF EXISTS) sempre que possível
```

Aplique no Dashboard Supabase → SQL Editor, ou via CLI:

```bash
supabase db push                     # aplica não-aplicadas
supabase migration list              # ver histórico
```

> **Nunca edite uma migration já aplicada em produção.** Crie uma nova
> que corrige/evolui.

## Storage (Supabase Storage)

Buckets (criados via dashboard):

- `cliente-docs` / `veiculo-docs` / `os-docs` — arquivos operacionais.
- Ver `src/lib/fileStorage.ts` para o padrão de upload.

Google Drive **continua sendo** a "pasta do cliente" oficial. Storage é
complemento (fallback local).

## Edge Functions (Deno)

Em `supabase/functions/<nome>/index.ts`. Deploy CI via
`.github/workflows/deploy-supabase-functions.yml`.

| Function | Serve pra |
|----------|-----------|
| `gemini-proxy` | Esconder `GEMINI_API_KEY`; recebe `prompt` + imagem, devolve JSON. |
| `get-outlook-folders`, `get-outlook-emails`, `get-outlook-email-details`, `get-outlook-email-attachment` | Microsoft Graph. Lê e-mails/anexos. |
| `send-email-empresa`, `send-email-placa` | Envio transacional (Graph). |

Secrets das functions: setados no Dashboard → Project Settings → Edge
Functions → Secrets. **Não** vão no `.env` do frontend.

## Pontos de atenção (dívida documentada)

Antes de começar qualquer tarefa que mexa em banco, releia:

- **SEC-2:** RLS aberto — qualquer cliente com a anon key tem CRUD total.
- **DB-1:** `supabase-schema.sql` não reflete o estado real. Fresh install só com ele = app quebrado.
- **WF-3:** Race condition em `numero` de OS. Duas criações simultâneas
  podem duplicar número.
- **WF-4:** Audit log faz read-modify-write — trocar por `array_append` SQL.
- **FIN-1:** Pagamentos ficam órfãos quando a OS é deletada (deleção
  filtra por `charge_id` NULL).
- **FIN-3:** Backup (`exportAllData`) **não inclui** `finance_charges` /
  `payments`.

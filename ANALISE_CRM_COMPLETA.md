# Análise Completa do CRM Despachante Matilde

**Data:** 2026-04-13  
**Escopo:** Segurança, Qualidade de Código, Lógica de Negócio, UI/UX, Banco de Dados

---

## Resumo Executivo

Foram encontradas **68 falhas** distribuídas em 3 categorias:

| Severidade | Quantidade | Exemplos |
|------------|-----------|----------|
| **CRÍTICA** | 6 | RLS desabilitado, credenciais hardcoded, SHA-256 sem salt |
| **ALTA** | 18 | postMessage sem origin check, pagamentos órfãos, race conditions |
| **MÉDIA** | 26 | Sem rate limit no login, sem CSP, floating-point em dinheiro |
| **BAIXA** | 18 | console.log com PII, dead code, CSS inválido |

---

## 1. SEGURANÇA — CRÍTICAS

### SEC-1: Credenciais Supabase hardcoded em 7+ arquivos
**Severidade: CRÍTICA**

A URL e chave anon do Supabase estão em texto plano no repositório:
- `apply_schema_update.js:3-4`
- `reset-db.js:3-4`
- `reset-os.js:3-4`
- `import-notion.js:5-6`
- `scripts/import_csv.ts:6-7`
- `scripts/diag_os.ts:4-5`
- `scripts/clean_import.ts:4-5`

**Impacto:** Qualquer pessoa que clone o repositório tem acesso completo ao banco de produção.  
**Correção:** Mover para variáveis de ambiente e rotacionar a chave imediatamente.

---

### SEC-2: Row Level Security desabilitado — acesso público total
**Severidade: CRÍTICA**  
**Arquivo:** `supabase-schema.sql:121-134`

```sql
CREATE POLICY "Allow all access to clientes" ON clientes FOR ALL USING (true) WITH CHECK (true);
-- repetido para TODAS as tabelas, incluindo `usuarios`
```

**Impacto:** Com a anon key (que está no código-fonte), qualquer pessoa pode ler/modificar/deletar TODOS os registros, incluindo hashes de senhas, dados de clientes (CPF/CNPJ), veículos e OS.  
**Correção:** Implementar RLS baseado em JWT com Supabase Auth.

---

### SEC-3: Senhas com SHA-256 sem salt
**Severidade: CRÍTICA**  
**Arquivo:** `src/lib/auth.ts:4-11`

```typescript
async function hashSenha(senha: string): Promise<string> {
    const data = encoder.encode(senha);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
}
```

**Impacto:** SHA-256 é rápido demais para senhas. Sem salt, senhas iguais geram hashes idênticos. GPUs modernas computam bilhões de SHA-256/s.  
**Correção:** Migrar para bcrypt/scrypt/Argon2 no servidor.

---

### SEC-4: Autorização 100% client-side — sem enforcement no servidor
**Severidade: CRÍTICA**  
**Arquivos:** `src/lib/permissions.ts`, `src/App.tsx:39-43`

As funções `temPermissao()` e `PermissionRoute` só controlam renderização no React. Nenhuma query Supabase valida o usuário/role. Combinado com RLS aberto, qualquer pessoa pode:
- Deletar qualquer usuário (`auth.ts:144`)
- Promover qualquer usuário a admin (`auth.ts:112`)
- Deletar qualquer OS/cliente/veículo (`database.ts`)

---

### SEC-5: Hash de senha trafega para o browser
**Severidade: CRÍTICA**  
**Arquivo:** `src/lib/auth.ts:25-38`

O login busca o registro completo do usuário (incluindo `senha_hash`) do Supabase para o browser e compara hashes no client-side. Qualquer script com a anon key pode baixar todos os hashes.

---

### SEC-6: IDs gerados com Math.random() — previsíveis
**Severidade: ALTA**  
**Arquivo:** `src/lib/database.ts:14-15`

```typescript
return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
```

`Math.random()` não é criptograficamente seguro. IDs são parcialmente previsíveis pelo timestamp.  
**Correção:** Usar `crypto.randomUUID()`.

---

## 2. SEGURANÇA — ALTA/MÉDIA

### SEC-7: postMessage handler sem validação de origin
**Severidade: ALTA**  
**Arquivo:** `src/App.tsx:64-67`

```typescript
const handleMessage = async (event: MessageEvent) => {
    if (event.data?.source === 'MATILDE_EXTENSION' && ...) {
```

Sem `event.origin` check. Qualquer iframe/popup pode enviar mensagens forjadas que criam OS, fazem fetch de URLs arbitrárias (SSRF via browser) e navegam para páginas.

### SEC-8: Sessão = user ID em localStorage sem expiração
**Severidade: ALTA**  
**Arquivo:** `src/contexts/AuthContext.tsx:16,51`

Sem token assinado, sem expiração, sem invalidação server-side.

### SEC-9: API Keys (Supabase + Gemini) expostas no bundle client-side
**Severidade: ALTA**  
**Arquivos:** `src/lib/supabaseClient.ts:3-4`, `src/lib/atpveAI.ts:9`, `src/lib/crlveAI.ts:8`

Todas as `VITE_*` env vars são inlined no JavaScript compilado. A chave Gemini permite uso da API às custas do proprietário.

### SEC-10: Backup import sem validação de schema
**Severidade: ALTA**  
**Arquivo:** `src/lib/database.ts:683-706`

JSON importado é inserido direto no banco via upsert sem qualquer validação.

### SEC-11: Sem rate limiting no login
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/auth.ts:25-38`

Sem contador de tentativas, sem lockout, sem CAPTCHA. Brute force ilimitado.

### SEC-12: Senha mínima de apenas 4 caracteres
**Severidade: MÉDIA**  
**Arquivo:** `src/pages/UsuariosList.tsx:72,152`

### SEC-13: postMessage com targetOrigin `'*'`
**Severidade: MÉDIA**  
**Arquivo:** `src/App.tsx:1608`

### SEC-14: Sem Content Security Policy (CSP)
**Severidade: MÉDIA**  
**Arquivos:** `index.html`, `server.js`

### SEC-15: Sem validação de tamanho em uploads
**Severidade: MÉDIA**  
**Arquivos:** `src/lib/fileStorage.ts`, `src/lib/supabaseStorage.ts`

### SEC-16: Sem validação de MIME type nos uploads do OSDetail
**Severidade: MÉDIA**  
**Arquivo:** `src/pages/OSDetail.tsx` (múltiplos locais)

O atributo `accept` do `<input>` é apenas um hint — pode ser bypassed.

### SEC-17: console.log com dados sensíveis (CPF, chassi, placa) em produção
**Severidade: BAIXA**  
**Arquivos:** `src/App.tsx`, `src/pages/OSDetail.tsx`, `src/lib/pdfParser.ts:114-115`

---

## 3. BUGS DE LÓGICA DE NEGÓCIO — FINANCEIRO

### FIN-1: Pagamentos ficam órfãos ao deletar OS
**Severidade: ALTA**  
**Arquivos:** `src/lib/financeService.ts:406`, `src/lib/database.ts:591`

`addPayment` insere com `charge_id: null`. `deleteOrdem` deleta payments via `.in('charge_id', chargeIds)` — SQL `IN` nunca match NULL. Pagamentos persistem para sempre após deletar a OS.  
**Correção:** Usar `.eq('os_id', id)` na query de deleção.

### FIN-2: `confirmarTodosDaOS` — confirmação parcial sem rollback
**Severidade: ALTA**  
**Arquivo:** `src/lib/financeService.ts:703-728`

Loop sequencial com `UPDATE` individual por cobrança. Se a cobrança #3 falha, #1 e #2 já estão confirmadas — OS fica em estado inconsistente.  
**Correção:** Usar batch update com `.in('id', ids)`.

### FIN-3: `exportAllData` omite `finance_charges` e `payments`
**Severidade: ALTA**  
**Arquivo:** `src/lib/database.ts:667-681`

Backup não inclui dados financeiros. Ao restaurar, todo histórico financeiro é perdido — risco de cobrança duplicada.

### FIN-4: Honorário pode ser negativo em `calcularResumo` (inconsistente com relatórios globais)
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/financeService.ts:478`

```typescript
const honorario = valorServico - totalCustos; // pode ser negativo
```

Outros cálculos usam `Math.max(0, ...)`, mas este não. Cards de resumo mostram valores negativos.

### FIN-5: Floating-point em cálculos financeiros
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/financeService.ts:475`

Todos os `.reduce()` com dinheiro usam `number` IEEE 754. `0.1 + 0.2 = 0.30000000000000004` pode causar status de pagamento errados.

### FIN-6: `dataPrevista` salva apenas em localStorage
**Severidade: MÉDIA**  
**Arquivo:** `src/components/finance/FinancePainel.tsx:192-199`

Dado de negócio que se perde ao trocar de máquina/browser.

### FIN-7: `getPaymentsTotalByOSIds` sem batching — URL too long em datasets grandes
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/financeService.ts:369-381`

### FIN-8: Auto-sync de cobrança de placa ignora erros silenciosamente
**Severidade: MÉDIA**  
**Arquivo:** `src/components/finance/FinancePainel.tsx:265-296`

---

## 4. BUGS DE LÓGICA DE NEGÓCIO — WORKFLOW

### WF-1: Transições de status sem validação — qualquer status pode pular para qualquer outro
**Severidade: ALTA**  
**Arquivo:** `src/pages/OSDetail.tsx:572-576`

```typescript
const updateStatus = async (status: StatusOS) => {
    await updateOrdem(os.id, { status });
};
```

O `<select>` mostra todos os status. Usuário pode pular de `aguardando_documentacao` direto para `entregue`. Checklist completo é apenas visual — nunca bloqueia progressão.

### WF-2: Drag-and-drop Kanban também permite transições inválidas
**Severidade: MÉDIA**  
**Arquivo:** `src/components/OSKanban.tsx:115-123`

### WF-3: Race condition no número da OS — duplicatas possíveis
**Severidade: ALTA**  
**Arquivo:** `src/lib/database.ts:554-561`

```typescript
const { data: maxRow } = await supabase.from('ordens_de_servico')
    .select('numero').order('numero', { ascending: false }).limit(1).single();
dbData.numero = (maxRow?.numero ?? 0) + 1;
```

TOCTOU: duas criações simultâneas leem o mesmo MAX e geram números duplicados. A coluna é `SERIAL`, mas o app sobrescreve manualmente.

### WF-4: `addAuditEntry` — race condition no read-modify-write do auditLog
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/database.ts:599-617`

Dois audit entries simultâneos leem o mesmo array, cada um adiciona o seu, e um sobrescreve o outro.

---

## 5. BUGS DE INTEGRIDADE DE DADOS

### DATA-1: `deleteEmpresa` sem verificação de OS vinculadas
**Severidade: ALTA**  
**Arquivo:** `src/lib/empresaService.ts:92-98`

Empresa deletada deixa OS com `empresa_parceira_id` dangling. Cálculos financeiros dessas OS ficam permanentemente quebrados.

### DATA-2: `import-notion.js` — parser CSV naïve quebra com vírgulas e newlines em campos
**Severidade: ALTA**  
**Arquivo:** `import-notion.js:40,51`

`content.split('\n')` e `row.split(',')` não lidam com campos entre aspas. Dados importados ficam corrompidos.

### DATA-3: `import-notion.js` — upsert por placa sobrescreve `cliente_id`
**Severidade: ALTA**  
**Arquivo:** `import-notion.js:85-96`

Se uma placa já existe com outro dono, o import reatribui silenciosamente o veículo.

### DATA-4: `importAllData` — erros de upsert são logados mas não lançados
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/database.ts:683-701`

UI mostra "Dados restaurados com sucesso!" mesmo se 90% dos registros falharam.

---

## 6. ERROR HANDLING

### ERR-1: `catch {}` vazio engole falhas de `finalizarOS` — cobranças nunca criadas
**Severidade: ALTA**  
**Arquivo:** `src/App.tsx:691,816,998,1330,1439,1547`

```typescript
try { await finalizarOS(...); } catch {}
```

Se `finalizarOS` falha, `valorServico` nunca é setado, cobranças financeiras nunca são criadas, e o usuário não vê nenhum erro.

### ERR-2: `ClienteForm.handleSubmit` sem try/catch — form congela no erro
**Severidade: ALTA**  
**Arquivo:** `src/pages/ClienteForm.tsx:82-107`

`saveCliente` pode lançar exceção. Sem catch, o spinner do botão nunca para.

### ERR-3: Service layer retorna `[]` ou `undefined` em vez de lançar exceção
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/database.ts` (múltiplas funções)

`getClientes`, `getOrdens`, etc. retornam `[]` em erro. Caller não sabe se é "sem dados" ou "falha de rede".

### ERR-4: 25+ chamadas `alert()` coexistem com sistema de Toast
**Severidade: BAIXA**  
**Arquivos:** Espalhados por `App.tsx`, `OSDetail.tsx`, `VeiculoForm.tsx`, `ClienteForm.tsx`, etc.

---

## 7. QUALIDADE DE CÓDIGO

### CODE-1: `storage.ts` é dead code — duplicata de `database.ts`
**Severidade: ALTA**  
**Arquivo:** `src/lib/storage.ts` (578 linhas)

Nenhum arquivo importa de `storage.ts`. Funções idênticas às de `database.ts` mas com menos validações.

### CODE-2: `supabaseStorage.ts` duplicata de `fileStorage.ts`
**Severidade: MÉDIA**

### CODE-3: `ds.ts` — dead code completo
**Severidade: BAIXA**  
**Arquivo:** `src/lib/ds.ts`

### CODE-4: 3 useState mortos no OSDetail (`viewerUrl`, `viewerTitle`, `viewerOpen`)
**Severidade: BAIXA**  
**Arquivo:** `src/pages/OSDetail.tsx:435-441`

### CODE-5: `useMemo` usado como side-effect (deveria ser `useEffect`)
**Severidade: MÉDIA**  
**Arquivo:** `src/pages/ProtocoloDiario.tsx:75`

### CODE-6: 216 ocorrências de `any` — type safety comprometida
**Severidade: MÉDIA**  
**Arquivos:** Espalhados por todo o codebase. Piores: `OSDetail.tsx:413-414` (`useState<any>` para cliente/veículo), `database.ts:44,100,156` (mappers com `row: any`).

### CODE-7: `as any` perigosos em `saveOrdem`
**Severidade: MÉDIA**  
**Arquivo:** `src/App.tsx:688,814,992,1327,1437,1545`

TypeScript não consegue verificar campos obrigatórios quando `as any` é usado.

---

## 8. BANCO DE DADOS

### DB-1: `supabase-schema.sql` completamente desatualizado
**Severidade: ALTA**

Tabelas ausentes: `service_config`, `service_prices`, `finance_charges`, `payments`, `price_table`, `empresas_parceiras`, `fabricas_placas`, `pedidos_placas`, `usuarios`. Colunas de migrações ausentes. Uma instalação fresh com apenas este arquivo resulta em app quebrado.

### DB-2: Indexes faltando
**Severidade: MÉDIA**

- `ordens_de_servico(numero)` — usado em ordenação
- `ordens_de_servico(tipo_servico)` — usado em filtros
- `finance_charges(categoria)` — filtrado frequentemente
- Vários índices existem em migrações mas não no schema base

### DB-3: `numero SERIAL` vs cálculo manual — divergência
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/database.ts:554-561`

O schema define `SERIAL` mas o app calcula `MAX+1` manualmente. Sequences ficam dessincronizadas.

### DB-4: FK `empresa_parceira_id` usa `ON DELETE RESTRICT` sem tratamento no app
**Severidade: MÉDIA**

Deletar empresa com OS vinculadas gera erro genérico do Supabase sem mensagem amigável.

---

## 9. UI/UX

### UI-1: CSS inválido — parêntese duplo em `var(--notion-surface))`
**Severidade: BAIXA**  
**Arquivos:** `Financeiro.tsx:65`, `OSDetail.tsx:1927`, `RecebimentoModal.tsx:143`

Background das cards fica transparente.

### UI-2: Filtro de datas no Financeiro recarrega a cada keystroke
**Severidade: BAIXA**  
**Arquivo:** `src/pages/Financeiro.tsx:108`

### UI-3: `Backup.tsx` usa `window.confirm()` — pode ser bloqueado pelo browser
**Severidade: ALTA**  
**Arquivo:** `src/pages/Backup.tsx:25`

Se popup é bloqueado, `confirm()` retorna `false` e import destrutivo prossegue sem confirmação.

### UI-4: `ConfirmProvider` default é `danger: true` — confirmações não-destrutivas aparecem em vermelho
**Severidade: BAIXA**  
**Arquivo:** `src/components/ConfirmProvider.tsx:26`

### UI-5: DocumentViewer montado mas nunca usado — dead component
**Severidade: BAIXA**  
**Arquivo:** `src/pages/OSDetail.tsx:439-441`

---

## 10. PDF/DOCUMENTOS

### PDF-1: Parser PDF junta texto sem considerar posição — multi-coluna vira lixo
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/pdfParser.ts:108-111`

### PDF-2: Regex genérica de chassi (17 chars) gera falsos positivos
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/pdfParser.ts:218-222`

### PDF-3: Fallback de `dataAquisicao` pega data de emissão em vez de aquisição
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/pdfParser.ts:555-559`

### PDF-4: Sem limite de tamanho antes de enviar arquivo ao Gemini (OOM no browser)
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/crlveAI.ts:154-158`

### PDF-5: `canvas.getContext('2d')!` — non-null assertion pode crashar
**Severidade: MÉDIA**  
**Arquivo:** `src/lib/fichaCadastroAI.ts:57`

---

## Priorização de Correções Recomendada

### Sprint 1 — Urgente (Segurança Crítica)
1. Rotacionar credenciais Supabase e remover do código-fonte
2. Implementar RLS real no Supabase
3. Migrar autenticação para Supabase Auth (elimina SHA-256, client-side auth)
4. Mover chave Gemini para proxy server-side

### Sprint 2 — Alta Prioridade (Integridade de Dados)
5. Corrigir deleção de pagamentos órfãos (FIN-1)
6. Corrigir `exportAllData` para incluir dados financeiros (FIN-3)
7. Adicionar validação de transição de status (WF-1)
8. Corrigir race condition no número da OS (WF-3)
9. Adicionar origin check no postMessage handler (SEC-7)

### Sprint 3 — Média Prioridade (Qualidade)
10. Remover dead code (`storage.ts`, `ds.ts`, `supabaseStorage.ts`)
11. Corrigir empty catch blocks em `finalizarOS`
12. Adicionar rate limiting no login
13. Corrigir `import-notion.js` com parser CSV adequado
14. Atualizar `supabase-schema.sql` para refletir estado real

### Sprint 4 — Melhorias
15. Substituir `alert()` por Toast/Confirm
16. Corrigir CSS inválido
17. Adicionar indexes faltantes no banco
18. Eliminar `any` types gradualmente

# Convenções de API

> O CRM não tem "uma" API — tem várias camadas que trocam dados. Este doc
> define convenções pra cada uma.

---

## As camadas

```
┌──────────────────────────────────────────────┐
│ 1. React component                           │
│    ↓ chama                                   │
│ 2. lib/*Service.ts (camada de domínio)       │
│    ↓ chama                                   │
│ 3a. supabaseClient  ─────────── Postgres     │
│ 3b. fetch('/api/...')  ───────── server.js   │
│ 3c. supabase.functions.invoke  ── Edge Fn    │
│ 3d. postMessage ───── Chrome Extension       │
└──────────────────────────────────────────────┘
```

---

## 1. Layer services (`src/lib/*Service.ts`)

Regra de ouro: **componentes NUNCA chamam Supabase direto**. Sempre via service.

### Assinatura padrão

- **Retorna tipo de domínio** (`Cliente`, `OrdemDeServico`, etc) — não
  `snake_case`.
- **Camelcase** nos params.
- **Lança `Error`** em falha fatal, retorna `null` em "não encontrado".

```ts
// Bom
export async function getClienteById(id: string): Promise<Cliente | null> { ... }
export async function saveCliente(dados: Partial<Cliente>): Promise<Cliente> { ... }
export async function deleteCliente(id: string): Promise<void> { ... }

// Ruim
export async function fetchCliente(params: any): Promise<any> { ... }  // any
export async function salvar(c: Cliente): Promise<boolean> { ... }     // boolean vago
```

### Nomenclatura

| Operação         | Prefixo      |
| ---------------- | ------------ |
| Buscar 1         | `get`        |
| Listar           | `list` / `get<Plural>` |
| Buscar por X     | `getByX`     |
| Criar            | `save` (cria ou atualiza), ou `create` |
| Atualizar        | `update`     |
| Excluir          | `delete`     |
| Ação de negócio  | verbo de domínio (`aprovarVistoria`, `enviarPlaca`) |

### Erros

- **Validação** — `throw new Error('CPF inválido')` (mensagem em PT, será
  mostrada ao usuário).
- **Não encontrado** — `return null`.
- **Falha de infra** — deixa vazar (Supabase error já tem mensagem útil).

Componente trata com try/catch e toast:

```tsx
try {
  await saveCliente(dados);
  showToast({ type: 'success', text: 'Salvo' });
} catch (e) {
  showToast({ type: 'error', text: (e as Error).message });
}
```

---

## 2. Supabase client

Uma única instância exportada de [`src/lib/supabaseClient.ts`](../../src/lib/supabaseClient.ts):

```ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
);
```

**Nunca** crie um client novo em outro lugar.

### Queries

Uso direto da API do supabase-js:

```ts
const { data, error } = await supabase
  .from('clientes')
  .select('*')
  .eq('cpf_cnpj', cpfCnpj)
  .single();
```

- `.single()` só quando você espera exatamente 1 (retorna erro se 0 ou 2+).
- `.maybeSingle()` pra "0 ou 1" (retorna null sem erro).
- **Select lista explícito** em queries de listagem pesada — não `*` em
  todas. Performance + contrato claro.

---

## 3. Edge Functions (`supabase/functions/*`)

### Padrão Deno

Cada function tem um `index.ts`:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const body = await req.json();
  // ...
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

### Contrato

- **Sempre POST.**
- **Body JSON** com `{ ... }`, nunca formdata.
- **Response JSON** com `{ ok: boolean, data?, error? }`.
- **HTTP status** reflete o estado:
  - `200` — sucesso.
  - `400` — body inválido.
  - `401` — auth ruim.
  - `500` — erro interno.
- **CORS** — se for chamada do front, headers CORS liberando o domínio (já
  configurado nas functions existentes).

### Invocar do front

```ts
const { data, error } = await supabase.functions.invoke('send-email-placa', {
  body: { osId, placaNova },
});
```

### Secrets

Nunca no código, sempre via env:

```ts
const apiKey = Deno.env.get('GEMINI_API_KEY');
```

Configurar: `npx supabase secrets set KEY=value --project-ref xxx`.

### Functions atuais

| Function                       | O que faz                                       |
| ------------------------------ | ----------------------------------------------- |
| `gemini-proxy`                 | Proxy pra Gemini API, esconde a chave           |
| `get-outlook-folders`          | Lista pastas do Outlook                         |
| `get-outlook-emails`           | Lista e-mails de uma pasta                      |
| `get-outlook-email-details`    | Detalhe de um e-mail                            |
| `get-outlook-email-attachment` | Baixa anexo                                     |
| `send-email-placa`             | Envia e-mail avisando placa pronta              |
| `send-email-empresa`           | Envia cobrança pra empresa parceira             |

---

## 4. Express server (`server.js`)

Endpoint único:

```
POST /api/recibo/pdf
Content-Type: application/json
Body: { template: string, dados: object }
→ 200 application/pdf (bytes)
```

Proxied pelo Vite em dev. Em prod, depende do hosting (ver
[`03-engineering/05-deployment.md`](../03-engineering/05-deployment.md)).

Convenções:

- Same-origin (sem CORS complicado).
- Erros retornam `{ error: string }` com status 4xx/5xx apropriado.

---

## 5. Chrome Extension ↔ CRM

### Do Extension → CRM

`postMessage` com schema:

```ts
{
  source: 'MATILDE_EXTENSION',
  type: 'CAPTURED_CONFIRMAR_DADOS' | 'PROCESS_DETRAN_PDF' | 'VISTORIA_RESULT' | ...,
  payload: { ... },
}
```

Recebedor em `src/App.tsx` → `ExtensionListener`:

```ts
useEffect(() => {
  const handleMessage = async (event: MessageEvent) => {
    if (event.origin !== window.location.origin &&
        !event.origin.startsWith('chrome-extension://')) return;
    if (event.data?.source !== 'MATILDE_EXTENSION') return;
    switch (event.data.type) { ... }
  };
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);
```

### Do CRM → Extension

Mesmo padrão reverso (`postMessage` com `source: 'MATILDE_CRM'`), via
`crm_bridge.js`.

### Validação

**SEMPRE** valide `event.origin` e `event.data.source` antes de processar.
Qualquer site pode tentar enviar `postMessage`.

---

## 6. Google Drive

Integração direta do front via OAuth2 + fetch REST. Wrapper em
`src/lib/*` (verificar se `googleDrive.ts` ainda existe — referenciado no
README antigo mas pode ter sido refatorado).

Convenções:

- **Criar pasta** só quando for necessário (cliente novo, OS nova). Não
  criar pastas vazias.
- **Naming**:
  - Cliente: `Nome - CPF/CNPJ`.
  - OS: `OS #Número - Tipo_Servico`.
- **`pasta_drive_id`** guardado na linha do Postgres — busca rápida depois.

---

## 7. Erros e logs

### No front

```ts
console.error('[Matilde] erro ao salvar cliente', e);
```

Prefixo `[Matilde]` pra filtrar. **Não** `console.log` sem contexto.

Em prod, erros deveriam ir pro Sentry (ainda não implementado — ver
[`01-system-overview.md`](./01-system-overview.md) "próximos passos").

### Nas Edge Functions

```ts
console.error('[send-email-placa]', err);
```

Logs aparecem no Dashboard → Edge Functions → Logs.

---

## Contrato entre camadas (resumo)

| Camada           | Linguagem | Formato entrada        | Formato saída            |
| ---------------- | --------- | ---------------------- | ------------------------ |
| Componente       | TSX       | props (camelCase)      | JSX                      |
| Service (lib)    | TS        | params camelCase       | tipos de domínio (ou null)|
| Supabase         | JS SDK    | snake_case             | snake_case               |
| Edge Function    | Deno      | JSON POST body         | JSON                     |
| Express          | Node      | JSON POST body         | PDF / JSON               |
| Extension ↔ CRM  | Browser   | postMessage payload    | postMessage payload      |

**Mapping de snake_case ↔ camelCase** só acontece no boundary do service.
Nunca vazar snake pra componente.

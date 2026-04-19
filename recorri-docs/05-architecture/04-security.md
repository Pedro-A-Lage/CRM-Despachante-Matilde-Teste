# Segurança e LGPD

> O CRM guarda CPF, CNPJ, RG, endereço, telefones — dado pessoal regulado
> por LGPD. Este doc descreve o que fazemos hoje, os gaps, e o plano de
> melhoria.

---

## Modelo de autenticação (hoje)

### Como funciona

1. Usuário digita nome + senha em `/login`.
2. Front chama `login()` em [`src/lib/auth.ts`](../../src/lib/auth.ts):
   - Busca `usuarios` pelo nome.
   - Compara `senha_hash` com SHA-256 da senha digitada.
   - Aplica rate limit (5 tentativas / 5 min por nome).
3. Se OK, guarda usuário em `AuthContext` (em memória + localStorage).
4. `ProtectedRoute` em `App.tsx` bloqueia rotas sem usuário logado.
5. `PermissionRoute` checa permissão de página via
   [`src/lib/permissions.ts`](../../src/lib/permissions.ts).

### Roles

Três roles (ver `src/types.ts` → `RoleUsuario`):

| Role         | Tem o quê                                        |
| ------------ | ------------------------------------------------ |
| `admin`      | Tudo. Bypass de qualquer check.                  |
| `gerente`    | Finance, emails, OS completa, exceto excluir_os |
| `funcionario`| OS parcial (sem custos/honorários), protocolo    |

Role dá defaults; `usuarios.permissoes` é override granular por usuário.

### Gaps conhecidos

❌ **SHA-256 para senha é fraco.** Rápido de forçar. Deveria ser bcrypt/scrypt
com salt. Futuro: mover check de senha pra Edge Function com bcrypt.

❌ **Rate limit em memória do client.** Reset ao recarregar página. Futuro:
rate limit server-side (Edge Function) ou Supabase Auth.

❌ **Não tem "lembrar-me" seguro.** Sessão vive em `localStorage` — qualquer
script no browser lê.

❌ **Não tem 2FA.**

---

## Modelo de autorização (hoje)

### RLS do Postgres

Todas as tabelas têm RLS habilitado, **mas com policy permissiva**:

```sql
CREATE POLICY "Allow all access to <tabela>" ON <tabela>
  FOR ALL USING (true) WITH CHECK (true);
```

**Significado:** qualquer requisição com a anon key do Supabase vê tudo.

### Checagem no client

Autorização acontece **no React** via `temPermissao()`:

```ts
if (!temPermissao(usuario, 'os', 'excluir_os')) return;
await deleteOS(id);
```

### Gaps críticos

⚠️ **A anon key está embutida no build JS.** Qualquer pessoa que inspecionar
o site pega e pode chamar o Postgres direto — sem passar pela UI.

Consequências:
- Desenvolvedor antigo ainda pode ler dados se tem uma cópia do build.
- Ataque oportunista (alguém com a URL e a chave) lê toda a base.
- "Funcionário" que sabe extrair a chave bypassa `temPermissao`.

**Isso é um trade-off conhecido e aceito pelo tamanho do negócio** (1
escritório, ambiente controlado). Se o produto crescer, precisa migrar para:

1. Supabase Auth com JWT customizado.
2. RLS policies de verdade usando `auth.uid()` / `auth.jwt()`.
3. Tabela `usuarios` vinculada ao `auth.users` nativo.
4. Chaves service_role ficam só em Edge Functions.

---

## Dados pessoais (LGPD)

### O que coletamos

| Dado           | Base legal (LGPD art. 7)    | Motivo                         |
| -------------- | --------------------------- | ------------------------------ |
| Nome           | Execução de contrato        | Despacho do processo           |
| CPF / CNPJ     | Execução de contrato        | Documentação ao Detran         |
| RG             | Execução de contrato        | Documentação ao Detran         |
| Endereço       | Execução de contrato        | CRV, comunicação               |
| Telefone       | Execução de contrato        | Comunicação                    |
| Email          | Execução de contrato        | Comunicação                    |
| Documentos em PDF | Execução de contrato     | Processo                       |
| Histórico de OS | Obrigação legal (arquivo)  | Prestação de contas            |

### Onde cada dado vive

- Postgres do Supabase (AWS).
- Google Drive corporativo (docs em PDF).
- Backups (se houver — ver seção backup).

### Direitos do titular (LGPD art. 18)

Hoje NÃO temos fluxo automatizado para:

- Exportar dados do titular (acesso).
- Corrigir.
- Excluir / anonimizar.
- Portar.

Tudo é feito manual via Supabase Dashboard ou SQL. **Para estar em
conformidade estrita**, precisamos:

1. Botão "exportar meus dados" por cliente.
2. Política clara de retenção (quanto tempo guardamos OS de 5 anos atrás?).
3. Termo de consentimento no cadastro.

Hoje: o despachante é operador; a Matilde é controladora. Cliente pede por
telefone; despachante executa no CRM.

---

## Storage de documentos (PDFs)

### Supabase Storage

Bucket com policy de acesso ampla (toda request com anon key passa). Os
arquivos não são realmente "secretos" — são documentos oficiais do cliente,
mas **não devem ser indexáveis na web**. URLs são longas (UUIDs) — ofuscação,
não segurança real.

### Google Drive

Pasta corporativa com compartilhamento interno. Controle de acesso do Drive
é quem protege.

---

## Extensão Chrome — segurança

### `postMessage` validation

Obrigatório validar `event.origin` e `event.data.source`:

```ts
if (event.origin !== window.location.origin &&
    !event.origin.startsWith('chrome-extension://')) return;
if (event.data?.source !== 'MATILDE_EXTENSION') return;
```

Sem isso, qualquer site aberto no browser pode injetar comandos no CRM.

### Permissions no manifest

Mínimas necessárias. Cada nova permission no `manifest.json` é revisada no PR.

### Injected scripts

`inject-pdf-interceptor.js` e `inject-error-interceptor.js` rodam no contexto
da página do Detran. **Não devem** vazar estado do CRM para páginas externas.

---

## Secrets

### Regra

- **Nunca no front (`.env VITE_*` embutido no build).** Excesso: `VITE_SUPABASE_ANON_KEY`
  é público por design.
- **Sempre em Edge Function** quando precisa de key real (Gemini, Outlook OAuth,
  futuramente bcrypt).
- **Nunca commit** de `.env` real. `.gitignore` já protege.
- Rotação: se um secret vaza, rota e atualiza a Edge Function.

### Secrets atuais

| Secret                       | Onde                                        |
| ---------------------------- | ------------------------------------------- |
| `GEMINI_API_KEY`             | Edge Function `gemini-proxy`                |
| OAuth client Outlook         | Edge Functions `get-outlook-*`              |
| `SUPABASE_ACCESS_TOKEN`      | GitHub Actions secret                       |
| `SUPABASE_PROJECT_REF`       | GitHub Actions secret                       |

Auditoria: revise trimestralmente quem tem acesso ao Dashboard do Supabase,
ao projeto GCP e ao Azure AD do Outlook.

---

## Input validation

Todo input do usuário é validado **antes de persistir**:

| Campo          | Validador                                        |
| -------------- | ------------------------------------------------ |
| CPF            | `src/lib/documentValidator.ts` → `isValidCPF`    |
| CNPJ           | `src/lib/documentValidator.ts` → `isValidCNPJ`   |
| RENAVAM        | 11 dígitos + dígito verificador                  |
| Chassi         | 17 caracteres (exceto I, O, Q)                   |
| Placa          | Formato Mercosul ou antigo                       |
| Email          | Regex simples                                    |
| Telefone       | Regex DDD + 8/9 dígitos                          |

Validação **não** é XSS protection. Para isso, sempre use JSX (React escapa
por default). Nunca use `dangerouslySetInnerHTML` com input do usuário.

---

## Checklist de security review (no PR)

- [ ] Input do usuário validado antes de salvar.
- [ ] Sem `dangerouslySetInnerHTML` com dado do usuário.
- [ ] Sem SQL raw com string concatenada (sempre parâmetros do Supabase JS).
- [ ] Secret/chave não commitada.
- [ ] Permissão checada antes de ação destrutiva (ver `temPermissao`).
- [ ] `event.origin` validado em `postMessage`.
- [ ] Log sem dado sensível (CPF completo, senha, token).
- [ ] Upload limita tipo e tamanho (PDF/imagem, < 10MB).
- [ ] Se expôs nova rota: `<ProtectedRoute>` + `<PermissionRoute>` apropriado.

---

## Roadmap de security

Em ordem de prioridade:

1. **Mover hash de senha para Edge Function + bcrypt**.
2. **Migrar autenticação para Supabase Auth** (JWT).
3. **RLS real** vinculada a `auth.uid()`.
4. **Sentry ou similar** — observabilidade de erros com contexto, sem PII.
5. **Política de retenção** — quanto tempo guardar OS concluída.
6. **Fluxo LGPD** — botão "exportar meus dados" por cliente.
7. **2FA** pelo menos pro role `admin`.
8. **Audit log persistente** (hoje é campo JSONB na OS — movê-lo pra tabela
   dedicada facilita forense).
9. **CSP** (Content Security Policy) no hosting do front.
10. **Chrome Web Store privado** pra distribuição da extensão (evita cópia
    modificada com malware).

# Estratégia de testes

> Pragmatismo radical. Hoje o CRM **não tem suite automatizada**. Este doc
> explica: como testamos hoje, o que é aceitável, e pra onde queremos ir.

---

## Situação atual (2026-04)

| Camada               | Cobertura automatizada | Cobertura manual      |
| -------------------- | ---------------------- | --------------------- |
| Type-check (tsc)     | ✅ via `npm run build`  | —                     |
| Unit tests           | ❌ nenhuma              | N/A                   |
| Integration tests    | ❌ nenhuma              | N/A                   |
| E2E / UI             | ❌ nenhuma              | Manual antes do PR    |
| Extensão Chrome      | 🟡 scripts em Playwright (não CI) | Testes manuais documentados em `chrome-extension/RELATORIO_TESTES_*.md` |
| Edge Functions       | ❌ nenhuma              | Manual (curl/Postman) |
| SQL / migrations     | ❌ nenhuma              | Aplicar em staging    |

---

## O que é obrigatório antes de abrir PR

### 1. `npm run build` passa

```bash
npm run build
```

Isso roda:
- `tsc -b` — type-check completo (estrito com `noUncheckedIndexedAccess`).
- `vite build` — bundle de produção.

Se o TS reclama, conserte antes. `@ts-ignore` é rejeitado no review.

### 2. Teste manual do fluxo tocado

Descreva no PR como reproduzir o cenário feliz + pelo menos 1 edge case.

Exemplo bom:

> **Como testar**
>
> 1. Abra OS #123 (Aguardando Documentação).
> 2. Clique em "Anexar laudo de vistoria".
> 3. Faça upload de `laudo_exemplo.pdf` (tem que aparecer na aba Vistoria).
> 4. Edge case: upload de arquivo > 10MB → deve mostrar erro toast.

### 3. Teste manual em **light + dark** se mexeu em UI

Alterne `class="dark"` no `<html>` via DevTools.

### 4. Teste manual em **mobile** se mexeu em layout

DevTools → toggle device toolbar → iPhone SE (380px) e iPad (768px).

### 5. Smoke test do login

Toda mudança em `App.tsx`, `AuthContext`, `Layout` deve incluir login +
navegação pelo menos.

---

## Para onde queremos ir

### Próximos 3 meses (sprint por sprint)

1. **Prettier + ESLint em pre-commit** — eliminar discussão de formatação.
2. **Vitest pra units** — começar pelas libs críticas:
   - `src/lib/documentValidator.ts` (CPF/CNPJ, RENAVAM, chassi).
   - `src/lib/financeService.ts` (cálculos de saldo).
   - `src/lib/pdfParser.ts` (parser tem muitos edge cases de PDF do Detran).
3. **Playwright pra E2E** do fluxo OS completo.
4. **CI no GitHub Actions** rodando build + testes em todo PR.

### Médio prazo (6 meses)

- **Teste de migration** — script que roda todas as migrations num banco
  limpo e valida.
- **Contract test das Edge Functions** — JSON schema + chamadas de fumaça.

---

## Padrões quando chegarem os testes

### Estrutura

```
src/
├── lib/
│   ├── financeService.ts
│   └── financeService.test.ts   ← co-localizado
```

### Nomes

- `<arquivo>.test.ts` pra units/integração.
- `e2e/<fluxo>.spec.ts` pra Playwright.

### Convenções

- **Tests devem ler como um caso de negócio**:
  ```ts
  test('cálculo de saldo pendente desconta desconto da OS', () => { … });
  ```
- **Nada de mock do Supabase direto** — mocke a service wrapper.
- **Fixtures** em `src/__fixtures__/` (clientes, OS, veículos de exemplo).

---

## Teste manual — checklist por fluxo

### Fluxo OS completo (crítico)

- [ ] Criar cliente PF + veículo.
- [ ] Criar cliente PJ + veículo.
- [ ] Abrir nova OS (serviço: Transferência).
- [ ] Marcar documentos no checklist (Recebido, Pendente, Não se Aplica).
- [ ] Anexar folha de cadastro (PDF).
- [ ] Registrar pagamento de DAE.
- [ ] Agendar vistoria.
- [ ] Anexar laudo de vistoria.
- [ ] Enviar para Delegacia (gerar protocolo).
- [ ] Marcar doc pronto.
- [ ] Anexar doc final.
- [ ] Marcar entregue.

### Fluxo financeiro

- [ ] Recebimento em dinheiro.
- [ ] Recebimento em Pix.
- [ ] Desconto aplicado.
- [ ] Despesa avulsa.
- [ ] Fechamento do dia.

### Extensão Chrome

- [ ] Login no portal Detran.
- [ ] Confirmar Dados → envia pro CRM.
- [ ] Gerar DAE → PDF capturado e upload no Drive.
- [ ] Resultado de Vistoria → atualiza status da OS.

---

## Quando algo quebra em produção

1. **Repro num sandbox** (ambiente de staging com dados reais anonimizados).
2. **Escreva o teste que faltava** — mesmo se o projeto não tem suite ainda,
   isso força você a pensar no invariante que quebrou.
3. **Fix + teste** no mesmo PR.

---

## Não faça testes frágeis

- ❌ Snapshot test de componente inteiro (quebra a cada mudança visual).
- ❌ Test que depende de `sleep(N)` / timing.
- ❌ Test que chama API real (Supabase de dev).
- ❌ Test que esconde bugs (`try { ... } catch { /* ignore */ }`).

---

## Resumo

Hoje **testar significa testar com as mãos e rodar `npm run build`**. Não é
ideal, mas é honesto. Quem adiciona complexidade sem justificar com um teste
no PR está fazendo o time mais lento, não mais rápido. Quando os testes
chegarem (ver roadmap), este doc vira obsoleto — atualize.

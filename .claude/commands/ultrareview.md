---
description: Revisão completa em múltiplas passadas (qualidade, segurança, design system, testes) do diff atual
argument-hint: "[base-ref] (opcional, default: main)"
---

# /ultrareview — Revisão profunda em 4 passadas

Você é um revisor sênior fazendo a revisão final antes do merge. O objetivo é
encontrar **problemas reais**, não enfeitar o código. Cada passada tem um foco
diferente — não misture os focos.

## Escopo

- Base: `$1` se fornecido, senão `main` (ou `master` se `main` não existir).
- Compare `BASE...HEAD` + mudanças não commitadas (`git status`, `git diff`).
- Se o diff for > 2000 linhas, liste os arquivos e **pergunte** ao usuário em
  qual área focar antes de continuar.

## Preparação (rode em paralelo)

```bash
git status
git log --oneline BASE...HEAD
git diff --stat BASE...HEAD
git diff BASE...HEAD
```

Leia também os arquivos de contexto (apenas na primeira vez, se ainda não
estiverem no contexto):

- `CLAUDE.md` — regras do harness e design system.
- `design/principles.md`, `design/tokens.md`, `design/components.md`,
  `design/checklist.md` — obrigatórios para a passada 3.

---

## Passada 1 — Qualidade de código

Foco: bugs reais, correção lógica, ruído que não deveria estar aí.

- Bugs, edge cases quebrados, promises sem await, race conditions.
- Tipos TS: `any`, asserções forçadas (`as X`), non-null `!` sem razão.
- Abstrações prematuras, helpers criados para um único caller, flags de feature
  para casos que nunca vão acontecer.
- Tratamento de erro defensivo em fronteiras que não são fronteiras (código
  interno confia nas garantias internas).
- Comentários que explicam o QUÊ em vez do PORQUÊ, comentários referenciando
  tickets/PRs, código comentado, `TODO` sem owner.
- Código morto: imports não usados, vars `_`-prefixadas que nunca foram usadas,
  re-exports só "para compat" sem consumidor real.
- Duplicação copiada do CRM existente — sempre que possível, reaproveitar
  componente/hook que já existe.

## Passada 2 — Segurança

Foco: OWASP Top 10 + específicos do stack (Supabase, Vite, Node).

- **Supabase**: RLS policies novas/alteradas estão corretas? Query direta no
  cliente sem filtrar por `empresa_id` ou `user_id`? Service role key sendo
  usada em código cliente?
- **Secrets**: chaves em `.env.example` não devem ter valores reais; nenhum
  token/segredo hardcoded; `chrome-extension/` não deve ter `client_secret`
  embutido.
- **Injeção**: SQL dinâmico concatenado (procure por `` ` ``.concat de query
  strings), `dangerouslySetInnerHTML`, `eval`, `new Function`.
- **XSS**: render de HTML vindo de e-mail (Outlook/Gmail) — o reader faz
  sanitização? Procure por `srcDoc` / `innerHTML` em `src/`.
- **AuthZ**: novos endpoints em `server.js` ou Supabase Functions validam o
  usuário/empresa antes de agir?
- **CORS / CSRF**: `server.js` aceita origem arbitrária?
- **Upload / PDF / XLSX**: parsers recebendo arquivo do usuário — há limite de
  tamanho? Tipo validado?
- **Logs**: `console.log` imprimindo PII, tokens, payloads completos?

## Passada 3 — Design System

Obrigatório apenas se o diff toca UI (`src/**/*.tsx`, `src/**/*.css`,
`tailwind.config.js`, `index.html`). Se não toca UI, pule com uma linha:
"N/A — sem mudanças de UI."

Rode o checklist de `design/checklist.md`:

- **Tokens**: nenhuma cor hex/rgb/hsl literal, nenhum `font-size: NNpx` solto,
  radius só em `4/5/8/12/16/9999`, nenhuma `box-shadow` literal.
- **Light + Dark**: a mudança tem override em `.dark`? Texto legível? Bordas
  aparecem nos dois?
- **Mobile**: testa ≤768px e ≤380px? Modal vira bottom-sheet? Inputs 16px?
- **A11y**: botão só-ícone tem `aria-label`? `<label htmlFor>` associado?
  Cor sozinha não transmite informação crítica?
- **Componentes**: usa `.btn`, `.card`, `.badge`, `.modal-overlay` em vez de
  `div` custom com Tailwind solto?
- **Performance**: sem `backdrop-filter` fora de `.modal-overlay`, sem animação
  infinita fora de `.spin`, transições ≤220ms.

Se faltar token, proponha onde adicionar (`src/index.css` + `tailwind.config.js`
+ `design/tokens.md`).

## Passada 4 — Testes, build e migrations

- **Build**: há chance de quebrar `vite build` / `tsc`? Imports errados, type
  error mascarado?
- **Migrations**: novas migrations em `migrations/` — são idempotentes? Têm
  rollback mental claro? Adicionam coluna NOT NULL sem default em tabela
  existente (unsafe)?
- **Coverage**: funcionalidade nova tem teste? Se o repo não tem teste para
  essa área, não invente — apenas anote.
- **Scripts**: arquivos novos em `scripts/` têm shebang/`"type": "module"`
  coerente com o resto?

---

## Formato de saída (obrigatório)

Gere um relatório estruturado em markdown com esta estrutura exata:

```
# Ultrareview — <branch atual>

**Base**: <base-ref>
**Commits**: <N>
**Arquivos**: <N>  (+<adds> / -<dels>)

## Resumo
<2-3 frases: o que a PR faz e o veredito geral — merge / ajustes / bloqueado>

## 🔴 Bloqueadores
<itens com severidade alta — segurança, bug de correção, quebra de build.
 cada item: arquivo:linha — descrição — sugestão concreta>

## 🟡 Devem ser resolvidos
<qualidade média — tipos frouxos, violação do design system, falta de RLS
 óbvia, etc>

## 🔵 Nice-to-have
<refatoração, nomes melhores, duplicação menor>

## ✅ Passadas
- Qualidade: <OK / N issues>
- Segurança: <OK / N issues>
- Design System: <OK / N issues / N/A>
- Build & testes: <OK / N issues>
```

## Regras

- **Seja concreto**: todo item aponta `arquivo:linha` (ou `arquivo` se for
  estrutural) e descreve o fix em 1 linha.
- **Não invente problemas**: se uma passada está limpa, diga "OK" e siga.
- **Não repita o mesmo problema em passadas diferentes** — escolha a mais
  apropriada.
- **Não sugira refactor além do escopo da PR** (regra da casa).
- **Não comite e não faça push** — este comando é só leitura.
- Se precisar rodar grep/busca ampla, use `ctx_execute` com shell em vez de
  Bash (ver `CLAUDE.md`).

# Code review

> Review é colaboração, não fiscalização. Quem revisa também aprende. Quem
> abre PR não leva feedback pro lado pessoal.

---

## Princípios

1. **Revise em ≤ 1 dia útil.** PR parado mata o fluxo do time.
2. **Código > comentário.** Se dá pra sugerir com "suggested change", use.
3. **Pergunte, não imponha.** "Por que isso? Eu teria feito X" > "Faz X".
4. **Elogie o bom.** "Gostei desse split" ajuda a manter.
5. **Diferencie `nit`, `question`, `must`.** (Veja abaixo.)
6. **Revise o próprio PR antes de pedir review** — caça as próprias bobagens.

---

## Convenção de tags nos comentários

| Tag         | Significa                                                         |
| ----------- | ----------------------------------------------------------------- |
| `nit:`      | Nitpick — opcional, pode ignorar.                                 |
| `question:` | Não entendi — me ajuda.                                            |
| `suggestion:` | Ideia de melhoria, autor decide.                                 |
| `must:`     | Bloqueador — não mergeia sem resolver.                            |
| `praise:`   | Elogio genuíno. Não use ironicamente.                             |

Exemplo:

> `nit: prefere `const` em vez de `let` aqui? não muda.`
> `must: esse `parseInt(value)` não valida — se user digita "abc" vai NaN
> silencioso. Sugere usar Number.parseInt com NaN check.`

---

## Antes de pedir review (autor)

Checklist mental:

- [ ] O PR tem **contexto** no corpo (por quê + o quê + como testar).
- [ ] Commits atômicos (ou squash claro na hora do merge).
- [ ] Diff está limpo — sem código comentado, console.log, arquivo esquecido.
- [ ] `npm run build` passou localmente.
- [ ] Testei o fluxo feliz + 1 edge case.
- [ ] Se mexeu em UI: testei **light + dark** + **mobile**.
- [ ] Marquei o PR como "ready for review" (não mais draft).
- [ ] Pedi review explicitamente (marcando pessoa ou no canal).

---

## O que o reviewer procura

### Prioridade 1 — correção

- [ ] Faz o que o issue/spec descreve?
- [ ] Tem bug óbvio? (null deref, off-by-one, race condition).
- [ ] Trata erros nos pontos certos?
- [ ] Sem regressão aparente em código que não devia mudar?

### Prioridade 2 — segurança

- [ ] Input do usuário tratado (XSS, injection)?
- [ ] Chave/secret não foi commitada?
- [ ] Permissão checada antes de ação destrutiva?
- [ ] Dados sensíveis não expostos em log?

### Prioridade 3 — qualidade

- [ ] Nomes claros (em PT pra domínio, EN pra técnico).
- [ ] Estrutura consistente com o resto do código.
- [ ] Sem `any`, sem `@ts-ignore`.
- [ ] Sem hardcoded color/size (ver [`02-design-system/`](../02-design-system/)).
- [ ] Supabase só em `src/lib/*Service.ts`.
- [ ] Componente > 800 linhas? Justificável?

### Prioridade 4 — estilo

- Formatação (2 espaços, semi-colon, single-quote).
- Ordem de imports.
- Micro-nomes ("userCount" vs "numUsers").

Prioridade 4 normalmente é `nit:` — não bloqueia merge.

---

## Tipos de PR

### UI (mudança visual)

Extra atenção a:

- Design tokens (ver checklist [`../02-design-system/`](../02-design-system/)).
- Light + dark em screenshots.
- Mobile responsive.
- Área tocável ≥ 40×40px.
- `aria-label` em botão só-ícone.

Peça prints de **antes e depois** no corpo do PR.

### Lib / service

- Tipagem forte nos params e return.
- Testabilidade — funções puras quando possível.
- Mapping de formato do Supabase pro tipo de domínio (não vaza `snake_case`).
- Erros com mensagem em PT, lançando `Error`.

### Migration SQL

- `IF NOT EXISTS` / `IF EXISTS` em CREATE/DROP.
- Não quebra dados existentes (NULL default, tipo compatível).
- Reversível (ou reversão documentada em comentário SQL).
- Roda rápido (< 10s em dataset médio).

Migration **sempre** precisa rodar em staging antes do merge. Documente no PR.

### Extension Chrome

- Não mexe com localStorage do CRM de fora.
- `manifest.json` com permissions mínimas necessárias.
- Service worker não tem estado presumido (pode morrer a qualquer momento).

---

## Tempo

- Autor: PR pronto para review → responde comentários em **≤ 1 dia útil**.
- Reviewer: review inicial em **≤ 1 dia útil**. Se mais lento, fala no canal.
- Após ajustes do autor, reviewer dá re-review em **≤ 4h**.

PR parado > 3 dias sem movimento: o canal cobra.

---

## Conflitos de opinião

Se autor e reviewer discordam:

1. Discuta **no PR**, não em DM (transparência).
2. 2 rounds no máximo — se continuar, traz um terceiro.
3. Tech lead tem tie-break.
4. Se não afeta correção ou segurança, **autor decide** (é a pessoa com mais
   contexto da implementação).

---

## Aprovação e merge

- **≥ 1 aprovação** pra features normais.
- **≥ 2 aprovações** pra hotfix ou mudança em design system.
- Autor dá merge (não reviewer) — autor é responsável pelo estado final.
- **Squash and merge** como default.
- Depois: delete a branch, atualize `main` local.

---

## Auto-review

Antes de pedir review de alguém, **leia seu próprio diff no GitHub**. Você
achará coisas que escapam no editor. Quase sempre acha 1-3 ajustes.

---

## Review de PR de AI (Claude Code, Copilot, etc)

PRs gerados por IA devem deixar explícito no corpo. Review extra atento a:

- Código que parece plausível mas não faz o que a descrição diz.
- Comentários "didáticos" desnecessários (remova).
- Nomes genéricos ("handleThing") — melhore.
- Docstrings que não agregam — remova.
- `any` ou fallback silencioso — exija narrow.

Nunca dê merge em PR de IA sem ler linha a linha.

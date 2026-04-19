# 9. Primeira Semana — Checklist

Este é um roteiro sugerido para seus primeiros 5 dias. O objetivo é
**entender antes de mudar**. Não pule etapas.

## Dia 1 — Ambiente

- [ ] Ler `/README.md`, `/CLAUDE.md`, `/design/README.md` e este
      onboarding kit inteiro (este documento aqui).
- [ ] `npm install` + `npm run dev` rodando.
- [ ] Acesso ao projeto Supabase de dev (peça ao responsável).
- [ ] Extensão Chrome carregada e abrindo o Detran com logs `[Matilde]`
      no console.
- [ ] Criar um usuário de teste para você e fazer login.

## Dia 2 — Passeio guiado

Faça cada fluxo abaixo **com um veículo real de teste** no ambiente de dev:

- [ ] Cadastrar um cliente PF.
- [ ] Cadastrar um veículo vinculado.
- [ ] Criar uma OS de "Transferência".
- [ ] Mover a OS pelos status (kanban) até `doc_pronto`.
- [ ] Marcar itens do checklist como recebido/pendente/N/A.
- [ ] Fazer upload de um PDF de CRV na OS.
- [ ] Gerar um Protocolo Diário com a placa.
- [ ] Abrir o módulo Financeiro e ver a cobrança gerada.

Anote qualquer coisa confusa — vale PR de UX depois.

## Dia 3 — Mergulho no código

Leia, nessa ordem, sem ainda mudar nada:

- [ ] `src/main.tsx` → `src/App.tsx` (pelo menos o topo e as rotas na
      linha ~1630).
- [ ] `src/lib/supabaseClient.ts` → `src/lib/database.ts` (mappers!).
- [ ] Uma página inteira: sugiro `src/pages/OSDetail.tsx`. É a mais
      complexa; se você sobreviver a ela, o resto é tranquilo.
- [ ] `src/lib/financeService.ts` — entender cobrança vs. pagamento.
- [ ] `src/lib/configService.ts` — checklist dinâmico por tipo de serviço.
- [ ] Uma Edge Function qualquer: `supabase/functions/gemini-proxy/index.ts`.
- [ ] [`/ANALISE_CRM_COMPLETA.md`](../../ANALISE_CRM_COMPLETA.md) §
      prioridades recomendadas (Sprint 1/2/3/4).

## Dia 4 — Primeira micro-tarefa

Escolha **uma** das abaixo (todas são pequenas, documentadas, e agregam).
Não invente outra ainda:

### Opções (ordem = impacto crescente, risco crescente)

1. **UI-1** — Corrigir `var(--notion-surface))` com parêntese duplo em
   `Financeiro.tsx`, `OSDetail.tsx` e `RecebimentoModal.tsx`.
   *(10 min de fix, revela você sabe navegar no repo.)*
2. **CODE-3** — Remover `src/lib/ds.ts` (dead code) e verificar via grep
   que nada importa.
3. **UI-4** — Mudar default de `ConfirmProvider` para `danger: false` e
   auditar chamadas que deveriam ser danger=true.
4. **CODE-4** — Remover `viewerUrl`/`viewerTitle`/`viewerOpen` mortos de
   `OSDetail.tsx` (e o componente `DocumentViewer` se não for usado).
5. **FIN-1** — Corrigir deleção de pagamentos órfãos em `financeService.ts`
   / `database.ts`. **Requer teste manual cuidadoso** com OS + pagamentos
   reais no dev.

Fluxo recomendado (vale pra qualquer task):

1. Crie branch `fix/<codigo-da-divida>-descricao`.
2. Escreva um repro manual (passo a passo no dev).
3. Faça o fix com mínimo footprint. Sem refactor adjacente.
4. Rode o repro — tem que passar.
5. `npm run build` — zero erros.
6. Commit curto, PR com "antes/depois" + screenshots se UI.

## Dia 5 — Pairing & retro

- [ ] Apresentar o PR do dia 4 para alguém do time (revisão em tela).
- [ ] Listar 3 coisas que confundiram você — vão virar melhoria desta
      doc ou do código.
- [ ] Se algo aqui estava errado/desatualizado, **edite este arquivo**
      e mande PR. Este kit é vivo.

## Sinais de que você está "pronto"

- Consegue dizer, sem consultar, onde fica o CRUD de OS, o service de
  financeiro, e onde o ExtensionListener roda.
- Sabe a diferença entre "vistoria" e "delegacia" no workflow.
- Sabe que RLS está aberto e por quê.
- Entende por que `supabase-schema.sql` **não** é a verdade completa.
- Rodou ao menos uma Edge Function localmente.

## Referências rápidas

- Código-fonte: `/src/`, `/chrome-extension/`, `/supabase/functions/`.
- Design: `/design/`.
- Dívida técnica: `/ANALISE_CRM_COMPLETA.md`, `/ANALISE_BANCO.md`,
  `/REVIEW_FINANCEIRO.md`.
- Migrations: `/migrations/` (ordem cronológica).
- Workflow CI: `/.github/workflows/`.

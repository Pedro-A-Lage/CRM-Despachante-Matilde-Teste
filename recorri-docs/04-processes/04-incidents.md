# Incidentes — como lidar com problemas

> Quando o CRM quebra para o escritório usar, é incidente. Agimos rápido,
> registramos o que aprendemos, prevenimos repetição.

---

## Classificação

| Severidade | O que é                                                    | Resposta             |
| ---------- | ---------------------------------------------------------- | -------------------- |
| **SEV-1**  | CRM fora do ar / login quebrado / perda de dados           | Imediata, 24h        |
| **SEV-2**  | Fluxo crítico travado (criar OS, checklist) mas tem workaround | No mesmo dia     |
| **SEV-3**  | Erro em fluxo secundário (relatório errado, botão quebrado) | Próximo sprint      |
| **SEV-4**  | Cosmético, inconveniente leve                              | Backlog normal       |

---

## Fluxo SEV-1 / SEV-2

### 1. Detecção

Fonte tipicamente:
- Usuário avisa no chat.
- Dev percebe monitorando.
- Erro em log do Supabase.

### 2. Declaração

Post no canal `#incidentes`:

```
🚨 INCIDENTE — Sev 1

O que: login não entra com senha correta
Desde quando: ~09h40 (15 min)
Impacto: 100% dos usuários sem acesso ao CRM
Quem está olhando: @maria
Canal de coordenação: #incidentes
```

### 3. Coordenação

**Uma pessoa assume "incident commander"** (IC). Responsabilidades:

- Comunicar status a cada 15 min no canal.
- Coordenar investigação (não necessariamente codar).
- Chamar ajuda quando precisar.

### 4. Mitigação

Prioridade: **parar o sangramento**, não consertar a causa raiz.

Opções típicas:
- **Rollback** do último deploy (ver
  [`../03-engineering/05-deployment.md`](../03-engineering/05-deployment.md)).
- **Feature flag** desativando o trecho quebrado.
- **Hotfix** minimalista.

### 5. Resolução

Quando o serviço voltou:

```
✅ RESOLVIDO — Sev 1

Causa: migration 2026-04-16 adicionou coluna NOT NULL sem default,
       quebrou inserts pela aplicação.
Mitigação: rollback da migration + redeploy do front anterior.
Tempo total: 37 min.
Ação: post-mortem marcado pra amanhã 15h.
```

### 6. Post-mortem — em até 24h

Reunião curta (30 min), **blameless**. Três perguntas:

1. **O que aconteceu?** Timeline fato-a-fato.
2. **Por que aconteceu?** Causa raiz (5 porquês — não pare no óbvio).
3. **O que vamos mudar?** Ações concretas com responsável.

Registre em `incidents/YYYY-MM-DD_titulo-curto.md` (criar pasta quando
começar). Template:

```markdown
# Incidente 2026-04-16 — Login quebrado

**Severidade:** SEV-1
**Duração:** 09h40 → 10h17 (37 min)
**Impacto:** ~12 usuários sem acesso

## Timeline

- 09h40 — Migration aplicada em prod.
- 09h42 — Usuários começam a reportar login inválido.
- 09h55 — Maria identifica migration como causa provável.
- 10h01 — Rollback iniciado.
- 10h17 — Login funcionando novamente.

## Causa raiz

A migration adicionou `ativo BOOLEAN NOT NULL` na `usuarios` sem default.
O insert de log de login tentou atualizar a tabela e quebrou.

## O que deu certo

- Rollback funcionou na primeira tentativa.
- Canal de comunicação respondeu rápido.

## O que pode melhorar

- Migrations em tabela `usuarios` precisam de revisão extra.
- Staging não pegou o erro — faltou teste de login lá.

## Ações

- [ ] @joao — Criar checklist de migration em tabelas críticas (antes do PR).
- [ ] @maria — Teste manual de login obrigatório em staging pós-migration.
- [ ] @pedro — Investigar deploy canário pro front.
```

### 7. Follow-up

Todas as ações do post-mortem viram **issues** no GitHub, com label
`post-mortem` + `priority:alta`. Tech lead acompanha até fechar.

---

## Fluxo SEV-3 / SEV-4

Não precisa declaração nem post-mortem. **Abra issue** normal, com label
`type:bug` e prioridade. Entra no backlog.

---

## Comunicação com o escritório (usuários)

Quem comunica:

- **SEV-1** — tech lead ou IC, direto no grupo do escritório.
- **SEV-2** — quem notou, com copy aprovado pelo IC.

Regras:

- **Honesto.** "Tá com problema, estamos olhando" > "já vai voltar".
- **Com ETA realista.** Se não sabe, "ainda investigando, aviso em 15 min".
- **Um canal só.** Não desencontre mensagens.
- **Atualiza mesmo se nada mudou.** Silêncio aumenta ansiedade.
- **Fechamento claro** — "voltou, pode testar aí? avisa se ainda vê algo
  estranho".

---

## Prevenção (cotidiano)

Coisas que evitam incidente antes de acontecer:

### Pré-deploy
- `npm run build` sempre antes do PR.
- Migration em staging antes de prod.
- Teste manual de fluxo crítico.

### Em produção
- Monitorar erros do Supabase (Edge Function logs).
- Monitorar console do browser dos usuários (quando possível).
- Feedback curto do escritório ("tá rodando bem?") toda sexta.

### Design
- Feature flag em mudança arriscada.
- Rollback plan no PR (especialmente migration).
- Degradação graceful (se uma integração cai, resto continua).

---

## Post-mortem blameless — o que significa

A pessoa que causou o incidente **não é o problema**. O sistema que permitiu
a pessoa causar o incidente é o problema.

- ❌ "A Maria esqueceu de testar"
- ✅ "Nosso processo não exige teste de login após migration em `usuarios`"

Blame mata a cultura de reportar cedo. Se a pessoa tem medo do post-mortem,
ela esconde o próximo incidente até estourar.

---

## Nunca aconteceu aqui?

Registre **o primeiro**. Criar `incidents/` e preencher o template ensina
o time a usar o fluxo antes da hora de pressão.

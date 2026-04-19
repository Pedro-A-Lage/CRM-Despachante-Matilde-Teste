# Developer Onboarding Kit — CRM Despachante Matilde

> Engineering Handbook / Kit de Onboarding — tudo que um novo dev precisa
> para contribuir no CRM do Despachante Matilde sem travar na primeira semana.

Leia nesta ordem:

| # | Capítulo | Para quê |
|---|----------|----------|
| 1 | [`01-setup.md`](./01-setup.md) | Instalar, rodar local, variáveis de ambiente |
| 2 | [`02-arquitetura.md`](./02-arquitetura.md) | Visão macro: frontend, backend, integrações |
| 3 | [`03-dominio-negocio.md`](./03-dominio-negocio.md) | Glossário: OS, vistoria, delegacia, SIFAP, placas |
| 4 | [`04-codebase.md`](./04-codebase.md) | Tour guiado das pastas `src/` e `chrome-extension/` |
| 5 | [`05-banco-de-dados.md`](./05-banco-de-dados.md) | Tabelas Supabase, migrations, Edge Functions |
| 6 | [`06-workflow-dev.md`](./06-workflow-dev.md) | Branches, commits, PRs, deploy, design system |
| 7 | [`07-extensao-chrome.md`](./07-extensao-chrome.md) | Como funciona a extensão Detran ↔ CRM |
| 8 | [`08-troubleshooting.md`](./08-troubleshooting.md) | FAQ, erros conhecidos, pegadinhas |
| 9 | [`09-primeira-tarefa.md`](./09-primeira-tarefa.md) | Checklist dos 5 primeiros dias |

## Leituras obrigatórias em paralelo

- [`/README.md`](../../README.md) — pitch do produto.
- [`/CLAUDE.md`](../../CLAUDE.md) — regras para agentes AI no repo.
- [`/design/README.md`](../../design/README.md) — design system (Claude Design v1.0).
- [`/ANALISE_CRM_COMPLETA.md`](../../ANALISE_CRM_COMPLETA.md) — dívida técnica
  conhecida (68 issues catalogadas). Consulte antes de mexer em auth, finanças
  ou RLS.

## Stack em 1 parágrafo

React 18 + Vite + TypeScript no frontend. Supabase (Postgres + Storage +
Edge Functions Deno) como backend. Google Drive API para pastas dos clientes.
Extensão Chrome (Manifest V3) que lê o portal Detran MG e empurra dados para
o CRM via `postMessage`. Node/Express (`server.js`) serve PDF de recibo.
Sem testes automatizados ainda.

## Quem contatar

- **Produto e regra de negócio:** dono do escritório (Despachante Matilde).
- **Infraestrutura / Supabase:** responsável técnico do projeto.
- **Design system:** veja [`/design/`](../../design/).

## Convenções deste kit

- Código em **português** (variáveis, pastas, UI). Comentários também.
- Moeda: **BRL**. Fuso: **America/Sao_Paulo**.
- Documentos: CPF/CNPJ, CNH, CRV, CRLV, ATPV-e, DAE, SIFAP — todos explicados
  em [`03-dominio-negocio.md`](./03-dominio-negocio.md).

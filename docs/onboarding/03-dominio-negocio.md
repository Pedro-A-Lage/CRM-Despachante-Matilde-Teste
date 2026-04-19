# 3. Domínio de Negócio — Glossário

O CRM atende o escritório de **Despachante Documentalista** da Matilde.
O negócio é levar documentação de veículos entre o proprietário, o Detran MG,
as delegacias e, quando aplicável, fábricas de placas e empresas parceiras.
Sem entender este vocabulário, a tela confunde.

## Atores

| Ator | O que faz no CRM |
|------|------------------|
| **Cliente** | Dono do veículo. PF (CPF) ou PJ (CNPJ). Pode ter múltiplos veículos. |
| **Veículo** | Identificado por placa + renavam + chassi. Pertence a um cliente. |
| **Ordem de Serviço (OS)** | Processo único. Um cliente + um veículo + um serviço. Tem número sequencial (`numero`). |
| **Operador** | Funcionário do despachante. Usuário do sistema. Permissões no `usuarios.permissoes`. |
| **Empresa Parceira** | Revenda, lotadora, transportadora que agrega volume. Paga em lote, tem relatório próprio (`painel-empresas`). |
| **Fábrica de Placas** | Empresa que estampa placa Mercosul. Recebe pedidos via e-mail (`send-email-placa`). |

## Documentos físicos

| Sigla | Nome | Onde aparece no CRM |
|-------|------|---------------------|
| **CRV** | Certificado de Registro de Veículo ("DUT") | Anexado ao veículo. Parser extrai dados em `pdfParser.ts` / `fichaCadastroAI.ts`. |
| **CRLV** | Certificado de Registro e Licenciamento | `crlv_consulta` (JSONB) na OS. |
| **ATPV-e** | Autorização para Transferência de Propriedade eletrônica | `veiculos.numeroATPVe` + extração AI em `atpveAI.ts`. |
| **DAE** | Documento de Arrecadação Estadual (boleto Detran) | PDF capturado pela extensão, vai pro Drive da OS. |
| **Laudo de Vistoria** | Resultado da vistoria veicular | Upload em `OSDetail` aba Vistoria. `vistoria_history` guarda apontamentos. |
| **CNH / RG / Contrato Social** | Identidade do cliente | `clientes.documentos` (JSONB com URLs). |
| **Folha de Cadastro** | Formulário preenchido pra Detran | Gerado em `gerarDocumentos2Via.ts`. |

## Serviços oferecidos

Lista viva em `service_config` (tabela) + `configService.ts`. Exemplos típicos:

- **Transferência** — mudança de proprietário (origem/destino MG).
- **1º Emplacamento** — carro 0km. Envolve fábrica de placa.
- **2ª Via de CRV / CRLV** — reemissão de documento perdido.
- **Troca de Placa** (Mercosul / dano / furto).
- **Baixa de Veículo** — sucateamento.
- **Alteração de Características** — mudança de cor, combustível, motor.

Cada serviço tem um **checklist dinâmico** gerado por
`gerarChecklistDinamico(tipoServico, tipoPessoa)` em `configService.ts`.

## Status da OS (workflow)

```
aguardando_documentacao ─▶ vistoria ─▶ delegacia ─▶ doc_pronto ─▶ entregue
```

- **aguardando_documentacao** — juntando CRV, CNH, CRLV etc.
- **vistoria** — agendada/realizada no Detran ou pátio credenciado.
- **delegacia** — envio físico de papéis para a delegacia (reconhecimento
  de firma, laudo, boletim de ocorrência).
- **doc_pronto** — CRV novo chegou do Detran.
- **entregue** — operador registrou entrega ao cliente.

Transições **não são validadas** no app hoje (dívida WF-1). O select
permite pular etapas. Tome cuidado ao mexer.

## SIFAP

**Serviço de Identificação de Falha / Apontamento de Processo** — quando
o Detran devolve um processo com pendência (exemplo: dado divergente,
carimbo faltando). A OS "entra em SIFAP", a papelada volta fisicamente
para o escritório, é corrigida, e **reentra**. O CRM registra:

- `ordens_de_servico.sifap` (JSONB) — entradas e saídas.
- Anotações por data no `ProtocoloDiario`.

## Protocolo Diário

Relatório em PDF que o motorista/tarefeiro leva para a delegacia e para o
SIFAP no começo do dia. Lista todas as placas que saíram do escritório
aquele dia para aqueles destinos. Gerado em `src/pages/ProtocoloDiario.tsx`.

## Vistoria

Inspeção física do veículo (chassi, motor, hodômetro) exigida em
transferência e emplacamento. O CRM tem **Calendário de Vistorias**
(`VistoriaCalendar.tsx`) + aba vistoria dentro da OS. Histórico em
`ordens_de_servico.vistoria_history`.

## Financeiro

Cada OS gera uma ou mais **cobranças** (`finance_charges`) vinculadas a
categorias (serviço, taxa Detran, reembolso, placa, vistoria). Cada
cobrança recebe **pagamentos** (`payments`) parciais ou integrais.

- `src/lib/financeService.ts` — CRUD de cobranças/pagamentos.
- `src/pages/Financeiro.tsx` — dashboard geral.
- `src/pages/ControlePagamentos.tsx` — conciliação.
- `src/components/finance/*` — componentes específicos.

⚠️ Bugs conhecidos (ANALISE § FIN-1..FIN-8): pagamentos órfãos ao deletar
OS, floating-point em somas, `exportAllData` pula finance. Leia antes de
mexer.

## Controle de Placas

Fluxo separado para pedidos de placa Mercosul. Uma OS com `troca_placa =
true` ou primeiro emplacamento gera **pedido de placa** para uma **fábrica
parceira**. Ver `src/pages/ControlePlacas.tsx`, `src/lib/placaService.ts`
e migrations `20260405000002_fabricas_placas.sql`.

## E-mails

Integração Outlook (Microsoft Graph) + Gmail. Funcionalidades:

- Ler caixa de entrada e anexos das pastas configuradas (Edge Functions
  `get-outlook-*`).
- Enviar e-mail padrão para empresa parceira e fábrica de placa
  (`send-email-empresa`, `send-email-placa`).
- Tokens de refresh obtidos via `scripts/get-outlook-refresh-token.mjs`
  e `get-gmail-token.mjs`.

## Convenções de moeda / data

- Todo valor monetário é **BRL** armazenado como `NUMERIC(10,2)`.
- Datas sensíveis (emissão CRV, aquisição) guardadas como `TEXT` no
  formato `dd/mm/yyyy` (do PDF) ou ISO — cuidado ao comparar.
- Timestamps (`criado_em`, `atualizado_em`) sempre `TIMESTAMPTZ`.
- Fuso de exibição: `America/Sao_Paulo`.

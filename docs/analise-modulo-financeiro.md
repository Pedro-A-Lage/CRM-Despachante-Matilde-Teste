# Análise do Módulo Financeiro — CRM Despachante Matilde
**Data:** 2026-03-20
**Analista:** Business Analyst Agent
**Escopo:** finance.ts, financeService.ts, Financeiro.tsx, FinancePainel.tsx

---

## Resumo Executivo

O módulo financeiro implementado representa uma base sólida para controle de cobranças por OS. A arquitetura de dados é coerente e o fluxo cobrança → pagamento → conciliação parcial está funcional. Contudo, o sistema está limitado ao controle de **custos repassados ao cliente** (taxas DETRAN), sem nenhuma visibilidade sobre **honorários do despachante**, **margem de lucro** ou **fluxo de caixa real**. Para um negócio que depende de sua rentabilidade operacional, esses são gaps críticos.

---

## 1. O Que Está Bem Implementado

**Modelo de dados limpo:**
- Separação correta entre `FinanceCharge` (o que deve ser cobrado) e `Payment` (o que foi efetivamente pago) permite rastrear pagamentos parciais com precisão.
- `valor_previsto` vs `valor_pago` na mesma entidade de cobrança é uma decisão inteligente — evita joins desnecessários para calcular saldo.
- `comprovante_url` presente tanto em `FinanceCharge` quanto em `Payment` — estrutura para upload de comprovantes já contemplada.

**Geração automática de cobranças (`gerarCobrancasIniciais`):**
- Lógica correta: DAE gerado apenas para transferência, primeiro emplacamento e segunda via (os 3 serviços que de fato geram DAE no DETRAN-MG).
- Placa e vistoria como flags separadas é o padrão correto — nem toda OS tem esses itens.
- Consulta de preço por código (`getPriceByCodigo`) desacopla o valor do código-fonte, permitindo atualização via tabela sem deploy.

**Conciliação de pagamento:**
- `addPayment` atualiza `valor_pago` e `status` na cobrança vinculada de forma automática.
- `deletePayment` reverte o valor corretamente — boa prática de integridade.
- `calcularResumo` filtra cobranças canceladas antes de somar — evita distorção dos totais.

**Interface (FinancePainel):**
- Visualização simultânea de cobranças e histórico de pagamentos por OS é o fluxo correto para o despachante no dia a dia.
- Badge de status por cobrança (A Pagar / Pago / Cancelado) com cores diferenciadas — boa UX.
- Modo `readOnly` implementado — bom para visualização sem edição acidental.

**Relatório global (Financeiro.tsx):**
- Filtro por período presente.
- Breakout por categoria (DAE, Vistoria, Placa, etc.) — útil para entender composição da receita.
- Contador de OS com pendência — métrica operacional relevante.

---

## 2. Gaps Críticos no Modelo de Negócio

### Gap 1 — Honorários do despachante AUSENTES (crítico)
Este é o gap mais grave. Todo o módulo modela apenas as **taxas repassadas ao cliente** (DAE, vistoria, placa). O **honorário do despachante** — que é a receita real do negócio — não existe como categoria, não entra em nenhum cálculo de resumo, e o relatório global não o exibe. O despachante não consegue ver sua própria receita operacional.

Impacto: impossível calcular faturamento, margem ou lucratividade com os dados atuais.

### Gap 2 — Sem distinção entre custo (saída) e receita (entrada)
O campo `valor_previsto` é usado indiscriminadamente para taxas DETRAN (custo repassado) e potencialmente para honorários (receita). Não há campo `tipo: 'receita' | 'custo'` ou estrutura equivalente. Isso impede qualquer cálculo de margem ou DRE simplificado.

### Gap 3 — Relatório ignora o filtro de período
Em `getRelatorio`, os parâmetros `inicio` e `fim` são recebidos mas **nunca aplicados** na query do Supabase. A query busca **todas as cobranças não canceladas** sem filtro de data:
```
.from('finance_charges').select('*').neq('status', 'cancelado')
// filtro de período ausente — bug confirmado
```
O usuário seleciona um período na tela, clica "Filtrar", e recebe sempre o total histórico completo.

### Gap 4 — Sem controle de inadimplência por vencimento
`due_date` existe no modelo mas não é usado em nenhum cálculo, alerta ou filtro. Cobranças vencidas não são identificadas como "em atraso" — apenas ficam como "a_pagar" indefinidamente. O despachante não tem visão de quais clientes estão em atraso.

### Gap 5 — Placa hardcoded para carro mercosul
Em `gerarCobrancasIniciais`, placa usa sempre o código `placa_carro_mercosul` independente do tipo de veículo. Moto (R$150), caminhão e demais categorias nunca são considerados. O preço gerado automaticamente pode estar errado em uma parcela significativa dos processos.

### Gap 6 — Pagamentos sem vínculo ao cliente
A entidade `Payment` não tem campo `cliente_id` nem `cliente_nome`. O histórico de pagamentos existe apenas no contexto da OS. Não é possível gerar um extrato por cliente ou identificar clientes com padrão de inadimplência.

### Gap 7 — Sem separação entre cobrança ao cliente e custo real
O despachante frequentemente adianta taxas DETRAN e depois cobra o cliente. Não há campo para registrar se a taxa já foi paga pelo despachante ao DETRAN (custo de caixa) separadamente do recebimento do cliente. Isso cria risco de fluxo de caixa invisível.

---

## 3. Tabela de Preços — Análise

**Itens confirmados como corretos:**
- DAE R$150,54 — valor oficial DETRAN-MG 2025/2026
- Vistoria R$133,17 — valor oficial ECV/DETRAN-MG

**Itens ausentes na tabela de preços:**

| Código sugerido | Descrição | Valor referência |
|---|---|---|
| `honorario_transferencia` | Honorário despachante — transferência | A definir |
| `honorario_primeiro_emplacamento` | Honorário — 1º emplacamento | A definir |
| `honorario_segunda_via` | Honorário — 2ª via CRV | A definir |
| `placa_moto_mercosul` | Placa Mercosul moto | ~R$150 |
| `placa_caminhao_mercosul` | Placa Mercosul caminhão | A verificar |
| `trlav` | TRLAV (transferência de estado) | Variável |
| `ipva_proporcional` | IPVA proporcional | Variável |
| `multa_debito` | Débito de multa | Variável |
| `despesa_correios` | Envio de documentos | Variável |
| `reconhecimento_firma` | Cartório / reconhecimento de firma | Variável |

**Problema estrutural:** a tabela atual é de preço fixo. IPVA, multas e TRLAV são valores variáveis por veículo — precisariam de categoria `outro` com valor manual, o que já existe mas não está documentado como fluxo padrão.

---

## 4. Fluxo Financeiro — Análise

**Fluxo atual implementado:**
```
Criar OS → Gerar cobranças automáticas → Registrar pagamento → Conciliar cobrança
```

**Fluxo completo necessário para o negócio:**
```
Criar OS
  → Gerar cobranças de custo (taxas DETRAN) [implementado]
  → Gerar cobrança de honorários ao cliente [AUSENTE]
  → Registrar adiantamento do despachante ao DETRAN [AUSENTE]
  → Receber pagamento do cliente [implementado]
  → Conciliar cobrança [implementado, com bug de período]
  → Emitir recibo / nota para o cliente [AUSENTE]
  → Alertar vencimento [AUSENTE]
  → Fechar OS como financeiramente quitada [AUSENTE — sem gatilho automático]
```

**Sem fluxo de caixa:** não existe nenhuma visão de entradas vs saídas no período. O relatório mostra "previsto" e "recebido" por categoria de cobrança, mas não responde: "quanto dinheiro entrou na conta esta semana?".

---

## 5. Relatórios — Análise

**Disponível atualmente:**
- Total previsto vs recebido vs pendente (sem filtro de período funcional — ver Gap 3)
- Breakdown por categoria
- Contagem de OS com pendência

**Relatórios essenciais ausentes:**

| Relatório | Prioridade | Por quê |
|---|---|---|
| Faturamento por período (apenas honorários) | Alta | Receita real do negócio |
| Inadimplência — cobranças vencidas sem pagamento | Alta | Gestão de recebíveis |
| Lucratividade por tipo de serviço | Média | Quais serviços têm melhor margem |
| Extrato por cliente | Média | Clientes frequentes e histórico |
| Fluxo de caixa (entradas x saídas por semana/mês) | Média | Gestão de capital de giro |
| Projeção de receita (OS em andamento com cobrança pendente) | Baixa | Planejamento |
| Ranking de clientes por volume | Baixa | Fidelização |

---

## 6. Integrações Faltando

**Com o bot DETRAN (bot/):**
- A emissão do DAE pelo bot (`emitirDAE`) não retroalimenta o módulo financeiro — quando o DAE é gerado com sucesso, a cobrança correspondente não é automaticamente marcada como confirmada/emitida. São sistemas paralelos sem integração.
- Custo sugerido: adicionar campo `dae_emitido: boolean` e `dae_codigo_barra` na cobrança do tipo `dae_principal`.

**Notificações:**
- Sem envio de alerta de vencimento (WhatsApp, e-mail ou push) para o cliente ou para o despachante.
- Sem alerta interno quando uma OS fica com cobrança vencida há mais de X dias.

**Comprovantes:**
- `comprovante_url` existe no modelo mas não há fluxo de upload implementado nos componentes analisados (AddChargeModal e PaymentModal não foram analisados aqui, podem já ter isso).

**Nota fiscal / recibo:**
- Não há geração de recibo para o cliente. Para o despachante formalizar o serviço prestado, seria necessário ao menos um PDF simples com os valores cobrados e o serviço realizado.

---

## 7. Sugestões de Evolução Priorizadas

### Curto Prazo (até 4 semanas)

1. **Corrigir o bug do filtro de período** em `getRelatorio` — adicionar `.gte('criado_em', inicio).lte('criado_em', fim)` na query do Supabase. É uma linha de código e distorce todos os relatórios hoje.

2. **Adicionar categoria `honorario`** em `FinanceChargeCategoria` e incluir geração automática de honorário em `gerarCobrancasIniciais` com valor vindo da tabela de preços por tipo de serviço.

3. **Usar `due_date` para sinalizar inadimplência** — cobranças com `due_date < hoje` e `status = 'a_pagar'` devem receber badge "Vencido" no painel por OS.

4. **Corrigir seleção de placa por tipo de veículo** — `gerarCobrancasIniciais` precisa receber o tipo de veículo (carro/moto/caminhão) para buscar o código correto na price table.

### Médio Prazo (1 a 3 meses)

5. **Adicionar campo `tipo: 'receita' | 'custo'`** em `FinanceCharge` para separar o que é taxa repassada (custo para o cliente) do que é honorário (receita do despachante). Isso viabiliza cálculo de margem.

6. **Relatório de inadimplência** — lista de OS com cobranças vencidas, ordenada por dias em atraso, com botão de ação rápida para registrar pagamento ou contato com o cliente.

7. **Relatório de faturamento por honorários** — separado das taxas DETRAN, mostrando somente a receita operacional do despachante por período.

8. **Integração bot → financeiro** — quando `emitirDAE` retornar sucesso, marcar a cobrança `dae_principal` correspondente com `dae_emitido = true` e salvar o código de barras.

### Longo Prazo (3 a 6 meses)

9. **Geração de recibo em PDF** — ao marcar uma OS como financeiramente quitada, gerar PDF com dados do cliente, veículo, serviços prestados e valores cobrados.

10. **Fluxo de caixa real** — visão de entradas (pagamentos recebidos) vs saídas (adiantamentos ao DETRAN registrados manualmente) por período, com saldo projetado.

11. **Dashboard gerencial** — cards de: faturamento do mês, ticket médio por serviço, taxa de inadimplência, OS abertas com saldo pendente, comparativo mês a mês.

12. **Extrato por cliente** — histórico financeiro consolidado por CPF/CNPJ, com volume total movimentado e status de todas as OS.

---

## 8. Avaliação de Risco

| Risco | Severidade | Status |
|---|---|---|
| Relatório com dados incorretos por bug de período | Alta | Ativo — corrigir imediatamente |
| Ausência de honorários distorce visão de receita | Alta | Ativo — gap estrutural |
| Placa sempre calculada como carro — preço errado em motos | Média | Ativo |
| Sem backup de conciliação — deletar pagamento reverte estado | Média | Monitorar |
| Crescimento de dados sem paginação no relatório global | Baixa | Risco futuro |

---

## Conclusão

O módulo está funcionalmente correto para seu escopo atual (controle de taxas DETRAN por OS), mas é insuficiente para ser chamado de módulo financeiro de negócio. A ausência de honorários e a ausência de distinção receita/custo são gaps que impedem o despachante de entender sua própria rentabilidade. O bug do filtro de período é o item mais urgente por comprometer a confiabilidade dos dados já exibidos. Com as correções de curto prazo implementadas, o módulo passaria a cobrir os principais fluxos financeiros do dia a dia operacional.

# Design: Captura Automática do Decalque de Chassi

**Data:** 2026-04-01  
**Escopo:** Chrome Extension + CRM (App.tsx + OSDetail)

---

## Escopo de serviços

Esta captura **só é ativada** para dois tipos de serviço:
- `transferencia` — Transferência de Propriedade
- `alteracao_dados` — Alteração de Dados

O `content_detran.js` verifica `matilde_servico_ativo` no `chrome.storage.local` antes de processar qualquer modal. Se o serviço ativo não for um desses dois tipos, o modal é ignorado.

---

## Problema

Após finalizar uma transferência de propriedade ou alteração de dados no Detran MG, o sistema gera um PDF com 2 páginas:
- **Página 1:** Decalque de Chassi — documento de cadastro com todos os dados da transferência
- **Página 2:** DAE — boleto de pagamento (ignorado)

Hoje a Matilde precisa baixar esse PDF manualmente e subir no CRM via botão `upload-pdf-detran-crono` na tela de OS. O objetivo é automatizar esse processo.

---

## Solução

A extensão detecta o modal com o PDF, extrai o base64, envia ao CRM. O CRM roda a IA, valida ou cria a OS, e faz o upload para o Supabase.

---

## Arquitetura

```
Detran MG (modal aparece com #link-pdf-dae)
    ↓
content_detran.js
  - MutationObserver detecta modal com #link-pdf-dae
  - Verifica chrome.storage.local: matilde_servico_ativo === 'transferencia' | 'alteracao_dados'
  - Se serviço não for elegível → ignora o modal
  - Extrai base64 do atributo href do link
  - Envia para background.js: { action: 'CAPTURE_DAE_PDF', base64, placa, chassi }
    ↓
background.js
  - Lê contexto do chrome.storage.local: matilde_osId, matilde_placa, matilde_chassi, matilde_servico_ativo
  - Inclui servicoAtivo no payload
  - Envia para CRM via chrome.tabs.sendMessage: tipo CAPTURED_DAE_PDF
    ↓
crm_bridge.js
  - Recebe mensagem da extensão
  - Dispara CustomEvent MATILDE_DATA_RECEIVED { type: 'CAPTURED_DAE_PDF', payload }
    ↓
App.tsx (novo handler no useEffect)
  - Recebe payload: { fileBase64, osId?, placa?, chassi? }
  - Converte base64 → File
  - Roda atpveAI (somente página 1 do PDF — Decalque)
  - Decide cenário (A ou B)
```

---

## Cenário A — OS já existe (foi com dados pré-preenchidos)

**Trigger:** `osId` presente no payload (vindo do `chrome.storage.local`)

**Fluxo:**
1. IA extrai campos do Decalque (placa, chassi, renavam, CPF comprador)
2. Carrega OS do Supabase pelo `osId`
3. Compara campos:
   - `placa` PDF vs `os.veiculo.placa`
   - `chassi` PDF vs `os.veiculo.chassi`
   - `cpfCnpj comprador` PDF vs `os.transferencia.cpfCnpjComprador`
4. **Se tudo bate:**
   - Upload do PDF para Supabase: `ordens/{osId}/pdf_detran_{timestamp}.pdf`
   - Salva URL no campo `pdfDetranUrl` da OS
   - Toast de sucesso: "Decalque de Chassi salvo automaticamente"
5. **Se houver divergência:**
   - Alert listando quais campos não batem
   - PDF não é salvo (Matilde decide o que fazer)

---

## Cenário B — Sem OS (foi sem preencher nada)

**Trigger:** `osId` ausente no payload

**Fluxo:**
1. IA extrai todos os campos do Decalque (página 1 completa)
2. Busca cliente na base do Supabase pelo CPF/CNPJ do comprador extraído
3. **Se cliente já existe:**
   - Puxa todos os dados do cliente (incluindo telefone)
   - Abre `ATPVeModal` em modo manual com todos os campos pré-preenchidos
   - Matilde revisa os dados e confirma → OS criada
4. **Se cliente não existe:**
   - Abre `ATPVeModal` em modo manual com dados do Decalque pré-preenchidos
   - Campo telefone fica vazio — Matilde preenche manualmente
   - Matilde confirma → OS criada + cliente novo cadastrado

> Em ambos os sub-casos, a OS **nunca é criada automaticamente** — sempre depende da confirmação da Matilde no modal.

---

## Campos extraídos pela IA (Decalque — página 1)

### Identificação do veículo
| Campo PDF | Campo interno |
|---|---|
| PLACA | `placa` |
| CHASSI | `chassi` |
| RENAVAM | `renavam` |
| VALOR DO RECIBO | `valorRecibo` |
| DATA DA AQUISIÇÃO | `dataAquisicao` |
| MUNICÍPIO DE EMPLACAMENTO | `municipioEmplacamento` |

### Dados do proprietário (comprador)
| Campo PDF | Campo interno |
|---|---|
| NOME DO PROPRIETÁRIO | `comprador.nome` |
| CPF/CNPJ | `comprador.cpfCnpj` |
| N. DOC. IDENTIDADE | `comprador.rg` |
| ÓRGÃO EXPEDIDOR | `comprador.orgaoExpedidor` |
| SIGLA UF | `comprador.uf` |
| ENDEREÇO | `comprador.endereco` |
| NÚMERO | `comprador.numero` |
| CEP | `comprador.cep` |
| BAIRRO | `comprador.bairro` |
| MUNICÍPIO | `comprador.municipio` |

### Dados do proprietário anterior (vendedor)
| Campo PDF | Campo interno |
|---|---|
| NOME DO PROPRIETÁRIO | `vendedor.nome` |
| CPF/CNPJ | `vendedor.cpfCnpj` |

### Características do veículo
| Campo PDF | Campo interno |
|---|---|
| TIPO | `tipoVeiculo` |
| MARCA/MODELO | `marcaModelo` |
| ANO FAB | `anoFabricacao` |
| ANO MODELO | `anoModelo` |
| COR | `cor` |
| COMBUSTÍVEL | `combustivel` |

---

## Prompt da IA (Decalque)

Novo prompt específico para o Decalque, diferente do ATPV-e existente. Identifica o documento como "decalque" e extrai apenas da página 1 (Decalque Chassi), ignorando página 2 (DAE).

---

## Arquivos a modificar

| Arquivo | O que muda |
|---|---|
| `chrome-extension/content_detran.js` | MutationObserver para detectar `#link-pdf-dae`, extração do base64, envio ao background |
| `chrome-extension/background.js` | Handler para `CAPTURE_DAE_PDF`, leitura do contexto, envio ao CRM |
| `src/lib/atpveAI.ts` | Novo prompt `PROMPT_DECALQUE` + função `extrairDecalque(file)` |
| `src/App.tsx` | Novo handler para `CAPTURED_DAE_PDF` no useEffect do ExtensionListener |
| `src/lib/supabaseStorage.ts` | Nenhuma mudança — já suporta upload genérico |

---

## Fora do escopo

- Página 2 do PDF (DAE) — não é analisada
- Qualquer serviço que não seja `transferencia` ou `alteracao_dados`
- Outros tipos de documento gerados pelo Detran (vistoria, licenciamento, etc.)
- Envio automático do DAE para pagamento

---

## Critérios de sucesso

- Cenário A: PDF salvo automaticamente em < 5s após aparecer o modal, sem interação manual
- Cenário A: Divergência de dados exibe alerta claro com campos específicos que diferem
- Cenário B (cliente existe): todos os campos pré-preenchidos incluindo telefone — Matilde confirma no modal → OS criada
- Cenário B (cliente novo): todos os campos do Decalque pré-preenchidos, apenas telefone vazio para Matilde preencher

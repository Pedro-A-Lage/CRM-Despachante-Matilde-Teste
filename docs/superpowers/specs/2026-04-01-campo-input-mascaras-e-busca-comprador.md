# CampoInput com Máscaras + Busca de Comprador por CPF/CNPJ

**Data:** 2026-04-01  
**Arquivo afetado:** `src/components/ATPVeModal.tsx`

---

## Objetivo

1. Evitar duplicação de clientes no modo manual, buscando o comprador por CPF/CNPJ antes de criar.
2. Padronizar campos de data, valor, chassi e RENAVAM com máscaras de entrada.

---

## Funcionalidade 1 — Busca de Comprador por CPF/CNPJ

### Contexto

No modo ATPV-e (upload), a busca já existe (linhas ~220–231): após extração do PDF, o CPF/CNPJ extraído é confrontado com `getClientes()` e `clienteExistente` é definido. No modo manual esse gatilho não existe — ao confirmar, sempre cria um novo cliente.

### Novo estado

```tsx
const [buscandoComprador, setBuscandoComprador] = useState(false);
```

Adicionado após os demais estados de UI (`buscandoCep`, `erroCep`).

### Função `buscarComprador`

Localização: logo após `buscarCep`, antes de qualquer JSX.

```
buscarComprador():
  1. digits = cpfCnpj.replace(/\D/g, '')
  2. Se digits.length !== 11 && !== 14 → return (não aciona)
  3. setBuscandoComprador(true)
  4. clientes = await getClientes()
  5. encontrado = clientes.find(c => c.cpfCnpj.replace(/\D/g, '') === digits)
  6. Se encontrado:
       setClienteExistente({ id, nome })
       setTelefoneComprador((encontrado.telefones || [])[0] || '')
       updateDados('comprador.nome', encontrado.nome || '')
       // Endereço NÃO é pré-preenchido: o tipo Cliente não armazena campos de
       // endereço separados (endereco, bairro, municipio, uf, cep).
       // O usuário preenche o endereço manualmente após a busca.
     Senão:
       setClienteExistente(null)
  7. finally: setBuscandoComprador(false)
```

> Preenche apenas `comprador.nome` e `telefoneComprador` — são os únicos campos disponíveis no tipo `Cliente` (endereços não são armazenados separadamente no banco). O banner verde "Cliente encontrado" já existe e é reutilizado sem alteração.

### UI durante a busca

Enquanto `buscandoComprador === true`, o input CPF/CNPJ fica com `disabled={true}` e `opacity: 0.6`. Nenhum spinner adicional.

### Contrato de `onAfterUpdate`

`onAfterUpdate` recebe o valor **como digitado** (string raw, ex: `"123.456.789-00"` ou `"12345678901"`). `buscarComprador` sempre normaliza internamente com `.replace(/\D/g, '')`.

### Trigger

O campo `comprador.cpfCnpj` (linha 643) é substituído por `<CampoInput mascara="cpfcnpj" onAfterUpdate={buscarComprador} disabled={buscandoComprador} />`. O `onAfterUpdate` é chamado pelo `CampoInput` após cada `updateDados`.

### Reset

`resetModal` recebe: `setBuscandoComprador(false)`.

---

## Funcionalidade 2 — Componente `CampoInput`

### Localização

Declarado no topo de `ATPVeModal.tsx`, logo após `Campo`, fora do componente principal.

### Interface

```tsx
CampoInput({
  nome: string,
  path: string,
  value: string,
  onUpdate: (path: string, value: string) => void,
  mascara: 'data' | 'moeda' | 'chassi' | 'renavam' | 'cpfcnpj',
  onAfterUpdate?: (valor: string) => void,   // recebe o valor raw como digitado
  obrigatorio?: boolean,   // aplica fundo amarelo + asterisco (como dataAquisicao atual)
  disabled?: boolean,      // desabilita input (usado em buscandoComprador)
  placeholder?: string,    // default por máscara: data→'DD/MM/AAAA', demais→undefined
})
```

### Visual

Idêntico ao `Campo` existente: `campoStyle` no container, `labelStyle` no rótulo, `valorStyle` no input. Sem nova dependência.

### Lógica de cada máscara

| Máscara | Regra de transformação |
|---|---|
| `data` | Filtra não-dígitos; insere `/` após posição 2 e 4; máx 10 chars. Ex: `12/03/2025` |
| `moeda` | Filtra não-dígitos; divide por 100; formata `R$ 1.500,00` via `toLocaleString('pt-BR')` |
| `chassi` | Alfanumérico apenas (`/[^A-Z0-9]/g`); `toUpperCase()`; máx 17 chars |
| `renavam` | Apenas dígitos; máx 11 chars |
| `cpfcnpj` | Passa dígitos + `./-`; sem transformação extra; chama `onAfterUpdate` após `onUpdate` |

O `value` exibido é sempre o valor já armazenado em `dados` (via prop). A transformação acontece no `onChange` antes de chamar `onUpdate`.

> **Limitação conhecida (fora de escopo):** Para `moeda`, se o valor armazenado vier do PDF como string não formatada (ex: `"500.00"`), o display mostrará o valor raw até o usuário editar o campo. Não é corrigido neste escopo.

---

## Campos Substituídos

| Campo atual | Linha aprox. | Substituição |
|---|---|---|
| `<Campo nome="Chassi" path="chassi" .../>` | 616 | `<CampoInput mascara="chassi" />` |
| `<Campo nome="Renavam" path="renavam" .../>` | 617 | `<CampoInput mascara="renavam" />` |
| `<Campo nome="Valor da Venda (R$)" path="valorRecibo" .../>` | 816 | `<CampoInput mascara="moeda" />` |
| Inline custom input de `dataAquisicao` | 817–832 | `<CampoInput mascara="data" obrigatorio />` |
| `<Campo nome="CPF/CNPJ" path="comprador.cpfCnpj" .../>` | 643 | `<CampoInput mascara="cpfcnpj" onAfterUpdate={buscarComprador} />` |

> **Nota:** O campo `dataAquisicao` já tem JSX inline customizado (linhas 817–832) com estilo de obrigatório (fundo amarelo, asterisco). O `CampoInput` com `obrigatorio` deve replicar esse comportamento e substituir todo esse bloco.

---

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/components/ATPVeModal.tsx` | Novo componente `CampoInput`, novo estado `buscandoComprador`, nova função `buscarComprador`, 5 substituições de campos, `resetModal` atualizado |

---

## O que NÃO muda

- Lógica de confirmação (`confirmar`) — `clienteExistente` já é respeitado
- Banner "Cliente encontrado" — reutilizado sem alteração
- Campo `dataAquisicao` fora do modo manual (se já tiver JSX customizado no fluxo ATPV-e, mantém)
- Campos não listados na tabela acima

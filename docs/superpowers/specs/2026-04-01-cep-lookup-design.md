# Design: Busca de Endereço por CEP no ATPVeModal

**Data:** 2026-04-01  
**Escopo:** `src/components/ATPVeModal.tsx` — seção Comprador, **modo manual apenas**

---

## Objetivo

Ao preencher o CEP do comprador no modo manual, o usuário pode clicar "Buscar" para autocompletar os campos de endereço via API ViaCEP. Campos já preenchidos não são sobrescritos.

---

## Comportamento

### Trigger

- Botão "Buscar" posicionado ao lado do input de CEP
- Botão desabilitado se CEP tiver menos de 8 dígitos numéricos
- Só disponível em `modoManual === true`

### Fluxo de sucesso

1. Usuário digita CEP (ex: `30130100`)
2. Clica "Buscar"
3. Botão exibe spinner + texto "Buscando..." + fica desabilitado
4. API retorna dados
5. Preenche **apenas campos vazios**:
   - `comprador.endereco` ← `logradouro`
   - `comprador.bairro` ← `bairro`
   - `comprador.municipio` ← `localidade`
   - `comprador.uf` ← `uf`
6. Botão volta ao estado normal

### Fluxo de erro

- CEP não encontrado (API retorna `{ erro: true }`) → mensagem inline: "CEP não encontrado."
- Erro de rede → mensagem inline: "Erro ao buscar CEP. Verifique sua conexão."
- Mensagem desaparece após 4 segundos
- Botão volta ao estado normal

### Regra de não-sobrescrita

Para cada campo, só preenche se `dados.comprador[campo]?.trim() === ''`.

---

## Implementação

### Estado novo

```ts
const [buscandoCep, setBuscandoCep] = useState(false);
const [erroCep, setErroCep] = useState('');
```

### Função `buscarCep`

```ts
const buscarCep = async () => {
    const cepLimpo = (dados?.comprador?.cep || '').replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;

    setBuscandoCep(true);
    setErroCep('');
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        const json = await res.json();
        if (json.erro) {
            setErroCep('CEP não encontrado.');
            setTimeout(() => setErroCep(''), 4000);
            return;
        }
        // Preenche apenas campos vazios
        if (!dados?.comprador?.endereco?.trim()) updateDados('comprador.endereco', json.logradouro || '');
        if (!dados?.comprador?.bairro?.trim())   updateDados('comprador.bairro',   json.bairro     || '');
        if (!dados?.comprador?.municipio?.trim()) updateDados('comprador.municipio', json.localidade || '');
        if (!dados?.comprador?.uf?.trim())        updateDados('comprador.uf',        json.uf         || '');
    } catch {
        setErroCep('Erro ao buscar CEP. Verifique sua conexão.');
        setTimeout(() => setErroCep(''), 4000);
    } finally {
        setBuscandoCep(false);
    }
};
```

### Layout do campo CEP

O campo CEP deixa de usar o componente `<Campo>` genérico e passa a ter layout inline customizado:

```
[ input CEP (flex: 1) ] [ Buscar (botão) ]
```

Com mensagem de erro abaixo quando `erroCep` estiver preenchido.

### Condição de ativação

O botão só aparece quando `modoManual === true`. No modo ATPV-e o campo CEP continua como `<Campo>` normal sem botão.

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/components/ATPVeModal.tsx` | Estados `buscandoCep` e `erroCep`, função `buscarCep`, layout inline do campo CEP |

---

## Fora do escopo

- Modo ATPV-e não recebe busca de CEP
- Número do imóvel não é preenchido (específico do endereço)
- Sem máscara de formatação no input de CEP
- Sem cache das consultas

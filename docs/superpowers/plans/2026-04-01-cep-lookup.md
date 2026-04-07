# CEP Lookup (ViaCEP) no ATPVeModal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar busca automática de endereço por CEP via ViaCEP no campo CEP do comprador no ATPVeModal (modo manual apenas), com botão "Buscar" e preenchimento de campos vazios.

**Architecture:** Dois novos estados (`buscandoCep`, `erroCep`) e uma função `buscarCep` adicionados ao componente. O campo CEP existente (linha 629, `<Campo nome="CEP" .../>`) é substituído por um layout inline com input + botão. A busca só é ativada em `modoManual === true`.

**Tech Stack:** React, TypeScript, fetch nativo (sem biblioteca extra), ViaCEP API (`https://viacep.com.br/ws/{cep}/json/`)

---

## Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/components/ATPVeModal.tsx` | Estados `buscandoCep`/`erroCep`, função `buscarCep`, substituição do `<Campo nome="CEP">` por layout inline com botão |

---

### Task 1: Adicionar estados e função `buscarCep`

**Files:**
- Modify: `src/components/ATPVeModal.tsx`

- [ ] **Step 1: Adicionar os dois novos estados após `modoManual` (linha ~100)**

Localizar:
```tsx
const [modoManual, setModoManual] = useState(false);
```

Adicionar logo depois:
```tsx
const [buscandoCep, setBuscandoCep] = useState(false);
const [erroCep, setErroCep] = useState('');
```

- [ ] **Step 2: Adicionar função `buscarCep` antes de `updateDados`**

Localizar:
```tsx
// Helper para editar campos de dados extraídos
const updateDados = (path: string, value: string) => {
```

Inserir imediatamente **depois** do fechamento de `updateDados` (não antes):
```tsx
// ---- BUSCA DE CEP ----
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
        if (!dados?.comprador?.bairro?.trim())    updateDados('comprador.bairro',   json.bairro     || '');
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

> **Atenção:** `buscarCep` chama `updateDados`, portanto deve ser declarada DEPOIS de `updateDados`. A instrução acima já indica inserir após o fechamento de `updateDados`.

- [ ] **Step 3: Adicionar `setErroCep('')` ao `resetModal`**

Localizar o `resetModal` e adicionar `setErroCep('');` e `setBuscandoCep(false);` como últimas linhas antes do fechamento:

```tsx
const resetModal = () => {
    setEtapa('upload');
    setDados(null);
    setPdfFile(null);
    setErro('');
    setOsId('');
    setIdentidade({ numero: '', orgaoExpedidor: '', uf: '' });
    setClienteExistente(null);
    setTelefoneComprador('');
    setModoManual(false);
    setBuscandoCep(false);   // <-- adicionar
    setErroCep('');          // <-- adicionar
};
```

- [ ] **Step 4: Verificar compilação**

```bash
cd "c:/Users/pedro/Downloads/CRM-Despachante-Matilde-Teste-main (1)/CRM-Despachante-Matilde-Teste-main"
npx tsc --noEmit 2>&1 | head -20
```

Esperado: zero erros novos.

---

### Task 2: Substituir `<Campo nome="CEP">` pelo layout com botão "Buscar"

**Files:**
- Modify: `src/components/ATPVeModal.tsx`

- [ ] **Step 1: Localizar e substituir o campo CEP (linha ~629)**

Localizar:
```tsx
<Campo nome="CEP" path="comprador.cep" value={dados.comprador?.cep} onUpdate={updateDados} />
```

Substituir por:
```tsx
{/* CEP com busca automática (modo manual) */}
<div style={{ ...campoStyle, flexDirection: 'column', alignItems: 'stretch', gap: 0 }} onClick={e => e.stopPropagation()}>
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 0 }}>
        <span style={{ ...labelStyle, flexShrink: 0 }}>CEP</span>
        <input
            value={dados.comprador?.cep || ''}
            onChange={e => updateDados('comprador.cep', e.target.value)}
            placeholder="00000-000"
            maxLength={9}
            style={{
                ...valorStyle,
                border: `1px solid ${dados.comprador?.cep ? 'transparent' : 'var(--border-color, #d1d5db)'}`,
                borderRadius: 6, padding: '2px 6px', margin: '-2px 0 -2px -6px',
                background: 'transparent', fontFamily: 'inherit', outline: 'none',
                flex: 1, transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)')}
            onBlur={e => (e.currentTarget.style.borderColor = dados.comprador?.cep ? 'transparent' : 'var(--border-color, #d1d5db)')}
        />
        {modoManual && (
            <button
                onClick={buscarCep}
                disabled={buscandoCep || (dados.comprador?.cep || '').replace(/\D/g, '').length !== 8}
                style={{
                    marginLeft: 8, padding: '4px 12px', borderRadius: 6, border: 'none',
                    background: 'var(--color-info, #3b82f6)', color: '#fff',
                    cursor: buscandoCep || (dados.comprador?.cep || '').replace(/\D/g, '').length !== 8 ? 'not-allowed' : 'pointer',
                    opacity: buscandoCep || (dados.comprador?.cep || '').replace(/\D/g, '').length !== 8 ? 0.5 : 1,
                    fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap',
                    flexShrink: 0,
                }}
            >
                {buscandoCep ? 'Buscando...' : 'Buscar'}
            </button>
        )}
    </div>
    {erroCep && (
        <span style={{
            fontSize: '0.78rem', color: 'var(--color-danger, #dc2626)',
            paddingLeft: 160, marginTop: 4, display: 'block',
        }}>
            {erroCep}
        </span>
    )}
</div>
```

> **Nota de alinhamento:** `paddingLeft: 160` na mensagem de erro corresponde ao `width: 160` do `labelStyle`, mantendo o erro alinhado com o input.

- [ ] **Step 2: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: zero erros novos.

---

### Task 3: Teste manual no browser

- [ ] **Step 1: Iniciar servidor de desenvolvimento**

```bash
npm run dev
```

- [ ] **Step 2: Testar fluxo de sucesso**

1. ServicosDetran → Transferência → "Preencher manualmente"
2. Seção Comprador → campo CEP → digitar `01310100` (Avenida Paulista, SP)
3. Confirmar que o botão "Buscar" está **habilitado** (8 dígitos)
4. Clicar "Buscar"
5. Confirmar que aparece "Buscando..." no botão durante a requisição
6. Confirmar que os campos preenchidos automaticamente:
   - Endereço: `Avenida Paulista`
   - Bairro: `Bela Vista`
   - Município: `São Paulo`
   - UF: `SP`
7. Confirmar que o campo Número permanece vazio

- [ ] **Step 3: Testar não-sobrescrita**

1. Preencher manualmente o campo Município com "Belo Horizonte"
2. Digitar um CEP de São Paulo (`01310100`) e clicar "Buscar"
3. Confirmar que Município permanece "Belo Horizonte" (não foi sobrescrito)

- [ ] **Step 4: Testar CEP inválido**

1. Digitar `99999999` e clicar "Buscar"
2. Confirmar mensagem "CEP não encontrado." abaixo do campo
3. Confirmar que a mensagem some após ~4 segundos

- [ ] **Step 5: Testar botão desabilitado**

1. Digitar apenas 5 dígitos no CEP
2. Confirmar que o botão "Buscar" está com opacidade reduzida e não clicável

- [ ] **Step 6: Testar que modo ATPV-e NÃO tem botão**

1. Fazer upload de um ATPV-e real
2. Na etapa de preview, seção Comprador → campo CEP
3. Confirmar que o botão "Buscar" NÃO aparece (só o input normal)

- [ ] **Step 7: Testar reset**

1. Abrir modal no modo manual, digitar CEP, buscar, preencher campos
2. Clicar "Voltar"
3. Clicar "Preencher manualmente" novamente
4. Confirmar que os campos de endereço estão vazios e sem mensagem de erro de CEP

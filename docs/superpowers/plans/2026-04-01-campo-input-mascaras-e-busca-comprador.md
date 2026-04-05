# CampoInput com Máscaras + Busca de Comprador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar componente `CampoInput` com máscaras (data, moeda, chassi, RENAVAM, CPF/CNPJ) ao ATPVeModal e implementar busca automática de comprador por CPF/CNPJ para evitar duplicação de clientes no modo manual.

**Architecture:** Um único componente helper `CampoInput` declarado no topo de `ATPVeModal.tsx` (junto com `Campo` e `Secao`) substitui os `<Campo>` específicos que precisam de máscara. A busca de comprador usa `getClientes()` já importado, disparada via `onAfterUpdate` do campo CPF/CNPJ quando o dígito count atinge 11 ou 14.

**Tech Stack:** React, TypeScript, fetch nativo (sem biblioteca extra), `getClientes` e `setClienteExistente` já existentes no componente.

**Spec:** `docs/superpowers/specs/2026-04-01-campo-input-mascaras-e-busca-comprador.md`

---

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/components/ATPVeModal.tsx` | Novo componente `CampoInput` (linhas ~62-95), novo estado `buscandoComprador` (~linha 103), nova função `buscarComprador` (após `buscarCep`), 5 substituições de campos, `resetModal` atualizado |

---

### Task 1: Adicionar componente `CampoInput`

**Files:**
- Modify: `src/components/ATPVeModal.tsx` (após o fechamento de `Campo`, ~linha 65)

- [ ] **Step 1: Localizar o fim do componente `Campo`**

Abra `src/components/ATPVeModal.tsx` e encontre o fechamento do componente `Campo` (ele começa em ~linha 44 com `const Campo = ...`). O fechamento é o `};` que termina a função.

- [ ] **Step 2: Inserir `CampoInput` imediatamente após o fechamento de `Campo`**

Cole o bloco abaixo logo depois do `};` de `Campo`:

```tsx
// ---- CAMPO COM MÁSCARA ----
const CampoInput = ({
    nome, path, value, onUpdate, mascara, onAfterUpdate, obrigatorio, disabled, placeholder,
}: {
    nome: string;
    path: string;
    value: string;
    onUpdate: (path: string, value: string) => void;
    mascara: 'data' | 'moeda' | 'chassi' | 'renavam' | 'cpfcnpj';
    onAfterUpdate?: (valor: string) => void;
    obrigatorio?: boolean;
    disabled?: boolean;
    placeholder?: string;
}) => {
    const aplicarMascara = (raw: string): string => {
        switch (mascara) {
            case 'data': {
                const d = raw.replace(/\D/g, '').slice(0, 8);
                if (d.length <= 2) return d;
                if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
                return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
            }
            case 'moeda': {
                const digits = raw.replace(/\D/g, '');
                if (!digits) return '';
                const cents = parseInt(digits, 10);
                return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            }
            case 'chassi':
                return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 17);
            case 'renavam':
                return raw.replace(/\D/g, '').slice(0, 11);
            case 'cpfcnpj':
                return raw.replace(/[^0-9./-]/g, '');
            default:
                return raw;
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const masked = aplicarMascara(e.target.value);
        onUpdate(path, masked);
        onAfterUpdate?.(masked);
    };

    const ph = placeholder ?? (mascara === 'data' ? 'DD/MM/AAAA' : undefined);
    const isObrig = obrigatorio && !value;

    return (
        <div style={{ ...campoStyle, background: isObrig ? 'var(--color-warning-bg, #fffbeb)' : undefined }} onClick={e => e.stopPropagation()}>
            <span style={{ ...labelStyle, color: isObrig ? 'var(--color-warning, #d97706)' : undefined }}>
                {nome}{isObrig && ' *'}
            </span>
            <input
                value={value}
                onChange={handleChange}
                placeholder={ph}
                disabled={disabled}
                style={{
                    ...valorStyle,
                    border: `1px solid ${value ? 'transparent' : 'var(--border-color, #d1d5db)'}`,
                    borderRadius: 6, padding: '2px 6px', margin: '-2px -6px',
                    background: 'transparent', fontFamily: 'inherit', outline: 'none',
                    flex: 1, transition: 'border-color 0.15s',
                    opacity: disabled ? 0.6 : 1,
                    cursor: disabled ? 'not-allowed' : 'text',
                }}
                onFocus={e => { if (!disabled) e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)'; }}
                onBlur={e => (e.currentTarget.style.borderColor = value ? 'transparent' : 'var(--border-color, #d1d5db)')}
            />
        </div>
    );
};

```

- [ ] **Step 3: Verificar compilação**

```bash
cd "c:/Users/pedro/Downloads/CRM-Despachante-Matilde-Teste-main (1)/CRM-Despachante-Matilde-Teste-main"
npx tsc --noEmit 2>&1 | head -20
```

Esperado: zero erros novos.

---

### Task 2: Estado `buscandoComprador` e função `buscarComprador`

**Files:**
- Modify: `src/components/ATPVeModal.tsx`

- [ ] **Step 1: Adicionar estado `buscandoComprador` após `erroCep`**

Localizar:
```tsx
const [erroCep, setErroCep] = useState('');
```

Adicionar logo depois:
```tsx
const [buscandoComprador, setBuscandoComprador] = useState(false);
```

- [ ] **Step 2: Adicionar função `buscarComprador` após o fechamento de `buscarCep`**

Localizar o bloco `// ---- BUSCA DE CEP ----` e encontrar seu `};` de fechamento. Inserir o bloco abaixo **depois** dele:

```tsx
// ---- BUSCA DE COMPRADOR POR CPF/CNPJ ----
const buscarComprador = async (cpfRaw: string) => {
    const digits = cpfRaw.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) return;

    setBuscandoComprador(true);
    try {
        const clientes = await getClientes();
        const encontrado = clientes.find(c => c.cpfCnpj.replace(/\D/g, '') === digits);
        if (encontrado) {
            setClienteExistente({ id: encontrado.id, nome: encontrado.nome });
            setTelefoneComprador((encontrado.telefones || [])[0] || '');
            updateDados('comprador.nome', encontrado.nome || '');
        } else {
            setClienteExistente(null);
        }
    } catch { /* ignora erro na busca */ } finally {
        setBuscandoComprador(false);
    }
};

```

> **Atenção:** `buscarComprador` chama `updateDados` e `setClienteExistente`, que são declarados antes — a ordem está correta.

- [ ] **Step 3: Adicionar `setBuscandoComprador(false)` ao `resetModal`**

Localizar o `resetModal`. Após `setErroCep('');`, adicionar:
```tsx
    setBuscandoComprador(false);
```

- [ ] **Step 4: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: zero erros novos.

---

### Task 3: Substituir campo CPF/CNPJ do comprador

**Files:**
- Modify: `src/components/ATPVeModal.tsx` (~linha 643)

- [ ] **Step 1: Localizar e substituir o campo CPF/CNPJ**

Localizar:
```tsx
<Campo nome="CPF/CNPJ" path="comprador.cpfCnpj" value={dados.comprador?.cpfCnpj} onUpdate={updateDados} />
```

Substituir por:
```tsx
<CampoInput
    nome="CPF/CNPJ"
    path="comprador.cpfCnpj"
    value={dados.comprador?.cpfCnpj || ''}
    onUpdate={updateDados}
    mascara="cpfcnpj"
    onAfterUpdate={buscarComprador}
    disabled={buscandoComprador}
/>
```

- [ ] **Step 2: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: zero erros novos.

---

### Task 4: Substituir campos Chassi e RENAVAM

**Files:**
- Modify: `src/components/ATPVeModal.tsx` (~linhas 616-617)

- [ ] **Step 1: Substituir campo Chassi**

Localizar:
```tsx
<Campo nome="Chassi" path="chassi" value={dados.chassi} onUpdate={updateDados} />
```

Substituir por:
```tsx
<CampoInput nome="Chassi" path="chassi" value={dados.chassi || ''} onUpdate={updateDados} mascara="chassi" />
```

- [ ] **Step 2: Substituir campo RENAVAM**

Localizar:
```tsx
<Campo nome="Renavam" path="renavam" value={dados.renavam} onUpdate={updateDados} />
```

Substituir por:
```tsx
<CampoInput nome="Renavam" path="renavam" value={dados.renavam || ''} onUpdate={updateDados} mascara="renavam" />
```

- [ ] **Step 3: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: zero erros novos.

---

### Task 5: Substituir campos Valor da Venda e Data Declarada da Venda

**Files:**
- Modify: `src/components/ATPVeModal.tsx` (~linhas 816-832)

- [ ] **Step 1: Substituir `<Campo nome="Valor da Venda (R$)" ...>`**

Localizar:
```tsx
<Campo nome="Valor da Venda (R$)" path="valorRecibo" value={dados.valorRecibo ?? ''} onUpdate={updateDados} />
```

Substituir por:
```tsx
<CampoInput nome="Valor da Venda (R$)" path="valorRecibo" value={dados.valorRecibo ?? ''} onUpdate={updateDados} mascara="moeda" />
```

- [ ] **Step 2: Substituir o bloco inline de `dataAquisicao`**

Localizar e remover todo o bloco (do `<div style={{ ...campoStyle, background: !dados.dataAquisicao ...` até o `</div>` de fechamento correspondente):

```tsx
<div style={{ ...campoStyle, background: !dados.dataAquisicao ? 'var(--color-warning-bg, #fffbeb)' : undefined }}>
    <span style={{ ...labelStyle, color: !dados.dataAquisicao ? 'var(--color-warning, #d97706)' : undefined }}>
        Data Declarada da Venda{!dados.dataAquisicao && ' *'}
    </span>
    <input
        value={dados.dataAquisicao || ''}
        onChange={e => updateDados('dataAquisicao', e.target.value)}
        onClick={e => e.stopPropagation()}
        placeholder="DD/MM/AAAA — preencha obrigatoriamente"
        style={{
            ...valorStyle, border: `1px solid ${!dados.dataAquisicao ? 'var(--color-warning, #d97706)' : 'transparent'}`,
            borderRadius: 6, padding: '2px 6px', margin: '-2px -6px',
            background: 'transparent', fontFamily: 'inherit', outline: 'none', width: '100%',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-info, #3b82f6)')}
        onBlur={e => (e.currentTarget.style.borderColor = dados.dataAquisicao ? 'transparent' : 'var(--color-warning, #d97706)')}
    />
</div>
```

Substituir por:
```tsx
<CampoInput
    nome="Data Declarada da Venda"
    path="dataAquisicao"
    value={dados.dataAquisicao || ''}
    onUpdate={updateDados}
    mascara="data"
    obrigatorio
    placeholder="DD/MM/AAAA — preencha obrigatoriamente"
/>
```

- [ ] **Step 3: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: zero erros novos.

---

### Task 6: Teste manual no browser

- [ ] **Step 1: Iniciar servidor de desenvolvimento**

```bash
npm run dev
```

- [ ] **Step 2: Testar máscaras**

1. Abrir modal no modo manual (ServicosDetran → Transferência → "Preencher manualmente")
2. **Chassi** — digitar letras minúsculas → confirmar auto-uppercase; digitar mais de 17 chars → trava no 17º
3. **RENAVAM** — digitar letras → bloqueadas; digitar mais de 11 dígitos → trava no 11º
4. **Data Declarada da Venda** — digitar `12032025` → campo mostra `12/03/2025`; digitar só 4 dígitos → `12/03` sem `/` final
5. **Valor da Venda** — digitar `150000` → campo mostra `R$ 1.500,00`

- [ ] **Step 3: Testar busca de comprador**

1. No campo CPF/CNPJ do Comprador, digitar CPF de um cliente **já cadastrado** (11 dígitos)
2. Confirmar que o campo fica desabilitado brevemente (opacity 0.6)
3. Confirmar que o banner verde "Cliente encontrado: [Nome]" aparece
4. Confirmar que o campo Nome do Comprador é preenchido automaticamente
5. Confirmar que o campo Telefone do Comprador é preenchido se o cliente tiver telefone

- [ ] **Step 4: Testar CPF não cadastrado**

1. Digitar CPF de 11 dígitos que NÃO existe no banco
2. Confirmar que nenhum banner aparece e campos permanecem editáveis

- [ ] **Step 5: Testar que modo ATPV-e não é afetado**

1. Fazer upload de um ATPV-e real
2. Confirmar que o fluxo de extração e preview continua funcionando normalmente
3. Confirmar que os campos Chassi e RENAVAM exibem os valores extraídos corretamente

# Spec — Reestruturação da Página Configurações com shadcn/ui

**Data:** 2026-04-01  
**Status:** Aprovado  
**Projeto:** CRM Despachante Matilde

---

## Contexto

A página `/configuracoes` usa um layout legado de cards expansíveis (`ServiceCard`) com formulário inline (`NewServicePanel`). O objetivo é substituir por um sistema moderno de abas + tabela + modal de edição, usando shadcn/ui como biblioteca de componentes.

O banco de dados já tem a tabela `service_config` populada com 9 serviços. O `configService.ts` já está completo. Nenhuma migration é necessária.

---

## Escopo

- Instalar Tailwind CSS v3 + shadcn/ui no projeto Vite existente
- Reestruturar apenas `Configuracoes.tsx` e componentes associados
- Resto do app mantém CSS inline (migração gradual futura)
- Zero mudanças em lógica de negócio ou banco de dados

---

## Tipos de referência

Todos os tipos abaixo já estão definidos — não criar novos:

| Tipo | Importar de |
|------|-------------|
| `ServiceConfig`, `DocumentoExtra` | `../lib/configService` |
| `getAllServiceConfigs`, `updateServiceConfig`, `createServiceConfig`, `deleteServiceConfig`, `invalidateConfigCache` | `../lib/configService` |
| `PriceTableItem` | `../types/finance` |
| `getPriceTable`, `updatePriceItem` | `../lib/financeService` |
| `supabase` | `../lib/supabaseClient` |

---

## Instalação: Tailwind v3 + shadcn

### Versão: Tailwind CSS **v3** (não v4)
shadcn/ui suporta Tailwind v3 e v4, mas o projeto usa Vite sem configuração PostCSS existente. Usar v3 para compatibilidade ampla.

### Passos de instalação
```bash
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
npx shadcn@latest init
```

Durante `shadcn init`: escolher estilo "Default", cor base "Slate", usar CSS variables: sim.

### Isolamento do `src/index.css`
O arquivo `src/index.css` atual contém variáveis CSS do CRM (`--color-primary`, `--color-text-*`, etc.) e estilos globais. Para não quebrar o resto do app:

1. Adicionar as diretivas do Tailwind **antes** do conteúdo existente:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
2. O shadcn init adiciona suas variáveis `:root { ... }` — revisar se alguma sobrescreve variáveis existentes do CRM (ex: `--background`, `--foreground`). Renomear as do CRM se houver conflito.
3. Adicionar `layer: 'base'` ao Tailwind config para que o reset do Tailwind não sobrescreva `box-sizing` global (já coberto pelo `preflight` padrão — monitorar visualmente).
4. Critério de não-regressão: após instalação, abrir as páginas `OSList`, `Dashboard` e `ClientesList` e verificar que o layout não mudou.

### `tailwind.config.js`
```js
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

### Componentes shadcn a instalar
```bash
npx shadcn@latest add tabs dialog table badge switch button input select label
```

---

## Arquivos a criar

### `src/components/DocListEditor.tsx`

Extraído do inline de `Configuracoes.tsx` atual (função `DocListEditor` ~30 linhas). Editor de lista de strings.

**Props:**
```ts
interface DocListEditorProps {
  label: string;
  docs: string[];
  onChange: (docs: string[]) => void;
}
```

**UI:**
- `Label` com o título da seção
- Lista de itens: cada um com texto + `Button variant="ghost" size="icon"` (ícone X) para remover
- Row inferior: `Input` para digitar novo doc + `Button variant="outline" size="sm"` "+ Adicionar"
- Enter no input também adiciona

---

### `src/components/ServiceEditModal.tsx`

Modal completo de criação/edição. Substitui `ServiceCard` expandido + `NewServicePanel`.

**Imports de tipos:**
```ts
import { ServiceConfig, DocumentoExtra, updateServiceConfig, createServiceConfig, deleteServiceConfig } from '../lib/configService';
```

**Props:**
```ts
interface ServiceEditModalProps {
  open: boolean;
  config: ServiceConfig | null; // null = novo serviço
  onClose: () => void;
  onSaved: () => void;   // chama invalidateConfigCache() + refetch antes de fechar
  onDeleted: () => void; // chama invalidateConfigCache() + refetch antes de fechar
}
```

**Estado interno:**
```ts
const [activeTab, setActiveTab] = useState<'config' | 'docs'>('config');
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);
// campos do formulário espelham ServiceConfig
const [tipoServico, setTipoServico] = useState(''); // editável apenas na criação (config === null)
const [nomeExibicao, setNomeExibicao] = useState('');
const [daeTipo, setDaeTipo] = useState<string | null>(null);
const [geraVistoria, setGeraVistoria] = useState('nunca');
const [geraPlaca, setGeraPlaca] = useState('nunca');
const [ativo, setAtivo] = useState(true);
const [docsPf, setDocsPf] = useState<string[]>([]);
const [docsPj, setDocsPj] = useState<string[]>([]);
const [extrasCondicoes, setExtrasCondicoes] = useState<DocumentoExtra[]>([]);
```

**Inicialização:** `useEffect([config, open])` — quando modal abre, copia valores de `config` para o estado local. Se `config === null`, reseta para valores padrão.

**Estrutura JSX:**
```
Dialog (open, onOpenChange → onClose)
└── DialogContent
    ├── DialogHeader → DialogTitle ("Editar Serviço" | "Novo Serviço")
    ├── Tabs (value=activeTab)
    │   ├── TabsList
    │   │   ├── TabsTrigger "config" → "Configurações"
    │   │   └── TabsTrigger "docs" → "Documentos"
    │   ├── TabsContent "config"
    │   │   ├── Label + Input → Identificador (tipo_servico) — só visível quando config === null; validar ^[a-z0-9_]+$
    │   │   ├── Label + Input → Nome de Exibição
    │   │   ├── Label + Select → DAE (Sem DAE / Principal / Alteração)
    │   │   ├── Label + Select → Gera Vistoria (Nunca / Sempre / Se troca)
    │   │   ├── Label + Select → Gera Placa (Nunca / Sempre / Se troca)
    │   │   └── Label + Switch → Ativo
    │   └── TabsContent "docs"
    │       ├── DocListEditor label="Documentos PF" docs={docsPf} onChange={setDocsPf}
    │       ├── DocListEditor label="Documentos PJ" docs={docsPj} onChange={setDocsPj}
    │       └── Seção "Documentos Extras" (ver abaixo)
    ├── {error && <p className="text-destructive text-sm">{error}</p>}
    └── DialogFooter
        ├── Button variant="destructive" (só se config !== null) → "Excluir" (ver abaixo)
        ├── Button variant="outline" onClick=onClose → "Cancelar"
        └── Button disabled={saving} onClick=handleSave → "Salvar"
```

**Seção "Documentos Extras":**
- Lista de `extrasCondicoes` (array de `{condicao: string, docs: string[]}`).
- Cada item exibe: `Input` para editar o campo `condicao` + `DocListEditor` para os `docs` desse item + `Button variant="ghost" size="icon"` para remover o bloco inteiro.
- `Button variant="outline" size="sm"` "+ Nova Condição" adiciona um novo objeto `{condicao: '', docs: []}` ao array.

**handleSave:**
```ts
async function handleSave() {
  if (!nomeExibicao.trim()) { setError('Nome é obrigatório'); return; }
  if (!config && !tipoServico.trim()) { setError('Identificador é obrigatório'); return; }
  if (!config && !/^[a-z0-9_]+$/.test(tipoServico)) { setError('Identificador: apenas letras minúsculas, números e _'); return; }
  setSaving(true); setError(null);
  try {
    const payload = { nome_exibicao: nomeExibicao, dae_tipo: daeTipo, gera_vistoria: geraVistoria, gera_placa: geraPlaca, ativo, documentos_pf: docsPf, documentos_pj: docsPj, documentos_extras: extrasCondicoes };
    if (config) {
      await updateServiceConfig(config.id, payload);
    } else {
      await createServiceConfig({ tipo_servico: tipoServico.trim(), ...payload });
    }
    onSaved();
  } catch (e: any) {
    setError(e?.message ?? 'Erro ao salvar');
  } finally {
    setSaving(false);
  }
}
```

**Exclusão com confirmação:**
- Ao clicar "Excluir", exibir `AlertDialog` (shadcn) de confirmação antes de chamar `deleteServiceConfig`.
- AlertDialog: título "Excluir serviço?", descrição "Esta ação não pode ser desfeita.", botões "Cancelar" e "Excluir" (destructive).
- Em caso de erro, exibir mensagem de erro no modal (não fechar).
- Em caso de sucesso, chamar `onDeleted()`.

---

### `src/pages/Configuracoes.tsx` — Reescrito

**Imports:**
```ts
import { getAllServiceConfigs, updateServiceConfig, createServiceConfig, deleteServiceConfig, invalidateConfigCache } from '../lib/configService';
import type { ServiceConfig } from '../lib/configService';
import { getPriceTable, updatePriceItem } from '../lib/financeService';
import type { PriceTableItem } from '../types/finance';
import { supabase } from '../lib/supabaseClient';
import { ServiceEditModal } from '../components/ServiceEditModal';
```

**Estado:**
```ts
const [configs, setConfigs] = useState<ServiceConfig[]>([]);
const [custos, setCustos] = useState<PriceTableItem[]>([]);
const [loading, setLoading] = useState(true);
const [modalOpen, setModalOpen] = useState(false);
const [modalConfig, setModalConfig] = useState<ServiceConfig | null>(null);
```

**Fetch (`carregar`):**
```ts
const carregar = useCallback(async () => {
  setLoading(true);
  const [cfgs, priceItems] = await Promise.all([getAllServiceConfigs(), getPriceTable()]);
  setConfigs(cfgs);
  setCustos(priceItems);
  setLoading(false);
}, []);
```

**handleSaved / handleDeleted:** ambos chamam `invalidateConfigCache()` + `carregar()` como fallback manual (não depende apenas do realtime para atualizar a UI), depois fecham o modal:
```ts
const handleSaved = () => { setModalOpen(false); invalidateConfigCache(); carregar(); };
const handleDeleted = () => { setModalOpen(false); invalidateConfigCache(); carregar(); };
```

**Realtime:** mantido exatamente igual — canal `config-changes` escuta `service_config`, `service_prices`, `price_table`.

**Layout:**
```
<div> (wrapper com padding)
  Page Header (ícone Settings + título "Configurações de Serviços" + descrição)
  
  <Tabs defaultValue="servicos">
    <TabsList>
      <TabsTrigger value="servicos">⚙ Serviços DETRAN</TabsTrigger>
      <TabsTrigger value="custos">💰 Custos Fixos</TabsTrigger>
    </TabsList>

    <TabsContent value="servicos">
      Toolbar: <h2> + <Button onClick={() => { setModalConfig(null); setModalOpen(true); }}>+ Novo Serviço</Button>
      
      {loading ? <Skeleton /> : (
        <Table>
          <TableHeader>
            <TableRow>
              Nome | Docs PF | Docs PJ | DAE | Vistoria | Placa | Status | Ações
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.map(c => (
              <TableRow key={c.id}>
                <TableCell>{c.nome_exibicao}</TableCell>
                <TableCell><Badge variant="secondary">{c.documentos_pf.length} docs</Badge></TableCell>
                <TableCell><Badge variant="secondary">{c.documentos_pj.length} docs</Badge></TableCell>
                <TableCell>{daeLabel(c.dae_tipo)}</TableCell>
                <TableCell>{visoriaLabel(c.gera_vistoria)}</TableCell>
                <TableCell>{placaLabel(c.gera_placa)}</TableCell>
                <TableCell>
                  <Badge variant={c.ativo ? 'default' : 'secondary'}>
                    {c.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => { setModalConfig(c); setModalOpen(true); }}>
                    <Edit2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </TabsContent>

    <TabsContent value="custos">
      <CustosFixosSection custos={custos} onDataChanged={carregar} />
    </TabsContent>
  </Tabs>

  <ServiceEditModal
    open={modalOpen}
    config={modalConfig}
    onClose={() => setModalOpen(false)}
    onSaved={handleSaved}
    onDeleted={handleDeleted}
  />
</div>
```

**Helpers de label (inline no arquivo):**
```ts
const daeLabel = (v: string | null) => ({ principal: 'Principal', alteracao: 'Alteração' }[v ?? ''] ?? '—');
const visoriaLabel = (v: string) => ({ sempre: 'Sempre', se_troca: 'Se troca', nunca: 'Nunca' }[v] ?? v);
const placaLabel = visoriaLabel;
```

### `CustosFixosSection` (inline no final de `Configuracoes.tsx`)

Já existe inline no arquivo atual (~150 linhas). Será mantida inline mas com `Input` e `Button` do shadcn substituindo os elementos nativos `<input>` e `<button>`. A lógica (`adicionarCusto`, `removerCusto`, `salvarCusto`, `unmaskMoney`) é preservada integralmente.

**Props (já existentes):**
```ts
{ custos: PriceTableItem[]; onDataChanged: () => void }
```

---

## O que é removido de `Configuracoes.tsx`

| Item | Linhas aprox. |
|------|---------------|
| `ServiceCard` component | ~360 linhas |
| `NewServicePanel` component | ~100 linhas |
| `DocListEditor` inline | ~30 linhas |
| `DAE_OPTIONS` constante | ~6 linhas |
| `VISTORIA_PLACA_OPTIONS` constante | ~6 linhas |
| Estado `showNewForm` | — |
| Interfaces `DraftConfig`, `NewServiceForm`, `ServiceCardProps`, `NewServicePanelProps` | — |

---

## Ordem de Execução

1. Instalar Tailwind v3 + PostCSS (`npm install -D tailwindcss@3 postcss autoprefixer && npx tailwindcss init -p`)
2. Inicializar shadcn (`npx shadcn@latest init`)
3. Atualizar `src/index.css` (adicionar diretivas Tailwind + preservar variáveis CRM)
4. Instalar componentes: `npx shadcn@latest add tabs dialog alert-dialog table badge switch button input select label`
5. Criar `src/components/DocListEditor.tsx`
6. Criar `src/components/ServiceEditModal.tsx`
7. Reescrever `src/pages/Configuracoes.tsx`
8. Rodar `npm run build` e corrigir erros TypeScript
9. Verificar visualmente: `OSList`, `Dashboard`, `ClientesList` (não-regressão do CSS inline)

---

## Critérios de Sucesso

- [ ] `npm run build` passa sem erros TypeScript
- [ ] Tabela exibe os 9 serviços com colunas corretas
- [ ] Botão "+ Novo Serviço" abre modal vazio; salvar chama `createServiceConfig` e a tabela reflete o novo estado
- [ ] Clique em editar abre modal preenchido; salvar chama `updateServiceConfig` e a tabela reflete o novo estado
- [ ] Excluir exibe `AlertDialog` de confirmação antes de deletar
- [ ] Aba "Custos Fixos" mantém funcionalidade atual intacta
- [ ] Páginas `OSList`, `Dashboard`, `ClientesList` não tiveram regressão visual

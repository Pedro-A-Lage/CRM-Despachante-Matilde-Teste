# Configurações shadcn/ui Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestruturar a página `/configuracoes` do CRM usando shadcn/ui: substituir cards expansíveis por abas + tabela + modal de edição.

**Architecture:** Instalar Tailwind v3 + shadcn no projeto Vite existente. Extrair `DocListEditor` para arquivo próprio. Criar `ServiceEditModal` novo. Reescrever `Configuracoes.tsx` com `Tabs` + `Table`. Resto do app mantém CSS inline.

**Tech Stack:** React 18, Vite, TypeScript, shadcn/ui (Tailwind v3 + Radix), lucide-react, `src/lib/configService.ts` (já existente)

**Spec:** `docs/superpowers/specs/2026-04-01-configuracoes-shadcn-redesign.md`

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `tailwind.config.js` | Criar | Configura Tailwind para escanear `src/` |
| `postcss.config.js` | Criar | PostCSS com Tailwind + Autoprefixer |
| `src/index.css` | Modificar | Adicionar diretivas Tailwind antes do CSS existente |
| `src/components/ui/` | Criar (CLI) | Componentes shadcn instalados |
| `src/components/DocListEditor.tsx` | Criar | Editor reutilizável de lista de strings |
| `src/components/ServiceEditModal.tsx` | Criar | Modal Dialog com abas: Configurações + Documentos |
| `src/pages/Configuracoes.tsx` | Reescrever | Tabs + Table + ServiceEditModal, remove ServiceCard/NewServicePanel |

---

## Task 1: Instalar Tailwind v3 + PostCSS

**Files:**
- Create: `tailwind.config.js`
- Create: `postcss.config.js`

- [ ] **Step 1: Instalar dependências**

No diretório raiz do projeto (`CRM-Despachante-Matilde-Teste-main`):

```bash
npm install -D tailwindcss@3 postcss autoprefixer
```

- [ ] **Step 2: Gerar configs do Tailwind**

```bash
npx tailwindcss init -p
```

Isso cria `tailwind.config.js` e `postcss.config.js`.

- [ ] **Step 3: Configurar content paths em `tailwind.config.js`**

Substituir o conteúdo gerado por:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

- [ ] **Step 4: Verificar `postcss.config.js`** (gerado automaticamente, deve conter):

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

Se o arquivo usar `module.exports` (CommonJS), está ok também — Vite aceita ambos.

- [ ] **Step 5: Rodar build para verificar que não quebrou nada**

```bash
npm run build
```

Esperado: build passa sem erros. Se houver erro de PostCSS, verificar se `postcss.config.js` está na raiz do projeto.

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.js postcss.config.js package.json package-lock.json
git commit -m "chore: install tailwind v3 + postcss"
```

---

## Task 2: Inicializar shadcn/ui

**Files:**
- Create: `components.json`
- Modify: `src/index.css`

- [ ] **Step 1: Rodar shadcn init**

```bash
npx shadcn@latest init
```

Respostas durante o wizard:
- Style: **Default**
- Base color: **Slate**
- CSS variables: **Yes**
- Alias para components: **@/components** (padrão)
- Alias para utils: **@/lib/utils** (padrão)

Isso cria `components.json` e modifica `src/index.css`.

- [ ] **Step 2: Proteger variáveis CSS existentes do CRM em `src/index.css`**

Após o init, o shadcn insere um bloco `:root { ... }` no topo do arquivo. Abrir `src/index.css` e verificar se alguma variável do shadcn conflita com as variáveis existentes do CRM (como `--background`, `--foreground`).

O CRM usa variáveis prefixadas com `--color-*` (ex: `--color-primary`, `--color-text-primary`) — essas são seguras, não há conflito com o shadcn.

O arquivo deve ficar com esta ordem:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Variáveis shadcn (inseridas pelo init) */
@layer base {
  :root {
    --background: 0 0% 100%;
    /* ... resto das variáveis shadcn ... */
  }
}

/* === CSS existente do CRM abaixo (NÃO alterar) === */
:root {
  --color-primary: #2563eb;
  /* ... variáveis do CRM ... */
}
/* ... resto do CSS do CRM ... */
```

- [ ] **Step 3: Verificar que `src/lib/utils.ts` foi criado pelo shadcn**

O shadcn cria `src/lib/utils.ts` com a função `cn()`. Confirmar que o arquivo existe:

```bash
ls src/lib/utils.ts
```

Se não existir, criar manualmente:

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

E instalar as dependências:
```bash
npm install clsx tailwind-merge
```

- [ ] **Step 4: Configurar alias `@/` no Vite e TypeScript (OBRIGATÓRIO)**

O shadcn gera componentes que importam `@/lib/utils` e `@/components/ui/...`. Sem o alias o build falha.

Substituir `vite.config.ts` por:

```ts
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: { main: './index.html' } },
  },
});
```

Adicionar em `tsconfig.app.json` dentro de `compilerOptions`:

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 5: Rodar build**

```bash
npm run build
```

Esperado: passa. Se houver erro de `@tailwind base` conflitando com estilos globais, mover as diretivas Tailwind para o topo do arquivo antes do `:root` do CRM.

- [ ] **Step 6: Commit**

```bash
git add components.json src/index.css src/lib/utils.ts vite.config.ts tsconfig.app.json package.json package-lock.json
git commit -m "chore: initialize shadcn/ui + configure @/ path alias"
```

---

## Task 3: Instalar componentes shadcn necessários

**Files:**
- Create: `src/components/ui/tabs.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/alert-dialog.tsx`
- Create: `src/components/ui/table.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/switch.tsx`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/select.tsx`
- Create: `src/components/ui/label.tsx`

- [ ] **Step 1: Instalar todos os componentes de uma vez**

```bash
npx shadcn@latest add tabs dialog alert-dialog table badge switch button input select label
```

Confirmar `y` se perguntar sobre sobrescrever arquivos.

- [ ] **Step 2: Verificar que os arquivos foram criados**

```bash
ls src/components/ui/
```

Esperado: ver os 10 arquivos `.tsx` listados acima.

- [ ] **Step 3: Rodar build**

```bash
npm run build
```

Esperado: passa sem erros TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/
git commit -m "chore: add shadcn ui components (tabs, dialog, table, badge, switch, button, input, select, label)"
```

---

## Task 4: Criar `DocListEditor.tsx`

**Files:**
- Create: `src/components/DocListEditor.tsx`

Este componente já existe inline em `Configuracoes.tsx` mas será extraído e melhorado com shadcn.

- [ ] **Step 1: Criar o arquivo**

```tsx
// src/components/DocListEditor.tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface DocListEditorProps {
  label: string;
  docs: string[];
  onChange: (docs: string[]) => void;
}

export function DocListEditor({ label, docs, onChange }: DocListEditorProps) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed || docs.includes(trimmed)) return;
    onChange([...docs, trimmed]);
    setInput('');
  };

  const remove = (idx: number) => {
    onChange(docs.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>

      {docs.length > 0 && (
        <ul className="flex flex-col gap-1">
          {docs.map((doc, idx) => (
            <li key={idx} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
              <span>{doc}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={() => remove(idx)}
              >
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {docs.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum documento cadastrado.</p>
      )}

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nome do documento..."
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
          + Adicionar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rodar build**

```bash
npm run build
```

Esperado: passa. Se houver erro de importação de `lucide-react`, verificar que a versão instalada tem o ícone `X` (já deve ter — projeto usa lucide-react ^0.460.0).

- [ ] **Step 3: Commit**

```bash
git add src/components/DocListEditor.tsx
git commit -m "feat: add DocListEditor component (extracted from Configuracoes)"
```

---

## Task 5: Criar `ServiceEditModal.tsx`

**Files:**
- Create: `src/components/ServiceEditModal.tsx`

Modal completo de criação/edição de serviço com Dialog, abas internas e AlertDialog de confirmação ao excluir.

- [ ] **Step 1: Criar o arquivo**

```tsx
// src/components/ServiceEditModal.tsx
import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { DocListEditor } from './DocListEditor';
import {
  ServiceConfig, DocumentoExtra,
  updateServiceConfig, createServiceConfig, deleteServiceConfig,
} from '../lib/configService';

const DAE_OPTIONS = [
  { label: 'Sem DAE', value: '__none__' },
  { label: 'Principal', value: 'principal' },
  { label: 'Alteração', value: 'alteracao' },
];

const VISTORIA_PLACA_OPTIONS = [
  { label: 'Nunca', value: 'nunca' },
  { label: 'Sempre', value: 'sempre' },
  { label: 'Se troca', value: 'se_troca' },
];

interface ServiceEditModalProps {
  open: boolean;
  config: ServiceConfig | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function ServiceEditModal({ open, config, onClose, onSaved, onDeleted }: ServiceEditModalProps) {
  const [activeTab, setActiveTab] = useState<'config' | 'docs'>('config');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form state
  const [tipoServico, setTipoServico] = useState('');
  const [nomeExibicao, setNomeExibicao] = useState('');
  const [daeTipo, setDaeTipo] = useState<string>('__none__');
  const [geraVistoria, setGeraVistoria] = useState('nunca');
  const [geraPlaca, setGeraPlaca] = useState('nunca');
  const [ativo, setAtivo] = useState(true);
  const [docsPf, setDocsPf] = useState<string[]>([]);
  const [docsPj, setDocsPj] = useState<string[]>([]);
  const [extrasCondicoes, setExtrasCondicoes] = useState<DocumentoExtra[]>([]);

  // Reset/populate form when modal opens
  useEffect(() => {
    if (!open) return;
    setActiveTab('config');
    setError(null);
    setSaving(false);
    if (config) {
      setTipoServico(config.tipo_servico);
      setNomeExibicao(config.nome_exibicao);
      setDaeTipo(config.dae_tipo ?? '__none__');
      setGeraVistoria(config.gera_vistoria);
      setGeraPlaca(config.gera_placa);
      setAtivo(config.ativo);
      setDocsPf([...config.documentos_pf]);
      setDocsPj([...config.documentos_pj]);
      setExtrasCondicoes(config.documentos_extras ? config.documentos_extras.map(e => ({ ...e, docs: [...e.docs] })) : []);
    } else {
      setTipoServico('');
      setNomeExibicao('');
      setDaeTipo('__none__');
      setGeraVistoria('nunca');
      setGeraPlaca('nunca');
      setAtivo(true);
      setDocsPf([]);
      setDocsPj([]);
      setExtrasCondicoes([]);
    }
  }, [open, config]);

  const handleSave = async () => {
    if (!nomeExibicao.trim()) { setError('Nome é obrigatório.'); return; }
    if (!config) {
      if (!tipoServico.trim()) { setError('Identificador é obrigatório.'); return; }
      if (!/^[a-z0-9_]+$/.test(tipoServico)) { setError('Identificador: apenas letras minúsculas, números e _.'); return; }
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        nome_exibicao: nomeExibicao.trim(),
        dae_tipo: daeTipo === '__none__' ? null : daeTipo,
        gera_vistoria: geraVistoria,
        gera_placa: geraPlaca,
        ativo,
        documentos_pf: docsPf,
        documentos_pj: docsPj,
        documentos_extras: extrasCondicoes,
      };

      if (config) {
        await updateServiceConfig(config.id, payload);
      } else {
        await createServiceConfig({ tipo_servico: tipoServico.trim(), ...payload });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      await deleteServiceConfig(config.id);
      onDeleted();
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao excluir.');
      setSaving(false);
    }
  };

  const updateExtraCondicao = (idx: number, condicao: string) => {
    setExtrasCondicoes(prev => prev.map((e, i) => i === idx ? { ...e, condicao } : e));
  };

  const updateExtraDocs = (idx: number, docs: string[]) => {
    setExtrasCondicoes(prev => prev.map((e, i) => i === idx ? { ...e, docs } : e));
  };

  const removeExtra = (idx: number) => {
    setExtrasCondicoes(prev => prev.filter((_, i) => i !== idx));
  };

  const addExtra = () => {
    setExtrasCondicoes(prev => [...prev, { condicao: '', docs: [] }]);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{config ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'config' | 'docs')}>
            <TabsList className="w-full">
              <TabsTrigger value="config" className="flex-1">Configurações</TabsTrigger>
              <TabsTrigger value="docs" className="flex-1">Documentos</TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="flex flex-col gap-4 pt-2">
              {/* Identificador — só na criação */}
              {!config && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tipo_servico">Identificador</Label>
                  <Input
                    id="tipo_servico"
                    value={tipoServico}
                    onChange={e => setTipoServico(e.target.value)}
                    placeholder="ex: meu_servico_novo"
                  />
                  <p className="text-xs text-muted-foreground">Apenas letras minúsculas, números e _. Não pode ser alterado depois.</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nome_exibicao">Nome de Exibição</Label>
                <Input
                  id="nome_exibicao"
                  value={nomeExibicao}
                  onChange={e => setNomeExibicao(e.target.value)}
                  placeholder="ex: Transferência de Propriedade"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>DAE</Label>
                  <Select value={daeTipo} onValueChange={setDaeTipo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Gera Vistoria</Label>
                  <Select value={geraVistoria} onValueChange={setGeraVistoria}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VISTORIA_PLACA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Gera Placa</Label>
                  <Select value={geraPlaca} onValueChange={setGeraPlaca}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VISTORIA_PLACA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch id="ativo" checked={ativo} onCheckedChange={setAtivo} />
                <Label htmlFor="ativo">Serviço ativo</Label>
              </div>
            </TabsContent>

            <TabsContent value="docs" className="flex flex-col gap-6 pt-2">
              <DocListEditor label="Documentos PF" docs={docsPf} onChange={setDocsPf} />
              <DocListEditor label="Documentos PJ" docs={docsPj} onChange={setDocsPj} />

              <div className="flex flex-col gap-3">
                <Label>Documentos Extras (condicionais)</Label>
                {extrasCondicoes.map((extra, idx) => (
                  <div key={idx} className="rounded-md border p-3 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={extra.condicao}
                        onChange={e => updateExtraCondicao(idx, e.target.value)}
                        placeholder="Condição (ex: vendedor_pj)"
                        className="flex-1"
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeExtra(idx)}>
                        <span className="sr-only">Remover condição</span>
                        ✕
                      </Button>
                    </div>
                    <DocListEditor
                      label={`Docs se: ${extra.condicao || '(condição)'}`}
                      docs={extra.docs}
                      onChange={docs => updateExtraDocs(idx, docs)}
                    />
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addExtra} className="self-start">
                  + Nova Condição
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="flex-row justify-between">
            <div>
              {config && (
                <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)} disabled={saving}>
                  Excluir
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de confirmação para exclusão */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O serviço "{config?.nome_exibicao}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Rodar build**

```bash
npm run build
```

Esperado: passa sem erros TypeScript. Se houver erro de import de `DocumentoExtra`, verificar que `configService.ts` exporta esse tipo (já deve exportar).

- [ ] **Step 3: Commit**

```bash
git add src/components/ServiceEditModal.tsx
git commit -m "feat: add ServiceEditModal component (Dialog + Tabs + AlertDialog)"
```

---

## Task 6: Reescrever `Configuracoes.tsx`

**Files:**
- Modify: `src/pages/Configuracoes.tsx` (reescrita completa)

Este é o passo principal: substituir o layout de cards por Tabs + Table.

- [ ] **Step 1: Reescrever o arquivo**

Substituir **todo** o conteúdo de `src/pages/Configuracoes.tsx` por:

```tsx
// src/pages/Configuracoes.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Settings, Edit2, DollarSign, Plus, Trash2, Save } from 'lucide-react';
import {
  getAllServiceConfigs, invalidateConfigCache,
} from '../lib/configService';
import type { ServiceConfig } from '../lib/configService';
import { getPriceTable, updatePriceItem } from '../lib/financeService';
import type { PriceTableItem } from '../types/finance';
import { supabase } from '../lib/supabaseClient';
import { ServiceEditModal } from '../components/ServiceEditModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

// ── Label helpers ─────────────────────────────────────────────────────────────
const daeLabel = (v: string | null) =>
  ({ principal: 'Principal', alteracao: 'Alteração' }[v ?? ''] ?? '—');

const opcaoLabel = (v: string) =>
  ({ sempre: 'Sempre', se_troca: 'Se troca', nunca: 'Nunca' }[v] ?? v);

// ── Money helpers (reutilizados de CustosFixosSection) ───────────────────────
function maskMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function unmaskMoney(str: string): number {
  const digits = str.replace(/\D/g, '');
  return parseInt(digits || '0', 10) / 100;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Configuracoes() {
  const [configs, setConfigs] = useState<ServiceConfig[]>([]);
  const [custos, setCustos] = useState<PriceTableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<ServiceConfig | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgs, priceItems] = await Promise.all([
        getAllServiceConfigs(),
        getPriceTable(),
      ]);
      setConfigs(cfgs);
      setCustos(priceItems);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('config-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_config' }, () => {
        invalidateConfigCache();
        carregar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_prices' }, () => {
        carregar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'price_table' }, () => {
        carregar();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [carregar]);

  const handleSaved = () => {
    setModalOpen(false);
    invalidateConfigCache();
    carregar();
  };

  const handleDeleted = () => {
    setModalOpen(false);
    invalidateConfigCache();
    carregar();
  };

  const openNew = () => { setModalConfig(null); setModalOpen(true); };
  const openEdit = (cfg: ServiceConfig) => { setModalConfig(cfg); setModalOpen(true); };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Page header — mantém estilo inline do app */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <Settings size={24} color="var(--color-primary)" />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            Configurações de Serviços
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
            Gerencie os tipos de serviço, documentos exigidos e configurações de custo.
          </p>
        </div>
      </div>

      <Tabs defaultValue="servicos">
        <TabsList className="mb-4">
          <TabsTrigger value="servicos">⚙ Serviços DETRAN</TabsTrigger>
          <TabsTrigger value="custos">💰 Custos Fixos</TabsTrigger>
        </TabsList>

        {/* ── Aba Serviços DETRAN ── */}
        <TabsContent value="servicos">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
              Serviços cadastrados
            </h2>
            <Button onClick={openNew} size="sm">
              <Plus className="mr-1 size-4" />
              Novo Serviço
            </Button>
          </div>

          {loading ? (
            <p style={{ color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 48 }}>
              Carregando configurações...
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Docs PF</TableHead>
                    <TableHead>Docs PJ</TableHead>
                    <TableHead>DAE</TableHead>
                    <TableHead>Vistoria</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                        Nenhum serviço cadastrado. Clique em "Novo Serviço" para começar.
                      </TableCell>
                    </TableRow>
                  ) : configs.map(cfg => (
                    <TableRow key={cfg.id}>
                      <TableCell className="font-medium">{cfg.nome_exibicao}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{cfg.documentos_pf.length} doc{cfg.documentos_pf.length !== 1 ? 's' : ''}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{cfg.documentos_pj.length} doc{cfg.documentos_pj.length !== 1 ? 's' : ''}</Badge>
                      </TableCell>
                      <TableCell>{daeLabel(cfg.dae_tipo)}</TableCell>
                      <TableCell>{opcaoLabel(cfg.gera_vistoria)}</TableCell>
                      <TableCell>{opcaoLabel(cfg.gera_placa)}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.ativo ? 'default' : 'secondary'}>
                          {cfg.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(cfg)}>
                          <Edit2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Aba Custos Fixos ── */}
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
  );
}

// ── Custos Fixos Section ──────────────────────────────────────────────────────
function CustosFixosSection({ custos, onDataChanged }: { custos: PriceTableItem[]; onDataChanged: () => void }) {
  const [editingCost, setEditingCost] = useState<{ id: string; valor: string } | null>(null);
  const [newCost, setNewCost] = useState<{ descricao: string; codigo: string; valor: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const salvarCusto = async (costId: string, valorStr: string) => {
    try {
      await updatePriceItem(costId, unmaskMoney(valorStr));
      setEditingCost(null);
      setError(null);
      onDataChanged();
    } catch {
      setError('Erro ao salvar custo.');
    }
  };

  const adicionarCusto = async () => {
    if (!newCost || !newCost.descricao.trim() || !newCost.codigo.trim()) {
      setError('Preencha descrição e código do custo.');
      return;
    }
    try {
      const { error: insertErr } = await supabase.from('price_table').insert({
        codigo: newCost.codigo.trim().toLowerCase().replace(/\s+/g, '_'),
        descricao: newCost.descricao.trim(),
        valor: unmaskMoney(newCost.valor),
        ativo: true,
      });
      if (insertErr) throw insertErr;
      setNewCost(null);
      setError(null);
      onDataChanged();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao adicionar custo.');
    }
  };

  const removerCusto = async (costId: string) => {
    try {
      const { error: delErr } = await supabase.from('price_table').update({ ativo: false }).eq('id', costId);
      if (delErr) throw delErr;
      onDataChanged();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao remover custo.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign size={18} color="var(--color-primary)" />
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
            Custos Fixos
          </h2>
        </div>
        {!newCost && (
          <Button size="sm" variant="outline" onClick={() => setNewCost({ descricao: '', codigo: '', valor: '' })}>
            <Plus className="mr-1 size-4" />
            Adicionar
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive mb-3">{error}</p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {custos.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Nenhum custo fixo cadastrado.
                </TableCell>
              </TableRow>
            )}
            {custos.map(cost => (
              <TableRow key={cost.id}>
                <TableCell>{cost.descricao}</TableCell>
                <TableCell className="font-mono text-sm">{cost.codigo}</TableCell>
                <TableCell>
                  {editingCost?.id === cost.id ? (
                    <Input
                      className="w-32"
                      value={editingCost.valor}
                      onChange={e => setEditingCost({ id: cost.id, valor: e.target.value })}
                      placeholder="R$ 0,00"
                      autoFocus
                    />
                  ) : (
                    maskMoney(cost.valor)
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {editingCost?.id === cost.id ? (
                      <Button size="icon" variant="ghost" onClick={() => salvarCusto(cost.id, editingCost.valor)}>
                        <Save className="size-4" />
                      </Button>
                    ) : (
                      <Button size="icon" variant="ghost" onClick={() => setEditingCost({ id: cost.id, valor: maskMoney(cost.valor) })}>
                        <Edit2 className="size-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => removerCusto(cost.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {newCost && (
              <TableRow>
                <TableCell>
                  <Input
                    value={newCost.descricao}
                    onChange={e => setNewCost({ ...newCost, descricao: e.target.value })}
                    placeholder="Descrição"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newCost.codigo}
                    onChange={e => setNewCost({ ...newCost, codigo: e.target.value })}
                    placeholder="codigo_custo"
                    className="font-mono"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newCost.valor}
                    onChange={e => setNewCost({ ...newCost, valor: e.target.value })}
                    placeholder="R$ 0,00"
                    className="w-32"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={adicionarCusto}>
                      <Save className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => { setNewCost(null); setError(null); }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rodar build**

```bash
npm run build
```

Esperado: passa sem erros TypeScript. Erros comuns e soluções:
- `getPriceTable` não encontrado → verificar o export exato em `src/lib/financeService.ts` e ajustar o import
- `PriceTableItem` não encontrado → verificar o export em `src/types/finance.ts`
- `updatePriceItem` não encontrado → verificar nome exato da função em `financeService.ts`

- [ ] **Step 3: Commit**

```bash
git add src/pages/Configuracoes.tsx
git commit -m "feat: rewrite Configuracoes page with shadcn Tabs + Table + ServiceEditModal"
```

---

## Task 7: Verificação de não-regressão

**Files:** nenhum

- [ ] **Step 1: Rodar o app em desenvolvimento**

```bash
npm run dev
```

- [ ] **Step 2: Verificar páginas não afetadas**

Abrir no browser e inspecionar visualmente:
- `/` ou `/dashboard` — layout intacto
- `/os` (OSList) — tabela de ordens intacta
- `/clientes` (ClientesList) — lista intacta

Se alguma página estiver com layout quebrado (espaçamentos estranhos, fontes alteradas), o mais provável é que o `@tailwind base` sobrescreveu algum reset global. Solução: adicionar `corePlugins: { preflight: false }` ao `tailwind.config.js`.

- [ ] **Step 3: Verificar página Configurações**

Navegar para `/configuracoes`:
- Tabela exibe os 9 serviços
- Botão "+ Novo Serviço" abre modal com campo Identificador visível
- Clique em editar (ícone lápis) abre modal com dados preenchidos e sem campo Identificador
- Botão "Salvar" no modal atualiza a tabela
- Botão "Excluir" exibe AlertDialog de confirmação
- Aba "Custos Fixos" exibe os custos da price_table

- [ ] **Step 4: Commit final (se ajustes foram necessários)**

```bash
git add -A
git commit -m "fix: tailwind preflight adjustments for non-regression"
```

---

## Troubleshooting

| Problema | Causa provável | Solução |
|----------|---------------|---------|
| Build falha com `Cannot find module '@/components/ui/...'` | Alias `@/` não configurado no Vite | Adicionar `resolve.alias` no `vite.config.ts`: `'@': path.resolve(__dirname, './src')` |
| Layout global quebrado após Tailwind | Preflight reset | Adicionar `corePlugins: { preflight: false }` no `tailwind.config.js` |
| `getPriceTable` não existe | Nome diferente em financeService | Buscar a função no arquivo e ajustar import |
| Modal não abre | `open` prop não chegando | Verificar que `modalOpen` e `setModalOpen` estão conectados |
| `DocumentoExtra` type error | Não exportado por configService | Verificar e adicionar `export` na interface em `configService.ts` |

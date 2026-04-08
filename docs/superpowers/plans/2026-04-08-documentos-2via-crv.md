# Documentos 2ª Via CRV — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir geração com um clique de Comunicado de Extravio e Requerimento de 2ª Via do CRV pré-preenchidos com dados do cliente/veículo da OS.

**Architecture:** Novo módulo `src/lib/gerarDocumentos2Via.ts` com duas funções. O Comunicado usa template `.docx` existente em `public/` via `docxtemplater`. O Requerimento é construído do zero via lib `docx`. Ambos abrem em nova aba como blob. Botões aparecem condicionalmente na seção de checklist de `OSDetail.tsx` quando a OS tem serviço "2ª via CRV".

**Tech Stack:** React + TypeScript, `docxtemplater`, `pizzip`, `docx`, `file-saver`.

**Spec:** [2026-04-08-documentos-2via-crv-design.md](../specs/2026-04-08-documentos-2via-crv-design.md)

---

## Pré-requisito Manual

- [ ] **Usuário marca checkboxes no template**: abrir `public/ComunicadoExtravio_CRV_CRLV.docx` no Word, marcar `(X) Extravio` e `(X) CRV` nos parênteses correspondentes, salvar.

---

## Task 1: Instalar dependências

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar libs**

```bash
npm install docxtemplater pizzip docx file-saver
npm install -D @types/file-saver
```

- [ ] **Step 2: Verificar que instalou**

```bash
npm list docxtemplater pizzip docx file-saver
```
Expected: todas listadas sem erro.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add docxtemplater, pizzip, docx, file-saver para geração de documentos 2ª via"
```

---

## Task 2: Verificar tipos Cliente e Veiculo

**Files:**
- Read: `src/types.ts`

- [ ] **Step 1: Ler types.ts e confirmar campos**

Abrir `src/types.ts` e confirmar que existem (ou anotar os nomes reais):
- `Cliente`: `nome`, `endereco`, `numero`, `complemento`, `bairro`, `cidade`, `cep`
- `Veiculo`: `marca`, `modelo`, `placa`, `chassi`, `cor`

Se algum nome for diferente, ajustar os mapeamentos nas próximas tasks. Anotar aqui:

```
Cliente: (campos reais encontrados)
Veiculo: (campos reais encontrados)
```

- [ ] **Step 2: Sem commit** (apenas leitura)

---

## Task 3: Criar helper de formatação de data

**Files:**
- Create: `src/lib/gerarDocumentos2Via.ts`

- [ ] **Step 1: Criar arquivo com helper de data**

```ts
// src/lib/gerarDocumentos2Via.ts
import type { Cliente, Veiculo } from '../types';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function formatarDataExtenso(d: Date = new Date()): string {
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = MESES[d.getMonth()];
  const ano = d.getFullYear();
  return `${dia} de ${mes} de ${ano}`;
}

function abrirBlobEmNovaAba(blob: Blob, nomeSugerido: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeSugerido;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/gerarDocumentos2Via.ts
git commit -m "feat(docs-2via): cria módulo com helpers de data e download de blob"
```

---

## Task 4: Implementar `gerarComunicadoExtravio`

**Files:**
- Modify: `src/lib/gerarDocumentos2Via.ts`

- [ ] **Step 1: Adicionar imports e função**

Adicionar no topo:
```ts
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
```

Adicionar função no final:
```ts
export async function gerarComunicadoExtravio(
  cliente: Cliente,
  veiculo: Veiculo
): Promise<void> {
  const resp = await fetch('/ComunicadoExtravio_CRV_CRLV.docx');
  if (!resp.ok) {
    throw new Error('Template do Comunicado não encontrado em /public');
  }
  const arrayBuffer = await resp.arrayBuffer();
  const zip = new PizZip(arrayBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });

  const data = {
    nome: cliente.nome ?? '',
    endereco: cliente.endereco ?? '',
    numero: cliente.numero ?? '',
    complemento: cliente.complemento ?? '',
    bairro: cliente.bairro ?? '',
    municipio: cliente.cidade ?? 'Itabira',
    cep: cliente.cep ?? '',
    marca_modelo: `${veiculo.marca ?? ''} ${veiculo.modelo ?? ''}`.trim(),
    placa: veiculo.placa ?? '',
    local_data: `Itabira, ${formatarDataExtenso()}`,
  };

  doc.render(data);
  const blob = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  abrirBlobEmNovaAba(blob, `Comunicado_Extravio_${veiculo.placa ?? 'veiculo'}.docx`);
}
```

- [ ] **Step 2: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```
Expected: sem erros em `gerarDocumentos2Via.ts`. Se houver erros de tipo dos campos de Cliente/Veiculo, ajustar nomes conforme Task 2.

- [ ] **Step 3: Commit**

```bash
git add src/lib/gerarDocumentos2Via.ts
git commit -m "feat(docs-2via): implementa gerarComunicadoExtravio via template docxtemplater"
```

---

## Task 5: Implementar `gerarRequerimento2Via`

**Files:**
- Modify: `src/lib/gerarDocumentos2Via.ts`

- [ ] **Step 1: Adicionar import da lib docx**

```ts
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
```

- [ ] **Step 2: Adicionar função**

```ts
export async function gerarRequerimento2Via(
  cliente: Cliente,
  veiculo: Veiculo
): Promise<void> {
  const dataStr = formatarDataExtenso();
  const marcaModelo = `${veiculo.marca ?? ''} ${veiculo.modelo ?? ''}`.trim();

  const p = (text: string, opts: { bold?: boolean; align?: AlignmentType } = {}) =>
    new Paragraph({
      alignment: opts.align,
      spacing: { after: 240 },
      children: [new TextRun({ text, bold: opts.bold, size: 24 })],
    });

  const linhaEmBranco = () => new Paragraph({ children: [new TextRun('')] });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          p(`Itabira, ${dataStr}.`, { align: AlignmentType.RIGHT }),
          linhaEmBranco(),
          linhaEmBranco(),
          p(`O infra ${cliente.nome ?? ''},`),
          p(
            `Residente, ${cliente.endereco ?? ''}, nº ${cliente.numero ?? ''}, Bairro ${cliente.bairro ?? ''},`
          ),
          p(`Proprietário do veículo ${marcaModelo} de placa ${veiculo.placa ?? ''},`),
          p(`Chassi: ${veiculo.chassi ?? ''},`),
          p(
            `Cor ${veiculo.cor ?? ''}, vem muito respeitosamente requerer autorização para que`
          ),
          p('Seja emitida a Segunda Via do CRV do veículo acima descrito.', {
            bold: true,
          }),
          linhaEmBranco(),
          linhaEmBranco(),
          linhaEmBranco(),
          p('Termo em que pede deferimento.'),
          linhaEmBranco(),
          linhaEmBranco(),
          p('_________________________________________', {
            align: AlignmentType.CENTER,
          }),
          p('Assinatura do requerente', { align: AlignmentType.CENTER }),
          linhaEmBranco(),
          linhaEmBranco(),
          p('Despacho da autoridade', { bold: true }),
          p('( ) deferido        ( ) indeferido'),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  abrirBlobEmNovaAba(blob, `Requerimento_2Via_CRV_${veiculo.placa ?? 'veiculo'}.docx`);
}
```

- [ ] **Step 3: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/gerarDocumentos2Via.ts
git commit -m "feat(docs-2via): implementa gerarRequerimento2Via construído via lib docx"
```

---

## Task 6: Integrar botões em `OSDetail.tsx`

**Files:**
- Modify: `src/pages/OSDetail.tsx`

- [ ] **Step 1: Localizar seção do checklist**

Abrir `src/pages/OSDetail.tsx` e identificar onde a seção de checklist é renderizada. Anotar a região onde os botões serão inseridos (acima ou abaixo da lista de itens).

- [ ] **Step 2: Adicionar import**

No topo do arquivo:
```ts
import {
  gerarComunicadoExtravio,
  gerarRequerimento2Via,
} from '../lib/gerarDocumentos2Via';
```

- [ ] **Step 3: Adicionar detecção do serviço e handler**

Dentro do componente, após `os` estar disponível:
```ts
const temServico2ViaCrv = useMemo(
  () =>
    (os?.servicos ?? []).some(
      (s) => /2[ªa]?\s*via/i.test(s.nome) && /crv/i.test(s.nome)
    ) && !!veiculo,
  [os?.servicos, veiculo]
);

const handleGerarComunicado = async () => {
  if (!cliente || !veiculo) return;
  try {
    await gerarComunicadoExtravio(cliente, veiculo);
  } catch (e) {
    console.error(e);
    toast.error('Erro ao gerar Comunicado de Extravio');
  }
};

const handleGerarRequerimento = async () => {
  if (!cliente || !veiculo) return;
  try {
    await gerarRequerimento2Via(cliente, veiculo);
  } catch (e) {
    console.error(e);
    toast.error('Erro ao gerar Requerimento');
  }
};
```

Nota: ajustar `useMemo` import, nomes de `cliente`/`veiculo`/`os.servicos` conforme o que o arquivo já usa. Se não houver `toast`, usar `alert()` ou o sistema de toast já existente no projeto.

- [ ] **Step 4: Renderizar botões dentro do JSX da seção de checklist**

```tsx
{temServico2ViaCrv && (
  <div className="mt-4 p-3 border rounded bg-blue-50">
    <h4 className="font-semibold mb-2">Documentos 2ª Via CRV</h4>
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handleGerarComunicado}
        className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Gerar Comunicado de Extravio
      </button>
      <button
        type="button"
        onClick={handleGerarRequerimento}
        className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Gerar Requerimento 2ª Via
      </button>
    </div>
  </div>
)}
```

Ajustar classes conforme padrão visual do projeto (verificar botões existentes em OSDetail).

- [ ] **Step 5: Verificar compilação**

```bash
npx tsc --noEmit && npm run build
```
Expected: build sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/pages/OSDetail.tsx
git commit -m "feat(docs-2via): adiciona botões de geração de documentos na seção de checklist da OS"
```

---

## Task 7: Teste manual end-to-end

- [ ] **Step 1: Rodar dev server**

```bash
npm run dev
```

- [ ] **Step 2: Criar/abrir OS com serviço "2ª via CRV"**

Verificar: botões "Gerar Comunicado de Extravio" e "Gerar Requerimento 2ª Via" aparecem na seção de checklist.

- [ ] **Step 3: Abrir OS sem esse serviço**

Verificar: botões NÃO aparecem.

- [ ] **Step 4: Clicar "Gerar Comunicado"**

Verificar:
- Arquivo `.docx` baixa/abre
- Campos preenchidos: nome, endereço, número, bairro, município, CEP, marca/modelo, placa, data
- Checkboxes `(X) Extravio` e `(X) CRV` continuam marcados (como no template editado)

- [ ] **Step 5: Clicar "Gerar Requerimento"**

Verificar:
- Arquivo `.docx` baixa/abre
- Cabeçalho com data atual em Itabira
- Nome, endereço, marca/modelo, placa, chassi, cor preenchidos
- Texto "Seja emitida a Segunda Via do CRV do veículo acima descrito." presente
- Espaçamento adequado para assinatura manual

- [ ] **Step 6: Testar caso de borda — cliente sem complemento**

Verificar: Comunicado gera sem erro, campo complemento fica vazio.

- [ ] **Step 7: Se tudo OK, commit final de verificação (se houver ajustes)**

Se não houve ajustes, pular este passo.

---

## Arquivos Finais

**Criados:**
- `src/lib/gerarDocumentos2Via.ts`
- `docs/superpowers/specs/2026-04-08-documentos-2via-crv-design.md`
- `docs/superpowers/plans/2026-04-08-documentos-2via-crv.md`

**Modificados:**
- `src/pages/OSDetail.tsx`
- `package.json`, `package-lock.json`

**Pré-existente editado manualmente pelo usuário:**
- `public/ComunicadoExtravio_CRV_CRLV.docx` (marcar `(X) Extravio` e `(X) CRV`)

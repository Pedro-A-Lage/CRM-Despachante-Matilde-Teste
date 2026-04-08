# Geração de Documentos de 2ª Via CRV

**Data:** 2026-04-08
**Status:** Aprovado — pronto para plano de implementação

## Objetivo

Quando uma OS contiver serviço de "2ª via CRV", permitir ao usuário gerar com um clique dois documentos pré-preenchidos com os dados do cliente e do veículo já cadastrados:

1. **Comunicado de Extravio/Furto/Roubo ao DETRAN-MG** (CRV)
2. **Requerimento de 2ª Via do CRV**

Ambos abrem em nova aba como `.docx`, prontos para o usuário imprimir (Ctrl+P no Word ou navegador).

## Escopo

### Dentro

- Detecção automática de serviço "2ª via CRV" na OS (pelo nome do serviço).
- Dois botões na seção de checklist da página OSDetail.
- Geração do Comunicado via template `.docx` existente em `public/`.
- Geração do Requerimento programaticamente (texto fixo, layout simples com espaçamento para assinatura).
- Cidade fixa "Itabira" em ambos os documentos.
- Data atual preenchida automaticamente.

### Fora (YAGNI)

- Edição dos campos antes da geração (usuário edita no Word se precisar).
- Assinatura digital.
- Persistir o documento gerado no banco/OS.
- Suporte a CRLV (só CRV nesta versão).
- Suporte a furto/roubo (só extravio nesta versão — checkboxes marcados fixos no template).

## Arquitetura

### Dependências novas

```
npm install docxtemplater pizzip docx file-saver
npm install -D @types/file-saver
```

- `docxtemplater` + `pizzip` — substituir placeholders no template Comunicado.
- `docx` — construir o Requerimento do zero.
- `file-saver` — fallback caso `window.open(blob)` não funcione em algum navegador.

### Template do Comunicado

Arquivo: `public/ComunicadoExtravio_CRV_CRLV.docx` (já existe com placeholders).

**Placeholders presentes no template:**
`{nome}`, `{endereco}`, `{numero}`, `{complemento}`, `{bairro}`, `{municipio}`, `{cep}`, `{marca_modelo}`, `{placa}`, `{local_data}`

**Observação:** o usuário marcará manualmente `(X) Extravio` e `(X) CRV` diretamente no .docx antes do deploy. Código não mexe nesses checkboxes.

### Módulo novo: `src/lib/gerarDocumentos2Via.ts`

Exporta duas funções assíncronas:

```ts
export async function gerarComunicadoExtravio(
  cliente: Cliente,
  veiculo: Veiculo
): Promise<void>

export async function gerarRequerimento2Via(
  cliente: Cliente,
  veiculo: Veiculo
): Promise<void>
```

**`gerarComunicadoExtravio`:**

1. `fetch('/ComunicadoExtravio_CRV_CRLV.docx')` → `arrayBuffer`
2. Carrega com `PizZip` + `Docxtemplater`
3. Monta objeto de dados:
   - `nome`: `cliente.nome`
   - `endereco`: `cliente.endereco` (rua/av)
   - `numero`: `cliente.numero`
   - `complemento`: `cliente.complemento || ''`
   - `bairro`: `cliente.bairro`
   - `municipio`: `cliente.cidade` (ou "Itabira" se vazio)
   - `cep`: `cliente.cep`
   - `marca_modelo`: `${veiculo.marca} ${veiculo.modelo}`
   - `placa`: `veiculo.placa`
   - `local_data`: `Itabira, ${dia} de ${mesExtenso} de ${ano}`
4. `doc.render(data)` → `doc.getZip().generate({ type: 'blob' })`
5. `window.open(URL.createObjectURL(blob), '_blank')`

**`gerarRequerimento2Via`:**

Usa a lib `docx` pra montar estrutura (`Document` → `Paragraph[]`) com:

- Cabeçalho: `Itabira, {dia} de {mes} de {ano}.` (alinhado à direita)
- Linha em branco (espaçamento generoso)
- `O infra {nome},`
- `Residente, {endereco}, nº {numero}, Bairro {bairro},`
- `Proprietário do veículo {marca_modelo} de placa {placa},`
- `Chassi, {chassi},`
- `Cor {cor}, vem muito respeitosamente requerer autorização para que`
- `Seja emitida a Segunda Via do CRV do veículo acima descrito.`
- Espaçamento generoso (5-6 linhas em branco)
- `Termo em que pede deferimento`
- Linha para assinatura: `_________________________________________`
- `Assinatura do requerente`
- `Despacho da autoridade`
- `( ) deferido    ( ) indeferido`

Gera blob via `Packer.toBlob(doc)` → `window.open(URL.createObjectURL(blob), '_blank')`.

### Helper de data

Função local `formatarDataExtenso(): string` retorna string tipo `"08 de abril de 2026"` usando `Date` nativa (sem dependência nova).

### Modificação: `src/pages/OSDetail.tsx`

1. **Detecção do serviço 2ª via CRV:**

```ts
const temServico2ViaCrv = os.servicos.some(s =>
  /2[ªa]?\s*via/i.test(s.nome) && /crv/i.test(s.nome)
);
```

2. **UI — dentro da seção de checklist**, acima ou abaixo da lista de itens, renderizar condicionalmente:

```tsx
{temServico2ViaCrv && (
  <div className="docs-2via">
    <h4>Documentos 2ª Via CRV</h4>
    <button onClick={() => gerarComunicadoExtravio(cliente, veiculo)}>
      Gerar Comunicado de Extravio
    </button>
    <button onClick={() => gerarRequerimento2Via(cliente, veiculo)}>
      Gerar Requerimento 2ª Via
    </button>
  </div>
)}
```

3. Tratamento de erro: `try/catch` em volta das chamadas, mostrando toast de erro se template não carregar ou dados do cliente/veículo estiverem incompletos.

## Fluxo de Dados

```
OSDetail → detecta serviço "2ª via CRV"
        → mostra 2 botões na seção de checklist
        → clique → gerarDocumentos2Via.ts
                 → (Comunicado) fetch template → docxtemplater.render → blob
                 → (Requerimento) docx lib → Packer.toBlob → blob
        → window.open(blob URL) → nova aba abre .docx
        → usuário imprime via Word/navegador
```

## Tratamento de Erros

- **Template não encontrado** (404 no fetch): toast "Template do Comunicado não encontrado em /public".
- **Campos do cliente faltando**: placeholders ficam com string vazia, sem quebrar geração (docxtemplater trata `undefined` como `''` quando configurado com `nullGetter`).
- **Veículo não vinculado à OS**: botões não aparecem (validação prévia) — OU aparecem desabilitados com tooltip "OS sem veículo vinculado". Decisão: **não aparecem** se `!veiculo`.

## Testes

- [ ] Criar OS com serviço "2ª via CRV" → botões aparecem
- [ ] Criar OS sem esse serviço → botões não aparecem
- [ ] Gerar Comunicado → abre .docx com campos preenchidos
- [ ] Gerar Requerimento → abre .docx com campos preenchidos, data atual correta
- [ ] Cliente sem complemento → campo fica vazio, sem quebrar
- [ ] OS sem veículo → botões não aparecem

## Arquivos Afetados

**Criar:**
- `src/lib/gerarDocumentos2Via.ts`

**Modificar:**
- `src/pages/OSDetail.tsx` (detecção + botões na seção de checklist)
- `package.json` (novas dependências)

**Pré-requisito manual (usuário):**
- Editar `public/ComunicadoExtravio_CRV_CRLV.docx` e marcar `(X) Extravio` e `(X) CRV` nos checkboxes correspondentes (um vez só, antes do deploy).

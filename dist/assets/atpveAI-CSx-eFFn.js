const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-Ar5GlpMc.js","assets/main-BLekC-Gg.css"])))=>i.map(i=>d[i]);
import{_ as V,G as g}from"./main-Ar5GlpMc.js";const L=new g(void 0),U=L.getGenerativeModel({model:"gemini-2.5-flash",generationConfig:{maxOutputTokens:4096,responseMimeType:"application/json"}});function h(n){const c=new Uint8Array(n);let e="";for(let a=0;a<c.byteLength;a++)e+=String.fromCharCode(c[a]);return btoa(e)}function j(n){if(n.type)return n.type;const c=n.name.toLowerCase();return c.endsWith(".pdf")?"application/pdf":c.endsWith(".png")?"image/png":c.endsWith(".jpg")||c.endsWith(".jpeg")?"image/jpeg":c.endsWith(".webp")?"image/webp":"application/pdf"}const F=`Você é um especialista em documentos veiculares brasileiros. Analise este ATPV-e (Autorização para Transferência de Propriedade de Veículo Eletrônico) e extraia os dados.

Retorne APENAS um objeto JSON válido, sem markdown, sem explicações:
{
  "tipoDocumento": "",
  "placa": "",
  "chassi": "",
  "renavam": "",
  "marcaModelo": "",
  "anoFabricacao": "",
  "anoModelo": "",
  "cor": "",
  "numeroCRV": "",
  "codigoSegurancaCRV": "",
  "numeroATPVe": "",
  "hodometro": "",
  "valorRecibo": "",
  "dataAquisicao": "",
  "comprador": {
    "tipoCpfCnpj": "",
    "cpfCnpj": "",
    "nome": "",
    "municipio": "",
    "uf": "",
    "cep": "",
    "endereco": "",
    "numero": "",
    "bairro": ""
  },
  "vendedor": {
    "tipoCpfCnpj": "",
    "cpfCnpj": "",
    "nome": "",
    "municipio": "",
    "uf": ""
  }
}

═══════════════════════════════════════════════════════
LAYOUT REAL DO ATPV-e (versão 2.1) — DUAS COLUNAS
═══════════════════════════════════════════════════════

O documento tem layout de DUAS COLUNAS. NÃO é linear de cima para baixo.
Leia com atenção — cada campo tem uma posição fixa:

┌─────────────────────────────────┬────────────────────────────────┐
│ CABEÇALHO                       │                                │
│ "AUTORIZAÇÃO PARA TRANSFERÊNCIA │  IDENTIFICAÇÃO DO VENDEDOR     │
│  DE PROPRIEDADE DE VEÍCULO      │  ┌──────────────────────────┐  │
│  - DIGITAL"                     │  │ NOME                     │  │
│ DETRAN - XX                     │  │ MARIA DA PENHA DE ...    │  │
│                                 │  │ CPF/CNPJ    │ E-MAIL     │  │
│ ┌────────────────────────┐      │  │ 912.448...  │ email@...  │  │
│ │ CÓDIGO RENAVAM         │ [QR] │  │ MUNICÍPIO   │ UF         │  │
│ │ 00490915965            │      │  │ ITABIRA     │ MG         │  │
│ │ PLACA                  │      │  └──────────────────────────┘  │
│ │ OOX9649                │      │                                │
│ │ ANO FABRICAÇÃO │ ANO MODELO │  │  Valor declarado na venda:    │
│ │ 2012           │ 2013       │  │  R$ 50.000,00                 │
│ └────────────────────────┘      │                                │
│                                 │  LOCAL _______________          │
│ MARCA / MODELO / VERSÃO         │                                │
│ FORD/ECOSPORT TIT 2.0           │  DATA DECLARADA DA VENDA ___   │
│                                 │                                │
│ CAT: ***                        │                                │
│                                 │                                │
│ COR PREDOMINANTE │ CHASSI       │                                │
│ PRATA            │ 9BFZB55H...  │                                │
│                                 │                                │
│ NÚMERO CRV       │ CÓD SEG CRV │                                │
│ 223614924343     │ 08517468392  │                                │
│                                 │                                │
│ NÚMERO ATPVe     │ DATA EMISSÃO │                                │
│ 253221027915965  │ 22/12/2022   │                                │
│                                 │                                │
│ HODÔMETRO                       │                                │
│ 120                             │                                │
├─────────────────────────────────┴────────────────────────────────┤
│                                                                  │
│ IDENTIFICAÇÃO DO COMPRADOR                                       │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ NOME                                                        │ │
│ │ JUNIOR ANTONIO MEIRELES E SILVA                             │ │
│ │ CPF/CNPJ           │ E-MAIL                                 │ │
│ │ 046.935.206-08     │ PRIMEAUTOMOVEIS2@GMAIL.COM             │ │
│ │ MUNICÍPIO DE DOMICÍLIO OU RESIDÊNCIA          │ UF          │ │
│ │ IPATINGA                                      │ MG          │ │
│ │ ENDEREÇO DE DOMICÍLIO OU RESIDÊNCIA                         │ │
│ │ DIAMANTE 245 AP501                                          │ │
│ │ IGUACU CEP: 35162-057                                       │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════
ONDE ESTÁ CADA CAMPO — LEIA COM CUIDADO
═══════════════════════════════════════════════════════

TIPO DO DOCUMENTO:
- Se o título contém "AUTORIZAÇÃO PARA TRANSFERÊNCIA DE PROPRIEDADE DE VEÍCULO" → "atpve"
- Se contém "CERTIFICADO DE REGISTRO E LICENCIAMENTO" → "crlv"
- Senão → "outro"
- Se NÃO for ATPV-e, retorne apenas tipoDocumento e todos os outros campos vazios.

COLUNA ESQUERDA SUPERIOR — DADOS DO VEÍCULO:
- "renavam": label "CÓDIGO RENAVAM", valor abaixo (ex: "00490915965"), apenas dígitos
- "placa": label "PLACA", valor abaixo (ex: "OOX9649"), maiúsculo sem espaços
- "anoFabricacao": label "ANO FABRICAÇÃO", 4 dígitos
- "anoModelo": label "ANO MODELO", 4 dígitos, célula ao lado do ano fabricação
- "marcaModelo": label "MARCA / MODELO / VERSÃO", valor abaixo (ex: "FORD/ECOSPORT TIT 2.0")
- "cor": label "COR PREDOMINANTE", valor abaixo (ex: "PRATA")
- "chassi": label "CHASSI", valor ao lado da cor (ex: "9BFZB55H0D8773108"), 17 caracteres
- "numeroCRV": label "NÚMERO CRV", valor abaixo (ex: "223614924343")
- "codigoSegurancaCRV": label "CÓDIGO DE SEGURANÇA CRV", valor ao lado do número CRV
- "numeroATPVe": label "NÚMERO ATPVe", valor abaixo (ex: "253221027915965")
- "hodometro": label "HODÔMETRO", valor abaixo (ex: "120")

COLUNA DIREITA SUPERIOR — IDENTIFICAÇÃO DO VENDEDOR:
  A seção "IDENTIFICAÇÃO DO VENDEDOR" fica no CANTO SUPERIOR DIREITO do documento.
  Cada campo tem um label em cima e o valor embaixo:
- "vendedor.nome": label "NOME", valor na linha abaixo (ex: "MARIA DA PENHA DE ALMEIDA")
  ⚠️ O NOME é um nome de PESSOA (ex: "MARIA DA PENHA DE ALMEIDA"), NUNCA é nome de cidade.
- "vendedor.cpfCnpj": label "CPF/CNPJ", valor abaixo (ex: "912.448.896-87")
- "vendedor.tipoCpfCnpj": "CPF" se tem 11 dígitos, "CNPJ" se tem 14
- "vendedor.municipio": label "MUNICÍPIO DE DOMICÍLIO OU RESIDÊNCIA", valor abaixo
- "vendedor.uf": label "UF", valor ao lado do município (ex: "MG")

COLUNA DIREITA — VALOR E DATA DA VENDA:
- "valorRecibo": texto "Valor declarado na venda: R$" seguido do valor (ex: "50.000,00"). Extraia SEM o "R$".
- "dataAquisicao": label "DATA DECLARADA DA VENDA", valor ao lado ou abaixo.
  ⚠️ CRITICAL: Se este campo estiver em branco/vazio no documento, retorne "".
  NUNCA use "DATA EMISSÃO DO CRV" (que fica na coluna esquerda) nem nenhuma outra data.

PARTE INFERIOR — IDENTIFICAÇÃO DO COMPRADOR:
  A seção "IDENTIFICAÇÃO DO COMPRADOR" ocupa toda a largura na PARTE DE BAIXO do documento.
  Cada campo tem um label em cima e o valor embaixo:
- "comprador.nome": label "NOME", valor na linha abaixo (ex: "JUNIOR ANTONIO MEIRELES E SILVA")
  ⚠️ O NOME é um nome de PESSOA COMPLETO. NUNCA é nome de cidade ou município.
  Se você leu "IPATINGA" como nome, ESTÁ ERRADO — isso é o município.
- "comprador.cpfCnpj": label "CPF/CNPJ", valor abaixo (ex: "046.935.206-08")
- "comprador.tipoCpfCnpj": "CPF" se 11 dígitos, "CNPJ" se 14
- "comprador.municipio": label "MUNICÍPIO DE DOMICÍLIO OU RESIDÊNCIA", valor abaixo (ex: "IPATINGA")
  ⚠️ Município é nome de CIDADE, não nome de pessoa.
- "comprador.uf": label "UF", valor ao lado do município (ex: "MG"), 2 letras

ENDEREÇO DO COMPRADOR (campo mais complexo):
  O endereço vem numa única caixa com label "ENDEREÇO DE DOMICÍLIO OU RESIDÊNCIA".
  O conteúdo pode ter TUDO junto em 1-2 linhas, exemplo:
    "DIAMANTE 245 AP501"
    "IGUACU CEP: 35162-057"
  Você precisa SEPARAR assim:
  - "comprador.endereco": SOMENTE o nome da rua/logradouro, SEM número (ex: "DIAMANTE")
  - "comprador.numero": SOMENTE o número do imóvel, primeiro número após o nome da rua (ex: "245")
    Ignore complemento como "AP501", "BLOCO B", "SALA 3" etc.
  - "comprador.bairro": nome do bairro, que geralmente aparece na SEGUNDA LINHA antes do CEP (ex: "IGUACU")
  - "comprador.cep": 8 dígitos, com ou sem hífen (ex: "35162-057" ou "35162057")

═══════════════════════════════════════════════════════
ERROS COMUNS — NÃO COMETA ESTES ERROS
═══════════════════════════════════════════════════════

❌ ERRADO: Colocar nome de cidade (IPATINGA, ITABIRA) no campo "nome" do comprador ou vendedor
✅ CERTO: "nome" é SEMPRE nome de pessoa (ex: "JUNIOR ANTONIO MEIRELES E SILVA")

❌ ERRADO: Confundir comprador com vendedor (são seções diferentes do documento)
✅ CERTO: VENDEDOR fica no CANTO SUPERIOR DIREITO, COMPRADOR fica na PARTE INFERIOR

❌ ERRADO: Usar "DATA EMISSÃO DO CRV" (22/12/2022) como dataAquisicao
✅ CERTO: dataAquisicao é SOMENTE "DATA DECLARADA DA VENDA" — se vazio, retornar ""

❌ ERRADO: Incluir número e complemento no campo endereco
✅ CERTO: endereco="DIAMANTE", numero="245" (separados)

❌ ERRADO: Incluir "R$" no valorRecibo
✅ CERTO: valorRecibo="50.000,00" (só o número)

Se um campo não existir no documento, deixe a string vazia "". Não invente dados.`;async function y(n){var r,d,m,u,D,I,E,C,s,l,R;const{extractVehicleData:c}=await V(async()=>{const{extractVehicleData:A}=await import("./main-Ar5GlpMc.js").then(p=>p.p);return{extractVehicleData:A}},__vite__mapDeps([0,1])),e=await c(n),a=A=>typeof A=="string"?A.trim():"",i=A=>{const p=A.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return p?`${p[3]}-${p[2]}-${p[1]}`:A},o=a(((r=e.comprador)==null?void 0:r.cpfCnpj)||e.cpfCnpjAdquirente||e.cpfCnpj).replace(/\D/g,""),t=a(((d=e.vendedor)==null?void 0:d.cpfCnpj)||e.cpfCnpjVendedor).replace(/\D/g,"");return{tipoServicoFolha:a(e.tipoServicoDetectado),placa:a(e.placa),chassi:a(e.chassi),renavam:a(e.renavam),valorRecibo:a(e.valorRecibo),dataAquisicao:i(a(e.dataAquisicao)),municipioEmplacamento:a((m=e.comprador)==null?void 0:m.municipio),comprador:{nome:a(((u=e.comprador)==null?void 0:u.nome)||e.nomeAdquirente||e.nomeProprietario),cpfCnpj:o,tipoCpfCnpj:o.length>11?"CNPJ":"CPF",rg:"",orgaoExpedidor:"",uf:a((D=e.comprador)==null?void 0:D.uf),endereco:a((I=e.comprador)==null?void 0:I.endereco),numero:a((E=e.comprador)==null?void 0:E.numero),cep:a((C=e.comprador)==null?void 0:C.cep),bairro:a((s=e.comprador)==null?void 0:s.bairro),municipio:a((l=e.comprador)==null?void 0:l.municipio)},vendedor:{nome:a(((R=e.vendedor)==null?void 0:R.nome)||e.nomeVendedor),cpfCnpj:t,tipoCpfCnpj:t.length>11?"CNPJ":"CPF"},veiculo:{tipo:a(e.tipo),marcaModelo:a(e.marcaModelo),anoFabricacao:a(e.anoFabricacao),anoModelo:a(e.anoModelo),cor:a(e.cor),combustivel:a(e.combustivel)}}}async function _(n,c,e,a=3){for(let i=1;i<=a;i++)try{return(await U.generateContent([{inlineData:{data:n,mimeType:c}},{text:e}])).response.text()}catch(o){const t=(o==null?void 0:o.message)||"";if((t.includes("429")||t.includes("503"))&&i<a){const r=t.match(/retry in (\d+)/i),d=r?Math.min(parseInt(r[1],10)+2,60):20;console.log(`[Matilde] Gemini rate limit, tentativa ${i}/${a}. Aguardando ${d}s...`),await new Promise(m=>setTimeout(m,d*1e3));continue}throw o}throw new Error("Gemini: máximo de tentativas excedido")}const G=10*1024*1024;async function B(n){var E,C,s,l,R,A,p,N,M,T,P,f,v,S,b,x;if(n.size>G)throw new Error(`Arquivo muito grande (${(n.size/1024/1024).toFixed(1)}MB). Máximo para análise IA: 10MB.`);const c=await n.arrayBuffer(),e=h(c),a=j(n),i=await _(e,a,F);let o;try{const O=i.match(/\{[\s\S]*\}/);o=JSON.parse(O?O[0]:i)}catch{throw new Error(`Gemini retornou resposta inválida: ${i.slice(0,200)}`)}const t=(o.tipoDocumento||"").toLowerCase().trim();if(t&&t!=="atpve"){const O={crlv:"CRLV",outro:"documento desconhecido"};throw new Error(`Documento inválido: este é um ${O[t]||t}, não um ATPV-e. Anexe um ATPV-e para transferência.`)}const r=O=>O&&O!==""?O:void 0,d={nome:r((E=o.comprador)==null?void 0:E.nome),cpfCnpj:r((C=o.comprador)==null?void 0:C.cpfCnpj),municipio:r((s=o.comprador)==null?void 0:s.municipio),uf:r((l=o.comprador)==null?void 0:l.uf),cep:r((R=o.comprador)==null?void 0:R.cep),endereco:r((A=o.comprador)==null?void 0:A.endereco),numero:r((p=o.comprador)==null?void 0:p.numero),bairro:r((N=o.comprador)==null?void 0:N.bairro)},m={nome:r((M=o.vendedor)==null?void 0:M.nome),cpfCnpj:r((T=o.vendedor)==null?void 0:T.cpfCnpj),municipio:r((P=o.vendedor)==null?void 0:P.municipio),uf:r((f=o.vendedor)==null?void 0:f.uf)},u=r((v=o.comprador)==null?void 0:v.tipoCpfCnpj)||((((S=d.cpfCnpj)==null?void 0:S.replace(/\D/g,"").length)??0)<=11?"CPF":"CNPJ"),D=r((b=o.vendedor)==null?void 0:b.tipoCpfCnpj)||((((x=m.cpfCnpj)==null?void 0:x.replace(/\D/g,"").length)??0)<=11?"CPF":"CNPJ");return{tipoDocumento:"atpve",placa:r(o.placa),renavam:r(o.renavam),chassi:r(o.chassi),marcaModelo:r(o.marcaModelo),anoFabricacao:r(o.anoFabricacao),anoModelo:r(o.anoModelo),cor:r(o.cor),numeroCRV:r(o.numeroCRV),codigoSegurancaCRV:r(o.codigoSegurancaCRV),numeroATPVe:r(o.numeroATPVe),hodometro:r(o.hodometro),dataAquisicao:r(o.dataAquisicao),valorRecibo:r(o.valorRecibo),comprador:d,vendedor:m,cpfCnpj:d.cpfCnpj,nomeAdquirente:d.nome,cpfCnpjAdquirente:d.cpfCnpj,nomeVendedor:m.nome,cpfCnpjVendedor:m.cpfCnpj,ufOrigem:m.uf,tipoCpfCnpjComprador:u,tipoCpfCnpjVendedor:D,tipoServicoDetectado:"transferencia",textoCompleto:i}}export{B as extrairDadosATPVeComIA,y as extrairDecalqueChassi};

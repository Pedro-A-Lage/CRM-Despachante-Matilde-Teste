import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
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

/**
 * Após render do docxtemplater, percorre o XML do document.xml e, para cada
 * par de marcadores MARK_IN/MARK_OUT envolvendo um valor, remove os marcadores
 * e consome até N espaços (N = length do valor) à frente do MARK_OUT,
 * atravessando múltiplos <w:t> se necessário. Preserva a largura visual do
 * formulário (em vez de apenas acrescentar texto antes dos espaços existentes).
 */
function consumirEspacosPosValor(
  xml: string,
  markIn: string,
  markOut: string,
): string {
  const pairRe = new RegExp(
    markIn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '([\\s\\S]*?)' +
      markOut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'g',
  );

  // Coletar ocorrências (do fim pro começo para não invalidar índices)
  type Hit = { start: number; end: number; value: string };
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(xml))) {
    hits.push({ start: m.index, end: m.index + m[0].length, value: m[1] });
  }

  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    // Quantidade de chars do valor já renderizado (ignorando espaços do próprio valor)
    let toConsume = [...h.value].length;

    // 1) Remover marcadores: substituir o match por apenas o valor
    xml = xml.slice(0, h.start) + h.value + xml.slice(h.end);

    // 2) A partir do fim do valor, consumir espaços à frente, saltando tags XML
    let cursor = h.start + h.value.length;
    while (toConsume > 0 && cursor < xml.length) {
      // Se estamos em uma tag, pulá-la
      if (xml[cursor] === '<') {
        const closeTag = xml.indexOf('>', cursor);
        if (closeTag === -1) break;
        cursor = closeTag + 1;
        continue;
      }
      // Só consumimos dentro de conteúdo de texto: achar o próximo '<' limite
      const nextTag = xml.indexOf('<', cursor);
      const textEnd = nextTag === -1 ? xml.length : nextTag;
      // Consumir espaços do começo desse trecho
      let consumedHere = 0;
      while (
        cursor + consumedHere < textEnd &&
        toConsume > 0 &&
        (xml[cursor + consumedHere] === ' ' ||
          xml[cursor + consumedHere] === '\u00A0')
      ) {
        consumedHere++;
        toConsume--;
      }
      if (consumedHere > 0) {
        xml = xml.slice(0, cursor) + xml.slice(cursor + consumedHere);
        // cursor permanece; loop continua
        continue;
      }
      // Primeiro caractere não-espaço: paramos de consumir
      break;
    }
  }

  return xml;
}

export async function gerarComunicadoExtravio(
  cliente: Cliente,
  veiculo: Veiculo,
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
    municipio: cliente.municipio ?? 'Itabira',
    cep: cliente.cep ?? '',
    marca_modelo: veiculo.marcaModelo ?? '',
    placa: veiculo.placa ?? '',
    local_data: `Itabira, ${formatarDataExtenso()}`,
  };

  doc.render(data);
  const blob = doc.getZip().generate({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  abrirBlobEmNovaAba(
    blob,
    `Comunicado_Extravio_${veiculo.placa ?? 'veiculo'}.docx`,
  );
}

export async function gerarRequerimento2Via(
  cliente: Cliente,
  veiculo: Veiculo,
): Promise<void> {
  const resp = await fetch('/REQUERIMENTO.docx');
  if (!resp.ok) {
    throw new Error('Template REQUERIMENTO.docx não encontrado em /public');
  }
  const arrayBuffer = await resp.arrayBuffer();
  const zip = new PizZip(arrayBuffer);

  // Marcadores sentinela improváveis de aparecer em texto natural.
  const MARK_IN = '\u2063TAGIN\u2063';
  const MARK_OUT = '\u2063TAGOUT\u2063';

  const wrap = (v: string) => `${MARK_IN}${v}${MARK_OUT}`;

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });

  // Observação: o template tem um typo "{numere}" para o número do endereço.
  doc.render({
    nome: wrap(cliente.nome ?? ''),
    endereco: wrap(cliente.endereco ?? ''),
    numero: wrap(cliente.numero ?? ''),
    numere: wrap(cliente.numero ?? ''),
    bairro: wrap(cliente.bairro ?? ''),
    marca_modelo: wrap(veiculo.marcaModelo ?? ''),
    placa: wrap(veiculo.placa ?? ''),
    chassi: wrap(veiculo.chassi ?? ''),
    cor: wrap(veiculo.cor ?? ''),
  });

  // Pós-processamento: remove marcadores e consome espaços equivalentes ao
  // comprimento de cada valor preenchido.
  const outZip = doc.getZip();
  const docFile = outZip.file('word/document.xml');
  if (!docFile) throw new Error('document.xml não encontrado no docx');
  let xml = docFile.asText();

  xml = consumirEspacosPosValor(xml, MARK_IN, MARK_OUT);

  // Substitui "Itabira de de " pela data por extenso (o template original
  // não tinha placeholder de data nesse parágrafo).
  xml = xml.replace(
    /Itabira de de/g,
    `Itabira, ${formatarDataExtenso()}`,
  );

  outZip.file('word/document.xml', xml);

  const blob = outZip.generate({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  abrirBlobEmNovaAba(
    blob,
    `Requerimento_2Via_CRV_${veiculo.placa ?? 'veiculo'}.docx`,
  );
}

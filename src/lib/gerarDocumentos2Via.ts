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

function baixarBlob(blob: Blob, nomeSugerido: string) {
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
 * Renderiza um .docx (Blob) num container HTML oculto via docx-preview e
 * captura cada página renderizada em um PDF (A4 retrato). As libs são
 * carregadas via dynamic import para não pesar no bundle inicial.
 */
async function docxBlobParaPdf(
  docxBlob: Blob,
  nomePdf: string,
): Promise<void> {
  const [{ renderAsync }, html2canvasMod, { jsPDF }] = await Promise.all([
    import('docx-preview'),
    import('html2canvas'),
    import('jspdf'),
  ]);
  const html2canvas = (html2canvasMod as any).default || html2canvasMod;

  // Container fora da tela — largura fixa (~A4 a 96dpi) para renderização estável.
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '794px'; // 210mm @ 96dpi
  container.style.background = '#fff';
  document.body.appendChild(container);

  try {
    await renderAsync(docxBlob, container, undefined, {
      className: 'docx-pdf',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
    });

    // docx-preview cria um wrapper com uma ou mais "sections" representando páginas.
    const wrapper = container.querySelector('.docx-wrapper') as HTMLElement | null;
    const sections = wrapper
      ? (Array.from(wrapper.children) as HTMLElement[])
      : [container];

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < sections.length; i++) {
      const canvas = await html2canvas(sections[i], {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      if (i > 0) pdf.addPage();

      if (imgH <= pageH) {
        pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
      } else {
        // Conteúdo excede altura A4 — fatiar em múltiplas páginas.
        let remaining = imgH;
        let offset = 0;
        while (remaining > 0) {
          pdf.addImage(imgData, 'JPEG', 0, -offset, imgW, imgH);
          remaining -= pageH;
          offset += pageH;
          if (remaining > 0) pdf.addPage();
        }
      }
    }

    pdf.save(nomePdf);
  } finally {
    document.body.removeChild(container);
  }
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
    hits.push({ start: m.index, end: m.index + m[0].length, value: m[1] ?? '' });
  }

  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (!h) continue;
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

  await docxBlobParaPdf(
    blob,
    `Comunicado_Extravio_${veiculo.placa ?? 'veiculo'}.pdf`,
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

  await docxBlobParaPdf(
    blob,
    `Requerimento_2Via_CRV_${veiculo.placa ?? 'veiculo'}.pdf`,
  );
}

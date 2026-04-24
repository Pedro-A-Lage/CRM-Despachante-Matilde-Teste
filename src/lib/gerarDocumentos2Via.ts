import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
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
  const dataStr = formatarDataExtenso();
  const marcaModelo = veiculo.marcaModelo ?? '';

  const p = (
    text: string,
    opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
  ) =>
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
            `Residente, ${cliente.endereco ?? ''}, nº ${cliente.numero ?? ''}, Bairro ${cliente.bairro ?? ''},`,
          ),
          p(`Proprietário do veículo ${marcaModelo} de placa ${veiculo.placa ?? ''},`),
          p(`Chassi: ${veiculo.chassi ?? ''},`),
          p(
            `Cor ${veiculo.cor ?? ''}, vem muito respeitosamente requerer autorização para que`,
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
  abrirBlobEmNovaAba(
    blob,
    `Requerimento_2Via_CRV_${veiculo.placa ?? 'veiculo'}.docx`,
  );
}

/**
 * Gera um requerimento genérico pra ser apresentado na delegacia,
 * com o MOTIVO digitado pelo usuário (em vez do texto fixo de 2ª via).
 *
 * Usado na tab Delegacia → Nova Entrada tipo "Req." — o usuário escreve
 * o que está requerendo (ex.: "autorização para retirada do veículo
 * retido", "liberação após SIFAP", etc).
 */
export async function gerarRequerimentoDelegacia(
  cliente: Cliente,
  veiculo: Veiculo,
  motivo: string,
): Promise<void> {
  const dataStr = formatarDataExtenso();
  const marcaModelo = veiculo.marcaModelo ?? '';

  const p = (
    text: string,
    opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
  ) =>
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
            `Residente, ${cliente.endereco ?? ''}, nº ${cliente.numero ?? ''}, Bairro ${cliente.bairro ?? ''},`,
          ),
          p(`Proprietário do veículo ${marcaModelo} de placa ${veiculo.placa ?? ''},`),
          p(`Chassi: ${veiculo.chassi ?? ''},`),
          p(
            `Cor ${veiculo.cor ?? ''}, vem muito respeitosamente requerer que`,
          ),
          p(motivo, { bold: true }),
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
  abrirBlobEmNovaAba(
    blob,
    `Requerimento_${veiculo.placa ?? 'veiculo'}.docx`,
  );
}

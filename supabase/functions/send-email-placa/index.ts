import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { getAccessToken, GRAPH_BASE } from '../_shared/outlook.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { pdfUrl, destinatarioEmail, veiculoPlaca, veiculoChassi, osNumero, mensagemCustomizada } = await req.json();

    if (!pdfUrl) throw new Error('URL do PDF não fornecida');
    if (!destinatarioEmail) throw new Error('E-mail destinatário não fornecido');

    // 1. Baixar o PDF
    console.log(`Baixando PDF de: ${pdfUrl}`);
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) throw new Error(`Status falha ao baixar: ${pdfResponse.status}`);
    const pdfArrayBuffer = await pdfResponse.arrayBuffer();
    const pdfBytes = new Uint8Array(pdfArrayBuffer);

    // 2. Pegar Access Token do Microsoft Graph
    console.log('Gerando novo Access Token do Microsoft Graph...');
    const accessToken = await getAccessToken();

    // 3. Montar payload JSON do Graph (sendMail)
    const subject = `Solicitacao de Boleto de Placa - OS #${osNumero} - Placa: ${veiculoPlaca || 'Sem Placa'}`;
    const textBody = mensagemCustomizada || `Ola,\n\nSegue em anexo a folha do DETRAN para solicitacao do boleto da placa do veiculo:\n\nPlaca: ${veiculoPlaca || '—'}\nChassi: ${veiculoChassi || '—'}\nOS: ${osNumero}\n\nPor favor, me envie o boleto para pagamento.\n\nAtenciosamente,\nDespachante Matilde`;
    const fileName = `Folha_Detran_${veiculoPlaca || osNumero}.pdf`;

    const message = {
      message: {
        subject,
        body: { contentType: 'Text', content: textBody },
        toRecipients: [{ emailAddress: { address: destinatarioEmail } }],
        attachments: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: fileName,
            contentType: 'application/pdf',
            contentBytes: encodeBase64(pdfBytes),
          },
        ],
      },
      saveToSentItems: true,
    };

    console.log(`Disparando envio via Microsoft Graph para ${destinatarioEmail}...`);
    const sendResponse = await fetch(`${GRAPH_BASE}/me/sendMail`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    // sendMail responde 202 Accepted com body vazio em sucesso
    if (!sendResponse.ok) {
      const errText = await sendResponse.text();
      throw new Error(`Erro na API do Graph: ${errText}`);
    }

    console.log('E-mail enviado via Outlook!');

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Erro na função:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

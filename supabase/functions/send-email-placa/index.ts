import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { encodeBase64Url } from "https://deno.land/std@0.224.0/encoding/base64url.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("Credenciais do Gmail (OAuth2) não configuradas no Supabase Secrets.");
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}&grant_type=refresh_token`,
  });

  const data = await response.json();
  if (!response.ok) {
      throw new Error(`Falha ao renovar token OAuth: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

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

    // 2. Pegar Access Token do Google Auth
    console.log("Gerando novo Access Token do Gmail API...");
    const accessToken = await getAccessToken();

    // 3. Construir o E-mail MIME Multipar
    const boundary = `----=_NextPart_${Date.now()}`;
    const subject = `Solicitacao de Boleto de Placa - OS #${osNumero} - Placa: ${veiculoPlaca || 'Sem Placa'}`;
    const textBody = mensagemCustomizada || `Ola,\n\nSegue em anexo a folha do DETRAN para solicitacao do boleto da placa do veiculo:\n\nPlaca: ${veiculoPlaca || '—'}\nChassi: ${veiculoChassi || '—'}\nOS: ${osNumero}\n\nPor favor, me envie o boleto para pagamento.\n\nAtenciosamente,\nDespachante Matilde`;
    const fileName = `Folha_Detran_${veiculoPlaca || osNumero}.pdf`;

    const emailLines = [
      `To: ${destinatarioEmail}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      textBody,
      ``,
      `--${boundary}`,
      `Content-Type: application/pdf; name="${fileName}"`,
      `Content-Disposition: attachment; filename="${fileName}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      encodeBase64(pdfBytes), // Codifica o pdf
      ``,
      `--${boundary}--`
    ];

    const rawEmail = emailLines.join('\r\n');
    
    // O endpoint message/send do Gmail exige Base64UrlSafe do Raw Email
    const encoder = new TextEncoder();
    const encodedRawEmail = encodeBase64Url(encoder.encode(rawEmail));

    // 4. Enviar para a API do Gmail
    console.log(`Disparando envio via Gmail API para ${destinatarioEmail}...`);
    const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            raw: encodedRawEmail
        })
    });

    const sendResult = await sendResponse.json();
    
    if (!sendResponse.ok) {
        throw new Error(`Erro na API do Gmail: ${JSON.stringify(sendResult)}`);
    }

    console.log(`E-mail enviado! MessageId: ${sendResult.id}`);

    return new Response(
      JSON.stringify({ success: true, messageId: sendResult.id }), 
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

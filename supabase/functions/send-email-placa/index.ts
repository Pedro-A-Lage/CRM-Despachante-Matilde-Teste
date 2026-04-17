import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Obtém access token do Microsoft Identity Platform via refresh token (delegated flow).
 *
 * Secrets necessários no Supabase:
 *   MS_CLIENT_ID       — Application (client) ID do app registrado no Entra ID
 *   MS_TENANT_ID       — Tenant ID (ou "common" para multi-tenant)
 *   MS_REFRESH_TOKEN   — Refresh token obtido no fluxo de autorização inicial
 *
 * Scopes recomendados: offline_access Mail.Send
 */
async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('MS_CLIENT_ID');
  const tenantId = Deno.env.get('MS_TENANT_ID') || 'common';
  const refreshToken = Deno.env.get('MS_REFRESH_TOKEN');

  if (!clientId || !refreshToken) {
    throw new Error('Credenciais Outlook (MS_CLIENT_ID, MS_REFRESH_TOKEN) não configuradas no Supabase Secrets.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'offline_access Mail.Send',
  });

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Falha ao renovar token Microsoft: ${JSON.stringify(data)}`);
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

    // Aceita string única OU lista separada por vírgula/ponto-e-vírgula
    const listaEmails: string[] = destinatarioEmail.split(/[,;]/).map((e: string) => e.trim()).filter(Boolean);
    if (listaEmails.length === 0) throw new Error('Nenhum e-mail destinatário válido fornecido');

    // 1. Baixar o PDF
    console.log(`Baixando PDF de: ${pdfUrl}`);
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) throw new Error(`Status falha ao baixar: ${pdfResponse.status}`);
    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
    const pdfBase64 = encodeBase64(pdfBytes);

    // 2. Token Microsoft
    console.log('Gerando Access Token Microsoft Graph...');
    const accessToken = await getAccessToken();

    // 3. Montar conteúdo do e-mail
    const subject = `Solicitacao de Boleto de Placa - OS #${osNumero} - Placa: ${veiculoPlaca || 'Sem Placa'}`;
    const textBody = mensagemCustomizada || `Ola,\n\nSegue em anexo a folha do DETRAN para solicitacao do boleto da placa do veiculo:\n\nPlaca: ${veiculoPlaca || '—'}\nChassi: ${veiculoChassi || '—'}\nOS: ${osNumero}\n\nPor favor, me envie o boleto para pagamento.\n\nAtenciosamente,\nDespachante Matilde`;
    const fileName = `Folha_Detran_${veiculoPlaca || osNumero}.pdf`;

    // 4. Criar rascunho via Microsoft Graph
    const draftPayload = {
      subject,
      body: {
        contentType: 'Text',
        content: textBody,
      },
      toRecipients: listaEmails.map((email) => ({
        emailAddress: { address: email },
      })),
      attachments: [
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: fileName,
          contentType: 'application/pdf',
          contentBytes: pdfBase64,
        },
      ],
    };

    console.log(`Criando rascunho para ${listaEmails.join(', ')}...`);
    const draftResponse = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draftPayload),
    });

    if (!draftResponse.ok) {
      const errText = await draftResponse.text();
      throw new Error(`Erro ao criar rascunho (${draftResponse.status}): ${errText}`);
    }

    const draft = await draftResponse.json();
    const messageId = draft.id;
    const webLink = draft.webLink;

    // 5. Enviar o rascunho
    console.log(`Enviando rascunho ${messageId}...`);
    const sendResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/send`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!sendResponse.ok) {
      const errText = await sendResponse.text();
      throw new Error(`Erro ao enviar (${sendResponse.status}): ${errText}`);
    }

    console.log(`E-mail enviado via Outlook! webLink: ${webLink}`);
    return new Response(
      JSON.stringify({
        success: true,
        messageId,
        webLink,
        destinatarios: listaEmails.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Erro na função:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Anexo {
  url: string;
  nome: string;
}

/**
 * Obtém access token do Microsoft Identity Platform via refresh token (delegated flow).
 *
 * Secrets necessários no Supabase:
 *   MS_CLIENT_ID       — Application (client) ID do app registrado no Entra ID
 *   MS_CLIENT_SECRET   — Secret do app
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

  // Cliente público — NÃO envia client_secret
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

function mimeTypeFromName(nome: string): string {
  const lower = nome.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { destinatarioEmail, destinatarioEmails, assunto, corpo, anexos } = await req.json() as {
      destinatarioEmail?: string;
      destinatarioEmails?: string[];
      assunto: string;
      corpo: string;
      anexos: Anexo[];
    };

    // Aceita string única OU array de emails
    const listaEmails: string[] = (destinatarioEmails && destinatarioEmails.length > 0)
      ? destinatarioEmails
      : (destinatarioEmail ? destinatarioEmail.split(/[,;]/).map(e => e.trim()).filter(Boolean) : []);

    if (listaEmails.length === 0) throw new Error('Nenhum e-mail destinatário fornecido');
    if (!assunto) throw new Error('Assunto não fornecido');

    // 1. Baixar todos os anexos
    const anexosBaixados: { nome: string; mimeType: string; base64: string }[] = [];
    for (const anexo of (anexos || [])) {
      console.log(`Baixando anexo: ${anexo.nome}`);
      const r = await fetch(anexo.url);
      if (!r.ok) {
        console.warn(`Falha ao baixar ${anexo.nome}: HTTP ${r.status}`);
        continue;
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      anexosBaixados.push({
        nome: anexo.nome,
        mimeType: mimeTypeFromName(anexo.nome),
        base64: encodeBase64(buf),
      });
    }

    // 2. Token Microsoft
    console.log('Gerando Access Token Microsoft Graph...');
    const accessToken = await getAccessToken();

    // 3. Envia via Microsoft Graph — endpoint /me/sendMail (só precisa de Mail.Send)
    //    https://learn.microsoft.com/en-us/graph/api/user-sendmail
    const sendMailPayload = {
      message: {
        subject: assunto,
        body: {
          contentType: 'Text',
          content: corpo,
        },
        toRecipients: listaEmails.map((email) => ({
          emailAddress: { address: email },
        })),
        attachments: anexosBaixados.map((a) => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: a.nome,
          contentType: a.mimeType,
          contentBytes: a.base64,
        })),
      },
      saveToSentItems: true,
    };

    console.log(`Enviando e-mail para ${listaEmails.join(', ')} com ${anexosBaixados.length} anexo(s) via /me/sendMail...`);
    const sendResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sendMailPayload),
    });

    if (!sendResponse.ok) {
      const errText = await sendResponse.text();
      throw new Error(`Erro ao enviar (${sendResponse.status}): ${errText}`);
    }

    console.log(`Email enviado via Outlook!`);
    return new Response(
      JSON.stringify({
        success: true,
        anexos: anexosBaixados.length,
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

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('MS_CLIENT_ID');
  const tenantId = Deno.env.get('MS_TENANT_ID') || 'common';
  const refreshToken = Deno.env.get('MS_REFRESH_TOKEN');

  if (!clientId || !refreshToken) {
    throw new Error('Credenciais Outlook (MS_CLIENT_ID, MS_REFRESH_TOKEN) não configuradas.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    // Mantém só Mail.Read: refresh tokens antigos foram emitidos sem
    // Mail.ReadWrite. Pra reativar mark-as-read, regere o token via
    // scripts/get-outlook-refresh-token.mjs (que hoje pede ReadWrite) e
    // amplie este scope de volta.
    scope: 'offline_access Mail.Send Mail.Read',
  });

  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Falha ao renovar token Microsoft: ${JSON.stringify(data)}`);
  return data.access_token;
}

// Converte HTML básico para texto legível preservando parágrafos/linhas.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { id } = await req.json() as { id: string };
    if (!id) throw new Error('Parâmetro "id" obrigatório.');

    const token = await getAccessToken();

    const url = `https://graph.microsoft.com/v1.0/me/messages/${id}?$select=id,subject,from,toRecipients,receivedDateTime,sentDateTime,body,hasAttachments&$expand=attachments($select=id,name,contentType,size,isInline)`;
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`Erro ao obter mensagem: ${JSON.stringify(data)}`);

    const fromAddr = data.from?.emailAddress;
    const fromStr = fromAddr
      ? (fromAddr.name ? `${fromAddr.name} <${fromAddr.address}>` : fromAddr.address)
      : 'Desconhecido';

    const bodyContent: string = data.body?.content || '';
    const bodyType: string = data.body?.contentType || 'text';
    const bodyText = bodyType.toLowerCase() === 'html' ? htmlToText(bodyContent) : bodyContent;

    const attachments = (data.attachments || [])
      .filter((a: any) => !a.isInline)
      .map((a: any) => ({
        filename: a.name,
        mimeType: a.contentType,
        partId: a.id,
        attachmentId: a.id,
        size: a.size || 0,
      }));

    // Mark-as-read removido temporariamente — precisa de Mail.ReadWrite, que o
    // refresh token atual não possui. Pra reativar, regere o token.

    return new Response(
      JSON.stringify({
        id: data.id,
        subject: data.subject || '(sem assunto)',
        from: fromStr,
        date: data.receivedDateTime || data.sentDateTime || '',
        body: bodyText,
        attachments,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Erro em get-outlook-email-details:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

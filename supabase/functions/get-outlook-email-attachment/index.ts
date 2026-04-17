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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { messageId, attachmentId } = await req.json() as { messageId: string; attachmentId: string };
    if (!messageId || !attachmentId) throw new Error('messageId e attachmentId são obrigatórios.');

    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments/${attachmentId}`;
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const att = await resp.json();
    if (!resp.ok) throw new Error(`Erro ao obter anexo: ${JSON.stringify(att)}`);

    // Graph retorna contentBytes em Base64 padrão (não URL-safe).
    // O frontend aplica replace(-→+, _→/), então ambos formatos funcionam.
    const contentBytes: string = att.contentBytes || '';

    return new Response(
      JSON.stringify({
        data: contentBytes,
        filename: att.name,
        mimeType: att.contentType,
        size: att.size,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Erro em get-outlook-email-attachment:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

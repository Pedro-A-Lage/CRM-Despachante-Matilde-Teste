import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { getAccessToken, GRAPH_BASE } from '../_shared/outlook.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Remove tags HTML simples para devolver texto plano legível
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { id } = await req.json();
    if (!id) throw new Error('ID da mensagem não fornecido');

    const accessToken = await getAccessToken();

    // Pega a mensagem completa
    const msgResponse = await fetch(`${GRAPH_BASE}/me/messages/${id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const msgData = await msgResponse.json();
    if (!msgResponse.ok) throw new Error(`Graph API Erro: ${JSON.stringify(msgData)}`);

    // Pega lista de anexos (apenas metadados, sem baixar contentBytes)
    const attResponse = await fetch(
      `${GRAPH_BASE}/me/messages/${id}/attachments?$select=id,name,contentType,size`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const attData = await attResponse.json();
    const attachments = (attData.value || []).map((a: any) => ({
      filename: a.name,
      mimeType: a.contentType,
      attachmentId: a.id,
      size: a.size,
    }));

    const subject = msgData.subject || 'Sem assunto';
    const from = msgData.from?.emailAddress
      ? `${msgData.from.emailAddress.name || ''} <${msgData.from.emailAddress.address}>`.trim()
      : 'Desconhecido';
    const date = msgData.receivedDateTime || '';

    let bodyText = '';
    if (msgData.body?.content) {
      bodyText = msgData.body.contentType === 'html'
        ? stripHtml(msgData.body.content)
        : msgData.body.content;
    } else {
      bodyText = msgData.bodyPreview || 'Nenhum texto encontrado.';
    }

    return new Response(
      JSON.stringify({
        id: msgData.id,
        threadId: msgData.conversationId,
        subject,
        from,
        date,
        body: bodyText,
        attachments,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Erro na função get-email-details:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

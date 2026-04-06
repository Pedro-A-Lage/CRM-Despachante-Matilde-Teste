import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { getAccessToken, GRAPH_BASE, STAMPER_CATEGORY } from '../_shared/outlook.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const accessToken = await getAccessToken();

    // Lista mensagens com a categoria da estampadora — equivalente ao antigo label do Gmail
    const filter = encodeURIComponent(`categories/any(c:c eq '${STAMPER_CATEGORY}')`);
    const select = encodeURIComponent('id,conversationId,subject,from,receivedDateTime,bodyPreview');
    const url = `${GRAPH_BASE}/me/messages?$filter=${filter}&$top=15&$orderby=receivedDateTime desc&$select=${select}`;

    const listResponse = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    const listData = await listResponse.json();
    if (!listResponse.ok) {
      throw new Error(`Erro ao listar e-mails: ${JSON.stringify(listData)}`);
    }

    const emails = (listData.value || []).map((m: any) => ({
      id: m.id,
      threadId: m.conversationId,
      snippet: m.bodyPreview || '',
      subject: m.subject || 'Sem assunto',
      from: m.from?.emailAddress
        ? `${m.from.emailAddress.name || ''} <${m.from.emailAddress.address}>`.trim()
        : 'Desconhecido',
      date: m.receivedDateTime || '',
    }));

    return new Response(
      JSON.stringify({ success: true, emails }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Erro na função get-emails:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

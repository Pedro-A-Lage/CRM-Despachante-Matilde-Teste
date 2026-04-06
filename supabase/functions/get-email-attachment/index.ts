import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
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
    const { messageId, attachmentId } = await req.json();
    if (!messageId || !attachmentId) {
      throw new Error('messageId e attachmentId são obrigatórios');
    }

    const accessToken = await getAccessToken();

    const url = `${GRAPH_BASE}/me/messages/${messageId}/attachments/${attachmentId}`;
    console.log('Baixando anexo:', url);

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Graph API Anexo Erro: ${JSON.stringify(data)}`);
    }

    // O Graph devolve contentBytes em base64 padrão. O frontend espera "data" como string base64.
    // Mantemos o nome do campo "data" para compatibilidade com o resto do CRM.
    return new Response(
      JSON.stringify({
        success: true,
        size: data.size,
        data: data.contentBytes,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Erro get-email-attachment:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

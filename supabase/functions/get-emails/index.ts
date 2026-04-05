import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

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
    const accessToken = await getAccessToken();

    // Buscar as últimas 15 mensagens no marcador específico
    const listResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=label:trabalho-estampadora-de-placa', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const listData = await listResponse.json();
    
    if (!listResponse.ok) {
        throw new Error(`Erro ao listar e-mails: ${JSON.stringify(listData)}`);
    }

    const messages = listData.messages || [];
    const emails = [];

    // Buscar os detalhes de cada mensagem
    // Fazemos em paralelo usando Promise.all para ser mais rápido
    const fetchPromises = messages.map(async (msg: any) => {
        const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const msgData = await msgResponse.json();
        
        const headers = msgData.payload?.headers || [];
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'Sem assunto';
        const from = headers.find((h: any) => h.name === 'From')?.value || 'Desconhecido';
        const date = headers.find((h: any) => h.name === 'Date')?.value || '';

        return {
            id: msg.id,
            threadId: msg.threadId,
            snippet: msgData.snippet || '',
            subject,
            from,
            date
        };
    });

    const detailedEmails = await Promise.all(fetchPromises);

    return new Response(
      JSON.stringify({ success: true, emails: detailedEmails }), 
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

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
      throw new Error("Credenciais do Gmail (OAuth2) não configuradas.");
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}&grant_type=refresh_token`,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`Falha OAuth: ${JSON.stringify(data)}`);
  return data.access_token;
}

// Extrai o texto limpo do corpo (decodificando Base64Url)
function getMessageBody(payload: any): string {
    let bodyData = '';
    
    // As vezes o corpo vem direto no payload, as vezes em parts
    if (payload.body && payload.body.data) {
        bodyData = payload.body.data;
    } else if (payload.parts) {
        // Tenta achar text/plain
        const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
        if (textPart && textPart.body && textPart.body.data) {
            bodyData = textPart.body.data;
        } else {
            // Tenta text/html se não tiver text/plain
            const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
            if (htmlPart && htmlPart.body && htmlPart.body.data) {
                bodyData = htmlPart.body.data;
            } else {
                // Se o email é multipart/mixed, o texto pode estar dentro de subparts
                const metaPart = payload.parts.find((p: any) => p.mimeType?.startsWith('multipart/'));
                if (metaPart && metaPart.parts) {
                   return getMessageBody(metaPart);
                }
            }
        }
    }

    if (!bodyData) return 'Nenhum texto encontrado.';

    // O Gmail envia em Base64URLEncoded (usa '-' ao invés de '+' e '_' ao invés de '/')
    const base64 = bodyData.replace(/-/g, '+').replace(/_/g, '/');
    try {
        // atob precisa de limpeza e decodeURIComponent para utf-8 chars (acentos)
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
    } catch(e) {
        return "Erro ao decodificar a mensagem.";
    }
}

// Extrai informações dos anexos do nível principal ou sub-níveis (multipart)
function getAttachments(payload: any): any[] {
    let attachments: any[] = [];
    if (!payload.parts) return attachments;

    for (const part of payload.parts) {
        if (part.filename && part.filename.length > 0 && part.body && part.body.attachmentId) {
            attachments.push({
                filename: part.filename,
                mimeType: part.mimeType,
                partId: part.partId,
                attachmentId: part.body.attachmentId,
                size: part.body.size
            });
        }
        
        // Cava mais fundo caso o anexo esteja encapsulado noutra subparte
        if (part.parts) {
            attachments = attachments.concat(getAttachments(part));
        }
    }
    return attachments;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { id } = await req.json();
    if (!id) throw new Error('ID da mensagem não fornecido');

    const accessToken = await getAccessToken();

    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const msgData = await response.json();
    if (!response.ok) throw new Error(`Gmail API Erro: ${JSON.stringify(msgData)}`);

    const headers = msgData.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'Sem assunto';
    const from = headers.find((h: any) => h.name === 'From')?.value || 'Desconhecido';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    const bodyText = getMessageBody(msgData.payload);
    const attachments = getAttachments(msgData.payload);

    return new Response(
      JSON.stringify({ 
         id: msgData.id,
         threadId: msgData.threadId,
         subject,
         from,
         date,
         body: bodyText,
         attachments
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

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { encodeBase64Url } from "https://deno.land/std@0.224.0/encoding/base64url.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Anexo {
  url: string;
  nome: string;
}

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
    const { destinatarioEmail, assunto, corpo, anexos } = await req.json() as {
      destinatarioEmail: string;
      assunto: string;
      corpo: string;
      anexos: Anexo[];
    };

    if (!destinatarioEmail) throw new Error('E-mail destinatário não fornecido');
    if (!assunto) throw new Error('Assunto não fornecido');

    // 1. Baixar todos os anexos
    const anexosBaixados: { nome: string; mimeType: string; bytes: Uint8Array }[] = [];
    for (const anexo of (anexos || [])) {
      console.log(`Baixando anexo: ${anexo.nome} de ${anexo.url}`);
      const r = await fetch(anexo.url);
      if (!r.ok) {
        console.warn(`Falha ao baixar ${anexo.nome}: HTTP ${r.status}`);
        continue;
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      anexosBaixados.push({
        nome: anexo.nome,
        mimeType: mimeTypeFromName(anexo.nome),
        bytes: buf,
      });
    }

    // 2. Token Gmail
    console.log('Gerando Access Token Gmail...');
    const accessToken = await getAccessToken();

    // 3. Construir MIME multipart
    const boundary = `----=_Matilde_${Date.now()}`;
    const linhas: string[] = [
      `To: ${destinatarioEmail}`,
      `Subject: =?utf-8?B?${encodeBase64(new TextEncoder().encode(assunto))}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      corpo,
      ``,
    ];

    for (const a of anexosBaixados) {
      linhas.push(
        `--${boundary}`,
        `Content-Type: ${a.mimeType}; name="${a.nome}"`,
        `Content-Disposition: attachment; filename="${a.nome}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        encodeBase64(a.bytes),
        ``,
      );
    }
    linhas.push(`--${boundary}--`);

    const rawEmail = linhas.join('\r\n');
    const encodedRawEmail = encodeBase64Url(new TextEncoder().encode(rawEmail));

    // 4. Enviar via Gmail API
    console.log(`Enviando email para ${destinatarioEmail} com ${anexosBaixados.length} anexo(s)...`);
    const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encodedRawEmail }),
    });

    const sendResult = await sendResponse.json();
    if (!sendResponse.ok) {
      throw new Error(`Erro Gmail API: ${JSON.stringify(sendResult)}`);
    }

    console.log(`Email enviado! MessageId: ${sendResult.id}`);
    return new Response(
      JSON.stringify({ success: true, messageId: sendResult.id, anexos: anexosBaixados.length }),
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

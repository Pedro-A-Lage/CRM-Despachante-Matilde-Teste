import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

// Proxy server-side para a API do Google Gemini.
// Esconde GEMINI_API_KEY do bundle do navegador (SEC-9).
//
// Secret obrigatório no Supabase:
//   GEMINI_API_KEY — chave da API Gemini obtida em ai.google.dev

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeminiRequest {
  dataBase64: string;
  mimeType: string;
  prompt: string;
  modelName?: string;
  maxOutputTokens?: number;
  responseMimeType?: string;
  maxRetries?: number;
}

async function callGemini(params: GeminiRequest, apiKey: string): Promise<string> {
  const modelName = params.modelName || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [
          { inline_data: { data: params.dataBase64, mime_type: params.mimeType } },
          { text: params.prompt },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: params.maxOutputTokens ?? 4096,
      responseMimeType: params.responseMimeType ?? 'application/json',
    },
  };

  const maxRetries = Math.min(Math.max(params.maxRetries ?? 3, 1), 5);
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (resp.ok) {
      const data = await resp.json();
      // Gemini retorna candidates[0].content.parts[0].text
      const text: string | undefined = data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .filter(Boolean)
        .join('');
      if (!text) throw new Error(`Gemini retornou resposta vazia: ${JSON.stringify(data).slice(0, 300)}`);
      return text;
    }

    const errText = await resp.text();
    lastErr = new Error(`Gemini ${resp.status}: ${errText}`);

    // Retry em 429 (rate limit) / 503 (overloaded)
    if ((resp.status === 429 || resp.status === 503) && attempt < maxRetries) {
      const retryMatch = errText.match(/retry in (\d+)/i);
      const delaySec = retryMatch ? Math.min(parseInt(retryMatch[1]!, 10) + 2, 60) : 20;
      console.log(`[gemini-proxy] ${resp.status}, tentativa ${attempt}/${maxRetries}, aguardando ${delaySec}s...`);
      await new Promise((r) => setTimeout(r, delaySec * 1000));
      continue;
    }

    throw lastErr;
  }

  throw lastErr ?? new Error('Gemini: máximo de tentativas excedido');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no Supabase Secrets.');

    const body = (await req.json()) as GeminiRequest;
    if (!body.dataBase64 || !body.mimeType || !body.prompt) {
      throw new Error('Campos obrigatórios: dataBase64, mimeType, prompt.');
    }

    const text = await callGemini(body, apiKey);

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Erro em gemini-proxy:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

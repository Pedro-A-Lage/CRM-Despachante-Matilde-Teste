// ============================================
// Cliente Gemini — via edge function gemini-proxy
// A chave GEMINI_API_KEY nunca vai para o bundle do navegador (SEC-9).
// ============================================
import { supabase } from './supabaseClient';

export interface GeminiCallOptions {
    modelName?: string;
    maxOutputTokens?: number;
    responseMimeType?: string;
    maxRetries?: number;
}

/**
 * Chama Gemini via edge function. Retorna o texto bruto da resposta.
 * O proxy server-side lida com retries em 429/503.
 */
export async function callGemini(
    dataBase64: string,
    mimeType: string,
    prompt: string,
    opts: GeminiCallOptions = {},
): Promise<string> {
    const { data, error } = await supabase.functions.invoke('gemini-proxy', {
        body: {
            dataBase64,
            mimeType,
            prompt,
            modelName: opts.modelName,
            maxOutputTokens: opts.maxOutputTokens,
            responseMimeType: opts.responseMimeType,
            maxRetries: opts.maxRetries,
        },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (typeof data?.text !== 'string') {
        throw new Error('Resposta inválida do gemini-proxy: campo "text" ausente.');
    }
    return data.text;
}

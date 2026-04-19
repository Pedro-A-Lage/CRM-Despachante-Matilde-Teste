import { supabase } from './supabaseClient';

/**
 * Função utilitária para fazer upload de um arquivo para o Supabase Storage.
 *
 * @param file O arquivo a ser enviado (obtido via input type="file" ou blob).
 * @param path O caminho/nome do arquivo dentro do bucket (ex: "cliente_123/documento.pdf").
 * @param bucketName O nome do bucket no Supabase. O padrão é "documentos".
 * @returns Retorna a URL pública do arquivo caso tenha sucesso.
 */
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB

// Magic bytes dos tipos de arquivo que o CRM aceita.
// file.type vem do browser e é trivialmente falsificável; a assinatura binária
// não é. Rejeitamos qualquer arquivo cujo conteúdo não bata com um dos tipos
// permitidos — previne, por exemplo, um HTML/SVG disfarçado de PDF que
// executaria script no viewer.
const ALLOWED_SIGNATURES: Array<{ mime: string; bytes: number[] }> = [
    { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },              // %PDF
    { mime: 'image/png',       bytes: [0x89, 0x50, 0x4E, 0x47] },              // ‰PNG
    { mime: 'image/jpeg',      bytes: [0xFF, 0xD8, 0xFF] },
    { mime: 'image/gif',       bytes: [0x47, 0x49, 0x46, 0x38] },              // GIF8
    { mime: 'image/webp',      bytes: [0x52, 0x49, 0x46, 0x46] },              // RIFF (checa WEBP adiante se preciso)
];

async function verificarMagicBytes(file: File | Blob): Promise<string> {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    for (const sig of ALLOWED_SIGNATURES) {
        const ok = sig.bytes.every((b, i) => head[i] === b);
        if (ok) return sig.mime;
    }
    throw new Error('Tipo de arquivo não permitido. Envie PDF, PNG, JPEG, GIF ou WEBP.');
}

export async function uploadFileToSupabase(file: File | Blob, path: string, bucketName: string = 'documentos'): Promise<string> {
    // Validar tamanho do arquivo
    if (file.size > MAX_UPLOAD_SIZE) {
        throw new Error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo permitido: ${MAX_UPLOAD_SIZE / 1024 / 1024}MB.`);
    }
    await verificarMagicBytes(file);
    try {

        const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(path, file, {
                cacheControl: '3600',
                upsert: true // Sobrescreve se já existir um arquivo com mesmo nome no mesmo path
            });

        if (error) {
            console.error('[Supabase Storage] Erro detalhado no upload:', error);
            throw error;
        }

        console.log('[Supabase Storage] Upload concluído:', data);

        // Obtém a URL pública do arquivo recém-enviado
        const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(path);

        return publicUrlData.publicUrl;

    } catch (e) {
        console.error('[Supabase Storage] Falhou a tentativa de upload:', e);
        throw e;
    }
}

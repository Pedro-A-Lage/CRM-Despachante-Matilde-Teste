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

export async function uploadFileToSupabase(file: File | Blob, path: string, bucketName: string = 'documentos'): Promise<string> {
    // Validar tamanho do arquivo
    if (file.size > MAX_UPLOAD_SIZE) {
        throw new Error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo permitido: ${MAX_UPLOAD_SIZE / 1024 / 1024}MB.`);
    }
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

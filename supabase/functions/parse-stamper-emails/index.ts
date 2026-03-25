import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken(): Promise<string> {
    const clientId = Deno.env.get('GMAIL_CLIENT_ID');
    const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error("Credenciais do Gmail (OAuth2) não configuradas no ambiente.");
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

function getPdfAttachments(payload: any): any[] {
    let attachments: any[] = [];
    if (!payload.parts) return attachments;

    for (const part of payload.parts) {
        const mime = part.mimeType || '';
        const name = part.filename || '';
        // Somente PDFs
        if (name.toLowerCase().endsWith('.pdf') && part.body && part.body.attachmentId) {
            attachments.push({
                filename: name,
                mimeType: mime,
                attachmentId: part.body.attachmentId,
            });
        }
        if (part.parts) {
            attachments = attachments.concat(getPdfAttachments(part));
        }
    }
    return attachments;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) throw new Error('Autenticação requerida (Authorization header).');

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabaseDb = createClient(supabaseUrl, supabaseKey);

        const accessToken = await getAccessToken();

        // 1. Encontrar as até 5 mensagens não lidas no marcador da Estampadora que tenham anexo
        const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=label:trabalho-estampadora-de-placa is:unread has:attachment&maxResults=5`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const listData = await listResponse.json();

        if (!listData.messages || listData.messages.length === 0) {
            return new Response(JSON.stringify({ message: "Nenhum email não lido com anexos encontrado.", processed: 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            });
        }

        let processedCount = 0;
        const results = [];

        // 2. Processar cada e-mail
        for (const msg of listData.messages) {
            const messageId = msg.id;

            try {
                // Detalhes da msg
                const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const msgData = await msgResponse.json();
                
                const attachments = getPdfAttachments(msgData.payload);
                let emailResults = [];

                for (const att of attachments) {
                    // Baixar o anexo
                    const attResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${att.attachmentId}`, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    const attData = await attResponse.json();
                    const base64UrlData = attData.data;

                    if (!base64UrlData) continue;

                    // Decodificar Base64URL para Buffer
                    const base64 = base64UrlData.replace(/-/g, '+').replace(/_/g, '/');
                    const binaryString = atob(base64);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const arrayBuffer = bytes.buffer;

                    // Extrair texto do PDF dinamicamente
                    let pdfText = '';
                    try {
                        const pdfjsLib = await import('https://esm.sh/pdfjs-dist@3.11.174/legacy/build/pdf.mjs');
                        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
                        
                        const loadingTask = pdfjsLib.getDocument({ 
                            data: arrayBuffer, 
                            useSystemFonts: true, 
                            standardFontDataUrl: 'https://esm.sh/pdfjs-dist@3.11.174/standard_fonts/' 
                        });
                        const doc = await loadingTask.promise;
                        for (let p = 1; p <= doc.numPages; p++) {
                            const page = await doc.getPage(p);
                            const textContent = await page.getTextContent();
                            const pageText = textContent.items.map((item: any) => item.str).join(' ');
                            pdfText += pageText + ' ';
                        }
                    } catch (err: any) {
                        console.error(`Erro ao ler PDF do anexo ${att.filename}:`, err);
                        emailResults.push({ att: att.filename, error: 'Falha na leitura do PDF: ' + err.message });
                        continue;
                    }

                    // Regex para Chassi e Placa
                    // Chassi: C seguido de espaços e 17 caracteres alfanuméricos, ou só 17 caracteres
                    const chassiMatch = pdfText.match(/C[\s-]*([A-HJ-NPR-Z0-9]{17})/i) || pdfText.match(/([A-HJ-NPR-Z0-9]{17})/i);
                    const chassi = chassiMatch ? chassiMatch[1].toUpperCase() : null;

                    // Placa Mercosul ou Antiga: ABC1234, ABC1D23, ABC-1234
                    const placaMatch = pdfText.match(/[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}/i);
                    const placaNova = placaMatch ? placaMatch[0].replace(/[-\s]/g, '').toUpperCase() : null;

                    // Tipo de documento
                    let tipo = "Documento Neutro";
                    const lowerText = pdfText.toLowerCase();
                    if (lowerText.includes("sifap") || lowerText.includes("estampagem") || lowerText.includes("autorizacao de estampagem")) {
                        tipo = "SIFAP";
                    } else if (lowerText.includes("nota fiscal") || lowerText.includes("danfe")) {
                        tipo = "Nota Fiscal";
                    } else if (lowerText.includes("boleto") || lowerText.includes("pagador")) {
                        tipo = "Boleto";
                    }

                    if (chassi) {
                        // Buscar veículo no Banco de Dados
                        const { data: veiculo } = await supabaseDb.from("veiculos")
                            .select("id, placa, chassi")
                            .ilike("chassi", `%${chassi}%`)
                            .limit(1)
                            .single();
                        
                        if (veiculo) {
                            // Atualizar placa se for diferente e houver uma nova no PDF
                            if (placaNova && placaNova !== veiculo.placa) {
                                await supabaseDb.from("veiculos").update({ placa: placaNova }).eq("id", veiculo.id);
                            }

                            // Encontrar a última OS ativa vinculada ao veículo
                            const { data: os } = await supabaseDb.from("ordens_de_servico")
                                .select("id, numero, audit_log")
                                .eq("veiculo_id", veiculo.id)
                                .neq("status", "entregue")
                                .order("criado_em", { ascending: false })
                                .limit(1)
                                .single();
                            
                            if (os) {
                                // Fazer o Upload para a pasta da OS
                                const safeFilename = att.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                                const safeTipo = tipo.replace(/\s+/g, '_');
                                const storagePath = `os_${os.numero}/recebidos/${safeTipo}_${safeFilename}`;
                                
                                const { error: uploadError } = await supabaseDb.storage
                                    .from("documentos")
                                    .upload(storagePath, bytes.buffer, { contentType: "application/pdf", upsert: true });

                                if (!uploadError) {
                                    // Adicionar ao Audit Log da OS
                                    const auditLog = os.audit_log || [];
                                    auditLog.push({
                                        id: crypto.randomUUID(),
                                        acao: "Documento Automático",
                                        detalhes: `Robô identificou o Chassi (${chassi}). Classificou como ${tipo} e salvou no sistema. ${placaNova && placaNova !== veiculo.placa ? `Placa Mercosul (${placaNova}) capturada.` : ''}`,
                                        usuario: "Robô Matilde",
                                        dataHora: new Date().toISOString()
                                    });
                                    await supabaseDb.from("ordens_de_servico").update({ audit_log: auditLog }).eq("id", os.id);
                                    
                                    emailResults.push({ att: att.filename, type: tipo, chassi, matched: `OS ${os.numero}` });
                                } else {
                                    emailResults.push({ att: att.filename, type: tipo, chassi, error: 'Upload failed' });
                                }
                            } else {
                                emailResults.push({ att: att.filename, type: tipo, chassi, matched: 'Nenhuma OS ativa encontrada' });
                            }
                        } else {
                            emailResults.push({ att: att.filename, type: tipo, chassi, matched: 'Nenhum veículo encontrado com esse Chassi' });
                        }
                    } else {
                        emailResults.push({ att: att.filename, error: 'Chassi não encontrado no PDF' });
                    }
                }

                results.push({ messageId, results: emailResults });

                // Marcar Email como LIDO para não processar novamente!
                await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
                });

                processedCount++;

            } catch (msgErr: any) {
                console.error(`Erro ao processar mensagem ${messageId}:`, msgErr);
                results.push({ messageId, error: msgErr.message });
                // Em caso de erro grave na msg, ela não perde o rótulo de UNREAD, assim tentaremos depois
            }
        }

        return new Response(JSON.stringify({ message: "Sucesso", processed: processedCount, details: results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (error: any) {
        console.error('Erro na função parse-stamper-emails:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        });
    }
});

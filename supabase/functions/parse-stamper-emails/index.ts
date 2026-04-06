import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
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
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) throw new Error('Autenticação requerida (Authorization header).');

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabaseDb = createClient(supabaseUrl, supabaseKey);

        const accessToken = await getAccessToken();

        // 1. Achar até 5 mensagens NÃO LIDAS, com anexos, na categoria da estampadora
        const filter = encodeURIComponent(
            `isRead eq false and hasAttachments eq true and categories/any(c:c eq '${STAMPER_CATEGORY}')`
        );
        const listUrl = `${GRAPH_BASE}/me/messages?$filter=${filter}&$top=5&$select=id,subject`;

        const listResponse = await fetch(listUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        const listData = await listResponse.json();

        if (!listResponse.ok) {
            throw new Error(`Erro ao listar mensagens Graph: ${JSON.stringify(listData)}`);
        }

        const messages = listData.value || [];
        if (messages.length === 0) {
            return new Response(
                JSON.stringify({ message: 'Nenhum email não lido com anexos encontrado.', processed: 0 }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        let processedCount = 0;
        const results: any[] = [];

        // 2. Processar cada e-mail
        for (const msg of messages) {
            const messageId = msg.id;

            try {
                // Buscar todos os anexos da mensagem (com contentBytes)
                const attListResp = await fetch(
                    `${GRAPH_BASE}/me/messages/${messageId}/attachments`,
                    { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );
                const attListData = await attListResp.json();
                const allAttachments = attListData.value || [];

                // Somente PDFs do tipo fileAttachment
                const pdfAttachments = allAttachments.filter((a: any) =>
                    a['@odata.type'] === '#microsoft.graph.fileAttachment' &&
                    typeof a.name === 'string' &&
                    a.name.toLowerCase().endsWith('.pdf')
                );

                const emailResults: any[] = [];

                for (const att of pdfAttachments) {
                    const base64Data = att.contentBytes; // base64 padrão
                    if (!base64Data) continue;

                    // Decodificar base64 → bytes
                    const binaryString = atob(base64Data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const arrayBuffer = bytes.buffer;

                    // Extrair texto do PDF
                    let pdfText = '';
                    try {
                        const pdfjsLib = await import('https://esm.sh/pdfjs-dist@3.11.174/legacy/build/pdf.mjs');
                        pdfjsLib.GlobalWorkerOptions.workerSrc = '';

                        const loadingTask = pdfjsLib.getDocument({
                            data: arrayBuffer,
                            useSystemFonts: true,
                            standardFontDataUrl: 'https://esm.sh/pdfjs-dist@3.11.174/standard_fonts/',
                        });
                        const doc = await loadingTask.promise;
                        for (let p = 1; p <= doc.numPages; p++) {
                            const page = await doc.getPage(p);
                            const textContent = await page.getTextContent();
                            const pageText = textContent.items.map((item: any) => item.str).join(' ');
                            pdfText += pageText + ' ';
                        }
                    } catch (err: any) {
                        console.error(`Erro ao ler PDF do anexo ${att.name}:`, err);
                        emailResults.push({ att: att.name, error: 'Falha na leitura do PDF: ' + err.message });
                        continue;
                    }

                    // Regex para Chassi e Placa
                    const chassiMatch = pdfText.match(/C[\s-]*([A-HJ-NPR-Z0-9]{17})/i) || pdfText.match(/([A-HJ-NPR-Z0-9]{17})/i);
                    const chassi = chassiMatch ? chassiMatch[1].toUpperCase() : null;

                    const placaMatch = pdfText.match(/[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}/i);
                    const placaNova = placaMatch ? placaMatch[0].replace(/[-\s]/g, '').toUpperCase() : null;

                    let tipo = 'Documento Neutro';
                    const lowerText = pdfText.toLowerCase();
                    if (lowerText.includes('sifap') || lowerText.includes('estampagem') || lowerText.includes('autorizacao de estampagem')) {
                        tipo = 'SIFAP';
                    } else if (lowerText.includes('nota fiscal') || lowerText.includes('danfe')) {
                        tipo = 'Nota Fiscal';
                    } else if (lowerText.includes('boleto') || lowerText.includes('pagador')) {
                        tipo = 'Boleto';
                    }

                    if (chassi) {
                        const { data: veiculo } = await supabaseDb.from('veiculos')
                            .select('id, placa, chassi')
                            .ilike('chassi', `%${chassi}%`)
                            .limit(1)
                            .single();

                        if (veiculo) {
                            if (placaNova && placaNova !== veiculo.placa) {
                                await supabaseDb.from('veiculos').update({ placa: placaNova }).eq('id', veiculo.id);
                            }

                            const { data: os } = await supabaseDb.from('ordens_de_servico')
                                .select('id, numero, audit_log')
                                .eq('veiculo_id', veiculo.id)
                                .neq('status', 'entregue')
                                .order('criado_em', { ascending: false })
                                .limit(1)
                                .single();

                            if (os) {
                                const safeFilename = att.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                                const safeTipo = tipo.replace(/\s+/g, '_');
                                const storagePath = `os_${os.numero}/recebidos/${safeTipo}_${safeFilename}`;

                                const { error: uploadError } = await supabaseDb.storage
                                    .from('documentos')
                                    .upload(storagePath, bytes.buffer, { contentType: 'application/pdf', upsert: true });

                                if (!uploadError) {
                                    const auditLog = os.audit_log || [];
                                    auditLog.push({
                                        id: crypto.randomUUID(),
                                        acao: 'Documento Automático',
                                        detalhes: `Robô identificou o Chassi (${chassi}). Classificou como ${tipo} e salvou no sistema. ${placaNova && placaNova !== veiculo.placa ? `Placa Mercosul (${placaNova}) capturada.` : ''}`,
                                        usuario: 'Robô Matilde',
                                        dataHora: new Date().toISOString(),
                                    });
                                    await supabaseDb.from('ordens_de_servico').update({ audit_log: auditLog }).eq('id', os.id);

                                    emailResults.push({ att: att.name, type: tipo, chassi, matched: `OS ${os.numero}` });
                                } else {
                                    emailResults.push({ att: att.name, type: tipo, chassi, error: 'Upload failed' });
                                }
                            } else {
                                emailResults.push({ att: att.name, type: tipo, chassi, matched: 'Nenhuma OS ativa encontrada' });
                            }
                        } else {
                            emailResults.push({ att: att.name, type: tipo, chassi, matched: 'Nenhum veículo encontrado com esse Chassi' });
                        }
                    } else {
                        emailResults.push({ att: att.name, error: 'Chassi não encontrado no PDF' });
                    }
                }

                results.push({ messageId, results: emailResults });

                // Marcar mensagem como LIDA via PATCH
                await fetch(`${GRAPH_BASE}/me/messages/${messageId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ isRead: true }),
                });

                processedCount++;
            } catch (msgErr: any) {
                console.error(`Erro ao processar mensagem ${messageId}:`, msgErr);
                results.push({ messageId, error: msgErr.message });
                // Em caso de erro, mantém como não lida para nova tentativa
            }
        }

        return new Response(
            JSON.stringify({ message: 'Sucesso', processed: processedCount, details: results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
    } catch (error: any) {
        console.error('Erro na função parse-stamper-emails:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});

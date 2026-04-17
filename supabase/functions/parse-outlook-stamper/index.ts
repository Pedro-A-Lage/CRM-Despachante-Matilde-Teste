import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('MS_CLIENT_ID');
  const tenantId = Deno.env.get('MS_TENANT_ID') || 'common';
  const refreshToken = Deno.env.get('MS_REFRESH_TOKEN');

  if (!clientId || !refreshToken) {
    throw new Error('Credenciais Outlook (MS_CLIENT_ID, MS_REFRESH_TOKEN) não configuradas.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'offline_access Mail.Send Mail.Read Mail.ReadWrite',
  });

  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Falha ao renovar token Microsoft: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function findFolderIdByName(token: string, name: string): Promise<string | null> {
  const key = name.trim().toLowerCase();
  const rootResp = await fetch(
    'https://graph.microsoft.com/v1.0/me/mailFolders?$top=100&$select=id,displayName,childFolderCount',
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const rootData = await rootResp.json();
  if (!rootResp.ok) throw new Error(`Erro ao buscar pastas: ${JSON.stringify(rootData)}`);

  const queue: Array<{ id: string; displayName: string; childFolderCount?: number }> = rootData.value || [];
  while (queue.length) {
    const f = queue.shift()!;
    if (f.displayName?.toLowerCase() === key) return f.id;
    if ((f.childFolderCount || 0) > 0) {
      const cResp = await fetch(
        `https://graph.microsoft.com/v1.0/me/mailFolders/${f.id}/childFolders?$top=100&$select=id,displayName,childFolderCount`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const cData = await cResp.json();
      if (cResp.ok && Array.isArray(cData.value)) queue.push(...cData.value);
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Autenticação requerida (Authorization header).');

    const body = await req.json().catch(() => ({}));
    const folderName: string = body.folderName || 'Placas';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseDb = createClient(supabaseUrl, supabaseKey);

    const accessToken = await getAccessToken();

    const folderId = await findFolderIdByName(accessToken, folderName);
    if (!folderId) throw new Error(`Pasta "${folderName}" não encontrada no Outlook.`);

    // 1. Até 5 mensagens não lidas COM anexo nessa pasta
    const listUrl = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages?$top=5&$orderby=receivedDateTime desc&$filter=isRead eq false and hasAttachments eq true&$select=id,subject,hasAttachments`;
    const listResp = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const listData = await listResp.json();
    if (!listResp.ok) throw new Error(`Erro ao listar mensagens: ${JSON.stringify(listData)}`);

    const messages = (listData.value || []) as Array<{ id: string; subject?: string }>;
    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ message: 'Nenhum email não lido com anexos encontrado.', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    let processedCount = 0;
    const results: any[] = [];

    for (const msg of messages) {
      const messageId = msg.id;
      try {
        // Baixar anexos (apenas PDFs)
        const attsResp = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline,contentBytes`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        const attsData = await attsResp.json();
        if (!attsResp.ok) throw new Error(`Erro ao listar anexos: ${JSON.stringify(attsData)}`);

        const pdfs = (attsData.value || []).filter((a: any) =>
          !a.isInline && (a.name || '').toLowerCase().endsWith('.pdf')
        );

        const emailResults: any[] = [];

        for (const att of pdfs) {
          const base64: string = att.contentBytes || '';
          if (!base64) continue;

          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
          const arrayBuffer = bytes.buffer;

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

          const chassiMatch =
            pdfText.match(/C[\s-]*([A-HJ-NPR-Z0-9]{17})/i) ||
            pdfText.match(/([A-HJ-NPR-Z0-9]{17})/i);
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
            const { data: veiculo } = await supabaseDb
              .from('veiculos')
              .select('id, placa, chassi')
              .ilike('chassi', `%${chassi}%`)
              .limit(1)
              .single();

            if (veiculo) {
              if (placaNova && placaNova !== veiculo.placa) {
                await supabaseDb.from('veiculos').update({ placa: placaNova }).eq('id', veiculo.id);
              }

              const { data: os } = await supabaseDb
                .from('ordens_de_servico')
                .select('id, numero, audit_log')
                .eq('veiculo_id', veiculo.id)
                .neq('status', 'entregue')
                .order('criado_em', { ascending: false })
                .limit(1)
                .single();

              if (os) {
                const safeFilename = (att.name as string).replace(/[^a-zA-Z0-9.\-_]/g, '_');
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

        // Marca como lido para não reprocessar
        await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
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
      }
    }

    return new Response(
      JSON.stringify({ message: 'Sucesso', processed: processedCount, details: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Erro em parse-outlook-stamper:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

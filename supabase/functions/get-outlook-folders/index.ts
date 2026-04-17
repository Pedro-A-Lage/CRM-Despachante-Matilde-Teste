import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

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
    scope: 'offline_access Mail.Send Mail.Read',
  });

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`Falha ao renovar token Microsoft: ${JSON.stringify(data)}`);
  return data.access_token;
}

interface GraphFolder {
  id: string;
  displayName: string;
  parentFolderId?: string;
  childFolderCount?: number;
  unreadItemCount?: number;
  totalItemCount?: number;
}

async function listAllFolders(token: string): Promise<GraphFolder[]> {
  // Usa includeHiddenFolders=false por padrão; percorre recursivamente para pegar subpastas
  const all: GraphFolder[] = [];
  const rootResp = await fetch(
    'https://graph.microsoft.com/v1.0/me/mailFolders?$top=100&$select=id,displayName,parentFolderId,childFolderCount,unreadItemCount,totalItemCount',
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const rootData = await rootResp.json();
  if (!rootResp.ok) throw new Error(`Erro ao listar pastas: ${JSON.stringify(rootData)}`);

  const queue: GraphFolder[] = rootData.value || [];
  while (queue.length) {
    const folder = queue.shift()!;
    all.push(folder);
    if ((folder.childFolderCount || 0) > 0) {
      const childResp = await fetch(
        `https://graph.microsoft.com/v1.0/me/mailFolders/${folder.id}/childFolders?$top=100&$select=id,displayName,parentFolderId,childFolderCount,unreadItemCount,totalItemCount`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const childData = await childResp.json();
      if (childResp.ok && Array.isArray(childData.value)) {
        queue.push(...childData.value);
      }
    }
  }
  return all;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const token = await getAccessToken();
    const folders = await listAllFolders(token);

    return new Response(
      JSON.stringify({ folders }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Erro em get-outlook-folders:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

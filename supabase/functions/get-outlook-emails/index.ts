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

interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  isRead?: boolean;
  hasAttachments?: boolean;
}

function formatSenderFromMessage(msg: GraphMessage, direction: 'in' | 'out'): string {
  if (direction === 'in') {
    const f = msg.from?.emailAddress;
    if (!f) return 'Desconhecido';
    return f.name ? `${f.name} <${f.address}>` : (f.address || 'Desconhecido');
  }
  const to = msg.toRecipients?.[0]?.emailAddress;
  if (!to) return 'Destinatário desconhecido';
  const label = to.name ? `${to.name} <${to.address}>` : (to.address || '');
  return `Para: ${label}`;
}

async function listByFolderId(token: string, folderId: string, limit: number) {
  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,bodyPreview,receivedDateTime,sentDateTime,from,toRecipients,isRead,hasAttachments`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Erro ao listar pasta ${folderId}: ${JSON.stringify(data)}`);
  return (data.value || []) as GraphMessage[];
}

async function findFolderIdByName(token: string, name: string): Promise<string | null> {
  // Nomes bem-conhecidos do Outlook podem ser usados direto
  const wellKnown: Record<string, string> = {
    inbox: 'inbox',
    sentitems: 'sentitems',
    'sent items': 'sentitems',
    drafts: 'drafts',
    deleteditems: 'deleteditems',
    junkemail: 'junkemail',
    outbox: 'outbox',
    archive: 'archive',
  };
  const key = name.trim().toLowerCase();
  if (wellKnown[key]) return wellKnown[key];

  // Busca case-insensitive percorrendo Inbox e seus filhos
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

async function listSentToEmail(token: string, email: string, limit: number) {
  // Graph não suporta $filter com `toRecipients/any(...)` em /messages —
  // retorna ErrorInvalidUrlQueryFilter. Usamos $search com sintaxe KQL.
  // $search e $orderby são mutuamente exclusivos; a ordenação por data
  // é feita no cliente (junto com a lista de recebidos).
  const safeEmail = email.replace(/"/g, '\\"');
  const search = encodeURIComponent(`"to:${safeEmail}"`);
  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=${limit}&$search=${search}&$select=id,conversationId,subject,bodyPreview,receivedDateTime,sentDateTime,from,toRecipients,isRead,hasAttachments`;
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'ConsistencyLevel': 'eventual',
    },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Erro ao listar enviados: ${JSON.stringify(data)}`);
  return (data.value || []) as GraphMessage[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const folderName: string = body.folderName || 'Inbox';
    const empresaEmail: string | undefined = body.empresaEmail;
    const limit: number = Math.min(body.limit || 30, 100);

    const token = await getAccessToken();

    const folderId = await findFolderIdByName(token, folderName);
    if (!folderId) throw new Error(`Pasta "${folderName}" não encontrada no Outlook.`);

    const tasks: Promise<GraphMessage[]>[] = [listByFolderId(token, folderId, limit)];
    if (empresaEmail) tasks.push(listSentToEmail(token, empresaEmail, limit));
    const [recebidos, enviados = []] = await Promise.all(tasks);

    const unifiedIn = recebidos.map((m) => ({
      id: m.id,
      threadId: m.conversationId || m.id,
      subject: m.subject || '(sem assunto)',
      from: formatSenderFromMessage(m, 'in'),
      date: m.receivedDateTime || m.sentDateTime || '',
      snippet: m.bodyPreview || '',
      direction: 'in' as const,
      isRead: m.isRead ?? true,
      hasAttachments: m.hasAttachments ?? false,
    }));
    const unifiedOut = enviados.map((m) => ({
      id: m.id,
      threadId: m.conversationId || m.id,
      subject: m.subject || '(sem assunto)',
      from: formatSenderFromMessage(m, 'out'),
      date: m.sentDateTime || m.receivedDateTime || '',
      snippet: m.bodyPreview || '',
      direction: 'out' as const,
      isRead: true,
      hasAttachments: m.hasAttachments ?? false,
    }));

    const emails = [...unifiedIn, ...unifiedOut].sort((a, b) => {
      const da = new Date(a.date).getTime() || 0;
      const db = new Date(b.date).getTime() || 0;
      return db - da;
    });

    return new Response(
      JSON.stringify({ emails, folderId, folderName, empresaEmail: empresaEmail || null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Erro em get-outlook-emails:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});

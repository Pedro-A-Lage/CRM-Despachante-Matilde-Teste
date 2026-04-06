// Helper compartilhado para autenticação OAuth2 com Microsoft Graph (Outlook/Hotmail)
// Requer secrets no Supabase: OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_REFRESH_TOKEN
// OUTLOOK_TENANT é opcional (default: "common" — funciona para contas pessoais @hotmail.com / @outlook.com)

export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// Categoria do Outlook equivalente ao label antigo do Gmail
export const STAMPER_CATEGORY = 'trabalho-estampadora-de-placa';

export async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('OUTLOOK_CLIENT_ID');
  const clientSecret = Deno.env.get('OUTLOOK_CLIENT_SECRET');
  const refreshToken = Deno.env.get('OUTLOOK_REFRESH_TOKEN');
  const tenant = Deno.env.get('OUTLOOK_TENANT') || 'common';

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Credenciais do Outlook (OAuth2) não configuradas no Supabase Secrets.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'offline_access Mail.Read Mail.Send Mail.ReadWrite',
  });

  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Falha ao renovar token Outlook: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

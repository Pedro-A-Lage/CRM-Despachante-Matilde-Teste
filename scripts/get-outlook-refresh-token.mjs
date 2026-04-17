// scripts/get-outlook-refresh-token.mjs
//
// Gera o refresh token do Outlook (Microsoft Graph) para usar na edge function
// send-email-empresa do Supabase.
//
// COMO USAR:
//   1. Antes de rodar, abra ESTE ARQUIVO e preencha as 3 constantes abaixo:
//      CLIENT_ID, CLIENT_SECRET e TENANT_ID
//   2. Garanta que o app no Azure tem o redirect URI:
//        http://localhost:3000
//      (vá em "Authentication (Preview)" → "Configuração do URI de redirecionamento"
//       → "Adicionar o URI de redirecionamento" → cole http://localhost:3000)
//   3. Rode no terminal:
//        node scripts/get-outlook-refresh-token.mjs
//   4. O navegador vai abrir, faça login com a conta despachantematilde@...
//   5. O refresh token vai aparecer no terminal — copie e guarde.
//   6. Cole no Supabase como secret MS_REFRESH_TOKEN.

import http from 'node:http';
import { exec } from 'node:child_process';

// ────────────────────────────────────────────────────────────
// PREENCHA ESTAS 3 CONSTANTES:
// ────────────────────────────────────────────────────────────
const CLIENT_ID = '7359d62b-6f2f-467c-9d9e-1ac242f84432';
const CLIENT_SECRET = 'hbj8Q~1sH4RaTYYD3KWeq7PLvQaYRNi_XIlDYc3g';
const TENANT_ID = 'consumers';
// ────────────────────────────────────────────────────────────

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}`;
// Mail.ReadWrite é necessário para o Robô Alocador marcar emails como lidos
// após processar os PDFs (PATCH /me/messages/{id} com isRead=true).
// Inclui implicitamente Mail.Read.
const SCOPE = 'offline_access Mail.Send Mail.ReadWrite';

if (CLIENT_ID.startsWith('COLE_') || CLIENT_SECRET.startsWith('COLE_') || TENANT_ID.startsWith('COLE_')) {
    console.error('❌ Preencha CLIENT_ID, CLIENT_SECRET e TENANT_ID no topo do arquivo.');
    process.exit(1);
}

const authUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
    new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        response_mode: 'query',
        scope: SCOPE,
        prompt: 'consent',
    }).toString();

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>❌ Erro</h1><pre>${error}: ${url.searchParams.get('error_description')}</pre>`);
        console.error('Erro OAuth:', error, url.searchParams.get('error_description'));
        server.close();
        return;
    }

    if (!code) {
        res.writeHead(404);
        res.end('Aguardando code...');
        return;
    }

    console.log('\n✅ Code recebido, trocando por tokens...\n');

    try {
        // Cliente público — NÃO envia client_secret
        const tokenResp = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                code,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code',
                scope: SCOPE,
            }).toString(),
        });

        const data = await tokenResp.json();

        if (!tokenResp.ok) {
            console.error('❌ Erro ao trocar code por tokens:');
            console.error(JSON.stringify(data, null, 2));
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h1>❌ Erro</h1><pre>${JSON.stringify(data, null, 2)}</pre>`);
            server.close();
            return;
        }

        if (!data.refresh_token) {
            console.error('❌ Resposta não contém refresh_token. Verifique se "offline_access" está nos scopes.');
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>❌ Sem refresh_token</h1>');
            server.close();
            return;
        }

        console.log('═══════════════════════════════════════════════════════════');
        console.log('✅ SUCESSO! Copie o REFRESH_TOKEN abaixo:');
        console.log('═══════════════════════════════════════════════════════════\n');
        console.log(data.refresh_token);
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('\nAgora cole no Supabase:');
        console.log('  supabase secrets set MS_REFRESH_TOKEN="<o-token-acima>"');
        console.log('\nOu via Dashboard:');
        console.log('  Project Settings → Edge Functions → Secrets → New');
        console.log('  Nome: MS_REFRESH_TOKEN');
        console.log('  Valor: <o-token-acima>\n');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <html>
                <head><title>Sucesso</title></head>
                <body style="font-family: sans-serif; padding: 40px; background: #1a1a1a; color: #fff;">
                    <h1>✅ Refresh Token gerado!</h1>
                    <p>Volte para o terminal e copie o token que apareceu lá.</p>
                    <p>Pode fechar esta aba.</p>
                </body>
            </html>
        `);

        setTimeout(() => server.close(), 1000);
    } catch (err) {
        console.error('❌ Erro:', err);
        res.writeHead(500);
        res.end(String(err));
        server.close();
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 Servidor local rodando em ${REDIRECT_URI}`);
    console.log('🌐 Abrindo navegador para login Microsoft...\n');
    console.log('Se o navegador não abrir, acesse manualmente:\n');
    console.log(authUrl);
    console.log('');

    // Abre o navegador (Windows)
    const platform = process.platform;
    const cmd = platform === 'win32' ? `start "" "${authUrl}"`
        : platform === 'darwin' ? `open "${authUrl}"`
        : `xdg-open "${authUrl}"`;
    exec(cmd);
});

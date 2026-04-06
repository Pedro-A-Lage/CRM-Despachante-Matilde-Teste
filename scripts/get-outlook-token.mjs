// Script para obter o Refresh Token do Outlook (Microsoft Graph)
// Pré-requisito: registrar um app em https://entra.microsoft.com → Identidade → Aplicações → Registro de aplicativos
//   - Tipos de conta suportados: "Contas em qualquer diretório organizacional e contas pessoais da Microsoft"
//   - Adicionar URI de redirecionamento: http://localhost:3000/oauth2callback (tipo "Web")
//   - Em "Certificados e segredos", criar um Client Secret e copiar o VALUE
//   - Em "Permissões da API", adicionar Microsoft Graph (delegadas): Mail.Read, Mail.Send, Mail.ReadWrite, offline_access
//
// Depois rode:  node scripts/get-outlook-token.mjs
//   (preencha CLIENT_ID e CLIENT_SECRET abaixo antes de rodar)

import http from 'http';
import url from 'url';

const CLIENT_ID = 'PREENCHER_CLIENT_ID_DO_AZURE';
const CLIENT_SECRET = 'PREENCHER_CLIENT_SECRET_DO_AZURE';
const TENANT = 'common'; // 'common' funciona para conta pessoal @hotmail.com / @outlook.com
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const PORT = 3000;

const SCOPES = [
  'offline_access',
  'Mail.Read',
  'Mail.Send',
  'Mail.ReadWrite',
];

function getAuthUrl() {
  const rootUrl = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`;
  const options = {
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: SCOPES.join(' '),
    prompt: 'consent',
  };
  return `${rootUrl}?${new URLSearchParams(options).toString()}`;
}

async function getTokens(code) {
  const tokenUrl = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
  const values = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
    scope: SCOPES.join(' '),
  };

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values).toString(),
  });
  return response.json();
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url && req.url.startsWith('/oauth2callback')) {
      const q = url.parse(req.url, true).query;

      if (q.error) {
        console.log('❌ Erro da Autenticação Microsoft:', q.error, q.error_description || '');
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Erro de autenticação! Verifique o console.');
        server.close();
        process.exit(1);
      } else if (q.code) {
        console.log('\n⏳ Código recebido! Trocando por tokens com a Microsoft...');
        const tokens = await getTokens(q.code);

        if (tokens.refresh_token) {
          console.log('\n✅ ========================================= ✅');
          console.log('  SUCESSO! COPIE O REFRESH TOKEN ABAIXO:');
          console.log('✅ ========================================= ✅\n');
          console.log(tokens.refresh_token);
          console.log('\n=============================================');
          console.log('\nConfigure os secrets no Supabase:');
          console.log('  supabase secrets set OUTLOOK_CLIENT_ID=...');
          console.log('  supabase secrets set OUTLOOK_CLIENT_SECRET=...');
          console.log('  supabase secrets set OUTLOOK_REFRESH_TOKEN=<token acima>');
          console.log('  supabase secrets set OUTLOOK_TENANT=common');

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>✅ Autenticação concluída!</h1><p>Volte ao terminal e copie o Refresh Token.</p>');
          server.close();
          process.exit(0);
        } else {
          console.log('\n⚠️ Não veio refresh_token. Resposta:', tokens);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>⚠️ Faltou o Refresh Token.</h1><p>Veja o console.</p>');
          server.close();
          process.exit(1);
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end('Erro interno');
  }
});

server.listen(PORT, () => {
  console.log('\n========================================================================');
  console.log('PASSO 1: No Azure Portal, registre um app e copie Client ID + Client Secret');
  console.log('PASSO 2: Adicione o redirect URI:');
  console.log(`         👉  ${REDIRECT_URI}`);
  console.log('PASSO 3: Adicione permissões delegadas: Mail.Read, Mail.Send, Mail.ReadWrite, offline_access');
  console.log('PASSO 4: Preencha CLIENT_ID e CLIENT_SECRET no topo deste arquivo');
  console.log('========================================================================\n');
  console.log('Depois, segure CTRL e clique no link abaixo para autorizar:\n');
  console.log(`🌐 ${getAuthUrl()}\n`);
  console.log('========================================================================');
  console.log('⏱️  Aguardando você logar no navegador (porta 3000)...');
});

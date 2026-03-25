import http from 'http';
import url from 'url';

const CLIENT_ID = '70384865398-4860f519q3lllfsu2behsoj5tt4hr66k.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const PORT = 3000;

// Escopos para controle completo do Gmail (ler e enviar)
const SCOPES = [
  'https://mail.google.com/'
];

function getAuthUrl() {
  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    access_type: 'offline', // Importante: Exige Refresh Token
    response_type: 'code',
    prompt: 'consent',      // Importante: Força a tela de consentimento para garantir entrega do refresh token
    scope: SCOPES.join(' '),
  };
  const qs = new URLSearchParams(options);
  return `${rootUrl}?${qs.toString()}`;
}

async function getTokens(code) {
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const values = {
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  };

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(values).toString(),
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching tokens:', error);
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url && req.url.startsWith('/oauth2callback')) {
      const q = url.parse(req.url, true).query;
      
      if (q.error) {
        console.log('❌ Erro da Autenticação do Google:', q.error);
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Erro de autenticação! Verifique o console do VS Code.');
        server.close();
        process.exit(1);
      } else if (q.code) {
        console.log('\n⏳ Código de autorização recebido! Trocando por Tokens com a Google...');
        const tokens = await getTokens(q.code);
        
        if (tokens.refresh_token) {
            console.log('\n✅ ========================================= ✅');
            console.log('  SUCESSO! COPIE O REFRESH TOKEN ABAIXO:');
            console.log('✅ ========================================= ✅\n');
            console.log(tokens.refresh_token);
            console.log('\n=============================================');
            console.log('Agora você já pode executar o comando do Supabase Secrets no outro terminal!');

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>✅ Autenticação concluída com sucesso!</h1><p>Pode fechar esta janela, voltar ao VS Code e copiar o seu <b>Refresh Token</b> amarelo no terminal.</p>');
            server.close();
            process.exit(0);
        } else {
            console.log('\n⚠️ Aviso: O Google não enviou um Refresh Token. Isso geralmente ocorre se você já tinha autorizado o app antes e não desmarcou. Acesse sua conta Google, remova a permissão do App e tente rodar o script de novo.');
            console.log('Access Token obtido (Temporário, 1h):', tokens.access_token);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>⚠️ Quase lá... Mas faltou o Refresh Token.</h1><p>Verifique os avisos no console do VS Code.</p>');
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
    console.log('PASSO 1: Acesse o Console do Google Cloud Onde gerou essas credenciais');
    console.log('PASSO 2: Edite o seu Cliente OAuth');
    console.log(`PASSO 3: Em "URIs de redirecionamento autorizados", adicione exatamente:`);
    console.log(`         👉  ${REDIRECT_URI}`);
    console.log('PASSO 4: Salve as alterações lá na tela da Google.');
    console.log('========================================================================\n');
    console.log('DEPOIS DISSO, SEGURE "CTRL" E CLIQUE NO LINK ABAIXO PARA AUTORIZAR:\n');
    console.log(`🌐 ${getAuthUrl()}\n`);
    console.log('========================================================================');
    console.log('⏱️  Aguardando você logar no navegador (rodando na porta 3000)...');
});

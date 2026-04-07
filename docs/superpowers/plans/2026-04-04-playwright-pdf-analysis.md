# Plano — Playwright PDF Analysis (CDP)

Spec: `docs/superpowers/specs/2026-04-04-playwright-pdf-analysis-design.md`

## Passos

### 1. Setup do projeto
- Criar `chrome-extension/playwright-analyze/`
- Criar `package.json` com dependência `playwright`
- Criar `.gitignore` (node_modules, analyze-result.json)
- Rodar `npm install`

### 2. Criar `chrome.bat`
- Script que localiza o `chrome.exe` no sistema
- Abre com flags: `--remote-debugging-port=9222 --user-data-dir` (usa perfil padrão ou temporário)
- Instrução no console para o usuário

### 3. Criar `analyze.js` — Conexão CDP
- `chromium.connectOverCDP('http://localhost:9222')`
- Listar abas abertas
- Identificar aba do Detran (URL contém `detran.mg.gov.br` ou `transito.mg.gov.br`)
- Se não encontrar, monitorar todas

### 4. `analyze.js` — Interceptação de rede
- `page.on('request')` — logar método, URL, headers (filtrar assets)
- `page.on('response')` — logar status, content-type, content-disposition
- Detectar respostas PDF (content-type `application/pdf` ou `octet-stream`)
- Quando PDF detectado: salvar headers completos + URL no array de resultados

### 5. `analyze.js` — Monitorar novas abas/popups
- `context.on('page')` — logar URL da nova aba
- Aplicar mesmos listeners de rede na nova aba
- Detectar se a nova aba é um PDF

### 6. `analyze.js` — Monitorar navegação
- `page.on('framenavigated')` — logar mudanças de URL
- Detectar redirects (30x)

### 7. `analyze.js` — Salvar resultados
- Ao detectar PDF ou no Ctrl+C (SIGINT): salvar `analyze-result.json`
- Formato: array de eventos com timestamp, tipo, dados

### 8. Testar
- Abrir Chrome com `chrome.bat`
- Navegar a qualquer site com PDF
- Rodar `node analyze.js`
- Verificar que intercepta corretamente

## Ordem de execução

1 → 2 → 3 → 4+5+6 (paralelo, mesmo arquivo) → 7 → 8

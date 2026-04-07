# Spec — Playwright PDF Analysis (CDP)

## Problema

A extensão Chrome do Matilde CRM captura PDFs do Detran MG de duas formas:
1. **Modal com base64 (resolvido)** — PDF exposto no DOM como `data:application/pdf;base64,...`
2. **Modal com OK → nova página (não resolvido)** — Ao clicar OK, o Detran redireciona para uma nova página/aba que renderiza o PDF. A extensão perde o controle nesse fluxo.

## Objetivo

Criar um script Playwright que se conecta ao Chrome em execução via CDP e **intercepta toda atividade de rede e navegação** para descobrir exatamente como o PDF chega ao navegador no caso 2. Com essa informação, melhoraremos a extensão para capturar esse PDF automaticamente.

## Abordagem

- **Playwright `connect_over_cdp`** — conecta ao Chrome real do usuário (com sessão, cookies, extensão carregados)
- Zero interferência — o usuário navega normalmente, faz login/captcha
- O script apenas observa e registra

## O que o script captura

| Evento | Dados registrados |
|--------|-------------------|
| Request de rede | URL, método, headers, content-type, POST body (resumido) |
| Resposta de rede | Status, content-type, content-length, content-disposition |
| Resposta PDF detectada | URL completa, headers completos, tamanho |
| Nova aba/popup | URL, quem abriu |
| Navegação | URL antes/depois, tipo (redirect, link, form submit) |
| Download triggado | URL de origem, nome do arquivo, MIME type |

### Filtros

- Foca em requests para `*.detran.mg.gov.br`, `*.transito.mg.gov.br`, `*.cidadao.mg.gov.br`
- Destaca respostas com `content-type: application/pdf` ou `content-disposition: attachment`
- Ignora assets estáticos (CSS, imagens, fontes)

## Arquivos

```
chrome-extension/playwright-analyze/
  package.json              ← dependência: playwright
  chrome.bat                ← Abre Chrome com --remote-debugging-port=9222
  analyze.js                ← Script principal
  .gitignore                ← ignora node_modules/ e *.json de resultado
```

## Fluxo de uso

1. Fechar todas as instâncias do Chrome
2. Rodar `chrome.bat` — abre Chrome com debug port 9222
3. Navegar até o Detran, fazer login, ir até a página antes do modal
4. Rodar `node analyze.js` no terminal
5. Script confirma conexão e começa a monitorar
6. Clicar OK no modal
7. Script exibe no console tudo que aconteceu + salva `analyze-result.json`
8. Ctrl+C para encerrar o script

## Saída esperada (exemplo)

```
[MONITOR] Conectado ao Chrome! Monitorando...
[MONITOR] Abas abertas: 3
[MONITOR] Monitorando aba: https://detran.mg.gov.br/.../confirmar-dados

[REQUEST]  POST https://detran.mg.gov.br/.../emitir-ficha
[RESPONSE] 302 → Location: https://detran.mg.gov.br/.../ficha.pdf
[REQUEST]  GET  https://detran.mg.gov.br/.../ficha.pdf
[RESPONSE] 200 application/pdf (145KB)
  >>> PDF DETECTADO! Headers completos salvo em analyze-result.json

[NOVA ABA] https://detran.mg.gov.br/.../ficha.pdf (aberta por popup)
```

## Fora de escopo

- Automação de login/captcha
- Modificação da extensão Chrome (será feita depois, com base nos resultados)
- Testes automatizados

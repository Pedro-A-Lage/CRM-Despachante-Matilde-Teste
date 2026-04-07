# Despachante Matilde - Sistema de Gestão (CRM)

Sistema web completo de Gestão de Relacionamento (CRM) e controle de processos, focado em otimizar e automatizar o fluxo de trabalho do despachante documentalista. 

## 🚀 Tecnologias Utilizadas

O projeto foi construído utilizando as seguintes tecnologias modernas do ecossistema:

* **[React 18](https://react.dev/)** - Biblioteca de UI.
* **[Vite](https://vitejs.dev/)** - Bundler e ambiente de desenvolvimento rápido.
* **[TypeScript](https://www.typescriptlang.org/)** - Tipagem estática para JavaScript moderno.
* **[Supabase](https://supabase.com/)** - Backend as a Service (BaaS) com banco de dados PostgreSQL real-time e Storage.
* **[Google Drive API](https://developers.google.com/drive)** - Integração nativa para submissão e organização em pastas reais na nuvem corporativa.
* **[Chrome Extension API](https://developer.chrome.com/docs/extensions)** - Extensão própria para captura e injeção de dados diretamente no portal do Detran MG.
* **[React Router](https://reactrouter.com/)** - Navegação no client-side.
* **[Lucide React](https://lucide.dev/)** - Biblioteca de ícones.

## 📦 Funcionalidades Principais

* **👥 Gestão de Clientes & Veículos:**  
  Cadastro flexível (PF e PJ) e vinculação de múltiplos veículos. Integração nativa com Google Drive: pastas são criadas automaticamente no formato `Clientes / Nome - CPF/CNPJ` e `OS #Número - Serviço`.

* **🚗 Extensão do Chrome (Integração Detran MG):**  
  * **Auto-Preenchimento e Captação:** A extensão lê dados diretamente da página "Confirmar Dados" e dos "Resultados de Vistoria" do Detran e os envia magicamente para o CRM.
  * **Upload de Guias:** Captura PDFs de DAE gerados no site, envia pro CRM e faz upload automático pro Google Drive da OS correspondente.
  * Cria OS, Clientes e Veículos (ou atualiza existentes) em um clique.

* **📋 Ordens de Serviço (OS) com Workflow Completo:**  
  Acompanhamento do status da documentação: *Aguardando Documentação, Vistoria, Delegacia, Doc. Pronto, Entregue*.
  * Kanban view interativo e Listagem avançada com buscas inteligentes.

* **✅ Checklist de Documentos Inteligente:**  
  Módulo de checklist dinâmico de acordo com o tipo do cliente (PF/PJ) e do serviço.
  * Marque envios como Pendente, Recebido ou Não se Aplica.
  * Upload direto de PDFs e imagens para o Google Drive do processo, com pré-visualização no próprio CRM.
  * Regras inteligentes (ex: Marcar "Não possui CNH" adiciona requisição Padrão de Identidade e CPF).

* **🏛 Delegacia e SIFAP (Serviço de Identificação de Falha de Agendamento/Processo):**  
  Controle preciso de envios de documentação física para as delegacias e anotações para entrada e reentrada de SIFAP.

* **🖨️ Protocolo Diário Automatizado:**  
  Geração em "1-clique" do relatório de Protocolo para motoristas/tarefeiros, filtrando automaticamente as placas enviadas para Delegacia ou SIFAP na data selecionada. Formatação otimizada para impressão.

* **� Módulo de Vistoria Avançado:**
  Agendamentos, Status da Vistoria e agora: **Upload Direto do Laudo de Vistoria em PDF** para a pasta da OS, com rastreabilidade de aprovação e histórico de apontamentos/reprovações.

* **� Módulo de Consulta & Dashboard:**  
  Consulte rapidamente onde está qualquer processo pela Placa e possua métricas em tempo real sobre os serviços correntes do escritório.

## 🛠 Como Executar Localmente

### Pré-requisitos
* Ter o [Node.js](https://nodejs.org/en) instalado (versão suportada recomendada: 18+).
* Chaves da Cloud Plataform (Google OAuth2) configuradas para o Google Drive REST API V3.
* Chaves do Supabase (URL e Anon Key) preenchidas no `.env.local`.

### Instalação

1. Clone o repositório ou acesse o diretório local do projeto:
```bash
cd despachante-matilde-crm
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

4. Acesse seu navegador na rota exibida no terminal (geralmente `http://localhost:5173/`).

### Instalando a Extensão Chrome
1. Com o Google Chrome aberto, digite `chrome://extensions/`.
2. Habilite o "Modo do Desenvolvedor" (canto superior direito).
3. Clique em "Carregar sem compactação" (Load unpacked).
4. Selecione a pasta `chrome-extension` presente na raiz deste projeto.

## 📁 Estrutura do Projeto

```text
├── chrome-extension/     # Extensão Chrome (background, content_scripts para o Detran).
├── src/
│   ├── components/       # Componentes React reutilizáveis (Sidebar, Kanban, Modais).
│   ├── lib/              # Integrações externas críticas.
│   │   ├── googleDrive.ts# Wrapper OAuth2 e métodos Google Drive API (Integração Direta).
│   │   ├── storage.ts    # Controladores globais do banco de dados relacional Supabase.
│   │   └── supabaseClient.ts # Config client side do Supabase.
│   ├── pages/            # Telas "Page-level" (Dashboard, OSDetail, Consulta, Protocolo).
│   ├── types.ts          # Interfaces, tipos e dicionários globais estritos.
│   ├── App.tsx           # Configuração de Rotas e Providers principais.
│   └── index.css         # Variáveis do Design System e estilos globais css-in-js.
```


// ============================================================
//  MATILDE CRM - EXTENSÃO DETRAN MG
//  content.js v2 — Arquitetura Modular por Processo
//
//  SEÇÕES:
//   1. UTILITÁRIOS              (log, banners, fetch, storage)
//   2. MÓDULO: CONFIRMAR DADOS  (central — todos os processos passam aqui)
//   3. MÓDULO: PDF GERADO       (ficha, DAE, documento final)
//   4. MÓDULO: VISTORIA ECV     (passo 1 = preencher / passo 2 = confirmar)
//   5. MÓDULO: CONSULTA LAUDO   (passo 1 = preencher / passo 2 = resultado)
//   6. MÓDULO: DOC FINAL        (baixar PDF + atualizar placa se mudou)
//   7. INICIALIZAÇÃO            (detecta URL e despacha pro módulo certo)
// ============================================================

// INJETAR SCRIPT NO CONTEXTO DA PÁGINA PARA INTERCEPTAR ERROS DO ANGULAR
// Usa arquivo separado para evitar CSP inline script violations
const interceptScript = document.createElement('script');
interceptScript.src = chrome.runtime.getURL('inject-error-interceptor.js');
interceptScript.onload = () => interceptScript.remove();
(document.head || document.documentElement).appendChild(interceptScript);

console.log('[Matilde][Init] Extensão Matilde CRM carregada em:', window.location.pathname);

// ════════════════════════════════════════════════════════════
// SEÇÃO 1 — UTILITÁRIOS
// ════════════════════════════════════════════════════════════

/**
 * Log padronizado no console.
 * Formato: [Matilde][NomeDoModulo][PassoX] mensagem
 */
function log(modulo, passo, msg, data) {
    const prefix = `[Matilde][${modulo}][${passo}]`;
    if (data !== undefined) {
        console.log(prefix, msg, data);
    } else {
        console.log(prefix, msg);
    }
}

/**
 * Exibe um banner flutuante na página do Detran.
 * @param {string} html      - Conteúdo HTML do banner
 * @param {'info'|'success'|'error'|'warning'} tipo
 * @param {number} duracaoMs - 0 = não some automaticamente
 * @returns {HTMLElement} Elemento criado (para poder remover manualmente)
 */
function showBanner(html, tipo = 'info', duracaoMs = 6000) {
    const cores = {
        info: { bg: '#3b82f6', text: '#ffffff' },
        success: { bg: '#22c55e', text: '#ffffff' },
        error: { bg: '#ef4444', text: '#ffffff' },
        warning: { bg: '#f59e0b', text: '#ffffff' },
    };
    const cor = cores[tipo] || cores.info;

    const el = document.createElement('div');
    el.style.cssText = [
        'position: fixed',
        'top: 20px',
        'right: 20px',
        `background: ${cor.bg}`,
        `color: ${cor.text}`,
        'padding: 12px 18px',
        'border-radius: 10px',
        'font-weight: bold',
        'font-size: 14px',
        'z-index: 99999',
        'box-shadow: 0 4px 12px rgba(0,0,0,0.25)',
        'max-width: 380px',
        'line-height: 1.5',
        'transition: opacity 0.4s ease',
    ].join('; ');
    el.innerHTML = html;
    document.body.appendChild(el);

    if (duracaoMs > 0) {
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 400);
        }, duracaoMs);
    }
    return el;
}

/**
 * Exibe um banner de progresso multi-etapa.
 * @param {string[]} etapas   - Ex: ['Preencher formulário', 'Confirmar vistoria']
 * @param {number}   atual    - Índice 0-based da etapa atual
 * @param {string}   modulo   - Nome do processo para exibir
 * @returns {HTMLElement}
 */
function showProgressBanner(modulo, etapas, atual) {
    const steps = etapas.map((e, i) => {
        if (i < atual) return `<span style="color:#bbf7d0">✅ ${e}</span>`;
        if (i === atual) return `<span style="color:#fef9c3">▶ ${e}</span>`;
        return `<span style="opacity:0.6">○ ${e}</span>`;
    }).join('<br>');

    const html = `🤖 <b>Matilde CRM — ${modulo}</b><br>${steps}`;
    return showBanner(html, 'info', 0);
}

/**
 * Baixa uma URL e converte para Base64 (data URI).
 * Usa credenciais do navegador para evitar CORS do Detran.
 */
async function fetchBase64(url) {
    if (url.startsWith('data:')) return url; // já é base64
    if (url.startsWith('//')) url = 'https:' + url;
    if (url.startsWith('/')) url = window.location.origin + url;

    const res = await fetch(url, { credentials: 'include' });
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Extrai placa e chassi de um texto livre usando regex.
 */
function extractVehicleInfo(text) {
    const placaMatch = text.match(/[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}/i);
    const chassiMatch = text.match(/[A-HJ-NPR-Z0-9]{17}/i);
    return {
        placa: placaMatch ? placaMatch[0].replace('-', '').toUpperCase() : '',
        chassi: chassiMatch ? chassiMatch[0].toUpperCase() : '',
    };
}

/**
 * Salva dados no chrome.storage.local (merge com o que já existe).
 */
async function saveContext(dados) {
    return new Promise(resolve => chrome.storage.local.set(dados, resolve));
}

/**
 * Lê dados do chrome.storage.local.
 */
async function getContext(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

/**
 * Envia uma mensagem ao background.js e aguarda resposta.
 */
async function sendToBackground(action, payload) {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ action, payload }, (resp) => {
            if (chrome.runtime.lastError) {
                console.warn('[Matilde] Erro ao enviar mensagem:', chrome.runtime.lastError.message);
                resolve(null);
            } else {
                resolve(resp);
            }
        });
    });
}

/**
 * Preenche um input e dispara os eventos necessários para o Angular/React do Detran reconhecer.
 */
function fillInput(selector, valor) {
    const el = document.querySelector(selector);
    if (el && valor && !el.value) {
        el.value = valor;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }
    return false;
}

/**
 * Monitora mudanças no DOM e chama callback até ela retornar true.
 * Para automaticamente após maxMs milissegundos.
 */
function watchDOM(callback, maxMs = 15000) {
    if (callback()) return; // tenta imediatamente

    const observer = new MutationObserver(() => {
        if (callback()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    if (maxMs > 0) {
        setTimeout(() => observer.disconnect(), maxMs);
    }
    return observer;
}


// ════════════════════════════════════════════════════════════
// SEÇÃO 2 — MÓDULO: CONFIRMAR DADOS
//
// Dispara quando o Detran exibe a tela de confirmação de dados
// de QUALQUER serviço (/confirmar-dados, /confirmacao-de-dados, etc.)
//
// PASSO 1 — Aguarda o DOM carregar completamente
// PASSO 2 — Extrai estrutura <dt>/<dd> + inputs ocultos do formulário
// PASSO 3 — Monta o payload com todos os dados do veículo e do cliente
// PASSO 4 — Salva o texto bruto no storage (fallback para o PDF)
// PASSO 5 — Envia pro CRM (ação: CAPTURED_CONFIRMAR_DADOS)
//            O CRM vai: verificar cliente duplicado → criar/associar OS
// PASSO 6 — Exibe banner com resultado
// ════════════════════════════════════════════════════════════

function modConfirmarDados() {
    const url = window.location.href;
    const isConfirmar = url.includes('confirmar-dados') || url.includes('confirmacao-de-dados');
    if (!isConfirmar) return;

    log('ConfirmarDados', 'Passo1', 'Página de confirmação detectada. Aguardando DOM...');

    // Limpa CPF da sessão anterior ANTES de extrair — evita contaminar com dados antigos
    chrome.storage.local.remove(['matilde_cpfCnpj'], () => {
        log('ConfirmarDados', 'Passo1', 'CPF da sessão anterior limpo do storage.');
    });

    const banner = showBanner('🤖 <b>Matilde CRM:</b> Lendo dados da tela de confirmação...', 'info', 0);

    setTimeout(async () => {
        // ── PASSO 2: Extração via <dt>/<dd> (padrão Detran MG) ──────────────
        log('ConfirmarDados', 'Passo2', 'Extraindo dados via <dt>/<dd> e inputs...');

        const dts = document.querySelectorAll('dt');
        let camposDt = {};
        dts.forEach(dt => {
            const label = dt.innerText.trim().toLowerCase();
            const value = dt.nextElementSibling ? dt.nextElementSibling.innerText.trim() : '';
            camposDt[label] = value;
        });

        // Extração via inputs do formulário (campos ocultos do Detran)
        let formData = {};
        document.querySelectorAll('input').forEach(input => {
            if (input.name && input.value) {
                formData[input.name.toLowerCase()] = input.value;
            }
        });

        // Extrai título/serviço da página
        const titleEl = document.querySelector('h1, h2, .titulo-servico-detran, .page-title');
        const servicoTitulo = titleEl ? titleEl.innerText.trim() : '';

        // Procura os blocos específicos (Adquirente / Anterior)
        const dtsArray = Array.from(document.querySelectorAll('dt'));
        let cpfAdquirente = camposDt['cpf ou cnpj'] || formData['cpf_cnpj_adquirente'] || formData['cpf_cnpj_financiado'] || '';
        let cpfVendedor = camposDt['cpf/cnpj'] || formData['cpf_cnpj'] || '';

        // Tenta refinar a busca pelo container pai para não misturar os dois
        dtsArray.forEach(dt => {
            const dtText = dt.innerText.trim().toLowerCase();
            const parentBlock = dt.closest('.containder, .card, fieldset, section');
            const parentText = parentBlock ? parentBlock.innerText.toLowerCase() : '';
            const ddText = dt.nextElementSibling ? dt.nextElementSibling.innerText.trim() : '';

            if (dtText.includes('cpf')) {
                if (parentText.includes('adquirente') || parentText.includes('comprador')) {
                    cpfAdquirente = ddText;
                } else if (parentText.includes('proprietário anterior') || parentText.includes('vendedor')) {
                    cpfVendedor = ddText;
                }
            }
        });

        // ── PASSO 3: Monta payload estruturado ────────────────────────────────
        log('ConfirmarDados', 'Passo3', 'Montando payload...');

        const extractedData = {
            chassi: camposDt['chassi'] || formData['chassi'] || '',
            placa: camposDt['placa'] || formData['placa'] || '',
            renavam: camposDt['renavam'] || formData['renavam'] || '',
            cpfCnpj: cpfAdquirente || cpfVendedor || '',
            cpfCnpjAdquirente: cpfAdquirente,
            cpfCnpjVendedor: cpfVendedor,
            nomeProprietario: camposDt['nome'] || formData['nome_financiado'] ||
                formData['nome_adquirente'] || formData['nome'] || '',
            nomeAdquirente: formData['nome_adquirente'] || formData['nome_financiado'] || '',
            marcaModelo: camposDt['marca/modelo'] || camposDt['marca / modelo'] ||
                formData['codigo_marca_modelo'] || '',
            anoFabricacao: camposDt['ano fabricação'] || camposDt['ano de fabricação'] || '',
            anoModelo: camposDt['ano modelo'] || camposDt['ano do modelo'] || '',
            cor: camposDt['cor'] || '',
            especie: camposDt['espécie'] || camposDt['especie'] || '',
            combustivel: camposDt['combustível'] || camposDt['combustivel'] || '',
            servicoTitulo,
        };

        log('ConfirmarDados', 'Passo3', 'Dados extraídos:', extractedData);

        // ── PASSO 4: Salva texto bruto como fallback ─────────────────────────
        let pageText = document.body.innerText + '\n\n--- INPUTS OCULTOS ---\n';
        Object.entries(formData).forEach(([k, v]) => { pageText += `${k.toUpperCase()}: ${v}\n`; });

        await saveContext({ matilde_confirmar_dados_text: pageText });
        log('ConfirmarDados', 'Passo4', 'Texto bruto salvo no storage como fallback.');

        // ── PASSO 5: Envia para o CRM ────────────────────────────────────────
        log('ConfirmarDados', 'Passo5', 'Enviando dados para o CRM...');

        const ctx = await getContext(['matilde_servico_ativo', 'matilde_osId']);

        const payload = {
            ...extractedData,
            crmServico: ctx.matilde_servico_ativo || null,
            osId: ctx.matilde_osId || null,
            confirmarDadosText: pageText,
        };

        const resp = await sendToBackground('CAPTURED_CONFIRMAR_DADOS', payload);

        // ── PASSO 6: Exibe resultado ─────────────────────────────────────────
        banner.remove();
        if (resp && (resp.success || resp.status === 'SUCCESS')) {
            log('ConfirmarDados', 'Passo6', '✅ Dados enviados ao CRM com sucesso!', resp);
            if (resp.osId) {
                await saveContext({ matilde_osId: resp.osId });
                log('ConfirmarDados', 'Passo6', 'ID da OS salvo no contexto:', resp.osId);
            }
            // Limpa TODOS os dados da sessão para não contaminar a próxima OS
            chrome.storage.local.remove([
                'matilde_cpfCnpj', 'matilde_placa', 'matilde_chassi',
                'matilde_servico_ativo', 'matilde_confirmar_dados_text',
                'matilde_osId', 'matilde_renavam', 'matilde_crv'
            ]);
            log('ConfirmarDados', 'Passo6', 'Contexto da sessão limpo do storage.');
            showBanner('✅ <b>Matilde CRM:</b> Dados lidos e OS criada/atualizada no sistema!', 'success', 7000);
        } else {
            log('ConfirmarDados', 'Passo6', '⚠️ CRM não respondeu. Dados salvos localmente.', resp);
            showBanner('🔵 <b>Matilde CRM:</b> Dados lidos. Abra o CRM para sincronizar.', 'warning', 8000);
        }

        // Se for Primeiro Emplacamento, fecha o modal de atenção que o Detran abre
        if (ctx.matilde_servico_ativo === 'primeiro_emplacamento') {
            watchDOM(() => {
                const okBtn = Array.from(document.querySelectorAll('button'))
                    .find(b => b.textContent.trim().toLowerCase() === 'ok');
                if (okBtn) {
                    log('ConfirmarDados', 'Extra', 'Modal de atenção detectado, clicando em OK.');
                    okBtn.click();
                    return true;
                }
                return false;
            });
        }

    }, 2000);
}


// ════════════════════════════════════════════════════════════
// SEÇÃO 3 — MÓDULO: PDF GERADO (Ficha, DAE, Documento Genérico)
//
// Roda em qualquer página do Detran e monitora o aparecimento
// de um PDF (iframe/embed/link) para capturá-lo automaticamente.
//
// PASSO 1 — Inicia watchDOM aguardando elemento de PDF no DOM
// PASSO 2 — Ao detectar um PDF válido, lê o src/href
// PASSO 3 — Baixa o arquivo e converte para Base64
// PASSO 4 — Envia ao CRM (ação: CAPTURED_DETRAN_PDF)
//            O CRM lerá o crmServico e saberá em qual pasta do Drive salvar
// PASSO 5 — Exibe banner de resultado
// ════════════════════════════════════════════════════════════

function modCapturaPDF() {
    // Não roda em páginas que já têm módulos específicos para PDF
    const url = window.location.href;
    const isLaudoResult = url.includes('exibir-resultado');
    if (isLaudoResult) return; // o módulo de laudo cuida disso

    // Não roda no cidadao.mg.gov.br — o módulo CRLV Digital cuida
    if (url.includes('cidadao.mg.gov.br')) return;

    // Não roda em páginas de confirmação de dados — evita captura indevida
    if (url.includes('confirmar-dados') || url.includes('confirmacao-de-dados')) return;

    log('CapturaPDF', 'Passo1', 'Monitor de PDF iniciado.');

    let jaCapturou = false;

    function tentarCapturar() {
        if (jaCapturou) return true;

        // Busca iframe ou embed com PDF real (src != about:blank)
        const pdfEl = document.querySelector(
            'iframe[type="application/pdf"], embed[type="application/pdf"], ' +
            'embed[src*=".pdf"], iframe[src*=".pdf"], object[data*=".pdf"], ' +
            'embed[src*="visualizar"], embed[src*="emitir"]'
        );

        if (pdfEl) {
            const src = pdfEl.getAttribute('src') || pdfEl.getAttribute('data') || '';
            if (src && src !== 'about:blank' && src !== '') {
                log('CapturaPDF', 'Passo2', 'PDF encontrado no iframe/embed:', src);
                jaCapturou = true;
                _baixarEEnviar(src);
                return true;
            }
        }

        // Busca links <a> com PDF ou texto de download
        const linkPdf = Array.from(document.querySelectorAll('a[href]')).find(a => {
            const href = a.href.toLowerCase();
            const txt = a.innerText.toLowerCase();
            if (href.includes('javascript:') || href === window.location.href) return false;

            // Modal DAE
            if (a.id === 'link-pdf-dae' && href.startsWith('data:application/pdf')) return true;

            return href.includes('.pdf') ||
                txt.includes('imprimir dae') ||
                txt.includes('emitir ficha') ||
                txt.includes('gerar pdf') ||
                txt.includes('download');
        });

        if (linkPdf && !linkPdf.dataset.matildeCaptured) {
            linkPdf.dataset.matildeCaptured = 'true';
            log('CapturaPDF', 'Passo2', 'Link de PDF encontrado:', linkPdf.href.substring(0, 100)); // Limita o len pra não travar console com base64
            jaCapturou = true;
            _baixarEEnviar(linkPdf.href);
            return true;
        }

        return false;
    }

    async function _baixarEEnviar(src) {
        // ── PASSO 3: Baixar e converter ──────────────────────────────────────
        log('CapturaPDF', 'Passo3', 'Baixando PDF e convertendo para Base64...');
        const banner = showBanner('⏳ <b>Matilde CRM:</b> Baixando documento do Detran...', 'info', 0);

        const ctx = await getContext([
            'matilde_servico_ativo', 'matilde_placa', 'matilde_chassi', 'matilde_confirmar_dados_text', 'matilde_osId'
        ]);
        const placa = ctx.matilde_placa || extractVehicleInfo(document.body.innerText).placa;
        const chassi = ctx.matilde_chassi || extractVehicleInfo(document.body.innerText).chassi;
        const crmServico = ctx.matilde_servico_ativo || 'generico';
        const fileName = `${crmServico}_${placa || chassi || Date.now()}.pdf`;

        let base64;
        try {
            base64 = await fetchBase64(src);
        } catch (e) {
            log('CapturaPDF', 'Passo3', '❌ Erro ao baixar PDF:', e);
            banner.remove();
            showBanner('❌ <b>Matilde CRM:</b> Não foi possível baixar o PDF.', 'error', 8000);
            return;
        }

        // ── PASSO 4: Envia ao CRM ────────────────────────────────────────────
        log('CapturaPDF', 'Passo4', 'Enviando PDF ao CRM...');

        const resp = await sendToBackground('CAPTURED_DETRAN_PDF', {
            fileUrl: base64,
            fileName,
            placa,
            chassi,
            crmServico,
            osId: ctx.matilde_osId || null,
            confirmarDadosText: ctx.matilde_confirmar_dados_text || null,
        });

        // ── PASSO 5: Banner de resultado ─────────────────────────────────────
        banner.remove();
        if (resp && resp.success) {
            log('CapturaPDF', 'Passo5', '✅ PDF enviado ao CRM com sucesso!');
            showBanner('✅ <b>Matilde CRM:</b> Documento enviado e salvo no Drive!', 'success', 8000);
            // Limpa TODOS os dados da sessão após envio do PDF
            chrome.storage.local.remove([
                'matilde_servico_ativo', 'matilde_placa', 'matilde_chassi',
                'matilde_cpfCnpj', 'matilde_confirmar_dados_text',
                'matilde_osId', 'matilde_renavam', 'matilde_crv'
            ]);
        } else {
            log('CapturaPDF', 'Passo5', '⚠️ CRM não recebeu o PDF.', resp);
            showBanner('❌ <b>Matilde CRM:</b> CRM fechado. Abra-o e tente novamente.', 'error', 10000);
        }
    }

    watchDOM(tentarCapturar, 0); // 0 = Sem limite de tempo (timeout infinito) para pegar modais que abrem mais tarde
}


// ════════════════════════════════════════════════════════════
// SEÇÃO 4 — MÓDULO: VISTORIA ECV
//
// PASSO 1 — Auto-preenchimento (página de agendamento)
//   ├─ Lê placa, chassi, cpfCnpj, nome, telefone, email, serviço da URL/storage
//   ├─ Preenche os campos do formulário
//   └─ Exibe "Passo 1 de 2: Dados preenchidos!"
//
// PASSO 2 — Captura da confirmação (página /confirmar)
//   ├─ Extrai data, hora, local da ECV, placa, chassi das tags <dt>/<dd>
//   ├─ Recupera osId do storage
//   ├─ Envia ao CRM (ação: CAPTURED_VISTORIA_ECV)
//   └─ Exibe "Passo 2 de 2: Vistoria salva na OS! ✅"
// ════════════════════════════════════════════════════════════

function modVistoriaECV() {
    const url = window.location.href;
    const isAgendamento = url.includes('agendamento-ou-reagendamento-de-vistoria-na-ecv') && !url.includes('/confirmar');
    const isConfirmacao = url.includes('agendamento-ou-reagendamento-de-vistoria-na-ecv') && url.includes('/confirmar');

    // ── PASSO 1: Auto-preenchimento ──────────────────────────────────────────
    if (isAgendamento) {
        log('VistoriaECV', 'Passo1', 'Página de agendamento detectada. Iniciando preenchimento...');
        const progressBanner = showProgressBanner('Vistoria ECV', ['Preencher formulário', 'Confirmar agendamento'], 0);

        const urlParams = new URLSearchParams(window.location.search);
        const placa = urlParams.get('placa');
        const chassi = urlParams.get('chassi');
        const cpfCnpj = urlParams.get('cpfCnpj');
        const tipoDoc = urlParams.get('tipoDoc');
        const nome = urlParams.get('nome');
        const telefone = urlParams.get('telefone');
        const email = urlParams.get('email');
        const servico = urlParams.get('servico');
        const osId = urlParams.get('osId');

        // Salva osId e contexto para os próximos passos
        if (osId || placa || chassi) {
            saveContext({
                matilde_osId: osId || '',
                matilde_placa: placa || '',
                matilde_chassi: chassi || '',
                matilde_cpfCnpj: cpfCnpj || '',
                matilde_servico_ativo: 'vistoria_ecv',
            });
        }

        setTimeout(() => {
            let preenheu = false;

            // Placa
            preenheu |= fillInput('input[name="placa"], input[id*="placa" i]', placa);
            // Chassi
            preenheu |= fillInput('input[name="chassi"], input[id*="chassi" i]', chassi);
            // Nome
            preenheu |= fillInput('input[name*="nome" i], input[id*="nome" i]', nome);
            // Telefone
            preenheu |= fillInput('input[name*="telefone" i], input[name*="celular" i], input[id*="telefone" i]', telefone);

            // E-mail (pode ter dois campos — confirmação)
            if (email) {
                document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]').forEach(el => {
                    if (!el.value) {
                        el.value = email;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        preenheu = true;
                    }
                });
            }

            // CPF/CNPJ: seleciona o tipo no select e preenche
            if (cpfCnpj && tipoDoc) {
                const selTipoDoc = document.querySelector('select[name="tipo_documento_proprietario_id"]');
                if (selTipoDoc) {
                    if (tipoDoc === 'CPF') selTipoDoc.value = '1';
                    else if (tipoDoc === 'CNPJ') selTipoDoc.value = '2';
                    selTipoDoc.dispatchEvent(new Event('change', { bubbles: true }));
                }

                setTimeout(() => {
                    fillInput('input[name*="cpf" i]:not([type="radio"]), input[id*="cpf" i]:not([type="radio"])', cpfCnpj);
                }, 800);
            }

            // Serviço/Motivo em <select>
            if (servico) {
                const sel = document.querySelector('select[name*="motivo" i], select[id*="motivo" i], select[name*="servico" i]');
                if (sel) {
                    const opt = Array.from(sel.options).find(o =>
                        o.text.toLowerCase().includes(servico.toLowerCase())
                    );
                    if (opt && !sel.value) {
                        sel.value = opt.value;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                        preenheu = true;
                    }
                }
            }

            if (preenheu) {
                log('VistoriaECV', 'Passo1', '✅ Formulário preenchido!');
                progressBanner.remove();
                showProgressBanner('Vistoria ECV', ['✅ Formulário preenchido', 'Confirmar agendamento'], 1);
            }
        }, 1200);
    }

    // ── PASSO 2: Captura da confirmação ──────────────────────────────────────
    if (isConfirmacao) {
        log('VistoriaECV', 'Passo2', 'Tela de confirmação detectada. Extraindo dados...');
        const banner = showBanner('🤖 <b>Matilde CRM:</b> Salvando dados da vistoria na OS...', 'info', 0);

        setTimeout(async () => {
            const dts = document.querySelectorAll('dt');
            let dataVistoria = '', horaVistoria = '', localVistoria = '', protocolo = '';
            let placa = '', chassi = '', cpfCnpj = '', nome = '';

            dts.forEach(dt => {
                const label = dt.innerText.trim().toLowerCase();
                const value = dt.nextElementSibling ? dt.nextElementSibling.innerText.trim() : '';

                if (label.includes('data')) dataVistoria = value;
                else if (label.includes('hora')) horaVistoria = value;
                else if (label.includes('empresa')) localVistoria = value;
                else if (label.includes('placa')) placa = value;
                else if (label.includes('chassi')) chassi = value;
                else if (label.includes('cpf/cnpj')) cpfCnpj = value;
                else if (label.includes('nome')) nome = value;
                else if (label.includes('protocolo')) protocolo = value;
            });

            const ctx = await getContext(['matilde_osId', 'matilde_placa', 'matilde_chassi']);
            placa = placa || ctx.matilde_placa;
            chassi = chassi || ctx.matilde_chassi;
            const osId = ctx.matilde_osId || null;

            log('VistoriaECV', 'Passo2', 'Dados capturados:', { dataVistoria, horaVistoria, localVistoria, protocolo, placa });

            const resp = await sendToBackground('CAPTURED_VISTORIA_ECV', {
                osId, placa, chassi, cpfCnpj, nome,
                dataVistoria, horaVistoria, localVistoria, protocolo
            });

            banner.remove();
            if (resp && resp.success) {
                log('VistoriaECV', 'Passo2', '✅ Vistoria salva na OS!');
                showBanner('✅ <b>Matilde CRM:</b> Vistoria salva na Ordem de Serviço!', 'success', 8000);
            } else {
                log('VistoriaECV', 'Passo2', '⚠️ CRM não respondeu.', resp);
                showBanner('❌ <b>Matilde CRM:</b> Erro ao salvar vistoria. Verifique se o CRM está aberto.', 'error', 10000);
            }
        }, 1500);
    }
}


// ════════════════════════════════════════════════════════════
// SEÇÃO 5 — MÓDULO: CONSULTA DE LAUDO
//
// PASSO 1 — Auto-preenchimento (página de consulta)
//   ├─ Lê chassi e cpfCnpj da URL
//   ├─ Salva no storage (osNumero, placa, chassi)
//   └─ Exibe "Passo 1 de 2: Dados preenchidos. Clique em Consultar."
//
// PASSO 2 — Resultado da consulta (página exibir-resultado)
//   ├─ watchDOM aguarda resultado aparecer
//   ├─ Detecta status: APROVADO / COM APONTAMENTO / REPROVADO
//   ├─ Se PDF disponível: baixa e envia ao CRM
//   ├─ Envia status do laudo ao CRM (ação: CAPTURED_LAUDO_PDF)
//   └─ Exibe "Passo 2 de 2: Laudo [STATUS] salvo na OS!"
// ════════════════════════════════════════════════════════════

function modConsultaLaudo() {
    const url = window.location.href;
    const isFormConsulta = url.includes('consulta-de-laudo-da-vistoria') && !url.includes('exibir-resultado');
    const isResultado = url.includes('exibir-resultado') || (url.includes('consulta-de-laudo') && url.includes('resultado'));

    // ── PASSO 1: Auto-preenchimento ──────────────────────────────────────────
    if (isFormConsulta) {
        log('ConsultaLaudo', 'Passo1', 'Formulário de consulta detectado. Preenchendo...');
        const progressBanner = showProgressBanner('Consulta de Laudo', ['Preencher campos', 'Ver resultado do laudo'], 0);

        const urlParams = new URLSearchParams(window.location.search);
        const chassi = urlParams.get('chassi');
        const cpfCnpj = urlParams.get('cpfCnpj');
        const osNumero = urlParams.get('osNumero');
        const placa = urlParams.get('placa');
        const osId = urlParams.get('osId');

        // Salva contexto para a próxima página (exibir-resultado)
        saveContext({
            matilde_laudo_chassi: chassi || '',
            matilde_laudo_osNumero: osNumero || '',
            matilde_laudo_placa: placa || '',
            matilde_laudo_osId: osId || '',
        });

        setTimeout(() => {
            let preencheu = false;
            preencheu |= fillInput('#chassi, input[name="chassi"]', chassi);
            preencheu |= fillInput('#cpf-cnpj-adquirente, input[name="cpf_cnpj_adquirente"], input[name*="cpf" i]', cpfCnpj);

            if (preencheu) {
                log('ConsultaLaudo', 'Passo1', '✅ Campos preenchidos!');
                progressBanner.remove();
                showProgressBanner('Consulta de Laudo', ['✅ Campos preenchidos', 'Ver resultado do laudo'], 1);
            }
        }, 1000);
    }

    // ── PASSO 2: Resultado ───────────────────────────────────────────────────
    if (isResultado) {
        log('ConsultaLaudo', 'Passo2', 'Página de resultado detectada. Aguardando laudo...');

        getContext(['matilde_laudo_chassi', 'matilde_laudo_osNumero', 'matilde_laudo_placa', 'matilde_laudo_osId']).then(ctx => {
            const chassi = ctx.matilde_laudo_chassi || '';
            const osNumero = ctx.matilde_laudo_osNumero || '';
            let placa = ctx.matilde_laudo_placa || '';
            const osId = ctx.matilde_laudo_osId || null;

            const waitBanner = showBanner('🔍 <b>Matilde CRM:</b> Aguardando resultado do laudo...', 'info', 0);

            let jaProcessou = false;

            function detectarResultado() {
                if (jaProcessou) return true;

                // ── Detecta status via tabela de resultados ──
                const tabela = document.querySelector('table.table tbody tr');
                let statusLaudo = '';
                let placaDaTabela = '';

                if (tabela) {
                    const tds = tabela.querySelectorAll('td');
                    if (tds.length >= 2) {
                        placaDaTabela = (tds[0].innerText || '').trim();
                        const resultadoTexto = (tds[1].innerText || '').trim().toUpperCase();

                        if (resultadoTexto.includes('APROVADO COM APONTAMENTO') || resultadoTexto.includes('COM APONTAMENTO')) {
                            statusLaudo = 'COM_APONTAMENTO';
                        } else if (resultadoTexto.includes('REPROVADO')) {
                            statusLaudo = 'REPROVADO';
                        } else if (resultadoTexto.includes('APROVADO')) {
                            statusLaudo = 'APROVADO';
                        }
                    }
                }

                // Fallback: detecta via texto geral da página
                if (!statusLaudo) {
                    const textoPage = document.body.innerText.toUpperCase();
                    if (textoPage.includes('APROVADO COM APONTAMENTO') || textoPage.includes('COM APONTAMENTO')) {
                        statusLaudo = 'COM_APONTAMENTO';
                    } else if (textoPage.includes('REPROVADO')) {
                        statusLaudo = 'REPROVADO';
                    } else if (textoPage.includes('APROVADO')) {
                        statusLaudo = 'APROVADO';
                    }
                }

                if (!statusLaudo) return false; // Ainda não carregou resultado

                // Usa a placa da tabela se não tiver do context
                if (!placa && placaDaTabela) placa = placaDaTabela;

                log('ConsultaLaudo', 'Passo2', 'Resultado detectado:', { statusLaudo, placa: placaDaTabela });

                jaProcessou = true;
                waitBanner.remove();

                const label = placa || chassi || 'documento';
                const fileName = osNumero
                    ? `LAUDO_VISTORIA_OS${osNumero}_${label}.pdf`
                    : `LAUDO_VISTORIA_${label}.pdf`;

                // ── Tenta abrir o PDF via link do modal ──
                const pdfLink = document.querySelector('a.visualizar-laudo');
                if (pdfLink) {
                    log('ConsultaLaudo', 'Passo2', 'Clicando no link do PDF para abrir modal...');
                    pdfLink.click();

                    // Aguarda o PDF aparecer dentro do modal
                    let tentativas = 0;
                    const maxTentativas = 30; // 30 x 500ms = 15s
                    const intervalo = setInterval(() => {
                        tentativas++;
                        const pdfEl = document.querySelector(
                            '.modal embed[type="application/pdf"], .modal iframe[src*=".pdf"], ' +
                            '.modal embed[src*="visualizar-laudo"], .modal embed.pdf-viewer, ' +
                            'embed[type="application/pdf"], embed[src*="visualizar-laudo"], ' +
                            'iframe[src*=".pdf"], iframe[type="application/pdf"], embed[src*=".pdf"]'
                        );

                        if (pdfEl) {
                            let src = pdfEl.getAttribute('src') || '';
                            if (src && src !== 'about:blank') {
                                clearInterval(intervalo);
                                log('ConsultaLaudo', 'Passo2', '✅ PDF encontrado no modal:', src.substring(0, 80));
                                _processarResultadoLaudo(src, fileName, statusLaudo, osId, chassi, placa, osNumero);
                                return;
                            }
                        }

                        if (tentativas >= maxTentativas) {
                            clearInterval(intervalo);
                            log('ConsultaLaudo', 'Passo2', '⚠️ PDF não carregou no modal após 15s. Enviando apenas o status.');
                            _processarResultadoLaudo(null, fileName, statusLaudo, osId, chassi, placa, osNumero);
                        }
                    }, 500);
                } else {
                    // Sem link de PDF — tenta achar embed direto na página
                    const pdfEl = document.querySelector(
                        'embed.pdf-viewer, embed[src*="visualizar-laudo"], embed[type="application/pdf"], ' +
                        'iframe[src*=".pdf"], iframe[type="application/pdf"], embed[src*=".pdf"]'
                    );

                    if (pdfEl) {
                        let src = pdfEl.getAttribute('src') || '';
                        if (src === 'about:blank' || src === '') {
                            const attrObs = new MutationObserver(() => {
                                src = pdfEl.getAttribute('src') || '';
                                if (src && src !== 'about:blank') {
                                    attrObs.disconnect();
                                    _processarResultadoLaudo(src, fileName, statusLaudo, osId, chassi, placa, osNumero);
                                }
                            });
                            attrObs.observe(pdfEl, { attributes: true, attributeFilter: ['src'] });
                        } else {
                            _processarResultadoLaudo(src, fileName, statusLaudo, osId, chassi, placa, osNumero);
                        }
                    } else {
                        // Só status, sem PDF
                        _processarResultadoLaudo(null, fileName, statusLaudo, osId, chassi, placa, osNumero);
                    }
                }
                return true;
            }

            watchDOM(detectarResultado, 30000);
        });
    }

    async function _processarResultadoLaudo(src, fileName, statusLaudo, osId, chassi, placa, osNumero) {
        log('ConsultaLaudo', 'Passo2B', 'Processando resultado:', { statusLaudo, src });

        let base64 = null;

        if (src) {
            try {
                base64 = await fetchBase64(src);
                // Não baixa localmente — o PDF será anexado direto na OS pelo CRM
                log('ConsultaLaudo', 'Passo2B', '✅ PDF do laudo capturado para envio ao CRM.');
            } catch (e) {
                log('ConsultaLaudo', 'Passo2B', '⚠️ Não foi possível capturar PDF:', e);
            }
        }

        const resp = await sendToBackground('CAPTURED_LAUDO_PDF', {
            fileUrl: base64 || null,
            fileName: fileName || null,
            chassi: chassi || '',
            placa: placa || '',
            osNumero: osNumero || '',
            osId: osId || null,
            statusLaudo: statusLaudo || 'DESCONHECIDO',
        });

        const statusLabel = {
            APROVADO: '✅ APROVADO',
            COM_APONTAMENTO: '⚠️ APROVADO COM APONTAMENTO',
            REPROVADO: '❌ REPROVADO',
            DESCONHECIDO: '❓ Status não identificado',
        }[statusLaudo] || statusLaudo;

        if (resp && resp.success) {
            log('ConsultaLaudo', 'Passo2B', '✅ Laudo salvo na OS!');
            showBanner(`✅ <b>Matilde CRM:</b> Laudo <b>${statusLabel}</b> — salvo na OS!`, 'success', 10000);
            chrome.storage.local.remove(['matilde_laudo_chassi', 'matilde_laudo_osNumero', 'matilde_laudo_placa', 'matilde_laudo_osId']);
        } else {
            log('ConsultaLaudo', 'Passo2B', '⚠️ CRM não respondeu.', resp);
            showBanner(`🔵 <b>Matilde CRM:</b> Laudo ${statusLabel}. Abra o CRM para registrar.`, 'warning', 10000);
        }
    }
}


// ════════════════════════════════════════════════════════════
// SEÇÃO 6 — MÓDULO: DOCUMENTO FINAL / PLACA ALTERADA
//
// Roda na página de emissão do documento final (CRLV, etc.)
//
// PASSO 1 — Detecta página de emissão de documento final
// PASSO 2 — Verifica se a placa exibida é diferente da salva no storage
//            (ex: placa antiga → placa Mercosul nova)
// PASSO 3 — Se mudou: envia UPDATE_PLACA ao CRM
// PASSO 4 — Captura o PDF do documento final (via modCapturaPDF)
// PASSO 5 — CRM salva na pasta correta do Drive e atualiza a OS
// ════════════════════════════════════════════════════════════

function modDocumentoFinal() {
    const url = window.location.href;
    // Páginas de documento final conhecidas:
    const isDocFinal = url.includes('emitir-crlv') || url.includes('documento-de-identificacao') ||
        url.includes('emitir-documento') || url.includes('gerar-documento');
    if (!isDocFinal) return;

    log('DocFinal', 'Passo1', 'Página de documento final detectada.');

    setTimeout(async () => {
        const ctx = await getContext(['matilde_placa', 'matilde_osId']);
        const placaSalva = ctx.matilde_placa || '';
        const osId = ctx.matilde_osId || null;

        // ── PASSO 2: Verifica se a placa mudou ───────────────────────────────
        const { placa: placaNaPagina } = extractVehicleInfo(document.body.innerText);

        if (placaNaPagina && placaSalva && placaNaPagina !== placaSalva) {
            log('DocFinal', 'Passo2', `Placa alterada detectada: ${placaSalva} → ${placaNaPagina}`);

            // ── PASSO 3: Notifica o CRM ──────────────────────────────────────
            const resp = await sendToBackground('UPDATE_PLACA', {
                osId,
                placaAntiga: placaSalva,
                placaNova: placaNaPagina,
            });

            if (resp && resp.success) {
                showBanner(`🔄 <b>Matilde CRM:</b> Placa atualizada: ${placaSalva} → <b>${placaNaPagina}</b>`, 'warning', 10000);
                // Atualiza o contexto local
                await saveContext({ matilde_placa: placaNaPagina });
                log('DocFinal', 'Passo3', '✅ Placa atualizada no CRM!');
            } else {
                log('DocFinal', 'Passo3', '⚠️ CRM não respondeu à atualização de placa.', resp);
            }
        }

        // PASSO 4 e 5 são feitos pela modCapturaPDF() que já está rodando em paralelo
        log('DocFinal', 'Passo4', 'PDF do documento final será capturado pelo módulo CapturaPDF.');
    }, 2000);
}


// ════════════════════════════════════════════════════════════
// SEÇÃO 7 — MÓDULO: AUTO-PREENCHIMENTO GENÉRICO
//
// Roda em qualquer página do Detran com parâmetros na URL
// (crm_servico=xxx&placa=xxx&chassi=xxx&cpfCnpj=xxx).
// Usado como ponto de entrada quando o CRM dispara uma ação.
//
// PASSO 1 — Detecta parâmetros da URL vindos do CRM
// PASSO 2 — Salva contexto no storage para as próximas páginas
// PASSO 3 — Preenche os campos disponíveis na página atual
// ════════════════════════════════════════════════════════════

function modAutoPreenchimentoGenerico() {
    // Na tela de confirmar-dados o Detran já preenche tudo — não interferir com CPF antigo do storage
    if (window.location.href.includes('confirmar-dados') || window.location.href.includes('confirmacao-de-dados')) {
        log('AutoFill', 'Skip', 'Página de confirmação detectada — auto-preenchimento desativado para evitar CPF antigo.');
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const crmServico = urlParams.get('crm_servico');

    // Só salva contexto se o CRM iniciou o processo agora (tem crm_servico na URL)
    if (crmServico) {
        log('AutoFill', 'Passo1', 'Parâmetros do CRM detectados na URL. Salvando contexto...', crmServico);
        saveContext({
            matilde_servico_ativo: crmServico,
            matilde_placa: urlParams.get('placa') || '',
            matilde_chassi: urlParams.get('chassi') || '',
            matilde_cpfCnpj: urlParams.get('cpfCnpj') || '',
            matilde_osId: urlParams.get('osId') || '',
        });
    }

    // Lê contexto do storage (funciona mesmo sem parâmetros na URL — próximas páginas)
    getContext(['matilde_servico_ativo', 'matilde_placa', 'matilde_chassi', 'matilde_cpfCnpj']).then(ctx => {
        if (!ctx.matilde_servico_ativo && !ctx.matilde_placa && !ctx.matilde_chassi) return;

        log('AutoFill', 'Passo2', 'Contexto ativo detectado, tentando preencher formulário...');

        setTimeout(() => {
            let preencheu = false;
            preencheu |= fillInput('input[name="placa"], input[name*="placa" i], input[id*="placa" i]', ctx.matilde_placa);
            preencheu |= fillInput('input[name="chassi"], input[name*="chassi" i], input[id*="chassi" i]', ctx.matilde_chassi);

            const cpfDigits = (ctx.matilde_cpfCnpj || '').replace(/\D/g, '');
            const radioCpf = document.querySelector('input[type="radio"][value="cpf" i]');
            const radioCnpj = document.querySelector('input[type="radio"][value="cnpj" i]');
            if (cpfDigits.length === 11 && radioCpf) radioCpf.click();
            else if (cpfDigits.length === 14 && radioCnpj) radioCnpj.click();

            setTimeout(() => {
                preencheu |= fillInput(
                    'input[name*="cpf" i]:not([type="radio"]), input[id*="cpf" i]:not([type="radio"])',
                    ctx.matilde_cpfCnpj
                );
            }, 800);

            if (preencheu) {
                log('AutoFill', 'Passo3', '✅ Formulário preenchido automaticamente.');
                showBanner('✨ <b>Matilde CRM:</b> Formulário preenchido via integração!', 'success', 5000);
            }
        }, 1200);
    });
}



// ════════════════════════════════════════════════════════════
// SEÇÃO 8 — MÓDULO: CRLV DIGITAL (cidadao.mg.gov.br)
//
// Auto-preenche o formulário de consulta do CRLV Digital
// quando aberto pelo CRM com parâmetros na URL.
//
// PASSO 1 — Detecta parâmetros matilde_* na URL
// PASSO 2 — Salva no storage para sobreviver à navegação do SPA Angular
// PASSO 3 — Aguarda os inputs do formulário aparecerem no DOM
// PASSO 4 — Preenche CPF/CNPJ, Placa, Renavam e CRV
// PASSO 5 — Exibe banner de sucesso
// ════════════════════════════════════════════════════════════

function modCrlvDigital() {
    if (!window.location.hostname.includes('cidadao.mg.gov.br')) return;

    log('CrlvDigital', 'Passo1', 'Site cidadao.mg.gov.br detectado.');

    // ── INTERCEPTOR DE DOWNLOAD PDF ──
    // Usa arquivo separado para evitar CSP inline script violations
    const pdfInterceptorScript = document.createElement('script');
    pdfInterceptorScript.src = chrome.runtime.getURL('inject-pdf-interceptor.js');
    pdfInterceptorScript.onload = () => pdfInterceptorScript.remove();
    (document.head || document.documentElement).appendChild(pdfInterceptorScript);

    // Listener no content script para receber o PDF interceptado
    window.addEventListener('message', (event) => {
        if (event.data?.source !== 'MATILDE_PDF_INTERCEPTED') return;
        log('CrlvDigital', 'PdfInterceptado', 'PDF capturado!', event.data.url, 'tamanho base64:', event.data.pdfBase64?.length);

        // Salvar temporariamente — será enviado junto com os dados do CRLV
        window.__matildeCapturedPdf = {
            base64: event.data.pdfBase64,
            url: event.data.url,
        };
    });

    // PASSO 1: Ler parâmetros do hash ANTES do Angular redirecionar
    const hashStr = window.location.hash;
    const hashQIdx = hashStr.indexOf('?');
    const urlParams = hashQIdx !== -1
        ? new URLSearchParams(hashStr.substring(hashQIdx + 1))
        : new URLSearchParams(window.location.search);

    const cpfCnpj = urlParams.get('matilde_cpfCnpj');
    const placa = urlParams.get('matilde_placa');
    const renavam = urlParams.get('matilde_renavam');
    const crv = urlParams.get('matilde_crv');
    const osId = urlParams.get('matilde_osId');

    // PASSO 2: Se veio com parâmetros do CRM, salva no storage IMEDIATAMENTE
    if (cpfCnpj || placa || renavam || crv || osId) {
        log('CrlvDigital', 'Passo2', 'Parâmetros do CRM detectados! Salvando no storage antes do redirect...');
        saveContext({
            matilde_crlv_cpfCnpj: cpfCnpj || '',
            matilde_crlv_placa: placa || '',
            matilde_crlv_renavam: renavam || '',
            matilde_crlv_crv: crv || '',
            matilde_crlv_osId: osId || '',
        });
    }

    // PASSO 3: Ler dados do storage e agir
    getContext(['matilde_crlv_cpfCnpj', 'matilde_crlv_placa', 'matilde_crlv_renavam', 'matilde_crlv_crv', 'matilde_crlv_osId']).then(ctx => {
        const cCpf = ctx.matilde_crlv_cpfCnpj || cpfCnpj || '';
        const cPlaca = ctx.matilde_crlv_placa || placa || '';
        const cRenavam = ctx.matilde_crlv_renavam || renavam || '';
        const cCrv = ctx.matilde_crlv_crv || crv || '';
        const cOsId = ctx.matilde_crlv_osId || osId || '';

        if (!cCpf && !cPlaca && !cRenavam && !cCrv) {
            log('CrlvDigital', 'Passo3', 'Nenhum dado para preencher, ignorando.');
            return;
        }

        log('CrlvDigital', 'Passo3', 'Dados prontos para preenchimento:', { cCpf, cPlaca, cRenavam, cCrv, cOsId });

        // PASSO 4: Auto-redirect — se o Angular mandou pro dashboard, navegar automaticamente
        // para a página do CRLV Digital
        setTimeout(() => {
            if (window.location.hash.includes('dashboard') || !window.location.hash.includes('crlv-digital')) {
                log('CrlvDigital', 'Passo4', 'Redirecionando automaticamente para CRLV Digital...');
                showBanner('🔄 <b>Matilde CRM:</b> Redirecionando para CRLV Digital...', 'warning', 3000);
                window.location.hash = '#/egov/servicos/veiculo-condutor/crlv-digital';
            }
        }, 2500);

        let jaPreencheu = false;

        function tentarPreencher() {
            if (jaPreencheu) return true;

            const inputCpf = document.querySelector('#cpfCnpj');
            const inputPlaca = document.querySelector('#placa');
            const inputRenavam = document.querySelector('#renavam');
            const inputCrv = document.querySelector('#numeroCrv');

            if (!inputCpf || !inputPlaca) return false;

            log('CrlvDigital', 'Passo5', 'Formulário CRLV encontrado! Preenchendo campos...');
            jaPreencheu = true;

            setTimeout(() => {
                let preenchidos = 0;

                if (cCpf && inputCpf) {
                    inputCpf.value = cCpf;
                    inputCpf.dispatchEvent(new Event('input', { bubbles: true }));
                    inputCpf.dispatchEvent(new Event('change', { bubbles: true }));
                    inputCpf.dispatchEvent(new Event('blur', { bubbles: true }));
                    preenchidos++;
                    log('CrlvDigital', 'Passo5', '✅ CPF/CNPJ preenchido:', cCpf);
                }

                if (cPlaca && inputPlaca) {
                    inputPlaca.value = cPlaca;
                    inputPlaca.dispatchEvent(new Event('input', { bubbles: true }));
                    inputPlaca.dispatchEvent(new Event('change', { bubbles: true }));
                    inputPlaca.dispatchEvent(new Event('blur', { bubbles: true }));
                    preenchidos++;
                    log('CrlvDigital', 'Passo5', '✅ Placa preenchida:', cPlaca);
                }

                if (cRenavam && inputRenavam) {
                    inputRenavam.value = cRenavam;
                    inputRenavam.dispatchEvent(new Event('input', { bubbles: true }));
                    inputRenavam.dispatchEvent(new Event('change', { bubbles: true }));
                    inputRenavam.dispatchEvent(new Event('blur', { bubbles: true }));
                    preenchidos++;
                    log('CrlvDigital', 'Passo5', '✅ Renavam preenchido:', cRenavam);
                }

                if (cCrv && inputCrv) {
                    inputCrv.value = cCrv;
                    inputCrv.dispatchEvent(new Event('input', { bubbles: true }));
                    inputCrv.dispatchEvent(new Event('change', { bubbles: true }));
                    inputCrv.dispatchEvent(new Event('blur', { bubbles: true }));
                    preenchidos++;
                    log('CrlvDigital', 'Passo5', '✅ CRV preenchido:', cCrv);
                }

                if (preenchidos > 0) {
                    showBanner(`✅ <b>Matilde CRM:</b> Formulário CRLV preenchido! (${preenchidos} campos)`, 'success', 4000);
                    chrome.storage.local.remove(['matilde_crlv_cpfCnpj', 'matilde_crlv_placa', 'matilde_crlv_renavam', 'matilde_crlv_crv']);
                    // Mantemos matilde_crlv_osId no storage para caso a página recarregue ao consultar

                    // PASSO 6: Auto-click no botão "Continuar" após preencher
                    setTimeout(() => {
                        const btnContinuar = document.querySelector('button[type="submit"]');
                        if (btnContinuar && !btnContinuar.disabled) {
                            log('CrlvDigital', 'Passo6', '🖱️ Clicando em "Continuar"...');
                            btnContinuar.click();
                            showBanner('🚀 <b>Matilde CRM:</b> Consulta CRLV enviada! Aguardando resultado...', 'info', 5000);

                            // PASSO 7: Monitorar o resultado (Erro ou Download/Success)
                            let jaRegistrouResultado = false;

                            // Listener para erros capturados pelo interceptador de console injetado na página
                            const handleConsoleError = (e) => {
                                if (jaRegistrouResultado) return;
                                const isSpecificError = typeof e.detail === 'string' && e.detail.toLowerCase().includes('veiculo nao pertence');
                                if (isSpecificError) {
                                    jaRegistrouResultado = true;
                                    clearTimeout(timeoutId);
                                    
                                    const errorMsg = '❌ ' + e.detail.replace('ERROR ', '').replace('Error: ', '').trim();
                                    log('CrlvDigital', 'Passo7', '⚠️ Erro capturado via Console Interceptor:', errorMsg);
                                    showBanner(`⚠️ <b>Matilde CRM:</b> ${errorMsg}`, 'error', 8000);
                                    
                                    sendToBackground('CRLV_CONSULTA_RESULTADO', { osId: cOsId, resultado: errorMsg });
                                    chrome.storage.local.remove(['matilde_crlv_osId']);
                                    window.removeEventListener('MATILDE_CRLV_ERROR', handleConsoleError);
                                }
                            };
                            window.addEventListener('MATILDE_CRLV_ERROR', handleConsoleError);
                            
                            function extrairDadosCrlvDaPagina() {
                                const texto = document.body.innerText || '';
                                const dados = {};

                                // Placa - formato Mercosul (ABC1D23) ou antigo (ABC-1234)
                                const placaMatch = texto.match(/PLACA\s*[:\s]*([A-Z]{3}\s?-?\s?\d[A-Z0-9]\d{2})/i);
                                if (placaMatch) dados.placa = placaMatch[1].replace(/[\s-]/g, '').toUpperCase();

                                // Nome — extrai o valor entre "NOME" e o próximo label conhecido
                                // Labels do CRLV: CPF, CNPJ, LOCAL, DATA, PLACA, RENAVAM, CHASSI, etc.
                                const nomeRegex = /\bNOME\b[\s:]*\n?([\s\S]*?)(?=\n\s*(?:CPF|CNPJ|LOCAL\b|DATA\b|PLACA\b|RENAVAM|CHASSI|ASSINADO|CÓDIGO|MARCA|ESPÉCIE)|$)/i;
                                const nomeMatch2 = texto.match(nomeRegex);
                                if (nomeMatch2) {
                                    // Limpa: remove quebras de linha extras, espaços duplos
                                    const nomeRaw = nomeMatch2[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                                    // Garante que é um nome (pelo menos 2 palavras com letras)
                                    if (nomeRaw.length > 3 && /[A-ZÀÁÂÃÉÊÍÓÔÕÚÇ]{2,}/i.test(nomeRaw)) {
                                        dados.nome = nomeRaw;
                                    }
                                }

                                // CPF/CNPJ
                                const cpfMatch = texto.match(/(?:CPF|CNPJ)\s*[/\s]*(?:CNPJ|CPF)?\s*[:\s]*(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i);
                                if (cpfMatch) dados.cpfCnpj = cpfMatch[1];

                                // Data
                                const dataMatch = texto.match(/DATA\s*[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
                                if (dataMatch) dados.data = dataMatch[1];

                                // Renavam
                                const renavamMatch = texto.match(/RENAVAM\s*[:\s]*(\d{9,11})/i);
                                if (renavamMatch) dados.renavam = renavamMatch[1];

                                log('CrlvDigital', 'ExtrairDados', 'Dados extraídos da página:', dados);
                                return dados;
                            }

                            // INTERCEPTAR DOWNLOAD DO PDF
                            // Sobrescreve createElement para capturar <a download> criados pelo Angular
                            const originalCreateElement = document.createElement.bind(document);
                            document.createElement = function(tag) {
                                const el = originalCreateElement(tag);
                                if (tag.toLowerCase() === 'a') {
                                    const originalClick = el.click.bind(el);
                                    el.click = function() {
                                        if (el.download && el.href && (el.href.startsWith('blob:') || el.href.includes('.pdf'))) {
                                            log('CrlvDigital', 'Download', 'Interceptado download:', el.download, el.href);
                                            // Captura o blob antes do download
                                            fetch(el.href).then(r => r.blob()).then(blob => {
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    const base64 = reader.result; // data:application/pdf;base64,...
                                                    log('CrlvDigital', 'Download', 'PDF capturado em base64, tamanho:', base64.length);
                                                    const dadosCrlv = extrairDadosCrlvDaPagina();
                                                    if (!jaRegistrouResultado) {
                                                        jaRegistrouResultado = true;
                                                        clearTimeout(timeoutId);
                                                        showBanner('✅ <b>Matilde CRM:</b> PDF capturado e enviado ao CRM!', 'success', 5000);
                                                        sendToBackground('CRLV_CONSULTA_RESULTADO', {
                                                            osId: cOsId,
                                                            resultado: '✅ Consulta realizada com sucesso (PDF Capturado)',
                                                            dadosCrlv: dadosCrlv,
                                                            pdfBase64: base64,
                                                            pdfNome: el.download || 'CRLV.pdf',
                                                        });
                                                        chrome.storage.local.remove(['matilde_crlv_osId']);
                                                    }
                                                };
                                                reader.readAsDataURL(blob);
                                            }).catch(err => {
                                                log('CrlvDigital', 'Download', 'Erro ao capturar blob:', err);
                                            });
                                            // Deixa o download normal acontecer também
                                            originalClick();
                                        } else {
                                            originalClick();
                                        }
                                    };
                                }
                                return el;
                            };

                            const timeoutId = setTimeout(() => {
                                if (!jaRegistrouResultado) {
                                    jaRegistrouResultado = true;
                                    const dadosCrlv = extrairDadosCrlvDaPagina();
                                    const capturedPdf = window.__matildeCapturedPdf;

                                    if (capturedPdf?.base64) {
                                        log('CrlvDigital', 'Passo7', '✅ PDF interceptado + dados extraídos. Enviando ao CRM...');
                                        showBanner('✅ <b>Matilde CRM:</b> PDF capturado e enviado ao CRM automaticamente!', 'success', 6000);
                                        sendToBackground('CRLV_CONSULTA_RESULTADO', {
                                            osId: cOsId,
                                            resultado: '✅ Consulta realizada com sucesso (PDF Capturado e Anexado)',
                                            dadosCrlv: dadosCrlv,
                                            pdfBase64: capturedPdf.base64,
                                            pdfNome: `CRLV_${dadosCrlv.placa || 'DOC'}.pdf`,
                                        });
                                    } else {
                                        log('CrlvDigital', 'Passo7', '⏳ Timeout: PDF não interceptado, enviando só dados.');
                                        showBanner('✅ <b>Matilde CRM:</b> Dados extraídos. PDF não capturado — anexe manualmente.', 'warning', 6000);
                                        sendToBackground('CRLV_CONSULTA_RESULTADO', {
                                            osId: cOsId,
                                            resultado: '✅ Consulta realizada com sucesso (PDF baixado — anexar manualmente)',
                                            dadosCrlv: dadosCrlv,
                                        });
                                    }
                                    window.__matildeCapturedPdf = null;
                                    chrome.storage.local.remove(['matilde_crlv_osId']);
                                    window.removeEventListener('MATILDE_CRLV_ERROR', handleConsoleError);
                                }
                            }, 15000);

                            watchDOM(() => {
                                if (jaRegistrouResultado) return true;
                                
                                // Captura Toasts/Snackbars nativos do Angular/PrimeNG que aparecem na tela
                                const toast = document.querySelector('snack-bar-container, .mat-simple-snackbar, .p-toast-message, .alert-danger');
                                if (toast && toast.innerText.trim().length > 0) {
                                    const toastText = toast.innerText.toLowerCase();
                                    // Ignora mensagens de sucesso que aparecem em toast
                                    if (toastText.includes('sucesso')) return false;

                                    jaRegistrouResultado = true;
                                    clearTimeout(timeoutId);
                                    
                                    // Mapeia erros conhecidos do Detran para mensagens claras
                                    let errorMsg;
                                    if (toastText.includes('nenhum agendamento') || toastText.includes('dados informados')) {
                                        // O Detran retorna "Nenhum agendamento encontrado" quando o veículo
                                        // não pertence ao usuário logado no sistema
                                        errorMsg = '❌ Atenção! Veículo não pertence ao usuário logado.';
                                    } else {
                                        errorMsg = '❌ ' + toast.innerText.replace('FECHAR', '').trim();
                                    }
                                    log('CrlvDigital', 'Passo7', '⚠️ Erro capturado na UI (Toast):', errorMsg);
                                    showBanner(`⚠️ <b>Matilde CRM:</b> ${errorMsg}`, 'warning', 8000);
                                    
                                    sendToBackground('CRLV_CONSULTA_RESULTADO', { osId: cOsId, resultado: errorMsg });
                                    chrome.storage.local.remove(['matilde_crlv_osId']);
                                    window.removeEventListener('MATILDE_CRLV_ERROR', handleConsoleError);
                                    return true;
                                }

                                const pageText = document.body.innerText.toLowerCase();
                                // Se O ÚNICO indicativo for o texto limpo da tela (sem toast) - para "veiculo nao pertence"
                                if (pageText.includes('veiculo nao pertence ao usuario logado') || pageText.includes('veículo não pertence')) {
                                    jaRegistrouResultado = true;
                                    clearTimeout(timeoutId);
                                    
                                    const errorMsg = '❌ Atenção! Veículo não pertence ao usuário logado.';
                                    log('CrlvDigital', 'Passo7', '⚠️ Erro capturado no texto do DOM:', errorMsg);
                                    showBanner(`⚠️ <b>Matilde CRM:</b> ${errorMsg}`, 'warning', 8000);
                                    
                                    sendToBackground('CRLV_CONSULTA_RESULTADO', { osId: cOsId, resultado: errorMsg });
                                    chrome.storage.local.remove(['matilde_crlv_osId']);
                                    window.removeEventListener('MATILDE_CRLV_ERROR', handleConsoleError);
                                    return true;
                                }

                                return false;
                            }, 15000);

                        } else {
                            log('CrlvDigital', 'Passo6', '⚠️ Botão Continuar não encontrado ou desabilitado.');
                            showBanner('⚠️ <b>Matilde CRM:</b> Campos preenchidos. Clique em "Continuar" manualmente.', 'warning', 6000);
                        }
                    }, 1000);
                }
            }, 800);

            return true;
        }

        // Monitora o DOM por 5 minutos
        watchDOM(tentarPreencher, 300000);
    });
}


// ════════════════════════════════════════════════════════════
// SEÇÃO 9 — MÓDULO: 2ª VIA DE CRV (completar-dados)
//
// Roda na página de emissão da 2ª via do CRV quando o usuário
// clica em "Emitir Ficha de Cadastro E DAE" e aparece o modal
// de confirmação de responsabilidade do Detran.
//
// PASSO 1 — Detecta página completar-dados da 2ª via
// PASSO 2 — Aguarda o modal de atenção aparecer no DOM
// PASSO 3 — Clica automaticamente no botão OK (.btn-ok-modal-2)
// PASSO 4 — O modCapturaPDF() captura o PDF gerado em seguida
// ════════════════════════════════════════════════════════════

function modSegundaViaCRV() {
    const url = window.location.href;
    if (!url.includes('completar-dados')) return;

    log('SegundaViaCRV', 'Passo1', 'Página completar-dados da 2ª via detectada.');

    watchDOM(() => {
        const okBtn = document.querySelector('.btn-ok-modal-2');
        if (okBtn) {
            log('SegundaViaCRV', 'Passo3', 'Modal de atenção detectado, clicando em OK automaticamente.');
            okBtn.click();
            showBanner('✅ <b>Matilde CRM:</b> Modal confirmado. Aguardando PDF...', 'info', 5000);
            return true;
        }
        return false;
    }, 60000);
}


// ════════════════════════════════════════════════════════════
// SEÇÃO 10 — INICIALIZAÇÃO
//
// Detecta qual página está aberta e chama os módulos corretos.
// A ordem importa: módulos específicos primeiro, genérico por último.
// ════════════════════════════════════════════════════════════

(function init() {
    const url = window.location.href;
    log('Init', 'Start', 'URL atual:', url);

    // Módulo específico: CRLV Digital (cidadao.mg.gov.br)
    modCrlvDigital();

    // Módulo específico: Vistoria ECV (agendamento ou confirmação)
    modVistoriaECV();

    // Módulo específico: Consulta de Laudo
    modConsultaLaudo();

    // Módulo específico: Tela Confirmar Dados (central de todos os processos)
    modConfirmarDados();

    // Módulo específico: Documento Final com detecção de placa alterada
    modDocumentoFinal();

    // Módulo específico: 2ª via de CRV (auto-click no modal de confirmação)
    modSegundaViaCRV();

    // Monitor global de PDF (roda em todas as páginas exceto onde tem módulo dedicado)
    modCapturaPDF();

    // Auto-preenchimento genérico (lê URL params do CRM ou storage)
    modAutoPreenchimentoGenerico();

    log('Init', 'Done', 'Todos os módulos inicializados.');
})();


// ════════════════════════════════════════════════════════════
// UTILITÁRIO DE TESTE — Disponível no Console do Detran
// Uso: MatildeTest.simularConfirmarDados()
//      MatildeTest.simularPDF()
// ════════════════════════════════════════════════════════════

window.MatildeTest = {
    simularConfirmarDados() {
        sendToBackground('CAPTURED_CONFIRMAR_DADOS', {
            chassi: '9BWZZZ377VT004251', placa: 'ABC1D23',
            renavam: '00123456789', cpfCnpj: '123.456.789-00',
            nomeProprietario: 'Teste da Silva', marcaModelo: 'VW/GOL',
            crmServico: 'primeiro_emplacamento', osId: null,
        }).then(r => console.log('[Matilde][Teste] Resposta:', r));
    },
    simularPDF() {
        sendToBackground('CAPTURED_DETRAN_PDF', {
            fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            fileName: 'teste.pdf', placa: 'ABC1D23', chassi: '9BWZZZ377VT004251',
            crmServico: 'primeiro_emplacamento',
        }).then(r => console.log('[Matilde][Teste] Resposta:', r));
    },
    simularStatusLaudo(status = 'APROVADO') {
        sendToBackground('CAPTURED_LAUDO_PDF', {
            fileUrl: null, fileName: null,
            chassi: '9BWZZZ377VT004251', placa: 'ABC1D23',
            osNumero: '42', statusLaudo: status,
        }).then(r => console.log('[Matilde][Teste] Resposta:', r));
    },
};

// ============================================================
//  MATILDE CRM — PREENCHIMENTO AUTOMÁTICO DE VISTORIA (ECV)
//  content_vistoria.js — Preenche formulário de agendamento
//  Páginas: detran.mg.gov.br/veiculos/vistorias/*
// ============================================================

console.log('[Matilde][Vistoria] Script de preenchimento de vistoria carregado.');

(function() {
    var url = window.location.href.toLowerCase();
    if (!url.includes('vistoria')) return;

    // ── Helpers ──
    function preencherCampo(el, valor) {
        if (!el || !valor) return false;
        if (el.readOnly || el.disabled) return false;
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (setter && setter.set) { setter.set.call(el, valor); } else { el.value = valor; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
    }

    function selecionarOpcao(el, valor) {
        if (!el || !valor) return false;
        var opts = el.querySelectorAll('option');
        for (var i = 0; i < opts.length; i++) {
            if (opts[i].value === valor) {
                el.value = opts[i].value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        }
        return false;
    }

    function selecionarOpcaoPorTexto(el, texto) {
        if (!el || !texto) return false;
        var textoUpper = texto.toUpperCase();
        var opts = el.querySelectorAll('option');
        for (var i = 0; i < opts.length; i++) {
            if (opts[i].textContent.trim().toUpperCase().includes(textoUpper)) {
                el.value = opts[i].value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        }
        return false;
    }

    // Selecionar primeira opção não-vazia de um select
    function selecionarPrimeira(el) {
        if (!el) return false;
        var opts = el.querySelectorAll('option');
        for (var i = 0; i < opts.length; i++) {
            if (opts[i].value && opts[i].value.trim() !== '') {
                el.value = opts[i].value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        }
        return false;
    }

    function mostrarToast(msg) {
        var existente = document.getElementById('matilde-vistoria-toast');
        if (existente) existente.remove();
        var toast = document.createElement('div');
        toast.id = 'matilde-vistoria-toast';
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:14px 22px;border-radius:12px;font-size:14px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,0.3);display:flex;align-items:center;gap:10px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;transition:opacity 0.3s ease;';
        toast.innerHTML = '<span style="font-size:20px">🤖</span> ' + msg;
        document.body.appendChild(toast);
        setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 300); }, 6000);
    }

    // ── Detectar qual página estamos ──
    function detectarPagina() {
        // Página confirmação: dados finais (protocolo, data, hora, empresa)
        if (url.includes('/confirmar')) {
            return 'confirmar';
        }
        // Página 2: selecionar município e região
        if (url.includes('selecionar-municipio') || document.getElementById('municipio-id-atendimento')) {
            return 2;
        }
        // Página 3: selecionar data e hora
        if (url.includes('selecionar-data-hora') || url.includes('selecionar-data')) {
            return 3;
        }
        // Página 1: formulário principal (chassi, CPF, nome, etc.)
        if (document.getElementById('chassi') || document.getElementById('nome-proprietario')) {
            return 1;
        }
        return 0;
    }

    // ══════════════════════════════════════════════════
    //  PÁGINA 1 — Dados do veículo + proprietário
    // ══════════════════════════════════════════════════
    function preencherPagina1() {
        // FIX #1: marca agendamento como pendente assim que entramos no fluxo
        window.__matilde_vistoria_pendente = true;
        var params = new URLSearchParams(window.location.search);
        var dados = {
            placa: params.get('placa') || '',
            chassi: params.get('chassi') || '',
            cpfCnpj: params.get('cpfCnpj') || '',
            tipoDoc: params.get('tipoDoc') || 'CPF',
            nome: params.get('nome') || '',
            telefone: params.get('telefone') || '',
            email: params.get('email') || '',
            servico: params.get('servico') || '',
            osId: params.get('osId') || '',
        };

        if (!dados.chassi && !dados.cpfCnpj && !dados.nome) return 0;

        console.log('[Matilde][Vistoria] osId da URL:', dados.osId || '(vazio)');
        chrome.storage.local.get(['matilde_osId'], function(atual) {
            console.log('[Matilde][Vistoria] matilde_osId no storage agora:', atual.matilde_osId || '(vazio)');
        });
        if (dados.osId) {
            chrome.storage.local.set({ matilde_osId: dados.osId, matilde_servico_ativo: 'vistoria' }, function() {
                console.log('[Matilde][Vistoria] osId salvo no storage:', dados.osId);
            });
        }

        var MOTIVO_MAP = {
            'transferencia': 'Transferência de Propriedade',
            'Transferência de Propriedade': 'Transferência de Propriedade',
            'alteracao_dados': 'Alteração de Dados',
            'segunda_via': 'Segunda via de CRV',
            '2ª Via de Recibo (CRV)': 'Segunda via de CRV',
            'primeiro_emplacamento': 'Primeiro Emplacamento',
            'Primeiro Emplacamento': 'Primeiro Emplacamento',
        };

        var preenchidos = 0;
        var naoPreenchidos = [];

        function tentar(nome, id, valor) {
            if (!valor) return;
            var el = document.getElementById(id);
            if (el && preencherCampo(el, valor)) { preenchidos++; console.log('[Matilde][Vistoria] ✓ ' + nome); }
            else naoPreenchidos.push(nome);
        }

        tentar('Placa', 'placa', dados.placa);
        tentar('Chassi', 'chassi', dados.chassi);
        tentar('CPF/CNPJ', 'cpf-cnpj-proprietario', dados.cpfCnpj);
        tentar('Nome', 'nome-proprietario', dados.nome);
        tentar('Telefone', 'telefone-proprietario', dados.telefone);
        tentar('Email', 'email', dados.email);
        tentar('Confirmar Email', 'email2', dados.email);

        // Tipo Doc (select: 1=CPF, 2=CNPJ)
        var selectTipoDoc = document.getElementById('tipo-documento-proprietario-id');
        if (selectTipoDoc && dados.tipoDoc) {
            if (selecionarOpcao(selectTipoDoc, dados.tipoDoc.toUpperCase() === 'CNPJ' ? '2' : '1')) {
                preenchidos++;
            }
        }

        // Motivo vistoria
        var selectMotivo = document.getElementById('motivo-vistoria-id');
        if (selectMotivo && dados.servico) {
            var textoMotivo = MOTIVO_MAP[dados.servico] || dados.servico;
            if (selecionarOpcaoPorTexto(selectMotivo, textoMotivo)) preenchidos++;
            else naoPreenchidos.push('Motivo');
        }

        // Vistoria Móvel → Não
        var radioMovelNao = document.getElementById('flag-vistoria-movel-0');
        if (radioMovelNao && !radioMovelNao.checked) {
            radioMovelNao.checked = true;
            radioMovelNao.dispatchEvent(new Event('change', { bubbles: true }));
            radioMovelNao.dispatchEvent(new Event('click', { bubbles: true }));
            preenchidos++;
        }

        // Pesquisa → Não
        var radioPesquisaNao = document.getElementById('receber-pesquisa-0');
        if (radioPesquisaNao && !radioPesquisaNao.checked) {
            radioPesquisaNao.checked = true;
            radioPesquisaNao.dispatchEvent(new Event('change', { bubbles: true }));
            radioPesquisaNao.dispatchEvent(new Event('click', { bubbles: true }));
            preenchidos++;
        }

        // Termo de aceite
        var checkTermo = document.getElementById('termo-aceite');
        if (checkTermo && !checkTermo.checked) {
            checkTermo.checked = true;
            checkTermo.dispatchEvent(new Event('change', { bubbles: true }));
            var btnSubmit = document.querySelector('button[type="submit"]');
            if (btnSubmit) btnSubmit.disabled = false;
            preenchidos++;
        }

        if (preenchidos > 0) {
            mostrarToast('Matilde preencheu ' + preenchidos + ' campos!' + (naoPreenchidos.length > 0 ? ' <span style="opacity:0.7;font-size:12px">' + naoPreenchidos.length + ' pendente(s)</span>' : ''));
        }
        return preenchidos;
    }

    // ══════════════════════════════════════════════════
    //  PÁGINA 2 — Selecionar município e região
    // ══════════════════════════════════════════════════
    function preencherPagina2() {
        var selectMunicipio = document.getElementById('municipio-id-atendimento');
        if (!selectMunicipio) return 0;

        var preenchidos = 0;

        // Se só tem uma opção (além da vazia), seleciona automaticamente
        var opcoesValidas = [];
        var opts = selectMunicipio.querySelectorAll('option');
        for (var i = 0; i < opts.length; i++) {
            if (opts[i].value && opts[i].value.trim() !== '') {
                opcoesValidas.push(opts[i]);
            }
        }

        if (opcoesValidas.length === 1) {
            // Só um município — selecionar automaticamente
            selectMunicipio.value = opcoesValidas[0].value;

            // Select2: atualizar visualmente
            if (typeof jQuery !== 'undefined' && jQuery.fn.select2) {
                jQuery('#municipio-id-atendimento').val(opcoesValidas[0].value).trigger('change');
            } else {
                selectMunicipio.dispatchEvent(new Event('change', { bubbles: true }));
            }

            preenchidos++;
            console.log('[Matilde][Vistoria] ✓ Município = ' + opcoesValidas[0].textContent.trim());

            mostrarToast('Município selecionado: ' + opcoesValidas[0].textContent.trim());
        } else if (opcoesValidas.length > 1) {
            console.log('[Matilde][Vistoria] Múltiplos municípios disponíveis (' + opcoesValidas.length + '). Aguardando seleção manual.');
            mostrarToast('Selecione o município (' + opcoesValidas.length + ' disponíveis)');
        }

        return preenchidos;
    }

    // ══════════════════════════════════════════════════
    //  PÁGINA 3 — Selecionar data e hora
    // ══════════════════════════════════════════════════
    function preencherPagina3() {
        // Página 3 geralmente tem calendário/slots de horário
        // Não preenchemos automaticamente — apenas notificamos
        console.log('[Matilde][Vistoria] Página 3 (data/hora) detectada. Seleção manual necessária.');
        mostrarToast('Selecione a data e horário da vistoria');

        // FIX #1: avisar o usuário se ele tentar fechar a aba antes de chegar
        // na página de confirmação. Sem isso, o agendamento existe no Detran
        // mas o CRM nunca recebe os dados.
        instalarBeforeUnloadGuard();
        return 0;
    }

    // ══════════════════════════════════════════════════
    //  Guard de saída — só remove quando capturarmos a confirmação
    // ══════════════════════════════════════════════════
    var _beforeUnloadInstalado = false;
    function instalarBeforeUnloadGuard() {
        if (_beforeUnloadInstalado) return;
        _beforeUnloadInstalado = true;
        window.addEventListener('beforeunload', function(e) {
            // Só avisa se ainda há osId no storage (= agendamento não confirmado no CRM)
            // chrome.storage é assíncrono, então usamos uma flag em memória populada no executar()
            if (window.__matilde_vistoria_pendente) {
                e.preventDefault();
                e.returnValue = 'O agendamento de vistoria ainda não foi confirmado no CRM. Tem certeza que quer sair?';
                return e.returnValue;
            }
        });
    }

    // ══════════════════════════════════════════════════
    //  PÁGINA CONFIRMAÇÃO — Captura dados do agendamento
    //  e envia de volta ao CRM para atualizar a OS
    // ══════════════════════════════════════════════════
    function capturarConfirmacao() {
        // Extrair dados dos <dt>/<dd> pairs
        function lerCampo(label) {
            var dts = document.querySelectorAll('dt');
            for (var i = 0; i < dts.length; i++) {
                if (dts[i].textContent.trim().toLowerCase().includes(label.toLowerCase())) {
                    var dd = dts[i].nextElementSibling;
                    if (dd && dd.tagName === 'DD') {
                        return dd.textContent.trim();
                    }
                }
            }
            return '';
        }

        var dados = {
            protocolo: lerCampo('Protocolo'),
            data: lerCampo('Data'),
            hora: lerCampo('Hora'),
            empresa: lerCampo('Empresa'),
            cnpjEmpresa: lerCampo('CNPJ'),
            telefoneEmpresa: lerCampo('Telefone'),
            celularEmpresa: lerCampo('Celular'),
            emailEmpresa: lerCampo('E-mail'),
            placa: lerCampo('Placa'),
            chassi: lerCampo('Chassi'),
            municipio: lerCampo('Municip'),
        };

        console.log('[Matilde][Vistoria] Dados da confirmação capturados:', dados);

        if (!dados.protocolo) {
            console.warn('[Matilde][Vistoria] Protocolo não encontrado na página de confirmação.');
            return 0;
        }

        // FIX #2: tenta capturar PDF do comprovante (link "imprimir" / "comprovante" / qualquer <a> PDF)
        function localizarLinkPdfComprovante() {
            // Prioridade 1: links data:application/pdf;base64
            var dataLinks = document.querySelectorAll('a[href^="data:application/pdf"]');
            if (dataLinks.length > 0) return { tipo: 'data', href: dataLinks[0].getAttribute('href') };
            // Prioridade 2: links .pdf
            var pdfLinks = document.querySelectorAll('a[href$=".pdf"], a[href*=".pdf?"]');
            if (pdfLinks.length > 0) return { tipo: 'url', href: pdfLinks[0].href };
            // Prioridade 3: link com texto "imprimir", "comprovante", "baixar"
            var todos = document.querySelectorAll('a, button');
            for (var i = 0; i < todos.length; i++) {
                var t = (todos[i].textContent || '').trim().toLowerCase();
                if (t.indexOf('imprimir') >= 0 || t.indexOf('comprovante') >= 0 || t.indexOf('baixar pdf') >= 0) {
                    var h = todos[i].getAttribute('href') || todos[i].getAttribute('data-href');
                    if (h) return { tipo: h.indexOf('data:') === 0 ? 'data' : 'url', href: h };
                }
            }
            return null;
        }

        function fetchComoBase64(url) {
            return fetch(url, { credentials: 'include' })
                .then(function(r) { return r.arrayBuffer(); })
                .then(function(buf) {
                    var bytes = new Uint8Array(buf);
                    var binary = '';
                    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                    return 'data:application/pdf;base64,' + btoa(binary);
                });
        }

        var linkComprovante = localizarLinkPdfComprovante();

        function enviarPayload(comprovanteBase64) {
            // Buscar osId do storage
            chrome.storage.local.get(['matilde_osId'], function(ctx) {
                var osId = ctx.matilde_osId || null;
                console.log('[Matilde][Vistoria] osId do storage:', osId);

                if (!osId) {
                    console.warn('[Matilde][Vistoria] AVISO: osId não encontrado no storage! A OS não será atualizada.');
                }

                var payload = {
                    protocolo: dados.protocolo,
                    dataAgendamento: dados.data,
                    horaAgendamento: dados.hora,
                    local: dados.empresa,
                    cnpjEmpresa: dados.cnpjEmpresa,
                    telefoneEmpresa: dados.telefoneEmpresa || dados.celularEmpresa,
                    emailEmpresa: dados.emailEmpresa,
                    placa: dados.placa,
                    chassi: dados.chassi,
                    municipio: dados.municipio,
                    osId: osId,
                    comprovanteBase64: comprovanteBase64 || null,
                };

                console.log('[Matilde][Vistoria] Enviando CAPTURE_VISTORIA ao background. Tem PDF?', !!comprovanteBase64);

                chrome.runtime.sendMessage({
                    action: 'CAPTURE_VISTORIA',
                    payload: payload,
                }, function(resp) {
                    if (chrome.runtime.lastError) {
                        console.error('[Matilde][Vistoria] Erro ao enviar:', chrome.runtime.lastError.message);
                    } else {
                        console.log('[Matilde][Vistoria] Dados enviados com sucesso:', resp);
                        // Captura confirmada → libera o beforeunload guard e limpa todo o contexto
                        window.__matilde_vistoria_pendente = false;
                        chrome.storage.local.remove([
                            'matilde_osId',
                            'matilde_placa',
                            'matilde_chassi',
                            'matilde_cpfCnpj',
                            'matilde_nome',
                            'matilde_servico_ativo',
                        ]);
                    }
                });
            });
        }

        if (linkComprovante) {
            console.log('[Matilde][Vistoria] Link de comprovante encontrado:', linkComprovante.tipo);
            if (linkComprovante.tipo === 'data') {
                enviarPayload(linkComprovante.href);
            } else {
                fetchComoBase64(linkComprovante.href)
                    .then(enviarPayload)
                    .catch(function(err) {
                        console.warn('[Matilde][Vistoria] Falha ao baixar PDF do comprovante:', err);
                        enviarPayload(null);
                    });
            }
        } else {
            console.log('[Matilde][Vistoria] Nenhum link de comprovante encontrado na página.');
            enviarPayload(null);
        }

        mostrarToast('Vistoria agendada! Protocolo: ' + dados.protocolo + ' | ' + dados.data + ' ' + dados.hora + ' | ' + dados.empresa);
        return 1;
    }

    // ── Execução principal ──
    var _preenchida = false;

    function executar() {
        if (_preenchida) return;

        var pagina = detectarPagina();
        console.log('[Matilde][Vistoria] Página detectada:', pagina);

        var filled = 0;
        if (pagina === 1) filled = preencherPagina1();
        else if (pagina === 2) filled = preencherPagina2();
        else if (pagina === 3) filled = preencherPagina3();
        else if (pagina === 'confirmar') filled = capturarConfirmacao();

        if (filled > 0 || pagina === 3 || pagina === 'confirmar') _preenchida = true;
        return filled;
    }

    // Tentar imediatamente
    executar();

    // Retry para páginas dinâmicas
    if (!_preenchida) {
        var tentativas = 0;
        var intervalo = setInterval(function() {
            tentativas++;
            if (_preenchida || tentativas >= 15) {
                clearInterval(intervalo);
                return;
            }
            executar();
        }, 1000);
    }
})();

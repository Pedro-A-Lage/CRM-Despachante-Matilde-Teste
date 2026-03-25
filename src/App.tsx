import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import ClientesList from './pages/ClientesList';
import ClienteForm from './pages/ClienteForm';
import ClienteDetail from './pages/ClienteDetail';
import VeiculosList from './pages/VeiculosList';
import VeiculoForm from './pages/VeiculoForm';
import OSList from './pages/OSList';
import OSForm from './pages/OSForm';
import OSDetail from './pages/OSDetail';
import ProtocoloDiario from './pages/ProtocoloDiario';
import Emails from './pages/Emails';
import Backup from './pages/Backup';
import ServicosDetran from './pages/ServicosDetran';
import VistoriaCalendar from './pages/VistoriaCalendar';
import Financeiro from './pages/Financeiro';
import UsuariosList from './pages/UsuariosList';
import ControlePagamentos from './pages/ControlePagamentos';
import Configuracoes from './pages/Configuracoes';
import Login from './pages/Login';
import { ConfirmProvider } from './components/ConfirmProvider';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import TrocarSenhaModal from './components/TrocarSenhaModal';
import { useEffect } from 'react';
import type { TipoServico } from './types';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { usuario, carregando } = useAuth();
    if (carregando) return null;
    if (!usuario) return <Navigate to="/login" replace />;
    return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
    const { usuario } = useAuth();
    if (usuario?.role !== 'admin') return <Navigate to="/" replace />;
    return <>{children}</>;
}

function ExtensionListener() {
    const navigate = useNavigate();

    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            // Check if message comes from our extension
            if (event.data && event.data.source === 'MATILDE_EXTENSION' && event.data.type === 'PROCESS_DETRAN_PDF') {
                const { fileUrl, fileName, placa, chassi, crmServico, confirmarDadosText, osId: pdfOsId } = event.data.payload;
                console.log('CRM recebeu documento da extensão:', { fileName, placa, chassi, crmServico, hasConfirmarDadosText: !!confirmarDadosText });

                try {
                    console.log('Iniciando processamento do documento interceptado...');

                    const { extractVehicleData, extractVehicleDataFromText } = await import('./lib/pdfParser');

                    // 3. Converte Base64 (Data URI) p/ Arquivo
                    // Normalmente a extensão vai enviar Data URI: "data:application/pdf;base64,JVBERi..."
                    let file: File;
                    try {
                        if (fileUrl.startsWith('data:')) {
                            console.log("Matilde: Extraindo dados do Data URI...");
                            const arr = fileUrl.split(',');
                            const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
                            const bstr = atob(arr[1]);
                            let n = bstr.length;
                            const u8arr = new Uint8Array(n);
                            while (n--) {
                                u8arr[n] = bstr.charCodeAt(n);
                            }
                            file = new File([u8arr], fileName || `cadastro_${placa || chassi}.pdf`, { type: mime });
                            console.log("Matilde: Conversão Base64 -> File concluída", { size: file.size, type: file.type });
                        } else {
                            // Se fosse URL pura teríamos que fazer um fetch(fileUrl).blob()
                            console.log("Matilde: Arquivo veio como URL normal, fazendo fetch...", fileUrl);
                            const response = await fetch(fileUrl);
                            const blob = await response.blob();
                            file = new File([blob], fileName || `cadastro_${placa || chassi}.pdf`, { type: blob.type || 'application/pdf' });
                        }

                        // Força o download do arquivo no navegador do usuário (opcional, só para ele ter o arquivo)
                        const a = document.createElement('a');
                        // Se criamos um File a partir do blob/base64, precisamos de uma URL local pra ele baixar
                        const objectUrl = URL.createObjectURL(file);
                        a.href = objectUrl;
                        a.download = file.name;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(objectUrl), 10000); // Limpa memória

                    } catch (conversionError) {
                        console.error("Matilde: Erro gravíssimo ao converter arquivo PDF! Detalhes:", conversionError);
                        alert(`❌ Erro interno ao tentar preparar o PDF para o CRM.\nDetalhes: ${conversionError}`);
                        return; // Aborta porque não tem arquivo pra enviar pro Drive ou OCR
                    }

                    // 4. Extrai os dados do PDF ou da Página (tolerante a falhas)
                    console.log('Extraindo dados do processo...');
                    let extracted: any = { placa: placa || '', chassi: chassi || '', cpfCnpj: '', nomeProprietario: '', renavam: '', marcaModelo: '' };
                    let extractedSuccessfully = false;

                    // A) Tenta extrair pelo texto bruto capturado na tela confirmar-dados (mais confiável)
                    if (confirmarDadosText) {
                        try {
                            console.log("Matilde: Extraindo dados a partir do texto de confirmar-dados...");
                            const textExtraction = extractVehicleDataFromText(confirmarDadosText);
                            if (textExtraction && (textExtraction.chassi || textExtraction.placa || textExtraction.cpfCnpj)) {
                                extracted = textExtraction;
                                extractedSuccessfully = true;
                                console.log("Dados extraídos com sucesso A PARTIR DO TEXTO DA WEB:", extracted);
                            } else {
                                console.warn("Matilde: Texto confirmar-dados não retornou chassi/placa, caindo para fallback OCR pdf...");
                            }
                        } catch (textParseError) {
                            console.warn("Matilde: Erro ao tentar ler o texto confirmar-dados.", textParseError);
                        }
                    }

                    // B) Fallback para ler dados diretamente de DENTRO do PDF
                    if (!extractedSuccessfully) {
                        try {
                            console.log('Extraindo dados do PDF via pdfParser...');
                            extracted = await extractVehicleData(file);
                            console.log("Dados extraídos com sucesso A PARTIR DO PDF:", extracted);
                        } catch (parseError) {
                            console.warn("Matilde: Não foi possível extrair dados do PDF (pode ser um formato não suportado). Usando dados da extensão.", parseError);
                            // Usa os dados que vieram em hard-code da extensão como fallback 3
                            extracted.placa = placa || '';
                            extracted.chassi = chassi || '';
                        }
                    }

                    // Extrair dados do cliente para a revisão
                    const clienteCpfCnpj = extracted.cpfCnpjAdquirente || extracted.cpfCnpj;
                    const clienteNome = extracted.nomeAdquirente || extracted.nomeProprietario || "CLIENTE IMPORTADO DO DETRAN";

                    // Navega para OSForm com os dados pré-preenchidos
                    const tipoServDetected = (event.data.payload.crmServico as TipoServico) || 'transferencia';

                    // Converte File para base64 para passar via navigation state
                    const fileBase64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                    });

                    navigate('/ordens', {
                        state: {
                            extensionData: {
                                type: 'PROCESS_DETRAN_PDF',
                                payload: event.data.payload,
                                fileBase64,
                                fileName: file.name,
                                fileType: file.type,
                                extensionSource: event.source ? 'present' : null,
                                extensionOrigin: event.origin,
                                tipoServico: tipoServDetected,
                                tipoVeiculo: 'carro',
                                trocaPlaca: tipoServDetected === 'primeiro_emplacamento',
                                cliente: {
                                    nome: clienteNome,
                                    cpfCnpj: clienteCpfCnpj || "",
                                    telefone: ""
                                },
                                veiculo: {
                                    placa: extracted.placa || placa || "",
                                    chassi: extracted.chassi || chassi || "",
                                    renavam: extracted.renavam || "",
                                    marcaModelo: extracted.marcaModelo || "",
                                    dataAquisicao: extracted.dataAquisicao || "",
                                    dataEmissao: extracted.dataEmissao || ""
                                }
                            }
                        }
                    });

                } catch (error: any) {
                    console.error('Erro ao processar documento da extensão:', error);
                    const errorMsg = error?.message || error?.toString() || 'Erro desconhecido';
                    alert(`❌ Erro ao processar documento do Detran no CRM.\n\nDetalhes: ${errorMsg}\n\nVerifique o Console do navegador (F12) para mais informações.`);
                }
            }
            else if (event.data && event.data.source === 'MATILDE_EXTENSION' && event.data.type === 'CAPTURED_CONFIRMAR_DADOS') {
                const {
                    chassi, placa, renavam, cpfCnpj, nomeProprietario,
                    cpfCnpjAdquirente, nomeAdquirente, cpfCnpjVendedor,
                    marcaModelo, servicoCategoria, crmServico, osId, confirmarDadosText
                } = event.data.payload;

                console.log('CRM recebeu CAPTURED_CONFIRMAR_DADOS da extensão:', event.data.payload);

                try {
                    const { extractVehicleDataFromText } = await import('./lib/pdfParser');
                    const textExtraction = confirmarDadosText ? extractVehicleDataFromText(confirmarDadosText) : null;
                    const finalDataAquisicao = textExtraction?.dataAquisicao || "";

                    // Extrair dados do cliente para a revisão
                    const clienteCpfCnpj = cpfCnpjAdquirente || (cpfCnpj !== cpfCnpjVendedor ? cpfCnpj : null) || cpfCnpjAdquirente || cpfCnpj;
                    const clienteNome = nomeAdquirente || (nomeProprietario && !nomeProprietario.includes('ANTERIOR') ? nomeProprietario : null) || nomeAdquirente || nomeProprietario || "CLIENTE IMPORTADO DO DETRAN";

                    // Navega para OSForm com os dados pré-preenchidos
                    const tipoServConfirmar = (crmServico as TipoServico) || 'transferencia';
                    navigate('/ordens', {
                        state: {
                            extensionData: {
                                type: 'CAPTURED_CONFIRMAR_DADOS',
                                payload: event.data.payload,
                                extensionOrigin: event.origin,
                                tipoServico: tipoServConfirmar,
                                tipoVeiculo: 'carro',
                                trocaPlaca: tipoServConfirmar === 'primeiro_emplacamento',
                                cliente: {
                                    nome: clienteNome,
                                    cpfCnpj: clienteCpfCnpj || "",
                                    telefone: ""
                                },
                                veiculo: {
                                    placa: placa || "",
                                    chassi: chassi || "",
                                    renavam: renavam || "",
                                    marcaModelo: marcaModelo || "",
                                    dataAquisicao: finalDataAquisicao,
                                    dataEmissao: ""
                                }
                            }
                        }
                    });

                } catch (error: any) {
                    console.error('Erro ao processar CAPTURED_CONFIRMAR_DADOS:', error);
                }
            }
            else if (event.data && event.data.source === 'MATILDE_EXTENSION' && event.data.type === 'CAPTURED_VISTORIA_ECV') {
                const { osId, placa, chassi, cpfCnpj, nome, dataVistoria, horaVistoria, localVistoria, protocolo } = event.data.payload;
                console.log('CRM recebeu dados de Vistoria da extensão:', { osId, placa, chassi, cpfCnpj, nome, dataVistoria, horaVistoria, localVistoria, protocolo });

                try {
                    const { getVeiculos, getOrdens, updateOrdem, addAuditEntry, getClientes } = await import('./lib/storage');
                    const veiculos = await getVeiculos();
                    const clientes = await getClientes();
                    const ordens = await getOrdens();

                    // Acha o veiculo
                    let veiculoEncontrado;
                    if (placa) veiculoEncontrado = veiculos.find(v => v.placa === placa);
                    if (!veiculoEncontrado && chassi) veiculoEncontrado = veiculos.find(v => v.chassi === chassi);

                    // Acha o cliente (caso o carro nao tenha placa vinda do portal)
                    let clienteEncontrado;
                    if (cpfCnpj) {
                        const limpoCpf = cpfCnpj.replace(/[^\d]/g, '');
                        clienteEncontrado = clientes.find(c => c.cpfCnpj.replace(/[^\d]/g, '') === limpoCpf);
                    }
                    if (!clienteEncontrado && nome) {
                        clienteEncontrado = clientes.find(c => c.nome.toLowerCase().includes(nome.toLowerCase().trim()));
                    }

                    // Busca as OS abertas que batem com o Veiculo ou Cliente
                    let osTarget;

                    if (osId) {
                        osTarget = ordens.find(o => o.id === osId);
                    }

                    if (!osTarget && veiculoEncontrado) {
                        osTarget = ordens
                            .filter(o => o.veiculoId === veiculoEncontrado!.id && o.status !== 'entregue')
                            .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())[0];
                    }

                    // Se nao achou OS pelo veiculo, tenta achar pelo cliente
                    if (!osTarget && clienteEncontrado) {
                        osTarget = ordens
                            .filter(o => o.clienteId === clienteEncontrado!.id && o.status !== 'entregue')
                            // Se tiver chassi e não achamos o veículo no BD, ao menos filtra se achar o cliente
                            .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())[0];
                    }

                    if (osTarget) {
                        // Converter DD/MM/YYYY para YYYY-MM-DD pro HTML input date
                        let dataHtml = '';
                        if (dataVistoria && dataVistoria.includes('/')) {
                            const parts = dataVistoria.split('/');
                            dataHtml = `${parts[2]}-${parts[1]}-${parts[0]}`;
                        }

                        const novaVistoria = {
                            ...(osTarget.vistoria || { local: '', status: 'agendar' as const }),
                            dataAgendamento: dataHtml || osTarget.vistoria?.dataAgendamento,
                            horaAgendamento: horaVistoria || osTarget.vistoria?.horaAgendamento,
                            local: localVistoria || osTarget.vistoria?.local || '',
                            protocolo: protocolo || osTarget.vistoria?.protocolo,
                            status: 'agendada' as const
                        };

                        const updateData: any = { vistoria: novaVistoria };

                        // Atualiza status da OS: se está em aguardando_documentacao ou vistoria, avança para vistoria
                        if (osTarget.status === 'aguardando_documentacao' || osTarget.status === 'vistoria') {
                            updateData.status = 'vistoria';
                        }

                        await addAuditEntry(osTarget.id, 'Vistoria Auto-Agendada', `Agendamento ECV importado: ${dataVistoria} às ${horaVistoria} em ${localVistoria}${protocolo ? ` — Protocolo: ${protocolo}` : ''}`);

                        await updateOrdem(osTarget.id, updateData);

                        // Notifica a extensão que deu certo
                        if (event.source) {
                            (event.source as Window).postMessage({ source: 'MATILDE_CRM', status: 'SUCCESS' }, event.origin);
                        }

                        // Força refresh imediato da OS (sem esperar realtime)
                        if (window.location.pathname === `/ordens/${osTarget.id}`) {
                            window.dispatchEvent(new CustomEvent('matilde-os-refresh'));
                        } else {
                            navigate(`/ordens/${osTarget.id}`);
                        }
                    } else {
                        console.warn(`Vistoria capturada, mas OS não encontrada para ${placa || chassi || cpfCnpj || nome}`);
                    }
                } catch (error) {
                    console.error('Erro ao processar dados de vistoria:', error);
                }
            }
            else if (event.data && event.data.source === 'MATILDE_EXTENSION' && event.data.type === 'CAPTURED_LAUDO_PDF') {
                const { fileUrl, fileName, chassi, placa, osNumero, osId: laudoOsId, statusLaudo } = event.data.payload;
                console.log('CRM recebeu Laudo em PDF da extensão:', { fileName, chassi, placa, osNumero });

                try {
                    const { getVeiculos, getOrdens, updateOrdem, addAuditEntry } = await import('./lib/storage');
                    const { uploadFileToSupabase } = await import('./lib/supabaseStorage');

                    const veiculos = await getVeiculos();
                    const ordens = await getOrdens();

                    // 1. Encontra a OS alvo (por osId direto, depois osNumero, depois veículo)
                    let osTarget;
                    if (laudoOsId) {
                        osTarget = ordens.find(o => o.id === laudoOsId);
                    }
                    if (!osTarget && osNumero) {
                        osTarget = ordens.find(o => o.numero.toString() === osNumero.toString());
                    }

                    // Se não tem OS número, tenta achar pelo veículo (última OS aberta)
                    let veiculoTarget;
                    if (chassi) veiculoTarget = veiculos.find(v => v.chassi === chassi);
                    if (!veiculoTarget && placa) veiculoTarget = veiculos.find(v => v.placa === placa);

                    if (!osTarget && veiculoTarget) {
                        osTarget = ordens
                            .filter(o => o.veiculoId === veiculoTarget!.id && o.status !== 'entregue')
                            .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())[0];
                    }

                    if (!osTarget || !veiculoTarget) {
                        // Se achou OS mas não tem veiculo id (raro)
                        if (osTarget) veiculoTarget = veiculos.find(v => v.id === osTarget.veiculoId);

                        if (!veiculoTarget) {
                            console.error("Matilde: Veículo não encontrado para anexar o laudo.", { chassi, placa });
                            alert(`❌ Laudo baixado, mas não foi possível anexar automaticamente. Veículo não encontrado no CRM.`);
                            return;
                        }
                    }

                    // 2. Converte Base64 -> File (só se veio PDF real)
                    let file: File | null = null;
                    if (fileUrl && fileUrl.startsWith('data:')) {
                        const arr = fileUrl.split(',');
                        const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
                        const bstr = atob(arr[1]);
                        let n = bstr.length;
                        const u8arr = new Uint8Array(n);
                        while (n--) { u8arr[n] = bstr.charCodeAt(n); }
                        file = new File([u8arr], fileName, { type: mime });
                    } else if (fileUrl) {
                        const response = await fetch(fileUrl);
                        const blob = await response.blob();
                        file = new File([blob], fileName, { type: 'application/pdf' });
                    }

                    // 3. Determina o resultado da vistoria
                    let resultadoVistoria: string | null = statusLaudo || null;
                    if (!resultadoVistoria && file) {
                        try {
                            const { extractVehicleData } = await import('./lib/pdfParser');
                            const extracted = await extractVehicleData(file);
                            resultadoVistoria = extracted.resultadoVistoria || null;
                            console.log("Matilde: Resultado extraído do PDF (fallback):", resultadoVistoria);
                        } catch (parseError) {
                            console.error("Matilde: Erro ao tentar ler o PDF da vistoria (fallback):", parseError);
                        }
                    } else {
                        console.log("Matilde: Status do laudo recebido diretamente da extensão:", resultadoVistoria);
                    }

                    let finalLaudoUrl: string | null = null;

                    // 4. Upload pro Supabase (só se tiver PDF real)
                    if (file) {
                        const vehicleIdentity = veiculoTarget.placa || veiculoTarget.chassi || veiculoTarget.id;
                        const filePath = `${vehicleIdentity}/${fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
                        console.log('Fazendo upload do laudo para o Supabase...', { filePath });
                        try {
                            finalLaudoUrl = await uploadFileToSupabase(file, filePath);
                            console.log('Upload do laudo concluído URL:', finalLaudoUrl);
                        } catch (uploadErr) {
                            console.warn('Matilde: Erro ao enviar laudo pro Supabase (não impede salvar status):', uploadErr);
                        }
                    } else {
                        console.log('Matilde: Sem PDF anexo — apenas atualizando status da vistoria na OS.');
                    }

                    // 5. Salva na OS e atualiza o status se tiver resultado
                    // IMPORTANTE: os campos vistoriaAnexadaEm, vistoriaNomeArquivo e vistoriaUrl
                    // ficam DENTRO do objeto vistoria (é onde a VistoriaTab busca)
                    if (osTarget) {
                        const vistoriaAtual = osTarget.vistoria || { local: '', status: 'agendar' as const };
                        const updatedVistoria: any = { ...vistoriaAtual };

                        if (finalLaudoUrl) {
                            updatedVistoria.vistoriaAnexadaEm = new Date().toISOString();
                            updatedVistoria.vistoriaNomeArquivo = fileName;
                            updatedVistoria.vistoriaUrl = finalLaudoUrl;
                        }

                        let statusDesc = '';
                        if (resultadoVistoria) {
                            const upperRes = resultadoVistoria.toUpperCase();

                            if (upperRes === 'COM_APONTAMENTO' || upperRes.includes('APROVADO COM APONTAMENTO') || upperRes.includes('APROVADA COM APONTAMENTO')) {
                                updatedVistoria.status = 'aprovada_apontamento';
                                statusDesc = ' (Aprovada com Apontamento)';
                            } else if (upperRes === 'APROVADO' || upperRes.includes('APROVADO') || upperRes.includes('APROVADA')) {
                                updatedVistoria.status = 'aprovada';
                                statusDesc = ' (Aprovada)';
                            } else if (upperRes === 'REPROVADO' || upperRes.includes('REPROVADO') || upperRes.includes('REPROVADA')) {
                                updatedVistoria.status = 'reprovada';
                                statusDesc = ' (Reprovada)';
                            }
                        }

                        await updateOrdem(osTarget.id, { vistoria: updatedVistoria });
                        await addAuditEntry(osTarget.id, 'Laudo Processado', `Laudo da vistoria${finalLaudoUrl ? ` (${fileName}) salvo no Supabase` : ' sem PDF'}.${statusDesc}`);

                        // Força refresh imediato da OS (sem reload da página)
                        if (window.location.pathname === `/ordens/${osTarget.id}`) {
                            window.dispatchEvent(new CustomEvent('matilde-os-refresh'));
                        } else {
                            navigate(`/ordens/${osTarget.id}`);
                        }
                    }

                    // Notifica a extensão
                    if (event.source) {
                        (event.source as Window).postMessage({ source: 'MATILDE_CRM', status: 'SUCCESS' }, event.origin);
                    }

                } catch (error: any) {
                    console.error('Erro ao processar laudo da extensão:', error);
                    alert(`❌ Erro ao processar laudo: ${error.message || error}`);
                }
            }
            // ── HANDLER: UPDATE_PLACA ─────────────────────────────────────────────
            // Disparado quando a extensão detecta que a placa mudou no documento final
            else if (event.data && event.data.source === 'MATILDE_EXTENSION' && event.data.type === 'UPDATE_PLACA') {
                const { osId: upOsId, placaAntiga, placaNova } = event.data.payload;
                console.log('CRM recebeu UPDATE_PLACA:', { upOsId, placaAntiga, placaNova });

                try {
                    const { getVeiculos, saveVeiculo, getOrdens, addAuditEntry } = await import('./lib/storage');
                    const veiculos = await getVeiculos();
                    const ordens = await getOrdens();

                    // 1. Localiza o veículo pela placa antiga
                    let veiculo = veiculos.find(v => v.placa === placaAntiga);
                    if (!veiculo && upOsId) {
                        const os = ordens.find(o => o.id === upOsId);
                        if (os) veiculo = veiculos.find(v => v.id === os.veiculoId);
                    }

                    if (veiculo) {
                        // 2. Atualiza a placa
                        await saveVeiculo({ ...veiculo, placa: placaNova });
                        console.log(`Matilde: Placa atualizada de ${placaAntiga} → ${placaNova}`);

                        // 3. Registra no histórico da OS se tiver
                        if (upOsId) {
                            await addAuditEntry(upOsId, 'Placa Atualizada', `Placa alterada de ${placaAntiga} para ${placaNova} conforme documento final do Detran.`);
                        }

                        if (event.source) {
                            (event.source as Window).postMessage({ source: 'MATILDE_CRM', status: 'SUCCESS' }, event.origin);
                        }
                    } else {
                        console.warn('Matilde: Veículo com placa', placaAntiga, 'não encontrado para atualizar.');
                    }
                } catch (error: any) {
                    console.error('Erro ao processar UPDATE_PLACA:', error);
                }
            }
            // ── HANDLER: CRLV_CONSULTA_RESULTADO ──────────────────────────────────
            // Disparado quando a extensão consulta o CRLV Digital e retorna o resultado
            else if (event.data && event.data.source === 'MATILDE_EXTENSION' && event.data.type === 'CRLV_CONSULTA_RESULTADO') {
                const { osId: crlvOsId, resultado } = event.data.payload;
                console.log('CRM recebeu CRLV_CONSULTA_RESULTADO:', { crlvOsId, resultado });

                try {
                    const { getOrdens, updateOrdem, addAuditEntry } = await import('./lib/storage');
                    const ordens = await getOrdens();

                    if (crlvOsId) {
                        const osTarget = ordens.find(o => o.id === crlvOsId);
                        if (osTarget) {
                            const crlvConsulta = {
                                data: new Date().toISOString(),
                                resultado: resultado
                            };
                            await updateOrdem(osTarget.id, { crlvConsulta });
                            await addAuditEntry(osTarget.id, 'Consulta CRLV', `Resultado da consulta: ${resultado}`);
                            
                            if (window.location.pathname === `/ordens/${osTarget.id}`) {
                                window.location.reload();
                            }
                        }
                    }
                } catch (error: any) {
                    console.error('Erro ao processar CRLV_CONSULTA_RESULTADO:', error);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [navigate]);

    return null;
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <ConfirmProvider>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/*" element={
                            <ProtectedRoute>
                                <TrocarSenhaModal />
                                <ExtensionListener />
                                <Layout>
                                    <Routes>
                                        <Route path="/" element={<Navigate to="/ordens" replace />} />
                                        {/* Clientes */}
                                        <Route path="/clientes" element={<ClientesList />} />
                                        <Route path="/clientes/novo" element={<ClienteForm />} />
                                        <Route path="/clientes/:id/editar" element={<ClienteForm />} />
                                        <Route path="/clientes/:id" element={<ClienteDetail />} />
                                        {/* Veículos */}
                                        <Route path="/veiculos" element={<VeiculosList />} />
                                        <Route path="/veiculos/novo" element={<VeiculoForm />} />
                                        <Route path="/veiculos/:id/editar" element={<VeiculoForm />} />
                                        {/* Ordens de Serviço */}
                                        <Route path="/ordens" element={<OSList />} />
                                        <Route path="/ordens/nova" element={<Navigate to="/ordens" replace />} />
                                        <Route path="/ordens/:id" element={<OSDetail />} />
                                        {/* Serviços */}
                                        <Route path="/servicos" element={<ServicosDetran />} />
                                        <Route path="/calendario-vistorias" element={<VistoriaCalendar />} />
                                        {/* Protocolos */}
                                        <Route path="/protocolos" element={<ProtocoloDiario />} />
                                        <Route path="/emails" element={<Emails />} />
                                        {/* Sistema */}
                                        <Route path="/controle-pagamentos" element={<ControlePagamentos />} />
                                        <Route path="/financeiro" element={<AdminRoute><Financeiro /></AdminRoute>} />
                                        <Route path="/configuracoes" element={<AdminRoute><Configuracoes /></AdminRoute>} />
                                        <Route path="/usuarios" element={<AdminRoute><UsuariosList /></AdminRoute>} />
                                        <Route path="/backup" element={<Backup />} />
                                    </Routes>
                                </Layout>
                            </ProtectedRoute>
                        } />
                    </Routes>
                </ConfirmProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

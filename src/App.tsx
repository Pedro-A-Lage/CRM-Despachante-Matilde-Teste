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
import PainelEmpresas from './pages/PainelEmpresas';
import ControlePlacas from './pages/ControlePlacas';
import Login from './pages/Login';
import { ConfirmProvider } from './components/ConfirmProvider';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import TrocarSenhaModal from './components/TrocarSenhaModal';
import { useEffect, useState } from 'react';
import type { TipoServico } from './types';
import { temPermissao } from './lib/permissions';
import ATPVeModal, { type DadosIniciaisModal } from './components/ATPVeModal';
import PrimeiroEmplacamentoModal, { type DadosIniciaisPrimeiroEmplacamento } from './components/PrimeiroEmplacamentoModal';
import ModalSegundaVia, { type DadosIniciaisSegundaVia } from './components/ModalSegundaVia';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { usuario, carregando } = useAuth();
    if (carregando) return null;
    if (!usuario) return <Navigate to="/login" replace />;
    return <>{children}</>;
}

function PermissionRoute({ children, permissao }: { children: React.ReactNode; permissao: string }) {
    const { usuario } = useAuth();
    if (!temPermissao(usuario, 'paginas', permissao)) return <Navigate to="/" replace />;
    return <>{children}</>;
}

function ExtensionListener() {
    const navigate = useNavigate();
    const [decalqueModalOpen, setDecalqueModalOpen] = useState(false);
    const [decalqueDadosIniciais, setDecalqueDadosIniciais] = useState<DadosIniciaisModal | undefined>(undefined);
    const [decalqueModo, setDecalqueModo] = useState<'coletar' | 'revisar'>('coletar');
    const [primeiroEmplacamentoModalOpen, setPrimeiroEmplacamentoModalOpen] = useState(false);
    const [primeiroEmplacamentoDadosIniciais, setPrimeiroEmplacamentoDadosIniciais] = useState<DadosIniciaisPrimeiroEmplacamento | undefined>(undefined);
    const [primeiroEmplacamentoModo, setPrimeiroEmplacamentoModo] = useState<'coletar' | 'revisar'>('coletar');
    const [pdfPrimeiroEmplacamentoPendente, setPdfPrimeiroEmplacamentoPendente] = useState<{ fileBase64: string; fileName: string } | null>(null);
    const [segundaViaModalOpen, setSegundaViaModalOpen] = useState(false);
    const [segundaViaDadosIniciais, setSegundaViaDadosIniciais] = useState<DadosIniciaisSegundaVia | undefined>(undefined);
    const [segundaViaModo, setSegundaViaModo] = useState<'coletar' | 'revisar'>('coletar');
    const [iaStatus, setIaStatus] = useState<string | null>(null); // mensagem de status da IA

    // Helper: busca veículo existente antes de criar (evita duplicatas)
    const buscarOuCriarVeiculo = async (dados: any) => {
        const { getVeiculoByPlacaOuChassi, saveVeiculo } = await import('./lib/database');
        const existente = await getVeiculoByPlacaOuChassi(dados.placa || '', dados.chassi || '');
        if (existente) {
            console.log('[Matilde] Veículo existente encontrado:', existente.id);
            return existente;
        }
        return await saveVeiculo(dados);
    };

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
                    const { getVeiculos, getOrdens, updateOrdem, addAuditEntry, getClientes } = await import('./lib/database');
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
                    const { getVeiculos, getOrdens, updateOrdem, addAuditEntry } = await import('./lib/database');
                    const { uploadFileToSupabase } = await import('./lib/fileStorage');

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
                    const { getVeiculos, saveVeiculo, getOrdens, addAuditEntry } = await import('./lib/database');
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
                    const { getOrdens, updateOrdem, addAuditEntry } = await import('./lib/database');
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
            else if (event.data?.source === 'MATILDE_EXTENSION' && event.data?.type === 'CAPTURED_DAE_PDF') {
                const { fileBase64, fileName, placa, chassi, servicoAtivo } = event.data.payload;
                // Extensão captura o mesmo modal Decalque/DAE para múltiplos serviços.
                // Usa servicoAtivo (vindo do storage da extensão) para distinguir o tipoServico real.
                const tiposValidosDae = ['transferencia', 'alteracao_dados', 'mudanca_caracteristica', 'baixa'] as const;
                type TipoServicoDae = typeof tiposValidosDae[number];
                const tipoServicoCapturado: TipoServicoDae =
                    (tiposValidosDae as readonly string[]).includes(servicoAtivo) ? servicoAtivo : 'transferencia';
                const labelPorTipo: Record<TipoServicoDae, string> = {
                    transferencia: 'Transferência',
                    alteracao_dados: 'Alteração de Dados',
                    mudanca_caracteristica: 'Alteração de Características',
                    baixa: 'Baixa de Veículo',
                };
                const labelServico = labelPorTipo[tipoServicoCapturado];
                console.log('[Matilde] CAPTURED_DAE_PDF recebido:', { placa, chassi, hasFile: !!fileBase64, tipoServicoCapturado });
                if (!fileBase64) return;

                // PDF chegou → IA analisa → cria OS automaticamente → abre modal em revisar
                (async () => {
                    try {
                        const arr = fileBase64.split(',');
                        const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
                        const bstr = atob(arr[1] || arr[0]);
                        const u8arr = new Uint8Array(bstr.length);
                        for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
                        const safeName = fileName || `atpve_${placa || Date.now()}.pdf`;
                        const file = new File([u8arr], safeName, { type: mime });

                        setIaStatus('Matilde analisando Decalque/DAE...');
                        const { extrairDecalqueChassi } = await import('./lib/atpveAI');
                        const decalque = await extrairDecalqueChassi(file);
                        setIaStatus(`Criando OS de ${labelServico}...`);
                        console.log('[Matilde] Decalque extraído:', decalque);

                        const { saveCliente, saveVeiculo, saveOrdem, getClientes, addAuditEntry, getVeiculoByPlacaOuChassi } = await import('./lib/database');
                        const { uploadFileToSupabase } = await import('./lib/fileStorage');
                        const { gerarChecklistDinamico } = await import('./lib/configService');
                        const { finalizarOS } = await import('./lib/osService');

                        const cpfCnpj = decalque.comprador?.cpfCnpj || '';
                        const nome = decalque.comprador?.nome || '';

                        let clienteId = '';
                        let telefoneExistente = '';
                        const clientes = await getClientes();
                        const clienteEncontrado = cpfCnpj
                            ? clientes.find((c: any) => c.cpfCnpj.replace(/\D/g, '') === cpfCnpj.replace(/\D/g, ''))
                            : null;

                        if (clienteEncontrado) {
                            clienteId = clienteEncontrado.id;
                            telefoneExistente = (clienteEncontrado.telefones || [])[0] || '';
                        } else if (cpfCnpj) {
                            const novoCliente = await saveCliente({
                                tipo: cpfCnpj.replace(/\D/g, '').length <= 11 ? 'PF' : 'PJ',
                                nome, cpfCnpj, telefones: [], email: '',
                                observacoes: `Cadastrado automaticamente via ${labelServico} (Decalque/DAE)`,
                                documentos: [],
                            });
                            clienteId = novoCliente.id;
                        }

                        const veiculo = await buscarOuCriarVeiculo({
                            placa: decalque.placa || placa || '',
                            renavam: decalque.renavam || '',
                            chassi: decalque.chassi || chassi || '',
                            marcaModelo: decalque.veiculo?.marcaModelo || '',
                            clienteId,
                            observacoes: [
                                decalque.veiculo?.cor ? `Cor: ${decalque.veiculo.cor}` : '',
                                decalque.veiculo?.anoFabricacao ? `Ano: ${decalque.veiculo.anoFabricacao}/${decalque.veiculo.anoModelo}` : '',
                            ].filter(Boolean).join(' | '),
                        });

                        const tipoPessoa = cpfCnpj.replace(/\D/g, '').length <= 11 ? 'PF' : 'PJ';
                        const checklistBase = await gerarChecklistDinamico(tipoServicoCapturado, tipoPessoa);
                        const novaOrdem = await saveOrdem({
                            clienteId, veiculoId: veiculo.id, tipoServico: tipoServicoCapturado,
                            trocaPlaca: false, status: 'aguardando_documentacao', checklist: checklistBase,
                            auditLog: [{ id: crypto.randomUUID(), dataHora: new Date().toISOString(), usuario: 'Sistema',
                                acao: `OS criada automaticamente via Decalque/DAE (${labelServico})`,
                                detalhes: `Placa: ${decalque.placa} | Comprador: ${nome}` }],
                        });

                        const pdfUrl = await uploadFileToSupabase(file, `ordens/${novaOrdem.id}/${safeName}`);
                        let pdfVinculado = false;
                        const checklistAtualizado = checklistBase.map((item: any) => {
                            if (pdfVinculado) return item;
                            const n = (item.nome || '').toLowerCase();
                            if (n.includes('atpv') || n.includes('dae') || n.includes('decalque') || n.includes('ficha') || n.includes('cadastro') || n.includes('pdf')) {
                                pdfVinculado = true;
                                return { ...item, arquivo: pdfUrl, status: 'recebido', dataUpload: new Date().toISOString() };
                            }
                            return item;
                        });
                        if (!pdfVinculado && checklistAtualizado.length > 0) {
                            const idx = checklistAtualizado.findIndex((i: any) => i.status === 'pendente');
                            if (idx >= 0) checklistAtualizado[idx] = { ...checklistAtualizado[idx], arquivo: pdfUrl, status: 'recebido', dataUpload: new Date().toISOString() };
                        }
                        await saveOrdem({ ...novaOrdem, checklist: checklistAtualizado, pdfDetranUrl: pdfUrl } as any);
                        await addAuditEntry(novaOrdem.id, 'upload', `Decalque/DAE anexado: ${safeName}`);
                        try { await finalizarOS(novaOrdem.id, tipoServicoCapturado, 'carro', false); } catch {}

                        const dadosIniciais: DadosIniciaisModal = {
                            osId: novaOrdem.id, clienteId, veiculoId: veiculo.id,
                            placa: decalque.placa || placa || '', chassi: decalque.chassi || chassi || '',
                            renavam: decalque.renavam || '', valorRecibo: decalque.valorRecibo || '',
                            dataAquisicao: decalque.dataAquisicao || '',
                            tipoCpfCnpjComprador: decalque.comprador?.tipoCpfCnpj,
                            cpfCnpjComprador: cpfCnpj, nomeComprador: nome, telefone: telefoneExistente,
                            enderecoComprador: decalque.comprador?.endereco,
                            numeroComprador: decalque.comprador?.numero,
                            cepComprador: decalque.comprador?.cep,
                            bairroComprador: decalque.comprador?.bairro,
                            municipioComprador: decalque.comprador?.municipio,
                            ufComprador: decalque.comprador?.uf,
                            tipoCpfCnpjVendedor: decalque.vendedor?.tipoCpfCnpj,
                            cpfCnpjVendedor: decalque.vendedor?.cpfCnpj,
                            marcaModelo: decalque.veiculo?.marcaModelo,
                            anoFabricacao: decalque.veiculo?.anoFabricacao,
                            anoModelo: decalque.veiculo?.anoModelo,
                            cor: decalque.veiculo?.cor,
                        };
                        setDecalqueDadosIniciais(dadosIniciais);
                        setIaStatus(null);
                        setDecalqueModo('revisar');
                        setDecalqueModalOpen(true);

                    } catch (err: any) {
                        setIaStatus(null);
                        console.error('[Matilde] Erro ao processar CAPTURED_DAE_PDF:', err?.message || err);
                    }
                })();
            }
            else if (event.data?.source === 'MATILDE_EXTENSION' && event.data?.type === 'CAPTURED_PRIMEIRO_EMPLACAMENTO') {
                const { dados, fileBase64, fileName } = event.data.payload;
                console.log('[Matilde] CAPTURED_PRIMEIRO_EMPLACAMENTO recebido:', dados);

                // Sem PDF: ignorar
                if (!fileBase64) return;

                (async () => {
                    try {
                        // Converter base64 → File
                        const byteString = atob(fileBase64.split(',').pop() || fileBase64);
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                        const safeName = fileName || `ficha_primeiro_emplacamento_${Date.now()}.pdf`;
                        const file = new File([ia], safeName, { type: 'application/pdf' });

                        // IA extrai dados da ficha de cadastro
                        setIaStatus('Matilde analisando Ficha de Cadastro...');
                        const { extrairDadosFichaCadastro } = await import('./lib/fichaCadastroAI');
                        const ficha = await extrairDadosFichaCadastro(file);
                        console.log('[Matilde] Ficha PE extraída:', ficha);
                        setIaStatus('Criando OS de Primeiro Emplacamento...');

                        const { saveCliente, saveVeiculo, saveOrdem, getClienteByCpfCnpj, addAuditEntry } = await import('./lib/database');
                        const { uploadFileToSupabase } = await import('./lib/fileStorage');
                        const { gerarChecklistDinamico } = await import('./lib/configService');
                        const { finalizarOS } = await import('./lib/osService');

                        const cpfCnpj = dados?.cpfCnpjAdquirente || ficha.proprietario?.cpfCnpj || '';
                        const nome = dados?.nomeAdquirente || ficha.proprietario?.nome || '';

                        // Buscar ou criar cliente
                        let clienteId = '';
                        let telefoneExistente = '';
                        const clienteEncontrado = cpfCnpj ? await getClienteByCpfCnpj(cpfCnpj).catch(() => null) : null;

                        if (clienteEncontrado) {
                            clienteId = clienteEncontrado.id;
                            telefoneExistente = (clienteEncontrado.telefones || [])[0] || '';
                            console.log('[Matilde] Cliente PE encontrado:', clienteEncontrado.nome);
                        } else if (cpfCnpj) {
                            const cpfLimpo = cpfCnpj.replace(/\D/g, '');
                            const enderecoObs = [
                                dados?.logradouroAdquirente || ficha.proprietario?.endereco,
                                dados?.numeroAdquirente || ficha.proprietario?.numero,
                                dados?.bairroAdquirente || ficha.proprietario?.bairro,
                                dados?.cepAdquirente ? `CEP: ${dados.cepAdquirente}` : '',
                                dados?.municipioEmplacamento || ficha.proprietario?.municipio,
                            ].filter(Boolean).join(', ');

                            const novoCliente = await saveCliente({
                                tipo: cpfLimpo.length <= 11 ? 'PF' : 'PJ',
                                nome,
                                cpfCnpj,
                                telefones: [],
                                email: '',
                                observacoes: ['Cadastrado automaticamente via Primeiro Emplacamento', enderecoObs ? `Endereço: ${enderecoObs}` : ''].filter(Boolean).join(' | '),
                                documentos: [],
                            });
                            clienteId = novoCliente.id;
                            console.log('[Matilde] Novo cliente PE criado:', novoCliente.id);
                        }

                        // Criar veículo (sem placa)
                        const chassi = dados?.chassi || ficha.chassi || '';
                        const renavam = dados?.renavam || ficha.renavam || '';
                        const marcaModelo = dados?.marcaModelo || ficha.marcaModelo || '';
                        const anoFabricacao = dados?.anoFabricacao || ficha.anoFabricacao || '';
                        const anoModelo = dados?.anoModelo || ficha.anoModelo || '';
                        const tipoVeiculo = dados?.tipoVeiculo || '';

                        const veiculo = await buscarOuCriarVeiculo({
                            placa: '',
                            renavam,
                            chassi,
                            marcaModelo,
                            clienteId,
                            observacoes: [
                                tipoVeiculo ? `Tipo: ${tipoVeiculo}` : '',
                                anoFabricacao ? `Ano: ${anoFabricacao}/${anoModelo}` : '',
                            ].filter(Boolean).join(' | '),
                            dataAquisicao: '',
                            dataEmissaoCRV: '',
                        });

                        // Criar OS
                        const tipoPessoa = cpfCnpj.replace(/\D/g, '').length <= 11 ? 'PF' : 'PJ';
                        const checklist = await gerarChecklistDinamico('primeiro_emplacamento', tipoPessoa);
                        const dadosPE = {
                            chassi, renavam, marcaModelo, anoFabricacao, anoModelo, tipoVeiculo,
                            nomeAdquirente: nome,
                            cpfCnpjAdquirente: cpfCnpj,
                            rgAdquirente: dados?.rgAdquirente || '',
                            orgaoExpedidor: dados?.orgaoExpedidor || '',
                            ufOrgaoExpedidor: dados?.ufOrgaoExpedidor || '',
                            cepAdquirente: dados?.cepAdquirente || ficha.proprietario?.cep || '',
                            logradouroAdquirente: dados?.logradouroAdquirente || ficha.proprietario?.endereco || '',
                            numeroAdquirente: dados?.numeroAdquirente || ficha.proprietario?.numero || '',
                            bairroAdquirente: dados?.bairroAdquirente || ficha.proprietario?.bairro || '',
                            nomeRevendedor: dados?.nomeRevendedor || '',
                            cnpjRevendedor: dados?.cnpjRevendedor || '',
                            municipioEmplacamento: dados?.municipioEmplacamento || ficha.proprietario?.municipio || '',
                            modalidadeFinanciamento: dados?.modalidadeFinanciamento || '',
                        } as Record<string, string>;

                        const novaOrdem = await saveOrdem({
                            clienteId,
                            veiculoId: veiculo.id,
                            tipoServico: 'primeiro_emplacamento',
                            trocaPlaca: true,
                            status: 'aguardando_documentacao',
                            checklist,
                            primeiroEmplacamento: dadosPE,
                        } as any);

                        await addAuditEntry(novaOrdem.id, 'criou', 'OS de Primeiro Emplacamento criada automaticamente via extensão');

                        // Upload PDF e atualizar OS
                        const pdfPath = `ordens/${novaOrdem.id}/${safeName}`;
                        const pdfUrl = await uploadFileToSupabase(file, pdfPath);
                        let pdfVinculadoPE = false;
                        const checklistAtualizado = checklist.map((item: any) => {
                            if (pdfVinculadoPE) return item;
                            const n = (item.nome || '').toLowerCase();
                            if (n.includes('ficha') || n.includes('dae') || n.includes('decalque') || n.includes('cadastro') || n.includes('pdf')) {
                                pdfVinculadoPE = true;
                                return { ...item, arquivo: pdfUrl, status: 'recebido', dataUpload: new Date().toISOString() };
                            }
                            return item;
                        });
                        if (!pdfVinculadoPE && checklistAtualizado.length > 0) {
                            const idx = checklistAtualizado.findIndex((i: any) => i.status === 'pendente');
                            if (idx >= 0) checklistAtualizado[idx] = { ...checklistAtualizado[idx], arquivo: pdfUrl, status: 'recebido', dataUpload: new Date().toISOString() };
                        }
                        await saveOrdem({ ...novaOrdem, checklist: checklistAtualizado, pdfDetranUrl: pdfUrl, primeiroEmplacamento: { ...dadosPE, pdfFichaCadastroUrl: pdfUrl } } as any);
                        await addAuditEntry(novaOrdem.id, 'upload', `Ficha de cadastro/DAE anexada automaticamente: ${safeName}`);

                        try {
                            const tv = (tipoVeiculo === 'motocicleta' ? 'moto' : 'carro') as import('./types/finance').TipoVeiculo;
                            await finalizarOS(novaOrdem.id, 'primeiro_emplacamento', tv, true);
                        } catch {}

                        // Notificar extensão com osId
                        window.postMessage({
                            source: 'MATILDE_CRM',
                            action: 'DEFINIR_OS_PRIMEIRO_EMPLACAMENTO',
                            payload: { osId: novaOrdem.id },
                        }, '*');

                        console.log('[Matilde] OS Primeiro Emplacamento criada:', novaOrdem.id);

                        // Abrir modal em modo REVISAR para conferência
                        const dadosIniciais: DadosIniciaisPrimeiroEmplacamento = {
                            osId: novaOrdem.id,
                            clienteId,
                            veiculoId: veiculo.id,
                            chassi,
                            renavam,
                            marcaModelo,
                            anoFabricacao,
                            anoModelo,
                            tipoVeiculo,
                            nomeAdquirente: nome,
                            tipoCpfCnpjAdquirente: cpfCnpj.replace(/\D/g, '').length <= 11 ? 'CPF' : 'CNPJ',
                            cpfCnpjAdquirente: cpfCnpj,
                            rgAdquirente: dados?.rgAdquirente || '',
                            orgaoExpedidor: dados?.orgaoExpedidor || '',
                            ufOrgaoExpedidor: dados?.ufOrgaoExpedidor || '',
                            cepAdquirente: dados?.cepAdquirente || ficha.proprietario?.cep || '',
                            logradouroAdquirente: dados?.logradouroAdquirente || ficha.proprietario?.endereco || '',
                            numeroAdquirente: dados?.numeroAdquirente || ficha.proprietario?.numero || '',
                            bairroAdquirente: dados?.bairroAdquirente || ficha.proprietario?.bairro || '',
                            nomeRevendedor: dados?.nomeRevendedor || '',
                            cnpjRevendedor: dados?.cnpjRevendedor || '',
                            municipioEmplacamento: dados?.municipioEmplacamento || ficha.proprietario?.municipio || '',
                            modalidadeFinanciamento: dados?.modalidadeFinanciamento || '',
                            telefone: telefoneExistente,
                            fileBase64,
                            fileName: safeName,
                        };

                        setPrimeiroEmplacamentoDadosIniciais(dadosIniciais);
                        setIaStatus(null);
                        setPrimeiroEmplacamentoModo('revisar');
                        setPrimeiroEmplacamentoModalOpen(true);

                    } catch (err: any) {
                        setIaStatus(null);
                        console.error('[Matilde] Erro ao criar OS Primeiro Emplacamento:', err?.message || err);
                        // Fallback: abre modal sem criação automática
                        setPrimeiroEmplacamentoDadosIniciais({ ...dados, fileBase64, fileName });
                        setPrimeiroEmplacamentoModo('coletar');
                        setPrimeiroEmplacamentoModalOpen(true);
                    }
                })();
            }
            // ── VISTORIA — Dados da confirmação de agendamento voltaram do Detran ──
            else if (event.data?.source === 'MATILDE_EXTENSION' && event.data?.type === 'CAPTURED_VISTORIA') {
                const { protocolo, dataAgendamento, horaAgendamento, local, osId, placa, chassi } = event.data.payload;
                console.log('[Matilde] CAPTURED_VISTORIA recebido:', { protocolo, dataAgendamento, horaAgendamento, local, osId, placa, chassi });

                if (protocolo) {
                    (async () => {
                        try {
                            const { getOrdem, updateOrdem, addAuditEntry, getOrdens, getVeiculos } = await import('./lib/database');

                            // Buscar OS: por osId direto ou pela placa/chassi do veículo
                            let os = osId ? await getOrdem(osId) : null;
                            let resolvedOsId = osId;

                            if (!os && (placa || chassi)) {
                                console.log('[Matilde] osId nulo, buscando OS por placa/chassi:', placa, chassi);
                                const veiculos = await getVeiculos();
                                const veiculoMatch = veiculos.find((v: any) => {
                                    if (placa && v.placa && v.placa.replace(/\W/g, '').toUpperCase() === placa.replace(/\W/g, '').toUpperCase()) return true;
                                    if (chassi && v.chassi && v.chassi.toUpperCase() === chassi.toUpperCase()) return true;
                                    return false;
                                });
                                if (veiculoMatch) {
                                    const ordens = await getOrdens();
                                    const osMatch = ordens.find((o: any) => o.veiculoId === veiculoMatch.id && o.status !== 'entregue');
                                    if (osMatch) {
                                        os = osMatch;
                                        resolvedOsId = osMatch.id;
                                        console.log('[Matilde] OS encontrada por placa/chassi:', resolvedOsId);
                                    }
                                }
                            }

                            if (!os || !resolvedOsId) {
                                console.warn('[Matilde] OS não encontrada para vistoria. Placa:', placa, 'Chassi:', chassi);
                                alert(`Vistoria agendada (Protocolo: ${protocolo}), mas não foi possível encontrar a OS no CRM.\n\nPlaca: ${placa}\nChassi: ${chassi}\n\nAtualize manualmente na aba Vistoria.`);
                                return;
                            }

                            // Converter data DD/MM/YYYY → YYYY-MM-DD
                            let dataISO = '';
                            if (dataAgendamento) {
                                const partes = dataAgendamento.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                                if (partes) dataISO = `${partes[3]}-${partes[2]}-${partes[1]}`;
                            }

                            await updateOrdem(resolvedOsId, {
                                vistoria: {
                                    ...(os.vistoria || {}),
                                    status: 'agendada',
                                    protocolo,
                                    local: local || os.vistoria?.local || '',
                                    dataAgendamento: dataISO || os.vistoria?.dataAgendamento || '',
                                    horaAgendamento: horaAgendamento || os.vistoria?.horaAgendamento || '',
                                },
                            });

                            await addAuditEntry(resolvedOsId, 'Vistoria Agendada',
                                `Protocolo: ${protocolo} | ${dataAgendamento} ${horaAgendamento} | ECV: ${local}`);

                            console.log('[Matilde] Vistoria atualizada na OS:', resolvedOsId);

                            // Limpar dados da extensão
                            window.postMessage({
                                source: 'MATILDE_CRM',
                                action: 'CLEANUP_VISTORIA',
                                payload: {},
                            }, '*');

                            // Navegar para a OS com reload forçado
                            const targetUrl = `/ordens/${resolvedOsId}`;
                            if (window.location.pathname === targetUrl) {
                                // Já está na OS — forçar reload
                                window.location.reload();
                            } else {
                                navigate(targetUrl);
                                // Pequeno delay + reload para garantir dados frescos
                                setTimeout(() => window.location.reload(), 300);
                            }

                        } catch (err: any) {
                            console.error('[Matilde] Erro ao atualizar vistoria:', err?.message || err);
                        }
                    })();
                }
            }
            // ── 2ª VIA DO CRV — PDF voltou do Detran → IA analisa → cria OS → abre modal para conferência ──
            else if (event.data?.source === 'MATILDE_EXTENSION' && event.data?.type === 'CAPTURED_SEGUNDA_VIA') {
                const { dados, fileBase64, fileName } = event.data.payload;
                console.log('[Matilde] CAPTURED_SEGUNDA_VIA recebido:', { hasFile: !!fileBase64 });

                // Sem PDF: ignorar
                if (!fileBase64) return;

                (async () => {
                    try {
                        // Converter base64 → File
                        const byteString = atob(fileBase64.split(',').pop() || fileBase64);
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                        const safeName = fileName || `ficha_2via_${Date.now()}.pdf`;
                        const file = new File([ia], safeName, { type: 'application/pdf' });

                        // IA extrai dados da ficha de cadastro
                        setIaStatus('Matilde analisando Ficha de Cadastro...');
                        const { extrairDadosFichaCadastro } = await import('./lib/fichaCadastroAI');
                        const ficha = await extrairDadosFichaCadastro(file);
                        console.log('[Matilde] Ficha extraída:', ficha);
                        setIaStatus('Criando OS...');

                        // Imports de criação
                        const { saveCliente, saveVeiculo, saveOrdem, getClientes, addAuditEntry, getVeiculoByPlacaOuChassi } = await import('./lib/database');
                        const { uploadFileToSupabase } = await import('./lib/fileStorage');
                        const { gerarChecklistDinamico } = await import('./lib/configService');
                        const { finalizarOS } = await import('./lib/osService');

                        const cpfCnpj = ficha.proprietario?.cpfCnpj || dados?.cpfCnpjProprietario || '';
                        const nome = ficha.proprietario?.nome || dados?.nomeProprietario || '';

                        // Buscar ou criar cliente
                        let clienteId = '';
                        let telefoneExistente = '';
                        const clientes = await getClientes();
                        const clienteEncontrado = cpfCnpj
                            ? clientes.find(c => c.cpfCnpj.replace(/\D/g, '') === cpfCnpj.replace(/\D/g, ''))
                            : null;

                        if (clienteEncontrado) {
                            clienteId = clienteEncontrado.id;
                            telefoneExistente = (clienteEncontrado.telefones || [])[0] || '';
                            console.log('[Matilde] Cliente encontrado:', clienteEncontrado.nome);
                        } else {
                            const cpfLimpo = cpfCnpj.replace(/\D/g, '');
                            const enderecoCompleto = [
                                ficha.proprietario?.endereco || dados?.endereco,
                                ficha.proprietario?.numero || dados?.numero,
                                ficha.proprietario?.bairro || dados?.bairro,
                                ficha.proprietario?.cep ? `CEP: ${ficha.proprietario.cep}` : dados?.cep ? `CEP: ${dados.cep}` : '',
                                ficha.proprietario?.municipio || dados?.municipio,
                                ficha.proprietario?.uf || dados?.uf,
                            ].filter(Boolean).join(', ');

                            const novoCliente = await saveCliente({
                                tipo: cpfLimpo.length <= 11 ? 'PF' : 'PJ',
                                nome,
                                cpfCnpj,
                                telefones: [],
                                email: '',
                                observacoes: ['Cadastrado automaticamente via 2ª Via', enderecoCompleto ? `Endereço: ${enderecoCompleto}` : ''].filter(Boolean).join(' | '),
                                documentos: [],
                            });
                            clienteId = novoCliente.id;
                            console.log('[Matilde] Novo cliente criado:', novoCliente.id);
                        }

                        // Criar veículo
                        const veiculo = await buscarOuCriarVeiculo({
                            placa: ficha.placa || dados?.placa || '',
                            renavam: ficha.renavam || dados?.renavam || '',
                            chassi: ficha.chassi || dados?.chassi || '',
                            marcaModelo: ficha.marcaModelo || dados?.marcaModelo || '',
                            clienteId,
                            categoria: ficha.categoria || dados?.categoria || undefined,
                            observacoes: [
                                ficha.cor ? `Cor: ${ficha.cor}` : '',
                                ficha.anoFabricacao ? `Ano: ${ficha.anoFabricacao}/${ficha.anoModelo}` : '',
                                ficha.combustivel ? `Combustível: ${ficha.combustivel}` : '',
                            ].filter(Boolean).join(' | '),
                        });

                        // Criar OS
                        const tipoPessoa = cpfCnpj.replace(/\D/g, '').length <= 11 ? 'PF' : 'PJ';
                        const checklistBase = await gerarChecklistDinamico('segunda_via', tipoPessoa);
                        const novaOrdem = await saveOrdem({
                            clienteId,
                            veiculoId: veiculo.id,
                            tipoServico: 'segunda_via',
                            trocaPlaca: false,
                            status: 'aguardando_documentacao',
                            checklist: checklistBase,
                            auditLog: [{
                                id: crypto.randomUUID(),
                                dataHora: new Date().toISOString(),
                                usuario: 'Sistema',
                                acao: 'OS criada automaticamente via Ficha de Cadastro (2ª Via)',
                                detalhes: `Placa: ${ficha.placa || dados?.placa} | Proprietário: ${nome}`,
                            }],
                        });

                        // Upload PDF e atualizar checklist
                        const pdfPath = `ordens/${novaOrdem.id}/${safeName}`;
                        const pdfUrl = await uploadFileToSupabase(file, pdfPath);
                        // Vincular PDF ao item do checklist: busca por nome, ou marca o primeiro pendente
                        let pdfVinculado = false;
                        const checklistAtualizado = checklistBase.map((item: any) => {
                            if (pdfVinculado) return item;
                            const n = (item.nome || '').toLowerCase();
                            if (n.includes('ficha') || n.includes('dae') || n.includes('decalque') || n.includes('cadastro') || n.includes('pdf')) {
                                pdfVinculado = true;
                                return { ...item, arquivo: pdfUrl, status: 'recebido', dataUpload: new Date().toISOString() };
                            }
                            return item;
                        });
                        // Se nenhum item correspondeu, marca o primeiro pendente
                        if (!pdfVinculado && checklistAtualizado.length > 0) {
                            const idx = checklistAtualizado.findIndex((i: any) => i.status === 'pendente');
                            if (idx >= 0) checklistAtualizado[idx] = { ...checklistAtualizado[idx], arquivo: pdfUrl, status: 'recebido', dataUpload: new Date().toISOString() };
                        }
                        await saveOrdem({ ...novaOrdem, checklist: checklistAtualizado, pdfDetranUrl: pdfUrl } as any);
                        await addAuditEntry(novaOrdem.id, 'upload', `Ficha de Cadastro/DAE anexada automaticamente: ${safeName}`);

                        try { await finalizarOS(novaOrdem.id, 'segunda_via', 'carro', false); } catch {}

                        console.log('[Matilde] OS 2ª Via criada:', novaOrdem.id);

                        // Abrir modal em modo REVISAR para conferência
                        const dadosIniciais: DadosIniciaisSegundaVia = {
                            osId: novaOrdem.id,
                            clienteId,
                            veiculoId: veiculo.id,
                            placa: ficha.placa || dados?.placa,
                            chassi: ficha.chassi || dados?.chassi,
                            renavam: ficha.renavam || dados?.renavam,
                            marcaModelo: ficha.marcaModelo || dados?.marcaModelo,
                            anoFabricacao: ficha.anoFabricacao || dados?.anoFabricacao,
                            anoModelo: ficha.anoModelo || dados?.anoModelo,
                            cor: ficha.cor || dados?.cor,
                            categoria: ficha.categoria || dados?.categoria,
                            combustivel: ficha.combustivel || dados?.combustivel,
                            nomeProprietario: nome,
                            cpfCnpjProprietario: cpfCnpj,
                            telefone: telefoneExistente,
                            cep: ficha.proprietario?.cep || dados?.cep,
                            endereco: ficha.proprietario?.endereco || dados?.endereco,
                            numero: ficha.proprietario?.numero || dados?.numero,
                            bairro: ficha.proprietario?.bairro || dados?.bairro,
                            municipio: ficha.proprietario?.municipio || dados?.municipio,
                            uf: ficha.proprietario?.uf || dados?.uf,
                            fileBase64,
                            fileName: safeName,
                        };

                        setSegundaViaDadosIniciais(dadosIniciais);
                        setIaStatus(null);
                        setSegundaViaModo('revisar');
                        setSegundaViaModalOpen(true);

                    } catch (err: any) {
                        setIaStatus(null);
                        console.error('[Matilde] Erro ao criar OS 2ª Via:', err?.message || err);
                        // Fallback: abre modal sem criação automática para o usuário resolver
                        const dadosIniciais: DadosIniciaisSegundaVia = {
                            placa: dados?.placa,
                            chassi: dados?.chassi,
                            renavam: dados?.renavam,
                            nomeProprietario: dados?.nomeProprietario,
                            cpfCnpjProprietario: dados?.cpfCnpjProprietario,
                            fileBase64,
                            fileName: fileName || `ficha_2via_${Date.now()}.pdf`,
                        };
                        setSegundaViaDadosIniciais(dadosIniciais);
                        setSegundaViaModo('coletar');
                        setSegundaViaModalOpen(true);
                    }
                })();
            }
            else if (event.data?.source === 'MATILDE_EXTENSION' && event.data?.type === 'CAPTURED_PRIMEIRO_EMPLACAMENTO_PDF') {
                const { fileBase64, fileName } = event.data.payload;
                console.log('[Matilde] PDF Primeiro Emplacamento recebido:', { hasFile: !!fileBase64 });
                if (!fileBase64) return;

                // PDF chegou → IA analisa → cria OS automaticamente → abre modal em revisar
                (async () => {
                    try {
                        const byteString = atob(fileBase64.split(',').pop() || fileBase64);
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                        const safeName = fileName || `ficha_primeiro_emplacamento_${Date.now()}.pdf`;
                        const file = new File([ia], safeName, { type: 'application/pdf' });

                        // IA extrai dados da Ficha de Cadastro/DAE
                        setIaStatus('Matilde analisando Ficha de Cadastro...');
                        const { extrairDadosFichaCadastro } = await import('./lib/fichaCadastroAI');
                        const ficha = await extrairDadosFichaCadastro(file);
                        console.log('[Matilde] Ficha Primeiro Emplacamento extraída:', ficha);
                        setIaStatus('Criando OS de Primeiro Emplacamento...');

                        const { saveCliente, saveVeiculo, saveOrdem, getClientes, addAuditEntry, getVeiculoByPlacaOuChassi } = await import('./lib/database');
                        const { uploadFileToSupabase } = await import('./lib/fileStorage');
                        const { gerarChecklistDinamico } = await import('./lib/configService');
                        const { finalizarOS } = await import('./lib/osService');

                        const cpfCnpj = ficha.proprietario?.cpfCnpj || '';
                        const nome = ficha.proprietario?.nome || '';

                        // Buscar ou criar cliente
                        let clienteId = '';
                        let telefoneExistente = '';
                        const clientes = await getClientes();
                        const clienteEncontrado = cpfCnpj
                            ? clientes.find((c: any) => c.cpfCnpj.replace(/\D/g, '') === cpfCnpj.replace(/\D/g, ''))
                            : null;

                        if (clienteEncontrado) {
                            clienteId = clienteEncontrado.id;
                            telefoneExistente = (clienteEncontrado.telefones || [])[0] || '';
                        } else if (cpfCnpj) {
                            const novoCliente = await saveCliente({
                                tipo: cpfCnpj.replace(/\D/g, '').length <= 11 ? 'PF' : 'PJ',
                                nome, cpfCnpj, telefones: [], email: '',
                                observacoes: 'Cadastrado automaticamente via Primeiro Emplacamento',
                                documentos: [],
                            });
                            clienteId = novoCliente.id;
                        }

                        // Criar veículo
                        const veiculo = await buscarOuCriarVeiculo({
                            placa: ficha.placa || '',
                            renavam: ficha.renavam || '',
                            chassi: ficha.chassi || '',
                            marcaModelo: ficha.marcaModelo || '',
                            clienteId,
                            observacoes: [
                                ficha.cor ? `Cor: ${ficha.cor}` : '',
                                ficha.anoFabricacao ? `Ano: ${ficha.anoFabricacao}/${ficha.anoModelo}` : '',
                                ficha.combustivel ? `Combustível: ${ficha.combustivel}` : '',
                            ].filter(Boolean).join(' | '),
                        });

                        // Criar OS
                        const tipoPessoa = cpfCnpj.replace(/\D/g, '').length <= 11 ? 'PF' : 'PJ';
                        const checklistBase = await gerarChecklistDinamico('primeiro_emplacamento', tipoPessoa);
                        const novaOrdem = await saveOrdem({
                            clienteId, veiculoId: veiculo.id, tipoServico: 'primeiro_emplacamento',
                            trocaPlaca: true, status: 'aguardando_documentacao', checklist: checklistBase,
                            auditLog: [{ id: crypto.randomUUID(), dataHora: new Date().toISOString(), usuario: 'Sistema',
                                acao: 'OS criada automaticamente via Ficha de Cadastro (Primeiro Emplacamento)',
                                detalhes: `Chassi: ${ficha.chassi} | Adquirente: ${nome}` }],
                        });

                        // Upload PDF e atualizar checklist
                        const pdfUrl = await uploadFileToSupabase(file, `ordens/${novaOrdem.id}/${safeName}`);
                        // Vincular PDF ao item do checklist: busca por nome, ou marca o primeiro pendente
                        let pdfVinculado = false;
                        const checklistAtualizado = checklistBase.map((item: any) => {
                            if (pdfVinculado) return item;
                            const n = (item.nome || '').toLowerCase();
                            if (n.includes('ficha') || n.includes('dae') || n.includes('decalque') || n.includes('cadastro') || n.includes('pdf')) {
                                pdfVinculado = true;
                                return { ...item, arquivo: pdfUrl, status: 'recebido', dataUpload: new Date().toISOString() };
                            }
                            return item;
                        });
                        // Se nenhum item correspondeu, marca o primeiro pendente
                        if (!pdfVinculado && checklistAtualizado.length > 0) {
                            const idx = checklistAtualizado.findIndex((i: any) => i.status === 'pendente');
                            if (idx >= 0) checklistAtualizado[idx] = { ...checklistAtualizado[idx], arquivo: pdfUrl, status: 'recebido', dataUpload: new Date().toISOString() };
                        }
                        await saveOrdem({ ...novaOrdem, checklist: checklistAtualizado, pdfDetranUrl: pdfUrl } as any);
                        await addAuditEntry(novaOrdem.id, 'upload', `Ficha de Cadastro/DAE anexada: ${safeName}`);
                        try { await finalizarOS(novaOrdem.id, 'primeiro_emplacamento', 'carro', false); } catch {}

                        console.log('[Matilde] OS Primeiro Emplacamento criada:', novaOrdem.id);

                        // Abrir modal em revisar
                        const dadosIniciais: DadosIniciaisPrimeiroEmplacamento = {
                            osId: novaOrdem.id, clienteId, veiculoId: veiculo.id,
                            chassi: ficha.chassi, renavam: ficha.renavam,
                            marcaModelo: ficha.marcaModelo,
                            anoFabricacao: ficha.anoFabricacao, anoModelo: ficha.anoModelo,
                            tipoVeiculo: ficha.tipoVeiculo,
                            tipoCpfCnpjAdquirente: cpfCnpj.replace(/\D/g, '').length <= 11 ? 'CPF' : 'CNPJ',
                            cpfCnpjAdquirente: cpfCnpj, nomeAdquirente: nome,
                            rgAdquirente: ficha.proprietario?.docIdentidade,
                            orgaoExpedidor: ficha.proprietario?.orgaoExpedidor,
                            ufOrgaoExpedidor: ficha.proprietario?.ufOrgaoExpedidor,
                            telefone: telefoneExistente,
                            cepAdquirente: ficha.proprietario?.cep,
                            logradouroAdquirente: ficha.proprietario?.endereco,
                            numeroAdquirente: ficha.proprietario?.numero,
                            bairroAdquirente: ficha.proprietario?.bairro,
                            municipioEmplacamento: ficha.municipioEmplacamento || ficha.proprietario?.municipio,
                            nomeRevendedor: ficha.proprietarioAnterior?.nome,
                            cnpjRevendedor: ficha.proprietarioAnterior?.cpfCnpj,
                            fileBase64, fileName: safeName,
                        };
                        setPrimeiroEmplacamentoDadosIniciais(dadosIniciais);
                        setIaStatus(null);
                        setPrimeiroEmplacamentoModo('revisar');
                        setPrimeiroEmplacamentoModalOpen(true);

                    } catch (err: any) {
                        setIaStatus(null);
                        console.error('[Matilde] Erro ao processar PDF Primeiro Emplacamento:', err?.message || err);
                    }
                })();
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [navigate]);

    function notificarCleanupPrimeiroEmplacamento() {
        window.postMessage({
            source: 'MATILDE_CRM',
            action: 'CLEANUP_PRIMEIRO_EMPLACAMENTO',
            payload: {},
        }, '*');
    }

    return (
        <>
            {/* Banner flutuante: IA processando */}
            {iaStatus && (
                <div style={{
                    position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 99999, display: 'flex', alignItems: 'center', gap: 12,
                    background: 'linear-gradient(135deg, #1e293b, #334155)',
                    color: '#fff', padding: '14px 28px', borderRadius: 14,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontSize: '0.95rem', fontWeight: 600,
                    animation: 'matilde-ia-fade-in 0.3s ease-out',
                }}>
                    <style>{`
                        @keyframes matilde-ia-fade-in { from { opacity: 0; transform: translateX(-50%) translateY(-20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
                        @keyframes matilde-ia-spin { to { transform: rotate(360deg); } }
                        @keyframes matilde-ia-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
                    `}</style>
                    <div style={{ position: 'relative', width: 28, height: 28 }}>
                        <div style={{
                            width: 28, height: 28, border: '3px solid rgba(255,255,255,0.2)',
                            borderTopColor: '#06b6d4', borderRadius: '50%',
                            animation: 'matilde-ia-spin 1s linear infinite',
                        }} />
                        <span style={{
                            position: 'absolute', top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)', fontSize: 14,
                            animation: 'matilde-ia-pulse 1.5s ease-in-out infinite',
                        }}>🤖</span>
                    </div>
                    {iaStatus}
                </div>
            )}
            <ATPVeModal
                isOpen={decalqueModalOpen}
                onClose={() => { setDecalqueModalOpen(false); setDecalqueDadosIniciais(undefined); setDecalqueModo('coletar'); }}
                onSuccess={(osId) => { setDecalqueModalOpen(false); setDecalqueDadosIniciais(undefined); setDecalqueModo('coletar'); navigate(`/ordens/${osId}`); }}
                dadosIniciais={decalqueDadosIniciais}
                modo={decalqueModo}
            />
            <PrimeiroEmplacamentoModal
                isOpen={primeiroEmplacamentoModalOpen}
                onClose={() => {
                    setPrimeiroEmplacamentoModalOpen(false);
                    setPrimeiroEmplacamentoDadosIniciais(undefined);
                    setPrimeiroEmplacamentoModo('coletar');
                    notificarCleanupPrimeiroEmplacamento();
                }}
                modo={primeiroEmplacamentoModo}
                onSuccess={async (osId) => {
                    setPrimeiroEmplacamentoModalOpen(false);
                    setPrimeiroEmplacamentoDadosIniciais(undefined);
                    setPrimeiroEmplacamentoModo('coletar');
                    // Anexar PDF pendente se houver
                    if (pdfPrimeiroEmplacamentoPendente) {
                        const { fileBase64, fileName } = pdfPrimeiroEmplacamentoPendente;
                        setPdfPrimeiroEmplacamentoPendente(null);
                        try {
                            const { uploadFileToSupabase } = await import('./lib/fileStorage');
                            const { saveOrdem, getOrdem, addAuditEntry } = await import('./lib/database');
                            const byteString = atob(fileBase64.split(',').pop() || fileBase64);
                            const ab = new ArrayBuffer(byteString.length);
                            const ia = new Uint8Array(ab);
                            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                            const blob = new Blob([ab], { type: 'application/pdf' });
                            const file = new File([blob], fileName, { type: 'application/pdf' });
                            const pdfPath = `ordens/${osId}/${fileName}`;
                            const pdfUrl = await uploadFileToSupabase(file, pdfPath);
                            const os = await getOrdem(osId);
                            if (os) {
                                await saveOrdem({ ...os, pdfDetranUrl: pdfUrl, primeiroEmplacamento: { ...(os.primeiroEmplacamento || {}), pdfFichaCadastroUrl: pdfUrl } } as any);
                                await addAuditEntry(osId, 'upload', `Ficha de cadastro/DAE anexada: ${fileName}`);
                            }
                            console.log('[Matilde] PDF pendente anexado à OS:', osId);
                        } catch (err: any) {
                            console.error('[Matilde] Erro ao anexar PDF pendente:', err?.message || err);
                        }
                    }
                    navigate(`/ordens/${osId}`);
                }}
                dadosIniciais={primeiroEmplacamentoDadosIniciais}
            />
            <ModalSegundaVia
                isOpen={segundaViaModalOpen}
                onClose={() => { setSegundaViaModalOpen(false); setSegundaViaDadosIniciais(undefined); setSegundaViaModo('coletar'); }}
                onSuccess={(osId) => { setSegundaViaModalOpen(false); setSegundaViaDadosIniciais(undefined); setSegundaViaModo('coletar'); navigate(`/ordens/${osId}`); }}
                dadosIniciais={segundaViaDadosIniciais}
                modo={segundaViaModo}
            />
        </>
    );
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
                                        <Route path="/ordens/:id" element={<OSDetail />} />
                                        {/* Serviços */}
                                        <Route path="/servicos" element={<ServicosDetran />} />
                                        <Route path="/calendario-vistorias" element={<VistoriaCalendar />} />
                                        {/* Protocolos */}
                                        <Route path="/protocolos" element={<ProtocoloDiario />} />
                                        <Route path="/emails" element={<Emails />} />
                                        {/* Sistema */}
                                        <Route path="/painel-empresas" element={<PainelEmpresas />} />
                                        <Route path="/controle-placas" element={<ControlePlacas />} />
                                        <Route path="/controle-pagamentos" element={<PermissionRoute permissao="controle_pagamentos"><ControlePagamentos /></PermissionRoute>} />
                                        <Route path="/financeiro" element={<PermissionRoute permissao="financeiro"><Financeiro /></PermissionRoute>} />
                                        <Route path="/configuracoes" element={<PermissionRoute permissao="configuracoes"><Configuracoes /></PermissionRoute>} />
                                        <Route path="/usuarios" element={<PermissionRoute permissao="usuarios"><UsuariosList /></PermissionRoute>} />
                                        <Route path="/backup" element={<PermissionRoute permissao="backup"><Backup /></PermissionRoute>} />
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

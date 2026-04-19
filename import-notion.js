import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// CONFIGURAÇÃO SUPABASE
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) { console.error('SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidos como variáveis de ambiente.'); process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const CSV_FILE = 'notion_export.csv';

// Mapeamento de Status
function mapStatus(entradaDelegacia, vistoriaStatus) {
    if (entradaDelegacia === 'Doc Pronto') return 'doc_pronto';
    if (vistoriaStatus === 'Vistoria Feita') return 'vistoria';
    return 'aguardando_documentacao';
}

// Mapeamento de Serviço
function mapServico(servico) {
    const s = servico?.toUpperCase() || '';
    if (s.includes('TRANSFERÊNCIA')) return 'transferencia';
    if (s.includes('PRIMEIRO EMPLACAMENTO')) return 'primeiro_emplacamento';
    if (s.includes('ALTERAÇÃO')) return 'alteracao_dados';
    // Adicione outros mapeamentos conforme necessário
    return 'transferencia'; // default
}

// Parser CSV RFC 4180 mínimo: lida com campos entre aspas contendo vírgulas,
// newlines e aspas duplicadas (""). Retorna array de arrays de strings.
function parseCsv(input) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < input.length; i++) {
        const c = input[i];
        if (inQuotes) {
            if (c === '"') {
                if (input[i + 1] === '"') { field += '"'; i++; }
                else { inQuotes = false; }
            } else {
                field += c;
            }
        } else {
            if (c === '"') inQuotes = true;
            else if (c === ',') { row.push(field); field = ''; }
            else if (c === '\r') { /* ignora — \n cuida do break */ }
            else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else field += c;
        }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
}

async function importData() {
    console.log("Iniciando importação do Notion...");

    if (!fs.existsSync(CSV_FILE)) {
        console.error(`Arquivo ${CSV_FILE} não encontrado. Exporte do Notion e salve com este nome.`);
        return;
    }

    const content = fs.readFileSync(CSV_FILE, 'utf-8');
    const rows = parseCsv(content);
    if (rows.length === 0) { console.error('CSV vazio.'); return; }
    const headers = rows[0].map(h => h.trim());

    // Função auxiliar para pegar valor por header
    const getVal = (row, headerName) => {
        const idx = headers.indexOf(headerName);
        if (idx === -1) return '';
        return (row[idx] ?? '').trim();
    };

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        // Linhas completamente vazias (ex: trailing newline) são puladas
        if (row.every((v) => !v || !v.trim())) continue;

        const nome = getVal(row, 'Name'); // Ou o nome da coluna no seu Notion
        const cpfCnpj = getVal(row, 'CPF/CNPJ').replace(/[^\d]/g, '');
        const placa = getVal(row, 'Placa').toUpperCase();
        const chassi = getVal(row, 'Chassi').toUpperCase();
        const renavam = getVal(row, 'Renavam');
        const servico = getVal(row, 'Serviço');
        const statusNotion = getVal(row, 'Entrada Delegacia');
        const vistoriaNotion = getVal(row, 'Vistoria');

        if (!nome || !cpfCnpj) continue;

        console.log(`Processando: ${nome} - ${placa}`);

        // 1. Cliente
        let { data: cliente, error: cliError } = await supabase
            .from('clientes')
            .upsert({
                nome: nome.toUpperCase(),
                cpf_cnpj: cpfCnpj,
                tipo: cpfCnpj.length > 11 ? 'PJ' : 'PF',
                telefones: [getVal(row, 'Telefone'), getVal(row, 'Telefone 2')].filter(Boolean)
            }, { onConflict: 'cpf_cnpj' })
            .select()
            .single();

        if (cliError) {
            console.error("Erro cliente:", cliError);
            continue;
        }

        // 2. Veículo
        let { data: veiculo, error: veiError } = await supabase
            .from('veiculos')
            .upsert({
                cliente_id: cliente.id,
                placa,
                chassi,
                renavam,
                marca_modelo: getVal(row, 'Marca/Modelo').toUpperCase(),
                data_aquisicao: getVal(row, 'Data Recibo')
            }, { onConflict: 'placa' })
            .select()
            .single();

        if (veiError) {
            console.error("Erro veículo:", veiError);
            continue;
        }

        // 3. Ordem de Serviço
        const { error: osError } = await supabase
            .from('ordens_de_servico')
            .insert({
                cliente_id: cliente.id,
                veiculo_id: veiculo.id,
                tipo_servico: mapServico(servico),
                status: mapStatus(statusNotion, vistoriaNotion),
                data_abertura: getVal(row, 'Início Processo') || new Date().toISOString(),
                doc_pronto_em: getVal(row, 'Doc Pronto'),
                pasta_drive_url: getVal(row, 'Pasta'),
                vistoria: {
                    local: getVal(row, 'Local Vistoria'),
                    dataAgendamento: getVal(row, 'Data Vistoria'),
                    status: vistoriaNotion === 'Vistoria Feita' ? 'aprovada' : 'agendar'
                }
            });

        if (osError) console.error("Erro OS:", osError);
    }

    console.log("Importação concluída.");
}

importData().catch(console.error);

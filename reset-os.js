import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) { console.error('SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidos como variáveis de ambiente.'); process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function clearTable(tableName) {
    console.log(`Limpando tabela: ${tableName}...`);
    // Usamos um filtro que sempre é verdadeiro (id não é nulo) para deletar tudo
    const { error } = await supabase.from(tableName).delete().filter('id', 'neq', '00000000-0000-0000-0000-000000000000');
    if (error) {
        console.error(`Erro ao limpar ${tableName}:`, error.message);
    } else {
        console.log(`Tabela ${tableName} limpa com sucesso.`);
    }
}

async function main() {
    console.log("Iniciando limpeza de Ordens de Serviço...");

    // Limpa apenas as ordens de serviço
    await clearTable('ordens_de_servico');

    console.log("Limpeza concluída.");
    console.log("IMPORTANTE: Se desejar limpar também Clientes e Veículos, use o script reset-db.js.");
}

main().catch(console.error);

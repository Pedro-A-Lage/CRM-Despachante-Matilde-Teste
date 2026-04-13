import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) { console.error('SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidos como variáveis de ambiente.'); process.exit(1); }
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function clean() {
  console.log('\n🧹 Limpando dados importados do CSV...\n');

  // 1. Apagar todas as OS
  const { error: e1, count: c1 } = await supabase
    .from('ordens_de_servico')
    .delete({ count: 'exact' })
    .neq('id', 'placeholder-nao-existe');

  console.log(`  Ordens de serviço apagadas: ${c1 ?? '?'} ${e1 ? `❌ ${e1.message}` : '✅'}`);

  // 2. Apagar todos os veículos
  const { error: e2, count: c2 } = await supabase
    .from('veiculos')
    .delete({ count: 'exact' })
    .neq('id', 'placeholder-nao-existe');

  console.log(`  Veículos apagados: ${c2 ?? '?'} ${e2 ? `❌ ${e2.message}` : '✅'}`);

  // 3. Apagar todos os clientes
  const { error: e3, count: c3 } = await supabase
    .from('clientes')
    .delete({ count: 'exact' })
    .neq('id', 'placeholder-nao-existe');

  console.log(`  Clientes apagados: ${c3 ?? '?'} ${e3 ? `❌ ${e3.message}` : '✅'}`);

  console.log('\n✅ Banco limpo! Pode rodar o import agora.\n');
}

clean().catch(console.error);

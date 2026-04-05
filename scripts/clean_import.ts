import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mrcclxbzdwarfhgygikc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yY2NseGJ6ZHdhcmZoZ3lnaWtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MzQ1NTAsImV4cCI6MjA4ODExMDU1MH0.J4bYHtJRT6AEhThY1RvovpTPUC_kjakH6U7S-NXVeno'
);

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

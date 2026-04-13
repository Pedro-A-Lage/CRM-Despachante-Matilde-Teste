import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) { console.error('SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidos como variáveis de ambiente.'); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const { data: cl } = await sb.from('clientes').select('id').limit(1).single();
const { data: vc } = await sb.from('veiculos').select('id').limit(1).single();
if (!cl || !vc) { console.error('Sem clientes/veículos para testar.'); process.exit(1); }

const baseId = `diag${Date.now().toString(36)}`;
const ts = new Date().toISOString();

// Campos suspeitos que podem não existir no banco real
const candidatos = [
  'observacao_geral',
  'prioridade',
  'pendencia',
  'vistoria_history',
  'comunicacoes',
  'audit_log',
  'doc_pronto_em',
  'entregue_em',
  'vistoria',
  'delegacia',
];

for (const campo of candidatos) {
  const payload: Record<string, any> = {
    id: `${baseId}-${campo}`,
    data_abertura: ts,
    cliente_id: cl.id,
    veiculo_id: vc.id,
    tipo_servico: 'transferencia',
    troca_placa: false,
    status: 'aguardando_documentacao',
    checklist: [],
    criado_em: ts,
    atualizado_em: ts,
  };
  // Adicionar o campo suspeito
  payload[campo] = campo.endsWith('_em') ? null : (campo === 'prioridade' ? 'normal' : campo === 'pendencia' ? 'teste' : campo === 'observacao_geral' ? '' : []);
  
  const { error } = await sb.from('ordens_de_servico').insert(payload);
  if (error) {
    console.log(`❌ FALHOU com "${campo}": ${error.message}`);
  } else {
    console.log(`✅ OK com "${campo}"`);
    // Limpar
    await sb.from('ordens_de_servico').delete().eq('id', payload.id);
  }
}
console.log('\nDiagnóstico concluído.');

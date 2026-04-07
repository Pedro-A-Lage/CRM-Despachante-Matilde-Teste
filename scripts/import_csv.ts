import fs from 'fs';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';

// Conexão com o Supabase
const SUPABASE_URL = 'https://mrcclxbzdwarfhgygikc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yY2NseGJ6ZHdhcmZoZ3lnaWtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MzQ1NTAsImV4cCI6MjA4ODExMDU1MH0.J4bYHtJRT6AEhThY1RvovpTPUC_kjakH6U7S-NXVeno';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CSV_FILE_PATH = 'dist/Cadastro Cliente.csv';

// Altere para um número (ex: 5) para testar com poucas linhas
const TEST_LIMIT = Infinity;

// -----------------------------------------
// MAPEAMENTO DE COLUNAS DO CSV:
// 0  - Nome Cliente
// 1  - CPF/CNPJ
// 2  - Chassi
// 3  - Data Entrada     → data de entrada na DELEGACIA
// 4  - Data Recibo      → veiculo.data_aquisicao (campo "Recibo" no CRM)
// 5  - Data Vistoria
// 6  - Doc Pronto
// 7  - Documento Entregue
// 8  - Documentos Pendentes
// 9  - Entrada Delegacia → TIPO: "Entrada", "Reentrada", "SIFAP"
//                          Reentrada → tipo:'reentrada' + observacao:'assinatura'
//                          SIFAP     → troca_placa:true + sifap.necessario:true
// 10 - Início Processo  → data_abertura da OS
// 11 - Local Vistoria
// 12 - Marca/Modelo
// 13 - Placa
// 14 - Renavam
// 15 - Serviço
// 16 - Telefone
// 17 - Telefone 2
// 18 - Vistoria (status)
// -----------------------------------------

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function parseDataBR(data: string): string | null {
  if (!data || data.trim() === '') return null;
  const parts = data.trim().split('/');
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    if (yyyy.length === 4) return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T12:00:00.000Z`;
  }
  return null;
}

function inferirTipoServico(servicoRaw: string): string {
  const s = (servicoRaw || '').toLowerCase();
  if (s.includes('2 via') || s.includes('segunda via')) return 'segunda_via';
  if (s.includes('alter') || s.includes('dados')) return 'alteracao_dados';
  if (s.includes('primeiro emplacamento')) return 'primeiro_emplacamento';
  if (s.includes('baixa')) return 'baixa';
  if (s.includes('caracteristica') || s.includes('característica')) return 'mudanca_caracteristica';
  if (s.includes('categoria')) return 'mudanca_categoria';
  if (s.includes('vistoria lacrada') || s.includes('laudo')) return 'vistoria_lacrada';
  return 'transferencia';
}

// -----------------------------------------
// SCRIPT PRINCIPAL
// -----------------------------------------
async function runImport() {
  console.log(`\n=========================================`);
  console.log(`  Importação CSV -> Supabase`);
  console.log(`  Limite: ${TEST_LIMIT === Infinity ? 'COMPLETO' : `${TEST_LIMIT} linhas (Teste)`}`);
  console.log(`=========================================\n`);

  const fileStream = fs.createReadStream(CSV_FILE_PATH, { encoding: 'latin1' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let isHeader = true;
  let lineNum = 0;
  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;

    const cols = line.split(';');

    // -- Extração das colunas (com mapeamento correto) --
    const nome               = cols[0]?.trim() || '';
    const cpfCnpjRaw         = cols[1]?.trim() || '';
    const chassi             = cols[2]?.trim() || '';
    const dataEntradaDelRaw  = cols[3]?.trim() || '';  // Data Entrada = data foi à delegacia
    const dataReciboRaw      = cols[4]?.trim() || '';  // Data Recibo → veiculo.data_aquisicao
    const dataVistoriaRaw    = cols[5]?.trim() || '';
    const docProntoRaw       = cols[6]?.trim() || '';
    const entregueRaw        = cols[7]?.trim() || '';
    const docsPendentes      = cols[8]?.trim() || '';
    const tipoDelegaciaRaw   = cols[9]?.trim() || '';  // "Entrada", "Reentrada", "SIFAP"
    const inicioProcRaw      = cols[10]?.trim() || ''; // Início Processo → data_abertura da OS
    const localVistoria      = cols[11]?.trim() || '';
    const marcaModelo        = cols[12]?.trim() || '';
    const placaRaw           = cols[13]?.trim() || '';
    const renavam            = cols[14]?.trim() || '';
    const servicoRaw         = cols[15]?.trim() || '';
    const tel1               = cols[16]?.trim() || '';
    const tel2               = cols[17]?.trim() || '';
    const vistoriaStatus     = cols[18]?.trim() || '';

    if (!nome) { skipCount++; continue; }

    const cpf_cnpj  = cpfCnpjRaw.replace(/\D/g, '') || '00000000000000';
    const placa     = placaRaw.replace(/[-\s]/g, '').toUpperCase() || `SEMPLACA${lineNum}`;
    const telefones = [tel1, tel2].filter(t => t.length > 4);

    // -- Datas parseadas --
    const dataAbertura      = parseDataBR(inicioProcRaw) || parseDataBR(dataEntradaDelRaw) || new Date().toISOString();
    const dataDelegacia     = parseDataBR(dataEntradaDelRaw);  // quando foi à delegacia
    const dataRecibo        = parseDataBR(dataReciboRaw);       // data do recibo → vai pro veículo
    const doc_pronto_em     = parseDataBR(docProntoRaw);
    const entregue_em       = parseDataBR(entregueRaw);
    const dataVistoria      = parseDataBR(dataVistoriaRaw);

    // -- Tipo de entrada na delegacia --
    const tipoDelLower = tipoDelegaciaRaw.toLowerCase().trim();
    const isSifap      = tipoDelLower.includes('sifap');
    const isReentrada  = tipoDelLower.includes('reentrada');
    const tipoDel      = isReentrada ? 'reentrada' : 'entrada';

    // -- Status da OS --
    // temVistoria NÃO inclui apenas localVistoria — precisa de status ou data real
    const temEntregue  = !!entregue_em;
    const temDocPronto = !!doc_pronto_em;
    const temDelegacia = !!dataDelegacia;
    const temVistoria  = !!(dataVistoria || vistoriaStatus);

    let status = 'aguardando_documentacao';
    if (temEntregue)       status = 'entregue';
    else if (temDocPronto) status = 'doc_pronto';
    else if (temDelegacia) status = 'delegacia';
    else if (temVistoria)  status = 'vistoria';

    const tipo_servico = inferirTipoServico(servicoRaw);
    const ts = new Date().toISOString();

    try {
      // ==========================================
      // 1. CLIENTE (upsert por cpf_cnpj)
      // ==========================================
      const { data: exCliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('cpf_cnpj', cpf_cnpj)
        .maybeSingle();

      let clienteId: string;
      if (exCliente) {
        clienteId = exCliente.id;
      } else {
        const novoId = generateId();
        const { data: creCliente, error: errC } = await supabase
          .from('clientes')
          .insert({
            id: novoId,
            tipo: cpf_cnpj.length > 11 ? 'PJ' : 'PF',
            nome,
            cpf_cnpj,
            telefones,
            documentos: [],
            criado_em: ts,
            atualizado_em: ts
          })
          .select('id')
          .single();
        if (errC) throw new Error(`Cliente: ${errC.message}`);
        clienteId = creCliente.id;
      }

      // ==========================================
      // 2. VEÍCULO (upsert por chassi ou placa)
      //    data_aquisicao = Data Recibo do CSV
      // ==========================================
      let veiculoId: string;
      let existeVeiculo: { id: string } | null = null;

      if (chassi) {
        const { data } = await supabase.from('veiculos').select('id').eq('chassi', chassi).maybeSingle();
        existeVeiculo = data;
      }
      if (!existeVeiculo && placaRaw) {
        const { data } = await supabase.from('veiculos').select('id').eq('placa', placa).maybeSingle();
        existeVeiculo = data;
      }

      if (existeVeiculo) {
        veiculoId = existeVeiculo.id;
        // Atualiza data_aquisicao se tiver data de recibo
        if (dataRecibo) {
          await supabase.from('veiculos').update({ data_aquisicao: dataRecibo }).eq('id', veiculoId);
        }
      } else {
        const novoId = generateId();
        const { data: creVeic, error: errV } = await supabase
          .from('veiculos')
          .insert({
            id: novoId,
            placa,
            renavam: renavam || '',
            chassi: chassi || '',
            marca_modelo: marcaModelo || 'Desconhecido',
            cliente_id: clienteId,
            data_aquisicao: dataRecibo || null,   // ← Data Recibo aqui
            criado_em: ts,
            atualizado_em: ts
          })
          .select('id')
          .single();
        if (errV) throw new Error(`Veículo: ${errV.message}`);
        veiculoId = creVeic.id;
      }

      // ==========================================
      // 3. ORDEM DE SERVIÇO
      // ==========================================

      // Delegacia
      const delegacia = temDelegacia ? {
        entradas: [{
          id: crypto.randomUUID(),
          tipo: tipoDel,                                  // 'entrada' ou 'reentrada'
          data: dataDelegacia,
          responsavel: 'Legado (CSV)',
          observacao: isReentrada ? 'assinatura' : undefined,  // Reentrada → obs
          conferido: true,
          registradoEm: ts
        }]
      } : null;

      // Sifap (se SIFAP registrado)
      const sifap = isSifap ? { necessario: true } : null;

      // Vistoria
      const vistoria = temVistoria ? {
        local: localVistoria || 'Desconhecido',
        dataAgendamento: dataVistoria,
        status: vistoriaStatus.toLowerCase().includes('feita') || vistoriaStatus.toLowerCase().includes('aprovada')
          ? 'aprovada' : 'agendada'
      } : null;

      const novaOsId = generateId();
      const { error: errOS } = await supabase
        .from('ordens_de_servico')
        .insert({
          id: novaOsId,
          data_abertura: dataAbertura,
          cliente_id: clienteId,
          veiculo_id: veiculoId,
          tipo_servico,
          troca_placa: isSifap,              // SIFAP → troca de placa
          status,
          status_delegacia: temDelegacia ? tipoDel : null,  // último tipo de entrada
          checklist: [],
          vistoria_history: [],
          comunicacoes: [],
          audit_log: [{
            id: crypto.randomUUID(),
            acao: 'Importação',
            detalhes: `Importado do CSV. Serviço: "${servicoRaw || 'n/a'}". Entrada Delegacia: "${tipoDelegaciaRaw || 'n/a'}".`,
            usuario: 'Sistema',
            dataHora: ts
          }],
          doc_pronto_em,
          entregue_em,
          vistoria,
          delegacia,
          sifap,
          pendencia: docsPendentes || null,
          criado_em: ts,
          atualizado_em: ts
        });

      if (errOS) throw new Error(`OS: ${errOS.message}`);

      // Log resumido
      const flags = [
        isSifap ? '🔄SIFAP' : '',
        isReentrada ? '↩REENTRADA' : '',
        dataRecibo ? `📄${new Date(dataRecibo).toLocaleDateString('pt-BR', {timeZone:'UTC'})}` : '',
      ].filter(Boolean).join(' ');

      successCount++;
      console.log(`[✅] L${lineNum + 1} | ${nome.substring(0,32).padEnd(32)} | ${placa.padEnd(9)} | ${status.padEnd(25)} ${flags}`);

    } catch (err: any) {
      errorCount++;
      console.error(`[❌] L${lineNum + 1} (${nome}): ${err.message}`);
    }

    lineNum++;
    if (lineNum >= TEST_LIMIT) {
      console.log(`\n⚠️  Limite de teste atingido (${TEST_LIMIT} linhas).`);
      break;
    }
  }

  console.log(`\n=========================================`);
  console.log(`  ✅ Sucessos : ${successCount}`);
  console.log(`  ❌ Erros    : ${errorCount}`);
  console.log(`  ⏭️  Puladas   : ${skipCount}`);
  console.log(`=========================================\n`);
}

runImport().catch(console.error);

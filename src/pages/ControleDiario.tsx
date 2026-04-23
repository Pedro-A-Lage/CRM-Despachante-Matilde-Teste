// src/pages/ControleDiario.tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  DollarSign,
  TrendingUp,
  CheckCircle,
  RefreshCw,
  Users,
  Wallet,
  FileText,
  Plus,
  Check,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../contexts/AuthContext';
import {
  getAllChargesWithOS,
  getAllPayments,
  getPagadores,
  createPagador,
  updatePayment,
  updateChargePagoPor,
} from '../lib/financeService';
import { getEmpresas } from '../lib/empresaService';
import type { EmpresaParceira } from '../types/empresa';
import { getOrdens, getClientes, getVeiculos } from '../lib/database';
import { useServiceLabels, getServicoLabel } from '../hooks/useServiceLabels';
import { useToast } from '../components/Toast';
import type { ChargeWithOS, Payment, Pagador } from '../types/finance';
import type { OrdemDeServico, Cliente, Veiculo } from '../types';
import { PAYMENT_METODO_LABELS, FINANCE_CATEGORIA_LABELS } from '../types/finance';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!;
}

function ymd(dateStr?: string | null): string {
  if (!dateStr) return '';
  return dateStr.split('T')[0] ?? '';
}

type RangePreset = 'hoje' | 'ontem' | 'semana' | 'mes' | 'custom';

// Recebedores fixos (quem recebe dinheiro no escritório) — lista curta e
// controlada; diferente dos pagadores (quem vai pagar a taxa no banco/Detran).
const RECEBEDORES_FIXOS: Pagador[] = [
  { id: '__rec_pedro__', nome: 'Pedro', ativo: true, criado_em: '', atualizado_em: '' },
  { id: '__rec_geraldinho__', nome: 'Geraldinho', ativo: true, criado_em: '', atualizado_em: '' },
];

function computeRange(preset: RangePreset, custom: { de: string; ate: string }): { de: string; ate: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().split('T')[0]!;
  if (preset === 'hoje') return { de: iso(today), ate: iso(today) };
  if (preset === 'ontem') {
    const y = new Date(today); y.setDate(today.getDate() - 1);
    return { de: iso(y), ate: iso(y) };
  }
  if (preset === 'semana') {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay());
    return { de: iso(start), ate: iso(today) };
  }
  if (preset === 'mes') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { de: iso(start), ate: iso(today) };
  }
  return custom;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ControleDiario() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const serviceLabels = useServiceLabels();

  const [preset, setPreset] = useState<RangePreset>('hoje');
  const [customRange, setCustomRange] = useState({ de: todayStr(), ate: todayStr() });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [ordens, setOrdens] = useState<OrdemDeServico[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [charges, setCharges] = useState<ChargeWithOS[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pagadores, setPagadores] = useState<Pagador[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaParceira[]>([]);
  const [empresaFilter, setEmpresaFilter] = useState<string>(''); // '' = todas | 'particular' | empresa.id
  const [activeTab, setActiveTab] = useState<'os' | 'recebimentos' | 'taxas'>('os');

  type SortDir = 'asc' | 'desc';
  const [sortOs, setSortOs] = useState<{ by: string; dir: SortDir }>({ by: 'numero', dir: 'desc' });
  const [sortRec, setSortRec] = useState<{ by: string; dir: SortDir }>({ by: 'data', dir: 'desc' });
  const [sortTax, setSortTax] = useState<{ by: string; dir: SortDir }>({ by: 'data', dir: 'desc' });

  const toggleSort = (current: { by: string; dir: SortDir }, field: string): { by: string; dir: SortDir } => {
    if (current.by === field) return { by: field, dir: current.dir === 'asc' ? 'desc' : 'asc' };
    return { by: field, dir: 'asc' };
  };
  const cmp = (a: any, b: any, dir: SortDir): number => {
    if (a == null && b == null) return 0;
    if (a == null) return dir === 'asc' ? -1 : 1;
    if (b == null) return dir === 'asc' ? 1 : -1;
    if (typeof a === 'number' && typeof b === 'number') return dir === 'asc' ? a - b : b - a;
    const as = String(a).toLowerCase();
    const bs = String(b).toLowerCase();
    return dir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
  };
  const { showToast } = useToast();

  // Route guard
  useEffect(() => {
    if (usuario && usuario.role !== 'admin' && usuario.role !== 'gerente') {
      navigate('/');
    }
  }, [usuario, navigate]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [o, c, v, ch, p, pg, emp] = await Promise.all([
        getOrdens(),
        getClientes(),
        getVeiculos(),
        getAllChargesWithOS(),
        getAllPayments(),
        getPagadores(),
        getEmpresas(),
      ]);
      setOrdens(o);
      setClientes(c);
      setVeiculos(v);
      setCharges(ch);
      setPayments(p);
      setPagadores(pg);
      setEmpresas(emp);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const handleCreatePagador = useCallback(async (nome: string): Promise<Pagador | null> => {
    try {
      const novo = await createPagador(nome);
      const lista = await getPagadores();
      setPagadores(lista);
      return novo;
    } catch (e) {
      // Se a tabela pagadores não existe ou o insert falha, segue sem cadastrar —
      // o nome ainda pode ser salvo como texto no pagamento/charge.
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ControleDiario] createPagador falhou:', msg);
      showToast(`Aviso: não foi possível cadastrar "${nome}" na lista (${msg}). O nome foi salvo só no registro.`, 'info');
      return null;
    }
  }, [showToast]);

  const handleSetRecebidoPor = useCallback(async (paymentId: string, nome: string | null) => {
    try {
      // null limpa o campo; string define
      await updatePayment(paymentId, { recebido_por: nome as any });
      setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, recebido_por: nome ?? undefined } : p));
      showToast(nome ? `Recebedor definido: ${nome}` : 'Recebedor removido', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ControleDiario] updatePayment falhou:', msg);
      showToast(`Erro ao salvar recebedor: ${msg}`, 'error');
    }
  }, [showToast]);

  const handleSetDataPagamento = useCallback(async (paymentId: string, data: string) => {
    if (!data) return;
    try {
      await updatePayment(paymentId, { data_pagamento: data });
      setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, data_pagamento: data } : p));
      showToast('Data atualizada', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ControleDiario] updatePayment data falhou:', msg);
      showToast(`Erro ao salvar data: ${msg}`, 'error');
    }
  }, [showToast]);

  const handleSetPagoPor = useCallback(async (chargeId: string, nome: string | null) => {
    try {
      await updateChargePagoPor(chargeId, nome);
      setCharges(prev => prev.map(c => c.id === chargeId ? { ...c, pago_por: nome ?? undefined } : c));
      showToast(nome ? `Pagador definido: ${nome}` : 'Pagador removido', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ControleDiario] updateChargePagoPor falhou:', msg);
      showToast(`Erro ao salvar pagador: ${msg}`, 'error');
    }
  }, [showToast]);

  const range = useMemo(() => computeRange(preset, customRange), [preset, customRange]);
  const { de, ate } = range;

  // Helper: OS bate com o filtro de empresa?
  const osPassaFiltroEmpresa = useCallback((empresaId: string | null | undefined): boolean => {
    if (!empresaFilter) return true;
    if (empresaFilter === 'particular') return !empresaId;
    return empresaId === empresaFilter;
  }, [empresaFilter]);

  // Map auxiliar para resolver OS a partir de payment
  const ordemPorId = useMemo(() => new Map(ordens.map(o => [o.id, o])), [ordens]);

  // --- OS abertas no período ---
  const ordensDoPeriodo = useMemo(() => {
    return ordens
      .filter(o => {
        const d = ymd(o.dataAbertura);
        if (d < de || d > ate) return false;
        return osPassaFiltroEmpresa(o.empresaParceiraId);
      })
      .sort((a, b) => new Date(b.dataAbertura).getTime() - new Date(a.dataAbertura).getTime());
  }, [ordens, de, ate, osPassaFiltroEmpresa]);

  // --- Recebimentos do período ---
  const recebimentosDoPeriodo = useMemo(() => {
    return payments.filter(p => {
      const d = ymd(p.data_pagamento);
      if (d < de || d > ate) return false;
      const os = ordemPorId.get(p.os_id);
      return osPassaFiltroEmpresa(os?.empresaParceiraId);
    });
  }, [payments, de, ate, ordemPorId, osPassaFiltroEmpresa]);

  // --- Taxas pagas no período ---
  const taxasPagasDoPeriodo = useMemo(() => {
    return charges.filter(c => {
      if (c.status !== 'pago') return false;
      const d = ymd(c.confirmado_em);
      if (d < de || d > ate) return false;
      return osPassaFiltroEmpresa(c.empresa_parceira_id);
    });
  }, [charges, de, ate, osPassaFiltroEmpresa]);

  // --- Stats ---
  const totalRecebido = recebimentosDoPeriodo.reduce((s, p) => s + (p.valor || 0), 0);
  const totalDinheiroPeriodo = recebimentosDoPeriodo
    .filter(p => p.metodo === 'dinheiro')
    .reduce((s, p) => s + (p.valor || 0), 0);
  const caixaDinheiroAcumulado = payments
    .filter(p => p.metodo === 'dinheiro')
    .reduce((s, p) => s + (p.valor || 0), 0);

  const totalTaxasPagas = taxasPagasDoPeriodo.reduce((s, c) => s + (c.valor_pago || 0), 0);
  const daeTransferenciaPagas = taxasPagasDoPeriodo.filter(
    c => c.categoria === 'dae_principal' && c.tipo_servico === 'transferencia'
  );
  const placaPagas = taxasPagasDoPeriodo.filter(c => c.categoria === 'placa');
  const vistoriaPagas = taxasPagasDoPeriodo.filter(c => c.categoria === 'vistoria');
  const totalDaeTransfPlacaVist = [...daeTransferenciaPagas, ...placaPagas, ...vistoriaPagas].reduce((s, c) => s + (c.valor_pago || 0), 0);

  // --- Resumo unificado por pessoa (recebeu + pagou) ---
  const resumoPorPessoa = useMemo(() => {
    const map = new Map<string, { nome: string; recRecebimentos: number; recTotal: number; recDinheiro: number; pagTaxas: number; pagTotal: number }>();
    for (const p of recebimentosDoPeriodo) {
      const nome = p.recebido_por || '— sem recebedor —';
      const e = map.get(nome) ?? { nome, recRecebimentos: 0, recTotal: 0, recDinheiro: 0, pagTaxas: 0, pagTotal: 0 };
      e.recRecebimentos += 1;
      e.recTotal += p.valor || 0;
      if (p.metodo === 'dinheiro') e.recDinheiro += p.valor || 0;
      map.set(nome, e);
    }
    for (const c of taxasPagasDoPeriodo) {
      const nome = c.pago_por || '— sem pagador —';
      const e = map.get(nome) ?? { nome, recRecebimentos: 0, recTotal: 0, recDinheiro: 0, pagTaxas: 0, pagTotal: 0 };
      e.pagTaxas += 1;
      e.pagTotal += c.valor_pago || 0;
      map.set(nome, e);
    }
    return Array.from(map.values()).sort((a, b) => (b.recTotal + b.pagTotal) - (a.recTotal + a.pagTotal));
  }, [recebimentosDoPeriodo, taxasPagasDoPeriodo]);

  const saldoDoDia = totalRecebido - totalTaxasPagas;

  const clienteMap = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);
  const veiculoMap = useMemo(() => new Map(veiculos.map(v => [v.id, v])), [veiculos]);
  const ordemMap = ordemPorId;

  if (!usuario || (usuario.role !== 'admin' && usuario.role !== 'gerente')) return null;

  const rangeLabel = de === ate
    ? new Date(de + 'T12:00:00').toLocaleDateString('pt-BR')
    : `${new Date(de + 'T12:00:00').toLocaleDateString('pt-BR')} → ${new Date(ate + 'T12:00:00').toLocaleDateString('pt-BR')}`;

  const empresaLabel =
    empresaFilter === '' ? 'Todas as empresas'
    : empresaFilter === 'particular' ? 'Particulares'
    : empresas.find(e => e.id === empresaFilter)?.nome ?? 'Empresa';

  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const margin = 10;
    const pageW = doc.internal.pageSize.getWidth();

    const fmt2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtBRL = (v: number) => 'R$ ' + fmt2(v);
    const dt = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';

    // ===== HEADER =====
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Controle Diário', margin, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`Período: ${rangeLabel}  ·  Empresa: ${empresaLabel}`, margin, 19);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageW - margin, 19, { align: 'right' });
    doc.setDrawColor(200);
    doc.line(margin, 22, pageW - margin, 22);

    let y = 27;

    // ===== RESUMO =====
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text('Resumo do período', margin, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right' } },
      body: [
        ['OS abertas no período', `${ordensDoPeriodo.length}`],
        ['Recebido dos clientes', fmtBRL(totalRecebido)],
        ['Taxas pagas', fmtBRL(totalTaxasPagas)],
        [{ content: 'Saldo do período', styles: { fontStyle: 'bold', textColor: saldoDoDia >= 0 ? [47, 122, 61] : [177, 54, 29] } },
         { content: fmtBRL(saldoDoDia), styles: { halign: 'right', fontStyle: 'bold', textColor: saldoDoDia >= 0 ? [47, 122, 61] : [177, 54, 29] } }],
        ['Entrou em dinheiro (período)', fmtBRL(totalDinheiroPeriodo)],
        ['Caixa em dinheiro (acumulado)', fmtBRL(caixaDinheiroAcumulado)],
        ['DAE Transferência + Placa + Vistoria', `${fmtBRL(totalDaeTransfPlacaVist)}  (${daeTransferenciaPagas.length} DAE · ${placaPagas.length} placa · ${vistoriaPagas.length} vistoria)`],
      ],
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // ===== PESSOAS =====
    if (resumoPorPessoa.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Pessoas do período', margin, y);
      y += 2;
      autoTable(doc, {
        startY: y + 2,
        head: [['Pessoa', 'Recebeu (qtd)', 'Recebeu (R$)', 'Em dinheiro', 'Pagou taxas (qtd)', 'Pagou (R$)', 'Saldo']],
        body: [
          ...resumoPorPessoa.map(p => {
            const saldo = p.recTotal - p.pagTotal;
            return [
              p.nome,
              p.recRecebimentos ? String(p.recRecebimentos) : '—',
              p.recTotal ? fmtBRL(p.recTotal) : '—',
              p.recDinheiro ? fmtBRL(p.recDinheiro) : '—',
              p.pagTaxas ? String(p.pagTaxas) : '—',
              p.pagTotal ? fmtBRL(p.pagTotal) : '—',
              fmtBRL(saldo),
            ];
          }),
          [
            { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: [230, 238, 248] } },
            { content: String(recebimentosDoPeriodo.length), styles: { fontStyle: 'bold', fillColor: [230, 238, 248] } },
            { content: fmtBRL(totalRecebido), styles: { fontStyle: 'bold', fillColor: [230, 238, 248] } },
            { content: fmtBRL(totalDinheiroPeriodo), styles: { fontStyle: 'bold', fillColor: [230, 238, 248] } },
            { content: String(taxasPagasDoPeriodo.length), styles: { fontStyle: 'bold', fillColor: [230, 238, 248] } },
            { content: fmtBRL(totalTaxasPagas), styles: { fontStyle: 'bold', fillColor: [230, 238, 248] } },
            { content: fmtBRL(saldoDoDia), styles: { fontStyle: 'bold', fillColor: [230, 238, 248], textColor: saldoDoDia >= 0 ? [47, 122, 61] : [177, 54, 29] } },
          ],
        ],
        headStyles: { fillColor: [70, 70, 70], textColor: 255, fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // ===== OS ABERTAS =====
    if (ordensDoPeriodo.length > 0) {
      if (y > 160) { doc.addPage(); y = 15; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`OS abertas no período (${ordensDoPeriodo.length})`, margin, y);
      autoTable(doc, {
        startY: y + 2,
        head: [['Nº OS', 'Cliente', 'Placa', 'Serviço', 'Valor', 'Recebido', 'Falta', 'Status', 'Métodos']],
        body: ordensDoPeriodo.map(os => {
          const cli = clienteMap.get(os.clienteId);
          const v = veiculoMap.get(os.veiculoId);
          const osPayments = payments.filter(p => p.os_id === os.id);
          const recebido = osPayments.reduce((s, p) => s + (p.valor || 0), 0);
          const total = Number(os.valorServico) || 0;
          const desconto = Number(os.desconto) || 0;
          const efetivo = Math.max(0, total - desconto);
          const falta = Math.max(0, efetivo - recebido);
          const statusPg = falta <= 0.009 && efetivo > 0 ? 'Pago' : recebido > 0 ? 'Parcial' : 'Pendente';
          const metodos = Array.from(new Set(osPayments.map(p => PAYMENT_METODO_LABELS[p.metodo]))).join(', ');
          return [
            `#${os.numero}`,
            cli?.nome || '—',
            v?.placa || '—',
            getServicoLabel(serviceLabels, os.tipoServico),
            fmtBRL(efetivo),
            fmtBRL(recebido),
            fmtBRL(falta),
            statusPg,
            metodos || '—',
          ];
        }),
        headStyles: { fillColor: [70, 70, 70], textColor: 255, fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 1.8 },
        columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // ===== RECEBIMENTOS =====
    if (recebimentosDoPeriodo.length > 0) {
      if (y > 160) { doc.addPage(); y = 15; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Recebimentos no período (${recebimentosDoPeriodo.length})`, margin, y);
      const rec = recebimentosDoPeriodo
        .slice()
        .sort((a, b) => (b.data_pagamento || '').localeCompare(a.data_pagamento || ''));
      autoTable(doc, {
        startY: y + 2,
        head: [['Data', 'Nº OS', 'Cliente', 'Método', 'Valor', 'Recebido por']],
        body: rec.map(p => {
          const os = ordemMap.get(p.os_id);
          const cli = os ? clienteMap.get(os.clienteId) : null;
          return [
            dt((p.data_pagamento || '') + 'T12:00:00'),
            os ? `#${os.numero}` : '—',
            cli?.nome || '—',
            PAYMENT_METODO_LABELS[p.metodo],
            fmtBRL(p.valor || 0),
            p.recebido_por || '—',
          ];
        }),
        headStyles: { fillColor: [47, 122, 61], textColor: 255, fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 1.8 },
        columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
        // Destaque em amber para dinheiro
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 3 && data.cell.raw === 'Dinheiro') {
            data.cell.styles.fillColor = [251, 236, 200];
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // ===== TAXAS PAGAS =====
    if (taxasPagasDoPeriodo.length > 0) {
      if (y > 160) { doc.addPage(); y = 15; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Taxas pagas no período (${taxasPagasDoPeriodo.length})`, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text('DAE Transferência, Placa e Vistoria em destaque', margin, y + 4);
      doc.setTextColor(30);
      const taxas = taxasPagasDoPeriodo
        .slice()
        .sort((a, b) => (b.confirmado_em || '').localeCompare(a.confirmado_em || ''));
      autoTable(doc, {
        startY: y + 6,
        head: [['Data', 'Nº OS', 'Cliente', 'Categoria', 'Valor', 'Pago por', 'Confirmado por']],
        body: taxas.map(c => {
          const isTransf = c.categoria === 'dae_principal' && c.tipo_servico === 'transferencia';
          const catLabel = isTransf ? 'DAE Transferência' : (FINANCE_CATEGORIA_LABELS[c.categoria] ?? c.categoria);
          return [
            dt(c.confirmado_em),
            `#${c.os_numero}`,
            c.cliente_nome,
            catLabel,
            fmtBRL(c.valor_pago || 0),
            c.pago_por || '—',
            c.confirmado_por || '—',
          ];
        }),
        headStyles: { fillColor: [31, 90, 138], textColor: 255, fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 1.8 },
        columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 3) {
            const v = String(data.cell.raw);
            if (v === 'DAE Transferência' || v === 'Placa' || v === 'Vistoria') {
              // highlight da linha inteira
              const row = data.row.cells;
              Object.values(row).forEach(c => { (c as any).styles.fillColor = [220, 233, 243]; });
            }
          }
        },
      });
    }

    // ===== FOOTER com page numbers =====
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Página ${i} de ${totalPages}`, pageW - margin, doc.internal.pageSize.getHeight() - 5, { align: 'right' });
    }

    const dtStr = new Date().toISOString().split('T')[0];
    doc.save(`controle-diario_${dtStr}_${empresaLabel.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--notion-text)' }}>
            Controle Diário
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--notion-text-secondary)' }}>
            OS abertas, recebimentos e taxas pagas · {rangeLabel} · {empresaLabel}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }} className="cd-no-print">
          <button onClick={exportarPDF} className="btn btn-secondary btn-sm" title="Baixar PDF do controle diário com os filtros atuais">
            <FileSpreadsheet size={13} />
            Exportar PDF
          </button>
          <button onClick={carregar} disabled={loading} className="btn btn-secondary btn-sm">
            <RefreshCw size={13} style={{ animation: loading ? 'ctrlsp 1s linear infinite' : 'none' }} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Range selector */}
      <div
        style={{
          background: 'var(--notion-surface)',
          border: '1px solid var(--notion-border)',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 20,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Calendar size={14} style={{ color: 'var(--notion-text-secondary)' }} />
        {(['hoje', 'ontem', 'semana', 'mes'] as RangePreset[]).map(p => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`btn btn-sm ${preset === p ? 'btn-primary' : 'btn-secondary'}`}
          >
            {p === 'hoje' ? 'Hoje' : p === 'ontem' ? 'Ontem' : p === 'semana' ? 'Semana' : 'Mês'}
          </button>
        ))}
        <button
          onClick={() => setPreset('custom')}
          className={`btn btn-sm ${preset === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Personalizado
        </button>
        {preset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="date"
              value={customRange.de}
              onChange={e => setCustomRange(r => ({ ...r, de: e.target.value }))}
              className="form-input"
              style={{ height: 32 }}
            />
            <span style={{ color: 'var(--notion-text-secondary)' }}>até</span>
            <input
              type="date"
              value={customRange.ate}
              onChange={e => setCustomRange(r => ({ ...r, ate: e.target.value }))}
              className="form-input"
              style={{ height: 32 }}
            />
          </div>
        )}
      </div>

      {erro && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>{erro}</div>
      )}

      {/* Empresa filter */}
      {empresas.length > 0 && (
        <div
          style={{
            background: 'var(--notion-surface)',
            border: '1px solid var(--notion-border)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 20,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span className="info-item-label" style={{ color: 'var(--notion-text-secondary)', marginRight: 4 }}>Empresa:</span>
          <button
            type="button"
            onClick={() => setEmpresaFilter('')}
            className={`btn btn-sm ${empresaFilter === '' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Todas
          </button>
          {empresas.map(emp => {
            const active = empresaFilter === emp.id;
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => setEmpresaFilter(emp.id)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  borderRadius: 6,
                  border: `1.5px solid ${active ? emp.cor : 'var(--notion-border)'}`,
                  background: active ? emp.cor : 'transparent',
                  color: active ? '#fff' : 'var(--notion-text-secondary)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#fff' : emp.cor }} />
                {emp.nome}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setEmpresaFilter('particular')}
            className={`btn btn-sm ${empresaFilter === 'particular' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Particulares
          </button>
        </div>
      )}

      {/* === LAYOUT 2 colunas: Resumo + Pessoas === */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
        gap: 16,
        marginBottom: 16,
      }} className="cd-row">
        {/* Resumo do dia (card grande à esquerda) */}
        <div style={{
          background: 'var(--notion-surface)',
          border: '1px solid var(--notion-border)',
          borderRadius: 12,
          padding: '18px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="info-item-label" style={{ color: 'var(--notion-text-secondary)' }}>Resumo do período</span>
            <span style={{ fontSize: 11, color: 'var(--notion-text-muted)' }}>
              {ordensDoPeriodo.length} OS · {recebimentosDoPeriodo.length} receb. · {taxasPagasDoPeriodo.length} taxas
            </span>
          </div>

          {/* Saldo do período em destaque */}
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            paddingBottom: 14,
            borderBottom: '1px solid var(--notion-border)',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--notion-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Saldo do período
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 32, fontWeight: 700,
                color: saldoDoDia >= 0 ? 'var(--status-success)' : 'var(--status-danger)',
                lineHeight: 1.1, marginTop: 4,
              }}>
                {fmt(saldoDoDia)}
              </div>
              <div className="text-xs" style={{ color: 'var(--notion-text-muted)', marginTop: 4 }}>
                = recebido − taxas pagas
              </div>
            </div>
          </div>

          {/* Linhas: entradas / saídas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SummaryLine
              icon={<DollarSign size={14} />}
              label="Recebido dos clientes"
              value={totalRecebido}
              accent="success"
              hint={`${recebimentosDoPeriodo.length} recebimento(s)`}
            />
            <SummaryLine
              icon={<CheckCircle size={14} />}
              label="Taxas pagas"
              value={totalTaxasPagas}
              accent="danger"
              hint={`${taxasPagasDoPeriodo.length} taxa(s)`}
            />
          </div>

          {/* Caixa em dinheiro */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--notion-border)',
          }}>
            <SummaryLine
              icon={<Wallet size={14} />}
              label="Entrou em dinheiro"
              value={totalDinheiroPeriodo}
              accent="warn"
              hint="no período"
            />
            <SummaryLine
              icon={<Wallet size={14} />}
              label="Caixa acumulado"
              value={caixaDinheiroAcumulado}
              accent="warn"
              hint="histórico total"
            />
          </div>

          {/* DAE + Placa em destaque */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: 12,
            borderTop: '1px solid var(--notion-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--status-info)' }}>
              <TrendingUp size={14} />
              <span className="text-sm" style={{ fontWeight: 600, color: 'var(--notion-text)' }}>
                DAE Transferência + Placa + Vistoria
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="font-mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--status-info)' }}>
                {fmt(totalDaeTransfPlacaVist)}
              </div>
              <div className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>
                {daeTransferenciaPagas.length} DAE · {placaPagas.length} placa · {vistoriaPagas.length} vistoria
              </div>
            </div>
          </div>
        </div>

        {/* Pessoas do período (sidebar à direita) */}
        <div style={{
          background: 'var(--notion-surface)',
          border: '1px solid var(--notion-border)',
          borderRadius: 12,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={14} style={{ color: 'var(--notion-text-secondary)' }} />
            <span className="info-item-label" style={{ color: 'var(--notion-text-secondary)', margin: 0 }}>Pessoas do período</span>
          </div>
          {resumoPorPessoa.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--notion-text-muted)', fontStyle: 'italic', padding: 'var(--space-3) 0' }}>
              Nenhuma movimentação no período.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {resumoPorPessoa.map(p => (
                <div key={p.nome} style={{
                  padding: '8px 10px',
                  background: 'var(--notion-bg-alt)',
                  border: '1px solid var(--notion-border)',
                  borderRadius: 8,
                }}>
                  <div className="text-sm" style={{ fontWeight: 700, color: 'var(--notion-text)', marginBottom: 4 }}>
                    {p.nome}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {p.recRecebimentos > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--notion-text-muted)' }}>Recebeu ({p.recRecebimentos})</span>
                        <span className="font-mono" style={{ fontWeight: 600, color: 'var(--status-success)' }}>{fmt(p.recTotal)}</span>
                      </div>
                    )}
                    {p.recDinheiro > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: 'var(--notion-text-muted)', paddingLeft: 12 }}>↳ em dinheiro</span>
                        <span className="font-mono" style={{ color: 'var(--status-warn)' }}>{fmt(p.recDinheiro)}</span>
                      </div>
                    )}
                    {p.pagTaxas > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--notion-text-muted)' }}>Pagou taxas ({p.pagTaxas})</span>
                        <span className="font-mono" style={{ fontWeight: 600, color: 'var(--status-danger)' }}>{fmt(p.pagTotal)}</span>
                      </div>
                    )}
                    {(() => {
                      const saldo = p.recTotal - p.pagTotal;
                      const cor = saldo > 0 ? 'var(--status-success)' : saldo < 0 ? 'var(--status-danger)' : 'var(--notion-text-secondary)';
                      return (
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', fontSize: 12,
                          marginTop: 4, paddingTop: 4,
                          borderTop: '1px dashed var(--notion-border)',
                        }}>
                          <span style={{ color: 'var(--notion-text-secondary)', fontWeight: 600 }}>Saldo</span>
                          <span className="font-mono" style={{ fontWeight: 700, color: cor }}>{fmt(saldo)}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}

              {/* Total geral das pessoas */}
              <div style={{
                marginTop: 4,
                padding: '8px 10px',
                background: 'rgba(0,117,222,0.08)',
                border: '1px solid var(--notion-blue)',
                borderRadius: 8,
              }}>
                <div className="text-sm" style={{ fontWeight: 700, color: 'var(--notion-blue)', marginBottom: 4 }}>
                  TOTAL
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--notion-text-secondary)' }}>Total recebido</span>
                  <span className="font-mono" style={{ fontWeight: 700, color: 'var(--status-success)' }}>{fmt(totalRecebido)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--notion-text-secondary)' }}>Total pago em taxas</span>
                  <span className="font-mono" style={{ fontWeight: 700, color: 'var(--status-danger)' }}>{fmt(totalTaxasPagas)}</span>
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', fontSize: 13,
                  marginTop: 6, paddingTop: 6,
                  borderTop: '1px solid var(--notion-blue)',
                }}>
                  <span style={{ color: 'var(--notion-blue)', fontWeight: 700 }}>Saldo total</span>
                  <span className="font-mono" style={{
                    fontWeight: 800,
                    color: saldoDoDia >= 0 ? 'var(--status-success)' : 'var(--status-danger)',
                  }}>{fmt(saldoDoDia)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === TABS: OS / Recebimentos / Taxas === */}
      <div style={{
        background: 'var(--notion-surface)',
        border: '1px solid var(--notion-border)',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 16,
      }}>
        <div className="cd-no-print" style={{
          display: 'flex', gap: 4, padding: '6px 8px',
          borderBottom: '1px solid var(--notion-border)',
          background: 'var(--notion-bg-alt)',
        }}>
          {([
            { id: 'os', label: 'OS abertas', count: ordensDoPeriodo.length, icon: <FileText size={14} /> },
            { id: 'recebimentos', label: 'Recebimentos', count: recebimentosDoPeriodo.length, icon: <DollarSign size={14} /> },
            { id: 'taxas', label: 'Taxas pagas', count: taxasPagasDoPeriodo.length, icon: <CheckCircle size={14} /> },
          ] as const).map(t => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: active ? 'var(--notion-surface)' : 'transparent',
                  color: active ? 'var(--notion-blue)' : 'var(--notion-text-secondary)',
                  fontWeight: active ? 700 : 500,
                  fontSize: 13, cursor: 'pointer',
                  boxShadow: active ? 'var(--shadow-card)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {t.icon}
                {t.label}
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  padding: '2px 7px', borderRadius: 99,
                  background: active ? 'rgba(0,117,222,0.12)' : 'var(--notion-bg-alt)',
                  color: active ? 'var(--notion-blue)' : 'var(--notion-text-muted)',
                }}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

      {/* OS abertas */}
      <div className="cd-tab-content" data-active={activeTab === 'os' ? 'true' : 'false'}>
        <div className="cd-print-only" style={{ padding: '8px 16px', fontSize: 14, fontWeight: 700, color: 'var(--notion-text)' }}>
          OS abertas no período ({ordensDoPeriodo.length})
        </div>
        {ordensDoPeriodo.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--notion-text-muted)', fontSize: 14 }}>
            Nenhuma OS aberta nesse período.
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <SortTh label="OS"        field="numero"  sort={sortOs} onSort={(f) => setSortOs(s => toggleSort(s, f))} />
                  <SortTh label="Cliente"   field="cliente" sort={sortOs} onSort={(f) => setSortOs(s => toggleSort(s, f))} />
                  <SortTh label="Placa"     field="placa"   sort={sortOs} onSort={(f) => setSortOs(s => toggleSort(s, f))} />
                  <SortTh label="Serviço"   field="servico" sort={sortOs} onSort={(f) => setSortOs(s => toggleSort(s, f))} />
                  <SortTh label="Valor"     field="valor"   sort={sortOs} onSort={(f) => setSortOs(s => toggleSort(s, f))} />
                  <SortTh label="Recebido"  field="recebido" sort={sortOs} onSort={(f) => setSortOs(s => toggleSort(s, f))} />
                  <SortTh label="Pagamento" field="status"  sort={sortOs} onSort={(f) => setSortOs(s => toggleSort(s, f))} />
                </tr>
              </thead>
              <tbody>
                {ordensDoPeriodo
                  .slice()
                  .map(os => {
                    const cli = clienteMap.get(os.clienteId);
                    const v = veiculoMap.get(os.veiculoId);
                    const osPayments = payments.filter(p => p.os_id === os.id);
                    const recebido = osPayments.reduce((s, p) => s + (p.valor || 0), 0);
                    const total = Number(os.valorServico) || 0;
                    const desconto = Number(os.desconto) || 0;
                    const efetivo = Math.max(0, total - desconto);
                    const statusPg = Math.max(0, efetivo - recebido) <= 0.009 && efetivo > 0 ? 'pago' : recebido > 0 ? 'parcial' : 'pendente';
                    return { os, cli, v, recebido, efetivo, statusPg };
                  })
                  .sort((a, b) => {
                    const f = sortOs.by, d = sortOs.dir;
                    if (f === 'numero')   return cmp(a.os.numero, b.os.numero, d);
                    if (f === 'cliente')  return cmp(a.cli?.nome, b.cli?.nome, d);
                    if (f === 'placa')    return cmp(a.v?.placa, b.v?.placa, d);
                    if (f === 'servico')  return cmp(getServicoLabel(serviceLabels, a.os.tipoServico), getServicoLabel(serviceLabels, b.os.tipoServico), d);
                    if (f === 'valor')    return cmp(a.efetivo, b.efetivo, d);
                    if (f === 'recebido') return cmp(a.recebido, b.recebido, d);
                    if (f === 'status')   return cmp(a.statusPg, b.statusPg, d);
                    return 0;
                  })
                  .map(({ os, cli, v, recebido, efetivo, statusPg }) => {
                    const osPayments = payments.filter(p => p.os_id === os.id);
                    const metodosDistintos = Array.from(new Set(osPayments.map(p => p.metodo)));
                    return (
                    <tr
                      key={os.id}
                      className="clickable"
                      onClick={() => navigate(`/ordens/${os.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td><span className="font-mono" style={{ fontWeight: 600 }}>#{os.numero}</span></td>
                      <td>{cli?.nome || '—'}</td>
                      <td><span className="font-mono">{v?.placa || '—'}</span></td>
                      <td>{getServicoLabel(serviceLabels, os.tipoServico)}</td>
                      <td>{fmt(efetivo)}</td>
                      <td style={{ color: recebido > 0 ? 'var(--status-success)' : 'var(--notion-text-muted)', fontWeight: 500 }}>
                        {fmt(recebido)}
                      </td>
                      <td>
                        <span className={`badge ${statusPg === 'pago' ? 'badge-success' : statusPg === 'parcial' ? 'badge-warning' : 'badge-neutral'}`}>
                          {statusPg === 'pago' ? 'Pago' : statusPg === 'parcial' ? 'Parcial' : 'Pendente'}
                        </span>
                        {metodosDistintos.length > 0 && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--notion-text-muted)' }}>
                            {metodosDistintos.map(m => PAYMENT_METODO_LABELS[m]).join(', ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recebimentos */}
      <div className="cd-tab-content" data-active={activeTab === 'recebimentos' ? 'true' : 'false'}>
        <div className="cd-print-only" style={{ padding: '8px 16px', fontSize: 14, fontWeight: 700, color: 'var(--notion-text)' }}>
          Recebimentos no período ({recebimentosDoPeriodo.length})
        </div>
        {recebimentosDoPeriodo.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--notion-text-muted)', fontSize: 14 }}>
            Nenhum recebimento nesse período.
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <SortTh label="Data"         field="data"     sort={sortRec} onSort={(f) => setSortRec(s => toggleSort(s, f))} />
                  <SortTh label="OS"           field="numero"   sort={sortRec} onSort={(f) => setSortRec(s => toggleSort(s, f))} />
                  <SortTh label="Cliente"      field="cliente"  sort={sortRec} onSort={(f) => setSortRec(s => toggleSort(s, f))} />
                  <SortTh label="Método"       field="metodo"   sort={sortRec} onSort={(f) => setSortRec(s => toggleSort(s, f))} />
                  <SortTh label="Valor"        field="valor"    sort={sortRec} onSort={(f) => setSortRec(s => toggleSort(s, f))} />
                  <SortTh label="Recebido por" field="recebido" sort={sortRec} onSort={(f) => setSortRec(s => toggleSort(s, f))} />
                </tr>
              </thead>
              <tbody>
                {recebimentosDoPeriodo
                  .slice()
                  .sort((a, b) => {
                    const f = sortRec.by, d = sortRec.dir;
                    const osA = ordemMap.get(a.os_id), osB = ordemMap.get(b.os_id);
                    const cliA = osA ? clienteMap.get(osA.clienteId) : null;
                    const cliB = osB ? clienteMap.get(osB.clienteId) : null;
                    if (f === 'data')     return cmp(a.data_pagamento, b.data_pagamento, d);
                    if (f === 'numero')   return cmp(osA?.numero, osB?.numero, d);
                    if (f === 'cliente')  return cmp(cliA?.nome, cliB?.nome, d);
                    if (f === 'metodo')   return cmp(PAYMENT_METODO_LABELS[a.metodo], PAYMENT_METODO_LABELS[b.metodo], d);
                    if (f === 'valor')    return cmp(a.valor || 0, b.valor || 0, d);
                    if (f === 'recebido') return cmp(a.recebido_por, b.recebido_por, d);
                    return 0;
                  })
                  .map(p => {
                    const os = ordemMap.get(p.os_id);
                    const cli = os ? clienteMap.get(os.clienteId) : null;
                    const isDinheiro = p.metodo === 'dinheiro';
                    return (
                      <tr
                        key={p.id}
                        className="clickable"
                        onClick={() => os && navigate(`/ordens/${os.id}`)}
                        style={{ cursor: os ? 'pointer' : 'default' }}
                      >
                        <td onClick={e => e.stopPropagation()} style={{ cursor: 'default' }}>
                          <input
                            type="date"
                            value={ymd(p.data_pagamento) || ''}
                            onChange={e => handleSetDataPagamento(p.id, e.target.value)}
                            style={{
                              height: 26,
                              fontSize: 12,
                              padding: '0 6px',
                              border: '1px solid var(--notion-border)',
                              borderRadius: 6,
                              background: 'var(--notion-surface)',
                              color: 'var(--notion-text)',
                              outline: 'none',
                              cursor: 'pointer',
                              fontFamily: 'var(--font-mono)',
                            }}
                          />
                        </td>
                        <td>{os ? <span className="font-mono">#{os.numero}</span> : '—'}</td>
                        <td>{cli?.nome || '—'}</td>
                        <td>
                          <span className="badge" style={isDinheiro ? { background: 'var(--status-warn-soft)', color: 'var(--status-warn)', border: '1px solid var(--status-warn)' } : undefined}>
                            {PAYMENT_METODO_LABELS[p.metodo]}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{fmt(p.valor || 0)}</td>
                        <td onClick={e => e.stopPropagation()} style={{ cursor: 'default' }}>
                          <NomePicker
                            value={p.recebido_por || ''}
                            pagadores={RECEBEDORES_FIXOS}
                            onChange={(nome) => handleSetRecebidoPor(p.id, nome)}
                            onCreate={handleCreatePagador}
                            placeholder="— definir recebedor —"
                            hideAdd
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Taxas pagas */}
      <div className="cd-tab-content" data-active={activeTab === 'taxas' ? 'true' : 'false'}>
        <div className="cd-print-only" style={{ padding: '8px 16px', fontSize: 14, fontWeight: 700, color: 'var(--notion-text)' }}>
          Taxas pagas no período ({taxasPagasDoPeriodo.length}) — DAE Transferência, Placa e Vistoria em destaque
        </div>
        {taxasPagasDoPeriodo.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--notion-text-muted)', fontSize: 14 }}>
            Nenhuma taxa paga nesse período.
          </div>
        ) : (
          <div className="table-container">
            <div className="cd-no-print" style={{ padding: '8px 16px 0', fontSize: 11, color: 'var(--notion-text-muted)' }}>
              DAE Transferência, Placa e Vistoria em destaque
            </div>
            <table className="table">
              <thead>
                <tr>
                  <SortTh label="Data"      field="data"     sort={sortTax} onSort={(f) => setSortTax(s => toggleSort(s, f))} />
                  <SortTh label="OS"        field="numero"   sort={sortTax} onSort={(f) => setSortTax(s => toggleSort(s, f))} />
                  <SortTh label="Cliente"   field="cliente"  sort={sortTax} onSort={(f) => setSortTax(s => toggleSort(s, f))} />
                  <SortTh label="Categoria" field="categoria" sort={sortTax} onSort={(f) => setSortTax(s => toggleSort(s, f))} />
                  <SortTh label="Valor"     field="valor"    sort={sortTax} onSort={(f) => setSortTax(s => toggleSort(s, f))} />
                  <SortTh label="Pago por"  field="pago"     sort={sortTax} onSort={(f) => setSortTax(s => toggleSort(s, f))} />
                  <SortTh label="Conf. por" field="conf"     sort={sortTax} onSort={(f) => setSortTax(s => toggleSort(s, f))} />
                </tr>
              </thead>
              <tbody>
                {taxasPagasDoPeriodo
                  .slice()
                  .sort((a, b) => {
                    const f = sortTax.by, d = sortTax.dir;
                    const catA = (a.categoria === 'dae_principal' && a.tipo_servico === 'transferencia') ? 'DAE Transferência' : (FINANCE_CATEGORIA_LABELS[a.categoria] ?? a.categoria);
                    const catB = (b.categoria === 'dae_principal' && b.tipo_servico === 'transferencia') ? 'DAE Transferência' : (FINANCE_CATEGORIA_LABELS[b.categoria] ?? b.categoria);
                    if (f === 'data')      return cmp(a.confirmado_em, b.confirmado_em, d);
                    if (f === 'numero')    return cmp(a.os_numero, b.os_numero, d);
                    if (f === 'cliente')   return cmp(a.cliente_nome, b.cliente_nome, d);
                    if (f === 'categoria') return cmp(catA, catB, d);
                    if (f === 'valor')     return cmp(a.valor_pago || 0, b.valor_pago || 0, d);
                    if (f === 'pago')      return cmp(a.pago_por, b.pago_por, d);
                    if (f === 'conf')      return cmp(a.confirmado_por, b.confirmado_por, d);
                    return 0;
                  })
                  .map(c => {
                    const destaque = c.categoria === 'placa' || c.categoria === 'vistoria' || (c.categoria === 'dae_principal' && c.tipo_servico === 'transferencia');
                    const isTransf = c.categoria === 'dae_principal' && c.tipo_servico === 'transferencia';
                    const os = ordemMap.get(c.os_id);
                    return (
                      <tr
                        key={c.id}
                        className="clickable"
                        onClick={() => os && navigate(`/ordens/${os.id}`)}
                        style={{
                          cursor: os ? 'pointer' : 'default',
                          background: destaque ? 'var(--status-info-soft)' : undefined,
                        }}
                      >
                        <td>{c.confirmado_em ? new Date(c.confirmado_em).toLocaleDateString('pt-BR') : '—'}</td>
                        <td><span className="font-mono">#{c.os_numero}</span></td>
                        <td>{c.cliente_nome}</td>
                        <td>
                          <span className="badge">
                            {isTransf ? 'DAE Transferência' : (FINANCE_CATEGORIA_LABELS[c.categoria] ?? c.categoria)}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{fmt(c.valor_pago || 0)}</td>
                        <td onClick={e => e.stopPropagation()} style={{ cursor: 'default' }}>
                          <NomePicker
                            value={c.pago_por || ''}
                            pagadores={pagadores}
                            onChange={(nome) => handleSetPagoPor(c.id, nome)}
                            onCreate={handleCreatePagador}
                            placeholder="— definir pagador —"
                          />
                        </td>
                        <td style={{ color: 'var(--notion-text-muted)' }}>{c.confirmado_por || '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>{/* end tabs container */}

      <style>{`
        @keyframes ctrlsp { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 900px) {
          .cd-row { grid-template-columns: 1fr !important; }
        }
        /* Tabs: só a ativa visível */
        .cd-tab-content { display: none; }
        .cd-tab-content[data-active="true"] { display: block; }
        /* legado (usado antes da exportação em PDF nativo) */
        .cd-print-only { display: none; }
      `}</style>
    </div>
  );
}

// ── Small components ─────────────────────────────────────────────────────────

function SortTh({
  label, field, sort, onSort, align,
}: {
  label: string;
  field: string;
  sort: { by: string; dir: 'asc' | 'desc' };
  onSort: (f: string) => void;
  align?: 'left' | 'right' | 'center';
}) {
  const active = sort.by === field;
  const arrow = active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕';
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        textAlign: align ?? 'left',
        color: active ? 'var(--notion-blue)' : undefined,
      }}
      title={`Ordenar por ${label}`}
    >
      {label} <span style={{ opacity: active ? 1 : 0.3, marginLeft: 2, fontSize: 10 }}>{arrow}</span>
    </th>
  );
}

function SummaryLine({
  icon, label, value, hint, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  accent?: 'success' | 'danger' | 'warn' | 'info';
}) {
  const color =
    accent === 'success' ? 'var(--status-success)'
    : accent === 'danger' ? 'var(--status-danger)'
    : accent === 'warn' ? 'var(--status-warn)'
    : accent === 'info' ? 'var(--status-info)'
    : 'var(--notion-text)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--notion-text-secondary)' }}>
        <span style={{ color }}>{icon}</span>
        <span className="text-xs" style={{ fontWeight: 600 }}>{label}</span>
      </div>
      <div className="font-mono" style={{ fontSize: 18, fontWeight: 700, color }}>
        {value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </div>
      {hint && <div className="text-xs" style={{ color: 'var(--notion-text-muted)' }}>{hint}</div>}
    </div>
  );
}

// ── NomePicker: seletor inline de pagador/recebedor ─────────────────────────

function NomePicker({
  value,
  pagadores,
  onChange,
  onCreate,
  placeholder,
  hideAdd = false,
}: {
  value: string;
  pagadores: Pagador[];
  onChange: (nome: string | null) => void;
  onCreate: (nome: string) => Promise<Pagador | null>;
  placeholder?: string;
  hideAdd?: boolean;
}) {
  const [adicionando, setAdicionando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function handleAddNovo() {
    const nome = novoNome.trim();
    if (!nome || salvando) return;
    setSalvando(true);
    try {
      // Tenta cadastrar na lista; mesmo que falhe, aplica o nome ao registro.
      await onCreate(nome).catch(() => null);
      onChange(nome);
      setNovoNome('');
      setAdicionando(false);
    } finally {
      setSalvando(false);
    }
  }

  if (adicionando) {
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          autoFocus
          type="text"
          value={novoNome}
          placeholder="Novo nome..."
          onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleAddNovo(); }
            if (e.key === 'Escape') { setAdicionando(false); setNovoNome(''); }
          }}
          style={{
            height: 26,
            fontSize: 12,
            padding: '2px 8px',
            border: '1px solid var(--notion-border)',
            borderRadius: 6,
            background: 'var(--notion-surface)',
            color: 'var(--notion-text)',
            outline: 'none',
            minWidth: 120,
          }}
        />
        <button
          onClick={handleAddNovo}
          disabled={salvando}
          title="Salvar"
          aria-label="Salvar novo pagador"
          style={{
            height: 26, width: 26, border: 'none', borderRadius: 6,
            background: 'var(--status-success-soft)', color: 'var(--status-success)',
            cursor: salvando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: salvando ? 0.5 : 1,
          }}
        >
          <Check size={13} />
        </button>
        <button
          onClick={() => { setAdicionando(false); setNovoNome(''); }}
          title="Cancelar"
          aria-label="Cancelar"
          style={{
            height: 26, width: 26, border: 'none', borderRadius: 6,
            background: 'transparent', color: 'var(--notion-text-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value || null)}
        style={{
          height: 26,
          fontSize: 12,
          padding: '0 8px',
          border: '1px solid var(--notion-border)',
          borderRadius: 6,
          background: value ? 'var(--notion-surface)' : 'var(--notion-bg-alt)',
          color: value ? 'var(--notion-text)' : 'var(--notion-text-muted)',
          fontWeight: value ? 600 : 400,
          fontStyle: value ? 'normal' : 'italic',
          outline: 'none',
          cursor: 'pointer',
          minWidth: 140,
        }}
      >
        <option value="">{placeholder ?? '—'}</option>
        {pagadores.filter(p => p.ativo).map(p => (
          <option key={p.id} value={p.nome}>{p.nome}</option>
        ))}
        {value && !pagadores.some(p => p.nome === value) && (
          <option value={value}>{value} (antigo)</option>
        )}
      </select>
      {!hideAdd && (
        <button
          type="button"
          onClick={() => setAdicionando(true)}
          title="Adicionar novo"
          aria-label="Adicionar novo nome"
          style={{
            height: 26, width: 26, border: '1px solid var(--notion-border)', borderRadius: 6,
            background: 'var(--notion-bg-alt)', color: 'var(--notion-text-secondary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Plus size={13} />
        </button>
      )}
    </div>
  );
}


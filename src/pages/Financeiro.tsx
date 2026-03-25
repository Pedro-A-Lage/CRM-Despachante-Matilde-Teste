import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Download } from 'lucide-react';
import {
  getRelatorio,
  getRelatorioMensal,
  getTopServicos,
} from '../lib/financeService';
import type { FinanceRelatorio, RelatorioMensalItem, TopServicoItem } from '../lib/financeService';
import { TIPO_SERVICO_LABELS } from '../types';

const mesAtual = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  return { inicio: `${y}-${m}-01`, fim: `${y}-${m}-${last}` };
};

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtShort = (v: number) =>
  v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v.toFixed(0)}`;


function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const first = rows[0];
  if (!first) return;
  const headers = Object.keys(first);
  const csv = [
    headers.join(';'),
    ...rows.map(r =>
      headers
        .map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`)
        .join(';'),
    ),
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const inputStyle: React.CSSProperties = {
  marginTop: 4,
  border: '1px solid var(--border-color)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
  background: 'var(--bg-surface)',
  color: 'var(--color-text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card, var(--bg-surface))',
  border: '1px solid var(--border-color)',
  borderRadius: 16,
  padding: 20,
};

export default function Financeiro() {
  const [inicio, setInicio] = useState(mesAtual().inicio);
  const [fim, setFim] = useState(mesAtual().fim);
  const [relatorio, setRelatorio] = useState<FinanceRelatorio | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Analytics state
  const [mensal, setMensal] = useState<RelatorioMensalItem[]>([]);
  const [topServicos, setTopServicos] = useState<TopServicoItem[]>([]);

  const carregar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const [r, ms, ts] = await Promise.all([
        getRelatorio(inicio, fim),
        getRelatorioMensal(),
        getTopServicos(inicio, fim),
      ]);
      setRelatorio(r);
      setMensal(ms);
      setTopServicos(ts);
    } catch {
      setErro('Erro ao carregar dados financeiros.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const handleExportCSV = () => {
    if (!relatorio) return;
    // Export top services table as CSV (available without raw OS rows)
    const rows = topServicos.map(t => ({
      'Serviço': TIPO_SERVICO_LABELS[t.tipoServico as keyof typeof TIPO_SERVICO_LABELS] ?? t.tipoServico,
      'Qtd OS': t.qtdOS,
      'Receita Total': t.receitaTotal.toFixed(2).replace('.', ','),
      '% do Total': t.percentual.toFixed(1).replace('.', ',') + '%',
    }));
    if (rows.length === 0) {
      // Export summary as fallback
      const summary = [{
        'Período Início': inicio,
        'Período Fim': fim,
        'Receita': relatorio.receita.toFixed(2).replace('.', ','),
        'Custos': relatorio.totalCustos.toFixed(2).replace('.', ','),
        'Honorários': relatorio.honorarios.toFixed(2).replace('.', ','),
        'Recebido': relatorio.totalRecebido.toFixed(2).replace('.', ','),
        'A Receber': relatorio.aReceber.toFixed(2).replace('.', ','),
        'Qtd OS': relatorio.osCount,
      }];
      exportCSV(summary as Record<string, unknown>[], `financeiro_${inicio}_${fim}.csv`);
      return;
    }
    exportCSV(rows as Record<string, unknown>[], `servicos_${inicio}_${fim}.csv`);
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 20 }}>
        Financeiro
      </h1>

      {erro && (
        <div style={{
          background: 'rgba(220,38,38,0.08)', border: '1px solid var(--color-danger)',
          color: 'var(--color-danger)', borderRadius: 8, padding: '12px 16px', fontSize: 14, marginBottom: 16,
        }}>
          {erro}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Filtro de período + Export button */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end',
            background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
            borderRadius: 12, padding: 16,
          }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block' }}>De</label>
              <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block' }}>Até</label>
              <input type="date" value={fim} onChange={e => setFim(e.target.value)} style={inputStyle} />
            </div>
            <button
              onClick={carregar}
              disabled={loading}
              style={{
                padding: '8px 20px', background: 'var(--color-primary)',
                color: 'var(--color-text-on-primary, #fff)', borderRadius: 8, fontSize: 14,
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1, fontFamily: 'inherit', fontWeight: 600,
              }}
            >
              {loading ? 'Carregando...' : 'Filtrar'}
            </button>
            {relatorio && (
              <button
                onClick={handleExportCSV}
                title="Exportar CSV"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8, fontSize: 14,
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                  marginLeft: 'auto',
                }}
              >
                <Download size={15} />
                Exportar CSV
              </button>
            )}
          </div>

          {/* Cards resumo */}
          {relatorio && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <SummaryCard label="Receita" value={fmt(relatorio.receita)} color="var(--color-primary)"
                subtitle={`${relatorio.osCount} OS no período`} />
              <SummaryCard label="Custos" value={fmt(relatorio.totalCustos)} color="var(--color-warning)" />
              <SummaryCard label="Honorários" value={fmt(relatorio.honorarios)}
                color={relatorio.honorarios >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
              <SummaryCard label="Recebido" value={fmt(relatorio.totalRecebido)} color="var(--color-success)" />
              <SummaryCard label="A Receber" value={fmt(relatorio.aReceber)} color="var(--color-warning)" />
            </div>
          )}

          {/* ── SECTION A: Charts ── */}
          {mensal.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>

              {/* Chart 1: Receita x Custos x Honorários por mês */}
              <div style={cardStyle}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Receita · Custos · Honorários por Mês
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={mensal} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={fmtShort}
                      tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                    />
                    <Tooltip
                      formatter={(value) => [fmt(Number(value ?? 0))]}
                      contentStyle={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: 'var(--color-text-primary)', fontWeight: 600 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="receita" name="Receita" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="custos" name="Custos" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="honorarios" name="Honorários" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 2: Recebido x Pendente por mês */}
              <div style={cardStyle}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Recebido x Pendente por Mês
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={mensal} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradRecebido" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradPendente" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={fmtShort}
                      tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                    />
                    <Tooltip
                      formatter={(value) => [fmt(Number(value ?? 0))]}
                      contentStyle={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: 'var(--color-text-primary)', fontWeight: 600 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="monotone"
                      dataKey="recebido"
                      name="Recebido"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#gradRecebido)"
                      stackId="1"
                    />
                    <Area
                      type="monotone"
                      dataKey="pendente"
                      name="A Receber"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fill="url(#gradPendente)"
                      stackId="2"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── SECTION B: Top Serviços ── */}
          {topServicos.length > 0 && (
            <div style={cardStyle}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Receita por Tipo de Serviço
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 14, color: 'var(--color-text-primary)', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--color-text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <th style={{ textAlign: 'left', paddingBottom: 8, paddingRight: 12 }}>#</th>
                      <th style={{ textAlign: 'left', paddingBottom: 8, paddingRight: 12 }}>Serviço</th>
                      <th style={{ textAlign: 'center', paddingBottom: 8, paddingRight: 12 }}>Qtd OS</th>
                      <th style={{ textAlign: 'right', paddingBottom: 8, paddingRight: 12 }}>Receita Total</th>
                      <th style={{ textAlign: 'right', paddingBottom: 8 }}>% do Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topServicos.map((item, idx) => (
                      <tr key={item.tipoServico} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '9px 12px 9px 0', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '9px 12px 9px 0', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                          {TIPO_SERVICO_LABELS[item.tipoServico as keyof typeof TIPO_SERVICO_LABELS] ?? item.tipoServico}
                        </td>
                        <td style={{ padding: '9px 12px 9px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                          {item.qtdOS}
                        </td>
                        <td style={{ padding: '9px 12px 9px 0', textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>
                          {fmt(item.receitaTotal)}
                        </td>
                        <td style={{ padding: '9px 0', textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-block',
                            background: 'rgba(245,158,11,0.12)',
                            color: '#f59e0b',
                            borderRadius: 6,
                            padding: '2px 8px',
                            fontSize: 12,
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {item.percentual.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!relatorio && !loading && (
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: 40 }}>
              Clique em "Filtrar" para carregar as estatísticas.
            </p>
          )}
        </div>
    </div>
  );
}

// ── Helper components ──

function SummaryCard({ label, value, color, subtitle }: { label: string; value: string; color: string; subtitle?: string }) {
  return (
    <div style={{
      flex: '1 1 160px', minWidth: 160,
      background: 'var(--bg-surface)', border: `1px solid ${color}`,
      borderRadius: 12, padding: 16,
    }}>
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4 }}>{value}</p>
      {subtitle && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{subtitle}</p>}
    </div>
  );
}

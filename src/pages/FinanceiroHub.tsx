// src/pages/FinanceiroHub.tsx
//
// Hub que agrega as 3 telas financeiras em abas sincronizadas com a URL (?tab=).
// Os componentes originais (Financeiro, ControlePagamentos, ControleDiario)
// são renderizados sem alteração.

import { useSearchParams } from 'react-router-dom';
import { BarChart3, ClipboardCheck, Calendar } from 'lucide-react';
import Financeiro from './Financeiro';
import ControlePagamentos from './ControlePagamentos';
import ControleDiario from './ControleDiario';

type TabId = 'visao-geral' | 'pagamentos' | 'diario';

const TABS: { id: TabId; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'visao-geral', label: 'Visão Geral', icon: <BarChart3 size={15} />, desc: 'Gráficos, KPIs e top serviços' },
  { id: 'pagamentos', label: 'Confirmar Taxas', icon: <ClipboardCheck size={15} />, desc: 'Workflow de confirmação' },
  { id: 'diario', label: 'Controle Diário', icon: <Calendar size={15} />, desc: 'Reconciliação do dia' },
];

function normalizeTab(raw: string | null): TabId {
  if (raw === 'pagamentos' || raw === 'diario' || raw === 'visao-geral') return raw;
  return 'visao-geral';
}

export default function FinanceiroHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = normalizeTab(searchParams.get('tab'));

  const setTab = (tab: TabId) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'visao-geral') {
      next.delete('tab');
    } else {
      next.set('tab', tab);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      {/* Tab bar */}
      <div
        style={{
          background: 'var(--notion-surface)',
          border: '1px solid var(--notion-border)',
          borderRadius: 10,
          padding: 4,
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        {TABS.map(t => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              title={t.desc}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 7,
                border: 'none',
                background: active ? 'var(--notion-bg-alt)' : 'transparent',
                color: active ? 'var(--notion-blue)' : 'var(--notion-text-secondary)',
                fontWeight: active ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                boxShadow: active ? 'var(--shadow-card)' : 'none',
                transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo da aba ativa */}
      {activeTab === 'visao-geral' && <Financeiro />}
      {activeTab === 'pagamentos' && <ControlePagamentos />}
      {activeTab === 'diario' && <ControleDiario />}
    </div>
  );
}

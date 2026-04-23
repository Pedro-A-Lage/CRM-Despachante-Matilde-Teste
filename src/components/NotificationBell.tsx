// src/components/NotificationBell.tsx
//
// Sino de notificações no header. Badge com contagem total, dropdown com
// alertas agrupados por tipo, botão pra ativar notificações desktop.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Mail,
  AlertTriangle,
  Clock,
  Turtle,
  Check,
  BellRing,
  RefreshCw,
} from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import type { AppNotification, NotificationKind } from '../lib/notificationService';

const KIND_CONFIG: Record<NotificationKind, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  email: {
    label: 'E-mails',
    icon: <Mail size={14} />,
    color: 'var(--status-info)',
    bg: 'var(--status-info-soft)',
  },
  taxa_vencida: {
    label: 'Taxas vencidas',
    icon: <AlertTriangle size={14} />,
    color: 'var(--status-danger)',
    bg: 'var(--status-danger-soft)',
  },
  vistoria_atrasada: {
    label: 'Vistorias atrasadas',
    icon: <Clock size={14} />,
    color: 'var(--status-warn)',
    bg: 'var(--status-warn-soft)',
  },
  os_parada: {
    label: 'OS paradas',
    icon: <Turtle size={14} />,
    color: 'var(--notion-text-secondary)',
    bg: 'var(--notion-bg-alt)',
  },
};

const GROUP_ORDER: NotificationKind[] = ['email', 'taxa_vencida', 'vistoria_atrasada', 'os_parada'];

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const delta = Math.max(0, Date.now() - d);
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days} dia${days !== 1 ? 's' : ''}`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { summary, loading, refresh, permission, requestPermission } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const total = summary.counts.total;
  const grouped = groupByKind(summary.notifications);

  const handleClick = (n: AppNotification) => {
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={`Notificações${total > 0 ? ` (${total})` : ''}`}
        title={`Notificações${total > 0 ? ` (${total})` : ''}`}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 6,
          borderRadius: 8,
          position: 'relative',
          color: total > 0 ? 'var(--notion-blue)' : 'var(--notion-text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {total > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {total > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 99,
              background: 'var(--status-danger)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              lineHeight: '16px',
              textAlign: 'center',
              border: '2px solid var(--notion-bg)',
              boxSizing: 'content-box',
            }}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 360,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 'calc(100vh - 80px)',
            background: 'var(--notion-surface)',
            border: '1px solid var(--notion-border)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-deep)',
            zIndex: 9999,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--notion-border)',
              background: 'var(--notion-bg-alt)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bell size={14} style={{ color: 'var(--notion-text-secondary)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--notion-text)' }}>
                Notificações
              </span>
              {total > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--notion-blue)',
                    background: 'rgba(0,117,222,0.1)',
                    padding: '1px 7px',
                    borderRadius: 99,
                  }}
                >
                  {total}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              title="Atualizar"
              aria-label="Atualizar notificações"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: loading ? 'wait' : 'pointer',
                color: 'var(--notion-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                padding: 2,
              }}
            >
              <RefreshCw size={13} style={{ animation: loading ? 'notif-spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Ativar notificações desktop */}
          {permission === 'default' && (
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(0,117,222,0.06)',
                borderBottom: '1px solid var(--notion-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <BellRing size={14} style={{ color: 'var(--notion-blue)', flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, color: 'var(--notion-text)' }}>
                Ativar notificações do navegador?
              </div>
              <button
                onClick={requestPermission}
                className="btn btn-primary btn-sm"
                style={{ fontSize: 11, padding: '4px 10px' }}
              >
                Ativar
              </button>
            </div>
          )}

          {/* Lista */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {total === 0 && !loading && (
              <div style={{ padding: '30px 14px', textAlign: 'center', color: 'var(--notion-text-muted)' }}>
                <Check size={28} style={{ opacity: 0.4, display: 'block', margin: '0 auto 8px' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--notion-text)' }}>Tudo em dia</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>Nenhuma pendência ou e-mail novo.</div>
              </div>
            )}

            {GROUP_ORDER.map(kind => {
              const items = grouped[kind] ?? [];
              if (items.length === 0) return null;
              const cfg = KIND_CONFIG[kind];
              return (
                <div key={kind}>
                  <div
                    style={{
                      padding: '8px 14px',
                      background: cfg.bg,
                      color: cfg.color,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      borderBottom: '1px solid var(--notion-border)',
                    }}
                  >
                    {cfg.icon}
                    <span>{cfg.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11 }}>{items.length}</span>
                  </div>
                  {items.slice(0, 8).map(n => (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 14px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--notion-border)',
                        cursor: n.link ? 'pointer' : 'default',
                        color: 'var(--notion-text)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--notion-bg-alt)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }}
                    >
                      <div style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {n.title}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                        <span style={{
                          fontSize: 11,
                          color: 'var(--notion-text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          marginRight: 6,
                        }}>
                          {n.subtitle}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--notion-text-muted)', flexShrink: 0 }}>
                          {formatRelative(n.timestamp)}
                        </span>
                      </div>
                    </button>
                  ))}
                  {items.length > 8 && (
                    <div style={{
                      padding: '6px 14px',
                      fontSize: 11,
                      color: 'var(--notion-text-muted)',
                      textAlign: 'center',
                      borderBottom: '1px solid var(--notion-border)',
                    }}>
                      + {items.length - 8} mais…
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`@keyframes notif-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function groupByKind(list: AppNotification[]): Record<NotificationKind, AppNotification[]> {
  const g: Record<NotificationKind, AppNotification[]> = {
    email: [],
    taxa_vencida: [],
    vistoria_atrasada: [],
    os_parada: [],
  };
  for (const n of list) g[n.kind].push(n);
  return g;
}

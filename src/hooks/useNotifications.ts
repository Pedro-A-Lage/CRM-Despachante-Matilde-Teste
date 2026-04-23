// src/hooks/useNotifications.ts
//
// Faz polling periódico da agregação de notificações e decide quando disparar
// notificações desktop (Notification API). Só roda quando a aba está visível.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAllNotifications, NotificationSummary, AppNotification } from '../lib/notificationService';

const POLL_INTERVAL_MS = 90_000; // 90s
const LS_SEEN_IDS = 'crm_notif_seen_ids';
const LS_PERMISSION_PROMPTED = 'crm_notif_permission_prompted';

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_SEEN_IDS);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  try {
    // Cap em 500 pra não crescer indefinidamente
    const arr = Array.from(ids).slice(-500);
    localStorage.setItem(LS_SEEN_IDS, JSON.stringify(arr));
  } catch {}
}

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

function getPermissionState(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function useNotifications() {
  const [summary, setSummary] = useState<NotificationSummary>({
    notifications: [],
    counts: { email: 0, taxa_vencida: 0, vistoria_atrasada: 0, os_parada: 0, total: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<PermissionState>(getPermissionState());
  const seenIdsRef = useRef<Set<string>>(loadSeenIds());
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getAllNotifications();
      setSummary(next);

      // Disparar desktop notification para cada novo item ainda não visto
      if (permission === 'granted' && typeof window !== 'undefined' && 'Notification' in window) {
        const seen = seenIdsRef.current;
        const novos = next.notifications.filter(n => !seen.has(n.id));
        for (const n of novos) {
          try {
            const notif = new Notification(notifTitle(n), {
              body: n.subtitle || '',
              tag: n.id,
              icon: '/logo.png',
            });
            notif.onclick = () => {
              window.focus();
              if (n.link) window.location.href = n.link;
              notif.close();
            };
          } catch {}
          seen.add(n.id);
        }
        if (novos.length > 0) saveSeenIds(seen);
      } else {
        // Sem permissão ativa: só registra os IDs pra não bombardear quando ativar depois
        next.notifications.forEach(n => seenIdsRef.current.add(n.id));
        saveSeenIds(seenIdsRef.current);
      }
    } finally {
      setLoading(false);
    }
  }, [permission]);

  // Carga inicial + polling
  useEffect(() => {
    refresh();
    const start = () => {
      if (pollRef.current) return;
      pollRef.current = window.setInterval(() => {
        if (document.visibilityState === 'visible') refresh();
      }, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        start();
      } else {
        stop();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    start();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    try {
      localStorage.setItem(LS_PERMISSION_PROMPTED, '1');
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch {
      return 'denied' as PermissionState;
    }
  }, []);

  const alreadyPrompted = (() => {
    try { return localStorage.getItem(LS_PERMISSION_PROMPTED) === '1'; } catch { return false; }
  })();

  return {
    summary,
    loading,
    refresh,
    permission,
    requestPermission,
    alreadyPrompted,
  };
}

function notifTitle(n: AppNotification): string {
  switch (n.kind) {
    case 'email': return `📧 ${n.title}`;
    case 'taxa_vencida': return `⚠️ ${n.title}`;
    case 'vistoria_atrasada': return `⏰ ${n.title}`;
    case 'os_parada': return `🐢 ${n.title}`;
  }
}

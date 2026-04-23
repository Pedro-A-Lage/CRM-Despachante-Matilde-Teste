// src/lib/notificationService.ts
//
// Agrega fontes de alerta do CRM (emails não lidos, taxas vencidas, vistorias
// atrasadas, OS paradas) num formato único pra o sino de notificações.

import { supabase } from './supabaseClient';

export type NotificationKind = 'email' | 'taxa_vencida' | 'vistoria_atrasada' | 'os_parada';

export interface AppNotification {
  id: string;            // chave estável (usado pra dedupe em desktop push)
  kind: NotificationKind;
  title: string;
  subtitle?: string;
  link?: string;         // rota interna pra navegar
  // timestamp do evento (pra ordenar; ISO string)
  timestamp: string;
  // dias em atraso (quando aplicável)
  daysLate?: number;
}

export interface NotificationSummary {
  notifications: AppNotification[];
  counts: {
    email: number;
    taxa_vencida: number;
    vistoria_atrasada: number;
    os_parada: number;
    total: number;
  };
}

const OS_PARADA_LIMITE_DIAS = 7;

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!;
}

function daysBetween(isoDate: string): number {
  const d = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - d) / 86_400_000));
}

// ── E-mails não lidos ─────────────────────────────────────────────────────────

export async function fetchUnreadEmails(limit = 10): Promise<AppNotification[]> {
  try {
    // Reutiliza a edge function existente usada em Emails.tsx
    const { data, error } = await supabase.functions.invoke('get-outlook-emails', {
      body: { limit: 25, direction: 'in' },
    });
    if (error) throw error;
    const emails: any[] = Array.isArray(data) ? data : (data?.emails ?? []);
    const unread = emails.filter(e => e.isRead === false);
    return unread.slice(0, limit).map(e => ({
      id: `email_${e.id}`,
      kind: 'email' as const,
      title: e.subject || '(sem assunto)',
      subtitle: e.from?.emailAddress?.name || e.from?.emailAddress?.address || '',
      link: '/emails',
      timestamp: e.receivedDateTime || new Date().toISOString(),
    }));
  } catch (err) {
    console.warn('[notifications] falha ao buscar emails não lidos:', err);
    return [];
  }
}

// ── Taxas vencidas ────────────────────────────────────────────────────────────

export async function fetchOverdueCharges(): Promise<AppNotification[]> {
  const today = todayStr();
  const { data, error } = await supabase
    .from('finance_charges')
    .select('id, os_id, descricao, categoria, valor_previsto, due_date')
    .eq('status', 'a_pagar')
    .lt('due_date', today)
    .order('due_date', { ascending: true })
    .limit(30);
  if (error) {
    console.warn('[notifications] falha ao buscar taxas vencidas:', error);
    return [];
  }
  return (data ?? []).map((c: any) => {
    const dias = c.due_date ? daysBetween(c.due_date) : 0;
    const valor = Number(c.valor_previsto || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return {
      id: `taxa_${c.id}`,
      kind: 'taxa_vencida' as const,
      title: `${c.descricao || 'Taxa'} vencida · ${valor}`,
      subtitle: `Há ${dias} dia${dias !== 1 ? 's' : ''}`,
      link: `/ordens/${c.os_id}`,
      timestamp: c.due_date || new Date().toISOString(),
      daysLate: dias,
    };
  });
}

// ── Vistorias atrasadas ───────────────────────────────────────────────────────

export async function fetchOverdueVistorias(): Promise<AppNotification[]> {
  const today = todayStr();
  const { data, error } = await supabase
    .from('ordens_de_servico')
    .select('id, numero, cliente_id, vistoria')
    .not('vistoria', 'is', null)
    .limit(200);
  if (error) {
    console.warn('[notifications] falha ao buscar vistorias atrasadas:', error);
    return [];
  }
  const list: AppNotification[] = [];
  for (const row of (data ?? []) as any[]) {
    const v = row.vistoria;
    if (!v) continue;
    const agendada = v.dataAgendamento as string | undefined;
    const status = v.status as string | undefined;
    if (!agendada) continue;
    if (agendada >= today) continue; // ainda não passou
    if (status === 'aprovada' || status === 'aprovada_apontamento') continue;
    const dias = daysBetween(agendada);
    list.push({
      id: `vistoria_${row.id}`,
      kind: 'vistoria_atrasada',
      title: `OS #${row.numero} — vistoria atrasada`,
      subtitle: `Agendada há ${dias} dia${dias !== 1 ? 's' : ''}`,
      link: `/ordens/${row.id}`,
      timestamp: agendada,
      daysLate: dias,
    });
  }
  return list.sort((a, b) => (b.daysLate || 0) - (a.daysLate || 0)).slice(0, 30);
}

// ── OS paradas há muitos dias ─────────────────────────────────────────────────

export async function fetchOSParadas(limiteDias = OS_PARADA_LIMITE_DIAS): Promise<AppNotification[]> {
  const limiteIso = new Date(Date.now() - limiteDias * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('ordens_de_servico')
    .select('id, numero, status, atualizado_em, cliente_id')
    .neq('status', 'entregue')
    .neq('status', 'cancelada')
    .lt('atualizado_em', limiteIso)
    .order('atualizado_em', { ascending: true })
    .limit(30);
  if (error) {
    console.warn('[notifications] falha ao buscar OS paradas:', error);
    return [];
  }
  return (data ?? []).map((o: any) => {
    const dias = daysBetween(o.atualizado_em);
    return {
      id: `os_parada_${o.id}`,
      kind: 'os_parada' as const,
      title: `OS #${o.numero} parada`,
      subtitle: `Sem atualização há ${dias} dia${dias !== 1 ? 's' : ''}`,
      link: `/ordens/${o.id}`,
      timestamp: o.atualizado_em,
      daysLate: dias,
    };
  });
}

// ── Agregador ────────────────────────────────────────────────────────────────

export async function getAllNotifications(): Promise<NotificationSummary> {
  const [emails, taxas, vistorias, osParadas] = await Promise.all([
    fetchUnreadEmails(),
    fetchOverdueCharges(),
    fetchOverdueVistorias(),
    fetchOSParadas(),
  ]);
  const all = [...emails, ...taxas, ...vistorias, ...osParadas];
  return {
    notifications: all,
    counts: {
      email: emails.length,
      taxa_vencida: taxas.length,
      vistoria_atrasada: vistorias.length,
      os_parada: osParadas.length,
      total: all.length,
    },
  };
}

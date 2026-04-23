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

// OS nestes status não geram notificação (pra evitar ruído após resolvidas)
const OS_STATUS_RESOLVIDOS = ['doc_pronto', 'entregue', 'cancelada'];

interface OsMeta {
  status: string;
  troca_placa: boolean;
  sifap: any;
}

// Considera OS "resolvida" (não notificar) se:
// 1. Status está entre os resolvidos (doc_pronto, entregue, cancelada)
// 2. OU: é troca de placa E a nova placa já foi atribuída via SIFAP
//    (sifap.novaPlaca preenchido)
function isOsResolvida(meta: OsMeta | undefined): boolean {
  if (!meta) return false;
  if (OS_STATUS_RESOLVIDOS.includes(meta.status)) return true;
  if (meta.troca_placa && meta.sifap && typeof meta.sifap === 'object' && meta.sifap.novaPlaca) return true;
  return false;
}

async function getOsMetaById(osIds: string[]): Promise<Map<string, OsMeta>> {
  if (osIds.length === 0) return new Map();
  const map = new Map<string, OsMeta>();
  const CHUNK = 100;
  for (let i = 0; i < osIds.length; i += CHUNK) {
    const chunk = osIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('ordens_de_servico')
      .select('id, status, troca_placa, sifap')
      .in('id', chunk);
    if (error) {
      console.warn('[notifications] falha ao buscar metadados das OS:', error);
      continue;
    }
    for (const row of (data ?? []) as any[]) {
      map.set(row.id, { status: row.status, troca_placa: row.troca_placa, sifap: row.sifap });
    }
  }
  return map;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!;
}

function daysBetween(isoDate: string): number {
  const d = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - d) / 86_400_000));
}

// ── E-mails não lidos ─────────────────────────────────────────────────────────
//
// Mesma regra da tela /emails (src/pages/Emails.tsx): só considera pastas
// vinculadas a uma empresa parceira (via pastaOutlook ou nome) + as
// system folders (placas/placa — destino dos comprovantes de emplacamento).
// Pula Inbox, Drafts, Sent Items, etc.

const SYSTEM_FOLDERS = ['placas', 'placa'];
const MAX_EMAILS_PER_FOLDER = 5;
const MAX_EMAIL_NOTIFICATIONS = 12;

export async function fetchUnreadEmails(): Promise<AppNotification[]> {
  try {
    const [foldersRes, empresasRes] = await Promise.all([
      supabase.functions.invoke('get-outlook-folders'),
      supabase.from('empresas_parceiras').select('nome, pasta_outlook').limit(200),
    ]);

    if (foldersRes.error) throw foldersRes.error;
    const allFolders: any[] = foldersRes.data?.folders ?? [];
    const empresaPastaNames = new Set<string>();
    for (const e of (empresasRes.data ?? []) as any[]) {
      const pasta = ((e.pasta_outlook as string) || (e.nome as string) || '').trim().toLowerCase();
      if (pasta) empresaPastaNames.add(pasta);
    }

    // Só pastas permitidas e com algum unread
    const foldersRelevantes = allFolders.filter(f => {
      const name = (f.displayName || '').trim().toLowerCase();
      const isAllowed = SYSTEM_FOLDERS.includes(name) || empresaPastaNames.has(name);
      return isAllowed && (Number(f.unreadItemCount) || 0) > 0;
    });

    if (foldersRelevantes.length === 0) return [];

    // Pra cada pasta relevante, busca os últimos e-mails e filtra unread.
    // Requests em paralelo (tipicamente só 1-3 pastas ativas por vez).
    const perFolderPromises = foldersRelevantes.map(async folder => {
      try {
        const { data, error } = await supabase.functions.invoke('get-outlook-emails', {
          body: { folderName: folder.displayName, limit: MAX_EMAILS_PER_FOLDER },
        });
        if (error) throw error;
        const emails: any[] = Array.isArray(data) ? data : (data?.emails ?? []);
        return emails
          .filter(e => e.isRead === false)
          .map(e => ({
            id: `email_${e.id}`,
            kind: 'email' as const,
            title: e.subject || '(sem assunto)',
            subtitle: [
              e.from?.emailAddress?.name || e.from?.emailAddress?.address || '',
              folder.displayName,
            ].filter(Boolean).join(' · '),
            link: '/emails',
            timestamp: e.receivedDateTime || new Date().toISOString(),
          }));
      } catch (err) {
        console.warn(`[notifications] falha ao buscar pasta ${folder.displayName}:`, err);
        return [];
      }
    });

    const results = await Promise.all(perFolderPromises);
    const all = results.flat();
    // Ordena mais recente primeiro e limita o total
    all.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return all.slice(0, MAX_EMAIL_NOTIFICATIONS);
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
    .limit(60);
  if (error) {
    console.warn('[notifications] falha ao buscar taxas vencidas:', error);
    return [];
  }
  const charges = (data ?? []) as any[];

  // Filtra charges cujo OS está resolvida (status doc_pronto/entregue/
  // cancelada OU troca de placa já feita)
  const osIds = Array.from(new Set(charges.map(c => c.os_id).filter(Boolean)));
  const metaById = await getOsMetaById(osIds);
  const ativos = charges.filter(c => !isOsResolvida(metaById.get(c.os_id)));

  return ativos.slice(0, 30).map((c: any) => {
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
    .select('id, numero, status, cliente_id, vistoria, troca_placa, sifap')
    .not('vistoria', 'is', null)
    .not('status', 'in', `(${OS_STATUS_RESOLVIDOS.join(',')})`)
    .limit(200);
  if (error) {
    console.warn('[notifications] falha ao buscar vistorias atrasadas:', error);
    return [];
  }
  const list: AppNotification[] = [];
  for (const row of (data ?? []) as any[]) {
    const v = row.vistoria;
    if (!v) continue;
    // Pula OS cuja troca de placa já foi realizada
    if (isOsResolvida({ status: row.status, troca_placa: row.troca_placa, sifap: row.sifap })) continue;
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
    .select('id, numero, status, atualizado_em, cliente_id, troca_placa, sifap')
    .not('status', 'in', `(${OS_STATUS_RESOLVIDOS.join(',')})`)
    .lt('atualizado_em', limiteIso)
    .order('atualizado_em', { ascending: true })
    .limit(60);
  if (error) {
    console.warn('[notifications] falha ao buscar OS paradas:', error);
    return [];
  }
  // Filtro extra: OS com troca de placa já realizada (sifap.novaPlaca
  // preenchido) não deve notificar, mesmo que o status ainda não tenha
  // avançado pra doc_pronto.
  const ativos = (data ?? []).filter((o: any) =>
    !isOsResolvida({ status: o.status, troca_placa: o.troca_placa, sifap: o.sifap })
  );
  return ativos.slice(0, 30).map((o: any) => {
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

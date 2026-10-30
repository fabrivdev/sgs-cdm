import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { requestStatusLabels, validateQuestion, type RequestStatus, type TopicRequest } from './topicRequests';

export const topicRequestsEnabled = () => import.meta.env.VITE_CAMPI_TOPIC_REQUESTS_ENABLED === 'true';
export const REQUESTS_UNAVAILABLE = 'El envío de propuestas todavía no está habilitado.';
export type TopicRelease = { id: string; title: string };
export type RequestInbox = { rows: TopicRequest[]; releases: TopicRelease[] };
export interface TopicRequestApi {
  enabled(): boolean;
  load(user: string, admin: boolean): Promise<RequestInbox>;
  submit(user: string, key: string, question: string): Promise<TopicRequest>;
  manage(user: string, id: string, status: RequestStatus, topic: string, reason: string): Promise<TopicRequest>;
}
type RecordData = Record<string, unknown>;
function record(value: unknown): RecordData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('No se pudo verificar la respuesta. Actualizá el seguimiento antes de continuar.');
  return value as RecordData;
}
function text(r: RecordData, key: string) {
  if (typeof r[key] !== 'string') throw new Error('La respuesta del seguimiento está incompleta.');
  return r[key] as string;
}
export function parseTopicRequest(value: unknown): TopicRequest {
  const r = record(value), status = text(r, 'status');
  if (!Object.prototype.hasOwnProperty.call(requestStatusLabels, status) || !Number.isFinite(Date.parse(text(r, 'created_at'))) || (r.topic_id !== null && typeof r.topic_id !== 'string')) throw new Error('La respuesta del seguimiento está incompleta.');
  return { id: text(r, 'id'), owner: text(r, 'owner_id'), question: text(r, 'question'), createdAt: text(r, 'created_at'), status: status as RequestStatus, topicId: r.topic_id as string | null, reason: text(r, 'reason'), notified: false };
}

// New database objects are not installed yet. Keep the ungenerated type boundary
// here; validate server results and never turn a missing backend into demo success.
export function createTopicRequestApi(client: SupabaseClient, enabled = topicRequestsEnabled): TopicRequestApi {
  async function session(user: string) {
    if (!enabled()) throw new Error(REQUESTS_UNAVAILABLE);
    const { data, error } = await client.auth.getUser();
    if (error || !user || data.user?.id !== user) throw new Error('Tu sesión cambió. Volvé a ingresar antes de continuar.');
  }
  async function pages(table: string, columns: string, owner?: string): Promise<RecordData[]> {
    const result: RecordData[] = [];
    for (let start = 0; ; start += 200) {
      let query = client.from(table).select(columns).order(table === 'campi_topic_releases' ? 'topic_id' : 'id');
      if (owner) query = query.eq('owner_id', owner);
      const { data, error } = await query.range(start, start + 199);
      if (error || !Array.isArray(data)) throw new Error('No se pudo actualizar el seguimiento. Intentá nuevamente.');
      result.push(...data.map(record));
      if (data.length < 200) return result;
    }
  }
  return {
    enabled,
    async load(user, admin) {
      await session(user);
      const [raw, releasesRaw, notices] = await Promise.all([
        pages('campi_topic_requests', 'id,owner_id,question,created_at,status,topic_id,reason', admin ? undefined : user),
        pages('campi_topic_releases', 'topic_id,title,published_at'),
        pages('campi_topic_notices', 'id,request_id,owner_id,topic_id', user),
      ]);
      const releases = releasesRaw.map(r => ({ id: text(r, 'topic_id'), title: text(r, 'title') }));
      const rows = raw.map(parseTopicRequest);
      if ((!admin && rows.some(r => r.owner !== user)) || notices.some(n => n.owner_id !== user)) throw new Error('No se pudo verificar el acceso al seguimiento.');
      for (const row of rows) row.notified = row.owner === user && row.status === 'disponible' && releases.some(r => r.id === row.topicId) && notices.some(n => n.request_id === row.id && n.topic_id === row.topicId);
      return { rows: rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)), releases };
    },
    async submit(user, key, question) {
      const value = validateQuestion(question);
      await session(user);
      const { data, error } = await client.rpc('campi_submit_topic_request', { p_key: key, p_question: value });
      if (error) throw new Error('No se pudo confirmar el envío. Reintentá sin cambiar el texto para evitar duplicados.');
      const row = parseTopicRequest(data);
      if (row.owner !== user || row.question !== value || record(data).client_key !== key) throw new Error('No se pudo confirmar el envío. Actualizá el seguimiento antes de continuar.');
      return row;
    },
    async manage(user, id, status, topic, reason) {
      await session(user);
      const { data, error } = await client.rpc('campi_manage_topic_request', { p_id: id, p_status: status, p_topic: topic || null, p_reason: reason.trim() });
      if (error) throw new Error('No se pudo confirmar el cambio. Actualizá el seguimiento; para marcar Disponible, el tema debe estar publicado y autorizado para el solicitante.');
      const row = parseTopicRequest(data);
      if (row.id !== id || row.status !== status || row.topicId !== (topic || null) || row.reason !== reason.trim()) throw new Error('No se pudo verificar el cambio. Actualizá el seguimiento antes de continuar.');
      return row;
    },
  };
}
export const topicRequestApi = createTopicRequestApi(supabase as unknown as SupabaseClient);

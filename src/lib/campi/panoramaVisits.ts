/* eslint-disable @typescript-eslint/no-explicit-any -- New table is typed when Supabase types are regenerated. */
import { supabase } from '@/integrations/supabase/client';
import type { PanoramaMetric } from './panoramaData';

export type VisitMetric = Pick<PanoramaMetric, 'id' | 'value' | 'unit' | 'section' | 'scope' | 'period' | 'version'>;
export type PanoramaVisit = { captured_at: string; metrics: VisitMetric[] };

const client = supabase as any;
const sessionKey = (userId: string) => `sig-cdm:panorama:session:${userId}`;

export function panoramaSessionId(userId: string) {
  const key = sessionKey(userId);
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) return stored;
    const created = crypto.randomUUID();
    sessionStorage.setItem(key, created);
    return created;
  } catch { return crypto.randomUUID(); }
}

export function visitMetrics(metrics: readonly PanoramaMetric[]): VisitMetric[] {
  return metrics.filter(metric => Number.isFinite(metric.value)).slice(0, 32).map(({ id, value, unit, section, scope, period, version }) =>
    ({ id, value, unit, section, scope, period, version }));
}

export function metricChange(current: PanoramaMetric, previous: PanoramaVisit | null): number | null {
  const old = previous?.metrics.find(metric => metric.id === current.id);
  if (!old || old.unit !== current.unit || old.section !== current.section || old.scope !== current.scope
    || old.period !== current.period || old.version !== current.version || !Number.isFinite(old.value)) return null;
  return current.value - old.value;
}

export async function previousPanoramaVisit(userId: string, sessionId: string): Promise<PanoramaVisit | null> {
  const { data, error } = await client.from('campi_panorama_visitas')
    .select('captured_at,metrics').eq('user_id', userId).neq('client_session_id', sessionId)
    .order('captured_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message || 'No se pudo consultar la última visita.');
  if (!data || !Array.isArray(data.metrics)) return null;
  return { captured_at: data.captured_at, metrics: data.metrics };
}

export async function recordPanoramaVisit(userId: string, sessionId: string, metrics: readonly PanoramaMetric[]) {
  const values = visitMetrics(metrics);
  if (!values.length) return;
  const { error } = await client.from('campi_panorama_visitas').insert({ user_id: userId, client_session_id: sessionId, metrics: values });
  if (error && error.code !== '23505') throw new Error(error.message || 'No se pudo guardar la visita.');
}

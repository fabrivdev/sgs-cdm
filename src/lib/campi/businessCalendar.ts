import { supabase } from '@/integrations/supabase/client';
import { validDay } from './panoramaDates';

/** Read only the existing calendar under its existing section permission/RLS. */
export async function loadBusinessClosures(day: string, signal?: AbortSignal): Promise<string[]> {
  if (!validDay(day)) throw new Error('Fecha inválida.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 10000);
  try {
    const { data, error } = await supabase.from('dias_no_laborales').select('fecha')
      .gte('fecha', day.slice(0, 7) + '-01').lte('fecha', day).abortSignal(controller.signal);
    if (error || !data || data.some(row => !validDay(row.fecha))) throw new Error('No se pudo verificar el calendario laboral.');
    return [...new Set(data.map(row => row.fecha))];
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

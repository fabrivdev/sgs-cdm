export type PanoramaCohort = 'resolution' | 'open';
type OrderDates = { situacion_os: string | null; fecha_abierta_os: string | null; fecha_cierre_os: string | null };
const day = (value: string | null) => value?.slice(0, 10) ?? '';
/** Mirrors the operational RPC, without changing the default workspace population. */
export function inPanoramaCohort(row: OrderDates, cohort: PanoramaCohort, from: string, to: string) {
  const state = (row.situacion_os ?? '').toLowerCase();
  const opened = day(row.fecha_abierta_os);
  const closed = day(row.fecha_cierre_os);
  return cohort === 'open'
    ? state.includes('abiert') && Boolean(opened) && opened <= to
    : state.includes('cerrad') && Boolean(opened && closed) && opened <= closed && closed >= from && closed <= to;
}

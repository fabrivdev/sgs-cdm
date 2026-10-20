import { supabase } from '@/integrations/supabase/client';
import type { PanoramaStory } from './panoramaStoryTypes';

type Scope = NonNullable<PanoramaStory['machineOrders']>;
type RawRow = {
  id: string | null; operacion_id: string | null; np_numero: string | null; np_fecha: string | null;
  cliente_nombre: string | null; cantidad: number | null;
  estado_operacion: string | null; estado_fuente: string | null;
  importacion_linea_id: string | null; ata: string | null;
};
export type MachineOrderDetailRow = {
  id: string; number: string; client: string; units: number; age: number | null;
  status: 'stock' | 'arrived' | 'transit' | 'unlinked' | 'mixed' | 'review';
};
export type MachineOrdersDetailData = {
  orders: MachineOrderDetailRow[];
  ages: { label: string; count: number }[];
};

const validDay = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function buildMachineOrdersDetail(rawRows: RawRow[], scope: Scope): MachineOrdersDetailData {
  const rows = rawRows.filter(row => !['CERRADA', 'FACTURADA', 'CANCELADA'].includes((row.estado_operacion ?? '').trim().toUpperCase())
    && !(row.estado_fuente ?? '').trim().toUpperCase().includes('CANCEL'));
  const identities = new Set<string>();
  const grouped = new Map<string, RawRow[]>();
  let units = 0;
  for (const row of rows) {
    if (!row.id || !row.operacion_id || !Number.isInteger(row.cantidad) || row.cantidad! <= 0 || identities.has(row.id)) throw new Error('Las líneas de pedidos están incompletas.');
    identities.add(row.id);
    units += row.cantidad!;
    grouped.set(row.operacion_id, [...(grouped.get(row.operacion_id) ?? []), row]);
  }
  if (units !== scope.units || grouped.size !== scope.orders) throw new Error('El detalle cambió desde el resumen. Actualizá Panorama.');
  const ready = new Map(scope.ready.map(row => [row.id, row.units]));
  const unresolved = new Map(scope.unresolved.map(row => [row.id, row.units]));
  const asOf = Date.parse(`${scope.asOf}T00:00:00Z`);
  const orders = [...grouped].map(([id, entries]): MachineOrderDetailRow => {
    const first = entries[0];
    const date = first.np_fecha?.slice(0, 10) ?? null;
    const consistentDate = entries.every(row => row.np_fecha === first.np_fecha);
    const ageValue = consistentDate && validDay(date) ? Math.floor((asOf - Date.parse(`${date}T00:00:00Z`)) / 86400000) : null;
    const age = ageValue !== null && ageValue >= 0 ? ageValue : null;
    const client = entries.every(row => row.cliente_nombre === first.cliente_nombre)
      ? first.cliente_nombre?.trim() || 'Sin cliente' : 'Cliente por revisar';
    const count = entries.reduce((sum, row) => sum + row.cantidad!, 0);
    const stocked = ready.get(id) ?? 0;
    const missing = unresolved.get(id) ?? 0;
    if (stocked + missing > count) throw new Error('El abastecimiento del pedido no concilia.');
    const remaining = count - stocked - missing;
    const arrived = entries.some(row => row.importacion_linea_id && row.ata);
    const transit = entries.some(row => row.importacion_linea_id && !row.ata);
    const groups = [stocked > 0, missing > 0, remaining > 0 && arrived, remaining > 0 && transit].filter(Boolean).length;
    const status: MachineOrderDetailRow['status'] = groups > 1 ? 'mixed' : stocked ? 'stock' : missing ? 'unlinked' : arrived ? 'arrived' : transit ? 'transit' : 'review';
    return { id, number: entries.every(row => row.np_numero === first.np_numero) ? first.np_numero?.trim() || 'Sin NP' : 'NP por revisar', client,
      units: count, age, status };
  });
  const buckets = [
    { label: '0–30 días', count: 0 }, { label: '31–60 días', count: 0 },
    { label: '61–90 días', count: 0 }, { label: 'Más de 90 días', count: 0 },
    { label: 'Sin fecha', count: 0 },
  ];
  for (const order of orders) buckets[order.age === null ? 4 : order.age <= 30 ? 0 : order.age <= 60 ? 1 : order.age <= 90 ? 2 : 3].count++;
  return { orders, ages: buckets.filter(bucket => bucket.count > 0) };
}

export async function loadMachineOrdersDetail(scope: Scope): Promise<MachineOrdersDetailData> {
  const rows: RawRow[] = [];
  let expected: number | null = null;
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from('maquinaria_pedidos_lineas_estado_actual')
      .select('id,operacion_id,np_numero,np_fecha,cliente_nombre,cantidad,estado_operacion,estado_fuente,importacion_linea_id,ata', { count: 'exact' })
      .order('id').range(offset, offset + 499);
    if (result.error || !Array.isArray(result.data) || result.count === null) throw new Error('No se pudo cargar el detalle de pedidos.');
    if (expected === null) expected = result.count;
    if (expected !== result.count || expected > 5000) throw new Error('El detalle de pedidos cambió durante la lectura.');
    rows.push(...result.data);
    if (rows.length === expected) break;
    if (result.data.length !== 500 || rows.length > expected) throw new Error('El detalle de pedidos está incompleto.');
  }
  return buildMachineOrdersDetail(rows, scope);
}

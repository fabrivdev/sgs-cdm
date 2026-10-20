import { importedOrderModel } from '@/features/service-orders/orderMetrics';
import { normalizeClienteKey } from '@/features/service-orders/useOperationsModel';
import { supabase } from '@/integrations/supabase/client';
import { resolveDashboardServiceOrderBranch } from '@/lib/serviceOrderBranch';
import type { PanoramaStory } from './panoramaStoryTypes';

type Scope = NonNullable<PanoramaStory['openOrders']>;
export type SourceOrder = {
  os_numero: string; cliente_nombre: string | null; marca: string | null;
  fecha_abierta_os: string | null; situacion_os: string | null;
  tipo_tiempo: string | null; raw_data: unknown;
};
export type OpenOrderRow = {
  number: string; client: string; brand: string; model: string | null;
  branch: string; age: number | null; type: string;
};
export type ServiceOpenOrdersDetailData = {
  orders: OpenOrderRow[]; clients: number | null; averageAge: number | null;
  branches: { name: string; count: number }[];
  types: { name: string; count: number }[];
};

const day = (value: string | null): number | null => {
  const date = value?.slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const stamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === date ? stamp / 86400000 : null;
};
const group = (values: string[]) => [...values.reduce((map, name) => map.set(name, (map.get(name) ?? 0) + 1), new Map<string, number>())]
  .map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
const ageLabel = (age: number | null) => age === null ? 'Sin fecha válida' : age <= 7 ? '0–7 días' : age <= 30 ? '8–30 días' : age <= 90 ? '31–90 días' : 'Más de 90 días';

export function buildServiceOpenOrdersDetail(rows: SourceOrder[], scope: Scope): ServiceOpenOrdersDetailData {
  if (rows.length !== scope.count || !day(scope.asOf)) throw new Error('El detalle de OS cambió desde el resumen. Actualizá Panorama.');
  const identities = new Set<string>();
  const asOf = day(scope.asOf)!;
  const orders = rows.map((row): OpenOrderRow => {
    if (!row.os_numero || identities.has(row.os_numero) || !(row.situacion_os ?? '').toLowerCase().includes('abiert'))
      throw new Error('Las OS abiertas no concilian con el resumen.');
    identities.add(row.os_numero);
    const raw = row.raw_data && typeof row.raw_data === 'object' && !Array.isArray(row.raw_data)
      ? row.raw_data as Record<string, unknown> : {};
    const opened = day(row.fecha_abierta_os);
    const age = opened !== null && opened <= asOf ? asOf - opened : null;
    return {
      number: row.os_numero,
      client: row.cliente_nombre?.trim() || 'Sin cliente',
      brand: row.marca?.trim() || 'Sin marca',
      model: importedOrderModel(raw),
      branch: resolveDashboardServiceOrderBranch({ rawData: raw, orderNumber: row.os_numero, clientName: row.cliente_nombre }) ?? 'Sin sucursal',
      age,
      type: row.tipo_tiempo?.trim() || 'Sin tipo informado',
    };
  });
  const brands = group(orders.map(row => row.brand));
  const ages = group(orders.map(row => ageLabel(row.age)));
  if (scope.brands.some(expected => brands.find(row => row.name === expected.name)?.count !== expected.count) ||
      scope.ages.some(expected => ages.find(row => row.name === expected.label)?.count !== expected.count) ||
      scope.brands.reduce((sum, row) => sum + row.count, 0) !== rows.length ||
      scope.ages.reduce((sum, row) => sum + row.count, 0) !== rows.length)
    throw new Error('Los desgloses de OS cambiaron desde el resumen. Actualizá Panorama.');
  const namedClients = orders.map(row => row.client).filter(name => name !== 'Sin cliente');
  const dated = orders.map(row => row.age).filter((age): age is number => age !== null);
  return {
    orders,
    clients: namedClients.length === orders.length ? new Set(namedClients.map(normalizeClienteKey)).size : null,
    averageAge: dated.length === orders.length && dated.length ? Math.round(dated.reduce((sum, age) => sum + age, 0) / dated.length) : null,
    branches: group(orders.map(row => row.branch)),
    types: group(orders.map(row => row.type)),
  };
}

export async function loadServiceOpenOrdersDetail(scope: Scope): Promise<ServiceOpenOrdersDetailData> {
  const rows: SourceOrder[] = [];
  let count: number | null = null;
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from('ordenes_servicio_importadas')
      .select('os_numero,cliente_nombre,marca,fecha_abierta_os,situacion_os,tipo_tiempo,raw_data', { count: 'exact' })
      .ilike('situacion_os', '%abiert%').order('os_numero').range(offset, offset + 499);
    if (result.error || !Array.isArray(result.data) || result.count === null) throw new Error('No se pudo cargar el detalle de OS.');
    if (count === null) count = result.count;
    if (count !== result.count || count > 5000) throw new Error('El detalle de OS cambió durante la lectura.');
    rows.push(...result.data);
    if (rows.length === count) break;
    if (result.data.length !== 500 || rows.length > count) throw new Error('El detalle de OS está incompleto.');
  }
  return buildServiceOpenOrdersDetail(rows, scope);
}

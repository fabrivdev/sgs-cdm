import type { PanoramaStory, PartsAlertCandidate } from './panoramaStoryTypes';

const windows = [
  { from: 1, to: 7, label: '1–7 días' },
  { from: 8, to: 14, label: '8–14 días' },
  { from: 15, to: 21, label: '15–21 días' },
  { from: 22, to: 30, label: '22–30 días' },
] as const;
const usd = (value: number) => `$ ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(value)}`;
const validGroup = (group: { count: number; value: number }) => Number.isInteger(group.count) && group.count >= 0 && Number.isFinite(group.value) && group.value >= 0;
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 1e-8);
const countLabel = (count: number) => `${count} código${count === 1 ? '' : 's'}`;
const dateLabel = (date: string) => date.split('-').reverse().join('/');

export type PartsAlertVariant = { id: string; text: string; route: string };
type Cohort = {
  destination: 'GRIS' | 'ROJO'; count: number; value: number;
  window: typeof windows[number]; candidates: PartsAlertCandidate[] | null;
  route: string; time: string;
};

export function validPartsAlertRange(color: string, minimum: string, maximum: string): boolean {
  if (!/^\d{1,4}$/.test(minimum) || !/^\d{1,4}$/.test(maximum)) return false;
  const from = Number(minimum), to = Number(maximum);
  return from <= to && ((color === 'LILA' && from >= 336 && to <= 365) || (color === 'GRIS' && from >= 971 && to <= 1000));
}

/** Every variant is bound to one verified destination and age window. */
export function partsAlertVariants(story: PanoramaStory): PartsAlertVariant[] {
  if (story.id !== 'repuestos_alertas' || story.status !== 'ready' || story.changeBuckets?.length !== 4 ||
      story.primary?.value == null || !Number.isFinite(story.primary.value)) return [];
  const buckets = story.changeBuckets;
  if (buckets.some((bucket, index) => bucket.label !== windows[index].label || !validGroup(bucket.gris) || !validGroup(bucket.rojo))) return [];
  const totalValue = buckets.reduce((sum, bucket) => sum + bucket.gris.value + bucket.rojo.value, 0);
  const totalCodes = buckets.reduce((sum, bucket) => sum + bucket.gris.count + bucket.rojo.count, 0);
  if (!close(totalValue, story.primary.value) || totalCodes !== story.supporting.find(item => item.label === 'Códigos expuestos')?.value || totalCodes === 0) return [];
  const cohorts: Cohort[] = buckets.flatMap((bucket, index) => (['GRIS', 'ROJO'] as const).flatMap(destination => {
    const group = destination === 'GRIS' ? bucket.gris : bucket.rojo;
    if (!group.count) return [];
    const window = windows[index];
    const matching = story.partsAlertCandidates?.filter(row => row.destination === destination && row.daysUntil >= window.from && row.daysUntil <= window.to);
    const candidates = matching?.length === group.count && close(matching.reduce((sum, row) => sum + row.eligibleValueUsd, 0), group.value) ? matching : null;
    const exactDay = group.count === 1 && candidates ? candidates[0].daysUntil : null;
    const from = exactDay ?? window.from, to = exactDay ?? window.to;
    const threshold = destination === 'ROJO' ? 1001 : 366;
    const color = destination === 'ROJO' ? 'GRIS' : 'LILA';
    return [{ destination, count: group.count, value: group.value, window, candidates,
      route: `/repuestos/analisis?color=${color}&compra_dias_min=${threshold - to}&compra_dias_max=${threshold - from}&vista=detalle&universo=STOCK_POSITIVO_PANORAMA`,
      time: exactDay ? `en ${exactDay} día${exactDay === 1 ? '' : 's'}` : `en ${window.label}` }];
  }));
  cohorts.sort((a, b) => a.window.from - b.window.from || b.value - a.value || (a.destination === 'ROJO' ? -1 : 1));
  const focus = cohorts[0];
  const other = cohorts[1];
  const candidates = focus.candidates;
  const single = focus.count === 1 && candidates ? candidates[0] : null;
  const leading = candidates?.length ? [...candidates].sort((a, b) => b.eligibleValueUsd - a.eligibleValueUsd || a.daysUntil - b.daysUntil || a.code.localeCompare(b.code))[0] : null;
  const earliest = candidates?.length ? [...candidates].sort((a, b) => a.daysUntil - b.daysUntil || a.code.localeCompare(b.code))[0] : null;
  const destination = focus.destination.toLowerCase();
  const subject = single ? `El código ${single.code}` : countLabel(focus.count);
  const value = focus.value > 0 ? `${usd(focus.value)} de valor referencial actual` : 'sin valor positivo acreditado';
  const variants: PartsAlertVariant[] = [];
  const add = (id: string, text: string, route = focus.route) => variants.push({ id, text, route });

  add('proximidad', `${subject} podría${focus.count === 1 ? '' : 'n'} pasar a ${destination} ${focus.time}; ${value}. Revisá la última compra y el stock del grupo: el cambio depende de que sigan vigentes los criterios de clasificación.`);
  add('umbral', `El próximo umbral de este grupo es ${destination}: ${countLabel(focus.count)} lo alcanzarían ${focus.time} si no cambian sus movimientos. Contrastá las compras registradas antes de actuar.`);
  if (focus.value > 0) add('valor', `El grupo que podría pasar a ${destination} ${focus.time} reúne ${usd(focus.value)} de valor Kardex positivo. Revisá ese importe como exposición actual, no como pérdida prevista.`);
  if (focus.value > 0 && totalValue > focus.value && focus.value / totalValue < 1) add('participacion', `El grupo próximo a ${destination} reúne ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(focus.value / totalValue * 100)}% del valor expuesto a cambios en 30 días. Abrí sus códigos para revisar la concentración.`);
  if (single) add('codigo', `${single.code} está a ${single.daysUntil} día${single.daysUntil === 1 ? '' : 's'} del umbral ${destination}. Verificá su última compra y el stock físico antes de tomar una decisión.`);
  if (candidates && candidates.length > 1 && leading && focus.value > 0 && leading.eligibleValueUsd / focus.value >= 0.5) add('concentracion', `${leading.code} concentra ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(leading.eligibleValueUsd / focus.value * 100)}% del valor del grupo próximo a ${destination}. Revisá primero ese código dentro de la franja ${focus.window.label}.`);
  if (candidates && candidates.length > 1 && earliest && candidates.some(row => row.daysUntil > earliest.daysUntil)) add('primero', `Dentro de ${countLabel(focus.count)} próximos a ${destination}, ${earliest.code} tiene el plazo más corto: ${earliest.daysUntil} día${earliest.daysUntil === 1 ? '' : 's'}. Revisá su fecha de compra en el grupo.`);
  if (candidates?.length) add('unidades', `Los códigos próximos a ${destination} en ${focus.window.label} suman ${new Intl.NumberFormat('es-PY').format(candidates.reduce((sum, row) => sum + row.stockUnits, 0))} unidades físicas informadas. Contrastá existencias antes de usar el valor como referencia.`);
  if (single) add('compra', `La última compra válida de ${single.code} figura el ${dateLabel(single.lastPurchase)}; podría cambiar a ${destination} ${focus.time}. Revisá el documento de compra si hubo movimientos posteriores.`);
  if (candidates?.some(row => row.missingValueLocations + row.nonpositiveValueLocations > 0)) add('valor_incompleto', `Hay ubicaciones del grupo próximo a ${destination} sin valor Kardex positivo. El importe mostrado es parcial; revisá esas ubicaciones antes de priorizar por dinero.`);
  if (candidates?.some(row => row.mismatchedKardexLocations > 0)) add('saldo', `El grupo próximo a ${destination} contiene saldos físicos y Kardex distintos. Revisá esas diferencias antes de interpretar su exposición en dólares.`);
  if (focus.value === 0) add('sin_valor', `${countLabel(focus.count)} podría${focus.count === 1 ? '' : 'n'} pasar a ${destination} ${focus.time}, pero no tiene${focus.count === 1 ? '' : 'n'} valor positivo acreditado. Empezá por revisar stock y Kardex.`);
  if (story.time?.classificationDate) add('corte', `La clasificación de este grupo se calculó al ${dateLabel(story.time.classificationDate)}. Si hubo compras o ventas nuevas, volvé a comprobar el posible paso a ${destination}.`);
  if (other) add('otra_franja', `${countLabel(other.count)} podría${other.count === 1 ? '' : 'n'} alcanzar ${other.destination.toLowerCase()} ${other.time}. Abrí esa franja para revisar sus compras y stock por separado.`, other.route);
  if (candidates?.length && candidates.every(row => row.salesUnits.every(units => units === 0))) add('ventas_evaluadas', `Este grupo próximo a ${destination} no registra ventas positivas en los tres años calendario evaluados. Confirmá ese criterio y la última compra antes de interpretar el color futuro.`);
  if (candidates?.length) add('movimientos', `Una compra válida posterior o una venta positiva confirmada podría cambiar la clasificación de ${countLabel(focus.count)} próximos a ${destination}. Revisá movimientos recientes antes de seguir el aviso.`);
  return variants;
}

export function partsAlertFocus(story: PanoramaStory): { text: string; route: string } | null {
  const first = partsAlertVariants(story)[0];
  return first ? { text: first.text, route: first.route } : null;
}

import { billingComponents } from '@/lib/campi/billingComponents';
import type { PanoramaStory, SeriesPoint, StoryUnit } from '@/lib/campi/panoramaStoryTypes';

const decimal = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 0 });

export const APPROVED_CARD_IDS = [
  'servicios_os_facturadas', 'servicios_pendientes', 'ventas_evolucion', 'ventas_facturacion',
  'maquinas_pedidos', 'repuestos_stock', 'repuestos_alertas',
  'agenda_cumplimiento', 'servicios_productividad', 'servicios_eficiencia',
  'clientes_retencion', 'clientes_cobertura_posventa',
] as const;

export type ApprovedCardId = typeof APPROVED_CARD_IDS[number];
export const isApprovedCard = (id: PanoramaStory['id']): id is ApprovedCardId =>
  (APPROVED_CARD_IDS as readonly string[]).includes(id);

export const APPROVED_TITLES: Record<ApprovedCardId, string> = {
  servicios_os_facturadas: 'OS facturadas a clientes',
  servicios_pendientes: 'Resolución de OS',
  ventas_evolucion: 'Evolución de ventas',
  ventas_facturacion: 'Facturación neta',
  maquinas_pedidos: 'Pedidos pendientes de máquinas',
  repuestos_stock: 'Stock antiguo de repuestos',
  repuestos_alertas: 'Próximos cambios de clasificación',
  agenda_cumplimiento: 'Cumplimiento de agenda',
  servicios_productividad: 'Productividad',
  servicios_eficiencia: 'Eficiencia',
  clientes_retencion: 'Retención de clientes',
  clientes_cobertura_posventa: 'Cobertura de posventa',
};

export function approvedValue(value: number | null | undefined, unit: StoryUnit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '−' : '';
  const formatted = (unit === 'USD' || unit === 'PYG' || unit === 'count' ? whole : decimal).format(Math.abs(value));
  return `${sign}${unit === 'USD' || unit === 'PYG' ? '$ ' : ''}${formatted}${unit === 'percent' ? '%' : unit === 'days' ? ' días' : ''}`;
}

export const approvedCompactUsd = (value: number) => `${value < 0 ? '−' : ''}$ ${compact.format(Math.abs(value))}`;

const support = (story: PanoramaStory, label: string): number | null => {
  const value = story.supporting.find(item => item.label === label)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

export function approvedContext(story: PanoramaStory): string | null {
  switch (story.id) {
    case 'servicios_pendientes': {
      const closed = story.supporting.find(item => item.label.startsWith('OS cerradas en'))?.value;
      return typeof closed === 'number' && Number.isInteger(closed) && closed >= 0
        ? `Mediana de cierre · ${whole.format(closed)} OS cerradas ${story.time?.closedMonth ? 'en el período' : story.periodMode === 'ytd' ? 'desde julio de 2026 hasta hoy' : 'este mes hasta hoy'}` : 'Mediana de cierre';
    }
    case 'servicios_os_facturadas': {
      const closed = support(story, 'OS cerradas');
      const billed = support(story, 'Facturadas a cliente');
      return closed !== null && billed !== null ? `De ${whole.format(closed)} órdenes cerradas, ${whole.format(billed)} se facturaron a clientes` : null;
    }
    case 'ventas_evolucion': return 'Ventas antes de notas de crédito';
    case 'ventas_facturacion': {
      const components = billingComponents(story);
      return components && components.gross > 0
        ? `Sobre el total facturado se descontó ${decimal.format(-components.credits / components.gross * 100)}% en NC` : null;
    }
    case 'maquinas_pedidos': {
      const linked = support(story, 'Pedidos con stock');
      const total = story.primary?.value;
      return linked !== null && typeof total === 'number' ? `${whole.format(linked)} de ${whole.format(total)} pedidos tienen stock vinculado en al menos una unidad; no confirma entrega` : null;
    }
    case 'repuestos_stock': {
      const codes = support(story, 'Códigos en gris y rojo');
      return codes === null ? null : `${whole.format(codes)} códigos clasificados en gris o rojo; valor referencial, no pérdida realizada`;
    }
    case 'repuestos_alertas': return 'Podría pasar a gris o rojo en 30 días si no cambian fechas ni criterios';
    case 'agenda_cumplimiento': {
      const done = support(story, 'Completadas'), total = support(story, 'Evaluables');
      return done !== null && total !== null ? `${whole.format(done)} completadas de ${whole.format(total)} evaluables` : null;
    }
    case 'servicios_productividad': {
      const worked = support(story, 'Horas trabajadas'), available = support(story, 'Horas disponibles');
      return worked !== null && available !== null ? `${decimal.format(worked)} h trabajadas / ${decimal.format(available)} h disponibles` : null;
    }
    case 'servicios_eficiencia': {
      const billed = support(story, 'Horas facturadas'), worked = support(story, 'Horas trabajadas');
      return billed !== null && worked !== null ? `${decimal.format(billed)} h facturadas / ${decimal.format(worked)} h trabajadas` : null;
    }
    case 'clientes_retencion': {
      const retained = support(story, 'Retenidos'), base = support(story, 'Cohorte base');
      return retained !== null && base !== null ? `${whole.format(retained)} recompraron de una cohorte de ${whole.format(base)}` : null;
    }
    case 'clientes_cobertura_posventa': {
      const bought = support(story, 'Con compra'), owners = support(story, 'Propietarios');
      return bought !== null && owners !== null ? `${whole.format(bought)} de ${whole.format(owners)} propietarios elegibles` : null;
    }
    default: return null;
  }
}

export type ApprovedBadge = { text: string; direction: 'up' | 'down' | 'flat'; description: string };

const comparisonSeries = (story: PanoramaStory): [SeriesPoint, SeriesPoint] | null => {
  const series = story.series;
  if (!series || series.length < 2) return null;
  const current = series.at(-1)!, previous = series.at(-2)!;
  if (!current.complete || !previous.complete || !current.denominator || !previous.denominator ||
      current.value === null || previous.value === null || !Number.isFinite(current.value) || !Number.isFinite(previous.value) ||
      current.cutoff !== previous.cutoff || current.from.slice(0, 7) !== story.time?.window?.from.slice(0, 7) ||
      story.primary?.value === null || story.primary?.value === undefined ||
      Math.abs(current.value - story.primary.value) > 0.05) return null;
  const previousMonthEnd = new Date(Date.parse(`${current.from}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return previous.to === previousMonthEnd ? [previous, current] : null;
};

export function approvedBadge(story: PanoramaStory): ApprovedBadge | null {
  if (story.id === 'servicios_pendientes') {
    const current = story.primary?.value, previous = story.primary?.comparison?.value;
    if (typeof current !== 'number' || !Number.isFinite(current) || typeof previous !== 'number' || !Number.isFinite(previous)) return null;
    const delta = current - previous;
    return { text: `${delta < 0 ? '↓ ' : delta > 0 ? '↑ ' : '→ '}${decimal.format(Math.abs(delta))} días`,
      direction: delta < 0 ? 'down' : delta > 0 ? 'up' : 'flat', description: `Diferencia de medianas frente a ${story.primary!.comparison!.label}` };
  }
  if (story.id === 'servicios_os_facturadas' || story.id === 'servicios_productividad' || story.id === 'servicios_eficiencia') {
    if (story.periodMode === 'ytd') return null;
    const pair = comparisonSeries(story);
    if (!pair) return null;
    const [previous, current] = pair;
    const delta = current.value! - previous.value!;
    const [year, month] = current.from.slice(0, 7).split('-').map(Number);
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const partial = current.to !== end;
    return {
      text: `${delta > 0 ? '↑ +' : delta < 0 ? '↓ −' : ''}${decimal.format(Math.abs(delta))} pp`,
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
      description: partial ? 'Mes parcial frente al mes anterior completo; diferencia aritmética entre ventanas no equivalentes' : 'Dos meses completos consecutivos',
    };
  }
  const value = story.primary?.value;
  const previous = story.primary?.comparison?.value;
  if (typeof value !== 'number' || !Number.isFinite(value) || typeof previous !== 'number' || !Number.isFinite(previous) || previous <= 0) return null;
  const delta = (value - previous) / previous * 100;
  return { text: `${delta > 0 ? '↑ +' : delta < 0 ? '↓ −' : ''}${decimal.format(Math.abs(delta))}%`,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    description: story.primary!.comparison!.label };
}

export function approvedPeriodEnabled(story: PanoramaStory): boolean {
  return story.periodOptions?.includes('month') === true && story.periodOptions?.includes('ytd') === true;
}

export type IndicatorAssessment = 'favorable'|'unfavorable'|'neutral';
/** Color is an interpretation of a valid comparison, never the sign alone. */
export function approvedAssessment(story:PanoramaStory):IndicatorAssessment {
 if(story.status!=='ready')return 'neutral';
 const badge=approvedBadge(story);if(!badge||badge.direction==='flat')return 'neutral';
 if(['maquinas_pedidos','repuestos_stock','repuestos_alertas','clientes_retencion','clientes_cobertura_posventa','servicios_productividad','servicios_eficiencia'].includes(story.id))return 'neutral';
 if(['servicios_os_facturadas','servicios_productividad','servicios_eficiencia'].includes(story.id)){
  const pair=comparisonSeries(story);if(!pair)return 'neutral';
  const c=pair[1],y=Number(c.from.slice(0,4)),m=Number(c.from.slice(5,7));
  if(c.to!==new Date(Date.UTC(y,m,0)).toISOString().slice(0,10))return 'neutral';
  // Billed-client share also depends on warranty/internal mix, not direction alone.
  if(story.id==='servicios_os_facturadas')return 'neutral';
 }
 if(story.id==='servicios_pendientes')return story.time?.closedMonth ? (badge.direction==='down'?'favorable':'unfavorable') : 'neutral';
 if(['ventas_evolucion','ventas_facturacion'].includes(story.id)&&(story.time?.window||story.navigationPeriod))return badge.direction==='up'?'favorable':'unfavorable';
 return 'neutral';
}
export const assessmentLabel={favorable:'Variación favorable del indicador',unfavorable:'Variación desfavorable del indicador',neutral:'Variación sin valoración favorable o desfavorable'};

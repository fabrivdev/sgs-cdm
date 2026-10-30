import { scopedCoverageStory } from './coverageRubros';
import type { SectionKey } from '@/lib/permissions';
import type { PanoramaStory, StoryChartRow } from './panoramaStoryTypes';

/** Empty selection means the authorized total. Each source contributes exactly once. */
export function scopedSalesStory(story: PanoramaStory, selection: SectionKey | readonly SectionKey[] | null): PanoramaStory {
  if (story.id === 'clientes_cobertura_posventa') return scopedCoverageStory(story, typeof selection === 'string' ? [selection] : selection ?? []);
  if (!['ventas_evolucion', 'ventas_facturacion'].includes(story.id) || !selection || !story.primary) return story;
  const requested = new Set(typeof selection === 'string' ? [selection] : selection);
  const scopes = (story.salesScopes ?? []).filter((item, index, all) => requested.has(item.section) && story.sections.includes(item.section) && all.findIndex(s => s.section === item.section) === index);
  if (!scopes.length) return story;
  const period = story.periodMode === 'ytd' ? 'ytd' : 'month';
  const sum = (key: 'month' | 'ytd', field: 'value' | 'previous') => scopes.reduce((total, scope) => total + scope[key][field], 0);
  const primary = { ...story.primary, value: sum(period, 'value'), comparison: story.primary.comparison && { ...story.primary.comparison, value: sum(period, 'previous') }, note: sum(period, 'previous') <= 0 ? 'Sin base comparable.' : undefined };
  const net = story.id === 'ventas_facturacion';
  const components = scopes.map(scope => scope[period].billing);
  // Never retain the total bridge when the selected areas lack numeric components.
  const billing = net && components.every(Boolean) ? components.reduce((total, item) => ({ gross: total.gross + item!.gross, credits: total.credits + item!.credits, net: total.net + item!.net }), { gross: 0, credits: 0, net: 0 }) : undefined;
  const reference = scopes[0].chartRows;
  const aligned = reference && scopes.every(scope => scope.chartRows?.length === reference.length && scope.chartRows.every((row, i) => row.label === reference[i].label));
  const rows: StoryChartRow[] | null = aligned ? reference.map((row, i) => ({ label: row.label,
    value: scopes.every(s => s.chartRows![i].value !== null) ? scopes.reduce((n, s) => n + s.chartRows![i].value!, 0) : null,
    previous: scopes.every(s => typeof s.chartRows![i].previous === 'number') ? scopes.reduce((n, s) => n + s.chartRows![i].previous!, 0) : null,
  })) : null;
  return { ...story, scope: scopes.map(s => s.label).join(' + '), billingCoverage: undefined,
    sections: scopes.map(s => s.section), route: scopes.length === 1 ? scopes[0].route : story.route,
    source: scopes.map(s => s.source).join(' + '), primary, billingComponents: billing,
    supporting: [
      { label: net ? 'Facturación neta acumulada' : 'Ventas acumuladas del año', value: sum('ytd', 'value'), unit: 'USD', comparison: { value: sum('ytd', 'previous'), label: 'Mismo tramo del año anterior' } },
      ...(billing ? [{ label: period === 'ytd' ? 'Ventas antes de NC acumuladas' : 'Ventas antes de NC del mes', value: billing.gross, unit: 'USD' as const }, { label: period === 'ytd' ? 'Notas de crédito acumuladas' : 'Notas de crédito del mes', value: billing.credits, unit: 'USD' as const }] : []),
    ],
    breakdown: story.breakdown.filter(item => scopes.some(scope => item.label === scope.label)),
    chart: rows ? { kind: 'trend', title: net ? 'Facturación neta mensual' : 'Ventas mensuales antes de NC', unit: 'USD', currentLabel: story.chart?.currentLabel, previousLabel: story.chart?.previousLabel, rows } : null,
  };
}

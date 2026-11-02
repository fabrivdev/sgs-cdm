import { billingComponents } from '@/lib/campi/billingComponents';
import { useEffect, useState, type CSSProperties } from 'react';
import { Area, AreaChart, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, Boxes, Package, RefreshCw, Tractor, Wrench } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { monthTick, storyDateLines } from '@/lib/campi/panoramaDates';
import type { SectionKey } from '@/lib/permissions';
import type { PanoramaStory, StoryPeriod } from '@/lib/campi/panoramaStoryTypes';
import { scopedSalesStory } from '@/lib/campi/salesScope';
import { storyDestinations } from '@/lib/campi/storyNavigation';
import { panoramaTopicTone } from '@/lib/campi/panoramaTopicTone';
import { APPROVED_TITLES, approvedAssessment, assessmentLabel, approvedBadge, approvedContext, approvedPeriodEnabled, approvedValue, type ApprovedCardId } from './approvedCardModel';
import './approved-panorama-card.css';

const decimal = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const resolutionDays = new Intl.NumberFormat('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function ChartEmpty({ text }: { text: string }) {
  return <div className="approved-chart-empty" role="status">{text}</div>;
}

function ResolutionDistribution({ story }: { story: PanoramaStory }) {
  const distribution = story.closureDistribution;
  const total = story.supporting.find(item => item.label.startsWith('OS cerradas en'))?.value;
  const valid = distribution && distribution.total > 0 && distribution.total === total &&
    distribution.bins.every(count => Number.isInteger(count) && count >= 0) &&
    distribution.bins.reduce((sum, count) => sum + count, 0) === distribution.total;
  if (!valid) return <ChartEmpty text={story.closureDistributionIssue ?? 'Distribución no conciliada para este corte'} />;
  const labels = ['0–7 días', '8–15 días', '16–30 días', '+30 días'];
  return <figure className="approved-resolution" aria-label="Distribución de cierres">
    <figcaption>Distribución de cierres</figcaption>
    {labels.map((label, index) => <div className="approved-resolution-row" key={label} title={`${label}: ${distribution.bins[index]} de ${distribution.total} cierres`}>
      <span>{label}</span><span className="approved-resolution-track"><i style={{ width: `${distribution.bins[index] / distribution.total * 100}%` }} /></span><strong>{whole.format(distribution.bins[index])}</strong>
    </div>)}
    <p className="sr-only">Barras proporcionales al total de {distribution.total} OS elegibles; rangos de días exactos sin solapamientos.</p>
  </figure>;
}

function chartDomain(rows: NonNullable<PanoramaStory['chart']>['rows']): [number, number] {
  const values = rows.flatMap(row => [row.value, row.previous]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!values.length) return [0, 1];
  const low = Math.min(...values), high = Math.max(...values);
  const span = high - low;
  // Keep near-identical values from appearing as a dramatic movement on an unlabeled Y axis.
  const pad = Math.max(1, span * 0.2, Math.abs(high) * 0.12);
  return [Math.max(0, low - pad), high + pad];
}

function ApprovedTrend({ story }: { story: PanoramaStory }) {
  const chart = story.chart;
  if (!chart || chart.kind !== 'trend' || chart.rows.filter(row => typeof row.value === 'number').length < 2)
    return <ChartEmpty text="Evolución no disponible para este corte" />;
  const salesComparison = story.id === 'ventas_evolucion';
  const hasPrevious = (index: number) => typeof chart.rows[index]?.previous === 'number' && Number.isFinite(chart.rows[index].previous);
  const paired = chart.rows.some((_, index) => hasPrevious(index));
  const hasIsolatedPrevious = salesComparison && chart.rows.some((_, index) =>
    hasPrevious(index) && !hasPrevious(index - 1) && !hasPrevious(index + 1));
  const gradientId = `approved-fill-${story.id}`;
  const accent = panoramaTopicTone(story.id).accent;
  const ChartContainer = salesComparison ? ComposedChart : AreaChart;
  const previousLine = paired && <Line type="linear" dataKey="previous" connectNulls={false}
    stroke={salesComparison ? '#64748b' : '#94a3b8'} strokeWidth={salesComparison ? 2 : 1.5}
    strokeDasharray="4 4" dot={hasIsolatedPrevious ? { r: 2.5, fill: '#fff', stroke: '#64748b', strokeWidth: 1.5 } : false}
    activeDot={{ r: 4 }} isAnimationActive={false} />;
  const currentArea = <Area type="linear" dataKey="value" connectNulls={false} stroke={accent} strokeWidth={2.5}
    fill={`url(#${gradientId})`} dot={{ r: 3, fill: '#fff', stroke: accent, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />;
  return <figure className={`approved-trend${salesComparison ? ' approved-trend--sales' : ''}`} aria-label={chart.title}>
    <figcaption className="sr-only">{chart.title}</figcaption>
    <div className="approved-trend-plot"><ResponsiveContainer width="100%" height="100%">
      <ChartContainer data={chart.rows} margin={{ top: 8, right: 7, bottom: 0, left: 7 }}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity={0.15} /><stop offset="100%" stopColor={accent} stopOpacity={0.015} /></linearGradient></defs>
        <YAxis hide width={0} domain={chartDomain(chart.rows)} />
        <XAxis dataKey="label" tickFormatter={monthTick} tickLine={false} axisLine={false} tick={{ fill: '#728095', fontSize: 12 }} interval="preserveStartEnd" />
        <Tooltip formatter={(value: number, name: string) => [approvedValue(value, chart.unit), name === 'previous' ? chart.previousLabel ?? 'Referencia' : chart.currentLabel ?? 'Actual']} />
        {salesComparison ? currentArea : previousLine}
        {salesComparison ? previousLine : currentArea}
      </ChartContainer>
    </ResponsiveContainer></div>
    <div className="approved-trend-legend"><span><i className="approved-legend-line" />{chart.currentLabel ?? 'Actual'}</span>{paired && <span><i className="approved-legend-line approved-legend-line--previous" />{chart.previousLabel ?? 'Referencia'}</span>}{chart.rows.some(row => row.label.includes('*')) && <span>* parcial</span>}</div>
    <ul className="sr-only">{chart.rows.map(row => <li key={row.label}>{row.label}: {approvedValue(row.value, chart.unit)}{typeof row.previous === 'number' ? `; referencia ${approvedValue(row.previous, chart.unit)}` : ''}</li>)}</ul>
  </figure>;
}

function Waterfall({ story }: { story: PanoramaStory }) {
  const components = billingComponents(story);
  if (!components) return <ChartEmpty text="Puente de facturación no conciliado" />;
  const { gross, credits: credit, net } = components;
  const low = Math.min(0, net), high = Math.max(gross, net, 0, 1);
  const y = (value: number) => 125 - (value - low) / (high - low) * 100;
  const rect = (a: number, b: number) => ({ y: Math.min(y(a), y(b)), h: Math.max(2, Math.abs(y(a) - y(b))) });
  const bars = [
    { x: 22, label: 'Ventas', value: gross, color: '#00855f', ...rect(0, gross) },
    { x: 192, label: 'NC', value: credit, color: '#eca14a', ...rect(gross, net) },
    { x: 362, label: 'Neto', value: net, color: '#4d89bd', ...rect(0, net) },
  ];
  return <figure className="approved-waterfall" aria-label={`Ventas ${approvedValue(gross, 'USD')} más NC ${approvedValue(credit, 'USD')} igual a neto ${approvedValue(net, 'USD')}`}>
    <svg viewBox="0 0 449 164" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <line x1="78" x2="192" y1={y(gross)} y2={y(gross)} stroke="#b4c4c4" strokeDasharray="4 4" />
      <line x1="248" x2="362" y1={y(net)} y2={y(net)} stroke="#b4c4c4" strokeDasharray="4 4" />
      {bars.map(bar => <g key={bar.label}><title>{bar.label}: {approvedValue(bar.value, 'USD')}</title><rect x={bar.x} y={bar.y} width="56" height={bar.h} rx="3" fill={bar.color} /><text x={bar.x + 28} y={Math.max(11, bar.y - 4)} textAnchor="middle" className="approved-waterfall-number">{approvedValue(bar.value, 'USD')}</text><text x={bar.x + 28} y="150" textAnchor="middle" className="approved-waterfall-label">{bar.label}</text></g>)}
    </svg>
  </figure>;
}

function Distribution({ story }: { story: PanoramaStory }) {
  const total = story.primary?.value;
  const rows = story.chart?.rows;
  const valid = story.chart?.unit === 'count' && Array.isArray(rows) && rows.length === 4 &&
    ['Cobertura completa', 'Cobertura parcial', 'Sin cobertura', 'No clasificables'].every(label => rows.some(row => row.label === label)) &&
    rows.every(row => typeof row.value === 'number' && Number.isInteger(row.value) && row.value >= 0) &&
    typeof total === 'number' && total > 0 && rows.reduce((sum, row) => sum + (row.value ?? 0), 0) === total;
  if (!valid) {
    const full = story.supporting.find(item => item.label === 'Pedidos con stock completo')?.value;
    const any = story.supporting.find(item => item.label === 'Pedidos con stock')?.value;
    if (typeof total !== 'number' || total <= 0 || typeof full !== 'number' || typeof any !== 'number' ||
        !Number.isInteger(full) || !Number.isInteger(any) || full < 0 || any < full || any > total)
      return <ChartEmpty text="Cobertura de pedidos no conciliada" />;
    return <figure className="approved-distribution" aria-label="Vínculos de stock de los pedidos; categorías superpuestas">
      <figcaption className="sr-only">{full} pedidos con stock completo y {any} con al menos una unidad; no forman categorías excluyentes.</figcaption>
      {[{ label: 'Stock completo', value: full }, { label: 'Alguna unidad', value: any }].map(row => <div className="approved-distribution-row" key={row.label} title={`${row.value} de ${total} pedidos`}>
        <span>{row.label}</span><span className="approved-distribution-track"><i style={{ width: `${row.value / total * 100}%` }} /></span><strong>{whole.format(row.value)}</strong>
      </div>)}<small className="approved-distribution-note">Clasificación completa pendiente</small>
    </figure>;
  }
  const labels: Record<string, string> = { 'Cobertura completa': 'Completa', 'Cobertura parcial': 'Parcial', 'Sin cobertura': 'Sin cobertura', 'No clasificables': 'Sin verificar' };
  return <figure className="approved-distribution" aria-label="Cobertura de todos los pedidos pendientes">
    <figcaption className="sr-only">Distribución completa de {whole.format(total)} pedidos</figcaption>
    {rows.map(row => { const percent = row.value! / total * 100; return <div className="approved-distribution-row" key={row.label} data-category={row.label} title={`${row.label}: ${whole.format(row.value!)} pedidos, ${decimal.format(percent)}%`}>
      <span>{labels[row.label]}</span><span className="approved-distribution-track"><i style={{ width: `${percent}%` }} /></span><strong>{decimal.format(percent)}%</strong>
    </div>; })}
  </figure>;
}

function Composition({ story }: { story: PanoramaStory }) {
  const stock = story.id === 'repuestos_stock';
  const rows = story.chart?.rows ?? [];
  const total = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
  const expected = stock ? story.primary?.value : story.supporting.find(item => item.label === 'Cohorte base')?.value;
  if (rows.length !== 2 || rows.some(row => typeof row.value !== 'number' || row.value < 0) || typeof expected !== 'number' || Math.abs(total - expected) > 0.02 || total <= 0)
    return <ChartEmpty text="Composición no conciliada" />;
  const first = stock ? rows.find(row => row.label === 'Gris') : rows.find(row => row.label === 'Volvieron a comprar');
  const second = stock ? rows.find(row => row.label === 'Rojo') : rows.find(row => row.label === 'Sin recompra en la ventana');
  if (!first || !second) return <ChartEmpty text="Composición no conciliada" />;
  const pct = first.value! / total * 100;
  const firstColor = stock ? '#94a3b8' : panoramaTopicTone(story.id).accent, secondColor = stock ? '#dd6c6c' : '#efbb68';
  const entries = [{ row: first, label: stock ? 'Gris' : 'Recompraron', color: firstColor }, { row: second, label: stock ? 'Rojo' : 'Sin recompra aún', color: secondColor }];
  return <figure className="approved-composition" aria-label={story.chart?.title}>
    <span className="approved-donut" role="img" aria-label={entries.map(entry => `${entry.label}: ${approvedValue(entry.row.value, story.chart!.unit)}`).join('; ')} style={{ background: `conic-gradient(${firstColor} 0 ${pct}%, ${secondColor} ${pct}% 100%)` }} />
    <ul>{entries.map(entry => <li key={entry.label}><i style={{ background: entry.color }} /><span>{entry.label}{stock && <> · {approvedValue(entry.row.value, 'USD')}</>}</span><strong>{decimal.format(entry.row.value! / total * 100)}%</strong></li>)}</ul>
  </figure>;
}

function Changes({ story }: { story: PanoramaStory }) {
  const rows = story.chart?.rows ?? [];
  if (!rows.length || rows.some(row => row.value === null || !Number.isFinite(row.value) || row.value < 0))
    return <ChartEmpty text="Distribución de cambios no disponible" />;
  const sum = rows.reduce((total, row) => total + (row.value ?? 0), 0);
  if (typeof story.primary?.value !== 'number' || Math.abs(sum - story.primary.value) > 0.02)
    return <ChartEmpty text="Distribución de cambios no conciliada" />;
  const columns = story.changeBuckets?.map(bucket => ({
    label: bucket.label,
    segments: [
      { destination: 'gris', ...bucket.gris },
      { destination: 'rojo', ...bucket.rojo },
    ],
  })) ?? rows.map(row => ({
    label: row.label,
    segments: [{ destination: row.label.toLowerCase(), value: row.value!, count: row.count ?? 0 }],
  }));
  if (columns.length !== rows.length || columns.some((column, index) => column.label !== rows[index].label ||
    Math.abs(column.segments.reduce((total, segment) => total + segment.value, 0) - rows[index].value!) > 0.02))
    return <ChartEmpty text="Distribución de cambios no conciliada" />;
  const peak = Math.max(1, ...columns.flatMap(column => column.segments.map(segment => segment.value)));
  return <figure className="approved-changes" aria-label={story.chart?.title}>
    {columns.map(column => <div className="approved-change-column" key={column.label} title={`${column.label}: ${column.segments.map(segment => `${segment.destination} ${approvedValue(segment.value, 'USD')}, ${segment.count} códigos`).join(' · ')}`}>
      <span className="approved-change-track">{column.segments.map(segment => <i key={segment.destination} data-destination={segment.destination} style={{ height: `${segment.value / peak * 100}%` }} />)}</span>
      <small>{column.label}{column.segments.reduce((total, segment) => total + segment.value, 0) === 0 && column.segments.some(segment => segment.count > 0) ? ` · ${column.segments.reduce((total, segment) => total + segment.count, 0)} cód.` : ''}</small>
    </div>)}
    <figcaption className="sr-only">{story.chart?.title}; importes por columna y base cero</figcaption>
  </figure>;
}

function MonthlyColumns({ story, variant }: { story: PanoramaStory; variant: 'agenda' | 'coverage' }) {
  const rows = story.chart?.rows ?? [];
  return <div className={`approved-monthly-columns approved-monthly-columns--${variant}`} data-density={rows.length > 6 ? 'compact' : 'regular'} style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
    {rows.map((row, index) => {
      const value = typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : null;
      const detail = value === null ? 'Sin datos' : approvedValue(value, 'percent');
      return <button type="button" className="approved-monthly-column" key={`${row.label}-${index}`} aria-label={`${row.label}: ${detail}`}>
        <strong className="approved-monthly-value" aria-hidden="true">{value === null ? '' : detail}</strong>
        <span className="approved-monthly-track" aria-hidden="true">{value !== null && <i style={{ height: `${Math.max(0, Math.min(100, value))}%` }} />}</span>
        <small aria-hidden="true">{monthTick(row.label)}</small>
        <span className="approved-monthly-tooltip" aria-hidden="true">{row.label}: {detail}</span>
      </button>;
    })}
  </div>;
}

function Agenda({ story, periodMode }: { story: PanoramaStory; periodMode: StoryPeriod }) {
  const rows = story.chart?.rows ?? [];
  if (!rows.length) return <ChartEmpty text="Sin jornadas evaluables para graficar" />;
  if (periodMode === 'ytd') return <figure className="approved-agenda" aria-label={story.chart?.title}>
    <MonthlyColumns story={story} variant="agenda" />
    <figcaption className="sr-only">{story.chart?.title}; columnas mensuales desde cero hasta cien por ciento</figcaption>
  </figure>;
  return <figure className="approved-agenda" aria-label={story.chart?.title}>
    <div className="approved-agenda-scroll" role="region" tabIndex={0} aria-label="Todos los períodos de agenda">
      {rows.map((row, index) => <div className="approved-agenda-column" key={`${row.label}-${index}`} title={`${row.label}: ${approvedValue(row.value, 'percent')}`}>
        <strong>{approvedValue(row.value, 'percent')}</strong><span className="approved-agenda-track"><i style={{ height: `${Math.max(0, Math.min(100, row.value ?? 0))}%` }} /></span><small>{periodMode === 'month' ? `S${index + 1}` : monthTick(row.label)}</small>
      </div>)}
    </div>
    <figcaption className="sr-only">{story.chart?.title}; columnas desde cero hasta cien por ciento</figcaption>
  </figure>;
}

function Coverage({ story }: { story: PanoramaStory }) {
  const chart = story.chart;
  const rows = chart?.kind === 'trend' && chart.unit === 'percent' ? chart.rows : null;
  const available = rows?.filter(row => typeof row.value === 'number' && Number.isFinite(row.value));
  if (rows && available && available.length >= 1) return <figure className="approved-coverage" aria-label={chart!.title}>
    <MonthlyColumns story={story} variant="coverage" />
  </figure>;
  const value = story.primary?.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return <ChartEmpty text="Cobertura no medible" />;
  return <figure className="approved-coverage approved-coverage--single" aria-label="Cobertura del período actual; serie histórica no disponible">
    <div className="approved-coverage-column" title={`Cobertura actual: ${approvedValue(value, 'percent')}`}><strong>{approvedValue(value, 'percent')}</strong><span><i style={{ height: `${Math.max(0, Math.min(100, value))}%` }} /></span><small>{story.periodMode === 'ytd' ? 'Acum.' : 'Mes'}</small></div>
    <figcaption>Serie mensual no disponible</figcaption>
  </figure>;
}

function Action({ story, openSignal, onSelectorOpenChange }: { story: PanoramaStory; openSignal: number; onSelectorOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const title = APPROVED_TITLES[story.id as ApprovedCardId] ?? story.title;
  const destinations = storyDestinations(story);
  const label = story.id === 'ventas_evolucion' ? 'Abrir ventas' : story.id === 'ventas_facturacion' ? 'Abrir facturación'
    : story.id === 'maquinas_pedidos' ? 'Abrir pedidos' : story.id === 'repuestos_stock' ? 'Abrir inventario'
      : story.id === 'repuestos_alertas' ? 'Abrir proyección' : story.id === 'agenda_cumplimiento' ? 'Abrir agenda'
        : story.id === 'servicios_productividad' ? 'Abrir productividad' : story.id === 'servicios_eficiencia' ? 'Abrir eficiencia'
          : story.id.startsWith('clientes_') ? 'Abrir clientes' : 'Abrir OS';
  useEffect(() => { onSelectorOpenChange?.(open); }, [open, onSelectorOpenChange]);
  useEffect(() => { if (openSignal && destinations.length > 1) setOpen(true); }, [openSignal, destinations.length]);
  if (!destinations.length) return null;
  if (destinations.length === 1) return <Link className="approved-action" to={destinations[0].route} aria-label={`${label}: ${title}`}>{label}<ArrowRight size={17} aria-hidden="true" /></Link>;
  return <DropdownMenu open={open} onOpenChange={setOpen}>
    <DropdownMenuTrigger asChild><button type="button" className="approved-action" aria-label={`${label}: ${title}`}>{label}<ArrowRight size={17} aria-hidden="true" /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="story-sales-menu"><DropdownMenuLabel><strong>{label}</strong><span>{storyDateLines(story).join(' · ')}</span></DropdownMenuLabel>
      {destinations.map(destination => { const parts = destination.label.toLowerCase().includes('repuestos') || destination.route.startsWith('/repuestos/'); const service = destination.label.toLowerCase().includes('servicios'); const Icon = parts ? Package : service ? Wrench : Tractor;
        return <DropdownMenuItem key={destination.route} asChild><Link to={destination.route}><Icon aria-hidden="true" className="story-sales-menu-icon" /><span><strong>{destination.label}</strong></span><ArrowRight aria-hidden="true" className="story-sales-menu-arrow" /></Link></DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}

function Chart({ story, periodMode }: { story: PanoramaStory; periodMode: StoryPeriod }) {
  switch (story.id) {
    case 'servicios_pendientes': return <ResolutionDistribution story={story} />;
    case 'servicios_os_facturadas': case 'ventas_evolucion': case 'servicios_productividad': case 'servicios_eficiencia': return <ApprovedTrend story={story} />;
    case 'ventas_facturacion': return <Waterfall story={story} />;
    case 'maquinas_pedidos': return <Distribution story={story} />;
    case 'repuestos_stock': case 'clientes_retencion': return <Composition story={story} />;
    case 'repuestos_alertas': return <Changes story={story} />;
    case 'agenda_cumplimiento': return <Agenda story={story} periodMode={periodMode} />;
    case 'clientes_cobertura_posventa': return <Coverage story={story} />;
    default: return null;
  }
}

export function ApprovedPanoramaCard({ story, index, retrying, onRetry, openSignal = 0, onSelectorOpenChange, periodMode = 'month', onPeriodChange, salesScope, onSalesScopeChange }: {
  salesScope?: readonly SectionKey[]; onSalesScopeChange?: (scope: SectionKey[]) => void;
  story: PanoramaStory; index: number; retrying: boolean; onRetry: () => void; openSignal?: number;
  onSelectorOpenChange?: (open: boolean) => void; periodMode?: StoryPeriod; onPeriodChange?: (mode: StoryPeriod) => void;
}) {
  const navigate = useNavigate();
  const [requestedScope, setRequestedScope] = useState<SectionKey[]>([]);
  const scopes = story.id === 'clientes_cobertura_posventa' && story.coverageRubros ? [{section:'repuestos.ventas' as const,label:'Repuestos'},{section:'servicios.ventas' as const,label:'Servicios'}] : ['ventas_evolucion', 'ventas_facturacion'].includes(story.id) ? (story.salesScopes ?? []).filter(scope => story.sections.includes(scope.section)) : [];
  const selectedScopes = (salesScope === undefined ? requestedScope : salesScope).filter(section => scopes.some(scope => scope.section === section));
  const displayed = scopedSalesStory(story, selectedScopes);
  const destinations = storyDestinations(displayed);
  useEffect(() => {
    if (!openSignal || !destinations.length) return;
    if (destinations.length === 1) void navigate(destinations[0].route);
  // Each new signal is an explicit action by Campi.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);
  const periodEnabled = approvedPeriodEnabled(story) && Boolean(onPeriodChange);
  const badge = approvedBadge(displayed);
  const context = approvedContext(displayed);
  const title = APPROVED_TITLES[story.id as ApprovedCardId] ?? story.title;
  const tone = panoramaTopicTone(story.id);
  const primaryText = story.id === 'servicios_pendientes' && typeof displayed.primary?.value === 'number' && Number.isFinite(displayed.primary.value)
    ? `${resolutionDays.format(displayed.primary.value)} días` : approvedValue(displayed.primary?.value, displayed.primary?.unit ?? 'count');
  return <article className="approved-story-card" data-topic={story.id} style={{ '--approved-accent': tone.accent, '--approved-tint': tone.tint } as CSSProperties} aria-labelledby={`approved-${story.id}`}>
    <header className="approved-card-header"><span className="approved-card-index">{String(index + 1).padStart(2, '0')}</span><h2 id={`approved-${story.id}`}>{title}</h2><div className="approved-period" role="group" aria-label={`Período de ${title}`} title={periodEnabled ? undefined : 'No existe una agregación Mes/Acum. válida para este indicador'}>
      {(['month', 'ytd'] as const).map(mode => <button key={mode} type="button" disabled={!periodEnabled} aria-pressed={(!periodEnabled && story.id === 'servicios_pendientes' && mode === 'month') || (periodEnabled && periodMode === mode)} onClick={() => onPeriodChange?.(mode)}>{mode === 'month' ? 'Mes' : 'Acum.'}</button>)}
    </div><span className="sr-only">{storyDateLines(story).join('; ')}</span></header>
    {story.status === 'error' ? <div className="approved-card-error" role="alert"><p>{story.message}</p><Button variant="outline" disabled={retrying} onClick={onRetry}><RefreshCw size={16} className="mr-2" />{retrying ? 'Consultando…' : 'Reintentar fuente'}</Button></div> : <div className="approved-card-body">
      <div className="approved-card-summary"><div className="approved-kpi-row"><strong aria-label={`${displayed.primary?.label ?? title}: ${primaryText}`}>{primaryText}</strong>{badge && <span className="approved-badge" data-direction={badge.direction} data-assessment={approvedAssessment(displayed)} title={badge.description} aria-label={`${badge.text}; ${badge.description}; ${assessmentLabel[approvedAssessment(displayed)]}`}>{badge.text}</span>}</div>
        {context && <p className="approved-card-context">{context}</p>}
        {displayed.billingCoverage && (displayed.billingCoverage.additional !== 'available' || !displayed.billingCoverage.allCoreAreas) && <p className="approved-card-context" role="status">Cobertura parcial: una o más fuentes no están disponibles.</p>}
        {story.status === 'empty' && <p className="approved-card-context"><strong>Sin datos.</strong> {story.message}</p>}
        {story.status === 'ready' && scopes.length > 0 && <div className="approved-sales-scopes" role="group" aria-label="Ámbito de ventas">
          {scopes.map(scope => { const Icon = scope.section === 'servicios.dashboard' ? Boxes : scope.section === 'servicios.ventas' ? Wrench : scope.section === 'repuestos.ventas' ? Package : Tractor;
            return <button type="button" key={scope.section} title={scope.label} aria-label={`Filtrar ${story.id==='clientes_cobertura_posventa'?'cobertura':'ventas'} de ${scope.label.toLowerCase()}`} aria-pressed={selectedScopes.includes(scope.section)}
              onClick={() => { const next=selectedScopes.includes(scope.section)?selectedScopes.filter(section=>section!==scope.section):[...selectedScopes,scope.section]; setRequestedScope(next); onSalesScopeChange?.(next); }}><Icon size={17} aria-hidden="true" /></button>;
          })}
          {story.billingCoverage && story.billingCoverage.additional!=='available' && <button type="button" disabled aria-label="Otros no disponible" title={story.billingCoverage.additional==='unauthorized'?'Otros requiere acceso existente a Dashboard':'Otros pendiente de fuente conciliada'}><Boxes size={17} aria-hidden="true" /></button>}
        </div>}
        {story.id === 'clientes_cobertura_posventa' && !story.coverageRubros && story.status === 'ready' && <div className="approved-sales-scopes" role="group" aria-label="Rubros de cobertura de posventa">
          <button type="button" disabled title="La fuente actual no desglosa propietarios por rubro" aria-label="Filtrar cobertura de repuestos no disponible"><Package size={17} aria-hidden="true" /></button>
          <button type="button" disabled title="La fuente actual no desglosa propietarios por rubro" aria-label="Filtrar cobertura de servicios no disponible"><Wrench size={17} aria-hidden="true" /></button>
        </div>}
        <Action story={displayed} openSignal={openSignal} onSelectorOpenChange={onSelectorOpenChange} />
      </div><span className="approved-divider" aria-hidden="true" /><div className="approved-card-chart"><Chart story={displayed} periodMode={periodMode} /></div>
    </div>}
  </article>;
}

import { formatMonth, monthTick, storyDateLines } from '@/lib/campi/panoramaDates';
import { useEffect, useState } from 'react';
import { ArrowRight, CircleCheck, FileText, Package, RefreshCw, Tractor, Wrench } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Area, AreaChart, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { PanoramaStory, StoryPeriod, StoryUnit } from '@/lib/campi/panoramaStoryTypes';
import { storyDestinations } from '@/lib/campi/storyNavigation';
import { storySummaryPercentage } from '@/lib/campi/storySummary';
import { storyCardFacts } from '@/lib/campi/storyCardFacts';

const number = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 0 });
const valueLabel = (value: number | null, unit: StoryUnit) => value === null || !Number.isFinite(value) ? '—'
  : `${value < 0 ? '−' : ''}${unit === 'USD' ? '$ ' : unit === 'PYG' ? '₲ ' : ''}${(unit === 'USD' || unit === 'PYG' ? integer : number).format(Math.abs(value))}${unit === 'percent' ? '%' : unit === 'days' ? ' días' : ''}`;
const shortUsd = (value: number) => `${value < 0 ? '−' : ''}$ ${compact.format(Math.abs(value))}`;

function BillingWaterfall({ story }: { story: PanoramaStory }) {
  const gross = story.supporting.find(item => item.label.startsWith('Ventas antes de NC'))?.value;
  const credit = story.supporting.find(item => item.label.startsWith('Notas de crédito') || item.label.startsWith('NC acumuladas'))?.value;
  const net = story.primary?.value;
  if (typeof gross !== 'number' || typeof credit !== 'number' || typeof net !== 'number' ||
      ![gross, credit, net].every(Number.isFinite) || Math.abs(gross + credit - net) > 0.02) return null;
  const low = Math.min(0, gross, net), high = Math.max(0, gross, net);
  const y = (value: number) => 70 - (value - low) / Math.max(1, high - low) * 50;
  const rect = (a: number, b: number) => ({ y: Math.min(y(a), y(b)), height: Math.max(2, Math.abs(y(a) - y(b))) });
  const bars = [
    { label: 'Ventas', value: gross, x: 20, ...rect(0, gross), color: '#268264' },
    { label: 'NC', value: credit, x: 116, ...rect(gross, net), color: '#c37b32' },
    { label: 'Neto', value: net, x: 212, ...rect(0, net), color: net < 0 ? '#b95253' : '#557c98' },
  ];
  return <figure className="story-billing-bridge" aria-label="Ventas más notas de crédito igual a neto"><svg viewBox="0 0 276 108" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <line x1="62" x2="116" y1={y(gross)} y2={y(gross)} stroke="#94a3ae" strokeDasharray="3 3" />
    <line x1="158" x2="212" y1={y(net)} y2={y(net)} stroke="#94a3ae" strokeDasharray="3 3" />
    {bars.map(bar => <g key={bar.label}><title>{bar.label}: {valueLabel(bar.value, 'USD')}</title><rect x={bar.x} y={bar.y} width="42" height={bar.height} rx="3" fill={bar.color} /><text x={bar.x + 21} y={Math.max(10, bar.y - 3)} textAnchor="middle" className="story-waterfall-value">{shortUsd(bar.value)}</text><text x={bar.x + 21} y="100" textAnchor="middle" className="story-waterfall-label">{bar.label}</text></g>)}
  </svg><figcaption className="sr-only">Ventas {valueLabel(gross, 'USD')}, NC {valueLabel(credit, 'USD')}, neto {valueLabel(net, 'USD')}.</figcaption></figure>;
}

function trendDomain(rows: NonNullable<PanoramaStory['chart']>['rows']): [number, number] {
  const values = rows.flatMap(row => [row.value, row.previous]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!values.length) return [0, 1];
  const low = Math.min(...values), high = Math.max(...values);
  const span = high - low;
  const padding = span > 0 ? span * 0.18 : Math.max(1, Math.abs(high) * 0.08);
  return [low >= 0 ? Math.max(0, low - padding) : low - padding, high + padding];
}

function CardTrend({ story }: { story: PanoramaStory }) {
  const chart = story.chart!;
  const rows = chart.rows;
  const paired = rows.some(row => row.previous !== undefined && row.previous !== null);
  return <figure className="story-chart story-chart-mini story-trend" aria-label={chart.title}>
    <figcaption className="sr-only">{chart.title}</figcaption>
    <div className="story-chart-canvas" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
      <YAxis hide width={0} domain={trendDomain(rows)} />
      <XAxis dataKey="label" tickFormatter={monthTick} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
      <Tooltip formatter={(value: number, name: string) => [valueLabel(value, chart.unit), name === 'previous' ? chart.previousLabel ?? 'Referencia' : chart.currentLabel ?? 'Actual']} />
      <Line type="linear" dataKey="value" connectNulls={false} stroke="var(--story-accent, #21835d)" strokeWidth={2} dot={rows.length <= 6} isAnimationActive={false} />
      {paired && <Line type="linear" dataKey="previous" connectNulls={false} stroke="#8293ad" strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
    </LineChart></ResponsiveContainer></div>
    <div className="story-trend-legend"><span>{chart.currentLabel ?? 'Actual'}</span>{paired && <span>{chart.previousLabel ?? 'Referencia'}</span>}{rows.some(row => row.label.includes('*')) && <small>* parcial</small>}</div>
    <ul className="sr-only">{rows.map(row => <li key={row.label}>{row.label}: {valueLabel(row.value, chart.unit)}{row.previous === undefined ? '' : `; referencia: ${valueLabel(row.previous, chart.unit)}`}</li>)}</ul>
  </figure>;
}

function OsBillingTrend({ story }: { story: PanoramaStory }) {
  const chart = story.chart!;
  const asOf = story.time?.window?.to;
  const year = asOf?.slice(0, 4);
  const month = asOf ? Number(asOf.slice(5, 7)) : 0;
  const byMonth = new Map(story.series?.map((point, index) => [point.from.slice(0, 7), chart.rows[index]]) ?? []);
  // The sales axis spans January through the current month. Missing cohorts remain null, never zero.
  const rows = year && month >= 1 && month <= 12 && byMonth.size
    ? Array.from({ length: month }, (_, index) => {
      const key = `${year}-${String(index + 1).padStart(2, '0')}`;
      return byMonth.get(key) ?? { label: formatMonth(`${key}-01`), value: null };
    }) : chart.rows;
  const lastValid = rows.reduce((last, row, index) => typeof row.value === 'number' && Number.isFinite(row.value) ? index : last, -1);
  const plotted = rows.map((row, index) => ({ ...row, endLabel: index === lastValid ? valueLabel(row.value, chart.unit) : null }));
  return <figure className="story-chart story-chart-mini story-os-trend" aria-label={chart.title}>
    <figcaption className="sr-only">{chart.title}</figcaption>
    <div className="story-chart-canvas" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><AreaChart data={plotted} margin={{ top: 17, right: 24, bottom: 0, left: 0 }}>
      <defs><linearGradient id="os-billing-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c9e9dc" stopOpacity=".7" /><stop offset="100%" stopColor="#ecf8f3" stopOpacity=".08" /></linearGradient></defs>
      <YAxis hide width={0} domain={trendDomain(rows)} />
      <XAxis dataKey="label" tickFormatter={monthTick} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
      <Tooltip formatter={(value: number) => [valueLabel(value, chart.unit), chart.currentLabel ?? 'Actual']} />
      {rows.filter(row => row.value !== null).map(row => <ReferenceLine key={row.label} x={row.label} stroke="#d8e8e2" strokeDasharray="3 5" />)}
      <Area type="linear" dataKey="value" connectNulls={false} stroke="var(--story-accent)" strokeWidth={2.5} fill="url(#os-billing-fill)" dot={{ r: 3, fill: '#fff', stroke: '#087b57', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false}>
        <LabelList dataKey="endLabel" position="top" fill="#087b57" fontSize={11} fontWeight={700} />
      </Area>
    </AreaChart></ResponsiveContainer></div>
    <div className="story-trend-legend"><span>{chart.currentLabel ?? 'Actual'}</span>{rows.some(row => row.label.includes('*')) && <small>* parcial</small>}</div>
    <ul className="sr-only">{rows.map(row => <li key={row.label}>{row.label}: {row.value === null ? 'sin tasa' : valueLabel(row.value, chart.unit)}</li>)}</ul>
  </figure>;
}

function osMonthlyMovement(story: PanoramaStory, periodMode: StoryPeriod): { delta: number; partial: boolean } | null {
  if (story.id !== 'servicios_os_facturadas' || periodMode !== 'month' || !story.series || story.series.length < 2) return null;
  const current = story.series.at(-1)!;
  const previous = story.series.at(-2)!;
  const [year, month] = current.from.slice(0, 7).split('-').map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  if (!current.complete || !previous.complete || !current.denominator || !previous.denominator ||
      current.value === null || previous.value === null || story.primary?.value === null || story.primary?.value === undefined ||
      !Number.isFinite(current.value) || !Number.isFinite(previous.value) ||
      Math.abs(current.value - story.primary.value) > 0.05 ||
      current.from.slice(0, 7) !== story.time?.window?.from.slice(0, 7) ||
      new Date(Date.parse(`${current.from}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) !== previous.to ||
      current.cutoff !== previous.cutoff) return null;
  return { delta: current.value - previous.value, partial: current.to !== monthEnd };
}

function CardComposition({ story, rows }: { story: PanoramaStory; rows: NonNullable<PanoramaStory['chart']>['rows'] }) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.value ?? 0), 0);
  const isStock = story.id === 'repuestos_stock';
  const colors = isStock ? ['#cf4949', '#8b98a5', '#a6b1bc'] : ['#268264', '#d6a23a'];
  let offset = 0;
  const stops = rows.map((row, index) => {
    const start = offset;
    offset += total > 0 ? Math.max(0, row.value ?? 0) / total * 100 : 0;
    return `${colors[index] ?? colors.at(-1)} ${start}% ${offset}%`;
  });
  return <figure className="story-chart story-chart-mini story-composition" aria-label={story.chart!.title}>
    <figcaption className="sr-only">{story.chart!.title}</figcaption>
    <span className="story-composition-ring" aria-hidden="true" style={{ background: total > 0 ? `conic-gradient(${stops.join(', ')})` : '#e7ebee' }} />
    <ul>{rows.map((row, index) => <li key={row.label} data-segment={isStock ? row.label.toLowerCase() : String(index)}><span className="story-composition-dot" /><span title={row.label}>{row.label}</span><strong>{isStock ? `$ ${compact.format(row.value ?? 0)}` : number.format(row.value ?? 0)}</strong></li>)}</ul>
  </figure>;
}

function ResolutionComparison({ story }: { story: PanoramaStory }) {
  const rows = story.chart?.rows ?? [];
  if (rows.length !== 2 || rows.some(row => row.value === null)) return null;
  const peak = Math.max(1, ...rows.map(row => row.value ?? 0));
  return <figure className="story-chart story-chart-mini story-resolution-pair" aria-label={story.chart!.title}>
    <figcaption className="sr-only">{story.chart!.title}</figcaption>
    {rows.map((row, index) => <div key={row.label} className="story-resolution-period" data-current={index === 1}>
      <strong>{number.format(row.value!)} <small>días</small></strong>
      <span className="story-resolution-track" aria-hidden="true"><span style={{ height: `${Math.max(8, (row.value ?? 0) / peak * 100)}%` }} /></span>
      <span title={row.label}>{index === 1 ? 'Actual' : 'Anterior'}</span>
    </div>)}
    <p className="sr-only">{rows.map(row => `${row.label}: ${number.format(row.value!)} días`).join('; ')}</p>
  </figure>;
}

function OrderCoverage({ story }: { story: PanoramaStory }) {
  const total = story.primary?.value;
  const any = story.supporting.find(row => row.label === 'Pedidos con stock')?.value;
  const full = story.supporting.find(row => row.label === 'Pedidos con stock completo')?.value;
  if (typeof total !== 'number' || total <= 0 || typeof any !== 'number' || typeof full !== 'number') return null;
  return <figure className="story-chart story-chart-mini story-order-coverage" aria-label="Pedidos con stock vinculado">
    <figcaption className="sr-only">{full} con stock completo; {any} con stock en al menos una unidad, de {total} pedidos pendientes. El resto no está clasificado por esta fuente.</figcaption>
    {[{ label: 'Stock completo', value: full }, { label: 'Con alguna unidad', value: any }].map(row =>
      <div key={row.label} className="story-order-row"><span>{row.label}</span><span className="story-order-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, row.value / total * 100))}%` }} /></span><strong>{number.format(row.value)}</strong></div>)}
    <small>El resto requiere revisión del vínculo</small>
  </figure>;
}

function ClassificationDestinations({ story }: { story: PanoramaStory }) {
  const rows = story.chart?.rows ?? [];
  const maximum = Math.max(1, ...rows.map(row => Math.max(0, row.value ?? 0)));
  return <figure className="story-chart story-chart-mini story-classification" aria-label={story.chart?.title}>
    <figcaption className="sr-only">{story.chart?.title}</figcaption>
    {rows.map(row => <div className="story-classification-row" data-destination={row.label.toLowerCase()} key={row.label}>
      <div><span>Pasaría a {row.label}</span><strong>{shortUsd(row.value ?? 0)}</strong></div>
      <span className="story-classification-track" aria-hidden="true"><span style={{ width: `${Math.max(0, row.value ?? 0) / maximum * 100}%` }} /></span>
      <small>{number.format(row.count ?? 0)} códigos</small>
    </div>)}
  </figure>;
}

function ServiceRatio({ story }: { story: PanoramaStory }) {
  const ratio = story.primary?.value;
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  return <figure className="story-chart story-chart-mini story-service-ratio" aria-label={`${story.title}: ${number.format(ratio)}%`}>
    <figcaption className="sr-only">{story.title}: {number.format(ratio)}%. Horas y denominador en la tarjeta.</figcaption>
    <span className="story-ratio-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, ratio))}%` }} /></span>
    <small>{story.id === 'servicios_productividad' ? 'Horas trabajadas sobre capacidad' : 'Horas facturadas sobre trabajadas'}</small>
  </figure>;
}

export function PanoramaStoryCard({ story, index, retrying, onRetry, openSignal = 0, onSelectorOpenChange, periodMode = 'month', onPeriodChange }: {
  story: PanoramaStory; index: number; retrying: boolean; onRetry: () => void; openSignal?: number;
  onSelectorOpenChange?: (open: boolean) => void; periodMode?: StoryPeriod; onPeriodChange?: (mode: StoryPeriod) => void;
}) {
  const navigate = useNavigate();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const destinations = storyDestinations(story);
  const percentage = storySummaryPercentage(story);
  const osMovement = osMonthlyMovement(story, periodMode);
  const facts = storyCardFacts(story);
  const isSales = story.id.startsWith('ventas_') || story.id === 'repuestos_clientes';
  const actionLabel = isSales ? 'Explorar ventas' : story.id === 'maquinas_pedidos' ? 'Abrir pedidos'
    : story.id.startsWith('servicios_') ? 'Abrir OS' : story.id === 'agenda_cumplimiento' ? 'Abrir agenda'
      : story.id.startsWith('clientes_') ? 'Abrir clientes' : story.id.startsWith('repuestos_') ? 'Abrir análisis' : 'Explorar';
  const previousLabel = story.id === 'servicios_pendientes' ? 'Mes ant.' : 'LY';
  const comparison = story.primary?.comparison?.value && story.primary.comparison.value > 0 ? story.primary.comparison : null;
  const noComparable = story.primary?.note?.includes('Sin base') || (story.primary?.comparison && !comparison);
  const dateLines = storyDateLines(story);
  useEffect(() => {
    if (!openSignal || !destinations.length) return;
    if (destinations.length === 1) void navigate(destinations[0].route);
    else setSelectorOpen(true);
  // A new signal represents an explicit user action from Campi.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);
  useEffect(() => { onSelectorOpenChange?.(selectorOpen); }, [selectorOpen, onSelectorOpenChange]);
  const action = destinations.length > 1
    ? <DropdownMenu open={selectorOpen} onOpenChange={setSelectorOpen}><DropdownMenuTrigger asChild><Button variant="outline" className="story-detail-trigger" aria-label={`${actionLabel}: ${story.title}`}>{actionLabel}<ArrowRight className="ml-2 h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="story-sales-menu"><DropdownMenuLabel><strong>{actionLabel}</strong><span>{dateLines.join(' · ')}</span></DropdownMenuLabel>{destinations.map(destination => { const isParts = destination.label.toLowerCase().includes('repuestos') || destination.route.startsWith('/repuestos/'); const isService = destination.label.toLowerCase().includes('servicios'); const Icon = isParts ? Package : isService ? Wrench : Tractor; const description = isSales ? isParts ? 'Facturas, NC y artículos' : isService ? 'Facturas, NC y OS' : 'Facturas, NC y unidades' : destination.label; return <DropdownMenuItem key={destination.route} asChild><Link to={destination.route}><Icon aria-hidden="true" className="story-sales-menu-icon" /><span><strong>{destination.label}</strong><small>{description}</small></span><ArrowRight aria-hidden="true" className="story-sales-menu-arrow" /></Link></DropdownMenuItem>; })}</DropdownMenuContent></DropdownMenu>
    : destinations.length === 1 ? <Button variant="outline" asChild className="story-detail-trigger"><Link to={destinations[0].route} aria-label={`${actionLabel}: ${story.title}`}>{actionLabel}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button> : null;
  const chartRows = story.chart?.rows.slice(0, story.id === 'agenda_cumplimiento' || story.chart.kind === 'trend' ? undefined : 4) ?? [];
  const chartValues = chartRows.filter(row => typeof row.value === 'number' && Number.isFinite(row.value));
  const maximum = Math.max(1, ...chartValues.map(row => Math.abs(row.value!)));
  const hasChart = story.id === 'maquinas_pedidos' && story.supporting.some(item => item.label === 'Pedidos con stock')
    || ['servicios_productividad', 'servicios_eficiencia'].includes(story.id) && typeof story.primary?.value === 'number'
    || story.id === 'ventas_facturacion' && story.supporting.some(item => item.label.startsWith('Ventas antes de NC'))
    || chartRows.some(row => row.value !== null)
      && (story.chart?.kind !== 'trend' || chartValues.length >= 2);
  const showBasis = story.id === 'ventas_evolucion';
  return <article className="panorama-story" aria-labelledby={`story-${story.id}`} data-story={story.id} data-has-chart={hasChart}>
    <header className="story-header"><span className="story-index">{String(index + 1).padStart(2, '0')}</span><div className="story-heading-text"><h2 id={`story-${story.id}`}>{story.title}</h2></div><div className="story-header-period">{story.periodOptions?.length === 2 && onPeriodChange && <div className="story-period-switch" role="group" aria-label={`Período de ${story.title}`}>{(['month', 'ytd'] as const).map(mode => <button key={mode} type="button" aria-pressed={periodMode === mode} onClick={() => onPeriodChange(mode)}>{mode === 'month' ? 'Mes' : 'Acum.'}</button>)}</div>}<span className="sr-only">{dateLines.map(line => <span key={line}>{line}</span>)}</span></div>{story.status === 'empty' && <span className="story-empty-label">Sin datos</span>}</header>
    {story.status === 'error' ? <div role="alert"><p className="story-error">{story.message}</p><Button variant="outline" disabled={retrying} onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />{retrying ? 'Consultando…' : 'Reintentar fuente'}</Button></div> : <>
      <div className={`story-summary-metric${story.primary && valueLabel(story.primary.value, story.primary.unit).length > 12 ? ' story-summary-metric--long' : ''}`}>
        {story.primary && <><div className="story-main-value"><strong aria-label={`${story.primary.label}: ${valueLabel(story.primary.value, story.primary.unit)}`} data-long={valueLabel(story.primary.value, story.primary.unit).length > 12}>{valueLabel(story.primary.value, story.primary.unit)}</strong>{osMovement !== null && <span className="story-os-movement" data-direction={osMovement.delta < 0 ? 'down' : osMovement.delta > 0 ? 'up' : 'flat'} title={osMovement.partial ? 'Mes actual parcial frente al mes anterior completo: diferencia aritmética, no tramos equivalentes.' : 'Dos meses completos consecutivos.'} aria-label={`${osMovement.delta < 0 ? 'Bajó' : osMovement.delta > 0 ? 'Subió' : 'Sin cambio'} ${number.format(Math.abs(osMovement.delta))} puntos porcentuales; ${osMovement.partial ? 'mes actual parcial frente al mes anterior completo, no tramos equivalentes' : 'dos meses completos consecutivos'}`}><b>{osMovement.delta > 0 ? '+' : osMovement.delta < 0 ? '−' : ''}{number.format(Math.abs(osMovement.delta))} p.p.</b><small>{osMovement.partial ? 'parcial vs mes ant. completo' : 'vs. mes anterior'}</small></span>}{percentage?.kind === 'variation' && <span className="story-change" data-direction="neutral">{percentage.value > 0 ? '+' : ''}{number.format(percentage.value)}% <small>vs LY</small></span>}</div>{showBasis && <p className="story-support-line">Ventas antes de NC</p>}</>}
        {comparison && story.primary && <p className="story-support-line"><span title={comparison.label}>{previousLabel}</span> {valueLabel(comparison.value, story.primary.unit)}</p>}
        {story.primary?.note?.startsWith('Desde ') && <p className="story-support-line">{story.primary.note.replace('2026-07-01', 'julio 2026')}</p>}
        {percentage?.kind === 'composition' && <p className="story-support-line">{number.format(percentage.value)}% {percentage.label}</p>}
        {noComparable && <p className="story-support-line">Sin base comparable</p>}
        {facts.length > 0 && <dl className={`story-card-facts${story.id === 'servicios_os_facturadas' ? ' story-card-facts--os' : ''}`}>{facts.map((fact, factIndex) => <div key={fact.label}>{story.id === 'servicios_os_facturadas' && <span className="story-os-fact-icon" aria-hidden="true">{factIndex === 0 ? <FileText size={18} /> : <CircleCheck size={18} />}</span>}<dt>{fact.label}</dt><dd>{valueLabel(fact.value, fact.unit)}{fact.label.endsWith(' h') ? ' h' : ''}</dd></div>)}</dl>}
      </div>
      {story.id === 'ventas_facturacion' && story.primary?.value !== null && story.supporting.some(item => item.label.startsWith('Ventas antes de NC')) ? <BillingWaterfall story={story} />
        : story.id === 'maquinas_pedidos' && !story.chart ? <OrderCoverage story={story} />
        : chartRows.length === 2 && ['clientes_retencion', 'clientes_cobertura_posventa'].includes(story.id) ? <CardComposition story={story} rows={chartRows} />
        : chartRows.length > 0 && story.id === 'repuestos_stock' && chartRows.every(row => ['Rojo', 'Gris', 'Resto'].includes(row.label)) ? <CardComposition story={story} rows={chartRows} />
        : chartRows.length > 0 && story.id === 'repuestos_alertas' ? <ClassificationDestinations story={story} />
        : chartRows.length > 0 && story.id === 'agenda_cumplimiento' ? <figure className="story-chart story-chart-mini story-weekly-chart" aria-label={story.chart!.title}><figcaption className="sr-only">{story.chart!.title}</figcaption><div className="story-weekly-columns" role="region" tabIndex={0} aria-label="Todos los períodos de agenda" data-period={periodMode}>{chartRows.map(row => <div key={row.label} title={`${row.label}: ${row.value === null ? 'sin dato comparable' : `${number.format(row.value)}%`}`}><strong>{row.value === null ? '—' : `${number.format(row.value)}%`}</strong><span className="story-weekly-track"><span style={{ height: `${Math.max(0, Math.min(100, row.value ?? 0))}%` }} /></span><small>{periodMode === 'month' ? row.label.replace(/^(\d{2}\/\d{2})\/\d{4}–(\d{2}\/\d{2})\/\d{4}$/, '$1–$2') : monthTick(row.label)}</small></div>)}</div></figure>
        : chartRows.length === 2 && story.id === 'servicios_pendientes' ? <ResolutionComparison story={story} />
        : chartRows.length > 0 && story.chart?.kind === 'trend' && chartValues.length >= 2 ? story.id === 'servicios_os_facturadas' ? <OsBillingTrend story={story} /> : <CardTrend story={story} />
        : chartRows.length > 0 && story.chart?.kind !== 'trend' ? <figure className="story-chart story-chart-mini story-mini-bars" aria-label={story.chart!.title}><figcaption className="sr-only">{story.chart!.title}</figcaption><ul>{chartRows.map((row, rowIndex) => <li key={row.label} data-negative={typeof row.value === 'number' && row.value < 0} data-comparison={story.id === 'ventas_evolucion' && periodMode === 'month' && rowIndex === 1} data-bucket={row.label === 'Rojo' || row.label === 'Gris' ? row.label.toLowerCase() : undefined} title={`${row.label}: ${valueLabel(row.value, story.chart!.unit)}${row.count === undefined ? '' : ` · ${row.count} códigos`}`}><span className="story-mini-bar-label">{row.label}</span><span className="story-mini-bar-track" aria-hidden="true"><span style={{ width: `${Math.abs(row.value ?? 0) / maximum * 100}%` }} /></span><strong>{row.value === null ? '—' : story.chart!.unit === 'USD' ? `$ ${compact.format(row.value)}` : number.format(row.value)}</strong></li>)}</ul></figure>
        : ['servicios_productividad', 'servicios_eficiencia'].includes(story.id) ? <ServiceRatio story={story} /> : null}
      {action}
    </>}
  </article>;
}

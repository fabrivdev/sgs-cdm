import { useEffect, useState } from 'react';
import { ArrowRight, Package, RefreshCw, Tractor, Wrench } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { PanoramaStory, StoryPeriod, StoryUnit } from '@/lib/campi/panoramaStoryTypes';
import { storyDestinations } from '@/lib/campi/storyNavigation';
import { storySummaryPercentage } from '@/lib/campi/storySummary';
import { storyCardFacts } from '@/lib/campi/storyCardFacts';

const number = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 1 });
const valueLabel = (value: number | null, unit: StoryUnit) => value === null || !Number.isFinite(value) ? '—'
  : `${value < 0 ? '−' : ''}${unit === 'USD' ? '$ ' : unit === 'PYG' ? '₲ ' : ''}${(unit === 'USD' || unit === 'PYG' ? integer : number).format(Math.abs(value))}${unit === 'percent' ? '%' : unit === 'days' ? ' días' : ''}`;

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
    {bars.map(bar => <g key={bar.label}><rect x={bar.x} y={bar.y} width="42" height={bar.height} rx="3" fill={bar.color} /><text x={bar.x + 21} y={Math.max(10, bar.y - 3)} textAnchor="middle" className="story-waterfall-value">{valueLabel(bar.value, 'USD')}</text><text x={bar.x + 21} y="100" textAnchor="middle" className="story-waterfall-label">{bar.label}</text></g>)}
  </svg><figcaption className="sr-only">Ventas {valueLabel(gross, 'USD')}, NC {valueLabel(credit, 'USD')}, neto {valueLabel(net, 'USD')}.</figcaption></figure>;
}

function ResolutionTrend({ story }: { story: PanoramaStory }) {
  const rows = story.chart?.rows ?? [];
  if (!rows.length) return null;
  const maximum = Math.max(1, ...rows.map(row => row.value));
  const point = (row: typeof rows[number], index: number) => ({ x: rows.length === 1 ? 150 : index === 0 ? 52 : 248,
    y: 75 - row.value / maximum * 47 });
  return <figure className="story-chart story-chart-mini story-resolution-trend" aria-label={story.chart!.title}>
    <svg viewBox="0 0 300 102" role="img" aria-hidden="true">
      <line x1="16" x2="284" y1="75" y2="75" stroke="#d8dfe5" />
      {rows.length === 2 && <line x1={point(rows[0], 0).x} y1={point(rows[0], 0).y} x2={point(rows[1], 1).x} y2={point(rows[1], 1).y} stroke="var(--story-accent)" strokeWidth="2" />}
      {rows.map((row, index) => { const p = point(row, index); return <g key={row.label}><circle cx={p.x} cy={p.y} r="4" fill={index === rows.length - 1 ? 'var(--story-accent)' : '#9faab5'} /><text x={p.x} y={Math.max(13, p.y - 8)} textAnchor="middle" className="story-resolution-value">{number.format(row.value)} días</text><text x={p.x} y="96" textAnchor="middle" className="story-resolution-label">{row.label}</text></g>; })}
    </svg><figcaption className="sr-only">{rows.map(row => `${row.label}: ${number.format(row.value)} días`).join('; ')}</figcaption>
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
  const facts = storyCardFacts(story);
  const isSales = story.id.startsWith('ventas_') || story.id === 'repuestos_clientes';
  const actionLabel = isSales ? 'Explorar ventas' : story.id === 'maquinas_pedidos' ? 'Abrir pedidos'
    : story.id.startsWith('servicios_') ? 'Abrir OS' : story.id === 'agenda_cumplimiento' ? 'Abrir agenda'
      : story.id.startsWith('clientes_') ? 'Abrir clientes' : story.id.startsWith('repuestos_') ? 'Abrir análisis' : 'Explorar';
  const previousLabel = story.id === 'servicios_pendientes' ? 'Mes ant.' : 'LY';
  const comparison = story.primary?.comparison?.value && story.primary.comparison.value > 0 ? story.primary.comparison : null;
  const noComparable = story.primary?.note?.includes('Sin base') || (story.primary?.comparison && !comparison);
  const cutoff = story.navigationPeriod?.to ?? story.cutoff;
  const retentionDates = story.id === 'clientes_retencion' ? [...story.periodLabel.matchAll(/\d{4}-\d{2}-\d{2}/g)].map(match => {
    const date = match[0];
    return `${date.slice(8)}/${date.slice(5, 7)}${story.periodMode === 'ytd' ? `/${date.slice(0, 4)}` : ''}`;
  }) : [];
  const compactPeriod = cutoff && /^\d{4}-\d{2}-\d{2}$/.test(cutoff)
    ? `${story.periodMode === 'ytd' ? 'Ene–' : ''}${new Intl.DateTimeFormat('es-PY', { month: 'short', timeZone: 'UTC' }).format(new Date(`${cutoff}T00:00:00Z`))} · ${cutoff.slice(8)}/${cutoff.slice(5, 7)}`
    : story.periodLabel;
  useEffect(() => {
    if (!openSignal || !destinations.length) return;
    if (destinations.length === 1) void navigate(destinations[0].route);
    else setSelectorOpen(true);
  // A new signal represents an explicit user action from Campi.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);
  useEffect(() => { onSelectorOpenChange?.(selectorOpen); }, [selectorOpen, onSelectorOpenChange]);
  const action = destinations.length > 1
    ? <DropdownMenu open={selectorOpen} onOpenChange={setSelectorOpen}><DropdownMenuTrigger asChild><Button variant="outline" className="story-detail-trigger" aria-label={`${actionLabel}: ${story.title}`}>{actionLabel}<ArrowRight className="ml-2 h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="story-sales-menu"><DropdownMenuLabel><strong>{actionLabel}</strong><span>{story.periodLabel}</span></DropdownMenuLabel>{destinations.map(destination => { const isParts = destination.label.toLowerCase().includes('repuestos') || destination.route.startsWith('/repuestos/'); const isService = destination.label.toLowerCase().includes('servicios'); const Icon = isParts ? Package : isService ? Wrench : Tractor; const description = isSales ? isParts ? 'Facturas, NC y artículos' : isService ? 'Facturas, NC y OS' : 'Facturas, NC y unidades' : destination.label; return <DropdownMenuItem key={destination.route} asChild><Link to={destination.route}><Icon aria-hidden="true" className="story-sales-menu-icon" /><span><strong>{destination.label}</strong><small>{description}</small></span><ArrowRight aria-hidden="true" className="story-sales-menu-arrow" /></Link></DropdownMenuItem>; })}</DropdownMenuContent></DropdownMenu>
    : destinations.length === 1 ? <Button variant="outline" asChild className="story-detail-trigger"><Link to={destinations[0].route} aria-label={`${actionLabel}: ${story.title}`}>{actionLabel}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button> : null;
  const chartRows = story.chart?.rows.slice(0, story.chart.kind === 'trend' ? 12 : 4) ?? [];
  const maximum = Math.max(1, ...chartRows.map(row => Math.abs(row.value)));
  return <article className="panorama-story" aria-labelledby={`story-${story.id}`} data-story={story.id}>
    <header className="story-header"><span className="story-index">{String(index + 1).padStart(2, '0')}</span><div className="story-heading-text"><h2 id={`story-${story.id}`}>{story.title}</h2></div><div className="story-header-period">{story.periodOptions?.length === 2 && onPeriodChange && <div className="story-period-switch" role="group" aria-label={`Período de ${story.title}`}>{(['month', 'ytd'] as const).map(mode => <button key={mode} type="button" aria-pressed={periodMode === mode} onClick={() => onPeriodChange(mode)}>{mode === 'month' ? 'Mes' : 'Acum.'}</button>)}</div>}{retentionDates.length === 4 ? <span className="story-card-period story-card-period--windows" title={story.periodLabel}><span>Base {retentionDates[0]}–{retentionDates[1]}</span><span>Recompra {retentionDates[2]}–{retentionDates[3]}</span></span> : compactPeriod && <span className="story-card-period" title={story.periodLabel}>{compactPeriod}</span>}</div>{story.status === 'empty' && <span className="story-empty-label">Sin datos</span>}</header>
    {story.status === 'error' ? <div role="alert"><p className="story-error">{story.message}</p><Button variant="outline" disabled={retrying} onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />{retrying ? 'Consultando…' : 'Reintentar fuente'}</Button></div> : <>
      <div className={`story-summary-metric${story.primary && valueLabel(story.primary.value, story.primary.unit).length > 12 ? ' story-summary-metric--long' : ''}`}><dl>{story.primary && <><div className="story-datum story-datum-primary"><dt>{story.primary.label}</dt><dd data-long={valueLabel(story.primary.value, story.primary.unit).length > 12}>{story.id === 'maquinas_pedidos' ? `${valueLabel(story.primary.value, 'count')} pedidos` : valueLabel(story.primary.value, story.primary.unit)}</dd></div>{comparison && <div className="story-datum story-datum-previous"><dt title={comparison.label}>{previousLabel}</dt><dd>{valueLabel(comparison.value, story.primary.unit)}</dd></div>}</>}</dl>{percentage ? <div className="story-percentage" data-kind={percentage.kind} data-direction="neutral"><strong>{percentage.kind === 'variation' && percentage.value > 0 ? '+' : ''}{number.format(percentage.value)}%</strong><span>{percentage.kind === 'variation' ? 'vs LY' : percentage.label}</span></div> : noComparable ? <span className="story-comparison-missing">Sin base comparable</span> : null}{facts.length > 0 && <dl className="story-card-facts">{facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{valueLabel(fact.value, fact.unit)}{fact.label.endsWith(' h') ? ' h' : ''}</dd></div>)}</dl>}</div>
      {story.id === 'ventas_facturacion' && story.primary?.value !== null && story.supporting.some(item => item.label.startsWith('Ventas antes de NC')) ? <BillingWaterfall story={story} />
        : chartRows.length === 2 && story.id === 'clientes_retencion' ? <figure className="story-chart story-chart-mini story-composition" aria-label={story.chart!.title}><figcaption className="sr-only">{story.chart!.title}</figcaption><div className="story-composition-track" aria-hidden="true">{chartRows.map((row, index) => <span key={row.label} data-segment={String(index)} style={{ width: `${row.value / Math.max(1, chartRows[0].value + chartRows[1].value) * 100}%` }} />)}</div><ul>{chartRows.map((row, index) => <li key={row.label} data-segment={String(index)}><span className="story-composition-dot" /><span title={row.label}>{row.label}</span></li>)}</ul></figure>
        : chartRows.length > 0 && story.id === 'repuestos_stock' ? <figure className="story-chart story-chart-mini story-composition" aria-label={story.chart!.title}><figcaption className="sr-only">{story.chart!.title}</figcaption><div className="story-composition-track" aria-hidden="true">{chartRows.map(row => <span key={row.label} data-segment={row.label.toLowerCase()} style={{ width: `${Math.max(0, row.value) / Math.max(1, chartRows.reduce((total, item) => total + Math.max(0, item.value), 0)) * 100}%` }} />)}</div><ul>{chartRows.map(row => <li key={row.label} data-segment={row.label.toLowerCase()}><span className="story-composition-dot" /><span title={row.label}>{row.label}</span><strong>{`$ ${compact.format(row.value)}`}</strong></li>)}</ul></figure>
        : chartRows.length > 0 && story.id === 'agenda_cumplimiento' ? <figure className="story-chart story-chart-mini story-weekly-chart" aria-label={story.chart!.title}><figcaption className="sr-only">{story.chart!.title}</figcaption><div className="story-weekly-columns">{chartRows.map(row => <div key={row.label} title={`${row.label}: ${number.format(row.value)}%`}><strong>{number.format(row.value)}%</strong><span className="story-weekly-track"><span style={{ height: `${Math.max(0, Math.min(100, row.value))}%` }} /></span><small>{row.label}</small></div>)}</div></figure>
        : chartRows.length > 0 && story.id === 'servicios_pendientes' ? <ResolutionTrend story={story} />
        : chartRows.length > 0 && story.chart?.kind === 'trend' ? <figure className="story-chart story-chart-mini story-trend" aria-label={story.chart.title}><figcaption className="sr-only">{story.chart.title}</figcaption><div className="story-chart-canvas" style={{ height: 92 }} aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}><YAxis width={42} domain={[0, 'dataMax']} tickCount={3} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => story.chart!.unit === 'USD' ? `$${compact.format(value)}` : number.format(value)} /><XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value: number) => valueLabel(value, story.chart!.unit)} /><Line type="linear" dataKey="value" stroke="var(--story-accent, #21835d)" strokeWidth={2} dot={chartRows.length <= 6} isAnimationActive={false} />{chartRows.some(row => row.previous !== undefined) && <Line type="linear" dataKey="previous" stroke="#8293ad" strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer></div><div className="story-trend-legend"><span>{story.chart.currentLabel ?? 'Actual'}</span>{chartRows.some(row => row.previous !== undefined) && <span>{story.chart.previousLabel ?? 'Referencia'}</span>}{chartRows.some(row => row.label.includes('*')) && <small>* parcial</small>}</div><ul className="sr-only">{chartRows.map(row => <li key={row.label}>{row.label}: {valueLabel(row.value, story.chart!.unit)}{row.previous === undefined ? '' : `; LY: ${valueLabel(row.previous, story.chart!.unit)}`}</li>)}</ul></figure>
        : chartRows.length > 0 ? <figure className="story-chart story-chart-mini story-mini-bars" aria-label={story.chart!.title}><figcaption className="sr-only">{story.chart!.title}</figcaption><ul>{chartRows.map((row, rowIndex) => <li key={row.label} data-negative={row.value < 0} data-comparison={story.id === 'ventas_evolucion' && periodMode === 'month' && rowIndex === 1} data-bucket={row.label === 'Rojo' || row.label === 'Gris' ? row.label.toLowerCase() : undefined}><span className="story-mini-bar-label" title={row.label}>{row.label}</span><span className="story-mini-bar-track" aria-hidden="true"><span style={{ width: `${Math.abs(row.value) / maximum * 100}%` }} /></span><strong>{story.chart!.unit === 'USD' ? `$ ${compact.format(row.value)}` : number.format(row.value)}</strong></li>)}</ul></figure>
        : ['maquinas_pedidos', 'servicios_os_facturadas', 'clientes_cobertura_posventa', 'servicios_productividad', 'servicios_eficiencia'].includes(story.id) ? <p className="story-no-chart">{story.id === 'maquinas_pedidos' ? 'Composición no disponible' : story.id === 'clientes_cobertura_posventa' ? 'Comparación por línea no disponible' : story.id === 'servicios_productividad' ? 'Comparación no disponible' : 'Evolución mensual no disponible'}</p> : null}
      {action}
    </>}
  </article>;
}

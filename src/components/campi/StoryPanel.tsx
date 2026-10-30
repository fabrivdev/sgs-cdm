import { formatDateText, storyDetailDateLines } from '@/lib/campi/panoramaDates';
import { useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerFooter, ResponsiveDrawerHeader } from '@/components/ui/responsive-drawer';
import { storySummaryPercentage } from '@/lib/campi/storySummary';
import type { PanoramaStory, StoryDatum, StoryUnit } from '@/lib/campi/panoramaStoryTypes';
import { MachineOrdersDetail } from './MachineOrdersDetail';
import { ServiceOpenOrdersDetail } from './ServiceOpenOrdersDetail';

const usd = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 0 });
const numbers = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 1 });
const storyValue = (value: number | null, unit: StoryUnit) => value === null || !Number.isFinite(value) ? '—' : `${value < 0 ? '−' : ''}${unit === 'USD' ? '$ ' : unit === 'PYG' ? '₲ ' : ''}${(unit === 'USD' ? usd : numbers).format(Math.abs(value))}${unit === 'percent' ? '%' : unit === 'days' ? ' días' : ''}`;
const chartValue = (value: number, unit: StoryUnit) => `${unit === 'USD' ? '$ ' : unit === 'PYG' ? '₲ ' : ''}${(unit === 'USD' ? usdCompact : compact).format(value)}`;
const shortUsd = (value: number) => {
  const magnitude = Math.abs(value);
  const divisor = magnitude >= 1_000_000 ? 1_000_000 : magnitude >= 10_000 ? 1_000 : 1;
  const suffix = divisor === 1_000_000 ? ' M' : divisor === 1_000 ? ' mil' : '';
  return `${value < 0 ? '−' : ''}$ ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(magnitude / divisor)}${suffix}`;
};

function BillingMetrics({ story }: { story: PanoramaStory }) {
  const netMonth = story.primary;
  const netYear = story.supporting.find(item => item.label === 'Facturación neta acumulada');
  const creditYear = story.supporting.find(item => item.label === 'NC acumuladas del año');
  const grossYear = story.supporting.find(item => item.label === 'Ventas acumuladas antes de NC');
  if (!netMonth || !netYear || !creditYear || !grossYear) return null;
  const cards = [
    { label: 'Neto mes', datum: netMonth },
    { label: 'Neto año', datum: netYear },
    { label: 'NC año', datum: creditYear },
  ];
  return <dl className="story-detail-metrics story-billing-metrics">{cards.map(({ label, datum }) => {
    const change = datum.comparison && datum.value !== null && datum.comparison.value !== 0
      ? (datum.value - datum.comparison.value) / Math.abs(datum.comparison.value) * 100 : null;
    const creditShare = label === 'NC año' && creditYear.value !== null && grossYear.value !== null && grossYear.value > 0
      ? Math.abs(creditYear.value) / grossYear.value * 100 : null;
    return <div className="story-datum" key={label} title={`${label}: ${storyValue(datum.value, datum.unit)}`}>
      <dt>{label}</dt><dd>{datum.value === null ? '—' : shortUsd(label === 'NC año' ? Math.abs(datum.value) : datum.value)}</dd>
      {change !== null && <p className="story-kpi-change" data-negative={change < 0}>{change > 0 ? '+' : ''}{numbers.format(change)}% <span>vs LY</span></p>}
      {change !== null && <p className="story-kpi-ly">LY {shortUsd(datum.comparison!.value)}</p>}
      {creditShare !== null && <p className="story-kpi-change">{numbers.format(creditShare)}% <span>de ventas</span></p>}
    </div>;
  })}</dl>;
}

function Datum({ datum, primary = false }: { datum: StoryDatum; primary?: boolean }) {
  return <div className={primary ? 'story-datum story-datum-primary' : 'story-datum'}>
    <dt>{datum.label}</dt><dd>{storyValue(datum.value, datum.unit)}</dd>
    {datum.comparison && <p className="story-comparison">{datum.comparison.label}: {storyValue(datum.comparison.value, datum.unit)}</p>}
    {datum.note && <p>{formatDateText(datum.note)}</p>}
  </div>;
}

function StoryChart({ chart, mini = false }: { mini?: boolean; chart: NonNullable<PanoramaStory['chart']> }) {
  const comparison = chart.rows.some(row => row.previous !== undefined);
  const shownRows = mini && chart.kind === 'bars' ? chart.rows.slice(0, 4) : chart.rows;
  if (mini && chart.kind === 'bars') {
    const maximum = Math.max(1, ...shownRows.map(row => Math.abs(row.value)));
    return <figure className="story-chart story-chart-mini story-mini-bars" aria-label={chart.title}>
    <figcaption className="sr-only">{chart.title}</figcaption>
    <ul>{shownRows.map((row, index) => <li key={`${row.label}-${index}`} data-negative={row.value < 0} data-bucket={row.label === 'Rojo' || row.label === 'Gris' ? row.label.toLowerCase() : row.label === 'Sin vínculo' ? 'sin-vinculo' : row.label === 'Importación en tránsito' ? 'transito' : row.label === 'Importación arribada' ? 'arribada' : undefined}><span className="story-mini-bar-label" title={row.label}>{row.label}</span><span className="story-mini-bar-track" aria-hidden="true"><span style={{ width: `${Math.max(Math.abs(row.value) / maximum * 100, row.value === 0 ? 0 : 3)}%` }} /></span><strong>{chartValue(row.value, chart.unit)}</strong></li>)}</ul>
    <ul className="sr-only">{chart.rows.map((row, index) => <li key={`${row.label}-${index}`}>{row.label}: {storyValue(row.value, chart.unit)}</li>)}</ul>
  </figure>;
  }
  const common = { data: shownRows, margin: { top: 4, right: mini && chart.kind === 'bars' ? 26 : 8, bottom: 0, left: 0 } };
  const tooltip = <Tooltip formatter={(value: number) => storyValue(value, chart.unit)} contentStyle={{ borderRadius: 8, fontSize: 12, background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }} />;
  return <figure className={mini ? "story-chart story-chart-mini" : "story-chart"} aria-label={chart.title}>
    <figcaption className={mini ? 'sr-only' : undefined}>{chart.title}{mini && chart.rows.length > shownRows.length && <span>{shownRows.length} de {chart.rows.length} · resto en detalle</span>}{(chart.unit === 'USD' || chart.unit === 'PYG') && <span>{chart.unit === 'USD' ? 'Dólares' : 'Guaraníes'}</span>}</figcaption>
    <div className="story-chart-canvas" style={{ height: mini ? 92 : chart.kind === 'bars' ? Math.max(150, chart.rows.length * 30 + 30) : 210 }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {chart.kind === 'trend' ? <LineChart {...common}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
          <YAxis tickFormatter={value => chartValue(Number(value), chart.unit)} width={52} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          {tooltip}{!mini && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />}
          <Line type="linear" dataKey="value" name={chart.currentLabel ?? 'Actual'} stroke="var(--story-accent, #21835d)" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
          {comparison && !mini && <Line type="linear" dataKey="previous" name={chart.previousLabel ?? 'Anterior'} stroke="#8293ad" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />}
        </LineChart> : <BarChart {...common} layout="vertical" barSize={16}>
          {!mini && <CartesianGrid strokeDasharray="3 5" horizontal={false} stroke="hsl(var(--border))" />}
          <XAxis hide={mini} type="number" tickFormatter={value => chartValue(Number(value), chart.unit)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={mini ? 105 : 125} tick={{ fontSize: mini ? 12 : 11 }} axisLine={false} tickLine={false} />
          {tooltip}{comparison && !mini && <Legend wrapperStyle={{ fontSize: 12 }} />}
          <Bar dataKey="value" name={chart.currentLabel ?? 'Actual'} fill="var(--story-accent, #21835d)" radius={[3, 3, 3, 3]} background={mini ? { fill: 'var(--story-tint)' } : undefined} isAnimationActive={false}>{shownRows.map((row, index) => <Cell key={index} fill={row.label === 'Rojo' ? '#cc4242' : row.label === 'Gris' || row.label === 'Sin vínculo' ? '#8792a0' : row.label === 'Importación en tránsito' ? '#d59d2a' : row.label === 'Importación arribada' ? '#3b9fa7' : 'var(--story-accent, #21835d)'} />)}{mini && <LabelList dataKey="value" position="right" formatter={(value: number) => chartValue(value, chart.unit)} fontSize={12} fill="hsl(var(--muted-foreground))" />}</Bar>
          {comparison && !mini && <Bar dataKey="previous" name={chart.previousLabel ?? 'Anterior'} fill="#8293ad" radius={[0, 3, 3, 0]} isAnimationActive={false} />}
        </BarChart>}
      </ResponsiveContainer>
    </div>

    <ul className="sr-only">{chart.rows.map((row, i) => <li key={i}>{row.label}: {storyValue(row.value, chart.unit)}{row.previous !== undefined && `; ${chart.previousLabel ?? 'Anterior'}: ${storyValue(row.previous, chart.unit)}`}</li>)}</ul>
  </figure>;
}

function StoryComparisonChart({ current, previous, label, unit }: { current: number; previous: number; label: string; unit: StoryUnit }) {
  const maximum = Math.max(Math.abs(current), Math.abs(previous), 1);
  return <figure className="story-chart story-chart-mini story-comparison-chart" aria-label={`Comparación de ${label}`}>
    <figcaption className="sr-only">Anterior: {storyValue(previous, unit)}; actual: {storyValue(current, unit)}</figcaption>
    <div className="story-comparison-columns" aria-hidden="true">
      <div title={`Anterior: ${storyValue(previous, unit)}`}><span data-negative={previous < 0} className="story-comparison-bar story-comparison-bar--previous" style={{ height: `${Math.abs(previous) / maximum * 44}px` }} /><small>{previous < 0 ? '− Anterior' : 'Anterior'}</small></div>
      <div title={`Actual: ${storyValue(current, unit)}`}><span data-negative={current < 0} className="story-comparison-bar story-comparison-bar--current" style={{ height: `${Math.abs(current) / maximum * 44}px` }} /><small>{current < 0 ? '− Actual' : 'Actual'}</small></div>
    </div>
  </figure>;
}

function ProjectionComponents({ story }: { story: PanoramaStory }) {
  const labels = ['Stock calculado', 'Compras pendientes', 'Ventas pendientes'];
  return <dl className="story-projection-components" aria-label="Componentes de la proyección">{labels.map(label => {
    const datum = story.supporting.find(item => item.label === label);
    return datum && <div key={label}><dt>{label}</dt><dd>{storyValue(datum.value, datum.unit)}</dd></div>;
  })}</dl>;
}

function BillingBridge({ story }: { story: PanoramaStory }) {
  const gross = story.supporting.find(item => item.label === 'Ventas antes de NC del mes')?.value;
  const credit = story.supporting.find(item => item.label === 'Notas de crédito del mes')?.value;
  const net = story.primary?.value;
  if (gross === null || gross === undefined || credit === null || credit === undefined || net === null || net === undefined) return null;
  const maximum = Math.max(Math.abs(gross), Math.abs(credit), Math.abs(net), 1);
  return <figure className="story-billing-bridge" aria-label="Conciliación de facturación">
    <figcaption className="sr-only">Ventas {storyValue(gross, 'USD')} menos notas de crédito {storyValue(-credit, 'USD')} igual a neto {storyValue(net, 'USD')}</figcaption>
    <div className="story-billing-row"><span>Ventas</span><span className="story-billing-track"><span className="story-billing-bar" style={{ width: `${Math.abs(gross) / maximum * 100}%` }} /></span><strong>{chartValue(gross, 'USD')}</strong></div>
    <div className="story-billing-row"><span>NC</span><span className="story-billing-track"><span className="story-billing-bar story-billing-bar--credit" style={{ width: `${Math.abs(credit) / maximum * 100}%` }} /></span><strong>−{chartValue(Math.abs(credit), 'USD')}</strong></div>
    <div className="story-billing-row"><span>Neto</span><span className="story-billing-track"><span className="story-billing-bar story-billing-bar--net" data-negative={net < 0} style={{ width: `${Math.abs(net) / maximum * 100}%` }} /></span><strong>{chartValue(net, 'USD')}</strong></div>
  </figure>;
}

function ResolutionComparison({ story }: { story: PanoramaStory }) {
  const primary = story.primary!;
  const current = story.supporting.find(item => item.label.startsWith('OS cerradas en '));
  const open = story.supporting.find(item => item.label === 'OS abiertas registradas');
  return <div className="story-resolution-comparison">
    <StoryComparisonChart current={primary.value!} previous={primary.comparison!.value} label={primary.label} unit={primary.unit} />
    <dl className="story-resolution-guardrails">
      {current && <div><dt>OS cerradas</dt><dd>{storyValue(current.value, current.unit)}</dd></div>}
      {open && <div><dt>OS abiertas</dt><dd>{storyValue(open.value, open.unit)}</dd></div>}
    </dl>
  </div>;
}

export function StoryPanel({ story, index, onRetry, retrying, visitChange = null, openSignal = 0, onDetailOpenChange }: { story: PanoramaStory; index: number; onRetry: () => void; retrying: boolean; visitChange?: number | null; openSignal?: number; onDetailOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (openSignal > 0) setOpen(true); }, [openSignal]);
  useEffect(() => { onDetailOpenChange?.(open); }, [open, onDetailOpenChange]);
  const titleId = `story-${story.id}`;
  const percentage = storySummaryPercentage(story);
  const breakdownGroups = [...new Set(story.breakdown.map(row => row.group ?? 'Desglose'))];
  const secondary = story.supporting.filter(datum => {
    if (datum.label === story.primary?.label) return false;
    if (story.id === 'maquinas_pedidos') return ['Pedidos con stock', 'Unidades pendientes'].includes(datum.label);
    if (story.id === 'ventas_facturacion') return ['Ventas antes de NC del mes', 'Notas de crédito del mes', 'Facturación neta acumulada', 'Ventas acumuladas antes de NC', 'NC acumuladas del año'].includes(datum.label);
    if (story.id === 'ventas_evolucion') return datum.unit !== 'percent';
    if (story.id === 'servicios_pendientes') return datum.label.startsWith('OS cerradas en ') || datum.label === 'Percentil 90 de edad abierta';
    return true;
  });
  const breakdown = (group: string) => { const rows = story.breakdown.filter(row => (row.group ?? 'Desglose') === group); const billingBreakdown = rows.length > 0 && rows.every(row => row.billing); const annualComparison = rows.length > 0 && rows.every(row => row.previous !== undefined);
  return <div className="overflow-x-auto"><table className="w-full text-sm" aria-label={group}>
    <thead><tr className="border-b text-xs text-muted-foreground"><th className="py-2 text-left font-medium">{group === 'Desglose' ? 'Concepto' : group}</th>{billingBreakdown && <><th className="py-2 text-right font-medium">Ventas</th><th className="py-2 text-right font-medium">NC</th></>}{annualComparison && <th className="py-2 text-right font-medium">Año anterior</th>}<th className="py-2 text-right font-medium">{billingBreakdown ? 'Neto' : annualComparison ? 'Año actual' : story.id === 'maquinas_pedidos' ? 'Unidades' : story.id === 'servicios_abiertas' ? 'OS' : 'Valor'}</th></tr></thead>
    <tbody>{story.breakdown.filter(row => (row.group ?? 'Desglose') === group).map((row, i) => <tr key={i} className="border-b last:border-0">
      <td className="max-w-[300px] truncate py-2 pr-3" title={[row.label, row.note].filter(Boolean).join(' · ')}>{row.route ? <Link className="inline-flex items-center gap-1 text-primary" to={row.route}>{row.label}<ArrowUpRight className="h-3 w-3 shrink-0" /></Link> : row.label}</td>
      {billingBreakdown && <><td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{storyValue(row.billing!.sales, row.unit)}</td><td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{storyValue(-row.billing!.credits, row.unit)}</td></>}
      {annualComparison && <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{storyValue(row.previous!, row.unit)}</td>}
      <td className="whitespace-nowrap py-2 text-right tabular-nums">{storyValue(row.value, row.unit)}</td>
    </tr>)}</tbody>
  </table></div>; };
  return <article className="panorama-story" aria-labelledby={titleId} data-story={story.id}>
    <header className="story-header"><span className="story-index">{String(index + 1).padStart(2, '0')}</span><div className="story-heading-text"><h2 id={titleId}>{story.title}</h2></div>{story.status === 'empty' && <span className="story-empty-label">Sin datos</span>}{story.status === 'ready' && story.cutoff === null && ['maquinas_stock', 'repuestos_stock'].includes(story.id) && <span className="story-cutoff-warning" title="La fuente no acredita la fecha del inventario">Corte por confirmar</span>}</header>
    {story.status === 'error' ? <div role="alert"><p className="story-error">{formatDateText(story.message)}</p><Button variant="outline" disabled={retrying} onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />{retrying ? 'Consultando…' : 'Reintentar fuente'}</Button></div> : <>
      <div className={`story-summary-metric${story.primary && storyValue(story.primary.value, story.primary.unit).length > 12 ? ' story-summary-metric--long' : ''}`}>
        <dl>{story.primary && <>
          <div className="story-datum story-datum-primary"><dt>{story.primary.label}</dt><dd data-long={storyValue(story.primary.value, story.primary.unit).length > 12}>{storyValue(story.primary.value, story.primary.unit)}</dd></div>
          {story.primary.comparison && <div className="story-datum story-datum-previous"><dt>{story.primary.comparison.label}</dt><dd>{storyValue(story.primary.comparison.value, story.primary.unit)}</dd></div>}
        </>}</dl>
        {percentage && <div className="story-percentage" data-kind={percentage.kind} data-direction={percentage.kind === 'variation' ? 'neutral' : 'composition'}><strong>{`${percentage.kind === 'variation' && percentage.value > 0 ? '+' : ''}${numbers.format(percentage.value)}%`}</strong><span>{percentage.kind === 'variation' ? 'Variación' : percentage.label}</span></div>}
      </div>
      {story.primary?.note && <p className="text-xs text-muted-foreground col-span-full">{story.primary.note}</p>}
      {story.id === 'ventas_facturacion' && ['Ventas antes de NC del mes', 'Notas de crédito del mes'].every(label => story.supporting.some(item => item.label === label && item.value !== null)) ? <BillingBridge story={story} /> : story.id === 'maquinas_proyeccion' && ['Stock calculado', 'Compras pendientes', 'Ventas pendientes'].every(label => story.supporting.some(item => item.label === label)) ? <ProjectionComponents story={story} /> : story.id === 'servicios_pendientes' && story.primary?.comparison && story.primary.value !== null && Number.isFinite(story.primary.value) && Number.isFinite(story.primary.comparison.value) && story.primary.value >= 0 && story.primary.comparison.value >= 0 ? <ResolutionComparison story={story} /> : story.chart && story.chart.rows.length > 0 ? <StoryChart chart={story.chart} mini /> : story.primary?.comparison && story.primary.value !== null && Number.isFinite(story.primary.value) && Number.isFinite(story.primary.comparison.value) && story.primary.value >= 0 && story.primary.comparison.value >= 0 ? <StoryComparisonChart current={story.primary.value} previous={story.primary.comparison.value} label={story.primary.label} unit={story.primary.unit} /> : null}
      <Button ref={triggerRef} variant="outline" className="story-detail-trigger" aria-label={`Ver detalle de ${story.title}`} onClick={() => setOpen(true)}>Ver detalle <ArrowRight className="ml-2 h-4 w-4" /></Button>
      <ResponsiveDrawer open={open} onOpenChange={setOpen} size="xl" title={story.title} onCloseAutoFocus={event => { event.preventDefault(); triggerRef.current?.focus(); }}>
        <ResponsiveDrawerHeader>
          <h2 className="text-[16px] font-semibold">{story.title}</h2>
          <div className="mt-1 text-xs text-muted-foreground">{storyDetailDateLines(story).join(' · ')}</div>
        </ResponsiveDrawerHeader>
        <ResponsiveDrawerBody className={story.id === 'maquinas_pedidos' || story.id === 'servicios_abiertas' ? 'panorama-story-dialog panorama-orders-dialog' : 'panorama-story-dialog space-y-4'}>
          {story.id === 'maquinas_pedidos' && story.machineOrders ? <MachineOrdersDetail story={story} open={open} /> : <>
          {story.id === 'servicios_abiertas' && story.openOrders ? <ServiceOpenOrdersDetail story={story} open={open} /> : <>
          {story.status === 'empty' && <p className="text-sm text-muted-foreground">{story.message}</p>}
          {visitChange !== null && visitChange !== 0 && story.primary && <p className="story-visit-change">El total visible cambió {visitChange > 0 ? '+' : ''}{storyValue(visitChange, story.primary.unit)} desde tu última visita en este navegador.</p>}
          {story.id === 'ventas_facturacion' && story.status === 'ready' && story.primary?.value !== null
            ? <BillingMetrics story={story} />
            : <dl className="story-detail-metrics">{story.primary && <Datum datum={story.primary} primary />}{secondary.map((datum, i) => <Datum key={i} datum={datum} />)}</dl>}
          {story.detailChart && story.detailChart.rows.length > 0 && <StoryChart chart={story.detailChart} />}
          {story.secondaryCharts?.map(chart => <StoryChart key={chart.title} chart={chart} />)}
          {story.chart && story.chart.rows.length > 0 && <StoryChart chart={story.chart} />}
          {breakdownGroups.length > 1 ? <Tabs defaultValue={breakdownGroups[0]}><TabsList className="flex h-auto flex-wrap">{breakdownGroups.map(group => <TabsTrigger key={group} value={group}>{group}</TabsTrigger>)}</TabsList>{breakdownGroups.map(group => <TabsContent key={group} value={group}>{breakdown(group)}</TabsContent>)}</Tabs> : breakdownGroups.length === 1 && breakdown(breakdownGroups[0])}
          </>}
          </>}
        </ResponsiveDrawerBody>
        {story.route && <ResponsiveDrawerFooter><Button asChild variant="outline"><Link to={story.route}>Abrir sección de origen<ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button></ResponsiveDrawerFooter>}
      </ResponsiveDrawer>
    </>}
  </article>;
}

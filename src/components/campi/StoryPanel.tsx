import { useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerFooter, ResponsiveDrawerHeader } from '@/components/ui/responsive-drawer';
import { storySummaryPercentage } from '@/lib/campi/storySummary';
import type { PanoramaStory, StoryDatum, StoryUnit } from '@/lib/campi/panoramaStoryTypes';

const numbers = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 1 });
const storyValue = (value: number | null, unit: StoryUnit) => value === null || !Number.isFinite(value) ? '—' : `${unit === 'USD' ? '$ ' : unit === 'PYG' ? '₲ ' : ''}${numbers.format(value)}${unit === 'percent' ? '%' : unit === 'days' ? ' días' : ''}`;
const chartValue = (value: number, unit: StoryUnit) => `${unit === 'USD' ? '$ ' : unit === 'PYG' ? '₲ ' : ''}${compact.format(value)}`;
const dateLabel = (value: string) => new Intl.DateTimeFormat('es-PY').format(new Date(`${value}T12:00:00`));

function Datum({ datum, primary = false }: { datum: StoryDatum; primary?: boolean }) {
  return <div className={primary ? 'story-datum story-datum-primary' : 'story-datum'}>
    <dt>{datum.label}</dt><dd>{storyValue(datum.value, datum.unit)}</dd>
    {datum.comparison && <p className="story-comparison">{datum.comparison.label}: {storyValue(datum.comparison.value, datum.unit)}</p>}
    {datum.note && <p>{datum.note}</p>}
  </div>;
}

function StoryChart({ chart, mini = false }: { mini?: boolean; chart: NonNullable<PanoramaStory['chart']> }) {
  const comparison = chart.rows.some(row => row.previous !== undefined);
  const shownRows = mini && chart.kind === 'bars' ? chart.rows.slice(0, 4) : chart.rows;
  if (mini && chart.kind === 'bars') {
    const maximum = Math.max(1, ...shownRows.map(row => Math.abs(row.value)));
    return <figure className="story-chart story-chart-mini story-mini-bars" aria-label={chart.title}>
    <figcaption className="sr-only">{chart.title}</figcaption>
    <ul>{shownRows.map((row, index) => <li key={`${row.label}-${index}`} data-negative={row.value < 0} data-bucket={row.label === 'Rojo' || row.label === 'Gris' ? row.label.toLowerCase() : undefined}><span className="story-mini-bar-label" title={row.label}>{row.label}</span><span className="story-mini-bar-track" aria-hidden="true"><span style={{ width: `${Math.max(Math.abs(row.value) / maximum * 100, row.value === 0 ? 0 : 3)}%` }} /></span><strong>{chartValue(row.value, chart.unit)}</strong></li>)}</ul>
    <ul className="sr-only">{chart.rows.map((row, index) => <li key={`${row.label}-${index}`}>{row.label}: {storyValue(row.value, chart.unit)}</li>)}</ul>
  </figure>;
  }
  const common = { data: shownRows, margin: { top: 4, right: mini && chart.kind === 'bars' ? 26 : 8, bottom: 0, left: 0 } };
  const tooltip = <Tooltip formatter={(value: number) => storyValue(value, chart.unit)} contentStyle={{ borderRadius: 8, fontSize: 12, background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }} />;
  return <figure className={mini ? "story-chart story-chart-mini" : "story-chart"} aria-label={chart.title}>
    <figcaption className={mini ? 'sr-only' : undefined}>{chart.title}{mini && chart.rows.length > shownRows.length && <span>{shownRows.length} de {chart.rows.length} · resto en detalle</span>}{(chart.unit === 'USD' || chart.unit === 'PYG') && <span>{chart.unit === 'USD' ? 'Dólares' : 'Guaraníes'}</span>}</figcaption>
    <div className="story-chart-canvas" style={{ height: mini ? 92 : chart.kind === 'bars' ? Math.max(250, chart.rows.length * 42) : 280 }} aria-hidden="true">
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
          <Bar dataKey="value" name={chart.currentLabel ?? 'Actual'} fill="var(--story-accent, #21835d)" radius={[3, 3, 3, 3]} background={mini ? { fill: 'var(--story-tint)' } : undefined} isAnimationActive={false}>{shownRows.map((row, index) => <Cell key={index} fill={row.label === 'Rojo' ? '#cc4242' : row.label === 'Gris' ? '#8792a0' : 'var(--story-accent, #21835d)'} />)}{mini && <LabelList dataKey="value" position="right" formatter={(value: number) => chartValue(value, chart.unit)} fontSize={12} fill="hsl(var(--muted-foreground))" />}</Bar>
          {comparison && !mini && <Bar dataKey="previous" name={chart.previousLabel ?? 'Anterior'} fill="#8293ad" radius={[0, 3, 3, 0]} isAnimationActive={false} />}
        </BarChart>}
      </ResponsiveContainer>
    </div>

    <ul className="sr-only">{chart.rows.map((row, i) => <li key={i}>{row.label}: {storyValue(row.value, chart.unit)}{row.previous !== undefined && `; ${chart.previousLabel ?? 'Anterior'}: ${storyValue(row.previous, chart.unit)}`}</li>)}</ul>
  </figure>;
}

function StoryComparisonChart({ current, previous, label, unit }: { current: number; previous: number; label: string; unit: StoryUnit }) {
  const maximum = Math.max(current, previous, 1);
  return <figure className="story-chart story-chart-mini story-comparison-chart" aria-label={`Comparación de ${label}`}>
    <figcaption className="sr-only">Anterior: {storyValue(previous, unit)}; actual: {storyValue(current, unit)}</figcaption>
    <div className="story-comparison-columns" aria-hidden="true">
      <div><span className="story-comparison-bar story-comparison-bar--previous" style={{ height: `${Math.max(previous / maximum * 80, 2)}px` }} /><small>Anterior</small></div>
      <div><span className="story-comparison-bar story-comparison-bar--current" style={{ height: `${Math.max(current / maximum * 80, 2)}px` }} /><small>Actual</small></div>
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

export function StoryPanel({ story, index, onRetry, retrying, visitChange = null, openSignal = 0 }: { story: PanoramaStory; index: number; onRetry: () => void; retrying: boolean; visitChange?: number | null; openSignal?: number }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (openSignal > 0) setOpen(true); }, [openSignal]);
  const titleId = `story-${story.id}`;
  const percentage = storySummaryPercentage(story);
  const breakdownGroups = [...new Set(story.breakdown.map(row => row.group ?? 'Desglose'))];
  return <article className="panorama-story" aria-labelledby={titleId} data-story={story.id}>
    <header className="story-header"><span className="story-index">{String(index + 1).padStart(2, '0')}</span><div className="story-heading-text"><h2 id={titleId}>{story.title}</h2></div>{story.status === 'empty' && <span className="story-empty-label">Sin datos</span>}</header>
    {story.status === 'error' ? <div role="alert"><p className="story-error">{story.message}</p><Button variant="outline" disabled={retrying} onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />{retrying ? 'Consultando…' : 'Reintentar fuente'}</Button></div> : <>
      <div className={`story-summary-metric${story.primary && storyValue(story.primary.value, story.primary.unit).length > 12 ? ' story-summary-metric--long' : ''}`}>
        <dl>{story.primary && <>
          <div className="story-datum story-datum-primary"><dt>{story.primary.label}</dt><dd data-long={storyValue(story.primary.value, story.primary.unit).length > 12}>{storyValue(story.primary.value, story.primary.unit)}</dd></div>
          <div className="story-datum story-datum-previous"><dt>{story.primary.comparison?.label ?? 'Sin comparación'}</dt><dd>{story.primary.comparison ? storyValue(story.primary.comparison.value, story.primary.unit) : '—'}</dd></div>
        </>}</dl>
        <div className="story-percentage" data-kind={percentage?.kind ?? 'missing'} data-direction={percentage?.kind === 'variation' ? 'neutral' : 'composition'}><strong>{percentage ? `${percentage.kind === 'variation' && percentage.value > 0 ? '+' : ''}${numbers.format(percentage.value)}%` : '—'}</strong><span>{percentage ? percentage.kind === 'variation' ? 'Variación' : percentage.label : 'Sin variación comparable'}</span></div>
      </div>
      {story.id === 'maquinas_proyeccion' && ['Stock calculado', 'Compras pendientes', 'Ventas pendientes'].every(label => story.supporting.some(item => item.label === label)) ? <ProjectionComponents story={story} /> : story.id === 'servicios_pendientes' && story.primary?.comparison && story.primary.value !== null && Number.isFinite(story.primary.value) && Number.isFinite(story.primary.comparison.value) && story.primary.value >= 0 && story.primary.comparison.value >= 0 ? <ResolutionComparison story={story} /> : story.chart && story.chart.rows.length > 0 ? <StoryChart chart={story.chart} mini /> : story.primary?.comparison && story.primary.value !== null && Number.isFinite(story.primary.value) && Number.isFinite(story.primary.comparison.value) && story.primary.value >= 0 && story.primary.comparison.value >= 0 ? <StoryComparisonChart current={story.primary.value} previous={story.primary.comparison.value} label={story.primary.label} unit={story.primary.unit} /> : <p className="story-no-chart">Sin gráfico comparable</p>}
      <Button ref={triggerRef} variant="outline" className="story-detail-trigger" aria-label={`Ver detalle de ${story.title}`} onClick={() => setOpen(true)}>Ver detalle <ArrowRight className="ml-2 h-4 w-4" /></Button>
      <ResponsiveDrawer open={open} onOpenChange={setOpen} size="xl" title={story.title} onCloseAutoFocus={event => { event.preventDefault(); triggerRef.current?.focus(); }}>
        <ResponsiveDrawerHeader><p className="text-sm text-muted-foreground">{story.scope}</p></ResponsiveDrawerHeader>
        <ResponsiveDrawerBody className="panorama-story-dialog space-y-5">
          <p className="story-conclusion">{story.message}</p>
          {!!story.notices?.length && <div className="story-notices" aria-label={story.id === 'repuestos_stock' ? 'Avisos preventivos' : 'Puntos para revisar'}>{story.notices.map((notice, i) => <Link key={i} to={notice.route}>{notice.text}<ArrowUpRight className="h-3 w-3 shrink-0" /></Link>)}</div>}
          {visitChange !== null && visitChange !== 0 && story.primary && <p className="story-visit-change">El total visible cambió {visitChange > 0 ? '+' : ''}{storyValue(visitChange, story.primary.unit)} desde tu última visita en este navegador.</p>}
          <dl className="story-detail-metrics">{story.primary && <Datum datum={story.primary} primary />}{story.supporting.map((datum, i) => <Datum key={i} datum={datum} />)}</dl>
          {story.id === 'ventas_facturacion' && story.primary?.value !== null && story.primary?.value !== undefined && story.supporting.some(item => item.label === 'Ventas antes de NC del mes') && <BillingBridge story={story} />}
          {story.chart && story.chart.rows.length > 0 && <StoryChart chart={story.chart} />}
          {breakdownGroups.map(group => <section key={group} aria-label={group}><h3 className="story-detail-heading">{group}</h3><dl className="story-breakdown">{story.breakdown.filter(row => (row.group ?? 'Desglose') === group).map((row, i) => <div key={i}><dt>{row.route ? <Link to={row.route}>{row.label}<ArrowUpRight className="inline ml-1 h-3 w-3" /></Link> : row.label}{row.note && <small>{row.note}</small>}</dt><dd>{storyValue(row.value, row.unit)}</dd></div>)}</dl></section>)}
          <details className="story-method"><summary>Fuente, corte y metodología</summary><p>Período: {story.periodLabel}{story.cutoff && ` · Corte: ${dateLabel(story.cutoff)}`}</p><ul>{story.details.map((detail, i) => <li key={i}>{detail}</li>)}</ul><p>Fuente: {story.source}</p></details>
        </ResponsiveDrawerBody>
        {story.route && <ResponsiveDrawerFooter><Button asChild variant="outline"><Link to={story.route}>Abrir {story.title.toLowerCase()}<ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button></ResponsiveDrawerFooter>}
      </ResponsiveDrawer>
    </>}
  </article>;
}

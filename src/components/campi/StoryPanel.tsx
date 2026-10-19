import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { storySummaryPercentage } from '@/lib/campi/storySummary';
import type { PanoramaStory, StoryDatum, StoryUnit } from '@/lib/campi/panoramaStoryTypes';

const numbers = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 1 });
const storyValue = (value: number | null, unit: StoryUnit) => value === null || !Number.isFinite(value) ? '—' : `${unit === 'USD' ? '$ ' : unit === 'PYG' ? '₲ ' : ''}${numbers.format(value)}${unit === 'percent' ? '%' : unit === 'days' ? ' días' : ''}`;
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
    <ul>{shownRows.map((row, index) => <li key={`${row.label}-${index}`} data-negative={row.value < 0}><span className="story-mini-bar-label" title={row.label}>{row.label}</span><span className="story-mini-bar-track" aria-hidden="true"><span style={{ width: `${Math.max(Math.abs(row.value) / maximum * 100, row.value === 0 ? 0 : 3)}%` }} /></span><strong>{compact.format(row.value)}</strong></li>)}</ul>
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
          <YAxis tickFormatter={value => compact.format(Number(value))} width={52} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          {tooltip}{!mini && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />}
          <Line type="linear" dataKey="value" name={chart.currentLabel ?? 'Actual'} stroke="var(--story-accent, #21835d)" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
          {comparison && !mini && <Line type="linear" dataKey="previous" name={chart.previousLabel ?? 'Anterior'} stroke="#8293ad" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />}
        </LineChart> : <BarChart {...common} layout="vertical" barSize={16}>
          {!mini && <CartesianGrid strokeDasharray="3 5" horizontal={false} stroke="hsl(var(--border))" />}
          <XAxis hide={mini} type="number" tickFormatter={value => compact.format(Number(value))} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={mini ? 105 : 125} tick={{ fontSize: mini ? 12 : 11 }} axisLine={false} tickLine={false} />
          {tooltip}{comparison && !mini && <Legend wrapperStyle={{ fontSize: 12 }} />}
          <Bar dataKey="value" name={chart.currentLabel ?? 'Actual'} fill="var(--story-accent, #21835d)" radius={[3, 3, 3, 3]} background={mini ? { fill: 'var(--story-tint)' } : undefined} isAnimationActive={false}>{mini && <LabelList dataKey="value" position="right" formatter={(value: number) => compact.format(value)} fontSize={12} fill="hsl(var(--muted-foreground))" />}</Bar>
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

export function StoryPanel({ story, index, onRetry, retrying, visitChange = null }: { story: PanoramaStory; index: number; onRetry: () => void; retrying: boolean; visitChange?: number | null }) {
  const titleId = `story-${story.id}`;
  const percentage = storySummaryPercentage(story);
  return <article className="panorama-story" aria-labelledby={titleId} data-story={story.id}>
    <header className="story-header"><span className="story-index">{String(index + 1).padStart(2, '0')}</span><div className="story-heading-text"><h2 id={titleId}>{story.title}</h2></div><span className="story-period">{story.periodLabel}</span></header>
    {story.status === 'error' ? <div role="alert"><p className="story-error">{story.message}</p><Button variant="outline" disabled={retrying} onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />{retrying ? 'Consultando…' : 'Reintentar fuente'}</Button></div> : <>
      <div className={`story-summary-metric${story.primary && storyValue(story.primary.value, story.primary.unit).length > 12 ? ' story-summary-metric--long' : ''}`}>
        <dl>{story.primary && <>
          <div className="story-datum story-datum-primary"><dt>{story.primary.label}</dt><dd data-long={storyValue(story.primary.value, story.primary.unit).length > 12}>{storyValue(story.primary.value, story.primary.unit)}</dd></div>
          {story.primary.comparison && <div className="story-datum story-datum-previous"><dt>{story.primary.comparison.label}</dt><dd>{storyValue(story.primary.comparison.value, story.primary.unit)}</dd></div>}
        </>}</dl>
        {percentage && <div className="story-percentage" data-kind={percentage.kind} data-direction={percentage.value < 0 ? 'down' : 'up'}><strong>{percentage.kind === 'variation' && percentage.value > 0 ? '+' : ''}{numbers.format(percentage.value)}%</strong><span>{percentage.kind === 'variation' ? 'Variación' : percentage.label}</span></div>}
      </div>
      {story.id === 'maquinas_proyeccion' && ['Stock calculado', 'Compras pendientes', 'Ventas pendientes'].every(label => story.supporting.some(item => item.label === label)) ? <ProjectionComponents story={story} /> : story.primary?.comparison && story.primary.value !== null && Number.isFinite(story.primary.value) && Number.isFinite(story.primary.comparison.value) && story.primary.value >= 0 && story.primary.comparison.value >= 0 ? <StoryComparisonChart current={story.primary.value} previous={story.primary.comparison.value} label={story.primary.label} unit={story.primary.unit} /> : story.chart && story.chart.rows.length > 0 ? <StoryChart chart={story.chart} mini /> : <p className="story-no-chart">{story.message}</p>}
      <Dialog><DialogTrigger asChild><Button variant="outline" className="story-detail-trigger" aria-label={`Ver detalle de ${story.title}`}>Ver detalle <ArrowRight className="ml-2 h-4 w-4" /></Button></DialogTrigger>
        <DialogContent className="panorama-story-dialog"><DialogHeader><DialogTitle>{story.question}</DialogTitle><DialogDescription>{story.scope} · {story.periodLabel}{story.cutoff && ` · Corte: ${dateLabel(story.cutoff)}`}</DialogDescription></DialogHeader>
          <p className="story-conclusion">{story.message}</p>
          {visitChange !== null && story.primary && <p className="story-visit-change">El total visible cambió {visitChange > 0 ? '+' : ''}{storyValue(visitChange, story.primary.unit)} desde tu última visita en este navegador.</p>}
          <dl className="story-detail-metrics">{story.primary && <Datum datum={story.primary} primary />}{story.supporting.map((datum, i) => <Datum key={i} datum={datum} />)}</dl>
          {story.chart && story.chart.rows.length > 0 && <StoryChart chart={story.chart} />}
          {story.breakdown.length > 0 && <section aria-label="Desglose"><h3 className="story-detail-heading">Desglose</h3><dl className="story-breakdown">{story.breakdown.map((row, i) => <div key={i}><dt>{row.route ? <Link to={row.route}>{row.label}<ArrowUpRight className="inline ml-1 h-3 w-3" /></Link> : row.label}{row.note && <small>{row.note}</small>}</dt><dd>{storyValue(row.value, row.unit)}</dd></div>)}</dl></section>}
          <section className="story-method"><h3 className="story-detail-heading">Cómo leer estos datos</h3><ul>{story.details.map((detail, i) => <li key={i}>{detail}</li>)}</ul><p>Fuente: {story.source}</p></section>
          {story.route && <Button asChild variant="outline"><Link to={story.route}>Abrir {story.title.toLowerCase()}<ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button>}
        </DialogContent>
      </Dialog>
    </>}
  </article>;
}

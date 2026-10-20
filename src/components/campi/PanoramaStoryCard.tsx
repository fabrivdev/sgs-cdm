import { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { PanoramaStory, StoryUnit } from '@/lib/campi/panoramaStoryTypes';
import { storyDestinations } from '@/lib/campi/storyNavigation';
import { storySummaryPercentage } from '@/lib/campi/storySummary';

const number = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 1 });
const valueLabel = (value: number | null, unit: StoryUnit) => value === null || !Number.isFinite(value) ? '—'
  : `${value < 0 ? '−' : ''}${unit === 'USD' ? '$ ' : unit === 'PYG' ? '₲ ' : ''}${(unit === 'USD' || unit === 'PYG' ? integer : number).format(Math.abs(value))}${unit === 'percent' ? '%' : unit === 'days' ? ' días' : ''}`;

export function PanoramaStoryCard({ story, index, retrying, onRetry, openSignal = 0, onSelectorOpenChange }: {
  story: PanoramaStory; index: number; retrying: boolean; onRetry: () => void; openSignal?: number;
  onSelectorOpenChange?: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const destinations = storyDestinations(story);
  const percentage = storySummaryPercentage(story);
  useEffect(() => {
    if (!openSignal || !destinations.length) return;
    if (destinations.length === 1) void navigate(destinations[0].route);
    else setSelectorOpen(true);
  // A new signal represents an explicit user action from Campi.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);
  useEffect(() => { onSelectorOpenChange?.(selectorOpen); }, [selectorOpen, onSelectorOpenChange]);
  const action = destinations.length > 1
    ? <DropdownMenu open={selectorOpen} onOpenChange={setSelectorOpen}><DropdownMenuTrigger asChild><Button variant="outline" className="story-detail-trigger" aria-label={`Ver detalle de ${story.title}`}>Ver detalle<ArrowRight className="ml-2 h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{destinations.map(destination => <DropdownMenuItem key={destination.route} asChild><Link to={destination.route}>{destination.label}</Link></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
    : destinations.length === 1 ? <Button variant="outline" asChild className="story-detail-trigger"><Link to={destinations[0].route} aria-label={`Ver detalle de ${story.title}`}>Ver detalle<ArrowRight className="ml-2 h-4 w-4" /></Link></Button> : null;
  const chartRows = story.chart?.rows.slice(0, story.chart.kind === 'trend' ? 12 : 4) ?? [];
  const maximum = Math.max(1, ...chartRows.map(row => Math.abs(row.value)));
  return <article className="panorama-story" aria-labelledby={`story-${story.id}`} data-story={story.id}>
    <header className="story-header"><span className="story-index">{String(index + 1).padStart(2, '0')}</span><div className="story-heading-text"><h2 id={`story-${story.id}`}>{story.title}</h2></div>{story.status === 'empty' && <span className="story-empty-label">Sin datos</span>}</header>
    {story.status === 'error' ? <div role="alert"><p className="story-error">{story.message}</p><Button variant="outline" disabled={retrying} onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />{retrying ? 'Consultando…' : 'Reintentar fuente'}</Button></div> : <>
      <div className={`story-summary-metric${story.primary && valueLabel(story.primary.value, story.primary.unit).length > 12 ? ' story-summary-metric--long' : ''}`}><dl>{story.primary && <><div className="story-datum story-datum-primary"><dt>{story.primary.label}</dt><dd data-long={valueLabel(story.primary.value, story.primary.unit).length > 12}>{valueLabel(story.primary.value, story.primary.unit)}</dd></div>{story.primary.comparison && <div className="story-datum story-datum-previous"><dt>LY</dt><dd>{valueLabel(story.primary.comparison.value, story.primary.unit)}</dd></div>}</>}</dl>{percentage && <div className="story-percentage" data-kind={percentage.kind} data-direction="neutral"><strong>{percentage.kind === 'variation' && percentage.value > 0 ? '+' : ''}{number.format(percentage.value)}%</strong><span>{percentage.kind === 'variation' ? 'vs LY' : percentage.label}</span></div>}</div>
      {story.primary?.note && <p className="text-xs text-muted-foreground col-span-full">{story.primary.note}</p>}
      {story.id === 'ventas_facturacion' && story.primary?.value !== null && story.supporting.some(item => item.label === 'Ventas antes de NC del mes') ? <div className="story-billing-bridge" aria-label="Conciliación de facturación">{[
        { label: 'Ventas', value: story.supporting.find(item => item.label === 'Ventas antes de NC del mes')?.value },
        { label: 'NC', value: story.supporting.find(item => item.label === 'Notas de crédito del mes')?.value },
        { label: 'Neto', value: story.primary?.value },
      ].filter(item => item.value !== null && item.value !== undefined).map(item => <div className="story-billing-row" key={item.label}><span>{item.label}</span><span className="story-billing-track"><span className={`story-billing-bar${item.label === 'NC' ? ' story-billing-bar--credit' : item.label === 'Neto' ? ' story-billing-bar--net' : ''}`} style={{ width: `${Math.abs(item.value!) / Math.max(1, ...story.supporting.map(datum => Math.abs(datum.value ?? 0))) * 100}%` }} /></span><strong>{valueLabel(item.value!, 'USD')}</strong></div>)}</div>
        : chartRows.length > 0 && story.chart?.kind === 'trend' ? <figure className="story-chart story-chart-mini" aria-label={story.chart.title}><figcaption className="sr-only">{story.chart.title}</figcaption><div className="story-chart-canvas" style={{ height: 92 }} aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}><XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value: number) => valueLabel(value, story.chart!.unit)} /><Line type="linear" dataKey="value" stroke="var(--story-accent, #21835d)" strokeWidth={2} dot={false} isAnimationActive={false} />{chartRows.some(row => row.previous !== undefined) && <Line type="linear" dataKey="previous" stroke="#8293ad" strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer></div><ul className="sr-only">{chartRows.map(row => <li key={row.label}>{row.label}: {valueLabel(row.value, story.chart!.unit)}{row.previous === undefined ? '' : `; LY: ${valueLabel(row.previous, story.chart!.unit)}`}</li>)}</ul></figure>
        : chartRows.length > 0 ? <figure className="story-chart story-chart-mini story-mini-bars" aria-label={story.chart!.title}><figcaption className="sr-only">{story.chart!.title}</figcaption><ul>{chartRows.map(row => <li key={row.label} data-negative={row.value < 0} data-bucket={row.label === 'Rojo' || row.label === 'Gris' ? row.label.toLowerCase() : undefined}><span className="story-mini-bar-label" title={row.label}>{row.label}</span><span className="story-mini-bar-track" aria-hidden="true"><span style={{ width: `${Math.abs(row.value) / maximum * 100}%` }} /></span><strong>{story.chart!.unit === 'USD' ? `$ ${compact.format(row.value)}` : number.format(row.value)}</strong></li>)}</ul></figure> : null}
      {action}
    </>}
  </article>;
}

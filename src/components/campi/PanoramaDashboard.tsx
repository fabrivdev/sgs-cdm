import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, ChartNoAxesCombined, Package, Settings2, Sparkles, Tractor } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell, Panel } from '@/components/layout/AppPrimitives';
import { SECTION_ROUTES, type SectionKey } from '@/lib/permissions';
import { loadPanoramaData, sourceSectionsForTopics, type PanoramaMetric } from '@/lib/campi/panoramaData';
import { panoramaSessionId, previousPanoramaVisit, recordPanoramaVisit } from '@/lib/campi/panoramaVisits';
import type { PanoramaTopic, PanoramaTopicId } from '@/lib/campi/panoramaPreferences';
import { CampiPanoramaAvatar } from './CampiPanoramaAvatar';
import './panorama-dashboard.css';

const numberFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};
const money = (value: number, unit: PanoramaMetric['unit']) => (unit === 'USD' ? 'USD ' : unit === 'PYG' ? '₲ ' : '') + numberFormat.format(value);
const iconFor = (id: string) => id.startsWith('parque.') ? Tractor : id.includes('stock') ? Package : ChartNoAxesCombined;

export function PanoramaDashboard({ userId, topics, available, hasAccess, onEdit }: {
  userId: string;
  topics: readonly PanoramaTopicId[];
  available: readonly PanoramaTopic[];
  hasAccess: (section: SectionKey) => boolean;
  onEdit: () => void;
}) {
  const cutoff = useMemo(today, []);
  const sessionId = useMemo(() => panoramaSessionId(userId), [userId]);
  const granted = sourceSectionsForTopics(topics, hasAccess);
  const previous = useQuery({ queryKey: ['campi-panorama-previous', userId, sessionId],
    queryFn: () => previousPanoramaVisit(userId, sessionId), retry: false, enabled: Boolean(userId) });
  const report = useQuery({ queryKey: ['campi-panorama-data', userId, topics.join('|'), granted.join('|'), cutoff],
    queryFn: () => loadPanoramaData(topics, granted, cutoff), retry: false, enabled: Boolean(userId), staleTime: 60_000 });
  const recorded = useRef(false);
  const results = report.data ?? [];
  const metrics = results.flatMap(result => result.metrics).filter(metric => hasAccess(metric.section));
  const failed = results.some(result => result.error);
  useEffect(() => {
    if (recorded.current || !report.isSuccess || !previous.isSuccess || failed || !metrics.length) return;
    recorded.current = true;
    void recordPanoramaVisit(userId, sessionId, metrics).catch(() => { recorded.current = false; });
  }, [report.isSuccess, previous.isSuccess, failed, metrics, userId, sessionId]);

  const catalog = new Map(available.map(topic => [topic.id, topic]));
  const ordered = topics.flatMap(id => metrics.filter(metric => metric.topic === id));
  const headline = topics.map(id => ordered.find(metric => metric.topic === id)).filter((item): item is PanoramaMetric => Boolean(item)).slice(0, 3);
  const remaining = ordered.filter(metric => !headline.some(item => item.id === metric.id));
  const insight = results.flatMap(result => result.insights ?? []).find(item => item.id === 'repuestos.stock_antiguo' && item.value > 0);
  const focus = topics.map(id => catalog.get(id)).filter((item): item is PanoramaTopic => Boolean(item));
  const moreRoutes = focus.filter(topic => !ordered.some(metric => metric.topic === topic.id)).map(topic => {
    const section = topic.sections.find(hasAccess);
    return section ? { id: topic.id, label: topic.label, route: SECTION_ROUTES.find(item => item.id === section)?.route } : null;
  }).filter((item): item is { id: PanoramaTopicId; label: string; route: string | undefined } => item !== null).slice(0, 4);

  return <PageShell className="panorama-dashboard max-w-[1440px] space-y-4">
    <PageHeader title="Panorama" actions={<div className="flex items-center gap-3"><span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:inline-flex"><CalendarDays className="h-3.5 w-3.5" />Datos al {dateFormat.format(new Date(cutoff + 'T12:00:00'))}</span><Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="mr-2 h-4 w-4" />Editar prioridades</Button></div>} />
    <Panel className="panorama-hero">
      <div className="panorama-hero-avatar"><CampiPanoramaAvatar /></div>
      <div className="panorama-hero-message">
        <span className="panorama-hero-kicker"><Sparkles className="h-4 w-4" />Campi</span>
        <div className="panorama-speech">
          <h2>{report.isLoading ? 'Estoy reuniendo tus datos.' : insight ? 'Encontré un grupo de repuestos que conviene revisar.' : metrics.length ? 'Ya está lista la lectura de tus temas.' : 'Estoy revisando los temas que elegiste.'}</h2>
          {failed && <p>Una fuente no respondió por ahora.</p>}
        </div>
      </div>
      <div className="panorama-focus">
        <div className="panorama-focus-head"><h3>Tu enfoque</h3><button type="button" onClick={onEdit}>Editar</button></div>
        <ol>{focus.slice(0, 4).map((topic, index) => <li key={topic.id}><span>{index + 1}</span><b title={topic.label}>{topic.label}</b></li>)}</ol>
        {focus.length > 4 && <button type="button" className="panorama-focus-more" onClick={onEdit}>Ver las {focus.length} prioridades <ArrowRight className="h-3 w-3" /></button>}
      </div>
    </Panel>
    {report.isError && <div role="alert" className="rounded-lg border border-destructive/30 px-4 py-3 text-sm">No se pudo cargar Panorama. Reintentá la consulta.</div>}
    {report.isLoading && <div role="status" className="rounded-lg border px-4 py-3 text-sm">Cargando indicadores…</div>}
    <section aria-labelledby="panorama-lectura-title" className="space-y-2">
      <h2 id="panorama-lectura-title" className="panorama-section-title">Lectura rápida</h2>
      <div className="panorama-kpi-grid">
        {headline.map(metric => {
          const Icon = iconFor(metric.id);
          return <Link key={metric.id} to={metric.route} className="panorama-kpi" aria-label={'Abrir ' + metric.label}>
            <span className="panorama-kpi-icon"><Icon className="h-5 w-5" /></span>
            <span className="panorama-kpi-body"><span className="panorama-kpi-label">{metric.label}</span><strong>{money(metric.value, metric.unit)}</strong><small>{metric.scope} · {metric.period === 'stock' ? 'Stock actual' : metric.period}</small></span>
            <span className="panorama-kpi-action">Ver detalle <ArrowRight className="h-4 w-4" /></span>
          </Link>;
        })}
        {report.isSuccess && !headline.length && <Panel className="col-span-full text-[13px] text-muted-foreground">No hay indicadores consolidados para los temas elegidos.</Panel>}
      </div>
    </section>
    {!report.isLoading && <section aria-labelledby="panorama-seguimiento-title" className="space-y-2">
      <h2 id="panorama-seguimiento-title" className="panorama-section-title">En seguimiento</h2>
      <div className="panorama-follow-grid">
        <Panel className="panorama-insight">
          {insight ? <>
            <div className="panorama-insight-title"><span className="panorama-insight-icon"><Package className="h-5 w-5" /></span><h3>Antigüedad del stock de repuestos</h3></div>
            <p>{insight.title}</p>
            <div className="panorama-insight-numbers"><strong>{money(insight.value, insight.unit)}</strong><span>{numberFormat.format(insight.count)} códigos · {numberFormat.format(insight.value / insight.total * 100)}% del valor Kardex referencial</span></div>
            <div className="panorama-insight-track" role="img" aria-label={numberFormat.format(insight.value / insight.total * 100) + ' por ciento del valor Kardex referencial'}><span style={{ width: Math.max(0, Math.min(100, insight.value / insight.total * 100)) + '%' }} /></div>
            <Link to={insight.route} className="panorama-text-link">Explorar en Análisis de repuestos <ArrowRight className="h-4 w-4" /></Link>
          </> : <>
            <div className="panorama-insight-title"><span className="panorama-insight-icon"><ChartNoAxesCombined className="h-5 w-5" /></span><h3>Información disponible</h3></div>
            <p>{failed ? 'Hay una fuente sin datos en este momento.' : 'Todavía no hay un hallazgo comparable confirmado para los temas priorizados.'}</p>
          </>}
        </Panel>
        <Panel className="panorama-continue">
          <h3>Seguí explorando</h3>
          <div className="panorama-continue-list">
            {remaining.slice(0, 3).map(metric => <Link key={metric.id} to={metric.route}><span>{metric.label}</span><strong>{money(metric.value, metric.unit)}</strong><ArrowRight className="h-4 w-4" /></Link>)}
            {moreRoutes.map(item => item.route && <Link key={item.id} to={item.route}><span>{item.label}</span><ArrowRight className="h-4 w-4" /></Link>)}
            {!remaining.length && !moreRoutes.length && <span className="text-[13px] text-muted-foreground">Tus indicadores principales están arriba.</span>}
          </div>
        </Panel>
      </div>
    </section>}
  </PageShell>;
}

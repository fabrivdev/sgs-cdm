import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Settings2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell, Panel } from '@/components/layout/AppPrimitives';
import { SECTION_ROUTES, type SectionKey } from '@/lib/permissions';
import { loadPanoramaData, sourceSectionsForTopics, type PanoramaMetric } from '@/lib/campi/panoramaData';
import { metricChange, panoramaSessionId, previousPanoramaVisit, recordPanoramaVisit } from '@/lib/campi/panoramaVisits';
import type { PanoramaTopic, PanoramaTopicId } from '@/lib/campi/panoramaPreferences';
import { CampiPanoramaAvatar } from './CampiPanoramaAvatar';

const valueFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const formatValue = (value: number, unit: PanoramaMetric['unit']) => `${unit === 'unidades' ? '' : unit === 'USD' ? 'USD ' : '₲ '}${valueFormat.format(value)}`;

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
  const key = granted.join('|');
  const previous = useQuery({ queryKey: ['campi-panorama-previous', userId, sessionId],
    queryFn: () => previousPanoramaVisit(userId, sessionId), retry: false, enabled: Boolean(userId) });
  const report = useQuery({ queryKey: ['campi-panorama-data', userId, topics.join('|'), key, cutoff],
    queryFn: () => loadPanoramaData(topics, granted, cutoff), retry: false, enabled: Boolean(userId), staleTime: 60_000 });
  const recorded = useRef(false);
  const results = report.data ?? [];
  const metrics = results.flatMap(result => result.metrics);
  const failed = results.some(result => result.error);
  useEffect(() => {
    if (recorded.current || !report.isSuccess || !previous.isSuccess || failed || !metrics.length) return;
    recorded.current = true;
    void recordPanoramaVisit(userId, sessionId, metrics).catch(() => { recorded.current = false; });
  }, [report.isSuccess, previous.isSuccess, failed, metrics, userId, sessionId]);
  const catalog = new Map(available.map(topic => [topic.id, topic]));
  const comparable = metrics.map(metric => metricChange(metric, previous.data ?? null)).filter((change): change is number => change !== null);
  const changeCount = comparable.filter(change => change !== 0).length;

  return <PageShell className="max-w-[1440px] space-y-4">
    <div className="flex items-center gap-5"><PageHeader title="Panorama" /><Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="mr-2 h-4 w-4" />Editar prioridades</Button></div>
    <Panel className="relative isolate min-h-[170px] overflow-visible border-primary/15 bg-gradient-to-r from-emerald-50/70 via-background to-primary/5 px-6 py-5 lg:px-8">
      <div className="relative z-10 max-w-[65%] space-y-3 lg:py-3">
        <h2 className="text-[23px] font-semibold tracking-tight">Tu panorama</h2>
        <p className="text-[15px] leading-6">{previous.data && changeCount ? `${changeCount} indicadores cambiaron desde tu última visita.` : previous.data && comparable.length ? 'Sin cambios en los indicadores comparables.' : previous.data ? 'Todavía no hay indicadores comparables con tu última visita.' : 'Tus temas priorizados, con datos verificables.'}</p>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><CalendarDays className="h-4 w-4" />Datos consultados al {dateFormat.format(new Date(`${cutoff}T12:00:00`))}{previous.data ? ` · Última visita: ${dateFormat.format(new Date(previous.data.captured_at))}` : ''}</div>
      </div>
      <div className="absolute bottom-0 right-7 z-20 hidden h-[190px] w-[190px] lg:block"><CampiPanoramaAvatar /></div>
    </Panel>
    {previous.isError && <div role="status" className="rounded-lg border px-4 py-2 text-[12px]">No está disponible la comparación con la última visita.</div>}
    {report.isLoading && <div role="status" className="rounded-lg border px-4 py-8 text-center text-sm">Cargando indicadores…</div>}
    {report.isError && <div role="alert" className="rounded-lg border border-destructive/30 px-4 py-3 text-sm">No se pudo cargar Panorama. Reintentá la consulta.</div>}
    <div className="grid items-start gap-4 lg:grid-cols-3">
      {topics.map((id, index) => {
        const topic = catalog.get(id);
        if (!topic) return null;
        const topicMetrics = metrics.filter(metric => metric.topic === id && hasAccess(metric.section));
        const permitted = topic.sections.filter(hasAccess);
        const detail = SECTION_ROUTES.find(route => permitted.includes(route.id))?.route;
        const sourceError = results.find(result => permitted.includes(result.section) && result.error)?.error;
        return <Panel key={id} className="min-w-0 space-y-3">
          <div className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{index + 1}</span><h2 className="min-w-0 truncate text-[14px] font-semibold" title={topic.label}>{topic.label}</h2></div>
          {topicMetrics.length ? <div className="space-y-3">{topicMetrics.map(metric => {
            const change = metricChange(metric, previous.data ?? null);
            return <div key={metric.id} className="border-t pt-2">
              <Link to={metric.route} className="inline-flex max-w-full items-center gap-1 text-[12px] text-primary hover:underline" title={`Abrir ${metric.label}`}><span className="truncate">{metric.label}</span><ArrowRight className="h-3 w-3 shrink-0" /></Link>
              <div className="truncate text-[21px] font-semibold tabular-nums" title={formatValue(metric.value, metric.unit)}>{formatValue(metric.value, metric.unit)}</div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{metric.scope} · {metric.period === 'stock' ? 'Stock actual' : metric.period}</span>{change !== null && <span className="tabular-nums">{change > 0 ? '+' : ''}{formatValue(change, metric.unit)} desde última visita</span>}</div>
            </div>;
          })}</div> : <div className="border-t pt-3 text-[12px] text-muted-foreground">{sourceError ? 'Fuente no disponible' : report.isLoading ? 'Cargando…' : 'Sin indicador consolidado'}</div>}
          {!topicMetrics.length && detail && <Link to={detail} className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline">Ver detalle<ArrowRight className="h-3.5 w-3.5" /></Link>}
        </Panel>;
      })}
    </div>
  </PageShell>;
}

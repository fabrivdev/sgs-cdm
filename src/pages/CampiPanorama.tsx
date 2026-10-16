import { useMemo, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, BarChart3, Boxes, CalendarDays, CarFront, Check, ClipboardList, HandCoins, Lightbulb, ListChecks, Package, Plus, Search, Ship, ShoppingCart, Tractor, Users, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell, Panel } from '@/components/layout/AppPrimitives';
import { CampiPanoramaAvatar } from '@/components/campi/CampiPanoramaAvatar';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  availablePanoramaTopics,
  MAX_PANORAMA_PRIORITIES,
  readPanoramaPreferences,
  reconcilePanoramaOrder,
  savePanoramaPreferences,
  type PanoramaTopicGroup,
  type PanoramaTopicId,
} from '@/lib/campi/panoramaPreferences';

const GROUPS: readonly PanoramaTopicGroup[] = ['Ventas', 'Servicios', 'Parque', 'Repuestos'];
const topicIcons: Record<PanoramaTopicId, typeof BarChart3> = {
  'servicios.ventas': BarChart3,
  'servicios.planificador': ListChecks,
  'servicios.trabajos': Wrench,
  'servicios.calendario': CalendarDays,
  'servicios.ordenes': ClipboardList,
  'servicios.flota': CarFront,
  'servicios.comisiones': HandCoins,
  'parque.ventas': BarChart3,
  'parque.clientes': Users,
  'parque.maquinas': Tractor,
  'parque.stock': Package,
  'parque.stock_proyectado': Boxes,
  'parque.operaciones': ClipboardList,
  'parque.importaciones': Ship,
  'repuestos.ventas': BarChart3,
  'repuestos.stock': Package,
  'repuestos.analisis': Activity,
  'repuestos.compras': ShoppingCart,
  'repuestos.sugerencias': Lightbulb,
};
const groupTone: Record<PanoramaTopicGroup, string> = {
  Ventas: 'bg-emerald-50 text-emerald-700',
  Servicios: 'bg-amber-50 text-amber-700',
  Parque: 'bg-blue-50 text-blue-700',
  Repuestos: 'bg-orange-50 text-orange-700',
};
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export default function CampiPanorama() {
  const { user, isAdmin, hasModuloAccess, hasSectionAccess } = useAuth();
  const userId = user?.id ?? '';
  const available = useMemo(
    () => availablePanoramaTopics(hasModuloAccess, hasSectionAccess, isAdmin),
    [hasModuloAccess, hasSectionAccess, isAdmin],
  );
  const [saved, setSaved] = useState<PanoramaTopicId[] | null>(() => readPanoramaPreferences(userId));
  const [draft, setDraft] = useState<PanoramaTopicId[]>(() => reconcilePanoramaOrder(readPanoramaPreferences(userId), available));
  const [search, setSearch] = useState('');
  const selected = reconcilePanoramaOrder(draft, available);
  const persisted = reconcilePanoramaOrder(saved, available);
  const changed = saved === null || selected.join('|') !== persisted.join('|');
  const topicById = new Map(available.map(topic => [topic.id, topic]));
  const query = normalize(search.trim());
  const visible = available.filter(topic => !query || normalize(`${topic.label} ${topic.group}`).includes(query));

  const toggle = (id: PanoramaTopicId) => {
    setDraft(current => {
      const permitted = reconcilePanoramaOrder(current, available);
      return permitted.includes(id)
        ? permitted.filter(item => item !== id)
        : permitted.length < MAX_PANORAMA_PRIORITIES ? [...permitted, id] : permitted;
    });
  };
  const move = (index: number, offset: -1 | 1) => {
    const next = [...selected];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setDraft(next);
  };
  const save = () => {
    savePanoramaPreferences(userId, selected);
    setSaved(selected);
  };

  return <PageShell className="max-w-[1440px] space-y-4">
    <PageHeader title="Panorama" />
    <Panel className="grid min-h-[250px] items-center gap-4 overflow-hidden border-primary/15 bg-gradient-to-r from-emerald-50/70 via-background to-primary/5 px-5 py-3 lg:grid-cols-[minmax(0,1fr)_240px_250px] lg:px-8">
      <div className="space-y-2">
        <h2 className="text-[28px] font-semibold tracking-tight">Hola, soy Campi</h2>
        <p className="max-w-lg text-[16px] leading-7 text-foreground/85">Te ayudaré a ver qué cambió y qué necesita atención, con información verificada.</p>
      </div>
      <div className="mx-auto h-[220px] w-[220px] shrink-0 lg:mx-0"><CampiPanoramaAvatar /></div>
      <div className="relative hidden rounded-2xl border bg-card px-5 py-5 text-[16px] font-semibold shadow-sm before:absolute before:-left-[9px] before:top-[calc(50%-8px)] before:h-4 before:w-4 before:rotate-45 before:border-b before:border-l before:bg-card lg:block">Empecemos por tus prioridades.</div>
    </Panel>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(330px,0.8fr)]">
      <Panel className="min-w-0 space-y-3">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Temas de interés</h2>
          <span className="text-[12px] tabular-nums text-muted-foreground">{available.length} disponibles</span>
        </div>
        <label className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">Buscar tema</span>
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar tema"
            className="h-full w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" />
        </label>
        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1" aria-label="Temas disponibles">
          {GROUPS.map(group => {
            const topics = visible.filter(topic => topic.group === group);
            if (!topics.length) return null;
            return <section key={group} aria-label={group} className="space-y-1.5">
              <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
              {topics.map(topic => {
                const index = selected.indexOf(topic.id);
                const active = index >= 0;
                const Icon = topicIcons[topic.id];
                return <button key={topic.id} type="button" onClick={() => toggle(topic.id)}
                  disabled={!active && selected.length >= MAX_PANORAMA_PRIORITIES}
                  aria-pressed={active}
                  className={cn('flex min-h-[54px] w-full items-center gap-3 rounded-lg border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'border-primary/35 bg-primary/5' : 'bg-card hover:bg-accent',
                    !active && selected.length >= MAX_PANORAMA_PRIORITIES && 'cursor-not-allowed opacity-55')}>
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', groupTone[group])}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{topic.label}</span>
                  <span className={cn('flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold', active ? 'bg-primary text-primary-foreground' : 'border text-muted-foreground')}>
                    {active ? index + 1 : <Plus className="h-4 w-4" />}
                  </span>
                </button>;
              })}
            </section>;
          })}
          {!visible.length && <div className="px-2 py-6 text-center text-[13px] text-muted-foreground">No hay temas para esa búsqueda.</div>}
        </div>
      </Panel>
      <Panel className="space-y-3 lg:sticky lg:top-3">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Tu enfoque</h2>
          <span className="text-[12px] tabular-nums text-muted-foreground">{selected.length} de {MAX_PANORAMA_PRIORITIES}</span>
        </div>
        <ol className="min-h-[172px] divide-y rounded-lg border">
          {selected.map((id, index) => {
            const topic = topicById.get(id);
            if (!topic) return null;
            return <li key={id} className="flex min-h-[57px] items-center gap-2 px-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{topic.label}</span>
              <button type="button" className="rounded p-1.5 hover:bg-accent disabled:opacity-30" aria-label={`Subir ${topic.label}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" className="rounded p-1.5 hover:bg-accent disabled:opacity-30" aria-label={`Bajar ${topic.label}`} disabled={index === selected.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" className="rounded p-1.5 hover:bg-accent" aria-label={`Quitar ${topic.label}`} onClick={() => toggle(id)}><X className="h-3.5 w-3.5" /></button>
            </li>;
          })}
          {Array.from({ length: MAX_PANORAMA_PRIORITIES - selected.length }, (_, offset) => selected.length + offset + 1).map(number =>
            <li key={`empty-${number}`} className="flex min-h-[57px] items-center gap-3 px-2.5" aria-label={`Prioridad ${number} sin seleccionar`}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed text-[11px] font-semibold text-muted-foreground">{number}</span>
              <span className="h-2 w-28 rounded-full bg-muted" aria-hidden="true" />
            </li>,
          )}
        </ol>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={!selected.length || !changed}><Check className="mr-2 h-4 w-4" />{changed ? 'Guardar prioridades' : 'Prioridades guardadas'}</Button>
        </div>
      </Panel>
    </div>
  </PageShell>;
}

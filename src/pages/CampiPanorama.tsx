import { useMemo, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, BarChart3, Boxes, CalendarDays, Check, ClipboardList, GripVertical, HandCoins, Package, Plus, Ship, ShoppingCart, Tractor, Truck, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell, Panel } from '@/components/layout/AppPrimitives';
import { CampiPanoramaAvatar, type CampiPanoramaReaction } from '@/components/campi/CampiPanoramaAvatar';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  availablePanoramaTopics,
  readPanoramaPreferences,
  reconcilePanoramaOrder,
  savePanoramaPreferences,
  type PanoramaTopicGroup,
  type PanoramaTopicId,
} from '@/lib/campi/panoramaPreferences';

const GROUPS: readonly PanoramaTopicGroup[] = ['Resultados', 'Compromisos', 'Disponibilidad', 'Operación', 'Abastecimiento'];
const topicIcons: Record<PanoramaTopicId, typeof BarChart3> = {
  ventas_facturacion: BarChart3,
  repuestos_demanda: Activity,
  maquinas_pedidos: Truck,
  servicios_pendientes: ClipboardList,
  maquinas_stock: Tractor,
  repuestos_stock: Package,
  maquinas_proyeccion: Boxes,
  servicios_trabajo: Wrench,
  servicios_agenda: CalendarDays,
  maquinas_importacion: Ship,
  maquinas_parque: Tractor,
  repuestos_reposicion: ShoppingCart,
  servicios_comisiones: HandCoins,
};
const groupTone: Record<PanoramaTopicGroup, string> = {
  Resultados: 'bg-emerald-50 text-emerald-700',
  Compromisos: 'bg-amber-50 text-amber-700',
  Disponibilidad: 'bg-blue-50 text-blue-700',
  Operación: 'bg-violet-50 text-violet-700',
  Abastecimiento: 'bg-orange-50 text-orange-700',
};
export default function CampiPanorama() {
  const { user, isAdmin, hasModuloAccess, hasSectionAccess } = useAuth();
  const userId = user?.id ?? '';
  const available = useMemo(
    () => availablePanoramaTopics(hasModuloAccess, hasSectionAccess, isAdmin),
    [hasModuloAccess, hasSectionAccess, isAdmin],
  );
  const [saved, setSaved] = useState<PanoramaTopicId[] | null>(() => readPanoramaPreferences(userId));
  const [draft, setDraft] = useState<PanoramaTopicId[]>(() => reconcilePanoramaOrder(readPanoramaPreferences(userId), available));
  const [dragged, setDragged] = useState<PanoramaTopicId | null>(null);
  const [reaction, setReaction] = useState<CampiPanoramaReaction | null>(null);
  const selected = reconcilePanoramaOrder(draft, available);
  const persisted = reconcilePanoramaOrder(saved, available);
  const changed = saved === null || selected.join('|') !== persisted.join('|');
  const topicById = new Map(available.map(topic => [topic.id, topic]));
  const unselected = available.filter(topic => !selected.includes(topic.id));
  const react = (kind: CampiPanoramaReaction['kind']) => setReaction(current => ({ kind, token: (current?.token ?? 0) + 1 }));

  const add = (id: PanoramaTopicId) => {
    setDraft(current => {
      const permitted = reconcilePanoramaOrder(current, available);
      return permitted.includes(id) ? permitted : [...permitted, id];
    });
    react('select');
  };
  const remove = (id: PanoramaTopicId) => {
    setDraft(current => reconcilePanoramaOrder(current, available).filter(item => item !== id));
    react('remove');
  };
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= selected.length) return;
    const next = [...selected];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setDraft(next);
    react('reorder');
  };
  const save = () => {
    savePanoramaPreferences(userId, selected);
    setSaved(selected);
    react('save');
  };

  return <PageShell className="max-w-[1440px] space-y-4">
    <PageHeader title="Panorama" />
    <Panel className="relative isolate min-h-[178px] overflow-visible border-primary/15 bg-gradient-to-r from-emerald-50/70 via-background to-primary/5 px-6 py-5 lg:px-8">
      <div className="relative z-10 max-w-[590px] space-y-2 lg:py-5">
        <h2 className="text-[25px] font-semibold tracking-tight">Hola, soy Campi</h2>
        <p className="max-w-lg text-[15px] leading-6 text-foreground/85">Te ayudaré a ver qué cambió y qué necesita atención, con información verificada.</p>
      </div>
      <div className="absolute bottom-0 right-[190px] z-20 hidden h-[200px] w-[200px] lg:block"><CampiPanoramaAvatar reaction={reaction} /></div>
      <div className="absolute right-5 top-1/2 z-10 hidden w-[165px] -translate-y-1/2 rounded-xl border bg-card px-3.5 py-3 text-[13px] font-semibold shadow-sm before:absolute before:-left-[7px] before:top-[calc(50%-7px)] before:h-3.5 before:w-3.5 before:rotate-45 before:border-b before:border-l before:bg-card lg:block">Tus temas, en el orden que prefieras.</div>
    </Panel>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)]">
      <Panel className="min-w-0 space-y-3">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Temas de interés</h2>
          <span className="text-[12px] tabular-nums text-muted-foreground">{available.length} disponibles</span>
        </div>
        <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1" aria-label="Temas disponibles">
          {GROUPS.map(group => {
            const topics = unselected.filter(topic => topic.group === group);
            if (!topics.length) return null;
            return <section key={group} aria-label={group} className="space-y-1.5">
              <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
              {topics.map(topic => {
                const Icon = topicIcons[topic.id];
                return <button key={topic.id} type="button" onClick={() => add(topic.id)}
                  className="flex min-h-[54px] w-full items-center gap-3 rounded-lg border bg-card px-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', groupTone[group])}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{topic.label}</span>
                  <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>;
              })}
            </section>;
          })}
          {!unselected.length && <div className="px-2 py-6 text-center text-[13px] text-muted-foreground">Todos los temas están priorizados.</div>}
        </div>
      </Panel>
      <Panel className="space-y-3 lg:sticky lg:top-3">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Tu enfoque</h2>
          <span className="text-[12px] tabular-nums text-muted-foreground">{selected.length} priorizados</span>
        </div>
        <ol className="max-h-[430px] min-h-[172px] divide-y overflow-y-auto rounded-lg border">
          {selected.map((id, index) => {
            const topic = topicById.get(id);
            if (!topic) return null;
            return <li key={id} draggable onDragStart={event => { setDragged(id); event.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => setDragged(null)} onDragOver={event => event.preventDefault()}
              onDrop={event => { event.preventDefault(); if (dragged) move(selected.indexOf(dragged), index); setDragged(null); }}
              className="flex min-h-[57px] items-center gap-1.5 px-2.5">
              <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium" title={topic.label}>{topic.label}</span>
              <button type="button" className="rounded p-1.5 hover:bg-accent disabled:opacity-30" aria-label={`Subir ${topic.label}`} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" className="rounded p-1.5 hover:bg-accent disabled:opacity-30" aria-label={`Bajar ${topic.label}`} disabled={index === selected.length - 1} onClick={() => move(index, index + 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" className="rounded p-1.5 hover:bg-accent" aria-label={`Quitar ${topic.label}`} onClick={() => remove(id)}><X className="h-3.5 w-3.5" /></button>
            </li>;
          })}
          {!selected.length && <li className="flex min-h-[172px] items-center justify-center text-[13px] text-muted-foreground">Sin prioridades todavía.</li>}
        </ol>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={!selected.length || !changed}><Check className="mr-2 h-4 w-4" />{changed ? 'Guardar orden' : 'Orden guardado'}</Button>
        </div>
      </Panel>
    </div>
  </PageShell>;
}

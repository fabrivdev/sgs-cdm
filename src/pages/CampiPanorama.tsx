import { useEffect, useMemo, useRef, useState } from 'react';
import type { StoryTopicId } from '@/lib/campi/panoramaStoryTypes';
import { Activity, ArrowDown, ArrowUp, BarChart3, Boxes, CalendarDays, Check, ClipboardList, GripVertical, HandCoins, Package, Plus, Ship, ShoppingCart, Tractor, Truck, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell, Panel } from '@/components/layout/AppPrimitives';
import { CampiPanoramaAvatar, type CampiPanoramaReaction } from '@/components/campi/CampiPanoramaAvatar';
import { PanoramaDashboard } from '@/components/campi/PanoramaDashboard';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  availablePanoramaTopics,
  MAX_PANORAMA_TOPICS,
  readPanoramaPreferences,
  reconcilePanoramaOrder,
  savePanoramaPreferences,
  type PanoramaTopicGroup,
  type PanoramaTopicId,
} from '@/lib/campi/panoramaPreferences';

const topicIcons: Record<PanoramaTopicId, typeof BarChart3> = {
  ventas_evolucion: BarChart3,
  ventas_facturacion: BarChart3,
  ventas_neto_anual: BarChart3,
  ventas_nc_impacto: HandCoins,
  ventas_repuestos: BarChart3,
  ventas_servicios: BarChart3,
  ventas_maquinas: BarChart3,
  repuestos_demanda: Activity,
  repuestos_clientes: Activity,
  repuestos_sucursales: Package,
  repuestos_alertas: Package,
  repuestos_concentracion: Package,
  repuestos_rojo: Package,
  maquinas_pedidos: Truck,
  maquinas_pedidos_stock: Truck,
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
  servicios_abiertas: ClipboardList,
  servicios_os_antiguas: ClipboardList,
  servicios_os_facturadas: ClipboardList,
  agenda_cumplimiento: CalendarDays,
  servicios_productividad: Wrench,
  servicios_eficiencia: Wrench,
  clientes_retencion: Activity,
  clientes_cobertura_posventa: Activity,
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
  const [editing, setEditing] = useState(() => readPanoramaPreferences(userId) === null);
  const [draft, setDraft] = useState<PanoramaTopicId[]>(() => reconcilePanoramaOrder(readPanoramaPreferences(userId), available));
  const [dragged, setDragged] = useState<StoryTopicId | null>(null);
  const [reaction, setReaction] = useState<CampiPanoramaReaction | null>(null);
  const [replacing, setReplacing] = useState<StoryTopicId | null>(null);
  const [saveError, setSaveError] = useState(false);
  const firstTime = saved === null;
  const activeUserId = useRef(userId);
  useEffect(() => {
    if (activeUserId.current === userId) return;
    activeUserId.current = userId;
    const preference = readPanoramaPreferences(userId);
    setSaved(preference);
    setDraft(reconcilePanoramaOrder(preference, available));
    setEditing(preference === null);
    setSaveError(false);
  }, [userId, available]);
  const selected = reconcilePanoramaOrder(draft, available);
  const persisted = reconcilePanoramaOrder(saved, available);
  const cancel = () => { setDraft(persisted); setReplacing(null); setSaveError(false); setEditing(false); };
  const changed = saved === null || selected.join('|') !== persisted.join('|');
  const topicById = new Map(available.map(topic => [topic.id, topic]));
  const unselected = available.filter(topic => !selected.includes(topic.id));
  const react = (kind: CampiPanoramaReaction['kind']) => setReaction(current => ({ kind, token: (current?.token ?? 0) + 1 }));

  const add = (id: StoryTopicId) => {
    if (selected.length >= MAX_PANORAMA_TOPICS) { setReplacing(id); react('remove'); return; }
    setDraft(current => {
      const permitted = reconcilePanoramaOrder(current, available);
      return permitted.includes(id) ? permitted : [...permitted, id];
    });
    react('select');
  };
  const replace = (index: number) => {
    if (!replacing || !available.some(topic => topic.id === replacing)) return;
    setDraft(selected.map((id, position) => position === index ? replacing : id));
    setReplacing(null);
    react('select');
  };
  const remove = (id: PanoramaTopicId) => {
    setDraft(current => reconcilePanoramaOrder(current, available).filter(item => item !== id));
    setReplacing(null);
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
    if (!savePanoramaPreferences(userId, selected)) { setSaveError(true); return; }
    try {
      sessionStorage.setItem(`sig-cdm:campi:panorama-enter:${userId}`, '1');
      if (firstTime) sessionStorage.setItem(`sig-cdm:campi:panorama-first-tip:${userId}`, '1');
    } catch { /* Motion cue is optional. */ }
    setSaved(selected);
    setSaveError(false);
    react('save');
    setEditing(false);
    setReplacing(null);
  };

  if (!editing && persisted.length) return <PanoramaDashboard userId={userId} topics={persisted} available={available}
    hasAccess={section => hasModuloAccess(section.split('.')[0]) && hasSectionAccess(section)} onEdit={() => setEditing(true)} />;

  return <PageShell className="max-w-[1440px] space-y-3">
    <PageHeader title="Panorama" />
    <Panel className={`flex items-center gap-3 border-primary/15 bg-primary/5 px-3 py-2 ${firstTime ? 'min-h-[110px]' : 'min-h-[82px]'}`}>
      <div className={`${firstTime ? 'h-[94px] w-[94px]' : 'h-[64px] w-[64px]'} shrink-0`}><CampiPanoramaAvatar reaction={reaction} greetingKey={userId} /></div>
      <div className="min-w-0"><h2 className="text-sm font-semibold">{firstTime ? 'Soy Campi' : 'Editar prioridades'}</h2><p className="text-sm text-muted-foreground">{firstTime ? 'Elegí los temas que querés seguir y te ayudaré a interpretar sus datos.' : 'Elegí y ordená los temas que querés seguir.'}</p></div>
    </Panel>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)]">
      <Panel className="min-w-0 space-y-3">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Temas de interés</h2>
          <span className="text-[12px] tabular-nums text-muted-foreground">{available.length} disponibles · {selected.length} seleccionados · {unselected.length} alternativas</span>
        </div>
        <div className="max-h-[430px] space-y-1.5 overflow-y-auto pr-1" aria-label="Temas disponibles">
          {unselected.map(topic => {
                const Icon = topicIcons[topic.id];
                return <button key={topic.id} type="button" onClick={() => add(topic.id)} aria-label={topic.label}
                  className="flex min-h-[54px] w-full items-center gap-3 rounded-lg border bg-card px-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', groupTone[topic.group])}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><strong className="block text-[13px] font-semibold">{topic.question}</strong><span className="block text-[12px] text-muted-foreground">{topic.label}</span></span>
                  <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>;
          })}
          {!unselected.length && <div className="px-2 py-6 text-center text-[13px] text-muted-foreground">Todos los temas están priorizados.</div>}
        </div>
      </Panel>
      <Panel className="space-y-3 lg:sticky lg:top-3">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Tu enfoque</h2>
          <span className="text-[12px] tabular-nums text-muted-foreground">{selected.length} de {MAX_PANORAMA_TOPICS}</span>
        </div>
        {replacing && <div role="status" className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-[12px]">Elegí qué tema reemplazar por «{topicById.get(replacing)?.label}». <button type="button" className="ml-2 underline" onClick={() => setReplacing(null)}>Cancelar</button></div>}
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
              {replacing ? <button type="button" className="min-w-0 flex-1 truncate rounded px-1 text-left text-[12px] font-medium text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => replace(index)} aria-label={`Reemplazar ${topic.label} por ${topicById.get(replacing)?.label}`}>{topic.label}</button> : <span className="min-w-0 flex-1 truncate text-[12px] font-medium" title={topic.label}>{topic.label}</span>}
              <button type="button" className="rounded p-1.5 hover:bg-accent disabled:opacity-30" aria-label={`Subir ${topic.label}`} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" className="rounded p-1.5 hover:bg-accent disabled:opacity-30" aria-label={`Bajar ${topic.label}`} disabled={index === selected.length - 1} onClick={() => move(index, index + 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" className="rounded p-1.5 hover:bg-accent" aria-label={`Quitar ${topic.label}`} onClick={() => remove(id)}><X className="h-3.5 w-3.5" /></button>
            </li>;
          })}
          {Array.from({ length: MAX_PANORAMA_TOPICS - selected.length }, (_, index) => <li key={`empty-${index}`} className="flex min-h-[57px] items-center gap-2 px-3 text-sm text-muted-foreground"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">{selected.length + index + 1}</span>Elegí un tema</li>)}
        </ol>
        <p className="text-xs text-muted-foreground">Podés continuar con menos de cuatro temas. Las posiciones vacías quedarán disponibles para después.</p>
        {saveError && <p role="alert" className="text-xs text-destructive">No se pudo guardar tu selección en este navegador. Revisá el almacenamiento y volvé a intentar.</p>}
        <div className="flex justify-end gap-2">
          {saved !== null && <Button size="sm" variant="outline" onClick={cancel}>Volver al panorama</Button>}
          <Button size="sm" onClick={save} disabled={!selected.length || !changed}><Check className="mr-2 h-4 w-4" />{firstTime ? 'Ver mi Panorama' : changed ? 'Guardar prioridades' : 'Prioridades guardadas'}</Button>
        </div>
      </Panel>
    </div>
  </PageShell>;
}

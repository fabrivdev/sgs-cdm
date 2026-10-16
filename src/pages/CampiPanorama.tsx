import { useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, Boxes, Check, ClipboardList, Package, Plus, Settings2, Wrench, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell, Panel } from '@/components/layout/AppPrimitives';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  availablePanoramaAreas,
  MAX_PANORAMA_PRIORITIES,
  readPanoramaPreferences,
  reconcilePanoramaOrder,
  savePanoramaPreferences,
  type PanoramaAreaId,
} from '@/lib/campi/panoramaPreferences';

const areaIcons = {
  ventas: BarChart3,
  repuestos: Package,
  parque: Boxes,
  servicios: Wrench,
  importaciones: ClipboardList,
} as const;

export default function CampiPanorama() {
  const { user, hasSectionAccess } = useAuth();
  const userId = user?.id ?? '';
  const available = useMemo(() => availablePanoramaAreas(hasSectionAccess), [hasSectionAccess]);
  const [saved, setSaved] = useState<PanoramaAreaId[] | null>(() => readPanoramaPreferences(userId));
  const [draft, setDraft] = useState<PanoramaAreaId[]>(() => {
    const previous = readPanoramaPreferences(userId);
    return previous === null
      ? available.slice(0, MAX_PANORAMA_PRIORITIES).map(area => area.id)
      : reconcilePanoramaOrder(previous, available);
  });
  const [editing, setEditing] = useState(() => {
    const previous = readPanoramaPreferences(userId);
    return previous === null || (available.length > 0 && reconcilePanoramaOrder(previous, available).length === 0);
  });
  const selected = reconcilePanoramaOrder(editing ? draft : saved, available);
  const byId = new Map(available.map(area => [area.id, area]));

  const toggle = (id: PanoramaAreaId) => {
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
    setEditing(false);
  };

  return <PageShell className="max-w-[1440px] space-y-4">
    <PageHeader title="Panorama" actions={!editing && available.length > 0
      ? <Button variant="outline" size="sm" onClick={() => { setDraft(reconcilePanoramaOrder(saved, available)); setEditing(true); }}>
        <Settings2 className="mr-2 h-4 w-4" />Editar enfoque
      </Button> : undefined} />

    {editing ? <>
      <Panel className="relative min-h-[176px] overflow-hidden border-primary/15 bg-primary/5 p-5 sm:p-7">
        <div className="relative z-10 max-w-[66%] space-y-2 sm:max-w-[62%]">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Hola, soy Campi</h2>
          <p className="max-w-lg text-[14px] leading-6 text-foreground/85">Te ayudaré a encontrar cambios importantes con datos verificados.</p>
        </div>
        <div className="absolute right-[225px] top-8 hidden max-w-[200px] rounded-xl border bg-card px-4 py-3 text-[13px] font-semibold shadow-sm xl:block">¿Qué querés seguir de cerca?</div>
        <img src="/campi/campi-smile.webp" alt="Campi" className="absolute bottom-[-22px] right-1 h-[175px] w-[175px] object-contain sm:right-7 sm:h-[190px] sm:w-[190px]" />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(290px,0.75fr)]">
        <Panel className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">Temas de interés</h2>
            <span className="text-[12px] tabular-nums text-muted-foreground">{selected.length} de {MAX_PANORAMA_PRIORITIES}</span>
          </div>
          <div className="space-y-2">
            {available.map(area => {
              const index = selected.indexOf(area.id);
              const active = index >= 0;
              const Icon = areaIcons[area.id];
              return <button key={area.id} type="button" onClick={() => toggle(area.id)}
                disabled={!active && selected.length >= MAX_PANORAMA_PRIORITIES}
                aria-pressed={active}
                className={cn('flex min-h-[62px] w-full items-center gap-3 rounded-lg border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-primary/35 bg-primary/5' : 'bg-card hover:bg-accent',
                  !active && selected.length >= MAX_PANORAMA_PRIORITIES && 'cursor-not-allowed opacity-55')}>
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}><Icon className="h-[18px] w-[18px]" /></span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{area.label}</span>
                <span className={cn('flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold', active ? 'bg-primary text-primary-foreground' : 'border text-muted-foreground')}>
                  {active ? index + 1 : <Plus className="h-4 w-4" />}
                </span>
              </button>;
            })}
          </div>
        </Panel>

        <Panel className="flex flex-col gap-3 lg:self-start">
          <h2 className="text-[15px] font-semibold">Tu enfoque</h2>
          <ol className="divide-y rounded-lg border">
            {selected.map((id, index) => {
              const area = byId.get(id);
              if (!area) return null;
              return <li key={id} className="flex min-h-[57px] items-center gap-2 px-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{area.label}</span>
                <button type="button" className="rounded p-1.5 hover:bg-accent disabled:opacity-30" aria-label={`Subir ${area.label}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" className="rounded p-1.5 hover:bg-accent disabled:opacity-30" aria-label={`Bajar ${area.label}`} disabled={index === selected.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" className="rounded p-1.5 hover:bg-accent" aria-label={`Quitar ${area.label}`} onClick={() => toggle(id)}><X className="h-3.5 w-3.5" /></button>
              </li>;
            })}
          </ol>
          <div className="flex justify-end gap-2 pt-1">
            {saved !== null && <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>}
            <Button size="sm" onClick={save} disabled={!selected.length}><Check className="mr-2 h-4 w-4" />Guardar prioridades</Button>
          </div>
        </Panel>
      </div>
    </> : <>
      <Panel className="relative grid min-h-[174px] overflow-hidden border-primary/15 bg-primary/5 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(240px,0.7fr)] sm:p-6">
        <div className="relative z-10 max-w-[620px] space-y-2">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Tu panorama, a tu medida</h2>
          <p className="text-[13px] leading-5 text-foreground/85">Tus prioridades están guardadas.</p>
        </div>
        <div className="absolute right-[225px] top-8 hidden max-w-[200px] rounded-xl border bg-card px-4 py-3 text-[13px] font-semibold shadow-sm xl:block">Muy pronto</div>
        <img src="/campi/campi-rest.webp" alt="Campi" className="absolute bottom-[-22px] right-5 h-[190px] w-[190px] object-contain sm:right-12" />
      </Panel>
      <section aria-label="Tu enfoque" className="grid gap-3 lg:grid-cols-3">
        {selected.map((id, index) => {
          const area = byId.get(id);
          if (!area) return null;
          const Icon = areaIcons[id];
          return <Panel key={id} className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-[18px] w-[18px]" /></span>
              <h2 className="min-w-0 flex-1 text-[14px] font-semibold">{area.label}</h2>
              <span className="text-[12px] tabular-nums text-muted-foreground">{index + 1}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {area.routes.map(route => <Button key={route.path} asChild variant="outline" size="sm"><Link to={route.path}>{route.label}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button>)}
            </div>
          </Panel>;
        })}
      </section>
    </>}
  </PageShell>;
}

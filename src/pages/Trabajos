import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Search, CalendarPlus, Clock, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MARCAS, SUCURSALES, TIPOS_TRABAJO, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";

const ESTADOS_TRABAJO = [
  { value: "nuevo", label: "Nuevo" },
  { value: "pendiente_diagnostico", label: "Pend. diagnóstico" },
  { value: "pendiente_programar", label: "Pend. programar" },
  { value: "programado", label: "Programado" },
  { value: "en_ejecucion", label: "En ejecución" },
  { value: "bloqueado", label: "Bloqueado" },
  { value: "terminado_pendiente_validar", label: "Pend. validar" },
  { value: "cerrado", label: "Cerrado" },
] as const;

const PRIORIDADES = ["baja", "media", "alta", "urgente"] as const;

type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number]["value"];
type Prioridad = (typeof PRIORIDADES)[number];

type Cliente = { id: string; nombre: string; sucursal: Sucursal | null };
type Profile = { id: string; nombre: string; sucursal: Sucursal | null };
type Trabajo = {
  id: string;
  cliente_id: string | null;
  maquina_id: string | null;
  marca: Marca;
  sucursal: Sucursal;
  tipo_trabajo: TipoTrabajo;
  descripcion_problema: string;
  prioridad: Prioridad;
  estado_general: EstadoTrabajo;
  fecha_compromiso: string | null;
  responsable_principal_id: string | null;
  motivo_bloqueo: string | null;
  proxima_accion: string | null;
  creado_por: string | null;
  cerrado_por: string | null;
  cerrado_en: string | null;
  creado_en: string;
  actualizado_en: string;
};

type Programacion = {
  id: string;
  trabajo_id: string;
  fecha_programada: string;
  tecnico_principal_id: string | null;
  auxiliares: string[];
  accion_programada: string | null;
  horas_estimadas: number | null;
  estado: "programada" | "cumplida" | "reprogramada" | "cancelada";
  observacion: string | null;
};

type Jornada = {
  id: string;
  trabajo_id: string;
  programacion_id: string | null;
  tecnico_id: string;
  fecha_real: string;
  horas_reales: number | null;
  actividad_realizada: string | null;
  resultado: string | null;
  estado_jornada: "en_curso" | "completada" | "incompleta";
  observaciones: string | null;
};

const PAGE = 1000;
async function cargarTodo<T>(queryBuilder: any): Promise<T[]> {
  let from = 0;
  const all: T[] = [];
  while (true) {
    const { data, error } = await queryBuilder.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const prioridadClass: Record<Prioridad, string> = {
  baja: "bg-slate-100 text-slate-700",
  media: "bg-blue-100 text-blue-700",
  alta: "bg-amber-100 text-amber-700",
  urgente: "bg-red-100 text-red-700",
};

export default function Trabajos() {
  const { user, profile, isAdmin } = useAuth();
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [programaciones, setProgramaciones] = useState<Programacion[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fSucursal, setFSucursal] = useState<string>(profile?.sucursal ?? "all");
  const [fResponsable, setFResponsable] = useState<string>("all");
  const [fPrioridad, setFPrioridad] = useState<string>("all");
  const [openNuevo, setOpenNuevo] = useState(false);
  const [detalle, setDetalle] = useState<Trabajo | null>(null);
  const [dragTrabajoId, setDragTrabajoId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [t, c, p, pr, j] = await Promise.all([
        cargarTodo<Trabajo>(supabase.from("trabajos").select("*").order("actualizado_en", { ascending: false })),
        cargarTodo<Cliente>(supabase.from("clientes").select("id, nombre, sucursal").order("nombre", { ascending: true })),
        cargarTodo<Profile>(supabase.from("profiles").select("id, nombre, sucursal").order("nombre", { ascending: true })),
        cargarTodo<Programacion>(supabase.from("programaciones").select("*")),
        cargarTodo<Jornada>(supabase.from("jornadas").select("*")),
      ]);
      setTrabajos(t);
      setClientes(c);
      setProfiles(p);
      setProgramaciones(pr);
      setJornadas(j);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "No se pudieron cargar los trabajos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const clienteById = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c.nombre])), [clientes]);
  const profileById = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p.nombre])), [profiles]);
  const progByTrabajo = useMemo(() => {
    const m = new Map<string, Programacion[]>();
    for (const p of programaciones) {
      const list = m.get(p.trabajo_id) ?? [];
      list.push(p);
      m.set(p.trabajo_id, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada));
    return m;
  }, [programaciones]);
  const horasByTrabajo = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jornadas) m.set(j.trabajo_id, (m.get(j.trabajo_id) ?? 0) + Number(j.horas_reales ?? 0));
    return m;
  }, [jornadas]);

  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return trabajos.filter((t) => {
      if (fSucursal !== "all" && t.sucursal !== fSucursal) return false;
      if (fResponsable !== "all" && t.responsable_principal_id !== fResponsable) return false;
      if (fPrioridad !== "all" && t.prioridad !== fPrioridad) return false;
      if (qq) {
        const cli = t.cliente_id ? clienteById[t.cliente_id] ?? "" : "";
        const resp = t.responsable_principal_id ? profileById[t.responsable_principal_id] ?? "" : "";
        if (![cli, resp, t.descripcion_problema, t.marca, t.sucursal].join(" ").toLowerCase().includes(qq)) return false;
      }
      return true;
    });
  }, [trabajos, q, fSucursal, fResponsable, fPrioridad, clienteById, profileById]);

  const cambiarEstado = async (trabajo: Trabajo, estado: EstadoTrabajo) => {
    if (trabajo.estado_general === estado) return;
    const { error } = await supabase.from("trabajos").update({ estado_general: estado }).eq("id", trabajo.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTrabajos((prev) => prev.map((t) => (t.id === trabajo.id ? { ...t, estado_general: estado } : t)));
    toast.success("Estado actualizado");
  };

  return (
    <div className="container max-w-[1800px] py-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trabajos</h1>
          <p className="text-xs text-muted-foreground">Kanban de casos madre, programaciones y jornadas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar cliente, técnico o problema..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={fSucursal} onValueChange={setFSucursal}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fResponsable} onValueChange={setFResponsable}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Responsable" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fPrioridad} onValueChange={setFPrioridad}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Prioridad</SelectItem>
              {PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setOpenNuevo(true)}><Plus className="mr-2 h-4 w-4" /> Nuevo trabajo</Button>
        </div>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Cargando trabajos...</Card>
      ) : (
        <div className="grid gap-3 overflow-x-auto pb-3" style={{ gridTemplateColumns: `repeat(${ESTADOS_TRABAJO.length}, minmax(245px, 1fr))` }}>
          {ESTADOS_TRABAJO.map((col) => {
            const items = filtrados.filter((t) => t.estado_general === col.value);
            return (
              <div
                key={col.value}
                className="min-h-[70vh] rounded-lg border bg-muted/20 p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const t = trabajos.find((x) => x.id === dragTrabajoId);
                  if (t) cambiarEstado(t, col.value);
                  setDragTrabajoId(null);
                }}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">{col.label}</h2>
                  <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <TrabajoCard
                      key={t.id}
                      trabajo={t}
                      cliente={t.cliente_id ? clienteById[t.cliente_id] : undefined}
                      responsable={t.responsable_principal_id ? profileById[t.responsable_principal_id] : undefined}
                      programaciones={progByTrabajo.get(t.id) ?? []}
                      horas={horasByTrabajo.get(t.id) ?? 0}
                      onOpen={() => setDetalle(t)}
                      onDragStart={() => setDragTrabajoId(t.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NuevoTrabajoDialog
        open={openNuevo}
        onOpenChange={setOpenNuevo}
        clientes={clientes}
        profiles={profiles}
        defaultSucursal={isAdmin ? "Santa Rita" : profile?.sucursal ?? "Santa Rita"}
        userId={user?.id ?? null}
        onSaved={load}
      />

      <DetalleTrabajoSheet
        trabajo={detalle}
        onOpenChange={(o) => !o && setDetalle(null)}
        cliente={detalle?.cliente_id ? clienteById[detalle.cliente_id] : undefined}
        responsable={detalle?.responsable_principal_id ? profileById[detalle.responsable_principal_id] : undefined}
        programaciones={detalle ? progByTrabajo.get(detalle.id) ?? [] : []}
        jornadas={detalle ? jornadas.filter((j) => j.trabajo_id === detalle.id) : []}
        profiles={profiles}
        userId={user?.id ?? null}
        onSaved={load}
      />
    </div>
  );
}

function TrabajoCard({ trabajo, cliente, responsable, programaciones, horas, onOpen, onDragStart }: {
  trabajo: Trabajo; cliente?: string; responsable?: string; programaciones: Programacion[]; horas: number; onOpen: () => void; onDragStart: () => void;
}) {
  const prox = programaciones.find((p) => p.estado === "programada") ?? programaciones[0];
  return (
    <Card draggable onDragStart={onDragStart} onClick={onOpen} className="cursor-grab p-3 active:cursor-grabbing hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{cliente ?? "Sin cliente"}</div>
          <div className="text-[11px] text-muted-foreground">{trabajo.sucursal} · {trabajo.marca}</div>
        </div>
        <Badge className={cn("text-[9px]", prioridadClass[trabajo.prioridad])}>{trabajo.prioridad}</Badge>
      </div>
      <div className="mt-2 line-clamp-3 text-xs text-muted-foreground">{trabajo.descripcion_problema}</div>
      <div className="mt-3 flex flex-col gap-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1"><UserRound className="h-3 w-3" /> {responsable ?? "Sin responsable"}</div>
        <div className="flex items-center gap-1"><CalendarPlus className="h-3 w-3" /> {prox ? prox.fecha_programada : "Sin programación"}</div>
        <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> {horas.toFixed(1)} h reales</div>
      </div>
    </Card>
  );
}

function NuevoTrabajoDialog({ open, onOpenChange, clientes, profiles, defaultSucursal, userId, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; clientes: Cliente[]; profiles: Profile[]; defaultSucursal: Sucursal; userId: string | null; onSaved: () => void;
}) {
  const [clienteId, setClienteId] = useState<string>("none");
  const [marca, setMarca] = useState<Marca>("CLAAS");
  const [sucursal, setSucursal] = useState<Sucursal>(defaultSucursal);
  const [tipo, setTipo] = useState<TipoTrabajo>("Visita de campo");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>("media");
  const [responsable, setResponsable] = useState<string>("none");
  const [fecha, setFecha] = useState("");
  const [accion, setAccion] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSucursal(defaultSucursal);
      setClienteId("none");
      setMarca("CLAAS");
      setTipo("Visita de campo");
      setDescripcion("");
      setPrioridad("media");
      setResponsable("none");
      setFecha("");
      setAccion("");
    }
  }, [open, defaultSucursal]);

  const guardar = async () => {
    if (!descripcion.trim()) return toast.error("Cargá el problema o trabajo a resolver");
    setBusy(true);
    const estado = fecha ? "programado" : "pendiente_programar";
    const { data, error } = await supabase.from("trabajos").insert({
      cliente_id: clienteId === "none" ? null : clienteId,
      marca,
      sucursal,
      tipo_trabajo: tipo,
      descripcion_problema: descripcion.trim(),
      prioridad,
      estado_general: estado,
      responsable_principal_id: responsable === "none" ? null : responsable,
      creado_por: userId,
    }).select("id").single();

    if (error) { setBusy(false); return toast.error(error.message); }

    if (fecha && data?.id) {
      const { error: e2 } = await supabase.from("programaciones").insert({
        trabajo_id: data.id,
        fecha_programada: fecha,
        tecnico_principal_id: responsable === "none" ? null : responsable,
        accion_programada: accion || descripcion.trim(),
        creado_por: userId,
      });
      if (e2) { setBusy(false); return toast.error(e2.message); }
    }
    setBusy(false);
    toast.success("Trabajo creado");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo trabajo</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1"><Label>Cliente</Label><Select value={clienteId} onValueChange={setClienteId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sin cliente</SelectItem>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Sucursal</Label><Select value={sucursal} onValueChange={(v) => setSucursal(v as Sucursal)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Marca</Label><Select value={marca} onValueChange={(v) => setMarca(v as Marca)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MARCAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Tipo</Label><Select value={tipo} onValueChange={(v) => setTipo(v as TipoTrabajo)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS_TRABAJO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Prioridad</Label><Select value={prioridad} onValueChange={(v) => setPrioridad(v as Prioridad)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-1"><Label>Problema o trabajo</Label><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} /></div>
          <div className="space-y-1"><Label>Responsable</Label><Select value={responsable} onValueChange={setResponsable}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sin asignar</SelectItem>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Primera programación (opcional)</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div className="space-y-1"><Label>Acción programada</Label><Input value={accion} onChange={(e) => setAccion(e.target.value)} placeholder="Opcional" /></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={guardar} disabled={busy}>{busy ? "Guardando..." : "Guardar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetalleTrabajoSheet({ trabajo, onOpenChange, cliente, responsable, programaciones, jornadas, profiles, userId, onSaved }: {
  trabajo: Trabajo | null; onOpenChange: (v: boolean) => void; cliente?: string; responsable?: string; programaciones: Programacion[]; jornadas: Jornada[]; profiles: Profile[]; userId: string | null; onSaved: () => void;
}) {
  const [fecha, setFecha] = useState("");
  const [tecnico, setTecnico] = useState<string>("none");
  const [accion, setAccion] = useState("");
  const [horas, setHoras] = useState("");
  const [actividad, setActividad] = useState("");

  if (!trabajo) return null;

  const crearProgramacion = async () => {
    if (!fecha) return toast.error("Elegí una fecha");
    const { error } = await supabase.from("programaciones").insert({ trabajo_id: trabajo.id, fecha_programada: fecha, tecnico_principal_id: tecnico === "none" ? null : tecnico, accion_programada: accion || trabajo.descripcion_problema, creado_por: userId });
    if (error) return toast.error(error.message);
    if (trabajo.estado_general === "pendiente_programar" || trabajo.estado_general === "nuevo") await supabase.from("trabajos").update({ estado_general: "programado" }).eq("id", trabajo.id);
    toast.success("Programación creada");
    setFecha(""); setAccion(""); setTecnico("none"); onSaved();
  };

  const cargarJornada = async () => {
    if (!actividad.trim()) return toast.error("Cargá la actividad realizada");
    if (tecnico === "none") return toast.error("Elegí el técnico");
    const { error } = await supabase.from("jornadas").insert({ trabajo_id: trabajo.id, tecnico_id: tecnico, fecha_real: new Date().toISOString().slice(0, 10), horas_reales: horas ? Number(horas) : null, actividad_realizada: actividad.trim(), estado_jornada: "completada", creado_por: userId });
    if (error) return toast.error(error.message);
    await supabase.from("trabajos").update({ estado_general: "en_ejecucion" }).eq("id", trabajo.id);
    toast.success("Jornada cargada");
    setHoras(""); setActividad(""); onSaved();
  };

  return (
    <Sheet open={!!trabajo} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><SheetTitle>{cliente ?? "Sin cliente"}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          <Card className="p-3 space-y-2">
            <div className="flex flex-wrap gap-2"><Badge>{trabajo.marca}</Badge><Badge variant="outline">{trabajo.sucursal}</Badge><Badge className={prioridadClass[trabajo.prioridad]}>{trabajo.prioridad}</Badge></div>
            <div className="text-sm font-medium">{trabajo.descripcion_problema}</div>
            <div className="text-xs text-muted-foreground">Responsable: {responsable ?? "Sin asignar"}</div>
          </Card>
          <Card className="p-3 space-y-2">
            <h3 className="text-sm font-semibold">Programar intervención</h3>
            <div className="grid grid-cols-2 gap-2"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /><Select value={tecnico} onValueChange={setTecnico}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sin técnico</SelectItem>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent></Select></div>
            <Input value={accion} onChange={(e) => setAccion(e.target.value)} placeholder="Acción programada" />
            <Button size="sm" onClick={crearProgramacion}>Programar</Button>
          </Card>
          <Card className="p-3 space-y-2">
            <h3 className="text-sm font-semibold">Cargar jornada</h3>
            <div className="grid grid-cols-2 gap-2"><Select value={tecnico} onValueChange={setTecnico}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Técnico</SelectItem>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent></Select><Input type="number" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="Horas" /></div>
            <Textarea value={actividad} onChange={(e) => setActividad(e.target.value)} placeholder="Actividad realizada" />
            <Button size="sm" onClick={cargarJornada}>Guardar jornada</Button>
          </Card>
          <Card className="p-3"><h3 className="text-sm font-semibold mb-2">Programaciones</h3>{programaciones.length ? programaciones.map((p) => <div key={p.id} className="border-b py-2 text-xs"><b>{p.fecha_programada}</b> · {p.estado} · {p.tecnico_principal_id ? profiles.find((x) => x.id === p.tecnico_principal_id)?.nombre : "Sin técnico"}<div className="text-muted-foreground">{p.accion_programada}</div></div>) : <div className="text-xs text-muted-foreground">Sin programaciones</div>}</Card>
          <Card className="p-3"><h3 className="text-sm font-semibold mb-2">Jornadas</h3>{jornadas.length ? jornadas.map((j) => <div key={j.id} className="border-b py-2 text-xs"><b>{j.fecha_real}</b> · {profiles.find((x) => x.id === j.tecnico_id)?.nombre ?? "Técnico"} · {Number(j.horas_reales ?? 0).toFixed(1)}h<div className="text-muted-foreground">{j.actividad_realizada}</div></div>) : <div className="text-xs text-muted-foreground">Sin jornadas</div>}</Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}

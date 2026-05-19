import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Wrench } from "lucide-react";
import { MARCAS, SUCURSALES, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type EstadoTrabajo = "pendiente" | "programado" | "iniciado" | "en_pausa" | "completado";
type PrioridadTrabajo = "baja" | "media" | "alta" | "urgente";

interface Trabajo {
  id: string;
  cliente_id: string | null;
  maquina_id: string | null;
  marca: Marca;
  sucursal: Sucursal;
  tipo_trabajo: TipoTrabajo;
  descripcion_problema: string;
  prioridad: PrioridadTrabajo;
  estado_general: EstadoTrabajo | string;
  fecha_compromiso: string | null;
  responsable_principal_id: string | null;
  motivo_bloqueo: string | null;
  proxima_accion: string | null;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
  legacy_servicio_id?: string | null;
}

interface Cliente {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

interface Profile {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

interface UserRole {
  user_id: string;
  role: string;
}

const PAGE = 1000;

const ESTADOS: { key: EstadoTrabajo; label: string }[] = [
  { key: "pendiente", label: "Pendiente" },
  { key: "programado", label: "Programado" },
  { key: "iniciado", label: "Iniciado" },
  { key: "en_pausa", label: "En pausa" },
  { key: "completado", label: "Completado" },
];

const PRIORIDADES: { key: PrioridadTrabajo; label: string }[] = [
  { key: "baja", label: "Baja" },
  { key: "media", label: "Media" },
  { key: "alta", label: "Alta" },
  { key: "urgente", label: "Urgente" },
];

const estadoLabel = (estado: string) => {
  const found = ESTADOS.find((e) => e.key === estado);
  if (found) return found.label;

  const fallback: Record<string, string> = {
    nuevo: "Pendiente",
    pendiente_diagnostico: "Pendiente",
    pendiente_programar: "Pendiente",
    en_ejecucion: "Iniciado",
    bloqueado: "En pausa",
    terminado_pendiente_validar: "Completado",
    cerrado: "Completado",
  };

  return fallback[estado] ?? estado;
};

const estadoColor = (estado: string) => {
  const normalized =
    estado === "nuevo" || estado === "pendiente_diagnostico" || estado === "pendiente_programar"
      ? "pendiente"
      : estado === "en_ejecucion"
      ? "iniciado"
      : estado === "bloqueado"
      ? "en_pausa"
      : estado === "cerrado" || estado === "terminado_pendiente_validar"
      ? "completado"
      : estado;

  switch (normalized) {
    case "pendiente":
      return "border-amber-200 bg-amber-50";
    case "programado":
      return "border-blue-200 bg-blue-50";
    case "iniciado":
      return "border-emerald-200 bg-emerald-50";
    case "en_pausa":
      return "border-slate-300 bg-slate-100";
    case "completado":
      return "border-green-200 bg-green-50";
    default:
      return "border-border bg-card";
  }
};

const normalizarEstado = (estado: string): EstadoTrabajo => {
  if (estado === "programado") return "programado";
  if (estado === "iniciado" || estado === "en_ejecucion") return "iniciado";
  if (estado === "en_pausa" || estado === "bloqueado") return "en_pausa";
  if (estado === "completado" || estado === "cerrado" || estado === "terminado_pendiente_validar") return "completado";
  return "pendiente";
};

const ORDEN_ESTADOS: EstadoTrabajo[] = ["pendiente", "programado", "iniciado", "en_pausa", "completado"];

const siguientesEstados = (estadoActual: string): EstadoTrabajo[] => {
  const actual = normalizarEstado(estadoActual);

  if (actual === "completado") return [];

  // Flujo normal:
  // Pendiente -> Programado -> Iniciado -> Completado
  // Desde Iniciado también se puede poner En pausa.
  // Desde En pausa solo se puede volver a Iniciado o completar.
  switch (actual) {
    case "pendiente":
      return ["programado"];
    case "programado":
      return ["iniciado"];
    case "iniciado":
      return ["en_pausa", "completado"];
    case "en_pausa":
      return ["iniciado", "completado"];
    default:
      return [];
  }
};

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

export default function Trabajos() {
  const { user, profile, isAdmin } = useAuth();

  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [fSucursal, setFSucursal] = useState<string>(profile?.sucursal ?? "all");
  const [fTecnico, setFTecnico] = useState<string>("all");
  const [fPrioridad, setFPrioridad] = useState<string>("all");

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Trabajo | null>(null);

  const [form, setForm] = useState({
    cliente_id: "",
    cliente_text: "",
    marca: "CLAAS" as Marca,
    sucursal: (profile?.sucursal ?? "Santa Rita") as Sucursal,
    tipo_trabajo: "Visita de campo" as TipoTrabajo,
    descripcion_problema: "",
    prioridad: "media" as PrioridadTrabajo,
    estado_general: "pendiente" as EstadoTrabajo,
    responsable_principal_id: "",
    fecha_compromiso: "",
    proxima_accion: "",
    motivo_bloqueo: "",
  });

  const load = async () => {
    setLoading(true);

    try {
      const [t, c, p, r] = await Promise.all([
        cargarTodo<Trabajo>(
          supabase.from("trabajos").select("*").order("actualizado_en", { ascending: false }),
        ),
        cargarTodo<Cliente>(
          supabase.from("clientes").select("id, nombre, sucursal").order("nombre", { ascending: true }),
        ),
        cargarTodo<Profile>(
          supabase.from("profiles").select("id, nombre, sucursal").order("nombre", { ascending: true }),
        ),
        cargarTodo<UserRole>(
          supabase.from("user_roles").select("user_id, role"),
        ),
      ]);

      setTrabajos(t);
      setClientes(c);
      setProfiles(p);
      setRoles(r);
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

  const adminIds = useMemo(() => {
    return new Set(
      roles
        .filter((r) => String(r.role ?? "").toLowerCase() === "admin")
        .map((r) => r.user_id),
    );
  }, [roles]);

  const tecnicos = useMemo(() => {
    return profiles.filter((p) => !adminIds.has(p.id));
  }, [profiles, adminIds]);

  const cliById = useMemo(() => {
    return new Map(clientes.map((c) => [c.id, c]));
  }, [clientes]);

  const profById = useMemo(() => {
    return new Map(profiles.map((p) => [p.id, p]));
  }, [profiles]);

  const clientesFiltrados = useMemo(() => {
    const query = form.cliente_text.trim().toLowerCase();

    if (!query) return clientes.slice(0, 100);

    return clientes
      .filter((c) => c.nombre.toLowerCase().includes(query))
      .slice(0, 100);
  }, [clientes, form.cliente_text]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return trabajos.filter((t) => {
      if (fSucursal !== "all" && t.sucursal !== fSucursal) return false;
      if (fTecnico !== "all" && t.responsable_principal_id !== fTecnico) return false;
      if (fPrioridad !== "all" && t.prioridad !== fPrioridad) return false;

      if (query) {
        const cliente = t.cliente_id ? cliById.get(t.cliente_id)?.nombre ?? "" : "";
        const tecnico = t.responsable_principal_id ? profById.get(t.responsable_principal_id)?.nombre ?? "" : "";
        const hay =
          cliente.toLowerCase().includes(query) ||
          tecnico.toLowerCase().includes(query) ||
          t.descripcion_problema.toLowerCase().includes(query);

        if (!hay) return false;
      }

      return true;
    });
  }, [trabajos, q, fSucursal, fTecnico, fPrioridad, cliById, profById]);

  const openNuevo = () => {
    setEditing(null);
    setForm({
      cliente_id: "",
      cliente_text: "",
      marca: "CLAAS",
      sucursal: (profile?.sucursal ?? "Santa Rita") as Sucursal,
      tipo_trabajo: "Visita de campo",
      descripcion_problema: "",
      prioridad: "media",
      estado_general: "pendiente",
      responsable_principal_id: "",
      fecha_compromiso: "",
      proxima_accion: "",
      motivo_bloqueo: "",
    });
    setOpenForm(true);
  };

  const openEditar = (t: Trabajo) => {
    const cliente = t.cliente_id ? cliById.get(t.cliente_id) : null;

    setEditing(t);
    setForm({
      cliente_id: t.cliente_id ?? "",
      cliente_text: cliente?.nombre ?? "",
      marca: t.marca,
      sucursal: t.sucursal,
      tipo_trabajo: t.tipo_trabajo,
      descripcion_problema: t.descripcion_problema,
      prioridad: t.prioridad,
      estado_general: normalizarEstado(String(t.estado_general)),
      responsable_principal_id: t.responsable_principal_id ?? "",
      fecha_compromiso: t.fecha_compromiso ?? "",
      proxima_accion: t.proxima_accion ?? "",
      motivo_bloqueo: t.motivo_bloqueo ?? "",
    });
    setOpenForm(true);
  };

  const guardar = async () => {
    if (!form.descripcion_problema.trim()) {
      toast.error("Cargá el trabajo o problema a resolver");
      return;
    }

    let clienteId: string | null = form.cliente_id || null;

    if (!clienteId && form.cliente_text.trim()) {
      const existente = clientes.find(
        (c) => c.nombre.toLowerCase() === form.cliente_text.trim().toLowerCase(),
      );

      if (existente) {
        clienteId = existente.id;
      } else {
        const { data, error } = await supabase
          .from("clientes")
          .insert({ nombre: form.cliente_text.trim(), sucursal: form.sucursal })
          .select("id")
          .single();

        if (error) {
          toast.error(error.message);
          return;
        }

        clienteId = data.id;
      }
    }

    const payload = {
      cliente_id: clienteId,
      marca: form.marca,
      sucursal: form.sucursal,
      tipo_trabajo: form.tipo_trabajo,
      descripcion_problema: form.descripcion_problema.trim(),
      prioridad: form.prioridad,
      estado_general: form.estado_general,
      responsable_principal_id: form.responsable_principal_id || null,
      fecha_compromiso: form.fecha_compromiso || null,
      proxima_accion: form.proxima_accion.trim() || null,
      motivo_bloqueo: form.estado_general === "en_pausa" ? form.motivo_bloqueo.trim() || null : null,
      creado_por: editing ? undefined : user?.id,
    };

    const { error } = editing
      ? await supabase.from("trabajos").update(payload).eq("id", editing.id)
      : await supabase.from("trabajos").insert(payload);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(editing ? "Trabajo actualizado" : "Trabajo creado");
    setOpenForm(false);
    load();
  };

  const moverEstado = async (trabajo: Trabajo, estado: EstadoTrabajo) => {
    const { error } = await supabase
      .from("trabajos")
      .update({
        estado_general: estado,
        cerrado_en: estado === "completado" ? new Date().toISOString() : null,
        cerrado_por: estado === "completado" ? user?.id : null,
      })
      .eq("id", trabajo.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    load();
  };

  const columnas = ESTADOS.map((estado) => ({
    ...estado,
    items: filtered.filter((t) => normalizarEstado(String(t.estado_general)) === estado.key),
  }));

  return (
    <div className="container max-w-[1800px] py-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trabajos</h1>
          <p className="text-sm text-muted-foreground">
            Gestión simple de trabajos: pendiente, programado, iniciado, en pausa y completado.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative w-full sm:w-[300px]">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente, técnico o problema..."
              className="pl-8"
            />
          </div>

          <Select value={fSucursal} onValueChange={setFSucursal}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sucursal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {SUCURSALES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={fTecnico} onValueChange={setFTecnico}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Técnico" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los técnicos</SelectItem>
              {tecnicos.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={fPrioridad} onValueChange={setFPrioridad}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {PRIORIDADES.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={openNuevo}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo trabajo
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Cargando trabajos...</Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-5">
          {columnas.map((col) => (
            <Card key={col.key} className="min-h-[560px] p-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">{col.label}</h2>
                <Badge variant="secondary">{col.items.length}</Badge>
              </div>

              <div className="space-y-2">
                {col.items.map((t) => {
                  const cli = t.cliente_id ? cliById.get(t.cliente_id) : null;
                  const tecnico = t.responsable_principal_id ? profById.get(t.responsable_principal_id) : null;

                  return (
                    <button
                      key={t.id}
                      onClick={() => openEditar(t)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left shadow-sm transition hover:shadow-md",
                        estadoColor(String(t.estado_general)),
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {cli?.nombre ?? "Sin cliente"}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {t.sucursal} · {t.marca}
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {PRIORIDADES.find((p) => p.key === t.prioridad)?.label ?? t.prioridad}
                        </Badge>
                      </div>

                      <div className="mt-2 line-clamp-3 text-sm">
                        {t.descripcion_problema}
                      </div>

                      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Wrench className="h-3 w-3" />
                        <span className="truncate">{tecnico?.nombre ?? "Sin técnico"}</span>
                      </div>

                      {t.fecha_compromiso && (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Fecha: {t.fecha_compromiso}
                        </div>
                      )}

                      {siguientesEstados(String(t.estado_general)).length > 0 && (
                        <div className="mt-3 grid grid-cols-1 gap-1">
                          {siguientesEstados(String(t.estado_general)).map((estadoSiguiente) => {
                            const e = ESTADOS.find((x) => x.key === estadoSiguiente);
                            if (!e) return null;

                            return (
                              <Button
                                key={e.key}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px]"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  moverEstado(t, e.key);
                                }}
                              >
                                Pasar a {e.label}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar trabajo" : "Nuevo trabajo"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Input
                list="clientes-trabajos"
                value={form.cliente_text}
                onChange={(e) => {
                  const value = e.target.value;
                  const match = clientes.find((c) => c.nombre.toLowerCase() === value.toLowerCase());

                  setForm((f) => ({
                    ...f,
                    cliente_text: value,
                    cliente_id: match?.id ?? "",
                  }));
                }}
                placeholder="Buscar o escribir cliente..."
              />
              <datalist id="clientes-trabajos">
                {clientesFiltrados.map((c) => (
                  <option key={c.id} value={c.nombre} />
                ))}
              </datalist>
              <p className="text-[11px] text-muted-foreground">
                Si no existe, se crea automáticamente al guardar.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Sucursal</Label>
                <Select value={form.sucursal} onValueChange={(v) => setForm((f) => ({ ...f, sucursal: v as Sucursal }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUCURSALES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Marca</Label>
                <Select value={form.marca} onValueChange={(v) => setForm((f) => ({ ...f, marca: v as Marca }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARCAS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Técnico responsable</Label>
                <Select
                  value={form.responsable_principal_id || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, responsable_principal_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar técnico" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    <SelectItem value="none">— Sin asignar —</SelectItem>
                    {tecnicos.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nombre}{t.sucursal ? ` · ${t.sucursal}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select
                  value={form.estado_general}
                  onValueChange={(v) => setForm((f) => ({ ...f, estado_general: v as EstadoTrabajo }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS.map((e) => (
                      <SelectItem key={e.key} value={e.key}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Prioridad</Label>
                <Select value={form.prioridad} onValueChange={(v) => setForm((f) => ({ ...f, prioridad: v as PrioridadTrabajo }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORIDADES.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Fecha compromiso</Label>
                <Input
                  type="date"
                  value={form.fecha_compromiso}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_compromiso: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Trabajo o problema a resolver</Label>
              <Textarea
                value={form.descripcion_problema}
                onChange={(e) => setForm((f) => ({ ...f, descripcion_problema: e.target.value }))}
                rows={4}
                placeholder="Describí el problema o trabajo pendiente..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Próxima acción</Label>
              <Input
                value={form.proxima_accion}
                onChange={(e) => setForm((f) => ({ ...f, proxima_accion: e.target.value }))}
                placeholder="Ej: Coordinar visita, pedir repuesto, esperar aprobación..."
              />
            </div>

            {form.estado_general === "en_pausa" && (
              <div className="space-y-1.5">
                <Label>Motivo de pausa</Label>
                <Textarea
                  value={form.motivo_bloqueo}
                  onChange={(e) => setForm((f) => ({ ...f, motivo_bloqueo: e.target.value }))}
                  rows={2}
                  placeholder="Ej: esperando repuesto, cliente no confirma, falta autorización..."
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar}>
              {editing ? "Guardar cambios" : "Crear trabajo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

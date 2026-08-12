import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Phone,
  MessageCircle,
  Mail,
  Pencil,
  Plus,
  Trash2,
  Save,
  X,
  CalendarPlus,
  Building2,
  Users as UsersIcon,
  Tractor,
  ClipboardList,
  Receipt,
  ArrowRightLeft,
} from "lucide-react";
import { TransferirMaquinaDialog, type MaquinaParaTransferir } from "./TransferirMaquinaDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { SUCURSALES, MARCAS, type Sucursal, type Marca } from "@/lib/constants";
import { cn, formatGuaranies } from "@/lib/utils";
import { normalizarEstadoTrabajo, trabajoReferencia } from "@/lib/trabajos";
import { MACHINE_SUBGROUPS } from "@/lib/machineModels";
import { ModeloMaquinaSelect } from "./ModeloMaquinaSelect";

const RESULTADOS = [
  "Contactado",
  "No contesta",
  "Rechazó",
  "Agendó servicio",
  "Pendiente llamar",
] as const;

type Cliente = {
  id: string;
  nombre: string;
  ruc: string | null;
  region: string | null;
  direccion: string | null;
  localidad: string | null;
  correo_principal: string | null;
  telefono: string | null;
  sucursal: Sucursal | null;
};
type Contacto = {
  id: string;
  cliente_id: string;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  correo: string | null;
  es_whatsapp: boolean;
  es_principal: boolean;
  activo: boolean;
};
type Maquina = {
  id: string;
  cliente_id: string | null;
  anio: number | null;
  sucursal: Sucursal | null;
  localidad: string | null;
  subgrupo: string;
  modelo_tipo: string | null;
  serie: string;
  vendedor: string | null;
  marca: Marca;
  agregado_manualmente: boolean;
  activo: boolean;
  notas: string | null;
};
type Seguimiento = {
  id: string;
  cliente_id: string;
  usuario_id: string | null;
  fecha: string;
  resultado: string;
  observaciones: string | null;
  trabajo_id?: string | null;
};
type Factura = {
  id: string;
  fecha: string;
  tipo: "Repuesto" | "Servicio";
  total_venta: number;
  grupo: string | null;
  grupo_fx: string | null;
  cod_factura: string;
};
type TrabajoCliente = {
  id: string;
  cliente_id: string | null;
  codigo: string | null;
  os_numero: string | null;
  creado_en: string;
  estado_general: string;
  descripcion_problema: string;
};

interface Props {
  clienteId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
  onCrearServicio?: (clienteId: string) => void;
}

const resultadoColor = (r: string | undefined) => {
  switch (r) {
    case "Agendó servicio":
      return "bg-emerald-500 text-white";
    case "Contactado":
      return "bg-blue-500 text-white";
    case "Pendiente llamar":
      return "bg-amber-500 text-white";
    case "No contesta":
      return "bg-muted text-foreground";
    case "Rechazó":
      return "bg-destructive text-destructive-foreground";
    default:
      return "bg-muted text-foreground";
  }
};

const fmtMoney = (n: number) => formatGuaranies(n);

const initials = (s: string) =>
  s
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function ClientePanel({ clienteId, open, onOpenChange, onChanged, onCrearServicio }: Props) {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [trabajos, setTrabajos] = useState<TrabajoCliente[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  // Editing states
  const [editCliente, setEditCliente] = useState(false);
  const [cForm, setCForm] = useState<Partial<Cliente>>({});
  const [editContacto, setEditContacto] = useState<string | null>(null);
  const [newContacto, setNewContacto] = useState(false);
  const [contactoForm, setContactoForm] = useState<Partial<Contacto>>({});
  const [editMaquina, setEditMaquina] = useState<string | null>(null);
  const [newMaquina, setNewMaquina] = useState(false);
  const [maquinaForm, setMaquinaForm] = useState<Partial<Maquina>>({});
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [transferMaquina, setTransferMaquina] = useState<MaquinaParaTransferir | null>(null);
  const [maquinaAEliminar, setMaquinaAEliminar] = useState<Maquina | null>(null);
  const [eliminandoMaquina, setEliminandoMaquina] = useState(false);

  // Seguimiento form
  const [segResultado, setSegResultado] = useState<string>("Contactado");
  const [segObs, setSegObs] = useState("");

  const cargar = async (id: string) => {
    setLoading(true);
    const [c, ct, m, s, f, t, p] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre, ruc, region, direccion, localidad, correo_principal, telefono, sucursal")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("contactos_cliente").select("*").eq("cliente_id", id).order("es_principal", { ascending: false }),
      supabase.from("parque_maquinas").select("*").eq("cliente_id", id),
      supabase.from("seguimiento_comercial").select("*").eq("cliente_id", id).order("fecha", { ascending: false }),
      supabase.from("facturacion").select("*").eq("cliente_id", id).eq("excluido_de_reportes", false).order("fecha", { ascending: false }),
      supabase
        .from("trabajos")
        .select("id, cliente_id, codigo, os_numero, creado_en, estado_general, descripcion_problema")
        .eq("cliente_id", id)
        .order("creado_en", { ascending: false }),
      supabase.from("profiles").select("id, nombre"),
    ]);
    setCliente((c.data ?? null) as Cliente | null);
    setContactos((ct.data ?? []) as Contacto[]);
    setMaquinas((m.data ?? []) as Maquina[]);
    setSeguimientos((s.data ?? []) as Seguimiento[]);
    setFacturas(
      ((f.data ?? []) as Factura[]).map((x) => ({ ...x, total_venta: Number(x.total_venta) })),
    );
    setTrabajos((t.data ?? []) as TrabajoCliente[]);
    setProfiles(
      Object.fromEntries(((p.data ?? []) as { id: string; nombre: string }[]).map((u) => [u.id, u.nombre])),
    );
    setLoading(false);
  };

  useEffect(() => {
    if (open && clienteId) {
      cargar(clienteId);
      setEditCliente(false);
      setEditContacto(null);
      setNewContacto(false);
      setEditMaquina(null);
      setNewMaquina(false);
      setSegResultado("Contactado");
      setSegObs("");
    }
  }, [open, clienteId]);

  // ===== Cliente =====
  const guardarCliente = async () => {
    if (!cliente) return;
    const { error } = await supabase
      .from("clientes")
      .update({
        nombre: cForm.nombre ?? cliente.nombre,
        ruc: cForm.ruc ?? null,
        region: cForm.region ?? null,
        direccion: cForm.direccion ?? null,
        localidad: cForm.localidad ?? null,
        correo_principal: cForm.correo_principal ?? null,
        telefono: cForm.telefono ?? null,
      })
      .eq("id", cliente.id);
    if (error) return toast.error(error.message);
    toast.success("Cliente actualizado");
    setEditCliente(false);
    await cargar(cliente.id);
    onChanged();
  };

  // ===== Contactos =====
  const guardarContacto = async () => {
    if (!cliente) return;
    if (!contactoForm.nombre?.trim()) return toast.error("Nombre requerido");
    if (editContacto) {
      const { error } = await supabase
        .from("contactos_cliente")
        .update({
          nombre: contactoForm.nombre,
          cargo: contactoForm.cargo ?? null,
          telefono: contactoForm.telefono ?? null,
          correo: contactoForm.correo ?? null,
          es_whatsapp: !!contactoForm.es_whatsapp,
          es_principal: !!contactoForm.es_principal,
        })
        .eq("id", editContacto);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("contactos_cliente").insert({
        cliente_id: cliente.id,
        nombre: contactoForm.nombre!,
        cargo: contactoForm.cargo ?? null,
        telefono: contactoForm.telefono ?? null,
        correo: contactoForm.correo ?? null,
        es_whatsapp: !!contactoForm.es_whatsapp,
        es_principal: !!contactoForm.es_principal,
      });
      if (error) return toast.error(error.message);
    }
    // Si es principal, desmarcar otros
    if (contactoForm.es_principal) {
      await supabase
        .from("contactos_cliente")
        .update({ es_principal: false })
        .eq("cliente_id", cliente.id)
        .neq("id", editContacto ?? "00000000-0000-0000-0000-000000000000");
    }
    toast.success("Contacto guardado");
    setEditContacto(null);
    setNewContacto(false);
    setContactoForm({});
    await cargar(cliente.id);
    onChanged();
  };

  const desactivarContacto = async (id: string) => {
    const { error } = await supabase.from("contactos_cliente").update({ activo: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Contacto desactivado");
    if (cliente) await cargar(cliente.id);
    onChanged();
  };

  // ===== Máquinas =====
  const guardarMaquina = async () => {
    if (!cliente) return;
    if (!maquinaForm.serie?.trim()) return toast.error("Número de serie requerido");
    if (editMaquina) {
      const { error } = await supabase
        .from("parque_maquinas")
        .update({
          anio: maquinaForm.anio ?? null,
          marca: (maquinaForm.marca ?? "CLAAS") as Marca,
          subgrupo: (maquinaForm.subgrupo ?? "OTRO") as never,
          modelo_tipo: maquinaForm.modelo_tipo ?? null,
          serie: maquinaForm.serie!,
          sucursal: (maquinaForm.sucursal ?? null) as Sucursal | null,
          localidad: maquinaForm.localidad ?? null,
          vendedor: maquinaForm.vendedor ?? null,
          notas: maquinaForm.notas ?? null,
        })
        .eq("id", editMaquina);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("parque_maquinas").insert({
        cliente_id: cliente.id,
        anio: maquinaForm.anio ?? null,
        marca: (maquinaForm.marca ?? "CLAAS") as Marca,
        subgrupo: (maquinaForm.subgrupo ?? "OTRO") as never,
        modelo_tipo: maquinaForm.modelo_tipo ?? null,
        serie: maquinaForm.serie!,
        sucursal: (maquinaForm.sucursal ?? cliente.sucursal ?? null) as Sucursal | null,
        localidad: maquinaForm.localidad ?? null,
        vendedor: maquinaForm.vendedor ?? null,
        notas: maquinaForm.notas ?? null,
        agregado_manualmente: true,
      });
      if (error) return toast.error(error.message);
    }
    await queryClient.invalidateQueries({ queryKey: ["parque-modelos-catalogo"] });
    toast.success("Máquina guardada");
    setEditMaquina(null);
    setNewMaquina(false);
    setMaquinaForm({});
    await cargar(cliente.id);
    onChanged();
  };

  const desactivarMaquina = async (id: string) => {
    const { error } = await supabase.from("parque_maquinas").update({ activo: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Máquina desactivada");
    if (cliente) await cargar(cliente.id);
    onChanged();
  };

  const reactivarMaquina = async (id: string) => {
    const { error } = await supabase.from("parque_maquinas").update({ activo: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Máquina reactivada");
    if (cliente) await cargar(cliente.id);
    onChanged();
  };

  const eliminarMaquina = async () => {
    if (!maquinaAEliminar || !cliente || eliminandoMaquina) return;
    setEliminandoMaquina(true);

    try {
      const { count, error: trabajosError } = await supabase
        .from("trabajos")
        .select("id", { count: "exact", head: true })
        .eq("maquina_id", maquinaAEliminar.id);

      if (trabajosError) throw trabajosError;
      if ((count ?? 0) > 0) {
        toast.error("No se puede eliminar porque la máquina tiene trabajos vinculados. Podés inactivarla para conservar el historial.");
        return;
      }

      const { error } = await supabase
        .from("parque_maquinas")
        .delete()
        .eq("id", maquinaAEliminar.id);

      if (error) throw error;

      toast.success("Máquina eliminada definitivamente");
      setMaquinaAEliminar(null);
      await cargar(cliente.id);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la máquina");
    } finally {
      setEliminandoMaquina(false);
    }
  };

  const seguimientosCompletos = useMemo(() => {
    if (!cliente) return [];

    const refsRegistradas = new Set(
      seguimientos
        .flatMap((seguimiento) => [
          seguimiento.trabajo_id ?? "",
          ...(seguimiento.observaciones?.match(/(?:TR|OS)-\d+/g) ?? []),
        ])
        .filter(Boolean),
    );

    const manuales = seguimientos.map((seguimiento) => ({
      ...seguimiento,
      derivadoDeTrabajo: false,
    }));

    const derivados = trabajos
      .map((trabajo) => {
        const ref = trabajoReferencia(trabajo);
        return {
          id: `trabajo-${trabajo.id}`,
          cliente_id: cliente.id,
          usuario_id: null,
          fecha: trabajo.creado_en,
          resultado: "Agendó servicio",
          observaciones: `TR asociado: ${ref}\n${trabajo.descripcion_problema}`,
          trabajo_id: trabajo.id,
          derivadoDeTrabajo: true,
          ref,
        };
      })
      .filter((item) => !refsRegistradas.has(item.trabajo_id) && !refsRegistradas.has(item.ref));

    return [...manuales, ...derivados].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
    );
  }, [cliente, seguimientos, trabajos]);

  // ===== Seguimientos =====
  const agregarSeguimiento = async () => {
    if (!cliente || !user) return;
    const trabajoAsociado =
      segResultado === "Agendó servicio"
        ? trabajos.find((trabajo) => normalizarEstadoTrabajo(trabajo.estado_general) !== "completado") ?? trabajos[0] ?? null
        : null;
    const referenciaTrabajo = trabajoAsociado ? trabajoReferencia(trabajoAsociado) : "";
    const observaciones = [
      segObs.trim() || null,
      referenciaTrabajo ? `TR asociado: ${referenciaTrabajo}` : null,
    ].filter(Boolean).join("\n");
    const payload = {
      cliente_id: cliente.id,
      usuario_id: user.id,
      resultado: segResultado as never,
      observaciones: observaciones || null,
      ...(trabajoAsociado ? { trabajo_id: trabajoAsociado.id } : {}),
    };

    let { error } = await supabase.from("seguimiento_comercial").insert(payload);
    if (error && trabajoAsociado && /trabajo_id|schema cache|column/i.test(error.message ?? "")) {
      const { trabajo_id: _trabajoId, ...payloadSinTrabajo } = payload as typeof payload & { trabajo_id?: string };
      const retry = await supabase.from("seguimiento_comercial").insert(payloadSinTrabajo);
      error = retry.error;
    }
    if (error) return toast.error(error.message);
    toast.success("Seguimiento registrado");
    setSegObs("");
    await cargar(cliente.id);
    onChanged();
  };

  // ===== Facturación stats =====
  const factStats = useMemo(() => {
    const hoy = new Date();
    const inicioAño = new Date(hoy.getFullYear(), 0, 1);
    const inicioPrev = new Date(hoy.getFullYear() - 1, 0, 1);
    const finPrev = new Date(hoy.getFullYear(), 0, 1);
    const calc = (tipo: "Repuesto" | "Servicio") => {
  let ytd = 0, prev = 0;
  const lista: Factura[] = [];

  for (const f of facturas) {
    if (f.tipo !== tipo) continue;

    const grupoFx = (f.grupo_fx ?? "").trim().toUpperCase();

    if (
      tipo === "Servicio" &&
      grupoFx !== "MANO DE OBRA" &&
      grupoFx !== "KILOMETRAJE"
    ) {
      continue;
    }

    const d = new Date(f.fecha);

    if (d >= inicioAño) ytd += f.total_venta;
    else if (d >= inicioPrev && d < finPrev) prev += f.total_venta;

    lista.push(f);
  }

  const varPct = prev > 0 ? Math.round(((ytd - prev) / prev) * 100) : ytd > 0 ? 100 : null;
  return { ytd, prev, varPct, lista: lista.slice(0, 10) };
};
    return { Repuesto: calc("Repuesto"), Servicio: calc("Servicio") };
  }, [facturas]);

  if (!cliente && !loading) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl">
          <div className="p-6 text-center text-muted-foreground">Sin cliente seleccionado.</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="mb-3">
          <SheetTitle className="text-lg">{cliente?.nombre ?? "Cargando..."}</SheetTitle>
        </SheetHeader>

        {/* Datos generales */}
        <section className="mb-5 rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-primary" /> Datos generales
            </div>
            {!editCliente ? (
              <Button variant="ghost" size="sm" onClick={() => { setCForm(cliente ?? {}); setEditCliente(true); }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditCliente(false)}><X className="h-3.5 w-3.5" /></Button>
                <Button size="sm" onClick={guardarCliente}><Save className="mr-1 h-3.5 w-3.5" />Guardar</Button>
              </div>
            )}
          </div>
          {!editCliente ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">RUC:</span> {cliente?.ruc ?? "—"}</div>
              <div><span className="text-muted-foreground">Sucursal:</span> {Array.from(new Set(maquinas.map((m) => m.sucursal).filter(Boolean))).join(", ") || "—"}</div>
              <div><span className="text-muted-foreground">Región:</span> {cliente?.region ?? "—"}</div>
              <div><span className="text-muted-foreground">Localidad:</span> {cliente?.localidad ?? "—"}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Dirección:</span> {cliente?.direccion ?? "—"}</div>
              <div><span className="text-muted-foreground">Correo:</span> {cliente?.correo_principal ?? "—"}</div>
              <div><span className="text-muted-foreground">Teléfono:</span> {cliente?.telefono ?? "—"}</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[11px]">Nombre</Label><Input value={cForm.nombre ?? ""} onChange={(e) => setCForm({ ...cForm, nombre: e.target.value })} /></div>
              <div><Label className="text-[11px]">RUC</Label><Input value={cForm.ruc ?? ""} onChange={(e) => setCForm({ ...cForm, ruc: e.target.value })} /></div>
              <div><Label className="text-[11px]">Región</Label><Input value={cForm.region ?? ""} onChange={(e) => setCForm({ ...cForm, region: e.target.value })} /></div>
              <div><Label className="text-[11px]">Localidad</Label><Input value={cForm.localidad ?? ""} onChange={(e) => setCForm({ ...cForm, localidad: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-[11px]">Dirección</Label><Input value={cForm.direccion ?? ""} onChange={(e) => setCForm({ ...cForm, direccion: e.target.value })} /></div>
              <div><Label className="text-[11px]">Correo principal</Label><Input value={cForm.correo_principal ?? ""} onChange={(e) => setCForm({ ...cForm, correo_principal: e.target.value })} /></div>
              <div><Label className="text-[11px]">Teléfono</Label><Input value={cForm.telefono ?? ""} onChange={(e) => setCForm({ ...cForm, telefono: e.target.value })} /></div>
            </div>
          )}
        </section>

        {/* Contactos */}
        <section className="mb-5 rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UsersIcon className="h-4 w-4 text-primary" /> Contactos
              <Badge variant="secondary" className="text-[10px]">{contactos.filter((c) => c.activo).length}</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setNewContacto(true); setEditContacto(null); setContactoForm({}); }}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {contactos.filter((c) => c.activo).length === 0 && !newContacto && (
              <div className="text-xs text-muted-foreground">Sin contactos.</div>
            )}
            {contactos.filter((c) => c.activo).map((c) => (
              <div key={c.id} className="rounded-md border p-2">
                {editContacto === c.id ? (
                  <ContactoForm form={contactoForm} setForm={setContactoForm} onSave={guardarContacto} onCancel={() => { setEditContacto(null); setContactoForm({}); }} />
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{c.nombre}</span>
                        {c.es_principal && <Badge className="text-[9px] bg-primary text-primary-foreground">Principal</Badge>}
                      </div>
                      {c.cargo && <div className="text-[11px] text-muted-foreground">{c.cargo}</div>}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                        {c.telefono && (
                          <a href={`tel:${c.telefono}`} className="flex items-center gap-1 hover:text-primary">
                            <Phone className="h-3 w-3" /> {c.telefono}
                          </a>
                        )}
                        {c.es_whatsapp && c.telefono && (
                          <a href={`https://wa.me/${c.telefono.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-600 hover:underline">
                            <MessageCircle className="h-3 w-3" /> WhatsApp
                          </a>
                        )}
                        {c.correo && (
                          <a href={`mailto:${c.correo}`} className="flex items-center gap-1 hover:text-primary">
                            <Mail className="h-3 w-3" /> {c.correo}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditContacto(c.id); setContactoForm(c); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => desactivarContacto(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {newContacto && (
              <div className="rounded-md border border-dashed p-2">
                <ContactoForm form={contactoForm} setForm={setContactoForm} onSave={guardarContacto} onCancel={() => { setNewContacto(false); setContactoForm({}); }} />
              </div>
            )}
          </div>
        </section>

        {/* Máquinas */}
        <section className="mb-5 rounded-lg border bg-card p-3">
          {(() => {
            const activas = maquinas.filter((m) => m.activo);
            const inactivas = maquinas.filter((m) => !m.activo);
            const visibles = mostrarInactivas ? maquinas : activas;
            return (
              <>
                <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Tractor className="h-4 w-4 text-primary" /> Máquinas
                    <Badge variant="secondary" className="text-[10px]">{activas.length} activas</Badge>
                    {inactivas.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">{inactivas.length} inactivas</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {inactivas.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMostrarInactivas((v) => !v)}
                        className="h-8 text-xs"
                      >
                        {mostrarInactivas ? "Ocultar inactivas" : "Ver inactivas"}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => { setNewMaquina(true); setEditMaquina(null); setMaquinaForm({}); }}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {visibles.length === 0 && !newMaquina && (
                    <div className="text-xs text-muted-foreground">Sin máquinas.</div>
                  )}
                  {visibles.map((m) => (
                    <div key={m.id} className={cn("rounded-md border p-2", !m.activo && "opacity-60 bg-muted/30")}>
                      {editMaquina === m.id ? (
                        <MaquinaForm form={maquinaForm} setForm={setMaquinaForm} onSave={guardarMaquina} onCancel={() => { setEditMaquina(null); setMaquinaForm({}); }} />
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge className={cn("text-[10px]", m.marca === "CLAAS" ? "bg-emerald-600 text-white" : m.marca === "HORSCH" ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground border")}>
                                {m.marca}
                              </Badge>
                              <span className="text-sm font-medium">{m.anio ?? "—"}</span>
                              <Badge variant="outline" className="text-[10px]">{m.subgrupo}</Badge>
                              {m.agregado_manualmente && <Badge variant="secondary" className="text-[9px]">Manual</Badge>}
                              {!m.activo && <Badge variant="destructive" className="text-[9px]">Inactiva</Badge>}
                            </div>
                            <div className="mt-0.5 text-xs">{m.modelo_tipo ?? "—"}</div>
                            <div className="text-[11px] text-muted-foreground">Serie: {m.serie}</div>
                          </div>
                          <div className="flex gap-1">
                            {m.activo ? (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => { setEditMaquina(m.id); setMaquinaForm(m); }} title="Editar datos">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Transferir a otro cliente"
                                  onClick={() => setTransferMaquina({
                                    id: m.id,
                                    clienteIdActual: m.cliente_id,
                                    marca: m.marca,
                                    modelo_tipo: m.modelo_tipo,
                                    serie: m.serie,
                                    anio: m.anio,
                                    subgrupo: m.subgrupo,
                                    notas: m.notas,
                                  })}
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => desactivarMaquina(m.id)} className="text-xs h-8" title="Marcar como inactiva">
                                  Inactivar
                                </Button>
                              </>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => reactivarMaquina(m.id)} className="text-xs h-8">
                                Reactivar
                              </Button>
                            )}
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setMaquinaAEliminar(m)}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Eliminar definitivamente"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {newMaquina && (
                    <div className="rounded-md border border-dashed p-2">
                      <MaquinaForm form={maquinaForm} setForm={setMaquinaForm} onSave={guardarMaquina} onCancel={() => { setNewMaquina(false); setMaquinaForm({}); }} />
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </section>

        {/* Seguimientos */}
        <section className="mb-5 rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="h-4 w-4 text-primary" /> Seguimientos
            <Badge variant="secondary" className="text-[10px]">{seguimientosCompletos.length}</Badge>
          </div>
          <div className="space-y-2">
            {seguimientosCompletos.length === 0 && (
              <div className="text-xs text-muted-foreground">Sin seguimientos.</div>
            )}
            {seguimientosCompletos.map((s) => {
              const nombre = s.derivadoDeTrabajo ? "Sistema" : s.usuario_id ? profiles[s.usuario_id] ?? "?" : "?";
              return (
                <div key={s.id} className="flex gap-2 rounded-md border p-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {initials(nombre)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium">{nombre}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(s.fecha).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                      <Badge className={cn("text-[10px]", resultadoColor(s.resultado))}>{s.resultado}</Badge>
                      {s.derivadoDeTrabajo && <Badge variant="outline" className="text-[10px]">TR asociado</Badge>}
                    </div>
                    {s.observaciones && <div className="mt-1 text-xs text-foreground/80">{s.observaciones}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 space-y-2 rounded-md border border-dashed p-2">
            <div className="text-[11px] font-medium text-muted-foreground">Nuevo seguimiento</div>
            <Select value={segResultado} onValueChange={setSegResultado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESULTADOS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Observaciones..."
              value={segObs}
              onChange={(e) => setSegObs(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={agregarSeguimiento} className="flex-1">
                <Save className="mr-1 h-3.5 w-3.5" /> Registrar
              </Button>
              {segResultado === "Agendó servicio" && cliente && onCrearServicio && (
                <Button size="sm" variant="outline" onClick={() => onCrearServicio(cliente.id)}>
                  <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Crear servicio
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Facturación */}
        <section className="mb-5 rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Receipt className="h-4 w-4 text-primary" /> Facturación
          </div>
          <Tabs defaultValue="Repuesto">
            <TabsList className="w-full">
              <TabsTrigger value="Repuesto" className="flex-1">Repuestos</TabsTrigger>
              <TabsTrigger value="Servicio" className="flex-1">Servicios</TabsTrigger>
            </TabsList>
            {(["Repuesto", "Servicio"] as const).map((t) => {
              const st = factStats[t];
              return (
                <TabsContent key={t} value={t} className="space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md border p-2">
                      <div className="text-[10px] uppercase text-muted-foreground">YTD</div>
                      <div className="text-sm font-bold">$ {fmtMoney(st.ytd)}</div>
                    </div>
                    <div className="rounded-md border p-2">
                      <div className="text-[10px] uppercase text-muted-foreground">Año ant.</div>
                      <div className="text-sm font-bold">$ {fmtMoney(st.prev)}</div>
                    </div>
                    <div className="rounded-md border p-2">
                      <div className="text-[10px] uppercase text-muted-foreground">Var %</div>
                      <div className={cn(
                        "text-sm font-bold",
                        st.varPct != null && st.varPct >= 0 && "text-emerald-600",
                        st.varPct != null && st.varPct < 0 && "text-destructive",
                      )}>
                        {st.varPct != null ? `${st.varPct > 0 ? "+" : ""}${st.varPct}%` : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border">
                    {st.lista.length === 0 ? (
                      <div className="p-3 text-center text-xs text-muted-foreground">Sin facturas.</div>
                    ) : (
                      <div className="divide-y">
                        {st.lista.map((f) => (
                          <div key={f.id} className="flex items-center justify-between gap-2 p-2 text-xs">
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] text-muted-foreground">
                                {new Date(f.fecha).toLocaleDateString("es-PY")} · {f.cod_factura}
                              </div>
                              <div className="truncate">{f.grupo ?? "—"}</div>
                            </div>
                            <div className="font-semibold tabular-nums">$ {fmtMoney(f.total_venta)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </section>
      </SheetContent>
    </Sheet>

    <TransferirMaquinaDialog
      maquina={transferMaquina}
      clienteNombreActual={cliente?.nombre ?? ""}
      open={!!transferMaquina}
      onOpenChange={(v) => { if (!v) setTransferMaquina(null); }}
      onTransferred={async () => {
        setTransferMaquina(null);
        if (cliente) await cargar(cliente.id);
        onChanged();
      }}
    />

    <AlertDialog
      open={!!maquinaAEliminar}
      onOpenChange={(dialogOpen) => {
        if (!dialogOpen && !eliminandoMaquina) setMaquinaAEliminar(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar esta máquina definitivamente?</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará {maquinaAEliminar?.modelo_tipo || maquinaAEliminar?.subgrupo} · serie {maquinaAEliminar?.serie}.
            Esta acción no se puede deshacer. Si tiene trabajos vinculados, la eliminación será bloqueada para preservar el historial.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={eliminandoMaquina}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              eliminarMaquina();
            }}
            disabled={eliminandoMaquina}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {eliminandoMaquina ? "Eliminando..." : "Eliminar definitivamente"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function ContactoForm({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: Partial<Contacto>;
  setForm: (f: Partial<Contacto>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-[11px]">Nombre *</Label><Input value={form.nombre ?? ""} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
        <div><Label className="text-[11px]">Cargo</Label><Input value={form.cargo ?? ""} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></div>
        <div><Label className="text-[11px]">Teléfono</Label><Input value={form.telefono ?? ""} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
        <div><Label className="text-[11px]">Correo</Label><Input value={form.correo ?? ""} onChange={(e) => setForm({ ...form, correo: e.target.value })} /></div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <Checkbox checked={!!form.es_whatsapp} onCheckedChange={(v) => setForm({ ...form, es_whatsapp: !!v })} />
          Tiene WhatsApp
        </label>
        <label className="flex items-center gap-1.5">
          <Checkbox checked={!!form.es_principal} onCheckedChange={(v) => setForm({ ...form, es_principal: !!v })} />
          Es contacto principal
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={onSave}><Save className="mr-1 h-3.5 w-3.5" />Guardar</Button>
      </div>
    </div>
  );
}

function MaquinaForm({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: Partial<Maquina>;
  setForm: (f: Partial<Maquina>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">Año</Label>
          <Input type="number" value={form.anio ?? ""} onChange={(e) => setForm({ ...form, anio: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <Label className="text-[11px]">Marca</Label>
          <Select value={form.marca ?? "CLAAS"} onValueChange={(v) => setForm({ ...form, marca: v as Marca, modelo_tipo: null })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MARCAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px]">Subgrupo</Label>
          <Select value={form.subgrupo ?? "OTRO"} onValueChange={(v) => setForm({ ...form, subgrupo: v, modelo_tipo: null })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MACHINE_SUBGROUPS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px]">Modelo</Label>
          <ModeloMaquinaSelect
            marca={form.marca ?? "CLAAS"}
            subgrupo={form.subgrupo ?? "OTRO"}
            value={form.modelo_tipo}
            onValueChange={(modelo_tipo) => setForm({ ...form, modelo_tipo })}
          />
        </div>
        <div>
          <Label className="text-[11px]">N° Serie *</Label>
          <Input value={form.serie ?? ""} onChange={(e) => setForm({ ...form, serie: e.target.value })} />
        </div>
        <div>
          <Label className="text-[11px]">Sucursal</Label>
          <Select value={form.sucursal ?? ""} onValueChange={(v) => setForm({ ...form, sucursal: v as Sucursal })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px]">Localidad</Label>
          <Input value={form.localidad ?? ""} onChange={(e) => setForm({ ...form, localidad: e.target.value })} />
        </div>
        <div>
          <Label className="text-[11px]">Vendedor</Label>
          <Input value={form.vendedor ?? ""} onChange={(e) => setForm({ ...form, vendedor: e.target.value })} />
        </div>
        <div className="col-span-2">
          <Label className="text-[11px]">Notas</Label>
          <Textarea rows={2} value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={onSave}><Save className="mr-1 h-3.5 w-3.5" />Guardar</Button>
      </div>
    </div>
  );
}

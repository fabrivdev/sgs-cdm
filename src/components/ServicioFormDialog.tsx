import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronsUpDown, MapPin, Wrench, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useServicioTecnicos } from "@/hooks/useServicioTecnicos";
import { MARCAS, SUCURSALES, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerFooter, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";

interface Profile {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

interface Cliente {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

interface Servicio {
  id: string;
  fecha_programada: string;
  tecnico_responsable_id: string | null;
  auxiliares: string[];
  sucursal: Sucursal;
  cliente_id: string | null;
  marca: Marca;
  tipo_trabajo: TipoTrabajo;
  trabajo_descripcion: string;
  observaciones: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  servicio: Servicio | null;
  profiles: Profile[];
  clientes: Cliente[];
  onSaved: () => void;
  defaultDate?: string;
}

export function ServicioFormDialog({
  open,
  onOpenChange,
  servicio,
  clientes,
  onSaved,
  defaultDate,
}: Props) {
  const { user, profile, isAdmin } = useAuth();

  const [fecha, setFecha] = useState("");
  const [tipo, setTipo] = useState<TipoTrabajo>("Visita de campo");
  const [sucursal, setSucursal] = useState<Sucursal>(SUCURSALES[0]);
  const [marca, setMarca] = useState<Marca>("CLAAS");
  const [responsableId, setResponsableId] = useState<string>("");
  const [auxiliares, setAuxiliares] = useState<string[]>([]);
  const [clienteText, setClienteText] = useState("");
  const [trabajo, setTrabajo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [busy, setBusy] = useState(false);
  const [obsOpen, setObsOpen] = useState(false);
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);

  const [clientesInternos, setClientesInternos] = useState<Cliente[]>([]);
  const { data: tecnicosAutorizados = [] } = useServicioTecnicos(open);

  const cargarTodosLosClientes = async () => {
    const PAGE = 1000;
    let from = 0;
    const all: Cliente[] = [];

    while (true) {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nombre, sucursal")
        .order("nombre", { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      all.push(...((data ?? []) as Cliente[]));

      if (data.length < PAGE) break;
      from += PAGE;
    }

    return all;
  };

  useEffect(() => {
    if (!open) return;

    const cargarClientes = async () => {
      try {
        const all = await cargarTodosLosClientes();
        setClientesInternos(all);
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar todos los clientes");
      }
    };

    cargarClientes();
  }, [open]);

  const clientesDisponibles = clientesInternos.length > 0 ? clientesInternos : clientes;

  const tecnicos = tecnicosAutorizados;

  const cliById = useMemo(
    () => Object.fromEntries(clientesDisponibles.map((c) => [c.id, c.nombre])),
    [clientesDisponibles],
  );

  const clientesFiltrados = useMemo(() => {
    const q = clienteText.trim().toLowerCase();

    if (!q) return clientesDisponibles.slice(0, 100);

    return clientesDisponibles
      .filter((c) => c.nombre.toLowerCase().includes(q))
      .slice(0, 100);
  }, [clientesDisponibles, clienteText]);

  useEffect(() => {
    if (!open) return;

    if (servicio) {
      setFecha(servicio.fecha_programada);
      setTipo(servicio.tipo_trabajo ?? "Visita de campo");
      setSucursal(servicio.sucursal);
      setMarca(servicio.marca);
      setResponsableId(servicio.tecnico_responsable_id ?? "");
      setAuxiliares(servicio.auxiliares);
      setClienteText("");
      setTrabajo(servicio.trabajo_descripcion);
      setObservaciones(servicio.observaciones ?? "");
      setObsOpen(!!servicio.observaciones);
    } else {
      setFecha(defaultDate ?? new Date().toISOString().slice(0, 10));
      setTipo("Visita de campo");
      setSucursal(isAdmin ? SUCURSALES[0] : profile?.sucursal ?? SUCURSALES[0]);
      setMarca("CLAAS");
      setResponsableId("");
      setAuxiliares([]);
      setClienteText("");
      setTrabajo("");
      setObservaciones("");
      setObsOpen(false);
    }
  }, [servicio?.id, open, isAdmin, profile?.sucursal, defaultDate]);

  useEffect(() => {
    if (!open || !servicio?.cliente_id) return;
    const nombre = cliById[servicio.cliente_id];
    if (nombre) setClienteText(nombre);
  }, [open, servicio?.cliente_id, cliById]);

  const labelTecnico = (p: Profile) => (p.sucursal ? `${p.nombre} (${p.sucursal})` : p.nombre);
  const auxDisponibles = tecnicos.filter((p) => p.id !== responsableId);

  const toggleAux = (id: string) => {
    setAuxiliares((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!fecha || !trabajo.trim()) {
      toast.error("Completá fecha y trabajo a resolver");
      return;
    }

    setBusy(true);

    let cli: string | null = null;
    const nombreCli = clienteText.trim();

    if (nombreCli) {
      const existente = clientesDisponibles.find((c) => c.nombre.toLowerCase() === nombreCli.toLowerCase());

      if (existente) {
        cli = existente.id;
      } else {
        const { data, error } = await supabase
          .from("clientes")
          .insert({ nombre: nombreCli, sucursal: null })
          .select("id")
          .single();

        if (error) {
          toast.error(error.message);
          setBusy(false);
          return;
        }

        cli = data.id;
      }
    }

    const payload = {
      fecha_programada: fecha,
      sucursal,
      marca,
      tipo_trabajo: tipo,
      tecnico_responsable_id: responsableId || null,
      auxiliares,
      cliente_id: cli,
      trabajo_descripcion: trabajo.trim(),
      observaciones: observaciones.trim() || null,
      creado_por: user?.id,
      dia_semana: "",
      semana: 0,
    };

    if (servicio) {
      const fechaPrev = servicio.fecha_programada;
      const { error } = await supabase.from("servicios").update(payload).eq("id", servicio.id);

      if (error) {
        setBusy(false);
        toast.error(error.message);
        return;
      }

      if (fechaPrev !== fecha) {
        const { data: jornadaPrev } = await supabase
          .from("servicio_jornadas")
          .select("id")
          .eq("servicio_id", servicio.id)
          .eq("fecha", fechaPrev)
          .maybeSingle();

        const { data: choca } = await supabase
          .from("servicio_jornadas")
          .select("id")
          .eq("servicio_id", servicio.id)
          .eq("fecha", fecha)
          .maybeSingle();

        if (jornadaPrev?.id && !choca) {
          await supabase
            .from("servicio_jornadas")
            .update({ fecha })
            .eq("id", jornadaPrev.id);
        }
      }

      setBusy(false);
      toast.success("Servicio actualizado");
      onOpenChange(false);
      onSaved();
    } else {
      const { data: nuevo, error } = await supabase
        .from("servicios")
        .insert(payload)
        .select("id")
        .single();

      if (error) {
        setBusy(false);
        toast.error(error.message);
        return;
      }

      if (nuevo?.id) {
        const { error: errJornada } = await supabase.from("servicio_jornadas").insert({
          servicio_id: nuevo.id,
          fecha,
          estado: "Pendiente",
        });
        if (errJornada) console.error(errJornada);
      }

      setBusy(false);
      toast.success("Servicio creado");
      onOpenChange(false);
      onSaved();
    }
  };

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="lg">
      <ResponsiveDrawerHeader className="px-4 py-4 sm:px-6">
        <h2 className="pr-6 text-[14px] font-semibold sm:text-[14px]">
          {servicio ? "Editar servicio" : "Nuevo servicio"}
        </h2>
      </ResponsiveDrawerHeader>

      <ResponsiveDrawerBody className="px-4 sm:px-6">
        <div className="space-y-3 py-2 sm:space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setTipo("Visita de campo")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[12px] font-medium transition-colors",
                    tipo === "Visita de campo"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent",
                  )}
                >
                  <MapPin className="h-3.5 w-3.5" /> Visita
                </button>

                <button
                  type="button"
                  onClick={() => setTipo("Máquina en taller")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[12px] font-medium transition-colors",
                    tipo === "Máquina en taller"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent",
                  )}
                >
                  <Wrench className="h-3.5 w-3.5" /> Taller
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cliente-input">Cliente</Label>
            <Popover open={clientePopoverOpen} onOpenChange={setClientePopoverOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <span className={cn("truncate", !clienteText && "text-muted-foreground")}>{clienteText || "Buscá o escribí el nombre del cliente"}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                  <CommandInput placeholder="Buscar cliente…" value={clienteText} onValueChange={setClienteText} className="h-9" />
                  <CommandList>
                    {clienteText.trim() && (
                      <CommandGroup heading="Ingreso manual">
                        <CommandItem value={`__nuevo__${clienteText}`} onSelect={() => setClientePopoverOpen(false)} className="cursor-pointer">
                          Usar “{clienteText.trim()}” como nuevo cliente
                        </CommandItem>
                      </CommandGroup>
                    )}
                    <CommandEmpty>Sin coincidencias. Podés ingresarlo manualmente arriba.</CommandEmpty>
                    <CommandGroup heading="Clientes existentes">
                      {clientesFiltrados.map((c) => (
                        <CommandItem key={c.id} value={c.nombre} onSelect={() => { setClienteText(c.nombre); setClientePopoverOpen(false); }} className="cursor-pointer">
                          <span className="flex-1 truncate">{c.nombre}</span>
                          {c.sucursal && <span className="ml-2 text-[10px] text-muted-foreground">{c.sucursal}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-[11px] text-muted-foreground">Si no existe en la base, se crea automáticamente al guardar.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trabajo-input" className="text-[13px] font-semibold">Trabajo o problema a resolver</Label>
            <Textarea id="trabajo-input" value={trabajo} onChange={(e) => setTrabajo(e.target.value)} rows={3} placeholder="Ej: Cambio de aceite hidráulico, revisar pérdida en bomba…" className="text-[13px]" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Sucursal</Label>
              <Select value={sucursal} onValueChange={(v) => setSucursal(v as Sucursal)} disabled={!isAdmin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Marca</Label>
              <Select value={marca} onValueChange={(v) => setMarca(v as Marca)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MARCAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Técnico responsable</Label>
            <Select value={responsableId || "none"} onValueChange={(v) => setResponsableId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sin asignar —</SelectItem>
                {tecnicos.map((p) => <SelectItem key={p.id} value={p.id}>{labelTecnico(p)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Auxiliares <span className="text-[12px] font-normal text-muted-foreground">(opcional)</span></Label>
            {auxDisponibles.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No hay técnicos disponibles.</p>
            ) : (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-between font-normal">
                      <span className="truncate">{auxiliares.length === 0 ? "Seleccionar auxiliares" : `${auxiliares.length} seleccionado${auxiliares.length === 1 ? "" : "s"}`}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar técnico…" className="h-9" />
                      <CommandList>
                        <CommandEmpty>Sin resultados.</CommandEmpty>
                        <CommandGroup>
                          {auxDisponibles.map((p) => {
                            const active = auxiliares.includes(p.id);
                            return (
                              <CommandItem key={p.id} value={`${p.nombre} ${p.sucursal ?? ""}`} onSelect={() => toggleAux(p.id)} className="cursor-pointer">
                                <Checkbox checked={active} className="mr-2 pointer-events-none" />
                                <span className="flex-1 truncate">{p.nombre}</span>
                                {p.sucursal && <span className="ml-2 text-[10px] text-muted-foreground">{p.sucursal}</span>}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {auxiliares.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {auxiliares.map((id) => {
                      const p = tecnicos.find((x) => x.id === id);
                      if (!p) return null;
                      return (
                        <Badge key={id} variant="secondary" className="gap-1 pl-2 pr-1 text-[11px] font-normal">
                          {p.nombre}
                          <button type="button" onClick={() => toggleAux(id)} className="rounded-sm p-0.5 hover:bg-background/60"><X className="h-3 w-3" /></button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <Collapsible open={obsOpen} onOpenChange={setObsOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-dashed px-3 py-2 text-[12px] font-medium text-muted-foreground hover:bg-accent">
              <span>Observaciones {observaciones && <span className="ml-1 text-foreground">({observaciones.length} car.)</span>}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", obsOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder="Notas internas, recordatorios…" />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ResponsiveDrawerBody>

      <ResponsiveDrawerFooter className="px-4 py-3 sm:px-6 sm:py-4">
        <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">Cancelar</Button>
        <Button onClick={submit} disabled={busy} className="flex-1 sm:flex-none">{busy ? "Guardando…" : "Guardar"}</Button>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );
}

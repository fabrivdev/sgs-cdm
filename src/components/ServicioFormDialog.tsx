import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
// ScrollArea removed: interfered with Radix Select popovers inside Dialog
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronsUpDown, MapPin, Wrench, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MARCAS, SUCURSALES, TIPOS_TRABAJO, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Profile {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
  rol: string | null;
}
interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }
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

export function ServicioFormDialog({ open, onOpenChange, servicio, profiles, clientes, onSaved, defaultDate }: Props) {
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

  const cliById = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c.nombre])), [clientes]);

  useEffect(() => {
    if (!open) return;
    if (servicio) {
      setFecha(servicio.fecha_programada);
      setTipo(servicio.tipo_trabajo ?? "Visita de campo");
      setSucursal(servicio.sucursal);
      setMarca(servicio.marca);
      setResponsableId(servicio.tecnico_responsable_id ?? "");
      setAuxiliares(servicio.auxiliares);
      setClienteText(servicio.cliente_id ? (cliById[servicio.cliente_id] ?? "") : "");
      setTrabajo(servicio.trabajo_descripcion);
      setObservaciones(servicio.observaciones ?? "");
      setObsOpen(!!servicio.observaciones);
    } else {
      setFecha(defaultDate ?? new Date().toISOString().slice(0, 10));
      setTipo("Visita de campo");
      setSucursal(isAdmin ? SUCURSALES[0] : (profile?.sucursal ?? SUCURSALES[0]));
      setMarca("CLAAS");
      setResponsableId("");
      setAuxiliares([]);
      setClienteText("");
      setTrabajo("");
      setObservaciones("");
      setObsOpen(false);
    }
  }, [servicio, open, isAdmin, profile, defaultDate, cliById]);

  const tecnicos = profiles.filter((p) => {
  const rol = (p.rol ?? "").trim().toLowerCase();
  return rol !== "administrador" && rol !== "admin";
});
  const labelTecnico = (p: Profile) => p.sucursal ? `${p.nombre} (${p.sucursal})` : p.nombre;
  const auxDisponibles = tecnicos.filter((p) => p.id !== responsableId);

  const toggleAux = (id: string) => {
    setAuxiliares((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const submit = async () => {
    if (!fecha || !trabajo.trim()) { toast.error("Completá fecha y trabajo a resolver"); return; }
    setBusy(true);

    // Resolver cliente: si está vacío -> null; si coincide con uno existente -> ese id; si es nuevo -> crearlo
    let cli: string | null = null;
    const nombreCli = clienteText.trim();
    if (nombreCli) {
      const existente = clientes.find((c) => c.nombre.toLowerCase() === nombreCli.toLowerCase());
      if (existente) {
        cli = existente.id;
      } else {
        const { data, error } = await supabase
          .from("clientes")
          .insert({ nombre: nombreCli, sucursal: null })
          .select("id")
          .single();
        if (error) { toast.error(error.message); setBusy(false); return; }
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

    const { error } = servicio
      ? await supabase.from("servicios").update(payload).eq("id", servicio.id)
      : await supabase.from("servicios").insert(payload);

    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(servicio ? "Servicio actualizado" : "Servicio creado"); onOpenChange(false); onSaved(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-[calc(100vw-1.5rem)] sm:w-full max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 rounded-lg">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 shrink-0">
          <DialogTitle className="text-base sm:text-lg pr-6">{servicio ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6">
          <div className="space-y-3 sm:space-y-4 py-2">
            {/* Fecha + Tipo */}
            <div className="grid grid-cols-2 gap-3">
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
                      "flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                      tipo === "Visita de campo" ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent"
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5" /> Visita
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipo("Máquina en taller")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                      tipo === "Máquina en taller" ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent"
                    )}
                  >
                    <Wrench className="h-3.5 w-3.5" /> Taller
                  </button>
                </div>
              </div>
            </div>

            {/* Cliente */}
            <div className="space-y-1.5">
              <Label htmlFor="cliente-input">Cliente</Label>
              <Input
                id="cliente-input"
                list="clientes-list"
                value={clienteText}
                onChange={(e) => setClienteText(e.target.value)}
                placeholder="Escribí el nombre del cliente"
                autoComplete="off"
              />
              <datalist id="clientes-list">
                {clientes.map((c) => <option key={c.id} value={c.nombre} />)}
              </datalist>
              <p className="text-[11px] text-muted-foreground">Si no existe, se crea automáticamente al guardar.</p>
            </div>

            {/* Trabajo destacado */}
            <div className="space-y-1.5">
              <Label htmlFor="trabajo-input" className="text-sm font-semibold">Trabajo o problema a resolver</Label>
              <Textarea
                id="trabajo-input"
                value={trabajo}
                onChange={(e) => setTrabajo(e.target.value)}
                rows={3}
                placeholder="Ej: Cambio de aceite hidráulico, revisar pérdida en bomba…"
                className="text-sm"
              />
            </div>

            {/* Sucursal + Marca */}
            <div className="grid grid-cols-2 gap-3">
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

            {/* Responsable */}
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

            {/* Auxiliares — combobox multi-select */}
            <div className="space-y-1.5">
              <Label>Auxiliares <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
              {auxDisponibles.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay técnicos disponibles.</p>
              ) : (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="w-full justify-between font-normal">
                        <span className="truncate">
                          {auxiliares.length === 0
                            ? "Seleccionar auxiliares"
                            : `${auxiliares.length} seleccionado${auxiliares.length === 1 ? "" : "s"}`}
                        </span>
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
                                <CommandItem
                                  key={p.id}
                                  value={`${p.nombre} ${p.sucursal ?? ""}`}
                                  onSelect={() => toggleAux(p.id)}
                                  className="cursor-pointer"
                                >
                                  <Checkbox checked={active} className="mr-2 pointer-events-none" />
                                  <span className="flex-1 truncate">{p.nombre}</span>
                                  {p.sucursal && (
                                    <span className="ml-2 text-[10px] text-muted-foreground">{p.sucursal}</span>
                                  )}
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
                        const p = profiles.find((x) => x.id === id);
                        if (!p) return null;
                        return (
                          <Badge key={id} variant="secondary" className="gap-1 pl-2 pr-1 text-[11px] font-normal">
                            {p.nombre}
                            <button
                              type="button"
                              onClick={() => toggleAux(id)}
                              className="rounded-sm hover:bg-background/60 p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Observaciones colapsable */}
            <Collapsible open={obsOpen} onOpenChange={setObsOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-dashed px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent">
                <span>Observaciones {observaciones && <span className="ml-1 text-foreground">({observaciones.length} car.)</span>}</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", obsOpen && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <Textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  placeholder="Notas internas, recordatorios…"
                />
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
        <DialogFooter className="px-4 sm:px-6 py-3 sm:py-4 border-t shrink-0 flex-row gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">Cancelar</Button>
          <Button onClick={submit} disabled={busy} className="flex-1 sm:flex-none">{busy ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

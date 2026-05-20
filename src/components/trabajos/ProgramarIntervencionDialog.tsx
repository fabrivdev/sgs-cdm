import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Plus, Check, ChevronsUpDown, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Sucursal } from "@/lib/constants";
import { NuevoTrabajoDialog } from "./NuevoTrabajoDialog";
import { TecnicosPicker } from "./TecnicosPicker";
import { prioridadBadge, PRIORIDADES } from "@/lib/trabajos";

interface Profile { id: string; nombre: string; sucursal: Sucursal | null }
interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }
interface TrabajoLite {
  id: string;
  codigo?: string | null;
  descripcion_problema: string;
  cliente_id: string | null;
  sucursal: Sucursal;
  marca: string;
  tipo_trabajo: string;
  estado_general: string;
  prioridad?: string;
  legacy_servicio_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trabajoId?: string | null;
  trabajos?: TrabajoLite[];
  clientes?: Cliente[];
  tecnicos: Profile[];
  fechaInicial?: string | null;
  onSaved: () => void;
}

export function ProgramarIntervencionDialog({
  open, onOpenChange, trabajoId, trabajos, clientes, tecnicos, fechaInicial, onSaved,
}: Props) {
  const { user } = useAuth();
  const [selectedTrabajoId, setSelectedTrabajoId] = useState<string>("");
  const [openCombo, setOpenCombo] = useState(false);
  const [openNuevoTrabajo, setOpenNuevoTrabajo] = useState(false);
  const [form, setForm] = useState({
    fecha_programada: fechaInicial ?? new Date().toISOString().slice(0, 10),
    tecnico_principal_id: null as string | null,
    auxiliares: [] as string[],
    observacion: "",
  });
  const [busy, setBusy] = useState(false);

  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const getDiaSemana = (s: string) => dias[new Date(`${s}T00:00:00`).getDay()];
  const getSemana = (s: string) => {
    const d = new Date(`${s}T00:00:00`);
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = Math.floor((d.getTime() - start.getTime()) / 86400000);
    return Math.ceil((diff + start.getDay() + 1) / 7);
  };

  useEffect(() => {
    if (!open) return;
    setSelectedTrabajoId(trabajoId ?? "");
    setForm({
      fecha_programada: fechaInicial ?? new Date().toISOString().slice(0, 10),
      tecnico_principal_id: null,
      auxiliares: [],
      observacion: "",
    });
  }, [open, trabajoId, fechaInicial]);

  // Solo trabajos SIN programación pendiente => estado_general === 'pendiente'
  const trabajosDisponibles = useMemo(() => {
    if (!trabajos) return [];
    const cliMap = new Map((clientes ?? []).map(c => [c.id, c.nombre]));
    return [...trabajos]
      .filter(t => t.estado_general === "pendiente")
      .map(t => ({
        ...t,
        nombre_cliente: t.cliente_id ? cliMap.get(t.cliente_id) ?? "Sin cliente" : "Sin cliente",
      }))
      .sort((a, b) => a.nombre_cliente.localeCompare(b.nombre_cliente));
  }, [trabajos, clientes]);

  const trabajoActivo = useMemo(() => {
    const id = selectedTrabajoId || trabajoId;
    if (!id) return null;
    const cliMap = new Map((clientes ?? []).map(c => [c.id, c.nombre]));
    const found = (trabajos ?? []).find(t => t.id === id);
    if (!found) return null;
    return {
      ...found,
      nombre_cliente: found.cliente_id ? cliMap.get(found.cliente_id) ?? "Sin cliente" : "Sin cliente",
    };
  }, [trabajos, clientes, selectedTrabajoId, trabajoId]);

  const syncLegacyPlanificador = async (tId: string) => {
    const { data: trabajo, error } = await supabase.from("trabajos").select("*").eq("id", tId).single();
    if (error) throw error;

    const servicioPayload = {
      fecha_programada: form.fecha_programada,
      sucursal: trabajo.sucursal,
      marca: trabajo.marca,
      tipo_trabajo: trabajo.tipo_trabajo,
      tecnico_responsable_id: form.tecnico_principal_id || null,
      auxiliares: form.auxiliares,
      cliente_id: trabajo.cliente_id,
      trabajo_descripcion: trabajo.descripcion_problema,
      observaciones: form.observacion.trim() || null,
      creado_por: user?.id,
      dia_semana: getDiaSemana(form.fecha_programada),
      semana: getSemana(form.fecha_programada),
      estado: "Pendiente" as const,
    };

    let servicioId = trabajo.legacy_servicio_id as string | null;
    if (servicioId) {
      const { error: e } = await supabase.from("servicios").update(servicioPayload).eq("id", servicioId);
      if (e) throw e;
    } else {
      const { data, error: e } = await supabase.from("servicios").insert(servicioPayload).select("id").single();
      if (e) throw e;
      servicioId = data.id;
      await supabase.from("trabajos").update({ legacy_servicio_id: servicioId }).eq("id", tId);
    }

    const { data: existe } = await supabase
      .from("servicio_jornadas")
      .select("id").eq("servicio_id", servicioId).eq("fecha", form.fecha_programada).maybeSingle();
    if (!existe?.id) {
      await supabase.from("servicio_jornadas").insert({
        servicio_id: servicioId,
        fecha: form.fecha_programada,
        estado: "Pendiente",
        tecnico_responsable_id: form.tecnico_principal_id || null,
        auxiliares: form.auxiliares,
      });
    } else {
      await supabase.from("servicio_jornadas").update({
        tecnico_responsable_id: form.tecnico_principal_id || null,
        auxiliares: form.auxiliares,
      }).eq("id", existe.id);
    }
  };

  const guardar = async () => {
    const tId = selectedTrabajoId || trabajoId;
    if (!tId) { toast.error("Seleccioná un trabajo"); return; }
    if (!form.fecha_programada) { toast.error("Fecha requerida"); return; }
    if (!form.tecnico_principal_id) { toast.error("Marcá un técnico principal (estrella)"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("programaciones").insert({
        trabajo_id: tId,
        fecha_programada: form.fecha_programada,
        tecnico_principal_id: form.tecnico_principal_id,
        auxiliares: form.auxiliares,
        observacion: form.observacion.trim() || null,
        creado_por: user?.id,
      });
      if (error) throw error;

      await syncLegacyPlanificador(tId);

      toast.success("Intervención programada");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo programar");
    } finally { setBusy(false); }
  };

  const necesitaSelector = !trabajoId;
  const prioLabel = (p?: string) => PRIORIDADES.find(x => x.key === p)?.label ?? "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-3 border-b">
            <DialogTitle className="text-base">Programar intervención</DialogTitle>
          </DialogHeader>

          <div className="px-4 py-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
            {necesitaSelector && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  Trabajo
                </Label>
                <div className="flex gap-1.5">
                  <Popover open={openCombo} onOpenChange={setOpenCombo}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCombo}
                        className="flex-1 justify-between h-auto min-h-9 px-2.5 py-1.5 font-normal text-left"
                      >
                        {trabajoActivo ? (
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium truncate">
                              {trabajoActivo.nombre_cliente}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {trabajoActivo.descripcion_problema}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            Elegí un trabajo sin programar…
                          </span>
                        )}
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar cliente o problema…" className="h-9" />
                        <CommandList className="max-h-72">
                          <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
                            <Briefcase className="mx-auto mb-2 h-5 w-5 opacity-40" />
                            No hay trabajos sin programar.
                          </CommandEmpty>
                          <CommandGroup>
                            {trabajosDisponibles.map(t => {
                              const selected = t.id === selectedTrabajoId;
                              return (
                                <CommandItem
                                  key={t.id}
                                  value={`${t.nombre_cliente} ${t.descripcion_problema} ${t.marca} ${t.sucursal}`}
                                  onSelect={() => {
                                    setSelectedTrabajoId(t.id);
                                    setOpenCombo(false);
                                  }}
                                  className="flex items-start gap-2 py-2"
                                >
                                  <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-medium leading-tight truncate">
                                      {t.nombre_cliente}
                                      <span className="font-normal text-muted-foreground"> — {t.descripcion_problema}</span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[10px] text-muted-foreground">{t.marca}</span>
                                      <span className="text-[10px] text-muted-foreground">·</span>
                                      <span className="text-[10px] text-muted-foreground">{t.sucursal}</span>
                                      {t.prioridad && (
                                        <Badge className={cn("h-4 px-1 text-[9px] font-medium ml-0.5", prioridadBadge(t.prioridad as any))}>
                                          {prioLabel(t.prioridad)}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => setOpenNuevoTrabajo(true)}
                    title="Nuevo trabajo"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Fecha
              </Label>
              <Input
                type="date"
                className="h-9"
                value={form.fecha_programada}
                onChange={(e) => setForm(f => ({ ...f, fecha_programada: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Cuadrilla
              </Label>
              <TecnicosPicker
                tecnicos={tecnicos}
                principalId={form.tecnico_principal_id}
                auxiliares={form.auxiliares}
                onChange={({ principalId, auxiliares }) =>
                  setForm(f => ({ ...f, tecnico_principal_id: principalId, auxiliares }))
                }
                label=""
                helperText="Estrella = principal. El resto, auxiliares."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Observación (opcional)
              </Label>
              <Textarea
                rows={2}
                className="resize-none text-sm"
                value={form.observacion}
                onChange={(e) => setForm(f => ({ ...f, observacion: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="px-4 py-3 border-t bg-muted/30">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button size="sm" onClick={guardar} disabled={busy}>
              {busy ? "Guardando…" : "Programar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {necesitaSelector && clientes && (
        <NuevoTrabajoDialog
          open={openNuevoTrabajo}
          onOpenChange={setOpenNuevoTrabajo}
          clientes={clientes}
          onSaved={(newId) => { if (newId) setSelectedTrabajoId(newId); }}
        />
      )}
    </>
  );
}

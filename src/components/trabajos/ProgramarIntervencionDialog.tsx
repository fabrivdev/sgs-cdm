import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { Sucursal } from "@/lib/constants";
import { NuevoTrabajoDialog } from "./NuevoTrabajoDialog";
import { TecnicosPicker } from "./TecnicosPicker";

interface Profile { id: string; nombre: string; sucursal: Sucursal | null }
interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }
interface TrabajoLite {
  id: string;
  descripcion_problema: string;
  cliente_id: string | null;
  sucursal: Sucursal;
  marca: string;
  tipo_trabajo: string;
  estado_general: string;
  legacy_servicio_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trabajoId?: string | null;
  trabajos?: TrabajoLite[];
  clientes?: Cliente[];
  tecnicos: Profile[];           // ya filtrados (solo rol técnico)
  fechaInicial?: string | null;
  onSaved: () => void;
}

/**
 * Programa una intervención (agenda) sobre un trabajo madre.
 * - La cuadrilla NO se hereda de programaciones anteriores: se elige acá.
 * - El estado del trabajo lo recalcula el trigger DB.
 */
export function ProgramarIntervencionDialog({
  open, onOpenChange, trabajoId, trabajos, clientes, tecnicos, fechaInicial, onSaved,
}: Props) {
  const { user } = useAuth();
  const [selectedTrabajoId, setSelectedTrabajoId] = useState<string>("");
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

  const trabajosOrden = useMemo(() => {
    if (!trabajos) return [];
    const cliMap = new Map((clientes ?? []).map(c => [c.id, c.nombre]));
    return [...trabajos]
      .filter(t => t.estado_general !== "completado" && t.estado_general !== "cerrado")
      .map(t => ({
        ...t,
        nombre_cliente: t.cliente_id ? cliMap.get(t.cliente_id) ?? "Sin cliente" : "Sin cliente",
      }))
      .sort((a, b) => a.nombre_cliente.localeCompare(b.nombre_cliente));
  }, [trabajos, clientes]);

  const trabajoActivo = useMemo(() => {
    if (!selectedTrabajoId) return null;
    return trabajosOrden.find(t => t.id === selectedTrabajoId) ?? null;
  }, [trabajosOrden, selectedTrabajoId]);

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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Programar intervención</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            {necesitaSelector && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Trabajo</Label>
                <div className="flex gap-2">
                  <Select value={selectedTrabajoId} onValueChange={setSelectedTrabajoId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Elegí un trabajo abierto…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[320px] w-[--radix-select-trigger-width]">
                      {trabajosOrden.length === 0 && (
                        <div className="px-2 py-3 text-xs text-muted-foreground">No hay trabajos abiertos.</div>
                      )}
                      {trabajosOrden.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nombre_cliente} · {t.descripcion_problema.slice(0, 50)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" onClick={() => setOpenNuevoTrabajo(true)} title="Nuevo trabajo">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {trabajoActivo && (
                  <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
                    {trabajoActivo.sucursal} · {trabajoActivo.marca} · {trabajoActivo.tipo_trabajo}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Fecha</Label>
              <Input type="date" value={form.fecha_programada}
                onChange={(e) => setForm(f => ({ ...f, fecha_programada: e.target.value }))} />
            </div>

            <TecnicosPicker
              tecnicos={tecnicos}
              principalId={form.tecnico_principal_id}
              auxiliares={form.auxiliares}
              onChange={({ principalId, auxiliares }) =>
                setForm(f => ({ ...f, tecnico_principal_id: principalId, auxiliares }))
              }
            />

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Observación (opcional)</Label>
              <Textarea rows={2} value={form.observacion}
                onChange={(e) => setForm(f => ({ ...f, observacion: e.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={guardar} disabled={busy}>{busy ? "Guardando…" : "Programar"}</Button>
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

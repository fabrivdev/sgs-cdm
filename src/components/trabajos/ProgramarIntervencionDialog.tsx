import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Sucursal } from "@/lib/constants";

interface Profile { id: string; nombre: string; sucursal: Sucursal | null }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trabajoId: string;
  tecnicos: Profile[];
  reprogramarDe?: { id: string; fecha: string; tecnico: string | null } | null;
  onSaved: () => void;
}

export function ProgramarIntervencionDialog({ open, onOpenChange, trabajoId, tecnicos, reprogramarDe, onSaved }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    fecha_programada: new Date().toISOString().slice(0, 10),
    tecnico_principal_id: "",
    auxiliares: [] as string[],
    accion_programada: "",
    horas_estimadas: "",
    observacion: "",
    motivo_reprogramacion: "",
  });
  const [busy, setBusy] = useState(false);

  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  const getDiaSemana = (yyyyMmDd: string) => {
    const d = new Date(`${yyyyMmDd}T00:00:00`);
    return dias[d.getDay()];
  };

  const getSemana = (yyyyMmDd: string) => {
    const d = new Date(`${yyyyMmDd}T00:00:00`);
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = Math.floor((d.getTime() - start.getTime()) / 86400000);
    return Math.ceil((diff + start.getDay() + 1) / 7);
  };

  const syncLegacyPlanificador = async (programacionId: string) => {
    const { data: trabajo, error: errTrabajo } = await supabase
      .from("trabajos")
      .select("*")
      .eq("id", trabajoId)
      .single();

    if (errTrabajo) throw errTrabajo;

    const servicioPayload = {
      fecha_programada: form.fecha_programada,
      sucursal: trabajo.sucursal,
      marca: trabajo.marca,
      tipo_trabajo: trabajo.tipo_trabajo,
      tecnico_responsable_id: form.tecnico_principal_id || null,
      auxiliares: form.auxiliares,
      cliente_id: trabajo.cliente_id,
      trabajo_descripcion: trabajo.descripcion_problema,
      observaciones: form.observacion.trim() || form.accion_programada.trim() || null,
      creado_por: user?.id,
      dia_semana: getDiaSemana(form.fecha_programada),
      semana: getSemana(form.fecha_programada),
      estado: "Pendiente",
    };

    let servicioId = trabajo.legacy_servicio_id as string | null;

    if (servicioId) {
      const { error } = await supabase.from("servicios").update(servicioPayload).eq("id", servicioId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("servicios").insert(servicioPayload).select("id").single();
      if (error) throw error;
      servicioId = data.id;

      const { error: errUpdate } = await supabase
        .from("trabajos")
        .update({ legacy_servicio_id: servicioId })
        .eq("id", trabajoId);

      if (errUpdate) throw errUpdate;
    }

    const { data: jornadaExistente, error: errJornadaFind } = await supabase
      .from("servicio_jornadas")
      .select("id")
      .eq("servicio_id", servicioId)
      .eq("fecha", form.fecha_programada)
      .maybeSingle();

    if (errJornadaFind) throw errJornadaFind;

    if (!jornadaExistente?.id) {
      const { error } = await supabase
        .from("servicio_jornadas")
        .insert({
          servicio_id: servicioId,
          fecha: form.fecha_programada,
          estado: "Pendiente",
        });

      if (error) throw error;
    }
  };

  useEffect(() => {
    if (open) {
      setForm({
        fecha_programada: new Date().toISOString().slice(0, 10),
        tecnico_principal_id: reprogramarDe?.tecnico ?? "",
        auxiliares: [],
        accion_programada: "",
        horas_estimadas: "",
        observacion: "",
        motivo_reprogramacion: "",
      });
    }
  }, [open, reprogramarDe]);

  const guardar = async () => {
    if (!form.fecha_programada) { toast.error("Fecha requerida"); return; }
    if (!form.tecnico_principal_id) { toast.error("Seleccioná técnico principal"); return; }
    setBusy(true);
    try {
      if (reprogramarDe) {
        const { error: e1 } = await supabase.from("programaciones").update({
          estado: "reprogramada",
          motivo_reprogramacion: form.motivo_reprogramacion || null,
        }).eq("id", reprogramarDe.id);
        if (e1) throw e1;
      }
      const { data: nuevaProgramacion, error } = await supabase.from("programaciones").insert({
        trabajo_id: trabajoId,
        fecha_programada: form.fecha_programada,
        tecnico_principal_id: form.tecnico_principal_id || null,
        auxiliares: form.auxiliares,
        accion_programada: form.accion_programada.trim() || null,
        horas_estimadas: form.horas_estimadas ? Number(form.horas_estimadas) : null,
        observacion: form.observacion.trim() || null,
        reemplaza_a: reprogramarDe?.id ?? null,
        creado_por: user?.id,
      }).select("id").single();
      if (error) throw error;

      await supabase
        .from("trabajos")
        .update({
          estado_general: "programado",
          fecha_compromiso: form.fecha_programada,
          responsable_principal_id: form.tecnico_principal_id || null,
        })
        .eq("id", trabajoId);

      await syncLegacyPlanificador(nuevaProgramacion.id);

      toast.success(reprogramarDe ? "Reprogramado" : "Intervención programada");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo programar");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reprogramarDe ? "Reprogramar intervención" : "Programar intervención"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha_programada}
                onChange={(e) => setForm(f => ({ ...f, fecha_programada: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Horas estimadas</Label>
              <Input type="number" step="0.5" min="0" value={form.horas_estimadas}
                onChange={(e) => setForm(f => ({ ...f, horas_estimadas: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Técnico principal</Label>
            <Select value={form.tecnico_principal_id || "none"}
              onValueChange={(v) => setForm(f => ({ ...f, tecnico_principal_id: v === "none" ? "" : v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Asignar" /></SelectTrigger>
              <SelectContent className="max-h-[320px] w-[--radix-select-trigger-width]">
                <SelectItem value="none">— Sin asignar —</SelectItem>
                {tecnicos.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Auxiliares</Label>
            <div className="rounded-md border p-2 max-h-32 overflow-y-auto space-y-1">
              {tecnicos.filter(t => t.id !== form.tecnico_principal_id).map(t => (
                <label key={t.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.auxiliares.includes(t.id)}
                    onChange={(e) => setForm(f => ({
                      ...f, auxiliares: e.target.checked
                        ? [...f.auxiliares, t.id]
                        : f.auxiliares.filter(x => x !== t.id)
                    }))} />
                  {t.nombre}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Trabajo previsto para esta visita</Label>
            <Textarea rows={2} value={form.accion_programada}
              onChange={(e) => setForm(f => ({ ...f, accion_programada: e.target.value }))}
              placeholder="Ej: revisar pérdida, cambiar buje, diagnosticar falla..." />
          </div>
          <div className="space-y-1.5">
            <Label>Observación</Label>
            <Textarea rows={2} value={form.observacion}
              onChange={(e) => setForm(f => ({ ...f, observacion: e.target.value }))} />
          </div>
          {reprogramarDe && (
            <div className="space-y-1.5">
              <Label>Motivo de reprogramación</Label>
              <Textarea rows={2} value={form.motivo_reprogramacion}
                onChange={(e) => setForm(f => ({ ...f, motivo_reprogramacion: e.target.value }))}
                placeholder="¿Por qué se reprograma?" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={guardar} disabled={busy}>{busy ? "Guardando…" : "Programar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

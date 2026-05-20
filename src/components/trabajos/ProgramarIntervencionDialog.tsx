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
    setBusy(true);
    try {
      if (reprogramarDe) {
        const { error: e1 } = await supabase.from("programaciones").update({
          estado: "reprogramada",
          motivo_reprogramacion: form.motivo_reprogramacion || null,
        }).eq("id", reprogramarDe.id);
        if (e1) throw e1;
      }
      const { error } = await supabase.from("programaciones").insert({
        trabajo_id: trabajoId,
        fecha_programada: form.fecha_programada,
        tecnico_principal_id: form.tecnico_principal_id || null,
        auxiliares: form.auxiliares,
        accion_programada: form.accion_programada.trim() || null,
        horas_estimadas: form.horas_estimadas ? Number(form.horas_estimadas) : null,
        observacion: form.observacion.trim() || null,
        reemplaza_a: reprogramarDe?.id ?? null,
        creado_por: user?.id,
      });
      if (error) throw error;

      // Si el trabajo estaba en pendiente_programar/nuevo/pendiente_diagnostico → pasarlo a programado
      const { data: t } = await supabase.from("trabajos").select("estado_general").eq("id", trabajoId).single();
      if (t && ["nuevo", "pendiente_diagnostico", "pendiente_programar"].includes(t.estado_general)) {
        await supabase.from("trabajos").update({ estado_general: "programado" }).eq("id", trabajoId);
      }

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
              <SelectTrigger><SelectValue placeholder="Asignar" /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
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
            <Label>Acción programada</Label>
            <Textarea rows={2} value={form.accion_programada}
              onChange={(e) => setForm(f => ({ ...f, accion_programada: e.target.value }))}
              placeholder="Qué se va a hacer en esta visita..." />
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

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
  programaciones: { id: string; fecha_programada: string }[];
  onSaved: () => void;
}

/**
 * Jornada simple:
 * - La jornada cargada siempre queda completada.
 * - Si el trabajo necesita continuar, se programa otra fecha.
 * - No existe "en curso" ni "incompleta" porque eso confundía el estado macro del trabajo.
 */
export function CargarJornadaDialog({ open, onOpenChange, trabajoId, tecnicos, programaciones, onSaved }: Props) {
  const { user } = useAuth();

  const [form, setForm] = useState({
    tecnico_id: "",
    programacion_id: "",
    fecha_real: new Date().toISOString().slice(0, 10),
    observaciones: "",
  });

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        tecnico_id: user?.id ?? "",
        programacion_id: programaciones[0]?.id ?? "",
        fecha_real: new Date().toISOString().slice(0, 10),
        observaciones: "",
      });
    }
  }, [open, user?.id, programaciones]);

  const syncLegacy = async () => {
    const { data: trabajo } = await supabase
      .from("trabajos")
      .select("legacy_servicio_id")
      .eq("id", trabajoId)
      .maybeSingle();

    if (!trabajo?.legacy_servicio_id) return;

    await supabase
      .from("servicios")
      .update({
        estado: "Completado",
        observaciones: form.observaciones.trim() || null,
      })
      .eq("id", trabajo.legacy_servicio_id);

    const { data: legacyJornada } = await supabase
      .from("servicio_jornadas")
      .select("id")
      .eq("servicio_id", trabajo.legacy_servicio_id)
      .eq("fecha", form.fecha_real)
      .maybeSingle();

    if (legacyJornada?.id) {
      await supabase
        .from("servicio_jornadas")
        .update({
          estado: "Completado",
          observaciones: form.observaciones.trim() || null,
        })
        .eq("id", legacyJornada.id);
    } else {
      await supabase
        .from("servicio_jornadas")
        .insert({
          servicio_id: trabajo.legacy_servicio_id,
          fecha: form.fecha_real,
          estado: "Completado",
          observaciones: form.observaciones.trim() || null,
        });
    }
  };

  const guardar = async () => {
    if (!form.tecnico_id) {
      toast.error("Seleccioná el técnico");
      return;
    }

    if (!form.fecha_real) {
      toast.error("Fecha requerida");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.from("jornadas").insert({
        trabajo_id: trabajoId,
        programacion_id: form.programacion_id || null,
        tecnico_id: form.tecnico_id,
        fecha_real: form.fecha_real,
        estado_jornada: "completada",
        observaciones: form.observaciones.trim() || null,
        creado_por: user?.id,
      });

      if (error) throw error;

      await syncLegacy();
      await supabase.rpc("recalcular_estado_trabajo" as any, { p_trabajo_id: trabajoId });

      toast.success("Jornada cargada");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "No se pudo guardar la jornada");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar jornada</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Técnico</Label>
            <Select value={form.tecnico_id} onValueChange={(v) => setForm(f => ({ ...f, tecnico_id: v }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent className="max-h-[320px] w-[--radix-select-trigger-width]">
                {tecnicos.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre}{t.sucursal ? ` · ${t.sucursal}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {programaciones.length > 0 && (
            <div className="space-y-1.5">
              <Label>Agenda que se trabajó</Label>
              <Select
                value={form.programacion_id || "none"}
                onValueChange={(v) => setForm(f => ({ ...f, programacion_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin agenda —</SelectItem>
                  {programaciones.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.fecha_programada}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Fecha real</Label>
            <Input
              type="date"
              value={form.fecha_real}
              onChange={(e) => setForm(f => ({ ...f, fecha_real: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Observación</Label>
            <Textarea
              rows={3}
              value={form.observaciones}
              onChange={(e) => setForm(f => ({ ...f, observaciones: e.target.value }))}
              placeholder="Qué se hizo, qué quedó pendiente o comentario breve..."
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Si este trabajo necesita continuar otro día, guardá esta jornada y después programá una nueva fecha.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={busy}>
            {busy ? "Guardando…" : "Guardar jornada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

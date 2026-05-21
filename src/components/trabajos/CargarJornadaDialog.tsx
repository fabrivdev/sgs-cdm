import { useEffect, useState } from "react";
import { ResponsiveDrawer, ResponsiveDrawerHeader, ResponsiveDrawerBody, ResponsiveDrawerFooter } from "@/components/ui/responsive-drawer";
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

type Resultado = "realizada" | "no_realizada";

/**
 * Resultado de una agenda:
 * - Realizada: el técnico fue y trabajó ese día (aunque el trabajo macro siga).
 * - No realizada: la visita no se pudo ejecutar (cliente ausente, lluvia, etc.).
 * El estado del trabajo se recalcula automáticamente.
 */
export function CargarJornadaDialog({ open, onOpenChange, trabajoId, tecnicos, programaciones, onSaved }: Props) {
  const { user } = useAuth();

  const [form, setForm] = useState({
    tecnico_id: "",
    programacion_id: "",
    fecha_real: new Date().toISOString().slice(0, 10),
    resultado: "realizada" as Resultado,
    observaciones: "",
  });

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        tecnico_id: user?.id ?? "",
        programacion_id: programaciones[0]?.id ?? "",
        fecha_real: new Date().toISOString().slice(0, 10),
        resultado: "realizada",
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

    const estadoLegacy = form.resultado === "realizada" ? "Completado" : "Cancelada";
    const programacionSeleccionada = programaciones.find((p) => p.id === form.programacion_id);
    const fechaLegacy = programacionSeleccionada?.fecha_programada ?? form.fecha_real;

    const { data: legacyJornada } = await supabase
      .from("servicio_jornadas")
      .select("id")
      .eq("servicio_id", trabajo.legacy_servicio_id)
      .eq("fecha", fechaLegacy)
      .maybeSingle();

    if (legacyJornada?.id) {
      await supabase
        .from("servicio_jornadas")
        .update({
          estado: estadoLegacy,
          observaciones: form.observaciones.trim() || null,
        })
        .eq("id", legacyJornada.id);
    } else {
      await supabase
        .from("servicio_jornadas")
        .insert({
          servicio_id: trabajo.legacy_servicio_id,
          fecha: fechaLegacy,
          estado: estadoLegacy,
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
        estado_jornada: form.resultado === "realizada" ? "completada" : "incompleta",
        observaciones: form.observaciones.trim() || null,
        creado_por: user?.id,
      });

      if (error) throw error;

      await syncLegacy();
      await supabase.rpc("recalcular_estado_trabajo" as any, { p_trabajo_id: trabajoId });

      toast.success(form.resultado === "realizada" ? "Resultado cargado: Realizada" : "Resultado cargado: No realizada");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "No se pudo guardar el resultado");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="md">
      <ResponsiveDrawerHeader>
        <h2 className="text-base font-semibold">Cargar resultado</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Registrá el resultado real de una visita.
        </p>
      </ResponsiveDrawerHeader>

      <ResponsiveDrawerBody>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Resultado</Label>
            <Select
              value={form.resultado}
              onValueChange={(v) => setForm(f => ({ ...f, resultado: v as Resultado }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="realizada">Realizada — el técnico trabajó ese día</SelectItem>
                <SelectItem value="no_realizada">No realizada — no se pudo ejecutar</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
              <Label>Intervención programada</Label>
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
              rows={4}
              value={form.observaciones}
              onChange={(e) => setForm(f => ({ ...f, observaciones: e.target.value }))}
              placeholder={
                form.resultado === "realizada"
                  ? "Qué se hizo, qué quedó pendiente o comentario breve…"
                  : "Motivo por el que no se pudo realizar (cliente ausente, lluvia, falta de repuesto…)"
              }
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Si el trabajo necesita continuar otro día, guardá este resultado como Realizada y programá otra intervención.
          </p>
        </div>
      </ResponsiveDrawerBody>

      <ResponsiveDrawerFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={busy}>
          {busy ? "Guardando…" : "Guardar resultado"}
        </Button>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );
}

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
import { ESTADOS_JORNADA, type EstadoJornada, calcularHoras } from "@/lib/trabajos";
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

export function CargarJornadaDialog({ open, onOpenChange, trabajoId, tecnicos, programaciones, onSaved }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    tecnico_id: "",
    programacion_id: "",
    fecha_real: new Date().toISOString().slice(0, 10),
    hora_inicio: "",
    hora_fin: "",
    horas_reales: "",
    actividad_realizada: "",
    resultado: "",
    estado_jornada: "completada" as EstadoJornada,
    observaciones: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        tecnico_id: user?.id ?? "",
        programacion_id: programaciones[0]?.id ?? "",
        fecha_real: new Date().toISOString().slice(0, 10),
        hora_inicio: "", hora_fin: "", horas_reales: "",
        actividad_realizada: "", resultado: "",
        estado_jornada: "completada", observaciones: "",
      });
    }
  }, [open, user?.id, programaciones]);

  const onHoraChange = (key: "hora_inicio" | "hora_fin", val: string) => {
    setForm(f => {
      const next = { ...f, [key]: val };
      const auto = calcularHoras(next.hora_inicio, next.hora_fin);
      if (auto !== null) next.horas_reales = String(auto);
      return next;
    });
  };

  const guardar = async () => {
    if (!form.tecnico_id) { toast.error("Seleccioná el técnico"); return; }
    if (!form.fecha_real) { toast.error("Fecha requerida"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("jornadas").insert({
        trabajo_id: trabajoId,
        programacion_id: form.programacion_id || null,
        tecnico_id: form.tecnico_id,
        fecha_real: form.fecha_real,
        hora_inicio: form.hora_inicio || null,
        hora_fin: form.hora_fin || null,
        horas_reales: form.horas_reales ? Number(form.horas_reales) : null,
        actividad_realizada: form.actividad_realizada.trim() || null,
        resultado: form.resultado.trim() || null,
        estado_jornada: form.estado_jornada,
        observaciones: form.observaciones.trim() || null,
        creado_por: user?.id,
      });
      if (error) throw error;

      // Si la jornada está completada y vincula una programación, marcarla cumplida
      if (form.estado_jornada === "completada" && form.programacion_id) {
        await supabase.from("programaciones").update({ estado: "cumplida" }).eq("id", form.programacion_id);
      }

      const { data: trabajo } = await supabase
        .from("trabajos")
        .select("id, estado_general, legacy_servicio_id")
        .eq("id", trabajoId)
        .single();

      const { data: programacionesRestantes } = await supabase
        .from("programaciones")
        .select("id, estado")
        .eq("trabajo_id", trabajoId);

      const quedanProgramadas = (programacionesRestantes ?? []).some((p: any) => p.estado === "programada");

      const nuevoEstadoTrabajo =
        form.estado_jornada === "completada" && !quedanProgramadas
          ? "completado"
          : "iniciado";

      await supabase
        .from("trabajos")
        .update({
          estado_general: nuevoEstadoTrabajo,
          cerrado_en: nuevoEstadoTrabajo === "completado" ? new Date().toISOString() : null,
          cerrado_por: nuevoEstadoTrabajo === "completado" ? user?.id : null,
        })
        .eq("id", trabajoId);

      if (trabajo?.legacy_servicio_id) {
        const estadoServicio =
          nuevoEstadoTrabajo === "completado"
            ? "Completado"
            : nuevoEstadoTrabajo === "iniciado"
            ? "Iniciado"
            : "Pendiente";

        await supabase
          .from("servicios")
          .update({
            estado: estadoServicio,
            horas_trabajadas: form.horas_reales ? Number(form.horas_reales) : null,
            observaciones: form.resultado.trim() || form.observaciones.trim() || null,
          })
          .eq("id", trabajo.legacy_servicio_id);

        await supabase
          .from("servicio_jornadas")
          .update({
            estado: estadoServicio,
            horas_trabajadas: form.horas_reales ? Number(form.horas_reales) : null,
            observaciones: form.resultado.trim() || form.observaciones.trim() || null,
          })
          .eq("servicio_id", trabajo.legacy_servicio_id)
          .eq("fecha", form.fecha_real);
      }

      toast.success("Jornada cargada");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar la jornada");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar jornada / parte de trabajo</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Técnico</Label>
            <Select value={form.tecnico_id} onValueChange={(v) => setForm(f => ({ ...f, tecnico_id: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent className="max-h-[320px] w-[--radix-select-trigger-width]">
                {tecnicos.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {programaciones.length > 0 && (
            <div className="space-y-1.5">
              <Label>Vincular a programación</Label>
              <Select value={form.programacion_id || "none"}
                onValueChange={(v) => setForm(f => ({ ...f, programacion_id: v === "none" ? "" : v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin programación —</SelectItem>
                  {programaciones.map(p => <SelectItem key={p.id} value={p.id}>{p.fecha_programada}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha_real}
                onChange={(e) => setForm(f => ({ ...f, fecha_real: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora inicio</Label>
              <Input type="time" value={form.hora_inicio}
                onChange={(e) => onHoraChange("hora_inicio", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora fin</Label>
              <Input type="time" value={form.hora_fin}
                onChange={(e) => onHoraChange("hora_fin", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Horas reales</Label>
              <Input type="number" step="0.25" min="0" value={form.horas_reales}
                onChange={(e) => setForm(f => ({ ...f, horas_reales: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.estado_jornada}
                onValueChange={(v) => setForm(f => ({ ...f, estado_jornada: v as EstadoJornada }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{ESTADOS_JORNADA.map(e => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Actividad realizada</Label>
            <Textarea rows={2} value={form.actividad_realizada}
              onChange={(e) => setForm(f => ({ ...f, actividad_realizada: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Resultado</Label>
            <Textarea rows={2} value={form.resultado}
              onChange={(e) => setForm(f => ({ ...f, resultado: e.target.value }))}
              placeholder="¿Qué se resolvió? ¿Qué falta?" />
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea rows={2} value={form.observaciones}
              onChange={(e) => setForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={guardar} disabled={busy}>{busy ? "Guardando…" : "Cargar jornada"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

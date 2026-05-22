import { useEffect, useMemo, useState } from "react";
import { ResponsiveDrawer, ResponsiveDrawerHeader, ResponsiveDrawerBody, ResponsiveDrawerFooter } from "@/components/ui/responsive-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { getISOWeek } from "date-fns";
import type { Sucursal } from "@/lib/constants";
import { TecnicosPicker } from "./TecnicosPicker";
import { estadoTrabajoDesdeJornadas } from "@/lib/trabajos";

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
  legacy_servicio_id?: string | null;
  jornadas?: Array<{ fecha?: string | null; fecha_programada?: string | null; estado?: string | null }>;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trabajoId?: string | null;
  trabajos?: TrabajoLite[];
  clientes?: Cliente[];
  tecnicos: Profile[];
  fechaInicial?: string | null;
  initialTecnicoId?: string | null;
  initialAuxiliares?: string[];
  onSaved: () => void;
}

const dias = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

export function ProgramarIntervencionDialog({
  open,
  onOpenChange,
  trabajoId,
  trabajos,
  clientes,
  tecnicos,
  fechaInicial,
  initialTecnicoId,
  initialAuxiliares,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const [selectedTrabajoId, setSelectedTrabajoId] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fecha: fechaInicial ?? new Date().toISOString().slice(0, 10),
    tecnico_id: null as string | null,
    auxiliares: [] as string[],
    observacion: "",
  });

  useEffect(() => {
    if (!open) return;
    setSelectedTrabajoId(trabajoId ?? "");
    setForm({
      fecha: fechaInicial ?? new Date().toISOString().slice(0, 10),
      tecnico_id: initialTecnicoId ?? null,
      auxiliares: initialAuxiliares ?? [],
      observacion: "",
    });
  }, [open, trabajoId, fechaInicial, initialTecnicoId, initialAuxiliares]);

  const trabajoActivo = useMemo(() => {
    const id = selectedTrabajoId || trabajoId;
    return (trabajos ?? []).find((t) => t.id === id) ?? null;
  }, [selectedTrabajoId, trabajoId, trabajos]);

  const clienteMap = useMemo(() => new Map((clientes ?? []).map((c) => [c.id, c.nombre])), [clientes]);
  const disponibles = useMemo(
    () => (trabajos ?? []).filter((t) => !trabajoId && estadoTrabajoDesdeJornadas(t.jornadas ?? [], t.estado_general) === "pendiente"),
    [trabajos, trabajoId],
  );

  const guardar = async () => {
    const tId = selectedTrabajoId || trabajoId;
    if (!tId) { toast.error("Selecciona un trabajo"); return; }
    if (!form.fecha) { toast.error("Fecha requerida"); return; }
    if (!form.tecnico_id) { toast.error("Marca un tecnico principal"); return; }

    setBusy(true);
    try {
      const { data: trabajo, error } = await supabase.from("trabajos").select("*").eq("id", tId).single();
      if (error) throw error;

      let servicioId = trabajo.legacy_servicio_id as string | null;
      const fechaDate = new Date(`${form.fecha}T00:00:00`);
      const servicioPayload = {
        fecha_programada: form.fecha,
        dia_semana: dias[fechaDate.getDay()],
        semana: getISOWeek(fechaDate),
        sucursal: trabajo.sucursal,
        marca: trabajo.marca,
        tipo_trabajo: trabajo.tipo_trabajo,
        tecnico_responsable_id: form.tecnico_id,
        auxiliares: form.auxiliares,
        cliente_id: trabajo.cliente_id,
        trabajo_descripcion: trabajo.descripcion_problema,
        observaciones: form.observacion.trim() || null,
        creado_por: user?.id,
        estado: "Pendiente" as const,
      };

      if (servicioId) {
        const { error: updateError } = await supabase.from("servicios").update(servicioPayload).eq("id", servicioId);
        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await supabase.from("servicios").insert(servicioPayload).select("id").single();
        if (insertError) throw insertError;
        servicioId = data.id;
        await supabase.from("trabajos").update({ legacy_servicio_id: servicioId }).eq("id", tId);
      }

      const { data: existente } = await supabase
        .from("servicio_jornadas")
        .select("id")
        .eq("servicio_id", servicioId)
        .eq("fecha", form.fecha)
        .maybeSingle();

      const jornadaPayload = {
        servicio_id: servicioId,
        fecha: form.fecha,
        estado: "Pendiente" as const,
        tecnico_responsable_id: form.tecnico_id,
        auxiliares: form.auxiliares,
        observaciones: form.observacion.trim() || null,
      };

      const jornadaError = existente?.id
        ? (await supabase.from("servicio_jornadas").update(jornadaPayload).eq("id", existente.id)).error
        : (await supabase.from("servicio_jornadas").insert(jornadaPayload)).error;
      if (jornadaError) throw jornadaError;

      await supabase.rpc("recalcular_estado_trabajo" as any, { p_trabajo_id: tId });

      toast.success("Jornada programada");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo programar la jornada");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="md">
      <ResponsiveDrawerHeader>
        <h2 className="text-base font-semibold">Programar jornada</h2>
        {trabajoActivo && (
          <p className="text-xs text-muted-foreground mt-1">
            {trabajoActivo.codigo ? `${trabajoActivo.codigo} - ` : ""}{trabajoActivo.cliente_id ? clienteMap.get(trabajoActivo.cliente_id) : "Sin cliente"}
          </p>
        )}
      </ResponsiveDrawerHeader>

      <ResponsiveDrawerBody className="space-y-4">
        {!trabajoId && (
          <div className="space-y-1.5">
            <Label>Trabajo</Label>
            <Select value={selectedTrabajoId} onValueChange={setSelectedTrabajoId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar trabajo" />
              </SelectTrigger>
              <SelectContent>
                {disponibles.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.codigo ? `${t.codigo} - ` : ""}{t.cliente_id ? clienteMap.get(t.cliente_id) : "Sin cliente"} - {t.descripcion_problema}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Fecha prevista</Label>
          <Input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
        </div>

        <div className="space-y-1.5">
          <Label>Cuadrilla</Label>
          <TecnicosPicker
            tecnicos={tecnicos}
            principalId={form.tecnico_id}
            auxiliares={form.auxiliares}
            onChange={({ principalId, auxiliares }) => setForm((f) => ({ ...f, tecnico_id: principalId, auxiliares }))}
            label=""
            helperText="Estrella = principal. El resto, auxiliares."
          />
        </div>

        <div className="space-y-1.5">
          <Label>Observacion</Label>
          <Textarea rows={3} value={form.observacion} onChange={(e) => setForm((f) => ({ ...f, observacion: e.target.value }))} />
        </div>
      </ResponsiveDrawerBody>

      <ResponsiveDrawerFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? "Guardando..." : "Guardar jornada"}</Button>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );
}

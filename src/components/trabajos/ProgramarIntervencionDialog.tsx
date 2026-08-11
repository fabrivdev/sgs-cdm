import { useEffect, useMemo, useState } from "react";
import { ResponsiveDrawer, ResponsiveDrawerHeader, ResponsiveDrawerBody, ResponsiveDrawerFooter } from "@/components/ui/responsive-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Sucursal } from "@/lib/constants";
import { TecnicosPicker } from "./TecnicosPicker";
import { estadoTrabajoDesdeJornadas } from "@/lib/trabajos";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

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
  const [selectedTrabajoId, setSelectedTrabajoId] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fecha: fechaInicial ?? new Date().toISOString().slice(0, 10),
    fecha_hasta: fechaInicial ?? new Date().toISOString().slice(0, 10),
    tecnico_id: null as string | null,
    auxiliares: [] as string[],
    observacion: "",
  });

  useEffect(() => {
    if (!open) return;
    setSelectedTrabajoId(trabajoId ?? "");
    setForm({
      fecha: fechaInicial ?? new Date().toISOString().slice(0, 10),
      fecha_hasta: fechaInicial ?? new Date().toISOString().slice(0, 10),
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

  const fechasSeleccionadas = useMemo(() => {
    if (!form.fecha || !form.fecha_hasta || form.fecha_hasta < form.fecha) return [];
    return eachDayOfInterval({
      start: parseISO(form.fecha),
      end: parseISO(form.fecha_hasta),
    }).map((fecha) => format(fecha, "yyyy-MM-dd"));
  }, [form.fecha, form.fecha_hasta]);

  const guardar = async () => {
    const tId = selectedTrabajoId || trabajoId;
    if (!tId) { toast.error("Selecciona un trabajo"); return; }
    if (!form.fecha || !form.fecha_hasta) { toast.error("Completa las fechas"); return; }
    if (form.fecha_hasta < form.fecha) { toast.error("La fecha final no puede ser anterior a la inicial"); return; }
    if (!form.tecnico_id) { toast.error("Marca un tecnico principal"); return; }

    setBusy(true);
    let guardadas = 0;
    try {
      // Se ejecutan en serie: la primera llamada puede crear el servicio base
      // que las jornadas siguientes deben reutilizar.
      for (const fecha of fechasSeleccionadas) {
        const { error } = await supabase.rpc("programar_jornada" as any, {
          p_trabajo_id: tId,
          p_fecha: fecha,
          p_tecnico_id: form.tecnico_id,
          p_auxiliares: form.auxiliares,
          p_observacion: form.observacion.trim() || null,
        });
        if (error) throw error;
        guardadas += 1;
      }

      toast.success(guardadas === 1 ? "Jornada programada" : `${guardadas} jornadas programadas`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      if (guardadas > 0) {
        onSaved();
        toast.error(`Se guardaron ${guardadas} de ${fechasSeleccionadas.length} jornadas. ${e?.message ?? "No se pudo completar la programacion"}`);
      } else {
        toast.error(e?.message ?? "No se pudo programar la jornada");
      }
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
          <Label>Fechas previstas</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Desde</span>
              <Input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  fecha: e.target.value,
                  fecha_hasta: !f.fecha_hasta || f.fecha_hasta < e.target.value ? e.target.value : f.fecha_hasta,
                }))}
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Hasta</span>
              <Input
                type="date"
                min={form.fecha}
                value={form.fecha_hasta}
                onChange={(e) => setForm((f) => ({ ...f, fecha_hasta: e.target.value }))}
              />
            </div>
          </div>
          {fechasSeleccionadas.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {fechasSeleccionadas.length === 1
                ? "Se creara 1 jornada."
                : `Se crearan ${fechasSeleccionadas.length} jornadas, una por dia, del ${format(parseISO(form.fecha), "EEE dd/MM", { locale: es })} al ${format(parseISO(form.fecha_hasta), "EEE dd/MM", { locale: es })}.`}
            </p>
          )}
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
        <Button onClick={guardar} disabled={busy || fechasSeleccionadas.length === 0}>
          {busy
            ? "Guardando..."
            : fechasSeleccionadas.length > 1
              ? `Guardar ${fechasSeleccionadas.length} jornadas`
              : "Guardar jornada"}
        </Button>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );
}

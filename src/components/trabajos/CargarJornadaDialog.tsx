import { useEffect, useState } from "react";
import { ResponsiveDrawer, ResponsiveDrawerHeader, ResponsiveDrawerBody, ResponsiveDrawerFooter } from "@/components/ui/responsive-drawer";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Estado, Sucursal } from "@/lib/constants";
import { TecnicosPicker } from "./TecnicosPicker";

interface Profile { id: string; nombre: string; sucursal: Sucursal | null }
interface JornadaLegacy {
  id: string;
  fecha: string;
  estado: Estado;
  horas_trabajadas?: number | null;
  observaciones?: string | null;
  tecnico_responsable_id: string | null;
  auxiliares: string[] | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trabajoId: string;
  legacyServicioId: string | null;
  tecnicos: Profile[];
  jornadas: JornadaLegacy[];
  initialJornadaId?: string | null;
  defaultTecnicoId?: string | null;
  defaultAuxiliares?: string[];
  onSaved: () => void;
}

type Resultado = "realizada" | "no_realizada";

function resolveCrew(
  jornada: JornadaLegacy | undefined,
  fallbackPrincipalId: string | null | undefined,
  fallbackAuxiliares: string[] | undefined,
  userId: string | null | undefined,
) {
  const jornadaAuxiliares = jornada?.auxiliares ?? [];
  const jornadaTieneCuadrilla = Boolean(jornada?.tecnico_responsable_id) || jornadaAuxiliares.length > 0;
  if (jornadaTieneCuadrilla) {
    return {
      tecnico_id: jornada?.tecnico_responsable_id ?? "",
      auxiliares: jornadaAuxiliares,
    };
  }

  const fallbackTieneCuadrilla = Boolean(fallbackPrincipalId) || (fallbackAuxiliares?.length ?? 0) > 0;
  if (fallbackTieneCuadrilla) {
    return {
      tecnico_id: fallbackPrincipalId ?? "",
      auxiliares: fallbackAuxiliares ?? [],
    };
  }

  return {
    tecnico_id: userId ?? "",
    auxiliares: [] as string[],
  };
}

export function CargarJornadaDialog({
  open,
  onOpenChange,
  trabajoId,
  legacyServicioId,
  tecnicos,
  jornadas,
  initialJornadaId,
  defaultTecnicoId,
  defaultAuxiliares,
  onSaved,
}: Props) {
  const { user } = useAuth();

  const [form, setForm] = useState({
    tecnico_id: "",
    auxiliares: [] as string[],
    jornada_id: "",
    resultado: "realizada" as Resultado,
    horas_trabajadas: "" as string,
    observaciones: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const pendiente = jornadas.find((j) => j.id === initialJornadaId) ?? jornadas.find((j) => j.estado === "Pendiente") ?? jornadas[0];
    const crew = resolveCrew(pendiente, defaultTecnicoId, defaultAuxiliares, user?.id);
    setForm({
      tecnico_id: crew.tecnico_id,
      auxiliares: crew.auxiliares,
      jornada_id: pendiente?.id ?? "",
      resultado: "realizada",
      horas_trabajadas: pendiente?.horas_trabajadas != null ? String(pendiente.horas_trabajadas) : "",
      observaciones: pendiente?.observaciones ?? "",
    });
  }, [open, user?.id, jornadas, initialJornadaId, defaultTecnicoId, defaultAuxiliares]);

  const guardar = async () => {
    if (!form.tecnico_id) {
      toast.error("Selecciona el tecnico");
      return;
    }

    if (!legacyServicioId || !form.jornada_id) {
      toast.error("Selecciona una jornada");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase
        .from("servicio_jornadas")
        .update({
          estado: form.resultado === "realizada" ? "Completado" : "Cancelada",
          horas_trabajadas: form.horas_trabajadas === "" ? null : Number(form.horas_trabajadas),
          tecnico_responsable_id: form.tecnico_id,
          auxiliares: form.auxiliares,
          observaciones: form.observaciones.trim() || null,
        })
        .eq("id", form.jornada_id)
        .eq("servicio_id", legacyServicioId);

      if (error) throw error;

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
        <h2 className="text-[14px] font-semibold">Cargar resultado</h2>
        <p className="text-[12px] text-muted-foreground mt-1">
          Marca el resultado de una fecha de trabajo.
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
                <SelectItem value="realizada">Realizada - el tecnico trabajo ese dia</SelectItem>
                <SelectItem value="no_realizada">No realizada - no se pudo ejecutar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Jornada</Label>
            <Select
              value={form.jornada_id}
              onValueChange={(v) => {
                const j = jornadas.find((item) => item.id === v);
                const crew = resolveCrew(j, defaultTecnicoId, defaultAuxiliares, user?.id);
                setForm(f => ({
                  ...f,
                  jornada_id: v,
                  tecnico_id: crew.tecnico_id,
                  auxiliares: crew.auxiliares,
                  horas_trabajadas: j?.horas_trabajadas != null ? String(j.horas_trabajadas) : "",
                  observaciones: j?.observaciones ?? "",
                }));
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar jornada" />
              </SelectTrigger>
              <SelectContent>
                {jornadas.map(j => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.fecha} - {j.estado === "Completado" ? "Realizada" : j.estado === "Cancelada" ? "No realizada" : "Pendiente"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TecnicosPicker
            tecnicos={tecnicos}
            principalId={form.tecnico_id}
            auxiliares={form.auxiliares}
            onChange={({ principalId, auxiliares }) => setForm(f => ({ ...f, tecnico_id: principalId ?? "", auxiliares }))}
            label="Cuadrilla"
            helperText="Estrella = principal. El resto, auxiliares."
          />

          <div className="space-y-1.5">
            <Label>Horas trabajadas</Label>
            <input
              type="number"
              step="0.5"
              min="0"
              inputMode="decimal"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px]"
              value={form.horas_trabajadas}
              onChange={(e) => setForm(f => ({ ...f, horas_trabajadas: e.target.value }))}
              placeholder="0"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Observacion</Label>
            <Textarea
              rows={4}
              value={form.observaciones}
              onChange={(e) => setForm(f => ({ ...f, observaciones: e.target.value }))}
              placeholder={
                form.resultado === "realizada"
                  ? "Que se hizo, que quedo pendiente o comentario breve..."
                  : "Motivo por el que no se pudo realizar..."
              }
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Si el trabajo necesita continuar otro dia, guarda este resultado y programa una nueva jornada.
          </p>
        </div>
      </ResponsiveDrawerBody>

      <ResponsiveDrawerFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={busy}>
          {busy ? "Guardando..." : "Guardar resultado"}
        </Button>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );
}

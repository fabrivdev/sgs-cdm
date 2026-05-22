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
    observaciones: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const pendiente = jornadas.find((j) => j.id === initialJornadaId) ?? jornadas.find((j) => j.estado === "Pendiente") ?? jornadas[0];
    setForm({
      tecnico_id: pendiente?.tecnico_responsable_id ?? defaultTecnicoId ?? user?.id ?? "",
      auxiliares: (pendiente?.auxiliares && pendiente.auxiliares.length > 0) ? pendiente.auxiliares : (defaultAuxiliares ?? []),
      jornada_id: pendiente?.id ?? "",
      resultado: "realizada",
      observaciones: "",
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
        <h2 className="text-base font-semibold">Cargar resultado</h2>
        <p className="text-xs text-muted-foreground mt-1">
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
                setForm(f => ({
                  ...f,
                  jornada_id: v,
                  tecnico_id: j?.tecnico_responsable_id ?? f.tecnico_id,
                  auxiliares: j?.auxiliares ?? f.auxiliares,
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

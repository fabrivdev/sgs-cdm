import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EstadoBadge, MarcaBadge } from "@/components/StatusBadges";
import { ESTADOS, type Estado, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { MapPin, Wrench } from "lucide-react";

interface Servicio {
  id: string;
  fecha_programada: string;
  dia_semana: string;
  semana: number;
  tecnico_responsable_id: string | null;
  auxiliares: string[];
  sucursal: Sucursal;
  cliente_id: string | null;
  marca: Marca;
  tipo_trabajo: TipoTrabajo;
  trabajo_descripcion: string;
  estado: Estado;
  observaciones: string | null;
  horas_trabajadas: number | null;
}
interface Profile { id: string; nombre: string }
interface Cliente { id: string; nombre: string }

interface Props {
  servicio: Servicio | null;
  onOpenChange: (o: boolean) => void;
  profiles: Profile[];
  clientes: Cliente[];
  onChanged: () => void;
}

export function ServicioDetalleDialog({ servicio, onOpenChange, profiles, clientes, onChanged }: Props) {
  const { user, isAdmin, isCabecilla } = useAuth();
  const [estado, setEstado] = useState<Estado>("Pendiente");
  const [horas, setHoras] = useState<string>("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (servicio) {
      setEstado(servicio.estado);
      setHoras(servicio.horas_trabajadas?.toString() ?? "");
      setObs(servicio.observaciones ?? "");
    }
  }, [servicio]);

  if (!servicio) return null;

  const profById = Object.fromEntries(profiles.map((p) => [p.id, p.nombre]));
  const cliById = Object.fromEntries(clientes.map((c) => [c.id, c.nombre]));
  const isAssigned = user && (servicio.tecnico_responsable_id === user.id || servicio.auxiliares.includes(user.id));
  const canEdit = isAdmin || isCabecilla || isAssigned;
  const tipo = servicio.tipo_trabajo ?? "Visita de campo";

  const save = async () => {
    if (estado === "Completado" && !horas) { toast.error("Cargá las horas trabajadas para completar."); return; }
    setBusy(true);
    const { error } = await supabase.from("servicios").update({
      estado,
      horas_trabajadas: horas ? Number(horas) : null,
      observaciones: obs || null,
    }).eq("id", servicio.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Actualizado"); onChanged(); onOpenChange(false); }
  };

  return (
    <Dialog open={!!servicio} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Detalle del servicio
            <MarcaBadge marca={servicio.marca} />
            <Badge variant="outline" className="gap-1 text-[10px]">
              {tipo === "Máquina en taller" ? <Wrench className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
              {tipo}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Row k="Fecha" v={`${format(parseISO(servicio.fecha_programada), "dd/MM/yyyy")} (${servicio.dia_semana}, sem ${servicio.semana})`} />
          <Row k="Sucursal" v={servicio.sucursal} />
          <Row k="Cliente" v={servicio.cliente_id ? cliById[servicio.cliente_id] : "—"} />
          <Row k="Responsable" v={servicio.tecnico_responsable_id ? profById[servicio.tecnico_responsable_id] : "—"} />
          <Row k="Auxiliares" v={servicio.auxiliares.map((a) => profById[a]).filter(Boolean).join(", ") || "—"} />
          <div>
            <div className="text-xs text-muted-foreground">Trabajo o problema a resolver</div>
            <div className="rounded-md bg-muted/40 p-2 text-sm">{servicio.trabajo_descripcion}</div>
          </div>

          {canEdit ? (
            <>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={estado} onValueChange={(v) => setEstado(v as Estado)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Horas trabajadas {estado === "Completado" && <span className="text-destructive">*</span>}</Label>
                <Input type="number" step="0.5" min="0" value={horas} onChange={(e) => setHoras(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Observaciones</Label>
                <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
              </div>
            </>
          ) : (
            <>
              <Row k="Estado" v={<EstadoBadge estado={servicio.estado} />} />
              <Row k="Horas" v={servicio.horas_trabajadas ?? "—"} />
              <Row k="Observaciones" v={servicio.observaciones ?? "—"} />
            </>
          )}
        </div>
        {canEdit && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-sm text-right">{v}</span>
    </div>
  );
}

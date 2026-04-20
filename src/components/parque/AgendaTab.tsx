import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, Save, X, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Sucursal } from "@/lib/constants";

const RESULTADOS = [
  "Contactado",
  "No contesta",
  "Rechazó",
  "Agendó servicio",
  "Pendiente llamar",
] as const;

type Cliente = { id: string; nombre: string; sucursal: Sucursal | null; activo: boolean };
type Maquina = { cliente_id: string | null };
type Seguimiento = { cliente_id: string; fecha: string; resultado: string };

const resultadoColor = (r: string | undefined) => {
  switch (r) {
    case "Agendó servicio": return "bg-emerald-500 text-white";
    case "Contactado": return "bg-blue-500 text-white";
    case "Pendiente llamar": return "bg-amber-500 text-white";
    case "No contesta": return "bg-muted text-foreground";
    case "Rechazó": return "bg-destructive text-destructive-foreground";
    default: return "bg-muted text-foreground";
  }
};

export function AgendaTab({ onOpenCliente, onChanged }: { onOpenCliente: (id: string) => void; onChanged: () => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string>("Contactado");
  const [obs, setObs] = useState("");

  const cargar = async () => {
    setLoading(true);
    const [c, m, s] = await Promise.all([
      supabase.from("clientes").select("id, nombre, sucursal, activo").eq("activo", true),
      supabase.from("parque_maquinas").select("cliente_id").eq("activo", true),
      supabase.from("seguimiento_comercial").select("cliente_id, fecha, resultado").order("fecha", { ascending: false }),
    ]);
    setClientes((c.data ?? []) as Cliente[]);
    setMaquinas((m.data ?? []) as Maquina[]);
    setSeguimientos((s.data ?? []) as Seguimiento[]);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const filas = useMemo(() => {
    const cantPorCliente = new Map<string, number>();
    for (const mq of maquinas) {
      if (!mq.cliente_id) continue;
      cantPorCliente.set(mq.cliente_id, (cantPorCliente.get(mq.cliente_id) ?? 0) + 1);
    }
    const ultPorCliente = new Map<string, Seguimiento>();
    for (const sg of seguimientos) {
      const cur = ultPorCliente.get(sg.cliente_id);
      if (!cur || new Date(cur.fecha) < new Date(sg.fecha)) ultPorCliente.set(sg.cliente_id, sg);
    }
    const hoy = Date.now();
    return clientes
      .map((cli) => {
        const ult = ultPorCliente.get(cli.id);
        const dias = ult ? Math.floor((hoy - new Date(ult.fecha).getTime()) / 86400000) : null;
        return {
          cliente: cli,
          cantMaquinas: cantPorCliente.get(cli.id) ?? 0,
          dias,
          ultResultado: ult?.resultado ?? null,
        };
      })
      .sort((a, b) => {
        const da = a.dias ?? Number.MAX_SAFE_INTEGER;
        const db = b.dias ?? Number.MAX_SAFE_INTEGER;
        return db - da;
      });
  }, [clientes, maquinas, seguimientos]);

  const colorDias = (d: number | null) => {
    if (d == null) return "text-destructive font-bold";
    if (d > 365) return "text-destructive font-bold";
    if (d > 180) return "text-amber-600 font-semibold";
    return "text-foreground";
  };

  const guardar = async (clienteId: string) => {
    if (!user) return;
    const { error } = await supabase.from("seguimiento_comercial").insert({
      cliente_id: clienteId,
      usuario_id: user.id,
      resultado: resultado as never,
      observaciones: obs || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Seguimiento registrado");
    setOpenForm(null);
    setObs("");
    setResultado("Contactado");
    await cargar();
    onChanged();
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">{filas.length} clientes — ordenados por días sin contacto</div>
      <div className="rounded-md border bg-card divide-y">
        {loading && <div className="p-6 text-center text-muted-foreground">Cargando...</div>}
        {!loading && filas.length === 0 && <div className="p-6 text-center text-muted-foreground">Sin clientes.</div>}
        {!loading && filas.map((f) => (
          <div key={f.cliente.id}>
            <div className="flex items-center gap-2 p-3">
              <button
                onClick={() => onOpenCliente(f.cliente.id)}
                className="min-w-0 flex-1 text-left hover:opacity-80"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{f.cliente.nombre}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {f.cliente.sucursal && <span>{f.cliente.sucursal}</span>}
                  <span>· {f.cantMaquinas} máq.</span>
                  {f.ultResultado && (
                    <Badge className={cn("text-[10px]", resultadoColor(f.ultResultado))}>{f.ultResultado}</Badge>
                  )}
                </div>
              </button>
              <div className={cn("text-right text-sm whitespace-nowrap tabular-nums", colorDias(f.dias))}>
                {f.dias == null ? "Nunca" : `${f.dias}d`}
              </div>
              <Button
                size="sm"
                variant={openForm === f.cliente.id ? "secondary" : "outline"}
                onClick={() => {
                  setOpenForm(openForm === f.cliente.id ? null : f.cliente.id);
                  setResultado("Contactado");
                  setObs("");
                }}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {openForm === f.cliente.id && (
              <div className="space-y-2 border-t bg-muted/30 p-3">
                <Select value={resultado} onValueChange={setResultado}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESULTADOS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Observaciones..."
                  rows={2}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setOpenForm(null)}>
                    <X className="mr-1 h-3.5 w-3.5" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={() => guardar(f.cliente.id)}>
                    <Save className="mr-1 h-3.5 w-3.5" /> Guardar
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

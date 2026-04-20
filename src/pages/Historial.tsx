import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EstadoBadge, MarcaBadge } from "@/components/StatusBadges";
import { Search } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ServicioDetalleDialog } from "@/components/ServicioDetalleDialog";
import type { Estado, Marca, Sucursal } from "@/lib/constants";

interface Servicio {
  id: string; fecha_programada: string; dia_semana: string; semana: number;
  tecnico_responsable_id: string | null; auxiliares: string[];
  sucursal: Sucursal; cliente_id: string | null; marca: Marca;
  trabajo_descripcion: string; estado: Estado; observaciones: string | null; horas_trabajadas: number | null;
  visto_por: string[];
}
interface Profile { id: string; nombre: string }
interface Cliente { id: string; nombre: string; sucursal: Sucursal }

export default function Historial() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Cliente | null>(null);
  const [detalle, setDetalle] = useState<Servicio | null>(null);

  const load = async () => {
    const [{ data: srv }, { data: prof }, { data: cli }] = await Promise.all([
      supabase.from("servicios").select("*").order("fecha_programada", { ascending: false }),
      supabase.from("profiles").select("id, nombre"),
      supabase.from("clientes").select("id, nombre, sucursal").order("nombre"),
    ]);
    setServicios((srv ?? []) as Servicio[]);
    setProfiles((prof ?? []) as Profile[]);
    setClientes((cli ?? []) as Cliente[]);
  };
  useEffect(() => { load(); }, []);

  const profById = Object.fromEntries(profiles.map((p) => [p.id, p.nombre]));

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  }, [q, clientes]);

  const historial = useMemo(() => {
    if (!selected) return [];
    return servicios.filter((s) => s.cliente_id === selected.id);
  }, [selected, servicios]);

  return (
    <div className="container max-w-4xl py-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Historial por cliente</h1>
        <p className="text-xs text-muted-foreground">Buscá un cliente para ver todos sus servicios.</p>
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar cliente…" value={q} onChange={(e) => { setQ(e.target.value); setSelected(null); }} />
        </div>
        {matches.length > 0 && !selected && (
          <ul className="mt-2 divide-y rounded-md border">
            {matches.map((c) => (
              <li key={c.id}>
                <button className="w-full px-3 py-2 text-left hover:bg-accent" onClick={() => { setSelected(c); setQ(c.nombre); }}>
                  <span className="font-medium">{c.nombre}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{c.sucursal}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selected && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">{selected.nombre}</div>
              <div className="text-xs text-muted-foreground">{selected.sucursal} · {historial.length} servicio(s)</div>
            </div>
          </div>
          {historial.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin servicios registrados.</p>
          ) : (
            <ul className="space-y-2">
              {historial.map((s) => (
                <li key={s.id}>
                  <button onClick={() => setDetalle(s)} className="w-full rounded-md border p-3 text-left hover:bg-accent transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium tabular-nums">{format(parseISO(s.fecha_programada), "dd/MM/yyyy")}</span>
                      <div className="flex items-center gap-2">
                        <MarcaBadge marca={s.marca} />
                        <EstadoBadge estado={s.estado} />
                      </div>
                    </div>
                    <div className="mt-1 text-sm">{s.trabajo_descripcion}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {s.tecnico_responsable_id ? profById[s.tecnico_responsable_id] : "—"}
                      {s.horas_trabajadas != null && ` · ${s.horas_trabajadas} hs`}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <ServicioDetalleDialog servicio={detalle} onOpenChange={(o) => !o && setDetalle(null)} profiles={profiles} clientes={clientes} onChanged={load} />
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EstadoBadge, MarcaBadge } from "@/components/StatusBadges";
import { Search, MapPin, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { ServicioDetalleDialog } from "@/components/ServicioDetalleDialog";
import { MAX_SEARCH_RESULTS } from "@/lib/constants";
import type { Estado, Marca, Sucursal, TipoTrabajo } from "@/lib/constants";
import { pageDescription, pageShell, pageTitle } from "@/lib/ui-classes";
import { ErrorState } from "@/components/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAssistantPageContext } from "@/contexts/AssistantPageContext";

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
  visto_por: string[];
}

interface Profile {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

interface Cliente {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

const PAGE = 1000;

async function cargarTodo<T>(queryBuilder: any): Promise<T[]> {
  let from = 0;
  const all: T[] = [];

  while (true) {
    const { data, error } = await queryBuilder.range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...(data as T[]));

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

export default function Historial() {
  const { setPageFilters, clearPageFilters } = useAssistantPageContext();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteIdsParque, setClienteIdsParque] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Cliente | null>(null);
  const [detalle, setDetalle] = useState<Servicio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setPageFilters({ busqueda: q || undefined, cliente: selected?.nombre });
    return clearPageFilters;
  }, [clearPageFilters, q, selected?.nombre, setPageFilters]);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [srv, prof, cli, parque] = await Promise.all([
        cargarTodo<Servicio>(
          supabase.from("servicios").select("*").order("fecha_programada", { ascending: false }),
        ),
        cargarTodo<Profile>(
          supabase.from("profiles").select("id, nombre, sucursal").order("nombre", { ascending: true }),
        ),
        cargarTodo<Cliente>(
          supabase.from("clientes").select("id, nombre, sucursal").order("nombre", { ascending: true }),
        ),
        cargarTodo<{ cliente_id: string | null }>(
          supabase.from("parque_maquinas").select("cliente_id"),
        ),
      ]);

      setServicios(srv);
      setProfiles(prof);
      setClientes(cli);

      const ids = new Set<string>();
      for (const p of parque) {
        if (p.cliente_id) ids.add(p.cliente_id);
      }
      setClienteIdsParque(ids);
    } catch (e: any) {
      setError(true);
      toast.error(e?.message ?? "No se pudo cargar el historial");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const profById = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p.nombre])),
    [profiles],
  );

  // Esta pantalla debe buscar SOLO clientes que tienen máquinas en parque.
  const clientesDelParque = useMemo(() => {
    return clientes.filter((c) => clienteIdsParque.has(c.id));
  }, [clientes, clienteIdsParque]);

  const { matches, totalMatches } = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return { matches: [], totalMatches: 0 };
    const all = clientesDelParque.filter((c) => c.nombre.toLowerCase().includes(query));
    return { matches: all.slice(0, MAX_SEARCH_RESULTS), totalMatches: all.length };
  }, [q, clientesDelParque]);

  const historial = useMemo(() => {
    if (!selected) return [];
    return servicios.filter((s) => s.cliente_id === selected.id);
  }, [selected, servicios]);

  return (
    <div className={pageShell}>
      <div>
        <h1 className={pageTitle}>Historial por cliente</h1>
        <p className={pageDescription}>
          Buscá un cliente del parque para ver todos sus servicios.
        </p>
      </div>

      {error && (
        <ErrorState
          title="No se pudo cargar el historial"
          description="Verificá tu conexión e intentá de nuevo."
          onRetry={load}
        />
      )}

      {loading && (
        <Card className="p-3">
          <Skeleton className="h-9 w-full" />
        </Card>
      )}

      {!loading && !error && <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className={q ? "pl-9 pr-9" : "pl-9"}
            placeholder="Buscar cliente del parque…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSelected(null);
            }}
          />
          {q && (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => { setQ(""); setSelected(null); }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {q.trim() && matches.length === 0 && !selected && (
          <div className="mt-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            No se encontraron clientes del parque con ese nombre.
          </div>
        )}

        {matches.length > 0 && !selected && (
          <ul className="mt-2 divide-y rounded-md border">
            {matches.map((c) => (
              <li key={c.id}>
                <button
                  className="w-full px-3 py-2 text-left hover:bg-accent"
                  onClick={() => {
                    setSelected(c);
                    setQ(c.nombre);
                  }}
                >
                  <span className="font-medium">{c.nombre}</span>
                  {c.sucursal && <span className="ml-2 text-xs text-muted-foreground">{c.sucursal}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {totalMatches > MAX_SEARCH_RESULTS && !selected && (
          <p className="mt-1 text-center text-[11px] text-muted-foreground">
            Mostrando {MAX_SEARCH_RESULTS} de {totalMatches} — afinás la búsqueda para ver más.
          </p>
        )}
      </Card>}

      {!loading && !error && selected && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold">{selected.nombre}</div>
              <div className="text-xs text-muted-foreground">
                {selected.sucursal ? `${selected.sucursal} · ` : ""}
                {historial.length} servicio(s)
              </div>
            </div>
          </div>

          {historial.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin servicios registrados.</p>
          ) : (
            <ul className="space-y-2">
              {historial.map((s) => {
                const tipo = s.tipo_trabajo ?? "Visita de campo";
                const TipoIcon = tipo === "Máquina en taller" ? Wrench : MapPin;

                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setDetalle(s)}
                      className="w-full rounded-md border p-3 text-left hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium tabular-nums">
                          {format(parseISO(s.fecha_programada), "dd/MM/yyyy")}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="gap-0.5 px-1.5 py-0 text-[10px]">
                            <TipoIcon className="h-2.5 w-2.5" />
                            {tipo === "Máquina en taller" ? "Taller" : "Visita"}
                          </Badge>
                          <MarcaBadge marca={s.marca} />
                          <EstadoBadge estado={s.estado} />
                        </div>
                      </div>

                      <div className="mt-1 text-sm">{s.trabajo_descripcion}</div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        {s.tecnico_responsable_id ? profById[s.tecnico_responsable_id] ?? "—" : "—"}
                        {s.horas_trabajadas != null && ` · ${s.horas_trabajadas} hs`}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <ServicioDetalleDialog
        servicio={detalle}
        onOpenChange={(o) => !o && setDetalle(null)}
        profiles={profiles}
        clientes={clientes}
        onChanged={load}
      />
    </div>
  );
}

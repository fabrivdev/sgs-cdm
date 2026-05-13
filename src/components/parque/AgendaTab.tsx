import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronRight, Save, X, MessageSquarePlus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Sucursal } from "@/lib/constants";

const RESULTADOS = [
  "Contactado",
  "No contesta",
  "Rechazó",
  "Agendó servicio",
  "Pendiente llamar",
] as const;

type Cliente = { id: string; nombre: string; sucursal: Sucursal | null; activo: boolean | null };
type Maquina = { cliente_id: string | null; sucursal: Sucursal | null };
type Seguimiento = {
  id?: string;
  cliente_id: string;
  fecha: string;
  resultado: string;
  observaciones?: string | null;
  usuario_id?: string | null;
};

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

const resultadoColor = (r: string | undefined) => {
  switch (r) {
    case "Agendó servicio":
      return "bg-emerald-500 text-white";
    case "Contactado":
      return "bg-blue-500 text-white";
    case "Pendiente llamar":
      return "bg-amber-500 text-white";
    case "No contesta":
      return "bg-muted text-foreground";
    case "Rechazó":
      return "bg-destructive text-destructive-foreground";
    default:
      return "bg-muted text-foreground";
  }
};

export function AgendaTab({
  onOpenCliente,
  onChanged,
}: {
  onOpenCliente: (id: string) => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string>("Contactado");
  const [obs, setObs] = useState("");

  // Historial filtros
  const [hQ, setHQ] = useState("");
  const [hResultado, setHResultado] = useState<string>("all");
  const [hRango, setHRango] = useState<string>("30");

  const cargar = async () => {
    setLoading(true);

    try {
      const [c, m, s] = await Promise.all([
        // Cargar TODOS los clientes con paginación.
        // Sin paginación, Supabase trae solo los primeros 1000 y varios seguimientos quedan como "—".
        cargarTodo<Cliente>(
          supabase.from("clientes").select("id, nombre, sucursal, activo").order("nombre", { ascending: true }),
        ),

        // No filtramos por activo aquí porque en parque_maquinas algunos importados pueden tener activo NULL.
        // La vista de parque los muestra igual, así que agenda debe partir del mismo universo.
        cargarTodo<Maquina>(
          supabase.from("parque_maquinas").select("cliente_id, sucursal"),
        ),

        cargarTodo<Seguimiento>(
          supabase
            .from("seguimiento_comercial")
            .select("id, cliente_id, fecha, resultado, observaciones, usuario_id")
            .order("fecha", { ascending: false }),
        ),
      ]);

      setClientes(c);
      setMaquinas(m);
      setSeguimientos(s);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "No se pudo cargar la agenda comercial");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const cliById = useMemo(() => {
    const m = new Map<string, Cliente>();
    for (const c of clientes) m.set(c.id, c);
    return m;
  }, [clientes]);

  const sucursalesPorCliente = useMemo(() => {
    const m = new Map<string, string>();
    const sets = new Map<string, Set<string>>();
    for (const mq of maquinas) {
      if (!mq.cliente_id || !mq.sucursal) continue;
      const set = sets.get(mq.cliente_id) ?? new Set<string>();
      set.add(mq.sucursal);
      sets.set(mq.cliente_id, set);
    }
    for (const [k, v] of sets) m.set(k, Array.from(v).sort().join(", "));
    return m;
  }, [maquinas]);

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

    return [...cantPorCliente.entries()]
      .map(([clienteId, cantMaquinas]) => {
        const cli = cliById.get(clienteId);
        const ult = ultPorCliente.get(clienteId);
        const dias = ult ? Math.floor((hoy - new Date(ult.fecha).getTime()) / 86400000) : null;

        return {
          clienteId,
          cliente: cli ?? null,
          cantMaquinas,
          dias,
          ultResultado: ult?.resultado ?? null,
        };
      })
      .filter((f) => !!f.cliente)
      .sort((a, b) => {
        const da = a.dias ?? Number.MAX_SAFE_INTEGER;
        const db = b.dias ?? Number.MAX_SAFE_INTEGER;
        return db - da;
      });
  }, [maquinas, seguimientos, cliById]);

  const historial = useMemo(() => {
    const ql = hQ.trim().toLowerCase();
    const limite = hRango === "all" ? 0 : Date.now() - Number(hRango) * 86400000;

    return seguimientos.filter((s) => {
      if (hResultado !== "all" && s.resultado !== hResultado) return false;
      if (limite && new Date(s.fecha).getTime() < limite) return false;

      if (ql) {
        const nombre = cliById.get(s.cliente_id)?.nombre ?? "";
        if (!nombre.toLowerCase().includes(ql)) return false;
      }

      return true;
    });
  }, [seguimientos, hQ, hResultado, hRango, cliById]);

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
    <Tabs defaultValue="pendientes" className="space-y-3">
      <TabsList>
        <TabsTrigger value="pendientes" className="text-xs sm:text-sm">
          Pendientes
        </TabsTrigger>
        <TabsTrigger value="historial" className="text-xs sm:text-sm">
          Historial
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pendientes" className="space-y-2">
        <div className="text-xs text-muted-foreground">
          {filas.length} clientes — ordenados por días sin contacto
        </div>

        <div className="rounded-md border bg-card divide-y">
          {loading && <div className="p-6 text-center text-muted-foreground">Cargando...</div>}

          {!loading && filas.length === 0 && (
            <div className="p-6 text-center text-muted-foreground">Sin clientes.</div>
          )}

          {!loading &&
            filas.map((f) => {
              const cli = f.cliente!;
              return (
                <div key={cli.id}>
                  <div className="flex items-center gap-2 p-3">
                    <button
                      onClick={() => onOpenCliente(cli.id)}
                      className="min-w-0 flex-1 text-left hover:opacity-80"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{cli.nombre}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {sucursalesPorCliente.get(cli.id) && <span>{sucursalesPorCliente.get(cli.id)}</span>}
                        <span>· {f.cantMaquinas} máq.</span>
                        {f.ultResultado && (
                          <Badge className={cn("text-[10px]", resultadoColor(f.ultResultado))}>
                            {f.ultResultado}
                          </Badge>
                        )}
                      </div>
                    </button>

                    <div className={cn("text-right text-sm whitespace-nowrap tabular-nums", colorDias(f.dias))}>
                      {f.dias == null ? "Nunca" : `${f.dias}d`}
                    </div>

                    <Button
                      size="sm"
                      variant={openForm === cli.id ? "secondary" : "outline"}
                      onClick={() => {
                        setOpenForm(openForm === cli.id ? null : cli.id);
                        setResultado("Contactado");
                        setObs("");
                      }}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {openForm === cli.id && (
                    <div className="space-y-2 border-t bg-muted/30 p-3">
                      <Select value={resultado} onValueChange={setResultado}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RESULTADOS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
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
                        <Button size="sm" onClick={() => guardar(cli.id)}>
                          <Save className="mr-1 h-3.5 w-3.5" /> Guardar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </TabsContent>

      <TabsContent value="historial" className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={hQ}
              onChange={(e) => setHQ(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select value={hResultado} onValueChange={setHResultado}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Resultado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los resultados</SelectItem>
              {RESULTADOS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={hRango} onValueChange={setHRango}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 días</SelectItem>
              <SelectItem value="30">Últimos 30 días</SelectItem>
              <SelectItem value="90">Últimos 90 días</SelectItem>
              <SelectItem value="all">Todo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground">{historial.length} seguimientos</div>

        <div className="rounded-md border bg-card divide-y">
          {loading && <div className="p-6 text-center text-muted-foreground">Cargando...</div>}

          {!loading && historial.length === 0 && (
            <div className="p-6 text-center text-muted-foreground">Sin seguimientos en este filtro.</div>
          )}

          {!loading &&
            historial.map((s, i) => {
              const cli = cliById.get(s.cliente_id);

              return (
                <div key={s.id ?? `${s.cliente_id}-${s.fecha}-${i}`} className="p-3">
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => cli && onOpenCliente(cli.id)}
                      className="min-w-0 flex-1 text-left hover:opacity-80"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{cli?.nombre ?? "Cliente no encontrado"}</span>
                        {cli && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        {cli?.sucursal && <span>{cli.sucursal}</span>}
                        <span>· {format(new Date(s.fecha), "dd/MM/yyyy HH:mm")}</span>
                      </div>
                    </button>

                    <Badge className={cn("text-[10px] shrink-0", resultadoColor(s.resultado))}>
                      {s.resultado}
                    </Badge>
                  </div>

                  {s.observaciones && (
                    <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                      {s.observaciones}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </TabsContent>
    </Tabs>
  );
}

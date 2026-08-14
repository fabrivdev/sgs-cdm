import { useEffect, useMemo, useState, type ElementType } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CalendarCheck2, ChevronRight, Clock3, PhoneCall, ReceiptText, Save, X, MessageSquarePlus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { SUCURSALES, type Sucursal } from "@/lib/constants";
import { trabajoReferencia } from "@/lib/trabajos";
import {
  esParaContactar,
  buildClientesConTrabajoAbierto,
  diasDesde,
} from "@/lib/contacto-utils";

const RESULTADOS = [
  "Contactado",
  "No contesta",
  "Rechazó",
  "Agendó servicio",
  "Pendiente llamar",
] as const;

type Cliente = { id: string; nombre: string; sucursal: Sucursal | null; activo: boolean | null };
type Maquina = { cliente_id: string | null; sucursal: Sucursal | null };
type UltimaFactura = { cliente_id: string; ult_servicio: string | null; ult_repuesto: string | null };
type TrabajoAgenda = {
  id: string;
  cliente_id: string | null;
  codigo: string | null;
  os_numero: string | null;
  creado_en: string;
  estado_general: string;
  descripcion_problema: string;
};
type Seguimiento = {
  id?: string;
  cliente_id: string;
  fecha: string;
  resultado: string;
  observaciones?: string | null;
  usuario_id?: string | null;
  trabajo_id?: string | null;
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
  const [ultimasFacturas, setUltimasFacturas] = useState<UltimaFactura[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [trabajos, setTrabajos] = useState<TrabajoAgenda[]>([]);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string>("Contactado");
  const [obs, setObs] = useState("");
  const [pQ, setPQ] = useState("");
  const [pSucursal, setPSucursal] = useState<string>("all");

  // Historial filtros
  const [hQ, setHQ] = useState("");
  const [hResultado, setHResultado] = useState<string>("all");

  const cargar = async () => {
    setLoading(true);

    try {
      const [c, m, s, uf] = await Promise.all([
        // Cargar TODOS los clientes con paginación.
        // Sin paginación, Supabase trae solo los primeros 1000 y varios seguimientos quedan como "—".
        cargarTodo<Cliente>(
          supabase.from("clientes").select("id, nombre, sucursal, activo").order("nombre", { ascending: true }),
        ),

        // No filtramos por activo aquí porque en parque_maquinas algunos importados pueden tener activo NULL.
        // La vista de parque los muestra igual, así que agenda debe partir del mismo universo.
        cargarTodo<Maquina>(
          supabase.from("parque_maquinas").select("cliente_id, sucursal").eq("activo", true),
        ),

        (async () => {
          const base = (supabase as any).from("seguimiento_comercial");
          try {
            return await cargarTodo<Seguimiento>(
              base
                .select("id, cliente_id, fecha, resultado, observaciones, usuario_id, trabajo_id")
                .order("fecha", { ascending: false }),
            );
          } catch (error: any) {
            if (!/trabajo_id|schema cache|column/i.test(error?.message ?? "")) throw error;
            return cargarTodo<Seguimiento>(
              supabase
                .from("seguimiento_comercial")
                .select("id, cliente_id, fecha, resultado, observaciones, usuario_id")
                .order("fecha", { ascending: false }),
            );
          }
        })(),

        supabase.rpc("parque_ultimas_facturas"),
      ]);

      setClientes(c);
      setMaquinas(m);
      setSeguimientos(s);
      setUltimasFacturas((uf.data ?? []) as UltimaFactura[]);

      const clienteIds = Array.from(new Set(m.map((maquina) => maquina.cliente_id).filter((id): id is string => !!id)));
      if (clienteIds.length > 0) {
        const trabajosRows = await cargarTodo<TrabajoAgenda>(
          supabase
            .from("trabajos")
            .select("id, cliente_id, codigo, os_numero, creado_en, estado_general, descripcion_problema")
            .in("cliente_id", clienteIds)
            .order("creado_en", { ascending: false }),
        );
        setTrabajos(trabajosRows);
      } else {
        setTrabajos([]);
      }
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

  const clientesParqueIds = useMemo(
    () => new Set(maquinas.map((maquina) => maquina.cliente_id).filter((id): id is string => !!id)),
    [maquinas],
  );

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

  const clientesConTrabajoAbierto = useMemo(
    () => buildClientesConTrabajoAbierto(trabajos),
    [trabajos],
  );

  const trabajosAbiertosPorCliente = useMemo(() => {
    const map = new Map<string, TrabajoAgenda[]>();
    for (const trabajo of trabajos) {
      if (!trabajo.cliente_id) continue;
      if (!clientesConTrabajoAbierto.has(trabajo.cliente_id)) continue;
      const list = map.get(trabajo.cliente_id) ?? [];
      list.push(trabajo);
      map.set(trabajo.cliente_id, list);
    }
    return map;
  }, [trabajos, clientesConTrabajoAbierto]);

  const trabajosPorCliente = useMemo(() => {
    const map = new Map<string, TrabajoAgenda[]>();
    for (const trabajo of trabajos) {
      if (!trabajo.cliente_id) continue;
      const list = map.get(trabajo.cliente_id) ?? [];
      list.push(trabajo);
      map.set(trabajo.cliente_id, list);
    }
    return map;
  }, [trabajos]);

  const filas = useMemo(() => {
    const cantPorCliente = new Map<string, number>();
    const ultSegPorCliente = new Map<string, Seguimiento>();
    const ultFactPorCliente = new Map<string, UltimaFactura>();

    for (const mq of maquinas) {
      if (!mq.cliente_id) continue;
      cantPorCliente.set(mq.cliente_id, (cantPorCliente.get(mq.cliente_id) ?? 0) + 1);
    }

    for (const uf of ultimasFacturas) {
      ultFactPorCliente.set(uf.cliente_id, uf);
    }

    for (const sg of seguimientos) {
      const cur = ultSegPorCliente.get(sg.cliente_id);
      if (!cur || new Date(cur.fecha) < new Date(sg.fecha)) {
        ultSegPorCliente.set(sg.cliente_id, sg);
      }
    }

    return [...cantPorCliente.entries()]
      .map(([clienteId, cantMaquinas]) => {
        const cli = cliById.get(clienteId);
        const ult = ultSegPorCliente.get(clienteId);
        const ultFactura = ultFactPorCliente.get(clienteId);
        const ultServicio = ultFactura?.ult_servicio ?? null;
        const ultRepuesto = ultFactura?.ult_repuesto ?? null;
        const trabajosAbiertos = trabajosAbiertosPorCliente.get(clienteId) ?? [];
        const trabajoActivo = trabajosAbiertos[0] ?? null;

        return {
          clienteId,
          cliente: cli ?? null,
          cantMaquinas,
          dias: diasDesde(ult?.fecha ?? null),
          diasUltServicio: diasDesde(ultServicio),
          ultResultado: ult?.resultado ?? null,
          trabajoActivo,
          trabajosAbiertosCount: trabajosAbiertos.length,
          paraContactar: esParaContactar({
            clienteId,
            ultSeguimientoFecha: ult?.fecha ?? null,
            ultServicioFecha: ultServicio,
            ultRepuestoFecha: ultRepuesto,
            tieneTrabajoAbierto: clientesConTrabajoAbierto.has(clienteId),
            tieneRepEnRango: false,
            tieneSrvEnRango: false,
          }),
        };
      })
      .filter((f) => !!f.cliente)
      .filter((f) => f.paraContactar)
      .sort((a, b) => {
        const da = a.dias ?? Number.MAX_SAFE_INTEGER;
        const db = b.dias ?? Number.MAX_SAFE_INTEGER;
        return db - da;
      });
  }, [maquinas, seguimientos, ultimasFacturas, cliById, trabajosAbiertosPorCliente, clientesConTrabajoAbierto]);

  const agendaKpis = useMemo(() => {
    const desde90 = new Date(Date.now() - 90 * 86400000);
    const pendienteIds = new Set(filas.map((fila) => fila.clienteId));
    const gestionados90 = new Set<string>();
    const facturados90 = new Set<string>();
    const facturados90FueraParque = new Set<string>();
    const clientesConSeguimiento = new Set<string>();
    const seguimientosPorCliente = new Map<string, number>();
    const maquinasPorCliente = new Map<string, number>();

    for (const seguimiento of seguimientos) {
      if (clientesParqueIds.has(seguimiento.cliente_id)) {
        clientesConSeguimiento.add(seguimiento.cliente_id);
        seguimientosPorCliente.set(
          seguimiento.cliente_id,
          (seguimientosPorCliente.get(seguimiento.cliente_id) ?? 0) + 1,
        );
      }

      if (!pendienteIds.has(seguimiento.cliente_id)) continue;
      if (new Date(seguimiento.fecha) < desde90) continue;
      gestionados90.add(seguimiento.cliente_id);
    }

    for (const maquina of maquinas) {
      if (!maquina.cliente_id) continue;
      maquinasPorCliente.set(maquina.cliente_id, (maquinasPorCliente.get(maquina.cliente_id) ?? 0) + 1);
    }

    for (const factura of ultimasFacturas) {
      if (!factura.cliente_id) continue;
      const ultServicio = factura.ult_servicio ? new Date(`${factura.ult_servicio}T00:00:00`) : null;
      const ultRepuesto = factura.ult_repuesto ? new Date(`${factura.ult_repuesto}T00:00:00`) : null;
      if ((ultServicio && ultServicio >= desde90) || (ultRepuesto && ultRepuesto >= desde90)) {
        if (clientesParqueIds.has(factura.cliente_id)) {
          facturados90.add(factura.cliente_id);
        } else {
          facturados90FueraParque.add(factura.cliente_id);
        }
      }
    }

    return {
      pendientes: filas.length,
      serviciosAsociados: clientesConTrabajoAbierto.size,
      gestionados90: gestionados90.size,
      facturados90: facturados90.size,
      sinHistorial: filas.filter((fila) => fila.dias == null).length,
      validacion: {
        registrosSeguimiento: seguimientos.filter((seguimiento) => clientesParqueIds.has(seguimiento.cliente_id)).length,
        clientesUnicosSeguimiento: clientesConSeguimiento.size,
        clientesConMasDeUnaGestion: Array.from(seguimientosPorCliente.values()).filter((total) => total > 1).length,
        clientesConMasDeUnaMaquina: Array.from(maquinasPorCliente.values()).filter((total) => total > 1).length,
        facturados90FueraParque: facturados90FueraParque.size,
      },
    };
  }, [filas, seguimientos, ultimasFacturas, clientesConTrabajoAbierto, clientesParqueIds, maquinas]);

  const filasFiltradas = useMemo(() => {
    const ql = pQ.trim().toLowerCase();

    return filas.filter((fila) => {
      const cliente = fila.cliente;
      if (!cliente) return false;
      if (ql && !cliente.nombre.toLowerCase().includes(ql)) return false;
      if (pSucursal !== "all" && !sucursalesPorCliente.get(cliente.id)?.split(", ").includes(pSucursal)) return false;
      return true;
    });
  }, [filas, pQ, pSucursal, sucursalesPorCliente]);

  const historial = useMemo(() => {
    const ql = hQ.trim().toLowerCase();
    const seguimientoRefs = new Set(
      seguimientos.flatMap((seguimiento) => [
        seguimiento.trabajo_id ?? "",
        ...(seguimiento.observaciones?.match(/(?:TR|OS)-\d+/g) ?? []),
      ]).filter(Boolean),
    );

    const manuales = seguimientos.map((seguimiento) => ({
      key: seguimiento.id ?? `${seguimiento.cliente_id}-${seguimiento.fecha}`,
      cliente_id: seguimiento.cliente_id,
      fecha: seguimiento.fecha,
      resultado: seguimiento.resultado,
      observaciones: seguimiento.observaciones,
      derivadoDeTrabajo: false,
    }));

    const derivados = trabajos
      .filter((trabajo) => trabajo.cliente_id)
      .map((trabajo) => {
        const ref = trabajoReferencia(trabajo);
        return {
          key: `trabajo-${trabajo.id}`,
          cliente_id: trabajo.cliente_id as string,
          fecha: trabajo.creado_en,
          resultado: "Agendó servicio",
          observaciones: `TR asociado: ${ref}\n${trabajo.descripcion_problema}`,
          derivadoDeTrabajo: true,
          trabajoId: trabajo.id,
          ref,
        };
      })
      .filter((item) => !seguimientoRefs.has(item.trabajoId) && !seguimientoRefs.has(item.ref));

    return [...manuales, ...derivados]
      .filter((item) => {
        if (hResultado !== "all" && item.resultado !== hResultado) return false;
        if (ql) {
          const nombre = cliById.get(item.cliente_id)?.nombre ?? "";
          if (!nombre.toLowerCase().includes(ql)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [seguimientos, trabajos, hQ, hResultado, cliById]);

  const historialPorCliente = useMemo(() => {
    const map = new Map<
      string,
      {
        cliente_id: string;
        cliente: Cliente | null;
        total: number;
        ultimo: (typeof historial)[number];
      }
    >();

    for (const item of historial) {
      const actual = map.get(item.cliente_id);
      if (!actual) {
        map.set(item.cliente_id, {
          cliente_id: item.cliente_id,
          cliente: cliById.get(item.cliente_id) ?? null,
          total: 1,
          ultimo: item,
        });
        continue;
      }

      actual.total += 1;
      if (new Date(item.fecha).getTime() > new Date(actual.ultimo.fecha).getTime()) {
        actual.ultimo = item;
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.ultimo.fecha).getTime() - new Date(a.ultimo.fecha).getTime(),
    );
  }, [historial, cliById]);

  const colorDias = (d: number | null) => {
    if (d == null) return "text-destructive font-bold";
    if (d > 365) return "text-destructive font-bold";
    if (d > 180) return "text-amber-600 font-semibold";
    return "text-foreground";
  };

  const guardar = async (clienteId: string) => {
    if (!user) return;

    const trabajoAsociado =
      resultado === "Agendó servicio"
        ? trabajosAbiertosPorCliente.get(clienteId)?.[0] ?? trabajosPorCliente.get(clienteId)?.[0] ?? null
        : null;
    const referenciaTrabajo = trabajoAsociado ? trabajoReferencia(trabajoAsociado) : "";
    const observaciones = [
      obs.trim() || null,
      referenciaTrabajo ? `TR asociado: ${referenciaTrabajo}` : null,
    ].filter(Boolean).join("\n");
    const payload = {
      cliente_id: clienteId,
      usuario_id: user.id,
      resultado: resultado as never,
      observaciones: observaciones || null,
      ...(trabajoAsociado ? { trabajo_id: trabajoAsociado.id } : {}),
    };

    let { error } = await (supabase as any).from("seguimiento_comercial").insert(payload);

    if (error && trabajoAsociado && /trabajo_id|schema cache|column/i.test(error.message ?? "")) {
      const { trabajo_id: _trabajoId, ...payloadSinTrabajo } = payload as typeof payload & { trabajo_id?: string };
      const retry = await supabase.from("seguimiento_comercial").insert(payloadSinTrabajo);
      error = retry.error;
    }

    if (error) return toast.error(error.message);

    toast.success("Seguimiento registrado");
    setOpenForm(null);
    setObs("");
    setResultado("Contactado");
    await cargar();
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <AgendaMetricCard
          title="Para contactar"
          value={agendaKpis.pendientes.toLocaleString()}
          detail="Sin servicio ni contacto vigente"
          icon={AlertTriangle}
          accent={agendaKpis.pendientes > 0 ? "text-destructive" : "text-muted-foreground"}
        />
        <AgendaMetricCard
          title="Con TR asociado"
          value={agendaKpis.serviciosAsociados.toLocaleString()}
          detail="Ya tienen trabajo abierto"
          icon={CalendarCheck2}
          accent="text-emerald-600"
        />
        <AgendaMetricCard
          title="Contactados 90d"
          value={agendaKpis.gestionados90.toLocaleString()}
          detail="Seguimientos recientes"
          icon={PhoneCall}
          accent="text-blue-600"
        />
        <AgendaMetricCard
          title="Facturación 90d"
          value={agendaKpis.facturados90.toLocaleString()}
          detail="Clientes del parque"
          icon={ReceiptText}
          accent="text-emerald-600"
        />
        <AgendaMetricCard
          title="Sin gestión registrada"
          value={agendaKpis.sinHistorial.toLocaleString()}
          detail="Nunca contactados"
          icon={Clock3}
          accent="text-amber-600"
        />
      </div>

      <div className="rounded-md border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Validación:</span>{" "}
        {agendaKpis.validacion.registrosSeguimiento.toLocaleString()} gestiones ·{" "}
        {agendaKpis.validacion.clientesUnicosSeguimiento.toLocaleString()} clientes únicos ·{" "}
        {agendaKpis.validacion.clientesConMasDeUnaGestion.toLocaleString()} con +1 gestión ·{" "}
        {agendaKpis.validacion.clientesConMasDeUnaMaquina.toLocaleString()} con +1 máquina ·{" "}
        {agendaKpis.validacion.facturados90FueraParque.toLocaleString()} facturados fuera del parque
      </div>

    <Tabs defaultValue="pendientes" className="space-y-3">
      <TabsList>
        <TabsTrigger value="pendientes" className="text-[12px] sm:text-[13px]">
          Pendientes
        </TabsTrigger>
        <TabsTrigger value="historial" className="text-[12px] sm:text-[13px]">
          Historial por cliente
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pendientes" className="space-y-2">
        <div className="grid gap-2 rounded-md border bg-card p-2 sm:grid-cols-[1fr_180px]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={pQ}
              onChange={(e) => setPQ(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select value={pSucursal} onValueChange={setPSucursal}>
            <SelectTrigger>
              <SelectValue placeholder="Sucursal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {SUCURSALES.map((sucursal) => (
                <SelectItem key={sucursal} value={sucursal}>
                  {sucursal}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-[12px] text-muted-foreground">
          {filasFiltradas.length} de {filas.length} clientes para contactar
        </div>

        <div className="rounded-md border bg-card divide-y">
          {loading && <div className="p-6 text-center text-muted-foreground">Cargando...</div>}

          {!loading && filasFiltradas.length === 0 && (
            <div className="p-6 text-center text-muted-foreground">Sin clientes.</div>
          )}

          {!loading &&
            filasFiltradas.map((f) => {
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

                    <div className={cn("text-right text-[13px] whitespace-nowrap tabular-nums", colorDias(f.dias))}>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full min-w-0 sm:min-w-[220px] sm:flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={hQ}
              onChange={(e) => setHQ(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select value={hResultado} onValueChange={setHResultado}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder="Resultado" />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              <SelectItem value="all">Todos</SelectItem>
              {RESULTADOS.map((r) => (
                <SelectItem key={r} value={r} className="max-w-[calc(100vw-3rem)] truncate">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-[12px] text-muted-foreground">
          {historialPorCliente.length} clientes con seguimiento
        </div>

        <div className="rounded-md border bg-card divide-y">
          {loading && <div className="p-6 text-center text-muted-foreground">Cargando...</div>}

          {!loading && historialPorCliente.length === 0 && (
            <div className="p-6 text-center text-muted-foreground">Sin seguimientos en este filtro.</div>
          )}

          {!loading &&
            historialPorCliente.map((grupo) => {
              const cli = grupo.cliente;
              const ultimo = grupo.ultimo;

              return (
                <div key={grupo.cliente_id} className="p-3">
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
                        {cli && sucursalesPorCliente.get(cli.id) && <span>{sucursalesPorCliente.get(cli.id)}</span>}
                        <span>· {grupo.total} seguimientos</span>
                        <span>· Último {format(new Date(ultimo.fecha), "dd/MM/yyyy HH:mm")}</span>
                      </div>
                    </button>

                    <Badge className={cn("text-[10px] shrink-0", resultadoColor(ultimo.resultado))}>
                      {ultimo.resultado}
                    </Badge>
                  </div>

                  {ultimo.observaciones && (
                    <div className="mt-2 text-[13px] text-muted-foreground whitespace-pre-wrap break-words">
                      {ultimo.observaciones}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </TabsContent>
    </Tabs>
    </div>
  );
}

function AgendaMetricCard({
  title,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ElementType;
  accent: string;
}) {
  return (
    <Card className="border">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </div>
            <div className={cn("mt-1 text-[18px] font-bold tabular-nums", accent)}>{value}</div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div>
          </div>
          <Icon className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", accent)} />
        </div>
      </CardContent>
    </Card>
  );
}


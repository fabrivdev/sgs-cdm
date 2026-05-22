import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ParqueTab, type ParqueMetricas } from "@/components/parque/ParqueTab";
import { AgendaTab } from "@/components/parque/AgendaTab";
import { MaquinasTab } from "@/components/parque/MaquinasTab";
import { ImportarTab } from "@/components/parque/ImportarTab";
import { ClientePanel } from "@/components/parque/ClientePanel";
import { Tractor, CheckCircle2, PhoneCall, AlertTriangle, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { pageShell, pageTitle } from "@/lib/ui-classes";

interface Metricas {
  totalMaquinas: number;
  pctConServicioUltimoAño: number;
  pctContactadosEsteMes: number;
  sinContacto60d: number;
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

export default function ParqueClientes() {
  const [metricas, setMetricas] = useState<Metricas>({
    totalMaquinas: 0,
    pctConServicioUltimoAño: 0,
    pctContactadosEsteMes: 0,
    sinContacto60d: 0,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [clienteAbierto, setClienteAbierto] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState("parque");
  const [vistaParque, setVistaParque] = useState<"clientes" | "maquinas">("clientes");
  const [parqueMetricas, setParqueMetricas] = useState<ParqueMetricas | null>(null);

  const cargarMetricas = async () => {
    try {
      const [maquinas, seguimientos, ultimas] = await Promise.all([
        cargarTodo<{ cliente_id: string | null }>(
          supabase.from("parque_maquinas").select("cliente_id").eq("activo", true),
        ),
        cargarTodo<{ cliente_id: string; fecha: string }>(
          supabase.from("seguimiento_comercial").select("cliente_id, fecha").order("fecha", { ascending: false }),
        ),
        supabase.rpc("parque_ultimas_facturas"),
      ]);

      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const clienteIds = new Set(maquinas.map((maquina) => maquina.cliente_id).filter((id): id is string => !!id));
      const ultServicioByCliente = new Map(
        ((ultimas.data ?? []) as Array<{ cliente_id: string; ult_servicio: string | null }>).map((row) => [
          row.cliente_id,
          row.ult_servicio,
        ]),
      );
      const ultSeguimientoByCliente = new Map<string, string>();

      for (const seguimiento of seguimientos) {
        const current = ultSeguimientoByCliente.get(seguimiento.cliente_id);
        if (!current || new Date(current) < new Date(seguimiento.fecha)) {
          ultSeguimientoByCliente.set(seguimiento.cliente_id, seguimiento.fecha);
        }
      }

      let conServicioAnio = 0;
      let contactadosMes = 0;
      let paraContactar = 0;

      for (const clienteId of clienteIds) {
        const ultServicio = ultServicioByCliente.get(clienteId) ?? null;
        const ultSeguimiento = ultSeguimientoByCliente.get(clienteId) ?? null;
        const diasServicio = ultServicio
          ? Math.floor((hoy.getTime() - new Date(`${ultServicio}T00:00:00`).getTime()) / 86400000)
          : null;
        const diasSeguimiento = ultSeguimiento
          ? Math.floor((hoy.getTime() - new Date(`${ultSeguimiento}T00:00:00`).getTime()) / 86400000)
          : null;
        const tieneServicioAnio = diasServicio != null && diasServicio <= 365;

        if (tieneServicioAnio) conServicioAnio++;
        if (ultSeguimiento && new Date(`${ultSeguimiento}T00:00:00`) >= inicioMes) contactadosMes++;
        if (!tieneServicioAnio && (diasSeguimiento == null || diasSeguimiento > 60)) paraContactar++;
      }

      const totalClientes = clienteIds.size;

      setMetricas({
        totalMaquinas: maquinas.length,
        pctConServicioUltimoAnio:
          totalClientes > 0 ? Math.round((conServicioAnio / totalClientes) * 100) : 0,
        pctContactadosEsteMes:
          totalClientes > 0 ? Math.round((contactadosMes / totalClientes) * 100) : 0,
        sinContacto60d: paraContactar,
      });
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    cargarMetricas();
  }, [refreshKey]);

  const handleChanged = () => setRefreshKey((k) => k + 1);

  const handleOpenCliente = (id: string) => {
    setClienteAbierto(id);
    setPanelOpen(true);
  };

  // En la pestaña Parque mostramos métricas que reflejan los filtros aplicados
  const metricasMostradas =
    tab === "parque" && parqueMetricas ? parqueMetricas : metricas;

  const cards = useMemo(
    () => [
      {
        label: "Máquinas activas",
        value: metricasMostradas.totalMaquinas.toLocaleString(),
        icon: Tractor,
        accent: "text-primary",
      },
      {
        label: "% con servicio último año",
        value: `${metricasMostradas.pctConServicioUltimoAño}%`,
        icon: CheckCircle2,
        accent: "text-emerald-600",
      },
      {
        label: "% contactados este período",
        value: `${metricasMostradas.pctContactadosEsteMes}%`,
        icon: PhoneCall,
        accent: "text-blue-600",
      },
      {
        label: "Para contactar",
        value: metricasMostradas.sinContacto60d.toLocaleString(),
        icon: AlertTriangle,
        accent: metricasMostradas.sinContacto60d > 0 ? "text-destructive" : "text-muted-foreground",
        critical: metricasMostradas.sinContacto60d > 0,
      },
    ],
    [metricasMostradas],
  );

  return (
    <div className={pageShell}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className={pageTitle}>Parque &amp; Clientes</h1>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 mb-4">
        {cards.map((c) => (
          <Card
            key={c.label}
            className={cn(
              "border",
              c.critical && "border-destructive/40 bg-destructive/5",
            )}
          >
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">
                    {c.label}
                  </div>
                  <div className={cn("mt-1 text-xl font-bold sm:text-2xl", c.accent)}>
                    {c.value}
                  </div>
                </div>
                <c.icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", c.accent)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="parque" className="text-xs sm:text-sm whitespace-normal sm:whitespace-nowrap px-2 py-1.5">Parque<span className="hidden sm:inline">&nbsp;de máquinas</span></TabsTrigger>
          <TabsTrigger value="agenda" className="text-xs sm:text-sm whitespace-normal sm:whitespace-nowrap px-2 py-1.5">Agenda<span className="hidden sm:inline">&nbsp;comercial</span></TabsTrigger>
          <TabsTrigger value="importar" className="text-xs sm:text-sm whitespace-normal sm:whitespace-nowrap px-2 py-1.5">Importar<span className="hidden sm:inline">&nbsp;datos</span></TabsTrigger>
        </TabsList>

        <TabsContent value="parque" className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <ToggleGroup
              type="single"
              value={vistaParque}
              onValueChange={(v) => v && setVistaParque(v as "clientes" | "maquinas")}
              className="border rounded-md"
            >
              <ToggleGroupItem value="clientes" className="text-xs px-3 h-8 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                <Users className="h-3.5 w-3.5 mr-1" /> Por cliente
              </ToggleGroupItem>
              <ToggleGroupItem value="maquinas" className="text-xs px-3 h-8 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                <Wrench className="h-3.5 w-3.5 mr-1" /> Por máquina
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {vistaParque === "clientes" ? (
            <ParqueTab onChanged={handleChanged} onOpenCliente={handleOpenCliente} onMetricasChange={setParqueMetricas} />
          ) : (
            <MaquinasTab onOpenCliente={handleOpenCliente} />
          )}
        </TabsContent>
        <TabsContent value="agenda" className="mt-4">
          <AgendaTab onOpenCliente={handleOpenCliente} onChanged={handleChanged} />
        </TabsContent>
        <TabsContent value="importar" className="mt-4">
          <ImportarTab onChanged={handleChanged} />
        </TabsContent>
      </Tabs>

      <ClientePanel
        clienteId={clienteAbierto}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onChanged={handleChanged}
      />
    </div>
  );
}

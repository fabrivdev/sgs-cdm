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

interface Metricas {
  totalMaquinas: number;
  pctConServicioUltimoAnio: number;
  pctContactadosEsteMes: number;
  sinContacto60d: number;
}

export default function ParqueClientes() {
  const [metricas, setMetricas] = useState<Metricas>({
    totalMaquinas: 0,
    pctConServicioUltimoAnio: 0,
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
    const { data, error } = await supabase.rpc("parque_kpis");
    if (error) {
      console.error(error);
      return;
    }
    const row = (data ?? [])[0] as
      | {
          total_maquinas: number;
          total_clientes: number;
          con_servicio_anio: number;
          contactados_mes: number;
          sin_contacto_60d: number;
        }
      | undefined;
    if (!row) return;

    const totalClientes = row.total_clientes || 0;
    const pctConServicioUltimoAnio =
      totalClientes > 0 ? Math.round((row.con_servicio_anio / totalClientes) * 100) : 0;
    const pctContactadosEsteMes =
      totalClientes > 0 ? Math.round((row.contactados_mes / totalClientes) * 100) : 0;

    setMetricas({
      totalMaquinas: row.total_maquinas || 0,
      pctConServicioUltimoAnio,
      pctContactadosEsteMes,
      sinContacto60d: row.sin_contacto_60d || 0,
    });
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
        value: `${metricasMostradas.pctConServicioUltimoAnio}%`,
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
        label: "Sin contacto +60 días",
        value: metricasMostradas.sinContacto60d.toLocaleString(),
        icon: AlertTriangle,
        accent: metricasMostradas.sinContacto60d > 0 ? "text-destructive" : "text-muted-foreground",
        critical: metricasMostradas.sinContacto60d > 0,
      },
    ],
    [metricasMostradas],
  );

  return (
    <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">Parque &amp; Clientes</h1>
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
            <ParqueTab key={`p-${refreshKey}`} onChanged={handleChanged} onOpenCliente={handleOpenCliente} onMetricasChange={setParqueMetricas} />
          ) : (
            <MaquinasTab key={`m-${refreshKey}`} onOpenCliente={handleOpenCliente} />
          )}
        </TabsContent>
        <TabsContent value="agenda" className="mt-4">
          <AgendaTab key={`a-${refreshKey}`} onOpenCliente={handleOpenCliente} onChanged={handleChanged} />
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

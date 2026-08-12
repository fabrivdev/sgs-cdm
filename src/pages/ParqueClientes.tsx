import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ParqueTab } from "@/components/parque/ParqueTab";
import { MaquinasTab, type MaquinasResumen } from "@/components/parque/MaquinasTab";
import { StockMaquinasTab, type StockMaquinasResumen } from "@/components/parque/StockMaquinasTab";
import { ClientePanel } from "@/components/parque/ClientePanel";
import { Tractor, CheckCircle2, PackageCheck, Users, Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { pageShell, pageTitle } from "@/lib/ui-classes";
import type { KpiResult } from "@/lib/contacto-utils";

const METRICAS_VACIAS: KpiResult = {
  totalMaquinas: 0,
  totalClientes: 0,
  conServicioRango: 0,
  pctConServicioRango: 0,
  conRepuestosRango: 0,
  pctConRepuestosRango: 0,
  contactadosRango: 0,
  pctContactadosRango: 0,
  sinContacto60d: 0,
};

export default function ParqueClientes() {
  const location = useLocation();
  const [clienteAbierto, setClienteAbierto] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [parqueMetricas, setParqueMetricas] = useState<KpiResult | null>(null);
  const [maquinasResumen, setMaquinasResumen] = useState<MaquinasResumen>({ totalMaquinas: 0, totalClientes: 0, totalModelos: 0 });
  const [stockResumen, setStockResumen] = useState<StockMaquinasResumen>({ total: 0, nuevas: 0, usadas: 0, marcas: 0 });
  const [refreshCounter, setRefreshCounter] = useState(0);
  const vistaParque = location.pathname === "/parque-stock" ? "stock" : location.pathname === "/parque-maquinas" ? "maquinas" : "clientes";

  const handleChanged = () => {
    setParqueMetricas(null);
    setRefreshCounter((k) => k + 1);
  };

  const handleOpenCliente = (id: string) => {
    setClienteAbierto(id);
    setPanelOpen(true);
  };

  const metricasMostradas = parqueMetricas ?? METRICAS_VACIAS;

  const cards = useMemo(
    () => vistaParque === "clientes" ? [
      {
        label: "Máquinas activas",
        value: metricasMostradas.totalMaquinas.toLocaleString(),
        icon: Tractor,
        accent: "text-primary",
      },
      {
        label: "Clientes con máquinas",
        value: metricasMostradas.totalClientes.toLocaleString(),
        icon: Users,
        accent: "text-blue-600",
      },
      {
        label: "Cobertura de servicio en período",
        value: `${metricasMostradas.pctConServicioRango}%`,
        icon: CheckCircle2,
        accent: "text-emerald-600",
      },
      {
        label: "Cobertura de repuestos en período",
        value: `${metricasMostradas.pctConRepuestosRango}%`,
        icon: PackageCheck,
        accent: "text-amber-600",
      },
    ] : vistaParque === "maquinas" ? [
      { label: "Máquinas activas", value: maquinasResumen.totalMaquinas.toLocaleString(), icon: Tractor, accent: "text-primary" },
      { label: "Clientes con máquinas", value: maquinasResumen.totalClientes.toLocaleString(), icon: Users, accent: "text-blue-600" },
      { label: "Modelos unificados", value: maquinasResumen.totalModelos.toLocaleString(), icon: CheckCircle2, accent: "text-emerald-600" },
    ] : [
      { label: "Unidades en stock", value: stockResumen.total.toLocaleString(), icon: Tractor, accent: "text-primary" },
      { label: "Máquinas nuevas", value: stockResumen.nuevas.toLocaleString(), icon: Sparkles, accent: "text-emerald-600" },
      { label: "Máquinas usadas", value: stockResumen.usadas.toLocaleString(), icon: RefreshCw, accent: "text-amber-600" },
      { label: "Marcas", value: stockResumen.marcas.toLocaleString(), icon: CheckCircle2, accent: "text-blue-600" },
    ],
    [metricasMostradas, maquinasResumen, stockResumen, vistaParque],
  );

  return (
    <div className={pageShell}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className={pageTitle}>{vistaParque === "clientes" ? "Clientes del parque" : vistaParque === "maquinas" ? "Máquinas del parque" : "Stock de máquinas"}</h1>
      </div>

      <div className={cn(
        "mb-4 grid grid-cols-1 gap-2 sm:gap-3",
        vistaParque === "clientes" || vistaParque === "stock" ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3",
      )}>
        {cards.map((c) => (
          <Card key={c.label} className="border">
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

      <div className="space-y-3">
        {vistaParque === "clientes" ? (
          <ParqueTab
            key={refreshCounter}
            onChanged={handleChanged}
            onOpenCliente={handleOpenCliente}
            onMetricasChange={setParqueMetricas}
          />
        ) : vistaParque === "maquinas" ? (
          <MaquinasTab key={refreshCounter} onOpenCliente={handleOpenCliente} onResumenChange={setMaquinasResumen} />
        ) : (
          <StockMaquinasTab key={refreshCounter} onResumenChange={setStockResumen} />
        )}
      </div>

      <ClientePanel
        clienteId={clienteAbierto}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onChanged={handleChanged}
      />
    </div>
  );
}

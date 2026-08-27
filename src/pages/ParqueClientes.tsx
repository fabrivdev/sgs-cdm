import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ParqueTab } from "@/components/parque/ParqueTab";
import { MaquinasTab, type MaquinasResumen } from "@/components/parque/MaquinasTab";
import { StockMaquinasTab, type StockMaquinasResumen } from "@/components/parque/StockMaquinasTab";
import { ClientePanel } from "@/components/parque/ClientePanel";
import { Tractor, CheckCircle2, PackageCheck, Users, LockKeyhole, CircleDollarSign, AlertTriangle } from "lucide-react";
import { pageShell } from "@/lib/ui-classes";
import { KpiItem, KpiStrip, PageHeader } from "@/components/layout/AppPrimitives";
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
  const [maquinasResumen, setMaquinasResumen] = useState<MaquinasResumen>({
    totalMaquinas: 0,
    totalClientes: 0,
    totalHorsch: 0,
    totalClaas: 0,
  });
  const [stockResumen, setStockResumen] = useState<StockMaquinasResumen>({ total: 0, disponibles: 0, reservadas: 0, vendidasPendientes: 0, conflictos: 0 });
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
      { label: "Máquinas HORSCH", value: maquinasResumen.totalHorsch.toLocaleString(), icon: Tractor, accent: "text-red-600" },
      { label: "Máquinas CLAAS", value: maquinasResumen.totalClaas.toLocaleString(), icon: Tractor, accent: "text-emerald-600" },
    ] : [
      { label: "Unidades físicas", value: stockResumen.total.toLocaleString(), icon: Tractor, accent: "text-primary" },
      { label: "Disponibles", value: stockResumen.disponibles.toLocaleString(), icon: CheckCircle2, accent: "text-emerald-600" },
      { label: "Reservadas", value: stockResumen.reservadas.toLocaleString(), icon: LockKeyhole, accent: "text-blue-600" },
      { label: stockResumen.conflictos ? "Conflictos de chasis" : "Vendidas por entregar", value: (stockResumen.conflictos || stockResumen.vendidasPendientes).toLocaleString(), icon: stockResumen.conflictos ? AlertTriangle : CircleDollarSign, accent: stockResumen.conflictos ? "text-red-600" : "text-violet-600" },
    ],
    [metricasMostradas, maquinasResumen, stockResumen, vistaParque],
  );

  return (
    <div className={pageShell}>
      <PageHeader title={vistaParque === "clientes" ? "Clientes del parque" : vistaParque === "maquinas" ? "Máquinas del parque" : "Stock de máquinas"} />

      <KpiStrip className="sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <KpiItem key={c.label} label={c.label} value={c.value} tone={c.accent.includes("amber") ? "warning" : c.accent.includes("blue") ? "info" : c.accent.includes("emerald") || c.accent.includes("primary") ? "positive" : "danger"} icon={<c.icon className="h-4 w-4" />} />
        ))}
      </KpiStrip>

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

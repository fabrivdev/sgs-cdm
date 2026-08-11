import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ParqueTab } from "@/components/parque/ParqueTab";
import { MaquinasTab } from "@/components/parque/MaquinasTab";
import { ClientePanel } from "@/components/parque/ClientePanel";
import { Tractor, CheckCircle2, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { pageShell, pageTitle } from "@/lib/ui-classes";
import type { KpiResult } from "@/lib/contacto-utils";

const METRICAS_VACIAS: KpiResult = {
  totalMaquinas: 0,
  totalClientes: 0,
  conServicioAnio: 0,
  pctConServicioUltimoAnio: 0,
  contactadosRango: 0,
  pctContactadosRango: 0,
  sinContacto60d: 0,
};

export default function ParqueClientes() {
  const [clienteAbierto, setClienteAbierto] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [vistaParque, setVistaParque] = useState<"clientes" | "maquinas">("clientes");
  const [parqueMetricas, setParqueMetricas] = useState<KpiResult | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

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
    () => [
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
        label: "Cobertura de servicio 12 meses",
        value: `${metricasMostradas.pctConServicioUltimoAnio}%`,
        icon: CheckCircle2,
        accent: "text-emerald-600",
      },
    ],
    [metricasMostradas],
  );

  return (
    <div className={pageShell}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className={pageTitle}>Parque de máquinas</h1>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
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
        <div className="flex items-center justify-between gap-2">
          <ToggleGroup
            type="single"
            value={vistaParque}
            onValueChange={(v) => v && setVistaParque(v as "clientes" | "maquinas")}
            className="rounded-md border"
          >
            <ToggleGroupItem
              value="clientes"
              className="h-8 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <Users className="mr-1 h-3.5 w-3.5" /> Por cliente
            </ToggleGroupItem>
            <ToggleGroupItem
              value="maquinas"
              className="h-8 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <Wrench className="mr-1 h-3.5 w-3.5" /> Por máquina
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {vistaParque === "clientes" ? (
          <ParqueTab
            key={refreshCounter}
            onChanged={handleChanged}
            onOpenCliente={handleOpenCliente}
            onMetricasChange={setParqueMetricas}
          />
        ) : (
          <MaquinasTab onOpenCliente={handleOpenCliente} />
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

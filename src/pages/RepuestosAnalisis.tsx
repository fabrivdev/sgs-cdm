import { StockSemaphoreSection } from "@/components/repuestos/StockSemaphoreSection";
import { PageHeader } from "@/components/layout/AppPrimitives";
import { useAuth } from "@/hooks/useAuth";
import { pageShellWide } from "@/lib/ui-classes";

export default function RepuestosAnalisis() {
  const { can } = useAuth();
  return <div className={pageShellWide}>
    <PageHeader title="Análisis de repuestos" meta="Semáforo histórico por última venta confirmada" />
    <StockSemaphoreSection canExport={can("datos:exportar")} />
  </div>;
}

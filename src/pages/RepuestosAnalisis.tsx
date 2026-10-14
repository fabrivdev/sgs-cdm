import { StockSemaphoreSection } from "@/components/repuestos/StockSemaphoreSection";
import { useAuth } from "@/hooks/useAuth";
import { pageShellWide } from "@/lib/ui-classes";

export default function RepuestosAnalisis() {
  const { can } = useAuth();
  return <div className={pageShellWide}>
    <StockSemaphoreSection canExport={can("datos:exportar")} />
  </div>;
}

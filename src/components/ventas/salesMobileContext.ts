import { createContext, useContext, useState } from "react";

export type MobileView = "periodos" | "resumen" | "detalle";
export const SalesMobileContext = createContext({ active: false, view: "periodos" as MobileView, setView: (_view: MobileView) => {} });
export const useSalesMobile = () => useContext(SalesMobileContext);

export function useSalesExplorerView<T extends string>(initial: T, detail: T) {
  const mobile = useSalesMobile();
  const [savedView, setView] = useState<T>(initial);
  const view = mobile.active ? mobile.view === "detalle" ? detail : savedView === detail ? initial : savedView : savedView;
  return [view, setView] as const;
}

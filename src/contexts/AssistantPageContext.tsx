import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

export type AssistantPageFilters = Record<string, string | number | boolean | string[] | null | undefined>;

type AssistantPageContextValue = {
  context: { module: string; path: string; filters: AssistantPageFilters };
  setPageFilters: (filters: AssistantPageFilters) => void;
  clearPageFilters: () => void;
};

const Context = createContext<AssistantPageContextValue | null>(null);

const moduleByPath: Record<string, string> = {
  "/": "Planificador",
  "/trabajos": "Trabajos",
  "/calendario": "Calendario",
  "/servicios/ordenes": "Órdenes de servicio",
  "/servicios/ventas": "Ventas de Servicios",
  "/parque-ventas": "Ventas de Máquinas",
  "/repuestos/ventas": "Ventas de Repuestos",
  "/parque-clientes": "Clientes del parque",
  "/parque-maquinas": "Maquinas del parque",
  "/parque-stock": "Stock de maquinas",
  "/parque-stock-proyectado": "Stock proyectado de maquinas nuevas",
  "/repuestos": "Catálogo y stock de repuestos",
  "/repuestos/compras": "Compras de repuestos",
  "/repuestos/sugerencias": "Sugerencia de compra de repuestos",
  "/admin": "Administracion",
};

export function AssistantPageProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [filters, setFilters] = useState<AssistantPageFilters>({});

  const setPageFilters = useCallback((next: AssistantPageFilters) => setFilters(next), []);
  const clearPageFilters = useCallback(() => setFilters({}), []);
  const context = useMemo(() => {
    const module = moduleByPath[location.pathname] ?? "Aplicacion";
    return { module, path: location.pathname, filters };
  }, [filters, location.pathname]);

  return <Context.Provider value={{ context, setPageFilters, clearPageFilters }}>{children}</Context.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAssistantPageContext() {
  const value = useContext(Context);
  if (!value) throw new Error("useAssistantPageContext debe usarse dentro de AssistantPageProvider");
  return value;
}

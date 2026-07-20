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
  "/dashboard": "Dashboard",
  "/historial": "Historial",
  "/parque-clientes": "Parque de maquinas",
  "/agenda": "Agenda comercial",
  "/admin": "Administracion",
};

function dashboardStoredFilters() {
  try {
    const saved = JSON.parse(window.localStorage.getItem("sgs-cdm.dashboard.filters.v1") ?? "{}");
    return {
      fecha_desde: saved.dateFrom,
      fecha_hasta: saved.dateTo,
      agrupacion: saved.periodMode,
    };
  } catch {
    return {};
  }
}

export function AssistantPageProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [filters, setFilters] = useState<AssistantPageFilters>({});

  const setPageFilters = useCallback((next: AssistantPageFilters) => setFilters(next), []);
  const clearPageFilters = useCallback(() => setFilters({}), []);
  const context = useMemo(() => {
    const module = moduleByPath[location.pathname] ?? "Aplicacion";
    const inferred = location.pathname === "/dashboard" ? dashboardStoredFilters() : {};
    return { module, path: location.pathname, filters: { ...inferred, ...filters } };
  }, [filters, location.pathname]);

  return <Context.Provider value={{ context, setPageFilters, clearPageFilters }}>{children}</Context.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAssistantPageContext() {
  const value = useContext(Context);
  if (!value) throw new Error("useAssistantPageContext debe usarse dentro de AssistantPageProvider");
  return value;
}

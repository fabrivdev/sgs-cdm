import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { SectionActionsMenu, type SectionAction } from "@/components/exports/SectionActionsMenu";
import { TableExportButton, type TableExportOption } from "@/components/exports/TableExportButton";

type Registry = { options: SectionAction[]; register: (option: SectionAction) => () => void };
const SalesExports = createContext<Registry | null>(null);

export function SalesSectionExportsProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<SectionAction[]>([]);
  const register = useCallback((option: SectionAction) => {
    setOptions(current => [...current.filter(item => item.id !== option.id), option]);
    return () => setOptions(current => current.filter(item => item !== option));
  }, []);
  return <SalesExports.Provider value={{ options, register }}>{children}</SalesExports.Provider>;
}

// Register only mounted tables. Always read the latest sorted, filtered snapshot;
// changing tabs removes old actions without fetching other reports.
// eslint-disable-next-line react-refresh/only-export-components -- private registry shared by this provider and its consumers.
export function useSalesSectionExport(option: SectionAction, allowed: boolean) {
  const register = useContext(SalesExports)?.register;
  const latest = useRef(option.onSelect);
  latest.current = option.onSelect;
  const { id, label, disabled } = option;
  useEffect(() => {
    if (!register || !allowed) return;
    return register({ id, label, disabled, onSelect: () => latest.current() });
  }, [register, allowed, id, label, disabled]);
}

export function SalesSectionExportMenu() {
  const registry = useContext(SalesExports);
  return <SectionActionsMenu options={registry?.options ?? []} />;
}

export function SectionTableExportMenu({ options }: { options: TableExportOption[] }) {
  const registry = useContext(SalesExports);
  return <TableExportButton options={options} extraActions={registry?.options ?? []} />;
}

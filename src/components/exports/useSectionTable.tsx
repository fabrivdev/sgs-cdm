import { useAuth } from "@/hooks/useAuth";
import { SalesSortButton } from "@/components/ventas/SalesTableControls";
import { sortSalesRows, useSalesTableSort, type SalesColumn, type SalesSort } from "@/components/ventas/salesTableInteraction";
import { useSalesSectionExport } from "@/components/ventas/SalesSectionExports";

/** Complete, filtered results only. Paged consumers order on the server. */
export function useSectionTable<T>({ rows, columns, initialSort, title, fileName, sheetName = title, disabled = false, footer, sortOverride, register = true }: {
  rows: readonly T[]; columns: readonly SalesColumn<T>[]; initialSort: SalesSort;
  title: string; fileName: string; sheetName?: string; disabled?: boolean; footer?: T; sortOverride?: SalesSort; register?: boolean;
}) {
  const { can } = useAuth();
  const local = useSalesTableSort(rows, columns, initialSort);
  const sort = sortOverride ?? local.sort;
  const ordered = sortOverride ? sortSalesRows(rows, columns, sortOverride) : local.ordered;
  const toggleSort = local.toggleSort;
  const action = { id: fileName, label: `Exportar ${title}`, disabled: disabled || !ordered.length,
    onSelect: async () => {
      const snapshot = footer ? [...ordered, footer] : [...ordered];
      const { exportSalesTable } = await import("@/components/ventas/salesTableExport");
      exportSalesTable({ rows: snapshot, columns, fileName, sheetName });
    } };
  useSalesSectionExport(action, register && can("datos:exportar"));
  const heading = (key: string) => {
    const column = columns.find(item => item.key === key);
    if (!column) throw new Error(`Columna sin definición: ${key}`);
    return <SalesSortButton label={column.label} kind={column.kind} align={column.align} active={sort.key === key} direction={sort.direction} onClick={() => toggleSort(key)} />;
  };
  return { ordered, sort, toggleSort, heading, action: can("datos:exportar") ? action : null };
}

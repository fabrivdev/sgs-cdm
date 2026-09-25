import type { ServiciosDashboardData } from "@/components/dashboard/types";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { MobileRecord } from "@/components/lists/MobileRecord";
import { OperationsPanel } from "./OperationsPresentation";
import { useIsMobile } from "@/hooks/use-mobile";

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
/** Presentational, dataset-driven summaries: usable later outside the Services route. */
export function OperationalEvolution({ rows, onPeriod, worked = false, incomplete = false }: {
  rows: ServiciosDashboardData["evolucion"];
  onPeriod: (from: string, to: string) => void;
  worked?: boolean; incomplete?: boolean;
}) {
  const compact = useIsMobile(1024);
  type Row = typeof rows[number];
  const columns: CompactListColumn<Row>[] = [
    { key: "periodo", label: "Período", kind: "date", width: "w-[25%]", value: r => r.dateFrom,
      render: r => <button className="min-h-11 text-left hover:text-primary sm:min-h-0" onClick={() => onPeriod(r.dateFrom, r.dateTo)}>{r.label}</button> },
    { key: "cerradas", label: "Cerradas", kind: "number", align: "center", width: "w-[15%]", value: r => r.cerradas },
    { key: "abiertas", label: "Abiertas", kind: "number", align: "center", width: "w-[15%]", value: r => r.abiertas },
    { key: "otras", label: "Anuladas", kind: "number", align: "center", width: "w-[15%]", value: r => r.otras },
    { key: "horas", label: "Horas OS", kind: "number", align: "center", width: "w-[15%]", value: r => r.horasOS, render: r => number.format(r.horasOS) },
    { key: "persona", label: "Horas-persona", kind: "number", align: "center", width: "w-[15%]", value: r => r.horasPersona, render: r => number.format(r.horasPersona) },
    { key: "meta", label: "Meta disponible", kind: "number", value: r => r.horasDisponibles || null, width: "w-auto" },
    { key: "porcentaje", label: "Productividad", kind: "number", value: r => !incomplete && r.horasDisponibles > 0 ? r.utilizacion / 100 : null, excelFormat: "0.0%", width: "w-auto" },
  ];
  const exportColumns = worked ? columns.filter(column => !["cerradas", "abiertas", "otras"].includes(column.key)) : columns;
  const table = useSectionTable({ rows, columns: exportColumns, initialSort: { key: "periodo", direction: "asc" }, title: worked ? "Horas por período" : "Evolución de OS", fileName: worked ? "horas-por-periodo.xlsx" : "evolucion-os.xlsx", disabled: incomplete });
  const visible = worked ? [columns[0], columns[4], columns[5], { ...columns[6], width: "w-[20%]", align: "center" as const, render: (r: Row) => r.horasDisponibles > 0 ? number.format(r.horasDisponibles) : "—" },
    { ...columns[7], width: "w-[25%]", align: "right" as const, render: (r: Row) => !incomplete && r.horasDisponibles > 0 ? `${number.format(r.utilizacion)}%` : "—" }] : columns.slice(0, 6);
  return <OperationsPanel title="Por período"><CompactListTable rows={table.ordered} columns={visible.map(column => compact && column.key === "persona" ? { ...column, label: "Horas-pers." } : column)} mobileColumns={[
    { ...columns[0], width: "w-[68%]", render: r => <button className="min-h-11 w-full text-left" onClick={() => onPeriod(r.dateFrom, r.dateTo)}><MobileRecord primary={r.label} secondary={worked ? `${number.format(r.horasOS)} h OS` : `${r.cerradas} cerradas · ${r.abiertas} abiertas · ${r.otras} anuladas`} context={worked ? undefined : `${number.format(r.horasOS)} h OS`} /></button> },
    { ...columns[5], label: "Horas", width: "w-[32%]" },
  ]} id={r => r.key} label={worked ? "Horas por período" : "Evolución de OS"} sort={table.sort} onSort={table.toggleSort} status={!rows.length ? "Sin órdenes en el período." : undefined} /></OperationsPanel>;
}

export function OperationalDistribution({ data }: { data: ServiciosDashboardData }) {
  const rows = [
    ...data.estados.map(r => ({ group: "Estado", label: r.label, total: r.total })),
    ...data.mixTiempo.map(r => ({ group: "Tipo de tiempo", label: r.label, total: r.total })),
    ...data.sucursales.map(r => ({ group: "Sucursal", label: r.sucursal, total: r.total })),
  ];
  const columns: CompactListColumn<typeof rows[number]>[] = [
    { key: "grupo", label: "Agrupación", kind: "text", width: "w-[30%]", value: r => r.group },
    { key: "detalle", label: "Detalle", kind: "text", width: "w-[50%]", value: r => r.label },
    { key: "os", label: "OS", kind: "number", align: "center", width: "w-[20%]", value: r => r.total },
  ];
  const table = useSectionTable({ rows, columns, initialSort: { key: "grupo", direction: "asc" }, title: "Distribución de OS", fileName: "distribucion-os.xlsx" });
  return <OperationsPanel title="Estado, tipo y sucursal"><CompactListTable rows={table.ordered} columns={columns} mobileColumns={[
    { ...columns[1], width: "w-[75%]", render: r => <MobileRecord primary={r.label} secondary={r.group} /> },
    { ...columns[2], width: "w-[25%]" },
  ]} id={r => `${r.group}:${r.label}`} label="Distribución de OS" heading={table.heading} sort={table.sort} status={!rows.length ? "Sin órdenes." : undefined} /></OperationsPanel>;
}

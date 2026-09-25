import type { OperationsModel } from "./useOperationsModel";
import { OperationsPanel } from "./OperationsPresentation";
import { CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { MobileRecord } from "@/components/lists/MobileRecord";

export function ComplianceOverview({ model }: { model: OperationsModel }) {
  type Row = OperationsModel["cumplimientoAgenda"][number];
  const columns: CompactListColumn<Row>[] = [
    { key: "periodo", label: "Período", width: "w-[28%]", kind: "text", value: row => row.key, render: row => row.label },
    { key: "programadas", label: "Agendadas", width: "w-[18%]", kind: "number", align: "center", value: row => row.programadas },
    { key: "realizadas", label: "Realizadas", width: "w-[18%]", kind: "number", align: "center", value: row => row.realizadas },
    { key: "pendientes", label: "Pendientes", width: "w-[18%]", kind: "number", align: "center", value: row => row.pendientes },
    { key: "porcentaje", label: "% cumpl.", width: "w-[18%]", kind: "number", align: "right", value: row => row.programadas ? row.porcentaje / 100 : null, excelFormat: "0%", render: row => row.programadas ? `${row.porcentaje}%` : "—" },
    { key: "noRealizadas", label: "No realizadas", width: "w-auto", kind: "number", align: "center", value: row => row.noRealizadas },
    { key: "estado", label: "Estado del período", width: "w-auto", kind: "text", value: row => row.estadoPeriodo },
  ];
  const table = useSectionTable({ rows: model.cumplimientoAgenda, columns, initialSort: { key: "periodo", direction: "asc" }, title: "Cumplimiento por período", fileName: "cumplimiento-periodos.xlsx" });
  const insights = model.cumplimientoAgendaInsights;
  return <OperationsPanel title="Cumplimiento por período">
    <CompactListTable rows={table.ordered} columns={columns.slice(0, 5)} mobileColumns={[
      { ...columns[0], width: "w-[70%]", render: row => <MobileRecord primary={row.label} secondary={`${row.realizadas} de ${row.programadas} realizadas`} context={`${row.pendientes} pendientes · ${row.noRealizadas} no realizadas`} /> },
      { ...columns[4], width: "w-[30%]" },
    ]} label="Cumplimiento por período" id={row => row.key} heading={table.heading} sort={table.sort} status={!table.ordered.length ? "Sin agenda para estos filtros." : undefined} />
    <dl className="grid grid-cols-3 divide-x border-t py-3 text-[11px]">
      <div className="px-3"><dt className="text-muted-foreground">Efectividad</dt><dd className="mt-1 text-[16px] font-semibold tabular-nums">{insights.efectividad == null ? "—" : `${insights.efectividad}%`}</dd></div>
      <div className="px-3" title={insights.tendencia ? `${insights.tendencia.desde} a ${insights.tendencia.hasta}` : undefined}><dt className="text-muted-foreground">Tendencia</dt><dd className="mt-1 text-[16px] font-semibold tabular-nums">{insights.tendencia ? `${insights.tendencia.delta > 0 ? "+" : ""}${insights.tendencia.delta} pp` : "—"}</dd></div>
      <div className="min-w-0 px-3" title={insights.mayorDesvio ? `${insights.mayorDesvio.porcentaje}% no realizadas` : undefined}><dt className="text-muted-foreground">Mayor desvío</dt><dd className="mt-1 truncate font-semibold">{insights.mayorDesvio?.label ?? "—"}</dd></div>
    </dl>
  </OperationsPanel>;
}

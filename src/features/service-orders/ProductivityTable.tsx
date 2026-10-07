import type { ReactNode } from "react";
import type { ProductivityTechnicianRow } from "./workedProductivity";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { cn } from "@/lib/utils";
import { OperationsPanel } from "./OperationsPresentation";
import { ProductivityProgress } from "./ProductivityProgress";
import { matchesTechnicianStatus, type TechnicianStatus } from "./productivityStatus";
import type { ProductivityPeriod } from "./productivityPeriod";

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const statuses = [["todos", "Todos"], ["activos", "Activos"], ["inactivos", "Inactivos"]] as const;
export function ProductivityTable({ rows, onSelect, status, onStatusChange, period, issuesAction }: { rows: ProductivityTechnicianRow[]; onSelect: (name: string) => void; status: TechnicianStatus; onStatusChange: (status: TechnicianStatus) => void; period?: ProductivityPeriod; issuesAction?: ReactNode }) {
  const compact = useIsMobile(1024);
  const phone = useIsMobile(640);
  const technicianState = (r: ProductivityTechnicianRow) => matchesTechnicianStatus(r, "inactivos") ? "Inactivo" : undefined;
  const progress = (r: ProductivityTechnicianRow) => <ProductivityProgress hours={r.horas} target={r.horasDisponibles} label={`Meta de ${r.tecnico}`} partial={r.incomplete} />;
  const columns: CompactListColumn<ProductivityTechnicianRow>[] = [
    { key: "tecnico", label: "Técnico", kind: "text", width: "w-[36%]", value: r => r.tecnico,
      render: r => <button type="button" className="flex min-h-11 max-w-full items-center gap-2 text-left hover:text-primary focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0" onClick={() => onSelect(r.tecnico)}><span className="truncate">{r.tecnico}</span>{technicianState(r) && <span className="shrink-0 text-[11px] text-muted-foreground">{technicianState(r)}</span>}{r.incomplete && <span className="shrink-0 text-[11px] text-amber-700">Parcial</span>}</button> },
    { key: "os", label: "OS", kind: "number", align: "center", width: "w-[8%]", value: r => r.totalOS },
    { key: "horas", label: "Horas-persona", kind: "number", align: "center", width: "w-[17%]", value: r => r.horas, render: r => number.format(r.horas) },
    { key: "meta", label: "Meta disponible", kind: "number", align: "center", width: "w-[17%]", value: r => r.horasDisponibles > 0 ? r.horasDisponibles : null, render: r => r.horasDisponibles > 0 ? number.format(r.horasDisponibles) : "—" },
    { key: "porcentaje", label: "Productividad", kind: "number", align: "right", width: "w-[22%]", value: r => r.horasDisponibles > 0 ? r.productividad / 100 : null, excelFormat: "0.0%", render: progress },
    { key: "activo", label: "Activo", kind: "text", width: "w-auto", value: r => matchesTechnicianStatus(r, "activos") ? "Sí" : "No" },
    { key: "cerradas", label: "Cerradas", kind: "number", width: "w-auto", value: r => r.cerradas },
    { key: "abiertas", label: "Abiertas", kind: "number", width: "w-auto", value: r => r.abiertas },
    { key: "otras", label: "Anuladas / canceladas", kind: "number", width: "w-auto", value: r => r.otras },
    { key: "detalle", label: "Horas con detalle individual", kind: "number", width: "w-auto", value: r => r.horasDesdeDetalle },
    { key: "heredadas", label: "Horas con participación heredada", kind: "number", width: "w-auto", value: r => r.horasDesdeOS },
    { key: "calculo", label: "Estado del cálculo", kind: "text", width: "w-auto", value: r => r.incomplete ? "Parcial · solo horas válidas" : "Completo" },
    { key: "desde_calculo", label: "Desde cálculo", kind: "date", width: "w-auto", value: () => period?.from ?? null },
    { key: "hasta_calculo", label: "Hasta cálculo", kind: "date", width: "w-auto", value: () => period?.to ?? null },
    { key: "desde_solicitado", label: "Desde solicitado", kind: "date", width: "w-auto", value: () => period?.requestedFrom ?? null },
    { key: "hasta_solicitado", label: "Hasta solicitado", kind: "date", width: "w-auto", value: () => period?.requestedTo ?? null },
  ];
  const table = useSectionTable({ rows, columns, initialSort: { key: "horas", direction: "desc" }, title: "Productividad por técnico", fileName: "productividad-tecnicos.xlsx" });
  const hasGoal = rows.some(row => row.horasDisponibles > 0 || row.incomplete);
  const visible = (hasGoal ? columns.slice(0, 5) : [{ ...columns[0], width: "w-[60%]" }, { ...columns[1], width: "w-[20%]" }, { ...columns[2], width: "w-[20%]" }])
    .map(column => compact && ["horas", "meta"].includes(column.key) ? { ...column, label: column.key === "horas" ? "Horas" : "Meta (h)" } : column);
  const mobile: CompactListColumn<ProductivityTechnicianRow>[] = [
    { ...columns[0], width: "w-full", label: "Técnico / Productividad", render: r => {
      const context = `${r.totalOS} OS${technicianState(r) ? ` · ${technicianState(r)}` : ""}${r.incomplete ? " · Parcial" : ""}`;
      return <ProductivityProgress hours={r.horas} target={r.horasDisponibles} label={`Meta de ${r.tecnico}`} partial={r.incomplete}
        header={<button type="button" aria-label={`${r.tecnico} · ${context}`} title={`${r.tecnico} · ${context}`} className="block min-h-11 max-w-full truncate text-left hover:text-primary focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSelect(r.tecnico)}>{r.tecnico}</button>} />;
    } },
  ];
  return <OperationsPanel className="productivity-panel" title={phone ? undefined : "Por técnico"} actions={!phone ?
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 max-sm:flex-nowrap max-sm:gap-1.5">
      <div role="group" aria-label="Estado de técnicos" className="inline-flex min-w-0 overflow-hidden rounded-md border text-[11px] max-sm:flex-1 sm:shrink-0">
        {statuses.map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => onStatusChange(value)}
          className={cn("h-8 px-3 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring max-sm:min-h-11 max-sm:min-w-0 max-sm:flex-1 max-sm:px-2 max-sm:text-[11px]", status === value && "bg-primary text-primary-foreground hover:bg-primary")}>{label}</button>)}
      </div>
      {issuesAction}
    </div>
    : undefined}>
    <CompactListTable rows={table.ordered} columns={visible} mobileColumns={mobile} id={r => r.tecnico} label="Productividad por técnico" sort={table.sort} onSort={table.toggleSort} status={!rows.length ? "Sin técnicos para estos filtros." : undefined} />
  </OperationsPanel>;
}

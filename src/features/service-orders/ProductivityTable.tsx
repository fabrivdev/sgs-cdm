import type { ServicioTecnicoRow } from "@/components/dashboard/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { MobileRecord } from "@/components/lists/MobileRecord";
import { cn } from "@/lib/utils";
import { OperationsPanel } from "./OperationsPresentation";
import { ProductivityProgress } from "./ProductivityProgress";
import type { TechnicianStatus } from "./productivityStatus";

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const statuses = [["todos", "Todos"], ["activos", "Activos"], ["inactivos", "Inactivos"], ["sin-ficha", "Sin ficha"]] as const;
export function ProductivityTable({ rows, onSelect, status, onStatusChange, incomplete = false }: { rows: ServicioTecnicoRow[]; onSelect: (name: string) => void; status: TechnicianStatus; onStatusChange: (status: TechnicianStatus) => void; incomplete?: boolean }) {
  const compact = useIsMobile(1024);
  const phone = useIsMobile(640);
  const technicianState = (r: ServicioTecnicoRow) => !r.profileId ? "Sin ficha" : !r.activo ? "Inactivo" : undefined;
  const columns: CompactListColumn<ServicioTecnicoRow>[] = [
    { key: "tecnico", label: "Técnico", kind: "text", width: "w-[36%]", value: r => r.tecnico,
      render: r => <button type="button" className="min-h-11 max-w-full truncate text-left hover:text-primary focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0" onClick={() => onSelect(r.tecnico)}>{r.tecnico}{technicianState(r) && <span className="ml-2 text-[11px] text-muted-foreground">{technicianState(r)}</span>}</button> },
    { key: "os", label: "OS", kind: "number", align: "center", width: "w-[8%]", value: r => r.totalOS },
    { key: "horas", label: "Horas-persona", kind: "number", align: "center", width: "w-[17%]", value: r => r.horas, render: r => number.format(r.horas) },
    { key: "meta", label: "Meta disponible", kind: "number", align: "center", width: "w-[17%]", value: r => r.horasDisponibles > 0 ? r.horasDisponibles : null, render: r => r.horasDisponibles > 0 ? number.format(r.horasDisponibles) : "—" },
    { key: "porcentaje", label: "Productividad", kind: "number", align: "right", width: "w-[22%]", value: r => !incomplete && r.horasDisponibles > 0 ? r.productividad / 100 : null, excelFormat: "0.0%", render: r => incomplete ? "—" : <ProductivityProgress hours={r.horas} target={r.horasDisponibles} label={`Meta de ${r.tecnico}`} /> },
    { key: "activo", label: "Activo", kind: "text", width: "w-auto", value: r => !r.profileId ? "Sin ficha" : r.activo ? "Sí" : "No" },
    { key: "cerradas", label: "Cerradas", kind: "number", width: "w-auto", value: r => r.cerradas },
    { key: "abiertas", label: "Abiertas", kind: "number", width: "w-auto", value: r => r.abiertas },
    { key: "otras", label: "Anuladas / canceladas", kind: "number", width: "w-auto", value: r => r.otras },
    { key: "detalle", label: "Horas con detalle individual", kind: "number", width: "w-auto", value: r => r.horasDesdeDetalle },
    { key: "heredadas", label: "Horas con participación heredada", kind: "number", width: "w-auto", value: r => r.horasDesdeOS },
  ];
  const table = useSectionTable({ rows, columns, initialSort: { key: "horas", direction: "desc" }, title: "Productividad por técnico", fileName: "productividad-tecnicos.xlsx", disabled: incomplete });
  const hasGoal = rows.some(row => row.horasDisponibles > 0);
  const visible = (hasGoal ? columns.slice(0, 5) : [{ ...columns[0], width: "w-[60%]" }, { ...columns[1], width: "w-[20%]" }, { ...columns[2], width: "w-[20%]" }])
    .map(column => compact && ["horas", "meta"].includes(column.key) ? { ...column, label: column.key === "horas" ? "Horas" : "Meta (h)" } : column);
  const mobile: CompactListColumn<ServicioTecnicoRow>[] = [
    { ...columns[0], width: "w-[60%]", render: r => <button type="button" className="min-h-11 w-full text-left" onClick={() => onSelect(r.tecnico)}><MobileRecord primary={r.tecnico} secondary={`${r.totalOS} OS${technicianState(r) ? ` · ${technicianState(r)}` : ""}`} /></button> },
    { ...columns[2], label: "Horas / meta", align: "right", width: "w-[40%]", render: r => <div className="space-y-1.5 text-right text-[12px]"><span>{number.format(r.horas)}<span className="text-muted-foreground"> / {r.horasDisponibles > 0 ? number.format(r.horasDisponibles) : "—"} h</span></span>{incomplete ? "—" : <ProductivityProgress hours={r.horas} target={r.horasDisponibles} label={`Meta de ${r.tecnico}`} />}</div> },
  ];
  return <OperationsPanel title={phone ? undefined : "Por técnico"} actions={
    <div role="group" aria-label="Estado de técnicos" className="inline-flex min-w-0 overflow-hidden rounded-md border text-[11px] max-sm:w-full sm:shrink-0">
      {statuses.map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => onStatusChange(value)}
        className={cn("h-8 px-3 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring max-sm:min-h-11 max-sm:min-w-0 max-sm:flex-1 max-sm:px-1 max-sm:text-[12px]", status === value && "bg-primary text-primary-foreground hover:bg-primary")}>{label}</button>)}
    </div>
  }>
    <CompactListTable rows={table.ordered} columns={visible} mobileColumns={mobile} id={r => r.tecnico} label="Productividad por técnico" sort={table.sort} onSort={table.toggleSort} status={!rows.length ? "Sin técnicos para estos filtros." : undefined} />
  </OperationsPanel>;
}

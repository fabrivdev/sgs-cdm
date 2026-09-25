import { useState } from "react";
import type { ServicioTecnicoRow } from "@/components/dashboard/types";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { MobileRecord } from "@/components/lists/MobileRecord";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OperationsPanel } from "./OperationsPresentation";

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
export function ProductivityTable({ rows, onSelect }: { rows: ServicioTecnicoRow[]; onSelect: (name: string) => void }) {
  const [status, setStatus] = useState("todos");
  const filtered = rows.filter(r => status === "todos" || r.activo === (status === "activos"));
  const columns: CompactListColumn<ServicioTecnicoRow>[] = [
    { key: "tecnico", label: "Técnico", kind: "text", width: "w-[36%]", value: r => r.tecnico,
      render: r => <button type="button" className="min-h-11 max-w-full truncate text-left hover:text-primary focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0" onClick={() => onSelect(r.tecnico)}>{r.tecnico}{!r.activo && <span className="ml-2 text-[11px] text-muted-foreground">Inactivo</span>}</button> },
    { key: "os", label: "OS", kind: "number", align: "center", width: "w-[12%]", value: r => r.totalOS },
    { key: "horas", label: "Horas-persona", kind: "number", align: "center", width: "w-[18%]", value: r => r.horas, render: r => number.format(r.horas) },
    { key: "meta", label: "Meta disponible", kind: "number", align: "center", width: "w-[18%]", value: r => r.horasDisponibles > 0 ? r.horasDisponibles : null, render: r => r.horasDisponibles > 0 ? number.format(r.horasDisponibles) : "—" },
    { key: "porcentaje", label: "% meta", kind: "number", align: "right", width: "w-[16%]", value: r => r.horasDisponibles > 0 ? r.productividad / 100 : null, excelFormat: "0.0%", render: r => r.horasDisponibles > 0 ? `${number.format(r.productividad)}%` : "—" },
    { key: "activo", label: "Activo", kind: "text", width: "w-auto", value: r => r.activo ? "Sí" : "No" },
    { key: "cerradas", label: "Cerradas", kind: "number", width: "w-auto", value: r => r.cerradas },
    { key: "abiertas", label: "Abiertas", kind: "number", width: "w-auto", value: r => r.abiertas },
    { key: "otras", label: "Anuladas / canceladas", kind: "number", width: "w-auto", value: r => r.otras },
    { key: "detalle", label: "Horas con detalle individual", kind: "number", width: "w-auto", value: r => r.horasDesdeDetalle },
    { key: "heredadas", label: "Horas heredadas de OS", kind: "number", width: "w-auto", value: r => r.horasDesdeOS },
    { key: "km", label: "Km atribuidos", kind: "number", width: "w-auto", value: r => r.km },
    { key: "valor", label: "Valor OS atribuido", kind: "number", width: "w-auto", value: r => r.valorOS },
  ];
  const table = useSectionTable({ rows: filtered, columns, initialSort: { key: "horas", direction: "desc" }, title: "Productividad por técnico", fileName: "productividad-tecnicos.xlsx" });
  const hasGoal = filtered.some(row => row.horasDisponibles > 0);
  const mobile: CompactListColumn<ServicioTecnicoRow>[] = [
    { ...columns[0], width: "w-[68%]", render: r => <button type="button" className="min-h-11 w-full text-left" onClick={() => onSelect(r.tecnico)}><MobileRecord primary={r.tecnico} secondary={`${r.totalOS} OS`} context={!r.activo ? "Inactivo" : undefined} /></button> },
    { ...columns[2], label: "Horas", width: "w-[32%]" },
  ];
  return <OperationsPanel title="Por técnico" actions={<Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Estado de técnicos" className="h-8 w-28 text-[12px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="activos">Activos</SelectItem><SelectItem value="inactivos">Inactivos</SelectItem></SelectContent></Select>}>
    <CompactListTable rows={table.ordered} columns={hasGoal ? columns.slice(0, 5) : [{ ...columns[0], width: "w-[60%]" }, { ...columns[1], width: "w-[20%]" }, { ...columns[2], width: "w-[20%]" }]} mobileColumns={mobile} id={r => r.tecnico} label="Productividad por técnico" heading={table.heading} sort={table.sort} onSort={table.toggleSort} status={!filtered.length ? "Sin técnicos para estos filtros." : undefined} />
  </OperationsPanel>;
}

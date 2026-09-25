import { useState } from "react";
import type { ServicioTecnicoRow } from "@/components/dashboard/types";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { MobileRecord } from "@/components/lists/MobileRecord";

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
export function ProductivityTable({ rows, onSelect }: { rows: ServicioTecnicoRow[]; onSelect: (name: string) => void }) {
  const [status, setStatus] = useState("todos");
  const filtered = rows.filter(r => status === "todos" || r.activo === (status === "activos"));
  const columns: CompactListColumn<ServicioTecnicoRow>[] = [
    { key: "tecnico", label: "Técnico", kind: "text", width: "w-[36%]", value: r => r.tecnico,
      render: r => <button type="button" className="min-h-11 text-left font-medium text-primary" onClick={() => onSelect(r.tecnico)}>{r.tecnico}{!r.activo && <span className="ml-2 text-[11px] text-muted-foreground">Inactivo</span>}</button> },
    { key: "os", label: "OS", kind: "number", align: "right", width: "w-[12%]", value: r => r.totalOS },
    { key: "horas", label: "Horas-persona", kind: "number", align: "right", width: "w-[18%]", value: r => r.horas, render: r => number.format(r.horas) },
    { key: "meta", label: "Meta disponible", kind: "number", align: "right", width: "w-[18%]", value: r => r.horasDisponibles > 0 ? r.horasDisponibles : null, render: r => r.horasDisponibles > 0 ? number.format(r.horasDisponibles) : "—" },
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
  const mobile: CompactListColumn<ServicioTecnicoRow>[] = [
    { ...columns[0], width: "w-[62%]", render: r => <button type="button" className="min-h-11 w-full text-left" onClick={() => onSelect(r.tecnico)}><MobileRecord primary={r.tecnico} secondary={`${r.totalOS} OS · ${number.format(r.horas)} horas-persona`} context={!r.activo ? "Inactivo" : undefined} /></button> },
    { ...columns[4], width: "w-[38%]" },
  ];
  return <section className="min-w-0 space-y-2"><div className="flex items-center justify-between gap-2"><h2 className="text-[13px] font-semibold">Por técnico</h2><select aria-label="Estado de técnicos" value={status} onChange={e => setStatus(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-[12px]"><option value="todos">Todos</option><option value="activos">Activos</option><option value="inactivos">Inactivos</option></select></div>
    <CompactListTable rows={table.ordered} columns={columns.slice(0, 5)} mobileColumns={mobile} id={r => r.tecnico} label="Productividad por técnico" heading={table.heading} sort={table.sort} status={!filtered.length ? "Sin técnicos para estos filtros." : undefined} />
  </section>;
}

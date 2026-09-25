import { CalendarDays } from "lucide-react";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { MobileRecord } from "@/components/lists/MobileRecord";
import { DetailSection } from "@/components/maquinaria/MachineDetailPrimitives";
import { Button } from "@/components/ui/button";
import { useWorkLog } from "./useWorkLog";
import { workedDays } from "./workLog";
import { operationsDate } from "./format";
import type { WorkedRecord } from "./workedProductivity";

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const time = (value: string | null) => (value?.length === 8 ? value.replace(/:00$/, "") : value) || "—";
type DetailRow = Pick<WorkedRecord, "key" | "os" | "technician" | "type" | "inherited"> & {
  date: string | null; start: string | null; end: string | null; hours: number | null;
};
export function WorkLogTable({ rows, showOS = false }: { rows: DetailRow[]; showOS?: boolean }) {
  const columns: CompactListColumn<DetailRow>[] = [
    { key: "fecha", label: "Fecha", kind: "date", width: "w-[24%]", value: r => r.date, render: r => operationsDate(r.date) },
    { key: "horario", label: "Horario", kind: "text", width: "w-[28%]", value: r => `${time(r.start)}–${time(r.end)}` },
    { key: "tecnico", label: showOS ? "OS" : "Técnico", kind: "text", width: "w-[30%]", value: r => showOS ? r.os : r.technician,
      title: r => `${r.technician} · ${r.type}${r.inherited ? " · Participación heredada de MA01" : ""}` },
    { key: "horas", label: "Horas", kind: "number", align: "right", width: "w-[18%]", value: r => r.hours, render: r => r.hours === null ? "—" : number.format(r.hours) },
    { key: "os", label: "OS", kind: "text", width: "w-auto", value: r => r.os },
    { key: "nombre", label: "Técnico", kind: "text", width: "w-auto", value: r => r.technician },
    { key: "tipo", label: "Tipo de tiempo", kind: "text", width: "w-auto", value: r => r.type },
    { key: "participacion", label: "Participación", kind: "text", width: "w-auto", value: r => r.inherited ? "Heredada de MA01" : "MA01" },
  ];
  const table = useSectionTable({ rows, columns, initialSort: { key: "fecha", direction: "asc" }, title: "Jornadas trabajadas", fileName: "jornadas-trabajadas.xlsx" });
  return <CompactListTable rows={table.ordered} columns={columns.slice(0, 4)} mobileColumns={[
    { ...columns[0], width: "w-[80%]", render: r => <MobileRecord primary={`${operationsDate(r.date)} · ${time(r.start)}–${time(r.end)}`}
      secondary={showOS ? r.os : r.technician} context={`${r.type}${r.inherited ? " · Participación heredada" : ""}${r.hours === null ? " · Sin horario válido" : ""}`} /> },
    { ...columns[3], width: "w-[20%]" },
  ]} id={r => r.key} label="Jornadas trabajadas" sort={table.sort} onSort={table.toggleSort} status={!rows.length ? "Sin jornadas registradas." : undefined} />;
}

export function WorkLogDetails({ os, from, to }: { os: string; from: string; to: string }) {
  const query = useWorkLog(from, to, true, os);
  const blocked = query.isPending || query.isFetching || query.isError;
  const entries = blocked ? [] : (query.data ?? []).flatMap(log => log.entries.map(entry => ({ os: log.os, entry })));
  const seen = new Set<string>();
  const rows: DetailRow[] = entries.flatMap(({ os, entry }) => {
    const days = workedDays(entry);
    const base = { os, technician: entry.tecnico_nombre, type: entry.tipo_tiempo, inherited: entry.heredado };
    return days ? days.flatMap(day => {
      const key = JSON.stringify([os, entry.tecnico_profile_id ?? entry.tecnico_nombre.trim().toUpperCase(), day.date, day.start, day.end, entry.tipo_tiempo]);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ ...base, ...day, key }];
    })
      : [{ ...base, key: entry.id, date: entry.fecha_inicio, start: entry.hora_inicio ?? null,
        end: entry.hora_fin ?? null, hours: null }];
  });
  return <DetailSection card title="Jornadas trabajadas" icon={<CalendarDays className="h-3.5 w-3.5" />}>
    {query.isError ? <div role="alert" className="text-[12px]">No se pudo cargar el detalle de jornadas.<Button variant="ghost" size="sm" onClick={() => query.refetch()}>Reintentar</Button></div>
      : blocked ? <p role="status" className="text-[12px] text-muted-foreground">Cargando jornadas…</p>
        : <WorkLogTable rows={rows} />}
  </DetailSection>;
}

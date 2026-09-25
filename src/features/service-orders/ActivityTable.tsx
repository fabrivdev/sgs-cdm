import type { OperationsModel } from "./useOperationsModel";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { MobileRecord } from "@/components/lists/MobileRecord";
import { OperationsPanel, OperationsStatus } from "./OperationsPresentation";
import { operationsPeriod } from "./format";

export function ActivityTable({ model }: { model: OperationsModel }) {
  // One row per technician/journey. Different journeys on the same day stay separate.
  const rows = model.matrizTécnicosDías.blocks.flatMap(block => block.técnicos.flatMap(technician =>
    Object.entries(technician.cells).flatMap(([bucket, cell]) => [
      ...cell.refs.map(ref => ({ key: `${technician.id}:${ref.id}`, tecnico: technician.nombre, fecha: ref.fecha ?? bucket,
        cliente: ref.cliente, trabajo: ref.trabajo ?? "", ref: ref.ref, estado: ref.estado, sucursal: ref.sucursal ?? block.sucursal, unavailable: false })),
      ...cell.noDisponibilidad.map(reason => ({ key: `${technician.id}:${bucket}:${reason}`, tecnico: technician.nombre, fecha: bucket,
        cliente: "", trabajo: reason, ref: "", estado: "No disponible", sucursal: block.sucursal, unavailable: true })),
    ])));
  type Row = typeof rows[number];
  const columns: CompactListColumn<Row>[] = [
    { key: "tecnico", label: "Técnico", kind: "text", width: "w-[22%]", value: r => r.tecnico },
    { key: "fecha", label: "Fecha", kind: "text", width: "w-[15%]", value: r => r.fecha, render: r => operationsPeriod(r.fecha) },
    { key: "cliente", label: "Cliente", kind: "text", width: "w-[25%]", value: r => r.cliente },
    { key: "ref", label: "TR", kind: "text", width: "w-[18%]", value: r => r.ref },
    { key: "estado", label: "Estado", kind: "text", width: "w-[20%]", value: r => r.estado, render: r => <OperationsStatus value={r.estado} /> },
    { key: "trabajo", label: "Trabajo / ausencia", kind: "text", width: "w-auto", value: r => r.trabajo },
    { key: "sucursal", label: "Sucursal", kind: "text", width: "w-auto", value: r => r.sucursal },
  ];
  const table = useSectionTable({ rows, columns, initialSort: { key: "fecha", direction: "asc" }, title: "Actividad por técnico", fileName: "actividad-tecnicos.xlsx" });
  const unavailable = table.ordered.filter(row => row.unavailable);
  return <div className="space-y-3"><OperationsPanel title="Actividad por técnico">
    <CompactListTable rows={table.ordered.filter(row => !row.unavailable)} columns={columns.slice(0, 5)} mobileColumns={[
      { ...columns[0], width: "w-[72%]", render: r => <MobileRecord primary={r.tecnico} secondary={r.cliente || r.trabajo} context={`${operationsPeriod(r.fecha)} · ${r.ref || r.sucursal}`} /> },
      { ...columns[4], width: "w-[28%]" },
    ]} id={r => r.key} label="Actividad por técnico" heading={table.heading} sort={table.sort} status={!rows.some(row => !row.unavailable) ? "Sin jornadas para estos filtros." : undefined} />
  </OperationsPanel>
    {unavailable.length > 0 && <OperationsPanel title="Disponibilidad de técnicos">
      <CompactListTable rows={unavailable} columns={[{ ...columns[0], width: "w-[35%]" }, { ...columns[1], label: "Período", width: "w-[20%]" }, { ...columns[5], label: "Motivo", width: "w-[30%]" }, { ...columns[6], width: "w-[15%]" }]}
        mobileColumns={[{ ...columns[0], width: "w-[70%]", render: r => <MobileRecord primary={r.tecnico} secondary={r.trabajo} context={r.sucursal} /> }, { ...columns[1], label: "Período", width: "w-[30%]" }]}
        id={r => r.key} label="Disponibilidad de técnicos" sort={table.sort} onSort={table.toggleSort} />
    </OperationsPanel>}
  </div>;
}

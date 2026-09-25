import { useState } from "react";
import type { ServicioOSRow } from "@/components/dashboard/types";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { CompactListTable, CompactListOrderMenu, type CompactListColumn } from "@/components/lists/CompactListTable";
import { MobileRecord } from "@/components/lists/MobileRecord";
import type { SalesColumn } from "@/components/ventas/salesTableInteraction";
import { ResponsiveDrawer, ResponsiveDrawerHeader, ResponsiveDrawerBody } from "@/components/ui/responsive-drawer";
import { ClipboardList, FileText, Wrench } from "lucide-react";
import { DetailSection, KeyValueGrid, KeyValueItem } from "@/components/maquinaria/MachineDetailPrimitives";
import { OperationsPanel, OperationsStatus } from "./OperationsPresentation";
import { operationsDate, operationsMoney } from "./format";

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const columns: SalesColumn<ServicioOSRow>[] = [
  { key: "os", label: "OS", kind: "text", value: r => r.os },
  { key: "cliente", label: "Cliente", kind: "text", value: r => r.cliente },
  { key: "chasis", label: "Chasis", kind: "text", value: r => r.chasis },
  { key: "sucursal", label: "Sucursal", kind: "text", value: r => r.sucursal },
  { key: "marca", label: "Marca", kind: "text", value: r => r.marca },
  { key: "tecnicos", label: "Técnicos", kind: "text", value: r => r.tecnicos.join(", ") },
  { key: "estado", label: "Estado", kind: "text", value: r => r.estadoOS },
  { key: "apertura", label: "Apertura", kind: "date", value: r => r.fechaApertura },
  { key: "cierre", label: "Cierre", kind: "date", value: r => r.fechaCierre },
  { key: "factura", label: "Factura identificada", kind: "text", value: r => r.factura },
  { key: "facturacion", label: "Situación de facturación", kind: "text", value: r => r.estadoFacturacion },
  { key: "tiempo", label: "Tipo de tiempo", kind: "text", value: r => r.tipoTiempo },
  { key: "horas", label: "Horas OS", kind: "number", align: "center", value: r => r.horas },
  { key: "horasPersona", label: "Horas-persona", kind: "number", align: "right", value: r => r.horasPersona },
  { key: "km", label: "Km", kind: "number", value: r => r.km },
  { key: "servicios", label: "Mano de obra", kind: "number", value: r => r.servicios },
  { key: "repuestos", label: "Repuestos", kind: "number", value: r => r.repuestos },
  { key: "kilometraje", label: "Kilometraje", kind: "number", value: r => r.kilometraje },
  { key: "terceros", label: "Terceros", kind: "number", value: r => r.terceros },
  { key: "total", label: "Valor OS", kind: "number", value: r => r.valorOS },
  { key: "problema", label: "Trabajo", kind: "text", value: r => r.problema },
];
export function OrdersTable({ rows }: { rows: ServicioOSRow[] }) {
  const [selected, setSelected] = useState<ServicioOSRow | null>(null);
  const table = useSectionTable({ rows, columns, initialSort: { key: "cierre", direction: "desc" }, title: "Órdenes de servicio", fileName: "ordenes-de-servicio.xlsx" });
  const widths = ["w-[14%]", "w-[26%]", "w-[15%]", "w-[24%]", "w-[11%]", "w-[10%]"];
  const visible = ["os", "cliente", "chasis", "tecnicos", "estado", "horas"].map((key, index) => ({ ...columns.find(c => c.key === key)!, width: widths[index],
    hiddenBelow: ["chasis", "tecnicos"].includes(key) ? "lg" : undefined })) as CompactListColumn<ServicioOSRow>[];
  visible[0].render = row => <button type="button" className="min-h-11 max-w-full truncate text-left font-mono text-[12px] hover:text-primary focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0" aria-label={`Ver OS ${row.os}`} onClick={() => setSelected(row)}>{row.os}</button>;
  visible[4].render = row => <OperationsStatus value={row.estadoOS} />;
  visible[5].render = row => number.format(row.horas);
  const mobile: CompactListColumn<ServicioOSRow>[] = [
    { ...visible[0], width: "w-[72%]", render: row => <button type="button" className="min-h-11 w-full text-left" aria-label={`Ver OS ${row.os}`} onClick={() => setSelected(row)}><MobileRecord primary={row.cliente} secondary={`OS ${row.os} · ${row.chasis || "Sin chasis"}`} context={row.tecnicos.join(", ")} /></button> },
    { ...visible[4], width: "w-[28%]" },
  ];
  return <>
    <OperationsPanel>
    <CompactListTable<ServicioOSRow> rows={table.ordered} columns={visible} mobileColumns={mobile} id={r => r.key} label="Órdenes de servicio" heading={table.heading} sort={table.sort} onSelect={row => setSelected(row)} status={!rows.length ? "Sin órdenes para estos filtros." : undefined} />
    <div className="flex h-9 items-center justify-between border-t px-3 text-[11px] text-muted-foreground"><span>{rows.length} órdenes</span><CompactListOrderMenu label="órdenes" columns={columns} sort={table.sort} onSort={table.toggleSort} /></div>
    </OperationsPanel>
    <ResponsiveDrawer open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}>
      <ResponsiveDrawerHeader><div className="flex flex-wrap items-center gap-2"><h2 className="text-[14px] font-semibold">OS {selected?.os}</h2>{selected && <OperationsStatus value={selected.estadoOS} />}</div><p className="mt-1 text-[12px] text-muted-foreground">{selected?.cliente}</p></ResponsiveDrawerHeader>
      <ResponsiveDrawerBody>{selected && <div className="space-y-3">
        <DetailSection card title="Orden de servicio" icon={<ClipboardList className="h-3.5 w-3.5" />}>
          <KeyValueGrid><KeyValueItem label="Sucursal" value={selected.sucursal} /><KeyValueItem label="Marca" value={selected.marca} /><KeyValueItem label="Chasis" value={selected.chasis} mono /><KeyValueItem label="Apertura" value={operationsDate(selected.fechaApertura)} empty="—" /><KeyValueItem label="Cierre" value={operationsDate(selected.fechaCierre)} empty="—" /><KeyValueItem label="Tipo de tiempo" value={selected.tipoTiempo} /></KeyValueGrid>
        </DetailSection>
        <DetailSection card title="Trabajo y técnicos" icon={<Wrench className="h-3.5 w-3.5" />}>
          <p className="text-[12px] leading-relaxed">{selected.problema || "Sin descripción"}</p>
          <dl className="my-3"><KeyValueItem label="Técnicos" value={selected.tecnicos.join(", ")} /></dl>
          <KeyValueGrid><KeyValueItem label="Horas OS" value={number.format(selected.horas)} /><KeyValueItem label="Horas-persona" value={number.format(selected.horasPersona)} /><KeyValueItem label="Km" value={number.format(selected.km)} /></KeyValueGrid>
        </DetailSection>
        <DetailSection card title="Facturación e importes" icon={<FileText className="h-3.5 w-3.5" />}>
          <dl className="space-y-3 border-b pb-3"><KeyValueItem label="Factura identificada" value={selected.factura} mono /><KeyValueItem label="Situación de facturación" value={selected.estadoFacturacion} /></dl>
          <KeyValueGrid className="py-3"><KeyValueItem label="Mano de obra" value={operationsMoney(selected.servicios)} /><KeyValueItem label="Repuestos" value={operationsMoney(selected.repuestos)} /><KeyValueItem label="Kilometraje" value={operationsMoney(selected.kilometraje)} /><KeyValueItem label="Terceros" value={operationsMoney(selected.terceros)} /></KeyValueGrid>
          <div className="flex items-center justify-between border-t pt-3 text-[12px]"><span className="text-muted-foreground">Valor OS</span><strong className="tabular-nums">{operationsMoney(selected.valorOS)}</strong></div>
        </DetailSection>
      </div>}</ResponsiveDrawerBody>
    </ResponsiveDrawer>
  </>;
}

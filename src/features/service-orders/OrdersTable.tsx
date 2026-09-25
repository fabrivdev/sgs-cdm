import { useState } from "react";
import type { ServicioOSRow } from "@/components/dashboard/types";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { CompactListTable, CompactListOrderMenu, type CompactListColumn } from "@/components/lists/CompactListTable";
import { MobileRecord } from "@/components/lists/MobileRecord";
import type { SalesColumn } from "@/components/ventas/salesTableInteraction";
import { ResponsiveDrawer, ResponsiveDrawerHeader, ResponsiveDrawerBody } from "@/components/ui/responsive-drawer";
import { Badge } from "@/components/ui/badge";

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const columns: SalesColumn<ServicioOSRow>[] = [
  { key: "os", label: "OS", kind: "text", value: r => r.os },
  { key: "cliente", label: "Cliente", kind: "text", value: r => r.cliente },
  { key: "chasis", label: "Chasis", kind: "text", value: r => r.chasis },
  { key: "sucursal", label: "Sucursal", kind: "text", value: r => r.sucursal },
  { key: "marca", label: "Marca", kind: "text", value: r => r.marca },
  { key: "tecnicos", label: "Equipo", kind: "text", value: r => r.tecnicos.join(", ") },
  { key: "estado", label: "Estado", kind: "text", value: r => r.estadoOS },
  { key: "apertura", label: "Apertura", kind: "date", value: r => r.fechaApertura },
  { key: "cierre", label: "Cierre", kind: "date", value: r => r.fechaCierre },
  { key: "factura", label: "Factura identificada", kind: "text", value: r => r.factura },
  { key: "facturacion", label: "Situación de facturación", kind: "text", value: r => r.estadoFacturacion },
  { key: "tiempo", label: "Tipo de tiempo", kind: "text", value: r => r.tipoTiempo },
  { key: "horas", label: "Horas OS", kind: "number", align: "right", value: r => r.horas },
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
  const visible = ["os", "cliente", "chasis", "tecnicos", "estado", "horas"].map(key => ({ ...columns.find(c => c.key === key)!, width: key === "cliente" ? "w-[25%]" : key === "tecnicos" ? "w-[22%]" : "w-auto" })) as CompactListColumn<ServicioOSRow>[];
  visible[0].render = row => <button type="button" className="min-h-11 text-left font-medium text-primary" aria-label={`Ver OS ${row.os}`} onClick={() => setSelected(row)}>{row.os}</button>;
  const mobile: CompactListColumn<ServicioOSRow>[] = [
    { ...visible[0], width: "w-[72%]", render: row => <button type="button" className="min-h-11 w-full text-left" aria-label={`Ver OS ${row.os}`} onClick={() => setSelected(row)}><MobileRecord primary={row.cliente} secondary={`OS ${row.os} · ${row.chasis || "Sin chasis"}`} context={row.tecnicos.join(", ")} /></button> },
    { ...visible[4], width: "w-[28%]", render: row => <span className="text-[12px]">{row.estadoOS}</span> },
  ];
  return <>
    <div className="flex items-center justify-between"><p className="text-[12px] text-muted-foreground">{rows.length} órdenes</p><CompactListOrderMenu label="órdenes" columns={columns} sort={table.sort} onSort={table.toggleSort} /></div>
    <CompactListTable<ServicioOSRow> rows={table.ordered} columns={visible} mobileColumns={mobile} id={r => r.key} label="Órdenes de servicio" heading={table.heading} sort={table.sort} onSelect={row => setSelected(row)} status={!rows.length ? "Sin órdenes para estos filtros." : undefined} />
    <ResponsiveDrawer open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}>
      <ResponsiveDrawerHeader><h2 className="font-semibold">OS {selected?.os}</h2><p className="text-[13px] text-muted-foreground">{selected?.cliente}</p></ResponsiveDrawerHeader>
      <ResponsiveDrawerBody>{selected && <div className="space-y-4"><Badge variant="outline">{selected.estadoOS}</Badge><p className="text-[13px]">{selected.problema || "Sin descripción"}</p>
        <dl className="space-y-2 text-[13px]">{columns.filter(c => !["os", "cliente", "problema", "estado"].includes(c.key)).map(c => { const value = c.value(selected); return <div key={c.key} className="grid grid-cols-[minmax(100px,1fr)_minmax(0,1.5fr)] gap-3 border-b pb-2"><dt className="text-muted-foreground">{c.label}</dt><dd className="break-words text-right">{value == null || value === "" ? "No informado" : c.kind === "number" ? number.format(Number(value)) : String(value)}</dd></div>; })}</dl>
      </div>}</ResponsiveDrawerBody>
    </ResponsiveDrawer>
  </>;
}

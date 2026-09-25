import { useState } from "react";
import type { ServicioOSRow } from "@/components/dashboard/types";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { CompactListTable, CompactListOrderMenu, type CompactListColumn } from "@/components/lists/CompactListTable";
import { MobileRecord } from "@/components/lists/MobileRecord";
import type { SalesColumn } from "@/components/ventas/salesTableInteraction";
import { SalesSortButton } from "@/components/ventas/SalesTableControls";
import { ResponsiveDrawer, ResponsiveDrawerHeader, ResponsiveDrawerBody } from "@/components/ui/responsive-drawer";
import { ClipboardList, FileText, Wrench } from "lucide-react";
import { DetailSection, KeyValueGrid, KeyValueItem } from "@/components/maquinaria/MachineDetailPrimitives";
import { OperationsPanel, OperationsStatus } from "./OperationsPresentation";
import { operationsDate, operationsMoney } from "./format";
import { orderClosingDays } from "./orderMetrics";
import { useIsMobile } from "@/hooks/use-mobile";
import { MarcaBadge } from "@/components/StatusBadges";

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const columns: SalesColumn<ServicioOSRow>[] = [
  { key: "os", label: "OS", kind: "text", value: r => r.os },
  { key: "cliente", label: "Cliente", kind: "text", value: r => r.cliente },
  { key: "chasis", label: "Chasis", kind: "text", value: r => r.chasis },
  { key: "sucursal", label: "Sucursal", kind: "text", value: r => r.sucursal },
  { key: "marca", label: "Marca", kind: "text", value: r => r.marca },
  { key: "modelo", label: "Modelo", kind: "text", value: r => r.modelo ?? null },
  { key: "tecnicos", label: "Técnicos", kind: "number", align: "center", value: r => r.tecnicos.length },
  { key: "nombresTecnicos", label: "Nombres de técnicos", kind: "text", value: r => r.tecnicos.join(", ") },
  { key: "estado", label: "Estado", kind: "text", value: r => r.estadoOS },
  { key: "apertura", label: "Apertura", kind: "date", value: r => r.fechaApertura },
  { key: "cierre", label: "Cierre", kind: "date", value: r => r.fechaCierre },
  { key: "factura", label: "Factura identificada", kind: "text", value: r => r.factura },
  { key: "fechaFacturacion", label: "Fecha de facturación", kind: "date", value: r => r.fechaFacturacion ?? null },
  { key: "diasCierre", label: "Días apertura a facturación", kind: "number", value: orderClosingDays },
  { key: "facturacion", label: "Situación informada por origen", kind: "text", value: r => r.estadoFacturacion },
  { key: "tiempo", label: "Tipo de tiempo", kind: "text", value: r => r.tipoTiempo },
  { key: "horas", label: "Horas OS", kind: "number", align: "center", value: r => r.horas },
  { key: "horasPersona", label: "Horas-persona", kind: "number", align: "right", value: r => r.horasPersona },
  { key: "km", label: "Km recorridos", kind: "number", align: "center", value: r => r.km },
  { key: "servicios", label: "Mano de obra", kind: "number", value: r => r.servicios },
  { key: "repuestos", label: "Repuestos", kind: "number", value: r => r.repuestos },
  { key: "kilometraje", label: "Kilometraje", kind: "number", value: r => r.kilometraje },
  { key: "terceros", label: "Terceros", kind: "number", value: r => r.terceros },
  { key: "total", label: "Valor OS", kind: "number", value: r => r.valorOS },
  { key: "problema", label: "Trabajo", kind: "text", value: r => r.problema },
];
export function OrdersTable({ rows }: { rows: ServicioOSRow[] }) {
  const compact = useIsMobile(1024);
  const [selected, setSelected] = useState<ServicioOSRow | null>(null);
  const selectedDays = selected ? orderClosingDays(selected) : null;
  const table = useSectionTable({ rows, columns, initialSort: { key: "cierre", direction: "desc" }, title: "Órdenes de servicio", fileName: "ordenes-de-servicio.xlsx" });
  const widths = ["w-[12%]", "w-[22%]", "w-[8%]", "w-[20%]", "w-[8%]", "w-[10%]", "w-[10%]", "w-[10%]"];
  const visible = ["os", "cliente", "marca", "modelo", "tecnicos", "estado", "horas", "km"].map((key, index) => ({ ...columns.find(c => c.key === key)!, width: widths[index],
    hiddenBelow: ["marca", "tecnicos"].includes(key) ? "lg" : undefined })) as CompactListColumn<ServicioOSRow>[];
  visible[0].render = row => <button type="button" className="min-h-11 max-w-full truncate text-left font-mono text-[12px] hover:text-primary focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0" aria-label={`Ver OS ${row.os}`} onClick={() => setSelected(row)}>{row.os}</button>;
  visible[2].render = row => <MarcaBadge marca={row.marca} className="px-1.5 text-[10px]" />;
  visible[3].render = row => <span className="flex min-w-0 items-center gap-1.5"><MarcaBadge marca={row.marca} className="shrink-0 px-1.5 text-[10px] lg:hidden" /><span className="truncate">{row.modelo || "—"}</span></span>;
  visible[3].title = row => `${row.marca} · ${row.modelo || "Sin modelo"}`;
  visible[5].render = row => <OperationsStatus value={row.estadoOS} />;
  visible[6].render = row => number.format(row.horas);
  visible[7].render = row => number.format(row.km);
  const heading = (key: string) => compact && ["horas", "km"].includes(key)
    ? <SalesSortButton label={key === "horas" ? "Horas" : "Km"} kind="number" align="center" active={table.sort.key === key} direction={table.sort.direction} onClick={() => table.toggleSort(key)} />
    : table.heading(key);
  const mobile: CompactListColumn<ServicioOSRow>[] = [
    { ...visible[0], width: "w-[72%]", render: row => <button type="button" className="min-h-11 w-full text-left" aria-label={`Ver OS ${row.os}`} onClick={() => setSelected(row)}><MobileRecord primary={row.cliente} secondary={<span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"><MarcaBadge marca={row.marca} className="px-1.5 text-[10px]" /><span>{row.modelo || "Sin modelo"}</span></span>} context={<><span className="block">OS {row.os}</span><span>{row.tecnicos.length} {row.tecnicos.length === 1 ? "técnico" : "técnicos"} · {number.format(row.horas)} h · {number.format(row.km)} km</span></>} /></button> },
    { ...visible[5], width: "w-[28%]" },
  ];
  return <>
    <OperationsPanel>
    <CompactListTable<ServicioOSRow> rows={table.ordered} columns={visible} mobileColumns={mobile} id={r => r.key} label="Órdenes de servicio" heading={heading} sort={table.sort} onSelect={row => setSelected(row)} status={!rows.length ? "Sin órdenes para estos filtros." : undefined} />
    <div className="flex h-9 items-center justify-between border-t px-3 text-[11px] text-muted-foreground"><span>{rows.length} órdenes</span><CompactListOrderMenu label="órdenes" columns={columns} sort={table.sort} onSort={table.toggleSort} /></div>
    </OperationsPanel>
    <ResponsiveDrawer open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}>
      <ResponsiveDrawerHeader><div className="flex flex-wrap items-center gap-2"><h2 className="text-[14px] font-semibold">OS {selected?.os}</h2>{selected && <OperationsStatus value={selected.estadoOS} />}</div><p className="mt-1 text-[12px] text-muted-foreground">{selected?.cliente}</p></ResponsiveDrawerHeader>
      <ResponsiveDrawerBody>{selected && <div className="space-y-3">
        <DetailSection card title="Orden de servicio" icon={<ClipboardList className="h-3.5 w-3.5" />}>
          <KeyValueGrid><KeyValueItem label="Marca" value={<MarcaBadge marca={selected.marca} className="text-[10px]" />} /><KeyValueItem label="Modelo" value={selected.modelo} /><KeyValueItem label="Chasis" value={selected.chasis} mono /><KeyValueItem label="Sucursal" value={selected.sucursal} /><KeyValueItem label="Apertura" value={operationsDate(selected.fechaApertura)} empty="—" /><KeyValueItem label="Cierre OS" value={operationsDate(selected.fechaCierre)} empty="—" /><KeyValueItem label="Tipo de tiempo" value={selected.tipoTiempo} /></KeyValueGrid>
        </DetailSection>
        <DetailSection card title="Trabajo y técnicos" icon={<Wrench className="h-3.5 w-3.5" />}>
          <p className="text-[12px] leading-relaxed">{selected.problema || "Sin descripción"}</p>
          <dl className="my-3"><KeyValueItem label="Técnicos" value={selected.tecnicos.join(", ")} /></dl>
          <KeyValueGrid><KeyValueItem label="Horas OS" value={number.format(selected.horas)} /><KeyValueItem label="Horas-persona" value={number.format(selected.horasPersona)} /><KeyValueItem label="Km recorridos" value={number.format(selected.km)} /></KeyValueGrid>
        </DetailSection>
        <DetailSection card title="Facturación e importes" icon={<FileText className="h-3.5 w-3.5" />}>
          <dl className="space-y-3 border-b pb-3"><KeyValueItem label="Factura identificada" value={selected.factura} mono /><KeyValueItem label="Fecha de facturación" value={operationsDate(selected.fechaFacturacion ?? null)} empty="—" /><KeyValueItem label="Días de cierre" value={selectedDays === null ? "—" : number.format(selectedDays)} empty="—" /></dl>
          <KeyValueGrid className="py-3"><KeyValueItem label="Mano de obra" value={operationsMoney(selected.servicios)} /><KeyValueItem label="Repuestos" value={operationsMoney(selected.repuestos)} /><KeyValueItem label="Kilometraje" value={operationsMoney(selected.kilometraje)} /><KeyValueItem label="Terceros" value={operationsMoney(selected.terceros)} /></KeyValueGrid>
          <div className="flex items-center justify-between border-t pt-3 text-[12px]"><span className="text-muted-foreground">Valor OS</span><strong className="tabular-nums">{operationsMoney(selected.valorOS)}</strong></div>
        </DetailSection>
      </div>}</ResponsiveDrawerBody>
    </ResponsiveDrawer>
  </>;
}

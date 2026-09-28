import { useAuth } from "@/hooks/useAuth";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";
import { useSalesSectionExport } from "./SalesSectionExports";
import type { SalesColumn } from "./salesTableInteraction";

import type { TechnicianOSDetail, ServiceTechnicianRow } from "./serviceTechnicianModel";
const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatNumber = (value: number | null) => value == null ? "—" : number.format(value);
const formatMoney = (value: number | null) => value == null ? "—" : `$ ${money.format(value)}`;
const status = (row: TechnicianOSDetail) => !row.tiene_mo ? "Sin MO en los filtros actuales"
  : row.mo_periodo == null ? "MO sin atribuir" : "Con MO en el período";
const displayType = (type: string) => type === "Garantia" ? "Garantía" : type;
// Independent full-context export; the nine-column summary keeps its current contract.
export function ServiceTechnicianDetailExport({ rows, desde, hasta }: {
  rows: ServiceTechnicianRow[]; desde: string; hasta: string;
}) {
  const { can } = useAuth();
  const details = rows.flatMap(row => row.detalle_os.map(detail => ({ ...detail, tecnico: row.tecnico })));
  type ExportRow = typeof details[number];
  const columns: SalesColumn<ExportRow>[] = [
    { key: "tecnico", label: "Técnico", kind: "text", value: row => row.tecnico },
    { key: "os", label: "OS", kind: "text", value: row => row.os_numero },
    { key: "tipo", label: "Tipo de tiempo", kind: "text", value: row => displayType(row.tipo_tiempo) },
    { key: "horas_os", label: "Horas OS", kind: "number", value: row => row.horas_os },
    { key: "horas_mo", label: "Horas con MO en período", kind: "number", value: row => row.horas_mo },
    { key: "mo", label: "MO en período", kind: "number", value: row => row.mo_periodo, excelFormat: '"$" #,##0.00;"$" -#,##0.00' },
    { key: "estado", label: "MO", kind: "text", value: status },
  ];
  useSalesSectionExport({ id: "service-technician-os-detail", label: "Exportar horas y MO por OS",
    disabled: !details.length, onSelect: async () => {
      const { exportSalesTable } = await import("./salesTableExport");
      exportSalesTable({ rows: details, columns, fileName: `ventas-servicios-tecnicos-os-${desde}-${hasta}.xlsx`, sheetName: "Horas y MO por OS" });
    },
  }, can("datos:exportar"));
  return null;
}

export function ServiceTechnicianDetail({ row, onClose, desde, hasta }: {
  row: ServiceTechnicianRow | undefined; onClose: () => void; desde: string; hasta: string;
}) {
  return <ResponsiveDrawer open={!!row} onOpenChange={open => { if (!open) onClose(); }}>
    <ResponsiveDrawerHeader><h2 className="text-sm font-semibold">{row?.tecnico}</h2></ResponsiveDrawerHeader>
    <ResponsiveDrawerBody className="space-y-3">
      {row?.detalle_os.map(detail => <section key={JSON.stringify([detail.os_numero, detail.tipo_tiempo])} className="overflow-hidden rounded-md border">
        <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2 text-xs">
          <h3 className="font-medium">{detail.os_numero ? `OS ${detail.os_numero}` : "Sin OS vinculada"}</h3>
          <span>{displayType(detail.tipo_tiempo)}</span>
        </div>
        <dl className="grid grid-cols-2 gap-3 px-3 py-3 text-xs">
          <div><dt className="text-muted-foreground" title="Horas del técnico en esta OS y tipo de tiempo, de todas sus jornadas computables">Horas OS</dt><dd className="mt-1 font-medium tabular-nums">{formatNumber(detail.horas_os)}</dd></div>
          <div><dt className="text-muted-foreground" title={`${desde} — ${hasta}`}>MO en período</dt><dd className="mt-1 font-medium tabular-nums">{formatMoney(detail.mo_periodo)}</dd></div>
        </dl>
        {(!detail.tiene_mo || detail.mo_periodo == null) && <div className="border-t px-3 py-2 text-xs text-muted-foreground">{status(detail)}</div>}
      </section>)}
    </ResponsiveDrawerBody>
  </ResponsiveDrawer>;
}

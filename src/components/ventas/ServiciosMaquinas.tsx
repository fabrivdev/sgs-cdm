import { useMemo } from "react";
import { MarcaBadge } from "@/components/StatusBadges";
import { groupServiceBrandsByMachine } from "./serviceBrandGroups";
import { useServiciosIndicadores, type IndicadoresFiltros, type IndicadorMaquina } from "./useServiciosIndicadores";
import { SalesDataTable, type SalesDisplayColumn } from "./SalesDataTable";
import { serviceMoneyColumn, serviceNumberColumn } from "./serviceSalesColumns";

const columns: readonly SalesDisplayColumn<IndicadorMaquina>[] = [
  { key: "marca", label: "Marca", kind: "text", value: row => row.marca, render: row => <MarcaBadge marca={row.marca} className="max-w-full truncate text-[10px]" /> },
  { key: "tipo", label: "Tipo de máquina", kind: "text", value: row => row.tipo_maquina, weight: 1.7 },
  serviceNumberColumn("maquinas", "Máquinas", row => row.maquinas),
  serviceNumberColumn("ordenes", "OS", row => row.ordenes),
  serviceNumberColumn("horas", "Horas OS", row => row.horas),
  ...([ ["mo", "Mano de obra"], ["km", "Kilometraje"], ["repuestos", "Repuestos"], ["terceros", "Terceros"], ["neto", "Neto"] ] as const)
    .map(([key, label]) => serviceMoneyColumn<IndicadorMaquina>(key, label, row => row[key])),
];
export function ServiciosMaquinas(props: IndicadoresFiltros) {
  const { data, loading, error } = useServiciosIndicadores(props);
  const rows = useMemo(() => groupServiceBrandsByMachine(data?.por_maquina ?? []), [data]);
  if (loading) return <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando máquinas…</div>;
  if (error) return <div role="alert" className="py-12 text-center text-[12px] text-destructive">{error}</div>;
  return <div className="mt-3 min-w-0"><SalesDataTable title="Facturación por máquina" rows={rows} columns={columns}
    mobileIdentity={row=>`${row.marca} · ${row.tipo_maquina}`}
    initialSort={{ key: "neto", direction: "desc" }} rowKey={row => `${row.marca}__${row.tipo_maquina}`}
    fileName={`ventas-servicios-maquinas-${props.desde}-${props.hasta}.xlsx`} empty="No hay facturación por máquina en el período." /></div>;
}

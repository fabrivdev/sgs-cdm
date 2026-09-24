import { useMemo } from "react";
import { money } from "@/components/dashboard/utils";
import { MarcaBadge } from "@/components/StatusBadges";
import { groupServiceBrandsByTime } from "./serviceBrandGroups";
import { useServiciosIndicadores, type IndicadoresFiltros, type IndicadorTipo, type IndicadorMarcaTipo } from "./useServiciosIndicadores";
import { SalesDataTable, type SalesDisplayColumn } from "./SalesDataTable";
import { serviceMoneyColumn, serviceNumberColumn, serviceShareColumn } from "./serviceSalesColumns";

const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const typeLabel = (value: string) => value === "Garantia" ? "Garantía" : value;
const historicLabel = "Histórico sin OS vinculada";
const unknown = (value: string) => /(?:sin|no) (?:identificar|identificado|informar|informado|clasificar|clasificado)/i.test(value);
type Amounts = { mo: number; km: number; repuestos: number; terceros: number; neto: number; horas: number | null; sin_vinculo_historico?: boolean };
function amountColumns<T extends Amounts>(total: number): SalesDisplayColumn<T>[] {
  return [
    ...([ ["mo", "Mano de obra"], ["km", "Kilometraje"], ["repuestos", "Repuestos"], ["terceros", "Terceros"], ["neto", "Neto"] ] as const)
      .map(([key, label]) => serviceMoneyColumn<T>(key, label, row => row[key])),
    serviceNumberColumn<T>("horas", "Horas OS", row => row.sin_vinculo_historico ? null : row.horas),
    serviceShareColumn<T>(row => total ? row.neto / total : null),
  ];
}
export function ServiciosResumen(props: IndicadoresFiltros) {
  const { data, loading, error } = useServiciosIndicadores(props);
  const marcaRows = useMemo(() => groupServiceBrandsByTime(data?.por_marca_tipo ?? []), [data]);
  if (loading) return <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando indicadores…</div>;
  if (error) return <div role="alert" className="py-12 text-center text-[12px] text-destructive">{error}</div>;
  if (!data) return <div className="py-12 text-center text-[12px] text-muted-foreground">No hay datos para el período.</div>;
  const { totales } = data;
  const tipoColumns: SalesDisplayColumn<IndicadorTipo>[] = [
    { key: "tipo", label: "Tipo de tiempo", kind: "text", weight: 1.6, value: row => row.sin_vinculo_historico ? historicLabel : typeLabel(row.tipo_tiempo) },
    serviceNumberColumn("ordenes", "OS asociadas", row => row.sin_vinculo_historico ? null : row.ordenes),
    ...amountColumns<IndicadorTipo>(totales.neto),
  ];
  const brandColumns: SalesDisplayColumn<IndicadorMarcaTipo>[] = [
    { key: "marca", label: "Marca", kind: "text", weight: 1.6, value: row => row.sin_vinculo_historico ? historicLabel : row.marca,
      render: row => row.sin_vinculo_historico ? historicLabel : unknown(row.marca) ? row.marca : <MarcaBadge marca={row.marca} className="max-w-full truncate text-[10px]" /> },
    { key: "tipo", label: "Tipo", kind: "text", value: row => row.sin_vinculo_historico ? null : typeLabel(row.tipo_tiempo) },
    ...amountColumns<IndicadorMarcaTipo>(totales.neto),
  ];
  const cards: Array<[string, string]> = [
    ["Neto", money(totales.neto)], ["Mano de obra", money(totales.mo)], ["Kilometraje", money(totales.km)],
    ["Repuestos", money(totales.repuestos)], ["Terceros", money(totales.terceros)],
    ["OS facturadas", integer.format(totales.ordenes)], ["Documentos", integer.format(totales.documentos)], ["Horas OS", decimal.format(totales.horas)],
  ];
  return <div className="mt-3 min-w-0 space-y-3">
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">{cards.map(([label, value]) => <div key={label} className="min-w-0 rounded-md border px-3 py-2">
      <p className="truncate text-[10px] font-medium text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-[13px] font-semibold tabular-nums">{value}</p>
    </div>)}</div>
    <SalesDataTable title="Facturación por tipo de tiempo" rows={data.por_tipo} columns={tipoColumns}
      initialSort={{key:"neto",direction:"desc"}} rowKey={row => `${row.tipo_tiempo}-${Boolean(row.sin_vinculo_historico)}`}
      fileName={`ventas-servicios-tipos-${props.desde}-${props.hasta}.xlsx`} />
    {!Array.isArray(data.por_marca_tipo) ? <div role="alert" className="py-10 text-center text-[12px] text-destructive">Falta actualizar la consulta del resumen por marca. Aplicá el SQL de corrección.</div>
      : <SalesDataTable title="Facturación por marca y tiempo" rows={marcaRows} columns={brandColumns}
        mobileIdentity={row=>row.sin_vinculo_historico?historicLabel:`${row.marca} · ${typeLabel(row.tipo_tiempo)}`}
        initialSort={{key:"neto",direction:"desc"}} rowKey={row => `${row.marca}-${row.tipo_tiempo}-${Boolean(row.sin_vinculo_historico)}`}
        fileName={`ventas-servicios-marcas-${props.desde}-${props.hasta}.xlsx`} />}
  </div>;
}

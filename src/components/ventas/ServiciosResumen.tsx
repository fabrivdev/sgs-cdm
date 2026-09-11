import { money } from "@/components/dashboard/utils";
import { useServiciosIndicadores, type IndicadoresFiltros } from "@/components/ventas/useServiciosIndicadores";
import { SERVICE_SALES_GRID, SERVICE_SALES_HEADERS, SERVICE_SALES_MIN_WIDTH } from "@/components/ventas/serviceSalesTable";

const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const typeLabel = (value: string) => (value === "Garantia" ? "Garantía" : value);

export function ServiciosResumen(props: IndicadoresFiltros) {
  const { data, loading, error } = useServiciosIndicadores(props);

  if (loading) return <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando indicadores…</div>;
  if (error) return <div role="alert" className="py-12 text-center text-[12px] text-destructive">{error}</div>;
  if (!data) return <div className="py-12 text-center text-[12px] text-muted-foreground">No hay datos para el período.</div>;

  const { totales, por_tipo } = data;
  const cards: Array<[string, string]> = [
    ["Neto", money(totales.neto)],
    ["Mano de obra", money(totales.mo)],
    ["Kilometraje", money(totales.km)],
    ["Repuestos", money(totales.repuestos)],
    ["Terceros", money(totales.terceros)],
    ["OS facturadas", integer.format(totales.ordenes)],
    ["Documentos", integer.format(totales.documentos)],
    ["Horas OS", decimal.format(totales.horas)],
  ];

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-md border px-3 py-2">
            <p className="truncate text-[10px] font-medium text-muted-foreground">{label}</p>
            <p className="mt-0.5 truncate text-[13px] font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-[13px] font-semibold">Facturación por tipo de tiempo</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">La misma composición del período, abierta por Cliente, Garantía e Interno.</p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <div className={SERVICE_SALES_MIN_WIDTH}>
          <div className={`grid ${SERVICE_SALES_GRID} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}>
            <div className="text-center">Tipo de tiempo</div>
            {SERVICE_SALES_HEADERS.map((label) => <div key={label} className="text-center">{label}</div>)}
          </div>
          {!por_tipo.length ? <div className="py-10 text-center text-[12px] text-muted-foreground">Sin facturación en el período.</div>
            : por_tipo.map((row) => (
              <div key={row.tipo_tiempo} className={`grid ${SERVICE_SALES_GRID} items-center border-t px-3 py-2 text-[12px]`}>
                <div className="truncate font-medium">{typeLabel(row.tipo_tiempo)}</div>
                <div className="text-right font-semibold tabular-nums">{money(row.neto)}</div>
                {[row.mo, row.km, row.repuestos, row.terceros].map((value, index) => <div key={index} className="text-right tabular-nums text-muted-foreground">{money(value)}</div>)}
                <div className="text-right tabular-nums">{integer.format(row.clientes ?? 0)}</div>
                <div className="text-right tabular-nums">{integer.format(row.facturas ?? 0)}</div>
                <div className="text-right tabular-nums">{totales.neto ? `${Math.round((row.neto / totales.neto) * 100)}%` : "—"}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

import { money } from "@/components/dashboard/utils";
import { useServiciosIndicadores, type IndicadoresFiltros } from "@/components/ventas/useServiciosIndicadores";

const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const typeLabel = (value: string) => (value === "Garantia" ? "Garantía" : value);

const COLUMNS = "grid-cols-[minmax(120px,1fr)_repeat(5,minmax(100px,1fr))_80px_90px_90px]";

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

      <div className="overflow-x-auto rounded-md border">
        <div className="min-w-[860px]">
          <div className={`grid ${COLUMNS} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}>
            <div>Tipo de tiempo</div>
            {["MO", "Km", "Repuestos", "Terceros", "Neto"].map((label) => <div key={label} className="text-right">{label}</div>)}
            <div className="text-right">OS</div><div className="text-right">Horas OS</div><div className="text-right">Part.</div>
          </div>
          {!por_tipo.length ? <div className="py-10 text-center text-[12px] text-muted-foreground">Sin facturación en el período.</div>
            : por_tipo.map((row) => (
              <div key={row.tipo_tiempo} className={`grid ${COLUMNS} items-center border-t px-3 py-2 text-[12px]`}>
                <div className="truncate font-medium">{typeLabel(row.tipo_tiempo)}</div>
                {[row.mo, row.km, row.repuestos, row.terceros].map((value, index) => <div key={index} className="text-right tabular-nums text-muted-foreground">{money(value)}</div>)}
                <div className="text-right font-semibold tabular-nums">{money(row.neto)}</div>
                <div className="text-right tabular-nums">{integer.format(row.ordenes)}</div>
                <div className="text-right tabular-nums">{decimal.format(row.horas)}</div>
                <div className="text-right tabular-nums">{totales.neto ? `${Math.round((row.neto / totales.neto) * 100)}%` : "—"}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

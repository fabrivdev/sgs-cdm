import { money } from "@/components/dashboard/utils";
import { useServiciosIndicadores, type IndicadoresFiltros } from "@/components/ventas/useServiciosIndicadores";
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const typeLabel = (value: string) => (value === "Garantia" ? "Garantía" : value);
const COLUMNS = "grid-cols-[minmax(120px,1fr)_minmax(110px,1fr)_repeat(5,minmax(110px,1fr))_90px_85px]";
const MONEY_LABELS = ["Mano de obra", "Kilometraje", "Repuestos", "Terceros", "Neto"];
const unknown = (value: string) => /(?:sin|no) (?:identificar|identificado|informar|informado|clasificar|clasificado)/i.test(value);

export function ServiciosResumen(props: IndicadoresFiltros) {
  const { data, loading, error } = useServiciosIndicadores(props);

  if (loading) return <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando indicadores…</div>;
  if (error) return <div role="alert" className="py-12 text-center text-[12px] text-destructive">{error}</div>;
  if (!data) return <div className="py-12 text-center text-[12px] text-muted-foreground">No hay datos para el período.</div>;

  const { totales } = data;
  const porTipo = [...data.por_tipo].sort((a, b) => Number(unknown(a.tipo_tiempo)) - Number(unknown(b.tipo_tiempo)) || b.neto - a.neto);
  const marcaRows = data.por_marca_tipo ?? [];
  const marcaConocida = marcaRows.filter((row) => !unknown(row.marca));
  const marcaDesconocida = marcaRows.filter((row) => unknown(row.marca));
  const agregadoDesconocido = marcaDesconocida.length
    ? [marcaDesconocida.reduce((acc, row) => ({
        ...acc,
        mo: acc.mo + row.mo,
        km: acc.km + row.km,
        repuestos: acc.repuestos + row.repuestos,
        terceros: acc.terceros + row.terceros,
        neto: acc.neto + row.neto,
        horas: acc.horas + row.horas,
      }), { ...marcaDesconocida[0], marca: "Sin identificar", tipo_tiempo: "—", mo: 0, km: 0, repuestos: 0, terceros: 0, neto: 0, horas: 0 })]
    : [];
  const porMarcaTipo = [
    ...marcaConocida.sort((a, b) => a.marca.localeCompare(b.marca, "es") || b.neto - a.neto),
    ...agregadoDesconocido,
  ];
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
        <div className="min-w-[1040px]">
          <div className={`grid ${COLUMNS} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}>
            <div>Tipo de tiempo</div>
            {['MO', 'Km', 'Repuestos', 'Terceros', 'Neto', 'OS asociadas', 'Horas OS', 'Participación'].map((label) => <div key={label} className="text-right">{label}</div>)}
          </div>
          {!porTipo.length ? <div className="py-10 text-center text-[12px] text-muted-foreground">Sin facturación en el período.</div>
            : porTipo.map((row) => (
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

      <div className="overflow-x-auto rounded-md border">
        <div className="min-w-[1060px]">
          <div className={`grid ${BRAND_COLUMNS} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}>
            <div>Marca</div><div>Tipo</div>
            {['MO', 'Km', 'Repuestos', 'Terceros', 'Neto', 'Horas OS', 'Participación'].map((label) => <div key={label} className="text-right">{label}</div>)}
          </div>
          {!porMarcaTipo.length ? <div className="py-10 text-center text-[12px] text-muted-foreground">Sin datos por marca.</div>
            : porMarcaTipo.map((row) => <div key={`${row.marca}-${row.tipo_tiempo}`} className={`grid ${BRAND_COLUMNS} items-center border-t px-3 py-2 text-[12px]`}>
              <div className="truncate font-medium">{row.marca}</div><div className="truncate">{typeLabel(row.tipo_tiempo)}</div>
              {[row.mo, row.km, row.repuestos, row.terceros].map((value, index) => <div key={index} className="text-right tabular-nums text-muted-foreground">{money(value)}</div>)}
              <div className="text-right font-semibold tabular-nums">{money(row.neto)}</div>
              <div className="text-right tabular-nums">{decimal.format(row.horas)}</div>
              <div className="text-right tabular-nums">{totales.neto ? `${Math.round((row.neto / totales.neto) * 100)}%` : "—"}</div>
            </div>)}
        </div>
      </div>
    </div>
  );
}

import { money } from "@/components/dashboard/utils";
import { useServiciosIndicadores, type IndicadoresFiltros } from "@/components/ventas/useServiciosIndicadores";

const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const COLUMNS = "grid-cols-[minmax(110px,1fr)_minmax(150px,1.2fr)_90px_70px_80px_repeat(5,minmax(100px,1fr))]";

export function ServiciosMaquinas(props: IndicadoresFiltros) {
  const { data, loading, error } = useServiciosIndicadores(props);

  if (loading) return <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando máquinas…</div>;
  if (error) return <div role="alert" className="py-12 text-center text-[12px] text-destructive">{error}</div>;

  const rows = [...(data?.por_maquina ?? [])].sort((a, b) => Number(/sin (identificar|informar|máquina|maquina)/i.test(`${a.marca} ${a.tipo_maquina}`)) - Number(/sin (identificar|informar|máquina|maquina)/i.test(`${b.marca} ${b.tipo_maquina}`)) || b.neto - a.neto);

  return (
    <div className="mt-3 overflow-x-auto rounded-md border">
      <div className="min-w-[1120px]">
        <div className={`grid ${COLUMNS} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}>
          <div>Marca</div><div>Tipo de máquina</div>
          <div className="text-right">Máquinas</div><div className="text-right">OS</div><div className="text-right">Horas OS</div>
          {["MO", "Km", "Repuestos", "Terceros", "Neto"].map((label) => <div key={label} className="text-right">{label}</div>)}
        </div>
        {!rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay facturación por máquina en el período.</div>
          : rows.map((row) => (
            <div key={`${row.marca}__${row.tipo_maquina}`} className={`grid ${COLUMNS} items-center border-t px-3 py-2 text-[12px]`}>
              <div className="truncate font-medium">{row.marca}</div>
              <div className="truncate" title={row.tipo_maquina}>{row.tipo_maquina}</div>
              <div className="text-right tabular-nums">{integer.format(row.maquinas)}</div>
              <div className="text-right tabular-nums">{integer.format(row.ordenes)}</div>
              <div className="text-right tabular-nums">{decimal.format(row.horas)}</div>
              {[row.mo, row.km, row.repuestos, row.terceros].map((value, index) => <div key={index} className="text-right tabular-nums text-muted-foreground">{money(value)}</div>)}
              <div className="text-right font-semibold tabular-nums">{money(row.neto)}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

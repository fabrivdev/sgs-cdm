import { useMemo, useState } from "react";
import { ClipboardList, PackageCheck, ShoppingCart, Timer } from "lucide-react";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { FilterMultiSelect } from "@/components/filters/FilterMultiSelect";
import { KpiItem, KpiStrip, Panel, SectionHeader } from "@/components/layout/AppPrimitives";
import { Button } from "@/components/ui/button";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useComprasPedidosLineas, useComprasSolicitudesLineas, type PedidoLinea, type SolicitudLinea } from "@/hooks/useCompras";
import { SUCURSALES } from "@/lib/constants";
import { purchaseBuckets, purchaseProgress } from "./purchaseProgress";
import { purchaseMoney, purchaseQuantity } from "./purchaseTableFormat";

const whole = new Intl.NumberFormat("es-PY");
const percent = new Intl.NumberFormat("es-PY", { style: "percent", maximumFractionDigits: 1 });
const monthDate = new Intl.DateTimeFormat("es-PY", { month: "short", year: "2-digit", timeZone: "UTC" });
const date = new Intl.DateTimeFormat("es-PY", { dateStyle: "short", timeZone: "UTC" });
const monthLabel = (month: string) => /^\d{4}-\d{2}$/.test(month) ? monthDate.format(new Date(`${month}-01T00:00:00Z`)) : month;
const requestStatus = (row: SolicitudLinea) => purchaseProgress(row.cantidad, row.cantidadEnPedido, row.cantidadPendiente);
const orderStatus = (row: PedidoLinea) => purchaseProgress(row.cantidad, row.cantidadEntregada, row.cantidadPendiente);
const quantity = (value: number | null | undefined) => value == null ? "—" : purchaseQuantity.format(value);
const documentCount = <T,>(rows: T[], key: (row: T) => string) => new Set(rows.map(key)).size;

type Bucket = ReturnType<typeof purchaseBuckets>[number];
const sum = (row: Bucket) => row.complete + row.pending + row.unknown;

function ProgressChart({ rows, title, completeLabel, pendingLabel }: {
  rows: Bucket[]; title: string; completeLabel: string; pendingLabel: string;
}) {
  const max = Math.max(1, ...rows.map(sum));
  const series = [
    { key: "complete", label: completeLabel, color: "bg-primary" },
    { key: "pending", label: pendingLabel, color: "bg-amber-500" },
    { key: "unknown", label: "Sin datos", color: "bg-muted-foreground/45" },
  ] as const;
  return <Panel>
    <SectionHeader title={title} />
    {rows.length ? <>
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {series.map(({ key, color, label }) => <span key={key} className="inline-flex items-center gap-1.5">
          <span className={`size-2 rounded-sm ${color}`} />{label}
        </span>)}
      </div>
      <ul className="max-h-64 space-y-2 overflow-auto pr-1">
        {rows.map(row => <li key={row.name} className="grid grid-cols-[minmax(4rem,1fr)_minmax(4rem,2.4fr)_3rem] items-center gap-2 text-xs">
          <span className="truncate" title={row.name}>{monthLabel(row.name)}</span>
          <div className="flex h-3 overflow-hidden rounded-sm bg-muted"
            role="img" aria-label={series.map(({ key, label }) => `${label}: ${whole.format(row[key])}`).join(", ")}
            title={series.map(({ key, label }) => `${label} ${whole.format(row[key])}`).join(" · ")}>
            {series.map(({ key, color }) => <span key={key} className={color} style={{ width: `${100 * row[key] / max}%` }} />)}
          </div>
          <span className="text-right tabular-nums">{whole.format(sum(row))}</span>
        </li>)}
      </ul>
    </> : <p className="text-sm text-muted-foreground">Sin líneas para este filtro.</p>}
  </Panel>;
}

export function ComprasResumenTab() {
  const requests = useComprasSolicitudesLineas();
  const orders = useComprasPedidosLineas();
  const [branches, setBranches] = useState<string[]>([]);
  const [month, setMonth] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SolicitudLinea | null>(null);
  const months = useMemo(() => [...new Set([
    ...(requests.data ?? []).map(row => row.fechaEmision?.slice(0, 7)),
    ...(orders.data ?? []).map(row => row.fecha?.slice(0, 7)),
  ].filter(Boolean))].sort().reverse(), [orders.data, requests.data]);
  const result = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    const matches = (branch: string, issued: string | null, ...fields: (string | null)[]) =>
      (!branches.length || branches.includes(branch)) &&
      (month === "all" || issued?.slice(0, 7) === month) &&
      (!query || fields.some(field => field?.toLocaleLowerCase("es").includes(query)));
    const requestRows = (requests.data ?? []).filter(row => matches(row.sucursal, row.fechaEmision,
      row.nroSolicitud, row.productoCodigo, row.codigoFabricante, row.descripcion, row.solicitante));
    const orderRows = (orders.data ?? []).filter(row => matches(row.sucursal, row.fecha,
      row.nroPedido, row.productoCodigo, row.descripcion, row.proveedorNombre));
    const byMonth = purchaseBuckets(requestRows, row => row.fechaEmision?.slice(0, 7) || "Sin fecha", requestStatus)
      .sort((a, b) => a.name.localeCompare(b.name));
    const byProvider = purchaseBuckets(orderRows, row => row.proveedorNombre || "Sin proveedor", orderStatus)
      .sort((a, b) => b.pending - a.pending || sum(b) - sum(a) || a.name.localeCompare(b.name, "es"));
    const pending = requestRows.filter(row => requestStatus(row) === "pending")
      .sort((a, b) => (a.fechaEmision || "9999").localeCompare(b.fechaEmision || "9999")
        || a.nroSolicitud.localeCompare(b.nroSolicitud) || a.item.localeCompare(b.item));
    return { requestRows, orderRows, byMonth, byProvider, pending };
  }, [branches, month, requests.data, orders.data, search]);

  if (requests.isLoading || orders.isLoading) return <p role="status" className="text-sm text-muted-foreground">Cargando compras…</p>;
  if (requests.isError || orders.isError) return <div role="alert" className="space-y-2">
    <p className="text-sm">No se pudieron cargar las compras completas.</p>
    <Button variant="outline" size="sm" onClick={() => void Promise.all([requests.refetch(), orders.refetch()])}>Reintentar</Button>
  </div>;

  const { requestRows, orderRows, byMonth, byProvider, pending } = result;
  const unknown = byMonth.reduce((total, row) => total + row.unknown, 0);
  const complete = byMonth.reduce((total, row) => total + row.complete, 0);
  const received = byProvider.reduce((total, row) => total + row.complete, 0);
  const measured = requestRows.length - unknown;
  const pendingLabel = pending.length && pending.every(row => row.unidad === "UN")
    ? `${quantity(pending.reduce((total, row) => total + (row.cantidadPendiente ?? 0), 0))} unidades`
    : `${whole.format(documentCount(pending, row => `${row.sucursal}|${row.nroSolicitud}`))} solicitudes con saldo`;
  return <div className="space-y-3">
    <FiltersBar search={{ value: search, onChange: setSearch, placeholder: "Código, descripción o documento…" }}
      activeCount={Number(Boolean(search)) + Number(branches.length > 0) + Number(month !== "all")}
      onClear={() => { setSearch(""); setBranches([]); setMonth("all"); }}>
      <FilterMultiSelect label="Sucursal" values={branches} onChange={setBranches} placeholder="Todas"
        options={SUCURSALES.map(value => ({ value, label: value }))} />
      <FilterSelect label="Mes de emisión" value={month} onChange={setMonth} placeholder="Todos"
        options={[{ value: "all", label: "Todos" }, ...months.map(value => ({ value, label: monthLabel(value) }))]} />
    </FiltersBar>

    <KpiStrip>
      <KpiItem label="Solicitudes" icon={<ClipboardList />}
        value={whole.format(documentCount(requestRows, row => `${row.sucursal}|${row.nroSolicitud}`))}
        detail={`${whole.format(requestRows.length)} ítems`} />
      <KpiItem label="Ítems pasados a pedido" icon={<ShoppingCart />}
        value={measured ? percent.format(complete / measured) : "—"}
        detail={unknown ? `${whole.format(unknown)} ítems sin datos` : `${whole.format(complete)} de ${whole.format(measured)} ítems`} />
      <KpiItem label="Ítems pendientes de pedir" icon={<Timer />} value={measured ? whole.format(pending.length) : "—"}
        detail={measured ? pendingLabel : undefined} />
      <KpiItem label="Ítems recibidos" icon={<PackageCheck />} value={orderRows.length ? whole.format(received) : "—"}
        detail={`De ${whole.format(orderRows.length)} ítems de pedidos cargados`} />
    </KpiStrip>

    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      <ProgressChart rows={byMonth} title="Solicitudes por mes" completeLabel="Pasado a pedido" pendingLabel="Pendiente de pedir" />
      <ProgressChart rows={byProvider} title="Recepción por proveedor" completeLabel="Recibido" pendingLabel="Pendiente de recibir" />
    </div>

    <Panel>
      <SectionHeader title="Necesidades pendientes" />
        <Table aria-label="Necesidades pendientes" className="table-fixed text-xs" containerClassName="max-h-[32rem]">
          <TableHeader className="sticky top-0 z-10 bg-card"><TableRow>
            <TableHead className="w-[24%] sm:w-[15%]">Solicitud</TableHead>
            <TableHead className="hidden sm:table-cell sm:w-[13%]">Emisión</TableHead>
            <TableHead className="hidden sm:table-cell sm:w-[15%]">Sucursal</TableHead>
            <TableHead>Repuesto</TableHead>
            <TableHead className="w-[25%] text-right sm:w-[15%]">Pendiente</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!pending.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">
              {measured ? "Sin pendientes para este filtro." : "Sin saldos informados. Cargá el reporte de solicitudes con las cantidades de TOTVS."}
            </TableCell></TableRow>}
            {pending.map(row => <TableRow key={`${row.sucursal}|${row.nroSolicitud}|${row.item}`}>
              <TableCell className="truncate font-medium" title={`${row.nroSolicitud} · Ítem ${row.item}`}>{row.nroSolicitud}
                <span className="block truncate text-muted-foreground sm:hidden">{row.sucursal}</span>
              </TableCell>
              <TableCell className="hidden sm:table-cell">{row.fechaEmision ? date.format(new Date(row.fechaEmision)) : "—"}</TableCell>
              <TableCell className="hidden truncate sm:table-cell" title={row.sucursal}>{row.sucursal}</TableCell>
              <TableCell><div className="flex min-w-0 items-center gap-1">
                <button type="button" aria-label={`Detalle ${row.productoCodigo}`} title={row.productoCodigo}
                  className="min-w-0 shrink-0 truncate rounded-sm text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-11 max-sm:shrink"
                  onClick={() => setSelected(row)}>{row.productoCodigo}</button>
                <span className="hidden truncate text-muted-foreground sm:inline"> {row.descripcion}</span>
              </div></TableCell>
              <TableCell className="text-right tabular-nums">{purchaseQuantity.format(row.cantidadPendiente ?? 0)} {row.unidad}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
    </Panel>
    <ResponsiveDrawer title="Detalle de solicitud" size="sm" open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}>
      <ResponsiveDrawerHeader><h2 className="text-sm font-semibold">Solicitud {selected?.nroSolicitud}</h2></ResponsiveDrawerHeader>
      <ResponsiveDrawerBody>{selected && <dl className="divide-y text-sm">
        {[
          ["Ítem", selected.item], ["Sucursal", selected.sucursal], ["Código", selected.productoCodigo],
          ["Descripción", selected.descripcion ?? "—"], ["Solicitado", quantity(selected.cantidad)],
          ["En pedido", quantity(selected.cantidadEnPedido)], ["Pendiente de pedir", quantity(selected.cantidadPendiente)],
          ["Precio unitario", selected.precioUnitario > 0 ? purchaseMoney(selected.precioUnitario, selected.moneda) : "Sin precio informado"],
          ["Usuario TOTVS", selected.solicitante ?? "—"], ["Transporte", selected.medioTransporte ?? "—"],
        ].map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(7rem,1fr)_2fr] gap-2 py-2">
          <dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words">{value}</dd>
        </div>)}
      </dl>}</ResponsiveDrawerBody>
    </ResponsiveDrawer>
  </div>;
}

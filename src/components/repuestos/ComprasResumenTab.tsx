import { useMemo, useState } from "react";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { FilterMultiSelect } from "@/components/filters/FilterMultiSelect";
import { Panel, SectionHeader } from "@/components/layout/AppPrimitives";
import { Button } from "@/components/ui/button";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useComprasSolicitudesLineas, type SolicitudLinea } from "@/hooks/useCompras";
import { SUCURSALES } from "@/lib/constants";
import { purchaseBalanceIssue, purchaseProgress, purchaseProgressLabels, purchaseBuckets, type PurchaseProgress } from "./purchaseProgress";
import { purchaseQuantity } from "./purchaseTableFormat";

const whole = new Intl.NumberFormat("es-PY");
const monthDate = new Intl.DateTimeFormat("es-PY", { month: "short", year: "numeric", timeZone: "UTC" });
const date = new Intl.DateTimeFormat("es-PY", { dateStyle: "short", timeZone: "UTC" });
const monthLabel = (month: string) => monthDate.format(new Date(`${month}-01T00:00:00Z`));
const statusOf = (row: SolicitudLinea) => purchaseProgress(row.cantidad, row.cantidadEnPedido, row.cantidadPendiente);
const quantity = (value: number | null | undefined) => value == null ? "—" : purchaseQuantity.format(value);
const dateLabel = (row: SolicitudLinea) => row.fechaEmision ? date.format(new Date(row.fechaEmision)) : "—";
const statuses = ["pending", "complete", "unknown"] as const;

export function ComprasResumenTab() {
  const requests = useComprasSolicitudesLineas();
  const [branches, setBranches] = useState<string[]>([]);
  const [month, setMonth] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PurchaseProgress>("pending");
  const [selected, setSelected] = useState<SolicitudLinea | null>(null);

  const months = useMemo(() => [...new Set((requests.data ?? [])
    .flatMap(row => row.fechaEmision ? [row.fechaEmision.slice(0, 7)] : []))].sort().reverse(), [requests.data]);

  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return (requests.data ?? []).filter(row =>
      (!branches.length || branches.includes(row.sucursal))
      && (month === "all" || row.fechaEmision?.slice(0, 7) === month)
      && (!query || [row.nroSolicitud, row.productoCodigo, row.codigoFabricante, row.descripcion].some(
        field => field?.toLocaleLowerCase("es").includes(query))));
  }, [branches, month, requests.data, search]);

  const grouped = purchaseBuckets(rows, row => row.sucursal || "Sin sucursal", statusOf)
    .sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name, "es"));
  const detail = rows.filter(row => statusOf(row) === status)
    .sort((a, b) => (a.fechaEmision || "9999").localeCompare(b.fechaEmision || "9999")
      || a.nroSolicitud.localeCompare(b.nroSolicitud) || a.item.localeCompare(b.item));
  const issue = selected && purchaseBalanceIssue(selected.cantidad, selected.cantidadEnPedido, selected.cantidadPendiente);

  if (requests.isLoading) return <p role="status" className="text-sm text-muted-foreground">Cargando solicitudes…</p>;
  if (requests.isError) return <div role="alert" className="space-y-2">
    <p className="text-sm">No se pudieron cargar las solicitudes.</p>
    <Button variant="outline" size="sm" onClick={() => void requests.refetch()}>Reintentar</Button>
  </div>;

  return <div className="space-y-3">
    <FiltersBar search={{ value: search, onChange: setSearch, placeholder: "Solicitud, código o descripción…" }}
      activeCount={Number(Boolean(search)) + Number(branches.length > 0) + Number(month !== "all")}
      onClear={() => { setSearch(""); setBranches([]); setMonth("all"); setStatus("pending"); }}>
      <FilterMultiSelect label="Sucursal" values={branches} onChange={setBranches} placeholder="Todas"
        options={SUCURSALES.map(value => ({ value, label: value }))} />
      <FilterSelect label="Mes de emisión" value={month} onChange={setMonth} placeholder="Todos"
        options={[{ value: "all", label: "Todos" }, ...months.map(value => ({ value, label: monthLabel(value) }))]} />
    </FiltersBar>

    <Panel>
      <SectionHeader title="Ítems de solicitud por sucursal" />
      <p className="mb-3 text-xs text-muted-foreground">Saldos informados por TOTVS. La vigencia de la solicitud y la recepción se verifican aparte.</p>
      <Table aria-label="Ítems de solicitud por sucursal" className="table-fixed">
        <TableHeader><TableRow>
          <TableHead className="w-[37%]">Sucursal</TableHead>
          {statuses.map(key => <TableHead key={key} className="px-1 text-right sm:px-3">{purchaseProgressLabels[key]}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {grouped.map(row => <TableRow key={row.name}>
            <TableCell className="truncate font-medium" title={row.name}>{row.name}</TableCell>
            {statuses.map(key => <TableCell key={key} className="px-1 text-right tabular-nums sm:px-3">
              {whole.format(row[key])}
            </TableCell>)}
          </TableRow>)}
          {!grouped.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sin solicitudes para este filtro.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Panel>

    <Panel>
      <SectionHeader title="Detalle por ítem" actions={<FilterSelect label="Saldo TOTVS" value={status}
        onChange={value => setStatus(value as PurchaseProgress)} placeholder="Con saldo"
        options={statuses.map(value => ({ value, label: purchaseProgressLabels[value] }))} />} />
      <Table aria-label="Detalle por ítem" className="table-fixed text-xs" containerClassName="max-h-[32rem]">
        <TableHeader className="sticky top-0 z-10 bg-card"><TableRow>
          <TableHead className="w-[25%] sm:w-[12%]">Solicitud</TableHead>
          <TableHead className="hidden sm:table-cell sm:w-[12%]">Emisión</TableHead>
          <TableHead className="hidden sm:table-cell sm:w-[15%]">Sucursal</TableHead>
          <TableHead>Repuesto</TableHead>
          <TableHead className="hidden text-right sm:table-cell sm:w-[12%]">Solicitado</TableHead>
          <TableHead className="hidden text-right sm:table-cell sm:w-[12%]">En pedido</TableHead>
          <TableHead className="w-[24%] text-right sm:w-[12%]">Saldo</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {!detail.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin ítems para este filtro.</TableCell></TableRow>}
          {detail.map(row => <TableRow key={`${row.sucursal}|${row.nroSolicitud}|${row.item}`}>
            <TableCell className="truncate" title={`${row.nroSolicitud} · Ítem ${row.item}`}>{row.nroSolicitud}
              <span className="block truncate text-muted-foreground sm:hidden">{row.sucursal}</span>
            </TableCell>
            <TableCell className="hidden sm:table-cell">{dateLabel(row)}</TableCell>
            <TableCell className="hidden truncate sm:table-cell" title={row.sucursal}>{row.sucursal}</TableCell>
            <TableCell><div className="flex min-w-0 items-center gap-1">
              <button type="button" aria-label={`Detalle ${row.productoCodigo}`} title={row.productoCodigo}
                className="min-w-0 shrink-0 truncate rounded-sm text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-11 max-sm:shrink"
                onClick={() => setSelected(row)}>{row.productoCodigo}</button>
              <span className="hidden truncate text-muted-foreground sm:inline">{row.descripcion}</span>
            </div></TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">{quantity(row.cantidad)}</TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">{quantity(row.cantidadEnPedido)}</TableCell>
            <TableCell className="text-right tabular-nums">{quantity(row.cantidadPendiente)}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </Panel>
    <ResponsiveDrawer title="Detalle de solicitud" size="sm" open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}>
      <ResponsiveDrawerHeader><h2 className="text-sm font-semibold">Solicitud {selected?.nroSolicitud}</h2></ResponsiveDrawerHeader>
      <ResponsiveDrawerBody>
      {issue && <p className="mb-2 text-sm text-muted-foreground">{issue}</p>}
      {selected && <dl className="divide-y text-sm">
        {[
          ["Ítem", selected.item], ["Fecha de emisión", dateLabel(selected)], ["Sucursal", selected.sucursal],
          ["Código", selected.productoCodigo], ["Descripción", selected.descripcion ?? "—"], ["Unidad", selected.unidad ?? "—"],
          ["Solicitado", quantity(selected.cantidad)], ["En pedido", quantity(selected.cantidadEnPedido)],
          ["Saldo informado", quantity(selected.cantidadPendiente)], ["Usuario TOTVS", selected.solicitante ?? "—"],
          ["Transporte", selected.medioTransporte ?? "—"], ["Observación TOTVS", selected.observacion ?? "—"],
        ].map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(7rem,1fr)_2fr] gap-2 py-2">
          <dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words">{value}</dd>
        </div>)}
      </dl>}</ResponsiveDrawerBody>
    </ResponsiveDrawer>
  </div>;
}

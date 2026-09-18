import { sortSalesRows, type SalesColumn, type SalesSort } from "@/components/ventas/salesTableInteraction";
import { PurchaseInfo, PurchaseTableHeading } from "./PurchaseTableHeading";
import { purchaseCell, purchaseHead, purchaseMoney, purchaseQuantity } from "./purchaseTableFormat";
import { cargarTodo } from "@/hooks/useCatalogos";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  useComprasPedidosLineas,
  useComprasSolicitudesLineas,
  useComprasVinculos,
  useProductosFabricanteMap,
  type PedidoLinea,
} from "@/hooks/useCompras";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { resolverSolicitudes, solicitudesPorPedido } from "@/lib/imports";
import { SUCURSALES } from "@/lib/constants";
import { useSortable } from "@/hooks/useSortable";
import { metaText } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { FiltersBar, FilterCustom } from "@/components/filters/FiltersBar";
import { FilterMultiSelect } from "@/components/filters/FilterMultiSelect";
import { TableExportButton, type TableExportOption } from "@/components/exports/TableExportButton";

type PedidoSortKey =
  | "sucursal"
  | "nro_pedido"
  | "fecha_emision"
  | "proveedor_nombre"
  | "cantidad_items"
  | "valor_total"
  | "estado_seguimiento";

const ESTADOS_SEGUIMIENTO = ["Sin gestionar", "Solicitado a fabrica", "En transito", "Recibido"] as const;

const ESTADO_STYLES: Record<(typeof ESTADOS_SEGUIMIENTO)[number], string> = {
  "Sin gestionar": "bg-muted text-muted-foreground border-border",
  "Solicitado a fabrica": "bg-blue-50 text-blue-800 border-blue-200",
  "En transito": "bg-amber-50 text-amber-800 border-amber-200",
  Recibido: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

interface PedidoResumenRow {
  sucursal: string | null;
  nro_pedido: string;
  fecha_emision: string | null;
  proveedor_nombre: string | null;
  moneda: string | null;
  cantidad_items: number;
  valor_total: number;
  cantidad_pendiente_total: number;
  estado_seguimiento: string;
  fecha_estimada_llegada: string | null;
  nro_seguimiento: string | null;
  notas: string | null;
}

interface SeguimientoForm {
  estado_seguimiento: string;
  fecha_estimada_llegada: string;
  nro_seguimiento: string;
  notas: string;
}

interface Filtros {
  busqueda: string;
  sucursales: string[];
  nroPedido: string;
  proveedor: string;
}

const FILTROS_VACIOS: Filtros = { busqueda: "", sucursales: [], nroPedido: "", proveedor: "" };

const rowKey = (row: { sucursal: string | null; nro_pedido: string }) => `${row.sucursal}-${row.nro_pedido}`;

function lineaCoincideBusqueda(linea: PedidoLinea, busqueda: string, fabricanteMap: Map<string, string | null> | undefined) {
  const fabricante = fabricanteMap?.get(linea.productoCodigo) ?? "";
  return (
    linea.productoCodigo.toLowerCase().includes(busqueda) ||
    (fabricante ?? "").toLowerCase().includes(busqueda) ||
    (linea.descripcion ?? "").toLowerCase().includes(busqueda)
  );
}

function usePedidosResumen() {
  return useQuery({
    queryKey: ["compras", "pedidos_resumen"],
    queryFn: async () => {
      return cargarTodo<PedidoResumenRow>((supabase.from("v_compras_pedidos_resumen" as any) as any)
        .select("*").order("sucursal").order("nro_pedido"));
    },
  });
}

export function ComprasPedidosTab() {
  const { user, can } = useAuth();
  const canManageParts = can("repuestos:gestionar");
  const queryClient = useQueryClient();
  const resumenQuery = usePedidosResumen();
  const pedidosLineasQuery = useComprasPedidosLineas();
  const solicitudesLineasQuery = useComprasSolicitudesLineas();
  const vinculosQuery = useComprasVinculos();
  const fabricanteMapQuery = useProductosFabricanteMap();

  const [editing, setEditing] = useState<PedidoResumenRow | null>(null);
  const [form, setForm] = useState<SeguimientoForm>({
    estado_seguimiento: "Sin gestionar",
    fecha_estimada_llegada: "",
    nro_seguimiento: "",
    notas: "",
  });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const { sortKey, sortDir, toggleSort } = useSortable<PedidoSortKey>("fecha_emision", "desc");

  const lineasPorPedido = useMemo(() => {
    const map = new Map<string, PedidoLinea[]>();
    for (const linea of pedidosLineasQuery.data ?? []) {
      const key = `${linea.sucursal}-${linea.nroPedido}`;
      const lista = map.get(key) ?? [];
      lista.push(linea);
      map.set(key, lista);
    }
    return map;
  }, [pedidosLineasQuery.data]);

  const solicitudesPorPedidoMap = useMemo(() => {
    if (!pedidosLineasQuery.data || !solicitudesLineasQuery.data || !vinculosQuery.data) return new Map();
    const resoluciones = resolverSolicitudes(solicitudesLineasQuery.data, pedidosLineasQuery.data, vinculosQuery.data);
    return solicitudesPorPedido(resoluciones);
  }, [pedidosLineasQuery.data, solicitudesLineasQuery.data, vinculosQuery.data]);

  const filtrosActivos = Boolean(filtros.busqueda || filtros.sucursales.length || filtros.nroPedido || filtros.proveedor);

  const filasFiltradas = useMemo(() => {
    const rows = resumenQuery.data ?? [];
    if (!filtrosActivos) return rows;

    const busqueda = filtros.busqueda.trim().toLowerCase();
    const fabricanteMap = fabricanteMapQuery.data;

    return rows.filter((row) => {
      if (filtros.sucursales.length > 0 && (!row.sucursal || !filtros.sucursales.includes(row.sucursal))) return false;
      if (filtros.nroPedido && !row.nro_pedido.toLowerCase().includes(filtros.nroPedido.trim().toLowerCase())) return false;
      if (filtros.proveedor && !(row.proveedor_nombre ?? "").toLowerCase().includes(filtros.proveedor.trim().toLowerCase())) return false;

      if (busqueda) {
        const lineas = lineasPorPedido.get(rowKey(row)) ?? [];
        const matchLinea = lineas.some((linea) => lineaCoincideBusqueda(linea, busqueda, fabricanteMap));
        if (!matchLinea) return false;
      }

      return true;
    });
  }, [resumenQuery.data, filtros, filtrosActivos, lineasPorPedido, fabricanteMapQuery.data]);

  const columns: SalesColumn<PedidoResumenRow>[] = [
    {key:"sucursal",label:"Sucursal",kind:"text",value:r=>r.sucursal},
    {key:"nro_pedido",label:"Pedido",kind:"text",value:r=>r.nro_pedido},
    {key:"fecha_emision",label:"Fecha",kind:"date",value:r=>r.fecha_emision?.slice(0,10)},
    {key:"proveedor_nombre",label:"Proveedor",kind:"text",value:r=>r.proveedor_nombre},
    {key:"cantidad_items",label:"Ítems",kind:"number",align:"center",value:r=>r.cantidad_items},
    {key:"valor_total",label:"Total",kind:"number",align:"right",value:r=>Number(r.valor_total)},
    {key:"estado_seguimiento",label:"Estado",kind:"text",value:r=>r.estado_seguimiento},
  ];
  const filasOrdenadas = sortSalesRows(filasFiltradas,columns,{key:sortKey,direction:sortDir});
  const [itemSort,setItemSort] = useState<SalesSort>({key:"item",direction:"asc"});
  const itemColumns:SalesColumn<PedidoLinea>[] = [
    {key:"item",label:"Ítem",kind:"text",value:r=>r.item},
    {key:"producto",label:"Código",kind:"text",value:r=>r.productoCodigo},
    {key:"descripcion",label:"Descripción",kind:"text",value:r=>r.descripcion},
    {key:"cantidad",label:"Cant.",kind:"number",align:"center",value:r=>r.cantidad},
    {key:"precio",label:"P. unit.",kind:"number",align:"right",value:r=>r.precioUnitario},
    {key:"total",label:"Total",kind:"number",align:"right",value:r=>r.valorTotal},
    {key:"pendiente",label:"Pendiente",kind:"number",align:"center",value:r=>r.cantidadPendiente},
    {key:"solicitud",label:"Solicitud",kind:"text",value:r=>(solicitudesPorPedidoMap.get(`${r.sucursal}|${r.nroPedido}|${r.item}`)??[]).map((s:{sucursal:string;nroSolicitud:string})=>`${s.sucursal}-${s.nroSolicitud}`).join(", ")},
  ];
  const orderItems = (rows:PedidoLinea[]) => sortSalesRows(rows,itemColumns,itemSort);
  const toggleItemSort = (key:string) => setItemSort(p=>({key,direction:p.key===key&&p.direction==="asc"?"desc":"asc"}));

  const exportOptions: TableExportOption[] = (() => {
    const term = filtros.busqueda.trim().toLowerCase();
    const lineas = filasOrdenadas.flatMap(row=>orderItems((lineasPorPedido.get(rowKey(row))??[]).filter(linea=>!term||lineaCoincideBusqueda(linea,term,fabricanteMapQuery.data))));

    return [
      {
        label: "Resumen de pedidos",
        filename: `compras-pedidos-${new Date().toISOString().slice(0, 10)}`,
        sheetName: "Pedidos",
        rows: filasOrdenadas.map((row) => ({
          Sucursal: row.sucursal ?? "",
          "N° pedido": row.nro_pedido,
          "Fecha de emisión": row.fecha_emision ?? "",
          Proveedor: row.proveedor_nombre ?? "",
          Moneda: row.moneda ?? "",
          Ítems: row.cantidad_items,
          "Valor total": Number(row.valor_total),
          "Cantidad pendiente": Number(row.cantidad_pendiente_total),
          Seguimiento: row.estado_seguimiento,
          "Llegada estimada": row.fecha_estimada_llegada ?? "",
          "N° seguimiento": row.nro_seguimiento ?? "",
          Notas: row.notas ?? "",
        })),
      },
      {
        label: "Ítems de pedidos",
        filename: `compras-pedidos-items-${new Date().toISOString().slice(0, 10)}`,
        sheetName: "Ítems",
        rows: lineas.map((linea) => {
          const solicitudes = solicitudesPorPedidoMap.get(
            `${linea.sucursal}|${linea.nroPedido}|${linea.item}`,
          ) as { sucursal: string; nroSolicitud: string; esManual: boolean }[] | undefined;
          return {
            Sucursal: linea.sucursal,
            "N° pedido": linea.nroPedido,
            Ítem: linea.item,
            Fecha: linea.fecha ?? "",
            Proveedor: linea.proveedorNombre ?? "",
            Producto: linea.productoCodigo,
            Descripción: linea.descripcion ?? "",
            Unidad: linea.unidad ?? "",
            Cantidad: linea.cantidad,
            "Precio unitario": linea.precioUnitario,
            Total: linea.valorTotal,
            Entregado: linea.cantidadEntregada,
            Pendiente: linea.cantidadPendiente,
            Solicitudes: (solicitudes ?? []).map((row) => `${row.sucursal}-${row.nroSolicitud}`).join(", "),
          };
        }),
      },
    ];
  })();

  const abrirEdicion = (row: PedidoResumenRow) => {
    setEditing(row);
    setForm({
      estado_seguimiento: row.estado_seguimiento,
      fecha_estimada_llegada: row.fecha_estimada_llegada ?? "",
      nro_seguimiento: row.nro_seguimiento ?? "",
      notas: row.notas ?? "",
    });
  };

  const guardar = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { error } = await (supabase.from("seguimiento_pedidos" as any).upsert(
        {
          sucursal: editing.sucursal,
          nro_pedido: editing.nro_pedido,
          estado_seguimiento: form.estado_seguimiento,
          fecha_estimada_llegada: form.fecha_estimada_llegada || null,
          nro_seguimiento: form.nro_seguimiento.trim() || null,
          notas: form.notas.trim() || null,
          actualizado_por: user?.id ?? null,
          actualizado_en: new Date().toISOString(),
        },
        { onConflict: "sucursal,nro_pedido" },
      ) as any);
      if (error) throw error;

      toast.success("Seguimiento actualizado.");
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["compras", "pedidos_resumen"] });
    } catch (e) {
      toast.error("Error guardando: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const queries = [resumenQuery, pedidosLineasQuery, solicitudesLineasQuery, vinculosQuery, fabricanteMapQuery];
  const loading = queries.some(query=>query.isLoading);
  if (loading) return <p className={metaText}>Cargando pedidos…</p>;

  if (queries.some(query=>query.isError)) return <div role="alert" className="space-y-2">
    <p className={metaText}>No se pudieron cargar los pedidos completos.</p>
    <Button variant="outline" size="sm" onClick={()=>void Promise.all(queries.map(query=>query.refetch()))}>Reintentar</Button>
  </div>;

  if (!resumenQuery.data || resumenQuery.data.length === 0) {
    return <p className={metaText}>Todavía no se importó ningún pedido de compra.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <FiltersBar
          search={{ value: filtros.busqueda, onChange: (busqueda) => setFiltros((f) => ({ ...f, busqueda })), placeholder: "REPIN003187, 06673230, casquillo…", width: "min-w-0 flex-1" }}
          activeCount={Number(Boolean(filtros.busqueda)) + Number(filtros.sucursales.length > 0) + Number(Boolean(filtros.nroPedido)) + Number(Boolean(filtros.proveedor))}
          onClear={() => setFiltros(FILTROS_VACIOS)}
          secondaryActions={can("datos:exportar") && !resumenQuery.isError && !pedidosLineasQuery.isError ? <TableExportButton options={exportOptions} /> : undefined}
        >
          <FilterMultiSelect
            label="Sucursal"
            values={filtros.sucursales}
            onChange={(sucursales) => setFiltros((f) => ({ ...f, sucursales }))}
            placeholder="Todas"
            options={SUCURSALES.map((sucursal) => ({ value: sucursal, label: sucursal }))}
            width="w-40"
          />
          <FilterCustom label="N° Pedido" width="w-32">
            <Input value={filtros.nroPedido} onChange={(e) => setFiltros((f) => ({ ...f, nroPedido: e.target.value }))} />
          </FilterCustom>
          <FilterCustom label="Proveedor" width="min-w-[160px] flex-1">
            <Input value={filtros.proveedor} onChange={(e) => setFiltros((f) => ({ ...f, proveedor: e.target.value }))} />
          </FilterCustom>
        </FiltersBar>

        {filtrosActivos && (
          <p className={metaText}>
            {filasFiltradas.length} de {resumenQuery.data.length} pedidos.
          </p>
        )}

        <div className="overflow-hidden rounded-md border">
          <Table className="table-fixed" aria-label="Pedidos de compra">
            <colgroup><col className="w-[5%] sm:w-[3%]" /><col className="w-[20%] sm:w-[12%]" /><col className="w-[20%] sm:w-[12%]" />
              <col className="hidden sm:table-column sm:w-[11%]" /><col className="hidden sm:table-column sm:w-[23%]" />
              <col className="hidden sm:table-column sm:w-[6%]" /><col className="w-[30%] sm:w-[14%]" /><col className="w-[20%] sm:w-[14%]" /><col className="w-[5%]" /></colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className={purchaseHead} />
                {columns.map(column => <PurchaseTableHeading key={column.key} column={column} sort={{key:sortKey,direction:sortDir}}
                  onSort={key=>toggleSort(key as PedidoSortKey)} className={["fecha_emision","proveedor_nombre","cantidad_items"].includes(column.key)?"hidden sm:table-cell":undefined} />)}
                <TableHead className={purchaseHead} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filasOrdenadas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className={cn(metaText, "p-4 text-center")}>
                    Sin pedidos para este filtro.
                  </TableCell>
                </TableRow>
              )}
              {filasOrdenadas.map((row) => {
                const key = rowKey(row);
                const isOpen = filtrosActivos ? true : expanded.has(key);
                const busquedaActiva = filtros.busqueda.trim().toLowerCase();
                const lineas = busquedaActiva
                  ? (lineasPorPedido.get(key) ?? []).filter((linea) =>
                      lineaCoincideBusqueda(linea, busquedaActiva, fabricanteMapQuery.data),
                    )
                  : lineasPorPedido.get(key) ?? [];

                return (
                  <Fragment key={key}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => {
                        if (filtrosActivos) return;
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                    >
                      <TableCell className={cn(purchaseCell,"px-0 sm:px-0")}>
                        <button type="button" className="flex w-full justify-center" aria-expanded={isOpen} disabled={filtrosActivos}
                          aria-label={`Ítems del pedido ${row.nro_pedido} (${row.sucursal})`}>
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        </button>
                      </TableCell>
                      <TableCell className={purchaseCell} title={row.sucursal ?? "—"}>{row.sucursal ?? "—"}</TableCell>
                      <TableCell className={cn(purchaseCell,"font-mono")} title={`${row.nro_pedido} · ${row.fecha_emision ?? "—"}`}>
                        <PurchaseInfo label={row.nro_pedido} fields={[["Sucursal",row.sucursal??"—"],["Fecha",row.fecha_emision??"—"],["Proveedor",row.proveedor_nombre??"—"],["Ítems",String(row.cantidad_items)],["Estado",row.estado_seguimiento],["Total",purchaseMoney(row.valor_total,row.moneda)],["Moneda",row.moneda??"No informada"]]} />
                      </TableCell>
                      <TableCell className={cn(purchaseCell,"hidden text-muted-foreground sm:table-cell")} title={row.fecha_emision ?? "—"}>
                        {row.fecha_emision ?? "—"}
                      </TableCell>
                      <TableCell className={cn(purchaseCell,"hidden sm:table-cell")} title={row.proveedor_nombre ?? "—"}>{row.proveedor_nombre ?? "—"}</TableCell>
                      <TableCell className={cn(purchaseCell,"hidden text-center tabular-nums sm:table-cell")}>
                        {busquedaActiva ? `${lineas.length} / ${row.cantidad_items}` : row.cantidad_items}
                      </TableCell>
                      <TableCell className={cn(purchaseCell,"text-right font-medium tabular-nums")} title={`${row.moneda ?? ""} ${row.valor_total}`}>
                        {purchaseMoney(Number(row.valor_total ?? 0),row.moneda)}
                      </TableCell>
                      <TableCell className={purchaseCell} title={row.estado_seguimiento}>
                        <Badge
                          variant="outline"
                          className={cn(
                            "max-w-full overflow-hidden whitespace-nowrap font-medium",
                            ESTADO_STYLES[row.estado_seguimiento as (typeof ESTADOS_SEGUIMIENTO)[number]] ?? ESTADO_STYLES["Sin gestionar"],
                          )}
                        >
                          <span className="truncate sm:hidden">{row.estado_seguimiento==="Solicitado a fabrica"?"A fábrica":row.estado_seguimiento==="Sin gestionar"?"Pendiente":row.estado_seguimiento}</span>
                          <span className="hidden truncate sm:inline">{row.estado_seguimiento}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className={cn(purchaseCell,"px-0 sm:px-0")}>
                        {canManageParts && <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 max-w-full overflow-hidden px-1 text-[12px]"
                          title={`Editar pedido ${row.nro_pedido}`}
                          aria-label="Editar"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirEdicion(row);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 sm:hidden" aria-hidden="true" /><span className="hidden sm:inline">Editar</span>
                        </Button>}
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-muted/30 p-0">
                          {lineas.length === 0 && <p className={cn(metaText, "p-3")}>Sin ítems para este pedido.</p>}
                          {lineas.length > 0 && (
                            <Table className="table-fixed" aria-label={`Ítems del pedido ${row.nro_pedido}`}>
                              <colgroup>{["hidden sm:table-column sm:w-[5%]","w-[28%] sm:w-[16%]","w-[32%] sm:w-[26%]","w-[15%] sm:w-[8%]","hidden sm:table-column sm:w-[11%]","w-[25%] sm:w-[12%]","hidden sm:table-column sm:w-[10%]","hidden sm:table-column sm:w-[12%]"].map((width,index)=><col key={index} className={width} />)}</colgroup>
                              <TableHeader>
                                <TableRow>
                                  {itemColumns.map(column=><PurchaseTableHeading key={column.key} column={column} sort={itemSort} onSort={toggleItemSort}
                                    className={["item","precio","pendiente","solicitud"].includes(column.key)?"hidden sm:table-cell":undefined} />)}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {orderItems(lineas).map((linea) => {
                                  const solicitudes = solicitudesPorPedidoMap.get(
                                    `${linea.sucursal}|${linea.nroPedido}|${linea.item}`,
                                  ) as { sucursal: string; nroSolicitud: string; esManual: boolean }[] | undefined;

                                  return (
                                    <TableRow key={linea.item}>
                                      <TableCell className={cn(purchaseCell,"hidden sm:table-cell")} title={linea.item}>{linea.item}</TableCell>
                                      <TableCell className={cn(purchaseCell,"font-mono")} title={linea.productoCodigo}>
                                        <PurchaseInfo label={linea.productoCodigo} fields={[["Ítem",linea.item],["Descripción",linea.descripcion??"—"],["Cantidad",purchaseQuantity.format(linea.cantidad)],["Unidad",linea.unidad??"—"],["P. unit.",purchaseMoney(linea.precioUnitario,linea.moneda)],["Total",purchaseMoney(linea.valorTotal,linea.moneda)],["Pendiente",purchaseQuantity.format(linea.cantidadPendiente)],["Solicitudes",(solicitudes??[]).map(s=>`${s.sucursal}-${s.nroSolicitud}${s.esManual?"":" (probable)"}`).join(", ")||"—"],["Moneda",linea.moneda??"No informada"]]} />
                                      </TableCell>
                                      <TableCell className={purchaseCell} title={linea.descripcion ?? "—"}>{linea.descripcion ?? "—"}</TableCell>
                                      <TableCell className={cn(purchaseCell,"text-center tabular-nums")} title={`${linea.cantidad} ${linea.unidad ?? ""}`}>
                                        {purchaseQuantity.format(linea.cantidad)}
                                      </TableCell>
                                      <TableCell className={cn(purchaseCell,"hidden text-right tabular-nums sm:table-cell")} title={`${linea.moneda ?? ""} ${linea.precioUnitario}`}>
                                        {purchaseMoney(linea.precioUnitario,linea.moneda)}
                                      </TableCell>
                                      <TableCell className={cn(purchaseCell,"text-right font-medium tabular-nums")} title={`${linea.moneda ?? ""} ${linea.valorTotal}`}>
                                        {purchaseMoney(linea.valorTotal,linea.moneda)}
                                      </TableCell>
                                      <TableCell
                                        className={cn(
                                          purchaseCell,"hidden text-center tabular-nums sm:table-cell",
                                          linea.cantidadPendiente > 0 && "font-semibold text-amber-700",
                                        )}
                                        title={String(linea.cantidadPendiente)}
                                      >
                                        {purchaseQuantity.format(linea.cantidadPendiente)}
                                      </TableCell>
                                      <TableCell className={cn(purchaseCell,"hidden sm:table-cell")}>
                                        {!solicitudes || solicitudes.length === 0 ? (
                                          <span className="text-muted-foreground">—</span>
                                        ) : (
                                          solicitudes.map((s) => (
                                            <span
                                              key={`${s.sucursal}-${s.nroSolicitud}`}
                                              className="mr-1.5 font-mono"
                                              title={`${s.sucursal}-${s.nroSolicitud} · ${s.esManual ? "Vinculada a mano" : "Sugerida por producto, sucursal y precio parecido"}`}
                                            >
                                              {s.sucursal}-{s.nroSolicitud}
                                              {!s.esManual && " (probable)"}
                                            </span>
                                          ))
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={canManageParts && editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Seguimiento — Pedido {editing?.nro_pedido} ({editing?.sucursal})
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select
                value={form.estado_seguimiento}
                onValueChange={(value) => setForm((f) => ({ ...f, estado_seguimiento: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_SEGUIMIENTO.map((estado) => (
                    <SelectItem key={estado} value={estado}>
                      {estado}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Fecha estimada de llegada</Label>
              <Input
                type="date"
                value={form.fecha_estimada_llegada}
                onChange={(e) => setForm((f) => ({ ...f, fecha_estimada_llegada: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>N° de seguimiento</Label>
              <Input
                value={form.nro_seguimiento}
                onChange={(e) => setForm((f) => ({ ...f, nro_seguimiento: e.target.value }))}
                placeholder="Tracking del courier / proveedor"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={guardar} disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

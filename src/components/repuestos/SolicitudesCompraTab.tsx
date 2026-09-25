import { sortSalesRows, type SalesColumn, type SalesSort } from "@/components/ventas/salesTableInteraction";
import { PurchaseInfo, PurchaseTableHeading } from "./PurchaseTableHeading";
import { CompactListOrderMenu } from "@/components/lists/CompactListTable";
import { MobileRecord } from "@/components/lists/MobileRecord";
import { useIsMobile } from "@/hooks/use-mobile";
import { purchaseCell, purchaseHead, purchaseMoney, purchaseQuantity } from "./purchaseTableFormat";
import { Fragment, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useComprasPedidosLineas, useComprasSolicitudesLineas, useComprasVinculos, type SolicitudLinea } from "@/hooks/useCompras";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { toast } from "sonner";
import { resolverSolicitudes, type PedidoCandidato } from "@/lib/imports";
import { SUCURSALES } from "@/lib/constants";
import { useSortable } from "@/hooks/useSortable";
import { metaText } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { FiltersBar, FilterCustom } from "@/components/filters/FiltersBar";
import { FilterMultiSelect } from "@/components/filters/FilterMultiSelect";
import { TableExportButton, type TableExportOption } from "@/components/exports/TableExportButton";

interface Filtros {
  busqueda: string;
  sucursales: string[];
  nroSolicitud: string;
  solicitante: string;
}

type SolicitudSortKey = "sucursal" | "nroSolicitud" | "fechaEmision" | "solicitante" | "itemsCount";

const FILTROS_VACIOS: Filtros = { busqueda: "", sucursales: [], nroSolicitud: "", solicitante: "" };

const rowKey = (row: { sucursal: string; nroSolicitud: string }) => `${row.sucursal}-${row.nroSolicitud}`;

function lineaCoincideBusqueda(linea: SolicitudLinea, busqueda: string) {
  return (
    linea.productoCodigo.toLowerCase().includes(busqueda) ||
    (linea.codigoFabricante ?? "").toLowerCase().includes(busqueda) ||
    (linea.descripcion ?? "").toLowerCase().includes(busqueda)
  );
}

export function SolicitudesCompraTab() {
  const isPhone = useIsMobile(640);
  const { user, can } = useAuth();
  const canManageParts = can("repuestos:gestionar");
  const pedidosLineasQuery = useComprasPedidosLineas();
  const solicitudesLineasQuery = useComprasSolicitudesLineas();
  const vinculosQuery = useComprasVinculos();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const { sortKey, sortDir, toggleSort } = useSortable<SolicitudSortKey>("fechaEmision", "desc");
  const [vinculando, setVinculando] = useState<{
    sucursal: string;
    nroSolicitud: string;
    item: string;
    candidatos: PedidoCandidato[];
  } | null>(null);
  const [guardandoVinculo, setGuardandoVinculo] = useState(false);

  const resoluciones = useMemo(() => {
    if (!pedidosLineasQuery.data || !solicitudesLineasQuery.data || !vinculosQuery.data) return [];
    return resolverSolicitudes(solicitudesLineasQuery.data, pedidosLineasQuery.data, vinculosQuery.data);
  }, [pedidosLineasQuery.data, solicitudesLineasQuery.data, vinculosQuery.data]);

  const resolucionPorLinea = useMemo(() => {
    const map = new Map<string, (typeof resoluciones)[number]>();
    for (const r of resoluciones) {
      map.set(`${r.solicitud.sucursal}|${r.solicitud.nroSolicitud}|${r.solicitud.item}`, r);
    }
    return map;
  }, [resoluciones]);

  // Agrupa las lineas por (sucursal, nro_solicitud) para armar el resumen y filtrar, sin depender de la vista SQL.
  const solicitudesAgrupadas = useMemo(() => {
    const grupos = new Map<
      string,
      {
        sucursal: string;
        nroSolicitud: string;
        fechaEmision: string | null;
        solicitante: string | null;
        moneda: string | null;
        lineas: SolicitudLinea[];
      }
    >();

    for (const linea of solicitudesLineasQuery.data ?? []) {
      const key = `${linea.sucursal}-${linea.nroSolicitud}`;
      const grupo = grupos.get(key);
      if (grupo) {
        grupo.lineas.push(linea);
        grupo.solicitante = grupo.solicitante ?? linea.solicitante;
        grupo.fechaEmision = grupo.fechaEmision ?? linea.fechaEmision;
      } else {
        grupos.set(key, {
          sucursal: linea.sucursal,
          nroSolicitud: linea.nroSolicitud,
          fechaEmision: linea.fechaEmision,
          solicitante: linea.solicitante,
          moneda: linea.moneda,
          lineas: [linea],
        });
      }
    }

    return Array.from(grupos.values()).sort((a, b) => (b.fechaEmision ?? "").localeCompare(a.fechaEmision ?? ""));
  }, [solicitudesLineasQuery.data]);

  const filtrosActivos = Boolean(filtros.busqueda || filtros.sucursales.length || filtros.nroSolicitud || filtros.solicitante);

  const gruposFiltrados = useMemo(() => {
    if (!filtrosActivos) return solicitudesAgrupadas;

    const busqueda = filtros.busqueda.trim().toLowerCase();

    return solicitudesAgrupadas.filter((grupo) => {
      if (filtros.sucursales.length > 0 && !filtros.sucursales.includes(grupo.sucursal)) return false;
      if (filtros.nroSolicitud && !grupo.nroSolicitud.toLowerCase().includes(filtros.nroSolicitud.trim().toLowerCase()))
        return false;
      if (filtros.solicitante && !(grupo.solicitante ?? "").toLowerCase().includes(filtros.solicitante.trim().toLowerCase()))
        return false;

      if (busqueda) {
        const matchLinea = grupo.lineas.some((linea) => lineaCoincideBusqueda(linea, busqueda));
        if (!matchLinea) return false;
      }

      return true;
    });
  }, [solicitudesAgrupadas, filtros, filtrosActivos]);

  type Group = typeof gruposFiltrados[number];
  const columns: SalesColumn<Group>[] = [
    {key:"sucursal",label:"Sucursal",kind:"text",value:r=>r.sucursal},
    {key:"nroSolicitud",label:"Solicitud",kind:"text",value:r=>r.nroSolicitud},
    {key:"fechaEmision",label:"Fecha",kind:"date",value:r=>r.fechaEmision?.slice(0,10)},
    {key:"solicitante",label:"Solicitante",kind:"text",value:r=>r.solicitante},
    {key:"itemsCount",label:"Ítems",kind:"number",align:"center",value:r=>r.lineas.length},
  ];
  const gruposOrdenados = sortSalesRows(gruposFiltrados,columns,{key:sortKey,direction:sortDir});
  const [itemSort,setItemSort] = useState<SalesSort>({key:"item",direction:"asc"});
  const resolution = (r:SolicitudLinea) => resolucionPorLinea.get(`${r.sucursal}|${r.nroSolicitud}|${r.item}`);
  const itemColumns:SalesColumn<SolicitudLinea>[] = [
    {key:"item",label:"Ítem",kind:"text",value:r=>r.item},
    {key:"producto",label:"Código",kind:"text",value:r=>r.productoCodigo},
    {key:"descripcion",label:"Descripción",kind:"text",value:r=>r.descripcion},
    {key:"cantidad",label:"Cant.",kind:"number",align:"center",value:r=>r.cantidad},
    {key:"precio",label:"P. unit.",kind:"number",align:"right",value:r=>r.precioUnitario},
    {key:"estado",label:"Estado",kind:"text",value:r=>resolution(r)?.estado==="reposicion_stock"?"Reposición de stock":"Cotizada"},
    {key:"pedido",label:"Pedido",kind:"text",value:r=>{const p=resolution(r)?.pedidoVinculado;return p?`${p.sucursal}-${p.nroPedido}`:null;}},
  ];
  const orderItems = (rows:SolicitudLinea[]) => sortSalesRows(rows.filter(r=>!filtros.busqueda.trim()||lineaCoincideBusqueda(r,filtros.busqueda.trim().toLowerCase())),itemColumns,itemSort);
  const toggleItemSort = (key:string) => setItemSort(p=>({key,direction:p.key===key&&p.direction==="asc"?"desc":"asc"}));

  const renderPedidoLink = (linea:SolicitudLinea) => {
    const resolucion=resolution(linea);
    if (!resolucion || resolucion.estado==="reposicion_stock") return <>—</>;
    if (resolucion.pedidoVinculado) return <span className={cn("font-mono",!resolucion.esManual && "text-muted-foreground")}
      title={`${resolucion.pedidoVinculado.sucursal}-${resolucion.pedidoVinculado.nroPedido} · ${resolucion.esManual?"Vinculado a mano":"Sugerido por producto, sucursal y precio parecido"}`}>
      {resolucion.pedidoVinculado.sucursal}-{resolucion.pedidoVinculado.nroPedido}{!resolucion.esManual && " (probable)"}
    </span>;
    if (resolucion.candidatos.length>1 && canManageParts) return <Button type="button" variant="outline" size="sm"
      className="h-7 max-w-full gap-1 overflow-hidden px-1 text-[12px]" title={`Vincular: ${resolucion.candidatos.length} pedidos candidatos`}
      onClick={()=>setVinculando({sucursal:linea.sucursal,nroSolicitud:linea.nroSolicitud,item:linea.item,candidatos:resolucion.candidatos})}>
      <Link2 className="h-3 w-3" />Vincular ({resolucion.candidatos.length})
    </Button>;
    return <span className="text-muted-foreground" title="Sin pedido">Sin pedido</span>;
  };

  const exportOptions: TableExportOption[] = [
    {
      label: "Resumen de solicitudes",
      filename: `compras-solicitudes-${new Date().toISOString().slice(0, 10)}`,
      sheetName: "Solicitudes",
      rows: gruposOrdenados.map((grupo) => ({
        Sucursal: grupo.sucursal,
        "N° solicitud": grupo.nroSolicitud,
        "Fecha de emisión": grupo.fechaEmision ?? "",
        Solicitante: grupo.solicitante ?? "",
        Moneda: grupo.moneda ?? "",
        Ítems: grupo.lineas.length,
        "Valor total": grupo.lineas.reduce((sum, linea) => sum + linea.valorTotal, 0),
      })),
    },
    {
      label: "Ítems de solicitudes",
      filename: `compras-solicitudes-items-${new Date().toISOString().slice(0, 10)}`,
      sheetName: "Ítems",
      rows: gruposOrdenados.flatMap((grupo) => orderItems(grupo.lineas).map((linea) => {
        const resolucion = resolucionPorLinea.get(`${linea.sucursal}|${linea.nroSolicitud}|${linea.item}`);
        return {
          Sucursal: linea.sucursal,
          "N° solicitud": linea.nroSolicitud,
          Ítem: linea.item,
          "Fecha de emisión": linea.fechaEmision ?? "",
          Solicitante: linea.solicitante ?? "",
          Producto: linea.productoCodigo,
          "Código fabricante": linea.codigoFabricante ?? "",
          Marca: linea.marcaSolicitada ?? "",
          Descripción: linea.descripcion ?? "",
          Unidad: linea.unidad ?? "",
          Cantidad: linea.cantidad,
          "Precio unitario": linea.precioUnitario,
          Total: linea.valorTotal,
          Estado: resolucion?.estado === "reposicion_stock" ? "Reposición de stock" : "Cotizada",
          Pedido: resolucion?.pedidoVinculado
            ? `${resolucion.pedidoVinculado.sucursal}-${resolucion.pedidoVinculado.nroPedido}`
            : "",
          Observación: linea.observacion ?? "",
        };
      })),
    },
  ];

  const guardarVinculo = async (pedido: PedidoCandidato) => {
    if (!vinculando || !user) return;
    setGuardandoVinculo(true);
    try {
      const { error } = await (supabase.from("compras_solicitud_pedido_vinculo" as any).upsert(
        {
          sucursal: vinculando.sucursal,
          nro_solicitud: vinculando.nroSolicitud,
          item: vinculando.item,
          pedido_sucursal: pedido.sucursal,
          pedido_nro_pedido: pedido.nroPedido,
          vinculado_por: user.id,
          vinculado_en: new Date().toISOString(),
        },
        { onConflict: "sucursal,nro_solicitud,item" },
      ) as any);
      if (error) throw error;

      await vinculosQuery.refetch();
      toast.success("Vinculado.");
      setVinculando(null);
    } catch (e) {
      toast.error("Error vinculando: " + (e as Error).message);
    } finally {
      setGuardandoVinculo(false);
    }
  };

  const candidateCurrency = (pedido:PedidoCandidato) => pedidosLineasQuery.data?.find(linea=>
    linea.sucursal===pedido.sucursal && linea.nroPedido===pedido.nroPedido && linea.item===pedido.item)?.moneda;

  const queries = [solicitudesLineasQuery, pedidosLineasQuery, vinculosQuery];
  const loading = queries.some(query=>query.isLoading);
  if (loading) return <p className={metaText}>Cargando solicitudes…</p>;

  if (queries.some(query=>query.isError)) return <div role="alert" className="space-y-2">
    <p className={metaText}>No se pudieron cargar las solicitudes completas.</p>
    <Button variant="outline" size="sm" onClick={()=>void Promise.all(queries.map(query=>query.refetch()))}>Reintentar</Button>
  </div>;

  if (solicitudesAgrupadas.length === 0) {
    return <p className={metaText}>Todavía no se importó ninguna solicitud de compra.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <FiltersBar
          search={{ value: filtros.busqueda, onChange: (busqueda) => setFiltros((f) => ({ ...f, busqueda })), placeholder: "REPIN000406, 2181800, anillo…", width: "min-w-0 flex-1" }}
          activeCount={Number(Boolean(filtros.busqueda)) + Number(filtros.sucursales.length > 0) + Number(Boolean(filtros.nroSolicitud)) + Number(Boolean(filtros.solicitante))}
          onClear={() => setFiltros(FILTROS_VACIOS)}
          secondaryActions={can("datos:exportar") && !solicitudesLineasQuery.isError && !pedidosLineasQuery.isError ? <TableExportButton options={exportOptions} /> : undefined}
        >
          <FilterMultiSelect
            label="Sucursal"
            values={filtros.sucursales}
            onChange={(sucursales) => setFiltros((f) => ({ ...f, sucursales }))}
            placeholder="Todas"
            options={SUCURSALES.map((sucursal) => ({ value: sucursal, label: sucursal }))}
            width="w-40"
          />
          <FilterCustom label="N° Solicitud" width="w-32">
            <Input value={filtros.nroSolicitud} onChange={(e) => setFiltros((f) => ({ ...f, nroSolicitud: e.target.value }))} />
          </FilterCustom>
          <FilterCustom label="Solicitante" width="min-w-[160px] flex-1">
            <Input value={filtros.solicitante} onChange={(e) => setFiltros((f) => ({ ...f, solicitante: e.target.value }))} />
          </FilterCustom>
        </FiltersBar>

        {filtrosActivos && (
          <p className={metaText}>
            {gruposFiltrados.length} de {solicitudesAgrupadas.length} solicitudes.
          </p>
        )}

        <div className="overflow-hidden rounded-md border">
          <Table className="table-fixed" aria-label="Solicitudes de compra">
            <colgroup><col className="w-11 sm:w-[4%]" /><col className="hidden sm:table-column sm:w-[15%]" /><col className="w-auto sm:w-[16%]" />
              <col className="hidden sm:table-column sm:w-[15%]" /><col className="hidden sm:table-column sm:w-[42%]" /><col className="w-[58px] sm:w-[8%]" /></colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(purchaseHead, "max-sm:px-0")}><span className="sm:hidden"><CompactListOrderMenu label="solicitudes de compra" columns={columns} sort={{key:sortKey,direction:sortDir}} onSort={key=>toggleSort(key as SolicitudSortKey)} /></span></TableHead>
                {columns.map(column=><PurchaseTableHeading key={column.key} column={column} sort={{key:sortKey,direction:sortDir}}
                  onSort={key=>toggleSort(key as SolicitudSortKey)} className={["sucursal", "fechaEmision", "solicitante"].includes(column.key)?"hidden sm:table-cell":undefined} />)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {gruposOrdenados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isPhone ? 3 : 6} className={cn(metaText, "p-4 text-center")}>
                    Sin solicitudes para este filtro.
                  </TableCell>
                </TableRow>
              )}
              {gruposOrdenados.map((grupo) => {
                const key = rowKey(grupo);
                const isOpen = filtrosActivos ? true : expanded.has(key);
                const busquedaActiva = filtros.busqueda.trim().toLowerCase();
                const lineasVisibles = busquedaActiva
                  ? grupo.lineas.filter((linea) => lineaCoincideBusqueda(linea, busquedaActiva))
                  : grupo.lineas;

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
                        <button type="button" className="flex w-full justify-center max-sm:min-h-11 max-sm:items-center" aria-expanded={isOpen} disabled={filtrosActivos}
                          aria-label={`Ítems de la solicitud ${grupo.nroSolicitud} (${grupo.sucursal})`}>
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        </button>
                      </TableCell>
                      <TableCell className={cn(purchaseCell, "hidden sm:table-cell")} title={grupo.sucursal}>{grupo.sucursal}</TableCell>
                      <TableCell className={cn(purchaseCell,"font-mono")} title={`${grupo.nroSolicitud} · ${grupo.fechaEmision ?? "—"}`}><span className="sm:hidden"><MobileRecord primary={grupo.nroSolicitud} secondary={grupo.solicitante || "Sin solicitante"} context={grupo.sucursal} /></span><span className="hidden sm:inline">{grupo.nroSolicitud}</span></TableCell>
                      <TableCell className={cn(purchaseCell,"hidden text-muted-foreground sm:table-cell")} title={grupo.fechaEmision ?? "—"}>
                        {grupo.fechaEmision ?? "—"}
                      </TableCell>
                      <TableCell className={cn(purchaseCell, "hidden sm:table-cell")} title={grupo.solicitante ?? "—"}>{grupo.solicitante ?? "—"}</TableCell>
                      <TableCell className={cn(purchaseCell,"text-center tabular-nums")}>
                        {busquedaActiva ? `${lineasVisibles.length} / ${grupo.lineas.length}` : grupo.lineas.length}
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={isPhone ? 3 : 6} className="bg-muted/30 p-0">
                          <Table className="table-fixed" aria-label={`Ítems de la solicitud ${grupo.nroSolicitud}`}>
                            <colgroup>{["hidden sm:table-column sm:w-[5%]","w-auto sm:w-[18%]","hidden sm:table-column sm:w-[29%]","w-[60px] sm:w-[8%]","w-[92px] sm:w-[12%]","hidden sm:table-column sm:w-[14%]","hidden sm:table-column sm:w-[14%]"].map((width,index)=><col key={index} className={width} />)}</colgroup>
                            <TableHeader>
                              <TableRow>
                                {itemColumns.map(column=><PurchaseTableHeading key={column.key} column={column} sort={itemSort} onSort={toggleItemSort}
                                  actions={isPhone && column.key === "producto" ? <CompactListOrderMenu label={`ítems de la solicitud ${grupo.nroSolicitud}`} columns={itemColumns} sort={itemSort} onSort={toggleItemSort} /> : undefined}
                                  className={["item","descripcion","estado","pedido"].includes(column.key)?"hidden sm:table-cell":undefined} />)}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {orderItems(lineasVisibles).map((linea) => {
                                const resolucion = resolucionPorLinea.get(`${linea.sucursal}|${linea.nroSolicitud}|${linea.item}`);

                                return (
                                  <TableRow key={linea.item}>
                                    <TableCell className={cn(purchaseCell,"hidden sm:table-cell")} title={linea.item}>{linea.item}</TableCell>
                                    <TableCell className={cn(purchaseCell,"font-mono")} title={linea.productoCodigo}>
                                      <PurchaseInfo label={linea.productoCodigo} mobileSummary={<MobileRecord primary={linea.descripcion || "Sin descripción"} secondary={linea.productoCodigo} context={resolucion?.estado === "reposicion_stock" ? "Reposición" : "Cotizada"} />} fields={[["Ítem",linea.item],["Descripción",linea.descripcion??"—"],["Cantidad",purchaseQuantity.format(linea.cantidad)],["Unidad",linea.unidad??"—"],["P. unit.",linea.precioUnitario>0?purchaseMoney(linea.precioUnitario,linea.moneda):"—"],["Estado",resolucion?.estado==="reposicion_stock"?"Reposición de stock":"Cotizada"],["Moneda",linea.moneda??"No informada"]]}>
                                        {renderPedidoLink(linea)}
                                      </PurchaseInfo>
                                    </TableCell>
                                    <TableCell className={cn(purchaseCell, "hidden sm:table-cell")} title={linea.descripcion ?? "—"}>{linea.descripcion ?? "—"}</TableCell>
                                    <TableCell className={cn(purchaseCell,"text-center tabular-nums")} title={`${linea.cantidad} ${linea.unidad ?? ""}`}>
                                      {purchaseQuantity.format(linea.cantidad)}
                                    </TableCell>
                                    <TableCell className={cn(purchaseCell,"text-right tabular-nums")} title={`${linea.moneda ?? ""} ${linea.precioUnitario}`}>
                                      {linea.precioUnitario > 0
                                        ? purchaseMoney(linea.precioUnitario,linea.moneda)
                                        : "—"}
                                    </TableCell>
                                    <TableCell className={cn(purchaseCell,"hidden sm:table-cell")} title={resolucion?.estado === "reposicion_stock" ? "Reposición de stock" : "Cotizada"}>
                                      {resolucion?.estado === "reposicion_stock" ? (
                                        <Badge variant="outline" className="max-w-full overflow-hidden whitespace-nowrap bg-muted text-muted-foreground">
                                          <span className="truncate">Reposición</span>
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="max-w-full overflow-hidden whitespace-nowrap border-primary/30 bg-primary/5 text-primary">
                                          Cotizada
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className={cn(purchaseCell,"hidden sm:table-cell")}>{renderPedidoLink(linea)}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
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

      <Dialog open={canManageParts && vinculando !== null} onOpenChange={(open) => !open && setVinculando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elegir el pedido correspondiente</DialogTitle>
          </DialogHeader>

          <p className={metaText}>
            Hay más de un pedido candidato (mismo producto, misma sucursal, precio parecido) — elegí cuál corresponde
            a esta solicitud.
          </p>

          <div className="space-y-2">
            {vinculando?.candidatos.map((candidato) => (
              <button
                key={`${candidato.sucursal}-${candidato.nroPedido}-${candidato.item}`}
                type="button"
                disabled={guardandoVinculo}
                onClick={() => guardarVinculo(candidato)}
                className="flex w-full items-center justify-between rounded-md border p-2 text-left text-[12px] hover:bg-muted/50"
              >
                <span className="font-mono">
                  {candidato.sucursal}-{candidato.nroPedido}
                </span>
                <span className="text-muted-foreground">{candidato.fecha}</span>
                <span className="font-medium" title={`Moneda: ${candidateCurrency(candidato) ?? "No informada"}`}>{purchaseMoney(candidato.precioUnitario,candidateCurrency(candidato))}</span>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVinculando(null)} disabled={guardandoVinculo}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

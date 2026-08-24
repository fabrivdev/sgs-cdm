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
  const { user, can } = useAuth();
  const canManageParts = can("repuestos:gestionar");
  const pedidosLineasQuery = useComprasPedidosLineas();
  const solicitudesLineasQuery = useComprasSolicitudesLineas();
  const vinculosQuery = useComprasVinculos();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const { sortKey, sortDir, toggleSort, sortIcon } = useSortable<SolicitudSortKey>("fechaEmision", "desc");
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

  const gruposOrdenados = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...gruposFiltrados].sort((a, b) => {
      switch (sortKey) {
        case "sucursal":
          return a.sucursal.localeCompare(b.sucursal) * dir;
        case "nroSolicitud":
          return a.nroSolicitud.localeCompare(b.nroSolicitud) * dir;
        case "fechaEmision":
          return (a.fechaEmision ?? "").localeCompare(b.fechaEmision ?? "") * dir;
        case "solicitante":
          return (a.solicitante ?? "").localeCompare(b.solicitante ?? "") * dir;
        case "itemsCount":
          return (a.lineas.length - b.lineas.length) * dir;
        default:
          return 0;
      }
    });
  }, [gruposFiltrados, sortKey, sortDir]);

  const exportOptions = useMemo<TableExportOption[]>(() => [
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
      rows: gruposOrdenados.flatMap((grupo) => grupo.lineas.map((linea) => {
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
  ], [gruposOrdenados, resolucionPorLinea]);

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

  const loading = solicitudesLineasQuery.isLoading || pedidosLineasQuery.isLoading || vinculosQuery.isLoading;
  if (loading) return <p className={metaText}>Cargando solicitudes…</p>;

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
          actions={<TableExportButton options={exportOptions} />}
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

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("sucursal")}>
                  <div className="flex items-center gap-1">Sucursal {sortIcon("sucursal")}</div>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("nroSolicitud")}>
                  <div className="flex items-center gap-1">N° Solicitud {sortIcon("nroSolicitud")}</div>
                </TableHead>
                <TableHead
                  className="hidden cursor-pointer select-none sm:table-cell"
                  onClick={() => toggleSort("fechaEmision")}
                >
                  <div className="flex items-center gap-1">Fecha {sortIcon("fechaEmision")}</div>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("solicitante")}>
                  <div className="flex items-center gap-1">Solicitante {sortIcon("solicitante")}</div>
                </TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("itemsCount")}>
                  <div className="flex items-center justify-end gap-1">Ítems {sortIcon("itemsCount")}</div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gruposOrdenados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className={cn(metaText, "p-4 text-center")}>
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
                      <TableCell>
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="text-[12px]">{grupo.sucursal}</TableCell>
                      <TableCell className="font-mono text-[12px]">{grupo.nroSolicitud}</TableCell>
                      <TableCell className="hidden text-[12px] text-muted-foreground sm:table-cell">
                        {grupo.fechaEmision ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-[12px]">{grupo.solicitante ?? "—"}</TableCell>
                      <TableCell className="text-right text-[12px]">
                        {busquedaActiva ? `${lineasVisibles.length} / ${grupo.lineas.length}` : grupo.lineas.length}
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="pl-8">Ítem</TableHead>
                                <TableHead>Producto</TableHead>
                                <TableHead>Descripción</TableHead>
                                <TableHead className="text-right">Cantidad</TableHead>
                                <TableHead className="text-right">Precio</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Pedido</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lineasVisibles.map((linea) => {
                                const resolucion = resolucionPorLinea.get(`${linea.sucursal}|${linea.nroSolicitud}|${linea.item}`);

                                return (
                                  <TableRow key={linea.item}>
                                    <TableCell className="pl-8 text-[12px]">{linea.item}</TableCell>
                                    <TableCell className="font-mono text-[12px]">{linea.productoCodigo}</TableCell>
                                    <TableCell className="max-w-[200px] truncate text-[12px]">{linea.descripcion ?? "—"}</TableCell>
                                    <TableCell className="text-right text-[12px]">
                                      {linea.cantidad} {linea.unidad ?? ""}
                                    </TableCell>
                                    <TableCell className="text-right text-[12px]">
                                      {linea.precioUnitario > 0
                                        ? linea.precioUnitario.toLocaleString("es-PY", { maximumFractionDigits: 2 })
                                        : "—"}
                                    </TableCell>
                                    <TableCell>
                                      {resolucion?.estado === "reposicion_stock" ? (
                                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                                          Reposición de stock
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                                          Cotizada
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-[12px]">
                                      {!resolucion || resolucion.estado === "reposicion_stock" ? (
                                        "—"
                                      ) : resolucion.pedidoVinculado ? (
                                        <span
                                          className={cn("font-mono", !resolucion.esManual && "text-muted-foreground")}
                                          title={resolucion.esManual ? "Vinculado a mano" : "Sugerido por producto, sucursal y precio parecido"}
                                        >
                                          {resolucion.pedidoVinculado.sucursal}-{resolucion.pedidoVinculado.nroPedido}
                                          {!resolucion.esManual && " (probable)"}
                                        </span>
                                      ) : resolucion.candidatos.length > 1 && canManageParts ? (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-6 gap-1 px-2 text-[11px]"
                                          onClick={() =>
                                            setVinculando({
                                              sucursal: linea.sucursal,
                                              nroSolicitud: linea.nroSolicitud,
                                              item: linea.item,
                                              candidatos: resolucion.candidatos,
                                            })
                                          }
                                        >
                                          <Link2 className="h-3 w-3" />
                                          Vincular ({resolucion.candidatos.length})
                                        </Button>
                                      ) : (
                                        <span className="text-muted-foreground">Sin pedido asociado</span>
                                      )}
                                    </TableCell>
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
                <span className="font-medium">{candidato.precioUnitario.toLocaleString("es-PY", { maximumFractionDigits: 2 })}</span>
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

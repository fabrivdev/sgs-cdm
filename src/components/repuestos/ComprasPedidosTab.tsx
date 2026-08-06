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
import { Card, CardContent } from "@/components/ui/card";
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
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { resolverSolicitudes, solicitudesPorPedido } from "@/lib/imports";
import { SUCURSALES } from "@/lib/constants";
import { metaText } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

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
  sucursal: string;
  nroPedido: string;
  proveedor: string;
}

const FILTROS_VACIOS: Filtros = { busqueda: "", sucursal: "", nroPedido: "", proveedor: "" };

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
      const { data, error } = await (supabase.from("v_compras_pedidos_resumen" as any) as any)
        .select("*")
        .order("fecha_emision", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PedidoResumenRow[];
    },
  });
}

export function ComprasPedidosTab() {
  const { user } = useAuth();
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

  const filtrosActivos = Boolean(filtros.busqueda || filtros.sucursal || filtros.nroPedido || filtros.proveedor);

  const filasFiltradas = useMemo(() => {
    const rows = resumenQuery.data ?? [];
    if (!filtrosActivos) return rows;

    const busqueda = filtros.busqueda.trim().toLowerCase();
    const fabricanteMap = fabricanteMapQuery.data;

    return rows.filter((row) => {
      if (filtros.sucursal && row.sucursal !== filtros.sucursal) return false;
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

  const loading = resumenQuery.isLoading || pedidosLineasQuery.isLoading;
  if (loading) return <p className={metaText}>Cargando pedidos…</p>;

  if (!resumenQuery.data || resumenQuery.data.length === 0) {
    return <p className={metaText}>Todavía no se importó ningún pedido de compra.</p>;
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label className="text-[11px]">Buscar (código, fabricante, descripción)</Label>
            <Input
              value={filtros.busqueda}
              onChange={(e) => setFiltros((f) => ({ ...f, busqueda: e.target.value }))}
              placeholder="REPIN003187, 06673230, casquillo…"
              className="h-8 text-xs"
            />
          </div>
          <div className="w-40 space-y-1">
            <Label className="text-[11px]">Sucursal</Label>
            <Select value={filtros.sucursal || "todas"} onValueChange={(v) => setFiltros((f) => ({ ...f, sucursal: v === "todas" ? "" : v }))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {SUCURSALES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-32 space-y-1">
            <Label className="text-[11px]">N° Pedido</Label>
            <Input
              value={filtros.nroPedido}
              onChange={(e) => setFiltros((f) => ({ ...f, nroPedido: e.target.value }))}
              className="h-8 text-xs"
            />
          </div>
          <div className="min-w-[160px] flex-1 space-y-1">
            <Label className="text-[11px]">Proveedor</Label>
            <Input
              value={filtros.proveedor}
              onChange={(e) => setFiltros((f) => ({ ...f, proveedor: e.target.value }))}
              className="h-8 text-xs"
            />
          </div>
          {filtrosActivos && (
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setFiltros(FILTROS_VACIOS)}>
              <X className="mr-1 h-3.5 w-3.5" />
              Limpiar
            </Button>
          )}
        </div>

        {filtrosActivos && (
          <p className={metaText}>
            {filasFiltradas.length} de {resumenQuery.data.length} pedidos.
          </p>
        )}

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Sucursal</TableHead>
                <TableHead>N° Pedido</TableHead>
                <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead className="text-right">Ítems</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Seguimiento</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filasFiltradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className={cn(metaText, "p-4 text-center")}>
                    Sin pedidos para este filtro.
                  </TableCell>
                </TableRow>
              )}
              {filasFiltradas.map((row) => {
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
                      <TableCell>
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{row.sucursal ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.nro_pedido}</TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                        {row.fecha_emision ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs">{row.proveedor_nombre ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">
                        {busquedaActiva ? `${lineas.length} / ${row.cantidad_items}` : row.cantidad_items}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {row.moneda ?? ""} {Number(row.valor_total ?? 0).toLocaleString("es-PY", { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-medium",
                            ESTADO_STYLES[row.estado_seguimiento as (typeof ESTADOS_SEGUIMIENTO)[number]] ?? ESTADO_STYLES["Sin gestionar"],
                          )}
                        >
                          {row.estado_seguimiento}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirEdicion(row);
                          }}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-muted/30 p-0">
                          {lineas.length === 0 && <p className={cn(metaText, "p-3")}>Sin ítems para este pedido.</p>}
                          {lineas.length > 0 && (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="pl-8">Ítem</TableHead>
                                  <TableHead>Producto</TableHead>
                                  <TableHead>Descripción</TableHead>
                                  <TableHead className="text-right">Cantidad</TableHead>
                                  <TableHead className="text-right">Precio unit.</TableHead>
                                  <TableHead className="text-right">Total</TableHead>
                                  <TableHead className="text-right">Pendiente</TableHead>
                                  <TableHead>Solicitud</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {lineas.map((linea) => {
                                  const solicitudes = solicitudesPorPedidoMap.get(
                                    `${linea.sucursal}|${linea.nroPedido}|${linea.item}`,
                                  ) as { sucursal: string; nroSolicitud: string; esManual: boolean }[] | undefined;

                                  return (
                                    <TableRow key={linea.item}>
                                      <TableCell className="pl-8 text-xs">{linea.item}</TableCell>
                                      <TableCell className="font-mono text-xs">{linea.productoCodigo}</TableCell>
                                      <TableCell className="max-w-[220px] truncate text-xs">{linea.descripcion ?? "—"}</TableCell>
                                      <TableCell className="text-right text-xs">
                                        {linea.cantidad} {linea.unidad ?? ""}
                                      </TableCell>
                                      <TableCell className="text-right text-xs">
                                        {linea.precioUnitario.toLocaleString("es-PY", { maximumFractionDigits: 2 })}
                                      </TableCell>
                                      <TableCell className="text-right text-xs font-medium">
                                        {linea.valorTotal.toLocaleString("es-PY", { maximumFractionDigits: 2 })}
                                      </TableCell>
                                      <TableCell
                                        className={cn(
                                          "text-right text-xs",
                                          linea.cantidadPendiente > 0 && "font-semibold text-amber-700",
                                        )}
                                      >
                                        {linea.cantidadPendiente}
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        {!solicitudes || solicitudes.length === 0 ? (
                                          <span className="text-muted-foreground">—</span>
                                        ) : (
                                          solicitudes.map((s) => (
                                            <span
                                              key={`${s.sucursal}-${s.nroSolicitud}`}
                                              className="mr-1.5 inline-block font-mono"
                                              title={s.esManual ? "Vinculada a mano" : "Sugerida por producto, sucursal y precio parecido"}
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
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
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
    </Card>
  );
}

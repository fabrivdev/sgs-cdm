import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cargarTodo } from "@/hooks/useCatalogos";
import type { PedidoCandidato, SolicitudLineaCompleta, VinculoManualExistente } from "@/lib/imports";

const STALE_TIME = 5 * 60 * 1000;

export interface PedidoLinea extends PedidoCandidato {
  proveedorCodigo: string | null;
  proveedorNombre: string | null;
  moneda: string | null;
  descripcion: string | null;
  unidad: string | null;
  cantidad: number;
  valorTotal: number;
  cantidadEntregada: number | null;
  cantidadPendiente: number | null;
}

export function useComprasPedidosLineas() {
  return useQuery({
    queryKey: ["compras", "pedidos_lineas"],
    staleTime: STALE_TIME,
    queryFn: async () => {
      const rows = await cargarTodo<any>(
        (supabase.from("compras_pedidos" as any) as any)
          .select(
            "sucursal, nro_pedido, item, fecha_emision, proveedor_codigo, proveedor_nombre, moneda, producto_codigo, descripcion, unidad, cantidad, precio_unitario, valor_total, cantidad_entregada, cantidad_pendiente",
          )
          .ilike("producto_codigo", "REP%").order("sucursal").order("nro_pedido").order("item"),
      );

      return rows.map(
        (r): PedidoLinea => ({
          sucursal: r.sucursal,
          nroPedido: r.nro_pedido,
          item: r.item,
          productoCodigo: r.producto_codigo,
          fecha: r.fecha_emision,
          precioUnitario: Number(r.precio_unitario || 0),
          proveedorCodigo: r.proveedor_codigo,
          proveedorNombre: r.proveedor_nombre,
          moneda: r.moneda,
          descripcion: r.descripcion,
          unidad: r.unidad,
          cantidad: Number(r.cantidad || 0),
          valorTotal: Number(r.valor_total || 0),
          cantidadEntregada: r.cantidad_entregada == null ? null : Number(r.cantidad_entregada),
          cantidadPendiente: r.cantidad_pendiente == null ? null : Number(r.cantidad_pendiente),
        }),
      );
    },
  });
}

export interface SolicitudLinea extends SolicitudLineaCompleta {
  solicitante: string | null;
  moneda: string | null;
  codigoFabricante: string | null;
  marcaSolicitada: string | null;
  descripcion: string | null;
  unidad: string | null;
  cantidad: number;
  valorTotal: number;
  observacion: string | null;
  cantidadEnPedido?: number | null;
  cantidadPendiente?: number | null;
  medioTransporte?: string | null;
}

export function useComprasSolicitudesLineas() {
  return useQuery({
    queryKey: ["compras", "solicitudes_lineas"],
    staleTime: STALE_TIME,
    queryFn: async () => {
      const baseFields = "sucursal, nro_solicitud, item, fecha_emision, solicitante, moneda, producto_codigo, codigo_fabricante, marca_solicitada, descripcion, unidad, cantidad, precio_unitario, valor_total, observacion";
      const read = (fields: string) => cargarTodo<any>(
        supabase.from("compras_solicitudes").select(fields)
          .ilike("producto_codigo", "REP%").order("sucursal").order("nro_solicitud").order("item"),
      );
      const rows = await read(`${baseFields}, cantidad_en_pedido, cantidad_pendiente, medio_transporte`).catch(error => {
        if (error?.code === "42703") return read(baseFields);
        throw error;
      });

      return rows.map(
        (r): SolicitudLinea => ({
          sucursal: r.sucursal,
          nroSolicitud: r.nro_solicitud,
          item: r.item,
          productoCodigo: r.producto_codigo,
          fechaEmision: r.fecha_emision,
          precioUnitario: Number(r.precio_unitario || 0),
          solicitante: r.solicitante,
          moneda: r.moneda,
          codigoFabricante: r.codigo_fabricante,
          marcaSolicitada: r.marca_solicitada,
          descripcion: r.descripcion,
          unidad: r.unidad,
          cantidad: Number(r.cantidad || 0),
          valorTotal: Number(r.valor_total || 0),
          observacion: r.observacion,
          cantidadEnPedido: r.cantidad_en_pedido == null ? null : Number(r.cantidad_en_pedido),
          cantidadPendiente: r.cantidad_pendiente == null ? null : Number(r.cantidad_pendiente),
          medioTransporte: r.medio_transporte ?? null,
        }),
      );
    },
  });
}

export function useComprasVinculos() {
  return useQuery({
    queryKey: ["compras", "vinculos"],
    staleTime: STALE_TIME,
    queryFn: async () => {
      const { data, error } = await (supabase.from("compras_solicitud_pedido_vinculo" as any) as any).select("*");
      if (error) throw error;

      return ((data ?? []) as any[]).map(
        (v): VinculoManualExistente => ({
          sucursal: v.sucursal,
          nroSolicitud: v.nro_solicitud,
          item: v.item,
          pedidoSucursal: v.pedido_sucursal,
          pedidoNroPedido: v.pedido_nro_pedido,
        }),
      );
    },
  });
}

/** codigo_interno -> codigo_fabricante, para buscar pedidos por fabricante (compras_pedidos no trae ese campo, solo el maestro). */
export function useProductosFabricanteMap() {
  return useQuery({
    queryKey: ["compras", "productos_fabricante_map"],
    staleTime: STALE_TIME,
    queryFn: async () => {
      const rows = await cargarTodo<{ codigo_interno: string; codigo_fabricante: string | null }>(
        (supabase.from("productos" as any) as any).select("codigo_interno, codigo_fabricante").ilike("codigo_interno", "REP%"),
      );

      const map = new Map<string, string | null>();
      for (const row of rows) map.set(row.codigo_interno, row.codigo_fabricante);
      return map;
    },
  });
}

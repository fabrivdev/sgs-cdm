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
  cantidadEntregada: number;
  cantidadPendiente: number;
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
          .ilike("producto_codigo", "REP%"),
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
          cantidadEntregada: Number(r.cantidad_entregada || 0),
          cantidadPendiente: Number(r.cantidad_pendiente || 0),
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
}

export function useComprasSolicitudesLineas() {
  return useQuery({
    queryKey: ["compras", "solicitudes_lineas"],
    staleTime: STALE_TIME,
    queryFn: async () => {
      const rows = await cargarTodo<any>(
        (supabase.from("compras_solicitudes" as any) as any)
          .select(
            "sucursal, nro_solicitud, item, fecha_emision, solicitante, moneda, producto_codigo, codigo_fabricante, marca_solicitada, descripcion, unidad, cantidad, precio_unitario, valor_total, observacion",
          )
          .ilike("producto_codigo", "REP%"),
      );

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

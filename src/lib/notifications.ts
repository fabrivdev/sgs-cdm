import type { Json } from "@/integrations/supabase/types";

export type MachineSaleNotificationData = {
  facturacion_linea_id?: string | null;
  factura?: string | null;
  fecha_factura?: string | null;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  marca?: "CLAAS" | "HORSCH" | null;
  chasis?: string | null;
  modelo_tipo?: string | null;
  subgrupo?: string | null;
  sucursal?: string | null;
  vendedor?: string | null;
  producto_codigo?: string | null;
  producto?: string | null;
  origen_sistema?: string | null;
  parque_maquina_id?: string | null;
  parque_activa?: boolean | null;
  cliente_actual_id?: string | null;
  cliente_actual_nombre?: string | null;
  nc_linea_id?: string | null;
  nc_documento?: string | null;
  nc_factura_original?: string | null;
  nc_fecha?: string | null;
  nc_cliente_id?: string | null;
  nc_cliente_nombre?: string | null;
  revision_sugerida?: "ALTA" | "REINGRESO" | "REFACTURACION_PROBABLE" | "TRANSFERENCIA" | null;
};

export type MachineStockReturnNotificationData = {
  carga_id?: string | null;
  stock_id?: string | null;
  stock_key?: string | null;
  producto_codigo?: string | null;
  stock_sucursal?: string | null;
  stock_deposito?: string | null;
  stock_tipo?: string | null;
  stock_marca?: string | null;
  stock_modelo?: string | null;
  stock_estado?: string | null;
  saldo_actual?: number | null;
  chasis?: string | null;
  parque_maquina_id?: string | null;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  parque_sucursal?: string | null;
  parque_marca?: string | null;
  parque_modelo?: string | null;
  destino?: string | null;
};

export type AppNotification = {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string | null;
  datos: Json;
  estado: "pendiente" | "confirmada" | "descartada";
  visto_por: string[] | null;
  creado_en: string;
};

export function machineSaleNotificationData(notification: AppNotification): MachineSaleNotificationData {
  if (!notification.datos || Array.isArray(notification.datos) || typeof notification.datos !== "object") return {};
  return notification.datos as MachineSaleNotificationData;
}

export function machineSaleConfirmationClientId(
  data: MachineSaleNotificationData,
  selectedClientId: string | null | undefined,
  confirmationType: "VENTA" | "REFACTURACION",
) {
  if (confirmationType === "REFACTURACION") {
    return data.cliente_actual_id ?? selectedClientId ?? "";
  }
  return selectedClientId ?? "";
}

export function machineStockReturnNotificationData(notification: AppNotification): MachineStockReturnNotificationData {
  if (!notification.datos || Array.isArray(notification.datos) || typeof notification.datos !== "object") return {};
  return notification.datos as MachineStockReturnNotificationData;
}

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
  producto_codigo?: string | null;
  producto?: string | null;
  origen_sistema?: string | null;
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

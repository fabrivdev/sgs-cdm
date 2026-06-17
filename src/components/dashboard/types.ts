import type { Marca, Sucursal } from "@/lib/constants";

export type Tone = "neutral" | "good" | "warn" | "bad";
export type FactMetric = "usd" | "horasServicio" | "kmFacturados";
export type OSMetric = "usd" | "horas" | "km";
export type OSRubro = "Servicio" | "Repuestos" | "Kilometraje";
export type Concepto = "Repuestos" | "Servicio" | "Kilometraje" | "Otros";

export interface Facturacion {
  fecha: string;
  sucursal: Sucursal | null;
  tipo: "Repuesto" | "Servicio";
  cliente_id: string | null;
  entidad_nombre: string;
  total_venta: number;
  cantidad: number;
  grupo: string | null;
  grupo_fx: string | null;
  cod_factura: string;
  tipo_tiempo: "Cliente" | "Garantia" | "Interno";
  origen_sistema?: string | null;
  raw_data?: Record<string, unknown> | null;
}

export interface OSImpactRow {
  os: string;
  cliente: string;
  fecha: string;
  sucursal: Sucursal | null;
  marca: Marca;
  tipo: "Garantia" | "Interno";
  situacionFacturacion: string;
  problema: string;
  factura: string;
  horas: number;
  km: number;
  servicios: number;
  repuestos: number;
  kilometraje: number;
  terceros: number;
  total: number;
}

export interface WeekRow {
  key: string;
  label: string;
  start: Date;
  end: Date;
  total: number;
  repuestos: number;
  servicio: number;
  kilometraje: number;
  otros: number;
  horasServicio: number;
  kmFacturados: number;
  facturas: number;
  clientes: number;
  comparisonTotal: number;
  comparisonHorasServicio: number;
  comparisonKmFacturados: number;
  comparisonLabel: string;
  variacion: number | null;
  rows: Facturacion[];
}

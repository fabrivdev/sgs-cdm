import type { Marca, Sucursal } from "@/lib/constants";

export type Tone = "neutral" | "good" | "warn" | "bad";
export type PeriodMode = "dia" | "semana" | "mes" | "anio";
export type FactMetric = "usd" | "horasServicio" | "kmFacturados";
export type OSMetric = "usd" | "horas" | "km";
export type OSSucursalMetric = "interno" | "garantia" | "total";
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
  codigo_fabricante?: string | null;
  cod_mercaderia?: string | null;
  mercaderia?: string | null;
  cod_factura: string;
  tipo_tiempo: "Cliente" | "Garantia" | "Interno";
  marca?: Marca | null;
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

export interface ServicioTecnicoRow {
  tecnico: string;
  totalOS: number;
  cerradas: number;
  abiertas: number;
  otras: number;
  horas: number;
  km: number;
  valorOS: number;
}

export interface ServicioOSRow {
  key: string;
  os: string;
  tecnico: string;
  cliente: string;
  sucursal: Sucursal | null;
  marca: Marca;
  tipoTiempo: string;
  fechaApertura: string | null;
  estadoOS: string;
  estadoFacturacion: string;
  factura: string;
  problema: string;
  horas: number;
  km: number;
  valorOS: number;
}

export interface ServiciosDashboardData {
  totalOS: number;
  cerradas: number;
  abiertas: number;
  otras: number;
  sinResponsable: number;
  horas: number;
  km: number;
  valorOS: number;
  tecnicos: ServicioTecnicoRow[];
  ordenes: ServicioOSRow[];
  estados: Array<{ label: string; total: number }>;
  mixTiempo: Array<{ label: string; total: number }>;
}


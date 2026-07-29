import type { Marca, Sucursal } from "@/lib/constants";

export type Tone = "neutral" | "good" | "warn" | "bad";
export type PeriodMode = "dia" | "semana" | "mes" | "anio";
export type FactMetric = "usd" | "horasServicio" | "kmFacturados";
export type OSMetric = "usd" | "horas" | "km";
export type OSSucursalMetric = "interno" | "garantia" | "total";
export type OSRubro = "Servicio" | "Repuestos" | "Kilometraje";
export type Concepto = "Repuestos" | "Servicio" | "Kilometraje" | "Maquinarias" | "Otros";

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
  maquinarias: number;
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

export interface ServicioTecnicoPeriodoRow {
  key: string;
  label: string;
  dateFrom: string;
  dateTo: string;
  totalOS: number;
  cerradas: number;
  abiertas: number;
  otras: number;
  horas: number;
  metaHoras: number;
  productividad: number;
}

export interface ServicioTecnicoRow {
  profileId: string | null;
  tecnico: string;
  activo: boolean;
  totalOS: number;
  cerradas: number;
  abiertas: number;
  otras: number;
  horas: number;
  horasDesdeDetalle: number;
  horasDesdeOS: number;
  km: number;
  valorOS: number;
  evolucion: ServicioTecnicoPeriodoRow[];
}

export interface ServicioOSRow {
  key: string;
  os: string;
  tecnico: string;
  tecnicoProfileId: string | null;
  cliente: string;
  sucursal: Sucursal | null;
  marca: Marca;
  tipoTiempo: string;
  fechaApertura: string | null;
  estadoOS: string;
  estadoFacturacion: string;
  origen: string;
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
  /** Duración total de las OS, contada una sola vez por orden. */
  horas: number;
  /** Horas atribuidas a participantes; una OS de 10 h con dos técnicos suma 20 h-persona. */
  horasPersona: number;
  /** Parte de las horas-persona tomada de detalle individual de TOTVS. */
  horasPersonaDesdeDetalle: number;
  /** Parte de las horas-persona heredada del total de la OS. */
  horasPersonaDesdeOS: number;
  km: number;
  valorOS: number;
  metaHorasMensual: number;
  metaHorasPeriodo: number;
  capacidad: {
    tecnicosBase: number;
    horasDisponibles: number;
    horasUtilizadas: number;
    porcentaje: number;
    base: "equipo_activo" | "participantes_filtrados";
  };
  tecnicos: ServicioTecnicoRow[];
  ordenes: ServicioOSRow[];
  estados: Array<{ label: string; total: number }>;
  mixTiempo: Array<{ label: string; total: number }>;
  evolucion: Array<{
    key: string;
    label: string;
    dateFrom: string;
    dateTo: string;
    cerradas: number;
    abiertas: number;
    otras: number;
    horasOS: number;
    horasPersona: number;
    tecnicosBase: number;
    horasDisponibles: number;
    utilizacion: number;
  }>;
  sucursales: Array<{ sucursal: string; cerradas: number; abiertas: number; otras: number; total: number }>;
}


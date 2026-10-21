import type { SectionKey } from '@/lib/permissions';

export type StoryTopicId = 'ventas_evolucion' | 'ventas_facturacion' | 'ventas_neto_anual' | 'ventas_nc_impacto' | 'ventas_repuestos' | 'repuestos_sucursales' | 'repuestos_stock' | 'repuestos_alertas' | 'repuestos_concentracion' | 'repuestos_rojo' | 'repuestos_demanda' | 'maquinas_pedidos' | 'maquinas_pedidos_stock' | 'maquinas_stock' | 'maquinas_proyeccion' | 'maquinas_importacion' | 'maquinas_parque' | 'servicios_pendientes' | 'servicios_abiertas' | 'servicios_os_antiguas' | 'servicios_os_facturadas' | 'servicios_trabajo' | 'servicios_agenda' | 'servicios_comisiones' | 'agenda_cumplimiento' | 'servicios_productividad' | 'servicios_eficiencia' | 'clientes_retencion' | 'clientes_cobertura_posventa' | 'ventas_servicios' | 'ventas_maquinas' | 'repuestos_clientes' | 'repuestos_reposicion';
export type StoryPeriod = 'month' | 'ytd';
export type StoryUnit = 'USD' | 'PYG' | 'count' | 'percent' | 'days';
export type StoryDatum = { label: string; value: number | null; unit: StoryUnit; note?: string; comparison?: { value: number; label: string } };
export type StoryChartRow = { label: string; value: number; previous?: number };
export type StoryBreakdown = { label: string; value: number; unit: StoryUnit; route?: string; note?: string; group?: string; previous?: number; billing?: { sales: number; credits: number } };
export type PanoramaStory = {
  id: StoryTopicId;
  periodMode?: StoryPeriod;
  periodOptions?: readonly StoryPeriod[];
  title: string;
  question: string;
  status: 'ready' | 'empty' | 'error';
  message: string;
  scope: string;
  sections: SectionKey[];
  cutoff: string | null;
  periodLabel: string;
  visitKey?: string;
  primary: StoryDatum | null;
  supporting: StoryDatum[];
  chart: { kind: 'trend' | 'bars'; title: string; rows: StoryChartRow[]; unit: StoryUnit; currentLabel?: string; previousLabel?: string } | null;
  detailChart?: PanoramaStory['chart'];
  secondaryCharts?: NonNullable<PanoramaStory['chart']>[];
  breakdown: StoryBreakdown[];
  details: string[];
  source: string;
  route: string;
  navigationPeriod?: { from: string; to: string };
  attention?: boolean;
  notices?: { text: string; route: string }[];
  machineOrders?: {
    asOf: string;
    orders: number;
    units: number;
    stock: number;
    arrived: number;
    transit: number;
    unlinked: number;
    readyUnits: number;
    billedUnits: number;
    ready: { id: string; units: number }[];
    unresolved: { id: string; units: number }[];
  };
  openOrders?: {
    asOf: string;
    count: number;
    brands: { name: string; count: number }[];
    ages: { label: string; count: number }[];
    ids: string[];
  };
};

export type StoryLoader = (topics: readonly StoryTopicId[], granted: readonly SectionKey[], asOf: string, period?: StoryPeriod) => Promise<PanoramaStory[]>;

import type { SectionKey } from '@/lib/permissions';

export type StoryTopicId = 'ventas_evolucion' | 'ventas_facturacion' | 'repuestos_clientes' | 'repuestos_sucursales' | 'repuestos_stock' | 'repuestos_alertas' | 'repuestos_concentracion' | 'maquinas_pedidos' | 'maquinas_stock' | 'maquinas_proyeccion' | 'servicios_pendientes' | 'servicios_abiertas';
export type StoryUnit = 'USD' | 'PYG' | 'count' | 'percent' | 'days';
export type StoryDatum = { label: string; value: number | null; unit: StoryUnit; note?: string; comparison?: { value: number; label: string } };
export type StoryChartRow = { label: string; value: number; previous?: number };
export type StoryBreakdown = { label: string; value: number; unit: StoryUnit; route?: string; note?: string; group?: string; previous?: number; billing?: { sales: number; credits: number } };
export type PanoramaStory = {
  id: StoryTopicId;
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
  };
};

export type StoryLoader = (topics: readonly StoryTopicId[], granted: readonly SectionKey[], asOf: string) => Promise<PanoramaStory[]>;

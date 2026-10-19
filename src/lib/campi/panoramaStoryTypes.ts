import type { SectionKey } from '@/lib/permissions';

export type StoryTopicId = 'ventas_facturacion' | 'repuestos_clientes' | 'repuestos_sucursales' | 'repuestos_stock' | 'maquinas_pedidos' | 'maquinas_stock' | 'maquinas_proyeccion' | 'servicios_pendientes';
export type StoryUnit = 'USD' | 'PYG' | 'count' | 'percent';
export type StoryDatum = { label: string; value: number | null; unit: StoryUnit; note?: string; comparison?: { value: number; label: string } };
export type StoryChartRow = { label: string; value: number; previous?: number };
export type StoryBreakdown = { label: string; value: number; unit: StoryUnit; route?: string; note?: string };
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
  breakdown: StoryBreakdown[];
  details: string[];
  source: string;
  route: string;
  attention?: boolean;
};

export type StoryLoader = (topics: readonly StoryTopicId[], granted: readonly SectionKey[], asOf: string) => Promise<PanoramaStory[]>;

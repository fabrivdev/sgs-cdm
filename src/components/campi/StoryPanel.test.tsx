import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { StoryPanel } from './StoryPanel';
vi.mock('recharts', async () => ({ ...(await vi.importActual('recharts')), ResponsiveContainer: () => <div data-testid="chart" /> }));
afterEach(cleanup);
const story: PanoramaStory = { id: 'ventas_facturacion', title: 'Facturación', question: '¿Cómo viene la facturación?', status: 'ready', message: 'Análisis completo de las tres áreas.', scope: 'Servicios + Máquinas + Repuestos', sections: ['servicios.ventas','parque.ventas','repuestos.ventas'], cutoff: null, periodLabel: 'Octubre 2026', primary: { label: 'Facturación del mes', value: 112, unit: 'USD', comparison: { value: 100, label: 'Mismo tramo de 2025' } }, supporting: [{ label: 'Acumulado anual', value: 500, unit: 'USD' }], chart: { kind: 'trend', title: 'Facturación mensual', rows: [{ label: 'Oct', value: 112, previous: 100 }], unit: 'USD' }, breakdown: [], details: ['Método de cálculo completo'], source: 'Fuente verificada', route: '' };
describe('compact overview panel', () => {
  it('shows sales, credit notes and net both on the overview and per authorized area', () => {
    const billing = { ...story, primary: { label: 'Facturación neta', value: 12, unit: 'USD' as const },
      supporting: [{ label: 'Ventas antes de NC del mes', value: 13, unit: 'USD' as const }, { label: 'Notas de crédito del mes', value: -1, unit: 'USD' as const }],
      breakdown: [{ label: 'Servicios', value: 12, unit: 'USD' as const, billing: { sales: 13, credits: 1 } }] };
    render(<MemoryRouter><StoryPanel story={billing} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('figure', { name: 'Conciliación de facturación' })).toHaveTextContent('Ventas $ 13 menos notas de crédito $ 1 igual a neto $ 12');
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de Facturación' }));
    expect(screen.getByRole('table', { name: 'Desglose' })).toHaveTextContent('Servicios$ 13$ -1$ 12');
    expect(screen.queryByText('Fuente, corte y metodología')).not.toBeInTheDocument();
  });
  it('keeps the metric, percentage and mini chart outside, and full analysis inside the dialog', () => {
    render(<MemoryRouter><StoryPanel story={story} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Facturación' })).toBeInTheDocument();
    expect(screen.getByText('+12%')).toBeInTheDocument();
    expect(screen.getByText('Facturación del mes')).toBeInTheDocument();
    expect(screen.getByText('$ 112')).toBeInTheDocument();
    expect(screen.getByText('Mismo tramo de 2025')).toBeInTheDocument();
    expect(screen.getByText('$ 100')).toBeInTheDocument();
    expect(screen.queryByText('Sin base histórica comparable')).not.toBeInTheDocument();
    expect(screen.getByRole('figure', { name: /Facturación mensual/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('chart').length).toBeGreaterThan(0);
    expect(screen.queryByText(story.message)).not.toBeInTheDocument();
    expect(screen.queryByText('Acumulado anual')).not.toBeInTheDocument();
    expect(screen.queryByText(/Servicios \+ Máquinas \+ Repuestos/)).not.toBeInTheDocument();
    expect(screen.queryByText('Octubre 2026')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de Facturación' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByTestId('chart').length).toBeGreaterThan(1);
    expect(screen.queryByText(story.message)).not.toBeInTheDocument();
    expect(screen.getByText('Octubre 2026')).toBeInTheDocument();
    expect(screen.queryByText('Fuente, corte y metodología')).not.toBeInTheDocument();
    expect(screen.queryByText('Método de cálculo completo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de Facturación' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('keeps an error explicit and supports retry without showing invented metrics', () => {
    const retry = vi.fn();
    render(<StoryPanel story={{ ...story, status: 'error', message: 'Fuente no disponible', primary: null }} index={0} retrying={false} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Fuente no disponible');
    expect(screen.queryByText('+12%')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar fuente' }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it('shows a zero prior value without inventing a percentage', () => {
    render(<MemoryRouter><StoryPanel story={{ ...story, primary: { ...story.primary!, comparison: { value: 0, label: 'Mismo tramo de 2025' } } }} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('$ 0')).toBeInTheDocument();
    expect(screen.queryByText('+12%')).not.toBeInTheDocument();
    expect(screen.queryByText('Variación % sin base positiva')).not.toBeInTheDocument();
  });
  it('does not imply an earlier period for a snapshot without comparison', () => {
    render(<MemoryRouter><StoryPanel story={{ ...story, id: 'maquinas_proyeccion', primary: { label: 'Saldo proyectado', value: 2, unit: 'count' }, chart: null }} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('Saldo proyectado')).toBeInTheDocument();
    expect(screen.queryByText('Sin base histórica comparable')).not.toBeInTheDocument();
    expect(screen.queryByText('Mismo tramo de 2025')).not.toBeInTheDocument();
  });
  it('shows a model chart only when projection components are unavailable', () => {
    render(<MemoryRouter><StoryPanel story={{ ...story, id: 'maquinas_proyeccion', primary: { label: 'Saldo proyectado', value: 2, unit: 'count' }, chart: { kind: 'bars', title: 'Saldo por modelo', unit: 'count', rows: [{ label: 'CLAAS Axion 870', value: -2 }] } }} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('figure', { name: 'Saldo por modelo' })).toHaveTextContent('CLAAS Axion 870');
    expect(screen.getByRole('figure', { name: 'Saldo por modelo' })).toHaveTextContent('-2');
  });
  it('shows projection components for any saldo, including nonzero', () => {
    render(<MemoryRouter><StoryPanel story={{ ...story, id: 'maquinas_proyeccion', primary: { label: 'Saldo proyectado', value: 16, unit: 'count' }, supporting: [{ label: 'Stock calculado', value: 13, unit: 'count' }, { label: 'Compras pendientes', value: 5, unit: 'count' }, { label: 'Ventas pendientes', value: 2, unit: 'count' }], chart: { kind: 'bars', title: 'Saldo por modelo', unit: 'count', rows: [{ label: 'Modelo A', value: 16 }] } }} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByLabelText('Componentes de la proyección')).toHaveTextContent('Stock calculado13');
    expect(screen.queryByRole('figure', { name: 'Saldo por modelo' })).not.toBeInTheDocument();
  });
  it('shows stock exposure percentage and keeps the material source-universe limitation', () => {
    render(<MemoryRouter><StoryPanel story={{ ...story, id: 'repuestos_stock', title: 'Stock antiguo de repuestos', primary: { label: 'Valor de stock gris y rojo', value: 30, unit: 'USD' }, supporting: [{ label: 'Valor positivo valorizado', value: 100, unit: 'USD' }], notices: [{ text: 'Un código podría pasar a rojo', route: '/repuestos/analisis?color=GRIS&compra_dias_min=971&compra_dias_max=1000&vista=detalle' }], chart: null }} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('30%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de Stock antiguo de repuestos' }));
    expect(screen.getByText('Valor positivo de ubicaciones con stock; la sección de origen incluye otros saldos.')).toBeInTheDocument();
  });
  it('shows service closure volume and open queue without treating shorter resolution as a verified improvement', () => {
    render(<MemoryRouter><StoryPanel story={{ ...story, id: 'servicios_pendientes', title: 'Resolución de órdenes de servicio', primary: { label: 'Mediana de resolución', value: 14, unit: 'days', comparison: { label: 'agosto de 2026', value: 16.5 } }, supporting: [{ label: 'OS cerradas en septiembre de 2026', value: 84, unit: 'count' }, { label: 'OS abiertas registradas', value: 76, unit: 'count' }], chart: null }} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('-15,15%').parentElement).toHaveAttribute('data-direction', 'neutral');
    expect(screen.getByText('OS cerradas').nextSibling).toHaveTextContent('84');
    expect(screen.getByText('OS abiertas').nextSibling).toHaveTextContent('76');
  });
});

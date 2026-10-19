import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { StoryPanel } from './StoryPanel';
vi.mock('recharts', async () => ({ ...(await vi.importActual('recharts')), ResponsiveContainer: () => <div data-testid="chart" /> }));
afterEach(cleanup);
const story: PanoramaStory = { id: 'ventas_facturacion', title: 'Facturación', question: '¿Cómo viene la facturación?', status: 'ready', message: 'Análisis completo de las tres áreas.', scope: 'Servicios + Máquinas + Repuestos', sections: ['servicios.ventas','parque.ventas','repuestos.ventas'], cutoff: null, periodLabel: 'Octubre 2026', primary: { label: 'Facturación del mes', value: 112, unit: 'USD', comparison: { value: 100, label: 'Mismo tramo de 2025' } }, supporting: [{ label: 'Acumulado anual', value: 500, unit: 'USD' }], chart: { kind: 'trend', title: 'Facturación mensual', rows: [{ label: 'Oct', value: 112, previous: 100 }], unit: 'USD' }, breakdown: [], details: ['Método de cálculo completo'], source: 'Fuente verificada', route: '' };
describe('compact overview panel', () => {
  it('keeps the metric, percentage and mini chart outside, and full analysis inside the dialog', () => {
    render(<MemoryRouter><StoryPanel story={story} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Facturación' })).toBeInTheDocument();
    expect(screen.getByText('+12%')).toBeInTheDocument();
    expect(screen.getByText('Facturación del mes')).toBeInTheDocument();
    expect(screen.getByText('$ 112')).toBeInTheDocument();
    expect(screen.getByText('Mismo tramo de 2025')).toBeInTheDocument();
    expect(screen.getByText('$ 100')).toBeInTheDocument();
    expect(screen.queryByText('Sin base histórica comparable')).not.toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'Comparación de Facturación del mes' })).toBeInTheDocument();
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
    expect(screen.queryByText(story.message)).not.toBeInTheDocument();
    expect(screen.queryByText('Acumulado anual')).not.toBeInTheDocument();
    expect(screen.queryByText(/Servicios \+ Máquinas \+ Repuestos/)).not.toBeInTheDocument();
    expect(screen.getByText('Octubre 2026')).toHaveClass('story-period');
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de Facturación' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('chart')).toBeInTheDocument();
    expect(screen.getByText(story.message)).toBeInTheDocument();
    expect(screen.getByText('Acumulado anual')).toBeInTheDocument();
    expect(screen.getByText('Método de cálculo completo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
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
  it('shows stock exposure percentage and a link to the approaching-red cohort', () => {
    render(<MemoryRouter><StoryPanel story={{ ...story, id: 'repuestos_stock', title: 'Stock antiguo de repuestos', primary: { label: 'Valor de stock gris y rojo', value: 30, unit: 'USD' }, supporting: [{ label: 'Valor positivo valorizado', value: 100, unit: 'USD' }], notices: [{ text: 'Un código podría pasar a rojo', route: '/repuestos/analisis?color=GRIS&compra_dias_min=971&compra_dias_max=1000&vista=detalle' }], chart: null }} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Un código podría pasar a rojo/ })).toHaveAttribute('href', '/repuestos/analisis?color=GRIS&compra_dias_min=971&compra_dias_max=1000&vista=detalle');
  });
});

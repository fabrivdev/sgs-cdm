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
    expect(screen.getAllByTestId('chart')).toHaveLength(1);
    expect(screen.queryByText(story.message)).not.toBeInTheDocument();
    expect(screen.queryByText('Acumulado anual')).not.toBeInTheDocument();
    expect(screen.queryByText(/Servicios \+ Máquinas \+ Repuestos/)).not.toBeInTheDocument();
    expect(screen.getByText('Octubre 2026')).toHaveClass('story-period');
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de Facturación' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanoramaDashboard } from './PanoramaDashboard';
import { PANORAMA_TOPICS } from '@/lib/campi/panoramaPreferences';

const { load, previous, record } = vi.hoisted(() => ({ load: vi.fn(), previous: vi.fn(), record: vi.fn() }));
vi.mock('@/lib/campi/panoramaData', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/campi/panoramaData')>();
  return { ...real, loadPanoramaData: load };
});
vi.mock('@/lib/campi/panoramaVisits', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/campi/panoramaVisits')>();
  return { ...real, previousPanoramaVisit: previous, recordPanoramaVisit: record, panoramaSessionId: () => 'session-a' };
});
vi.mock('./CampiPanoramaAvatar', () => ({ CampiPanoramaAvatar: () => <div>Campi</div> }));

beforeEach(() => {
  load.mockReset(); previous.mockReset(); record.mockReset();
  previous.mockResolvedValue(null); record.mockResolvedValue(undefined);
});
afterEach(cleanup);

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><PanoramaDashboard userId="manager-a"
    topics={['ventas_facturacion', 'maquinas_stock']} available={PANORAMA_TOPICS}
    hasAccess={section => section === 'repuestos.ventas' || section === 'parque.stock'} onEdit={() => {}} />
  </MemoryRouter></QueryClientProvider>);
}

describe('Campi Panorama dashboard', () => {
  it('shows a stock finding only from the permitted valued source and does not duplicate the headline value', async () => {
    load.mockResolvedValue([{ section: 'repuestos.analisis', metrics: [{
      id: 'repuestos.valor_stock', topic: 'repuestos_stock', label: 'Valor Kardex referencial', value: 4000,
      unit: 'USD', section: 'repuestos.analisis', scope: 'Repuestos', period: 'stock', cutoff: '2026-10-16',
      version: 'repuestos_analisis_valorizado:ultima_compra_v1', route: '/repuestos/analisis',
    }], insights: [{ id: 'repuestos.stock_antiguo', topic: 'repuestos_stock',
      title: 'Stock sin ventas en tres años y última compra hace más de 1.000 días',
      value: 1000, total: 4000, count: 10, unit: 'USD', cutoff: '2026-10-16', route: '/repuestos/analisis' }] }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><PanoramaDashboard userId="manager-a"
      topics={['repuestos_stock']} available={PANORAMA_TOPICS}
      hasAccess={section => section === 'repuestos.analisis'} onEdit={() => {}} />
    </MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText('USD 1.000')).toBeInTheDocument();
    expect(screen.getAllByText('USD 4.000')).toHaveLength(1);
    expect(screen.getByRole('img', { name: /25 por ciento/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explorar en Análisis de repuestos/ })).toHaveAttribute('href', '/repuestos/analisis');
  });

  it('shows authorized metrics, keeps topic order and never exposes another sales source', async () => {
    load.mockResolvedValue([{ section: 'repuestos.ventas', metrics: [{
      id: 'repuestos.facturado', topic: 'ventas_facturacion', label: 'Facturación de repuestos', value: 123,
      unit: 'USD', section: 'repuestos.ventas', scope: 'Repuestos', period: '2026-10', cutoff: '2026-10-16',
      version: 'ventas_repuestos_panorama_v2', route: '/repuestos/ventas',
    }] }]);
    show();
    await screen.findByText('USD 123');
    expect(load).toHaveBeenCalledWith(['ventas_facturacion', 'maquinas_stock'], ['repuestos.ventas'], expect.any(String));
    expect(screen.getByText('Tu enfoque')).toBeInTheDocument();
    expect(screen.getByText('Evolución de ventas y facturación')).toBeInTheDocument();
    expect(screen.getAllByText('Disponibilidad de máquinas').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Lectura rápida' })).toBeInTheDocument();
    expect(screen.queryByText(/Facturación de servicios/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir Facturación de repuestos/ })).toHaveAttribute('href', '/repuestos/ventas');
    await waitFor(() => expect(record).toHaveBeenCalledOnce());
  });

  it('does not record a partial visit after a source fails', async () => {
    load.mockResolvedValue([{ section: 'repuestos.ventas', metrics: [], error: 'timeout' }]);
    show();
    await screen.findByText('Hay una fuente sin datos en este momento.');
    expect(record).not.toHaveBeenCalled();
  });

  it('does not call a changed month a change since the previous visit', async () => {
    previous.mockResolvedValue({ captured_at: '2026-09-30T12:00:00Z', metrics: [{
      id: 'repuestos.facturado', value: 100, unit: 'USD', section: 'repuestos.ventas',
      scope: 'Repuestos', period: '2026-09', version: 'ventas_repuestos_panorama_v2',
    }] });
    load.mockResolvedValue([{ section: 'repuestos.ventas', metrics: [{
      id: 'repuestos.facturado', topic: 'ventas_facturacion', label: 'Facturación de repuestos', value: 150,
      unit: 'USD', section: 'repuestos.ventas', scope: 'Repuestos', period: '2026-10',
      cutoff: '2026-10-16', version: 'ventas_repuestos_panorama_v2', route: '/repuestos/ventas',
    }] }]);
    show();
    await screen.findByText('USD 150');
    expect(screen.queryByText(/USD 50 desde última visita/)).not.toBeInTheDocument();
    expect(screen.queryByText(/USD 50 desde última visita/)).not.toBeInTheDocument();
  });
});

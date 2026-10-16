import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  it('shows authorized metrics, keeps topic order and never exposes another sales source', async () => {
    load.mockResolvedValue([{ section: 'repuestos.ventas', metrics: [{
      id: 'repuestos.facturado', topic: 'ventas_facturacion', label: 'Facturación de repuestos', value: 123,
      unit: 'USD', section: 'repuestos.ventas', scope: 'Repuestos', period: '2026-10', cutoff: '2026-10-16',
      version: 'ventas_repuestos_panorama_v2', route: '/repuestos/ventas',
    }] }]);
    show();
    await screen.findByText('USD 123');
    expect(load).toHaveBeenCalledWith(['ventas_facturacion', 'maquinas_stock'], ['repuestos.ventas'], expect.any(String));
    const cards = screen.getAllByRole('heading', { level: 2 }).filter(item => item.textContent !== 'Tu panorama');
    expect(cards.map(item => item.textContent)).toEqual(['Evolución de ventas y facturación', 'Disponibilidad de máquinas']);
    expect(screen.queryByText(/Facturación de servicios/)).not.toBeInTheDocument();
    expect(within(cards[0].closest('section') ?? cards[0].parentElement!.parentElement!).getByRole('link', { name: /Facturación de repuestos/ })).toHaveAttribute('href', '/repuestos/ventas');
    await waitFor(() => expect(record).toHaveBeenCalledOnce());
  });

  it('does not record a partial visit after a source fails', async () => {
    load.mockResolvedValue([{ section: 'repuestos.ventas', metrics: [], error: 'timeout' }]);
    show();
    await screen.findByText('Fuente no disponible');
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
    expect(screen.getByText('Todavía no hay indicadores comparables con tu última visita.')).toBeInTheDocument();
    expect(screen.queryByText(/USD 50 desde última visita/)).not.toBeInTheDocument();
  });
});

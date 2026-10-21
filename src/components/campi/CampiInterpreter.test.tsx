import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampiInterpreter } from './CampiInterpreter';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
vi.mock('./CampiPanoramaAvatar', () => ({ CampiPanoramaAvatar: ({ mood }: { mood?: string }) => <div data-mood={mood}>Mascota</div> }));
afterEach(cleanup);
const billing: PanoramaStory = { id: 'ventas_facturacion', title: 'Facturación', question: '¿Cómo viene la facturación?', status: 'ready', message: '', scope: 'Repuestos', sections: ['repuestos.ventas'], cutoff: null, periodLabel: 'Octubre', primary: { label: 'Facturación del mes', value: 448000, unit: 'USD', comparison: { value: 400000, label: 'Mismo tramo de 2025' } }, supporting: [], chart: { kind: 'bars', title: 'Áreas', unit: 'USD', rows: [{ label: 'Repuestos', value: 300000, previous: 260000 }, { label: 'Servicios', value: 148000, previous: 140000 }] }, breakdown: [], details: [], source: 'Prueba', route: '' };
const resolution: PanoramaStory = { ...billing, id: 'servicios_pendientes', title: 'Resolución de OS', sections: ['servicios.ordenes'], primary: { label: 'Mediana', value: 14, unit: 'days', comparison: { value: 16, label: 'Mes anterior' } }, supporting: [{ label: 'OS cerradas en octubre', value: 26, unit: 'count' }, { label: 'OS cerradas en septiembre', value: 22, unit: 'count' }], chart: null };
describe('Campi synthesis', () => {
  it('keeps the verified summary and direct data action without a question panel', () => {
    const openStory = vi.fn();
    render(<CampiInterpreter stories={[billing]} loading={false} onOpenStory={openStory} />);
    expect(screen.getByRole('heading', { name: /Facturación: facturación del mes subió 12%/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preguntale a Campi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver datos de facturación' }));
    expect(openStory).toHaveBeenCalledWith('ventas_facturacion');
  });
  it('shows an evidenced finding and a working primary action', () => {
    const openStory = vi.fn();
    render(<CampiInterpreter stories={[billing]} loading={false} onOpenStory={openStory} />);
    expect(screen.getByRole('heading', { name: /Facturación: facturación del mes subió 12%/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Mayor diferencia entre áreas: Repuestos \(\$ 260.000 → \$ 300.000\)/ })).toBeInTheDocument();
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'sereno');
    expect(screen.getByText('Cambio observado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver datos de facturación' }));
    expect(openStory).toHaveBeenCalledWith('ventas_facturacion');
  });
  it('does not turn an unchanged total into a Campi comment', () => {
    render(<CampiInterpreter stories={[{ ...billing, primary: { ...billing.primary!, comparison: undefined } }]} loading={false} onOpenStory={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /No encontré cambios relevantes comprobados/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver datos de facturación' })).not.toBeInTheDocument();
    expect(screen.queryByText(/subió/)).not.toBeInTheDocument();
  });
  it('keeps a red stock share neutral and does not label an LY comparison as a visit change', () => {
    const stock: PanoramaStory = { ...billing, id: 'repuestos_stock', title: 'Situación del stock', sections: ['repuestos.analisis'], primary: { label: 'Valor Kardex', value: 220, unit: 'USD' }, supporting: [{ label: 'Rojo · valor Kardex', value: 70, unit: 'USD' }] };
    const parts: PanoramaStory = { ...billing, id: 'repuestos_clientes', title: 'Ventas de repuestos', primary: { ...billing.primary!, value: 420000 } };
    const openStory = vi.fn();
    render(<CampiInterpreter stories={[parts, billing, stock]} loading={false} onOpenStory={openStory} previous={{ at: '2026-10-15T10:00:00Z', values: [{ id: 'ventas_facturacion', value: 400000, unit: 'USD', fingerprint: JSON.stringify([['repuestos.ventas'], 'Repuestos', 'Octubre', 'Prueba', 'ventas-netas-nc-separadas-v3']) }] }} />);
    expect(screen.getByRole('heading', { name: /Facturación: facturación del mes subió 12%/ })).toBeInTheDocument();
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'sereno');
    expect(screen.queryByText(/Desde tu última visita/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Siguiente comentario de Campi' })).not.toBeInTheDocument();
    expect(screen.queryByText('Repuestos · Octubre')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver datos de facturación' }));
    expect(openStory).toHaveBeenCalledWith('ventas_facturacion');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('cycles through distinct verified topics and returns to the first without announcing every change', () => {
    render(<CampiInterpreter stories={[billing, resolution]} loading={false} />);
    expect(screen.getByRole('heading', { name: /Facturación.*subió/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente comentario de Campi' }));
    expect(screen.getByRole('heading', { name: /Resolución de OS: la mediana bajó 2 días/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente comentario de Campi' }));
    expect(screen.getByRole('heading', { name: /Facturación.*subió/ })).toBeInTheDocument();
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
    expect(screen.getByText('1 de 2').closest('.panorama-hero')?.querySelector('.campi-synthesis')).toHaveAttribute('aria-live', 'off');
  });
  it('pauses automatic comments while a detail is open', () => {
    vi.useFakeTimers();
    try {
      const view = render(<CampiInterpreter stories={[billing, resolution]} loading={false} detailOpen />);
      act(() => vi.advanceTimersByTime(26000));
      expect(screen.getByRole('heading', { name: /Facturación.*subió/ })).toBeInTheDocument();
      view.rerender(<CampiInterpreter stories={[billing, resolution]} loading={false} />);
      act(() => vi.advanceTimersByTime(25000));
      expect(screen.getByRole('heading', { name: /Resolución de OS: la mediana bajó 2 días/ })).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it('resumes comments after pointer exit even when a clicked button retains focus', () => {
    vi.useFakeTimers();
    try {
      render(<CampiInterpreter stories={[billing, resolution]} loading={false} />);
      const next = screen.getByRole('button', { name: 'Siguiente comentario de Campi' });
      const hero = next.closest('.panorama-hero')!;
      fireEvent.pointerEnter(hero);
      act(() => vi.advanceTimersByTime(26000));
      expect(screen.getByText('1 de 2')).toBeInTheDocument();
      fireEvent.keyDown(next, { key: 'Tab' });
      fireEvent.pointerLeave(hero);
      act(() => vi.advanceTimersByTime(26000));
      expect(screen.getByText('1 de 2')).toBeInTheDocument();
      fireEvent.pointerDown(next);
      fireEvent.click(next);
      expect(screen.getByText('2 de 2')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(25000));
      expect(screen.getByText('1 de 2')).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it('does not invent an action when no verified story is available', () => {
    render(<CampiInterpreter stories={[]} loading={false} />);
    expect(screen.getByRole('heading', { name: /Todavía no tengo cifras verificadas/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver datos de/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'pensativo');
  });
  it('changes expression only when sales and NC support the situation', () => {
    const components = (gross: number, credit: number) => [
      { label: 'Ventas antes de NC del mes', value: gross, unit: 'USD' as const },
      { label: 'Notas de crédito del mes', value: credit, unit: 'USD' as const },
    ];
    const chart = (current: number) => ({ kind: 'bars' as const, title: 'Áreas', unit: 'USD' as const, rows: [{ label: 'Repuestos', value: current * 0.75, previous: 60 }, { label: 'Servicios', value: current * 0.25, previous: 20 }] });
    const view = render(<CampiInterpreter stories={[{ ...billing, primary: { ...billing.primary!, value: 100, comparison: { value: 80, label: 'Mismo tramo' } }, supporting: components(110, -10), chart: chart(100) }]} loading={false} />);
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'contento');
    view.rerender(<CampiInterpreter stories={[{ ...billing, primary: { ...billing.primary!, value: 10, comparison: { value: 80, label: 'Mismo tramo' } }, supporting: components(110, -100), chart: chart(10) }]} loading={false} />);
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'triste');
    expect(screen.getByRole('heading', { name: /Facturación: facturación del mes bajó 87,5%/ })).toBeInTheDocument();
  });
});

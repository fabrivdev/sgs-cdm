import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampiInterpreter } from './CampiInterpreter';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
vi.mock('./CampiPanoramaAvatar', () => ({ CampiPanoramaAvatar: ({ mood }: { mood?: string }) => <div data-mood={mood}>Mascota</div> }));
afterEach(cleanup);
const billing: PanoramaStory = { id: 'ventas_facturacion', title: 'Facturación', question: '¿Cómo viene la facturación?', status: 'ready', message: '', scope: 'Repuestos', sections: ['repuestos.ventas'], cutoff: null, periodLabel: 'Octubre', primary: { label: 'Facturación del mes', value: 448000, unit: 'USD', comparison: { value: 400000, label: 'Mismo tramo de 2025' } }, supporting: [], chart: null, breakdown: [], details: [], source: 'Prueba', route: '' };
describe('Campi questions', () => {
  it('answers suggested and free-text questions without fetching new data', async () => {
    render(<CampiInterpreter stories={[billing]} loading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preguntale a Campi' }));
    fireEvent.click(screen.getByRole('button', { name: '¿Qué muestran los datos de facturación?' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Abrí el detalle');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preguntale a Campi' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Preguntale a Campi' }), { target: { value: '¿Por qué crecieron las ventas?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preguntar a Campi' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('No tengo una respuesta verificada');
  });
  it('does not retain privileged answers when input stories change', () => {
    const view = render(<CampiInterpreter stories={[billing]} loading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preguntale a Campi' }));
    fireEvent.click(screen.getByRole('button', { name: '¿Qué muestran los datos de facturación?' }));
    view.rerender(<CampiInterpreter stories={[]} loading={false} />);
    expect(screen.getByRole('dialog')).not.toHaveTextContent('$ 448.000');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Respuesta de Campi');
  });
  it('shows an evidenced finding and a working primary action', () => {
    const openStory = vi.fn();
    render(<CampiInterpreter stories={[billing]} loading={false} onOpenStory={openStory} />);
    expect(screen.getByRole('heading', { name: /Facturación: facturación del mes subió 12%/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /\$ 400.000 → \$ 448.000/ })).toBeInTheDocument();
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'sereno');
    expect(screen.getByText('Cambio observado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver datos de facturación' }));
    expect(openStory).toHaveBeenCalledWith('ventas_facturacion');
  });
  it('shows a verified neutral total without claiming growth when comparison is missing', () => {
    render(<CampiInterpreter stories={[{ ...billing, primary: { ...billing.primary!, comparison: undefined } }]} loading={false} />);
    expect(screen.getByRole('heading', { name: /Facturación: \$ 448.000 en facturación del mes/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver datos de facturación' })).toBeInTheDocument();
    expect(screen.queryByText(/subió/)).not.toBeInTheDocument();
  });
  it('keeps a red stock share neutral and aligns the visit headline, scope and action', () => {
    const stock: PanoramaStory = { ...billing, id: 'repuestos_stock', title: 'Situación del stock', sections: ['repuestos.analisis'], primary: { label: 'Valor Kardex', value: 220, unit: 'USD' }, supporting: [{ label: 'Rojo · valor Kardex', value: 70, unit: 'USD' }] };
    const parts: PanoramaStory = { ...billing, id: 'repuestos_clientes', title: 'Ventas de repuestos', primary: { ...billing.primary!, value: 420000 } };
    const openStory = vi.fn();
    render(<CampiInterpreter stories={[parts, billing, stock]} loading={false} onOpenStory={openStory} previous={{ at: '2026-10-15T10:00:00Z', values: [{ id: 'ventas_facturacion', value: 400000, unit: 'USD', fingerprint: JSON.stringify([['repuestos.ventas'], 'Repuestos', 'Octubre', 'Prueba', 'ventas-netas-nc-separadas-v3']) }] }} />);
    expect(screen.getByRole('heading', { name: /Facturación: \+\$ 48.000 desde tu última visita/ })).toBeInTheDocument();
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'sereno');
    expect(screen.getByLabelText(/Comparación de Facturación desde tu última visita/)).toHaveTextContent('$ 400.000 → $ 448.000');
    expect(screen.queryByText('Repuestos · Octubre')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver datos de facturación' }));
    expect(openStory).toHaveBeenCalledWith('ventas_facturacion');
    fireEvent.click(screen.getByRole('button', { name: 'Preguntale a Campi' }));
    fireEvent.click(screen.getByRole('button', { name: '¿Qué cambió desde mi última visita?' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('$ 400.000 → $ 448.000');
  });
  it('blocks submissions during loading and for whitespace', () => {
    const view = render(<CampiInterpreter stories={[]} loading />);
    expect(screen.queryByRole('textbox', { name: 'Preguntale a Campi' })).not.toBeInTheDocument();
    view.rerender(<CampiInterpreter stories={[billing]} loading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preguntale a Campi' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Preguntale a Campi' }), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Preguntar a Campi' })).toBeDisabled();
  });
  it('cycles through distinct verified topics and returns to the first without announcing every change', () => {
    const orders: PanoramaStory = { ...billing, id: 'servicios_abiertas', title: 'OS abiertas', sections: ['servicios.ordenes'], primary: { label: 'OS abiertas', value: 76, unit: 'count' } };
    render(<CampiInterpreter stories={[billing, orders]} loading={false} />);
    expect(screen.getByRole('heading', { name: /Facturación.*subió/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente comentario de Campi' }));
    expect(screen.getByRole('heading', { name: /OS abiertas: 76/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente comentario de Campi' }));
    expect(screen.getByRole('heading', { name: /Facturación.*subió/ })).toBeInTheDocument();
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
    expect(screen.getByText('1 de 2').closest('.panorama-hero')?.querySelector('.campi-synthesis')).toHaveAttribute('aria-live', 'off');
  });
  it('pauses automatic comments while a detail is open', () => {
    vi.useFakeTimers();
    try {
      const orders: PanoramaStory = { ...billing, id: 'servicios_abiertas', title: 'OS abiertas', sections: ['servicios.ordenes'], primary: { label: 'OS abiertas', value: 76, unit: 'count' } };
      const view = render(<CampiInterpreter stories={[billing, orders]} loading={false} detailOpen />);
      act(() => vi.advanceTimersByTime(26000));
      expect(screen.getByRole('heading', { name: /Facturación.*subió/ })).toBeInTheDocument();
      view.rerender(<CampiInterpreter stories={[billing, orders]} loading={false} />);
      act(() => vi.advanceTimersByTime(25000));
      expect(screen.getByRole('heading', { name: /OS abiertas: 76/ })).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it('keeps the question panel open after Enter and sends from a separate button', () => {
    render(<CampiInterpreter stories={[billing]} loading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preguntale a Campi' }));
    const input = screen.getByRole('textbox', { name: 'Preguntale a Campi' });
    fireEvent.change(input, { target: { value: '¿Cómo viene la facturación?' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('dialog')).toHaveTextContent('Respuesta de Campi');
    expect(screen.getByRole('dialog')).toContainElement(input);
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
  });
  it('does not offer a question box when no verified story is available', () => {
    render(<CampiInterpreter stories={[]} loading={false} />);
    expect(screen.getByRole('heading', { name: /Todavía no tengo cifras verificadas/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Preguntale a Campi' })).not.toBeInTheDocument();
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'pensativo');
  });
  it('changes expression only when sales and NC support the situation', () => {
    const components = (gross: number, credit: number) => [
      { label: 'Ventas antes de NC del mes', value: gross, unit: 'USD' as const },
      { label: 'Notas de crédito del mes', value: credit, unit: 'USD' as const },
    ];
    const view = render(<CampiInterpreter stories={[{ ...billing, primary: { ...billing.primary!, value: 100, comparison: { value: 80, label: 'Mismo tramo' } }, supporting: components(110, -10) }]} loading={false} />);
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'contento');
    view.rerender(<CampiInterpreter stories={[{ ...billing, primary: { ...billing.primary!, value: 10, comparison: { value: 80, label: 'Mismo tramo' } }, supporting: components(110, -100) }]} loading={false} />);
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'preocupado');
    expect(screen.getByRole('heading', { name: /Las NC representan 90,9% de las ventas antes de NC/ })).toBeInTheDocument();
  });
});

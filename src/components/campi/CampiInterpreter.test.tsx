import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampiInterpreter } from './CampiInterpreter';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
vi.mock('./CampiPanoramaAvatar', () => ({ CampiPanoramaAvatar: ({ attention, change }: { attention?: boolean; change?: boolean }) => <div data-mood={attention ? 'attention' : change ? 'change' : 'serene'}>Mascota</div> }));
afterEach(cleanup);
const billing: PanoramaStory = { id: 'ventas_facturacion', title: 'Facturación', question: '¿Cómo viene la facturación?', status: 'ready', message: '', scope: 'Repuestos', sections: ['repuestos.ventas'], cutoff: null, periodLabel: 'Octubre', primary: { label: 'Facturación del mes', value: 448000, unit: 'USD', comparison: { value: 400000, label: 'Mismo tramo de 2025' } }, supporting: [], chart: null, breakdown: [], details: [], source: 'Prueba', route: '' };
describe('Campi questions', () => {
  it('answers suggested and free-text questions without fetching new data', async () => {
    render(<CampiInterpreter stories={[billing]} loading={false} />);
    fireEvent.click(screen.getByRole('button', { name: '¿Qué muestran los datos de facturación?' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Fuente: Prueba');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Preguntale a Campi')).toHaveFocus());
    fireEvent.change(screen.getByLabelText('Preguntale a Campi'), { target: { value: '¿Por qué crecieron las ventas?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preguntar a Campi' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('No puedo responder esa consulta');
  });
  it('does not retain privileged answers when input stories change', () => {
    const view = render(<CampiInterpreter stories={[billing]} loading={false} />);
    fireEvent.click(screen.getByRole('button', { name: '¿Qué muestran los datos de facturación?' }));
    view.rerender(<CampiInterpreter stories={[]} loading={false} />);
    expect(screen.getByRole('dialog')).not.toHaveTextContent('448.000');
    expect(screen.getByRole('dialog')).toHaveTextContent('No puedo responder');
  });
  it('shows an evidenced finding and a working primary action', () => {
    render(<CampiInterpreter stories={[billing]} loading={false} />);
    expect(screen.getByRole('heading', { name: /Facturación: facturación del mes subió 12%/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /USD 400.000 → USD 448.000/ })).toBeInTheDocument();
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'change');
    expect(screen.getByText('Cambio observado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver datos de facturación' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Fuente: Prueba');
  });
  it('shows a verified neutral total without claiming growth when comparison is missing', () => {
    render(<CampiInterpreter stories={[{ ...billing, primary: { ...billing.primary!, comparison: undefined } }]} loading={false} />);
    expect(screen.getByRole('heading', { name: /Facturación: USD 448.000/ })).toBeInTheDocument();
    expect(screen.queryByText(/subió/)).not.toBeInTheDocument();
  });
  it('keeps a red stock share neutral and aligns the visit headline, scope and action', () => {
    const stock: PanoramaStory = { ...billing, id: 'repuestos_stock', title: 'Situación del stock', sections: ['repuestos.analisis'], primary: { label: 'Valor Kardex', value: 220, unit: 'USD' }, supporting: [{ label: 'Rojo · valor Kardex', value: 70, unit: 'USD' }] };
    const parts: PanoramaStory = { ...billing, id: 'repuestos_clientes', title: 'Ventas de repuestos', primary: { ...billing.primary!, value: 420000 } };
    render(<CampiInterpreter stories={[parts, billing, stock]} loading={false} previous={{ at: '2026-10-15T10:00:00Z', values: [{ id: 'ventas_facturacion', value: 400000, unit: 'USD', fingerprint: JSON.stringify([['repuestos.ventas'], 'Repuestos', 'Octubre', 'Prueba', 'ventas-brutas-nc-separadas-v2']) }] }} />);
    expect(screen.getByRole('heading', { name: /Facturación: \+USD 48.000 desde tu última visita/ })).toBeInTheDocument();
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'change');
    expect(screen.getByLabelText(/Comparación de Facturación desde tu última visita/)).toHaveTextContent('USD 400.000 → USD 448.000');
    expect(screen.getByText('Repuestos · Octubre')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver datos de facturación' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Fuente: Prueba');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '¿Qué cambió desde mi última visita?' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('USD 400.000 → USD 448.000');
  });
  it('blocks submissions during loading and for whitespace', () => {
    const view = render(<CampiInterpreter stories={[]} loading />);
    expect(screen.queryByLabelText('Preguntale a Campi')).not.toBeInTheDocument();
    view.rerender(<CampiInterpreter stories={[billing]} loading={false} />);
    fireEvent.change(screen.getByLabelText('Preguntale a Campi'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Preguntar a Campi' })).toBeDisabled();
  });
  it('does not offer a question box when no verified story is available', () => {
    render(<CampiInterpreter stories={[]} loading={false} />);
    expect(screen.getByRole('heading', { name: /Todavía no tengo cifras verificadas/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Preguntale a Campi')).not.toBeInTheDocument();
  });
});

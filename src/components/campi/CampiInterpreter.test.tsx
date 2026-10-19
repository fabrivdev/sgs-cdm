import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampiInterpreter } from './CampiInterpreter';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
vi.mock('./CampiPanoramaAvatar', () => ({ CampiPanoramaAvatar: () => <div>Mascota</div> }));
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
  it('shows a concise evidence-based headline and a working primary action', () => {
    render(<CampiInterpreter stories={[billing]} loading={false} />);
    expect(screen.getByRole('heading', { name: 'La facturación subió 12% frente al período comparable.' })).toBeInTheDocument();
    expect(screen.queryByText(/400.000 →/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Explorar facturación' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Fuente: Prueba');
  });
  it('never turns a missing comparison into growth', () => {
    render(<CampiInterpreter stories={[{ ...billing, primary: { ...billing.primary!, comparison: undefined } }]} loading={false} />);
    expect(screen.getByRole('heading', { name: 'Tus prioridades, en un solo lugar.' })).toBeInTheDocument();
    expect(screen.queryByText(/subió/)).not.toBeInTheDocument();
  });
  it('blocks submissions during loading and for whitespace', () => {
    const view = render(<CampiInterpreter stories={[]} loading />);
    expect(screen.getByLabelText('Preguntale a Campi')).toBeDisabled();
    view.rerender(<CampiInterpreter stories={[billing]} loading={false} />);
    fireEvent.change(screen.getByLabelText('Preguntale a Campi'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Preguntar a Campi' })).toBeDisabled();
  });
});

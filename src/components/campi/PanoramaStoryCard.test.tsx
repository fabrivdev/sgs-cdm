import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { PanoramaStoryCard } from './PanoramaStoryCard';

const story: PanoramaStory = { id: 'ventas_facturacion', title: 'Facturación neta', question: '', status: 'ready', message: '', scope: '', sections: ['repuestos.ventas', 'servicios.ventas'], cutoff: null, periodLabel: '', primary: { label: 'Neto del mes', value: 100, unit: 'USD', comparison: { value: 80, label: 'LY' } }, supporting: [], chart: null, breakdown: [], details: [], source: '', route: '', navigationPeriod: { from: '2026-10-01', to: '2026-10-20' } };
const Location = () => <output data-testid="route">{useLocation().pathname}{useLocation().search}</output>;

describe('Panorama card navigation', () => {
  it('asks for the source area only for a consolidated story, then navigates with dates', () => {
    render(<MemoryRouter><PanoramaStoryCard story={story} index={0} retrying={false} onRetry={vi.fn()} /><Location /></MemoryRouter>);
    expect(screen.getByText('$ 100')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ver detalle de Facturación neta' }), { key: 'Enter' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ventas de servicios' }));
    expect(screen.getByTestId('route')).toHaveTextContent('/servicios/ventas?desde=2026-10-01&hasta=2026-10-20');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('goes straight to the filtered source for a single-area story', () => {
    render(<MemoryRouter><PanoramaStoryCard story={{ ...story, id: 'ventas_servicios', sections: ['servicios.ventas'] }} index={0} retrying={false} onRetry={vi.fn()} /><Location /></MemoryRouter>);
    fireEvent.click(screen.getByRole('link', { name: 'Ver detalle de Facturación neta' }));
    expect(screen.getByTestId('route')).toHaveTextContent('/servicios/ventas?desde=2026-10-01&hasta=2026-10-20');
  });
});

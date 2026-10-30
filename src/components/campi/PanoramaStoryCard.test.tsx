import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { PanoramaStoryCard } from './PanoramaStoryCard';

const story: PanoramaStory = { id: 'ventas_facturacion', title: 'Facturación neta', question: '', status: 'ready', message: '', scope: '', sections: ['repuestos.ventas', 'servicios.ventas'], cutoff: null, periodLabel: '', primary: { label: 'Neto del mes', value: 100, unit: 'USD', comparison: { value: 80, label: 'LY' } }, supporting: [], chart: null, breakdown: [], details: [], source: '', route: '', navigationPeriod: { from: '2026-10-01', to: '2026-10-20' } };
const Location = () => <output data-testid="route">{useLocation().pathname}{useLocation().search}</output>;
beforeAll(() => vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
}));
afterAll(() => vi.unstubAllGlobals());

describe('Panorama card navigation', () => {
  it('asks for the source area only for a consolidated story, then navigates with dates', () => {
    render(<MemoryRouter><PanoramaStoryCard story={story} index={0} retrying={false} onRetry={vi.fn()} /><Location /></MemoryRouter>);
    expect(screen.getByText('$ 100')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Explorar ventas: Facturación neta' }), { key: 'Enter' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /Ventas de servicios/ }));
    expect(screen.getByTestId('route')).toHaveTextContent('/servicios/ventas?desde=2026-10-01&hasta=2026-10-20');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('goes straight to the filtered source for a single-area story', () => {
    render(<MemoryRouter><PanoramaStoryCard story={{ ...story, id: 'ventas_servicios', sections: ['servicios.ventas'] }} index={0} retrying={false} onRetry={vi.fn()} /><Location /></MemoryRouter>);
    fireEvent.click(screen.getByRole('link', { name: 'Explorar ventas: Facturación neta' }));
    expect(screen.getByTestId('route')).toHaveTextContent('/servicios/ventas?desde=2026-10-01&hasta=2026-10-20');
  });
  it('draws signed NC as a reconciliation from sales to net', () => {
    const billing = { ...story, primary: { label: 'Neto', value: 75, unit: 'USD' as const },
      supporting: [{ label: 'Ventas antes de NC del mes', value: 100, unit: 'USD' as const },
        { label: 'Notas de crédito del mes', value: -25, unit: 'USD' as const }] };
    render(<MemoryRouter><PanoramaStoryCard story={billing} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByLabelText('Ventas más notas de crédito igual a neto')).toHaveTextContent('NC −$ 25');
  });
});

it('renders all twelve agenda periods and keeps header dates only in accessible help',()=>{
 const rows=Array.from({length:12},(_,i)=>({label:'Mes '+(i+1),value:50}));
 const {container}=render(<MemoryRouter><PanoramaStoryCard story={{...story,id:'agenda_cumplimiento',chart:{kind:'bars',title:'Agenda',unit:'percent',rows}}} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
 expect(screen.getByRole('region',{name:'Todos los períodos de agenda'}).children).toHaveLength(12);
 expect(screen.getByText('Mes 12')).toBeInTheDocument();
 expect(container.querySelector('.story-card-period')).toBeNull();
 expect(screen.getByText('01/10/2026–20/10/2026').parentElement).toHaveClass('sr-only');
});

it('keeps OS billing counts and period controls with its dedicated trend, without a verdict about falling rates', () => {
  const monthly = [{ label: 'May 2026', value: null }, { label: 'Jun 2026', value: null },
    { label: 'Jul 2026', value: 38 }, { label: 'Ago 2026', value: 33 }, { label: 'Sep 2026', value: 28 }, { label: 'Oct 2026*', value: 24.1 }];
  const os: PanoramaStory = {
    ...story, id: 'servicios_os_facturadas', title: 'OS facturadas a clientes',
    sections: ['servicios.ordenes'], primary: { label: 'Porcentaje facturado', value: 24.1, unit: 'percent' },
    supporting: [{ label: 'Facturadas a cliente', value: 7, unit: 'count' }, { label: 'OS cerradas', value: 29, unit: 'count' }],
    periodOptions: ['month', 'ytd'], time: { window: { from: '2026-10-01', to: '2026-10-20' } },
    series: monthly.map((row, index) => ({ from: `2026-${String(index + 5).padStart(2, '0')}-01`,
      to: index === 5 ? '2026-10-20' : new Date(Date.UTC(2026, index + 5, 0)).toISOString().slice(0, 10),
      value: row.value, numerator: row.value === null ? null : 1, denominator: row.value === null ? 0 : 1,
      ids: [], cutoff: '2026-10-20', complete: true })),
    chart: { kind: 'trend', title: 'Evolución mensual de OS facturadas', unit: 'percent', rows: monthly },
  };
  const { container } = render(<MemoryRouter><PanoramaStoryCard story={os} index={2} retrying={false} onRetry={vi.fn()} periodMode="month" onPeriodChange={vi.fn()} /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'OS facturadas a clientes' })).toBeInTheDocument();
  expect(container.querySelector('.story-main-value strong')).toHaveTextContent('24,1%');
  expect(screen.getByText('Facturadas')).toBeInTheDocument();
  expect(screen.getByText('Cerradas')).toBeInTheDocument();
  expect(container.querySelector('.story-os-trend')).toBeInTheDocument();
  expect(container.querySelector('.story-os-trend .story-chart-canvas')).toBeInTheDocument();
  expect(screen.getByText('ene 2026: sin tasa')).toBeInTheDocument();
  expect(screen.getByText('Jun 2026: sin tasa')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByText('En descenso')).not.toBeInTheDocument();
});

it.each([
  [24.1, 32, 'down', '−7,9 p.p.'],
  [40, 32, 'up', '+8 p.p.'],
])('colors the OS month movement from a valid comparison (%s vs %s)', (current, prior, direction, movement) => {
  const os: PanoramaStory = {
    ...story, id: 'servicios_os_facturadas', title: 'OS facturadas a clientes',
    primary: { label: 'OS facturadas a cliente', value: current, unit: 'percent' },
    periodOptions: ['month', 'ytd'], time: { window: { from: '2026-10-01', to: '2026-10-31' } },
    series: [
      { from: '2026-09-01', to: '2026-09-30', value: prior, numerator: 8, denominator: 25, ids: [], cutoff: '2026-10-31', complete: true },
      { from: '2026-10-01', to: '2026-10-31', value: current, numerator: current === 40 ? 10 : 7, denominator: current === 40 ? 25 : 29, ids: [], cutoff: '2026-10-31', complete: true },
    ],
  };
  const { container } = render(<MemoryRouter><PanoramaStoryCard story={os} index={2} retrying={false} onRetry={vi.fn()} periodMode="month" onPeriodChange={vi.fn()} /></MemoryRouter>);
  const badge = container.querySelector('.story-os-movement');
  expect(badge).toHaveAttribute('data-direction', direction);
  expect(badge).toHaveTextContent(movement);
  expect(badge).toHaveTextContent('vs. mes anterior');
  expect(badge).toHaveAttribute('aria-label', expect.stringContaining('puntos porcentuales'));
});

it('labels the arithmetic OS movement when the current month is partial', () => {
  const os: PanoramaStory = {
    ...story, id: 'servicios_os_facturadas', title: 'OS facturadas a clientes',
    primary: { label: 'OS facturadas a cliente', value: 24.1, unit: 'percent' },
    time: { window: { from: '2026-10-01', to: '2026-10-20' } },
    series: [
      { from: '2026-09-01', to: '2026-09-30', value: 32, numerator: 8, denominator: 25, ids: [], cutoff: '2026-10-20', complete: true },
      { from: '2026-10-01', to: '2026-10-20', value: 24.1, numerator: 7, denominator: 29, ids: [], cutoff: '2026-10-20', complete: true },
    ],
  };
  const { container } = render(<MemoryRouter><PanoramaStoryCard story={os} index={2} retrying={false} onRetry={vi.fn()} periodMode="month" /></MemoryRouter>);
  const badge = container.querySelector('.story-os-movement');
  expect(badge).toHaveAttribute('data-direction', 'down');
  expect(badge).toHaveTextContent('−7,9 p.p.');
  expect(badge).toHaveTextContent('parcial vs mes ant. completo');
  expect(badge).toHaveAttribute('title', expect.stringContaining('no tramos equivalentes'));
});

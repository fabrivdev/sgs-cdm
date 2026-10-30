import { cloneElement, type ReactElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { ApprovedPanoramaCard } from './ApprovedPanoramaCard';

vi.mock('recharts', async importOriginal => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
    cloneElement(children, { width: 400, height: 140 }),
}));

afterEach(cleanup);

it('creates a real prior-year SVG path alongside the current area', () => {
  const story = {
    id: 'ventas_evolucion', title: 'Evolución de ventas', question: '', status: 'ready',
    message: '', scope: '', sections: ['repuestos.ventas'], cutoff: null, periodLabel: 'Octubre 2026',
    primary: { label: 'Ventas', value: 120, unit: 'USD' }, supporting: [],
    chart: { kind: 'trend', title: 'Ventas mensuales antes de NC', unit: 'USD', currentLabel: '2026', previousLabel: '2025',
      rows: [{ label: 'Ene', value: 50, previous: 100 }, { label: 'Feb', value: 0, previous: 80 }, { label: 'Mar', value: 120, previous: 110 }] },
    breakdown: [], details: [], source: '', route: '/repuestos/ventas',
  } satisfies PanoramaStory;
  render(<MemoryRouter><ApprovedPanoramaCard story={story} index={0} retrying={false} onRetry={() => {}} /></MemoryRouter>);
  const figure = screen.getByRole('figure', { name: 'Ventas mensuales antes de NC' });
  const previous = figure.querySelector<SVGPathElement>('.recharts-line .recharts-curve');
  const current = figure.querySelector<SVGPathElement>('.recharts-area .recharts-area-curve');
  expect(previous?.getAttribute('d')).toMatch(/^M/);
  expect(current?.getAttribute('d')).toMatch(/^M/);
  expect(figure.querySelectorAll('.recharts-line')).toHaveLength(1);
});

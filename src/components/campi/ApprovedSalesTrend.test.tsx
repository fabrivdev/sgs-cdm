import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanoramaStory, StoryChartRow } from '@/lib/campi/panoramaStoryTypes';
import { ApprovedPanoramaCard } from './ApprovedPanoramaCard';

const observed = vi.hoisted(() => ({
  containers: [] as string[], layers: [] as string[], strokes: [] as string[], dots: [] as unknown[], connects: [] as boolean[],
  rows: [] as { label: string; value: number | null; previous?: number | null }[],
  domain: [0, 1] as [number, number],
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children, data }: { children: ReactNode; data: typeof observed.rows }) => {
    observed.containers.push('area');
    observed.rows = data;
    return <svg>{children}</svg>;
  },
  ComposedChart: ({ children, data }: { children: ReactNode; data: typeof observed.rows }) => {
    observed.containers.push('composed');
    observed.rows = data;
    return <svg>{children}</svg>;
  },
  Area: ({ dataKey }: { dataKey: string }) => { observed.layers.push(`area:${dataKey}`); return null; },
  Line: ({ dataKey, stroke, dot, connectNulls }: { dataKey: string; stroke: string; dot: unknown; connectNulls: boolean }) => {
    observed.layers.push(`line:${dataKey}`);
    observed.strokes.push(stroke);
    observed.dots.push(dot);
    observed.connects.push(connectNulls);
    return null;
  },
  YAxis: ({ domain }: { domain: [number, number] }) => { observed.domain = domain; return null; },
  XAxis: () => null,
  Tooltip: () => null,
}));

beforeEach(() => { observed.containers = []; observed.layers = []; observed.strokes = []; observed.dots = []; observed.connects = []; observed.rows = []; });
afterEach(cleanup);

function sales(rows: StoryChartRow[]): PanoramaStory {
  return {
    id: 'ventas_evolucion', title: 'Evolución de ventas', question: '', status: 'ready',
    message: '', scope: '', sections: ['repuestos.ventas'], cutoff: null, periodLabel: 'Octubre 2026',
    primary: { label: 'Ventas', value: rows.at(-1)?.value ?? 0, unit: 'USD' }, supporting: [],
    chart: { kind: 'trend', title: 'Ventas mensuales antes de NC', unit: 'USD', currentLabel: '2026', previousLabel: '2025', rows },
    breakdown: [], details: [], source: '', route: '/repuestos/ventas',
  };
}

function show(rows: StoryChartRow[]) {
  render(<MemoryRouter><ApprovedPanoramaCard story={sales(rows)} index={0} retrying={false} onRetry={() => {}} /></MemoryRouter>);
}

describe('sales year comparison', () => {
  it('draws the prior year above the current area with matching contrasting legend', () => {
    show([{ label: 'Ene', value: 5, previous: 10 }, { label: 'Feb', value: 0, previous: 0 }, { label: 'Mar', value: 12, previous: 20 }]);
    expect(observed.containers).toEqual(['composed']);
    expect(observed.layers).toEqual(['area:value', 'line:previous']);
    expect(observed.strokes).toEqual(['#64748b']);
    expect(observed.dots).toEqual([false]);
    expect(observed.rows.map(row => row.previous)).toEqual([10, 0, 20]);
    expect(observed.domain[0]).toBeLessThanOrEqual(0);
    expect(observed.domain[1]).toBeGreaterThan(20);
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'Ventas mensuales antes de NC' })).toHaveClass('approved-trend--sales');
  });

  it('does not claim a prior-year line when only current values exist', () => {
    show([{ label: 'Ene', value: 0, previous: null }, { label: 'Feb', value: 12, previous: null }]);
    expect(observed.layers).toEqual(['area:value']);
    expect(screen.queryByText('2025')).not.toBeInTheDocument();
  });

  it('keeps separated prior fragments as markers without connecting null months', () => {
    show([{ label: 'Ene', value: 1, previous: 10 }, { label: 'Feb', value: 2, previous: null }, { label: 'Mar', value: 3, previous: 20 }]);
    expect(observed.rows[1].previous).toBeNull();
    expect(observed.layers).toEqual(['area:value', 'line:previous']);
    expect(observed.connects).toEqual([false]);
    expect(observed.dots[0]).toMatchObject({ r: 2.5 });
    expect(screen.getByText('2025')).toBeInTheDocument();
    cleanup();
    observed.layers = [];
    observed.dots = [];
    show([{ label: 'Ene', value: 1, previous: 10 }, { label: 'Feb', value: 2, previous: 20 }, { label: 'Mar', value: 3, previous: null }]);
    expect(observed.rows[2].previous).toBeNull();
    expect(observed.layers).toEqual(['area:value', 'line:previous']);
    expect(observed.dots).toEqual([false]);
  });

  it('shows a legitimate isolated zero from 2025 as a consultable point', () => {
    show([{ label: 'Ene', value: 1, previous: null }, { label: 'Feb', value: 2, previous: 0 }, { label: 'Mar', value: 3, previous: null }]);
    expect(observed.rows.map(row => row.previous)).toEqual([null, 0, null]);
    expect(observed.layers).toEqual(['area:value', 'line:previous']);
    expect(observed.dots[0]).toMatchObject({ r: 2.5 });
    expect(observed.connects).toEqual([false]);
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').some(item => item.textContent?.includes('Feb: $ 2; referencia $ 0'))).toBe(true);
  });
});

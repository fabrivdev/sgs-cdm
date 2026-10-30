import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { ApprovedPanoramaCard } from './ApprovedPanoramaCard';

afterEach(cleanup);

const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function coverage(values: (number | null)[]): PanoramaStory {
  return {
    id: 'clientes_cobertura_posventa', title: 'Cobertura de posventa', question: '¿Qué cobertura hay?',
    status: 'ready', message: '', scope: '', sections: ['parque.maquinas'], cutoff: null,
    periodLabel: 'Octubre 2026', periodMode: 'ytd', primary: { label: 'Cobertura', value: values.at(-1) ?? 0, unit: 'percent' },
    supporting: [], chart: { kind: 'trend', title: 'Cobertura mensual', unit: 'percent',
      rows: values.map((value, index) => ({ label: `${months[index]} 2026`, value })) },
    breakdown: [], details: [], source: '', route: '/clientes',
  };
}
function show(story: PanoramaStory, mode: 'month' | 'ytd' = 'ytd') {
  return render(<MemoryRouter><ApprovedPanoramaCard story={story} index={0} retrying={false} onRetry={() => {}} periodMode={mode} /></MemoryRouter>);
}

describe('monthly columns in approved cards', () => {
  it.each([1, 6, 7, 12])('keeps all %i real months in a width-fitting grid', count => {
    show(coverage(Array.from({ length: count }, (_, index) => index === 0 ? 0 : 10 + index)));
    const figure = screen.getByRole('figure', { name: 'Cobertura mensual' });
    const grid = figure.querySelector('.approved-monthly-columns')!;
    expect(grid).toHaveAttribute('data-density', count > 6 ? 'compact' : 'regular');
    expect(grid).toHaveStyle({ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` });
    expect(within(figure).getAllByRole('button')).toHaveLength(count);
    expect(within(figure).getByRole('button', { name: 'Ene 2026: 0%' })).toHaveTextContent('Ene');
    expect(within(figure).getByRole('button', { name: new RegExp(`^${months[count - 1]} 2026:`) })).toBeInTheDocument();
    expect(figure.querySelector('.approved-monthly-track i')).toHaveStyle({ height: '0%' });
  });

  it('distinguishes a missing month from zero and exposes the complete value on focus', () => {
    show(coverage([0, null, 100, 12.34, 16, 18, 20]));
    const figure = screen.getByRole('figure', { name: 'Cobertura mensual' });
    const missing = within(figure).getByRole('button', { name: 'Feb 2026: Sin datos' });
    expect(missing.querySelector('.approved-monthly-track i')).toBeNull();
    const complete = within(figure).getByRole('button', { name: 'Mar 2026: 100%' });
    complete.focus();
    expect(complete).toHaveFocus();
    expect(complete.querySelector('.approved-monthly-tooltip')).toHaveTextContent('Mar 2026: 100%');
  });

  it('fits monthly Agenda through the same grid while leaving weekly Agenda unchanged', () => {
    const monthly = { ...coverage(Array.from({ length: 12 }, () => 75)), id: 'agenda_cumplimiento' as const,
      chart: { kind: 'trend' as const, title: 'Agenda mensual', unit: 'percent' as const,
        rows: months.map(label => ({ label: `${label} 2026`, value: 75 })) } };
    const view = show(monthly);
    expect(screen.getByRole('figure', { name: 'Agenda mensual' }).querySelectorAll('.approved-monthly-column')).toHaveLength(12);
    view.rerender(<MemoryRouter><ApprovedPanoramaCard story={{ ...monthly, chart: { ...monthly.chart, rows: [{ label: 'Semana 1', value: 75 }] } }} index={0} retrying={false} onRetry={() => {}} periodMode="month" /></MemoryRouter>);
    expect(screen.getByRole('figure', { name: 'Agenda mensual' }).querySelector('.approved-agenda-scroll')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ene 2026/ })).not.toBeInTheDocument();
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { ApprovedPanoramaCard } from './ApprovedPanoramaCard';

afterEach(cleanup);

const story = (red: number, grey: number): PanoramaStory => ({
  id: 'repuestos_alertas', title: 'Próximos cambios de clasificación', question: '', status: 'ready',
  message: '', scope: '', sections: ['repuestos.analisis'], cutoff: null, periodLabel: '',
  primary: { label: 'Valor expuesto', value: red + grey, unit: 'USD' }, supporting: [],
  chart: { kind: 'bars', title: 'Cambios posibles por ventana', unit: 'USD', rows: [
    { label: '1–7 días', value: red + grey }, { label: '8–14 días', value: 0 },
    { label: '15–21 días', value: 0 }, { label: '22–30 días', value: 0 },
  ] },
  changeBuckets: [
    { label: '1–7 días', gris: { value: grey, count: grey ? 1 : 0 }, rojo: { value: red, count: red ? 1 : 0 } },
    ...['8–14 días', '15–21 días', '22–30 días'].map(label => ({
      label, gris: { value: 0, count: 0 }, rojo: { value: 0, count: 0 },
    })),
  ],
  breakdown: [], details: [], source: '', route: '/repuestos/analisis',
});

function show(value: PanoramaStory) {
  render(<MemoryRouter><ApprovedPanoramaCard story={value} index={0} retrying={false} onRetry={() => {}} /></MemoryRouter>);
  return screen.getByRole('figure', { name: 'Cambios posibles por ventana' });
}

describe('classification changes chart', () => {
  it('renders a red and a grey bar for the same time window on one common zero-based scale', () => {
    const figure = show(story(70, 30));
    expect(figure.querySelectorAll('.approved-change-column')).toHaveLength(4);
    expect(figure.querySelectorAll('i[data-destination="rojo"]')).toHaveLength(4);
    expect(figure.querySelectorAll('i[data-destination="gris"]')).toHaveLength(4);
    expect(figure.querySelector('.approved-change-column i[data-destination="rojo"]')).toHaveStyle({ height: '100%' });
    expect(figure.querySelector('.approved-change-column i[data-destination="gris"]')).toHaveStyle({ height: `${30 / 70 * 100}%` });
  });

  it('keeps a real zero at zero and refuses a breakdown that does not reconcile', () => {
    const figure = show(story(0, 30));
    expect(figure.querySelector('.approved-change-column i[data-destination="rojo"]')).toHaveStyle({ height: '0%' });
    cleanup();
    const inconsistent = story(70, 30);
    inconsistent.changeBuckets![0].rojo.value = 60;
    render(<MemoryRouter><ApprovedPanoramaCard story={inconsistent} index={0} retrying={false} onRetry={() => {}} /></MemoryRouter>);
    expect(screen.getByText('Distribución de cambios no conciliada')).toBeInTheDocument();
  });
});

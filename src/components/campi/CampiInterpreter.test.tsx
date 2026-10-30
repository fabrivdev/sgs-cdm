import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampiInterpreter } from './CampiInterpreter';
import { MemoryRouter } from 'react-router-dom';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { buildCampiComments } from '@/lib/campi/campiComments';
vi.mock('./CampiPanoramaAvatar', () => ({ CampiPanoramaAvatar: ({ mood }: { mood?: string }) => <div data-mood={mood}>Mascota</div> }));
afterEach(cleanup);
const billing: PanoramaStory = { id: 'ventas_facturacion', title: 'Facturación', question: '¿Cómo viene la facturación?', status: 'ready', message: '', scope: 'Repuestos', sections: ['repuestos.ventas'], cutoff: null, periodLabel: 'Octubre', primary: { label: 'Facturación del mes', value: 448000, unit: 'USD', comparison: { value: 400000, label: 'Mismo tramo de 2025' } }, supporting: [], chart: { kind: 'bars', title: 'Áreas', unit: 'USD', rows: [{ label: 'Repuestos', value: 300000, previous: 260000 }, { label: 'Servicios', value: 148000, previous: 140000 }] }, breakdown: [], details: [], source: 'Prueba', route: '/repuestos/ventas' };
const resolution: PanoramaStory = { ...billing, id: 'servicios_pendientes', title: 'Resolución de OS', sections: ['servicios.ordenes'], primary: { label: 'Mediana', value: 14, unit: 'days', comparison: { value: 16, label: 'Mes anterior' } }, supporting: [{ label: 'OS cerradas en octubre', value: 26, unit: 'count' }, { label: 'OS cerradas en septiembre', value: 22, unit: 'count' }], breakdown: [{ label: 'Cerradas en octubre', value: 26, unit: 'count', route: '/servicios/ordenes?estado=cerrada' }], chart: null };
describe('Campi synthesis', () => {
  it('abre directamente el grupo de clasificación mencionado por Campi', () => {
    const alert: PanoramaStory = { ...billing, id: 'repuestos_alertas', title: 'Cambios próximos de clasificación', sections: ['repuestos.analisis'],
      primary: { label: 'Valor expuesto', value: 60, unit: 'USD' }, supporting: [{ label: 'Códigos expuestos', value: 1, unit: 'count' }],
      changeBuckets: [
        { label: '1–7 días', gris: { count: 0, value: 0 }, rojo: { count: 1, value: 60 } },
        { label: '8–14 días', gris: { count: 0, value: 0 }, rojo: { count: 0, value: 0 } },
        { label: '15–21 días', gris: { count: 0, value: 0 }, rojo: { count: 0, value: 0 } },
        { label: '22–30 días', gris: { count: 0, value: 0 }, rojo: { count: 0, value: 0 } },
      ],
    };
    render(<MemoryRouter><CampiInterpreter stories={[alert]} loading={false} onOpenStory={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Explorar Cambios próximos de clasificación' })).toHaveAttribute('href', expect.stringContaining('color=GRIS&compra_dias_min=994&compra_dias_max=1000'));
  });
  it('rota variantes del único tema y Explorar corresponde al texto visible', () => {
    vi.useFakeTimers();
    const storageKey = 'sig-cdm:campi:repuestos-alertas-cycle:v1:solo-alerta';
    localStorage.removeItem(storageKey);
    try {
      const alert: PanoramaStory = { ...billing, id: 'repuestos_alertas', title: 'Cambios próximos de clasificación', sections: ['repuestos.analisis'],
        primary: { label: 'Valor expuesto', value: 60, unit: 'USD' }, supporting: [{ label: 'Códigos expuestos', value: 1, unit: 'count' }],
        changeBuckets: [
          { label: '1–7 días', gris: { count: 0, value: 0 }, rojo: { count: 1, value: 60 } },
          { label: '8–14 días', gris: { count: 0, value: 0 }, rojo: { count: 0, value: 0 } },
          { label: '15–21 días', gris: { count: 0, value: 0 }, rojo: { count: 0, value: 0 } },
          { label: '22–30 días', gris: { count: 0, value: 0 }, rojo: { count: 0, value: 0 } },
        ],
      };
      const view = render(<MemoryRouter><CampiInterpreter stories={[alert]} loading={false} userId="solo-alerta" /></MemoryRouter>);
      expect(screen.getByRole('heading', { name: /podría pasar a rojo/ })).toBeInTheDocument();
      const firstRoute = screen.getByRole('link', { name: 'Explorar Cambios próximos de clasificación' }).getAttribute('href');
      act(() => vi.advanceTimersByTime(25000));
      expect(screen.getByRole('heading', { name: /próximo umbral/ })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Explorar Cambios próximos de clasificación' })).toHaveAttribute('href', firstRoute);
      view.unmount();
      render(<MemoryRouter><CampiInterpreter stories={[alert]} loading={false} userId="solo-alerta" /></MemoryRouter>);
      expect(screen.getByRole('heading', { name: /valor Kardex positivo/ })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Explorar Cambios próximos de clasificación' })).toHaveAttribute('href', firstRoute);
    } finally { localStorage.removeItem(storageKey); vi.useRealTimers(); }
  });
  it('cambia Explorar al otro destino cuando la variante visible menciona esa franja', () => {
    vi.useFakeTimers();
    try {
      const alert: PanoramaStory = { ...billing, id: 'repuestos_alertas', title: 'Cambios próximos de clasificación', sections: ['repuestos.analisis'],
        primary: { label: 'Valor expuesto', value: 100, unit: 'USD' }, supporting: [{ label: 'Códigos expuestos', value: 2, unit: 'count' }],
        changeBuckets: [
          { label: '1–7 días', gris: { count: 1, value: 40 }, rojo: { count: 1, value: 60 } },
          { label: '8–14 días', gris: { count: 0, value: 0 }, rojo: { count: 0, value: 0 } },
          { label: '15–21 días', gris: { count: 0, value: 0 }, rojo: { count: 0, value: 0 } },
          { label: '22–30 días', gris: { count: 0, value: 0 }, rojo: { count: 0, value: 0 } },
        ],
      };
      const comments = buildCampiComments([alert], null);
      const otherIndex = comments.findIndex(comment => comment.key.endsWith(':otra_franja'));
      expect(otherIndex).toBeGreaterThan(0);
      render(<MemoryRouter><CampiInterpreter stories={[alert]} loading={false} /></MemoryRouter>);
      expect(screen.getByRole('link', { name: 'Explorar Cambios próximos de clasificación' })).toHaveAttribute('href', expect.stringContaining('color=GRIS'));
      for (let index = 0; index < otherIndex; index += 1) act(() => vi.advanceTimersByTime(25000));
      expect(screen.getByRole('heading', { name: /Abrí esa franja/ })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Explorar Cambios próximos de clasificación' })).toHaveAttribute('href', expect.stringContaining('color=LILA'));
    } finally { vi.useRealTimers(); }
  });
  it('keeps the verified summary and direct data action without a question panel', () => {
    const openStory = vi.fn();
    render(<CampiInterpreter stories={[billing]} loading={false} onOpenStory={openStory} />);
    expect(screen.getByRole('heading', { name: /Facturación: facturación del mes subió 12%/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preguntale a Campi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Explorar Facturación' }));
    expect(openStory).toHaveBeenCalledWith('ventas_facturacion');
  });
  it('shows an evidenced finding and a working primary action', () => {
    const openStory = vi.fn();
    render(<CampiInterpreter stories={[billing]} loading={false} onOpenStory={openStory} />);
    expect(screen.getByRole('heading', { name: /Facturación: facturación del mes subió 12%/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Mayor diferencia entre áreas: Repuestos \(\$ 260.000 → \$ 300.000\)/ })).toBeInTheDocument();
    expect(screen.getByText('Mascota')).toHaveAttribute('data-mood', 'sereno');
    expect(screen.getByText('Cambio observado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Explorar Facturación' }));
    expect(openStory).toHaveBeenCalledWith('ventas_facturacion');
  });
  it('does not turn an unchanged total into a Campi comment', () => {
    render(<CampiInterpreter stories={[{ ...billing, primary: { ...billing.primary!, comparison: undefined } }]} loading={false} onOpenStory={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /No encontré cambios relevantes comprobados/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Explorar/ })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Explorar Facturación' }));
    expect(openStory).toHaveBeenCalledWith('ventas_facturacion');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('rotates verified comments and Explorar opens the topic currently visible', () => {
    vi.useFakeTimers();
    try {
      const openStory = vi.fn();
      render(<CampiInterpreter stories={[billing, resolution]} loading={false} onOpenStory={openStory} />);
      expect(screen.getByRole('button', { name: 'Explorar Facturación' })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(25000));
      expect(screen.getByRole('heading', { name: /Resolución de OS: la mediana bajó 2 días/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Explorar Resolución de OS' }));
      expect(openStory).toHaveBeenCalledWith('servicios_pendientes');
      act(() => vi.advanceTimersByTime(25000));
      expect(screen.getByRole('button', { name: 'Explorar Facturación' })).toBeInTheDocument();
      expect(screen.getByText('1 de 2').closest('.panorama-hero')?.querySelector('.campi-synthesis')).toHaveAttribute('aria-live', 'off');
    } finally { vi.useRealTimers(); }
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
      render(<CampiInterpreter stories={[billing, resolution]} loading={false} onOpenStory={vi.fn()} />);
      const explore = screen.getByRole('button', { name: 'Explorar Facturación' });
      const hero = explore.closest('.panorama-hero')!;
      fireEvent.pointerEnter(hero);
      act(() => vi.advanceTimersByTime(26000));
      expect(screen.getByText('1 de 2')).toBeInTheDocument();
      fireEvent.keyDown(explore, { key: 'Tab' });
      fireEvent.pointerLeave(hero);
      act(() => vi.advanceTimersByTime(26000));
      expect(screen.getByText('1 de 2')).toBeInTheDocument();
      fireEvent.pointerDown(explore);
      act(() => vi.advanceTimersByTime(25000));
      expect(screen.getByText('2 de 2')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(25000));
      expect(screen.getByText('1 de 2')).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
  it('does not invent an action when no verified story is available', () => {
    render(<CampiInterpreter stories={[]} loading={false} />);
    expect(screen.getByRole('heading', { name: /Todavía no tengo cifras verificadas/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Explorar/ })).not.toBeInTheDocument();
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

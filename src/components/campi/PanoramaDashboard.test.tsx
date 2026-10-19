import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanoramaDashboard } from './PanoramaDashboard';
import { PANORAMA_TOPICS, type PanoramaTopicId } from '@/lib/campi/panoramaPreferences';
import type { PanoramaStory, StoryTopicId } from '@/lib/campi/panoramaStoryTypes';
import { saveStoryVisit, readStoryVisit } from '@/lib/campi/panoramaStoryVisits';
import type { SectionKey } from '@/lib/permissions';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/campi/panoramaStories', () => ({
  loadPanoramaStories: load,
  storySectionsForTopics: (topics: readonly string[], permitted: (section: SectionKey) => boolean) => [...new Set(PANORAMA_TOPICS.filter(topic => topics.includes(topic.id)).flatMap(topic => topic.sections.filter(permitted)))],
}));
vi.mock('./CampiPanoramaAvatar', () => ({ CampiPanoramaAvatar: () => <div>Campi</div> }));
vi.mock('recharts', async importOriginal => {
  const real = await importOriginal<typeof import('recharts')>();
  return { ...real, ResponsiveContainer: ({ children }: { children: React.ReactElement }) => <div>{children}</div> };
});
beforeEach(() => { load.mockReset(); localStorage.clear(); });
afterEach(cleanup);

const story = (id: StoryTopicId, overrides: Partial<PanoramaStory> = {}): PanoramaStory => ({
  id, title: `Tema ${id}`, question: `¿Cómo viene ${id}?`, status: 'ready', message: 'Conclusión verificada', scope: 'Alcance autorizado', sections: ['repuestos.ventas'], cutoff: null, periodLabel: 'Octubre 2026',
  primary: { label: 'Principal', value: 1234.56, unit: 'USD' }, supporting: [{ label: 'Mismo período del año anterior', value: 1000, unit: 'USD' }, { label: 'Acumulado anual', value: 5000, unit: 'USD' }],
  chart: { kind: 'trend', title: `Evolución ${id}`, unit: 'USD', rows: [{ label: 'Septiembre', value: 100 }, { label: 'Octubre', value: 1234.56 }] },
  breakdown: [{ label: 'Repuestos', value: 1234.56, unit: 'USD' }], details: ['Se conservan las notas de crédito.'], source: 'Fuente verificada', route: '/repuestos/ventas', ...overrides,
});
function show(topics: PanoramaTopicId[] = ['ventas_facturacion'], hasAccess: (section: SectionKey) => boolean = () => true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><PanoramaDashboard userId="manager-a" topics={topics} available={PANORAMA_TOPICS} hasAccess={hasAccess} onEdit={vi.fn()} /></MemoryRouter></QueryClientProvider>);
}

describe('Campi alternative story dashboard', () => {
  it('renders every selected topic and chart in the chosen order, including the fourth', async () => {
    const ids: StoryTopicId[] = ['maquinas_stock', 'ventas_facturacion', 'repuestos_stock', 'maquinas_proyeccion'];
    load.mockResolvedValue([...ids].reverse().map(id => story(id)));
    show(ids);
    await screen.findByRole('heading', { name: 'Tema maquinas_proyeccion' });
    expect(screen.getAllByRole('article').map(item => item.getAttribute('data-story'))).toEqual(ids);
    ids.forEach(id => expect(screen.getByRole('figure', { name: `Evolución ${id}` })).toBeInTheDocument());
    expect(screen.queryByText(/Datos al/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('keeps all eight selected topics and explains the extra rows', async () => {
    const ids = PANORAMA_TOPICS.map(topic => topic.id);
    load.mockResolvedValue(ids.map(id => story(id)));
    show(ids);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(8));
    expect(screen.getByText(/Elegiste 8 temas/)).toHaveTextContent('Se muestran todos');
  });
  it('opens the native detail with comparisons, breakdown, method and specific navigation', async () => {
    load.mockResolvedValue([story('ventas_facturacion')]); show();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle de Tema ventas_facturacion' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Mismo período del año anterior')).toBeInTheDocument();
    expect(within(dialog).getByText('Acumulado anual')).toBeInTheDocument();
    expect(within(dialog).getByText('Repuestos')).toBeInTheDocument();
    expect(within(dialog).getByText('Se conservan las notas de crédito.')).toBeInTheDocument();
    expect(within(dialog).getByText('Fuente: Fuente verificada')).toBeInTheDocument();
    expect(within(dialog).getByRole('link')).toHaveAttribute('href', '/repuestos/ventas');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('passes only granted sources and suppresses aggregates containing denied sources', async () => {
    load.mockResolvedValue([story('ventas_facturacion', { sections: ['repuestos.ventas', 'servicios.ventas'], message: 'Secreto de servicios' })]);
    show(['ventas_facturacion'], section => section === 'repuestos.ventas');
    await waitFor(() => expect(load).toHaveBeenCalledWith(['ventas_facturacion'], ['repuestos.ventas'], expect.any(String)));
    expect(await screen.findByText(/Hay temas sin una respuesta autorizada/)).toBeInTheDocument();
    expect(screen.queryByText('Secreto de servicios')).not.toBeInTheDocument();
    expect(screen.queryByText('$ 1.234,56')).not.toBeInTheDocument();
  });
  it('shows source errors with retry and never substitutes zero', async () => {
    load.mockResolvedValueOnce([story('ventas_facturacion', { status: 'error', message: 'No respondió Ventas.', primary: null, supporting: [], chart: null })]).mockResolvedValueOnce([story('ventas_facturacion')]);
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('No respondió Ventas.');
    expect(screen.queryByText('$ 0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar fuente' }));
    expect(await screen.findByText('$ 1.234,56')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('retains the explicit absence of a metric and presents an empty topic', async () => {
    load.mockResolvedValue([story('ventas_facturacion', { status: 'empty', message: 'No hay datos para este período.', primary: { label: 'Principal', value: null, unit: 'USD' }, supporting: [], chart: null })]); show();
    expect(await screen.findByText('No hay datos para este período.')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('$ 0')).not.toBeInTheDocument();
  });
  it('does not query sources or reveal topics removed by permissions', async () => {
    show(['maquinas_stock'], () => false);
    expect(screen.getByRole('button', { name: 'Elegir temas para Panorama' })).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });
  it('compares a local baseline without rebasing the displayed change or claiming new sales', async () => {
    saveStoryVisit('manager-a', [story('ventas_facturacion', { primary: { label: 'Principal', value: 1000, unit: 'USD' } })], '2026-10-15T10:00:00Z');
    load.mockResolvedValue([story('ventas_facturacion')]); show();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle de Tema ventas_facturacion' }));
    expect(await screen.findByText('El total visible cambió +$ 234,56 desde tu última visita en este navegador.')).toBeInTheDocument();
    await waitFor(() => expect(readStoryVisit('manager-a')?.values[0].value).toBe(1234.56));
    expect(screen.getByText('El total visible cambió +$ 234,56 desde tu última visita en este navegador.')).toBeInTheDocument();
    expect(screen.queryByText(/ventas nuevas/i)).not.toBeInTheDocument();
  });
  it('preserves the old baseline while any topic has failed', async () => {
    saveStoryVisit('manager-a', [story('ventas_facturacion')], '2026-10-15T10:00:00Z');
    load.mockResolvedValue([story('ventas_facturacion', { primary: { label: 'Principal', value: 3000, unit: 'USD' } }), story('maquinas_stock', { status: 'error' })]);
    show(['ventas_facturacion', 'maquinas_stock']);
    await screen.findByRole('heading', { name: 'Tema maquinas_stock' });
    expect(readStoryVisit('manager-a')?.at).toBe('2026-10-15T10:00:00Z');
  });
  it('records a complete empty result with a genuine zero alongside the other topics', async () => {
    saveStoryVisit('manager-a', [story('ventas_facturacion')], '2026-10-15T10:00:00Z');
    load.mockResolvedValue([story('ventas_facturacion', { primary: { label: 'Principal', value: 3000, unit: 'USD' } }), story('servicios_pendientes', { status: 'empty', primary: { label: 'Órdenes abiertas', value: 0, unit: 'count' }, supporting: [], chart: null })]);
    show(['ventas_facturacion', 'servicios_pendientes']);
    await screen.findByRole('heading', { name: 'Tema servicios_pendientes' });
    await waitFor(() => expect(readStoryVisit('manager-a')?.values.find(value => value.id === 'servicios_pendientes')?.value).toBe(0));
    expect(readStoryVisit('manager-a')?.values.find(value => value.id === 'ventas_facturacion')?.value).toBe(3000);
    expect(readStoryVisit('manager-a')?.at).not.toBe('2026-10-15T10:00:00Z');
  });
  it('shows a recoverable query error instead of stale or invented results', async () => {
    load.mockRejectedValue(new Error('Offline')); show();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar Panorama');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});

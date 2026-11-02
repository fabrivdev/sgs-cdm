import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { machineImportsStory } from '@/lib/campi/machineImports';
import { asuncionDay } from '@/lib/campi/factualRounds';
import { PanoramaDashboard } from './PanoramaDashboard';
import { PANORAMA_TOPICS, type PanoramaTopicId } from '@/lib/campi/panoramaPreferences';
import type { PanoramaStory, StoryTopicId } from '@/lib/campi/panoramaStoryTypes';
import { saveStoryVisit, readStoryVisit } from '@/lib/campi/panoramaStoryVisits';
import type { SectionKey } from '@/lib/permissions';
import { readPeriodPreferences, savePeriodChoice } from '@/lib/campi/automaticPeriod';
import { loadBusinessClosures } from '@/lib/campi/businessCalendar';

vi.mock('@/lib/campi/businessCalendar', () => ({ loadBusinessClosures: vi.fn(async () => []) }));
const { load, bankLoad, bankSources } = vi.hoisted(() => ({ load: vi.fn(), bankLoad: vi.fn(async () => []), bankSources: vi.fn(() => []) }));
vi.mock('@/lib/campi/businessSources', () => ({ BUSINESS_SOURCE_TOPICS: {sales:'ventas_evolucion',orders:'maquinas_pedidos',customers:'clientes_cobertura_posventa'}, selectedBusinessSources: bankSources, selectedBusinessStories: (stories: PanoramaStory[],topics:StoryTopicId[]) => stories.filter(s=>topics.includes(s.id)), loadBusinessSources: bankLoad }));
vi.mock('@/lib/campi/panoramaStories', () => ({
  loadPanoramaStories: load,
  storySectionsForTopics: (topics: readonly string[], permitted: (section: SectionKey) => boolean) => [...new Set(PANORAMA_TOPICS.filter(topic => topics.includes(topic.id)).flatMap(topic => topic.sections.filter(permitted)))],
}));
vi.mock('./CampiPanoramaAvatar', () => ({ CampiPanoramaAvatar: () => <div>Campi</div> }));
vi.mock('recharts', async importOriginal => {
  const real = await importOriginal<typeof import('recharts')>();
  return { ...real, ResponsiveContainer: ({ children }: { children: React.ReactElement }) => <div>{children}</div> };
});
beforeEach(() => { vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(new Date('2026-10-20T15:00:00Z')); load.mockReset(); bankLoad.mockClear(); bankSources.mockReset(); bankSources.mockReturnValue([]); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const story = (id: StoryTopicId, overrides: Partial<PanoramaStory> = {}): PanoramaStory => ({
  id, title: `Tema ${id}`, question: `¿Cómo viene ${id}?`, status: 'ready', message: 'Conclusión verificada', scope: 'Alcance autorizado', sections: ['repuestos.ventas'], cutoff: null, time:{window:{from:asuncionDay().slice(0,7)+'-01',to:asuncionDay()}}, periodLabel: 'Octubre 2026',
  primary: { label: 'Principal', value: 1234.56, unit: 'USD' }, supporting: [{ label: 'Mismo período del año anterior', value: 1000, unit: 'USD' }, { label: 'Acumulado anual', value: 5000, unit: 'USD' }],
  chart: { kind: 'trend', title: `Evolución ${id}`, unit: 'USD', rows: [{ label: 'Septiembre', value: 100 }, { label: 'Octubre', value: 1234.56 }] },
  breakdown: [{ label: 'Repuestos', value: 1234.56, unit: 'USD' }], details: ['Se conservan las notas de crédito.'], source: 'Fuente verificada', route: '/repuestos/ventas', ...overrides,
});
function show(topics: PanoramaTopicId[] = ['ventas_facturacion'], hasAccess: (section: SectionKey) => boolean = () => true, onEdit = vi.fn(), greetingName?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><PanoramaDashboard userId="manager-a" greetingName={greetingName} topics={topics} available={PANORAMA_TOPICS} hasAccess={hasAccess} onEdit={onEdit} /></MemoryRouter></QueryClientProvider>);
}

describe('Campi alternative story dashboard', () => {
  it('renders annual imports through the actual approved-card registry with the inactive sibling tabs', async () => {
    const imports = machineImportsStory({ observedAt: asuncionDay(), year: 2026, total: 5, completed: 2, completionPercent: 40,
      excludedMissingETA: 1, excludedOtherYears: 2, excludedCancelled: 0,
      states: { PLANIFICADO: 1, EN_TRANSITO: 1, ARRIBADO: 1, COMPLETADO: 2 },
      brands: [{label:'CLAAS',total:3,completed:1},{label:'HORSCH',total:2,completed:1}] });
    load.mockResolvedValue([imports]);
    show(['maquinas_importacion'], section => section === 'parque.importaciones');
    await screen.findByRole('link', { name: 'Abrir importaciones: Importaciones de máquinas' });
    const card = screen.getByRole('heading', { name: 'Importaciones de máquinas' }).closest('article')!;
    expect(card).toHaveClass('approved-story-card');
    expect(card).toHaveAttribute('data-topic', 'maquinas_importacion');
    expect(card.querySelector('.story-mini-bars')).toBeNull();
    expect(card.querySelector('.machine-imports-columns')).toBeNull();
    expect(within(card).getByLabelText('Completadas sobre previstas en 2026: 40%')).toBeInTheDocument();
    expect(within(card).getByLabelText('Planificado: 1 de 5').querySelector('i')).toHaveStyle({width:'20%'});
    expect(within(card).getByText('2 de 5 completadas · 2026')).toBeInTheDocument();
    const period=within(card).getByRole('group',{name:'Período de Importaciones de máquinas'});
    expect(within(period).getByRole('button',{name:'Mes'})).toBeDisabled();
    expect(within(period).getByRole('button',{name:'Acum.'})).toBeDisabled();
    expect(screen.getByRole('heading',{name:/En 2026, 2 de 5 máquinas previstas por embarque estimado están completadas: 40%/})).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith(['maquinas_importacion'], ['parque.importaciones'], asuncionDay(), 'month');
  });

  it('keeps the greeting in the page h1 and colors only the name', () => {
    load.mockReturnValue(new Promise(() => {}));
    show(['ventas_facturacion'], () => true, vi.fn(), 'Ana Pérez');
    const heading = screen.getByRole('heading', { level: 1, name: /Hola Ana Pérez\s*! Este es tu panorama:/ });
    expect(heading).toHaveTextContent('Hola Ana Pérez! Este es tu panorama:');
    expect(heading).toContainElement(screen.getByText('Ana Pérez'));
    expect(screen.getByText('Ana Pérez')).toHaveClass('panorama-greeting-name');
  });
  it('uses the neutral greeting while the profile has not loaded', () => {
    load.mockReturnValue(new Promise(() => {}));
    show();
    expect(screen.getByRole('heading', { level: 1, name: /Hola Usuario\s*! Este es tu panorama:/ })).toHaveTextContent('Hola Usuario! Este es tu panorama:');
  });
  it('removes topic review and the priorities heading while keeping the editor available', async () => {
    localStorage.setItem('sig-cdm:panorama:alternativa:v1:manager-a', '["ventas_facturacion"]');
    load.mockImplementation(async (ids: StoryTopicId[]) => ids.map(id => story(id, { sections: ['servicios.ordenes'] })));
    const onEdit = vi.fn();
    show(['ventas_facturacion'], section => section === 'servicios.ordenes' || section === 'servicios.ventas', onEdit);
    await screen.findByRole('heading', { name: 'Facturación neta' });
    expect(screen.queryByRole('button', { name: 'Revisar temas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tus prioridades' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar prioridades' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(localStorage.getItem('sig-cdm:panorama:alternativa:v1:manager-a')).toBe('["ventas_facturacion"]');
  });
  it('loads the consolidated sales topic once for its authorized section', async () => {
    load.mockResolvedValue([story('ventas_facturacion', { sections: ['servicios.ventas'] })]);
    show(['ventas_facturacion'], section => section === 'servicios.ventas');
    await screen.findByRole('heading', { name: 'Facturación neta' });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(['ventas_facturacion'], ['servicios.ventas'], expect.any(String), 'month');
  });
  it('changes Mes and Acum. per card without changing snapshot topics', async () => {
    load.mockImplementation(async (ids: StoryTopicId[], _sections: SectionKey[], _asOf: string, period: string) => ids.map(id => story(id, {
      periodMode: period === 'ytd' ? 'ytd' : 'month',
      periodOptions: id === 'ventas_facturacion' ? ['month', 'ytd'] : undefined,
      primary: { label: 'Principal', value: period === 'ytd' ? 5000 : 1000, unit: 'USD' },
    })));
    show(['ventas_facturacion', 'repuestos_stock']);
    await screen.findByRole('heading', { name: 'Facturación neta' });
    const switcher = await screen.findByRole('group', { name: 'Período de Facturación neta' });
    expect(within(switcher).getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('group', { name: 'Período de Stock antiguo de repuestos' })).getByRole('button', { name: 'Acum.' })).toBeDisabled();
    fireEvent.click(within(switcher).getByRole('button', { name: 'Acum.' }));
    await waitFor(() => expect(load).toHaveBeenCalledWith(['ventas_facturacion'], expect.any(Array), expect.any(String), 'ytd'));
    await waitFor(() => expect(within(screen.getByRole('group', { name: 'Período de Facturación neta' })).getByRole('button', { name: 'Acum.' })).toHaveAttribute('aria-pressed', 'true'));
    expect(load).not.toHaveBeenCalledWith(['repuestos_stock'], expect.any(Array), expect.any(String), 'ytd');
  });
  it('renders every selected topic and chart in the chosen order, including the fourth', async () => {
    const ids: StoryTopicId[] = ['maquinas_pedidos', 'ventas_facturacion', 'repuestos_stock', 'servicios_os_facturadas'];
    load.mockResolvedValue([...ids].reverse().map(id => story(id)));
    show(ids);
    await screen.findByRole('heading', { name: 'OS facturadas a clientes' });
    await waitFor(() => expect(screen.getAllByRole('article').map(item => item.getAttribute('data-story') ?? item.getAttribute('data-topic'))).toEqual(ids));
    expect(screen.getAllByRole('figure').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Datos al/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Abrir / })).toHaveLength(4);
  });
  it('keeps all selected topics without adding an explanatory line', async () => {
    const ids = PANORAMA_TOPICS.map(topic => topic.id);
    load.mockResolvedValue(ids.map(id => story(id)));
    show(ids);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(ids.length));
    expect(screen.queryByText(/Elegiste .* temas/)).not.toBeInTheDocument();
  });
  it('shows every selected topic while sources are still loading', () => {
    load.mockReturnValue(new Promise(() => {}));
    const ids: StoryTopicId[] = ['servicios_pendientes', 'repuestos_stock'];
    show(ids);
    expect(screen.getAllByRole('status', { name: /Consultando/ })).toHaveLength(ids.length);
    expect(screen.getByRole('heading', { name: 'Resolución de órdenes de servicio' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stock antiguo de repuestos' })).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
  it('reveals a verified topic while a slower authorized source is still loading', async () => {
    load.mockImplementation((ids: StoryTopicId[]) => ids[0] === 'ventas_facturacion'
      ? new Promise(() => {}) : Promise.resolve([story(ids[0]) ]));
    show(['ventas_facturacion', 'repuestos_stock']);
    await screen.findByRole('heading', { name: 'Stock antiguo de repuestos' });
    expect(screen.getByRole('status', { name: /Consultando Facturación/ })).toBeInTheDocument();
    expect(await screen.findByText('$ 1.235')).toBeInTheDocument();
  });
  it('offers an area selector only for consolidated sales, without opening a detail panel', async () => {
    load.mockResolvedValue([story('ventas_facturacion', { sections: ['repuestos.ventas', 'servicios.ventas'], navigationPeriod: { from: '2026-10-01', to: '2026-10-20' } })]); show();
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Abrir facturación: Facturación neta' }), { key: 'Enter' });
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Ventas de repuestos/ })).toHaveAttribute('href', '/repuestos/ventas?desde=2026-10-01&hasta=2026-10-20');
    expect(within(menu).getByRole('menuitem', { name: /Ventas de servicios/ })).toHaveAttribute('href', '/servicios/ventas?desde=2026-10-01&hasta=2026-10-20');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('passes only granted sources and suppresses aggregates containing denied sources', async () => {
    load.mockResolvedValue([story('ventas_facturacion', { sections: ['repuestos.ventas', 'servicios.ventas'], message: 'Secreto de servicios' })]);
    show(['ventas_facturacion'], section => section === 'repuestos.ventas');
    await waitFor(() => expect(load).toHaveBeenCalledWith(['ventas_facturacion'], ['repuestos.ventas'], expect.any(String), 'month'));
    expect(await screen.findByText(/La fuente no devolvió una respuesta completa/)).toBeInTheDocument();
    expect(screen.queryByText('Secreto de servicios')).not.toBeInTheDocument();
    expect(screen.queryByText('$ 1.234,56')).not.toBeInTheDocument();
  });
  it('shows source errors with retry and never substitutes zero', async () => {
    load.mockResolvedValueOnce([story('ventas_facturacion', { status: 'error', message: 'No respondió Ventas.', primary: null, supporting: [], chart: null })]).mockResolvedValueOnce([story('ventas_facturacion')]);
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('No respondió Ventas.');
    expect(screen.queryByText('$ 0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar fuente' }));
    expect(await screen.findByText('$ 1.235')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('retains the explicit absence of a metric and presents an empty topic', async () => {
    load.mockResolvedValue([story('ventas_facturacion', { status: 'empty', message: 'No hay datos para este período.', primary: { label: 'Principal', value: null, unit: 'USD' }, supporting: [], chart: null })]); show();
    expect(await screen.findByText(/Sin datos/)).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('$ 0')).not.toBeInTheDocument();
  });
  it('does not query sources or reveal topics removed by permissions', async () => {
    show(['maquinas_stock'], () => false);
    expect(screen.getByRole('button', { name: 'Elegir temas para Panorama' })).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });
  it('keeps a local baseline without labeling an interannual comparison as a visit change', async () => {
    saveStoryVisit('manager-a', [story('ventas_facturacion', { primary: { label: 'Principal', value: 1000, unit: 'USD' } })], '2026-10-15T10:00:00Z');
    sessionStorage.clear();
    load.mockResolvedValue([story('ventas_facturacion', { primary: { label: 'Principal', value: 1234.56, unit: 'USD', comparison: { value: 1000, label: 'Mismo tramo LY' } } })]); show();
    expect(await screen.findByRole('heading', { name: /facturación neta/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Comparación de Facturación neta desde tu última visita/)).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Abrir facturación: Facturación neta' })).toHaveAttribute('href', '/repuestos/ventas');
    await waitFor(() => expect(JSON.parse(localStorage.getItem('sig-cdm:panorama:alternativa:visita:v1:manager-a')!).values[0].value).toBe(1234.56));
    expect(readStoryVisit('manager-a')?.values[0].value).toBe(1000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/ventas nuevas/i)).not.toBeInTheDocument();
  });
  it('preserves the old baseline while any topic has failed', async () => {
    saveStoryVisit('manager-a', [story('ventas_facturacion')], '2026-10-15T10:00:00Z');
    sessionStorage.clear();
    load.mockResolvedValue([story('ventas_facturacion', { primary: { label: 'Principal', value: 3000, unit: 'USD' } }), story('maquinas_pedidos', { status: 'error' })]);
    show(['ventas_facturacion', 'maquinas_pedidos']);
    await screen.findByRole('heading', { name: 'Pedidos pendientes de máquinas' });
    expect(readStoryVisit('manager-a')?.at).toBe('2026-10-15T10:00:00Z');
  });
  it('records a complete empty result with a genuine zero alongside the other topics', async () => {
    saveStoryVisit('manager-a', [story('ventas_facturacion')], '2026-10-15T10:00:00Z');
    sessionStorage.clear();
    load.mockResolvedValue([story('ventas_facturacion', { primary: { label: 'Principal', value: 3000, unit: 'USD' } }), story('servicios_pendientes', { status: 'empty', primary: { label: 'Órdenes abiertas', value: 0, unit: 'count' }, supporting: [], chart: null })]);
    show(['ventas_facturacion', 'servicios_pendientes']);
    await screen.findByRole('heading', { name: 'Resolución de OS' });
    await waitFor(() => expect(JSON.parse(localStorage.getItem('sig-cdm:panorama:alternativa:visita:v1:manager-a')!).values.find((value: { id: string }) => value.id === 'servicios_pendientes')?.value).toBe(0));
    expect(JSON.parse(localStorage.getItem('sig-cdm:panorama:alternativa:visita:v1:manager-a')!).values.find((value: { id: string }) => value.id === 'ventas_facturacion')?.value).toBe(3000);
    expect(readStoryVisit('manager-a')?.at).toBe('2026-10-15T10:00:00Z');
  });
  it('shows a recoverable query error instead of stale or invented results', async () => {
    load.mockRejectedValue(new Error('Offline')); show();
    expect(await screen.findByText(/No se pudo consultar una fuente/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByText('$ 3.000')).not.toBeInTheDocument();
  });
});

describe('shared business evidence', () => {
  it.each([['sales','ventas_evolucion','repuestos.ventas'],['orders','maquinas_pedidos','parque.operaciones']] as const)('reuses selected %s monthly card without a duplicate bank read', async (id,topic,section) => {
    bankSources.mockReturnValue([{id,sections:[section]}] as never);
    load.mockResolvedValue([story(topic,{sections:[section]})]);
    show([topic],s=>s===section);
    await waitFor(()=>expect(load).toHaveBeenCalledTimes(1));
    await waitFor(()=>expect(screen.queryByText('Estoy revisando los datos de tus temas.')).not.toBeInTheDocument());
    expect(bankLoad).not.toHaveBeenCalled();
  });
  it('shares failed reads without issuing an automatic duplicate attempt', async()=>{
    bankSources.mockReturnValue([{id:'sales',sections:['repuestos.ventas']}] as never);
    load.mockRejectedValue(new Error('57014'));
    show(['ventas_evolucion'],s=>s==='repuestos.ventas');
    await screen.findByText('No pude verificar los datos de tus temas.');
    expect(load).toHaveBeenCalledTimes(1);
    expect(bankLoad).not.toHaveBeenCalled();
  });
  it('keeps customer comparison separate from the card contract', async()=>{
    bankSources.mockReturnValue([{id:'customers',sections:['parque.clientes']}] as never);
    load.mockResolvedValue([story('clientes_cobertura_posventa')]);
    show(['clientes_cobertura_posventa']);
    await waitFor(()=>expect(bankLoad).not.toHaveBeenCalled());
    expect(load).toHaveBeenCalledTimes(1);
  });
});

it('does not reuse an annual card as monthly business evidence', async()=>{
  bankSources.mockReturnValue([{id:'sales',sections:['repuestos.ventas']}] as never);
  load.mockResolvedValue([story('ventas_evolucion',{sections:['repuestos.ventas'],periodOptions:['month','ytd']})]);
  show(['ventas_evolucion'],s=>s==='repuestos.ventas');
  await waitFor(()=>expect(load).toHaveBeenCalledTimes(1));
  const switcher=screen.getByRole('group',{name:/Período de/});
  fireEvent.click(within(switcher).getByRole('button',{name:'Acum.'}));
  await waitFor(()=>expect(bankLoad).not.toHaveBeenCalled());

  await waitFor(()=>expect(load).toHaveBeenCalledWith(['ventas_evolucion'],['repuestos.ventas'],expect.any(String),'ytd'));
});
it('does not reuse another user or a broader permission result', async()=>{
  bankSources.mockReturnValue([{id:'sales',sections:['repuestos.ventas','servicios.ventas']}] as never);
  load.mockImplementation(async (_ids,sections)=>[story('ventas_evolucion',{sections})]);
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const tree=(userId:string,hasAccess:(s:SectionKey)=>boolean)=><QueryClientProvider client={client}><MemoryRouter><PanoramaDashboard userId={userId} topics={['ventas_evolucion']} available={PANORAMA_TOPICS} hasAccess={hasAccess} onEdit={()=>{}} /></MemoryRouter></QueryClientProvider>;
  const view=render(tree('one',()=>true));
  await waitFor(()=>expect(load).toHaveBeenCalledTimes(1));
  view.rerender(tree('two',s=>s==='repuestos.ventas'));
  await waitFor(()=>expect(load).toHaveBeenCalledTimes(2));
  expect(load).toHaveBeenLastCalledWith(['ventas_evolucion'],['repuestos.ventas'],expect.any(String),'month');
  expect(bankLoad).not.toHaveBeenCalled();
});

it('Campi conserva el mismo ámbito que el KPI de ventas sin otra consulta',async()=>{
 const a=story('ventas_evolucion',{primary:{label:'Ventas antes de NC',value:100,unit:'USD',comparison:{value:80,label:'anterior'}},salesScopes:[{section:'repuestos.ventas',label:'Repuestos',route:'/repuestos/ventas',source:'fixture',month:{value:30,previous:20},ytd:{value:90,previous:70},chartRows:null}]});
 load.mockResolvedValue([a]);show(['ventas_evolucion'],s=>s==='repuestos.ventas');
 const toggle=await screen.findByRole('button',{name:'Filtrar ventas de repuestos'});
 fireEvent.click(toggle);
 expect(screen.getByRole('region',{name:'Campi'})).toHaveTextContent('la facturación bruta alcanzó $ 30');
 expect(screen.getByRole('region',{name:'Campi'})).not.toHaveTextContent('Ámbito:');
 expect(load).toHaveBeenCalledTimes(1);
});

it('el recorrido real conserva referencia de visita sin modo de prueba',async()=>{
 load.mockResolvedValue([story('ventas_facturacion')]);
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}><MemoryRouter><PanoramaDashboard userId="preview-user" topics={['ventas_facturacion']} available={PANORAMA_TOPICS} hasAccess={()=>true} onEdit={()=>{}}/></MemoryRouter></QueryClientProvider>);
 await screen.findByRole('heading',{name:'Facturación neta'});
 await waitFor(() => expect(localStorage.getItem('sig-cdm:panorama:alternativa:visita:v1:preview-user')).not.toBeNull());
 expect(sessionStorage.getItem('sig-cdm:campi:panorama-saludo:preview-user')).toBeNull();
});

describe('automatic calendar period shared with Campi', () => {
  function periodSource(ids: StoryTopicId[], _sections: SectionKey[], asOf: string, period: 'month'|'ytd') {
    return Promise.resolve(ids.map(id => story(id, { periodMode:period, periodOptions:['month','ytd'], time:{window:{from:period==='month'?asOf.slice(0,7)+'-01':asOf.slice(0,4)+'-01-01',to:asOf}},
      primary:{label:'Facturación neta',value:period==='ytd'?900:10,unit:'USD',comparison:{value:period==='ytd'?800:5,label:'anterior'}},
      temporalComparisons:[{kind:'day',label:'Facturación neta',current:{from:'2026-11-01',to:'2026-11-01'},previous:{from:'2026-10-25',to:'2026-10-25'},components:[{section:'repuestos.ventas',value:5000,previous:4000}]}],
    })));
  }
  it('defaults to accumulated during first five business days and keeps badge on the selected period', async () => {
    vi.setSystemTime(new Date('2026-11-02T15:00:00Z'));load.mockImplementation(periodSource);
    show();
    await waitFor(()=>expect(screen.getByRole('region',{name:'Campi'})).toHaveTextContent('La facturación neta acumulada alcanza $ 900'));
    expect(load).toHaveBeenCalledWith(['ventas_facturacion'],expect.any(Array),'2026-11-02','ytd');
    expect(screen.getByText('$ 900')).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Período automático'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Mes'}));
    await waitFor(()=>expect(screen.getByRole('region',{name:'Campi'})).toHaveTextContent('La facturación neta de este mes alcanza $ 10'));
    expect(readPeriodPreferences('manager-a')).toEqual({ventas_facturacion:'month'});
    expect(screen.getByRole('region',{name:'Campi'})).not.toHaveTextContent('última jornada');
  });
  it('keeps manual choice on remount without an Auto control', async () => {
    vi.setSystemTime(new Date('2026-11-02T15:00:00Z'));savePeriodChoice('manager-a','ventas_facturacion','month');load.mockImplementation(periodSource);
    show();await screen.findByRole('button',{name:'Mes'});
    expect(load).toHaveBeenCalledWith(['ventas_facturacion'],expect.any(Array),'2026-11-02','month');
    expect(screen.queryByRole('button',{name:'Período automático'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Acum.'}));
    expect(readPeriodPreferences('manager-a')).toEqual({ventas_facturacion:'ytd'});
  });
  it('re-evaluates the sixth business day and new month on focus without erasing manual choices', async () => {
    vi.setSystemTime(new Date('2026-11-06T15:00:00Z'));load.mockImplementation(periodSource);show();
    await waitFor(()=>expect(load).toHaveBeenLastCalledWith(['ventas_facturacion'],expect.any(Array),'2026-11-06','ytd'));
    vi.setSystemTime(new Date('2026-11-09T15:00:00Z'));fireEvent(window,new Event('focus'));
    await waitFor(()=>expect(load).toHaveBeenLastCalledWith(['ventas_facturacion'],expect.any(Array),'2026-11-09','month'));
    vi.setSystemTime(new Date('2026-12-01T15:00:00Z'));fireEvent(window,new Event('focus'));
    await waitFor(()=>expect(load).toHaveBeenLastCalledWith(['ventas_facturacion'],expect.any(Array),'2026-12-01','ytd'));
  });
  it('keeps observed values without new freshness or period commentary', async () => {
    load.mockResolvedValue([story('ventas_facturacion',{periodMode:'month',periodOptions:['month','ytd']})]);show();
    await screen.findByRole('button',{name:'Mes'});
    expect(screen.getByText('$ 1.235')).toBeInTheDocument();
    expect(screen.queryByText(/actualización.*verificada|Información desde|Desde julio de 2026 hasta hoy/i)).not.toBeInTheDocument();
  });
  it('does not read the protected calendar without its permission', async () => {
    vi.mocked(loadBusinessClosures).mockClear();load.mockImplementation(periodSource);show(['ventas_facturacion'],s=>s==='repuestos.ventas');
    await screen.findByRole('button',{name:'Mes'});
    expect(loadBusinessClosures).not.toHaveBeenCalled();
    expect(screen.queryByText(/no se pudieron verificar los días no laborables/)).not.toBeInTheDocument();
  });
});

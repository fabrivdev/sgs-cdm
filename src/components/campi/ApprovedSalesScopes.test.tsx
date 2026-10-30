import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { ApprovedPanoramaCard } from './ApprovedPanoramaCard';

vi.mock('recharts', () => ({
  ResponsiveContainer: () => <div />,
  Area: () => null, AreaChart: () => null, ComposedChart: () => null,
  Line: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));
afterEach(cleanup);

const rows = [{ label: 'Ene', value: 30, previous: 15 }, { label: 'Feb', value: 40, previous: 20 }];
const story: PanoramaStory = {
  id: 'ventas_evolucion', title: 'Evolución de ventas', question: '', status: 'ready', message: '',
  scope: '', sections: ['servicios.ventas', 'repuestos.ventas'], cutoff: null, periodLabel: 'Febrero 2026',
  periodMode: 'month', periodOptions: ['month', 'ytd'], navigationPeriod: { from: '2026-02-01', to: '2026-02-16' },
  primary: { label: 'Ventas antes de NC', value: 100, unit: 'USD', comparison: { label: 'Mismo tramo de 2025', value: 50 } },
  supporting: [], chart: { kind: 'trend', title: 'Ventas mensuales antes de NC', unit: 'USD', rows },
  salesScopes: [
    { section: 'servicios.ventas', label: 'Servicios', route: '/servicios/ventas', source: 'servicios', month: { value: 60, previous: 30 }, ytd: { value: 160, previous: 130 }, chartRows: rows },
    { section: 'repuestos.ventas', label: 'Repuestos', route: '/repuestos/ventas', source: 'repuestos', month: { value: 40, previous: 20 }, ytd: { value: 140, previous: 120 }, chartRows: rows },
  ],
  breakdown: [], details: [], source: '', route: '',
};

describe('Evolución de ventas scope controls', () => {
  it('toggles a permitted category and restores the authorized total', () => {
    render(<MemoryRouter><ApprovedPanoramaCard story={story} index={0} retrying={false} onRetry={() => {}} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Filtrar ventas de máquinas' })).not.toBeInTheDocument();
    const service = screen.getByRole('button', { name: 'Filtrar ventas de servicios' });
    const parts = screen.getByRole('button', { name: 'Filtrar ventas de repuestos' });
    expect(service).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('$ 100')).toBeInTheDocument();
    fireEvent.click(service);
    expect(service).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('$ 60')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir ventas/ })).toHaveAttribute('href', '/servicios/ventas?desde=2026-02-01&hasta=2026-02-16');
    fireEvent.click(parts);
    expect(service).toHaveAttribute('aria-pressed', 'true');
    expect(parts).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('$ 100')).toBeInTheDocument();
    fireEvent.click(parts);
    expect(parts).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('$ 60')).toBeInTheDocument();
    fireEvent.click(service);
    expect(screen.getByText('$ 100')).toBeInTheDocument();
  });

  it('drops a selected area immediately when it is absent from the authorized story', () => {
    const view = render(<MemoryRouter><ApprovedPanoramaCard story={story} index={0} retrying={false} onRetry={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar ventas de servicios' }));
    expect(screen.getByText('$ 60')).toBeInTheDocument();
    const restricted: PanoramaStory = {
      ...story,
      sections: ['repuestos.ventas'],
      primary: { ...story.primary!, value: 40 },
      salesScopes: story.salesScopes?.filter(scope => scope.section === 'repuestos.ventas'),
    };
    view.rerender(<MemoryRouter><ApprovedPanoramaCard story={restricted} index={0} retrying={false} onRetry={() => {}} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Filtrar ventas de servicios' })).not.toBeInTheDocument();
    expect(screen.getByText('$ 40')).toBeInTheDocument();
  });
});

it('offers Otros without a fabricated zero when unavailable', () => {
 render(<MemoryRouter><ApprovedPanoramaCard story={{...story,billingCoverage:{additional:'unavailable',allCoreAreas:false}}} index={0} retrying={false} onRetry={()=>{}} /></MemoryRouter>);
 expect(screen.getByRole('button',{name:'Otros no disponible'})).toBeDisabled();
 expect(screen.getByText(/Cobertura parcial:/)).toBeInTheDocument();
 expect(screen.getByText('$ 100')).toBeInTheDocument();
});
it('filters Otros and restores the combined authorized total', () => {
 const complete:PanoramaStory={...story,sections:[...story.sections,'servicios.dashboard'],primary:{...story.primary!,value:125},billingCoverage:{additional:'available',allCoreAreas:false},salesScopes:[...story.salesScopes!,{section:'servicios.dashboard',label:'Otros',route:'',source:'complemento',month:{value:25,previous:10},ytd:{value:70,previous:40},chartRows:rows}]};
 render(<MemoryRouter><ApprovedPanoramaCard story={complete} index={0} retrying={false} onRetry={()=>{}} /></MemoryRouter>);
 const other=screen.getByRole('button',{name:'Filtrar ventas de otros'});
 fireEvent.click(other);expect(other).toHaveAttribute('aria-pressed','true');expect(screen.getByText('$ 25')).toBeInTheDocument();
 fireEvent.click(other);expect(other).toHaveAttribute('aria-pressed','false');expect(screen.getByText('$ 125')).toBeInTheDocument();
});

it('prepares coverage controls without fabricating the unavailable owner breakdown',()=>{
 render(<MemoryRouter><ApprovedPanoramaCard story={{...story,id:'clientes_cobertura_posventa',salesScopes:undefined}} index={0} retrying={false} onRetry={()=>{}} /></MemoryRouter>);
 expect(screen.getByRole('button',{name:'Filtrar cobertura de repuestos no disponible'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Filtrar cobertura de servicios no disponible'})).toBeDisabled();
});

it('enables coverage only with a validated breakdown and deduplicates combined owners',()=>{
 const coverage:PanoramaStory={...story,id:'clientes_cobertura_posventa',sections:['parque.maquinas'],primary:{label:'Cobertura',value:100,unit:'percent'},supporting:[{label:'Con compra',value:2,unit:'count'},{label:'Propietarios',value:2,unit:'count'}],salesScopes:undefined,coverageRubros:{owners:['a','b'],rows:[{from:'2026-02-01',to:'2026-02-16',parts:['a'],services:['a','b']}]}};
 render(<MemoryRouter><ApprovedPanoramaCard story={coverage} index={0} retrying={false} onRetry={()=>{}} /></MemoryRouter>);
 const parts=screen.getByRole('button',{name:'Filtrar cobertura de repuestos'}),services=screen.getByRole('button',{name:'Filtrar cobertura de servicios'});
 fireEvent.click(parts);expect(screen.getByLabelText('Cobertura: 50%')).toBeInTheDocument();
 fireEvent.click(services);expect(screen.getByLabelText('Cobertura: 100%')).toBeInTheDocument();
 fireEvent.click(parts);expect(screen.getByLabelText('Cobertura: 100%')).toBeInTheDocument();
 fireEvent.click(services);expect(services).toHaveAttribute('aria-pressed','false');
});

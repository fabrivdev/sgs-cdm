import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineHistorySheet } from './MachineHistorySheet';
const { rpc, can, sheet, write } = vi.hoisted(() => ({ rpc: vi.fn(), can:vi.fn(), sheet:vi.fn((rows:unknown[][])=>({rows})),write:vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ can }) }));
vi.mock('xlsx',()=>({utils:{aoa_to_sheet:sheet,encode_cell:()=>'A1',book_new:()=>({}),book_append_sheet:vi.fn()},writeFile:write}));
beforeEach(()=>{can.mockReturnValue(true);vi.stubGlobal('ResizeObserver',class { observe() {} disconnect() {} });});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const target = { chassis: '24491414', os: null };
const row = { os_numero: '01-00000057', fecha_abierta_os: '2026-08-01', tipo_tiempo: 'Cliente / Garantia', servicios_cantidad: 8, responsable: '12 - juan gómez', situacion_os: 'CERRADA', factura: '0010001005021; 0010000000077', servicios_valor: 100, repuesto_valor: 50, kilometro_valor: null, terceros_valor: null, raw_data: { 'Mec Aux 1': 'JUAN GOMEZ', 'Mec Aux 2': 'Pedro Ruiz', totales_por_tipo: { Cliente: { horas: 5 }, Garantia: { horas: 3 } } } };
function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MachineHistorySheet target={target} onOpenChange={()=>{}} /></QueryClientProvider>);
}
function setup(partsError = false) {
  rpc.mockImplementation((_name, args) => Promise.resolve(
    !args ? { data: [] } :
    args.p_vista === 'os' ? {data:[row]} :
    args.p_vista === 'maquina' ? {data:{modelo_tipo:'MAESTRO',clientes:{nombre:'Dueño actual'}}} :
    partsError ? {error:{message:'statement timeout'}} :
    {data:[{id:'p1',fecha_factura:'2026-08-21',cod_mercaderia:'REP001',codigo_fabricante:'FAB002',mercaderia:'Rodamiento',cantidad:2,total_venta:80,raw_data:{linked_service_order:row.os_numero}}]}));
}
describe('simple machine history', () => {
  it('centers numeric OS hours and keeps the mixed breakdown accessible',async()=>{
    setup();renderSheet();await screen.findByText(row.os_numero);
    const table=screen.getByRole('table',{name:'Historial de OS'});expect(table).toHaveClass('table-fixed');const cells=within(within(table).getAllByRole('row')[1]).getAllByRole('cell');
    expect(cells[5]).toHaveClass('text-center');expect(cells[5]).toHaveTextContent(/^8$/);expect(cells[5]).toHaveAttribute('title','Cliente: 5 · Garantía: 3');
    expect(table.querySelectorAll('td br,td .flex-col')).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:`Detalle ${row.os_numero}`}));
    const info=await screen.findByRole('dialog',{name:`Detalle ${row.os_numero}`});expect(info).toHaveTextContent('Cliente: 5 · Garantía: 3');expect(info).toHaveTextContent('0010000000077');
  });
  it('exports clock hours and both invoices without reallocating mixed types',async()=>{
    setup();renderSheet();await screen.findByText(row.os_numero);
    fireEvent.keyDown(screen.getByRole('button',{name:'Acciones de la sección'}),{key:'Enter'});fireEvent.click(await screen.findByRole('menuitem',{name:'Exportar Historial de OS'}));await waitFor(()=>expect(write).toHaveBeenCalled());
    expect(sheet.mock.calls[0][0][1]).toEqual([expect.any(Date),row.os_numero,'Cerrada','JUAN GOMEZ, PEDRO RUIZ','Cliente · Garantía',8,null,row.factura,150]);
  });
  it('keeps invoice lines separate, cents, negatives and complete exported codes',async()=>{
    const parts=[{id:'P1',fecha_factura:'2026-08-21',factura:'00000123',cod_mercaderia:'REP000001',codigo_fabricante:'000FAB',mercaderia:'DESCRIPCIÓN EXTENSA',cantidad:-2.5,total_venta:-80.55,raw_data:{linked_service_order:row.os_numero}},{id:'P2',fecha_factura:'2026-08-21',factura:'00000123',cod_mercaderia:'REP000002',codigo_fabricante:'000FAB2',mercaderia:'OTRA DESCRIPCIÓN',cantidad:0,total_venta:0,raw_data:{linked_service_order:row.os_numero}}];
    rpc.mockImplementation((_name,args)=>Promise.resolve(!args?{data:[]}:args.p_vista==='os'?{data:[row]}:args.p_vista==='maquina'?{data:null}:{data:parts}));
    renderSheet();await screen.findByText(row.os_numero);fireEvent.click(screen.getByRole('button',{name:'Repuestos'}));await screen.findByText('REP000001');
    const table=screen.getByRole('table',{name:'Repuestos de la máquina'});expect(within(table).getAllByRole('row')).toHaveLength(3);const cells=within(within(table).getAllByRole('row')[1]).getAllByRole('cell');expect(cells[6]).toHaveTextContent('-2,5');expect(cells[6]).toHaveClass('text-center');expect(cells[7]).toHaveTextContent('$ -80,55');expect(within(table).getAllByText('00000123')).toHaveLength(2);
    const sort=screen.getByRole('button',{name:/Ordenar Facturado:/});fireEvent.click(sort);fireEvent.click(sort);expect(sort.closest('th')).toHaveAttribute('aria-sort','descending');
    fireEvent.keyDown(screen.getByRole('button',{name:'Acciones de la sección'}),{key:'Enter'});fireEvent.click(await screen.findByRole('menuitem',{name:'Exportar Repuestos de la máquina'}));await waitFor(()=>expect(write).toHaveBeenCalled());
    const rows=sheet.mock.calls[0][0];expect(rows).toHaveLength(3);expect(rows[2]).toEqual([expect.any(Date),'00000123',row.os_numero,'REP000001','000FAB','DESCRIPCIÓN EXTENSA',-2.5,-80.55]);
  });
  it('does not add export access without the existing permission',async()=>{
    can.mockReturnValue(false);setup();renderSheet();await screen.findByText(row.os_numero);expect(screen.queryByRole('button',{name:'Acciones de la sección'})).not.toBeInTheDocument();
  });
  it('displays the canonical Campos owner resolved from stock', async () => {
    rpc.mockImplementation((_name, args) => Promise.resolve(!args ? { data: [] } :
      args.p_vista === 'maquina' ? { data: { modelo_tipo: 'LEXION', clientes: { nombre: 'CAMPOS DEL MANANA S.A. - SANTA RITA' }, fuente_propietario: 'stock' } } : { data: [row] }));
    renderSheet();
    expect(await screen.findByText(/Propietario actual: CAMPOS DEL MAÑANA S.A./)).toBeInTheDocument();
    expect(screen.getByText(/Stock propio/)).toBeInTheDocument();
    expect(screen.queryByText(/SANTA RITA/)).not.toBeInTheDocument();
  });
  it('loads OS without billing and preserves each time type in separate columns', async () => {
    setup(); renderSheet();
    expect(await screen.findByText(row.os_numero)).toBeInTheDocument();
    expect(screen.getByText(/Dueño actual/)).toBeInTheDocument();
    expect(screen.getAllByText(/Cliente/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Garantía/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5 h/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3 h/).length > 0).toBe(true);
    expect(rpc).not.toHaveBeenCalledWith(expect.anything(),expect.objectContaining({p_vista:'repuestos'}));
    expect(screen.queryByText('Resumen')).not.toBeInTheDocument();
  });
  it('unifies crew names, normalizes estado and shows compact invoice and total', async () => {
    setup(); renderSheet();
    await screen.findByText(row.os_numero);
    const techCell = screen.getByText(/JUAN GOMEZ, PEDRO RUIZ/);
    expect(techCell).toBeInTheDocument();
    expect(screen.getByText('Cerrada')).toBeInTheDocument();
    expect(screen.getByText(/0010001005021/)).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.queryByText('Sin dato de facturación')).not.toBeInTheDocument();
    // 100 + 50, nulls treated as missing values.
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });
  it('shows and searches individual manufacturer and part codes', async () => {
    setup(); renderSheet();
    await screen.findByText(row.os_numero);
    fireEvent.click(screen.getByRole('button',{name:'Repuestos'}));
    expect(await screen.findByText('FAB002')).toBeInTheDocument();
    expect(screen.getByText('REP001')).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('searchbox',{name:'Buscar en historial'})[0],{target:{value:'FAB002'}});
    expect(screen.getByText('Rodamiento')).toBeInTheDocument();
  });
  it('does not show zero or historical coverage on parts failure', async () => {
    setup(true); renderSheet();
    await screen.findByText(row.os_numero);
    fireEvent.click(screen.getByRole('button',{name:'Repuestos'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('statement timeout');
    expect(screen.queryByText('Histórica')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Historial de OS'}));
    expect(screen.getByText(row.os_numero)).toBeInTheDocument();
  });
});

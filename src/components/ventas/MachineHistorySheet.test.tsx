import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MachineHistorySheet } from './MachineHistorySheet';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const target = { chassis: '24491414', os: null };
const row = { os_numero: '01-00000057', fecha_abierta_os: '2026-08-01', tipo_tiempo: 'Cliente / Garantia', servicios_cantidad: 8, responsable: '12 - juan gómez', raw_data: { 'Mec Aux 1': 'JUAN GOMEZ', 'Mec Aux 2': 'Pedro Ruiz', totales_por_tipo: { Cliente: { horas: 5 }, Garantia: { horas: 3 } } } };
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
  it('loads OS without billing and preserves each time type in separate columns', async () => {
    setup(); renderSheet();
    expect(await screen.findByText(row.os_numero)).toBeInTheDocument();
    expect(screen.getByText(/Dueño actual/)).toBeInTheDocument();
    expect(screen.getAllByText('Cliente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Garantía').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5 h').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 h').length).toBeGreaterThan(0);
    expect(rpc).not.toHaveBeenCalledWith(expect.anything(),expect.objectContaining({p_vista:'repuestos'}));
    expect(screen.queryByText('Resumen')).not.toBeInTheDocument();
  });
  it('unifies crew names and lists every participant once', async () => {
    setup(); renderSheet();
    await screen.findByText(row.os_numero);
    expect(screen.getAllByText('JUAN GOMEZ')).toHaveLength(1);
    expect(screen.getByText('PEDRO RUIZ')).toBeInTheDocument();
  });
  it('shows and searches individual manufacturer and part codes', async () => {
    setup(); renderSheet();
    await screen.findByText(row.os_numero);
    fireEvent.click(screen.getByRole('button',{name:'Repuestos'}));
    expect(await screen.findByText('FAB002')).toBeInTheDocument();
    expect(screen.getByText('REP001')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox',{name:'Buscar en historial'}),{target:{value:'FAB002'}});
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

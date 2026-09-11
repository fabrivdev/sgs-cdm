import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MachineHistorySheet } from './MachineHistorySheet';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const target = { chassis: '24491414', os: null };
const row = { os_numero: '01-00000057', fecha_abierta_os: '2026-08-01', tipo_tiempo: 'Cliente / Garantia', servicios_cantidad: 8, raw_data: { totales_por_tipo: { Cliente: { horas: 5 }, Garantia: { horas: 3 } } } };
function setup(partsError = false) {
  rpc.mockImplementation((_name, args) => Promise.resolve(args.p_vista === 'os' ? {data:[row]} : args.p_vista === 'maquina' ? {data:{modelo_tipo:'MAESTRO',clientes:{nombre:'Dueño actual'}}} : partsError ? {error:{message:'statement timeout'}} : {data:[{id:'p1',fecha_factura:'2026-08-21',cod_mercaderia:'REP001',codigo_fabricante:'FAB002',mercaderia:'Rodamiento',cantidad:2,total_venta:80,raw_data:{linked_service_order:row.os_numero}}]}));
}
describe('simple machine history', () => {
  it('loads OS without billing and preserves each time type', async () => {
    setup(); render(<MachineHistorySheet target={target} onOpenChange={()=>{}} />);
    expect(await screen.findByText(row.os_numero)).toBeInTheDocument();
    expect(screen.getByText(/Dueño actual/)).toBeInTheDocument();
    expect(screen.getByText('Cliente · 5 h')).toBeInTheDocument();
    expect(screen.getByText('Garantía · 3 h')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith(expect.anything(),expect.objectContaining({p_vista:'repuestos'}));
    expect(screen.queryByText('Resumen')).not.toBeInTheDocument();
  });
  it('shows and searches individual manufacturer and part codes', async () => {
    setup(); render(<MachineHistorySheet target={target} onOpenChange={()=>{}} />);
    await screen.findByText(row.os_numero);
    fireEvent.click(screen.getByRole('button',{name:'Repuestos'}));
    expect(await screen.findByText('FAB002')).toBeInTheDocument();
    expect(screen.getByText('REP001')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox',{name:'Buscar en historial'}),{target:{value:'FAB002'}});
    expect(screen.getByText('Rodamiento')).toBeInTheDocument();
  });
  it('does not show zero or historical coverage on parts failure', async () => {
    setup(true); render(<MachineHistorySheet target={target} onOpenChange={()=>{}} />);
    await screen.findByText(row.os_numero);
    fireEvent.click(screen.getByRole('button',{name:'Repuestos'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('statement timeout');
    expect(screen.queryByText('Histórica')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Historial de OS'}));
    expect(screen.getByText(row.os_numero)).toBeInTheDocument();
  });
});

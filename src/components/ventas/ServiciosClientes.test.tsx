import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiciosClientes } from './ServiciosClientes';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props = { desde: '2026-01-01', hasta: '2026-08-31', sucursal: 'TODAS', buscar: 'valdecir mohr', tipoTiempo: 'TODOS' };
describe('client search population', () => {
  it('groups all Campos variants as one legal owner and one billed client', async () => {
    rpc.mockResolvedValue({ error: null, data: [
      { id: '1', factura: 'F1', os: 'OS1', propietario: 'CAMPOS DEL MANANA S.A. - SANTA RITA', cliente: 'campos del mañana SA (OTRA SEDE)', componente: 'Mano de obra', total_venta: 100 },
      { id: '2', factura: 'F2', os: 'OS2', propietario: 'campos del mañana S. A. - KATUETE', cliente: 'CAMPOS DEL MAÑANA S.A.', componente: 'Kilometraje', total_venta: 20 },
    ] });
    render(<ServiciosClientes {...props} buscar="" />);
    expect(await screen.findByText('CAMPOS DEL MAÑANA S.A.')).toBeInTheDocument();
    expect(screen.getAllByText('$ 120')).toHaveLength(1);
    expect(screen.queryByText(/SANTA RITA/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Agrupar clientes por'), { target: { value: 'cliente' } });
    expect(screen.getAllByText('CAMPOS DEL MAÑANA S.A.')).toHaveLength(1);
    expect(screen.getByText('$ 120')).toBeInTheDocument();
  });
  it('filters invoice lines before grouping and keeps the same total in both perspectives', async () => {
    rpc.mockResolvedValue({ error: null, data: [
      { id: '1', factura: 'F1', os: '5734', propietario: 'Dueño actual', cliente: 'Pagador tercero', propietario_os: 'VALDECIR MOHR', componente: 'Mano de obra', total_venta: 200 },
      { id: '2', factura: 'F2', os: 'Otra OS', propietario: 'Dueño actual', cliente: 'Otro pagador', propietario_os: 'Otro propietario', componente: 'Mano de obra', total_venta: 900 },
    ] });
    render(<ServiciosClientes {...props} />);
    expect(await screen.findByText('Dueño actual')).toBeInTheDocument();
    expect(screen.getAllByText('$ 200')).toHaveLength(2);
    expect(screen.queryByText('$ 1.100')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Agrupar clientes por'), { target: { value: 'cliente' } });
    expect(screen.getByText('Pagador tercero')).toBeInTheDocument();
    expect(screen.queryByText('Otro pagador')).not.toBeInTheDocument();
    expect(screen.getAllByText('$ 200')).toHaveLength(2);
  });
});

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiciosClientes } from './ServiciosClientes';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props = { desde: '2026-01-01', hasta: '2026-08-31', sucursal: 'TODAS', buscar: 'valdecir mohr', tipoTiempo: 'TODOS' };
describe('client search population', () => {
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

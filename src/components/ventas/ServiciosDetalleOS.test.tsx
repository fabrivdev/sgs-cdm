import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiciosDetalleOS } from './ServiciosDetalleOS';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/components/ventas/MachineHistorySheet', () => ({ MachineHistorySheet: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props = { desde: '2026-01-01', hasta: '2026-09-11', sucursal: 'TODAS', buscar: '', tipoTiempo: 'TODOS' };

describe('service detail loading states', () => {
  it('keeps historical owner separate from current owner and invoice recipient', async () => {
    rpc.mockResolvedValue({ error: null, data: [{ id: 'OS:5734', fecha: '2026-05-11', os: '5734', os_numero: '5734', chasis: 'C7501463',
      cliente: 'Propietario no informado', propietario: 'Propietario no informado', propietario_os: 'VALDECIR MOHR', cliente_facturado: 'Pagador tercero',
      sucursal: 'Santa Rita', tipo_tiempo: 'Cliente', facturas: 1, mo: 200, km: 20, repuestos: 0, terceros: 0, total: 220 }] });
    render(<ServiciosDetalleOS {...props} buscar="valdecir mohr" />);
    expect(await screen.findByText('En la OS: VALDECIR MOHR')).toBeInTheDocument();
    expect(screen.getByText('Propietario no informado')).toBeInTheDocument();
    expect(screen.getByTitle('Facturado a: Pagador tercero')).toBeInTheDocument();
    expect(screen.getByText('C7501463')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('ventas_servicios_detalle_os_v2', expect.objectContaining({ p_buscar: 'valdecir mohr' }));
  });
  it('passes both machine filters to the same detail query', async () => {
    rpc.mockResolvedValue({data:[],error:null});
    render(<ServiciosDetalleOS {...props} marca="HORSCH" tipoMaquina="SEMBRADORAS" />);
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('ventas_servicios_detalle_os_v2',expect.objectContaining({p_marca:'HORSCH',p_tipo_maquina:'SEMBRADORAS'})));
  });
  it('shows timeout as an error, never as an empty result', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'canceling statement due to statement timeout' } });
    render(<ServiciosDetalleOS {...props} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('statement timeout');
    expect(screen.queryByText('No hay OS con facturación en el período.')).not.toBeInTheDocument();
  });
  it('shows the empty message only for a successful empty response', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    render(<ServiciosDetalleOS {...props} />);
    await waitFor(() => expect(screen.getByText('No hay OS con facturación en el período.')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('stops loading and does not query when the date range is invalid', async () => {
    render(<ServiciosDetalleOS {...props} desde="2026-09-12" hasta="2026-09-11" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Seleccioná un rango de fechas válido');
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument();
  });
});

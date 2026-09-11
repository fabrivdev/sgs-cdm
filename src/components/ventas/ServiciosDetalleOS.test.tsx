import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiciosDetalleOS } from './ServiciosDetalleOS';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/components/ventas/MachineHistorySheet', () => ({ MachineHistorySheet: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props = { desde: '2026-01-01', hasta: '2026-09-11', sucursal: 'TODAS', buscar: '', tipoTiempo: 'TODOS' };

describe('service detail loading states', () => {
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
});

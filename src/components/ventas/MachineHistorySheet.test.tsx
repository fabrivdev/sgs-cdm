import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MachineHistorySheet } from './MachineHistorySheet';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function query(result: unknown) {
  const chain = { select: vi.fn(), order: vi.fn(), eq: vi.fn(), ilike: vi.fn(), in: vi.fn(), limit: vi.fn(), range: vi.fn().mockResolvedValue(result), maybeSingle: vi.fn().mockResolvedValue(result) };
  for (const key of ['select', 'order', 'eq', 'ilike', 'in', 'limit'] as const) chain[key].mockReturnValue(chain);
  return chain;
}
const row = { os_numero: '01-00000057', fecha_abierta_os: '2026-08-01', tipo_tiempo: 'Cliente', servicios_cantidad: 5, raw_data: { Nombre: 'Dueño' } };
const target = { chassis: '24491414', os: null };

describe('machine history failures', () => {
  it('keeps operational history visible if linked billing times out', async () => {
    from.mockImplementation(table => query(table === 'ordenes_servicio_importadas'
      ? { data: [row], error: null }
      : table === 'facturacion_lineas_importadas'
        ? { data: null, error: { message: 'statement timeout' } }
        : { data: { clientes: { nombre: 'Dueño actual' } }, error: null }));
    render(<MachineHistorySheet target={target} onOpenChange={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Consulta de facturación vinculada');
    expect(screen.getByText('OS 01-00000057')).toBeInTheDocument();
    expect(screen.getByText(/Dueño actual/)).toBeInTheDocument();
    expect(screen.getByText('Error al consultar facturación')).toBeInTheDocument();
  });
  it('does not claim an unknown owner when the park query fails', async () => {
    from.mockImplementation(table => query(table === 'ordenes_servicio_importadas'
      ? { data: [row], error: null }
      : table === 'facturacion_lineas_importadas'
        ? { data: [], error: null }
        : { data: null, error: { message: 'statement timeout' } }));
    render(<MachineHistorySheet target={target} onOpenChange={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Consulta del parque');
    expect(screen.getByText(/Propietario no disponible: error de consulta/)).toBeInTheDocument();
    expect(screen.queryByText(/Propietario actual no informado/)).not.toBeInTheDocument();
  });
});

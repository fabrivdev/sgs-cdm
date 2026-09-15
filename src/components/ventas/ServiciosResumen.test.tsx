import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiciosResumen } from './ServiciosResumen';
import type { IndicadoresResponse } from './useServiciosIndicadores';

const { useIndicadores } = vi.hoisted(() => ({ useIndicadores: vi.fn() }));
vi.mock('./useServiciosIndicadores', () => ({ useServiciosIndicadores: useIndicadores }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props = { desde: '2026-01-01', hasta: '2026-08-31', sucursal: 'TODAS', buscar: '', tipoTiempo: 'TODOS' };
const amounts = { mo: 100, km: 0, repuestos: 0, terceros: 0, neto: 100 };
const fixture: IndicadoresResponse = {
  totales: { ...amounts, neto: 300, ordenes: 1, documentos: 3, horas: 8 },
  por_tipo: [
    { ...amounts, tipo_tiempo: 'Garantia', ordenes: 1, clientes: 1, facturas: 1, horas: 8 },
    { ...amounts, tipo_tiempo: 'No informado', ordenes: 0, clientes: 1, facturas: 1, horas: 0 },
    { ...amounts, tipo_tiempo: 'No informado', ordenes: 0, clientes: 1, facturas: 1, horas: null, sin_vinculo_historico: true },
  ],
  por_maquina: [],
  por_marca_tipo: [
    { ...amounts, marca: 'HORSCH', tipo_tiempo: 'Garantia', horas: 8 },
    { ...amounts, marca: 'Sin identificar', tipo_tiempo: 'No informado', horas: 0 },
    { ...amounts, marca: 'Sin identificar', tipo_tiempo: 'No informado', horas: null, sin_vinculo_historico: true },
  ],
};
const mockData = (data: unknown) => useIndicadores.mockReturnValue({ data, loading: false, error: null });

describe('service summary breakdown contract', () => {
  it('renders brands and distinguishes missing historical OS/hours from unclassified current time', () => {
    mockData(fixture);
    render(<ServiciosResumen {...props} />);
    expect(screen.getByText('HORSCH')).toBeInTheDocument();
    expect(screen.getAllByText('Histórico sin OS vinculada')).toHaveLength(2);
    const historical = screen.getAllByText('Histórico sin OS vinculada')[0].parentElement!;
    expect(historical.children[1]).toHaveTextContent('—');
    expect(historical.children[7]).toHaveTextContent('—');
    expect(historical.children[6]).toHaveTextContent('$ 100');
    expect(screen.getAllByText('No informado')).toHaveLength(2);
    expect(screen.getByText(/Horas OS: sólo órdenes vinculadas/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('reports an outdated SQL response rather than pretending there are no brands', () => {
    mockData({ ...fixture, por_marca_tipo: undefined });
    render(<ServiciosResumen {...props} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Falta actualizar la consulta');
    expect(screen.queryByText('Sin datos por marca.')).not.toBeInTheDocument();
  });
  it('preserves separate time types when the brand is unknown', () => {
    mockData({ ...fixture, por_marca_tipo: [
      { ...amounts, marca: 'Sin identificar', tipo_tiempo: 'Cliente', horas: 2 },
      { ...amounts, marca: 'Sin identificar', tipo_tiempo: 'Garantia', horas: 6 },
    ] });
    render(<ServiciosResumen {...props} />);
    expect(screen.getAllByText('Sin identificar')).toHaveLength(2);
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getAllByText('Garantía')).toHaveLength(2);
  });
  it('uses the genuine empty state for a complete empty response', () => {
    mockData({ ...fixture, por_tipo: [], por_marca_tipo: [], totales: { ...fixture.totales, neto: 0 } });
    render(<ServiciosResumen {...props} />);
    expect(screen.getAllByText(/Sin facturación en el período/)).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

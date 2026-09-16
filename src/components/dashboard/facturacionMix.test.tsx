import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MixRubros } from './DashboardCharts';
import type { WeekRow } from './types';

const periodo: WeekRow = {
  key: '2026-08-01', label: 'Agosto', start: new Date(2026,7,1), end: new Date(2026,7,31),
  total: 200, repuestos: 20, servicio: 100, kilometraje: 10, terceros: 30, maquinarias: 40,
  otros: 0, horasServicio: 2, kmFacturados: 10, facturas: 3, clientes: 1,
  comparisonTotal: 100, comparisonHorasServicio: 0, comparisonKmFacturados: 0,
  comparisonLabel: 'Agosto anterior', variacion: 100, rows: [],
};

describe('mix de facturación conciliado', () => {
  it('incluye Terceros en el mix y permite seleccionarlo sin mezclarlo con MO', () => {
    const onSelect=vi.fn();
    render(<MixRubros row={periodo} rubroFiltro="all" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button',{name:'Terceros 30'}));
    expect(onSelect).toHaveBeenCalledWith('Terceros');
    expect(screen.getByText('15%',{exact:false})).toBeInTheDocument();
    expect(periodo.repuestos+periodo.servicio+periodo.kilometraje+(periodo.terceros??0)+periodo.maquinarias+periodo.otros).toBe(periodo.total);
  });
  it('cambia a Terceros y vuelve al total del período sin perder el rubro', () => {
    const { rerender }=render(<MixRubros row={periodo} rubroFiltro="Terceros" />);
    expect(screen.getByText('$ 30')).toBeInTheDocument();
    expect(screen.queryByText('$ 200')).not.toBeInTheDocument();
    rerender(<MixRubros row={periodo} rubroFiltro="all" />);
    expect(screen.getByText('$ 200')).toBeInTheDocument();
    expect(screen.getByText('Terceros')).toBeInTheDocument();
  });
});

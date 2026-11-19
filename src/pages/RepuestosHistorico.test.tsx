import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import RepuestosHistorico from './RepuestosHistorico';

const rpc = vi.hoisted(() => vi.fn(() => ({ abortSignal: () => Promise.resolve({ data: { anio: 2026, anios_con_datos: [], filas: [] }, error: null }) })));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/components/ventas/SalesSectionExports', () => ({
 SalesSectionExportsProvider: ({ children }: { children: React.ReactNode }) => children,
 SalesSectionExportMenu: () => null,
}));
vi.mock('@/components/ventas/SalesDataTable', () => ({ SalesDataTable: () => <div>Tabla</div> }));
vi.mock('@/components/filters/FiltersBar', () => ({
 FiltersBar: ({ children, secondaryActions, onClear }: { children: React.ReactNode; secondaryActions: React.ReactNode; onClear: () => void }) => <div>{children}{secondaryActions}<button onClick={onClear}>Limpiar</button></div>,
 FilterDate: ({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min: string; max: string }) => <label>{label}<input type="date" value={value} onChange={e => onChange(e.target.value)} min={min} max={max} /></label>,
 FilterSelect: ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => <label>{label}<select value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>,
}));

describe('Historical comparison filters', () => {
 it('allows year end and sends the brand in both views, resetting it when cleared', async () => {
  rpc.mockClear();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RepuestosHistorico /></QueryClientProvider>);
  const cutoff = screen.getByLabelText('Comparar hasta');
  const yearEnd = `${new Date().getFullYear()}-12-31`;
  expect(cutoff).toHaveAttribute('max', yearEnd);
  fireEvent.change(cutoff, { target: { value: yearEnd } });
  fireEvent.change(screen.getByLabelText('Marca'), { target: { value: 'CLAAS' } });
  await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('repuestos_historico_v2', expect.objectContaining({ p_corte: yearEnd, p_marca: 'CLAAS', p_vista: 'clientes' })));
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Repuestos' }), { button: 0, ctrlKey: false });
  await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('repuestos_historico_v2', expect.objectContaining({ p_marca: 'CLAAS', p_vista: 'repuestos' })));
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
  await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('repuestos_historico_v2', expect.objectContaining({ p_marca: null })));
 });
});

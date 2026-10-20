import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CampiPanorama from './CampiPanorama';
import { panoramaStorageKey } from '@/lib/campi/panoramaPreferences';

const baseline = ['servicios.ventas', 'repuestos.analisis', 'parque.stock', 'servicios.ordenes', 'parque.operaciones'];
const allowed = new Set(baseline);
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'manager-a' }, isAdmin: false,
    hasModuloAccess: () => true,
    hasSectionAccess: (section: string) => allowed.has(section),
  }),
}));
vi.mock('@/components/campi/CampiPanoramaAvatar', () => ({ CampiPanoramaAvatar: ({ reaction }: { reaction?: { kind: string } }) => <div role="img" aria-label="Campi animado" data-reaction={reaction?.kind ?? 'none'} /> }));
vi.mock('@/components/campi/PanoramaDashboard', () => ({ PanoramaDashboard: ({ topics, onEdit }: { topics: string[]; onEdit: () => void }) => <div data-testid="panorama-panel">{topics.join('|')}<button onClick={onEdit}>Editar prioridades</button></div> }));

beforeEach(() => { localStorage.clear(); allowed.clear(); baseline.forEach(id => allowed.add(id)); });
afterEach(cleanup);

describe('Campi Panorama configuration', () => {
  it('saves more than three ordered topics and restores them', () => {
    const view = render(<CampiPanorama />);
    expect(screen.getByText(/10 disponibles · 0 seleccionados · 10 por agregar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Facturación y notas de crédito/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Stock antiguo de repuestos/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Composición del stock físico/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Abastecimiento de pedidos activos/ }));
    expect(screen.getByText('4 de 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Subir Abastecimiento de pedidos activos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar orden' }));
    expect(localStorage.getItem(panoramaStorageKey('manager-a')))
      .toBe('["ventas_facturacion","repuestos_stock","maquinas_pedidos","maquinas_stock"]');
    expect(screen.getByTestId('panorama-panel')).toHaveTextContent('ventas_facturacion|repuestos_stock|maquinas_pedidos|maquinas_stock');
    view.unmount();
    render(<CampiPanorama />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar prioridades' }));
    expect(screen.getByRole('button', { name: 'Orden guardado' })).toBeDisabled();
    expect(screen.getByText('4 de 4')).toBeInTheDocument();
  });

  it('shows each topic once and reacts when adding or removing it', () => {
    render(<CampiPanorama />);
    expect(screen.getByRole('searchbox', { name: 'Buscar temas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Composición del stock físico/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Composición del stock físico/ }));
    expect(screen.getByRole('img', { name: 'Campi animado' })).toHaveAttribute('data-reaction', 'select');
    expect(screen.queryByRole('button', { name: /^Composición del stock físico/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Composición del stock físico' }));
    expect(screen.getByRole('img', { name: 'Campi animado' })).toHaveAttribute('data-reaction', 'remove');
    expect(screen.getByRole('button', { name: /^Composición del stock físico/ })).toBeInTheDocument();
  });

  it('hides a priority when all of its source sections are revoked', () => {
    localStorage.setItem(panoramaStorageKey('manager-a'), '["maquinas_stock","repuestos_stock"]');
    allowed.delete('parque.stock');
    render(<CampiPanorama />);
    expect(screen.queryByText('Composición del stock físico')).not.toBeInTheDocument();
    expect(screen.getByTestId('panorama-panel')).toHaveTextContent('repuestos_stock');
  });

  it('reorders topics by dragging as well as with keyboard-accessible buttons', () => {
    render(<CampiPanorama />);
    fireEvent.click(screen.getByRole('button', { name: /^Facturación y notas de crédito/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Abastecimiento de pedidos activos/ }));
    const first = screen.getByText('Facturación y notas de crédito').closest('li');
    const second = screen.getByText('Abastecimiento de pedidos activos').closest('li');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    fireEvent.dragStart(first!, { dataTransfer: { effectAllowed: 'move' } });
    fireEvent.dragOver(second!);
    fireEvent.drop(second!);
    expect(screen.getByRole('img', { name: 'Campi animado' })).toHaveAttribute('data-reaction', 'reorder');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar orden' }));
    expect(screen.getByTestId('panorama-panel')).toBeInTheDocument();
    expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBe('["maquinas_pedidos","ventas_facturacion"]');
  });
  it('asks which priority to replace when all four slots are used', () => {
    render(<CampiPanorama />);
    for (const name of [/^Facturación y notas de crédito/, /^Stock antiguo de repuestos/, /^Composición del stock físico/, /^Abastecimiento de pedidos activos/]) fireEvent.click(screen.getByRole('button', { name }));
    fireEvent.click(screen.getByRole('button', { name: /^Resolución de órdenes de servicio/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Elegí qué tema reemplazar');
    expect(screen.getByText('4 de 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar Composición del stock físico por Resolución de órdenes de servicio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar orden' }));
    expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBe('["ventas_facturacion","repuestos_stock","servicios_pendientes","maquinas_pedidos"]');
  });
});

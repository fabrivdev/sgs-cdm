import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CampiPanorama from './CampiPanorama';
import { panoramaStorageKey } from '@/lib/campi/panoramaPreferences';

const baseline = ['servicios.ventas', 'repuestos.analisis', 'servicios.ordenes', 'parque.operaciones'];
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
    expect(screen.getByText(/5 disponibles · 0 seleccionados · 5 alternativas/)).toBeInTheDocument();
    expect(screen.getByText('Soy Campi')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Facturación y NC' }));
    fireEvent.click(screen.getByRole('button', { name: /^Stock antiguo de repuestos/ }));
    fireEvent.click(screen.getByRole('button', { name: 'OS abiertas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pedidos de máquinas' }));
    expect(screen.getByText('4 de 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Subir Pedidos de máquinas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver mi Panorama' }));
    expect(localStorage.getItem(panoramaStorageKey('manager-a')))
      .toBe('["ventas_facturacion","repuestos_stock","maquinas_pedidos","servicios_abiertas"]');
    expect(screen.getByTestId('panorama-panel')).toHaveTextContent('ventas_facturacion|repuestos_stock|maquinas_pedidos|servicios_abiertas');
    view.unmount();
    render(<CampiPanorama />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar prioridades' }));
    expect(screen.getByRole('button', { name: 'Prioridades guardadas' })).toBeDisabled();
    expect(screen.getByText('Editar prioridades')).toBeInTheDocument();
    expect(screen.getByText('4 de 4')).toBeInTheDocument();
  });

  it('shows each topic once and reacts when adding or removing it', () => {
    render(<CampiPanorama />);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Área' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OS abiertas' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OS abiertas' }));
    expect(screen.getByRole('img', { name: 'Campi animado' })).toHaveAttribute('data-reaction', 'select');
    expect(screen.queryByRole('button', { name: 'OS abiertas' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar OS abiertas' }));
    expect(screen.getByRole('img', { name: 'Campi animado' })).toHaveAttribute('data-reaction', 'remove');
    expect(screen.getByRole('button', { name: 'OS abiertas' })).toBeInTheDocument();
  });

  it('hides a priority when all of its source sections are revoked', () => {
    localStorage.setItem(panoramaStorageKey('manager-a'), '["maquinas_stock","repuestos_stock"]');
    allowed.delete('parque.operaciones');
    render(<CampiPanorama />);
    expect(screen.queryByText('Pedidos de máquinas')).not.toBeInTheDocument();
    expect(screen.getByTestId('panorama-panel')).toHaveTextContent('repuestos_stock');
  });

  it('reorders topics by dragging as well as with keyboard-accessible buttons', () => {
    render(<CampiPanorama />);
    fireEvent.click(screen.getByRole('button', { name: 'Facturación y NC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pedidos de máquinas' }));
    const first = screen.getByText('Facturación y NC').closest('li');
    const second = screen.getByText('Pedidos de máquinas').closest('li');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    fireEvent.dragStart(first!, { dataTransfer: { effectAllowed: 'move' } });
    fireEvent.dragOver(second!);
    fireEvent.drop(second!);
    expect(screen.getByRole('img', { name: 'Campi animado' })).toHaveAttribute('data-reaction', 'reorder');
    fireEvent.click(screen.getByRole('button', { name: 'Ver mi Panorama' }));
    expect(screen.getByTestId('panorama-panel')).toBeInTheDocument();
    expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBe('["maquinas_pedidos","ventas_facturacion"]');
  });
  it('asks which priority to replace when all four slots are used', () => {
    render(<CampiPanorama />);
    for (const name of ['Facturación y NC', 'Stock antiguo de repuestos', 'OS abiertas', 'Pedidos de máquinas']) fireEvent.click(screen.getByRole('button', { name }));
    fireEvent.click(screen.getByRole('button', { name: 'Tiempo de resolución de OS' }));
    expect(screen.getByRole('status')).toHaveTextContent('Elegí qué tema reemplazar');
    expect(screen.getByText('4 de 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar OS abiertas por Tiempo de resolución de OS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver mi Panorama' }));
    expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBe('["ventas_facturacion","repuestos_stock","servicios_pendientes","maquinas_pedidos"]');
  });
  it('keeps the welcome open when saving fails and preserves the previous order on cancel', () => {
    const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    render(<CampiPanorama />);
    fireEvent.click(screen.getByRole('button', { name: 'Facturación y NC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver mi Panorama' }));
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar');
    expect(screen.getByText('Soy Campi')).toBeInTheDocument();
    denied.mockRestore();
  });
  it('cancels later edits without changing saved priorities', () => {
    localStorage.setItem(panoramaStorageKey('manager-a'), '["ventas_facturacion","maquinas_stock"]');
    render(<CampiPanorama />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar prioridades' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Pedidos de máquinas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver al panorama' }));
    expect(screen.getByTestId('panorama-panel')).toHaveTextContent('ventas_facturacion|maquinas_pedidos');
    expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBe('["ventas_facturacion","maquinas_stock"]');
  });
});

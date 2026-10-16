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
vi.mock('@/components/campi/CampiPanoramaAvatar', () => ({ CampiPanoramaAvatar: () => <div role="img" aria-label="Campi animado" /> }));

beforeEach(() => { localStorage.clear(); allowed.clear(); baseline.forEach(id => allowed.add(id)); });
afterEach(cleanup);

describe('Campi Panorama configuration', () => {
  it('saves more than three ordered topics and restores them', () => {
    const view = render(<CampiPanorama />);
    expect(screen.getByText('6 disponibles')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Evolución de ventas y facturación' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stock y antigüedad de repuestos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disponibilidad de máquinas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pedidos de máquinas por cumplir' }));
    expect(screen.getByText('4 priorizados')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Subir Pedidos de máquinas por cumplir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar orden' }));
    expect(localStorage.getItem(panoramaStorageKey('manager-a')))
      .toBe('["ventas_facturacion","repuestos_stock","maquinas_pedidos","maquinas_stock"]');
    view.unmount();
    render(<CampiPanorama />);
    expect(screen.getByRole('button', { name: 'Orden guardado' })).toBeDisabled();
    expect(screen.getByText('4 priorizados')).toBeInTheDocument();
  });

  it('shows each topic once, searches, and lets users remove it from the ordered list', () => {
    render(<CampiPanorama />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar tema' }), { target: { value: 'maquinas' } });
    expect(screen.getByRole('button', { name: 'Disponibilidad de máquinas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Evolución de ventas y facturación' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar tema' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Disponibilidad de máquinas' }));
    expect(screen.queryByRole('button', { name: 'Disponibilidad de máquinas' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Disponibilidad de máquinas' }));
    expect(screen.getByRole('button', { name: 'Disponibilidad de máquinas' })).toBeInTheDocument();
  });

  it('hides a priority when all of its source sections are revoked', () => {
    localStorage.setItem(panoramaStorageKey('manager-a'), '["maquinas_stock","repuestos_stock"]');
    allowed.delete('parque.stock');
    render(<CampiPanorama />);
    expect(screen.queryByText('Disponibilidad de máquinas')).not.toBeInTheDocument();
    expect(screen.getByText('1 priorizados')).toBeInTheDocument();
  });

  it('reorders topics by dragging as well as with keyboard-accessible buttons', () => {
    render(<CampiPanorama />);
    fireEvent.click(screen.getByRole('button', { name: 'Evolución de ventas y facturación' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pedidos de máquinas por cumplir' }));
    const first = screen.getByText('Evolución de ventas y facturación').closest('li');
    const second = screen.getByText('Pedidos de máquinas por cumplir').closest('li');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    fireEvent.dragStart(first!, { dataTransfer: { effectAllowed: 'move' } });
    fireEvent.dragOver(second!);
    fireEvent.drop(second!);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar orden' }));
    expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBe('["maquinas_pedidos","ventas_facturacion"]');
  });
});

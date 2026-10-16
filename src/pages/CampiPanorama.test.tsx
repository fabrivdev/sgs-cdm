import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CampiPanorama from './CampiPanorama';
import { panoramaStorageKey } from '@/lib/campi/panoramaPreferences';

const allowed = new Set(['servicios.ventas', 'repuestos.analisis', 'parque.stock', 'servicios.ordenes']);
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'manager-a' }, isAdmin: false,
    hasModuloAccess: () => true,
    hasSectionAccess: (section: string) => allowed.has(section),
  }),
}));
vi.mock('@/components/campi/CampiPanoramaAvatar', () => ({ CampiPanoramaAvatar: () => <div role="img" aria-label="Campi animado" /> }));

beforeEach(() => { localStorage.clear(); allowed.clear(); ['servicios.ventas', 'repuestos.analisis', 'parque.stock', 'servicios.ordenes'].forEach(id => allowed.add(id)); });
afterEach(cleanup);

describe('Campi Panorama configuration', () => {
  it('offers all authorized topics, saves three priorities and restores them after remount', () => {
    const view = render(<CampiPanorama />);
    expect(screen.getByText('4 disponibles')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ventas de servicios' }));
    fireEvent.click(screen.getByRole('button', { name: 'Análisis de repuestos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stock de máquinas' }));
    expect(screen.getByRole('button', { name: 'Órdenes de servicio' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Subir Stock de máquinas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar prioridades' }));
    expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBe('["servicios.ventas","parque.stock","repuestos.analisis"]');
    view.unmount();
    render(<CampiPanorama />);
    expect(screen.getByRole('button', { name: 'Prioridades guardadas' })).toBeDisabled();
    expect(screen.getByText('3 de 3')).toBeInTheDocument();
  });

  it('allows replacing a selected priority and searching all available topics', () => {
    render(<CampiPanorama />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar tema' }), { target: { value: 'maquinas' } });
    expect(screen.getByRole('button', { name: 'Stock de máquinas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ventas de servicios' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar tema' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ventas de servicios' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Ventas de servicios' }));
    fireEvent.click(screen.getByRole('button', { name: 'Órdenes de servicio' }));
    expect(screen.getByText('1 de 3')).toBeInTheDocument();
  });

  it('hides a revoked priority and its choice', () => {
    localStorage.setItem(panoramaStorageKey('manager-a'), '["repuestos.analisis","servicios.ventas"]');
    allowed.delete('repuestos.analisis');
    render(<CampiPanorama />);
    expect(screen.queryByText('Análisis de repuestos')).not.toBeInTheDocument();
    expect(screen.getByText('1 de 3')).toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CampiPanorama from './CampiPanorama';
import { panoramaStorageKey } from '@/lib/campi/panoramaPreferences';

const allowed = new Set(['servicios.ventas', 'repuestos.analisis']);
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'manager-a' }, hasSectionAccess: (section: string) => allowed.has(section) }),
}));

beforeEach(() => { localStorage.clear(); allowed.clear(); allowed.add('servicios.ventas'); allowed.add('repuestos.analisis'); });
afterEach(cleanup);

describe('Campi Panorama', () => {
  it('offers three priorities on first visit, then saves and follows their order', () => {
    const view = render(<MemoryRouter><CampiPanorama /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Temas de interés' })).toBeInTheDocument();
    expect(screen.queryByText('Parque y disponibilidad')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Subir Stock de repuestos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar prioridades' }));
    expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBe('["repuestos","ventas"]');
    expect(within(screen.getByRole('region', { name: 'Tu enfoque' })).getAllByRole('heading', { level: 2 }).map(node => node.textContent)).toEqual(['Stock de repuestos', 'Ventas y facturación']);
    view.unmount();
    render(<MemoryRouter><CampiPanorama /></MemoryRouter>);
    expect(screen.queryByRole('heading', { name: 'Temas de interés' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Tu enfoque' })).getAllByRole('heading', { level: 2 }).map(node => node.textContent)).toEqual(['Stock de repuestos', 'Ventas y facturación']);
  });

  it('lets the user replace a priority while keeping the limit of three', () => {
    allowed.add('parque.stock'); allowed.add('servicios.ordenes');
    render(<MemoryRouter><CampiPanorama /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Órdenes y trabajos' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Stock de repuestos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Órdenes y trabajos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar prioridades' }));
    expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBe('["ventas","parque","servicios"]');
  });

  it('drops a revoked area and never renders its old route', () => {
    localStorage.setItem(panoramaStorageKey('manager-a'), '["repuestos","ventas"]');
    allowed.delete('repuestos.analisis');
    render(<MemoryRouter><CampiPanorama /></MemoryRouter>);
    expect(screen.queryByText('Stock de repuestos')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Servicios' })).toHaveAttribute('href', '/servicios/ventas');
  });
});

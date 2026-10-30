import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CampiPanorama from './CampiPanorama';
import { panoramaStorageKey } from '@/lib/campi/panoramaPreferences';

vi.mock('@/components/auth/GradientWaves',()=>({default:()=>null}));
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

beforeEach(() => { sessionStorage.clear();localStorage.clear(); allowed.clear(); baseline.forEach(id => allowed.add(id)); });
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('Campi Panorama configuration', () => {
  it('saves more than three ordered topics and restores them', () => {
    const view = render(<CampiPanorama />);
    fireEvent.click(screen.getByRole('button',{name:'Preparar mi Panorama'}));
    expect(screen.getByText(/0 de 4 elegidos/)).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'¿En qué querés enfocarte?'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Facturación y notas de crédito' }));
    fireEvent.click(screen.getByRole('button', { name: /^Stock antiguo de repuestos/ }));
    fireEvent.click(screen.getByRole('button', { name: 'OS facturadas a clientes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pedidos pendientes' }));
    expect(screen.getByText('4 de 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Subir Pedidos pendientes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver mi Panorama' }));
    expect(localStorage.getItem(panoramaStorageKey('manager-a')))
      .toBe('["ventas_facturacion","repuestos_stock","maquinas_pedidos","servicios_os_facturadas"]');
    expect(screen.getByTestId('panorama-panel')).toHaveTextContent('ventas_facturacion|repuestos_stock|maquinas_pedidos|servicios_os_facturadas');
    view.unmount();
    render(<CampiPanorama />);
    const prepare=screen.queryByRole('button',{name:'Preparar mi Panorama'});if(prepare)fireEvent.click(prepare);
    fireEvent.click(screen.getByRole('button', { name: 'Editar prioridades' }));
    expect(screen.getByRole('button', { name: 'Prioridades guardadas' })).toBeDisabled();
    expect(screen.getByText('Editar prioridades')).toBeInTheDocument();
    expect(screen.getByText('4 de 4')).toBeInTheDocument();
  });

  it('shows each topic once and reacts when adding or removing it', () => {
    render(<CampiPanorama />);
    const prepare=screen.queryByRole('button',{name:'Preparar mi Panorama'});if(prepare)fireEvent.click(prepare);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Área' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OS facturadas a clientes' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OS facturadas a clientes' }));

    expect(screen.queryByRole('button', { name: 'OS facturadas a clientes' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar OS facturadas a clientes' }));

    expect(screen.getByRole('button', { name: 'OS facturadas a clientes' })).toBeInTheDocument();
  });

  it('hides a priority when all of its source sections are revoked', () => {
    localStorage.setItem(panoramaStorageKey('manager-a'), '["maquinas_stock","repuestos_stock"]');
    allowed.delete('parque.operaciones');
    render(<CampiPanorama />);
    const prepare=screen.queryByRole('button',{name:'Preparar mi Panorama'});if(prepare)fireEvent.click(prepare);
    expect(screen.queryByText('Pedidos pendientes')).not.toBeInTheDocument();
    expect(screen.getByTestId('panorama-panel')).toHaveTextContent('repuestos_stock');
  });

  it('reorders topics by dragging as well as with keyboard-accessible buttons', () => {
    render(<CampiPanorama />);
    const prepare=screen.queryByRole('button',{name:'Preparar mi Panorama'});if(prepare)fireEvent.click(prepare);
    fireEvent.click(screen.getByRole('button', { name: 'Facturación y notas de crédito' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pedidos pendientes' }));
    const first = screen.getByText('Facturación y notas de crédito').closest('li');
    const second = screen.getByText('Pedidos pendientes').closest('li');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    fireEvent.dragStart(first!, { dataTransfer: { effectAllowed: 'move' } });
    fireEvent.dragOver(second!);
    fireEvent.drop(second!);

    fireEvent.click(screen.getByRole('button', { name: 'Ver mi Panorama' }));
    expect(screen.getByTestId('panorama-panel')).toBeInTheDocument();
    expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBe('["maquinas_pedidos","ventas_facturacion"]');
  });
  it('asks which priority to replace when all four slots are used', () => {
    render(<CampiPanorama />);
    const prepare=screen.queryByRole('button',{name:'Preparar mi Panorama'});if(prepare)fireEvent.click(prepare);
    for (const name of ['Facturación y notas de crédito', 'Stock antiguo de repuestos', 'OS facturadas a clientes', 'Pedidos pendientes']) fireEvent.click(screen.getByRole('button', { name }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolución de órdenes de servicio' }));
    expect(screen.getByRole('status')).toHaveTextContent('Elegí qué tema reemplazar');
    expect(screen.getByText('4 de 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar OS facturadas a clientes por Resolución de órdenes de servicio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver mi Panorama' }));
    expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBe('["ventas_facturacion","repuestos_stock","servicios_pendientes","maquinas_pedidos"]');
  });
  it('keeps the welcome open when saving fails and preserves the previous order on cancel', () => {
    const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    render(<CampiPanorama />);
    const prepare=screen.queryByRole('button',{name:'Preparar mi Panorama'});if(prepare)fireEvent.click(prepare);
    fireEvent.click(screen.getByRole('button', { name: 'Facturación y notas de crédito' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver mi Panorama' }));
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar');
    expect(screen.getByRole('heading',{name:'¿En qué querés enfocarte?'})).toBeInTheDocument();
    denied.mockRestore();
  });
  it('cancels later edits without changing saved priorities', () => {
    localStorage.setItem(panoramaStorageKey('manager-a'), '["ventas_facturacion","maquinas_pedidos"]');
    render(<CampiPanorama />);
    const prepare=screen.queryByRole('button',{name:'Preparar mi Panorama'});if(prepare)fireEvent.click(prepare);
    fireEvent.click(screen.getByRole('button', { name: 'Editar prioridades' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Pedidos pendientes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver al panorama' }));
    expect(screen.getByTestId('panorama-panel')).toHaveTextContent('ventas_facturacion|maquinas_pedidos');
    expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBe('["ventas_facturacion","maquinas_pedidos"]');
  });
});

it('does not expose the temporary tour and preserves returning user priorities',()=>{
 const key=panoramaStorageKey('manager-a');
 localStorage.setItem(key,'["servicios_os_facturadas"]');
 render(<CampiPanorama/>);
 expect(screen.queryByRole('button',{name:'Probar recorrido inicial'})).not.toBeInTheDocument();
 expect(screen.queryByRole('navigation',{name:'Vista previa del recorrido'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Preparar mi Panorama'})).not.toBeInTheDocument();
 expect(screen.getByTestId('panorama-panel')).toHaveTextContent('servicios_os_facturadas');
 expect(localStorage.getItem(key)).toBe('["servicios_os_facturadas"]');
});

 it('resumes selector after explicit start without completing preferences',()=>{
  const view=render(<CampiPanorama/>);
  expect(screen.getByRole('button',{name:'Preparar mi Panorama'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Ver mi Panorama'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Preparar mi Panorama'}));view.unmount();
  render(<CampiPanorama/>);
  expect(screen.queryByRole('button',{name:'Preparar mi Panorama'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Ver mi Panorama'})).toBeInTheDocument();
  expect(localStorage.getItem(panoramaStorageKey('manager-a'))).toBeNull();
 });

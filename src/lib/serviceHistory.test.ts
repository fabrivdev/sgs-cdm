import { describe, it, expect } from 'vitest';
import { serviceTypes, serviceOwner, billingComponent } from './serviceHistory';
describe('service history identity and classification', () => {
  it('preserves both time types without creating a fourth category', () => {
    expect(serviceTypes({ tipo_tiempo: 'Mixto', raw_data: { tipos_tiempo: ['Cliente', 'Garantia'] } })).toEqual(['Cliente', 'Garantia']);
  });
  it('recovers types from operational breakdown', () => {
    expect(serviceTypes({ tipo_tiempo: 'Mixto', raw_data: { totales_por_tipo: { Interno: {}, Garantia: {} } } })).toEqual(['Interno', 'Garantia']);
  });
  it('does not call the billed recipient the owner', () => {
    expect(serviceOwner({ cliente_nombre: 'Facturado', raw_data: { CLIFAC: '123' } })).toBe('Propietario no informado');
    expect(serviceOwner({ cliente_nombre: 'Facturado', raw_data: { Nombre: 'Dueño', CLIFAC: '123' } })).toBe('Dueño');
  });
  it('does not classify all unknown items as third-party services', () => {
    expect(billingComponent({ grupo_normalizado: 'Otros', subgrupo_original: null })).toBeNull();
    expect(billingComponent({ grupo_normalizado: 'Servicio', subgrupo_original: null, mercaderia: 'SERVICIO DE TERCEROS' })).toBe('terceros');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { orderCampiVariants, readLastCampiVariant, rememberCampiVariant } from './campiVariantRotation';

const prefix = 'topic:repuestos_alertas:';
const comments = ['proximidad', 'valor', 'umbral'].map(id => ({ key: `${prefix}${id}` }));

beforeEach(() => localStorage.clear());

describe('ciclo local de intervenciones de Campi', () => {
  it('agota las variantes elegibles antes de volver al inicio, sin repetir la inmediata', () => {
    expect(orderCampiVariants(comments, null).map(row => row.key)).toEqual(comments.map(row => row.key));
    for (const [shown, next] of [['proximidad', 'valor'], ['valor', 'umbral'], ['umbral', 'proximidad']]) {
      rememberCampiVariant('usuario-a', `${prefix}${shown}`);
      expect(orderCampiVariants(comments, readLastCampiVariant('usuario-a'))[0].key).toBe(`${prefix}${next}`);
    }
  });
  it('no mezcla usuarios ni guarda payload y conserva otros temas en su posición', () => {
    rememberCampiVariant('usuario-a', `${prefix}proximidad`);
    expect(readLastCampiVariant('usuario-b')).toBeNull();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('sig-cdm:campi:repuestos-alertas-cycle:v1:usuario-a')).toBe(`${prefix}proximidad`);
    const mixed = [{ key: 'topic:ventas_evolucion' }, ...comments, { key: 'topic:servicios_pendientes' }];
    const ordered = orderCampiVariants(mixed, readLastCampiVariant('usuario-a'));
    expect(ordered.map(row => row.key)).toEqual(['topic:ventas_evolucion', `${prefix}valor`, `${prefix}umbral`, `${prefix}proximidad`, 'topic:servicios_pendientes']);
    rememberCampiVariant('usuario-b', `${prefix}umbral`);
    expect(readLastCampiVariant('usuario-a')).toBe(`${prefix}proximidad`);
    expect(readLastCampiVariant('usuario-b')).toBe(`${prefix}umbral`);
  });
});

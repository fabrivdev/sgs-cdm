import { describe, expect, it } from 'vitest';
import { matchesServiceSalesSearch, normalizeServiceSalesSearch } from './serviceSalesSearch';

describe('service sales search', () => {
  const line = { propietario: 'Dueño actual', propietario_os: 'VALDECIR MOHR',
    cliente: 'Pagador tercero', os: '5734', factura: '1-3-201', chasis: 'C7501463' };
  it('finds the OS owner even when the current owner and billed client differ', () => {
    expect(matchesServiceSalesSearch(line, '  Valdécir  Mohr  ')).toBe(true);
    expect(matchesServiceSalesSearch(line, 'Pagador tercero')).toBe(true);
    expect(matchesServiceSalesSearch(line, 'C7501463')).toBe(true);
    expect(matchesServiceSalesSearch(line, 'Otro cliente')).toBe(false);
  });
  it('uses the same normalized search receipt as the SQL panels', () => {
    expect(normalizeServiceSalesSearch('1-3-201 · Garantía')).toBe('1 3 201 GARANTIA');
    expect(matchesServiceSalesSearch({ texto_busqueda: 'VALDECIR MOHR' }, 'valdecir mohr')).toBe(true);
    expect(matchesServiceSalesSearch(line, '')).toBe(true);
  });
});

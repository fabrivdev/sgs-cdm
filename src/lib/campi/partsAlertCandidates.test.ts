import { describe, expect, it } from 'vitest';
import { validatePartsAlertCandidates, withPartsAlertCandidateDetails } from './partsAlertCandidates';
import { withPartsExpansion } from './sourceExpansion';
import type { PanoramaStory } from './panoramaStoryTypes';

const story = (): PanoramaStory => ({
  id: 'repuestos_alertas', time: { classificationDate: '2026-10-23' },
  primary: { label: 'Valor positivo expuesto en 30 días', value: 35, unit: 'USD' },
  supporting: [{ label: 'Códigos expuestos', value: 2, unit: 'count' }],
  chart: { kind: 'bars', title: '', unit: 'USD', rows: [
    { label: 'Gris', value: 10, count: 1 }, { label: 'Rojo', value: 25, count: 1 },
  ] },
} as PanoramaStory);

const candidates = () => [
  {
    codigo: 'REP-A', descripcion: 'Filtro', color_actual: 'LILA', destino: 'GRIS',
    ultima_compra: '2025-10-23', fuente_compra: 'Ficha GRID - compras reales',
    dias_compra: 365, dias_hasta: 1, stock_unidades: 3, valor_usd: 10,
    kardex_cargado_en: null, ubicaciones_sin_valor: 1, ubicaciones_valor_no_positivo: 0,
    ubicaciones_saldo_distinto: 0, unidades_anio_actual: 0, unidades_anio_anterior: 0, unidades_hace_dos_anios: 0,
  },
  {
    codigo: 'REP-B', descripcion: 'Correa', color_actual: 'GRIS', destino: 'ROJO',
    ultima_compra: '2024-01-27', fuente_compra: 'Factura de compra TOTVS',
    dias_compra: 1000, dias_hasta: 1, stock_unidades: 2, valor_usd: 25,
    kardex_cargado_en: '2026-10-20T12:00:00Z', ubicaciones_sin_valor: 0, ubicaciones_valor_no_positivo: 0,
    ubicaciones_saldo_distinto: 1, unidades_anio_actual: 0, unidades_anio_anterior: 0, unidades_hace_dos_anios: 0,
  },
];

describe('fichas opcionales de cambios de clasificación', () => {
  it('concilia los umbrales 365/366 y 1000/1001 sin inventar stock ni venta', () => {
    const rows = validatePartsAlertCandidates(story(), candidates());
    expect(rows.map(row => [row.currentColor, row.destination, row.daysUntil])).toEqual([['LILA', 'GRIS', 1], ['GRIS', 'ROJO', 1]]);
    expect(rows[0]).toMatchObject({ stockUnits: 3, eligibleValueUsd: 10, kardexLoadedAt: null, missingValueLocations: 1 });
    expect(rows[1].salesUnits).toEqual([0, 0, 0]);
    expect(() => validatePartsAlertCandidates(story(), [{ ...candidates()[0], dias_compra: 366 }, candidates()[1]])).toThrow();
    expect(() => validatePartsAlertCandidates(story(), [candidates()[0], { ...candidates()[1], dias_compra: 1001 }])).toThrow();
  });
  it('rechaza compra sin fecha, venta positiva, código duplicado y valor que no concilia', () => {
    expect(() => validatePartsAlertCandidates(story(), [{ ...candidates()[0], ultima_compra: null }, candidates()[1]])).toThrow();
    expect(() => validatePartsAlertCandidates(story(), [{ ...candidates()[0], unidades_anio_actual: 1 }, candidates()[1]])).toThrow();
    expect(() => validatePartsAlertCandidates(story(), [candidates()[0], { ...candidates()[1], codigo: 'REP-A' }])).toThrow();
    expect(() => validatePartsAlertCandidates(story(), [candidates()[0], { ...candidates()[1], valor_usd: 24 }])).toThrow();
  });
  it('distingue bloque ausente de un cero verificado y preserva agregados vigentes', () => {
    const baseline = story();
    expect(withPartsAlertCandidateDetails(baseline, {})).toBe(baseline);
    expect(withPartsAlertCandidateDetails(baseline, { candidatos_30d: candidates() }).partsAlertCandidates).toHaveLength(2);
    expect(withPartsAlertCandidateDetails(baseline, { candidatos_30d: [] })).toBe(baseline);
    expect(withPartsAlertCandidateDetails(baseline, { candidatos_30d: [{ ...candidates()[0], valor_usd: 999 }, candidates()[1]] })).toBe(baseline);
  });
  it('acepta lista vacía solo cuando el agregado confirma cero candidatos', () => {
    const empty = story();
    empty.primary = { ...empty.primary!, value: 0 };
    empty.supporting = [{ label: 'Códigos expuestos', value: 0, unit: 'count' }];
    empty.chart = { ...empty.chart!, rows: empty.chart!.rows.map(row => ({ ...row, value: 0, count: 0 })) };
    expect(validatePartsAlertCandidates(empty, [])).toEqual([]);
    expect(withPartsAlertCandidateDetails(empty, { candidatos_30d: [] }).partsAlertCandidates).toEqual([]);
  });
  it('verifica correspondencia con las transiciones cuando las entrega la misma función', () => {
    const transitions = candidates().map(row => ({ codigo: row.codigo, destino: row.destino, dias_hasta: row.dias_hasta, valor_usd: row.valor_usd }));
    expect(validatePartsAlertCandidates(story(), candidates(), transitions)).toHaveLength(2);
    expect(() => validatePartsAlertCandidates(story(), candidates(), [{ ...transitions[0], dias_hasta: 2 }, transitions[1]])).toThrow();
    const expanded = withPartsExpansion(story(), { transiciones: transitions });
    expect(withPartsAlertCandidateDetails(expanded, { transiciones: transitions, candidatos_30d: candidates() }).partsAlertCandidates).toHaveLength(2);
  });
});

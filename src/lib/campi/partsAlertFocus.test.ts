import { describe, expect, it } from 'vitest';
import { partsAlertFocus, partsAlertVariants, validPartsAlertRange } from './partsAlertFocus';
import { interpretCampi } from './campiInterpretation';
import { buildCampiComments } from './campiComments';
import type { PanoramaStory } from './panoramaStoryTypes';

const story = (): PanoramaStory => ({
  id: 'repuestos_alertas', title: 'Cambios próximos de clasificación', question: '',
  status: 'ready', message: '', scope: '', sections: ['repuestos.analisis'], cutoff: null,
  periodLabel: 'Clasificación 23/10/2026', time: { classificationDate: '2026-10-23' },
  primary: { label: 'Valor expuesto', value: 200, unit: 'USD' },
  supporting: [{ label: 'Códigos expuestos', value: 3, unit: 'count' }],
  chart: null, breakdown: [], details: [], source: '', route: '/repuestos/analisis',
  changeBuckets: [
    { label: '1–7 días', gris: { count: 1, value: 40 }, rojo: { count: 1, value: 60 } },
    { label: '8–14 días', gris: { count: 0, value: 0 }, rojo: { count: 1, value: 100 } },
    { label: '15–21 días', gris: { count: 0, value: 0 }, rojo: { count: 0, value: 0 } },
    { label: '22–30 días', gris: { count: 0, value: 0 }, rojo: { count: 0, value: 0 } },
  ],
});

describe('primer caso de cambios próximos para Campi', () => {
  it('prioriza ventana más cercana y valor dentro de ella; Explorar conserva esa cohorte', () => {
    const focus = partsAlertFocus(story());
    expect(focus?.text).toContain('1 código');
    expect(focus?.text).toContain('rojo');
    expect(focus?.text).toContain('$ 60');
    expect(focus?.text).not.toContain('$ 200');
    expect(focus?.route).toContain('color=GRIS&compra_dias_min=994&compra_dias_max=1000');
    const finding = interpretCampi([story()]).findings[0];
    expect(finding).toMatchObject({ topic: 'repuestos_alertas', kind: 'attention', route: focus?.route });
    expect(buildCampiComments([story()], null)[0].route).toBe(focus?.route);
  });
  it('usa ficha conciliada de un solo código para plazo exacto sin usarla como pronóstico de valor', () => {
    const input = story();
    input.partsAlertCandidates = [{
      code: 'REP-1', description: 'Filtro', currentColor: 'GRIS', destination: 'ROJO',
      lastPurchase: '2024-01-29', purchaseSource: 'Factura de compra TOTVS', ageDays: 998, daysUntil: 3,
      stockUnits: 2, eligibleValueUsd: 60, kardexLoadedAt: null, missingValueLocations: 0,
      nonpositiveValueLocations: 0, mismatchedKardexLocations: 0, salesUnits: [0, 0, 0],
    }];
    const focus = partsAlertFocus(input);
    expect(focus?.text).toContain('REP-1');
    expect(focus?.text).toContain('en 3 días');
    expect(focus?.route).toContain('compra_dias_min=998&compra_dias_max=998');
  });
  it('habilita enfoques distintos solo cuando la ficha acredita códigos, stock y calidad', () => {
    const input = story();
    input.partsAlertCandidates = [
      { code: 'REP-1', description: 'Filtro', currentColor: 'GRIS', destination: 'ROJO', lastPurchase: '2024-01-29', purchaseSource: 'TOTVS', ageDays: 998, daysUntil: 3, stockUnits: 2, eligibleValueUsd: 60, kardexLoadedAt: null, missingValueLocations: 1, nonpositiveValueLocations: 0, mismatchedKardexLocations: 1, salesUnits: [0, 0, 0] },
      { code: 'REP-2', description: 'Correa', currentColor: 'LILA', destination: 'GRIS', lastPurchase: '2025-10-23', purchaseSource: 'GRID', ageDays: 365, daysUntil: 1, stockUnits: 3, eligibleValueUsd: 40, kardexLoadedAt: null, missingValueLocations: 0, nonpositiveValueLocations: 0, mismatchedKardexLocations: 0, salesUnits: [0, 0, 0] },
      { code: 'REP-3', description: 'Buje', currentColor: 'GRIS', destination: 'ROJO', lastPurchase: '2024-02-05', purchaseSource: 'TOTVS', ageDays: 991, daysUntil: 10, stockUnits: 1, eligibleValueUsd: 100, kardexLoadedAt: null, missingValueLocations: 0, nonpositiveValueLocations: 0, mismatchedKardexLocations: 0, salesUnits: [0, 0, 0] },
    ];
    const variants = partsAlertVariants(input);
    expect(variants.length).toBeGreaterThanOrEqual(12);
    expect(variants.map(variant => variant.id)).toEqual(expect.arrayContaining(['codigo', 'compra', 'unidades', 'valor_incompleto', 'saldo', 'otra_franja', 'ventas_evaluadas']));
    expect(new Set(variants.map(variant => variant.id)).size).toBe(variants.length);
    expect(variants.find(variant => variant.id === 'codigo')?.route).toContain('color=GRIS&compra_dias_min=998&compra_dias_max=998');
    expect(variants.find(variant => variant.id === 'otra_franja')?.route).toContain('color=LILA&compra_dias_min=365&compra_dias_max=365');
    const withoutEvidence = partsAlertVariants(story());
    expect(withoutEvidence.map(variant => variant.id)).not.toContain('codigo');
    expect(withoutEvidence.map(variant => variant.id)).not.toContain('saldo');
    expect(withoutEvidence.map(variant => variant.id)).not.toContain('unidades');
  });
  it('omite ausencia, cero, cifras que no concilian o permisos insuficientes', () => {
    const noData = story(); noData.changeBuckets = undefined;
    expect(partsAlertFocus(noData)).toBeNull();
    const wrongTotal = story(); wrongTotal.primary = { ...wrongTotal.primary!, value: 201 };
    expect(partsAlertFocus(wrongTotal)).toBeNull();
    const noPermission = story(); noPermission.status = 'error';
    expect(partsAlertFocus(noPermission)).toBeNull();
    const zero = story(); zero.primary = { ...zero.primary!, value: 0 }; zero.supporting[0] = { ...zero.supporting[0], value: 0 };
    zero.changeBuckets = zero.changeBuckets!.map(bucket => ({ ...bucket, gris: { count: 0, value: 0 }, rojo: { count: 0, value: 0 } }));
    expect(partsAlertFocus(zero)).toBeNull();
    expect(partsAlertVariants(zero)).toEqual([]);
  });
  it('acepta solo rangos que pertenecen al aviso y nunca amplía el filtro arbitrariamente', () => {
    expect(validPartsAlertRange('GRIS', '994', '1000')).toBe(true);
    expect(validPartsAlertRange('LILA', '359', '365')).toBe(true);
    expect(validPartsAlertRange('GRIS', '900', '1000')).toBe(false);
    expect(validPartsAlertRange('GRIS', '1001', '1001')).toBe(false);
    expect(validPartsAlertRange('LILA', '365', '336')).toBe(false);
    expect(validPartsAlertRange('ROJO', '994', '1000')).toBe(false);
  });
});

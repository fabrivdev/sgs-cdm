import { describe, expect, it } from 'vitest';
import { parsePartsExposure, partsAlertsStory, partsExposureStory } from './partsExposure';

const payload = () => ({
  fecha_analisis: '2026-10-19', codigos_stock: 30, ubicaciones_stock: 40,
  ubicaciones_sin_valor: 1, ubicaciones_valor_no_positivo: 1,
  ubicaciones_sin_saldo_kardex: 1, ubicaciones_saldo_distinto: 1,
  valor_total_usd: 1000, valor_antiguo_usd: 300, codigos_antiguos: 7,
  valor_sin_fecha_usd: 50, valor_residual_sin_stock_usd: 20,
  colores: [{ color: 'GRIS', codigos: 4, valor_usd: 100 }, { color: 'ROJO', codigos: 3, valor_usd: 200 }, { color: 'VERDE_CLARO', codigos: 10, valor_usd: 650 }, { color: 'SIN_DATOS', codigos: 2, valor_usd: 50 }],
  avisos: [{ destino: 'GRIS', umbral_dias: 366, codigos: 2, valor_usd: 40 }, { destino: 'ROJO', umbral_dias: 1001, codigos: 1, valor_usd: 25 }],
  sucursales: [{ nombre: 'Santa Rita', valor_total_usd: 600, valor_antiguo_usd: 250, codigos_antiguos: 6 }, { nombre: 'Katuete', valor_total_usd: 400, valor_antiguo_usd: 50, codigos_antiguos: 2 }],
  familias: [{ nombre: 'Filtros', valor_total_usd: 1000, valor_antiguo_usd: 300, codigos_antiguos: 7 }],
});

describe('Panorama stock antiguo', () => {
  it('shows value and share while keeping missing dates and Kardex residual outside the denominator', () => {
    const story = partsExposureStory(parsePartsExposure(payload()));
    expect(story.primary).toMatchObject({ label: 'Valor de stock gris y rojo', value: 300, unit: 'USD' });
    expect(story.supporting.find(item => item.label === 'Participación de stock antiguo')?.value).toBe(30);
    expect(story.supporting.find(item => item.label === 'Valor en categoría Sin datos')?.value).toBe(50);
    expect(story.cutoff).toBeNull();
    expect(story.notices?.[0].route).toBe('/repuestos/analisis?color=GRIS&compra_dias_min=971&compra_dias_max=1000&vista=detalle');
    expect(story.notices?.[1].route).toBe('/repuestos/analisis?color=LILA&compra_dias_min=336&compra_dias_max=365&vista=detalle');
    expect(story.breakdown.find(row => row.label.startsWith('Santa Rita'))?.value).toBe(250);
  });
  it('keeps exposed codes when they have no positive valuation', () => {
    const data = payload();
    data.avisos = data.avisos.map(row => ({ ...row, valor_usd: 0 }));
    const story = partsAlertsStory(parsePartsExposure(data));
    expect(story.supporting[0].value).toBe(3);
    expect(story.message).toContain('3 códigos podrían');
    expect(story.primary?.note).toContain('sin valor positivo');
    expect(story.notices).toHaveLength(2);
    expect(story.notices?.[0].text).toContain('sin valor positivo acreditado');
  });
  it('rejects a concentration that does not reconcile with the old stock total', () => {
    const data = payload();
    data.familias[0].valor_antiguo_usd = 1001;
    expect(() => parsePartsExposure(data)).toThrow('no concilia');
    expect(() => parsePartsExposure({ ...payload(), fecha_analisis: '2026-02-30' })).toThrow('fecha');
  });
  it('rejects incomplete or non-reconciling responses before showing a KPI', () => {
    expect(() => parsePartsExposure({ ...payload(), colores: payload().colores.slice(1) })).toThrow('no concilia');
    expect(() => parsePartsExposure({ ...payload(), valor_total_usd: 0 })).toThrow('no concilia');
    expect(() => parsePartsExposure({ ...payload(), avisos: payload().avisos.slice(1) })).toThrow('incompletos');
    expect(() => parsePartsExposure({ ...payload(), ubicaciones_sin_valor: null })).toThrow('incompletos');
  });
});

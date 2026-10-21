import { describe, expect, it } from 'vitest';
import { billedOrdersStory, customerStories, planningStory } from './managerialStories';
import type { OrderBilling } from '@/features/service-orders/billing';

const invoice = (os: string, overrides: Partial<OrderBilling> = {}): OrderBilling => ({
  os, matched: true, ambiguous: false, documents: ['001-001-123'], date: '2026-10-20',
  labor: 100, parts: 0, travel: 0, thirdParty: 0, total: 100,
  laborLines: 1, missingRates: 0, billedHours: 2, ...overrides,
});

describe('Panorama themes reused from managerial measures', () => {
  it('keeps future agenda items outside the denominator and exposes the components', () => {
    const story = planningStory([
      { id: 'a', fecha: '2026-10-02', estado: 'Completado' },
      { id: 'b', fecha: '2026-10-10', estado: 'Pendiente' },
      { id: 'c', fecha: '2026-10-25', estado: 'Pendiente' },
    ], '2026-10-21');
    expect(story.primary?.value).toBe(50);
    expect(story.supporting).toEqual(expect.arrayContaining([{ label: 'Evaluables', value: 2, unit: 'count' }]));
    expect(story.chart?.rows).toContainEqual({ label: 'Pendientes', value: 1 });
  });

  it('does not invent a compliance rate without evaluable commitments', () => {
    const story = planningStory([{ id: 'future', fecha: '2026-10-25', estado: 'Pendiente' }], '2026-10-21');
    expect(story.status).toBe('empty');
    expect(story.primary?.value).toBeNull();
  });

  it('uses distinct customer denominators and refuses impossible source totals', () => {
    const [retention, coverage] = customerStories({ compradores_base: 20, compradores_retenidos: 8,
      propietarios_elegibles: 100, propietarios_con_compra_actual: 25 }, '2026-10-21');
    expect(retention.primary?.value).toBe(40);
    expect(coverage.primary?.value).toBe(25);
    expect(retention.chart?.rows[1].value).toBe(12);
    expect(() => customerStories({ compradores_base: 2, compradores_retenidos: 3,
      propietarios_elegibles: 5, propietarios_con_compra_actual: 1 }, '2026-10-21')).toThrow();
  });

  it('counts only linked positive customer invoices among all OS closed in the month', () => {
    const rows = [
      { os_numero: 'OS-1', fecha_cierre_os: '2026-10-02', situacion_os: 'Cerrada', tipo_tiempo: 'Cliente' },
      { os_numero: 'OS-2', fecha_cierre_os: '2026-10-03', situacion_os: 'Cerrada', tipo_tiempo: 'Cliente' },
      { os_numero: 'OS-3', fecha_cierre_os: '2026-10-04', situacion_os: 'Cerrada', tipo_tiempo: 'Garantía' },
      { os_numero: 'OS-4', fecha_cierre_os: '2026-09-30', situacion_os: 'Cerrada', tipo_tiempo: 'Cliente' },
    ];
    const bills = { 'OS-1': invoice('OS-1'), 'OS-2': invoice('OS-2', { matched: false, documents: [], total: null }) };
    const month = billedOrdersStory(rows, bills, '2026-10-21');
    expect(month.primary?.value).toBeCloseTo(100 / 3);
    expect(month.supporting).toContainEqual({ label: 'OS cerradas', value: 3, unit: 'count' });
    expect(month.chart?.rows).toEqual([
      { label: 'Cliente facturada', value: 1 },
      { label: 'Cliente sin factura', value: 1 },
      { label: 'Garantía, interno u otra', value: 1 },
    ]);
    const annual = billedOrdersStory(rows, { ...bills, 'OS-4': invoice('OS-4') }, '2026-10-21', 'ytd');
    expect(annual.primary?.value).toBe(50);
  });

  it('distinguishes no closed OS from a genuine zero and refuses ambiguous billing', () => {
    const row = { os_numero: 'OS-1', fecha_cierre_os: '2026-10-02', situacion_os: 'Cerrada', tipo_tiempo: 'Cliente' };
    expect(billedOrdersStory([], {}, '2026-10-21').primary?.value).toBeNull();
    expect(billedOrdersStory([row], { 'OS-1': invoice('OS-1', { matched: false, documents: [], total: null }) }, '2026-10-21').primary?.value).toBe(0);
    expect(() => billedOrdersStory([row], { 'OS-1': invoice('OS-1', { ambiguous: true }) }, '2026-10-21')).toThrow(/conciliar/);
  });
});

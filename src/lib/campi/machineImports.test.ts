import { describe, expect, it } from 'vitest';
import { summarizeMachineImports, machineImportsStory, type MachineImportUnit } from './machineImports';
import { factualVariants } from './factualRounds';
import { availablePanoramaTopics } from './panoramaPreferences';

const asOf = '2026-11-02';
const unit = (id: string, fields: Partial<MachineImportUnit> = {}): MachineImportUnit => ({
  id, importacion_linea_id: 'lot', numero_unidad: Number(id) || null, chasis: null,
  eta: '2026-12-15', ata: null, estado_fuente: 'PLANIFICADO', stock_fisico_confirmado: false,
  parque_confirmado: false, chasis_ambiguo: false, costo_stock_habilitado: false, estado_disponibilidad: null, marca: 'CLAAS', ...fields,
});

describe('annual machine import cohort', () => {
  it('uses one effective ETA cohort for all states, brands and the percentage', () => {
    const rows = [unit('1'), unit('2', { estado_fuente: 'EN_TRANSITO', marca: 'HORSCH' }),
      unit('3', { ata: '2026-10-01' }), unit('4', { stock_fisico_confirmado: true, parque_confirmado: true, marca: 'NB MAQUINAS', ata: '2025-12-31' }),
      unit('5', { parque_confirmado: true }), unit('6', { eta: '2027-01-01' }), unit('7', { eta: null }),
      unit('8', { estado_fuente: 'CANCELADA', stock_fisico_confirmado: true })];
    const data = summarizeMachineImports(rows, asOf);
    expect(data).toMatchObject({ year: 2026, total: 5, completed: 2, completionPercent: 40, excludedOtherYears: 1, excludedMissingETA: 1, excludedCancelled: 1,
      states: { PLANIFICADO: 1, EN_TRANSITO: 1, ARRIBADO: 1, COMPLETADO: 2 } });
    expect(data.brands).toEqual([{ label: 'CLAAS', total: 3, completed: 1 }, { label: 'HORSCH', total: 1, completed: 0 }, { label: 'NB', total: 1, completed: 1 }]);
    expect(Object.values(data.states).reduce((a,b)=>a+b,0)).toBe(data.total);
    expect(data.brands.reduce((a,b)=>a+b.total,0)).toBe(data.total);
  });
  it('includes the entire calendar year, including future months, with inclusive boundaries', () => {
    const data = summarizeMachineImports([unit('1', { eta: '2026-01-01' }), unit('2', { eta: '2026-12-31' }),
      unit('3', { eta: '2025-12-31' }), unit('4', { eta: '2027-01-01' })], '2026-01-01');
    expect(data.total).toBe(2); expect(data.excludedOtherYears).toBe(2);
  });
  it('rolls the annual cohort at the next year without hardcoded 2026', () => {
    const rows = [unit('1', { eta: '2026-12-31', stock_fisico_confirmado: true }), unit('2', { eta: '2027-01-01' })];
    expect(summarizeMachineImports(rows, '2026-12-31')).toMatchObject({ year: 2026, total: 1, completed: 1, completionPercent: 100 });
    expect(summarizeMachineImports(rows, '2027-01-01')).toMatchObject({ year: 2027, total: 1, completed: 0, completionPercent: 0 });
  });
  it('counts physically completed units without ATA and never changes the cohort to ATA', () => {
    const data = summarizeMachineImports([unit('1', { parque_confirmado: true }),
      unit('2', { eta: '2025-12-15', ata: '2026-10-01', stock_fisico_confirmado: true }),
      unit('3', { ata: '2025-12-01', stock_fisico_confirmado: true })], asOf);
    expect(data).toMatchObject({ total: 2, completed: 2, completionPercent: 100, excludedOtherYears: 1 });
  });
  it('keeps ATA-only reception separate from physical completion', () => {
    expect(summarizeMachineImports([unit('1', { ata: '2026-10-31' })], asOf)).toMatchObject({ total: 1, completed: 0, states: { ARRIBADO: 1 } });
    expect(summarizeMachineImports([unit('1', { estado_fuente: 'Completado', estado_disponibilidad: 'RESERVADO' })], asOf)).toMatchObject({ completed: 0, states: { PLANIFICADO: 1 } });
  });
  it('excludes missing and invalid ETA from every annual denominator, including completed units', () => {
    const data = summarizeMachineImports([unit('1', { eta: null, parque_confirmado: true }), unit('2', { eta: '2026-02-30' })], asOf);
    expect(data).toMatchObject({ total: 0, completed: 0, completionPercent: null, excludedMissingETA: 2 });
    const story = machineImportsStory(data);
    expect(story.status).toBe('empty'); expect(story.primary?.value).toBeNull();
    expect(story.details.join(' ')).toContain('2 sin ETA válida');
  });
  it('does not count cancelled Stock/Parque evidence and does not double-count a lot quantity', () => {
    const row = Object.assign(unit('1'), { cantidad_lote: 20, cantidad: 1 });
    const data = summarizeMachineImports([row, unit('2', { estado_fuente: 'CANCELADA', parque_confirmado: true })], asOf);
    expect(data.total).toBe(1); expect(data.excludedCancelled).toBe(1);
  });
  it('collapses identical unit evidence and rejects conflicting ID, lot/unit and chassis identities', () => {
    const row = unit('1');
    expect(summarizeMachineImports([row, row], asOf).total).toBe(1);
    expect(() => summarizeMachineImports([row, { ...row, eta: '2027-01-01' }], asOf)).toThrow(/duplicada/);
    expect(() => summarizeMachineImports([row, unit('2', { numero_unidad: 1 })], asOf)).toThrow(/duplicada/);
    expect(() => summarizeMachineImports([unit('1', { chasis: 'AB-123' }), unit('2', { chasis: 'ab 123' })], asOf)).toThrow(/duplicada/);
    expect(() => summarizeMachineImports([unit('', { importacion_linea_id: null })], asOf)).toThrow(/identidad/);
  });
  it('keeps a missing brand in the common total and uses the existing brand aliases', () => {
    const data = summarizeMachineImports([unit('1', { marca: null, proveedor: null }), unit('2', { marca: 'nb maquinas' })], asOf);
    expect(data.brands.map(b=>b.label)).toEqual(['NB', 'Sin marca']);
    expect(data.brands.reduce((a,b)=>a+b.total,0)).toBe(2);
  });
  it('changes state and numerator on receipt without changing the ETA cohort', () => {
    const before = summarizeMachineImports([unit('1')], asOf);
    const after = summarizeMachineImports([unit('1', { ata: '2026-10-31', stock_fisico_confirmado: true })], asOf);
    expect(before.total).toBe(after.total); expect(before.completionPercent).toBe(0); expect(after.completionPercent).toBe(100);
    expect(after.states.PLANIFICADO).toBe(0); expect(after.states.COMPLETADO).toBe(1);
  });
  it('changes membership only when ETA is rescheduled and documents this limitation', () => {
    const before = summarizeMachineImports([unit('1')], asOf);
    const after = summarizeMachineImports([unit('1', { eta: '2027-01-01' })], asOf);
    expect(before.total).toBe(1); expect(after.total).toBe(0);
    expect(machineImportsStory(after).details.join(' ')).toContain('reprogramar ETA');
  });
  it('gates annual Campi facts by permission and current observation without monthly copy', () => {
    expect(availablePanoramaTopics(() => true, s => s === 'parque.importaciones', false).map(t => t.id)).toEqual(['maquinas_importacion']);
    const story = machineImportsStory(summarizeMachineImports([unit('1'), unit('2', { parque_confirmado: true })], asOf));
    const comments = factualVariants(story, () => true, asOf);
    expect(comments).toHaveLength(1); expect(comments[0].text).toContain('1 de 2 máquinas'); expect(comments[0].text).toContain('50%');
    expect(comments[0].text).not.toMatch(/mes|arribadas y|sin mes|próximo/i);
    expect(comments[0].evidence).toMatchObject({ value: 50, unit: 'percent' });
    expect(factualVariants(story, () => false, asOf)).toEqual([]);
    expect(factualVariants(story, () => true, '2027-01-01')).toEqual([]);
    expect(factualVariants({ ...story, status: 'error' }, () => true, asOf)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { parseCurrentParkCoverageSeries } from './coverageSeries';

const months = [
  { from: '2026-05-01', to: '2026-05-31', numerator: 8, denominator: 211 },
  { from: '2026-06-01', to: '2026-06-30', numerator: 10, denominator: 211 },
  { from: '2026-07-01', to: '2026-07-31', numerator: 14, denominator: 211 },
  { from: '2026-08-01', to: '2026-08-31', numerator: 19, denominator: 211 },
  { from: '2026-09-01', to: '2026-09-30', numerator: 22, denominator: 211 },
  { from: '2026-10-01', to: '2026-10-21', numerator: 31, denominator: 211 },
];
const payload = { version: 1, cohort: 'current_park', mode: 'month', as_of: '2026-10-21', rows: months };
const current = { numerator: 31, denominator: 211 };

describe('fixed-current-park coverage series', () => {
  it('accepts a complete series reconciled to the established KPI', () => {
    const parsed = parseCurrentParkCoverageSeries(payload, '2026-10-21', 'month', current);
    expect(parsed?.points).toHaveLength(6);
    expect(parsed?.points.at(-1)).toMatchObject({ numerator: 31, denominator: 211, value: 31 / 211 * 100 });
    expect(parsed?.rows[0].label).toBe('may 2026');
  });

  it('rejects a changed denominator, drifted last count, omitted months and negative counts', () => {
    expect(parseCurrentParkCoverageSeries({ ...payload, rows: months.map((row, i) => i === 2 ? { ...row, denominator: 210 } : row) }, '2026-10-21', 'month', current)).toBeNull();
    expect(parseCurrentParkCoverageSeries({ ...payload, rows: months.map((row, i) => i === 5 ? { ...row, numerator: 30 } : row) }, '2026-10-21', 'month', current)).toBeNull();
    expect(parseCurrentParkCoverageSeries({ ...payload, rows: months.slice(1) }, '2026-10-21', 'month', current)).toBeNull();
    expect(parseCurrentParkCoverageSeries({ ...payload, rows: months.map((row, i) => i === 1 ? { ...row, numerator: -1 } : row) }, '2026-10-21', 'month', current)).toBeNull();
  });

  it('requires year-to-date intervals to begin January and reconcile their cumulative last point', () => {
    const ytd = { version: 1, cohort: 'current_park', mode: 'ytd', as_of: '2026-02-21', rows: [
      { from: '2026-01-01', to: '2026-01-31', numerator: 5, denominator: 20 },
      { from: '2026-01-01', to: '2026-02-21', numerator: 7, denominator: 20 },
    ] };
    expect(parseCurrentParkCoverageSeries(ytd, '2026-02-21', 'ytd', { numerator: 7, denominator: 20 })?.points).toHaveLength(2);
    expect(parseCurrentParkCoverageSeries({ ...ytd, rows: [{ ...ytd.rows[0], from: '2026-02-01' }, ytd.rows[1]] }, '2026-02-21', 'ytd', { numerator: 7, denominator: 20 })).toBeNull();
  });
});

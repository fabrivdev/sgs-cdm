import type { SalesDisplayColumn } from './SalesDataTable';
import type { SalesColumn } from './salesTableInteraction';
import { variation } from './salesPeriodComparison';
const dollars = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
export const periodMoney = (value: number | null | undefined) => value == null ? '—' : `$ ${dollars.format(value)}`;
export function periodMoneyColumn<T>(key: string, label: string, value: (row: T) => number | null | undefined): SalesDisplayColumn<T> {
  return { key, label, value, kind: 'number', align: 'right', excelFormat: '"$" #,##0;"$" -#,##0', render: row => periodMoney(value(row)) };
}
export function comparisonColumn<T>(key: string, label: string, amount: (r: T) => number | null, current: (r: T) => number): SalesDisplayColumn<T> {
  return { ...periodMoneyColumn(key, label, amount), weight: 1.6, render: row => {
    const prior = amount(row), delta = variation(current(row), prior);
    const title = prior == null ? 'Comparación no disponible.' : prior <= 0 ? 'Variación no calculable con base cero o negativa.' : undefined;
    return <span title={title}>{periodMoney(prior)}{prior != null && <> (<span className={delta != null && delta < 0 ? 'text-destructive' : undefined}>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}%`}</span>)</>}</span>;
  } };
}
export function comparisonExports<T>(key: string, label: string, amount: (r: T) => number | null, current: (r: T) => number): SalesColumn<T>[] {
  return [periodMoneyColumn(key, label, amount), { key: `${key}_variation`, label: `${label} variación`, kind: 'number', align: 'right', value: r => variation(current(r), amount(r)), excelFormat: '+0%;-0%;0%' }];
}

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KpiItem, KpiStrip } from './AppPrimitives';
const state = vi.hoisted(() => ({ mobile: true }));
vi.mock('@/hooks/use-mobile', () => ({useIsMobile: () => state.mobile}));
afterEach(() => { cleanup(); state.mobile = true; });
const items = [<KpiItem key="stock" label="Stock" value="5"/>, <KpiItem key="oc" label="OC" value="2"/>, <KpiItem key="pending" label="Pendientes" value="8"/>, <KpiItem key="projected" label="Proyectado" value="-1" tone="danger"/>];
describe('explicit mobile KPI hierarchy', () => {
 it.each([true, false])('does not reserve an empty caption line when a KPI has no detail (mobile=%s)', mobile => {
  state.mobile = mobile;
  const {container} = render(<KpiStrip><KpiItem label="Horas" value="12 h" /></KpiStrip>);
  expect(container.querySelector('.kpi-item')?.children).toHaveLength(2);
 });
 it('still renders a supplied secondary metric', () => {
  const {container} = render(<KpiStrip><KpiItem label="Valor" value="$ 100" detail="Pendiente: $ 20" /></KpiStrip>);
  expect(container.querySelector('.kpi-item')?.children).toHaveLength(3);
  expect(screen.getByText('Pendiente: $ 20')).toBeVisible();
 });
 it('keeps selected stock and negative projection visible, with every other metric retained', () => {
  const {container} = render(<KpiStrip mobilePrimary={[0,3]}>{items}</KpiStrip>);
  expect(screen.getByText('-1').closest('details')).toBeNull();
  expect(screen.getByText('5').closest('details')).toBeNull();
  expect(screen.getByText('OC').closest('details')).toBeNull();
  expect(container.querySelectorAll('details')).toHaveLength(0);
  expect(screen.getByText('Pendientes')).toBeInTheDocument();
 });
 it('does not collapse callers that have not chosen a mobile hierarchy', () => {
  const {container} = render(<KpiStrip>{items}</KpiStrip>);
  expect(container.querySelector('details')).toBeNull();
 });
 it('packs five mobile KPIs into two balanced rows without hiding any item', () => {
  const five = [...items, <KpiItem key="fifth" label="Días" value="4"/>];
  const {container} = render(<KpiStrip>{five}</KpiStrip>);
  const strip = container.querySelector('.mobile-kpi-strip');
  expect(strip).toHaveClass('grid-cols-6');
  const cells = Array.from(strip?.children ?? []);
  expect(cells).toHaveLength(5);
  cells.slice(0,3).forEach(cell => expect(cell).toHaveClass('col-span-2'));
  cells.slice(3).forEach(cell => expect(cell).toHaveClass('col-span-3'));
  expect(screen.getByText('Días')).toBeVisible();
 });
 it('leaves all desktop indicators in their original grid', () => {
  state.mobile = false;
  const {container} = render(<KpiStrip mobilePrimary={[0,3]} className="xl:grid-cols-4">{items}</KpiStrip>);
  expect(container.querySelector('details')).toBeNull();
  expect(container.querySelector('section')).toHaveClass('xl:grid-cols-4');
  expect(screen.getByText('OC')).toBeInTheDocument();
 });
});

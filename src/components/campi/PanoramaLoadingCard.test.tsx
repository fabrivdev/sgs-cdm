import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {PanoramaLoadingCard} from './PanoramaLoadingCard';
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('Panorama loading card',()=>{
 it('preserves topic and position without figures, legacy corner or repeated Campi',()=>{
  const {container}=render(<PanoramaLoadingCard index={2} label="Ventas"/>);
  expect(screen.getByRole('status',{name:'Consultando Ventas'})).toHaveAttribute('aria-busy','true');
  expect(screen.getByRole('heading',{name:'Ventas'})).toBeVisible();
  expect(screen.getByText('03')).toBeVisible();
  expect(container.querySelector('.panorama-story')).toBeNull();
  expect(container.querySelector('canvas,svg,button')).toBeNull();
  expect(container.querySelector('.panorama-skeleton-body')).toHaveAttribute('aria-hidden','true');
 });
 it('acknowledges elapsed waiting without claiming progress or failure and clears timer',()=>{
  vi.useFakeTimers();const {unmount}=render(<PanoramaLoadingCard index={0} label="Ventas"/>);
  expect(screen.getByText('Cargando datos…')).toBeVisible();
  act(()=>vi.advanceTimersByTime(10_000));
  expect(screen.getByText('La consulta sigue en curso.')).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();unmount();expect(vi.getTimerCount()).toBe(0);
 });
});

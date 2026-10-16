import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampiActionSprite } from './CampiActionSprite';
import { CAMPI_ACTIONS } from './campiActions';
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('Campi explicit action sequences', () => {
  it('returns every action to neutral', () => {
    for (const frames of Object.values(CAMPI_ACTIONS)) expect(frames.at(-1)).toMatchObject({body:'rest',face:'rest'});
  });
  it('anticipates, jumps, lands and returns', () => {
    vi.useFakeTimers(); const {container}=render(<CampiActionSprite action="celebrate" active reduced={false}/>);
    expect(container.firstChild).toHaveAttribute('data-motion','anticipate');
    act(()=>vi.advanceTimersByTime(180)); expect(container.firstChild).toHaveAttribute('data-motion','air');
    act(()=>vi.advanceTimersByTime(340)); expect(container.firstChild).toHaveAttribute('data-motion','land');
    act(()=>vi.advanceTimersByTime(680)); expect(container.firstChild).not.toHaveAttribute('data-motion');
  });
  it('opens with a jump, landing, bow and wave', () => {
    vi.useFakeTimers(); const {container}=render(<CampiActionSprite action="intro" active reduced={false}/>);
    expect(container.firstChild).toHaveAttribute('data-motion','anticipate');
    act(()=>vi.advanceTimersByTime(180)); expect(container.firstChild).toHaveAttribute('data-motion','air');
    act(()=>vi.advanceTimersByTime(300)); expect(container.firstChild).toHaveAttribute('data-motion','land');
    act(()=>vi.advanceTimersByTime(180)); expect(container.firstChild).toHaveAttribute('data-motion','bow');
    act(()=>vi.advanceTimersByTime(260)); expect(container.querySelector('img')?.getAttribute('src')).toBe('/campi/campi-wave.webp');
  });
  it('does not animate with reduced motion', () => {
    vi.useFakeTimers();const {container}=render(<CampiActionSprite action="celebrate" active reduced/>);
    expect(container.firstChild).not.toHaveAttribute('data-motion');expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans all timers when hidden or unmounted',()=>{
    vi.useFakeTimers();const {rerender,unmount}=render(<CampiActionSprite action="step" active reduced={false}/>);
    expect(vi.getTimerCount()).toBeGreaterThan(0);rerender(<CampiActionSprite action="step" active={false} reduced={false}/>);
    expect(vi.getTimerCount()).toBe(0);unmount();expect(vi.getTimerCount()).toBe(0);
  });
  it('requests only current action images, not the entire pose collection',()=>{
    const {container}=render(<CampiActionSprite action="angry" active reduced/>);
    expect(container.querySelectorAll('img')).toHaveLength(2);expect(container.querySelectorAll('img')[1].getAttribute('src')).toBe('/campi/campi-angry.webp');
  });
});

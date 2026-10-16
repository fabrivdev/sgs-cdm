import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampiSprite } from './CampiSprite';
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('Campi authored gestures', () => {
  it('changes hand frames for its own welcome then returns to rest', () => {
    const { container } = render(<CampiSprite state="welcome" active reduced={false} />);
    const sprite = container.firstElementChild!;
    expect(sprite).toHaveAttribute('data-pose', 'rest');
    act(() => vi.advanceTimersByTime(100));
    expect(sprite).toHaveAttribute('data-pose', 'wave');
    act(() => vi.advanceTimersByTime(250));
    expect(sprite).toHaveAttribute('data-pose', 'wave2');
    act(() => vi.advanceTimersByTime(950));
    expect(sprite).toHaveAttribute('data-pose', 'rest');
  });
  it('blinks briefly in idle', () => {
    const { container } = render(<CampiSprite state="idle" active reduced={false} />);
    act(() => vi.advanceTimersByTime(4800));
    expect(container.firstElementChild).toHaveAttribute('data-face', 'blink');
    act(() => vi.advanceTimersByTime(160));
    expect(container.firstElementChild).toHaveAttribute('data-pose', 'rest');
  });
  it.each([{active:false,reduced:false}, {active:true,reduced:true}])('does not animate when suspended: %j', ({active,reduced}) => {
    const { container } = render(<CampiSprite state="welcome" active={active} reduced={reduced} />);
    act(() => vi.advanceTimersByTime(10000));
    expect(container.firstElementChild).toHaveAttribute('data-pose', 'rest');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('smiles during the automatic welcome and settles naturally', () => {
    const { container } = render(<CampiSprite state="welcome" active reduced={false} />);
    expect(container.firstElementChild).toHaveAttribute('data-face', 'smile');
    act(() => vi.advanceTimersByTime(1300));
    expect(container.firstElementChild).toHaveAttribute('data-face', 'rest');
  });
  it('reacts with curiosity without moving the body', () => {
    const { container, rerender } = render(<CampiSprite state="idle" active reduced={false} curious />);
    expect(container.firstElementChild).toHaveAttribute('data-face', 'curious');
    expect(container.firstElementChild).toHaveAttribute('data-pose', 'rest');
    rerender(<CampiSprite state="idle" active reduced={false} />);
    expect(container.firstElementChild).toHaveAttribute('data-face', 'rest');
  });
  it('cleans up all timers on unmount', () => {
    const { unmount } = render(<CampiSprite state="idle" active reduced={false} />);
    act(() => vi.advanceTimersByTime(5000)); unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

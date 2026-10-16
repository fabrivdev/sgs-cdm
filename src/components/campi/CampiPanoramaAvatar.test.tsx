import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampiPanoramaAvatar } from './CampiPanoramaAvatar';

vi.mock('./CampiSprite', () => ({
  CampiSprite: ({ state }: { state: string }) => <span data-testid="campi-pose">{state}</span>,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Campi in Panorama', () => {
  it('greets, rests and gestures again while the page is visible', () => {
    render(<CampiPanoramaAvatar />);
    expect(screen.getByTestId('campi-pose')).toHaveTextContent('welcome');
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByTestId('campi-pose')).toHaveTextContent('idle');
    act(() => vi.advanceTimersByTime(12400));
    expect(screen.getByTestId('campi-pose')).toHaveTextContent('welcome');
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByTestId('campi-pose')).toHaveTextContent('idle');
  });
});

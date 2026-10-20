import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampiPanoramaAvatar } from './CampiPanoramaAvatar';

vi.mock('./CampiSprite', () => ({
  CampiSprite: ({ state, action }: { state: string; action: string }) => <span data-testid="campi-pose" data-action={action}>{state}</span>,
}));

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Campi in Panorama', () => {
  it('greets once, then rests without repeating a fixed gesture', () => {
    render(<CampiPanoramaAvatar />);
    expect(screen.getByTestId('campi-pose')).toHaveTextContent('welcome');
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByTestId('campi-pose')).toHaveTextContent('idle');
    act(() => vi.advanceTimersByTime(16400));
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'neutral');
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByTestId('campi-pose')).toHaveTextContent('idle');
  });
  it('uses distinct gestures for selecting, removing, reordering and saving', () => {
    const view = render(<CampiPanoramaAvatar />);
    view.rerender(<CampiPanoramaAvatar reaction={{ kind: 'select', token: 1 }} />);
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'celebrate');
    view.rerender(<CampiPanoramaAvatar reaction={{ kind: 'remove', token: 2 }} />);
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'consider');
    view.rerender(<CampiPanoramaAvatar reaction={{ kind: 'reorder', token: 3 }} />);
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'step');
    view.rerender(<CampiPanoramaAvatar reaction={{ kind: 'save', token: 4 }} />);
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'approve');
    act(() => vi.advanceTimersByTime(1300));
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'neutral');
  });
  it('responds directly when Campi is clicked', () => {
    render(<CampiPanoramaAvatar />);
    const campi = screen.getByRole('button', { name: 'Saludar a Campi' });
    act(() => vi.advanceTimersByTime(1600));
    fireEvent.click(campi);
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'approve');
    act(() => vi.advanceTimersByTime(1300));
    fireEvent.click(campi);
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'consider');
  });
  it('does not repeat the entrance for the same user during the browser session', () => {
    const view = render(<CampiPanoramaAvatar greetingKey="user-a" />);
    expect(screen.getByTestId('campi-pose')).toHaveTextContent('welcome');
    view.unmount();
    render(<CampiPanoramaAvatar greetingKey="user-a" />);
    expect(screen.getByTestId('campi-pose')).toHaveTextContent('idle');
  });
});

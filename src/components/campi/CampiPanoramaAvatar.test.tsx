import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampiPanoramaAvatar } from './CampiPanoramaAvatar';

vi.mock('./CampiSprite', () => ({
  CampiSprite: ({ state, action, active }: { state: string; action: string; active: boolean }) => <span data-testid="campi-pose" data-action={action} data-active={active}>{state}</span>,
}));
vi.mock('./CampiThreeCanvas', () => ({
  CampiThreeCanvas: ({ mood, reaction, paused, reduced, onReady }: {
    mood: string; reaction: { id: string } | null; paused: boolean; reduced: boolean; onReady: () => void;
  }) => <span data-testid="campi-3d" data-mood={mood} data-recipe={reaction?.id ?? ''}
    data-paused={paused} data-reduced={reduced} onClick={event => { event.stopPropagation(); onReady(); }} />,
}));

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Campi in Panorama', () => {
  it('shows the 3D model when ready, pauses the sprite backup, and sends a contextual gesture', async () => {
    render(<CampiPanoramaAvatar mood="atento" />);
    await act(async () => {});
    const model = screen.getByTestId('campi-3d');
    expect(model).toHaveAttribute('data-mood', 'atento');
    fireEvent.click(model);
    expect(screen.getByRole('button', { name: 'Saludar a Campi' })).toHaveAttribute('data-three-ready', 'true');
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-active', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Saludar a Campi' }));
    expect(model).toHaveAttribute('data-recipe', 'atento-01');
  });
  it('pauses face and action playback in a detail and consumes intervening cues', () => {
    const view = render(<CampiPanoramaAvatar />);
    view.rerender(<CampiPanoramaAvatar quiet reaction={{ kind: 'select', token: 1 }} />);
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'neutral');
    act(() => vi.advanceTimersByTime(20000));
    view.rerender(<CampiPanoramaAvatar reaction={{ kind: 'select', token: 1 }} />);
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'neutral');
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-active', 'true');
  });
  it('does not start mood gestures while reading a detail', () => {
    render(<CampiPanoramaAvatar quiet mood="contento" />);
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'neutral');
  });
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
  it('does not replay a mood gesture on returning from a quiet detail', () => {
    const view = render(<CampiPanoramaAvatar mood="contento" />);
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'approve');
    view.rerender(<CampiPanoramaAvatar mood="contento" quiet />);
    view.rerender(<CampiPanoramaAvatar mood="contento" />);
    expect(screen.getByTestId('campi-pose')).toHaveAttribute('data-action', 'neutral');
  });
  it('does not repeat the entrance for the same user during the browser session', () => {
    const view = render(<CampiPanoramaAvatar greetingKey="user-a" />);
    expect(screen.getByTestId('campi-pose')).toHaveTextContent('welcome');
    view.unmount();
    render(<CampiPanoramaAvatar greetingKey="user-a" />);
    expect(screen.getByTestId('campi-pose')).toHaveTextContent('idle');
  });
  it('alternates quiet idle postures and pauses them while a detail is read', () => {
    const view = render(<CampiPanoramaAvatar greetingKey="user-a" />);
    const campi = screen.getByRole('button', { name: 'Saludar a Campi' });
    expect(campi).toHaveAttribute('data-posture', 'center');
    act(() => vi.advanceTimersByTime(9000));
    expect(campi).toHaveAttribute('data-posture', 'tilt');
    view.rerender(<CampiPanoramaAvatar greetingKey="user-a" quiet />);
    act(() => vi.advanceTimersByTime(30000));
    expect(campi).toHaveAttribute('data-posture', 'tilt');
    view.rerender(<CampiPanoramaAvatar greetingKey="user-a" />);
    act(() => vi.advanceTimersByTime(12000));
    expect(campi).toHaveAttribute('data-posture', 'center');
  });
});

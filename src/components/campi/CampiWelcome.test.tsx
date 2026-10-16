import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampiWelcome } from './CampiWelcome';
import { campiStorageKey, OPEN_CAMPI_EVENT, transitionCampi } from './campiState';
let desktop = true;
let reduced = false;
beforeEach(() => {
  localStorage.clear(); desktop = true; reduced = false;
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('reduced') ? reduced : desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Campi introduction', () => {
  it('introduces the future help without asking for a scripted response', () => {
    render(<CampiWelcome userId="a" />);
    expect(screen.getByText('¡Hola! Soy Campi.')).toBeInTheDocument();
    expect(screen.getByText(/detectar cambios que merecen atención y abrir el detalle/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '¡Hola, Campi!' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hasta pronto' })).not.toBeInTheDocument();
    expect(localStorage.getItem(campiStorageKey('a'))).toBe('seen');
  });
  it('closes with Escape and can reopen from the edge', () => {
    render(<><button aria-label="Abrir menú de cuenta">Cuenta</button><CampiWelcome userId="a" /></>);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cerrar bienvenida de Campi' }), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Abrir menú de cuenta' })).toHaveFocus();
    act(() => vi.advanceTimersByTime(720));
    expect(screen.queryByText('¡Hola! Soy Campi.')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(90000));
    const trigger = screen.getByRole('button', { name: 'Abrir bienvenida de Campi' });
    expect(document.querySelectorAll('.campi-peek img')).toHaveLength(2);
    expect([...document.querySelectorAll<HTMLImageElement>('.campi-peek img')].map(image => image.src)).toEqual(expect.arrayContaining([expect.stringContaining('campi-curious.webp'), expect.stringContaining('campi-run.webp')]));
    fireEvent.click(trigger);
    expect(screen.getByText('¡Hola! Soy Campi.')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cerrar bienvenida de Campi' }), { key: 'Escape' });
    act(() => vi.advanceTimersByTime(720));
    expect(screen.queryByText('¡Hola! Soy Campi.')).not.toBeInTheDocument();
  });
  it('hides persistently for that user and is recoverable from the account menu event', () => {
    const view = render(<CampiWelcome userId="a" />);
    fireEvent.click(screen.getByText('Ocultar a Campi'));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-state', 'hiding');
    expect(document.querySelector('.campi-sprite')).toHaveAttribute('data-action', 'run');
    expect(localStorage.getItem(campiStorageKey('a'))).toBe('hidden');
    act(() => vi.advanceTimersByTime(720));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(180000));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    view.unmount();
    render(<CampiWelcome userId="a" />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    act(() => window.dispatchEvent(new Event(OPEN_CAMPI_EVENT)));
    expect(screen.getByText('¡Hola! Soy Campi.')).toBeInTheDocument();
    expect(localStorage.getItem(campiStorageKey('b'))).toBeNull();
  });
  it('returns focus to the account control when hidden', () => {
    render(<><button aria-label="Abrir menú de cuenta">Cuenta</button><CampiWelcome userId="a" /></>);
    fireEvent.click(screen.getByText('Ocultar a Campi'));
    expect(screen.getByRole('button', { name: 'Abrir menú de cuenta' })).toHaveFocus();
  });
  it('shows a curious face on pointer hover and restores it on leave', () => {
    render(<CampiWelcome userId="a" />);
    act(() => vi.advanceTimersByTime(1600));
    const character = document.querySelector('.campi-character')!;
    fireEvent.pointerEnter(character);
    expect(document.querySelector('.campi-sprite')).toHaveAttribute('data-face', 'curious');
    fireEvent.pointerLeave(character);
    expect(document.querySelector('.campi-sprite')).toHaveAttribute('data-face', 'rest');
  });
  it('does not render or mark seen on mobile', () => {
    desktop = false;
    render(<CampiWelcome userId="a" />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(localStorage.getItem(campiStorageKey('a'))).toBeNull();
  });
  it('does not peek when reduced motion is requested', () => {
    reduced = true; localStorage.setItem(campiStorageKey('a'), 'seen');
    render(<CampiWelcome userId="a" />);
    act(() => vi.advanceTimersByTime(180000));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-state', 'tucked');
  });
  it('peeks with only a head and one hand, once per visit', () => {
    localStorage.setItem(campiStorageKey('a'), 'seen');
    render(<CampiWelcome userId="a" />);
    act(() => vi.advanceTimersByTime(90000));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-state', 'peeking');
    expect(document.querySelectorAll('.campi-peek img')).toHaveLength(2);
    act(() => vi.advanceTimersByTime(2800));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-state', 'tucked');
    act(() => vi.advanceTimersByTime(180000));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-state', 'tucked');
  });
  it('yields visibility and timers while a dialog is present', async () => {
    render(<CampiWelcome userId="a" />);
    const modal = document.createElement('div'); modal.setAttribute('aria-modal', 'true');
    await act(async () => document.body.appendChild(modal));
    expect(screen.getByRole('complementary', { hidden: true })).toHaveStyle({ visibility: 'hidden' });
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('complementary', { hidden: true })).toHaveAttribute('data-state', 'welcome');
    await act(async () => modal.remove());
    expect(screen.getByRole('complementary')).toHaveStyle({ visibility: 'visible' });
  });
  it('has predictable finite transitions and never revives hidden on a timer', () => {
    expect(transitionCampi('farewell', 'settled')).toBe('tucked');
    expect(transitionCampi('tucked', 'peek')).toBe('peeking');
    expect(transitionCampi('peeking', 'rest')).toBe('tucked');
    expect(transitionCampi('hidden', 'peek')).toBe('hidden');
    expect(transitionCampi('hiding', 'settled')).toBe('hidden');
    expect(transitionCampi('hidden', 'hide')).toBe('hidden');
  });
});

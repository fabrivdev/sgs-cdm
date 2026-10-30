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
    expect(screen.queryByRole('button', { name: 'Ocultar a Campi' })).not.toBeInTheDocument();
    expect(localStorage.getItem(campiStorageKey('a'))).toBe('seen');
  });
  it('closes with Escape, stays gone, and reopens only from the account menu', () => {
    render(<><button aria-label="Abrir menú de cuenta">Cuenta</button><CampiWelcome userId="a" /></>);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cerrar bienvenida de Campi' }), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Abrir menú de cuenta' })).toHaveFocus();
    act(() => vi.advanceTimersByTime(720));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(180000));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    act(() => window.dispatchEvent(new Event(OPEN_CAMPI_EVENT)));
    expect(screen.getByText('¡Hola! Soy Campi.')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cerrar bienvenida de Campi' }), { key: 'Escape' });
    act(() => vi.advanceTimersByTime(720));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
  it('keeps the closed welcome dismissed after reload and recovers from the account menu', () => {
    const view = render(<CampiWelcome userId="a" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar bienvenida de Campi' }));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-state', 'farewell');
    expect(document.querySelector('.campi-sprite')).toHaveAttribute('data-action', 'run');
    expect(localStorage.getItem(campiStorageKey('a'))).toBe('seen');
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
  it('returns focus to the account control when closed', () => {
    render(<><button aria-label="Abrir menú de cuenta">Cuenta</button><CampiWelcome userId="a" /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar bienvenida de Campi' }));
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
  it('keeps the presentation lively after its initial entrance', () => {
    render(<CampiWelcome userId="a" />);
    expect(document.querySelector('.campi-sprite')).toHaveAttribute('data-action', 'intro');
    act(() => vi.advanceTimersByTime(1600));
    expect(document.querySelector('.campi-sprite')).toHaveAttribute('data-pose', 'rest');
    act(() => vi.advanceTimersByTime(2600));
    expect(document.querySelector('.campi-sprite')).toHaveAttribute('data-action', 'approve');
    act(() => vi.advanceTimersByTime(1200));
    expect(document.querySelector('.campi-sprite')).toHaveAttribute('data-pose', 'rest');
  });
  it('responds to clicking Campi with friendly gestures', () => {
    render(<CampiWelcome userId="a" />);
    act(() => vi.advanceTimersByTime(1600));
    fireEvent.click(screen.getByRole('button', { name: 'Saludar a Campi' }));
    expect(document.querySelector('.campi-sprite')).toHaveAttribute('data-action', 'approve');
    act(() => vi.advanceTimersByTime(1200));
    fireEvent.click(screen.getByRole('button', { name: 'Saludar a Campi' }));
    expect(document.querySelector('.campi-sprite')).toHaveAttribute('data-action', 'step');
  });
  it('does not render or mark seen on mobile', () => {
    desktop = false;
    render(<CampiWelcome userId="a" />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(localStorage.getItem(campiStorageKey('a'))).toBeNull();
  });
  it('respects reduced motion and finishes closing without a peek', () => {
    reduced = true;
    render(<CampiWelcome userId="a" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar bienvenida de Campi' }));
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(180000));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
  it('shows the automatic welcome only once per user and browser', () => {
    localStorage.setItem(campiStorageKey('a'), 'seen');
    render(<CampiWelcome userId="a" />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    localStorage.setItem(campiStorageKey('old'), 'hidden');
    render(<CampiWelcome userId="old" />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    render(<CampiWelcome userId="b" />);
    expect(screen.getByText('¡Hola! Soy Campi.')).toBeInTheDocument();
    expect(localStorage.getItem(campiStorageKey('b'))).toBe('seen');
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
  it('does not count a welcome hidden behind an existing dialog as seen', async () => {
    const modal = document.createElement('div'); modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    render(<CampiWelcome userId="a" />);
    expect(localStorage.getItem(campiStorageKey('a'))).toBeNull();
    await act(async () => modal.remove());
    expect(localStorage.getItem(campiStorageKey('a'))).toBe('seen');
  });
  it('has predictable finite transitions and never revives hidden on a timer', () => {
    expect(transitionCampi('farewell', 'settled')).toBe('hidden');
    expect(transitionCampi('hidden', 'close')).toBe('hidden');
  });
});

it('previsualiza la bienvenida ya vista sin marcar ni sobrescribir memoria',()=>{
 localStorage.setItem(campiStorageKey('a'),'hidden');
 render(<CampiWelcome userId="a" preview/>);
 expect(screen.getByText('¡Hola! Soy Campi.')).toBeInTheDocument();
 act(()=>vi.advanceTimersByTime(2000));
 fireEvent.click(screen.getByRole('button',{name:'Cerrar bienvenida de Campi'}));
 expect(localStorage.getItem(campiStorageKey('a'))).toBe('hidden');
});

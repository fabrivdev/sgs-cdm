import { useEffect, useReducer, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CampiMotionAssets, OPEN_CAMPI_EVENT, readCampiState, saveCampiState, transitionCampi } from './campiState';
import './campi.css';
import { CampiSprite } from './CampiSprite';
import { CampiPeek } from './CampiPeek';

const DESKTOP = '(min-width: 1024px) and (pointer: fine)';
const REDUCED = '(prefers-reduced-motion: reduce)';

/** Phase one: a scripted introduction. No analytics, prompts, or AI requests. */
export function CampiWelcome({ userId, assets = {} }: { userId: string; assets?: CampiMotionAssets }) {
  const [state, dispatch] = useReducer(transitionCampi, userId, readCampiState);
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP).matches);
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED).matches);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [blocked, setBlocked] = useState(false);
  const [curious, setCurious] = useState(false);
  const blockedRef = useRef(false);
  const character = useRef<HTMLButtonElement>(null);
  const peeked = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const active = desktop && visible && !blocked;
  const expanded = ['welcome', 'idle', 'greeting'].includes(state);
  const asset = assets[state];

  useEffect(() => {
    const media = window.matchMedia(DESKTOP);
    const motion = window.matchMedia(REDUCED);
    const resize = () => setDesktop(media.matches);
    const preference = () => setReduced(motion.matches);
    const visibility = () => setVisible(!document.hidden);
    const open = () => { saveCampiState(userId); dispatch('open'); };
    media.addEventListener('change', resize);
    motion.addEventListener('change', preference);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener(OPEN_CAMPI_EVENT, open);
    // Dialogs, drawers and menus own interaction while open. Never compete for focus.
    const inspect = () => {
      const next = Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"], [aria-modal="true"], [role="menu"][data-state="open"]'));
      if (next !== blockedRef.current) { blockedRef.current = next; setBlocked(next); }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'aria-modal', 'role'] });
    inspect();
    return () => {
      media.removeEventListener('change', resize);
      motion.removeEventListener('change', preference);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener(OPEN_CAMPI_EVENT, open);
      observer.disconnect();
    };
  }, [userId]);

  useEffect(() => {
    if (!active || state === 'hidden') return;
    if (state === 'welcome') saveCampiState(userId);
    const delays = { welcome: 1600, greeting: 1400, farewell: reduced ? 0 : 720, tucked: 90000, peeking: 2800 };
    if (state === 'idle' || (state === 'tucked' && (reduced || peeked.current))) return;
    const event = state === 'tucked' ? 'peek' : state === 'peeking' ? 'rest' : 'settled';
    const timer = window.setTimeout(() => { if (event === 'peek') peeked.current = true; dispatch(event); }, delays[state]);
    return () => window.clearTimeout(timer);
  }, [state, active, reduced, userId]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!active || reduced) element.pause();
    else void element.play().catch(() => { /* The poster remains visible if playback is restricted. */ });
  }, [active, reduced, asset]);

  if (!desktop || state === 'hidden') return null;
  const close = () => { dispatch('close'); document.querySelector<HTMLButtonElement>('[aria-label="Abrir menú de cuenta"]')?.focus(); };
  const atEdge = state === 'tucked' || state === 'peeking';
  return (
    <aside className="campi-layer" data-state={state} data-paused={!active || reduced} style={{ visibility: active ? 'visible' : 'hidden' }} aria-label="Campi, compañero de SIG CDM" onKeyDown={event => { if (expanded && event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      {expanded && <section className="campi-message" aria-labelledby="campi-heading">
        <button className="campi-close" type="button" aria-label="Cerrar bienvenida de Campi" onClick={close}><X size={16} /></button>
        <span className="campi-eyebrow">Muy pronto</span>
        <h2 id="campi-heading">¡Hola! Soy Campi.</h2>
        <p className="campi-reaction" aria-live="polite">{state === 'greeting' ? '¡Un gusto conocerte!' : 'Pronto voy a acompañarte en SIG CDM.'}</p>
        <div className="campi-actions">
          <Button size="sm" onClick={() => dispatch('greet')}>¡Hola, Campi!</Button>
          <Button size="sm" variant="ghost" onClick={close}>Hasta pronto</Button>
        </div>
        <button type="button" className="campi-hide" onClick={() => { saveCampiState(userId, true); dispatch('hide'); document.querySelector<HTMLButtonElement>('[aria-label="Abrir menú de cuenta"]')?.focus(); }}>Ocultar a Campi</button>
      </section>}
      <button ref={character} className="campi-character" tabIndex={state === 'tucked' || state === 'farewell' ? -1 : 0} onPointerEnter={() => setCurious(true)} onPointerLeave={() => setCurious(false)} onFocus={() => setCurious(true)} onBlur={() => setCurious(false)} type="button" aria-label={expanded ? 'Saludar a Campi' : 'Abrir bienvenida de Campi'} aria-expanded={expanded} aria-hidden={state === 'tucked' || state === 'farewell'} onClick={() => dispatch(expanded ? 'greet' : 'open')}>
        {atEdge ? <CampiPeek /> : asset && !reduced ? <video ref={video} key={asset.src} src={asset.src} poster={asset.poster} muted playsInline loop={state === 'idle'} aria-hidden="true" /> : <>{asset ? <img src={asset.poster} alt="" draggable={false} /> : <CampiSprite state={state} active={active} reduced={reduced} curious={curious} action={state === 'welcome' ? 'intro' : state === 'farewell' ? 'run' : 'neutral'} />}</>}
      </button>
    </aside>
  );
}

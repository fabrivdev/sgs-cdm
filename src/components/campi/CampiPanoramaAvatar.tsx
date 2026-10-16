import { useCallback, useEffect, useRef, useState } from 'react';
import { CampiSprite } from './CampiSprite';
import type { CampiAction } from './campiActions';
import './campi.css';
import './campi-panorama.css';

const REDUCED = '(prefers-reduced-motion: reduce)';
export type CampiPanoramaReaction = { kind: 'select' | 'reorder' | 'remove' | 'save'; token: number };
const REACTION_ACTION: Record<CampiPanoramaReaction['kind'], CampiAction> = {
  select: 'celebrate',
  reorder: 'step',
  remove: 'consider',
  save: 'approve',
};

export function CampiPanoramaAvatar({ reaction, attention = false }: { reaction?: CampiPanoramaReaction | null; attention?: boolean }) {
  const [state, setState] = useState<'welcome' | 'idle'>('welcome');
  const [visible, setVisible] = useState(() => !document.hidden);
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED).matches);
  const [curious, setCurious] = useState(false);
  const [action, setAction] = useState<CampiAction>('neutral');
  const actionTimeout = useRef<number | undefined>(undefined);
  const interactionIndex = useRef(0);

  const play = useCallback((next: CampiAction) => {
    window.clearTimeout(actionTimeout.current);
    setAction(next);
    actionTimeout.current = window.setTimeout(() => setAction('neutral'), 1300);
  }, []);

  useEffect(() => {
    let settle = window.setTimeout(() => setState('idle'), 1600);
    const gesture = window.setInterval(() => {
      if (document.hidden || window.matchMedia(REDUCED).matches) return;
      if (attention) play('consider');
      else setState('welcome');
      settle = window.setTimeout(() => setState('idle'), 1600);
    }, 14000);
    const media = window.matchMedia(REDUCED);
    const onVisibility = () => setVisible(!document.hidden);
    const onMotion = () => setReduced(media.matches);
    document.addEventListener('visibilitychange', onVisibility);
    media.addEventListener('change', onMotion);
    return () => {
      window.clearTimeout(settle);
      window.clearInterval(gesture);
      document.removeEventListener('visibilitychange', onVisibility);
      media.removeEventListener('change', onMotion);
      window.clearTimeout(actionTimeout.current);
    };
  }, [attention, play]);

  useEffect(() => {
    if (reduced) { window.clearTimeout(actionTimeout.current); setAction('neutral'); return; }
    if (reaction) play(REACTION_ACTION[reaction.kind]);
  }, [reaction, reduced, play]);

  useEffect(() => {
    if (attention && visible && !reduced) play('consider');
  }, [attention, visible, reduced, play]);

  const interact = () => {
    if (!visible || reduced) return;
    const gestures: CampiAction[] = attention ? ['consider', 'step', 'approve'] : ['approve', 'step', 'celebrate'];
    play(gestures[interactionIndex.current++ % gestures.length]);
  };

  return <button type="button" className="campi-panorama-avatar" data-paused={!visible || reduced}
    onPointerEnter={() => setCurious(true)} onPointerLeave={() => setCurious(false)}
    onClick={interact} aria-label="Saludar a Campi">
    <CampiSprite state={state} active={visible} reduced={reduced} curious={curious || attention} action={action} />
  </button>;
}

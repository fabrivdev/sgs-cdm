import { useCallback, useEffect, useRef, useState } from 'react';
import { CampiSprite } from './CampiSprite';
import type { CampiMood } from './CampiSprite';
import type { CampiAction } from './campiActions';
import { CAMPI_ACTIONS } from './campiActions';
import './campi.css';
import './campi-panorama.css';

const REDUCED = '(prefers-reduced-motion: reduce)';
export type CampiPanoramaReaction = { kind: 'select' | 'reorder' | 'remove' | 'save' | 'ask' | 'comment'; token: number };
const REACTION_ACTION: Record<CampiPanoramaReaction['kind'], CampiAction> = {
  select: 'celebrate',
  reorder: 'step',
  remove: 'consider',
  save: 'approve',
  ask: 'consider',
  comment: 'consider',
};

export function CampiPanoramaAvatar({ reaction, attention = false, change = false, mood, quiet = false, greetingKey }: { reaction?: CampiPanoramaReaction | null; attention?: boolean; change?: boolean; mood?: CampiMood; quiet?: boolean; greetingKey?: string }) {
  const currentMood: CampiMood = mood ?? (attention ? 'atento' : change ? 'contento' : 'sereno');
  const [state, setState] = useState<'welcome' | 'idle'>(() => {
    try { return greetingKey && sessionStorage.getItem(`sig-cdm:campi:panorama-saludo:${greetingKey}`) ? 'idle' : 'welcome'; }
    catch { return 'welcome'; }
  });
  const [visible, setVisible] = useState(() => !document.hidden);
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED).matches);
  const [curious, setCurious] = useState(false);
  const [action, setAction] = useState<CampiAction>('neutral');
  const [posture, setPosture] = useState<'center' | 'tilt' | 'hand' | 'look'>('center');
  const actionTimeout = useRef<number | undefined>(undefined);
  const interactionIndex = useRef(0);
  const postureIndex = useRef(0);
  const lastReaction = useRef('');

  const play = useCallback((next: CampiAction) => {
    window.clearTimeout(actionTimeout.current);
    setAction(next);
    actionTimeout.current = window.setTimeout(() => setAction('neutral'), CAMPI_ACTIONS[next][CAMPI_ACTIONS[next].length - 1].at + 140);
  }, []);

  useEffect(() => {
    if (greetingKey) { try { sessionStorage.setItem(`sig-cdm:campi:panorama-saludo:${greetingKey}`, '1'); } catch { /* Session storage is optional. */ } }
    const settle = window.setTimeout(() => setState('idle'), 1600);
    const media = window.matchMedia(REDUCED);
    const onVisibility = () => setVisible(!document.hidden);
    const onMotion = () => setReduced(media.matches);
    document.addEventListener('visibilitychange', onVisibility);
    media.addEventListener('change', onMotion);
    return () => {
      window.clearTimeout(settle);
      document.removeEventListener('visibilitychange', onVisibility);
      media.removeEventListener('change', onMotion);
      window.clearTimeout(actionTimeout.current);
    };
  }, [greetingKey]);

  useEffect(() => { if (quiet) { window.clearTimeout(actionTimeout.current); setAction('neutral'); } }, [quiet]);

  useEffect(() => {
    if (!visible || reduced || quiet || action !== 'neutral') return;
    const sequence = ['tilt', 'center', 'hand', 'center', 'look', 'center'] as const;
    const intervals = [9000, 12000, 11000, 14000, 10000, 13000];
    const position = postureIndex.current % sequence.length;
    const timer = window.setTimeout(() => { setPosture(sequence[position]); postureIndex.current++; }, intervals[position]);
    return () => window.clearTimeout(timer);
  }, [visible, reduced, quiet, action, posture]);

  useEffect(() => {
    if (!greetingKey || reduced) return;
    const key = `sig-cdm:campi:panorama-enter:${greetingKey}`;
    try {
      if (sessionStorage.getItem(key) === '1') { sessionStorage.removeItem(key); play('approve'); }
    } catch { /* Optional session cue. */ }
  }, [greetingKey, reduced, play]);

  useEffect(() => {
    if (reduced) { window.clearTimeout(actionTimeout.current); setAction('neutral'); return; }
    if (reaction && lastReaction.current !== `${reaction.kind}:${reaction.token}`) {
      lastReaction.current = `${reaction.kind}:${reaction.token}`;
      play(reaction.kind === 'comment' && currentMood === 'contento' ? 'approve' : REACTION_ACTION[reaction.kind]);
    }
  }, [reaction, reduced, play, currentMood]);

  useEffect(() => {
    if (currentMood === 'atento' && visible && !reduced) play('consider');
    else if (currentMood === 'contento' && visible && !reduced) play('approve');
    else if (currentMood === 'preocupado' && visible && !reduced) play('consider');
  }, [currentMood, visible, reduced, play]);

  const interact = () => {
    if (!visible || reduced || quiet) return;
    const gestures: CampiAction[] = currentMood === 'preocupado' || currentMood === 'atento' ? ['consider', 'step', 'approve'] : currentMood === 'contento' ? ['approve', 'step', 'celebrate'] : ['approve', 'consider', 'step'];
    play(gestures[interactionIndex.current++ % gestures.length]);
  };

  return <button type="button" className="campi-panorama-avatar" data-paused={!visible || reduced || quiet} data-posture={posture}
    onPointerEnter={() => setCurious(true)} onPointerLeave={() => setCurious(false)}
    onClick={interact} aria-label="Saludar a Campi">
    <CampiSprite state={state} active={visible} reduced={reduced} curious={curious} action={action} mood={currentMood} posture={posture} />
  </button>;
}

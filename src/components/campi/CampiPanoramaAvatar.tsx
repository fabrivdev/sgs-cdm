import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { CampiSprite } from './CampiSprite';
import type { CampiMood } from './CampiSprite';
import type { CampiAction } from './campiActions';
import { CAMPI_ACTIONS } from './campiActions';
import type { CampiEmotion, CampiReaction } from '../campi3d/types';
import './campi.css';
import './campi-panorama.css';

const REDUCED = '(prefers-reduced-motion: reduce)';
const CampiThreeCanvas = lazy(() => import('./CampiThreeCanvas').then(module => ({ default: module.CampiThreeCanvas })));
const THREE_MOOD: Record<CampiMood, CampiEmotion> = {
  sereno: 'sereno', contento: 'contento', atento: 'atento', preocupado: 'preocupado',
  pensativo: 'pensativo', triste: 'preocupado',
};
// Keep gestures compatible with the meaning of the currently presented message.
const THREE_GESTURES: Record<CampiMood, readonly string[]> = {
  sereno: ['personalidad-02', 'personalidad-01', 'sereno-07', 'personalidad-13'],
  contento: ['contento-01', 'contento-05', 'contento-10', 'contento-14'],
  atento: ['atento-01', 'atento-04', 'atento-08', 'atento-11'],
  preocupado: ['preocupado-03', 'preocupado-05', 'preocupado-10'],
  pensativo: ['pensativo-01', 'pensativo-05', 'pensativo-10'],
  triste: ['preocupado-04', 'preocupado-07', 'preocupado-14'],
};
export type CampiPanoramaReaction = { kind: 'select' | 'reorder' | 'remove' | 'save' | 'comment'; token: number };
const REACTION_ACTION: Record<CampiPanoramaReaction['kind'], CampiAction> = {
  select: 'celebrate',
  reorder: 'step',
  remove: 'consider',
  save: 'approve',
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
  const [threeReady, setThreeReady] = useState(false);
  const [threeFailed, setThreeFailed] = useState(false);
  const [threeReaction, setThreeReaction] = useState<CampiReaction | null>(null);
  const [posture, setPosture] = useState<'center' | 'tilt' | 'hand' | 'look'>('center');
  const actionTimeout = useRef<number | undefined>(undefined);
  const interactionIndex = useRef(0);
  const threeIndex = useRef(0);
  const postureIndex = useRef(0);
  const lastReaction = useRef('');
  const lastMood = useRef<CampiMood | null>(null);

  const play = useCallback((next: CampiAction) => {
    window.clearTimeout(actionTimeout.current);
    setAction(next);
    actionTimeout.current = window.setTimeout(() => setAction('neutral'), CAMPI_ACTIONS[next][CAMPI_ACTIONS[next].length - 1].at + 140);
  }, []);

  const reactThree = useCallback(() => {
    if (!threeReady || threeFailed || quiet || !visible || reduced) return;
    const options = THREE_GESTURES[currentMood];
    const index = threeIndex.current++;
    setThreeReaction({ id: options[index % options.length], token: index + 1 });
  }, [threeReady, threeFailed, quiet, visible, reduced, currentMood]);

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

  useEffect(() => {
    if (quiet || !visible || reduced) {
      window.clearTimeout(actionTimeout.current);
      setAction('neutral');
    }
  }, [quiet, visible, reduced]);

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
    if (reduced || quiet || !visible) {
      // Consume cues while paused; returning to the page must not replay a backlog.
      if (reaction) lastReaction.current = `${reaction.kind}:${reaction.token}`;
      return;
    }
    if (reaction && lastReaction.current !== `${reaction.kind}:${reaction.token}`) {
      lastReaction.current = `${reaction.kind}:${reaction.token}`;
      play(reaction.kind === 'comment' && currentMood === 'contento' ? 'approve' : REACTION_ACTION[reaction.kind]);
      reactThree();
    }
  }, [reaction, reduced, quiet, visible, play, currentMood, reactThree]);

  useEffect(() => {
    if (lastMood.current === currentMood) return;
    lastMood.current = currentMood;
    if (quiet || !visible || reduced) return;
    if (currentMood === 'atento') play('consider');
    else if (currentMood === 'contento') play('approve');
    else if (currentMood === 'preocupado') play('consider');
    reactThree();
  }, [currentMood, visible, reduced, quiet, play, reactThree]);

  const interact = () => {
    if (!visible || reduced || quiet) return;
    const gestures: CampiAction[] = currentMood === 'preocupado' || currentMood === 'atento' ? ['consider', 'step', 'approve'] : currentMood === 'contento' ? ['approve', 'step', 'celebrate'] : ['approve', 'consider', 'step'];
    play(gestures[interactionIndex.current++ % gestures.length]);
    reactThree();
  };

  return <button type="button" className="campi-panorama-avatar" data-paused={!visible || reduced || quiet} data-posture={posture} data-three-ready={threeReady && !threeFailed}
    onPointerEnter={() => setCurious(true)} onPointerLeave={() => setCurious(false)}
    onClick={interact} aria-label="Saludar a Campi">
    <span className="campi-panorama-fit">
      <span className="campi-panorama-fallback"><CampiSprite state={state} active={visible && !quiet && !threeReady} reduced={reduced} curious={curious} action={action} mood={currentMood} posture={posture} /></span>
      {!threeFailed && <Suspense fallback={null}><CampiThreeCanvas mood={THREE_MOOD[currentMood]} reaction={threeReaction}
        paused={quiet || !visible} reduced={reduced}
        onReady={() => { setThreeReady(true); }}
        onError={error => { if (error.name !== 'CampiRecipeBlockedError') { setThreeReady(false); setThreeFailed(true); } }} /></Suspense>}
    </span>
  </button>;
}

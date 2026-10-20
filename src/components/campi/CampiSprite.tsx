import { useEffect, useState } from 'react';
import { CampiActionSprite } from './CampiActionSprite';
import type { CampiAction } from './campiActions';
import type { CampiState } from './campiState';

type BodyPose = 'rest' | 'wave' | 'wave2';
type FacePose = 'rest' | 'blink' | 'smile' | 'curious' | 'surprised' | 'wink' | 'sad';
const ASSETS = { rest: '/campi/campi-rest.webp', wave: '/campi/campi-wave.webp', wave2: '/campi/campi-wave2.webp', blink: '/campi/campi-blink.webp', smile: '/campi/campi-smile.webp', curious: '/campi/campi-curious.webp', surprised: '/campi/campi-surprised.webp', wink: '/campi/campi-wink.webp', sad: '/campi/campi-sad.webp' };
export type CampiMood = 'sereno' | 'contento' | 'atento' | 'preocupado' | 'pensativo' | 'triste';
const moodFace: Record<CampiMood, FacePose> = { sereno: 'rest', contento: 'smile', atento: 'curious', preocupado: 'surprised', pensativo: 'curious', triste: 'sad' };

/** Authored gestures and faces; no business data drives them. */
export function CampiSprite({ state, active, reduced, curious = false, action = 'neutral', mood = 'sereno', posture = 'center' }: { state: CampiState; active: boolean; reduced: boolean; curious?: boolean; action?: CampiAction; mood?: CampiMood; posture?: 'center' | 'tilt' | 'hand' | 'look' }) {
  const [pose, setPose] = useState<BodyPose>('rest');
  const [face, setFace] = useState<FacePose>('rest');
  useEffect(() => {
    setPose(state === 'idle' && posture === 'hand' ? 'wave' : state === 'idle' && posture === 'look' ? 'wave2' : 'rest'); setFace(moodFace[mood]);
    if (!active || action !== 'neutral') return;
    if (reduced) return;
    const timers: number[] = [];
    let blinkInterval: number | undefined;
    let blinkEnd: number | undefined;
    const later = (delay: number, next: BodyPose) => timers.push(window.setTimeout(() => setPose(next), delay));
    const expression = (delay: number, next: FacePose) => timers.push(window.setTimeout(() => setFace(next), delay));
    if (state === 'welcome') {
      setFace('smile');
      later(100, 'wave'); later(350, 'wave2'); later(600, 'wave');
      later(850, 'wave2'); later(1100, 'rest'); expression(1300, moodFace[mood]);
    } else if (state === 'farewell') {
      setFace('smile'); later(0, 'wave'); later(220, 'wave2');
    } else if (state === 'idle') {
      const blink = () => {
        setFace('blink');
        blinkEnd = window.setTimeout(() => setFace(moodFace[mood]), 160);
      };
      timers.push(window.setTimeout(() => { blink(); blinkInterval = window.setInterval(blink, 6500); }, 4800));
    }
    return () => { timers.forEach(window.clearTimeout); window.clearInterval(blinkInterval); window.clearTimeout(blinkEnd); };
  }, [state, active, reduced, action, mood, posture]);

  if (action !== 'neutral') return <CampiActionSprite action={action} active={active} reduced={reduced} />;
  const visibleFace = curious && active && state === 'idle' ? 'curious' : face;
  return <span className="campi-sprite" data-pose={pose} data-face={visibleFace} aria-hidden="true">
    <img src={ASSETS[pose]} alt="" draggable={false} data-frame={pose} className="campi-frame is-current" />
    {visibleFace !== 'rest' && <img src={ASSETS[visibleFace]} alt="" draggable={false} data-frame={visibleFace} className="campi-frame campi-face is-current" />}
  </span>;
}

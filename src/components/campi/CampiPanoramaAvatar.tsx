import { useEffect, useState } from 'react';
import { CampiSprite } from './CampiSprite';
import './campi.css';
import './campi-panorama.css';

const REDUCED = '(prefers-reduced-motion: reduce)';

export function CampiPanoramaAvatar() {
  const [state, setState] = useState<'welcome' | 'idle'>('welcome');
  const [visible, setVisible] = useState(() => !document.hidden);
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED).matches);
  const [curious, setCurious] = useState(false);

  useEffect(() => {
    let settle = window.setTimeout(() => setState('idle'), 1600);
    const gesture = window.setInterval(() => {
      if (document.hidden || window.matchMedia(REDUCED).matches) return;
      setState('welcome');
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
    };
  }, []);

  return <div className="campi-panorama-avatar" data-paused={!visible || reduced}
    onPointerEnter={() => setCurious(true)} onPointerLeave={() => setCurious(false)}
    aria-label="Campi" role="img">
    <CampiSprite state={state} active={visible} reduced={reduced} curious={curious} />
  </div>;
}

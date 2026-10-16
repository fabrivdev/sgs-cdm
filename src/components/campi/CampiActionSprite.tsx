import { useEffect, useState } from 'react';
import { CAMPI_ACTIONS, type CampiAction } from './campiActions';

const actionAssets = { rest: '/campi/campi-rest.webp', celebrate: '/campi/campi-celebrate.webp', flight: '/campi/campi-flight.webp', run: '/campi/campi-run.webp', run2: '/campi/campi-run2.webp', wave: '/campi/campi-wave.webp', wave2: '/campi/campi-wave2.webp', angry: '/campi/campi-angry.webp', sad: '/campi/campi-sad.webp', smile: '/campi/campi-smile.webp' };

/** Optional action layer: assets are requested only for the current action. */
export function CampiActionSprite({ action, active, reduced }: { action: CampiAction; active: boolean; reduced: boolean }) {
  const [index, setIndex] = useState(0);
  const frames = CAMPI_ACTIONS[action];
  useEffect(() => {
    if (!active || reduced) return;
    const names = new Set(frames.flatMap(frame => [frame.body, frame.face]));
    names.forEach(name => { const image = new Image(); image.src = actionAssets[name]; });
  }, [frames, active, reduced]);
  useEffect(() => {
    setIndex(0);
    if (!active || reduced) return;
    const timers = frames.slice(1).map((frame, i) => window.setTimeout(() => setIndex(i + 1), frame.at));
    return () => timers.forEach(window.clearTimeout);
  }, [frames, active, reduced]);
  const frame = !active ? CAMPI_ACTIONS.neutral[0] : frames[index] || frames[0];
  return <span className="campi-sprite campi-action" data-action={action} data-motion={reduced ? undefined : frame.motion} aria-hidden="true">
    <img src={actionAssets[frame.body]} className="campi-frame is-current" alt="" draggable={false} />
    {frame.face !== 'rest' && <img src={actionAssets[frame.face]} className="campi-frame campi-face is-current" alt="" draggable={false} />}
  </span>;
}

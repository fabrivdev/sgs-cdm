import { useEffect, useRef, useState } from 'react';
import type { Campi3DProps, CampiOptions, CampiView } from './types';

/** Transparent, independent mount. Does not publish, store data, or wire global app events. */
export function Campi3D({ factory, state = 'sereno', reaction, severity = 'normal', targets, posture, autoPosture = true,
  paused = false, reducedMotion = 'system', onReady, onChange, onError, onRecipeResult,
  className, style, label }: Campi3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<CampiView>();
  const callbacks = useRef({ onReady, onChange, onError, onRecipeResult });
  callbacks.current = { onReady, onChange, onError, onRecipeResult };
  const [systemReduced, setSystemReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const options: CampiOptions = { state, reaction, severity, targets, posture, autoPosture, paused,
    reducedMotion: reducedMotion === 'system' ? systemReduced : reducedMotion };
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemReduced(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    if (!canvas.current || !container.current) return;
    const abort = new AbortController();
    let mounted: CampiView | undefined;
    const report = (error: unknown) => {
      if (!abort.signal.aborted) callbacks.current.onError?.(error instanceof Error ? error : new Error(String(error)));
    };
    void factory({ canvas: canvas.current, container: container.current, signal: abort.signal,
      onChange: snapshot => { if (!abort.signal.aborted) callbacks.current.onChange?.(snapshot); },
      onError: report,
      onRecipeResult: result => { if (!abort.signal.aborted) callbacks.current.onRecipeResult?.(result); },
    }).then(instance => {
      if (abort.signal.aborted) { instance.dispose(); return; }
      mounted = instance;
      view.current = instance;
      instance.update(latest.current);
      callbacks.current.onReady?.(instance.listRecipes?.() ?? []);
    }).catch(error => { mounted?.dispose(); if (view.current === mounted) view.current = undefined; report(error); });
    return () => {
      abort.abort();
      if (view.current === mounted) view.current = undefined;
      mounted?.dispose();
    };
  }, [factory]);

  useEffect(() => {
    try { view.current?.update(latest.current); }
    catch (error) { callbacks.current.onError?.(error instanceof Error ? error : new Error(String(error))); }
  }, [state, reaction, severity, targets, posture, autoPosture, paused, reducedMotion, systemReduced]);

  return <div ref={container} className={className}
    style={{ width: 280, height: 360, ...style, background: 'transparent' }}>
    <canvas ref={canvas} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined}
      aria-label={label} style={{ display: 'block', width: '100%', height: '100%', background: 'transparent' }} />
  </div>;
}

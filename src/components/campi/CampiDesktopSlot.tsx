import { lazy, Suspense, useEffect, useState } from 'react';

const DESKTOP = '(min-width: 1024px) and (pointer: fine)';
const CampiWelcome = lazy(() => import('./CampiWelcome').then(module => ({ default: module.CampiWelcome })));

export function CampiDesktopSlot({ userId }: { userId: string }) {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP).matches);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP);
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  if (!desktop) return null;
  return <Suspense fallback={null}><CampiWelcome key={userId} userId={userId} /></Suspense>;
}

export type CampiState = 'welcome' | 'idle' | 'farewell' | 'hiding' | 'tucked' | 'peeking' | 'hidden';
export const OPEN_CAMPI_EVENT = 'sig-cdm:open-campi';
export type CampiEvent = 'settled' | 'close' | 'hide' | 'open' | 'peek' | 'rest';
export function transitionCampi(state: CampiState, event: CampiEvent): CampiState {
  if (event === 'open') return 'welcome';
  if (state === 'hidden') return state;
  if (event === 'hide') return 'hiding';
  if (event === 'close') return 'farewell';
  if (event === 'settled') return state === 'hiding' ? 'hidden' : state === 'farewell' ? 'tucked' : state === 'welcome' ? 'idle' : state;
  if (event === 'peek' && state === 'tucked') return 'peeking';
  if (event === 'rest' && state === 'peeking') return 'tucked';
  return state;
}
export const campiStorageKey = (userId: string) => `sig-cdm:campi:v1:${userId}`;
export function readCampiState(userId: string): CampiState {
  try {
    const saved = localStorage.getItem(campiStorageKey(userId));
    return saved === 'hidden' ? 'hidden' : saved === 'seen' ? 'tucked' : 'welcome';
  } catch { return 'welcome'; }
}
export function saveCampiState(userId: string, hidden = false) {
  try { localStorage.setItem(campiStorageKey(userId), hidden ? 'hidden' : 'seen'); } catch { /* Restricted storage must never block the app. */ }
}
// Optional transparent, pre-rendered animations. No backend or AI connection.
export type CampiMotionAssets = Partial<Record<CampiState, { src: string; poster: string }>>;

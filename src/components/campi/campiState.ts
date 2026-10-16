export type CampiState = 'welcome' | 'idle' | 'farewell' | 'hidden';
export const OPEN_CAMPI_EVENT = 'sig-cdm:open-campi';
export type CampiEvent = 'settled' | 'close' | 'open';
export function transitionCampi(state: CampiState, event: CampiEvent): CampiState {
  if (event === 'open') return 'welcome';
  if (state === 'hidden') return state;
  if (event === 'close') return 'farewell';
  if (event === 'settled') return state === 'farewell' ? 'hidden' : state === 'welcome' ? 'idle' : state;
  return state;
}
export const campiStorageKey = (userId: string) => `sig-cdm:campi:v1:${userId}`;
export function readCampiState(userId: string): CampiState {
  try {
    const saved = localStorage.getItem(campiStorageKey(userId));
    return saved === 'hidden' || saved === 'seen' ? 'hidden' : 'welcome';
  } catch { return 'welcome'; }
}
export function saveCampiState(userId: string) {
  try { localStorage.setItem(campiStorageKey(userId), 'seen'); } catch { /* Restricted storage must never block the app. */ }
}
// Optional transparent, pre-rendered animations. No backend or AI connection.
export type CampiMotionAssets = Partial<Record<CampiState, { src: string; poster: string }>>;

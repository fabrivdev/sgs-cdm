import type { CampiComment } from './campiComments';

const prefix = 'topic:repuestos_alertas:';
const storageKey = (userId: string) => `sig-cdm:campi:repuestos-alertas-cycle:v1:${userId}`;

export const isPartsAlertVariant = (key: string) => key.startsWith(prefix) && /^[a-z_]{1,40}$/.test(key.slice(prefix.length));

/** Keep the other topics in place and resume the next eligible variant after reload. */
export function orderCampiVariants<T extends Pick<CampiComment, 'key'>>(comments: readonly T[], lastKey: string | null): T[] {
  const positions = comments.flatMap((comment, index) => isPartsAlertVariant(comment.key) ? [index] : []);
  const variants = positions.map(index => comments[index]);
  const lastIndex = variants.findIndex(comment => comment.key === lastKey);
  if (variants.length < 2 || lastIndex < 0) return [...comments];
  const start = (lastIndex + 1) % variants.length;
  const rotated = [...variants.slice(start), ...variants.slice(0, start)];
  const ordered = [...comments];
  positions.forEach((position, index) => { ordered[position] = rotated[index]; });
  return ordered;
}

export function readLastCampiVariant(userId: string): string | null {
  if (!userId) return null;
  try {
    const key = localStorage.getItem(storageKey(userId));
    return key && isPartsAlertVariant(key) ? key : null;
  } catch { return null; }
}

/** Only a static variant ID is stored; never codes, values, dates or comment text. */
export function rememberCampiVariant(userId: string, key: string): void {
  if (!userId || !isPartsAlertVariant(key)) return;
  try { localStorage.setItem(storageKey(userId), key); } catch { /* Rotation still works in memory. */ }
}

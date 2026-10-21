import type { CampiTarget } from './types';
type Rect = Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>;
/** Explicit screen-to-local convention for the integration, not a 3D raycast.
 * Pass actual rects from refs. No global selectors or guessed panel locations.
 * The horizontal/vertical distance of one Campi width/height reaches the clamp.
 */
export function targetFromRects(campi: Rect, target: Rect, limits = { yaw: Math.PI / 4, pitch: Math.PI / 6 }): CampiTarget {
  if (![campi.left, campi.top, campi.width, campi.height, target.left, target.top, target.width, target.height, limits.yaw, limits.pitch].every(Number.isFinite)
    || campi.width <= 0 || campi.height <= 0 || limits.yaw < 0 || limits.yaw > Math.PI / 2 || limits.pitch < 0 || limits.pitch > Math.PI / 2) {
    throw new Error('Campi target requires finite visible rects and angular limits in [0, pi/2] radians.');
  }
  const clamp = (n: number) => Math.max(-1, Math.min(1, n));
  const yaw = clamp((target.left + target.width / 2 - campi.left - campi.width / 2) / campi.width) * limits.yaw;
  const pitch = clamp((campi.top + campi.height / 2 - target.top - target.height / 2) / campi.height) * limits.pitch;
  return { direction: [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)] };
}

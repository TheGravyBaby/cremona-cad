import { Pt } from '../../models/types';
import { dist, signedDegreeDelta } from '../../helpers/draftMath';

// Locking angle set = multiples of 30° union multiples of 45° (0, 30, 45, 60,
// 90, 120, 135, 150, 180, ...) — matches how most CAD/drawing tools define
// "common" angle snaps, rather than a single fixed increment.
const ANGLE_LOCK_DEG: readonly number[] = (() => {
  const set = new Set<number>();
  for (let k = 0; k < 12; k++) set.add(k * 30);
  for (let k = 0; k < 8; k++) set.add(k * 45);
  return [...set].sort((a, b) => a - b);
})();

/** Snaps `pt` onto the nearest ANGLE_LOCK_DEG ray from `anchor`, preserving distance. Shared
 * by TwoPointTool (drawing) and draft-canvas.ts's Line endpoint-drag, so both use the same
 * "common angle" behavior for Shift-lock. */
export function snapToLockedAngle(anchor: Pt, pt: Pt): Pt {
  const dx = pt.x - anchor.x;
  const dy = pt.y - anchor.y;
  const len = dist(pt, anchor);
  if (len < 1e-9) return pt;

  const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  let best = ANGLE_LOCK_DEG[0];
  let bestDiff = Infinity;
  for (const candidate of ANGLE_LOCK_DEG) {
    const diff = Math.abs(signedDegreeDelta(angleDeg - candidate));
    if (diff < bestDiff) { bestDiff = diff; best = candidate; }
  }

  const rad = best * Math.PI / 180;
  return { x: anchor.x + len * Math.cos(rad), y: anchor.y + len * Math.sin(rad) };
}

/** Snaps `pt` onto the line through `anchor` at a fixed angle (radians) — e.g. the tangent
 * direction inherited from whatever curve `anchor` snapped onto, so the shape being drawn from it
 * comes out tangent to that curve. Same distance-preserving projection as snapToLockedAngle, but
 * against a single given angle (and its opposite, so either side of `anchor` still lies on the
 * line) instead of searching the common-angle set. */
export function snapToAngle(anchor: Pt, pt: Pt, angleRad: number): Pt {
  const dx = pt.x - anchor.x;
  const dy = pt.y - anchor.y;
  const len = dist(pt, anchor);
  if (len < 1e-9) return pt;

  const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  const baseDeg = angleRad * 180 / Math.PI;
  const candidates = [baseDeg, baseDeg + 180];
  let best = candidates[0];
  let bestDiff = Infinity;
  for (const candidate of candidates) {
    const diff = Math.abs(signedDegreeDelta(angleDeg - candidate));
    if (diff < bestDiff) { bestDiff = diff; best = candidate; }
  }

  const rad = best * Math.PI / 180;
  return { x: anchor.x + len * Math.cos(rad), y: anchor.y + len * Math.sin(rad) };
}

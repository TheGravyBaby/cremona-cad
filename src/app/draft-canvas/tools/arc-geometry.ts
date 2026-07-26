import { Pt } from '../../models/types';

const TWO_PI = Math.PI * 2;

function normalizeAngle(a: number): number {
  return ((a % TWO_PI) + TWO_PI) % TWO_PI;
}

export function pointOnCircle(center: Pt, radius: number, angle: number): Pt {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

/**
 * Builds an SVG arc path `d` sweeping counterclockwise from startAngle to
 * endAngle — this app's existing convention for a "positive" sweep in its
 * Y-up drafting space (see renderArcFromArc in helpers/renderFuncs.ts).
 */
export function arcPathData(center: Pt, radius: number, startAngle: number, endAngle: number): string {
  const span = normalizeAngle(endAngle - startAngle);
  const largeArcFlag = span > Math.PI ? 1 : 0;
  const sweepFlag = 1;
  const start = pointOnCircle(center, radius, startAngle);
  const end = pointOnCircle(center, radius, endAngle);
  return `M ${start.x},${start.y} A ${radius},${radius} 0 ${largeArcFlag},${sweepFlag} ${end.x},${end.y}`;
}

/**
 * Given two boundary angles on a circle, returns them as (startAngle, endAngle) oriented so
 * the CCW arc between them is the minor (<=180°) one by default, or the major (>180°) one when
 * `preferLong` is true — swapping which angle is "start" is the only way to pick between the
 * two arcs that share the same two boundary points, since arcPathData always sweeps CCW.
 */
export function pickArcOrientation(a: number, b: number, preferLong: boolean): { startAngle: number; endAngle: number } {
  const span = normalizeAngle(b - a);
  const isMinor = span <= Math.PI;
  return isMinor === !preferLong ? { startAngle: a, endAngle: b } : { startAngle: b, endAngle: a };
}

export type TangentArcFit = { center: Pt; radius: number; startAngle: number; endAngle: number };

/**
 * The unique circle through `start` and `end` that is tangent to direction
 * `startTangent` at `start` — lets an arc continue smoothly from an existing
 * line/arc endpoint instead of being built from an independent center point.
 * Returns null when `end` lies on the tangent line itself (no finite circle fits).
 */
export function fitTangentArc(start: Pt, startTangent: number, end: Pt): TangentArcFit | null {
  const tx = Math.cos(startTangent);
  const ty = Math.sin(startTangent);
  const nx = -ty; // normal to the tangent, rotated +90° (CCW)
  const ny = tx;

  const dx = start.x - end.x;
  const dy = start.y - end.y;
  const denom = 2 * (dx * nx + dy * ny);
  if (Math.abs(denom) < 1e-9) return null;

  const r = -(dx * dx + dy * dy) / denom;
  if (Math.abs(r) < 1e-6) return null;

  const center: Pt = { x: start.x + r * nx, y: start.y + r * ny };
  const radius = Math.abs(r);

  return {
    center,
    radius,
    startAngle: Math.atan2(start.y - center.y, start.x - center.x),
    endAngle: Math.atan2(end.y - center.y, end.x - center.x),
  };
}

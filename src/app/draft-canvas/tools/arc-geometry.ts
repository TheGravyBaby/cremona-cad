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

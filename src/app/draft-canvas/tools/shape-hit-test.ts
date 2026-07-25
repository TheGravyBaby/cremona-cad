import { Pt } from '../../models/types';
import { DraftShape } from './toolbox-shape';
import { pointOnCircle } from './arc-geometry';

const TWO_PI = Math.PI * 2;

function normalizeAngle(a: number): number {
  return ((a % TWO_PI) + TWO_PI) % TWO_PI;
}

function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/** Same "sweeps CCW from startAngle to endAngle" convention as arc-geometry.ts's arcPathData. */
function isAngleWithinSweep(angle: number, startAngle: number, endAngle: number): boolean {
  const span = normalizeAngle(endAngle - startAngle);
  const rel = normalizeAngle(angle - startAngle);
  return rel <= span;
}

function distanceToArc(p: Pt, center: Pt, radius: number, startAngle: number, endAngle: number): number {
  const angle = Math.atan2(p.y - center.y, p.x - center.x);
  if (isAngleWithinSweep(angle, startAngle, endAngle)) {
    const distToCenter = Math.hypot(p.x - center.x, p.y - center.y);
    return Math.abs(distToCenter - radius);
  }
  // outside the swept range — nearest point is whichever endpoint is closer
  const startPt = pointOnCircle(center, radius, startAngle);
  const endPt = pointOnCircle(center, radius, endAngle);
  return Math.min(Math.hypot(p.x - startPt.x, p.y - startPt.y), Math.hypot(p.x - endPt.x, p.y - endPt.y));
}

/** Shortest distance from a world-space point to a toolbox shape's geometry. */
export function distanceToShape(p: Pt, shape: DraftShape): number {
  switch (shape.type) {
    case 'line':
      return distanceToSegment(p, shape.start, shape.end);
    case 'arc':
      return distanceToArc(p, shape.center, shape.radius, shape.startAngle, shape.endAngle);
  }
}

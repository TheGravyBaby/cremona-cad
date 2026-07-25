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

function distanceToRect(p: Pt, p1: Pt, p2: Pt): number {
  const x0 = Math.min(p1.x, p2.x);
  const x1 = Math.max(p1.x, p2.x);
  const y0 = Math.min(p1.y, p2.y);
  const y1 = Math.max(p1.y, p2.y);
  const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    best = Math.min(best, distanceToSegment(p, corners[i], corners[(i + 1) % 4]));
  }
  return best;
}

/** Shortest distance from a world-space point to a toolbox shape's geometry. */
export function distanceToShape(p: Pt, shape: DraftShape): number {
  switch (shape.type) {
    case 'line':
    case 'dimension':
      return distanceToSegment(p, shape.start, shape.end);
    case 'circle':
      return Math.abs(Math.hypot(p.x - shape.center.x, p.y - shape.center.y) - shape.radius);
    case 'arc':
      return distanceToArc(p, shape.center, shape.radius, shape.startAngle, shape.endAngle);
    case 'rect':
      return distanceToRect(p, shape.p1, shape.p2);
  }
}

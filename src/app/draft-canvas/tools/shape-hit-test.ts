import { Pt } from '../../models/types';
import { DraftShape } from './toolbox-shape';
import { pointOnCircle } from './arc-geometry';
import { TEXT_FONT_SIZE_PX } from './shape-renderer';

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

/** Distance to an axis-aligned box, 0 if `p` is inside it — unlike distanceToRect (perimeter-only),
 * appropriate for text, whose whole rendered footprint should count as a hit, not just its edge. */
function distanceToBoxInterior(p: Pt, x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.max(x0 - p.x, 0, p.x - x1);
  const dy = Math.max(y0 - p.y, 0, p.y - y1);
  return Math.hypot(dx, dy);
}

/**
 * Estimates a text shape's world-mm footprint from its (constant on-screen) font size and
 * character count — this module stays DOM-free (see the "generic math vs SVG rendering"
 * separation elsewhere in draft-canvas), so unlike the selection halo it can't measure the
 * actual rendered glyphs. Anchored at `position` per shape-renderer.ts's text-anchor:start,
 * dominant-baseline:central.
 */
function distanceToText(p: Pt, position: Pt, text: string, pxPerMm: number): number {
  const fontSizeMm = TEXT_FONT_SIZE_PX / pxPerMm;
  const width = Math.max(1, text.length) * fontSizeMm * 0.55;
  const height = fontSizeMm * 1.2;
  return distanceToBoxInterior(p, position.x, position.y - height / 2, position.x + width, position.y + height / 2);
}

/** Shortest distance from a world-space point to a toolbox shape's geometry. */
export function distanceToShape(p: Pt, shape: DraftShape, pxPerMm: number): number {
  switch (shape.type) {
    case 'line':
    case 'dimension':
    case 'boxline':
      return distanceToSegment(p, shape.start, shape.end);
    case 'circle':
      return Math.abs(Math.hypot(p.x - shape.center.x, p.y - shape.center.y) - shape.radius);
    case 'arc':
      return distanceToArc(p, shape.center, shape.radius, shape.startAngle, shape.endAngle);
    case 'rect':
      return distanceToRect(p, shape.p1, shape.p2);
    case 'text':
      return distanceToText(p, shape.position, shape.text, pxPerMm);
  }
}

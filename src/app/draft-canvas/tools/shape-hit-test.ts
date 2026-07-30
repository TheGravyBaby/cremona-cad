import { Pt } from '../../models/types';
import { DraftShape, ImageShape, imageCenter, imageCorners } from './toolbox-shape';
import { angleFromCenter, angleWithinSweep, dist, distPointToSegment, normalizeRadians, pointOnCircle, rotatePointAbout } from '../../helpers/draftMath';
import { TEXT_FONT_SIZE_PX, TEXT_LINE_HEIGHT_RATIO } from './shape-renderer';

function distanceToArc(p: Pt, center: Pt, radius: number, startAngle: number, endAngle: number): number {
  if (angleWithinSweep(angleFromCenter(center, p), startAngle, endAngle)) {
    return Math.abs(dist(p, center) - radius);
  }
  // outside the swept range — nearest point is whichever endpoint is closer
  const startPt = pointOnCircle({ ...center, r: radius }, startAngle);
  const endPt = pointOnCircle({ ...center, r: radius }, endAngle);
  return Math.min(dist(p, startPt), dist(p, endPt));
}

function distanceToRect(p: Pt, p1: Pt, p2: Pt): number {
  const x0 = Math.min(p1.x, p2.x);
  const x1 = Math.max(p1.x, p2.x);
  const y0 = Math.min(p1.y, p2.y);
  const y1 = Math.max(p1.y, p2.y);
  const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    best = Math.min(best, distPointToSegment(p, corners[i], corners[(i + 1) % 4]));
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
 * per-line character count — this module stays DOM-free (see the "generic math vs SVG
 * rendering" separation elsewhere in draft-canvas), so unlike the selection halo it can't
 * measure the actual rendered glyphs. Anchored at `position` per shape-renderer.ts's
 * text-anchor:start, and (for the whole multi-line block) dominant-baseline:central.
 */
function textFootprint(position: Pt, text: string, pxPerMm: number): ShapeBounds {
  const fontSizeMm = TEXT_FONT_SIZE_PX / pxPerMm;
  const lines = text.split('\n');
  const maxLineLen = Math.max(1, ...lines.map(line => line.length));
  const lineHeight = fontSizeMm * TEXT_LINE_HEIGHT_RATIO;
  const width = maxLineLen * fontSizeMm * 0.55;
  const height = lines.length * lineHeight;
  return { x0: position.x, y0: position.y - height / 2, x1: position.x + width, y1: position.y + height / 2 };
}

function distanceToText(p: Pt, position: Pt, text: string, pxPerMm: number): number {
  const box = textFootprint(position, text, pxPerMm);
  return distanceToBoxInterior(p, box.x0, box.y0, box.x1, box.y1);
}

/** Distance to a placed image, 0 anywhere inside it — the whole picture is the drag target, the
 * same interior-counts-as-a-hit rule text uses. Rotation is handled by mapping the probe point
 * back into the image's unrotated frame, so the box math stays axis-aligned. */
function distanceToImage(p: Pt, shape: ImageShape): number {
  const local = rotatePointAbout(p, imageCenter(shape), -(shape.rotationDeg ?? 0));
  return distanceToBoxInterior(
    local,
    Math.min(shape.x, shape.x + shape.width), Math.min(shape.y, shape.y + shape.height),
    Math.max(shape.x, shape.x + shape.width), Math.max(shape.y, shape.y + shape.height),
  );
}

/** Shortest distance from a world-space point to a toolbox shape's geometry. */
export function distanceToShape(p: Pt, shape: DraftShape, pxPerMm: number): number {
  switch (shape.type) {
    case 'line':
    case 'dimension':
    case 'section':
      return distPointToSegment(p, shape.start, shape.end);
    case 'circle':
      return Math.abs(dist(p, shape.center) - shape.radius);
    case 'arc':
      return distanceToArc(p, shape.center, shape.radius, shape.startAngle, shape.endAngle);
    case 'rect':
      return distanceToRect(p, shape.p1, shape.p2);
    case 'text':
      return distanceToText(p, shape.position, shape.text, pxPerMm);
    case 'point':
      return dist(p, shape.position);
    case 'image':
      return distanceToImage(p, shape);
  }
}

export interface ShapeBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Axis-aligned bounding box of a toolbox shape's geometry, in world mm — used for
 * marquee/area selection (see draft-canvas.ts's onPointerDown/onPointerUp). Arc's bound is
 * sampled along its actual sweep rather than its full enclosing circle, so a marquee has to
 * cover the visible arc, not the untraced rest of the circle it sits on. */
export function shapeBounds(shape: DraftShape, pxPerMm: number): ShapeBounds {
  switch (shape.type) {
    case 'line':
    case 'dimension':
    case 'section':
      return {
        x0: Math.min(shape.start.x, shape.end.x), x1: Math.max(shape.start.x, shape.end.x),
        y0: Math.min(shape.start.y, shape.end.y), y1: Math.max(shape.start.y, shape.end.y),
      };
    case 'circle':
      return {
        x0: shape.center.x - shape.radius, x1: shape.center.x + shape.radius,
        y0: shape.center.y - shape.radius, y1: shape.center.y + shape.radius,
      };
    case 'arc': {
      const span = normalizeRadians(shape.endAngle - shape.startAngle);
      const steps = 16;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i <= steps; i++) {
        const pt = pointOnCircle({ ...shape.center, r: shape.radius }, shape.startAngle + (span * i) / steps);
        x0 = Math.min(x0, pt.x); x1 = Math.max(x1, pt.x);
        y0 = Math.min(y0, pt.y); y1 = Math.max(y1, pt.y);
      }
      return { x0, y0, x1, y1 };
    }
    case 'rect':
      return {
        x0: Math.min(shape.p1.x, shape.p2.x), x1: Math.max(shape.p1.x, shape.p2.x),
        y0: Math.min(shape.p1.y, shape.p2.y), y1: Math.max(shape.p1.y, shape.p2.y),
      };
    case 'text':
      return textFootprint(shape.position, shape.text, pxPerMm);
    case 'point':
      return { x0: shape.position.x, x1: shape.position.x, y0: shape.position.y, y1: shape.position.y };
    case 'image': {
      // A rotated image's marquee bound is the box around its four rotated corners, not its
      // unrotated w×h — same reasoning as sampling an arc's actual sweep above.
      const corners = Object.values(imageCorners(shape));
      return {
        x0: Math.min(...corners.map(c => c.x)), x1: Math.max(...corners.map(c => c.x)),
        y0: Math.min(...corners.map(c => c.y)), y1: Math.max(...corners.map(c => c.y)),
      };
    }
  }
}

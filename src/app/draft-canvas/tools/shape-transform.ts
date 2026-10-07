import { Pt } from '../../models/types';
import { DEFAULT_TEXT_SIZE_MM, DraftShape, PathSource, imageCenter } from './toolbox-shape';
import { Matrix2D, applyMatrix, pathFromPolygon, transformPath, translatePath } from '../../helpers/math/pathMath';

function shiftPt(p: Pt, dx: number, dy: number): Pt {
  return { x: p.x + dx, y: p.y + dy };
}

function mapSource(source: PathSource, pt: (p: Pt) => Pt, depthScale: number): PathSource {
  if (source.kind === 'batten') return { ...source, pins: source.pins.map(pt) };
  return { ...source, start: pt(source.start), end: pt(source.end), depth: source.depth * depthScale };
}

/** Returns a copy of `shape` translated by (dx, dy) mm — every shape type keeps its
 * geometry (radius, angles, weights, ...) and only moves its anchor point(s). */
export function translateShape(shape: DraftShape, dx: number, dy: number): DraftShape {
  if (dx === 0 && dy === 0) return shape;
  switch (shape.type) {
    case 'line':
    case 'dimension':
    case 'section':
    case 'ticks':
      return { ...shape, start: shiftPt(shape.start, dx, dy), end: shiftPt(shape.end, dx, dy) };
    case 'angle':
      return { ...shape, vertex: shiftPt(shape.vertex, dx, dy), start: shiftPt(shape.start, dx, dy), end: shiftPt(shape.end, dx, dy) };
    case 'arc':
    case 'circle':
      return { ...shape, center: shiftPt(shape.center, dx, dy) };
    case 'rect':
      return { ...shape, p1: shiftPt(shape.p1, dx, dy), p2: shiftPt(shape.p2, dx, dy) };
    case 'text':
    case 'point':
      return { ...shape, position: shiftPt(shape.position, dx, dy) };
    case 'freehand':
    case 'curve-length':
    case 'curve-ticks':
      return { ...shape, points: shape.points.map(p => shiftPt(p, dx, dy)) };
    case 'path': {
      const source = shape.source && mapSource(shape.source, p => shiftPt(p, dx, dy), 1);
      return { ...shape, d: translatePath(shape.d, dx, dy), ...(source && { source }) };
    }
    case 'image':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
  }
}

// cos(π) is -1 but sin(π) is 1.2e-16; snapped, a flip or quarter turn lands on exact coordinates
// instead of leaving that noise in every point it touches.
function trig(angle: number): [number, number] {
  const snap = (v: number) => Math.abs(v - Math.round(v)) < 1e-12 ? Math.round(v) : v;
  return [snap(Math.cos(angle)), snap(Math.sin(angle))];
}

export function translation(dx: number, dy: number): Matrix2D {
  return [1, 0, 0, 1, dx, dy];
}

/** Reflection across the line through `p` at `angle` radians. */
export function reflectAcross(p: Pt, angle: number): Matrix2D {
  const [cos, sin] = trig(2 * angle);
  return [cos, sin, sin, -cos, p.x - cos * p.x - sin * p.y, p.y - sin * p.x + cos * p.y];
}

/** Rotation by `angle` radians counterclockwise about `c`. */
export function rotateAbout(c: Pt, angle: number): Matrix2D {
  const [cos, sin] = trig(angle);
  return [cos, sin, -sin, cos, c.x - cos * c.x + sin * c.y, c.y - sin * c.x - cos * c.y];
}

/** Uniform scale by `k` about `c`. */
export function scaleAbout(c: Pt, k: number): Matrix2D {
  return [k, 0, 0, k, c.x - k * c.x, c.y - k * c.y];
}

const EPS = 1e-9;

/**
 * Returns a copy of `shape` carried through `m`, which must be a similarity — any mix of move,
 * rotation, uniform scale and mirror, the only transforms whose image of an arc is still an arc.
 * The id and every non-geometric field ride along. Null for an image under a mirror, which would
 * make a wrong reference rather than a flipped one.
 *
 * A rect only stays a rect while its edges stay axis-aligned; turned any other way it becomes a
 * path, since RectShape can't hold a rotation. Text keeps reading forwards under a mirror, turned
 * to lie along its reflected baseline, and lands at its reflected anchor.
 */
export function transformShape(shape: DraftShape, m: Matrix2D): DraftShape | null {
  const det = m[0] * m[3] - m[1] * m[2];
  const k = Math.sqrt(Math.abs(det));
  const mirrored = det < 0;
  // the image of the x axis; a direction at angle a lands at turn ± a
  const turn = Math.atan2(m[1], m[0]);
  const angle = (a: number) => mirrored ? turn - a : turn + a;
  const pt = (p: Pt) => applyMatrix(m, p);

  switch (shape.type) {
    case 'line':
    case 'section':
    case 'ticks':
      return { ...shape, start: pt(shape.start), end: pt(shape.end) };
    // a mirror turns the measurement's left normal to its right, so the offset changes sign to
    // keep the dimension line on the mirrored side.
    case 'dimension': {
      const offset = shape.offset === undefined ? undefined : shape.offset * k * (mirrored ? -1 : 1);
      return { ...shape, start: pt(shape.start), end: pt(shape.end), offset };
    }
    // a mirror reverses the counterclockwise sweep, so the arms swap to keep measuring the same side.
    case 'angle': {
      const [a, b] = mirrored ? [shape.end, shape.start] : [shape.start, shape.end];
      return { ...shape, vertex: pt(shape.vertex), start: pt(a), end: pt(b), radius: shape.radius * k };
    }
    // a mirror reverses the counterclockwise sweep, so the ends swap as well as move.
    case 'arc': {
      const [a, b] = mirrored ? [shape.endAngle, shape.startAngle] : [shape.startAngle, shape.endAngle];
      return { ...shape, center: pt(shape.center), radius: shape.radius * k, startAngle: angle(a), endAngle: angle(b) };
    }
    case 'circle':
      return { ...shape, center: pt(shape.center), radius: shape.radius * k };
    case 'rect': {
      const axisAligned = (Math.abs(m[1]) < EPS && Math.abs(m[2]) < EPS)
        || (Math.abs(m[0]) < EPS && Math.abs(m[3]) < EPS);
      if (axisAligned) return { ...shape, p1: pt(shape.p1), p2: pt(shape.p2) };
      const corners = [shape.p1, { x: shape.p2.x, y: shape.p1.y }, shape.p2, { x: shape.p1.x, y: shape.p2.y }].map(pt);
      return {
        id: shape.id, type: 'path', color: shape.color, strokeWidth: shape.strokeWidth, layerId: shape.layerId, dashed: shape.dashed,
        d: pathFromPolygon(corners),
      };
    }
    case 'point':
      return { ...shape, position: pt(shape.position) };
    case 'text': {
      let deg = angle((shape.rotationDeg ?? 0) * Math.PI / 180) * 180 / Math.PI + (mirrored ? 180 : 0);
      deg = ((deg % 360) + 540) % 360 - 180;
      const fontSize = Math.abs(k - 1) < EPS ? shape.fontSize : (shape.fontSize ?? DEFAULT_TEXT_SIZE_MM) * k;
      return { ...shape, position: pt(shape.position), fontSize, rotationDeg: Math.abs(deg) < EPS ? undefined : deg };
    }
    case 'freehand':
    case 'curve-ticks':
      return { ...shape, points: shape.points.map(pt) };
    case 'curve-length':
      return { ...shape, points: shape.points.map(pt), length: shape.length * k };
    // a mirror turns the chord's left to its right, as for a dimension's offset
    case 'path': {
      const source = shape.source && mapSource(shape.source, pt, mirrored ? -k : k);
      return { ...shape, d: transformPath(shape.d, m), ...(source && { source }) };
    }
    case 'image': {
      if (mirrored) return null;
      const center = pt(imageCenter(shape));
      const width = shape.width * k, height = shape.height * k;
      let deg = ((shape.rotationDeg ?? 0) + turn * 180 / Math.PI) % 360;
      if (Math.abs(deg) < EPS) deg = 0;
      return { ...shape, x: center.x - width / 2, y: center.y - height / 2, width, height, rotationDeg: deg };
    }
  }
}

import { Pt, Pt3D, Circle, Rectangle, Arc } from '../../models/types';
import { svgPathProperties } from 'svg-path-properties';
import { normalizeRadians, TURN, pointOnCircle, intersectLines, lineFromTwoPoints } from './simpleGeometry';

// building and moving SVG path strings, one path at a time

/**
 * Solves the center of a circular SVG arc segment (rx === ry, x-axis-rotation 0),
 * the only kind of arc this app's path generators emit. Endpoint-to-center
 * conversion per the SVG 1.1 spec (appendix F.6), simplified for rx === ry.
 */
export function arcCenterFromEndpoints(p0: Pt, p1: Pt, r: number, largeArcFlag: number, sweepFlag: number): Pt {
  const x1p = (p0.x - p1.x) / 2;
  const y1p = (p0.y - p1.y) / 2;

  const sign = largeArcFlag !== sweepFlag ? 1 : -1;
  const denom = x1p * x1p + y1p * y1p;
  const sqrtTerm = denom === 0 ? 0 : sign * Math.sqrt(Math.max(0, (r * r - denom) / denom));

  const cxp = sqrtTerm * y1p;
  const cyp = -sqrtTerm * x1p;

  return { x: cxp + (p0.x + p1.x) / 2, y: cyp + (p0.y + p1.y) / 2 };
}

export function pathFromCircle(C: Circle): string {
  const { x, y, r } = C;
  // Draw a circle using two semicircular arcs
  return `M ${x - r} ${y} A ${r} ${r} 0 0 0 ${x + r} ${y} A ${r} ${r} 0 0 0 ${x - r} ${y} Z`;
}

export function pathFromLine(Pt1: Pt, Pt2: Pt): string {
  return `M ${Pt1.x} ${Pt1.y} L ${Pt2.x} ${Pt2.y}`;
}

// 1 for an arc swept counterclockwise, -1 clockwise, matching pathFromArc
function arcSweepSign(arc: Arc): 1 | -1 {
  return normalizeRadians(arc.end - arc.start) <= TURN.half ? 1 : -1;
}

// Like pathFromCornerBezier but uses a cubic bezier. Both control points slide
// toward the tangent-intersection V by `sharpness` (0–1). Low sharpness gives a
// gradual curve; high sharpness gives long flat approaches with a tight peak at V.
export function pathFromCornerCubic(arc1: Arc, arc2: Arc, sharpness: number): string {
  const P1 = pointOnCircle(arc1, arc1.end);
  const P2 = pointOnCircle(arc2, arc2.end);
  const s1 = arcSweepSign(arc1);
  const s2 = arcSweepSign(arc2);
  const T1: Pt = { x: P1.x - s1 * Math.sin(arc1.end), y: P1.y + s1 * Math.cos(arc1.end) };
  const T2: Pt = { x: P2.x - s2 * Math.sin(arc2.end), y: P2.y + s2 * Math.cos(arc2.end) };
  const V = intersectLines(lineFromTwoPoints(P1, T1), lineFromTwoPoints(P2, T2));
  if (!V || !Number.isFinite(V.x) || !Number.isFinite(V.y)) return `M ${P1.x} ${P1.y} L ${P2.x} ${P2.y}`;
  const t = Number.isFinite(sharpness) ? Math.max(0, Math.min(1, sharpness)) : 0.1;
  // near-parallel tangents can put V behind an endpoint and invert the corner, so keep V's
  // distance but always travel along the outward tangent, never against it
  const d1x = T1.x - P1.x, d1y = T1.y - P1.y;
  const d2x = T2.x - P2.x, d2y = T2.y - P2.y;
  const a = Math.abs((V.x - P1.x) * d1x + (V.y - P1.y) * d1y);
  const b = Math.abs((V.x - P2.x) * d2x + (V.y - P2.y) * d2y);
  const cp1 = { x: P1.x + t * a * d1x, y: P1.y + t * a * d1y };
  const cp2 = { x: P2.x + t * b * d2x, y: P2.y + t * b * d2y };
  return `M ${P1.x} ${P1.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${P2.x} ${P2.y}`;
}

export function pathFromRect(R: Rectangle): string {
  const { Pt1, Pt2 } = R;
  return `M ${Pt1.x} ${Pt1.y} L ${Pt2.x} ${Pt1.y} L ${Pt2.x} ${Pt2.y} L ${Pt1.x} ${Pt2.y} Z`;
}

export function pathFromPolyline(points: Pt[], closed = false): string {
  return `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}${closed ? ' Z' : ''}`;
}

// a polyline of 3D points through a projection such as buildProjection's
export function projectedPath(proj: (x: number, y: number, z: number) => [number, number], pts: Pt3D[], closed = false): string {
  if (pts.length === 0) return '';
  const d = pts.map((pt, i) => {
    const [sx, sy] = proj(pt.x, pt.y, pt.z);
    return `${i === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`;
  }).join(' ');
  return closed ? d + ' Z' : d;
}

export function pathFromPolygon(points: Pt[]): string {
  return pathFromPolyline(points, true);
}

export function pathFromArc(arc: Arc): string {
  const startPt = pointOnCircle(arc, arc.start);
  const endPt = pointOnCircle(arc, arc.end);

  const largeArcFlag = 0; // always use the shorter (minor) arc
  const sweepFlag = normalizeRadians(arc.end - arc.start) <= TURN.half ? 1 : 0;

  return `M ${startPt.x} ${startPt.y} A ${arc.r} ${arc.r} 0 ${largeArcFlag} ${sweepFlag} ${endPt.x} ${endPt.y}`;
}

// the complementary sweep to pathFromArc, the path-string twin of renderArcFromArc's `longArc`
export function pathFromArcLongWay(arc: Arc): string {
  const startPt = pointOnCircle(arc, arc.start);
  const endPt = pointOnCircle(arc, arc.end);
  const sweepFlag = normalizeRadians(arc.end - arc.start) <= TURN.half ? 0 : 1;
  return `M ${startPt.x} ${startPt.y} A ${arc.r} ${arc.r} 0 1 ${sweepFlag} ${endPt.x} ${endPt.y}`;
}

/**
 * Builds an SVG arc path `d` sweeping counterclockwise from startAngle to
 * endAngle — this app's existing convention for a "positive" sweep in its
 * Y-up drafting space (see renderArcFromArc in helpers/renderFuncs.ts).
 * Deliberately not pathFromArc's minor-sweep convention — see toolbox-shape.ts's
 * ArcShape header for why the two conventions can't be blindly converted between.
 */
export function arcPathData(center: Pt, radius: number, startAngle: number, endAngle: number): string {
  const span = normalizeRadians(endAngle - startAngle);
  const largeArcFlag = span > TURN.half ? 1 : 0;
  const sweepFlag = 1;
  const start = pointOnCircle({ ...center, r: radius }, startAngle);
  const end = pointOnCircle({ ...center, r: radius }, endAngle);
  return `M ${start.x},${start.y} A ${radius},${radius} 0 ${largeArcFlag},${sweepFlag} ${end.x},${end.y}`;
}

export function pathFromRoundedRect(R: Rectangle, r: number): string {
  const { Pt1, Pt2 } = R;
  const width = Math.abs(Pt2.x - Pt1.x);
  const height = Math.abs(Pt2.y - Pt1.y);
  const radius = Math.min(r, width / 2, height / 2);

  const x1 = Math.min(Pt1.x, Pt2.x);
  const y1 = Math.min(Pt1.y, Pt2.y);
  const x2 = Math.max(Pt1.x, Pt2.x);
  const y2 = Math.max(Pt1.y, Pt2.y);

  return `M ${x1 + radius} ${y1} L ${x2 - radius} ${y1} Q ${x2} ${y1} ${x2} ${y1 + radius} L ${x2} ${y2 - radius} Q ${x2} ${y2} ${x2 - radius} ${y2} L ${x1 + radius} ${y2} Q ${x1} ${y2} ${x1} ${y2 - radius} L ${x1} ${y1 + radius} Q ${x1} ${y1} ${x1 + radius} ${y1} Z`;
}

export function combinePathStrings(paths: string[]): string {
  return paths.map(p => p.trim()).join(' ');
}

// only undoes combinePathStrings on absolute-coordinate pieces: a relative `m` would lose its origin
export function splitPathStrings(path: string): string[] {
  return path.split(/(?=M)/).map(p => p.trim()).filter(Boolean);
}

/**
 * Translates all coordinates in an absolute SVG path string by (dx, dy).
 * Supports M, L, C, A, Q, and Z commands.
 */
export function translatePath(path: string, dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return path;
  // Exclude e/E from the command-letter match: they appear in scientific-notation
  // numbers (e.g. 5.03e-14) and are not valid SVG path commands.
  return path.replace(/([A-DF-Za-df-z])([^A-DF-Za-df-z]*)/g, (_, cmd: string, args: string) => {
    const nums = args.trim().split(/[\s,]+/).filter((s: string) => s.length > 0).map(Number);
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
      case 'C':
        // C x1 y1 x2 y2 x y — every param is a coordinate pair, so pairwise translation applies.
        for (let i = 0; i < nums.length; i += 2) { nums[i] += dx; nums[i + 1] += dy; }
        break;
      case 'A':
        // A rx ry x-rotation large-arc-flag sweep-flag x y  (7 params per segment)
        for (let i = 0; i < nums.length; i += 7) { nums[i + 5] += dx; nums[i + 6] += dy; }
        break;
      case 'Q':
        // Q x1 y1 x y  (4 params per segment)
        for (let i = 0; i < nums.length; i += 4) {
          nums[i] += dx; nums[i + 1] += dy;
          nums[i + 2] += dx; nums[i + 3] += dy;
        }
        break;
      case 'Z':
        return cmd;
    }
    return cmd + ' ' + nums.join(' ');
  });
}

/** A 2D affine matrix in SVG's own order: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix2D = [number, number, number, number, number, number];

export const IDENTITY_MATRIX: Matrix2D = [1, 0, 0, 1, 0, 0];

/** `m` applied after `n` — the product an SVG `transform="m n"` list means. */
export function multiplyMatrices(m: Matrix2D, n: Matrix2D): Matrix2D {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function applyMatrix(m: Matrix2D, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/**
 * Parses an SVG `transform` attribute — translate, rotate (about an optional pivot), scale and
 * matrix, left to right as the attribute means them. Skews aren't parsed: nothing in this app
 * emits one, and a skewed arc isn't an arc.
 */
export function parseSvgTransform(transform: string | null | undefined): Matrix2D {
  let result = IDENTITY_MATRIX;
  if (!transform) return result;
  const re = /(translate|rotate|scale|matrix)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(transform))) {
    const v = match[2].trim().split(/[\s,]+/).filter(s => s.length > 0).map(Number);
    let m: Matrix2D;
    switch (match[1]) {
      case 'translate':
        m = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
        break;
      case 'scale':
        m = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const a = (v[0] ?? 0) * TURN.degree;
        const cos = Math.cos(a), sin = Math.sin(a);
        const cx = v[1] ?? 0, cy = v[2] ?? 0;
        m = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
        break;
      }
      case 'matrix':
        m = [v[0] ?? 1, v[1] ?? 0, v[2] ?? 0, v[3] ?? 1, v[4] ?? 0, v[5] ?? 0];
        break;
      default:
        continue;
    }
    result = multiplyMatrices(result, m);
  }
  return result;
}

/**
 * Applies an affine matrix to an absolute SVG path string (M, L, C, Q, A, Z). Arcs are taken as
 * circular and the matrix as a similarity — rotation, uniform scale, translation, mirror —
 * which is all this app's renders ever apply: the radius scales with the matrix and a mirror
 * flips the sweep flag. A non-uniform scale would turn the arc into an ellipse and isn't
 * represented; the endpoints still land where they should.
 */
export function transformPath(path: string, m: Matrix2D): string {
  const det = m[0] * m[3] - m[1] * m[2];
  const radiusScale = Math.sqrt(Math.abs(det));
  const mirrored = det < 0;
  const point = (x: number, y: number): [number, number] => {
    const p = applyMatrix(m, { x, y });
    return [p.x, p.y];
  };
  const out: string[] = [];
  for (const [, cmd, args] of path.matchAll(/([A-DF-Za-df-z])([^A-DF-Za-df-z]*)/g)) {
    const nums = args.trim().split(/[\s,]+/).filter((s: string) => s.length > 0).map(Number);
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
      case 'C':
      case 'Q':
        for (let i = 0; i + 1 < nums.length; i += 2) [nums[i], nums[i + 1]] = point(nums[i], nums[i + 1]);
        break;
      case 'A':
        for (let i = 0; i + 6 < nums.length; i += 7) {
          nums[i] *= radiusScale;
          nums[i + 1] *= radiusScale;
          if (mirrored) nums[i + 4] = nums[i + 4] ? 0 : 1;
          [nums[i + 5], nums[i + 6]] = point(nums[i + 5], nums[i + 6]);
        }
        break;
    }
    out.push(nums.length ? `${cmd} ${nums.join(' ')}` : cmd);
  }
  return out.join(' ');
}

/**
 * Rotates an absolute SVG path string 180° about the origin. Unlike a mirror, a
 * point rotation preserves concavity, so it re-orients a shape without flipping
 * a carefully-mirrored cutout curve back to the wrong hand. Supports M, L, C,
 * A, Q, and Z.
 */
export function rotatePath180(path: string): string {
  return path.replace(/([A-DF-Za-df-z])([^A-DF-Za-df-z]*)/g, (_, cmd: string, args: string) => {
    const nums = args.trim().split(/[\s,]+/).filter((s: string) => s.length > 0).map(Number);
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
      case 'C':
        for (let i = 0; i < nums.length; i += 2) { nums[i] = -nums[i]; nums[i + 1] = -nums[i + 1]; }
        break;
      case 'A':
        // A rx ry x-rotation large-arc-flag sweep-flag x y — a point reflection flips the sweep direction.
        for (let i = 0; i < nums.length; i += 7) {
          nums[i + 4] = nums[i + 4] ? 0 : 1;
          nums[i + 5] = -nums[i + 5]; nums[i + 6] = -nums[i + 6];
        }
        break;
      case 'Q':
        for (let i = 0; i < nums.length; i += 4) {
          nums[i] = -nums[i]; nums[i + 1] = -nums[i + 1];
          nums[i + 2] = -nums[i + 2]; nums[i + 3] = -nums[i + 3];
        }
        break;
      case 'Z':
        return cmd;
    }
    return cmd + ' ' + nums.join(' ');
  });
}

/**
 * Sample an SVG path string into a polyline at roughly `stepMm` spacing.
 * The path is assumed closed (or close to it); the duplicate closing point
 * is not emitted, so consumers can treat the result as a closed loop —
 * unless `includeEnd` is set, for an open path whose far end matters.
 */
export function samplePathToPolyline(path: string, stepMm = 1, includeEnd = false): Pt[] {
  const props = new svgPathProperties(path.trim());
  const len = props.getTotalLength();
  const n = Math.max(8, Math.ceil(len / stepMm));
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const pt = props.getPointAtLength((i / n) * len);
    pts.push({ x: pt.x, y: pt.y });
  }
  if (includeEnd) {
    const end = props.getPointAtLength(len);
    pts.push({ x: end.x, y: end.y });
  }
  return pts;
}

/** Combined bounding box of one or more path strings, sampled via {@link samplePathToPolyline}. */
export function pathsBounds(paths: string[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  const pts = paths.flatMap(path => samplePathToPolyline(path, 0.5));
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  const xs = pts.map(pt => pt.x), ys = pts.map(pt => pt.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

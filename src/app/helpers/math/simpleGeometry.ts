import { Pt, Pt3D, Circle, Line, Rectangle, Arc, arcFromCircle, Vec2, Vec3 } from "../../models/types";

export const TURN = {
  degree: Math.PI / 180,
  eighth: Math.PI / 4,
  quarter: Math.PI / 2,
  half: Math.PI,
  full: Math.PI * 2,
} as const;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

// hermite ease from 0 at `lo` to 1 at `hi`, flat at both ends
export function smoothstep(v: number, lo: number, hi: number): number {
  const k = clamp((v - lo) / (hi - lo), 0, 1);
  return k * k * (3 - 2 * k);
}

/** Wraps a degree value into [0, 360). */
export function normalizeDegrees(deg: number): number {
  const v = deg % 360;
  return v < 0 ? v + 360 : v;
}

/** Wraps a radian value into [0, 2π). The radian twin of normalizeDegrees, and the canonical
 * spelling of the `((a % 2π) + 2π) % 2π` idiom that this codebase otherwise reinvents per file. */
export function normalizeRadians(rad: number): number {
  const v = rad % TURN.full;
  return v < 0 ? v + TURN.full : v;
}

/** Wraps a degree *difference* into [-180, 180) — the signed shortest way round, as opposed to
 * normalizeDegrees' unsigned [0, 360). Use this when the sign means "which way to turn". */
export function signedDegreeDelta(deg: number): number {
  const v = normalizeDegrees(deg);
  return v >= 180 ? v - 360 : v;
}

// the radian twin: a difference wrapped into [-π, π), the signed shortest way round
export function signedRadianDelta(rad: number): number {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}

// the angles φ at which Σ aᵢ·sin(φ + cᵢ) = target. The terms add as phasors into one sinusoid
// R·sin(φ + δ), so there are two solutions, one where the target is R itself, and none past it.
// What a chain of arcs reaches in one direction is a sum like this when each centre is set off
// the last by a fixed radius at an angle that turns with the first
export function solveSineSum(terms: { a: number; c: number }[], target: number): number[] {
  let x = 0, y = 0;
  for (const { a, c } of terms) { x += a * Math.cos(c); y += a * Math.sin(c); }
  const R = Math.hypot(x, y);
  if (R < 1e-12 || Math.abs(target) > R * (1 + 1e-9)) return [];
  const t = clamp(target / R, -1, 1);
  const delta = Math.atan2(y, x);
  const base = Math.asin(t);
  const roots = Math.abs(t) === 1 ? [base - delta] : [base - delta, TURN.half - base - delta];
  return roots.map(signedRadianDelta);
}

// ===== Points =====

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The point `distance` mm from `from`, along the direction toward `toward` — i.e. `from`
 * pushed out/in along the existing `from`→`toward` ray, preserving its angle. Falls back to
 * `toward` unchanged when the two points coincide (no direction to preserve). */
export function pointAtDistanceToward(from: Pt, toward: Pt, distance: number): Pt {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return toward;
  return { x: from.x + (dx / len) * distance, y: from.y + (dy / len) * distance };
}

/** Rotates `point` about `center` by `angle` radians (counterclockwise, matching the Y-up
 * world). Pass a negative angle to map a world point back into an unrotated object's local
 * frame. */
export function rotatePointAbout(point: Pt, center: Pt, angle: number): Pt {
  if (angle === 0) return { x: point.x, y: point.y };
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + (dx * c - dy * s),
    y: center.y + (dx * s + dy * c),
  };
}

/** The corners of a regular polygon, counterclockwise from `vertex`, which also sets the size. */
export function regularPolygonVertices(center: Pt, vertex: Pt, sides: number): Pt[] {
  return Array.from({ length: sides }, (_, i) => rotatePointAbout(vertex, center, i * TURN.full / sides));
}

export function flipPointAboutY(point: Pt): Pt {
  return { x: -point.x, y: point.y };
}

export function cubicBezierPoint(a: Pt, c1: Pt, c2: Pt, b: Pt, t: number): Pt {
  const s = 1 - t;
  return {
    x: s * s * s * a.x + 3 * s * s * t * c1.x + 3 * s * t * t * c2.x + t * t * t * b.x,
    y: s * s * s * a.y + 3 * s * s * t * c1.y + 3 * s * t * t * c2.y + t * t * t * b.y,
  };
}

// twice the enclosed area, positive for a counterclockwise ring
export function signedPolygonArea(points: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum;
}

export function pointInPolygon(point: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

// ===== Circles =====

export function pointOnCircle(circle: Circle, angle: number): Pt {
  return {
    x: circle.x + circle.r * Math.cos(angle),
    y: circle.y + circle.r * Math.sin(angle),
  };
}

export function angleFromCenter(center: Pt, point: Pt): number {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

export function flipAngleAboutYAxis(angle: number): number {
  return (TURN.half - angle + TURN.full) % TURN.full;
}

export function offsetCircleRadius(circle: Circle, offset: number): Circle {
  const newR = circle.r + offset;
  if (newR < 0) {
    throw new Error('Offset cannot be so negative that it produces a circle with negative radius.');
  }
  return { x: circle.x, y: circle.y, r: newR };
}

export function flipCircleAboutY(circle: Circle): Circle {
  return { x: -circle.x, y: circle.y, r: circle.r };
}

export function placeCircleOnPointAtAngle(r: number, point: Pt, angle: number): Circle {
  return {
    x: point.x - r * Math.cos(angle),
    y: point.y - r * Math.sin(angle),
    r,
  };
}

// ===== Lines =====
//
// A Line is slope-intercept (m, y) with the x field unused — except for a vertical line, which
// has no slope-intercept form: there m is Infinity, x holds the line's (constant) x, and y is
// meaningless. isVerticalLine is the one check every Line-consuming function below guards with.

export function lineFromTwoPoints(a: Pt, b: Pt): Line {
  if (a.x === b.x) return { m: Infinity, y: NaN, x: a.x };
  const m = (b.y - a.y) / (b.x - a.x);
  const y = a.y - m * a.x;
  return { m, y, x: 0 };
}

export function lineFromPointAndSlope(point: Pt, slope: number): Line {
  const y = point.y - slope * point.x;
  return { m: slope, y, x: 0 };
}

export function isVerticalLine(line: Line): boolean {
  return !Number.isFinite(line.m);
}

export function angleFromLine(line: Line): number {
  return Math.atan(line.m);
}

export function tangentAngleFromLine(line: Line): number {
  return Math.atan(line.m) + TURN.quarter;
}

/**
 * Shifts a line perpendicular to itself — the line equivalent of offsetArcRadius/
 * offsetCircleRadius. Positive `offset` moves it to the right of the line's own forward
 * direction (increasing x, or increasing y when vertical) — rotate the direction vector -90°,
 * matching the "radially outward" convention those two use for arcs/circles: at any point on a
 * CCW arc the direction of travel is the tangent angle +90°, so radially-outward there is -90°
 * from travel — i.e. "right of travel".
 */
export function offsetLineByDistance(line: Line, offset: number): Line {
  const normal = lineNormal(line);
  if (isVerticalLine(line)) return { m: Infinity, y: NaN, x: line.x + offset };
  return lineFromPointAndSlope({ x: normal.x * offset, y: line.y + normal.y * offset }, line.m);
}

export function intersectLines(line1: Line, line2: Line): Pt | null {
  const vertical1 = isVerticalLine(line1);
  const vertical2 = isVerticalLine(line2);
  if (vertical1 && vertical2) return null; // parallel or coincident
  if (vertical1) return { x: line1.x, y: line2.m * line1.x + line2.y };
  if (vertical2) return { x: line2.x, y: line1.m * line2.x + line1.y };
  if (line1.m === line2.m) return null; // parallel
  const x = (line2.y - line1.y) / (line1.m - line2.m);
  return { x, y: line1.m * x + line1.y };
}

export function lineCircleIntersection(line: Line, circle: Circle): Pt[] {
  if (isVerticalLine(line)) {
    const dx = line.x - circle.x;
    const under = circle.r * circle.r - dx * dx;
    if (under < 0) return [];
    const dy = Math.sqrt(under);
    return [{ x: line.x, y: circle.y + dy }, { x: line.x, y: circle.y - dy }];
  }

  const d = line.y - circle.y;
  const a = 1 + line.m * line.m;
  const b = 2 * (line.m * d - circle.x);
  const c = circle.x * circle.x + d * d - circle.r * circle.r;

  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];

  const s = Math.sqrt(disc);
  const x1 = (-b + s) / (2 * a);
  const x2 = (-b - s) / (2 * a);
  return [
    { x: x1, y: line.m * x1 + line.y },
    { x: x2, y: line.m * x2 + line.y },
  ];
}

// scale-aware tolerance, same idea as circleCircleIntersections' eps and solveTangentCircleAndLine's:
// a steep line (large m) blows up a/b/c into the thousands or millions, so a fixed absolute
// tolerance gets swamped by ordinary floating-point noise long before it catches a genuine miss —
// a circle built tangent to this very line by solveTangentCircleAndLine can come back with a
// discriminant of -1e-6 for what is mathematically exactly 0
export function lineCircleIntersectionWithTolerance(line: Line, circle: Circle, tolerance = 1e-9): Pt[] {
  if (isVerticalLine(line)) {
    const dx = line.x - circle.x;
    const under = circle.r * circle.r - dx * dx;
    const eps = tolerance * Math.max(1, circle.r * circle.r, dx * dx);

    if (under < -eps) {
      // No intersection
      return [];
    }

    // Handle floating point errors by treating near-zero values as zero
    if (under < eps) {
      return [{ x: line.x, y: circle.y }];
    }

    const dy = Math.sqrt(under);
    return [{ x: line.x, y: circle.y + dy }, { x: line.x, y: circle.y - dy }];
  }

  const d = line.y - circle.y;
  const a = 1 + line.m * line.m;
  const b = 2 * (line.m * d - circle.x);
  const c = circle.x * circle.x + d * d - circle.r * circle.r;

  const discriminant = b * b - 4 * a * c;
  const eps = tolerance * Math.max(1, Math.abs(b * b), Math.abs(4 * a * c));

  if (discriminant < -eps) {
    // No intersection
    return [];
  }

  // Handle floating point errors by treating near-zero discriminants as zero
  if (discriminant < eps) {
    const x = -b / (2 * a);
    const y = line.m * x + line.y;
    return [new Pt(x, y)];
  }

  const sqrt_discriminant = Math.sqrt(discriminant);
  const x1 = (-b + sqrt_discriminant) / (2 * a);
  const x2 = (-b - sqrt_discriminant) / (2 * a);
  const y1 = line.m * x1 + line.y;
  const y2 = line.m * x2 + line.y;

  return [new Pt(x1, y1), new Pt(x2, y2)];
}

// https://en.wikipedia.org/wiki/Distance_from_a_point_to_a_line
export function shortestDistanceFromPtToLine(point: Pt, line: Line): number {
  if (isVerticalLine(line)) return Math.abs(point.x - line.x);
  return Math.abs(line.m * point.x - point.y + (line.y - line.m * line.x)) / Math.sqrt(line.m * line.m + 1);
}

/** The closest point on `line` to `point`, with its distance — the unclamped twin of
 * closestPointOnSegment. */
export function closestPointOnLine(point: Pt, line: Line): { dist: number; point: Pt } {
  if (isVerticalLine(line)) {
    const closest = { x: line.x, y: point.y };
    return { dist: Math.abs(point.x - line.x), point: closest };
  }
  const direction = lineDirection(line);
  const t = point.x * direction.x + (point.y - line.y) * direction.y;
  const closest = { x: t * direction.x, y: line.y + t * direction.y };
  return { dist: Math.hypot(point.x - closest.x, point.y - closest.y), point: closest };
}

/** Closest point on segment a→b to `point`, with its distance — the clamped twin of
 * closestPointOnLine. */
export function closestPointOnSegment(point: Pt, a: Pt, b: Pt): { dist: number; point: Pt } {
  const abx = b.x - a.x, aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq > 0 ? clamp(((point.x - a.x) * abx + (point.y - a.y) * aby) / lenSq, 0, 1) : 0;
  const closest = { x: a.x + t * abx, y: a.y + t * aby };
  const dx = point.x - closest.x, dy = point.y - closest.y;
  return { dist: Math.sqrt(dx * dx + dy * dy), point: closest };
}


// ===== Vectors =====
export function addVec(u: Vec2, v: Vec2): Vec2 {
  return { x: u.x + v.x, y: u.y + v.y };
}

export function subVec(u: Vec2, v: Vec2): Vec2 {
  return { x: u.x - v.x, y: u.y - v.y };
}

export function scaleVec(v: Vec2, k: number): Vec2 {
  return { x: v.x * k, y: v.y * k };
}

export function dot(u: Vec2, v: Vec2): number {
  return u.x * v.x + u.y * v.y;
}

// the z of the 3D cross product: positive when v turns counterclockwise from u
export function cross(u: Vec2, v: Vec2): number {
  return u.x * v.y - u.y * v.x;
}

export function vecLength(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

// the zero vector stays zero
export function unitVec(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
}

// turned a quarter counterclockwise
export function perp(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

export function vecAtAngle(theta: number): Vec2 {
  return { x: Math.cos(theta), y: Math.sin(theta) };
}

export function angleOfVec(v: Vec2): number {
  return Math.atan2(v.y, v.x);
}

export function lerpVec(u: Vec2, v: Vec2, t: number): Vec2 {
  return { x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t };
}

export function stepAlong(from: Pt, dir: Vec2, distance: number): Pt {
  return { x: from.x + dir.x * distance, y: from.y + dir.y * distance };
}

export function addVec3(u: Vec3, v: Vec3): Vec3 {
  return { x: u.x + v.x, y: u.y + v.y, z: u.z + v.z };
}

export function subVec3(u: Vec3, v: Vec3): Vec3 {
  return { x: u.x - v.x, y: u.y - v.y, z: u.z - v.z };
}

export function scaleVec3(v: Vec3, k: number): Vec3 {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

export function dot3(u: Vec3, v: Vec3): number {
  return u.x * v.x + u.y * v.y + u.z * v.z;
}

export function cross3(u: Vec3, v: Vec3): Vec3 {
  return { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
}

export function vecLength3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function unitVec3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  return len > 0 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 0, z: 0 };
}

export function lerpVec3(u: Vec3, v: Vec3, t: number): Vec3 {
  return { x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t, z: u.z + (v.z - u.z) * t };
}

export function stepAlong3(from: Pt3D, dir: Vec3, distance: number): Pt3D {
  return { x: from.x + dir.x * distance, y: from.y + dir.y * distance, z: from.z + dir.z * distance };
}

// a line's unit direction runs toward increasing x, or up when vertical, whichever way it was drawn
export function lineDirection(line: Line): Vec2 {
  if (isVerticalLine(line)) return { x: 0, y: 1 };
  const len = Math.sqrt(1 + line.m * line.m);
  return { x: 1 / len, y: line.m / len };
}

// the unit normal to the right of lineDirection, the side offsetLineByDistance moves toward
export function lineNormal(line: Line): Vec2 {
  const direction = lineDirection(line);
  return { x: direction.y, y: -direction.x };
}

// ===== Arcs =====

/** True when `angle` lies on the CCW sweep from startAngle to endAngle — the arcPathData
 * convention, and deliberately *not* angleOnDrawnArc's minor-sweep one. */
export function angleWithinSweep(angle: number, startAngle: number, endAngle: number): boolean {
  return normalizeRadians(angle - startAngle) <= normalizeRadians(endAngle - startAngle);
}

// an arc's ends, plus the point facing `angle` if the sweep passes it: where it can reach furthest
// that way. Reads the arc counterclockwise, as angleWithinSweep does, not as its minor span
export function arcReach(arc: Arc, angle: number): Pt[] {
  return [arc.start, arc.end, ...(angleWithinSweep(angle, arc.start, arc.end) ? [angle] : [])].map(a => pointOnCircle(arc, a));
}

/** True when `angle` lies on the drawn (minor) span between the arc's start and end — see pathFromArc. */
export function angleOnDrawnArc(arc: Arc, angle: number): boolean {
  const diff = normalizeRadians(arc.end - arc.start);
  const from = diff <= TURN.half ? arc.start : arc.end;
  const span = diff <= TURN.half ? diff : TURN.full - diff;
  const rel = normalizeRadians(angle - from);
  const eps = 1e-9;
  return rel <= span + eps || rel >= TURN.full - eps;
}

/** signed sweep of an Arc's drawn (minor) span: negative clockwise, positive ccw. */
export function signedArcSweep(arc: Arc): number {
  const d = normalizeRadians(arc.end - arc.start);
  return d > TURN.half ? d - TURN.full : d;
}

/** tangent direction at the end of an Arc's drawn span. */
export function travelAtArcEnd(arc: Arc): number {
  return arc.end + Math.sign(signedArcSweep(arc)) * TURN.quarter;
}

/** tangent direction at the start of an Arc's drawn span. */
export function travelAtArcStart(arc: Arc): number {
  return arc.start + Math.sign(signedArcSweep(arc)) * TURN.quarter;
}

/**
 * Intersections of the horizontal line y = `y` with the drawn span of the arc.
 * Circle crossings are computed analytically, then filtered to the minor sweep
 * that pathFromArc actually renders.
 */
export function arcHorizontalIntersections(arc: Arc, y: number): Pt[] {
  const dy = y - arc.y;
  if (Math.abs(dy) > arc.r) return [];
  const xOff = Math.sqrt(arc.r * arc.r - dy * dy);
  const candidates: Pt[] = [{ x: arc.x + xOff, y }, { x: arc.x - xOff, y }];
  return candidates.filter(pt => angleOnDrawnArc(arc, angleFromCenter(arc, pt)));
}

export function offsetArcRadius(arc: Arc, offset: number): Arc {
  const offsetCircle = offsetCircleRadius(arc, offset);
  return arcFromCircle(offsetCircle, arc.start, arc.end);
}

// this function exists because when defining outer corner arcs
// the user might change the inner trace corner circle
// which effects the outer circle
// in those situations we need to recalculate that outer circle position and its start position
// but we will keep the user
export function redefineArcCircle(arc: Arc, c: Arc, offset?: number): Arc {
  if (offset !== undefined) {
    c = offsetArcRadius(c, offset);
  }

  return arcFromCircle(c, c.start, arc.end);
}

// the arc from its end's mirror to its end, across the y axis
export function spanArcAboutY(arc: Arc): Arc {
  return arcFromCircle(arc, flipAngleAboutYAxis(arc.end), arc.end);
}

export function flipArcAboutY(arc: Arc): Arc {
  const mirroredCircle = flipCircleAboutY(arc);
  return arcFromCircle(mirroredCircle, flipAngleAboutYAxis(arc.start), flipAngleAboutYAxis(arc.end));
}

// ===== Rectangles =====

export function flipRectAboutY(rect: Rectangle): Rectangle {
  const flippedPt1 = flipPointAboutY(rect.Pt1);
  const flippedPt2 = flipPointAboutY(rect.Pt2);
  return new Rectangle(flippedPt1, flippedPt2);
}

/** Grows or shrinks an axis-aligned rectangle by moving all four edges outward (positive
 * `offset`) or inward (negative) by that distance — the rectangle equivalent of
 * offsetCircleRadius/offsetLineByDistance. Pt1/Pt2 need not already be in min/max order. */
export function offsetRectangle(rect: Rectangle, offset: number): Rectangle {
  const x0 = Math.min(rect.Pt1.x, rect.Pt2.x) - offset;
  const x1 = Math.max(rect.Pt1.x, rect.Pt2.x) + offset;
  const y0 = Math.min(rect.Pt1.y, rect.Pt2.y) - offset;
  const y1 = Math.max(rect.Pt1.y, rect.Pt2.y) + offset;
  if (x1 - x0 <= 0 || y1 - y0 <= 0) {
    throw new Error('Offset cannot be so negative that it produces a rectangle with non-positive width or height.');
  }
  return new Rectangle(new Pt(x0, y0), new Pt(x1, y1));
}

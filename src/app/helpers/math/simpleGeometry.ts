import { Pt, Circle, Line, Rectangle, Arc, arcFromCircle, Vect2D } from "../../models/types";

export const TWO_PI = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** Wraps a degree value into [0, 360). */
export function normalizeDegrees(deg: number): number {
  const v = deg % 360;
  return v < 0 ? v + 360 : v;
}

/** Wraps a radian value into [0, 2π). The radian twin of normalizeDegrees, and the canonical
 * spelling of the `((a % 2π) + 2π) % 2π` idiom that this codebase otherwise reinvents per file. */
export function normalizeRadians(rad: number): number {
  const v = rad % TWO_PI;
  return v < 0 ? v + TWO_PI : v;
}

/** Wraps a degree *difference* into [-180, 180) — the signed shortest way round, as opposed to
 * normalizeDegrees' unsigned [0, 360). Use this when the sign means "which way to turn". */
export function signedDegreeDelta(deg: number): number {
  const v = normalizeDegrees(deg);
  return v >= 180 ? v - 360 : v;
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

export function flipPointAboutY(point: Pt): Pt {
  return { x: -point.x, y: point.y };
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
  return (Math.PI - angle + TWO_PI) % TWO_PI;
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
  return Math.atan(line.m) + Math.PI / 2;
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
  const normal = tangentUnitVectorFromLine(line);
  if (isVerticalLine(line)) return { m: Infinity, y: NaN, x: line.x + offset };
  return lineFromPointAndSlope({ x: normal.a * offset, y: line.y + normal.b * offset }, line.m);
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

// Helper function to find intersection with tolerance for floating point errors
export function lineCircleIntersectionWithTolerance(line: Line, circle: Circle, tolerance = 1e-10): Pt[] {
  if (isVerticalLine(line)) {
    const dx = line.x - circle.x;
    const under = circle.r * circle.r - dx * dx;

    if (under < -tolerance) {
      // No intersection
      return [];
    }

    // Handle floating point errors by treating near-zero values as zero
    if (under < tolerance) {
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

  if (discriminant < -tolerance) {
    // No intersection
    return [];
  }

  // Handle floating point errors by treating near-zero discriminants as zero
  if (discriminant < tolerance) {
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
  const direction = unitVectorFromLine(line);
  const t = point.x * direction.a + (point.y - line.y) * direction.b;
  const closest = { x: t * direction.a, y: line.y + t * direction.b };
  return { dist: Math.hypot(point.x - closest.x, point.y - closest.y), point: closest };
}

/** Closest point on segment a→b to `point`, with its distance — the clamped twin of
 * closestPointOnLine. */
export function closestPointOnSegment(point: Pt, a: Pt, b: Pt): { dist: number; point: Pt } {
  if (a.x === b.x && a.y === b.y) return { dist: dist(point, a), point: { x: a.x, y: a.y } };
  const abx = b.x - a.x, aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const foot = closestPointOnLine(point, lineFromTwoPoints(a, b)).point;
  const t = clamp(((foot.x - a.x) * abx + (foot.y - a.y) * aby) / lenSq, 0, 1);
  const closest = { x: a.x + t * abx, y: a.y + t * aby };
  return { dist: Math.hypot(point.x - closest.x, point.y - closest.y), point: closest };
}


// ===== Vectors =====
export function unitVectorFromLine(line: Line): Vect2D {
  if (isVerticalLine(line)) return { a: 0, b: 1, mag: 1 };
  const mag = Math.sqrt(1 + line.m * line.m);
  return { a: 1 / mag, b: line.m / mag, mag: 1 };
}

export function tangentUnitVectorFromLine(line: Line): Vect2D {
  if (isVerticalLine(line)) return { a: 1, b: 0, mag: 1 };
  const mag = Math.sqrt(1 + line.m * line.m);
  return { a: line.m / mag, b: -1 / mag, mag: 1 };
}

export function moveInVectorSpace(point: Pt, vectors: Vect2D[]): Pt {
  let newX = point.x;
  let newY = point.y;
  for (const v of vectors) {
    newX += v.a * v.mag;
    newY += v.b * v.mag;
  }
  return { x: newX, y: newY };
}


// ===== Arcs =====

/** True when `angle` lies on the CCW sweep from startAngle to endAngle — the arcPathData
 * convention, and deliberately *not* angleOnDrawnArc's minor-sweep one. */
export function angleWithinSweep(angle: number, startAngle: number, endAngle: number): boolean {
  return normalizeRadians(angle - startAngle) <= normalizeRadians(endAngle - startAngle);
}

/** True when `angle` lies on the drawn (minor) span between the arc's start and end — see pathFromArc. */
export function angleOnDrawnArc(arc: Arc, angle: number): boolean {
  const diff = normalizeRadians(arc.end - arc.start);
  const from = diff <= Math.PI ? arc.start : arc.end;
  const span = diff <= Math.PI ? diff : TWO_PI - diff;
  const rel = normalizeRadians(angle - from);
  const eps = 1e-9;
  return rel <= span + eps || rel >= TWO_PI - eps;
}

/** signed sweep of an Arc's drawn (minor) span: negative clockwise, positive ccw. */
export function signedArcSweep(arc: Arc): number {
  const d = normalizeRadians(arc.end - arc.start);
  return d > Math.PI ? d - TWO_PI : d;
}

/** tangent direction at the end of an Arc's drawn span. */
export function travelAtArcEnd(arc: Arc): number {
  return arc.end + Math.sign(signedArcSweep(arc)) * Math.PI / 2;
}

/** tangent direction at the start of an Arc's drawn span. */
export function travelAtArcStart(arc: Arc): number {
  return arc.start + Math.sign(signedArcSweep(arc)) * Math.PI / 2;
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

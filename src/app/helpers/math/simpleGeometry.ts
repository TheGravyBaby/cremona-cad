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

export function dist(a: Pt, b: Pt) {
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

/** Rotates `p` about `center` by `deg` (counterclockwise, matching the Y-up world). Pass a
 * negative angle to map a world point back into an unrotated object's local frame. */
export function rotatePointAbout(p: Pt, center: Pt, deg: number): Pt {
  if (deg === 0) return { x: p.x, y: p.y };
  const rad = deg * Math.PI / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + (dx * c - dy * s),
    y: center.y + (dx * s + dy * c),
  };
}

export function distPointToSegment(p: Pt, a: Pt, b: Pt): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.min(Math.max(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0), 1);
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

/** Closest point on segment a→b to p, with its distance. */
export function closestPointOnSegment(p: Pt, a: Pt, b: Pt): { dist: number; point: Pt } {
  const abx = b.x - a.x, aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.min(Math.max(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0), 1);
  const point = { x: a.x + t * abx, y: a.y + t * aby };
  return { dist: Math.hypot(p.x - point.x, p.y - point.y), point };
}

export function flipPointAboutY(P: Pt): Pt {
  return { x: -P.x, y: P.y };
}

// ===== Circles =====

export function pointOnCircle(C: Circle, θ: number): Pt {
  return {
    x: C.x + C.r * Math.cos(θ),
    y: C.y + C.r * Math.sin(θ),
  };
}

export function angleFromCenter(C: Pt, P: Pt): number {
  return Math.atan2(P.y - C.y, P.x - C.x);
}

export function flipAngleAboutYAxis(theta: number): number {
  return (Math.PI - theta + 2 * Math.PI) % (2 * Math.PI);
}

export function offsetCircleRadius(C: Circle, offset: number): Circle {
  const newR = C.r + offset;
  if (newR < 0) {
    throw new Error('Offset cannot be so negative that it produces a circle with negative radius.');
  }
  return { x: C.x, y: C.y, r: newR };
}

export function flipCircleAboutY(C: Circle): Circle {
  return { x: -C.x, y: C.y, r: C.r };
}

// ===== Lines =====

export function lineFromTwoPoints(A: Pt, B: Pt): Line {
  let m = (B.y - A.y) / (B.x - A.x);

  // find y intercept
  // y = mx + b
  let b = A.y - m * A.x;

  return { m, y: b, x: 0};
}

export function lineFromPointAndSlope(P: Pt, m: number): Line {
  const y = P.y - m * P.x;
  return { m, y, x: 0 };
}

export function yInterceptFromTwoPoints(P1: Pt, P2: Pt): number | null {
  if (P1.x === P2.x) return null; // vertical line, no y-intercept
  const m = (P2.y - P1.y) / (P2.x - P1.x);
  return P1.y - m * P1.x;
}

export function unitVectorFromLine(L: Line): Vect2D {
  const mag = Math.sqrt(1 + L.m * L.m);
  return { a: 1 / mag, b: L.m / mag, mag: 1 };
}

export function tangentUnitVectorFromLine(L: Line): Vect2D {
  const mag = Math.sqrt(1 + L.m * L.m);
  return { a: L.m / mag, b: -1 / mag, mag: 1 };
}

export function angleFromLine(L: Line): number {
  return Math.atan(L.m);
}

export function tangentAngleFromLine(L: Line): number {
  return Math.atan(L.m) + Math.PI/2;
}

export function moveInVectorSpace(P: Pt, Vects: Vect2D[]): Pt {
  let newX = P.x;
  let newY = P.y;
  for (const v of Vects) {
    newX += v.a * v.mag;
    newY += v.b * v.mag;
  }
  return { x: newX, y: newY };
}

// https://en.wikipedia.org/wiki/Distance_from_a_point_to_a_line
export function shortestDistanceFromPtToLine(P: Pt, L: Line): number {
  // Distance from point to line formula: |m*Px - Py + (L.y - m*L.x)| / sqrt(m^2 + 1)
  return Math.abs(L.m * P.x - P.y + (L.y - L.m * L.x)) / Math.sqrt(L.m * L.m + 1);
}

/**
 * Translates a line segment perpendicular to its own direction — the line equivalent of
 * offsetArcRadius/offsetCircleRadius. Positive `offset` moves it to the right of the a→b
 * direction (rotate the direction vector -90°), matching the "radially outward" convention
 * those two use for arcs/circles: at any point on a CCW arc the direction of travel is the
 * tangent angle +90°, so radially-outward there is -90° from travel — i.e. "right of travel".
 */
export function offsetLineByDistance(a: Pt, b: Pt, offset: number): { start: Pt; end: Pt } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { start: { ...a }, end: { ...b } };
  const nx = dy / len;
  const ny = -dx / len;
  return {
    start: { x: a.x + nx * offset, y: a.y + ny * offset },
    end: { x: b.x + nx * offset, y: b.y + ny * offset },
  };
}

export function intersectLines(A: Pt, B: Pt, C: Pt, D: Pt): Pt | null {
  const x1 = A.x, y1 = A.y;
  const x2 = B.x, y2 = B.y;
  const x3 = C.x, y3 = C.y;
  const x4 = D.x, y4 = D.y;

  const denom = (x1 - x2) * (y3 - y4) -
                (y1 - y2) * (x3 - x4);

  if (denom === 0) return null; // parallel or coincident

  const px =
    ((x1*y2 - y1*x2) * (x3 - x4) -
     (x1 - x2) * (x3*y4 - y3*x4)) / denom;

  const py =
    ((x1*y2 - y1*x2) * (y3 - y4) -
     (y1 - y2) * (x3*y4 - y3*x4)) / denom;

  return { x: px, y: py };
}

export function lineCircleIntersection(P1: Pt, P2: Pt, C: Circle): Pt[] {
  const dx = P2.x - P1.x;
  const dy = P2.y - P1.y;

  const fx = P1.x - C.x;
  const fy = P1.y - C.y;

  const a = dx*dx + dy*dy;
  const b = 2 * (fx*dx + fy*dy);
  const c = fx*fx + fy*fy - C.r*C.r;

  const disc = b*b - 4*a*c;
  if (disc < 0) return [];

  const s = Math.sqrt(disc);
  return [
    { x: P1.x + (-b + s)/(2*a) * dx, y: P1.y + (-b + s)/(2*a) * dy },
    { x: P1.x + (-b - s)/(2*a) * dx, y: P1.y + (-b - s)/(2*a) * dy },
  ];
}

export function lineCircleIntersectionBetter(L: Line, C: Circle): Pt[] {
  // Convert the line to two points for the existing lineCircleIntersection function
  const P1 = { x: 0, y: L.y };
  const P2 = { x: 1, y: L.m + L.y };
  return lineCircleIntersection(P1, P2, C);
}

// ===== Arcs =====

/** True when `angle` lies on the CCW sweep from startAngle to endAngle — the arcPathData
 * convention, and deliberately *not* angleOnDrawnArc's minor-sweep one. */
export function angleWithinSweep(angle: number, startAngle: number, endAngle: number): boolean {
  return normalizeRadians(angle - startAngle) <= normalizeRadians(endAngle - startAngle);
}

/** True when angle θ lies on the drawn (minor) span between the arc's start and end — see pathFromArc. */
export function angleOnDrawnArc(arc: Arc, theta: number): boolean {
  const diff = normalizeRadians(arc.end - arc.start);
  const from = diff <= Math.PI ? arc.start : arc.end;
  const span = diff <= Math.PI ? diff : TWO_PI - diff;
  const rel = normalizeRadians(theta - from);
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
 * Builds an SVG arc path `d` sweeping counterclockwise from startAngle to
 * endAngle — this app's existing convention for a "positive" sweep in its
 * Y-up drafting space (see renderArcFromArc in helpers/renderFuncs.ts).
 */
export function arcPathData(center: Pt, radius: number, startAngle: number, endAngle: number): string {
  const span = normalizeRadians(endAngle - startAngle);
  const largeArcFlag = span > Math.PI ? 1 : 0;
  const sweepFlag = 1;
  const start = pointOnCircle({ ...center, r: radius }, startAngle);
  const end = pointOnCircle({ ...center, r: radius }, endAngle);
  return `M ${start.x},${start.y} A ${radius},${radius} 0 ${largeArcFlag},${sweepFlag} ${end.x},${end.y}`;
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
  const candidates = [new Pt(arc.x + xOff, y), new Pt(arc.x - xOff, y)];
  return candidates.filter(pt => angleOnDrawnArc(arc, angleFromCenter(arc, pt)));
}

export function offsetArcRadius(arc: Arc, offset: number): Arc {
  const newR = arc.r + offset;
  if (newR < 0)
    throw new Error('Offset cannot be so negative that it produces an arc with negative radius.');

  let C = new Circle(arc.x, arc.y, newR);
  return arcFromCircle(C, arc.start, arc.end);
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
  let mirroredArc = new Circle(-arc.x, arc.y, arc.r);
  let mirroredU1Arc = arcFromCircle(mirroredArc, flipAngleAboutYAxis(arc.start), flipAngleAboutYAxis(arc.end));
  return mirroredU1Arc;
}

// ===== Rectangles =====

export function flipRectAboutY(R: Rectangle): Rectangle {
  const flippedPt1 = flipPointAboutY(R.Pt1);
  const flippedPt2 = flipPointAboutY(R.Pt2);
  return new Rectangle(flippedPt1, flippedPt2);
}

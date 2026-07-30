import { Pt, Circle, Axis, Line, Rectangle, Arc, arcFromCircle } from "../models/types";

// ======= Simple Geometry =======
export function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** Wraps a degree value into [0, 360). */
export function normalizeDegrees(deg: number): number {
  const v = deg % 360;
  return v < 0 ? v + 360 : v;
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

/** Distance from a point to a closed polyline (last point connects back to the first). */
export function distPointToPolyline(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = distPointToSegment(p, poly[i], poly[(i + 1) % poly.length]);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Uniform-grid spatial index over a closed polyline's segments. A single
 * distance query is O(N); dense batch queries (contour grids, wireframe
 * strips, STL export) make that quadratic, so they should build this once
 * and query cells instead of scanning every segment.
 */
export interface PolylineIndex {
  poly: Pt[];
  cellSize: number;
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  /** Per-cell lists of segment start indices (segment i runs poly[i] → poly[(i+1) % n]). */
  cells: number[][];
}

export function buildPolylineIndex(poly: Pt[], cellSize = 6): PolylineIndex {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of poly) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  const cols = poly.length ? Math.max(1, Math.ceil((maxX - minX) / cellSize)) : 1;
  const rows = poly.length ? Math.max(1, Math.ceil((maxY - minY) / cellSize)) : 1;
  const cells: number[][] = Array.from({ length: cols * rows }, () => []);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const i0 = Math.min(cols - 1, Math.max(0, Math.floor((Math.min(a.x, b.x) - minX) / cellSize)));
    const i1 = Math.min(cols - 1, Math.max(0, Math.floor((Math.max(a.x, b.x) - minX) / cellSize)));
    const j0 = Math.min(rows - 1, Math.max(0, Math.floor((Math.min(a.y, b.y) - minY) / cellSize)));
    const j1 = Math.min(rows - 1, Math.max(0, Math.floor((Math.max(a.y, b.y) - minY) / cellSize)));
    for (let cj = j0; cj <= j1; cj++) {
      for (let ci = i0; ci <= i1; ci++) cells[cj * cols + ci].push(i);
    }
  }
  return { poly, cellSize, minX, minY, cols, rows, cells };
}

/**
 * Same result as `distPointToPolyline`, but resolved via the index: cells are
 * scanned ring by ring outward from the query point, stopping once every
 * unscanned cell is provably farther than the best segment found. A cell at
 * Chebyshev ring r is at least (r−1)·cellSize away, so after scanning ring r
 * the search ends when best ≤ r·cellSize.
 */
export function distPointToPolylineIndexed(p: Pt, idx: PolylineIndex): number {
  const { poly, cellSize, minX, minY, cols, rows, cells } = idx;
  const ci = Math.floor((p.x - minX) / cellSize);
  const cj = Math.floor((p.y - minY) / cellSize);
  // Farthest ring that can still contain grid cells, even for off-grid query points.
  const maxRing = Math.max(ci, cols - 1 - ci, cj, rows - 1 - cj);
  let best = Infinity;

  const scanCell = (x: number, y: number): void => {
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    for (const i of cells[y * cols + x]) {
      const d = distPointToSegment(p, poly[i], poly[(i + 1) % poly.length]);
      if (d < best) best = d;
    }
  };

  for (let r = 0; r <= maxRing; r++) {
    if (r === 0) {
      scanCell(ci, cj);
    } else {
      for (let dx = -r; dx <= r; dx++) {
        scanCell(ci + dx, cj - r);
        scanCell(ci + dx, cj + r);
      }
      for (let dy = -r + 1; dy <= r - 1; dy++) {
        scanCell(ci - r, cj + dy);
        scanCell(ci + r, cj + dy);
      }
    }
    if (best <= r * cellSize) break;
  }
  return best;
}

/** Closest point on segment a→b to p, with its distance. */
export function closestPointOnSegment(p: Pt, a: Pt, b: Pt): { dist: number; point: Pt } {
  const abx = b.x - a.x, aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.min(Math.max(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0), 1);
  const point = { x: a.x + t * abx, y: a.y + t * aby };
  return { dist: Math.hypot(p.x - point.x, p.y - point.y), point };
}

/**
 * Like {@link distPointToPolylineIndexed}, but also returns the closest point
 * itself — needed when the direction to the loop (not just the distance) matters,
 * e.g. sampling the arch surface's slope in the fluting channel's transverse
 * direction. Same outward ring scan and early-out bound.
 */
export function closestPointToPolylineIndexed(p: Pt, idx: PolylineIndex): { dist: number; point: Pt } {
  const { poly, cellSize, minX, minY, cols, rows, cells } = idx;
  const ci = Math.floor((p.x - minX) / cellSize);
  const cj = Math.floor((p.y - minY) / cellSize);
  const maxRing = Math.max(ci, cols - 1 - ci, cj, rows - 1 - cj);
  let best = Infinity;
  let bestPt: Pt = poly[0] ?? p;

  const scanCell = (x: number, y: number): void => {
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    for (const i of cells[y * cols + x]) {
      const r = closestPointOnSegment(p, poly[i], poly[(i + 1) % poly.length]);
      if (r.dist < best) { best = r.dist; bestPt = r.point; }
    }
  };

  for (let r = 0; r <= maxRing; r++) {
    if (r === 0) {
      scanCell(ci, cj);
    } else {
      for (let dx = -r; dx <= r; dx++) {
        scanCell(ci + dx, cj - r);
        scanCell(ci + dx, cj + r);
      }
      for (let dy = -r + 1; dy <= r - 1; dy++) {
        scanCell(ci - r, cj + dy);
        scanCell(ci + r, cj + dy);
      }
    }
    if (best <= r * cellSize) break;
  }
  return { dist: best, point: bestPt };
}

export function flipAngleAboutYAxis(theta: number): number {
  return (Math.PI - theta + 2 * Math.PI) % (2 * Math.PI);
}

export function pointOnCircle(C: Circle,  θ: number): Pt {
  return {
    x: C.x + C.r * Math.cos(θ),
    y: C.y + C.r * Math.sin(θ),
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

export function yInterceptFromTwoPoints(P1: Pt, P2: Pt): number | null {
  if (P1.x === P2.x) return null; // vertical line, no y-intercept
  const m = (P2.y - P1.y) / (P2.x - P1.x);
  return P1.y - m * P1.x;
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


export function lineFromTwoPoints(A: Pt, B: Pt): Line {
  let m = (B.y - A.y) / (B.x - A.x);

  // find y intercept 
  // y = mx + b 
  let b = A.y - m * A.x;

  return { m, b: b };
}

export function angleFromCenter(C: Pt, P: Pt): number {
  return Math.atan2(P.y - C.y, P.x - C.x);
}

export function offsetCircleRadius(C: Circle, offset: number): Circle {
  const newR = C.r + offset;
  if (newR < 0) {
    throw new Error('Offset cannot be so negative that it produces a circle with negative radius.');
  }
  return { x: C.x, y: C.y, r: newR };
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

export function flipCircleAboutY(C: Circle): Circle {
  return { x: -C.x, y: C.y, r: C.r };
}

export function flipPointAboutY(P: Pt): Pt {
  return { x: -P.x, y: P.y };
}

export function flipRectAboutY(R: Rectangle): Rectangle {
  const flippedPt1 = flipPointAboutY(R.Pt1);
  const flippedPt2 = flipPointAboutY(R.Pt2);
  return new Rectangle(flippedPt1, flippedPt2);
}


// ======  Complex Geometry ======
export function circleCircleIntersections(C1: Circle, C2: Circle, approx: boolean = true): Pt[] {
  const d = dist(C1, C2);

  // tight, scale-aware tolerance (tweak 1e-12 -> 1e-11 if you still see misses)
  const scale = Math.max(1, C1.r, C2.r, d);
  const eps = approx ? 1e-6 * scale : 0;

  // Only change: allow near-intersection by relaxing the bounds slightly
  if (d > C1.r + C2.r + eps) return [];
  if (d < Math.abs(C1.r - C2.r) - eps) return [];
  if (d <= eps) return [];

  const a = (C1.r * C1.r - C2.r * C2.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.abs(C1.r * C1.r - a * a));

  const xm = C1.x + (a * (C2.x - C1.x)) / d;
  const ym = C1.y + (a * (C2.y - C1.y)) / d;

  const rx = -((C2.y - C1.y) * (h / d));
  const ry =  ((C2.x - C1.x) * (h / d));

  return [
    { x: xm + rx, y: ym + ry },
    { x: xm - rx, y: ym - ry },
  ];
}

// imagine a large outer circle, with a smaller inner circle
// where the inner circle intersects the outer circle at a single tangent point
// now, imagine that the inner circle also has a defined x or y coordinate that it must hit
// we want to solve the position of the inner circle given these conditions 
// vibe code I admit it X_X
export function solveInscribedCircleAlongAxis(C: Circle, r: number, ax: Axis, value: number, pos = true): number {
  const rPrime = C.r - r;
  if (rPrime < 0) throw new Error("No solution: inset larger than radius");

  const Cknown = ax === "x" ? C.x : C.y;
  const d = value - Cknown;

  const under = rPrime * rPrime - d * d;
  if (under < 0) throw new Error("No real solution: knownValue out of range");

  const s = Math.sqrt(under);
  const Cunknown = ax === "x" ? C.y : C.x; // solving the other coordinate
  return pos ? Cunknown + s : Cunknown - s;
}

export function interceptCirclesAndPointCompound(L: Circle, P: Pt, Cr1: number, Cr2: number, Ctheta: number): {C1: Circle, C2: Circle}[] {
  // C1 is externally tangent to L, so its center is always at distance (L.r + Cr1) from L's center.
  // C2 is internally tangent to C1 (since Cr2 < Cr1), so C2's center sits (Cr1 - Cr2) from C1's center
  // along the direction Ctheta — the same direction as the tangent point T on C1's boundary.
  //
  //   T = C1.center + Cr1 * (cos Ctheta, sin Ctheta)       <- tangent point on C1
  //   C2.center = C1.center + (Cr1 - Cr2) * (cos Ctheta, sin Ctheta)
  //
  // The final constraint is that C2 must reach P:
  //   dist(C2.center, P) = Cr2
  //
  // Substituting C2.center = C1.center + offset:
  //   dist(C1.center + offset, P) = Cr2
  //   dist(C1.center, P - offset) = Cr2      <- shift P by -offset
  //
  // So C1's center must lie on TWO circles simultaneously:
  //   1. Circle centered at L       with radius (L.r ± Cr1)   [tangent to L]
  //        - P outside L → C1 outside L → external tangency → L.r + Cr1
  //        - P inside  L → C1 inside  L → internal tangency → L.r - Cr1
  //   2. Circle centered at Q=P-offset with radius Cr2        [C2 reaches P]
  //
  // Their intersections give the two possible C1 centers directly.

  const offset: Pt = {
    x: (Cr1 - Cr2) * Math.cos(Ctheta),
    y: (Cr1 - Cr2) * Math.sin(Ctheta),
  };

  // Shift P back by the offset so we can solve for C1's center directly
  const Q: Pt = { x: P.x - offset.x, y: P.y - offset.y };

  const pInsideL = dist(L, P) < L.r;
  const C1locusRadius = pInsideL ? L.r - Cr1 : L.r + Cr1;
  const C1locus = new Circle(L.x, L.y, C1locusRadius);
  const C2locus = new Circle(Q.x, Q.y, Cr2);

  const C1centers = circleCircleIntersections(C1locus, C2locus);
  if (C1centers.length === 0) return [];

  return C1centers.map(c1Center => {
    const C1: Circle = { ...c1Center, r: Cr1 };
    const C2: Circle = {
      x: c1Center.x + offset.x,
      y: c1Center.y + offset.y,
      r: Cr2,
    };
    return { C1, C2 };
  });
}

export function interceptCirclesAndPoint(L: Circle, P: Pt, Cr: number): Circle[] {
  //  P *
  //     /\ Cr 
  //    / / Cr
  //   / /
  //  / / 
  //  //  <-phi inside that lil triangle
  //  L

  let LP = dist(L, P);
  let outside = LP > L.r
  let LrCr = outside ? Cr + L.r : Math.abs(L.r - Cr);
  
  // we can define and angle gamma from L to P
  let gamma = Math.atan2(P.y - L.y, P.x - L.x);

  // using law of cosines to find small angle phi, which relates 
  // Cr^2 = LP^2 + CrLr^2 - 2*LP*CrLr*cos(phi)
  let phi = Math.acos((LP*LP + LrCr*LrCr - Cr*Cr) / (2 * LP * LrCr));

  // we know that the angle theta, which is the angle from L to C is both the difference and the sum of these angles
  let thetaBig = gamma + phi;
  let thetaSmall = gamma - phi;

  // we can then find the two possible centers for C using these angles and the distance CrLr
  let C1 = { x: L.x + LrCr * Math.cos(thetaBig), y: L.y + LrCr * Math.sin(thetaBig) };
  let C2 = { x: L.x + LrCr * Math.cos(thetaSmall), y: L.y + LrCr * Math.sin(thetaSmall) };

  let solutions = [ { ...C1, r: Cr }, { ...C2, r: Cr } ];


  return solutions;
}

// good math provided here
// https://www.reddit.com/r/Geometry/comments/1k6slsb/how_do_i_create_this_orange_arc_so_that_it_is/
export function findJoiningCircleFromCircleAndPoint(U: Circle, P: Pt): Circle {

  const x = U.x - P.x;
  const y = Math.abs(U.y - P.y);

  // R=(x2+y2-r2)/(2(y-r))
  let Cr = (x*x + y*y - U.r*U.r) / (2 * (y - U.r));
  let Cx = P.x
  let CyPlus = P.y + Cr;
  let CyMinus = P.y - Cr

  // use the Cy value closest to the center of U
  let CyPlusDist = dist(U, {x: Cx, y: CyPlus});
  let CyMinusDist = dist(U, {x: Cx, y: CyMinus});
  
  let Cy = CyPlusDist < CyMinusDist ? CyPlus : CyMinus;

  return { x: Cx, y: Cy, r: Cr };
}

export function findJoiningCircleOfKnownRadius(U: Circle, R: number, max: boolean = true): Circle {
  //        C(0, Cy)
  //        | \
  //        |  \
  // C.r- b |   \ C.r - U.r
  //        |    \
  //        |-----\ (U.x, U.y)
  //     b  |  x   \ U.r
  //        |       
  //        P(0, Cy-C.r)

  // the length b is the defined by the "cutoff" from the center of U
  // we make a right triangle above with two known sides, meaning we can solve the other
  // (C.r-U.r)^2 = (C.r-b)^2 + x^2 

  let RadDiff = R - U.r
  let bPlus = R + Math.sqrt(RadDiff*RadDiff - U.x*U.x);
  let bMinus = R - Math.sqrt(RadDiff*RadDiff - U.x*U.x);
  let b = max ? Math.max(bPlus, bMinus) : Math.min(bPlus, bMinus);
  let Cy = U.y - b + R;

  return { x: 0, y: Cy, r: R };
}

export function inscribeCircleWithinCircle(outerCirle: Circle, innerCircleRadius: number, angle: number): Circle {
  const target = pointOnCircle(outerCirle, angle);
  const distToTarget = dist(target, outerCirle);
  const difference = distToTarget - innerCircleRadius;
  let centerForNewCircle = pointOnCircle({ ...outerCirle, r: difference }, angle);
  let innerCircle = { x: centerForNewCircle.x, y: centerForNewCircle.y, r: innerCircleRadius };
  return innerCircle;

}

// Biarc interpolation — connects two arc endpoints with a G1-continuous S-curve (two arcs tangent at a joint).
// Assumes arcs sweep CCW (increasing angle). For arcs whose concave sides face each other, the result is
// an S-curve: the two joining arcs are externally tangent at their shared joint point.
//
// At side = "end": departure tangent is in arc's forward sweep direction.
// At side = "start": departure tangent is opposite to arc's forward sweep direction.
//
// Reference: Bolton (1975) "Biarc Curves"; Meek & Walton (1992) "Biarc Approximation of NURBS Curves".
// The equal-radius biarc is found by solving 2R²(1+k) + 2R(b−a) − |P1−P2|² = 0.
export function findJoiningArcs(arc1: Arc, side1: "start" | "end", arc2: Arc, side2: "start" | "end", T1Invert = false, T2Invert = false): Arc[] {
  const theta1 = side1 === "end" ? arc1.end : arc1.start;
  const P1: Pt = { x: arc1.x + arc1.r * Math.cos(theta1), y: arc1.y + arc1.r * Math.sin(theta1) };
  const s1 = side1 === "end" ? 1 : -1;
  const T1vec: Pt = { x: s1 * -Math.sin(theta1), y: s1 * Math.cos(theta1) };

  const theta2 = side2 === "start" ? arc2.start : arc2.end;
  const P2: Pt = { x: arc2.x + arc2.r * Math.cos(theta2), y: arc2.y + arc2.r * Math.sin(theta2) };
  const s2 = side2 === "start" ? 1 : -1;
  const T2vec: Pt = { x: s2 * Math.sin(theta2), y: s2 * -Math.cos(theta2) };

  return findJoiningArcsFromTangents(
    P1, Math.atan2(T1vec.y, T1vec.x),
    P2, Math.atan2(T2vec.y, T2vec.x),
    T1Invert, T2Invert,
  );
}

/**
 * Core biarc solve, factored out of findJoiningArcs so callers driven by raw
 * click/snap tangents (e.g. JoinArcTool) can feed it points+tangents directly
 * instead of going through Arc+side. T1/T2 are "departure" tangent angles —
 * pointing away from each curve's own body, into the joint that will be
 * built — matching findJoiningArcs' existing convention (see its side1/side2
 * comment above). `invert1`/`invert2` flip the corresponding departure
 * direction 180°, the same escape hatch findJoiningArcs already exposed.
 */
export function findJoiningArcsFromTangents(P1: Pt, T1: number, P2: Pt, T2: number, invert1 = false, invert2 = false): Arc[] {
  const roots = solveBiarcRoots(P1, T1, P2, T2, invert1, invert2);
  if (roots.length === 0) return [];
  return biarcFromRoot(P1, P2, roots[0].N1, roots[0].N2, Math.min(...roots.map(r => r.R)));
}

/**
 * Every valid equal-radius biarc root for this P1/T1/P2/T2 pair (the quadratic
 * 2R²(1+k) + 2R(b−a) − A² = 0 can have up to two positive solutions — a tight one and a more
 * graceful/open one). Exposed separately from findJoiningArcsFromTangents (which only ever
 * exposed the smaller root) so callers that need to compare candidates — e.g. JoinArcTool,
 * picking whichever combination of root and invert flags actually gives the small, sensible
 * connector rather than an oversized loop — can see all of them instead of just one.
 */
function solveBiarcRoots(P1: Pt, T1: number, P2: Pt, T2: number, invert1: boolean, invert2: boolean): { R: number; N1: Pt; N2: Pt }[] {
  const t1 = invert1 ? T1 + Math.PI : T1;
  const t2 = invert2 ? T2 + Math.PI : T2;
  const T1vec: Pt = { x: Math.cos(t1), y: Math.sin(t1) };
  const T2vec: Pt = { x: Math.cos(t2), y: Math.sin(t2) };

  // Left normals (90° CCW rotation of each tangent) — biarc centers live on these rays from P1/P2
  const N1: Pt = { x: -T1vec.y, y: T1vec.x };
  const N2: Pt = { x: -T2vec.y, y: T2vec.x };

  const A: Pt = { x: P1.x - P2.x, y: P1.y - P2.y };
  const A2 = A.x * A.x + A.y * A.y;
  const a  = A.x * N1.x + A.y * N1.y;  // A · N1
  const b  = A.x * N2.x + A.y * N2.y;  // A · N2
  const k  = N1.x * N2.x + N1.y * N2.y; // N1 · N2

  // Solve 2R²(1+k) + 2R(b−a) − A2 = 0 for the equal-radius biarc
  const qa = 2 * (1 + k);
  const qb = 2 * (b - a);
  const qc = -A2;

  let roots: number[];
  if (Math.abs(qa) < 1e-10) {
    if (Math.abs(qb) < 1e-10) return [];
    roots = [-qc / qb];
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) return [];
    roots = [(-qb + Math.sqrt(disc)) / (2 * qa), (-qb - Math.sqrt(disc)) / (2 * qa)];
  }

  return roots.filter(r => r > 1e-10).map(R => ({ R, N1, N2 }));
}

function biarcFromRoot(P1: Pt, P2: Pt, N1: Pt, N2: Pt, R: number): Arc[] {
  const C1: Pt = { x: P1.x + R * N1.x, y: P1.y + R * N1.y };
  const C2: Pt = { x: P2.x + R * N2.x, y: P2.y + R * N2.y };

  // For equal-radius external tangency, |C1−C2| = 2R and the joint J is the midpoint
  const J: Pt = { x: (C1.x + C2.x) / 2, y: (C1.y + C2.y) / 2 };

  return [
    new Arc(C1.x, C1.y, R, Math.atan2(P1.y - C1.y, P1.x - C1.x), Math.atan2(J.y - C1.y, J.x - C1.x)),
    new Arc(C2.x, C2.y, R, Math.atan2(J.y  - C2.y, J.x  - C2.x), Math.atan2(P2.y - C2.y, P2.x - C2.x)),
  ];
}

/**
 * Every valid equal-radius biarc for this P1/T1/P2/T2 pair and invert combination — i.e. one
 * result per positive root from solveBiarcRoots, instead of collapsing to a single choice like
 * findJoiningArcsFromTangents does. See solveBiarcRoots' comment for why more than one can exist.
 */
export function findAllJoiningArcsFromTangents(P1: Pt, T1: number, P2: Pt, T2: number, invert1 = false, invert2 = false): Arc[][] {
  return solveBiarcRoots(P1, T1, P2, T2, invert1, invert2).map(({ R, N1, N2 }) => biarcFromRoot(P1, P2, N1, N2, R));
}

// ===== Curve math =====

/**
 * Solves the catenary shape parameter `a` for a given sag `H` and span `L`.
 * Uses bisection: a * (cosh(L / 2a) − 1) = H.
 */
// Station sweeps re-solve the same arch hundreds of times per redraw; the
// bisection is 64 cosh evaluations, so a single-entry memo pays for itself.
let lastCatenary: { H: number; L: number; a: number } | null = null;
export function solveCatenaryA(H: number, L: number): number {
  if (lastCatenary && lastCatenary.H === H && lastCatenary.L === L) return lastCatenary.a;
  const f = (a: number): number => a * (Math.cosh(L / (2 * a)) - 1) - H;
  let lo = L * 1e-4;
  let hi = L * 1e4;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    f(mid) > 0 ? (lo = mid) : (hi = mid);
  }
  const a = (lo + hi) / 2;
  lastCatenary = { H, L, a };
  return a;
}

/**
 * 1-D shape-preserving cubic spline (Fritsch–Carlson monotone Hermite, a.k.a.
 * PCHIP): given strictly-increasing `ys[]` and values `zs[]`, returns z(y).
 *
 * Chosen over a natural cubic spline because it never overshoots the data. A
 * natural spline enforces C² continuity, and buys it by rising above the knots
 * it passes through: three knots at equal height following a steep rise come
 * out as a hump-dip-hump ripple rather than the flat the values describe. Here
 * the knot slopes are instead derived from the neighbouring secants and clamped
 * to their sign, so a run of equal values gets zero slope at each end and the
 * segment between them is genuinely flat. The cost is C¹ rather than C²
 * continuity — curvature can step at a knot, which reads as a soft crease only
 * where the data itself turns sharply.
 */
export function makeMonotoneSpline(ys: number[], zs: number[]): (y: number) => number {
  const n = ys.length - 1;
  if (n < 1) return () => zs[0] ?? 0;

  const h: number[]     = ys.slice(0, n).map((v, i) => ys[i + 1] - v);
  const delta: number[] = h.map((hi, i) => (zs[i + 1] - zs[i]) / hi);

  // Interior slopes: zero at any local extremum (sign change or flat secant),
  // otherwise the weighted harmonic mean of the two secants — the Fritsch–Carlson
  // choice, which is the largest slope that still keeps the segment monotone.
  const m: number[] = new Array(n + 1).fill(0);
  for (let i = 1; i < n; i++) {
    if (delta[i - 1] * delta[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
  }
  m[0] = n === 1 ? delta[0] : endSlope(h[0], h[1], delta[0], delta[1]);
  m[n] = n === 1 ? delta[0] : endSlope(h[n - 1], h[n - 2], delta[n - 1], delta[n - 2]);

  return (y: number): number => {
    let i = 0;
    while (i < n - 1 && ys[i + 1] <= y) i++;
    const hi = h[i];
    const t  = (y - ys[i]) / hi;
    const t2 = t * t;
    const t3 = t2 * t;
    // Cubic Hermite basis on the unit interval.
    return (2 * t3 - 3 * t2 + 1) * zs[i]
         + (t3 - 2 * t2 + t) * hi * m[i]
         + (-2 * t3 + 3 * t2) * zs[i + 1]
         + (t3 - t2) * hi * m[i + 1];
  };
}

/**
 * End-knot slope for {@link makeMonotoneSpline}: the one-sided three-point
 * estimate, then clipped — to zero if it disagrees in sign with the end secant,
 * and to 3× the end secant where the neighbouring secants turn, which is the
 * limit past which the end segment would overshoot.
 */
function endSlope(hEnd: number, hNext: number, dEnd: number, dNext: number): number {
  const s = ((2 * hEnd + hNext) * dEnd - hEnd * dNext) / (hEnd + hNext);
  if (s * dEnd <= 0) return 0;
  if (dEnd * dNext <= 0 && Math.abs(s) > 3 * Math.abs(dEnd)) return 3 * dEnd;
  return s;
}
/** True when angle θ lies on the drawn (minor) span between the arc's start and end — see pathFromArc. */
export function angleOnDrawnArc(arc: Arc, theta: number): boolean {
  const TWO_PI = Math.PI * 2;
  const diff = ((arc.end - arc.start) % TWO_PI + TWO_PI) % TWO_PI;
  const from = diff <= Math.PI ? arc.start : arc.end;
  const span = diff <= Math.PI ? diff : TWO_PI - diff;
  const rel = ((theta - from) % TWO_PI + TWO_PI) % TWO_PI;
  const eps = 1e-9;
  return rel <= span + eps || rel >= TWO_PI - eps;
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

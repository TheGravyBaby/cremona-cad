import { Pt, Pt3D, Circle } from "../../models/types";
import { TURN, normalizeRadians, clamp, closestPointOnSegment, cubicBezierPoint } from "./simpleGeometry";
import { arcTangentToLine, arcBetweenTravels } from "./draftMath";

// ===== Arc/line closed-form inverses =====
// Harmonic-fit solves: the raw radius from arcTangentToLine/arcBetweenTravels is transcendental
// in the unknown angle, but always of the form a + b·cos(θ) + c·sin(θ) — three samples pin that
// harmonic exactly, turning "solve for the angle" into "intersect a line with the unit circle".
// Closed form, no iteration, but a level past anything a compass and straightedge does.

// inverse of arcTangentToLine: radius is given, sweep is the unknown. arcTangentToLine's raw
// r = numer(travel)/denom(travel) is transcendental in the sweep that sets `travel` — but numer
// and denom are each of the form a + b·cos(sweep) + c·sin(sweep), so their difference at a chosen
// target radius is too. Three samples pin that harmonic exactly, turning "solve for sweep" into
// "intersect a line with the unit circle" — closed form, no iteration.
export function sweepForTangentLineRadius(
  P: Pt, travel: number, radius: number, turnSign: 1 | -1,
  A: Pt, lineDir: Pt, targetRadius: number,
): number | null {
  const start0 = travel - turnSign * TURN.quarter;
  const exit = Math.atan2(lineDir.y, lineDir.x);
  const mx = -lineDir.y, my = lineDir.x;

  const pointAt = (s: number): Pt =>
    new Pt(P.x + radius * (Math.cos(start0 + s) - Math.cos(start0)), P.y + radius * (Math.sin(start0 + s) - Math.sin(start0)));

  // numer(s) - target·denom(s), zero where the tangent-to-line solve's raw radius is `target`
  const h = (s: number, target: number): number => {
    const t = travel + s, pt = pointAt(s);
    const nx = -Math.sin(t) + Math.sin(exit), ny = Math.cos(t) - Math.cos(exit);
    return mx * (A.x - pt.x) + my * (A.y - pt.y) - target * (mx * nx + my * ny);
  };

  // fold into (-π, π]; a valid sweep shares turnSign's sign and stays short of a full reversal
  const fold = (s: number): number => {
    const n = normalizeRadians(s);
    return n > TURN.half ? n - TURN.full : n;
  };
  const EPS = 1e-6;
  const inRange = (s: number) => Math.sign(s) === turnSign && Math.abs(s) > EPS && Math.abs(s) < TURN.half - EPS;

  // the raw (signed) solve only ever hits +target on the direct branch; the reflex branch (the
  // other tangent circle, arcTangentToLine's r < 0 case) shows up at -target instead
  for (const target of [targetRadius, -targetRadius]) {
    const a0 = h(0, target), aHalf = h(TURN.quarter, target), aPi = h(TURN.half, target);
    const a = (a0 + aPi) / 2, b = a0 - a, c = aHalf - a;
    const R = Math.hypot(b, c);
    if (R < 1e-9 || Math.abs(a) > R + 1e-9) continue;

    const delta = Math.atan2(c, b);
    const offset = Math.acos(clamp(-a / R, -1, 1));
    // the raw solve hits the target radius on the reflex turn too, which arcTangentToLine cannot
    // build — so a candidate only counts once that closing arc actually comes back
    const candidates = [fold(delta + offset), fold(delta - offset)].filter(inRange)
      .filter(s => arcTangentToLine(pointAt(s), travel + s, A, lineDir) != null);
    if (candidates.length) return candidates.reduce((best, s) => Math.abs(s) < Math.abs(best) ? s : best);
  }
  return null;
}

// inverse of arcBetweenTravels when the target is a point on a circle rather than a fixed point:
// entry ray (P, travel) is fixed, target is pointOnCircle(circle, theta) with tangent theta +
// turnSign·π/2 — theta is the unknown, angle rather than length or sweep this time, but the same
// shape carries over: arcBetweenTravels' raw radius is numer(theta)/denom(theta) with both numer
// and denom affine in (cos theta, sin theta), so the target-radius root is too. Found the same
// closed-form way, then simply handed to arcBetweenTravels to confirm and build — cheaper and
// safer than re-deriving its run/sign validity checks a second time.
export function angleForBridgeRadius(
  P: Pt, travel: number, circle: Circle, turnSign: 1 | -1, targetRadius: number,
): number | null {
  const ux = Math.cos(travel), uy = Math.sin(travel);

  const pointAt = (theta: number): Pt =>
    new Pt(circle.x + circle.r * Math.cos(theta), circle.y + circle.r * Math.sin(theta));

  // raw numer/denom of arcBetweenTravels' radius, with the target point read off the circle
  const h = (theta: number, target: number): number => {
    const exit = theta + turnSign * TURN.quarter, pt = pointAt(theta);
    const ex = Math.sin(exit) - Math.sin(travel), ey = Math.cos(travel) - Math.cos(exit);
    const denom = ux * ey - uy * ex;
    const dx = pt.x - P.x, dy = pt.y - P.y;
    return (dy * ux - dx * uy) - target * denom;
  };

  for (const target of [targetRadius, -targetRadius]) {
    const a0 = h(0, target), aHalf = h(TURN.quarter, target), aPi = h(TURN.half, target);
    const a = (a0 + aPi) / 2, b = a0 - a, c = aHalf - a;
    const R = Math.hypot(b, c);
    if (R < 1e-9 || Math.abs(a) > R + 1e-9) continue;

    const delta = Math.atan2(c, b);
    const offset = Math.acos(clamp(-a / R, -1, 1));
    for (const theta of [normalizeRadians(delta + offset), normalizeRadians(delta - offset)]) {
      const exit = theta + turnSign * TURN.quarter;
      const bridged = arcBetweenTravels(P, travel, pointAt(theta), exit);
      if (bridged && Math.abs(bridged.arc.r - Math.abs(targetRadius)) < 1e-6) return theta;
    }
  }
  return null;
}

// ===== Polyline nearest-point index =====
// Built for dense batch queries (contour grids, wireframe strips, STL export) where a single
// O(N) distance-to-polyline scan per query would make the whole sweep quadratic.

/** Distance from a point to a closed polyline (last point connects back to the first). */
export function distPointToPolyline(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = closestPointOnSegment(p, poly[i], poly[(i + 1) % poly.length]).dist;
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

// squared distance from `p` to cell (x, y)'s box: a cell farther than the best segment found
// can hold nothing nearer, so its segments are never measured
function cellGapSq(idx: PolylineIndex, p: Pt, x: number, y: number): number {
  const left = idx.minX + x * idx.cellSize, bottom = idx.minY + y * idx.cellSize;
  const dx = Math.max(left - p.x, 0, p.x - left - idx.cellSize);
  const dy = Math.max(bottom - p.y, 0, p.y - bottom - idx.cellSize);
  return dx * dx + dy * dy;
}

/**
 * The first Chebyshev ring around cell (ci, cj) that can contain any in-bounds cell — the
 * Chebyshev distance from that cell to the grid box, and 0 for a query already inside it.
 *
 * Rings below this one lie entirely outside the grid, so scanning them finds nothing while
 * still costing O(r) bounds checks each. The early-out in the scans below can't fire while
 * `best` is Infinity, so without this a distant query walks every empty ring in between.
 */
export function ringReachingGrid(ci: number, cj: number, cols: number, rows: number): number {
  const outX = Math.max(0 - ci, ci - (cols - 1), 0);
  const outY = Math.max(0 - cj, cj - (rows - 1), 0);
  return Math.max(outX, outY);
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
    if (cells[y * cols + x].length === 0 || cellGapSq(idx, p, x, y) >= best * best) return;
    for (const i of cells[y * cols + x]) {
      const d = closestPointOnSegment(p, poly[i], poly[(i + 1) % poly.length]).dist;
      if (d < best) best = d;
    }
  };
  const scanRow = (y: number, x0: number, x1: number): void => {
    if (y < 0 || y >= rows) return;
    for (let x = Math.max(x0, 0), xe = Math.min(x1, cols - 1); x <= xe; x++) scanCell(x, y);
  };
  const scanCol = (x: number, y0: number, y1: number): void => {
    if (x < 0 || x >= cols) return;
    for (let y = Math.max(y0, 0), ye = Math.min(y1, rows - 1); y <= ye; y++) scanCell(x, y);
  };

  for (let r = ringReachingGrid(ci, cj, cols, rows); r <= maxRing; r++) {
    if (r === 0) {
      if (ci >= 0 && ci < cols && cj >= 0 && cj < rows) scanCell(ci, cj);
    } else {
      scanRow(cj - r, ci - r, ci + r);
      scanRow(cj + r, ci - r, ci + r);
      scanCol(ci - r, cj - r + 1, cj + r - 1);
      scanCol(ci + r, cj - r + 1, cj + r - 1);
    }
    if (best <= r * cellSize) break;
  }
  return best;
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
    if (cells[y * cols + x].length === 0 || cellGapSq(idx, p, x, y) >= best * best) return;
    for (const i of cells[y * cols + x]) {
      const r = closestPointOnSegment(p, poly[i], poly[(i + 1) % poly.length]);
      if (r.dist < best) { best = r.dist; bestPt = r.point; }
    }
  };
  const scanRow = (y: number, x0: number, x1: number): void => {
    if (y < 0 || y >= rows) return;
    for (let x = Math.max(x0, 0), xe = Math.min(x1, cols - 1); x <= xe; x++) scanCell(x, y);
  };
  const scanCol = (x: number, y0: number, y1: number): void => {
    if (x < 0 || x >= cols) return;
    for (let y = Math.max(y0, 0), ye = Math.min(y1, rows - 1); y <= ye; y++) scanCell(x, y);
  };

  for (let r = ringReachingGrid(ci, cj, cols, rows); r <= maxRing; r++) {
    if (r === 0) {
      if (ci >= 0 && ci < cols && cj >= 0 && cj < rows) scanCell(ci, cj);
    } else {
      scanRow(cj - r, ci - r, ci + r);
      scanRow(cj + r, ci - r, ci + r);
      scanCol(ci - r, cj - r + 1, cj + r - 1);
      scanCol(ci + r, cj - r + 1, cj + r - 1);
    }
    if (best <= r * cellSize) break;
  }
  return { dist: best, point: bestPt };
}

/** Running length along an open polyline: `cum[i]` is how far poly[i] is from poly[0]. */
export function polylineCumulativeLengths(poly: Pt[]): number[] {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
  return cum;
}

/** The nearest point of an open polyline to `p`, given as its length along the polyline. */
export function projectOntoPolyline(p: Pt, poly: Pt[], cum: number[]): { s: number; dist: number } {
  let best = { s: 0, dist: poly.length ? Math.hypot(p.x - poly[0].x, p.y - poly[0].y) : Infinity };
  for (let i = 0; i < poly.length - 1; i++) {
    const r = closestPointOnSegment(p, poly[i], poly[i + 1]);
    if (r.dist < best.dist) {
      best = { s: cum[i] + Math.hypot(r.point.x - poly[i].x, r.point.y - poly[i].y), dist: r.dist };
    }
  }
  return best;
}

/** The point `s` along an open polyline, clamped to its ends. */
export function pointAtPolylineLength(poly: Pt[], cum: number[], s: number): Pt {
  const total = cum[cum.length - 1];
  const t = clamp(s, 0, total);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= t) lo = mid; else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  const f = span > 0 ? (t - cum[lo]) / span : 0;
  return { x: poly[lo].x + (poly[hi].x - poly[lo].x) * f, y: poly[lo].y + (poly[hi].y - poly[lo].y) * f };
}

// the curve's direction at each sample, off the samples either side, set against the way to `p`
// by `measure` — whose sign changes then mark where the two line up the way that was asked for
function samplesAgainstPoint(p: Pt, poly: Pt[], measure: (vx: number, vy: number, dx: number, dy: number) => number): number[] {
  const n = poly.length, out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const q = poly[i], a = poly[Math.max(0, i - 1)], b = poly[Math.min(n - 1, i + 1)];
    out[i] = measure(q.x - p.x, q.y - p.y, b.x - a.x, b.y - a.y);
  }
  return out;
}

/**
 * Where a line from `p` just touches a sampled curve: the places the curve's own direction lines
 * up with the way back to `p`, found as sign changes of their cross product and placed between
 * the two samples by interpolating it. A point on the curve itself isn't reported — the cross
 * product only touches zero there, it doesn't change sign.
 */
export function tangentPointsFromPointToPolyline(p: Pt, poly: Pt[]): Pt[] {
  if (poly.length < 3) return [];
  return signChanges(poly, samplesAgainstPoint(p, poly, (vx, vy, dx, dy) => vx * dy - vy * dx));
}

/**
 * Where a line from `p` meets a sampled curve square: the same search as the tangent one, on the
 * dot product instead. Not a per-segment projection test — seen from near its centre of
 * curvature, a whole run of a curve's segments would each pass that, the true foot among them.
 * Needs samples close together along straight stretches too, so a corner's chord doesn't stand in
 * for the edges either side of it.
 */
export function perpendicularFeetOnPolyline(p: Pt, poly: Pt[]): Pt[] {
  if (poly.length < 3) return [];
  return signChanges(poly, samplesAgainstPoint(p, poly, (vx, vy, dx, dy) => vx * dx + vy * dy));
}

function signChanges(poly: Pt[], f: number[]): Pt[] {
  const n = poly.length;
  const out: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {
    if (f[i] === 0) continue;
    // a zero on a sample only counts if the sign really changes across it
    if (f[i + 1] === 0) {
      if (i + 2 < n && f[i + 2] !== 0 && Math.sign(f[i + 2]) !== Math.sign(f[i])) out.push(poly[i + 1]);
      continue;
    }
    if (Math.sign(f[i]) === Math.sign(f[i + 1])) continue;
    const t = f[i] / (f[i] - f[i + 1]);
    out.push({ x: poly[i].x + (poly[i + 1].x - poly[i].x) * t, y: poly[i].y + (poly[i + 1].y - poly[i].y) * t });
  }
  return out;
}

/** The stretch of an open polyline from length `a` to length `b`, walked in that order — so
 * `b < a` comes back reversed. */
export function slicePolyline(poly: Pt[], cum: number[], a: number, b: number): Pt[] {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const out = [pointAtPolylineLength(poly, cum, lo)];
  for (let i = 0; i < poly.length; i++) {
    if (cum[i] > lo && cum[i] < hi) out.push(poly[i]);
  }
  out.push(pointAtPolylineLength(poly, cum, hi));
  return b < a ? out.reverse() : out;
}

// the part of a polyline at or above height y, or at or below it, with the crossing interpolated in
export function clipPolylineAtY(pts: Pt3D[], y: number, keep: 'above' | 'below'): Pt3D[] {
  const kept = (pt: Pt3D) => keep === 'above' ? pt.y >= y : pt.y <= y;
  const out: Pt3D[] = [];
  for (let k = 0; k < pts.length; k++) {
    const pt = pts[k];
    const last = pts[k - 1];
    if (last && kept(last) !== kept(pt)) {
      const t = (y - last.y) / (pt.y - last.y);
      out.push(new Pt3D(last.x + (pt.x - last.x) * t, y, last.z + (pt.z - last.z) * t));
    }
    if (kept(pt)) out.push(pt);
  }
  return out;
}

// where a polyline first passes height y, or null where it never does
export function polylinePointAtY(pts: Pt3D[], y: number): Pt3D | null {
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    if (a.y === b.y || (a.y - y) * (b.y - y) > 0) continue;
    const t = (y - a.y) / (b.y - a.y);
    return new Pt3D(a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t);
  }
  return null;
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

// The fair curve a thin even strip takes bent through pins, as cubic Bézier spans [from, c1, c2, to].
// A spline parametrised by length along the strip with free ends (no bend past the end pins),
// or wrapped round for a loop. Each pass re-fits against the length the last pass actually ran
// between pins, which moves it off the chord-length first guess towards the strip's own shape.
export function battenBeziers(pins: Pt[], closed: boolean): [Pt, Pt, Pt, Pt][] {
  const pts = pins.filter((p, i) => i === 0 || Math.hypot(p.x - pins[i - 1].x, p.y - pins[i - 1].y) > 1e-9);
  if (closed && pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-9) pts.pop();
  if (pts.length < 2) return [];
  const loop = closed && pts.length >= 3;
  const spans = loop ? pts.length : pts.length - 1;
  const knot = (i: number) => pts[i % pts.length];
  if (spans === 1) {
    const [a, b] = pts;
    return [[a, { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 }, { x: a.x + 2 * (b.x - a.x) / 3, y: a.y + 2 * (b.y - a.y) / 3 }, b]];
  }

  const slopes = (h: number[], values: number[]): number[] => {
    const delta = h.map((hi, i) => (values[(i + 1) % values.length] - values[i]) / hi);
    if (!loop) return naturalSplineSlopes(h, delta);
    const n = values.length;
    const rows = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const rhs = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      const prev = (i + n - 1) % n;
      rows[i][prev] += 1 / h[prev];
      rows[i][i] += 2 * (1 / h[prev] + 1 / h[i]);
      rows[i][(i + 1) % n] += 1 / h[i];
      rhs[i] = 3 * (delta[prev] / h[prev] + delta[i] / h[i]);
    }
    return solveDense(rows, rhs) ?? new Array<number>(n).fill(0);
  };

  let h = Array.from({ length: spans }, (_, i) => Math.hypot(knot(i + 1).x - knot(i).x, knot(i + 1).y - knot(i).y));
  let beziers: [Pt, Pt, Pt, Pt][] = [];
  for (let pass = 0; pass < 4; pass++) {
    const mx = slopes(h, pts.map(p => p.x)), my = slopes(h, pts.map(p => p.y));
    beziers = h.map((hi, i) => {
      const j = (i + 1) % pts.length;
      const a = knot(i), b = knot(i + 1);
      return [a, { x: a.x + mx[i] * hi / 3, y: a.y + my[i] * hi / 3 }, { x: b.x - mx[j] * hi / 3, y: b.y - my[j] * hi / 3 }, b];
    });
    h = beziers.map(([a, c1, c2, b]) => {
      let len = 0, prev = a;
      for (let k = 1; k <= 16; k++) {
        const p = cubicBezierPoint(a, c1, c2, b, k / 16);
        len += Math.hypot(p.x - prev.x, p.y - prev.y);
        prev = p;
      }
      return len;
    });
  }
  return beziers;
}

/** Piecewise cubic Hermite through `zs` with knot slopes `m` — the shared tail of both splines below. */
export function hermiteEvaluator(
  ys: number[], zs: number[], h: number[], m: number[],
): (y: number) => number {
  const n = ys.length - 1;
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
 * Knot slopes of the natural cubic spline through the data — the C² choice, the
 * unfiltered half of {@link makeMonotoneSpline}. Takes the interval widths `h`
 * and secants `delta` the caller already computed.
 *
 * Enforcing C² across every knot gives one linear equation per knot, closed at
 * the two ends by the natural condition z''= 0. In slope form that system is
 * tridiagonal and strictly diagonally dominant, so the Thomas algorithm solves
 * it in one forward sweep and one back-substitution with no pivoting.
 */
export function naturalSplineSlopes(h: number[], delta: number[]): number[] {
  const n = h.length;
  const sub  = new Array<number>(n + 1).fill(0); // below the diagonal
  const diag = new Array<number>(n + 1).fill(0);
  const sup  = new Array<number>(n + 1).fill(0); // above the diagonal
  const rhs  = new Array<number>(n + 1).fill(0);

  // Natural end: 2·m₀ + m₁ = 3·δ₀, and its mirror at the far end.
  diag[0] = 2 / h[0];   sup[0] = 1 / h[0];   rhs[0] = 3 * delta[0] / h[0];
  for (let i = 1; i < n; i++) {
    sub[i]  = 1 / h[i - 1];
    diag[i] = 2 * (1 / h[i - 1] + 1 / h[i]);
    sup[i]  = 1 / h[i];
    rhs[i]  = 3 * (delta[i - 1] / h[i - 1] + delta[i] / h[i]);
  }
  sub[n] = 1 / h[n - 1];   diag[n] = 2 / h[n - 1];   rhs[n] = 3 * delta[n - 1] / h[n - 1];

  for (let i = 1; i <= n; i++) {
    const w = sub[i] / diag[i - 1];
    diag[i] -= w * sup[i - 1];
    rhs[i]  -= w * rhs[i - 1];
  }
  const m = new Array<number>(n + 1).fill(0);
  m[n] = rhs[n] / diag[n];
  for (let i = n - 1; i >= 0; i--) m[i] = (rhs[i] - sup[i] * m[i + 1]) / diag[i];
  return m;
}

/**
 * Hyman's monotonicity filter: clips each slope to the largest magnitude that
 * still keeps its two adjoining segments monotone, and to zero at a local
 * extremum (where the secants change sign, or either one is flat).
 *
 * The bound is Fritsch–Carlson's sufficient condition — with every slope held to
 * 3·min(|δₗ|, |δᵣ|), both ends of any segment sit within 3·|δ| of it, which is
 * what rules out an interior overshoot. Slopes already inside the bound pass
 * through untouched, so a curve whose natural fit never overshot keeps its full
 * C² continuity; only the knots that would have rung are dropped to C¹.
 */
export function hymanFilterSlopes(m: number[], h: number[], delta: number[]): number[] {
  const n = h.length;
  const out = m.slice();
  for (let i = 0; i <= n; i++) {
    // The ends have one secant, so it stands in for both — matching the interior
    // rule's behaviour of clipping to 3× the only secant that constrains it.
    const dL = delta[i > 0 ? i - 1 : 0];
    const dR = delta[i < n ? i : n - 1];
    if (dL * dR <= 0) { out[i] = 0; continue; }
    const bound = 3 * Math.min(Math.abs(dL), Math.abs(dR));
    out[i] = Math.sign(dL) * Math.min(Math.abs(out[i]), bound);
    if (out[i] * dL <= 0) out[i] = 0;
  }
  return out;
}

/**
 * Gauss–Jordan with partial pivoting. Dense on purpose: the pinned-slope row
 * destroys the tridiagonal structure the natural spline enjoys, and a cross
 * arch carries a handful of knots, so the cubic cost is nothing next to the
 * clarity of not maintaining a special-cased banded solver.
 */
export function solveDense(rows: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const m = rows.map((r, i) => [...r, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      if (f === 0) continue;
      for (let k = col; k <= n; k++) m[r][k] -= f * m[col][k];
    }
  }
  return m.map((r, i) => r[n] / r[i]);
}

/**
 * The same curve *before* the monotonicity filter: a natural cubic spline, C²
 * at every knot rather than only where the filter left it alone.
 *
 * The filter is not free, and what it costs is exactly curvature continuity —
 * it buys the no-overshoot guarantee by clamping knot slopes, and a clamped
 * slope is a knot where the second derivative steps. On a flat graph that is
 * invisible. On a rendered surface it is a crease running along the locus of
 * that knot, because specular shading reads curvature, and it is why an
 * asymmetric cross arch shows a line down its ridge while a symmetric one does
 * not: with symmetric data the filter has nothing to clamp.
 *
 * The trade is real and the caller must be able to live with it. A natural
 * spline through steep or unevenly spaced data can rise above the knots it
 * passes through. Check the result — see `naturalSplineOvershoot` in
 * ceruti-arch-geometry, which is what decides between the two there.
 */
export function makeNaturalSpline(ys: number[], zs: number[]): (y: number) => number {
  const n = ys.length - 1;
  if (n < 1) return () => zs[0] ?? 0;

  const h: number[]     = ys.slice(0, n).map((v, i) => ys[i + 1] - v);
  const delta: number[] = h.map((hi, i) => (zs[i + 1] - zs[i]) / hi);
  return hermiteEvaluator(ys, zs, h, naturalSplineSlopes(h, delta));
}

/**
 * 1-D shape-preserving cubic spline: given strictly-increasing `ys[]` and values
 * `zs[]`, returns z(y). Never overshoots the data, and is curvature-continuous
 * everywhere it can be.
 *
 * A plain natural cubic spline buys its C² continuity by rising above the knots
 * it passes through, turning three equal-height knots after a steep rise into a
 * hump-dip-hump ripple. Fritsch–Carlson (PCHIP) fixes that by deriving every
 * slope from the neighbouring secants, but only ever achieves C¹ — curvature
 * *steps* at each knot, which on a domed profile (a cross arch) reads as a
 * string of little bumps and dips no amount of control-point nudging removes.
 *
 * So: take the natural spline's C² slopes, then pass them through Hyman's
 * monotonicity filter (see {@link hymanFilterSlopes}). The filter only engages
 * where a natural spline would actually have overshot, so a flat run stays
 * genuinely flat and a dome comes out fully curvature-continuous.
 *
 * Reference: Hyman (1983), "Accurate Monotonicity Preserving Cubic Interpolation",
 * SIAM J. Sci. Stat. Comput. 4(4).
 */
export function makeMonotoneSpline(ys: number[], zs: number[]): (y: number) => number {
  const n = ys.length - 1;
  if (n < 1) return () => zs[0] ?? 0;

  const h: number[]     = ys.slice(0, n).map((v, i) => ys[i + 1] - v);
  const delta: number[] = h.map((hi, i) => (zs[i + 1] - zs[i]) / hi);
  return hermiteEvaluator(ys, zs, h, hymanFilterSlopes(naturalSplineSlopes(h, delta), h, delta));
}

/**
 * Cubic spline through the data, C² at *every* knot, with the slope at knot
 * `flat` pinned to zero — a curvature-continuous curve with a genuine smooth
 * extremum exactly where the caller asked for one.
 *
 * The two conditions fight over the same freedom, and understanding why is the
 * whole design. A cubic Hermite has one slope unknown per knot; C² at each
 * interior knot plus one condition per end uses every one of them. Adding
 * `m[flat] = 0` is one equation too many, which is exactly why
 * {@link makeMonotoneSpline} cannot have both: its filter pins the slope and
 * *drops* C² there, leaving a curvature step that a rendered surface shows as a
 * crease along that knot.
 *
 * The room is made by giving up one end condition instead. That keeps C²
 * everywhere and the pinned slope, and costs only the natural (z''= 0)
 * behaviour at one end — no discontinuity, since an end condition sets how the
 * curve leaves the data rather than joining two pieces of it.
 *
 * Which end, though, is a choice the data does not make, and choosing one would
 * make a symmetric problem come out asymmetric. So it is solved both ways and
 * averaged. Both solutions satisfy every C² equation and the pinned slope, and
 * those are linear, so the average satisfies them too — it differs only in
 * meeting the average of the two end conditions. Symmetric data therefore gives
 * a symmetric curve, and the centred case comes out bit-identical to the
 * monotone spline.
 *
 * No overshoot guarantee whatsoever: that is what the filter was buying. The
 * caller must check the result and fall back.
 *
 * Returns null when the data is too short to constrain (fewer than two
 * intervals) or the system is singular.
 */
export function makeC2SplineWithFlatKnot(
  ys: number[], zs: number[], flat: number,
): ((y: number) => number) | null {
  const n = ys.length - 1;
  if (n < 2 || flat <= 0 || flat >= n) return null;

  const h: number[] = ys.slice(0, n).map((v, i) => ys[i + 1] - v);
  const delta: number[] = h.map((hi, i) => (zs[i + 1] - zs[i]) / hi);

  // C² at every interior knot, the pinned slope, and one end condition.
  const solveWith = (naturalAtStart: boolean): number[] | null => {
    const rows: number[][] = [];
    const rhs: number[] = [];
    if (naturalAtStart) {
      const r = new Array<number>(n + 1).fill(0);
      r[0] = 2; r[1] = 1;
      rows.push(r); rhs.push(3 * delta[0]);
    }
    for (let i = 1; i < n; i++) {
      const r = new Array<number>(n + 1).fill(0);
      r[i - 1] = h[i];
      r[i] = 2 * (h[i - 1] + h[i]);
      r[i + 1] = h[i - 1];
      rows.push(r); rhs.push(3 * (h[i] * delta[i - 1] + h[i - 1] * delta[i]));
    }
    if (!naturalAtStart) {
      const r = new Array<number>(n + 1).fill(0);
      r[n - 1] = 1; r[n] = 2;
      rows.push(r); rhs.push(3 * delta[n - 1]);
    }
    const pin = new Array<number>(n + 1).fill(0);
    pin[flat] = 1;
    rows.push(pin); rhs.push(0);
    return solveDense(rows, rhs);
  };

  const a = solveWith(true);
  const b = solveWith(false);
  if (!a || !b) return null;
  const m = a.map((v, i) => (v + b[i]) / 2);
  if (m.some(v => !Number.isFinite(v))) return null;
  return hermiteEvaluator(ys, zs, h, m);
}

/** Where a ray from `from` heading `angle` first crosses a polyline, and the index of the vertex
 * that ends the segment it crosses. Null when it never does. */
export function rayPolylineIntersection(from: Pt, angle: number, polyline: Pt[]): { point: Pt; index: number } | null {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let nearest = Infinity;
  let hit: { point: Pt; index: number } | null = null;
  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1], b = polyline[i];
    const ex = b.x - a.x, ey = b.y - a.y;
    const cross = dx * ey - dy * ex;
    if (Math.abs(cross) < 1e-12) continue;
    const alongRay = ((a.x - from.x) * ey - (a.y - from.y) * ex) / cross;
    const alongSegment = ((a.x - from.x) * dy - (a.y - from.y) * dx) / cross;
    if (alongRay <= 0 || alongRay >= nearest || alongSegment < 0 || alongSegment > 1) continue;
    nearest = alongRay;
    hit = { point: { x: from.x + dx * alongRay, y: from.y + dy * alongRay }, index: i };
  }
  return hit;
}

// ===== Oblique projection =====

// an orthographic view of x, y, z points rotated about `yPivot` on the y axis, Z then X then Y, the
// three matrices pre-multiplied into two rows so a point costs six multiplies. At zero rotation it is
// the plan view. zAmp is folded into the matrix so the three rotations stay geometrically coherent
export function buildProjection(
  yOffset: number, yPivot: number,
  rotXDeg: number, rotYDeg: number, rotZDeg: number,
  zAmp = 1, xOffset = 0,
): (x: number, y: number, z: number) => [number, number] {
  const rx = rotXDeg * TURN.degree, ry = rotYDeg * TURN.degree, rz = rotZDeg * TURN.degree;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  // rows 0 and 1 of Ry * Rx * Rz; row 2 is depth and drops out of an orthographic view
  const m00 =  cy * cz + sy * sz * sx;
  const m01 = -cy * sz + sy * cz * sx;
  const m02 =  sy * cx * zAmp;
  const m10 =  sz * cx;
  const m11 =  cz * cx;
  const m12 = -sx * zAmp;

  const yCenter = yOffset + yPivot;

  return (x: number, y: number, z: number): [number, number] => {
    const py = y - yPivot;
    return [
      xOffset + m00 * x + m01 * py + m02 * z,
      yCenter + m10 * x + m11 * py + m12 * z,
    ];
  };
}

// the bounding box of 3D points through a projection, in the projection's own coordinates
export function projectedBounds(proj: (x: number, y: number, z: number) => [number, number], pts: Iterable<Pt3D>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of pts) {
    const [sx, sy] = proj(pt.x, pt.y, pt.z);
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }
  return { minX, minY, maxX, maxY };
}

// arch curves: heights along a catenary, trochoid or spline arch, and the knots a spline passes through

/**
 * A trochoid arch point in the windowed parametrisation, returned as
 * normalised (x, z) both in [0, 1] for the fractional position `frac ∈ [0, 1]`.
 *
 * `pct ∈ (0, 1]` selects the central fraction of the full cusp-to-cusp arch
 * (t ∈ [0, 2π]) stretched across the span. pct=1 is the full arch, whose edges
 * leave the baseline tangent (flat takeoff). Smaller pct clips the flat cusp
 * ends for a nonzero takeoff slope, so a fluting channel can meet the arch at
 * more than a grazing angle. The peak stays centred at frac=0.5.
 *
 * `frac` is linear in the generating parameter t, not in x — so stepping it
 * uniformly clusters points where the curve bends hardest (near the cusps),
 * which is what a sampler wants and a uniform-in-x walk would miss.
 */
export function trochoidNorm(frac: number, d: number, pct: number): { x: number; z: number } {
  const t0 = (1 - pct) * TURN.half;
  const t1 = TURN.full - t0;
  const t = t0 + frac * (t1 - t0);
  const xRaw = (tt: number) => tt - d * Math.sin(tt);
  const x0 = xRaw(t0);
  const denom = xRaw(t1) - x0;
  const c0 = Math.cos(t0);
  return {
    // pct=1: (t - d·sin t)/2π ; z: (1 - cos t)/2 — the classic normalisation.
    x: denom !== 0 ? (xRaw(t) - x0) / denom : frac,
    z: (c0 - Math.cos(t)) / (c0 + 1),
  };
}

/** Arch height at position s ∈ [0, span] along a catenary arch. */
export function catenaryZAt(hEff: number, span: number, s: number): number {
  if (hEff <= 0 || span <= 0 || s <= 0 || s >= span) return 0;
  const a = solveCatenaryA(hEff, span);
  return hEff + a - a * Math.cosh((s - span / 2) / a);
}

/**
 * Arch height at position s ∈ [0, span] along a trochoid arch. Inverts the
 * monotone windowed x-map (Kepler's equation) by bisection — robust even at
 * the d=1 cusps where Newton's method stalls. `pct` (default 1) clips the flat
 * cusp ends; see {@link trochoidNorm}.
 */
export function cycloidZAt(hEff: number, span: number, d: number, s: number, pct = 1): number {
  if (hEff <= 0 || span <= 0 || s <= 0 || s >= span) return 0;
  const t0 = (1 - pct) * TURN.half;
  const t1 = TURN.full - t0;
  const xRaw = (tt: number) => tt - d * Math.sin(tt);
  const x0 = xRaw(t0);
  // Target on the raw x-parametrisation, mapped from the fractional station.
  const m = x0 + (s / span) * (xRaw(t1) - x0);
  let lo = t0;
  let hi = t1;
  // 24 halvings bound t to (t1−t0)/2²⁴ ≈ sub-micron in z; this runs once per
  // surface sample, so the iteration count is a real cost.
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    if (xRaw(t) < m) lo = t; else hi = t;
  }
  const t = (lo + hi) / 2;
  const c0 = Math.cos(t0);
  return ((c0 - Math.cos(t)) / (c0 + 1)) * hEff;
}

/** A spline-arch control point in normalized full-span coordinates. */
export interface ArchSplineControlPoint {
  t: number;
  z: number;
  mirror?: boolean;
}

/** {@link ArchSplineKnot.source} for the peak, which every spline has exactly one of. */
export const SPLINE_PEAK_SOURCE = -1;

/** One interpolated knot, tagged with the control point it came from. */
export interface ArchSplineKnot {
  t: number;
  z: number;
  /**
   * Which control point produced this knot: its index in `points`, or
   * {@link SPLINE_PEAK_SOURCE} for the peak. A mirrored twin carries its
   * origin point's index, so both knots of one point share a source — which
   * is what lets a panel highlight a point and its reflection together.
   */
  source: number;
}

/** Closest approach two knots may make before the later one is discarded. */
const SPLINE_KNOT_EPS = 1e-3;

/** Control points and the peak are held this far off the plate edges. */
const SPLINE_POINT_MARGIN = 0.005;

const SPLINE_PEAK_MARGIN  = 0.02;

/**
 * The interior knot list a spline arch actually interpolates, in normalized
 * full-span position: the peak at `hEff`, plus every control point and — for
 * points flagged `mirror` — its reflection about the plate's mid-length. Sorted
 * by t, with knots that land on top of one another collapsed; the peak outranks
 * a control point it collides with, and earlier control points outrank later
 * ones. Excludes the two plate edges, which are always (0, 0) and (1, 0).
 *
 * Shared by the path builder, the height evaluator, and the panel's control
 * point guides so all three agree on where the knots ended up.
 */
export function archSplineKnots(
  hEff: number,
  points: ArchSplineControlPoint[],
  peak = 0.5,
): ArchSplineKnot[] {
  const hold = (t: number, margin: number) => Math.min(Math.max(t, margin), 1 - margin);
  const raw = [{ t: hold(peak, SPLINE_PEAK_MARGIN), z: hEff, rank: 0, source: SPLINE_PEAK_SOURCE }];
  points.forEach((p, i) => {
    const t = hold(p.t, SPLINE_POINT_MARGIN);
    raw.push({ t, z: p.z, rank: 1, source: i });
    if (p.mirror) raw.push({ t: 1 - t, z: p.z, rank: 1, source: i });
  });
  raw.sort((a, b) => a.t - b.t || a.rank - b.rank);
  const knots: ArchSplineKnot[] = [];
  for (const k of raw) {
    if (knots.length && k.t - knots[knots.length - 1].t <= SPLINE_KNOT_EPS) continue;
    knots.push({ t: k.t, z: k.z, source: k.source });
  }
  return knots;
}

/** Arch height at position s ∈ [0, span] along a spline arch; `endZ` is the far end's height, 0 unless it lands elsewhere. */
export function splineZAt(
  hEff: number,
  span: number,
  points: ArchSplineControlPoint[],
  peak: number,
  s: number,
  endZ = 0,
): number {
  if (hEff <= 0 || span <= 0 || s <= 0) return 0;
  if (s >= span) return endZ;
  return makeArchSplineZOf(hEff, span, points, peak, endZ)(s);
}

// z(s) over [0, span], shared by the spline arch path builder and splineZAt
export function makeArchSplineZOf(
  hEff: number,
  span: number,
  points: ArchSplineControlPoint[],
  peak: number,
  endZ = 0,
): (s: number) => number {
  const knots = archSplineKnots(hEff, points, peak);
  const ys = [0, ...knots.map(k => k.t * span), span];
  const zs = [0, ...knots.map(k => k.z),       endZ];
  return makeMonotoneSpline(ys, zs);
}

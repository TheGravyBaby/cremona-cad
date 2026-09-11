import { Pt, Circle } from "../../models/types";
import { TWO_PI, normalizeRadians, clamp, distPointToSegment, closestPointOnSegment } from "./simpleGeometry";
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
  const start0 = travel - turnSign * Math.PI / 2;
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
    return n > Math.PI ? n - TWO_PI : n;
  };
  const EPS = 1e-6;
  const inRange = (s: number) => Math.sign(s) === turnSign && Math.abs(s) > EPS && Math.abs(s) < Math.PI - EPS;

  // the raw (signed) solve only ever hits +target on the direct branch; the reflex branch (the
  // other tangent circle, arcTangentToLine's r < 0 case) shows up at -target instead
  for (const target of [targetRadius, -targetRadius]) {
    const a0 = h(0, target), aHalf = h(Math.PI / 2, target), aPi = h(Math.PI, target);
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
    const exit = theta + turnSign * Math.PI / 2, pt = pointAt(theta);
    const ex = Math.sin(exit) - Math.sin(travel), ey = Math.cos(travel) - Math.cos(exit);
    const denom = ux * ey - uy * ex;
    const dx = pt.x - P.x, dy = pt.y - P.y;
    return (dy * ux - dx * uy) - target * denom;
  };

  for (const target of [targetRadius, -targetRadius]) {
    const a0 = h(0, target), aHalf = h(Math.PI / 2, target), aPi = h(Math.PI, target);
    const a = (a0 + aPi) / 2, b = a0 - a, c = aHalf - a;
    const R = Math.hypot(b, c);
    if (R < 1e-9 || Math.abs(a) > R + 1e-9) continue;

    const delta = Math.atan2(c, b);
    const offset = Math.acos(clamp(-a / R, -1, 1));
    for (const theta of [normalizeRadians(delta + offset), normalizeRadians(delta - offset)]) {
      const exit = theta + turnSign * Math.PI / 2;
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
    for (const i of cells[y * cols + x]) {
      const d = distPointToSegment(p, poly[i], poly[(i + 1) % poly.length]);
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

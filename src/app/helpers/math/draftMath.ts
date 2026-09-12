import { Pt, Circle, Line, Arc, Vect2D } from "../../models/types";
import {
  TWO_PI, dist, angleFromCenter, pointOnCircle, angleWithinSweep, unitVectorFromLine,
  tangentUnitVectorFromLine, offsetLineByDistance, closestPointOnLine, moveInVectorSpace, normalizeRadians,
} from "./simpleGeometry";

// ===== Circles =====

/**
 * The two points on circle `C` where a line from external point `P` is tangent to it — PT ⊥ CT,
 * so triangle P-C-T is right-angled at T, giving the tangent points' angle off `C` as
 * `angleFromCenter(C, P) ± acos(C.r / dist(P, C))`. Returns `[]` when `P` is inside or on `C`
 * (no tangent line exists).
 */
export function tangentPointsFromExternalPoint(P: Pt, C: Circle): Pt[] {
  const d = dist(P, C);
  if (d <= C.r) return [];
  const baseAngle = angleFromCenter(C, P);
  const beta = Math.acos(C.r / d);
  return [
    pointOnCircle(C, baseAngle + beta),
    pointOnCircle(C, baseAngle - beta),
  ];
}

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

// T is a line, Q is a fixed circle, solve the position of P given a R where P is tangent to both T and Q
// in this case m is a standard y/x slope
// side (+1/-1) picks which side of T the solved circle sits on. The line has up to two tangent
// solutions on that side; near picks whichever one's center sits closest to it. Returns null when
// the two constraints can't be met at all.
export function solveTangentCircleAndLine(t: Line, Q: Circle, Pr: number, diff: boolean, side: 1 | -1, near: Pt): Circle | null {
  // we know that the line drawn from C center to the center of Q must have some properties
  // if diff, dist = P.r - Q.r; if sum, dist = P.r +  Q.r
  let PtoQ = diff ? Pr - Q.r : Pr + Q.r;

  // we know that the circle P must be tangent to the line, which means its
  // exists along a line parallel to our given line at some distance away, on the chosen side
  let unitVectAgainstT = tangentUnitVectorFromLine(t)
  let parallelLine = offsetLineByDistance(t, side * Pr);

  // now we need to solve for the point along Cy where the distance to Q is equal to dist
  // first find the distance between the line t and the center of Q — signed, so moving Q by it
  // lands exactly on parallelLine regardless of which side Q started on
  let Qfoot = closestPointOnLine(Q, parallelLine).point
  let QtoT = (Qfoot.x - Q.x) * unitVectAgainstT.a + (Qfoot.y - Q.y) * unitVectAgainstT.b

  // we have two sides of a right triangle, we can solve for the third
  // scale-aware tolerance so a genuinely-tangent case doesn't get knocked negative
  // by floating point noise and reported as "no solution" (same idea as
  // circleCircleIntersections' eps and lineCircleIntersectionWithTolerance)
  let discriminant = PtoQ * PtoQ - QtoT * QtoT;
  let scale = Math.max(1, Math.abs(PtoQ), Math.abs(QtoT));
  let eps = 1e-9 * scale * scale;
  if (discriminant < -eps) return null;
  let distanceAlongLine = Math.sqrt(Math.max(discriminant, 0));

  // so lets make vectors, we have angles and magnitudes — two candidate centers, one each
  // direction along the line; near picks which one actually gets returned
  let unitVectAlongT = unitVectorFromLine(t)
  let vectAgainstT: Vect2D = { a: unitVectAgainstT.a, b: unitVectAgainstT.b, mag: QtoT }
  let vectAlongTPlus: Vect2D = { a: unitVectAlongT.a, b: unitVectAlongT.b, mag: distanceAlongLine }
  let vectAlongTMinus: Vect2D = { a: unitVectAlongT.a, b: unitVectAlongT.b, mag: -distanceAlongLine }

  // now we just start at our reference point and apply the vectors to find the potential circle centers
  let CxyPlus = moveInVectorSpace(Q, [vectAlongTPlus, vectAgainstT])
  let CxyMinus = moveInVectorSpace(Q, [vectAlongTMinus, vectAgainstT])
  let Cxy = dist(CxyPlus, near) <= dist(CxyMinus, near) ? CxyPlus : CxyMinus;
  let C = new Circle(Cxy.x, Cxy.y, Pr)
  return C;
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
  let cosPhi = (LP*LP + LrCr*LrCr - Cr*Cr) / (2 * LP * LrCr);

  // No triangle closes when that leaves the cosine domain — no circle of radius Cr is both tangent
  // to L and through P. Report it as no solutions, the way interceptCirclesAndPointCompound does:
  // Math.acos would hand back NaN instead, and a NaN centre travels all the way to the SVG before
  // anything notices, so the caller never gets the chance to fail.
  if (!Number.isFinite(cosPhi) || cosPhi < -1 || cosPhi > 1) return [];

  let phi = Math.acos(cosPhi);

  // we know that the angle theta, which is the angle from L to C is both the difference and the sum of these angles
  let thetaBig = gamma + phi;
  let thetaSmall = gamma - phi;

  // we can then find the two possible centers for C using these angles and the distance CrLr
  let C1 = { x: L.x + LrCr * Math.cos(thetaBig), y: L.y + LrCr * Math.sin(thetaBig) };
  let C2 = { x: L.x + LrCr * Math.cos(thetaSmall), y: L.y + LrCr * Math.sin(thetaSmall) };

  let solutions = [ { ...C1, r: Cr }, { ...C2, r: Cr } ];


  return solutions;
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


/**
 * Rounds a right-angle corner at `P` — where a vertical edge meets a horizontal one — with an
 * arc of the given radius. `into` says which quadrant the round cuts into, relative to `P`: each
 * component is +1 or -1, the direction (x, then y) from the corner toward the region being
 * smoothed. Returns null when radius is non-positive.
 */
export function filletRightAngleCorner(P: Pt, into: Pt, radius: number): Arc | null {
  if (radius <= 0) return null;
  const center: Pt = { x: P.x + into.x * radius, y: P.y + into.y * radius };
  const vTangent: Pt = { x: P.x, y: center.y };
  const hTangent: Pt = { x: center.x, y: P.y };
  return new Arc(center.x, center.y, radius, angleFromCenter(center, vTangent), angleFromCenter(center, hTangent));
}


// ===== Arc construction =====
// These take center/radius/angles loose rather than an Arc, because their callers are the canvas
// tools, whose ArcShape stores `center: Pt` and `radius` separately. Arc's own `start`/`end` carry
// the *minor*-sweep convention of pathFromArc; the functions below sweep strictly CCW (see
// arcPathData), so reusing Arc here would silently mix two conventions in one type.

/**
 * Given two boundary angles on a circle, returns them as (startAngle, endAngle) oriented so
 * the CCW arc between them is the minor (<=180°) one by default, or the major (>180°) one when
 * `preferLong` is true — swapping which angle is "start" is the only way to pick between the
 * two arcs that share the same two boundary points, since arcPathData always sweeps CCW.
 */
export function pickArcOrientation(a: number, b: number, preferLong: boolean): { startAngle: number; endAngle: number } {
  const span = normalizeRadians(b - a);
  const isMinor = span <= Math.PI;
  return isMinor === !preferLong ? { startAngle: a, endAngle: b } : { startAngle: b, endAngle: a };
}

/** A solved arc in the CCW convention arcPathData and ArcShape share — what every fit function
 * below returns, whatever constraints it solved from. */
export type ArcFit = { center: Pt; radius: number; startAngle: number; endAngle: number };

/**
 * The arc ending at `start` and `end`, centered wherever on their perpendicular bisector sits
 * nearest `centerHint`. A center equidistant from both ends can only lie on that bisector, so the
 * third click is free to land anywhere and only its position *along* the bisector changes the
 * radius — projecting rather than rejecting is what lets the center be clicked by eye. Returns
 * null when the two ends coincide, leaving no bisector to project onto.
 *
 * The minor (<=180°) arc by default and the major one when `preferLong` is true, same as the
 * center-first constructions — so the arc always bulges away from the center, and pulling the
 * center further off widens the sweep rather than flipping it.
 */
export function fitArcFromEndsAndCenter(start: Pt, end: Pt, centerHint: Pt, preferLong = false): ArcFit | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chordSq = dx * dx + dy * dy;
  if (chordSq < 1e-12) return null;

  // bisector runs through the chord's midpoint along the chord turned 90°, so projecting onto it
  // is one dot product — no line-intersection needed
  const mid: Pt = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const t = ((centerHint.x - mid.x) * -dy + (centerHint.y - mid.y) * dx) / chordSq;
  const center: Pt = { x: mid.x - dy * t, y: mid.y + dx * t };

  const radius = dist(center, start);
  if (radius < 1e-6) return null;

  const { startAngle, endAngle } = pickArcOrientation(
    angleFromCenter(center, start), angleFromCenter(center, end), preferLong);
  return { center, radius, startAngle, endAngle };
}

/**
 * The unique circle through `start` and `end` that is tangent to direction
 * `startTangent` at `start` — lets an arc continue smoothly from an existing
 * line/arc endpoint instead of being built from an independent center point.
 * Returns null when `end` lies on the tangent line itself (no finite circle fits).
 *
 * That circle still has two arcs connecting `start` and `end`; only one of them actually
 * continues smoothly from `startTangent` (the other kinks backwards at `start`) — that's the
 * one returned by default. Pass `preferOther: true` (e.g. while an angle-lock-style modifier
 * is held) to deliberately take the other one instead, trading the smooth join for its sweep.
 */
export function fitTangentArc(start: Pt, startTangent: number, end: Pt, preferOther = false): ArcFit | null {
  const tx = Math.cos(startTangent);
  const ty = Math.sin(startTangent);
  const nx = -ty; // normal to the tangent, rotated +90° (CCW)
  const ny = tx;

  const dx = start.x - end.x;
  const dy = start.y - end.y;
  const denom = 2 * (dx * nx + dy * ny);
  if (Math.abs(denom) < 1e-9) return null;

  const r = -(dx * dx + dy * dy) / denom;
  if (Math.abs(r) < 1e-6) return null;

  const center: Pt = { x: start.x + r * nx, y: start.y + r * ny };
  const radius = Math.abs(r);

  const startAngle = angleFromCenter(center, start);
  const endAngle = angleFromCenter(center, end);

  // arcPathData always sweeps CCW from startAngle to endAngle, but the CCW direction of travel
  // at `start` only matches `startTangent` when r > 0 — when r < 0 it points exactly backwards,
  // so swapping which boundary angle is labeled "start" is what actually continues smoothly
  // from the tangent, rather than (depending on where `end` lands) rendering the wrong one of
  // the two arcs that share these boundary points. `preferOther` inverts that choice.
  const useAsIs = preferOther ? !(r > 0) : r > 0;
  return useAsIs
    ? { center, radius, startAngle, endAngle }
    : { center, radius, startAngle: endAngle, endAngle: startAngle };
}

/**
 * The unique circle through three points, returned as the arc that actually passes through
 * `through` — the one arc construction that needs no center at all, which is what makes it the
 * tool for tracing a curve you can see. Returns null when the three points are collinear (no
 * finite circle fits) or two of them coincide.
 *
 * Which of that circle's two arcs comes back is decided by `through` itself rather than by any
 * minor/major rule, so dragging the third point across the chord grows the sweep continuously
 * past 180° instead of snapping back. `preferOther: true` takes the complementary arc — the same
 * circle, swept the far way round, the part that does *not* contain `through`.
 */
export function fitArcThroughPoints(start: Pt, end: Pt, through: Pt, preferOther = false): ArcFit | null {
  // Collinearity is measured against the points' own spread rather than an absolute epsilon:
  // the determinant scales with area, so a fixed threshold would reject a genuinely flat arc
  // (a violin's long arch is exactly that) at one drawing scale and accept noise at another.
  const scale = Math.max(dist(start, end), dist(start, through), dist(end, through));
  if (scale < 1e-9) return null;

  // solved with `start` at the origin and translated back, rather than straight from world
  // coordinates: the determinant differences the squares of the inputs, so a drawing sitting far
  // from the origin would lose most of its precision to cancellation before the divide
  const bx = end.x - start.x;
  const by = end.y - start.y;
  const cx = through.x - start.x;
  const cy = through.y - start.y;
  const d = 2 * (bx * cy - by * cx);
  if (Math.abs(d) < 1e-9 * scale * scale) return null;

  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const center: Pt = {
    x: start.x + (cy * b2 - by * c2) / d,
    y: start.y + (bx * c2 - cx * b2) / d,
  };
  const radius = dist(center, start);
  if (radius < 1e-6) return null;

  const startAngle = angleFromCenter(center, start);
  const endAngle = angleFromCenter(center, end);
  const containsThrough = angleWithinSweep(angleFromCenter(center, through), startAngle, endAngle);
  return containsThrough === !preferOther
    ? { center, radius, startAngle, endAngle }
    : { center, radius, startAngle: endAngle, endAngle: startAngle };
}

// G1 chain step: arc leaving P along `travel` with given radius, turning by `sweep` (negative
// clockwise). keep |sweep| under 180°, since Arc's boundary angles can only name the minor span.
export function arcContinuingFrom(P: Pt, travel: number, radius: number, sweep: number): Arc {
  const start = travel - (Math.sign(sweep) || 1) * Math.PI / 2;
  const cx = P.x - radius * Math.cos(start);
  const cy = P.y - radius * Math.sin(start);
  return new Arc(cx, cy, radius, start, start + sweep);
}

// G1 chain closing step: the one arc from P tangent to `travel` that lands tangent to the line
// through A along lineDir; radius and turn direction fall out of a single signed solve, so an
// overshot chain still closes (as an inflection). null if parallel or the turn exceeds 180°.
export function arcTangentToLine(P: Pt, travel: number, A: Pt, lineDir: Pt): Arc | null {
  const exit = Math.atan2(lineDir.y, lineDir.x);
  // exit point is P + r*(N(travel) - N(exit)); on the line, that's linear in r
  const nx = -Math.sin(travel) + Math.sin(exit);
  const ny = Math.cos(travel) - Math.cos(exit);
  const mx = -lineDir.y, my = lineDir.x;

  const denom = mx * nx + my * ny;
  if (Math.abs(denom) < 1e-9) return null;

  const r = (mx * (A.x - P.x) + my * (A.y - P.y)) / denom;
  const turn = normalizeRadians(exit - travel) - (r < 0 ? TWO_PI : 0);
  if (Math.abs(turn) >= Math.PI) return null;
  return arcContinuingFrom(P, travel, Math.abs(r), turn);
}

// G1 chain closing step: run along `travel` from A, then one arc onto target arriving along
// `exit`; naming the exit direction fixes the sweep, leaving run/radius a linear pair with one
// solution. null if parallel with no finite radius, turn exceeds 180°, or the run goes backwards.
export function arcBetweenTravels(
  A: Pt, travel: number, target: Pt, exit: number,
): { run: number; arc: Arc } | null {
  const d = normalizeRadians(exit - travel);
  const sweep = d > Math.PI ? d - TWO_PI : d;

  const ux = Math.cos(travel), uy = Math.sin(travel);
  const ex = Math.sin(travel + sweep) - Math.sin(travel);
  const ey = Math.cos(travel) - Math.cos(travel + sweep);

  const denom = ux * ey - uy * ex;
  if (Math.abs(denom) < 1e-9) return null;

  const dx = target.x - A.x, dy = target.y - A.y;
  const run = (dx * ey - dy * ex) / denom;
  const radius = (dy * ux - dx * uy) / denom;

  // radius solved with the wrong sign relative to sweep means the major arc, not this one
  if (run < -1e-9 || Math.sign(radius) !== Math.sign(sweep)) return null;

  const P = { x: A.x + run * ux, y: A.y + run * uy };
  return { run, arc: arcContinuingFrom(P, travel, Math.abs(radius), sweep) };
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
 * graceful/open one). Separate from findJoiningArcsFromTangents, which only exposes the
 * smaller root, so callers can compare candidates across roots and invert flags.
 */
export function solveBiarcRoots(P1: Pt, T1: number, P2: Pt, T2: number, invert1: boolean, invert2: boolean): { R: number; N1: Pt; N2: Pt }[] {
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

export function biarcFromRoot(P1: Pt, P2: Pt, N1: Pt, N2: Pt, R: number): Arc[] {
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

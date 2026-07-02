import { Pt, Circle, Axis, Line, Rectangle, Arc, arcFromCircle } from "../models/types";

// ======= Simple Geometry =======
export function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
  const T1Sine = T1Invert ? -1 : 1;
  const T1: Pt = { x: s1 * T1Sine * -Math.sin(theta1), y: s1 * T1Sine * Math.cos(theta1) };

  const theta2 = side2 === "start" ? arc2.start : arc2.end;
  const P2: Pt = { x: arc2.x + arc2.r * Math.cos(theta2), y: arc2.y + arc2.r * Math.sin(theta2) };
  const s2 = side2 === "start" ? 1 : -1;
  const T2Sine = T2Invert ? -1 : 1;
  const T2: Pt = { x: s2 * T2Sine * Math.sin(theta2), y: s2 * T2Sine * -Math.cos(theta2) };

  // Left normals (90° CCW rotation of each tangent) — biarc centers live on these rays from P1/P2
  const N1: Pt = { x: -T1.y, y: T1.x };
  const N2: Pt = { x: -T2.y, y: T2.x };

  const A: Pt = { x: P1.x - P2.x, y: P1.y - P2.y };
  const A2 = A.x * A.x + A.y * A.y;
  const a  = A.x * N1.x + A.y * N1.y;  // A · N1
  const b  = A.x * N2.x + A.y * N2.y;  // A · N2
  const k  = N1.x * N2.x + N1.y * N2.y; // N1 · N2

  // Solve 2R²(1+k) + 2R(b−a) − A2 = 0 for the equal-radius biarc
  const qa = 2 * (1 + k);
  const qb = 2 * (b - a);
  const qc = -A2;

  let R: number;
  if (Math.abs(qa) < 1e-10) {
    if (Math.abs(qb) < 1e-10) return [];
    R = -qc / qb;
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) return [];
    const R1 = (-qb + Math.sqrt(disc)) / (2 * qa);
    const R2 = (-qb - Math.sqrt(disc)) / (2 * qa);
    const pos = [R1, R2].filter(r => r > 1e-10);
    if (pos.length === 0) return [];
    R = Math.min(...pos); // larger root → more open, gradual curve
  }

  const C1: Pt = { x: P1.x + R * N1.x, y: P1.y + R * N1.y };
  const C2: Pt = { x: P2.x + R * N2.x, y: P2.y + R * N2.y };

  // For equal-radius external tangency, |C1−C2| = 2R and the joint J is the midpoint
  const J: Pt = { x: (C1.x + C2.x) / 2, y: (C1.y + C2.y) / 2 };

  return [
    new Arc(C1.x, C1.y, R, Math.atan2(P1.y - C1.y, P1.x - C1.x), Math.atan2(J.y - C1.y, J.x - C1.x)),
    new Arc(C2.x, C2.y, R, Math.atan2(J.y  - C2.y, J.x  - C2.x), Math.atan2(P2.y - C2.y, P2.x - C2.x)),
  ];
}

// ===== Curve math =====

/**
 * Solves the catenary shape parameter `a` for a given sag `H` and span `L`.
 * Uses bisection: a * (cosh(L / 2a) − 1) = H.
 */
export function solveCatenaryA(H: number, L: number): number {
  const f = (a: number): number => a * (Math.cosh(L / (2 * a)) - 1) - H;
  let lo = L * 1e-4;
  let hi = L * 1e4;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    f(mid) > 0 ? (lo = mid) : (hi = mid);
  }
  return (lo + hi) / 2;
}

/**
 * 1-D natural cubic spline: given strictly-increasing `ys[]` and values `zs[]`,
 * returns a function z(y). Natural BC: M[0] = M[n] = 0 (zero curvature at ends).
 */
export function makeNaturalSpline(ys: number[], zs: number[]): (y: number) => number {
  const n = ys.length - 1;
  const h: number[] = ys.slice(0, n).map((v, i) => ys[i + 1] - v);

  const m = n - 1;
  const bd: number[] = [];
  const up: number[] = [];
  const rhs: number[] = [];
  for (let i = 0; i < m; i++) {
    const r = i + 1;
    bd.push(2 * (h[r - 1] + h[r]));
    up.push(i < m - 1 ? h[r] : 0);
    rhs.push(6 * ((zs[r + 1] - zs[r]) / h[r] - (zs[r] - zs[r - 1]) / h[r - 1]));
  }
  for (let i = 1; i < m; i++) {
    const f = up[i - 1] / bd[i - 1];
    bd[i]  -= f * up[i - 1];
    rhs[i] -= f * rhs[i - 1];
  }
  const Mi: number[] = new Array(m).fill(0);
  if (m > 0) {
    Mi[m - 1] = rhs[m - 1] / bd[m - 1];
    for (let i = m - 2; i >= 0; i--) Mi[i] = (rhs[i] - up[i] * Mi[i + 1]) / bd[i];
  }
  const M = [0, ...Mi, 0];

  return (y: number): number => {
    let i = 0;
    while (i < n - 1 && ys[i + 1] <= y) i++;
    const hi = h[i];
    const s  = ys[i + 1] - y;
    const t  = y - ys[i];
    return (M[i] * s * s * s + M[i + 1] * t * t * t) / (6 * hi)
         + (zs[i]     / hi - M[i]     * hi / 6) * s
         + (zs[i + 1] / hi - M[i + 1] * hi / 6) * t;
  };
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

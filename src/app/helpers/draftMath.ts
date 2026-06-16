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


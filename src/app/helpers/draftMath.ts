import { Pt, Fraction, Circle, Axis } from "../models/types";

export function polarAngle(c: Pt, p: Pt) {
  return Math.atan2(p.y - c.y, p.x - c.x);
}

export function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointOnCircle(C: Circle,  θ: number): Pt {
  return {
    x: C.x + C.r * Math.cos(θ),
    y: C.y + C.r * Math.sin(θ),
  };
}

export function projectToCircle(C: Circle, P: Pt): Pt {
  const θ = angleFromCenter(C, P);
  return pointOnCircle(C, θ);
}

export function circleCircleIntersections(
  C1: Circle,
  C2: Circle,
  approx: boolean = true // or default false if you prefer
): Pt[] {
  const d = dist(C1, C2);

  // tight, scale-aware tolerance (tweak 1e-12 -> 1e-11 if you still see misses)
  const scale = Math.max(1, C1.r, C2.r, d);
  const eps = approx ? 1e-12 * scale : 0;

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

export function arcLengthToAngle(r: number, L: number): number {
  return L / r;
}

export function angleToArcLength(r: number, θ: number): number {
  return r * θ;
}

export function bisectAngles(θ1: number, θ2: number): number {
  return θ1 + (θ2 - θ1) / 2;
}

export function circleTangentAngle(θ: number): number {
  return θ + Math.PI / 2;
}

export function solveCoordOnCircleInset(
  C: Circle,
  knownAxis: Axis,     // which coordinate you already know: "x" or "y"
  knownValue: number,  // Px or Py
  inset: number,       // distance from outer circle inward (R)
  upperOrRight = true  // choose +sqrt (top if solving y, right if solving x)
): number {
  const rPrime = C.r - inset;
  if (rPrime < 0) throw new Error("No solution: inset larger than radius");

  const Cknown = knownAxis === "x" ? C.x : C.y;
  const d = knownValue - Cknown;

  const under = rPrime * rPrime - d * d;
  if (under < 0) throw new Error("No real solution: knownValue out of range");

  const s = Math.sqrt(under);
  const Cunknown = knownAxis === "x" ? C.y : C.x; // solving the other coordinate
  return upperOrRight ? Cunknown + s : Cunknown - s;
}

export function solveYOnCircleInset(
  C: Circle,
  Px: number, inset: number,
  upper = true
): number {
  return solveCoordOnCircleInset(C, "x", Px, inset, upper);
}

export function solveXOnCircleInset(
  C: Circle,
  Py: number, inset: number,
  right = true
): number {
  return solveCoordOnCircleInset(C, "y", Py, inset, right);
}

export function lineCircleIntersection(
  P1: Pt, P2: Pt,
  C: Circle
): Pt[] {
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

export function arcPathFrom3Points(
  c: Pt,
  start: Pt,
  end: Pt,
  opts?: { clockwise?: boolean; useLargeArc?: boolean }
) {
  const r = Math.hypot(start.x - c.x, start.y - c.y);

  // If your points are slightly off-radius, you can either trust start radius (compass)
  // or clamp end onto the circle:
  const endOnCircle = (() => {
    const ex = end.x - c.x, ey = end.y - c.y;
    const len = Math.hypot(ex, ey) || 1;
    return { x: c.x + (ex / len) * r, y: c.y + (ey / len) * r };
  })();

  const a0 = polarAngle(c, start);
  const a1 = polarAngle(c, endOnCircle);

  // Normalize delta to [0, 2π)
  let delta = a1 - a0;
  while (delta < 0) delta += Math.PI * 2;
  while (delta >= Math.PI * 2) delta -= Math.PI * 2;

  // Decide sweep + large-arc:
  // sweepFlag: 1 = "positive-angle direction" in SVG's coordinate system (y down), which appears clockwise.
  const clockwise = opts?.clockwise ?? true;

  // For a given direction, choose largeArc based on delta
  // (if clockwise, the swept angle is delta; if counterclockwise, it's 2π - delta)
  const swept = clockwise ? delta : (Math.PI * 2 - delta);
  const largeArc = opts?.useLargeArc ?? (swept > Math.PI);

  const sweepFlag = clockwise ? 1 : 0;
  const largeArcFlag = largeArc ? 1 : 0;

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${endOnCircle.x} ${endOnCircle.y}`;
}

/**
 * SVG arc path on circle C, centered at angle theta (radians),
 * spanning arc-length s (same units as r).
 *
 * Example: s = Math.PI * r draws a half-circle centered on theta.
 */
export function arcPathByArcLengthAboutTheta(
  C: Circle,
  theta: number,
  s: number,
  opts?: {
    radians?: boolean;      // if false, theta is degrees
    moveTo?: boolean;       // include "M" + "A" (default true). If false, returns only the "A" command.
    sweep?: 1 | 0;          // 1 = clockwise, 0 = counterclockwise (default 1)
  }
): string {
  const radians = opts?.radians ?? true;
  const moveTo = opts?.moveTo ?? true;
  const sweep = opts?.sweep ?? 1;

  const t = radians ? theta : (theta * Math.PI) / 180;

  // Convert arc length to angular span
  if (C.r === 0) return "";
  const dTheta = s / C.r; // radians
  const a0 = t - dTheta / 2;
  const a1 = t + dTheta / 2;

  const x0 = C.x + C.r * Math.cos(a0);
  const y0 = C.y + C.r * Math.sin(a0);
  const x1 = C.x + C.r * Math.cos(a1);
  const y1 = C.y + C.r * Math.sin(a1);

  // SVG large-arc-flag: 1 if arc span > 180°
  const largeArc = Math.abs(dTheta) > Math.PI ? 1 : 0;

  const A = `A ${C.r} ${C.r} 0 ${largeArc} ${sweep} ${x1} ${y1}`;
  return moveTo ? `M ${x0} ${y0} ${A}` : A;
}

/**
 * SVG arc path on circle C,
 * centered at angle `theta`,
 * spanning angular width `delta` (radians).
 */
export function arcPathByAngleAboutTheta(
  C: Circle,
  theta: number,
  delta: number,
  opts?: {
    radians?: boolean;    // if false, inputs are degrees
    moveTo?: boolean;     // include "M" command (default true)
    sweep?: 1 | 0;        // 1 = clockwise, 0 = counterclockwise
  }
): string {
  const radians = opts?.radians ?? true;
  const moveTo = opts?.moveTo ?? true;
  const sweep = opts?.sweep ?? 1;

  const t = radians ? theta : (theta * Math.PI) / 180;
  const d = radians ? delta : (delta * Math.PI) / 180;

  if (C.r === 0 || d === 0) return "";

  const a0 = t - d / 2;
  const a1 = t + d / 2;

  const x0 = C.x + C.r * Math.cos(a0);
  const y0 = C.y + C.r * Math.sin(a0);
  const x1 = C.x + C.r * Math.cos(a1);
  const y1 = C.y + C.r * Math.sin(a1);

  const largeArc = Math.abs(d) > Math.PI ? 1 : 0;

  const A = `A ${C.r} ${C.r} 0 ${largeArc} ${sweep} ${x1} ${y1}`;
  return moveTo ? `M ${x0} ${y0} ${A}` : A;
}



export function angleFromCenter(C: Pt, P: Pt): number {
  return Math.atan2(P.y - C.y, P.x - C.x);
}

export function safeFraction(n: number, d: number):
  { ok: true; value: Fraction } | { ok: false; error: string } {

  if (!Number.isFinite(n) || !Number.isFinite(d)) return { ok: false, error: 'Ratios must be numbers.' };

  // If you want integers only:
  if (!Number.isInteger(n) || !Number.isInteger(d)) return { ok: false, error: 'Ratio parts must be whole numbers.' };

  if (n <= 0 || d <= 0) return { ok: false, error: 'Ratio parts must be > 0.' };

  // Optional: clamp silly values (prevents “1:999999” footguns)
  if (n > 10_000 || d > 10_000) return { ok: false, error: 'Ratio parts are too large.' };

  return { ok: true, value: { n, d } };
}

export function interceptCirclesAndPoint(U: Circle, P: Pt, Ur: number): Circle[] {
  if (Ur <= 0) throw new Error("Ur must be > 0");
  const Qx = U.x, Qy = U.y, Qr = U.r;
  if (Qr < 0) throw new Error("Q.r must be >= 0");

  const solutions: Pt[] = [];

  // helper: intersect circle (center A, radius ra) with (center B, radius rb)
  function circleCircle(A: Pt, ra: number, B: Pt, rb: number): Pt[] {
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const d = Math.hypot(dx, dy);

    // no / infinite solutions
    if (d === 0) return [];

    if (d > ra + rb) return [];
    if (d < Math.abs(ra - rb)) return [];

    const a = (ra * ra - rb * rb + d * d) / (2 * d);
    const h2 = ra * ra - a * a;
    const h = Math.sqrt(Math.max(0, h2));

    const xm = A.x + (a * dx) / d;
    const ym = A.y + (a * dy) / d;

    const rx = (-dy / d) * h;
    const ry = ( dx / d) * h;

    // one solution if tangent (h==0), two otherwise
    if (h === 0) return [{ x: xm, y: ym }];
    return [
      { x: xm + rx, y: ym + ry },
      { x: xm - rx, y: ym - ry },
    ];
  }

  const Pcenter: Pt = { x: P.x, y: P.y };
  const Qcenter: Pt = { x: Qx, y: Qy };

  // Try external tangency first: |C - Q| = Qr + Ur
  solutions.push(...circleCircle(Pcenter, Ur, Qcenter, Qr + Ur));

  // Then internal tangency if it makes sense: |C - Q| = |Qr - Ur|
  const internalRadius = Math.abs(Qr - Ur);
  if (internalRadius > 0) {
    solutions.push(...circleCircle(Pcenter, Ur, Qcenter, internalRadius));
  }

  if (solutions.length === 0) {
    throw new Error("No solution: cannot make radius Ur circle through P tangent to Q");
  }

  // Deterministic pick:
  // choose the solution that is "closest" to the existing U center (stabilizes UI),
  // tie-break by higher y then higher x.
  const target: Pt = { x: U.x, y: U.y };
  solutions.sort((a, b) => {
    const da = (a.x - target.x) ** 2 + (a.y - target.y) ** 2;
    const db = (b.x - target.x) ** 2 + (b.y - target.y) ** 2;
    if (da !== db) return da - db;
    if (a.y !== b.y) return b.y - a.y;
    return b.x - a.x;
  });

  const C = solutions[0];
  const D = solutions[1];
  let result: Circle[] =  [
    { x: C.x, y: C.y, r: Ur }, 
    { x: D.x, y: D.y, r: Ur }
  ];

  return result;
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
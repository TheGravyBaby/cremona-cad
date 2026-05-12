import { Pt, Fraction, Circle, Axis, Line, Rectangle, Arc, arcFromCircle } from "../models/types";
import * as polygonClipping from 'polygon-clipping';
import { svgPathProperties } from 'svg-path-properties';

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

  return { x: arc.x, y: arc.y, r: newR, start: arc.start, end: arc.end };
}

export function flipArcAboutY(arc: Arc): Arc {
  let mirroredArc = new Circle(-arc.x, arc.y, arc.r);
  let mirroredU1Arc = arcFromCircle(mirroredArc, flipAngleAboutYAxis(arc.start), flipAngleAboutYAxis(arc.end));
  return mirroredU1Arc;
}

export function flipCircleAboutY(C: Circle): Circle { 
  return { x: -C.x, y: C.y, r: C.r };
}


// ======  Complex Geometry ======
export function circleCircleIntersections(C1: Circle, C2: Circle, approx: boolean = true): Pt[] {
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


// =========== PATH HELPERS ==============
const polygonClipper: {
  difference: (
    subjectGeom: [number, number][][][] | [number, number][][][][],
    ...clipGeoms: ([number, number][][][] | [number, number][][][][])[]
  ) => [number, number][][][][];
} = ((polygonClipping as any).default ?? polygonClipping) as any;

export function pathFromCircle(C: Circle): string {
  const { x, y, r } = C;
  // Draw a circle using two semicircular arcs
  return `M ${x - r} ${y} A ${r} ${r} 0 0 0 ${x + r} ${y} A ${r} ${r} 0 0 0 ${x - r} ${y} Z`;
}

export function pathFromLine(Pt1: Pt, Pt2: Pt): string {
  return `M ${Pt1.x} ${Pt1.y} L ${Pt2.x} ${Pt2.y}`;
}

export function pathFromRect(R: Rectangle): string {
  const { Pt1, Pt2 } = R;
  return `M ${Pt1.x} ${Pt1.y} L ${Pt2.x} ${Pt1.y} L ${Pt2.x} ${Pt2.y} L ${Pt1.x} ${Pt2.y} Z`;
}

export function arcPathFrom3Points(c: Pt, start: Pt, end: Pt, pickHigherArc?: boolean): string {
  const TWO_PI = Math.PI * 2;
  const r = Math.hypot(start.x - c.x, start.y - c.y);
  if (!Number.isFinite(r) || r === 0) return `M ${start.x} ${start.y}`;

  // Clamp end onto the circle defined by start to avoid tiny radius mismatches
  const endOnCircle = (() => {
    const ex = end.x - c.x, ey = end.y - c.y;
    const len = Math.hypot(ex, ey) || 1;
    return { x: c.x + (ex / len) * r, y: c.y + (ey / len) * r };
  })();

  const a0 = angleFromCenter(c, start);
  const a1 = angleFromCenter(c, endOnCircle);

  // Normalize delta to [0, 2π)
  let delta = a1 - a0;
  delta = ((delta % TWO_PI) + TWO_PI) % TWO_PI;

  // Optional y-extreme selector:
  //  - true  -> force arc through the highest point (min y, angle -π/2)
  //  - false -> force arc through the lowest point  (max y, angle +π/2)
  //  - undefined -> keep previous behavior and pick the shorter arc
  if (pickHigherArc === undefined) {
    const usePositiveSweep = delta <= Math.PI;
    const sweepFlag = usePositiveSweep ? 1 : 0;
    const largeArcFlag = 0; // shorter arc never requires large-arc-flag
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${endOnCircle.x} ${endOnCircle.y}`;
  }

  const aTarget = pickHigherArc ? -Math.PI / 2 : Math.PI / 2;
  const normalised = ((aTarget - a0) % TWO_PI + TWO_PI) % TWO_PI;
  const targetInPositiveSweep = normalised <= delta;
  const sweepFlag = targetInPositiveSweep ? 1 : 0;
  const arcSpan = targetInPositiveSweep ? delta : TWO_PI - delta;
  const largeArcFlag = arcSpan > Math.PI ? 1 : 0;

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${endOnCircle.x} ${endOnCircle.y}`;
}

export function linePathFrom2Points(P1: Pt, P2: Pt): string {
  return `M ${P1.x} ${P1.y} L ${P2.x} ${P2.y}`;
}

export function pathFromRoundedRect(R: Rectangle, r: number): string {
  const { Pt1, Pt2 } = R;
  const width = Math.abs(Pt2.x - Pt1.x);
  const height = Math.abs(Pt2.y - Pt1.y);
  const radius = Math.min(r, width / 2, height / 2);

  const x1 = Math.min(Pt1.x, Pt2.x);
  const y1 = Math.min(Pt1.y, Pt2.y);
  const x2 = Math.max(Pt1.x, Pt2.x);
  const y2 = Math.max(Pt1.y, Pt2.y);

  return `M ${x1 + radius} ${y1} L ${x2 - radius} ${y1} Q ${x2} ${y1} ${x2} ${y1 + radius} L ${x2} ${y2 - radius} Q ${x2} ${y2} ${x2 - radius} ${y2} L ${x1 + radius} ${y2} Q ${x1} ${y2} ${x1} ${y2 - radius} L ${x1} ${y1 + radius} Q ${x1} ${y1} ${x1 + radius} ${y1} Z`;
}


// ====== PATH COMBINATIONS ======
export function combinePathStrings(paths: string[]): string {
  return paths.map(p => p.trim()).join(' ');
}

export function unifyTwoConnectedPaths(path1: string, path2: string): string {
  const num = `([\\d.eE+\\-]+)`;
  const moveRe = new RegExp(`^\\s*M\\s+${num}\\s+${num}\\s+(.*)$`);
  const arcRe = new RegExp(`^A\\s+${num}\\s+${num}\\s+${num}\\s+([01])\\s+([01])\\s+${num}\\s+${num}\\s*$`);
  const lineRe = new RegExp(`^L\\s+${num}\\s+${num}\\s*$`);

  const almostEqual = (a: number, b: number, eps: number = 1e-6) => Math.abs(a - b) <= eps;
  const samePoint = (a: Pt, b: Pt) => almostEqual(a.x, b.x) && almostEqual(a.y, b.y);

  const parsePath = (path: string) => {
    const trimmed = path.trim();
    const moveMatch = trimmed.match(moveRe);
    if (!moveMatch) {
      throw new Error(`Unsupported path format: ${path}`);
    }

    const start: Pt = { x: Number(moveMatch[1]), y: Number(moveMatch[2]) };
    const body = moveMatch[3].trim();
    const commands = body.match(/[AL][^AL]*/g)?.map(c => c.trim()) ?? [];

    if (commands.length === 0) {
      throw new Error(`Unsupported segment body: ${body}`);
    }

    let end: Pt = { ...start };
    let singleType: 'arc' | 'line' | null = null;
    let singleArcMeta: {
      rx: number;
      ry: number;
      xAxisRotation: number;
      largeArcFlag: number;
      sweepFlag: number;
    } | null = null;

    for (const command of commands) {
      const arcMatch = command.match(arcRe);
      if (arcMatch) {
        end = { x: Number(arcMatch[6]), y: Number(arcMatch[7]) };
        if (commands.length === 1) {
          singleType = 'arc';
          singleArcMeta = {
            rx: Number(arcMatch[1]),
            ry: Number(arcMatch[2]),
            xAxisRotation: Number(arcMatch[3]),
            largeArcFlag: Number(arcMatch[4]),
            sweepFlag: Number(arcMatch[5]),
          };
        }
        continue;
      }

      const lineMatch = command.match(lineRe);
      if (lineMatch) {
        end = { x: Number(lineMatch[1]), y: Number(lineMatch[2]) };
        if (commands.length === 1) {
          singleType = 'line';
        }
        continue;
      }

      throw new Error(`Unsupported segment body: ${body}`);
    }

    return {
      start,
      end,
      body,
      full: trimmed,
      singleType,
      singleArcMeta,
    };
  };

  const reverseSegment = (path: string): string => {
    const seg = parsePath(path);

    if (!seg.singleType) {
      throw new Error('Path reversal is only supported for single-segment paths.');
    }

    if (seg.singleType === 'arc' && seg.singleArcMeta) {
      const reversedSweepFlag = seg.singleArcMeta.sweepFlag === 1 ? 0 : 1;
      return `M ${seg.end.x} ${seg.end.y} A ${seg.singleArcMeta.rx} ${seg.singleArcMeta.ry} ${seg.singleArcMeta.xAxisRotation} ${seg.singleArcMeta.largeArcFlag} ${reversedSweepFlag} ${seg.start.x} ${seg.start.y}`;
    }

    return `M ${seg.end.x} ${seg.end.y} L ${seg.start.x} ${seg.start.y}`;
  };

  const p1 = parsePath(path1);
  const p2 = parsePath(path2);

  if (samePoint(p1.end, p2.start)) {
    return `${p1.full} ${p2.body}`;
  }

  if (samePoint(p2.end, p1.start)) {
    return `${p2.full} ${p1.body}`;
  }

  if (samePoint(p1.start, p2.start)) {
    return unifyTwoConnectedPaths(reverseSegment(path1), path2);
  }

  if (samePoint(p1.end, p2.end)) {
    return unifyTwoConnectedPaths(path1, reverseSegment(path2));
  }

  throw new Error('Paths do not share a common endpoint.');
}

/**
 * Orders and joins a set of connected SVG segments into one path string.
 *
 * It greedily finds the next segment that can connect to either end of the
 * current chain and stitches with `concatSvgPaths`.
 */
export function unifyConnectedSvgPaths(paths: string[]): string {
  if (paths.length === 0) return '';

  let unified = paths[0].trim();
  const remaining = paths.slice(1);

  while (remaining.length > 0) {
    let stitched = false;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];

      try {
        unified = unifyTwoConnectedPaths(unified, candidate);
        remaining.splice(i, 1);
        stitched = true;
        break;
      } catch {
        // try prepend direction
      }

      try {
        unified = unifyTwoConnectedPaths(candidate, unified);
        remaining.splice(i, 1);
        stitched = true;
        break;
      } catch {
        // candidate did not connect in either direction
      }
    }

    if (!stitched) {
      throw new Error(`Could not connect all paths into one chain. Remaining segments: ${remaining.length}`);
    }
  }

  return unified;
}

export function differenceFromTwoPaths(path1: string, path2: string, distancePerSample = 0.5): string {
  type Pair = [number, number];
  type Ring = Pair[];
  type Polygon = Ring[];
  type MultiPolygon = Polygon[];

  const pathToRing = (path: string): Ring => {
    const props = new svgPathProperties(path);
    const totalLength = props.getTotalLength();

    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      throw new Error('Path has no measurable length.');
    }

    let distancePerSample = .5; // lower numbers are more accurate
    const steps = Math.max(128, Math.min(4096, Math.ceil(totalLength / distancePerSample)));
    const pts: Pair[] = [];

    for (let i = 0; i < steps; i++) {
      const d = (i / steps) * totalLength;
      const p = props.getPointAtLength(d);
      pts.push([p.x, p.y]);
    }

    // Remove consecutive duplicates (numerical noise can produce them).
    const deduped = pts.filter((p, i, arr) => {
      if (i === 0) return true;
      const prev = arr[i - 1];
      return Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-9;
    });

    if (deduped.length < 3) {
      throw new Error('Path sampling produced fewer than 3 unique points.');
    }

    return deduped;
  };

  const ringToPath = (ring: Ring): string => {
    if (!ring.length) return '';
    const [first, ...rest] = ring;
    const head = `M ${first[0]} ${first[1]}`;
    const tail = rest.map(p => `L ${p[0]} ${p[1]}`).join(' ');
    return `${head}${tail ? ' ' + tail : ''} Z`;
  };

  const ring1 = pathToRing(path1);
  const ring2 = pathToRing(path2);

  // polygon-clipping expects MultiPolygon coordinates:
  // MultiPolygon -> Polygon[] -> Ring[] -> Point[]
  const subject: MultiPolygon = [[ring1]];
  const clip: MultiPolygon = [[ring2]];

  const diff = polygonClipper.difference(subject, clip) as unknown as MultiPolygon | null;
  if (!diff || diff.length === 0) return '';

  const subpaths: string[] = [];
  for (const polygon of diff) {
    for (const ring of polygon) {
      const path = ringToPath(ring);
      if (path) subpaths.push(path);
    }
  }

  return subpaths.join(' ');
}

export function calculateOffsetAlongPath(path: string, offsetDist: number): string {
  if (!path.trim() || !Number.isFinite(offsetDist)) return '';

  const props = new svgPathProperties(path);
  const totalLength = props.getTotalLength();

  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    return '';
  }

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const tolerance = 1e-6;
  const spacing = clamp(Math.max(Math.abs(offsetDist) / 3, 0.5), 0.5, 2);
  const stepCount = clamp(Math.ceil(totalLength / spacing), 64, 4096);

  const samplePathPoint = (distance: number): Pt => {
    const p = props.getPointAtLength(clamp(distance, 0, totalLength));
    return { x: p.x, y: p.y };
  };

  const sampledPoints: Pt[] = [];
  for (let i = 0; i < stepCount; i++) {
    const distance = (i / stepCount) * totalLength;
    sampledPoints.push(samplePathPoint(distance));
  }

  const start = samplePathPoint(0);
  const end = samplePathPoint(totalLength);
  const isClosed = /z\s*$/i.test(path.trim()) || dist(start, end) <= spacing;

  const signedArea = (points: Pt[]): number => {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return area / 2;
  };

  const orientation = isClosed ? Math.sign(signedArea(sampledPoints)) || 1 : 1;
  const normalSign = isClosed && orientation > 0 ? -1 : 1;

  const getUnitTangent = (distance: number): Pt => {
    const tangent = props.getTangentAtLength(clamp(distance, 0, totalLength));
    let tx = tangent.x;
    let ty = tangent.y;
    let length = Math.hypot(tx, ty);

    if (length <= tolerance) {
      const delta = Math.min(1, totalLength / 1000 || 1);
      const p0 = samplePathPoint(distance - delta);
      const p1 = samplePathPoint(distance + delta);
      tx = p1.x - p0.x;
      ty = p1.y - p0.y;
      length = Math.hypot(tx, ty);
    }

    if (length <= tolerance) {
      return { x: 1, y: 0 };
    }

    return { x: tx / length, y: ty / length };
  };

  const offsetPoints: Pt[] = [];
  const limit = isClosed ? stepCount : stepCount + 1;
  for (let i = 0; i < limit; i++) {
    const distance = (i / stepCount) * totalLength;
    const point = samplePathPoint(distance);
    const tangent = getUnitTangent(distance);
    const normal = {
      x: normalSign * -tangent.y,
      y: normalSign * tangent.x,
    };

    offsetPoints.push({
      x: point.x + normal.x * offsetDist,
      y: point.y + normal.y * offsetDist,
    });
  }

  const deduped = offsetPoints.filter((point, index, points) => {
    if (index === 0) return true;
    return dist(point, points[index - 1]) > tolerance;
  });

  if (deduped.length < 2) {
    return '';
  }

  const first = deduped[0];
  const pathParts = [`M ${first.x} ${first.y}`];
  for (let i = 1; i < deduped.length; i++) {
    const point = deduped[i];
    pathParts.push(`L ${point.x} ${point.y}`);
  }

  if (isClosed && dist(deduped[0], deduped[deduped.length - 1]) > tolerance) {
    pathParts.push('Z');
  }

  return pathParts.join(' ');
}

/**
 * Finds the point on an SVG path that is closest to the boundary of a circle
 * (i.e. minimises |dist(point, center) - radius|).
 *
 * Returns the path point, its arc-length position, and the actual distance
 * from that point to the circle center — so the caller can snap the radius
 * to that distance for a clean intersection.
 */
export function findClosestPointOnPathToCircle(
  path: string,
  c: Circle
):  Pt | null {
  if (!path.trim()) return null;

  const props = new svgPathProperties(path);
  const totalLength = props.getTotalLength();
  if (!Number.isFinite(totalLength) || totalLength <= 0) return null;

  // Coarse pass: sample at ~0.5 mm intervals
  const coarseSpacing = Math.max(0.5, c.r / 100);
  const coarseSteps = Math.ceil(totalLength / coarseSpacing);

  let bestArcLen = 0;
  let bestDistToBoundary = Infinity;

  for (let i = 0; i <= coarseSteps; i++) {
    const d = Math.min((i / coarseSteps) * totalLength, totalLength);
    const p = props.getPointAtLength(d);
    const distToBoundary = Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - c.r);
    if (distToBoundary < bestDistToBoundary) {
      bestDistToBoundary = distToBoundary;
      bestArcLen = d;
    }
  }

  // Fine pass: golden-section search in a window around the coarse best
  const window = coarseSpacing * 2;
  let lo = Math.max(0, bestArcLen - window);
  let hi = Math.min(totalLength, bestArcLen + window);
  const phi = (Math.sqrt(5) - 1) / 2;

  for (let i = 0; i < 60; i++) {
    if (hi - lo < 1e-6) break;
    const m1 = hi - phi * (hi - lo);
    const m2 = lo + phi * (hi - lo);
    const p1 = props.getPointAtLength(m1);
    const p2 = props.getPointAtLength(m2);
    const f1 = Math.abs(Math.hypot(p1.x - c.x, p1.y - c.y) - c.r);
    const f2 = Math.abs(Math.hypot(p2.x - c.x, p2.y - c.y) - c.r);
    if (f1 < f2) { hi = m2; } else { lo = m1; }
  }

  const finalArcLen = (lo + hi) / 2;
  const finalPt = props.getPointAtLength(finalArcLen);

  return  { x: finalPt.x, y: finalPt.y }
}

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
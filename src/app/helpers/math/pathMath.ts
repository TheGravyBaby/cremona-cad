import { Pt, Circle, Rectangle, Arc } from "../../models/types";
import * as polygonClipping from 'polygon-clipping';
import { svgPathProperties } from 'svg-path-properties';
import { dist, angleFromCenter, normalizeRadians, TURN, pointOnCircle, intersectLines, lineCircleIntersection, lineFromTwoPoints, flipArcAboutY, flipPointAboutY, cubicBezierPoint, signedPolygonArea, closestPointOnSegment, pointInPolygon } from './simpleGeometry';
import { circleCircleIntersections } from './draftMath';
import { solveCatenaryA, makeMonotoneSpline, battenBeziers } from './vibeMath';

// This file holds everything oriented around building, combining, and boolean-diffing
// SVG path *strings* — as opposed to draftMath.ts, which works with plain geometric
// objects (Pt/Circle/Arc/Rectangle) and has no notion of an SVG command string.

/**
 * Solves the center of a circular SVG arc segment (rx === ry, x-axis-rotation 0),
 * the only kind of arc this app's path generators emit. Endpoint-to-center
 * conversion per the SVG 1.1 spec (appendix F.6), simplified for rx === ry.
 */
export function arcCenterFromEndpoints(p0: Pt, p1: Pt, r: number, largeArcFlag: number, sweepFlag: number): Pt {
  const x1p = (p0.x - p1.x) / 2;
  const y1p = (p0.y - p1.y) / 2;

  const sign = largeArcFlag !== sweepFlag ? 1 : -1;
  const denom = x1p * x1p + y1p * y1p;
  const sqrtTerm = denom === 0 ? 0 : sign * Math.sqrt(Math.max(0, (r * r - denom) / denom));

  const cxp = sqrtTerm * y1p;
  const cyp = -sqrtTerm * x1p;

  return { x: cxp + (p0.x + p1.x) / 2, y: cyp + (p0.y + p1.y) / 2 };
}

// =========== PATH HELPERS ==============
const polygonClipper: {
  difference: (
    subjectGeom: [number, number][][][] | [number, number][][][][],
    ...clipGeoms: ([number, number][][][] | [number, number][][][][])[]
  ) => [number, number][][][][];
  intersection: (
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

// Connects arc1.end to arc2.end with a quadratic bezier whose control point is
// the intersection of the tangent lines at each arc endpoint. This produces a
// naturally asymmetric rounded corner that matches the tangent of both arcs.
// Returns 1 for CCW arcs, -1 for CW arcs — matches the sweep logic in pathFromArc.
// The tangent at arc.end in the arc's traversal direction is (-s*sin(θ), s*cos(θ)).
function arcSweepSign(arc: Arc): 1 | -1 {
  return normalizeRadians(arc.end - arc.start) <= TURN.half ? 1 : -1;
}

export function pathFromCornerBezier(arc1: Arc, arc2: Arc): string {
  const P1 = pointOnCircle(arc1, arc1.end);
  const P2 = pointOnCircle(arc2, arc2.end);
  const s1 = arcSweepSign(arc1);
  const s2 = arcSweepSign(arc2);
  const T1: Pt = { x: P1.x - s1 * Math.sin(arc1.end), y: P1.y + s1 * Math.cos(arc1.end) };
  const T2: Pt = { x: P2.x - s2 * Math.sin(arc2.end), y: P2.y + s2 * Math.cos(arc2.end) };
  const ctrl = intersectLines(lineFromTwoPoints(P1, T1), lineFromTwoPoints(P2, T2));
  if (!ctrl) return `M ${P1.x} ${P1.y} L ${P2.x} ${P2.y}`;
  return `M ${P1.x} ${P1.y} Q ${ctrl.x} ${ctrl.y} ${P2.x} ${P2.y}`;
}

// Like pathFromCornerBezier but uses a cubic bezier. Both control points slide
// toward the tangent-intersection V by `sharpness` (0–1). Low sharpness gives a
// gradual curve; high sharpness gives long flat approaches with a tight peak at V.
export function pathFromCornerCubic(arc1: Arc, arc2: Arc, sharpness: number): string {
  const P1 = pointOnCircle(arc1, arc1.end);
  const P2 = pointOnCircle(arc2, arc2.end);
  const s1 = arcSweepSign(arc1);
  const s2 = arcSweepSign(arc2);
  const T1: Pt = { x: P1.x - s1 * Math.sin(arc1.end), y: P1.y + s1 * Math.cos(arc1.end) };
  const T2: Pt = { x: P2.x - s2 * Math.sin(arc2.end), y: P2.y + s2 * Math.cos(arc2.end) };
  const V = intersectLines(lineFromTwoPoints(P1, T1), lineFromTwoPoints(P2, T2));
  if (!V || !Number.isFinite(V.x) || !Number.isFinite(V.y)) return `M ${P1.x} ${P1.y} L ${P2.x} ${P2.y}`;
  const t = Number.isFinite(sharpness) ? Math.max(0, Math.min(1, sharpness)) : 0.1;
  // near-parallel tangents can put V behind an endpoint and invert the corner, so keep V's
  // distance but always travel along the outward tangent, never against it
  const d1x = T1.x - P1.x, d1y = T1.y - P1.y;
  const d2x = T2.x - P2.x, d2y = T2.y - P2.y;
  const a = Math.abs((V.x - P1.x) * d1x + (V.y - P1.y) * d1y);
  const b = Math.abs((V.x - P2.x) * d2x + (V.y - P2.y) * d2y);
  const cp1 = { x: P1.x + t * a * d1x, y: P1.y + t * a * d1y };
  const cp2 = { x: P2.x + t * b * d2x, y: P2.y + t * b * d2y };
  return `M ${P1.x} ${P1.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${P2.x} ${P2.y}`;
}

export function pathFromRect(R: Rectangle): string {
  const { Pt1, Pt2 } = R;
  return `M ${Pt1.x} ${Pt1.y} L ${Pt2.x} ${Pt1.y} L ${Pt2.x} ${Pt2.y} L ${Pt1.x} ${Pt2.y} Z`;
}

export function pathFromPolyline(points: Pt[], closed = false): string {
  return `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}${closed ? ' Z' : ''}`;
}

export function pathFromPolygon(points: Pt[]): string {
  return pathFromPolyline(points, true);
}

export function pathFromArc(arc: Arc): string {
  const startPt = pointOnCircle(arc, arc.start);
  const endPt = pointOnCircle(arc, arc.end);

  const largeArcFlag = 0; // always use the shorter (minor) arc
  const sweepFlag = normalizeRadians(arc.end - arc.start) <= TURN.half ? 1 : 0;

  return `M ${startPt.x} ${startPt.y} A ${arc.r} ${arc.r} 0 ${largeArcFlag} ${sweepFlag} ${endPt.x} ${endPt.y}`;
}

/**
 * Builds an SVG arc path `d` sweeping counterclockwise from startAngle to
 * endAngle — this app's existing convention for a "positive" sweep in its
 * Y-up drafting space (see renderArcFromArc in helpers/renderFuncs.ts).
 * Deliberately not pathFromArc's minor-sweep convention — see toolbox-shape.ts's
 * ArcShape header for why the two conventions can't be blindly converted between.
 */
export function arcPathData(center: Pt, radius: number, startAngle: number, endAngle: number): string {
  const span = normalizeRadians(endAngle - startAngle);
  const largeArcFlag = span > TURN.half ? 1 : 0;
  const sweepFlag = 1;
  const start = pointOnCircle({ ...center, r: radius }, startAngle);
  const end = pointOnCircle({ ...center, r: radius }, endAngle);
  return `M ${start.x},${start.y} A ${radius},${radius} 0 ${largeArcFlag},${sweepFlag} ${end.x},${end.y}`;
}

export function arcPathFrom3Points(c: Pt, start: Pt, end: Pt, pickHigherArc?: boolean): string {
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

  const delta = normalizeRadians(a1 - a0);

  // Optional y-extreme selector:
  //  - true  -> force arc through the highest point (min y, angle -π/2)
  //  - false -> force arc through the lowest point  (max y, angle +π/2)
  //  - undefined -> keep previous behavior and pick the shorter arc
  if (pickHigherArc === undefined) {
    const usePositiveSweep = delta <= TURN.half;
    const sweepFlag = usePositiveSweep ? 1 : 0;
    const largeArcFlag = 0; // shorter arc never requires large-arc-flag
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${endOnCircle.x} ${endOnCircle.y}`;
  }

  const aTarget = pickHigherArc ? -TURN.quarter : TURN.quarter;
  const normalised = normalizeRadians(aTarget - a0);
  const targetInPositiveSweep = normalised <= delta;
  const sweepFlag = targetInPositiveSweep ? 1 : 0;
  const arcSpan = targetInPositiveSweep ? delta : TURN.full - delta;
  const largeArcFlag = arcSpan > TURN.half ? 1 : 0;

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

export function flipLineAboutYAxis(P1: Pt, P2: Pt): string {
  return `M ${-P1.x} ${P1.y} L ${-P2.x} ${P2.y}`;
}

// ====== PATH COMBINATIONS ======
export function combinePathStrings(paths: string[]): string {
  return paths.map(p => p.trim()).join(' ');
}

// only undoes combinePathStrings on absolute-coordinate pieces: a relative `m` would lose its origin
export function splitPathStrings(path: string): string[] {
  return path.split(/(?=M)/).map(p => p.trim()).filter(Boolean);
}

export function unifyTwoConnectedPaths(path1: string, path2: string): string {
  const num = `([\\d.eE+\\-]+)`;
  const moveRe = new RegExp(`^\\s*M\\s+${num}\\s+${num}\\s+(.*)$`);
  const arcRe  = new RegExp(`^A\\s+${num}\\s+${num}\\s+${num}\\s+([01])\\s+([01])\\s+${num}\\s+${num}\\s*$`);
  const lineRe = new RegExp(`^L\\s+${num}\\s+${num}\\s*$`);
  const quadRe   = new RegExp(`^Q\\s+${num}\\s+${num}\\s+${num}\\s+${num}\\s*$`);
  const cubicRe  = new RegExp(`^C\\s+${num}\\s+${num}\\s+${num}\\s+${num}\\s+${num}\\s+${num}\\s*$`);

  const almostEqual = (a: number, b: number, eps: number = 1e-3) => Math.abs(a - b) <= eps;
  const samePoint = (a: Pt, b: Pt) => almostEqual(a.x, b.x) && almostEqual(a.y, b.y);

  const parsePath = (path: string) => {
    const trimmed = path.trim();
    const moveMatch = trimmed.match(moveRe);
    if (!moveMatch) {
      throw new Error(`Unsupported path format: ${path}`);
    }

    const start: Pt = { x: Number(moveMatch[1]), y: Number(moveMatch[2]) };
    const body = moveMatch[3].trim();
    const commands = body.match(/[ALQC][^ALQC]*/g)?.map(c => c.trim()) ?? [];

    if (commands.length === 0) {
      throw new Error(`Unsupported segment body: ${body}`);
    }

    let end: Pt = { ...start };
    let singleType: 'arc' | 'line' | 'quad' | 'cubic' | null = null;
    let singleArcMeta: {
      rx: number;
      ry: number;
      xAxisRotation: number;
      largeArcFlag: number;
      sweepFlag: number;
    } | null = null;
    let singleQuadMeta: { cx: number; cy: number } | null = null;
    let singleCubicMeta: { cp1x: number; cp1y: number; cp2x: number; cp2y: number } | null = null;

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

      const quadMatch = command.match(quadRe);
      if (quadMatch) {
        end = { x: Number(quadMatch[3]), y: Number(quadMatch[4]) };
        if (commands.length === 1) {
          singleType = 'quad';
          singleQuadMeta = { cx: Number(quadMatch[1]), cy: Number(quadMatch[2]) };
        }
        continue;
      }

      const cubicMatch = command.match(cubicRe);
      if (cubicMatch) {
        end = { x: Number(cubicMatch[5]), y: Number(cubicMatch[6]) };
        if (commands.length === 1) {
          singleType = 'cubic';
          singleCubicMeta = {
            cp1x: Number(cubicMatch[1]), cp1y: Number(cubicMatch[2]),
            cp2x: Number(cubicMatch[3]), cp2y: Number(cubicMatch[4]),
          };
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
      singleQuadMeta,
      singleCubicMeta,
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

    if (seg.singleType === 'quad' && seg.singleQuadMeta) {
      return `M ${seg.end.x} ${seg.end.y} Q ${seg.singleQuadMeta.cx} ${seg.singleQuadMeta.cy} ${seg.start.x} ${seg.start.y}`;
    }

    if (seg.singleType === 'cubic' && seg.singleCubicMeta) {
      const m = seg.singleCubicMeta;
      return `M ${seg.end.x} ${seg.end.y} C ${m.cp2x} ${m.cp2y} ${m.cp1x} ${m.cp1y} ${seg.start.x} ${seg.start.y}`;
    }

    return `M ${seg.end.x} ${seg.end.y} L ${seg.start.x} ${seg.start.y}`;
  };

  const p1 = parsePath(path1);
  const p2 = parsePath(path2);

  // Snaps p2's body so its leading coordinates match p1.end exactly,
  // eliminating any sub-threshold floating point gap.
  const snapBody = (body: string, from: Pt, to: Pt): string => {
    if (almostEqual(from.x, to.x) && almostEqual(from.y, to.y)) return body;
    // Replace only the very first pair of numbers in the body (the start of the first command)
    return body.replace(
      /^([ALQC]\s+(?:[\d.eE+\-]+\s+){0,5})([\d.eE+\-]+)\s+([\d.eE+\-]+)/,
      (_m, prefix, _x, _y) => `${prefix}${to.x} ${to.y}`
    );
  };

  if (samePoint(p1.end, p2.start)) {
    return `${p1.full} ${snapBody(p2.body, p2.start, p1.end)}`;
  }

  if (samePoint(p2.end, p1.start)) {
    return `${p2.full} ${snapBody(p1.body, p1.start, p2.end)}`;
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
 * Orders and joins a set of connected SVG segments into one path string,
 * greedily attaching whichever segment can connect to either end of the chain.
 */
export function unifyConnectedSvgPaths(paths: string[]): string {
  if (paths.length === 0) return '';

  // Bridge-priority sort ─────────────────────────────────────────────────────
  // A "bridge" segment connects two junction points: nodes where more than two
  // segments meet (endpoint frequency > 2).  If the greedy loop picks any other
  // segment as its seed first, it eventually buries those junction points as
  // interior nodes of the growing chain, leaving the bridge stranded with no
  // free end to attach to.
  //
  // Fix: rank every segment by (freq(start) + freq(end)) and seed the chain
  // with the highest-ranking segment.  The bridge rises naturally to the top
  // because its endpoints each appear in 3+ segments while regular chain arcs
  // have endpoints that appear exactly twice.
  const bridgeEps = 1e-3;
  const quantize   = (v: number) => Math.round(v / bridgeEps) * bridgeEps;
  const ptKey      = (pt: { x: number; y: number }) => `${quantize(pt.x)},${quantize(pt.y)}`;
  const getEndpoints = (path: string) => {
    const props = new svgPathProperties(path.trim());
    const len   = props.getTotalLength();
    return { start: props.getPointAtLength(0), end: props.getPointAtLength(len) };
  };

  const trimmed   = paths.map(p => p.trim());
  const endpoints = trimmed.map(getEndpoints);

  const freq = new Map<string, number>();
  for (const ep of endpoints) {
    freq.set(ptKey(ep.start), (freq.get(ptKey(ep.start)) ?? 0) + 1);
    freq.set(ptKey(ep.end),   (freq.get(ptKey(ep.end))   ?? 0) + 1);
  }

  const sortedPaths = trimmed
    .map((p, i) => ({
      p,
      score: (freq.get(ptKey(endpoints[i].start)) ?? 0)
           + (freq.get(ptKey(endpoints[i].end))   ?? 0),
    }))
    .sort((a, b) => b.score - a.score)   // highest combined frequency first
    .map(x => x.p);
  // ──────────────────────────────────────────────────────────────────────────

  let unified   = sortedPaths[0];
  let remaining = sortedPaths.slice(1);

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

    // false fails closed — an unjoinable path throws rather than being drawn as
    // disconnected pieces. True draws it anyway, which reads on the canvas as a
    // stray whisker off whichever end was left stranded.
    let debug = false; // set by developer
    if (!stitched) {
      console.warn("Could not unify all paths. Remaining paths do not share endpoints.");
      remaining.forEach((path, index) => {
        const props = new svgPathProperties(path);
        const totalLength = props.getTotalLength();
        const startPt = props.getPointAtLength(0);
        const endPt = props.getPointAtLength(totalLength);
        console.warn(`  Path ${index}: start (${startPt.x}, ${startPt.y}), end (${endPt.x}, ${endPt.y})`);
      });

      if (!debug) {
        throw new Error("Could not unify all paths. Remaining paths do not share endpoints.");
      }

      console.log({ unified, remaining });

      let remainingPathsDeepCopy = [...remaining];
      remaining = [];
      unified = combinePathStrings([unified, ...remainingPathsDeepCopy]);

    }
  }

  return unified;
}

// the same for segments that make several separate chains, each unified on its own and drawn as a
// subpath of one path: a drawing in progress whose chains haven't met yet. A finished outline goes
// through unifyConnectedSvgPaths instead, so a gap in it still fails loudly
export function unifyConnectedSvgPathGroups(paths: string[]): string {
  const ends = paths.map(path => {
    const props = new svgPathProperties(path.trim());
    return [props.getPointAtLength(0), props.getPointAtLength(props.getTotalLength())];
  });
  const touches = (i: number, j: number) =>
    ends[i].some(a => ends[j].some(b => Math.abs(a.x - b.x) <= 1e-3 && Math.abs(a.y - b.y) <= 1e-3));

  const parent = paths.map((_, i) => i);
  const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]));
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      if (touches(i, j)) parent[root(j)] = root(i);
    }
  }

  const chains = new Map<number, string[]>();
  paths.forEach((path, i) => chains.set(root(i), [...(chains.get(root(i)) ?? []), path]));
  return [...chains.values()].map(unifyConnectedSvgPaths).join(' ');
}

/**
 * Stitches a one-sided chain of arcs/line-segments, mirrored about the Y axis, into one closed
 * loop — the shared shape behind every symmetric cutout in this app: only one half needs to be
 * built, and the mirror plus the seam are handled here. `closers` are additional segments that
 * already span both halves (e.g. a horizontal face crossing the centerline) and are added as-is,
 * not mirrored. The chain and closers together must connect end-to-end once combined.
 */
export function mirroredLoop(chain: (Arc | [Pt, Pt])[], closers: [Pt, Pt][] = []): string {
  const segs = chain.flatMap(seg => Array.isArray(seg)
    ? [pathFromLine(seg[0], seg[1]), pathFromLine(flipPointAboutY(seg[0]), flipPointAboutY(seg[1]))]
    : [pathFromArc(seg), pathFromArc(flipArcAboutY(seg))]);
  for (const [a, b] of closers) segs.push(pathFromLine(a, b));
  return unifyConnectedSvgPaths(segs);
}

// `differenceFromTwoPaths`/`intersectionFromTwoPaths` need polygon-clipping's robust
// topology resolution (it correctly handles a block swallowing part of an arc, two
// blocks overlapping the same arc, a block straddling a join between two arcs, etc.)
// but its raw output is a flat point cloud with all curve identity destroyed. Every
// shape fed into these ops here is built from a small, known set of arcs and lines, so
// the result's boundary can only ever be made of sub-pieces of those same primitives.
// Rather than approximate the clipped polygon, we tag every sampled point with the
// primitive it came from, let polygon-clipping resolve topology on the coordinates
// alone, then walk the result and re-emit one exact A/L command per contiguous run of
// same-tagged points — collapsing thousands of points back down to a handful of arcs
// and lines instead of a dense polyline.

type PathLineSeg = { type: 'line'; p0: Pt; p1: Pt };
type PathArcSeg = { type: 'arc'; p0: Pt; p1: Pt; center: Pt; r: number; ccw: boolean };
type PathSeg = PathLineSeg | PathArcSeg;

function parsePathToSegments(path: string): PathSeg[] {
  const segments: PathSeg[] = [];
  let current: Pt = { x: 0, y: 0 };
  let subpathStart: Pt = { x: 0, y: 0 };

  const commands = path.trim().match(/[MLAQZ][^MLAQZ]*/gi) ?? [];

  for (const command of commands) {
    const cmd = command[0].toUpperCase();
    const nums = command.slice(1).trim().split(/[\s,]+/).filter(s => s.length > 0).map(Number);

    if (cmd === 'M') {
      current = { x: nums[0], y: nums[1] };
      subpathStart = current;
    } else if (cmd === 'L') {
      for (let i = 0; i < nums.length; i += 2) {
        const next = { x: nums[i], y: nums[i + 1] };
        segments.push({ type: 'line', p0: current, p1: next });
        current = next;
      }
    } else if (cmd === 'A') {
      for (let i = 0; i < nums.length; i += 7) {
        const r = nums[i];
        const largeArcFlag = nums[i + 3];
        const sweepFlag = nums[i + 4];
        const next = { x: nums[i + 5], y: nums[i + 6] };
        const center = arcCenterFromEndpoints(current, next, r, largeArcFlag, sweepFlag);
        segments.push({ type: 'arc', p0: current, p1: next, center, r, ccw: sweepFlag === 1 });
        current = next;
      }
    } else if (cmd === 'Z') {
      if (current.x !== subpathStart.x || current.y !== subpathStart.y) {
        segments.push({ type: 'line', p0: current, p1: subpathStart });
      }
      current = subpathStart;
    }
    // Q is unused by every shape fed into these boolean ops (arcs, lines, rects, circles).
  }

  return segments;
}

type TaggedPt = { x: number; y: number; segIndex: number };

function sampleSegments(segments: PathSeg[], distancePerSample: number): TaggedPt[] {
  const pts: TaggedPt[] = [];

  segments.forEach((seg, segIndex) => {
    let length: number;
    let startAngle = 0;
    let span = 0;

    if (seg.type === 'line') {
      length = dist(seg.p0, seg.p1);
    } else {
      startAngle = angleFromCenter(seg.center, seg.p0);
      const endAngle = angleFromCenter(seg.center, seg.p1);
      span = seg.ccw ? normalizeRadians(endAngle - startAngle) : normalizeRadians(startAngle - endAngle);
      length = seg.r * span;
    }

    const steps = Math.max(1, Math.min(720, Math.ceil(length / distancePerSample)));
    const startIdx = segIndex === 0 ? 0 : 1; // this segment's start === previous segment's end

    for (let i = startIdx; i <= steps; i++) {
      const t = i / steps;
      if (seg.type === 'line') {
        pts.push({ x: seg.p0.x + (seg.p1.x - seg.p0.x) * t, y: seg.p0.y + (seg.p1.y - seg.p0.y) * t, segIndex });
      } else {
        const angle = seg.ccw ? startAngle + span * t : startAngle - span * t;
        pts.push({ x: seg.center.x + seg.r * Math.cos(angle), y: seg.center.y + seg.r * Math.sin(angle), segIndex });
      }
    }
  });

  return pts;
}

function quantizeKey(x: number, y: number): string {
  const q = (v: number) => Math.round(v * 1e6);
  return `${q(x)},${q(y)}`;
}

function distanceToBoundedSegment(px: number, py: number, p0: Pt, p1: Pt): number {
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - p0.x, py - p0.y);
  const t = Math.max(0, Math.min(1, ((px - p0.x) * dx + (py - p0.y) * dy) / lenSq));
  return Math.hypot(px - (p0.x + dx * t), py - (p0.y + dy * t));
}

// Most output points pass through polygon-clipping unchanged and resolve via the exact
// coordinate lookup; only the handful of brand-new vertices it creates at true
// intersections need this geometric fallback.
function classifyPoint(px: number, py: number, segments: PathSeg[], lookup: Map<string, number>): number {
  const hit = lookup.get(quantizeKey(px, py));
  if (hit !== undefined) return hit;

  let best = 0, bestErr = Infinity;
  segments.forEach((seg, i) => {
    const err = seg.type === 'line'
      ? distanceToBoundedSegment(px, py, seg.p0, seg.p1)
      : Math.abs(Math.hypot(px - seg.center.x, py - seg.center.y) - seg.r);
    if (err < bestErr) { bestErr = err; best = i; }
  });
  return best;
}

type Run = { segIndex: number; points: [number, number][] };

const MAX_SNAP_DIST = 1; // mm — comfortably above sampling-induced sagitta error, comfortably below any real feature size

// The vertex polygon-clipping computes where a clip edge crosses a sampled arc is only
// approximate — it's intersecting a polyline approximation of the circle, not the true
// circle — leaving a hair's-width gap to the arc's nearest exact sample point. Recompute
// the crossing analytically from the two exact primitives that actually meet there, so
// the arc can start exactly on target instead of needing a connector segment to close
// the gap.
function exactIntersection(segA: PathSeg, segB: PathSeg, hint: [number, number]): [number, number] | null {
  let candidates: Pt[];

  if (segA.type === 'line' && segB.type === 'line') {
    const pt = intersectLines(lineFromTwoPoints(segA.p0, segA.p1), lineFromTwoPoints(segB.p0, segB.p1));
    candidates = pt ? [pt] : [];
  } else if (segA.type === 'arc' && segB.type === 'arc') {
    candidates = circleCircleIntersections(
      { x: segA.center.x, y: segA.center.y, r: segA.r },
      { x: segB.center.x, y: segB.center.y, r: segB.r }
    );
  } else {
    const lineSeg = (segA.type === 'line' ? segA : segB) as PathLineSeg;
    const arcSeg = (segA.type === 'arc' ? segA : segB) as PathArcSeg;
    candidates = lineCircleIntersection(lineFromTwoPoints(lineSeg.p0, lineSeg.p1), { x: arcSeg.center.x, y: arcSeg.center.y, r: arcSeg.r });
  }

  let best: Pt | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.x - hint[0], c.y - hint[1]);
    if (d < bestDist) { bestDist = d; best = c; }
  }

  return best && bestDist < MAX_SNAP_DIST ? [best.x, best.y] : null;
}

function snapRunBoundaries(runs: Run[], segments: PathSeg[]): void {
  const n = runs.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (runs[i].segIndex === runs[j].segIndex) continue;

    const last = runs[i].points[runs[i].points.length - 1];
    const first = runs[j].points[0];
    const gap = Math.hypot(last[0] - first[0], last[1] - first[1]);
    if (gap < 1e-6 || gap > MAX_SNAP_DIST) continue; // already exact, or too far to be this kind of gap

    const hint: [number, number] = [(last[0] + first[0]) / 2, (last[1] + first[1]) / 2];
    const snapped = exactIntersection(segments[runs[i].segIndex], segments[runs[j].segIndex], hint);
    if (!snapped) continue;

    runs[i].points[runs[i].points.length - 1] = snapped;
    runs[j].points[0] = snapped;
  }
}

function ringToPrimitivePath(ring: [number, number][], segments: PathSeg[], lookup: Map<string, number>): string {
  const segIndices = ring.map(([x, y]) => classifyPoint(x, y, segments, lookup));

  const runs: Run[] = [];
  for (let i = 0; i < ring.length; i++) {
    const segIndex = segIndices[i];
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun.segIndex === segIndex) {
      lastRun.points.push(ring[i]);
    } else {
      runs.push({ segIndex, points: [ring[i]] });
    }
  }
  // The ring is cyclic — merge the wraparound if start and end landed on the same primitive.
  if (runs.length > 1 && runs[0].segIndex === runs[runs.length - 1].segIndex) {
    runs[0].points = [...runs[runs.length - 1].points, ...runs[0].points];
    runs.pop();
  }

  snapRunBoundaries(runs, segments);

  const start = runs[0].points[0];
  let d = `M ${start[0]} ${start[1]}`;
  let pen = start;
  const cornerEps = 1e-6;
  const penMatches = (p: [number, number]) => Math.hypot(p[0] - pen[0], p[1] - pen[1]) < cornerEps;

  for (const run of runs) {
    const seg = segments[run.segIndex];
    const first = run.points[0];
    const last = run.points[run.points.length - 1];

    // Corner-tie classification (a shared vertex between two segments) can hand a run
    // a first point that isn't exactly where the pen currently sits — connect to it
    // explicitly rather than silently cutting a shortcut across the gap.
    if (!penMatches(first)) {
      d += ` L ${first[0]} ${first[1]}`;
      pen = first;
    }

    if (seg.type === 'line' || run.points.length < 2) {
      if (!penMatches(last)) {
        d += ` L ${last[0]} ${last[1]}`;
        pen = last;
      }
      continue;
    }

    const { center, r } = seg;
    const angleOf = (p: [number, number]) => Math.atan2(p[1] - center.y, p[0] - center.x);
    const a0 = angleOf(first);
    const aEnd = angleOf(last);

    // direction comes from an interior sample, not points[1]: a run's first point is the
    // clip crossing (approximate, then snapped exact), which can land just past points[1] —
    // the first step then reads backwards, flipping the sweep and drawing the major arc
    const ccw = run.points.length > 2
      ? normalizeRadians(angleOf(run.points[Math.floor(run.points.length / 2)]) - a0) <= normalizeRadians(aEnd - a0)
      : normalizeRadians(aEnd - a0) <= TURN.half;
    const span = ccw ? normalizeRadians(aEnd - a0) : normalizeRadians(a0 - aEnd);
    const largeArcFlag = span > TURN.half ? 1 : 0;
    const sweepFlag = ccw ? 1 : 0;

    pen = last;

    d += ` A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${last[0]} ${last[1]}`;
  }

  return d + ' Z';
}

// Takes every clip path in one shot (polygon-clipping natively subtracts/intersects
// against the union of any number of clip geoms in a single pass). Doing this instead
// of folding clip paths in one at a time matters: each pass re-samples and
// re-classifies the *entire* subject boundary, including joints nowhere near that
// particular clip shape, so chaining N calls gives N chances for floating-point noise
// to nick the same untouched joint and compound into a cluster of stray micro-segments.
function booleanOpFromPaths(subjectPath: string, clipPaths: string[], op: 'difference' | 'intersection', distancePerSample = 0.5): string {
  type Pair = [number, number];
  type MultiPolygon = Pair[][][];

  const subjectSegments = parsePathToSegments(subjectPath);
  const clipSegmentLists = clipPaths.map(parsePathToSegments);

  let segments: PathSeg[] = [...subjectSegments];
  const clipOffsets = clipSegmentLists.map(segs => {
    const offset = segments.length;
    segments = segments.concat(segs);
    return offset;
  });

  const subjectPts = sampleSegments(subjectSegments, distancePerSample);
  if (subjectPts.length < 3) throw new Error('Path has fewer than 3 sample points.');

  const lookup = new Map<string, number>();
  for (const p of subjectPts) lookup.set(quantizeKey(p.x, p.y), p.segIndex);

  const clipRings: Pair[][] = clipSegmentLists.map((segs, i) => {
    const pts = sampleSegments(segs, distancePerSample).map(p => ({ ...p, segIndex: p.segIndex + clipOffsets[i] }));
    if (pts.length < 3) throw new Error('Path has fewer than 3 sample points.');
    for (const p of pts) lookup.set(quantizeKey(p.x, p.y), p.segIndex);
    return pts.map(p => [p.x, p.y] as Pair);
  });

  const subject: MultiPolygon = [[subjectPts.map(p => [p.x, p.y] as Pair)]];
  const clips: MultiPolygon[] = clipRings.map(ring => [[ring]]);

  const result = (op === 'difference'
    ? polygonClipper.difference(subject, ...clips)
    : polygonClipper.intersection(subject, ...clips)) as unknown as MultiPolygon | null;

  if (!result || result.length === 0) return '';

  const subpaths: string[] = [];
  for (const polygon of result) {
    for (const ring of polygon) {
      if (ring.length < 3) continue;
      subpaths.push(ringToPrimitivePath(ring, segments, lookup));
    }
  }

  return subpaths.join(' ');
}

export function differenceFromManyPaths(subjectPath: string, clipPaths: string[], distancePerSample = 0.5): string {
  return booleanOpFromPaths(subjectPath, clipPaths, 'difference', distancePerSample);
}

export function differenceFromTwoPaths(path1: string, path2: string, distancePerSample = 0.5): string {
  return booleanOpFromPaths(path1, [path2], 'difference', distancePerSample);
}

export function intersectionFromTwoPaths(path1: string, path2: string): string {
  return booleanOpFromPaths(path1, [path2], 'intersection');
}

// `bottom` is a stroke, not an area: it is cut wherever it crosses `top`'s outline and each piece
// sorted by whether `top` covers it, so unlike the booleans above nothing of `top`'s own outline
// enters the result. `bottom`'s lines, arcs and cubics come back exact; `top`'s curves are
// flattened to `stepMm`. Several `top` paths cover as their union, and subpaths within one cover
// even-odd, so a ring leaves its hole uncovered. A piece lying along `top`'s edge stays visible.
export function occludePath(bottom: string, top: string | string[], stepMm = 0.25): { visible: string; hidden: string } {
  const covers = (Array.isArray(top) ? top : [top]).map(path =>
    parseStrokeSubpaths(path).map(sub => flattenSubpath(sub, stepMm)).filter(poly => poly.length >= 3));
  const edges = covers.flat().flatMap(poly => poly.map((q, i) => [q, poly[(i + 1) % poly.length]] as [Pt, Pt]));
  const covered = (pt: Pt) =>
    !edges.some(([a, b]) => closestPointOnSegment(pt, a, b).dist < 1e-7)
    && covers.some(polys => polys.filter(poly => pointInPolygon(pt, poly)).length % 2 === 1);

  const visible: string[] = [];
  const hidden: string[] = [];
  for (const sub of parseStrokeSubpaths(bottom)) {
    type Run = { hidden: boolean; start: Pt; commands: string[] };
    const runs: Run[] = [];
    for (const seg of sub.segs) {
      const ts = [0, ...edges.flatMap(([a, b]) => strokeSegCrossings(seg, a, b)), 1].sort((x, y) => x - y);
      for (let i = 0; i + 1 < ts.length; i++) {
        const [ta, tb] = [ts[i], ts[i + 1]];
        if (tb - ta < 1e-9) continue;
        const isHidden = covered(strokeSegAt(seg, (ta + tb) / 2));
        const command = strokeSegCommand(seg, ta, tb);
        const last = runs[runs.length - 1];
        if (last && last.hidden === isHidden) last.commands.push(command);
        else runs.push({ hidden: isHidden, start: strokeSegAt(seg, ta), commands: [command] });
      }
    }
    // a closed loop's last run carries on through its start into the first
    if (sub.closed && runs.length > 1 && runs[0].hidden === runs[runs.length - 1].hidden) {
      const last = runs.pop()!;
      runs[0] = { ...last, commands: [...last.commands, ...runs[0].commands] };
    }
    for (const run of runs) {
      const close = sub.closed && runs.length === 1 ? ' Z' : '';
      (run.hidden ? hidden : visible).push(`M ${run.start.x} ${run.start.y} ${run.commands.join(' ')}${close}`);
    }
  }
  return { visible: visible.join(' '), hidden: hidden.join(' ') };
}

type StrokeSeg =
  | { type: 'line'; p0: Pt; p1: Pt }
  | { type: 'arc'; p0: Pt; p1: Pt; center: Pt; r: number; ccw: boolean; a0: number; span: number }
  | { type: 'cubic'; p0: Pt; c1: Pt; c2: Pt; p1: Pt };
type StrokeSubpath = { segs: StrokeSeg[]; closed: boolean };

// absolute commands only, which is all this app's path builders emit
function parseStrokeSubpaths(path: string): StrokeSubpath[] {
  const subpaths: StrokeSubpath[] = [];
  let current: Pt = { x: 0, y: 0 };
  let start: Pt = current;
  let open: StrokeSubpath | null = null;
  const push = (seg: StrokeSeg) => {
    if (!open) subpaths.push(open = { segs: [], closed: false });
    open.segs.push(seg);
    current = seg.p1;
  };
  const line = (p1: Pt) => push({ type: 'line', p0: current, p1 });

  for (const command of path.trim().match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) ?? []) {
    const cmd = command[0];
    const n = command.slice(1).trim().split(/[\s,]+/).filter(s => s.length > 0).map(Number);
    if (cmd === 'M') {
      open = null;
      current = start = { x: n[0], y: n[1] };
      for (let i = 2; i + 1 < n.length; i += 2) line({ x: n[i], y: n[i + 1] });
    } else if (cmd === 'L') {
      for (let i = 0; i + 1 < n.length; i += 2) line({ x: n[i], y: n[i + 1] });
    } else if (cmd === 'H') {
      for (const x of n) line({ x, y: current.y });
    } else if (cmd === 'V') {
      for (const y of n) line({ x: current.x, y });
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < n.length; i += 6) {
        push({ type: 'cubic', p0: current, c1: { x: n[i], y: n[i + 1] }, c2: { x: n[i + 2], y: n[i + 3] }, p1: { x: n[i + 4], y: n[i + 5] } });
      }
    } else if (cmd === 'Q') {
      // a quadratic is a cubic with its control point carried two thirds of the way to each end
      for (let i = 0; i + 3 < n.length; i += 4) {
        const q = { x: n[i], y: n[i + 1] };
        const p1 = { x: n[i + 2], y: n[i + 3] };
        const toward = (a: Pt) => ({ x: a.x + 2 / 3 * (q.x - a.x), y: a.y + 2 / 3 * (q.y - a.y) });
        push({ type: 'cubic', p0: current, c1: toward(current), c2: toward(p1), p1 });
      }
    } else if (cmd === 'A') {
      for (let i = 0; i + 6 < n.length; i += 7) {
        const p1 = { x: n[i + 5], y: n[i + 6] };
        const r = Math.max(n[i], dist(current, p1) / 2);
        const ccw = n[i + 4] === 1;
        const center = arcCenterFromEndpoints(current, p1, r, n[i + 3], n[i + 4]);
        const a0 = angleFromCenter(center, current);
        const a1 = angleFromCenter(center, p1);
        push({ type: 'arc', p0: current, p1, center, r, ccw, a0, span: ccw ? normalizeRadians(a1 - a0) : normalizeRadians(a0 - a1) });
      }
    } else if (cmd === 'Z' || cmd === 'z') {
      if (dist(current, start) > 1e-9) line(start);
      if (open) open.closed = true;
      open = null;
      current = start;
    } else {
      throw new Error(`occludePath: unsupported path command '${cmd}'`);
    }
  }
  return subpaths;
}

function strokeSegAt(seg: StrokeSeg, t: number): Pt {
  if (seg.type === 'line') return { x: seg.p0.x + t * (seg.p1.x - seg.p0.x), y: seg.p0.y + t * (seg.p1.y - seg.p0.y) };
  if (seg.type === 'cubic') return cubicBezierPoint(seg.p0, seg.c1, seg.c2, seg.p1, t);
  const angle = seg.a0 + (seg.ccw ? 1 : -1) * t * seg.span;
  return { x: seg.center.x + seg.r * Math.cos(angle), y: seg.center.y + seg.r * Math.sin(angle) };
}

// the command drawing `seg` from t = ta to t = tb, the pen already at its ta end
function strokeSegCommand(seg: StrokeSeg, ta: number, tb: number): string {
  const end = strokeSegAt(seg, tb);
  if (seg.type === 'line') return `L ${end.x} ${end.y}`;
  if (seg.type === 'arc') {
    const largeArcFlag = (tb - ta) * seg.span > TURN.half ? 1 : 0;
    return `A ${seg.r} ${seg.r} 0 ${largeArcFlag} ${seg.ccw ? 1 : 0} ${end.x} ${end.y}`;
  }
  // de Casteljau twice: keep what's before tb, then what's after ta within that
  const [head] = splitCubic([seg.p0, seg.c1, seg.c2, seg.p1], tb);
  const [, piece] = splitCubic(head, tb > 0 ? ta / tb : 0);
  return `C ${piece[1].x} ${piece[1].y} ${piece[2].x} ${piece[2].y} ${end.x} ${end.y}`;
}

function splitCubic([p0, c1, c2, p1]: Pt[], t: number): [Pt[], Pt[]] {
  const lerp = (a: Pt, b: Pt) => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  const a = lerp(p0, c1), b = lerp(c1, c2), c = lerp(c2, p1);
  const d = lerp(a, b), e = lerp(b, c);
  const mid = lerp(d, e);
  return [[p0, a, d, mid], [mid, e, c, p1]];
}

// the t values along `seg` where it crosses the segment q0–q1
function strokeSegCrossings(seg: StrokeSeg, q0: Pt, q1: Pt): number[] {
  const EPS = 1e-9;
  const ex = q1.x - q0.x, ey = q1.y - q0.y;
  const along = (pt: Pt) => ((pt.x - q0.x) * ex + (pt.y - q0.y) * ey) / (ex * ex + ey * ey);
  const onEdge = (u: number) => u >= -EPS && u <= 1 + EPS;
  const inSeg = (t: number) => t >= -EPS && t <= 1 + EPS;

  if (seg.type === 'line') {
    const dx = seg.p1.x - seg.p0.x, dy = seg.p1.y - seg.p0.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) return [];
    const wx = q0.x - seg.p0.x, wy = q0.y - seg.p0.y;
    const t = (wx * ey - wy * ex) / denom;
    const u = (wx * dy - wy * dx) / denom;
    return inSeg(t) && onEdge(u) ? [t] : [];
  }

  if (seg.type === 'arc') {
    const fx = q0.x - seg.center.x, fy = q0.y - seg.center.y;
    const a = ex * ex + ey * ey;
    const b = 2 * (fx * ex + fy * ey);
    const c = fx * fx + fy * fy - seg.r * seg.r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return [];
    const roots = disc === 0 ? [-b / (2 * a)] : [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)];
    return roots.filter(onEdge).flatMap(u => {
      const angle = Math.atan2(q0.y + u * ey - seg.center.y, q0.x + u * ex - seg.center.x);
      const turned = normalizeRadians((seg.ccw ? 1 : -1) * (angle - seg.a0));
      // a crossing a hair before the start wraps to just under a full turn
      const t = (TURN.full - turned < EPS ? 0 : turned) / seg.span;
      return seg.span > 0 && inSeg(t) ? [t] : [];
    });
  }

  // the cubic's signed distance off the edge's line, bracketed by sampling then bisected
  const side = (t: number) => {
    const pt = cubicBezierPoint(seg.p0, seg.c1, seg.c2, seg.p1, t);
    return (pt.x - q0.x) * ey - (pt.y - q0.y) * ex;
  };
  const SAMPLES = 48;
  const ts: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    let lo = i / SAMPLES, hi = (i + 1) / SAMPLES;
    let fLo = side(lo);
    const fHi = side(hi);
    if (fLo === 0) { ts.push(lo); continue; }
    if (i === SAMPLES - 1 && fHi === 0) ts.push(hi);
    if (Math.sign(fLo) === Math.sign(fHi) || fHi === 0) continue;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      const fMid = side(mid);
      if (Math.sign(fMid) === Math.sign(fLo)) { lo = mid; fLo = fMid; } else hi = mid;
    }
    ts.push((lo + hi) / 2);
  }
  return ts.filter(t => onEdge(along(cubicBezierPoint(seg.p0, seg.c1, seg.c2, seg.p1, t))));
}

// a closed subpath as a polygon: lines by their own ends, curves cut into chords of at most stepMm
function flattenSubpath(sub: StrokeSubpath, stepMm: number): Pt[] {
  const poly: Pt[] = [];
  for (const seg of sub.segs) {
    const length = seg.type === 'line' ? 0
      : seg.type === 'arc' ? seg.r * seg.span
      : dist(seg.p0, seg.c1) + dist(seg.c1, seg.c2) + dist(seg.c2, seg.p1);
    const steps = seg.type === 'line' ? 1 : Math.max(2, Math.ceil(length / stepMm));
    for (let i = 0; i < steps; i++) poly.push(strokeSegAt(seg, i / steps));
  }
  return poly;
}


/**
 * Translates all coordinates in an absolute SVG path string by (dx, dy).
 * Supports M, L, C, A, Q, and Z commands.
 */
export function translatePath(path: string, dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return path;
  // Exclude e/E from the command-letter match: they appear in scientific-notation
  // numbers (e.g. 5.03e-14) and are not valid SVG path commands.
  return path.replace(/([A-DF-Za-df-z])([^A-DF-Za-df-z]*)/g, (_, cmd: string, args: string) => {
    const nums = args.trim().split(/[\s,]+/).filter((s: string) => s.length > 0).map(Number);
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
      case 'C':
        // C x1 y1 x2 y2 x y — every param is a coordinate pair, so pairwise translation applies.
        for (let i = 0; i < nums.length; i += 2) { nums[i] += dx; nums[i + 1] += dy; }
        break;
      case 'A':
        // A rx ry x-rotation large-arc-flag sweep-flag x y  (7 params per segment)
        for (let i = 0; i < nums.length; i += 7) { nums[i + 5] += dx; nums[i + 6] += dy; }
        break;
      case 'Q':
        // Q x1 y1 x y  (4 params per segment)
        for (let i = 0; i < nums.length; i += 4) {
          nums[i] += dx; nums[i + 1] += dy;
          nums[i + 2] += dx; nums[i + 3] += dy;
        }
        break;
      case 'Z':
        return cmd;
    }
    return cmd + ' ' + nums.join(' ');
  });
}

/** A 2D affine matrix in SVG's own order: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix2D = [number, number, number, number, number, number];

export const IDENTITY_MATRIX: Matrix2D = [1, 0, 0, 1, 0, 0];

/** `m` applied after `n` — the product an SVG `transform="m n"` list means. */
export function multiplyMatrices(m: Matrix2D, n: Matrix2D): Matrix2D {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function applyMatrix(m: Matrix2D, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/**
 * Parses an SVG `transform` attribute — translate, rotate (about an optional pivot), scale and
 * matrix, left to right as the attribute means them. Skews aren't parsed: nothing in this app
 * emits one, and a skewed arc isn't an arc.
 */
export function parseSvgTransform(transform: string | null | undefined): Matrix2D {
  let result = IDENTITY_MATRIX;
  if (!transform) return result;
  const re = /(translate|rotate|scale|matrix)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(transform))) {
    const v = match[2].trim().split(/[\s,]+/).filter(s => s.length > 0).map(Number);
    let m: Matrix2D;
    switch (match[1]) {
      case 'translate':
        m = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
        break;
      case 'scale':
        m = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const a = (v[0] ?? 0) * TURN.degree;
        const cos = Math.cos(a), sin = Math.sin(a);
        const cx = v[1] ?? 0, cy = v[2] ?? 0;
        m = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
        break;
      }
      case 'matrix':
        m = [v[0] ?? 1, v[1] ?? 0, v[2] ?? 0, v[3] ?? 1, v[4] ?? 0, v[5] ?? 0];
        break;
      default:
        continue;
    }
    result = multiplyMatrices(result, m);
  }
  return result;
}

/**
 * Applies an affine matrix to an absolute SVG path string (M, L, C, Q, A, Z). Arcs are taken as
 * circular and the matrix as a similarity — rotation, uniform scale, translation, mirror —
 * which is all this app's renders ever apply: the radius scales with the matrix and a mirror
 * flips the sweep flag. A non-uniform scale would turn the arc into an ellipse and isn't
 * represented; the endpoints still land where they should.
 */
export function transformPath(path: string, m: Matrix2D): string {
  const det = m[0] * m[3] - m[1] * m[2];
  const radiusScale = Math.sqrt(Math.abs(det));
  const mirrored = det < 0;
  const point = (x: number, y: number): [number, number] => {
    const p = applyMatrix(m, { x, y });
    return [p.x, p.y];
  };
  const out: string[] = [];
  for (const [, cmd, args] of path.matchAll(/([A-DF-Za-df-z])([^A-DF-Za-df-z]*)/g)) {
    const nums = args.trim().split(/[\s,]+/).filter((s: string) => s.length > 0).map(Number);
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
      case 'C':
      case 'Q':
        for (let i = 0; i + 1 < nums.length; i += 2) [nums[i], nums[i + 1]] = point(nums[i], nums[i + 1]);
        break;
      case 'A':
        for (let i = 0; i + 6 < nums.length; i += 7) {
          nums[i] *= radiusScale;
          nums[i + 1] *= radiusScale;
          if (mirrored) nums[i + 4] = nums[i + 4] ? 0 : 1;
          [nums[i + 5], nums[i + 6]] = point(nums[i + 5], nums[i + 6]);
        }
        break;
    }
    out.push(nums.length ? `${cmd} ${nums.join(' ')}` : cmd);
  }
  return out.join(' ');
}

type PathPiece =
  | { kind: 'line'; a: Pt; b: Pt }
  | { kind: 'arc'; c: Pt; r: number; t0: number; dt: number }
  | { kind: 'cubic'; a: Pt; c1: Pt; c2: Pt; b: Pt };

const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function pieceAt(p: PathPiece, t: number): Pt {
  if (p.kind === 'line') return lerpPt(p.a, p.b, t);
  if (p.kind === 'arc') return pointOnCircle({ ...p.c, r: p.r }, p.t0 + p.dt * t);
  return cubicBezierPoint(p.a, p.c1, p.c2, p.b, t);
}

function pieceVelocity(p: PathPiece, t: number): Pt {
  if (p.kind === 'line') return { x: p.b.x - p.a.x, y: p.b.y - p.a.y };
  if (p.kind === 'arc') {
    const th = p.t0 + p.dt * t;
    return { x: -p.dt * p.r * Math.sin(th), y: p.dt * p.r * Math.cos(th) };
  }
  const s = 1 - t;
  return {
    x: 3 * (s * s * (p.c1.x - p.a.x) + 2 * s * t * (p.c2.x - p.c1.x) + t * t * (p.b.x - p.c2.x)),
    y: 3 * (s * s * (p.c1.y - p.a.y) + 2 * s * t * (p.c2.y - p.c1.y) + t * t * (p.b.y - p.c2.y)),
  };
}

// a cubic whose control point sits on its end has no velocity there, so step inside for the direction
function pieceTangent(p: PathPiece, t: number): Pt {
  let v = pieceVelocity(p, t);
  if (Math.hypot(v.x, v.y) < 1e-12) v = pieceVelocity(p, t < 0.5 ? t + 1e-4 : t - 1e-4);
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function splitPiece(p: PathPiece, t: number): [PathPiece, PathPiece] {
  if (p.kind === 'line') {
    const m = lerpPt(p.a, p.b, t);
    return [{ kind: 'line', a: p.a, b: m }, { kind: 'line', a: m, b: p.b }];
  }
  if (p.kind === 'arc') return [{ ...p, dt: p.dt * t }, { ...p, t0: p.t0 + p.dt * t, dt: p.dt * (1 - t) }];
  const ab = lerpPt(p.a, p.c1, t), bc = lerpPt(p.c1, p.c2, t), cd = lerpPt(p.c2, p.b, t);
  const abc = lerpPt(ab, bc, t), bcd = lerpPt(bc, cd, t), m = lerpPt(abc, bcd, t);
  return [{ kind: 'cubic', a: p.a, c1: ab, c2: abc, b: m }, { kind: 'cubic', a: m, c1: bcd, c2: cd, b: p.b }];
}

// absolute M/L/H/V/C/Q/A/Z, the forms the toolbox stores; null for anything else (relative
// commands, elliptical arcs) rather than offsetting it wrongly
function pathPieces(d: string): { pieces: PathPiece[]; closed: boolean }[] | null {
  const subpaths: { pieces: PathPiece[]; closed: boolean }[] = [];
  let pieces: PathPiece[] = [];
  let cur: Pt = { x: 0, y: 0 }, start = cur;
  const finish = (closed: boolean) => {
    if (pieces.length) subpaths.push({ pieces, closed });
    pieces = [];
  };
  const add = (p: PathPiece, end: Pt) => {
    if (dist(cur, end) > 1e-9 || (p.kind === 'cubic' && dist(p.a, p.c1) + dist(p.c1, p.c2) > 1e-9)) pieces.push(p);
    cur = end;
  };
  for (const [, cmd, args] of d.matchAll(/([A-DF-Za-df-z])([^A-DF-Za-df-z]*)/g)) {
    const n = (args.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    switch (cmd) {
      case 'M':
        finish(false);
        cur = start = { x: n[0], y: n[1] };
        for (let i = 2; i + 1 < n.length; i += 2) add({ kind: 'line', a: cur, b: { x: n[i], y: n[i + 1] } }, { x: n[i], y: n[i + 1] });
        break;
      case 'L':
        for (let i = 0; i + 1 < n.length; i += 2) add({ kind: 'line', a: cur, b: { x: n[i], y: n[i + 1] } }, { x: n[i], y: n[i + 1] });
        break;
      case 'H':
        for (const x of n) add({ kind: 'line', a: cur, b: { x, y: cur.y } }, { x, y: cur.y });
        break;
      case 'V':
        for (const y of n) add({ kind: 'line', a: cur, b: { x: cur.x, y } }, { x: cur.x, y });
        break;
      case 'C':
        for (let i = 0; i + 5 < n.length; i += 6) {
          const b = { x: n[i + 4], y: n[i + 5] };
          add({ kind: 'cubic', a: cur, c1: { x: n[i], y: n[i + 1] }, c2: { x: n[i + 2], y: n[i + 3] }, b }, b);
        }
        break;
      case 'Q':
        for (let i = 0; i + 3 < n.length; i += 4) {
          const q = { x: n[i], y: n[i + 1] }, b = { x: n[i + 2], y: n[i + 3] };
          add({ kind: 'cubic', a: cur, c1: lerpPt(cur, q, 2 / 3), c2: lerpPt(b, q, 2 / 3), b }, b);
        }
        break;
      case 'A':
        for (let i = 0; i + 6 < n.length; i += 7) {
          const [rx, ry, , large, sweep] = n.slice(i, i + 5);
          const b = { x: n[i + 5], y: n[i + 6] };
          if (dist(cur, b) < 1e-9) continue;
          if (rx === 0 || ry === 0) {
            add({ kind: 'line', a: cur, b }, b);
            continue;
          }
          if (Math.abs(rx - ry) > 1e-6 * Math.max(rx, ry)) return null;
          const r = Math.max(Math.abs(rx), dist(cur, b) / 2);
          const c = arcCenterFromEndpoints(cur, b, r, large, sweep);
          const t0 = Math.atan2(cur.y - c.y, cur.x - c.x), t1 = Math.atan2(b.y - c.y, b.x - c.x);
          const dt = sweep ? normalizeRadians(t1 - t0) || TURN.full : -(normalizeRadians(t0 - t1) || TURN.full);
          add({ kind: 'arc', c, r, t0, dt }, b);
        }
        break;
      case 'Z':
      case 'z':
        add({ kind: 'line', a: cur, b: start }, start);
        finish(true);
        break;
      default:
        return null;
    }
  }
  finish(false);
  return subpaths;
}

function pieceToPath(p: PathPiece): string {
  const b = pieceAt(p, 1);
  if (p.kind === 'line') return `L ${b.x} ${b.y}`;
  if (p.kind === 'arc') return `A ${p.r} ${p.r} 0 ${Math.abs(p.dt) > TURN.half ? 1 : 0} ${p.dt > 0 ? 1 : 0} ${b.x} ${b.y}`;
  return `C ${p.c1.x} ${p.c1.y} ${p.c2.x} ${p.c2.y} ${b.x} ${b.y}`;
}

const leftOf = (t: Pt): Pt => ({ x: -t.y, y: t.x });

function cubicCurvature(p: PathPiece & { kind: 'cubic' }, t: number): number {
  const v = pieceVelocity(p, t);
  const speed = Math.hypot(v.x, v.y);
  if (speed < 1e-9) return 0;
  const s = 1 - t;
  const acc = {
    x: 6 * (s * (p.c2.x - 2 * p.c1.x + p.a.x) + t * (p.b.x - 2 * p.c2.x + p.c1.x)),
    y: 6 * (s * (p.c2.y - 2 * p.c1.y + p.a.y) + t * (p.b.y - 2 * p.c2.y + p.c1.y)),
  };
  return (v.x * acc.y - v.y * acc.x) / (speed * speed * speed);
}

// `left` to the left of travel. A line shifts and an arc keeps its centre, both exactly; a cubic
// is rebuilt from pieces carrying the offset's own tangent, which runs parallel to the original's
// and is scaled by 1 − left·κ — the factor that reaching zero means the offset has folded.
function offsetPiece(p: PathPiece, left: number): PathPiece[] | null {
  if (p.kind === 'line') {
    const n = leftOf(pieceTangent(p, 0));
    return [{ kind: 'line', a: { x: p.a.x + n.x * left, y: p.a.y + n.y * left }, b: { x: p.b.x + n.x * left, y: p.b.y + n.y * left } }];
  }
  if (p.kind === 'arc') {
    const r = p.r - Math.sign(p.dt) * left;
    return r > 1e-9 ? [{ ...p, r }] : null;
  }
  const SAMPLES = 64;
  let turning = 0;
  let prev = pieceTangent(p, 0);
  for (let i = 1; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    if (1 - left * cubicCurvature(p, t) <= 1e-9) return null;
    const next = pieceTangent(p, t);
    turning += Math.abs(Math.atan2(prev.x * next.y - prev.y * next.x, prev.x * next.x + prev.y * next.y));
    prev = next;
  }
  if (1 - left * cubicCurvature(p, 0) <= 1e-9) return null;
  const count = Math.min(32, Math.max(2, Math.ceil(turning / (TURN.half / 16))));
  const at = (t: number) => {
    const pt = pieceAt(p, t), n = leftOf(pieceTangent(p, t));
    const v = pieceVelocity(p, t), k = 1 - left * cubicCurvature(p, t);
    return { pt: { x: pt.x + n.x * left, y: pt.y + n.y * left }, v: { x: v.x * k, y: v.y * k } };
  };
  const out: PathPiece[] = [];
  for (let i = 0; i < count; i++) {
    const t0 = i / count, t1 = (i + 1) / count, h = (t1 - t0) / 3;
    const q0 = at(t0), q1 = at(t1);
    out.push({
      kind: 'cubic', a: q0.pt, b: q1.pt,
      c1: { x: q0.pt.x + q0.v.x * h, y: q0.pt.y + q0.v.y * h },
      c2: { x: q1.pt.x - q1.v.x * h, y: q1.pt.y - q1.v.y * h },
    });
  }
  return out;
}

// where the end of chain `x` first crosses the start of chain `y`, walking out from the corner
// they share; sampled to find it, then settled by Newton on the two pieces
function trimAtCrossing(x: PathPiece[], y: PathPiece[]): [PathPiece[], PathPiece[]] | null {
  type Seg = { piece: number; t0: number; t1: number; a: Pt; b: Pt };
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const segments = (chain: PathPiece[]): { segs: Seg[]; boxes: Box[] } => {
    const segs: Seg[] = [], boxes: Box[] = [];
    chain.forEach((p, piece) => {
      const steps = p.kind === 'line' ? 1 : 24;
      const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
      let a = pieceAt(p, 0);
      for (let k = 0; k < steps; k++) {
        const b = pieceAt(p, (k + 1) / steps);
        segs.push({ piece, t0: k / steps, t1: (k + 1) / steps, a, b });
        for (const q of [a, b]) {
          box.x0 = Math.min(box.x0, q.x); box.x1 = Math.max(box.x1, q.x);
          box.y0 = Math.min(box.y0, q.y); box.y1 = Math.max(box.y1, q.y);
        }
        a = b;
      }
      boxes.push(box);
    });
    return { segs, boxes };
  };
  const { segs: xs, boxes: xBox } = segments(x), { segs: ys, boxes: yBox } = segments(y);
  const xLen = xs.map(s => dist(s.a, s.b)), yLen = ys.map(s => dist(s.a, s.b));
  const xFromEnd = new Array<number>(xs.length), yFromStart = new Array<number>(ys.length);
  for (let i = xs.length - 1, run = 0; i >= 0; i--) { xFromEnd[i] = run; run += xLen[i]; }
  for (let j = 0, run = 0; j < ys.length; j++) { yFromStart[j] = run; run += yLen[j]; }

  let best: { i: number; j: number; u: number; v: number; score: number } | null = null;
  for (let i = 0; i < xs.length; i++) {
    const p = xs[i], r = { x: p.b.x - p.a.x, y: p.b.y - p.a.y }, bx = xBox[p.piece];
    for (let j = 0; j < ys.length; j++) {
      const q = ys[j], by = yBox[q.piece];
      if (bx.x1 < by.x0 - 1e-9 || by.x1 < bx.x0 - 1e-9 || bx.y1 < by.y0 - 1e-9 || by.y1 < bx.y0 - 1e-9) continue;
      const s = { x: q.b.x - q.a.x, y: q.b.y - q.a.y };
      const den = r.x * s.y - r.y * s.x;
      if (Math.abs(den) < 1e-15) continue;
      const w = { x: q.a.x - p.a.x, y: q.a.y - p.a.y };
      const u = (w.x * s.y - w.y * s.x) / den, v = (w.x * r.y - w.y * r.x) / den;
      if (u < -1e-9 || u > 1 + 1e-9 || v < -1e-9 || v > 1 + 1e-9) continue;
      const score = xFromEnd[i] + (1 - u) * xLen[i] + yFromStart[j] + v * yLen[j];
      if (!best || score < best.score) best = { i, j, u, v, score };
    }
  }
  if (!best) return null;

  const sx = xs[best.i], sy = ys[best.j];
  const px = x[sx.piece], py = y[sy.piece];
  let tx = sx.t0 + best.u * (sx.t1 - sx.t0), ty = sy.t0 + best.v * (sy.t1 - sy.t0);
  for (let k = 0; k < 8; k++) {
    const a = pieceAt(px, tx), b = pieceAt(py, ty);
    const fx = a.x - b.x, fy = a.y - b.y;
    if (Math.hypot(fx, fy) < 1e-12) break;
    const va = pieceVelocity(px, tx), vb = pieceVelocity(py, ty);
    const det = -va.x * vb.y + va.y * vb.x;
    if (Math.abs(det) < 1e-15) break;
    tx = Math.min(1, Math.max(0, tx - (-fx * vb.y + fy * vb.x) / det));
    ty = Math.min(1, Math.max(0, ty - (va.x * fy - va.y * fx) / det));
  }
  return [
    [...x.slice(0, sx.piece), splitPiece(px, tx)[0]],
    [splitPiece(py, ty)[1], ...y.slice(sy.piece + 1)],
  ];
}

const MITRE_LIMIT = 4;

function offsetSubpath(pieces: PathPiece[], closed: boolean, left: number): PathPiece[] | null {
  const chains: PathPiece[][] = [];
  for (const p of pieces) {
    const chain = offsetPiece(p, left);
    if (!chain) return null;
    chains.push(chain);
  }
  const joins: PathPiece[][] = chains.map(() => []);
  const corners = closed ? pieces.length : pieces.length - 1;
  for (let i = 0; i < corners; i++) {
    const j = (i + 1) % pieces.length;
    const tA = pieceTangent(pieces[i], 1), tB = pieceTangent(pieces[j], 0);
    const cross = tA.x * tB.y - tA.y * tB.x, dot = tA.x * tB.x + tA.y * tB.y;
    if (Math.abs(Math.atan2(cross, dot)) < 1e-3) continue;
    // the offset on the inside of a turn overlaps itself, and is cut back to where its two sides cross
    if (cross * left > 0 && Math.abs(cross) > 1e-9) {
      if (i === j) return null;
      const trimmed = trimAtCrossing(chains[i], chains[j]);
      if (!trimmed) return null;
      [chains[i], chains[j]] = trimmed;
      continue;
    }
    const corner = pieceAt(pieces[i], 1);
    const nA = leftOf(tA), nB = leftOf(tB);
    const from = pieceAt(chains[i][chains[i].length - 1], 1), to = pieceAt(chains[j][0], 0);
    const den = 1 + nA.x * nB.x + nA.y * nB.y;
    const mitre = den > 1e-9
      ? { x: corner.x + (nA.x + nB.x) * left / den, y: corner.y + (nA.y + nB.y) * left / den }
      : null;
    // past the limit a near-hairpin's point would run off to nowhere, so it is squared off instead
    joins[i] = mitre && dist(mitre, corner) <= MITRE_LIMIT * Math.abs(left)
      ? [{ kind: 'line', a: from, b: mitre }, { kind: 'line', a: mitre, b: to }]
      : [{ kind: 'line', a: from, b: to }];
  }
  // a side trimmed away to nothing means the offset has shrunk through itself
  if (chains.some(chain => chain.every(p => p.kind === 'arc' ? p.r * Math.abs(p.dt) < 1e-9 : dist(pieceAt(p, 0), pieceAt(p, 1)) < 1e-9))) return null;
  return chains.flatMap((chain, i) => [...chain, ...joins[i]]);
}

/**
 * A parallel copy of a path `distance` away: positive grows a closed loop and moves an open run to
 * the right of its travel, the same side a positive offset takes an arc drawn counterclockwise.
 * Corners are mitred. Null when the offset would fold over itself — an inward step deeper than
 * a bend or past a corner's neighbours — or when the path holds something it can't offset.
 */
export function offsetPath(d: string, distance: number): string | null {
  const subpaths = pathPieces(d);
  if (!subpaths || subpaths.length === 0) return null;
  const out: string[] = [];
  for (const { pieces, closed } of subpaths) {
    let left = -distance;
    if (closed) {
      const ring = pieces.flatMap(p => {
        const steps = p.kind === 'line' ? 1 : 16;
        return Array.from({ length: steps }, (_, k) => pieceAt(p, k / steps));
      });
      if (signedPolygonArea(ring) < 0) left = distance;
    }
    const offset = offsetSubpath(pieces, closed, left);
    if (!offset) return null;
    const start = pieceAt(offset[0], 0);
    out.push(`M ${start.x} ${start.y} ${offset.map(pieceToPath).join(' ')}${closed ? ' Z' : ''}`);
  }
  return out.join(' ');
}

/**
 * Rotates an absolute SVG path string 180° about the origin. Unlike a mirror, a
 * point rotation preserves concavity, so it re-orients a shape without flipping
 * a carefully-mirrored cutout curve back to the wrong hand. Supports M, L, C,
 * A, Q, and Z.
 */
export function rotatePath180(path: string): string {
  return path.replace(/([A-DF-Za-df-z])([^A-DF-Za-df-z]*)/g, (_, cmd: string, args: string) => {
    const nums = args.trim().split(/[\s,]+/).filter((s: string) => s.length > 0).map(Number);
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
      case 'C':
        for (let i = 0; i < nums.length; i += 2) { nums[i] = -nums[i]; nums[i + 1] = -nums[i + 1]; }
        break;
      case 'A':
        // A rx ry x-rotation large-arc-flag sweep-flag x y — a point reflection flips the sweep direction.
        for (let i = 0; i < nums.length; i += 7) {
          nums[i + 4] = nums[i + 4] ? 0 : 1;
          nums[i + 5] = -nums[i + 5]; nums[i + 6] = -nums[i + 6];
        }
        break;
      case 'Q':
        for (let i = 0; i < nums.length; i += 4) {
          nums[i] = -nums[i]; nums[i + 1] = -nums[i + 1];
          nums[i + 2] = -nums[i + 2]; nums[i + 3] = -nums[i + 3];
        }
        break;
      case 'Z':
        return cmd;
    }
    return cmd + ' ' + nums.join(' ');
  });
}

/**
 * Sample an SVG path string into a polyline at roughly `stepMm` spacing.
 * The path is assumed closed (or close to it); the duplicate closing point
 * is not emitted, so consumers can treat the result as a closed loop —
 * unless `includeEnd` is set, for an open path whose far end matters.
 */
export function samplePathToPolyline(path: string, stepMm = 1, includeEnd = false): Pt[] {
  const props = new svgPathProperties(path.trim());
  const len = props.getTotalLength();
  const n = Math.max(8, Math.ceil(len / stepMm));
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const pt = props.getPointAtLength((i / n) * len);
    pts.push({ x: pt.x, y: pt.y });
  }
  if (includeEnd) {
    const end = props.getPointAtLength(len);
    pts.push({ x: end.x, y: end.y });
  }
  return pts;
}

/** Combined bounding box of one or more path strings, sampled via {@link samplePathToPolyline}. */
export function pathsBounds(paths: string[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  const pts = paths.flatMap(path => samplePathToPolyline(path, 0.5));
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  const xs = pts.map(pt => pt.x), ys = pts.map(pt => pt.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Close an open arch profile into a rectangular *negative* template blank — a
 * maker checks a carved convex arch by laying a matching concave cutout against
 * it and reading the light gaps. The profile is mirrored about its height axis
 * *first* and the backing edge built against the mirrored curve; mirroring the
 * already-closed shape instead just moves the backing to the wrong side.
 *
 * `heightAxis` selects which coordinate carries the height the curve varies
 * over: 'y' for a cross-arch profile, 'x' for a long-arch one.
 *
 * `direction` must match the plate's signZ convention (+1 top, −1 back) — on
 * the mirrored curve the peak sits on opposite sides for the two plates. The
 * backing edge is placed `margin` past the peak, keeping material thin there
 * and thicker toward the flat edges.
 *
 * Also returns the backing edge's constant coordinate and the curve's
 * position-axis midpoint, so a caller can place a label `margin/2` in from the
 * backing — always solid material, unlike a bounding-box center.
 */
export function closeProfileToBlank(path: string, heightAxis: 'x' | 'y', direction: 1 | -1 = 1, margin = 10): { path: string; backing: number; positionMid: number } {
  const pts = samplePathToPolyline(path, 0.25);
  // Degenerate input passes straight through. Testing extent rather than point count is the
  // point: a single-point path like 'M 0 0' samples into a run of *coincident* points, which
  // clears a length check but would still be closed into a nonsense blank — a baseline `margin`
  // below a profile that has no height, exported as a real template.
  if (pts.length < 2) return { path, backing: 0, positionMid: 0 };
  const spread = Math.max(...pts.map(p => Math.abs(p.x - pts[0].x) + Math.abs(p.y - pts[0].y)));
  if (spread < 1e-9) return { path, backing: 0, positionMid: 0 };
  const mirror = (pt: Pt): Pt => heightAxis === 'x' ? { x: -pt.x, y: pt.y } : { x: pt.x, y: -pt.y };
  const curve = pts.map(mirror);
  const heights = curve.map(pt => heightAxis === 'x' ? pt.x : pt.y);
  const positions = curve.map(pt => heightAxis === 'x' ? pt.y : pt.x);
  const baseline = direction === 1 ? Math.min(...heights) - margin : Math.max(...heights) + margin;
  const positionMid = (Math.min(...positions) + Math.max(...positions)) / 2;
  const first = curve[0];
  const last = curve[curve.length - 1];
  const atBaseline = (pt: Pt): Pt => heightAxis === 'x' ? { x: baseline, y: pt.y } : { x: pt.x, y: baseline };
  const b1 = atBaseline(last);
  const b2 = atBaseline(first);
  const curveStr = curve.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
  return { path: `${curveStr} L ${b1.x} ${b1.y} L ${b2.x} ${b2.y} Z`, backing: baseline, positionMid };
}

// ===== Arch curve path builders =====

/**
 * Build an SVG polyline path for a catenary arch curve.
 *
 * @param hEff   Effective arch height above the plate-edge reference level.
 * @param span   Length of the arch span along canvas Y.
 * @param yStart Canvas Y at the bottom end of the span.
 * @param xBase  Canvas X at zero arch contribution (plate edge at the rib ends).
 * @param sign   +1 for top plate (arches right), −1 for back plate (arches left).
 */
export function buildCatenaryPath(
  hEff: number,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  N = 80,
): string {
  if (hEff <= 0 || span <= 0) return '';
  const a = solveCatenaryA(hEff, span);
  const peak = hEff + a;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const yLocal = (i / N) * span;
    const z = peak - a * Math.cosh((yLocal - span / 2) / a);
    pts.push(`${i === 0 ? 'M' : 'L'} ${xBase + sign * z} ${yStart + yLocal}`);
  }
  return pts.join(' ');
}

// cubic pieces between the parameter steps `us`, each carrying the curve's own tangent at its ends;
// the last one is pinned to `end` so the curve closes on the click exactly
function hermitePath(start: Pt, end: Pt, us: number[], at: (u: number) => Pt, slope: (u: number) => Pt): string {
  const parts = [`M ${start.x} ${start.y}`];
  for (let i = 0; i + 1 < us.length; i++) {
    const u0 = us[i], u1 = us[i + 1], h = (u1 - u0) / 3;
    const p0 = at(u0), p1 = i === us.length - 2 ? end : at(u1), d0 = slope(u0), d1 = slope(u1);
    parts.push(`C ${p0.x + d0.x * h} ${p0.y + d0.y * h} ${p1.x - d1.x * h} ${p1.y - d1.y * h} ${p1.x} ${p1.y}`);
  }
  return parts.join(' ');
}

// a chain hung from start and end, its axis square to the chord and its lowest point `sag` off the
// chord's middle — positive sags to the left of start→end. Steps are even in arc length, so a deep
// U is followed as closely at its steep ends as at the bottom.
export function catenaryBetween(start: Pt, end: Pt, sag: number, segments = 16): string {
  const L = dist(start, end);
  if (L < 1e-9 || Math.abs(sag) < 1e-9) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const h = L / 2;
  const a = solveCatenaryA(Math.abs(sag), L);
  const side = Math.sign(sag);
  const t = { x: (end.x - start.x) / L, y: (end.y - start.y) / L };
  const n = { x: -t.y, y: t.x };
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const at = (u: number): Pt => {
    const off = side * a * (Math.cosh(h / a) - Math.cosh(u / a));
    return { x: mid.x + u * t.x + off * n.x, y: mid.y + u * t.y + off * n.y };
  };
  const slope = (u: number): Pt => {
    const k = -side * Math.sinh(u / a);
    return { x: t.x + k * n.x, y: t.y + k * n.y };
  };
  const sinhH = Math.sinh(h / a);
  const us = Array.from({ length: segments + 1 }, (_, i) =>
    i === 0 ? -h : i === segments ? h : a * Math.asinh(sinhH * (2 * i / segments - 1)));
  return hermitePath(start, end, us, at, slope);
}

export function battenPath(pins: Pt[], closed: boolean): string {
  const spans = battenBeziers(pins, closed);
  if (spans.length === 0) return pins.length ? `M ${pins[0].x} ${pins[0].y}` : '';
  const cubics = spans.map(([, c1, c2, b]) => `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`);
  return `M ${spans[0][0].x} ${spans[0][0].y} ${cubics.join(' ')}${closed && spans.length > 2 ? ' Z' : ''}`;
}

// the trochoid arch of trochoidNorm stood on the chord from start to end, its crown `depth` off the
// chord's middle — positive to the left of start→end. Steps are even in the rolling angle, which
// crowds them towards the ends where a full cycloid turns hardest.
export function cycloidBetween(start: Pt, end: Pt, depth: number, factor: number, pct: number, segments = 24): string {
  const L = dist(start, end);
  if (L < 1e-9 || Math.abs(depth) < 1e-9) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const t = { x: (end.x - start.x) / L, y: (end.y - start.y) / L };
  const n = { x: -t.y, y: t.x };
  const t0 = (1 - pct) * TURN.half, t1 = TURN.full - t0;
  const xSpan = (t1 - factor * Math.sin(t1)) - (t0 - factor * Math.sin(t0));
  const zSpan = Math.cos(t0) + 1;
  const at = (frac: number): Pt => {
    const { x, z } = trochoidNorm(frac, factor, pct);
    return { x: start.x + x * L * t.x + z * depth * n.x, y: start.y + x * L * t.y + z * depth * n.y };
  };
  const slope = (frac: number): Pt => {
    const th = t0 + frac * (t1 - t0);
    const dx = (1 - factor * Math.cos(th)) / xSpan * (t1 - t0) * L;
    const dz = Math.sin(th) / zSpan * (t1 - t0) * depth;
    return { x: dx * t.x + dz * n.x, y: dx * t.y + dz * n.y };
  };
  return hermitePath(start, end, Array.from({ length: segments + 1 }, (_, i) => i / segments), at, slope);
}

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

/**
 * Build an SVG polyline path for a trochoid/cycloid arch curve.
 * d=0 gives a raised cosine; d=1 gives the standard cycloid.
 * `pct` (see {@link trochoidNorm}) clips the flat cusp ends; default 1 (full).
 */
export function buildCycloidPath(
  hEff: number,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  d: number,
  N = 80,
  pct = 1,
): string {
  if (hEff <= 0 || span <= 0) return '';
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const { x: u, z: w } = trochoidNorm(i / N, d, pct);
    const yLocal = u * span;
    const z      = w * hEff;
    pts.push(`${i === 0 ? 'M' : 'L'} ${xBase + sign * z} ${yStart + yLocal}`);
  }
  return pts.join(' ');
}

/**
 * Build an SVG polyline path for a spline arch curve. Control points `{ t, z }`
 * where `t` is normalized full-span position (0 = upper plate edge, 1 = lower
 * plate edge) and `z` is arch height there; `peak` is where the arch reaches
 * `hEff`. See {@link archSplineKnots}.
 */
export function buildSplinePath(
  hEff: number,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  points: ArchSplineControlPoint[],
  peak = 0.5,
  N = 120,
  endZ = 0,
): string {
  if (hEff <= 0 || span <= 0) return '';
  const zOf = makeArchSplineZOf(hEff, span, points, peak, endZ);
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const y = (i / N) * span;
    const z = zOf(y);
    pts.push(`${i === 0 ? 'M' : 'L'} ${xBase + sign * z} ${yStart + y}`);
  }
  return pts.join(' ');
}


// ===== Arch curve evaluators =====
// The evaluable counterparts of the path builders above, for querying an arch
// height at a single station. Out-of-span positions return 0 (the plate-edge
// reference level).

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

/** Spline evaluator z(s) over [0, span] — shared by buildSplinePath and splineZAt. */
function makeArchSplineZOf(
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






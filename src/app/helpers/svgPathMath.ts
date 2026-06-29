import { Pt, Circle, Rectangle, Arc } from "../models/types";
import * as polygonClipping from 'polygon-clipping';
import { svgPathProperties } from 'svg-path-properties';
import { dist, angleFromCenter, pointOnCircle, intersectLines, lineCircleIntersection, circleCircleIntersections, solveCatenaryA, makeNaturalSpline } from './draftMath';

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
  const TWO_PI = Math.PI * 2;
  const diff = ((arc.end - arc.start) % TWO_PI + TWO_PI) % TWO_PI;
  return diff <= Math.PI ? 1 : -1;
}

export function pathFromCornerBezier(arc1: Arc, arc2: Arc): string {
  const P1 = pointOnCircle(arc1, arc1.end);
  const P2 = pointOnCircle(arc2, arc2.end);
  const s1 = arcSweepSign(arc1);
  const s2 = arcSweepSign(arc2);
  const T1: Pt = { x: P1.x - s1 * Math.sin(arc1.end), y: P1.y + s1 * Math.cos(arc1.end) };
  const T2: Pt = { x: P2.x - s2 * Math.sin(arc2.end), y: P2.y + s2 * Math.cos(arc2.end) };
  const ctrl = intersectLines(P1, T1, P2, T2);
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
  const V = intersectLines(P1, T1, P2, T2);
  if (!V || !Number.isFinite(V.x) || !Number.isFinite(V.y)) return `M ${P1.x} ${P1.y} L ${P2.x} ${P2.y}`;
  const t = Number.isFinite(sharpness) ? Math.max(0, Math.min(1, sharpness)) : 0.1;
  const cp1 = { x: P1.x + t * (V.x - P1.x), y: P1.y + t * (V.y - P1.y) };
  const cp2 = { x: P2.x + t * (V.x - P2.x), y: P2.y + t * (V.y - P2.y) };
  return `M ${P1.x} ${P1.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${P2.x} ${P2.y}`;
}

export function pathFromRect(R: Rectangle): string {
  const { Pt1, Pt2 } = R;
  return `M ${Pt1.x} ${Pt1.y} L ${Pt2.x} ${Pt1.y} L ${Pt2.x} ${Pt2.y} L ${Pt1.x} ${Pt2.y} Z`;
}

export function pathFromArc(arc: Arc): string {
  const startPt = pointOnCircle(arc, arc.start);
  const endPt = pointOnCircle(arc, arc.end);

  const TWO_PI = Math.PI * 2;
  const normalizedPositiveDiff = ((arc.end - arc.start) % TWO_PI + TWO_PI) % TWO_PI;
  const largeArcFlag = 0; // always use the shorter (minor) arc
  const sweepFlag = normalizedPositiveDiff <= Math.PI ? 1 : 0;

  return `M ${startPt.x} ${startPt.y} A ${arc.r} ${arc.r} 0 ${largeArcFlag} ${sweepFlag} ${endPt.x} ${endPt.y}`;
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

export function flipLineAboutYAxis(P1: Pt, P2: Pt): string {
  return `M ${-P1.x} ${P1.y} L ${-P2.x} ${P2.y}`;
}

// ====== PATH COMBINATIONS ======
export function combinePathStrings(paths: string[]): string {
  return paths.map(p => p.trim()).join(' ');
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
 * Orders and joins a set of connected SVG segments into one path string.
 *
 * It greedily finds the next segment that can connect to either end of the
 * current chain and stitches with `concatSvgPaths`.
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

    let debug = true
    if (!stitched) {
      if (!debug) {
        throw new Error("Could not unify all paths. Remaining paths do not share endpoints.");
      }

      console.log("Error: Could not unify all paths. Returning combined string without unification.");
      console.log("Remaining paths end points:");
      remaining.forEach((path, index) => {
        const props = new svgPathProperties(path);
        const totalLength = props.getTotalLength();
        const startPt = props.getPointAtLength(0);
        const endPt = props.getPointAtLength(totalLength);
        console.log(`  Path ${index}: start (${startPt.x}, ${startPt.y}), end (${endPt.x}, ${endPt.y})`);
      });
      console.log({
        unified,
        remaining,
      });

      let remainingPathsDeepCopy = [...remaining];
      remaining = [];
      unified = combinePathStrings([unified, ...remainingPathsDeepCopy]);

    }
  }

  return unified;
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

const BOOLEAN_OP_TWO_PI = Math.PI * 2;

function ccwSpan(from: number, to: number): number {
  return ((to - from) % BOOLEAN_OP_TWO_PI + BOOLEAN_OP_TWO_PI) % BOOLEAN_OP_TWO_PI;
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
      span = seg.ccw ? ccwSpan(startAngle, endAngle) : ccwSpan(endAngle, startAngle);
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
    const pt = intersectLines(segA.p0, segA.p1, segB.p0, segB.p1);
    candidates = pt ? [pt] : [];
  } else if (segA.type === 'arc' && segB.type === 'arc') {
    candidates = circleCircleIntersections(
      { x: segA.center.x, y: segA.center.y, r: segA.r },
      { x: segB.center.x, y: segB.center.y, r: segB.r }
    );
  } else {
    const lineSeg = (segA.type === 'line' ? segA : segB) as PathLineSeg;
    const arcSeg = (segA.type === 'arc' ? segA : segB) as PathArcSeg;
    candidates = lineCircleIntersection(lineSeg.p0, lineSeg.p1, { x: arcSeg.center.x, y: arcSeg.center.y, r: arcSeg.r });
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
    const [firstX, firstY] = run.points[0];
    const [secondX, secondY] = run.points[1];
    const a0 = Math.atan2(firstY - center.y, firstX - center.x);
    const a1 = Math.atan2(secondY - center.y, secondX - center.x);
    const aEnd = Math.atan2(last[1] - center.y, last[0] - center.x);

    // Consecutive sample points step in small increments in the run's true travel
    // direction, so whichever rotation gets from a0 to a1 the "short way" is correct.
    const ccw = ccwSpan(a0, a1) <= Math.PI;
    const span = ccw ? ccwSpan(a0, aEnd) : ccwSpan(aEnd, a0);
    const largeArcFlag = span > Math.PI ? 1 : 0;
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


/**
 * Translates all coordinates in an absolute SVG path string by (dx, dy).
 * Supports M, L, A, Q, and Z commands.
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

/**
 * Build an SVG polyline path for a trochoid/cycloid arch curve.
 * d=0 gives a raised cosine; d=1 gives the standard cycloid.
 */
export function buildCycloidPath(
  hEff: number,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  d: number,
  N = 80,
): string {
  if (hEff <= 0 || span <= 0) return '';
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 * Math.PI;
    // Trochoid family scaled to fit (span, hEff).
    // x: (t - d*sin(t)) / (2π) * span  →  d=0: linear/cosine arch; d=1: standard cycloid
    // z: (1 - cos(t)) / 2 * hEff       →  independent of d after normalisation
    const yLocal = ((t - d * Math.sin(t)) / (2 * Math.PI)) * span;
    const z      = ((1 - Math.cos(t))     / 2)             * hEff;
    pts.push(`${i === 0 ? 'M' : 'L'} ${xBase + sign * z} ${yStart + yLocal}`);
  }
  return pts.join(' ');
}

/**
 * Build an SVG polyline path for a natural-cubic-spline arch curve.
 * Control points `{ t, z }` where `t` is normalized half-span position
 * (0 = plate edge, 1 = peak) and `z` is arch height at that position.
 */
export function buildSplinePath(
  hEff: number,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  points: { t: number; z: number }[],
  N = 120,
): string {
  if (hEff <= 0 || span <= 0) return '';
  const sorted = [...points].sort((a, b) => a.t - b.t);
  // Full symmetric knot list along y (always single-valued)
  const ys: number[] = [0];
  const zs: number[] = [0];
  for (const p of sorted)               { ys.push(p.t * span / 2);       zs.push(p.z); }
  ys.push(span / 2);                      zs.push(hEff);
  for (const p of sorted.slice().reverse()) { ys.push(span - p.t * span / 2); zs.push(p.z); }
  ys.push(span);                           zs.push(0);

  const zOf = makeNaturalSpline(ys, zs);
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const y = (i / N) * span;
    const z = zOf(y);
    pts.push(`${i === 0 ? 'M' : 'L'} ${xBase + sign * z} ${yStart + y}`);
  }
  return pts.join(' ');
}

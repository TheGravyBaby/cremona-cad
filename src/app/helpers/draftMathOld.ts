import { svgPathProperties } from "svg-path-properties";
import { Pt, Circle } from "../models/types";
import { dist } from "./draftMath";
import * as polygonClipping from 'polygon-clipping';


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


/**
 * Finds the point on an SVG path that is closest to the boundary of a circle
 * (i.e. minimises |dist(point, center) - radius|).
 *
 * Returns the path point, its arc-length position, and the actual distance
 * from that point to the circle center — so the caller can snap the radius
 * to that distance for a clean intersection.
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


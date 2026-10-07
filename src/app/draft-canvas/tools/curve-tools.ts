import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { dist, normalizeRadians, pointOnCircle } from '../../helpers/math/simpleGeometry';
import { samplePathToPolyline, splitPathStrings } from '../../helpers/math/pathMath';
import { polylineCumulativeLengths, projectOntoPolyline, slicePolyline } from '../../helpers/math/vibeMath';
import { DraftTool, DraftToolHost } from './draft-tool';
import { DraftShape, makeShapeId } from './toolbox-shape';
import { drawCurveLength, drawCurveTicks } from './shape-renderer';
import { CLICK_MOVE_THRESHOLD_PX, PREVIEW_COLOR } from './two-point-tool';
import { ToolboxStore } from './toolbox-store';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

const SAMPLE_STEP_MM = 0.25;
const STORED_STEP_MM = 1;

export type ShapeCurve = { points: Pt[]; closed: boolean };

// shapes are immutable plain objects, so a sampling is good for as long as the object is
const curveCache = new WeakMap<DraftShape, ShapeCurve[]>();

// the course of every curve a shape draws, sampled finely enough to measure along — several for a
// path of separate pieces. A closed one repeats its first point at the end. Cached per shape,
// since a tool asks again on every pointer move and a whole outline is slow to sample.
export function shapeCurves(shape: DraftShape): ShapeCurve[] {
  let curves = curveCache.get(shape);
  if (!curves) {
    curves = sampleShape(shape);
    curveCache.set(shape, curves);
  }
  return curves;
}

function sampleShape(shape: DraftShape): ShapeCurve[] {
  switch (shape.type) {
    case 'line':
      return [{ points: [shape.start, shape.end], closed: false }];
    case 'arc': {
      const sweep = normalizeRadians(shape.endAngle - shape.startAngle);
      const n = Math.max(8, Math.ceil(shape.radius * sweep / SAMPLE_STEP_MM));
      const points = Array.from({ length: n + 1 }, (_, i) =>
        pointOnCircle({ ...shape.center, r: shape.radius }, shape.startAngle + sweep * i / n));
      return [{ points, closed: false }];
    }
    case 'circle': {
      const n = Math.max(16, Math.ceil(shape.radius * 2 * Math.PI / SAMPLE_STEP_MM));
      const points = Array.from({ length: n + 1 }, (_, i) =>
        pointOnCircle({ ...shape.center, r: shape.radius }, 2 * Math.PI * i / n));
      return [{ points, closed: true }];
    }
    // sampled along each edge rather than just at the corners, so a search that reads the curve's
    // direction off neighbouring samples sees the edge's, not a chord across the corner
    case 'rect': {
      const { p1, p2 } = shape;
      const corners = [p1, { x: p2.x, y: p1.y }, p2, { x: p1.x, y: p2.y }, p1];
      const points = [p1, ...corners.slice(1).flatMap((c, i) => {
        const from = corners[i];
        const n = Math.max(1, Math.ceil(dist(from, c) / SAMPLE_STEP_MM));
        return Array.from({ length: n }, (_, k) => ({
          x: from.x + (c.x - from.x) * (k + 1) / n, y: from.y + (c.y - from.y) * (k + 1) / n,
        }));
      })];
      return [{ points, closed: true }];
    }
    case 'path':
      return splitPathStrings(shape.d).flatMap(part => {
        let points: Pt[];
        try {
          points = samplePathToPolyline(part, SAMPLE_STEP_MM, true);
        } catch {
          return [];
        }
        return [{ points, closed: /Z$/i.test(part) || dist(points[0], points[points.length - 1]) < 1e-6 }];
      });
    case 'freehand':
    case 'curve-length':
    case 'curve-ticks':
      return [{ points: shape.points, closed: false }];
    default:
      return [];
  }
}

// the curve of a shape nearest `pt`, with the foot of `pt` on it
export function nearestCurve(shape: DraftShape, pt: Pt): { curve: ShapeCurve; cum: number[]; s: number; dist: number } | null {
  let best: { curve: ShapeCurve; cum: number[]; s: number; dist: number } | null = null;
  for (const curve of shapeCurves(shape)) {
    const cum = polylineCumulativeLengths(curve.points);
    const foot = projectOntoPolyline(pt, curve.points, cum);
    if (!best || foot.dist < best.dist) best = { curve, cum, ...foot };
  }
  return best;
}

// every STORED_STEP_MM or so, ends kept exact — the fine samples are for measuring, not for
// carrying round in every undo snapshot
function thin(points: Pt[]): Pt[] {
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (dist(points[i], out[out.length - 1]) >= STORED_STEP_MM) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

// the curve being walked. A closed one is laid out three times over, with the start in the middle
// copy, so the stretch can run either way round and all the way round without wrapping.
type Track = { base: Pt[]; baseCum: number[]; points: Pt[]; cum: number[]; loop: number | null; s0: number };

function trackFor(curve: { points: Pt[]; closed: boolean }, pt: Pt): Track {
  const base = curve.points;
  const baseCum = polylineCumulativeLengths(base);
  const s = projectOntoPolyline(pt, base, baseCum).s;
  if (!curve.closed) return { base, baseCum, points: base, cum: baseCum, loop: null, s0: s };
  const points = [...base, ...base.slice(1), ...base.slice(1)];
  const loop = baseCum[baseCum.length - 1];
  return { base, baseCum, points, cum: polylineCumulativeLengths(points), loop, s0: s + loop };
}

/**
 * Click on a curve, then follow it to where the stretch ends — press-drag-release or click-click,
 * like Line. The stretch goes whichever way the pointer travels, so on a closed curve the long way
 * round is reached by setting off that way; it stops at one full turn. Works on anything drawn and
 * on the recipe's own outline, which is the curve that matters most.
 */
export class CurveStretchTool implements DraftTool {
  private track: Track | null = null;
  private color: string | undefined;
  private s: number | null = null;
  private awaitingSecondClick = false;

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly buildShape: (points: Pt[], length: number) => DraftShape,
    private readonly drawStretch: (gRoot: RootGroup, gUI: RootGroup, pxPerMm: number, points: Pt[], length: number) => void,
  ) { }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.track && this.awaitingSecondClick) {
      this.follow(pt);
      this.commit(host);
      return;
    }
    const shape = host.curveAt(pt);
    const nearest = shape && nearestCurve(shape, pt);
    if (!nearest) return;
    this.track = trackFor(nearest.curve, pt);
    this.color = shape.color;
    this.s = this.track.s0;
    this.awaitingSecondClick = false;
    host.requestDraw();
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (!this.track) return;
    this.follow(pt);
    host.requestDraw();
  }

  onPointerUp(pt: Pt, host: DraftToolHost): void {
    if (!this.track || this.awaitingSecondClick) return;
    this.follow(pt);
    if (Math.abs(this.s! - this.track.s0) * host.getPxPerMm() < CLICK_MOVE_THRESHOLD_PX) {
      this.awaitingSecondClick = true;
      host.requestDraw();
      return;
    }
    this.commit(host);
  }

  // of the copies of the pointer's place on a closed curve, the one nearest where it just was —
  // that continuity is what tells which way round it is going
  private follow(pt: Pt): void {
    const t = this.track!;
    const s = projectOntoPolyline(pt, t.base, t.baseCum).s;
    if (t.loop === null) {
      this.s = s;
      return;
    }
    const loop = t.loop;
    const prev = this.s ?? t.s0;
    const nearest = [s, s + loop, s + 2 * loop].reduce((a, b) => Math.abs(b - prev) < Math.abs(a - prev) ? b : a);
    this.s = Math.min(t.s0 + loop, Math.max(t.s0 - loop, nearest));
  }

  private stretch(): { points: Pt[]; length: number } | null {
    const t = this.track;
    if (!t || this.s === null || Math.abs(this.s - t.s0) < 1e-6) return null;
    return { points: slicePolyline(t.points, t.cum, t.s0, this.s), length: Math.abs(this.s - t.s0) };
  }

  private commit(host: DraftToolHost): void {
    const stretch = this.stretch();
    if (stretch) host.addShape({ ...this.buildShape(thin(stretch.points), stretch.length), color: this.color } as DraftShape);
    this.reset();
    host.requestDraw();
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.track) {
      this.reset();
      return true;
    }
    return false;
  }

  renderPreview(gRoot: RootGroup, gUI: RootGroup, pxPerMm: number): void {
    const stretch = this.stretch();
    if (stretch) this.drawStretch(gRoot, gUI, pxPerMm, thin(stretch.points), stretch.length);
  }

  reset(): void {
    this.track = null;
    this.s = null;
    this.awaitingSecondClick = false;
  }
}

export function createCurveLengthTool(): CurveStretchTool {
  return new CurveStretchTool('curve-length', 'Curve Length',
    (points, length) => ({ id: makeShapeId(), type: 'curve-length', points, length }),
    (gRoot, gUI, pxPerMm, points, length) => drawCurveLength(gRoot, gUI, { points, length }, PREVIEW_COLOR, pxPerMm, true));
}

/** Reads the Ticks weights at commit time, so the Count/Weights control serves both. */
export function createCurveTicksTool(toolbox: ToolboxStore): CurveStretchTool {
  return new CurveStretchTool('curve-ticks', 'Curve Ticks',
    points => ({ id: makeShapeId(), type: 'curve-ticks', points, weights: toolbox.currentTickWeights }),
    (gRoot, _gUI, _pxPerMm, points) => drawCurveTicks(gRoot, points, toolbox.currentTickWeights, PREVIEW_COLOR));
}

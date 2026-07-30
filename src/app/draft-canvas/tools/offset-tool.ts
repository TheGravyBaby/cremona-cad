import * as d3 from 'd3';
import { Arc, Circle, Pt } from '../../models/types';
import { offsetArcRadius, offsetCircleRadius, offsetLineByDistance } from '../../helpers/draftMath';
import { DraftTool, DraftToolHost } from './draft-tool';
import { DraftShape, makeShapeId } from './toolbox-shape';
import { arcPathData, pointOnCirc } from './arc-geometry';
import { PREVIEW_COLOR, stylePreview } from './two-point-tool';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/** The shape types with a defined offset. Rect/section/text/point have no meaningful parallel
 * copy, so they're filtered out of the selection rather than silently ignored downstream. */
function supportedShapes(shapes: DraftShape[]): DraftShape[] {
  return shapes.filter(s => s.type === 'arc' || s.type === 'circle' || s.type === 'line');
}

/**
 * Distance from `pt` to a shape, signed so that positive means "pt is on the outward/right
 * side" — the same convention offsetArcRadius/offsetCircleRadius/offsetLineByDistance use.
 * `abs` is only used to pick the nearest shape when several are selected.
 */
function signedOffsetMetric(shape: DraftShape, pt: Pt): { abs: number; signed: number } | null {
  if (shape.type === 'arc' || shape.type === 'circle') {
    const centerDist = Math.hypot(pt.x - shape.center.x, pt.y - shape.center.y);
    const signed = centerDist - shape.radius;
    return { abs: Math.abs(signed), signed };
  }
  if (shape.type === 'line') {
    const dx = shape.end.x - shape.start.x;
    const dy = shape.end.y - shape.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;
    const nx = dy / len;
    const ny = -dx / len;
    const signed = (pt.x - shape.start.x) * nx + (pt.y - shape.start.y) * ny;
    return { abs: Math.abs(signed), signed };
  }
  return null;
}

/** The nearest selected shape to `pt`, plus that shape's own raw signed offset metric. */
function nearestSignedDistance(shapes: DraftShape[], pt: Pt): { shapeId: string; signed: number } | null {
  let best: { shapeId: string; abs: number; signed: number } | null = null;
  for (const shape of shapes) {
    const metric = signedOffsetMetric(shape, pt);
    if (metric && (!best || metric.abs < best.abs)) best = { shapeId: shape.id, ...metric };
  }
  return best ? { shapeId: best.shapeId, signed: best.signed } : null;
}

const JOINT_EPS_MM = 1e-3;

function samePoint(a: Pt, b: Pt): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < JOINT_EPS_MM;
}

/** A shape's two boundary points, each with the tangent angle (radians) of travel through it
 * in the shape's own stored forward direction (arc: startAngle→endAngle CCW; line: start→end).
 * Circles have no boundary to join at, so they're left out of the connectivity graph entirely. */
function boundaryPoints(shape: DraftShape): { pt: Pt; tangentAngle: number }[] | null {
  if (shape.type === 'arc') {
    return [
      { pt: pointOnCirc(shape.center, shape.radius, shape.startAngle), tangentAngle: shape.startAngle + Math.PI / 2 },
      { pt: pointOnCirc(shape.center, shape.radius, shape.endAngle), tangentAngle: shape.endAngle + Math.PI / 2 },
    ];
  }
  if (shape.type === 'line') {
    const angle = Math.atan2(shape.end.y - shape.start.y, shape.end.x - shape.start.x);
    return [{ pt: shape.start, tangentAngle: angle }, { pt: shape.end, tangentAngle: angle }];
  }
  return null;
}

/**
 * Each shape's own "positive offset" convention (see tryOffsetShape) is derived from its own
 * stored forward direction — but two connected shapes only offset into one continuous curve
 * together when that convention points the same physical way at their shared joint. Whether it
 * does depends on how the two shapes happen to be chained: one's end meeting the other's start
 * (their forward tangents there point the same way) offsets cleanly with no adjustment; both
 * ends or both starts meeting at a joint (forward tangents point opposite ways, since both
 * shapes are "arriving" or both "leaving") needs one shape's sign flipped relative to the
 * other. This walks the selection's connectivity graph (shapes sharing an endpoint) and returns
 * each shape's sign relative to an arbitrary reference in its connected component, so a single
 * offset distance can be rebased (see resolveDistances) and applied uniformly across the group.
 */
function computeSignByShapeId(shapes: DraftShape[]): Map<string, number> {
  const boundaries = new Map<string, { pt: Pt; tangentAngle: number }[]>();
  for (const shape of shapes) {
    const pts = boundaryPoints(shape);
    if (pts) boundaries.set(shape.id, pts);
  }

  const sign = new Map<string, number>();
  const joinable = shapes.filter(s => boundaries.has(s.id));

  for (const root of joinable) {
    if (sign.has(root.id)) continue;
    sign.set(root.id, 1);
    const queue = [root];
    while (queue.length) {
      const current = queue.pop()!;
      const currentSign = sign.get(current.id)!;
      const currentBoundary = boundaries.get(current.id)!;
      for (const other of joinable) {
        if (sign.has(other.id)) continue;
        const otherBoundary = boundaries.get(other.id)!;
        let matched = false;
        for (const a of currentBoundary) {
          if (matched) break;
          for (const b of otherBoundary) {
            if (!samePoint(a.pt, b.pt)) continue;
            const sameDirection = Math.cos(a.tangentAngle - b.tangentAngle) > 0;
            sign.set(other.id, sameDirection ? currentSign : -currentSign);
            queue.push(other);
            matched = true;
            break;
          }
        }
      }
    }
  }

  return sign;
}

/** Returns a brand-new offset shape, or null if this shape type/distance has no valid offset
 * (e.g. shrinking an arc past a zero radius). Never mutates `shape`. */
function tryOffsetShape(shape: DraftShape, distance: number): DraftShape | null {
  try {
    if (shape.type === 'arc') {
      const arc = offsetArcRadius(new Arc(shape.center.x, shape.center.y, shape.radius, shape.startAngle, shape.endAngle), distance);
      return { id: makeShapeId(), type: 'arc', center: { x: arc.x, y: arc.y }, radius: arc.r, startAngle: arc.start, endAngle: arc.end };
    }
    if (shape.type === 'circle') {
      const circle = offsetCircleRadius(new Circle(shape.center.x, shape.center.y, shape.radius), distance);
      return { id: makeShapeId(), type: 'circle', center: { x: circle.x, y: circle.y }, radius: circle.r };
    }
    if (shape.type === 'line') {
      const { start, end } = offsetLineByDistance(shape.start, shape.end, distance);
      return { id: makeShapeId(), type: 'line', start, end };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Acts on the current selection instead of drawing new shapes. Select shapes in Select mode,
 * then activate Offset: move the mouse to preview a new offset copy of every selected shape live (magnitude
 * + side both driven by whichever selected shape the cursor is nearest to), click to commit,
 * or type an exact distance and press Enter. Non-destructive — originals are untouched, and the
 * tool stays active afterward so the same selection can be offset again at a new distance.
 *
 * A connected run of shapes (sharing endpoints, e.g. a chain built with the chain tool) offsets
 * as one continuous curve — see computeSignByShapeId for how each shape's sign is worked out
 * relative to its neighbors. Known limitation: a joint's continuity/sign is preserved but its
 * exact tangency is not — the offset arcs will meet, but the curvature match isn't re-derived, so
 * a very tight radius next to a very loose one can visibly kink.
 */
export class OffsetTool implements DraftTool {
  readonly id = 'offset';
  readonly label = 'Offset';
  readonly actsOnSelection = true;

  private lastPt: Pt | null = null;
  private cachedShapes: DraftShape[] = [];
  /** Signs for `cachedShapes`, invalidated whenever that list changes. The graph walk depends
   * only on the selection, not the cursor, so it must not be redone per pointermove/frame. */
  private cachedSigns: Map<string, number> | null = null;
  private typedBuffer = '';

  /** Adopts the current selection, dropping the cached signs if it actually changed. */
  private setShapes(shapes: DraftShape[]): void {
    const same = shapes.length === this.cachedShapes.length
      && shapes.every((s, i) => s === this.cachedShapes[i]);
    this.cachedShapes = shapes;
    if (!same) this.cachedSigns = null;
  }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    this.lastPt = pt;
    if (host.getSelectedShapes().length === 0) {
      const hitId = host.hitTestShape(pt);
      if (hitId) host.selectShape(hitId);
    }
    this.setShapes(supportedShapes(host.getSelectedShapes()));
    if (this.cachedShapes.length === 0) return;

    const resolved = this.resolveDistances(pt);
    if (!resolved) return;

    for (const shape of this.cachedShapes) {
      const d = resolved.distances.get(shape.id);
      if (d === undefined) continue;
      const offsetShape = tryOffsetShape(shape, d);
      if (offsetShape) host.addShape(offsetShape);
    }
    this.typedBuffer = '';
    host.requestDraw();
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    this.lastPt = pt;
    this.setShapes(supportedShapes(host.getSelectedShapes()));
    host.requestDraw();
  }

  onPointerUp(_pt: Pt, _host: DraftToolHost): void {
    // clicks drive this tool, not drags
  }

  onKeyDown(event: KeyboardEvent, host: DraftToolHost): boolean {
    if (event.key === 'Escape') {
      if (this.typedBuffer) {
        this.typedBuffer = '';
        host.requestDraw();
        return true;
      }
      return false; // let draft-canvas fall back to its default Escape-to-Select handling
    }
    if (event.key === 'Enter') {
      if (this.lastPt) this.onPointerDown(this.lastPt, host);
      return true;
    }
    if (event.key === 'Backspace') {
      this.typedBuffer = this.typedBuffer.slice(0, -1);
      host.requestDraw();
      return true;
    }
    if (/^[0-9.]$/.test(event.key) || (event.key === '-' && this.typedBuffer === '')) {
      this.typedBuffer += event.key;
      host.requestDraw();
      return true;
    }
    return false;
  }

  renderPreview(gRoot: RootGroup, gUI: RootGroup, pxPerMm: number): void {
    if (!this.lastPt || this.cachedShapes.length === 0) return;
    const resolved = this.resolveDistances(this.lastPt);
    if (!resolved) return;

    for (const shape of this.cachedShapes) {
      const d = resolved.distances.get(shape.id);
      if (d === undefined) continue;
      const offsetShape = tryOffsetShape(shape, d);
      if (!offsetShape) continue;
      this.drawPreviewShape(gRoot, offsetShape);
    }

    const label = this.typedBuffer || `${resolved.rawDistance.toFixed(1)} mm`;
    gUI.append('text')
      .attr('x', this.lastPt.x)
      .attr('y', -this.lastPt.y - 12 / pxPerMm)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', PREVIEW_COLOR)
      .attr('font-size', 12 / pxPerMm)
      .style('pointer-events', 'none')
      .style('user-select', 'none')
      .text(label);
  }

  reset(): void {
    this.lastPt = null;
    this.cachedShapes = [];
    this.cachedSigns = null;
    this.typedBuffer = '';
  }

  /**
   * Resolves one offset distance per selected shape for the current cursor position. The
   * magnitude+side is read off whichever selected shape the cursor is nearest to (the "anchor"),
   * overridden by the typed buffer if present; every other shape's distance is that same value
   * rebased through computeSignByShapeId so a connected run offsets as one continuous curve
   * regardless of how each piece happens to be oriented internally.
   */
  private resolveDistances(pt: Pt): { distances: Map<string, number>; rawDistance: number } | null {
    const nearest = nearestSignedDistance(this.cachedShapes, pt);
    if (!nearest) return null;

    let rawDistance = nearest.signed;
    if (this.typedBuffer && this.typedBuffer !== '-' && this.typedBuffer !== '.') {
      const parsed = Number(this.typedBuffer);
      if (!Number.isNaN(parsed)) rawDistance = parsed;
    }
    if (Math.abs(rawDistance) < 1e-6) return null;

    const groupSign = this.cachedSigns ??= computeSignByShapeId(this.cachedShapes);
    const anchorSign = groupSign.get(nearest.shapeId) ?? 1;

    const distances = new Map<string, number>();
    for (const shape of this.cachedShapes) {
      const relativeSign = anchorSign * (groupSign.get(shape.id) ?? 1);
      distances.set(shape.id, rawDistance * relativeSign);
    }
    return { distances, rawDistance };
  }

  /** Draws one offset candidate in the same dashed preview style every other tool uses — see
   * two-point-tool.ts's stylePreview, which owns that look. */
  private drawPreviewShape(gRoot: RootGroup, shape: DraftShape): void {
    if (shape.type === 'arc') {
      stylePreview(gRoot.append('path')
        .attr('d', arcPathData(shape.center, shape.radius, shape.startAngle, shape.endAngle)));
    } else if (shape.type === 'circle') {
      stylePreview(gRoot.append('circle')
        .attr('cx', shape.center.x).attr('cy', shape.center.y).attr('r', shape.radius));
    } else if (shape.type === 'line') {
      stylePreview(gRoot.append('line')
        .attr('x1', shape.start.x).attr('y1', shape.start.y)
        .attr('x2', shape.end.x).attr('y2', shape.end.y));
    }
  }
}

export function createOffsetTool(): OffsetTool {
  return new OffsetTool();
}

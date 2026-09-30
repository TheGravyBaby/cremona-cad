import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { dist } from '../../helpers/math/simpleGeometry';
import { DraftTool, DraftToolHost } from './draft-tool';
import { AngleShape, angleSweep, makeShapeId, placeAngle } from './toolbox-shape';
import { drawAngle } from './shape-renderer';
import { CLICK_MOVE_THRESHOLD_PX, PREVIEW_COLOR, angleLockModifier, stylePreview } from './two-point-tool';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/**
 * Four clicks: the vertex, a point on each arm, then where the arc carrying the number goes. The
 * last click is Distance's third click turned round a vertex — it parks the arc clear of the
 * drawing, and landing outside the arms is how the reflex angle is asked for (see placeAngle).
 * Vertex to first arm keeps TwoPointTool's press-drag-release or click-click gesture.
 */
export class AngleTool implements DraftTool {
  readonly id = 'angle';
  readonly label = 'Angle';

  private vertex: Pt | null = null;
  private armA: Pt | null = null;
  private armB: Pt | null = null;
  private currentPt: Pt | null = null;
  private awaitingSecondClick = false;
  private vertexTangent: number | undefined;

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.vertex && this.armA && this.armB) {
      this.commit(pt, host);
      return;
    }
    if (this.vertex && this.armA) {
      this.setArm('armB', this.applyModifier(pt, host), host);
      return;
    }
    if (this.vertex && this.awaitingSecondClick) {
      this.setArm('armA', this.applyModifier(pt, host), host);
      return;
    }
    this.vertex = pt;
    this.currentPt = pt;
    this.vertexTangent = host.getSnapTangent();
    this.awaitingSecondClick = false;
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (!this.vertex) return;
    this.currentPt = this.armB ? pt : this.applyModifier(pt, host);
    host.requestDraw();
  }

  onPointerUp(pt: Pt, host: DraftToolHost): void {
    if (!this.vertex || this.armA || this.awaitingSecondClick) return;
    const end = this.applyModifier(pt, host);
    if (dist(end, this.vertex) * host.getPxPerMm() < CLICK_MOVE_THRESHOLD_PX) {
      this.awaitingSecondClick = true;
      host.requestDraw();
      return;
    }
    this.setArm('armA', end, host);
  }

  // an arm on the vertex has no direction, so a click there is ignored rather than measured
  private setArm(key: 'armA' | 'armB', pt: Pt, host: DraftToolHost): void {
    if (!this.vertex || dist(pt, this.vertex) < 1e-9) return;
    this[key] = pt;
    this.awaitingSecondClick = false;
    host.requestDraw();
  }

  private applyModifier(pt: Pt, host: DraftToolHost): Pt {
    if (!this.vertex) return pt;
    return angleLockModifier(this.vertex, pt, host, this.vertexTangent);
  }

  private commit(pt: Pt, host: DraftToolHost): void {
    if (!this.vertex || !this.armA || !this.armB) return;
    const shape: AngleShape = {
      id: makeShapeId(), type: 'angle', vertex: this.vertex, ...placeAngle(this.vertex, this.armA, this.armB, pt),
    };
    host.addShape(shape);
    this.reset();
    host.requestDraw();
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.vertex) {
      this.reset();
      return true;
    }
    return false;
  }

  renderPreview(gRoot: RootGroup, gUI: RootGroup, pxPerMm: number): void {
    const vertex = this.vertex, current = this.currentPt;
    if (!vertex || !current) return;
    if (!this.armA) {
      stylePreview(gRoot.append('line')
        .attr('x1', vertex.x).attr('y1', vertex.y).attr('x2', current.x).attr('y2', current.y));
      return;
    }
    if (this.armB) {
      drawAngle(gRoot, gUI, { vertex, ...placeAngle(vertex, this.armA, this.armB, current) }, PREVIEW_COLOR, pxPerMm, true);
      return;
    }
    if (dist(current, vertex) < 1e-9) return;
    // before the arc is placed, show the inside angle at a radius that sits inside both arms
    const inside = angleSweep(vertex, this.armA, current).sweep <= Math.PI;
    const [start, end] = inside ? [this.armA, current] : [current, this.armA];
    const radius = 0.4 * Math.min(dist(vertex, this.armA), dist(vertex, current));
    drawAngle(gRoot, gUI, { vertex, start, end, radius }, PREVIEW_COLOR, pxPerMm, true);
  }

  reset(): void {
    this.vertex = null;
    this.armA = null;
    this.armB = null;
    this.currentPt = null;
    this.vertexTangent = undefined;
    this.awaitingSecondClick = false;
  }
}

export function createAngleTool(): AngleTool {
  return new AngleTool();
}

import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';
import { arcPathData, fitTangentArc } from '../../helpers/draftMath';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

const PREVIEW_COLOR = '#2563eb';
const DEFAULT_TANGENT = 0; // pointing along +x, used when the start point didn't snap to anything

type Stage = 'idle' | 'start-set';

/**
 * Two clicks, not a drag. The first sets the arc's start point and locks its
 * starting tangent, inherited from whatever it snapped to (see
 * `DraftToolHost.getSnapTangent`), so consecutive arcs flow smoothly instead of
 * being eyeballed. The second is the end point; radius and sweep are solved
 * from the tangent constraint rather than picked independently.
 *
 * Of the two arcs sharing that start/end pair, the one continuing smoothly from the tangent
 * is preferred by default; Shift takes the other, which sweeps the other way but no longer
 * joins smoothly.
 */
export class TangentArcTool implements DraftTool {
  readonly id = 'arc-tangent';
  readonly label = 'Tangent Arc';

  private stage: Stage = 'idle';
  private start: Pt | null = null;
  private startTangent = DEFAULT_TANGENT;
  private hoverPt: Pt | null = null;
  private preferOtherArc = false;

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') {
      this.start = pt;
      this.startTangent = host.getSnapTangent() ?? DEFAULT_TANGENT;
      this.stage = 'start-set';
    } else {
      this.commit(pt, host);
    }
    host.requestDraw();
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') return;
    this.hoverPt = pt;
    this.preferOtherArc = host.isAngleLockHeld();
    host.requestDraw();
  }

  onPointerUp(_pt: Pt, _host: DraftToolHost): void {
    // clicks drive this tool, not drags — state advances in onPointerDown only
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.stage !== 'idle') {
      this.reset();
      return true;
    }
    return false;
  }

  renderPreview(gRoot: RootGroup, _gUI: RootGroup, pxPerMm: number): void {
    if (!this.start || !this.hoverPt) return;

    const guideLen = 16 / pxPerMm;
    gRoot.append('line')
      .attr('x1', this.start.x - Math.cos(this.startTangent) * guideLen)
      .attr('y1', this.start.y - Math.sin(this.startTangent) * guideLen)
      .attr('x2', this.start.x + Math.cos(this.startTangent) * guideLen)
      .attr('y2', this.start.y + Math.sin(this.startTangent) * guideLen)
      .attr('stroke', PREVIEW_COLOR)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2 4')
      .attr('opacity', 0.5)
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');

    const fit = fitTangentArc(this.start, this.startTangent, this.hoverPt, this.preferOtherArc);
    if (!fit) return;

    gRoot.append('path')
      .attr('d', arcPathData(fit.center, fit.radius, fit.startAngle, fit.endAngle))
      .attr('fill', 'none')
      .attr('stroke', PREVIEW_COLOR)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4 3')
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');
  }

  reset(): void {
    this.stage = 'idle';
    this.start = null;
    this.hoverPt = null;
    this.startTangent = DEFAULT_TANGENT;
    this.preferOtherArc = false;
  }

  private commit(pt: Pt, host: DraftToolHost): void {
    if (!this.start) return;
    const fit = fitTangentArc(this.start, this.startTangent, pt, host.isAngleLockHeld());
    if (fit) {
      host.addShape({
        id: makeShapeId(),
        type: 'arc',
        center: fit.center,
        radius: fit.radius,
        startAngle: fit.startAngle,
        endAngle: fit.endAngle,
      });
    }
    this.reset();
  }
}

export function createTangentArcTool(): TangentArcTool {
  return new TangentArcTool();
}

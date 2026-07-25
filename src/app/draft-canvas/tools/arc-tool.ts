import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';
import { arcPathData, pointOnCircle } from './arc-geometry';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

type ArcStage = 'idle' | 'center-set' | 'radius-set';

const PREVIEW_COLOR = '#2563eb';

/**
 * Three clicks, no dragging: center, then the point that fixes the radius,
 * then a third point whose angle (not distance) fixes where the arc ends.
 * State only advances in onPointerDown — onPointerMove is preview-only.
 */
export class ArcTool implements DraftTool {
  private stage: ArcStage = 'idle';
  private center: Pt | null = null;
  private radiusPt: Pt | null = null;
  private hoverPt: Pt | null = null;

  constructor(
    readonly id: string = 'arc',
    readonly label: string = 'Arc',
    private readonly showCenterGuides: boolean = false,
  ) { }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') {
      this.center = pt;
      this.stage = 'center-set';
    } else if (this.stage === 'center-set') {
      this.radiusPt = pt;
      this.stage = 'radius-set';
    } else {
      this.commit(pt, host);
    }
    host.requestDraw();
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') return;
    this.hoverPt = pt;
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

  renderPreview(gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number): void {
    if (!this.center || !this.hoverPt) return;

    if (this.stage === 'center-set') {
      this.drawGuideLine(gRoot, this.center, this.hoverPt);
      return;
    }

    if (this.stage === 'radius-set' && this.radiusPt) {
      const radius = Math.hypot(this.radiusPt.x - this.center.x, this.radiusPt.y - this.center.y);
      if (radius < 1e-6) return;

      gRoot.append('circle')
        .attr('cx', this.center.x).attr('cy', this.center.y).attr('r', radius)
        .attr('fill', 'none')
        .attr('stroke', PREVIEW_COLOR)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2 4')
        .attr('opacity', 0.5)
        .attr('vector-effect', 'non-scaling-stroke')
        .style('pointer-events', 'none');

      const startAngle = Math.atan2(this.radiusPt.y - this.center.y, this.radiusPt.x - this.center.x);
      const endAngle = Math.atan2(this.hoverPt.y - this.center.y, this.hoverPt.x - this.center.x);

      this.drawGuideLine(gRoot, this.center, this.radiusPt);
      this.drawGuideLine(gRoot, this.center, pointOnCircle(this.center, radius, endAngle));

      gRoot.append('path')
        .attr('d', arcPathData(this.center, radius, startAngle, endAngle))
        .attr('fill', 'none')
        .attr('stroke', PREVIEW_COLOR)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4 3')
        .attr('vector-effect', 'non-scaling-stroke')
        .style('pointer-events', 'none');
    }
  }

  reset(): void {
    this.stage = 'idle';
    this.center = null;
    this.radiusPt = null;
    this.hoverPt = null;
  }

  private commit(pt: Pt, host: DraftToolHost): void {
    if (!this.center || !this.radiusPt) return;
    const radius = Math.hypot(this.radiusPt.x - this.center.x, this.radiusPt.y - this.center.y);
    if (radius < 1e-6) { this.reset(); return; }

    const startAngle = Math.atan2(this.radiusPt.y - this.center.y, this.radiusPt.x - this.center.x);
    const endAngle = Math.atan2(pt.y - this.center.y, pt.x - this.center.x);

    host.addShape({
      id: makeShapeId(),
      type: 'arc',
      center: { ...this.center },
      radius,
      startAngle,
      endAngle,
      ...(this.showCenterGuides ? { showCenterGuides: true } : {}),
    });
    this.reset();
  }

  private drawGuideLine(gRoot: RootGroup, from: Pt, to: Pt): void {
    gRoot.append('line')
      .attr('x1', from.x).attr('y1', from.y)
      .attr('x2', to.x).attr('y2', to.y)
      .attr('stroke', PREVIEW_COLOR)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2 4')
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');
  }
}

export function createArcTool(): ArcTool {
  return new ArcTool();
}

/** Same 3-click arc, but its committed rendering keeps the center/radius guides permanently visible. */
export function createFancyArcTool(): ArcTool {
  return new ArcTool('arc-fancy', 'Fancy Arc', true);
}

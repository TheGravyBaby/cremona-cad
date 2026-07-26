import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';
import { arcPathData, pointOnCircle, pickArcOrientation } from './arc-geometry';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

type ArcStage = 'idle' | 'first-set' | 'second-set';

const PREVIEW_COLOR = '#2563eb';

/**
 * Three clicks, no dragging. Two variants share this class, differing only in
 * what the first two clicks mean:
 *  - center-first (`startFirst = false`): click 1 is the circle's center,
 *    click 2 fixes the radius and the start angle.
 *  - start-first (`startFirst = true`): click 1 is the arc's start point,
 *    click 2 is the circle's center — radius and start angle are derived from
 *    the distance/angle between the two.
 * Either way, the third click's angle (not its distance) fixes where the arc
 * ends. State only advances in onPointerDown — onPointerMove is preview-only.
 *
 * Of the two arcs that share the same start/end boundary points, the shorter (<=180°) one
 * is preferred by default — holding the angle-lock modifier (Shift) while placing the third
 * point takes the longer one instead, mirroring how Shift already means "the other/alternate
 * behavior" for line-drawing's angle lock.
 */
export class ArcTool implements DraftTool {
  private stage: ArcStage = 'idle';
  private pt1: Pt | null = null;
  private pt2: Pt | null = null;
  private hoverPt: Pt | null = null;
  private preferLongArc = false;

  constructor(
    readonly id: string = 'arc',
    readonly label: string = 'Arc',
    private readonly startFirst: boolean = false,
  ) { }

  private get center(): Pt | null {
    return this.startFirst ? this.pt2 : this.pt1;
  }

  /** The point (other than the center) whose distance/angle fixes radius + start angle. */
  private get anchorPt(): Pt | null {
    return this.startFirst ? this.pt1 : this.pt2;
  }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') {
      this.pt1 = pt;
      this.stage = 'first-set';
    } else if (this.stage === 'first-set') {
      this.pt2 = pt;
      this.stage = 'second-set';
    } else {
      this.commit(pt, host);
    }
    host.requestDraw();
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') return;
    this.hoverPt = pt;
    this.preferLongArc = host.isAngleLockHeld();
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
    if (!this.pt1 || !this.hoverPt) return;

    if (this.stage === 'first-set') {
      this.drawGuideLine(gRoot, this.pt1, this.hoverPt);
      return;
    }

    const center = this.center;
    const anchorPt = this.anchorPt;
    if (this.stage === 'second-set' && center && anchorPt) {
      const radius = Math.hypot(anchorPt.x - center.x, anchorPt.y - center.y);
      if (radius < 1e-6) return;

      gRoot.append('circle')
        .attr('cx', center.x).attr('cy', center.y).attr('r', radius)
        .attr('fill', 'none')
        .attr('stroke', PREVIEW_COLOR)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2 4')
        .attr('opacity', 0.5)
        .attr('vector-effect', 'non-scaling-stroke')
        .style('pointer-events', 'none');

      const rawStartAngle = Math.atan2(anchorPt.y - center.y, anchorPt.x - center.x);
      const rawEndAngle = Math.atan2(this.hoverPt.y - center.y, this.hoverPt.x - center.x);
      const { startAngle, endAngle } = pickArcOrientation(rawStartAngle, rawEndAngle, this.preferLongArc);

      this.drawGuideLine(gRoot, center, anchorPt);
      this.drawGuideLine(gRoot, center, pointOnCircle(center, radius, rawEndAngle));

      gRoot.append('path')
        .attr('d', arcPathData(center, radius, startAngle, endAngle))
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
    this.pt1 = null;
    this.pt2 = null;
    this.hoverPt = null;
  }

  private commit(pt: Pt, host: DraftToolHost): void {
    const center = this.center;
    const anchorPt = this.anchorPt;
    if (!center || !anchorPt) return;
    const radius = Math.hypot(anchorPt.x - center.x, anchorPt.y - center.y);
    if (radius < 1e-6) { this.reset(); return; }

    const rawStartAngle = Math.atan2(anchorPt.y - center.y, anchorPt.x - center.x);
    const rawEndAngle = Math.atan2(pt.y - center.y, pt.x - center.x);
    const { startAngle, endAngle } = pickArcOrientation(rawStartAngle, rawEndAngle, host.isAngleLockHeld());

    host.addShape({
      id: makeShapeId(),
      type: 'arc',
      center: { ...center },
      radius,
      startAngle,
      endAngle,
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
  return new ArcTool('arc', 'Arc');
}

/** Same 3-click construction, but the first click sets the arc's start point rather than the circle's center. */
export function createArcStartFirstTool(): ArcTool {
  return new ArcTool('arc-start', '3-Point Arc', true);
}

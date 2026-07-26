import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { DraftShape } from './toolbox-shape';
import { snapToLockedAngle } from './angle-lock';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

export const PREVIEW_COLOR = '#2563eb';

type PreviewRenderer = (gRoot: RootGroup, gUI: RootGroup, pxPerMm: number, start: Pt, end: Pt) => void;

export function previewLine(gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number, start: Pt, end: Pt): void {
  gRoot.append('line')
    .attr('x1', start.x).attr('y1', start.y)
    .attr('x2', end.x).attr('y2', end.y)
    .attr('stroke', PREVIEW_COLOR)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '4 3')
    .attr('vector-effect', 'non-scaling-stroke')
    .style('pointer-events', 'none');
}

export function previewCircle(gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number, center: Pt, radiusPt: Pt): void {
  const radius = Math.hypot(radiusPt.x - center.x, radiusPt.y - center.y);
  gRoot.append('circle')
    .attr('cx', center.x).attr('cy', center.y).attr('r', radius)
    .attr('fill', 'none')
    .attr('stroke', PREVIEW_COLOR)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '4 3')
    .attr('vector-effect', 'non-scaling-stroke')
    .style('pointer-events', 'none');
}

export function previewRect(gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number, p1: Pt, p2: Pt): void {
  gRoot.append('rect')
    .attr('x', Math.min(p1.x, p2.x)).attr('y', Math.min(p1.y, p2.y))
    .attr('width', Math.abs(p2.x - p1.x)).attr('height', Math.abs(p2.y - p1.y))
    .attr('fill', 'none')
    .attr('stroke', PREVIEW_COLOR)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '4 3')
    .attr('vector-effect', 'non-scaling-stroke')
    .style('pointer-events', 'none');
}

/**
 * Shared press-drag-release interaction for any tool defined by exactly two
 * points (a straight segment, or a center + radius point). Only how the
 * final shape is built, and how the drag preview looks, differs per use —
 * see line-tool.ts, circle-tool.ts, dimension-tool.ts.
 */
export class TwoPointTool implements DraftTool {
  private startPt: Pt | null = null;
  private currentPt: Pt | null = null;

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly buildShape: (start: Pt, end: Pt) => DraftShape,
    private readonly renderPreviewShape: PreviewRenderer = previewLine,
    private readonly angleLockEnabled: boolean = false,
  ) { }

  onPointerDown(pt: Pt): void {
    this.startPt = pt;
    this.currentPt = pt;
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (!this.startPt) return;
    this.currentPt = this.applyAngleLock(pt, host);
    host.requestDraw();
  }

  onPointerUp(pt: Pt, host: DraftToolHost): void {
    if (!this.startPt) return;
    const end = this.applyAngleLock(pt, host);
    if (this.startPt.x !== end.x || this.startPt.y !== end.y) {
      host.addShape(this.buildShape(this.startPt, end));
    }
    this.reset();
    host.requestDraw();
  }

  private applyAngleLock(pt: Pt, host: DraftToolHost): Pt {
    if (!this.angleLockEnabled || !this.startPt || !host.isAngleLockHeld()) return pt;
    return snapToLockedAngle(this.startPt, pt);
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.startPt) {
      this.reset();
      return true;
    }
    return false;
  }

  renderPreview(gRoot: RootGroup, gUI: RootGroup, pxPerMm: number): void {
    if (!this.startPt || !this.currentPt) return;
    this.renderPreviewShape(gRoot, gUI, pxPerMm, this.startPt, this.currentPt);
  }

  reset(): void {
    this.startPt = null;
    this.currentPt = null;
  }
}

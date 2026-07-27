import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { DraftShape } from './toolbox-shape';
import { snapToLockedAngle } from './angle-lock';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

export const PREVIEW_COLOR = '#2563eb';

type PreviewRenderer = (gRoot: RootGroup, gUI: RootGroup, pxPerMm: number, start: Pt, end: Pt) => void;

/** Transforms the live second point while the angle-lock modifier (Shift) is held — e.g.
 * snapping to a common angle (Line/Box Line) or forcing a square (Box/Rect). Applied uniformly
 * on every pointermove/pointerup so drag preview and the committed shape always agree. */
export type TwoPointModifier = (start: Pt, pt: Pt, host: DraftToolHost) => Pt;

/** The default angle-lock behavior shared by Line and Box Line — see angle-lock.ts. */
export function angleLockModifier(start: Pt, pt: Pt, host: DraftToolHost): Pt {
  return host.isAngleLockHeld() ? snapToLockedAngle(start, pt) : pt;
}

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

/** Same fixed pixel threshold draft-canvas.ts uses to tell a stationary click apart from a real
 * drag for its own Select-mode drags (endpoint/move/marquee) — kept independent here rather than
 * imported since draft-canvas's copy is a private component constant. */
const CLICK_MOVE_THRESHOLD_PX = 3;

/**
 * Shared interaction for any tool defined by exactly two points (a straight
 * segment, or a center + radius point). Supports both gestures side by side:
 * press-drag-release (as before), and click-click — press+release near the
 * same spot leaves the first point planted and waits for a second click to
 * finish the shape, which is friendlier on a trackpad. Only how the final
 * shape is built, and how the drag/hover preview looks, differs per use —
 * see line-tool.ts, circle-tool.ts, dimension-tool.ts.
 */
export class TwoPointTool implements DraftTool {
  private startPt: Pt | null = null;
  private currentPt: Pt | null = null;
  private awaitingSecondClick = false;

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly buildShape: (start: Pt, end: Pt) => DraftShape,
    private readonly renderPreviewShape: PreviewRenderer = previewLine,
    private readonly modifier?: TwoPointModifier,
  ) { }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.startPt && this.awaitingSecondClick) {
      // Second click of a click-click gesture — finish the shape here, same convention as
      // ArcTool's final click (commits on pointerdown; a click's pointerup does nothing further).
      this.commit(pt, host);
      return;
    }
    this.startPt = pt;
    this.currentPt = pt;
    this.awaitingSecondClick = false;
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (!this.startPt) return;
    this.currentPt = this.applyModifier(pt, host);
    host.requestDraw();
  }

  onPointerUp(pt: Pt, host: DraftToolHost): void {
    if (!this.startPt || this.awaitingSecondClick) return;
    const end = this.applyModifier(pt, host);
    const movedPx = Math.hypot(end.x - this.startPt.x, end.y - this.startPt.y) * host.getPxPerMm();
    if (movedPx < CLICK_MOVE_THRESHOLD_PX) {
      // Barely moved — treat as a click, not a drag: leave the first point planted and wait for
      // a second click instead of committing a near-zero-length shape.
      this.awaitingSecondClick = true;
      host.requestDraw();
      return;
    }
    if (this.startPt.x !== end.x || this.startPt.y !== end.y) {
      host.addShape(this.buildShape(this.startPt, end));
    }
    this.reset();
    host.requestDraw();
  }

  private commit(pt: Pt, host: DraftToolHost): void {
    if (!this.startPt) return;
    const end = this.applyModifier(pt, host);
    if (this.startPt.x !== end.x || this.startPt.y !== end.y) {
      host.addShape(this.buildShape(this.startPt, end));
    }
    this.reset();
    host.requestDraw();
  }

  private applyModifier(pt: Pt, host: DraftToolHost): Pt {
    if (!this.modifier || !this.startPt) return pt;
    return this.modifier(this.startPt, pt, host);
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
    this.awaitingSecondClick = false;
  }
}

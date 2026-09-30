import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { DraftShape } from './toolbox-shape';
import { snapToAngle, snapToLockedAngle } from './angle-lock';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

export const PREVIEW_COLOR = '#2563eb';

/**
 * The dashed, non-scaling, click-through look every in-progress preview shares, applied to an
 * already-positioned element. One definition so a line, a circle and an Offset candidate can't
 * drift into three slightly different previews — see offset-tool.ts, which uses it too.
 */
export function stylePreview<E extends d3.BaseType>(
  sel: d3.Selection<E, unknown, null, undefined>,
): d3.Selection<E, unknown, null, undefined> {
  return sel
    .attr('fill', 'none')
    .attr('stroke', PREVIEW_COLOR)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '4 3')
    .attr('vector-effect', 'non-scaling-stroke')
    .style('pointer-events', 'none');
}

type PreviewRenderer = (gRoot: RootGroup, gUI: RootGroup, pxPerMm: number, start: Pt, end: Pt) => void;

/** Transforms the live second point while the angle-lock modifier (Shift) is held — e.g.
 * snapping to a common angle (Line/Section) or forcing a square (Box/Rect). Applied uniformly
 * on every pointermove/pointerup so drag preview and the committed shape always agree.
 * `startTangent` is the tangent (if any) the start point snapped onto — see angleLockModifier. */
export type TwoPointModifier = (start: Pt, pt: Pt, host: DraftToolHost, startTangent?: number) => Pt;

/**
 * The default angle-lock behavior shared by Line, Dimension and Section. Two independent
 * modifiers, checked in priority order:
 *  - Ctrl (tangent-lock) locks onto the tangent of whatever curve the start point snapped onto —
 *    the same tangent inheritance TangentArcTool uses — so the shape comes out tangent to that
 *    circle/arc/line. A no-op if the start point didn't land on anything with a tangent.
 *  - Shift (angle-lock) locks onto the common 30/45/90° grid, same as ever.
 * Both held at once turns square to the curve instead — its normal, the one angle off the curve
 * that isn't on the grid and so has no other way to be reached.
 */
export function angleLockModifier(start: Pt, pt: Pt, host: DraftToolHost, startTangent?: number): Pt {
  if (startTangent !== undefined && host.isTangentLockHeld()) {
    return snapToAngle(start, pt, host.isAngleLockHeld() ? startTangent + Math.PI / 2 : startTangent);
  }
  if (host.isAngleLockHeld()) return snapToLockedAngle(start, pt);
  return pt;
}

export function previewLine(gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number, start: Pt, end: Pt): void {
  stylePreview(gRoot.append('line')
    .attr('x1', start.x).attr('y1', start.y)
    .attr('x2', end.x).attr('y2', end.y));
}

export function previewCircle(gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number, center: Pt, radiusPt: Pt): void {
  const radius = Math.hypot(radiusPt.x - center.x, radiusPt.y - center.y);
  stylePreview(gRoot.append('circle')
    .attr('cx', center.x).attr('cy', center.y).attr('r', radius));
}

export function previewRect(gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number, p1: Pt, p2: Pt): void {
  stylePreview(gRoot.append('rect')
    .attr('x', Math.min(p1.x, p2.x)).attr('y', Math.min(p1.y, p2.y))
    .attr('width', Math.abs(p2.x - p1.x)).attr('height', Math.abs(p2.y - p1.y)));
}

/** Same fixed pixel threshold draft-canvas.ts uses to tell a stationary click apart from a real
 * drag for its own Select-mode drags (endpoint/move/marquee) — kept independent here rather than
 * imported since draft-canvas's copy is a private component constant. Exported for Distance, which
 * runs the same press-drag-release-or-click-click gesture before its own third click. */
export const CLICK_MOVE_THRESHOLD_PX = 3;

// a number being typed mid-placement, drawn just above the pointer
export function drawTypedLabel(gUI: RootGroup, pt: Pt, text: string, pxPerMm: number): void {
  gUI.append('text')
    .attr('x', pt.x)
    .attr('y', -pt.y - 12 / pxPerMm)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('fill', PREVIEW_COLOR)
    .attr('font-size', 12 / pxPerMm)
    .style('pointer-events', 'none')
    .style('user-select', 'none')
    .text(text);
}

// one key of a number typed mid-placement: the buffer after it, or null when the key wasn't part
// of one. `accept` says which characters count; a minus only leads.
export function typedKey(buffer: string, key: string, accept: RegExp): string | null {
  if (accept.test(key) && !(key === '-' && buffer)) return buffer + key;
  if (key === 'Backspace' && buffer) return buffer.slice(0, -1);
  return null;
}

/** Where the second point lands for numbers typed after the first — null while they don't make
 * one yet. `toward` is the pointer, with any Shift/Ctrl lock already applied. */
export type TypedEnd = (start: Pt, toward: Pt, values: number[]) => Pt | null;

// "length", or "length,angle" with the angle in degrees counterclockwise from the +x axis;
// without one the pointer gives the direction
export function typedAlongPointer(start: Pt, toward: Pt, [length, angleDeg]: number[]): Pt | null {
  if (!(length > 0)) return null;
  const angle = angleDeg !== undefined
    ? angleDeg * Math.PI / 180
    : Math.hypot(toward.x - start.x, toward.y - start.y) > 1e-9 ? Math.atan2(toward.y - start.y, toward.x - start.x) : 0;
  return { x: start.x + length * Math.cos(angle), y: start.y + length * Math.sin(angle) };
}

// "width,height", or one number for a square; the pointer's side of the first corner picks which
// way each runs
export function typedBoxCorner(start: Pt, toward: Pt, [width, height = width]: number[]): Pt | null {
  if (!(width > 0) || !(height > 0)) return null;
  return { x: start.x + (toward.x < start.x ? -width : width), y: start.y + (toward.y < start.y ? -height : height) };
}

/**
 * Shared interaction for any tool defined by exactly two points (a straight
 * segment, or a center + radius point). Supports both gestures side by side:
 * press-drag-release (as before), and click-click — press+release near the
 * same spot leaves the first point planted and waits for a second click to
 * finish the shape, which is friendlier on a trackpad. Only how the final
 * shape is built, and how the drag/hover preview looks, differs per use —
 * see line-tool.ts, polygon-tool.ts, box-tool.ts. Distance runs the same gesture but has a third
 * click after it, so it drives its own state machine and borrows only the pieces (see
 * dimension-tool.ts).
 *
 * Once the first point is down, typing numbers sets the second instead of the pointer — see
 * TypedEnd — and Enter places it. Escape clears what was typed before it cancels the shape.
 */
export class TwoPointTool implements DraftTool {
  private startPt: Pt | null = null;
  private currentPt: Pt | null = null;
  private awaitingSecondClick = false;
  /** The tangent `startPt` snapped onto, if any — captured once when the point is planted (not
   * re-read later, since by then the snap has moved on to wherever the pointer is now). See
   * angleLockModifier. */
  private startTangent: number | undefined;
  private typed = '';

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly buildShape: (start: Pt, end: Pt) => DraftShape,
    private readonly renderPreviewShape: PreviewRenderer = previewLine,
    private readonly modifier?: TwoPointModifier,
    private readonly typedEnd: TypedEnd = typedAlongPointer,
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
    this.startTangent = host.getSnapTangent();
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
    return this.modifier(this.startPt, pt, host, this.startTangent);
  }

  private typedPoint(): Pt | null {
    if (!this.startPt || !this.typed) return null;
    const values = this.typed.split(',').map(v => v.trim() === '' ? NaN : Number(v));
    if (values.some(v => !Number.isFinite(v))) return null;
    return this.typedEnd(this.startPt, this.currentPt ?? this.startPt, values);
  }

  onKeyDown(event: KeyboardEvent, host: DraftToolHost): boolean {
    if (!this.startPt) return false;
    if (event.key === 'Escape') {
      if (this.typed) this.typed = '';
      else this.reset();
      host.requestDraw();
      return true;
    }
    const typed = typedKey(this.typed, event.key, /^[0-9.,]$/);
    if (typed !== null) {
      this.typed = typed;
      host.requestDraw();
      return true;
    }
    if (event.key === 'Enter' && this.typed) {
      const end = this.typedPoint();
      if (end) {
        host.addShape(this.buildShape(this.startPt, end));
        this.reset();
      }
      host.requestDraw();
      return true;
    }
    return false;
  }

  renderPreview(gRoot: RootGroup, gUI: RootGroup, pxPerMm: number): void {
    if (!this.startPt || !this.currentPt) return;
    this.renderPreviewShape(gRoot, gUI, pxPerMm, this.startPt, this.typedPoint() ?? this.currentPt);
    if (this.typed) drawTypedLabel(gUI, this.currentPt, this.typed, pxPerMm);
  }

  reset(): void {
    this.startPt = null;
    this.currentPt = null;
    this.startTangent = undefined;
    this.awaitingSecondClick = false;
    this.typed = '';
  }
}

type ThirdPointPreview = (gRoot: RootGroup, gUI: RootGroup, pxPerMm: number, start: Pt, end: Pt, third: Pt | null) => void;

/**
 * TwoPointTool's gesture for the first two points, then a third click to place something about
 * them — where a dimension line parks, how deep a curve hangs. The preview gets the live pointer
 * as `end` until the second point is down, then as `third`. Ends on top of each other span
 * nothing, so that click is ignored rather than taken as the end.
 */
export class ThreePointTool implements DraftTool {
  private startPt: Pt | null = null;
  private endPt: Pt | null = null;
  private currentPt: Pt | null = null;
  private awaitingSecondClick = false;
  private startTangent: number | undefined;

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly buildShape: (start: Pt, end: Pt, third: Pt) => DraftShape,
    private readonly renderPreviewShape: ThirdPointPreview,
  ) { }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.startPt && this.endPt) {
      host.addShape(this.buildShape(this.startPt, this.endPt, pt));
      this.reset();
      host.requestDraw();
      return;
    }
    if (this.startPt && this.awaitingSecondClick) {
      this.fixEnd(this.applyModifier(pt, host), host);
      return;
    }
    this.startPt = pt;
    this.currentPt = pt;
    this.startTangent = host.getSnapTangent();
    this.awaitingSecondClick = false;
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (!this.startPt) return;
    this.currentPt = this.endPt ? pt : this.applyModifier(pt, host);
    host.requestDraw();
  }

  onPointerUp(pt: Pt, host: DraftToolHost): void {
    if (!this.startPt || this.endPt || this.awaitingSecondClick) return;
    const end = this.applyModifier(pt, host);
    if (Math.hypot(end.x - this.startPt.x, end.y - this.startPt.y) * host.getPxPerMm() < CLICK_MOVE_THRESHOLD_PX) {
      this.awaitingSecondClick = true;
      host.requestDraw();
      return;
    }
    this.fixEnd(end, host);
  }

  private fixEnd(end: Pt, host: DraftToolHost): void {
    if (!this.startPt || (end.x === this.startPt.x && end.y === this.startPt.y)) return;
    this.endPt = end;
    this.currentPt = end;
    this.awaitingSecondClick = false;
    host.requestDraw();
  }

  private applyModifier(pt: Pt, host: DraftToolHost): Pt {
    if (!this.startPt) return pt;
    return angleLockModifier(this.startPt, pt, host, this.startTangent);
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
    this.renderPreviewShape(gRoot, gUI, pxPerMm, this.startPt, this.endPt ?? this.currentPt, this.endPt ? this.currentPt : null);
  }

  reset(): void {
    this.startPt = null;
    this.endPt = null;
    this.currentPt = null;
    this.startTangent = undefined;
    this.awaitingSecondClick = false;
  }
}

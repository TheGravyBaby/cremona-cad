import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { DimensionShape, dimensionOffsetAt, makeShapeId } from './toolbox-shape';
import { drawDimension } from './shape-renderer';
import { CLICK_MOVE_THRESHOLD_PX, PREVIEW_COLOR, angleLockModifier } from './two-point-tool';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/**
 * Three clicks: the two points being measured, then where the dimension line carrying the number
 * goes. That third click is what every CAD package asks for, and it is what makes a drawing with
 * several measurements on one feature readable — each dimension parks at its own offset instead of
 * every number landing on top of the geometry it measures. Only the perpendicular component of the
 * third point is kept, so sliding along the measurement doesn't shift the line (see
 * dimensionOffsetAt); a third click back on the measurement stores no offset at all and gives the
 * flat dimension this tool used to be.
 *
 * The first two points keep TwoPointTool's gesture exactly — press-drag-release, or click-click for
 * a trackpad — since that is the half a user already has in their hands, and angle/tangent lock
 * still apply to the measurement. It is a class of its own rather than a TwoPointTool variant
 * because what differs is the state machine, not the shape it builds: TwoPointTool commits where
 * this one has a stage left to go.
 */
export class DimensionTool implements DraftTool {
  readonly id = 'dimension';
  readonly label = 'Distance';

  private startPt: Pt | null = null;
  /** Set once the measurement is fixed — its presence is what says "placing the line now". */
  private endPt: Pt | null = null;
  /** Live pointer: the far end of the measurement until endPt is set, then where the line goes. */
  private currentPt: Pt | null = null;
  private awaitingSecondClick = false;
  /** The tangent `startPt` snapped onto, if any — captured once when the point is planted, since
   * by the time the second point lands the snap has moved on. See angleLockModifier. */
  private startTangent: number | undefined;

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.startPt && this.endPt) {
      // Third click — commits on pointerdown, the same convention ArcTool's final click uses.
      this.commit(pt, host);
      return;
    }
    if (this.startPt && this.awaitingSecondClick) {
      this.fixMeasurement(this.applyModifier(pt, host), host);
      return;
    }
    this.startPt = pt;
    this.currentPt = pt;
    this.startTangent = host.getSnapTangent();
    this.awaitingSecondClick = false;
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (!this.startPt) return;
    // Angle lock constrains the measurement, not where its line is parked.
    this.currentPt = this.endPt ? pt : this.applyModifier(pt, host);
    host.requestDraw();
  }

  onPointerUp(pt: Pt, host: DraftToolHost): void {
    if (!this.startPt || this.endPt || this.awaitingSecondClick) return;
    const end = this.applyModifier(pt, host);
    const movedPx = Math.hypot(end.x - this.startPt.x, end.y - this.startPt.y) * host.getPxPerMm();
    if (movedPx < CLICK_MOVE_THRESHOLD_PX) {
      // Barely moved — a click, not a drag: leave the first point planted and wait for a second
      // click rather than measuring a near-zero distance.
      this.awaitingSecondClick = true;
      host.requestDraw();
      return;
    }
    this.fixMeasurement(end, host);
  }

  /** Ends the measurement and hands the tool over to placing the line. */
  private fixMeasurement(end: Pt, host: DraftToolHost): void {
    this.endPt = end;
    this.currentPt = end;
    this.awaitingSecondClick = false;
    host.requestDraw();
  }

  private applyModifier(pt: Pt, host: DraftToolHost): Pt {
    if (!this.startPt) return pt;
    return angleLockModifier(this.startPt, pt, host, this.startTangent);
  }

  private commit(pt: Pt, host: DraftToolHost): void {
    const start = this.startPt;
    const end = this.endPt;
    if (!start || !end) return;

    const shape: DimensionShape = { id: makeShapeId(), type: 'dimension', start, end };
    const offset = dimensionOffsetAt(start, end, pt);
    // Left off entirely when the line lands back on the measurement, so a flat dimension is stored
    // exactly as it was before the third click existed.
    if (Math.abs(offset) > 1e-9) shape.offset = offset;

    host.addShape(shape);
    this.reset();
    host.requestDraw();
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.startPt) {
      this.reset();
      return true;
    }
    return false;
  }

  /** Drawn through the committed renderer rather than a lookalike: with three clicks to get
   * through, a preview that disagrees with the result is a preview that lies twice. */
  renderPreview(gRoot: RootGroup, gUI: RootGroup, pxPerMm: number): void {
    if (!this.startPt || !this.currentPt) return;
    const end = this.endPt ?? this.currentPt;
    const offset = this.endPt ? dimensionOffsetAt(this.startPt, this.endPt, this.currentPt) : 0;
    drawDimension(gRoot, gUI, { start: this.startPt, end, offset }, PREVIEW_COLOR, pxPerMm, true);
  }

  reset(): void {
    this.startPt = null;
    this.endPt = null;
    this.currentPt = null;
    this.startTangent = undefined;
    this.awaitingSecondClick = false;
  }
}

export function createDimensionTool(): DimensionTool {
  return new DimensionTool();
}

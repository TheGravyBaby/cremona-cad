import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';
import { angleFromCenter, arcPathData, dist, fitTangentArc, pickArcOrientation, pointOnCircle } from '../../helpers/draftMath';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

const PREVIEW_COLOR = '#2563eb';

type Stage = 'idle' | 'first-set' | 'second-set' | 'chaining';

/**
 * Builds a chain of arcs meeting tangent-to-tangent at each joint, so it reads
 * as one smooth curve even though every arc commits as its own independent,
 * individually editable shape rather than one long path.
 *
 * The first arc is built like the center-first Arc tool (three clicks) — unless
 * that first click snaps onto geometry with a well-defined tangent, in which
 * case the freeform construction is skipped and the chain starts there, tangent
 * to what was snapped. Every arc after the first is a single click, inheriting
 * start point and tangent from the previous arc's end (see fitTangentArc).
 * Escape ends the chain; the next click starts a fresh one.
 */
export class ChainedTangentArcTool implements DraftTool {
  readonly id = 'arc-chain';
  readonly label = 'Chained Tangent Arc';

  private stage: Stage = 'idle';
  private pt1: Pt | null = null; // first arc's center
  private pt2: Pt | null = null; // first arc's radius/start-angle anchor
  private chainPt: Pt | null = null; // current joint point once chaining
  private chainTangent = 0; // tangent direction (radians) of travel at chainPt
  private hoverPt: Pt | null = null;
  // Angle-lock modifier: means "prefer the long (>180°) arc" while building the first
  // arc, or "prefer the other tangent arc" while chaining — same dual meaning the plain
  // Arc tool and Tangent Arc tool each give their own preferLongArc/preferOtherArc flag.
  private preferAlt = false;

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') {
      const snapTangent = host.getSnapTangent();
      if (snapTangent !== undefined) {
        // Clicked on/near existing geometry with a well-defined tangent (an arc, line, etc.)
        // — skip the freeform first-arc construction and start the chain right here, tangent
        // to whatever was snapped, exactly like the Tangent Arc tool's first click does.
        this.chainPt = pt;
        this.chainTangent = snapTangent;
        this.stage = 'chaining';
      } else {
        this.pt1 = pt;
        this.stage = 'first-set';
      }
    } else if (this.stage === 'first-set') {
      this.pt2 = pt;
      this.stage = 'second-set';
    } else if (this.stage === 'second-set') {
      this.commitFirstArc(pt, host);
    } else {
      this.commitChainArc(pt, host);
    }
    host.requestDraw();
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') return;
    this.hoverPt = pt;
    this.preferAlt = host.isAngleLockHeld();
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
    if (!this.hoverPt) return;

    if (this.stage === 'first-set' && this.pt1) {
      this.drawGuideLine(gRoot, this.pt1, this.hoverPt);
      return;
    }

    if (this.stage === 'second-set' && this.pt1 && this.pt2) {
      const center = this.pt1;
      const anchorPt = this.pt2;
      const radius = dist(anchorPt, center);
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

      const rawStartAngle = angleFromCenter(center, anchorPt);
      const rawEndAngle = angleFromCenter(center, this.hoverPt);
      const { startAngle, endAngle } = pickArcOrientation(rawStartAngle, rawEndAngle, this.preferAlt);

      this.drawGuideLine(gRoot, center, anchorPt);
      this.drawGuideLine(gRoot, center, pointOnCircle({ ...center, r: radius }, rawEndAngle));

      gRoot.append('path')
        .attr('d', arcPathData(center, radius, startAngle, endAngle))
        .attr('fill', 'none')
        .attr('stroke', PREVIEW_COLOR)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4 3')
        .attr('vector-effect', 'non-scaling-stroke')
        .style('pointer-events', 'none');
      return;
    }

    if (this.stage === 'chaining' && this.chainPt) {
      const guideLen = 16 / pxPerMm;
      gRoot.append('line')
        .attr('x1', this.chainPt.x - Math.cos(this.chainTangent) * guideLen)
        .attr('y1', this.chainPt.y - Math.sin(this.chainTangent) * guideLen)
        .attr('x2', this.chainPt.x + Math.cos(this.chainTangent) * guideLen)
        .attr('y2', this.chainPt.y + Math.sin(this.chainTangent) * guideLen)
        .attr('stroke', PREVIEW_COLOR)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2 4')
        .attr('opacity', 0.5)
        .attr('vector-effect', 'non-scaling-stroke')
        .style('pointer-events', 'none');

      const fit = fitTangentArc(this.chainPt, this.chainTangent, this.hoverPt, this.preferAlt);
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
  }

  reset(): void {
    this.stage = 'idle';
    this.pt1 = null;
    this.pt2 = null;
    this.chainPt = null;
    this.chainTangent = 0;
    this.hoverPt = null;
    this.preferAlt = false;
  }

  private commitFirstArc(pt: Pt, host: DraftToolHost): void {
    const center = this.pt1;
    const anchorPt = this.pt2;
    if (!center || !anchorPt) { this.reset(); return; }
    const radius = dist(anchorPt, center);
    if (radius < 1e-6) { this.reset(); return; }

    const rawStartAngle = angleFromCenter(center, anchorPt);
    const rawEndAngle = angleFromCenter(center, pt);
    const { startAngle, endAngle } = pickArcOrientation(rawStartAngle, rawEndAngle, host.isAngleLockHeld());

    host.addShape({
      id: makeShapeId(),
      type: 'arc',
      center: { ...center },
      radius,
      startAngle,
      endAngle,
    });

    // Continue the chain from the point actually clicked (third click), not from whichever
    // of startAngle/endAngle pickArcOrientation returned in the "endAngle" slot — it may have
    // swapped the two labels to select the correct sweep direction, so `endAngle` doesn't
    // reliably correspond to the clicked point. `rawEndAngle` (computed straight from `pt`,
    // before any swap) always does. The CCW tangent-direction formula (angle + 90°) holds at
    // any point along a CCW-swept arc regardless of which label it ended up under.
    this.chainPt = pointOnCircle({ ...center, r: radius }, rawEndAngle);
    this.chainTangent = rawEndAngle + Math.PI / 2;
    this.pt1 = null;
    this.pt2 = null;
    this.stage = 'chaining';
  }

  private commitChainArc(pt: Pt, host: DraftToolHost): void {
    if (!this.chainPt) return;
    const fit = fitTangentArc(this.chainPt, this.chainTangent, pt, host.isAngleLockHeld());
    if (!fit) return; // clicked on the tangent line itself — no finite circle fits, ignore

    host.addShape({
      id: makeShapeId(),
      type: 'arc',
      center: fit.center,
      radius: fit.radius,
      startAngle: fit.startAngle,
      endAngle: fit.endAngle,
    });

    // Same swap hazard as commitFirstArc: fitTangentArc may return startAngle/endAngle with
    // the physical points swapped, so continue from the point actually clicked (`pt`, which
    // lies exactly on the fit circle by construction) rather than trusting fit.endAngle.
    const clickedAngle = angleFromCenter(fit.center, pt);
    this.chainPt = pt;
    this.chainTangent = clickedAngle + Math.PI / 2;
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

export function createChainedTangentArcTool(): ChainedTangentArcTool {
  return new ChainedTangentArcTool();
}

import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';
import { dist } from '../../helpers/math/simpleGeometry';
import { ArcFit, fitArcFromEndsAndCenter, fitArcThroughPoints } from '../../helpers/math/draftMath';
import { arcPathData } from '../../helpers/math/pathMath';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

type Stage = 'idle' | 'start-set' | 'end-set';

const PREVIEW_COLOR = '#2563eb';

/** What the third click means. The first two are the arc's two ends either way. */
export type TwoEndArcMode = 'through' | 'center';

/**
 * Three clicks, no dragging, and — unlike the center-first tools in arc-tool.ts — the first two
 * are the arc's own ends. Two variants share this class, differing only in what the third click
 * does:
 *  - `through`: the third point lies *on* the arc, and the circle through all three is solved.
 *    The only construction here that never asks for a center, which is what makes it the one to
 *    trace a curve you can see (a photo, a rubbing) with.
 *  - `center`: the third point is the circle's center. It gets projected onto the perpendicular
 *    bisector of the first two, since that's the only place a center equidistant from both ends
 *    can sit — so it can be clicked by eye rather than having to be exact.
 *
 * State only advances in onPointerDown — onPointerMove is preview-only.
 *
 * Shift asks for the other solution, as everywhere else, though the two modes have different
 * "others" to offer: `center` takes the major (>180°) arc instead of the minor one, and
 * `through` takes the complementary arc — the rest of the same circle, the part the third point
 * isn't on.
 */
export class TwoEndArcTool implements DraftTool {
  private stage: Stage = 'idle';
  private start: Pt | null = null;
  private end: Pt | null = null;
  private hoverPt: Pt | null = null;
  private preferOther = false;

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly mode: TwoEndArcMode,
  ) { }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') {
      this.start = pt;
      this.stage = 'start-set';
    } else if (this.stage === 'start-set') {
      this.end = pt;
      this.stage = 'end-set';
    } else {
      this.commit(pt, host);
    }
    host.requestDraw();
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') return;
    this.hoverPt = pt;
    this.preferOther = host.isAngleLockHeld();
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

    if (this.stage === 'start-set') {
      this.drawGuideLine(gRoot, this.start, this.hoverPt);
      return;
    }
    if (!this.end) return;

    // the chord stays drawn through the third click: it's the one thing both ends of the arc are
    // already committed to, and in center mode it's what the bisector is measured off
    this.drawGuideLine(gRoot, this.start, this.end);

    const fit = this.fit(this.hoverPt, this.preferOther);
    if (!fit) return;

    if (this.mode === 'center') {
      this.drawBisector(gRoot, this.start, this.end, fit.center);
      this.drawGuideLine(gRoot, fit.center, this.start);
      this.drawGuideLine(gRoot, fit.center, this.end);
      gRoot.append('circle')
        .attr('cx', fit.center.x).attr('cy', fit.center.y).attr('r', 2.5 / pxPerMm)
        .attr('fill', PREVIEW_COLOR)
        .style('pointer-events', 'none');
    }

    // the rest of the circle the arc is cut from, same faint dashed ring the center-first tools
    // show, so the sweep that was picked reads against the one that wasn't
    gRoot.append('circle')
      .attr('cx', fit.center.x).attr('cy', fit.center.y).attr('r', fit.radius)
      .attr('fill', 'none')
      .attr('stroke', PREVIEW_COLOR)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2 4')
      .attr('opacity', 0.5)
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');

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
    this.end = null;
    this.hoverPt = null;
    this.preferOther = false;
  }

  private fit(third: Pt, preferOther: boolean): ArcFit | null {
    if (!this.start || !this.end) return null;
    return this.mode === 'through'
      ? fitArcThroughPoints(this.start, this.end, third, preferOther)
      : fitArcFromEndsAndCenter(this.start, this.end, third, preferOther);
  }

  private commit(pt: Pt, host: DraftToolHost): void {
    // no fit means three points on one line (or a zero-length chord) — there is no arc to make,
    // so drop the construction rather than committing a circle the size of the county
    const fit = this.fit(pt, host.isAngleLockHeld());
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

  /** The line the third click is being railed onto, drawn past the center it resolved to so the
   * constraint is visible rather than something the cursor mysteriously slides along. */
  private drawBisector(gRoot: RootGroup, start: Pt, end: Pt, center: Pt): void {
    const chord = dist(start, end);
    if (chord < 1e-9) return;
    const nx = -(end.y - start.y) / chord;
    const ny = (end.x - start.x) / chord;
    const mid: Pt = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const reach = Math.max(dist(mid, center) + chord * 0.25, chord * 0.5);

    gRoot.append('line')
      .attr('x1', mid.x - nx * reach).attr('y1', mid.y - ny * reach)
      .attr('x2', mid.x + nx * reach).attr('y2', mid.y + ny * reach)
      .attr('stroke', PREVIEW_COLOR)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '1 5')
      .attr('opacity', 0.6)
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');
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

/** Both ends first, then a point the arc passes through — no center anywhere in the construction. */
export function createThroughArcTool(): TwoEndArcTool {
  return new TwoEndArcTool('arc-through', 'Start–End–Through Arc', 'through');
}

/** Both ends first, then the circle's center, projected onto the bisector between them. */
export function createEndsCenterArcTool(): TwoEndArcTool {
  return new TwoEndArcTool('arc-ends-center', 'Start–End–Center Arc', 'center');
}

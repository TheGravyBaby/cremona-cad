import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { normalizeRadians, TURN } from '../../helpers/math/simpleGeometry';
import { ArcFit, fitTangentArc, solveBiarcThrough } from '../../helpers/math/draftMath';
import { arcPathData } from '../../helpers/math/pathMath';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';
import { CANVAS_COLORS, DASH } from '../../theme/palettes';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

const PREVIEW_COLOR = CANVAS_COLORS.preview;

type Stage = 'idle' | 'start-set' | 'end-set';

// a snapped tangent runs along its path, which doesn't say which way the join leaves it. Each of
// the four ways round has its own biarc through `through`, least turning first: that one is
// usually the join, the others doubling back along a shape before they leave it
export function solveJoinsThrough(start: Pt, startTangent: number, end: Pt, endTangent: number, through: Pt): ArcFit[][] {
  const joins: { arcs: ArcFit[]; turn: number }[] = [];
  for (const flip1 of [0, TURN.half]) {
    for (const flip2 of [0, TURN.half]) {
      const arcs = solveBiarcThrough(start, startTangent + flip1, end, endTangent + flip2, through);
      if (arcs) joins.push({ arcs, turn: arcs.reduce((sum, arc) => sum + normalizeRadians(arc.endAngle - arc.startAngle), 0) });
    }
  }
  return joins.sort((a, b) => a.turn - b.turn).map(j => j.arcs);
}

/**
 * Joins two shapes smoothly. With both ends snapped to a tangent, three clicks: the two ends, then
 * a point the join passes through, which picks one of the infinitely many biarcs between them.
 * Shift steps through which way the join leaves each end. With one end free it's a single tangent arc on the second click, Shift taking the other way round.
 */
export class JoinArcTool implements DraftTool {
  readonly id = 'join-arc';
  readonly label = 'Join Arc';

  private stage: Stage = 'idle';
  private start: Pt | null = null;
  private startTangent: number | undefined;
  private end: Pt | null = null;
  private endTangent: number | undefined;
  private hoverPt: Pt | null = null;
  private hoverTangent: number | undefined;
  private preferOther = false;
  private orientation = 0;

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') {
      this.start = pt;
      this.startTangent = host.getSnapTangent();
      this.stage = 'start-set';
    } else if (this.stage === 'start-set') {
      const endTangent = host.getSnapTangent();
      if (this.startTangent !== undefined && endTangent !== undefined) {
        this.end = pt;
        this.endTangent = endTangent;
        this.stage = 'end-set';
      } else {
        this.commit(this.resolveSingle(pt, endTangent, host.isAngleLockHeld()), host);
      }
    } else {
      const arcs = this.resolveThrough(pt);
      if (arcs.length > 0) this.commit(arcs, host);
    }
    host.requestDraw();
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (this.stage === 'idle') return;
    this.hoverPt = pt;
    this.hoverTangent = host.getSnapTangent();
    this.preferOther = host.isAngleLockHeld();
    host.requestDraw();
  }

  onPointerUp(_pt: Pt, _host: DraftToolHost): void {
    // clicks drive this tool, not drags — state advances in onPointerDown only
  }

  onKeyDown(event: KeyboardEvent, host: DraftToolHost): boolean {
    if (event.key === 'Escape' && this.stage !== 'idle') {
      this.reset();
      return true;
    }
    if (event.key === 'Shift' && !event.repeat && this.stage === 'end-set') {
      this.orientation++;
      host.requestDraw();
      return true;
    }
    return false;
  }

  renderPreview(gRoot: RootGroup, _gUI: RootGroup, pxPerMm: number): void {
    if (!this.start || !this.hoverPt) return;

    const guideLen = 16 / pxPerMm;
    const guides: [Pt, number | undefined][] = [[this.start, this.startTangent]];
    if (this.end) guides.push([this.end, this.endTangent]);
    else guides.push([this.hoverPt, this.hoverTangent]);
    for (const [at, tangent] of guides) {
      if (tangent === undefined) continue;
      gRoot.append('line')
        .attr('x1', at.x - Math.cos(tangent) * guideLen)
        .attr('y1', at.y - Math.sin(tangent) * guideLen)
        .attr('x2', at.x + Math.cos(tangent) * guideLen)
        .attr('y2', at.y + Math.sin(tangent) * guideLen)
        .attr('stroke', PREVIEW_COLOR)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', DASH.construction)
        .attr('opacity', 0.5)
        .attr('vector-effect', 'non-scaling-stroke')
        .style('pointer-events', 'none');
    }

    let arcs: ArcFit[];
    if (this.stage === 'end-set') arcs = this.resolveThrough(this.hoverPt);
    else if (this.startTangent !== undefined && this.hoverTangent !== undefined) arcs = [];
    else arcs = this.resolveSingle(this.hoverPt, this.hoverTangent, this.preferOther);
    for (const arc of arcs) {
      gRoot.append('path')
        .attr('d', arcPathData(arc.center, arc.radius, arc.startAngle, arc.endAngle))
        .attr('fill', 'none')
        .attr('stroke', PREVIEW_COLOR)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', DASH.preview)
        .attr('vector-effect', 'non-scaling-stroke')
        .style('pointer-events', 'none');
    }
  }

  reset(): void {
    this.stage = 'idle';
    this.start = null;
    this.startTangent = undefined;
    this.end = null;
    this.endTangent = undefined;
    this.hoverPt = null;
    this.hoverTangent = undefined;
    this.preferOther = false;
    this.orientation = 0;
  }

  private commit(arcs: ArcFit[], host: DraftToolHost): void {
    for (const arc of arcs) {
      host.addShape({
        id: makeShapeId(),
        type: 'arc',
        center: arc.center,
        radius: arc.radius,
        startAngle: arc.startAngle,
        endAngle: arc.endAngle,
      });
    }
    this.reset();
  }

  private resolveThrough(through: Pt): ArcFit[] {
    if (!this.start || this.startTangent === undefined || !this.end || this.endTangent === undefined) return [];
    const joins = solveJoinsThrough(this.start, this.startTangent, this.end, this.endTangent, through);
    return joins.length > 0 ? joins[this.orientation % joins.length] : [];
  }

  // two free points don't determine a curve, so that case yields nothing
  private resolveSingle(end: Pt, endTangent: number | undefined, preferOther: boolean): ArcFit[] {
    if (!this.start) return [];
    let fit: ArcFit | null = null;
    if (this.startTangent !== undefined) fit = fitTangentArc(this.start, this.startTangent, end, preferOther);
    else if (endTangent !== undefined) fit = fitTangentArc(end, endTangent, this.start, preferOther);
    return fit ? [fit] : [];
  }
}

export function createJoinArcTool(): JoinArcTool {
  return new JoinArcTool();
}

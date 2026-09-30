import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { dist } from '../../helpers/math/simpleGeometry';
import { battenPath, catenaryBetween, cycloidBetween } from '../../helpers/math/pathMath';
import { DraftTool, DraftToolHost } from './draft-tool';
import { CycloidSpec, PathShape, makeShapeId } from './toolbox-shape';
import { CLICK_MOVE_THRESHOLD_PX, PREVIEW_COLOR, angleLockModifier, stylePreview } from './two-point-tool';
import { ToolboxStore } from './toolbox-store';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

// how far pt stands off the chord, positive to the left of start→end
export function chordOffset(start: Pt, end: Pt, pt: Pt): number {
  const L = dist(start, end);
  if (L < 1e-9) return 0;
  return ((end.x - start.x) * (pt.y - start.y) - (end.y - start.y) * (pt.x - start.x)) / L;
}

/**
 * Three clicks: the two ends, then how deep the curve runs. The ends keep Distance's gesture and
 * its Shift/Ctrl locks; the third click only counts for its distance off the chord, and which side
 * it lands on is the side the curve bows to — so the same tool hangs a chain or raises an arch.
 * Commits a path, which moves and snaps like any other outline; a cycloid's also keeps what it was
 * drawn from, so its factor and percent can be changed once it is down.
 */
export class ChordCurveTool implements DraftTool {
  private startPt: Pt | null = null;
  private endPt: Pt | null = null;
  private currentPt: Pt | null = null;
  private awaitingSecondClick = false;
  private startTangent: number | undefined;

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly toolbox: ToolboxStore,
    private readonly curve: (start: Pt, end: Pt, depth: number) => Pick<PathShape, 'd' | 'cycloid'>,
  ) { }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.startPt && this.endPt) {
      this.commit(pt, host);
      return;
    }
    if (this.startPt && this.awaitingSecondClick) {
      this.fixEnds(this.applyModifier(pt, host), host);
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
    if (dist(end, this.startPt) * host.getPxPerMm() < CLICK_MOVE_THRESHOLD_PX) {
      this.awaitingSecondClick = true;
      host.requestDraw();
      return;
    }
    this.fixEnds(end, host);
  }

  // ends on top of each other span nothing, so that click is ignored rather than taken as the end
  private fixEnds(end: Pt, host: DraftToolHost): void {
    if (!this.startPt || dist(end, this.startPt) < 1e-9) return;
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
    if (!this.startPt || !this.endPt) return;
    host.addShape({
      id: makeShapeId(),
      type: 'path',
      ...this.curve(this.startPt, this.endPt, chordOffset(this.startPt, this.endPt, pt)),
      dashed: this.toolbox.currentDashed,
    });
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

  renderPreview(gRoot: RootGroup): void {
    const start = this.startPt, current = this.currentPt;
    if (!start || !current) return;
    const d = this.endPt
      ? this.curve(start, this.endPt, chordOffset(start, this.endPt, current)).d
      : `M ${start.x} ${start.y} L ${current.x} ${current.y}`;
    stylePreview(gRoot.append('path').attr('d', d));
  }

  reset(): void {
    this.startPt = null;
    this.endPt = null;
    this.currentPt = null;
    this.startTangent = undefined;
    this.awaitingSecondClick = false;
  }
}

export function createCatenaryTool(toolbox: ToolboxStore): ChordCurveTool {
  return new ChordCurveTool('catenary', 'Catenary', toolbox, (start, end, depth) => ({ d: catenaryBetween(start, end, depth) }));
}

export function cycloidPathData(c: CycloidSpec): string {
  return cycloidBetween(c.start, c.end, c.depth, c.factor, c.pct);
}

// reads the factor and percent at every draw, so the settings bar's fields reshape the preview as they change
export function createCycloidTool(toolbox: ToolboxStore): ChordCurveTool {
  return new ChordCurveTool('cycloid', 'Cycloid', toolbox, (start, end, depth) => {
    const cycloid = { start, end, depth, factor: toolbox.currentCycloidFactor, pct: toolbox.currentCycloidPct };
    return { d: cycloidPathData(cycloid), cycloid };
  });
}

/**
 * Click to set each pin; the curve is the one a thin strip takes bent through them, running on
 * straight past the end pins. Clicking the last pin again (a double-click does) or Enter, Escape
 * or right-click finishes it; clicking the first pin closes it into a loop. Backspace pulls the
 * last pin. Its pins stay on as handles, so a placed batten is faired by moving them.
 */
export class BattenTool implements DraftTool {
  readonly id = 'batten';
  readonly label = 'Batten';
  readonly claimsDoubleClick = true;

  private pins: Pt[] = [];
  private currentPt: Pt | null = null;

  constructor(private readonly toolbox: ToolboxStore) { }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    const near = (q: Pt) => dist(pt, q) * host.getPxPerMm() < CLICK_MOVE_THRESHOLD_PX;
    if (this.pins.length >= 3 && near(this.pins[0])) {
      this.finish(host, true);
      return;
    }
    if (this.pins.length >= 1 && near(this.pins[this.pins.length - 1])) {
      this.finish(host, false);
      return;
    }
    this.pins.push(pt);
    this.currentPt = pt;
    host.requestDraw();
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (this.pins.length === 0) return;
    this.currentPt = pt;
    host.requestDraw();
  }

  onPointerUp(): void { }

  onKeyDown(event: KeyboardEvent, host: DraftToolHost): boolean {
    if (this.pins.length === 0) return false;
    if (event.key === 'Enter' || event.key === 'Escape') {
      this.finish(host, false);
      return true;
    }
    if (event.key === 'Backspace') {
      this.pins.pop();
      if (this.pins.length === 0) this.reset();
      host.requestDraw();
      return true;
    }
    return false;
  }

  private finish(host: DraftToolHost, closed: boolean): void {
    if (this.pins.length >= 2) {
      const batten = { pins: this.pins, closed };
      host.addShape({ id: makeShapeId(), type: 'path', d: battenPath(batten.pins, closed), batten, dashed: this.toolbox.currentDashed });
    }
    this.reset();
    host.requestDraw();
  }

  renderPreview(gRoot: RootGroup, _gUI: RootGroup, pxPerMm: number): void {
    if (this.pins.length === 0 || !this.currentPt) return;
    stylePreview(gRoot.append('path').attr('d', battenPath([...this.pins, this.currentPt], false)));
    for (const p of this.pins) {
      gRoot.append('circle').attr('cx', p.x).attr('cy', p.y).attr('r', 3 / pxPerMm)
        .attr('fill', PREVIEW_COLOR).style('pointer-events', 'none');
    }
  }

  reset(): void {
    this.pins = [];
    this.currentPt = null;
  }
}

export function createBattenTool(toolbox: ToolboxStore): BattenTool {
  return new BattenTool(toolbox);
}

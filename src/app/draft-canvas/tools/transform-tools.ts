import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { Matrix2D } from '../../helpers/math/pathMath';
import { DraftTool, DraftToolHost } from './draft-tool';
import { reflectAcross, rotateAbout, scaleAbout, transformShape, translation } from './shape-transform';
import { drawShape } from './shape-renderer';
import { snapToLockedAngle } from './angle-lock';
import { PREVIEW_COLOR, stylePreview, typedKey } from './two-point-tool';
import { SelectionActions } from './selection-actions';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/**
 * What one transform tool is: how many clicks set it up before the next one applies it, and the
 * matrix those points, the pointer and any typed number make. `transform` returns null while
 * there isn't enough to go on, which is also when nothing previews and Enter does nothing.
 */
type TransformSpec = {
  id: string;
  label: string;
  picks: number;
  transform(picks: Pt[], pointer: Pt, typed: number | null, host: DraftToolHost): Matrix2D | null;
  /** The readout beside the pointer. */
  readout(picks: Pt[], pointer: Pt, typed: string, host: DraftToolHost): string;
};

/**
 * Mirror, Rotate and Scale by hand: click the points the transform is defined by, then a last
 * click (or Enter on a typed number) applies it to the selection, previewed as you move. The same
 * gesture Offset uses — acts on a selection made first, adopts a clicked shape when there is none,
 * and stays active afterwards so the result can be worked on again. Points snap like any other
 * tool's. Applied through SelectionActions.transform, so a recipe piece gets a transformed copy.
 */
export class TransformTool implements DraftTool {
  readonly actsOnSelection = true;
  readonly id: string;
  readonly label: string;

  private picks: Pt[] = [];
  private pointer: Pt | null = null;
  private typed = '';
  // renderPreview isn't handed the host, so the one the last pointer event came with is kept
  private host: DraftToolHost | null = null;

  constructor(private readonly spec: TransformSpec, private readonly actions: SelectionActions) {
    this.id = spec.id;
    this.label = spec.label;
  }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    this.host = host;
    this.pointer = pt;
    if (host.getSelectedShapes().length === 0) {
      const hit = host.hitTestShape(pt);
      if (hit) host.selectShape(hit);
      return;
    }
    if (this.picks.length < this.spec.picks) {
      this.picks.push(pt);
      host.requestDraw();
      return;
    }
    this.apply(host);
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    this.host = host;
    this.pointer = pt;
    host.requestDraw();
  }

  onPointerUp(): void {
    // clicks drive this tool, not drags
  }

  onKeyDown(event: KeyboardEvent, host: DraftToolHost): boolean {
    this.host = host;
    if (event.key === 'Escape') {
      if (!this.typed && this.picks.length === 0) return false;
      this.typed = '';
      this.picks = [];
      host.requestDraw();
      return true;
    }
    if (event.key === 'Enter') {
      this.apply(host);
      return true;
    }
    const typed = typedKey(this.typed, event.key, /^[0-9.-]$/);
    if (typed !== null) {
      this.typed = typed;
      host.requestDraw();
      return true;
    }
    return false;
  }

  renderPreview(gRoot: RootGroup, gUI: RootGroup, pxPerMm: number): void {
    const { pointer, host } = this;
    if (!pointer || !host) return;
    for (const p of this.picks) {
      gUI.append('circle').attr('cx', p.x).attr('cy', -p.y).attr('r', 3 / pxPerMm)
        .attr('fill', PREVIEW_COLOR).style('pointer-events', 'none');
      stylePreview(gRoot.append('line').attr('x1', p.x).attr('y1', p.y).attr('x2', pointer.x).attr('y2', pointer.y));
    }

    const m = this.matrix(pointer, host);
    if (m) {
      const ghost = gRoot.append('g').attr('opacity', 0.6).style('pointer-events', 'none');
      const ghostUI = gUI.append('g').attr('opacity', 0.6).style('pointer-events', 'none');
      for (const shape of host.getSelectedShapes()) {
        const moved = transformShape(shape, m);
        if (moved && moved.type !== 'image') drawShape(ghost, ghostUI, { ...moved, color: PREVIEW_COLOR }, pxPerMm);
      }
    }

    gUI.append('text')
      .attr('x', pointer.x)
      .attr('y', -pointer.y - 12 / pxPerMm)
      .attr('text-anchor', 'middle')
      .attr('fill', PREVIEW_COLOR)
      .attr('font-size', 12 / pxPerMm)
      .style('pointer-events', 'none')
      .style('user-select', 'none')
      .text(this.spec.readout(this.picks, pointer, this.typed, host));
  }

  reset(): void {
    this.picks = [];
    this.pointer = null;
    this.typed = '';
  }

  private matrix(pointer: Pt, host: DraftToolHost): Matrix2D | null {
    if (this.picks.length === 0) return null;
    const typed = /\d/.test(this.typed) ? Number(this.typed) : NaN;
    return this.spec.transform(this.picks, pointer, Number.isNaN(typed) ? null : typed, host);
  }

  private apply(host: DraftToolHost): void {
    const m = this.pointer && this.matrix(this.pointer, host);
    if (!m) return;
    this.actions.transform(m, this.label);
    this.picks = [];
    this.typed = '';
    host.requestDraw();
  }
}

const deg = (rad: number) => rad * 180 / Math.PI;
const bearing = (from: Pt, to: Pt) => Math.atan2(to.y - from.y, to.x - from.x);

/** From a point to a point: click the point on the selection to carry (a corner, an arc's end),
 * then where it lands, both snapped — how a copied piece is set down exactly on the recipe's
 * geometry, which a drag by the outline can't do. Shift holds the common angles; a typed number
 * is the distance along the pointer's direction. */
export function createMoveTool(actions: SelectionActions): TransformTool {
  const shift = (picks: Pt[], pointer: Pt, typed: number | null, host: DraftToolHost): Pt | null => {
    const to = host.isAngleLockHeld() ? snapToLockedAngle(picks[0], pointer) : pointer;
    const dx = to.x - picks[0].x, dy = to.y - picks[0].y;
    if (typed === null) return { x: dx, y: dy };
    const len = Math.hypot(dx, dy);
    return len < 1e-9 ? null : { x: dx * typed / len, y: dy * typed / len };
  };
  return new TransformTool({
    id: 'move', label: 'Move', picks: 1,
    transform: (picks, pointer, typed, host) => {
      const d = shift(picks, pointer, typed, host);
      return d && translation(d.x, d.y);
    },
    readout: (picks, pointer, typed, host) => {
      if (picks.length === 0) return 'Click the point to move from';
      if (typed) return `${typed} mm`;
      const d = shift(picks, pointer, null, host)!;
      return `${Math.hypot(d.x, d.y).toFixed(2)} mm`;
    },
  }, actions);
}

/** Across a line: click one point on it, then the line follows the pointer (Shift for the common
 * angles), or type its angle in degrees. */
export function createMirrorLineTool(actions: SelectionActions): TransformTool {
  const angleOf = (picks: Pt[], pointer: Pt, typed: number | null, host: DraftToolHost) => {
    if (typed !== null) return typed * Math.PI / 180;
    return bearing(picks[0], host.isAngleLockHeld() ? snapToLockedAngle(picks[0], pointer) : pointer);
  };
  return new TransformTool({
    id: 'mirror-line', label: 'Mirror Line', picks: 1,
    transform: (picks, pointer, typed, host) => reflectAcross(picks[0], angleOf(picks, pointer, typed, host)),
    readout: (picks, pointer, typed, host) => picks.length === 0 ? 'Click a point on the mirror line'
      : typed ? `${typed}°` : `${deg(angleOf(picks, pointer, null, host)).toFixed(1)}°`,
  }, actions);
}

/** About a centre: click the centre, then a point to turn from, then where it turns to (Shift
 * for 15° steps) — or type degrees counterclockwise after the centre. */
export function createRotateTool(actions: SelectionActions): TransformTool {
  const angleOf = (picks: Pt[], pointer: Pt, typed: number | null, host: DraftToolHost): number | null => {
    if (typed !== null) return typed * Math.PI / 180;
    if (picks.length < 2) return null;
    const a = bearing(picks[0], pointer) - bearing(picks[0], picks[1]);
    const step = Math.PI / 12;
    return host.isAngleLockHeld() ? Math.round(a / step) * step : a;
  };
  return new TransformTool({
    id: 'rotate', label: 'Rotate', picks: 2,
    transform: (picks, pointer, typed, host) => {
      const a = angleOf(picks, pointer, typed, host);
      return a === null ? null : rotateAbout(picks[0], a);
    },
    readout: (picks, pointer, typed, host) => {
      if (picks.length === 0) return 'Click the centre to turn about';
      if (typed) return `${typed}°`;
      const a = angleOf(picks, pointer, null, host);
      if (a === null) return 'Click a point to turn from, or type degrees';
      return `${(((deg(a) + 540) % 360) - 180).toFixed(1)}°`;
    },
  }, actions);
}

/** About a base point: click the base, then a reference point, then where the reference should
 * land. Typed before the reference, a number is the factor; typed after it, it's the length the
 * reference distance should become — how a traced drawing is brought to a known size. */
export function createScaleTool(actions: SelectionActions): TransformTool {
  const factorOf = (picks: Pt[], pointer: Pt, typed: number | null): number | null => {
    if (picks.length < 2) return typed;
    const ref = Math.hypot(picks[1].x - picks[0].x, picks[1].y - picks[0].y);
    if (ref < 1e-9) return null;
    return typed !== null ? typed / ref : Math.hypot(pointer.x - picks[0].x, pointer.y - picks[0].y) / ref;
  };
  return new TransformTool({
    id: 'scale', label: 'Scale', picks: 2,
    transform: (picks, pointer, typed) => {
      const k = factorOf(picks, pointer, typed);
      return k && k > 0 ? scaleAbout(picks[0], k) : null;
    },
    readout: (picks, pointer, typed) => {
      if (picks.length === 0) return 'Click the base point';
      if (picks.length === 1) return typed ? `× ${typed}` : 'Click a reference point, or type a factor';
      if (typed) return `${typed} mm`;
      return `× ${factorOf(picks, pointer, null)?.toFixed(3) ?? '—'}`;
    },
  }, actions);
}

import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { angleFromCenter, closestPointOnLine, dist, lineFromTwoPoints, pointOnCircle } from '../../helpers/math/simpleGeometry';
import { FilletPiece, filletBetween } from '../../helpers/math/draftMath';
import { arcPathData } from '../../helpers/math/pathMath';
import { DraftTool, DraftToolHost } from './draft-tool';
import { ArcShape, DraftShape, LineShape, makeShapeId } from './toolbox-shape';
import { stylePreview } from './two-point-tool';
import { ToolboxStore } from './toolbox-store';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;
type Filletable = LineShape | ArcShape | Extract<DraftShape, { type: 'circle' }>;

function asPiece(shape: Filletable): FilletPiece {
  if (shape.type === 'line') return { line: [shape.start, shape.end] };
  return { circle: { ...shape.center, r: shape.radius } };
}

// the point on the piece nearest the click, so "which part to keep" is read off the piece itself
function onPiece(shape: Filletable, pt: Pt): Pt {
  if (shape.type === 'line') return closestPointOnLine(pt, lineFromTwoPoints(shape.start, shape.end)).point;
  return pointOnCircle({ ...shape.center, r: shape.radius }, angleFromCenter(shape.center, pt));
}

// cut back (or run on) to where the round meets it, keeping the side that was clicked. A whole
// circle is left whole: there is no one end of it to cut back to.
function trimmed(shape: Filletable, pick: Pt, at: Pt): Filletable {
  if (shape.type === 'line') {
    const d = { x: shape.end.x - shape.start.x, y: shape.end.y - shape.start.y };
    const along = (p: Pt) => (p.x - shape.start.x) * d.x + (p.y - shape.start.y) * d.y;
    return along(pick) > along(at) ? { ...shape, start: at } : { ...shape, end: at };
  }
  if (shape.type === 'circle') return shape;
  const turn = angleFromCenter(shape.center, at) - angleFromCenter(shape.center, pick);
  const ccw = Math.sin(turn) > 0;
  return ccw ? { ...shape, endAngle: angleFromCenter(shape.center, at) } : { ...shape, startAngle: angleFromCenter(shape.center, at) };
}

/**
 * Click the first piece, then the second, each on the part to keep; they are rounded into each
 * other at the Radius in the settings bar and cut back (or run on) to meet the round, as one undo
 * step. Lines, arcs and circles, drawn or the recipe's — a recipe piece is rounded against but
 * never cut, and a circle is never cut either.
 */
export class FilletTool implements DraftTool {
  readonly id = 'fillet';
  readonly label = 'Fillet';

  private first: { shape: Filletable; pick: Pt } | null = null;
  private hover: { shape: Filletable; pick: Pt } | null = null;

  constructor(private readonly toolbox: ToolboxStore) { }

  private pieceAt(pt: Pt, host: DraftToolHost): { shape: Filletable; pick: Pt } | null {
    const shape = host.curveAt(pt);
    if (!shape || (shape.type !== 'line' && shape.type !== 'arc' && shape.type !== 'circle')) return null;
    if (shape.type === 'line' && dist(shape.start, shape.end) < 1e-9) return null;
    return { shape, pick: onPiece(shape, pt) };
  }

  private solve() {
    if (!this.first || !this.hover || this.hover.shape.id === this.first.shape.id) return null;
    const a = this.first, b = this.hover;
    const fillet = filletBetween(asPiece(a.shape), asPiece(b.shape), this.toolbox.currentFilletRadius, a.pick, b.pick);
    if (!fillet) return null;
    const qA = angleFromCenter(fillet.center, fillet.atA), qB = angleFromCenter(fillet.center, fillet.atB);
    const round: ArcShape = {
      id: makeShapeId(), type: 'arc', center: fillet.center, radius: this.toolbox.currentFilletRadius,
      startAngle: fillet.ccw ? qA : qB, endAngle: fillet.ccw ? qB : qA, color: a.shape.color,
    };
    return { round, a: trimmed(a.shape, a.pick, fillet.atA), b: trimmed(b.shape, b.pick, fillet.atB) };
  }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    const piece = this.pieceAt(pt, host);
    if (!this.first) {
      this.first = piece;
      host.requestDraw();
      return;
    }
    this.hover = piece;
    const result = this.solve();
    if (!result) return;
    host.replaceShapes([result.a, result.b], [result.round]);
    this.reset();
    host.requestDraw();
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (!this.first) return;
    this.hover = this.pieceAt(pt, host);
    host.requestDraw();
  }

  onPointerUp(): void { }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.first) {
      this.reset();
      return true;
    }
    return false;
  }

  renderPreview(gRoot: RootGroup): void {
    const result = this.solve();
    if (!result) return;
    for (const s of [result.round, result.a, result.b]) {
      if (s.type === 'line') {
        stylePreview(gRoot.append('line').attr('x1', s.start.x).attr('y1', s.start.y).attr('x2', s.end.x).attr('y2', s.end.y));
      } else if (s.type === 'arc') {
        stylePreview(gRoot.append('path').attr('d', arcPathData(s.center, s.radius, s.startAngle, s.endAngle)));
      }
    }
  }

  reset(): void {
    this.first = null;
    this.hover = null;
  }
}

export function createFilletTool(toolbox: ToolboxStore): FilletTool {
  return new FilletTool(toolbox);
}

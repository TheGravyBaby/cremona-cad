import * as d3 from 'd3';
import { Circle, Pt } from '../../models/types';
import { angleFromCenter, dist, pointOnCircle } from '../../helpers/math/simpleGeometry';
import { commonTangents, tangentPointsFromExternalPoint } from '../../helpers/math/draftMath';
import {
  perpendicularFeetOnPolyline, polylineCumulativeLengths, projectOntoPolyline, tangentPointsFromPointToPolyline,
} from '../../helpers/math/vibeMath';
import { shapeCurves } from './curve-tools';
import { pathFromPolygon } from '../../helpers/math/pathMath';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';
import { CLICK_MOVE_THRESHOLD_PX, angleLockModifier, stylePreview } from './two-point-tool';
import { ToolboxStore } from './toolbox-store';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/**
 * Click to place each corner; Shift and Ctrl lock each segment off the corner before it, as they
 * do for Line. Clicking the last corner again (a double-click does) or Enter, Escape or
 * right-click finishes it; clicking the first corner closes it. Backspace takes back a corner.
 * Finishing keeps what was placed rather than throwing it away — undo is there for that.
 */
export class PolylineTool implements DraftTool {
  readonly id = 'polyline';
  readonly label = 'Polyline';
  readonly claimsDoubleClick = true;

  private points: Pt[] = [];
  private tangents: (number | undefined)[] = [];
  private currentPt: Pt | null = null;

  constructor(private readonly toolbox: ToolboxStore) { }

  private locked(pt: Pt, host: DraftToolHost): Pt {
    const last = this.points[this.points.length - 1];
    return last ? angleLockModifier(last, pt, host, this.tangents[this.tangents.length - 1]) : pt;
  }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    const p = this.locked(pt, host);
    const near = (q: Pt) => dist(p, q) * host.getPxPerMm() < CLICK_MOVE_THRESHOLD_PX;
    if (this.points.length >= 3 && near(this.points[0])) {
      this.finish(host, true);
      return;
    }
    if (this.points.length >= 1 && near(this.points[this.points.length - 1])) {
      this.finish(host, false);
      return;
    }
    this.points.push(p);
    this.tangents.push(host.getSnapTangent());
    this.currentPt = p;
    host.requestDraw();
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (this.points.length === 0) return;
    this.currentPt = this.locked(pt, host);
    host.requestDraw();
  }

  onPointerUp(): void { }

  onKeyDown(event: KeyboardEvent, host: DraftToolHost): boolean {
    if (this.points.length === 0) return false;
    if (event.key === 'Enter' || event.key === 'Escape') {
      this.finish(host, false);
      return true;
    }
    if (event.key === 'Backspace') {
      this.points.pop();
      this.tangents.pop();
      if (this.points.length === 0) this.reset();
      host.requestDraw();
      return true;
    }
    return false;
  }

  // two corners are just a line, kept as one so it gets a line's handles
  private finish(host: DraftToolHost, closed: boolean): void {
    const pts = this.points;
    const dashed = this.toolbox.currentDashed;
    if (pts.length === 2) {
      host.addShape({ id: makeShapeId(), type: 'line', start: pts[0], end: pts[1], dashed });
    } else if (pts.length > 2) {
      const d = closed ? pathFromPolygon(pts) : pathFromPolygon(pts).replace(/ Z$/, '');
      host.addShape({ id: makeShapeId(), type: 'path', d, dashed });
    }
    this.reset();
    host.requestDraw();
  }

  renderPreview(gRoot: RootGroup): void {
    if (this.points.length === 0 || !this.currentPt) return;
    const d = [...this.points, this.currentPt].map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    stylePreview(gRoot.append('path').attr('d', d));
  }

  reset(): void {
    this.points = [];
    this.tangents = [];
    this.currentPt = null;
  }
}

// a click on something a line can be solved against — a circle, arc or path, and for Perpendicular
// a line or rectangle too — means "meet this", at the solution nearest the click; anywhere else it
// is a plain point. A path is sampled, and only the piece clicked is kept.
type End = { pt: Pt; circle?: Circle; curve?: Pt[]; line?: [Pt, Pt] };

function endAt(pt: Pt, host: DraftToolHost, straight: boolean): End {
  const shape = host.curveAt(pt);
  if (shape?.type === 'circle' || shape?.type === 'arc') return { pt, circle: { ...shape.center, r: shape.radius } };
  if (straight && shape?.type === 'line') return { pt, line: [shape.start, shape.end] };
  if (shape?.type !== 'path' && !(straight && shape?.type === 'rect')) return { pt };
  const pieces = shapeCurves(shape).map(c => c.points);
  const curve = pieces.reduce<Pt[] | null>((best, c) => {
    const d = projectOntoPolyline(pt, c, polylineCumulativeLengths(c)).dist;
    return !best || d < projectOntoPolyline(pt, best, polylineCumulativeLengths(best)).dist ? c : best;
  }, null);
  return curve ? { pt, curve } : { pt };
}

function nearestTo(click: Pt, candidates: Pt[]): Pt | null {
  return candidates.reduce<Pt | null>((best, c) => !best || dist(c, click) < dist(best, click) ? c : best, null);
}

// where a line from `from` touches this end: the end's own point when it has nothing to touch
function tangentFoot(from: Pt, end: End): Pt | null {
  if (end.circle) return nearestTo(end.pt, tangentPointsFromExternalPoint(from, end.circle));
  if (end.curve) return nearestTo(end.pt, tangentPointsFromPointToPolyline(from, end.curve));
  return end.pt;
}

// where a line from `from` meets this end square. A line is taken as running on past its ends,
// the way a perpendicular is dropped onto one in drafting.
function perpendicularFoot(from: Pt, end: End): Pt | null {
  if (end.line) {
    const [a, b] = end.line;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-18) return null;
    const t = ((from.x - a.x) * dx + (from.y - a.y) * dy) / len2;
    return { x: a.x + t * dx, y: a.y + t * dy };
  }
  if (end.circle) {
    if (dist(from, end.circle) < 1e-9) return null;
    const angle = angleFromCenter(end.circle, from);
    return nearestTo(end.pt, [pointOnCircle(end.circle, angle), pointOnCircle(end.circle, angle + Math.PI)]);
  }
  if (end.curve) return nearestTo(end.pt, perpendicularFeetOnPolyline(from, end.curve));
  return end.pt;
}

const SOLVE_ITERATIONS = 30;

// with a curve at both ends there's no closed form, so each end is solved from the other in turn
// until neither moves — the click on each keeps it to the stretch of curve that was meant
function solveEnds(a: End, b: End, foot: (from: Pt, end: End) => Pt | null): [Pt, Pt] | null {
  let pa = a.pt;
  let pb = b.pt;
  for (let i = 0; i < SOLVE_ITERATIONS; i++) {
    const nb = foot(pa, b);
    const na = nb && foot(nb, a);
    if (!nb || !na) return null;
    const moved = dist(na, pa) + dist(nb, pb);
    pa = na;
    pb = nb;
    if (moved < 1e-6) break;
  }
  return [pa, pb];
}

export function tangentLine(a: End, b: End): [Pt, Pt] | null {
  if (a.circle && b.circle) {
    const pairs = commonTangents(a.circle, b.circle);
    if (pairs.length === 0) return null;
    return pairs.reduce((best, p) =>
      dist(p[0], a.pt) + dist(p[1], b.pt) < dist(best[0], a.pt) + dist(best[1], b.pt) ? p : best);
  }
  return solveEnds(a, b, tangentFoot);
}

// two lines that cross have no common perpendicular; solving converges on the crossing, which the
// tool then refuses as a line of no length
export function perpendicularLine(a: End, b: End): [Pt, Pt] | null {
  return solveEnds(a, b, perpendicularFoot);
}

/**
 * A line solved against what its ends are clicked on, rather than placed by its ends: Tangent
 * Line touches a circle, arc or path, at the far end or both — what Line's Ctrl can't, since that
 * only follows the curve the line starts on. Perpendicular Line meets a line, circle, arc,
 * rectangle or path square, the same way round — Ctrl+Shift being the version for the start.
 * Each click is a point, or something to solve against, and only has to land near the right
 * solution. Drag or click-click, like Line.
 */
export class SolvedLineTool implements DraftTool {
  private first: End | null = null;
  private current: End | null = null;
  private awaitingSecondClick = false;

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly toolbox: ToolboxStore,
    private readonly straight: boolean,
    private readonly solve: (a: End, b: End) => [Pt, Pt] | null,
  ) { }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    if (this.first && this.awaitingSecondClick) {
      this.commit(endAt(pt, host, this.straight), host);
      return;
    }
    this.first = endAt(pt, host, this.straight);
    this.current = this.first;
    this.awaitingSecondClick = false;
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (!this.first) return;
    this.current = endAt(pt, host, this.straight);
    host.requestDraw();
  }

  onPointerUp(pt: Pt, host: DraftToolHost): void {
    if (!this.first || this.awaitingSecondClick) return;
    if (dist(pt, this.first.pt) * host.getPxPerMm() < CLICK_MOVE_THRESHOLD_PX) {
      this.awaitingSecondClick = true;
      host.requestDraw();
      return;
    }
    this.commit(endAt(pt, host, this.straight), host);
  }

  // nothing to solve from where the pointer is (inside the circle, say) leaves the first click waiting
  private commit(second: End, host: DraftToolHost): void {
    if (!this.first) return;
    const line = this.solve(this.first, second);
    if (!line || dist(line[0], line[1]) < 1e-9) {
      this.awaitingSecondClick = true;
      return;
    }
    host.addShape({ id: makeShapeId(), type: 'line', start: line[0], end: line[1], dashed: this.toolbox.currentDashed });
    this.reset();
    host.requestDraw();
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.first) {
      this.reset();
      return true;
    }
    return false;
  }

  renderPreview(gRoot: RootGroup): void {
    if (!this.first || !this.current) return;
    const [a, b] = this.solve(this.first, this.current) ?? [this.first.pt, this.current.pt];
    stylePreview(gRoot.append('line').attr('x1', a.x).attr('y1', a.y).attr('x2', b.x).attr('y2', b.y));
  }

  reset(): void {
    this.first = null;
    this.current = null;
    this.awaitingSecondClick = false;
  }
}

export function createPolylineTool(toolbox: ToolboxStore): PolylineTool {
  return new PolylineTool(toolbox);
}

export function createTangentLineTool(toolbox: ToolboxStore): SolvedLineTool {
  return new SolvedLineTool('line-tangent', 'Tangent Line', toolbox, false, tangentLine);
}

export function createPerpendicularLineTool(toolbox: ToolboxStore): SolvedLineTool {
  return new SolvedLineTool('line-perpendicular', 'Perpendicular Line', toolbox, true, perpendicularLine);
}

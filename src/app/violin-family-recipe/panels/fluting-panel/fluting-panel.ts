import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { findJoiningArcs } from '../../../helpers/math/draftMath';
import {
  closestPointOnSegment, dist, flipArcAboutY, offsetArcRadius, pointInPolygon, pointOnCircle, signedRadianDelta, TURN,
} from '../../../helpers/math/simpleGeometry';
import { pathFromArc, samplePathToPolyline, translatePath } from '../../../helpers/math/pathMath';
import { unifyConnectedSvgPaths } from '../../../helpers/math/pathVibes';
import { renderFilledPath, renderPath, renderSolveFailures } from '../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../helpers/validators';
import { showFieldHelp } from '../../../docs/field-help';
import { Arc, Pt } from '../../../models/types';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../theme/theme.service';
import {
  ChannelSolve, FlutingFailure, FlutingSolve, GougeParams, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams,
  ViolinFamilyToggleKey, ViolinFamilyViewFlags,
} from '../../violin-family-types';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { renderFholes } from '../fhole-contours-panel/fhole-contours-panel';
import {
  offsetArcs, outerCorners, outerPath, PLATE_LAYOUT_GAP, renderOuterContour, ribArcs, RibArcs, solveOuterContour,
  violNeckTopLine,
} from '../outer-contour-panel/outer-contour-panel';

// The fluting channel: the hollow each plate is gouged with inside the flat left round its edge. The
// channel follows the rib outline round the bouts and bypasses the corners, the C bout's run joined
// to the bout arc either side by an S of two arcs; the wedge of wood that leaves at each corner is
// taken down by hand afterwards. Panel and render, then the gouge, the channel's path, and solve.

@Component({
  selector: 'app-vf-fluting-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './fluting-panel.html',
  styleUrls: ['../../../sidebar.css', '../../violin-family.css'],
})
export class FlutingPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = [];
  protected readonly pal = ThemeService.getPalette('classicCremona');
  protected readonly help = showFieldHelp;

  // the first gouges, sized by instrument family, with a narrower one through the waist, and the
  // flat at the edge half the overhang wide
  static seed(p: ViolinFamilyParams): void {
    if (p.fluting || !p.outerContour) return;
    let [sweepRadius, depth, cBoutSweep] =
      p.body.height < 400 ? [15, 1, 7.5] :    // violin
      p.body.height < 500 ? [18, 1.5, 9] :    // viola
      p.body.height < 800 ? [28, 2, 14] :     // cello
      [38, 2.5, 19];                           // bass
    let gouge = (): GougeParams => ({ sweepRadius, depth, cBoutSweep, useCBoutGouge: true });
    p.fluting = { flutingEdge: p.body.overhang * 0.5, cornerGouge: true, top: gouge(), back: gouge() };
  }

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; the template's width readouts and report() read it
  f!: FlutingSolve;

  ngOnInit(): void {
    this.draw();
  }

  // every field calls this: the shell seeds the stage and schedules the commit (the undo entry, the
  // session write, report()) for when the typing stops, and the picture catches up now
  edited(): void {
    this.edit.emit();
    this.draw();
  }

  // messages for what didn't solve, raised once the edit settles rather than on every keystroke
  report(): void {
    reportFailures(this.f.failures, 'Fluting');
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let o = solveOuterContour(p)!;
      let f = this.f = solveFluting(p)!;
      this.drawn.emit([
        renderOuterContour(p, o, this.pal, this.flags, false),
        renderFholes(p, this.pal),
        renderFluting(p, f, this.pal, true),
        renderSolveFailures(f.failures, this.pal.alert, true),
      ]);
    });
  }
}

// each plate's gouge takes its own ink; the top's is also what a later panel draws its channel
// edge in
export const TOP_GOUGE_INK = 3;
export const BACK_GOUGE_INK = 0;

// the channel as a filled band on each plate, the top at the body's place and the back beside it,
// over the grey plates. The corner join, the wood the gouge leaves at each corner, draws lighter
// than the channel, and lighter still with the corner pass off, when it marks wood left rather
// than taken
export const renderFluting = (
  p: ViolinFamilyParams,
  f: FlutingSolve,
  pal: PanelPalette,
  currentModule: boolean,
) => (g: any, ui: any): void => {
  let plates: [ChannelSolve | null, string, number][] = [
    [f.top, pal.ink(TOP_GOUGE_INK), 0],
    [f.back, pal.ink(BACK_GOUGE_INK), -p.body.width * PLATE_LAYOUT_GAP],
  ];
  for (let [channel, ink, dx] of plates) {
    if (!channel) continue;
    let color = currentModule ? ink : pal.neutral;
    if (f.outerEdge) renderFilledPath(translatePath(`${f.outerEdge} Z ${channel.outer} Z`, dx, 0), color, p.fluting!.cornerGouge ? 0.15 : 0.08)(g, ui);
    renderFilledPath(translatePath(`${channel.outer} Z ${channel.inner} Z`, dx, 0), color, 0.3)(g, ui);
  }
};

// the top plate's inner channel edge alone, faint in the top gouge's own ink: the line the f-holes
// are placed against, for the panels that place them
export const renderFlutingInnerEdge = (f: FlutingSolve) => (g: any, ui: any): void => {
  if (f.top) renderPath(f.top.inner, ThemeService.getPalette('classicCremona').ink(TOP_GOUGE_INK).faint(3), STROKE_WEIGHT.guide)(g, ui);
};

// a gouge sweep this shallow relative to its depth isn't a real tool; guards the sqrt below
const MIN_SWEEP_RATIO = 1.0001;

// the half width of the cut a gouge of sweep radius R leaves at depth D: the chord where its
// circular section comes back up to the plate's surface. It depends only on the tool, so it is
// the same at the waist, at the widest bout and round the corners. Zero when the gouge can't
// reach D at all
export function gougeHalfWidth(sweepRadius: number, depth: number): number {
  if (sweepRadius <= 0 || depth <= 0) return 0;
  if (depth * MIN_SWEEP_RATIO >= sweepRadius) return 0;
  return Math.sqrt(2 * sweepRadius * depth - depth * depth);
}

// a flank is joined from a little way back from its end rather than the end itself, which is
// somewhere up the next bout, so it stops there
function angleBeforeEnd(arc: Arc, degrees: number): number {
  const delta = signedRadianDelta(arc.end - arc.start);
  const dir = Math.sign(delta) || 1;
  return arc.end - dir * Math.min(degrees * TURN.degree, Math.abs(delta));
}

// some center bout / main bout fluting combinations degenerate, this catches those
const MAX_JOIN_RADIUS_TO_CHORD = 10;
// how far the search below is willing to walk the c-bout arc's own endpoint back before
// admitting no join is possible and falling back to the error
const MAX_CBOUT_RETREAT_DEG = 45;

// the join is an S, and which way round depends on which side of the chord each tangent falls. an
// inverted corner swings C0's end past the chord and the usual S loops out to reach it, its joint
// straying off the chord; flipping both inverts mirrors the S, and that's tried only then, so
// anything the usual S handled is left to it. a join tighter than half its chord curls into the
// corner the channel is meant to bypass, and one that crosses the fluting edge at the corner is cut
// outside the flat it bypasses
function attemptJoin(arc1: Arc, side1: 'start' | 'end', arc2: Arc, side2: 'start' | 'end', invert: boolean, edge: Pt[] | null): Arc[] | null {
  const P1 = pointOnCircle(arc1, side1 === 'end' ? arc1.end : arc1.start);
  const P2 = pointOnCircle(arc2, side2 === 'end' ? arc2.end : arc2.start);
  const chord = dist(P1, P2);
  const mid = new Pt((P1.x + P2.x) / 2, (P1.y + P2.y) / 2);
  const loops = (join: Arc[]) => dist(pointOnCircle(join[0], join[0].end), mid) > chord / 2;
  const fits = (join: Arc[]) => join[0].r <= MAX_JOIN_RADIUS_TO_CHORD * chord && join[0].r >= chord / 2;
  const outside = (q: Pt) => !pointInPolygon(q, edge!)
    && edge!.every((a, i) => i === 0 || closestPointOnSegment(q, edge![i - 1], a).dist > 0.01);
  const crosses = (join: Arc[]) => edge !== null && join.some(arc => {
    const sweep = signedRadianDelta(arc.end - arc.start);
    const steps = Math.max(16, Math.ceil(arc.r * Math.abs(sweep) / 0.5));
    return Array.from({ length: steps + 1 }, (_, i) => pointOnCircle(arc, arc.start + sweep * i / steps)).some(outside);
  });

  let join = findJoiningArcs(arc1, side1, arc2, side2, invert);
  if (join.length === 0) return null;
  if (loops(join)) join = findJoiningArcs(arc1, side1, arc2, side2, !invert, true);
  return join.length > 0 && !loops(join) && fits(join) && !crosses(join) ? join : null;
}

// a c-bout usually ends heading within a few degrees of the bout arc it joins, but one whose corner
// wraps around it ends turned out towards the corner, and a join from there scoops. past the
// trigger its end is drawn back along C0 until the headings agree to the target, though no further
// than the given share of the way to the waist. the trigger sits clear of every ordinary corner
const JOIN_HEADING_TRIGGER = 15 * TURN.degree;
const JOIN_HEADING_TARGET = 4 * TURN.degree;
const MAX_CBOUT_EASE_TO_WAIST = 0.8;

function easeCBoutEnd(cBout: Arc, side: 'start' | 'end', bout: Arc, boutSide: 'start' | 'end'): void {
  // tangents are square to their radii, so two headings differ by the angle between the radii, mod pi
  let gap = ((side === 'end' ? cBout.end : cBout.start) - (boutSide === 'end' ? bout.end : bout.start)) % TURN.half;
  if (gap > TURN.quarter) gap -= TURN.half;
  if (gap < -TURN.quarter) gap += TURN.half;
  if (Math.abs(gap) <= JOIN_HEADING_TRIGGER) return;

  const span = signedRadianDelta(cBout.end - cBout.start);
  const inward = side === 'end' ? -Math.sign(span) : Math.sign(span);
  const move = Math.sign(gap) * JOIN_HEADING_TARGET - gap;
  if (Math.sign(move) !== inward) return;
  const eased = Math.sign(move) * Math.min(Math.abs(move), Math.abs(span) / 2 * MAX_CBOUT_EASE_TO_WAIST);
  if (side === 'end') cBout.end += eased; else cBout.start += eased;
}

function retreatAngle(startAngle: number, endAngle: number, side: 'start' | 'end', degrees: number): number {
  const delta = signedRadianDelta(endAngle - startAngle);
  const dir = Math.sign(delta) || 1;
  return side === 'end' ? endAngle - dir * degrees * TURN.degree : startAngle + dir * degrees * TURN.degree;
}

// some arcs cannot be joined given their ends, this system will "peel back" the c-bout's end a
// degree at a time until a suitable angle is found for a join. Null once the retreat is spent,
// the c-bout's ends put back
function joinChannel(
  arc1: Arc, side1: 'start' | 'end',
  arc2: Arc, side2: 'start' | 'end',
  invert: boolean,
  cBoutSide: 1 | 2,
  edge: Pt[] | null,
): Arc[] | null {
  const cBoutArc = cBoutSide === 1 ? arc1 : arc2;
  const cBoutJoinSide = cBoutSide === 1 ? side1 : side2;
  const originalStart = cBoutArc.start;
  const originalEnd = cBoutArc.end;

  for (let degrees = 0; degrees <= MAX_CBOUT_RETREAT_DEG; degrees++) {
    if (degrees > 0) {
      const angle = retreatAngle(originalStart, originalEnd, cBoutJoinSide, degrees);
      if (cBoutJoinSide === 'end') cBoutArc.end = angle; else cBoutArc.start = angle;
    }
    const join = attemptJoin(arc1, side1, arc2, side2, invert, edge);
    if (join) return join;
  }

  cBoutArc.start = originalStart;
  cBoutArc.end = originalEnd;
  return null;
}

// the fluting's edge, the plate edge `delta` in with the corners followed: the line the channel is cut
// inside. Null when the offset is too far in for the corner arcs to exist
function outerEdgePath(p: ViolinFamilyParams, rib: RibArcs, delta: number): string | null {
  let inset = p.body.overhang + p.body.rib;
  try {
    return outerPath(p, rib, outerCorners(p, rib, inset), inset - delta, false).path;
  } catch {
    return null;
  }
}

// the channel's arcs at `offset` from the rib line (in when negative), C0 at its own: the bouts'
// offset arcs, and in place of each corner the S joining C0 to the bout arc beside it. A viol
// corner's flank is joined from a little way back from its end. Null when a join can't be made
function channelArcs(p: ViolinFamilyParams, rib: RibArcs, offset: number, centerOffset: number, edge: Pt[] | null): Arc[] | null {
  let k = p.corners!;
  let arcs = offsetArcs(p, rib, offset, false, centerOffset);
  // L0, L1, L2, C0, U2, U1, U0: whichever side is viol, its corner arc (L2/U2) drops out,
  // leaving C0 next to L1/U1
  let at = k.useViolCornerLC ? 2 : 3;
  let C0 = arcs[at];
  let L2 = k.useViolCornerLC ? null : arcs[at - 1];
  let U2 = k.useViolCornerUC ? null : arcs[at + 1];
  let back = k.useViolCornerLC && k.useViolCornerUC ? 10 : 12;

  if (L2) easeCBoutEnd(C0, 'end', L2, 'end');
  if (U2) easeCBoutEnd(C0, 'start', U2, 'end');

  // a flank shorter than the join-back is cut to nothing: the join still leaves from its start
  // with its heading, but a zero-length arc in the path is one the sampler can't measure
  let flank = (arc: Arc): Arc => {
    let cut = offsetArcRadius(arc, offset);
    cut.end = angleBeforeEnd(cut, back);
    if (Math.abs(signedRadianDelta(cut.end - cut.start)) > 1e-9) arcs.push(cut);
    return cut;
  };
  let lower = L2 ?? flank(rib.L4!);
  let lowerJoin = joinChannel(lower, 'end', C0, 'end', false, 2, edge);
  if (!lowerJoin) return null;

  let upper = U2 ?? flank(rib.U4!);
  let upperJoin = joinChannel(C0, 'start', upper, 'end', true, 1, edge);
  if (!upperJoin) return null;

  return [...arcs, ...lowerJoin, ...upperJoin];
}

// one edge of the channel as a closed loop, `offset` in from the plate edge, the C bout's run at
// `centerOffset`. The fluting edge it has to stay inside is taken at the outer of the two, or C0's
// own end would sit outside it. No path when the C bout can't be joined to the bouts (`joined` false), or
// when the loop doesn't close, as across a neck face the channel has eaten
function channelPath(p: ViolinFamilyParams, rib: RibArcs, offset: number, centerOffset: number): { path: string | null; joined: boolean } {
  let inset = p.body.overhang + p.body.rib;
  let edge = outerEdgePath(p, rib, Math.min(offset, centerOffset));
  let arcs = channelArcs(p, rib, inset - offset, inset - centerOffset, edge ? samplePathToPolyline(edge, 0.5) : null);
  if (!arcs) return { path: null, joined: false };
  let paths = [...arcs, ...arcs.map(arc => flipArcAboutY(arc))].map(arc => pathFromArc(arc));
  let top = violNeckTopLine(p, rib, inset - offset);
  if (top) paths.push(top);
  try {
    return { path: unifyConnectedSvgPaths(paths), joined: true };
  } catch {
    return { path: null, joined: true };
  }
}

// a later panel reads the channels by calling this; it returns and never writes to the params.
// Each plate's channel is anchored at the fluting edge and grows inward by its gouge's width, so
// its outer edge sits on the fluting edge by construction. A second gouge through the waist moves only
// the C bout's inward offsets; the joins either side re-solve at the new radius
export function solveFluting(p: ViolinFamilyParams): FlutingSolve | null {
  if (!p.fluting || !p.outerContour || !p.corners || !p.bouts) return null;
  let f = p.fluting;
  let s: FlutingSolve = { outerEdge: null, top: null, back: null, failures: [] };

  let rib = ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
  if (!rib || !solveOuterContour(p)!.top) {
    s.failures.push({ message: 'Fluting: the plate edge has to solve first.', unsolved: ['top', 'back'], circles: [], segments: [] });
    return s;
  }
  if (!(Number.isFinite(f.flutingEdge) && f.flutingEdge >= 0)) {
    s.failures.push({ message: 'Fluting: the fluting edge needs a value of 0 or more.', unsolved: ['top', 'back'], circles: [], segments: [] });
    return s;
  }
  s.outerEdge = outerEdgePath(p, rib, f.flutingEdge);

  for (let plate of ['top', 'back'] as const) {
    let label = plate === 'top' ? 'Top plate' : 'Back plate';
    let fail = (message: string): FlutingFailure => ({ message, unsolved: [plate], circles: [], segments: [] });
    solveSection(s.failures, label, [plate], () => {
      let g = f[plate];
      let typed = [g.sweepRadius, g.depth, ...(g.useCBoutGouge ? [g.cBoutSweep] : [])];
      if (!typed.every(Number.isFinite)) return fail(`${label}: every gouge field needs a value.`);
      let w = gougeHalfWidth(g.sweepRadius, g.depth);
      if (w <= 0) return fail(`${label}: the gouge has to cut, so its depth has to be above 0 and under its sweep radius.`);
      let wC = gougeHalfWidth(g.useCBoutGouge ? g.cBoutSweep : g.sweepRadius, g.depth);
      if (wC <= 0) return fail(`${label}: the C bout gouge can't cut this deep. Its sweep has to be above the depth.`);

      let edge = f.flutingEdge;
      let edges = [channelPath(p, rib, edge, edge), channelPath(p, rib, edge + w, edge + wC), channelPath(p, rib, edge + 2 * w, edge + 2 * wC)];
      if (edges.some(e => !e.joined))
        return fail(`${label}: the channel round the C bout can't be joined to the one round the bouts at these corners. Bring the two gouges closer, or open the corners.`);
      if (edges.some(e => !e.path))
        return fail(`${label}: the channel doesn't close into one loop at this width; it has eaten the neck face. Narrow the gouge or bring the fluting edge in.`);
      let [outer, center, inner] = edges.map(e => e.path!);
      s[plate] = { outer, center, inner, width: 2 * w, cBoutWidth: 2 * wC, innerEdgeOffset: edge + 2 * w, innerEdgeOffset_cBout: edge + 2 * wC };
      return null;
    });
  }
  return s;
}

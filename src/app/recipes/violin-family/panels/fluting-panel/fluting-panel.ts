import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { nearestFraction } from '../../../../helpers/nearestFraction';
import { findJoiningArcs, solveBiarcAt } from '../../../../helpers/math/draftMath';
import { calcChannelHalfWidth, calcChannelSweep } from '../../../../helpers/math/archMath';
import {
  angleFromCenter, closestPointOnSegment, dist, flipArcAboutY, normalizeRadians, offsetArcRadius, pointInPolygon, pointOnCircle,
  signedRadianDelta, TURN,
} from '../../../../helpers/math/simpleGeometry';
import { pathFromArc, samplePathToPolyline, translatePath } from '../../../../helpers/math/pathMath';
import { unifyConnectedSvgPaths } from '../../../../helpers/math/pathVibes';
import { renderFilledPath, renderPath, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { buildMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { Arc, Pt } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey } from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import { updateSolved } from '../../violin-family-solved';
import { ChannelSolve, FlutingSolve } from '../../violin-family-solves';
import { familyStandards } from '../../violin-family-seed';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners, solvedRibArcs, RibArcs } from '../corners-panel/corners-panel';
import { renderFholes } from '../fhole-contours-panel/fhole-contours-panel';
import {
  solveOffsetArcs, defineOuterPath, PLATE_LAYOUT_GAP, renderPlateContour, solvedPlateContour, defineViolNeckTopLine,
  calcNeckPurflingRadius, solveNeckPurflingArc,
} from '../plate-contour-panel/plate-contour-panel';

// The fluting channel: the hollow cut into each plate inside the flat left round its edge. The
// channel follows the rib outline round the bouts and bypasses the corners, the C bout's run joined
// to the bout arc either side by an S of two arcs; the wedge of wood that leaves at each corner is
// taken down by hand afterwards. Panel and render, then the channel's section, its path, and solve.

@Component({
  selector: 'app-vf-fluting-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './fluting-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class FlutingPanel extends PanelComponentBase {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = [];
  protected readonly pal = ThemeService.getPalette('classicCremona');

  // the first channels, sized by instrument family, with a narrower one through the waist, and the
  // flat at the edge half the overhang wide
  static seed(p: ViolinFamilyParams): void {
    if (p.fluting || !p.plateContour) return;
    let [width, depth, cBoutWidth] =
      { violin: [11, 1, 7.5], viola: [14.5, 1.5, 10], cello: [21, 2, 14.5], bass: [27, 2.5, 19] }[familyStandards(p.body.height).family];
    p.fluting = {
      flutingEdge: p.body.overhang * 0.5,
      cornerGouge: false,
      top: { width, depth, cBoutWidth, useCBoutGouge: true },
      back: { width, depth, cBoutWidth, useCBoutGouge: true },
    };
  }

  // what the last draw solved; the template's width readouts and reportSolveFailures() read it
  f!: FlutingSolve;

  // the channel's width as a fraction of the body's lower bout width
  protected widthRatio(width: number): string {
    let ratio = width / this.params.body.width;
    return Number.isFinite(ratio) ? nearestFraction(ratio) : '–';
  }

  reportSolveFailures(): void {
    reportFailures(this.f.failures, 'Fluting');
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let p = this.params;
    let pc = solvedPlateContour(p)!;
    let f = this.f = solvedFluting(p)!;
    return [
      renderPlateContour(p, pc, this.pal, this.flags, false),
      renderFholes(p, this.pal),
      renderFluting(p, f, this.pal, true),
      renderSolveFailures(f.failures, this.pal.alert, true),
    ];
  }
}

// each plate's channel takes its own ink; the top's is also what a later panel draws its channel
// edge in
export const TOP_CHANNEL_INK = 3;
export const BACK_CHANNEL_INK = 0;

const renderPlateChannel = (channel: ChannelSolve | null, flutingEdge: string | null, color: string, dx: number, cornerOpacity: number) => (g: any, ui: any): void => {
  if (!channel) return;
  if (flutingEdge) renderFilledPath(translatePath(`${flutingEdge} Z ${channel.outer} Z`, dx, 0), color, cornerOpacity)(g, ui);
  renderFilledPath(translatePath(`${channel.outer} Z ${channel.inner} Z`, dx, 0), color, 0.3)(g, ui);
};

// the channel as a filled band on each plate, the top at the body's place and the back beside it,
// over the grey plates. Outside its own panel it draws in the calling palette's second ink, so the
// arching panels show it in their own green. The corner join, the wood the channel leaves at each
// corner, draws lighter than the channel, and lighter still with the corner pass off, when it marks
// wood left rather than taken
export const renderFluting = (
  p: ViolinFamilyParams,
  f: FlutingSolve,
  pal: PanelPalette,
  currentModule: boolean,
  showBack = true,
) => (g: any, ui: any): void => {
  let cornerOpacity = p.fluting!.cornerGouge ? 0.15 : 0.08;
  let topColor = currentModule ? pal.ink(TOP_CHANNEL_INK) : pal.ink(1);
  let backColor = currentModule ? pal.ink(BACK_CHANNEL_INK) : pal.ink(1);
  renderPlateChannel(f.top, f.flutingEdge, topColor, 0, cornerOpacity)(g, ui);
  if (showBack) renderPlateChannel(f.back, f.flutingEdge, backColor, -p.body.width * PLATE_LAYOUT_GAP, cornerOpacity)(g, ui);
};

// the top plate's inner channel edge alone, faint in the top channel's own ink: the line the f-holes
// are placed against, for the panels that place them
export const renderFlutingInnerEdge = (f: FlutingSolve) => (g: any, ui: any): void => {
  if (f.top) renderPath(f.top.inner, ThemeService.getPalette('classicCremona').ink(TOP_CHANNEL_INK).faint(3), STROKE_WEIGHT.guide)(g, ui);
};

// some center bout / main bout fluting combinations degenerate, this catches those
const MAX_JOIN_RADIUS_TO_CHORD = 10;
// how far the search below is willing to walk the c-bout arc's own endpoint back before
// admitting no join is possible and falling back to the error
const MAX_CBOUT_RETREAT_DEG = 45;

function isJoinLooping(join: Arc[], mid: Pt, chord: number): boolean {
  return dist(pointOnCircle(join[0], join[0].end), mid) > chord / 2;
}

function isJoinFitting(join: Arc[], chord: number): boolean {
  return join[0].r <= MAX_JOIN_RADIUS_TO_CHORD * chord && join[0].r >= chord / 2;
}

function isOutsideEdge(q: Pt, edge: Pt[]): boolean {
  return !pointInPolygon(q, edge)
    && edge.every((a, i) => i === 0 || closestPointOnSegment(q, edge[i - 1], a).dist > 0.01);
}

function isJoinCrossing(join: Arc[], edge: Pt[]): boolean {
  return join.some(arc => {
    const sweep = signedRadianDelta(arc.end - arc.start);
    const steps = Math.max(16, Math.ceil(arc.r * Math.abs(sweep) / 0.5));
    return Array.from({ length: steps + 1 }, (_, i) => pointOnCircle(arc, arc.start + sweep * i / steps)).some(q => isOutsideEdge(q, edge));
  });
}

// the join is an S, and which way round depends on which side of the chord each tangent falls. an
// inverted corner swings C0's end past the chord and the usual S loops out to reach it, its joint
// straying off the chord; flipping both inverts mirrors the S, and that's tried only then, so
// anything the usual S handled is left to it. a join tighter than half its chord curls into the
// corner the channel is meant to bypass, and one that crosses the fluting edge at the corner is cut
// outside the flat it bypasses
function solveSJoin(arc1: Arc, side1: 'start' | 'end', arc2: Arc, side2: 'start' | 'end', invert: boolean, edge: Pt[] | null): Arc[] | null {
  const P1 = pointOnCircle(arc1, side1 === 'end' ? arc1.end : arc1.start);
  const P2 = pointOnCircle(arc2, side2 === 'end' ? arc2.end : arc2.start);
  const chord = dist(P1, P2);
  const mid = new Pt((P1.x + P2.x) / 2, (P1.y + P2.y) / 2);

  let join = findJoiningArcs(arc1, side1, arc2, side2, invert);
  if (join.length === 0) return null;
  if (isJoinLooping(join, mid, chord)) join = findJoiningArcs(arc1, side1, arc2, side2, !invert, true);
  return join.length > 0 && !isJoinLooping(join, mid, chord) && isJoinFitting(join, chord) && (edge === null || !isJoinCrossing(join, edge)) ? join : null;
}

// a c-bout usually ends heading within a few degrees of the bout arc it joins, but one whose corner
// wraps around it ends turned out towards the corner, and a join from there scoops. past the
// trigger its end is drawn back along C0 until the headings agree to the target, though no further
// than the given share of the way to the waist. the trigger sits clear of every ordinary corner
const JOIN_HEADING_TRIGGER = 15 * TURN.degree;
const JOIN_HEADING_TARGET = 4 * TURN.degree;
const MAX_CBOUT_EASE_TO_WAIST = 0.8;
// then the S itself. Run from one arc into the other, it should turn first with the arc it leaves
// and then with the one it enters, carrying on from each rather than doubling back along it, and
// the shorter of its two arcs should turn at least this share of the longer. One that leaves the
// bout straight, turns nearly all its way at one end, or wiggles the other way round has no room
// between the two ends: they are drawn back, each on its own up to the given degrees or half its
// run, the least drawback in all that gives a balanced S still inside the fluting edge, else the
// best balanced that cuts. None cutting, the ends stay
const JOIN_BALANCE = 0.5;
const MAX_JOIN_DRAWBACK_DEG = 25;

function isRunningOn(a: number, sa: number, b: number, sb: number): boolean {
  return sa * sb * Math.cos(a - b) > 0;
}

function calcJoinBalance(join: Arc[] | null, arc1: Arc, side1: 'start' | 'end', arc2: Arc, side2: 'start' | 'end', turn1: number, turn2: number): number {
  if (join?.length !== 2) return -1;
  const [a, b] = join.map(j => signedRadianDelta(j.end - j.start));
  if (Math.sign(a) !== turn1 || Math.sign(b) !== turn2) return -1;
  if (!isRunningOn(side1 === 'end' ? arc1.end : arc1.start, turn1, join[0].start, turn1)) return -1;
  if (!isRunningOn(join[1].end, turn2, side2 === 'end' ? arc2.end : arc2.start, turn2)) return -1;
  return Math.min(Math.abs(a), Math.abs(b)) / Math.max(Math.abs(a), Math.abs(b));
}

type JoinEnd = [Arc, 'start' | 'end', number, number];

function drawBackJoinEnds(ends: JoinEnd[], ...degrees: number[]): void {
  ends.forEach(([arc, s, start, end], i) => {
    const angle = calcRetreatAngle(start, end, s, degrees[i]);
    if (s === 'end') arc.end = angle; else arc.start = angle;
  });
}

function easeCBoutEnd(
  arc1: Arc, side1: 'start' | 'end',
  arc2: Arc, side2: 'start' | 'end',
  invert: boolean,
  cBoutSide: 1 | 2,
  edge: Pt[] | null,
): void {
  const [cBout, side, bout, boutSide] = cBoutSide === 1 ? [arc1, side1, arc2, side2] : [arc2, side2, arc1, side1];
  // tangents are square to their radii, so two headings differ by the angle between the radii, mod pi
  let gap = ((side === 'end' ? cBout.end : cBout.start) - (boutSide === 'end' ? bout.end : bout.start)) % TURN.half;
  if (gap > TURN.quarter) gap -= TURN.half;
  if (gap < -TURN.quarter) gap += TURN.half;
  const span = signedRadianDelta(cBout.end - cBout.start);
  const inward = side === 'end' ? -Math.sign(span) : Math.sign(span);
  const move = Math.sign(gap) * JOIN_HEADING_TARGET - gap;
  if (Math.abs(gap) > JOIN_HEADING_TRIGGER && Math.sign(move) === inward) {
    const eased = Math.sign(move) * Math.min(Math.abs(move), Math.abs(span) / 2 * MAX_CBOUT_EASE_TO_WAIST);
    if (side === 'end') cBout.end += eased; else cBout.start += eased;
  }

  // +1 turning counterclockwise as the channel runs arc1 → join → arc2
  const turn1 = (side1 === 'end' ? 1 : -1) * Math.sign(signedRadianDelta(arc1.end - arc1.start));
  const turn2 = (side2 === 'end' ? -1 : 1) * Math.sign(signedRadianDelta(arc2.end - arc2.start));

  const ends: JoinEnd[] = [[arc1, side1, arc1.start, arc1.end], [arc2, side2, arc2.start, arc2.end]];
  const [reach1, reach2] = ends.map(([, , start, end]) =>
    Math.floor(Math.min(MAX_JOIN_DRAWBACK_DEG, Math.abs(signedRadianDelta(end - start)) / 2 / TURN.degree)));
  let best = [0, 0], bestBalance = -Infinity;
  for (let total = 0; total <= reach1 + reach2; total++) {
    const tries: [number, number][] = [];
    for (let d1 = Math.max(0, total - reach2); d1 <= Math.min(total, reach1); d1++) {
      drawBackJoinEnds(ends, d1, total - d1);
      const b = calcJoinBalance(findJoiningArcs(arc1, side1, arc2, side2, invert), arc1, side1, arc2, side2, turn1, turn2);
      if (b >= 0 && b > Math.min(bestBalance, JOIN_BALANCE)) tries.push([b, d1]);
    }
    for (const [, d1] of tries.sort((x, y) => y[0] - x[0])) {
      drawBackJoinEnds(ends, d1, total - d1);
      const b = calcJoinBalance(solveSJoin(arc1, side1, arc2, side2, invert, edge), arc1, side1, arc2, side2, turn1, turn2);
      if (b >= JOIN_BALANCE) return;
      if (b >= 0 && b > bestBalance) [best, bestBalance] = [[d1, total - d1], b];
    }
  }
  drawBackJoinEnds(ends, best[0], best[1]);
}

function calcRetreatAngle(startAngle: number, endAngle: number, side: 'start' | 'end', degrees: number): number {
  const delta = signedRadianDelta(endAngle - startAngle);
  const dir = Math.sign(delta) || 1;
  return side === 'end' ? endAngle - dir * degrees * TURN.degree : startAngle + dir * degrees * TURN.degree;
}

// some arcs cannot be joined given their ends, this system will "peel back" the c-bout's end a
// degree at a time until a suitable angle is found for a join. Null once the retreat is spent,
// the c-bout's ends put back
function solveSJoinWithRetreat(
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
      const angle = calcRetreatAngle(originalStart, originalEnd, cBoutJoinSide, degrees);
      if (cBoutJoinSide === 'end') cBoutArc.end = angle; else cBoutArc.start = angle;
    }
    const join = solveSJoin(arc1, side1, arc2, side2, invert, edge);
    if (join) return join;
  }

  cBoutArc.start = originalStart;
  cBoutArc.end = originalEnd;
  return null;
}

// where the S's joint sits between the bout arc's end (0) and C0's (1), along the circle every
// joint between those two ends lies on. 0.5 is the S with the least jump in curvature at its joint
const JOIN_JOINT_FROM_BOUT = 0.5;

// the S run from arc1 into arc2 with its joint JOIN_JOINT_FROM_BOUT of the way from the bout. Each
// end's heading is the way the channel runs there, so no way round is guessed. Null when the joint
// lands on an end, or one of its arcs passes a half turn, which an Arc can't draw
function solveSJoinAt(arc1: Arc, side1: 'start' | 'end', arc2: Arc, side2: 'start' | 'end', cBoutSide: 1 | 2): Arc[] | null {
  const a1 = side1 === 'end' ? arc1.end : arc1.start;
  const a2 = side2 === 'end' ? arc2.end : arc2.start;
  const P1 = pointOnCircle(arc1, a1);
  const P2 = pointOnCircle(arc2, a2);
  const turn1 = (side1 === 'end' ? 1 : -1) * Math.sign(signedRadianDelta(arc1.end - arc1.start));
  const turn2 = (side2 === 'end' ? -1 : 1) * Math.sign(signedRadianDelta(arc2.end - arc2.start));
  // the family runs its joint from arc1's end as p nears 0 to arc2's as it grows
  const t = cBoutSide === 2 ? JOIN_JOINT_FROM_BOUT : 1 - JOIN_JOINT_FROM_BOUT;
  const fits = solveBiarcAt(P1, a1 + turn1 * TURN.quarter, P2, a2 + turn2 * TURN.quarter, t / (1 - t));
  if (!fits || fits.some(f => normalizeRadians(f.endAngle - f.startAngle) > TURN.half)) return null;
  const [f1, f2] = fits;
  const joint = [f1.startAngle, f1.endAngle].map(a => pointOnCircle({ x: f1.center.x, y: f1.center.y, r: f1.radius }, a))
    .sort((p, q) => dist(q, P1) - dist(p, P1))[0];
  return [
    new Arc(f1.center.x, f1.center.y, f1.radius, angleFromCenter(f1.center, P1), angleFromCenter(f1.center, joint)),
    new Arc(f2.center.x, f2.center.y, f2.radius, angleFromCenter(f2.center, joint), angleFromCenter(f2.center, P2)),
  ];
}

// the fluting's edge, the plate edge `delta` in with the corners followed: the line the channel is cut
// inside. Null when the offset is too far in for the corner arcs to exist
function defineFlutingEdgePath(p: ViolinFamilyParams, rib: RibArcs, delta: number, neckR: number | null): string | null {
  let inset = p.body.overhang + p.body.rib;
  try {
    return defineOuterPath(p, rib, inset - delta, false, neckR).path;
  } catch {
    return null;
  }
}

// how far down a viol flank the channel follows it before the S takes off: its share of the
// flank's sweep from the shoulder (0) to the corner tip (1)
const FLANK_TAKEOFF_ALONG = 0.75;

// the flank cut where the S takes off. Cut to nothing, it stays out of the path, as a zero-length
// arc is one the sampler can't measure, but keeps a sliver of its sweep, as the join reads which
// way the channel runs from that
function pushFlankArc(arcs: Arc[], arc: Arc, offset: number): Arc {
  let cut = offsetArcRadius(arc, offset);
  let sweep = signedRadianDelta(cut.end - cut.start);
  cut.end = cut.start + sweep * FLANK_TAKEOFF_ALONG;
  if (Math.abs(sweep * FLANK_TAKEOFF_ALONG) > 1e-9) arcs.push(cut);
  else cut.end = cut.start + (Math.sign(sweep) || 1) * 1e-9;
  return cut;
}

// the channel's arcs at `offset` from the rib line (in when negative), C0 at its own: the bouts'
// offset arcs, and in place of each corner the S joining C0 to the bout arc beside it. A viol
// corner's flank is followed FLANK_TAKEOFF_ALONG of the way to its tip. Null when a join can't be made
function solveChannelArcs(p: ViolinFamilyParams, rib: RibArcs, offset: number, centerOffset: number, edge: Pt[] | null, neckStart?: number): Arc[] | null {
  let k = p.corners!;
  let arcs = solveOffsetArcs(p, rib, offset, 'none', centerOffset, neckStart).bouts;
  // L0, L1, L2, C0, U2, U1, U0: whichever side is viol, its corner arc (L2/U2) drops out,
  // leaving C0 next to L1/U1
  let at = k.useViolCornerLC ? 2 : 3;
  let C0 = arcs[at];
  let L2 = k.useViolCornerLC ? null : arcs[at - 1];
  let U2 = k.useViolCornerUC ? null : arcs[at + 1];

  let lower = L2 ?? pushFlankArc(arcs, rib.L4!, offset);
  let lowerJoin = solveSJoinAt(lower, 'end', C0, 'end', 2);
  if (!lowerJoin) return null;

  let upper = U2 ?? pushFlankArc(arcs, rib.U4!, offset);
  let upperJoin = solveSJoinAt(C0, 'start', upper, 'end', 1);
  if (!upperJoin) return null;

  return [...arcs, ...lowerJoin, ...upperJoin];
}

// one closed loop `offset` from the rib line (in when negative), the C bout's run at `centerOffset`,
// the corners bypassed by the channel's S joins and kept inside `edge`. `joined` false when the C
// bout can't be joined to the bouts; no path with it true when the loop doesn't close, as across a
// neck face the loop has eaten. Given `neckR`, the purfling's inner line radius, a viol neck is
// crossed on the purfling's arc rather than along its face. The graduation reads its boundary loop
// through this
export function defineChannelLoop(p: ViolinFamilyParams, rib: RibArcs, offset: number, centerOffset: number, edge: Pt[] | null, neckR: number | null = null): { path: string | null; joined: boolean } {
  let neck = neckR !== null ? solveNeckPurflingArc(p, rib, offset, neckR) : null;
  if (neckR !== null && !neck) return { path: null, joined: true };
  let arcs = solveChannelArcs(p, rib, offset, centerOffset, edge, neck?.v0Start);
  if (!arcs) return { path: null, joined: false };
  let paths = [...arcs, ...arcs.map(arc => flipArcAboutY(arc))].map(arc => pathFromArc(arc));
  let top = neck ? neck.arc && pathFromArc(neck.arc) : defineViolNeckTopLine(p, rib, offset);
  if (top) paths.push(top);
  try {
    return { path: unifyConnectedSvgPaths(paths), joined: true };
  } catch {
    return { path: null, joined: true };
  }
}

// one edge of the channel, `offset` in from the plate edge, the C bout's run at `centerOffset`. The
// fluting edge it has to stay inside is taken at the outer of the two, or C0's own end would sit
// outside it
export function defineChannelPath(p: ViolinFamilyParams, rib: RibArcs, offset: number, centerOffset: number, neckR: number | null = null): { path: string | null; joined: boolean } {
  let inset = p.body.overhang + p.body.rib;
  let edge = defineFlutingEdgePath(p, rib, Math.min(offset, centerOffset), neckR);
  return defineChannelLoop(p, rib, inset - offset, inset - centerOffset, edge ? samplePathToPolyline(edge, 0.5) : null, neckR);
}

function defineCachedChannelPath(cuts: Map<string, ReturnType<typeof defineChannelPath>>, p: ViolinFamilyParams, rib: RibArcs, offset: number, centerOffset: number, neckR: number | null): ReturnType<typeof defineChannelPath> {
  let key = `${offset} ${centerOffset}`;
  if (!cuts.has(key)) cuts.set(key, defineChannelPath(p, rib, offset, centerOffset, neckR));
  return cuts.get(key)!;
}

// the channels as held on the params, solved first if an edit has cleared them
export function solvedFluting(p: ViolinFamilyParams): FlutingSolve | null {
  updateSolved(p);
  let held = p.solved!.fluting;
  if (held.solve === undefined) held.solve = solveFluting(p);
  return held.solve;
}

// the channels from the params, calculated at every call (~90ms) and never writing to them.
// Everything but a spec reads solvedFluting() rather than calling this.
// Each plate's channel is anchored at the fluting edge and grows inward by its width, so
// its outer edge sits on the fluting edge by construction. A second width through the waist moves only
// the C bout's inward offsets; the joins either side re-solve at the new radius
export function solveFluting(p: ViolinFamilyParams): FlutingSolve | null {
  if (!p.fluting || !p.plateContour || !p.corners || !p.bouts) return null;
  let f = p.fluting;
  let s: FlutingSolve = { flutingEdge: null, top: null, back: null, failures: [] };

  let rib = solvedRibArcs(p);
  if (!rib || !solvedPlateContour(p)!.top) {
    s.failures.push({ message: 'Fluting: the plate edge has to solve first.', unsolved: ['top', 'back'], circles: [], segments: [] });
    return s;
  }
  if (!(Number.isFinite(f.flutingEdge) && f.flutingEdge >= 0)) {
    s.failures.push({ message: 'Fluting: the fluting edge needs a value of 0 or more.', unsolved: ['top', 'back'], circles: [], segments: [] });
    return s;
  }
  // a viol neck's channel follows the purfling's arc across it, so the purfling has to stand first
  let neckR = p.bouts.useViolNeck ? calcNeckPurflingRadius(p, rib) : null;
  if (neckR !== null && !solvedPlateContour(p)!.purfling) {
    s.failures.push({ message: 'Fluting: the purfling has to solve first; the channel follows its arc across the neck.', unsolved: ['top', 'back'], circles: [], segments: [] });
    return s;
  }
  s.flutingEdge = defineFlutingEdgePath(p, rib, f.flutingEdge, neckR);
  // the plates usually take the same channels, and an edge is the same cut on either
  let cuts = new Map<string, ReturnType<typeof defineChannelPath>>();

  for (let plate of ['top', 'back'] as const) {
    let label = plate === 'top' ? 'Top plate' : 'Back plate';
    solveSection(s.failures, label, [plate], () => {
      let channel = f[plate];
      let typed = [channel.width, channel.depth, ...(channel.useCBoutGouge ? [channel.cBoutWidth] : [])];
      if (!typed.every(Number.isFinite)) return buildMiss(`${label}: every channel field needs a value.`, [plate]);
      let w = calcChannelHalfWidth(channel.width, channel.depth);
      if (w <= 0) return buildMiss(`${label}: no gouge cuts this channel. Its depth has to be above 0 and under half its width.`, [plate]);
      let wC = calcChannelHalfWidth(channel.useCBoutGouge ? channel.cBoutWidth : channel.width, channel.depth);
      if (wC <= 0) return buildMiss(`${label}: no gouge cuts the C bout channel this deep. Its width has to be over twice the depth.`, [plate]);

      let edge = f.flutingEdge;
      let edges = [
        defineCachedChannelPath(cuts, p, rib, edge, edge, neckR),
        defineCachedChannelPath(cuts, p, rib, edge + w, edge + wC, neckR),
        defineCachedChannelPath(cuts, p, rib, edge + 2 * w, edge + 2 * wC, neckR),
      ];
      if (edges.some(e => !e.joined))
        return buildMiss(`${label}: the channel round the C bout can't be joined to the one round the bouts at these corners. Bring the two gouges closer, or open the corners.`, [plate]);
      if (edges.some(e => !e.path))
        return buildMiss(`${label}: the channel doesn't close into one loop at this width; it has eaten the neck. Narrow the gouge, bring the fluting edge in, or raise the neck's purfling radius.`, [plate]);
      let [outer, center, inner] = edges.map(e => e.path!);
      s[plate] = {
        outer, center, inner, sweep: calcChannelSweep(2 * w, channel.depth), cBoutSweep: calcChannelSweep(2 * wC, channel.depth),
        innerEdgeOffset: edge + 2 * w, innerEdgeOffset_cBout: edge + 2 * wC,
      };
      return null;
    });
  }
  return s;
}

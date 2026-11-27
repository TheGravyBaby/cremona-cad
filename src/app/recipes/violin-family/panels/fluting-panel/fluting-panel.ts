import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { nearestFraction } from '../../../../helpers/nearestFraction';
import { solveBiarcAt } from '../../../../helpers/math/draftMath';
import { calcChannelHalfWidth, calcChannelSweep } from '../../../../helpers/math/archMath';
import {
  angleFromCenter, dist, flipArcAboutY, normalizeRadians, offsetArcRadius, pointOnCircle, signedRadianDelta, TURN,
} from '../../../../helpers/math/simpleGeometry';
import { pathFromArc, translatePath } from '../../../../helpers/math/pathMath';
import { unifyConnectedSvgPaths } from '../../../../helpers/math/pathVibes';
import { renderFilledPath, renderPath, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { buildMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { Arc } from '../../../../models/types';
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
function solveChannelArcs(p: ViolinFamilyParams, rib: RibArcs, offset: number, centerOffset: number, neckStart?: number): Arc[] | null {
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
// the corners bypassed by the channel's S joins. `joined` false when the C
// bout can't be joined to the bouts; no path with it true when the loop doesn't close, as across a
// neck face the loop has eaten. Given `neckR`, the purfling's inner line radius, a viol neck is
// crossed on the purfling's arc rather than along its face. The graduation reads its boundary loop
// through this
export function defineChannelLoop(p: ViolinFamilyParams, rib: RibArcs, offset: number, centerOffset: number, neckR: number | null = null): { path: string | null; joined: boolean } {
  let neck = neckR !== null ? solveNeckPurflingArc(p, rib, offset, neckR) : null;
  if (neckR !== null && !neck) return { path: null, joined: true };
  let arcs = solveChannelArcs(p, rib, offset, centerOffset, neck?.v0Start);
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

// one edge of the channel, `offset` in from the plate edge, the C bout's run at `centerOffset`
export function defineChannelPath(p: ViolinFamilyParams, rib: RibArcs, offset: number, centerOffset: number, neckR: number | null = null): { path: string | null; joined: boolean } {
  let inset = p.body.overhang + p.body.rib;
  return defineChannelLoop(p, rib, inset - offset, inset - centerOffset, neckR);
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

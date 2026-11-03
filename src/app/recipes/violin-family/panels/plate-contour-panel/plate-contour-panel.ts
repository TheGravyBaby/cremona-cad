import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { circleCircleIntersections } from '../../../../helpers/math/draftMath';
import {
  angleFromCenter, dist, flipArcAboutY, flipPointAboutY, lineCircleIntersection, lineFromTwoPoints, offsetArcRadius,
  pointOnCircle, signedRadianDelta, TURN,
} from '../../../../helpers/math/simpleGeometry';
import { combinePathStrings, pathFromArc, pathFromCornerCubic, pathFromLine, translatePath } from '../../../../helpers/math/pathMath';
import { unifyConnectedSvgPaths } from '../../../../helpers/math/pathVibes';
import { renderArcFromArcFancy, renderMirroredArc, renderMirroredArcFancy, renderPath, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { buildBlankMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { Arc, arcFromCircle, Circle, Pt } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { ButtonParams, RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import { PlateContourSolve, OuterCornerKey } from '../../violin-family-solves';
import { SEED_RATIOS, ViolinFamilyRatios } from '../../violin-family-seed';
import { solveMainBouts, calcViolNeckCap } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { calcCornerTurn, RibArcs, solveRibArcs, solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { renderFholes } from '../fhole-contours-panel/fhole-contours-panel';

// the back sits a body's width and a bit to the left of the top, as the sheets lay the plates out
export const PLATE_LAYOUT_GAP = 1.1;

@Component({
  selector: 'app-vf-plate-contour-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './plate-contour-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class PlateContourPanel extends PanelComponentBase<never, ViolinFamilyRatios> {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleArcs'];
  protected readonly pal = ThemeService.getPalette('classicCremona');

  // the first draft of the plate edge, once the C bout has solved: each corner arc runs on a few
  // degrees past the rib corner so the plate's corner stands proud of the ribs', a compound
  // corner carrying that on its second arc scaled by radius so the run along the edge is the
  // same; the purfling a channel's width in from the edge; the button off the seed ratios
  static seed(p: ViolinFamilyParams): void {
    if (p.plateContour || !p.corners) return;
    let cb = solveCenterBout(p);
    if (!cb?.C0 || !cb.C2 || !cb.C1) return;
    let k = p.corners;
    let inset = p.body.overhang + p.body.rib;
    let buttonWidth = Math.round(p.body.width * SEED_RATIOS.BWtoLBW);
    let C2Sign = calcCornerTurn(cb.C2, cb.C0);
    let C1Sign = calcCornerTurn(cb.C1, cb.C0);
    let U3Cutoff = 2.5;
    let C2Cutoff = 10;
    let C1Cutoff = 5;
    let L3Cutoff = 2.5;

    p.plateContour = {
      button: { width: buttonWidth, height: Math.round(buttonWidth * SEED_RATIOS.BHtoBW) },
      purflingOffset: inset + 1.2,
      purflingChannelDepth: 1.2,
      U3Cutoff,
      U31Cutoff: U3Cutoff * (k.U3R - inset) / (k.U31R - inset),
      C2Cutoff,
      C21Cutoff: C2Cutoff * (k.C2R + C2Sign * inset) / (k.C21R + C2Sign * inset),
      C1Cutoff,
      C11Cutoff: C1Cutoff * (k.C1R + C1Sign * inset) / (k.C11R + C1Sign * inset),
      L3Cutoff,
      L31Cutoff: L3Cutoff * (k.L3R - inset) / (k.L31R - inset),
      upperRounding: 0,
      lowerRounding: 0,
    };
  }

  // what the last draw solved; reportSolveFailures() reads it rather than solving again
  o!: PlateContourSolve;

  reportSolveFailures(): void {
    reportFailures(this.o.failures, 'Plate Contour');
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let p = this.params;
    let o = this.o = solvePlateContour(p)!;
    this.ratios = calcPlateContourRatios(p);
    // the holes, once cut, ride on the top plate here as on every panel after this one
    return [
      renderPlateContour(p, o, this.pal, this.flags, true),
      renderFholes(p, this.pal),
      renderSolveFailures(o.failures, this.pal.alert, true),
    ];
  }
}

// the plates side by side as the sheets show them: the top at the body's place, the back to its
// left with the button, unless `showBack` is off. On this panel the corner arcs, the button and the purfling take their own
// inks over the neutral outlines; grey under a later panel's work
export const renderPlateContour = (
  p: ViolinFamilyParams,
  o: PlateContourSolve,
  pal: PanelPalette,
  flags: Pick<ViolinFamilyViewFlags, 'showModuleArcs'>,
  currentModule: boolean,
  showBack = true,
) => (g: any, ui: any): void => {
  let dx = -p.body.width * PLATE_LAYOUT_GAP;
  let upper = currentModule ? pal.ink(4) : pal.neutral;
  let lower = currentModule ? pal.ink(2) : pal.neutral;
  let button = currentModule ? pal.ink(0) : pal.neutral;
  let fancy = currentModule && flags.showModuleArcs;

  if (o.top) renderPath(o.top, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  for (let d of [o.purfling, o.outerPurfling]) if (d) renderPath(d, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  if (showBack && o.back) {
    renderPath(translatePath(o.back, dx, 0), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
    for (let d of [o.purfling, o.outerPurfling]) if (d) renderPath(translatePath(d, dx, 0), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  }
  if (showBack && o.button) {
    renderPath(translatePath(o.button.path, dx, 0), button, STROKE_WEIGHT.trace)(g, ui);
    if (fancy) renderArcFromArcFancy(arcFromCircle({ ...o.button.cap, x: o.button.cap.x + dx }, o.button.cap.start, o.button.cap.end), button)(g, ui);
  }

  // the corner arcs with their cutoffs, over the top plate's edge, where the fields can see them move
  if (fancy) {
    if (o.corners.U3) renderMirroredArcFancy(o.corners.U3, upper)(g, ui);
    if (o.corners.U31) renderMirroredArcFancy(o.corners.U31, upper)(g, ui);
    if (o.corners.C2) renderMirroredArcFancy(o.corners.C2, upper)(g, ui);
    if (o.corners.C21) renderMirroredArcFancy(o.corners.C21, upper)(g, ui);
    if (o.corners.C1) renderMirroredArcFancy(o.corners.C1, lower)(g, ui);
    if (o.corners.C11) renderMirroredArcFancy(o.corners.C11, lower)(g, ui);
    if (o.corners.L3) renderMirroredArcFancy(o.corners.L3, lower)(g, ui);
    if (o.corners.L31) renderMirroredArcFancy(o.corners.L31, lower)(g, ui);
  } else if (currentModule) {
    if (o.corners.U3) renderMirroredArc(o.corners.U3, upper, STROKE_WEIGHT.trace)(g, ui);
    if (o.corners.U31) renderMirroredArc(o.corners.U31, upper, STROKE_WEIGHT.trace)(g, ui);
    if (o.corners.C2) renderMirroredArc(o.corners.C2, upper, STROKE_WEIGHT.trace)(g, ui);
    if (o.corners.C21) renderMirroredArc(o.corners.C21, upper, STROKE_WEIGHT.trace)(g, ui);
    if (o.corners.C1) renderMirroredArc(o.corners.C1, lower, STROKE_WEIGHT.trace)(g, ui);
    if (o.corners.C11) renderMirroredArc(o.corners.C11, lower, STROKE_WEIGHT.trace)(g, ui);
    if (o.corners.L3) renderMirroredArc(o.corners.L3, lower, STROKE_WEIGHT.trace)(g, ui);
    if (o.corners.L31) renderMirroredArc(o.corners.L31, lower, STROKE_WEIGHT.trace)(g, ui);
  }
};

export type OuterCorners = Partial<Record<OuterCornerKey, Arc>>;

function solveCutoffArc(arc: Arc, offset: number, cutoff: number): Arc {
  let out = offsetArcRadius(arc, offset);
  let dir = Math.sign(signedRadianDelta(arc.end - arc.start)) || 1;
  out.end = arc.end + dir * cutoff * TURN.degree;
  return out;
}

// the corner arcs at the plate edge with their cutoffs: each runs on past the rib outline's corner
// by its cutoff along its own direction of travel, so an inverted corner's follows it round. A
// compound corner's first arc is the plain offset and its second takes the cutoff. A viol corner
// has none: its flank and C arc are cut where they meet
function solveOuterCorners(p: ViolinFamilyParams, rib: RibArcs, inset: number): OuterCorners {
  let o = p.plateContour!;
  let k = p.corners!;
  let C2Sign = calcCornerTurn(rib.C2, rib.C0);
  let C1Sign = calcCornerTurn(rib.C1, rib.C0);
  let outer: OuterCorners = {};

  if (!k.useViolCornerUC) {
    outer.U3 = k.U31DoubleArc ? offsetArcRadius(rib.U3!, -inset) : solveCutoffArc(rib.U3!, -inset, o.U3Cutoff);
    if (k.U31DoubleArc) outer.U31 = solveCutoffArc(rib.U31!, -inset, o.U31Cutoff);
    outer.C2 = k.C21DoubleArc ? offsetArcRadius(rib.C2, C2Sign * inset) : solveCutoffArc(rib.C2, C2Sign * inset, o.C2Cutoff);
    if (k.C21DoubleArc) outer.C21 = solveCutoffArc(rib.C21!, C2Sign * inset, o.C21Cutoff);
  }
  if (!k.useViolCornerLC) {
    outer.C1 = k.C11DoubleArc ? offsetArcRadius(rib.C1, C1Sign * inset) : solveCutoffArc(rib.C1, C1Sign * inset, o.C1Cutoff);
    if (k.C11DoubleArc) outer.C11 = solveCutoffArc(rib.C11!, C1Sign * inset, o.C11Cutoff);
    outer.L3 = k.L31DoubleArc ? offsetArcRadius(rib.L3!, -inset) : solveCutoffArc(rib.L3!, -inset, o.L3Cutoff);
    if (k.L31DoubleArc) outer.L31 = solveCutoffArc(rib.L31!, -inset, o.L31Cutoff);
  }
  return outer;
}

// Given a scaled corner arc and the cutoff line defined by two full-inset endpoints,
// returns the angle at which the scaled arc intersects that line.
// Picks the intersection closest to refPt (i.e. the full-inset endpoint for that arc).
// Falls back to `fallback` if no intersection exists.
function calcCutoffEndAtOffset(scaledArc: Arc, cutPt1: Pt, cutPt2: Pt, refPt: Pt, fallback: number): number {
  const ints = lineCircleIntersection(lineFromTwoPoints(cutPt1, cutPt2), scaledArc);
  if (ints.length === 0) return fallback;
  const best = ints.sort((a, b) => dist(a, refPt) - dist(b, refPt))[0];
  return angleFromCenter(scaledArc, best);
}

// the flat across a corner, moved in from the plate edge by `delta`, parallel to itself
function calcInsetCutoffLine(pt1: Pt, pt2: Pt, delta: number, interior: Pt): { p1: Pt; p2: Pt } {
  const dx = pt2.x - pt1.x;
  const dy = pt2.y - pt1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len;
  const ny = dx / len;
  const sign = (interior.x - pt1.x) * nx + (interior.y - pt1.y) * ny >= 0 ? -1 : 1;
  return {
    p1: { x: pt1.x + sign * delta * nx, y: pt1.y + sign * delta * ny },
    p2: { x: pt2.x + sign * delta * nx, y: pt2.y + sign * delta * ny },
  };
}

// leftmost stops being the corner once C1 or C2 wraps around C0, but nearest the tip always is
function meetCornerArcs(tip: Arc, side: Arc, flank: boolean, nearTip: Pt): boolean {
  let hits = circleCircleIntersections(tip, side);
  let at = flank ? hits.sort((a, c) => a.x - c.x)[1] : hits.sort((a, c) => dist(a, nearTip) - dist(c, nearTip))[0];
  if (!at) return false;
  tip.end = angleFromCenter(tip, at);
  side.end = angleFromCenter(side, at);
  return true;
}

// the flat is the line between the two cutoff ends at the plate edge, moved in by `delta`
function cutArcsAtFlat(a: Arc, c: Arc, outerA: Arc, outerC: Arc, delta: number, interior: Pt): [Arc, Arc] {
  let line = calcInsetCutoffLine(pointOnCircle(outerA, outerA.end), pointOnCircle(outerC, outerC.end), delta, interior);
  a.end = calcCutoffEndAtOffset(a, line.p1, line.p2, line.p1, outerA.end);
  c.end = calcCutoffEndAtOffset(c, line.p1, line.p2, line.p2, outerC.end);
  return [a, c];
}

// how the corner arcs finish: left off for a line that makes its own way round the corner, pure
// offsets meeting at a new tip as the purfling runs, or cut across the flat at the plate edge. A
// viol corner has no flat, so its flank and C arc meet either way
export type CornerFinish = 'none' | 'meet' | 'flat';

export type OffsetArcs = { bouts: Arc[]; corners: Arc[]; upperFlat: [Arc, Arc] | null; lowerFlat: [Arc, Arc] | null };

// the rib outline's arcs stood off by `offset` (out when positive), one side of the centreline.
// `corners` comes back empty when an offset is too far in for a corner's arcs to meet. C0 alone can
// take its own offset, for a channel that narrows through the waist
export function solveOffsetArcs(p: ViolinFamilyParams, rib: RibArcs, offset: number, finish: CornerFinish, centerOffset = offset): OffsetArcs {
  let k = p.corners!;
  let b = p.bouts!;
  let bouts: Arc[] = [];

  // a viol corner's flank (L4/U4) is itself the arc that reaches the corner tip,
  // so the corner arcs below carry it trimmed to the new intersection.
  // don't add it here as well — the untrimmed copy runs past the corner.
  bouts.push(offsetArcRadius(rib.L0, offset), offsetArcRadius(rib.L1, offset));
  if (!k.useViolCornerLC) bouts.push(offsetArcRadius(rib.L2!, offset));
  bouts.push(offsetArcRadius(rib.C0, -centerOffset));
  if (!k.useViolCornerUC) bouts.push(offsetArcRadius(rib.U2!, offset));
  bouts.push(offsetArcRadius(rib.U1, offset));
  bouts.push(offsetArcRadius(rib.U0, offset));
  if (b.useViolNeck && rib.V0) {
    let cap = calcViolNeckCap(rib.V0, b.viol!.neckRadius, offset);
    let V0off = offsetArcRadius(rib.V0, -offset);
    if (cap) V0off.start = cap.v0Start;
    bouts.push(V0off);
    if (cap?.fillet) bouts.push(cap.fillet);
  }

  let none: OffsetArcs = { bouts, corners: [], upperFlat: null, lowerFlat: null };
  if (finish === 'none') return none;

  let C2Sign = calcCornerTurn(rib.C2, rib.C0);
  let C1Sign = calcCornerTurn(rib.C1, rib.C0);
  let U3Offset = k.useViolCornerUC ? null : offsetArcRadius(rib.U3!, -offset);
  let U31Offset = !k.useViolCornerUC && k.U31DoubleArc ? offsetArcRadius(rib.U31!, -offset) : null;
  let C2Offset = offsetArcRadius(rib.C2, C2Sign * offset);
  let C21Offset = !k.useViolCornerUC && k.C21DoubleArc ? offsetArcRadius(rib.C21!, C2Sign * offset) : null;
  let L3Offset = k.useViolCornerLC ? null : offsetArcRadius(rib.L3!, -offset);
  let L31Offset = !k.useViolCornerLC && k.L31DoubleArc ? offsetArcRadius(rib.L31!, -offset) : null;
  let C1Offset = offsetArcRadius(rib.C1, C1Sign * offset);
  let C11Offset = !k.useViolCornerLC && k.C11DoubleArc ? offsetArcRadius(rib.C11!, C1Sign * offset) : null;

  let U4Offset = k.useViolCornerUC ? offsetArcRadius(rib.U4!, offset) : null;
  let L4Offset = k.useViolCornerLC ? offsetArcRadius(rib.L4!, offset) : null;

  // a compound corner's first arc keeps its own end; only the arc that reaches the tip or flat is
  // cut. A viol flank meets C2 itself, even under a compound C corner
  let upperTip = U4Offset ?? U31Offset ?? U3Offset!;
  let upperSide = C21Offset ?? C2Offset;
  let lowerTip = L4Offset ?? L31Offset ?? L3Offset!;
  let lowerSide = C11Offset ?? C1Offset;

  // an offset past a corner arc's own radius has eaten that corner: the circles still cross on
  // paper, but there is no arc left to run
  if (finish === 'meet' && [upperTip, upperSide, lowerTip, lowerSide].some(arc => arc.r <= 0)) return none;

  let inset = p.body.overhang + p.body.rib;
  let outer = finish === 'flat' ? solveOuterCorners(p, rib, inset) : null;

  let upperFlat: [Arc, Arc] | null = null;
  let lowerFlat: [Arc, Arc] | null = null;
  if (outer && !U4Offset) upperFlat = cutArcsAtFlat(upperTip, upperSide, outer.U31 ?? outer.U3!, outer.C21 ?? outer.C2!, inset - offset, rib.C0);
  else if (!meetCornerArcs(upperTip, upperSide, !!U4Offset, k.UCr)) return none;
  if (outer && !L4Offset) lowerFlat = cutArcsAtFlat(lowerSide, lowerTip, outer.C11 ?? outer.C1!, outer.L31 ?? outer.L3!, inset - offset, rib.C0);
  else if (!meetCornerArcs(lowerTip, lowerSide, !!L4Offset, k.LCr)) return none;

  let corners: Arc[] = [];
  for (let arc of U4Offset ? [U4Offset, C2Offset] : [U3Offset, U31Offset, C2Offset, C21Offset]) if (arc) corners.push(arc);
  for (let arc of L4Offset ? [L4Offset, C1Offset] : [C1Offset, C11Offset, L3Offset, L31Offset]) if (arc) corners.push(arc);
  return { bouts, corners, upperFlat, lowerFlat };
}

function defineButton(b: ButtonParams, topY: number, U0: Arc | null): { paths: string[]; leaves: Pt; cap: Arc } | null {
  if (b.height <= 0) return null;
  let circle: Circle = { x: 0, y: topY + b.height - b.width / 2, r: b.width / 2 };

  let hits = U0 ? circleCircleIntersections(circle, U0) : lineCircleIntersection(lineFromTwoPoints(new Pt(0, topY), new Pt(1, topY)), circle);
  let hit = hits.find(h => h.x > 0 && h.y > circle.y);
  if (hit) {
    let from = angleFromCenter(circle, hit);
    let cap = arcFromCircle(circle, from, TURN.half - from);
    if (U0) U0.start = angleFromCenter(U0, hit);
    return { leaves: hit, cap, paths: [pathFromArc(cap)] };
  }

  let foot = U0
    ? lineCircleIntersection(lineFromTwoPoints(new Pt(circle.r, topY), new Pt(circle.r, 0)), U0).sort((a, c) => a.y - c.y).pop()
    : new Pt(circle.r, topY);
  if (!foot || foot.y > circle.y) return null;
  let shoulder = new Pt(circle.r, circle.y);
  let cap = arcFromCircle(circle, 0, TURN.half);
  if (U0) U0.start = angleFromCenter(U0, foot);
  return { leaves: foot, cap, paths: [pathFromLine(foot, shoulder), pathFromLine(flipPointAboutY(foot), flipPointAboutY(shoulder)), pathFromArc(cap)] };
}

export function defineViolNeckTopLine(p: ViolinFamilyParams, rib: RibArcs, d: number): string | null {
  const cap = p.bouts!.useViolNeck && rib.V0 ? calcViolNeckCap(rib.V0, p.bouts!.viol!.neckRadius, d) : null;
  return cap ? pathFromLine({ x: cap.topX, y: cap.topY }, { x: -cap.topX, y: cap.topY }) : null;
}

// a corner's flat: rounding > 0 uses a shaped bezier, 0 a straight line
function defineCornerConnector(a1: Arc, a2: Arc, rounding: number): string {
  return rounding > 0
    ? pathFromCornerCubic(a1, a2, rounding)
    : pathFromLine(pointOnCircle(a1, a1.end), pointOnCircle(a2, a2.end));
}

// the plate's edge as one closed path at `offset` from the rib outline: the bouts' offset arcs, the
// corner arcs cut at their flats with the flat or its rounding across each, the viol neck's face,
// and on the back the button. `offset` is the inset for the plates; a later panel takes the same
// edge further in with a smaller offset, the flats moving in with it
export function defineOuterPath(p: ViolinFamilyParams, rib: RibArcs, offset: number, withButton: boolean): { path: string; button: { path: string; cap: Arc } | null } {
  let o = p.plateContour!;
  let b = p.bouts!;
  let { bouts, corners, upperFlat, lowerFlat } = solveOffsetArcs(p, rib, offset, 'flat');
  if (!corners.length) throw new Error('the corner arcs do not meet');

  // a button wider than the neck face has nothing to stand on, so it takes the face
  const neck = b.useViolNeck && rib.V0 ? calcViolNeckCap(rib.V0, b.viol!.neckRadius, offset) : null;
  let bt: ReturnType<typeof defineButton> = null;
  if (withButton && neck) bt = defineButton({ width: Math.min(o.button.width, 2 * neck.topX), height: o.button.height }, neck.topY, null);
  // U0 is the last arc pushed when there's no viol neck
  else if (withButton && !b.useViolNeck) bt = defineButton(o.button, p.body.height, bouts[bouts.length - 1]);

  let arcs = [...bouts, ...bouts.map(arc => flipArcAboutY(arc)), ...corners.flatMap(arc => [arc, flipArcAboutY(arc)])];

  let paths: string[] = [];

  if (upperFlat) {
    const [a1, a2] = upperFlat;
    paths.push(defineCornerConnector(a1, a2, o.upperRounding));
    paths.push(defineCornerConnector(flipArcAboutY(a1), flipArcAboutY(a2), o.upperRounding));
  }
  if (lowerFlat) {
    const [a1, a2] = lowerFlat;
    paths.push(defineCornerConnector(a1, a2, o.lowerRounding));
    paths.push(defineCornerConnector(flipArcAboutY(a1), flipArcAboutY(a2), o.lowerRounding));
  }

  paths.push(...arcs.map(arc => pathFromArc(arc)));

  // the neck's fillets already came through solveOffsetArcs above and were mirrored with the
  // rest; all that is left is the top face they run out onto
  if (neck) {
    const faceEnd = { x: neck.topX, y: neck.topY };
    if (bt) {
      paths.push(pathFromLine(faceEnd, bt.leaves));
      paths.push(pathFromLine(flipPointAboutY(faceEnd), flipPointAboutY(bt.leaves)));
    }
    else {
      paths.push(pathFromLine(faceEnd, flipPointAboutY(faceEnd)));
    }
  }

  let path = unifyConnectedSvgPaths([...paths, ...(bt?.paths ?? [])]);
  return { path, button: bt && !neck ? { path: combinePathStrings(bt.paths), cap: bt.cap } : null };
}

// the button's proportions, read off the params every solve so they can't drift: its width
// against the lower bout, its height against its width
export function calcPlateContourRatios(p: ViolinFamilyParams): Partial<ViolinFamilyRatios> {
  if (!p.plateContour) return {};
  let b = p.plateContour.button;
  return { BWtoLBW: b.width / p.body.width, BHtoBW: b.height / b.width };
}

// a purfling line: the rib outline at `arcOffset` out (in when negative), its corners pure offsets
// of the corner arcs meeting at a new tip rather than cut across; at 0 the rib outline itself. Null
// once the offset is too far in for a corner's arcs to meet
export function definePurflingPath(p: ViolinFamilyParams, rib: RibArcs, arcOffset: number): string | null {
  const { bouts, corners } = solveOffsetArcs(p, rib, arcOffset, 'meet');
  if (!corners.length) return null;
  const arcs = [...bouts, ...corners];
  const mirrored = arcs.map(arc => flipArcAboutY(arc));
  const paths = [...arcs, ...mirrored].map(arc => pathFromArc(arc));
  const top = defineViolNeckTopLine(p, rib, arcOffset);
  if (top) paths.push(top);
  return unifyConnectedSvgPaths(paths);
}

// a later panel reads the plates by calling this; it returns and never writes to the params. The
// rib outline is solved again here, every stage of it, since the edge stands off all of it. The
// last answer is kept against the params it was solved from (~20ms a solve, and the arching panels
// ask for it on every cursor move); nothing of it reaches the file
let last: { key: string; solve: PlateContourSolve } | null = null;

export function solvePlateContour(p: ViolinFamilyParams): PlateContourSolve | null {
  if (!p.plateContour || !p.corners || !p.bouts) return null;
  let key = JSON.stringify([p.body, p.bouts, p.corners, p.plateContour]);
  if (last?.key === key) return last.solve;
  let solve = solvePlateContourUncached(p);
  last = { key, solve };
  return solve;
}

function solvePlateContourUncached(p: ViolinFamilyParams): PlateContourSolve {
  let m = solveMainBouts(p)!;
  let c = solveCorners(p)!;
  let cb = solveCenterBout(p)!;
  let o = p.plateContour;
  let k = p.corners;
  let inset = p.body.overhang + p.body.rib;

  let s: PlateContourSolve = { top: null, back: null, purfling: null, outerPurfling: null, corners: {}, button: null, failures: [] };

  let rib = solveRibArcs(p, m, c, cb);
  if (!rib) {
    s.failures.push({ message: 'Plate contour: every arc of the rib outline has to solve first.', unsolved: ['top', 'back', 'purfling'], circles: [], segments: [] });
    return s;
  }

  solveSection(s.failures, 'Plate contour', ['top', 'back'], () => {
    let cutoffs = [
      ...(k.useViolCornerUC ? [] : [k.U31DoubleArc ? o.U31Cutoff : o.U3Cutoff, k.C21DoubleArc ? o.C21Cutoff : o.C2Cutoff, o.upperRounding]),
      ...(k.useViolCornerLC ? [] : [k.C11DoubleArc ? o.C11Cutoff : o.C1Cutoff, k.L31DoubleArc ? o.L31Cutoff : o.L3Cutoff, o.lowerRounding]),
    ];
    let missing = buildBlankMiss('Plate contour', ['top', 'back'], [...cutoffs, o.button.width, o.button.height]);
    if (missing) return missing;

    s.corners = solveOuterCorners(p, rib, inset);
    s.top = defineOuterPath(p, rib, inset, false).path;
    let back = defineOuterPath(p, rib, inset, true);
    s.back = back.path;
    s.button = back.button;
    return null;
  });

  solveSection(s.failures, 'Purfling', ['purfling'], () => {
    let missing = buildBlankMiss('Purfling', ['purfling'], [o.purflingOffset, o.purflingChannelDepth]);
    if (missing) return missing;
    let purfling = definePurflingPath(p, rib, inset - o.purflingOffset);
    let outerPurfling = definePurflingPath(p, rib, inset - o.purflingOffset + o.purflingChannelDepth);
    if (!purfling || !outerPurfling)
      return { message: 'Purfling: the offset is too far in, and the corner circles no longer meet. Reduce the purfling offset.', unsolved: ['purfling'], circles: [], segments: [] };
    s.purfling = purfling;
    s.outerPurfling = outerPurfling;
    return null;
  });

  return s;
}

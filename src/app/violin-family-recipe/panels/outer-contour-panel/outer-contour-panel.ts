import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { circleCircleIntersections } from '../../../helpers/math/draftMath';
import {
  angleFromCenter, dist, flipArcAboutY, flipPointAboutY, lineCircleIntersection, lineFromTwoPoints, offsetArcRadius,
  pointOnCircle, signedRadianDelta, TURN,
} from '../../../helpers/math/simpleGeometry';
import { combinePathStrings, pathFromArc, pathFromCornerCubic, pathFromLine, translatePath } from '../../../helpers/math/pathMath';
import { unifyConnectedSvgPaths } from '../../../helpers/math/pathVibes';
import { renderArcFromArc, renderArcFromArcFancy, renderPath, renderSolveFailures } from '../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../helpers/validators';
import { showFieldHelp } from '../../../docs/field-help';
import { Arc, arcFromCircle, Circle, Pt } from '../../../models/types';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../theme/theme.service';
import {
  ButtonParams, CenterBoutSolve, CornersSolve, MainBoutsSolve, OuterContourFailure, OuterContourKey, OuterContourSolve,
  OuterCornerKey, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags,
} from '../../violin-family-types';
import { solveMainBouts, violNeckCap } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { cornerTurn, solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { renderFholes } from '../fhole-contours-panel/fhole-contours-panel';

// The outer contour: the plates' edges, the rib outline stood off by the inset. Each corner's arcs
// run on past the rib corner by their cutoffs and are cut across a flat (or its rounding); the
// back carries the button; the purfling lines run inside the edge. The plates are drawn here and on
// every panel after this one, never before it; the f-holes ride on the top plate once they are cut.
// Panel and renders, then solve.

// the back sits a body's width and a bit to the left of the top, as the sheets lay the plates out
export const PLATE_LAYOUT_GAP = 1.1;

@Component({
  selector: 'app-vf-outer-contour-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './outer-contour-panel.html',
  styleUrls: ['../../../sidebar.css', '../../violin-family.css'],
})
export class OuterContourPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleArcs'];
  protected readonly pal = ThemeService.getPalette('classicCremona');
  protected readonly help = showFieldHelp;

  // the first draft of the plate edge, once the C bout has solved: each corner arc runs on a few
  // degrees past the rib corner so the plate's corner stands proud of the ribs', a compound
  // corner carrying that on its second arc scaled by radius so the run along the edge is the
  // same; the purfling a channel's width in from the edge; the button in proportion to the body
  static seed(p: ViolinFamilyParams): void {
    if (p.outerContour || !p.corners) return;
    let cb = solveCenterBout(p);
    if (!cb?.C0 || !cb.C2 || !cb.C1) return;
    let k = p.corners;
    let inset = p.body.overhang + p.body.rib;
    // violin numbers scaled by body length, so the larger sizes get a button in proportion
    let s = p.body.height / 355;
    let C2Sign = cornerTurn(cb.C2, cb.C0);
    let C1Sign = cornerTurn(cb.C1, cb.C0);
    let U3Cutoff = 2.5;
    let C2Cutoff = 10;
    let C1Cutoff = 5;
    let L3Cutoff = 2.5;

    p.outerContour = {
      button: { width: Math.round(20 * s * 2) / 2, height: Math.round(14 * s * 2) / 2 },
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

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; report() reads it rather than solving again
  o!: OuterContourSolve;

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
    reportFailures(this.o.failures, 'Outer Contour');
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let o = this.o = solveOuterContour(p)!;
      // the holes, once cut, ride on the top plate here as on every panel after this one
      this.drawn.emit([
        renderOuterContour(p, o, this.pal, this.flags, true),
        renderFholes(p, this.pal),
        renderSolveFailures(o.failures, this.pal.alert, true),
      ]);
    });
  }
}

// the plates side by side as the sheets show them: the top at the body's place, the back to its
// left with the button. On this panel the corner arcs, the button and the purfling take their own
// inks over the neutral outlines; grey under a later panel's work
export const renderOuterContour = (
  p: ViolinFamilyParams,
  o: OuterContourSolve,
  pal: PanelPalette,
  flags: Pick<ViolinFamilyViewFlags, 'showModuleArcs'>,
  currentModule: boolean,
) => (g: any, ui: any): void => {
  let dx = -p.body.width * PLATE_LAYOUT_GAP;
  let upper = currentModule ? pal.ink(4) : pal.neutral;
  let lower = currentModule ? pal.ink(2) : pal.neutral;
  let button = currentModule ? pal.ink(0) : pal.neutral;
  let fancy = currentModule && flags.showModuleArcs;

  if (o.top) renderPath(o.top, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  for (let d of [o.purfling, o.outerPurfling]) if (d) renderPath(d, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  if (o.back) {
    renderPath(translatePath(o.back, dx, 0), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
    for (let d of [o.purfling, o.outerPurfling]) if (d) renderPath(translatePath(d, dx, 0), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  }
  if (o.button) {
    renderPath(translatePath(o.button.path, dx, 0), button, STROKE_WEIGHT.trace)(g, ui);
    if (fancy) renderArcFromArcFancy(arcFromCircle({ ...o.button.cap, x: o.button.cap.x + dx }, o.button.cap.start, o.button.cap.end), button)(g, ui);
  }

  // the corner arcs with their cutoffs, over the top plate's edge, where the fields can see them move
  if (currentModule) {
    let inks: Record<OuterCornerKey, string> = { U3: upper, U31: upper, C2: upper, C21: upper, C1: lower, C11: lower, L3: lower, L31: lower };
    for (let key of Object.keys(inks) as OuterCornerKey[]) {
      let arc = o.corners[key];
      if (!arc) continue;
      for (let a of [arc, flipArcAboutY(arc)]) (fancy ? renderArcFromArcFancy(a, inks[key]) : renderArcFromArc(a, inks[key], STROKE_WEIGHT.trace))(g, ui);
    }
  }
};

// the rib outline's arcs, gathered from the stages that solve them, the bout arcs as the corners
// trimmed them. Null unless every arc the options call for has solved. Exported with the path
// builders below, so a later panel can stand its own lines off the same edge
export type RibArcs = {
  U0: Arc; U1: Arc; L0: Arc; L1: Arc; C0: Arc; C2: Arc; C1: Arc;
  U2: Arc | null; U3: Arc | null; U31: Arc | null; U4: Arc | null;
  L2: Arc | null; L3: Arc | null; L31: Arc | null; L4: Arc | null;
  C21: Arc | null; C11: Arc | null;
  V0: Arc | null;
};

export function ribArcs(p: ViolinFamilyParams, m: MainBoutsSolve, c: CornersSolve, cb: CenterBoutSolve): RibArcs | null {
  let k = p.corners!;
  let rib = {
    U0: m.U0, U1: c.U1, L0: m.L0, L1: c.L1, C0: cb.C0, C2: cb.C2, C1: cb.C1,
    U2: c.U2, U3: c.U3, U31: c.U31, U4: c.U4,
    L2: c.L2, L3: c.L3, L31: c.L31, L4: c.L4,
    C21: cb.C21, C11: cb.C11,
    V0: m.V0,
  };
  let needed = [
    rib.U0, rib.U1, rib.L0, rib.L1, rib.C0, rib.C2, rib.C1,
    ...(k.useViolCornerUC ? [rib.U4] : [rib.U2, rib.U3, ...(k.U31DoubleArc ? [rib.U31] : [])]),
    ...(k.useViolCornerLC ? [rib.L4] : [rib.L2, rib.L3, ...(k.L31DoubleArc ? [rib.L31] : [])]),
    ...(k.C21DoubleArc ? [rib.C21] : []),
    ...(k.C11DoubleArc ? [rib.C11] : []),
    ...(p.bouts!.useViolNeck ? [rib.V0] : []),
  ];
  return needed.every(arc => !!arc) ? rib as RibArcs : null;
}

export type OuterCorners = Partial<Record<OuterCornerKey, Arc>>;

// the corner arcs at the plate edge with their cutoffs: each runs on past the rib outline's corner
// by its cutoff along its own direction of travel, so an inverted corner's follows it round. A
// compound corner's first arc is the plain offset and its second takes the cutoff. A viol corner
// has none: its flank and C arc are cut where they meet
export function outerCorners(p: ViolinFamilyParams, rib: RibArcs, inset: number): OuterCorners {
  let o = p.outerContour!;
  let k = p.corners!;
  let cut = (arc: Arc, offset: number, cutoff: number): Arc => {
    let out = offsetArcRadius(arc, offset);
    let dir = Math.sign(signedRadianDelta(arc.end - arc.start)) || 1;
    out.end = arc.end + dir * cutoff * TURN.degree;
    return out;
  };
  let C2Sign = cornerTurn(rib.C2, rib.C0);
  let C1Sign = cornerTurn(rib.C1, rib.C0);
  let outer: OuterCorners = {};

  if (!k.useViolCornerUC) {
    outer.U3 = k.U31DoubleArc ? offsetArcRadius(rib.U3!, -inset) : cut(rib.U3!, -inset, o.U3Cutoff);
    if (k.U31DoubleArc) outer.U31 = cut(rib.U31!, -inset, o.U31Cutoff);
    outer.C2 = k.C21DoubleArc ? offsetArcRadius(rib.C2, C2Sign * inset) : cut(rib.C2, C2Sign * inset, o.C2Cutoff);
    if (k.C21DoubleArc) outer.C21 = cut(rib.C21!, C2Sign * inset, o.C21Cutoff);
  }
  if (!k.useViolCornerLC) {
    outer.C1 = k.C11DoubleArc ? offsetArcRadius(rib.C1, C1Sign * inset) : cut(rib.C1, C1Sign * inset, o.C1Cutoff);
    if (k.C11DoubleArc) outer.C11 = cut(rib.C11!, C1Sign * inset, o.C11Cutoff);
    outer.L3 = k.L31DoubleArc ? offsetArcRadius(rib.L3!, -inset) : cut(rib.L3!, -inset, o.L3Cutoff);
    if (k.L31DoubleArc) outer.L31 = cut(rib.L31!, -inset, o.L31Cutoff);
  }
  return outer;
}

// Given a scaled corner arc and the cutoff line defined by two full-inset endpoints,
// returns the angle at which the scaled arc intersects that line.
// Picks the intersection closest to refPt (i.e. the full-inset endpoint for that arc).
// Falls back to `fallback` if no intersection exists.
function cutoffEndAtOffset(scaledArc: Arc, cutPt1: Pt, cutPt2: Pt, refPt: Pt, fallback: number): number {
  const ints = lineCircleIntersection(lineFromTwoPoints(cutPt1, cutPt2), scaledArc);
  if (ints.length === 0) return fallback;
  const best = ints.sort((a, b) => dist(a, refPt) - dist(b, refPt))[0];
  return angleFromCenter(scaledArc, best);
}

// the flat across a corner, moved in from the plate edge by `delta`, parallel to itself
function insetCutoffLine(pt1: Pt, pt2: Pt, delta: number, interior: Pt): { p1: Pt; p2: Pt } {
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

// the corner arcs at `offset`, each cut where it meets the flat across its corner: the line between
// the two cutoff ends at the plate edge, moved in with the offset. The two arcs the flat joins come
// back as `upper` and `lower`, bout side first. A viol corner's flank and C arc are cut where they meet
function outerCornerArcs(p: ViolinFamilyParams, rib: RibArcs, outer: OuterCorners, offset: number): { arcs: Arc[]; upper: [Arc, Arc] | null; lower: [Arc, Arc] | null } {
  let k = p.corners!;
  let delta = p.body.overhang + p.body.rib - offset;
  let C2Sign = cornerTurn(rib.C2, rib.C0);
  let C1Sign = cornerTurn(rib.C1, rib.C0);
  let arcs: Arc[] = [];
  let upper: [Arc, Arc] | null = null;
  let lower: [Arc, Arc] | null = null;
  let endOf = (arc: Arc) => pointOnCircle(arc, arc.end);

  if (k.useViolCornerUC) {
    let U4Offset = offsetArcRadius(rib.U4!, offset);
    let C2Offset = offsetArcRadius(rib.C2, C2Sign * offset);
    let intersects = circleCircleIntersections(U4Offset, C2Offset);
    let U4Angle = angleFromCenter(U4Offset, intersects[0]);
    let CU1Angle = angleFromCenter(C2Offset, intersects[0]);
    U4Offset.end = U4Angle;
    C2Offset.end = CU1Angle;
    arcs.push(U4Offset, flipArcAboutY(U4Offset), C2Offset, flipArcAboutY(C2Offset));
  }
  else {
    let ucLine = insetCutoffLine(endOf(outer.U31 ?? outer.U3!), endOf(outer.C21 ?? outer.C2!), delta, rib.C0);

    let U3off = offsetArcRadius(rib.U3!, -offset);
    let U31off = k.U31DoubleArc ? offsetArcRadius(rib.U31!, -offset) : null;
    let C2off = offsetArcRadius(rib.C2, C2Sign * offset);
    let C21off = k.C21DoubleArc ? offsetArcRadius(rib.C21!, C2Sign * offset) : null;
    // the first arc of a compound corner keeps its own end; only the arc that reaches the flat is cut
    let tip = U31off ?? U3off;
    let side = C21off ?? C2off;
    tip.end = cutoffEndAtOffset(tip, ucLine.p1, ucLine.p2, ucLine.p1, (outer.U31 ?? outer.U3!).end);
    side.end = cutoffEndAtOffset(side, ucLine.p1, ucLine.p2, ucLine.p2, (outer.C21 ?? outer.C2!).end);
    for (let arc of [U3off, U31off, C2off, C21off]) if (arc) arcs.push(arc, flipArcAboutY(arc));
    upper = [tip, side];
  }

  if (k.useViolCornerLC) {
    let L4Offset = offsetArcRadius(rib.L4!, offset);
    let C1Offset = offsetArcRadius(rib.C1, C1Sign * offset);
    let intersects = circleCircleIntersections(L4Offset, C1Offset);
    let L4Angle = angleFromCenter(L4Offset, intersects[1]);
    let CL1Angle = angleFromCenter(C1Offset, intersects[1]);
    L4Offset.end = L4Angle;
    C1Offset.end = CL1Angle;
    arcs.push(L4Offset, flipArcAboutY(L4Offset), C1Offset, flipArcAboutY(C1Offset));
  }
  else {
    let lcLine = insetCutoffLine(endOf(outer.C11 ?? outer.C1!), endOf(outer.L31 ?? outer.L3!), delta, rib.C0);

    let C1off = offsetArcRadius(rib.C1, C1Sign * offset);
    let C11off = k.C11DoubleArc ? offsetArcRadius(rib.C11!, C1Sign * offset) : null;
    let L3off = offsetArcRadius(rib.L3!, -offset);
    let L31off = k.L31DoubleArc ? offsetArcRadius(rib.L31!, -offset) : null;
    let side = C11off ?? C1off;
    let tip = L31off ?? L3off;
    side.end = cutoffEndAtOffset(side, lcLine.p1, lcLine.p2, lcLine.p1, (outer.C11 ?? outer.C1!).end);
    tip.end = cutoffEndAtOffset(tip, lcLine.p1, lcLine.p2, lcLine.p2, (outer.L31 ?? outer.L3!).end);
    for (let arc of [C1off, C11off, L3off, L31off]) if (arc) arcs.push(arc, flipArcAboutY(arc));
    lower = [side, tip];
  }

  return { arcs, upper, lower };
}

// the rib outline's bout arcs stood off by `offset` (out when positive), and with `corners` its
// corner arcs as pure offsets meeting at a new tip, as the purfling runs. Empty when an offset is
// too far in for a corner's arcs to meet. C0 alone can take its own offset, for a channel that
// narrows through the waist
export function offsetArcs(p: ViolinFamilyParams, rib: RibArcs, offset: number, corners: boolean, centerOffset = offset): Arc[] {
  let k = p.corners!;
  let b = p.bouts!;
  let arcs: Arc[] = [];

  // a viol corner's flank (L4/U4) is itself the arc that reaches the corner tip,
  // so the `corners` block below pushes it trimmed to the new intersection.
  // don't add it here as well — the untrimmed copy runs past the corner.
  arcs.push(offsetArcRadius(rib.L0, offset), offsetArcRadius(rib.L1, offset));
  if (!k.useViolCornerLC) arcs.push(offsetArcRadius(rib.L2!, offset));
  arcs.push(offsetArcRadius(rib.C0, -centerOffset));
  if (!k.useViolCornerUC) arcs.push(offsetArcRadius(rib.U2!, offset));
  arcs.push(offsetArcRadius(rib.U1, offset));
  arcs.push(offsetArcRadius(rib.U0, offset));
  if (b.useViolNeck && rib.V0) {
    let cap = violNeckCap(rib.V0, b.viol!.neckRadius, offset);
    let V0off = offsetArcRadius(rib.V0, -offset);
    if (cap) V0off.start = cap.v0Start;
    arcs.push(V0off);
    if (cap?.fillet) arcs.push(cap.fillet);
  }

  // if we include corners we need to calculate the new corner intersection point
  // these corners are distinct from the "outer corners" which have unique ends, and are joined by
  // a "cutoff" line
  // instead these arcs are used as a PURE offset from the inner path
  // this can be used to move the purfling line around, for example
  if (corners) {
    let C2Sign = cornerTurn(rib.C2, rib.C0);
    let C1Sign = cornerTurn(rib.C1, rib.C0);
    let U3Offset = k.useViolCornerUC ? null : offsetArcRadius(rib.U3!, -offset);
    let U31Offset = !k.useViolCornerUC && k.U31DoubleArc ? offsetArcRadius(rib.U31!, -offset) : null;
    let C2Offset = offsetArcRadius(rib.C2, C2Sign * offset);
    let C21Offset = k.C21DoubleArc ? offsetArcRadius(rib.C21!, C2Sign * offset) : null;
    let L3Offset = k.useViolCornerLC ? null : offsetArcRadius(rib.L3!, -offset);
    let L31Offset = !k.useViolCornerLC && k.L31DoubleArc ? offsetArcRadius(rib.L31!, -offset) : null;
    let C1Offset = offsetArcRadius(rib.C1, C1Sign * offset);
    let C11Offset = k.C11DoubleArc ? offsetArcRadius(rib.C11!, C1Sign * offset) : null;

    let U4Offset = k.useViolCornerUC ? offsetArcRadius(rib.U4!, offset) : null;
    let L4Offset = k.useViolCornerLC ? offsetArcRadius(rib.L4!, offset) : null;

    // the end state of our new corner will depend on which arcs we are using
    // leftmost stops being the corner once C1 or C2 wraps around C0, but nearest the tip always is.
    // a viol flank meets C2 itself, even under a compound C corner
    let nearUpperCorner = (a: Pt, b: Pt) => dist(a, k.UCr) - dist(b, k.UCr);
    let upperTip = U4Offset ?? U31Offset ?? U3Offset!;
    let upperSide = U4Offset ? C2Offset : (C21Offset ?? C2Offset);
    let upperCorner = U4Offset
      ? circleCircleIntersections(U4Offset, C2Offset).sort((a, b) => a.x - b.x)[1]
      : circleCircleIntersections(upperTip, upperSide).sort(nearUpperCorner)[0];

    let nearLowerCorner = (a: Pt, b: Pt) => dist(a, k.LCr) - dist(b, k.LCr);
    let lowerTip = L4Offset ?? L31Offset ?? L3Offset!;
    let lowerSide = L4Offset ? C1Offset : (C11Offset ?? C1Offset);
    let lowerCorner = L4Offset
      ? circleCircleIntersections(L4Offset, C1Offset).sort((a, b) => a.x - b.x)[1]
      : circleCircleIntersections(lowerTip, lowerSide).sort(nearLowerCorner)[0];

    // an offset past a corner arc's own radius has eaten that corner: the circles still cross on
    // paper, but there is no arc left to run
    if ([upperTip, upperSide, lowerTip, lowerSide].some(arc => arc.r <= 0)) return [];
    if (!upperCorner || !lowerCorner) return [];

    // now that we have the new corners, lets modify the ends of the terminal arcs.
    // Primary arcs (U3, C2, L3, C1) keep their original end angles when a secondary
    // arc follows them; only the arc that actually reaches the corner tip is trimmed.
    upperTip.end = angleFromCenter(upperTip, upperCorner);
    upperSide.end = angleFromCenter(upperSide, upperCorner);
    lowerTip.end = angleFromCenter(lowerTip, lowerCorner);
    lowerSide.end = angleFromCenter(lowerSide, lowerCorner);
    for (let arc of U4Offset ? [U4Offset, C2Offset] : [U3Offset, U31Offset, C2Offset, C21Offset]) if (arc) arcs.push(arc);
    for (let arc of L4Offset ? [L4Offset, C1Offset] : [L3Offset, L31Offset, C1Offset, C11Offset]) if (arc) arcs.push(arc);
  }

  return arcs;
}

// the cap's circle: one radius short of the tip, on the centreline
function buttonCap(b: ButtonParams, plateEndY: number): Circle {
  return { x: 0, y: plateEndY + b.height - b.width / 2, r: b.width / 2 };
}

// the cap, and the walls when the button stands tall enough to have them; `leaves` is where it
// parts from the edge it stands on
function buttonShape(
  b: ButtonParams, plateEndY: number,
  wallHit: (x: number) => Pt | null, capHit: () => Pt | null,
): { paths: string[]; leaves: Pt; cap: Arc } | null {
  const cap = buttonCap(b, plateEndY);
  const foot = wallHit(cap.r);
  if (foot && cap.y >= foot.y) {
    const shoulder = { x: cap.r, y: cap.y };
    const arc = arcFromCircle(cap, 0, TURN.half);
    return {
      leaves: foot,
      cap: arc,
      paths: [
        pathFromLine(foot, shoulder),
        pathFromLine(flipPointAboutY(foot), flipPointAboutY(shoulder)),
        pathFromArc(arc),
      ],
    };
  }
  const hit = capHit();
  if (!hit) return null;
  const from = angleFromCenter(cap, hit);
  const arc = arcFromCircle(cap, from, TURN.half - from);
  return { leaves: hit, cap: arc, paths: [pathFromArc(arc)] };
}

// the button standing off the back plate's outline at `offset`, and the U0 offset it hands over from
function outerButton(p: ViolinFamilyParams, rib: RibArcs, offset: number): { paths: string[]; leaves: Pt; cap: Arc; U0: Arc } | null {
  let b = p.outerContour!.button;
  if (p.bouts!.useViolNeck || b.height <= 0) return null;
  const U0 = offsetArcRadius(rib.U0, offset);
  const shape = buttonShape(b, p.body.height, x => lineCircleIntersection(lineFromTwoPoints(new Pt(x, p.body.height), new Pt(x, 0)), U0).sort((a, c) => a.y - c.y).pop() ?? null,
    () => circleCircleIntersections(buttonCap(b, p.body.height), U0).find(h => h.x > 0) ?? null);
  return shape ? { ...shape, U0 } : null;
}

export function violNeckTopLine(p: ViolinFamilyParams, rib: RibArcs, d: number): string | null {
  const cap = p.bouts!.useViolNeck && rib.V0 ? violNeckCap(rib.V0, p.bouts!.viol!.neckRadius, d) : null;
  return cap ? pathFromLine({ x: cap.topX, y: cap.topY }, { x: -cap.topX, y: cap.topY }) : null;
}

// the plate's edge as one closed path at `offset` from the rib outline: the bouts' offset arcs, the
// corner arcs cut at their flats with the flat or its rounding across each, the viol neck's face,
// and on the back the button. `offset` is the inset for the plates; a later panel takes the same
// edge further in with a smaller offset, the flats moving in with it
export function outerPath(p: ViolinFamilyParams, rib: RibArcs, outer: OuterCorners, offset: number, withButton: boolean): { path: string; button: { path: string; cap: Arc } | null } {
  let o = p.outerContour!;
  let b = p.bouts!;
  let arcs = offsetArcs(p, rib, offset, false);

  let buttonPaths: string[] = [];
  const bt = withButton ? outerButton(p, rib, offset) : null;
  if (bt) {
    buttonPaths.push(...bt.paths);
    // U0 is the last arc pushed when there's no viol neck, and a button only stands without one
    arcs[arcs.length - 1].start = angleFromCenter(bt.U0, bt.leaves);
  }

  let mirroredArcs = arcs.map(arc => flipArcAboutY(arc));
  arcs = arcs.concat(mirroredArcs);

  const corners = outerCornerArcs(p, rib, outer, offset);
  arcs.push(...corners.arcs);

  let paths: string[] = [];

  // render corner connectors — sharpness > 0 uses a shaped bezier, 0 uses a straight line
  const connector = (a1: Arc, a2: Arc, rounding: number) => rounding > 0
    ? pathFromCornerCubic(a1, a2, rounding)
    : pathFromLine(pointOnCircle(a1, a1.end), pointOnCircle(a2, a2.end));
  if (corners.upper) {
    const [a1, a2] = corners.upper;
    paths.push(connector(a1, a2, o.upperRounding));
    paths.push(connector(flipArcAboutY(a1), flipArcAboutY(a2), o.upperRounding));
  }
  if (corners.lower) {
    const [a1, a2] = corners.lower;
    paths.push(connector(a1, a2, o.lowerRounding));
    paths.push(connector(flipArcAboutY(a1), flipArcAboutY(a2), o.lowerRounding));
  }

  paths.push(...arcs.map(arc => pathFromArc(arc)));

  // the neck's fillets already came through offsetArcs above and were mirrored with the
  // rest; all that is left is the top face they run out onto
  const cap = b.useViolNeck && rib.V0 ? violNeckCap(rib.V0, b.viol!.neckRadius, offset) : null;
  if (cap) {
    const faceEnd = { x: cap.topX, y: cap.topY };
    // a button wider than the neck face has nothing to stand on, so it takes the face
    const fits = withButton && o.button.height > 0
      ? { width: Math.min(o.button.width, 2 * cap.topX), height: o.button.height } : null;
    const onFace = fits && buttonShape(fits, cap.topY, x => ({ x, y: cap.topY }), () => {
      const c = buttonCap(fits, cap.topY);
      const dy = cap.topY - c.y;
      return dy < c.r ? { x: Math.sqrt(c.r * c.r - dy * dy), y: cap.topY } : null;
    });
    if (onFace) {
      paths.push(pathFromLine(faceEnd, onFace.leaves));
      paths.push(pathFromLine(flipPointAboutY(faceEnd), flipPointAboutY(onFace.leaves)));
      buttonPaths.push(...onFace.paths);
    }
    else {
      paths.push(pathFromLine(faceEnd, flipPointAboutY(faceEnd)));
    }
  }

  let path = unifyConnectedSvgPaths([...paths, ...buttonPaths]);
  return { path, button: bt ? { path: combinePathStrings(bt.paths), cap: bt.cap } : null };
}

// a purfling line: the rib outline at `arcOffset` out (in when negative), its corners pure offsets
// of the corner arcs meeting at a new tip rather than cut across; at 0 the rib outline itself. Null
// once the offset is too far in for a corner's arcs to meet
export function purflingPath(p: ViolinFamilyParams, rib: RibArcs, arcOffset: number): string | null {
  const arcs = offsetArcs(p, rib, arcOffset, true);
  if (!arcs.length) return null;
  const mirrored = arcs.map(arc => flipArcAboutY(arc));
  const paths = [...arcs, ...mirrored].map(arc => pathFromArc(arc));
  const top = violNeckTopLine(p, rib, arcOffset);
  if (top) paths.push(top);
  return unifyConnectedSvgPaths(paths);
}

// a later panel reads the plates by calling this; it returns and never writes to the params. The
// rib outline is solved again here, every stage of it, since the edge stands off all of it
export function solveOuterContour(p: ViolinFamilyParams): OuterContourSolve | null {
  if (!p.outerContour || !p.corners || !p.bouts) return null;
  let m = solveMainBouts(p)!;
  let c = solveCorners(p)!;
  let cb = solveCenterBout(p)!;
  let o = p.outerContour;
  let k = p.corners;
  let inset = p.body.overhang + p.body.rib;

  let s: OuterContourSolve = { top: null, back: null, purfling: null, outerPurfling: null, corners: {}, button: null, failures: [] };

  let rib = ribArcs(p, m, c, cb);
  if (!rib) {
    s.failures.push({ message: 'Outer contour: every arc of the rib outline has to solve first.', unsolved: ['top', 'back', 'purfling'], circles: [], segments: [] });
    return s;
  }

  // a field cleared mid-edit fails its own section rather than drawing NaN
  let blank = (section: string, unsolved: OuterContourKey[], values: number[]): OuterContourFailure | null =>
    values.every(Number.isFinite) ? null : { message: `${section}: every ${section.toLowerCase()} field needs a value.`, unsolved, circles: [], segments: [] };

  solveSection(s.failures, 'Outer contour', ['top', 'back'], () => {
    let cutoffs = [
      ...(k.useViolCornerUC ? [] : [k.U31DoubleArc ? o.U31Cutoff : o.U3Cutoff, k.C21DoubleArc ? o.C21Cutoff : o.C2Cutoff, o.upperRounding]),
      ...(k.useViolCornerLC ? [] : [k.C11DoubleArc ? o.C11Cutoff : o.C1Cutoff, k.L31DoubleArc ? o.L31Cutoff : o.L3Cutoff, o.lowerRounding]),
    ];
    let missing = blank('Outer contour', ['top', 'back'], [...cutoffs, o.button.width, o.button.height]);
    if (missing) return missing;

    let outer = outerCorners(p, rib, inset);
    s.corners = outer;
    s.top = outerPath(p, rib, outer, inset, false).path;
    let back = outerPath(p, rib, outer, inset, true);
    s.back = back.path;
    s.button = back.button;
    return null;
  });

  solveSection(s.failures, 'Purfling', ['purfling'], () => {
    let missing = blank('Purfling', ['purfling'], [o.purflingOffset, o.purflingChannelDepth]);
    if (missing) return missing;
    let purfling = purflingPath(p, rib, inset - o.purflingOffset);
    let outerPurfling = purflingPath(p, rib, inset - o.purflingOffset + o.purflingChannelDepth);
    if (!purfling || !outerPurfling)
      return { message: 'Purfling: the offset is too far in, and the corner circles no longer meet. Reduce the purfling offset.', unsolved: ['purfling'], circles: [], segments: [] };
    s.purfling = purfling;
    s.outerPurfling = outerPurfling;
    return null;
  });

  return s;
}

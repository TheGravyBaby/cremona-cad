import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { circleCircleIntersections, inscribeCircleWithinCircle, solveTangentCircleAndLine } from '../../../../helpers/math/draftMath';
import {
  angleFromCenter, dist, flipArcAboutY, flipPointAboutY, lineCircleIntersectionWithTolerance, lineFromPointAndSlope, moveInVectorSpace,
  normalizeRadians, placeCircleOnPointAtAngle, pointOnCircle, signedArcSweep, signedRadianDelta, solveSineSum, tangentUnitVectorFromLine, TURN, vectorFromSlope,
} from '../../../../helpers/math/simpleGeometry';
import { pathFromArc, pathFromArcLongWay, pathFromLine, pathFromPolyline } from '../../../../helpers/math/pathMath';
import { unifyConnectedSvgPaths } from '../../../../helpers/math/pathVibes';
import {
  AngleMarkSize, renderAngle, renderArcHalo, renderCircle, renderMirroredArc, renderMirroredArcFancy, renderMirroredSegment, renderPath, renderPointHalo,
  renderSolveFailures,
} from '../../../../helpers/renderFuncs';
import { buildBlankMiss, reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { nearestFraction } from '../../../../helpers/nearestFraction';
import { Arc, Circle, Line, Pt } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { FholeCutParams, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { FholeArcKey, FholeContoursSolve, FholeFailure } from '../../violin-family-solves';
import { FHOLE_SEED_RATIOS, FholeRatios } from '../../violin-family-seed';
import { renderBoutBounds } from '../main-bouts-panel/main-bouts-panel';
import { FholeNotch, calcFholeNotches, renderFholeBounds, roundToQuarter, renderFholeNotches, renderFholePlate, renderFlutingEdgeGuide, calcStemEdgePoints } from '../fhole-placement-panel/fhole-placement-panel';

// The f-hole contours: what bends between the eyes and the stem. From each eye a shoulder (U1/L1)
// springs tangent and turns up to the hole's bound, an arm (U2/L2, or a compound pair) carries on
// round, and a stem arc (S2/S3) lands it on the stem's edge; from each eye's cut a wing (U3/L3)
// reaches the tip and another stem arc (S1/S4) lands that on the other edge. Eyes and stem are the
// placement panel's; this one only bends what runs between. Panel and render, then solve.

// UCut/LCut take a point halo; the rest take an arc halo
export type FholeHighlightKey = FholeArcKey | 'UCut' | 'LCut';

function calcHalfSweep(arm: Arc | null): number {
  return arm ? Math.round(Math.abs(signedArcSweep(arm)) / 2 / TURN.degree * 100) / 100 : 0;
}

@Component({
  selector: 'app-vf-f-hole-contours-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './fhole-contours-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class FHoleContoursPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showFholeBounds', 'showModuleArcs', 'showFlutingEdge', 'showModuleGuides'];
  protected readonly pal = ThemeService.getPalette('orchid');

  // the Stradivari-pattern hole in FHOLE_SEED_RATIOS: every radius a fraction of the stem arc,
  // itself set against the eye span, each cut a fraction of its eye, and the takeoff angles as
  // drawn. A compound arm is seeded split halfway along the sweep the plain arm draws, so turning
  // it on changes nothing until a radius does
  static seed(p: ViolinFamilyParams): void {
    if (p.fHoleContours || !p.fHoles) return;
    let f = p.fHoles;
    let r = FHOLE_SEED_RATIOS;
    let stemArcR = Math.round(dist(f.UEye, f.LEye) * r.StoEyeSpan);
    p.fHoleContours = {
      U1R: Math.round(stemArcR * r.U1toS),
      U1End: r.U1End,
      U2R: Math.round(stemArcR * r.U2toS),
      U21DoubleArc: false,
      U21R: Math.round(stemArcR * r.U2toS),
      U2Sweep: 0,
      U3R: Math.round(stemArcR * r.U3toS),
      U3Angle: r.U3Angle,
      UCut: { angleOnEye: r.UCutAt, slope: r.UCutSlope, length: roundToQuarter(f.UEye.r * r.UCuttoUEye) },
      L1R: Math.round(stemArcR * r.L1toS),
      L1End: r.L1End,
      L2R: Math.round(stemArcR * r.L2toS),
      L21DoubleArc: false,
      L21R: Math.round(stemArcR * r.L2toS),
      L2Sweep: 0,
      L3R: Math.round(stemArcR * r.L3toS),
      L3Angle: r.L3Angle,
      LCut: { angleOnEye: r.LCutAt, slope: r.LCutSlope, length: roundToQuarter(f.LEye.r * r.LCuttoLEye) },
      stemArcR,
    };
    let s = solveFholeContours(p)!;
    p.fHoleContours.U2Sweep = calcHalfSweep(s.U2);
    p.fHoleContours.L2Sweep = calcHalfSweep(s.L2);
  }

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; report() reads it rather than solving again, and the template reads
  // the fractions beside each radius
  s!: FholeContoursSolve;
  ratios: Partial<FholeRatios> = {};

  // held as a key rather than the arc: every solve builds new arcs
  private highlightedKey: FholeHighlightKey | null = null;
  private highlightedColor = '';

  ngOnInit(): void {
    this.draw();
  }

  // every field calls this: the shell seeds the stage and schedules the commit (the undo entry, the
  // session write, report()) for when the typing stops, and the picture catches up now
  edited(): void {
    this.edit.emit();
    this.draw();
  }

  ratio(key: keyof FholeRatios): string {
    let value = this.ratios[key];
    return Number.isFinite(value) ? nearestFraction(value!) : '–';
  }

  // the arc or tip a field sets, haloed while the field has focus; null on blur
  highlight(key: FholeHighlightKey | null, color = ''): void {
    this.highlightedKey = key;
    this.highlightedColor = color;
    this.draw();
  }

  // messages for what didn't solve, raised once the edit settles rather than on every keystroke
  report(): void {
    reportFailures(this.s.failures, 'F-hole Contours');
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let s = this.s = solveFholeContours(p)!;
      this.ratios = calcFholeContoursRatios(p);
      let highlighted = this.highlightedKey ? { key: this.highlightedKey, color: this.highlightedColor } : null;
      let layers: RenderLayer[] = [renderFholePlate(p, this.pal, null, true)];
      if (this.flags.showFlutingEdge) layers.push(renderFlutingEdgeGuide(p));
      if (this.flags.showModuleGuides) layers.push(renderFholeAngleGuides(p, s, this.pal));
      if (this.flags.showFholeBounds) layers.push(renderFholeBounds(p.fHoles!, this.pal));
      if (p.fHoles!.notches) layers.push(renderFholeNotches(p.fHoles!, s.LTip, this.pal));
      layers.push(
        renderFholeContours(p, s, this.pal, this.flags, true, highlighted),
        renderSolveFailures(s.failures, this.pal.alert, true),
      );
      this.drawn.emit(layers);
    });
  }
}

const FHOLE_ANGLE_MARK: AngleMarkSize = { strokeWidth: 1, arrowLen: 1, arrowHalfWidth: 0.35, overshoot: 0.5, textGap: 1.5, fontSize: 2 };

const renderHoleAngleGuides = (eye: Circle, cut: FholeCutParams, tip: Pt | null, wing: Arc | null, up: 1 | -1, wingInk: string, pal: PanelPalette) => (g: any, ui: any): void => {
  let cutStart = pointOnCircle(eye, cut.angleOnEye * TURN.degree);
  renderAngle(eye, new Pt(eye.x + eye.r, eye.y), cutStart, eye.r * 1.6, pal.ink(3), FHOLE_ANGLE_MARK)(g, ui);
  if (!tip) return;
  // the slope reads clockwise below level, so the sweep runs from the cut up to level there
  let level = new Pt(cutStart.x + cut.length, cutStart.y);
  if (cut.slope >= 0) renderAngle(cutStart, level, tip, cut.length * 0.5, pal.ink(3), FHOLE_ANGLE_MARK)(g, ui);
  else renderAngle(cutStart, tip, level, cut.length * 0.5, pal.ink(3), FHOLE_ANGLE_MARK)(g, ui);
  if (!wing) return;
  // the wing's tangent at the tip, heading back along the wing toward the stem
  let heading = wing.end + up * TURN.quarter;
  let along = new Pt(tip.x + Math.cos(heading) * cut.length, tip.y + Math.sin(heading) * cut.length);
  if (up > 0) renderAngle(tip, along, cutStart, cut.length * 0.6, wingInk, FHOLE_ANGLE_MARK)(g, ui);
  else renderAngle(tip, cutStart, along, cut.length * 0.6, wingInk, FHOLE_ANGLE_MARK)(g, ui);
};

// how the angle fields read, marked on the treble hole as the toolbox's angle tool would mark
// them: at each eye the cut's seat from the eye's level ray and its slope from level at the
// cut's start, and at each tip the wing against the cut. Sized in mm so they zoom with the hole
export const renderFholeAngleGuides = (p: ViolinFamilyParams, s: FholeContoursSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  let f = p.fHoles!;
  let k = p.fHoleContours!;
  renderHoleAngleGuides(f.UEye, k.UCut, s.UTip, s.U3, 1, pal.ink(1).faint(-3), pal)(g, ui);
  renderHoleAngleGuides(f.LEye, k.LCut, s.LTip, s.L3, -1, pal.ink(0).faint(-3), pal)(g, ui);
};

// the eye as the arc that is left of it, a whole circle until its shoulder has solved
const renderFholeEye = (circle: Circle, shoulder: Arc | null, angleOnEye: number, color: string) => (g: any, ui: any): void => {
  if (!shoulder) {
    renderCircle(circle, color, true)(g, ui);
    return;
  }
  let joinPt = circleCircleIntersections(circle, shoulder)[0];
  let eyeArc = new Arc(circle.x, circle.y, circle.r, angleFromCenter(circle, joinPt), angleOnEye * TURN.degree);
  renderMirroredArc(eyeArc, color, STROKE_WEIGHT.trace, true)(g, ui);
};

// the hole's arcs in their own inks on this panel, each eye drawn as the arc that is left of it
// between its shoulder and its cut, the two straight runs along the stem between the stem arcs,
// and the cuts out to their tips; grey under a later panel's work. An arc whose section failed
// isn't drawn, and its eye stays a whole circle
export const renderFholeContours = (
  p: ViolinFamilyParams,
  s: FholeContoursSolve,
  pal: PanelPalette,
  flags: Pick<ViolinFamilyViewFlags, 'showModuleArcs'>,
  currentModule: boolean,
  highlighted: { key: FholeHighlightKey; color: string } | null,
) => (g: any, ui: any): void => {
  let f = p.fHoles!;
  let k = p.fHoleContours!;
  let showArcs = currentModule && flags.showModuleArcs;
  let upper = pal.ink(1);
  let upperFaint = pal.ink(1).faint(3);
  let upperWing = pal.ink(1).faint(-3);
  let lower = pal.ink(0);
  let lowerFaint = pal.ink(0).faint(3);
  let lowerWing = pal.ink(0).faint(-3);
  let stem = pal.ink(2);

  if (highlighted) {
    if (highlighted.key === 'UCut' || highlighted.key === 'LCut') {
      let tip = highlighted.key === 'UCut' ? s.UTip : s.LTip;
      if (tip) {
        renderPointHalo(tip, highlighted.color)(g, ui);
        renderPointHalo(flipPointAboutY(tip), highlighted.color)(g, ui);
      }
    }
    else {
      let arc = s[highlighted.key];
      if (arc) {
        renderArcHalo(arc, highlighted.color)(g, ui);
        renderArcHalo(flipArcAboutY(arc), highlighted.color)(g, ui);
      }
    }
  }

  if (showArcs) {
    if (s.U1) renderMirroredArcFancy(s.U1, upperFaint)(g, ui);
    if (s.U2) renderMirroredArcFancy(s.U2, upper)(g, ui);
    if (k.U21DoubleArc && s.U21) renderMirroredArcFancy(s.U21, upperFaint)(g, ui);
    if (s.U3) renderMirroredArcFancy(s.U3, upperWing)(g, ui);
    if (s.S2) renderMirroredArcFancy(s.S2, stem)(g, ui);
    if (s.S1) renderMirroredArcFancy(s.S1, stem)(g, ui);
    if (s.L1) renderMirroredArcFancy(s.L1, lowerFaint)(g, ui);
    if (s.L2) renderMirroredArcFancy(s.L2, lower)(g, ui);
    if (k.L21DoubleArc && s.L21) renderMirroredArcFancy(s.L21, lowerFaint)(g, ui);
    if (s.L3) renderMirroredArcFancy(s.L3, lowerWing)(g, ui);
    if (s.S4) renderMirroredArcFancy(s.S4, stem)(g, ui);
    if (s.S3) renderMirroredArcFancy(s.S3, stem)(g, ui);
  }

  let upperTrace = currentModule ? upper : pal.neutral;
  let upperFaintTrace = currentModule ? upperFaint : pal.neutral;
  let upperWingTrace = currentModule ? upperWing : pal.neutral;
  let lowerTrace = currentModule ? lower : pal.neutral;
  let lowerFaintTrace = currentModule ? lowerFaint : pal.neutral;
  let lowerWingTrace = currentModule ? lowerWing : pal.neutral;
  let stemTrace = currentModule ? stem : pal.neutral;
  let cutTrace = currentModule ? pal.ink(3) : pal.neutral;
  // the straight runs between the stem arcs, fainter than the arcs they join
  let runTrace = currentModule ? pal.ink(2).faint(3) : pal.neutral;

  if (s.U1) renderMirroredArc(s.U1, upperFaintTrace, STROKE_WEIGHT.trace)(g, ui);
  if (s.U2) renderMirroredArc(s.U2, upperTrace, STROKE_WEIGHT.trace)(g, ui);
  if (k.U21DoubleArc && s.U21) renderMirroredArc(s.U21, upperFaintTrace, STROKE_WEIGHT.trace)(g, ui);
  if (s.U3) renderMirroredArc(s.U3, upperWingTrace, STROKE_WEIGHT.trace)(g, ui);
  if (s.S2) renderMirroredArc(s.S2, stemTrace, STROKE_WEIGHT.trace)(g, ui);
  if (s.S1) renderMirroredArc(s.S1, stemTrace, STROKE_WEIGHT.trace)(g, ui);
  if (s.L1) renderMirroredArc(s.L1, lowerFaintTrace, STROKE_WEIGHT.trace)(g, ui);
  if (s.L2) renderMirroredArc(s.L2, lowerTrace, STROKE_WEIGHT.trace)(g, ui);
  if (k.L21DoubleArc && s.L21) renderMirroredArc(s.L21, lowerFaintTrace, STROKE_WEIGHT.trace)(g, ui);
  if (s.L3) renderMirroredArc(s.L3, lowerWingTrace, STROKE_WEIGHT.trace)(g, ui);
  if (s.S4) renderMirroredArc(s.S4, stemTrace, STROKE_WEIGHT.trace)(g, ui);
  if (s.S3) renderMirroredArc(s.S3, stemTrace, STROKE_WEIGHT.trace)(g, ui);

  if (s.UTip) renderMirroredSegment(pointOnCircle(f.UEye, k.UCut.angleOnEye * TURN.degree), s.UTip, cutTrace, STROKE_WEIGHT.trace)(g, ui);
  if (s.LTip) renderMirroredSegment(pointOnCircle(f.LEye, k.LCut.angleOnEye * TURN.degree), s.LTip, cutTrace, STROKE_WEIGHT.trace)(g, ui);

  if (s.S2 && s.S4) renderMirroredSegment(pointOnCircle(s.S2, s.S2.end), pointOnCircle(s.S4, s.S4.start), runTrace, STROKE_WEIGHT.trace)(g, ui);
  if (s.S1 && s.S3) renderMirroredSegment(pointOnCircle(s.S1, s.S1.start), pointOnCircle(s.S3, s.S3.end), runTrace, STROKE_WEIGHT.trace)(g, ui);

  renderFholeEye(f.UEye, s.U1, k.UCut.angleOnEye, upperTrace)(g, ui);
  renderFholeEye(f.LEye, s.L1, k.LCut.angleOnEye, lowerTrace)(g, ui);
};

// both holes cut into the top plate, grey, for the panels that draw the plate under or after
// this one; nothing until the contours have been drafted and close
export const renderFholes = (p: ViolinFamilyParams, pal: PanelPalette) => (g: any, ui: any): void => {
  if (!p.fHoleContours) return;
  let s = solveFholeContours(p)!;
  if (!s.path) return;
  renderPath(s.path, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  renderPath(defineFholePath(p, s, true)!, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
};

// where a shoulder sits: tangent inside its eye, so its centre rides a circle about the eye, and
// turning clockwise from there to the bearing it ends on, where the arm takes over. Whichever arc
// passes the apex, the shoulder, the arm, or the second arm once the first is split off before it,
// has to touch the bound there. The end is fixed, so each arm's centre sits a fixed offset from the
// shoulder's and only the shoulder's height moves with the angle round the eye: each case is a sine
// to solve, checked after against which arc its answer puts at the apex. `up` is where the bound
// lies, `side` which side of the eye the centre sits
function solveShoulder(
  eye: Circle,
  r: number,
  end: number,
  armR: number,
  split: { r: number; after: number } | null,
  bound: number,
  up: 1 | -1,
  side: 1 | -1,
): Arc | null {
  let rho = Math.abs(r - eye.r);
  // the shoulder leaves its eye looking back through it when it is the larger circle
  let out = r >= eye.r ? TURN.half : 0;
  let apex = up * TURN.quarter;
  end = signedRadianDelta(end);
  let armLift = (r - armR) * Math.sin(end);
  let cases = [
    { top: r, lift: 0 },
    { top: armR, lift: armLift },
    ...(split ? [{ top: split.r, lift: armLift + (armR - split.r) * Math.sin(end - split.after) }] : []),
  ];
  for (let [owner, { top, lift }] of cases.entries()) {
    for (let phi of solveSineSum([{ a: rho, c: 0 }], bound - eye.y - up * top - lift)) {
      if (side * Math.cos(phi) < 0) continue;
      let C = pointOnCircle({ ...eye, r: rho }, phi);
      let start = out ? angleFromCenter(C, eye) : angleFromCenter(eye, C);
      let sweep = normalizeRadians(start - end);
      // the outline draws the shoulder the short way round
      if (sweep > TURN.half) continue;
      let shoulderOwns = normalizeRadians(start - apex) <= sweep + 1e-9;
      let armOwns = !shoulderOwns && (!split || normalizeRadians(end - apex) <= split.after + 1e-9);
      if ((shoulderOwns ? 0 : armOwns ? 1 : 2) !== owner) continue;
      return new Arc(C.x, C.y, r, start, end);
    }
  }
  return null;
}

// a notch cut into the straight run from `from` to `to`, as the points the run passes through in
// its own direction. The run is the stem's edge, so the mouth lies on it; a notch wider than the
// run has left for it shrinks about its mouth to fit, and one whose centre is off the run isn't cut
function calcNotchOnRun(n: FholeNotch, from: Pt, to: Pt): Pt[] {
  const lo = Math.min(from.y, to.y), hi = Math.max(from.y, to.y);
  if (n.apex.y < lo || n.apex.y > hi) return [];
  const k = Math.min(1, (hi - n.apex.y) / (n.top.y - n.apex.y), (n.apex.y - lo) / (n.apex.y - n.bottom.y));
  const m = new Pt((n.top.x + n.bottom.x) / 2, (n.top.y + n.bottom.y) / 2);
  const v = [n.top, n.apex, n.bottom].map(pt => new Pt(m.x + (pt.x - m.x) * k, m.y + (pt.y - m.y) * k));
  return from.y > to.y ? v : v.reverse();
}

function flipArcIf(arc: Arc, flip: boolean): Arc {
  return flip ? flipArcAboutY(arc) : arc;
}

function flipPointIf(pt: Pt, flip: boolean): Pt {
  return flip ? flipPointAboutY(pt) : pt;
}

function defineStemRun(from: Pt, to: Pt, notch: FholeNotch | null, flip: boolean): string {
  return pathFromPolyline([from, ...(notch ? calcNotchOnRun(notch, from, to) : []), to].map(pt => flipPointIf(pt, flip)));
}

// one f-hole's solved arcs stitched into a single closed outline, the way the render draws them
// but as one path; `flip` mirrors it to the bass side. The eye arcs aren't on the solve: they are
// cheap to re-derive from what is. The notches are cut into the stem's runs while the placement
// has them on. Null while any arc of the outline is missing
export function defineFholePath(p: ViolinFamilyParams, s: FholeContoursSolve, flip: boolean, renderEyes = true): string | null {
  const f = p.fHoles!;
  const k = p.fHoleContours!;
  const needed = [s.U1, s.U2, s.U3, s.L1, s.L2, s.L3, s.S1, s.S2, s.S3, s.S4, ...(k.U21DoubleArc ? [s.U21] : []), ...(k.L21DoubleArc ? [s.L21] : [])];
  if (needed.some(arc => !arc) || !s.UTip || !s.LTip) return null;
  const upperCutAngle = k.UCut.angleOnEye * TURN.degree;
  const lowerCutAngle = k.LCut.angleOnEye * TURN.degree;

  const upperEyeJoin = circleCircleIntersections(f.UEye, s.U1!)[0];
  const upperEyeArc = new Arc(f.UEye.x, f.UEye.y, f.UEye.r, angleFromCenter(f.UEye, upperEyeJoin), upperCutAngle);
  const upperCutPt = pointOnCircle(f.UEye, upperCutAngle);

  const lowerEyeJoin = circleCircleIntersections(f.LEye, s.L1!)[0];
  const lowerEyeArc = new Arc(f.LEye.x, f.LEye.y, f.LEye.r, angleFromCenter(f.LEye, lowerEyeJoin), lowerCutAngle);
  const lowerCutPt = pointOnCircle(f.LEye, lowerCutAngle);

  const outerStemTop = pointOnCircle(s.S2!, s.S2!.end);
  const outerStemBottom = pointOnCircle(s.S4!, s.S4!.start);
  const innerStemTop = pointOnCircle(s.S1!, s.S1!.start);
  const innerStemBottom = pointOnCircle(s.S3!, s.S3!.end);
  const notches = f.notches ? calcFholeNotches(f, s.LTip) : null;

  const paths = [
    renderEyes ? pathFromArcLongWay(flipArcIf(upperEyeArc, flip)) : pathFromArc(flipArcIf(upperEyeArc, flip)),
    pathFromArc(flipArcIf(s.U1!, flip)),
    pathFromArc(flipArcIf(s.U2!, flip)),
    ...(k.U21DoubleArc ? [pathFromArc(flipArcIf(s.U21!, flip))] : []),
    pathFromArc(flipArcIf(s.S2!, flip)),
    defineStemRun(outerStemTop, outerStemBottom, notches && notches.outer, flip),
    pathFromArc(flipArcIf(s.S4!, flip)),
    pathFromArc(flipArcIf(s.L3!, flip)),
    pathFromLine(flipPointIf(s.LTip, flip), flipPointIf(lowerCutPt, flip)),
    renderEyes ? pathFromArcLongWay(flipArcIf(lowerEyeArc, flip)) : pathFromArc(flipArcIf(lowerEyeArc, flip)),
    pathFromArc(flipArcIf(s.L1!, flip)),
    pathFromArc(flipArcIf(s.L2!, flip)),
    ...(k.L21DoubleArc ? [pathFromArc(flipArcIf(s.L21!, flip))] : []),
    pathFromArc(flipArcIf(s.S3!, flip)),
    defineStemRun(innerStemBottom, innerStemTop, notches && notches.inner, flip),
    pathFromArc(flipArcIf(s.S1!, flip)),
    pathFromArc(flipArcIf(s.U3!, flip)),
    pathFromLine(flipPointIf(s.UTip, flip), flipPointIf(upperCutPt, flip)),
  ];

  return unifyConnectedSvgPaths(paths);
}

// where a wing ends on its own circle, from the angle it meets the cut at: its tangent at the
// tip stands (90° − angle) round from the cut's own direction, the upper wing turning one way
// round the tip and the lower the other
function calcWingEnd(cut: FholeCutParams, angle: number, up: 1 | -1): number {
  return (cut.slope + up * (90 - angle)) * TURN.degree;
}

function calcStemEdgeSegment(pt: Pt, stemAngle: number, stemHalf: number): [Pt, Pt] {
  return [
    new Pt(pt.x - Math.cos(stemAngle) * stemHalf, pt.y - Math.sin(stemAngle) * stemHalf),
    new Pt(pt.x + Math.cos(stemAngle) * stemHalf, pt.y + Math.sin(stemAngle) * stemHalf),
  ];
}

function buildShoulderMiss(
  section: string,
  key: 'U1' | 'L1',
  shoulderR: number,
  eye: Circle,
  shoulderY: number,
  bound: number,
  up: 1 | -1,
  unsolved: FholeArcKey[],
): FholeFailure {
  return {
    message: up * (shoulderY - eye.y) > 0
      ? `${section}: ${key} can't touch the eye and still reach the rise. Reduce Rise, or enlarge ${key}.`
      : `${section}: the rise is too small for ${key} to touch the eye. Increase Rise.`,
    unsolved,
    circles: [new Circle(eye.x, eye.y + up * Math.abs(shoulderR - eye.r), shoulderR)],
    segments: [[new Pt(eye.x - shoulderR, bound), new Pt(eye.x + shoulderR, bound)]],
  };
}

// the stem arc wraps `reach` from `side` of the edge, so it can only fail two ways: `reach`
// already pokes across the edge, or it sits clear and the stem arc is too small to span the gap
function buildStemMiss(
  section: string,
  reachKey: FholeArcKey,
  reach: Circle,
  stemKey: 'S1' | 'S2' | 'S3' | 'S4',
  edge: Line,
  edgeSegment: [Pt, Pt],
  edgeName: string,
  side: 1 | -1,
  shrink: string,
): FholeFailure {
  let normal = tangentUnitVectorFromLine(edge);
  let clearance = side * (reach.x * normal.a + (reach.y - edge.y) * normal.b) - reach.r;
  return {
    message: clearance < 0
      ? `${section}: ${reachKey} crosses the ${edgeName} stem edge before it can turn onto it. ${shrink}, or widen the stem.`
      : `${section}: ${stemKey} can't bridge from ${reachKey} to the ${edgeName} stem edge. Enlarge the stem Arc Radius.`,
    unsolved: [reachKey, stemKey],
    circles: [reach],
    segments: [edgeSegment],
  };
}

// a later panel reads the holes by calling this; it returns and never writes to the params. Four
// sections, each one end's arm or wing with the stem arc that lands it, so a failure at one end
// leaves the other three drawn
export function solveFholeContours(p: ViolinFamilyParams): FholeContoursSolve | null {
  if (!p.fHoles || !p.fHoleContours) return null;
  let f = p.fHoles;
  let k = p.fHoleContours;
  let deg = TURN.degree;
  let s: FholeContoursSolve = {
    U1: null, U2: null, U21: null, U3: null, L1: null, L2: null, L21: null, L3: null, S1: null, S2: null, S3: null, S4: null,
    UTip: null, LTip: null, path: null, failures: [],
  };

  let stemAngle = f.stem.angle * deg;
  let stemSlope = Math.tan(stemAngle);
  // the edges stand half the width either side of the centre, square across the stem
  let { inner: innerStemPt, outer: outerStemPt } = calcStemEdgePoints(f.stem);
  let outerStemLine = lineFromPointAndSlope(outerStemPt, stemSlope);
  let innerStemLine = lineFromPointAndSlope(innerStemPt, stemSlope);

  let stemHalf = dist(f.UEye, f.LEye) / 2;
  let outerStemSegment = calcStemEdgeSegment(outerStemPt, stemAngle, stemHalf);
  let innerStemSegment = calcStemEdgeSegment(innerStemPt, stemAngle, stemHalf);

  // first the upper curve that connects to the eye
  solveSection(s.failures, 'Upper arm', ['U1', 'U2', 'U21', 'S2'], () => {
    let missing = buildBlankMiss('Upper arm', ['U1', 'U2', 'U21', 'S2'], [k.U1R, k.U1End, k.U2R, k.stemArcR, f.URise, ...(k.U21DoubleArc ? [k.U21R, k.U2Sweep] : [])]);
    if (missing) return missing;
    let upperSplit = k.U21DoubleArc ? { r: k.U21R, after: k.U2Sweep * deg } : null;

    let upperBound = f.UEye.y + f.UEye.r + f.URise;
    let upperShoulder = solveShoulder(f.UEye, k.U1R, k.U1End * deg, k.U2R, upperSplit, upperBound, 1, 1);
    if (!upperShoulder)
      return buildShoulderMiss('Upper arm', 'U1', k.U1R, f.UEye, upperBound - k.U1R, upperBound, 1, ['U1', 'U2', 'U21', 'S2']);
    s.U1 = upperShoulder;

    // now continue from the shoulder, we will call this the arm
    let upperArm = inscribeCircleWithinCircle(upperShoulder, k.U2R, upperShoulder.end);
    s.U2 = new Arc(upperArm.x, upperArm.y, upperArm.r, upperShoulder.end, 0);

    // the arc the stem arc has to reach: the arm, or its second half once split
    let upperStemReach = s.U2;
    if (upperSplit) {
      s.U2.end = upperShoulder.end - upperSplit.after;
      let secondArm = inscribeCircleWithinCircle(s.U2, upperSplit.r, s.U2.end);
      s.U21 = new Arc(secondArm.x, secondArm.y, secondArm.r, s.U2.end, 0);
      upperStemReach = s.U21;
    }

    let S2 = solveTangentCircleAndLine(outerStemLine, upperStemReach, k.stemArcR, true, 1, f.stem.center);
    if (!S2)
      return upperSplit
        ? buildStemMiss('Upper arm', 'U21', upperStemReach, 'S2', outerStemLine, outerStemSegment, 'outer', 1, 'Shrink U1, U2 or U21')
        : buildStemMiss('Upper arm', 'U2', upperStemReach, 'S2', outerStemLine, outerStemSegment, 'outer', 1, 'Shrink U1 or U2');

    let S2StemIntersect = lineCircleIntersectionWithTolerance(outerStemLine, S2); // we are just kissing the line, sometimes we miss due to floating points
    let S2StemEndAngle = angleFromCenter(S2, S2StemIntersect[0]);

    // tangent by construction, so the join sits on the line of centres: one angle serves both circles
    upperStemReach.end = angleFromCenter(S2, upperStemReach);
    s.S2 = new Arc(S2.x, S2.y, S2.r, upperStemReach.end, S2StemEndAngle);
    return null;
  });

  // now we do the upper wing
  solveSection(s.failures, 'Upper wing', ['U3', 'S1'], () => {
    let missing = buildBlankMiss('Upper wing', ['U3', 'S1'], [k.U3R, k.U3Angle, k.UCut.angleOnEye, k.UCut.slope, k.UCut.length, k.stemArcR]);
    if (missing) return missing;
    let cutStart = pointOnCircle(f.UEye, k.UCut.angleOnEye * deg);
    let cutVector = vectorFromSlope(k.UCut.slope * deg);
    cutVector.mag = k.UCut.length;
    let cutEnd = moveInVectorSpace(cutStart, [cutVector]);
    s.UTip = cutEnd;
    let U3End = calcWingEnd(k.UCut, k.U3Angle, 1);
    let cutCircle = placeCircleOnPointAtAngle(k.U3R, cutEnd, U3End);

    let S1 = solveTangentCircleAndLine(innerStemLine, cutCircle, k.stemArcR, true, 1, f.stem.center);
    if (!S1)
      return buildStemMiss('Upper wing', 'U3', cutCircle, 'S1', innerStemLine, innerStemSegment, 'inner', 1, 'Shrink U3 or move its tip with Wing and Slope');

    let S1U3Pt = circleCircleIntersections(S1, cutCircle);
    let S1StemIntersect = lineCircleIntersectionWithTolerance(innerStemLine, S1);
    let S1StemEndAngle = angleFromCenter(S1, S1StemIntersect[0]);

    s.U3 = new Arc(cutCircle.x, cutCircle.y, cutCircle.r, angleFromCenter(cutCircle, S1U3Pt[0]), U3End);
    s.S1 = new Arc(S1.x, S1.y, S1.r, S1StemEndAngle, angleFromCenter(S1, S1U3Pt[0]));
    return null;
  });

  // now the lower arm, upside down: bound drops below the eye, and the arm meets the inner stem
  solveSection(s.failures, 'Lower arm', ['L1', 'L2', 'L21', 'S3'], () => {
    let missing = buildBlankMiss('Lower arm', ['L1', 'L2', 'L21', 'S3'], [k.L1R, k.L1End, k.L2R, k.stemArcR, f.LRise, ...(k.L21DoubleArc ? [k.L21R, k.L2Sweep] : [])]);
    if (missing) return missing;
    let lowerSplit = k.L21DoubleArc ? { r: k.L21R, after: k.L2Sweep * deg } : null;

    let lowerBound = f.LEye.y - f.LEye.r - f.LRise;
    let lowerShoulder = solveShoulder(f.LEye, k.L1R, k.L1End * deg, k.L2R, lowerSplit, lowerBound, -1, -1);
    if (!lowerShoulder)
      return buildShoulderMiss('Lower arm', 'L1', k.L1R, f.LEye, lowerBound + k.L1R, lowerBound, -1, ['L1', 'L2', 'L21', 'S3']);
    s.L1 = lowerShoulder;

    let lowerArm = inscribeCircleWithinCircle(lowerShoulder, k.L2R, lowerShoulder.end);
    s.L2 = new Arc(lowerArm.x, lowerArm.y, lowerArm.r, lowerShoulder.end, 0);

    let lowerStemReach = s.L2;
    if (lowerSplit) {
      s.L2.end = lowerShoulder.end - lowerSplit.after;
      let secondArm = inscribeCircleWithinCircle(s.L2, lowerSplit.r, s.L2.end);
      s.L21 = new Arc(secondArm.x, secondArm.y, secondArm.r, s.L2.end, 0);
      lowerStemReach = s.L21;
    }

    let S3 = solveTangentCircleAndLine(innerStemLine, lowerStemReach, k.stemArcR, true, -1, f.stem.center);
    if (!S3)
      return lowerSplit
        ? buildStemMiss('Lower arm', 'L21', lowerStemReach, 'S3', innerStemLine, innerStemSegment, 'inner', -1, 'Shrink L1, L2 or L21')
        : buildStemMiss('Lower arm', 'L2', lowerStemReach, 'S3', innerStemLine, innerStemSegment, 'inner', -1, 'Shrink L1 or L2');

    let S3StemIntersect = lineCircleIntersectionWithTolerance(innerStemLine, S3);
    let S3StemEndAngle = angleFromCenter(S3, S3StemIntersect[0]);

    lowerStemReach.end = angleFromCenter(S3, lowerStemReach);
    s.S3 = new Arc(S3.x, S3.y, S3.r, lowerStemReach.end, S3StemEndAngle);
    return null;
  });

  // now the lower wing, which connects to the outer stem
  solveSection(s.failures, 'Lower wing', ['L3', 'S4'], () => {
    let missing = buildBlankMiss('Lower wing', ['L3', 'S4'], [k.L3R, k.L3Angle, k.LCut.angleOnEye, k.LCut.slope, k.LCut.length, k.stemArcR]);
    if (missing) return missing;
    let cutStart = pointOnCircle(f.LEye, k.LCut.angleOnEye * deg);
    let cutVector = vectorFromSlope(k.LCut.slope * deg);
    cutVector.mag = k.LCut.length;
    let cutEnd = moveInVectorSpace(cutStart, [cutVector]);
    s.LTip = cutEnd;
    let L3End = calcWingEnd(k.LCut, k.L3Angle, -1);
    let cutCircle = placeCircleOnPointAtAngle(k.L3R, cutEnd, L3End);

    let S4 = solveTangentCircleAndLine(outerStemLine, cutCircle, k.stemArcR, true, -1, f.stem.center);
    if (!S4)
      return buildStemMiss('Lower wing', 'L3', cutCircle, 'S4', outerStemLine, outerStemSegment, 'outer', -1, 'Shrink L3 or move its tip with Wing and Slope');

    let S4L3Pt = circleCircleIntersections(S4, cutCircle);
    let S4StemIntersect = lineCircleIntersectionWithTolerance(outerStemLine, S4);
    let S4StemEndAngle = angleFromCenter(S4, S4StemIntersect[0]);

    s.L3 = new Arc(cutCircle.x, cutCircle.y, cutCircle.r, angleFromCenter(cutCircle, S4L3Pt[0]), L3End);
    s.S4 = new Arc(S4.x, S4.y, S4.r, S4StemEndAngle, angleFromCenter(S4, S4L3Pt[0]));
    return null;
  });

  // a half-solved hole won't close
  if (!s.failures.length) s.path = defineFholePath(p, s, false);
  return s;
}

// the contours read back as the seed drew them: the stem arc against the eye span and every other
// arc against the stem arc
export function calcFholeContoursRatios(p: ViolinFamilyParams): Partial<FholeRatios> {
  let f = p.fHoles;
  let k = p.fHoleContours;
  if (!f || !k) return {};
  let stem = k.stemArcR;
  return {
    UCuttoUEye: k.UCut.length / f.UEye.r,
    LCuttoLEye: k.LCut.length / f.LEye.r,
    StoEyeSpan: stem / dist(f.UEye, f.LEye),
    U1toS: k.U1R / stem,
    U2toS: k.U2R / stem,
    U3toS: k.U3R / stem,
    L1toS: k.L1R / stem,
    L2toS: k.L2R / stem,
    L3toS: k.L3R / stem,
  };
}

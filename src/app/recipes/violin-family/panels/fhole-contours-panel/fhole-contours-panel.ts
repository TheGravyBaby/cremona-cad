import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { circleCircleIntersections, inscribeCircleWithinCircle, solveTangentCircleAndLine } from '../../../../helpers/math/draftMath';
import {
  angleFromCenter, dist, flipArcAboutY, flipPointAboutY, lineCircleIntersectionWithTolerance, lineFromPointAndSlope,
  moveInVectorSpace, placeCircleOnPointAtAngle, pointOnCircle, tangentUnitVectorFromLine, TURN, vectorFromSlope,
} from '../../../../helpers/math/simpleGeometry';
import { pathFromArc, pathFromArcLongWay, pathFromLine } from '../../../../helpers/math/pathMath';
import { unifyConnectedSvgPaths } from '../../../../helpers/math/pathVibes';
import {
  renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderPath, renderPointHalo, renderSegment, renderSolveFailures,
} from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { Arc, Circle, Line, Pt } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import {
  FholeArcKey, FholeContoursSolve, FholeFailure, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey,
  ViolinFamilyViewFlags,
} from '../../violin-family-types';
import { renderBoutBounds } from '../main-bouts-panel/main-bouts-panel';
import { renderFholeBounds, renderFholePlate, renderFlutingEdgeGuide } from '../fhole-placement-panel/fhole-placement-panel';

// The f-hole contours: what bends between the eyes and the stem. From each eye a shoulder (U1/L1)
// springs tangent and turns up to the hole's bound, an arm (U2/L2, or a compound pair) carries on
// round, and a stem arc (S2/S3) lands it on the stem's edge; from each eye's cut a wing (U3/L3)
// reaches the tip and another stem arc (S1/S4) lands that on the other edge. Eyes and stem are the
// placement panel's; this one only bends what runs between. Panel and render, then solve.

// UCut/LCut take a point halo; the rest take an arc halo
export type FholeHighlightKey = FholeArcKey | 'UCut' | 'LCut';

@Component({
  selector: 'app-vf-f-hole-contours-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './fhole-contours-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class FHoleContoursPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showFholeBounds', 'showModuleArcs', 'showFlutingEdge', 'showModuleGuides'];
  protected readonly pal = ThemeService.getPalette('orchid');

  // off a traced Amati, nice historical defaults: every radius a whole multiple of its own eye,
  // the stem's four arcs one radius off the lower eye, and each cut one eye radius long. A
  // compound arm is seeded split halfway along the sweep the plain arm draws, so turning it on
  // changes nothing until a number does
  static seed(p: ViolinFamilyParams): void {
    if (p.fHoleContours || !p.fHoles) return;
    let f = p.fHoles;
    let stemArcR = Math.round(f.LEye.r * FStemArctoLEye);
    p.fHoleContours = {
      U1R: Math.round(f.UEye.r * FShtoEye),
      U1End: 90,
      U2R: Math.round(f.UEye.r * FArmtoEye),
      U21DoubleArc: false,
      U21R: Math.round(f.UEye.r * FArmtoEye),
      U21Start: 0,
      U3R: Math.round(f.UEye.r * FArmtoEye),
      U3End: FUWingEnd,
      UCut: { angleOnEye: FUCutAt, slope: FUCutSlope, length: f.UEye.r },
      L1R: Math.round(f.LEye.r * FShtoEye),
      L1End: -90,
      L2R: Math.round(f.LEye.r * FArmtoEye),
      L21DoubleArc: false,
      L21R: Math.round(f.LEye.r * FArmtoEye),
      L21Start: 0,
      L3R: Math.round(f.LEye.r * FArmtoEye),
      L3End: FLWingEnd,
      LCut: { angleOnEye: FLCutAt, slope: FLCutSlope, length: f.LEye.r },
      stemArcR,
      stemArcsIndependent: false,
      S1R: stemArcR,
      S2R: stemArcR,
      S3R: stemArcR,
      S4R: stemArcR,
    };
    let s = solveFholeContours(p)!;
    let halfway = (arm: Arc | null) => arm ? Math.round((arm.start + arm.end) / 2 / TURN.degree * 100) / 100 : 0;
    p.fHoleContours.U21Start = halfway(s.U2);
    p.fHoleContours.L21Start = halfway(s.L2);
  }

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; report() reads it rather than solving again
  s!: FholeContoursSolve;

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
      let highlighted = this.highlightedKey ? { key: this.highlightedKey, color: this.highlightedColor } : null;
      let layers: RenderLayer[] = [renderFholePlate(p, this.pal, null, true)];
      if (this.flags.showFlutingEdge) layers.push(renderFlutingEdgeGuide(p));
      if (this.flags.showModuleGuides) layers.push(renderBoutBounds(p, ThemeService.getPalette('classicCremona')));
      if (this.flags.showFholeBounds) layers.push(renderFholeBounds(p.fHoles!, this.pal));
      layers.push(
        renderFholeContours(p, s, this.pal, this.flags, true, highlighted),
        renderSolveFailures(s.failures, this.pal.alert, true),
      );
      this.drawn.emit(layers);
    });
  }
}

// off a traced Amati, nice historical defaults
const FShtoEye = 5 / 2;
const FArmtoEye = 3;
const FStemArctoLEye = 8;
const FUWingEnd = 180 * 4 / 9;
const FLWingEnd = 180 * -19 / 36;
const FUCutAt = 60;
const FLCutAt = 240;
const FUCutSlope = 60;
const FLCutSlope = -120;

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
  let ink = (color: string) => currentModule ? color : pal.neutral;

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

  let arc = (key: FholeArcKey, color: string) => {
    let a = s[key];
    if (!a) return;
    renderArcFromArc(a, ink(color), STROKE_WEIGHT.trace)(g, ui);
    renderArcFromArc(flipArcAboutY(a), ink(color), STROKE_WEIGHT.trace)(g, ui);
    if (!showArcs) return;
    renderArcFromArcFancy(a, color)(g, ui);
    renderArcFromArcFancy(flipArcAboutY(a), color)(g, ui);
  };

  arc('U1', pal.ink(1).faint(3));
  arc('U2', pal.ink(1));
  if (k.U21DoubleArc) arc('U21', pal.ink(1).faint(3));
  arc('U3', pal.ink(1).faint(-3));
  arc('S2', pal.ink(2));
  arc('S1', pal.ink(2));
  arc('L1', pal.ink(0).faint(3));
  arc('L2', pal.ink(0));
  if (k.L21DoubleArc) arc('L21', pal.ink(0).faint(3));
  arc('L3', pal.ink(0).faint(-3));
  arc('S4', pal.ink(2));
  arc('S3', pal.ink(2));

  let cut = (eye: Circle, angleOnEye: number, tip: Pt | null) => {
    if (!tip) return;
    let cutStart = pointOnCircle(eye, angleOnEye * TURN.degree);
    renderSegment(cutStart, tip, ink(pal.ink(3)), STROKE_WEIGHT.trace)(g, ui);
    renderSegment(flipPointAboutY(cutStart), flipPointAboutY(tip), ink(pal.ink(3)), STROKE_WEIGHT.trace)(g, ui);
  };
  cut(f.UEye, k.UCut.angleOnEye, s.UTip);
  cut(f.LEye, k.LCut.angleOnEye, s.LTip);

  // now we need to render the segments between the arc ends
  let run = (from: Pt, to: Pt) => {
    renderSegment(from, to, ink(pal.ink(2)), STROKE_WEIGHT.trace)(g, ui);
    renderSegment(flipPointAboutY(from), flipPointAboutY(to), ink(pal.ink(2)), STROKE_WEIGHT.trace)(g, ui);
  };
  if (s.S2 && s.S4) run(pointOnCircle(s.S2, s.S2.end), pointOnCircle(s.S4, s.S4.start));
  if (s.S1 && s.S3) run(pointOnCircle(s.S1, s.S1.start), pointOnCircle(s.S3, s.S3.end));

  // now we render the eyes as arcs, not just circles
  let eye = (circle: Circle, shoulder: Arc | null, angleOnEye: number, color: string) => {
    if (!shoulder) {
      renderCircle(circle, ink(color), true)(g, ui);
      return;
    }
    let joinPt = circleCircleIntersections(circle, shoulder)[0];
    let eyeArc = new Arc(circle.x, circle.y, circle.r, angleFromCenter(circle, joinPt), angleOnEye * TURN.degree);
    renderArcFromArc(eyeArc, ink(color), STROKE_WEIGHT.trace, true)(g, ui);
    renderArcFromArc(flipArcAboutY(eyeArc), ink(color), STROKE_WEIGHT.trace, true)(g, ui);
  };
  eye(f.UEye, s.U1, k.UCut.angleOnEye, pal.ink(1));
  eye(f.LEye, s.L1, k.LCut.angleOnEye, pal.ink(0));
};

// both holes cut into the top plate, grey, for the panels that draw the plate under or after
// this one; nothing until the contours have been drafted and close
export const renderFholes = (p: ViolinFamilyParams, pal: PanelPalette) => (g: any, ui: any): void => {
  if (!p.fHoleContours) return;
  let s = solveFholeContours(p)!;
  if (!s.path) return;
  for (let d of [s.path, fholePath(p, s, true)!]) renderPath(d, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
};

// on some weird f-holes, we need to pull back the shoulder end angle from a simple 90 deg peak
// in this situation, it is not the shoulder that hits the upper peak, but the arm
// this method solves the difference in bounds, we can simply take he difference in height
// and get a new bounds for the shoulder height
function shoulderReach(shoulderR: number, shoulderEnd: number, armR: number, arm2: { r: number; start: number } | null, extreme: number): number {
  if (shoulderEnd <= extreme) return shoulderR;

  // sin of the shoulder represents the y component of the rise
  // multiply by the difference in the circles yields the rise in the arm
  let armCentreRise = (shoulderR - armR) * Math.abs(Math.sin(shoulderEnd));
  if (!arm2 || arm2.start <= extreme) return armCentreRise + armR;

  // a compound arm split before the peak hands it on once more, by the same rule
  let arm2CentreRise = armCentreRise + (armR - arm2.r) * Math.abs(Math.sin(arm2.start));
  return arm2CentreRise + arm2.r;
}

// one f-hole's solved arcs stitched into a single closed outline, the way the render draws them
// but as one path; `flip` mirrors it to the bass side. The eye arcs aren't on the solve: they are
// cheap to re-derive from what is. Null while any arc of the outline is missing
export function fholePath(p: ViolinFamilyParams, s: FholeContoursSolve, flip: boolean, renderEyes = true): string | null {
  const f = p.fHoles!;
  const k = p.fHoleContours!;
  const needed = [s.U1, s.U2, s.U3, s.L1, s.L2, s.L3, s.S1, s.S2, s.S3, s.S4, ...(k.U21DoubleArc ? [s.U21] : []), ...(k.L21DoubleArc ? [s.L21] : [])];
  if (needed.some(arc => !arc) || !s.UTip || !s.LTip) return null;
  const xf = flip ? flipArcAboutY : (arc: Arc) => arc;
  const pxf = flip ? flipPointAboutY : (pt: Pt) => pt;
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

  const paths = [
    renderEyes ? pathFromArcLongWay(xf(upperEyeArc)) : pathFromArc(xf(upperEyeArc)),
    pathFromArc(xf(s.U1!)),
    pathFromArc(xf(s.U2!)),
    ...(k.U21DoubleArc ? [pathFromArc(xf(s.U21!))] : []),
    pathFromArc(xf(s.S2!)),
    pathFromLine(pxf(outerStemTop), pxf(outerStemBottom)),
    pathFromArc(xf(s.S4!)),
    pathFromArc(xf(s.L3!)),
    pathFromLine(pxf(s.LTip), pxf(lowerCutPt)),
    renderEyes ? pathFromArcLongWay(xf(lowerEyeArc)) : pathFromArc(xf(lowerEyeArc)),
    pathFromArc(xf(s.L1!)),
    pathFromArc(xf(s.L2!)),
    ...(k.L21DoubleArc ? [pathFromArc(xf(s.L21!))] : []),
    pathFromArc(xf(s.S3!)),
    pathFromLine(pxf(innerStemBottom), pxf(innerStemTop)),
    pathFromArc(xf(s.S1!)),
    pathFromArc(xf(s.U3!)),
    pathFromLine(pxf(s.UTip), pxf(upperCutPt)),
  ];

  return unifyConnectedSvgPaths(paths);
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
  let outerStemPt = new Pt(f.stem.center.x + f.stem.width / 2, f.stem.center.y);
  let outerStemLine = lineFromPointAndSlope(outerStemPt, stemSlope);
  let innerStemPt = new Pt(f.stem.center.x - f.stem.width / 2, f.stem.center.y);
  let innerStemLine = lineFromPointAndSlope(innerStemPt, stemSlope);

  let stemR = (key: 'S1' | 'S2' | 'S3' | 'S4') => k.stemArcsIndependent ? k[`${key}R`] : k.stemArcR;

  let stemHalf = dist(f.UEye, f.LEye) / 2;
  let stemEdge = (pt: Pt): [Pt, Pt] => [
    new Pt(pt.x - Math.cos(stemAngle) * stemHalf, pt.y - Math.sin(stemAngle) * stemHalf),
    new Pt(pt.x + Math.cos(stemAngle) * stemHalf, pt.y + Math.sin(stemAngle) * stemHalf),
  ];

  // a field cleared mid-edit fails its own section rather than drawing NaN
  let blank = (section: string, unsolved: FholeArcKey[], values: number[]): FholeFailure | null =>
    values.every(Number.isFinite) ? null : { message: `${section}: every field needs a value.`, unsolved, circles: [], segments: [] };

  let shoulderMiss = (
    section: string,
    key: 'U1' | 'L1',
    shoulderR: number,
    eye: Circle,
    shoulderY: number,
    bound: number,
    up: 1 | -1,
    unsolved: FholeArcKey[],
  ): FholeFailure => ({
    message: up * (shoulderY - eye.y) > 0
      ? `${section}: ${key} can't touch the eye and still reach the rise. Reduce Rise, or enlarge ${key}.`
      : `${section}: the rise is too small for ${key} to touch the eye. Increase Rise.`,
    unsolved,
    circles: [new Circle(eye.x, eye.y + up * Math.abs(shoulderR - eye.r), shoulderR)],
    segments: [[new Pt(eye.x - shoulderR, bound), new Pt(eye.x + shoulderR, bound)]],
  });

  // the stem arc wraps `reach` from `side` of the edge, so it can only fail two ways: `reach`
  // already pokes across the edge, or it sits clear and the stem arc is too small to span the gap
  let stemMiss = (
    section: string,
    reachKey: FholeArcKey,
    reach: Circle,
    stemKey: 'S1' | 'S2' | 'S3' | 'S4',
    edge: Line,
    edgePt: Pt,
    edgeName: string,
    side: 1 | -1,
    shrink: string,
  ): FholeFailure => {
    let normal = tangentUnitVectorFromLine(edge);
    let clearance = side * (reach.x * normal.a + (reach.y - edge.y) * normal.b) - reach.r;
    let stemName = k.stemArcsIndependent ? stemKey : 'the stem Arc Radius';
    return {
      message: clearance < 0
        ? `${section}: ${reachKey} crosses the ${edgeName} stem edge before it can turn onto it. ${shrink}, or widen the stem.`
        : `${section}: ${stemKey} can't bridge from ${reachKey} to the ${edgeName} stem edge. Enlarge ${stemName}.`,
      unsolved: [reachKey, stemKey],
      circles: [reach],
      segments: [stemEdge(edgePt)],
    };
  };

  // first the upper curve that connects to the eye
  solveSection(s.failures, 'Upper arm', ['U1', 'U2', 'U21', 'S2'], () => {
    let missing = blank('Upper arm', ['U1', 'U2', 'U21', 'S2'], [k.U1R, k.U1End, k.U2R, stemR('S2'), f.URise, ...(k.U21DoubleArc ? [k.U21R, k.U21Start] : [])]);
    if (missing) return missing;
    let upperArm2 = k.U21DoubleArc ? { r: k.U21R, start: k.U21Start * deg } : null;

    // first we need to determine the placement of the arc that connects to each eye
    let upperBound = f.UEye.y + f.UEye.r + f.URise;
    let upperShoulderY = upperBound - shoulderReach(k.U1R, k.U1End * deg, k.U2R, upperArm2, TURN.quarter);
    let upperShoulderXs = lineCircleIntersectionWithTolerance(
      { m: 0, y: upperShoulderY, x: 0 },
      { x: f.UEye.x, y: f.UEye.y, r: Math.abs(k.U1R - f.UEye.r) },
    );
    if (!upperShoulderXs.length)
      return shoulderMiss('Upper arm', 'U1', k.U1R, f.UEye, upperShoulderY, upperBound, 1, ['U1', 'U2', 'U21', 'S2']);

    let upperShoulder = new Arc(upperShoulderXs[0].x, upperShoulderY, k.U1R);
    let upperShoulderStartPt = circleCircleIntersections(f.UEye, upperShoulder);
    upperShoulder.start = angleFromCenter(upperShoulder, upperShoulderStartPt[0]);
    upperShoulder.end = k.U1End * deg;
    s.U1 = upperShoulder;

    // now continue from the shoulder, we will call this the arm
    let upperArm = inscribeCircleWithinCircle(upperShoulder, k.U2R, upperShoulder.end);
    s.U2 = new Arc(upperArm.x, upperArm.y, upperArm.r, upperShoulder.end, 0);

    // the arc the stem arc has to reach: the arm, or its second half once split
    let upperStemReach = s.U2;
    if (upperArm2) {
      s.U2.end = upperArm2.start;
      let secondArm = inscribeCircleWithinCircle(s.U2, upperArm2.r, upperArm2.start);
      s.U21 = new Arc(secondArm.x, secondArm.y, secondArm.r, upperArm2.start, 0);
      upperStemReach = s.U21;
    }

    let S2 = solveTangentCircleAndLine(outerStemLine, upperStemReach, stemR('S2'), true, 1, f.stem.center);
    if (!S2)
      return upperArm2
        ? stemMiss('Upper arm', 'U21', upperStemReach, 'S2', outerStemLine, outerStemPt, 'outer', 1, 'Shrink U1, U2 or U21')
        : stemMiss('Upper arm', 'U2', upperStemReach, 'S2', outerStemLine, outerStemPt, 'outer', 1, 'Shrink U1 or U2');

    let S2StemIntersect = lineCircleIntersectionWithTolerance(outerStemLine, S2); // we are just kissing the line, sometimes we miss due to floating points
    let S2StemEndAngle = angleFromCenter(S2, S2StemIntersect[0]);

    // tangent by construction, so the join sits on the line of centres: one angle serves both circles
    upperStemReach.end = angleFromCenter(S2, upperStemReach);
    s.S2 = new Arc(S2.x, S2.y, S2.r, upperStemReach.end, S2StemEndAngle);
    return null;
  });

  // now we do the upper wing
  solveSection(s.failures, 'Upper wing', ['U3', 'S1'], () => {
    let missing = blank('Upper wing', ['U3', 'S1'], [k.U3R, k.U3End, k.UCut.angleOnEye, k.UCut.slope, k.UCut.length, stemR('S1')]);
    if (missing) return missing;
    let cutStart = pointOnCircle(f.UEye, k.UCut.angleOnEye * deg);
    let cutVector = vectorFromSlope(k.UCut.slope * deg);
    cutVector.mag = k.UCut.length;
    let cutEnd = moveInVectorSpace(cutStart, [cutVector]);
    s.UTip = cutEnd;
    let cutCircle = placeCircleOnPointAtAngle(k.U3R, cutEnd, k.U3End * deg);

    let S1 = solveTangentCircleAndLine(innerStemLine, cutCircle, stemR('S1'), true, 1, f.stem.center);
    if (!S1)
      return stemMiss('Upper wing', 'U3', cutCircle, 'S1', innerStemLine, innerStemPt, 'inner', 1, 'Shrink U3 or move its tip with Wing and Slope');

    let S1U3Pt = circleCircleIntersections(S1, cutCircle);
    let S1StemIntersect = lineCircleIntersectionWithTolerance(innerStemLine, S1);
    let S1StemEndAngle = angleFromCenter(S1, S1StemIntersect[0]);

    s.U3 = new Arc(cutCircle.x, cutCircle.y, cutCircle.r, angleFromCenter(cutCircle, S1U3Pt[0]), k.U3End * deg);
    s.S1 = new Arc(S1.x, S1.y, S1.r, S1StemEndAngle, angleFromCenter(S1, S1U3Pt[0]));
    return null;
  });

  // now the lower arm, upside down: bound drops below the eye, and the arm meets the inner stem
  solveSection(s.failures, 'Lower arm', ['L1', 'L2', 'L21', 'S3'], () => {
    let missing = blank('Lower arm', ['L1', 'L2', 'L21', 'S3'], [k.L1R, k.L1End, k.L2R, stemR('S3'), f.LRise, ...(k.L21DoubleArc ? [k.L21R, k.L21Start] : [])]);
    if (missing) return missing;
    let lowerArm2 = k.L21DoubleArc ? { r: k.L21R, start: k.L21Start * deg } : null;

    let lowerBound = f.LEye.y - f.LEye.r - f.LRise;
    let lowerShoulderY = lowerBound + shoulderReach(k.L1R, k.L1End * deg, k.L2R, lowerArm2, -TURN.quarter);
    let lowerShoulderXs = lineCircleIntersectionWithTolerance(
      { m: 0, y: lowerShoulderY, x: 0 },
      { x: f.LEye.x, y: f.LEye.y, r: Math.abs(k.L1R - f.LEye.r) },
    );
    if (!lowerShoulderXs.length)
      return shoulderMiss('Lower arm', 'L1', k.L1R, f.LEye, lowerShoulderY, lowerBound, -1, ['L1', 'L2', 'L21', 'S3']);

    // a tangent miss comes back as one point, so the far side falls back to it
    let lowerShoulder = new Arc((lowerShoulderXs[1] ?? lowerShoulderXs[0]).x, lowerShoulderY, k.L1R);
    let lowerShoulderStartPt = circleCircleIntersections(f.LEye, lowerShoulder);
    lowerShoulder.start = angleFromCenter(lowerShoulder, lowerShoulderStartPt[0]);
    lowerShoulder.end = k.L1End * deg;
    s.L1 = lowerShoulder;

    let lowerArm = inscribeCircleWithinCircle(lowerShoulder, k.L2R, lowerShoulder.end);
    s.L2 = new Arc(lowerArm.x, lowerArm.y, lowerArm.r, lowerShoulder.end, 0);

    let lowerStemReach = s.L2;
    if (lowerArm2) {
      s.L2.end = lowerArm2.start;
      let secondArm = inscribeCircleWithinCircle(s.L2, lowerArm2.r, lowerArm2.start);
      s.L21 = new Arc(secondArm.x, secondArm.y, secondArm.r, lowerArm2.start, 0);
      lowerStemReach = s.L21;
    }

    let S3 = solveTangentCircleAndLine(innerStemLine, lowerStemReach, stemR('S3'), true, -1, f.stem.center);
    if (!S3)
      return lowerArm2
        ? stemMiss('Lower arm', 'L21', lowerStemReach, 'S3', innerStemLine, innerStemPt, 'inner', -1, 'Shrink L1, L2 or L21')
        : stemMiss('Lower arm', 'L2', lowerStemReach, 'S3', innerStemLine, innerStemPt, 'inner', -1, 'Shrink L1 or L2');

    let S3StemIntersect = lineCircleIntersectionWithTolerance(innerStemLine, S3);
    let S3StemEndAngle = angleFromCenter(S3, S3StemIntersect[0]);

    lowerStemReach.end = angleFromCenter(S3, lowerStemReach);
    s.S3 = new Arc(S3.x, S3.y, S3.r, lowerStemReach.end, S3StemEndAngle);
    return null;
  });

  // now the lower wing, which connects to the outer stem
  solveSection(s.failures, 'Lower wing', ['L3', 'S4'], () => {
    let missing = blank('Lower wing', ['L3', 'S4'], [k.L3R, k.L3End, k.LCut.angleOnEye, k.LCut.slope, k.LCut.length, stemR('S4')]);
    if (missing) return missing;
    let cutStart = pointOnCircle(f.LEye, k.LCut.angleOnEye * deg);
    let cutVector = vectorFromSlope(k.LCut.slope * deg);
    cutVector.mag = k.LCut.length;
    let cutEnd = moveInVectorSpace(cutStart, [cutVector]);
    s.LTip = cutEnd;
    let cutCircle = placeCircleOnPointAtAngle(k.L3R, cutEnd, k.L3End * deg);

    let S4 = solveTangentCircleAndLine(outerStemLine, cutCircle, stemR('S4'), true, -1, f.stem.center);
    if (!S4)
      return stemMiss('Lower wing', 'L3', cutCircle, 'S4', outerStemLine, outerStemPt, 'outer', -1, 'Shrink L3 or move its tip with Wing and Slope');

    let S4L3Pt = circleCircleIntersections(S4, cutCircle);
    let S4StemIntersect = lineCircleIntersectionWithTolerance(outerStemLine, S4);
    let S4StemEndAngle = angleFromCenter(S4, S4StemIntersect[0]);

    s.L3 = new Arc(cutCircle.x, cutCircle.y, cutCircle.r, angleFromCenter(cutCircle, S4L3Pt[0]), k.L3End * deg);
    s.S4 = new Arc(S4.x, S4.y, S4.r, S4StemEndAngle, angleFromCenter(S4, S4L3Pt[0]));
    return null;
  });

  // a half-solved hole won't close
  if (!s.failures.length) s.path = fholePath(p, s, false);
  return s;
}

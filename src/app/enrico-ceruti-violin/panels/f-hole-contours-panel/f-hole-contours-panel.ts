import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, FholeCut, FholeEnd, FholeParams, FholeStem, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderLine, renderPath, renderPointHalo } from '../../../helpers/renderFuncs';
import { ensureOuterTracePaths, calculateOuterArcs, getPath, getPathOrNull } from '../../ceruti-calcs';
import { adjustArcEnd, getArcEndDeg, getArcStartDeg, setArcEndDeg, setArcStartDeg } from '../../../helpers/arcDegrees';
import { fholeArmCompoundInfo, fholeCutInfo } from '../../ceruti-helpers';
import { defaultFHolePlacement, renderFholePlacementGuides } from '../f-hole-placement-panel/f-hole-placement-panel';
import { angleFromCenter, arcBetweenTravels, arcContinuingFrom, arcTangentToLine, normalizeRadians, pointOnCircle, signedArcSweep, solveCircumscribedCircleAlongAxis } from '../../../helpers/draftMath';
import { travelAtArcEnd, travelAtArcStart } from '../../../helpers/draftMath';
import { Circle, Pt, Arc } from '../../../models/types';
import { error } from '../../../shared/message-emitter';
import { HighlightedArc, HighlightedPoint } from '../../renders/render-constants';

// `<end>.<part>` — the path the template binds through, so a highlight can't name a different
// field than the one focused. `tip` takes a point halo; the rest take an arc halo.
export type FholeArcPart = 'shoulder' | 'arm' | 'arm2' | 'wing';
export type FholeHighlightKey = `${'upper' | 'lower'}.${FholeArcPart | 'cut'}`;

// eyes/stem placement is the placement panel's job; this page only bends what runs between
@Component({
  selector: 'app-ceruti-f-hole-contours-panel',
  imports: [FormsModule],
  templateUrl: './f-hole-contours-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class FHoleContoursPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleGuides', 'showModuleArcs'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly adjustArcEnd = adjustArcEnd;
  protected readonly getArcStartDeg = getArcStartDeg;
  protected readonly setArcStartDeg = setArcStartDeg;
  protected readonly getArcEndDeg = getArcEndDeg;
  protected readonly setArcEndDeg = setArcEndDeg;
  protected readonly fholeArmCompoundInfo = fholeArmCompoundInfo;
  protected readonly fholeCutInfo = fholeCutInfo;

  // held as a key rather than the Arc itself: calculateFholeContours rebuilds every arc on each
  // pass, so an object captured on focus is stale by the time it would be drawn
  private highlightedKey: FholeHighlightKey | null = null;

  onArcFocus(key: FholeHighlightKey): void {
    this.highlightedKey = key;
    this.emitImmediate(false);
  }

  onArcBlur(): void {
    this.highlightedKey = null;
    this.emitImmediate(false);
  }

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  // splits/rejoins the arm; the pair shares out the single arc's turn so the contour barely moves
  onCompoundChange(end: 'upper' | 'lower'): void {
    let E = this.params.fHoles![end];

    if (E.shoulder && E.arm) {
      let turn = (E.arm.end - E.arm.start) + (E.arm2 ? E.arm2.end - E.arm2.start : 0);
      let compound = end === 'upper' ? this.params.options.FUArmDoubleArc : this.params.options.FLArmDoubleArc;
      let share = compound ? FArmSplitShare : 1;

      // only radius and sweep are read back — where the new arc sits is solved from the one before
      E.arm.end = E.arm.start + turn * share;
      E.arm2 = compound ? new Arc(E.arm.x, E.arm.y, E.arm.r * FArmSplitStep, 0, turn * (1 - share)) : null;
    }

    this.emitImmediate();
  }

  /** Stored in radians like the geometry, typed in degrees like the fields. */
  getCutDeg(cut: FholeCut, key: string): number {
    return Math.round(cut[key]! * 180 / Math.PI);
  }

  setCutDeg(cut: FholeCut, key: string, degrees: number): void {
    if (typeof degrees !== 'number') return;
    cut[key] = degrees * Math.PI / 180;
    this.onChange();
  }

  public buildRun(): RenderLayer[] {
    let p = this.params;
    calculateOuterArcs(p);
    ensureOuterTracePaths(p, this.paths);
    p.fHoles ??= defaultFHolePlacement(p);

    let renders: RenderLayer[] = [
      renderPath(getPath(this.paths, 'top'), this.colors.outerTrace),
    ];

    let purflingPath = getPathOrNull(this.paths, 'purfling');
    let outerPurflingPath = getPathOrNull(this.paths, 'outerPurfling');

    if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
    if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));

    calculateFholeContours(p);

    // a tip is a point rather than an arc, both take their colour from the end they're drawn at
    let key = this.highlightedKey;
    let [end, part] = key ? key.split('.') as ['upper' | 'lower', FholeArcPart | 'cut'] : [null, null];
    let color = key ? fholeZoneColor(key, this.colors) : '';
    // the cut has no arc of its own, so it shows the tip its three numbers place
    let tip = part === 'cut' ? { point: p.fHoles![end!].tip!, color } : null;
    let arc = end && part !== 'cut' ? p.fHoles![end][part!] : null;

    if (this.flags.showModuleGuides) renders.push(renderFholePlacementGuides(p, this.colors));
    renders.push(renderFholeContours(p, this.colors, this.flags.showModuleArcs, arc ? { arc, color } : null, tip));

    return renders;
  }
}


// eyes/stem placement is the placement panel's solve; these read it without moving it, seeded
// from the stored arcs so a hole the user has shaped re-solves to what they shaped

// one edge of the hole in the order it is drawn, but split across the two ends it passes through,
// since that is how the parameters are stored. an edge springs from one end and reaches the other
type FholeEdge = {
  shoulder: Arc; arm: Arc; arm2: Arc | null;
  landing: Arc | null; flare: Arc | null; wing: Arc;
};

// default proportions, off a traced Amati. each radius runs against what came before it, and a
// wing takes the arm ratio of the end it is drawn beside. the lower end runs wider than the upper
const FShtoEye = 5 / 2;
const FUArmtoSh = 9 / 8;
const FLArmtoSh = 6 / 5;

// the turn an arm takes, and each wing's boundary angles on the plate. the wings reach past
// different eyes, so neither is the other's mirror
const FArmTurn = 1 / 3 * Math.PI;
const FUWingStart = 1 / 9 * Math.PI;
const FUWingEnd = 4 / 9 * Math.PI;
const FLWingStart = -31 / 36 * Math.PI;
const FLWingEnd = -19 / 36 * Math.PI;

// the compound arm: the share of the turn the first arc keeps, and how much wider the second runs
const FArmSplitShare = 2 / 3;
const FArmSplitStep = 3 / 2;

// the ratios above are the plain arm's, so splitting shrinks the first of the pair — the two
// average back out over the same total turn, so a hole drawn either way starts the same shape
const FArmSplitR = 1 / (FArmSplitShare + FArmSplitStep * (1 - FArmSplitShare));

// the cut a hole starts with: a third of a turn round the eye from the axis, one eye radius out to
// the tip. the lower end's is the same line walked the other way
const FCutAt = 2 / 3 * Math.PI;
const FUCutSlope = 1 / 3 * Math.PI;
const FLCutSlope = -2 / 3 * Math.PI;
const FCuttoEye = 1;

// `at` turns round the eye from the ray toward the other eye, keeping the foot in place as the
// eyes move; `slope` reads straight off the plate, so sliding the foot doesn't swing the cut
export function cutRay(eye: Circle, toward: Pt, cut: FholeCut): { foot: Pt; travel: number } {
  let at = Math.atan2(toward.y - eye.y, toward.x - eye.x) + cut.angleOnEye!;
  return { foot: pointOnCircle(eye, at), travel: cut.slope! };
}

/** The cut's far end — where the wing has to come to a point. */
export function cutTip(eye: Circle, toward: Pt, cut: FholeCut): Pt {
  let { foot, travel } = cutRay(eye, toward, cut);
  return new Pt(foot.x + cut.length! * Math.cos(travel), foot.y + cut.length! * Math.sin(travel));
}

// the stretch of the eye's rim the outline runs along, tangent point to cut — the rest of the
// circle is inside the hole, so drawing it whole would read as a construction circle
export function eyeArc(end: FholeEnd, other: FholeEnd): Arc {
  let eye = end.eye!;
  // the shoulder is tangent inside its own eye, so its start point is the join, on both rims
  let join = pointOnCircle(end.shoulder!, end.shoulder!.start);
  return new Arc(eye.x, eye.y, eye.r,
    Math.atan2(join.y - eye.y, join.x - eye.x),
    angleFromCenter(eye, other.eye!) + end.cut!.angleOnEye!);
}

// one edge: an arm off `springEnd`'s eye, over its rise bound, onto a stem edge, then a wing to
// `reachEnd`'s tip. `side` (+1/-1) is the only difference between the two edges.
function solveFholeEdge(
  stem: FholeStem, springEnd: FholeEnd, reachEnd: FholeEnd, side: 1 | -1, compound: boolean,
): FholeEdge {
  let eye = springEnd.eye!;
  let rise = springEnd.rise!;
  let bound = eye.y + side * (eye.r + rise);

  // a wing takes the arm ratio of the end it's drawn beside, not the one its edge sprang from
  let armToSh = side > 0 ? FUArmtoSh : FLArmtoSh;
  let wingToSh = side > 0 ? FLArmtoSh : FUArmtoSh;
  let wingStart = side > 0 ? FLWingStart : FUWingStart;
  let wingEnd = side > 0 ? FLWingEnd : FUWingEnd;

  // shoulder is tangent to both eye and bound; below eye.r + rise/2 the solve has no root
  let shoulderR = springEnd.shoulder?.r ?? eye.r * FShtoEye;
  if (shoulderR < eye.r + rise / 2) {
    error('The shoulder is too tight to carry the outline from the eye out to its bound. Give it a larger radius, or take the rise down.', 'F-Hole Shoulder Too Tight');
    shoulderR = eye.r + rise / 2;
  }

  let shoulderY = bound - side * shoulderR;
  let shoulderX = solveCircumscribedCircleAlongAxis(eye, shoulderR, 'y', shoulderY, side > 0);

  let shoulder = new Arc(shoulderX, shoulderY, shoulderR, 0, side * Math.PI / 2); // end at the apex, on the bound
  shoulder.start = angleFromCenter(shoulder, eye); // tangent point, on the line of centers

  // each arm continues tangent from the last; sweep carries the shoulder's own turn sign
  let turn = Math.sign(signedArcSweep(shoulder));
  let sweepOf = (a: Arc | null | undefined, fallback: number) => a ? a.end - a.start : turn * fallback;

  // a third of a turn leaves the arm room to spare for the landing that follows it
  let armR = shoulderR * armToSh;

  let arm = arcContinuingFrom(
    pointOnCircle(shoulder, shoulder.end), travelAtArcEnd(shoulder),
    springEnd.arm?.r ?? armR * (compound ? FArmSplitR : 1),
    sweepOf(springEnd.arm, compound ? FArmTurn * FArmSplitShare : FArmTurn));

  // most arms take one bend the whole way down, so the second half exists only on the split
  let arm2 = compound ? arcContinuingFrom(
    pointOnCircle(arm, arm.end), travelAtArcEnd(arm),
    springEnd.arm2?.r ?? armR * FArmSplitR * FArmSplitStep,
    sweepOf(springEnd.arm2, FArmTurn * (1 - FArmSplitShare))) : null;

  let lastArm = arm2 ?? arm;

  // landing has no radius of its own; each edge crosses the near stem line and settles on the far
  // one, so the slot ends up between the two contours rather than off to one side of both
  let approach = Math.sign(Math.cos(travelAtArcEnd(shoulder)));
  let stemEdge = new Pt(stem.center!.x + approach * stem.width! / 2, stem.center!.y);
  // each edge runs the stem toward the other eye, so it travels the stem line backwards
  let stemDir = new Pt(-side * Math.cos(stem.angle!), -side * Math.sin(stem.angle!));

  let landing = arcTangentToLine(
    pointOnCircle(lastArm, lastArm.end), travelAtArcEnd(lastArm), stemEdge, stemDir);
  if (!landing)
    error('The arm turns too far to settle onto the stem. Take the arm sweep down, or bring the stem toward the eye.', 'F-Hole Arm Misses the Stem');

  // wing is placed outright (radius + two boundary angles), hung off the tip
  let wing = new Arc(0, 0, reachEnd.wing?.r ?? reachEnd.eye!.r * FShtoEye * wingToSh,
    reachEnd.wing?.start ?? wingStart,
    reachEnd.wing?.end ?? wingEnd);
  wing.x = reachEnd.tip!.x - wing.r * Math.cos(wing.end);
  wing.y = reachEnd.tip!.y - wing.r * Math.sin(wing.end);

  // flares back onto the wing past the stem; the wing stands even if the flare can't reach it
  let flare = landing && arcBetweenTravels(
    pointOnCircle(landing, landing.end), travelAtArcEnd(landing),
    pointOnCircle(wing, wing.start), travelAtArcStart(wing));
  if (landing && !flare)
    error('The contour runs past the wing before it can flare onto it. Take the wing span down, or bring its tip in toward the stem.', 'F-Hole Wing Out of Reach');

  return { shoulder, arm, arm2, landing, flare: flare ? flare.arc : null, wing };
}


export function calculateFholeContours(p: EnricoCerutiParams): void {
  let f = p.fHoles!;

  // tip is the far end of the cut, solved afresh each pass from the cut's own three numbers
  f.upper.cut ??= { angleOnEye: FCutAt, slope: FUCutSlope, length: f.upper.eye!.r * FCuttoEye };
  f.lower.cut ??= { angleOnEye: FCutAt, slope: FLCutSlope, length: f.lower.eye!.r * FCuttoEye };

  f.upper.tip = cutTip(f.upper.eye!, f.lower.eye!, f.upper.cut);
  f.lower.tip = cutTip(f.lower.eye!, f.upper.eye!, f.lower.cut);

  // each edge stays on one side of the stem: upper's is the outer side to the lower tip, lower's
  // is the inner side to the upper tip — where inner/outer as names come from
  let outer = solveFholeEdge(f.stem, f.upper, f.lower, 1, !!p.options.FUArmDoubleArc);
  let inner = solveFholeEdge(f.stem, f.lower, f.upper, -1, !!p.options.FLArmDoubleArc);

  // both read the stored arcs as seeds, so nothing is written back until both have been solved
  f.upper.shoulder = outer.shoulder;
  f.upper.arm = outer.arm;
  f.upper.arm2 = outer.arm2;
  f.upper.wing = inner.wing;

  f.lower.shoulder = inner.shoulder;
  f.lower.arm = inner.arm;
  f.lower.arm2 = inner.arm2;
  f.lower.wing = outer.wing;

  f.stem.outerUpper = outer.landing;
  f.stem.outerLower = outer.flare;
  f.stem.innerLower = inner.landing;
  f.stem.innerUpper = inner.flare;
}

/** The two edges as drawn, reassembled from where their pieces are stored — each with the colour of
 * the end its arm springs from and the "off" colour of the end its wing reaches. */
function drawnEdges(f: FholeParams, colors: CerutiColors): [FholeEdge, string, string][] {
  return [
    [{ shoulder: f.upper.shoulder!, arm: f.upper.arm!, arm2: f.upper.arm2,
       landing: f.stem.outerUpper, flare: f.stem.outerLower, wing: f.lower.wing! },
     colors.fHoleUpper, colors.fHoleLowerOff],
    [{ shoulder: f.lower.shoulder!, arm: f.lower.arm!, arm2: f.lower.arm2,
       landing: f.stem.innerLower, flare: f.stem.innerUpper, wing: f.upper.wing! },
     colors.fHoleLower, colors.fHoleUpperOff],
  ];
}

/** Which colour a field belongs to: its own end's, the greyed variant for a wing (the far edge's,
 * but drawn at this end), and the cut's own colour for the cut. */
export function fholeZoneColor(key: FholeHighlightKey, colors: CerutiColors): string {
  let [end, part] = key.split('.');
  if (part === 'cut') return end === 'upper' ? colors.fHoleCutUpper : colors.fHoleCutLower;
  return end === 'upper'
    ? (part === 'wing' ? colors.fHoleUpperOff : colors.fHoleUpper)
    : (part === 'wing' ? colors.fHoleLowerOff : colors.fHoleLower);
}

export const renderFholeContours = (
  p: EnricoCerutiParams,
  colors: CerutiColors,
  showArcs: boolean,
  highlighted: HighlightedArc | null,
  highlightedPoint: HighlightedPoint | null,
) => (g: any, ui: any): void => {
  let f = p.fHoles!;

  if (highlighted) renderArcHalo(highlighted.arc, highlighted.color)(g, ui);
  if (highlightedPoint) renderPointHalo(highlightedPoint.point, highlightedPoint.color)(g, ui);

  // the fancy form adds an arc's centre and its two radii, which is worth the clutter only where
  // there is a radius field to turn
  const drawArc = (a: Arc, color: string, shaped: boolean) => showArcs && shaped
    ? renderArcFromArcFancy(a, color)
    : renderArcFromArc(a, color, 2);

  for (let [e, armColor, wingColor] of drawnEdges(f, colors)) {
    // the two stem arcs are solved off the stem line, so they read as stem rather than as either
    // end — greyed, and drawn plain whatever the arcs toggle says
    let inOrder: [Arc | null, string, boolean][] = [
      [e.shoulder, armColor, true], [e.arm, armColor, true], [e.arm2, armColor, true],
      [e.landing, colors.fHoleStemOff, false], [e.flare, colors.fHoleStemOff, false],
      [e.wing, wingColor, true],
    ];

    for (let [a, color, shaped] of inOrder) if (a) drawArc(a, color, shaped)(g, ui);

    // the run along a stem edge is the only straight part of either contour, so it gets its own
    if (e.landing && e.flare)
      renderLine(pointOnCircle(e.landing, e.landing.end), pointOnCircle(e.flare, e.flare.start), colors.fHoleStem, 2)(g, ui);
  }

  // the cut closes each end of the outline: out of the eye to the tip, where the wing meets it. the
  // tip carries no mark of its own — it is where three other numbers land
  for (let [end, other, color, eyeColor] of [
    [f.upper, f.lower, colors.fHoleCutUpper, colors.fHoleUpper],
    [f.lower, f.upper, colors.fHoleCutLower, colors.fHoleLower],
  ] as const) {
    renderLine(cutRay(end.eye!, other.eye!, end.cut!).foot, end.tip!, color, 2)(g, ui);

    // longArc picks whichever of the two arcs is the counter-clockwise one, so moving the cut
    // round the eye slides the join rather than flipping which side of the rim is drawn
    let rim = eyeArc(end, other);
    renderArcFromArc(rim, eyeColor, 2, normalizeRadians(rim.end - rim.start) > Math.PI)(g, ui);
  }
}

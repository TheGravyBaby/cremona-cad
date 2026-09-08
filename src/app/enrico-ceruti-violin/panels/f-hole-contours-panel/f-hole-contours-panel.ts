import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, FholeCut, FholeParams, FholeStem, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderLine, renderPath, renderPointHalo } from '../../../helpers/renderFuncs';
import { ensureOuterTracePaths, calculateOuterArcs, getPath, getPathOrNull } from '../../ceruti-calcs';
import { getArcEndDeg, setArcEndDeg } from '../../../helpers/arcDegrees';
import { fholeCutInfo, fholeShoulderExtendInfo } from '../../ceruti-helpers';
import { defaultFHolePlacement, renderFholePlacementGuides } from '../f-hole-placement-panel/f-hole-placement-panel';
import { angleForBridgeRadius, angleFromCenter, arcBetweenTravels, arcContinuingFrom, arcTangentToLine, normalizeRadians, pointOnCircle, signedArcSweep, solveCircumscribedCircleAlongAxis, sweepForTangentLineRadius } from '../../../helpers/draftMath';
import { travelAtArcEnd, travelAtArcStart } from '../../../helpers/draftMath';
import { Circle, Pt, Arc } from '../../../models/types';
import { error } from '../../../shared/message-emitter';
import { HighlightedArc, HighlightedPoint } from '../../renders/render-constants';

// UCut/LCut take a point halo; the rest take an arc halo
export type FholeHighlightKey = 'O1' | 'O2' | 'O3' | 'O4' | 'O5' | 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'UCut' | 'LCut';

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

  protected readonly getArcEndDeg = getArcEndDeg;
  protected readonly setArcEndDeg = setArcEndDeg;
  protected readonly fholeShoulderExtendInfo = fholeShoulderExtendInfo;
  protected readonly fholeCutInfo = fholeCutInfo;

  // held as a key rather than the Arc itself: calculateFholeContours rebuilds every arc on each
  // pass, so an object captured on focus is stale by the time it would be drawn
  private highlightedKey: FholeHighlightKey | null = null;
  private highlightedColor = '';

  onArcFocus(key: FholeHighlightKey, color: string): void {
    this.highlightedKey = key;
    this.highlightedColor = color;
    this.emitImmediate(false);
  }

  onArcBlur(): void {
    this.highlightedKey = null;
    this.highlightedColor = '';
    this.emitImmediate(false);
  }

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  // degrees the shoulder runs past its own apex (the bound-tangent point) — 0 stops there, as
  // every shoulder always did before this field existed. Sign reads as "further along the turn
  // the shoulder is already making", independent of which end's sign convention that is.
  getShoulderExtendDeg(shoulder: Arc, side: 1 | -1): number {
    let turn = Math.sign(signedArcSweep(shoulder));
    return Math.round(turn * (shoulder.end - side * Math.PI / 2) * 180 / Math.PI);
  }

  setShoulderExtendDeg(shoulder: Arc, side: 1 | -1, degrees: number): void {
    if (typeof degrees !== 'number') return;
    let turn = Math.sign(signedArcSweep(shoulder));
    shoulder.end = side * Math.PI / 2 + turn * degrees * Math.PI / 180;
    this.onChange();
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

    let key = this.highlightedKey;
    let color = this.highlightedColor;
    // UCut/LCut have no arc of their own, so they show the tip their three numbers place
    let tip =
      key === 'UCut' ? { point: p.fHoles!.UTip!, color } :
      key === 'LCut' ? { point: p.fHoles!.LTip!, color } :
      null;
    let arc: Arc | null = key && key !== 'UCut' && key !== 'LCut' ? p.fHoles![key] : null;

    if (this.flags.showModuleGuides) renders.push(renderFholePlacementGuides(p, this.colors));
    renders.push(renderFholeContours(p, this.colors, this.flags.showModuleArcs, arc ? { arc, color } : null, tip));

    return renders;
  }
}


// eyes/stem placement is the placement panel's solve; these read it without moving it, seeded
// from the stored arcs so a hole the user has shaped re-solves to what they shaped

// one edge, in drawing order: shoulder, arm, stem-tangent arc, stem-flare arc, wing
type FholeEdge = {
  shoulder: Arc; arm: Arc;
  landing: Arc | null; flare: Arc | null; wing: Arc;
};

// same 5 slots as read in on entry — nullable, since a fresh hole has solved none of them yet
type FholeEdgeSeed = {
  shoulder: Arc | null; arm: Arc | null;
  landing: Arc | null; flare: Arc | null; wing: Arc | null;
};

// default proportions, off a traced Amati. each radius runs against what came before it, and a
// wing takes the arm ratio of the end it is drawn beside. the lower end runs wider than the upper
const FShtoEye = 5 / 2;
const FUArmtoSh = 9 / 8;
const FLArmtoSh = 6 / 5;

// the turn a fresh arm takes before it has ever solved a landing — only the bootstrap first pass
// uses this; every pass after reads the arm's sweep back from the stem-arc radius instead
const FArmTurn = 1 / 3 * Math.PI;

// each wing's boundary angles on the plate. the wings reach past different eyes, so neither is
// the other's mirror
const FUWingStart = 1 / 9 * Math.PI;
const FUWingEnd = 4 / 9 * Math.PI;
const FLWingStart = -31 / 36 * Math.PI;
const FLWingEnd = -19 / 36 * Math.PI;

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
export function eyeArc(eye: Circle, shoulder: Arc, otherEye: Circle, cut: FholeCut): Arc {
  // the shoulder is tangent inside its own eye, so its start point is the join, on both rims
  let join = pointOnCircle(shoulder, shoulder.start);
  return new Arc(eye.x, eye.y, eye.r,
    Math.atan2(join.y - eye.y, join.x - eye.x),
    angleFromCenter(eye, otherEye) + cut.angleOnEye!);
}

// one edge: a shoulder off `springEye`'s rim, over its rise bound, an arm onto a stem edge, then
// a wing to `reachTip`. `side` (+1/-1) is the only difference between the two edges.
function solveFholeEdge(
  stem: FholeStem, side: 1 | -1,
  springEye: Circle, springRise: number, seed: FholeEdgeSeed,
  reachEye: Circle, reachTip: Pt,
): FholeEdge {
  let bound = springEye.y + side * (springEye.r + springRise);

  // a wing takes the arm ratio of the end it's drawn beside, not the one its edge sprang from
  let armToSh = side > 0 ? FUArmtoSh : FLArmtoSh;
  let wingToSh = side > 0 ? FLArmtoSh : FUArmtoSh;
  let wingStart = side > 0 ? FLWingStart : FUWingStart;
  let wingEnd = side > 0 ? FLWingEnd : FUWingEnd;

  // shoulder is tangent to both eye and bound; below eye.r + rise/2 the solve has no root
  let shoulderR = seed.shoulder?.r ?? springEye.r * FShtoEye;
  if (shoulderR < springEye.r + springRise / 2) {
    error('The shoulder is too tight to carry the outline from the eye out to its bound. Give it a larger radius, or take the rise down.', 'F-Hole Shoulder Too Tight');
    shoulderR = springEye.r + springRise / 2;
  }

  let shoulderY = bound - side * shoulderR;
  let shoulderX = solveCircumscribedCircleAlongAxis(springEye, shoulderR, 'y', shoulderY, side > 0);

  // end is sticky past the apex — the point where the shoulder's tangent is horizontal, on the
  // bound. historically the arm-to-shoulder transition often isn't exactly there, and letting the
  // same circle run on past it (rather than handing off to a separately-radiused arm right at the
  // apex) is usually the better read of that: see getShoulderExtendDeg/setShoulderExtendDeg.
  let shoulder = new Arc(shoulderX, shoulderY, shoulderR, 0, seed.shoulder?.end ?? side * Math.PI / 2);
  shoulder.start = angleFromCenter(shoulder, springEye); // tangent point, on the line of centers

  let turn = Math.sign(signedArcSweep(shoulder));
  let armR = seed.arm?.r ?? shoulderR * armToSh;

  let approach = Math.sign(Math.cos(travelAtArcEnd(shoulder)));
  let stemEdge = new Pt(stem.center!.x + approach * stem.width! / 2, stem.center!.y);
  // each edge runs the stem toward the other eye, so it travels the stem line backwards
  let stemDir = new Pt(-side * Math.cos(stem.angle!), -side * Math.sin(stem.angle!));

  let armEntry = pointOnCircle(shoulder, shoulder.end);
  let armEntryTravel = travelAtArcEnd(shoulder);

  // the stem arc's radius is the free choice now, seeded from this edge's own last-solved landing.
  // the arm's sweep is what used to be free — solved instead, so it lands exactly on that radius.
  let arm: Arc;
  if (seed.landing?.r != null) {
    let sweep = sweepForTangentLineRadius(armEntry, armEntryTravel, armR, turn as 1 | -1, stemEdge, stemDir, seed.landing.r);
    if (sweep == null) {
      error('No arm sweep reaches a stem arc of this radius. Try a different arm radius, stem-arc radius, or stem position.', 'F-Hole Arm Misses the Stem');
      sweep = turn * FArmTurn;
    }
    arm = arcContinuingFrom(armEntry, armEntryTravel, armR, sweep);
  } else {
    // nothing solved yet — the very first pass a fresh hole ever takes
    arm = arcContinuingFrom(armEntry, armEntryTravel, armR, turn * FArmTurn);
  }

  let landing = arcTangentToLine(pointOnCircle(arm, arm.end), travelAtArcEnd(arm), stemEdge, stemDir);
  if (!landing)
    error('The arm turns too far to settle onto the stem. Take the arm radius down, or bring the stem toward the eye.', 'F-Hole Arm Misses the Stem');

  // wing's own shape (radius + far boundary, hung off the tip) is placed outright; its near
  // boundary — where the flare lands on it — is what moves from a stored angle to wherever the
  // stem radius below requires
  let wing = new Arc(0, 0, seed.wing?.r ?? reachEye.r * FShtoEye * wingToSh, 0,
    seed.wing?.end ?? wingEnd);
  wing.x = reachTip.x - wing.r * Math.cos(wing.end);
  wing.y = reachTip.y - wing.r * Math.sin(wing.end);

  // the far stem arc — flaring off the straight run onto the wing — gets a free radius the same
  // way the near one (landing) does, seeded from wherever it last landed
  let wingTurn = (side > 0 ? Math.sign(FLWingEnd - FLWingStart) : Math.sign(FUWingEnd - FUWingStart)) as 1 | -1;

  let flare: { run: number; arc: Arc } | null = null;
  if (landing) {
    let landingEnd = pointOnCircle(landing, landing.end);
    let landingTravel = travelAtArcEnd(landing);

    if (seed.flare?.r != null) {
      let theta: number | null = null;
      for (let trySign of [wingTurn, -wingTurn as 1 | -1]) {
        let candidate = angleForBridgeRadius(landingEnd, landingTravel, wing, trySign, seed.flare.r);
        // only counts if the wing would still turn its historical way from this point to its end
        if (candidate != null && Math.sign(signedArcSweep(new Arc(0, 0, 0, candidate, wing.end))) === wingTurn) {
          theta = candidate;
          break;
        }
      }
      if (theta == null) {
        error('No point on the wing reaches a stem radius this size. Try a different stem radius, or bring the wing tip in.', 'F-Hole Wing Out of Reach');
        theta = wingStart;
      }
      wing.start = theta;
    } else {
      // nothing solved yet — the very first pass a fresh hole ever takes
      wing.start = wingStart;
    }

    flare = arcBetweenTravels(landingEnd, landingTravel, pointOnCircle(wing, wing.start), travelAtArcStart(wing));
    if (!flare)
      error('The contour runs past the wing before it can flare onto it. Take the wing span down, or bring its tip in toward the stem.', 'F-Hole Wing Out of Reach');
  } else {
    wing.start = wingStart;
  }

  return { shoulder, arm, landing, flare: flare ? flare.arc : null, wing };
}


export function calculateFholeContours(p: EnricoCerutiParams): void {
  let f = p.fHoles!;

  // tip is the far end of the cut, solved afresh each pass from the cut's own three numbers
  f.UCut ??= { angleOnEye: FCutAt, slope: FUCutSlope, length: f.UEye!.r * FCuttoEye };
  f.LCut ??= { angleOnEye: FCutAt, slope: FLCutSlope, length: f.LEye!.r * FCuttoEye };

  f.UTip = cutTip(f.UEye!, f.LEye!, f.UCut);
  f.LTip = cutTip(f.LEye!, f.UEye!, f.LCut);

  let outer = solveFholeEdge(f.stem, 1, f.UEye!, f.URise!,
    { shoulder: f.O1, arm: f.O2, landing: f.O3, flare: f.O4, wing: f.O5 },
    f.LEye!, f.LTip);
  let inner = solveFholeEdge(f.stem, -1, f.LEye!, f.LRise!,
    { shoulder: f.I1, arm: f.I2, landing: f.I3, flare: f.I4, wing: f.I5 },
    f.UEye!, f.UTip);

  // both read the stored arcs as seeds, so nothing is written back until both have been solved
  f.O1 = outer.shoulder; f.O2 = outer.arm; f.O3 = outer.landing; f.O4 = outer.flare; f.O5 = outer.wing;
  f.I1 = inner.shoulder; f.I2 = inner.arm; f.I3 = inner.landing; f.I4 = inner.flare; f.I5 = inner.wing;
}

/** The two edges as drawn, reassembled from their flat fields — each with the colour of the eye
 * it springs from and the "off" colour of the eye its wing reaches. */
function drawnEdges(f: FholeParams, colors: CerutiColors): [FholeEdge, string, string][] {
  return [
    [{ shoulder: f.O1!, arm: f.O2!, landing: f.O3, flare: f.O4, wing: f.O5! }, colors.fHoleUpper, colors.fHoleLowerOff],
    [{ shoulder: f.I1!, arm: f.I2!, landing: f.I3, flare: f.I4, wing: f.I5! }, colors.fHoleLower, colors.fHoleUpperOff],
  ];
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
    // landing and flare are both stem-arc fields now — fancy, greyed as stem rather than either end
    let inOrder: [Arc | null, string, boolean][] = [
      [e.shoulder, armColor, true], [e.arm, armColor, true],
      [e.landing, colors.fHoleStemOff, true], [e.flare, colors.fHoleStemOff, true],
      [e.wing, wingColor, true],
    ];

    for (let [a, color, shaped] of inOrder) if (a) drawArc(a, color, shaped)(g, ui);

    // the run along a stem edge is the only straight part of either contour, so it gets its own
    if (e.landing && e.flare)
      renderLine(pointOnCircle(e.landing, e.landing.end), pointOnCircle(e.flare, e.flare.start), colors.fHoleStem, 2)(g, ui);
  }

  // the cut closes each end of the outline: out of the eye to the tip, where the wing meets it. the
  // tip carries no mark of its own — it is where three other numbers land
  for (let [eye, shoulder, otherEye, cut, tip, color, eyeColor] of [
    [f.UEye!, f.O1!, f.LEye!, f.UCut!, f.UTip!, colors.fHoleCutUpper, colors.fHoleUpper],
    [f.LEye!, f.I1!, f.UEye!, f.LCut!, f.LTip!, colors.fHoleCutLower, colors.fHoleLower],
  ] as const) {
    renderLine(cutRay(eye, otherEye, cut).foot, tip, color, 2)(g, ui);

    // longArc picks whichever of the two arcs is the counter-clockwise one, so moving the cut
    // round the eye slides the join rather than flipping which side of the rim is drawn
    let rim = eyeArc(eye, shoulder, otherEye, cut);
    renderArcFromArc(rim, eyeColor, 2, normalizeRadians(rim.end - rim.start) > Math.PI)(g, ui);
  }
}

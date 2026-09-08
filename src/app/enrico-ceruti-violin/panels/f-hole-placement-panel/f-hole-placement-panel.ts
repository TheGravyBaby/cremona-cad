import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, DefaultParams, EnricoCerutiParams, FholeParams, FholeStem, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { renderArcFromArcFancy, renderCircle, renderCrosshair, renderDashedLine, renderLine, renderPath, renderRect, renderSmallCrosshair } from '../../../helpers/renderFuncs';
import { calculateOuterArcs, ensureOuterTracePaths, getPath, getPathOrNull } from '../../ceruti-calcs';
import { Arc, Circle, Pt, Rectangle } from '../../../models/types';
import { nearestFraction, nearestSmallFraction } from '../../../helpers/nearestFraction';
import { angleFromCenter, angleOnDrawnArc, arcHorizontalIntersections, circleCircleIntersections, clamp, dist, lineCircleIntersection, tangentPointsFromExternalPoint } from '../../../helpers/draftMath';
import { defineInnerArcs } from '../../ceruti-paths';

/** Where the two f-holes sit on the plate — the eyes first, everything else hung off them. */
@Component({
  selector: 'app-ceruti-f-hole-placement-panel',
  imports: [FormsModule],
  templateUrl: './f-hole-placement-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class FHolePlacementPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleGuides', 'showModuleArcs'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[]; 
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly stemAngleRange = STEM_ANGLE_RANGE;
  protected readonly nearestFraction = nearestFraction;
  protected readonly nearestSmallFraction = nearestSmallFraction;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  // two decimals rather than whole degrees: the field's fine step is a tenth, and rounding harder
  // than the step would swallow every fine press
  getStemAngleDeg(stem: FholeStem): number {
    return Math.round(stem.angle! * 18000 / Math.PI) / 100;
  }

  setStemAngleDeg(stem: FholeStem, degrees: number): void {
    if (typeof degrees !== 'number') return;
    stem.angle = clamp(degrees, STEM_ANGLE_RANGE[0], STEM_ANGLE_RANGE[1]) * Math.PI / 180;
    this.onChange();
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    calculateOuterArcs(p);
    ensureOuterTracePaths(p, this.paths);
    p.fHoles ??= defaultFHolePlacement(p);

    const renders: RenderLayer[] = [
      renderPath(getPath(this.paths, 'top'), this.colors.outerTrace),
    ];

    // const purflingPath = getPathOrNull(this.paths, 'purfling');
    // const outerPurflingPath = getPathOrNull(this.paths, 'outerPurfling');
    const innerPath = getPathOrNull(this.paths, 'inner');

    // if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
    // if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));
    if (innerPath) renders.push(renderPath(innerPath, this.colors.innerTrace, 1));

    // recalculate display ratios
    p.ratios.FLtoW = p.fHoles!.LEye!.r / p.width;
    p.ratios.FUtoL = p.fHoles!.UEye!.r / p.fHoles!.LEye!.r;

    this.flags.showModuleArcs && renders.push(renderCrazyGuides(p, this.colors));
    this.flags.showModuleGuides && renders.push(renderFholePlacementGuides(p, this.colors));
    renders.push(renderFholeRise(p, this.colors));
    renders.push(renderFholeStem(p, this.colors));
    renders.push(renderFholeEyes(p, this.colors));

    return renders;
  }

}

/** How far past upright the stem leans, in degrees — mean 91.8°, sd 0.7° across a 6-instrument
 * survey (2026-09), the tightest constant found in that pass. Positive leans the top of the stem
 * toward the hole's upper eye. */
const STEM_ANGLE_DEFAULT = 92;
const STEM_ANGLE_RANGE = [90, 102];

/** The stem's lean as a run per unit of rise — the form every line through the stem is drawn in. */
export const stemRun = (stem: FholeStem): number => Math.cos(stem.angle!) / Math.sin(stem.angle!);

// the rise a hole starts at, against its own eye's radius. the traced Amati reads 1.38 up top and
// 1.20 down below; one ratio for both ends until the eyes are better placed
const FRisetoEye = 6 / 5;

/** Eyes, bounds and stem placed from the corners alone — the seed both f-hole panels start from. */
export const defaultFHolePlacement = (p: EnricoCerutiParams): FholeParams => {
    let FUtoL = p.ratios.FUtoL ?? DefaultParams.ratios.FUtoL;
    let FLtoW = p.ratios.FLtoW ?? DefaultParams.ratios.FLtoW;
    let lowerEyeR = p.width * FLtoW
    let lowerCorner = p.bouts.LCr;

    // both eye positions from a 10-instrument survey against traced templates (2026-09)
    let lowerEye = new Circle(lowerCorner.x * 2/3, lowerCorner.y * 24/25, lowerEyeR);

    // new pet theory
    // draw guide circles from the lower eye to the midpoint, then the midpoint 2/7 the waist dist
    // intersection point is the upper eye
    let waistMidpoint = new Pt(p.bouts.C0.x - p.bouts.C0.r, p.bouts.C0.y)
    let distFromLowerEyeToWaist = dist(lowerEye, waistMidpoint);
    let upperEyeGuideOne = new Circle(lowerEye.x, lowerEye.y, distFromLowerEyeToWaist);
    let upperEyeGuideTwo = new Circle(waistMidpoint.x, waistMidpoint.y, 4/7 * waistMidpoint.x);
    let upperEyeIntersectionPt = circleCircleIntersections(upperEyeGuideOne, upperEyeGuideTwo)[0];
    let upperEye = new Circle(upperEyeIntersectionPt.x, upperEyeIntersectionPt.y, lowerEyeR * FUtoL);

    let upperHeight = upperEye.r * 5/6
    let lowerHeight = lowerEye.r * 5/6;

    let topLeftPt = new Pt(upperEye.x - upperEye.r, upperEye.y + upperEye.r + upperHeight);
    let lowerRightPt = new Pt(lowerEye.x + lowerEye.r, lowerEye.y - lowerEye.r - lowerHeight)

    let stemOuter =  lowerRightPt.x - (lowerRightPt.x - topLeftPt.x) / 2
    let stemInner = upperEye.x + (lowerRightPt.x - upperEye.x) / 3
    let stemY = (topLeftPt.y + upperHeight - (lowerRightPt.y - lowerHeight)) / 2 + lowerRightPt.y - lowerHeight
    let stemX = stemInner + (stemOuter - stemInner) / 2 

    let stemCenter = new Pt(stemX, stemY);  

    let defaults: FholeParams = {
      UEye: upperEye, LEye: lowerEye,
      URise: upperEye.r * FRisetoEye, LRise: lowerEye.r * FRisetoEye,
      UCut: undefined, LCut: undefined, UTip: undefined, LTip: undefined,
      stem: {
        center: stemCenter,
        width: stemOuter - stemInner,
        angle: STEM_ANGLE_DEFAULT * Math.PI / 180,
      },
      O1: undefined, O2: undefined, O3: undefined, O4: undefined, O5: undefined,
      I1: undefined, I2: undefined, I3: undefined, I4: undefined, I5: undefined,
    };
    return defaults;
}


/** The derived box and the stem edges across it — construction, not shape, so they sit behind
 * showModuleGuides. Anything the user can edit is drawn by the contour pass. */
export const renderFholePlacementGuides = (p: EnricoCerutiParams, colors: CerutiColors) => (g: any, ui: any) => {
  const f = p.fHoles!;
  const stem = f.stem;
  const topLeftPt = new Pt(f.UEye!.x - f.UEye!.r, f.UEye!.y + f.UEye!.r + f.URise!);
  const lowerRightPt = new Pt(f.LEye!.x + f.LEye!.r, f.LEye!.y - f.LEye!.r - f.LRise!);

  const run = stemRun(stem);
  const edgeAt = (xBase: number, y: number) => new Pt(xBase + (y - stem.center!.y) * run, y);
  for (const side of [-1, 1]) {
    const xBase = stem.center!.x + side * stem.width! / 2;
    renderDashedLine(edgeAt(xBase, topLeftPt.y), edgeAt(xBase, lowerRightPt.y), colors.fHoleStem, '4 4', 1)(g, ui);
  }

  renderRect(new Rectangle(topLeftPt, lowerRightPt), colors.innerTrace, 'none', 1, '4 4')(g, ui);
}

export const renderFholeRise = (p: EnricoCerutiParams, colors: CerutiColors) => (g: any, ui: any) => {
  const f = p.fHoles!;
  for (const [eye, rise, side, color] of [[f.UEye!, f.URise!, 1, colors.fHoleUpper], [f.LEye!, f.LRise!, -1, colors.fHoleLower]] as const) {
    const boundY = eye.y + side * (eye.r + rise);
    renderLine(new Pt(eye.x - eye.r, boundY), new Pt(eye.x + eye.r, boundY), color, 1)(g, ui);
    renderDashedLine(new Pt(eye.x, eye.y + side * eye.r), new Pt(eye.x, boundY), color, '2 2', 1, 0.9)(g, ui);
  }
}

export const renderFholeStem = (p: EnricoCerutiParams, colors: CerutiColors) => (g: any, ui: any) => {
  const f = p.fHoles!, stem = f.stem, c = stem.center!;
  const half = stem.width! / 2;
  const run = stemRun(stem);
  const edgeAt = (xBase: number, y: number) => new Pt(xBase + (y - c.y) * run, y);

  // a twelfth of the height the hole occupies, either way off the centre
  const reach = Math.abs((f.UEye!.y + f.UEye!.r + f.URise!)
    - (f.LEye!.y - f.LEye!.r - f.LRise!)) / 12;

  renderLine(new Pt(c.x - half, c.y), new Pt(c.x + half, c.y), colors.fHoleStem, 1)(g, ui);
  for (const side of [-1, 1]) {
    const xBase = c.x + side * half;
    renderLine(edgeAt(xBase, c.y - reach), edgeAt(xBase, c.y + reach), colors.fHoleStem, 1.5)(g, ui);
  }
  renderSmallCrosshair(f.stem.center!, colors.fHoleStem)(g, ui);

}

export const renderFholeEyes = (p: EnricoCerutiParams, colors: CerutiColors) => (g: any, ui: any) => {
  const f = p.fHoles!;
  renderCircle(f.UEye!, colors.fHoleUpper)(g, ui);
  renderCircle(f.LEye!, colors.fHoleLower)(g, ui);
}

export const renderCrazyGuides = (p: EnricoCerutiParams, colors: CerutiColors) => (g: any, ui: any) => {
  // lower corner line
  renderDashedLine(new Pt(p.bouts.LCr.x, p.bouts.LCr.y), new Pt(-p.bouts.LCr.x, p.bouts.LCr.y), "grey")(g, ui);
  // the drop line
  renderDashedLine(new Pt(p.bouts.LCr.x, p.fHoles.LEye.y), new Pt(-p.bouts.LCr.x, p.fHoles.LEye.y), "grey")(g, ui);

  // now I need to intersect the drop line with the inner path
  let arcs = defineInnerArcs(p);
  let intersectionPt: Pt;
  for (const arc of arcs) {
    let intersets = arcHorizontalIntersections(arc, p.fHoles.LEye.y)
    if (intersets.length > 0) {
      intersectionPt = intersets[0];
      renderSmallCrosshair(intersectionPt, "red")(g, ui);
      break;
    }
  }

  // now, from this point, we need to draw a line which intersects with the
  // center bout at a tangent. first, lets get all of the possibilities...
  const centerBoutArcs = [
    p.bouts.C0, p.bouts.C1, p.bouts.C2,
    p.options.C21DoubleArc ? p.bouts.C21 : null,
    p.options.C11DoubleArc ? p.bouts.C11 : null,
  ].filter((arc): arc is Arc => arc != null);
  let tangentPt: Pt | undefined;
  for (const arc of centerBoutArcs) {
    const candidates = tangentPointsFromExternalPoint(intersectionPt!, arc);
    tangentPt = candidates.find(t => angleOnDrawnArc(arc, angleFromCenter(arc, t)));
    if (tangentPt) break;
  }
  if (tangentPt) {
    renderDashedLine(intersectionPt!, tangentPt, "red")(g, ui);
    renderSmallCrosshair(tangentPt, "red")(g, ui);
  }

  let distToEyeFromTangent = dist(tangentPt!, p.fHoles.LEye);
  let radForGuide = distToEyeFromTangent - p.fHoles.LEye.r;
  let guideCircle = new Circle(tangentPt.x, tangentPt.y, radForGuide);
  renderCircle(guideCircle, "red")(g, ui);

  // now find the midpoint between the corners
  let midpointBetweenCorners = p.bouts.LCr.y + (p.bouts.UCr.y - p.bouts.LCr.y)/2;
  let waistMidPt = lineCircleIntersection(new Pt(0, midpointBetweenCorners), new Pt(1000, midpointBetweenCorners), p.bouts.C0)[1];
  let distToUpperEyeFromTangent = dist(p.fHoles.UEye, waistMidPt);
  let upperEyeGuide = new Arc(waistMidPt.x, waistMidPt.y, distToUpperEyeFromTangent, 150 * Math.PI / 180, 210 * Math.PI / 180);
  // draw a fancy arc that spans 135 - 225 degrees
  renderArcFromArcFancy(upperEyeGuide, "grey")(g, ui);

  let distBetweenEyes = dist(p.fHoles.UEye, p.fHoles.LEye);
  let upperEyeGuideTwo = new Arc(p.fHoles.LEye.x, p.fHoles.LEye.y, distBetweenEyes, Math.PI, Math.PI / 2);
  renderArcFromArcFancy(upperEyeGuideTwo, "grey")(g, ui);
}
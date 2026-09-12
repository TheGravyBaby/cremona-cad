import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { renderArcFromArc, renderArcHalo, renderSegment, renderPath, renderPointHalo, renderArcFromArcFancy } from '../../../helpers/renderFuncs';
import { ensureOuterTracePaths, calculateOuterArcs, getPath, getPathOrNull } from '../../ceruti-calcs';
import { getArcEndDeg, getFieldDeg, setArcEndDeg, setFieldDeg } from '../../../helpers/math/arcDegrees';
import { fholeCutInfo, fholeShoulderExtendInfo } from '../../ceruti-helpers';
import { defaultFHolePlacement, renderFholeBounds } from '../f-hole-placement-panel/f-hole-placement-panel';
import {circleCircleIntersections, inscribeCircleWithinCircle,
  solveTangentCircleAndLine,
} from '../../../helpers/math/draftMath';
import {
  angleFromCenter, lineFromPointAndSlope, moveInVectorSpace,
   pointOnCircle,
  lineCircleIntersectionWithTolerance,
  vectorFromSlope,
  placeCircleOnPointAtAngle,
} from '../../../helpers/math/simpleGeometry';
import { Pt, Arc } from '../../../models/types';
import { HighlightedArc, HighlightedPoint } from '../../renders/render-constants';
import { error } from '../../../shared/message-emitter';

// UCut/LCut take a point halo; the rest take an arc halo
export type FholeHighlightKey = 'U1' | 'U2' | 'U3' | 'L1' | 'L2' | 'L3' | 'S1' | 'S2' | 'S3' | 'S4' | 'UCut' | 'LCut';

// eyes/stem placement is the placement panel's job; this page only bends what runs between
@Component({
  selector: 'app-ceruti-f-hole-contours-panel',
  imports: [FormsModule],
  templateUrl: './f-hole-contours-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class FHoleContoursPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showFholeBounds', 'showModuleArcs'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly getArcEndDeg = getArcEndDeg;
  protected readonly setArcEndDeg = setArcEndDeg;
  protected readonly getFieldDeg = getFieldDeg;
  protected readonly setFieldDeg = setFieldDeg;
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

    if (this.flags.showFholeBounds) renders.push(renderFholeBounds(p, this.colors));
    // renders.push(renderFholeEyes(p, this.colors));
    renders.push(renderFholeContours(p, this.colors, this.flags.showModuleArcs, arc ? { arc, color } : null, tip));

    return renders;
  }
}


export function calculateFholeContours(p: EnricoCerutiParams): void {
  if (!p.fHoles.U1)
    setContourDefaults(p);

  let stemSlope = Math.tan(p.fHoles.stem.angle)
  let outerStemPt = new Pt(p.fHoles.stem.center.x + p.fHoles.stem.width / 2, p.fHoles.stem.center.y)
  let outerStemLine = lineFromPointAndSlope(outerStemPt, stemSlope)
  let innerStemPt = new Pt(p.fHoles.stem.center.x - p.fHoles.stem.width / 2, p.fHoles.stem.center.y)
  let innerStemLine = lineFromPointAndSlope(innerStemPt, stemSlope)

  // first the upper curve that connects to the eye
  try {
    // first we need to determine the placement of the arc that connects to each eye
    let upperBound = p.fHoles.UEye.y + p.fHoles.UEye.r + p.fHoles.URise
    let upperShoulderX = lineCircleIntersectionWithTolerance(
      { m: 0, y: upperBound - p.fHoles.U1.r, x: 0 },
      { x: p.fHoles.UEye.x, y: p.fHoles.UEye.y, r: Math.abs(p.fHoles.U1.r - p.fHoles.UEye.r) },
    )[0].x
    let upperShoulder = new Arc(upperShoulderX, upperBound - p.fHoles.U1.r, p.fHoles.U1.r)
    let upperShoulderStartPt = circleCircleIntersections(p.fHoles.UEye, upperShoulder);
    let upperShoulderStartAngle = angleFromCenter(upperShoulder, upperShoulderStartPt[0]);
    upperShoulder.start = upperShoulderStartAngle;
    upperShoulder.end = p.fHoles.U1.end
    p.fHoles.U1 = upperShoulder;

    // now continue from the shoulder, we will call this the arm
    let upperArm = inscribeCircleWithinCircle(upperShoulder, p.fHoles.U2.r, upperShoulder.end)
    p.fHoles.U2 = new Arc(upperArm.x, upperArm.y, upperArm.r, upperShoulder.end, 0);

    let S2 = solveTangentCircleAndLine(outerStemLine, p.fHoles.U2, p.fHoles.stem.arcR, true, 1, p.fHoles.stem.center);
    let S2U2Intersect = circleCircleIntersections(S2, p.fHoles.U2);
    let S2StemIntersect = lineCircleIntersectionWithTolerance(outerStemLine, S2); // we are just kissing the line, sometimes we miss due to floating points
    let S2StemEndAngle = angleFromCenter(S2, S2StemIntersect[0])

    p.fHoles.U2.end = angleFromCenter(p.fHoles.U2, S2U2Intersect[0]);
    p.fHoles.S2 = new Arc(S2.x, S2.y, S2.r, p.fHoles.U2.end, S2StemEndAngle)
  } catch (e) {
    error("Upper arm calculation error", "Error")
  }

  // now we do the upper wing
  try {
    let cutStart = pointOnCircle(p.fHoles.UEye, p.fHoles.UCut.angleOnEye);
    let cutVector = vectorFromSlope(p.fHoles.UCut.slope);
    cutVector.mag = p.fHoles.UCut.length;
    let cutEnd = moveInVectorSpace(cutStart, [cutVector]);
    p.fHoles.UTip = cutEnd;
    let cutCircle = placeCircleOnPointAtAngle(p.fHoles.U3.r, cutEnd, p.fHoles.U3.end);
    let S1 = solveTangentCircleAndLine(innerStemLine, cutCircle, p.fHoles.stem.arcR, true, 1, p.fHoles.stem.center);
    let S1U3Pt = circleCircleIntersections(S1, cutCircle);
    let S1StemIntersect = lineCircleIntersectionWithTolerance(innerStemLine, S1);
    let S1StemEndAngle = angleFromCenter(S1, S1StemIntersect[0]);

    p.fHoles.U3 = new Arc(cutCircle.x, cutCircle.y, cutCircle.r, angleFromCenter(cutCircle, S1U3Pt[0]), p.fHoles.U3.end);
    p.fHoles.S1 = new Arc(S1.x, S1.y, S1.r, S1StemEndAngle, angleFromCenter(S1, S1U3Pt[0]));
  } catch (e) {
    error("Upper wing calculation error.", "Error")
  }

  // now the lower arm, upside down: bound drops below the eye, and the arm meets the inner stem
  try {
    let lowerBound = p.fHoles.LEye.y - p.fHoles.LEye.r - p.fHoles.LRise
    let lowerShoulderX = lineCircleIntersectionWithTolerance(
      { m: 0, y: lowerBound + p.fHoles.L1.r, x: 0 },
      { x: p.fHoles.LEye.x, y: p.fHoles.LEye.y, r: Math.abs(p.fHoles.L1.r - p.fHoles.LEye.r) },
    )[1].x
    let lowerShoulder = new Arc(lowerShoulderX, lowerBound + p.fHoles.L1.r, p.fHoles.L1.r)
    let lowerShoulderStartPt = circleCircleIntersections(p.fHoles.LEye, lowerShoulder);
    let lowerShoulderStartAngle = angleFromCenter(lowerShoulder, lowerShoulderStartPt[0]);
    lowerShoulder.start = lowerShoulderStartAngle;
    lowerShoulder.end = p.fHoles.L1.end
    p.fHoles.L1 = lowerShoulder;

    let lowerArm = inscribeCircleWithinCircle(lowerShoulder, p.fHoles.L2.r, lowerShoulder.end)
    p.fHoles.L2 = new Arc(lowerArm.x, lowerArm.y, lowerArm.r, lowerShoulder.end, 0);

    let S3 = solveTangentCircleAndLine(innerStemLine, p.fHoles.L2, p.fHoles.stem.arcR, true, -1, p.fHoles.stem.center);
    let S3L2Intersect = circleCircleIntersections(S3, p.fHoles.L2);
    let S3StemIntersect = lineCircleIntersectionWithTolerance(innerStemLine, S3);
    let S3StemEndAngle = angleFromCenter(S3, S3StemIntersect[0])

    p.fHoles.L2.end = angleFromCenter(p.fHoles.L2, S3L2Intersect[0]);
    p.fHoles.S3 = new Arc(S3.x, S3.y, S3.r, p.fHoles.L2.end, S3StemEndAngle)
  } catch (e) {
    error("Lower arm calculation error", "Error")
  }

  // now the lower wing, which connects to the outer stem
  try {
    let cutStart = pointOnCircle(p.fHoles.LEye, p.fHoles.LCut.angleOnEye);
    let cutVector = vectorFromSlope(p.fHoles.LCut.slope);
    cutVector.mag = p.fHoles.LCut.length;
    let cutEnd = moveInVectorSpace(cutStart, [cutVector]);
    p.fHoles.LTip = cutEnd;
    let cutCircle = placeCircleOnPointAtAngle(p.fHoles.L3.r, cutEnd, p.fHoles.L3.end);
    let S4 = solveTangentCircleAndLine(outerStemLine, cutCircle, p.fHoles.stem.arcR, true, -1, p.fHoles.stem.center);
    let S4L3Pt = circleCircleIntersections(S4, cutCircle);
    let S4StemIntersect = lineCircleIntersectionWithTolerance(outerStemLine, S4);
    let S4StemEndAngle = angleFromCenter(S4, S4StemIntersect[0]);

    p.fHoles.L3 = new Arc(cutCircle.x, cutCircle.y, cutCircle.r, angleFromCenter(cutCircle, S4L3Pt[0]), p.fHoles.L3.end);
    p.fHoles.S4 = new Arc(S4.x, S4.y, S4.r, S4StemEndAngle, angleFromCenter(S4, S4L3Pt[0]));
  } catch (e) {
    error("Lower wing calculation error.", "Error")
  }
}


export const renderFholeContours = (
  p: EnricoCerutiParams,
  colors: CerutiColors,
  showArcs: boolean,
  highlighted: HighlightedArc | null,
  highlightedPoint: HighlightedPoint | null,
) => (g: any, ui: any): void => {

  if (highlighted) renderArcHalo(highlighted.arc, highlighted.color)(g, ui);
  if (highlightedPoint) renderPointHalo(highlightedPoint.point, highlightedPoint.color)(g, ui);

  renderArcFromArc(p.fHoles.U1, colors.fHoleUpperDark, 2)(g, ui);
  renderArcFromArc(p.fHoles.U2, colors.fHoleUpper, 2)(g, ui);
  renderArcFromArc(p.fHoles.U3, colors.fHoleUpperLight, 2)(g, ui);
  renderArcFromArc(p.fHoles.S2, colors.fHoleStem, 2)(g, ui);
  renderArcFromArc(p.fHoles.S1, colors.fHoleStem, 2)(g, ui);

  renderArcFromArc(p.fHoles.L1, colors.fHoleLowerDark, 2)(g, ui);
  renderArcFromArc(p.fHoles.L2, colors.fHoleLower, 2)(g, ui);
  renderArcFromArc(p.fHoles.L3, colors.fHoleLowerLight, 2)(g, ui);
  renderArcFromArc(p.fHoles.S4, colors.fHoleStem, 2)(g, ui);
  renderArcFromArc(p.fHoles.S3, colors.fHoleStem, 2)(g, ui);

  let cutStart = pointOnCircle(p.fHoles.UEye, p.fHoles.UCut.angleOnEye);
  renderSegment(cutStart, p.fHoles.UTip, colors.fHoleCut, 2)(g, ui);

  let lowerCutStart = pointOnCircle(p.fHoles.LEye, p.fHoles.LCut.angleOnEye);
  renderSegment(lowerCutStart, p.fHoles.LTip, colors.fHoleCut, 2)(g, ui);

  // now we need to render the segments between the arc ends
  let outerStemTop = pointOnCircle(p.fHoles.S2, p.fHoles.S2.end);
  let outerStemBottom = pointOnCircle(p.fHoles.S4, p.fHoles.S4.start);
  renderSegment(outerStemTop, outerStemBottom, colors.fHoleStem, 2)(g, ui);

  let innerStemTop = pointOnCircle(p.fHoles.S1, p.fHoles.S1.start);
  let innerStemBottom = pointOnCircle(p.fHoles.S3, p.fHoles.S3.end);
  renderSegment(innerStemTop, innerStemBottom, colors.fHoleStem, 2)(g, ui);

  // now we render the eyes as arcs, not just circles
  let UpperEyeStartPt = circleCircleIntersections(p.fHoles.UEye, p.fHoles.U1)[0];
  let UpperEyeStartAngle = angleFromCenter(p.fHoles.UEye, UpperEyeStartPt);
  let eyeArc = new Arc(p.fHoles.UEye.x, p.fHoles.UEye.y, p.fHoles.UEye.r, UpperEyeStartAngle, p.fHoles.UCut.angleOnEye);
  renderArcFromArc(eyeArc, colors.fHoleUpper, 2, true)(g, ui);

  let LowerEyeStartPt = circleCircleIntersections(p.fHoles.LEye, p.fHoles.L1)[0];
  let LowerEyeStartAngle = angleFromCenter(p.fHoles.LEye, LowerEyeStartPt);
  let lowerEyeArc = new Arc(p.fHoles.LEye.x, p.fHoles.LEye.y, p.fHoles.LEye.r, LowerEyeStartAngle, p.fHoles.LCut.angleOnEye);
  renderArcFromArc(lowerEyeArc, colors.fHoleLower, 2, true)(g, ui);

  // then we render the fancy arcs
  if (showArcs) {
    renderArcFromArcFancy(p.fHoles.U1, colors.fHoleUpperDark)(g, ui);
    renderArcFromArcFancy(p.fHoles.U2, colors.fHoleUpper)(g, ui);
    renderArcFromArcFancy(p.fHoles.U3, colors.fHoleUpperLight)(g, ui);
    renderArcFromArcFancy(p.fHoles.S2, colors.fHoleStem)(g, ui);
    renderArcFromArcFancy(p.fHoles.S1, colors.fHoleStem)(g, ui);

    renderArcFromArcFancy(p.fHoles.L1, colors.fHoleLowerDark)(g, ui);
    renderArcFromArcFancy(p.fHoles.L2, colors.fHoleLower)(g, ui);
    renderArcFromArcFancy(p.fHoles.L3, colors.fHoleLowerLight)(g, ui);
    renderArcFromArcFancy(p.fHoles.S4, colors.fHoleStem)(g, ui);
    renderArcFromArcFancy(p.fHoles.S3, colors.fHoleStem)(g, ui);

  }
}


// off a traced Amati, nice historical defaults
const FShtoEye = 5 / 2;
const FArmtoEye = 3;
const FStemArctoLEye = 10;
const FUWingEnd = Math.PI * 4 / 9;
const FLWingEnd = Math.PI * -19 / 36;
const FCutAt = Math.PI * 2 / 3;
const FUCutSlope = Math.PI * 1 / 3;
const FLCutSlope = Math.PI * -2 / 3;

// only need to set the radii values and instantiate the angles
export function setContourDefaults(p: EnricoCerutiParams) {
  p.fHoles.U1 ??= new Arc(0, 0, Math.round(p.fHoles.UEye.r * FShtoEye), 0, Math.PI / 2)
  p.fHoles.L1 ??= new Arc(0, 0, Math.round(p.fHoles.LEye.r * FShtoEye), 0, -Math.PI / 2)

  p.fHoles.U2 ??= new Arc(0, 0, Math.round(p.fHoles.UEye.r * FArmtoEye))
  p.fHoles.L2 ??= new Arc(0, 0, Math.round(p.fHoles.LEye.r * FArmtoEye))
  p.fHoles.U3 ??= new Arc(0, 0, Math.round(p.fHoles.UEye.r * FArmtoEye), 0, FUWingEnd)
  p.fHoles.L3 ??= new Arc(0, 0, Math.round(p.fHoles.LEye.r * FArmtoEye), 0, FLWingEnd)

  p.fHoles.stem.arcR ??= Math.round(p.fHoles.LEye.r * FStemArctoLEye)
  p.fHoles.S1 ??= new Arc(0, 0, p.fHoles.stem.arcR)
  p.fHoles.S2 ??= new Arc(0, 0, p.fHoles.stem.arcR)
  p.fHoles.S3 ??= new Arc(0, 0, p.fHoles.stem.arcR)
  p.fHoles.S4 ??= new Arc(0, 0, p.fHoles.stem.arcR)

  p.fHoles.UCut = {
    angleOnEye: Math.PI * 1 / 3,
    length: p.fHoles.UEye.r,
    slope: FUCutSlope
  }
  p.fHoles.LCut = {
    angleOnEye: Math.PI * 4 / 3,
    length: p.fHoles.LEye.r,
    slope: FLCutSlope
  }

}
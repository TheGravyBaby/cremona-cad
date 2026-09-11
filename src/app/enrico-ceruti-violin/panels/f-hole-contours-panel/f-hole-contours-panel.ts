import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, FholeCut, FholeStem, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderLine, renderPath, renderPointHalo } from '../../../helpers/renderFuncs';
import { ensureOuterTracePaths, calculateOuterArcs, getPath, getPathOrNull } from '../../ceruti-calcs';
import { getArcEndDeg, setArcEndDeg } from '../../../helpers/arcDegrees';
import { fholeCutInfo, fholeShoulderExtendInfo } from '../../ceruti-helpers';
import { defaultFHolePlacement, renderFholeBounds, renderFholeEyePlacementGuides, renderFholeEyes, stemRun } from '../f-hole-placement-panel/f-hole-placement-panel';
import { angleForBridgeRadius, angleFromCenter, arcBetweenTravels, arcContinuingFrom, arcTangentToLine, circleCircleIntersections, inscribeCircleWithinCircle, lineFromPointAndSlope, moveInVectorSpace, normalizeRadians, pointOnCircle, signedArcSweep, solveCircumscribedCircleAlongAxis, sweepForTangentLineRadius, tangentAngleFromLine, tangentUnitVectorFromLine, unitVectorFromLine } from '../../../helpers/math/draftMath';
import { travelAtArcEnd, travelAtArcStart } from '../../../helpers/math/draftMath';
import { Circle, Pt, Arc, Line, Vect2D } from '../../../models/types';
import { HighlightedArc, HighlightedPoint } from '../../renders/render-constants';

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

    if (this.flags.showFholeBounds) renders.push(renderFholeBounds(p, this.colors));
    renders.push(renderFholeEyes(p, this.colors));
    renders.push(renderFholeContours(p, this.colors, this.flags.showModuleArcs));

    return renders;
  }
}


export function calculateFholeContours(p: EnricoCerutiParams): void {
  if (!p.fHoles.U1)
    setContourDefaults(p);

  // first we need to determine the placement of the arc that connects to each eye
  let upperBound = p.fHoles.UEye.y + p.fHoles.UEye.r + p.fHoles.URise
  let upperShoulderX = solveCircumscribedCircleAlongAxis(p.fHoles.UEye, p.fHoles.U1.r, "y", upperBound - p.fHoles.U1.r)
  let upperShoulder = new Arc(upperShoulderX, upperBound - p.fHoles.U1.r, p.fHoles.U1.r)
  let upperShoulderStartPt = circleCircleIntersections(p.fHoles.UEye, upperShoulder);
  let upperShoulderStartAngle = angleFromCenter(upperShoulder, upperShoulderStartPt[0]);
  upperShoulder.start = upperShoulderStartAngle;
  // upperShoulder.end = p.fHoles.U1.end ?? Math.PI * 1/2
  upperShoulder.end = Math.PI * 1/2 // forcing this for now, TODO fix
  p.fHoles.U1 = upperShoulder;

  // now continue from the shoulder, we will call this the arm
  let upperArm = inscribeCircleWithinCircle(upperShoulder, p.fHoles.U2.r, upperShoulder.end)
  p.fHoles.U2 = new Arc(upperArm.x, upperArm.y, upperArm.r, upperShoulder.end, 0);

  let stemSlope = Math.tan(p.fHoles.stem.angle)
  let stemPtOuter = new Pt(p.fHoles.stem.center.x + p.fHoles.stem.width/2, p.fHoles.stem.center.y)
  let outerStem = lineFromPointAndSlope(stemPtOuter, stemSlope)

  let C = solveTangentCircleAndLine(outerStem, p.fHoles.U2, p.fHoles.stem.arcR, true)[0]

  p.fHoles.U3 = new Arc(C.x, C.y, C.r)

}


// T is a line, Q is a fixed circle, solve the position of P given a R where P is tangent to both T and Q
// in this case m is a standard y/x slope
function solveTangentCircleAndLine(t: Line, Q: Circle, Pr: number, diff: boolean): Circle[] {
  // we know that the line drawn from C center to the center of Q must have some properties
  // if diff, dist = P.r - Q.r; if sum, dist = P.r +  Q.r
  let PtoQ = diff ? Pr - Q.r : Pr + Q.r;

  // we know that the circle P must be tangent to the line, which means its 
  // exists along a line parallel to our given line at some distance away
  // so given the point for our line t, just move the xy components of r away from that
  const perpendicularAngle = Math.atan(-1 / t.m)
  const parallelLine: Line = {m: t.m, x: t.x - Pr * Math.cos(perpendicularAngle), y: t.y - Pr * Math.sin(perpendicularAngle)};

  // now we need to solve for the point along Cy where the distance to Q is equal to dist
  // first find the distance between the line t and the center of Q
  let QtoT = shortestDistanceFromPtToLine(Q, parallelLine)
  
  // we have two sides of a right triangle, we can solve for the third
  let distanceAlongLine = Math.sqrt(PtoQ * PtoQ - QtoT * QtoT);

  // so lets make vectors, we have angles and magnitudes
  let unitVectAlongT = unitVectorFromLine(t)
  let unitVectAgainstT = tangentUnitVectorFromLine(t)
  let vectAlongT: Vect2D = {a: unitVectAlongT.a, b: unitVectAlongT.b, mag: distanceAlongLine}
  let vectAgainstT: Vect2D = {a: unitVectAgainstT.a, b: unitVectAgainstT.b, mag: QtoT}

  // now we just start at our reference point and apply the vectors to find the potential circle centers
  let Cxy = moveInVectorSpace(Q, [vectAlongT, vectAgainstT])
  let C = new Circle(Cxy.x, Cxy.y, Pr)
  return [C];
}

// https://en.wikipedia.org/wiki/Distance_from_a_point_to_a_line
function shortestDistanceFromPtToLine(P: Pt, L: Line): number {
  // Distance from point to line formula: |m*Px - Py + (L.y - m*L.x)| / sqrt(m^2 + 1)
  return Math.abs(L.m * P.x - P.y + (L.y - L.m * L.x)) / Math.sqrt(L.m * L.m + 1);
}



export const renderFholeContours = (
  p: EnricoCerutiParams,
  colors: CerutiColors,
  showArcs: boolean,
) => (g: any, ui: any): void => {

  renderArcFromArc(p.fHoles.U1, colors.innerTrace)(g, ui);
  renderCircle(p.fHoles.U2, colors.innerTrace)(g, ui);
  renderCircle(p.fHoles.U3, colors.innerTrace)(g, ui);

}

// only need to set the radii values and instantiate the angles
export function setContourDefaults(p: EnricoCerutiParams) {
  p.fHoles.U1 ??= new Arc(0,0, p.fHoles.UEye.r * 3)
  p.fHoles.L1 ??= new Arc(0,0, p.fHoles.LEye.r * 3)
  
  // a 3/2 of the radius produces a nice scaling of the curvature
  p.fHoles.U2 ??= new Arc(0,0, p.fHoles.U1.r * 3/2)
  p.fHoles.L2 ??= new Arc(0,0, p.fHoles.L1.r * 3/2)
  p.fHoles.U3 ??= new Arc(0,0, p.fHoles.U2.r * 3/2)
  p.fHoles.L3 ??= new Arc(0,0, p.fHoles.L2.r * 3/2)

  // the stems can be another doubling
  p.fHoles.stem.arcR ??= p.fHoles.L3.r * 2
  p.fHoles.S1 ??= new Arc(0,0, p.fHoles.stem.arcR )
  p.fHoles.S2 ??= new Arc(0,0, p.fHoles.stem.arcR )
  p.fHoles.S3 ??= new Arc(0,0, p.fHoles.stem.arcR )
  p.fHoles.S4 ??= new Arc(0,0, p.fHoles.stem.arcR )

  p.fHoles.UCut = {
    angleOnEye: Math.PI * 1/3,
    length: p.fHoles.U3.r * 2,
    slope: Math.PI * 1/3
  }
  p.fHoles.LCut = {
    angleOnEye: Math.PI * 4/3,
    length: p.fHoles.L3.r * 2,
    slope: Math.PI * 4/3
  }

}
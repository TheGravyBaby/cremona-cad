import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, DefaultParams, EnricoCerutiParams, FholeParams, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { renderOuterTraceGuides } from '../outer-trace-panel/outer-trace-panel';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderCrosshair, renderDashedLine, renderLine, renderPath, renderPointHalo, renderRect } from '../../../helpers/renderFuncs';
import { HighlightedArc, HighlightedPoint } from '../../renders/render-constants';
import { calculateOuterArcs, ensureOuterTracePaths, getPath, getPathOrNull } from '../../ceruti-calcs';
import { Arc, Circle, Pt, Rectangle } from '../../../models/types';
import { nearestFraction, nearestSmallFraction } from '../../../helpers/nearestFraction';
import { adjustArcEnd } from '../../../helpers/arcDegrees';
import { renderBounds, renderBoutBouts } from '../../renders/guides.render';
import { angleFromCenter, arcContinuingFrom, arcsReachingPoint, arcTangentToLine, intersectLines, lineCircleIntersection, pointOnCircle, signedArcSweep, solveCircumscribedCircleAlongAxis, travelAtArcEnd } from '../../../helpers/draftMath';

/** Where the two f-holes sit on the plate — the eyes first, everything else hung off them. */
@Component({
  selector: 'app-ceruti-f-hole-placement-panel',
  imports: [FormsModule],
  templateUrl: './f-hole-placement-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class FHolePlacementPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleArcs', 'showModuleGuides'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly nearestFraction = nearestFraction;
  protected readonly nearestSmallFraction = nearestSmallFraction;
  protected readonly adjustArcEnd = adjustArcEnd;

  // Held as a key rather than the Arc itself: calculateFholeContours rebuilds every arc on each
  // pass, so an object captured on focus is stale by the time it would be drawn.
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

  public buildRun(): RenderLayer[] {
    const p = this.params;
    calculateOuterArcs(p);
    ensureOuterTracePaths(p, this.paths);
    p.fHoles ??= this.defaultFHolePlacement(p);
    

    const renders: RenderLayer[] = [
      renderPath(getPath(this.paths, 'top'), this.colors.outerTrace),
    ];

    const purflingPath = getPathOrNull(this.paths, 'purfling');
    const outerPurflingPath = getPathOrNull(this.paths, 'outerPurfling');

    if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
    if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));

    // renders.push(renderBoutBouts(p, this.colors, true))
    
    p.ratios.FLtoW = p.fHoles!.FL0.r / p.width;
    p.ratios.FUtoL = p.fHoles!.FU0.r / p.fHoles!.FL0.r;

    calculateFholeContours(p);
    
    const key = this.highlightedKey;
    const arc = key && key !== 'tip' ? p.fHoles![key] : null;

    if (this.flags.showModuleGuides) renders.push(renderFholePlacementGuides(p, this.colors));
    renders.push(renderFholeContours(p, this.colors, this.flags.showModuleArcs,
      arc ? { arc, color: this.colors.fHoleOuter } : null,
      key === 'tip' ? { point: p.fHoles!.FUCutoff, color: this.colors.lowerEye } : null));

    return renders;
  }

  defaultFHolePlacement(p: EnricoCerutiParams): FholeParams {
    let FUtoL = p.ratios.FUtoL ?? DefaultParams.ratios.FUtoL;
    let FLtoW = p.ratios.FLtoW ?? DefaultParams.ratios.FLtoW;
    let lowerEyeR = p.width * FLtoW

    let lowerCorner = p.bouts.LCr;
    let upperCorner = p.bouts.UCr;

    let lowerEyeHeight = lowerCorner.y - lowerEyeR;
    // I have a theory that the default strad position defined by this guide arc, 1/3 the lower corner distance from the middle
    // or 1/6 the total corner width
    let lowerEyeGuideCircle = new Circle(p.bouts.LCr.x, p.bouts.LCr.y, p.bouts.LCr.x / 3);

    // the position of the eye is the intersection between the line defined by the corners and the guide circle
    let lowerEyePosition = lineCircleIntersection(new Pt(0, lowerEyeHeight), new Pt(1000, lowerEyeHeight), lowerEyeGuideCircle)[1]
    let lowerEye = new Circle(lowerEyePosition.x,  lowerEyePosition.y, lowerEyeR);

    let upperEyeHeight = upperCorner.y * 4/5 // this is not exactly a rule as much as a guideline I have noticed

    // line equation for a slope and a point, y-y1 = m(x-x1)
    // so, for our 3/2 run y - lowerEye.y = -3/2 * (x - lowerEye.x)

    let upperEyePosition = intersectLines(
      new Pt(-1000, upperEyeHeight),
      new Pt(1000, upperEyeHeight),
      lowerEye,
      new Pt(lowerEye.x + 10, lowerEye.y - 3/2 * 10) // move along 10 x units
    );


    // currently I hardcode this value based on the bout width, this is wrong
    // for violins, strad and del gesu have distances about 62mm
    // I need a value that is based on a proportion
    let upperEye = new Circle(upperEyePosition.x, upperEyePosition.y, lowerEyeR * FUtoL);
    let upperHeight = upperEye.r * 5/6
    let lowerHeight = lowerEye.r * 5/6;


    let topLeftPt = new Pt(upperEye.x - upperEye.r, upperEye.y + upperEye.r + upperHeight);
    let lowerRightPt = new Pt(lowerEye.x + lowerEye.r, lowerEye.y - lowerEye.r - lowerHeight)

    let stemOuter =  lowerRightPt.x - (lowerRightPt.x - topLeftPt.x) / 2
    let stemInner = topLeftPt.x + (lowerRightPt.x - topLeftPt.x) / 3
    let stemY = (topLeftPt.y + upperHeight - (lowerRightPt.y - lowerHeight)) / 2 + lowerRightPt.y - lowerHeight
    let stemX = stemInner + (stemOuter - stemInner) / 2 

    let stemCenter = new Pt(stemX, stemY);  

    let defaults: FholeParams = {
      FU0: upperEye,
      FL0: lowerEye,
      UH: upperHeight * 2,
      LH: lowerHeight * 2,

      stemCenter: stemCenter,
      stemWidth: stemOuter - stemInner,
      stemSlope: 0,

      FU1: undefined,
      FU2: undefined,
      FU3: undefined,
      FU4: undefined,
      FU5: undefined,
      FU6: undefined,
      FUCutoff: undefined
    };
    return defaults;
  }
}

/** Which field currently has focus, for the halo. Arc keys name their own arc; 'tip' is the
 * cut-off point, which takes a point halo instead. */
export type FholeHighlightKey = 'FU1' | 'FU2' | 'FU3' | 'FU5' | 'FU6' | 'tip';

/** The derived box and the stem edges extended across it — construction, not shape, so they sit
 * behind showModuleGuides. Anything the user can actually edit is drawn by the contour pass. */
export const renderFholePlacementGuides = (p: EnricoCerutiParams, colors: CerutiColors) => (g: any, ui: any) => {
  const f = p.fHoles!;
  const topLeftPt = new Pt(f.FU0.x - f.FU0.r, f.FU0.y + f.FU0.r + f.UH);
  const lowerRightPt = new Pt(f.FL0.x + f.FL0.r, f.FL0.y - f.FL0.r - f.LH);

  // x = x1 + (y - y1) * -slope
  const edgeAt = (xBase: number, y: number) => new Pt(xBase - (y - f.stemCenter.y) * f.stemSlope, y);
  for (const side of [-1, 1]) {
    const xBase = f.stemCenter.x + side * f.stemWidth / 2;
    renderDashedLine(edgeAt(xBase, topLeftPt.y), edgeAt(xBase, lowerRightPt.y), colors.fHoleStem, '4 4', 1)(g, ui);
  }

  renderRect(new Rectangle(topLeftPt, lowerRightPt), colors.innerTrace, 'none', 1, '4 4')(g, ui);

  // where each arc hands off to the next — construction detail, so it rides with the guides
  for (const a of [f.FU1, f.FU2, f.FU3, f.FU4, f.FU5, f.FU6]) {
    if (a) renderCrosshair(pointOnCircle(a, a.start), colors.fHoleOuter, 1.2, 1.5)(g, ui);
  }
  if (f.FU4) renderCrosshair(pointOnCircle(f.FU4, f.FU4.end), colors.fHoleOuter, 1.2, 1.5)(g, ui);
}

export const calculateFholeContours = (p: EnricoCerutiParams) => {
  const f = p.fHoles!;
  const eye = f.FU0;
  const yTop = eye.y + eye.r + f.UH;

  // FU1 is tangent to the eye and tangent to the upper bound, so its radius alone places it.
  // Below r = eye.r + UH/2 the apex can't reach the bound and the solve has no root.
  const r = Math.max(f.FU1?.r ?? eye.r + f.UH, eye.r + f.UH / 2);
  const y = yTop - r;
  const x = solveCircumscribedCircleAlongAxis(eye, r, 'y', y, true);

  f.FU1 = new Arc(x, y, r, 0, Math.PI / 2); // end at the apex, on the upper bound
  f.FU1.start = angleFromCenter(f.FU1, eye); // tangent point, on the line of centers

  // FU2 and FU3 each pick up the tangent the arc before them ended on, so radius and sweep are
  // the only knobs — where they sit falls out. Sweeps carry the sign of FU1's own turn.
  const turn = Math.sign(signedArcSweep(f.FU1));
  const sweepOf = (a: Arc, fallback: number) => a ? a.end - a.start : fallback;

  f.FU2 = arcContinuingFrom(
    pointOnCircle(f.FU1, f.FU1.end), travelAtArcEnd(f.FU1),
    f.FU2?.r ?? f.FU1.r, sweepOf(f.FU2, turn * Math.PI / 4));

  f.FU3 = arcContinuingFrom(
    pointOnCircle(f.FU2, f.FU2.end), travelAtArcEnd(f.FU2),
    f.FU3?.r ?? f.FU1.r * 3, sweepOf(f.FU3, turn * Math.PI / 9));

  // FU4 has no radius of its own: landing tangent on the stem edge uses up the last freedom.
  // It crosses the near edge and settles on the far one, so the stem slot ends up between this
  // contour and the inner one rather than off to one side of both.
  const approach = Math.sign(Math.cos(travelAtArcEnd(f.FU1)));
  const stemEdge = new Pt(f.stemCenter.x + approach * f.stemWidth / 2, f.stemCenter.y);

  f.FU4 = arcTangentToLine(
    pointOnCircle(f.FU3, f.FU3.end), travelAtArcEnd(f.FU3),
    stemEdge, new Pt(f.stemSlope, -1));

  // Past the stem the contour runs straight for a while, then flares back out to a tip beside
  // the lower eye — the curvature reverses across the stem, so these two turn against FU1-FU4.
  // How long that straight run is, and FU5's sweep, are what reaching a named tip costs.
  f.FUCutoff ??= new Pt(f.FL0.x - f.FL0.r * 1.5, f.FL0.y - f.FL0.r * 1.5);

  const wing = f.FU4 && arcsReachingPoint(
    pointOnCircle(f.FU4, f.FU4.end), travelAtArcEnd(f.FU4), f.FUCutoff,
    -turn * (f.FU5?.r ?? f.FU1.r * 3.5),
    f.FU6?.r ?? f.FU1.r * 2, sweepOf(f.FU6, -turn * Math.PI / 6));

  f.FU5 = wing ? wing.first : null;
  f.FU6 = wing ? wing.second : null;
}

export const renderFholeContours = (
  p: EnricoCerutiParams,
  colors: CerutiColors,
  showArcs: boolean,
  highlighted: HighlightedArc | null,
  highlightedPoint: HighlightedPoint | null,
) => (g: any, ui: any) => {
  const f = p.fHoles!;

  if (highlighted) renderArcHalo(highlighted.arc, highlighted.color)(g, ui);
  if (highlightedPoint) renderPointHalo(highlightedPoint.point, highlightedPoint.color)(g, ui);

  // one edge of one hole, so one colour — the seams are marked by the module guides, and the
  // halo above is what says which of them a given box drives. showModuleArcs opens each arc up
  // into its centre and radii, which is how you read where a radius is actually swinging from.
  const drawArc = (a: Arc) => showArcs
    ? renderArcFromArcFancy(a, colors.fHoleOuter)
    : renderArcFromArc(a, colors.fHoleOuter, 2);
  for (const a of [f.FU1, f.FU2, f.FU3, f.FU4, f.FU5, f.FU6]) {
    if (a) drawArc(a)(g, ui);
  }

  // the stem is the only straight part and the only part both edges share, so it gets its own
  if (f.FU4 && f.FU5) {
    renderLine(pointOnCircle(f.FU4, f.FU4.end), pointOnCircle(f.FU5, f.FU5.start), colors.fHoleStem, 2)(g, ui);
  }

  // anchors: the eyes the contour is tangent to and cut to, the tip, and the stem's own centre
  renderCircle(f.FU0, colors.upperEye)(g, ui);
  renderCircle(f.FL0, colors.lowerEye)(g, ui);
  renderCrosshair(f.FUCutoff, colors.lowerEye)(g, ui);
  renderCrosshair(f.stemCenter, colors.fHoleStem)(g, ui);
}

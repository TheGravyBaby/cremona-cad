import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, DefaultParams, EnricoCerutiParams, FholeParams, FholeStem, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { renderCircle, renderDashedLine, renderLine, renderPath, renderRect, renderSmallCrosshair } from '../../../helpers/renderFuncs';
import { calculateOuterArcs, ensureOuterTracePaths, getPath, getPathOrNull } from '../../ceruti-calcs';
import { Circle, Pt, Rectangle } from '../../../models/types';
import { nearestFraction, nearestSmallFraction } from '../../../helpers/nearestFraction';
import { renderBoutBouts } from '../../renders/guides.render';
import { clamp, intersectLines, lineCircleIntersection } from '../../../helpers/draftMath';

/** Where the two f-holes sit on the plate — the eyes first, everything else hung off them. */
@Component({
  selector: 'app-ceruti-f-hole-placement-panel',
  imports: [FormsModule],
  templateUrl: './f-hole-placement-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class FHolePlacementPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = [];

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

    const purflingPath = getPathOrNull(this.paths, 'purfling');
    const outerPurflingPath = getPathOrNull(this.paths, 'outerPurfling');

    if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
    if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));

    // recalculate display ratios
    p.ratios.FLtoW = p.fHoles!.lower.eye!.r / p.width;
    p.ratios.FUtoL = p.fHoles!.upper.eye!.r / p.fHoles!.lower.eye!.r;

    renders.push(renderFholePlacementGuides(p, this.colors));
    renders.push(renderFholeRise(p, this.colors), renderFholeStem(p, this.colors));
    renders.push(renderFholeEyes(p, this.colors));

    return renders;
  }

}

/** How far past upright the stem leans, in degrees — the whole number nearest the traced Amati,
 * which reads 93.4. Positive leans the top of the stem toward the hole's upper eye. */
const STEM_ANGLE_DEFAULT = 93;
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
    let upperCorner = p.bouts.UCr;

    let lowerEyeHeight = lowerCorner.y - lowerEyeR;
    // I have a theory that the default strad position defined by this guide arc, 1/3 the lower corner distance from the middle
    // or 1/6 the total corner width
    let lowerEyeGuideCircle = new Circle(p.bouts.LCr.x, p.bouts.LCr.y, p.bouts.LCr.x / 3);

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
    let stemInner = upperEye.x + (lowerRightPt.x - upperEye.x) / 3
    let stemY = (topLeftPt.y + upperHeight - (lowerRightPt.y - lowerHeight)) / 2 + lowerRightPt.y - lowerHeight
    let stemX = stemInner + (stemOuter - stemInner) / 2 

    let stemCenter = new Pt(stemX, stemY);  

    let defaults: FholeParams = {
      upper: {
        eye: upperEye,
        rise: upperEye.r * FRisetoEye,
        shoulder: undefined, arm: undefined, arm2: undefined,
        wing: undefined, cut: undefined, tip: undefined,
      },
      lower: {
        eye: lowerEye,
        rise: lowerEye.r * FRisetoEye,
        shoulder: undefined, arm: undefined, arm2: undefined,
        wing: undefined, cut: undefined, tip: undefined,
      },
      stem: {
        center: stemCenter,
        width: stemOuter - stemInner,
        angle: STEM_ANGLE_DEFAULT * Math.PI / 180,
        outerUpper: undefined, outerLower: undefined,
        innerUpper: undefined, innerLower: undefined,
      },
    };
    return defaults;
}


/** The derived box and the stem edges across it — construction, not shape, so they sit behind
 * showModuleGuides. Anything the user can edit is drawn by the contour pass. */
export const renderFholePlacementGuides = (p: EnricoCerutiParams, colors: CerutiColors) => (g: any, ui: any) => {
  const f = p.fHoles!;
  const up = f.upper, low = f.lower, stem = f.stem;
  const topLeftPt = new Pt(up.eye!.x - up.eye!.r, up.eye!.y + up.eye!.r + up.rise!);
  const lowerRightPt = new Pt(low.eye!.x + low.eye!.r, low.eye!.y - low.eye!.r - low.rise!);

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
  for (const [end, side, color] of [[f.upper, 1, colors.fHoleUpper], [f.lower, -1, colors.fHoleLower]] as const) {
    const eye = end.eye!;
    const boundY = eye.y + side * (eye.r + end.rise!);
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
  const reach = Math.abs((f.upper.eye!.y + f.upper.eye!.r + f.upper.rise!)
    - (f.lower.eye!.y - f.lower.eye!.r - f.lower.rise!)) / 12;

  renderLine(new Pt(c.x - half, c.y), new Pt(c.x + half, c.y), colors.fHoleStem, 1)(g, ui);
  for (const side of [-1, 1]) {
    const xBase = c.x + side * half;
    renderLine(edgeAt(xBase, c.y - reach), edgeAt(xBase, c.y + reach), colors.fHoleStem, 1.5)(g, ui);
  }
}

export const renderFholeEyes = (p: EnricoCerutiParams, colors: CerutiColors) => (g: any, ui: any) => {
  const f = p.fHoles!;
  renderCircle(f.upper.eye!, colors.fHoleUpper)(g, ui);
  renderCircle(f.lower.eye!, colors.fHoleLower)(g, ui);
  renderSmallCrosshair(f.stem.center!, colors.fHoleStem)(g, ui);
}

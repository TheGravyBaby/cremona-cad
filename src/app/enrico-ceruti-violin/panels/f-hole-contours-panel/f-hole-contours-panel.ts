import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { renderArcFromArc, renderArcHalo, renderSegment, renderPath, renderPointHalo, renderArcFromArcFancy } from '../../../helpers/renderFuncs';
import { ensureOuterTracePaths, ensureFholePath, calculateOuterArcs, getPath, getPathOrNull } from '../../ceruti-calcs';
import { getArcEndDeg, getFieldDeg, setArcEndDeg, setFieldDeg } from '../../../helpers/math/arcDegrees';
import { fholeCutInfo, fholeShoulderExtendInfo } from '../../ceruti-helpers';
import { defaultFHolePlacement, renderFholeBounds } from '../f-hole-placement-panel/f-hole-placement-panel';
import { circleCircleIntersections } from '../../../helpers/math/draftMath';
import { angleFromCenter, dist, pointOnCircle } from '../../../helpers/math/simpleGeometry';
import { Arc } from '../../../models/types';
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
  protected readonly getFieldDeg = getFieldDeg;
  protected readonly setFieldDeg = setFieldDeg;
  protected readonly fholeShoulderExtendInfo = fholeShoulderExtendInfo;
  protected readonly fholeCutInfo = fholeCutInfo;

  // held as a key rather than the Arc itself: ensureFholePath rebuilds every arc on each pass,
  // so an object captured on focus is stale by the time it would be drawn
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

    ensureFholePath(p, this.paths);

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
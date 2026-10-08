import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiViewFlags, EnricoCerutiParams, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { renderArcFromArc, renderArcHalo, renderSegment, renderPointHalo, renderArcFromArcFancy, renderCircle, renderSolveFailures } from '../../../helpers/renderFuncs';
import { PaletteId, STROKE_WEIGHT } from '../../../theme/palettes';
import { ensureFholePath, ensureFrontProfilePaths, calculateOuterArcs, FholeArcKey, FholeFailure } from '../../calculation/outline/ceruti-calcs';
import { renderFrontProfile } from '../../renders/front-profile.render';
import { getArcEndDeg, getArcStartDeg, getFieldDeg, setArcEndDeg, setArcStartDeg, setFieldDeg } from '../../../helpers/math/arcDegrees';
import { defaultFHolePlacement, renderFholeBounds } from '../f-hole-placement-panel/f-hole-placement-panel';
import { circleCircleIntersections } from '../../../helpers/math/draftMath';
import { angleFromCenter, dist, flipArcAboutY, flipPointAboutY, pointOnCircle } from '../../../helpers/math/simpleGeometry';
import { Arc } from '../../../models/types';
import { renderBoutBouts } from '../main-bouts-panel/main-bouts-panel';
import { HighlightedArc, HighlightedPoint } from '../../renders/render-constants';
import { PanelPalette } from '../../../theme/theme.service';

// UCut/LCut take a point halo; the rest take an arc halo
export type FholeHighlightKey = FholeArcKey | 'UCut' | 'LCut';

// eyes/stem placement is the placement panel's job; this page only bends what runs between
@Component({
  selector: 'app-ceruti-f-hole-contours-panel',
  imports: [FormsModule],
  templateUrl: './f-hole-contours-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class FHoleContoursPanel extends CerutiPanelBase implements OnInit {
  protected override readonly paletteId: PaletteId = 'varnish';
  static readonly renderToggles: readonly RenderToggleKey[] = ['showFholeBounds', 'showFholeArcs', 'showModuleGuides'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly getArcEndDeg = getArcEndDeg;
  protected readonly setArcEndDeg = setArcEndDeg;
  protected readonly getArcStartDeg = getArcStartDeg;
  protected readonly setArcStartDeg = setArcStartDeg;
  protected readonly getFieldDeg = getFieldDeg;
  protected readonly setFieldDeg = setFieldDeg;

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
    p.fHoles ??= defaultFHolePlacement(p);

    // the instrument as far as it's been taken under the contours, less the holes, this panel's own
    // and drawn in colour below, and the neck and scroll, which took the eye off them (2026-10-06)
    let renders: RenderLayer[] = [...renderFrontProfile(p, this.paths, this.pal, ensureFrontProfilePaths(p, this.paths, { neck: false }), { fHoles: false })];

    let failures = ensureFholePath(p, this.paths);

    let key = this.highlightedKey;
    let color = this.highlightedColor;
    // UCut/LCut have no arc of their own, so they show the tip their three numbers place
    let tip =
      key === 'UCut' ? { point: p.fHoles!.UTip!, color } :
      key === 'LCut' ? { point: p.fHoles!.LTip!, color } :
      null;
    let arc: Arc | null = key && key !== 'UCut' && key !== 'LCut' && !failures.some(f => f.unsolved.includes(key))
      ? p.fHoles![key] ?? null
      : null;

    this.flags.showFholeBounds && renders.push(renderFholeBounds(p, this.pal));
    this.flags.showModuleGuides && renders.push(renderBoutBouts(p, this.pal, true));
    renders.push(renderFholeContours(p, this.pal, this.flags.showFholeArcs, arc ? { arc, color } : null, tip, failures));

    return renders;
  }
}

export const renderFholeContours = (
  p: EnricoCerutiParams,
  pal: PanelPalette,
  showArcs: boolean,
  highlighted: HighlightedArc | null,
  highlightedPoint: HighlightedPoint | null,
  failures: FholeFailure[] = [],
) => (g: any, ui: any): void => {

  if (highlighted) {
    renderArcHalo(highlighted.arc, highlighted.color)(g, ui);
    renderArcHalo(flipArcAboutY(highlighted.arc), highlighted.color)(g, ui);
  }
  if (highlightedPoint) {
    renderPointHalo(highlightedPoint.point, highlightedPoint.color)(g, ui);
    renderPointHalo(flipPointAboutY(highlightedPoint.point), highlightedPoint.color)(g, ui);
  }

  let arcColors: Record<FholeArcKey, string> = {
    U1: pal.ink(2).mod(-0.6),
    U2: pal.ink(2),
    U21: pal.ink(2).mod(-0.6),
    U3: pal.ink(2).mod(0.6),
    S2: pal.ink(1),
    S1: pal.ink(1),
    L1: pal.ink(0).mod(-0.5),
    L2: pal.ink(0),
    L21: pal.ink(0).mod(-0.5),
    L3: pal.ink(0).mod(0.6),
    S4: pal.ink(1),
    S3: pal.ink(1),
  };
  let unsolved = new Set(failures.flatMap(f => f.unsolved));
  let solved = (key: FholeArcKey) => !unsolved.has(key);
  let drawn = (Object.keys(arcColors) as FholeArcKey[]).filter(key =>
    solved(key)
    && (key !== 'U21' || p.options.U21DoubleArc)
    && (key !== 'L21' || p.options.L21DoubleArc)
  );

  for (let key of drawn) {
    renderArcFromArc(p.fHoles[key]!, arcColors[key], STROKE_WEIGHT.trace)(g, ui);
    renderArcFromArc(flipArcAboutY(p.fHoles[key]!), arcColors[key], STROKE_WEIGHT.trace)(g, ui);
  }

  let cutStart = pointOnCircle(p.fHoles.UEye, p.fHoles.UCut.angleOnEye);
  renderSegment(cutStart, p.fHoles.UTip, pal.ink(4), STROKE_WEIGHT.trace)(g, ui);
  renderSegment(flipPointAboutY(cutStart), flipPointAboutY(p.fHoles.UTip), pal.ink(4), STROKE_WEIGHT.trace)(g, ui);

  let lowerCutStart = pointOnCircle(p.fHoles.LEye, p.fHoles.LCut.angleOnEye);
  renderSegment(lowerCutStart, p.fHoles.LTip, pal.ink(4), STROKE_WEIGHT.trace)(g, ui);
  renderSegment(flipPointAboutY(lowerCutStart), flipPointAboutY(p.fHoles.LTip), pal.ink(4), STROKE_WEIGHT.trace)(g, ui);

  // now we need to render the segments between the arc ends
  if (solved('S2') && solved('S4')) {
    let outerStemTop = pointOnCircle(p.fHoles.S2, p.fHoles.S2.end);
    let outerStemBottom = pointOnCircle(p.fHoles.S4, p.fHoles.S4.start);
    renderSegment(outerStemTop, outerStemBottom, pal.ink(1), STROKE_WEIGHT.trace)(g, ui);
    renderSegment(flipPointAboutY(outerStemTop), flipPointAboutY(outerStemBottom), pal.ink(1), STROKE_WEIGHT.trace)(g, ui);
  }

  if (solved('S1') && solved('S3')) {
    let innerStemTop = pointOnCircle(p.fHoles.S1, p.fHoles.S1.start);
    let innerStemBottom = pointOnCircle(p.fHoles.S3, p.fHoles.S3.end);
    renderSegment(innerStemTop, innerStemBottom, pal.ink(1), STROKE_WEIGHT.trace)(g, ui);
    renderSegment(flipPointAboutY(innerStemTop), flipPointAboutY(innerStemBottom), pal.ink(1), STROKE_WEIGHT.trace)(g, ui);
  }

  // now we render the eyes as arcs, not just circles
  if (solved('U1')) {
    let UpperEyeStartPt = circleCircleIntersections(p.fHoles.UEye, p.fHoles.U1)[0];
    let UpperEyeStartAngle = angleFromCenter(p.fHoles.UEye, UpperEyeStartPt);
    let eyeArc = new Arc(p.fHoles.UEye.x, p.fHoles.UEye.y, p.fHoles.UEye.r, UpperEyeStartAngle, p.fHoles.UCut.angleOnEye);
    renderArcFromArc(eyeArc, pal.ink(2), STROKE_WEIGHT.trace, true)(g, ui);
    renderArcFromArc(flipArcAboutY(eyeArc), pal.ink(2), STROKE_WEIGHT.trace, true)(g, ui);
  } else {
    renderCircle(p.fHoles.UEye, pal.ink(2), true)(g, ui);
  }

  if (solved('L1')) {
    let LowerEyeStartPt = circleCircleIntersections(p.fHoles.LEye, p.fHoles.L1)[0];
    let LowerEyeStartAngle = angleFromCenter(p.fHoles.LEye, LowerEyeStartPt);
    let lowerEyeArc = new Arc(p.fHoles.LEye.x, p.fHoles.LEye.y, p.fHoles.LEye.r, LowerEyeStartAngle, p.fHoles.LCut.angleOnEye);
    renderArcFromArc(lowerEyeArc, pal.ink(0), STROKE_WEIGHT.trace, true)(g, ui);
    renderArcFromArc(flipArcAboutY(lowerEyeArc), pal.ink(0), STROKE_WEIGHT.trace, true)(g, ui);
  } else {
    renderCircle(p.fHoles.LEye, pal.ink(0), true)(g, ui);
  }

  renderSolveFailures(failures, pal.alert, true)(g, ui);

  if (showArcs) {
    for (let key of drawn) {
      renderArcFromArcFancy(p.fHoles[key]!, arcColors[key])(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.fHoles[key]!), arcColors[key])(g, ui);
    }
  }
}

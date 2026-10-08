import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { adjustArcStart } from '../../../helpers/math/arcDegrees';
import { flipArcAboutY, flipCircleAboutY, offsetArcRadius } from '../../../helpers/math/simpleGeometry';
import { nearestFraction } from '../../../helpers/nearestFraction';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderCrosshair, renderDashedLine, renderPointHalo, renderSolveFailures } from '../../../helpers/renderFuncs';
import { STROKE_WEIGHT } from '../../../theme/palettes';
import { Arc } from '../../../models/types';
import { SolveFailure } from '../../../helpers/validators';
import { ensureCenterBoutInnerPath } from '../../calculation/outline/ceruti-calcs';
import { cornerOffsetSign } from '../../calculation/outline/ceruti-paths';
import { CerutiViewFlags, DefaultParams, EnricoCerutiParams, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { renderMainBouts, renderBounds, renderBoutBouts } from '../main-bouts-panel/main-bouts-panel';
import { renderCorners } from '../corners-panel/corners-panel';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { HighlightedArc, HighlightedPoint } from '../../renders/render-constants';
import { PanelPalette, ThemeService } from '../../../theme/theme.service';

export interface CenterBoutViewFlags {
  showModuleCircles: boolean;
  showAllCircles: boolean;
  showModuleArcs: boolean;
  showAllArcs: boolean;
  showModuleGuides: boolean;
  renderOuterPath: boolean;
}

@Component({
  selector: 'app-ceruti-center-bout-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './center-bout-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class CenterBoutPanel extends CerutiPanelBase implements OnInit {
  protected readonly pal = ThemeService.getPalette('classicCremona');
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleArcs', 'showAllArcs', 'showModuleGuides', 'renderOuterPath'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly nearestFraction = nearestFraction;
  protected readonly adjustArcStart = adjustArcStart;

  private highlightedArc: Arc | null = null;
  private highlightedArcColor = '';
  private highlightedCorner: 'upper' | 'lower' | null = null;

  private get highlighted(): HighlightedArc | null {
    return this.highlightedArc ? { arc: this.highlightedArc, color: this.highlightedArcColor } : null;
  }

  // Resolved at render time rather than captured on focus, so a reset replacing the Pt can't
  // leave the halo sitting at the old position.
  private get highlightedPoint(): HighlightedPoint | null {
    if (!this.highlightedCorner) return null;
    const upper = this.highlightedCorner === 'upper';
    const point = upper ? this.params.bouts.UCr : this.params.bouts.LCr;
    if (!point) return null;
    return { point, color: upper ? this.pal.ink(5).faint(5) : this.pal.ink(3).faint(5) };
  }

  ngOnInit(): void {
    this.emitImmediate(true);
  }

  onChange(): void {
    this.emitDebounced(true);
  }

  /** Hand-editing CBW or C0.y directly overrides the Kelly-fit C0 the same way toggling the checkbox off would. */
  onManualEdit(): void {
    this.params.options.useKellyC0 = false;
    this.onChange();
  }

  onArcFocus(arc: Arc, color: string): void {
    this.highlightedArc = arc;
    this.highlightedArcColor = color;
    this.emitImmediate(false);
  }

  onCornerFocus(corner: 'upper' | 'lower'): void {
    this.highlightedCorner = corner;
    this.emitImmediate(false);
  }

  // one blur for the panel: arc fields and corner fields both clear through here
  onArcBlur(): void {
    this.highlightedArc = null;
    this.highlightedArcColor = '';
    this.highlightedCorner = null;
    this.emitImmediate(false);
  }

  /** Clearing the corner hands it back to the default solve in `calculateCorners`. The Y ratio
   * goes back with it — it tracks whatever the corner was last set to, so leaving it would
   * re-derive the corner at the same height it was just rescued from. */
  resetCorner(corner: 'upper' | 'lower'): void {
    if (corner === 'upper') {
      this.params.bouts.UCr = null;
      this.params.ratios.UCYtoH = DefaultParams.ratios.UCYtoH;
    } else {
      this.params.bouts.LCr = null;
      this.params.ratios.LCYtoH = DefaultParams.ratios.LCYtoH;
    }
    this.highlightedCorner = null;
    this.emitImmediate(true);
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    const c = this.pal;
    const f = this.flags;
    const highlighted = this.highlighted;

    const failures = ensureCenterBoutInnerPath(p, this.paths);

    return [
      renderBounds(p, f.showModuleGuides),
      renderBoutBouts(p, c, f.showModuleGuides),
      renderMainBouts(p, c, f, false, highlighted),
      renderCorners(p, c, f, false, highlighted, true, null, failures),
      renderCenterBout(p, c, f, true, highlighted, true, this.highlightedPoint, failures),
      renderSolveFailures(failures, c.alert, true),
    ];
  }
}

export const renderCenterBout = (
  params: EnricoCerutiParams,
  pal: PanelPalette,
  flags: CenterBoutViewFlags,
  currentModule: boolean,
  highlighted: HighlightedArc | null,
  renderOuterPathCorners = true,
  highlightedPoint: HighlightedPoint | null = null,
  failures: SolveFailure[] = [],
) => (g: any, ui: any): void => {
  const p = params;
  const solved = (key: string) => !failures.some(f => f.unsolved.includes(key));
  const upper = solved('C2');
  const lower = solved('C1');

  if (highlighted) {
    renderArcHalo(highlighted.arc, highlighted.color)(g, ui);
    renderArcHalo(flipArcAboutY(highlighted.arc), highlighted.color)(g, ui);
  }

  // The focused corner's own crosshair goes down with the halo, so the mark reads even when the
  // module crosshairs below are switched off.
  if (highlightedPoint) {
    const mirrored = { x: -highlightedPoint.point.x, y: highlightedPoint.point.y };
    renderPointHalo(highlightedPoint.point, highlightedPoint.color)(g, ui);
    renderPointHalo(mirrored, highlightedPoint.color)(g, ui);
    renderCrosshair(highlightedPoint.point, highlightedPoint.color)(g, ui);
    renderCrosshair(mirrored, highlightedPoint.color)(g, ui);
  }

  if ((currentModule && flags.showModuleCircles) || flags.showAllCircles) {
    renderCircle(p.bouts.C0!, pal.ink(4))(g, ui);
    upper && renderCircle(p.bouts.C2!, pal.ink(5))(g, ui);
    lower && renderCircle(p.bouts.C1!, pal.ink(3))(g, ui);
    upper && renderCircle(flipCircleAboutY(p.bouts.C2!), pal.ink(5))(g, ui);
    lower && renderCircle(flipCircleAboutY(p.bouts.C1!), pal.ink(3))(g, ui);
    renderCircle(flipCircleAboutY(p.bouts.C0!), pal.ink(4))(g, ui);

    upper && p.options.C21DoubleArc && renderCircle(p.bouts.C21!, pal.ink(5))(g, ui);
    upper && p.options.C21DoubleArc && renderCircle(flipCircleAboutY(p.bouts.C21!), pal.ink(5))(g, ui);
    lower && p.options.C11DoubleArc && renderCircle(p.bouts.C11!, pal.ink(3))(g, ui);
    lower && p.options.C11DoubleArc && renderCircle(flipCircleAboutY(p.bouts.C11!), pal.ink(3))(g, ui);
    solved('L3') && p.options.L31DoubleArc && renderCircle(p.bouts.L31!, pal.ink(3))(g, ui);
    solved('L3') && p.options.L31DoubleArc && renderCircle(flipCircleAboutY(p.bouts.L31!), pal.ink(3))(g, ui);
    solved('U3') && p.options.U31DoubleArc && renderCircle(p.bouts.U31!, pal.ink(5))(g, ui);
    solved('U3') && p.options.U31DoubleArc && renderCircle(flipCircleAboutY(p.bouts.U31!), pal.ink(5))(g, ui);
  }

  if (currentModule && flags.showModuleGuides) {
    renderDashedLine({ x: -1000, y: p.bouts.C0!.y }, { x: 1000, y: p.bouts.C0!.y }, pal.ink(4))(g, ui);
  }

  if (currentModule && flags.showModuleArcs) {
    renderCrosshair(p.bouts.UCr!, pal.ink(5).faint(5))(g, ui);
    renderCrosshair(p.bouts.LCr!, pal.ink(3).faint(5))(g, ui);
    renderCrosshair({ x: -p.bouts.UCr!.x, y: p.bouts.UCr!.y }, pal.ink(5).faint(5))(g, ui);
    renderCrosshair({ x: -p.bouts.LCr!.x, y: p.bouts.LCr!.y }, pal.ink(3).faint(5))(g, ui);
  }

  if ((currentModule && flags.showModuleArcs) || flags.showAllArcs) {
    upper && renderArcFromArcFancy(p.bouts.C2!, pal.ink(5))(g, ui);
    upper && p.options.C21DoubleArc && renderArcFromArcFancy(p.bouts.C21!, pal.ink(5))(g, ui);

    lower && renderArcFromArcFancy(p.bouts.C1!, pal.ink(3))(g, ui);
    lower && p.options.C11DoubleArc && renderArcFromArcFancy(p.bouts.C11!, pal.ink(3))(g, ui);
    upper && lower && renderArcFromArcFancy(p.bouts.C0!, pal.ink(4))(g, ui);
    upper && renderArcFromArcFancy(flipArcAboutY(p.bouts.C2!), pal.ink(5))(g, ui);
    upper && p.options.C21DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.bouts.C21!), pal.ink(5))(g, ui);
    lower && renderArcFromArcFancy(flipArcAboutY(p.bouts.C1!), pal.ink(3))(g, ui);
    lower && p.options.C11DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.bouts.C11!), pal.ink(3))(g, ui);
    upper && lower && renderArcFromArcFancy(flipArcAboutY(p.bouts.C0!), pal.ink(4))(g, ui);
  } else {
    // in their own colours on this panel, where their fields are; grey under a later panel's work.
    // L31 and U31 are the corners' and stay grey here
    const cBoutUp = currentModule ? pal.ink(5) : pal.neutral;
    const cBout = currentModule ? pal.ink(4) : pal.neutral;
    const cBoutLow = currentModule ? pal.ink(3) : pal.neutral;
    upper && renderArcFromArc(p.bouts.C2!, cBoutUp, STROKE_WEIGHT.trace)(g, ui);
    lower && renderArcFromArc(p.bouts.C1!, cBoutLow, STROKE_WEIGHT.trace)(g, ui);
    upper && lower && renderArcFromArc(p.bouts.C0!, cBout, STROKE_WEIGHT.trace)(g, ui);
    upper && renderArcFromArc(flipArcAboutY(p.bouts.C2!), cBoutUp, STROKE_WEIGHT.trace)(g, ui);
    lower && renderArcFromArc(flipArcAboutY(p.bouts.C1!), cBoutLow, STROKE_WEIGHT.trace)(g, ui);
    upper && lower && renderArcFromArc(flipArcAboutY(p.bouts.C0!), cBout, STROKE_WEIGHT.trace)(g, ui);

    upper && p.options.C21DoubleArc && renderArcFromArc(p.bouts.C21!, cBoutUp, STROKE_WEIGHT.trace)(g, ui);
    lower && p.options.C11DoubleArc && renderArcFromArc(p.bouts.C11!, cBoutLow, STROKE_WEIGHT.trace)(g, ui);
    solved('L3') && p.options.L31DoubleArc && renderArcFromArc(p.bouts.L31!, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
    solved('U3') && p.options.U31DoubleArc && renderArcFromArc(p.bouts.U31!, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
    upper && p.options.C21DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.C21!), cBoutUp, STROKE_WEIGHT.trace)(g, ui);
    lower && p.options.C11DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.C11!), cBoutLow, STROKE_WEIGHT.trace)(g, ui);
    solved('L3') && p.options.L31DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.L31!), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
    solved('U3') && p.options.U31DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.U31!), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  }

  if (flags.renderOuterPath && renderOuterPathCorners) {
    const cBoutUp = currentModule ? pal.ink(5) : pal.neutral;
    const cBout = currentModule ? pal.ink(4) : pal.neutral;
    const cBoutLow = currentModule ? pal.ink(3) : pal.neutral;
    const inset = p.overhang + p.rib;

    upper && renderArcFromArc(offsetArcRadius(p.bouts.C2!, cornerOffsetSign(p, 'C2') * inset), cBoutUp, STROKE_WEIGHT.trace)(g, ui);
    upper && p.options.C21DoubleArc && renderArcFromArc(offsetArcRadius(p.bouts.C21!, cornerOffsetSign(p, 'C2') * inset), cBoutUp, STROKE_WEIGHT.trace)(g, ui);
    lower && renderArcFromArc(offsetArcRadius(p.bouts.C1!, cornerOffsetSign(p, 'C1') * inset), cBoutLow, STROKE_WEIGHT.trace)(g, ui);
    lower && p.options.C11DoubleArc && renderArcFromArc(offsetArcRadius(p.bouts.C11!, cornerOffsetSign(p, 'C1') * inset), cBoutLow, STROKE_WEIGHT.trace)(g, ui);
    upper && lower && renderArcFromArc(offsetArcRadius(p.bouts.C0!, -inset), cBout, STROKE_WEIGHT.trace)(g, ui);
    upper && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C2!), cornerOffsetSign(p, 'C2') * inset), cBoutUp, STROKE_WEIGHT.trace)(g, ui);
    upper && p.options.C21DoubleArc && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C21!), cornerOffsetSign(p, 'C2') * inset), cBoutUp, STROKE_WEIGHT.trace)(g, ui);
    lower && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C1!), cornerOffsetSign(p, 'C1') * inset), cBoutLow, STROKE_WEIGHT.trace)(g, ui);
    lower && p.options.C11DoubleArc && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C11!), cornerOffsetSign(p, 'C1') * inset), cBoutLow, STROKE_WEIGHT.trace)(g, ui);
    upper && lower && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C0!), -inset), cBout, STROKE_WEIGHT.trace)(g, ui);
  }
};

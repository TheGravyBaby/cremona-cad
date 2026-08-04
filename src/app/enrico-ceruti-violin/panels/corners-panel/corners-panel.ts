import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { adjustArcStart } from '../../../helpers/arcDegrees';
import { flipArcAboutY, flipCircleAboutY, offsetArcRadius } from '../../../helpers/draftMath';
import { nearestFraction } from '../../../helpers/nearestFraction';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderCrosshair, renderPointHalo } from '../../../helpers/renderFuncs';
import { Arc } from '../../../models/types';
import { calculateCorners } from '../../ceruti-calcs';
import { compoundArcInfo, cornerPositionInfo, violCornerInfo } from '../../ceruti-helpers';
import { CerutiColors, CerutiViewFlags, DefaultParams, EnricoCerutiParams } from '../../ceruti-types';
import { renderBounds, renderBoutBouts, renderCornerGuides } from '../../renders/guides.render';
import { renderMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { HighlightedArc, HighlightedPoint, PATH_STROKE_WIDTH } from '../../renders/render-constants';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

export interface CornersViewFlags {
  showModuleCircles: boolean;
  showAllCircles: boolean;
  showModuleArcs: boolean;
  showAllArcs: boolean;
  renderOuterPath: boolean;
}

@Component({
  selector: 'app-ceruti-corners-panel',
  imports: [FormsModule],
  templateUrl: './corners-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class CornersPanel extends CerutiPanelBase implements OnInit {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly nearestFraction = nearestFraction;
  protected readonly cornerPositionInfo = cornerPositionInfo;
  protected readonly violCornerInfo = violCornerInfo;
  protected readonly compoundArcInfo = compoundArcInfo;
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
    return { point, color: upper ? this.colors.centerBoutUpOff2 : this.colors.centerBoutLowOff2 };
  }

  ngOnInit(): void {
    this.emitImmediate(true);
  }

  onChange(): void {
    this.emitDebounced(true);
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
    const c = this.colors;
    const f = this.flags;
    const highlighted = this.highlighted;

    calculateCorners(p);
    return [
      renderBounds(p, f.showModuleGuides),
      renderBoutBouts(p, c, f.showModuleGuides),
      renderCornerGuides(p, f.showModuleGuides),
      renderBounds(p, false),
      renderMainBouts(p, c, f, false, highlighted),
      renderCorners(p, c, f, true, highlighted, true, this.highlightedPoint),
    ];
  }
}

export const renderCorners = (
  params: EnricoCerutiParams,
  colors: CerutiColors,
  flags: CornersViewFlags,
  currentModule: boolean,
  highlighted: HighlightedArc | null,
  renderOuterPathCorners = true,
  highlightedPoint: HighlightedPoint | null = null,
) => (g: any, ui: any): void => {
  const p = params;

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
    renderCircle(p.bouts.L2!, colors.lowerBoutOff)(g, ui);
    renderCircle(p.bouts.L3!, colors.centerBoutLow)(g, ui);
    !p.options.useViolCornerLC && p.options.L31DoubleArc && renderCircle(p.bouts.L31!, colors.lowerBoutOff)(g, ui);
    renderCircle(flipCircleAboutY(p.bouts.L2!), colors.lowerBoutOff)(g, ui);
    renderCircle(flipCircleAboutY(p.bouts.L3!), colors.centerBoutLow)(g, ui);
    !p.options.useViolCornerLC && p.options.L31DoubleArc && renderCircle(flipCircleAboutY(p.bouts.L31!), colors.lowerBoutOff)(g, ui);
    renderCircle(p.bouts.U2!, colors.upperBoutOff)(g, ui);
    renderCircle(p.bouts.U3!, colors.centerBoutUpOff)(g, ui);
    !p.options.useViolCornerUC && p.options.U31DoubleArc && renderCircle(p.bouts.U31!, colors.upperBoutOff)(g, ui);
    renderCircle(flipCircleAboutY(p.bouts.U2!), colors.upperBoutOff)(g, ui);
    renderCircle(flipCircleAboutY(p.bouts.U3!), colors.centerBoutUpOff)(g, ui);
    !p.options.useViolCornerUC && p.options.U31DoubleArc && renderCircle(flipCircleAboutY(p.bouts.U31!), colors.upperBoutOff)(g, ui);
  }
  if (currentModule && flags.showModuleArcs) {
    renderCrosshair(p.bouts.UCr!, colors.centerBoutUpOff2)(g, ui);
    renderCrosshair(p.bouts.LCr!, colors.centerBoutLowOff2)(g, ui);
    renderCrosshair({ x: -p.bouts.UCr!.x, y: p.bouts.UCr!.y }, colors.centerBoutUpOff2)(g, ui);
    renderCrosshair({ x: -p.bouts.LCr!.x, y: p.bouts.LCr!.y }, colors.centerBoutLowOff2)(g, ui);
  }

  if ((currentModule && flags.showModuleArcs) || flags.showAllArcs) {
    !p.options.useViolCornerLC && renderArcFromArcFancy(p.bouts.L2!, colors.lowerBoutOff)(g, ui);
    !p.options.useViolCornerLC && renderArcFromArcFancy(p.bouts.L3!, colors.centerBoutLow)(g, ui);
    !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArcFancy(p.bouts.L31!, colors.centerBoutLow)(g, ui);
    !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.bouts.L2!), colors.lowerBoutOff)(g, ui);
    !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.bouts.L31!), colors.centerBoutLow)(g, ui);
    !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.bouts.L3!), colors.centerBoutLow)(g, ui);
    p.options.useViolCornerLC && renderArcFromArcFancy(p.bouts.L4!, colors.lowerBoutOff)(g, ui);
    p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.bouts.L4!), colors.lowerBoutOff)(g, ui);

    !p.options.useViolCornerUC && renderArcFromArcFancy(p.bouts.U2!, colors.upperBoutOff)(g, ui);
    !p.options.useViolCornerUC && renderArcFromArcFancy(p.bouts.U3!, colors.centerBoutUp)(g, ui);
    !p.options.useViolCornerUC && p.options.U31DoubleArc && renderArcFromArcFancy(p.bouts.U31!, colors.centerBoutUp)(g, ui);
    !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.bouts.U2!), colors.upperBoutOff)(g, ui);
    !p.options.useViolCornerUC && p.options.U31DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.bouts.U31!), colors.centerBoutUp)(g, ui);

    !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.bouts.U3!), colors.centerBoutUp)(g, ui);
    p.options.useViolCornerUC && renderArcFromArcFancy(p.bouts.U4!, colors.upperBoutOff)(g, ui);
    p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.bouts.U4!), colors.upperBoutOff)(g, ui);
  } else {
    !p.options.useViolCornerLC && renderArcFromArc(p.bouts.L2!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && renderArcFromArc(p.bouts.L3!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArc(p.bouts.L31!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && renderArcFromArc(flipArcAboutY(p.bouts.L2!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && renderArcFromArc(flipArcAboutY(p.bouts.L3!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.L31!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    p.options.useViolCornerLC && renderArcFromArc(p.bouts.L4!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    p.options.useViolCornerLC && renderArcFromArc(flipArcAboutY(p.bouts.L4!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);

    !p.options.useViolCornerUC && renderArcFromArc(p.bouts.U2!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerUC && renderArcFromArc(p.bouts.U3!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerUC && p.options.U31DoubleArc && renderArcFromArc(p.bouts.U31!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerUC && renderArcFromArc(flipArcAboutY(p.bouts.U2!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerUC && renderArcFromArc(flipArcAboutY(p.bouts.U3!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerUC && p.options.U31DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.U31!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    p.options.useViolCornerUC && renderArcFromArc(p.bouts.U4!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    p.options.useViolCornerUC && renderArcFromArc(flipArcAboutY(p.bouts.U4!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
  }

  if (flags.renderOuterPath && renderOuterPathCorners) {
    const m = flags.showModuleArcs && currentModule;
    const lBoutOff = m ? colors.lowerBoutOff : colors.outerTrace;
    const cBoutLow = m ? colors.centerBoutLow : colors.outerTrace;
    const uBoutOff = m ? colors.upperBoutOff : colors.outerTrace;
    const cBoutUp = m ? colors.centerBoutUp : colors.outerTrace;
    const inset = p.overhang + p.rib;

    !p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(p.bouts.L2!, inset), lBoutOff, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(p.bouts.L3!, -inset), cBoutLow, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArc(offsetArcRadius(p.bouts.L31!, -inset), cBoutLow, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.L2!), inset), lBoutOff, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.L3!), -inset), cBoutLow, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.L31!), -inset), cBoutLow, PATH_STROKE_WIDTH)(g, ui);
    p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(p.bouts.L4!, inset), lBoutOff, PATH_STROKE_WIDTH)(g, ui);
    p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.L4!), inset), lBoutOff, PATH_STROKE_WIDTH)(g, ui);

    !p.options.useViolCornerUC && renderArcFromArc(offsetArcRadius(p.bouts.U2!, inset), uBoutOff, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerUC && renderArcFromArc(offsetArcRadius(p.bouts.U3!, -inset), cBoutUp, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerUC && p.options.U31DoubleArc && renderArcFromArc(offsetArcRadius(p.bouts.U31!, -inset), cBoutUp, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerUC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.U2!), inset), uBoutOff, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerUC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.U3!), -inset), cBoutUp, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerUC && p.options.U31DoubleArc && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.U31!), -inset), cBoutUp, PATH_STROKE_WIDTH)(g, ui);
    p.options.useViolCornerUC && renderArcFromArc(offsetArcRadius(p.bouts.U4!, inset), uBoutOff, PATH_STROKE_WIDTH)(g, ui);
    p.options.useViolCornerUC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.U4!), inset), uBoutOff, PATH_STROKE_WIDTH)(g, ui);
  }
};

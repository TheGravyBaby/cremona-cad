import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { adjustArcStart } from '../../../helpers/arcDegrees';
import { flipArcAboutY, flipCircleAboutY, offsetArcRadius } from '../../../helpers/draftMath';
import { nearestFraction } from '../../../helpers/nearestFraction';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderCrosshair, renderDashedLine } from '../../../helpers/renderFuncs';
import { Arc } from '../../../models/types';
import { ensureCenterBoutInnerPath } from '../../ceruti-calcs';
import { centerBoutWidthInfo, cornerPositionInfo, fitC0Info } from '../../ceruti-helpers';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, PathEntry } from '../../ceruti-types';
import { renderBounds, renderBoutBouts, renderCornerGuides } from '../../renders/guides.render';
import { HighlightedArc, PATH_STROKE_WIDTH } from '../../renders/render-constants';
import { renderMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { renderCorners } from '../corners-panel/corners-panel';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

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
  imports: [FormsModule],
  templateUrl: './center-bout-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class CenterBoutPanel extends CerutiPanelBase implements OnInit {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly nearestFraction = nearestFraction;
  protected readonly centerBoutWidthInfo = centerBoutWidthInfo;
  protected readonly fitC0Info = fitC0Info;
  protected readonly adjustArcStart = adjustArcStart;
  protected readonly cornerPositionInfo = cornerPositionInfo;

  private highlightedArc: Arc | null = null;
  private highlightedArcColor = '';

  private get highlighted(): HighlightedArc | null {
    return this.highlightedArc ? { arc: this.highlightedArc, color: this.highlightedArcColor } : null;
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

  onArcBlur(): void {
    this.highlightedArc = null;
    this.highlightedArcColor = '';
    this.emitImmediate(false);
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    const c = this.colors;
    const f = this.flags;
    const highlighted = this.highlighted;

    ensureCenterBoutInnerPath(p, this.paths);

    return [
      renderBounds(p, f.showModuleGuides),
      renderBoutBouts(p, c, f.showModuleGuides),
      renderCornerGuides(p, f.showModuleGuides),
      renderMainBouts(p, c, f, false, highlighted),
      renderCorners(p, c, f, false, highlighted),
      renderCenterBout(p, c, f, true, highlighted),
    ];
  }
}

export const renderCenterBout = (
  params: EnricoCerutiParams,
  colors: CerutiColors,
  flags: CenterBoutViewFlags,
  currentModule: boolean,
  highlighted: HighlightedArc | null,
  renderOuterPathCorners = true,
) => (g: any, ui: any): void => {
  const p = params;

  if (highlighted) {
    renderArcHalo(highlighted.arc, highlighted.color)(g, ui);
    renderArcHalo(flipArcAboutY(highlighted.arc), highlighted.color)(g, ui);
  }

  if ((currentModule && flags.showModuleCircles) || flags.showAllCircles) {
    renderCircle(p.bouts.C0!, colors.centerBout)(g, ui);
    renderCircle(p.bouts.C2!, colors.centerBoutUp)(g, ui);
    renderCircle(p.bouts.C1!, colors.centerBoutLow)(g, ui);
    renderCircle(flipCircleAboutY(p.bouts.C2!), colors.centerBoutUp)(g, ui);
    renderCircle(flipCircleAboutY(p.bouts.C1!), colors.centerBoutLow)(g, ui);
    renderCircle(flipCircleAboutY(p.bouts.C0!), colors.centerBout)(g, ui);

    p.options.C21DoubleArc && renderCircle(p.bouts.C21!, colors.centerBoutUpOff2)(g, ui);
    p.options.C21DoubleArc && renderCircle(flipCircleAboutY(p.bouts.C21!), colors.centerBoutUpOff2)(g, ui);
    p.options.C11DoubleArc && renderCircle(p.bouts.C11!, colors.centerBoutLowOff2)(g, ui);
    p.options.C11DoubleArc && renderCircle(flipCircleAboutY(p.bouts.C11!), colors.centerBoutLowOff2)(g, ui);
    p.options.L31DoubleArc && renderCircle(p.bouts.L31!, colors.centerBoutLowOff2)(g, ui);
    p.options.L31DoubleArc && renderCircle(flipCircleAboutY(p.bouts.L31!), colors.centerBoutLowOff2)(g, ui);
    p.options.U31DoubleArc && renderCircle(p.bouts.U31!, colors.centerBoutUpOff2)(g, ui);
    p.options.U31DoubleArc && renderCircle(flipCircleAboutY(p.bouts.U31!), colors.centerBoutUpOff2)(g, ui);
  }

  if (currentModule && flags.showModuleGuides) {
    renderDashedLine({ x: -1000, y: p.bouts.C0!.y }, { x: 1000, y: p.bouts.C0!.y }, colors.centerBoutOff2)(g, ui);
  }

  if (currentModule && flags.showModuleArcs) {
    renderCrosshair(p.bouts.UCr!, colors.centerBoutUpOff2)(g, ui);
    renderCrosshair(p.bouts.LCr!, colors.centerBoutLowOff2)(g, ui);
    renderCrosshair({ x: -p.bouts.UCr!.x, y: p.bouts.UCr!.y }, colors.centerBoutUpOff2)(g, ui);
    renderCrosshair({ x: -p.bouts.LCr!.x, y: p.bouts.LCr!.y }, colors.centerBoutLowOff2)(g, ui);
  }

  if ((currentModule && flags.showModuleArcs) || flags.showAllArcs) {
    renderArcFromArcFancy(p.bouts.C2!, colors.centerBoutUp)(g, ui);
    p.options.C21DoubleArc && renderArcFromArcFancy(p.bouts.C21!, colors.centerBoutUp)(g, ui);

    renderArcFromArcFancy(p.bouts.C1!, colors.centerBoutLow)(g, ui);
    p.options.C11DoubleArc && renderArcFromArcFancy(p.bouts.C11!, colors.centerBoutLow)(g, ui);
    renderArcFromArcFancy(p.bouts.C0!, colors.centerBout)(g, ui);
    renderArcFromArcFancy(flipArcAboutY(p.bouts.C2!), colors.centerBoutUp)(g, ui);
    p.options.C21DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.bouts.C21!), colors.centerBoutUp)(g, ui);
    renderArcFromArcFancy(flipArcAboutY(p.bouts.C1!), colors.centerBoutLow)(g, ui);
    p.options.C11DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.bouts.C11!), colors.centerBoutLow)(g, ui);
    renderArcFromArcFancy(flipArcAboutY(p.bouts.C0!), colors.centerBout)(g, ui);
  } else {
    renderArcFromArc(p.bouts.C2!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(p.bouts.C1!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(p.bouts.C0!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(flipArcAboutY(p.bouts.C2!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(flipArcAboutY(p.bouts.C1!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(flipArcAboutY(p.bouts.C0!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);

    p.options.C21DoubleArc && renderArcFromArc(p.bouts.C21!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    p.options.C11DoubleArc && renderArcFromArc(p.bouts.C11!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    p.options.L31DoubleArc && renderArcFromArc(p.bouts.L31!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    p.options.U31DoubleArc && renderArcFromArc(p.bouts.U31!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    p.options.C21DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.C21!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    p.options.C11DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.C11!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    p.options.L31DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.L31!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    p.options.U31DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.U31!), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
  }

  if (flags.renderOuterPath && renderOuterPathCorners) {
    const m = flags.showModuleArcs && currentModule;
    const cBoutUp = m ? colors.centerBoutUp : colors.outerTrace;
    const cBout = m ? colors.centerBout : colors.outerTrace;
    const cBoutLow = m ? colors.centerBoutLow : colors.outerTrace;
    const inset = p.overhang + p.rib;

    renderArcFromArc(offsetArcRadius(p.bouts.C2!, -inset), cBoutUp, PATH_STROKE_WIDTH)(g, ui);
    p.options.C21DoubleArc && renderArcFromArc(offsetArcRadius(p.bouts.C21!, -inset), cBoutUp, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(p.bouts.C1!, -inset), cBoutLow, PATH_STROKE_WIDTH)(g, ui);
    p.options.C11DoubleArc && renderArcFromArc(offsetArcRadius(p.bouts.C11!, -inset), cBoutLow, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(p.bouts.C0!, -inset), cBout, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C2!), -inset), cBoutUp, PATH_STROKE_WIDTH)(g, ui);
    p.options.C21DoubleArc && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C21!), -inset), cBoutUp, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C1!), -inset), cBoutLow, PATH_STROKE_WIDTH)(g, ui);
    p.options.C11DoubleArc && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C11!), -inset), cBoutLow, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C0!), -inset), cBout, PATH_STROKE_WIDTH)(g, ui);
  }
};

import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getArcEndDeg, getArcStartDeg, setArcEndDeg, setArcStartDeg } from '../../../helpers/arcDegrees';
import {
  flipAngleAboutYAxis, flipArcAboutY, flipCircleAboutY, flipPointAboutY, offsetArcRadius, pointOnCircle,
} from '../../../helpers/draftMath';
import { nearestFraction } from '../../../helpers/nearestFraction';
import {
  renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderLine,
} from '../../../helpers/renderFuncs';
import { arcFromCircle, Arc } from '../../../models/types';
import { calculateMainBouts } from '../../ceruti-calcs';
import { boutWidthInfo, violNeckInfo } from '../../ceruti-helpers';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams } from '../../ceruti-types';
import { renderBounds, renderBoutBouts } from '../../renders/guides.render';
import { HighlightedArc, PATH_STROKE_WIDTH } from '../../renders/render-constants';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

export interface MainBoutsViewFlags {
  showModuleCircles: boolean;
  showAllCircles: boolean;
  showModuleArcs: boolean;
  showAllArcs: boolean;
  renderOuterPath: boolean;
}

@Component({
  selector: 'app-ceruti-main-bouts-panel',
  imports: [FormsModule],
  templateUrl: './main-bouts-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})

export class MainBoutsPanel extends CerutiPanelBase implements OnInit {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly nearestFraction = nearestFraction;
  protected readonly boutWidthInfo = boutWidthInfo;
  protected readonly violNeckInfo = violNeckInfo;
  protected readonly getArcStartDeg = getArcStartDeg;
  protected readonly setArcStartDeg = setArcStartDeg;
  protected readonly getArcEndDeg = getArcEndDeg;
  protected readonly setArcEndDeg = setArcEndDeg;

  private highlightedArc: Arc | null = null;
  private highlightedArcColor = '';

  private get highlighted(): HighlightedArc | null {
    return this.highlightedArc ? { arc: this.highlightedArc, color: this.highlightedArcColor } : null;
  }

  ngOnInit(): void {
    // When the panel is shown, emit one initial render request so the parent
    // does not need to import panel-specific bootstrap helpers.
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

  onArcBlur(): void {
    this.highlightedArc = null;
    this.highlightedArcColor = '';
    this.emitImmediate(false);
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    const f = this.flags;
    const c = this.colors;
    const highlighted = this.highlighted;

    calculateMainBouts(p);
    return [
      renderBounds(p, f.showModuleGuides),
      renderBoutBouts(p, c, f.showModuleGuides),
      renderMainBouts(p, c, f, true, highlighted),
    ];
  }
}

export const renderMainBouts = (
  params: EnricoCerutiParams,
  colors: CerutiColors,
  flags: MainBoutsViewFlags,
  currentModule: boolean,
  highlighted: HighlightedArc | null,
) => (g: any, ui: any): void => {
  const p = params;
  const inset = p.overhang + p.rib;

  if (highlighted) {
    renderArcHalo(highlighted.arc, highlighted.color)(g, ui);
    renderArcHalo(flipArcAboutY(highlighted.arc), highlighted.color)(g, ui);
  }

  const wideTopArc = arcFromCircle(p.bouts.U0!, flipAngleAboutYAxis(p.bouts.U0!.end), p.bouts.U0!.end);
  const wideBottomArc = arcFromCircle(p.bouts.L0!, flipAngleAboutYAxis(p.bouts.L0!.end), p.bouts.L0!.end);
  const mirroredU1Arc = flipArcAboutY(p.bouts.U1!);
  const mirroredL1Arc = flipArcAboutY(p.bouts.L1!);

  if ((currentModule && flags.showModuleCircles) || flags.showAllCircles) {
    const mirrorU1 = flipCircleAboutY(p.bouts.U1!);
    const mirrorL1 = flipCircleAboutY(p.bouts.L1!);
    renderCircle(p.bouts.U0!, colors.upperBout)(g, ui);
    renderCircle(p.bouts.U1!, colors.upperBout)(g, ui);
    renderCircle(mirrorU1, colors.upperBout)(g, ui);
    renderCircle(p.bouts.L1!, colors.lowerBout)(g, ui);
    renderCircle(mirrorL1, colors.lowerBout)(g, ui);
    renderCircle(p.bouts.L0!, colors.lowerBout)(g, ui);
  }

  if ((currentModule && flags.showModuleArcs) || flags.showAllArcs) {
    if (params.options.useViolNeck) {
      const mirrorV0 = flipArcAboutY(p.viol.V0!);
      renderArcFromArcFancy(p.viol.V0!, colors.violNeck)(g, ui);
      renderArcFromArcFancy(mirrorV0, colors.violNeck)(g, ui);
      const mirrorU0 = flipArcAboutY(p.bouts.U0!);
      renderArcFromArcFancy(p.bouts.U0!, colors.upperBout)(g, ui);
      renderArcFromArcFancy(mirrorU0, colors.upperBout)(g, ui);
    } else {
      renderArcFromArcFancy(wideTopArc, colors.upperBout)(g, ui);
    }

    renderArcFromArcFancy(p.bouts.U1!, colors.upperBoutOff)(g, ui);
    renderArcFromArcFancy(mirroredU1Arc, colors.upperBoutOff)(g, ui);
    renderArcFromArcFancy(wideBottomArc, colors.lowerBout)(g, ui);
    renderArcFromArcFancy(p.bouts.L1!, colors.lowerBoutOff)(g, ui);
    renderArcFromArcFancy(mirroredL1Arc, colors.lowerBoutOff)(g, ui);
  } else {
    if (params.options.useViolNeck) {
      const mirrorV0 = flipArcAboutY(p.viol.V0!);
      renderArcFromArc(p.viol.V0!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
      renderArcFromArc(mirrorV0, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);

      const mirrorU0 = flipArcAboutY(p.bouts.U0!);
      renderArcFromArc(p.bouts.U0!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
      renderArcFromArc(mirrorU0, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);

      const endPt = pointOnCircle(p.viol.V0!, p.viol.V0?.start ?? 0);
      renderLine(endPt, flipPointAboutY(endPt), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    } else {
      renderArcFromArc(wideTopArc, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    }

    renderArcFromArc(p.bouts.U1!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(mirroredU1Arc, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(wideBottomArc, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(p.bouts.L1!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(mirroredL1Arc, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
  }

  if (flags.renderOuterPath) {
    const m = flags.showModuleArcs && currentModule;
    const outerTopColor = m ? colors.upperBout : colors.outerTrace;
    const outerTopOffColor = m ? colors.upperBoutOff : colors.outerTrace;
    const outerBotColor = m ? colors.lowerBout : colors.outerTrace;
    const outerBotOffColor = m ? colors.lowerBoutOff : colors.outerTrace;
    const violNeckColor = m ? colors.violNeck : colors.outerTrace;
    if (params.options.useViolNeck) {
      const mirrorV0 = flipArcAboutY(p.viol.V0!);
      renderArcFromArc(offsetArcRadius(p.viol.V0!, -inset), violNeckColor, PATH_STROKE_WIDTH)(g, ui);
      renderArcFromArc(offsetArcRadius(mirrorV0, -inset), violNeckColor, PATH_STROKE_WIDTH)(g, ui);
      const mirrorU0 = flipArcAboutY(p.bouts.U0!);
      renderArcFromArc(offsetArcRadius(p.bouts.U0!, inset), outerTopColor, PATH_STROKE_WIDTH)(g, ui);
      renderArcFromArc(offsetArcRadius(mirrorU0, inset), outerTopColor, PATH_STROKE_WIDTH)(g, ui);

      const endPt = pointOnCircle(p.viol.V0!, p.viol.V0?.start ?? 0);
      renderLine(endPt, flipPointAboutY(endPt), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    } else {
      renderArcFromArc(offsetArcRadius(wideTopArc, inset), outerTopColor, PATH_STROKE_WIDTH)(g, ui);
    }

    renderArcFromArc(offsetArcRadius(p.bouts.U1!, inset), outerTopOffColor, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(mirroredU1Arc, inset), outerTopOffColor, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(wideBottomArc, inset), outerBotColor, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(p.bouts.L1!, inset), outerBotOffColor, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(mirroredL1Arc, inset), outerBotOffColor, PATH_STROKE_WIDTH)(g, ui);
  }
};

import { arcFromCircle } from '../../models/types';
import {
  flipAngleAboutYAxis, flipArcAboutY, flipCircleAboutY, flipPointAboutY, offsetArcRadius, pointOnCircle,
} from '../../helpers/draftMath';
import {
  renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderLine,
} from '../../helpers/renderFuncs';
import { CerutiColors, EnricoCerutiParams } from '../ceruti-types';
import { HighlightedArc, PATH_STROKE_WIDTH } from './render-constants';

export interface MainBoutsViewFlags {
  showModuleCircles: boolean;
  showAllCircles: boolean;
  showModuleArcs: boolean;
  showAllArcs: boolean;
  renderOuterPath: boolean;
}

export const renderMainBouts = (
  params: EnricoCerutiParams,
  colors: CerutiColors,
  flags: MainBoutsViewFlags,
  currentModule: boolean,
  highlighted: HighlightedArc | null,
) => (g: any, ui: any): void => {
  let p = params;
  let inset = p.overhang + p.rib;

  if (highlighted) {
    renderArcHalo(highlighted.arc, highlighted.color)(g, ui);
    renderArcHalo(flipArcAboutY(highlighted.arc), highlighted.color)(g, ui);
  }

  let wideTopArc = arcFromCircle(p.bouts.U0!, flipAngleAboutYAxis(p.bouts.U0!.end), p.bouts.U0!.end);
  let wideBottomArc = arcFromCircle(p.bouts.L0!, flipAngleAboutYAxis(p.bouts.L0!.end), p.bouts.L0!.end);
  let mirroredU1Arc = flipArcAboutY(p.bouts.U1!);
  let mirroredL1Arc = flipArcAboutY(p.bouts.L1!);

  if ((currentModule && flags.showModuleCircles) || flags.showAllCircles) {
    let mirrorU1 = flipCircleAboutY(p.bouts.U1!);
    let mirrorL1 = flipCircleAboutY(p.bouts.L1!);
    renderCircle(p.bouts.U0!, colors.upperBout)(g, ui);
    renderCircle(p.bouts.U1!, colors.upperBout)(g, ui);
    renderCircle(mirrorU1, colors.upperBout)(g, ui);
    renderCircle(p.bouts.L1!, colors.lowerBout)(g, ui);
    renderCircle(mirrorL1, colors.lowerBout)(g, ui);
    renderCircle(p.bouts.L0!, colors.lowerBout)(g, ui);
  }

  if ((currentModule && flags.showModuleArcs) || flags.showAllArcs) {
    if (params.options.useViolNeck) {
      let mirrorV0 = flipArcAboutY(p.viol.V0!);
      renderArcFromArcFancy(p.viol.V0!, colors.violNeck)(g, ui);
      renderArcFromArcFancy(mirrorV0, colors.violNeck)(g, ui);
      let mirrorU0 = flipArcAboutY(p.bouts.U0!);
      renderArcFromArcFancy(p.bouts.U0!, colors.upperBout)(g, ui);
      renderArcFromArcFancy(mirrorU0, colors.upperBout)(g, ui);
    }
    else
      renderArcFromArcFancy(wideTopArc, colors.upperBout)(g, ui);

    renderArcFromArcFancy(p.bouts.U1!, colors.upperBoutOff)(g, ui);
    renderArcFromArcFancy(mirroredU1Arc, colors.upperBoutOff)(g, ui);
    renderArcFromArcFancy(wideBottomArc, colors.lowerBout)(g, ui);
    renderArcFromArcFancy(p.bouts.L1!, colors.lowerBoutOff)(g, ui);
    renderArcFromArcFancy(mirroredL1Arc, colors.lowerBoutOff)(g, ui);
  }
  else {
    if (params.options.useViolNeck) {
      let mirrorV0 = flipArcAboutY(p.viol.V0!);
      renderArcFromArc(p.viol.V0!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
      renderArcFromArc(mirrorV0, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);

      let mirrorU0 = flipArcAboutY(p.bouts.U0!);
      renderArcFromArc(p.bouts.U0!, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
      renderArcFromArc(mirrorU0, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);

      let EndPt = pointOnCircle(p.viol.V0!, p.viol.V0?.start ?? 0);
      renderLine(EndPt, flipPointAboutY(EndPt), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    }
    else
      renderArcFromArc(wideTopArc, colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);

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
      let mirrorV0 = flipArcAboutY(p.viol.V0!);
      renderArcFromArc(offsetArcRadius(p.viol.V0!, -inset), violNeckColor, PATH_STROKE_WIDTH)(g, ui);
      renderArcFromArc(offsetArcRadius(mirrorV0, -inset), violNeckColor, PATH_STROKE_WIDTH)(g, ui);
      let mirrorU0 = flipArcAboutY(p.bouts.U0!);
      renderArcFromArc(offsetArcRadius(p.bouts.U0!, inset), outerTopColor, PATH_STROKE_WIDTH)(g, ui);
      renderArcFromArc(offsetArcRadius(mirrorU0, inset), outerTopColor, PATH_STROKE_WIDTH)(g, ui);

      let EndPt = pointOnCircle(p.viol.V0!, p.viol.V0?.start ?? 0);
      renderLine(EndPt, flipPointAboutY(EndPt), colors.innerTrace, PATH_STROKE_WIDTH)(g, ui);
    }
    else
      renderArcFromArc(offsetArcRadius(wideTopArc, inset), outerTopColor, PATH_STROKE_WIDTH)(g, ui);

    renderArcFromArc(offsetArcRadius(p.bouts.U1!, inset), outerTopOffColor, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(mirroredU1Arc, inset), outerTopOffColor, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(wideBottomArc, inset), outerBotColor, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(p.bouts.L1!, inset), outerBotOffColor, PATH_STROKE_WIDTH)(g, ui);
    renderArcFromArc(offsetArcRadius(mirroredL1Arc, inset), outerBotOffColor, PATH_STROKE_WIDTH)(g, ui);
  }
};

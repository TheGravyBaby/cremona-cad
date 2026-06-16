import { flipArcAboutY, flipCircleAboutY, offsetArcRadius } from '../../helpers/draftMath';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderCrosshair } from '../../helpers/renderFuncs';
import { CerutiColors, EnricoCerutiParams } from '../ceruti-types';
import { HighlightedArc, PATH_STROKE_WIDTH } from './render-constants';

export interface CornersViewFlags {
  showModuleCircles: boolean;
  showAllCircles: boolean;
  showModuleArcs: boolean;
  showAllArcs: boolean;
  renderOuterPath: boolean;
}

export const renderCorners = (
  params: EnricoCerutiParams,
  colors: CerutiColors,
  flags: CornersViewFlags,
  currentModule: boolean,
  highlighted: HighlightedArc | null,
  renderOuterPathCorners: boolean = true,
) => (g: any, ui: any): void => {
  let p = params;

  if (highlighted) {
    renderArcHalo(highlighted.arc, highlighted.color)(g, ui);
    renderArcHalo(flipArcAboutY(highlighted.arc), highlighted.color)(g, ui);
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
  }
  else {
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

    // Lower corners — L2 expands outward (+inset), L3 is already outer so shrinks (-inset)
    !p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(p.bouts.L2!, inset), lBoutOff, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(p.bouts.L3!, -inset), cBoutLow, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArc(offsetArcRadius(p.bouts.L31!, -inset), cBoutLow, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.L2!), inset), lBoutOff, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.L3!), -inset), cBoutLow, PATH_STROKE_WIDTH)(g, ui);
    !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.L31!), -inset), cBoutLow, PATH_STROKE_WIDTH)(g, ui);
    p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(p.bouts.L4!, inset), lBoutOff, PATH_STROKE_WIDTH)(g, ui);
    p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.L4!), inset), lBoutOff, PATH_STROKE_WIDTH)(g, ui);

    // Upper corners — U2 expands outward (+inset), U3 is already outer so shrinks (-inset)
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

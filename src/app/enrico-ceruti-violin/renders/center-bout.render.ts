import { flipArcAboutY, flipCircleAboutY, offsetArcRadius } from '../../helpers/draftMath';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderDashedLine } from '../../helpers/renderFuncs';
import { CerutiColors, EnricoCerutiParams } from '../ceruti-types';
import { HighlightedArc, PATH_STROKE_WIDTH } from './render-constants';

export interface CenterBoutViewFlags {
  showModuleCircles: boolean;
  showAllCircles: boolean;
  showModuleArcs: boolean;
  showAllArcs: boolean;
  showModuleGuides: boolean;
  renderOuterPath: boolean;
}

export const renderCenterBout = (
  params: EnricoCerutiParams,
  colors: CerutiColors,
  flags: CenterBoutViewFlags,
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
  }
  else {
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

    // All center bout arcs are outer arcs — shrink with -inset
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

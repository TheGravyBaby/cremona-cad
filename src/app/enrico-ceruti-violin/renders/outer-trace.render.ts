import { flipArcAboutY, flipCircleAboutY } from '../../helpers/draftMath';
import { renderArcFromArc, renderArcFromArcFancy, renderCircle, renderCrosshair, renderFilledPath, renderPath } from '../../helpers/renderFuncs';
import { defineFlutingPlatformPath, defineOuterPath, defineOuterPurflingPath, definePurflingPath } from '../ceruti-calcs';
import { CerutiColors, EnricoCerutiParams } from '../ceruti-types';
import { PATH_STROKE_WIDTH } from './render-constants';

export interface OuterTraceViewFlags {
  showModuleArcs: boolean;
  showAllArcs: boolean;
  showModuleCircles: boolean;
  showAllCircles: boolean;
}

export const renderOuterTrace = (
  params: EnricoCerutiParams,
  colors: CerutiColors,
  flags: OuterTraceViewFlags,
  currentModule: boolean,
) => (g: any, ui: any): void => {
  let p = params;
  let offset = p.overhang + p.rib;
  let outerPath = defineOuterPath(p, offset, true);
  renderPath(outerPath, colors.outerTrace, PATH_STROKE_WIDTH)(g, ui);

  const purflingPath = definePurflingPath(p, offset);
  if (purflingPath !== null) renderPath(purflingPath, colors.innerTrace, 1)(g, ui);

  const outerPurflingPath = defineOuterPurflingPath(p, offset);
  if (outerPurflingPath !== null) renderPath(outerPurflingPath, colors.innerTrace, 1)(g, ui);

  const flutingPlatformPath = defineFlutingPlatformPath(p, offset);
  if (flutingPlatformPath !== null) renderFilledPath(flutingPlatformPath, colors.fluting)(g, ui);

  if ((currentModule && flags.showModuleArcs) || flags.showAllArcs) {
    // primary arcs + their mirrors
    !p.options.useViolCornerUC && !p.options.U31DoubleArc && renderArcFromArcFancy(p.outerCorners.U3!, colors.centerBoutUp)(g, ui);
    !p.options.useViolCornerUC && !p.options.U31DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.U3!), colors.centerBoutUp)(g, ui);

    !p.options.useViolCornerUC && !p.options.C21DoubleArc && renderArcFromArcFancy(p.outerCorners.C2!, colors.centerBoutUp)(g, ui);
    !p.options.useViolCornerUC && !p.options.C21DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.C2!), colors.centerBoutUp)(g, ui);

    !p.options.useViolCornerLC && !p.options.C11DoubleArc && renderArcFromArcFancy(p.outerCorners.C1!, colors.centerBoutLow)(g, ui);
    !p.options.useViolCornerLC && !p.options.C11DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.C1!), colors.centerBoutLow)(g, ui);
    !p.options.useViolCornerLC && !p.options.L31DoubleArc && renderArcFromArcFancy(p.outerCorners.L3!, colors.centerBoutLow)(g, ui);
    !p.options.useViolCornerLC && !p.options.L31DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.L3!), colors.centerBoutLow)(g, ui);

    // optional double arcs + their mirrors
    if (p.options.U31DoubleArc) {
      !p.options.useViolCornerUC && renderArcFromArcFancy(p.outerCorners.U31!, colors.centerBoutUp)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.U31!), colors.centerBoutUp)(g, ui);
    }
    if (p.options.C21DoubleArc) {
      !p.options.useViolCornerUC && renderArcFromArcFancy(p.outerCorners.C21!, colors.centerBoutUp)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.C21!), colors.centerBoutUp)(g, ui);
    }
    if (p.options.C11DoubleArc) {
      !p.options.useViolCornerLC && renderArcFromArcFancy(p.outerCorners.C11!, colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.C11!), colors.centerBoutLow)(g, ui);
    }
    if (p.options.L31DoubleArc) {
      !p.options.useViolCornerLC && renderArcFromArcFancy(p.outerCorners.L31!, colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.L31!), colors.centerBoutLow)(g, ui);
    }
  }

  if ((currentModule && flags.showModuleCircles) || flags.showAllCircles) {
    !p.options.useViolCornerUC && renderCircle(p.outerCorners.U3!, colors.centerBoutUpOff)(g, ui);
    !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.U3!), colors.centerBoutUpOff)(g, ui);

    !p.options.useViolCornerUC && renderCircle(p.outerCorners.C2!, colors.centerBoutUp)(g, ui);
    !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.C2!), colors.centerBoutUp)(g, ui);
    !p.options.useViolCornerLC && renderCircle(p.outerCorners.C1!, colors.centerBoutLow)(g, ui);
    !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.C1!), colors.centerBoutLow)(g, ui);

    !p.options.useViolCornerLC && renderCircle(p.outerCorners.L3!, colors.centerBoutLowOff)(g, ui);
    !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.L3!), colors.centerBoutLowOff)(g, ui);

    if (p.options.U31DoubleArc) {
      !p.options.useViolCornerUC && renderCircle(p.outerCorners.U31!, colors.centerBoutUpOff2)(g, ui);
      !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.U31!), colors.centerBoutUpOff2)(g, ui);
    }
    if (p.options.C21DoubleArc) {
      !p.options.useViolCornerUC && renderCircle(p.outerCorners.C21!, colors.centerBoutUpOff2)(g, ui);
      !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.C21!), colors.centerBoutUpOff2)(g, ui);
    }
    if (p.options.C11DoubleArc) {
      !p.options.useViolCornerLC && renderCircle(p.outerCorners.C11!, colors.centerBoutLowOff2)(g, ui);
      !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.C11!), colors.centerBoutLowOff2)(g, ui);
    }
    if (p.options.L31DoubleArc) {
      !p.options.useViolCornerLC && renderCircle(p.outerCorners.L31!, colors.centerBoutLowOff2)(g, ui);
      !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.L31!), colors.centerBoutLowOff2)(g, ui);
    }
  }
};

import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flipArcAboutY, flipCircleAboutY } from '../../../helpers/draftMath';
import { adjustArcEnd } from '../../../helpers/arcDegrees';
import { renderArcFromArcFancy, renderCircle, renderPath } from '../../../helpers/renderFuncs';
import { calculateOuterArcs, ensureOuterTracePaths, getPath, getPathOrNull } from '../../ceruti-calcs';
import { buttonInfo, cornerCutoffInfo, purflingInfo } from '../../ceruti-helpers';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, PathEntry } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

export interface OuterTraceViewFlags {
  showModuleArcs: boolean;
  showAllArcs: boolean;
  showModuleCircles: boolean;
  showAllCircles: boolean;
}

@Component({
  selector: 'app-ceruti-outer-trace-panel',
  imports: [FormsModule],
  templateUrl: './outer-trace-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class OuterTracePanel extends CerutiPanelBase implements OnInit {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly buttonInfo = buttonInfo;
  protected readonly cornerCutoffInfo = cornerCutoffInfo;
  protected readonly purflingInfo = purflingInfo;
  protected readonly adjustArcEnd = adjustArcEnd;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  onArcFocus(): void {
    this.emitImmediate();
  }

  onArcBlur(): void {
    this.emitImmediate();
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;

    calculateOuterArcs(p);
    ensureOuterTracePaths(p, this.paths);

    // Outline and purfling only. The channel is the Fluting Channel panel's
    // subject — it is cut against the purfling, so it belongs with the gouge
    // that cuts it rather than shaded in here where nothing can be set about it.
    const renders: RenderLayer[] = [
      renderPath(getPath(this.paths, 'back'), this.colors.outerTrace),
    ];
    const purflingPath = getPathOrNull(this.paths, 'purfling');
    if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
    const outerPurflingPath = getPathOrNull(this.paths, 'outerPurfling');
    if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));
    renders.push(renderOuterTraceGuides(p, this.colors, this.flags, true));

    return renders;
  }
}

/** Construction-guide arcs/circles for the outer-corner module; the trace itself is rendered from the path cache. */
export const renderOuterTraceGuides = (
  params: EnricoCerutiParams,
  colors: CerutiColors,
  flags: OuterTraceViewFlags,
  currentModule: boolean,
) => (g: any, ui: any): void => {
  const p = params;

  if ((currentModule && flags.showModuleArcs) || flags.showAllArcs) {
    !p.options.useViolCornerUC && !p.options.U31DoubleArc && renderArcFromArcFancy(p.outerCorners.U3!, colors.centerBoutUp)(g, ui);
    !p.options.useViolCornerUC && !p.options.U31DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.U3!), colors.centerBoutUp)(g, ui);

    !p.options.useViolCornerUC && !p.options.C21DoubleArc && renderArcFromArcFancy(p.outerCorners.C2!, colors.centerBoutUp)(g, ui);
    !p.options.useViolCornerUC && !p.options.C21DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.C2!), colors.centerBoutUp)(g, ui);

    !p.options.useViolCornerLC && !p.options.C11DoubleArc && renderArcFromArcFancy(p.outerCorners.C1!, colors.centerBoutLow)(g, ui);
    !p.options.useViolCornerLC && !p.options.C11DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.C1!), colors.centerBoutLow)(g, ui);
    !p.options.useViolCornerLC && !p.options.L31DoubleArc && renderArcFromArcFancy(p.outerCorners.L3!, colors.centerBoutLow)(g, ui);
    !p.options.useViolCornerLC && !p.options.L31DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.L3!), colors.centerBoutLow)(g, ui);

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

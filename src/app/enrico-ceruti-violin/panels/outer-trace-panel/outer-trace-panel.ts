import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flipArcAboutY, flipCircleAboutY } from '../../../helpers/math/simpleGeometry';
import { adjustArcEnd } from '../../../helpers/math/arcDegrees';
import { renderArcFromArc, renderArcFromArcFancy, renderCircle, renderPath } from '../../../helpers/renderFuncs';
import { STROKE_WEIGHT } from '../../../theme/palettes';
import { translatePath } from '../../../helpers/math/pathMath';
import { Arc, arcFromCircle } from '../../../models/types';
import { calculateOuterArcs, ensureFholePath, ensureOuterTracePaths } from '../../calculation/outline/ceruti-calcs';
import { renderPlatePair } from '../../renders/front-profile.render';
import { defineButton } from '../../calculation/outline/ceruti-paths';
import { plateLayoutOffset } from '../../calculation/arching/ceruti-arch-geometry';
import { CerutiViewFlags, EnricoCerutiParams, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { PanelPalette, ThemeService } from '../../../theme/theme.service';

export interface OuterTraceViewFlags {
  showModuleArcs: boolean;
  showAllArcs: boolean;
  showModuleCircles: boolean;
  showAllCircles: boolean;
}

@Component({
  selector: 'app-ceruti-outer-trace-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './outer-trace-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class OuterTracePanel extends CerutiPanelBase implements OnInit {
  protected readonly pal = ThemeService.getPalette('classicCremona');
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleArcs'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) flags!: CerutiViewFlags;
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
    const c = this.pal;

    calculateOuterArcs(p);
    ensureOuterTracePaths(p, this.paths);
    if (p.fHoles) ensureFholePath(p, this.paths);

    // Outline and purfling only. The channel is the Fluting Channel panel's
    // subject — it is cut against the purfling, so it belongs with the gouge
    // that cuts it rather than shaded in here where nothing can be set about it.
    return [
      ...renderPlatePair(p, this.paths, c, STROKE_WEIGHT.trace),
      renderButton(p, c, this.flags, plateLayoutOffset(p, 'bottom')),
      renderOuterTraceGuides(p, c, this.flags, true),
    ];
  }
}

// the button in the back plate's colour, over the back's grey outline, `dx` across with the back
const renderButton = (p: EnricoCerutiParams, pal: PanelPalette, flags: OuterTraceViewFlags, dx: number) => (g: any, ui: any): void => {
  const button = defineButton(p);
  if (!button) return;
  renderPath(translatePath(button.path, dx, 0), pal.ink(1), STROKE_WEIGHT.trace)(g, ui);
  if (flags.showModuleArcs || flags.showAllArcs) {
    renderArcFromArcFancy(arcFromCircle({ ...button.cap, x: button.cap.x + dx }, button.cap.start, button.cap.end), pal.ink(1))(g, ui);
  }
};

/** Construction-guide arcs/circles for the outer-corner module; the trace itself is rendered from the path cache. */
export const renderOuterTraceGuides = (
  params: EnricoCerutiParams,
  pal: PanelPalette,
  flags: OuterTraceViewFlags,
  currentModule: boolean,
) => (g: any, ui: any): void => {
  const p = params;

  // in their own colours on this panel, where their fields are; fancy with the arc toggles
  const fancy = (currentModule && flags.showModuleArcs) || flags.showAllArcs;
  const arc = (a: Arc, color: string) => (fancy ? renderArcFromArcFancy(a, color) : renderArcFromArc(a, color, STROKE_WEIGHT.trace))(g, ui);
  if (currentModule || fancy) {
    !p.options.useViolCornerUC && !p.options.U31DoubleArc && arc(p.outerCorners.U3!, pal.ink(5));
    !p.options.useViolCornerUC && !p.options.U31DoubleArc && arc(flipArcAboutY(p.outerCorners.U3!), pal.ink(5));

    !p.options.useViolCornerUC && !p.options.C21DoubleArc && arc(p.outerCorners.C2!, pal.ink(5));
    !p.options.useViolCornerUC && !p.options.C21DoubleArc && arc(flipArcAboutY(p.outerCorners.C2!), pal.ink(5));

    !p.options.useViolCornerLC && !p.options.C11DoubleArc && arc(p.outerCorners.C1!, pal.ink(3));
    !p.options.useViolCornerLC && !p.options.C11DoubleArc && arc(flipArcAboutY(p.outerCorners.C1!), pal.ink(3));
    !p.options.useViolCornerLC && !p.options.L31DoubleArc && arc(p.outerCorners.L3!, pal.ink(3));
    !p.options.useViolCornerLC && !p.options.L31DoubleArc && arc(flipArcAboutY(p.outerCorners.L3!), pal.ink(3));

    if (p.options.U31DoubleArc) {
      !p.options.useViolCornerUC && arc(p.outerCorners.U31!, pal.ink(5));
      !p.options.useViolCornerUC && arc(flipArcAboutY(p.outerCorners.U31!), pal.ink(5));
    }
    if (p.options.C21DoubleArc) {
      !p.options.useViolCornerUC && arc(p.outerCorners.C21!, pal.ink(5));
      !p.options.useViolCornerUC && arc(flipArcAboutY(p.outerCorners.C21!), pal.ink(5));
    }
    if (p.options.C11DoubleArc) {
      !p.options.useViolCornerLC && arc(p.outerCorners.C11!, pal.ink(3));
      !p.options.useViolCornerLC && arc(flipArcAboutY(p.outerCorners.C11!), pal.ink(3));
    }
    if (p.options.L31DoubleArc) {
      !p.options.useViolCornerLC && arc(p.outerCorners.L31!, pal.ink(3));
      !p.options.useViolCornerLC && arc(flipArcAboutY(p.outerCorners.L31!), pal.ink(3));
    }
  }

  if ((currentModule && flags.showModuleCircles) || flags.showAllCircles) {
    !p.options.useViolCornerUC && renderCircle(p.outerCorners.U3!, pal.ink(5))(g, ui);
    !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.U3!), pal.ink(5))(g, ui);

    !p.options.useViolCornerUC && renderCircle(p.outerCorners.C2!, pal.ink(5))(g, ui);
    !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.C2!), pal.ink(5))(g, ui);
    !p.options.useViolCornerLC && renderCircle(p.outerCorners.C1!, pal.ink(3))(g, ui);
    !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.C1!), pal.ink(3))(g, ui);

    !p.options.useViolCornerLC && renderCircle(p.outerCorners.L3!, pal.ink(3))(g, ui);
    !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.L3!), pal.ink(3))(g, ui);

    if (p.options.U31DoubleArc) {
      !p.options.useViolCornerUC && renderCircle(p.outerCorners.U31!, pal.ink(5))(g, ui);
      !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.U31!), pal.ink(5))(g, ui);
    }
    if (p.options.C21DoubleArc) {
      !p.options.useViolCornerUC && renderCircle(p.outerCorners.C21!, pal.ink(5))(g, ui);
      !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.C21!), pal.ink(5))(g, ui);
    }
    if (p.options.C11DoubleArc) {
      !p.options.useViolCornerLC && renderCircle(p.outerCorners.C11!, pal.ink(3))(g, ui);
      !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.C11!), pal.ink(3))(g, ui);
    }
    if (p.options.L31DoubleArc) {
      !p.options.useViolCornerLC && renderCircle(p.outerCorners.L31!, pal.ink(3))(g, ui);
      !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.L31!), pal.ink(3))(g, ui);
    }
  }
};

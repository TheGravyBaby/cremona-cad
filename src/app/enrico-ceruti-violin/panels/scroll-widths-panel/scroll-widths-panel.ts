import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { renderPath, renderSolveFailures } from '../../../helpers/renderFuncs';
import { CerutiColors, EnricoCerutiParams, RenderToggleKey } from '../../ceruti-types';
import { defaultNeckParams, defaultStringSetup } from '../../ceruti-neck';
import { calculateScroll, calculateScrollWidths } from '../../ceruti-scroll';
import { defineSideScrollPath } from '../../ceruti-paths';
import { pathPointColor, renderScrollNeck, renderScrollWidths } from '../../renders/scroll.render';
import { STROKE_WEIGHT } from '../../renders/render-constants';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';

@Component({
  selector: 'app-ceruti-scroll-widths-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './scroll-widths-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ScrollWidthsPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = [];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;

  private focused: number | null = null;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  onPointFocus(k: number): void {
    this.focused = k;
    this.emitImmediate();
  }

  onPointBlur(): void {
    this.focused = null;
    this.emitImmediate();
  }

  pointColor(k: number): string { return pathPointColor(this.colors, k, this.params.scroll!.pathWidths.length); }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.neck ??= defaultNeckParams(p);
    p.stringSetup ??= defaultStringSetup(p);
    const failures = calculateScroll(p);
    if (!failures.length) calculateScrollWidths(p);

    return [
      renderScrollNeck(p, this.colors, false),
      ...(failures.length ? [] : [
        renderPath(defineSideScrollPath(p), this.colors.outerTrace, STROKE_WEIGHT.trace),
        renderScrollWidths(p, this.colors, this.focused),
      ]),
      renderSolveFailures(failures, this.colors.pathError),
    ];
  }
}

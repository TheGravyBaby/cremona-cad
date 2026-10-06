import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { renderPath, renderSolveFailures } from '../../../helpers/renderFuncs';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, RenderToggleKey } from '../../ceruti-types';
import { defaultNeckParams, defaultStringSetup } from '../../calculation/neck/ceruti-neck';
import { calculateScroll, calculateScrollWidths, ScrollStationKey } from '../../calculation/neck/ceruti-scroll';
import { defineSideScrollPath } from '../../calculation/outline/ceruti-paths';
import { renderScrollNeck, renderScrollWidths, stationColor } from '../../renders/scroll.render';
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
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleGuides'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  private focused: ScrollStationKey | null = null;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  onPointFocus(key: ScrollStationKey): void {
    this.focused = key;
    this.emitImmediate();
  }

  onPointBlur(): void {
    this.focused = null;
    this.emitImmediate();
  }

  pointColor(key: ScrollStationKey): string { return stationColor(this.colors, key); }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.neck ??= defaultNeckParams(p);
    p.stringSetup ??= defaultStringSetup(p);
    const failures = calculateScroll(p);
    if (!failures.length) calculateScrollWidths(p);

    return [
      renderScrollNeck(p, this.colors, false, failures),
      ...(failures.length ? [] : [
        renderPath(defineSideScrollPath(p), this.colors.outerTrace, STROKE_WEIGHT.trace),
        renderScrollWidths(p, this.colors, this.focused, this.flags.showModuleGuides),
      ]),
      renderSolveFailures(failures, this.colors.pathError),
    ];
  }
}

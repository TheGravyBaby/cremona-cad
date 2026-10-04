import { Component, Input, OnInit } from '@angular/core';
import { renderPath, renderSolveFailures } from '../../../helpers/renderFuncs';
import { CerutiColors, EnricoCerutiParams, RenderToggleKey } from '../../ceruti-types';
import { defaultNeckParams, defaultStringSetup } from '../../ceruti-neck';
import { calculateScroll } from '../../ceruti-scroll';
import { defineSideScrollPath } from '../../ceruti-paths';
import { renderScrollNeck, renderScrollWidths } from '../../renders/scroll.render';
import { STROKE_WEIGHT } from '../../renders/render-constants';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

// uniform until backWidths/frontWidths carry a width per segment
const PLACEHOLDER_WIDTH = 24;

@Component({
  selector: 'app-ceruti-scroll-widths-panel',
  templateUrl: './scroll-widths-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ScrollWidthsPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = [];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;

  protected readonly width = PLACEHOLDER_WIDTH;

  ngOnInit(): void {
    this.emitImmediate();
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.neck ??= defaultNeckParams(p);
    p.stringSetup ??= defaultStringSetup(p);
    const failures = calculateScroll(p);

    return [
      renderScrollNeck(p, this.colors, false),
      ...(failures.length ? [] : [
        renderPath(defineSideScrollPath(p), this.colors.outerTrace, STROKE_WEIGHT.trace),
        renderScrollWidths(p, this.colors, this.width),
      ]),
      renderSolveFailures(failures, this.colors.pathError),
    ];
  }
}

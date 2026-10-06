import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, FlutingParams, PathEntry, RenderToggleKey, StringSetup } from '../../ceruti-types';
import { calculateNeck, defaultNeckParams, defaultStringSetup, stringLength } from '../../calculation/neck/ceruti-neck';
import { defaultArchingParams } from '../../calculation/arching/ceruti-arching';
import { defaultFlutingParams, LongArchSolve, solveLongArch } from '../../calculation/arching/ceruti-arch-geometry';
import { calculateOuterArcs, ensureFholePath, ensureNeckPath, ensureOuterTracePaths } from '../../calculation/outline/ceruti-calcs';
import { solveScrollForProfile } from '../../calculation/neck/ceruti-scroll';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { renderSolveFailures } from '../../../helpers/renderFuncs';
import { renderBodySection, sideViewOffsetX } from '../../renders/body-section.render';
import { renderFrontView, renderNeck, renderNeckHighlight, StringSetupHighlightKey } from '../neck-panel/neck-panel';

@Component({
  selector: 'app-ceruti-string-setup-panel',
  imports: [FormsModule, DecimalPipe, NumberStepperDirective],
  templateUrl: './string-setup-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class StringSetupPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showFingerboard', 'showFretMarks'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  private highlightedKey: StringSetupHighlightKey | null = null;
  private highlightedColor = '';

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  onFieldFocus(key: StringSetupHighlightKey, color: string): void {
    this.highlightedKey = key;
    this.highlightedColor = color;
    this.emitImmediate(false);
  }

  onFieldBlur(): void {
    this.highlightedKey = null;
    this.highlightedColor = '';
    this.emitImmediate(false);
  }

  get stringSetup(): StringSetup { return this.params.stringSetup!; }

  get stringLength(): number | null {
    return this.stringSetup.nutTop && this.stringSetup.bridgeTop ? stringLength(this.params) : null;
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.stringSetup ??= defaultStringSetup(p);
    p.arching ??= defaultArchingParams(p.height);
    calculateOuterArcs(p);
    p.neck ??= defaultNeckParams(p);

    const gouge: Record<'top' | 'bottom', FlutingParams> = {
      top: (p.arching.top.fluting ??= defaultFlutingParams(p)),
      bottom: (p.arching.bottom.fluting ??= defaultFlutingParams(p)),
    };
    const solved: Record<'top' | 'bottom', LongArchSolve | null> = {
      top: solveLongArch(p, p.arching.top.arch, gouge.top),
      bottom: solveLongArch(p, p.arching.bottom.arch, gouge.bottom),
    };
    const failures = calculateNeck(p, solved.top, gouge.top);
    const scroll = solveScrollForProfile(p);
    ensureNeckPath(p, this.paths);
    ensureOuterTracePaths(p, this.paths);
    if (p.fHoles) ensureFholePath(p, this.paths);

    const sideX = sideViewOffsetX(p);
    return [
      (g, ui) => {
        const side = {
          g: g.append('g').attr('transform', `translate(${sideX},0)`),
          ui: ui.append('g').attr('transform', `translate(${sideX},0)`),
        };
        renderBodySection(p, this.colors, { solved, gouge, color: this.colors.outerTrace })(side.g, side.ui);
        renderNeck(p, this.colors, { fingerboard: this.flags.showFingerboard, fretMarks: this.flags.showFretMarks, scroll, panel: 'stringSetup' })(side.g, side.ui);
        renderNeckHighlight(p, this.highlightedKey, this.highlightedColor, 'side')(side.g, side.ui);
        renderSolveFailures(failures, this.colors.pathError)(side.g, side.ui);
      },
      renderFrontView(p, this.paths, this.colors, 'stringSetup', this.flags.showFingerboard, scroll),
      renderNeckHighlight(p, this.highlightedKey, this.highlightedColor, 'front'),
    ];
  }
}

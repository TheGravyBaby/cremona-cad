import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, PathEntry, RenderToggleKey, StringSetup } from '../../ceruti-types';
import { defaultStringSetup, stringLength } from '../../calculation/neck/ceruti-neck';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { buildNeckSetRun, StringSetupHighlightKey } from '../neck-panel/neck-panel';

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
    this.params.stringSetup ??= defaultStringSetup(this.params);
    return buildNeckSetRun(this.params, this.paths, this.colors, 'stringSetup', {
      guides: false,
      fingerboard: this.flags.showFingerboard,
      fretMarks: this.flags.showFretMarks,
      highlight: this.highlightedKey,
      highlightColor: this.highlightedColor,
    });
  }
}

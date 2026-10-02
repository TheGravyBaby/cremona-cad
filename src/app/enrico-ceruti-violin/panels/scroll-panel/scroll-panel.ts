import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, RenderToggleKey, VoluteParams } from '../../ceruti-types';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { defaultNeckParams } from '../../ceruti-neck';
import { ensureVolute } from '../../ceruti-scroll';
import { backColor, frontColor, renderScroll, ScrollPart } from '../../renders/scroll.render';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

@Component({
  selector: 'app-ceruti-scroll-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './scroll-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ScrollPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleArcs', 'showAllArcs', 'showModuleGuides'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  get volute(): VoluteParams { return this.params.volute!; }
  backColor(i: number): string { return backColor(this.colors, i); }
  get hollowColor(): string { return this.backColor(this.volute.back.length); }
  frontColor(i: number): string { return frontColor(this.colors, i); }

  protected readonly backHelp = [
    "The arc carrying the spiral's front on up to the top of the scroll",
    'The arc from the top of the scroll on over to the back',
    'The arc from the back on down toward the pegbox',
  ];

  endDegrees(end: number): number { return Math.round(end * 1800 / Math.PI) / 10; }
  setEnd(arc: { end: number }, degrees: number): void {
    arc.end = degrees * Math.PI / 180;
    this.onChange();
  }

  private highlighted: ScrollPart | null = null;

  onFocus(part: ScrollPart): void {
    this.highlighted = part;
    this.emitImmediate(false);
  }

  onBlur(): void {
    this.highlighted = null;
    this.emitImmediate(false);
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.neck ??= defaultNeckParams(p);
    ensureVolute(p);
    return [renderScroll(p, this.colors, this.flags, this.highlighted)];
  }
}

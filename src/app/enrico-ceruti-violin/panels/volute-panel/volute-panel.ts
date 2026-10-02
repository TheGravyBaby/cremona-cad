import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, RenderToggleKey, VoluteParams, VoluteStyle } from '../../ceruti-types';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { defaultNeckParams } from '../../ceruti-neck';
import { defaultPitch, ensureVolute, VOLUTE_STYLES } from '../../ceruti-scroll';
import { arcColor, renderScroll, ScrollPart } from '../../renders/scroll.render';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

@Component({
  selector: 'app-ceruti-volute-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './volute-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class VolutePanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleArcs', 'showModuleGuides', 'showVoluteConstruction'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  protected readonly styles = Object.entries(VOLUTE_STYLES).map(([id, { label }]) => ({ id, label }));

  get volute(): VoluteParams { return this.params.volute!; }
  get custom(): boolean { return !!VOLUTE_STYLES[this.volute.style].custom; }
  get archimedean(): boolean { return this.volute.style === 'archimedean'; }
  arcColor(i: number): string { return arcColor(this.colors, i); }

  setStyle(style: VoluteStyle): void {
    this.volute.style = style;
    if (style === 'archimedean' && !(this.volute.pitch > 0)) this.volute.pitch = defaultPitch(this.volute.eyeRadius);
    this.onChange();
  }

  // the arc fields four to a row, a turn of the spiral each
  get arcRows(): number[][] {
    const rows: number[][] = [];
    this.volute.arcRadii.forEach((_, i) => i % 4 === 0 ? rows.push([i]) : rows.at(-1)!.push(i));
    return rows;
  }

  // an arc field's name: how many turns out from the eye its arc ends
  arcEnd(i: number): string { return turnsLabel((i + 1) / 4); }

  // the radii have to open outward, so one set past those after it carries them up to it
  setArcRadius(i: number, radius: number): void {
    const radii = this.volute.arcRadii;
    radii[i] = radius;
    if (Number.isFinite(radius)) for (let j = i + 1; j < radii.length && radii[j] < radius; j++) radii[j] = radius;
    this.onChange();
    this.onFocus({ spiral: i });
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
    return [renderScroll(p, this.colors, this.flags, this.highlighted, 'volute')];
  }
}

// a count of turns in quarters, as the luthier says it
const turnsLabel = (turns: number) => {
  const [whole, quarter] = [Math.floor(turns), Math.round(turns * 4) % 4];
  return `${whole || ''}${['', '¼', '½', '¾'][quarter]}`;
};

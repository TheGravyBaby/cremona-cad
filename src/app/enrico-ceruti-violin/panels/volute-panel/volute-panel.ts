import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getFieldDeg, setFieldDeg } from '../../../helpers/math/arcDegrees';
import { renderPath, renderSolveFailures } from '../../../helpers/renderFuncs';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, RenderToggleKey, ScrollParams } from '../../ceruti-types';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { defaultNeckParams, defaultStringSetup } from '../../calculation/neck/ceruti-neck';
import { calculateScroll, VOLUTE_STYLE_LABELS } from '../../calculation/neck/ceruti-scroll';
import { defineSideScrollPath } from '../../calculation/outline/ceruti-paths';
import { arcColor, renderScrollNeck, renderVolute } from '../../renders/scroll.render';
import { HighlightedArc, STROKE_WEIGHT } from '../../renders/render-constants';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

// a four point arc by its index innermost first, or a crown arc by name
export type VoluteHighlightKey = number | 'S0' | 'S1';

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

  protected readonly getFieldDeg = getFieldDeg;
  protected readonly setFieldDeg = setFieldDeg;
  protected readonly styles = Object.entries(VOLUTE_STYLE_LABELS).map(([id, label]) => ({ id, label }));

  // held as a key rather than the arc itself: calculateScroll rebuilds the spiral every pass, so
  // an arc captured on focus is stale by the time it would be drawn
  private highlightedKey: VoluteHighlightKey | null = null;
  private highlightedColor = '';

  get scroll(): ScrollParams { return this.params.scroll!; }
  get custom(): boolean { return this.scroll.style === 'fourPoint'; }
  get archimedean(): boolean { return this.scroll.style === 'archimedean'; }
  get kelly(): boolean { return this.scroll.style === 'kelly'; }
  arcColor(i: number): string { return arcColor(this.colors, i); }

  // the arc fields four to a row, a turn of the spiral each
  get arcRows(): number[][] {
    const rows: number[][] = [];
    this.scroll.arcRadii.forEach((_, i) => i % 4 === 0 ? rows.push([i]) : rows.at(-1)!.push(i));
    return rows;
  }

  // an arc field's name: how many turns out from the eye its arc ends
  arcEnd(i: number): string { return turnsLabel((i + 1) / 4); }

  // the radii have to open outward, so one set past those after it carries them up to it
  setArcRadius(i: number, radius: number): void {
    const radii = this.scroll.arcRadii;
    radii[i] = radius;
    if (Number.isFinite(radius)) for (let j = i + 1; j < radii.length && radii[j] < radius; j++) radii[j] = radius;
    this.onChange();
    this.onArcFocus(i, this.arcColor(i));
  }

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  onArcFocus(key: VoluteHighlightKey, color: string): void {
    this.highlightedKey = key;
    this.highlightedColor = color;
    this.emitImmediate(false);
  }

  onArcBlur(): void {
    this.highlightedKey = null;
    this.highlightedColor = '';
    this.emitImmediate(false);
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.neck ??= defaultNeckParams(p);
    p.stringSetup ??= defaultStringSetup(p);
    const failures = calculateScroll(p);

    const v = p.scroll!;
    const key = this.highlightedKey;
    const arc =
      key === null ? null :
      typeof key === 'number' ? v.spiral?.[v.spiral.length - 1 - key] ?? null :
      failures.some(f => f.unsolved.includes(key)) ? null :
      v[key];
    const highlighted: HighlightedArc | null = arc ? { arc, color: this.highlightedColor } : null;

    // the rest of the scroll for context, under the volute's own arcs, once it all solves
    return [
      renderScrollNeck(p, this.colors, this.flags.showModuleGuides, failures),
      ...(failures.length ? [] : [renderPath(defineSideScrollPath(p), this.colors.outerTrace, STROKE_WEIGHT.trace)]),
      renderVolute(p, this.colors, this.flags, true, highlighted, failures),
      renderSolveFailures(failures, this.colors.pathError),
    ];
  }
}

// a count of turns in quarters, as the luthier says it
const turnsLabel = (turns: number) => {
  const whole = Math.floor(turns);
  const quarter = Math.round(turns * 4) % 4;
  return `${whole || ''}${['', '¼', '½', '¾'][quarter]}`;
};

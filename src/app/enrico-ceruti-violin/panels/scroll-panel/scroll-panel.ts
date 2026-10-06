import { DecimalPipe } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getFieldDeg, setFieldDeg } from '../../../helpers/math/arcDegrees';
import { renderPath, renderSolveFailures } from '../../../helpers/renderFuncs';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, RenderToggleKey, ScrollParams } from '../../ceruti-types';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { defaultNeckParams, defaultStringSetup } from '../../calculation/neck/ceruti-neck';
import { calculateScroll, ScrollKey, scrollExtent, scrollLines } from '../../calculation/neck/ceruti-scroll';
import { defineSideScrollPath } from '../../calculation/outline/ceruti-paths';
import { renderScroll, renderScrollNeck, renderVolute } from '../../renders/scroll.render';
import { HighlightedArc, HighlightedSegment, STROKE_WEIGHT } from '../../renders/render-constants';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { nearestFraction } from '../../../helpers/nearestFraction';

// the arcs take an arc halo; the straights and the flat a segment halo on the line their length makes
export type ScrollHighlightKey = 'S2' | 'S3' | 'nape' | 'F0' | 'F1' | 'backStraight' | 'flat' | 'frontStraight';

@Component({
  selector: 'app-ceruti-scroll-panel',
  imports: [FormsModule, DecimalPipe, NumberStepperDirective],
  templateUrl: './scroll-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ScrollPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleArcs', 'showModuleGuides'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly getFieldDeg = getFieldDeg;
  protected readonly setFieldDeg = setFieldDeg;
  protected readonly nearestFraction = nearestFraction;

  // held as a key rather than the arc itself: calculateScroll rewrites every arc each pass
  private highlightedKey: ScrollHighlightKey | null = null;
  private highlightedColor = '';
  protected extent: { height: number; width: number } | null = null;

  get scroll(): ScrollParams { return this.params.scroll!; }

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  onArcFocus(key: ScrollHighlightKey, color: string): void {
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
    const color = this.highlightedColor;
    const solved = (k: ScrollKey) => !failures.some(f => f.unsolved.includes(k));
    this.extent = solved('S3') ? scrollExtent(v) : null;
    const line = (key === 'backStraight' || key === 'flat' || key === 'frontStraight') && solved(key) ? scrollLines(p)[key] : null;
    const arc = (key === 'S2' || key === 'S3' || key === 'nape' || key === 'F0' || key === 'F1') && solved(key) ? v[key] : null;
    const highlighted: HighlightedArc | null = arc ? { arc, color } : null;
    const highlightedLine: HighlightedSegment | null = line ? { line, color } : null;

    // the volute as plain profile, so only what this panel edits is in colour. The profile needs the
    // whole scroll solved, so a miss falls back to the volute's own render
    return [
      renderScrollNeck(p, this.colors, false, failures),
      failures.length
        ? renderVolute(p, this.colors, this.flags, false, null, failures)
        : renderPath(defineSideScrollPath(p), this.colors.outerTrace, STROKE_WEIGHT.trace),
      renderScroll(p, this.colors, this.flags, true, highlighted, highlightedLine, failures),
      renderSolveFailures(failures, this.colors.pathError),
    ];
  }
}

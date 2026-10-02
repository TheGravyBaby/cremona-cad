import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getFieldDeg, setFieldDeg } from '../../../helpers/math/arcDegrees';
import { renderSolveFailures } from '../../../helpers/renderFuncs';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, RenderToggleKey, VoluteParams } from '../../ceruti-types';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { defaultNeckParams } from '../../ceruti-neck';
import { calculateScroll, ScrollKey } from '../../ceruti-scroll';
import { renderScroll, renderScrollNeck, renderVolute } from '../../renders/scroll.render';
import { HighlightedArc, HighlightedSegment } from '../../renders/render-constants';
import { CerutiPanelBase, RenderLayer } from '../panel-base';

// the arcs take an arc halo; the straights and the flat a segment halo on the line their length makes
export type ScrollHighlightKey = 'S2' | 'S3' | 'nape' | 'F0' | 'F1' | 'backStraight' | 'flat' | 'frontStraight';

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

  protected readonly getFieldDeg = getFieldDeg;
  protected readonly setFieldDeg = setFieldDeg;

  // held as a key rather than the arc itself: calculateScroll rewrites every arc each pass
  private highlightedKey: ScrollHighlightKey | null = null;
  private highlightedColor = '';

  get volute(): VoluteParams { return this.params.volute!; }

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
    const failures = calculateScroll(p);

    const v = p.volute!;
    const key = this.highlightedKey;
    const color = this.highlightedColor;
    const solved = (k: ScrollKey) => !failures.some(f => f.unsolved.includes(k));
    const line =
      key === 'backStraight' ? v.backStraightLine :
      key === 'flat' ? v.flatLine :
      key === 'frontStraight' ? v.frontStraightLine :
      null;
    const arc = (key === 'S2' || key === 'S3' || key === 'nape' || key === 'F0' || key === 'F1') && solved(key) ? v[key] : null;
    const highlighted: HighlightedArc | null = arc ? { arc, color } : null;
    const highlightedLine: HighlightedSegment | null = line ? { line, color } : null;

    return [
      renderScrollNeck(p, this.colors, this.flags.showModuleGuides),
      renderVolute(p, this.colors, this.flags, false, null, failures),
      renderScroll(p, this.colors, this.flags, true, highlighted, highlightedLine, failures),
      renderSolveFailures(failures, this.colors.pathError),
    ];
  }
}

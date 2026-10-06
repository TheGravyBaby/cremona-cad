import { DecimalPipe } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getFieldDeg, setFieldDeg } from '../../../helpers/math/arcDegrees';
import { renderPath, renderSolveFailures, renderArcHalo, renderDashLine, renderSegment, renderSegmentHalo, STROKE_WEIGHT } from '../../../helpers/renderFuncs';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, RenderToggleKey, ScrollParams } from '../../ceruti-types';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { defaultNeckParams, defaultStringSetup } from '../../calculation/neck/ceruti-neck';
import { calculateScroll, ScrollKey, scrollExtent, scrollLines, ScrollFailure } from '../../calculation/neck/ceruti-scroll';
import { defineSideScrollPath } from '../../calculation/outline/ceruti-paths';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { nearestFraction } from '../../../helpers/nearestFraction';
import { dist } from '../../../helpers/math/simpleGeometry';
import { Pt } from '../../../models/types';
import { ScrollViewFlags, longArc, scrollArc, renderScrollNeck, renderVolute } from '../volute-panel/volute-panel';
import { HighlightedArc, HighlightedSegment } from '../../renders/render-constants';

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

// the back from S2 down to the nape, and the front up from the nut. A straight takes its arc's
// colour, the square line the nape's; module guides box the head
export const renderScroll = (
  p: EnricoCerutiParams,
  colors: CerutiColors,
  flags: ScrollViewFlags,
  currentModule: boolean,
  highlighted: HighlightedArc | null,
  highlightedLine: HighlightedSegment | null,
  failures: ScrollFailure[] = [],
) => (g: any, ui: any): void => {
  const v = p.scroll!;
  const unsolved = new Set(failures.flatMap(f => f.unsolved));
  const solved = (key: ScrollKey) => !unsolved.has(key);
  const fancy = (currentModule && flags.showModuleArcs) || flags.showAllArcs;

  if (highlighted) renderArcHalo(highlighted.arc, highlighted.color, undefined, undefined, longArc(highlighted.arc))(g, ui);
  if (highlightedLine) renderSegmentHalo(...highlightedLine.line, highlightedLine.color)(g, ui);

  if (currentModule && flags.showModuleGuides && solved('S3')) {
    const { height, width } = scrollExtent(v);
    const corners = [new Pt(0, 0), new Pt(0, height), new Pt(-width, height), new Pt(-width, 0)];
    for (let i = 0; i < 4; i++) renderDashLine(corners[i], corners[(i + 1) % 4], colors.neck, STROKE_WEIGHT.guide)(g, ui);
  }

  solved('S2') && scrollArc(v.S2, colors.scrollBackLight, fancy)(g, ui);
  solved('S3') && scrollArc(v.S3, colors.scrollBack, fancy)(g, ui);
  solved('nape') && scrollArc(v.nape, colors.scrollNape, fancy)(g, ui);
  solved('F0') && scrollArc(v.F0, colors.scrollFront, fancy)(g, ui);
  solved('F1') && scrollArc(v.F1, colors.scrollFrontLight, fancy)(g, ui);

  // a straight of no length, or a duck tail already at the nape, has nothing to draw
  const line = ([a, b]: [Pt, Pt], color: string) => dist(a, b) > 1e-9 && renderSegment(a, b, color, STROKE_WEIGHT.trace)(g, ui);
  const lines = scrollLines(p);
  solved('backStraight') && line(lines.backStraight, colors.scrollBackLight);
  solved('nape') && line(lines.square, colors.scrollNape);
  solved('flat') && line(lines.flat, colors.scrollFrontLight);
  solved('frontStraight') && line(lines.frontStraight, colors.scrollFront);
};

import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getFieldDeg, setFieldDeg } from '../../../helpers/math/arcDegrees';
import { renderPath, renderSolveFailures, renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderDashLine, renderPolygon, renderSegment, STROKE_WEIGHT } from '../../../helpers/renderFuncs';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, RenderToggleKey, ScrollParams } from '../../ceruti-types';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { defaultNeckParams, defaultStringSetup } from '../../calculation/neck/ceruti-neck';
import { calculateScroll, VOLUTE_STYLE_LABELS, ScrollFailure, ScrollKey, voluteConstruction } from '../../calculation/neck/ceruti-scroll';
import { defineSideScrollPath } from '../../calculation/outline/ceruti-paths';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { arcReach, normalizeRadians, TURN } from '../../../helpers/math/simpleGeometry';
import { Arc, Pt } from '../../../models/types';
import { scrollNeckStub } from '../../calculation/neck/ceruti-scroll-views';
import { HighlightedArc } from '../../renders/render-constants';

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

export type ScrollViewFlags = Pick<CerutiViewFlags, 'showModuleArcs' | 'showAllArcs' | 'showModuleGuides' | 'showVoluteConstruction'>;

// a spiral arc's colour on canvas and in the four point's fields, innermost first: each turn's two
// tones alternating arc by arc, the turns coming round again past three
export function arcColor(colors: CerutiColors, i: number): string {
  const turns = [
    [colors.voluteTurn1, colors.voluteTurn1Alt],
    [colors.voluteTurn2, colors.voluteTurn2Alt],
    [colors.voluteTurn3, colors.voluteTurn3Alt],
  ];
  return turns[Math.floor(i / 4) % 3][i % 2];
}

// a scroll arc runs counterclockwise from start to end, so one past a half turn is the long way round
export const longArc = (arc: Arc) => normalizeRadians(arc.end - arc.start) > TURN.half;

// every arc draws in its own colour; module arcs add its centre and the two radii that bound it
export const scrollArc = (arc: Arc, color: string, fancy: boolean) =>
  fancy ? renderArcFromArcFancy(arc, color, longArc(arc)) : renderArcFromArc(arc, color, STROKE_WEIGHT.trace, longArc(arc));

// the nut and the neck's end below it, for context. Module guides run the neck's front up to the
// crown's top, then back to S1's furthest reach
export const renderScrollNeck = (p: EnricoCerutiParams, colors: CerutiColors, showGuides: boolean, failures: ScrollFailure[] = []) => (g: any, ui: any): void => {
  const v = p.scroll!;
  const { thickness } = p.neck!;
  const { nutHeight } = p.neck!;
  const { nutThickness } = p.stringSetup ?? defaultStringSetup(p);
  const stub = scrollNeckStub(p);

  renderPolygon([new Pt(0, 0), new Pt(0, nutHeight), new Pt(nutThickness, nutHeight), new Pt(nutThickness, 0)], colors.nut, STROKE_WEIGHT.section)(g, ui);
  renderSegment(new Pt(0, -stub), new Pt(0, 0), colors.neckOff, STROKE_WEIGHT.section)(g, ui);
  // the neck's back runs on up to where the nape meets it, or to the nut's level while the nape is unsolved
  const backTop = failures.some(f => f.unsolved.includes('nape')) ? 0 : v.nape.y;
  if (backTop > -stub) renderSegment(new Pt(-thickness, -stub), new Pt(-thickness, backTop), colors.neckOff, STROKE_WEIGHT.section)(g, ui);

  if (!showGuides) return;
  const crownTop = Math.max(...[v.S0, v.S1].flatMap(a => arcReach(a, TURN.quarter)).map(pt => pt.y));
  const S1Back = Math.min(...arcReach(v.S1, TURN.half).map(pt => pt.x));
  if (!Number.isFinite(crownTop) || !Number.isFinite(S1Back)) return;
  renderDashLine(new Pt(0, 0), new Pt(0, crownTop), colors.neck, STROKE_WEIGHT.guide)(g, ui);
  renderDashLine(new Pt(0, crownTop), new Pt(S1Back, crownTop), colors.neck, STROKE_WEIGHT.guide)(g, ui);
};

// the eye, the spiral and the crown (S0, S1). The construction toggle adds the figure the spiral's
// centres are found on
export const renderVolute = (
  p: EnricoCerutiParams,
  colors: CerutiColors,
  flags: ScrollViewFlags,
  currentModule: boolean,
  highlighted: HighlightedArc | null,
  failures: ScrollFailure[] = [],
) => (g: any, ui: any): void => {
  const v = p.scroll!;
  const unsolved = new Set(failures.flatMap(f => f.unsolved));
  const solved = (key: ScrollKey) => !unsolved.has(key);
  const fancy = (currentModule && flags.showModuleArcs) || flags.showAllArcs;

  if (highlighted) renderArcHalo(highlighted.arc, highlighted.color, undefined, undefined, longArc(highlighted.arc))(g, ui);

  if (!solved('spiral')) return;
  renderCircle(v.eye, colors.neckOff)(g, ui);
  if (currentModule && flags.showVoluteConstruction) {
    for (const line of voluteConstruction(v)) {
      const placed = line.map(pt => new Pt(v.eye.x + pt.x, v.eye.y + pt.y));
      for (let i = 1; i < placed.length; i++) renderSegment(placed[i - 1], placed[i], colors.neckOff, STROKE_WEIGHT.guide, true)(g, ui);
    }
  }

  const inward = [...v.spiral!].reverse();
  for (let i = 0; i < inward.length; i++) scrollArc(inward[i], arcColor(colors, i), fancy)(g, ui);

  // the crown keeps the warm pair though it runs on into the back, which is cool
  solved('S0') && scrollArc(v.S0, colors.scrollFrontLight, fancy)(g, ui);
  solved('S1') && scrollArc(v.S1, colors.scrollFront, fancy)(g, ui);
};

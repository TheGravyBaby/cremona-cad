import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { renderPath, renderSolveFailures, renderCrosshair, renderPointHalo, renderStroke, STROKE_WEIGHT } from '../../../helpers/renderFuncs';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, RenderToggleKey } from '../../ceruti-types';
import { defaultNeckParams, defaultStringSetup } from '../../calculation/neck/ceruti-neck';
import { calculateScroll, calculateScrollWidths, ScrollStationKey, pegboxCavity, scrollExtent, scrollWidthStations } from '../../calculation/neck/ceruti-scroll';
import { defineSideScrollPath } from '../../calculation/outline/ceruti-paths';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { pathFromPolyline } from '../../../helpers/math/pathMath';
import { Pt } from '../../../models/types';
import { scrollNeckStub, scrollBackViewStrokes, scrollFrontViewStrokes } from '../../calculation/neck/ceruti-scroll-views';
import { renderScrollNeck } from '../volute-panel/volute-panel';

@Component({
  selector: 'app-ceruti-scroll-widths-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './scroll-widths-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ScrollWidthsPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleGuides'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  private focused: ScrollStationKey | null = null;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  onPointFocus(key: ScrollStationKey): void {
    this.focused = key;
    this.emitImmediate();
  }

  onPointBlur(): void {
    this.focused = null;
    this.emitImmediate();
  }

  pointColor(key: ScrollStationKey): string { return stationColor(this.colors, key); }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.neck ??= defaultNeckParams(p);
    p.stringSetup ??= defaultStringSetup(p);
    const failures = calculateScroll(p);
    if (!failures.length) calculateScrollWidths(p);

    return [
      renderScrollNeck(p, this.colors, false, failures),
      ...(failures.length ? [] : [
        renderPath(defineSideScrollPath(p), this.colors.outerTrace, STROKE_WEIGHT.trace),
        renderScrollWidths(p, this.colors, this.focused, this.flags.showModuleGuides),
      ]),
      renderSolveFailures(failures, this.colors.pathError),
    ];
  }
}

// a width's colour on canvas and in its field
export function stationColor(colors: CerutiColors, key: ScrollStationKey): string {
  const inks: Record<ScrollStationKey, string> = {
    nut: colors.scrollWidthNut, hip: colors.scrollWidthHip, throat: colors.scrollWidthThroat,
    duckTail: colors.scrollWidthDuckTail, reach: colors.scrollWidthReach, crown: colors.scrollWidthCrown,
    turn1Bottom: colors.scrollWidthTurn1Bottom, turn2Top: colors.scrollWidthTurn2Top,
    turn2Bottom: colors.scrollWidthTurn2Bottom, eye: colors.scrollWidthEye,
  };
  return inks[key];
}

// the side profile with a crosshair on each width and the pegbox's hollow dashed inside it, the back
// view beside the scroll's furthest reach and the front view beside the nut
export const renderScrollWidths = (p: EnricoCerutiParams, colors: CerutiColors, focused: ScrollStationKey | null, showGuides: boolean) => (g: any, ui: any): void => {
  const v = p.scroll!;
  const { nutThickness } = p.stringSetup!;
  const stations = scrollWidthStations(p);

  const gap = 20;
  const widest = Math.max(v.widths.eye, v.widths.hip, v.widths.duckTail, v.widths.reach, p.stringSetup!.nutWidth) / 2;
  const back = -scrollExtent(v).width - gap - widest;
  const front = nutThickness + gap + widest;

  const marked = stations.find(station => station.key === focused);
  if (marked) {
    const ink = stationColor(colors, marked.key);
    renderPointHalo(marked.at, ink)(g, ui);
    for (const center of [back, front]) {
      for (const side of [1, -1]) renderPointHalo(new Pt(center + side * marked.width / 2, marked.at.y), ink)(g, ui);
    }
  }

  const stub = scrollNeckStub(p);
  for (const stroke of scrollBackViewStrokes(p, (x, y) => new Pt(back + x, y), -stub)) renderStroke(stroke, colors[stroke.ink])(g, ui);
  for (const stroke of scrollFrontViewStrokes(p, (x, y) => new Pt(front + x, y), -stub)) renderStroke(stroke, colors[stroke.ink])(g, ui);

  // in the side view the hollow is inside the wood
  const cavity = pegboxCavity(p);
  if (cavity) renderPath(pathFromPolyline(cavity), colors.scrollFrontLight, STROKE_WEIGHT.trace, 1, '4,4')(g, ui);
  if (showGuides) for (const station of stations) renderCrosshair(station.at, stationColor(colors, station.key))(g, ui);
};

import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { renderCircle, renderDashLine, renderPath, renderSolveFailures, renderCrosshair, renderPointHalo, renderStroke, STROKE_WEIGHT } from '../../../helpers/renderFuncs';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, RenderToggleKey } from '../../ceruti-types';
import { defaultNeckParams, defaultStringSetup } from '../../calculation/neck/ceruti-neck';
import { calculateScroll, calculateScrollWidths, ScrollStationKey, pegboxCavity, scrollCompassWalk, scrollExtent, scrollWidthStations } from '../../calculation/neck/ceruti-scroll';
import { defineSideScrollPath } from '../../calculation/outline/ceruti-paths';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { pathFromPolyline } from '../../../helpers/math/pathMath';
import { Circle, Pt } from '../../../models/types';
import { pointOnCircle, TURN } from '../../../helpers/math/simpleGeometry';
import { scrollNeckStub, scrollBackViewStrokes, scrollFrontViewStrokes } from '../../calculation/neck/ceruti-scroll-views';
import { renderScrollNeck } from '../volute-panel/volute-panel';
import { TooltipDirective } from '../../../docs/tooltips';

@Component({
  selector: 'app-ceruti-scroll-widths-panel',
  imports: [TooltipDirective, FormsModule, NumberStepperDirective],
  templateUrl: './scroll-widths-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ScrollWidthsPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleArcs', 'showModuleGuides'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  private focused: ScrollStationKey | null = null;
  // the compass walk's step and the stretch it divides, read out beside the count, with the last
  // step where too few steps leave it short of the rest
  compass: { step: number; volute: number; last: number } | null = null;

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
    const failures = calculateScroll(p);
    if (!failures.length) calculateScrollWidths(p);
    if (failures.length) this.compass = null;
    else {
      const { step, volute, stations } = scrollCompassWalk(p);
      this.compass = { step, volute, last: stations.at(-1)!.along - stations.at(-2)!.along };
    }

    return [
      renderScrollNeck(p, this.colors, false, failures),
      ...(failures.length ? [] : [
        renderPath(defineSideScrollPath(p), this.colors.outerTrace, STROKE_WEIGHT.trace),
        renderScrollWidths(p, this.colors, this.focused, this.flags.showModuleGuides, this.flags.showModuleArcs),
      ]),
      renderSolveFailures(failures, this.colors.pathError),
    ];
  }
}

// a width's colour on canvas and in its field
export function stationColor(colors: CerutiColors, key: ScrollStationKey): string {
  const inks: Record<ScrollStationKey, string> = {
    nut: colors.scrollWidthNut, hip: colors.scrollWidthHip, throat: colors.scrollWidthThroat,
    duckTail: colors.scrollWidthDuckTail, foot: colors.scrollWidthFoot, backHip: colors.scrollWidthBackHip, poll: colors.scrollWidthPoll, crown: colors.scrollWidthCrown,
    turn1Bottom: colors.scrollWidthTurn1Bottom, turn2Top: colors.scrollWidthTurn2Top,
    turn2Bottom: colors.scrollWidthTurn2Bottom, eye: colors.scrollWidthEye,
  };
  return inks[key];
}

// the side profile with a crosshair on each width and the pegbox's hollow dashed inside it, the back
// view beside the scroll's furthest reach and the front view beside the nut. Module arcs draw each
// width in its own view as a circle of that diameter on the centreline at its height, as a maker
// marks widths on the blank, with a centreline down each view
export const renderScrollWidths = (p: EnricoCerutiParams, colors: CerutiColors, focused: ScrollStationKey | null, showGuides: boolean, showArcs: boolean) => (g: any, ui: any): void => {
  const v = p.scroll!;
  const { nutThickness } = p.stringSetup ?? defaultStringSetup(p);
  const stations = scrollWidthStations(p);

  const gap = 20;
  const widest = Math.max(v.widths.eye, v.widths.hip, v.widths.foot, v.widths.backHip, v.widths.poll, p.neck!.nutWidth) / 2;
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
  const frontStations: ScrollStationKey[] = ['nut', 'hip', 'throat'];
  if (showArcs) {
    // only the widths a maker sets out with compasses: behind, the crown, the poll and the duck
    // tail; in front, the crown, the throat and the hips. The crown's and the throat's hang as half
    // circles from the head's top and the pegbox's
    const marks: { key: ScrollStationKey; center: number; half: boolean }[] = [
      { key: 'crown', center: back, half: true },
      { key: 'poll', center: back, half: false },
      { key: 'duckTail', center: back, half: false },
      { key: 'crown', center: front, half: true },
      { key: 'throat', center: front, half: true },
      { key: 'hip', center: front, half: false },
    ];
    for (const { key, center, half } of marks) {
      const station = stations.find(st => st.key === key);
      if (!station) continue;
      const ink = stationColor(colors, key);
      const r = station.width / 2;
      if (half) renderPath(pathFromPolyline(Array.from({ length: 33 }, (_, i) => pointOnCircle({ x: center, y: station.at.y, r }, TURN.half + TURN.half * i / 32))), ink, STROKE_WEIGHT.guide)(g, ui);
      else renderCircle(new Circle(center, station.at.y, r), ink)(g, ui);
    }
    renderDashLine(new Pt(back, -stub), new Pt(back, scrollExtent(v).height), colors.scrollBack, STROKE_WEIGHT.guide)(g, ui);
    renderDashLine(new Pt(front, -stub), new Pt(front, scrollExtent(v).height), colors.neck, STROKE_WEIGHT.guide)(g, ui);
  }
  // a crosshair on each width's point in the side view, and on both its edges in its own view
  if (showGuides) {
    for (const station of stations) {
      const ink = stationColor(colors, station.key);
      renderCrosshair(station.at, ink)(g, ui);
      const center = frontStations.includes(station.key) ? front : back;
      for (const side of [1, -1]) renderCrosshair(new Pt(center + side * station.width / 2, station.at.y), ink)(g, ui);
    }
  }
};

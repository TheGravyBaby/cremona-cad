import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { renderCircle, renderDashLine, renderPath, renderSolveFailures, renderCrosshair, renderPointHalo, renderStroke } from '../../../helpers/renderFuncs';
import { STROKE_WEIGHT } from '../../../theme/palettes';
import { CerutiViewFlags, EnricoCerutiParams, RenderToggleKey } from '../../ceruti-types';
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
import { PanelPalette, ThemeService } from '../../../theme/theme.service';

@Component({
  selector: 'app-ceruti-scroll-widths-panel',
  imports: [TooltipDirective, FormsModule, NumberStepperDirective],
  templateUrl: './scroll-widths-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class ScrollWidthsPanel extends CerutiPanelBase implements OnInit {
  protected readonly pal = ThemeService.getPalette('stones');
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleArcs', 'showModuleGuides'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) flags!: CerutiViewFlags;

  private focused: { key: ScrollStationKey; color: string } | null = null;
  // the compass walk's step and the stretch it divides, read out beside the count, with the last
  // step where too few steps leave it short of the rest
  compass: { step: number; volute: number; last: number } | null = null;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  onPointFocus(key: ScrollStationKey, color: string): void {
    this.focused = { key, color };
    this.emitImmediate();
  }

  onPointBlur(): void {
    this.focused = null;
    this.emitImmediate();
  }

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
      renderScrollNeck(p, this.pal, false, failures),
      ...(failures.length ? [] : [
        renderPath(defineSideScrollPath(p), this.pal.neutral, STROKE_WEIGHT.trace),
        renderScrollWidths(p, this.pal, this.focused, this.flags.showModuleGuides, this.flags.showModuleArcs),
      ]),
      renderSolveFailures(failures, this.pal.alert),
    ];
  }
}

// the side profile with a crosshair on each width and the pegbox's hollow dashed inside it, the back
// view beside the scroll's furthest reach and the front view beside the nut. Module arcs draw each
// width in its own view as a circle of that diameter on the centreline at its height, as a maker
// marks widths on the blank, with a centreline down each view
export const renderScrollWidths = (p: EnricoCerutiParams, pal: PanelPalette, focused: { key: ScrollStationKey; color: string } | null, showGuides: boolean, showArcs: boolean) => (g: any, ui: any): void => {
  const v = p.scroll!;
  const { nutThickness } = p.stringSetup ?? defaultStringSetup(p);
  const stations = scrollWidthStations(p);

  const gap = 20;
  const widest = Math.max(v.widths.eye, v.widths.hip, v.widths.foot, v.widths.backHip, v.widths.poll, p.neck!.nutWidth) / 2;
  const back = -scrollExtent(v).width - gap - widest;
  const front = nutThickness + gap + widest;

  const marked = stations.find(station => station.key === focused?.key);
  if (marked && focused) {
    renderPointHalo(marked.at, focused.color)(g, ui);
    for (const center of [back, front]) {
      for (const side of [1, -1]) renderPointHalo(new Pt(center + side * marked.width / 2, marked.at.y), focused.color)(g, ui);
    }
  }

  // each part on the ink the side views draw it in: everything past the crown on the turns' ink, the
  // same in both views
  const stub = scrollNeckStub(p);
  const backView = scrollBackViewStrokes(p, (x, y) => new Pt(back + x, y), -stub);
  const frontView = scrollFrontViewStrokes(p, (x, y) => new Pt(front + x, y), -stub);
  for (const stroke of [...backView.neck, ...frontView.neck]) renderStroke(stroke, pal.neutral.faint(5))(g, ui);
  for (const stroke of [...backView.back, ...frontView.back]) renderStroke(stroke, pal.ink(1))(g, ui);
  for (const stroke of [...backView.backLight, ...frontView.backLight]) renderStroke(stroke, pal.ink(1).faint(-3))(g, ui);
  for (const stroke of [...backView.front, ...frontView.front]) renderStroke(stroke, pal.ink(3))(g, ui);
  for (const stroke of [...backView.frontLight, ...frontView.frontLight]) renderStroke(stroke, pal.ink(3).faint(-3))(g, ui);
  for (const stroke of [...backView.crown, ...frontView.crown]) renderStroke(stroke, pal.ink(1).faint(5))(g, ui);
  for (const stroke of [...backView.turns, ...frontView.turns]) renderStroke(stroke, pal.ink(2))(g, ui);
  for (const stroke of [...backView.nut, ...frontView.nut]) renderStroke(stroke, pal.ink(0))(g, ui);

  // in the side view the hollow is inside the wood
  const cavity = pegboxCavity(p);
  if (cavity) renderPath(pathFromPolyline(cavity), pal.ink(3).faint(-3), STROKE_WEIGHT.trace, 1, '4,4')(g, ui);
  const frontStations: ScrollStationKey[] = ['nut', 'hip', 'throat'];
  if (showArcs) {
    // only the widths a maker sets out with compasses: behind, the crown, the poll and the duck
    // tail; in front, the crown, the throat and the hips. The crown's and the throat's hang as half
    // circles from the head's top and the pegbox's
    const mark = (key: ScrollStationKey, center: number, half: boolean, color: string) => {
      const station = stations.find(st => st.key === key);
      if (!station) return;
      const r = station.width / 2;
      if (half) renderPath(pathFromPolyline(Array.from({ length: 33 }, (_, i) => pointOnCircle({ x: center, y: station.at.y, r }, TURN.half + TURN.half * i / 32))), color, STROKE_WEIGHT.guide)(g, ui);
      else renderCircle(new Circle(center, station.at.y, r), color)(g, ui);
    };
    mark('crown', back, true, pal.ink(1).faint(5));
    mark('poll', back, false, pal.ink(1).faint(-3));
    mark('duckTail', back, false, pal.ink(1).faint(3));
    mark('crown', front, true, pal.ink(1).faint(5));
    mark('throat', front, true, pal.ink(3).faint(1));
    mark('hip', front, false, pal.ink(3).faint(-3));
    renderDashLine(new Pt(back, -stub), new Pt(back, scrollExtent(v).height), pal.ink(1).faint(3), STROKE_WEIGHT.guide)(g, ui);
    renderDashLine(new Pt(front, -stub), new Pt(front, scrollExtent(v).height), pal.ink(3).faint(3), STROKE_WEIGHT.guide)(g, ui);
  }
  // a crosshair on each width's point in the side view, and on both its edges in its own view
  if (showGuides) {
    const crosshairs = (key: ScrollStationKey, color: string) => {
      const station = stations.find(st => st.key === key);
      if (!station) return;
      renderCrosshair(station.at, color)(g, ui);
      const center = frontStations.includes(key) ? front : back;
      for (const side of [1, -1]) renderCrosshair(new Pt(center + side * station.width / 2, station.at.y), color)(g, ui);
    };
    crosshairs('nut', pal.ink(3).faint(-1));
    crosshairs('hip', pal.ink(3).faint(-3));
    crosshairs('throat', pal.ink(3).faint(1));
    crosshairs('duckTail', pal.ink(1).faint(3));
    crosshairs('foot', pal.ink(1).faint(-4));
    crosshairs('backHip', pal.ink(1).faint(1));
    crosshairs('poll', pal.ink(1).faint(-3));
    crosshairs('crown', pal.ink(1).faint(5));
    crosshairs('turn1Bottom', pal.ink(2).faint(3));
    crosshairs('turn2Top', pal.ink(2).faint(-3));
    crosshairs('turn2Bottom', pal.ink(2).faint(1));
    crosshairs('eye', pal.ink(2).faint(-4));
  }
};

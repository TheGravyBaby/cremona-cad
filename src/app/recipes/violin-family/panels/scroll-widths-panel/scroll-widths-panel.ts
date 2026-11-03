import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dist, normalizeRadians, pointOnCircle, TURN } from '../../../../helpers/math/simpleGeometry';
import { arcRun, joinedRun, riseAlongRun, Run, straightRun } from '../../../../helpers/math/draftMath';
import { clipPolylineAtY, hermiteEvaluator, hymanFilterSlopes, naturalSplineSlopes, polylinePointAtY, rayPolylineIntersection } from '../../../../helpers/math/vibeMath';
import { arcPathData, pathFromLine, pathFromPolygon, pathFromPolyline } from '../../../../helpers/math/pathMath';
import { occludePath } from '../../../../helpers/math/pathVibes';
import {
  renderCircle, renderCrosshair, renderDashLine, renderPath, renderPointHalo, renderSolveFailures, renderStroke, StrokeShape,
} from '../../../../helpers/renderFuncs';
import { buildMiss, reportFailures, safeRun } from '../../../../helpers/validators';
import { Arc, Circle, Pt, Pt3D } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import {
  RenderLayer,
  ScrollWidths,
  ViolinFamilyPanel,
  ViolinFamilyParams,
  ViolinFamilyToggleKey,
  ViolinFamilyViewFlags,
} from '../../violin-family-types';
import {
  ScrollSolve,
  ScrollWidthsFailure,
  ScrollWidthsSolve,
} from '../../violin-family-solves';
import { calcNutThickness, renderScrollNeck, calcScrollExtent, calcScrollNeckStub } from '../volute-panel/volute-panel';
import { defineSideScrollPath, calcScrollLines, solveScroll } from '../pegbox-panel/pegbox-panel';

export type ScrollStationKey = 'nut' | 'neck' | keyof ScrollWidths;
export type ScrollStation = { key: ScrollStationKey; at: Pt; width: number };

@Component({
  selector: 'app-vf-scroll-widths-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './scroll-widths-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class ScrollWidthsPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleArcs', 'showModuleGuides'];
  protected readonly pal = ThemeService.getPalette('stones');

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; report() reads it
  w!: ScrollWidthsSolve;
  focused: { key: ScrollStationKey; color: string } | null = null;

  ngOnInit(): void {
    this.draw();
  }

  edited(): void {
    this.edit.emit();
    this.draw();
  }

  report(): void {
    reportFailures([...this.w.scroll.failures, ...this.w.failures], 'Scroll Widths');
  }

  focus(key: ScrollStationKey, color: string): void {
    this.focused = { key, color };
    this.draw();
  }

  blur(): void {
    this.focused = null;
    this.draw();
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let w = this.w = solveScrollWidths(p)!;
      let s = w.scroll;
      let whole = !s.failures.length && !w.failures.some(f => f.unsolved.length);
      this.drawn.emit([
        renderScrollNeck(p, s, this.pal, false),
        ...(whole ? [
          renderPath(defineSideScrollPath(p, s), this.pal.neutral, STROKE_WEIGHT.trace),
          renderScrollWidths(p, s, this.pal, this.focused, this.flags.showModuleGuides, this.flags.showModuleArcs),
        ] : []),
        renderSolveFailures([...s.failures, ...w.failures], this.pal.alert),
      ]);
    });
  }
}

const renderScrollViewPart = (backView: ScrollView, frontView: ScrollView, part: keyof ScrollView, color: string) => (g: any, ui: any): void => {
  for (let stroke of [...backView[part], ...frontView[part]]) renderStroke(stroke, color)(g, ui);
};

const renderWidthMark = (stations: ScrollStation[], key: ScrollStationKey, center: number, half: boolean, color: string) => (g: any, ui: any): void => {
  let station = stations.find(st => st.key === key);
  if (!station) return;
  let r = station.width / 2;
  if (half) renderPath(arcPathData(new Pt(center, station.at.y), r, TURN.half, TURN.full), color, STROKE_WEIGHT.guide)(g, ui);
  else renderCircle(new Circle(center, station.at.y, r), color)(g, ui);
};

const renderWidthCrosshairs = (stations: ScrollStation[], key: ScrollStationKey, center: number, color: string) => (g: any, ui: any): void => {
  let station = stations.find(st => st.key === key);
  if (!station) return;
  renderCrosshair(station.at, color)(g, ui);
  for (let side of [1, -1]) renderCrosshair(new Pt(center + side * station.width / 2, station.at.y), color)(g, ui);
};

// the side profile with a crosshair on each width, the back view beside the scroll's furthest reach and the front view beside the nut. Module arcs draw each
// width in its own view as a circle of that diameter on the centreline at its height, as a maker
// marks widths on the blank, with a centreline down each view. Everything is worked out here, once
// a draw; the canvas replays the layer on every pan and zoom
export const renderScrollWidths = (
  p: ViolinFamilyParams,
  s: ScrollSolve,
  pal: PanelPalette,
  focused: { key: ScrollStationKey; color: string } | null,
  showGuides: boolean,
  showArcs: boolean,
): RenderLayer => {
  let w = p.scroll!.widths;
  let stations = calcScrollWidthStations(p, s);
  // the views hold still while the widths are edited, a fixed reference against a photograph, until
  // the widest would reach the side profile
  let widest = Math.max(w.eye, w.hip, w.foot, w.poll, p.neck!.nutWidth) / 2;
  let clearance = Math.max(0.15 * p.body.height, 20 + widest);
  let extent = calcScrollExtent(s);
  let back = -extent.width - clearance;
  let front = calcNutThickness(p) + clearance;
  let stub = calcScrollNeckStub(p);
  let backView = buildScrollBackViewStrokes(p, s, (x, y) => new Pt(back + x, y), -stub);
  let frontView = buildScrollFrontViewStrokes(p, s, (x, y) => new Pt(front + x, y), -stub);

  return (g: any, ui: any): void => {
    let marked = stations.find(station => station.key === focused?.key);
    if (marked && focused) {
      renderPointHalo(marked.at, focused.color)(g, ui);
      for (let center of [back, front]) {
        for (let side of [1, -1]) renderPointHalo(new Pt(center + side * marked.width / 2, marked.at.y), focused.color)(g, ui);
      }
    }

    // each part on the ink the side views draw it in: everything past the crown on the turns' ink
    renderScrollViewPart(backView, frontView, 'neck', pal.neutral.faint(5))(g, ui);
    renderScrollViewPart(backView, frontView, 'back', pal.ink(1))(g, ui);
    renderScrollViewPart(backView, frontView, 'backLight', pal.ink(1).faint(-3))(g, ui);
    renderScrollViewPart(backView, frontView, 'front', pal.ink(3))(g, ui);
    renderScrollViewPart(backView, frontView, 'frontLight', pal.ink(3).faint(-3))(g, ui);
    renderScrollViewPart(backView, frontView, 'crown', pal.ink(1).faint(5))(g, ui);
    renderScrollViewPart(backView, frontView, 'turns', pal.ink(2))(g, ui);
    renderScrollViewPart(backView, frontView, 'nut', pal.ink(0))(g, ui);

    if (showArcs) {
      // only the widths a maker sets out with compasses: behind, the crown, the poll and the duck
      // tail; in front, the crown, the throat and the hips. The crown's and the throat's hang as
      // half circles from the head's top and the pegbox's
      renderWidthMark(stations, 'crown', back, true, pal.ink(1).faint(5))(g, ui);
      renderWidthMark(stations, 'poll', back, false, pal.ink(1).faint(-3))(g, ui);
      renderWidthMark(stations, 'duckTail', back, false, pal.ink(1).faint(3))(g, ui);
      renderWidthMark(stations, 'crown', front, true, pal.ink(1).faint(5))(g, ui);
      renderWidthMark(stations, 'throat', front, true, pal.ink(3).faint(1))(g, ui);
      renderWidthMark(stations, 'hip', front, false, pal.ink(3).faint(-3))(g, ui);
      renderDashLine(new Pt(back, -stub), new Pt(back, extent.height), pal.ink(1).faint(3), STROKE_WEIGHT.guide)(g, ui);
      renderDashLine(new Pt(front, -stub), new Pt(front, extent.height), pal.ink(3).faint(3), STROKE_WEIGHT.guide)(g, ui);
    }
    // a crosshair on each width's point in the side view, and on both its edges in its own view
    if (showGuides) {
      renderWidthCrosshairs(stations, 'neck', front, pal.neutral)(g, ui);
      renderWidthCrosshairs(stations, 'nut', front, pal.ink(3).faint(-1))(g, ui);
      renderWidthCrosshairs(stations, 'hip', front, pal.ink(3).faint(-3))(g, ui);
      renderWidthCrosshairs(stations, 'throat', front, pal.ink(3).faint(1))(g, ui);
      renderWidthCrosshairs(stations, 'duckTail', back, pal.ink(1).faint(3))(g, ui);
      renderWidthCrosshairs(stations, 'foot', back, pal.ink(1).faint(-4))(g, ui);
      renderWidthCrosshairs(stations, 'poll', back, pal.ink(1).faint(-3))(g, ui);
      renderWidthCrosshairs(stations, 'crown', back, pal.ink(1).faint(5))(g, ui);
      renderWidthCrosshairs(stations, 'turn1Bottom', back, pal.ink(2).faint(3))(g, ui);
      renderWidthCrosshairs(stations, 'turn2Top', back, pal.ink(2).faint(-3))(g, ui);
      renderWidthCrosshairs(stations, 'turn2Bottom', back, pal.ink(2).faint(1))(g, ui);
      renderWidthCrosshairs(stations, 'eye', back, pal.ink(2).faint(-4))(g, ui);
    }
  };
};

// the half-width of the widest stretch of the path standing nearer the viewer than z at height y,
// or null where none does. z is the side view's x, so from behind the lesser stands nearer and from
// in front the greater
function coverAt(on: ScrollStretches, y: number, z: number, behind: boolean): number | null {
  let cover: number | null = null;
  for (let stretch of [on.back, on.turn1Front, on.turn2Back, on.turn2Front, on.turn3Back, on.turn3Front]) {
    // a stretch hides nothing at the height it turns over at: a line cut there stops on the turn's face
    let turnsOver = Math.abs(y - stretch[0].y) < 1e-9 || Math.abs(y - stretch.at(-1)!.y) < 1e-9;
    let over = turnsOver ? null : polylinePointAtY(stretch, y);
    if (!over || !(behind ? over.z < z - 1e-6 : over.z > z + 1e-6)) continue;
    cover = Math.max(cover ?? 0, over.x);
  }
  return cover;
}

function isHiddenAt(on: ScrollStretches, pt: Pt3D, behind: boolean): boolean {
  return (coverAt(on, pt.y, pt.z, behind) ?? -Infinity) >= pt.x - 1e-9;
}

function lerpPt3D(a: Pt3D, b: Pt3D, t: number): Pt3D {
  return new Pt3D(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}

// what of a line can be seen: its runs that no nearer stretch at least as wide hides, each cut
// where the widths cross, so a turn's edge runs right up to the one that hides it
function calcSeenRuns(on: ScrollStretches, pts: Pt3D[], behind: boolean): Pt3D[][] {
  let runs: Pt3D[][] = [[]];
  let was: boolean | null = null;
  pts.forEach((pt, k) => {
    let is = isHiddenAt(on, pt, behind);
    if (was !== null && is !== was) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 30; i++) {
        let mid = (lo + hi) / 2;
        if (isHiddenAt(on, lerpPt3D(pts[k - 1], pt, mid), behind) === was) lo = mid; else hi = mid;
      }
      runs.at(-1)!.push(lerpPt3D(pts[k - 1], pt, was ? hi : lo));
    }
    if (!is) runs.at(-1)!.push(pt);
    else if (!was) runs.push([]);
    was = is;
  });
  return runs.filter(run => run.length > 1);
}

// the pegbox's front, sawn straight through the blank: from the hips in to the nut's edge at its
// top, square to the foot of the nut, and closing level there
function calcPegboxFrontOutline(p: ViolinFamilyParams, s: ScrollSolve) {
  let { nutHeight } = p.neck!;
  let hipY = calcPegboxHipHeight(p);
  let hips = new Pt(pegboxWidthAt(p, s, hipY) / 2, hipY);
  let foot = Math.min(hipY, 0);
  let walls = [
    hips,
    ...(nutHeight < hipY - 1e-6 ? [new Pt(pegboxWidthAt(p, s, nutHeight) / 2, nutHeight)] : []),
    ...(foot < hipY - 1e-6 ? [new Pt(pegboxWidthAt(p, s, foot) / 2, foot)] : []),
  ];
  let bottom = [new Pt(pegboxWidthAt(p, s, foot) / 2, foot), new Pt(0, foot)];
  return { walls, bottom };
}

export type ScrollViewStroke = { weight: number } & StrokeShape;
export type ScrollView = Record<'front' | 'back' | 'frontLight' | 'backLight' | 'turns' | 'crown' | 'nut' | 'neck', ScrollViewStroke[]>;
type ScrollViewPart = keyof ScrollView;

// a view's points go where `place` says: x across from the centreline, y up the neck. What hides
// what is worked out looking along the neck's own normal
type PlaceInView = (x: number, y: number) => Pt;

function buildEmptyScrollView(): ScrollView {
  return { neck: [], nut: [], back: [], front: [], turns: [], backLight: [], frontLight: [], crown: [] };
}

function pushViewStroke(parts: ScrollView, d: string, part: ScrollViewPart, weight: number, cover: string | string[] | null): void {
  let shown = cover ? occludePath(d, cover).visible : d;
  if (shown) parts[part].push({ d: shown, weight });
}

// a half outline, x out from the centreline, drawn on both sides of it
function pushViewContour(parts: ScrollView, place: PlaceInView, pts: { x: number; y: number }[], part: ScrollViewPart, cover: string | string[] | null = null): void {
  if (pts.length < 2) return;
  for (let side of [1, -1]) pushViewStroke(parts, pathFromPolyline(pts.map(pt => place(side * pt.x, pt.y))), part, STROKE_WEIGHT.trace, cover);
}

function pushViewLine(parts: ScrollView, a: Pt, b: Pt, part: ScrollViewPart): void {
  parts[part].push({ line: [a, b], weight: STROKE_WEIGHT.trace });
}

// a turn's face, seen edge on where the path turns over: level from the turn's own half-width in
// to whatever stands nearer the viewer at that height, or right across where nothing does
function pushViewFace(parts: ScrollView, place: PlaceInView, y: number, from: number, to: number | null, part: ScrollViewPart): void {
  if (to === null) pushViewLine(parts, place(-from, y), place(from, y), part);
  else if (to < from) for (let side of [1, -1]) pushViewLine(parts, place(side * from, y), place(side * to, y), part);
}

// the scroll from behind, the neck's sides running on up from `neckFrom` until they meet it
export function buildScrollBackViewStrokes(p: ViolinFamilyParams, s: ScrollSolve, place: PlaceInView, neckFrom: number): ScrollView {
  let v = p.scroll!;
  let eye = s.eye!;
  let eyeHalf = v.widths.eye / 2;
  let eyeTop = eye.y + eye.r;
  let eyeBottom = eye.y - eye.r;
  let on = calcScrollPathStretches(p, s);
  let start = on.back[0];
  let crown = on.back.at(-1)!;
  let turn1Bottom = on.turn1Front.at(-1)!;
  let turn2Top = on.turn2Back.at(-1)!;
  let turn2Bottom = on.turn2Front.at(-1)!;
  let turn3Top = on.turn3Back.at(-1)!;
  let parts = buildEmptyScrollView();

  // the back starts in the duck tail's round, the neck's back carried on round, its sides running on
  // straight up to the foot, and its own edges run up from there
  let r = calcDuckTailRadius(p);
  let roundTop = calcDuckTailRoundTop(p, s);
  let round = Array.from({ length: 33 }, (_, i) => pointOnCircle({ x: 0, y: roundTop, r }, TURN.half + TURN.half * i / 32)).map(pt => place(pt.x, pt.y));
  if (start.y - roundTop > 1e-6) round = [place(-r, start.y), ...round, place(r, start.y)];

  // the neck's sides run on up until they meet the scroll's round
  let overNeck = r > 0 ? [pathFromPolygon(round)] : null;
  for (let side of [1, -1]) {
    pushViewStroke(parts, pathFromLine(place(side * scrollNeckHalfWidthAt(p, neckFrom), neckFrom), place(side * scrollNeckHalfWidthAt(p, start.y), start.y)), 'neck', STROKE_WEIGHT.section, overNeck);
  }

  // the head's back stands nearest and shows whole. Every other stretch shows wherever it stands out
  // past all those nearer at its height: a turn wider than the one inside it shows past it, a
  // narrower one hides behind it
  pushViewContour(parts, place, on.back, 'back');
  for (let stretch of [on.turn1Front, on.turn2Back, on.turn2Front, on.turn3Back, on.turn3Front]) {
    for (let run of calcSeenRuns(on, stretch, true)) pushViewContour(parts, place, run, 'turns');
  }

  if (r > 0) parts.back.push({ d: pathFromPolyline(round), weight: STROKE_WEIGHT.trace });

  // each face runs in to the widest stretch standing nearer at its height
  pushViewFace(parts, place, crown.y, crown.x, null, 'backLight');
  for (let pt of [turn1Bottom, turn2Top, turn2Bottom, turn3Top]) pushViewFace(parts, place, pt.y, pt.x, coverAt(on, pt.y, pt.z, true), 'turns');
  for (let y of [eyeTop, eyeBottom]) pushViewFace(parts, place, y, eyeHalf, coverAt(on, y, eye.x, true), 'turns');
  // the eye stands out as a cylinder to the last width
  for (let side of [1, -1]) pushViewLine(parts, place(side * eyeHalf, eyeBottom), place(side * eyeHalf, eyeTop), 'turns');

  // a foot wider than the round meets it along level shoulders, the back's own. A neck wider than
  // the round meets it along a shoulder too, out from whichever of the round and the foot stands
  // out further; a narrower one runs in under it
  if (start.x > r + 1e-6) {
    for (let side of [1, -1]) pushViewLine(parts, place(side * r, start.y), place(side * start.x, start.y), 'back');
  }
  let neckHalf = scrollNeckHalfWidthAt(p, start.y);
  let cheek = Math.max(r, start.x);
  if (neckHalf > cheek + 1e-6) {
    for (let side of [1, -1]) pushViewLine(parts, place(side * cheek, start.y), place(side * neckHalf, start.y), 'backLight');
  }
  return parts;
}

// the scroll from in front, the neck's sides running on up from `neckFrom` to the nut
export function buildScrollFrontViewStrokes(p: ViolinFamilyParams, s: ScrollSolve, place: PlaceInView, neckFrom: number): ScrollView {
  let v = p.scroll!;
  let eye = s.eye!;
  let { nutHeight } = p.neck!;
  let nutHalf = p.neck!.nutWidth / 2;
  let eyeHalf = v.widths.eye / 2;
  let eyeTop = eye.y + eye.r;
  let eyeBottom = eye.y - eye.r;
  let on = calcScrollPathStretches(p, s);
  let crown = on.back.at(-1)!;
  let turn1Bottom = on.turn1Front.at(-1)!;
  let turn2Top = on.turn2Back.at(-1)!;
  let turn2Bottom = on.turn2Front.at(-1)!;
  let turn3Top = on.turn3Back.at(-1)!;
  let { walls, bottom } = calcPegboxFrontOutline(p, s);
  let parts = buildEmptyScrollView();

  // the round is hidden, and the nut stands nearest, hiding whatever of the pegbox is narrower than it
  let nut = [place(-nutHalf, 0), place(nutHalf, 0), place(nutHalf, nutHeight), place(-nutHalf, nutHeight)];
  let overPegbox = pathFromPolygon(nut);
  for (let side of [1, -1]) {
    pushViewStroke(parts, pathFromLine(place(side * scrollNeckHalfWidthAt(p, neckFrom), neckFrom), place(side * scrollNeckHalfWidthAt(p, 0), 0)), 'neck', STROKE_WEIGHT.section, null);
  }
  parts.nut.push({ polygon: nut, weight: STROKE_WEIGHT.section });
  pushViewContour(parts, place, [...walls, ...bottom.slice(1)], 'front', overPegbox);

  // the pegbox runs in under the volute at the first turn's bottom, and its back is hidden all the
  // way up: behind the first turn above there, and the same line as its front below
  let pegboxTop = turn1Bottom.y;
  let pegboxFront = calcScrollFrontWidths(p, s);
  pushViewContour(parts, place, clipPolylineAtY(pegboxFront, pegboxTop, 'below'), 'front', overPegbox);

  // a pegbox wider than the volute over it is the rare exception: above the first turn's bottom its
  // cheeks show wherever they stand out past the volute
  for (let run of calcSeenRuns(on, clipPolylineAtY(pegboxFront, pegboxTop, 'above'), false)) pushViewContour(parts, place, run, 'front');

  // the first turn's front stands nearest and shows whole. Every other stretch shows wherever it
  // stands out past all those nearer at its height, and the last turn's back only up to the eye's
  // bottom, the eye standing out in front of it to the last width
  pushViewContour(parts, place, on.turn1Front, 'turns');
  for (let stretch of [on.turn2Back, on.turn2Front, clipPolylineAtY(on.turn3Back, eyeBottom, 'below'), on.turn3Front]) {
    for (let run of calcSeenRuns(on, stretch, false)) pushViewContour(parts, place, run, 'turns');
  }

  // each face runs in to the widest stretch standing nearer at its height. The first turn has none
  // in front of it, so its bottom runs right across, over the pegbox running in under it. The eye's
  // top is behind the last turn's front
  pushViewFace(parts, place, crown.y, crown.x, null, 'crown');
  pushViewFace(parts, place, turn1Bottom.y, turn1Bottom.x, null, 'turns');
  for (let pt of [turn2Top, turn2Bottom, turn3Top]) pushViewFace(parts, place, pt.y, pt.x, coverAt(on, pt.y, pt.z, false), 'turns');
  pushViewFace(parts, place, eyeBottom, eyeHalf, coverAt(on, eyeBottom, eye.x, false), 'turns');
  // the eye stands out as a cylinder to the last width
  for (let side of [1, -1]) pushViewLine(parts, place(side * eyeHalf, eyeBottom), place(side * eyeHalf, eyeTop), 'turns');
  return parts;
}

// the neck's half-width at y along it, in the scroll's frame, read off the typed widths over the
// neck's length; over a scroll's reach that and the neck solved against the body differ by
// hundredths of a mm
export function scrollNeckHalfWidthAt(p: ViolinFamilyParams, y: number): number {
  let nk = p.neck!;
  return (nk.topWidth - (nk.rootWidth - nk.topWidth) * y / nk.length) / 2;
}

// seen from behind the scroll's back starts in a round at the duck tail: the edge where the pegbox's
// flat back dives into the neck's half-round, as wide as the back's own duck tail width says
export function calcDuckTailRadius(p: ViolinFamilyParams): number {
  return p.scroll!.widths.duckTail / 2;
}

// the round's top, where the path starts
export function calcDuckTailRoundTop(p: ViolinFamilyParams, s: ScrollSolve): number {
  return pointOnCircle(s.S3!, s.S3!.start).y + calcDuckTailRadius(p);
}

// where the pegbox is widest. A violin's hips sit on the round's top; a cello's on the pegbox's
// foot, the round rising past them when the duck tail hangs less than the round's radius
export function calcPegboxHipHeight(p: ViolinFamilyParams): number {
  return p.neck!.nutHeight + p.scroll!.hipHeight;
}

// "the path": the back from the foot, over the crown and round the spiral in to the eye. `poll` is how far along it the back of the head reaches furthest back, its tangent
// running straight up the neck, or null where no arc of the back passes that way above the path's
// start; `crown` where the back tops out, and `turns` where the spiral levels after that: the bottom
// of the first turn, the top and bottom of the second, the top of the last. `round` is how far the
// duck tail sits below the path's start along the back, so `at` reaches it at -round, and `straight`
// how far the round's top does
type ScrollPath = Run & { round: number; straight: number; poll: number | null; crown: number; turns: number[] };

// an arc walked clockwise is level where it passes straight above or below its centre: how far
// along the arc that is, or null where its sweep never passes that way
function calcLevelOnArc(arc: Arc, angle: number): number | null {
  let sweep = arc.end - arc.start;
  let past = normalizeRadians(angle - arc.start);
  return past <= sweep + 1e-9 ? arc.r * (sweep - past) : null;
}

function buildScrollPath(p: ViolinFamilyParams, s: ScrollSolve): ScrollPath {
  let backFoot = pointOnCircle(s.S3!, s.S3!.end);
  let backTop = pointOnCircle(s.S2!, s.S2!.end);
  let rise = joinedRun([arcRun(s.S3!, 'ccw'), straightRun(backFoot, backTop)]);
  let crownArcs = [s.S2!, s.S1!, s.S0!];
  let whole = joinedRun([rise, ...crownArcs.map(a => arcRun(a, 'cw')), ...s.spiral!.map(a => arcRun(a, 'cw'))]);

  // the path starts where the back first rises to the foot, the straight above the round's top
  let roundTop = riseAlongRun(whole, calcDuckTailRoundTop(p, s), whole.length);
  let start = riseAlongRun(whole, calcDuckTailRoundTop(p, s) + p.scroll!.duckTailStraight, whole.length);
  let length = whole.length - start;

  // the poll is the first arc up the back to pass straight behind its centre; the crown the highest
  // top among them
  let along = rise.length - start;
  let poll: number | null = null;
  let tops: number[] = [];
  for (let arc of crownArcs) {
    let back = calcLevelOnArc(arc, TURN.half);
    if (poll === null && back !== null && along + back > 1e-6) poll = along + back;
    let top = calcLevelOnArc(arc, TURN.quarter);
    if (top !== null) tops.push(along + top);
    along += arc.r * (arc.end - arc.start);
  }
  let crown = tops.length ? tops.reduce((best, at) => whole.at(start + at).y > whole.at(start + best).y ? at : best) : along;

  let levels: number[] = [];
  for (let arc of s.spiral!) {
    for (let angle of [TURN.quarter, -TURN.quarter]) {
      let level = calcLevelOnArc(arc, angle);
      if (level !== null) levels.push(along + level);
    }
    along += arc.r * (arc.end - arc.start);
  }
  // a turn on the joint of two arcs is found on both of them
  levels.sort((a, b) => a - b);
  let turns = levels.filter((at, i) => at < length - 1e-6 && (i === 0 || at - levels[i - 1] > 1e-6));

  return { length, at: at => whole.at(start + at), round: start, straight: start - roundTop, poll, crown, turns };
}

function buildScrollFront(p: ViolinFamilyParams, s: ScrollSolve): Run {
  let [F0, F1] = [s.F0!, s.F1!];
  let flatTop = pointOnCircle(F0, F0.start);
  return joinedRun([
    straightRun(new Pt(flatTop.x, flatTop.y - p.scroll!.flat), flatTop),
    arcRun(F0, 'ccw'),
    straightRun(pointOnCircle(F0, F0.end), pointOnCircle(F1, F1.end)),
    arcRun(F1, 'cw'),
  ]);
}

// the pegbox's front is marked on the blank as straight lines and sawn through, so its width goes by
// height: the nut's up to the nut's top, out to the hips' from there, then tapering to the throat's
// at the foot of the front's straight, and on up F1 at the same slope. Hips at 0 are none, the
// cheeks tapering from the nut's edges; below the nut's top they leave no run out from the nut, and
// hold the hips' width down to the foot
export function pegboxWidthAt(p: ViolinFamilyParams, s: ScrollSolve, y: number): number {
  let { nutWidth, nutHeight } = p.neck!;
  let { hip, throat: throatWidth } = p.scroll!.widths;
  let hipWidth = p.scroll!.hipHeight === 0 ? nutWidth : hip;
  let taperEnd = pointOnCircle(s.F1!, s.F1!.end).y;
  // hips up at the throat leave no taper, and the width steps there
  let hipY = Math.min(calcPegboxHipHeight(p), taperEnd);
  if (y > hipY) return taperEnd - hipY > 1e-9 ? Math.max(hipWidth + (throatWidth - hipWidth) * (y - hipY) / (taperEnd - hipY), 0) : throatWidth;
  if (hipY <= nutHeight) return hipWidth;
  if (y <= nutHeight) return nutWidth;
  return nutWidth + (hipWidth - nutWidth) * (y - nutHeight) / (hipY - nutHeight);
}

function calcBackSlopeWidth(path: ScrollPath, at: number, footWidth: number, toWidth: number, startY: number, toY: number): number {
  return toY - startY > 1e-9 ? footWidth + (toWidth - footWidth) * (path.at(at).y - startY) / (toY - startY) : toWidth;
}

// the width along the path. The back goes out from its foot on a straight slope, by height, to its
// poll, then leaves the slope tangent on a curve
// through the volute's widths, by distance along the path. A back with no poll runs the slope all
// the way up to the crown
function buildPathWidth(p: ViolinFamilyParams, path: ScrollPath): (at: number) => number {
  let w = p.scroll!.widths;
  // the last turn is as wide as the eye from its top on in
  let [turn1Bottom, turn2Top, turn2Bottom, turn3Top] = path.turns;
  let s = [path.crown, turn1Bottom, turn2Top, turn2Bottom, turn3Top, path.length];
  let widths = [w.crown, w.turn1Bottom, w.turn2Top, w.turn2Bottom, w.eye, w.eye];
  if (path.poll !== null) {
    s.unshift(path.poll);
    widths.unshift(w.poll);
  }

  let startY = path.at(0).y;
  let toY = path.at(s[0]).y;

  let h = s.slice(1).map((next, i) => next - s[i]);
  let delta = h.map((step, i) => (widths[i + 1] - widths[i]) / step);
  let slopes = hymanFilterSlopes(naturalSplineSlopes(h, delta), h, delta);
  // tangent to the slope it leaves, where the path has any of it behind
  if (s[0] > 1e-3) slopes[0] = (calcBackSlopeWidth(path, s[0], w.foot, widths[0], startY, toY) - calcBackSlopeWidth(path, s[0] - 1e-3, w.foot, widths[0], startY, toY)) / 1e-3;
  let curve = hermiteEvaluator(s, widths, h, slopes);
  return at => at < s[0] ? calcBackSlopeWidth(path, at, w.foot, widths[0], startY, toY) : curve(at);
}

// the path as the back and front views draw it, in the stretches it falls into at the crown and the
// turns: x the half-width, y and z the side view's y and x, a point a millimetre or so apart. Each
// stretch runs down the volute's front or up its back, only rising or only falling, and ends on the
// point the next starts on
export type ScrollStretches = Record<'back' | 'turn1Front' | 'turn2Back' | 'turn2Front' | 'turn3Back' | 'turn3Front', Pt3D[]>;

function calcStretch(path: ScrollPath, width: (at: number) => number, from: number, to: number): Pt3D[] {
  let pieces = Math.ceil(to - from);
  return Array.from({ length: pieces + 1 }, (_, k) => {
    let at = from + (to - from) * k / pieces;
    let pt = path.at(at);
    return new Pt3D(width(at) / 2, pt.y, pt.x);
  });
}

export function calcScrollPathStretches(p: ViolinFamilyParams, s: ScrollSolve): ScrollStretches {
  let path = buildScrollPath(p, s);
  let width = buildPathWidth(p, path);
  let [turn1Bottom, turn2Top, turn2Bottom, turn3Top] = path.turns;
  return {
    back: calcStretch(path, width, 0, path.crown),
    turn1Front: calcStretch(path, width, path.crown, turn1Bottom),
    turn2Back: calcStretch(path, width, turn1Bottom, turn2Top),
    turn2Front: calcStretch(path, width, turn2Top, turn2Bottom),
    turn3Back: calcStretch(path, width, turn2Bottom, turn3Top),
    turn3Front: calcStretch(path, width, turn3Top, path.length),
  };
}

// the back unrolled into a strip, the duck tail to the bottom of the second turn: up the strip is
// distance along the side profile, across it the back's width there, so laid on the carved back it
// bends back into place and the maker draws round it. Below the path's start it is the duck tail's
// round, closing to a point at the duck tail, and its straight; a foot wider than the round steps out
// to it level, as the shoulders do
export type ScrollBackStrip = { outline: Pt[]; length: number };

export function buildScrollBackStrip(p: ViolinFamilyParams, s: ScrollSolve): ScrollBackStrip {
  let path = buildScrollPath(p, s);
  let width = buildPathWidth(p, path);
  let r = calcDuckTailRadius(p);
  let roundTop = calcDuckTailRoundTop(p, s);
  let end = path.turns[2] ?? path.length;
  let step = 0.25;

  let side: Pt[] = [];
  let n = Math.ceil((path.round - path.straight) / step);
  for (let k = 0; k <= n && n > 0; k++) {
    let at = -path.round + (path.round - path.straight) * k / n;
    side.push(new Pt(Math.sqrt(Math.max(r * r - Math.max(roundTop - path.at(at).y, 0) ** 2, 0)), at + path.round));
  }
  if (path.straight > 1e-6) side.push(new Pt(r, path.round));

  // the poll is a corner in the width, so the strip takes it exactly
  let m = Math.max(Math.ceil(end / step), 1);
  let along = Array.from({ length: m + 1 }, (_, k) => end * k / m);
  if (path.poll !== null && path.poll < end) along.push(path.poll);
  along.sort((a, b) => a - b);
  for (let at of along) side.push(new Pt(width(at) / 2, at + path.round));

  return { outline: [...side, ...[...side].reverse().map(pt => new Pt(-pt.x, pt.y))], length: end + path.round };
}

// the back's widths set out for a compass walk, the older way: the maker walks a compass up the
// back and marks each width off the centreline. Each station sits along the spine the straight
// compass distance from the last, not the distance along the path, so a compass set between two
// crosshairs steps the same on the wood, and a circle its width across sets the compass for the
// width. The duck tail's round is at the bottom, the foot about it or up its straight where it is
// wider or there is one, then the poll, and from there `steps` equal compass steps up the volute, the last landing
// on the second turn's bottom. The step is found by halving: the stretch they divide, `volute`, is
// the path's own length from the poll, while the compass cuts each bend short, so the step depends
// on how many there are and the chords never sum to it. A violin's volute runs about 175 mm, a
// cello's 375, so a count rather than a step size keeps the walk alike on every size of instrument
export type CompassStation = { at: Pt; along: number; half: number };
export type CompassWalk = { stations: CompassStation[]; length: number; step: number; volute: number };
export const COMPASS_STEPS = 10;

// the first point along the path a compass step from `from`, found by marching then halving, or
// null where the end comes first
function calcCompassOnward(path: ScrollPath, end: number, from: number, step: number): number | null {
  let origin = path.at(from);
  let at = from;
  while (at < end && dist(origin, path.at(at)) < step) at = Math.min(at + 0.5, end);
  if (dist(origin, path.at(at)) < step) return null;
  let lo = Math.max(at - 0.5, from), hi = at;
  for (let i = 0; i < 40; i++) {
    let mid = (lo + hi) / 2;
    if (dist(origin, path.at(mid)) < step) lo = mid; else hi = mid;
  }
  return hi;
}

// how far short of the end the last step falls with a step this long, negative once it overshoots.
// The last step is found like the rest, the first point along the path a step away, never struck
// straight at the end: the spiral passes within a step of the end from stations still turns away,
// and an arc struck from one of those would cross the back twice
function calcCompassShort(path: ScrollPath, end: number, from: number, step: number, steps: number): number {
  let at: number | null = from;
  for (let k = 0; k < steps && at !== null; k++) at = calcCompassOnward(path, end, at, step);
  return at === null ? -1 : end - at;
}

export function buildScrollCompassWalk(p: ViolinFamilyParams, s: ScrollSolve, steps = COMPASS_STEPS): CompassWalk {
  let path = buildScrollPath(p, s);
  let width = buildPathWidth(p, path);
  let w = p.scroll!.widths;
  let end = path.turns[2] ?? path.length;
  steps = Math.max(1, Math.round(steps));

  let marks: { s: number; half: number }[] = [{ s: -path.straight, half: w.duckTail / 2 }];
  if (w.foot > w.duckTail + 1e-9 || path.straight > 1e-6) marks.push({ s: 0, half: w.foot / 2 });
  if (path.poll !== null && path.poll < end) marks.push({ s: path.poll, half: width(path.poll) / 2 });

  let from = marks.at(-1)!.s;
  let volute = end - from;
  let step = 0;
  if (volute > 1e-6) {
    // the step is between the straight distance and the path's length, each over the count. Too few
    // steps and a chord spans a bend the path curls back round, so no step lands the last on the
    // end exactly: it then comes as close as it can, and the last step is short of the rest
    let lo = dist(path.at(from), path.at(end)) / steps, hi = volute / steps;
    for (let i = 0; i < 48; i++) {
      let mid = (lo + hi) / 2;
      if (calcCompassShort(path, end, from, mid, steps) > 0) lo = mid; else hi = mid;
    }
    step = hi;
    for (let k = 1; k < steps; k++) {
      let next = calcCompassOnward(path, end, from, step);
      if (next === null) break;
      from = next;
      marks.push({ s: from, half: width(from) / 2 });
    }
    marks.push({ s: end, half: width(end) / 2 });
  }

  let stations: CompassStation[] = [];
  let along = 0;
  for (let m of marks) {
    let at = path.at(m.s);
    if (stations.length) along += dist(stations.at(-1)!.at, at);
    stations.push({ at, along, half: m.half });
  }
  return { stations, length: along, step, volute };
}

// the front from the nut up to the throat the same way, as wide as the pegbox at each height
export function calcScrollFrontWidths(p: ViolinFamilyParams, s: ScrollSolve): Pt3D[] {
  let front = buildScrollFront(p, s);
  let pieces = Math.ceil(front.length);
  return Array.from({ length: pieces + 1 }, (_, i) => {
    let pt = front.at(front.length * i / pieces);
    return new Pt3D(pegboxWidthAt(p, s, pt.y) / 2, pt.y, pt.x);
  });
}

// where each of the panel's fields is marked in the side view, with the width there: the neck at
// the nut's foot, then the front's up the pegbox's front, the nut, the hips and the throat; the
// back's from the top of the duck tail's round, then along the path from the foot in to the eye's
// centre. A back with no poll has no station for it
export function calcScrollWidthStations(p: ViolinFamilyParams, s: ScrollSolve): ScrollStation[] {
  let w = p.scroll!.widths;
  let front = buildScrollFront(p, s);
  let hip = front.at(riseAlongRun(front, calcPegboxHipHeight(p), front.length));
  let path = buildScrollPath(p, s);
  let [turn1Bottom, turn2Top, turn2Bottom] = path.turns;
  return [
    { key: 'neck', at: new Pt(0, 0), width: p.neck!.topWidth },
    { key: 'nut', at: new Pt(0, p.neck!.nutHeight), width: p.neck!.nutWidth },
    { key: 'hip', at: hip, width: pegboxWidthAt(p, s, hip.y) },
    { key: 'throat', at: pointOnCircle(s.F1!, s.F1!.end), width: w.throat },
    { key: 'duckTail', at: path.at(-path.straight), width: w.duckTail },
    { key: 'foot', at: path.at(0), width: w.foot },
    ...(path.poll === null ? [] : [{ key: 'poll' as const, at: path.at(path.poll), width: w.poll }]),
    { key: 'crown', at: path.at(path.crown), width: w.crown },
    { key: 'turn1Bottom', at: path.at(turn1Bottom), width: w.turn1Bottom },
    { key: 'turn2Top', at: path.at(turn2Top), width: w.turn2Top },
    { key: 'turn2Bottom', at: path.at(turn2Bottom), width: w.turn2Bottom },
    { key: 'eye', at: new Pt(s.eye!.x, s.eye!.y), width: w.eye },
  ];
}

// the wall under the nut leans in toward the scroll as it drops, by this much off square
const NUT_WALL_LEAN = 15 * TURN.degree;

// the pegbox's hollow in the side view: from the nut's top down the wall under it, along the floor,
// and out to the front again along a wall square to the neck, where the front's straight ends.
// Null where a wall never reaches the floor
export function calcPegboxCavity(p: ViolinFamilyParams, s: ScrollSolve): Pt[] | null {
  let v = p.scroll!;
  let backFoot = pointOnCircle(s.S3!, s.S3!.end);
  let backTop = pointOnCircle(s.S2!, s.S2!.end);
  let back = joinedRun([arcRun(s.S3!, 'ccw'), straightRun(backFoot, backTop), arcRun(s.S2!, 'cw')]);

  // the floor is the back carried in by its thickness, a point every quarter millimetre. Going up
  // the back the front is on the right
  let pieces = Math.ceil(back.length * 4);
  let floor: Pt[] = [];
  for (let i = 0; i <= pieces; i++) {
    let at = back.length * i / pieces;
    let before = back.at(Math.max(at - 1e-3, 0));
    let after = back.at(Math.min(at + 1e-3, back.length));
    let heading = dist(before, after);
    let on = back.at(at);
    floor.push(new Pt(on.x + v.wall * (after.y - before.y) / heading, on.y - v.wall * (after.x - before.x) / heading));
  }

  let nutTop = new Pt(0, p.neck!.nutHeight);
  let frontEnd = calcScrollLines(p, s).frontStraight[1];
  let underNut = rayPolylineIntersection(nutTop, TURN.half - NUT_WALL_LEAN, floor);
  let underThroat = rayPolylineIntersection(frontEnd, TURN.half, floor);
  if (!underNut || !underThroat || underNut.index > underThroat.index) return null;
  return [
    nutTop,
    new Pt(underNut.point.x, underNut.point.y),
    ...floor.slice(underNut.index, underThroat.index),
    new Pt(underThroat.point.x, underThroat.point.y),
    frontEnd,
  ];
}

// the scroll's side solved, and the widths checked against it. Where the Ceruti recipe pushed a
// width up to the one it has to stand out past, or the hips up to the duck tail, this says so. The
// turns may narrow as well as widen, but the eye stands out in front of the last turn's back, so it
// is at least as wide as the second turn's bottom. Returns and never writes
export function solveScrollWidths(p: ViolinFamilyParams): ScrollWidthsSolve | null {
  let scroll = solveScroll(p);
  if (!scroll) return null;
  let failures: ScrollWidthsFailure[] = [];
  if (scroll.failures.length) return { scroll, failures };
  let v = p.scroll!;
  let w = v.widths;
  let keys = Object.keys(w) as (keyof ScrollWidths)[];

  if (!keys.every(k => Number.isFinite(w[k]) && w[k] >= 0) || ![v.hipHeight, v.wall].every(Number.isFinite) || !(v.duckTailStraight >= 0))
    failures.push(buildMiss('Scroll widths: every width, the hip height, the straight and the wall need a value, the widths and the straight 0 or more.', [...keys, 'hipHeight', 'duckTailStraight', 'wall']));
  else if (!(v.wall > 0)) failures.push(buildMiss('Scroll widths: the pegbox wall needs a thickness above 0.', ['wall']));
  else {
    let duckTail = pointOnCircle(scroll.S3!, scroll.S3!.start).y - p.neck!.nutHeight;
    if (v.hipHeight < duckTail) failures.push(buildMiss(`Scroll widths: the hips can't sit below the duck tail, ${duckTail.toFixed(1)} mm from the nut's top.`, ['hipHeight']));
    let order: [keyof ScrollWidths, keyof ScrollWidths, string][] = [
      ['duckTail', 'foot', "the back's foot has to be at least as wide as the duck tail's round"],
      ['crown', 'poll', 'the head has to be no wider over the crown than at the poll'],
      ['turn2Bottom', 'eye', 'the eye has to stand at least as wide as the second turn\'s bottom'],
    ];
    for (let [lesser, greater, what] of order) if (w[greater] < w[lesser]) failures.push(buildMiss(`Scroll widths: ${what}.`, [lesser, greater]));
  }
  if (!failures.length) {
    let path = buildScrollPath(p, scroll);
    if (!(path.crown > 1e-6)) failures.push(buildMiss("Scroll widths: the duck tail's straight runs the foot up past the crown. Shorten it.", ['duckTailStraight']));
    else if (path.turns.length < 4) failures.push(buildMiss('Scroll widths: the spiral has to turn twice past the crown for the widths to hang on it.', keys));
  }
  return { scroll, failures };
}

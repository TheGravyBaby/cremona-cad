import { Component } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { dist, moveInVectorSpace, pointAtDistanceToward, TURN, vectorFromSlope } from '../../../../helpers/math/simpleGeometry';
import { applyMatrix, pathFromPolygon, pathFromPolyline } from '../../../../helpers/math/pathMath';
import { occludePath } from '../../../../helpers/math/pathVibes';
import {
  renderDashedLine, renderGuideBaseline, renderGuideKnot, renderPath, renderPolygon, renderSegment, renderSegmentHalo, renderSolveFailures, renderStroke, renderText, renderTranslatedLayers,
} from '../../../../helpers/renderFuncs';
import { buildMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { Pt, Vect2D } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import {
  RenderLayer,
  ViolinFamilyParams,
  ViolinFamilyToggleKey,
} from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import {
  LongArchingSolve,
  PlateContourSolve,
  ScrollSolve,
  StringSetupSolve,
} from '../../violin-family-solves';
import { familyStandards } from '../../violin-family-seed';
import { solvePlateContour } from '../plate-contour-panel/plate-contour-panel';
import { defineFholePath, solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import {
  channelCenterlineZAt, placeOnTopPlate, renderBodySideProfile, sideViewOffsetX, solveLongArching, topPlatePlacement,
} from '../long-arching-panel/long-arching-panel';
import { neckHalfWidthAt, defineNeckInPlan, renderNeck, calcScrollOnNeck, solveNeck } from '../neck-panel/neck-panel';
import { buildScrollFrontViewStrokes, solveScrollWidths } from '../scroll-widths-panel/scroll-widths-panel';

export type StringSetupHighlightKey =
  'length' | 'angle' | 'bodyStop' | 'bridgeHeight' | 'nutThickness' | 'fbLength' | 'fbThickness' | 'fbRadius' | 'fbNutRadius' | 'fbEndRadius' | 'scoopAt' | 'scoopBass' | 'scoopTreble';

@Component({
  selector: 'app-vf-string-setup-panel',
  imports: [FormsModule, DecimalPipe, NumberStepperDirective],
  templateUrl: './string-setup-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class StringSetupPanel extends PanelComponentBase<StringSetupHighlightKey> {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showFingerboard', 'showFretMarks'];
  protected readonly pal = ThemeService.getPalette('varnish');

  static seed(p: ViolinFamilyParams): void {
    if (p.stringSetup || !p.neck) return;
    p.stringSetup = structuredClone(familyStandards(p.body.height).strings);
  }

  // what the last draw solved; the readout and reportSolveFailures() read it
  s!: StringSetupSolve;

  get stringLength(): number | null {
    return this.s?.nutTop && this.s.bridgeTop ? dist(this.s.nutTop, this.s.bridgeTop) : null;
  }

  // the one radius sets the board's crown the same at both ends
  radiusEdited(r: number): void {
    this.params.stringSetup!.fingerboardNutRadius = this.params.stringSetup!.fingerboardEndRadius = r;
    this.recordEditAndRedraw();
  }

  // the neck's length is edited here too, so its failures are this panel's to report
  reportSolveFailures(): void {
    reportFailures([...this.s.neck.failures, ...this.s.failures], 'String Setup');
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let s = this.s = solveStringSetup(this.params)!;
    let side = this.flags.showFretMarks ? [renderFretTicks(s, FRET_LANDMARKS, this.pal)] : [];
    return renderStringSetupViews(this.params, s, this.pal, { fingerboard: this.flags.showFingerboard, highlighted: this.highlightedPart, side });
  }
}

// the front view and the side elevation, the body under the neck in both. `front` and `side` are
// drawn over each view in its own frame, for a panel adding to the setup
export function renderStringSetupViews(
  p: ViolinFamilyParams,
  s: StringSetupSolve,
  pal: PanelPalette,
  opts: { fingerboard: boolean; scoopGuide?: boolean; highlighted?: { key: StringSetupHighlightKey; color: string } | null; front?: RenderLayer[]; side?: RenderLayer[] },
): RenderLayer[] {
  let a = solveLongArching(p)!;
  let o = solvePlateContour(p)!;
  let w = p.scroll ? solveScrollWidths(p) : null;
  let scroll = w && !w.scroll.failures.length ? w.scroll : undefined;
  let scrollInPlan = scroll && !w!.failures.some(f => f.unsolved.length) ? scroll : null;
  let sideX = sideViewOffsetX(p);
  let side = [
    renderBodySideProfile(p, a, o, pal, false, { ground: true }),
    renderNeck(p, s.neck, pal, { ground: true, scroll }),
    renderStringSetup(p, s, pal, { fingerboard: opts.fingerboard, scoopGuide: opts.scoopGuide }),
    ...(opts.side ?? []),
    renderStringSetupHighlight(p, s, opts.highlighted ?? null),
    renderSolveFailures([...s.neck.failures, ...s.failures], pal.alert),
  ];
  return [
    renderStringSetupFrontView(p, s, o, scrollInPlan, pal, { fingerboard: opts.fingerboard, scoopStation: !!opts.scoopGuide }),
    ...(opts.front ?? []),
    renderTranslatedLayers(side, sideX),
  ];
}

const FINGERBOARD_CROWN_SAMPLES = 24;
const FINGERBOARD_CROWN_OPACITY = 0.45;
const SCOOP_GUIDE_LABEL_SIZE = 4;
// how many semitones up the string to tick, and how far each tick reaches either side of it. Plain
// semitones stay small so they read as a scale beside the landmarks: the fourth, fifth and octave
// here, the position marks in the dev fingerboard panel
const FRET_MARK_SEMITONES = 12;
const FRET_TICK_HALF_LENGTH = 1;
const LANDMARK_TICK_HALF_LENGTH = 3;
export const FRET_LANDMARKS = [5, 7, 12];

// equal temperament: each semitone shortens the sounding length by the twelfth root of 2, so
// semitone n stops the string `length * (1 - 2^(-n/12))` from the nut
export function calcSemitoneStop(semitone: number, stringLength: number): number {
  return stringLength * (1 - 2 ** (-semitone / 12));
}

// ticks stop at the board's end
const renderFretTick = (s: StringSetupSolve, semitone: number, halfLength: number, color: string): RenderLayer => (g: any, ui: any): void => {
  let nut = s.nutTop!, bridge = s.bridgeTop!;
  let stringLength = dist(nut, bridge);
  let d = calcSemitoneStop(semitone, stringLength);
  if (d > dist(s.neck.neckTop!, s.fingerboardEnd!)) return;
  let along: Vect2D = { a: (bridge.x - nut.x) / stringLength, b: (bridge.y - nut.y) / stringLength, mag: 1 };
  let across: Vect2D = { a: -along.b, b: along.a, mag: 1 };
  let center = moveInVectorSpace(nut, [{ ...along, mag: d }]);
  let a = moveInVectorSpace(center, [{ ...across, mag: halfLength }]);
  let b = moveInVectorSpace(center, [{ ...across, mag: -halfLength }]);
  renderSegment(a, b, color, STROKE_WEIGHT.guide)(g, ui);
};

// the first octave's semitones ticked up the string in the side elevation, the landmarks standing
// taller
export const renderFretTicks = (s: StringSetupSolve, landmarks: number[], pal: PanelPalette): RenderLayer => (g: any, ui: any): void => {
  if (!s.nutTop || !s.bridgeTop || !s.neck.neckTop || !s.fingerboardEnd) return;
  for (let semitone = 1; semitone <= FRET_MARK_SEMITONES; semitone++) {
    if (!landmarks.includes(semitone)) renderFretTick(s, semitone, FRET_TICK_HALF_LENGTH, pal.ink(0).faint(-3))(g, ui);
  }
  for (let semitone of landmarks) if (Number.isInteger(semitone) && semitone > 0) renderFretTick(s, semitone, LANDMARK_TICK_HALF_LENGTH, pal.ink(3))(g, ui);
};

// the bridge, the board, the nut and the string, over the neck renderNeck draws. The neck's front is
// in colour since its length is set here
export const renderStringSetup = (
  p: ViolinFamilyParams,
  s: StringSetupSolve,
  pal: PanelPalette,
  opts: { fingerboard?: boolean; scoopGuide?: boolean } = {},
) => (g: any, ui: any): void => {
  let n = s.neck;
  if (!n.neckTop || !n.root || !n.bottomFront) return;
  let ss = p.stringSetup!;
  let up = vectorFromSlope(p.neck!.angle * TURN.degree + TURN.quarter);
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);

  if (s.bridge) renderPolygon(s.bridge, pal.ink(1), STROKE_WEIGHT.section)(g, ui);

  if (opts.fingerboard && s.fingerboardEnd) {
    // the board's edge solid, the crown above it faded so the two read apart. The bass edge, the
    // deeper scooped, stands for the edge in this view
    renderPolygon([n.neckTop, ...calcFingerboardEdgeLine(p, s, -1), s.fingerboardEnd], pal.ink(0), STROKE_WEIGHT.section)(g, ui);
    let crown = calcFingerboardCrownLine(p, s);
    if (crown) renderPath(pathFromPolyline(crown), pal.ink(0), STROKE_WEIGHT.section, FINGERBOARD_CROWN_OPACITY)(g, ui);
    if (opts.scoopGuide) renderScoopGuide(p, s, pal)(g, ui);
  }

  if (s.nutTop) {
    let nutFar = moveInVectorSpace(n.neckTop, [{ ...up, mag: p.neck!.nutHeight }]);
    let nutFarTop = moveInVectorSpace(nutFar, [{ ...normal, mag: ss.nutThickness }]);
    renderPolygon([n.neckTop, nutFar, nutFarTop, s.nutTop], pal.ink(0).faint(-3), STROKE_WEIGHT.section)(g, ui);
  }

  renderSegment(n.bottomFront, n.root, pal.ink(2), STROKE_WEIGHT.section)(g, ui);
  renderSegment(n.root, n.neckTop, pal.ink(2), STROKE_WEIGHT.section)(g, ui);

  if (s.nutTop && s.bridgeTop) renderSegment(s.nutTop, s.bridgeTop, pal.neutral, STROKE_WEIGHT.section)(g, ui);
};

const renderStringSetupHighlight = (
  p: ViolinFamilyParams,
  s: StringSetupSolve,
  highlighted: { key: StringSetupHighlightKey; color: string } | null,
) => (g: any, ui: any): void => {
  let n = s.neck;
  if (!highlighted || !n.neckTop || !n.bottomFront) return;
  let { key, color } = highlighted;
  let ss = p.stringSetup!;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  let end = s.fingerboardEnd;

  switch (key) {
    case 'length': renderSegmentHalo(n.bottomFront, n.neckTop, color)(g, ui); break;
    case 'angle': if (n.root) renderSegmentHalo(n.root, n.neckTop, color)(g, ui); break;
    case 'bodyStop': if (s.bridgeFoot) renderSegmentHalo(new Pt(s.bridgeFoot.x, p.body.height), s.bridgeFoot, color)(g, ui); break;
    case 'bridgeHeight': if (s.bridgeFoot && s.bridgeTop) renderSegmentHalo(s.bridgeFoot, s.bridgeTop, color)(g, ui); break;
    case 'nutThickness': if (s.nutTop) renderSegmentHalo(n.neckTop, s.nutTop, color)(g, ui); break;
    case 'fbLength': if (end) renderSegmentHalo(n.neckTop, end, color)(g, ui); break;
    case 'fbThickness':
      if (end) {
        renderSegmentHalo(n.neckTop, moveInVectorSpace(n.neckTop, [{ ...normal, mag: ss.fingerboardThickness }]), color)(g, ui);
        renderSegmentHalo(end, moveInVectorSpace(end, [{ ...normal, mag: ss.fingerboardThickness }]), color)(g, ui);
      }
      break;
    // each radius lights its own half of the crown, the one radius all of it
    case 'fbRadius':
    case 'fbNutRadius':
    case 'fbEndRadius': {
      let crown = calcFingerboardCrownLine(p, s);
      if (!crown) break;
      let mid = Math.ceil(crown.length / 2);
      let half = key === 'fbRadius' ? crown : key === 'fbNutRadius' ? crown.slice(0, mid) : crown.slice(mid - 1);
      for (let i = 1; i < half.length; i++) renderSegmentHalo(half[i - 1], half[i], color)(g, ui);
      break;
    }
    // the scoop fields light the guide
    case 'scoopAt':
    case 'scoopBass':
    case 'scoopTreble': {
      let guide = calcScoopGuideGeometry(p, s);
      if (!guide) break;
      let run = key === 'scoopAt' ? guide.station : key === 'scoopBass' ? guide.bass : guide.treble;
      for (let i = 1; i < run.length; i++) renderSegmentHalo(run[i - 1], run[i], color)(g, ui);
      break;
    }
  }
};

function calcOffPlane(pt: Pt, root: Pt, normal: Vect2D): number {
  return (pt.x - root.x) * normal.a + (pt.y - root.y) * normal.b;
}

// the text is centred, so each label moves out by half its own width to start past the string
const renderScoopLabel = (at: Pt, normal: Vect2D, up: Vect2D, lift: number, stagger: number, text: string, color: string) => (g: any, ui: any): void => {
  let raised = moveInVectorSpace(at, [{ ...normal, mag: lift + text.length * SCOOP_GUIDE_LABEL_SIZE * 0.28 }]);
  renderText(moveInVectorSpace(raised, [{ ...up, mag: stagger }]), text, color, SCOOP_GUIDE_LABEL_SIZE)(g, ui);
};

// the scoop at scale: a dashed straightedge laid along the board's top from nut to end, the treble
// edge drawn beneath it beside the bass edge the board already shows, knots on the two deepest
// points and the depths written above. A hair at scale, but the true shape
export const renderScoopGuide = (p: ViolinFamilyParams, s: StringSetupSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  let guide = calcScoopGuideGeometry(p, s);
  if (!guide) return;
  let ss = p.stringSetup!;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  let up = vectorFromSlope(p.neck!.angle * TURN.degree + TURN.quarter);
  renderGuideBaseline(guide.straightedge[0], guide.straightedge[1], pal.ink(0))(g, ui);
  renderPath(pathFromPolyline(guide.treble), pal.ink(0).faint(-3), STROKE_WEIGHT.guide)(g, ui);
  let [deepestBass, onStraightedge] = guide.station;
  renderGuideKnot(deepestBass, pal.ink(0))(g, ui);
  renderGuideKnot(guide.deepestTreble, pal.ink(0).faint(-3))(g, ui);
  // the labels sit clear of the string where it passes the station, staggered along the board,
  // treble toward the nut and bass toward the end
  let gap = SCOOP_GUIDE_LABEL_SIZE * 1.5;
  let root = s.neck.root!;
  let lift = gap;
  if (s.nutTop && s.bridgeTop) {
    let share = dist(s.nutTop, onStraightedge) / dist(s.nutTop, s.bridgeTop);
    lift = Math.max(gap, calcOffPlane(s.nutTop, root, normal) + (calcOffPlane(s.bridgeTop, root, normal) - calcOffPlane(s.nutTop, root, normal)) * share - calcOffPlane(onStraightedge, root, normal) + gap);
  }
  renderScoopLabel(onStraightedge, normal, up, lift, -gap, `bass ${ss.scoopBass} mm`, pal.ink(0))(g, ui);
  renderScoopLabel(onStraightedge, normal, up, lift, gap, `treble ${ss.scoopTreble} mm`, pal.ink(0).faint(-3))(g, ui);
};

// where the scoop guide's lines fall, all at scale. `straightedge` runs along the board's top edge
// from nut to end, where the edges would be with no scoop; `bass` and `treble` are the scooped
// edges beneath it; `station` runs from the bass edge's deepest point up to the straightedge, and
// `deepestTreble` is the treble edge's. Null while the board or the scoop doesn't solve
export function calcScoopGuideGeometry(p: ViolinFamilyParams, s: StringSetupSolve):
  { straightedge: [Pt, Pt]; bass: Pt[]; treble: Pt[]; station: [Pt, Pt]; deepestTreble: Pt } | null {
  let neckTop = s.neck.neckTop;
  let end = s.fingerboardEnd;
  if (!neckTop || !end || s.failures.some(f => f.unsolved.includes('fingerboard') || f.unsolved.includes('scoop'))) return null;
  let ss = p.stringSetup!;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  let deepestAt = pointAtDistanceToward(neckTop, end, ss.scoopAt);
  let onStraightedge = moveInVectorSpace(deepestAt, [{ ...normal, mag: ss.fingerboardThickness }]);
  return {
    straightedge: [moveInVectorSpace(neckTop, [{ ...normal, mag: ss.fingerboardThickness }]), moveInVectorSpace(end, [{ ...normal, mag: ss.fingerboardThickness }])],
    bass: calcFingerboardEdgeLine(p, s, -1),
    treble: calcFingerboardEdgeLine(p, s, 1),
    station: [moveInVectorSpace(deepestAt, [{ ...normal, mag: ss.fingerboardThickness - fingerboardScoopAt(p, s, deepestAt.y, -1) }]), onStraightedge],
    deepestTreble: moveInVectorSpace(deepestAt, [{ ...normal, mag: ss.fingerboardThickness - fingerboardScoopAt(p, s, deepestAt.y, 1) }]),
  };
}

// the board in plan, nut to end, over the neck it covers. Null while the board doesn't solve
export function defineFingerboardInPlan(p: ViolinFamilyParams, s: StringSetupSolve): string | null {
  let n = s.neck;
  if (!n.neckTop || !s.fingerboardEnd) return null;
  let topY = n.neckTop.y, endY = s.fingerboardEnd.y;
  let topHalf = p.neck!.topWidth / 2, endHalf = neckHalfWidthAt(p, n, endY);
  return pathFromPolygon([new Pt(-endHalf, endY), new Pt(endHalf, endY), new Pt(topHalf, topY), new Pt(-topHalf, topY)]);
}

// the instrument from the front: the top plate with whatever the neck and board cover cut away, the
// bridge across the upper eyes' inner edges, the board (or the bare neck with the board off), the nut
// past its end and the scroll's front on up from it. Worked out here, once a draw; the canvas replays
// the layer on every pan and zoom
const renderStringSetupFrontView = (
  p: ViolinFamilyParams,
  s: StringSetupSolve,
  o: PlateContourSolve,
  scroll: ScrollSolve | null,
  pal: PanelPalette,
  opts: { fingerboard: boolean; scoopStation: boolean },
): RenderLayer => {
  let n = s.neck;
  if (!n.neckTop) return () => {};
  let nk = p.neck!;
  let topY = n.neckTop.y;
  let onNeck = calcScrollOnNeck(p, n);
  let neck = defineNeckInPlan(p, n);
  let board = opts.fingerboard ? defineFingerboardInPlan(p, s) : null;
  // the scoop's deepest station across the board
  let station: [Pt, Pt] | null = null;
  if (board && opts.scoopStation && calcScoopGuideGeometry(p, s)) {
    let y = pointAtDistanceToward(n.neckTop, s.fingerboardEnd!, p.stringSetup!.scoopAt).y;
    let half = neckHalfWidthAt(p, n, y);
    station = [new Pt(-half, y), new Pt(half, y)];
  }
  let nutY = applyMatrix(onNeck, new Pt(0, nk.nutHeight)).y;
  let nut = [new Pt(-nk.nutWidth / 2, topY), new Pt(nk.nutWidth / 2, topY), new Pt(nk.nutWidth / 2, nutY), new Pt(-nk.nutWidth / 2, nutY)];

  // the neck too under the board, in case a short board ends above the mortise floor
  let cover = board ? [neck, board] : [neck];
  let holes = p.fHoleContours ? solveFholeContours(p)! : null;
  let fHoles = holes?.path ? [holes.path, defineFholePath(p, holes, true)!] : [];
  let plate = o.top ? occludePath(o.top, cover).visible : '';
  let lines = [o.purfling, o.outerPurfling, ...fHoles].map(d => d ? occludePath(d, cover).visible : '');

  // from above, the feet
  let bridge: Pt[] | null = null;
  if (s.bridge) {
    let [neckFoot, tailFoot] = s.bridge;
    let half = familyStandards(p.body.height).bridge.footWidth / 2;
    bridge = [new Pt(-half, tailFoot.y), new Pt(half, tailFoot.y), new Pt(half, neckFoot.y), new Pt(-half, neckFoot.y)];
  }

  // the scroll's frame seen from the front: across stays across, up the neck foreshortens by the angle
  let head: ReturnType<typeof buildScrollFrontViewStrokes> | null = null;
  if (scroll) head = buildScrollFrontViewStrokes(p, scroll, (x, y) => new Pt(x, onNeck[3] * y + onNeck[5]), 0);

  return (g: any, ui: any): void => {
    renderPath(plate, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
    for (let d of lines) renderPath(d, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
    if (bridge) renderPolygon(bridge, pal.ink(1), STROKE_WEIGHT.section)(g, ui);
    renderPath(board ?? neck, board ? pal.ink(0) : pal.neutral, STROKE_WEIGHT.section)(g, ui);
    if (station) renderDashedLine(station[0], station[1], pal.ink(0), '2 3', STROKE_WEIGHT.guide, 0.5)(g, ui);
    renderPolygon(nut, pal.ink(0).faint(-3), STROKE_WEIGHT.section)(g, ui);
    // the nut and the neck below it are this view's own
    if (head) {
      let { nut: _, neck: __, ...rest } = head;
      for (let stroke of Object.values(rest).flat()) renderStroke(stroke, pal.neutral)(g, ui);
    }
  };
};

// where y stands along the board: 0 at the nut, 1 at the end, held past either
function calcAlongBoard(s: StringSetupSolve, y: number): number {
  let topY = s.neck.neckTop!.y, endY = s.fingerboardEnd!.y;
  return Math.min(1, Math.max(0, (topY - y) / (topY - endY)));
}

// the crown's radius at y: the nut's at the nut, the end's at the board's end, linear between
export function fingerboardRadiusAt(p: ViolinFamilyParams, s: StringSetupSolve, y: number): number {
  let { fingerboardNutRadius: nut, fingerboardEndRadius: end } = p.stringSetup!;
  return nut + (end - nut) * calcAlongBoard(s, y);
}

function calcScoopDip(depth: number, run: number, x: number): number {
  if (!(depth > 0)) return 0;
  let r = (run * run + depth * depth) / (2 * depth);
  return Math.max(0, depth - (r - Math.sqrt(r * r - x * x)));
}

// how deep the scoop runs under a straightedge laid along the board's top at y, at `side` across
// it: -1 the bass edge, 1 the treble edge, 0 the centre. Each edge dips to its own depth at the
// same station, as two arcs meeting there on a shared tangent, one up to the nut and one to the
// end; the depth runs linearly between the edges. Zero while the scoop doesn't solve
export function fingerboardScoopAt(p: ViolinFamilyParams, s: StringSetupSolve, y: number, side = 0): number {
  if (!s.fingerboardEnd || s.failures.some(f => f.unsolved.includes('scoop'))) return 0;
  let ss = p.stringSetup!;
  let length = dist(s.neck.neckTop!, s.fingerboardEnd);
  let d = calcAlongBoard(s, y) * length;
  let run = d < ss.scoopAt ? ss.scoopAt : length - ss.scoopAt;
  let x = Math.min(run, Math.abs(d - ss.scoopAt));
  let t = (side + 1) / 2;
  return calcScoopDip(ss.scoopBass, run, x) * (1 - t) + calcScoopDip(ss.scoopTreble, run, x) * t;
}

// the board's top edge at `side` (-1 bass, 1 treble), nut to end: its thickness off the neck, less
// the scoop. Straight while the board is flat; a curve too slight to see otherwise
export function calcFingerboardEdgeLine(p: ViolinFamilyParams, s: StringSetupSolve, side: -1 | 1): Pt[] {
  let neckTop = s.neck.neckTop!, end = s.fingerboardEnd!;
  let thickness = p.stringSetup!.fingerboardThickness;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  return Array.from({ length: FINGERBOARD_CROWN_SAMPLES + 1 }, (_, i) => {
    let at = pointAtDistanceToward(neckTop, end, i * dist(neckTop, end) / FINGERBOARD_CROWN_SAMPLES);
    return moveInVectorSpace(at, [{ ...normal, mag: thickness - fingerboardScoopAt(p, s, at.y, side) }]);
  });
}

// how far the board's conical crown stands above its edges, over its width and radius at y
export function fingerboardCrownAt(p: ViolinFamilyParams, s: StringSetupSolve, y: number): number {
  let r = fingerboardRadiusAt(p, s, y);
  let half = neckHalfWidthAt(p, s.neck, y);
  return r - Math.sqrt(r * r - half * half);
}

// the board's top along the centre, from its edge at the nut over the crown to its edge at the end.
// The crown's rise follows the board's width and radius, both growing linearly, less the scoop
// down the middle. Null while a radius can't span the board
export function calcFingerboardCrownLine(p: ViolinFamilyParams, s: StringSetupSolve): Pt[] | null {
  let neckTop = s.neck.neckTop;
  let end = s.fingerboardEnd;
  if (!neckTop || !end || s.failures.some(f => f.unsolved.includes('fingerboard'))) return null;
  let thickness = p.stringSetup!.fingerboardThickness;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  let line = [moveInVectorSpace(neckTop, [{ ...normal, mag: thickness }])];
  for (let i = 0; i <= FINGERBOARD_CROWN_SAMPLES; i++) {
    let at = pointAtDistanceToward(neckTop, end, i * dist(neckTop, end) / FINGERBOARD_CROWN_SAMPLES);
    line.push(moveInVectorSpace(at, [{ ...normal, mag: thickness + fingerboardCrownAt(p, s, at.y) - fingerboardScoopAt(p, s, at.y) }]));
  }
  line.push(moveInVectorSpace(end, [{ ...normal, mag: thickness }]));
  return line;
}

function calcPointOnArch(p: ViolinFamilyParams, a: LongArchingSolve, at: number): Pt {
  let outerZ = a.ribs!.zLower + p.arching!.top.thickness;
  return placeOnTopPlate(topPlatePlacement(p, a.ribs!), new Pt(outerZ + channelCenterlineZAt(p, p.fluting!.top, a.top, at), at));
}

// a later panel reads the string setup by calling this; it returns and never writes to the params.
// The bridge's feet sit on the top's arch along the channel's centreline, centred the body stop down
// from the neck end. It stands plumb over them, whatever the arch and the rib taper do under it, and
// carries the string over the middle of its top. The nut and the board square to the fingerboard plane
export function solveStringSetup(p: ViolinFamilyParams): StringSetupSolve | null {
  if (!p.stringSetup || !p.neck) return null;
  let ss = p.stringSetup;
  let neck = solveNeck(p)!;
  let s: StringSetupSolve = { neck, bridgeFoot: null, bridge: null, bridgeTop: null, nutTop: null, fingerboardEnd: null, failures: [] };
  let { neckTop, root } = neck;
  if (!neckTop || !root) {
    s.failures.push(buildMiss('String setup: the neck has to solve first; everything here stands on it.', ['bridge', 'nut', 'fingerboard']));
    return s;
  }
  let normal = vectorFromSlope(p.neck.angle * TURN.degree);

  solveSection(s.failures, 'Bridge', ['bridge'], () => {
    if (![ss.bodyStop, ss.bridgeHeight].every(Number.isFinite)) return buildMiss('Bridge: the stop and the height need values.', ['bridge']);
    if (!(ss.bodyStop > 0 && ss.bodyStop < p.body.height)) return buildMiss(`Bridge: the stop has to land on the body, between 0 and ${p.body.height} mm.`, ['bridge']);
    if (!(ss.bridgeHeight > 0)) return buildMiss('Bridge: the height needs a value above 0.', ['bridge']);
    let a = solveLongArching(p)!;
    let y = p.body.height - ss.bodyStop;
    let blank = familyStandards(p.body.height).bridge;
    let neckFoot = calcPointOnArch(p, a, y + blank.footThickness / 2), tailFoot = calcPointOnArch(p, a, y - blank.footThickness / 2);
    let foot = s.bridgeFoot = calcPointOnArch(p, a, y);
    let top = s.bridgeTop = new Pt(foot.x + ss.bridgeHeight, foot.y);
    s.bridge = [neckFoot, tailFoot, new Pt(top.x, top.y - blank.topThickness / 2), new Pt(top.x, top.y + blank.topThickness / 2)];
    return null;
  });

  // the board's width and the crown's radius both run linearly down the board, so a radius that
  // spans the half width at both ends spans it everywhere between
  solveSection(s.failures, 'Fingerboard', ['fingerboard'], () => {
    let typed = [ss.fingerboardLength, ss.fingerboardThickness, ss.fingerboardNutRadius, ss.fingerboardEndRadius];
    if (!typed.every(Number.isFinite)) return buildMiss('Fingerboard: the length, thickness and both radii need values.', ['fingerboard']);
    if (!(ss.fingerboardLength > 0)) return buildMiss('Fingerboard: the length needs a value above 0.', ['fingerboard']);
    if (ss.fingerboardThickness < 0) return buildMiss('Fingerboard: the thickness can\'t be negative.', ['fingerboard']);
    let end = s.fingerboardEnd = pointAtDistanceToward(neckTop, root, ss.fingerboardLength);
    let ends: [string, number, Pt][] = [
      ['nut', ss.fingerboardNutRadius, neckTop],
      ['end', ss.fingerboardEndRadius, end],
    ];
    for (let [name, r, at] of ends) {
      let half = neckHalfWidthAt(p, neck, at.y);
      if (r <= half) {
        return buildMiss(`Fingerboard: the radius at the ${name} has to span the board's half width there, ${half.toFixed(1)} mm.`, ['fingerboard'],
          [moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness }])]);
      }
    }
    return null;
  });

  solveSection(s.failures, 'Scoop', ['scoop'], () => {
    if (!s.fingerboardEnd) return buildMiss('Scoop: the board has to solve first; it\'s planed into its top.', ['scoop']);
    if (![ss.scoopAt, ss.scoopBass, ss.scoopTreble].every(Number.isFinite)) return buildMiss('Scoop: the deepest station and both depths need values.', ['scoop']);
    if (ss.scoopBass < 0 || ss.scoopTreble < 0) return buildMiss('Scoop: a depth can\'t be negative.', ['scoop']);
    if (!(ss.scoopAt > 0 && ss.scoopAt < ss.fingerboardLength)) {
      return buildMiss(`Scoop: its deepest point has to lie along the board, between 0 and ${ss.fingerboardLength} mm from the nut.`, ['scoop']);
    }
    return null;
  });

  // a nut below the crown still draws, since that's where the strings would lie on the board. The
  // crown at the nut stands whenever the radius spans the board's half width there, a board too
  // round to pass as one or not
  solveSection(s.failures, 'Nut', ['nut'], () => {
    if (!Number.isFinite(ss.nutThickness) || !(ss.nutThickness > 0)) return buildMiss('Nut: the thickness needs a value above 0.', ['nut']);
    s.nutTop = moveInVectorSpace(neckTop, [{ ...normal, mag: ss.nutThickness }]);
    if (!s.fingerboardEnd || !(ss.fingerboardNutRadius > neckHalfWidthAt(p, neck, neckTop.y))) return null;
    let crownAtNut = ss.fingerboardThickness + fingerboardCrownAt(p, s, neckTop.y);
    if (ss.nutThickness < crownAtNut) {
      return buildMiss(`Nut: it stands below the fingerboard's crown, which is ${crownAtNut.toFixed(1)} mm off the neck at the nut.`, [],
        [moveInVectorSpace(neckTop, [{ ...normal, mag: crownAtNut }])]);
    }
    return null;
  });

  return s;
}

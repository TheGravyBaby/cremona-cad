import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { dist, moveInVectorSpace, pointAtDistanceToward, TURN, vectorFromSlope } from '../../../../helpers/math/simpleGeometry';
import { applyMatrix, pathFromCircle, pathFromPolygon } from '../../../../helpers/math/pathMath';
import { intersectionFromTwoPaths, occludePath } from '../../../../helpers/math/pathVibes';
import {
  renderDashedLine, renderFilledPath, renderGuideBaseline, renderGuideKnot, renderPath, renderPointHalo, renderPolygon, renderSegment, renderSegmentHalo, renderSolveFailures, renderStroke, renderText,
} from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { Circle, Pt, Vect2D } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import {
  OuterContourSolve, PositionMarksParams, RenderLayer, ScrollSolve, StringSetupFailure, StringSetupSolve, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags,
} from '../../violin-family-types';
import { familyStandards } from '../../violin-family-seed';
import { solveOuterContour } from '../outer-contour-panel/outer-contour-panel';
import { fholePath, solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import {
  channelCenterlineZAt, placeOnTopPlate, renderBodySideProfile, sideViewOffsetX, solveLongArching, topPlatePlacement,
} from '../long-arching-panel/long-arching-panel';
import { neckHalfWidthAt, neckInPlan, renderNeck, scrollOnNeck, solveNeck } from '../neck-panel/neck-panel';
import { scrollFrontViewStrokes, solveScrollWidths } from '../scroll-widths-panel/scroll-widths-panel';

// The string setup over the finished neck: the bridge on the top's arch, the nut, the fingerboard and
// the string between them. Reference geometry, read off the neck and never shaping it; only the
// neck's length is set here too, since it places the nut. The position marks are the one thing here
// a maker cuts: dots inlaid in the board's face at chosen intervals, drawn in the front view. The
// scroll, once its panels have solved it whole, stands on the neck's end in both views. Panel and
// renders, then the solve.

export type StringSetupHighlightKey =
  'length' | 'bodyStop' | 'bridgeHeight' | 'nutThickness' | 'fbLength' | 'fbThickness' | 'fbNutRadius' | 'fbEndRadius' | 'scoopAt' | 'scoopBass' | 'scoopTreble' | 'marks';

@Component({
  selector: 'app-vf-string-setup-panel',
  imports: [FormsModule, DecimalPipe, NumberStepperDirective],
  templateUrl: './string-setup-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class StringSetupPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showFingerboard', 'showFretMarks', 'showScoopGuide'];
  protected readonly pal = ThemeService.getPalette('varnish');

  static seed(p: ViolinFamilyParams): void {
    if (p.stringSetup || !p.neck) return;
    p.stringSetup = structuredClone(familyStandards(p.body.height).strings);
  }

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; the readout and report() read it
  s!: StringSetupSolve;
  highlighted: { key: StringSetupHighlightKey; color: string } | null = null;
  // the semitones as typed, so a half-typed list isn't reformatted under the cursor
  semitonesText = '';
  // the marks' controls shown; a design with marks opens with them out
  showMarks = false;

  get stringLength(): number | null {
    return this.s?.nutTop && this.s.bridgeTop ? dist(this.s.nutTop, this.s.bridgeTop) : null;
  }

  ngOnInit(): void {
    this.semitonesText = this.params.stringSetup!.marks.semitones.join(', ');
    this.showMarks = this.params.stringSetup!.marks.semitones.length > 0;
    this.draw();
  }

  edited(): void {
    this.edit.emit();
    this.draw();
  }

  semitonesEdited(text: string): void {
    this.semitonesText = text;
    this.params.stringSetup!.marks.semitones = parseSemitones(text);
    this.edited();
  }

  // the neck's length is edited here too, so its failures are this panel's to report
  report(): void {
    reportFailures([...this.s.neck.failures, ...this.s.failures], 'String Setup');
  }

  focus(key: StringSetupHighlightKey, color: string): void {
    this.highlighted = { key, color };
    this.draw();
  }

  blur(): void {
    this.highlighted = null;
    this.draw();
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      // an undo or a load changed the list behind the field
      if (JSON.stringify(parseSemitones(this.semitonesText)) !== JSON.stringify(p.stringSetup!.marks.semitones)) {
        this.semitonesText = p.stringSetup!.marks.semitones.join(', ');
      }
      let s = this.s = solveStringSetup(p)!;
      let a = solveLongArching(p)!;
      let o = solveOuterContour(p)!;
      let w = p.scroll ? solveScrollWidths(p) : null;
      let scroll = w && !w.scroll.failures.length ? w.scroll : undefined;
      let scrollInPlan = scroll && !w!.failures.some(f => f.unsolved.length) ? scroll : null;
      let sideX = sideViewOffsetX(p);
      let side = [
        renderBodySideProfile(p, a, o, this.pal, false, { ground: true }),
        renderNeck(p, s.neck, this.pal, { ground: true, scroll }),
        renderStringSetup(p, s, this.pal, { fingerboard: this.flags.showFingerboard, fretMarks: this.flags.showFretMarks, scoopGuide: this.flags.showScoopGuide }),
        renderStringSetupHighlight(p, s, this.highlighted),
        renderSolveFailures([...s.neck.failures, ...s.failures], this.pal.alert),
      ];
      this.drawn.emit([
        renderStringSetupFrontView(p, s, o, scrollInPlan, this.pal, this.flags.showFingerboard, this.highlighted),
        (g, ui) => {
          let frame = { g: g.append('g').attr('transform', `translate(${sideX},0)`), ui: ui.append('g').attr('transform', `translate(${sideX},0)`) };
          for (let layer of side) layer(frame.g, frame.ui);
        },
      ]);
    });
  }
}

const FINGERBOARD_CROWN_SAMPLES = 24;
const FINGERBOARD_CROWN_OPACITY = 0.45;
const SCOOP_GUIDE_LABEL_SIZE = 4;
// how many semitones up the string to mark, and how far each tick reaches either side of it. Plain
// semitones stay small so they read as a scale beside the fourth, fifth and octave
const FRET_MARK_SEMITONES = 12;
const FRET_TICK_HALF_LENGTH = 1;
const LANDMARK_TICK_HALF_LENGTH = 3;
const MARK_HALO_RADIUS = 3;

export function parseSemitones(text: string): number[] {
  return text.split(/[\s,;]+/).filter(Boolean).map(Number);
}

// equal temperament: each semitone shortens the sounding length by the twelfth root of 2, so
// semitone n stops the string `length * (1 - 2^(-n/12))` from the nut
export function semitoneStop(semitone: number, stringLength: number): number {
  return stringLength * (1 - 2 ** (-semitone / 12));
}

// the bridge, the board, the nut and the string, over the neck renderNeck draws. The neck's front is
// in colour since its length is set here
export const renderStringSetup = (
  p: ViolinFamilyParams,
  s: StringSetupSolve,
  pal: PanelPalette,
  opts: { fingerboard?: boolean; fretMarks?: boolean; scoopGuide?: boolean } = {},
) => (g: any, ui: any): void => {
  let n = s.neck;
  if (!n.neckTop || !n.root || !n.bottomFront) return;
  let ss = p.stringSetup!;
  let seg = (a: Pt, b: Pt, color: string) => renderSegment(a, b, color, STROKE_WEIGHT.section)(g, ui);
  let up = vectorFromSlope(p.neck!.angle * TURN.degree + TURN.quarter);
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);

  if (s.bridge) renderPolygon(s.bridge, pal.ink(1), STROKE_WEIGHT.section)(g, ui);

  if (opts.fingerboard && s.fingerboardEnd) {
    // the board's edge solid, the crown above it faded so the two read apart. The bass edge, the
    // deeper scooped, stands for the edge in this view
    renderPolygon([n.neckTop, ...fingerboardEdgeLine(p, s, -1), s.fingerboardEnd], pal.ink(0), STROKE_WEIGHT.section)(g, ui);
    let crown = fingerboardCrownLine(p, s);
    if (crown) renderPath(polyline(crown), pal.ink(0), STROKE_WEIGHT.section, FINGERBOARD_CROWN_OPACITY)(g, ui);
    if (opts.scoopGuide) renderScoopGuide(p, s, pal)(g, ui);
  }

  if (s.nutTop) {
    let nutFar = moveInVectorSpace(n.neckTop, [{ ...up, mag: p.neck!.nutHeight }]);
    let nutFarTop = moveInVectorSpace(nutFar, [{ ...normal, mag: ss.nutThickness }]);
    renderPolygon([n.neckTop, nutFar, nutFarTop, s.nutTop], pal.ink(0).faint(-3), STROKE_WEIGHT.section)(g, ui);
  }

  seg(n.bottomFront, n.root, pal.ink(2));
  seg(n.root, n.neckTop, pal.ink(2));

  if (s.nutTop && s.bridgeTop) {
    seg(s.nutTop, s.bridgeTop, pal.neutral);
    if (opts.fretMarks && s.fingerboardEnd) renderFretTicks(s.nutTop, s.bridgeTop, dist(n.neckTop, s.fingerboardEnd), ss.marks, pal)(g, ui);
  }
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
  let edgeAt = (at: Pt) => moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness }]);
  let line = (a: Pt, b: Pt) => renderSegmentHalo(a, b, color)(g, ui);
  let end = s.fingerboardEnd;

  switch (key) {
    case 'length': line(n.bottomFront, n.neckTop); break;
    case 'bodyStop': if (s.bridgeFoot) line(new Pt(s.bridgeFoot.x, p.body.height), s.bridgeFoot); break;
    case 'bridgeHeight': if (s.bridgeFoot && s.bridgeTop) line(s.bridgeFoot, s.bridgeTop); break;
    case 'nutThickness': if (s.nutTop) line(n.neckTop, s.nutTop); break;
    case 'fbLength': if (end) line(n.neckTop, end); break;
    case 'fbThickness': if (end) { line(n.neckTop, edgeAt(n.neckTop)); line(end, edgeAt(end)); } break;
    // each radius lights its own half of the crown
    case 'fbNutRadius':
    case 'fbEndRadius': {
      let crown = fingerboardCrownLine(p, s);
      if (!crown) break;
      let mid = Math.ceil(crown.length / 2);
      let half = key === 'fbNutRadius' ? crown.slice(0, mid) : crown.slice(mid - 1);
      for (let i = 1; i < half.length; i++) line(half[i - 1], half[i]);
      break;
    }
    // the scoop fields light the guide
    case 'scoopAt':
    case 'scoopBass':
    case 'scoopTreble': {
      let guide = scoopGuideGeometry(p, s);
      if (!guide) break;
      let run = key === 'scoopAt' ? guide.station : key === 'scoopBass' ? guide.bass : guide.treble;
      for (let i = 1; i < run.length; i++) line(run[i - 1], run[i]);
      break;
    }
  }
};

const polyline = (pts: Pt[]) => 'M ' + pts.map(c => `${c.x} ${c.y}`).join(' L ');

// the scoop at scale: a dashed straightedge laid along the board's top from nut to end, the treble
// edge drawn beneath it beside the bass edge the board already shows, knots on the two deepest
// points and the depths written above. A hair at scale, but the true shape
export const renderScoopGuide = (p: ViolinFamilyParams, s: StringSetupSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  let guide = scoopGuideGeometry(p, s);
  if (!guide) return;
  let ss = p.stringSetup!;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  let up = vectorFromSlope(p.neck!.angle * TURN.degree + TURN.quarter);
  let above = (at: Pt, mag: number) => moveInVectorSpace(at, [{ ...normal, mag }]);
  let along = (at: Pt, mag: number) => moveInVectorSpace(at, [{ ...up, mag }]);
  renderGuideBaseline(guide.straightedge[0], guide.straightedge[1], pal.ink(0))(g, ui);
  renderPath(polyline(guide.treble), pal.ink(0).faint(-3), STROKE_WEIGHT.guide)(g, ui);
  let [deepestBass, onStraightedge] = guide.station;
  renderGuideKnot(deepestBass, pal.ink(0))(g, ui);
  renderGuideKnot(guide.deepestTreble, pal.ink(0).faint(-3))(g, ui);
  // the labels sit clear of the string where it passes the station, staggered along the board,
  // treble toward the nut and bass toward the end
  let gap = SCOOP_GUIDE_LABEL_SIZE * 1.5;
  let root = s.neck.root!;
  let offPlane = (pt: Pt) => (pt.x - root.x) * normal.a + (pt.y - root.y) * normal.b;
  let lift = gap;
  if (s.nutTop && s.bridgeTop) {
    let share = dist(s.nutTop, onStraightedge) / dist(s.nutTop, s.bridgeTop);
    lift = Math.max(gap, offPlane(s.nutTop) + (offPlane(s.bridgeTop) - offPlane(s.nutTop)) * share - offPlane(onStraightedge) + gap);
  }
  // the text is centred, so each label moves out by half its own width to start past the string
  let label = (text: string, stagger: number, color: string) =>
    renderText(along(above(onStraightedge, lift + text.length * SCOOP_GUIDE_LABEL_SIZE * 0.28), stagger), text, color, SCOOP_GUIDE_LABEL_SIZE)(g, ui);
  label(`bass ${ss.scoopBass} mm`, -gap, pal.ink(0));
  label(`treble ${ss.scoopTreble} mm`, gap, pal.ink(0).faint(-3));
};

// where the scoop guide's lines fall, all at scale. `straightedge` runs along the board's top edge
// from nut to end, where the edges would be with no scoop; `bass` and `treble` are the scooped
// edges beneath it; `station` runs from the bass edge's deepest point up to the straightedge, and
// `deepestTreble` is the treble edge's. Null while the board or the scoop doesn't solve
export function scoopGuideGeometry(p: ViolinFamilyParams, s: StringSetupSolve):
  { straightedge: [Pt, Pt]; bass: Pt[]; treble: Pt[]; station: [Pt, Pt]; deepestTreble: Pt } | null {
  let neckTop = s.neck.neckTop;
  let end = s.fingerboardEnd;
  if (!neckTop || !end || s.failures.some(f => f.unsolved.includes('fingerboard') || f.unsolved.includes('scoop'))) return null;
  let ss = p.stringSetup!;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  let above = (at: Pt, mag: number) => moveInVectorSpace(at, [{ ...normal, mag }]);
  let deepestAt = pointAtDistanceToward(neckTop, end, ss.scoopAt);
  let onStraightedge = above(deepestAt, ss.fingerboardThickness);
  let deepest = (side: -1 | 1) => above(deepestAt, ss.fingerboardThickness - fingerboardScoopAt(p, s, deepestAt.y, side));
  return {
    straightedge: [above(neckTop, ss.fingerboardThickness), above(end, ss.fingerboardThickness)],
    bass: fingerboardEdgeLine(p, s, -1),
    treble: fingerboardEdgeLine(p, s, 1),
    station: [deepest(-1), onStraightedge],
    deepestTreble: deepest(1),
  };
}

// the instrument from the front: the top plate with whatever the neck and board cover cut away, the
// bridge across the upper eyes' inner edges, the board (or the bare neck with the board off), the nut
// past its end and the scroll's front on up from it. Worked out here, once a draw; the canvas replays
// the layer on every pan and zoom
const renderStringSetupFrontView = (
  p: ViolinFamilyParams,
  s: StringSetupSolve,
  o: OuterContourSolve,
  scroll: ScrollSolve | null,
  pal: PanelPalette,
  showFingerboard: boolean,
  highlighted: { key: StringSetupHighlightKey; color: string } | null = null,
): RenderLayer => {
  let n = s.neck;
  if (!n.neckTop) return () => {};
  let nk = p.neck!;
  let topY = n.neckTop.y;
  let onNeck = scrollOnNeck(p, n);
  let neck = neckInPlan(p, n);
  let board: string | null = null;
  // the scoop's deepest station across the board
  let station: [Pt, Pt] | null = null;
  if (showFingerboard && s.fingerboardEnd) {
    let endY = s.fingerboardEnd.y;
    let endHalf = neckHalfWidthAt(p, n, endY);
    board = pathFromPolygon([new Pt(-endHalf, endY), new Pt(endHalf, endY), new Pt(nk.topWidth / 2, topY), new Pt(-nk.topWidth / 2, topY)]);
    if (scoopGuideGeometry(p, s)) {
      let y = pointAtDistanceToward(n.neckTop, s.fingerboardEnd, p.stringSetup!.scoopAt).y;
      let half = neckHalfWidthAt(p, n, y);
      station = [new Pt(-half, y), new Pt(half, y)];
    }
  }
  // a dot over the edge is inlaid as the part that lands on the board
  let dots = board ? s.marks.flatMap(m => m.dots).map(dot => ({ dot, inlay: intersectionFromTwoPaths(pathFromCircle(dot), board!) })) : [];
  let haloed = highlighted?.key === 'marks' ? highlighted.color : null;
  let nutY = applyMatrix(onNeck, new Pt(0, nk.nutHeight)).y;
  let nut = [new Pt(-nk.nutWidth / 2, topY), new Pt(nk.nutWidth / 2, topY), new Pt(nk.nutWidth / 2, nutY), new Pt(-nk.nutWidth / 2, nutY)];

  // the neck too under the board, in case a short board ends above the mortise floor
  let cover = board ? [neck, board] : [neck];
  let cut = (d: string | null) => d ? occludePath(d, cover).visible : '';
  let holes = p.fHoleContours ? solveFholeContours(p)! : null;
  let fHoles = holes?.path ? [holes.path, fholePath(p, holes, true)!] : [];
  let plate = cut(o.top);
  let lines = [o.purfling, o.outerPurfling, ...fHoles].map(cut);

  // from above, the feet
  let bridge: Pt[] | null = null;
  if (s.bridge) {
    let [neckFoot, tailFoot] = s.bridge;
    let half = familyStandards(p.body.height).bridge.footWidth / 2;
    bridge = [new Pt(-half, tailFoot.y), new Pt(half, tailFoot.y), new Pt(half, neckFoot.y), new Pt(-half, neckFoot.y)];
  }

  // the scroll's frame seen from the front: across stays across, up the neck foreshortens by the angle
  let head: ReturnType<typeof scrollFrontViewStrokes> | null = null;
  if (scroll) head = scrollFrontViewStrokes(p, scroll, (x, y) => new Pt(x, onNeck[3] * y + onNeck[5]), 0);

  return (g: any, ui: any): void => {
    renderPath(plate, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
    for (let d of lines) renderPath(d, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
    if (bridge) renderPolygon(bridge, pal.ink(1), STROKE_WEIGHT.section)(g, ui);
    renderPath(board ?? neck, board ? pal.ink(0) : pal.neutral, STROKE_WEIGHT.section)(g, ui);
    if (station) renderDashedLine(station[0], station[1], pal.ink(0), '2 3', STROKE_WEIGHT.guide, 0.5)(g, ui);
    for (let { dot, inlay } of dots) {
      renderFilledPath(inlay, pal.ink(3), 1, 'nonzero')(g, ui);
      if (haloed) renderPointHalo(dot, haloed, dot.r + MARK_HALO_RADIUS)(g, ui);
    }
    renderPolygon(nut, pal.ink(0).faint(-3), STROKE_WEIGHT.section)(g, ui);
    // the nut and the neck below it are this view's own
    if (head) {
      let { nut: _, neck: __, ...rest } = head;
      for (let stroke of Object.values(rest).flat()) renderStroke(stroke, pal.neutral)(g, ui);
    }
  };
};

// where y stands along the board: 0 at the nut, 1 at the end, held past either
function alongBoard(s: StringSetupSolve, y: number): number {
  let topY = s.neck.neckTop!.y, endY = s.fingerboardEnd!.y;
  return Math.min(1, Math.max(0, (topY - y) / (topY - endY)));
}

// the crown's radius at y: the nut's at the nut, the end's at the board's end, linear between
export function fingerboardRadiusAt(p: ViolinFamilyParams, s: StringSetupSolve, y: number): number {
  let { fingerboardNutRadius: nut, fingerboardEndRadius: end } = p.stringSetup!;
  return nut + (end - nut) * alongBoard(s, y);
}

// how deep the scoop runs under a straightedge laid along the board's top at y, at `side` across
// it: -1 the bass edge, 1 the treble edge, 0 the centre. Each edge dips to its own depth at the
// same station, as two arcs meeting there on a shared tangent, one up to the nut and one to the
// end; the depth runs linearly between the edges. Zero while the scoop doesn't solve
export function fingerboardScoopAt(p: ViolinFamilyParams, s: StringSetupSolve, y: number, side = 0): number {
  if (!s.fingerboardEnd || s.failures.some(f => f.unsolved.includes('scoop'))) return 0;
  let ss = p.stringSetup!;
  let length = dist(s.neck.neckTop!, s.fingerboardEnd);
  let d = alongBoard(s, y) * length;
  let run = d < ss.scoopAt ? ss.scoopAt : length - ss.scoopAt;
  let x = Math.min(run, Math.abs(d - ss.scoopAt));
  let dip = (depth: number) => {
    if (!(depth > 0)) return 0;
    let r = (run * run + depth * depth) / (2 * depth);
    return Math.max(0, depth - (r - Math.sqrt(r * r - x * x)));
  };
  let t = (side + 1) / 2;
  return dip(ss.scoopBass) * (1 - t) + dip(ss.scoopTreble) * t;
}

// the board's top edge at `side` (-1 bass, 1 treble), nut to end: its thickness off the neck, less
// the scoop. Straight while the board is flat; a curve too slight to see otherwise
export function fingerboardEdgeLine(p: ViolinFamilyParams, s: StringSetupSolve, side: -1 | 1): Pt[] {
  let neckTop = s.neck.neckTop!, end = s.fingerboardEnd!;
  let thickness = p.stringSetup!.fingerboardThickness;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  return Array.from({ length: FINGERBOARD_CROWN_SAMPLES + 1 }, (_, i) => {
    let at = pointAtDistanceToward(neckTop, end, i * dist(neckTop, end) / FINGERBOARD_CROWN_SAMPLES);
    return moveInVectorSpace(at, [{ ...normal, mag: thickness - fingerboardScoopAt(p, s, at.y, side) }]);
  });
}

// how far the board's conical crown stands above its edges, over its width and radius at y
export function fingerboardCrown(p: ViolinFamilyParams, s: StringSetupSolve, y: number): number {
  let r = fingerboardRadiusAt(p, s, y);
  let half = neckHalfWidthAt(p, s.neck, y);
  return r - Math.sqrt(r * r - half * half);
}

// the board's top along the centre, from its edge at the nut over the crown to its edge at the end.
// The crown's rise follows the board's width and radius, both growing linearly, less the scoop
// down the middle. Null while a radius can't span the board
export function fingerboardCrownLine(p: ViolinFamilyParams, s: StringSetupSolve): Pt[] | null {
  let neckTop = s.neck.neckTop;
  let end = s.fingerboardEnd;
  if (!neckTop || !end || s.failures.some(f => f.unsolved.includes('fingerboard'))) return null;
  let thickness = p.stringSetup!.fingerboardThickness;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  let above = (at: Pt, mag: number) => moveInVectorSpace(at, [{ ...normal, mag }]);
  let line = [above(neckTop, thickness)];
  for (let i = 0; i <= FINGERBOARD_CROWN_SAMPLES; i++) {
    let at = pointAtDistanceToward(neckTop, end, i * dist(neckTop, end) / FINGERBOARD_CROWN_SAMPLES);
    line.push(above(at, thickness + fingerboardCrown(p, s, at.y) - fingerboardScoopAt(p, s, at.y)));
  }
  line.push(above(end, thickness));
  return line;
}

// the first octave's semitones ticked up the string, the marked ones standing taller. Ticks stop
// at the board's end
function renderFretTicks(nut: Pt, bridge: Pt, boardLength: number, marks: PositionMarksParams, pal: PanelPalette) {
  let stringLength = dist(nut, bridge);
  let along: Vect2D = { a: (bridge.x - nut.x) / stringLength, b: (bridge.y - nut.y) / stringLength, mag: 1 };
  let across: Vect2D = { a: -along.b, b: along.a, mag: 1 };

  return (g: any, ui: any): void => {
    let tick = (semitone: number, halfLength: number, color: string) => {
      let d = semitoneStop(semitone, stringLength);
      if (d > boardLength) return;
      let center = moveInVectorSpace(nut, [{ ...along, mag: d }]);
      let a = moveInVectorSpace(center, [{ ...across, mag: halfLength }]);
      let b = moveInVectorSpace(center, [{ ...across, mag: -halfLength }]);
      renderSegment(a, b, color, STROKE_WEIGHT.guide)(g, ui);
    };
    for (let semitone = 1; semitone <= FRET_MARK_SEMITONES; semitone++) {
      if (!marks.semitones.includes(semitone)) tick(semitone, FRET_TICK_HALF_LENGTH, pal.ink(0).faint(-3));
    }
    for (let semitone of marks.semitones) if (Number.isInteger(semitone) && semitone > 0) tick(semitone, LANDMARK_TICK_HALF_LENGTH, pal.ink(3));
  };
}

// a later panel reads the string setup by calling this; it returns and never writes to the params.
// The bridge's feet sit on the top's arch along the channel's centreline, centred the body stop down
// from the neck end. It stands plumb over them, whatever the arch and the rib taper do under it, and
// carries the string over the middle of its top. The nut and the board square to the fingerboard plane
export function solveStringSetup(p: ViolinFamilyParams): StringSetupSolve | null {
  if (!p.stringSetup || !p.neck) return null;
  let ss = p.stringSetup;
  let neck = solveNeck(p)!;
  let s: StringSetupSolve = { neck, bridgeFoot: null, bridge: null, bridgeTop: null, nutTop: null, fingerboardEnd: null, marks: [], failures: [] };
  let fail = (message: string, unsolved: StringSetupFailure['unsolved'], points: Pt[] = []): StringSetupFailure =>
    ({ message, unsolved, circles: [], segments: [], points });
  let { neckTop, root } = neck;
  if (!neckTop || !root) {
    s.failures.push(fail('String setup: the neck has to solve first; everything here stands on it.', ['bridge', 'nut', 'fingerboard']));
    return s;
  }
  let normal = vectorFromSlope(p.neck.angle * TURN.degree);

  solveSection(s.failures, 'Bridge', ['bridge'], () => {
    if (![ss.bodyStop, ss.bridgeHeight].every(Number.isFinite)) return fail('Bridge: the stop and the height need values.', ['bridge']);
    if (!(ss.bodyStop > 0 && ss.bodyStop < p.body.height)) return fail(`Bridge: the stop has to land on the body, between 0 and ${p.body.height} mm.`, ['bridge']);
    if (!(ss.bridgeHeight > 0)) return fail('Bridge: the height needs a value above 0.', ['bridge']);
    let a = solveLongArching(p)!;
    let placement = topPlatePlacement(p, a.ribs!);
    let outerZ = a.ribs!.zLower + p.arching!.top.thickness;
    let y = p.body.height - ss.bodyStop;
    let onArch = (at: number) => placeOnTopPlate(placement, new Pt(outerZ + channelCenterlineZAt(p, p.fluting!.top, a.top, at), at));
    let blank = familyStandards(p.body.height).bridge;
    let neckFoot = onArch(y + blank.footThickness / 2), tailFoot = onArch(y - blank.footThickness / 2);
    let foot = s.bridgeFoot = onArch(y);
    let top = s.bridgeTop = new Pt(foot.x + ss.bridgeHeight, foot.y);
    s.bridge = [neckFoot, tailFoot, new Pt(top.x, top.y - blank.topThickness / 2), new Pt(top.x, top.y + blank.topThickness / 2)];
    return null;
  });

  // the board's width and the crown's radius both run linearly down the board, so a radius that
  // spans the half width at both ends spans it everywhere between
  solveSection(s.failures, 'Fingerboard', ['fingerboard'], () => {
    let typed = [ss.fingerboardLength, ss.fingerboardThickness, ss.fingerboardNutRadius, ss.fingerboardEndRadius];
    if (!typed.every(Number.isFinite)) return fail('Fingerboard: the length, thickness and both radii need values.', ['fingerboard']);
    if (!(ss.fingerboardLength > 0)) return fail('Fingerboard: the length needs a value above 0.', ['fingerboard']);
    if (ss.fingerboardThickness < 0) return fail('Fingerboard: the thickness can\'t be negative.', ['fingerboard']);
    let end = s.fingerboardEnd = pointAtDistanceToward(neckTop, root, ss.fingerboardLength);
    let ends: [string, number, Pt][] = [
      ['nut', ss.fingerboardNutRadius, neckTop],
      ['end', ss.fingerboardEndRadius, end],
    ];
    for (let [name, r, at] of ends) {
      let half = neckHalfWidthAt(p, neck, at.y);
      if (r <= half) {
        return fail(`Fingerboard: the radius at the ${name} has to span the board's half width there, ${half.toFixed(1)} mm.`, ['fingerboard'],
          [moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness }])]);
      }
    }
    return null;
  });

  solveSection(s.failures, 'Scoop', ['scoop'], () => {
    if (!s.fingerboardEnd) return fail('Scoop: the board has to solve first; it\'s planed into its top.', ['scoop']);
    if (![ss.scoopAt, ss.scoopBass, ss.scoopTreble].every(Number.isFinite)) return fail('Scoop: the deepest station and both depths need values.', ['scoop']);
    if (ss.scoopBass < 0 || ss.scoopTreble < 0) return fail('Scoop: a depth can\'t be negative.', ['scoop']);
    if (!(ss.scoopAt > 0 && ss.scoopAt < ss.fingerboardLength)) {
      return fail(`Scoop: its deepest point has to lie along the board, between 0 and ${ss.fingerboardLength} mm from the nut.`, ['scoop']);
    }
    return null;
  });

  // a nut below the crown still draws, since that's where the strings would lie on the board. The
  // crown at the nut stands whenever the radius spans the board's half width there, a board too
  // round to pass as one or not
  solveSection(s.failures, 'Nut', ['nut'], () => {
    if (!Number.isFinite(ss.nutThickness) || !(ss.nutThickness > 0)) return fail('Nut: the thickness needs a value above 0.', ['nut']);
    s.nutTop = moveInVectorSpace(neckTop, [{ ...normal, mag: ss.nutThickness }]);
    if (!s.fingerboardEnd || !(ss.fingerboardNutRadius > neckHalfWidthAt(p, neck, neckTop.y))) return null;
    let crownAtNut = ss.fingerboardThickness + fingerboardCrown(p, s, neckTop.y);
    if (ss.nutThickness < crownAtNut) {
      return fail(`Nut: it stands below the fingerboard's crown, which is ${crownAtNut.toFixed(1)} mm off the neck at the nut.`, [],
        [moveInVectorSpace(neckTop, [{ ...normal, mag: crownAtNut }])]);
    }
    return null;
  });

  // each interval stops the string a share of its length down from the nut; that point drops square
  // onto the fingerboard plane for its station, and the dot sits across the board there, its offset
  // scaled by the board's width. A mark past the board's end is left out and said so, the rest drawn
  solveSection(s.failures, 'Position Marks', ['marks'], () => {
    let m = ss.marks;
    if (!s.nutTop || !s.bridgeTop || !s.fingerboardEnd) return fail('Position marks: the nut, the bridge and the board have to solve first; they\'re laid out between them.', ['marks']);
    if (!m.semitones.every(n => Number.isInteger(n) && n > 0)) return fail('Position marks: each interval is a whole number of semitones above the open string, 1 or more.', ['marks']);
    if (!(m.diameter > 0)) return fail('Position marks: the diameter needs a value above 0.', ['marks']);
    // a dot may hang over the edge, inlaid as the part that lands on the board, but has to reach it
    let halfAtNut = neckHalfWidthAt(p, neck, neckTop.y);
    if (!Number.isFinite(m.offset) || Math.abs(m.offset) - m.diameter / 2 >= halfAtNut) {
      return fail(`Position marks: the dot has to reach the board, which is ${(2 * halfAtNut).toFixed(1)} mm wide at the nut.`, ['marks']);
    }
    let stringLength = dist(s.nutTop, s.bridgeTop);
    let boardLength = dist(neckTop, s.fingerboardEnd);
    let board: Vect2D = { a: (s.fingerboardEnd.x - neckTop.x) / boardLength, b: (s.fingerboardEnd.y - neckTop.y) / boardLength, mag: 1 };
    let past: number[] = [];
    for (let semitone of [...new Set(m.semitones)].sort((a, b) => a - b)) {
      let alongString = semitoneStop(semitone, stringLength);
      let onString = pointAtDistanceToward(s.nutTop, s.bridgeTop, alongString);
      let alongBoard = (onString.x - neckTop.x) * board.a + (onString.y - neckTop.y) * board.b;
      if (alongBoard > boardLength) { past.push(semitone); continue; }
      let station = moveInVectorSpace(neckTop, [{ ...board, mag: alongBoard }]);
      // the share of the board scales with its width; an overhang past the edge is carried as is
      let half = neckHalfWidthAt(p, neck, station.y);
      let x = Math.sign(m.offset) * (Math.min(Math.abs(m.offset), halfAtNut) * half / halfAtNut + Math.max(0, Math.abs(m.offset) - halfAtNut));
      s.marks.push({ semitone, alongString, station, dots: [new Circle(x, station.y, m.diameter / 2)] });
    }
    if (past.length) return fail(`Position marks: semitone${past.length > 1 ? 's' : ''} ${past.join(', ')} fall${past.length > 1 ? '' : 's'} past the board's end.`, []);
    return null;
  });
  return s;
}

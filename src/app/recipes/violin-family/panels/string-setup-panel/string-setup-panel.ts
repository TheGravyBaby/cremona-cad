import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { dist, moveInVectorSpace, pointAtDistanceToward, TURN, vectorFromSlope } from '../../../../helpers/math/simpleGeometry';
import { applyMatrix, pathFromPolygon } from '../../../../helpers/math/pathMath';
import { occludePath } from '../../../../helpers/math/pathVibes';
import { renderPath, renderPolygon, renderSegment, renderSegmentHalo, renderSolveFailures, renderStroke } from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { Pt, Vect2D } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { OuterContourSolve, RenderLayer, ScrollSolve, StringSetupFailure, StringSetupSolve, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
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
// neck's length is set here too, since it places the nut. The scroll, once its panels have solved it
// whole, stands on the neck's end in both views. Panel and renders, then the solve.

export type StringSetupHighlightKey = 'length' | 'bodyStop' | 'bridgeHeight' | 'nutThickness' | 'fbLength' | 'fbThickness' | 'fbRadius';

@Component({
  selector: 'app-vf-string-setup-panel',
  imports: [FormsModule, DecimalPipe, NumberStepperDirective],
  templateUrl: './string-setup-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class StringSetupPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showFingerboard', 'showFretMarks'];
  protected readonly pal = ThemeService.getPalette('varnish');

  static seed(p: ViolinFamilyParams): void {
    if (p.stringSetup || !p.neck) return;
    p.stringSetup = { ...familyStandards(p.body.height).strings };
  }

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; the readout and report() read it
  s!: StringSetupSolve;
  highlighted: { key: StringSetupHighlightKey; color: string } | null = null;

  get stringLength(): number | null {
    return this.s?.nutTop && this.s.bridgeTop ? dist(this.s.nutTop, this.s.bridgeTop) : null;
  }

  ngOnInit(): void {
    this.draw();
  }

  edited(): void {
    this.edit.emit();
    this.draw();
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
        renderStringSetup(p, s, this.pal, { fingerboard: this.flags.showFingerboard, fretMarks: this.flags.showFretMarks }),
        renderStringSetupHighlight(p, s, this.highlighted),
        renderSolveFailures([...s.neck.failures, ...s.failures], this.pal.alert),
      ];
      this.drawn.emit([
        renderStringSetupFrontView(p, s, o, scrollInPlan, this.pal, this.flags.showFingerboard),
        (g, ui) => {
          let frame = { g: g.append('g').attr('transform', `translate(${sideX},0)`), ui: ui.append('g').attr('transform', `translate(${sideX},0)`) };
          for (let layer of side) layer(frame.g, frame.ui);
        },
      ]);
    });
  }
}

// the bridge's blank, drawn as a wedge: how much narrower the feet are than its height, and the top
// than the feet
const BRIDGE_FOOT_HALF_WIDTH_RATIO = 0.07;
const BRIDGE_TOP_TO_FOOT_WIDTH_RATIO = 1 / 3;
const FINGERBOARD_CROWN_SAMPLES = 24;
const FINGERBOARD_CROWN_OPACITY = 0.45;
// how many semitones up the string to mark, and how far each tick reaches either side of it. Plain
// semitones stay small so they read as a scale beside the fourth, fifth and octave
const FRET_MARK_SEMITONES = 12;
const FRET_TICK_HALF_LENGTH = 1;
const LANDMARK_TICK_HALF_LENGTH = 3;

// the bridge, the board, the nut and the string, over the neck renderNeck draws. The neck's front is
// in colour since its length is set here
export const renderStringSetup = (
  p: ViolinFamilyParams,
  s: StringSetupSolve,
  pal: PanelPalette,
  opts: { fingerboard?: boolean; fretMarks?: boolean } = {},
) => (g: any, ui: any): void => {
  let n = s.neck;
  if (!n.neckTop || !n.root || !n.glue) return;
  let ss = p.stringSetup!;
  let seg = (a: Pt, b: Pt, color: string) => renderSegment(a, b, color, STROKE_WEIGHT.section)(g, ui);
  let up = vectorFromSlope(p.neck!.angle * TURN.degree + TURN.quarter);
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);

  let wedge = bridgeWedge(s);
  if (wedge) renderPolygon(wedge, pal.ink(1), STROKE_WEIGHT.section)(g, ui);

  if (opts.fingerboard && s.fingerboardEnd) {
    // the board's edges solid, the crown above them faded so the two read apart
    let edgeAt = (at: Pt) => moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness }]);
    renderPolygon([n.neckTop, edgeAt(n.neckTop), edgeAt(s.fingerboardEnd), s.fingerboardEnd], pal.ink(0), STROKE_WEIGHT.section)(g, ui);
    let crown = fingerboardCrownLine(p, s);
    if (crown) renderPath('M ' + crown.map(c => `${c.x} ${c.y}`).join(' L '), pal.ink(0), STROKE_WEIGHT.section, FINGERBOARD_CROWN_OPACITY)(g, ui);
  }

  if (s.nutTop) {
    let nutFar = moveInVectorSpace(n.neckTop, [{ ...up, mag: p.neck!.nutHeight }]);
    let nutFarTop = moveInVectorSpace(nutFar, [{ ...normal, mag: ss.nutThickness }]);
    renderPolygon([n.neckTop, nutFar, nutFarTop, s.nutTop], pal.ink(0).faint(-3), STROKE_WEIGHT.section)(g, ui);
  }

  seg(n.glue, n.root, pal.ink(2));
  seg(n.root, n.neckTop, pal.ink(2));

  if (s.nutTop && s.bridgeTop) {
    seg(s.nutTop, s.bridgeTop, pal.neutral);
    if (opts.fretMarks && s.fingerboardEnd) renderFretTicks(s.nutTop, s.bridgeTop, dist(n.neckTop, s.fingerboardEnd), pal)(g, ui);
  }
};

const renderStringSetupHighlight = (
  p: ViolinFamilyParams,
  s: StringSetupSolve,
  highlighted: { key: StringSetupHighlightKey; color: string } | null,
) => (g: any, ui: any): void => {
  let n = s.neck;
  if (!highlighted || !n.neckTop || !n.glue) return;
  let { key, color } = highlighted;
  let ss = p.stringSetup!;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  let edgeAt = (at: Pt) => moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness }]);
  let line = (a: Pt, b: Pt) => renderSegmentHalo(a, b, color)(g, ui);
  let end = s.fingerboardEnd;

  switch (key) {
    case 'length': line(n.glue, n.neckTop); break;
    case 'bodyStop': if (s.bridgeFoot) line(new Pt(s.bridgeFoot.x, p.body.height), s.bridgeFoot); break;
    case 'bridgeHeight': if (s.bridgeFoot && s.bridgeTop) line(s.bridgeFoot, s.bridgeTop); break;
    case 'nutThickness': if (s.nutTop) line(n.neckTop, s.nutTop); break;
    case 'fbLength': if (end) line(n.neckTop, end); break;
    case 'fbThickness': if (end) { line(n.neckTop, edgeAt(n.neckTop)); line(end, edgeAt(end)); } break;
    case 'fbRadius': {
      let crown = fingerboardCrownLine(p, s);
      if (crown) for (let i = 1; i < crown.length; i++) line(crown[i - 1], crown[i]);
      break;
    }
  }
};

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
): RenderLayer => {
  let n = s.neck;
  if (!n.neckTop) return () => {};
  let nk = p.neck!;
  let topY = n.neckTop.y;
  let onNeck = scrollOnNeck(p, n);
  let neck = neckInPlan(p, n);
  let board: string | null = null;
  if (showFingerboard && s.fingerboardEnd) {
    let endY = s.fingerboardEnd.y;
    let endHalf = neckHalfWidthAt(p, n, endY);
    board = pathFromPolygon([new Pt(-endHalf, endY), new Pt(endHalf, endY), new Pt(nk.topWidth / 2, topY), new Pt(-nk.topWidth / 2, topY)]);
  }
  let nutY = applyMatrix(onNeck, new Pt(0, nk.nutHeight)).y;
  let nut = [new Pt(-nk.nutWidth / 2, topY), new Pt(nk.nutWidth / 2, topY), new Pt(nk.nutWidth / 2, nutY), new Pt(-nk.nutWidth / 2, nutY)];

  // the neck too under the board, in case a short board ends above the mortise floor
  let cover = board ? [neck, board] : [neck];
  let cut = (d: string | null) => d ? occludePath(d, cover).visible : '';
  let holes = p.fHoleContours ? solveFholeContours(p)! : null;
  let fHoles = holes?.path ? [holes.path, fholePath(p, holes, true)!] : [];
  let plate = cut(o.top);
  let lines = [o.purfling, o.outerPurfling, ...fHoles].map(cut);

  let bridge: Pt[] | null = null;
  let wedge = bridgeWedge(s);
  if (wedge) {
    let halfDepth = dist(wedge[0], wedge[1]) / 2;
    let y = (wedge[0].y + wedge[1].y) / 2;
    // the bridge spans the upper eyes' inner edges; a square stands in until the f-holes are placed
    let eye = p.fHoles?.UEye;
    let halfWidth = eye ? Math.abs(eye.x) - eye.r : halfDepth;
    bridge = [new Pt(-halfWidth, y - halfDepth), new Pt(halfWidth, y - halfDepth), new Pt(halfWidth, y + halfDepth), new Pt(-halfWidth, y + halfDepth)];
  }

  // the scroll's frame seen from the front: across stays across, up the neck foreshortens by the angle
  let head: ReturnType<typeof scrollFrontViewStrokes> | null = null;
  if (scroll) head = scrollFrontViewStrokes(p, scroll, (x, y) => new Pt(x, onNeck[3] * y + onNeck[5]), 0);

  return (g: any, ui: any): void => {
    renderPath(plate, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
    for (let d of lines) renderPath(d, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
    if (bridge) renderPolygon(bridge, pal.ink(1), STROKE_WEIGHT.section)(g, ui);
    renderPath(board ?? neck, board ? pal.ink(0) : pal.neutral, STROKE_WEIGHT.section)(g, ui);
    renderPolygon(nut, pal.ink(0).faint(-3), STROKE_WEIGHT.section)(g, ui);
    // the nut and the neck below it are this view's own
    if (head) {
      let { nut: _, neck: __, ...rest } = head;
      for (let stroke of Object.values(rest).flat()) renderStroke(stroke, pal.neutral)(g, ui);
    }
  };
};

// the bridge's blank: foot-left, foot-right, top-right, top-left
function bridgeWedge(s: StringSetupSolve): [Pt, Pt, Pt, Pt] | null {
  let foot = s.bridgeFoot;
  let top = s.bridgeTop;
  if (!foot || !top) return null;
  let span = dist(foot, top);
  let across: Vect2D = { a: -(top.y - foot.y) / span, b: (top.x - foot.x) / span, mag: 1 };
  let footHalfWidth = BRIDGE_FOOT_HALF_WIDTH_RATIO * span;
  let topHalfWidth = footHalfWidth * BRIDGE_TOP_TO_FOOT_WIDTH_RATIO;
  return [
    moveInVectorSpace(foot, [{ ...across, mag: -footHalfWidth }]),
    moveInVectorSpace(foot, [{ ...across, mag: footHalfWidth }]),
    moveInVectorSpace(top, [{ ...across, mag: topHalfWidth }]),
    moveInVectorSpace(top, [{ ...across, mag: -topHalfWidth }]),
  ];
}

// how far the board's cylindrical crown stands above its edges, over its width at y
export function fingerboardCrown(p: ViolinFamilyParams, s: StringSetupSolve, y: number): number {
  let r = p.stringSetup!.fingerboardRadius;
  let half = neckHalfWidthAt(p, s.neck, y);
  return r - Math.sqrt(r * r - half * half);
}

// the board's top, from its edge at the nut over the crown to its edge at the end. The crown's rise
// follows the board's width, which grows linearly, so its line curves slightly. Null while the
// radius can't span the board
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
    line.push(above(at, thickness + fingerboardCrown(p, s, at.y)));
  }
  line.push(above(end, thickness));
  return line;
}

// twelve-tone equal temperament: each semitone shortens the sounding length by the twelfth root of
// 2, so semitone n sits `stringLength * (1 - 2^(-n/12))` from the nut. Ticks stop at the board's end
function renderFretTicks(nut: Pt, bridge: Pt, boardLength: number, pal: PanelPalette) {
  let stringLength = dist(nut, bridge);
  let along: Vect2D = { a: (bridge.x - nut.x) / stringLength, b: (bridge.y - nut.y) / stringLength, mag: 1 };
  let across: Vect2D = { a: -along.b, b: along.a, mag: 1 };

  return (g: any, ui: any): void => {
    let tick = (semitone: number, halfLength: number, color: string) => {
      let d = stringLength * (1 - 2 ** (-semitone / 12));
      if (d > boardLength) return;
      let center = moveInVectorSpace(nut, [{ ...along, mag: d }]);
      let a = moveInVectorSpace(center, [{ ...across, mag: halfLength }]);
      let b = moveInVectorSpace(center, [{ ...across, mag: -halfLength }]);
      renderSegment(a, b, color, STROKE_WEIGHT.guide)(g, ui);
    };
    for (let semitone = 1; semitone <= FRET_MARK_SEMITONES; semitone++) {
      if (![5, 7, 12].includes(semitone)) tick(semitone, FRET_TICK_HALF_LENGTH, pal.ink(0).faint(-3));
    }
    // the perfect fourth, the perfect fifth and the octave
    tick(5, LANDMARK_TICK_HALF_LENGTH, pal.ink(0).faint(-2));
    tick(7, LANDMARK_TICK_HALF_LENGTH, pal.ink(0).faint(-5));
    tick(12, LANDMARK_TICK_HALF_LENGTH, pal.ink(0).faint(3));
  };
}

// a later panel reads the string setup by calling this; it returns and never writes to the params.
// The bridge stands on the top's arch along the channel's centreline, the body stop down from the
// neck end, square to the plate as the rib taper tilts it; the nut and the board square to the
// fingerboard plane
export function solveStringSetup(p: ViolinFamilyParams): StringSetupSolve | null {
  if (!p.stringSetup || !p.neck) return null;
  let ss = p.stringSetup;
  let neck = solveNeck(p)!;
  let s: StringSetupSolve = { neck, bridgeFoot: null, bridgeTop: null, nutTop: null, fingerboardEnd: null, failures: [] };
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
    let archZ = channelCenterlineZAt(p, p.fluting!.top, a.top, y);
    s.bridgeFoot = placeOnTopPlate(placement, new Pt(outerZ + archZ, y));
    s.bridgeTop = placeOnTopPlate(placement, new Pt(outerZ + archZ + ss.bridgeHeight, y));
    return null;
  });

  // the board's width tapers with the neck's, so its widest is at one end or the other
  solveSection(s.failures, 'Fingerboard', ['fingerboard'], () => {
    let typed = [ss.fingerboardLength, ss.fingerboardThickness, ss.fingerboardRadius];
    if (!typed.every(Number.isFinite)) return fail('Fingerboard: the length, thickness and radius need values.', ['fingerboard']);
    if (!(ss.fingerboardLength > 0)) return fail('Fingerboard: the length needs a value above 0.', ['fingerboard']);
    if (ss.fingerboardThickness < 0) return fail('Fingerboard: the thickness can\'t be negative.', ['fingerboard']);
    let end = s.fingerboardEnd = pointAtDistanceToward(neckTop, root, ss.fingerboardLength);
    let widest = Math.max(neckHalfWidthAt(p, neck, neckTop.y), neckHalfWidthAt(p, neck, end.y));
    if (ss.fingerboardRadius <= widest) {
      return fail(`Fingerboard: the radius has to span the board's half width, ${widest.toFixed(1)} mm at its widest.`, ['fingerboard'],
        [moveInVectorSpace(end, [{ ...normal, mag: ss.fingerboardThickness }])]);
    }
    return null;
  });

  // a nut below the crown still draws, since that's where the strings would lie on the board. The
  // crown at the nut stands whenever the radius spans the board's half width there, a board too
  // round to pass as one or not
  solveSection(s.failures, 'Nut', ['nut'], () => {
    if (!Number.isFinite(ss.nutThickness) || !(ss.nutThickness > 0)) return fail('Nut: the thickness needs a value above 0.', ['nut']);
    s.nutTop = moveInVectorSpace(neckTop, [{ ...normal, mag: ss.nutThickness }]);
    if (!s.fingerboardEnd || !(ss.fingerboardRadius > neckHalfWidthAt(p, neck, neckTop.y))) return null;
    let crownAtNut = ss.fingerboardThickness + fingerboardCrown(p, s, neckTop.y);
    if (ss.nutThickness < crownAtNut) {
      return fail(`Nut: it stands below the fingerboard's crown, which is ${crownAtNut.toFixed(1)} mm off the neck at the nut.`, [],
        [moveInVectorSpace(neckTop, [{ ...normal, mag: crownAtNut }])]);
    }
    return null;
  });
  return s;
}

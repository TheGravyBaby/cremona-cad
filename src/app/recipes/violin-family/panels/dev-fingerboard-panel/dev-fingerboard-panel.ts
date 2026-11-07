import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dist, moveInVectorSpace, pointAtDistanceToward, TURN, vectorFromSlope } from '../../../../helpers/math/simpleGeometry';
import { pathFromCircle, pathFromPolyline } from '../../../../helpers/math/pathMath';
import { intersectionFromTwoPaths } from '../../../../helpers/math/pathVibes';
import {
  renderDashedLine, renderFilledPath, renderGuideKnot, renderPath, renderPointHalo, renderSegmentHalo, renderSolveFailures, renderText,
} from '../../../../helpers/renderFuncs';
import { buildMiss, reportFailures, solveSection, SolveFailure } from '../../../../helpers/validators';
import { readWorkingState, writeWorkingState } from '../../../../helpers/workingStorage';
import { Circle, Pt, Vect2D } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey } from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import { StringSetupSolve } from '../../violin-family-solves';
import { familyStandards, FamilyStandards } from '../../violin-family-seed';
import { neckHalfWidthAt } from '../neck-panel/neck-panel';
import {
  calcAlongBoard, defineFingerboardInPlan, renderFretTicks, renderStringSetupViews, calcSemitoneStop, solveStringSetup,
} from '../string-setup-panel/string-setup-panel';

export interface PositionMarker {
  semitone: number;
  diameter: number;
  offset: number;
  shape: 'circle'
}

// one position mark: how far down the string it sounds, its station on the fingerboard plane in the
// side elevation, and its dots in plan (x across the board, y along it), one per marker at that
// semitone; `markers` holds each dot's index in the marker list
export interface PositionMarkSolve {
  semitone: number;
  alongString: number;
  station: Pt;
  dots: Circle[];
  markers: number[];
}

export type PositionMarksFailure = SolveFailure<'marks'>;

export interface PositionMarksSolve {
  // the marks that land on the board, in semitone order
  marks: PositionMarkSolve[];
  failures: PositionMarksFailure[];
}

export type ScoopFailure = SolveFailure<'scoop'>;

// the scoop is planed into a board string setup draws straight; its params ride on p.stringSetup
export interface ScoopSolve {
  failures: ScoopFailure[];
}

const STATE_KEY = 'violinFamilyDevFingerboard';
const SCOOP_EDGE_SAMPLES = 24;
const SCOOP_GUIDE_LABEL_SIZE = 4;

// a dot's size and its offset toward the bass on the bigger instruments, where the player looks
// down the other side of the board
const MARK_DEFAULTS: Record<FamilyStandards['family'], Pick<PositionMarker, 'diameter' | 'offset'>> = {
  violin: { diameter: 2, offset: 9 },
  viola: { diameter: 2.5, offset: 9 },
  cello: { diameter: 3, offset: -10.5 },
  bass: { diameter: 4, offset: -14 },
};

type DevFingerboardHighlightKey = 'scoopAt' | 'scoopBass' | 'scoopTreble' | 'marks';

@Component({
  selector: 'app-vf-dev-fingerboard-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './dev-fingerboard-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class DevFingerboardPanel extends PanelComponentBase<DevFingerboardHighlightKey> {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showFingerboard', 'showFretMarks', 'showScoopGuide'];
  protected readonly pal = ThemeService.getPalette('varnish');

  markers!: PositionMarker[];
  s!: StringSetupSolve;
  k!: ScoopSolve;
  m!: PositionMarksSolve;
  // the row whose field has focus; only read while 'marks' is highlighted
  focusedMarker = 0;

  override ngOnInit(): void {
    this.markers = readMarkers() ?? defaultPositionMarks(this.params);
    super.ngOnInit();
  }

  // the panel's own settings, kept for the tab alone
  stateEdited(): void {
    writeWorkingState(STATE_KEY, JSON.stringify(this.markers));
    this.drawCanvas();
  }

  focusMarker(index: number): void {
    this.focusedMarker = index;
    this.highlightPart('marks', this.pal.ink(3));
  }

  addMarker(): void {
    let last = this.markers.at(-1) ?? defaultPositionMarks(this.params)[0];
    this.markers.push({ ...last });
    this.stateEdited();
  }

  removeMarker(index: number): void {
    this.markers.splice(index, 1);
    this.stateEdited();
  }

  sortMarkers(): void {
    this.markers.sort((a, b) => a.semitone - b.semitone || a.offset - b.offset);
    this.stateEdited();
  }

  reportSolveFailures(): void {
    reportFailures([...this.k.failures, ...this.m.failures], 'Dev Fingerboard');
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let p = this.params;
    let s = this.s = solveStringSetup(p)!;
    let k = this.k = solveScoop(p, s);
    let m = this.m = solvePositionMarks(p, s, this.markers);
    let front: RenderLayer[] = [], side: RenderLayer[] = [];
    let highlighted = this.highlightedPart;
    let halo = highlighted?.key === 'marks' ? { marker: this.focusedMarker, color: highlighted.color } : null;
    if (this.flags.showFingerboard) {
      front.push(renderPositionMarks(p, s, m, this.pal, halo));
      if (this.flags.showScoopGuide) {
        front.push(renderScoopStation(p, s, k, this.pal));
        side.push(renderScoopGuide(p, s, k, this.pal));
      }
    }
    if (this.flags.showFretMarks) side.push(renderFretTicks(s, this.markers.map(marker => marker.semitone), this.pal));
    if (highlighted && highlighted.key !== 'marks') side.push(renderScoopHighlight(p, s, k, highlighted.key, highlighted.color));
    side.push(renderSolveFailures([...k.failures, ...m.failures], this.pal.alert));
    return renderStringSetupViews(p, s, this.pal, { fingerboard: this.flags.showFingerboard, front, side });
  }
}

function readMarkers(): PositionMarker[] | null {
  try {
    let parsed = JSON.parse(readWorkingState(STATE_KEY) ?? 'null');
    return Array.isArray(parsed) && parsed.every(m => m && typeof m === 'object' && 'semitone' in m) ? parsed : null;
  } catch {
    return null;
  }
}

const MARK_HALO_RADIUS = 3;

// the dots in the front view, each the part of it that lands on the board
const renderPositionMarks = (
  p: ViolinFamilyParams, s: StringSetupSolve, m: PositionMarksSolve, pal: PanelPalette, halo: { marker: number; color: string } | null,
): RenderLayer => {
  let board = defineFingerboardInPlan(p, s);
  let dots = board ? m.marks.flatMap(mark => mark.dots.map((dot, i) => ({ dot, marker: mark.markers[i], inlay: intersectionFromTwoPaths(pathFromCircle(dot), board!) }))) : [];
  return (g: any, ui: any): void => {
    for (let { dot, marker, inlay } of dots) {
      renderFilledPath(inlay, pal.ink(3), 1, 'nonzero')(g, ui);
      if (halo?.marker === marker) renderPointHalo(dot, halo.color, dot.r + MARK_HALO_RADIUS)(g, ui);
    }
  };
};

// each interval stops the string a share of its length down from the nut; that point drops square
// onto the fingerboard plane for its station, and every marker at that interval sits across the board
// there, its offset scaled by the board's width. A mark past the board's end is left out and said so,
// the rest drawn
export function solvePositionMarks(p: ViolinFamilyParams, s: StringSetupSolve, markers: PositionMarker[]): PositionMarksSolve {
  let out: PositionMarksSolve = { marks: [], failures: [] };
  let fail = (message: string, unsolved: PositionMarksFailure['unsolved']): PositionMarksFailure => ({ message, unsolved, circles: [], segments: [], points: [] });
  let neckTop = s.neck.neckTop;
  solveSection(out.failures, 'Position Marks', ['marks'], () => {
    if (!neckTop || !s.nutTop || !s.bridgeTop || !s.fingerboardEnd) return fail('Position marks: the nut, the bridge and the board have to solve first; they\'re laid out between them.', ['marks']);
    // a dot may hang over the edge, inlaid as the part that lands on the board, but has to reach it
    let halfAtNut = neckHalfWidthAt(p, s.neck, neckTop.y);
    for (let [i, marker] of markers.entries()) {
      let name = `Position mark ${i + 1}`;
      if (!(Number.isInteger(marker.semitone) && marker.semitone > 0)) return fail(`${name}: the interval is a whole number of semitones above the open string, 1 or more.`, ['marks']);
      if (!(marker.diameter > 0)) return fail(`${name}: the diameter needs a value above 0.`, ['marks']);
      if (!Number.isFinite(marker.offset) || Math.abs(marker.offset) - marker.diameter / 2 >= halfAtNut) {
        return fail(`${name}: the dot has to reach the board, which is ${(2 * halfAtNut).toFixed(1)} mm wide at the nut.`, ['marks']);
      }
    }
    let stringLength = dist(s.nutTop, s.bridgeTop);
    let boardLength = dist(neckTop, s.fingerboardEnd);
    let board: Vect2D = { a: (s.fingerboardEnd.x - neckTop.x) / boardLength, b: (s.fingerboardEnd.y - neckTop.y) / boardLength, mag: 1 };
    let past: number[] = [];
    for (let semitone of [...new Set(markers.map(m => m.semitone))].sort((a, b) => a - b)) {
      let alongString = calcSemitoneStop(semitone, stringLength);
      let onString = pointAtDistanceToward(s.nutTop, s.bridgeTop, alongString);
      let alongBoard = (onString.x - neckTop.x) * board.a + (onString.y - neckTop.y) * board.b;
      if (alongBoard > boardLength) { past.push(semitone); continue; }
      let station = moveInVectorSpace(neckTop, [{ ...board, mag: alongBoard }]);
      // the share of the board scales with its width; an overhang past the edge is carried as is
      let half = neckHalfWidthAt(p, s.neck, station.y);
      let mark: PositionMarkSolve = { semitone, alongString, station, dots: [], markers: [] };
      for (let [i, marker] of markers.entries()) {
        if (marker.semitone !== semitone) continue;
        let reach = Math.abs(marker.offset);
        let x = Math.sign(marker.offset) * (Math.min(reach, halfAtNut) * half / halfAtNut + Math.max(0, reach - halfAtNut));
        mark.dots.push(new Circle(x, station.y, marker.diameter / 2));
        mark.markers.push(i);
      }
      out.marks.push(mark);
    }
    if (past.length) return fail(`Position marks: semitone${past.length > 1 ? 's' : ''} ${past.join(', ')} fall${past.length > 1 ? '' : 's'} past the board's end.`, []);
    return null;
  });
  return out;
}

export function defaultPositionMarks(p: ViolinFamilyParams): PositionMarker[] {
  return [5, 7, 12].map(semitone => ({ semitone, ...MARK_DEFAULTS[familyStandards(p.body.height).family], shape: 'circle' }));
}

function calcOffPlane(pt: Pt, root: Pt, normal: Vect2D): number {
  return (pt.x - root.x) * normal.a + (pt.y - root.y) * normal.b;
}

// the text is centred, so each label moves out by half its own width to start past the string
const renderScoopLabel = (at: Pt, normal: Vect2D, up: Vect2D, lift: number, stagger: number, text: string, color: string) => (g: any, ui: any): void => {
  let raised = moveInVectorSpace(at, [{ ...normal, mag: lift + text.length * SCOOP_GUIDE_LABEL_SIZE * 0.28 }]);
  renderText(moveInVectorSpace(raised, [{ ...up, mag: stagger }]), text, color, SCOOP_GUIDE_LABEL_SIZE)(g, ui);
};

// the scoop at scale under the straight top string setup draws: the bass and treble edges, knots on
// their deepest points and the depths written above. A hair at scale, but the true shape
const renderScoopGuide = (p: ViolinFamilyParams, s: StringSetupSolve, k: ScoopSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  let guide = calcScoopGuideGeometry(p, s, k);
  if (!guide) return;
  let ss = p.stringSetup!;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  let up = vectorFromSlope(p.neck!.angle * TURN.degree + TURN.quarter);
  renderPath(pathFromPolyline(guide.bass), pal.ink(0), STROKE_WEIGHT.guide)(g, ui);
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

// the deepest station across the board in the front view
const renderScoopStation = (p: ViolinFamilyParams, s: StringSetupSolve, k: ScoopSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  if (!calcScoopGuideGeometry(p, s, k)) return;
  let y = pointAtDistanceToward(s.neck.neckTop!, s.fingerboardEnd!, p.stringSetup!.scoopAt).y;
  let half = neckHalfWidthAt(p, s.neck, y);
  renderDashedLine(new Pt(-half, y), new Pt(half, y), pal.ink(0), '2 3', STROKE_WEIGHT.guide, 0.5)(g, ui);
};

const renderScoopHighlight = (
  p: ViolinFamilyParams, s: StringSetupSolve, k: ScoopSolve, key: Exclude<DevFingerboardHighlightKey, 'marks'>, color: string,
) => (g: any, ui: any): void => {
  let guide = calcScoopGuideGeometry(p, s, k);
  if (!guide) return;
  let run = key === 'scoopAt' ? guide.station : key === 'scoopBass' ? guide.bass : guide.treble;
  for (let i = 1; i < run.length; i++) renderSegmentHalo(run[i - 1], run[i], color)(g, ui);
};

function calcScoopDip(depth: number, run: number, x: number): number {
  if (!(depth > 0)) return 0;
  let r = (run * run + depth * depth) / (2 * depth);
  return Math.max(0, depth - (r - Math.sqrt(r * r - x * x)));
}

// how deep the scoop runs under a straightedge laid along the board's top at y, at `side` across
// it: -1 the bass edge, 1 the treble edge, 0 the centre. Each edge dips to its own depth at the
// same station, as two arcs meeting there on a shared tangent, one up to the nut and one to the
// end; the depth runs linearly between the edges. Read only once solveScoop has no failures
export function fingerboardScoopAt(p: ViolinFamilyParams, s: StringSetupSolve, y: number, side = 0): number {
  if (!s.fingerboardEnd) return 0;
  let ss = p.stringSetup!;
  let length = dist(s.neck.neckTop!, s.fingerboardEnd);
  let d = calcAlongBoard(s, y) * length;
  let run = d < ss.scoopAt ? ss.scoopAt : length - ss.scoopAt;
  let x = Math.min(run, Math.abs(d - ss.scoopAt));
  let t = (side + 1) / 2;
  return calcScoopDip(ss.scoopBass, run, x) * (1 - t) + calcScoopDip(ss.scoopTreble, run, x) * t;
}

// the board's top edge at `side` (-1 bass, 1 treble), nut to end, its thickness off the neck less
// the scoop
export function calcScoopedEdgeLine(p: ViolinFamilyParams, s: StringSetupSolve, side: -1 | 1): Pt[] {
  let neckTop = s.neck.neckTop!, end = s.fingerboardEnd!;
  let thickness = p.stringSetup!.fingerboardThickness;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  return Array.from({ length: SCOOP_EDGE_SAMPLES + 1 }, (_, i) => {
    let at = pointAtDistanceToward(neckTop, end, i * dist(neckTop, end) / SCOOP_EDGE_SAMPLES);
    return moveInVectorSpace(at, [{ ...normal, mag: thickness - fingerboardScoopAt(p, s, at.y, side) }]);
  });
}

// where the scoop guide's lines fall, all at scale: `bass` and `treble` are the scooped edges,
// `station` runs from the bass edge's deepest point up to the straight top, and `deepestTreble` is
// the treble edge's. Null while the board or the scoop doesn't solve
export function calcScoopGuideGeometry(p: ViolinFamilyParams, s: StringSetupSolve, k: ScoopSolve):
  { bass: Pt[]; treble: Pt[]; station: [Pt, Pt]; deepestTreble: Pt } | null {
  let neckTop = s.neck.neckTop;
  let end = s.fingerboardEnd;
  if (!neckTop || !end || k.failures.length || s.failures.some(f => f.unsolved.includes('fingerboard'))) return null;
  let ss = p.stringSetup!;
  let normal = vectorFromSlope(p.neck!.angle * TURN.degree);
  let deepestAt = pointAtDistanceToward(neckTop, end, ss.scoopAt);
  return {
    bass: calcScoopedEdgeLine(p, s, -1),
    treble: calcScoopedEdgeLine(p, s, 1),
    station: [moveInVectorSpace(deepestAt, [{ ...normal, mag: ss.fingerboardThickness - fingerboardScoopAt(p, s, deepestAt.y, -1) }]), moveInVectorSpace(deepestAt, [{ ...normal, mag: ss.fingerboardThickness }])],
    deepestTreble: moveInVectorSpace(deepestAt, [{ ...normal, mag: ss.fingerboardThickness - fingerboardScoopAt(p, s, deepestAt.y, 1) }]),
  };
}

export function solveScoop(p: ViolinFamilyParams, s: StringSetupSolve): ScoopSolve {
  let k: ScoopSolve = { failures: [] };
  let ss = p.stringSetup!;
  solveSection(k.failures, 'Scoop', ['scoop'], () => {
    if (!s.fingerboardEnd) return buildMiss('Scoop: the board has to solve first; it\'s planed into its top.', ['scoop']);
    if (![ss.scoopAt, ss.scoopBass, ss.scoopTreble].every(Number.isFinite)) return buildMiss('Scoop: the deepest station and both depths need values.', ['scoop']);
    if (ss.scoopBass < 0 || ss.scoopTreble < 0) return buildMiss('Scoop: a depth can\'t be negative.', ['scoop']);
    if (!(ss.scoopAt > 0 && ss.scoopAt < ss.fingerboardLength)) {
      return buildMiss(`Scoop: its deepest point has to lie along the board, between 0 and ${ss.fingerboardLength} mm from the nut.`, ['scoop']);
    }
    return null;
  });
  return k;
}

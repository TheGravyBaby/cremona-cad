import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dist, moveInVectorSpace, pointAtDistanceToward, TURN, vectorFromSlope } from '../../../../helpers/math/simpleGeometry';
import { pathFromCircle, pathFromPolygon, pathFromPolyline, translatePath } from '../../../../helpers/math/pathMath';
import { intersectionFromTwoPaths } from '../../../../helpers/math/pathVibes';
import {
  renderDashedLine, renderFilledPath, renderGuideKnot, renderPath, renderPointHalo, renderSegmentHalo, renderSolveFailures, renderText, renderTranslatedLayers,
} from '../../../../helpers/renderFuncs';
import { buildMiss, reportFailures, solveSection, SolveFailure } from '../../../../helpers/validators';
import { readWorkingState, writeWorkingState } from '../../../../helpers/workingStorage';
import { DEFAULT_LAYER_ID, Layer } from '../../../../draft-canvas/tools/layer';
import { DraftShape, pathFromShape } from '../../../../draft-canvas/tools/toolbox-shape';
import { scopeOnly } from '../../../../draft-canvas/tools/panel-scope';
import { ToolboxStore } from '../../../../draft-canvas/tools/toolbox-store';
import { Circle, Pt, Vect2D } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { RenderLayer, ViolinFamilyPanelId, ViolinFamilyParams, ViolinFamilyToggleKey } from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import { StringSetupSolve } from '../../violin-family-solves';
import { familyStandards, FamilyStandards } from '../../violin-family-seed';
import { calcSideViewOffsetX } from '../long-arching-panel/long-arching-panel';
import { neckHalfWidthAt } from '../neck-panel/neck-panel';
import {
  calcAlongBoard, defineFingerboardInPlan, fingerboardRadiusAt, renderFretTicks, renderStringSetupViews, calcSemitoneStop, solveStringSetup,
} from '../string-setup-panel/string-setup-panel';

// a dot inlaid `offset` across the board, or a fret line across the whole of it, `diameter` then
// its width and the offset unread
export interface PositionMarker {
  semitone: number;
  diameter: number;
  offset: number;
  shape: 'circle' | 'line';
}

// a fret line at a mark's station, edge to edge: in plan, on the board's face, and how wide it is
export interface PositionLine {
  plan: [Pt, Pt];
  face: [Pt, Pt];
  width: number;
  marker: number;
}

// one position mark: how far down the string it sounds, its station on the fingerboard plane in the
// side elevation, and its dots in plan (x across the board, y along it), one per marker at that
// semitone; `faceDots` are the same dots on the board's face, at their true distance from the nut;
// `markers` holds each dot's index in the marker list; `lines` are the fret lines there
export interface PositionMarkSolve {
  semitone: number;
  alongString: number;
  station: Pt;
  dots: Circle[];
  faceDots: Circle[];
  markers: number[];
  lines: PositionLine[];
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

// what a layer drawn on the board's face is to be cut as: `follow` runs the cutter down every line,
// a channel `width` wide; `pocket` clears the inside of every closed shape, one inside another
// left standing; `outline` cuts round every closed shape. `depth` is under the board's surface
export type FaceCutKind = 'follow' | 'pocket' | 'outline';

export interface FaceCut {
  kind: FaceCutKind;
  depth: number;
  width: number;
}

// the id a canvas layer's face carries to say its shapes are drawn on the board's face, in the true
// view; the layer's own origin is the face's as of its shapes, which the exporter subtracts
export const FINGERBOARD_FACE = 'fingerboard';
const PANEL_ID: ViolinFamilyPanelId = 'devFingerboard';
export const DEFAULT_FACE_CUT: FaceCut = { kind: 'follow', depth: 1.5, width: 1.5 };

const STATE_KEY = 'violinFamilyDevFingerboard';
const CUTS_KEY = 'violinFamilyDevFingerboardCuts';
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
  // each face layer's cut, by layer id; a layer deleted on the canvas leaves its entry unread
  cuts!: Record<string, FaceCut>;
  protected readonly toolbox = inject(ToolboxStore);

  override ngOnInit(): void {
    this.markers = readMarkers() ?? defaultPositionMarks(this.params);
    this.cuts = readFaceCuts();
    super.ngOnInit();
  }

  get faceLayers(): Layer[] {
    return this.toolbox.layers.filter(layer => layer.face?.id === FINGERBOARD_FACE);
  }

  // a layer the canvas added to since the cuts were last read takes the default
  cutFor(layer: Layer): FaceCut {
    return this.cuts[layer.id] ??= { ...DEFAULT_FACE_CUT };
  }

  get faceOrigin(): Pt | null {
    return calcFingerboardFaceOrigin(this.params, this.s);
  }

  // the new layer is the one drawn on next, and shows on this panel alone
  addFaceLayer(): void {
    let origin = this.faceOrigin;
    if (!origin) return;
    let id = this.toolbox.addLayer({
      name: `Fingerboard inlay ${this.faceLayers.length + 1}`, scope: scopeOnly(PANEL_ID), face: { id: FINGERBOARD_FACE, origin: { x: origin.x, y: origin.y } },
    });
    this.cuts[id] = { ...DEFAULT_FACE_CUT };
    this.cutsEdited();
  }

  cutsEdited(): void {
    writeWorkingState(CUTS_KEY, JSON.stringify(this.cuts));
  }

  // the true view moves on the canvas with the neck, the bridge and the body, and what is drawn on
  // the face goes with it. After the draw, clear of the change detection pass a first draw runs in
  override drawCanvas(): void {
    super.drawCanvas();
    queueMicrotask(() => {
      let origin = this.s && this.faceOrigin;
      if (origin) this.toolbox.moveFace(FINGERBOARD_FACE, origin);
    });
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
    let front: RenderLayer[] = [], side: RenderLayer[] = [], face: RenderLayer[] = [];
    let highlighted = this.highlightedPart;
    let halo = highlighted?.key === 'marks' ? { marker: this.focusedMarker, color: highlighted.color } : null;
    if (this.flags.showFingerboard) {
      let board = defineFingerboardFace(p, s);
      if (board) face.push(renderPath(board, this.pal.ink(0), STROKE_WEIGHT.section));
      front.push(renderPositionMarks(defineFingerboardInPlan(p, s), m, false, this.pal, halo));
      face.push(renderPositionMarks(board, m, true, this.pal, halo));
      if (this.flags.showScoopGuide) {
        front.push(renderScoopStation(p, s, k, false, this.pal));
        face.push(renderScoopStation(p, s, k, true, this.pal));
        side.push(renderScoopGuide(p, s, k, this.pal));
      }
    }
    if (this.flags.showFretMarks) side.push(renderFretTicks(s, this.markers.map(marker => marker.semitone), this.pal));
    if (highlighted && highlighted.key !== 'marks') side.push(renderScoopHighlight(p, s, k, highlighted.key, highlighted.color));
    side.push(renderSolveFailures([...k.failures, ...m.failures], this.pal.alert));
    let views = renderStringSetupViews(p, s, this.pal, { fingerboard: this.flags.showFingerboard, front, side });
    let origin = calcFingerboardFaceOrigin(p, s);
    if (origin) views.push(renderTranslatedLayers(face, origin.x, origin.y));
    return views;
  }
}

// one layer drawn on the board's face, ready to cut: its lines in the face's own frame, each shape
// less the origin the layer holds for it, and the cut the panel set for it
export interface FaceJob {
  layerId: string;
  name: string;
  cut: FaceCut;
  lines: string[];
}

// every layer bound to the board's face as a job, in layer order. Marks and measurements on a
// layer draw no line and are left out
export function buildFaceJobs(layers: Layer[], shapes: DraftShape[], cuts: Record<string, FaceCut>): FaceJob[] {
  return layers.filter(layer => layer.face?.id === FINGERBOARD_FACE).map(layer => {
    let { x, y } = layer.face!.origin;
    let lines = shapes.filter(shape => (shape.layerId ?? DEFAULT_LAYER_ID) === layer.id).map(pathFromShape).filter((d): d is string => !!d);
    return { layerId: layer.id, name: layer.name, cut: cuts[layer.id] ?? DEFAULT_FACE_CUT, lines: lines.map(d => translatePath(d, -x, -y)) };
  });
}

// the tab's own cuts for the layers drawn on the board's face, by layer id; none before any is set
export function readFaceCuts(): Record<string, FaceCut> {
  try {
    let parsed = JSON.parse(readWorkingState(CUTS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// the tab's own markers, as the panel last left them; null before it has
export function readMarkers(): PositionMarker[] | null {
  try {
    let parsed = JSON.parse(readWorkingState(STATE_KEY) ?? 'null');
    return Array.isArray(parsed) && parsed.every(m => m && typeof m === 'object' && 'semitone' in m) ? parsed : null;
  } catch {
    return null;
  }
}

const MARK_HALO_RADIUS = 3;

// the dots and fret lines over `board`, the front view's or the face's, each the part of it that
// lands on the board
const renderPositionMarks = (
  board: string | null, m: PositionMarksSolve, onFace: boolean, pal: PanelPalette, halo: { marker: number; color: string } | null,
): RenderLayer => {
  let dots = board ? m.marks.flatMap(mark => (onFace ? mark.faceDots : mark.dots).map((dot, i) => ({ dot, marker: mark.markers[i], inlay: intersectionFromTwoPaths(pathFromCircle(dot), board!) }))) : [];
  let lines = board ? m.marks.flatMap(mark => mark.lines.map(line => {
    let [a, b] = onFace ? line.face : line.plan;
    let band = pathFromPolygon([new Pt(a.x, a.y - line.width / 2), new Pt(b.x, b.y - line.width / 2), new Pt(b.x, b.y + line.width / 2), new Pt(a.x, a.y + line.width / 2)]);
    return { a, b, marker: line.marker, inlay: intersectionFromTwoPaths(band, board!) };
  })) : [];
  return (g: any, ui: any): void => {
    for (let { dot, marker, inlay } of dots) {
      renderFilledPath(inlay, pal.ink(3), 1, 'nonzero')(g, ui);
      if (halo?.marker === marker) renderPointHalo(dot, halo.color, dot.r + MARK_HALO_RADIUS)(g, ui);
    }
    for (let { a, b, marker, inlay } of lines) {
      renderFilledPath(inlay, pal.ink(3), 1, 'nonzero')(g, ui);
      if (halo?.marker === marker) renderSegmentHalo(a, b, halo.color)(g, ui);
    }
  };
};

// each interval stops the string a share of its length down from the nut; that point drops square
// onto the fingerboard plane for its station, and every marker at that interval sits across the board
// there, its offset scaled by the board's width; a line marker runs across the board from edge to
// edge there. A mark past the board's end is left out and said so, the rest drawn
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
      if (!(marker.diameter > 0)) return fail(`${name}: the ${marker.shape === 'line' ? 'width' : 'diameter'} needs a value above 0.`, ['marks']);
      if (marker.shape === 'line') continue;
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
      let mark: PositionMarkSolve = { semitone, alongString, station, dots: [], faceDots: [], markers: [], lines: [] };
      for (let [i, marker] of markers.entries()) {
        if (marker.semitone !== semitone) continue;
        if (marker.shape === 'line') {
          mark.lines.push({
            plan: [new Pt(-half, station.y), new Pt(half, station.y)], face: [new Pt(-half, -alongBoard), new Pt(half, -alongBoard)], width: marker.diameter, marker: i,
          });
          continue;
        }
        let reach = Math.abs(marker.offset);
        let x = Math.sign(marker.offset) * (Math.min(reach, halfAtNut) * half / halfAtNut + Math.max(0, reach - halfAtNut));
        mark.dots.push(new Circle(x, station.y, marker.diameter / 2));
        mark.faceDots.push(new Circle(x, -alongBoard, marker.diameter / 2));
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

// the board seen square to its plane, in its own frame: x across it with the bass negative, y along
// it from the nut's middle at 0 down to the end at minus its length. Lengths along it are true, where
// the front view shortens them by the neck's tilt. Null while the board doesn't solve
export function defineFingerboardFace(p: ViolinFamilyParams, s: StringSetupSolve): string | null {
  let neckTop = s.neck.neckTop, end = s.fingerboardEnd;
  if (!neckTop || !end) return null;
  let topHalf = p.neck!.topWidth / 2, endHalf = neckHalfWidthAt(p, s.neck, end.y), length = dist(neckTop, end);
  return pathFromPolygon([new Pt(-endHalf, -length), new Pt(endHalf, -length), new Pt(topHalf, 0), new Pt(-topHalf, 0)]);
}

// where the face's origin sits on the canvas: level with the nut, right of the side elevation and
// clear of whatever stands furthest off the body there. A point drawn at `at` on the canvas is at
// (at.x - origin.x, at.y - origin.y) on the face
export function calcFingerboardFaceOrigin(p: ViolinFamilyParams, s: StringSetupSolve): Pt | null {
  let neckTop = s.neck.neckTop, end = s.fingerboardEnd;
  if (!neckTop || !end) return null;
  let reach = Math.max(neckTop.x, s.nutTop?.x ?? neckTop.x, s.bridgeTop?.x ?? neckTop.x);
  return new Pt(calcSideViewOffsetX(p) + reach + 0.12 * p.body.height + neckHalfWidthAt(p, s.neck, end.y), neckTop.y);
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

// the deepest station across the board, in the front view or on the face
const renderScoopStation = (p: ViolinFamilyParams, s: StringSetupSolve, k: ScoopSolve, onFace: boolean, pal: PanelPalette) => (g: any, ui: any): void => {
  if (!calcScoopGuideGeometry(p, s, k)) return;
  let scoopAt = p.stringSetup!.scoopAt;
  let inPlan = pointAtDistanceToward(s.neck.neckTop!, s.fingerboardEnd!, scoopAt).y;
  let half = neckHalfWidthAt(p, s.neck, inPlan);
  let y = onFace ? -scoopAt : inPlan;
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

// the board's top over its gluing face, at x across the face and `along` it from the nut: the
// edge's thickness less the scoop there, and the crown at that station's radius standing on the
// chord between the two edges. Past either edge it holds the edge's height and past either end
// that end's section, so a cutter's footprint finds level land beside the board and the crown
// carried on beyond it. Read only once solveScoop has no failures
export function fingerboardSurfaceZAt(p: ViolinFamilyParams, s: StringSetupSolve, x: number, along: number): number {
  let neckTop = s.neck.neckTop!, end = s.fingerboardEnd!;
  let y = pointAtDistanceToward(neckTop, end, Math.min(dist(neckTop, end), Math.max(0, along))).y;
  let half = neckHalfWidthAt(p, s.neck, y), r = fingerboardRadiusAt(p, s, y);
  let at = Math.max(-half, Math.min(half, x));
  return p.stringSetup!.fingerboardThickness - fingerboardScoopAt(p, s, y, at / half) + Math.sqrt(r * r - at * at) - Math.sqrt(r * r - half * half);
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

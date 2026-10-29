import { Component, EventEmitter, inject, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { pointInPolygon } from '../../../../helpers/math/simpleGeometry';
import { filletRightAngleCorner } from '../../../../helpers/math/draftMath';
import { pathFromPolyline, pathFromRect, samplePathToPolyline, translatePath } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, closestPointToPolylineIndexed, distPointToPolylineIndexed, minCostAssignment, radialBlend, RadialSource } from '../../../../helpers/math/vibeMath';
import { differenceFromManyPaths, fieldBands, intersectionFromTwoPaths, mirroredLoop } from '../../../../helpers/math/pathVibes';
import { renderCircle, renderFilledPath, renderPath, renderPointHalo, renderSolveFailures, renderText } from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection, SolveFailure } from '../../../../helpers/validators';
import { stepAmountForKey } from '../../../../helpers/stepSize';
import { readWorkingState, writeWorkingState } from '../../../../helpers/workingStorage';
import { DraftTool, DraftToolHost } from '../../../../draft-canvas/tools/draft-tool';
import { ToolRegistryService } from '../../../../draft-canvas/tools/tool-registry';
import { IconDirective } from '../../../../icons/icon.directive';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { contrastRatio, PanelPalette, parseHex, ThemeService, toHex } from '../../../../theme/theme.service';
import { Circle, Pt, Rectangle } from '../../../../models/types';
import { PlateSurface, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { familyStandards } from '../../violin-family-seed';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { PLATE_LAYOUT_GAP, purflingPath, ribArcs, RibArcs, solveOuterContour } from '../outer-contour-panel/outer-contour-panel';
import { renderFholePlate } from '../fhole-placement-panel/fhole-placement-panel';
import { fholePath, solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import { channelLoop } from '../fluting-panel/fluting-panel';
import { bodyLandmarks, loopHalfChordAtY, solveCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { MouldPanel, solveMould } from '../mould-panel/mould-panel';

// Graduation, tried out on localhost only and carried without promise of support. For now it maps
// the ground: the plates each with the rib line inside their edge, the top with both holes, the back
// to its left with the button, as the outer contour lays them out, and inside the rib line the neck
// and end blocks and the two loops the solve makes, the linings' inner face and the boundary the
// graduation starts at. Its settings are kept off the file until the stage is official: they live
// in the tab's working state, and their shapes and solve live here. Panel and render, then the solve.

// where the plates can be graduated. `lining` and `edgeInset` are read in from the rib line (the
// ribs' inner face): the lining is the strip glued inside the ribs, so the glue platform ends that
// far in, and the edge inset is where the gouge may start. `blockMargin` is read from the neck and
// end blocks' inner faces as the mould sizes them: positive, the gouge stops that far short of a
// block; negative, the block is trimmed back by that much, as blocks are once off the mould, and
// the gouge runs up to the trimmed face. The wood at the boundary, read off the arching over the
// flat inside, holds `edgeReach` in from it.
// These four are the glue platform, shared by both plates. The f-holes are the top's own: a
// margin left at one thickness round each hole, `fHoleThickness` held out to `fHoleReach` from
// the hole's outline, as the boundary's thickness is held in from it; no reach, no margin.
// Inside the boundary each plate's thickness is set at points, each plate laid out on its own
export interface GraduationSettings {
  lining: number;
  edgeInset: number;
  blockMargin: number;
  edgeReach: number;
  fHoleThickness: number;
  fHoleReach: number;
  plates: Record<GraduationPlate, PlateGraduation>;
}

// one plate's points. A layout only lays the first ones: the zones a luthier graduates by, a grid
// `spacing` mm apart, or nothing. From then on every point is the user's to move, change or
// remove, and more can be added. Every laid point starts at the plate's edge thickness, holding it
// out to its `reach`. No mirroring: a plate's two halves are read apart
export interface PlateGraduation {
  style: GraduationStyle;
  spacing: number;
  points: GraduationPoint[];
}

export type GraduationStyle = 'zones' | 'grid' | 'blank';
export const GRADUATION_PLATES = ['top', 'back'] as const;
export type GraduationPlate = typeof GRADUATION_PLATES[number];

// one thickness reading, in the plate's own frame: x across from the joint, y up the body, and
// the radius it speaks for. A zone point keeps its name
export interface GraduationPoint {
  x: number;
  y: number;
  thickness: number;
  reach: number;
  label?: string;
}

const DEFAULT_REACH = 40;
// a wing's width, about: the margin a maker leaves at one thickness round a hole
const DEFAULT_FHOLE_REACH = 6;

export type GraduationKey = Exclude<keyof GraduationSettings, 'plates'>;
export type GraduationFailure = SolveFailure<GraduationKey>;

// the ground the plates are graduated on. The neck and end blocks sit inside the rib line, their
// inner faces flat and the corners of those faces rounded. The lining line is the glue platform's
// inner edge: a loop inside the rib line with the corners bypassed as the fluting channel does,
// stepping round the blocks. The boundary is the loop the gouge starts at, cut straight across at
// each block's inner face. Null when a loop can't be made; shared by both plates, the back's drawn
// beside the top
export interface GraduationSolve {
  blocks: { neck: string; end: string } | null;
  lining: string | null;
  boundary: string | null;
  // the boundary as a polyline with its extent, what the layouts, the field and the map all read
  ground: Ground | null;
  // where the edge thickness gives way, the boundary's loop run in by the edge reach
  edgeReach: string | null;
  // the top's holes as polylines, treble then bass, and where the f-hole thickness gives way, a
  // loop round each hole at the f-hole reach; empty until the contours close
  holes: Pt[][];
  fHoleReach: Pt[][];
  failures: GraduationFailure[];
}

export interface Ground { loop: Pt[]; minX: number; maxX: number; minY: number; maxY: number }

const STATE_KEY = 'violinFamilyDevGraduation';

// the linings by size class, the gouge held off them by two rib thicknesses, and a coarse grid on
// each plate
export function defaultGraduation(p: ViolinFamilyParams): GraduationSettings {
  let lining = familyStandards(p.body.height).lining;
  let layout = (): PlateGraduation => ({ style: 'grid', spacing: DEFAULT_REACH, points: [] });
  let s: GraduationSettings = {
    lining, edgeInset: lining + 2 * p.body.rib, blockMargin: 0, edgeReach: DEFAULT_REACH / 2,
    fHoleThickness: edgeThicknessOf(p, 'top'), fHoleReach: DEFAULT_FHOLE_REACH,
    plates: { top: layout(), back: layout() },
  };
  for (let plate of GRADUATION_PLATES) s.plates[plate].points = layoutPoints(p, s, plate);
  return s;
}

// the plate's edge thickness, as drafted or as the size class has it
export function edgeThicknessOf(p: ViolinFamilyParams, plate: GraduationPlate): number {
  return p.arching?.[plate].thickness ?? familyStandards(p.body.height).edgeThickness;
}

// the points a layout starts with: the zones, the grid, or nothing
export function layoutPoints(p: ViolinFamilyParams, s: GraduationSettings, plate: GraduationPlate): GraduationPoint[] {
  let style = s.plates[plate].style;
  return style === 'zones' ? zonePoints(p, s, plate) : style === 'grid' ? gridPoints(p, s, plate) : [];
}

// the zones a luthier graduates by, as the fewest points that draw them: an island on the joint
// midway between the corner rows, with a point above and below it on those rows, where it gives
// way to the bouts; for each main bout a dome on the joint at its widest row, a channel zone each side
// along the edge on that row, and a flank each side on the row between the corners and the widest,
// the four flanks fanning out from the island as an X. Each is placed and sized off the boundary's
// half chord at its row, so the zones scale with the outline. Read from the lower bout up
export function zonePoints(p: ViolinFamilyParams, s: GraduationSettings, plate: GraduationPlate): GraduationPoint[] {
  let ground = solveGraduation(p, s)?.ground;
  let marks = new Map(bodyLandmarks(p).map(k => [k.code, k.y]));
  let rows = (['LB', 'LC', 'C', 'UC', 'UB'] as const).map(code => marks.get(code));
  if (!ground || rows.some(y => y === undefined)) return [];
  let [LB, LC, C, UC, UB] = rows as number[];
  let thickness = edgeThicknessOf(p, plate);
  let half = (y: number): number => loopHalfChordAtY(ground.loop, y) ?? 0;
  let at = (x: number, y: number, reach: number, label: string): GraduationPoint => ({ x: round(x), y: round(y), thickness, reach: round(reach), label });
  let pair = (x: number, y: number, reach: number, label: string): GraduationPoint[] => [at(-x, y, reach, `${label} bass`), at(x, y, reach, `${label} treble`)];
  let points: GraduationPoint[] = [];
  for (let [name, bout, corner] of [['Lower', LB, LC], ['Upper', UB, UC]] as const) {
    let h = half(bout);
    let flankY = (bout + corner) / 2, hf = half(flankY);
    points.push(
      ...pair(ZONE.channel.x * h, bout, ZONE.channel.reach * h, `${name} channel`),
      at(0, bout, ZONE.dome * h, `${name} dome`),
      ...pair(ZONE.flank.x * hf, flankY, ZONE.flank.reach * hf, `${name} flank`),
    );
  }
  // the island's middle sits midway between the corner rows, not on the waist, which can lie off
  // it; its ends reach back to the middle at least, so the three make one island
  let islandReach = Math.min(ZONE.island.across * half(C), ZONE.island.along * (UC - LC));
  let islandY = (LC + UC) / 2;
  points.push(
    at(0, LC, Math.max(islandReach, islandY - LC), 'Island lower'),
    at(0, islandY, islandReach, 'Island'),
    at(0, UC, Math.max(islandReach, UC - islandY), 'Island upper'),
  );
  return points
    .filter(pt => pointInPolygon(new Pt(pt.x, pt.y), ground.loop))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

// where each zone sits and how far it reaches, as shares of the half chord at its row (the island
// along the body as a share of the corners' span)
const ZONE = {
  dome: 0.45,
  channel: { x: 0.82, reach: 0.22 },
  flank: { x: 0.55, reach: 0.4 },
  island: { across: 0.5, along: 0.4 },
};

// a lattice `spacing` apart, one column on the joint and the rows centred on the boundary, kept to
// the points inside it, read top to bottom and bass to treble. Empty until the boundary solves
export function gridPoints(p: ViolinFamilyParams, s: GraduationSettings, plate: GraduationPlate): GraduationPoint[] {
  let ground = solveGraduation(p, s)?.ground;
  let { spacing } = s.plates[plate];
  if (!ground || !(spacing > 0)) return [];
  let { loop, minX, maxX, minY, maxY } = ground;
  let cy = (minY + maxY) / 2;
  let thickness = edgeThicknessOf(p, plate);
  let points: GraduationPoint[] = [];
  for (let j = Math.floor((maxY - cy) / spacing); j >= Math.ceil((minY - cy) / spacing); j--) {
    let y = cy + j * spacing;
    for (let i = Math.ceil(minX / spacing); i <= Math.floor(maxX / spacing); i++) {
      let x = i * spacing;
      if (pointInPolygon(new Pt(x, y), loop)) points.push({ x: round(x), y: round(y), thickness, reach: spacing });
    }
  }
  return points;
}

// the sidebar's plate map: the points by index, set out as the plate lays them. A grid's own
// lattice is the map, its stations top to bottom and its columns bass to treble, a gap where the
// boundary cuts it, and it holds while the points stay near that lattice. Zones and loose points
// sit off any lattice, so the map lays one over the plate, a column on the joint, and each point
// takes a cell near it, the cells dealt out together so the points travel least in all; where
// points bunch some are pushed a cell aside. `lattice` gives a cell's centre: `left + column * dx`
// across, `top - row * dy` up
export interface PlateMapRow {
  label: string;
  cells: (number | null)[];
}

export interface PlateMap {
  columns: number;
  labelled: boolean;
  rows: PlateMapRow[];
  lattice?: { left: number; top: number; dx: number; dy: number };
}

// a chip is wider than it is tall, so rows are set closer than columns to keep the plate's shape
const CHIP_ASPECT = 0.7;
// cells to each point, room where points bunch; and the columns the sidebar holds
const CELLS_PER_POINT = 2.5;
const MIN_COLUMNS = 7, MAX_COLUMNS = 11;
// how many empty lattice cells per point a grid may carry before it is dealt out instead
const LATTICE_SLACK = 2;

export function plateMap(g: PlateGraduation, extent: { minX: number; maxX: number; minY: number; maxY: number } | null = null): PlateMap {
  let pts = g.points;
  // points still on a lattice, a grid as laid or nearly so, are set out as they lie
  let xs = [...new Set(pts.map(pt => pt.x))].sort((a, b) => a - b);
  let ys = [...new Set(pts.map(pt => pt.y))].sort((a, b) => b - a);
  if (pts.length && xs.length <= MAX_COLUMNS && xs.length * ys.length <= LATTICE_SLACK * pts.length) {
    let rows = ys.map(y => {
      let cells: (number | null)[] = xs.map(() => null);
      pts.forEach((pt, i) => { if (pt.y === y) cells[xs.indexOf(pt.x)] = i; });
      return { label: `${Math.round(y)}`, cells };
    });
    return { columns: xs.length, labelled: true, rows };
  }
  if (!pts.length) return { columns: 0, labelled: false, rows: [] };

  let half = Math.max(extent ? Math.max(-extent.minX, extent.maxX) : 0, ...pts.map(pt => Math.abs(pt.x)));
  let top = Math.max(extent?.maxY ?? -Infinity, ...pts.map(pt => pt.y));
  let bottom = Math.min(extent?.minY ?? Infinity, ...pts.map(pt => pt.y));
  let want = Math.ceil(CELLS_PER_POINT * pts.length);
  let columns = MIN_COLUMNS, dx = 1, dy = 1, rowCount = 1;
  for (; columns <= MAX_COLUMNS; columns += 2) {
    dx = half > 0 ? (2 * half) / (columns - 1) : 1;
    dy = dx * CHIP_ASPECT;
    rowCount = Math.floor((top - bottom) / dy) + 1;
    if (columns * rowCount >= want) break;
  }
  // too many points for the sidebar's width: the rows close up instead, the map running taller
  if (columns > MAX_COLUMNS) {
    columns = MAX_COLUMNS;
    rowCount = Math.ceil(want / columns);
    dx = half > 0 ? (2 * half) / (columns - 1) : 1;
    dy = rowCount > 1 ? (top - bottom) / (rowCount - 1) : 1;
  }
  let left = -dx * (columns - 1) / 2;
  let cost = pts.map(pt => Array.from({ length: columns * rowCount }, (_, k) => {
    let cx = left + (k % columns) * dx, cy = top - Math.floor(k / columns) * dy;
    return ((pt.x - cx) / dx) ** 2 + ((pt.y - cy) / dy) ** 2;
  }));
  let grid: (number | null)[][] = Array.from({ length: rowCount }, () => Array(columns).fill(null));
  minCostAssignment(cost).forEach((k, i) => grid[Math.floor(k / columns)][k % columns] = i);
  // the rows past the first and last point are dropped; the ones between keep the plate's shape
  let first = grid.findIndex(row => row.some(i => i !== null));
  let last = grid.length - 1 - [...grid].reverse().findIndex(row => row.some(i => i !== null));
  return {
    columns, labelled: false,
    rows: grid.slice(first, last + 1).map(cells => ({ label: '', cells })),
    lattice: { left, top: top - first * dy, dx, dy },
  };
}

const round = (v: number): number => Math.round(v * 10) / 10;

// a plate's thickness anywhere: inside the boundary the blend of its points, each holding its
// thickness out to its reach, with the boundary itself a source holding `edgeReach` in, and on
// the top each hole's outline a source at the f-hole thickness holding `fHoleReach` out; in a
// hole the f-hole thickness, what its wings carry. The land outside the boundary is flat inside,
// so its thickness is whatever the outer surface stands at over it: the edge thickness where the
// edge is, less wherever the fluting channel dips, more where the arch has risen. The boundary
// reads that same way, so where the gouge takes off it is the wood that is really there, not the
// edge thickness; `edgeAt` is that reading at the boundary's nearest point. `blend` is the
// sources' blend alone, defined everywhere, for tracing
export interface ThicknessField {
  at(x: number, y: number): number;
  blend(x: number, y: number): number;
  edgeAt(x: number, y: number): number;
  edge: number;
  range: { lo: number; hi: number };
  loop: Pt[];
}

const fieldCache: Partial<Record<GraduationPlate, { key: string; field: ThicknessField }>> = {};
// the surface read at every vertex of the boundary is the slow part (a row solve per vertex), and
// no point edit moves it: kept by the loop and surface the solves hand back, which hold between edits
const alongCache: Partial<Record<GraduationPlate, { loop: Pt[]; surface: PlateSurface | null; edge: number; along: number[] }>> = {};

export function thicknessField(p: ViolinFamilyParams, s: GraduationSettings, plate: GraduationPlate): ThicknessField | null {
  let solve = solveGraduation(p, s);
  if (!solve?.ground) return null;
  let edge = edgeThicknessOf(p, plate);
  let surface = solveCrossArching(p)?.[plate] ?? null;
  let points = s.plates[plate].points.filter(pt => Number.isFinite(pt.thickness) && pt.reach > 0);
  let holes = plate === 'top' && Number.isFinite(s.fHoleThickness) && s.fHoleReach > 0 ? solve.holes : [];
  let key = JSON.stringify([solve.boundary, s.edgeReach, edge, p.fluting, p.arching?.[plate], holes, s.fHoleThickness, s.fHoleReach, points.map(pt => [pt.x, pt.y, pt.thickness, pt.reach])]);
  let hit = fieldCache[plate];
  if (hit?.key === key) return hit.field;
  let { loop } = solve.ground;
  let idx = buildPolylineIndex(loop);
  let holeIdx = holes.map(hole => buildPolylineIndex(hole));
  // the thickness over the flat: the surface's height off the edge, plus the edge. Off the plate,
  // or with no surface solved, the edge thickness stands
  let landAt = (x: number, y: number): number => edge + ((surface && surfaceZAt(surface, x, y)) ?? 0);
  // read once at every vertex of the boundary, and along it by the nearest segment
  let kept = alongCache[plate];
  let along = kept && kept.loop === loop && kept.surface === surface && kept.edge === edge ? kept.along : loop.map(q => landAt(q.x, q.y));
  alongCache[plate] = { loop, surface, edge, along };
  let edgeAt = (x: number, y: number): number => {
    let { point, index } = closestPointToPolylineIndexed(new Pt(x, y), idx);
    let a = loop[index], b = loop[(index + 1) % loop.length];
    let len = Math.hypot(b.x - a.x, b.y - a.y);
    let t = len > 1e-9 ? Math.hypot(point.x - a.x, point.y - a.y) / len : 0;
    return along[index] + t * (along[(index + 1) % loop.length] - along[index]);
  };
  let sources: RadialSource[] = [
    { value: edgeAt, reach: Math.max(0, s.edgeReach), dist: (x, y) => distPointToPolylineIndexed(new Pt(x, y), idx) },
    ...holeIdx.map(hi => ({ value: s.fHoleThickness, reach: s.fHoleReach, dist: (x: number, y: number) => distPointToPolylineIndexed(new Pt(x, y), hi) })),
    ...points.map(pt => ({ value: pt.thickness, reach: pt.reach, dist: (x: number, y: number) => Math.hypot(x - pt.x, y - pt.y) })),
  ];
  let values = [...along, ...holeIdx.map(() => s.fHoleThickness), ...points.map(pt => pt.thickness)];
  let field: ThicknessField = {
    blend: (x, y) => radialBlend(sources, x, y),
    at: (x, y) => {
      let at = new Pt(x, y);
      if (holes.some(hole => pointInPolygon(at, hole))) return s.fHoleThickness;
      return pointInPolygon(at, loop) ? radialBlend(sources, x, y) : landAt(x, y);
    },
    edgeAt,
    edge,
    range: { lo: Math.min(...values), hi: Math.max(...values) },
    loop,
  };
  fieldCache[plate] = { key, field };
  return field;
}

// the thickness map: the ground at or above each `step` of thickness from the thinnest reading up,
// cut to the boundary with the holes left blank, so the bands stack from thin to thick as a contour
// map does. The field itself still answers in a hole; only the map leaves it out
export const MAP_STEP = 0.25;
const bandCache: Partial<Record<GraduationPlate, { field: ThicknessField; bands: { level: number; polygons: Pt[][][] }[] }>> = {};

export function thicknessBands(p: ViolinFamilyParams, s: GraduationSettings, plate: GraduationPlate): { level: number; polygons: Pt[][][] }[] {
  let field = thicknessField(p, s, plate);
  if (!field) return [];
  let hit = bandCache[plate];
  if (hit?.field === field) return hit.bands;
  let solve = solveGraduation(p, s)!;
  let box = solve.ground!;
  let gridMm = Math.max(1, (box.maxX - box.minX) / 80);
  let levels: number[] = [];
  for (let k = Math.floor(field.range.lo / MAP_STEP); k * MAP_STEP <= field.range.hi; k++) levels.push(k * MAP_STEP);
  let bands = fieldBands(field.blend, box, gridMm, levels, field.loop, plate === 'top' ? solve.holes : []);
  bandCache[plate] = { field, bands };
  return bands;
}

@Component({
  selector: 'app-vf-dev-graduation-panel',
  imports: [FormsModule, IconDirective, NumberStepperDirective],
  templateUrl: './dev-graduation-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class DevGraduationPanel implements ViolinFamilyPanel, OnInit, OnDestroy {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showGraduationPoints', 'showPointReaches', 'showEdgeReach'];
  protected readonly pal = ThemeService.getPalette('lamplight');
  private readonly tools = inject(ToolRegistryService);

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  readonly plates = GRADUATION_PLATES;
  settings!: GraduationSettings;
  g!: GraduationSolve;
  // the plate being worked, the other folded to its summary, and the points picked on it
  active: GraduationPlate = 'top';
  selected: number[] = [];
  maps!: Record<GraduationPlate, PlateMap>;
  // the thickness the ramp's two ends stand for, shared by both plates so a colour reads the same on each
  scale = { lo: 0, hi: 1 };
  // a map is dealt out again only when its points move, not on every thickness typed
  private mapCache: Partial<Record<GraduationPlate, { key: string; map: PlateMap }>> = {};
  // the canvas tool that takes the next click as a point, held while it is the active tool
  private pickTool: PickPointTool | null = null;
  // whether the held pick places a twin across the joint as well
  pickMirror = false;
  private unwatchTools = this.tools.onChange(() => {
    if (this.pickTool && this.tools.activeTool !== this.pickTool) this.pickTool = null;
  });

  get picking(): boolean {
    return this.pickTool !== null;
  }

  ngOnInit(): void {
    let read = readSettings();
    this.settings = read ? { ...defaultGraduation(this.params), ...read } : defaultGraduation(this.params);
    this.draw();
  }

  ngOnDestroy(): void {
    this.unwatchTools();
    if (this.pickTool) this.tools.selectTool(null);
  }

  // the next click on the canvas becomes a point, if it lands inside the plate's boundary, and
  // mirrored, its twin across the joint too; the click's reach is previewed under the pointer, and
  // Escape or the same button again calls it off
  pickByClick(mirror = false): void {
    if (this.pickTool) {
      this.tools.selectTool(null);
      if (this.pickMirror === mirror) return;
    }
    this.pickMirror = mirror;
    let plate = this.active;
    let valid = (pt: Pt): boolean => {
      let ground = this.g.ground;
      return !!ground && pointInPolygon(this.toPlate(pt, plate), ground.loop);
    };
    let joint = mirror ? PLATE_DX[plate](this.params) : null;
    this.pickTool = new PickPointTool(this.pal.ink(4), DEFAULT_REACH, joint, valid, pt => {
      let at = this.toPlate(pt, plate);
      let x = round(at.x), y = round(at.y), thickness = edgeThicknessOf(this.params, plate);
      // a click on the joint is its own twin
      let xs = mirror && x !== 0 ? [x, -x] : [x];
      for (let px of xs) this.points.push({ x: px, y, thickness, reach: DEFAULT_REACH });
      this.selected = xs.map((_, i) => this.points.length - xs.length + i);
      this.tools.selectTool(null);
      this.stateEdited();
    }, () => this.tools.selectTool(null));
    this.tools.selectTool(this.pickTool);
  }

  // a canvas point in the plate's own frame, the back drawn beside the top
  private toPlate(pt: Pt, plate: GraduationPlate): Pt {
    return new Pt(pt.x - PLATE_DX[plate](this.params), pt.y);
  }

  // the panel's own settings, kept for the tab alone: nothing here goes into the file or the undo history
  stateEdited(): void {
    writeWorkingState(STATE_KEY, JSON.stringify(this.settings));
    this.draw();
  }

  // a new layout, or a new spacing, lays that plate's points out afresh and leaves the other's alone
  relayout(plate: GraduationPlate): void {
    this.settings.plates[plate].points = layoutPoints(this.params, this.settings, plate);
    if (plate === this.active) this.selected = [];
    this.stateEdited();
  }

  activate(plate: GraduationPlate): void {
    if (plate === this.active) return;
    this.active = plate;
    this.selected = [];
    this.draw();
  }

  // an added point starts on the joint at the boundary's middle, at the edge thickness
  addPoint(): void {
    let ground = this.g.ground;
    let y = ground ? round((ground.minY + ground.maxY) / 2) : 0;
    this.points.push({ x: 0, y, thickness: edgeThicknessOf(this.params, this.active), reach: DEFAULT_REACH });
    this.selected = [this.points.length - 1];
    this.stateEdited();
  }

  removeSelected(): void {
    let plate = this.settings.plates[this.active];
    plate.points = plate.points.filter((_, i) => !this.selected.includes(i));
    this.selected = [];
    this.stateEdited();
  }

  // a click picks one point, a shift-click adds it to the pick or takes it back out
  select(i: number, e: MouseEvent): void {
    // so the arrows step the pick straight away, in browsers that don't focus a clicked button
    (e.currentTarget as HTMLElement | null)?.focus?.();
    if (!e.shiftKey) this.selected = [i];
    else this.selected = this.selected.includes(i) ? this.selected.filter(j => j !== i) : [...this.selected, i];
    this.draw();
  }

  // a row's label picks the whole station or ring
  selectRow(row: PlateMapRow, e: MouseEvent): void {
    let picked = row.cells.filter((i): i is number => i !== null);
    this.selected = e.shiftKey ? [...new Set([...this.selected, ...picked])] : picked;
    this.draw();
  }

  pickAll(): void {
    this.selected = this.points.map((_, i) => i);
    this.draw();
  }

  private mapOf(plate: GraduationPlate): PlateMap {
    let g = this.settings.plates[plate];
    let key = JSON.stringify([g.style, g.points.map(pt => [pt.x, pt.y])]);
    let hit = this.mapCache[plate];
    if (hit?.key === key) return hit.map;
    let map = plateMap(g, solveGraduation(this.params, this.settings)?.ground ?? null);
    this.mapCache[plate] = { key, map };
    return map;
  }

  get points(): GraduationPoint[] {
    return this.settings.plates[this.active].points;
  }

  get picked(): GraduationPoint[] {
    return this.selected.map(i => this.points[i]).filter(pt => !!pt);
  }

  // the picked points' common value, or null where they differ
  shared(key: 'thickness' | 'reach'): number | null {
    let values = this.picked.map(pt => pt[key]);
    return values.length && values.every(v => v === values[0]) ? values[0] : null;
  }

  setAll(key: 'thickness' | 'reach', value: number | null): void {
    if (value === null || !Number.isFinite(value)) return;
    for (let pt of this.picked) pt[key] = value;
    this.stateEdited();
  }

  // every picked point moved by the same amount, so a mixed pick keeps its differences
  nudge(key: 'thickness' | 'reach', delta: number, e?: Event): void {
    e?.preventDefault();
    if (!this.picked.length) return;
    // a reach stepped to nothing would drop the point from the field, so it stops at a millimetre
    let floor = key === 'reach' ? 1 : 0;
    for (let pt of this.picked) pt[key] = Math.max(floor, Math.round((pt[key] + delta) * 100) / 100);
    this.stateEdited();
  }

  move(dx: number, dy: number, e?: Event): void {
    e?.preventDefault();
    if (!this.picked.length) return;
    for (let pt of this.picked) {
      pt.x = Math.round((pt.x + dx) * 100) / 100;
      pt.y = Math.round((pt.y + dy) * 100) / 100;
    }
    this.stateEdited();
  }

  // the arrows move the pick on the plate, = and - step its thickness, ] and [ its reach
  mapKey(e: KeyboardEvent): void {
    let step = stepAmountForKey(e);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') this.move(0, e.key === 'ArrowUp' ? step : -step, e);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') this.move(e.key === 'ArrowRight' ? step : -step, 0, e);
    else if (e.key === '=' || e.key === '+') this.nudge('thickness', 0.1, e);
    else if (e.key === '-' || e.key === '_') this.nudge('thickness', -0.1, e);
    else if (e.key === ']') this.nudge('reach', 1, e);
    else if (e.key === '[') this.nudge('reach', -1, e);
    else if (e.key === 'Escape' && this.selected.length) {
      e.preventDefault();
      this.selected = [];
      this.draw();
    }
  }

  // what the pick holds: one point by number and place, several by count and spread
  pickNote(): string {
    let picked = this.picked;
    if (picked.length === 1) return `${picked[0].label ?? `Point ${this.selected[0] + 1}`} · x ${picked[0].x}, y ${picked[0].y} mm`;
    let t = picked.map(pt => pt.thickness);
    return `${picked.length} points · ${spread(t)} mm`;
  }

  // a folded plate's one line: its layout, how many points, and their spread
  summary(plate: GraduationPlate): string {
    let g = this.settings.plates[plate];
    if (!g.points.length) return `${STYLE_NAMES[g.style]} · no points`;
    return `${STYLE_NAMES[g.style]} · ${g.points.length} pts · ${spread(g.points.map(pt => pt.thickness))} mm`;
  }

  fill(thickness: number): string {
    return rampFill(this.pal, this.scale, thickness);
  }

  // a chip's number in whichever end of the ramp stands off its fill the more
  fillText(thickness: number): string {
    let fill = parseHex(this.fill(thickness));
    let [thin, thick] = [this.pal.ink(RAMP[0]), this.pal.ink(RAMP[RAMP.length - 1])];
    return contrastRatio(fill, parseHex(thin)) > contrastRatio(fill, parseHex(thick)) ? thin : thick;
  }

  get rampGradient(): string {
    return `linear-gradient(90deg, ${RAMP.map(i => this.pal.ink(i)).join(', ')})`;
  }

  report(): void {
    reportFailures(this.g.failures, 'Graduation');
  }

  draw(): void {
    let s = this.settings;
    this.maps = { top: this.mapOf('top'), back: this.mapOf('back') };
    let all = GRADUATION_PLATES.flatMap(plate => s.plates[plate].points.map(pt => pt.thickness)).filter(Number.isFinite);
    if (s.fHoleReach > 0 && Number.isFinite(s.fHoleThickness)) all.push(s.fHoleThickness);
    // the boundary reads what the arching left over the flat, which can sit under every point
    for (let plate of GRADUATION_PLATES) {
      let field = thicknessField(this.params, s, plate);
      if (field) all.push(field.range.lo, field.range.hi);
    }
    let lo = all.length ? Math.floor(Math.min(...all) * 2) / 2 : 0;
    let hi = all.length ? Math.ceil(Math.max(...all) * 2) / 2 : 1;
    this.scale = { lo, hi: Math.max(hi, lo + 1) };
    safeRun(() => {
      let p = this.params;
      let rib = ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
      let g = this.g = solveGraduation(p, s)!;
      this.drawn.emit([
        renderThicknessMap(p, s, this.scale, this.pal),
        renderFholePlate(p, this.pal, rib, false),
        renderBackPlate(p, this.pal, rib),
        renderGraduation(p, g, this.pal, this.flags.showEdgeReach),
        ...(this.flags.showGraduationPoints ? [renderGraduationPoints(p, s, this.active, this.selected, this.pal, this.flags.showPointReaches)] : []),
        renderSolveFailures(g.failures, this.pal.alert, true),
      ]);
    });
  }
}

// the lamplight palette's thin-to-thick inks, after the four the loops take and the points' own
const RAMP = [5, 6, 7, 8, 9];

// one click, unsnapped, handed back as a point; the reach it will take drawn under the pointer,
// and across the joint at `mirrorX` when mirrored, solid where the click would land and dashed where it would not
class PickPointTool implements DraftTool {
  readonly id = 'graduation-pick';
  readonly label = 'Add point';
  readonly oneShot = true;
  readonly disableSnapping = true;
  private hover: Pt | null = null;

  constructor(
    private ink: string,
    private reach: number,
    private mirrorX: number | null,
    private valid: (pt: Pt) => boolean,
    private placed: (pt: Pt) => void,
    private cancelled: () => void,
  ) {}

  onPointerDown(pt: Pt): void {
    if (this.valid(pt)) this.placed(pt);
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    this.hover = pt;
    host.requestDraw();
  }

  onPointerUp(): void {}

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    this.cancelled();
    return true;
  }

  renderPreview(_gRoot: any, gUI: any): void {
    let hover = this.hover;
    if (!hover) return;
    let ok = this.valid(hover);
    let marks = this.mirrorX === null ? [hover] : [hover, new Pt(2 * this.mirrorX - hover.x, hover.y)];
    for (let at of marks) {
      gUI.append('circle').attr('cx', at.x).attr('cy', at.y).attr('r', this.reach).attr('fill', 'none').attr('stroke', this.ink)
        .attr('stroke-width', 1).attr('stroke-dasharray', ok ? null : '3 3').attr('opacity', ok ? 0.8 : 0.4).attr('vector-effect', 'non-scaling-stroke');
      for (let [dx, dy] of [[1, 0], [0, 1]]) {
        gUI.append('line').attr('x1', at.x - 2 * dx).attr('y1', at.y - 2 * dy).attr('x2', at.x + 2 * dx).attr('y2', at.y + 2 * dy)
          .attr('stroke', this.ink).attr('stroke-width', 1).attr('vector-effect', 'non-scaling-stroke');
      }
    }
  }

  reset(): void {
    this.hover = null;
  }
}

// a thickness on the ramp, thin glowing and thick dark, blended between the palette's ramp inks
export function rampFill(pal: PanelPalette, scale: { lo: number; hi: number }, thickness: number): string {
  let { lo, hi } = scale;
  let at = Math.min(1, Math.max(0, (thickness - lo) / (hi - lo))) * (RAMP.length - 1);
  let k = Math.min(RAMP.length - 2, Math.floor(at));
  let a = parseHex(pal.ink(RAMP[k])), b = parseHex(pal.ink(RAMP[k + 1])), f = at - k;
  return toHex({ r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f });
}

// both plates' thickness maps, the bands stacked thin to thick in the ramp's colours, under
// everything else drawn; each band's edge is traced as a contour line a shade darker than its
// fill, so the steps read as a map and not a wash
export const renderThicknessMap = (p: ViolinFamilyParams, s: GraduationSettings, scale: { lo: number; hi: number }, pal: PanelPalette) => (g: any, ui: any): void => {
  for (let plate of GRADUATION_PLATES) {
    let dx = PLATE_DX[plate](p);
    let bands = thicknessBands(p, s, plate);
    bands.forEach(({ level, polygons }, i) => {
      let d = polygons.map(poly => poly.map(ring => pathFromPolyline(ring.map(q => new Pt(q.x + dx, q.y)), true)).join(' ')).join(' ');
      let fill = rampFill(pal, scale, level);
      renderFilledPath(d, fill, 1, 'evenodd')(g, ui);
      // the lowest band's edge is the boundary itself, already drawn
      if (i > 0) renderPath(d, shade(fill, 0.35), STROKE_WEIGHT.guide, 0.7)(g, ui);
    });
  }
};

// a colour pulled toward black by `f`
function shade(hex: string, f: number): string {
  let c = parseHex(hex);
  return toHex({ r: c.r * (1 - f), g: c.g * (1 - f), b: c.b * (1 - f) });
}

// a point as a dot ringed in the canvas's neutral, so it stands off any band it sits on
const renderDot = (at: Pt, fill: string, ring: string, r = 1.3) => (g: any): void => {
  g.append('circle').attr('data-decoration', '').attr('cx', at.x).attr('cy', at.y).attr('r', r)
    .attr('fill', fill).attr('stroke', ring).attr('stroke-width', 1).attr('vector-effect', 'non-scaling-stroke');
};

const STYLE_NAMES: Record<GraduationStyle, string> = { zones: 'Zones', grid: 'Grid', blank: 'Blank' };

const spread = (values: number[]): string => {
  let lo = Math.min(...values), hi = Math.max(...values);
  return lo === hi ? lo.toFixed(1) : `${lo.toFixed(1)}–${hi.toFixed(1)}`;
};

function readSettings(): GraduationSettings | null {
  try {
    let parsed = JSON.parse(readWorkingState(STATE_KEY) ?? 'null');
    return parsed?.plates?.top?.points && parsed.plates.back?.points && parsed.plates.top.style in STYLE_NAMES && parsed.plates.back.style in STYLE_NAMES ? parsed : null;
  } catch {
    return null;
  }
}

const renderBackPlate = (p: ViolinFamilyParams, pal: PanelPalette, rib: RibArcs | null) => (g: any, ui: any): void => {
  let o = solveOuterContour(p);
  let dx = PLATE_DX.back(p);
  if (o?.back) renderPath(translatePath(o.back, dx, 0), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  if (o?.button) renderPath(translatePath(o.button.path, dx, 0), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  let inner = rib ? purflingPath(p, rib, 0) : null;
  if (inner) renderPath(translatePath(inner, dx, 0), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
};

// the blocks as faint fills, the lining line and the boundary, on both plates, each in its own ink,
// and with `reaches` the loops where the edge and f-hole thicknesses give way
export const renderGraduation = (p: ViolinFamilyParams, s: GraduationSolve, pal: PanelPalette, reaches = true) => (g: any, ui: any): void => {
  for (let dx of GRADUATION_PLATES.map(plate => PLATE_DX[plate](p))) {
    for (let block of s.blocks ? [s.blocks.neck, s.blocks.end] : []) {
      renderFilledPath(translatePath(block, dx, 0), pal.ink(2), 0.15)(g, ui);
      renderPath(translatePath(block, dx, 0), pal.ink(2), STROKE_WEIGHT.guide)(g, ui);
    }
    if (s.lining) renderPath(translatePath(s.lining, dx, 0), pal.ink(0), STROKE_WEIGHT.guide)(g, ui);
    if (s.boundary) renderPath(translatePath(s.boundary, dx, 0), pal.ink(1), STROKE_WEIGHT.trace)(g, ui);
    if (reaches && s.edgeReach) renderPath(translatePath(s.edgeReach, dx, 0), pal.ink(3), STROKE_WEIGHT.guide, 1, '3 3')(g, ui);
  }
  if (reaches) for (let ring of s.fHoleReach) renderPath(pathFromPolyline(ring, true), pal.ink(3), STROKE_WEIGHT.guide, 1, '3 3')(g, ui);
};

// each plate's points with their thicknesses, the plate being worked in full ink, the other faint,
// and the picked points haloed. With `reaches` every point on the plate being worked draws its
// reach; without, only the picked ones', which a grid's overlapping rings make the better view
const PLATE_DX: Record<GraduationPlate, (p: ViolinFamilyParams) => number> = { top: () => 0, back: p => -p.body.width * PLATE_LAYOUT_GAP };

export const renderGraduationPoints = (p: ViolinFamilyParams, s: GraduationSettings, active: GraduationPlate, selected: number[], pal: PanelPalette, reaches = true) => (g: any, ui: any): void => {
  for (let plate of GRADUATION_PLATES) {
    let dx = PLATE_DX[plate](p);
    let shown = plate === active;
    let ink = pal.ink(4);
    let full = shown ? ink : ink.faint(3);
    s.plates[plate].points.forEach((pt, i) => {
      let at = new Pt(pt.x + dx, pt.y);
      let picked = shown && selected.includes(i);
      if (picked) renderPointHalo(at, full, 5)(g, ui);
      if ((reaches && shown) || picked) renderCircle(new Circle(at.x, at.y, pt.reach), picked ? ink : ink.faint(3), false, picked ? undefined : '2 2')(g, ui);
      renderDot(at, full, shown ? pal.neutral : ink.faint(4), shown ? 1.3 : 0.9)(g);
      if (shown) renderText(new Pt(at.x + 5, at.y + 3), pt.thickness.toFixed(1), full, 3.6)(g, ui);
    });
  }
};

// how much of a block's height its inner corners are rounded by
const BLOCK_FILLET = 0.3;

// a block with `trim` taken off its inner face, the face moving toward the ribs; null once nothing
// of the block is left
function trimBlock(rect: Rectangle, inward: 1 | -1, trim: number): Rectangle | null {
  let near = inward > 0 ? Math.max(rect.Pt1.y, rect.Pt2.y) : Math.min(rect.Pt1.y, rect.Pt2.y);
  let face = inward > 0 ? Math.min(rect.Pt1.y, rect.Pt2.y) + trim : Math.max(rect.Pt1.y, rect.Pt2.y) - trim;
  if (inward * (near - face) <= 0) return null;
  return new Rectangle(new Pt(rect.Pt1.x, near), new Pt(rect.Pt2.x, face));
}

// a neck or end block as the mould sizes it, trimmed to the rib line, its inner face flat and the
// face's two corners rounded. `inward` is +1 for a block whose face looks down the body (the neck
// block), -1 for one looking up (the end block). The loop reaches past the rib line and is cut to
// it, so the block's outer face is the ribs' inner face whatever the outline does there
function blockShape(ribLine: string, rect: Rectangle, inward: 1 | -1): string {
  let halfWidth = Math.abs(rect.Pt2.x - rect.Pt1.x) / 2;
  let height = Math.abs(rect.Pt2.y - rect.Pt1.y);
  let face = inward > 0 ? Math.min(rect.Pt1.y, rect.Pt2.y) : Math.max(rect.Pt1.y, rect.Pt2.y);
  let beyond = face + inward * (height + 10);
  let r = Math.min(BLOCK_FILLET * height, halfWidth);
  let fillet = filletRightAngleCorner(new Pt(halfWidth, face), new Pt(-1, inward), r)!;
  let loop = mirroredLoop(
    [[new Pt(halfWidth, beyond), new Pt(halfWidth, face + inward * r)], fillet, [new Pt(halfWidth - r, face), new Pt(0, face)]],
    [[new Pt(halfWidth, beyond), new Pt(-halfWidth, beyond)]],
  );
  return intersectionFromTwoPaths(ribLine, loop);
}


// a later panel reads the loops by calling this; it returns and never writes to the params. Both
// loops are the channel's construction run from the rib line rather than the fluting edge, and kept
// inside the rib line itself. The last answer is kept against the params and the settings the loops
// read (the joins are the slow part, as in the fluting), so a point edit never re-solves them;
// nothing of it reaches the file
let last: { key: string; solve: GraduationSolve } | null = null;

export function solveGraduation(p: ViolinFamilyParams, gr: GraduationSettings): GraduationSolve | null {
  if (!p.outerContour || !p.corners || !p.bouts) return null;
  let key = JSON.stringify([p.body, p.bouts, p.corners, p.outerContour, p.fHoles, p.fHoleContours, gr.lining, gr.edgeInset, gr.blockMargin, gr.edgeReach, gr.fHoleReach]);
  if (last?.key === key) return last.solve;
  let solve = solveGraduationUncached(p, gr);
  last = { key, solve };
  return solve;
}

function solveGraduationUncached(p: ViolinFamilyParams, gr: GraduationSettings): GraduationSolve {
  let s: GraduationSolve = { blocks: null, lining: null, boundary: null, ground: null, edgeReach: null, holes: [], fHoleReach: [], failures: [] };
  let fail = (message: string, unsolved: GraduationFailure['unsolved']): GraduationFailure => ({ message, unsolved, circles: [], segments: [] });

  let rib = ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
  let ribLine = rib ? purflingPath(p, rib, 0) : null;
  if (!rib || !ribLine) {
    s.failures.push(fail('Graduation: the rib outline has to solve first.', ['lining', 'edgeInset', 'blockMargin']));
    return s;
  }
  let edge = samplePathToPolyline(ribLine, 0.5);

  // the blocks are the mould's; before the mould is drafted they are what its seed would make
  let q = p.mould ? p : { ...p };
  MouldPanel.seed(q);
  let blocks = solveMould(q)?.blocks ?? null;
  let faces = { neck: Infinity, end: -Infinity };
  solveSection(s.failures, 'Blocks', ['blockMargin'], () => {
    if (!blocks) return fail('Graduation: the neck and end blocks have to solve first.', ['blockMargin']);
    if (!Number.isFinite(gr.blockMargin)) return fail('Graduation: the block margin needs a value.', ['blockMargin']);
    let trim = Math.max(0, -gr.blockMargin);
    let neck = trimBlock(blocks.neck, 1, trim);
    let end = trimBlock(blocks.end, -1, trim);
    if (!neck || !end) return fail('Graduation: the block margin trims a block away to nothing.', ['blockMargin']);
    let hold = Math.max(0, gr.blockMargin);
    faces.neck = Math.min(neck.Pt1.y, neck.Pt2.y) - hold;
    faces.end = Math.max(end.Pt1.y, end.Pt2.y) + hold;
    if (!(faces.end < faces.neck)) return fail('Graduation: the blocks meet in the middle; nothing is left to graduate.', ['blockMargin']);
    s.blocks = { neck: blockShape(ribLine, neck, 1), end: blockShape(ribLine, end, -1) };
    return null;
  });

  let loop = (inset: number, key: 'lining' | 'edgeInset', label: string): string | null => {
    let made = channelLoop(p, rib!, -inset, -inset, edge);
    if (!made.joined) {
      s.failures.push(fail(`Graduation: the ${label} can't be carried round the C bout at these corners. Bring it in less, or open the corners.`, [key]));
      return null;
    }
    if (!made.path) s.failures.push(fail(`Graduation: the ${label} doesn't close into one loop this far in; it has eaten the neck face.`, [key]));
    return made.path;
  };

  solveSection(s.failures, 'Lining', ['lining'], () => {
    if (!(Number.isFinite(gr.lining) && gr.lining > 0)) return fail('Graduation: the lining needs a thickness above 0.', ['lining']);
    let made = loop(gr.lining, 'lining', 'lining line');
    // the linings run into the blocks, so the platform's edge steps round them
    s.lining = made && s.blocks ? differenceFromManyPaths(made, [s.blocks.neck, s.blocks.end]) : made;
    return null;
  });
  solveSection(s.failures, 'Edge inset', ['edgeInset'], () => {
    if (!Number.isFinite(gr.edgeInset)) return fail('Graduation: the edge inset needs a value.', ['edgeInset']);
    if (!(gr.edgeInset >= gr.lining)) return fail('Graduation: the edge inset has to reach at least to the linings, or the gouge would cut the glue platform.', ['edgeInset']);
    let made = loop(gr.edgeInset, 'edgeInset', 'boundary');
    if (!made) return null;
    if (!s.blocks) { s.boundary = made; return null; }
    let between = new Rectangle(new Pt(-p.body.width, faces.end), new Pt(p.body.width, faces.neck));
    let cut = intersectionFromTwoPaths(made, pathFromRect(between));
    if (!cut.trim()) return fail('Graduation: nothing of the boundary is left between the blocks.', ['edgeInset']);
    s.boundary = cut;
    return null;
  });
  if (s.boundary) {
    let loop = samplePathToPolyline(s.boundary, 0.5, true);
    let xs = loop.map(q => q.x), ys = loop.map(q => q.y);
    s.ground = { loop, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }
  // a guide only: where it can't be run this far in, nothing is drawn and nothing is reported
  if (s.boundary && gr.edgeReach > 0) {
    let made = '';
    try { made = channelLoop(p, rib, -(gr.edgeInset + gr.edgeReach), -(gr.edgeInset + gr.edgeReach), edge).path ?? ''; } catch { made = ''; }
    if (made && s.blocks) {
      let between = new Rectangle(new Pt(-p.body.width, faces.end + gr.edgeReach), new Pt(p.body.width, faces.neck - gr.edgeReach));
      made = made && faces.end + gr.edgeReach < faces.neck - gr.edgeReach ? intersectionFromTwoPaths(made, pathFromRect(between)) : '';
    }
    s.edgeReach = made.trim() ? made : null;
  }
  // the holes are the contours panel's; a guide only, as the edge reach is
  let contours = p.fHoleContours ? solveFholeContours(p) : null;
  if (contours?.path) {
    let paths = [contours.path, fholePath(p, contours, true)!];
    s.holes = paths.map(d => samplePathToPolyline(d, 0.5, true));
    if (gr.fHoleReach > 0) s.fHoleReach = s.holes.flatMap(hole => reachRing(hole, gr.fHoleReach));
  }
  return s;
}

// the loop at `reach` from a closed polyline, traced as a contour of the distance to it rather
// than offset, so a wing's tip rounds instead of spiking out
function reachRing(hole: Pt[], reach: number): Pt[][] {
  let idx = buildPolylineIndex(hole);
  let xs = hole.map(q => q.x), ys = hole.map(q => q.y);
  let pad = reach + 1;
  let box = { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad };
  let bands = fieldBands((x, y) => -distPointToPolylineIndexed(new Pt(x, y), idx), box, Math.max(0.25, reach / 12), [-reach], null);
  return bands.flatMap(b => b.polygons.map(poly => poly[0]));
}

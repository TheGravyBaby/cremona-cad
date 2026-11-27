import { Component, inject, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { clipPolygonToHalfPlane, flipPointAboutY, pointInPolygon, segmentArcIntersections } from '../../../../helpers/math/simpleGeometry';
import { filletRightAngleCorner } from '../../../../helpers/math/draftMath';
import { pathFromPolygon, pathFromPolyline, pathFromRect, samplePathToPolyline, translatePath } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, closestPointToPolylineIndexed, distPointToPolylineIndexed, minCostAssignment, pointAtPolylineLength, polylineCumulativeLengths, Reading, thinPlateSplineFitter } from '../../../../helpers/math/vibeMath';
import { differenceFromManyPaths, fieldBands, intersectionFromTwoPaths, mirroredLoop, normalOffsetZAt } from '../../../../helpers/math/pathVibes';
import { renderFilledPath, renderPath, renderPointHalo, renderSolveFailures, renderText } from '../../../../helpers/renderFuncs';
import { reportFailures, solveSection } from '../../../../helpers/validators';
import { stepAmountForKey } from '../../../../helpers/stepSize';
import { DraftTool, DraftToolHost } from '../../../../draft-canvas/tools/draft-tool';
import { ToolRegistryService } from '../../../../draft-canvas/tools/tool-registry';
import { IconDirective } from '../../../../icons/icon.directive';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT, THICKNESS_SCALE } from '../../../../theme/palettes';
import { PanelPalette, parseHex, ThemeService, toHex } from '../../../../theme/theme.service';
import { Arc, Pt, Rectangle } from '../../../../models/types';
import { GraduationParams, GraduationPoint, RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey } from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import { updateSolved } from '../../violin-family-solved';
import { GraduationFailure, GraduationGround, GraduationSolve, Land, PlateContourSolve, PlateSurface, SurfaceRow, ThicknessBand, ThicknessField } from '../../violin-family-solves';
import { familyStandards } from '../../violin-family-seed';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners, solvedRibArcs, RibArcs } from '../corners-panel/corners-panel';
import { PLATE_LAYOUT_GAP, definePurflingPath, solveOffsetArcs, solvedPlateContour } from '../plate-contour-panel/plate-contour-panel';
import { renderFholePlate } from '../fhole-placement-panel/fhole-placement-panel';
import { solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import { defineChannelLoop } from '../fluting-panel/fluting-panel';
import { calcBodyLandmarks, loopHalfChordAtY, rowAt, solvedCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { MouldPanel, solveMould } from '../mould-panel/mould-panel';

// Graduation, tried out on localhost only and carried without promise of support. The readings on
// `p.graduation` are treated as a surveyor treats spot heights: a thin-plate spline is fitted through
// them, with the boundary and the f-hole outlines sampled along at known thicknesses as breaklines,
// the spline is read onto a raster, and contours are traced at a fixed interval and filled as bands,
// thin to thick. Under the map lies the ground: the plates each with the rib line inside their edge,
// the top with both holes, the back to its left with the button, as the plate contour lays them out,
// and inside the rib line the six blocks, the linings running between them, and the boundary the
// graduation starts at. Panel and render first, then the layouts a plate's readings start from, the
// sidebar's plate map, the field and its contours, and the solve.

export const GRADUATION_PLATES = ['top', 'back'] as const;
export type GraduationPlate = typeof GRADUATION_PLATES[number];

const DEFAULT_SPACING = 40;
// how near an added point may come to one already placed: the dot and its thickness label
const POINT_CLEARANCE = 40;
// how long a spacing waits to be laid as a grid, so a grid isn't laid at each digit typed
const EDIT_DEBOUNCE_MS = 500;
// how long the map's solve waits after the last draw that left it unsolved
const MAP_SETTLE_MS = 400;
// where each plate is drawn: the top at the origin, the back beside it as the plate contour lays them
const PLATE_DX: Record<GraduationPlate, (p: ViolinFamilyParams) => number> = { top: () => 0, back: p => -p.body.width * PLATE_LAYOUT_GAP };
const round = (v: number): number => Math.round(v * 10) / 10;

// the plate's edge thickness, as drafted or as the size class has it
export function edgeThicknessOf(p: ViolinFamilyParams, plate: GraduationPlate): number {
  return p.arching?.[plate].thickness ?? familyStandards(p.body.height).edgeThickness;
}

@Component({
  selector: 'app-vf-dev-graduation-panel',
  imports: [FormsModule, IconDirective, NumberStepperDirective],
  templateUrl: './dev-graduation-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class DevGraduationPanel extends PanelComponentBase implements OnDestroy {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showGraduationPoints'];
  protected readonly pal = ThemeService.getPalette('lamplight');
  private readonly tools = inject(ToolRegistryService);

  readonly plates = GRADUATION_PLATES;
  solve!: GraduationSolve;
  // the grid a Lay Grid lays on each plate; a layout is an action, not a saved setting
  spacing: Record<GraduationPlate, number> = { top: DEFAULT_SPACING, back: DEFAULT_SPACING };
  // the plate being worked, the other folded to its summary, and the points picked on it
  active: GraduationPlate = 'top';
  selected: number[] = [];
  maps!: Record<GraduationPlate, PlateMap>;
  // the legend's two ends and its stops, placed by millimetres
  readonly scale = { lo: THICKNESS_SCALE[0].mm, hi: THICKNESS_SCALE[THICKNESS_SCALE.length - 1].mm };
  readonly rampGradient = `linear-gradient(90deg, ${THICKNESS_SCALE.map(s => `${s.color} ${(100 * (s.mm - this.scale.lo) / (this.scale.hi - this.scale.lo)).toFixed(1)}%`).join(', ')})`;
  // a map is dealt out again only when its points move, not on every thickness typed
  private mapCache: Partial<Record<GraduationPlate, { key: string; map: PlateMap }>> = {};
  // the canvas tool that takes the next click as a point, held while it is the active tool
  private pickTool: PickPointTool | null = null;
  // whether the held pick places a twin across the joint as well
  pickMirror = false;
  // the map as last solved. An edit that clears it is drawn at once over this map faded, and the
  // map's own solve (the lands, fields and bands, about a second) runs once the drawing settles
  private shownBands: Record<GraduationPlate, ThicknessBand[]> | null = null;
  private mapTimer: ReturnType<typeof setTimeout> | undefined;
  private mapDue = false;
  // a spacing being typed or stepped, laid as a grid once it settles
  private gridPending: { plate: GraduationPlate; timer: ReturnType<typeof setTimeout> } | undefined;
  private unwatchTools =this.tools.onChange(() => {
    if (this.pickTool && this.tools.activeTool !== this.pickTool) this.pickTool = null;
  });

  get picking(): boolean {
    return this.pickTool !== null;
  }

  get gr(): GraduationParams {
    return this.params.graduation!;
  }

  // the linings by size class, the gouge held off them by two rib thicknesses, the f-hole thickness
  // at the top's edge thickness, and no readings: the user lays or picks their own
  static seed(p: ViolinFamilyParams): void {
    if (p.graduation || !p.plateContour) return;
    let lining = familyStandards(p.body.height).lining;
    p.graduation = { lining, edgeInset: 2, blockMargin: 0, fHoleThickness: edgeThicknessOf(p, 'top'), top: { points: [] }, back: { points: [] } };
  }

  ngOnDestroy(): void {
    this.layGridNow();
    clearTimeout(this.mapTimer);
    this.unwatchTools();
    if (this.pickTool) this.tools.selectTool(null);
  }

  // the next click on the canvas becomes a point, if it lands inside the plate's boundary, and
  // mirrored, its twin across the joint too; the point is previewed under the pointer, and Escape
  // or the same button again calls it off
  pickByClick(mirror = false): void {
    if (this.pickTool) {
      this.tools.selectTool(null);
      if (this.pickMirror === mirror) return;
    }
    this.pickMirror = mirror;
    let plate = this.active;
    let valid = (pt: Pt): boolean => {
      let ground = this.solve.ground;
      let at = this.toPlate(pt, plate);
      if (mirror && Math.abs(at.x) < POINT_CLEARANCE / 2) at = new Pt(0, at.y);
      if (!ground || !pointInPolygon(at, ground.loop)) return false;
      let pts = this.gr[plate].points;
      return isPointClear(pts, at) && (at.x === 0 || !mirror || isPointClear(pts, new Pt(-at.x, at.y)));
    };
    let joint = mirror ? PLATE_DX[plate](this.params) : null;
    this.pickTool = new PickPointTool(this.pal.ink(4), joint, valid, pt => {
      let at = this.toPlate(pt, plate);
      let x = round(at.x), y = round(at.y), thickness = edgeThicknessOf(this.params, plate);
      // a mirrored click too near the joint for two points is taken onto it, its own twin
      if (mirror && Math.abs(x) < POINT_CLEARANCE / 2) x = 0;
      let xs = mirror && x !== 0 ? [x, -x] : [x];
      for (let px of xs) this.points.push({ x: px, y, thickness });
      this.selected = xs.map((_, i) => this.points.length - xs.length + i);
      this.tools.selectTool(null);
      this.recordEditAndRedraw();
    }, () => this.tools.selectTool(null));
    this.tools.selectTool(this.pickTool);
  }

  // a canvas point in the plate's own frame, the back drawn beside the top
  private toPlate(pt: Pt, plate: GraduationPlate): Pt {
    return new Pt(pt.x - PLATE_DX[plate](this.params), pt.y);
  }

  setAll(value: number | null): void {
    if (value === null || !Number.isFinite(value)) return;
    for (let pt of this.picked) pt.thickness = value;
    this.recordEditAndRedraw();
  }

  layGridSoon(plate: GraduationPlate): void {
    clearTimeout(this.gridPending?.timer);
    this.gridPending = { plate, timer: setTimeout(() => this.layGridNow(), EDIT_DEBOUNCE_MS) };
  }

  layGridNow(): void {
    if (this.gridPending) this.layout(this.gridPending.plate, 'grid');
  }

  // lays that plate's points out afresh, the zones, a grid at its spacing, or none, and leaves the other's alone
  layout(plate: GraduationPlate, style: 'zones' | 'grid' | 'blank'): void {
    clearTimeout(this.gridPending?.timer);
    this.gridPending = undefined;
    let p = this.params;
    this.gr[plate].points = style === 'zones' ? zonePoints(p, plate) : style === 'grid' ? gridPoints(p, this.spacing[plate], plate) : [];
    if (plate === this.active) this.selected = [];
    this.recordEditAndRedraw();
  }

  activate(plate: GraduationPlate): void {
    if (plate === this.active) return;
    this.active = plate;
    this.selected = [];
    this.drawCanvas();
  }

  // an added point starts on the joint at the boundary's middle, at the edge thickness, or the
  // nearest spot to it clear of the points already placed
  addPoint(): void {
    let ground = this.solve.ground;
    let at = ground ? calcClearSpot(ground, this.points) : new Pt(0, 0);
    if (!at) return;
    this.points.push({ x: at.x, y: at.y, thickness: edgeThicknessOf(this.params, this.active) });
    this.selected = [this.points.length - 1];
    this.recordEditAndRedraw();
  }

  removeSelected(): void {
    let plate = this.gr[this.active];
    plate.points = plate.points.filter((_, i) => !this.selected.includes(i));
    this.selected = [];
    this.recordEditAndRedraw();
  }

  // a click picks one point, a shift-click adds it to the pick or takes it back out
  select(i: number, e: MouseEvent): void {
    // so the arrows step the pick straight away, in browsers that don't focus a clicked button
    (e.currentTarget as HTMLElement | null)?.focus?.();
    if (!e.shiftKey) this.selected = [i];
    else this.selected = this.selected.includes(i) ? this.selected.filter(j => j !== i) : [...this.selected, i];
    this.drawCanvas();
  }

  // a row's label picks the whole station or ring
  selectRow(row: PlateMapRow, e: MouseEvent): void {
    let picked = row.cells.filter((i): i is number => i !== null);
    this.selected = e.shiftKey ? [...new Set([...this.selected, ...picked])] : picked;
    this.drawCanvas();
  }

  pickAll(): void {
    this.selected = this.points.map((_, i) => i);
    this.drawCanvas();
  }

  private mapOf(plate: GraduationPlate): PlateMap {
    let pts = this.gr[plate].points;
    let key = JSON.stringify(pts.map(pt => [pt.x, pt.y]));
    let hit = this.mapCache[plate];
    if (hit?.key === key) return hit.map;
    let ground = solvedGraduation(this.params)?.ground ?? null;
    let map = plateMap(pts, ground);
    this.mapCache[plate] = { key, map };
    return map;
  }

  get points(): GraduationPoint[] {
    return this.gr[this.active].points;
  }

  get picked(): GraduationPoint[] {
    return this.selected.map(i => this.points[i]).filter(pt => !!pt);
  }

  // the picked points' common thickness, or null where they differ
  shared(): number | null {
    let values = this.picked.map(pt => pt.thickness);
    return values.length && values.every(v => v === values[0]) ? values[0] : null;
  }

  // every picked point stepped by the same amount, so a mixed pick keeps its differences
  nudge(delta: number, e?: Event): void {
    e?.preventDefault();
    if (!this.picked.length) return;
    for (let pt of this.picked) pt.thickness = Math.max(0, Math.round((pt.thickness + delta) * 100) / 100);
    this.recordEditAndRedraw();
  }

  move(dx: number, dy: number, e?: Event): void {
    e?.preventDefault();
    if (!this.picked.length) return;
    for (let pt of this.picked) {
      pt.x = Math.round((pt.x + dx) * 100) / 100;
      pt.y = Math.round((pt.y + dy) * 100) / 100;
    }
    this.recordEditAndRedraw();
  }

  // the arrows move the pick on the plate, = and - step its thickness
  mapKey(e: KeyboardEvent): void {
    let step = stepAmountForKey(e);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') this.move(0, e.key === 'ArrowUp' ? step : -step, e);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') this.move(e.key === 'ArrowRight' ? step : -step, 0, e);
    else if (e.key === '=' || e.key === '+') this.nudge(0.1, e);
    else if (e.key === '-' || e.key === '_') this.nudge(-0.1, e);
    else if (e.key === 'Escape' && this.selected.length) {
      e.preventDefault();
      this.selected = [];
      this.drawCanvas();
    }
  }

  // what the pick holds: one point by number and place, several by count and spread
  pickNote(): string {
    let picked = this.picked;
    if (picked.length === 1) return `Point ${this.selected[0] + 1} · x ${picked[0].x}, y ${picked[0].y} mm`;
    let t = picked.map(pt => pt.thickness);
    return `${picked.length} points · ${spread(t)} mm`;
  }

  // a folded plate's one line: how many points and their spread
  summary(plate: GraduationPlate): string {
    let pts = this.gr[plate].points;
    if (!pts.length) return 'no points';
    return `${pts.length} pts · ${spread(pts.map(pt => pt.thickness))} mm`;
  }

  fill(thickness: number): string {
    return rampFill(thickness);
  }

  // a chip's number in its own fill run dark, every stop being light enough to carry it
  fillText(thickness: number): string {
    return shade(rampFill(thickness), 0.7);
  }

  reportSolveFailures(): void {
    reportFailures(this.solve.failures, 'Graduation');
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let p = this.params;
    this.maps = { top: this.mapOf('top'), back: this.mapOf('back') };
    clearTimeout(this.mapTimer);
    let fresh = this.mapDue || !this.shownBands || isThicknessMapHeld(p);
    this.mapDue = false;
    if (fresh) {
      this.shownBands = { top: solvedThicknessBands(p, 'top'), back: solvedThicknessBands(p, 'back') };
    } else {
      this.mapTimer = setTimeout(() => {
        this.mapDue = true;
        this.drawCanvas();
      }, MAP_SETTLE_MS);
    }
    let rib = solvedRibArcs(p);
    let solve = this.solve = solvedGraduation(p)!;
    let pc = solvedPlateContour(p);
    return [
      renderThicknessMap(p, this.shownBands!, this.pal, !fresh),
      renderFholePlate(p, pc, this.pal, rib, false),
      renderBackPlate(p, pc, this.pal, rib),
      renderGraduation(p, solve, this.pal),
      ...(this.flags.showGraduationPoints ? [renderGraduationPoints(p, this.active, this.selected, this.pal)] : []),
      renderSolveFailures(solve.failures, this.pal.alert, true),
    ];
  }
}

// one click, unsnapped, handed back as a point; the point marked under the pointer, and across
// the joint at `mirrorX` when mirrored, solid where the click would land and dashed where it would not
class PickPointTool implements DraftTool {
  readonly id = 'graduation-pick';
  readonly label = 'Add point';
  readonly oneShot = true;
  readonly disableSnapping = true;
  private hover: Pt | null = null;

  constructor(
    private ink: string,
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
      gUI.append('circle').attr('cx', at.x).attr('cy', at.y).attr('r', 4).attr('fill', 'none').attr('stroke', this.ink)
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

// a thickness's colour on the fixed scale, blended between the stops either side of it
export function rampFill(thickness: number): string {
  let k = THICKNESS_SCALE.findIndex(s => s.mm > thickness);
  if (k === 0 || !Number.isFinite(thickness)) return THICKNESS_SCALE[0].color;
  if (k < 0) return THICKNESS_SCALE[THICKNESS_SCALE.length - 1].color;
  let lo = THICKNESS_SCALE[k - 1], hi = THICKNESS_SCALE[k];
  let a = parseHex(lo.color), b = parseHex(hi.color), f = (thickness - lo.mm) / (hi.mm - lo.mm);
  return toHex({ r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f });
}

// both plates' thickness maps, the bands stacked thin to thick in the ramp's colours, under
// everything else drawn; each band's edge is traced as a contour line a shade darker than its
// fill, so the steps read as a map and not a wash. A stale map, waiting on its solve, is faded
export const renderThicknessMap = (p: ViolinFamilyParams, bands: Record<GraduationPlate, ThicknessBand[]>, pal: PanelPalette, stale: boolean) => (g: any, ui: any): void => {
  let opacity = stale ? STALE_MAP_OPACITY : 1;
  for (let plate of GRADUATION_PLATES) {
    let dx = PLATE_DX[plate](p);
    bands[plate].forEach(({ level, polygons }, i) => {
      let d = polygons.map(poly => poly.map(ring => pathFromPolyline(ring.map(q => new Pt(q.x + dx, q.y)), true)).join(' ')).join(' ');
      let fill = rampFill(level + CONTOUR_INTERVAL / 2);
      renderFilledPath(d, fill, opacity, 'evenodd')(g, ui);
      // the lowest band's edge is the boundary itself, already drawn
      if (i > 0) renderPath(d, shade(fill, 0.35), STROKE_WEIGHT.guide, 0.7 * opacity)(g, ui);
    });
  }
};

const STALE_MAP_OPACITY = 0.35;

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

const spread = (values: number[]): string => {
  let lo = Math.min(...values), hi = Math.max(...values);
  return lo === hi ? lo.toFixed(1) : `${lo.toFixed(1)}–${hi.toFixed(1)}`;
};

const renderBackPlate = (p: ViolinFamilyParams, pc: PlateContourSolve | null, pal: PanelPalette, rib: RibArcs | null) => (g: any, ui: any): void => {
  let dx = PLATE_DX.back(p);
  if (pc?.back) renderPath(translatePath(pc.back, dx, 0), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  if (pc?.button) renderPath(translatePath(pc.button.path, dx, 0), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  let inner = rib ? definePurflingPath(p, rib, 0) : null;
  if (inner) renderPath(translatePath(inner, dx, 0), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
};

// the blocks and linings as faint fills and the boundary, on both plates, each in its own ink
export const renderGraduation = (p: ViolinFamilyParams, s: GraduationSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  for (let dx of GRADUATION_PLATES.map(plate => PLATE_DX[plate](p))) {
    for (let block of s.blocks ? [s.blocks.neck, s.blocks.end, ...s.blocks.corners] : []) {
      renderFilledPath(translatePath(block, dx, 0), pal.ink(2), 0.15)(g, ui);
      renderPath(translatePath(block, dx, 0), pal.ink(2), STROKE_WEIGHT.guide)(g, ui);
    }
    if (s.lining) {
      renderFilledPath(translatePath(s.lining, dx, 0), pal.ink(0), 0.15)(g, ui);
      renderPath(translatePath(s.lining, dx, 0), pal.ink(0), STROKE_WEIGHT.guide)(g, ui);
    }
    if (s.boundary) renderPath(translatePath(s.boundary, dx, 0), pal.ink(1), STROKE_WEIGHT.trace)(g, ui);
  }
};

// each plate's points with their thicknesses, the plate being worked in full ink, the other faint,
// and the picked points haloed
export const renderGraduationPoints = (p: ViolinFamilyParams, active: GraduationPlate, selected: number[], pal: PanelPalette) => (g: any, ui: any): void => {
  for (let plate of GRADUATION_PLATES) {
    let dx = PLATE_DX[plate](p);
    let shown = plate === active;
    let ink = pal.ink(4);
    let full = shown ? ink : ink.faint(3);
    p.graduation![plate].points.forEach((pt, i) => {
      let at = new Pt(pt.x + dx, pt.y);
      let picked = shown && selected.includes(i);
      if (picked) renderPointHalo(at, full, 5)(g, ui);
      renderDot(at, full, shown ? pal.neutral : ink.faint(4), shown ? 1.3 : 0.9)(g);
      if (shown) renderText(new Pt(at.x + 5, at.y + 3), pt.thickness.toFixed(1), full, 3.6)(g, ui);
    });
  }
};

export function isPointClear(points: GraduationPoint[], at: Pt): boolean {
  return points.every(pt => Math.hypot(pt.x - at.x, pt.y - at.y) >= POINT_CLEARANCE);
}

// the spot nearest the ground's middle on the joint that is inside the ground and clear of every
// point, tried on a lattice at half the clearance with a column on the joint; null when the plate is full
export function calcClearSpot(ground: GraduationGround, points: GraduationPoint[]): Pt | null {
  let { loop, minX, maxX, minY, maxY } = ground;
  let from = new Pt(0, round((minY + maxY) / 2));
  let step = POINT_CLEARANCE / 2;
  let spots: Pt[] = [];
  for (let i = Math.ceil(minX / step); i <= Math.floor(maxX / step); i++) {
    for (let j = Math.ceil((minY - from.y) / step); j <= Math.floor((maxY - from.y) / step); j++) {
      spots.push(new Pt(i * step, round(from.y + j * step)));
    }
  }
  spots.sort((a, b) => Math.hypot(a.x, a.y - from.y) - Math.hypot(b.x, b.y - from.y));
  return spots.find(at => pointInPolygon(at, loop) && isPointClear(points, at)) ?? null;
}

// the zones a luthier graduates by, as the fewest points that draw them: an island on the joint
// midway between the corner rows, with a point above and below it on those rows, where it gives
// way to the bouts; for each main bout a dome on the joint at its widest row, a channel zone each side
// along the edge on that row, a pair out toward the block on the row most of the way to the end, and a flank each side on the row between the corners and the widest,
// the four flanks fanning out from the island as an X. Each is placed off the boundary's half
// chord at its row, so the zones scale with the outline, and each takes its zone's thickness. Read
// from the lower bout up
export function zonePoints(p: ViolinFamilyParams, plate: GraduationPlate): GraduationPoint[] {
  return calcZones(p, plate).map(z => z.point);
}

// the zone points, each with the zone it stands for
export function calcZones(p: ViolinFamilyParams, plate: GraduationPlate): { zone: string; point: GraduationPoint }[] {
  let ground = solvedGraduation(p)?.ground;
  let marks = new Map(calcBodyLandmarks(p).map(k => [k.code, k.y]));
  let rows = (['LB', 'LC', 'UC', 'UB'] as const).map(code => marks.get(code));
  if (!ground || rows.some(y => y === undefined)) return [];
  let [LB, LC, UC, UB] = rows as number[];
  let mm = ZONE_THICKNESS[plate];
  let scale = familyStandards(p.body.height).edgeThickness / VIOLIN_EDGE;
  let half = (y: number): number => loopHalfChordAtY(ground.loop, y) ?? 0;
  let at = (x: number, y: number, zone: string, t: number) => ({ zone, point: { x: round(x), y: round(y), thickness: round(t * scale) } });
  let pair = (x: number, y: number, zone: string, t: number) => [at(-x, y, `${zone} bass`, t), at(x, y, `${zone} treble`, t)];
  let points: { zone: string; point: GraduationPoint }[] = [];
  for (let [name, bout, corner, end, dome] of [['Lower', LB, LC, ground.minY, mm.lowerDome], ['Upper', UB, UC, ground.maxY, mm.upperDome]] as const) {
    let flankY = (bout + corner) / 2;
    let edgeY = bout + ZONE.edgeRow * (end - bout);
    points.push(
      ...pair(ZONE.edge * half(edgeY), edgeY, `${name} edge`, mm.edge),
      ...pair(ZONE.channel * half(bout), bout, `${name} channel`, mm.channel),
      at(0, bout, `${name} dome`, dome),
      ...pair(ZONE.flank * half(flankY), flankY, `${name} flank`, mm.flank),
    );
  }
  // the island's middle sits midway between the corner rows, not on the waist, which can lie off
  // it; a point at each end makes the three one island
  points.push(at(0, LC, 'Island lower', mm.islandEnd), at(0, (LC + UC) / 2, 'Island', mm.island), at(0, UC, 'Island upper', mm.islandEnd));
  return points
    .filter(({ point: pt }) => pointInPolygon(new Pt(pt.x, pt.y), ground.loop))
    .sort((a, b) => a.point.y - b.point.y || a.point.x - b.point.x);
}

// where the channel, flank and edge zones sit, as shares of the half chord at their row; the edge
// row as a share of the way from the widest row to the block's face
const ZONE = { channel: 0.82, flank: 0.55, edge: 0.6, edgeRow: 0.7 };

// a violin's zone thicknesses in mm, concentric as Langsather's modified Strad plan (quoted in Roach,
// Chapter 7): each zone thicker than the ones outside it, so no zone is a hollow inside thicker wood.
// The channels meet the boundary's thin sides; the end edges stand above them, the boundary there
// rising onto the blocks. The top's island meets the f-hole wings, the back's peaks within Loen's
// 4-5 mm (CAS Journal, Nov 2002). Other sizes scale by their edge thickness. Loen's backs sit their
// thickest off the joint; these stay symmetric
const ZONE_THICKNESS: Record<GraduationPlate, { edge: number; channel: number; lowerDome: number; upperDome: number; flank: number; islandEnd: number; island: number }> = {
  top: { edge: 2.8, channel: 2.5, lowerDome: 3, upperDome: 3, flank: 3.2, islandEnd: 3.35, island: 3.5 },
  back: { edge: 2.8, channel: 2.5, lowerDome: 3.2, upperDome: 3, flank: 3.5, islandEnd: 3.9, island: 4.5 },
};
const VIOLIN_EDGE = 3.5;

// a lattice `spacing` apart, one column on the joint and the rows centred on the boundary, kept to
// the points inside it and off the top's holes, where there is no wood to read, read top to bottom
// and bass to treble. Empty until the boundary solves
export function gridPoints(p: ViolinFamilyParams, spacing: number, plate: GraduationPlate): GraduationPoint[] {
  let solve = solvedGraduation(p);
  let ground = solve?.ground;
  if (!solve || !ground || !(spacing > 0)) return [];
  let { loop, minX, maxX, minY, maxY } = ground;
  let holes = plate === 'top' ? solve.holes.map(hole => ({ hole, idx: buildPolylineIndex(hole) })) : [];
  let onWood = (q: Pt): boolean => pointInPolygon(q, loop) && !holes.some(h => pointInPolygon(q, h.hole) || distPointToPolylineIndexed(q, h.idx) < HOLE_MARGIN);
  let cy = (minY + maxY) / 2;
  let thickness = edgeThicknessOf(p, plate);
  let points: GraduationPoint[] = [];
  for (let j = Math.floor((maxY - cy) / spacing); j >= Math.ceil((minY - cy) / spacing); j--) {
    let y = cy + j * spacing;
    for (let i = Math.ceil(minX / spacing); i <= Math.floor(maxX / spacing); i++) {
      let x = i * spacing;
      if (onWood(new Pt(x, y))) points.push({ x: round(x), y: round(y), thickness });
    }
  }
  return points;
}

// about a wing's width: the strip beside a hole a grid lays no point in
const HOLE_MARGIN = 6;

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

export function plateMap(pts: GraduationPoint[], extent: { minX: number; maxX: number; minY: number; maxY: number } | null = null): PlateMap {
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

// a plate's thickness anywhere. Inside the boundary it is the thin-plate spline through the
// readings: the points, the boundary and each f-hole sampled at their own thicknesses, as a surveyor
// fixes a breakline, and the lines between neighbouring readings that agree. In a hole it is the
// f-hole thickness, what its wings carry. Outside the boundary it is the land's

// how far apart the boundary and the hole outlines are sampled; the holes closer, since a wing's
// outline turns tight and its thickness can stand well off its neighbours'
const BOUNDARY_STEP = 10;
const HOLE_STEP = 2;
// two readings nearer than this are one spot to the spline; the first stands
const SAME_SPOT = 0.5;

// a plate's thickness field as held on the params, solved first if an edit has cleared it
export function solvedThicknessField(p: ViolinFamilyParams, plate: GraduationPlate): ThicknessField | null {
  updateSolved(p);
  let held = plate === 'top' ? p.solved!.thicknessFieldTop : p.solved!.thicknessFieldBack;
  if (held.solve === undefined) held.solve = solveThicknessField(p, plate);
  return held.solve;
}

// a plate's thickness field from the params, calculated at every call (~200ms) and never writing
// to them. Everything but a spec reads solvedThicknessField() rather than calling this
export function solveThicknessField(p: ViolinFamilyParams, plate: GraduationPlate): ThicknessField | null {
  let solve = solvedGraduation(p);
  let s = p.graduation;
  let land = solvedLand(p, plate);
  if (!solve?.ground || !s || !land) return null;
  let points = s[plate].points.filter(pt => Number.isFinite(pt.thickness));
  // with no readings the boundary alone would make up a plate nobody read
  if (!points.length) return null;
  let edge = edgeThicknessOf(p, plate);
  let holes = plate === 'top' && Number.isFinite(s.fHoleThickness) ? solve.holes : [];
  let { loop } = solve.ground;
  // the points first, so a sample landing on one gives way to it
  let readings: Reading[] = [];
  for (let r of [
    ...points.map(pt => ({ x: pt.x, y: pt.y, v: pt.thickness })),
    ...sampleLoop(loop, BOUNDARY_STEP).map(q => ({ x: q.x, y: q.y, v: land.atBoundary(q.x, q.y) })),
    ...holes.flatMap(hole => [...sampleLoop(hole, HOLE_STEP), ...calcHoleFill(hole)].map(q => ({ x: q.x, y: q.y, v: s.fHoleThickness }))),
    ...calcLevelBridges(points, holes, s.fHoleThickness, loop),
  ]) {
    if (!readings.some(q => Math.hypot(q.x - r.x, q.y - r.y) < SAME_SPOT)) readings.push(r);
  }
  let fit = thinPlateSplineFitter(readings);
  let values = readings.map(r => r.v);
  let lo = Math.min(...values), hi = Math.max(...values);
  let interpolated = fit?.(values) ?? (() => edge);
  let field: ThicknessField = {
    // a spline can rise past the readings between them; the plate is held to what was read. The
    // raster reads the spline unclamped, since a band traced along a clamped plateau staircases
    at: (x, y) => {
      let at = new Pt(x, y);
      if (holes.some(hole => pointInPolygon(at, hole))) return s.fHoleThickness;
      return pointInPolygon(at, loop) ? Math.min(hi, Math.max(lo, interpolated(x, y))) : land.at(x, y);
    },
    interpolated,
    edgeAt: land.atBoundary,
    edge,
    range: { lo, hi },
    loop,
  };
  return field;
}

// the lattice points inside a hole, read at the f-hole thickness with its outline. The outline alone
// leaves the spline free to swell across the hole, where the thin boundary runs hard by its outer
// wall, and the swell comes back as a hollow in the island; held level in the hole it cannot. The
// lattice stands on the joint, so mirrored holes fill alike
const HOLE_FILL_STEP = 3;

export function calcHoleFill(hole: Pt[]): Pt[] {
  let xs = hole.map(q => q.x), ys = hole.map(q => q.y);
  let fill: Pt[] = [];
  for (let j = Math.ceil(Math.min(...ys) / HOLE_FILL_STEP); j * HOLE_FILL_STEP <= Math.max(...ys); j++) {
    for (let i = Math.ceil(Math.min(...xs) / HOLE_FILL_STEP); i * HOLE_FILL_STEP <= Math.max(...xs); i++) {
      let q = new Pt(i * HOLE_FILL_STEP, j * HOLE_FILL_STEP);
      if (pointInPolygon(q, hole)) fill.push(q);
    }
  }
  return fill;
}

// the level ground between readings that agree: where two neighbouring points share a thickness, the
// line between them is read at it too, and so is the line from a point at the f-hole thickness to
// each hole beside it, as a maker who marks three spots alike means the wood between them. A point
// alone cannot hold a spline level; a line can. Two points are neighbours while no third stands in
// the circle drawn on the line between them, and a line that leaves the plate or crosses a hole is
// no bridge
const BRIDGE_STEP = 10;
const SAME_THICKNESS = 1e-6;

export function calcLevelBridges(points: GraduationPoint[], holes: Pt[][], holeThickness: number, loop: Pt[]): Reading[] {
  let walls = holes.map(hole => buildPolylineIndex(hole));
  let spans: { a: Pt; b: Pt; v: number }[] = [];
  points.forEach((pt, i) => {
    let a = new Pt(pt.x, pt.y);
    for (let other of points.slice(i + 1)) {
      if (Math.abs(other.thickness - pt.thickness) < SAME_THICKNESS) spans.push({ a, b: new Pt(other.x, other.y), v: pt.thickness });
    }
    if (Math.abs(holeThickness - pt.thickness) < SAME_THICKNESS) {
      for (let wall of walls) spans.push({ a, b: closestPointToPolylineIndexed(a, wall).point, v: pt.thickness });
    }
  });
  let bridges: Reading[] = [];
  for (let { a, b, v } of spans) {
    let mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
    if (points.some(q => Math.hypot(q.x - mx, q.y - my) < r - SAME_SPOT)) continue;
    let n = Math.round(2 * r / BRIDGE_STEP);
    let line = Array.from({ length: Math.max(0, n - 1) }, (_, k) => new Pt(a.x + (b.x - a.x) * (k + 1) / n, a.y + (b.y - a.y) * (k + 1) / n));
    if (line.some(q => !pointInPolygon(q, loop) || holes.some(hole => pointInPolygon(q, hole)))) continue;
    for (let q of line) bridges.push({ x: q.x, y: q.y, v });
  }
  return bridges;
}

// the inside of a plate over (x, y): its outer surface carried in square to itself by the thickness
// the calipers read where they stand, so on a slope the inside lands beside the reading, not under
// it. Null off the plate or before it is graduated
export function innerSurfaceZAt(surface: PlateSurface, field: ThicknessField, x: number, y: number): number | null {
  // a row is the slow part of a surface read, and the slopes read three points on each
  let rows = new Map<number, SurfaceRow>();
  return normalOffsetZAt((u, v) => {
    let row = rows.get(v) ?? rows.set(v, rowAt(surface, v)).get(v)!;
    return surfaceZAt(surface, u, v, row);
  }, field.at, x, y);
}

// the land: the flat outside the boundary, left uncarved, so its thickness is whatever the outer
// surface stands at over it, the edge thickness where the edge is, less wherever the fluting channel
// dips, more where the arch has risen. `atBoundary` is that reading at the boundary's nearest point,
// so where the gouge takes off it is the wood that is really there, not the edge thickness.
// A plate's land as held on the params, solved first if an edit has cleared it. No point edit
// clears it, which is why it is held apart from the thickness field
function solvedLand(p: ViolinFamilyParams, plate: GraduationPlate): Land | null {
  updateSolved(p);
  let held = plate === 'top' ? p.solved!.landTop : p.solved!.landBack;
  if (held.solve === undefined) held.solve = solveLand(p, plate);
  return held.solve;
}

// a plate's land from the params, calculated at every call (~300ms: the surface read at every
// vertex of the boundary, a row solve each). Null until the boundary has solved
function solveLand(p: ViolinFamilyParams, plate: GraduationPlate): Land | null {
  let ground = solvedGraduation(p)?.ground;
  if (!ground) return null;
  let { loop } = ground;
  let surface = solvedCrossArching(p)?.[plate] ?? null;
  let edge = edgeThicknessOf(p, plate);
  // off the plate, or with no surface solved, the edge thickness stands
  let at = (x: number, y: number): number => edge + ((surface && surfaceZAt(surface, x, y)) ?? 0);
  let along = loop.map(q => at(q.x, q.y));
  let idx = buildPolylineIndex(loop);
  let atBoundary = (x: number, y: number): number => {
    let { point, index } = closestPointToPolylineIndexed(new Pt(x, y), idx);
    let a = loop[index], b = loop[(index + 1) % loop.length];
    let len = Math.hypot(b.x - a.x, b.y - a.y);
    let t = len > 1e-9 ? Math.hypot(point.x - a.x, point.y - a.y) / len : 0;
    return along[index] + t * (along[(index + 1) % loop.length] - along[index]);
  };
  return { at, atBoundary };
}

// points spaced evenly round a closed polyline, about `step` apart, counted from where it crosses
// the joint lowest down, or from its lowest vertex when it doesn't cross, so a loop mirrored across
// the joint, or two loops mirrored onto each other, are sampled in mirrored pairs
function sampleLoop(loop: Pt[], step: number): Pt[] {
  let cum = polylineCumulativeLengths(loop);
  let perimeter = cum[cum.length - 1];
  let start = 0, startY = Infinity;
  for (let i = 0; i + 1 < loop.length; i++) {
    let a = loop[i], b = loop[i + 1];
    if (a.x !== 0 && a.x * b.x >= 0) continue;
    let t = a.x === b.x ? 0 : a.x / (a.x - b.x);
    let y = a.y + t * (b.y - a.y);
    if (y < startY) { startY = y; start = cum[i] + t * (cum[i + 1] - cum[i]); }
  }
  if (startY === Infinity) loop.forEach((q, i) => { if (q.y < startY) { startY = q.y; start = cum[i]; } });
  let n = Math.max(3, Math.round(perimeter / step));
  return Array.from({ length: n }, (_, k) => pointAtPolylineLength(loop, cum, (start + k * perimeter / n) % perimeter));
}

// the thickness map, drawn as a contour map is: the spline read onto a raster `RASTER_COLUMNS`
// cells across the plate, contours traced at every `CONTOUR_INTERVAL` from the thinnest reading up,
// and the ground at or above each level filled as a band, cut to the boundary with the holes left
// blank, so the bands stack from thin to thick. The levels fall half an interval off the round
// thicknesses a maker types, so each band is centred on one: a plate read 3.5 all over lies in the
// middle of its band, where a level at 3.5 would trace every hundredth the spline strays either
// side. The field itself still answers in a hole
export const CONTOUR_INTERVAL = 0.25;
const RASTER_COLUMNS = 80;
// the clip needs no finer a loop than the raster; cutting to the boundary as sampled costs four times as much
const CLIP_STEP = 2;

// whether both plates' bands stand solved on the params, so the map draws without solving
function isThicknessMapHeld(p: ViolinFamilyParams): boolean {
  updateSolved(p);
  return p.solved!.thicknessBandsTop.solve !== undefined && p.solved!.thicknessBandsBack.solve !== undefined;
}

// a plate's bands as held on the params, solved first if an edit has cleared them
export function solvedThicknessBands(p: ViolinFamilyParams, plate: GraduationPlate): ThicknessBand[] {
  updateSolved(p);
  let held = plate === 'top' ? p.solved!.thicknessBandsTop : p.solved!.thicknessBandsBack;
  if (held.solve === undefined) held.solve = solveThicknessBands(p, plate);
  return held.solve;
}

// a plate's bands from the params, calculated at every call (~120ms). Everything but a spec reads
// solvedThicknessBands() rather than calling this
export function solveThicknessBands(p: ViolinFamilyParams, plate: GraduationPlate): ThicknessBand[] {
  let field = solvedThicknessField(p, plate);
  if (!field) return [];
  let solve = solvedGraduation(p)!;
  let box = solve.ground!;
  let cell = Math.max(1, (box.maxX - box.minX) / RASTER_COLUMNS);
  let levels: number[] = [];
  for (let k = Math.floor(field.range.lo / CONTOUR_INTERVAL - 0.5); (k + 0.5) * CONTOUR_INTERVAL <= field.range.hi; k++) levels.push((k + 0.5) * CONTOUR_INTERVAL);
  let holes = plate === 'top' ? solve.holes.map(hole => sampleLoop(hole, CLIP_STEP)) : [];
  // held up to the thinnest reading as the plate is, or a spline dipping under it beside a lone
  // thin point falls below the lowest level and leaves a hole in every band
  let bands = fieldBands((x, y) => Math.max(field.range.lo, field.interpolated(x, y)), box, cell, levels, sampleLoop(field.loop, CLIP_STEP), holes);
  return bands;
}

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

// a corner block as the mould sizes it, trimmed as a maker would on the straight from where one
// lining's inner edge meets it to where the other's does, keeping the side with the corner's tip.
// With no inset arcs it comes back square; null when the arcs don't meet it once each side
function calcCornerBlockOutline(rect: Rectangle, tip: Pt, inset: Arc[]): Pt[] | null {
  let [x0, x1] = [Math.min(rect.Pt1.x, rect.Pt2.x), Math.max(rect.Pt1.x, rect.Pt2.x)];
  let [y0, y1] = [Math.min(rect.Pt1.y, rect.Pt2.y), Math.max(rect.Pt1.y, rect.Pt2.y)];
  let square = [new Pt(x0, y0), new Pt(x1, y0), new Pt(x1, y1), new Pt(x0, y1)];
  if (!inset.length) return square;
  let meets = square.flatMap((a, i) => inset.flatMap(arc => segmentArcIntersections(a, square[(i + 1) % 4], arc)));
  return meets.length === 2 ? clipPolygonToHalfPlane(square, meets[0], meets[1], tip) : null;
}

// a neck or end block as the mould sizes it, its inner face flat and the face's two corners
// rounded. `inward` is +1 for a block whose face looks down the body (the neck block), -1 for one
// looking up (the end block). The loop reaches past the rib line, to be cut to it, so the block's
// outer face is the ribs' inner face whatever the outline does there
function defineBlockLoop(rect: Rectangle, inward: 1 | -1): string {
  let halfWidth = Math.abs(rect.Pt2.x - rect.Pt1.x) / 2;
  let height = Math.abs(rect.Pt2.y - rect.Pt1.y);
  let face = inward > 0 ? Math.min(rect.Pt1.y, rect.Pt2.y) : Math.max(rect.Pt1.y, rect.Pt2.y);
  let beyond = face + inward * (height + 10);
  let r = Math.min(BLOCK_FILLET * height, halfWidth);
  let fillet = filletRightAngleCorner(new Pt(halfWidth, face), new Pt(-1, inward), r)!;
  return mirroredLoop(
    [[new Pt(halfWidth, beyond), new Pt(halfWidth, face + inward * r)], fillet, [new Pt(halfWidth - r, face), new Pt(0, face)]],
    [[new Pt(halfWidth, beyond), new Pt(-halfWidth, beyond)]],
  );
}


// the loops as held on the params, solved first if an edit has cleared them. The points are not
// among what clears them, so a point edit never re-solves the joins
export function solvedGraduation(p: ViolinFamilyParams): GraduationSolve | null {
  updateSolved(p);
  let held = p.solved!.graduation;
  if (held.solve === undefined) held.solve = solveGraduation(p);
  return held.solve;
}

// the loops from the params, calculated at every call (~90ms, the joins the slow part, as in the
// fluting) and never writing to them. Everything but a spec reads solvedGraduation() rather than
// calling this. The boundary is the channel's construction run from the rib line rather than the
// fluting edge, and kept inside the rib line itself
export function solveGraduation(p: ViolinFamilyParams): GraduationSolve | null {
  let gr = p.graduation;
  if (!gr || !p.plateContour || !p.corners || !p.bouts) return null;
  let s: GraduationSolve = { blocks: null, lining: null, boundary: null, ground: null, holes: [], failures: [] };
  let fail = (message: string, unsolved: GraduationFailure['unsolved']): GraduationFailure => ({ message, unsolved, circles: [], segments: [] });

  let rib = solvedRibArcs(p);
  let ribLine = rib ? definePurflingPath(p, rib, 0) : null;
  if (!rib || !ribLine) {
    s.failures.push(fail('Graduation: the rib outline doesn\'t close yet. Fix the bouts and corners first.', ['lining', 'edgeInset', 'blockMargin']));
    return s;
  }
  let edge = samplePathToPolyline(ribLine, 0.5);

  // the blocks are the mould's; before the mould is drafted they are what its seed would make
  let q = p.mould ? p : { ...p };
  MouldPanel.seed(q);
  let blocks = solveMould(q)?.blocks ?? null;
  let faces = { neck: Infinity, end: -Infinity };
  // the blocks before they are cut to the rib line: what the linings are cut back by, since a
  // block's own outer face runs along the rib line and would leave slivers all down it
  let uncut: string[] = [];
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
    // the corner blocks trimmed to the linings, treble then its bass mirror; left square until a lining solves
    let off = Number.isFinite(gr.lining) && gr.lining > 0 ? solveOffsetArcs(p, rib!, -gr.lining, 'meet') : null;
    let corners: Pt[][] = [];
    for (let [rect, tip] of [[blocks.upperCorner, p.corners!.UCr], [blocks.lowerCorner, p.corners!.LCr]] as const) {
      let trimmed = off?.corners.length ? calcCornerBlockOutline(rect, tip, [...off.bouts, ...off.corners]) : null;
      if (off?.corners.length && !trimmed) s.failures.push(fail('Graduation: a lining doesn\'t meet its corner block once each side, so the block is left square. Bring the lining in less, or resize the block on the mould.', ['lining']));
      let outline = trimmed ?? calcCornerBlockOutline(rect, tip, [])!;
      corners.push(outline, outline.map(q => flipPointAboutY(q)));
    }
    uncut = [defineBlockLoop(neck, 1), defineBlockLoop(end, -1), ...corners.map(q => pathFromPolygon(q))];
    let [neckShape, endShape, ...cornerShapes] = uncut.map(d => intersectionFromTwoPaths(ribLine, d));
    s.blocks = { neck: neckShape, end: endShape, corners: cornerShapes };
    return null;
  });

  let loop = (inset: number, key: 'lining' | 'edgeInset', label: string): string | null => {
    let made = defineChannelLoop(p, rib!, -inset, -inset, edge);
    if (!made.joined) {
      s.failures.push(fail(`Graduation: the ${label} can't be carried round the C bout at these corners. Bring it in less, or open the corners.`, [key]));
      return null;
    }
    if (!made.path) s.failures.push(fail(`Graduation: the ${label} doesn't close into one loop this far in; it has eaten the neck face.`, [key]));
    return made.path;
  };

  solveSection(s.failures, 'Lining', ['lining'], () => {
    if (!(Number.isFinite(gr.lining) && gr.lining > 0)) return fail('Graduation: the lining needs a thickness above 0.', ['lining']);
    let inset = definePurflingPath(p, rib!, -gr.lining);
    if (!inset) return fail('Graduation: the lining is too thick for the corners to take. Bring it in less, or open the corners.', ['lining']);
    // each lining runs along the ribs into a block and stops where it meets it
    s.lining = differenceFromManyPaths(ribLine, [inset, ...uncut]);
    return null;
  });
  solveSection(s.failures, 'Edge inset', ['edgeInset'], () => {
    if (!Number.isFinite(gr.edgeInset)) return fail('Graduation: the edge inset needs a value.', ['edgeInset']);
    let made = loop(gr.lining + gr.edgeInset, 'edgeInset', 'boundary');
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
  // the holes are the contours panel's, read for the field and the map; the bass hole is the
  // treble's mirror, so the two are sampled alike
  let contours = p.fHoleContours ? solveFholeContours(p) : null;
  if (contours?.path) {
    let treble = samplePathToPolyline(contours.path, 0.5, true);
    s.holes = [treble, treble.map(q => new Pt(-q.x, q.y))];
  }
  return s;
}

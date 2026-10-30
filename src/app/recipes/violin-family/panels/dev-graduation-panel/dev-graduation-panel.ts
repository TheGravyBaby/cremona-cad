import { Component, EventEmitter, inject, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { pointInPolygon } from '../../../../helpers/math/simpleGeometry';
import { filletRightAngleCorner } from '../../../../helpers/math/draftMath';
import { pathFromPolyline, pathFromRect, samplePathToPolyline, translatePath } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, closestPointToPolylineIndexed, distPointToPolylineIndexed, minCostAssignment, pointAtPolylineLength, polylineCumulativeLengths, Reading, thinPlateSplineFitter } from '../../../../helpers/math/vibeMath';
import { differenceFromManyPaths, fieldBands, intersectionFromTwoPaths, mirroredLoop } from '../../../../helpers/math/pathVibes';
import { renderFilledPath, renderPath, renderPointHalo, renderSolveFailures, renderText } from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { stepAmountForKey } from '../../../../helpers/stepSize';
import { DraftTool, DraftToolHost } from '../../../../draft-canvas/tools/draft-tool';
import { ToolRegistryService } from '../../../../draft-canvas/tools/tool-registry';
import { IconDirective } from '../../../../icons/icon.directive';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { contrastRatio, PanelPalette, parseHex, ThemeService, toHex } from '../../../../theme/theme.service';
import { Pt, Rectangle } from '../../../../models/types';
import { GraduationParams, GraduationPoint, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { GraduationFailure, GraduationSolve, PlateSurface } from '../../violin-family-solves';
import { familyStandards } from '../../violin-family-seed';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { PLATE_LAYOUT_GAP, purflingPath, ribArcs, RibArcs, solvePlateContour } from '../plate-contour-panel/plate-contour-panel';
import { renderFholePlate } from '../fhole-placement-panel/fhole-placement-panel';
import { solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import { channelLoop } from '../fluting-panel/fluting-panel';
import { bodyLandmarks, loopHalfChordAtY, solveCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { MouldPanel, solveMould } from '../mould-panel/mould-panel';

// Graduation, tried out on localhost only and carried without promise of support. The readings on
// `p.graduation` are treated as a surveyor treats spot heights: a thin-plate spline is fitted through
// them, with the boundary and the f-hole outlines sampled along at known thicknesses as breaklines,
// the spline is read onto a raster, and contours are traced at a fixed interval and filled as bands,
// thin to thick. Under the map lies the ground: the plates each with the rib line inside their edge,
// the top with both holes, the back to its left with the button, as the plate contour lays them out,
// and inside the rib line the neck and end blocks and the two loops the solve makes, the linings'
// inner face and the boundary the graduation starts at. Panel and render first, then the layouts a
// plate's readings start from, the sidebar's plate map, the field and its contours, and the solve.

export const GRADUATION_PLATES = ['top', 'back'] as const;
export type GraduationPlate = typeof GRADUATION_PLATES[number];

const DEFAULT_SPACING = 40;
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
export class DevGraduationPanel implements ViolinFamilyPanel, OnInit, OnDestroy {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showGraduationPoints'];
  protected readonly pal = ThemeService.getPalette('lamplight');
  private readonly tools = inject(ToolRegistryService);

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  readonly plates = GRADUATION_PLATES;
  solve!: GraduationSolve;
  // the grid a Lay Grid lays on each plate; a layout is an action, not a saved setting
  spacing: Record<GraduationPlate, number> = { top: DEFAULT_SPACING, back: DEFAULT_SPACING };
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

  get gr(): GraduationParams {
    return this.params.graduation!;
  }

  // the linings by size class, the gouge held off them by two rib thicknesses, the f-hole thickness
  // at the top's edge thickness, and a coarse grid of readings on each plate
  static seed(p: ViolinFamilyParams): void {
    if (p.graduation || !p.plateContour) return;
    let lining = familyStandards(p.body.height).lining;
    p.graduation = { lining, edgeInset: lining + 2 * p.body.rib, blockMargin: 0, fHoleThickness: edgeThicknessOf(p, 'top'), top: { points: [] }, back: { points: [] } };
    for (let plate of GRADUATION_PLATES) p.graduation[plate].points = gridPoints(p, DEFAULT_SPACING, plate);
  }

  ngOnInit(): void {
    this.draw();
  }

  ngOnDestroy(): void {
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
      return !!ground && pointInPolygon(this.toPlate(pt, plate), ground.loop);
    };
    let joint = mirror ? PLATE_DX[plate](this.params) : null;
    this.pickTool = new PickPointTool(this.pal.ink(4), joint, valid, pt => {
      let at = this.toPlate(pt, plate);
      let x = round(at.x), y = round(at.y), thickness = edgeThicknessOf(this.params, plate);
      // a click on the joint is its own twin
      let xs = mirror && x !== 0 ? [x, -x] : [x];
      for (let px of xs) this.points.push({ x: px, y, thickness });
      this.selected = xs.map((_, i) => this.points.length - xs.length + i);
      this.tools.selectTool(null);
      this.edited();
    }, () => this.tools.selectTool(null));
    this.tools.selectTool(this.pickTool);
  }

  // a canvas point in the plate's own frame, the back drawn beside the top
  private toPlate(pt: Pt, plate: GraduationPlate): Pt {
    return new Pt(pt.x - PLATE_DX[plate](this.params), pt.y);
  }

  edited(): void {
    this.edit.emit();
    this.draw();
  }

  // lays that plate's points out afresh, the zones, a grid at its spacing, or none, and leaves the other's alone
  layout(plate: GraduationPlate, style: 'zones' | 'grid' | 'blank'): void {
    let p = this.params;
    this.gr[plate].points = style === 'zones' ? zonePoints(p, plate) : style === 'grid' ? gridPoints(p, this.spacing[plate], plate) : [];
    if (plate === this.active) this.selected = [];
    this.edited();
  }

  activate(plate: GraduationPlate): void {
    if (plate === this.active) return;
    this.active = plate;
    this.selected = [];
    this.draw();
  }

  // an added point starts on the joint at the boundary's middle, at the edge thickness
  addPoint(): void {
    let ground = this.solve.ground;
    let y = ground ? round((ground.minY + ground.maxY) / 2) : 0;
    this.points.push({ x: 0, y, thickness: edgeThicknessOf(this.params, this.active) });
    this.selected = [this.points.length - 1];
    this.edited();
  }

  removeSelected(): void {
    let plate = this.gr[this.active];
    plate.points = plate.points.filter((_, i) => !this.selected.includes(i));
    this.selected = [];
    this.edited();
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
    let pts = this.gr[plate].points;
    let key = JSON.stringify(pts.map(pt => [pt.x, pt.y]));
    let hit = this.mapCache[plate];
    if (hit?.key === key) return hit.map;
    let map = plateMap(pts, solveGraduation(this.params)?.ground ?? null);
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

  setAll(value: number | null): void {
    if (value === null || !Number.isFinite(value)) return;
    for (let pt of this.picked) pt.thickness = value;
    this.edited();
  }

  // every picked point stepped by the same amount, so a mixed pick keeps its differences
  nudge(delta: number, e?: Event): void {
    e?.preventDefault();
    if (!this.picked.length) return;
    for (let pt of this.picked) pt.thickness = Math.max(0, Math.round((pt.thickness + delta) * 100) / 100);
    this.edited();
  }

  move(dx: number, dy: number, e?: Event): void {
    e?.preventDefault();
    if (!this.picked.length) return;
    for (let pt of this.picked) {
      pt.x = Math.round((pt.x + dx) * 100) / 100;
      pt.y = Math.round((pt.y + dy) * 100) / 100;
    }
    this.edited();
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

  // a folded plate's one line: how many points and their spread
  summary(plate: GraduationPlate): string {
    let pts = this.gr[plate].points;
    if (!pts.length) return 'no points';
    return `${pts.length} pts · ${spread(pts.map(pt => pt.thickness))} mm`;
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
    reportFailures(this.solve.failures, 'Graduation');
  }

  draw(): void {
    let p = this.params;
    this.maps = { top: this.mapOf('top'), back: this.mapOf('back') };
    let all = GRADUATION_PLATES.flatMap(plate => this.gr[plate].points.map(pt => pt.thickness)).filter(Number.isFinite);
    // the boundary reads what the arching left over the flat, which can sit under every point, and
    // the top's holes carry the f-hole thickness
    for (let plate of GRADUATION_PLATES) {
      let field = thicknessField(p, plate);
      if (field) all.push(field.range.lo, field.range.hi);
    }
    let lo = all.length ? Math.floor(Math.min(...all) * 2) / 2 : 0;
    let hi = all.length ? Math.ceil(Math.max(...all) * 2) / 2 : 1;
    this.scale = { lo, hi: Math.max(hi, lo + 1) };
    safeRun(() => {
      let rib = ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
      let solve = this.solve = solveGraduation(p)!;
      this.drawn.emit([
        renderThicknessMap(p, this.scale, this.pal),
        renderFholePlate(p, this.pal, rib, false),
        renderBackPlate(p, this.pal, rib),
        renderGraduation(p, solve, this.pal),
        ...(this.flags.showGraduationPoints ? [renderGraduationPoints(p, this.active, this.selected, this.pal)] : []),
        renderSolveFailures(solve.failures, this.pal.alert, true),
      ]);
    });
  }
}

// the lamplight palette's thin-to-thick inks, after the four the loops take and the points' own
const RAMP = [5, 6, 7, 8, 9];

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
export const renderThicknessMap = (p: ViolinFamilyParams, scale: { lo: number; hi: number }, pal: PanelPalette) => (g: any, ui: any): void => {
  for (let plate of GRADUATION_PLATES) {
    let dx = PLATE_DX[plate](p);
    let bands = thicknessBands(p, plate);
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

const spread = (values: number[]): string => {
  let lo = Math.min(...values), hi = Math.max(...values);
  return lo === hi ? lo.toFixed(1) : `${lo.toFixed(1)}–${hi.toFixed(1)}`;
};

const renderBackPlate = (p: ViolinFamilyParams, pal: PanelPalette, rib: RibArcs | null) => (g: any, ui: any): void => {
  let o = solvePlateContour(p);
  let dx = PLATE_DX.back(p);
  if (o?.back) renderPath(translatePath(o.back, dx, 0), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  if (o?.button) renderPath(translatePath(o.button.path, dx, 0), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  let inner = rib ? purflingPath(p, rib, 0) : null;
  if (inner) renderPath(translatePath(inner, dx, 0), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
};

// the blocks as faint fills, the lining line and the boundary, on both plates, each in its own ink
export const renderGraduation = (p: ViolinFamilyParams, s: GraduationSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  for (let dx of GRADUATION_PLATES.map(plate => PLATE_DX[plate](p))) {
    for (let block of s.blocks ? [s.blocks.neck, s.blocks.end] : []) {
      renderFilledPath(translatePath(block, dx, 0), pal.ink(2), 0.15)(g, ui);
      renderPath(translatePath(block, dx, 0), pal.ink(2), STROKE_WEIGHT.guide)(g, ui);
    }
    if (s.lining) renderPath(translatePath(s.lining, dx, 0), pal.ink(0), STROKE_WEIGHT.guide)(g, ui);
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

// the zones a luthier graduates by, as the fewest points that draw them: an island on the joint
// midway between the corner rows, with a point above and below it on those rows, where it gives
// way to the bouts; for each main bout a dome on the joint at its widest row, a channel zone each side
// along the edge on that row, and a flank each side on the row between the corners and the widest,
// the four flanks fanning out from the island as an X. Each is placed off the boundary's half
// chord at its row, so the zones scale with the outline. Read from the lower bout up
export function zonePoints(p: ViolinFamilyParams, plate: GraduationPlate): GraduationPoint[] {
  let ground = solveGraduation(p)?.ground;
  let marks = new Map(bodyLandmarks(p).map(k => [k.code, k.y]));
  let rows = (['LB', 'LC', 'UC', 'UB'] as const).map(code => marks.get(code));
  if (!ground || rows.some(y => y === undefined)) return [];
  let [LB, LC, UC, UB] = rows as number[];
  let thickness = edgeThicknessOf(p, plate);
  let half = (y: number): number => loopHalfChordAtY(ground.loop, y) ?? 0;
  let at = (x: number, y: number, label: string): GraduationPoint => ({ x: round(x), y: round(y), thickness, label });
  let pair = (x: number, y: number, label: string): GraduationPoint[] => [at(-x, y, `${label} bass`), at(x, y, `${label} treble`)];
  let points: GraduationPoint[] = [];
  for (let [name, bout, corner] of [['Lower', LB, LC], ['Upper', UB, UC]] as const) {
    let flankY = (bout + corner) / 2;
    points.push(
      ...pair(ZONE.channel * half(bout), bout, `${name} channel`),
      at(0, bout, `${name} dome`),
      ...pair(ZONE.flank * half(flankY), flankY, `${name} flank`),
    );
  }
  // the island's middle sits midway between the corner rows, not on the waist, which can lie off
  // it; a point at each end makes the three one island
  points.push(at(0, LC, 'Island lower'), at(0, (LC + UC) / 2, 'Island'), at(0, UC, 'Island upper'));
  return points
    .filter(pt => pointInPolygon(new Pt(pt.x, pt.y), ground.loop))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

// where the channel and flank zones sit, as shares of the half chord at their row
const ZONE = { channel: 0.82, flank: 0.55 };

// a lattice `spacing` apart, one column on the joint and the rows centred on the boundary, kept to
// the points inside it and off the top's holes, where there is no wood to read, read top to bottom
// and bass to treble. Empty until the boundary solves
export function gridPoints(p: ViolinFamilyParams, spacing: number, plate: GraduationPlate): GraduationPoint[] {
  let solve = solveGraduation(p);
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
// readings: the points, and the boundary and each f-hole outline sampled along at their own
// thicknesses, as a surveyor fixes a breakline. In a hole it is the f-hole thickness, what its wings
// carry. Outside the boundary it is the land's. `interpolated` is the spline alone, unclamped and
// defined everywhere, for the raster to read; `edgeAt` is the land's reading at the boundary's
// nearest point
export interface ThicknessField {
  at(x: number, y: number): number;
  interpolated(x: number, y: number): number;
  edgeAt(x: number, y: number): number;
  edge: number;
  range: { lo: number; hi: number };
  loop: Pt[];
}

// how far apart the boundary and the hole outlines are sampled; the holes closer, since a wing's
// outline turns tight and its thickness can stand well off its neighbours'
const BOUNDARY_STEP = 10;
const HOLE_STEP = 2;
// two readings nearer than this are one spot to the spline; the first stands
const SAME_SPOT = 0.5;

const fieldCache: Partial<Record<GraduationPlate, { solve: GraduationSolve; key: string; field: ThicknessField }>> = {};
// the sites stand while thicknesses are typed, so the spline's factors are kept against them
const fitterCache: Partial<Record<GraduationPlate, { sites: string; fit: ReturnType<typeof thinPlateSplineFitter> }>> = {};

export function thicknessField(p: ViolinFamilyParams, plate: GraduationPlate): ThicknessField | null {
  let solve = solveGraduation(p);
  let s = p.graduation;
  if (!solve?.ground || !s) return null;
  let edge = edgeThicknessOf(p, plate);
  let points = s[plate].points.filter(pt => Number.isFinite(pt.thickness));
  let holes = plate === 'top' && Number.isFinite(s.fHoleThickness) ? solve.holes : [];
  let key = JSON.stringify([edge, p.fluting, p.arching?.[plate], s.fHoleThickness, points.map(pt => [pt.x, pt.y, pt.thickness])]);
  let hit = fieldCache[plate];
  if (hit && hit.solve === solve && hit.key === key) return hit.field;
  let { loop } = solve.ground;
  let land = landOf(plate, loop, solveCrossArching(p)?.[plate] ?? null, edge);
  // the points first, so a sample landing on one gives way to it
  let readings: Reading[] = [];
  for (let r of [
    ...points.map(pt => ({ x: pt.x, y: pt.y, v: pt.thickness })),
    ...sampleLoop(loop, BOUNDARY_STEP).map(q => ({ x: q.x, y: q.y, v: land.atBoundary(q.x, q.y) })),
    ...holes.flatMap(hole => sampleLoop(hole, HOLE_STEP).map(q => ({ x: q.x, y: q.y, v: s.fHoleThickness }))),
  ]) {
    if (!readings.some(q => Math.hypot(q.x - r.x, q.y - r.y) < SAME_SPOT)) readings.push(r);
  }
  let sites = JSON.stringify(readings.map(r => [r.x, r.y]));
  let fit = fitterCache[plate]?.sites === sites ? fitterCache[plate]!.fit : thinPlateSplineFitter(readings);
  fitterCache[plate] = { sites, fit };
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
  fieldCache[plate] = { solve, key, field };
  return field;
}

// the land: the flat outside the boundary, left uncarved, so its thickness is whatever the outer
// surface stands at over it, the edge thickness where the edge is, less wherever the fluting channel
// dips, more where the arch has risen. `atBoundary` is that reading at the boundary's nearest point,
// so where the gouge takes off it is the wood that is really there, not the edge thickness
interface Land {
  at(x: number, y: number): number;
  atBoundary(x: number, y: number): number;
}

// the surface read at every vertex of the boundary is the slow part (a row solve per vertex), and
// no point edit moves it: kept against the loop and surface the solves hand back, which hold between edits
const landCache: Partial<Record<GraduationPlate, { loop: Pt[]; surface: PlateSurface | null; edge: number; land: Land }>> = {};

function landOf(plate: GraduationPlate, loop: Pt[], surface: PlateSurface | null, edge: number): Land {
  let kept = landCache[plate];
  if (kept && kept.loop === loop && kept.surface === surface && kept.edge === edge) return kept.land;
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
  let land = { at, atBoundary };
  landCache[plate] = { loop, surface, edge, land };
  return land;
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
// blank, so the bands stack from thin to thick. The field itself still answers in a hole
export const CONTOUR_INTERVAL = 0.25;
const RASTER_COLUMNS = 80;
// the clip needs no finer a loop than the raster; cutting to the boundary as sampled costs four times as much
const CLIP_STEP = 2;
const bandCache: Partial<Record<GraduationPlate, { field: ThicknessField; bands: { level: number; polygons: Pt[][][] }[] }>> = {};

export function thicknessBands(p: ViolinFamilyParams, plate: GraduationPlate): { level: number; polygons: Pt[][][] }[] {
  let field = thicknessField(p, plate);
  if (!field) return [];
  let hit = bandCache[plate];
  if (hit?.field === field) return hit.bands;
  let solve = solveGraduation(p)!;
  let box = solve.ground!;
  let cell = Math.max(1, (box.maxX - box.minX) / RASTER_COLUMNS);
  let levels: number[] = [];
  for (let k = Math.floor(field.range.lo / CONTOUR_INTERVAL); k * CONTOUR_INTERVAL <= field.range.hi; k++) levels.push(k * CONTOUR_INTERVAL);
  let holes = plate === 'top' ? solve.holes.map(hole => sampleLoop(hole, CLIP_STEP)) : [];
  let bands = fieldBands(field.interpolated, box, cell, levels, sampleLoop(field.loop, CLIP_STEP), holes);
  bandCache[plate] = { field, bands };
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
// inside the rib line itself. The last answer is kept against the params the loops read (the joins
// are the slow part, as in the fluting), so a point edit never re-solves them
let last: { key: string; solve: GraduationSolve } | null = null;

export function solveGraduation(p: ViolinFamilyParams): GraduationSolve | null {
  let gr = p.graduation;
  if (!gr || !p.plateContour || !p.corners || !p.bouts) return null;
  let key = JSON.stringify([p.body, p.bouts, p.corners, p.plateContour, p.fHoles, p.fHoleContours, gr.lining, gr.edgeInset, gr.blockMargin]);
  if (last?.key === key) return last.solve;
  let solve = solveGraduationUncached(p, gr);
  last = { key, solve };
  return solve;
}

function solveGraduationUncached(p: ViolinFamilyParams, gr: GraduationParams): GraduationSolve {
  let s: GraduationSolve = { blocks: null, lining: null, boundary: null, ground: null, holes: [], failures: [] };
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
  // the holes are the contours panel's, read for the field and the map; the bass hole is the
  // treble's mirror, so the two are sampled alike
  let contours = p.fHoleContours ? solveFholeContours(p) : null;
  if (contours?.path) {
    let treble = samplePathToPolyline(contours.path, 0.5, true);
    s.holes = [treble, treble.map(q => new Pt(-q.x, q.y))];
  }
  return s;
}

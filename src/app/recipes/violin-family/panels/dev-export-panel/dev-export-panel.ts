import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { buildGcode, downloadGcodeFile } from '../../../../helpers/gcodeExporter';
import { angleFromCenter, angleWithinSweep, closestPointOnSegment, dist, flipPointAboutY, normalizeRadians, pointInPolygon, pointOnCircle, signedPolygonArea, TURN } from '../../../../helpers/math/simpleGeometry';
import { Matrix2D, pathFromPolyline, pathsBounds, samplePathToPolyline, transformPath } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed, polylineCumulativeLengths, simplifyPolyline3D } from '../../../../helpers/math/vibeMath';
import { erodePolygon, flattenPath, offsetPath } from '../../../../helpers/math/pathVibes';
import { inchFraction } from '../../../../helpers/nearestFraction';
import { renderCrosshair, renderPath, renderRect, renderText, renderTranslatedLayers } from '../../../../helpers/renderFuncs';
import { Arc, Circle, Pt, Pt3D, Rectangle } from '../../../../models/types';
import { info } from '../../../../shared/message-emitter';
import { MmInchField } from '../../../../shared/mm-inch-field';
import { DASH, STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import { Bit, CRADLE, CradleSettings, CradleSpec, DEFAULT_SETTINGS, DevExportSettings, EXPORTS, FHOLE, FholeSettings, Feeds, MACHINE, MACHINE_HELP, MOULD_TABS, PLATE_TABS, PlateSettings, PREVIEW_GRID, readSettings, SCROLL, ScrollSettings, Stage, STAGE_SHAPE, StageKey, stageOf, STOCK_OF, StockSettings, SURFACE, Tool, toolFor, TOOLS, ToolShape, Wood, writeSettings } from './dev-export-shop';
import { Bounds, boundsOf, centreInSheet, climbingLoop, emptyToolpaths, evenStations, fail, gcodeJob, jobNotes, placeInSheet, serpentine, SHEET_MARGIN, tabsAlong, terrainGrid, tipHeights, Toolpaths, withTabs } from './dev-export-toolpaths';
import { FholeContoursSolve, MouldRelief, MouldSolve, NeckSolve, PlateContourSolve, Plate, PlateSurface, ScrollSolve } from '../../violin-family-solves';
import { buildSurfaceContours, calcContourSampleSteps, rowAt, solveCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { BACK_ARCH_INK, CHANNEL_INK, TOP_ARCH_INK } from '../long-arching-panel/long-arching-panel';
import { MOULD_EXPORT_STEP, renderMould, solveMould } from '../mould-panel/mould-panel';
import { definePurflingPath, solvePlateContour } from '../plate-contour-panel/plate-contour-panel';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { solveCenterBout, solveRibArcs } from '../center-bout-panel/center-bout-panel';
import { defineFholePath, solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import { calcScrollOnNeck, solveNeck } from '../neck-panel/neck-panel';
import { solveScroll } from '../pegbox-panel/pegbox-panel';

// G-code for the maker's own machine, offered on localhost only: the files drive a CNC, and nobody
// else's machine is ours to answer for. The recipe names this panel only inside @defer, so a
// visitor's browser never fetches it. Not a CAM program: each export is one thing the shop cuts
// from the recipe (the mould; a plate's arching, purfling channel and contour; the cradle the plate
// is turned over into; the top's f-holes cut in that cradle; scrolls and fingerboards to come),
// planned by code that knows that part, with the user saying only what the stock is and whether
// the wood is hard. The plate, its purfling and its contour are one setup, in that order: all read
// the plate's blank and where the plate sits in it, so every file agrees, and the contour comes
// last since the waste round it is what holds the blank down. The cradle is its own slab. The
// shop's settings, constants and bits are in dev-export-shop.ts; what the planners share, in
// dev-export-toolpaths.ts. This file holds the component, the plan per export and its renders.
//
// Adding an export: a row in EXPORTS and STOCK_OF, a bit slot in StageKey if it takes its own, and
// a case in planExport that solves the part, plans its toolpaths and lists its layers. The sheet,
// the tabs' lifts and the writer are shared, and the plan the panel shows is the file's own header

const MIRROR: Matrix2D = [-1, 0, 0, 1, 0, 0];

@Component({
  selector: 'app-vf-dev-export-panel',
  imports: [FormsModule, MmInchField],
  templateUrl: './dev-export-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class DevExportPanel extends PanelComponentBase {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = [];
  protected readonly pal = ThemeService.getPalette('classicCremona');
  protected readonly fhole = FHOLE;
  protected readonly stageShape = STAGE_SHAPE;
  protected readonly exports = EXPORTS;

  @Input() fileName = '';

  settings: DevExportSettings = readSettings();
  // what the last draw planned; the template reads its failures
  toolpaths: Toolpaths | null = null;

  // a shop setting: stored here, never on the recipe, so it never reaches the undo stack
  saveSettingsAndRedraw(): void {
    writeSettings(this.settings);
    this.drawCanvas();
  }

  // the bit is the mould panel's param (its reliefs are cut for it), so changing it here is a
  // recipe edit like any other
  setBit(diameter: number): void {
    if (!this.params.mould) return;
    this.params.mould.bitDiameter = diameter;
    this.recordEditAndRedraw();
  }

  showMachineHelp(): void {
    info(MACHINE_HELP.text, MACHINE_HELP.title, 60000, true);
  }

  reportSolveFailures(): void {}

  protected buildCanvasLayers(): RenderLayer[] {
    let bit = this.bit;
    let plan = bit ? planExport(this.params, this.settings, bit, this.pal, this.flags) : null;
    this.toolpaths = plan?.toolpaths ?? null;
    return plan ? [inSheet(plan.toolpaths, plan.layers)] : [];
  }

  // the open job's stock
  get g(): StockSettings {
    return this.settings[STOCK_OF[this.settings.job]];
  }

  // cut in the plate's blank: the plate, its purfling and its contour
  get onBlank(): boolean {
    return STOCK_OF[this.settings.job] === 'plate';
  }

  // held in the cradle's slab: the cradle itself and the f-holes
  get inCradle(): boolean {
    return STOCK_OF[this.settings.job] === 'cradle';
  }

  get blank(): PlateSettings {
    return this.settings.plate;
  }

  get cradle(): CradleSettings {
    return this.settings.cradle;
  }

  get fholes(): FholeSettings {
    return this.settings.fholes;
  }

  get scroll(): ScrollSettings {
    return this.settings.scroll;
  }

  get isScroll(): boolean {
    return this.settings.job === 'scroll';
  }

  // the settings naming the plate the job is cut to
  get cutTo(): PlateSettings | CradleSettings {
    return this.onBlank ? this.blank : this.cradle;
  }

  // the wood the bit meets: the f-holes cut the plate, not the slab it sits in
  get wood(): Wood {
    return this.settings.job === 'fholes' ? this.blank.wood : this.g.wood;
  }

  get bitDiameter(): number {
    return this.params.mould?.bitDiameter ?? NaN;
  }

  get stage(): StageKey | null {
    return stageOf(this.settings);
  }

  toolsFor(shape: ToolShape): Tool[] {
    return TOOLS.filter(t => t.shape === shape);
  }

  get tool(): Tool | null {
    let stage = this.stage;
    if (!stage) return toolFor(this.bitDiameter);
    return TOOLS.find(t => t.number === this.settings.tools[stage]) ?? null;
  }

  get feeds(): Feeds | null {
    return this.tool?.feeds[this.wood] ?? null;
  }

  get bit(): Bit | null {
    if (!this.stage) return { diameter: this.bitDiameter, shape: 'flat', feeds: this.feeds };
    let tool = this.tool;
    return tool ? { diameter: tool.diameter, shape: tool.shape, angle: tool.angle, feeds: this.feeds } : null;
  }

  // the plan as the file's header will say it
  get notes(): string[] {
    return this.feeds && this.toolpaths ? jobNotes(this.toolpaths, this.feeds) : [];
  }

  get canDownload(): boolean {
    return !!this.feeds && !!this.toolpaths && !this.toolpaths.failures.length;
  }

  reset(): void {
    this.settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), job: this.settings.job };
    this.saveSettingsAndRedraw();
  }

  // planned again from the fine solve the sheets export from, not the preview's
  download(): void {
    let tool = this.tool, feeds = this.feeds, bit = this.bit;
    if (!tool || !feeds || !bit) return;
    let plan = planExport(this.params, this.settings, bit, this.pal, this.flags, true);
    if (!plan || plan.toolpaths.failures.length) return;
    let text = buildGcode(gcodeJob(plan.toolpaths, tool, feeds));
    let job = this.settings.job;
    let part = job === 'plate' ? `plate-${this.blank.plate}-${this.blank.stage}` : job === 'cradle' ? `cradle-${this.cradle.plate}-${this.cradle.stage}` : job === 'fholes' ? `fholes-${this.fholes.stage}` : job === 'scroll' ? `scroll-${this.scroll.side}` : job === 'mould' ? job : `${job}-${this.blank.plate}`;
    downloadGcodeFile(`${this.fileName.trim() || 'violin-family'}-${part}.nc`, text);
  }
}

export interface ExportPlan {
  toolpaths: Toolpaths;
  // what the canvas shows for this job, in world coordinates: inSheet shifts them onto the sheet
  layers: RenderLayer[];
}

// one case per export: solve the part (finely for the file, coarsely for the preview), plan its
// toolpaths and say what to draw. Null when the recipe has not reached that part yet
export function planExport(p: ViolinFamilyParams, settings: DevExportSettings, bit: Bit, pal: PanelPalette, flags: ViolinFamilyViewFlags, fine = false): ExportPlan | null {
  let { plate: b, cradle: c } = settings;
  switch (settings.job) {
    case 'mould': {
      let s = fine ? solveMould(p, MOULD_EXPORT_STEP) : solveMould(p);
      if (!s) return null;
      let toolpaths = mouldToolpaths(s, bit.diameter, settings.mould);
      return { toolpaths, layers: [renderMould(s, pal, flags), renderSheet(toolpaths, settings.mould, pal), renderToolpaths(toolpaths, pal)] };
    }
    case 'plate': {
      let surface = solveCrossArching(p)?.[b.plate];
      if (!surface) return null;
      let toolpaths = archingToolpaths(p, surface, bit, b, fine);
      return { toolpaths, layers: [renderOutline(surface, pal), renderArching(p, surface, b.plate, toolpaths, pal), renderSeam(b, toolpaths, pal), renderSheet(toolpaths, b, pal)] };
    }
    case 'purfling': {
      let surface = solveCrossArching(p)?.[b.plate];
      let o = solvePlateContour(p);
      if (!surface || !o?.purfling) return null;
      let toolpaths = purflingToolpaths(p, surface, bit, b, fine);
      return { toolpaths, layers: [renderOutline(surface, pal), renderLines([o.purfling, o.outerPurfling], pal), renderToolpaths(toolpaths, pal), renderSeam(b, toolpaths, pal), renderSheet(toolpaths, b, pal)] };
    }
    case 'contour': {
      let surface = solveCrossArching(p)?.[b.plate];
      let o = solvePlateContour(p);
      if (!surface || !o) return null;
      let toolpaths = contourToolpaths(p, surface, o, bit, b);
      return { toolpaths, layers: [renderOutline(surface, pal), renderToolpaths(toolpaths, pal), renderSeam(b, toolpaths, pal), renderSheet(toolpaths, b, pal)] };
    }
    case 'cradle': {
      let surface = solveCrossArching(p)?.[c.plate];
      let o = solvePlateContour(p);
      if (!surface || !o) return null;
      let toolpaths = cradleToolpaths(p, surface, o, bit, c);
      return { toolpaths, layers: [renderOutline(surface, pal), renderHole(o, c.plate, pal), renderToolpaths(toolpaths, pal), renderSheet(toolpaths, c, pal)] };
    }
    case 'fholes': {
      let arching = solveCrossArching(p);
      let surface = arching?.top, seat = arching?.[c.plate];
      let o = solvePlateContour(p);
      let s = p.fHoleContours ? solveFholeContours(p) : null;
      if (!surface || !seat || !o || !s?.path) return null;
      let toolpaths = fholeToolpaths(p, s, surface, seat, o, bit, c, settings.fholes, fine);
      return { toolpaths, layers: [renderOutline(surface, pal), renderHole(o, c.plate, pal), renderLines([s.path, defineFholePath(p, s, true)], pal), renderToolpaths(toolpaths, pal), renderSheet(toolpaths, c, pal)] };
    }
    case 'scroll': {
      let n = solveNeck(p), s = solveScroll(p);
      if (!n?.heel || !s?.S0 || !s.nape || !s.F1) return null;
      let g = settings.scroll;
      let toolpaths = scrollToolpaths(p, n, s, bit, g, fine);
      let outline = sideOutline(p, n, s).d;
      return { toolpaths, layers: [renderLines([g.side === 'left' ? outline : transformPath(outline, MIRROR)], pal), renderToolpaths(toolpaths, pal), renderSheet(toolpaths, g, pal)] };
    }
  }
}

// the panel drawn in the machine's coordinates: shifted by the sheet offset, so the canvas origin
// is the file's XY zero and a point read off the canvas is the X and Y the file sends
export const inSheet = (tp: Toolpaths, layers: RenderLayer[]): RenderLayer => renderTranslatedLayers(layers, tp.sheetOffset.x, tp.sheetOffset.y);

// the stock as the machine sees it, drawn round the part: its outline dashed, its size written
// above it in both units, the XY zero marked; where the stock sits in a harness, the zero is the
// harness's own and the fences are drawn as the L the stock is pushed into. In the alert ink when
// the plan has something to say. In world coordinates, like the part: inSheet shifts both
export const renderSheet = (tp: Toolpaths, g: StockSettings, pal: PanelPalette) => (gr: any, ui: any): void => {
  let { width: w, length: l } = g.stock;
  if (!(w > 0 && l > 0)) return;
  let zero = { x: -tp.sheetOffset.x, y: -tp.sheetOffset.y };
  let origin = { x: zero.x + tp.stockOrigin.x, y: zero.y + tp.stockOrigin.y };
  let color = tp.failures.length ? pal.alert : pal.neutral;
  renderRect(new Rectangle(origin, { x: origin.x + w, y: origin.y + l }), color, 'none', STROKE_WEIGHT.guide, DASH.guide)(gr, ui);
  let inches = (mm: number) => inchFraction(mm / 25.4).replace(/^≈\s*/, '');
  renderText({ x: origin.x + w / 2, y: origin.y + l + 6 }, `${w} × ${l} mm  (${inches(w)}" × ${inches(l)}")`, color, SHEET_LABEL_SIZE)(gr, ui);
  if (tp.fixture) renderPath(transformPath(tp.fixture, [1, 0, 0, 1, zero.x, zero.y]), pal.neutral, STROKE_WEIGHT.section)(gr, ui);
  else if (tp.stockOrigin.x || tp.stockOrigin.y) {
    let reach = 20;
    renderPath(`M ${origin.x + w + reach} ${zero.y} L ${zero.x} ${zero.y} L ${zero.x} ${origin.y + l + reach}`, pal.neutral, STROKE_WEIGHT.section)(gr, ui);
    renderText({ x: zero.x - 6, y: origin.y + l + reach }, 'fence', pal.neutral, SHEET_LABEL_SIZE, -90)(gr, ui);
  }
  renderCrosshair(zero, color, 6, STROKE_WEIGHT.guide, 1, true, 1)(gr, ui);
  renderText({ x: zero.x + 10, y: zero.y - 6 }, 'X0 Y0', color, SHEET_LABEL_SIZE)(gr, ui);
};

const SHEET_LABEL_SIZE = 5;

// the cutter's centre lines, faint: a loop with its tabs as halos where the bit stays up, a
// surface run as it lies. In the alert ink when the plan has something to say
export const renderToolpaths = (tp: Toolpaths, pal: PanelPalette) => (g: any, ui: any): void => {
  let ink = tp.failures.length ? pal.alert : pal.ink(3);
  for (let path of tp.paths) {
    renderPath(pathFromPolyline(path.loop), ink, STROKE_WEIGHT.guide, 0.5)(g, ui);
    for (let tab of path.tabs) renderPath(pathFromPolyline(tab.pts), ink, STROKE_WEIGHT.focusHalo, 0.6)(g, ui);
  }
  for (let run of tp.surfaces) renderPath(pathFromPolyline(run.pts), ink, STROKE_WEIGHT.guide, 0.6)(g, ui);
};

// the plate's outline as the Cross Arching panel maps it
export const renderOutline = (surface: PlateSurface, pal: PanelPalette) => (gr: any, ui: any): void => {
  renderPath(pathFromPolyline(surface.outline, true), pal.neutral, STROKE_WEIGHT.guide, 0.8)(gr, ui);
};

// lines of the drawing the cut is set out from: the purfling's edges, the f-holes
export const renderLines = (ds: (string | null)[], pal: PanelPalette) => (gr: any, ui: any): void => {
  for (let d of ds) if (d) renderPath(d, pal.neutral, STROKE_WEIGHT.guide, 0.8)(gr, ui);
};

// the cradle's hole, the lip's inner edge, dashed
export const renderHole = (o: PlateContourSolve, plate: Plate, pal: PanelPalette) => (gr: any, ui: any): void => {
  let hole = o[plate] && insideOutline(o[plate]!, CRADLE.lip);
  if (hole) renderPath(hole, pal.neutral, STROKE_WEIGHT.guide, 0.8, DASH.guide)(gr, ui);
};

// the plate's contours as the Cross Arching panel maps them, under the raster's lines
export const renderArching = (p: ViolinFamilyParams, surface: PlateSurface, plate: Plate, tp: Toolpaths, pal: PanelPalette) => (gr: any, ui: any): void => {
  let ink = pal.ink(plate === 'top' ? TOP_ARCH_INK : BACK_ARCH_INK);
  let { stepMm, gridMm } = calcContourSampleSteps(p, p.arching![plate].long.height);
  for (let { level, rings } of buildSurfaceContours(p, surface, stepMm, gridMm).levels) {
    let d = rings.map(ring => `M ${ring.map(pt => `${pt.x} ${pt.y}`).join(' L ')} Z`).join(' ');
    renderPath(d, level <= 0 ? pal.ink(CHANNEL_INK) : ink, STROKE_WEIGHT.guide, level <= 0 ? 0.9 : 0.7)(gr, ui);
  }
  let raster = tp.raster;
  if (!raster) return;
  let color = tp.failures.length ? pal.alert : pal.ink(3);
  for (let x of raster.xs) renderPath(`M ${x} ${raster.yMin} L ${x} ${raster.yMax}`, color, STROKE_WEIGHT.guide, 0.25)(gr, ui);
};

// the blank's seam, where the user measured it
export const renderSeam = (g: PlateSettings, tp: Toolpaths, pal: PanelPalette) => (gr: any, ui: any): void => {
  let seamX = tp.stockOrigin.x + g.seam - tp.sheetOffset.x;
  let yLow = tp.stockOrigin.y - tp.sheetOffset.y, yHigh = yLow + g.stock.length;
  renderPath(`M ${seamX} ${yLow} L ${seamX} ${yHigh}`, pal.neutral, STROKE_WEIGHT.guide, 0.8, DASH.preview)(gr, ui);
  renderText({ x: seamX, y: yHigh - 8 }, 'seam', pal.neutral, SHEET_LABEL_SIZE)(gr, ui);
};


// the mould's toolpaths: the windows shrunk by the bit's radius, the outline grown by it, each
// walked the climbing way round from a point between two tabs. Every loop's stations are set out
// evenly from where it crosses the centre line at the top, so the tabs come out mirrored: the
// outline's ends are block notches, so its stations sit between them, out on the bouts; a
// window's long edges are its top and bottom, so its stations start there. Windows come before the outline, so
// the mould stays held. A notch's relief is not offset (the circle grown by the bit is a sliver
// no sampling follows) but cut as a dog-bone: the edges run to the corner, the bit presses in
// along the diagonal as far as the drawn relief reaches, and comes back out
export function mouldToolpaths(s: MouldSolve, bitDiameter: number, g: StockSettings, tabs = MOULD_TABS, machine = MACHINE): Toolpaths {
  let bed = -g.stock.thickness;
  let out = emptyToolpaths(0, bed - machine.overcut, [
    `Z0 = SHEET TOP, spoilboard Z${bed.toFixed(3)}`,
    `XY0 = SHEET LOWER LEFT, sheet ${g.stock.width} x ${g.stock.length}`,
    `Stock ${g.stock.thickness} mm, ${g.wood} wood`,
  ]);
  if (!s.outline) return fail(out, 'The mould has to solve first.');
  if (!(bitDiameter > 0)) return fail(out, 'The bit diameter has to be above 0.');
  let r = bitDiameter / 2;
  s.clampBox.forEach((window, i) => {
    let d = offsetPath(window, -r);
    if (d) out.paths.push(withTabs(`Window ${i + 1}`, climbingLoop(d, 'inside'), evenStations(tabs.window, 0), machine.tabWidth, out.failures));
    else fail(out, `Window ${i + 1} is too narrow for the bit.`);
  });
  let d = offsetPath(s.notchOutline ?? s.outline, r);
  if (!d) return fail(out, 'The outline would not offset for the bit.');
  out.paths.push(withTabs('Outline', climbingLoop(d, 'outside', ring => withDogBones(ring, s.reliefs, r)), evenStations(tabs.outline, 0.5), machine.tabWidth, out.failures));
  out.tabTop = bed + machine.tabHeight;
  out.notes.push(`Windows then the outline, through the sheet by ${machine.overcut}; ${tabs.outline} tabs on the outline and ${tabs.window} per window, ${machine.tabHeight} high`);
  let b = pathsBounds(out.paths.map(path => pathFromPolyline(path.loop)));
  centreInSheet(out, { minX: b.minX - r, maxX: b.maxX + r, minY: b.minY - r, maxY: b.maxY + r }, g);
  return out;
}

// the dog-bones spliced into the ring: at each relief the offset edges meet at a corner point the
// ring passes through; the press goes from there to where the bit reaches as far as the relief
function withDogBones(ring: Pt[], reliefs: MouldRelief[], r: number): Pt[] {
  let splices = new Map<number, Pt[]>();
  for (let { corner, inward, reach } of reliefs) {
    let corner_ = { x: corner.x + inward.x * r * Math.SQRT2, y: corner.y + inward.y * r * Math.SQRT2 };
    let press = { x: corner.x + inward.x * (r - reach), y: corner.y + inward.y * (r - reach) };
    let best = { i: -1, d: Infinity };
    for (let i = 0; i < ring.length; i++) {
      let d = closestPointOnSegment(corner_, ring[i], ring[(i + 1) % ring.length]).dist;
      if (d < best.d) best = { i, d };
    }
    if (best.d > 1) continue;
    splices.set(best.i, [corner_, press, corner_]);
  }
  if (!splices.size) return ring;
  // a ring vertex on the corner itself would double it, so repeats are skipped
  let out: Pt[] = [];
  let push = (pt: Pt) => {
    if (!out.length || dist(out[out.length - 1], pt) > 1e-6) out.push(pt);
  };
  ring.forEach((pt, i) => {
    push(pt);
    splices.get(i)?.forEach(push);
  });
  if (out.length > 1 && dist(out[0], out[out.length - 1]) < 1e-6) out.pop();
  return out;
}

// a plate's arching: the surface the Cross Arching panel solves, carved from a blank lying joint
// face down, in lines along the length over an area a skirt past the outline. The height field is
// the plate's surface over the bed (its edge thickness up, so the land is flat at that height and
// the dome stands above it), flat beyond the outline. Roughing with a flat bit goes in terraces,
// each a step down from the last, the bit riding at the terrace or over whatever stands above it
// plus the leave, so a terrace never takes more than one step; lines the blank's roof does not
// reach are skipped. Finishing with a ball bit is one pass, the tip held wherever the ball would
// first touch the surface across its width. Either way the lines are joined end to end into one
// run, so the bit lifts once per terrace
export function archingToolpaths(p: ViolinFamilyParams, surface: PlateSurface, bit: Bit, g: PlateSettings, fine = false, grid = fine ? SURFACE.grid : PREVIEW_GRID): Toolpaths {
  let thickness = p.arching![g.plate].thickness;
  let out = plateToolpaths(p, surface, g, g.stage === 'rough' ? 'arching roughing' : 'arching finishing', bit);
  if (g.stage === 'rough' && bit.shape !== 'flat') fail(out, 'Roughing takes a flat bit.');
  if (g.stage === 'finish' && bit.shape !== 'ball') fail(out, 'Finishing takes a ball bit.');
  if (out.failures.length) return out;
  let { seamX, roof } = blankRoof(g, out);
  return surfacing(out, {
    area: carvedArea(surface),
    roof,
    top: g.stock.thickness,
    roughFloor: thickness + SURFACE.leave,
    rowZ: y => {
      let row = rowAt(surface, y);
      return x => thickness + (surfaceZAt(surface, x, y, row) ?? 0);
    },
    proud: (x, z, roofZ) => `The blank is too thin: ${Math.abs(x - seamX).toFixed(0)} mm off the seam the surface stands ${z.toFixed(1)} mm and the blank ${roofZ.toFixed(1)} mm.`,
  }, bit, g.stage, fine, grid);
}

// said by the files that start in the land the arching leaves: run on a blank still carrying its
// wedge, the bit would bury itself to the roof on the first pass
export const SURFACED_PLATE = 'EXPECTS A SURFACED PLATE: run the arching files first.';

// what the plate's stages share: the blank, its zero, the plate centred in it by the one carved
// area, and the checks on the blank and the bit
function plateToolpaths(p: ViolinFamilyParams, surface: PlateSurface, g: PlateSettings, stage: string, bit: Bit): Toolpaths {
  let thickness = p.arching![g.plate].thickness;
  let out = emptyToolpaths(g.stock.thickness, thickness, [
    `Z0 = BED, the blank's joint face; blank top at the seam Z${g.stock.thickness.toFixed(3)}`,
    `XY0 = HARNESS ZERO, fences at X${g.fence.x} Y${g.fence.y}, blank ${g.stock.width} x ${g.stock.length} in their corner, seam ${g.seam} from its left edge`,
    `Blank ${g.stock.thickness} mm at the seam, ${g.stock.edge} mm at the edges, ${g.wood} wood`,
    `${g.plate === 'top' ? 'Top' : 'Back'} plate, ${stage}; edge thickness Z${thickness.toFixed(3)}`,
  ]);
  if (!(bit.diameter > 0)) fail(out, 'The bit diameter has to be above 0.');
  if (!(g.stock.edge > 0 && g.stock.edge <= g.stock.thickness)) fail(out, 'The blank\'s edge has to be between 0 and its seam thickness.');
  if (!(g.seam > 0 && g.seam < g.stock.width)) fail(out, 'The seam has to lie within the blank\'s width.');
  // the plate's centre line on the seam, the plate centred along the blank
  let area = carvedArea(surface);
  placeInSheet(out, area, g, { x: g.seam, y: g.stock.length / 2 - (area.minY + area.maxY) / 2 }, g.fence);
  return out;
}

// the outline's bounds a skirt out, the same for every stage so the plate sits in the blank the
// same way in each file
function carvedArea(surface: PlateSurface): Bounds {
  return boundsOf(surface.outline, SURFACE.skirt);
}

// the blank's roof, from the seam out to each long edge: the two halves need not be the same width
function blankRoof(g: PlateSettings, tp: Toolpaths): { seamX: number; roof: (x: number) => number } {
  let seamX = tp.stockOrigin.x + g.seam - tp.sheetOffset.x;
  let fall = g.stock.thickness - g.stock.edge;
  return { seamX, roof: x => g.stock.thickness - (fall * Math.abs(x - seamX)) / (x < seamX ? g.seam : g.stock.width - g.seam) };
}

// a line inside the plate's outline: the outline itself brought in while its corner cutoffs and
// the button allow (a few millimetres), past that the outline eroded, which cannot fold. Null once
// nothing is left. The erosion is slow enough to keep, since the preview asks again on every edit
// of a shop setting while the outline stands still
const insideCache = new Map<string, string | null>();

function insideOutline(outline: string, distance: number): string | null {
  let key = `${distance}|${outline}`;
  let hit = insideCache.get(key);
  if (hit !== undefined) return hit;
  let d = offsetPath(outline, -distance);
  if (!d) {
    let ring = erodePolygon(flattenPath(outline, 0.5)[0] ?? [], distance);
    d = ring && pathFromPolyline(ring, true);
  }
  if (insideCache.size > 24) insideCache.delete(insideCache.keys().next().value!);
  insideCache.set(key, d);
  return d;
}

// the cradle: a pocket of the plate's outline in the slab, a hair clear of it and `wall` deep, its
// floor a lip the plate's land rests on either way up, and inside the lip a hole through the slab
// for the crown to hang in face down. The pocket is loops of the outline brought in, clockwise, from
// the wall to the lip's inner edge, a half bit apart, the wall last so its side is a light cut; the
// hole is the lip's inner edge brought in a radius, cut through with tabs as a mould window is. The
// wall follows the outline itself, button and cutoffs included, so the plate registers. The lip
// is wider than the land, which is sound face down only while the fluting channel sits above it:
// the plan reads the arching over the lip and refuses a lip the arch would reach. The slab needs
// no harness: it is clamped to the table and zeroed on its own top corner with the probe, the
// plate centred in it
export function cradleToolpaths(p: ViolinFamilyParams, surface: PlateSurface, o: PlateContourSolve, bit: Bit, g: CradleSettings, cradle: CradleSpec = CRADLE, machine = MACHINE): Toolpaths {
  let bed = -g.stock.thickness;
  let land = -cradle.wall;
  let archHeight = p.arching![g.plate].long.height;
  let out = emptyToolpaths(0, land, [
    `Z0 = SLAB TOP, bed Z${bed.toFixed(3)}`,
    `XY0 = SLAB LOWER LEFT, slab ${g.stock.width} x ${g.stock.length}`,
    `Slab ${g.stock.thickness} mm, ${g.wood} wood`,
    `${g.plate === 'top' ? 'Top' : 'Back'} plate cradle, ${g.stage}; lip Z${land.toFixed(3)}, ${cradle.lip} wide, pocket ${cradle.clearance} clear of the outline`,
  ]);
  if (!(bit.diameter > 0)) fail(out, 'The bit diameter has to be above 0.');
  if (bit.shape !== 'flat') fail(out, 'The cradle takes a flat bit.');
  if (land - bed < archHeight + cradle.crownClearance) fail(out, `The slab is too thin: face down the crown hangs ${archHeight.toFixed(1)} mm below the lip, and the slab leaves ${(land - bed - archHeight).toFixed(1)} mm under it.`);
  let outline = o[g.plate];
  if (!outline) return fail(out, 'The outline has to solve first.');
  // the arch over the lip: nothing may stand above the land plane there
  for (let f of [1, 0.75, 0.5]) {
    let edge = insideOutline(outline, cradle.lip * f);
    if (!edge) return fail(out, 'The lip is too wide: its inner edge does not close.');
    let proud = samplePathToPolyline(edge, 2).map(pt => surfaceZAt(surface, pt.x, pt.y) ?? 0).reduce((a, b) => Math.max(a, b), 0);
    if (proud > 0.01) fail(out, `The lip reaches under the arch: ${(cradle.lip * f).toFixed(1)} mm in, the surface stands ${proud.toFixed(2)} mm above the land.`);
  }
  centreInSheet(out, boundsOf(surface.outline, cradle.clearance), g);
  if (out.failures.length) return out;
  let r = bit.diameter / 2;
  if (g.stage === 'pocket') {
    // from the lip's inner edge out to the wall, the last loop's outer edge the clearance off the outline
    let inner = -cradle.lip + r, outer = cradle.clearance - r;
    let n = outer > inner ? Math.ceil((outer - inner) / (SURFACE.roughStepover * bit.diameter)) + 1 : 1;
    for (let i = 0; i < n; i++) {
      let at = n > 1 ? inner + ((outer - inner) * i) / (n - 1) : outer;
      let d = insideOutline(outline, -at);
      if (!d) return fail(out, 'The pocket would not offset for the bit.');
      out.paths.push({ name: `Pocket ${i + 1}`, loop: climbingLoop(d, 'inside'), tabs: [] });
    }
    out.notes.push(`Pocket in ${n} loops from the lip's edge out to the wall, down to the lip`);
    return out;
  }
  let d = insideOutline(outline, cradle.lip - r);
  if (!d) return fail(out, 'The lip\'s edge would not offset for the bit.');
  out.paths.push(withTabs('Hole', climbingLoop(d, 'inside'), evenStations(cradle.tabs, 0.5), machine.tabWidth, out.failures));
  out.floorZ = bed - machine.overcut;
  out.tabTop = bed + machine.tabHeight;
  out.notes.push(`Hole through along the lip's edge, through the bed by ${machine.overcut}; ${cradle.tabs} tabs ${machine.tabHeight} high`);
  return out;
}

// the arching's surfacing: a surface to carve, over a stock whose roof is known across x, in
// lines along the length. The height field is sampled on a grid a bit's radius past
// the area; the stock has to hold the surface everywhere (the planner's `proud` says where it
// does not); the floor is the surface's own lowest point. Roughing goes in terraces from the top,
// a step down apart to `roughFloor`, each line riding at the terrace or over whatever stands above
// it plus the leave, lines the roof never reaches skipped; finishing is one pass with the ball
interface SurfaceJob {
  area: Bounds;
  roof: (x: number) => number;
  top: number;
  roughFloor: number;
  // one row's heights at a time: the field's row solve is kept while y holds
  rowZ: (y: number) => (x: number) => number;
  proud: (x: number, z: number, roof: number) => string;
}

function surfacing(out: Toolpaths, job: SurfaceJob, bit: Bit, stage: Stage, fine: boolean, grid: number): Toolpaths {
  let r = bit.diameter / 2;
  let { area, roof } = job;
  let t = terrainGrid(area, r + grid, grid, job.rowZ);
  let proud = { by: 0.01, x: 0, z: 0 };
  let floorZ = Infinity;
  for (let j = 0; j < t.ny; j++) for (let i = 0; i < t.nx; i++) {
    let x = t.x0 + i * grid;
    if (x < area.minX || x > area.maxX) continue;
    let z = t.z[j * t.nx + i], by = z - roof(x);
    if (by > proud.by) proud = { by, x, z };
    if (z < floorZ) floorZ = z;
  }
  out.floorZ = floorZ;
  if (proud.by > 0.01) fail(out, job.proud(proud.x, proud.z, roof(proud.x)));

  // the raster: lines evenly across the area, both edges included, sampled at the grid's rows
  let stepover = stage === 'rough' ? SURFACE.roughStepover * bit.diameter : 2 * Math.sqrt(2 * r * SURFACE.scallop - SURFACE.scallop ** 2);
  let n = Math.max(1, Math.ceil((area.maxX - area.minX) / stepover));
  let lineXs = Array.from({ length: n + 1 }, (_, i) => area.minX + ((area.maxX - area.minX) * i) / n);
  let j0 = Math.max(0, Math.floor((area.minY - t.y0) / grid)), j1 = Math.min(t.ny - 1, Math.ceil((area.maxY - t.y0) / grid));
  let yMin = t.y0 + j0 * grid, yMax = t.y0 + j1 * grid;
  let levels: number[] = [];
  if (stage === 'rough' && bit.feeds && bit.feeds.stepDown > 0) {
    for (let z = job.top - bit.feeds.stepDown; ; z -= bit.feeds.stepDown) {
      levels.push(Math.max(job.roughFloor, z));
      if (z <= job.roughFloor) break;
    }
  }
  let linesAt = (level: number) => lineXs.filter(x => roof(x) > level);
  out.metres = (stage === 'rough' ? levels.reduce((sum, level) => sum + linesAt(level).length, 0) : lineXs.length) * (yMax - yMin) / 1000;
  out.passes = levels.length || 1;
  out.raster = { xs: lineXs, yMin, yMax, levels };
  out.notes.push(`${lineXs.length} lines along the length ${stepover.toFixed(2)} apart, ${SURFACE.skirt} past the outline; ${stage === 'rough' ? `${levels.length} terraces leaving ${SURFACE.leave}` : `one pass, a ${SURFACE.scallop} scallop`}`);
  if (!fine || out.failures.length) return out;
  if (stage === 'rough' && !bit.feeds) return fail(out, 'No feeds for this bit.');

  let tip = (x: number) => tipHeights(t, r, x, bit.shape === 'ball');
  if (stage === 'rough') {
    for (let level of levels) {
      let pts = serpentine(linesAt(level), j0, j1, t, x => {
        let z = tip(x);
        return j => Math.max(level, z[j] + SURFACE.leave);
      });
      if (pts.some(pt => pt.z <= level + 1e-9)) out.surfaces.push({ name: `Rough Z${level.toFixed(3)}`, pts });
    }
  } else {
    out.surfaces.push({ name: 'Finish', pts: serpentine(lineXs, j0, j1, t, x => {
      let z = tip(x);
      return j => z[j];
    }) });
  }
  return out;
}

// the purfling channel: the strip's width between the Plate Contour panel's two purfling lines,
// cut in the plate's blank once the finishing pass has been, its floor one flat depth under the
// plate's edge (the channel is gouged flush afterwards, so its depth is held against the edge,
// not the carved surface). A bit the channel's width takes it in one pass down the middle; a
// narrower one in passes set evenly between the channel's edges a bit radius in. Each pass is one
// closed loop, counterclockwise, gone round once per step down: the next round starts where the
// last closed, a dive in place. Nothing of the loop is offset for the bit, since the bit sits
// inside the channel; the corners come to the bee sting's point as drawn. The surface is only
// read for the plate's place in the blank, the same as the arching's
export function purflingToolpaths(p: ViolinFamilyParams, surface: PlateSurface, bit: Bit, g: PlateSettings, fine = false): Toolpaths {
  let out = plateToolpaths(p, surface, g, 'purfling channel', bit);
  let o = p.plateContour!;
  let width = o.purflingChannelDepth;
  if (bit.shape !== 'flat') fail(out, 'The purfling channel takes a flat bit.');
  if (bit.diameter > width + 0.05) fail(out, `The bit is wider than the channel: ${width} mm.`);
  if (!(g.purflingDepth > 0)) fail(out, 'The strip height has to be above 0.');
  if (!bit.feeds) fail(out, 'No feeds for this bit.');
  if (out.failures.length) return out;
  let rib = solveRibArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
  if (!rib) return fail(out, 'The rib outline has to solve first.');
  let thickness = p.arching![g.plate].thickness;
  let inset = p.body.overhang + p.body.rib;
  let r = bit.diameter / 2;
  // across the channel: from the inner edge a radius in to the outer edge a radius in
  let span = Math.max(0, width - bit.diameter);
  let across = span < 0.05 ? 1 : Math.ceil(span / (0.6 * bit.diameter)) + 1;
  let offsets = Array.from({ length: across }, (_, i) => r + (across > 1 ? (span * i) / (across - 1) : span / 2));
  let rounds = roundsTo(g.purflingDepth, bit.feeds!.stepDown);
  out.passes = rounds.length;
  out.floorZ = thickness - g.purflingDepth;
  out.caution = SURFACED_PLATE;
  out.notes.push(`Channel ${width} wide in ${across} pass${across === 1 ? '' : 'es'} across, ${rounds.length} round${rounds.length === 1 ? '' : 's'} down to ${g.purflingDepth} under the edge`);
  for (let [i, off] of offsets.entries()) {
    let d = definePurflingPath(p, rib, inset - o.purflingOffset + off);
    if (!d) return fail(out, 'The purfling line would not offset for this pass: the corners no longer meet.');
    let ring = samplePathToPolyline(d, fine ? 0.25 : 1);
    if (signedPolygonArea(ring) < 0) ring.reverse();
    let loop = [...ring, ring[0]];
    let pts: Pt3D[] = [];
    for (let depth of rounds) for (let pt of loop) pts.push(new Pt3D(pt.x, pt.y, thickness - depth));
    out.surfaces.push({ name: `Purfling pass ${i + 1}`, pts: fine ? simplifyPolyline3D(pts, SURFACE.chordTolerance) : pts });
  }
  return out;
}

// the top's f-holes, cut with the graduated plate face up in its cradle, resting on the lip: the
// eyes through the plate with a small flat bit, then the whole outline scribed with a V bit for
// the knife. The router never cuts the hole's edge: the passage round a wing's tip is narrower
// than any bit and the edge is the most seen line on the plate, so the eyes stop `allowance`
// short of the drawn circle and the scribe, whose point is as fine as its depth, marks the line
// itself, wing tips and nicks as drawn. Both follow the surface, Z along a loop being the
// outside at that point less the depth, so a small bit is never buried past its flutes at the
// high end of a hole that falls across the arch. The eyes are cleared in loops from the centre
// out, clockwise, a level at a time, to the typed thickness plus a margin, the inside being the
// maker's; below the eye is the cradle's hole, so overshoot is free, and an eye over the lip is
// refused. The height field is the arching's over the lip; the safe height clears the crown, not
// the slab. The plate sits where the cradle put it: centred by the outline the cradle was cut to
export const GRADUATED_PLATE = 'EXPECTS THE GRADUATED TOP, FACE UP IN ITS CRADLE.';

export function fholeToolpaths(p: ViolinFamilyParams, s: FholeContoursSolve, surface: PlateSurface, seat: PlateSurface, o: PlateContourSolve, bit: Bit, g: CradleSettings, fh: FholeSettings, fine = false, cradle: CradleSpec = CRADLE): Toolpaths {
  let lipZ = -cradle.wall;
  let edge = p.arching!.top.thickness;
  let crown = lipZ + edge + p.arching!.top.long.height;
  let out = emptyToolpaths(crown, lipZ, [
    `Z0 = SLAB TOP, bed Z${(-g.stock.thickness).toFixed(3)}; the top face up on the lip Z${lipZ.toFixed(3)}, its edge Z${(lipZ + edge).toFixed(3)}, its crown Z${crown.toFixed(3)}`,
    `XY0 = SLAB LOWER LEFT, slab ${g.stock.width} x ${g.stock.length}, cut to the ${g.plate}`,
    `Top plate f-holes, ${fh.stage}; plate ${fh.thickness} mm at the f-holes`,
  ]);
  out.caution = GRADUATED_PLATE;
  if (!(bit.diameter > 0)) fail(out, 'The bit diameter has to be above 0.');
  centreInSheet(out, boundsOf(seat.outline, cradle.clearance), g);
  let zAt = (pt: Pt) => lipZ + edge + (surfaceZAt(surface, pt.x, pt.y) ?? 0);
  let step = fine ? 0.1 : 0.5;
  let f = p.fHoles!;
  let eyes: [string, Circle][] = [['Upper eye', f.UEye], ['Lower eye', f.LEye]];
  let add = (name: string, pts: Pt3D[]) => {
    out.surfaces.push({ name, pts: simplifyPolyline3D(pts, SURFACE.chordTolerance) });
    out.floorZ = pts.reduce((z, pt) => Math.min(z, pt.z), out.floorZ);
  };
  if (fh.stage === 'eyes') {
    let r = bit.diameter / 2;
    if (bit.shape !== 'flat') fail(out, 'The eyes take a flat bit.');
    if (!bit.feeds) fail(out, 'No feeds for this bit.');
    if (!(fh.thickness > 0)) fail(out, 'The plate\'s thickness at the f-holes has to be above 0.');
    for (let [name, eye] of eyes) {
      if (eye.r - FHOLE.allowance - r < 0.05) fail(out, `The bit is too wide for the ${name.toLowerCase()}: ${(2 * (eye.r - FHOLE.allowance)).toFixed(1)} mm inside the knife allowance.`);
    }
    let outline = o[g.plate];
    let holeD = outline && insideOutline(outline, cradle.lip);
    if (!holeD) fail(out, 'The cradle\'s hole has to solve first.');
    else {
      let hole = samplePathToPolyline(holeD, 1), idx = buildPolylineIndex(hole);
      for (let [name, eye] of eyes) {
        if (!pointInPolygon(eye, hole) || distPointToPolylineIndexed(eye, idx) < eye.r) fail(out, `The ${name.toLowerCase()} is over the cradle's lip, not its hole.`);
      }
    }
    if (out.failures.length) return out;
    let rounds = roundsTo(fh.thickness + FHOLE.exitMargin, bit.feeds!.stepDown);
    out.passes = rounds.length;
    out.floorZ = Infinity;
    out.notes.push(`Eyes cleared ${FHOLE.allowance} inside the drawn circle, ${rounds.length} round${rounds.length === 1 ? '' : 's'} down to ${fh.thickness + FHOLE.exitMargin} under the surface, into the cradle's hole`);
    for (let [side, place] of [['treble', (pt: Pt) => pt], ['bass', flipPointAboutY]] as const) {
      for (let [name, eye] of eyes) {
        let c = place(eye);
        let reach = eye.r - FHOLE.allowance - r;
        let n = Math.max(1, Math.ceil(reach / (SURFACE.roughStepover * bit.diameter)));
        let pts: Pt3D[] = [];
        for (let depth of rounds) for (let i = 1; i <= n; i++) {
          let rho = (reach * i) / n;
          let m = Math.max(16, Math.ceil((TURN.full * rho) / step));
          for (let j = 0; j <= m; j++) {
            let a = -(TURN.full * j) / m;
            let pt = { x: c.x + rho * Math.cos(a), y: c.y + rho * Math.sin(a) };
            pts.push(new Pt3D(pt.x, pt.y, zAt(pt) - depth));
          }
        }
        add(`${name}, ${side}`, pts);
      }
    }
    return out;
  }
  if (bit.shape !== 'v') fail(out, 'The scribe takes a V bit.');
  if (!(fh.scribeDepth > 0)) fail(out, 'The scribe depth has to be above 0.');
  if (out.failures.length) return out;
  out.passes = 1;
  out.floorZ = Infinity;
  for (let [side, flip] of [['treble', false], ['bass', true]] as const) {
    let d = defineFholePath(p, s, flip);
    let ring = d ? flattenPath(d, step)[0] ?? [] : [];
    if (ring.length > 1 && dist(ring[0], ring[ring.length - 1]) < 1e-6) ring.pop();
    if (ring.length < 3) return fail(out, 'The f-hole outline has to solve whole first.');
    if (signedPolygonArea(ring) < 0) ring.reverse();
    add(`Scribe ${side}`, [...ring, ring[0]].map(pt => new Pt3D(pt.x, pt.y, zAt(pt) - fh.scribeDepth)));
  }
  let groove = bit.angle ? 2 * fh.scribeDepth * Math.tan((bit.angle / 2) * TURN.degree) : 0;
  out.notes.push(`Scribe ${fh.scribeDepth} under the surface, the groove ${groove.toFixed(2)} wide`);
  return out;
}

// the depths of the rounds down to `depth`, a step apart, the last at the depth itself
function roundsTo(depth: number, stepDown: number): number[] {
  let rounds: number[] = [];
  for (let z = stepDown; ; z += stepDown) {
    rounds.push(Math.min(z, depth));
    if (z >= depth) break;
  }
  return rounds;
}

// the plate's contour: the outline grown by the bit's radius, the button with it on the back,
// walked counterclockwise for a climb cut, in passes from the land the arching left (the skirt
// round the outline is at the edge's height) down through the bed's overcut, held by tabs at the
// widest of each bout and the waist of each C. Cut last: once it is through, only the tabs hold
// the plate. The blank's seam still stands above the land, so the safe height is kept off it
export function contourToolpaths(p: ViolinFamilyParams, surface: PlateSurface, o: PlateContourSolve, bit: Bit, g: PlateSettings, tabs = PLATE_TABS, machine = MACHINE): Toolpaths {
  let out = plateToolpaths(p, surface, g, 'contour', bit);
  if (bit.shape !== 'flat') fail(out, 'The contour takes a flat bit.');
  if (out.failures.length) return out;
  let outline = o[g.plate];
  if (!outline) return fail(out, 'The outline has to solve first.');
  let thickness = p.arching![g.plate].thickness;
  let d = offsetPath(outline, bit.diameter / 2);
  if (!d) return fail(out, 'The outline would not offset for the bit.');
  let loop = climbingLoop(d, 'outside');
  let stations = boutStations(p, loop);
  out.paths.push(withTabs('Outline', loop, stations, tabs.width, out.failures));
  out.cutTopZ = thickness;
  out.floorZ = -machine.overcut;
  out.tabTop = tabs.height;
  out.caution = SURFACED_PLATE;
  out.notes.push(`Contour a bit radius outside the outline, counterclockwise, from the land Z${thickness.toFixed(3)} through the bed by ${machine.overcut}; ${stations.length} tabs ${tabs.width} long and ${tabs.height} high at the bouts and the waists. Cut last: once through, only the tabs hold the plate`);
  return out;
}

// where the plate is held: the widest point of each upper and lower bout and the waist of each C,
// each as a fraction of the way round the loop from its top centre crossing. The corners are
// kept clear by a margin either side of their height
function boutStations(p: ViolinFamilyParams, loop: Pt[]): number[] {
  let cum = polylineCumulativeLengths(loop);
  let total = cum[cum.length - 1];
  let { UCr, LCr } = p.corners!;
  let margin = 10;
  let pick = (keep: (pt: Pt) => boolean, score: (pt: Pt) => number): number | null => {
    let best = -1;
    loop.forEach((pt, i) => {
      if (keep(pt) && (best < 0 || score(pt) > score(loop[best]))) best = i;
    });
    return best < 0 ? null : cum[best] / total;
  };
  let upper = (pt: Pt) => pt.y > UCr.y + margin;
  let lower = (pt: Pt) => pt.y < LCr.y - margin;
  let waist = (pt: Pt) => pt.y > LCr.y + margin && pt.y < UCr.y - margin;
  return [
    pick(upper, pt => -pt.x), pick(upper, pt => pt.x),
    pick(waist, pt => (pt.x < 0 ? pt.x : -Infinity)), pick(waist, pt => (pt.x > 0 ? -pt.x : -Infinity)),
    pick(lower, pt => -pt.x), pick(lower, pt => pt.x),
  ].filter((f): f is number => f !== null);
}

// an outline kept as arcs and lines, so the bit can be offset round it: a sampled ring folds the
// offset at every concave vertex
type Piece = { kind: 'line'; a: Pt; b: Pt } | { kind: 'arc'; c: Pt; r: number; from: number; to: number; cw: boolean };

const line = (a: Pt, b: Pt): Piece => ({ kind: 'line', a, b });
// an Arc read counterclockwise from start to end, or backward, clockwise from end to start
const arcPiece = (a: Arc, backward = false): Piece => backward ? { kind: 'arc', c: a, r: a.r, from: a.end, to: a.start, cw: true } : { kind: 'arc', c: a, r: a.r, from: a.start, to: a.end, cw: false };
const pieceStart = (p: Piece): Pt => p.kind === 'line' ? p.a : pointOnCircle({ x: p.c.x, y: p.c.y, r: p.r }, p.from);
const pieceEnd = (p: Piece): Pt => p.kind === 'line' ? p.b : pointOnCircle({ x: p.c.x, y: p.c.y, r: p.r }, p.to);
const endAt = (p: Piece, pt: Pt): Piece => p.kind === 'line' ? { ...p, b: pt } : { ...p, to: angleFromCenter(p.c, pt) };
const startAt = (p: Piece, pt: Pt): Piece => p.kind === 'line' ? { ...p, a: pt } : { ...p, from: angleFromCenter(p.c, pt) };

// the pieces as one path, each carrying on from the last; the sweep flag is 1 for counterclockwise
// in y-up space, as arcPathData writes it
function piecesD(pieces: Piece[]): string {
  let start = pieceStart(pieces[0]);
  let d = pieces.map(p => {
    let end = pieceEnd(p);
    if (p.kind === 'line') return `L ${end.x} ${end.y}`;
    let span = normalizeRadians(p.cw ? p.from - p.to : p.to - p.from);
    return `A ${p.r} ${p.r} 0 ${span > TURN.half ? 1 : 0} ${p.cw ? 0 : 1} ${end.x} ${end.y}`;
  });
  return `M ${start.x} ${start.y} ${d.join(' ')}`;
}

// the neck blank's side profile in the scroll's frame, the fingerboard plane x = 0 and the nut's
// foot at the origin: up the face from the root, the scroll's front as the Scroll panel draws it to
// where the throat meets the spiral, the spiral from there out to the volute's front, the back
// down to the nape, then the neck's back, heel cove and foot from the Neck panel's elevation. The
// root is left a rectangle to the mortise floor, square to the plane, for the maker to fit.
// `front` and `spiral` index the pieces walling the throat; `stations` are where the blank is held
export interface SideOutline {
  pieces: Piece[];
  front: [number, number];
  spiral: [number, number];
  stations: Pt[];
  d: string;
}

export function sideOutline(p: ViolinFamilyParams, n: NeckSolve, s: ScrollSolve): SideOutline {
  let [a, b, c, d, tx, ty] = calcScrollOnNeck(p, n);
  // the frame is turned by the neck's lean and moved to the nut's foot, so undoing it is the
  // transpose on the difference, and an angle loses the lean
  let toScroll = (q: Pt): Pt => new Pt(a * (q.x - tx) + b * (q.y - ty), c * (q.x - tx) + d * (q.y - ty));
  let lean = Math.atan2(b, a);
  let at = pointOnCircle;
  let [S0, S1, S2, S3, nape, F0, F1, heel] = [s.S0!, s.S1!, s.S2!, s.S3!, s.nape!, s.F0!, s.F1!, n.heel!];
  let foot = new Pt(0, toScroll(n.bottomFront!).y);
  let heelStart = toScroll(at(heel, heel.start)), heelEnd = toScroll(at(heel, heel.end)), tip = toScroll(n.tip!);
  let crossing = at(F1, F1.start);
  let spiral = s.spiral!;
  let on = spiral.map(arc => Math.abs(dist(arc, crossing) - arc.r) + (angleWithinSweep(angleFromCenter(arc, crossing), arc.start, arc.end) ? 0 : 1));
  let j = on.indexOf(Math.min(...on));
  let heelC = toScroll(heel);
  let pieces: Piece[] = [
    line(foot, at(F0, F0.start)),
    arcPiece(F0), line(at(F0, F0.end), at(F1, F1.end)), arcPiece(F1, true),
    { kind: 'arc', c: spiral[j], r: spiral[j].r, from: angleFromCenter(spiral[j], crossing), to: spiral[j].end, cw: false },
    ...spiral.slice(0, j).reverse().map(arc => arcPiece(arc)),
    arcPiece(S0), arcPiece(S1), arcPiece(S2),
    line(at(S2, S2.end), at(S3, S3.end)), arcPiece(S3, true),
    line(at(S3, S3.start), at(nape, nape.end)), arcPiece(nape, true),
    line(at(nape, nape.start), heelStart),
    { kind: 'arc', c: heelC, r: heel.r, from: heel.start - lean, to: heel.end - lean, cw: normalizeRadians(heel.end - heel.start) > TURN.half },
    ...(dist(heelEnd, tip) > 1e-9 ? [line(heelEnd, tip)] : []),
    line(tip, new Pt(tip.x, foot.y)), line(new Pt(tip.x, foot.y), foot),
  ];
  let napeStart = at(nape, nape.start);
  let back = (f: number) => new Pt(napeStart.x + (heelStart.x - napeStart.x) * f, napeStart.y + (heelStart.y - napeStart.y) * f);
  let S2end = at(S2, S2.end), S3end = at(S3, S3.end);
  return {
    pieces,
    front: [1, 3],
    spiral: [4, 5 + j],
    stations: [back(1 / 3), back(2 / 3), new Pt((S2end.x + S3end.x) / 2, (S2end.y + S3end.y) / 2), at(S1, S1.start + normalizeRadians(S1.end - S1.start) / 2)],
    d: `${piecesD(pieces)} Z`,
  };
}

// the throat bridged for the gouge: the front's pieces are walked back from the crossing and the
// spiral's out from it to where the pocket between them first opens to `width`, and a chord closes
// it there. The pocket's walls are the two outlines themselves, so what is left is the part's
function bridgeThroat(o: SideOutline, width: number): Piece[] {
  let samples = ([from, to]: [number, number]) => {
    let out: { pt: Pt; piece: number }[] = [];
    for (let i = from; i <= to; i++) for (let pt of samplePathToPolyline(piecesD([o.pieces[i]]), 0.5, true)) out.push({ pt, piece: i });
    return out;
  };
  let A = samples(o.front), B = samples(o.spiral);
  let to = (pt: Pt, wall: { pt: Pt }[]) => {
    let best = Infinity;
    for (let i = 1; i < wall.length; i++) best = Math.min(best, closestPointOnSegment(pt, wall[i - 1].pt, wall[i].pt).dist);
    return best;
  };
  let ka = A.length - 1;
  while (ka > 0 && to(A[ka].pt, B) < width) ka--;
  let kb = 0;
  while (kb < B.length - 1 && to(B[kb].pt, A) < width) kb++;
  if (ka === A.length - 1 && kb === 0) return o.pieces;
  let a = A[ka], b = B[kb];
  // a piece cut to under a millimetre folds the offset, so the chord lands on its boundary
  // instead, which only opens the mouth a little wider
  let headPiece = o.pieces[a.piece], tailPiece = o.pieces[b.piece];
  let head = dist(a.pt, pieceStart(headPiece)) < 1 ? o.pieces.slice(0, a.piece) : [...o.pieces.slice(0, a.piece), endAt(headPiece, a.pt)];
  let tail = dist(b.pt, pieceEnd(tailPiece)) < 1 ? o.pieces.slice(b.piece + 1) : [startAt(tailPiece, b.pt), ...o.pieces.slice(b.piece + 1)];
  return [...head, line(pieceEnd(head[head.length - 1]), pieceStart(tail[0])), ...tail];
}

// the ring's stretches clear of the fence: the ring itself, closed, when none of it is in the
// fence, else each run between the stretches that are
function runsClearOf(ring: Pt[], inFence: (pt: Pt) => boolean): Pt[][] {
  let first = ring.findIndex(inFence);
  if (first < 0) return [[...ring, ring[0]]];
  let runs: Pt[][] = [];
  let run: Pt[] = [];
  for (let pt of [...ring.slice(first), ...ring.slice(0, first)]) {
    if (!inFence(pt)) run.push(pt);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

// the neck blank's side profile, one file a side: the bit a radius outside the outline, climbing,
// from the blank's top to a little past its middle, lifting over tabs on the neck's back, the
// pegbox's back and the head. The face sits on the T fence's stem, so with no inset it is never cut
// and the kerf stops a clearance short of the stem at both ends; the second side is the first
// mirrored across the stem, the blank rolled over onto its other side. The throat is bridged
export function scrollToolpaths(p: ViolinFamilyParams, n: NeckSolve, s: ScrollSolve, bit: Bit, g: ScrollSettings, fine = false, spec = SCROLL): Toolpaths {
  let { thickness: top, width: depth, length } = g.stock;
  let { x: fx, y: fy, thickness: ft, reach } = g.fence;
  let r = bit.diameter / 2;
  let floor = top / 2 - spec.overlap;
  let left = g.side === 'left';
  let out = emptyToolpaths(top, floor, [
    `Z0 = BED, blank top Z${top.toFixed(3)}; the ${left ? 'first' : 'second'} side, passes to Z${floor.toFixed(3)}, ${spec.overlap} past the middle`,
    `XY0 = HARNESS ZERO; T fence, stem ${ft} thick at X${fx} reaching Y${fy + reach}, crossbar at Y${fy}; blank ${depth} x ${length} on the stem's ${g.side}, face on the stem, heel end on the crossbar`,
    `Blank ${top} mm across the cheeks, ${g.wood} wood`,
  ]);
  if (!left) out.caution = 'EXPECTS THE FIRST SIDE CUT: the blank rolled over onto the stem\'s other side.';
  if (!(bit.diameter > 0)) fail(out, 'The bit diameter has to be above 0.');
  if (bit.shape !== 'flat') fail(out, 'The side profile takes a flat bit.');
  if (!(g.faceInset >= 0)) fail(out, 'The face inset has to be 0 or more.');
  let clear = 2 * r + spec.fenceClearance;
  if (!(g.endMargin >= clear)) fail(out, `The heel margin has to clear the crossbar: at least ${clear.toFixed(1)} mm with this bit.`);
  if (fx - depth < SHEET_MARGIN) fail(out, `No room left of the stem for the blank: the stem has to stand at least ${depth + SHEET_MARGIN} mm in.`);
  if (fx + ft + depth > g.harness.width - SHEET_MARGIN) fail(out, `No room right of the stem for the blank: the harness has to be at least ${Math.ceil(fx + ft + depth + SHEET_MARGIN)} mm wide.`);
  if (fy + length > g.harness.length - SHEET_MARGIN) fail(out, `The blank runs off the harness: it has to be at least ${Math.ceil(fy + length + SHEET_MARGIN)} mm long.`);
  if (out.failures.length) return out;

  let o = sideOutline(p, n, s);
  let b = boundsOf(samplePathToPolyline(o.d, 1), 0);
  if (b.maxX > g.faceInset + 1e-6) fail(out, `The scroll's chin stands ${b.maxX.toFixed(1)} mm proud of the fingerboard plane, past the blank's face: inset the face by at least that.`);
  if (b.minX < g.faceInset - depth + SHEET_MARGIN) fail(out, `The blank is too shallow: the profile reaches ${(-b.minX).toFixed(0)} mm behind the fingerboard plane, so it needs ${Math.ceil(g.faceInset - b.minX + SHEET_MARGIN)} mm back from the face.`);
  let height = b.maxY - b.minY;
  if (height + g.endMargin > length - SHEET_MARGIN) fail(out, `The blank is too short: the profile is ${height.toFixed(0)} mm long, so it needs ${Math.ceil(height + g.endMargin + SHEET_MARGIN)} mm.`);
  // the stem ends under the head: once the outline has left the face up the front, wherever it
  // comes back within the bit's reach of the face is the chin, which the bit has to get round
  let hug = g.faceInset - 2 * r - spec.fenceClearance;
  let walk = samplePathToPolyline(o.d, 0.5);
  let i = 0;
  while (i < walk.length && walk[i].x > hug) i++;
  while (i < walk.length && walk[i].x <= hug) i++;
  let chin: Pt[] = [];
  while (i < walk.length && walk[i].x > hug) chin.push(walk[i++]);
  if (chin.length) {
    let under = Math.min(...chin.map(pt => pt.y)) - b.minY + g.endMargin - r - spec.fenceClearance;
    if (reach > under) fail(out, `The stem reaches the scroll's chin: it has to end under ${Math.floor(under)} mm from the crossbar.`);
  }
  if (out.failures.length) return out;

  let width = bit.diameter + 2 * spec.bridge;
  let d = `${piecesD(bridgeThroat(o, width))} Z`;
  let stations = o.stations;
  if (!left) {
    d = transformPath(d, MIRROR);
    stations = stations.map(flipPointAboutY);
  }
  let od = offsetPath(d, r);
  if (!od) return fail(out, 'The side profile would not offset for the bit.');
  let ring = samplePathToPolyline(od, fine ? 0.25 : 1);
  if (signedPolygonArea(ring) < 0) ring.reverse();
  let limit = g.faceInset - r - spec.fenceClearance;
  let stemTop = b.minY - g.endMargin + reach + r + spec.fenceClearance;
  let runs = runsClearOf(ring, pt => (left ? pt.x : -pt.x) > limit && pt.y < stemTop).filter(run => polylineCumulativeLengths(run)[run.length - 1] > bit.diameter);
  if (!runs.length) return fail(out, 'Nothing of the profile is clear of the fence.');
  runs.forEach((run, i) => {
    let cum = polylineCumulativeLengths(run);
    let at: number[] = [];
    for (let station of stations) {
      let best = -1, near = bit.diameter;
      run.forEach((pt, k) => {
        let dd = dist(pt, station);
        if (dd < near) {
          near = dd;
          best = k;
        }
      });
      if (best >= 0) at.push(cum[best]);
    }
    out.paths.push(tabsAlong(runs.length > 1 ? `Side profile ${i + 1}` : 'Side profile', run, at, spec.tabWidth));
  });
  out.tabTop = floor + spec.tabHeight;
  out.stockOrigin = { x: left ? fx - depth : fx + ft, y: fy };
  out.sheetOffset = { x: left ? fx - g.faceInset : fx + ft + g.faceInset, y: fy + g.endMargin - b.minY };
  let rect = (x0: number, y0: number, x1: number, y1: number) => `M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;
  out.fixture = [rect(0, 0, g.harness.width, g.harness.length), rect(fx, fy, fx + ft, fy + reach), rect(fx - depth - 10, fy - ft, fx + ft + depth + 10, fy)].join(' ');
  let tabs = out.paths.reduce((sum, path) => sum + path.tabs.length, 0);
  out.notes.push(`Side profile in ${runs.length} run${runs.length === 1 ? '' : 's'}, ${tabs} tabs ${spec.tabHeight} high off the floor; the throat bridged for the gouge where it narrows to ${width.toFixed(1)}; the face ${g.faceInset ? `inset ${g.faceInset}` : 'on the stem, uncut'}; the bit reaches ${(top - floor).toFixed(1)} deep`);
  return out;
}

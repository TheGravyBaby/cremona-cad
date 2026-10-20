import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { buildGcode, downloadGcodeFile, GcodeJob } from '../../../../helpers/gcodeExporter';
import { closestPointOnSegment, dist, signedPolygonArea } from '../../../../helpers/math/simpleGeometry';
import { pathFromPolyline, pathsBounds, samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { pointAtPolylineLength, polylineCumulativeLengths, polylineSlice, simplifyPolyline3D } from '../../../../helpers/math/vibeMath';
import { offsetPath } from '../../../../helpers/math/pathVibes';
import { inchFraction } from '../../../../helpers/nearestFraction';
import { renderCrosshair, renderPath, renderRect, renderText } from '../../../../helpers/renderFuncs';
import { safeRun } from '../../../../helpers/validators';
import { Pt, Pt3D, Rectangle } from '../../../../models/types';
import { info } from '../../../../shared/message-emitter';
import { MmInchField } from '../../../../shared/mm-inch-field';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { DASH, STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { MouldRelief, MouldSolve, Plate, PlateSurface, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { contourRings, contourSampleSteps, rowAt, solveCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { BACK_ARCH_INK, CHANNEL_INK, TOP_ARCH_INK } from '../long-arching-panel/long-arching-panel';
import { MOULD_EXPORT_STEP, renderMould, solveMould } from '../mould-panel/mould-panel';

// G-code for the maker's own machine, offered on localhost only: the files drive a CNC, and nobody
// else's machine is ours to answer for. The source is open; the recipe names this panel only inside
// @defer, so a visitor's browser never fetches it. Not a CAM program: each
// export is one thing the shop cuts from the recipe (the mould and a plate's arching today; plate
// contours, purfling channels, scrolls and fingerboards to come), planned by code that knows that
// part, with the user saying only what the stock is and whether the wood is hard. The shop's
// settings are not the instrument's, so they live in this browser's localStorage, not on the
// recipe. The ⓘ's text is kept here, not in docs/, because this panel is never fetched off localhost.
//
// Adding an export: a row in EXPORTS, its stock settings on DevExportSettings, and a case in
// planExport that solves the part and returns its toolpaths and layers. Everything after that
// (the sheet, the tabs' lifts, the writer) is shared. In order below: the registry and settings,
// the machine and the tools, the component, the shared render and plan, the mould's planner, the
// arching's planner, the toolpath types and loop planning, and the job handed to the G-code writer

export type ExportId = 'mould' | 'arching';

export interface ExportKind {
  id: ExportId;
  label: string;
}

export const EXPORTS: readonly ExportKind[] = [{ id: 'mould', label: 'Mould' }, { id: 'arching', label: 'Arching' }];

export type Wood = 'soft' | 'hard';

export interface StockSettings {
  stock: { thickness: number; width: number; length: number };
  wood: Wood;
}

export type Stage = 'rough' | 'finish';

// a plate blank, bookmatched: planed flat on the joint face, which goes down on the bed, and a
// roof above it from `thickness` at the seam to `edge` at the blank's long edges
export interface ArchingSettings extends StockSettings {
  stock: StockSettings['stock'] & { edge: number };
  plate: Plate;
  stage: Stage;
  // tool numbers in TOOLS, one per stage
  roughTool: number;
  finishTool: number;
}

// one stock per export: a mould comes out of a ply sheet, a plate out of a blank
export interface DevExportSettings {
  job: ExportId;
  mould: StockSettings;
  arching: ArchingSettings;
}

export const DEFAULT_SETTINGS: DevExportSettings = {
  job: 'mould',
  mould: { stock: { thickness: 19, width: 300, length: 400 }, wood: 'soft' },
  arching: { stock: { thickness: 22, edge: 10, width: 230, length: 400 }, wood: 'soft', plate: 'top', stage: 'rough', roughTool: 251, finishTool: 202 },
};

// what never changes between jobs, so it is never asked. Z zero is the spoilboard, so a sheet
// thinner than typed still cuts through; XY zero is the sheet's lower left, where a BitZero finds
// it, and the part is centred in the sheet. The router's dial sets its speed, but Carbide Motion
// still expects an M3 with an S word. mm and mm/min
export const MACHINE = {
  overcut: 0.2,
  // above the stock's top
  safeZ: 12.7,
  // along the path, bit included
  tabWidth: 18,
  tabHeight: 3,
  spindleRpm: 18000,
} as const;

// how the sheet holds the mould while its loops are cut through
export const MOULD_TABS = { outline: 4, window: 2 } as const;

// how a plate's surface is carved: lines along the length, the roughing in terraces that leave a
// skin for the ball, the finishing one pass at the scallop's stepover. mm
export const SURFACE = {
  // over the finished surface, after roughing
  leave: 0.5,
  // between neighbouring finishing lines
  scallop: 0.05,
  // the flat bit's stepover, of its diameter
  roughStepover: 0.5,
  // the carved area past the outline, so the outline cut later lands on finished land
  skirt: 8,
  // the height field's sample spacing for the file
  grid: 0.5,
  // a vertex this close to its neighbours' chord is dropped from the file
  chordTolerance: 0.01,
} as const;

// the preview's height field, coarse enough to sample on every edit
const PREVIEW_GRID = 4;

const MACHINE_HELP = {
  title: 'Dev Export: the fixed plan',
  text:
    'Everything the panel does not ask you for is a constant, fixed so that no visit to the shop can drift it. The first mould was cut with exactly these numbers.\n\n' +
    'ZERO\n' +
    'Z0 is the spoilboard, so the file reads the top of the stock as Z = thickness. A sheet thinner than typed still cuts through, and a reference set on the stock top (which once ruined a sheet) cannot creep. ' +
    'XY0 is the sheet\'s lower-left corner, the point the BitZero finds. The part is centred in the sheet, so there is no margin to set; the sheet only has to be the part, plus one bit width, plus 5 mm a side.\n\n' +
    'OVERCUT\n' +
    `${MACHINE.overcut} mm. The last pass goes this far into the spoilboard. Ply is only nominal in thickness and the spoilboard is never quite flat, and a skin left under the part is worse than a scratch in the spoilboard.\n\n` +
    'SAFE Z\n' +
    `${MACHINE.safeZ} mm above the stock (half an inch). It is the only height the bit travels at rapid, clear of clamps and tabs. Every drop into the work is at plunge feed.\n\n` +
    'TABS\n' +
    `${MACHINE.tabWidth} mm along the path and ${MACHINE.tabHeight} mm high. The mould takes ${MOULD_TABS.outline} on the outline and ${MOULD_TABS.window} per window. ` +
    'They mirror across the centre line. The outline\'s tabs sit out on the bouts so none lands in a block notch. The windows are cut first, so the full sheet is still holding the mould while they are cut.\n\n' +
    'DIRECTION\n' +
    'Climb cutting, for a router turning clockwise: counterclockwise round the outside, clockwise inside a window. It leaves a cleaner edge in ply with less tear-out.\n\n' +
    'NOTCH CORNERS\n' +
    'Each block notch is cut as a dog-bone. The bit runs to the corner, then presses into it along the diagonal exactly as far as the drawn relief circle reaches, so the block seats square.\n\n' +
    'FEEDS\n' +
    'Set per bit and wood, from the bit maker\'s chart (Carbide 3D publishes one for each bit and wood) or from a chip-load table, with the source of each row noted beside it. A row the shop has actually cut with is marked as such; cut scrap before trusting one that is not.\n\n' +
    'SPINDLE\n' +
    `S${MACHINE.spindleRpm}. The router's own dial sets the real speed, but Carbide Motion still wants an M3 with an S word. Before it, the file pauses (M0) with a message naming the bit and the speed; the spindle starts and the cut begins only once you resume.\n\n` +
    'ARCHING\n' +
    'The blank goes joint face down, so Z0 is the bed it lies on and the plate\'s edge comes out at Z = its edge thickness; the floor the file never crosses is the bottom of the fluting channel, a little under that. XY0 is the blank\'s lower-left corner, the plate centred in it with the seam on its centre line. ' +
    'Type the blank\'s thickness at the seam and at its long edges: the plan refuses a blank the surface would stand proud of. The margin past the carved area is where the screws go.\n\n' +
    `The carved area runs ${SURFACE.skirt} mm past the outline, so the outline cut later lands on finished land. Lines run along the length, bass side first, each pair joined at their ends so the bit never lifts between them. ` +
    `Roughing takes a flat bit in terraces one step down apart, riding over whatever still stands above a terrace, and leaves ${SURFACE.leave} mm for the ball. ` +
    `Finishing takes a ball bit in one pass, its lines spaced for a ${SURFACE.scallop} mm scallop; the tip stands off the surface wherever the ball would touch it first. ` +
    'A run diving steeper than 30° is fed at the plunge rate.\n\n' +
    'PLANNING\n' +
    'The download plans the cut again from the fine solve that the sheet exports use, so the coarser sampling of the preview never reaches the file.',
};

export interface Feeds {
  cutFeed: number;
  plungeFeed: number;
  stepDown: number;
}

export type ToolShape = 'flat' | 'ball';

// the shop's bits by diameter: the recipe's bit has to be one of these to get feeds. A row is the
// maker's published number for that bit and wood, or what a job here was cut at; where it came
// from is beside it. A null row is one nobody has looked up yet
export interface Tool {
  number: number;
  name: string;
  diameter: number;
  shape: ToolShape;
  feeds: Record<Wood, Feeds | null>;
}

export const TOOLS: readonly Tool[] = [
  {
    number: 251, name: '1/4" downcut', diameter: 6.35, shape: 'flat',
    feeds: {
      // cut the first mould, 19 mm ply (75 ipm, 15 ipm, 0.06")
      soft: { cutFeed: 1905, plungeFeed: 381, stepDown: 1.524 },
      // Carbide Create's library default for the 1/4" #201 in hardwood (60 ipm, 12 ipm, 0.04"),
      // the #251 being its downcut twin; not yet cut here
      hard: { cutFeed: 1524, plungeFeed: 305, stepDown: 1.016 },
    },
  },
  { number: 102, name: '1/8" square', diameter: 3.175, shape: 'flat', feeds: { soft: null, hard: null } },
  { number: 202, name: '1/4" ball', diameter: 6.35, shape: 'ball', feeds: { soft: null, hard: null } },
  { number: 101, name: '1/8" ball', diameter: 3.175, shape: 'ball', feeds: { soft: null, hard: null } },
];

export function toolFor(diameter: number): Tool | null {
  return TOOLS.find(t => t.shape === 'flat' && Math.abs(t.diameter - diameter) < 0.01) ?? null;
}

// what a planner is told about the bit: the mould's comes from the recipe and may match no row
export interface Bit {
  diameter: number;
  shape: ToolShape;
  feeds: Feeds | null;
}

const STORAGE_KEY = 'devExport';
const WOODS: readonly Wood[] = ['soft', 'hard'];
const PLATES: readonly Plate[] = ['top', 'back'];
const STAGES: readonly Stage[] = ['rough', 'finish'];

@Component({
  selector: 'app-vf-dev-export-panel',
  imports: [FormsModule, MmInchField, NumberStepperDirective],
  templateUrl: './dev-export-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class DevExportPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showBlocks', 'showRibOutline'];
  protected readonly pal = ThemeService.getPalette('classicCremona');
  protected readonly machine = MACHINE;
  protected readonly mouldTabs = MOULD_TABS;
  protected readonly surface = SURFACE;
  protected readonly tools = TOOLS;
  protected readonly exports = EXPORTS;

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Input() fileName = '';
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  settings: DevExportSettings = readSettings();
  // what the last draw planned; the template reads its failures
  toolpaths: Toolpaths | null = null;

  ngOnInit(): void {
    this.draw();
  }

  // a shop setting: stored here, never on the recipe, so it never reaches the undo stack
  edited(): void {
    writeSettings(this.settings);
    this.draw();
  }

  // the bit is the mould panel's param (its reliefs are cut for it), so changing it here is a
  // recipe edit like any other
  setBit(diameter: number): void {
    if (!this.params.mould) return;
    this.params.mould.bitDiameter = diameter;
    this.edit.emit();
    this.draw();
  }

  help(): void {
    info(MACHINE_HELP.text, MACHINE_HELP.title, 60000, true);
  }

  report(): void {}

  draw(): void {
    safeRun(() => {
      let bit = this.bit;
      let plan = bit ? planExport(this.settings.job, this.params, bit, this.g, this.pal, this.flags) : null;
      this.toolpaths = plan?.toolpaths ?? null;
      this.drawn.emit(plan ? [inSheet(plan.toolpaths, plan.layers)] : []);
    });
  }

  get job(): ExportKind {
    return EXPORTS.find(e => e.id === this.settings.job) ?? EXPORTS[0];
  }

  // the open job's stock
  get g(): StockSettings {
    return this.settings[this.settings.job];
  }

  get a(): ArchingSettings {
    return this.settings.arching;
  }

  get bitDiameter(): number {
    return this.params.mould?.bitDiameter ?? NaN;
  }

  // the shape the arching's open stage takes
  get stageShape(): ToolShape {
    return this.a.stage === 'rough' ? 'flat' : 'ball';
  }

  toolsFor(shape: ToolShape): Tool[] {
    return TOOLS.filter(t => t.shape === shape);
  }

  get tool(): Tool | null {
    if (this.settings.job === 'mould') return toolFor(this.bitDiameter);
    let number = this.a.stage === 'rough' ? this.a.roughTool : this.a.finishTool;
    return TOOLS.find(t => t.number === number) ?? null;
  }

  get feeds(): Feeds | null {
    return this.tool?.feeds[this.g.wood] ?? null;
  }

  get bit(): Bit | null {
    if (this.settings.job === 'mould') return { diameter: this.bitDiameter, shape: 'flat', feeds: this.feeds };
    let tool = this.tool;
    return tool ? { diameter: tool.diameter, shape: tool.shape, feeds: this.feeds } : null;
  }

  get cutPlan(): CutPlan | null {
    return this.feeds && this.toolpaths ? cutPlan(this.toolpaths, this.feeds) : null;
  }

  // minutes at the cut feed, for a surfacing job
  get minutes(): number | null {
    let feeds = this.feeds, raster = this.toolpaths?.raster;
    return feeds && raster ? Math.round((raster.metres * 1000) / feeds.cutFeed) : null;
  }

  get canDownload(): boolean {
    return !!this.feeds && !!this.toolpaths && !this.toolpaths.failures.length;
  }

  reset(): void {
    this.settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), job: this.settings.job };
    this.edited();
  }

  // planned again from the fine solve the sheets export from, not the preview's
  download(): void {
    let tool = this.tool, feeds = this.feeds, bit = this.bit;
    if (!tool || !feeds || !bit) return;
    let plan = planExport(this.settings.job, this.params, bit, this.g, this.pal, this.flags, true);
    if (!plan || plan.toolpaths.failures.length) return;
    let text = buildGcode(gcodeJob(plan.toolpaths, tool, feeds));
    let part = this.settings.job === 'arching' ? `arching-${this.a.plate}-${this.a.stage}` : this.job.id;
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
export function planExport(job: ExportId, p: ViolinFamilyParams, bit: Bit, g: StockSettings, pal: PanelPalette, flags: ViolinFamilyViewFlags, fine = false): ExportPlan | null {
  switch (job) {
    case 'mould': {
      let s = fine ? solveMould(p, MOULD_EXPORT_STEP) : solveMould(p);
      if (!s) return null;
      let toolpaths = mouldToolpaths(s, bit.diameter, g);
      return { toolpaths, layers: [renderMould(s, pal, flags), renderSheet(toolpaths, g, pal), renderToolpaths(toolpaths, pal)] };
    }
    case 'arching': {
      let a = g as ArchingSettings;
      let surface = solveCrossArching(p)?.[a.plate];
      if (!surface) return null;
      let toolpaths = archingToolpaths(p, surface, bit, a, fine);
      return { toolpaths, layers: [renderArching(p, surface, a, toolpaths, pal), renderSheet(toolpaths, g, pal)] };
    }
  }
}

// the panel drawn in the machine's coordinates: shifted by the sheet offset, so the canvas origin
// is the file's XY zero and a point read off the canvas is the X and Y the file sends. The ui
// group is Y-flipped, so its shift mirrors
export const inSheet = (tp: Toolpaths, layers: RenderLayer[]): RenderLayer => (g: any, ui: any): void => {
  let { x, y } = tp.sheetOffset;
  let gs = g.append('g').attr('transform', `translate(${x},${y})`);
  let uis = ui.append('g').attr('transform', `translate(${x},${-y})`);
  for (let layer of layers) layer(gs, uis);
};

// the sheet as the machine sees it, drawn round the part: its outline dashed, the XY zero marked
// at its lower-left corner, its size written above it in both units; in the alert ink when the
// plan has something to say about it. In world coordinates, like the part: inSheet shifts both
export const renderSheet = (tp: Toolpaths, g: StockSettings, pal: PanelPalette) => (gr: any, ui: any): void => {
  let { width: w, length: l } = g.stock;
  if (!(w > 0 && l > 0)) return;
  let origin = { x: -tp.sheetOffset.x, y: -tp.sheetOffset.y };
  let color = tp.failures.length ? pal.alert : pal.neutral;
  renderRect(new Rectangle(origin, { x: origin.x + w, y: origin.y + l }), color, 'none', STROKE_WEIGHT.guide, DASH.guide)(gr, ui);
  renderCrosshair(origin, color, 6, STROKE_WEIGHT.guide, 1, true, 1)(gr, ui);
  renderText({ x: origin.x + 10, y: origin.y - 6 }, 'X0 Y0', color, SHEET_LABEL_SIZE)(gr, ui);
  let inches = (mm: number) => inchFraction(mm / 25.4).replace(/^≈\s*/, '');
  renderText({ x: origin.x + w / 2, y: origin.y + l + 6 }, `${w} × ${l} mm  (${inches(w)}" × ${inches(l)}")`, color, SHEET_LABEL_SIZE)(gr, ui);
};

const SHEET_LABEL_SIZE = 5;

// the cutter's centre line, faint, and the tabs as halos on it where the bit stays up
export const renderToolpaths = (tp: Toolpaths, pal: PanelPalette) => (g: any, ui: any): void => {
  for (let path of tp.paths) {
    renderPath(pathFromPolyline(path.loop), pal.ink(3), STROKE_WEIGHT.guide, 0.5)(g, ui);
    for (let tab of path.tabs) renderPath(pathFromPolyline(tab.pts), pal.ink(3), STROKE_WEIGHT.focusHalo, 0.6)(g, ui);
  }
};

// the plate as the Cross Arching panel maps it, its outline and contours, under the carved area
// and the raster's lines, with the blank's seam marked down its middle
export const renderArching = (p: ViolinFamilyParams, surface: PlateSurface, g: ArchingSettings, tp: Toolpaths, pal: PanelPalette) => (gr: any, ui: any): void => {
  let ink = pal.ink(g.plate === 'top' ? TOP_ARCH_INK : BACK_ARCH_INK);
  renderPath(pathFromPolyline(surface.outline, true), pal.neutral, STROKE_WEIGHT.guide, 0.8)(gr, ui);
  let { stepMm, gridMm } = contourSampleSteps(p, p.arching![g.plate].arch.height);
  for (let { level, rings } of contourRings(p, surface, stepMm, gridMm)) {
    let d = rings.map(ring => `M ${ring.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`).join(' ');
    renderPath(d, level <= 0 ? pal.ink(CHANNEL_INK) : ink, STROKE_WEIGHT.guide, level <= 0 ? 0.9 : 0.7)(gr, ui);
  }
  let raster = tp.raster;
  if (!raster) return;
  let color = tp.failures.length ? pal.alert : pal.ink(3);
  renderRect(new Rectangle({ x: raster.xs[0], y: raster.yMin }, { x: raster.xs[raster.xs.length - 1], y: raster.yMax }), color, 'none', STROKE_WEIGHT.guide, DASH.guide)(gr, ui);
  for (let x of raster.xs) renderPath(`M ${x} ${raster.yMin} L ${x} ${raster.yMax}`, color, STROKE_WEIGHT.guide, 0.25)(gr, ui);
  let seamX = g.stock.width / 2 - tp.sheetOffset.x;
  let yLow = -tp.sheetOffset.y, yHigh = yLow + g.stock.length;
  renderPath(`M ${seamX} ${yLow} L ${seamX} ${yHigh}`, pal.neutral, STROKE_WEIGHT.guide, 0.8, DASH.preview)(gr, ui);
  renderText({ x: seamX, y: yHigh - 8 }, 'seam', pal.neutral, SHEET_LABEL_SIZE)(gr, ui);
};

export interface CutPlan {
  stockTopZ: number;
  // the floor of the cut in the file's own Z, below which the emitter must refuse to move
  floorZ: number;
  passes: number;
}

// what the file steps through: a profile job's passes from the step down, a surfacing job's from
// its raster
export function cutPlan(tp: Toolpaths, feeds: Feeds): CutPlan {
  let passes = tp.raster ? tp.raster.levels.length || 1 : feeds.stepDown > 0 ? Math.ceil((tp.stockTopZ - tp.floorZ) / feeds.stepDown) : 0;
  return { stockTopZ: tp.stockTopZ, floorZ: tp.floorZ, passes };
}

// a key missing or mistyped reads as its default, as SettingsService reads its own
export function readSettings(): DevExportSettings {
  let stored: any = {};
  try {
    let parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') stored = parsed;
  } catch {
    // unreadable reads as defaults
  }
  let out: DevExportSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (EXPORTS.some(e => e.id === stored.job)) out.job = stored.job;
  for (let e of EXPORTS) {
    let mine = stored[e.id];
    let stock: Record<string, number> = out[e.id].stock;
    for (let key of Object.keys(stock)) {
      let n = mine?.stock?.[key];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) stock[key] = n;
    }
    if (WOODS.includes(mine?.wood)) out[e.id].wood = mine.wood;
  }
  let a = stored.arching;
  if (PLATES.includes(a?.plate)) out.arching.plate = a.plate;
  if (STAGES.includes(a?.stage)) out.arching.stage = a.stage;
  for (let key of ['roughTool', 'finishTool'] as const) {
    if (TOOLS.some(t => t.number === a?.[key])) out.arching[key] = a[key];
  }
  return out;
}

function writeSettings(settings: DevExportSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // a blocked store keeps the settings for this visit
  }
}

// the mould's toolpaths: the windows shrunk by the bit's radius, the outline grown by it, each
// walked the climbing way round from a point between two tabs. Every loop's stations are set out
// from where it crosses the centre line at the top, so the tabs come out mirrored: the outline's
// ends are block notches, so its stations sit between them, out on the bouts; a window's long
// edges are its top and bottom, so its stations start there. Windows come before the outline, so
// the mould stays held. A notch's relief is not offset (the circle grown by the bit is a sliver
// no sampling follows) but cut as a dog-bone: the edges run to the corner, the bit presses in
// along the diagonal as far as the drawn relief reaches, and comes back out
export function mouldToolpaths(s: MouldSolve, bitDiameter: number, g: StockSettings, tabs = MOULD_TABS, machine = MACHINE): Toolpaths {
  let out = emptyToolpaths(g.stock.thickness, -machine.overcut, [
    `Z0 = SPOILBOARD, stock top Z${g.stock.thickness.toFixed(3)}`,
    `XY0 = SHEET LOWER LEFT, sheet ${g.stock.width} x ${g.stock.length}`,
    `Stock ${g.stock.thickness} mm, ${g.wood} wood`,
  ]);
  if (!s.outline) return fail(out, 'The mould has to solve first.');
  if (!(bitDiameter > 0)) return fail(out, 'The bit diameter has to be above 0.');
  let r = bitDiameter / 2;
  s.clampBox.forEach((window, i) => {
    let d = offsetPath(window, -r);
    if (d) out.paths.push(planLoop(`Window ${i + 1}`, d, 'inside', tabs.window, 0, machine.tabWidth, out.failures));
    else fail(out, `Window ${i + 1} is too narrow for the bit.`);
  });
  let d = offsetPath(s.notchOutline ?? s.outline, r);
  if (!d) return fail(out, 'The outline would not offset for the bit.');
  out.paths.push(planLoop('Outline', d, 'outside', tabs.outline, 0.5, machine.tabWidth, out.failures, ring => withDogBones(ring, s.reliefs, r)));
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
export function archingToolpaths(p: ViolinFamilyParams, surface: PlateSurface, bit: Bit, g: ArchingSettings, fine = false, grid = fine ? SURFACE.grid : PREVIEW_GRID): Toolpaths {
  let thickness = p.arching![g.plate].thickness;
  let out = emptyToolpaths(g.stock.thickness, thickness, [
    `Z0 = BED, the blank's joint face; blank top at the seam Z${g.stock.thickness.toFixed(3)}`,
    `XY0 = BLANK LOWER LEFT, blank ${g.stock.width} x ${g.stock.length}`,
    `Blank ${g.stock.thickness} mm at the seam, ${g.stock.edge} mm at the edges, ${g.wood} wood`,
    `${g.plate === 'top' ? 'Top' : 'Back'} plate, ${g.stage === 'rough' ? 'roughing' : 'finishing'}; edge thickness Z${thickness.toFixed(3)}`,
  ]);
  if (!(bit.diameter > 0)) return fail(out, 'The bit diameter has to be above 0.');
  if (g.stage === 'rough' && bit.shape !== 'flat') return fail(out, 'Roughing takes a flat bit.');
  if (g.stage === 'finish' && bit.shape !== 'ball') return fail(out, 'Finishing takes a ball bit.');
  if (!(g.stock.edge > 0 && g.stock.edge <= g.stock.thickness)) return fail(out, 'The blank\'s edge has to be between 0 and its seam thickness.');
  let r = bit.diameter / 2;
  let xs = surface.outline.map(pt => pt.x), ys = surface.outline.map(pt => pt.y);
  let area: Bounds = {
    minX: Math.min(...xs) - SURFACE.skirt, maxX: Math.max(...xs) + SURFACE.skirt,
    minY: Math.min(...ys) - SURFACE.skirt, maxY: Math.max(...ys) + SURFACE.skirt,
  };
  centreInSheet(out, area, g);

  // the blank's roof, from the seam at the middle of the blank out to its long edges
  let seamX = g.stock.width / 2 - out.sheetOffset.x;
  let roof = (x: number) => g.stock.thickness - ((g.stock.thickness - g.stock.edge) * Math.abs(x - seamX)) / (g.stock.width / 2);
  let t = terrainGrid(surface, thickness, area, r + grid, grid);
  let proud = { by: 0.01, x: 0, z: 0 };
  // the channel runs below the land, so the floor is the surface's own lowest point
  let floorZ = thickness;
  for (let j = 0; j < t.ny; j++) for (let i = 0; i < t.nx; i++) {
    let x = t.x0 + i * grid;
    if (x < area.minX || x > area.maxX) continue;
    let z = t.z[j * t.nx + i], by = z - roof(x);
    if (by > proud.by) proud = { by, x, z };
    if (z < floorZ) floorZ = z;
  }
  out.floorZ = floorZ;
  if (proud.by > 0.01) fail(out, `The blank is too thin: ${Math.abs(proud.x - seamX).toFixed(0)} mm off the seam the surface stands ${proud.z.toFixed(1)} mm and the blank ${roof(proud.x).toFixed(1)} mm.`);

  // the raster: lines evenly across the area, both edges included, sampled at the grid's rows
  let stepover = g.stage === 'rough' ? SURFACE.roughStepover * bit.diameter : 2 * Math.sqrt(2 * r * SURFACE.scallop - SURFACE.scallop ** 2);
  let n = Math.max(1, Math.ceil((area.maxX - area.minX) / stepover));
  let lineXs = Array.from({ length: n + 1 }, (_, i) => area.minX + ((area.maxX - area.minX) * i) / n);
  let j0 = Math.max(0, Math.floor((area.minY - t.y0) / grid)), j1 = Math.min(t.ny - 1, Math.ceil((area.maxY - t.y0) / grid));
  let yMin = t.y0 + j0 * grid, yMax = t.y0 + j1 * grid;
  let levels: number[] = [];
  if (g.stage === 'rough' && bit.feeds && bit.feeds.stepDown > 0) {
    let floor = thickness + SURFACE.leave;
    for (let z = g.stock.thickness - bit.feeds.stepDown; ; z -= bit.feeds.stepDown) {
      levels.push(Math.max(floor, z));
      if (z <= floor) break;
    }
  }
  let linesAt = (level: number) => lineXs.filter(x => roof(x) > level);
  let metres = (g.stage === 'rough' ? levels.reduce((sum, level) => sum + linesAt(level).length, 0) : lineXs.length) * (yMax - yMin) / 1000;
  out.raster = { xs: lineXs, yMin, yMax, levels, metres };
  if (!fine || out.failures.length) return out;
  if (g.stage === 'rough' && !bit.feeds) return fail(out, 'No feeds for this bit.');

  let tip = (x: number) => tipHeights(t, r, x, bit.shape === 'ball');
  if (g.stage === 'rough') {
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

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// the height field over the bed on a grid: the plate's surface where there is plate, the land's
// height beyond it
interface Terrain {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  step: number;
  z: Float64Array;
}

function terrainGrid(surface: PlateSurface, thickness: number, area: Bounds, pad: number, step: number): Terrain {
  let x0 = area.minX - pad, y0 = area.minY - pad;
  let nx = Math.ceil((area.maxX + pad - x0) / step) + 1, ny = Math.ceil((area.maxY + pad - y0) / step) + 1;
  let z = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    let y = y0 + j * step;
    let row = rowAt(surface, y);
    for (let i = 0; i < nx; i++) z[j * nx + i] = thickness + (surfaceZAt(surface, x0 + i * step, y, row) ?? 0);
  }
  return { x0, y0, nx, ny, step, z };
}

// the tip's height down one line at x, at every row of the grid: the highest the bit's footprint
// finds, a flat bit's being the terrain under its whole face, a ball's the terrain lifted by how
// far the ball curves away from its tip there, and never under the terrain read between the
// columns at the tip itself. The footprint's cells are set out once per line, from the column
// nearest it
function tipHeights(t: Terrain, r: number, x: number, ball: boolean): Float64Array {
  let ci = Math.round((x - t.x0) / t.step);
  let fx = x - (t.x0 + ci * t.step);
  let i0 = Math.min(Math.max(Math.floor((x - t.x0) / t.step), 0), t.nx - 2), f = (x - (t.x0 + i0 * t.step)) / t.step;
  let m = Math.ceil(r / t.step) + 1;
  let cells: { di: number; dj: number; lift: number }[] = [];
  for (let dj = -m; dj <= m; dj++) for (let di = -m; di <= m; di++) {
    let dx = di * t.step - fx, dy = dj * t.step;
    let d2 = dx * dx + dy * dy;
    if (d2 > r * r) continue;
    cells.push({ di, dj, lift: ball ? Math.sqrt(r * r - d2) - r : 0 });
  }
  let out = new Float64Array(t.ny).fill(-Infinity);
  for (let j = 0; j < t.ny; j++) {
    let best = t.z[j * t.nx + i0] * (1 - f) + t.z[j * t.nx + i0 + 1] * f;
    for (let { di, dj, lift } of cells) {
      let i = ci + di, jj = j + dj;
      if (i < 0 || i >= t.nx || jj < 0 || jj >= t.ny) continue;
      let z = t.z[jj * t.nx + i] + lift;
      if (z > best) best = z;
    }
    out[j] = best;
  }
  return out;
}

// the lines joined end to end, the first up the length and the next back down it, each line
// thinned to what the file needs; the joins between lines are kept, so the run never lifts
function serpentine(lineXs: number[], j0: number, j1: number, t: Terrain, zAt: (x: number) => (j: number) => number): Pt3D[] {
  let out: Pt3D[] = [];
  lineXs.forEach((x, l) => {
    let z = zAt(x);
    let line: Pt3D[] = [];
    let up = l % 2 === 0;
    for (let k = j0; k <= j1; k++) {
      let j = up ? k : j1 - (k - j0);
      line.push(new Pt3D(x, t.y0 + j * t.step, z(j)));
    }
    out.push(...simplifyPolyline3D(line, SURFACE.chordTolerance));
  });
  return out;
}

// what any export's planner builds: closed loops for the cutter's centre, the climbing way round
// (counterclockwise outside, clockwise inside, for a router turning clockwise), each with the tabs
// the sheet holds it by; or runs for the cutter's tip over a surface; and where the part sits in
// the sheet and what Z the file works between
export interface Tab {
  // along the loop, from its first point
  from: number;
  to: number;
  pts: Pt[];
  centre: Pt;
}

export interface Toolpath {
  name: string;
  // closed: its first point repeated last
  loop: Pt[];
  tabs: Tab[];
}

export interface SurfacePath {
  name: string;
  // the tip's run, Z over the bed
  pts: Pt3D[];
}

export interface Raster {
  // the x of every line, and the y they run between
  xs: number[];
  yMin: number;
  yMax: number;
  // the roughing's terraces, top first; none for finishing
  levels: number[];
  // of cutting, as planned
  metres: number;
}

export interface Toolpaths {
  paths: Toolpath[];
  surfaces: SurfacePath[];
  // world to sheet: the part centred in it
  sheetOffset: Pt;
  stockTopZ: number;
  // the file's own Z below which nothing moves
  floorZ: number;
  // header comments naming the zero and the stock
  notes: string[];
  // a surfacing job's lines, known before any height is
  raster?: Raster;
  failures: string[];
}

const SHEET_MARGIN = 5;

function emptyToolpaths(stockTopZ: number, floorZ: number, notes: string[]): Toolpaths {
  return { paths: [], surfaces: [], sheetOffset: { x: 0, y: 0 }, stockTopZ, floorZ, notes, failures: [] };
}

function fail(out: Toolpaths, message: string): Toolpaths {
  out.failures.push(message);
  return out;
}

// the part centred in the sheet by the extent of what it cuts, with a failure if it will not fit
function centreInSheet(out: Toolpaths, b: Bounds, g: StockSettings): void {
  out.sheetOffset = { x: g.stock.width / 2 - (b.minX + b.maxX) / 2, y: g.stock.length / 2 - (b.minY + b.maxY) / 2 };
  let needW = b.maxX - b.minX + 2 * SHEET_MARGIN;
  let needL = b.maxY - b.minY + 2 * SHEET_MARGIN;
  if (needW > g.stock.width || needL > g.stock.length) fail(out, `The sheet is too small: this part needs ${Math.ceil(needW)} × ${Math.ceil(needL)} mm.`);
}

// a loop as a toolpath: the climbing way round, started between two tabs, the tabs a run of the
// loop `width` long centred on stations (i + ½)/count of the way round from its top centre-line
// crossing, shifted by `phase` stations; `detail` edits the sampled ring before any of that
function planLoop(name: string, d: string, side: 'inside' | 'outside', count: number, phase: number, width: number, failures: string[], detail = (ring: Pt[]) => ring): Toolpath {
  let ring = detail(samplePathToPolyline(d, 1));
  if ((signedPolygonArea(ring) > 0) !== (side === 'outside')) ring.reverse();
  let loop = fromTopCentre(ring);
  let cum = polylineCumulativeLengths(loop);
  let total = cum[cum.length - 1];
  let tabs: Tab[] = [];
  if (count > 0 && total / count <= width) failures.push(`${name} is too short for ${count} tabs.`);
  else if (count > 0) {
    // start midway between the last station and the first, so no tab wraps the loop's ends
    let start = (((phase - 0.5) / count) * total + total) % total;
    if (start > 1e-9) {
      loop = [...polylineSlice(loop, cum, start, total), ...polylineSlice(loop, cum, 0, start).slice(1)];
      cum = polylineCumulativeLengths(loop);
    }
    for (let i = 0; i < count; i++) {
      let station = ((i + 0.5) / count) * total;
      let from = station - width / 2, to = station + width / 2;
      tabs.push({ from, to, pts: polylineSlice(loop, cum, from, to), centre: pointAtPolylineLength(loop, cum, station) });
    }
  }
  return { name, loop, tabs };
}

// the ring closed and restarted at its highest crossing of x = 0, the crossing itself a vertex
function fromTopCentre(ring: Pt[]): Pt[] {
  let n = ring.length;
  let best = -1;
  let top: Pt | null = null;
  for (let i = 0; i < n; i++) {
    let a = ring[i], b = ring[(i + 1) % n];
    if (a.x === b.x || a.x * b.x > 0) continue;
    let t = a.x / (a.x - b.x);
    let y = a.y + (b.y - a.y) * t;
    if (!top || y > top.y) {
      top = { x: 0, y };
      best = i;
    }
  }
  if (!top) return [...ring, ring[0]];
  return [top, ...ring.slice(best + 1), ...ring.slice(0, best + 1), top];
}

// the job for the writer: a profile job stepping down from the stock top to the floor, a surfacing
// job's runs as planned, either with the sheet offset applied so XY zero is the stock's lower left
export function gcodeJob(tp: Toolpaths, tool: Tool, feeds: Feeds, machine = MACHINE): GcodeJob {
  let plan = cutPlan(tp, feeds);
  let passes = tp.raster ? [] : Array.from({ length: plan.passes }, (_, i) => Math.max(plan.floorZ, plan.stockTopZ - (i + 1) * feeds.stepDown));
  let { x: dx, y: dy } = tp.sheetOffset;
  return {
    notes: [
      ...tp.notes,
      `Feeds ${feeds.cutFeed} cut, ${feeds.plungeFeed} plunge, ${feeds.stepDown} per pass`,
      'Air cut first',
    ],
    tool: { number: tool.number, name: tool.name },
    spindleRpm: machine.spindleRpm,
    safeZ: plan.stockTopZ + machine.safeZ,
    floorZ: plan.floorZ,
    passes,
    tabTop: machine.tabHeight,
    cutFeed: feeds.cutFeed,
    plungeFeed: feeds.plungeFeed,
    cuts: [
      ...tp.paths.map(path => ({
        name: path.name,
        loop: path.loop.map(p => ({ x: p.x + dx, y: p.y + dy })),
        tabs: path.tabs.map(t => ({ from: t.from, to: t.to })),
      })),
      ...tp.surfaces.map(s => ({ name: s.name, pts: s.pts.map(p => new Pt3D(p.x + dx, p.y + dy, p.z)) })),
    ],
  };
}

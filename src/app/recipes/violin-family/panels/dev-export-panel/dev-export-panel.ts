import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { buildGcode, downloadGcodeFile, GcodeJob } from '../../../../helpers/gcodeExporter';
import { closestPointOnSegment, dist, signedPolygonArea } from '../../../../helpers/math/simpleGeometry';
import { pathFromPolyline, pathsBounds, samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { pointAtPolylineLength, polylineCumulativeLengths, polylineSlice } from '../../../../helpers/math/vibeMath';
import { offsetPath } from '../../../../helpers/math/pathVibes';
import { inchFraction } from '../../../../helpers/nearestFraction';
import { renderCrosshair, renderPath, renderRect, renderText } from '../../../../helpers/renderFuncs';
import { safeRun } from '../../../../helpers/validators';
import { Pt, Rectangle } from '../../../../models/types';
import { info } from '../../../../shared/message-emitter';
import { MmInchField } from '../../../../shared/mm-inch-field';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { DASH, STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { MouldRelief, MouldSolve, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { MOULD_EXPORT_STEP, renderMould, solveMould } from '../mould-panel/mould-panel';

// G-code for the maker's own machine, offered on localhost only: the files drive a CNC, and nobody
// else's machine is ours to answer for. The source is open; the recipe names this panel only inside
// @defer, so a visitor's browser never fetches it. Not a CAM program: each
// export is one thing the shop cuts from the recipe (the mould today; plate contours, then their
// surfaces, scrolls and fingerboards to come), planned by code that knows that part, with the user
// saying only what the stock is and whether the wood is hard. The shop's settings are not the
// instrument's, so they live in this browser's localStorage, not on the recipe. The ⓘ's text is
// kept here, not in docs/, because this panel is never fetched off localhost.
//
// Adding an export: a row in EXPORTS, its stock settings on DevExportSettings, and a case in
// planExport that solves the part and returns its toolpaths and layers. Everything after that
// (the sheet, the tabs' lifts, the writer) is shared. In order below: the registry and settings,
// the machine and the tools, the component, the shared render and plan, the mould's planner, the
// toolpath types and loop planning, and the job handed to the G-code writer

export type ExportId = 'mould';

export interface ExportKind {
  id: ExportId;
  label: string;
}

export const EXPORTS: readonly ExportKind[] = [{ id: 'mould', label: 'Mould' }];

export type Wood = 'soft' | 'hard';

export interface StockSettings {
  stock: { thickness: number; width: number; length: number };
  wood: Wood;
}

// one stock per export: a mould comes out of a ply sheet, a plate will come out of a blank
export interface DevExportSettings {
  job: ExportId;
  mould: StockSettings;
}

export const DEFAULT_SETTINGS: DevExportSettings = {
  job: 'mould',
  mould: { stock: { thickness: 19, width: 300, length: 400 }, wood: 'soft' },
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

const MACHINE_HELP = {
  title: 'Dev Export: the fixed plan',
  text:
    'Everything not in a field is a constant in the panel, fixed so that no visit to the shop can drift it. The first mould was cut with these numbers.\n\n' +
    'Zero. Z0 is the spoilboard, so the file reads the stock top as Z thickness. A sheet thinner than typed still cuts through, and a reference set on the stock top (what once ruined a sheet) cannot creep. ' +
    'XY0 is the sheet\'s lower-left corner, where the BitZero finds it. The part is centred in the sheet, so there is no margin to set; the sheet only has to be the part plus a bit\'s width plus 5 mm a side.\n\n' +
    `Overcut ${MACHINE.overcut} mm. The last pass goes that far into the spoilboard: ply is nominal and the spoilboard is not flat, and a skin left under the part is worse than a scratch.\n\n` +
    `Safe Z ${MACHINE.safeZ} mm above the stock (half an inch). The only height the bit moves fast at, clear of clamps and tabs. Every drop is at plunge feed.\n\n` +
    `Tabs. ${MACHINE.tabWidth} mm along the path and ${MACHINE.tabHeight} mm high; the mould takes ${MOULD_TABS.outline} on the outline and ${MOULD_TABS.window} per window. ` +
    'They mirror across the centre line, the outline\'s sit out on the bouts so none lands in a block notch, and the windows are cut first so the full sheet still holds the mould while they are.\n\n' +
    'Direction. Climb cutting: counterclockwise round the outside, clockwise inside a window, for a router turning clockwise. Cleaner edge in ply, less tear-out.\n\n' +
    'Notch corners. Each block notch is cut as a dog-bone: the bit runs to the corner and presses in along the diagonal exactly as far as the drawn relief circle reaches, so the block seats square.\n\n' +
    'Feeds. Per bit and wood, from the bit maker\'s chart (Carbide 3D publishes one per bit and wood) or a chip-load table, with where each row came from noted beside it. A row the shop has cut with is marked so; cut scrap before trusting one that is not.\n\n' +
    `Spindle S${MACHINE.spindleRpm}. The router\'s dial sets the real speed; Carbide Motion still wants an M3 with an S word.\n\n` +
    'The download plans again from the fine solve the sheets export from, so the preview\'s coarser sampling never reaches the file.',
};

export interface Feeds {
  cutFeed: number;
  plungeFeed: number;
  stepDown: number;
}

// the shop's bits by diameter: the recipe's bit has to be one of these to get feeds. A row is the
// maker's published number for that bit and wood, or what a job here was cut at; where it came
// from is beside it. A null row is one nobody has looked up yet
export interface Tool {
  number: number;
  name: string;
  diameter: number;
  feeds: Record<Wood, Feeds | null>;
}

export const TOOLS: readonly Tool[] = [
  {
    number: 251, name: '1/4" downcut', diameter: 6.35,
    feeds: {
      // cut the first mould, 19 mm ply (75 ipm, 15 ipm, 0.06")
      soft: { cutFeed: 1905, plungeFeed: 381, stepDown: 1.524 },
      // Carbide Create's library default for the 1/4" #201 in hardwood (60 ipm, 12 ipm, 0.04"),
      // the #251 being its downcut twin; not yet cut here
      hard: { cutFeed: 1524, plungeFeed: 305, stepDown: 1.016 },
    },
  },
  { number: 102, name: '1/8" square', diameter: 3.175, feeds: { soft: null, hard: null } },
];

export function toolFor(diameter: number): Tool | null {
  return TOOLS.find(t => Math.abs(t.diameter - diameter) < 0.01) ?? null;
}

const STORAGE_KEY = 'devExport';
const WOODS: readonly Wood[] = ['soft', 'hard'];

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
      let plan = planExport(this.settings.job, this.params, this.bitDiameter, this.g, this.pal, this.flags);
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

  get bitDiameter(): number {
    return this.params.mould?.bitDiameter ?? NaN;
  }

  get tool(): Tool | null {
    return toolFor(this.bitDiameter);
  }

  get feeds(): Feeds | null {
    return this.tool?.feeds[this.g.wood] ?? null;
  }

  get cutPlan(): CutPlan | null {
    return this.feeds ? cutPlan(this.g, this.feeds) : null;
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
    let tool = this.tool, feeds = this.feeds;
    if (!tool || !feeds) return;
    let plan = planExport(this.settings.job, this.params, tool.diameter, this.g, this.pal, this.flags, true);
    if (!plan || plan.toolpaths.failures.length) return;
    let text = buildGcode(gcodeJob(plan.toolpaths, this.g, tool, feeds));
    downloadGcodeFile(`${this.fileName.trim() || 'violin-family'}-${this.job.id}.nc`, text);
  }
}

export interface ExportPlan {
  toolpaths: Toolpaths;
  // what the canvas shows for this job, in world coordinates: inSheet shifts them onto the sheet
  layers: RenderLayer[];
}

// one case per export: solve the part (finely for the file, coarsely for the preview), plan its
// toolpaths and say what to draw. Null when the recipe has not reached that part yet
export function planExport(job: ExportId, p: ViolinFamilyParams, bitDiameter: number, g: StockSettings, pal: PanelPalette, flags: ViolinFamilyViewFlags, fine = false): ExportPlan | null {
  switch (job) {
    case 'mould': {
      let s = fine ? solveMould(p, MOULD_EXPORT_STEP) : solveMould(p);
      if (!s) return null;
      let toolpaths = mouldToolpaths(s, bitDiameter, g);
      return { toolpaths, layers: [renderMould(s, pal, flags), renderSheet(toolpaths, g, pal), renderToolpaths(toolpaths, pal)] };
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

export interface CutPlan {
  stockTopZ: number;
  // the floor of the cut in the file's own Z, below which the emitter must refuse to move
  floorZ: number;
  passes: number;
}

export function cutPlan(g: StockSettings, feeds: Feeds): CutPlan {
  let depth = g.stock.thickness + MACHINE.overcut;
  return {
    stockTopZ: g.stock.thickness,
    floorZ: -MACHINE.overcut,
    passes: feeds.stepDown > 0 ? Math.ceil(depth / feeds.stepDown) : 0,
  };
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
    for (let key of ['thickness', 'width', 'length'] as const) {
      let n = mine?.stock?.[key];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[e.id].stock[key] = n;
    }
    if (WOODS.includes(mine?.wood)) out[e.id].wood = mine.wood;
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
  let out: Toolpaths = { paths: [], sheetOffset: { x: 0, y: 0 }, failures: [] };
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
  centreInSheet(out, bitDiameter, g);
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

// what any export's planner builds: closed loops for the cutter's centre, the climbing way round
// (counterclockwise outside, clockwise inside, for a router turning clockwise), each with the tabs
// the sheet holds it by, and where the part sits in the sheet
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

export interface Toolpaths {
  paths: Toolpath[];
  // world to sheet: the part centred in it
  sheetOffset: Pt;
  failures: string[];
}

const SHEET_MARGIN = 5;

function fail(out: Toolpaths, message: string): Toolpaths {
  out.failures.push(message);
  return out;
}

// the part centred in the sheet by the extent of its loops, with a failure if it will not fit
function centreInSheet(out: Toolpaths, bitDiameter: number, g: StockSettings): void {
  let b = pathsBounds(out.paths.map(path => pathFromPolyline(path.loop)));
  out.sheetOffset = { x: g.stock.width / 2 - (b.minX + b.maxX) / 2, y: g.stock.length / 2 - (b.minY + b.maxY) / 2 };
  let needW = b.width + bitDiameter + 2 * SHEET_MARGIN;
  let needL = b.height + bitDiameter + 2 * SHEET_MARGIN;
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

// the job for the writer: Z zero on the spoilboard, every pass a step down to the floor, the sheet
// offset applied so XY zero is the sheet's lower left
export function gcodeJob(tp: Toolpaths, g: StockSettings, tool: Tool, feeds: Feeds, machine = MACHINE): GcodeJob {
  let plan = cutPlan(g, feeds);
  let passes = Array.from({ length: plan.passes }, (_, i) => Math.max(plan.floorZ, plan.stockTopZ - (i + 1) * feeds.stepDown));
  let { x: dx, y: dy } = tp.sheetOffset;
  return {
    notes: [
      `Z0 = SPOILBOARD, stock top Z${plan.stockTopZ.toFixed(3)}`,
      `XY0 = SHEET LOWER LEFT, sheet ${g.stock.width} x ${g.stock.length}`,
      `Stock ${g.stock.thickness} mm, ${g.wood} wood`,
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
    cuts: tp.paths.map(path => ({
      name: path.name,
      loop: path.loop.map(p => ({ x: p.x + dx, y: p.y + dy })),
      tabs: path.tabs.map(t => ({ from: t.from, to: t.to })),
    })),
  };
}

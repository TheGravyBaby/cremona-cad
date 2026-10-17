import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { buildGcode, downloadGcodeFile, GcodeJob } from '../../../../helpers/gcodeExporter';
import { closestPointOnSegment, dist, signedPolygonArea } from '../../../../helpers/math/simpleGeometry';
import { pathFromPolyline, pathsBounds, samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { pointAtPolylineLength, polylineCumulativeLengths, polylineSlice } from '../../../../helpers/math/vibeMath';
import { offsetPath } from '../../../../helpers/math/pathVibes';
import { renderPath } from '../../../../helpers/renderFuncs';
import { safeRun } from '../../../../helpers/validators';
import { Pt } from '../../../../models/types';
import { MmInchField } from '../../../../shared/mm-inch-field';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { MouldRelief, MouldSolve, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { MOULD_EXPORT_STEP, renderMould, solveMould } from '../mould-panel/mould-panel';

// exports for the maker's own machine, offered on localhost only and never in a public build: the
// files drive a CNC, and nobody else's machine is ours to answer for. Tailored to the mould, not a
// CAM program: the user says what the sheet is and whether the wood is hard, the bit is the mould
// panel's, and everything else about the machine is fixed below. The shop's settings are not the
// instrument's, so they live in this browser's localStorage, not on the recipe. Panel and render,
// then the settings, the machine and the tools, the plan read off them, the toolpaths with their
// tabs, and the job handed to the G-code writer

export type Wood = 'soft' | 'hard';

export interface MouldGcodeSettings {
  stock: { thickness: number; width: number; length: number };
  wood: Wood;
}

// the sheet the first mould came out of
export const DEFAULT_MOULD_GCODE_SETTINGS: MouldGcodeSettings = {
  stock: { thickness: 19, width: 300, length: 400 },
  wood: 'soft',
};

// what never changes between moulds, so it is never asked. Z zero is the spoilboard, so a sheet
// thinner than typed still cuts through; XY zero is the sheet's lower left, where a BitZero finds
// it, and the mould is centred in the sheet. The router's dial sets its speed, but Carbide Motion
// still expects an M3 with an S word. mm and mm/min
export const MOULD_MACHINE = {
  overcut: 0.2,
  // above the stock's top
  safeZ: 12.7,
  outlineTabs: 4,
  windowTabs: 2,
  // along the path, bit included
  tabWidth: 18,
  tabHeight: 3,
  spindleRpm: 18000,
} as const;

export interface Feeds {
  cutFeed: number;
  plungeFeed: number;
  stepDown: number;
}

// Carbide's bits by diameter: the mould panel's bit has to be one of these to get feeds. A row is
// null until a job on the machine has proven it; read the numbers off Carbide Create's library and
// cut scrap before filling one in
export interface Tool {
  number: number;
  name: string;
  diameter: number;
  feeds: Record<Wood, Feeds | null>;
}

export const TOOLS: readonly Tool[] = [
  {
    number: 251, name: '1/4" downcut', diameter: 6.35,
    // the Carbide Create job that cut the first mould, 19 mm ply
    feeds: { soft: { cutFeed: 1905, plungeFeed: 381, stepDown: 1.524 }, hard: null },
  },
  { number: 102, name: '1/8" square', diameter: 3.175, feeds: { soft: null, hard: null } },
];

export function toolFor(diameter: number): Tool | null {
  return TOOLS.find(t => Math.abs(t.diameter - diameter) < 0.01) ?? null;
}

const STORAGE_KEY = 'devExport.mouldGcode';
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
  protected readonly machine = MOULD_MACHINE;
  protected readonly tools = TOOLS;

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Input() fileName = '';
  @Output() drawn = new EventEmitter<RenderLayer[]>();

  g: MouldGcodeSettings = readMouldGcodeSettings();
  // what the last draw planned; the template reads its failures
  toolpaths: MouldToolpaths | null = null;

  ngOnInit(): void {
    this.draw();
  }

  // the recipe is untouched, so an edit is stored here and never reaches the undo stack
  edited(): void {
    writeMouldGcodeSettings(this.g);
    this.draw();
  }

  report(): void {}

  draw(): void {
    safeRun(() => {
      let s = solveMould(this.params);
      this.toolpaths = s ? mouldToolpaths(s, this.bitDiameter, this.g) : null;
      this.drawn.emit(s ? [renderMould(s, this.pal, this.flags), renderToolpaths(this.toolpaths!, this.pal)] : []);
    });
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

  get cutPlan(): MouldCutPlan | null {
    return this.feeds ? mouldCutPlan(this.g, this.feeds) : null;
  }

  get canDownload(): boolean {
    return !!this.feeds && !!this.toolpaths && !this.toolpaths.failures.length;
  }

  reset(): void {
    this.g = JSON.parse(JSON.stringify(DEFAULT_MOULD_GCODE_SETTINGS));
    this.edited();
  }

  // planned again from the finer solve the sheets export from, not the preview's
  download(): void {
    let tool = this.tool, feeds = this.feeds;
    let s = solveMould(this.params, MOULD_EXPORT_STEP);
    if (!s || !tool || !feeds) return;
    let toolpaths = mouldToolpaths(s, tool.diameter, this.g);
    if (toolpaths.failures.length) return;
    let text = buildGcode(mouldGcodeJob(toolpaths, this.g, tool, feeds));
    downloadGcodeFile(`${this.fileName.trim() || 'violin-family'}-mould.nc`, text);
  }
}

// the cutter's centre line, faint, and the tabs as halos on it where the bit stays up
export const renderToolpaths = (tp: MouldToolpaths, pal: PanelPalette) => (g: any, ui: any): void => {
  for (let path of tp.paths) {
    renderPath(pathFromPolyline(path.loop), pal.ink(3), STROKE_WEIGHT.guide, 0.5)(g, ui);
    for (let tab of path.tabs) renderPath(pathFromPolyline(tab.pts), pal.ink(3), STROKE_WEIGHT.focusHalo, 0.6)(g, ui);
  }
};

export interface MouldCutPlan {
  stockTopZ: number;
  // the floor of the cut in the file's own Z, below which the emitter must refuse to move
  floorZ: number;
  passes: number;
}

export function mouldCutPlan(g: MouldGcodeSettings, feeds: Feeds): MouldCutPlan {
  let depth = g.stock.thickness + MOULD_MACHINE.overcut;
  return {
    stockTopZ: g.stock.thickness,
    floorZ: -MOULD_MACHINE.overcut,
    passes: feeds.stepDown > 0 ? Math.ceil(depth / feeds.stepDown) : 0,
  };
}

// a key missing or mistyped reads as its default, as SettingsService reads its own
export function readMouldGcodeSettings(): MouldGcodeSettings {
  let stored: any = {};
  try {
    let parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') stored = parsed;
  } catch {
    // unreadable reads as defaults
  }
  let out: MouldGcodeSettings = JSON.parse(JSON.stringify(DEFAULT_MOULD_GCODE_SETTINGS));
  for (let key of ['thickness', 'width', 'length'] as const) {
    let n = stored.stock?.[key];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out.stock[key] = n;
  }
  if (WOODS.includes(stored.wood)) out.wood = stored.wood;
  return out;
}

function writeMouldGcodeSettings(g: MouldGcodeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
  } catch {
    // a blocked store keeps the settings for this visit
  }
}

// the cutter's centre line for each loop: the windows shrunk by the bit's radius, the outline grown
// by it, each walked the climbing way round (counterclockwise outside, clockwise inside, for a
// router turning clockwise) from a point between two tabs. A tab is a run of the loop tabWidth
// long, centred on its station. Every loop's stations are set out from where it crosses the
// centre line at the top, so the tabs come out mirrored: the outline's ends are block notches, so
// its stations sit between them, out on the bouts; a window's long edges are its top and bottom,
// so its stations start there. Windows come before the outline, so the mould stays held. A
// notch's relief is not offset (the circle grown by the bit is a sliver no sampling follows) but
// cut as a dog-bone: the edges run to the corner, the bit presses in along the diagonal as far as
// the drawn relief reaches, and comes back out
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

export interface MouldToolpaths {
  paths: Toolpath[];
  // world to sheet: the mould centred in it
  sheetOffset: Pt;
  failures: string[];
}

const SHEET_MARGIN = 5;

export function mouldToolpaths(s: MouldSolve, bitDiameter: number, g: MouldGcodeSettings, machine = MOULD_MACHINE): MouldToolpaths {
  let out: MouldToolpaths = { paths: [], sheetOffset: { x: 0, y: 0 }, failures: [] };
  if (!s.outline) return fail(out, 'The mould has to solve first.');
  if (!(bitDiameter > 0)) return fail(out, 'The Mould panel needs a bit diameter above 0.');
  let r = bitDiameter / 2;
  s.clampBox.forEach((window, i) => {
    let d = offsetPath(window, -r);
    if (d) out.paths.push(planLoop(`Window ${i + 1}`, d, 'inside', machine.windowTabs, 0, machine.tabWidth, out.failures));
    else fail(out, `Window ${i + 1} is too narrow for the bit.`);
  });
  let d = offsetPath(s.notchOutline ?? s.outline, r);
  if (!d) return fail(out, 'The outline would not offset for the bit.');
  out.paths.push(planLoop('Outline', d, 'outside', machine.outlineTabs, 0.5, machine.tabWidth, out.failures, ring => withDogBones(ring, s.reliefs, r)));
  let b = pathsBounds([d]);
  out.sheetOffset = { x: g.stock.width / 2 - (b.minX + b.maxX) / 2, y: g.stock.length / 2 - (b.minY + b.maxY) / 2 };
  let needW = b.width + bitDiameter + 2 * SHEET_MARGIN;
  let needL = b.height + bitDiameter + 2 * SHEET_MARGIN;
  if (needW > g.stock.width || needL > g.stock.length) fail(out, `The sheet is too small: this mould needs ${Math.ceil(needW)} × ${Math.ceil(needL)} mm.`);
  return out;
}

function fail(out: MouldToolpaths, message: string): MouldToolpaths {
  out.failures.push(message);
  return out;
}

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
export function mouldGcodeJob(tp: MouldToolpaths, g: MouldGcodeSettings, tool: Tool, feeds: Feeds, machine = MOULD_MACHINE): GcodeJob {
  let plan = mouldCutPlan(g, feeds);
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

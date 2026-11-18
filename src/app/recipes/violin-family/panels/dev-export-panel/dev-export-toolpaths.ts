import { GcodeJob } from '../../../../helpers/gcodeExporter';
import { signedPolygonArea } from '../../../../helpers/math/simpleGeometry';
import { samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { pointAtPolylineLength, polylineCumulativeLengths, polylineSlice, simplifyPolyline3D } from '../../../../helpers/math/vibeMath';
import { Pt, Pt3D } from '../../../../models/types';
import { Feeds, MACHINE, StockSettings, SURFACE, Tool } from './dev-export-shop';

// what every export's planner shares: the toolpaths it returns, the stock it is placed in, the tabs
// that hold it, the height field a surfacing job reads, and the job handed to the G-code writer

export interface CutPlan {
  // where the passes start, and the floor in the file's own Z below which the writer refuses to move
  topZ: number;
  floorZ: number;
  passes: number;
  // how far the bit cuts
  metres: number;
}

// what the file steps through: the passes a surfacing planner counted, or a profile job's steps
// down from where its cut starts to the floor; and the cutting length, each loop once per pass
// and each run as it lies, or a raster's estimate while it has no runs yet
export function cutPlan(tp: Toolpaths, feeds: Feeds): CutPlan {
  let top = tp.cutTopZ ?? tp.stockTopZ;
  let passes = tp.passes ?? (feeds.stepDown > 0 ? Math.ceil((top - tp.floorZ) / feeds.stepDown) : 0);
  let length = (pts: Pt[]) => polylineCumulativeLengths(pts)[pts.length - 1] ?? 0;
  let mm = tp.paths.reduce((sum, path) => sum + length(path.loop) * passes, 0) + tp.surfaces.reduce((sum, run) => sum + length(run.pts), 0);
  return { topZ: top, floorZ: tp.floorZ, passes, metres: tp.paths.length || tp.surfaces.length ? mm / 1000 : tp.metres ?? 0 };
}

// the file's header, and the plan the panel shows: what the planner said of the zero, the stock
// and the cut, then the feeds and the passes
export function jobNotes(tp: Toolpaths, feeds: Feeds, machine = MACHINE): string[] {
  let plan = cutPlan(tp, feeds);
  let minutes = Math.round((plan.metres * 1000) / feeds.cutFeed);
  return [
    ...(tp.caution ? [tp.caution] : []),
    ...tp.notes,
    `Feeds ${feeds.cutFeed} cut, ${feeds.plungeFeed} plunge, ${feeds.stepDown} per pass`,
    `Z${plan.topZ.toFixed(3)} to Z${plan.floorZ.toFixed(3)} in ${plan.passes} pass${plan.passes === 1 ? '' : 'es'}, safe Z${(tp.stockTopZ + machine.safeZ).toFixed(3)}; about ${plan.metres.toFixed(1)} m, ${minutes} min at the cut feed`,
    'Air cut first',
  ];
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// the points' box, `pad` out on every side
export function boundsOf(pts: Pt[], pad: number): Bounds {
  let xs = pts.map(pt => pt.x), ys = pts.map(pt => pt.y);
  return { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad };
}

// a height field over the bed on a grid, a row at a time
export interface Terrain {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  step: number;
  z: Float64Array;
}

export function terrainGrid(area: Bounds, pad: number, step: number, rowZ: (y: number) => (x: number) => number): Terrain {
  let x0 = area.minX - pad, y0 = area.minY - pad;
  let nx = Math.ceil((area.maxX + pad - x0) / step) + 1, ny = Math.ceil((area.maxY + pad - y0) / step) + 1;
  let z = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    let zAt = rowZ(y0 + j * step);
    for (let i = 0; i < nx; i++) z[j * nx + i] = zAt(x0 + i * step);
  }
  return { x0, y0, nx, ny, step, z };
}

// the tip's height down one line at x, at every row of the grid: the highest the bit's footprint
// finds, a flat bit's being the terrain under its whole face, a ball's the terrain lifted by how
// far the ball curves away from its tip there, and never under the terrain read between the
// columns at the tip itself. The footprint's cells are set out once per line, from the column
// nearest it
export function tipHeights(t: Terrain, r: number, x: number, ball: boolean): Float64Array {
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
export function serpentine(lineXs: number[], j0: number, j1: number, t: Terrain, zAt: (x: number) => (j: number) => number): Pt3D[] {
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
}

export interface Toolpaths {
  paths: Toolpath[];
  surfaces: SurfacePath[];
  // world to the file: where the part lies from XY0
  sheetOffset: Pt;
  // the stock's lower-left corner from XY0: the origin for a sheet zeroed at its own corner, the
  // fences' corner for a blank or slab pushed into them
  stockOrigin: Pt;
  stockTopZ: number;
  // where a profile job's passes start, when not the stock top; and how high its tabs stand
  cutTopZ?: number;
  tabTop?: number;
  // the file's own Z below which nothing moves
  floorZ: number;
  // header comments naming the zero and the stock, and what the file assumes has been cut
  // already, said again at the machine's pause
  notes: string[];
  caution?: string;
  // the harness and its fences, drawn round the stock, in the file's own coordinates
  fixture?: string;
  // a surfacing job's lines, known before any height is, and its cutting length in metres
  // estimated from them, for the preview that has no runs yet
  raster?: Raster;
  metres?: number;
  // how many times the file goes down, where the planner counted
  passes?: number;
  failures: string[];
}

export const SHEET_MARGIN = 5;

const ORIGIN: Pt = { x: 0, y: 0 };

export function emptyToolpaths(stockTopZ: number, floorZ: number, notes: string[]): Toolpaths {
  return { paths: [], surfaces: [], sheetOffset: ORIGIN, stockOrigin: ORIGIN, stockTopZ, floorZ, notes, failures: [] };
}

export function fail(out: Toolpaths, message: string): Toolpaths {
  out.failures.push(message);
  return out;
}

// the part centred in the stock by the extent of what it cuts, with a failure if it will not fit
export function centreInSheet(out: Toolpaths, b: Bounds, g: StockSettings, origin: Pt = ORIGIN): void {
  out.stockOrigin = origin;
  out.sheetOffset = { x: origin.x + g.stock.width / 2 - (b.minX + b.maxX) / 2, y: origin.y + g.stock.length / 2 - (b.minY + b.maxY) / 2 };
  let needW = b.maxX - b.minX + 2 * SHEET_MARGIN;
  let needL = b.maxY - b.minY + 2 * SHEET_MARGIN;
  if (needW > g.stock.width || needL > g.stock.length) fail(out, `The sheet is too small: this part needs ${Math.ceil(needW)} × ${Math.ceil(needL)} mm.`);
}

// the part where the user put it in the stock (`offset` from the stock's corner), the stock where
// it sits from XY0, with a failure naming each side what it cuts runs off, the margin included
export function placeInSheet(out: Toolpaths, b: Bounds, g: StockSettings, offset: Pt, origin: Pt): void {
  out.stockOrigin = origin;
  out.sheetOffset = { x: origin.x + offset.x, y: origin.y + offset.y };
  let short = [
    ['left', SHEET_MARGIN - (b.minX + offset.x)],
    ['right', b.maxX + offset.x - (g.stock.width - SHEET_MARGIN)],
    ['bottom', SHEET_MARGIN - (b.minY + offset.y)],
    ['top', b.maxY + offset.y - (g.stock.length - SHEET_MARGIN)],
  ].filter(([, by]) => (by as number) > 0);
  if (short.length) fail(out, `The carved area runs off the blank: ${short.map(([side, by]) => `${Math.ceil(by as number)} mm at the ${side}`).join(', ')}.`);
}

// a loop sampled from a path the climbing way round, closed and restarted at its top centre-line
// crossing; `detail` edits the sampled ring before any of that
export function climbingLoop(d: string, side: 'inside' | 'outside', detail = (ring: Pt[]) => ring): Pt[] {
  let ring = detail(samplePathToPolyline(d, 1));
  if ((signedPolygonArea(ring) > 0) !== (side === 'outside')) ring.reverse();
  return fromTopCentre(ring);
}

// `count` stations evenly round the loop, the first `phase` stations in from its top centre
export function evenStations(count: number, phase: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + phase) / count);
}

// the loop as a toolpath with a tab `width` long centred on each station, a fraction of the way
// round from the loop's top centre; the loop is restarted midway between the last station and
// the first, so no tab wraps its ends
export function withTabs(name: string, loop: Pt[], stations: number[], width: number, failures: string[]): Toolpath {
  let cum = polylineCumulativeLengths(loop);
  let total = cum[cum.length - 1];
  let tabs: Tab[] = [];
  let count = stations.length;
  if (count > 0 && total / count <= width) failures.push(`${name} is too short for ${count} tabs.`);
  else if (count > 0) {
    let f = [...stations].sort((a, b) => a - b);
    let start = ((((f[0] + f[count - 1] - 1) / 2) % 1) * total + total) % total;
    if (start > 1e-9) {
      loop = [...polylineSlice(loop, cum, start, total), ...polylineSlice(loop, cum, 0, start).slice(1)];
      cum = polylineCumulativeLengths(loop);
    }
    for (let fr of f) {
      let station = ((fr * total - start) % total + total) % total;
      let from = station - width / 2, to = station + width / 2;
      tabs.push({ from, to, pts: polylineSlice(loop, cum, from, to), centre: pointAtPolylineLength(loop, cum, station) });
    }
  }
  return { name, loop, tabs };
}

// a run as a toolpath with a tab `width` long centred at each length along it; a tab that would
// reach either end is left out, since the run is cut from end to end
export function tabsAlong(name: string, run: Pt[], at: number[], width: number): Toolpath {
  let cum = polylineCumulativeLengths(run);
  let total = cum[cum.length - 1];
  let tabs: Tab[] = [];
  for (let s of [...at].sort((a, b) => a - b)) {
    let from = s - width / 2, to = s + width / 2;
    if (from <= 0 || to >= total) continue;
    tabs.push({ from, to, pts: polylineSlice(run, cum, from, to), centre: pointAtPolylineLength(run, cum, s) });
  }
  return { name, loop: run, tabs };
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
  let passes = tp.paths.length ? Array.from({ length: plan.passes }, (_, i) => Math.max(plan.floorZ, plan.topZ - (i + 1) * feeds.stepDown)) : [];
  let { x: dx, y: dy } = tp.sheetOffset;
  return {
    notes: jobNotes(tp, feeds, machine),
    caution: tp.caution,
    tool: { number: tool.number, name: tool.name },
    spindleRpm: machine.spindleRpm,
    safeZ: tp.stockTopZ + machine.safeZ,
    floorZ: plan.floorZ,
    passes,
    tabTop: tp.tabTop ?? plan.floorZ,
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

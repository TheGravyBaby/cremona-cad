// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGcode } from '../../../../helpers/gcodeExporter';
import { pointInPolygon, signedPolygonArea } from '../../../../helpers/math/simpleGeometry';
import { samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed, polylineCumulativeLengths } from '../../../../helpers/math/vibeMath';
import { Pt } from '../../../../models/types';
import { ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { OuterContourPanel } from '../outer-contour-panel/outer-contour-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { solveCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { MOULD_EXPORT_STEP, MouldPanel, solveMould } from '../mould-panel/mould-panel';
import { archingToolpaths, ArchingSettings, Bit, DEFAULT_SETTINGS, EXPORTS, ExportId, gcodeJob, MACHINE, MOULD_TABS, mouldToolpaths, planExport, SURFACE, Tab, TOOLS } from './dev-export-panel';
import { ThemeService } from '../../../../theme/theme.service';

// what a maker would check before cutting: the bit's centre runs a bit's radius off the cut line,
// the climbing way round, the windows before the outline; the tabs are where the machine says, the
// same both sides, never in a block's notch; the mould sits in the sheet; the arching's roughing
// never takes more than a step nor cuts into the leave, its finishing ball never cuts into the
// surface and does reach it; and the file the writer gets steps down to the floor and stays
// inside the sheet

const seeded = (): ViolinFamilyParams => {
  const p: ViolinFamilyParams = JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  OuterContourPanel.seed(p);
  FlutingPanel.seed(p);
  LongArchingPanel.seed(p);
  MouldPanel.seed(p);
  return p;
};

const flat: Bit = { diameter: TOOLS[0].diameter, shape: 'flat', feeds: TOOLS[0].feeds.soft };
const ball: Bit = { diameter: 6.35, shape: 'ball', feeds: null };
const bitFor = (id: ExportId, p: ViolinFamilyParams): Bit => id === 'mould' ? { diameter: p.mould!.bitDiameter, shape: 'flat', feeds: null } : flat;

const runLength = (tab: Tab): number => {
  const cum = polylineCumulativeLengths(tab.pts);
  return cum[cum.length - 1];
};

const settings = () => JSON.parse(JSON.stringify(DEFAULT_SETTINGS.mould));
const tool = TOOLS[0];
const feeds = tool.feeds.soft!;

describe('the mould toolpaths', () => {
  const p = seeded();
  const s = solveMould(p, MOULD_EXPORT_STEP)!;
  const tp = mouldToolpaths(s, p.mould!.bitDiameter, settings());
  const tabs = tp.paths.flatMap(path => path.tabs);
  const r = p.mould!.bitDiameter / 2;

  it('plan every window, then the outline, with nothing to report', () => {
    expect(s.failures).toEqual([]);
    expect(tp.failures).toEqual([]);
    expect(tp.paths.map(path => path.name)).toEqual([...s.clampBox.map((_, i) => `Window ${i + 1}`), 'Outline']);
  });

  // a bit radius off along the runs, out to the mitre at a notch mouth's corner (the rib arc meets
  // the notch side a little under square, so past r√2; 2r would be a corner of 60°), never nearer
  it('run a bit radius off the cut line, closed', () => {
    // one index per loop: a single index over them all would hold phantom runs from one loop's end to the next's start
    const cutLines = [s.outline!, ...s.clampBox].map(d => buildPolylineIndex(samplePathToPolyline(d, 0.25)));
    const toCutLine = (pt: Pt) => Math.min(...cutLines.map(idx => distPointToPolylineIndexed(pt, idx)));
    for (const path of tp.paths) {
      expect(path.loop[0]).toEqual(path.loop[path.loop.length - 1]);
      for (const pt of path.loop) {
        const d = toCutLine(pt);
        expect(d, `${path.name} at ${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}`).toBeGreaterThan(r - 0.05);
        expect(d, `${path.name} at ${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}`).toBeLessThan(2 * r);
      }
    }
  });

  it('run inside a window and outside the outline', () => {
    const loops = [s.outline!, ...s.clampBox].map(d => samplePathToPolyline(d, 0.5));
    for (const path of tp.paths) {
      const inside = path.name === 'Outline' ? loops[0] : loops[+path.name.replace('Window ', '')];
      const want = path.name !== 'Outline';
      for (const pt of path.loop) expect(pointInPolygon(pt, inside), `${path.name} at ${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}`).toBe(want);
    }
  });

  it('press a dog-bone into each notch corner, as far as the drawn relief', () => {
    const outline = tp.paths.at(-1)!.loop;
    expect(s.reliefs.length).toBe(8);
    for (const { corner, inward, reach } of s.reliefs) {
      const press = { x: corner.x + inward.x * (r - reach), y: corner.y + inward.y * (r - reach) };
      const at = outline.findIndex(pt => Math.hypot(pt.x - press.x, pt.y - press.y) < 1e-6);
      expect(at, `press at ${press.x.toFixed(2)}, ${press.y.toFixed(2)}`).toBeGreaterThan(0);
      const cornerPt = { x: corner.x + inward.x * r * Math.SQRT2, y: corner.y + inward.y * r * Math.SQRT2 };
      for (const pt of [outline[at - 1], outline[at + 1]]) expect(Math.hypot(pt.x - cornerPt.x, pt.y - cornerPt.y)).toBeLessThan(1e-6);
    }
  });

  it('climb: counterclockwise round the outline, clockwise inside a window', () => {
    for (const path of tp.paths) {
      const ccw = signedPolygonArea(path.loop.slice(0, -1)) > 0;
      expect(ccw, path.name).toBe(path.name === 'Outline');
    }
  });

  it('number the tabs as the machine holds the mould with', () => {
    expect(tabs.length).toBe(MOULD_TABS.outline + MOULD_TABS.window * s.clampBox.length);
    for (const tab of tabs) expect(runLength(tab)).toBeCloseTo(MACHINE.tabWidth, 1);
  });

  it('start each loop clear of its tabs, so no tab wraps the ends', () => {
    for (const path of tp.paths) {
      const total = polylineCumulativeLengths(path.loop).at(-1)!;
      for (const tab of path.tabs) {
        expect(tab.from).toBeGreaterThan(0);
        expect(tab.to).toBeLessThan(total);
      }
    }
  });

  // to the millimetre the loops are sampled at
  it('mirror the tabs across the centre line', () => {
    for (const tab of tabs) {
      const twin = tabs.find(t => t !== tab && Math.abs(t.centre.x + tab.centre.x) < 1 && Math.abs(t.centre.y - tab.centre.y) < 1);
      const where = tabs.map(t => `(${t.centre.x.toFixed(2)}, ${t.centre.y.toFixed(2)})`).join(' ');
      expect(twin ?? (Math.abs(tab.centre.x) < 1 ? tab : null), `tab at ${tab.centre.x}, ${tab.centre.y} among ${where}`).toBeTruthy();
    }
  });

  it('keep the tabs clear of the block notches', () => {
    const b = s.blocks!;
    const notches: Pt[][] = [b.neck, b.end, b.upperCorner, b.lowerCorner].flatMap(rect => {
      const q = [rect.Pt1, { x: rect.Pt2.x, y: rect.Pt1.y }, rect.Pt2, { x: rect.Pt1.x, y: rect.Pt2.y }];
      return [q, q.map(pt => ({ x: -pt.x, y: pt.y }))];
    });
    for (const tab of tabs) {
      for (const notch of notches) {
        expect(distPointToPolylineIndexed(tab.centre, buildPolylineIndex(notch)), `tab at ${tab.centre.x}, ${tab.centre.y}`).toBeGreaterThan(MACHINE.tabWidth / 2);
      }
    }
  });

  it('centre the mould in the sheet and refuse a sheet it will not fit', () => {
    const g = settings();
    const xs = tp.paths.at(-1)!.loop.map(pt => pt.x + tp.sheetOffset.x);
    const ys = tp.paths.at(-1)!.loop.map(pt => pt.y + tp.sheetOffset.y);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(g.stock.width, 1);
    expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(g.stock.length, 1);
    expect(Math.min(...xs, ...ys)).toBeGreaterThan(r);
    g.stock.width = 100;
    expect(mouldToolpaths(s, p.mould!.bitDiameter, g).failures.join(' ')).toMatch(/too small/);
  });

  it('report a bit the windows cannot take', () => {
    expect(mouldToolpaths(s, 60, settings()).failures.join(' ')).toMatch(/too narrow|offset/);
  });
});

describe('the exports on offer', () => {
  const p = seeded();
  const pal = ThemeService.getPalette('classicCremona');
  const flags = {} as any;

  // a row in the dropdown with no planner behind it would offer a download that never comes
  it('plan every export the dropdown lists, finely for the file as well', () => {
    for (const { id } of EXPORTS) {
      const g = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[id]));
      for (const fine of [false, true]) {
        const plan = planExport(id, p, bitFor(id, p), g, pal, flags, fine);
        expect(plan, `${id} fine=${fine}`).not.toBeNull();
        expect(plan!.toolpaths.failures, `${id} fine=${fine}`).toEqual([]);
        expect(plan!.toolpaths.paths.length + (fine ? plan!.toolpaths.surfaces.length : 1)).toBeGreaterThan(0);
        expect(plan!.layers.length).toBeGreaterThan(0);
      }
    }
  }, 30000);

  it('name a tool\'s feeds for every row they are filled in, within the machine\'s reach', () => {
    for (const tool of TOOLS) for (const feeds of Object.values(tool.feeds)) {
      if (!feeds) continue;
      expect(feeds.cutFeed).toBeGreaterThan(feeds.plungeFeed);
      expect(feeds.stepDown).toBeGreaterThan(0);
      expect(feeds.stepDown).toBeLessThanOrEqual(tool.diameter);
    }
  });
});

describe('the mould G-code job', () => {
  const p = seeded();
  const s = solveMould(p)!;
  const g = settings();
  const tp = mouldToolpaths(s, p.mould!.bitDiameter, g);
  const job = gcodeJob(tp, tool, feeds);

  it('steps down from the stock top to the floor', () => {
    expect(job.passes[0]).toBeCloseTo(g.stock.thickness - feeds.stepDown, 6);
    expect(job.passes.at(-1)).toBeCloseTo(-MACHINE.overcut, 6);
    for (let i = 1; i < job.passes.length; i++) {
      expect(job.passes[i]).toBeLessThan(job.passes[i - 1]);
      expect(job.passes[i - 1] - job.passes[i]).toBeLessThanOrEqual(feeds.stepDown + 1e-9);
    }
    expect(job.safeZ).toBeCloseTo(g.stock.thickness + MACHINE.safeZ, 6);
  });

  it('keeps every cut inside the sheet and names the zero', () => {
    for (const cut of job.cuts) for (const pt of 'loop' in cut ? cut.loop : cut.pts) {
      expect(pt.x).toBeGreaterThan(0);
      expect(pt.x).toBeLessThan(g.stock.width);
      expect(pt.y).toBeGreaterThan(0);
      expect(pt.y).toBeLessThan(g.stock.length);
    }
    expect(job.notes.join('\n')).toMatch(/SPOILBOARD/);
    expect(job.notes.join('\n')).toMatch(/LOWER LEFT/);
  });

  it('writes without tripping the writer', () => {
    const text = buildGcode(job);
    expect(text).toMatch(/M6 T251/);
    expect(text.split('\n').filter(l => l.startsWith('(Cut ')).length).toBe(tp.paths.length);
  });
});

describe('the arching toolpaths', () => {
  const p = seeded();
  const surface = solveCrossArching(p)!.top!;
  const thickness = p.arching!.top.thickness;
  const archHeight = p.arching!.top.arch.height;
  const arch = (over: Partial<ArchingSettings> = {}): ArchingSettings => ({ ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS.arching)), ...over });
  // the test's grid is coarser than the file's, so a footprint sampled on it can miss the true
  // high point by a little: second order for the ball, first order under the flat bit's edge
  const GRID = 1;
  const heightAt = (x: number, y: number) => thickness + (surfaceZAt(surface, x, y) ?? 0);
  const ring = (pt: { x: number; y: number }, r: number) => {
    const out: { x: number; y: number; d: number }[] = [];
    for (const f of [0, 0.5, 0.95]) for (let k = 0; k < 8; k++) {
      const d = f * r, a = (k / 8) * 2 * Math.PI;
      out.push({ x: pt.x + d * Math.cos(a), y: pt.y + d * Math.sin(a), d });
    }
    return out;
  };

  describe('finishing with the ball', () => {
    const g = arch({ stage: 'finish' });
    const tp = archingToolpaths(p, surface, ball, g, true, GRID);
    const r = ball.diameter / 2;
    const run = tp.surfaces[0]?.pts ?? [];

    it('is one run, its lines joined end to end a scallop\'s stepover apart', () => {
      expect(tp.failures).toEqual([]);
      expect(tp.surfaces.length).toBe(1);
      const stepover = tp.raster!.xs[1] - tp.raster!.xs[0];
      expect(stepover).toBeLessThanOrEqual(2 * Math.sqrt(2 * r * SURFACE.scallop));
      for (let i = 1; i < run.length; i++) expect(Math.abs(run[i].x - run[i - 1].x)).toBeLessThanOrEqual(stepover + 1e-6);
      expect(Math.min(...run.map(pt => pt.x))).toBeCloseTo(tp.raster!.xs[0], 6);
      expect(Math.max(...run.map(pt => pt.x))).toBeCloseTo(tp.raster!.xs.at(-1)!, 6);
    });

    it('never lets the ball into the surface', () => {
      for (let i = 0; i < run.length; i += 101) {
        const pt = run[i];
        for (const s of ring(pt, r)) {
          const ballZ = pt.z + r - Math.sqrt(r * r - s.d * s.d);
          expect(ballZ, `at ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}`).toBeGreaterThanOrEqual(heightAt(s.x, s.y) - 0.1);
        }
      }
    }, 20000);

    it('rests on the land, dips into the channel no further than the floor, and reaches the crown', () => {
      expect(run.some(pt => Math.abs(pt.z - thickness) < 1e-6)).toBe(true);
      expect(Math.min(...run.map(pt => pt.z))).toBeGreaterThanOrEqual(tp.floorZ);
      expect(tp.floorZ).toBeLessThan(thickness);
      expect(tp.floorZ).toBeGreaterThan(thickness - p.fluting!.top.depth - 1e-6);
      expect(Math.max(...run.map(pt => pt.z))).toBeCloseTo(thickness + archHeight, 0);
    });

    it('wants a ball', () => {
      expect(archingToolpaths(p, surface, flat, g, true, GRID).failures.join(' ')).toMatch(/ball/);
    });
  });

  describe('roughing with the flat bit', () => {
    const g = arch();
    const tp = archingToolpaths(p, surface, flat, g, true, GRID);
    const r = flat.diameter / 2;
    const levels = tp.raster!.levels;
    const stepDown = flat.feeds!.stepDown;

    it('terraces down a step at a time to the leave over the land', () => {
      expect(tp.failures).toEqual([]);
      expect(levels[0]).toBeCloseTo(g.stock.thickness - stepDown, 6);
      expect(levels.at(-1)).toBeCloseTo(thickness + SURFACE.leave, 6);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]).toBeLessThan(levels[i - 1]);
        expect(levels[i - 1] - levels[i]).toBeLessThanOrEqual(stepDown + 1e-9);
      }
      expect(tp.surfaces.length).toBeGreaterThan(1);
      expect(tp.surfaces.length).toBeLessThanOrEqual(levels.length);
    });

    it('rides at its terrace or above the leave, never under either', () => {
      for (const s of tp.surfaces) {
        const level = +s.name.replace('Rough Z', '');
        for (let i = 0; i < s.pts.length; i += 211) {
          const pt = s.pts[i];
          expect(pt.z).toBeGreaterThanOrEqual(level - 1e-9);
          for (const q of ring(pt, r)) expect(pt.z, `${s.name} at ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}`).toBeGreaterThanOrEqual(heightAt(q.x, q.y) + SURFACE.leave - 0.3);
        }
      }
    }, 20000);

    it('skips the lines the blank\'s roof never reaches on the top terrace', () => {
      const seamX = g.stock.width / 2 - tp.sheetOffset.x;
      const reach = (pts: { x: number }[]) => Math.max(...pts.map(pt => Math.abs(pt.x - seamX)));
      expect(reach(tp.surfaces[0].pts)).toBeLessThan(reach(tp.surfaces.at(-1)!.pts) / 2);
    });

    it('wants a flat bit, and feeds for it', () => {
      expect(archingToolpaths(p, surface, ball, g, true, GRID).failures.join(' ')).toMatch(/flat/);
      expect(archingToolpaths(p, surface, { ...flat, feeds: null }, g, true, GRID).failures.join(' ')).toMatch(/feeds/);
    });
  });

  it('refuses a blank the surface would stand proud of', () => {
    // a roof just clearing the crown falls under the flanks when the blank's edges are nothing
    const thin = archingToolpaths(p, surface, flat, arch({ stock: { thickness: thickness + archHeight + 0.5, edge: 0.5, width: 210, length: 400 } }), false);
    expect(thin.failures.join(' ')).toMatch(/too thin/);
    const low = archingToolpaths(p, surface, flat, arch({ stock: { thickness: thickness + archHeight - 1, edge: 10, width: 230, length: 400 } }), false);
    expect(low.failures.join(' ')).toMatch(/too thin/);
    expect(archingToolpaths(p, surface, flat, arch(), false).failures).toEqual([]);
  });

  it('centres the plate in the blank with the carved area a skirt past the outline', () => {
    const tp = archingToolpaths(p, surface, flat, arch(), false);
    const xs = surface.outline.map(pt => pt.x), ys = surface.outline.map(pt => pt.y);
    expect(tp.raster!.xs[0]).toBeCloseTo(Math.min(...xs) - SURFACE.skirt, 6);
    expect(tp.raster!.xs.at(-1)).toBeCloseTo(Math.max(...xs) + SURFACE.skirt, 6);
    expect(tp.raster!.yMin).toBeLessThanOrEqual(Math.min(...ys) - SURFACE.skirt);
    expect(tp.raster!.yMax).toBeGreaterThanOrEqual(Math.max(...ys) + SURFACE.skirt);
    expect(tp.raster!.xs[0] + tp.raster!.xs.at(-1)! + 2 * tp.sheetOffset.x).toBeCloseTo(DEFAULT_SETTINGS.arching.stock.width, 6);
  });

  describe('the G-code job', () => {
    const g = arch({ stage: 'finish' });
    const tp = archingToolpaths(p, surface, ball, g, true, 2);
    const job = gcodeJob(tp, TOOLS[2], feeds);

    it('runs the surface between the bed and the blank top, inside the blank', () => {
      expect(job.passes).toEqual([]);
      expect(job.floorZ).toBe(tp.floorZ);
      expect(job.safeZ).toBeCloseTo(g.stock.thickness + MACHINE.safeZ, 6);
      for (const cut of job.cuts) {
        expect('pts' in cut).toBe(true);
        for (const pt of 'pts' in cut ? cut.pts : []) {
          expect(pt.x).toBeGreaterThan(0);
          expect(pt.x).toBeLessThan(g.stock.width);
          expect(pt.y).toBeGreaterThan(0);
          expect(pt.y).toBeLessThan(g.stock.length);
          expect(pt.z).toBeGreaterThanOrEqual(tp.floorZ);
          expect(pt.z).toBeLessThan(g.stock.thickness);
        }
      }
      expect(job.notes.join('\n')).toMatch(/BED/);
    });

    it('writes without tripping the writer', () => {
      const text = buildGcode(job);
      expect(text).toMatch(/M6 T202/);
      expect(text.split('\n').filter(l => l.startsWith('(Surface ')).length).toBe(tp.surfaces.length);
    });
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGcode } from '../../../../helpers/gcodeExporter';
import { dist, normalizeRadians, pointInPolygon, pointOnCircle, signedPolygonArea } from '../../../../helpers/math/simpleGeometry';
import { pathFromCircle, samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed, polylineCumulativeLengths } from '../../../../helpers/math/vibeMath';
import { Pt } from '../../../../models/types';
import { ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { PlateContourPanel } from '../plate-contour-panel/plate-contour-panel';
import { FHolePlacementPanel } from '../fhole-placement-panel/fhole-placement-panel';
import { FHoleContoursPanel, defineFholePath, solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { solveCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { solvePlateContour } from '../plate-contour-panel/plate-contour-panel';
import { MOULD_EXPORT_STEP, MouldPanel, solveMould } from '../mould-panel/mould-panel';
import { NeckPanel, solveNeck } from '../neck-panel/neck-panel';
import { VolutePanel } from '../volute-panel/volute-panel';
import { solveScroll } from '../pegbox-panel/pegbox-panel';
import { solveStringSetup, StringSetupPanel } from '../string-setup-panel/string-setup-panel';
import { defaultPositionMarks, defineFingerboardFace, FaceCut, FaceJob, fingerboardSurfaceZAt, solvePositionMarks } from '../dev-fingerboard-panel/dev-fingerboard-panel';
import { archingToolpaths, contourToolpaths, cradleToolpaths, fholeToolpaths, fingerboardToolpaths, inlayToolpaths, mouldToolpaths, planExport, purflingToolpaths, scrollToolpaths, sideOutline } from './dev-export-panel';
import { Bit, CRADLE, CradleSettings, DEFAULT_SETTINGS, EXPORTS, ExportId, FHOLE, FholeSettings, FINGERBOARD, FingerboardSettings, MACHINE, MOULD_TABS, PLATE_TABS, PlateSettings, SCROLL, ScrollSettings, SURFACE, TOOLS } from './dev-export-shop';
import { cutPlan, gcodeJob, jobNotes, Tab } from './dev-export-toolpaths';
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
  PlateContourPanel.seed(p);
  FHolePlacementPanel.seed(p);
  FHoleContoursPanel.seed(p);
  FlutingPanel.seed(p);
  LongArchingPanel.seed(p);
  NeckPanel.seed(p);
  VolutePanel.seed(p);
  MouldPanel.seed(p);
  StringSetupPanel.seed(p);
  return p;
};

const flat: Bit = { diameter: TOOLS[0].diameter, shape: 'flat', feeds: TOOLS[0].feeds.soft };
const purflingBit = (): Bit => {
  const t = TOOLS.find(t => t.diameter === 1.2)!;
  return { diameter: t.diameter, shape: t.shape, feeds: t.feeds.soft };
};
const asBit = (t: { diameter: number; shape: Bit['shape']; angle?: number; feeds: { soft: Bit['feeds'] } }): Bit => ({ diameter: t.diameter, shape: t.shape, angle: t.angle, feeds: t.feeds.soft });
const eyeBit = (): Bit => asBit(TOOLS.find(t => t.number === DEFAULT_SETTINGS.tools.eyes)!);
const vBit = (): Bit => asBit(TOOLS.find(t => t.shape === 'v')!);
const bitFor = (id: ExportId, p: ViolinFamilyParams): Bit => id === 'mould' ? { diameter: p.mould!.bitDiameter, shape: 'flat', feeds: null } : id === 'purfling' ? purflingBit() : id === 'fholes' ? eyeBit() : flat;
const ball: Bit = { diameter: 6.35, shape: 'ball', feeds: null };

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

  // a row in the dropdown with no planner behind it would offer a download that never comes; and
  // the plan the panel shows is the file's header, which has to know the cut's length either way
  it('plan every export the dropdown lists, finely for the file as well, and say how long the cut is', () => {
    for (const { id } of EXPORTS) {
      for (const fine of [false, true]) {
        const plan = planExport(p, { ...DEFAULT_SETTINGS, job: id }, bitFor(id, p), pal, flags, fine);
        expect(plan, `${id} fine=${fine}`).not.toBeNull();
        expect(plan!.toolpaths.failures, `${id} fine=${fine}`).toEqual([]);
        expect(plan!.toolpaths.paths.length + (fine ? plan!.toolpaths.surfaces.length : 1)).toBeGreaterThan(0);
        expect(plan!.layers.length).toBeGreaterThan(0);
        expect(cutPlan(plan!.toolpaths, feeds).metres, `${id} fine=${fine}`).toBeGreaterThan(0);
        expect(jobNotes(plan!.toolpaths, feeds).join('\n'), `${id} fine=${fine}`).toMatch(/^Z-?[\d.]+ to Z-?[\d.]+ in \d+ pass/m);
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

  it('steps down from the stock top, its zero, through the sheet', () => {
    expect(job.passes[0]).toBeCloseTo(-feeds.stepDown, 6);
    expect(job.passes.at(-1)).toBeCloseTo(-g.stock.thickness - MACHINE.overcut, 6);
    expect(job.tabTop).toBeCloseTo(-g.stock.thickness + MACHINE.tabHeight, 6);
    for (let i = 1; i < job.passes.length; i++) {
      expect(job.passes[i]).toBeLessThan(job.passes[i - 1]);
      expect(job.passes[i - 1] - job.passes[i]).toBeLessThanOrEqual(feeds.stepDown + 1e-9);
    }
    expect(job.safeZ).toBeCloseTo(MACHINE.safeZ, 6);
  });

  it('keeps every cut inside the sheet and names the zero', () => {
    for (const cut of job.cuts) for (const pt of 'loop' in cut ? cut.loop : cut.pts) {
      expect(pt.x).toBeGreaterThan(0);
      expect(pt.x).toBeLessThan(g.stock.width);
      expect(pt.y).toBeGreaterThan(0);
      expect(pt.y).toBeLessThan(g.stock.length);
    }
    expect(job.notes.join('\n')).toMatch(/SHEET TOP/);
    expect(job.notes.join('\n')).toMatch(/LOWER LEFT/);
  });

  it('writes without tripping the writer', () => {
    const text = buildGcode(job);
    expect(text).toMatch(new RegExp(`M6 T${tool.number}\\b`));
    expect(text.split('\n').filter(l => l.startsWith('(Cut ')).length).toBe(tp.paths.length);
  });
});

describe('the arching toolpaths', () => {
  const p = seeded();
  const surface = solveCrossArching(p)!.top!;
  const thickness = p.arching!.top.thickness;
  const archHeight = p.arching!.top.long.height;
  const arch = (over: Partial<PlateSettings> = {}): PlateSettings => ({ ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS.plate)), ...over });
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
      const seamX = tp.stockOrigin.x + g.seam - tp.sheetOffset.x;
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
    const thin = archingToolpaths(p, surface, flat, arch({ stock: { thickness: thickness + archHeight + 0.5, edge: 0.5, width: 230, length: 400 } }), false);
    expect(thin.failures.join(' ')).toMatch(/too thin/);
    const low = archingToolpaths(p, surface, flat, arch({ stock: { thickness: thickness + archHeight - 1, edge: 10, width: 230, length: 400 } }), false);
    expect(low.failures.join(' ')).toMatch(/too thin/);
    expect(archingToolpaths(p, surface, flat, arch(), false).failures).toEqual([]);
  });

  it('mirrors the plate on the seam and centres it along the blank, the carved area a skirt past the outline', () => {
    const g = arch();
    const tp = archingToolpaths(p, surface, flat, g, false);
    const xs = surface.outline.map(pt => pt.x), ys = surface.outline.map(pt => pt.y);
    expect(tp.raster!.xs[0]).toBeCloseTo(Math.min(...xs) - SURFACE.skirt, 6);
    expect(tp.raster!.xs.at(-1)).toBeCloseTo(Math.max(...xs) + SURFACE.skirt, 6);
    expect(tp.raster!.yMin).toBeLessThanOrEqual(Math.min(...ys) - SURFACE.skirt);
    expect(tp.raster!.yMax).toBeGreaterThanOrEqual(Math.max(...ys) + SURFACE.skirt);
    expect(tp.sheetOffset.x).toBeCloseTo(g.fence.x + g.seam, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2 + tp.sheetOffset.y).toBeCloseTo(g.fence.y + g.stock.length / 2, 6);
    // a wider blank with the seam off its middle: the plate follows the seam
    const wide = { thickness: 22, edge: 10, width: 260, length: 420 };
    const moved = archingToolpaths(p, surface, flat, arch({ stock: wide, seam: g.seam + 7 }), false);
    expect(moved.failures).toEqual([]);
    expect(moved.sheetOffset.x - tp.sheetOffset.x).toBeCloseTo(7, 6);
    expect(moved.sheetOffset.y).toBeCloseTo(tp.sheetOffset.y, 6);
    expect(archingToolpaths(p, surface, flat, arch({ seam: 60 }), false).failures.join(' ')).toMatch(/runs off the blank.*left/);
    expect(archingToolpaths(p, surface, flat, arch({ stock: { ...wide, length: 360 } }), false).failures.join(' ')).toMatch(/runs off the blank.*bottom.*top/);
    // the blank in the harness: the file shifts to the fences' corner, the fit does not change
    const held = archingToolpaths(p, surface, flat, arch({ fence: { x: 30, y: 12 } }), false);
    expect(held.failures).toEqual([]);
    expect(held.sheetOffset.x - tp.sheetOffset.x).toBeCloseTo(30 - g.fence.x, 6);
    expect(held.sheetOffset.y - tp.sheetOffset.y).toBeCloseTo(12 - g.fence.y, 6);
    expect(held.stockOrigin).toEqual({ x: 30, y: 12 });
    expect(held.notes.join(' ')).toMatch(/HARNESS ZERO, fences at X30 Y12/);
  });

  describe('the G-code job', () => {
    const g = arch({ stage: 'finish' });
    const tp = archingToolpaths(p, surface, ball, g, true, 2);
    const ballTool = TOOLS.find(t => t.shape === 'ball' && t.diameter === ball.diameter)!;
    const job = gcodeJob(tp, ballTool, ballTool.feeds.soft!);

    it('runs the surface between the bed and the blank top, inside the blank', () => {
      expect(job.passes).toEqual([]);
      expect(job.floorZ).toBe(tp.floorZ);
      expect(job.safeZ).toBeCloseTo(g.stock.thickness + MACHINE.safeZ, 6);
      for (const cut of job.cuts) {
        expect('pts' in cut).toBe(true);
        for (const pt of 'pts' in cut ? cut.pts : []) {
          expect(pt.x).toBeGreaterThan(tp.stockOrigin.x);
          expect(pt.x).toBeLessThan(tp.stockOrigin.x + g.stock.width);
          expect(pt.y).toBeGreaterThan(tp.stockOrigin.y);
          expect(pt.y).toBeLessThan(tp.stockOrigin.y + g.stock.length);
          expect(pt.z).toBeGreaterThanOrEqual(tp.floorZ);
          expect(pt.z).toBeLessThan(g.stock.thickness);
        }
      }
      expect(job.notes.join('\n')).toMatch(/BED/);
    });

    it('writes without tripping the writer', () => {
      const text = buildGcode(job);
      expect(text).toMatch(new RegExp(`M6 T${ballTool.number}\\b`));
      expect(text.split('\n').filter(l => l.startsWith('(Surface ')).length).toBe(tp.surfaces.length);
    });
  });
});

describe('the purfling channel toolpaths', () => {
  const p = seeded();
  const surface = solveCrossArching(p)!.top!;
  const o = solvePlateContour(p)!;
  const thickness = p.arching!.top.thickness;
  const width = p.plateContour!.purflingChannelDepth;
  const purfling = (over: Partial<PlateSettings> = {}): PlateSettings => ({ ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS.plate)), ...over });
  const cutter = (diameter: number): Bit => ({ diameter, shape: 'flat', feeds: { cutFeed: 1016, plungeFeed: 508, stepDown: 0.6 } });
  const edges = [o.purfling!, o.outerPurfling!].map(d => buildPolylineIndex(samplePathToPolyline(d, 0.25)));

  describe('with a bit the channel\'s width', () => {
    const g = purfling();
    const bit = cutter(width);
    const tp = purflingToolpaths(p, surface, bit, g, true);
    const run = tp.surfaces[0]?.pts ?? [];

    it('is one pass, as many rounds as steps down to the strip height', () => {
      expect(tp.failures).toEqual([]);
      expect(tp.surfaces.length).toBe(1);
      expect(tp.passes).toBe(Math.ceil(g.purflingDepth / bit.feeds!.stepDown));
    });

    it('keeps the cutter inside the channel, between the two purfling lines', () => {
      const r = bit.diameter / 2;
      for (let i = 0; i < run.length; i += 7) {
        const pt = run[i];
        for (const edge of edges) expect(distPointToPolylineIndexed(pt, edge), `at ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}`).toBeGreaterThanOrEqual(r - 0.06);
      }
    });

    it('holds one flat depth under the edge each round, a step at a time to the strip height', () => {
      const under = run.map(pt => thickness - pt.z);
      expect(Math.min(...under)).toBeCloseTo(bit.feeds!.stepDown, 6);
      expect(Math.max(...under)).toBeCloseTo(g.purflingDepth, 6);
      const depths = [...new Set(under.map(d => +d.toFixed(6)))].sort((a, b) => a - b);
      expect(depths.length).toBe(tp.passes);
      for (let i = 1; i < depths.length; i++) expect(depths[i] - depths[i - 1]).toBeLessThanOrEqual(bit.feeds!.stepDown + 1e-9);
      expect(tp.floorZ).toBeCloseTo(thickness - g.purflingDepth, 6);
    });

    it('closes every round where it started and dives in place to the next', () => {
      const dives = run.filter((pt, i) => i > 0 && pt.x === run[i - 1].x && pt.y === run[i - 1].y && pt.z < run[i - 1].z);
      expect(dives.length).toBe(tp.passes! - 1);
      expect(run[0].x).toBeCloseTo(run[run.length - 1].x, 6);
      expect(run[0].y).toBeCloseTo(run[run.length - 1].y, 6);
    });
  });

  it('takes a narrower bit across in passes, and refuses a wider one or a ball', () => {
    const narrow = purflingToolpaths(p, surface, cutter(width * 0.8), purfling(), true);
    expect(narrow.failures).toEqual([]);
    expect(narrow.surfaces.length).toBe(2);
    const r = width * 0.4;
    for (const s of narrow.surfaces) for (let i = 0; i < s.pts.length; i += 11) {
      for (const edge of edges) expect(distPointToPolylineIndexed(s.pts[i], edge)).toBeGreaterThanOrEqual(r - 0.06);
    }
    expect(purflingToolpaths(p, surface, cutter(width + 0.3), purfling(), false).failures.join(' ')).toMatch(/wider/);
    expect(purflingToolpaths(p, surface, { ...cutter(width), shape: 'ball' }, purfling(), false).failures.join(' ')).toMatch(/flat/);
  });

  it('sits in the blank exactly as the arching does', () => {
    const a = archingToolpaths(p, surface, flat, purfling(), false);
    const c = purflingToolpaths(p, surface, cutter(width), purfling(), false);
    expect(c.sheetOffset).toEqual(a.sheetOffset);
    expect(c.stockTopZ).toBe(a.stockTopZ);
  });

  it('writes as surface runs inside the blank', () => {
    const g = purfling();
    const tp = purflingToolpaths(p, surface, cutter(width), g, true);
    const tool = TOOLS.find(t => Math.abs(t.diameter - width) < 0.01 && t.shape === 'flat')!;
    const job = gcodeJob(tp, tool, tool.feeds.soft!);
    expect(job.passes).toEqual([]);
    for (const cut of job.cuts) for (const pt of 'pts' in cut ? cut.pts : []) {
      expect(pt.x).toBeGreaterThan(tp.stockOrigin.x);
      expect(pt.x).toBeLessThan(tp.stockOrigin.x + g.stock.width);
      expect(pt.y).toBeGreaterThan(tp.stockOrigin.y);
      expect(pt.y).toBeLessThan(tp.stockOrigin.y + g.stock.length);
    }
    const text = buildGcode(job);
    expect(text.split('\n').filter(l => l.startsWith('(Surface Purfling')).length).toBe(tp.surfaces.length);
    expect(text).toMatch(/\(MSG, EXPECTS A SURFACED PLATE/);
  });
});

describe('the contour toolpaths', () => {
  const p = seeded();
  const o = solvePlateContour(p)!;
  const g: PlateSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.plate));
  const r = flat.diameter / 2;

  for (const plate of ['top', 'back'] as const) {
    describe(`the ${plate}`, () => {
      const surface = solveCrossArching(p)![plate]!;
      const thickness = p.arching![plate].thickness;
      const tp = contourToolpaths(p, surface, o, flat, { ...g, plate });
      const path = tp.paths[0];
      const outline = buildPolylineIndex(samplePathToPolyline(plate === 'top' ? o.top! : o.back!, 0.25));

      // a radius off along the edge; at a corner's point the offset runs a little further out,
      // which leaves the point fat for the knife rather than cutting into it
      it('runs a bit radius outside the outline, counterclockwise and closed', () => {
        expect(tp.failures).toEqual([]);
        expect(tp.paths.length).toBe(1);
        expect(path.loop[0]).toEqual(path.loop[path.loop.length - 1]);
        expect(signedPolygonArea(path.loop.slice(0, -1))).toBeGreaterThan(0);
        for (const pt of path.loop) {
          const d = distPointToPolylineIndexed(pt, outline);
          expect(d, `at ${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}`).toBeGreaterThan(r - 0.05);
          expect(d, `at ${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}`).toBeLessThan(2 * r);
          expect(pointInPolygon(pt, samplePathToPolyline(plate === 'top' ? o.top! : o.back!, 0.5))).toBe(false);
        }
      });

      it('holds the plate by six tabs, mirrored, on the bouts and the waists, clear of the corners', () => {
        expect(path.tabs.length).toBe(6);
        for (const tab of path.tabs) {
          expect(runLength(tab)).toBeCloseTo(PLATE_TABS.width, 1);
          const twin = path.tabs.find(t => t !== tab && Math.abs(t.centre.x + tab.centre.x) < 1.5 && Math.abs(t.centre.y - tab.centre.y) < 1.5);
          expect(twin, `tab at ${tab.centre.x.toFixed(1)}, ${tab.centre.y.toFixed(1)}`).toBeTruthy();
          for (const corner of [p.corners!.UCr, p.corners!.LCr]) expect(Math.abs(tab.centre.y - corner.y)).toBeGreaterThan(8);
          expect(tab.from).toBeGreaterThan(0);
          expect(tab.to).toBeLessThan(polylineCumulativeLengths(path.loop).at(-1)!);
        }
      });

      it('cuts from the land through the bed, under a safe height that clears the seam, and says it expects one', () => {
        const job = gcodeJob(tp, tool, feeds);
        expect(job.caution).toMatch(/SURFACED PLATE/);
        expect(buildGcode(job)).toMatch(/\(MSG, EXPECTS A SURFACED PLATE/);
        expect(job.passes[0]).toBeCloseTo(thickness - feeds.stepDown, 6);
        expect(job.passes.at(-1)).toBeCloseTo(-MACHINE.overcut, 6);
        expect(job.tabTop).toBe(PLATE_TABS.height);
        expect(job.safeZ).toBeCloseTo(g.stock.thickness + MACHINE.safeZ, 6);
        expect(job.safeZ).toBeGreaterThan(g.stock.thickness);
        const text = buildGcode(job);
        expect(text.split('\n').filter(l => l.startsWith('(Cut ')).length).toBe(1);
      });

      it('sits in the blank exactly as the arching does', () => {
        const a = archingToolpaths(p, surface, flat, { ...g, plate }, false);
        expect(tp.sheetOffset).toEqual(a.sheetOffset);
      });
    });
  }

  it('wants a flat bit', () => {
    const surface = solveCrossArching(p)!.top!;
    expect(contourToolpaths(p, surface, o, ball, g).failures.join(' ')).toMatch(/flat/);
  });
});

describe('the cradle toolpaths', () => {
  const p = seeded();
  const o = solvePlateContour(p)!;
  const cradle = (over: Partial<CradleSettings> = {}): CradleSettings => ({ ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS.cradle)), ...over });
  const bed = -DEFAULT_SETTINGS.cradle.stock.thickness;
  const lip = -CRADLE.wall;
  const r = flat.diameter / 2;

  for (const plate of ['top', 'back'] as const) {
    describe(`for the ${plate}`, () => {
      const surface = solveCrossArching(p)![plate]!;
      const outlineD = plate === 'top' ? o.top! : o.back!;
      const outline = buildPolylineIndex(samplePathToPolyline(outlineD, 0.25));
      const inside = samplePathToPolyline(outlineD, 0.5);

      it('clears the pocket in loops between the lip and the wall, clockwise, down to the lip', () => {
        const tp = cradleToolpaths(p, surface, o, flat, cradle({ plate }));
        expect(tp.failures).toEqual([]);
        expect(tp.paths.length).toBeGreaterThan(1);
        let outermost = 0;
        for (const path of tp.paths) {
          expect(path.tabs).toEqual([]);
          expect(signedPolygonArea(path.loop.slice(0, -1))).toBeLessThan(0);
          for (const pt of path.loop) {
            const d = distPointToPolylineIndexed(pt, outline);
            expect(pointInPolygon(pt, inside), `${path.name} at ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}`).toBe(true);
            // the bit's edge never past the pocket's side, and the loops reach the lip's inner edge
            expect(d, `${path.name} at ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}`).toBeGreaterThan(r - CRADLE.clearance - 0.05);
            outermost = Math.max(outermost, d);
          }
        }
        expect(outermost).toBeGreaterThan(CRADLE.lip - r - 0.5);
        const job = gcodeJob(tp, tool, feeds);
        expect(job.passes[0]).toBeCloseTo(-feeds.stepDown, 6);
        expect(job.passes.at(-1)).toBeCloseTo(lip, 6);
      });

      it('cuts the hole through along the lip\'s inner edge, clockwise, held by mirrored tabs', () => {
        const tp = cradleToolpaths(p, surface, o, flat, cradle({ plate, stage: 'hole' }));
        expect(tp.failures).toEqual([]);
        expect(tp.paths.length).toBe(1);
        const path = tp.paths[0];
        expect(signedPolygonArea(path.loop.slice(0, -1))).toBeLessThan(0);
        for (const pt of path.loop) {
          const d = distPointToPolylineIndexed(pt, outline);
          // the eroded line scallops a hair at the button's concave base
          expect(d, `at ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}`).toBeGreaterThan(CRADLE.lip - r - 0.1);
          expect(pointInPolygon(pt, inside)).toBe(true);
        }
        expect(path.tabs.length).toBe(CRADLE.tabs);
        for (const tab of path.tabs) {
          expect(runLength(tab)).toBeCloseTo(MACHINE.tabWidth, 1);
          const twin = path.tabs.find(t => t !== tab && Math.abs(t.centre.x + tab.centre.x) < 1 && Math.abs(t.centre.y - tab.centre.y) < 1);
          expect(twin ?? (Math.abs(tab.centre.x) < 1 ? tab : null), `tab at ${tab.centre.x.toFixed(1)}, ${tab.centre.y.toFixed(1)}`).toBeTruthy();
        }
        const job = gcodeJob(tp, tool, feeds);
        expect(job.passes[0]).toBeCloseTo(-feeds.stepDown, 6);
        expect(job.passes.at(-1)).toBeCloseTo(bed - MACHINE.overcut, 6);
        expect(job.tabTop).toBeCloseTo(bed + MACHINE.tabHeight, 6);
        expect(buildGcode(job)).toMatch(/\(Cut Hole\)/);
      });

      it('centres the plate in the slab, the same for both stages, zeroed at the slab\'s own corner', () => {
        const pocket = cradleToolpaths(p, surface, o, flat, cradle({ plate }));
        const hole = cradleToolpaths(p, surface, o, flat, cradle({ plate, stage: 'hole' }));
        expect(hole.sheetOffset).toEqual(pocket.sheetOffset);
        const xs = surface.outline.map(pt => pt.x);
        expect(Math.min(...xs) + Math.max(...xs) + 2 * pocket.sheetOffset.x).toBeCloseTo(DEFAULT_SETTINGS.cradle.stock.width, 6);
        expect(pocket.stockOrigin).toEqual({ x: 0, y: 0 });
        expect(pocket.notes.join(' ')).toMatch(/SLAB LOWER LEFT/);
      });
    });
  }

  it('refuses a ball, a slab the crown would touch the bed through, and a lip the arch reaches', () => {
    const surface = solveCrossArching(p)!.top!;
    expect(cradleToolpaths(p, surface, o, ball, cradle()).failures.join(' ')).toMatch(/flat/);
    const thin = cradleToolpaths(p, surface, o, flat, cradle({ stock: { thickness: 16, width: 230, length: 420 } }));
    expect(thin.failures.join(' ')).toMatch(/too thin/);
    const wide = cradleToolpaths(p, surface, o, flat, cradle(), { ...CRADLE, lip: 14 });
    expect(wide.failures.join(' ')).toMatch(/lip (reaches under the arch|is too wide)/);
  });
});

describe('the f-hole toolpaths', () => {
  const p = seeded();
  const o = solvePlateContour(p)!;
  const s = solveFholeContours(p)!;
  const arching = solveCrossArching(p)!;
  const surface = arching.top!;
  const cradle = (over: Partial<CradleSettings> = {}): CradleSettings => ({ ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS.cradle)), ...over });
  const fholes = (over: Partial<FholeSettings> = {}): FholeSettings => ({ ...DEFAULT_SETTINGS.fholes, ...over });
  const seat = (c: CradleSettings) => arching[c.plate]!;
  const lipZ = -CRADLE.wall;
  const edge = p.arching!.top.thickness;
  // the outside of the plate as it rests face up on the lip
  const zAt = (pt: Pt) => lipZ + edge + (surfaceZAt(surface, pt.x, pt.y) ?? 0);
  const eyes = [p.fHoles!.UEye, p.fHoles!.LEye];
  const mirror = (c: Pt) => ({ x: -c.x, y: c.y });

  it('solves whole, with the f-holes seeded', () => {
    expect(s.path).toBeTruthy();
    expect(defineFholePath(p, s, true)).toBeTruthy();
  });

  describe('the eyes', () => {
    const bit = eyeBit();
    const r = bit.diameter / 2;
    const tp = fholeToolpaths(p, s, surface, seat(cradle()), o, bit, cradle(), fholes(), true);

    it('clear each eye both sides, inside the knife allowance, clockwise from the centre out', () => {
      expect(tp.failures).toEqual([]);
      expect(tp.surfaces.length).toBe(4);
      for (const run of tp.surfaces) {
        const centres = [...eyes, ...eyes.map(mirror)];
        const eye = eyes[centres.findIndex(c => run.pts.every(pt => Math.hypot(pt.x - c.x, pt.y - c.y) <= 9)) % 2];
        const c = centres.find(c => run.pts.every(pt => Math.hypot(pt.x - c.x, pt.y - c.y) <= 9))!;
        expect(c, run.name).toBeTruthy();
        for (const pt of run.pts) expect(Math.hypot(pt.x - c.x, pt.y - c.y), `${run.name}`).toBeLessThanOrEqual(eye.r - FHOLE.allowance - r + 0.01);
        // the outermost loop reaches the allowance line, a bit radius short
        expect(Math.max(...run.pts.map(pt => Math.hypot(pt.x - c.x, pt.y - c.y)))).toBeGreaterThan(eye.r - FHOLE.allowance - r - 0.05);
        // the first loop turns clockwise
        const first = run.pts.slice(0, 16);
        expect(signedPolygonArea(first)).toBeLessThan(0);
      }
      expect(tp.surfaces.map(run => run.name).sort()).toEqual(['Lower eye, bass', 'Lower eye, treble', 'Upper eye, bass', 'Upper eye, treble']);
    });

    it('follows the surface down a step at a time, through the typed thickness and its margin', () => {
      const step = bit.feeds!.stepDown;
      const through = DEFAULT_SETTINGS.fholes.thickness + FHOLE.exitMargin;
      for (const run of tp.surfaces) {
        const under = run.pts.map(pt => zAt(pt) - pt.z);
        for (const [i, u] of under.entries()) {
          expect(u, `${run.name} point ${i}`).toBeGreaterThan(step - 1e-6);
          expect(u, `${run.name} point ${i}`).toBeLessThan(through + 1e-6);
          if (i) expect(u - under[i - 1], `${run.name} point ${i}`).toBeLessThan(step + 1e-6);
        }
        expect(Math.max(...under)).toBeCloseTo(through, 6);
        expect(Math.min(...run.pts.map(pt => pt.z))).toBeGreaterThanOrEqual(tp.floorZ);
      }
      expect(tp.passes).toBe(Math.ceil(through / step));
    });

    it('refuses a ball, a bit wider than an eye, and an eye over the cradle\'s lip', () => {
      expect(fholeToolpaths(p, s, surface, seat(cradle()), o, ball, cradle(), fholes(), true).failures.join(' ')).toMatch(/flat/);
      expect(fholeToolpaths(p, s, surface, seat(cradle()), o, flat, cradle(), fholes(), true).failures.join(' ')).toMatch(/too wide/);
      const wide = fholeToolpaths(p, s, surface, seat(cradle()), o, bit, cradle(), fholes(), true, { ...CRADLE, lip: 30 });
      expect(wide.failures.join(' ')).toMatch(/lip/);
    });
  });

  describe('the scribe', () => {
    const bit = vBit();
    const tp = fholeToolpaths(p, s, surface, seat(cradle()), o, bit, cradle(), fholes({ stage: 'scribe' }), true);

    it('draws both outlines as drawn, one pass a scribe depth under the surface', () => {
      expect(tp.failures).toEqual([]);
      expect(tp.surfaces.length).toBe(2);
      expect(tp.passes).toBe(1);
      for (const [i, run] of tp.surfaces.entries()) {
        const drawn = buildPolylineIndex(samplePathToPolyline(defineFholePath(p, s, i === 1)!, 0.1));
        expect(run.pts[0]).toEqual(run.pts[run.pts.length - 1]);
        for (const pt of run.pts) {
          expect(distPointToPolylineIndexed(pt, drawn), run.name).toBeLessThan(0.05);
          expect(zAt(pt) - pt.z, run.name).toBeCloseTo(DEFAULT_SETTINGS.fholes.scribeDepth, 6);
        }
        // the wing tips are kept, not cut across: the run reaches each tip
        const tips = [s.UTip!, s.LTip!].map(t => (i === 1 ? mirror(t) : t));
        for (const tip of tips) expect(Math.min(...run.pts.map(pt => Math.hypot(pt.x - tip.x, pt.y - tip.y)))).toBeLessThan(0.02);
      }
    });

    it('wants a V bit', () => {
      expect(fholeToolpaths(p, s, surface, seat(cradle()), o, eyeBit(), cradle(), fholes({ stage: 'scribe' }), true).failures.join(' ')).toMatch(/V bit/);
    });
  });

  it('sits where the cradle put the plate, under a safe height clearing the crown, and says what it expects', () => {
    for (const plate of ['top', 'back'] as const) {
      const c = cradle({ plate });
      const pocket = cradleToolpaths(p, seat(c), o, flat, c);
      for (const fh of [fholes(), fholes({ stage: 'scribe' })]) {
        const tp = fholeToolpaths(p, s, surface, seat(c), o, fh.stage === 'eyes' ? eyeBit() : vBit(), c, fh, true);
        expect(tp.failures).toEqual([]);
        expect(tp.sheetOffset).toEqual(pocket.sheetOffset);
        expect(tp.stockOrigin).toEqual({ x: 0, y: 0 });
        expect(tp.notes.join(' ')).toMatch(/SLAB LOWER LEFT/);
        expect(tp.caution).toMatch(/GRADUATED/);
        const crown = lipZ + edge + p.arching!.top.long.height;
        expect(tp.stockTopZ).toBeCloseTo(crown, 6);
        for (const run of tp.surfaces) for (const pt of run.pts) expect(pt.z).toBeLessThan(crown);
      }
    }
  }, 30000);

  it('writes both files as surface runs, the caution at the pause', () => {
    for (const fh of [fholes(), fholes({ stage: 'scribe' })]) {
      const bit = fh.stage === 'eyes' ? eyeBit() : vBit();
      const t = TOOLS.find(t => t.number === DEFAULT_SETTINGS.tools[fh.stage])!;
      const tp = fholeToolpaths(p, s, surface, seat(cradle()), o, bit, cradle(), fh, true);
      const job = gcodeJob(tp, t, t.feeds.soft!);
      expect(job.passes).toEqual([]);
      expect(job.safeZ).toBeGreaterThan(Math.max(...tp.surfaces.flatMap(run => run.pts.map(pt => pt.z))));
      const text = buildGcode(job);
      expect(text).toMatch(/\(Surface /);
      expect(text).toMatch(/MSG, EXPECTS THE GRADUATED/);
    }
  }, 20000);
});

describe('the scroll side profile toolpaths', () => {
  const p = seeded();
  const n = solveNeck(p)!;
  const s = solveScroll(p)!;
  const t = TOOLS.find(t => t.number === DEFAULT_SETTINGS.tools.scroll)!;
  const bit: Bit = { diameter: t.diameter, shape: t.shape, feeds: t.feeds.hard };
  const r = bit.diameter / 2;
  const scroll = (over: Partial<ScrollSettings> = {}): ScrollSettings => ({ ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS.scroll)), ...over });
  const outline = sideOutline(p, n, s);
  const profile = samplePathToPolyline(outline.d, 0.25);
  const mirror = (pt: Pt) => ({ x: -pt.x, y: pt.y });
  // an index over an open run with no phantom segment closing it: the run is laid back on itself
  const runIndex = (run: Pt[]) => buildPolylineIndex([...run, ...[...run].reverse()]);
  const F1 = s.F1!;
  const throat = pointOnCircle(F1, F1.start + normalizeRadians(F1.end - F1.start) / 2);
  const crown = profile.reduce((a, b) => (b.y > a.y ? b : a));
  const poll = profile.reduce((a, b) => (b.x < a.x ? b : a));

  it('closes the blank\'s outline, the neck and the scroll seeded', () => {
    expect(n.failures).toEqual([]);
    expect(s.failures).toEqual([]);
    expect(outline.pieces.length).toBeGreaterThan(10);
    expect(Math.abs(profile[0].x)).toBeLessThan(1e-6);
    expect(crown.y).toBeGreaterThan(0);
    expect(poll.x).toBeLessThan(-20);
  });

  for (const side of ['left', 'right'] as const) {
    describe(`the ${side} side`, () => {
      const g = scroll({ side });
      const tp = scrollToolpaths(p, n, s, bit, g, true);
      const frame = (pt: Pt) => (side === 'left' ? pt : mirror(pt));
      const idx = buildPolylineIndex(profile.map(frame));
      const toFace = (pt: Pt) => (side === 'left' ? pt.x : -pt.x);
      const pts = tp.paths.flatMap(path => path.loop);
      const near = (pt: Pt) => Math.min(...tp.paths.map(path => distPointToPolylineIndexed(pt, runIndex(path.loop))));

      it('runs a bit radius outside the outline, never into it, clear of the stem, in open runs', () => {
        expect(tp.failures).toEqual([]);
        expect(tp.paths.length).toBeGreaterThan(0);
        for (const pt of pts) {
          expect(distPointToPolylineIndexed(pt, idx), `at ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}`).toBeGreaterThan(r - 0.05);
          // off the stem along its reach; past it the bit may round the chin
          if (pt.y + tp.sheetOffset.y < g.fence.y + g.fence.reach + r + SCROLL.fenceClearance) expect(toFace(pt), `at ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}`).toBeLessThanOrEqual(g.faceInset - r - SCROLL.fenceClearance + 1e-6);
        }
        for (const path of tp.paths) expect(dist(path.loop[0], path.loop[path.loop.length - 1])).toBeGreaterThan(1);
      });

      it('reaches the head, the heel and every tab station, and stays out of the throat', () => {
        for (const pt of [crown, poll, ...outline.stations].map(frame)) expect(near(pt), `at ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}`).toBeLessThan(r + 0.3);
        expect(near(frame(throat))).toBeGreaterThan(r + SCROLL.bridge);
        expect(tp.paths.reduce((sum, path) => sum + path.tabs.length, 0)).toBe(outline.stations.length);
      });

      it('steps down from the blank\'s top to past its middle, the tabs standing off the floor', () => {
        const job = gcodeJob(tp, t, t.feeds.hard!);
        const top = g.stock.thickness, floor = top / 2 - SCROLL.overlap;
        expect(job.passes[0]).toBeCloseTo(top - t.feeds.hard!.stepDown, 6);
        expect(job.passes[job.passes.length - 1]).toBeCloseTo(floor, 6);
        expect(job.tabTop).toBeCloseTo(floor + SCROLL.tabHeight, 6);
        const text = buildGcode(job);
        expect(text.split('\n').filter(l => l.startsWith('(Cut Side profile')).length).toBe(tp.paths.length);
        for (const cut of job.cuts) for (const pt of 'loop' in cut ? cut.loop : []) {
          expect(pt.x).toBeGreaterThan(0);
          expect(pt.x).toBeLessThan(g.harness.width);
          expect(pt.y).toBeGreaterThan(g.fence.y);
          expect(pt.y).toBeLessThan(g.harness.length);
        }
      });
    });
  }

  it('mirrors the second side across the stem, tabs and all', () => {
    const [a, b] = (['left', 'right'] as const).map(side => scrollToolpaths(p, n, s, bit, scroll({ side }), true));
    const file = (tp: typeof a, pt: Pt) => ({ x: pt.x + tp.sheetOffset.x, y: pt.y + tp.sheetOffset.y });
    const axis = DEFAULT_SETTINGS.scroll.fence.x + DEFAULT_SETTINGS.scroll.fence.thickness / 2;
    const across = (pt: Pt) => ({ x: 2 * axis - pt.x, y: pt.y });
    const left = a.paths.map(path => runIndex(path.loop.map(pt => file(a, pt))));
    for (const path of b.paths) {
      for (let i = 0; i < path.loop.length; i += 5) {
        const pt = across(file(b, path.loop[i]));
        expect(Math.min(...left.map(idx => distPointToPolylineIndexed(pt, idx))), `at ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}`).toBeLessThan(0.3);
      }
      for (const tab of path.tabs) {
        const twin = a.paths.flatMap(q => q.tabs).find(q => dist(file(a, q.centre), across(file(b, tab.centre))) < 1.5);
        expect(twin, `tab at ${tab.centre.x.toFixed(1)}, ${tab.centre.y.toFixed(1)}`).toBeTruthy();
      }
    }
    expect(b.caution).toMatch(/FIRST SIDE/);
  });

  // the volute's front off the fingerboard plane: no wood there with the face on the plane, so the
  // face is laid out that much in and planed down after, the chin cut flush with it past the stem
  it('takes a chin past the fingerboard plane once the face is inset by it, and cuts it beyond the stem', () => {
    const q: ViolinFamilyParams = JSON.parse(JSON.stringify(p));
    q.scroll!.fitToNeck = false;
    q.scroll!.eye.x = s.eye!.x + 2;
    const qn = solveNeck(q)!, qs = solveScroll(q)!;
    const over = Math.max(...samplePathToPolyline(sideOutline(q, qn, qs).d, 0.5).map(pt => pt.x));
    expect(over).toBeCloseTo(2, 1);
    expect(scrollToolpaths(q, qn, qs, bit, scroll()).failures.join(' ')).toMatch(/chin stands/);
    const tp = scrollToolpaths(q, qn, qs, bit, scroll({ faceInset: 2 }), true);
    expect(tp.failures).toEqual([]);
    const chin = samplePathToPolyline(sideOutline(q, qn, qs).d, 0.5).filter(pt => pt.x > 1.9 && pt.y > 0).reduce((a, b) => (b.y < a.y ? b : a));
    const near = Math.min(...tp.paths.map(path => distPointToPolylineIndexed(chin, runIndex(path.loop))));
    expect(near).toBeLessThan(r + 0.3);
    for (const pt of tp.paths.flatMap(path => path.loop)) {
      const file = { x: pt.x + tp.sheetOffset.x, y: pt.y + tp.sheetOffset.y };
      // nothing of the bit within the stem's own footprint
      const inStem = file.x + r > DEFAULT_SETTINGS.scroll.fence.x && file.x - r < DEFAULT_SETTINGS.scroll.fence.x + DEFAULT_SETTINGS.scroll.fence.thickness && file.y - r < DEFAULT_SETTINGS.scroll.fence.y + DEFAULT_SETTINGS.scroll.fence.reach;
      expect(inStem, `at ${file.x.toFixed(1)}, ${file.y.toFixed(1)}`).toBe(false);
    }
  });

  it('cuts the face too once it is inset a bit\'s width, as one loop', () => {
    const tp = scrollToolpaths(p, n, s, bit, scroll({ faceInset: bit.diameter + SCROLL.fenceClearance + 1 }), true);
    expect(tp.failures).toEqual([]);
    expect(tp.paths.length).toBe(1);
    const loop = tp.paths[0].loop;
    expect(loop[0]).toEqual(loop[loop.length - 1]);
    expect(loop.some(pt => Math.abs(pt.x - r) < 0.05 && pt.y < 0)).toBe(true);
  });

  it('refuses a harness without room, a blank the profile runs off, a heel margin the crossbar catches, and a ball', () => {
    const plan = (over: Partial<ScrollSettings>, b: Bit = bit) => scrollToolpaths(p, n, s, b, scroll(over)).failures.join(' ');
    expect(plan({ fence: { x: 40, y: 25, thickness: 19, reach: 170 } })).toMatch(/room left/);
    expect(plan({ fence: { x: 150, y: 25, thickness: 19, reach: 280 } })).toMatch(/stem reaches the scroll's chin/);
    expect(plan({ harness: { width: 220, length: 400 } })).toMatch(/room right/);
    expect(plan({ stock: { thickness: 46, width: 30, length: 280 } })).toMatch(/shallow/);
    expect(plan({ stock: { thickness: 46, width: 65, length: 150 } })).toMatch(/short/);
    expect(plan({ endMargin: 2 })).toMatch(/crossbar/);
    expect(plan({}, ball)).toMatch(/flat/);
  });
});

// the fingerboard, from a square blank gluing face down: the roughing never cuts into the leave,
// the ball never into the surface; each dot's pocket stays inside its circle with a flat floor
// the inlay's depth under the lowest of its rim; the contour runs a radius off the outline,
// starts above everything left standing and goes through, its tabs the same both sides
describe('the fingerboard toolpaths', () => {
  const p = seeded();
  const s = solveStringSetup(p)!;
  const marks = solvePositionMarks(p, s, defaultPositionMarks(p)).marks;
  const hard = (n: number): Bit => asBit({ ...TOOLS.find(t => t.number === n)!, feeds: { soft: TOOLS.find(t => t.number === n)!.feeds.hard } });
  const g = (stage: FingerboardSettings['stage'], edit: Partial<FingerboardSettings> = {}): FingerboardSettings =>
    ({ ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS.fingerboard)), stage, ...edit });
  const zAt = (pt: { x: number; y: number }) => fingerboardSurfaceZAt(p, s, pt.x, -pt.y);
  const face = samplePathToPolyline(defineFingerboardFace(p, s)!, 1);
  const length = p.stringSetup!.fingerboardLength;

  it('solves whole, with the marks on the board', () => {
    expect(s.failures).toEqual([]);
    expect(marks.length).toBeGreaterThan(0);
  });

  it('reads a surface that crowns on the centre line, is the same both sides without a scoop difference, and holds its edge past the board', () => {
    const q: ViolinFamilyParams = JSON.parse(JSON.stringify(p));
    q.stringSetup!.scoopTreble = q.stringSetup!.scoopBass;
    const sq = solveStringSetup(q)!;
    for (const along of [0, length / 3, length / 2, length]) {
      const centre = fingerboardSurfaceZAt(q, sq, 0, along);
      for (const x of [3, 8, 12]) {
        expect(fingerboardSurfaceZAt(q, sq, x, along)).toBeLessThan(centre);
        expect(fingerboardSurfaceZAt(q, sq, -x, along)).toBeCloseTo(fingerboardSurfaceZAt(q, sq, x, along), 9);
      }
      expect(fingerboardSurfaceZAt(q, sq, 500, along)).toBeCloseTo(fingerboardSurfaceZAt(q, sq, 200, along), 9);
    }
    // at the ends the edge is unscooped, and past them the section carries on
    expect(fingerboardSurfaceZAt(p, s, 500, 0)).toBeCloseTo(p.stringSetup!.fingerboardThickness, 9);
    expect(fingerboardSurfaceZAt(p, s, 2, -20)).toBeCloseTo(fingerboardSurfaceZAt(p, s, 2, 0), 9);
    expect(fingerboardSurfaceZAt(p, s, 2, length + 20)).toBeCloseTo(fingerboardSurfaceZAt(p, s, 2, length), 9);
  });

  it('roughs in terraces that never cut into the leave, and finishes with a ball that never cuts the surface and does reach it', () => {
    const rough = fingerboardToolpaths(p, s, marks, hard(2), g('rough'), true, 1);
    expect(rough.failures).toEqual([]);
    expect(rough.surfaces.length).toBeGreaterThan(0);
    for (const run of rough.surfaces) for (const pt of run.pts) expect(pt.z).toBeGreaterThanOrEqual(zAt(pt) + SURFACE.leave - 1e-6);
    const finish = fingerboardToolpaths(p, s, marks, hard(3), g('finish'), true, 1);
    expect(finish.failures).toEqual([]);
    const tips = finish.surfaces.flatMap(run => run.pts);
    for (const pt of tips) expect(pt.z).toBeGreaterThanOrEqual(zAt(pt) - 0.02);
    const onCentre = tips.filter(pt => Math.abs(pt.x) < 1 && pt.y < -10 && pt.y > -length + 10);
    expect(onCentre.length).toBeGreaterThan(0);
    for (const pt of onCentre) expect(pt.z - zAt(pt)).toBeLessThan(0.1);
    expect(rough.sheetOffset).toEqual(finish.sheetOffset);
  });

  it('refuses a blank the crown stands proud of, one the carved area runs off, and the wrong bit for a stage', () => {
    const thin = g('rough');
    thin.stock.thickness = p.stringSetup!.fingerboardThickness + 1;
    expect(fingerboardToolpaths(p, s, marks, hard(2), thin).failures.join(' ')).toMatch(/too thin/);
    const short = g('rough');
    short.stock.length = length;
    expect(fingerboardToolpaths(p, s, marks, hard(2), short).failures.join(' ')).toMatch(/runs off the blank/);
    expect(fingerboardToolpaths(p, s, marks, ball, g('rough')).failures.join(' ')).toMatch(/flat bit/);
    expect(fingerboardToolpaths(p, s, marks, flat, g('finish')).failures.join(' ')).toMatch(/ball bit/);
    expect(fingerboardToolpaths(p, s, marks, ball, g('contour')).failures.join(' ')).toMatch(/flat bit/);
  });

  it('sinks each dot inside its circle, a level at a time, to a flat floor the inlay\'s depth under the lowest of its rim', () => {
    const bit = hard(DEFAULT_SETTINGS.tools.marks);
    const settings = g('marks');
    const tp = fingerboardToolpaths(p, s, marks, bit, settings, true);
    expect(tp.failures).toEqual([]);
    const dots = marks.flatMap(m => m.faceDots);
    expect(tp.surfaces.length).toBe(dots.length);
    dots.forEach((dot, i) => {
      const pts = tp.surfaces[i].pts;
      for (const pt of pts) expect(dist(pt, dot) + bit.diameter / 2).toBeLessThanOrEqual(dot.r + 1e-6);
      const floor = Math.min(...pts.map(pt => pt.z));
      const rim = Array.from({ length: 36 }, (_, k) => pointOnCircle(dot, k * Math.PI / 18));
      for (const pt of rim) expect(zAt(pt) - floor).toBeGreaterThanOrEqual(settings.markDepth - 1e-3);
      expect(Math.min(...rim.map(zAt)) - floor).toBeLessThan(settings.markDepth + 0.05);
      // never deeper than a step under what stood there, nor starting in the air above the crown
      const levels = [...new Set(pts.map(pt => +pt.z.toFixed(6)))].sort((a, b) => b - a);
      const high = Math.max(zAt(dot), ...rim.map(zAt));
      expect(high - levels[0]).toBeLessThanOrEqual(bit.feeds!.stepDown + 1e-6);
      for (let k = 1; k < levels.length; k++) expect(levels[k - 1] - levels[k]).toBeLessThanOrEqual(bit.feeds!.stepDown + 1e-6);
      expect(floor).toBeGreaterThanOrEqual(tp.floorZ - 1e-9);
    });
    expect(tp.caution).toBeTruthy();
    expect(() => buildGcode(gcodeJob(tp, TOOLS.find(t => t.number === DEFAULT_SETTINGS.tools.marks)!, bit.feeds!))).not.toThrow();
  });

  it('cuts a fret line as a channel its width across the board, out past both edges, the inlay\'s depth under the surface', () => {
    const bit = hard(DEFAULT_SETTINGS.tools.marks);
    const r = bit.diameter / 2;
    const width = 2.5;
    const fretted = solvePositionMarks(p, s, [{ ...defaultPositionMarks(p)[0], semitone: 7, shape: 'line', diameter: width }]);
    expect(fretted.failures).toEqual([]);
    const [mark] = fretted.marks;
    expect(mark.dots).toEqual([]);
    const [line] = mark.lines;
    // edge to edge at the station, the same distance from the nut as a dot there
    expect(line.face[0].x).toBeCloseTo(-line.face[1].x, 9);
    expect(line.face[1].x).toBeCloseTo(line.plan[1].x, 9);
    expect(pointInPolygon({ x: line.face[1].x - 0.05, y: line.face[1].y }, face)).toBe(true);
    expect(pointInPolygon({ x: line.face[1].x + 0.05, y: line.face[1].y }, face)).toBe(false);
    expect(-line.face[0].y).toBeCloseTo(dist(s.neck.neckTop!, mark.station), 9);

    const settings = g('marks');
    const tp = fingerboardToolpaths(p, s, fretted.marks, bit, settings, true);
    expect(tp.failures).toEqual([]);
    expect(tp.surfaces.length).toBeGreaterThan(1);
    const pts = tp.surfaces.flatMap(run => run.pts);
    for (const pt of pts) {
      expect(Math.abs(pt.y - line.face[0].y)).toBeLessThanOrEqual(width / 2 - r + 1e-6);
      expect(zAt(pt) - pt.z).toBeLessThanOrEqual(settings.markDepth + 1e-9);
      expect(zAt(pt) - pt.z).toBeGreaterThan(0);
    }
    expect(Math.max(...pts.map(pt => Math.abs(pt.y - line.face[0].y)))).toBeGreaterThan(width / 2 - r - 0.01);
    expect(Math.max(...pts.map(pt => zAt(pt) - pt.z))).toBeCloseTo(settings.markDepth, 9);
    for (const run of tp.surfaces) {
      expect(Math.min(...run.pts.map(pt => pt.x))).toBeLessThan(line.face[0].x - r);
      expect(Math.max(...run.pts.map(pt => pt.x))).toBeGreaterThan(line.face[1].x + r);
    }
    expect(tp.floorZ).toBeCloseTo(Math.min(...pts.map(pt => pt.z)), 9);
    expect(fingerboardToolpaths(p, s, fretted.marks, flat, settings).failures.join(' ')).toMatch(/wider than the channel/);
    expect(() => buildGcode(gcodeJob(tp, TOOLS.find(t => t.number === DEFAULT_SETTINGS.tools.marks)!, bit.feeds!))).not.toThrow();
  });

  it('refuses a bit wider than a dot, and a board with no marks', () => {
    expect(fingerboardToolpaths(p, s, marks, flat, g('marks')).failures.join(' ')).toMatch(/too wide/);
    expect(fingerboardToolpaths(p, s, [], hard(DEFAULT_SETTINGS.tools.marks), g('marks')).failures.join(' ')).toMatch(/No position marks/);
  });

  it('contours a bit radius outside the outline, counterclockwise, from above what stands there through the bed, tabs mirrored on the long edges', () => {
    const tp = fingerboardToolpaths(p, s, marks, flat, g('contour'));
    expect(tp.failures).toEqual([]);
    const [path] = tp.paths;
    const r = flat.diameter / 2;
    const idx = buildPolylineIndex([...face, face[0]]);
    const ring = path.loop.slice(0, -1);
    expect(signedPolygonArea(ring)).toBeGreaterThan(0);
    for (const pt of ring) {
      expect(pointInPolygon(pt, face)).toBe(false);
      expect(distPointToPolylineIndexed(pt, idx)).toBeGreaterThan(r - 0.05);
      // the offset comes to a point past each corner, so the cut corner is square; between them it holds the radius
      if (pt.y < -r && pt.y > -length + r) expect(distPointToPolylineIndexed(pt, idx)).toBeLessThan(r + 0.05);
      expect(tp.cutTopZ!).toBeGreaterThanOrEqual(zAt(pt) - 1e-9);
    }
    expect(tp.floorZ).toBeCloseTo(-MACHINE.overcut, 9);
    expect(path.tabs.length).toBe(FINGERBOARD.tabs);
    for (const tab of path.tabs) {
      expect(runLength(tab)).toBeCloseTo(PLATE_TABS.width, 1);
      expect(tab.centre.y).toBeLessThan(-r);
      expect(tab.centre.y).toBeGreaterThan(-length + r);
      expect(path.tabs.some(other => Math.abs(other.centre.x + tab.centre.x) < 0.5 && Math.abs(other.centre.y - tab.centre.y) < 0.5)).toBe(true);
    }
    const job = gcodeJob(tp, tool, tool.feeds.hard!);
    expect(job.passes[job.passes.length - 1]).toBeCloseTo(-MACHINE.overcut, 9);
    expect(() => buildGcode(job)).not.toThrow();
  });

  it('centres the board in the blank the same for every stage', () => {
    const offsets = (['rough', 'finish', 'marks', 'contour'] as const).map(stage =>
      fingerboardToolpaths(p, s, marks, stage === 'finish' ? hard(3) : stage === 'marks' ? hard(DEFAULT_SETTINGS.tools.marks) : flat, g(stage)).sheetOffset);
    for (const o of offsets) expect(o).toEqual(offsets[0]);
    const { stock, fence } = DEFAULT_SETTINGS.fingerboard;
    expect(offsets[0].x).toBeCloseTo(fence.x + stock.width / 2, 3);
    expect(offsets[0].y - length / 2).toBeCloseTo(fence.y + stock.length / 2, 3);
  });

  // a layer drawn on the face: the bit stays on what was drawn, a radius inside a closed shape's
  // line, no deeper under the surface than the row says, and never steps down more than the feeds'
  describe('an inlay layer', () => {
    const bit = hard(DEFAULT_SETTINGS.tools.marks);
    const r = bit.diameter / 2;
    const job = (kind: FaceCut['kind'], lines: string[], edit: Partial<FaceCut> = {}): FaceJob =>
      ({ layerId: 'l', name: 'Vine', cut: { kind, depth: 1.5, width: bit.diameter, ...edit }, lines });
    const mid = -length / 2;
    const circle = pathFromCircle({ x: 2, y: mid, r: 5 } as any);
    const plan = (j: FaceJob | null, fine = true) => inlayToolpaths(p, s, j, bit, g('inlay'), fine);
    const stepsWithin = (pts: { z: number }[], drop: number) => {
      for (let k = 1; k < pts.length; k++) expect(pts[k - 1].z - pts[k].z).toBeLessThanOrEqual(drop + 0.05);
    };

    it('follows lines that meet end to end as one run, the depth held under the surface, walked back and forth', () => {
      const a = { x: -6, y: mid }, b = { x: 0, y: mid - 10 }, c = { x: 7, y: mid - 12 };
      const tp = plan(job('follow', [`M ${a.x} ${a.y} L ${b.x} ${b.y}`, `M ${c.x} ${c.y} L ${b.x} ${b.y}`]));
      expect(tp.failures).toEqual([]);
      expect(tp.surfaces.length).toBe(1);
      const pts = tp.surfaces[0].pts;
      const idx = buildPolylineIndex([a, b, c]);
      for (const pt of pts) {
        expect(distPointToPolylineIndexed(pt, idx)).toBeLessThan(1e-6);
        expect(zAt(pt) - pt.z).toBeLessThanOrEqual(1.5 + 1e-9);
        expect(zAt(pt) - pt.z).toBeGreaterThan(0);
      }
      expect(Math.max(...pts.map(pt => zAt(pt) - pt.z))).toBeCloseTo(1.5, 9);
      // every round reaches both ends, the bit staying down between them
      for (const end of [a, c]) expect(pts.filter(pt => dist(pt, end) < 1e-6).length).toBeGreaterThanOrEqual(tp.passes!);
      expect(pts.some(pt => dist(pt, b) < 1e-6)).toBe(true);
      stepsWithin(pts, bit.feeds!.stepDown);
      expect(tp.floorZ).toBeCloseTo(Math.min(...pts.map(pt => pt.z)), 9);
      expect(tp.caution).toBeTruthy();
      expect(() => buildGcode(gcodeJob(tp, TOOLS.find(t => t.number === DEFAULT_SETTINGS.tools.marks)!, bit.feeds!))).not.toThrow();
    });

    it('takes a channel wider than the bit in passes across, its edges on the width, and refuses a bit wider than the channel', () => {
      const a = { x: -6, y: mid }, b = { x: 6, y: mid - 15 };
      const width = 4;
      const tp = plan(job('follow', [`M ${a.x} ${a.y} L ${b.x} ${b.y}`], { width }));
      expect(tp.failures).toEqual([]);
      expect(tp.surfaces.length).toBeGreaterThan(1);
      const idx = buildPolylineIndex([a, b]);
      const off = tp.surfaces.flatMap(run => run.pts).map(pt => distPointToPolylineIndexed(pt, idx));
      expect(Math.max(...off)).toBeLessThanOrEqual(width / 2 - r + 1e-6);
      expect(Math.max(...off)).toBeGreaterThan(width / 2 - r - 0.01);
      expect(plan(job('follow', [`M ${a.x} ${a.y} L ${b.x} ${b.y}`], { width: bit.diameter / 2 })).failures.join(' ')).toMatch(/wider than the channel/);
    });

    it('outlines a closed shape a bit radius inside its line, clockwise', () => {
      const tp = plan(job('outline', [circle]));
      expect(tp.failures).toEqual([]);
      expect(tp.surfaces.length).toBe(1);
      const pts = tp.surfaces[0].pts;
      for (const pt of pts) {
        expect(dist(pt, { x: 2, y: mid })).toBeLessThanOrEqual(5 - r + 0.02);
        expect(dist(pt, { x: 2, y: mid })).toBeGreaterThan(5 - r - 0.05);
        expect(zAt(pt) - pt.z).toBeLessThanOrEqual(1.5 + 1e-9);
      }
      const round = pts.filter(pt => Math.abs(zAt(pt) - pt.z - bit.feeds!.stepDown) < 1e-6);
      expect(signedPolygonArea(round)).toBeLessThan(0);
    });

    it('pockets a closed shape to a flat floor under the lowest of its rim, loops from the middle out reaching the whole of it', () => {
      const tp = plan(job('pocket', [circle]));
      expect(tp.failures).toEqual([]);
      const pts = tp.surfaces[0].pts;
      const centre = { x: 2, y: mid };
      for (const pt of pts) expect(dist(pt, centre)).toBeLessThanOrEqual(5 - r + 0.02);
      expect(Math.max(...pts.map(pt => dist(pt, centre)))).toBeGreaterThan(5 - r - 0.05);
      expect(Math.min(...pts.map(pt => dist(pt, centre)))).toBeLessThan(r);
      const floor = Math.min(...pts.map(pt => pt.z));
      const rim = Array.from({ length: 36 }, (_, k) => pointOnCircle({ ...centre, r: 5 } as any, k * Math.PI / 18));
      expect(Math.min(...rim.map(zAt)) - floor).toBeCloseTo(1.5, 2);
      expect(tp.floorZ).toBeCloseTo(floor, 9);
      const levels = [...new Set(pts.map(pt => +pt.z.toFixed(6)))].sort((a, b) => b - a);
      for (let k = 1; k < levels.length; k++) expect(levels[k - 1] - levels[k]).toBeLessThanOrEqual(bit.feeds!.stepDown + 1e-6);
      expect(Math.max(...pts.map(zAt)) - levels[0]).toBeLessThanOrEqual(bit.feeds!.stepDown + 1e-6);
      stepsWithin(pts, bit.feeds!.stepDown);
    });

    it('refuses what it cannot cut and says why', () => {
      const line = `M -5 ${mid} L 5 ${mid}`;
      expect(plan(null).failures.join(' ')).toMatch(/No inlay layer/);
      expect(plan(job('follow', [])).failures.join(' ')).toMatch(/Nothing is drawn/);
      expect(plan(job('pocket', [line])).failures.join(' ')).toMatch(/not a closed shape/);
      expect(plan(job('outline', [line])).failures.join(' ')).toMatch(/not a closed shape/);
      expect(plan(job('pocket', [circle, pathFromCircle({ x: 2, y: mid, r: 2 } as any)])).failures.join(' ')).toMatch(/inside another/);
      expect(plan(job('pocket', [pathFromCircle({ x: 2, y: mid, r: r / 2 } as any)])).failures.join(' ')).toMatch(/too wide/);
      expect(plan(job('follow', [`M 0 ${mid} L 200 ${mid}`])).failures.join(' ')).toMatch(/runs off the carved area/);
      expect(plan(job('follow', [line], { depth: 0 })).failures.join(' ')).toMatch(/depth/);
      expect(inlayToolpaths(p, s, job('follow', [line]), ball, g('inlay')).failures.join(' ')).toMatch(/flat bit/);
    });

    it('sits in the blank as every other stage does', () => {
      expect(plan(job('follow', [`M -5 ${mid} L 5 ${mid}`]), false).sheetOffset).toEqual(fingerboardToolpaths(p, s, marks, flat, g('contour')).sheetOffset);
    });
  });
});

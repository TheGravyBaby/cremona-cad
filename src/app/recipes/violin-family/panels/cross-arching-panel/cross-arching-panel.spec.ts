// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { closestPointToPolylineIndexed } from '../../../../helpers/math/vibeMath';
import {
  bodyLandmarks, contourRings, crossArchKnotX, crossArchKnots, crossShape, makeCrossArchResolver, nearestCrossArchShape, rowAt, sectionAt,
  sectionRuns, solveCrossArching, solveCrossArchSection, surfaceZAt,
} from './cross-arching-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { FlutingPanel, gougeHalfWidth, gougeProfileSlope } from '../fluting-panel/fluting-panel';
import { OuterContourPanel } from '../outer-contour-panel/outer-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { CrossArchParams, PlateSurface, ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const seeded = (p = blank()): ViolinFamilyParams => {
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  OuterContourPanel.seed(p);
  FlutingPanel.seed(p);
  LongArchingPanel.seed(p);
  return p;
};

const topSurface = (p: ViolinFamilyParams): PlateSurface => {
  const s = solveCrossArching(p)!;
  expect(s.failures).toEqual([]);
  return s.top!;
};

// a gouge that cuts 4mm wide at 1.2mm deep, and a wide station
// a channel 4 mm wide at 1.2 deep, the sweep that cut it 2.2667
const W = 4;
const D = 1.2;
const ARCH = 15;
const HALF = 100;
const row = { left: [{ x: 0.45, z: 0.6 }], right: [{ x: 0.45, z: 0.6 }] };

describe('the cross arching solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveCrossArching(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('is nothing until the arching is seeded', () => {
    const p = blank();
    MainBoutsPanel.seed(p);
    CornersPanel.seed(p);
    OuterContourPanel.seed(p);
    FlutingPanel.seed(p);
    expect(solveCrossArching(p)).toBeNull();
  });

  it('hands back the same surface while the params it reads stand, and a new one once they move', () => {
    const p = seeded();
    const first = solveCrossArching(p)!;
    expect(solveCrossArching(JSON.parse(JSON.stringify(p)))!.top).toBe(first.top);
    p.arching!.top.cross.d += 5;
    const next = solveCrossArching(p)!;
    expect(next.top).not.toBe(first.top);
    expect(next.back).toBe(first.back);
  });

  it('fails a crown off the plate, a point on the joint, a station outside the body and two on top of each other, naming the plate', () => {
    const bad = (edit: (c: CrossArchParams) => void): string[] => {
      const p = seeded();
      edit(p.arching!.back.cross);
      const s = solveCrossArching(p)!;
      expect(s.back).toBeNull();
      expect(s.top).not.toBeNull();
      return s.failures.map(f => f.unsolved.join());
    };
    expect(bad(c => { c.pct = 200; })).toEqual(['back']);
    expect(bad(c => { (c as any).d = null; })).toEqual(['back']);
    expect(bad(c => { c.type = 'spline'; c.peak = 20; })).toEqual(['back']);
    expect(bad(c => { c.type = 'spline'; c.points[0].x = 50; })).toEqual(['back']);
    expect(bad(c => { c.type = 'spline'; c.points[0].z = 120; })).toEqual(['back']);
    expect(bad(c => { c.stations.push({ y: 400, d: 40, pct: 90, peak: 50, points: [] }); })).toEqual(['back']);
    expect(bad(c => { c.stations.push({ y: 100, d: 40, pct: 90, peak: 50, points: [] }, { y: 100.2, d: 50, pct: 90, peak: 50, points: [] }); })).toEqual(['back']);
  });

  it('lists the five landmarks up the body in order, off the recipe', () => {
    const p = seeded();
    const marks = bodyLandmarks(p);
    expect(marks.map(m => m.code)).toEqual(['LB', 'LC', 'C', 'UC', 'UB']);
    for (let i = 1; i < marks.length; i++) expect(marks[i].y).toBeGreaterThan(marks[i - 1].y);
    expect(marks[1].y).toBe(Math.round(p.corners!.LCr.y));
    expect(marks[2].y).toBe(Math.round(p.bouts!.C0Y));
  });
});

describe('a section', () => {
  it('meets the channel tangentially on both sides, symmetric when the crown is', () => {
    const s = solveCrossArchSection(ARCH, HALF, W, D, row)!;
    for (const side of [s.left!, s.right!]) {
      expect(side.tangent).toBe(true);
      expect(gougeProfileSlope(side.contactS, W, D)).toBeCloseTo(side.slope, 9);
      expect(side.contactS).toBeGreaterThan(0);
      expect(side.contactS).toBeLessThan(gougeHalfWidth(W, D));
    }
    expect(s.left!.contactS).toBeCloseTo(s.right!.contactS, 9);
    for (const x of [10, 45, 80, 99]) expect(s.zAt(-x)).toBeCloseTo(s.zAt(x), 9);
    // crown at the arch height, the trough a full depth down, plate level past the cut
    expect(s.zAt(0)).toBeCloseTo(ARCH, 9);
    expect(s.zAt(HALF)).toBeCloseTo(-D, 9);
    expect(s.zAt(HALF + gougeHalfWidth(W, D))).toBeCloseTo(0, 9);
    // no seam where the arch hands over to the channel
    const xEnd = HALF - s.right!.contactS;
    expect(s.zAt(xEnd - 1e-6)).toBeCloseTo(s.zAt(xEnd + 1e-6), 6);
  });

  it('holds a point where it was put while an uneven crown lands its two sides apart', () => {
    const s = solveCrossArchSection(ARCH, HALF, W, D, {
      left: [{ x: 0.3, z: 0.9 }, { x: 0.6, z: 0.8 }], right: [{ x: 0.3, z: 0.9 }, { x: 0.6, z: 0.2 }],
    })!;
    expect(s.left!.contactS).not.toBeCloseTo(s.right!.contactS, 3);
    for (const side of [-1, 1] as const) expect(s.zAt(crossArchKnotX(s, side, 0.3))).toBeCloseTo(0.9 * ARCH, 9);
  });

  it('still solves with the crown below plate level, and meets the outer flank when a point dips under', () => {
    for (const archH of [-0.9, 0, 0.4]) {
      const s = solveCrossArchSection(archH, HALF, W, D, row)!;
      expect(s.zAt(0)).toBeCloseTo(archH, 9);
      expect(s.zAt(0)).toBeGreaterThan(s.zAt(HALF));
    }
    const dip = solveCrossArchSection(ARCH, HALF, W, D, { left: [{ x: 0.9, z: -0.1 }], right: [{ x: 0.9, z: -0.1 }] })!;
    for (const side of [dip.left!, dip.right!]) {
      expect(side.tangent).toBe(true);
      expect(side.contactS).toBeLessThan(0);
    }
    expect(solveCrossArchSection(ARCH, 1, W, D, row)).toBeNull();
  });

  it('ramps a crown between stations without overshooting either, the base anchoring both ends', () => {
    const cross: CrossArchParams = {
      type: 'spline', d: 40, pct: 90, peak: 50, points: [{ x: 83, z: 50, mirror: true }],
      stations: [{ y: 100, d: 40, pct: 90, peak: 50, points: [{ x: 83, z: 80, mirror: true }] }],
    };
    const at = makeCrossArchResolver(cross, 350);
    expect(at(0).right[0].z).toBeCloseTo(0.5, 9);
    expect(at(100).right[0].z).toBeCloseTo(0.8, 9);
    expect(at(350).right[0].z).toBeCloseTo(0.5, 9);
    for (const y of [25, 50, 75, 150, 250]) {
      const z = at(y).right[0].z;
      expect(z).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(z).toBeLessThanOrEqual(0.8 + 1e-9);
    }
    expect(nearestCrossArchShape(cross, 120, 350)).toBe(cross.stations[0]);
    expect(nearestCrossArchShape(cross, 20, 350)).toBe(cross);
    // a point reads the same place on either side when mirrored, its own side otherwise
    const shape = crossShape({ ...cross, points: [{ x: 30, z: 50, mirror: false }] }, 'spline');
    expect(crossArchKnots(shape, -1)).toEqual([{ x: 0.4, z: 0.5 }]);
    expect(crossArchKnots(shape, 1)).toEqual([]);
  });
});

describe('the surface', () => {
  const p = seeded();
  const surface = topSurface(p);

  it('cuts one constant channel section the whole way round, including through the corners', () => {
    const poly = surface.centerPoly;
    let checked = 0;
    for (let i = 0; i < poly.length; i += 7) {
      const z = surfaceZAt(surface, poly[i].x, poly[i].y);
      if (z === null) continue;
      checked++;
      expect(z).toBeCloseTo(-surface.gouge.depth, 6);
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('leaves flat land outside the cut', () => {
    const q = seeded();
    q.fluting!.cornerGouge = false;
    const s = topSurface(q);
    const poly = s.centerPoly;
    const w = gougeHalfWidth(s.gouge.width, s.gouge.depth);
    let checked = 0;
    for (let i = 0; i < poly.length; i += 23) {
      const prev = poly[(i - 1 + poly.length) % poly.length], next = poly[(i + 1) % poly.length];
      const tx = next.x - prev.x, ty = next.y - prev.y;
      const len = Math.hypot(tx, ty);
      if (len < 1e-9) continue;
      const nx = ty / len, ny = -tx / len;
      const mid = q.body.height / 2;
      const outward = Math.hypot(poly[i].x + nx, poly[i].y - mid) > Math.hypot(poly[i].x, poly[i].y - mid) ? 1 : -1;
      const z = surfaceZAt(s, poly[i].x + outward * nx * (w + 0.6), poly[i].y + outward * ny * (w + 0.6));
      if (z === null) continue;
      checked++;
      expect(z).toBeCloseTo(0, 6);
    }
    expect(checked).toBeGreaterThan(8);
  });

  it('crowns on the centreline at the long arch\'s height and runs every station between the caps', () => {
    const la = surface.longArch!;
    let peak = -Infinity;
    for (let y = la.yStart; y <= la.yEnd; y += 1) {
      const row = rowAt(surface, y);
      expect(row.section, `section at ${y}`).not.toBeNull();
      const z = surfaceZAt(surface, 0, y, row);
      expect(z).not.toBeNull();
      peak = Math.max(peak, z!);
    }
    expect(peak).toBeCloseTo(p.arching!.top.arch.height, 1);
  });

  it('the corner pass only ever removes wood, and none along the flanks', () => {
    const off = seeded();
    off.fluting!.cornerGouge = false;
    const sOff = topSurface(off);
    let added = 0, changed = 0, flankChanged = 0;
    for (let y = 4; y < p.body.height - 4; y += 6) {
      const rOn = rowAt(surface, y), rOff = rowAt(sOff, y);
      // the flanks: the widest points of the bouts and the waist, where the two loops coincide
      const flank = bodyLandmarks(p).filter(m => m.code !== 'UC' && m.code !== 'LC').some(m => Math.abs(y - m.y) < 10);
      for (let x = -120; x <= 120; x += 2) {
        const a = surfaceZAt(sOff, x, y, rOff), b = surfaceZAt(surface, x, y, rOn);
        if (a === null || b === null) continue;
        if (b > a + 1e-9) added++;
        // the flank residual is polyline sampling, both loops chorded at a millimetre, not geometry
        if (Math.abs(b - a) > 1e-6) changed++;
        if (flank && Math.abs(b - a) > 0.01) flankChanged++;
      }
    }
    expect(added).toBe(0);
    expect(changed).toBeGreaterThan(0);
    expect(flankChanged).toBe(0);
  });

  it('splits a station into land, channel and arch runs that share their joins', () => {
    const runs = sectionRuns(surface, p.bouts!.C0Y);
    expect(runs.map(r => r.part)).toEqual(['land', 'channel', 'arch', 'channel', 'land']);
    for (let i = 1; i < runs.length; i++) expect(runs[i].pts[0]).toEqual(runs[i - 1].pts[runs[i - 1].pts.length - 1]);
    const arch = runs[2].pts;
    expect(Math.max(...arch.map(pt => pt.y))).toBeCloseTo(sectionAt(surface, p.bouts!.C0Y)!.archH, 2);
  });

  it('draws closed contours including the channel levels, every ring inside the plate', () => {
    const levels = contourRings(p, surface, 1, 2);
    expect(levels.some(l => l.level <= 0)).toBe(true);
    expect(levels.some(l => l.level > 0)).toBe(true);
    for (const { rings } of levels) {
      for (const ring of rings) {
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        for (const [x, y] of ring) expect(closestPointToPolylineIndexed({ x, y }, surface.flutingEdgeIdx).dist).toBeLessThan(p.body.width);
      }
    }
  }, 20_000);

  it('moves the dome with a crown set off the joint', () => {
    const q = seeded();
    q.arching!.top.cross.type = 'spline';
    q.arching!.top.cross.peak = 42;
    const s = topSurface(q);
    const y = q.bouts!.C0Y;
    const section = sectionAt(s, y)!;
    expect(section.xPeak).toBeLessThan(0);
    expect(surfaceZAt(s, section.xPeak, y)!).toBeGreaterThan(surfaceZAt(s, -section.xPeak, y)!);
  });
});

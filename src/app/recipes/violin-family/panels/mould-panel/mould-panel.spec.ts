// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dist, flipPointAboutY, flipRectAboutY, pointInPolygon } from '../../../../helpers/math/simpleGeometry';
import { pathsBounds, samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed } from '../../../../helpers/math/vibeMath';
import { Circle, Pt, Rectangle } from '../../../../models/types';
import { buildBlockLayout, MOULD_EXPORT_STEP, MouldPanel, solveMould } from './mould-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { ViolinFamilyParams } from '../../violin-family-types';
import { MouldSolve } from '../../violin-family-solves';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

// what a maker would check on the cut mould: one closed outline inside the ribs, the same both sides,
// the blocks where the pads put them, and every clamp window a full wall in from the ribs and clear
// of the blocks it reaches

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const seeded = (p = blank()): ViolinFamilyParams => {
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  MouldPanel.seed(p);
  return p;
};

const solved = (p: ViolinFamilyParams, step?: number): MouldSolve => {
  const s = solveMould(p, step)!;
  expect(s.failures).toEqual([]);
  return s;
};

const points = (d: string): Pt[] => samplePathToPolyline(d, 0.25, true);
const subpaths = (d: string): number => (d.match(/M/g) ?? []).length;
const closed = (d: string): boolean => {
  const q = points(d);
  return dist(q[0], q[q.length - 1]) < 1e-6;
};
const offTheLine = (q: Pt[], line: Pt[]) => {
  const idx = buildPolylineIndex(line);
  return Math.max(...q.map(pt => distPointToPolylineIndexed(pt, idx)));
};
const nearest = (q: Pt[], line: Pt[]) => {
  const idx = buildPolylineIndex(line);
  return Math.min(...q.map(pt => distPointToPolylineIndexed(pt, idx)));
};
const inside = (pt: Pt, r: Rectangle) =>
  pt.x > Math.min(r.Pt1.x, r.Pt2.x) && pt.x < Math.max(r.Pt1.x, r.Pt2.x) && pt.y > Math.min(r.Pt1.y, r.Pt2.y) && pt.y < Math.max(r.Pt1.y, r.Pt2.y);
const allBlocks = (s: MouldSolve): Rectangle[] => {
  const b = s.blocks!;
  return [b.neck, b.upperCorner, flipRectAboutY(b.upperCorner), b.lowerCorner, flipRectAboutY(b.lowerCorner), b.end];
};

describe('the mould solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveMould(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('seeds once the corners are there, once only, with bigger blocks for a cello', () => {
    const q = blank();
    MainBoutsPanel.seed(q);
    MouldPanel.seed(q);
    expect(q.mould).toBeUndefined();

    const p = seeded();
    p.mould!.endBlock.height += 3;
    MouldPanel.seed(p);
    expect(p.mould!.endBlock.height).toBe(seeded().mould!.endBlock.height + 3);

    const cello = blank();
    cello.body.height = 2.1 * cello.body.height;
    cello.body.width = 2.1 * cello.body.width;
    seeded(cello);
    expect(cello.mould!.upperCornerBlock.height).toBeGreaterThan(p.mould!.upperCornerBlock.height);
    expect(cello.mould!.endBlock.width).toBeGreaterThan(p.mould!.endBlock.width);
  });

  it('stands each corner block\'s outer corner its pad off the tip, out past it and toward the waist', () => {
    const p = seeded();
    const { upperCorner, lowerCorner } = solved(p).blocks!;
    const k = p.corners!;
    expect(upperCorner.Pt1.x).toBeGreaterThan(k.UCr.x);
    expect(upperCorner.Pt1.y).toBeLessThan(k.UCr.y);
    expect(lowerCorner.Pt1.x).toBeGreaterThan(k.LCr.x);
    expect(lowerCorner.Pt1.y).toBeGreaterThan(k.LCr.y);

    p.mould!.upperCornerBlock.pad.x += 2;
    p.mould!.lowerCornerBlock.pad.y += 2;
    const after = solved(p).blocks!;
    expect(after.upperCorner.Pt1.x - upperCorner.Pt1.x).toBeCloseTo(2, 9);
    expect(after.upperCorner.Pt1.y).toBeCloseTo(upperCorner.Pt1.y, 9);
    expect(after.lowerCorner.Pt1.x).toBeCloseTo(lowerCorner.Pt1.x, 9);
    expect(after.lowerCorner.Pt1.y - lowerCorner.Pt1.y).toBeCloseTo(2, 9);
  });

  // where a block crosses the outline the cut lands within a tenth of true, either side alike
  it('cuts one closed outline inside the ribs, the same both sides', () => {
    const s = solved(seeded(), MOULD_EXPORT_STEP);
    expect(subpaths(s.outline!)).toBe(1);
    expect(closed(s.outline!)).toBe(true);
    const outline = points(s.outline!);
    const ribs = points(s.ribOutline!);
    expect(outline.every(pt => pointInPolygon(pt, ribs) || offTheLine([pt], ribs) < 1e-3)).toBe(true);
    expect(offTheLine(outline.map(flipPointAboutY), outline)).toBeLessThan(0.1);
  });

  it('eases each inside corner of a block with the bit, and leaves it square with no bit', () => {
    const p = seeded();
    const corner = solved(p).blocks!.neck.Pt1;
    expect(nearest([corner], points(solved(p, MOULD_EXPORT_STEP).outline!))).toBeGreaterThan(0.5);
    p.mould!.bitDiameter = 0;
    expect(nearest([corner], points(solved(p, MOULD_EXPORT_STEP).outline!))).toBeLessThan(0.1);
  });

  it('cuts each clamp window as a closed loop inside the mould, clear of every block, the window inset in from the ribs', () => {
    const p = seeded();
    const s = solved(p);
    const outline = points(s.outline!);
    const ribs = points(s.ribOutline!);
    expect(s.clampBox.length).toBe(3);
    const walls = s.clampBox.map(window => {
      expect(closed(window)).toBe(true);
      const q = points(window);
      expect(q.every(pt => pointInPolygon(pt, outline))).toBe(true);
      expect(q.some(pt => allBlocks(s).some(r => inside(pt, r)))).toBe(false);
      return nearest(q, ribs);
    });
    for (const wall of walls) expect(wall).toBeCloseTo(walls[0], 3);
    expect(walls[0]).toBeCloseTo(p.mould!.windowInset, 1);
  });

  it('bumps the frame into its window behind the neck and end blocks, the window inset of wood across each block', () => {
    const p = seeded();
    const s = solved(p, MOULD_EXPORT_STEP);
    const inset = p.mould!.windowInset;
    const neck = s.blocks!.neck, end = s.blocks!.end;
    const neckY = Math.min(neck.Pt1.y, neck.Pt2.y), endY = Math.max(end.Pt1.y, end.Pt2.y);
    const behind = (r: Rectangle) => (pt: Pt) => Math.abs(pt.x) <= Math.abs(r.Pt1.x);
    const upper = points(s.clampBox[0]).filter(behind(neck)), lower = points(s.clampBox[2]).filter(behind(end));
    expect(subpaths(s.clampBox[0])).toBe(1);
    expect(subpaths(s.clampBox[2])).toBe(1);
    expect(Math.max(...upper.map(pt => pt.y))).toBeCloseTo(neckY - inset, 1);
    expect(Math.min(...lower.map(pt => pt.y))).toBeCloseTo(endY + inset, 1);
    // no sharp point where a bump comes down: the cut line never turns more than its sampling allows
    for (const window of [s.clampBox[0], s.clampBox[2]]) {
      const q = points(window).slice(0, -1);
      for (let i = 0; i < q.length; i++) {
        const a = q[i], m = q[(i + 1) % q.length], c = q[(i + 2) % q.length];
        if (dist(a, m) < 1e-6 || dist(m, c) < 1e-6) continue;
        const turn = Math.abs(Math.atan2((m.x - a.x) * (c.y - m.y) - (m.y - a.y) * (c.x - m.x), (m.x - a.x) * (c.x - m.x) + (m.y - a.y) * (c.y - m.y)));
        expect(turn, `at ${m.x.toFixed(2)}, ${m.y.toFixed(2)}`).toBeLessThan(0.2);
      }
    }
  });

  it('leaves the clamp box off for a maker who cuts their own, the outline untouched', () => {
    const p = seeded();
    const withBox = solved(p);
    p.mould!.clampBox = 'none';
    const without = solved(p);
    expect(without.clampBox).toEqual([]);
    expect(without.outline).toBe(withBox.outline);
  });

  it('thickens the walls with the window inset', () => {
    const p = seeded();
    const thin = nearest(points(solved(p).clampBox[0]), points(solved(p).ribOutline!));
    p.mould!.windowInset += 5;
    const thick = nearest(points(solved(p).clampBox[0]), points(solved(p).ribOutline!));
    expect(thick).toBeCloseTo(thin + 5, 1);
  });

  it('fails the clamp box on a cleared inset, the mould still drawn', () => {
    const p = seeded();
    p.mould!.windowInset = null as unknown as number;
    const s = solveMould(p)!;
    expect(s.failures[0].unsolved).toEqual(['clampBox']);
    expect(s.clampBox).toEqual([]);
    expect(s.outline).toBeTruthy();
  });

  it('leaves a window uncut and says so when the inset leaves it no room, the mould still drawn', () => {
    const p = seeded();
    p.mould!.windowInset = 90;
    const s = solveMould(p)!;
    expect(s.failures.length).toBe(1);
    expect(s.failures[0].unsolved).toEqual([]);
    expect(s.clampBox.length).toBeLessThan(3);
    expect(s.outline).toBeTruthy();
  });

  it('cuts the hole pattern as a slot behind each end block and a hole beside each corner block, mirrored, in solid wood', () => {
    const p = seeded();
    p.mould!.clampBox = 'holes';
    const s = solved(p);
    const outline = points(s.outline!);
    expect(s.clampBox.length).toBe(6);
    const bounds = s.clampBox.map(cut => pathsBounds([cut]));
    s.clampBox.forEach((cut, i) => {
      expect(closed(cut)).toBe(true);
      const q = points(cut);
      expect(q.every(pt => pointInPolygon(pt, outline))).toBe(true);
      expect(q.some(pt => allBlocks(s).some(rect => inside(pt, rect)))).toBe(false);
      const r = (bounds[i].maxY - bounds[i].minY) / 2;
      expect(nearest(q, outline)).toBeGreaterThan(r / 2 - 0.3);
      const twin = bounds.some(b => Math.abs(b.minX + bounds[i].maxX) < 0.05 && Math.abs(b.maxX + bounds[i].minX) < 0.05 && Math.abs(b.minY - bounds[i].minY) < 0.05);
      expect(twin, `cutout ${i}`).toBe(true);
    });
    // a corner hole never reaches past its block along the body
    for (const [block, holes] of [[s.blocks!.upperCorner, bounds.slice(1, 3)], [s.blocks!.lowerCorner, bounds.slice(3, 5)]] as const) {
      for (const hole of holes) {
        expect(hole.minY).toBeGreaterThan(Math.min(block.Pt1.y, block.Pt2.y) - 0.05);
        expect(hole.maxY).toBeLessThan(Math.max(block.Pt1.y, block.Pt2.y) + 0.05);
        expect(hole.maxX - hole.minX).toBeCloseTo(hole.maxY - hole.minY, 1);
      }
    }
    for (let i = 0; i < bounds.length; i++) {
      for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i], b = bounds[j];
        expect(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY, `cutouts ${i} and ${j}`).toBe(true);
      }
    }
  });

  it('leaves out the holes the mould has no room for and says so, the mould still drawn', () => {
    const p = seeded();
    p.mould!.clampBox = 'holes';
    p.mould!.neckBlock.height *= 4;
    const s = solveMould(p)!;
    expect(s.failures.length).toBe(1);
    expect(s.clampBox.length).toBeLessThan(6);
    expect(s.outline).toBeTruthy();
  });

  it('drills the alignment holes on the centre line, the bit across, in solid wood with a wall round each', () => {
    const placed: Circle[][] = [];
    for (const clampBox of ['windows', 'holes', 'none'] as const) {
      const p = seeded();
      p.mould!.alignmentHoles = true;
      p.mould!.clampBox = clampBox;
      const s = solved(p);
      const r = p.mould!.bitDiameter / 2;
      const cuts = [s.outline!, ...s.clampBox].map(points);
      expect(s.alignmentHoles.length).toBe(2);
      for (const hole of s.alignmentHoles) {
        expect(hole.x).toBe(0);
        expect(hole.r).toBeCloseTo(r, 9);
        expect(pointInPolygon(hole, cuts[0])).toBe(true);
        expect(s.clampBox.some(window => pointInPolygon(hole, points(window)))).toBe(false);
        for (const cut of cuts) expect(nearest([hole], cut)).toBeGreaterThan(2 * r - 1e-6);
      }
      placed.push(s.alignmentHoles);
    }
    expect(placed[1]).toEqual(placed[0]);
    expect(placed[2]).toEqual(placed[0]);
  });

  it('leaves the alignment holes out until asked, and fails them alone with no bit to plunge them', () => {
    const p = seeded();
    expect(solved(p).alignmentHoles).toEqual([]);
    p.mould!.alignmentHoles = true;
    p.mould!.bitDiameter = 0;
    const s = solveMould(p)!;
    expect(s.failures.map(f => f.unsolved)).toEqual([['alignmentHoles']]);
    expect(s.alignmentHoles).toEqual([]);
    expect(s.outline).toBeTruthy();
  });

  it('fails a block with no size or a cleared field, and cuts no mould', () => {
    const p = seeded();
    p.mould!.neckBlock.width = 0;
    let s = solveMould(p)!;
    expect(s.failures[0].unsolved).toEqual(['neckBlock']);
    expect(s.outline).toBeNull();
    expect(s.clampBox).toEqual([]);

    const q = seeded();
    q.mould!.lowerCornerBlock.pad.y = null as unknown as number;
    s = solveMould(q)!;
    expect(s.failures[0].unsolved).toEqual(['lowerCornerBlock']);
  });
});

describe('the blocks laid out for cutting', () => {
  it('lays the six blocks out apart, each closed, the upper three marked U and the lower L', () => {
    const pieces = buildBlockLayout(solved(seeded()));
    expect(pieces.map(b => b.label).sort()).toEqual(['L', 'L', 'L', 'U', 'U', 'U']);
    for (const piece of pieces) expect(closed(piece.path)).toBe(true);
    const bounds = pieces.map(b => pathsBounds([b.path]));
    for (let i = 0; i < bounds.length; i++) {
      for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i], b = bounds[j];
        const apart = a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY;
        expect(apart, `pieces ${i} and ${j}`).toBe(true);
      }
    }
  });
});

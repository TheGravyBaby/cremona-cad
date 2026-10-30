// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dist, flipPointAboutY, flipRectAboutY, pointInPolygon } from '../../../../helpers/math/simpleGeometry';
import { pathsBounds, samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed } from '../../../../helpers/math/vibeMath';
import { Pt, Rectangle } from '../../../../models/types';
import { blockLayout, MOULD_EXPORT_STEP, MouldPanel, solveMould } from './mould-panel';
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

  it('cuts each clamp window as a closed loop inside the mould, clear of every block, one wall thick in from the ribs, more than the blocks and channel', () => {
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
    expect(walls[0]).toBeGreaterThan(Math.max(p.mould!.neckBlock.height, p.mould!.endBlock.height) + 4);
  });

  it('leaves the clamp box off for a maker who cuts their own, the outline untouched', () => {
    const p = seeded();
    const withBox = solved(p);
    p.mould!.clampBox = false;
    const without = solved(p);
    expect(without.clampBox).toEqual([]);
    expect(without.outline).toBe(withBox.outline);
  });

  it('leaves a window uncut and says so when the blocks leave it no room, the mould still drawn', () => {
    const p = seeded();
    p.mould!.endBlock.height = 90;
    const s = solveMould(p)!;
    expect(s.failures.length).toBe(1);
    expect(s.failures[0].unsolved).toEqual([]);
    expect(s.clampBox.length).toBeLessThan(3);
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
    const pieces = blockLayout(solved(seeded()));
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

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DevBassBarPanel, solveBassBar } from './dev-bassbar-panel';
import { DevGraduationPanel, gridPoints } from '../dev-graduation-panel/dev-graduation-panel';
import { PlateContourPanel } from '../plate-contour-panel/plate-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { FHolePlacementPanel } from '../fhole-placement-panel/fhole-placement-panel';
import { FHoleContoursPanel } from '../fhole-contours-panel/fhole-contours-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const seeded = (p = blank()): ViolinFamilyParams => {
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  PlateContourPanel.seed(p);
  FlutingPanel.seed(p);
  FHolePlacementPanel.seed(p);
  FHoleContoursPanel.seed(p);
  LongArchingPanel.seed(p);
  DevGraduationPanel.seed(p);
  DevBassBarPanel.seed(p);
  return p;
};

describe('the bass bar', () => {
  it('seeds once the top is graduated, once only, and solves its seed', () => {
    const q = blank();
    MainBoutsPanel.seed(q);
    DevBassBarPanel.seed(q);
    expect(q.bassBar).toBeUndefined();

    const p = seeded();
    p.bassBar!.length += 7;
    const edited = p.bassBar!.length;
    DevBassBarPanel.seed(p);
    expect(p.bassBar!.length).toBe(edited);
    expect(solveBassBar(p)!.failures).toEqual([]);
  });

  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveBassBar(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('reports a cleared field rather than drawing it', () => {
    for (const key of ['length', 'width'] as const) {
      const p = seeded();
      (p.bassBar as any)[key] = null;
      expect(solveBassBar(p)!.failures.length, key).toBeGreaterThan(0);
    }
    const p = seeded();
    (p.bassBar!.points[0] as any).h = null;
    expect(solveBassBar(p)!.failures.map(f => f.unsolved)).toEqual([['shape']]);
  });

  it('traces its left face along the inside of the top, the same curve at any step', () => {
    const p = seeded();
    p.graduation!.top.points = gridPoints(p, 30, 'top').map(pt => ({ ...pt, thickness: 3 }));
    const read = (d: string) => d.slice(2).split(' L ').map(pair => pair.split(' ').map(Number));
    const coarse = read(solveBassBar(p, 8)!.left!.edge);
    const fine = read(solveBassBar(p, 1)!.left!.edge);
    expect(fine.length).toBeGreaterThan(coarse.length);
    expect(fine[0][0]).toBeCloseTo(coarse[0][0], 6);
    expect(fine[fine.length - 1][0]).toBeCloseTo(coarse[coarse.length - 1][0], 6);
  });

  it('reads each depth down from the top on the centreline, both faces hung to the one underside below the top', () => {
    const p = seeded();
    p.graduation!.top.points = gridPoints(p, 30, 'top').map(pt => ({ ...pt, thickness: 3 }));
    const read = (d: string) => d.slice(2).split(' L ').map(pair => pair.split(' ').map(Number));
    const b = solveBassBar(p)!;
    expect(b.failures).toEqual([]);

    for (const knot of b.knots) expect(knot.topZ - knot.bottom.x).toBeCloseTo(p.bassBar!.points[knot.source].h, 9);
    const mirrored = p.bassBar!.points.findIndex(pt => pt.mirror && pt.t > 0);
    const twins = b.knots.filter(k => k.source === mirrored);
    expect(twins.length).toBe(2);
    expect(twins[0].bottom.y + twins[1].bottom.y).toBeCloseTo(p.bassBar!.length, 9);

    const ends = [b.knots[0], b.knots[b.knots.length - 1]];
    expect(b.bottom[0].x).toBeCloseTo(ends[0].bottom.x, 9);
    expect(b.bottom[b.bottom.length - 1].x).toBeCloseTo(ends[1].bottom.x, 9);
    expect(b.lowZ).toBe(Math.min(...b.bottom.map(q => q.x)));

    for (const face of [b.left!, b.right!]) {
      const edge = read(face.edge), bottom = read(face.bottom);
      expect(bottom[0]).toEqual(edge[0]);
      expect(bottom[bottom.length - 1]).toEqual(edge[edge.length - 1]);
      edge.forEach(([z, s], i) => {
        expect(bottom[i + 1][1]).toBe(s);
        expect(z).toBeGreaterThan(bottom[i + 1][0]);
      });
    }
  });

  it('follows the top when it is graduated again, however often it was read before', () => {
    const p = seeded();
    p.graduation!.top.points = gridPoints(p, 30, 'top').map(pt => ({ ...pt, thickness: 3 }));
    const before = solveBassBar(p)!;
    p.graduation!.top.points.forEach(pt => pt.thickness = 4);
    const after = solveBassBar(p)!;
    after.knots.forEach((knot, i) => {
      expect(knot.topZ).toBeLessThan(before.knots[i].topZ);
      expect(knot.topZ - knot.bottom.x).toBeCloseTo(before.knots[i].topZ - before.knots[i].bottom.x, 9);
    });
    expect(after.left!.edge).not.toBe(before.left!.edge);
  });

  it('wants a point at each end before it carves the underside', () => {
    const p = seeded();
    p.graduation!.top.points = gridPoints(p, 30, 'top').map(pt => ({ ...pt, thickness: 3 }));
    p.bassBar!.points = p.bassBar!.points.filter(pt => pt.t > 0);
    const b = solveBassBar(p)!;
    expect(b.failures.map(f => f.unsolved)).toEqual([['shape']]);
    expect(b.left).toBeNull();
    expect(b.upperLeft).not.toBeNull();
  });

  it('marks where the underside comes up through the top', () => {
    const p = seeded();
    p.graduation!.top.points = gridPoints(p, 30, 'top').map(pt => ({ ...pt, thickness: 3 }));
    p.bassBar!.points.find(pt => pt.t === 0)!.h = -1;
    const b = solveBassBar(p)!;
    expect(b.failures.length).toBe(1);
    expect(b.failures[0].points!.length).toBeGreaterThan(0);
    expect(b.left).not.toBeNull();
  });
});

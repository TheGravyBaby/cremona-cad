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
    for (const key of ['length', 'width', 'height'] as const) {
      const p = seeded();
      (p.bassBar as any)[key] = null;
      expect(solveBassBar(p)!.failures.length, key).toBeGreaterThan(0);
    }
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

  it('closes each face, both on one foot below the top all along, the height short of it at the peak', () => {
    const p = seeded();
    p.graduation!.top.points = gridPoints(p, 30, 'top').map(pt => ({ ...pt, thickness: 3 }));
    const read = (d: string) => d.slice(2).split(' L ').map(pair => pair.split(' ').map(Number));
    const b = solveBassBar(p)!;
    const footZ = b.footZ!;
    const holding = [b.left!, b.right!].filter(face => face.height);
    expect(holding.length).toBe(1);
    const height = read(holding[0].height!);
    expect(height[1][0]).toBe(footZ);
    expect(height[0][0] - footZ).toBeCloseTo(p.bassBar!.height, 6);
    const tops: number[] = [];
    for (const face of [b.left!, b.right!]) {
      const edge = read(face.edge), foot = read(face.foot);
      expect(foot[0]).toEqual(edge[0]);
      expect(foot[foot.length - 1]).toEqual(edge[edge.length - 1]);
      expect(foot[1][0]).toBe(footZ);
      for (const [z] of edge) expect(z).toBeGreaterThan(footZ);
      tops.push(...edge.map(([z]) => z));
    }
    expect(Math.max(...tops)).toBe(height[0][0]);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildFemDeck, calcWoodMaterial, DevFemPanel, isFemBuilt, solvedFem } from './dev-fem-panel';
import { DevBassBarPanel } from '../dev-bassbar-panel/dev-bassbar-panel';
import { DevGraduationPanel, gridPoints, solveGraduation } from '../dev-graduation-panel/dev-graduation-panel';
import { rowAt, solveCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
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

const seeded = (): ViolinFamilyParams => {
  const p = blank();
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  PlateContourPanel.seed(p);
  FlutingPanel.seed(p);
  FHolePlacementPanel.seed(p);
  FHoleContoursPanel.seed(p);
  LongArchingPanel.seed(p);
  DevGraduationPanel.seed(p);
  for (const plate of ['top', 'back'] as const) p.graduation![plate].points = gridPoints(p, 30, plate).map(pt => ({ ...pt, thickness: 3 }));
  DevBassBarPanel.seed(p);
  DevFemPanel.seed(p);
  return p;
};

const euler = (corners: number, triangles: number[][]): number => {
  const edges = new Set<string>();
  for (const [a, b, c] of triangles) {
    for (const [u, v] of [[a, b], [b, c], [c, a]]) edges.add(`${Math.min(u, v)} ${Math.max(u, v)}`);
  }
  return corners - edges.size + triangles.length;
};

describe('the plate as shell elements', () => {
  const p = seeded();
  const step = 8;
  const top = solvedFem(p, { plate: 'top', step, bar: true })!;
  const back = solvedFem(p, { plate: 'back', step, bar: true })!;

  it('seeds once the plates are graduated, once only, and never writes to the params', () => {
    const q = blank();
    DevFemPanel.seed(q);
    expect(q.wood).toBeUndefined();

    p.wood!.top.density += 7;
    const edited = p.wood!.top.density;
    DevFemPanel.seed(p);
    expect(p.wood!.top.density).toBe(edited);

    const snapshot = JSON.stringify(p);
    solvedFem(p, { plate: 'top', step, bar: true });
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('meshes each plate as one sheet, the top with its two holes', () => {
    expect(top.failures).toEqual([]);
    expect(back.failures).toEqual([]);
    expect(solveGraduation(p)!.holes.length).toBe(2);
    expect(euler(top.corners, top.triangles)).toBe(-1);
    expect(euler(back.corners, back.triangles)).toBe(1);
    expect(back.web).toEqual([]);
  });

  it('stands every plate node half its thickness in from the outside, square to it', () => {
    const surface = solveCrossArching(p)!.back!;
    for (let n = 0; n < back.nodes.length; n += 37) {
      const at = back.plan[n], mid = back.nodes[n], normal = back.normals[n];
      const z = surfaceZAt(surface, at.x, at.y, rowAt(surface, at.y)) ?? 0;
      const off = { x: at.x - mid.x, y: at.y - mid.y, z: z - mid.z };
      expect(Math.hypot(off.x, off.y, off.z)).toBeCloseTo(back.thickness[n] / 2, 9);
      expect(off.x * normal.x + off.y * normal.y + off.z * normal.z).toBeCloseTo(back.thickness[n] / 2, 9);
    }
  });

  it('hangs the bar from the plate\'s own nodes, plumb, down to its underside', () => {
    const plateNodes = Math.max(...top.triangles.flat()) + 1;
    expect(top.web.length).toBeGreaterThan(0);
    for (const [lowA, lowB, upB, upA, lowMid, , upMid] of top.web) {
      for (const [up, low] of [[upA, lowA], [upB, lowB], [upMid, lowMid]]) {
        expect(up).toBeLessThan(plateNodes);
        expect(low).toBeGreaterThanOrEqual(plateNodes);
        expect(top.nodes[low].x).toBe(top.nodes[up].x);
        expect(top.nodes[low].y).toBe(top.nodes[up].y);
        expect(top.nodes[low].z).toBeLessThan(top.nodes[up].z);
      }
    }
    expect(top.barVolume).toBeGreaterThan(0);
    expect(top.barVolume).toBeLessThan(top.webVolume);
    expect(solvedFem(p, { plate: 'top', step, bar: false })!.web).toEqual([]);
  });

  it('keeps a built mesh through a wood edit, and no longer once the plate or the mesh fields move', () => {
    const q = seeded();
    const options = { plate: 'back' as const, step, bar: false };
    expect(isFemBuilt(q, options)).toBe(false);
    solvedFem(q, options);
    q.wood!.back.density += 10;
    expect(isFemBuilt(q, options)).toBe(true);
    expect(isFemBuilt(q, { ...options, step: step + 1 })).toBe(false);
    q.graduation!.back.points[0].thickness += 0.5;
    expect(isFemBuilt(q, options)).toBe(false);
  });

  it('weighs more the thicker it is graduated', () => {
    const q = seeded();
    for (const pt of q.graduation!.back.points) pt.thickness = 4;
    expect(solvedFem(q, { plate: 'back', step, bar: false })!.plateVolume).toBeGreaterThan(back.plateVolume);
  });

  it('reports a plate with no readings, a cleared wood field and a mesh too fine', () => {
    const q = seeded();
    q.graduation!.back.points = [];
    expect(solvedFem(q, { plate: 'back', step, bar: false })!.failures.map(f => f.unsolved)).toEqual([['mesh']]);
    const r = seeded();
    (r.wood!.back as any).density = null;
    expect(solvedFem(r, { plate: 'back', step, bar: false })!.failures.map(f => f.unsolved)).toEqual([['wood']]);
    expect(solvedFem(p, { plate: 'back', step: 0.1, bar: false })!.failures.map(f => f.unsolved)).toEqual([['mesh']]);
  });

  it('writes a deck whose elements name only nodes it holds', () => {
    const lines = buildFemDeck(p, top, 12, 'spec').split('\n');
    const nodeFrom = lines.findIndex(l => l.startsWith('*NODE,'));
    const nodeTo = lines.findIndex((l, i) => i > nodeFrom && l.startsWith('*'));
    expect(nodeTo - nodeFrom - 1).toBe(top.nodes.length);
    let named = 0, inElements = false;
    for (const line of lines) {
      if (line.startsWith('*')) { inElements = line.startsWith('*ELEMENT'); continue; }
      if (!inElements) continue;
      for (const id of line.split(',').slice(1).map(Number)) {
        expect(id).toBeGreaterThanOrEqual(1);
        expect(id).toBeLessThanOrEqual(top.nodes.length);
        named++;
      }
    }
    expect(named).toBe(6 * top.triangles.length + 8 * top.web.length);
    expect(lines.filter(l => l.startsWith('*SHELL SECTION')).length).toBe(2);
  });

  it('turns the plate\'s stiffer cross axis into the plane on the quarter, out of it on the slab', () => {
    const quarter = calcWoodMaterial('W', p.wood!.back, 'R');
    const slab = calcWoodMaterial('W', p.wood!.back, 'T');
    expect(quarter.E2).toBeGreaterThan(quarter.E3);
    expect(slab.E3).toBe(quarter.E2);
    expect(slab.E2).toBe(quarter.E3);
    expect(slab.G12).toBe(quarter.G13);
  });
});

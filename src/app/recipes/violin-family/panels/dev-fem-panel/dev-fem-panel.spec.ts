// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildFemDeck, buildGarlandDeck, buildNeckDeck, calcWoodMaterial, DevFemPanel, isFemBuilt, isFemGarlandBuilt, isFemNeckBuilt, isFemViolinBuilt, solvedFem, solvedFemGarland, solvedFemNeck, solvedFemViolin, buildViolinDeck } from './dev-fem-panel';
import { solveNeck } from '../neck-panel/neck-panel';
import { TURN } from '../../../../helpers/math/simpleGeometry';
import { DevBassBarPanel } from '../dev-bassbar-panel/dev-bassbar-panel';
import { DevGraduationPanel, gridPoints, solveGraduation } from '../dev-graduation-panel/dev-graduation-panel';
import { rowAt, solveCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { definePurflingPath, PlateContourPanel } from '../plate-contour-panel/plate-contour-panel';
import { solvedRibArcs } from '../corners-panel/corners-panel';
import { ribHeightAt, solveRibTaper } from '../long-arching-panel/long-arching-panel';
import { flattenPath } from '../../../../helpers/math/pathVibes';
import { distPointToPolyline } from '../../../../helpers/math/vibeMath';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { FHolePlacementPanel } from '../fhole-placement-panel/fhole-placement-panel';
import { FHoleContoursPanel } from '../fhole-contours-panel/fhole-contours-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { NeckPanel } from '../neck-panel/neck-panel';
import { VolutePanel } from '../volute-panel/volute-panel';
import { solveStringSetup, StringSetupPanel } from '../string-setup-panel/string-setup-panel';
import { ViolinFamilyParams } from '../../violin-family-types';
import { Pt } from '../../../../models/types';
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
  NeckPanel.seed(p);
  VolutePanel.seed(p);
  StringSetupPanel.seed(p);
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

describe('the rib garland as elements', () => {
  const p = seeded();
  const step = 8;
  const g = solvedFemGarland(p, step)!;
  const ribLine = flattenPath(definePurflingPath(p, solvedRibArcs(p)!, 0)!, 0.25, true)[0];
  const taper = solveRibTaper(p)!;
  const ribs = g.runs.flatMap(run => run.ribs);
  const linings = g.runs.flatMap(run => run.linings);
  const signedVolume = (a: number, b: number, c: number, d: number): number => {
    const [o, u, v, w] = [a, b, c, d].map(n => g.nodes[n]);
    return ((u.x - o.x) * ((v.y - o.y) * (w.z - o.z) - (v.z - o.z) * (w.y - o.y))
      - (u.y - o.y) * ((v.x - o.x) * (w.z - o.z) - (v.z - o.z) * (w.x - o.x))
      + (u.z - o.z) * ((v.x - o.x) * (w.y - o.y) - (v.y - o.y) * (w.x - o.x)));
  };

  it('builds without a failure and never writes to the params', () => {
    const snapshot = JSON.stringify(p);
    expect(solvedFemGarland(p, step)!.failures).toEqual([]);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('steps the rib line off on the ribs\' inner face, round once, lined everywhere but over a block', () => {
    expect(g.ribLine.length % 2).toBe(0);
    expect(new Set(g.ribLine).size).toBe(g.ribLine.length);
    expect(g.lined.length).toBe(g.ribLine.length / 2);
    for (const n of g.ribLine) expect(distPointToPolyline(g.plan[n], ribLine)).toBeLessThan(0.15 * step);
    const onBlock = new Set(g.triangles.flat());
    g.lined.forEach((lined, e) => {
      const ends = [g.ribLine[2 * e], g.ribLine[(2 * e + 2) % g.ribLine.length]];
      if (!lined) expect(ends.every(n => onBlock.has(n))).toBe(true);
    });
    expect(g.lined.filter(lined => !lined).length).toBeGreaterThanOrEqual(6);
    expect(g.lined.filter(lined => lined).length).toBeGreaterThan(g.lined.length / 2);
  });

  it('stands the ribs as one closed band from the back\'s gluing plane to the top\'s, looking outward', () => {
    const edges = new Set<string>();
    const corners = new Set<number>();
    for (const quad of ribs) {
      const [a, b, c, d] = quad;
      for (const [u, v] of [[a, b], [b, c], [c, d], [d, a]]) edges.add(`${Math.min(u, v)} ${Math.max(u, v)}`);
      for (const n of [a, b, c, d]) corners.add(n);
      expect(g.nodes[d].z).toBeGreaterThan(g.nodes[a].z);
      expect(g.nodes[d].x).toBe(g.nodes[a].x);
      expect(g.nodes[d].y).toBe(g.nodes[a].y);
      const run = { x: g.nodes[b].x - g.nodes[a].x, y: g.nodes[b].y - g.nodes[a].y };
      for (const n of quad) {
        const normal = g.normals[n];
        if (normal.x || normal.y) expect(run.y * normal.x - run.x * normal.y).toBeGreaterThan(0);
      }
    }
    expect(corners.size - edges.size + ribs.length).toBe(0);
    for (const n of corners) {
      expect(g.nodes[n].z).toBeGreaterThanOrEqual(0);
      expect(g.nodes[n].z).toBeLessThanOrEqual(ribHeightAt(p, g.nodes[n].y, taper) + 1e-9);
    }
    const tops = [...corners].filter(n => Math.abs(g.nodes[n].z - ribHeightAt(p, g.nodes[n].y, taper)) < 1e-9);
    const feet = [...corners].filter(n => g.nodes[n].z === 0);
    expect(tops.length).toBe(g.ribLine.length / 2);
    expect(feet.length).toBe(g.ribLine.length / 2);
  });

  it('glues every lining and block to the ribs by the ribs\' own nodes, each element the right way out', () => {
    const ribNodes = new Set(ribs.flat());
    for (const brick of linings) {
      expect(brick.length).toBe(20);
      expect(new Set(brick).size).toBe(20);
      const glued = [...brick.slice(4, 8), ...brick.slice(12, 16)];
      expect(glued.every(n => ribNodes.has(n))).toBe(true);
      expect(brick.slice(0, 4).some(n => ribNodes.has(n))).toBe(false);
      expect(signedVolume(brick[0], brick[1], brick[3], brick[4])).toBeGreaterThan(0);
      for (let k = 0; k < 4; k++) {
        const inner = g.nodes[brick[k]], outer = g.nodes[brick[k + 4]];
        expect(Math.hypot(inner.x - outer.x, inner.y - outer.y)).toBeGreaterThan(p.graduation!.lining - 1e-6);
        expect(distPointToPolyline(new Pt(inner.x, inner.y), ribLine)).toBeCloseTo(p.graduation!.lining, 1);
        // a block's node reads the taper where it stands, a lining's breadth off the rib's
        expect(inner.z).toBeCloseTo(outer.z, 1);
      }
    }
    for (const wedge of g.wedges) {
      expect(new Set(wedge).size).toBe(15);
      expect(signedVolume(wedge[0], wedge[1], wedge[2], wedge[3])).toBeGreaterThan(0);
    }
    expect(g.wedges.flat().filter(n => ribNodes.has(n)).length).toBeGreaterThan(0);
    const used = new Set([...ribs.flat(), ...linings.flat(), ...g.wedges.flat()]);
    expect(used.size).toBe(g.nodes.length);
  });

  it('butts both ends of every lining against a block, the end face on the block\'s own nodes', () => {
    const blockNodes = new Set(g.wedges.flat());
    const ends = 2 * g.lined.filter((lined, e) => lined && !g.lined[(e + g.lined.length - 1) % g.lined.length]).length;
    const perStretch = linings.length / g.lined.filter(lined => lined).length;
    expect(ends).toBe(12);
    for (const size of [step, 5]) {
      const each = size === step ? g : solvedFemGarland(p, size)!;
      const bricks = each.runs.flatMap(run => run.linings);
      const blocks = new Set(each.wedges.flat());
      const rows = bricks.length / each.lined.filter(lined => lined).length;
      // an end face is the brick's nodes at one end of its run: two inner, two outer, a midside on each and two halfway
      const butted = bricks.filter(brick => [[0, 3, 4, 7, 11, 15, 16, 19], [1, 2, 5, 6, 9, 13, 17, 18]].some(face => face.every(k => blocks.has(brick[k]))));
      expect(butted.length).toBe(ends * rows);
    }
    expect(perStretch).toBeGreaterThanOrEqual(2);
    expect(linings.some(brick => brick.slice(0, 4).some(n => blockNodes.has(n)))).toBe(true);
  });

  it('weighs what the ribs, linings and blocks measure', () => {
    const perimeter = ribLine.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.x - ribLine[i].x, q.y - ribLine[i].y), 0);
    const height = (taper.zLower + taper.zUpper) / 2;
    expect(g.ribVolume / (perimeter * height * p.body.rib)).toBeGreaterThan(0.97);
    expect(g.ribVolume / (perimeter * height * p.body.rib)).toBeLessThan(1.03);
    const linedShare = g.liningVolume / (2 * perimeter * p.graduation!.liningHeight * p.graduation!.lining);
    expect(linedShare).toBeGreaterThan(0.5);
    expect(linedShare).toBeLessThan(1);
    const q = seeded();
    q.graduation!.liningHeight += 2;
    expect(solvedFemGarland(q, step)!.liningVolume).toBeGreaterThan(g.liningVolume);
    expect(solvedFemGarland(q, step)!.blockVolume).toBeCloseTo(g.blockVolume, 6);
  });

  it('keeps a built garland through a wood edit, and no longer once the ribs, linings or blocks move', () => {
    const q = seeded();
    expect(isFemGarlandBuilt(q, step)).toBe(false);
    solvedFemGarland(q, step);
    q.wood!.ribs.density += 10;
    expect(isFemGarlandBuilt(q, step)).toBe(true);
    expect(isFemGarlandBuilt(q, step + 1)).toBe(false);
    q.graduation!.liningHeight += 1;
    expect(isFemGarlandBuilt(q, step)).toBe(false);
    solvedFemGarland(q, step);
    q.arching!.ribHeightUpper -= 1;
    expect(isFemGarlandBuilt(q, step)).toBe(false);
    solvedFemGarland(q, step);
    q.graduation!.lining += 0.5;
    expect(isFemGarlandBuilt(q, step)).toBe(false);
  });

  it('reports linings with no height or too tall, a cleared wood field and a mesh too fine', () => {
    const q = seeded();
    (q.graduation as any).liningHeight = undefined;
    expect(solvedFemGarland(q, step)!.failures.map(f => f.unsolved)).toEqual([['mesh']]);
    q.graduation!.liningHeight = q.arching!.ribHeightUpper;
    expect(solvedFemGarland(q, step)!.failures.map(f => f.unsolved)).toEqual([['mesh']]);
    const r = seeded();
    (r.wood!.blocks as any).stiffness = null;
    expect(solvedFemGarland(r, step)!.failures.map(f => f.unsolved)).toEqual([['wood']]);
    expect(solvedFemGarland(p, 0.1)!.failures.map(f => f.unsolved)).toEqual([['mesh']]);
  });

  it('seeds the garland\'s woods into a file that has only the plates\'', () => {
    const q = seeded();
    delete (q.wood as any).ribs;
    delete (q.wood as any).linings;
    delete (q.wood as any).blocks;
    q.wood!.top.density += 7;
    const edited = q.wood!.top.density;
    DevFemPanel.seed(q);
    expect(q.wood!.top.density).toBe(edited);
    expect(solvedFemGarland(q, step)!.failures).toEqual([]);
  });

  it('writes a deck with a section for every element set, the solids among them', () => {
    const lines = buildGarlandDeck(p, g, 12, 'spec').split('\n');
    const sets = lines.filter(l => l.startsWith('*ELEMENT')).map(l => l.split('ELSET=')[1]);
    const sections = lines.filter(l => l.startsWith('*SHELL SECTION') || l.startsWith('*SOLID SECTION')).map(l => l.split('ELSET=')[1].split(',')[0]);
    expect(new Set(sets).size).toBe(sets.length);
    expect([...sections].sort()).toEqual([...sets].sort());
    expect(sets).toContain('BLOCKS');
    for (const line of lines.filter(l => l.startsWith('*SHELL SECTION') || l.startsWith('*SOLID SECTION'))) {
      const material = line.split('MATERIAL=')[1].split(',')[0], orientation = line.split('ORIENTATION=')[1].split(',')[0];
      expect(lines).toContain(`*MATERIAL, NAME=${material}`);
      expect(lines.some(l => l.startsWith(`*ORIENTATION, NAME=${orientation},`))).toBe(true);
    }
  });
});

describe('the neck, head and fingerboard as elements', () => {
  const p = seeded();
  const step = 8;
  const s = solvedFemNeck(p, step)!;
  const n = solveNeck(p)!;
  const angle = p.neck!.angle * TURN.degree;
  // how far a node stands off the fingerboard plane, toward the strings
  const offPlane = (i: number): number => (s.nodes[i].z - n.neckTop!.x) * Math.cos(angle) + (s.nodes[i].y - n.neckTop!.y) * Math.sin(angle);
  const signedVolume = (a: number, b: number, c: number, d: number): number => {
    const [o, u, v, w] = [a, b, c, d].map(i => s.nodes[i]);
    return ((u.x - o.x) * ((v.y - o.y) * (w.z - o.z) - (v.z - o.z) * (w.y - o.y))
      - (u.y - o.y) * ((v.x - o.x) * (w.z - o.z) - (v.z - o.z) * (w.x - o.x))
      + (u.z - o.z) * ((v.x - o.x) * (w.y - o.y) - (v.y - o.y) * (w.x - o.x)));
  };

  it('builds without a failure and never writes to the params', () => {
    const snapshot = JSON.stringify(p);
    expect(solvedFemNeck(p, step)!.failures).toEqual([]);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('stands every element the right way out, on nodes all its own, with no node left over', () => {
    for (const wedge of s.wedges) {
      expect(new Set(wedge).size).toBe(15);
      expect(signedVolume(wedge[0], wedge[1], wedge[2], wedge[3])).toBeGreaterThan(0);
    }
    for (const brick of s.bricks) {
      expect(new Set(brick).size).toBe(20);
      expect(signedVolume(brick[0], brick[1], brick[3], brick[4])).toBeGreaterThan(0);
    }
    expect(new Set([...s.wedges.flat(), ...s.bricks.flat()]).size).toBe(s.nodes.length);
  });

  it('is the same wood either side of the centre line', () => {
    const key = (x: number, y: number, z: number): string => `${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`;
    const at = new Set(s.nodes.map(q => key(q.x, q.y, q.z)));
    for (const q of s.nodes) expect(at.has(key(-q.x || 0, q.y, q.z))).toBe(true);
  });

  it('leaves the pegbox hollow between its cheeks, and nowhere else', () => {
    expect(s.wedges.length).toBeLessThan(3 * s.triangles.length);
    expect(s.wedges.length).toBeGreaterThan(2 * s.triangles.length);
    const q = seeded();
    q.scroll!.wall += 1;
    expect(solvedFemNeck(q, step)!.wedges.length).toBeGreaterThanOrEqual(s.wedges.length);
  });

  it('glues the fingerboard to the neck\'s front by the neck\'s own nodes, and runs it on free over the body', () => {
    const neckNodes = new Set(s.wedges.flat());
    let glued = 0, free = 0;
    for (const brick of s.bricks) {
      const underside = [...brick.slice(0, 4), ...brick.slice(8, 12)];
      for (const i of underside) expect(offPlane(i)).toBeCloseTo(0, 9);
      for (const i of brick.slice(4, 8)) expect(offPlane(i)).toBeGreaterThanOrEqual(p.stringSetup!.fingerboardThickness - 1e-9);
      expect(brick.slice(4, 8).some(i => neckNodes.has(i))).toBe(false);
      if (underside.every(i => neckNodes.has(i))) glued++;
      else if (!underside.some(i => neckNodes.has(i))) free++;
    }
    expect(glued).toBeGreaterThan(0);
    expect(free).toBeGreaterThan(0);
    // the one row of bricks at the root has an edge on the neck and the rest over the body
    expect(s.bricks.length - glued - free).toBeLessThanOrEqual(3);
    for (const i of neckNodes) expect(offPlane(i)).toBeLessThan(p.neck!.nutHeight + 1e-6);
  });

  it('weighs a board between its edge thickness and its crown, and a neck lighter than its block', () => {
    const ss = p.stringSetup!;
    const plan = ss.fingerboardLength * (p.neck!.topWidth + 2 * Math.max(...s.nodes.map(q => q.x))) / 2;
    expect(s.boardVolume).toBeGreaterThan(plan * ss.fingerboardThickness);
    expect(s.boardVolume).toBeLessThan(plan * (ss.fingerboardThickness + 3));
    expect(s.neckVolume).toBeGreaterThan(0);
    const q = seeded();
    q.neck!.upperThickness += 2;
    q.neck!.lowerThickness += 2;
    expect(solvedFemNeck(q, step)!.neckVolume).toBeGreaterThan(s.neckVolume);
  });

  it('takes the whole volute as wide as its first turn\'s bottom, the eyes left off', () => {
    const widest = (params: ViolinFamilyParams): number => {
      const head = solvedFemNeck(params, step)!.nodes.filter(q => q.y > n.neckTop!.y + p.scroll!.eye.y - p.scroll!.eye.r);
      return 2 * Math.max(...head.map(q => q.x));
    };
    expect(widest(p)).toBeCloseTo(p.scroll!.widths.turn1Bottom, 9);
    const q = seeded();
    q.scroll!.widths.eye += 6;
    expect(widest(q)).toBeCloseTo(widest(p), 9);
    q.scroll!.widths.turn1Bottom += 4;
    expect(widest(q)).toBeCloseTo(widest(p) + 4, 9);
  });

  it('keeps a built neck through a wood edit, and no longer once the neck, scroll or board moves', () => {
    const q = seeded();
    expect(isFemNeckBuilt(q, step)).toBe(false);
    solvedFemNeck(q, step);
    q.wood!.neck.density += 10;
    expect(isFemNeckBuilt(q, step)).toBe(true);
    expect(isFemNeckBuilt(q, step + 1)).toBe(false);
    q.neck!.length += 1;
    expect(isFemNeckBuilt(q, step)).toBe(false);
    solvedFemNeck(q, step);
    q.scroll!.widths.turn1Bottom += 1;
    expect(isFemNeckBuilt(q, step)).toBe(false);
    solvedFemNeck(q, step);
    q.stringSetup!.fingerboardThickness += 0.5;
    expect(isFemNeckBuilt(q, step)).toBe(false);
  });

  it('reports a neck with no scroll drafted, a cleared wood field and a mesh too fine', () => {
    const q = seeded();
    delete q.scroll;
    expect(solvedFemNeck(q, step)!.failures.map(f => f.unsolved)).toEqual([['mesh']]);
    const r = seeded();
    (r.wood!.fingerboard as any).density = null;
    expect(solvedFemNeck(r, step)!.failures.map(f => f.unsolved)).toEqual([['wood']]);
    expect(solvedFemNeck(p, 0.1)!.failures.map(f => f.unsolved)).toEqual([['mesh']]);
  });

  it('writes a deck of solids alone, a section for each set', () => {
    const lines = buildNeckDeck(p, s, 12, 'spec').split('\n');
    expect(lines.filter(l => l.startsWith('*ELEMENT')).map(l => l.split('ELSET=')[1])).toEqual(['NECK', 'FINGERBOARD']);
    expect(lines.filter(l => l.startsWith('*SOLID SECTION')).length).toBe(2);
    expect(lines.some(l => l.startsWith('*SHELL SECTION') || l.startsWith('*NORMAL'))).toBe(false);
    expect(lines).toContain('*MATERIAL, NAME=BOARD_WOOD');
  });
});

describe('the violin glued up', () => {
  const p = seeded();
  const step = 8;
  const garlandBefore = JSON.stringify(solvedFemGarland(p, step)!.nodes);
  const v = solvedFemViolin(p, step, true, true)!;
  const garland = solvedFemGarland(p, step)!;
  const neck = solvedFemNeck(p, step)!;
  const topAlone = solvedFem(p, { plate: 'top', step, bar: true })!;
  const backAlone = solvedFem(p, { plate: 'back', step, bar: false })!;
  const taper = solveRibTaper(p)!;
  const topEdge = p.arching!.top.thickness, backEdge = p.arching!.back.thickness;
  const ribs = v.runs.flatMap(run => run.ribs);
  const linings = v.runs.flatMap(run => run.linings);
  const signedVolume = (a: number, b: number, c: number, d: number): number => {
    const [o, u, w, t] = [a, b, c, d].map(i => v.nodes[i]);
    return ((u.x - o.x) * ((w.y - o.y) * (t.z - o.z) - (w.z - o.z) * (t.y - o.y))
      - (u.y - o.y) * ((w.x - o.x) * (t.z - o.z) - (w.z - o.z) * (t.x - o.x))
      + (u.z - o.z) * ((w.x - o.x) * (t.y - o.y) - (w.y - o.y) * (t.x - o.x)));
  };

  it('builds without a failure, writes to no params and leaves the garland alone as it was', () => {
    const snapshot = JSON.stringify(p);
    expect(solvedFemViolin(p, step, true, true)!.failures).toEqual([]);
    expect(JSON.stringify(p)).toBe(snapshot);
    expect(JSON.stringify(garland.nodes)).toBe(garlandBefore);
  });

  it('ends every column of the garland on a node of the plate over it, the top above and the back below', () => {
    const inTop = new Set(v.top.flat()), inBack = new Set(v.back.flat());
    for (const n of garland.tops) expect(inTop.has(n)).toBe(true);
    for (const n of garland.feet) expect(inBack.has(n)).toBe(true);
    for (const plan of garland.ribLine) {
      const top = v.nodes[garland.tops[plan]], foot = v.nodes[garland.feet[plan]];
      const height = ribHeightAt(p, garland.plan[plan].y, taper);
      // plumb over the rib line, half an edge thickness into each plate, give or take the taper's lean
      expect(Math.hypot(top.x - garland.plan[plan].x, top.y - garland.plan[plan].y)).toBeLessThan(0.05);
      expect(foot.x).toBeCloseTo(garland.plan[plan].x, 9);
      // the outside has begun to fall away from the edge by the rib line
      expect(top.z).toBeLessThan(height + topEdge / 2 + 0.05);
      expect(top.z).toBeGreaterThan(height + topEdge / 2 - 0.5);
      expect(foot.z).toBeGreaterThan(-backEdge / 2 - 0.05);
      expect(foot.z).toBeLessThan(-backEdge / 2 + 0.5);
    }
    expect(Math.min(...[...inTop].map(n => v.nodes[n].z))).toBeGreaterThan(Math.max(...[...inBack].map(n => v.nodes[n].z)));
  });

  it('stands every element the right way out, the plates\' along their own normals', () => {
    for (const tri of [...v.top, ...v.back]) {
      const [a, b, c] = tri.map(n => v.nodes[n]);
      const across = {
        x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
        y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
        z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
      };
      for (const n of tri) {
        const normal = v.plateNormals[n];
        expect(across.x * normal.x + across.y * normal.y + across.z * normal.z).toBeGreaterThan(0);
      }
      // a midside node within the middle of its edge, so the element isn't folded
      for (const [u, w, mid] of [[0, 1, 3], [1, 2, 4], [2, 0, 5]]) {
        const from = v.nodes[tri[u]], to = v.nodes[tri[w]], at = v.nodes[tri[mid]];
        const along = ((at.x - from.x) * (to.x - from.x) + (at.y - from.y) * (to.y - from.y) + (at.z - from.z) * (to.z - from.z))
          / ((to.x - from.x) ** 2 + (to.y - from.y) ** 2 + (to.z - from.z) ** 2);
        expect(along).toBeGreaterThan(0.3);
        expect(along).toBeLessThan(0.7);
      }
    }
    for (const wedge of [...v.blocks, ...v.neck]) expect(signedVolume(wedge[0], wedge[1], wedge[2], wedge[3])).toBeGreaterThan(0);
    for (const brick of [...linings, ...v.board]) expect(signedVolume(brick[0], brick[1], brick[3], brick[4])).toBeGreaterThan(0);
    for (const quad of ribs) expect(v.nodes[quad[3]].z).toBeGreaterThan(v.nodes[quad[0]].z);
  });

  it('turns the back over under the garland and sets the top on the taper', () => {
    const deepest = Math.min(...v.back.flat().map(n => v.nodes[n].z));
    const crown = Math.max(...backAlone.nodes.map(q => q.z));
    expect(deepest).toBeCloseTo(-(crown + backEdge), 0);
    const high = Math.max(...v.top.flat().map(n => v.nodes[n].z));
    expect(high).toBeGreaterThan(Math.max(taper.zLower, taper.zUpper) + topEdge);
    expect(v.web.length).toBeGreaterThan(0);
    // the bar hangs under the top, inside the body
    for (const quad of v.web) expect(v.nodes[quad[0]].z).toBeLessThan(v.nodes[quad[3]].z);
  });

  it('stands the sound post between the plates on their own nodes, where the string setup puts it', () => {
    const stands = solveStringSetup(p)!.soundPost!;
    const inTop = new Set(v.top.flat()), inBack = new Set(v.back.flat());
    const nodes = new Set(v.post.flat());
    expect(v.post.length % 6).toBe(0);
    expect(v.post.length).toBeGreaterThanOrEqual(12);
    expect([...nodes].filter(n => inTop.has(n)).length).toBe(19);
    expect([...nodes].filter(n => inBack.has(n)).length).toBe(19);
    let section = 0;
    for (const wedge of v.post) {
      expect(new Set(wedge).size).toBe(15);
      expect(signedVolume(wedge[0], wedge[1], wedge[2], wedge[3])).toBeGreaterThan(0);
      for (const n of wedge) expect(Math.hypot(v.nodes[n].x - stands.x, v.nodes[n].y - stands.y)).toBeLessThan(1.25 * stands.r);
    }
    // the six wedges of the lowest layer cover the post's own section
    for (const wedge of v.post.filter(w => inBack.has(w[0]))) {
      const [a, b, c] = wedge.slice(0, 3).map(n => v.nodes[n]);
      section += ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
    }
    expect(section / (Math.PI * stands.r ** 2)).toBeGreaterThan(0.95);
    expect(section / (Math.PI * stands.r ** 2)).toBeLessThan(1.05);
    expect(v.shares.soundPost).toBeGreaterThan(0.9);
    expect(v.shares.soundPost).toBeLessThan(1);
    const span = Math.max(...[...nodes].map(n => v.nodes[n].z)) - Math.min(...[...nodes].map(n => v.nodes[n].z));
    expect(v.volumes.soundPost).toBeLessThan(Math.PI * stands.r ** 2 * span);
    expect(v.volumes.soundPost).toBeGreaterThan(0.8 * Math.PI * stands.r ** 2 * span);
  });

  it('glues the heel\'s end to the neck block\'s outer face', () => {
    expect(v.heel.length).toBe(neck.seat.length);
    expect(v.mortise.length).toBeGreaterThan(0);
    const rootY = v.nodes[v.heel[0]].y;
    for (const n of v.heel) expect(v.nodes[n].y).toBeCloseTo(rootY, 9);
    const reach = Math.max(...v.heel.map(n => Math.abs(v.nodes[n].x)));
    for (const { element, face } of v.mortise) {
      const wedge = v.blocks[element];
      const [a, b] = [[0, 1], [1, 2], [2, 0]][face - 3].map(k => v.nodes[wedge[k]]);
      expect(a.y).toBeGreaterThan(0.9 * p.body.height);
      // the face runs along the ribs, and where it passes behind the heel it is within the glue's reach
      for (const q of [a, b]) {
        if (Math.abs(q.x) < reach) expect(Math.abs(q.y - rootY)).toBeLessThan(3);
      }
    }
    const covered = Math.max(...v.mortise.flatMap(({ element }) => v.blocks[element].slice(0, 6).map(n => Math.abs(v.nodes[n].x))));
    expect(covered).toBeGreaterThanOrEqual(reach);
  });

  it('lightens the garland by the wood its longer columns share with the plates, and weighs each part as it is alone', () => {
    for (const share of Object.values(v.shares)) {
      expect(share).toBeGreaterThan(0.7);
      expect(share).toBeLessThan(1);
    }
    expect(v.volumes.ribs).toBe(garland.ribVolume);
    expect(v.volumes.neck).toBe(neck.neckVolume);
    // the glued top is meshed over again on the garland, so it weighs the same only nearly
    expect(v.volumes.top / topAlone.plateVolume).toBeGreaterThan(0.97);
    expect(v.volumes.top / topAlone.plateVolume).toBeLessThan(1.03);
  });

  it('keeps a built violin through a wood edit, and no longer once any part of it moves', () => {
    const q = seeded();
    expect(isFemViolinBuilt(q, step, true, true)).toBe(false);
    // the mesh built above stands in for one built on these params, which are the same
    const moves = [
      () => { q.graduation!.top.points[0].thickness += 0.5; }, () => { q.graduation!.back.points[0].thickness += 0.5; },
      () => { q.graduation!.liningHeight += 1; }, () => { q.neck!.length += 1; }, () => { q.bassBar!.width += 0.5; },
    ];
    for (const move of moves) {
      q.solved!.femViolin.solve = { options: JSON.stringify([step, true, true]), mesh: v };
      q.wood!.back.density += 10;
      expect(isFemViolinBuilt(q, step, true, true)).toBe(true);
      expect(isFemViolinBuilt(q, step, false, true)).toBe(false);
      expect(isFemViolinBuilt(q, step, true, false)).toBe(false);
      move();
      expect(isFemViolinBuilt(q, step, true, true)).toBe(false);
    }
  });

  it('reports what a part would alone: a plate with no readings, a neck with no scroll, a cleared wood field', () => {
    const q = seeded();
    q.graduation!.back.points = [];
    expect(solvedFemViolin(q, step, true, true)!.failures.map(f => f.unsolved)).toEqual([['mesh']]);
    const r = seeded();
    delete r.scroll;
    expect(solvedFemViolin(r, step, true, true)!.failures.map(f => f.unsolved)).toEqual([['mesh']]);
    const stiffness = p.wood!.neck.stiffness;
    (p.wood!.neck as any).stiffness = null;
    expect(solvedFemViolin(p, step, true, true)!.failures.map(f => f.unsolved)).toEqual([['wood']]);
    p.wood!.neck.stiffness = stiffness;
  });

  it('writes one deck: a section for every set, every element on nodes it holds, and the neck tied on', () => {
    const lines = buildViolinDeck(p, v, 12, 'spec').split('\n');
    const sets = lines.filter(l => l.startsWith('*ELEMENT')).map(l => l.split('ELSET=')[1]);
    const sections = lines.filter(l => l.startsWith('*SHELL SECTION') || l.startsWith('*SOLID SECTION')).map(l => l.split('ELSET=')[1].split(',')[0]);
    expect([...sections].sort()).toEqual([...sets].sort());
    for (const name of ['TOP', 'BACK', 'BASS_BAR', 'BLOCKS', 'NECK', 'FINGERBOARD', 'SOUND_POST']) expect(sets).toContain(name);
    expect(lines.filter(l => l.startsWith('*TIE')).length).toBe(1);
    const from = lines.indexOf('*NODAL THICKNESS');
    const thick = lines.slice(from + 1, lines.findIndex((l, i) => i > from && l.startsWith('*')));
    expect(thick.length).toBe(new Set([...v.top.flat(), ...v.back.flat()]).size);
    for (const line of thick) expect(Number(line.split(',')[1])).toBeGreaterThan(0);
  });
});

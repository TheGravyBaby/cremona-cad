// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dist, pointInPolygon } from '../../../../helpers/math/simpleGeometry';
import { samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed } from '../../../../helpers/math/vibeMath';
import { Pt } from '../../../../models/types';
import { DevGraduationPanel, edgeThicknessOf, gridPoints, plateMap, solveGraduation, thicknessBands, thicknessField, zonePoints } from './dev-graduation-panel';
import { purflingPath, ribArcs, PlateContourPanel } from '../plate-contour-panel/plate-contour-panel';
import { CornersPanel, solveCorners } from '../corners-panel/corners-panel';
import { MainBoutsPanel, solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { FHolePlacementPanel } from '../fhole-placement-panel/fhole-placement-panel';
import { FHoleContoursPanel } from '../fhole-contours-panel/fhole-contours-panel';
import { MouldPanel } from '../mould-panel/mould-panel';
import { ThemeService } from '../../../../theme/theme.service';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { solveCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { GraduationParams, ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const seeded = (p = blank()): ViolinFamilyParams => {
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  PlateContourPanel.seed(p);
  return p;
};
const grad = (p: ViolinFamilyParams): GraduationParams => {
  DevGraduationPanel.seed(p);
  return p.graduation!;
};
const solved = (p: ViolinFamilyParams, change: (s: GraduationParams) => void = () => {}) => {
  const s = grad(p);
  change(s);
  return { settings: s, solve: solveGraduation(p)! };
};
const SPACING = 40;

const points = (d: string): Pt[] => samplePathToPolyline(d, 0.25, true);
const closed = (d: string): boolean => {
  const q = points(d);
  return dist(q[0], q[q.length - 1]) < 1e-5;
};
const mirrored = (d: string, tolerance = 0.05): boolean => {
  const q = points(d);
  const idx = buildPolylineIndex(q);
  return q.every(pt => distPointToPolylineIndexed(new Pt(-pt.x, pt.y), idx) < tolerance);
};
const ribLine = (p: ViolinFamilyParams): Pt[] =>
  points(purflingPath(p, ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!)!, 0)!);

describe('the graduation solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    grad(p);
    const snapshot = JSON.stringify(p);
    solveGraduation(p);
    thicknessField(p, 'top');
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('is null until the stage is seeded, and the seed waits for the plate edge', () => {
    const p = blank();
    MainBoutsPanel.seed(p);
    CornersPanel.seed(p);
    DevGraduationPanel.seed(p);
    expect(p.graduation).toBeUndefined();
    expect(solveGraduation(p)).toBeNull();
  });

  it('makes two closed, mirrored loops with nothing to report', () => {
    const s = solved(seeded()).solve;
    expect(s.failures).toEqual([]);
    for (const d of [s.lining!, s.boundary!]) {
      expect(closed(d)).toBe(true);
      expect(mirrored(d)).toBe(true);
    }
  });

  it('keeps each loop inside the rib line by at least its own inset', () => {
    const p = seeded();
    const { settings, solve: s } = solved(p);
    const rib = ribLine(p);
    const idx = buildPolylineIndex(rib);
    for (const [d, inset] of [[s.lining!, settings.lining], [s.boundary!, settings.edgeInset]] as const) {
      for (const pt of points(d)) {
        expect(pointInPolygon(pt, rib)).toBe(true);
        // sampled chords cut inside the arcs, so a hair of slack
        expect(distPointToPolylineIndexed(pt, idx)).toBeGreaterThan(inset - 0.05);
      }
    }
  });

  it('keeps the boundary inside the lining line', () => {
    const s = solved(seeded()).solve;
    const lining = points(s.lining!);
    const idx = buildPolylineIndex(lining);
    // with no block margin the two share their run along each block's face
    for (const pt of points(s.boundary!)) expect(pointInPolygon(pt, lining) || distPointToPolylineIndexed(pt, idx) < 0.05).toBe(true);
  });

  it('makes two closed blocks on the rib line, each with a flat inner face', () => {
    const p = seeded();
    const s = solved(p).solve;
    const rib = ribLine(p);
    const idx = buildPolylineIndex(rib);
    for (const [d, inward] of [[s.blocks!.neck, 1], [s.blocks!.end, -1]] as const) {
      expect(closed(d)).toBe(true);
      // the boolean's seam on the centreline leaves a sampled sliver
      expect(mirrored(d, 0.1)).toBe(true);
      const q = points(d);
      for (const pt of q) expect(pointInPolygon(pt, rib) || distPointToPolylineIndexed(pt, idx) < 0.05).toBe(true);
      // the face is the block's extreme toward the body, and a run of points share it
      const face = inward > 0 ? Math.min(...q.map(pt => pt.y)) : Math.max(...q.map(pt => pt.y));
      const onFace = q.filter(pt => Math.abs(pt.y - face) < 1e-6);
      expect(Math.max(...onFace.map(pt => pt.x)) - Math.min(...onFace.map(pt => pt.x))).toBeGreaterThan(1);
      // and nothing of the block reaches the rib line at the face's level: the corners are rounded
      for (const pt of onFace) expect(distPointToPolylineIndexed(pt, idx)).toBeGreaterThan(0.5);
    }
  });

  it('cuts the boundary straight across at the blocks and steps the lining line round them', () => {
    const s = solved(seeded()).solve;
    const neck = points(s.blocks!.neck);
    const end = points(s.blocks!.end);
    const neckFace = Math.min(...neck.map(pt => pt.y));
    const endFace = Math.max(...end.map(pt => pt.y));
    const boundary = points(s.boundary!);
    expect(closed(s.boundary!)).toBe(true);
    for (const pt of boundary) {
      expect(pt.y).toBeLessThanOrEqual(neckFace + 1e-6);
      expect(pt.y).toBeGreaterThanOrEqual(endFace - 1e-6);
    }
    // a straight run along each face
    for (const face of [neckFace, endFace]) {
      const onFace = boundary.filter(pt => Math.abs(pt.y - face) < 1e-6);
      expect(Math.max(...onFace.map(pt => pt.x)) - Math.min(...onFace.map(pt => pt.x))).toBeGreaterThan(10);
    }
    // the lining line passes beside the blocks up to the rib line, but never through them
    const lining = points(s.lining!);
    expect(closed(s.lining!)).toBe(true);
    expect(Math.max(...lining.map(pt => pt.y))).toBeGreaterThan(neckFace + 1);
    const inside = (pt: Pt, block: Pt[]) => pointInPolygon(pt, block) && distPointToPolylineIndexed(pt, buildPolylineIndex(block)) > 0.05;
    for (const pt of lining) {
      expect(inside(pt, neck)).toBe(false);
      expect(inside(pt, end)).toBe(false);
    }
  });

  it('holds the boundary off the blocks by a positive block margin, leaving the blocks alone', () => {
    const p = seeded();
    const tight = solved(p).solve;
    const held = solved(p, s => s.blockMargin = 5).solve;
    const top = (d: string) => Math.max(...points(d).map(pt => pt.y));
    const bottom = (d: string) => Math.min(...points(d).map(pt => pt.y));
    expect(top(tight.boundary!) - top(held.boundary!)).toBeCloseTo(5, 3);
    expect(bottom(held.boundary!) - bottom(tight.boundary!)).toBeCloseTo(5, 3);
    expect(held.blocks!.neck).toBe(tight.blocks!.neck);
    expect(held.blocks!.end).toBe(tight.blocks!.end);
  });

  it('trims the blocks back by a negative block margin and runs the boundary up to the trimmed faces', () => {
    const p = seeded();
    const whole = solved(p).solve;
    const trimmed = solved(p, s => s.blockMargin = -5).solve;
    const top = (d: string) => Math.max(...points(d).map(pt => pt.y));
    const bottom = (d: string) => Math.min(...points(d).map(pt => pt.y));
    // each block's face moves toward the ribs, its outer face staying put
    expect(bottom(trimmed.blocks!.neck) - bottom(whole.blocks!.neck)).toBeCloseTo(5, 3);
    expect(top(trimmed.blocks!.neck)).toBeCloseTo(top(whole.blocks!.neck), 3);
    expect(top(whole.blocks!.end) - top(trimmed.blocks!.end)).toBeCloseTo(5, 3);
    expect(bottom(trimmed.blocks!.end)).toBeCloseTo(bottom(whole.blocks!.end), 3);
    // and the boundary meets the new faces
    expect(top(trimmed.boundary!)).toBeCloseTo(bottom(trimmed.blocks!.neck), 3);
    expect(bottom(trimmed.boundary!)).toBeCloseTo(top(trimmed.blocks!.end), 3);
    expect(trimmed.failures).toEqual([]);
  });

  it('refuses a margin that trims a block away', () => {
    const s = solved(seeded(), g => g.blockMargin = -1000).solve;
    expect(s.blocks).toBeNull();
    expect(s.failures.map(f => f.unsolved)).toEqual([['blockMargin']]);
    // the loops still solve, uncut
    expect(s.lining).not.toBeNull();
    expect(s.boundary).not.toBeNull();
  });

  it('refuses an edge inset short of the linings', () => {
    const s = solved(seeded(), g => g.edgeInset = g.lining / 2).solve;
    expect(s.lining).not.toBeNull();
    expect(s.boundary).toBeNull();
    expect(s.failures.map(f => f.unsolved)).toEqual([['edgeInset']]);
  });

  it('refuses a lining of no thickness', () => {
    const s = solved(seeded(), g => g.lining = 0).solve;
    expect(s.lining).toBeNull();
    expect(s.failures.some(f => f.unsolved.includes('lining'))).toBe(true);
  });
});

describe('the graduation grid', () => {
  it('lays every point inside the boundary, on a lattice with a column on the joint', () => {
    const p = seeded();
    const { solve } = solved(p);
    const loop = points(solve.boundary!);
    for (const plate of ['top', 'back'] as const) {
      const spacing = 35, grid = gridPoints(p, spacing, plate);
      expect(grid.length).toBeGreaterThan(4);
      for (const pt of grid) {
        expect(pointInPolygon(new Pt(pt.x, pt.y), loop)).toBe(true);
        expect(Math.abs(pt.x / spacing - Math.round(pt.x / spacing))).toBeLessThan(1e-6);
      }
      expect(grid.some(pt => pt.x === 0)).toBe(true);
      const ys = [...new Set(grid.map(pt => pt.y))].sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(spacing, 1);
    }
  });

  it('reads top to bottom, bass to treble', () => {
    const grid = gridPoints(seeded(), SPACING, 'top');
    for (let i = 1; i < grid.length; i++) {
      const a = grid[i - 1], b = grid[i];
      expect(b.y < a.y || (b.y === a.y && b.x > a.x)).toBe(true);
    }
  });

  it('starts every point at its own plate\'s edge thickness', () => {
    const p = seeded();
    FlutingPanel.seed(p);
    LongArchingPanel.seed(p);
    p.arching!.top.thickness = 4.2;
    p.arching!.back.thickness = 4.7;
    const { settings } = solved(p);
    expect(settings.top.points.length).toBeGreaterThan(0);
    expect(settings.top.points.every(pt => pt.thickness === 4.2)).toBe(true);
    expect(settings.back.points.every(pt => pt.thickness === 4.7)).toBe(true);
  });

  it('fills in as the spacing closes', () => {
    const p = seeded();
    solved(p);
    const coarse = gridPoints(p, SPACING, 'top').length;
    expect(gridPoints(p, SPACING / 2, 'top').length).toBeGreaterThan(2 * coarse);
  });

  it('is empty while the boundary is unsolved', () => {
    const p = seeded();
    solved(p, s => s.edgeInset = s.lining / 2);
    expect(gridPoints(p, SPACING, 'top')).toEqual([]);
  });

  it('leaves the loops alone when a point is edited', () => {
    const p = seeded();
    const { settings, solve } = solved(p);
    settings.top.points[0].thickness += 1;
    settings.top.points[0].x += 3;
    expect(solveGraduation(p)).toBe(solve);
  });
});

describe('the plate map', () => {
  const holdsEveryPointOnce = (map: ReturnType<typeof plateMap>, count: number) => {
    const cells = map.rows.flatMap(row => row.cells).filter((i): i is number => i !== null);
    expect(cells.length).toBe(count);
    expect(new Set(cells).size).toBe(count);
  };

  it('sets a grid out as it lies: a row per station top to bottom, a column per line bass to treble', () => {
    const g = solved(seeded()).settings.top;
    const map = plateMap(g.points);
    holdsEveryPointOnce(map, g.points.length);
    expect(map.rows.every(row => row.cells.length === map.columns)).toBe(true);
    const rowY = map.rows.map(row => g.points[row.cells.find(i => i !== null)!].y);
    for (let r = 1; r < rowY.length; r++) expect(rowY[r]).toBeLessThan(rowY[r - 1]);
    for (const [r, row] of map.rows.entries()) for (const i of row.cells) if (i !== null) expect(g.points[i].y).toBe(rowY[r]);
    for (let c = 0; c < map.columns!; c++) {
      const xs = new Set(map.rows.map(row => row.cells[c]).filter((i): i is number => i !== null).map(i => g.points[i].x));
      expect(xs.size).toBe(1);
    }
    const columnX = (c: number) => g.points[map.rows.map(row => row.cells[c]).find(i => i !== null)!].x;
    for (let c = 1; c < map.columns!; c++) expect(columnX(c)).toBeGreaterThan(columnX(c - 1));
  });

  // how many cells a point sits from the one it was dealt
  const travel = (map: ReturnType<typeof plateMap>, pts: { x: number; y: number }[]) => map.rows.flatMap((row, r) => row.cells.flatMap((i, c) => {
    if (i === null) return [];
    const { left, top, dx, dy } = map.lattice!;
    return [Math.hypot((pts[i].x - (left + c * dx)) / dx, (pts[i].y - (top - r * dy)) / dy)];
  }));

  it('deals the zones onto a lattice centred on the joint, each a short way from where it lies', () => {
    const p = seeded();
    grad(p);
    const loop = points(solveGraduation(p)!.boundary!);
    const extent = { minX: Math.min(...loop.map(q => q.x)), maxX: Math.max(...loop.map(q => q.x)), minY: Math.min(...loop.map(q => q.y)), maxY: Math.max(...loop.map(q => q.y)) };
    const g = { points: zonePoints(p, 'back') };
    const map = plateMap(g.points, extent);
    holdsEveryPointOnce(map, g.points.length);
    expect(map.labelled).toBe(false);
    expect(map.columns % 2).toBe(1);
    expect(map.rows.every(row => row.cells.length === map.columns)).toBe(true);
    const { left, dx } = map.lattice!;
    expect(left + ((map.columns - 1) / 2) * dx).toBeCloseTo(0, 6);
    expect(Math.max(...travel(map, g.points))).toBeLessThan(2.5);
    expect(map.rows[0].cells.some(i => i !== null)).toBe(true);
    expect(map.rows[map.rows.length - 1].cells.some(i => i !== null)).toBe(true);
  });

  it('keeps a grid set out as it lies while its points stay near the lattice, and deals it once they stray', () => {
    const g = solved(seeded()).settings.top;
    expect(plateMap(g.points).labelled).toBe(true);
    const nudged = g.points.map((pt, i) => i === 3 ? { ...pt, x: pt.x + 7, y: pt.y - 4 } : pt);
    expect(plateMap(nudged).labelled).toBe(true);
    const strayed = g.points.map((pt, i) => ({ ...pt, x: pt.x + i, y: pt.y + (i % 3) }));
    const map = plateMap(strayed);
    expect(map.labelled).toBe(false);
    holdsEveryPointOnce(map, strayed.length);
  });

  it('deals loose points onto the lattice too, and has no rows without points', () => {
    const pts = [{ x: 0, y: 100 }, { x: 0, y: 101 }, { x: 40, y: 200 }, { x: -60, y: 50 }].map(q => ({ ...q, thickness: 3 }));
    const map = plateMap(pts, null);
    holdsEveryPointOnce(map, pts.length);
    expect(Math.max(...travel(map, pts))).toBeLessThan(2.5);
    expect(plateMap([]).rows).toEqual([]);
  });
});

describe('the thickness field', () => {
  const arched = (): ViolinFamilyParams => {
    const p = seeded();
    FlutingPanel.seed(p);
    LongArchingPanel.seed(p);
    return p;
  };
  const centre = (loop: Pt[]): Pt => {
    const ys = loop.map(q => q.y);
    return new Pt(0, (Math.min(...ys) + Math.max(...ys)) / 2);
  };

  it('is nothing until the boundary solves', () => {
    const p = arched();
    const s = grad(p);
    s.edgeInset = s.lining / 2;
    expect(thicknessField(p, 'back')).toBeNull();
  });

  it('reads every point\'s own thickness at the point, the boundary\'s own reading on the boundary, and the edge thickness off the plate', () => {
    const p = arched();
    const s = grad(p);
    s.back.points.forEach((pt, i) => pt.thickness = 2 + (i % 5) * 0.5);
    const f = thicknessField(p, 'back')!;
    for (const pt of s.back.points) expect(f.at(pt.x, pt.y)).toBeCloseTo(pt.thickness, 9);
    // the boundary is read at samples along it, and the spline runs between them
    for (const q of f.loop.filter((_, i) => i % 7 === 0)) expect(Math.abs(f.interpolated(q.x, q.y) - f.edgeAt(q.x, q.y))).toBeLessThan(0.2);
    expect(f.at(p.body.width, -10)).toBe(f.edge);
  });

  it('reads the boundary off the arching over the flat, not the edge thickness', () => {
    const p = arched();
    const s = grad(p);
    const surface = solveCrossArching(p)!.back!;
    const f = thicknessField(p, 'back')!;
    const readings = f.loop.map(q => f.edgeAt(q.x, q.y));
    // the boundary takes off inside the fluting, so somewhere the wood is thinner than the edge
    expect(Math.min(...readings)).toBeLessThan(f.edge - 0.1);
    for (const [i, q] of f.loop.entries()) {
      expect(readings[i]).toBeCloseTo(f.edge + surfaceZAt(surface, q.x, q.y)!, 6);
      expect(readings[i]).toBeGreaterThanOrEqual(f.edge - p.fluting!.back.depth - 1e-6);
      expect(readings[i]).toBeLessThanOrEqual(f.edge + p.arching!.back.long.height + 1e-6);
    }
    for (const q of f.loop.filter((_, i) => i % 20 === 0)) expect(f.edgeAt(-q.x, q.y)).toBeCloseTo(f.edgeAt(q.x, q.y), 2);
    // the land outside the boundary reads the same way, back to the edge thickness on the flat
    const q = f.loop[0];
    expect(f.at(q.x * 1.02, q.y)).toBeCloseTo(f.edge + surfaceZAt(surface, q.x * 1.02, q.y)!, 6);
  });

  it('never leaves the range of what was read', () => {
    const p = arched();
    const s = grad(p);
    s.back.points.forEach((pt, i) => pt.thickness = 2 + (i % 5) * 0.5);
    const f = thicknessField(p, 'back')!;
    const xs = f.loop.map(q => q.x), ys = f.loop.map(q => q.y);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 7) {
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 7) {
        const v = f.at(x, y);
        expect(v).toBeGreaterThanOrEqual(f.range.lo - 1e-9);
        expect(v).toBeLessThanOrEqual(f.range.hi + 1e-9);
      }
    }
  });

  it('runs from a lone point\'s thickness down to the boundary\'s reading without a bullseye', () => {
    const p = arched();
    const s = grad(p);
    s.back.points = [];
    const f0 = thicknessField(p, 'back')!;
    const c = centre(f0.loop);
    s.back.points = [{ x: c.x, y: c.y, thickness: 5 }];
    const f = thicknessField(p, 'back')!;
    expect(f.at(c.x, c.y)).toBeCloseTo(5, 9);
    // along the ray to the boundary the thickness falls the whole way, in small steps
    const q0 = f.loop[0];
    const len = Math.hypot(c.x - q0.x, c.y - q0.y);
    let previous = 5;
    for (let d = 2; d < len - 2; d += 2) {
      const v = f.at(c.x + (q0.x - c.x) * d / len, c.y + (q0.y - c.y) * d / len);
      expect(v).toBeLessThanOrEqual(previous + 1e-9);
      expect(previous - v).toBeLessThan(0.25);
      previous = v;
    }
    // and just inside the boundary it is nearly the boundary's own reading
    const x = q0.x + 2 * (c.x - q0.x) / len, y = q0.y + 2 * (c.y - q0.y) / len;
    expect(Math.abs(f.at(x, y) - f.edgeAt(x, y))).toBeLessThan(0.3);
  });

  it('mirrors across the joint for a mirrored set of readings', () => {
    const p = arched();
    const s = grad(p);
    s.back.points.forEach(pt => pt.thickness = 2 + Math.abs(pt.x) / 50 + pt.y / 400);
    const f = thicknessField(p, 'back')!;
    const ys = f.loop.map(q => q.y);
    for (let y = Math.min(...ys) + 5; y <= Math.max(...ys) - 5; y += 15) {
      // the boundary is a sampled loop, its chords not quite mirrored
      for (let x = 5; x <= 40; x += 10) expect(f.at(-x, y)).toBeCloseTo(f.at(x, y), 3);
    }
  });

  describe('round the f-holes', () => {
    const holed = (): ViolinFamilyParams => {
      const p = arched();
      FHolePlacementPanel.seed(p);
      FHoleContoursPanel.seed(p);
      return p;
    };
    const settled = (p: ViolinFamilyParams) => {
      const s = grad(p);
      // thicker than anything else on the plate, the boundary's arched readings included, so it
      // shows in the range
      s.fHoleThickness = edgeThicknessOf(p, 'top') + p.arching!.top.long.height + 1;
      s.top.points.forEach(pt => pt.thickness = edgeThicknessOf(p, 'top') - 1);
      return s;
    };
    const inside = (hole: Pt[]): Pt => {
      const xs = hole.map(q => q.x), ys = hole.map(q => q.y);
      return new Pt((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
    };

    it('solves both holes, mirrored', () => {
      const p = holed();
      const s = settled(p);
      const g = solveGraduation(p)!;
      expect(g.holes.length).toBe(2);
      const idx = buildPolylineIndex(g.holes[0]);
      for (const q of g.holes[1]) expect(distPointToPolylineIndexed(new Pt(-q.x, q.y), idx)).toBeLessThan(0.05);
    });

    it('reads the f-hole thickness on each outline and in the hole, and the edge thickness clear of it', () => {
      const p = holed();
      const s = settled(p);
      const f = thicknessField(p, 'top')!;
      const g = solveGraduation(p)!;
      // the outline is read at samples along it, and the spline runs between them: it strays by a
      // small share of how far the f-hole thickness stands off the points' thickness
      const contrast = s.fHoleThickness - s.top.points[0].thickness;
      for (const hole of g.holes) {
        for (const q of hole.filter((_, i) => i % 25 === 0)) expect(Math.abs(f.at(q.x, q.y) - s.fHoleThickness)).toBeLessThan(0.03 * contrast);
        const c = inside(hole);
        // the stem is narrow; a point in it may miss the wood, so check the bounding box's centre only if it is in the hole
        if (pointInPolygon(c, hole)) expect(f.at(c.x, c.y)).toBe(s.fHoleThickness);
      }
      expect(f.range.hi).toBeCloseTo(s.fHoleThickness, 9);
      // the field is continuous: just off the outline it is still nearly the f-hole thickness
      const q = g.holes[0][0];
      const idx = buildPolylineIndex(g.holes[0]);
      const near = [new Pt(q.x + 0.3, q.y), new Pt(q.x - 0.3, q.y), new Pt(q.x, q.y + 0.3), new Pt(q.x, q.y - 0.3)]
        .filter(pt => !pointInPolygon(pt, g.holes[0]) && distPointToPolylineIndexed(pt, idx) > 0.1);
      for (const pt of near) expect(Math.abs(f.at(pt.x, pt.y) - s.fHoleThickness)).toBeLessThan(0.5);
    });

    it('mirrors across the joint', () => {
      const p = holed();
      const s = settled(p);
      const f = thicknessField(p, 'top')!;
      const g = solveGraduation(p)!;
      const xs = g.holes[0].map(q => q.x), ys = g.holes[0].map(q => q.y);
      // the boundary's sampled chords are mirrored only to a hair, and the holes' contrast magnifies that
      const contrast = s.fHoleThickness - s.top.points[0].thickness;
      for (let y = Math.min(...ys) - 10; y <= Math.max(...ys) + 10; y += 8) {
        for (let x = Math.min(...xs) - 10; x <= Math.max(...xs) + 10; x += 6) expect(Math.abs(f.at(-x, y) - f.at(x, y))).toBeLessThan(0.001 * contrast);
      }
    });

    it('lays no grid point in a hole or hard beside one, where there is no wood to read', () => {
      const p = holed();
      const s = settled(p);
      const g = solveGraduation(p)!;
      expect(s.top.points.length).toBeGreaterThan(4);
      for (const pt of s.top.points) {
        for (const hole of g.holes) {
          expect(pointInPolygon(new Pt(pt.x, pt.y), hole)).toBe(false);
          expect(distPointToPolylineIndexed(new Pt(pt.x, pt.y), buildPolylineIndex(hole))).toBeGreaterThan(5);
        }
      }
    });

    it('leaves the holes off the back altogether', () => {
      const p = holed();
      const s = settled(p);
      const back = thicknessField(p, 'back')!;
      expect(back.range.hi).toBeLessThan(s.fHoleThickness);
    });

    it('leaves the holes blank on the map while the field still answers in them', () => {
      const p = holed();
      const s = settled(p);
      const g = solveGraduation(p)!;
      const f = thicknessField(p, 'top')!;
      const bands = thicknessBands(p, 'top');
      expect(bands.length).toBeGreaterThan(1);
      for (const hole of g.holes) {
        const c = inside(hole);
        if (!pointInPolygon(c, hole)) continue;
        expect(f.at(c.x, c.y)).toBe(s.fHoleThickness);
        // the lowest band is the whole ground; a point in a hole is in no ring of it
        for (const { polygons } of bands) {
          for (const poly of polygons) {
            const inOuter = pointInPolygon(c, poly[0]);
            const inAHole = poly.slice(1).some(h => pointInPolygon(c, h));
            expect(inOuter && !inAHole).toBe(false);
          }
        }
      }
    });

    it('has no holes before the contours are drafted', () => {
      const p = arched();
      const s = settled(p);
      const g = solveGraduation(p)!;
      expect(g.holes).toEqual([]);
      expect(thicknessField(p, 'top')!.range.hi).toBeLessThan(s.fHoleThickness);
    });
  });

  it('maps the field in bands cut to the boundary, thin to thick', () => {
    const p = arched();
    const s = grad(p);
    s.back.points.forEach((pt, i) => pt.thickness = 2 + (i % 5) * 0.5);
    const f = thicknessField(p, 'back')!;
    const bands = thicknessBands(p, 'back');
    expect(bands.length).toBeGreaterThan(3);
    const idx = buildPolylineIndex(f.loop);
    for (let i = 1; i < bands.length; i++) expect(bands[i].level).toBeGreaterThan(bands[i - 1].level);
    for (const { polygons } of bands) {
      for (const poly of polygons) for (const ring of poly) for (const q of ring) {
        expect(pointInPolygon(q, f.loop) || distPointToPolylineIndexed(q, idx) < 0.5).toBe(true);
      }
    }
    // the lowest band is the whole ground; a band's level is met somewhere inside it
    const area = (ring: Pt[]) => Math.abs(ring.reduce((a, q, i) => a + q.x * ring[(i + 1) % ring.length].y - ring[(i + 1) % ring.length].x * q.y, 0)) / 2;
    const outer = (b: { polygons: Pt[][][] }) => b.polygons.reduce((a, poly) => a + area(poly[0]), 0);
    for (let i = 1; i < bands.length; i++) expect(outer(bands[i])).toBeLessThanOrEqual(outer(bands[i - 1]) + 1e-6);
  });
});

describe('the zones layout', () => {
  const zoned = (p = seeded()) => {
    grad(p);
    return { points: zonePoints(p, 'back'), loop: points(solveGraduation(p)!.boundary!) };
  };

  it('lays thirteen named zones inside the boundary, the sides mirrored', () => {
    const { points: pts, loop } = zoned();
    expect(pts.length).toBe(13);
    expect(new Set(pts.map(pt => pt.label)).size).toBe(13);
    for (const pt of pts) {
      expect(pointInPolygon(new Pt(pt.x, pt.y), loop)).toBe(true);
      expect(pts.some(q => q.x === -pt.x && q.y === pt.y)).toBe(true);
    }
    expect(pts.filter(pt => pt.x === 0).map(pt => pt.label)).toEqual(['Lower dome', 'Island lower', 'Island', 'Island upper', 'Upper dome']);
  });

  it('runs the channels along the edge, the flanks between the dome and the island, the island at the waist', () => {
    const { points: pts, loop } = zoned();
    const by = (label: string) => pts.find(pt => pt.label === label)!;
    const idx = buildPolylineIndex(loop);
    for (const bout of ['Lower', 'Upper']) {
      const channel = by(`${bout} channel treble`), dome = by(`${bout} dome`), flank = by(`${bout} flank treble`);
      expect(channel.y).toBe(dome.y);
      expect(distPointToPolylineIndexed(new Pt(channel.x, channel.y), idx)).toBeLessThan(dist(channel, dome));
      // the flank sits between the dome and the island along the body, and out from the joint
      const island = by('Island');
      expect((flank.y - dome.y) * (island.y - flank.y)).toBeGreaterThan(0);
      expect(flank.x).toBeGreaterThan(0);
      expect(flank.x).toBeLessThan(channel.x);
    }
    expect(by('Island').y).toBeLessThan(by('Upper flank bass').y);
    expect(by('Island').y).toBeGreaterThan(by('Lower flank bass').y);
    // the island's middle is midway between the corner rows, its ends on them
    const p = seeded();
    expect(by('Island').y).toBeCloseTo((Math.round(p.corners!.LCr.y) + Math.round(p.corners!.UCr.y)) / 2, 0);
    expect(by('Island upper').y).toBe(Math.round(p.corners!.UCr.y));
    expect(by('Island lower').y).toBe(Math.round(p.corners!.LCr.y));
  });

  it('reads from the lower bout up', () => {
    const { points: pts } = zoned();
    for (let i = 1; i < pts.length; i++) expect(pts[i].y >= pts[i - 1].y).toBe(true);
  });

  it('is empty until the boundary solves', () => {
    const p = seeded();
    const settings = grad(p);
    settings.edgeInset = settings.lining / 2;
    expect(zonePoints(p, 'back')).toEqual([]);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dist, pointInPolygon } from '../../../../helpers/math/simpleGeometry';
import { samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed } from '../../../../helpers/math/vibeMath';
import { Pt } from '../../../../models/types';
import { defaultGraduation, GraduationSettings, solveGraduation } from './dev-graduation-panel';
import { purflingPath, ribArcs, OuterContourPanel } from '../outer-contour-panel/outer-contour-panel';
import { CornersPanel, solveCorners } from '../corners-panel/corners-panel';
import { MainBoutsPanel, solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const seeded = (p = blank()): ViolinFamilyParams => {
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  OuterContourPanel.seed(p);
  return p;
};
const solved = (p: ViolinFamilyParams, change: (s: GraduationSettings) => void = () => {}) => {
  const s = defaultGraduation(p);
  change(s);
  return { settings: s, solve: solveGraduation(p, s)! };
};

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
    const snapshot = JSON.stringify(p);
    solved(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('is null until the plate edge is seeded', () => {
    const p = blank();
    MainBoutsPanel.seed(p);
    CornersPanel.seed(p);
    expect(solveGraduation(p, defaultGraduation(p))).toBeNull();
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

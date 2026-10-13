// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dist, pointInPolygon, pointOnCircle, signedRadianDelta, TURN } from '../../../../helpers/math/simpleGeometry';
import { samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed } from '../../../../helpers/math/vibeMath';
import { Arc, Pt } from '../../../../models/types';
import { OuterContourPanel, solveOuterContour } from './outer-contour-panel';
import { CornersPanel, solveCorners } from '../corners-panel/corners-panel';
import { cornerTurn, solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { DEFAULT_VIOLIN_FAMILY_PARAMS, ViolinFamilyParams } from '../../violin-family-types';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const withCenterBout = (): ViolinFamilyParams => {
  const p = blank();
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  return p;
};

const seeded = (): ViolinFamilyParams => {
  const p = withCenterBout();
  OuterContourPanel.seed(p);
  return p;
};

const points = (d: string): Pt[] => samplePathToPolyline(d, 0.25, true);
const subpaths = (d: string): number => (d.match(/M/g) ?? []).length;
const closed = (d: string): boolean => {
  const q = points(d);
  return dist(q[0], q[q.length - 1]) < 1e-6;
};
const top = (q: Pt[]) => Math.max(...q.map(pt => pt.y));
const span = (arc: Arc) => Math.abs(signedRadianDelta(arc.end - arc.start));
const offTheLine = (q: Pt[], line: Pt[]) => {
  const idx = buildPolylineIndex(line);
  return Math.max(...q.map(pt => distPointToPolylineIndexed(pt, idx)));
};

describe('the outer contour solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveOuterContour(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('has no plates until the stage is seeded', () => {
    expect(solveOuterContour(blank())).toBeNull();
    expect(solveOuterContour(withCenterBout())).toBeNull();
  });

  it('seeds nothing until the C bout has solved, and once only', () => {
    const q = withCenterBout();
    q.bouts!.C0R = 5;
    q.bouts!.useKellyC0 = true;
    OuterContourPanel.seed(q);
    expect(q.outerContour).toBeUndefined();

    const p = seeded();
    p.outerContour!.U3Cutoff += 3;
    const edited = JSON.stringify(p);
    OuterContourPanel.seed(p);
    expect(JSON.stringify(p)).toBe(edited);
  });

  it('seeds every cutoff running the corner on, never back, and the compound ones to the same run along the edge', () => {
    const p = seeded();
    const o = p.outerContour!;
    const inset = p.body.overhang + p.body.rib;
    const k = p.corners!;
    for (const key of ['U3Cutoff', 'C2Cutoff', 'C1Cutoff', 'L3Cutoff'] as const) expect(o[key]).toBeGreaterThan(0);
    expect(o.U31Cutoff * (k.U31R - inset)).toBeCloseTo(o.U3Cutoff * (k.U3R - inset), 9);
    expect(o.L31Cutoff * (k.L31R - inset)).toBeCloseTo(o.L3Cutoff * (k.L3R - inset), 9);
  });
});

describe('the plates', () => {
  const p = seeded();
  const o = p.outerContour!;
  const s = solveOuterContour(p)!;
  const inset = p.body.overhang + p.body.rib;
  const edge = points(s.top!);

  it('close each into one loop', () => {
    expect(s.failures).toEqual([]);
    for (const d of [s.top!, s.back!]) {
      expect(subpaths(d)).toBe(1);
      expect(closed(d)).toBe(true);
    }
  });

  it('stand the inset off the rib outline: the top plate fills the body box', () => {
    expect(Math.max(...edge.map(q => q.x))).toBeCloseTo(p.body.width / 2, 3);
    expect(Math.min(...edge.map(q => q.x))).toBeCloseTo(-p.body.width / 2, 3);
    expect(top(edge)).toBeCloseTo(p.body.height, 3);
    expect(Math.min(...edge.map(q => q.y))).toBeCloseTo(0, 3);
  });

  // the path's own vertices rather than samples along it: the cutoff leaves a sharp kink where the
  // flat meets the corner arc, and equal-step samples cut that kink differently from each side
  it('are symmetric about the centreline', () => {
    const vertices = (d: string): Pt[] => (d.match(/[MLAC][^MLAC]*/g) ?? []).map(cmd => {
      const n = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
      return { x: n[n.length - 2], y: n[n.length - 1] };
    });
    // to a micron: the two sides' handovers between tangent arcs are found to the square root of
    // the rounding
    const v = vertices(s.top!);
    for (const q of v) {
      const mirrored = { x: -q.x, y: q.y };
      expect(Math.min(...v.map(w => dist(w, mirrored)))).toBeLessThan(1e-5);
    }
  });

  it('run each corner arc on past the rib corner by its cutoff, along the arc\'s own travel', () => {
    const c = solveCorners(p)!;
    const cb = solveCenterBout(p)!;
    for (const [outer, inner, cutoff] of [[s.corners.U3, c.U3, o.U3Cutoff], [s.corners.C2, cb.C2, o.C2Cutoff], [s.corners.C1, cb.C1, o.C1Cutoff], [s.corners.L3, c.L3, o.L3Cutoff]] as const) {
      const dir = Math.sign(signedRadianDelta(inner!.end - inner!.start));
      expect(dir * signedRadianDelta(outer!.end - inner!.end) / TURN.degree).toBeCloseTo(cutoff, 9);
      expect(span(outer!)).toBeGreaterThan(span(inner!));
      expect(Math.abs(outer!.r - inner!.r)).toBeCloseTo(inset, 9);
    }
  });

  it('cut each corner across a flat between its two arcs, with a curve instead once rounded', () => {
    expect(s.top).toMatch(/ L /);
    expect(s.top).not.toMatch(/ C /);
    const q = seeded();
    q.outerContour!.upperRounding = 0.3;
    const rounded = solveOuterContour(q)!;
    expect(rounded.top).toMatch(/ C /);
    expect(subpaths(rounded.top!)).toBe(1);
  });

  it('move the corner tip out when a cutoff grows', () => {
    const q = seeded();
    q.outerContour!.U3Cutoff += 20;
    const longer = solveOuterContour(q)!;
    const tip = (arc: Arc) => pointOnCircle(arc, arc.end);
    expect(dist(tip(longer.corners.U3!), q.corners!.UCr)).toBeGreaterThan(dist(tip(s.corners.U3!), p.corners!.UCr));
    expect(subpaths(longer.top!)).toBe(1);
  });

  it('close with a viol corner at either end, which has no cutoff to type', () => {
    const q = seeded();
    q.corners!.useViolCornerUC = true;
    q.corners!.useViolCornerLC = true;
    (q.outerContour as any).U3Cutoff = null;
    const viol = solveOuterContour(q)!;
    expect(viol.failures).toEqual([]);
    expect(viol.corners).toEqual({});
    for (const d of [viol.top!, viol.back!, viol.purfling!]) {
      expect(subpaths(d)).toBe(1);
      expect(closed(d)).toBe(true);
    }
  });

  it('close with every corner compound', () => {
    const q = seeded();
    for (const key of ['U31DoubleArc', 'C21DoubleArc', 'C11DoubleArc', 'L31DoubleArc'] as const) q.corners![key] = true;
    const compound = solveOuterContour(q)!;
    expect(compound.failures).toEqual([]);
    for (const key of ['U31', 'C21', 'C11', 'L31'] as const) expect(compound.corners[key]).toBeDefined();
    for (const d of [compound.top!, compound.back!, compound.purfling!]) expect(subpaths(d)).toBe(1);
  });
});

describe('the back and its button', () => {
  it('stands the button its height beyond the plate, whether it has walls or is only a segment', () => {
    const p = seeded();
    for (const height of [0.5, 2, 6, 10, 14, 20]) {
      p.outerContour!.button.height = height;
      const s = solveOuterContour(p)!;
      expect(subpaths(s.back!), `one loop at height ${height}`).toBe(1);
      expect(top(points(s.back!)), `tip at height ${height}`).toBeCloseTo(p.body.height + height, 1);
      expect(top(points(s.top!)), `the top plate has no button`).toBeCloseTo(p.body.height, 1);
      expect(s.button).not.toBeNull();
    }
  });

  it('drops straight walls from the cap only while the height clears the cap radius', () => {
    const p = seeded();
    const onWall = (q: Pt[]) => q.filter(pt => Math.abs(pt.x - 10) < 1e-6 && pt.y > p.body.height - 3);
    p.outerContour!.button = { width: 20, height: 14 };
    expect(onWall(points(solveOuterContour(p)!.back!)).length).toBeGreaterThan(8);
    p.outerContour!.button = { width: 20, height: 6 };
    expect(onWall(points(solveOuterContour(p)!.back!)).length).toBeLessThanOrEqual(1);
  });

  it('draws no button at zero height', () => {
    const p = seeded();
    p.outerContour!.button.height = 0;
    const s = solveOuterContour(p)!;
    expect(s.button).toBeNull();
    expect(subpaths(s.back!)).toBe(1);
    expect(top(points(s.back!))).toBeCloseTo(p.body.height, 1);
  });
});

describe('the purfling', () => {
  const p = seeded();
  const o = p.outerContour!;
  const s = solveOuterContour(p)!;
  const edge = points(s.top!);

  it('runs as one closed loop inside the plate, and a second a channel\'s width outside it', () => {
    for (const d of [s.purfling!, s.outerPurfling!]) {
      expect(subpaths(d)).toBe(1);
      expect(closed(d)).toBe(true);
      for (const q of points(d)) expect(pointInPolygon(q, edge)).toBe(true);
    }
    // along the lower bout, where nothing is cut across, the lines sit their offsets in from the edge
    const low = (d: string) => points(d).filter(q => Math.abs(q.x) < p.body.width / 4 && q.y < p.body.height / 4);
    const idx = buildPolylineIndex(edge);
    for (const q of low(s.purfling!)) expect(distPointToPolylineIndexed(q, idx)).toBeCloseTo(o.purflingOffset, 2);
    for (const q of low(s.outerPurfling!)) expect(distPointToPolylineIndexed(q, idx)).toBeCloseTo(o.purflingOffset - o.purflingChannelDepth, 2);
  });

  // a corner arc that sits outside C0 (the tip out past C0's circle) shrinks as the purfling moves
  // in, and is gone once the offset reaches its radius; one that sits inside C0 grows instead, and
  // the seed's corners both do, so no offset can lose them
  it('fails, leaving the plates drawn, once the offset has eaten a corner arc', () => {
    const q = seeded();
    q.bouts!.C0R = 30;
    expect(solveOuterContour(q)!.failures).toEqual([]);
    expect(cornerTurn(solveCenterBout(q)!.C2, solveCenterBout(q)!.C0)).toBe(1);
    q.outerContour!.purflingOffset = q.corners!.C2R + q.body.overhang + q.body.rib + 1;
    const far = solveOuterContour(q)!;
    expect(far.failures.map(f => f.unsolved)).toEqual([['purfling']]);
    expect(far.failures[0].message).toContain('Purfling');
    expect(far.purfling).toBeNull();
    expect(far.top).not.toBeNull();
  });
});

describe('what cannot be drawn', () => {
  it('fails the plates while a cutoff is cleared, keeps the purfling, and draws no NaN', () => {
    const p = seeded();
    (p.outerContour as any).C2Cutoff = null;
    const s = solveOuterContour(p)!;
    expect(s.failures.map(f => f.unsolved)).toEqual([['top', 'back']]);
    expect(s.failures[0].message).toContain('needs a value');
    expect(s.top).toBeNull();
    expect(s.purfling).not.toBeNull();
    expect(s.purfling).not.toMatch(/NaN/);
  });

  it('asks only for the cutoffs the corners use', () => {
    const p = seeded();
    (p.outerContour as any).U31Cutoff = null;
    expect(solveOuterContour(p)!.failures).toEqual([]);
    p.corners!.U31DoubleArc = true;
    expect(solveOuterContour(p)!.failures.map(f => f.unsolved)).toEqual([['top', 'back']]);
  });

  it('fails everything, once, while an arc of the rib outline has not solved', () => {
    const p = seeded();
    p.corners!.U3R = 1;
    const s = solveOuterContour(p)!;
    expect(s.failures).toHaveLength(1);
    expect(s.failures[0].message).toContain('rib outline');
    expect(s.top).toBeNull();
    expect(s.purfling).toBeNull();
  });
});

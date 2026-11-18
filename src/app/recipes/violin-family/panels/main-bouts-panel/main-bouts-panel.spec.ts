// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dist, normalizeRadians, pointOnCircle, signedArcSweep, travelAtArcStart, TURN } from '../../../../helpers/math/simpleGeometry';
import { MainBoutsPanel, calcMainBoutsRatios, solveMainBouts, calcViolNeckJoinLimit } from './main-bouts-panel';
import { calcBodyRatios } from '../base-measurements-panel/base-measurements-panel';
import { Arc } from '../../../../models/types';
import { ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS, SEED_RATIOS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const seeded = (): ViolinFamilyParams => {
  const p = blank();
  MainBoutsPanel.seed(p);
  return p;
};

const withViol = (): ViolinFamilyParams => {
  const p = seeded();
  p.bouts!.useViolNeck = true;
  MainBoutsPanel.seed(p);
  return p;
};

describe('the main bouts solve', () => {
  it('reads the lower bout width off the body, so the two panels share one number', () => {
    const p = seeded();
    p.body.width += 20;
    const m = solveMainBouts(p)!;
    expect(m.L1!.x + m.L1!.r).toBeCloseTo(p.body.width / 2 - (p.body.overhang + p.body.rib), 9);
  });

  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveMainBouts(p);
    calcMainBoutsRatios(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('has no main bouts until the stage is seeded', () => {
    expect(solveMainBouts(blank())).toBeNull();
  });
});

describe('main bouts', () => {
  const p = seeded();
  const b = p.bouts!;
  const inset = p.body.overhang + p.body.rib;
  const m = solveMainBouts(p)!;

  it('solves both bouts from the seed', () => {
    expect(m.failures).toEqual([]);
    for (const arc of [m.U0, m.U1, m.L0, m.L1]) expect(arc).not.toBeNull();
  });

  it('sits the bouts on the rib box: L0 on its foot, U0 under its head', () => {
    expect(m.L0!.y - m.L0!.r).toBeCloseTo(inset, 9);
    expect(m.U0!.y + m.U0!.r).toBeCloseTo(p.body.height - inset, 9);
  });

  it('turns each small arc out to its bout width line, less the inset', () => {
    expect(m.L1!.x + m.L1!.r).toBeCloseTo(p.body.width / 2 - inset, 9);
    expect(m.U1!.x + m.U1!.r).toBeCloseTo(b.UBW / 2 - inset, 9);
  });

  it('sets each small arc inside its big one, tangent', () => {
    expect(dist(m.L0!, m.L1!)).toBeCloseTo(m.L0!.r - m.L1!.r, 6);
    expect(dist(m.U0!, m.U1!)).toBeCloseTo(m.U0!.r - m.U1!.r, 6);
  });

  it('runs each big arc into its small one without a gap', () => {
    expect(dist(pointOnCircle(m.L0!, m.L0!.end), pointOnCircle(m.L1!, m.L1!.start))).toBeCloseTo(0, 6);
    expect(dist(pointOnCircle(m.U0!, m.U0!.end), pointOnCircle(m.U1!, m.U1!.start))).toBeCloseTo(0, 6);
  });

  it('starts the big arcs on the centreline, square across the joint', () => {
    expect(m.L0!.x).toBeCloseTo(0, 9);
    expect(m.U0!.x).toBeCloseTo(0, 9);
    expect(m.L0!.start).toBeCloseTo(3 * TURN.quarter, 9);
    expect(m.U0!.start).toBeCloseTo(TURN.quarter, 9);
  });
});

describe('a join off the widest point', () => {
  // the furthest out an arc gets: its level point where it sweeps through it, else an end
  const reach = (arc: Arc) => Math.min(arc.start, arc.end) <= 0 && Math.max(arc.start, arc.end) >= 0
    ? arc.x + arc.r
    : Math.max(pointOnCircle(arc, arc.start).x, pointOnCircle(arc, arc.end).x);
  const heights = [-12, -6, -1, 0, 1, 6, 12];
  const drafts = heights.flatMap(h => [seeded, withViol].map(make => {
    const p = make();
    p.bouts!.UJoinY = h;
    p.bouts!.LJoinY = h;
    return { h, p, m: solveMainBouts(p)! };
  }));

  it('keeps each bout at its typed width wherever the join sits', () => {
    for (const { p, m } of drafts) {
      const inset = p.body.overhang + p.body.rib;
      expect(m.failures).toEqual([]);
      expect(Math.max(reach(m.L1!), reach(m.L2!))).toBeCloseTo(p.body.width / 2 - inset, 9);
      expect(Math.max(reach(m.U1!), reach(m.U2!))).toBeCloseTo(p.bouts!.UBW / 2 - inset, 9);
    }
  });

  it('puts the join that far above the widest point', () => {
    for (const { h, m } of drafts) {
      const lowerWidest = h >= 0 ? m.L1!.y : m.L2!.y;
      const upperWidest = h <= 0 ? m.U1!.y : m.U2!.y;
      expect(pointOnCircle(m.L1!, m.L1!.end).y - lowerWidest).toBeCloseTo(h, 9);
      expect(pointOnCircle(m.U1!, m.U1!.end).y - upperWidest).toBeCloseTo(h, 9);
    }
  });

  it('keeps all three arcs of a bout tangent and unbroken', () => {
    for (const { m } of drafts) {
      for (const [big, small, join] of [[m.L0!, m.L1!, m.L2!], [m.U0!, m.U1!, m.U2!]]) {
        expect(dist(big, small)).toBeCloseTo(big.r - small.r, 6);
        expect(dist(small, join)).toBeCloseTo(Math.abs(join.r - small.r), 9);
        expect(dist(pointOnCircle(big, big.end), pointOnCircle(small, small.start))).toBeCloseTo(0, 6);
        expect(dist(pointOnCircle(small, small.end), pointOnCircle(join, join.start))).toBeCloseTo(0, 9);
      }
    }
  });

  it('refuses a join further off than the arc it rides can reach', () => {
    const p = seeded();
    p.bouts!.LJoinY = p.bouts!.L1R + 1;
    const m = solveMainBouts(p)!;
    expect(m.failures.map(f => f.unsolved)).toEqual([['L0', 'L1', 'L2']]);
    expect(m.U2).not.toBeNull();
  });
});

describe('a main bout that cannot reach its width', () => {
  const innerHalf = (p: ViolinFamilyParams, width: number) => (width - 2 * (p.body.overhang + p.body.rib)) / 2;

  it('names the lower bout and the radius it needs, and leaves the upper bout solved', () => {
    const p = seeded();
    p.bouts!.L0R = innerHalf(p, p.body.width) - 10;
    const m = solveMainBouts(p)!;

    expect(m.failures).toHaveLength(1);
    expect(m.failures[0].unsolved).toEqual(['L0', 'L1']);
    expect(m.failures[0].message).toContain(`at least ${innerHalf(p, p.body.width).toFixed(1)}mm`);
    expect(m.failures[0].segments[0][0].x).toBeCloseTo(innerHalf(p, p.body.width), 9);
    expect(m.L0).toBeNull();
    expect(m.U1).not.toBeNull();
  });

  it('names the upper bout the same way', () => {
    const p = seeded();
    p.bouts!.U0R = innerHalf(p, p.bouts!.UBW) - 5;
    const m = solveMainBouts(p)!;

    expect(m.failures.map(f => f.unsolved)).toEqual([['U0', 'U1']]);
    expect(m.failures[0].message).toContain("U0 can't reach the upper bout width");
  });

  it('fails only its own bout while one of its fields is cleared, and draws no NaN', () => {
    const p = seeded();
    (p.bouts as any).L1R = null;
    const m = solveMainBouts(p)!;

    expect(m.failures.map(f => f.unsolved)).toEqual([['L0', 'L1', 'L2']]);
    expect(m.L0).toBeNull();
    expect(m.L1).toBeNull();
    for (const arc of [m.U0!, m.U1!]) for (const v of [arc.x, arc.y, arc.r, arc.start, arc.end]) expect(Number.isFinite(v)).toBe(true);
  });

  it('says the small arc has to be the smaller one when it has caught up', () => {
    const p = seeded();
    p.bouts!.L1R = p.bouts!.L0R;
    expect(solveMainBouts(p)!.failures[0].message).toContain('L1 has to be smaller than L0');
  });
});

describe('seeding', () => {
  it('drafts the bouts once and leaves them alone after', () => {
    const p = seeded();
    p.bouts!.L0R += 3;
    const edited = JSON.stringify(p);
    MainBoutsPanel.seed(p);
    expect(JSON.stringify(p)).toBe(edited);
  });

  it('seeds the viol neck the first time it is turned on, and keeps it when turned off', () => {
    const p = seeded();
    MainBoutsPanel.seed(p);
    expect(p.bouts!.viol).toBeNull();
    p.bouts!.useViolNeck = true;
    MainBoutsPanel.seed(p);
    const viol = p.bouts!.viol!;
    expect(viol.V0Sweep).toBeGreaterThan(0);
    p.bouts!.useViolNeck = false;
    MainBoutsPanel.seed(p);
    expect(p.bouts!.viol).toBe(viol);
  });
});

describe('the viol neck', () => {
  const p = withViol();
  const inset = p.body.overhang + p.body.rib;
  const m = solveMainBouts(p)!;

  it('hands V0 over to U0 at a shared point, along a shared tangent', () => {
    const handover = pointOnCircle(m.V0!, m.V0!.end);
    expect(dist(handover, pointOnCircle(m.U0!, m.U0!.start))).toBeCloseTo(0, 6);
    expect(m.U0!.start).toBeCloseTo(m.V0!.end - TURN.half, 9);
  });

  it('turns down from the level top face through the join turn, then sweeps V0 on through its own', () => {
    const v = p.bouts!.viol!;
    expect(normalizeRadians(-travelAtArcStart(m.V0!)) / TURN.degree).toBeCloseTo(v.joinTurn, 9);
    expect(signedArcSweep(m.V0!) / TURN.degree).toBeCloseTo(v.V0Sweep, 9);
    const q = withViol();
    q.bouts!.viol!.neckRadius = 4;
    const fillet = solveMainBouts(q)!.violCap!.fillet!;
    expect(normalizeRadians(fillet.end - fillet.start) / TURN.degree).toBeCloseTo(v.joinTurn, 9);
  });

  it('closes the neck under the rib box\'s head, with or without a join radius', () => {
    for (const neckRadius of [0, 4]) {
      const q = withViol();
      q.bouts!.viol!.neckRadius = neckRadius;
      const cap = solveMainBouts(q)!.violCap!;
      expect(cap.topY).toBeCloseTo(q.body.height - inset, 9);
    }
  });

  it('reads the join limit\'s reach off the solved V0, not just the closed form', () => {
    for (const [width, neckRadius] of [[16, 0], [30, 6], [52, 0]] as const) {
      const q = withViol();
      q.bouts!.viol!.width = width;
      q.bouts!.viol!.neckRadius = neckRadius;
      const V0 = solveMainBouts(q)!.V0!;
      expect(calcViolNeckJoinLimit(q)!.reach).toBeCloseTo(pointOnCircle(V0, V0.end).x, 9);
    }
  });

  it('has no limit to report with the neck off', () => {
    const q = withViol();
    q.bouts!.useViolNeck = false;
    expect(calcViolNeckJoinLimit(q)).toBeNull();
    expect(solveMainBouts(q)!.V0).toBeNull();
  });
});

describe('ratios', () => {
  it('reads nothing before the bouts are drafted', () => {
    expect(calcMainBoutsRatios(blank())).toEqual({});
  });

  // the seed rounds UBW to the millimetre and each radius to a tenth, so a fresh draft reads back
  // its seed fractions to within that rounding and no further
  it('reads a fresh draft back at its seed fractions', () => {
    const p = seeded();
    const r = calcMainBoutsRatios(p);
    const inset = p.body.overhang + p.body.rib;
    const UBWI = p.bouts!.UBW - 2 * inset;
    const LBWI = p.body.width - 2 * inset;

    expect(Math.abs(r.UBtoLB! - SEED_RATIOS.UBtoLB)).toBeLessThanOrEqual(0.5 / p.body.width);
    expect(Math.abs(r.U0toUBW! - SEED_RATIOS.U0toUBW)).toBeLessThanOrEqual(0.05 / UBWI + 1e-12);
    expect(Math.abs(r.U1toUBW! - SEED_RATIOS.U1toUBW)).toBeLessThanOrEqual(0.05 / UBWI + 1e-12);
    expect(Math.abs(r.L0toLBW! - SEED_RATIOS.L0toLBW)).toBeLessThanOrEqual(0.05 / LBWI + 1e-12);
    expect(Math.abs(r.L1toLBW! - SEED_RATIOS.L1toLBW)).toBeLessThanOrEqual(0.05 / LBWI + 1e-12);
    expect(Math.abs(r.U2toUBW! - SEED_RATIOS.U2toUBW)).toBeLessThanOrEqual(0.5 / UBWI + 1e-12);
    expect(Math.abs(r.L2toLBW! - SEED_RATIOS.L2toLBW)).toBeLessThanOrEqual(0.5 / LBWI + 1e-12);
  });

  it('follows an edit, with nothing to refresh', () => {
    const p = seeded();
    const before = calcMainBoutsRatios(p).L0toLBW!;
    p.bouts!.L0R *= 1.1;
    expect(calcMainBoutsRatios(p).L0toLBW).toBeCloseTo(before * 1.1, 9);
  });

  it('agrees with the geometry it describes', () => {
    const p = seeded();
    const r = calcMainBoutsRatios(p);
    const m = solveMainBouts(p)!;
    const inset = p.body.overhang + p.body.rib;
    expect(r.LBtoH).toBeCloseTo(p.body.width / p.body.height, 12);
    expect(r.U0toUBW).toBeCloseTo(m.U0!.r / (p.bouts!.UBW - 2 * inset), 12);
    expect(r.L1toLBW).toBeCloseTo(m.L1!.r / (p.body.width - 2 * inset), 12);
  });

  it('reports only ratios that have a seed fraction', () => {
    const keys = Object.keys({ ...calcBodyRatios(seeded()), ...calcMainBoutsRatios(seeded()) });
    for (const key of keys) expect(key in SEED_RATIOS, key).toBe(true);
  });
});

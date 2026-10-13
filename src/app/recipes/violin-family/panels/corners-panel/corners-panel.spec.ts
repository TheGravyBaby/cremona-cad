// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dist, pointOnCircle } from '../../../../helpers/math/simpleGeometry';
import { Arc } from '../../../../models/types';
import { CornersPanel, defaultCornerTips, solveCorners, solveCornersRatios } from './corners-panel';
import { MainBoutsPanel, solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { DEFAULT_VIOLIN_FAMILY_PARAMS, SEED_RATIOS, ViolinFamilyParams } from '../../violin-family-types';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const withBouts = (): ViolinFamilyParams => {
  const p = blank();
  MainBoutsPanel.seed(p);
  return p;
};

const seeded = (): ViolinFamilyParams => {
  const p = withBouts();
  CornersPanel.seed(p);
  return p;
};

const at = (arc: Arc, angle: number) => pointOnCircle(arc, angle);
const start = (arc: Arc) => at(arc, arc.start);
const end = (arc: Arc) => at(arc, arc.end);
const finite = (arc: Arc) => [arc.x, arc.y, arc.r, arc.start, arc.end].every(Number.isFinite);

// a bout that can't reach its width: the big arc too close in size to the small one to hold it
const breakUpperBout = (p: ViolinFamilyParams) => { p.bouts!.U0R = p.bouts!.U1R + 5; };
const breakLowerBout = (p: ViolinFamilyParams) => { p.bouts!.L0R = p.bouts!.L1R + 5; };

// where two tangent arcs hand over, the crossing is found to the square root of the rounding,
// about a micron; the Ceruti recipe carries the same residue
const MEETS = 5;

describe('the corners solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveCorners(p);
    solveCornersRatios(p);
    defaultCornerTips(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('has no corners until the stage is seeded', () => {
    expect(solveCorners(withBouts())).toBeNull();
    expect(solveCorners(blank())).toBeNull();
  });

  it('leaves the main bouts\' own arcs whole and returns its trimmed copies beside them', () => {
    const p = seeded();
    const m = solveMainBouts(p)!;
    const before = JSON.stringify(m);
    const c = solveCorners(p)!;
    expect(JSON.stringify(solveMainBouts(p))).toBe(before);
    expect(c.U1).not.toBe(m.U1);
    expect(c.L1).not.toBe(m.L1);
    for (const key of ['x', 'y', 'r', 'start'] as const) {
      expect(c.U1![key]).toBeCloseTo(m.U1![key], 12);
      expect(c.L1![key]).toBeCloseTo(m.L1![key], 12);
    }
  });
});

describe('a Cremonese corner', () => {
  const p = seeded();
  const k = p.corners!;
  const inset = p.body.overhang + p.body.rib;
  const c = solveCorners(p)!;

  it('solves both corners from the seed', () => {
    expect(c.failures).toEqual([]);
    for (const arc of [c.U1, c.U2, c.U3, c.L1, c.L2, c.L3]) expect(arc).not.toBeNull();
    for (const arc of [c.U31, c.U4, c.L31, c.L4]) expect(arc).toBeNull();
  });

  it('turns each join arc out to its bout width line, less the inset, at the bout arc\'s height', () => {
    expect(c.U2!.x + c.U2!.r).toBeCloseTo(p.bouts!.UBW / 2 - inset, 9);
    expect(c.L2!.x + c.L2!.r).toBeCloseTo(p.body.width / 2 - inset, 9);
    expect(c.U2!.y).toBeCloseTo(c.U1!.y, 9);
    expect(c.L2!.y).toBeCloseTo(c.L1!.y, 9);
  });

  it('hands each bout arc over to its join arc at the trimmed end', () => {
    expect(dist(end(c.U1!), start(c.U2!))).toBeCloseTo(0, MEETS);
    expect(dist(end(c.L1!), start(c.L2!))).toBeCloseTo(0, MEETS);
  });

  it('sets each corner arc tangent to its join arc from outside and runs them together', () => {
    expect(dist(c.U2!, c.U3!)).toBeCloseTo(c.U2!.r + c.U3!.r, 6);
    expect(dist(c.L2!, c.L3!)).toBeCloseTo(c.L2!.r + c.L3!.r, 6);
    expect(dist(end(c.U2!), start(c.U3!))).toBeCloseTo(0, 6);
    expect(dist(end(c.L2!), start(c.L3!))).toBeCloseTo(0, 6);
  });

  it('ends each corner arc on its typed tip', () => {
    expect(dist(end(c.U3!), k.UCr)).toBeCloseTo(0, 6);
    expect(dist(end(c.L3!), k.LCr)).toBeCloseTo(0, 6);
    expect(c.U3!.r).toBeCloseTo(k.U3R, 12);
    expect(c.L3!.r).toBeCloseTo(k.L3R, 12);
  });

  it('turns the upper corner down to its tip and the lower corner up to its tip', () => {
    expect(c.U3!.y).toBeLessThan(c.U2!.y);
    expect(c.L3!.y).toBeGreaterThan(c.L2!.y);
  });

  it('still solves when the join arc is the bout arc itself', () => {
    const q = seeded();
    q.corners!.U2R = q.bouts!.U1R;
    q.corners!.L2R = q.bouts!.L1R;
    const s = solveCorners(q)!;
    expect(s.failures).toEqual([]);
    expect(dist(s.U2!, s.U1!)).toBeCloseTo(0, 9);
    expect(dist(s.L2!, s.L1!)).toBeCloseTo(0, 9);
    expect(s.U1!.end).toBe(0);
    expect(s.L1!.end).toBe(0);
    expect(dist(end(s.U2!), start(s.U3!))).toBeCloseTo(0, 6);
  });
});

describe('a compound corner', () => {
  const p = seeded();
  p.corners!.U31DoubleArc = true;
  p.corners!.L31DoubleArc = true;
  const k = p.corners!;
  const c = solveCorners(p)!;

  it('solves both corners with the seeded second arc and split', () => {
    expect(c.failures).toEqual([]);
    expect(c.U31).not.toBeNull();
    expect(c.L31).not.toBeNull();
  });

  it('nests the second arc inside the first, tangent, and runs them together', () => {
    expect(dist(c.U3!, c.U31!)).toBeCloseTo(c.U3!.r - c.U31!.r, 6);
    expect(dist(c.L3!, c.L31!)).toBeCloseTo(c.L3!.r - c.L31!.r, 6);
    expect(dist(end(c.U3!), start(c.U31!))).toBeCloseTo(0, 6);
    expect(dist(end(c.L3!), start(c.L31!))).toBeCloseTo(0, 6);
  });

  it('ends the second arc on the tip and keeps the first tangent to the join', () => {
    expect(dist(end(c.U31!), k.UCr)).toBeCloseTo(0, 6);
    expect(dist(end(c.L31!), k.LCr)).toBeCloseTo(0, 6);
    expect(dist(c.U2!, c.U3!)).toBeCloseTo(c.U2!.r + c.U3!.r, 6);
    expect(dist(end(c.U2!), start(c.U3!))).toBeCloseTo(0, 6);
  });

  it('takes the split as the typed degrees: the handover lies along that direction from U3\'s centre', () => {
    const handover = start(c.U31!);
    const direction = Math.atan2(handover.y - c.U3!.y, handover.x - c.U3!.x);
    const typed = k.U31Start * Math.PI / 180;
    expect(Math.abs(Math.cos(direction) - Math.cos(typed))).toBeLessThan(1e-6);
    expect(Math.abs(Math.sin(direction) - Math.sin(typed))).toBeLessThan(1e-6);
  });

  it('moves the handover when the split is retyped', () => {
    const q = seeded();
    q.corners!.U31DoubleArc = true;
    q.corners!.U31Start += 10;
    const moved = solveCorners(q)!;
    expect(moved.failures).toEqual([]);
    expect(dist(start(moved.U31!), start(c.U31!))).toBeGreaterThan(0.1);
  });
});

describe('a viol corner', () => {
  const p = seeded();
  p.corners!.useViolCornerUC = true;
  p.corners!.useViolCornerLC = true;
  const k = p.corners!;
  const c = solveCorners(p)!;

  it('sweeps from the bout arc\'s end to the tip in one arc', () => {
    expect(c.failures).toEqual([]);
    expect(dist(start(c.U4!), end(c.U1!))).toBeCloseTo(0, 6);
    expect(dist(end(c.U4!), k.UCr)).toBeCloseTo(0, 6);
    expect(dist(start(c.L4!), end(c.L1!))).toBeCloseTo(0, 6);
    expect(dist(end(c.L4!), k.LCr)).toBeCloseTo(0, 6);
  });

  it('is tangent to the bout arc where it takes over', () => {
    expect(dist(c.U4!, c.U1!)).toBeCloseTo(Math.abs(c.U4!.r - c.U1!.r), 6);
    expect(dist(c.L4!, c.L1!)).toBeCloseTo(Math.abs(c.L4!.r - c.L1!.r), 6);
  });

  it('keeps the Cremonese corner solved underneath, so turning the viol corner off puts it back', () => {
    expect(c.U3).not.toBeNull();
    expect(c.L3).not.toBeNull();
  });
});

describe('a corner that cannot be reached', () => {
  it('names the corner arc and the radius it needs, and leaves the other corner solved', () => {
    const p = seeded();
    p.corners!.U3R = 1;
    const c = solveCorners(p)!;

    expect(c.failures).toHaveLength(1);
    expect(c.failures[0].unsolved).toEqual(['U2', 'U3', 'U31', 'U4']);
    expect(c.failures[0].message).toContain("U3 can't reach the corner from U2");
    expect(c.failures[0].message).toMatch(/at least \d+\.\dmm/);
    expect(c.failures[0].points![0]).toEqual(p.corners!.UCr);
    for (const arc of [c.U2, c.U3, c.U4]) expect(arc).toBeNull();
    for (const arc of [c.L2, c.L3]) expect(arc).not.toBeNull();
  });

  it('leaves that bout arc untrimmed, as the main bouts solved it', () => {
    const p = seeded();
    p.corners!.L3R = 1;
    const c = solveCorners(p)!;
    const m = solveMainBouts(p)!;
    expect(c.failures.map(f => f.unsolved)).toEqual([['L2', 'L3', 'L31', 'L4']]);
    expect(c.L1).toEqual(m.L1);
  });

  it('gives a compound corner the generic advice, since it has no closed form', () => {
    const p = seeded();
    p.corners!.L31DoubleArc = true;
    p.corners!.LCr.x += 300;
    const c = solveCorners(p)!;
    expect(c.failures.map(f => f.unsolved)).toEqual([['L2', 'L3', 'L31', 'L4']]);
    expect(c.failures[0].message).toContain('no L3 of that radius reaches the corner from L2');
  });

  it('fails only its own corner while one of its fields is cleared, and draws no NaN', () => {
    const p = seeded();
    (p.corners!.UCr as any).x = null;
    const c = solveCorners(p)!;

    expect(c.failures.map(f => f.unsolved)).toEqual([['U2', 'U3', 'U31', 'U4']]);
    expect(c.failures[0].message).toContain('needs a value');
    expect(c.failures[0].circles).toEqual([]);
    expect(c.U2).toBeNull();
    for (const arc of [c.U1!, c.L1!, c.L2!, c.L3!]) expect(finite(arc)).toBe(true);
  });

  it('asks for the compound fields only while the corner is compound', () => {
    const p = seeded();
    (p.corners as any).U31R = null;
    expect(solveCorners(p)!.failures).toEqual([]);
    p.corners!.U31DoubleArc = true;
    expect(solveCorners(p)!.failures.map(f => f.unsolved)).toEqual([['U2', 'U3', 'U31', 'U4']]);
  });

  it('fails a corner whose bout has not solved, without the bout\'s own failure', () => {
    const p = seeded();
    breakUpperBout(p);
    expect(solveMainBouts(p)!.U1).toBeNull();
    const c = solveCorners(p)!;
    expect(c.failures.map(f => f.unsolved)).toEqual([['U2', 'U3', 'U31', 'U4']]);
    expect(c.failures[0].message).toContain('upper bout has to solve first');
    expect(c.U1).toBeNull();
    expect(c.L3).not.toBeNull();
  });
});

describe('seeding', () => {
  it('drafts the corners once and leaves them alone after', () => {
    const p = seeded();
    p.corners!.U3R += 3;
    p.corners!.UCr.x -= 2;
    const edited = JSON.stringify(p);
    CornersPanel.seed(p);
    expect(JSON.stringify(p)).toBe(edited);
  });

  it('seeds nothing until the main bouts have solved', () => {
    const p = blank();
    CornersPanel.seed(p);
    expect(p.corners).toBeUndefined();
    const q = withBouts();
    breakUpperBout(q);
    CornersPanel.seed(q);
    expect(q.corners).toBeUndefined();
  });

  it('seeds the compound and viol fields with the toggles off, so a toggle has values to show', () => {
    const k = seeded().corners!;
    expect(k.U31DoubleArc).toBe(false);
    expect(k.useViolCornerUC).toBe(false);
    expect(k.U31R).toBeGreaterThan(0);
    expect(k.L31R).toBeGreaterThan(0);
    expect(Number.isFinite(k.U31Start)).toBe(true);
    expect(Number.isFinite(k.L31Start)).toBe(true);
  });

  it('stores the split in degrees, a half turn and a little either side', () => {
    const k = seeded().corners!;
    expect(k.U31Start).toBeGreaterThan(180);
    expect(k.U31Start).toBeLessThan(200);
    expect(k.L31Start).toBeGreaterThan(160);
    expect(k.L31Start).toBeLessThan(180);
  });
});

describe('the default tips', () => {
  const p = withBouts();
  const tips = defaultCornerTips(p)!;
  const m = solveMainBouts(p)!;

  // the guide circle swings from the far side of the bout, at the bout arc's height, out to the
  // near side: its radius is the bout's width (less the inset, for the lower)
  it('stand on the guide circles, which stand on the bout arcs', () => {
    const inset = p.body.overhang + p.body.rib;
    const UBW = p.bouts!.UBW;
    const LBW = p.body.width;
    expect(Math.abs(dist(tips.UCr, { x: -UBW / 2, y: m.U1!.y }) - UBW)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(dist(tips.LCr, { x: -(LBW - inset) / 2, y: m.L1!.y }) - (LBW - inset))).toBeLessThanOrEqual(0.1);
  });

  it('sit at the seed ratio of the height, to the tenth they are rounded to, on the right side', () => {
    expect(Math.abs(tips.UCr.y - p.body.height * SEED_RATIOS.UCYtoH)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(Math.abs(tips.LCr.y - p.body.height * SEED_RATIOS.LCYtoH)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(tips.UCr.x).toBeGreaterThan(0);
    expect(tips.LCr.x).toBeGreaterThan(0);
    expect(tips.UCr.y).toBeGreaterThan(tips.LCr.y);
  });

  it('put a moved tip back where the seed had it', () => {
    const q = seeded();
    const seededTip = { ...q.corners!.UCr };
    q.corners!.UCr.x += 7;
    q.corners!.UCr.y -= 4;
    q.corners!.UCr = defaultCornerTips(q)!.UCr;
    expect(q.corners!.UCr).toEqual(seededTip);
  });

  it('are nothing to go back to until the main bouts have solved', () => {
    const q = withBouts();
    breakLowerBout(q);
    expect(defaultCornerTips(q)).toBeNull();
  });
});

describe('ratios', () => {
  it('reads nothing before the corners are drafted', () => {
    expect(solveCornersRatios(withBouts())).toEqual({});
  });

  // the seed rounds each radius to the millimetre and each tip to a tenth, so a fresh draft reads
  // back its seed fractions to within that rounding and no further
  it('reads a fresh draft back at its seed fractions', () => {
    const p = seeded();
    const r = solveCornersRatios(p);
    const inset = p.body.overhang + p.body.rib;
    const UBWI = p.bouts!.UBW - 2 * inset;
    const LBWI = p.body.width - 2 * inset;

    expect(Math.abs(r.U2toUBW! - SEED_RATIOS.U2toUBW)).toBeLessThanOrEqual(0.5 / UBWI + 1e-12);
    for (const key of ['U3toLBW', 'U31toLBW', 'L2toLBW', 'L3toLBW', 'L31toLBW'] as const) {
      expect(Math.abs(r[key]! - SEED_RATIOS[key]), key).toBeLessThanOrEqual(0.5 / LBWI + 1e-12);
    }
    expect(Math.abs(r.UCYtoH! - SEED_RATIOS.UCYtoH)).toBeLessThanOrEqual(0.05 / p.body.height + 1e-12);
    expect(Math.abs(r.LCYtoH! - SEED_RATIOS.LCYtoH)).toBeLessThanOrEqual(0.05 / p.body.height + 1e-12);
  });

  it('follows an edit, with nothing to refresh', () => {
    const p = seeded();
    const before = solveCornersRatios(p).U3toLBW!;
    p.corners!.U3R *= 1.5;
    expect(solveCornersRatios(p).U3toLBW).toBeCloseTo(before * 1.5, 9);
  });

  it('agrees with the geometry it describes', () => {
    const p = seeded();
    const r = solveCornersRatios(p);
    const c = solveCorners(p)!;
    const inset = p.body.overhang + p.body.rib;
    expect(r.U2toUBW).toBeCloseTo(c.U2!.r / (p.bouts!.UBW - 2 * inset), 12);
    expect(r.L3toLBW).toBeCloseTo(c.L3!.r / (p.body.width - 2 * inset), 12);
    expect(r.UCYtoH).toBeCloseTo(end(c.U3!).y / p.body.height, 6);
  });
});

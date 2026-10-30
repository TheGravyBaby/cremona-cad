// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PlateContourPanel, solvePlateContourRatios } from '../plate-contour-panel/plate-contour-panel';
import { FHolePlacementPanel, solveFholePlacementRatios } from '../fhole-placement-panel/fhole-placement-panel';
import { FHoleContoursPanel, solveFholeContoursRatios } from '../fhole-contours-panel/fhole-contours-panel';
import { dist, pointOnCircle, signedArcSweep, TURN } from '../../../../helpers/math/simpleGeometry';
import { Arc } from '../../../../models/types';
import { solveCenterBout, solveCenterBoutRatios } from './center-bout-panel';
import { CornersPanel, solveCorners, solveCornersRatios } from '../corners-panel/corners-panel';
import { MainBoutsPanel, solveMainBouts, solveMainBoutsRatios } from '../main-bouts-panel/main-bouts-panel';
import { solveBodyRatios } from '../base-measurements-panel/base-measurements-panel';
import { ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS, FHOLE_SEED_RATIOS, SEED_RATIOS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const withBouts = (): ViolinFamilyParams => {
  const p = blank();
  MainBoutsPanel.seed(p);
  return p;
};

// the C bout has no seed of its own: its numbers come with the bouts and the corners
const seeded = (): ViolinFamilyParams => {
  const p = withBouts();
  CornersPanel.seed(p);
  return p;
};

const at = (arc: Arc, angle: number) => pointOnCircle(arc, angle);
const start = (arc: Arc) => at(arc, arc.start);
const end = (arc: Arc) => at(arc, arc.end);
const finite = (arc: Arc) => [arc.x, arc.y, arc.r, arc.start, arc.end].every(Number.isFinite);

// where two tangent arcs hand over, the crossing is found to the square root of the rounding,
// about a micron; the Ceruti recipe carries the same residue
const MEETS = 5;

describe('the center bout solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    p.bouts!.useKellyC0 = true;
    const snapshot = JSON.stringify(p);
    solveCenterBout(p);
    solveCenterBoutRatios(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('has no center bout until the corners are drafted, and one as soon as they are', () => {
    expect(solveCenterBout(blank())).toBeNull();
    expect(solveCenterBout(withBouts())).toBeNull();
    expect(solveCenterBout(seeded())).not.toBeNull();
  });

  it('seeds C0 with the bouts and the corner arcs with the corners', () => {
    const b = withBouts().bouts!;
    expect(b.CBW).toBeGreaterThan(0);
    expect(b.C0R).toBeGreaterThan(0);
    expect(b.C0Y).toBeGreaterThan(0);
    expect(b.useKellyC0).toBe(false);
    const k = seeded().corners!;
    for (const key of ['C2R', 'C21R', 'C1R', 'C11R'] as const) expect(k[key]).toBeGreaterThan(0);
    for (const sweep of [k.C21Sweep, k.C11Sweep]) {
      expect(sweep).toBeGreaterThan(0);
      expect(sweep).toBeLessThan(90);
    }
  });

  it('leaves the corners\' own arcs as the corners solved them', () => {
    const p = seeded();
    const before = JSON.stringify(solveCorners(p));
    solveCenterBout(p);
    expect(JSON.stringify(solveCorners(p))).toBe(before);
  });
});

describe('a hand-placed C bout', () => {
  const p = seeded();
  const b = p.bouts!;
  const k = p.corners!;
  const inset = p.body.overhang + p.body.rib;
  const cb = solveCenterBout(p)!;

  it('solves from the seed, plain', () => {
    expect(cb.failures).toEqual([]);
    for (const arc of [cb.C0, cb.C2, cb.C1]) expect(arc).not.toBeNull();
    for (const arc of [cb.C21, cb.C11]) expect(arc).toBeNull();
  });

  it('sets C0 in from the center bout width line at the typed height, and reads that width back', () => {
    expect(cb.C0!.x - cb.C0!.r).toBeCloseTo(b.CBW / 2 - inset, 9);
    expect(cb.C0!.y).toBeCloseTo(b.C0Y, 9);
    expect(cb.C0!.r).toBeCloseTo(b.C0R, 9);
    expect(cb.CBW).toBe(b.CBW);
  });

  it('sets each corner arc tangent to C0 and runs C0 from one to the other', () => {
    expect(Math.abs(dist(cb.C0!, cb.C2!) - cb.C0!.r)).toBeCloseTo(cb.C2!.r, 6);
    expect(Math.abs(dist(cb.C0!, cb.C1!) - cb.C0!.r)).toBeCloseTo(cb.C1!.r, 6);
    expect(dist(start(cb.C0!), start(cb.C2!))).toBeCloseTo(0, MEETS);
    expect(dist(end(cb.C0!), start(cb.C1!))).toBeCloseTo(0, MEETS);
  });

  it('ends each corner arc on its tip, the tips the corners panel typed', () => {
    expect(dist(end(cb.C2!), k.UCr)).toBeCloseTo(0, 6);
    expect(dist(end(cb.C1!), k.LCr)).toBeCloseTo(0, 6);
    expect(cb.C2!.r).toBeCloseTo(k.C2R, 12);
    expect(cb.C1!.r).toBeCloseTo(k.C1R, 12);
  });

  it('runs C0 down the C, the upper handover above the lower', () => {
    expect(start(cb.C0!).y).toBeGreaterThan(end(cb.C0!).y);
    expect(cb.C0!.x).toBeGreaterThan(0);
  });
});

describe('C0 fitted to the bouts', () => {
  const p = seeded();
  p.bouts!.useKellyC0 = true;
  const inset = p.body.overhang + p.body.rib;
  const c = solveCorners(p)!;
  const cb = solveCenterBout(p)!;

  it('touches both join arcs from outside', () => {
    expect(cb.failures).toEqual([]);
    expect(dist(cb.C0!, c.U2!)).toBeCloseTo(cb.C0!.r + c.U2!.r, 6);
    expect(dist(cb.C0!, c.L2!)).toBeCloseTo(cb.C0!.r + c.L2!.r, 6);
  });

  it('reads the width off the fitted C0 rather than the typed one', () => {
    expect(cb.CBW).toBeCloseTo((cb.C0!.x - cb.C0!.r + inset) * 2, 9);
    expect(solveCenterBoutRatios(p).CBWtoLBW).toBeCloseTo(cb.CBW! / p.body.width, 12);
  });

  it('ignores the typed width and height while on', () => {
    const q = seeded();
    q.bouts!.useKellyC0 = true;
    q.bouts!.CBW += 30;
    q.bouts!.C0Y -= 20;
    const moved = solveCenterBout(q)!;
    expect(moved.C0!.x).toBeCloseTo(cb.C0!.x, 9);
    expect(moved.C0!.y).toBeCloseTo(cb.C0!.y, 9);
  });

  it('fails rather than falling back when C0 is too small to reach both join arcs', () => {
    const q = seeded();
    q.bouts!.useKellyC0 = true;
    q.bouts!.C0R = 5;
    const miss = solveCenterBout(q)!;
    expect(miss.failures).toHaveLength(1);
    expect(miss.failures[0].message).toContain('Fit C0 to Bouts');
    expect(miss.failures[0].unsolved).toEqual(['C0', 'C2', 'C21', 'C1', 'C11']);
    expect(miss.failures[0].circles).toHaveLength(2);
    for (const arc of [miss.C0, miss.C2, miss.C1]) expect(arc).toBeNull();
    expect(q.bouts!.useKellyC0).toBe(true);
  });
});

describe('a compound C bout corner', () => {
  const p = seeded();
  p.corners!.C21DoubleArc = true;
  p.corners!.C11DoubleArc = true;
  const k = p.corners!;
  const cb = solveCenterBout(p)!;

  it('solves both corners with the seeded second arc and split', () => {
    expect(cb.failures).toEqual([]);
    expect(cb.C21).not.toBeNull();
    expect(cb.C11).not.toBeNull();
  });

  it('nests the second arc inside the first, tangent, and runs them together onto the tip', () => {
    expect(dist(cb.C2!, cb.C21!)).toBeCloseTo(cb.C2!.r - cb.C21!.r, 6);
    expect(dist(cb.C1!, cb.C11!)).toBeCloseTo(cb.C1!.r - cb.C11!.r, 6);
    expect(dist(end(cb.C2!), start(cb.C21!))).toBeCloseTo(0, MEETS);
    expect(dist(end(cb.C1!), start(cb.C11!))).toBeCloseTo(0, MEETS);
    expect(dist(end(cb.C21!), k.UCr)).toBeCloseTo(0, 6);
    expect(dist(end(cb.C11!), k.LCr)).toBeCloseTo(0, 6);
  });

  it('keeps the first arc tangent to C0 and C0 running between the two', () => {
    expect(Math.abs(dist(cb.C0!, cb.C2!) - cb.C0!.r)).toBeCloseTo(cb.C2!.r, 6);
    expect(dist(start(cb.C0!), start(cb.C2!))).toBeCloseTo(0, MEETS);
    expect(dist(end(cb.C0!), start(cb.C1!))).toBeCloseTo(0, MEETS);
  });

  it('turns each second arc through the typed sweep onto its tip: C21 clockwise, C11 counterclockwise', () => {
    expect(Math.abs(signedArcSweep(cb.C21!)) / TURN.degree).toBeCloseTo(k.C21Sweep, MEETS);
    expect(Math.abs(signedArcSweep(cb.C11!)) / TURN.degree).toBeCloseTo(k.C11Sweep, MEETS);
    expect(signedArcSweep(cb.C21!)).toBeLessThan(0);
    expect(signedArcSweep(cb.C11!)).toBeGreaterThan(0);
  });

  it('moves the handover when the sweep is retyped', () => {
    const q = seeded();
    q.corners!.C11DoubleArc = true;
    q.corners!.C11Sweep += 10;
    const moved = solveCenterBout(q)!;
    expect(moved.failures).toEqual([]);
    expect(dist(start(moved.C11!), start(cb.C11!))).toBeGreaterThan(0.1);
  });
});

describe('a C bout corner that cannot be reached', () => {
  it('names the corner arc and the radius it needs, and leaves the other corner and C0 placed', () => {
    const p = seeded();
    p.corners!.C2R = 1;
    const cb = solveCenterBout(p)!;

    expect(cb.failures).toHaveLength(1);
    expect(cb.failures[0].unsolved).toEqual(['C0', 'C2', 'C21']);
    expect(cb.failures[0].message).toContain("C2 can't reach the corner from C0");
    expect(cb.failures[0].message).toMatch(/at least \d+\.\dmm/);
    expect(cb.failures[0].points![0]).toEqual(p.corners!.UCr);
    expect(cb.C2).toBeNull();
    expect(cb.C1).not.toBeNull();
    // C0 has only one end to run to, so it isn't drawn either; its width still reads
    expect(cb.C0).toBeNull();
    expect(cb.CBW).toBe(p.bouts!.CBW);
  });

  it('gives a compound corner the generic advice, since it has no closed form', () => {
    const p = seeded();
    p.corners!.C11DoubleArc = true;
    p.corners!.LCr.x += 300;
    const cb = solveCenterBout(p)!;
    expect(cb.failures.map(f => f.unsolved)).toEqual([['C0', 'C1', 'C11']]);
    expect(cb.failures[0].message).toContain('no C1 of that radius reaches the corner from C0');
  });

  it('fails only its own section while one of its fields is cleared, and draws no NaN', () => {
    const p = seeded();
    (p.corners as any).C1R = null;
    const cb = solveCenterBout(p)!;
    expect(cb.failures.map(f => f.unsolved)).toEqual([['C0', 'C1', 'C11']]);
    expect(cb.failures[0].message).toContain('needs a value');
    expect(cb.C1).toBeNull();
    expect(finite(cb.C2!)).toBe(true);
  });

  it('fails the whole C bout once, not three times, when C0 has no value', () => {
    const p = seeded();
    (p.bouts as any).C0R = null;
    const cb = solveCenterBout(p)!;
    expect(cb.failures).toHaveLength(1);
    expect(cb.failures[0].unsolved).toEqual(['C0', 'C2', 'C21', 'C1', 'C11']);
    for (const arc of [cb.C0, cb.C2, cb.C1]) expect(arc).toBeNull();
  });

  it('asks for the typed width only while the fit is off', () => {
    const p = seeded();
    (p.bouts as any).CBW = null;
    expect(solveCenterBout(p)!.failures).toHaveLength(1);
    p.bouts!.useKellyC0 = true;
    expect(solveCenterBout(p)!.failures).toEqual([]);
  });

  it('cannot fit C0 while a corner has not solved', () => {
    const p = seeded();
    p.bouts!.useKellyC0 = true;
    p.corners!.U3R = 1;
    const cb = solveCenterBout(p)!;
    expect(cb.failures[0].message).toContain('both corners have to solve first');
    expect(cb.C0).toBeNull();
  });
});

describe('ratios', () => {
  it('reads nothing before the corners are drafted', () => {
    expect(solveCenterBoutRatios(withBouts())).toEqual({});
  });

  it('follows an edit, with nothing to refresh', () => {
    const p = seeded();
    const before = solveCenterBoutRatios(p).C0toLBW!;
    p.bouts!.C0R *= 1.5;
    expect(solveCenterBoutRatios(p).C0toLBW).toBeCloseTo(before * 1.5, 9);
  });

  it('names every seed fraction a ratio some panel reports', () => {
    const p = seeded();
    PlateContourPanel.seed(p);
    FHolePlacementPanel.seed(p);
    FHoleContoursPanel.seed(p);
    const keys = Object.keys({
      ...solveBodyRatios(p), ...solveMainBoutsRatios(p), ...solveCornersRatios(p), ...solveCenterBoutRatios(p), ...solvePlateContourRatios(p),
    }).sort();
    // the seed also carries the height the ratios are drawn from; that is not read back
    expect(keys).toEqual(Object.keys(SEED_RATIOS).filter(k => k !== 'height').sort());
  });

  it('names every f-hole seed fraction a ratio some panel reports', () => {
    const p = seeded();
    PlateContourPanel.seed(p);
    FHolePlacementPanel.seed(p);
    FHoleContoursPanel.seed(p);
    const keys = Object.keys({ ...solveFholePlacementRatios(p), ...solveFholeContoursRatios(p) }).sort();
    // the angles ride on the seed as well; they are params already, so nothing reads them back
    expect(keys).toEqual(Object.keys(FHOLE_SEED_RATIOS).filter(k => !/End$|Angle$|Cut(At|Slope)$/.test(k)).sort());
  });
});

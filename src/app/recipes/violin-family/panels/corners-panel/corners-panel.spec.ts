// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dist, pointOnCircle, signedArcSweep, TURN } from '../../../../helpers/math/simpleGeometry';
import { recordLayers } from '../../../../helpers/layer-recorder';
import { Arc } from '../../../../models/types';
import { ThemeService } from '../../../../theme/theme.service';
import { CornersPanel, calcDefaultCornerTips, renderCorners, solveCorners, calcCornersRatios } from './corners-panel';
import { MainBoutsPanel, solveMainBouts, calcMainBoutsRatios } from '../main-bouts-panel/main-bouts-panel';
import { calcBodyRatios } from '../base-measurements-panel/base-measurements-panel';
import { PlateContourPanel, calcPlateContourRatios } from '../plate-contour-panel/plate-contour-panel';
import { FHolePlacementPanel, calcFholePlacementRatios } from '../fhole-placement-panel/fhole-placement-panel';
import { FHoleContoursPanel, calcFholeContoursRatios } from '../fhole-contours-panel/fhole-contours-panel';
import { ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS, FHOLE_SEED_RATIOS, SEED_RATIOS } from '../../violin-family-seed';

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
    p.bouts!.useKellyC0 = true;
    const snapshot = JSON.stringify(p);
    solveCorners(p);
    calcCornersRatios(p);
    calcDefaultCornerTips(p);
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
    q.bouts!.U2R = q.bouts!.U1R;
    q.bouts!.L2R = q.bouts!.L1R;
    const s = solveCorners(q)!;
    expect(s.failures).toEqual([]);
    expect(dist(s.U2!, s.U1!)).toBeCloseTo(0, 9);
    expect(dist(s.L2!, s.L1!)).toBeCloseTo(0, 9);
    expect(s.U1!.end).toBe(0);
    expect(s.L1!.end).toBe(0);
    expect(dist(end(s.U2!), start(s.U3!))).toBeCloseTo(0, 6);
  });
});

describe('corners on a join off the widest point', () => {
  it('ends the join arc on its corner arc, single or compound, from where the bout hands it over', () => {
    for (const h of [-8, 8]) for (const compound of [false, true]) {
      const p = seeded();
      p.bouts!.UJoinY = h;
      p.bouts!.LJoinY = h;
      p.corners!.U31DoubleArc = compound;
      p.corners!.L31DoubleArc = compound;
      const s = solveCorners(p)!;
      expect(s.failures).toEqual([]);
      expect(dist(end(s.U1!), start(s.U2!))).toBeCloseTo(0, 9);
      expect(dist(end(s.L1!), start(s.L2!))).toBeCloseTo(0, 9);
      expect(dist(end(s.U2!), start(s.U3!))).toBeCloseTo(0, MEETS);
      expect(dist(end(s.L2!), start(s.L3!))).toBeCloseTo(0, MEETS);
    }
  });

  it('leaves a viol corner the way the bout was heading at the join', () => {
    for (const h of [-8, 0, 8]) {
      const p = seeded();
      p.bouts!.UJoinY = h;
      p.bouts!.LJoinY = h;
      p.corners!.useViolCornerUC = true;
      p.corners!.useViolCornerLC = true;
      const s = solveCorners(p)!;
      expect(s.failures).toEqual([]);
      for (const [bout, corner, tip] of [[s.U1!, s.U4!, p.corners!.UCr], [s.L1!, s.L4!, p.corners!.LCr]] as const) {
        // the two centres and the join in one line: the arcs share a tangent there
        const J = end(bout);
        expect(((corner.x - J.x) * (bout.y - J.y) - (corner.y - J.y) * (bout.x - J.x)) / (corner.r * bout.r)).toBeCloseTo(0, 9);
        expect(dist(corner, J)).toBeCloseTo(corner.r, 6);
        expect(dist(corner, tip)).toBeCloseTo(corner.r, 6);
      }
    }
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

  it('turns the second arc through the typed sweep onto the tip, back against its bout like the first', () => {
    expect(Math.abs(signedArcSweep(c.U31!)) / TURN.degree).toBeCloseTo(k.U31Sweep, MEETS);
    expect(Math.abs(signedArcSweep(c.L31!)) / TURN.degree).toBeCloseTo(k.L31Sweep, MEETS);
    for (const [bout, first, second] of [[c.U1!, c.U3!, c.U31!], [c.L1!, c.L3!, c.L31!]]) {
      expect(Math.sign(signedArcSweep(first))).toBe(-Math.sign(signedArcSweep(bout)));
      expect(Math.sign(signedArcSweep(second))).toBe(Math.sign(signedArcSweep(first)));
    }
  });

  it('moves the handover when the sweep is retyped', () => {
    const q = seeded();
    q.corners!.U31DoubleArc = true;
    q.corners!.U31Sweep += 10;
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

  // the sweep reads the bout arc's end before the corner solve re-reads it through a tangent-circle
  // intersection, which is only good to the square root of machine precision
  it('sweeps from the bout arc\'s end to the tip in one arc', () => {
    expect(c.failures).toEqual([]);
    expect(dist(start(c.U4!), end(c.U1!))).toBeCloseTo(0, 4);
    expect(dist(end(c.U4!), k.UCr)).toBeCloseTo(0, 6);
    expect(dist(start(c.L4!), end(c.L1!))).toBeCloseTo(0, 4);
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
    p.corners!.C11DoubleArc = true;
    p.corners!.LCr.x += 300;
    const c = solveCorners(p)!;
    expect(c.failures.map(f => f.unsolved)).toEqual([['L2', 'L3', 'L31', 'L4'], ['C0', 'C1', 'C11']]);
    expect(c.failures[0].message).toContain('no L3 of that radius reaches the corner from L2');
    expect(c.failures[1].message).toContain('no C1 of that radius reaches the corner from C0');
  });

  it('fails only its own corner while one of its fields is cleared, and draws no NaN', () => {
    const p = seeded();
    (p.corners!.UCr as any).x = null;
    const c = solveCorners(p)!;

    expect(c.failures.map(f => f.unsolved)).toEqual([['U2', 'U3', 'U31', 'U4'], ['C0', 'C2', 'C21']]);
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

describe('a hand-placed C bout', () => {
  const p = seeded();
  const b = p.bouts!;
  const k = p.corners!;
  const inset = p.body.overhang + p.body.rib;
  const c = solveCorners(p)!;

  it('solves from the seed, plain', () => {
    expect(c.failures).toEqual([]);
    for (const arc of [c.C0, c.C2, c.C1]) expect(arc).not.toBeNull();
    for (const arc of [c.C21, c.C11]) expect(arc).toBeNull();
  });

  it('sets C0 in from the center bout width line at the typed height, and reads that width back', () => {
    expect(c.C0!.x - c.C0!.r).toBeCloseTo(b.CBW / 2 - inset, 9);
    expect(c.C0!.y).toBeCloseTo(b.C0Y, 9);
    expect(c.C0!.r).toBeCloseTo(b.C0R, 9);
    expect(c.CBW).toBe(b.CBW);
  });

  it('sets each corner arc tangent to C0 and runs C0 from one to the other', () => {
    expect(Math.abs(dist(c.C0!, c.C2!) - c.C0!.r)).toBeCloseTo(c.C2!.r, 6);
    expect(Math.abs(dist(c.C0!, c.C1!) - c.C0!.r)).toBeCloseTo(c.C1!.r, 6);
    expect(dist(start(c.C0!), start(c.C2!))).toBeCloseTo(0, MEETS);
    expect(dist(end(c.C0!), start(c.C1!))).toBeCloseTo(0, MEETS);
  });

  it('ends each corner arc on its tip, the tips the corners share', () => {
    expect(dist(end(c.C2!), k.UCr)).toBeCloseTo(0, 6);
    expect(dist(end(c.C1!), k.LCr)).toBeCloseTo(0, 6);
    expect(c.C2!.r).toBeCloseTo(k.C2R, 12);
    expect(c.C1!.r).toBeCloseTo(k.C1R, 12);
  });

  it('runs C0 down the C, the upper handover above the lower', () => {
    expect(start(c.C0!).y).toBeGreaterThan(end(c.C0!).y);
    expect(c.C0!.x).toBeGreaterThan(0);
  });
});

describe('C0 fitted to the bouts', () => {
  const p = seeded();
  p.bouts!.useKellyC0 = true;
  const inset = p.body.overhang + p.body.rib;
  const c = solveCorners(p)!;

  it('touches both join arcs from outside', () => {
    expect(c.failures).toEqual([]);
    expect(dist(c.C0!, c.U2!)).toBeCloseTo(c.C0!.r + c.U2!.r, 6);
    expect(dist(c.C0!, c.L2!)).toBeCloseTo(c.C0!.r + c.L2!.r, 6);
  });

  it('reads the width off the fitted C0 rather than the typed one', () => {
    expect(c.CBW).toBeCloseTo((c.C0!.x - c.C0!.r + inset) * 2, 9);
    expect(calcCornersRatios(p).CBWtoLBW).toBeCloseTo(c.CBW! / p.body.width, 12);
  });

  it('ignores the typed width and height while on', () => {
    const q = seeded();
    q.bouts!.useKellyC0 = true;
    q.bouts!.CBW += 30;
    q.bouts!.C0Y -= 20;
    const moved = solveCorners(q)!;
    expect(moved.C0!.x).toBeCloseTo(c.C0!.x, 9);
    expect(moved.C0!.y).toBeCloseTo(c.C0!.y, 9);
  });

  it('fails rather than falling back when C0 is too small to reach both join arcs', () => {
    const q = seeded();
    q.bouts!.useKellyC0 = true;
    q.bouts!.C0R = 5;
    const miss = solveCorners(q)!;
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
  const c = solveCorners(p)!;

  it('solves both corners with the seeded second arc and split', () => {
    expect(c.failures).toEqual([]);
    expect(c.C21).not.toBeNull();
    expect(c.C11).not.toBeNull();
  });

  it('nests the second arc inside the first, tangent, and runs them together onto the tip', () => {
    expect(dist(c.C2!, c.C21!)).toBeCloseTo(c.C2!.r - c.C21!.r, 6);
    expect(dist(c.C1!, c.C11!)).toBeCloseTo(c.C1!.r - c.C11!.r, 6);
    expect(dist(end(c.C2!), start(c.C21!))).toBeCloseTo(0, MEETS);
    expect(dist(end(c.C1!), start(c.C11!))).toBeCloseTo(0, MEETS);
    expect(dist(end(c.C21!), k.UCr)).toBeCloseTo(0, 6);
    expect(dist(end(c.C11!), k.LCr)).toBeCloseTo(0, 6);
  });

  it('keeps the first arc tangent to C0 and C0 running between the two', () => {
    expect(Math.abs(dist(c.C0!, c.C2!) - c.C0!.r)).toBeCloseTo(c.C2!.r, 6);
    expect(dist(start(c.C0!), start(c.C2!))).toBeCloseTo(0, MEETS);
    expect(dist(end(c.C0!), start(c.C1!))).toBeCloseTo(0, MEETS);
  });

  it('turns each second arc through the typed sweep onto its tip: C21 clockwise, C11 counterclockwise', () => {
    expect(Math.abs(signedArcSweep(c.C21!)) / TURN.degree).toBeCloseTo(k.C21Sweep, MEETS);
    expect(Math.abs(signedArcSweep(c.C11!)) / TURN.degree).toBeCloseTo(k.C11Sweep, MEETS);
    expect(signedArcSweep(c.C21!)).toBeLessThan(0);
    expect(signedArcSweep(c.C11!)).toBeGreaterThan(0);
  });

  it('moves the handover when the sweep is retyped', () => {
    const q = seeded();
    q.corners!.C11DoubleArc = true;
    q.corners!.C11Sweep += 10;
    const moved = solveCorners(q)!;
    expect(moved.failures).toEqual([]);
    expect(dist(start(moved.C11!), start(c.C11!))).toBeGreaterThan(0.1);
  });
});

describe('a C bout corner that cannot be reached', () => {
  it('names the corner arc and the radius it needs, and leaves the other corner and C0 placed', () => {
    const p = seeded();
    p.corners!.C2R = 1;
    const c = solveCorners(p)!;

    expect(c.failures).toHaveLength(1);
    expect(c.failures[0].unsolved).toEqual(['C0', 'C2', 'C21']);
    expect(c.failures[0].message).toContain("C2 can't reach the corner from C0");
    expect(c.failures[0].message).toMatch(/at least \d+\.\dmm/);
    expect(c.failures[0].points![0]).toEqual(p.corners!.UCr);
    expect(c.C2).toBeNull();
    expect(c.C1).not.toBeNull();
    // C0 has only one end to run to, so it isn't drawn either; its width still reads
    expect(c.C0).toBeNull();
    expect(c.CBW).toBe(p.bouts!.CBW);
  });

  it('fails only its own section while one of its fields is cleared, and draws no NaN', () => {
    const p = seeded();
    (p.corners as any).C1R = null;
    const c = solveCorners(p)!;
    expect(c.failures.map(f => f.unsolved)).toEqual([['C0', 'C1', 'C11']]);
    expect(c.failures[0].message).toContain('needs a value');
    expect(c.C1).toBeNull();
    expect(finite(c.C2!)).toBe(true);
  });

  it('fails the whole C bout once, not three times, when C0 has no value', () => {
    const p = seeded();
    (p.bouts as any).C0R = null;
    const c = solveCorners(p)!;
    expect(c.failures).toHaveLength(1);
    expect(c.failures[0].unsolved).toEqual(['C0', 'C2', 'C21', 'C1', 'C11']);
    for (const arc of [c.C0, c.C2, c.C1]) expect(arc).toBeNull();
  });

  it('asks for the typed width only while the fit is off', () => {
    const p = seeded();
    (p.bouts as any).CBW = null;
    expect(solveCorners(p)!.failures).toHaveLength(1);
    p.bouts!.useKellyC0 = true;
    expect(solveCorners(p)!.failures).toEqual([]);
  });

  it('cannot fit C0 while a corner has not solved', () => {
    const p = seeded();
    p.bouts!.useKellyC0 = true;
    p.corners!.U3R = 1;
    const c = solveCorners(p)!;
    expect(c.failures[1].message).toContain('both corners have to solve first');
    expect(c.C0).toBeNull();
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

  it('seeds C0 with the bouts, its fit off', () => {
    const b = withBouts().bouts!;
    for (const v of [b.CBW, b.C0R, b.C0Y]) expect(v).toBeGreaterThan(0);
    expect(b.useKellyC0).toBe(false);
  });

  it('seeds the compound and viol fields with the toggles off, so a toggle has values to show', () => {
    const k = seeded().corners!;
    for (const key of ['C2R', 'C21R', 'C1R', 'C11R'] as const) expect(k[key]).toBeGreaterThan(0);
    expect(k.U31DoubleArc).toBe(false);
    expect(k.useViolCornerUC).toBe(false);
    expect(k.U31R).toBeGreaterThan(0);
    expect(k.L31R).toBeGreaterThan(0);
    expect(Number.isFinite(k.U31Sweep)).toBe(true);
    expect(Number.isFinite(k.L31Sweep)).toBe(true);
  });

  it('seeds each sweep as a modest turn, in degrees', () => {
    const k = seeded().corners!;
    for (const sweep of [k.U31Sweep, k.L31Sweep, k.C21Sweep, k.C11Sweep]) {
      expect(sweep).toBeGreaterThan(0);
      expect(sweep).toBeLessThan(90);
    }
  });
});

describe('the default tips', () => {
  const p = withBouts();
  const tips = calcDefaultCornerTips(p)!;
  const m = solveMainBouts(p)!;

  // how the seed places a tip is the seed's business and changes often; what every placement
  // owes the corners panel is a tip it can solve from, on the treble side, between the bouts
  it('land on the treble side, between the bout arcs and inside the plate, to the tenth', () => {
    for (const tip of [tips.UCr, tips.LCr]) {
      expect(tip.x).toBeGreaterThan(0);
      expect(tip.x).toBeLessThan(p.body.width / 2);
      expect(tip.y).toBeGreaterThan(m.L1!.y);
      expect(tip.y).toBeLessThan(m.U1!.y);
      expect(tip.x * 10).toBeCloseTo(Math.round(tip.x * 10), 9);
      expect(tip.y * 10).toBeCloseTo(Math.round(tip.y * 10), 9);
    }
    expect(tips.UCr.y).toBeGreaterThan(tips.LCr.y);
  });

  it('give the corners panel a seed it solves with nothing unsolved', () => {
    expect(solveCorners(seeded())!.failures).toEqual([]);
  });

  it('put a moved tip back where the seed had it', () => {
    const q = seeded();
    const seededTip = { ...q.corners!.UCr };
    q.corners!.UCr.x += 7;
    q.corners!.UCr.y -= 4;
    q.corners!.UCr = calcDefaultCornerTips(q)!.UCr;
    expect(q.corners!.UCr).toEqual(seededTip);
  });

  it('are nothing to go back to until the main bouts have solved', () => {
    const q = withBouts();
    breakLowerBout(q);
    expect(calcDefaultCornerTips(q)).toBeNull();
  });
});

describe('ratios', () => {
  it('reads nothing before the corners are drafted', () => {
    expect(calcCornersRatios(withBouts())).toEqual({});
  });

  // the seed rounds each radius to the millimetre and each tip to a tenth, so a fresh draft reads
  // back its seed fractions to within that rounding and no further
  it('reads a fresh draft back at its seed fractions', () => {
    const p = seeded();
    const r = calcCornersRatios(p);
    const inset = p.body.overhang + p.body.rib;
    const LBWI = p.body.width - 2 * inset;

    for (const key of ['U3toLBW', 'U31toLBW', 'L3toLBW', 'L31toLBW'] as const) {
      expect(Math.abs(r[key]! - SEED_RATIOS[key]), key).toBeLessThanOrEqual(0.5 / LBWI + 1e-12);
    }
    expect(Math.abs(r.UCYtoH! - SEED_RATIOS.UCYtoH)).toBeLessThanOrEqual(0.05 / p.body.height + 1e-12);
    expect(Math.abs(r.LCYtoH! - SEED_RATIOS.LCYtoH)).toBeLessThanOrEqual(0.05 / p.body.height + 1e-12);
  });

  it('follows an edit, with nothing to refresh', () => {
    const p = seeded();
    const before = calcCornersRatios(p).U3toLBW!;
    p.corners!.U3R *= 1.5;
    expect(calcCornersRatios(p).U3toLBW).toBeCloseTo(before * 1.5, 9);
  });

  it('agrees with the geometry it describes', () => {
    const p = seeded();
    const r = calcCornersRatios(p);
    const c = solveCorners(p)!;
    const inset = p.body.overhang + p.body.rib;
    expect(r.L3toLBW).toBeCloseTo(c.L3!.r / (p.body.width - 2 * inset), 12);
    expect(r.UCYtoH).toBeCloseTo(end(c.U3!).y / p.body.height, 6);
  });

  it('names every seed fraction a ratio some panel reports', () => {
    const p = seeded();
    PlateContourPanel.seed(p);
    FHolePlacementPanel.seed(p);
    FHoleContoursPanel.seed(p);
    const keys = Object.keys({
      ...calcBodyRatios(p), ...calcMainBoutsRatios(p), ...calcCornersRatios(p), ...calcPlateContourRatios(p),
    }).sort();
    // the seed also carries the height the ratios are drawn from; that is not read back
    expect(keys).toEqual(Object.keys(SEED_RATIOS).filter(k => k !== 'height').sort());
  });

  it('names every f-hole seed fraction a ratio some panel reports', () => {
    const p = seeded();
    PlateContourPanel.seed(p);
    FHolePlacementPanel.seed(p);
    FHoleContoursPanel.seed(p);
    const keys = Object.keys({ ...calcFholePlacementRatios(p), ...calcFholeContoursRatios(p) }).sort();
    // the angles ride on the seed as well; they are params already, so nothing reads them back
    expect(keys).toEqual(Object.keys(FHOLE_SEED_RATIOS).filter(k => !/End$|Angle$|Cut(At|Slope)$/.test(k)).sort());
  });
});

describe('all arcs', () => {
  // under another panel the corners draw as plain traces, unless all arcs are asked for: then
  // they carry the same construction as on their own panel
  it('draws the corners under another panel as their own panel would', () => {
    const p = seeded();
    const c = solveCorners(p)!;
    const pal = ThemeService.getPalette('classicCremona');
    const drawn = (current: boolean, flags: { showModuleArcs: boolean; showAllArcs: boolean }) =>
      recordLayers([renderCorners(p, c, pal, { ...flags, renderOuterPath: true }, current, null)]);

    const own = drawn(true, { showModuleArcs: true, showAllArcs: false });
    const plain = drawn(false, { showModuleArcs: true, showAllArcs: false });
    const all = drawn(false, { showModuleArcs: false, showAllArcs: true });
    expect(all.paths).toEqual(own.paths);
    expect(all.elements.length).toBeGreaterThan(plain.elements.length);
  });
});

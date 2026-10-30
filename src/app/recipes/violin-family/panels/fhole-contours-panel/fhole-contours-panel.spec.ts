// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dist, normalizeRadians, pointOnCircle, signedArcSweep, signedRadianDelta, travelAtArcEnd, travelAtArcStart, TURN } from '../../../../helpers/math/simpleGeometry';
import { samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { Arc, Pt } from '../../../../models/types';
import { FHoleContoursPanel, fholePath, solveFholeContours, solveFholeContoursRatios } from './fhole-contours-panel';
import { FHolePlacementPanel, fholeNotches } from '../fhole-placement-panel/fhole-placement-panel';
import { PlateContourPanel } from '../plate-contour-panel/plate-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { ViolinFamilyParams } from '../../violin-family-types';
import { FholeContoursSolve } from '../../violin-family-solves';
import { DEFAULT_VIOLIN_FAMILY_PARAMS, FHOLE_SEED_RATIOS } from '../../violin-family-seed';

// The property tests say what the drawing is: every joint is tangent-continuous, the shoulder
// touches its own eye and its bound, and the tip is where the cut says it is. Those hold for any
// f-hole, not just this one.

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const placed = (): ViolinFamilyParams => {
  const p = blank();
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  PlateContourPanel.seed(p);
  FHolePlacementPanel.seed(p);
  return p;
};

const seeded = (): ViolinFamilyParams => {
  const p = placed();
  FHoleContoursPanel.seed(p);
  return p;
};

type Shape = 'plain' | 'extended' | 'short' | 'compound';

// each shape is a user's move away from the seed, scaled by t in (0, 1]. The seed changes often,
// and a move that cleared the stem on one seed crosses it on the next, so the move is backed off
// to the largest t the seed can take rather than pinned to numbers tuned against one seed
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

const move = (p: ViolinFamilyParams, shape: Shape, t: number): void => {
  const k = p.fHoleContours!;
  const deg = TURN.degree;

  if (shape === 'extended') {
    // extending both shoulders further past their apex, then dialling the stem's one shared arc
    // radius off its seed; much further and the upper one reaches its own cut
    k.U1End -= 0.1 * t / deg;
    k.L1End -= 0.25 * t / deg;
    k.stemArcR += 8 * t;
  }

  if (shape === 'short') {
    // the late del Gesu move: stop each shoulder before its apex and let a tighter arm take the
    // top of the hole. Where the apex falls on the seed's shoulder is read off the plain solve, so
    // the shoulder always stops short of it wherever the seed ends it
    const plain = solveFholeContours(seeded())!;
    const past = (shoulder: Arc, side: 1 | -1) => Math.max(0, side * Math.PI / 2 - shoulder.end);
    k.U1End += (past(plain.U1!, 1) + 0.4 * t) / deg;
    k.U2R = lerp(k.U2R, k.U1R / 2, t);
    k.L1End += (past(plain.L1!, -1) + 0.3 * t) / deg;
    k.L2R = lerp(k.L2R, k.L1R * 0.75, t);
  }

  if (shape === 'compound') {
    // split each arm in two, one tightening and one opening, so the stem arc lands on the second half
    k.U21DoubleArc = true;
    k.L21DoubleArc = true;
    k.U21R = lerp(k.U2R, k.U2R * 0.6, t);
    k.L21R = lerp(k.L2R, k.L2R * 1.4, t);
  }
};

const shaped = (shape: Shape): ViolinFamilyParams => {
  for (const t of [1, 0.8, 0.6, 0.4, 0.2]) {
    const p = seeded();
    move(p, shape, t);
    if (solveFholeContours(p)!.failures.length === 0) return p;
  }
  throw new Error(`no ${shape} f-hole the seed can take: the scenario needs rethinking for this seed`);
};

// the two edges as they are drawn, in the order the contour runs
const edgesOf = (p: ViolinFamilyParams, s: FholeContoursSolve): { name: string; chain: (Arc | null)[] }[] => {
  const k = p.fHoleContours!;
  return [
    { name: 'springing from UEye', chain: [s.U1, s.U2, k.U21DoubleArc ? s.U21 : null, s.S2, s.S4, s.L3] },
    { name: 'springing from LEye', chain: [s.L1, s.L2, k.L21DoubleArc ? s.L21 : null, s.S3, s.S1, s.U3] },
  ];
};

// the minor sweep between start and end, as every renderer draws it
const sampleArc = (a: Arc, n = 200): Pt[] => {
  const delta = normalizeRadians(a.end - a.start + Math.PI) - Math.PI;
  return Array.from({ length: n + 1 }, (_, i) => pointOnCircle(a, a.start + delta * i / n));
};

const points = (d: string): Pt[] => samplePathToPolyline(d, 0.1, true);
const closed = (d: string): boolean => {
  const q = points(d);
  return (d.match(/M/g) ?? []).length === 1 && dist(q[0], q[q.length - 1]) < 1e-5;
};

describe('the f-hole contours solve', () => {
  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveFholeContours(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('has no hole until both stages are seeded, and seeds once', () => {
    expect(solveFholeContours(blank())).toBeNull();
    expect(solveFholeContours(placed())).toBeNull();
    const q = blank();
    FHoleContoursPanel.seed(q);
    expect(q.fHoleContours).toBeUndefined();

    const p = seeded();
    p.fHoleContours!.U2R += 1;
    const edited = JSON.stringify(p);
    FHoleContoursPanel.seed(p);
    expect(JSON.stringify(p)).toBe(edited);
  });

  it('seeds every radius a whole millimetre and each cut a fraction of its eye', () => {
    const p = seeded();
    const k = p.fHoleContours!;
    const f = p.fHoles!;
    for (const r of [k.U1R, k.U2R, k.U21R, k.U3R, k.L1R, k.L2R, k.L21R, k.L3R, k.stemArcR]) {
      expect(r).toBeGreaterThan(0);
      expect(Math.round(r)).toBe(r);
    }
    expect(k.UCut.length).toBeCloseTo(f.UEye.r * FHOLE_SEED_RATIOS.UCuttoUEye, 0);
    expect(k.LCut.length).toBeCloseTo(f.LEye.r * FHOLE_SEED_RATIOS.LCuttoLEye, 0);
    expect(solveFholeContours(p)!.failures).toEqual([]);
  });
});

describe('the contour ratios', () => {
  it('read nothing before the contours are seeded', () => {
    expect(solveFholeContoursRatios(placed())).toEqual({});
  });

  // every radius is seeded a whole millimetre, so it reads back within half a millimetre of its eye
  it('read a fresh draft back at its seed fractions', () => {
    const p = seeded();
    const r = solveFholeContoursRatios(p);
    const { UEye, LEye } = p.fHoles!;
    const stem = p.fHoleContours!.stemArcR;
    expect(Math.abs(r.StoEyeSpan! - FHOLE_SEED_RATIOS.StoEyeSpan)).toBeLessThanOrEqual(0.5 / dist(UEye, LEye));
    for (const key of ['U1toS', 'U2toS', 'U3toS', 'L1toS', 'L2toS', 'L3toS'] as const)
      expect(Math.abs(r[key]! - FHOLE_SEED_RATIOS[key]), key).toBeLessThanOrEqual(0.5 / stem);
    for (const [key, eye] of [['UCuttoUEye', UEye], ['LCuttoLEye', LEye]] as const)
      expect(Math.abs(r[key]! - FHOLE_SEED_RATIOS[key]), key).toBeLessThanOrEqual(0.125 / eye.r);
  });
});

describe('f-hole contour properties', () => {
  const labels: Record<Shape, string> = {
    plain: 'with the plain seed',
    extended: 'with the shoulders extended and a stem arc pinned',
    short: 'with the shoulders stopped short of their apex',
    compound: 'with both arms split in two',
  };
  for (const shape of ['plain', 'extended', 'short', 'compound'] as const) {
    const label = labels[shape];
    const p = shaped(shape);
    const s = solveFholeContours(p)!;
    const f = p.fHoles!;
    const k = p.fHoleContours!;

    it(`solves every arc and closes the hole, ${label}`, () => {
      expect(s.failures).toEqual([]);
      expect(s.path).not.toBeNull();
      expect(closed(s.path!)).toBe(true);
      expect(s.path).not.toMatch(/NaN/);
      const mirrored = fholePath(p, s, true)!;
      expect(closed(mirrored)).toBe(true);
      // the bass hole is the treble hole flipped
      const q = points(s.path!);
      const m = points(mirrored);
      expect(Math.max(...q.map(pt => pt.x))).toBeCloseTo(-Math.min(...m.map(pt => pt.x)), 9);
      expect(Math.min(...q.map(pt => pt.y))).toBeCloseTo(Math.min(...m.map(pt => pt.y)), 9);
    });

    it(`cuts both notches into the stem's runs, and closes without them when they are off, ${label}`, () => {
      const { inner, outer } = fholeNotches(f, s.LTip);
      expect(outer).not.toBeNull();
      const nearest = (d: string, pt: Pt) => Math.min(...points(d).map(q => dist(q, pt)));
      const plain = fholePath({ ...p, fHoles: { ...f, notches: false } }, s, false)!;
      const plainMirrored = fholePath({ ...p, fHoles: { ...f, notches: false } }, s, true)!;
      expect(closed(plain)).toBe(true);
      // a notch too wide for its run shrinks about its mouth, so its apex is only reached toward
      for (const n of [inner, outer!]) {
        const mirroredApex = new Pt(-n.apex.x, n.apex.y);
        expect(nearest(s.path!, n.apex)).toBeLessThan(nearest(plain, n.apex));
        expect(nearest(fholePath(p, s, true)!, mirroredApex)).toBeLessThan(nearest(plainMirrored, mirroredApex));
      }
    });

    it(`runs every joint tangent-continuous, ${label}`, () => {
      for (const { name, chain } of edgesOf(p, s)) {
        const arcs = chain.filter((a): a is Arc => !!a);
        for (let i = 0; i < arcs.length - 1; i++) {
          const leaving = arcs[i], arriving = arcs[i + 1];
          const handover = pointOnCircle(leaving, leaving.end);
          const pickup = pointOnCircle(arriving, arriving.start);

          // the run along the stem edge is the one straight piece, so the two arcs either side of
          // it meet at a distance rather than at a point, but they still have to be travelling
          // the same way
          const gap = dist(handover, pickup);
          const turn = Math.abs(normalizeRadians(travelAtArcEnd(leaving) - travelAtArcStart(arriving) + Math.PI) - Math.PI);
          expect(turn, `${name} joint ${i} turns a corner`).toBeLessThan(1e-6);
          if (gap > 1e-6) {
            const alongStem = Math.abs(normalizeRadians(
              Math.atan2(pickup.y - handover.y, pickup.x - handover.x) - travelAtArcEnd(leaving) + Math.PI) - Math.PI);
            expect(alongStem, `${name} joint ${i} jumps sideways`).toBeLessThan(1e-6);
          }
        }
      }
    });

    it(`seats each shoulder on its own eye and the outline on its own bound, ${label}`, () => {
      const upperArm2 = k.U21DoubleArc ? s.U21! : null;
      const lowerArm2 = k.L21DoubleArc ? s.L21! : null;
      for (const [eye, shoulder, arm, arm2, rise, side] of [[f.UEye, s.U1!, s.U2!, upperArm2, f.URise, 1], [f.LEye, s.L1!, s.L2!, lowerArm2, f.LRise, -1]] as const) {
        // tangent internally to the eye: centres one radius difference apart
        expect(dist(shoulder, eye)).toBeCloseTo(shoulder.r - eye.r, 6);
        // and its start is that very tangency, so the eye rim hands the outline over
        expect(dist(pointOnCircle(shoulder, shoulder.start), pointOnCircle(eye, shoulder.start))).toBeCloseTo(0, 6);

        // the bound is tangent to the outline: whichever arc runs through the extreme, the
        // shoulder if its sweep reaches there, else the arm that continues past it, has its apex
        // on the bound, and nothing drawn along shoulder or arm crosses it
        const extreme = side * Math.PI / 2;
        const bound = eye.y + side * (eye.r + rise);
        const chain = [shoulder, arm, arm2].filter((a): a is Arc => !!a);
        const owner = chain.find(a => a.end <= extreme)!;
        expect(pointOnCircle(owner, extreme).y).toBeCloseTo(bound, 6);
        const farthest = Math.max(...chain.flatMap(a => sampleArc(a).map(pt => side * (pt.y - bound))));
        expect(farthest).toBeLessThan(1e-6);
        if (shape === 'short') expect(owner, 'short scenario must stop the shoulder short').not.toBe(shoulder);
      }
    });

    it(`ends each shoulder on its typed bearing, turning clockwise from its eye, and turns a split arm through its sweep, ${label}`, () => {
      expect(signedRadianDelta(s.U1!.end - k.U1End * TURN.degree)).toBeCloseTo(0, 6);
      expect(signedRadianDelta(s.L1!.end - k.L1End * TURN.degree)).toBeCloseTo(0, 6);
      expect(signedArcSweep(s.U1!)).toBeLessThan(0);
      expect(signedArcSweep(s.L1!)).toBeLessThan(0);
      if (k.U21DoubleArc) expect(signedArcSweep(s.U2!) / TURN.degree).toBeCloseTo(-k.U2Sweep, 6);
      if (k.L21DoubleArc) expect(signedArcSweep(s.L2!) / TURN.degree).toBeCloseTo(-k.L2Sweep, 6);
    });

    it(`puts each tip one cut length off its own eye, the way the slope says, ${label}`, () => {
      for (const [eye, cut, tip] of [[f.UEye, k.UCut, s.UTip!], [f.LEye, k.LCut, s.LTip!]] as const) {
        const foot = pointOnCircle(eye, cut.angleOnEye * TURN.degree);
        expect(dist(foot, tip)).toBeCloseTo(cut.length, 6);
        const ran = Math.atan2(tip.y - foot.y, tip.x - foot.x);
        expect(Math.abs(normalizeRadians(ran - cut.slope * TURN.degree + Math.PI) - Math.PI)).toBeLessThan(1e-6);
      }
    });

    it(`lands each wing on the tip it is hung from, ${label}`, () => {
      // L3 springs from UEye's edge and reaches the lower tip; U3 springs from LEye's and reaches the upper
      for (const [wing, tip] of [[s.L3!, s.LTip!], [s.U3!, s.UTip!]] as const) {
        expect(dist(pointOnCircle(wing, wing.end), tip)).toBeCloseTo(0, 6);
      }
    });
  }

  it('leaves the outline alone when an arm is split, until its radius moves', () => {
    const plain = solveFholeContours(seeded())!;
    const p = seeded();
    p.fHoleContours!.U21DoubleArc = true;
    p.fHoleContours!.L21DoubleArc = true;
    const split = solveFholeContours(p)!;

    // the second half seeds on the arm's own circle, so the stem arcs it feeds don't move
    for (const [arm, second] of [[plain.U2!, split.U21!], [plain.L2!, split.L21!]] as const) {
      expect(dist(second, arm)).toBeCloseTo(0, 6);
      expect(second.r).toBeCloseTo(arm.r, 6);
    }
    for (const key of ['S2', 'S3'] as const) {
      expect(dist(split[key]!, plain[key]!)).toBeCloseTo(0, 9);
      expect(split[key]!.end).toBeCloseTo(plain[key]!.end, 9);
    }
  });

  it('holds all four stem arcs to the one stem radius', () => {
    const p = shaped('extended');
    const s = solveFholeContours(p)!;
    for (const key of ['S1', 'S2', 'S3', 'S4'] as const) expect(s[key]!.r).toBeCloseTo(p.fHoleContours!.stemArcR, 9);
  });
});

describe('f-hole contour failures', () => {
  it('names the rise and the shoulder when the rise outruns the shoulder, and leaves the other three sections drawn', () => {
    const plain = solveFholeContours(seeded())!;
    const p = seeded();
    p.fHoles!.URise = 100;
    const s = solveFholeContours(p)!;

    expect(s.failures).toHaveLength(1);
    expect(s.failures[0].message).toContain('Reduce Rise, or enlarge U1');
    expect(s.failures[0].unsolved).toEqual(['U1', 'U2', 'U21', 'S2']);
    expect(s.U1).toBeNull();
    expect(s.path).toBeNull();
    expect(dist(s.L2!, plain.L2!)).toBeCloseTo(0, 9);
    expect(dist(s.S1!, plain.S1!)).toBeCloseTo(0, 9);
  });

  it('says the arm crosses the stem edge when it is too wide to turn onto it', () => {
    const p = seeded();
    p.fHoleContours!.U2R *= 2;
    const s = solveFholeContours(p)!;
    expect(s.failures).toHaveLength(1);
    expect(s.failures[0].message).toContain('U2 crosses the outer stem edge');
    expect(s.failures[0].unsolved).toEqual(['U2', 'S2']);
    expect(s.failures[0].circles[0].r).toBe(p.fHoleContours!.U2R);
  });

  it('says the stem arc cannot bridge when it is too small', () => {
    const p = seeded();
    // the lower wing is the flattest arc, so it is the first to need a bigger stem arc than it has
    p.fHoleContours!.stemArcR = 18;
    const s = solveFholeContours(p)!;
    expect(s.failures.map(f => f.unsolved)).toEqual([['L3', 'S4']]);
    expect(s.failures[0].message).toContain("S4 can't bridge from L3");
  });

  it('fails only the section whose field is cleared, and draws no NaN', () => {
    const p = seeded();
    (p.fHoleContours!.LCut as any).slope = null;
    const s = solveFholeContours(p)!;
    expect(s.failures.map(f => f.unsolved)).toEqual([['L3', 'S4']]);
    expect(s.failures[0].message).toContain('needs a value');
    expect(s.LTip).toBeNull();
    for (const key of ['U1', 'U2', 'U3', 'L1', 'L2', 'S1', 'S2', 'S3'] as const) expect(s[key]).not.toBeNull();
  });
});

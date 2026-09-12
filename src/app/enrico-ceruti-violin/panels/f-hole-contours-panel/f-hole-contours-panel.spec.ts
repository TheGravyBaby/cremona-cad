import { describe, expect, it } from 'vitest';
import { defaultViolin, geometryDiff } from '../../ceruti-fixtures';
import { defaultFHolePlacement } from '../f-hole-placement-panel/f-hole-placement-panel';
import { calculateFholeContours } from './f-hole-contours-panel';
import { pointOnCircle, travelAtArcEnd, travelAtArcStart, normalizeRadians, dist } from '../../../helpers/math/simpleGeometry';
import { Arc, Pt } from '../../../models/types';
import { EnricoCerutiParams } from '../../ceruti-types';

/**
 * The f-hole contour, pinned.
 *
 * Two kinds of check. The frozen numbers below are a characterization net: they
 * were read off the solver as it stood and exist so a refactor that meant to
 * change only names cannot quietly move a plate. Change them only when a shape
 * decision says to, never to make a build go green.
 *
 * The property tests are the ones that say what the drawing is: every joint is
 * tangent-continuous, the shoulder touches its own eye and its bound, and the
 * tip is where the cut says it is. Those hold for any f-hole, not just this one.
 */

const solve = (shaped: boolean): EnricoCerutiParams => {
  const p = defaultViolin();
  p.fHoles = defaultFHolePlacement(p);
  calculateFholeContours(p); // first pass: every radius, stem arcs included, off the defaults

  if (shaped) {
    // mimics a user extending both shoulders past their apex, then dialling the stem's one
    // shared arc radius off the 40 it defaults to. turn is -1 both sides by construction here,
    // so subtracting from `end` continues the shoulder's own turn.
    p.fHoles!.U1!.end -= 0.3;
    p.fHoles!.L1!.end -= 0.25;
    calculateFholeContours(p);

    p.fHoles!.stem.arcR! += 8; // all four of S1/S2/S3/S4 follow this one number
    calculateFholeContours(p);
  }

  return p;
};

/** The frozen numbers are 4dp, so compare at 4dp. */
const round4 = (v: unknown): unknown =>
  typeof v === 'number' ? Math.round(v * 1e4) / 1e4
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round4(x)]))
  : v;

const PLAIN = {
  "UEye": { "x": 21.6799, "y": 187.0265, "r": 3 },
  "URise": 3.6,
  "UCut": { "angleOnEye": 1.0472, "slope": 1.0472, "length": 3 },
  "UTip": { "x": 24.6799, "y": 192.2227 },
  "LEye": { "x": 57.4667, "y": 134.4, "r": 4 },
  "LRise": 4.8,
  "LCut": { "angleOnEye": 4.1888, "slope": -2.0944, "length": 4 },
  "LTip": { "x": 53.4667, "y": 127.4718 },
  "stem": {
    "center": { "x": 37.5077, "y": 159.3799 },
    "width": 5.1311,
    "angle": 1.6057,
    "arcR": 40,
  },
  "U1": { "x": 26.4799, "y": 185.6265, "r": 8, "start": 2.8578, "end": 1.5708 },
  "U2": { "x": 26.4799, "y": 184.6265, "r": 9, "start": 1.5708, "end": 0.5288 },
  "U3": { "x": 23.117, "y": 183.3594, "r": 9, "start": 0.3943, "end": 1.3963 },
  "L1": { "x": 51.5879, "y": 135.6, "r": 10, "start": -0.2014, "end": -1.5708 },
  "L2": { "x": 51.5879, "y": 137.6, "r": 12, "start": -1.5708, "end": -2.5743 },
  "L3": { "x": 54.5125, "y": 139.4261, "r": 12, "start": -2.7529, "end": -1.6581 },
  "S1": { "x": -5.5037, "y": 171.4492, "r": 40, "start": 0.0349, "end": 0.3943 },
  "S2": { "x": -0.2866, "y": 168.9883, "r": 40, "start": 0.5288, "end": 0.0349 },
  "S3": { "x": 75.2017, "y": 152.6462, "r": 40, "start": -2.5743, "end": -3.1067 },
  "S4": { "x": 80.4239, "y": 150.0375, "r": 40, "start": -3.1067, "end": -2.7529 },
};

const SHAPED = {
  "UEye": { "x": 21.6799, "y": 187.0265, "r": 3 },
  "URise": 3.6,
  "UCut": { "angleOnEye": 1.0472, "slope": 1.0472, "length": 3 },
  "UTip": { "x": 24.6799, "y": 192.2227 },
  "LEye": { "x": 57.4667, "y": 134.4, "r": 4 },
  "LRise": 4.8,
  "LCut": { "angleOnEye": 4.1888, "slope": -2.0944, "length": 4 },
  "LTip": { "x": 53.4667, "y": 127.4718 },
  "stem": {
    "center": { "x": 37.5077, "y": 159.3799 },
    "width": 5.1311,
    "angle": 1.6057,
    "arcR": 48,
  },
  "U1": { "x": 26.4799, "y": 185.6265, "r": 8, "start": 2.8578, "end": 1.2708 },
  "U2": { "x": 26.1844, "y": 184.6712, "r": 9, "start": 1.2708, "end": 0.4917 },
  "U3": { "x": 23.117, "y": 183.3594, "r": 9, "start": 0.355, "end": 1.3963 },
  "L1": { "x": 51.5879, "y": 135.6, "r": 10, "start": -0.2014, "end": -1.8208 },
  "L2": { "x": 52.0827, "y": 137.5378, "r": 12, "start": -1.8208, "end": -2.609 },
  "L3": { "x": 54.5125, "y": 139.4261, "r": 12, "start": -2.795, "end": -1.6581 },
  "S1": { "x": -13.4511, "y": 169.8032, "r": 48, "start": 0.0349, "end": 0.355 },
  "S2": { "x": -8.1962, "y": 166.2599, "r": 48, "start": 0.4917, "end": 0.0349 },
  "S3": { "x": 83.0958, "y": 155.8187, "r": 48, "start": -2.609, "end": -3.1067 },
  "S4": { "x": 88.3723, "y": 151.6537, "r": 48, "start": -3.1067, "end": -2.795 },
};

describe('f-hole contours', () => {
  it('solves the default violin to the geometry it was pinned at', () => {
    expect(geometryDiff(round4(solve(false).fHoles), PLAIN, 1e-9)).toEqual([]);
  });

  it('solves the same hole with both shoulders extended and a stem-arc radius pinned', () => {
    expect(geometryDiff(round4(solve(true).fHoles), SHAPED, 1e-9)).toEqual([]);
  });
});

/** The two edges as they are drawn, in the order the contour runs — crossing U/L/S field names,
 * since those now track physical position rather than which edge drew the arc. */
const edgesOf = (p: EnricoCerutiParams): { name: string; chain: (Arc | null)[] }[] => {
  const f = p.fHoles!;
  return [
    { name: 'springing from UEye', chain: [f.U1, f.U2, f.S2, f.S4, f.L3] },
    { name: 'springing from LEye', chain: [f.L1, f.L2, f.S3, f.S1, f.U3] },
  ];
};

describe('f-hole contour properties', () => {
  for (const shaped of [false, true]) {
    const label = shaped ? 'with the shoulders extended and a stem arc pinned' : 'with the plain default';

    it(`runs every joint tangent-continuous, ${label}`, () => {
      for (const { name, chain } of edgesOf(solve(shaped))) {
        const arcs = chain.filter((a): a is Arc => !!a);

        for (let i = 0; i < arcs.length - 1; i++) {
          const leaving = arcs[i], arriving = arcs[i + 1];
          const handover = pointOnCircle(leaving, leaving.end);
          const pickup = pointOnCircle(arriving, arriving.start);

          // the run along the stem edge is the one straight piece, so the two arcs
          // either side of it meet at a distance rather than at a point — but they
          // still have to be travelling the same way
          const gap = dist(handover, pickup);
          const turn = Math.abs(normalizeRadians(travelAtArcEnd(leaving) - travelAtArcStart(arriving) + Math.PI) - Math.PI);

          expect(turn, `${name} joint ${i} turns a corner`).toBeLessThan(1e-6);
          if (gap > 1e-6) {
            // a gap is only legitimate along the stem, where the straight run lives
            const alongStem = Math.abs(normalizeRadians(
              Math.atan2(pickup.y - handover.y, pickup.x - handover.x) - travelAtArcEnd(leaving) + Math.PI) - Math.PI);
            expect(alongStem, `${name} joint ${i} jumps sideways`).toBeLessThan(1e-6);
          }
        }
      }
    });

    it(`seats each shoulder on its own eye and its own bound, ${label}`, () => {
      const f = solve(shaped).fHoles!;
      for (const [eye, shoulder, rise, side] of [[f.UEye!, f.U1!, f.URise!, 1], [f.LEye!, f.L1!, f.LRise!, -1]] as const) {
        // tangent internally to the eye: centres one radius difference apart
        expect(dist(shoulder, eye)).toBeCloseTo(shoulder.r - eye.r, 6);
        // and its start is that very tangency, so the eye rim hands the outline over
        expect(dist(pointOnCircle(shoulder, shoulder.start), pointOnCircle(eye, shoulder.start))).toBeCloseTo(0, 6);
        // the apex — where the shoulder's tangent is horizontal — sits on the bound the rise
        // sets. that's a fixed point on the shoulder's circle, not necessarily its `end`: once
        // extended, the shoulder runs on past the apex rather than stopping there.
        expect(pointOnCircle(shoulder, side * Math.PI / 2).y).toBeCloseTo(eye.y + side * (eye.r + rise), 6);
      }
    });

    it(`puts each tip one cut length off its own eye, ${label}`, () => {
      const f = solve(shaped).fHoles!;
      for (const [eye, cut, tip] of [[f.UEye!, f.UCut!, f.UTip!], [f.LEye!, f.LCut!, f.LTip!]] as const) {
        // angleOnEye is absolute in the plate's frame, not measured off the ray to the other eye
        const foot = pointOnCircle(eye, cut.angleOnEye!);

        expect(dist(foot, tip)).toBeCloseTo(cut.length!, 6);
        // and the cut runs the way `slope` says, read straight off the plate
        const ran = Math.atan2(tip.y - foot.y, tip.x - foot.x);
        expect(Math.abs(normalizeRadians(ran - cut.slope! + Math.PI) - Math.PI)).toBeLessThan(1e-6);
      }
    });

    it(`lands each wing on the tip it is hung from, ${label}`, () => {
      const f = solve(shaped).fHoles!;
      // L3 springs from UEye's edge and reaches the lower tip; U3 springs from LEye's and reaches the upper
      for (const [wing, tip] of [[f.L3!, f.LTip!], [f.U3!, f.UTip!]] as const) {
        expect(dist(pointOnCircle(wing, wing.end), tip)).toBeCloseTo(0, 6);
      }
    });

  }

  it('holds all four stem arcs to the one radius the stem was pinned at, once shaped', () => {
    const bootstrap = solve(false).fHoles!;
    const f = solve(true).fHoles!;
    const pinned = bootstrap.stem.arcR! + 8;

    expect(f.stem.arcR).toBeCloseTo(pinned, 6);
    expect(f.S1!.r).toBeCloseTo(pinned, 6);
    expect(f.S2!.r).toBeCloseTo(pinned, 6);
    expect(f.S3!.r).toBeCloseTo(pinned, 6);
    expect(f.S4!.r).toBeCloseTo(pinned, 6);
  });
});

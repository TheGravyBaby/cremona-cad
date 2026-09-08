import { describe, expect, it } from 'vitest';
import { defaultViolin, geometryDiff } from '../../ceruti-fixtures';
import { defaultFHolePlacement } from '../f-hole-placement-panel/f-hole-placement-panel';
import { calculateFholeContours } from './f-hole-contours-panel';
import { pointOnCircle, travelAtArcEnd, travelAtArcStart, normalizeRadians, dist } from '../../../helpers/draftMath';
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
  calculateFholeContours(p); // bootstrap pass: solves shoulder/arm/stem-arc from defaults alone

  if (shaped) {
    // mimics a user extending both shoulders past their apex, then dialling in stem-arc and
    // stem (flare) radii distinct from whatever the bootstrap pass produced. turn is -1 both
    // sides by construction here, so subtracting from `end` continues the shoulder's own turn.
    p.fHoles!.O1!.end -= 0.3;
    p.fHoles!.I1!.end -= 0.25;
    calculateFholeContours(p);

    p.fHoles!.O3!.r += 8; // outer's stem-tangent arc
    p.fHoles!.I3!.r -= 5; // inner's stem-tangent arc
    p.fHoles!.I4!.r += 4; // inner's stem-to-wing arc
    p.fHoles!.O4!.r -= 6; // outer's stem-to-wing arc
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
  "UEye": { "x": 21.6799, "y": 187.0265, "r": 3.2 },
  "URise": 3.84,
  "UCut": { "angleOnEye": 2.0944, "slope": 1.0472, "length": 3.2 },
  "UTip": { "x": 24.6718, "y": 192.6792 },
  "LEye": { "x": 57.4667, "y": 134.4, "r": 4 },
  "LRise": 4.8,
  "LCut": { "angleOnEye": 2.0944, "slope": -2.0944, "length": 4 },
  "LTip": { "x": 53.7268, "y": 127.3341 },
  "stem": {
    "center": { "x": 37.4577, "y": 159.6466 },
    "width": 5.0311,
    "angle": 1.6057,
  },
  "O1": { "x": 26.3829, "y": 186.0665, "r": 8, "start": 2.9402, "end": 1.5708 },
  "O2": { "x": 26.3829, "y": 185.0665, "r": 9, "start": 1.5708, "end": 0.5236 },
  "O3": { "x": -0.9546, "y": 169.2832, "r": 40.5667, "start": 0.5236, "end": 0.0349 },
  "O4": { "x": 78.4847, "y": 150.3456, "r": 38.1633, "start": -3.1067, "end": -2.7053 },
  "O5": { "x": 54.7726, "y": 139.2885, "r": 12, "start": -2.7053, "end": -1.6581 },
  "I1": { "x": 51.5879, "y": 135.6, "r": 10, "start": -0.2014, "end": -1.5708 },
  "I2": { "x": 51.5879, "y": 137.6, "r": 12, "start": -1.5708, "end": -2.618 },
  "I3": { "x": 80.1924, "y": 154.1148, "r": 45.0296, "start": -2.618, "end": -3.1067 },
  "I4": { "x": -14.9535, "y": 169.9623, "r": 49.5053, "start": -6.2483, "end": -5.9341 },
  "I5": { "x": 23.109, "y": 183.8159, "r": 9, "start": 0.3491, "end": 1.3963 },
};

const SHAPED = {
  "UEye": { "x": 21.6799, "y": 187.0265, "r": 3.2 },
  "URise": 3.84,
  "UCut": { "angleOnEye": 2.0944, "slope": 1.0472, "length": 3.2 },
  "UTip": { "x": 24.6718, "y": 192.6792 },
  "LEye": { "x": 57.4667, "y": 134.4, "r": 4 },
  "LRise": 4.8,
  "LCut": { "angleOnEye": 2.0944, "slope": -2.0944, "length": 4 },
  "LTip": { "x": 53.7268, "y": 127.3341 },
  "stem": {
    "center": { "x": 37.4577, "y": 159.6466 },
    "width": 5.0311,
    "angle": 1.6057,
  },
  "O1": { "x": 26.3829, "y": 186.0665, "r": 8, "start": 2.9402, "end": 1.2708 },
  "O2": { "x": 26.0874, "y": 185.1112, "r": 9, "start": 1.2708, "end": 0.4878 },
  "O3": { "x": -8.8647, "y": 166.5673, "r": 48.5667, "start": 0.4878, "end": 0.0349 },
  "O4": { "x": 72.5338, "y": 148.8331, "r": 32.1633, "start": -3.1067, "end": -2.6485 },
  "O5": { "x": 54.7726, "y": 139.2885, "r": 12, "start": 3.6347, "end": -1.6581 },
  "I1": { "x": 51.5879, "y": 135.6, "r": 10, "start": -0.2014, "end": -1.8208 },
  "I2": { "x": 52.0827, "y": 137.5378, "r": 12, "start": -1.8208, "end": -2.5415 },
  "I3": { "x": 75.2155, "y": 153.3661, "r": 40.0296, "start": -2.5415, "end": -3.1067 },
  "I4": { "x": -18.9295, "y": 169.2048, "r": 53.5053, "start": -6.2483, "end": -5.9487 },
  "I5": { "x": 23.109, "y": 183.8159, "r": 9, "start": 0.3345, "end": 1.3963 },
};

describe('f-hole contours', () => {
  it('solves the default violin to the geometry it was pinned at', () => {
    expect(geometryDiff(round4(solve(false).fHoles), PLAIN, 1e-9)).toEqual([]);
  });

  it('solves the same hole with both shoulders extended and a stem-arc radius pinned', () => {
    expect(geometryDiff(round4(solve(true).fHoles), SHAPED, 1e-9)).toEqual([]);
  });
});

/** The two edges as they are drawn, in the order the contour runs. */
const edgesOf = (p: EnricoCerutiParams): { name: string; chain: (Arc | null)[] }[] => {
  const f = p.fHoles!;
  return [
    { name: 'outer', chain: [f.O1, f.O2, f.O3, f.O4, f.O5] },
    { name: 'inner', chain: [f.I1, f.I2, f.I3, f.I4, f.I5] },
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
      for (const [eye, shoulder, rise, side] of [[f.UEye!, f.O1!, f.URise!, 1], [f.LEye!, f.I1!, f.LRise!, -1]] as const) {
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
      for (const [eye, otherEye, cut, tip] of [[f.UEye!, f.LEye!, f.UCut!, f.UTip!], [f.LEye!, f.UEye!, f.LCut!, f.LTip!]] as const) {
        const foot = pointOnCircle(eye, Math.atan2(otherEye.y - eye.y, otherEye.x - eye.x) + cut.angleOnEye!);

        expect(dist(foot, tip)).toBeCloseTo(cut.length!, 6);
        // and the cut runs the way `slope` says, read straight off the plate
        const ran = Math.atan2(tip.y - foot.y, tip.x - foot.x);
        expect(Math.abs(normalizeRadians(ran - cut.slope! + Math.PI) - Math.PI)).toBeLessThan(1e-6);
      }
    });

    it(`lands each wing on the tip it is hung from, ${label}`, () => {
      const f = solve(shaped).fHoles!;
      // O's wing reaches the lower tip, and I's the upper
      for (const [wing, tip] of [[f.O5!, f.LTip!], [f.I5!, f.UTip!]] as const) {
        expect(dist(pointOnCircle(wing, wing.end), tip)).toBeCloseTo(0, 6);
      }
    });

  }

  it('holds a stem arc and a stem R to the radii they were pinned at, once shaped', () => {
    const bootstrap = solve(false).fHoles!;
    const f = solve(true).fHoles!;

    expect(f.O3!.r).toBeCloseTo(bootstrap.O3!.r + 8, 6);
    expect(f.I3!.r).toBeCloseTo(bootstrap.I3!.r - 5, 6);
    expect(f.I4!.r).toBeCloseTo(bootstrap.I4!.r + 4, 6);
    expect(f.O4!.r).toBeCloseTo(bootstrap.O4!.r - 6, 6);
  });
});

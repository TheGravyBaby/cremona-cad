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

const solve = (compound: boolean): EnricoCerutiParams => {
  const p = defaultViolin();
  p.options.FUArmDoubleArc = compound;
  p.options.FLArmDoubleArc = compound;
  p.fHoles = defaultFHolePlacement(p);
  calculateFholeContours(p);
  return p;
};

/** The frozen numbers are 4dp, so compare at 4dp. */
const round4 = (v: unknown): unknown =>
  typeof v === 'number' ? Math.round(v * 1e4) / 1e4
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round4(x)]))
  : v;

const PLAIN = {
  "upper": {
    "eye": {
      "x": 23.9865,
      "y": 186.64,
      "r": 3.2
    },
    "rise": 3.84,
    "shoulder": {
      "x": 28.6895,
      "y": 185.68,
      "r": 8,
      "start": 2.9402,
      "end": 1.5708
    },
    "arm": {
      "x": 28.6895,
      "y": 184.68,
      "r": 9,
      "start": 1.5708,
      "end": 0.5236
    },
    "arm2": null,
    "wing": {
      "x": 25.4419,
      "y": 183.4165,
      "r": 9,
      "start": 0.3491,
      "end": 1.3963
    },
    "cut": {
      "at": 2.0944,
      "slope": 1.0472,
      "length": 3.2
    },
    "tip": {
      "x": 27.0048,
      "y": 192.2798
    }
  },
  "lower": {
    "eye": {
      "x": 57.7465,
      "y": 136,
      "r": 4
    },
    "rise": 4.8,
    "shoulder": {
      "x": 51.8677,
      "y": 137.2,
      "r": 10,
      "start": -0.2014,
      "end": -1.5708
    },
    "arm": {
      "x": 51.8677,
      "y": 139.2,
      "r": 12,
      "start": -1.5708,
      "end": -2.618
    },
    "arm2": null,
    "wing": {
      "x": 55.0194,
      "y": 140.9046,
      "r": 12,
      "start": -2.7053,
      "end": -1.6581
    },
    "cut": {
      "at": 2.0944,
      "slope": -2.0944,
      "length": 4
    },
    "tip": {
      "x": 53.9735,
      "y": 128.9503
    }
  },
  "stem": {
    "center": {
      "x": 38.9198,
      "y": 160.2533
    },
    "width": 4.6933,
    "angle": 1.6232,
    "outerUpper": {
      "x": 10.5626,
      "y": 174.2145,
      "r": 29.9311,
      "start": 0.5236,
      "end": 0.0524
    },
    "outerLower": {
      "x": 63.9993,
      "y": 145.092,
      "r": 21.9082,
      "start": -3.0892,
      "end": -2.7053
    },
    "innerUpper": {
      "x": 6.0083,
      "y": 176.3433,
      "r": 29.6808,
      "start": -6.2308,
      "end": -5.9341
    },
    "innerLower": {
      "x": 69.1237,
      "y": 149.1628,
      "r": 31.9255,
      "start": -2.618,
      "end": -3.0892
    }
  }
};

const COMPOUND = {
  "upper": {
    "eye": {
      "x": 23.9865,
      "y": 186.64,
      "r": 3.2
    },
    "rise": 3.84,
    "shoulder": {
      "x": 28.6895,
      "y": 185.68,
      "r": 8,
      "start": 2.9402,
      "end": 1.5708
    },
    "arm": {
      "x": 28.6895,
      "y": 185.9657,
      "r": 7.7143,
      "start": 1.5708,
      "end": 0.8727
    },
    "arm2": {
      "x": 26.2101,
      "y": 183.011,
      "r": 11.5714,
      "start": 0.8727,
      "end": 0.5236
    },
    "wing": {
      "x": 25.4419,
      "y": 183.4165,
      "r": 9,
      "start": 0.3491,
      "end": 1.3963
    },
    "cut": {
      "at": 2.0944,
      "slope": 1.0472,
      "length": 3.2
    },
    "tip": {
      "x": 27.0048,
      "y": 192.2798
    }
  },
  "lower": {
    "eye": {
      "x": 57.7465,
      "y": 136,
      "r": 4
    },
    "rise": 4.8,
    "shoulder": {
      "x": 51.8677,
      "y": 137.2,
      "r": 10,
      "start": -0.2014,
      "end": -1.5708
    },
    "arm": {
      "x": 51.8677,
      "y": 137.4857,
      "r": 10.2857,
      "start": -1.5708,
      "end": -2.2689
    },
    "arm2": {
      "x": 55.1734,
      "y": 141.4254,
      "r": 15.4286,
      "start": -2.2689,
      "end": -2.618
    },
    "wing": {
      "x": 55.0194,
      "y": 140.9046,
      "r": 12,
      "start": -2.7053,
      "end": -1.6581
    },
    "cut": {
      "at": 2.0944,
      "slope": -2.0944,
      "length": 4
    },
    "tip": {
      "x": 53.9735,
      "y": 128.9503
    }
  },
  "stem": {
    "center": {
      "x": 38.9198,
      "y": 160.2533
    },
    "width": 4.6933,
    "angle": 1.6232,
    "outerUpper": {
      "x": 8.1481,
      "y": 172.5828,
      "r": 32.4277,
      "start": 0.5236,
      "end": 0.0524
    },
    "outerLower": {
      "x": 63.9993,
      "y": 145.092,
      "r": 21.9082,
      "start": -3.0892,
      "end": -2.7053
    },
    "innerUpper": {
      "x": 6.0083,
      "y": 176.3433,
      "r": 29.6808,
      "start": -6.2308,
      "end": -5.9341
    },
    "innerLower": {
      "x": 72.3431,
      "y": 151.3383,
      "r": 35.2544,
      "start": -2.618,
      "end": -3.0892
    }
  }
};

describe('f-hole contours', () => {
  it('solves the default violin to the geometry it was pinned at', () => {
    expect(geometryDiff(round4(solve(false).fHoles), PLAIN, 1e-9)).toEqual([]);
  });

  it('solves the same hole with both arms split', () => {
    expect(geometryDiff(round4(solve(true).fHoles), COMPOUND, 1e-9)).toEqual([]);
  });
});

/** The two edges as they are drawn, in the order the contour runs. */
const edgesOf = (p: EnricoCerutiParams): { name: string; chain: (Arc | null)[] }[] => {
  const f = p.fHoles!;
  return [
    { name: 'outer', chain: [f.upper.shoulder, f.upper.arm, f.upper.arm2, f.stem.outerUpper, f.stem.outerLower, f.lower.wing] },
    { name: 'inner', chain: [f.lower.shoulder, f.lower.arm, f.lower.arm2, f.stem.innerLower, f.stem.innerUpper, f.upper.wing] },
  ];
};

describe('f-hole contour properties', () => {
  for (const compound of [false, true]) {
    const label = compound ? 'with the arms split' : 'with plain arms';

    it(`runs every joint tangent-continuous, ${label}`, () => {
      for (const { name, chain } of edgesOf(solve(compound))) {
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
      const f = solve(compound).fHoles!;
      for (const [end, side] of [[f.upper, 1], [f.lower, -1]] as const) {
        const eye = end.eye!, shoulder = end.shoulder!;

        // tangent internally to the eye: centres one radius difference apart
        expect(dist(shoulder, eye)).toBeCloseTo(shoulder.r - eye.r, 6);
        // and its start is that very tangency, so the eye rim hands the outline over
        expect(dist(pointOnCircle(shoulder, shoulder.start), pointOnCircle(eye, shoulder.start))).toBeCloseTo(0, 6);
        // its apex sits on the bound the rise sets
        expect(pointOnCircle(shoulder, shoulder.end).y).toBeCloseTo(eye.y + side * (eye.r + end.rise!), 6);
      }
    });

    it(`puts each tip one cut length off its own eye, ${label}`, () => {
      const f = solve(compound).fHoles!;
      for (const [end, other] of [[f.upper, f.lower], [f.lower, f.upper]] as const) {
        const eye = end.eye!, cut = end.cut!;
        const foot = pointOnCircle(eye, Math.atan2(other.eye!.y - eye.y, other.eye!.x - eye.x) + cut.angleOnEye!);

        expect(dist(foot, end.tip!)).toBeCloseTo(cut.length!, 6);
        // and the cut runs the way `slope` says, read straight off the plate
        const ran = Math.atan2(end.tip!.y - foot.y, end.tip!.x - foot.x);
        expect(Math.abs(normalizeRadians(ran - cut.slope! + Math.PI) - Math.PI)).toBeLessThan(1e-6);
      }
    });

    it(`lands each wing on the tip it is hung from, ${label}`, () => {
      const f = solve(compound).fHoles!;
      // the outer edge's wing is drawn at the lower end, and vice versa
      for (const [wing, tip] of [[f.lower.wing!, f.lower.tip!], [f.upper.wing!, f.upper.tip!]] as const) {
        expect(dist(pointOnCircle(wing, wing.end), tip)).toBeCloseTo(0, 6);
      }
    });
  }
});

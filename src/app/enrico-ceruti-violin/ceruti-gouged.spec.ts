import {
  gougeHalfWidth, gougeProfileSlope, gougeProfileZ, gougedCrossKnots, makeGougedCrossResolver,
  solveGougedCrossSection, solveGougedTakeoff,
} from './ceruti-gouged';
import { GougedCrossParams, GougedCrossShape } from './ceruti-types';

/**
 * The gouged model's two load-bearing claims, in the order they matter:
 *
 *  1. the channel section is decided by the tool alone, and
 *  2. where the arch meets it is *solved*, not entered.
 *
 * The second is what keeps this model from costing the maker more parameters
 * than the classic one, so it is worth pinning rather than eyeballing.
 */

// A gouge that cuts 4mm wide at 1.2mm deep — the default seeding for a violin.
const R = 2.2667;
const D = 1.2;

describe('gouge section', () => {
  it('spans the chord its own sweep and depth imply', () => {
    // w = sqrt(2RD - D²); with these numbers exactly 2mm, so a 4mm channel.
    expect(gougeHalfWidth(R, D)).toBeCloseTo(2, 3);
  });

  it('reaches full depth at the trough and plate level at both edges', () => {
    const w = gougeHalfWidth(R, D);
    expect(gougeProfileZ(0, R, D)).toBeCloseTo(-D, 9);
    expect(gougeProfileZ(w, R, D)).toBeCloseTo(0, 9);
    expect(gougeProfileZ(-w, R, D)).toBeCloseTo(0, 9);
  });

  it('is flat outside the cut, so the land either side stays land', () => {
    const w = gougeHalfWidth(R, D);
    expect(gougeProfileZ(w + 0.5, R, D)).toBe(0);
    expect(gougeProfileSlope(w + 0.5, R, D)).toBe(0);
  });

  it('reports a slope matching its own finite difference', () => {
    // The solve matches the arch against this slope, so an analytic/numeric
    // disagreement here would be a silently wrong tangency everywhere.
    for (const s of [0.2, 0.8, 1.4, 1.9]) {
      const e = 1e-6;
      const fd = (gougeProfileZ(s + e, R, D) - gougeProfileZ(s - e, R, D)) / (2 * e);
      expect(gougeProfileSlope(s, R, D)).toBeCloseTo(fd, 5);
    }
  });

  it('refuses a tool that cannot reach its own depth', () => {
    expect(gougeHalfWidth(1, 2)).toBe(0);
    expect(gougeProfileZ(0, 1, 2)).toBe(0);
  });
});

describe('solveGougedTakeoff', () => {
  /** A stand-in arch that always arrives at a fixed grade, so the root is checkable by hand. */
  const constantSlope = (grade: number) => () => grade;

  it('lands where the channel matches the arch grade', () => {
    const grade = 0.187; // a violin long arch's takeoff slope over a ~348mm span
    const t = solveGougedTakeoff(R, D, constantSlope(grade));
    expect(t).not.toBeNull();
    // Tangency is the whole point: the channel's slope at the contact must be
    // the grade the arch arrived with.
    expect(gougeProfileSlope(t!.contactS, R, D)).toBeCloseTo(grade, 6);
    // s / sqrt(R² − s²) = grade  ⇒  s = grade·R / sqrt(1 + grade²)
    expect(t!.contactS).toBeCloseTo((grade * R) / Math.sqrt(1 + grade * grade), 6);
  });

  it('reports a takeoff depth on the channel it contacts', () => {
    const t = solveGougedTakeoff(R, D, constantSlope(0.187))!;
    expect(t.takeoffDepth).toBeCloseTo(-gougeProfileZ(t.contactS, R, D), 9);
    // A shallow arch contacts near the trough, so it takes off nearly full depth.
    expect(t.takeoffDepth).toBeGreaterThan(0);
    expect(t.takeoffDepth).toBeLessThanOrEqual(D);
  });

  it('contacts further out as the arch arrives steeper', () => {
    // The physical claim behind the sliding contact point: a steeper arch meets
    // the channel higher up its inner flank, eating less of it.
    const shallow = solveGougedTakeoff(R, D, constantSlope(0.2))!;
    const steep = solveGougedTakeoff(R, D, constantSlope(1.0))!;
    expect(steep.contactS).toBeGreaterThan(shallow.contactS);
    expect(steep.takeoffDepth).toBeLessThan(shallow.takeoffDepth);
  });

  it('returns null rather than a bad root when no tangency exists', () => {
    const w = gougeHalfWidth(R, D);
    // Steeper than the channel ever gets, so the arch can never come tangent to it.
    const beyond = gougeProfileSlope(w * (1 - 1e-3), R, D) * 2;
    expect(solveGougedTakeoff(R, D, constantSlope(beyond))).toBeNull();
  });

  it('returns null for a tool that cuts nothing', () => {
    expect(solveGougedTakeoff(1, 2, constantSlope(0.2))).toBeNull();
  });

  it('handles an arch whose grade depends on where it lands', () => {
    // The real callers do this: moving the contact changes the span and the
    // takeoff depth, which changes the slope the arch arrives with. The solver
    // brackets by scanning rather than assuming that stays monotone.
    const t = solveGougedTakeoff(R, D, (takeoffDepth, contactS) => 0.15 + 0.3 * takeoffDepth - 0.05 * contactS);
    expect(t).not.toBeNull();
    const arrived = 0.15 + 0.3 * t!.takeoffDepth - 0.05 * t!.contactS;
    expect(gougeProfileSlope(t!.contactS, R, D)).toBeCloseTo(arrived, 5);
  });
});

describe('gougedCrossKnots', () => {
  const shape = (points: GougedCrossShape['points']): GougedCrossShape => ({ type: 'gouged', points });

  it('keeps both coordinates fractional, so the shape scales with the station', () => {
    expect(gougedCrossKnots(shape([{ x: 0.45, z: 0.62, mirror: true }]), 1))
      .toEqual([{ x: 0.45, z: 0.62 }]);
  });

  it('mirrors a knot onto both sides', () => {
    const s = shape([{ x: 0.45, z: 0.62, mirror: true }]);
    expect(gougedCrossKnots(s, 1)).toEqual(gougedCrossKnots(s, -1));
  });

  it('confines an unmirrored knot to its own side', () => {
    // The only source of asymmetry in this model, so it has to be exact.
    const s = shape([{ x: -0.4, z: 0.8 }, { x: 0.6, z: 0.3 }]);
    expect(gougedCrossKnots(s, -1)).toEqual([{ x: 0.4, z: 0.8 }]);
    expect(gougedCrossKnots(s, 1)).toEqual([{ x: 0.6, z: 0.3 }]);
  });

  it('sorts outward and collapses knots landing on one another', () => {
    const s = shape([{ x: 0.7, z: 0.3 }, { x: 0.45, z: 0.62 }, { x: 0.45, z: 0.1 }]);
    expect(gougedCrossKnots(s, 1).map(k => k.x)).toEqual([0.45, 0.7]);
  });
});

describe('makeGougedCrossResolver', () => {
  const BODY = 356;

  it('holds the base shape everywhere when no station is set', () => {
    const cross: GougedCrossParams = { type: 'gouged', points: [{ x: 0.45, z: 0.62, mirror: true }] };
    const resolve = makeGougedCrossResolver(cross, BODY);
    for (const y of [10, 100, 178, 300]) {
      expect(resolve(y).right).toEqual([{ x: 0.45, z: 0.62 }]);
    }
  });

  it('ramps between stations without overshooting either', () => {
    // Same shape-preserving guarantee the classic resolvers carry: an
    // interpolated shape never swings outside the values the maker entered.
    const cross: GougedCrossParams = {
      type: 'gouged',
      points: [{ x: 0.45, z: 0.62, mirror: true }],
      stations: [{ y: 178, type: 'gouged', points: [{ x: 0.45, z: 0.3, mirror: true }] }],
    };
    const resolve = makeGougedCrossResolver(cross, BODY);
    expect(resolve(178).right[0].z).toBeCloseTo(0.3, 6);
    expect(resolve(0).right[0].z).toBeCloseTo(0.62, 6); // base anchors both ends
    for (let y = 0; y <= BODY; y += 4) {
      const z = resolve(y).right[0].z;
      expect(z).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(z).toBeLessThanOrEqual(0.62 + 1e-9);
    }
  });

  it('carries a station knot position the base does not have', () => {
    // Two stations can differ in knot count entirely, which is why the resolver
    // ramps over the union of their positions rather than pairing them up.
    const cross: GougedCrossParams = {
      type: 'gouged',
      points: [{ x: 0.45, z: 0.62, mirror: true }],
      stations: [{ y: 178, type: 'gouged', points: [{ x: 0.45, z: 0.62, mirror: true }, { x: 0.8, z: 0.1, mirror: true }] }],
    };
    const resolve = makeGougedCrossResolver(cross, BODY);
    expect(resolve(178).right.map(k => k.x)).toEqual([0.45, 0.8]);
    expect(resolve(178).right[1].z).toBeCloseTo(0.1, 6);
    // The base has nothing at 0.8, so it holds its outermost height flat out there.
    expect(resolve(0).right[1].z).toBeCloseTo(0.62, 6);
  });
});

describe('solveGougedCrossSection', () => {
  const R = 2.2667;
  const D = 1.2;
  const ARCH = 15;
  const HALF = 100; // channel centerline half-chord at a wide station
  const row = { left: [{ x: 0.45, z: 0.6 }], right: [{ x: 0.45, z: 0.6 }] };

  it('meets the channel tangentially on both sides', () => {
    const s = solveGougedCrossSection(ARCH, HALF, R, D, row)!;
    expect(s).not.toBeNull();
    for (const side of [s.left!, s.right!]) {
      expect(gougeProfileSlope(side.contactS, R, D)).toBeCloseTo(side.slope, 9);
      expect(side.contactS).toBeGreaterThan(0);
      expect(side.contactS).toBeLessThan(gougeHalfWidth(R, D));
    }
  });

  it('is symmetric when the template is', () => {
    const s = solveGougedCrossSection(ARCH, HALF, R, D, row)!;
    expect(s.left!.contactS).toBeCloseTo(s.right!.contactS, 9);
    for (const x of [10, 45, 80, 99]) {
      expect(s.zAt(-x)).toBeCloseTo(s.zAt(x), 9);
    }
  });

  it('lands the contacts differently when the template is not', () => {
    // The observable this model exists for: a crisp constant channel outer
    // edge, with the recurve shoulder inside it varying.
    const s = solveGougedCrossSection(ARCH, HALF, R, D, {
      left: [{ x: 0.45, z: 0.87 }], right: [{ x: 0.45, z: 0.27 }],
    })!;
    expect(s.left!.contactS).not.toBeCloseTo(s.right!.contactS, 3);
  });

  it('crowns at the arch height and reaches the channel trough', () => {
    const s = solveGougedCrossSection(ARCH, HALF, R, D, row)!;
    expect(s.zAt(0)).toBeCloseTo(ARCH, 9);
    // The trough sits at the centerline half-chord, full depth below the plate.
    expect(s.zAt(HALF)).toBeCloseTo(-D, 9);
    // And the channel's outer edge returns to plate level.
    expect(s.zAt(HALF + gougeHalfWidth(R, D))).toBeCloseTo(0, 9);
  });

  it('has no seam where the arch meets the channel', () => {
    // The transition is the template spline's own last segment, so there is no
    // join to line up — a step here would mean the two halves disagree.
    const s = solveGougedCrossSection(ARCH, HALF, R, D, row)!;
    const xEnd = HALF - s.right!.contactS;
    expect(s.zAt(xEnd - 1e-6)).toBeCloseTo(s.zAt(xEnd + 1e-6), 6);
  });

  it('returns null where the channel has no room', () => {
    expect(solveGougedCrossSection(ARCH, 1, R, D, row)).toBeNull();
    // Crown down at the trough: nothing left for the channel to run into.
    expect(solveGougedCrossSection(-D, HALF, R, D, row)).toBeNull();
  });

  it('still solves where the crown sits below plate level', () => {
    // The recurve bands near the body caps, where the long arch has not yet
    // climbed clear of its own takeoff. Leaving these unsolved rendered a flat
    // ring around both caps with a straight seam where the height crossed zero.
    for (const archH of [-0.9, -0.4, 0, 0.4]) {
      const s = solveGougedCrossSection(archH, HALF, R, D, row);
      expect(s).not.toBeNull();
      expect(s!.zAt(0)).toBeCloseTo(archH, 9);
      // Still a dish: the trough is the low point, the crown the high one.
      expect(s!.zAt(HALF)).toBeCloseTo(-D, 6);
      expect(s!.zAt(0)).toBeGreaterThan(s!.zAt(HALF));
    }
  });

  it('keeps knots between the takeoff and the crown whichever side of plate level it is', () => {
    // Heights are measured up from the takeoff, not up from the plate surface,
    // so a negative crown cannot lift a knot above it and invert the section.
    for (const archH of [-0.8, 12]) {
      const s = solveGougedCrossSection(archH, HALF, R, D, row)!;
      for (let x = 0; x <= HALF - s.right!.contactS; x += 1) {
        expect(s.zAt(x)).toBeLessThanOrEqual(archH + 1e-9);
        expect(s.zAt(x)).toBeGreaterThanOrEqual(-D - 1e-9);
      }
    }
  });
});

describe('the crown', () => {
  const R = 2.2667;
  const D = 1.2;
  const ARCH = 15;
  const HALF = 100;
  const knots = [{ x: 0.45, z: 0.6 }, { x: 0.7, z: 0.27 }];

  /**
   * The crown must be a smooth maximum, not a ridge. It is an interior knot of
   * one full-width spline, so Hyman's filter zeroes its slope where the secants
   * change sign; built as two one-sided splines instead, each would arrive with
   * a natural end slope and the arch would peak in a sharp corner.
   */
  /**
   * The crown's one-sided slopes, each extrapolated to the knot itself.
   *
   * A central difference straddling x = 0 will not do. Where the monotonicity
   * limiter bites — and at the crown it always does, that being the point — the
   * join is C¹ but not C², so a difference spanning both segments carries an
   * O(ε) bias proportional to the curvature step and reads a tilt that is not
   * there. Each side is measured on its own and extrapolated instead:
   * d(ε) → z'(0) + z''(0)·ε/2, so 2·d(ε) − d(2ε) cancels the linear term.
   */
  const crownSlopes = (s: { zAt: (x: number) => number }): [number, number] => {
    const oneSided = (dir: -1 | 1): number => {
      const d = (e: number) => (s.zAt(dir * e) - s.zAt(0)) / (dir * e);
      return 2 * d(0.02) - d(0.04);
    };
    return [oneSided(-1), oneSided(1)];
  };

  it('is flat at the centerline', () => {
    const s = solveGougedCrossSection(ARCH, HALF, R, D, { left: knots, right: knots })!;
    for (const slope of crownSlopes(s)) expect(slope).toBeCloseTo(0, 6);
  });

  it('is flat at the centerline even when the two sides differ', () => {
    // Asymmetry must not tilt the crown: a nonzero slope at x = 0 would put the
    // real high spot off the centerline and the entered arch height would stop
    // describing the plate.
    const s = solveGougedCrossSection(ARCH, HALF, R, D, {
      left: [{ x: 0.4, z: 0.87 }],
      right: [{ x: 0.6, z: 0.33 }],
    })!;
    for (const slope of crownSlopes(s)) expect(slope).toBeCloseTo(0, 6);
  });

  it('is the highest point of the section', () => {
    const s = solveGougedCrossSection(ARCH, HALF, R, D, {
      left: [{ x: 0.4, z: 0.87 }],
      right: [{ x: 0.6, z: 0.33 }],
    })!;
    let max = -Infinity;
    for (let x = -HALF; x <= HALF; x += 0.25) max = Math.max(max, s.zAt(x));
    expect(max).toBeCloseTo(ARCH, 6);
  });

  it('rounds over rather than cornering', () => {
    // A ridge shows up as the section falling away linearly from the apex; a
    // real crown falls away quadratically, so the drop at 2ε is ~4× that at ε.
    const s = solveGougedCrossSection(ARCH, HALF, R, D, { left: knots, right: knots })!;
    const e = 0.5;
    const ratio = (ARCH - s.zAt(2 * e)) / (ARCH - s.zAt(e));
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
  });
});

import {
  cornerGougeZ, gougeHalfWidth, gougeProfileSlope, gougeProfileZ, gougedCrossGuide, gougedCrossKnots,
  chordTrust, crownOffsetTrust, GougedCrossSection, gougedCrossKnotX, makeGougedCrossResolver,
  nearestGougedCrossShape,
  solveGougedCrossSection,
  solveGougedTakeoff,
} from './ceruti-gouged';
import { makeMonotoneSpline } from '../helpers/draftMath';
import { trochoidNorm } from '../helpers/svgPathMath';
import {
  GougedCrossCycloidShape, GougedCrossParams, GougedCrossShape, GougedCrossSplineShape,
} from './ceruti-types';

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

describe('cornerGougeZ', () => {
  const R = 14, D = 1.2;
  const w = gougeHalfWidth(R, D);

  it('is the same cut, re-anchored so its outer edge sits on the boundary', () => {
    // The corner pass differs from the channel in one thing only: what it is
    // measured from. Same tool, same depth, same arc — the outer flank starts
    // where the land ends instead of a half-width further in.
    expect(cornerGougeZ(0, R, D)).toBeCloseTo(0, 12);
    expect(cornerGougeZ(w, R, D)).toBeCloseTo(-D, 12);
    expect(cornerGougeZ(2 * w, R, D)).toBeCloseTo(0, 12);
    for (const d of [0.4, 1.3, 2.7, 4.1]) {
      expect(cornerGougeZ(d, R, D)).toBeCloseTo(gougeProfileZ(d - w, R, D), 12);
    }
  });

  it('is inert past its own reach, so composing it by minimum cannot bite there', () => {
    // What lets the caller take an unconditional minimum instead of masking the
    // band by hand: outside the cut it returns plate level, and the channel it
    // is composed against is never above plate level.
    for (const d of [-3, -0.01, 2 * w + 0.01, 2 * w + 5]) {
      expect(cornerGougeZ(d, R, D)).toBe(0);
    }
  });
});

describe('gougedCrossKnots', () => {
  const shape = (points: GougedCrossSplineShape['points']): GougedCrossSplineShape => ({ type: 'gouged', points });

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

describe('the trochoid crown', () => {
  const cyc = (d: number, pct: number): GougedCrossCycloidShape => ({ type: 'gouged-cycloid', d, pct });

  /** The trochoid's own half, as fractional crown coordinates — what the knots are sampled from. */
  const exact = (d: number, pct: number, xFrac: number): number => {
    // Bisect the sampler's own map rather than inverting it: monotone in frac.
    let lo = 0;
    let hi = 0.5;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (1 - 2 * trochoidNorm(mid, d, pct).x > xFrac) lo = mid; else hi = mid;
    }
    return trochoidNorm((lo + hi) / 2, d, pct).z;
  };

  it('runs from the crown outward but stops short of the channel', () => {
    // The last stretch is the transition and belongs to the solve. Authoring a
    // knot out there would also put one wherever the takeoff lands, and two
    // knots at one position carrying two heights is what the spline cannot do.
    const knots = gougedCrossKnots(cyc(0.4, 0.9), 1);
    expect(knots[0].x).toBeGreaterThan(0);
    expect(knots[knots.length - 1].x).toBeLessThan(1);
    expect(knots[knots.length - 1].x).toBeGreaterThan(0.9);
  });

  it('descends monotonically from the crown', () => {
    const knots = gougedCrossKnots(cyc(0.7, 0.85), 1);
    for (let i = 1; i < knots.length; i++) {
      expect(knots[i].x).toBeGreaterThan(knots[i - 1].x);
      expect(knots[i].z).toBeLessThan(knots[i - 1].z);
    }
  });

  it('gives both sides the same shape', () => {
    const s = cyc(0.4, 0.9);
    expect(gougedCrossKnots(s, 1)).toEqual(gougedCrossKnots(s, -1));
  });

  /**
   * The knots are re-splined downstream, so what the surface carries is a
   * monotone cubic *through* the trochoid rather than the trochoid itself. This
   * bounds the difference — if it ever grew, the panel would be quietly drawing
   * one curve and cutting another.
   */
  it('is reproduced by the spline through its own knots', () => {
    // The looser bound is for d→1 only, where the trochoid approaches a cusp:
    // unbounded curvature at the outer end, so the sampling converges about an
    // order slower there. Even so it is 2e-3 of the arch height — three
    // hundredths of a millimetre on a violin top, under the export grid.
    for (const [d, pct, tol] of [[0, 1, 1e-3], [0.4, 0.9, 1e-3], [0.6, 0.3, 1e-3], [1, 0.85, 3e-3]] as const) {
      const knots = gougedCrossKnots(cyc(d, pct), 1);
      const f = makeMonotoneSpline([0, ...knots.map(k => k.x)], [1, ...knots.map(k => k.z)]);
      // Only over the sampled span. Past the last knot the shape is deliberately
      // not the trochoid — that is the transition, which the tangency solve
      // replaces with a run into the channel.
      const last = knots[knots.length - 1].x;
      let worst = 0;
      for (let i = 0; i <= 200; i++) {
        const x = (i / 200) * last;
        worst = Math.max(worst, Math.abs(f(x) - exact(d, pct, x)));
      }
      expect(worst).toBeLessThan(tol);
    }
  });

  it('meets the channel like any other crown', () => {
    const row = { left: gougedCrossKnots(cyc(0.4, 0.9), -1), right: gougedCrossKnots(cyc(0.4, 0.9), 1) };
    const s = solveGougedCrossSection(15, 100, R, D, row)!;
    expect(s).not.toBeNull();
    expect(gougeProfileSlope(s.right!.contactS, R, D)).toBeCloseTo(s.right!.slope, 9);
    expect(s.zAt(0)).toBeCloseTo(15, 9);
  });

  /**
   * The knob that earns its place. Classically `pct` clips the cusp so the arch
   * has a grade for a channel built to match it; here the channel is already
   * cut, so the grade decides *where along its flank* the two can meet. A
   * flatter run-out has to find a flatter part of the channel, which is nearer
   * the trough — i.e. a smaller contact `s`.
   */
  const contactAt = (d: number, pct: number, archH = 15, half = 100): number | null => {
    const knots = gougedCrossKnots(cyc(d, pct), 1);
    return solveGougedCrossSection(archH, half, R, D, { left: knots, right: knots })?.right?.contactS ?? null;
  };

  it('brings the contact outward as the run-out steepens', () => {
    // At low d the trochoid's outer end flattens as the window opens, so the
    // contact retreats toward the trough — the only part of the channel flat
    // enough to meet it. (At d near 1 the end is a cusp instead, and the
    // dependence reverses; that is the curve, not the solve.)
    expect(contactAt(0.4, 0.5)!).toBeGreaterThan(contactAt(0.4, 0.75)!);
    expect(contactAt(0.4, 0.75)!).toBeGreaterThan(contactAt(0.4, 0.95)!);
  });

  /**
   * The contact has to move *continuously* with the crown, and this is the test
   * that would have caught the way it first didn't.
   *
   * The crown's knots were originally laid out along the channel, with any that
   * fell outside the takeoff discarded. The solve moves the takeoff inward
   * hunting its root, so it passes knots, and each one leaving the spline steps
   * the slope the arch arrives with. Bisection on a staircase converges onto a
   * riser and calls it a root: the sweep below came out ragged, with stations
   * either pinned to a drop point or reporting no tangency at all between two
   * that solved fine. Anchoring the knots to the takeoff instead of the channel
   * is what removed the steps.
   */
  it('moves the contact smoothly as the crown changes', () => {
    for (const d of [0, 0.4, 0.8, 1]) {
      let prev: number | null = null;
      for (let pct = 0.3; pct <= 0.98; pct += 0.02) {
        const s = contactAt(d, pct);
        expect(s).not.toBeNull();
        // A 2% step in the window cannot move the contact by a tenth of the
        // channel's half-width unless something discontinuous is happening.
        if (prev !== null) expect(Math.abs(s! - prev)).toBeLessThan(0.1 * gougeHalfWidth(R, D));
        prev = s;
      }
    }
  });

  it('solves on a narrow station as well as a wide one', () => {
    // The narrow stations are where the takeoff sits furthest in as a fraction
    // of the half-width, so they are where knots crowding it used to bite first.
    for (const d of [0, 0.4, 0.8, 1]) {
      expect(contactAt(d, 0.9, 15, 55)).not.toBeNull();
      expect(contactAt(d, 0.9, 2, 100)).not.toBeNull();
    }
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
    // The base has nothing at 0.8, so it reports what its own curve does out
    // there: on down toward the takeoff, which every shape reaches at z = 0.
    const filled = resolve(0).right[1].z;
    expect(filled).toBeGreaterThan(0);
    expect(filled).toBeLessThan(0.62);
  });

  it('does not flatten the crown where one shape has a knot the other lacks', () => {
    // The plateau this pins: filling a missing column by holding the shape's
    // outermost height claims it is level out there. Two ramped columns then
    // arrive at nearly the same height and the monotone spline draws — quite
    // correctly — a flat shoulder between them, from a shape with one knot.
    const cross: GougedCrossParams = {
      type: 'gouged',
      points: [{ x: 0.7, z: 0.4, mirror: true }],
      stations: [{ y: 103, type: 'gouged', points: [{ x: 0.41, z: 0.65, mirror: true }] }],
    };
    const resolve = makeGougedCrossResolver(cross, BODY);
    for (let y = 0; y <= BODY; y += 8) {
      const [inner, outer] = resolve(y).right;
      expect(outer.z).toBeLessThan(inner.z - 1e-3);
    }
  });
});

describe('nearestGougedCrossShape', () => {
  const BODY = 356;
  const base: GougedCrossParams = {
    type: 'gouged',
    points: [{ x: 0.45, z: 0.62, mirror: true }],
    stations: [
      { y: 120, type: 'gouged', points: [{ x: 0.45, z: 0.3, mirror: true }] },
      { y: 240, type: 'gouged', points: [{ x: 0.45, z: 0.9, mirror: true }] },
    ],
  };

  /** The one field these fixtures differ in. */
  const heightOf = (shape: GougedCrossShape) => (shape as GougedCrossSplineShape).points[0].z;

  it('picks the station the cursor is nearest', () => {
    expect(heightOf(nearestGougedCrossShape(base, 118, BODY))).toBeCloseTo(0.3, 6);
    expect(heightOf(nearestGougedCrossShape(base, 200, BODY))).toBeCloseTo(0.9, 6);
  });

  it('falls back to the base shape near the body ends, which it anchors', () => {
    expect(heightOf(nearestGougedCrossShape(base, 5, BODY))).toBeCloseTo(0.62, 6);
    expect(heightOf(nearestGougedCrossShape(base, BODY - 5, BODY))).toBeCloseTo(0.62, 6);
  });

  it('is the base shape everywhere when no station is set', () => {
    const plain: GougedCrossParams = { type: 'gouged', points: [{ x: 0.45, z: 0.62, mirror: true }] };
    for (const y of [10, 100, 178, 300]) expect(nearestGougedCrossShape(plain, y, BODY)).toBe(plain);
  });

  it('hands back a station as a copy, so the panel cannot edit one by browsing past it', () => {
    // normalizeCrossArchStations clamps into the body and returns copies. The
    // base shape is passed straight through, though, which is why the panel
    // treats everything from here as read-only rather than relying on that.
    expect(nearestGougedCrossShape(base, 120, BODY)).not.toBe(base.stations![0]);
  });
});

describe('gougedCrossGuide', () => {
  const R = 2.2667;
  const D = 1.2;
  const ARCH = 15;
  const HALF = 100;
  const sectionFor = (row: { left: { x: number; z: number }[]; right: { x: number; z: number }[] }) =>
    solveGougedCrossSection(ARCH, HALF, R, D, row)!;
  const rowOf = (shape: GougedCrossShape) => ({
    left: gougedCrossKnots(shape, -1),
    right: gougedCrossKnots(shape, 1),
  });

  it('marks one crosshair per side per authored knot', () => {
    const shape: GougedCrossSplineShape = { type: 'gouged', points: [{ x: 0.4, z: 0.57, mirror: true }] };
    expect(gougedCrossGuide(shape, sectionFor(rowOf(shape))).knots.length).toBe(2);
  });

  it('marks the shape it was given, not the wider set of columns the ramp uses', () => {
    // The regression this pins: a resolved row carries the union of every
    // station's knot positions, because that is how shapes with unrelated point
    // lists are ramped. Drawing the guide from that row put two crosshairs on
    // each side for one authored point.
    const cross: GougedCrossParams = {
      type: 'gouged',
      points: [{ x: 0.4, z: 0.57, mirror: true }],
      stations: [{ y: 103, type: 'gouged', points: [{ x: 0.7, z: 0.4, mirror: true }] }],
    };
    const row = makeGougedCrossResolver(cross, 356)(199);
    expect(row.right.length).toBe(2); // the ramp really does carry both columns

    const shape: GougedCrossSplineShape = { type: 'gouged', points: [{ x: 0.4, z: 0.57, mirror: true }] };
    expect(gougedCrossGuide(shape, sectionFor(row)).knots.length).toBe(2);
  });

  it('places a knot against its own side takeoff, and measures its height from there', () => {
    const shape: GougedCrossSplineShape = { type: 'gouged', points: [{ x: 0.4, z: 0.57, mirror: true }] };
    const section = sectionFor(rowOf(shape));
    for (const k of gougedCrossGuide(shape, section).knots) {
      const xEnd = k.x < 0 ? section.xEndLeft : section.xEndRight;
      expect(Math.abs(k.x)).toBeCloseTo(0.4 * xEnd, 9);
      expect((k.z - k.base) / (section.archH - k.base)).toBeCloseTo(0.57, 9);
    }
  });

  it('draws generating circles for a trochoid, which has no control points to mark', () => {
    const shape: GougedCrossCycloidShape = { type: 'gouged-cycloid', d: 0.4, pct: 0.9 };
    const guide = gougedCrossGuide(shape, sectionFor(rowOf(shape)));
    expect(guide.knots).toEqual([]);
    expect(guide.circles.length).toBe(2);
    // radius = hEff / 2d, per side, off that side's own takeoff.
    const section = sectionFor(rowOf(shape));
    const hEff = section.archH - section.zAt(section.xEndRight);
    expect(guide.circles[1].radius).toBeCloseTo(hEff / (2 * 0.4), 6);
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
  const crownSlopes = (s: { zAt: (x: number) => number }, xPeak = 0): [number, number] => {
    const oneSided = (dir: -1 | 1): number => {
      const d = (e: number) => (s.zAt(xPeak + dir * e) - s.zAt(xPeak)) / (dir * e);
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

  // ===== Moved off the joint =====
  // Real plates rarely peak on the centre joint, which is what makes a traced
  // CT section fit badly against a crown pinned there.

  /** `peak` is a fraction of the full width, so 0.5 is the joint. */
  const moved = (peak: number, half = HALF, archH = ARCH) =>
    solveGougedCrossSection(archH, half, R, D, { left: knots, right: knots, peak })!;

  it('puts the crown where it was asked to, at the full arch height', () => {
    const s = moved(0.6);
    expect(s.xPeak).toBeCloseTo(0.2 * HALF, 9); // 60% of the width is 20% of a half
    expect(s.zAt(s.xPeak)).toBeCloseTo(ARCH, 9);
  });

  it('stays a smooth maximum after moving, not a tilted ridge', () => {
    // The property the whole section rests on, and the one a move could break:
    // the crown is flat because it is an *interior* knot between secants of
    // opposite sign, which is where Hyman's filter zeroes the slope. That
    // argument never mentioned x = 0, and this is the check that it didn't
    // quietly depend on it.
    //
    // Bounded more loosely than the centred cases above, because the estimator
    // is not exact: 2·d(ε) − d(2ε) cancels the linear term and leaves −z'''ε²/3,
    // and z''' climbs sharply when the crown sits close to a knot — which is
    // exactly what moving it does to one flank. See the convergence check below
    // for why that residual is the method's and not the geometry's. A real
    // ridge would read about 0.7 here, four orders larger.
    for (const peak of [0.32, 0.42, 0.58, 0.68]) {
      const s = moved(peak);
      for (const slope of crownSlopes(s, s.xPeak)) expect(Math.abs(slope)).toBeLessThan(1e-4);
    }
  });

  it('has a crown slope converging to zero rather than to a tilt', () => {
    // The discriminator between a small numerical residual and a small real
    // slope: halving the step must quarter the first and leave the second alone.
    const s = moved(0.32);
    const residual = (eps: number) => {
      const d = (e: number) => (s.zAt(s.xPeak - e) - s.zAt(s.xPeak)) / -e;
      return Math.abs(2 * d(eps) - d(2 * eps));
    };
    expect(residual(0.01)).toBeLessThan(residual(0.02) / 3);
    expect(residual(0.005)).toBeLessThan(residual(0.01) / 3);
  });

  it('is still the highest point of the section once moved', () => {
    const s = moved(0.35);
    let max = -Infinity;
    let argmax = 0;
    for (let x = -HALF; x <= HALF; x += 0.25) {
      if (s.zAt(x) > max) { max = s.zAt(x); argmax = x; }
    }
    expect(max).toBeCloseTo(ARCH, 6);
    expect(argmax).toBeCloseTo(s.xPeak, 0);
  });

  it('leaves the control points where they were when the crown moves', () => {
    // Positions are measured from the joint, so dialling the ridge across the
    // plate must not drag the shape along with it.
    const centred = moved(0.5);
    const off = moved(0.65);
    for (const side of [-1, 1] as const) {
      for (const frac of [0.45, 0.7]) {
        expect(gougedCrossKnotX(off, side, frac)).toBeCloseTo(gougedCrossKnotX(centred, side, frac), 1);
      }
    }
  });

  it('keeps a knot that ends up on the far side of the crown', () => {
    // Positions being absolute, a knot entered on the treble side can end up on
    // the bass flank of a crown moved out past it. Dropping such a knot would be
    // a step change, and a step is what the tangency solve cannot survive.
    const inner = [{ x: 0.2, z: 0.75 }, { x: 0.6, z: 0.35 }];
    const s = solveGougedCrossSection(ARCH, HALF, R, D, { left: inner, right: inner, peak: 0.65 })!;
    const x = gougedCrossKnotX(s, 1, 0.2);
    expect(x).toBeLessThan(s.xPeak); // the knot really is inside the crown

    // And it is still pinning the curve: the section passes through the height
    // it was given, then climbs on to the crown. Were it dropped the curve would
    // run free from the crown down to the takeoff and sit higher here.
    const base = s.zAt(s.xEndRight);
    expect(s.zAt(x)).toBeCloseTo(base + 0.75 * (ARCH - base), 6);
    expect(s.zAt(x)).toBeLessThan(s.zAt((x + s.xPeak) / 2));
  });

  it('still meets the channel tangentially on both sides', () => {
    const s = moved(0.65);
    for (const side of [s.left!, s.right!]) {
      expect(side).not.toBeNull();
      expect(gougeProfileSlope(side.contactS, R, D)).toBeCloseTo(side.slope, 9);
    }
  });

  it('moves the contact smoothly as the crown travels', () => {
    // The crown is anchored to the centerline chord, which the solve never
    // touches, so sweeping it must not make the contact jump.
    let prev: number | null = null;
    for (let peak = 0.3; peak <= 0.7001; peak += 0.01) {
      const s = moved(peak);
      expect(s.right).not.toBeNull();
      if (prev !== null) expect(Math.abs(s.right!.contactS - prev)).toBeLessThan(0.1 * gougeHalfWidth(R, D));
      prev = s.right!.contactS;
    }
  });

  it('tapers the crown back to the joint where there is no arch to speak of', () => {
    // The cap bands. An offset ridge there is steered by the centerline chord,
    // which swings hardest and samples worst exactly where the plate closes —
    // and the ridge is a curvature feature, so steering it badly folds the
    // surface. Where the long arch has not climbed clear of the channel there is
    // no crown to carry a ridge, so there is nothing to place.
    const full = 0.4 * HALF;
    // No crown at all — the recurve band, where the arch sits below plate level.
    for (const archH of [-0.5, 0]) expect(moved(0.7, HALF, archH).xPeak).toBe(0);
    // And it eases in rather than ramping: a twelfth of the way up the band
    // carries a few percent of the offset, not a twelfth of it.
    expect(Math.abs(moved(0.7, HALF, 0.2).xPeak)).toBeLessThan(0.05 * full);
  });

  it('reaches the position it was asked for once the arch has climbed clear', () => {
    // And leaves it alone thereafter: a real arch is far above the band, so this
    // must not quietly shrink the offset through the bouts.
    for (const archH of [4, 9, 15]) {
      expect(moved(0.7, HALF, archH).xPeak).toBeCloseTo(0.4 * HALF, 9);
    }
  });

  it('eases into the taper without a kink at either end of it', () => {
    // The reason this is a smoothstep and not a clamp. A clamp is C⁰ in slope at
    // both ends of the band, and a kink in the ridge line is exactly the fold
    // the taper exists to remove — it would only move it inward. Second
    // differences of a C¹ path shrink like h²; across a kink they shrink like h.
    const xPeakAt = (archH: number) => moved(0.7, HALF, archH).xPeak;
    const worstCurvature = (h: number) => {
      let worst = 0;
      for (let a = -0.5; a <= 3.5; a += h) {
        worst = Math.max(worst, Math.abs(xPeakAt(a - h) - 2 * xPeakAt(a) + xPeakAt(a + h)));
      }
      return worst;
    };
    expect(worstCurvature(0.02)).toBeLessThan(worstCurvature(0.04) / 3);
  });

  it('clamps the crown clear of the channel at a narrow station', () => {
    // The same percent is a far larger share of a narrow station. Left
    // unclamped the crown would reach the channel and collapse an interval of
    // the profile spline to zero width.
    const narrow = 3;
    const s = moved(0.7, narrow);
    expect(Math.abs(s.xPeak)).toBeLessThan(narrow - gougeHalfWidth(R, D));
    expect(Number.isFinite(s.zAt(0))).toBe(true);
  });

  it('is unchanged from the centred solve when the crown is not moved', () => {
    // Old templates carry no peak at all, and must render exactly as before.
    const before = solveGougedCrossSection(ARCH, HALF, R, D, { left: knots, right: knots })!;
    const after = moved(0.5);
    for (let x = -HALF; x <= HALF; x += 1) expect(after.zAt(x)).toBeCloseTo(before.zAt(x), 12);
  });

  // ===== The ridge crease =====
  // A monotone spline pins the crown's slope by clamping it, and a clamped
  // slope is a knot where the second derivative steps. Invisible on a graph; on
  // a rendered surface it is a line down the ridge, because specular shading
  // reads curvature. Symmetric data hides it — both flanks step by the same
  // amount — which is why it only appeared once the crown could move.

  const one = [{ x: 0.7, z: 0.4 }];
  const withOneKnot = (peak: number, archH = ARCH) =>
    solveGougedCrossSection(archH, HALF, R, D, { left: one, right: one, peak })!;

  /** One-sided curvatures at the crown, each measured wholly on its own flank. */
  const crownCurvatures = (s: GougedCrossSection, h = 0.02): [number, number] => {
    const side = (dir: 1 | -1) =>
      (s.zAt(s.xPeak + dir * h) - 2 * s.zAt(s.xPeak + dir * 2 * h) + s.zAt(s.xPeak + dir * 3 * h)) / (h * h);
    return [side(-1), side(1)];
  };

  it('joins the two flanks with matching curvature at a moved crown', () => {
    for (const peak of [0.44, 0.46, 0.48]) {
      const [l, r] = crownCurvatures(withOneKnot(peak));
      expect(Math.abs(l - r) / Math.abs(r)).toBeLessThan(0.02);
    }
  });

  it('still matches when the crown is centred', () => {
    // Exactly equal in principle — symmetric data, mirror-image flanks — so the
    // bound is set by the finite difference reading it, not by the geometry.
    const [l, r] = crownCurvatures(withOneKnot(0.5));
    expect(Math.abs(l - r) / Math.abs(r)).toBeLessThan(1e-6);
  });

  it('keeps the crown exact whichever spline it settles on', () => {
    // The smooth curve gives up the no-overshoot guarantee, so a template it
    // cannot handle falls back. Either way the arch height must still describe
    // the plate: the crown sits where asked, at the height asked, and nothing
    // rises above it.
    const templates = [
      one,
      [{ x: 0.45, z: 0.62 }, { x: 0.75, z: 0.26 }],
      [{ x: 0.3, z: 0.85 }, { x: 0.6, z: 0.5 }, { x: 0.85, z: 0.15 }],
      [{ x: 0.2, z: 0.95 }, { x: 0.9, z: 0.05 }],
    ];
    for (const pts of templates) {
      for (const peak of [0.3, 0.35, 0.42, 0.46, 0.5, 0.58, 0.7]) {
        const s = solveGougedCrossSection(ARCH, HALF, R, D, { left: pts, right: pts, peak })!;
        expect(s).not.toBeNull();
        expect(s.zAt(s.xPeak)).toBeCloseTo(ARCH, 9);
        let max = -Infinity;
        let lowest = Infinity;
        for (let x = -s.xEndLeft; x <= s.xEndRight; x += 0.25) {
          max = Math.max(max, s.zAt(x));
          lowest = Math.min(lowest, s.zAt(x));
        }
        expect(max).toBeLessThanOrEqual(ARCH + 1e-6);
        // And it never dives through the channel it is supposed to meet.
        expect(lowest).toBeGreaterThan(-D - 1e-6);
      }
    }
  });
});

describe('chord trust', () => {
  /**
   * The invariant the whole cap fix rests on. The height field reads transverse
   * position by blending distance against chord, weighted by `chordTrust`; while
   * distance carries any weight the field cannot tell one side of the joint from
   * the other and picks a flank by the sign of x. That is only harmless when the
   * two flanks agree — so the crown may not leave the joint until the blend has
   * finished, not merely in proportion to it.
   */
  it('never lets the crown off the joint while the surface still leans on distance', () => {
    for (let f = 0; f <= 1.2; f += 0.005) {
      if (crownOffsetTrust(f) > 0) expect(chordTrust(f)).toBe(1);
    }
  });

  it('leaves the crown fully free where the chord is the whole story', () => {
    expect(crownOffsetTrust(1)).toBe(1);
    expect(chordTrust(1)).toBe(1);
  });

  it('centres the crown where the caps close in from three sides', () => {
    // The ratio falls toward the caps: the nearest channel is ahead, not beside.
    expect(crownOffsetTrust(0.3)).toBe(0);
    expect(crownOffsetTrust(0.45)).toBe(0);
  });

  it('eases rather than switches, so neither reads as a crease along the body', () => {
    for (const f of [chordTrust, crownOffsetTrust]) {
      let prev: number | null = null;
      let prevSlope: number | null = null;
      for (let v = 0; v <= 1; v += 0.01) {
        const z = f(v);
        if (prev !== null) {
          const slope = (z - prev) / 0.01;
          if (prevSlope !== null) expect(Math.abs(slope - prevSlope)).toBeLessThan(1.5);
          prevSlope = slope;
        }
        prev = z;
      }
    }
  });
});

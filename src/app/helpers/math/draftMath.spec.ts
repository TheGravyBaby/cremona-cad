import { arcBetweenTravels, arcContinuingFrom, fitArcFromEndsAndCenter, fitArcThroughPoints, interceptCirclesAndPoint } from './draftMath';
import { angleFromCenter, angleWithinSweep, normalizeRadians, pointOnCircle, travelAtArcEnd } from './simpleGeometry';
import { Circle } from '../../models/types';

describe('arcBetweenTravels', () => {
  const deg = (d: number) => d * Math.PI / 180;
  const A = { x: 3, y: -7 };
  const travel = deg(25);

  it('recovers the run and the radius a chain was built from', () => {
    for (const [run, radius, sweep] of [[12, 40, deg(35)], [0, 25, deg(-80)], [50, 8, deg(150)]]) {
      const start = { x: A.x + run * Math.cos(travel), y: A.y + run * Math.sin(travel) };
      const built = arcContinuingFrom(start, travel, radius, sweep);

      const solved = arcBetweenTravels(A, travel, pointOnCircle(built, built.end), travelAtArcEnd(built));
      expect(solved).not.toBeNull();
      expect(solved!.run).toBeCloseTo(run, 9);
      expect(solved!.arc.r).toBeCloseTo(radius, 9);
      expect(solved!.arc.x).toBeCloseTo(built.x, 9);
      expect(solved!.arc.y).toBeCloseTo(built.y, 9);
    }
  });

  it('refuses a target the ray has already passed', () => {
    expect(arcBetweenTravels({ x: 0, y: 0 }, 0, { x: -50, y: 5 }, deg(20))).toBeNull();
  });

  // target lies right of the ray, so turning left onto it takes the major arc
  it('refuses a turn Arc cannot name', () => {
    expect(arcBetweenTravels({ x: 0, y: 0 }, 0, { x: 10, y: -30 }, deg(100))).toBeNull();
  });

  it('refuses parallel directions, which no finite radius bridges', () => {
    expect(arcBetweenTravels({ x: 0, y: 0 }, 0, { x: 40, y: 12 }, 0)).toBeNull();
  });
});

describe('interceptCirclesAndPoint', () => {
  /**
   * An unfittable corner has to come back as "no solutions", not as a pair of NaN centres.
   * Nothing downstream tests for NaN — it survives arc construction, angle math and path building,
   * and first surfaces as the browser refusing an SVG attribute, long after the render pass that
   * could have reported it. Empty is what the caller already knows how to fail on.
   */
  it('returns both centres when a circle of that radius can be fitted', () => {
    const solutions = interceptCirclesAndPoint(new Circle(0, 0, 100), { x: 130, y: 0 }, 20);
    expect(solutions).toHaveLength(2);
    for (const c of solutions) {
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.y)).toBe(true);
    }
  });

  it('returns no solutions when the point is out of reach of that radius', () => {
    // P sits far outside L, so no circle of radius 5 is both tangent to L and through P
    expect(interceptCirclesAndPoint(new Circle(0, 0, 100), { x: 400, y: 0 }, 5)).toEqual([]);
  });

  it('returns no solutions rather than dividing by zero when the point is on L centre', () => {
    expect(interceptCirclesAndPoint(new Circle(0, 0, 100), { x: 0, y: 0 }, 20)).toEqual([]);
  });
});

/** CCW sweep of a fit's boundary angles, the arcPathData convention both fits below return in. */
function span(fit: { startAngle: number; endAngle: number }): number {
  return normalizeRadians(fit.endAngle - fit.startAngle);
}

describe('fitArcThroughPoints', () => {
  it('returns the circle through all three points, swept so it contains the through point', () => {
    const through = { x: 0, y: 10 };
    const fit = fitArcThroughPoints({ x: -10, y: 0 }, { x: 10, y: 0 }, through)!;
    expect(fit.center.x).toBeCloseTo(0, 9);
    expect(fit.center.y).toBeCloseTo(0, 9);
    expect(fit.radius).toBeCloseTo(10, 9);
    // which of the two arcs came back is the whole contract — a circle through three points is
    // unique, but the sweep between two of them is not
    expect(angleWithinSweep(angleFromCenter(fit.center, through), fit.startAngle, fit.endAngle)).toBe(true);
    expect(span(fit)).toBeCloseTo(Math.PI, 9);
  });

  it('sweeps past 180° when the through point sits on the far side of the chord', () => {
    const start = pointOnCircle({ x: 0, y: 0, r: 10 }, 0);
    const end = pointOnCircle({ x: 0, y: 0, r: 10 }, Math.PI / 2);
    const through = pointOnCircle({ x: 0, y: 0, r: 10 }, (200 * Math.PI) / 180);
    const fit = fitArcThroughPoints(start, end, through)!;
    expect(span(fit)).toBeCloseTo((270 * Math.PI) / 180, 9);
    expect(angleWithinSweep(angleFromCenter(fit.center, through), fit.startAngle, fit.endAngle)).toBe(true);
  });

  it('gives the complementary arc — same circle, the part without the through point', () => {
    const through = { x: 0, y: 10 };
    const other = fitArcThroughPoints({ x: -10, y: 0 }, { x: 10, y: 0 }, through, true)!;
    expect(other.radius).toBeCloseTo(10, 9);
    expect(angleWithinSweep(angleFromCenter(other.center, through), other.startAngle, other.endAngle)).toBe(false);
  });

  it('still fits an arc flat enough to look like a line at drafting scale', () => {
    // The collinearity guard is relative to the points' own spread for exactly this: a violin's
    // long arch is a 200mm chord over a fraction of a millimetre of rise, and an absolute epsilon
    // would refuse it while accepting rounding noise on a small drawing.
    const fit = fitArcThroughPoints({ x: -100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0.5 })!;
    expect(fit).not.toBeNull();
    expect(fit.radius).toBeCloseTo(10000.25, 6);
  });

  it('returns null when there is no circle to find', () => {
    expect(fitArcThroughPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 0 })).toBeNull(); // collinear
    expect(fitArcThroughPoints({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull(); // coincident
  });
});

describe('fitArcFromEndsAndCenter', () => {
  it('projects the clicked center onto the bisector of the two ends', () => {
    // (7, -20) is nowhere near equidistant from the ends; only its distance along the bisector
    // can matter, so it lands at (0, -20) rather than being rejected
    const fit = fitArcFromEndsAndCenter({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 7, y: -20 })!;
    expect(fit.center.x).toBeCloseTo(0, 9);
    expect(fit.center.y).toBeCloseTo(-20, 9);
    expect(fit.radius).toBeCloseTo(Math.sqrt(500), 9);
  });

  it('bulges away from the center, and takes the major arc under preferLong', () => {
    const minor = fitArcFromEndsAndCenter({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -20 })!;
    expect(span(minor)).toBeLessThanOrEqual(Math.PI);
    const mid = pointOnCircle({ ...minor.center, r: minor.radius }, minor.startAngle + span(minor) / 2);
    expect(mid.y).toBeGreaterThan(0);

    const major = fitArcFromEndsAndCenter({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -20 }, true)!;
    expect(span(major)).toBeGreaterThan(Math.PI);
    expect(major.center.y).toBeCloseTo(-20, 9);
  });

  it('makes a semicircle when the center lands on the chord itself', () => {
    const fit = fitArcFromEndsAndCenter({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 3, y: 0 })!;
    expect(fit.center.x).toBeCloseTo(0, 9);
    expect(fit.center.y).toBeCloseTo(0, 9);
    expect(fit.radius).toBeCloseTo(10, 9);
    expect(span(fit)).toBeCloseTo(Math.PI, 9);
  });

  it('returns null when the two ends coincide, leaving no bisector', () => {
    expect(fitArcFromEndsAndCenter({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 0, y: 0 })).toBeNull();
  });
});

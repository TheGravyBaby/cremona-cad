import { archSplineKnots, splineZAt } from './svgPathMath';

describe('splineZAt shape preservation', () => {
  const span = 356;
  const hEff = 15;

  const sample = (points: { t: number; z: number; mirror?: boolean }[], peak = 0.5, n = 400) =>
    Array.from({ length: n + 1 }, (_, i) => splineZAt(hEff, span, points, peak, (i / n) * span));

  it('holds a flat run between a control point and the peak at the same height', () => {
    // The reported bug: a 15 mm point on a 15 mm arch used to ripple up to ~15.8
    // just past the point and sag back to 15 at the centre.
    const points = [{ t: 0.265, z: hEff, mirror: true }];
    expect(Math.max(...sample(points))).toBeCloseTo(hEff, 6);
    for (let s = 0.265 * span; s <= span / 2; s += span / 200) {
      expect(splineZAt(hEff, span, points, 0.5, s)).toBeCloseTo(hEff, 6);
    }
  });

  it('holds a flat run between two control points at the same height', () => {
    const points = [{ t: 0.2, z: 12 }, { t: 0.35, z: 12 }];
    for (let s = 0.2 * span; s <= 0.35 * span; s += span / 200) {
      expect(splineZAt(hEff, span, points, 0.5, s)).toBeCloseTo(12, 6);
    }
  });

  it('never overshoots the control heights it interpolates', () => {
    for (const points of [
      [{ t: 0.25, z: 6.75, mirror: true }],
      [{ t: 0.15, z: 10 }, { t: 0.3, z: 8 }],
      [{ t: 0.12, z: 4, mirror: true }, { t: 0.4, z: 14 }],
    ]) {
      const zs = sample(points);
      const hi = Math.max(hEff, ...points.map(p => p.z));
      expect(Math.max(...zs)).toBeLessThanOrEqual(hi + 1e-9);
      expect(Math.min(...zs)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('mirrors flagged points about the plate mid-length, not the peak', () => {
    const points = [{ t: 0.3, z: 10, mirror: true }];
    // Peak pulled off centre; the mirrored twin stays put at 0.7.
    for (const peak of [0.5, 0.62]) {
      expect(splineZAt(hEff, span, points, peak, 0.3 * span)).toBeCloseTo(10, 6);
      expect(splineZAt(hEff, span, points, peak, 0.7 * span)).toBeCloseTo(10, 6);
      expect(splineZAt(hEff, span, points, peak, peak * span)).toBeCloseTo(hEff, 6);
    }
  });

  it('leaves an unmirrored point acting on one end only', () => {
    const points = [{ t: 0.25, z: 5 }];
    expect(splineZAt(hEff, span, points, 0.5, 0.25 * span)).toBeCloseTo(5, 6);
    // The far end is unconstrained, so it runs well above the 5 mm near end.
    expect(splineZAt(hEff, span, points, 0.5, 0.75 * span)).toBeGreaterThan(9);
  });

  it('drops control points that collide with the peak or the plate edges', () => {
    const knots = archSplineKnots(hEff, [{ t: 0.5, z: 3 }, { t: 0, z: 9 }, { t: 1, z: 9 }], 0.5);
    expect(knots.map(k => k.z)).toEqual([9, hEff, 9]); // the 3 mm point loses to the peak
    for (const k of knots) {
      expect(k.t).toBeGreaterThan(0);
      expect(k.t).toBeLessThan(1);
    }
  });

  it('stays finite with no control points at all', () => {
    for (let i = 1; i < 20; i++) {
      expect(Number.isFinite(splineZAt(hEff, span, [], 0.5, (i / 20) * span))).toBe(true);
    }
  });
});

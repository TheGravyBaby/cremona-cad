import { splineZAt } from './svgPathMath';

describe('splineZAt shape preservation', () => {
  const span = 356;
  const hEff = 15;

  const sample = (points: { t: number; z: number }[], n = 400) =>
    Array.from({ length: n + 1 }, (_, i) => splineZAt(hEff, span, points, (i / n) * span));

  it('holds a flat run between a control point and the peak at the same height', () => {
    // The reported bug: a 15 mm point on a 15 mm arch used to ripple up to ~15.8
    // just past the point and sag back to 15 at the centre.
    const zs = sample([{ t: 0.53, z: hEff }]);
    expect(Math.max(...zs)).toBeCloseTo(hEff, 6);
    // Everything from the control point inward sits on the flat.
    for (let s = 0.53 * span / 2; s <= span / 2; s += span / 200) {
      expect(splineZAt(hEff, span, [{ t: 0.53, z: hEff }], s)).toBeCloseTo(hEff, 6);
    }
  });

  it('holds a flat run between two control points at the same height', () => {
    const points = [{ t: 0.4, z: 12 }, { t: 0.7, z: 12 }];
    for (let s = 0.4 * span / 2; s <= 0.7 * span / 2; s += span / 200) {
      expect(splineZAt(hEff, span, points, s)).toBeCloseTo(12, 6);
    }
  });

  it('never overshoots the control heights it interpolates', () => {
    for (const points of [
      [{ t: 0.5, z: 6.75 }],
      [{ t: 0.3, z: 10 }, { t: 0.6, z: 8 }],
      [{ t: 0.25, z: 4 }, { t: 0.5, z: 13 }, { t: 0.8, z: 14 }],
    ]) {
      const zs = sample(points);
      const hi = Math.max(hEff, ...points.map(p => p.z));
      expect(Math.max(...zs)).toBeLessThanOrEqual(hi + 1e-9);
      expect(Math.min(...zs)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('passes through its control points and the peak, symmetrically', () => {
    const points = [{ t: 0.3, z: 10 }, { t: 0.6, z: 8 }];
    for (const p of points) {
      expect(splineZAt(hEff, span, points, p.t * span / 2)).toBeCloseTo(p.z, 6);
      expect(splineZAt(hEff, span, points, span - p.t * span / 2)).toBeCloseTo(p.z, 6);
    }
    expect(splineZAt(hEff, span, points, span / 2)).toBeCloseTo(hEff, 6);
    for (const s of [10, 60, 120, 170]) {
      expect(splineZAt(hEff, span, points, s)).toBeCloseTo(splineZAt(hEff, span, points, span - s), 6);
    }
  });

  it('stays finite for degenerate control points on the peak or doubled up', () => {
    for (const points of [[{ t: 1, z: hEff }], [{ t: 0, z: 0 }], [{ t: 0.5, z: 9 }, { t: 0.5, z: 9 }]]) {
      for (let i = 1; i < 20; i++) {
        expect(Number.isFinite(splineZAt(hEff, span, points, (i / 20) * span))).toBe(true);
      }
    }
  });
});

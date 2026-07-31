import {
  buildPolylineIndex, distPointToPolyline, distPointToPolylineIndexed, makeC2SplineWithFlatKnot,
  makeMonotoneSpline,
} from './draftMath';

describe('makeMonotoneSpline', () => {
  /**
   * Size of the second-derivative jump across the knot at `y`, where `gapL`/`gapR`
   * are the widths of the segments meeting there.
   *
   * A straight second difference across `y` would mostly measure d²'s drift
   * *within* each segment, so instead each side is extrapolated to the knot:
   * within a segment the spline is a cubic, so d² is exactly linear and a
   * two-point extrapolation is exact. Both stencils stay well inside their own
   * segment, and a central second difference is likewise exact for a cubic.
   */
  const curvatureJumpAt = (f: (y: number) => number, y: number, gapL: number, gapR: number): number => {
    const d2 = (at: number, e: number): number => (f(at - e) - 2 * f(at) + f(at + e)) / (e * e);
    const limitFrom = (gap: number, dir: -1 | 1): number => {
      const near = d2(y + dir * 0.2 * gap, 0.05 * gap);
      const far  = d2(y + dir * 0.4 * gap, 0.05 * gap);
      return 2 * near - far;
    };
    return Math.abs(limitFrom(gapR, 1) - limitFrom(gapL, -1));
  };

  const sampleMax = (f: (y: number) => number, lo: number, hi: number): number => {
    let max = -Infinity;
    for (let i = 0; i <= 4000; i++) max = Math.max(max, f(lo + (hi - lo) * i / 4000));
    return max;
  };
  const sampleMin = (f: (y: number) => number, lo: number, hi: number): number => {
    let min = Infinity;
    for (let i = 0; i <= 4000; i++) min = Math.min(min, f(lo + (hi - lo) * i / 4000));
    return min;
  };

  // The reason this interpolant is a filtered natural spline rather than plain
  // PCHIP: a domed cross-arch profile has to come out curvature-continuous, or
  // it reads as a string of little bumps no control-point nudging can remove.
  it('is curvature-continuous through a domed profile the limiter never touches', () => {
    const ys = [0, 0.12, 0.28, 0.40, 0.50, 0.60, 0.72, 0.88, 1];
    const zs = [0, 0.45, 0.86, 0.98, 1.00, 0.98, 0.86, 0.45, 0];
    const f = makeMonotoneSpline(ys, zs);

    for (let i = 1; i < ys.length - 1; i++) {
      expect(curvatureJumpAt(f, ys[i], ys[i] - ys[i - 1], ys[i + 1] - ys[i])).toBeLessThan(1e-6);
    }
  });

  it('holds a run of equal values genuinely flat after a steep rise', () => {
    // The long-arch case that motivated filtering in the first place: a 15mm
    // peak with control points also at 15mm must give a flat, not a ripple.
    const ys = [0, 106.8, 178, 249.2, 356];
    const f = makeMonotoneSpline(ys, [0, 15, 15, 15, 0]);

    expect(sampleMax(f, 0, 356)).toBeCloseTo(15, 9);
    for (let y = 106.8; y <= 249.2; y += 2) expect(f(y)).toBeCloseTo(15, 9);
  });

  it('never overshoots the data, including where a natural spline would ring', () => {
    const cases: [number[], number[]][] = [
      [[0, 10, 20, 60, 100], [0, 14, 15, 15, 0]],       // steep rise into a flat
      [[0, 1, 2, 3, 4, 5], [0, 0, 0, 1, 1, 1]],         // monotone staircase
      [[0, 0.05, 0.08, 0.5, 1], [0, 0.9, 1, 0.6, 0]],   // peak jammed near an edge
      [[0, 0.30, 0.32, 0.5, 1], [0, 0.4, 0.95, 1, 0]],  // near-coincident knots
    ];
    for (const [ys, zs] of cases) {
      const f = makeMonotoneSpline(ys, zs);
      const lo = ys[0], hi = ys[ys.length - 1];
      expect(sampleMax(f, lo, hi)).toBeLessThanOrEqual(Math.max(...zs) + 1e-9);
      expect(sampleMin(f, lo, hi)).toBeGreaterThanOrEqual(Math.min(...zs) - 1e-9);
    }
  });

  it('interpolates its knots exactly', () => {
    const ys = [0, 0.2, 0.5, 0.8, 1];
    const zs = [0, 0.85, 1, 0.85, 0];
    const f = makeMonotoneSpline(ys, zs);
    ys.forEach((y, i) => expect(f(y)).toBeCloseTo(zs[i], 9));
  });

  // Cross-arch control points store z as a fraction of a per-station hEff, so
  // splineZAt(1, 1, ...) * hEff has to equal a direct evaluation at that hEff.
  it('is homogeneous of degree 1 in its values', () => {
    const ys = [0, 0.12, 0.4, 0.5, 0.75, 1];
    const zs = [0, 0.45, 0.98, 1, 0.7, 0];
    const unit = makeMonotoneSpline(ys, zs);
    const scaled = makeMonotoneSpline(ys, zs.map(z => z * 17.5));
    for (let i = 0; i <= 200; i++) {
      const y = i / 200;
      expect(scaled(y)).toBeCloseTo(unit(y) * 17.5, 9);
    }
  });
});

describe('distPointToPolylineIndexed', () => {
  it('matches the brute-force distance for varied loops, cell sizes, and query points', () => {
    // Deterministic LCG so any failure reproduces.
    let seed = 42;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

    for (let trial = 0; trial < 5; trial++) {
      // Lobed closed loop, roughly violin-outline sized (mm).
      const n = 50 + Math.floor(rand() * 400);
      const poly = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * 2 * Math.PI;
        const r = 50 + 30 * Math.sin(3 * a) + rand() * 5;
        return { x: 100 + r * Math.cos(a), y: 180 + 1.8 * r * Math.sin(a) };
      });

      for (const cellSize of [2, 6, 25]) {
        const idx = buildPolylineIndex(poly, cellSize);
        for (let q = 0; q < 200; q++) {
          // Spans interior, exterior, and points outside the index grid entirely.
          const pt = { x: rand() * 500 - 150, y: rand() * 700 - 170 };
          expect(distPointToPolylineIndexed(pt, idx)).toBeCloseTo(distPointToPolyline(pt, poly), 9);
        }
      }
    }
  });

  it('returns Infinity for an empty polyline, matching the brute force', () => {
    expect(distPointToPolylineIndexed({ x: 3, y: 4 }, buildPolylineIndex([]))).toBe(Infinity);
  });
});

describe('makeC2SplineWithFlatKnot', () => {
  /** One-sided second derivatives at `x`, each measured wholly on its own side. */
  const curvatures = (f: (x: number) => number, x: number, h = 1e-3): [number, number] => {
    const side = (dir: 1 | -1) =>
      (f(x + dir * h) - 2 * f(x + dir * 2 * h) + f(x + dir * 3 * h)) / (h * h);
    return [side(-1), side(1)];
  };

  const xs = [-100, -60, -10, 55, 100];
  const zs = [0, 9, 15, 9, 0];

  it('is curvature-continuous at the pinned knot, where a monotone spline is not', () => {
    // The whole reason this exists. Both curves have a flat maximum at the same
    // place; only one joins its two flanks without a curvature step, and on a
    // rendered surface that step is a crease along the knot.
    const smooth = makeC2SplineWithFlatKnot(xs, zs, 2)!;
    const [sl, sr] = curvatures(smooth, -10);
    expect(Math.abs(sl - sr) / Math.abs(sr)).toBeLessThan(0.01);

    const [ml, mr] = curvatures(makeMonotoneSpline(xs, zs), -10);
    expect(Math.abs(ml - mr) / Math.abs(mr)).toBeGreaterThan(0.2);
  });

  it('puts a genuine flat maximum at the pinned knot', () => {
    const f = makeC2SplineWithFlatKnot(xs, zs, 2)!;
    expect(f(-10)).toBeCloseTo(15, 9);
    const slope = (f(-10 + 1e-4) - f(-10 - 1e-4)) / 2e-4;
    expect(Math.abs(slope)).toBeLessThan(1e-6);
    for (let x = -100; x <= 100; x += 0.25) expect(f(x)).toBeLessThanOrEqual(15 + 1e-9);
  });

  it('is C2 at every other knot too, not just the pinned one', () => {
    const f = makeC2SplineWithFlatKnot(xs, zs, 2)!;
    for (const x of [-60, 55]) {
      const [l, r] = curvatures(f, x);
      expect(Math.abs(l - r) / Math.max(Math.abs(l), Math.abs(r))).toBeLessThan(0.01);
    }
  });

  it('keeps symmetric data symmetric', () => {
    // Made by averaging the two ways of freeing up an end condition. Picking one
    // would tilt a problem that has no reason to be tilted.
    const sym = makeC2SplineWithFlatKnot([-100, -50, 0, 50, 100], [0, 9, 15, 9, 0], 2)!;
    for (const x of [7, 23, 61, 94]) expect(sym(x)).toBeCloseTo(sym(-x), 9);
  });

  it('returns null when there is nothing to constrain', () => {
    expect(makeC2SplineWithFlatKnot([0, 1], [0, 1], 0)).toBeNull();
    expect(makeC2SplineWithFlatKnot([0, 1, 2], [0, 1, 0], 0)).toBeNull(); // pinned at an end
    expect(makeC2SplineWithFlatKnot([0, 1, 2], [0, 1, 0], 2)).toBeNull();
  });
});
